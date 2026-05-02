const STATUS_ENDPOINT = '/api/status';
const COMMAND_ENDPOINT = '/api/command';
const DEFAULT_BACKEND_ORIGIN = 'http://localhost:3000';
const DEFAULT_FUNCTIONS_API_BASE = 'https://europe-west1-top2-e9ac0.cloudfunctions.net/gardenaApi';
const PRESET_MINUTES = [5, 10, 15, 30];
const ACTIVE_VALVE_CODES = new Set(['MANUAL_CONTROL', 'SCHEDULED_WATERING', 'START_SECONDS_TO_OVERRIDE', 'OPEN', 'ACTIVE', 'RUNNING', 'WATERING']);
const ACTIVE_MOWER_CODES = new Set(['LEAVING', 'MOWING', 'GOING_HOME', 'START_DONT_OVERRIDE']);
const GARDENA_TEXTS = {
  ONLINE: 'Online',
  OFFLINE: 'Offline',
  UNKNOWN: 'Unbekannt',
  UNAVAILABLE: 'Nicht verfügbar',
  NOT_AVAILABLE: 'Nicht verfügbar',
  NONE: 'Keine Aktivität',
  OK: 'Bereit',
  ERROR: 'Fehler',
  CLOSED: 'Geschlossen',
  OPEN: 'Offen',
  PAUSED: 'Pausiert',
  LOW: 'Niedrig',
  CRITICAL: 'Kritisch',
  CHARGING: 'Lädt',
  ACTIVE: 'Aktiv',
  RUNNING: 'Läuft',
  WATERING: 'Bewässerung aktiv',
  MANUAL_CONTROL: 'Manuelle Bewässerung',
  SCHEDULED_WATERING: 'Geplante Bewässerung',
  START_SECONDS_TO_OVERRIDE: 'Manuell gestartet',
  STOP_UNTIL_NEXT_TASK: 'Bis zum nächsten Plan gestoppt',
  LEAVING: 'Fährt los',
  MOWING: 'Mäht',
  GOING_HOME: 'Fährt zur Station',
  PARKED_IN_CS: 'In Ladestation',
  PARKED_PARKED_SELECTED: 'Geparkt',
};

const state = {
  listenersBound: false,
  loading: false,
  status: null,
  error: '',
  lastLoadedAt: 0,
  pendingServiceIds: new Set(),
  modalOpen: false,
  modalServiceId: '',
  modalValveName: '',
  selectedMinutes: 10,
  activeDeviceKey: '',
  postActionRefreshTimer: null,
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

function normalizeGardenaCode(value = '') {
  return String(value || '').trim().toUpperCase();
}

function translateGardenaCode(value, fallback = 'Unbekannt') {
  const code = normalizeGardenaCode(value);
  if (!code) return fallback;
  if (GARDENA_TEXTS[code]) return GARDENA_TEXTS[code];

  return code
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || fallback;
}

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function hasPlaceholderValveName(valve) {
  const name = String(valve?.name || '').trim();
  return /^valve\s+\d+$/i.test(name);
}

function isValveActive(valve, activity, status) {
  if (ACTIVE_VALVE_CODES.has(activity) || ACTIVE_VALVE_CODES.has(status)) {
    return true;
  }
  return toPositiveNumber(valve?.duration) > 0;
}

function buildApiUrl(base, endpointPath) {
  const normalizedBase = normalizeOrigin(base);
  if (!normalizedBase) return '';
  if (normalizedBase.endsWith('/gardenaApi')) {
    return `${normalizedBase}${String(endpointPath || '').replace(/^\/api/, '')}`;
  }
  return `${normalizedBase}${endpointPath}`;
}

function isHtmlLikeResponse(value = '') {
  return typeof value === 'string' && /<!doctype html|<html|the page could not be found/i.test(value);
}

function getElements() {
  return {
    section: document.getElementById('gardenaEntranceSection'),
    toggleButton: document.getElementById('gardenaEntranceToggle'),
    loading: document.getElementById('gardenaEntranceLoading'),
    error: document.getElementById('gardenaEntranceError'),
    details: document.getElementById('gardenaEntranceDetails'),
    summaryGrid: document.getElementById('gardenaEntranceSummaryGrid'),
    mowerHost: document.getElementById('gardenaEntranceMowerHost'),
    valveGrid: document.getElementById('gardenaEntranceValveGrid'),
    locationBadge: document.getElementById('gardenaEntranceLocationBadge'),
    refreshButton: document.getElementById('hueRefreshButton'),
    modal: document.getElementById('gardenaDurationModal'),
    modalTitle: document.getElementById('gardenaDurationModalTitle'),
    durationInput: document.getElementById('gardenaDurationInput'),
    confirmButton: document.getElementById('gardenaDurationConfirmButton'),
    confirmButtonText: document.querySelector('#gardenaDurationConfirmButton .button-text'),
    confirmButtonSpinner: document.querySelector('#gardenaDurationConfirmButton .loading-spinner'),
    presetButtons: Array.from(document.querySelectorAll('[data-gardena-preset-minutes]')),
  };
}

function alertUser(message, type = 'info') {
  if (typeof helperAlertUser === 'function') {
    helperAlertUser(message, type);
    return;
  }
  window.alert(message);
}

function createFallbackValve(slot) {
  return {
    slot,
    deviceId: '',
    serviceId: '',
    name: `Ventil ${slot}`,
    activity: 'UNAVAILABLE',
    state: 'UNAVAILABLE',
    duration: null,
    online: false,
    unavailable: true,
  };
}

function normalizeOrigin(value = '') {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized === 'null' ? '' : normalized;
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

function shouldTryNextBackendCandidate(error) {
  const statusCode = Number(error?.statusCode || 0);
  const message = String(error?.message || '').trim().toLowerCase();
  if (statusCode === 404 || statusCode === 200) {
    return true;
  }
  if (statusCode !== 403 && statusCode !== 429) {
    return false;
  }
  return message.includes('explicit deny')
    || message.includes('not authorized to access this resource')
    || message.includes('dürfen diese resource nicht lesen');
}

function getApiUrlCandidates(endpointPath) {
  const configuredOrigin = normalizeOrigin(window.TOP2_API_ORIGIN);
  const currentOrigin = window.location.protocol === 'file:' ? '' : normalizeOrigin(window.location.origin);
  const allowCurrentOriginFallback = Boolean(currentOrigin) && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname || '');
  const allowLocalHttpFallback = window.location.protocol !== 'https:';
  const candidates = [];

  if (configuredOrigin) {
    candidates.push(buildApiUrl(configuredOrigin, endpointPath));
  }

  candidates.push(buildApiUrl(DEFAULT_FUNCTIONS_API_BASE, endpointPath));

  if (allowCurrentOriginFallback) {
    candidates.push(buildApiUrl(currentOrigin, endpointPath));
  }

  if (allowLocalHttpFallback) {
    candidates.push(buildApiUrl(DEFAULT_BACKEND_ORIGIN, endpointPath));
  }

  return [...new Set(candidates.filter(Boolean))];
}

function setButtonBusy(button, textEl, spinnerEl, isBusy) {
  if (!button) return;
  button.disabled = isBusy;
  if (textEl) {
    textEl.style.display = isBusy ? 'none' : 'inline-block';
  }
  if (spinnerEl) {
    spinnerEl.style.display = isBusy ? 'inline-block' : 'none';
  }
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

function isMowerActive(mower) {
  const activity = normalizeGardenaCode(mower?.activity || '');
  const stateCode = normalizeGardenaCode(mower?.state || '');
  return ACTIVE_MOWER_CODES.has(activity) || ACTIVE_MOWER_CODES.has(stateCode);
}

function getMowerMeta(mower) {
  if (!mower) {
    return {
      badgeClass: 'bg-gray-100 text-gray-700',
      badgeText: 'Keine Daten',
      activityText: 'Keine Daten verfügbar',
      batteryText: '—',
      batteryStateText: '—',
      showStart: false,
      showStop: false,
      ledClass: 'gardena-led gardena-led--slate',
    };
  }

  if (!mower.online) {
    return {
      badgeClass: 'bg-red-100 text-red-700',
      badgeText: 'Offline',
      activityText: translateGardenaCode(mower.activity || mower.state || 'OFFLINE', 'Offline'),
      batteryText: mower.batteryLevel ?? '—',
      batteryStateText: translateGardenaCode(mower.batteryState, '—'),
      showStart: false,
      showStop: false,
      ledClass: 'gardena-led gardena-led--red gardena-led--blink',
    };
  }

  const mowerActive = isMowerActive(mower);

  return {
    badgeClass: mowerActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700',
    badgeText: mowerActive ? 'Aktiv' : 'Bereit',
    activityText: translateGardenaCode(mower.activity || mower.state || 'UNKNOWN'),
    batteryText: mower.batteryLevel ?? '—',
    batteryStateText: translateGardenaCode(mower.batteryState, '—'),
    showStart: !mowerActive,
    showStop: mowerActive,
    ledClass: mowerActive ? 'gardena-led gardena-led--green gardena-led--blink' : 'gardena-led gardena-led--red gardena-led--blink',
  };
}

function getValveMeta(valve) {
  const activity = normalizeGardenaCode(valve?.activity || valve?.state || 'UNKNOWN');
  const status = normalizeGardenaCode(valve?.state || valve?.activity || 'UNKNOWN');
  const duration = toPositiveNumber(valve?.duration);
  const isOpen = isValveActive(valve, activity, status);
  const isUnavailable = valve?.unavailable || !valve?.serviceId || hasPlaceholderValveName(valve);
  const activeByDuration = duration > 0 && !ACTIVE_VALVE_CODES.has(activity) && !ACTIVE_VALVE_CODES.has(status);

  if (isUnavailable) {
    return {
      hidden: true,
      cardClass: 'border-slate-200 bg-white',
      badgeClass: 'bg-gray-100 text-gray-700',
      badgeText: 'Nicht verbunden',
      activityText: 'Nicht angeschlossen',
      stateText: 'Nicht verfügbar',
      showStart: false,
      showStop: false,
      ledClass: 'gardena-led gardena-led--slate',
    };
  }

  if (!valve.online) {
    return {
      hidden: false,
      cardClass: 'border-red-200 bg-red-50/60',
      badgeClass: 'bg-red-100 text-red-700',
      badgeText: 'Offline',
      activityText: translateGardenaCode(activity, 'Offline'),
      stateText: translateGardenaCode(status, 'Offline'),
      showStart: false,
      showStop: false,
      ledClass: 'gardena-led gardena-led--red gardena-led--blink',
    };
  }

  if (isOpen) {
    return {
      hidden: false,
      cardClass: 'border-emerald-300 bg-emerald-50',
      badgeClass: 'bg-emerald-100 text-emerald-700',
      badgeText: activity === 'SCHEDULED_WATERING' ? 'Geplant aktiv' : 'Aktiv',
      activityText: activeByDuration ? 'Bewässerung aktiv' : translateGardenaCode(activity, 'Bewässerung aktiv'),
      stateText: activeByDuration ? 'Aktiv' : translateGardenaCode(status, 'Aktiv'),
      showStart: false,
      showStop: true,
      ledClass: 'gardena-led gardena-led--green gardena-led--blink',
    };
  }

  return {
    hidden: false,
    cardClass: 'border-slate-200 bg-white',
    badgeClass: 'bg-slate-100 text-slate-700',
    badgeText: 'Geschlossen',
    activityText: translateGardenaCode(activity, 'Geschlossen'),
    stateText: translateGardenaCode(status, 'Geschlossen'),
    showStart: true,
    showStop: false,
    ledClass: 'gardena-led gardena-led--red gardena-led--blink',
  };
}

function getSortedVisibleValves() {
  const valves = Array.isArray(state.status?.valves) && state.status.valves.length
    ? state.status.valves
    : Array.from({ length: 6 }, (_, index) => createFallbackValve(index + 1));

  return valves
    .filter((valve) => !getValveMeta(valve).hidden)
    .sort((left, right) => {
      const leftActive = getValveMeta(left).showStop ? 1 : 0;
      const rightActive = getValveMeta(right).showStop ? 1 : 0;
      if (leftActive !== rightActive) {
        return rightActive - leftActive;
      }
      return Number(left.slot || 0) - Number(right.slot || 0);
    });
}

function getGardenaSummaryEntries() {
  const entries = [];
  const mower = state.status?.mower;

  if (mower?.name) {
    const meta = getMowerMeta(mower);
    entries.push({
      key: `mower:${String(mower.serviceId || mower.name || 'default').trim()}`,
      type: 'mower',
      label: mower.name || 'Mähroboter',
      active: meta.showStop,
      ledClass: meta.ledClass,
      mower,
      meta,
    });
  }

  getSortedVisibleValves().forEach((valve) => {
    const meta = getValveMeta(valve);
    entries.push({
      key: `valve:${String(valve.serviceId || valve.slot || valve.name || 'unknown').trim()}`,
      type: 'valve',
      label: valve.name || `Ventil ${valve.slot || ''}`,
      active: meta.showStop,
      ledClass: meta.ledClass,
      valve,
      meta,
    });
  });

  return entries.sort((left, right) => {
    if (left.active !== right.active) {
      return Number(right.active) - Number(left.active);
    }
    return String(left.label || '').localeCompare(String(right.label || ''), 'de', { sensitivity: 'base' });
  });
}

function syncActiveDeviceSelection(entries = []) {
  if (!entries.some((entry) => entry.key === state.activeDeviceKey)) {
    state.activeDeviceKey = '';
  }
}

function getActiveGardenaEntry(entries = []) {
  return entries.find((entry) => entry.key === state.activeDeviceKey) || null;
}

function renderMowerCard(activeEntry) {
  if (!activeEntry || activeEntry.type !== 'mower') {
    return '';
  }

  const meta = activeEntry.meta || getMowerMeta(activeEntry.mower);
  const mower = activeEntry.mower || {};
  const isPending = mower.serviceId && state.pendingServiceIds.has(mower.serviceId);
  const actionDisabledAttr = isPending ? 'disabled' : '';

  return `
    <div class="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-2 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-[10px] font-semibold text-indigo-600">
            <span class="${meta.ledClass}" aria-hidden="true"></span>
            <span>Mähroboter</span>
          </div>
          <h4 class="mt-0.5 text-sm font-extrabold text-slate-900">${escapeHtml(mower.name || 'eSusi')}</h4>
        </div>
        <span class="rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.badgeClass}">${escapeHtml(meta.badgeText)}</span>
      </div>
      <div class="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-3">
        <div class="rounded-lg bg-white/80 px-2 py-1.5 ring-1 ring-indigo-100">
          <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Status</div>
          <div class="mt-0.5 text-[11px] font-bold text-slate-900 break-words">${escapeHtml(meta.activityText)}</div>
        </div>
        <div class="rounded-lg bg-white/80 px-2 py-1.5 ring-1 ring-indigo-100">
          <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Batterie</div>
          <div class="mt-0.5 text-[11px] font-bold text-slate-900">${escapeHtml(String(meta.batteryText))}${meta.batteryText !== '—' ? ' %' : ''}</div>
        </div>
        <div class="rounded-lg bg-white/80 px-2 py-1.5 ring-1 ring-indigo-100">
          <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Batteriezustand</div>
          <div class="mt-0.5 text-[11px] font-bold text-slate-900 break-words">${escapeHtml(meta.batteryStateText)}</div>
        </div>
      </div>
      <div class="mt-1 flex flex-wrap gap-1">
        ${meta.showStart ? `
          <button
            type="button"
            class="flex-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-gardena-action="mower-start"
            data-service-id="${escapeHtml(mower.serviceId || '')}"
            ${actionDisabledAttr}
          >
            Starten
          </button>
        ` : ''}
        ${meta.showStop ? `
          <button
            type="button"
            class="flex-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
            data-gardena-action="mower-stop"
            data-service-id="${escapeHtml(mower.serviceId || '')}"
            ${actionDisabledAttr}
          >
            <span class="button-text" style="display:${isPending ? 'none' : 'inline-block'}">Beenden</span>
            <span class="loading-spinner" style="display:${isPending ? 'inline-block' : 'none'}"></span>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderValveCards(activeEntry) {
  if (!activeEntry || activeEntry.type !== 'valve') {
    return '';
  }

  const valve = activeEntry.valve || {};
  const meta = activeEntry.meta || getValveMeta(valve);
  const isPending = valve.serviceId && state.pendingServiceIds.has(valve.serviceId);
  const startDisabledAttr = isPending ? 'disabled' : '';
  const stopDisabledAttr = isPending ? 'disabled' : '';

  return `
    <div class="rounded-xl border p-2 shadow-sm ${meta.cardClass} ${valve.online ? '' : 'opacity-95'}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          <span class="${meta.ledClass}" aria-hidden="true"></span>
          <span>Ventil ${escapeHtml(String(valve.slot || '—'))}</span>
        </div>
        <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.badgeClass}">${escapeHtml(meta.badgeText)}</span>
      </div>
      <div class="mt-1 flex w-full items-center rounded-lg border border-orange-300 bg-orange-50 px-2 py-1.5">
        <h4 class="gardena-valve-name text-[11px] font-extrabold text-slate-900">${escapeHtml(valve.name || `Ventil ${valve.slot || ''}`)}</h4>
      </div>
      <div class="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
        <div class="rounded-lg bg-white/80 px-2 py-1.5 ring-1 ring-slate-100">
          <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Aktivität</div>
          <div class="gardena-status-line mt-0.5 text-[11px] font-bold text-slate-900">${escapeHtml(meta.activityText)}</div>
        </div>
        <div class="rounded-lg bg-white/80 px-2 py-1.5 ring-1 ring-slate-100">
          <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Zustand</div>
          <div class="gardena-status-line mt-0.5 text-[11px] font-bold text-slate-900">${escapeHtml(meta.stateText)}</div>
        </div>
      </div>
      <div class="mt-1 flex flex-wrap gap-1">
        ${meta.showStart ? `
          <button
            type="button"
            class="flex-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-gardena-action="open-modal"
            data-service-id="${escapeHtml(valve.serviceId || '')}"
            data-valve-name="${escapeHtml(valve.name || `Ventil ${valve.slot || ''}`)}"
            ${startDisabledAttr}
          >
            Starten
          </button>
        ` : ''}
        ${meta.showStop ? `
          <button
            type="button"
            class="flex-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
            data-gardena-action="stop"
            data-service-id="${escapeHtml(valve.serviceId || '')}"
            ${stopDisabledAttr}
          >
            <span class="button-text" style="display:${isPending ? 'none' : 'inline-block'}">Stoppen</span>
            <span class="loading-spinner" style="display:${isPending ? 'inline-block' : 'none'}"></span>
          </button>
        ` : ''}
        ${!meta.showStart && !meta.showStop ? `
          <div class="w-full rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-600">
            Derzeit ist keine Aktion verfügbar.
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function renderGardenaInlineDetail(activeEntry) {
  if (!activeEntry) return '';
  return activeEntry.type === 'mower' ? renderMowerCard(activeEntry) : renderValveCards(activeEntry);
}

function renderSummaryGrid(entries = [], activeEntry = null) {
  const { summaryGrid } = getElements();
  if (!summaryGrid) return;

  if (!entries.length) {
    summaryGrid.innerHTML = '<div class="col-span-2 text-xs font-semibold text-slate-500">Keine Geräte verfügbar.</div>';
    return;
  }

  summaryGrid.innerHTML = entries
    .map((entry) => `
      <button
        type="button"
        data-gardena-device-key="${escapeHtml(entry.key)}"
        aria-expanded="${entry.key === state.activeDeviceKey ? 'true' : 'false'}"
        class="min-w-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 transition ${entry.key === state.activeDeviceKey ? 'bg-emerald-50 ring-emerald-300' : 'bg-white/80 ring-black/5 hover:bg-emerald-50/70'}"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="${entry.ledClass}" aria-hidden="true"></span>
          <span class="truncate">${escapeHtml(entry.label)}</span>
        </div>
      </button>
      ${entry.key === state.activeDeviceKey ? `<div class="sm:col-span-2 -mt-px">${renderGardenaInlineDetail(activeEntry)}</div>` : ''}
    `)
    .join('');
}

function renderStatusMeta() {
  const { details, locationBadge, error, loading } = getElements();

  if (locationBadge) {
    locationBadge.textContent = state.status?.location?.name ? `Ort: ${state.status.location.name}` : 'Ort: GARDENA';
  }

  if (details) {
    details.classList.add('hidden');
  }

  if (error) {
    if (state.error) {
      error.textContent = state.error;
      error.classList.remove('hidden');
    } else {
      error.textContent = '';
      error.classList.add('hidden');
    }
  }

  if (loading) {
    const show = state.loading && !state.status;
    loading.classList.toggle('hidden', !show);
    loading.classList.toggle('flex', show);
  }
}

function renderModal() {
  const { modal, modalTitle, durationInput, presetButtons, confirmButton, confirmButtonText, confirmButtonSpinner } = getElements();
  if (!modal) return;

  const show = state.modalOpen;
  modal.classList.toggle('hidden', !show);
  modal.classList.toggle('flex', show);

  if (modalTitle) {
    modalTitle.textContent = state.modalValveName ? `${state.modalValveName} starten` : 'Ventil starten';
  }

  if (durationInput) {
    durationInput.value = Number.isInteger(state.selectedMinutes) ? String(state.selectedMinutes) : '';
  }

  presetButtons.forEach((button) => {
    const minutes = Number(button.dataset.gardenaPresetMinutes);
    const selected = minutes === state.selectedMinutes;
    button.classList.toggle('bg-emerald-600', selected);
    button.classList.toggle('text-white', selected);
    button.classList.toggle('border-emerald-600', selected);
    button.classList.toggle('bg-white', !selected);
    button.classList.toggle('text-slate-700', !selected);
  });

  const isBusy = state.modalServiceId && state.pendingServiceIds.has(state.modalServiceId);
  setButtonBusy(confirmButton, confirmButtonText, confirmButtonSpinner, isBusy);
}

function render() {
  const entries = getGardenaSummaryEntries();
  syncActiveDeviceSelection(entries);
  const activeEntry = getActiveGardenaEntry(entries);
  renderStatusMeta();
  renderSummaryGrid(entries, activeEntry);
  renderModal();
}

async function readJsonResponse(response) {
  const rawText = await response.text().catch(() => '');
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    payload = rawText || null;
  }

  if (isHtmlLikeResponse(payload)) {
    payload = {
      ok: false,
      message: 'Die aktuelle Website liefert kein Gardena-Backend. Online bitte die Cloud Function gardenaApi bereitstellen.',
    };
  }

  if (!response.ok || !payload?.ok) {
    const message = extractErrorMessage(payload?.error || payload?.message || payload, `HTTP ${response.status}`);
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function requestApi(endpoint, options = {}) {
  const candidates = getApiUrlCandidates(endpoint);
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const url = candidates[index];

    try {
      const response = await fetch(url, options);
      return await readJsonResponse(response);
    } catch (error) {
      lastError = error;
      const canTryNext = index < candidates.length - 1;
      const retryableStatus = shouldTryNextBackendCandidate(error);
      const retryableNetworkError = error instanceof TypeError;

      if (canTryNext && (retryableStatus || retryableNetworkError)) {
        continue;
      }
    }
  }

  const message = extractErrorMessage(lastError, 'Backend nicht erreichbar. Bitte Express auf http://localhost:3000 starten.');
  if ((lastError?.statusCode === 404 || lastError instanceof TypeError) && candidates.includes(`${DEFAULT_BACKEND_ORIGIN}${endpoint}`)) {
    throw new Error('Backend nicht erreichbar. Bitte die TOP2-App über http://localhost:3000 öffnen oder den Express-Server starten.');
  }
  throw new Error(message);
}

async function fetchStatus() {
  if (state.loading) return;

  state.loading = true;
  state.error = '';
  render();

  try {
    const payload = await requestApi(STATUS_ENDPOINT, {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    state.status = payload;
    state.lastLoadedAt = Date.now();
  } catch (error) {
    state.error = extractErrorMessage(error, 'Gardena-Status konnte nicht geladen werden.');
  } finally {
    state.loading = false;
    render();
  }
}

function scheduleStatusRefresh(delayMs = 5000) {
  if (state.postActionRefreshTimer) {
    window.clearTimeout(state.postActionRefreshTimer);
  }

  state.postActionRefreshTimer = window.setTimeout(() => {
    state.postActionRefreshTimer = null;
    if (!isGardenaViewVisible()) return;
    fetchStatus();
  }, delayMs);
}

function closeDurationModal() {
  state.modalOpen = false;
  state.modalServiceId = '';
  state.modalValveName = '';
  renderModal();
}

function openDurationModal(serviceId, valveName) {
  state.modalServiceId = serviceId;
  state.modalValveName = valveName || 'Ventil';
  state.selectedMinutes = PRESET_MINUTES.includes(state.selectedMinutes) ? state.selectedMinutes : 10;
  state.modalOpen = true;
  renderModal();
}

function parseSelectedMinutes() {
  const { durationInput } = getElements();
  const minutes = Number(durationInput?.value || state.selectedMinutes || 0);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error('Bitte eine gültige Minutenanzahl eingeben.');
  }
  return minutes;
}

async function sendCommand(serviceId, command, seconds = null, targetType = 'VALVE') {
  if (!serviceId) {
    alertUser(targetType === 'MOWER' ? 'Für den Mäher ist keine serviceId verfügbar.' : 'Für dieses Ventil ist keine serviceId verfügbar.', 'error');
    return;
  }

  state.pendingServiceIds.add(serviceId);
  render();

  try {
    await requestApi(COMMAND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ serviceId, targetType, command, seconds }),
    });
    const successMessage = targetType === 'MOWER'
      ? (command === 'PARK_UNTIL_NEXT_TASK' ? 'Mäher wird beendet.' : 'Mäher wird gestartet.')
      : (command === 'STOP_UNTIL_NEXT_TASK' ? 'Ventil wird gestoppt.' : 'Ventil wird gestartet.');
    alertUser(successMessage, 'success');
    closeDurationModal();
    scheduleStatusRefresh(5000);
  } catch (error) {
    alertUser(extractErrorMessage(error, 'Befehl konnte nicht gesendet werden.'), 'error_long');
  } finally {
    state.pendingServiceIds.delete(serviceId);
    render();
  }
}

function isGardenaViewVisible() {
  const { section } = getElements();
  if (!section) return false;

  const view = section.closest('.view') || section;
  if (!(view instanceof Element)) return false;

  const computedStyle = window.getComputedStyle(view);
  return computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
}

function bindListeners() {
  if (state.listenersBound) return;
  state.listenersBound = true;

  const { summaryGrid, presetButtons, durationInput, confirmButton, modal } = getElements();

  summaryGrid?.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-gardena-action]');
    if (actionButton) {
      const action = actionButton.dataset.gardenaAction;
      const serviceId = actionButton.dataset.serviceId || '';

      if (!serviceId) return;

      if (action === 'mower-start') {
        sendMowerCommand(serviceId, 'START_DONT_OVERRIDE').catch(() => {});
        return;
      }

      if (action === 'mower-stop') {
        sendMowerCommand(serviceId, 'PARK_UNTIL_NEXT_TASK').catch(() => {});
        return;
      }

      if (action === 'open-modal') {
        state.modalServiceId = serviceId;
        state.modalValveName = actionButton.dataset.valveName || 'Ventil';
        state.modalOpen = true;
        renderModal();
        return;
      }

      if (action === 'stop') {
        sendValveCommand(serviceId, 'STOP_UNTIL_NEXT_TASK').catch(() => {});
      }
      return;
    }

    const button = event.target.closest('[data-gardena-device-key]');
    if (!button) return;

    const nextKey = button.getAttribute('data-gardena-device-key') || '';
    state.activeDeviceKey = state.activeDeviceKey === nextKey ? '' : nextKey;
    render();
  });

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedMinutes = Number(button.dataset.gardenaPresetMinutes);
      renderModal();
    });
  });

  durationInput?.addEventListener('input', () => {
    const minutes = Number(durationInput.value);
    state.selectedMinutes = Number.isInteger(minutes) && minutes > 0 ? minutes : state.selectedMinutes;
    renderModal();
  });

  confirmButton?.addEventListener('click', async () => {
    try {
      const minutes = parseSelectedMinutes();
      await sendCommand(state.modalServiceId, 'START_SECONDS_TO_OVERRIDE', minutes * 60, 'VALVE');
    } catch (error) {
      alertUser(error.message || 'Bitte eine gültige Dauer wählen.', 'error');
    }
  });

  modal?.addEventListener('click', (event) => {
    if (event.target.closest('[data-gardena-modal-close]')) {
      closeDurationModal();
    }
  });
}

export function initializeGardenaEntranceControls(options = {}) {
  helperAlertUser = typeof options.alertUser === 'function' ? options.alertUser : helperAlertUser;

  if (!getElements().section) {
    return;
  }

  bindListeners();
  render();

  if (!state.loading && isGardenaViewVisible()) {
    fetchStatus();
  }
}

export async function refreshGardenaEntranceControls() {
  if (!getElements().section || !isGardenaViewVisible()) {
    return;
  }

  await fetchStatus();
}
