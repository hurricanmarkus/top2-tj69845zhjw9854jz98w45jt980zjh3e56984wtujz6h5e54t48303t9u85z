import { auth, currentUser, GUEST_MODE } from './haupteingang.js';

const STATUS_ENDPOINT = '/api/status';
const COMMAND_ENDPOINT = '/api/command';
const DEFAULT_FUNCTIONS_API_BASE = 'https://europe-west1-top2-e9ac0.cloudfunctions.net/switchbotApi';

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

function hasSwitchbotControlPermission() {
  if (!currentUser.mode || currentUser.mode === GUEST_MODE) return false;
  if (currentUser.role === 'SYSTEMADMIN') return true;
  return Array.isArray(currentUser.permissions) && currentUser.permissions.includes('ENTRANCE_SWITCHBOT_CONTROL');
}

function hasSwitchbotViewPermission() {
  if (!currentUser.mode || currentUser.mode === GUEST_MODE) return false;
  if (currentUser.role === 'SYSTEMADMIN') return true;
  return Array.isArray(currentUser.permissions) && currentUser.permissions.includes('ENTRANCE_SWITCHBOT');
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

function normalizeOrigin(value = '') {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized === 'null' ? '' : normalized;
}

function buildApiUrl(base, endpointPath) {
  const normalizedBase = normalizeOrigin(base);
  if (!normalizedBase) return '';
  if (normalizedBase.endsWith('/switchbotApi')) {
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
          lastError = new Error('SwitchBot-Backend ist unter dieser Adresse nicht erreichbar.');
          continue;
        }
        throw new Error(extractErrorMessage(payload, `HTTP ${response.status}`));
      }

      if (isHtmlLikeResponse(payload)) {
        lastError = new Error('SwitchBot-Backend lieferte HTML statt JSON.');
        continue;
      }

      return payload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(extractErrorMessage(error));
    }
  }

  throw lastError || new Error('SwitchBot-Backend ist derzeit nicht erreichbar.');
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
    section: document.getElementById('switchbotEntranceSection'),
    summaryGrid: document.getElementById('switchbotEntranceSummaryGrid'),
    loading: document.getElementById('switchbotEntranceLoading'),
    error: document.getElementById('switchbotEntranceError'),
    details: document.getElementById('switchbotEntranceDetails'),
    info: document.getElementById('switchbotEntranceInfo'),
    badge: document.getElementById('switchbotEntranceBadge'),
  };
}

function isSwitchbotViewVisible() {
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

function getSortedDevices(devices = []) {
  return [...devices].sort((left, right) => {
    const leftPending = state.pendingDeviceIds.has(String(left?.deviceId || '')) ? 1 : 0;
    const rightPending = state.pendingDeviceIds.has(String(right?.deviceId || '')) ? 1 : 0;
    if (leftPending !== rightPending) return rightPending - leftPending;

    const leftOn = left?.isOn ? 1 : 0;
    const rightOn = right?.isOn ? 1 : 0;
    if (leftOn !== rightOn) return rightOn - leftOn;

    return String(left?.name || '').localeCompare(String(right?.name || ''), 'de', { sensitivity: 'base' });
  });
}

function syncSelectedDevice(devices = []) {
  if (!devices.length) {
    state.activeDeviceId = '';
    return;
  }

  if (!state.activeDeviceId) {
    state.activeDeviceId = normalizeText(devices[0]?.deviceId);
    return;
  }

  if (!devices.some((device) => String(device.deviceId) === String(state.activeDeviceId))) {
    state.activeDeviceId = normalizeText(devices[0]?.deviceId);
  }
}

function getSelectedDevice(devices = []) {
  if (!state.activeDeviceId) return null;
  return devices.find((device) => String(device.deviceId) === String(state.activeDeviceId)) || null;
}

function getDeviceLedClass(device) {
  const normalizedType = normalizeText(device?.deviceType).toLowerCase();
  const isBot = normalizedType.includes('bot');
  const isPending = state.pendingDeviceIds.has(String(device?.deviceId || ''));

  if (isBot) {
    if (isPending) {
      return 'gardena-led gardena-led--green gardena-led--blink';
    }
    return 'gardena-led gardena-led--red';
  }

  if (isPending) {
    return 'gardena-led gardena-led--amber gardena-led--blink';
  }
  if (device?.reachable === false || device?.cloudEnabled === false) {
    return 'gardena-led gardena-led--red';
  }
  if (device?.isOn === true) {
    return 'gardena-led gardena-led--green gardena-led--blink';
  }
  if (device?.isOn === false) {
    return 'gardena-led gardena-led--slate';
  }
  return 'gardena-led gardena-led--amber';
}

function getActionButtonClass(action, device) {
  const normalized = normalizeText(action).toUpperCase();
  const normalizedType = normalizeText(device?.deviceType).toLowerCase();
  const isBot = normalizedType.includes('bot');
  const isPending = state.pendingDeviceIds.has(String(device?.deviceId || ''));

  if (isBot && normalized === 'PRESS') {
    return isPending
      ? 'bg-emerald-600 hover:bg-emerald-700'
      : 'bg-red-600 hover:bg-red-700';
  }

  if (normalized === 'OFF' || normalized === 'CLOSE' || normalized === 'LOCK') {
    return 'bg-red-600 hover:bg-red-700';
  }

  if (normalized === 'PAUSE' || normalized === 'PRESS') {
    return 'bg-red-600 hover:bg-red-700';
  }

  return 'bg-emerald-600 hover:bg-emerald-700';
}

function getActionLabel(action) {
  const normalized = normalizeText(action).toUpperCase();
  if (normalized === 'ON') return 'Ein';
  if (normalized === 'OFF') return 'Aus';
  if (normalized === 'OPEN') return 'Öffnen';
  if (normalized === 'CLOSE') return 'Schließen';
  if (normalized === 'PAUSE') return 'Pause';
  if (normalized === 'PRESS') return 'Drücken';
  if (normalized === 'LOCK') return 'Sperren';
  if (normalized === 'UNLOCK') return 'Entsperren';
  return normalized || 'Aktion';
}

function actionPatch(action) {
  const normalized = normalizeText(action).toUpperCase();
  if (normalized === 'ON' || normalized === 'OPEN' || normalized === 'UNLOCK') {
    return { isOn: true, summaryText: `${getActionLabel(action)} gesendet` };
  }
  if (normalized === 'OFF' || normalized === 'CLOSE' || normalized === 'LOCK') {
    return { isOn: false, summaryText: `${getActionLabel(action)} gesendet` };
  }
  return { summaryText: `${getActionLabel(action)} gesendet` };
}

function getDeviceSummaryFallback(device) {
  const normalizedType = normalizeText(device?.deviceType).toLowerCase();
  if (normalizedType.includes('meter') || normalizedType.includes('thermometer')) {
    return 'Temp: - | Luft: -';
  }
  if (normalizedType.includes('wallet finder') || normalizedType.includes('wallet card')) {
    return 'Tracker bereit';
  }
  if (normalizedType.includes('hub')) {
    return 'Hub online';
  }
  if (normalizedType.includes('contact')) {
    return 'Kontakt: Unbekannt';
  }
  if (normalizedType.includes('water') || normalizedType.includes('leak')) {
    return 'OK';
  }
  return 'Bereit';
}

function normalizeActionsForDevice(device, actions = []) {
  const normalizedType = normalizeText(device?.deviceType).toLowerCase();
  const normalizedActions = actions
    .map((entry) => normalizeText(entry).toUpperCase())
    .filter(Boolean);

  if (normalizedType.includes('bot')) {
    return ['PRESS'];
  }

  return [...new Set(normalizedActions)];
}

function renderDeviceCard(device, canControl) {
  if (!device) return '';

  const actions = normalizeActionsForDevice(device, Array.isArray(device.supportedActions) ? device.supportedActions : []);
  const isPending = state.pendingDeviceIds.has(String(device.deviceId || ''));
  const summaryText = normalizeText(device.summaryText, getDeviceSummaryFallback(device));

  const chips = [
    device.deviceType ? `<span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Typ: ${escapeHtml(device.deviceType)}</span>` : '',
    device.battery !== null && device.battery !== undefined ? `<span class="inline-flex items-center rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-semibold text-lime-800">Akku: ${escapeHtml(device.battery)} %</span>` : '',
    device.temperature !== null && device.temperature !== undefined ? `<span class="inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">Temp: ${escapeHtml(device.temperature)} °C</span>` : '',
    device.humidity !== null && device.humidity !== undefined ? `<span class="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">Luft: ${escapeHtml(device.humidity)} %</span>` : '',
    device.slidePosition !== null && device.slidePosition !== undefined ? `<span class="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">Position: ${escapeHtml(device.slidePosition)} %</span>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="rounded-xl bg-white p-2 ring-1 ring-slate-200 shadow-sm">
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="truncate text-xs font-extrabold text-slate-900">${escapeHtml(device.name || 'SwitchBot-Gerät')}</div>
          <div class="truncate text-[11px] font-semibold text-slate-500">${escapeHtml(summaryText)}</div>
        </div>
        <span class="${getDeviceLedClass(device)}" aria-hidden="true"></span>
      </div>
      ${chips ? `<div class="mt-1.5 flex flex-wrap gap-1">${chips}</div>` : ''}
      ${canControl && actions.length
        ? `<div class="mt-2 grid grid-cols-2 gap-1">
          ${actions.map((action) => `
            <button
              type="button"
              data-switchbot-action="${escapeHtml(action)}"
              data-switchbot-device-id="${escapeHtml(device.deviceId || '')}"
              class="inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition ${getActionButtonClass(action, device)} ${isPending ? 'opacity-70' : ''}"
              ${isPending ? 'disabled' : ''}
            >
              ${escapeHtml(getActionLabel(action))}
            </button>
          `).join('')}
        </div>`
        : ''}
      ${!canControl ? '<div class="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Nur Status sichtbar. Steuerung ist nicht freigeschaltet.</div>' : ''}
      ${device.statusError ? `<div class="mt-2 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">${escapeHtml(device.statusError)}</div>` : ''}
    </div>
  `;
}

function renderStatus() {
  const elements = getElements();
  if (!elements.section) return;

  const isLoggedIn = currentUser.mode && currentUser.mode !== GUEST_MODE;
  const canControl = hasSwitchbotControlPermission();
  const status = state.status;
  const configured = Boolean(status?.configured);
  const connected = Boolean(status?.connected);
  const devices = configured && connected && Array.isArray(status?.devices) ? getSortedDevices(status.devices) : [];

  if (!canControl) {
    state.activeDeviceId = '';
  }

  syncSelectedDevice(devices);
  const selectedDevice = getSelectedDevice(devices);
  const hubCount = Number(status?.hubSummary?.count || 0);
  const badgeText = !configured
    ? 'Hub: nicht konfiguriert'
    : (connected ? `Hub: ${hubCount > 0 ? `${hubCount} aktiv` : 'verbunden'}` : 'Hub: offline');

  elements.section.dataset.connected = connected ? 'true' : 'false';

  if (elements.loading) {
    elements.loading.style.display = state.loading ? 'flex' : 'none';
  }

  if (elements.badge) {
    elements.badge.textContent = badgeText;
  }

  if (elements.error) {
    const message = state.error || (configured && !connected ? (status?.error || 'SwitchBot ist derzeit nicht erreichbar.') : '');
    elements.error.textContent = message;
    elements.error.style.display = message ? 'block' : 'none';
  }

  if (elements.details) {
    elements.details.classList.toggle('hidden', connected && configured);
  }

  if (elements.info) {
    if (!configured) {
      elements.info.innerHTML = '<div class="rounded-lg bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">SwitchBot ist im Backend noch nicht konfiguriert (Token/Secret fehlen).</div>';
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
            <span class="truncate">SwitchBot nicht konfiguriert</span>
          </div>
        </div>
      `;
    } else if (!connected) {
      elements.summaryGrid.innerHTML = `
        <div class="min-w-0 rounded-xl bg-white/80 px-2.5 py-2 text-[12px] font-semibold text-slate-700 ring-1 ring-black/5 col-span-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="gardena-led gardena-led--red" aria-hidden="true"></span>
            <span class="truncate">SwitchBot derzeit offline</span>
          </div>
        </div>
      `;
    } else if (!devices.length) {
      elements.summaryGrid.innerHTML = '<div class="col-span-2 text-xs font-semibold text-slate-500">Keine SwitchBot-Geräte verfügbar.</div>';
    } else {
      elements.summaryGrid.innerHTML = devices.map((device) => {
        const isSelected = String(device.deviceId) === String(state.activeDeviceId || '');
        const summaryText = normalizeText(device.summaryText, normalizeText(device.deviceType, getDeviceSummaryFallback(device)));
        return `
          <button
            type="button"
            data-switchbot-select-id="${escapeHtml(device.deviceId || '')}"
            aria-expanded="${isSelected ? 'true' : 'false'}"
            class="min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 transition ${isSelected ? 'bg-cyan-50 ring-cyan-300' : (canControl ? 'bg-white/80 ring-black/5 hover:bg-cyan-50/70' : 'bg-white/80 ring-black/5')} ${canControl ? '' : 'cursor-default'}"
            ${canControl ? '' : 'disabled'}
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="${getDeviceLedClass(device)}" aria-hidden="true"></span>
              <span class="truncate">${escapeHtml(device.name || 'SwitchBot')}</span>
            </div>
            <div class="mt-0.5 truncate text-left text-[10px] text-slate-500">${escapeHtml(summaryText)}</div>
          </button>
          ${canControl && isSelected ? `<div class="col-span-2 -mt-px">${renderDeviceCard(selectedDevice, canControl)}</div>` : ''}
        `;
      }).join('');
    }
  }

  if (!isLoggedIn || !hasSwitchbotViewPermission()) {
    if (elements.summaryGrid) {
      elements.summaryGrid.innerHTML = '<div class="col-span-2 text-xs font-semibold text-slate-500">Bitte einloggen, um SwitchBot zu sehen.</div>';
    }
  }
}

async function fetchStatus(showLoading = true) {
  const elements = getElements();
  if (!elements.section) return;

  if (!hasSwitchbotViewPermission()) {
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
    state.status = payload;
    state.error = '';
  } catch (error) {
    state.error = extractErrorMessage(error, 'SwitchBot-Status konnte nicht geladen werden.');
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

async function sendSwitchbotCommand(deviceId, action) {
  if (!deviceId || !action) return;

  if (!hasSwitchbotControlPermission()) {
    alertUser('Nur Status sichtbar. Geräte einstellen ist nicht freigeschaltet.', 'error');
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
      },
    });

    applyLocalDevicePatch(deviceId, {
      ...actionPatch(action),
      statusError: '',
      reachable: true,
    });
    state.error = '';
    scheduleStatusRefresh(4500);
  } catch (error) {
    state.error = extractErrorMessage(error, 'SwitchBot-Befehl konnte nicht gesendet werden.');
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
    const actionTarget = event.target instanceof Element ? event.target.closest('[data-switchbot-action]') : null;
    if (actionTarget) {
      if (!hasSwitchbotControlPermission()) {
        return;
      }

      const action = normalizeText(actionTarget.getAttribute('data-switchbot-action'));
      const deviceId = normalizeText(actionTarget.getAttribute('data-switchbot-device-id'));
      if (!action || !deviceId) return;

      sendSwitchbotCommand(deviceId, action).catch(() => {});
      return;
    }

    const target = event.target instanceof Element ? event.target.closest('[data-switchbot-select-id]') : null;
    if (!target || !hasSwitchbotControlPermission()) return;

    const deviceId = normalizeText(target.getAttribute('data-switchbot-select-id'));
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

export function initializeSwitchbotEntranceControls(options = {}) {
  helperAlertUser = typeof options.alertUser === 'function' ? options.alertUser : helperAlertUser;
  bindListeners();
  renderStatus();

  if (!state.loading && isSwitchbotViewVisible()) {
    fetchStatus(true).catch(() => {});
  }
}

export async function refreshSwitchbotEntranceControls(options = {}) {
  if (!getElements().section || !isSwitchbotViewVisible()) {
    return;
  }

  await fetchStatus(options.showLoading !== false);
}
