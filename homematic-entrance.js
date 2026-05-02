import { auth, currentUser, GUEST_MODE } from './haupteingang.js';

const STATUS_ENDPOINT = '/api/status';
const COMMAND_ENDPOINT = '/api/command';
const DEFAULT_FUNCTIONS_API_BASE = 'https://europe-west1-top2-e9ac0.cloudfunctions.net/homematicApi';
const MODE_OPTIONS = [
  { value: 'AUTOMATIC', label: 'Auto' },
  { value: 'MANUAL', label: 'Manuell' },
  { value: 'ECO', label: 'Eco' },
];
const TEMPERATURE_PRESETS = [17, 20, 21.5, 23];

const state = {
  listenersBound: false,
  loading: false,
  status: null,
  error: '',
  activeGroupId: '',
  postActionRefreshTimer: null,
  pendingGroupIds: new Set(),
  viewObserverBound: false,
};

let helperAlertUser = null;

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
  if (normalizedBase.endsWith('/homematicApi')) {
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
    section: document.getElementById('homematicEntranceSection'),
    toggleButton: document.getElementById('homematicEntranceToggle'),
    loading: document.getElementById('homematicEntranceLoading'),
    error: document.getElementById('homematicEntranceError'),
    badge: document.getElementById('homematicEntranceBadge'),
    summaryGrid: document.getElementById('homematicEntranceSummaryGrid'),
    details: document.getElementById('homematicEntranceDetails'),
    info: document.getElementById('homematicEntranceInfo'),
  };
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
          lastError = new Error('HomeMatic-Backend ist unter dieser Adresse nicht erreichbar.');
          continue;
        }
        throw new Error(extractErrorMessage(payload, `HTTP ${response.status}`));
      }

      if (isHtmlLikeResponse(payload)) {
        lastError = new Error('HomeMatic-Backend lieferte HTML statt JSON.');
        continue;
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(extractErrorMessage(error));
    }
  }

  throw lastError || new Error('HomeMatic-Backend ist derzeit nicht erreichbar.');
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

function isHomematicViewVisible() {
  const { section } = getElements();
  if (!section) return false;

  const view = section.closest('.view') || section;
  if (!(view instanceof Element)) return false;

  const computedStyle = window.getComputedStyle(view);
  return computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
}

function scheduleStatusRefresh(delayMs = 4000) {
  if (state.postActionRefreshTimer) {
    window.clearTimeout(state.postActionRefreshTimer);
  }

  state.postActionRefreshTimer = window.setTimeout(() => {
    state.postActionRefreshTimer = null;
    if (!isHomematicViewVisible()) return;
    fetchStatus(false).catch(() => {});
  }, delayMs);
}

function formatTemperature(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toFixed(1).replace('.', ',')} °C`;
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.max(0, Math.min(100, Math.round(numeric)))} %`;
}

function computeHeatingActive(device) {
  if (!device) return false;
  const target = Number(device.setPointTemperature);
  return Number.isFinite(target) && target > 5;
}

function getHomematicLedClass(device) {
  if (!device?.reachable) {
    return 'gardena-led gardena-led--slate';
  }
  return computeHeatingActive(device)
    ? 'gardena-led gardena-led--green gardena-led--blink'
    : 'gardena-led gardena-led--red';
}

function getSortedDevices(devices = []) {
  return [...devices].sort((left, right) => {
    const leftOn = computeHeatingActive(left) ? 1 : 0;
    const rightOn = computeHeatingActive(right) ? 1 : 0;
    if (leftOn !== rightOn) {
      return rightOn - leftOn;
    }
    return String(left?.name || '').localeCompare(String(right?.name || ''), 'de', { sensitivity: 'base' });
  });
}

function getSelectedDevice(devices = []) {
  return devices.find((device) => String(device?.groupId || '') === String(state.activeGroupId || '')) || null;
}

function syncSelectedDevice(devices = []) {
  if (!devices.some((device) => String(device?.groupId || '') === String(state.activeGroupId || ''))) {
    state.activeGroupId = '';
  }
}

function applyLocalDevicePatch(groupId, patch = {}) {
  if (!state.status || !Array.isArray(state.status.devices)) return;
  state.status.devices = state.status.devices.map((device) => {
    if (String(device?.groupId || '') !== String(groupId || '')) {
      return device;
    }
    const nextDevice = { ...device, ...patch };
    nextDevice.heatingActive = computeHeatingActive(nextDevice);
    return nextDevice;
  });
  state.status.controllableDevices = state.status.devices.filter((device) => device?.controllable);
}

function renderModeButton(device, option, isBusy) {
  const active = String(device?.controlMode || '').toUpperCase() === option.value;
  return `
    <button
      type="button"
      data-homematic-action="mode"
      data-homematic-group-id="${escapeHtml(device.groupId)}"
      data-homematic-mode="${escapeHtml(option.value)}"
      class="rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold transition ${active ? 'bg-cyan-600 text-white hover:bg-cyan-700' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}"
      ${isBusy ? 'disabled' : ''}
    >
      ${escapeHtml(option.label)}
    </button>
  `;
}

function renderPresetButton(device, preset, isBusy) {
  const active = Number(device?.setPointTemperature) === Number(preset);
  return `
    <button
      type="button"
      data-homematic-action="preset-temperature"
      data-homematic-group-id="${escapeHtml(device.groupId)}"
      data-homematic-temperature="${escapeHtml(String(preset))}"
      class="rounded-lg px-2 py-1 text-[10px] font-bold transition ${active ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}"
      ${isBusy ? 'disabled' : ''}
    >
      ${escapeHtml(formatTemperature(preset))}
    </button>
  `;
}

function renderDeviceCard(device) {
  if (!device) return '';

  const isBusy = state.pendingGroupIds.has(device.groupId);
  const thermostatText = Array.isArray(device.thermostats) && device.thermostats.length
    ? device.thermostats.map((entry) => entry.name || 'Thermostat').join(', ')
    : 'Keine Thermostate erkannt';
  const boostLabel = device.boostMode ? 'Boost aus' : 'Boost ein';
  const boostClass = device.boostMode
    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
    : 'bg-slate-900 text-white hover:bg-slate-700';

  return `<article class="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
    <div class="flex items-start gap-2">
      <span class="${getHomematicLedClass(device)} mt-0.5" aria-hidden="true"></span>
      <div class="min-w-0 flex-1">
        <div class="text-[10px] font-semibold text-cyan-600">${escapeHtml(device.roomName || 'Ohne Raum')}</div>
        <h4 class="mt-0.5 text-[11px] font-extrabold text-slate-900">${escapeHtml(device.name || 'Homematic Heizung')}</h4>
        <p class="mt-0.5 text-[10px] text-slate-600">${escapeHtml(thermostatText)}</p>
      </div>
    </div>

    <div class="mt-1 grid grid-cols-2 gap-1 text-[11px]">
      <div class="rounded-lg bg-slate-50 px-2 py-1.5">
        <div class="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Soll</div>
        <div class="mt-0.5 font-bold text-slate-900">${escapeHtml(formatTemperature(device.setPointTemperature))}</div>
      </div>
      <div class="rounded-lg bg-slate-50 px-2 py-1.5">
        <div class="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Ist</div>
        <div class="mt-0.5 font-bold text-slate-900">${escapeHtml(formatTemperature(device.actualTemperature))}</div>
      </div>
      <div class="rounded-lg bg-slate-50 px-2 py-1.5">
        <div class="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Ventil</div>
        <div class="mt-0.5 font-bold text-slate-900">${escapeHtml(formatPercent(device.valvePosition))}</div>
      </div>
      <div class="rounded-lg bg-slate-50 px-2 py-1.5">
        <div class="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Modus</div>
        <div class="mt-0.5 font-bold text-slate-900">${escapeHtml(device.controlMode || '—')}</div>
      </div>
    </div>

    <div class="mt-1 rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
      <div class="flex items-center justify-between gap-3 text-[10px] font-semibold text-slate-600">
        <span>Temperatur</span>
        <span data-homematic-temperature-label="${escapeHtml(device.groupId)}">${escapeHtml(formatTemperature(device.setPointTemperature))}</span>
      </div>
      <div class="mt-1 flex items-center gap-2">
        <input
          type="range"
          min="5"
          max="30.5"
          step="0.5"
          value="${escapeHtml(String(Number.isFinite(Number(device.setPointTemperature)) ? Number(device.setPointTemperature) : 20))}"
          data-homematic-temperature-input="${escapeHtml(device.groupId)}"
          class="h-2 w-full accent-cyan-600"
          ${isBusy ? 'disabled' : ''}
        />
        <button
          type="button"
          data-homematic-action="set-temperature"
          data-homematic-group-id="${escapeHtml(device.groupId)}"
          class="rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
          ${isBusy ? 'disabled' : ''}
        >
          OK
        </button>
      </div>
      <div class="mt-1 flex flex-wrap gap-1">
        ${TEMPERATURE_PRESETS.map((preset) => renderPresetButton(device, preset, isBusy)).join('')}
      </div>
    </div>

    <div class="mt-1 rounded-lg bg-slate-50 px-2 py-1.5 ring-1 ring-slate-200">
      <div class="text-[10px] font-semibold text-slate-600">Modus</div>
      <div class="mt-1 flex flex-wrap gap-1">
        ${MODE_OPTIONS.map((option) => renderModeButton(device, option, isBusy)).join('')}
      </div>
    </div>

    <div class="mt-1 flex flex-wrap items-center justify-between gap-1.5">
      <div class="flex flex-wrap gap-1 text-[10px] font-semibold text-slate-600">
        <span class="rounded-full bg-slate-100 px-2 py-1">Fenster: ${escapeHtml(device.windowState || '—')}</span>
        <span class="rounded-full bg-slate-100 px-2 py-1">Batterie: ${device.batteryLow ? 'niedrig' : 'ok'}</span>
        <span class="rounded-full bg-slate-100 px-2 py-1">Erreichbar: ${device.reachable ? 'ja' : 'nein'}</span>
      </div>
      <button
        type="button"
        data-homematic-action="boost"
        data-homematic-group-id="${escapeHtml(device.groupId)}"
        data-homematic-next-boost="${device.boostMode ? 'false' : 'true'}"
        class="inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold transition ${boostClass}"
        ${isBusy ? 'disabled' : ''}
      >
        ${isBusy ? 'Sende...' : boostLabel}
      </button>
    </div>
  </article>`;
}

function renderStatus() {
  const elements = getElements();
  if (!elements.section) return;

  const isLoggedIn = currentUser.mode && currentUser.mode !== GUEST_MODE;
  const status = state.status;
  const configured = Boolean(status?.configured);
  const connected = Boolean(status?.connected);
  const devices = configured && connected && Array.isArray(status?.devices) ? getSortedDevices(status.devices) : [];
  syncSelectedDevice(devices);
  const selectedDevice = getSelectedDevice(devices);
  const badgeText = !configured
    ? 'Access Point: nicht konfiguriert'
    : `Access Point: ${status?.accessPoint?.id || 'verbunden'}`;

  elements.section.dataset.connected = connected ? 'true' : 'false';

  if (elements.loading) {
    elements.loading.style.display = state.loading ? 'flex' : 'none';
  }

  if (elements.error) {
    const message = state.error || (configured && !connected ? (status?.error || 'HomeMatic ist derzeit nicht erreichbar.') : '');
    elements.error.textContent = message;
    elements.error.style.display = message ? 'block' : 'none';
  }

  if (elements.badge) {
    elements.badge.textContent = badgeText;
  }

  if (elements.details) {
    elements.details.classList.toggle('hidden', connected && configured);
  }

  if (elements.info) {
    if (!configured) {
      elements.info.innerHTML = '<div class="rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">HomeMatic IP ist im Backend noch nicht vollständig konfiguriert.</div>';
    } else if (!connected) {
      elements.info.innerHTML = `<div class="rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">Letzte Prüfung: ${escapeHtml(formatTimestamp(status?.fetchedAt))}</div>`;
    } else {
      elements.info.innerHTML = '';
    }
  }

  if (elements.summaryGrid) {
    if (!configured) {
      elements.summaryGrid.innerHTML = `
        <div class="min-w-0 rounded-xl bg-white/80 px-2.5 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-black/5 col-span-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="gardena-led gardena-led--red" aria-hidden="true"></span>
            <span class="truncate">HomeMatic nicht konfiguriert</span>
          </div>
        </div>
      `;
    } else if (!connected) {
      elements.summaryGrid.innerHTML = `
        <div class="min-w-0 rounded-xl bg-white/80 px-2.5 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-black/5 col-span-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="gardena-led gardena-led--red" aria-hidden="true"></span>
            <span class="truncate">HomeMatic derzeit offline</span>
          </div>
        </div>
      `;
    } else if (!devices.length) {
      elements.summaryGrid.innerHTML = '<div class="col-span-2 text-xs font-semibold text-slate-500">Keine Heizgruppen verfügbar.</div>';
    } else {
      elements.summaryGrid.innerHTML = devices.map((device) => `
        <button
          type="button"
          data-homematic-select-group-id="${escapeHtml(device.groupId)}"
          aria-expanded="${String(device.groupId) === String(state.activeGroupId || '') ? 'true' : 'false'}"
          class="min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 transition ${String(device.groupId) === String(state.activeGroupId || '') ? 'bg-cyan-50 ring-cyan-300' : 'bg-white/80 ring-black/5 hover:bg-cyan-50/70'}"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="${getHomematicLedClass(device)}" aria-hidden="true"></span>
            <span class="truncate">${escapeHtml(device.name || 'Heizung')}</span>
          </div>
          <div class="mt-0.5 truncate text-left text-[10px] text-slate-500">${escapeHtml(formatTemperature(device.setPointTemperature))} / ${escapeHtml(formatTemperature(device.actualTemperature))}</div>
        </button>
        ${String(device.groupId) === String(state.activeGroupId || '') ? `<div class="col-span-2 -mt-px">${renderDeviceCard(selectedDevice)}</div>` : ''}
      `).join('');
    }
  }
}

async function fetchStatus(showLoading = true) {
  const elements = getElements();
  if (!elements.section) return;

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
    state.error = extractErrorMessage(error, 'HomeMatic-Status konnte nicht geladen werden.');
  } finally {
    state.loading = false;
    renderStatus();
  }
}

async function sendHomematicCommand(groupId, body, patch = {}, errorMessage = 'HomeMatic-Gerät konnte nicht aktualisiert werden.') {
  if (!groupId) return;
  state.pendingGroupIds.add(groupId);
  renderStatus();

  try {
    await requestApi(COMMAND_ENDPOINT, {
      method: 'POST',
      body: { groupId, ...body },
    });
    applyLocalDevicePatch(groupId, patch);
    state.error = '';
    scheduleStatusRefresh(4000);
  } catch (error) {
    state.error = extractErrorMessage(error, errorMessage);
    renderStatus();
    alertUser(state.error, 'error');
  } finally {
    state.pendingGroupIds.delete(groupId);
    renderStatus();
  }
}

async function updateTargetTemperature(groupId, targetTemperature) {
  const numeric = Number(targetTemperature);
  if (!Number.isFinite(numeric)) {
    alertUser('Bitte eine gültige Temperatur wählen.', 'error');
    return;
  }
  await sendHomematicCommand(
    groupId,
    { targetTemperature: Number(numeric.toFixed(1)) },
    { setPointTemperature: Number(numeric.toFixed(1)) },
    'HomeMatic-Solltemperatur konnte nicht gesetzt werden.'
  );
}

async function updateBoost(groupId, boost) {
  await sendHomematicCommand(
    groupId,
    { boost },
    { boostMode: boost },
    'HomeMatic-Boost konnte nicht geändert werden.'
  );
}

async function updateControlMode(groupId, controlMode) {
  await sendHomematicCommand(
    groupId,
    { controlMode },
    { controlMode },
    'HomeMatic-Modus konnte nicht geändert werden.'
  );
}

function bindListeners() {
  if (state.listenersBound) return;
  const elements = getElements();
  if (!elements.section) return;

  elements.summaryGrid?.addEventListener('click', (event) => {
    const actionTarget = event.target instanceof Element ? event.target.closest('[data-homematic-action]') : null;
    if (actionTarget) {
      const action = String(actionTarget.getAttribute('data-homematic-action') || '');
      const groupId = String(actionTarget.getAttribute('data-homematic-group-id') || '');
      if (!groupId) return;

      if (action === 'set-temperature') {
        const input = elements.summaryGrid.querySelector(`[data-homematic-temperature-input="${CSS.escape(groupId)}"]`);
        updateTargetTemperature(groupId, Number(input?.value || '0')).catch(() => {});
        return;
      }

      if (action === 'preset-temperature') {
        const targetTemperature = Number(actionTarget.getAttribute('data-homematic-temperature') || '0');
        updateTargetTemperature(groupId, targetTemperature).catch(() => {});
        return;
      }

      if (action === 'boost') {
        const nextBoost = String(actionTarget.getAttribute('data-homematic-next-boost') || '').trim() === 'true';
        updateBoost(groupId, nextBoost).catch(() => {});
        return;
      }

      if (action === 'mode') {
        const controlMode = String(actionTarget.getAttribute('data-homematic-mode') || '').trim().toUpperCase();
        if (!controlMode) return;
        updateControlMode(groupId, controlMode).catch(() => {});
      }
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('[data-homematic-select-group-id]') : null;
    if (!target) return;

    const groupId = target.getAttribute('data-homematic-select-group-id') || '';
    state.activeGroupId = state.activeGroupId === groupId ? '' : groupId;
    renderStatus();
  });

  elements.summaryGrid?.addEventListener('input', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-homematic-temperature-input]') : null;
    if (!target) return;

    const groupId = target.getAttribute('data-homematic-temperature-input') || '';
    const label = elements.summaryGrid.querySelector(`[data-homematic-temperature-label="${CSS.escape(groupId)}"]`);
    const value = Number(target.value || '0');
    if (label) {
      label.textContent = formatTemperature(value);
    }
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

export function initializeHomematicEntranceControls(options = {}) {
  helperAlertUser = typeof options.alertUser === 'function' ? options.alertUser : helperAlertUser;
  bindListeners();
  renderStatus();

  if (!state.loading && isHomematicViewVisible()) {
    fetchStatus(true).catch(() => {});
  }
}

export async function refreshHomematicEntranceControls(options = {}) {
  if (!getElements().section || !isHomematicViewVisible()) {
    return;
  }

  await fetchStatus(options.showLoading !== false);
}
