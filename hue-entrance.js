import { auth, currentUser, GUEST_MODE } from './haupteingang.js';

const STATUS_ENDPOINT = '/api/status';
const CONNECT_ENDPOINT = '/api/connect';
const COMMAND_ENDPOINT = '/api/command';
const DEFAULT_FUNCTIONS_API_BASE = 'https://europe-west1-top2-e9ac0.cloudfunctions.net/hueApi';
const HUE_PRESET_COLORS = [
  { label: 'Warmweiß', value: '#F4E7C2' },
  { label: 'Kaltweiß', value: '#F5FAFF' },
  { label: 'Gelb', value: '#FACC15' },
  { label: 'Orange', value: '#FB923C' },
  { label: 'Pink', value: '#EC4899' },
  { label: 'Blau', value: '#3B82F6' },
  { label: 'Grün', value: '#22C55E' },
  { label: 'Lila', value: '#A855F7' },
];

const state = {
  listenersBound: false,
  loading: false,
  connectLoading: false,
  status: null,
  error: '',
  activeLightId: '',
  postActionRefreshTimer: null,
  pendingLightIds: new Set(),
  viewObserverBound: false,
};

let helperAlertUser = null;

function hasHueControlPermission() {
  if (!currentUser.mode || currentUser.mode === GUEST_MODE) return false;
  if (currentUser.role === 'SYSTEMADMIN') return true;
  return Array.isArray(currentUser.permissions) && currentUser.permissions.includes('ENTRANCE_HUE_CONTROL');
}

function hasHueViewPermission() {
  if (!currentUser.mode || currentUser.mode === GUEST_MODE) return false;
  if (currentUser.role === 'SYSTEMADMIN') return true;
  return Array.isArray(currentUser.permissions) && currentUser.permissions.includes('ENTRANCE_HUE');
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}

function normalizeOrigin(value = '') {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized === 'null' ? '' : normalized;
}

function buildApiUrl(base, endpointPath) {
  const normalizedBase = normalizeOrigin(base);
  if (!normalizedBase) return '';
  if (normalizedBase.endsWith('/hueApi')) {
    return `${normalizedBase}${String(endpointPath || '').replace(/^\/api/, '')}`;
  }
  return `${normalizedBase}${endpointPath}`;
}

function getApiUrlCandidates(endpointPath) {
  const configuredOrigin = normalizeOrigin(window.TOP2_API_ORIGIN);
  const currentOrigin = window.location.protocol === 'file:' ? '' : normalizeOrigin(window.location.origin);
  const allowCurrentOriginFallback = Boolean(currentOrigin) && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname || '');
  const candidates = [];

  if (configuredOrigin) {
    candidates.push(buildApiUrl(configuredOrigin, endpointPath));
  }

  candidates.push(buildApiUrl(DEFAULT_FUNCTIONS_API_BASE, endpointPath));

  if (allowCurrentOriginFallback) {
    candidates.push(buildApiUrl(currentOrigin, endpointPath));
  }

  return [...new Set(candidates.filter(Boolean))];
}

function isHtmlLikeResponse(value = '') {
  return typeof value === 'string' && /<!doctype html|<html|the page could not be found/i.test(value);
}

function extractErrorMessage(value, fallback = 'Unbekannter Fehler') {
  if (!value) return fallback;

  if (value instanceof Error) {
    return value.message || fallback;
  }

  if (typeof value === 'string') {
    return value.trim() || fallback;
  }

  if (Array.isArray(value)) {
    const combined = value
      .map((entry) => extractErrorMessage(entry, ''))
      .filter(Boolean)
      .join(' | ');
    return combined || fallback;
  }

  if (typeof value === 'object') {
    if (typeof value.error === 'string') return value.error;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.detail === 'string') return value.detail;
    if (typeof value.title === 'string') return value.title;
    if (Array.isArray(value.errors) && value.errors.length) {
      return extractErrorMessage(value.errors, fallback);
    }
    try {
      return JSON.stringify(value);
    } catch (error) {
      return fallback;
    }
  }

  return String(value);
}

function alertUser(message, type = 'info') {
  if (typeof helperAlertUser === 'function') {
    helperAlertUser(message, type);
    return;
  }
  window.alert(message);
}

function getElements() {
  return {
    section: document.getElementById('hueEntranceSection'),
    toggleButton: document.getElementById('hueEntranceToggle'),
    loading: document.getElementById('hueEntranceLoading'),
    error: document.getElementById('hueEntranceError'),
    bridgeBadge: document.getElementById('hueEntranceBridgeBadge'),
    summaryGrid: document.getElementById('hueEntranceSummaryGrid'),
    details: document.getElementById('hueEntranceDetails'),
    connectButton: document.getElementById('hueConnectButton'),
    refreshButton: document.getElementById('hueRefreshButton'),
    deviceGrid: document.getElementById('hueEntranceDeviceGrid'),
  };
}

function setButtonBusy(button, isBusy, busyText, idleText) {
  if (!button) return;
  button.disabled = isBusy;
  button.dataset.busy = isBusy ? 'true' : 'false';
  const label = button.querySelector('[data-button-label]');
  if (label) {
    label.textContent = isBusy ? busyText : idleText;
  } else {
    button.textContent = isBusy ? busyText : idleText;
  }
}

async function getFirebaseIdToken() {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser) {
    throw new Error('Bitte melde dich zuerst in der TOP2-App an.');
  }
  return firebaseUser.getIdToken();
}

async function requestApi(endpointPath, options = {}) {
  const idToken = await getFirebaseIdToken();
  const candidates = getApiUrlCandidates(endpointPath);
  let lastError = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${idToken}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const responseText = await response.text();
      let payload = null;
      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch (error) {
        payload = responseText || null;
      }

      if (!response.ok) {
        if (isHtmlLikeResponse(payload)) {
          lastError = new Error('Hue-Backend ist unter dieser Adresse nicht erreichbar.');
          continue;
        }
        throw new Error(extractErrorMessage(payload, `HTTP ${response.status}`));
      }

      if (isHtmlLikeResponse(payload)) {
        lastError = new Error('Hue-Backend lieferte HTML statt JSON.');
        continue;
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(extractErrorMessage(error));
    }
  }

  throw lastError || new Error('Hue-Backend ist derzeit nicht erreichbar.');
}

function formatTimestamp(isoString) {
  if (!isoString) return 'Noch keine Daten';
  try {
    return new Intl.DateTimeFormat('de-AT', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Europe/Vienna',
    }).format(new Date(isoString));
  } catch (error) {
    return isoString;
  }
}

function isHueViewVisible() {
  const { section } = getElements();
  if (!section) return false;
  if (!hasHueViewPermission()) return false;

  const view = section.closest('.view') || section;
  if (!(view instanceof Element)) return false;

  const sectionStyle = window.getComputedStyle(section);
  const computedStyle = window.getComputedStyle(view);
  return computedStyle.display !== 'none'
    && computedStyle.visibility !== 'hidden'
    && sectionStyle.display !== 'none'
    && sectionStyle.visibility !== 'hidden';
}

function scheduleStatusRefresh(delayMs = 5000) {
  if (state.postActionRefreshTimer) {
    window.clearTimeout(state.postActionRefreshTimer);
  }

  state.postActionRefreshTimer = window.setTimeout(() => {
    state.postActionRefreshTimer = null;
    if (!isHueViewVisible()) return;
    fetchStatus(false).catch(() => {});
  }, delayMs);
}

function getHueLedClass(device) {
  if (!device?.controllable) {
    return 'gardena-led gardena-led--slate';
  }
  return device.on
    ? 'gardena-led gardena-led--green gardena-led--blink'
    : 'gardena-led gardena-led--red';
}

function getSortedDevices(devices = []) {
  return [...devices].sort((left, right) => {
    const leftOn = left?.on ? 1 : 0;
    const rightOn = right?.on ? 1 : 0;
    if (leftOn !== rightOn) {
      return rightOn - leftOn;
    }
    return String(left?.name || '').localeCompare(String(right?.name || ''), 'de', { sensitivity: 'base' });
  });
}

function applyLocalDevicePatch(lightId, patch = {}) {
  if (!state.status || !Array.isArray(state.status.devices)) return;
  state.status.devices = state.status.devices.map((device) => {
    if (String(device?.lightId || '') !== String(lightId || '')) {
      return device;
    }
    return { ...device, ...patch };
  });
  state.status.controllableDevices = state.status.devices.filter((device) => device?.controllable);
}

function getSelectedDevice(devices = []) {
  return devices.find((device) => String(device?.lightId || '') === String(state.activeLightId || '')) || null;
}

function syncSelectedDevice(devices = []) {
  if (!devices.some((device) => String(device?.lightId || '') === String(state.activeLightId || ''))) {
    state.activeLightId = '';
  }
}

function normalizeHueColor(value = '') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : '#FFFFFF';
}

function renderHueDeviceCard(device) {
  if (!device) return '';

  const isBusy = state.pendingLightIds.has(device.lightId);
  const switchLabel = device.on ? 'Ausschalten' : 'Einschalten';
  const switchClass = device.on
    ? 'bg-slate-900 text-white hover:bg-slate-700'
    : 'bg-amber-500 text-slate-950 hover:bg-amber-400';
  const brightnessText = Number.isFinite(device.brightness) ? `${device.brightness} %` : '—';
  const typeText = device.archetype || device.modelId || 'Unbekannt';
  const currentColor = normalizeHueColor(device.colorHex || '#FFFFFF');
  const brightnessControlHtml = device.controllable && device.supportsBrightness ? `
    <div class="rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
      <div class="flex items-center justify-between gap-3 text-[10px] font-semibold text-slate-600">
        <span>Helligkeit</span>
        <span data-hue-brightness-label="${escapeHtml(device.lightId)}">${escapeHtml(brightnessText)}</span>
      </div>
      <div class="mt-1">
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value="${escapeHtml(String(Number.isFinite(device.brightness) ? device.brightness : 100))}"
          data-hue-brightness-input="${escapeHtml(device.lightId)}"
          class="h-2 w-full accent-violet-600"
          ${isBusy ? 'disabled' : ''}
        />
      </div>
    </div>
  ` : '';
  const colorControlHtml = device.controllable && device.supportsColor ? `
    <div class="rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
      <div class="flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-600">
        <span>Farbe</span>
        <span class="font-bold text-slate-900">${escapeHtml(currentColor)}</span>
      </div>
      <div class="mt-1 flex flex-wrap gap-1">
        ${HUE_PRESET_COLORS.map((entry) => `
          <button
            type="button"
            data-hue-action="color-preset"
            data-hue-light-id="${escapeHtml(device.lightId)}"
            data-hue-color-value="${escapeHtml(entry.value)}"
            aria-label="${escapeHtml(entry.label)}"
            title="${escapeHtml(entry.label)}"
            class="h-7 w-7 rounded-full border-2 shadow-sm transition ${entry.value === currentColor ? 'scale-105 border-violet-600' : 'border-white hover:border-slate-300'} ${isBusy ? 'cursor-not-allowed opacity-50' : ''}"
            style="background:${escapeHtml(entry.value)}"
            ${isBusy ? 'disabled' : ''}
          ></button>
        `).join('')}
      </div>
      <label class="mt-1 flex items-center gap-2 rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
        <span class="text-[10px] font-semibold text-slate-600">Eigene</span>
        <input
          type="color"
          value="${escapeHtml(currentColor)}"
          data-hue-color-input="${escapeHtml(device.lightId)}"
          class="h-8 min-w-0 flex-1 cursor-pointer rounded-md border border-slate-200 bg-white p-1"
          ${isBusy ? 'disabled' : ''}
        />
      </label>
    </div>
  ` : '';
  const controlHtml = device.controllable
    ? `
      ${colorControlHtml || brightnessControlHtml ? `
        <div class="mt-1 grid ${colorControlHtml && brightnessControlHtml ? 'grid-cols-[minmax(0,0.92fr)_minmax(0,1.4fr)]' : 'grid-cols-1'} gap-1">
          ${colorControlHtml}
          ${brightnessControlHtml}
        </div>
      ` : ''}
      <div class="mt-1 flex justify-center">
        <button
          type="button"
          data-hue-action="toggle"
          data-hue-light-id="${escapeHtml(device.lightId)}"
          data-hue-next-on="${device.on ? 'false' : 'true'}"
          class="inline-flex min-w-[8.5rem] items-center justify-center rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold transition ${switchClass}"
          ${isBusy ? 'disabled' : ''}
        >
          ${isBusy ? 'Sende...' : switchLabel}
        </button>
      </div>
    `
    : '<div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">Dieses Gerät ist sichtbar, aber in Smart Top2 derzeit nicht direkt schaltbar.</div>';

  return `<article class="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
    <div class="flex items-start gap-2">
      <span class="${getHueLedClass(device)} mt-0.5" aria-hidden="true"></span>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] font-semibold text-violet-600">${escapeHtml(device.roomName || 'Ohne Raum')}</div>
        <h4 class="mt-0.5 text-[11px] font-extrabold text-slate-900">${escapeHtml(device.name)}</h4>
        <p class="mt-0.5 text-[10px] text-slate-600">${escapeHtml(device.productName || 'Hue Gerät')}</p>
      </div>
    </div>
    <div class="mt-1 grid grid-cols-2 gap-1 text-[11px]">
      <div class="rounded-lg bg-slate-50 px-2 py-1.5">
        <div class="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Typ</div>
        <div class="mt-0.5 font-bold text-slate-900">${escapeHtml(typeText)}</div>
      </div>
      <div class="rounded-lg bg-slate-50 px-2 py-1.5">
        <div class="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Helligkeit</div>
        <div class="mt-0.5 font-bold text-slate-900">${escapeHtml(brightnessText)}</div>
      </div>
    </div>
    <div class="mt-1">${controlHtml}</div>
  </article>`;
}

function renderStatus() {
  const elements = getElements();
  if (!elements.section) return;

  const isLoggedIn = currentUser.mode && currentUser.mode !== GUEST_MODE;
  const canControl = hasHueControlPermission();
  const status = state.status;
  const connected = Boolean(status?.connected);
  const bridgeName = connected ? (status?.bridge?.name || 'Philips Hue Bridge') : 'Hue nicht verbunden';
  const devices = connected && Array.isArray(status?.devices) ? getSortedDevices(status.devices) : [];
  if (!canControl) {
    state.activeLightId = '';
  }
  syncSelectedDevice(devices);
  const selectedDevice = getSelectedDevice(devices);

  elements.section.dataset.connected = connected ? 'true' : 'false';

  if (elements.loading) {
    elements.loading.style.display = state.loading ? 'flex' : 'none';
  }

  if (elements.error) {
    const message = state.error || (status?.needsReconnect ? (status?.error || 'Hue muss erneut verbunden werden.') : '');
    elements.error.textContent = message;
    elements.error.style.display = message ? 'block' : 'none';
  }

  if (elements.bridgeBadge) {
    elements.bridgeBadge.textContent = `Bridge: ${bridgeName}`;
  }

  if (elements.details) {
    const showDetails = !connected;
    elements.details.classList.toggle('hidden', !showDetails);
  }

  if (elements.summaryGrid) {
    if (!connected) {
      elements.summaryGrid.innerHTML = `
        <div class="min-w-0 rounded-xl bg-white/80 px-2.5 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-black/5 col-span-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="gardena-led gardena-led--red" aria-hidden="true"></span>
            <span class="truncate">Hue nicht verbunden</span>
          </div>
        </div>
      `;
    } else if (!devices.length) {
      elements.summaryGrid.innerHTML = '<div class="col-span-2 text-xs font-semibold text-slate-500">Keine Geräte verfügbar.</div>';
    } else {
      elements.summaryGrid.innerHTML = devices.map((device) => `
        <button
          type="button"
          data-hue-select-light-id="${escapeHtml(device.lightId)}"
          aria-expanded="${String(device.lightId) === String(state.activeLightId || '') ? 'true' : 'false'}"
          class="min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 transition ${String(device.lightId) === String(state.activeLightId || '') ? 'bg-violet-50 ring-violet-300' : (canControl ? 'bg-white/80 ring-black/5 hover:bg-violet-50/70' : 'bg-white/80 ring-black/5')} ${canControl ? '' : 'cursor-default'}"
          ${canControl ? '' : 'disabled'}
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="${getHueLedClass(device)}" aria-hidden="true"></span>
            <span class="truncate">${escapeHtml(device.name || 'Hue Gerät')}</span>
          </div>
        </button>
        ${canControl && String(device.lightId) === String(state.activeLightId || '') ? `<div class="col-span-2 -mt-px">${renderHueDeviceCard(selectedDevice)}</div>` : ''}
      `).join('');
    }
  }

  setButtonBusy(elements.connectButton, state.connectLoading, 'Weiter zu Hue...', 'Hue verbinden');
  if (elements.refreshButton) {
    elements.refreshButton.disabled = state.loading || !isLoggedIn;
  }
  if (elements.connectButton) {
    elements.connectButton.style.display = isLoggedIn && canControl && !connected ? 'inline-flex' : 'none';
  }
  if (elements.refreshButton) {
    elements.refreshButton.style.display = isLoggedIn && isHueViewVisible() ? 'inline-flex' : 'none';
  }

  if (elements.deviceGrid) {
    if (!connected) {
      elements.deviceGrid.innerHTML = '';
    } else {
      elements.deviceGrid.innerHTML = '';
    }
  }
}

async function fetchStatus(showLoading = true) {
  const elements = getElements();
  if (!elements.section) return;

  if (!hasHueViewPermission()) {
    state.status = null;
    state.error = '';
    state.loading = false;
    state.activeLightId = '';
    renderStatus();
    return;
  }

  if (!currentUser.mode || currentUser.mode === GUEST_MODE) {
    state.status = null;
    state.error = '';
    state.loading = false;
    renderStatus();
    return;
  }

  if (showLoading) {
    state.loading = true;
    renderStatus();
  }

  try {
    const payload = await requestApi(STATUS_ENDPOINT);
    state.status = payload;
    state.error = '';
  } catch (error) {
    state.error = extractErrorMessage(error, 'Hue-Status konnte nicht geladen werden.');
  } finally {
    state.loading = false;
    renderStatus();
  }
}

async function startHueConnect() {
  if (!currentUser.mode || currentUser.mode === GUEST_MODE) {
    alertUser('Bitte melde dich zuerst an.', 'info');
    return;
  }

  if (!hasHueControlPermission()) {
    alertUser('Nur Status sichtbar. Geräte einstellen ist nicht freigeschaltet.', 'error');
    return;
  }

  state.connectLoading = true;
  renderStatus();

  try {
    const payload = await requestApi(CONNECT_ENDPOINT, { method: 'POST' });
    if (!payload?.authorizeUrl) {
      throw new Error('Hue-Autorisierungslink konnte nicht erzeugt werden.');
    }
    window.location.href = payload.authorizeUrl;
  } catch (error) {
    state.connectLoading = false;
    state.error = extractErrorMessage(error, 'Hue-Verbindung konnte nicht gestartet werden.');
    renderStatus();
    alertUser(state.error, 'error');
  }
}

async function sendHueCommand(lightId, body, patch = {}, errorMessage = 'Hue-Gerät konnte nicht aktualisiert werden.') {
  if (!lightId) return;
  if (!hasHueControlPermission()) {
    alertUser('Nur Status sichtbar. Geräte einstellen ist nicht freigeschaltet.', 'error');
    return;
  }
  state.pendingLightIds.add(lightId);
  renderStatus();

  try {
    await requestApi(COMMAND_ENDPOINT, {
      method: 'POST',
      body: { lightId, ...body },
    });
    applyLocalDevicePatch(lightId, patch);
    state.error = '';
    scheduleStatusRefresh(5000);
  } catch (error) {
    state.error = extractErrorMessage(error, errorMessage);
    renderStatus();
    alertUser(state.error, 'error');
  } finally {
    state.pendingLightIds.delete(lightId);
    renderStatus();
  }
}

async function toggleHueLight(lightId, nextOn) {
  await sendHueCommand(lightId, { on: nextOn }, { on: nextOn }, 'Hue-Gerät konnte nicht geschaltet werden.');
}

async function updateHueBrightness(lightId, brightness) {
  await sendHueCommand(
    lightId,
    { brightness },
    { brightness, on: brightness > 0 },
    'Hue-Helligkeit konnte nicht gesetzt werden.'
  );
}

async function updateHueColor(lightId, color) {
  const normalizedColor = normalizeHueColor(color);
  await sendHueCommand(
    lightId,
    { color: normalizedColor },
    { colorHex: normalizedColor, on: true },
    'Hue-Farbe konnte nicht gesetzt werden.'
  );
}

function bindListeners() {
  if (state.listenersBound) return;
  const elements = getElements();
  if (!elements.section && !elements.refreshButton) return;

  elements.summaryGrid?.addEventListener('click', (event) => {
    const actionTarget = event.target instanceof Element ? event.target.closest('[data-hue-action]') : null;
    if (actionTarget) {
      if (!hasHueControlPermission()) {
        return;
      }

      const action = String(actionTarget.getAttribute('data-hue-action') || '');
      const lightId = String(actionTarget.getAttribute('data-hue-light-id') || '');
      if (!lightId) return;

      if (action === 'toggle') {
        const nextOn = String(actionTarget.getAttribute('data-hue-next-on') || '').trim() === 'true';
        toggleHueLight(lightId, nextOn).catch(() => {});
        return;
      }

      if (action === 'brightness') {
        const input = elements.summaryGrid.querySelector(`[data-hue-brightness-input="${CSS.escape(lightId)}"]`);
        const brightness = Number(input?.value || '0');
        if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
          alertUser('Bitte eine Helligkeit zwischen 0 und 100 wählen.', 'error');
          return;
        }
        updateHueBrightness(lightId, brightness).catch(() => {});
        return;
      }

      if (action === 'color-preset') {
        const color = normalizeHueColor(actionTarget.getAttribute('data-hue-color-value') || '');
        if (!/^#[0-9A-F]{6}$/.test(color)) {
          alertUser('Bitte eine gültige Farbe auswählen.', 'error');
          return;
        }
        updateHueColor(lightId, color).catch(() => {});
        return;
      }
    }

    const target = event.target instanceof Element ? event.target.closest('[data-hue-select-light-id]') : null;
    if (!target) return;

    if (!hasHueControlPermission()) {
      return;
    }

    const lightId = target.getAttribute('data-hue-select-light-id') || '';
    state.activeLightId = state.activeLightId === lightId ? '' : lightId;
    renderStatus();
  });

  elements.connectButton?.addEventListener('click', () => {
    startHueConnect().catch(() => {});
  });

  elements.deviceGrid?.addEventListener('click', (event) => {
    if (!hasHueControlPermission()) {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('[data-hue-action]') : null;
    if (!target) return;

    const action = String(target.getAttribute('data-hue-action') || '').trim();
    const lightId = target.getAttribute('data-hue-light-id') || '';
    if (!lightId) return;

    if (action === 'toggle') {
      const nextOn = String(target.getAttribute('data-hue-next-on') || '').trim() === 'true';
      toggleHueLight(lightId, nextOn).catch(() => {});
      return;
    }

    if (action === 'brightness') {
      const input = elements.deviceGrid.querySelector(`[data-hue-brightness-input="${CSS.escape(lightId)}"]`);
      const brightness = Number(input?.value || '0');
      if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
        alertUser('Bitte eine Helligkeit zwischen 0 und 100 wählen.', 'error');
        return;
      }
      updateHueBrightness(lightId, brightness).catch(() => {});
      return;
    }

    if (action === 'color') {
      const input = elements.deviceGrid.querySelector(`[data-hue-color-input="${CSS.escape(lightId)}"]`);
      const color = String(input?.value || '').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
        alertUser('Bitte eine gültige Farbe wählen.', 'error');
        return;
      }
      updateHueColor(lightId, color.toUpperCase()).catch(() => {});
    }
  });

  elements.summaryGrid?.addEventListener('input', (event) => {
    if (!hasHueControlPermission()) {
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('[data-hue-brightness-input]') : null;
    if (!target) return;

    const lightId = target.getAttribute('data-hue-brightness-input') || '';
    const label = elements.summaryGrid.querySelector(`[data-hue-brightness-label="${CSS.escape(lightId)}"]`);
    const value = Number(target.value || '0');
    if (label) {
      label.textContent = `${Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))} %`;
    }
  });

  elements.summaryGrid?.addEventListener('change', (event) => {
    if (!hasHueControlPermission()) {
      return;
    }

    const brightnessTarget = event.target instanceof Element ? event.target.closest('[data-hue-brightness-input]') : null;
    if (brightnessTarget) {
      const lightId = brightnessTarget.getAttribute('data-hue-brightness-input') || '';
      const brightness = Number(brightnessTarget.value || '0');
      if (!lightId) return;
      if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
        alertUser('Bitte eine Helligkeit zwischen 0 und 100 wählen.', 'error');
        return;
      }

      updateHueBrightness(lightId, brightness).catch(() => {});
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('[data-hue-color-input]') : null;
    if (!target) return;

    const lightId = target.getAttribute('data-hue-color-input') || '';
    const color = normalizeHueColor(target.value || '');
    if (!lightId || !/^#[0-9A-F]{6}$/.test(color)) {
      alertUser('Bitte eine gültige Farbe wählen.', 'error');
      return;
    }

    updateHueColor(lightId, color).catch(() => {});
  });

  if (!state.viewObserverBound) {
    state.viewObserverBound = true;
    const view = elements.section?.closest('.view');
    if (view instanceof Element && typeof MutationObserver === 'function') {
      const observer = new MutationObserver(() => {
        renderStatus();
      });
      observer.observe(view, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    document.addEventListener('visibilitychange', () => {
      renderStatus();
    });

    window.addEventListener('focus', () => {
      renderStatus();
    });
  }

  state.listenersBound = true;
}

export function initializeHueEntranceControls(options = {}) {
  helperAlertUser = typeof options.alertUser === 'function' ? options.alertUser : helperAlertUser;
  bindListeners();
  renderStatus();

  if (!state.loading && isHueViewVisible()) {
    fetchStatus(true).catch(() => {});
  }
}

export async function refreshHueEntranceControls(options = {}) {
  if (!getElements().section || !isHueViewVisible()) {
    return;
  }

  await fetchStatus(options.showLoading !== false);
}
