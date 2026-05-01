import { auth, currentUser, GUEST_MODE } from './haupteingang.js';

const STATUS_ENDPOINT = '/api/status';
const CONNECT_ENDPOINT = '/api/connect';
const COMMAND_ENDPOINT = '/api/command';
const DISCONNECT_ENDPOINT = '/api/disconnect';
const DEFAULT_FUNCTIONS_API_BASE = 'https://europe-west1-top2-e9ac0.cloudfunctions.net/hueApi';
const AUTO_REFRESH_INTERVAL_MS = 15000;

const state = {
  listenersBound: false,
  loading: false,
  connectLoading: false,
  disconnectLoading: false,
  status: null,
  error: '',
  autoRefreshTimer: null,
  visibilityListenerBound: false,
  pendingLightIds: new Set(),
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
    loading: document.getElementById('hueEntranceLoading'),
    error: document.getElementById('hueEntranceError'),
    bridgeBadge: document.getElementById('hueEntranceBridgeBadge'),
    updatedBadge: document.getElementById('hueEntranceUpdatedBadge'),
    deviceBadge: document.getElementById('hueEntranceDeviceBadge'),
    authNotice: document.getElementById('hueEntranceAuthNotice'),
    connectButton: document.getElementById('hueConnectButton'),
    refreshButton: document.getElementById('hueRefreshButton'),
    disconnectButton: document.getElementById('hueDisconnectButton'),
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

function renderStatus() {
  const elements = getElements();
  if (!elements.section) return;

  const isLoggedIn = currentUser.mode && currentUser.mode !== GUEST_MODE;
  const status = state.status;
  const connected = Boolean(status?.connected);
  const bridgeName = connected ? (status?.bridge?.name || 'Philips Hue Bridge') : 'Hue nicht verbunden';
  const deviceCount = Array.isArray(status?.devices) ? status.devices.length : 0;

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

  if (elements.updatedBadge) {
    elements.updatedBadge.textContent = `Aktualisiert: ${formatTimestamp(status?.fetchedAt)}`;
  }

  if (elements.deviceBadge) {
    elements.deviceBadge.textContent = `Geräte: ${deviceCount}`;
  }

  if (elements.authNotice) {
    if (!isLoggedIn) {
      elements.authNotice.className = 'rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800';
      elements.authNotice.textContent = 'Bitte melde dich zuerst in der TOP2-App an, damit die gemeinsame Hue-Verbindung geladen werden kann.';
    } else if (!connected) {
      const needsReconnect = Boolean(status?.needsReconnect);
      elements.authNotice.className = needsReconnect
        ? 'rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700'
        : 'rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700';
      elements.authNotice.textContent = needsReconnect
        ? (status?.error || 'Hue muss erneut verbunden werden.')
        : 'Verbinde jetzt die gemeinsame Philips-Hue-Bridge einmalig, damit alle berechtigten Nutzer die Lampen in Smart Top2 sehen und steuern können.';
    } else {
      elements.authNotice.className = 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700';
      elements.authNotice.textContent = `Hue ist verbunden. ${status?.controllableDevices?.length || 0} Geräte können direkt geschaltet werden.`;
    }
  }

  setButtonBusy(elements.connectButton, state.connectLoading, 'Weiter zu Hue...', 'Hue verbinden');
  setButtonBusy(elements.disconnectButton, state.disconnectLoading, 'Trennen...', 'Verbindung trennen');
  if (elements.refreshButton) {
    elements.refreshButton.disabled = state.loading || !isLoggedIn;
  }
  if (elements.connectButton) {
    elements.connectButton.style.display = isLoggedIn && !connected ? 'inline-flex' : 'none';
  }
  if (elements.refreshButton) {
    elements.refreshButton.style.display = isLoggedIn ? 'inline-flex' : 'none';
  }
  if (elements.disconnectButton) {
    elements.disconnectButton.style.display = isLoggedIn && connected ? 'inline-flex' : 'none';
  }

  if (elements.deviceGrid) {
    if (!connected) {
      elements.deviceGrid.innerHTML = '';
    } else if (!deviceCount) {
      elements.deviceGrid.innerHTML = '<div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-600">Es wurden noch keine Hue-Geräte gefunden.</div>';
    } else {
      elements.deviceGrid.innerHTML = status.devices.map((device) => {
        const isBusy = state.pendingLightIds.has(device.lightId);
        const switchLabel = device.on ? 'Ausschalten' : 'Einschalten';
        const switchClass = device.on
          ? 'bg-slate-900 text-white hover:bg-slate-700'
          : 'bg-amber-500 text-slate-950 hover:bg-amber-400';
        const badgeClass = device.controllable
          ? (device.on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700')
          : 'bg-sky-100 text-sky-700';
        const badgeText = device.controllable ? (device.on ? 'AN' : 'AUS') : 'Info';
        const brightnessText = Number.isFinite(device.brightness) ? `${device.brightness} %` : '—';
        const typeText = device.archetype || device.modelId || 'Unbekannt';
        const controlHtml = device.controllable
          ? `<button type="button" data-hue-light-id="${escapeHtml(device.lightId)}" data-hue-next-on="${device.on ? 'false' : 'true'}" class="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-extrabold transition ${switchClass}" ${isBusy ? 'disabled' : ''}>${isBusy ? 'Sende...' : switchLabel}</button>`
          : '<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">Dieses Gerät ist sichtbar, aber in Smart Top2 derzeit nicht direkt schaltbar.</div>';

        return `<article class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">${escapeHtml(device.roomName || 'Ohne Raum')}</div>
              <h4 class="mt-1 text-lg font-extrabold text-slate-900">${escapeHtml(device.name)}</h4>
              <p class="mt-1 text-sm text-slate-600">${escapeHtml(device.productName || 'Hue Gerät')}</p>
            </div>
            <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${badgeClass}">${badgeText}</span>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-2xl bg-slate-50 px-3 py-2">
              <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Typ</div>
              <div class="mt-1 font-bold text-slate-900">${escapeHtml(typeText)}</div>
            </div>
            <div class="rounded-2xl bg-slate-50 px-3 py-2">
              <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Helligkeit</div>
              <div class="mt-1 font-bold text-slate-900">${escapeHtml(brightnessText)}</div>
            </div>
          </div>
          <div class="mt-4">${controlHtml}</div>
        </article>`;
      }).join('');
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

async function toggleHueLight(lightId, nextOn) {
  if (!lightId) return;
  state.pendingLightIds.add(lightId);
  renderStatus();
  try {
    await requestApi(COMMAND_ENDPOINT, {
      method: 'POST',
      body: { lightId, on: nextOn },
    });
    await fetchStatus(false);
  } catch (error) {
    state.error = extractErrorMessage(error, 'Hue-Gerät konnte nicht geschaltet werden.');
    renderStatus();
    alertUser(state.error, 'error');
  } finally {
    state.pendingLightIds.delete(lightId);
    renderStatus();
  }
}

async function disconnectHue() {
  state.disconnectLoading = true;
  renderStatus();
  try {
    await requestApi(DISCONNECT_ENDPOINT, { method: 'POST' });
    state.status = {
      ok: true,
      connected: false,
      fetchedAt: new Date().toISOString(),
      bridge: null,
      devices: [],
      controllableDevices: [],
    };
    state.error = '';
    alertUser('Die Hue-Verbindung wurde getrennt.', 'success');
  } catch (error) {
    state.error = extractErrorMessage(error, 'Hue-Verbindung konnte nicht getrennt werden.');
    alertUser(state.error, 'error');
  } finally {
    state.disconnectLoading = false;
    renderStatus();
  }
}

function stopAutoRefresh() {
  if (state.autoRefreshTimer) {
    window.clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  state.autoRefreshTimer = window.setInterval(() => {
    const entranceView = document.getElementById('entranceView');
    const isActive = entranceView?.classList.contains('active');
    if (isActive && !state.loading && currentUser.mode && currentUser.mode !== GUEST_MODE) {
      fetchStatus(false).catch(() => {});
    }
  }, AUTO_REFRESH_INTERVAL_MS);
}

function bindVisibilityRefresh() {
  if (state.visibilityListenerBound) return;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser.mode && currentUser.mode !== GUEST_MODE) {
      fetchStatus(false).catch(() => {});
    }
  });
  state.visibilityListenerBound = true;
}

function bindListeners() {
  if (state.listenersBound) return;
  const elements = getElements();
  const section = elements.section;
  if (!section) return;

  section.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-hue-light-id], #hueConnectButton, #hueRefreshButton, #hueDisconnectButton') : null;
    if (!target) return;

    if (target.id === 'hueConnectButton') {
      startHueConnect().catch(() => {});
      return;
    }

    if (target.id === 'hueRefreshButton') {
      fetchStatus(true).catch(() => {});
      return;
    }

    if (target.id === 'hueDisconnectButton') {
      disconnectHue().catch(() => {});
      return;
    }

    const lightId = target.getAttribute('data-hue-light-id') || '';
    const nextOn = String(target.getAttribute('data-hue-next-on') || '').trim() === 'true';
    toggleHueLight(lightId, nextOn).catch(() => {});
  });

  state.listenersBound = true;
}

export function initializeHueEntranceControls(options = {}) {
  helperAlertUser = typeof options.alertUser === 'function' ? options.alertUser : helperAlertUser;
  bindListeners();
  bindVisibilityRefresh();
  startAutoRefresh();
  renderStatus();
  fetchStatus(true).catch(() => {});
}
