import { auth, currentUser, GUEST_MODE } from './haupteingang.js';

const STATUS_ENDPOINT = '/api/status';
const COMMAND_ENDPOINT = '/api/command';
const DEFAULT_FUNCTIONS_API_BASE = 'https://europe-west1-top2-e9ac0.cloudfunctions.net/smartlifeApi';

const state = {
  listenersBound: false,
  loading: false,
  status: null,
  error: '',
  activeDeviceId: '',
  pendingDeviceIds: new Set(),
  postActionRefreshTimer: null,
  viewObserverBound: false,
};

let helperAlertUser = null;

function hasSmartLifeControlPermission() {
  if (!currentUser.mode || currentUser.mode === GUEST_MODE) return false;
  if (currentUser.role === 'SYSTEMADMIN') return true;
  return Array.isArray(currentUser.permissions) && currentUser.permissions.includes('ENTRANCE_SMARTLIFE_CONTROL');
}

function hasSmartLifeViewPermission() {
  if (!currentUser.mode || currentUser.mode === GUEST_MODE) return false;
  if (currentUser.role === 'SYSTEMADMIN') return true;
  return Array.isArray(currentUser.permissions) && currentUser.permissions.includes('ENTRANCE_SMARTLIFE');
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

function normalizeText(value, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const token = normalizeText(value).toLowerCase();
  if (!token) return fallback;
  if (['1', 'true', 'on', 'active', 'online', 'yes'].includes(token)) return true;
  if (['0', 'false', 'off', 'inactive', 'offline', 'no'].includes(token)) return false;
  return fallback;
}

function normalizeNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeOrigin(value = '') {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized === 'null' ? '' : normalized;
}

function buildApiUrl(base, endpointPath) {
  const normalizedBase = normalizeOrigin(base);
  if (!normalizedBase) return '';
  if (normalizedBase.endsWith('/smartlifeApi')) {
    return `${normalizedBase}${String(endpointPath || '').replace(/^\/api/, '')}`;
  }
  return `${normalizedBase}${endpointPath}`;
}

function getApiUrlCandidates(endpointPath) {
  const configuredOrigin = normalizeOrigin(window.TOP2_API_ORIGIN);
  const currentOrigin = window.location.protocol === 'file:' ? '' : normalizeOrigin(window.location.origin);
  const allowCurrentOriginFallback = Boolean(currentOrigin)
    && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname || '');
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

function isHtmlLikeResponse(payload) {
  if (typeof payload !== 'string') return false;
  const text = payload.trim().toLowerCase();
  return text.startsWith('<!doctype html') || text.startsWith('<html');
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
    if (typeof value.msg === 'string') return value.msg;
    if (typeof value.detail === 'string') return value.detail;
    if (value.payload) return extractErrorMessage(value.payload, fallback);
    try {
      return JSON.stringify(value);
    } catch (error) {
      return fallback;
    }
  }

  return String(value);
}

async function getFirebaseIdToken() {
  if (!auth?.currentUser) {
    throw new Error('Bitte zuerst einloggen.');
  }
  return auth.currentUser.getIdToken();
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
          lastError = new Error('SmartLife-Backend ist unter dieser Adresse nicht erreichbar.');
          continue;
        }
        throw new Error(extractErrorMessage(payload, `HTTP ${response.status}`));
      }

      if (isHtmlLikeResponse(payload)) {
        lastError = new Error('SmartLife-Backend lieferte HTML statt JSON.');
        continue;
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(extractErrorMessage(error));
    }
  }

  throw lastError || new Error('SmartLife-Backend ist derzeit nicht erreichbar.');
}

function alertUser(message, type = 'info') {
  if (typeof helperAlertUser === 'function') {
    helperAlertUser(message, type);
    return;
  }

  if (type === 'error') {
    console.error(message);
  } else {
    console.log(message);
  }
}

function getElements() {
  return {
    section: document.getElementById('smartlifeEntranceSection'),
    summaryGrid: document.getElementById('smartlifeEntranceSummaryGrid'),
    loading: document.getElementById('smartlifeEntranceLoading'),
    error: document.getElementById('smartlifeEntranceError'),
    details: document.getElementById('smartlifeEntranceDetails'),
    info: document.getElementById('smartlifeEntranceInfo'),
    badge: document.getElementById('smartlifeEntranceBadge'),
  };
}

function isSmartLifeViewVisible() {
  const section = getElements().section;
  if (!section) return false;
  const view = section.closest('.view');
  if (!(view instanceof HTMLElement)) return true;
  return view.classList.contains('active');
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

function sanitizeStatusPayload(payload) {
  const devices = Array.isArray(payload?.devices) ? payload.devices : [];
  return {
    ok: payload?.ok !== false,
    configured: payload?.configured !== false,
    connected: Boolean(payload?.connected),
    fetchedAt: normalizeText(payload?.fetchedAt, new Date().toISOString()),
    error: normalizeText(payload?.error),
    deviceSummary: payload?.deviceSummary && typeof payload.deviceSummary === 'object' ? payload.deviceSummary : {},
    devices: devices.map((entry) => ({
      deviceId: normalizeText(entry?.deviceId),
      name: normalizeText(entry?.name, 'SmartLife-Gerät'),
      category: normalizeText(entry?.category),
      productName: normalizeText(entry?.productName),
      summaryText: normalizeText(entry?.summaryText),
      online: normalizeBoolean(entry?.online, false),
      reachable: normalizeBoolean(entry?.reachable, true),
      controllable: normalizeBoolean(entry?.controllable, false),
      isOn: normalizeBoolean(entry?.isOn, false),
      primarySwitchCode: normalizeText(entry?.primarySwitchCode).toLowerCase(),
      supportedActions: Array.isArray(entry?.supportedActions) ? entry.supportedActions.map((action) => normalizeText(action).toUpperCase()).filter(Boolean) : [],
      battery: normalizeNumber(entry?.battery, null),
      signal: normalizeNumber(entry?.signal, null),
      statusError: normalizeText(entry?.statusError),
    })).filter((entry) => entry.deviceId),
  };
}

function getSortedDevices(devices = []) {
  return [...devices].sort((left, right) => {
    const leftPending = state.pendingDeviceIds.has(String(left?.deviceId || '')) ? 1 : 0;
    const rightPending = state.pendingDeviceIds.has(String(right?.deviceId || '')) ? 1 : 0;
    if (leftPending !== rightPending) return rightPending - leftPending;

    const leftOn = left?.isOn ? 1 : 0;
    const rightOn = right?.isOn ? 1 : 0;
    if (leftOn !== rightOn) return rightOn - leftOn;

    const leftOnline = left?.online ? 1 : 0;
    const rightOnline = right?.online ? 1 : 0;
    if (leftOnline !== rightOnline) return rightOnline - leftOnline;

    return String(left?.name || '').localeCompare(String(right?.name || ''), 'de', { sensitivity: 'base' });
  });
}

function syncSelectedDevice(devices = []) {
  if (!devices.length) {
    state.activeDeviceId = '';
    return;
  }

  if (!devices.some((device) => String(device.deviceId) === String(state.activeDeviceId))) {
    state.activeDeviceId = '';
  }
}

function getSelectedDevice(devices = []) {
  if (!state.activeDeviceId) return null;
  return devices.find((device) => String(device.deviceId) === String(state.activeDeviceId)) || null;
}

function getDeviceLedClass(device) {
  const isPending = state.pendingDeviceIds.has(String(device?.deviceId || ''));
  if (isPending) {
    return 'gardena-led gardena-led--green gardena-led--blink';
  }
  if (!device?.online) {
    return 'gardena-led gardena-led--slate';
  }
  return device?.isOn
    ? 'gardena-led gardena-led--green'
    : 'gardena-led gardena-led--red';
}

function renderDeviceCard(device, canControl) {
  if (!device) return '';
  const isPending = state.pendingDeviceIds.has(String(device.deviceId || ''));
  const nextAction = device.isOn ? 'OFF' : 'ON';
  const buttonLabel = device.isOn ? 'Ausschalten' : 'Einschalten';
  const buttonClass = device.isOn
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-emerald-600 hover:bg-emerald-700';

  const chips = [
    device.category ? `<span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Typ: ${escapeHtml(device.category)}</span>` : '',
    device.productName ? `<span class="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">Produkt: ${escapeHtml(device.productName)}</span>` : '',
    Number.isFinite(device.battery) ? `<span class="inline-flex items-center rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-semibold text-lime-800">Akku: ${escapeHtml(device.battery)} %</span>` : '',
    Number.isFinite(device.signal) ? `<span class="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">Signal: ${escapeHtml(device.signal)}</span>` : '',
    device.primarySwitchCode ? `<span class="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">Kanal: ${escapeHtml(device.primarySwitchCode)}</span>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="rounded-xl bg-white p-2 ring-1 ring-slate-200 shadow-sm">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="truncate text-xs font-extrabold text-slate-900">${escapeHtml(device.name || 'SmartLife-Gerät')}</div>
          <div class="truncate text-[11px] font-semibold text-slate-500">${escapeHtml(device.summaryText || (device.online ? 'Verbunden' : 'Offline'))}</div>
        </div>
        <span class="${getDeviceLedClass(device)}" aria-hidden="true"></span>
      </div>
      ${chips ? `<div class="mt-1.5 flex flex-wrap gap-1">${chips}</div>` : ''}
      ${canControl && device.controllable
        ? `<div class="mt-2 grid grid-cols-1 gap-1">
          <button
            type="button"
            data-smartlife-action="${escapeHtml(nextAction)}"
            data-smartlife-device-id="${escapeHtml(device.deviceId || '')}"
            class="inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition ${buttonClass} ${isPending ? 'opacity-70' : ''}"
            ${isPending ? 'disabled' : ''}
          >
            ${isPending ? 'Sende...' : escapeHtml(buttonLabel)}
          </button>
        </div>`
        : ''}
      ${!canControl ? '<div class="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Nur Status sichtbar. Steuerung ist nicht freigeschaltet.</div>' : ''}
      ${canControl && !device.controllable ? '<div class="mt-2 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">Dieses Gerät ist aktuell nur lesbar oder offline.</div>' : ''}
      ${device.statusError ? `<div class="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">${escapeHtml(device.statusError)}</div>` : ''}
    </div>
  `;
}

function renderStatus() {
  const elements = getElements();
  if (!elements.section) return;

  const isLoggedIn = currentUser.mode && currentUser.mode !== GUEST_MODE;
  const canControl = hasSmartLifeControlPermission();
  const status = state.status;
  const configured = Boolean(status?.configured);
  const connected = Boolean(status?.connected);
  const devices = configured && connected && Array.isArray(status?.devices)
    ? getSortedDevices(status.devices)
    : [];

  if (!canControl) {
    state.activeDeviceId = '';
  }

  syncSelectedDevice(devices);
  const selectedDevice = getSelectedDevice(devices);
  const total = Number(status?.deviceSummary?.total || devices.length || 0);
  const online = Number(status?.deviceSummary?.online || devices.filter((entry) => entry.online).length || 0);
  const badgeText = !configured
    ? 'Cloud: nicht konfiguriert'
    : (connected ? `Cloud: ${online}/${total} online` : 'Cloud: offline');

  elements.section.dataset.connected = connected ? 'true' : 'false';

  if (elements.loading) {
    elements.loading.style.display = state.loading ? 'flex' : 'none';
  }

  if (elements.badge) {
    elements.badge.textContent = badgeText;
  }

  if (elements.error) {
    const message = state.error || (configured && !connected ? (status?.error || 'SmartLife ist derzeit nicht erreichbar.') : '');
    elements.error.textContent = message;
    elements.error.style.display = message ? 'block' : 'none';
  }

  if (elements.details) {
    elements.details.classList.toggle('hidden', connected && configured);
  }

  if (elements.info) {
    if (!configured) {
      elements.info.innerHTML = '<div class="rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">SmartLife ist im Backend noch nicht konfiguriert (Access ID/Secret fehlen).</div>';
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
            <span class="truncate">SmartLife nicht konfiguriert</span>
          </div>
        </div>
      `;
    } else if (!connected) {
      elements.summaryGrid.innerHTML = `
        <div class="min-w-0 rounded-xl bg-white/80 px-2.5 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-black/5 col-span-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="gardena-led gardena-led--red" aria-hidden="true"></span>
            <span class="truncate">SmartLife derzeit offline</span>
          </div>
        </div>
      `;
    } else if (!devices.length) {
      elements.summaryGrid.innerHTML = '<div class="col-span-2 text-xs font-semibold text-slate-500">Keine SmartLife-Geräte verfügbar.</div>';
    } else {
      elements.summaryGrid.innerHTML = devices.map((device) => {
        const isSelected = String(device.deviceId) === String(state.activeDeviceId || '');
        const summaryText = normalizeText(device.summaryText, device.online ? 'Verbunden' : 'Offline');
        return `
          <button
            type="button"
            data-smartlife-select-id="${escapeHtml(device.deviceId || '')}"
            aria-expanded="${isSelected ? 'true' : 'false'}"
            class="min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 transition ${isSelected ? 'bg-cyan-50 ring-cyan-300' : (canControl ? 'bg-white/80 ring-black/5 hover:bg-cyan-50/70' : 'bg-white/80 ring-black/5')} ${canControl ? '' : 'cursor-default'}"
            ${canControl ? '' : 'disabled'}
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="${getDeviceLedClass(device)}" aria-hidden="true"></span>
              <span class="truncate">${escapeHtml(device.name || 'SmartLife')}</span>
            </div>
            <div class="mt-0.5 truncate text-left text-[10px] text-slate-500">${escapeHtml(summaryText)}</div>
          </button>
          ${canControl && isSelected ? `<div class="col-span-2 -mt-px">${renderDeviceCard(selectedDevice, canControl)}</div>` : ''}
        `;
      }).join('');
    }
  }

  if (!isLoggedIn || !hasSmartLifeViewPermission()) {
    if (elements.summaryGrid) {
      elements.summaryGrid.innerHTML = '<div class="col-span-2 text-xs font-semibold text-slate-500">Bitte einloggen, um SmartLife zu sehen.</div>';
    }
  }
}

async function fetchStatus(showLoading = true) {
  const elements = getElements();
  if (!elements.section) return;

  if (!hasSmartLifeViewPermission()) {
    state.status = null;
    state.error = '';
    state.loading = false;
    state.activeDeviceId = '';
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
    state.status = sanitizeStatusPayload(payload);
    state.error = '';
  } catch (error) {
    state.error = extractErrorMessage(error, 'SmartLife-Status konnte nicht geladen werden.');
  } finally {
    state.loading = false;
    renderStatus();
  }
}

function applyLocalDevicePatch(deviceId, patch = {}) {
  if (!state.status || !Array.isArray(state.status.devices)) return;
  state.status = {
    ...state.status,
    devices: state.status.devices.map((device) => {
      if (String(device.deviceId) !== String(deviceId)) return device;
      return { ...device, ...patch };
    }),
  };
}

function scheduleStatusRefresh(delay = 4500) {
  if (state.postActionRefreshTimer) {
    window.clearTimeout(state.postActionRefreshTimer);
    state.postActionRefreshTimer = null;
  }

  state.postActionRefreshTimer = window.setTimeout(() => {
    fetchStatus(false).catch(() => {});
  }, Math.max(1500, Number(delay) || 4500));
}

async function sendSmartLifeCommand(deviceId, action) {
  if (!deviceId || !action) return;

  if (!hasSmartLifeControlPermission()) {
    alertUser('Nur Status sichtbar. Geräte einstellen ist nicht freigeschaltet.', 'error');
    return;
  }

  const device = Array.isArray(state?.status?.devices)
    ? state.status.devices.find((entry) => String(entry.deviceId) === String(deviceId))
    : null;

  if (!device) {
    alertUser('Gerät nicht gefunden.', 'error');
    return;
  }

  state.pendingDeviceIds.add(String(deviceId));
  renderStatus();

  try {
    await requestApi(COMMAND_ENDPOINT, {
      method: 'POST',
      body: {
        deviceId,
        action,
        ...(device.primarySwitchCode ? { code: device.primarySwitchCode } : {}),
      },
    });

    const nextOn = String(action).toUpperCase() === 'ON';
    applyLocalDevicePatch(deviceId, {
      isOn: nextOn,
      online: true,
      reachable: true,
      summaryText: nextOn ? 'Eingeschaltet' : 'Ausgeschaltet',
      statusError: '',
    });
    state.error = '';
    scheduleStatusRefresh(4500);
  } catch (error) {
    state.error = extractErrorMessage(error, 'SmartLife-Befehl konnte nicht gesendet werden.');
    renderStatus();
    alertUser(state.error, 'error');
  } finally {
    state.pendingDeviceIds.delete(String(deviceId));
    renderStatus();
  }
}

function bindListeners() {
  if (state.listenersBound) return;
  const elements = getElements();
  if (!elements.section) return;

  elements.summaryGrid?.addEventListener('click', (event) => {
    const actionTarget = event.target instanceof Element ? event.target.closest('[data-smartlife-action]') : null;
    if (actionTarget) {
      if (!hasSmartLifeControlPermission()) {
        return;
      }

      const action = String(actionTarget.getAttribute('data-smartlife-action') || '').trim().toUpperCase();
      const deviceId = String(actionTarget.getAttribute('data-smartlife-device-id') || '').trim();
      if (!deviceId || !action) return;

      sendSmartLifeCommand(deviceId, action).catch(() => {});
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('[data-smartlife-select-id]') : null;
    if (!target) return;

    if (!hasSmartLifeControlPermission()) {
      return;
    }

    const deviceId = target.getAttribute('data-smartlife-select-id') || '';
    state.activeDeviceId = state.activeDeviceId === deviceId ? '' : deviceId;
    renderStatus();
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

export function initializeSmartlifeEntranceControls(options = {}) {
  helperAlertUser = typeof options.alertUser === 'function' ? options.alertUser : helperAlertUser;
  bindListeners();
  renderStatus();

  if (!state.loading && isSmartLifeViewVisible()) {
    fetchStatus(true).catch(() => {});
  }
}

export async function refreshSmartlifeEntranceControls(options = {}) {
  if (!getElements().section || !isSmartLifeViewVisible()) {
    return;
  }

  await fetchStatus(options.showLoading !== false);
}
