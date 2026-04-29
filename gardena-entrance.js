const STATUS_ENDPOINT = '/api/status';
const COMMAND_ENDPOINT = '/api/command';
const STATUS_STALE_MS = 30000;
const PRESET_MINUTES = [5, 10, 15, 30];

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

function getElements() {
  return {
    section: document.getElementById('gardenaEntranceSection'),
    refreshButton: document.getElementById('gardenaEntranceRefreshButton'),
    refreshButtonText: document.querySelector('#gardenaEntranceRefreshButton .button-text'),
    refreshButtonSpinner: document.querySelector('#gardenaEntranceRefreshButton .loading-spinner'),
    loading: document.getElementById('gardenaEntranceLoading'),
    error: document.getElementById('gardenaEntranceError'),
    mowerHost: document.getElementById('gardenaEntranceMowerHost'),
    valveGrid: document.getElementById('gardenaEntranceValveGrid'),
    updatedBadge: document.getElementById('gardenaEntranceUpdatedBadge'),
    locationBadge: document.getElementById('gardenaEntranceLocationBadge'),
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

function getMowerMeta(mower) {
  if (!mower) {
    return {
      badgeClass: 'bg-gray-100 text-gray-700',
      badgeText: 'Keine Daten',
      activityText: 'Keine Daten verfügbar',
      batteryText: '—',
      batteryStateText: '—',
    };
  }

  if (!mower.online) {
    return {
      badgeClass: 'bg-red-100 text-red-700',
      badgeText: 'OFFLINE',
      activityText: mower.activity || mower.state || 'Offline',
      batteryText: mower.batteryLevel ?? '—',
      batteryStateText: mower.batteryState || '—',
    };
  }

  return {
    badgeClass: 'bg-emerald-100 text-emerald-700',
    badgeText: 'ONLINE',
    activityText: mower.activity || mower.state || 'Unbekannt',
    batteryText: mower.batteryLevel ?? '—',
    batteryStateText: mower.batteryState || '—',
  };
}

function getValveMeta(valve) {
  const activity = String(valve?.activity || valve?.state || 'UNBEKANNT').toUpperCase();
  const isOpen = activity === 'MANUAL_CONTROL';
  const isUnavailable = valve?.unavailable || !valve?.serviceId;

  if (isUnavailable) {
    return {
      badgeClass: 'bg-gray-100 text-gray-700',
      badgeText: 'Nicht gefunden',
      activityText: 'Keine Ventil-Daten',
      canStart: false,
      canStop: false,
    };
  }

  if (!valve.online) {
    return {
      badgeClass: 'bg-red-100 text-red-700',
      badgeText: 'OFFLINE',
      activityText: activity,
      canStart: true,
      canStop: true,
    };
  }

  if (isOpen) {
    return {
      badgeClass: 'bg-emerald-100 text-emerald-700',
      badgeText: 'Offen',
      activityText: activity,
      canStart: true,
      canStop: true,
    };
  }

  return {
    badgeClass: 'bg-slate-100 text-slate-700',
    badgeText: 'Geschlossen',
    activityText: activity,
    canStart: true,
    canStop: true,
  };
}

function renderMowerCard() {
  const { mowerHost } = getElements();
  if (!mowerHost) return;

  const meta = getMowerMeta(state.status?.mower);
  const mower = state.status?.mower || {};

  mowerHost.innerHTML = `
    <div class="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-500">Mähroboter</p>
          <h4 class="text-xl font-extrabold text-slate-900">${escapeHtml(mower.name || 'eSusi')}</h4>
        </div>
        <span class="rounded-full px-3 py-1 text-xs font-bold ${meta.badgeClass}">${escapeHtml(meta.badgeText)}</span>
      </div>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-white/80 p-3 ring-1 ring-indigo-100">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</div>
          <div class="mt-1 text-sm font-bold text-slate-900 break-words">${escapeHtml(meta.activityText)}</div>
        </div>
        <div class="rounded-xl bg-white/80 p-3 ring-1 ring-indigo-100">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Batterie</div>
          <div class="mt-1 text-sm font-bold text-slate-900">${escapeHtml(String(meta.batteryText))}${meta.batteryText !== '—' ? ' %' : ''}</div>
        </div>
        <div class="rounded-xl bg-white/80 p-3 ring-1 ring-indigo-100">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Batteriezustand</div>
          <div class="mt-1 text-sm font-bold text-slate-900 break-words">${escapeHtml(meta.batteryStateText)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderValveCards() {
  const { valveGrid } = getElements();
  if (!valveGrid) return;

  const valves = Array.isArray(state.status?.valves) ? state.status.valves : [];

  valveGrid.innerHTML = valves.map((valve) => {
    const meta = getValveMeta(valve);
    const isPending = valve.serviceId && state.pendingServiceIds.has(valve.serviceId);
    const disabledAttr = (!meta.canStart || isPending) ? 'disabled' : '';
    const stopDisabledAttr = (!meta.canStop || isPending) ? 'disabled' : '';

    return `
      <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${valve.online ? '' : 'opacity-95'}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Ventil ${escapeHtml(String(valve.slot || '—'))}</div>
            <h4 class="mt-1 text-lg font-extrabold text-slate-900 break-words">${escapeHtml(valve.name || `Ventil ${valve.slot || ''}`)}</h4>
          </div>
          <span class="shrink-0 rounded-full px-3 py-1 text-xs font-bold ${meta.badgeClass}">${escapeHtml(meta.badgeText)}</span>
        </div>
        <div class="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</div>
          <div class="mt-1 text-sm font-bold text-slate-900 break-words">${escapeHtml(meta.activityText)}</div>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            class="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-gardena-action="open-modal"
            data-service-id="${escapeHtml(valve.serviceId || '')}"
            data-valve-name="${escapeHtml(valve.name || `Ventil ${valve.slot || ''}`)}"
            ${disabledAttr}
          >
            Starten
          </button>
          <button
            type="button"
            class="rounded-xl bg-rose-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
            data-gardena-action="stop"
            data-service-id="${escapeHtml(valve.serviceId || '')}"
            ${stopDisabledAttr}
          >
            <span class="button-text" style="display:${isPending ? 'none' : 'inline-block'}">Stoppen</span>
            <span class="loading-spinner" style="display:${isPending ? 'inline-block' : 'none'}"></span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderStatusMeta() {
  const { updatedBadge, locationBadge, error, loading, refreshButton, refreshButtonText, refreshButtonSpinner } = getElements();

  if (updatedBadge) {
    updatedBadge.textContent = state.lastLoadedAt ? `Aktualisiert: ${formatTimestamp(state.status?.fetchedAt)}` : 'Aktualisiert: —';
  }

  if (locationBadge) {
    locationBadge.textContent = state.status?.location?.name ? `Ort: ${state.status.location.name}` : 'Ort: GARDENA';
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

  setButtonBusy(refreshButton, refreshButtonText, refreshButtonSpinner, state.loading);
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
  renderStatusMeta();
  renderMowerCard();
  renderValveCards();
  renderModal();
}

async function readJsonResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function fetchStatus({ force = false } = {}) {
  if (state.loading && !force) return;

  state.loading = true;
  state.error = '';
  render();

  try {
    const response = await fetch(STATUS_ENDPOINT, {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    const payload = await readJsonResponse(response);
    state.status = payload;
    state.lastLoadedAt = Date.now();
  } catch (error) {
    state.error = error.message || 'Gardena-Status konnte nicht geladen werden.';
  } finally {
    state.loading = false;
    render();
  }
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

async function sendCommand(serviceId, command, seconds = null) {
  if (!serviceId) {
    alertUser('Für dieses Ventil ist keine serviceId verfügbar.', 'error');
    return;
  }

  state.pendingServiceIds.add(serviceId);
  render();

  try {
    const response = await fetch(COMMAND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ serviceId, command, seconds }),
    });
    await readJsonResponse(response);
    alertUser(command === 'STOP_UNTIL_NEXT_TASK' ? 'Ventil wird gestoppt.' : 'Ventil wird gestartet.', 'success');
    closeDurationModal();
    await fetchStatus({ force: true });
    window.setTimeout(() => {
      fetchStatus({ force: true });
    }, 2500);
  } catch (error) {
    alertUser(error.message || 'Befehl konnte nicht gesendet werden.', 'error_long');
  } finally {
    state.pendingServiceIds.delete(serviceId);
    render();
  }
}

function bindListeners() {
  if (state.listenersBound) return;
  state.listenersBound = true;

  const { refreshButton, valveGrid, presetButtons, durationInput, confirmButton, modal } = getElements();

  refreshButton?.addEventListener('click', () => {
    fetchStatus({ force: true });
  });

  valveGrid?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-gardena-action]');
    if (!button) return;

    const action = button.dataset.gardenaAction;
    const serviceId = button.dataset.serviceId || '';
    const valveName = button.dataset.valveName || 'Ventil';

    if (action === 'open-modal') {
      openDurationModal(serviceId, valveName);
      return;
    }

    if (action === 'stop') {
      sendCommand(serviceId, 'STOP_UNTIL_NEXT_TASK');
    }
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
      await sendCommand(state.modalServiceId, 'START_SECONDS_TO_OVERRIDE', minutes * 60);
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

  const isStale = !state.lastLoadedAt || Date.now() - state.lastLoadedAt > STATUS_STALE_MS;
  if (isStale) {
    fetchStatus();
  }
}
