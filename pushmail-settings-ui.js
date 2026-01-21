// ========================================
// PUSHMAIL-CENTER EINSTELLUNGS-UI
// ========================================

import { currentUser, GUEST_MODE, alertUser } from './haupteingang.js';
import { 
    NOTIFICATION_DEFINITIONS,
    loadPushmailNotificationSettings,
    savePushmailNotificationSettings,
    getDefaultPushmailNotificationSettings
} from './pushmail-notifications.js';

// ========================================
// EINSTELLUNGS-UI RENDERN
// ========================================

export async function renderPushmailNotificationSettingsUI() {
    const container = document.getElementById('pushmailAutoProgramsContainer');
    if (!container) return;

    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) {
        container.innerHTML = '<p class="text-sm text-center text-gray-400">Bitte anmelden, um Einstellungen zu verwalten.</p>';
        return;
    }

    const settings = await loadPushmailNotificationSettings(userId);
    
    // Global Toggle aktualisieren
    const globalToggle = document.getElementById('pushmailAutoGlobalEnabled');
    if (globalToggle) {
        globalToggle.checked = settings.globalEnabled;
    }

    // Programme rendern
    const html = Object.keys(NOTIFICATION_DEFINITIONS).map(programId => {
        const program = NOTIFICATION_DEFINITIONS[programId];
        const programSettings = settings.programs[programId];

        if (!programSettings) return '';

        return `
            <div class="card bg-white p-4 rounded-xl shadow-lg border-l-4 ${program.borderClass}">
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-bold ${program.textClass}">${program.title}</h4>
                    <label class="flex items-center gap-2">
                        <input type="checkbox" class="program-toggle h-4 w-4" 
                               data-program="${programId}" 
                               ${programSettings.enabled ? 'checked' : ''}>
                        <span class="text-sm text-gray-700">AN</span>
                    </label>
                </div>

                <div class="space-y-3 pl-4 border-l-2 border-gray-200">
                    ${renderNotificationsForProgram(programId, program, programSettings)}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Event-Listener hinzufügen
    attachNotificationSettingsListeners();
}

function renderNotificationsForProgram(programId, program, programSettings) {
    return Object.keys(program.notifications).map(notifId => {
        const notifDef = program.notifications[notifId];
        const notifSettings = programSettings.notifications[notifId];

        if (!notifSettings) return '';

        const hasDaysBeforeX = notifDef.defaultDaysBeforeX !== null && notifDef.defaultDaysBeforeX !== undefined;

        return `
            <div class="notification-item p-3 bg-gray-50 rounded-lg border border-gray-200" 
                 data-program="${programId}" 
                 data-notification="${notifId}">
                <div class="flex items-start justify-between mb-2">
                    <div class="flex-grow">
                        <div class="font-semibold text-gray-800 text-sm">${notifDef.label}</div>
                        <div class="text-xs text-gray-500">${notifDef.description}</div>
                    </div>
                    <select class="notification-state-select text-xs p-1 border rounded bg-white" 
                            data-program="${programId}" 
                            data-notification="${notifId}">
                        <option value="active" ${notifSettings.state === 'active' ? 'selected' : ''}>Aktiv</option>
                        <option value="paused" ${notifSettings.state === 'paused' ? 'selected' : ''}>Pausiert</option>
                        <option value="disabled" ${notifSettings.state === 'disabled' ? 'selected' : ''}>Deaktiviert</option>
                    </select>
                </div>

                <div class="grid ${hasDaysBeforeX ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-2">
                    ${hasDaysBeforeX ? `
                        <div>
                            <label class="text-xs text-gray-600 block mb-1">Tage vorher</label>
                            <input type="number" value="${notifSettings.daysBeforeX || 0}" min="0" max="365"
                                   class="w-full text-xs p-1 border rounded notification-days-input"
                                   data-program="${programId}" 
                                   data-notification="${notifId}">
                        </div>
                    ` : ''}
                    <div>
                        <label class="text-xs text-gray-600 block mb-1">Uhrzeit</label>
                        <input type="time" value="${notifSettings.time || '08:00'}"
                               class="w-full text-xs p-1 border rounded notification-time-input"
                               data-program="${programId}" 
                               data-notification="${notifId}">
                    </div>
                    <div>
                        <label class="text-xs text-gray-600 block mb-1">Wiederholen (Tage)</label>
                        <input type="number" value="${notifSettings.repeatDays || 0}" min="0" max="365"
                               class="w-full text-xs p-1 border rounded notification-repeat-input"
                               data-program="${programId}" 
                               data-notification="${notifId}">
                    </div>
                </div>

                <div class="flex gap-2">
                    <button class="text-xs text-blue-600 hover:underline customize-text-btn" 
                            data-program="${programId}" 
                            data-notification="${notifId}">
                        ✏️ Text anpassen
                    </button>
                    <button class="text-xs text-gray-600 hover:underline reset-notification-btn" 
                            data-program="${programId}" 
                            data-notification="${notifId}">
                        🔄 Standard wiederherstellen
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ========================================
// EVENT-LISTENER
// ========================================

function attachNotificationSettingsListeners() {
    // Global Toggle
    const globalToggle = document.getElementById('pushmailAutoGlobalEnabled');
    if (globalToggle) {
        globalToggle.addEventListener('change', () => {
            console.log('Pushmail: Global Toggle geändert:', globalToggle.checked);
        });
    }

    // Programm Toggles
    document.querySelectorAll('.program-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const programId = e.target.dataset.program;
            console.log('Pushmail: Programm Toggle geändert:', programId, e.target.checked);
        });
    });

    // Benachrichtigungs-Status
    document.querySelectorAll('.notification-state-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const programId = e.target.dataset.program;
            const notifId = e.target.dataset.notification;
            console.log('Pushmail: Status geändert:', programId, notifId, e.target.value);
        });
    });

    // Text anpassen Buttons
    document.querySelectorAll('.customize-text-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const programId = e.target.dataset.program;
            const notifId = e.target.dataset.notification;
            openCustomizeTextModal(programId, notifId);
        });
    });

    // Standard wiederherstellen Buttons
    document.querySelectorAll('.reset-notification-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const programId = e.target.dataset.program;
            const notifId = e.target.dataset.notification;
            await resetNotificationToDefault(programId, notifId);
        });
    });

    // Speichern Button
    const saveBtn = document.getElementById('pushmailAutoSaveButton');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', async () => {
            await savePushmailNotificationSettingsFromUI();
        });
        saveBtn.dataset.listenerAttached = 'true';
    }

    // Reset Button
    const resetBtn = document.getElementById('pushmailAutoResetButton');
    if (resetBtn && !resetBtn.dataset.listenerAttached) {
        resetBtn.addEventListener('click', async () => {
            await resetAllNotificationSettings();
        });
        resetBtn.dataset.listenerAttached = 'true';
    }
}

// ========================================
// EINSTELLUNGEN SPEICHERN
// ========================================

async function savePushmailNotificationSettingsFromUI() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) {
        alertUser('Bitte anmelden, um Einstellungen zu speichern.', 'error');
        return;
    }

    const settings = {
        globalEnabled: document.getElementById('pushmailAutoGlobalEnabled')?.checked || false,
        programs: {}
    };

    // Programme durchgehen
    Object.keys(NOTIFICATION_DEFINITIONS).forEach(programId => {
        const programToggle = document.querySelector(`.program-toggle[data-program="${programId}"]`);
        
        settings.programs[programId] = {
            enabled: programToggle?.checked || false,
            notifications: {}
        };

        // Benachrichtigungen durchgehen
        const program = NOTIFICATION_DEFINITIONS[programId];
        Object.keys(program.notifications).forEach(notifId => {
            const stateSelect = document.querySelector(`.notification-state-select[data-program="${programId}"][data-notification="${notifId}"]`);
            const timeInput = document.querySelector(`.notification-time-input[data-program="${programId}"][data-notification="${notifId}"]`);
            const repeatInput = document.querySelector(`.notification-repeat-input[data-program="${programId}"][data-notification="${notifId}"]`);
            const daysInput = document.querySelector(`.notification-days-input[data-program="${programId}"][data-notification="${notifId}"]`);

            const notifDef = program.notifications[notifId];

            settings.programs[programId].notifications[notifId] = {
                state: stateSelect?.value || 'active',
                time: timeInput?.value || notifDef.defaultTime,
                repeatDays: parseInt(repeatInput?.value || 0),
                daysBeforeX: daysInput ? parseInt(daysInput.value) : notifDef.defaultDaysBeforeX,
                customTitle: notifDef.defaultTitle,
                customMessage: notifDef.defaultMessage
            };
        });
    });

    const success = await savePushmailNotificationSettings(userId, settings);
    if (success) {
        alertUser('Benachrichtigungseinstellungen gespeichert.', 'success');
    }
}

// ========================================
// STANDARD WIEDERHERSTELLEN
// ========================================

async function resetNotificationToDefault(programId, notifId) {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;

    const notifDef = NOTIFICATION_DEFINITIONS[programId]?.notifications[notifId];
    if (!notifDef) return;

    // UI aktualisieren
    const stateSelect = document.querySelector(`.notification-state-select[data-program="${programId}"][data-notification="${notifId}"]`);
    const timeInput = document.querySelector(`.notification-time-input[data-program="${programId}"][data-notification="${notifId}"]`);
    const repeatInput = document.querySelector(`.notification-repeat-input[data-program="${programId}"][data-notification="${notifId}"]`);
    const daysInput = document.querySelector(`.notification-days-input[data-program="${programId}"][data-notification="${notifId}"]`);

    if (stateSelect) stateSelect.value = 'active';
    if (timeInput) timeInput.value = notifDef.defaultTime;
    if (repeatInput) repeatInput.value = notifDef.defaultRepeatDays;
    if (daysInput) daysInput.value = notifDef.defaultDaysBeforeX || 0;

    alertUser('Benachrichtigung auf Standard zurückgesetzt.', 'success');
}

async function resetAllNotificationSettings() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;

    const confirmed = confirm('Möchten Sie wirklich alle Benachrichtigungseinstellungen auf die Standardwerte zurücksetzen?');
    if (!confirmed) return;

    const defaults = getDefaultPushmailNotificationSettings();
    const success = await savePushmailNotificationSettings(userId, defaults);
    
    if (success) {
        alertUser('Alle Einstellungen auf Standard zurückgesetzt.', 'success');
        await renderPushmailNotificationSettingsUI();
    }
}

// ========================================
// TEXT-ANPASSUNGS-MODAL
// ========================================

let currentEditingNotification = null;

function openCustomizeTextModal(programId, notifId) {
    const modal = document.getElementById('customizeNotificationModal');
    if (!modal) {
        console.warn('Customize Modal nicht gefunden');
        return;
    }

    currentEditingNotification = { programId, notifId };

    const notifDef = NOTIFICATION_DEFINITIONS[programId]?.notifications[notifId];
    if (!notifDef) return;

    // Aktuelle Werte laden
    const titleInput = document.getElementById('customNotificationTitle');
    const messageInput = document.getElementById('customNotificationMessage');
    const placeholdersInfo = document.getElementById('customNotificationPlaceholders');

    if (titleInput) titleInput.value = notifDef.defaultTitle;
    if (messageInput) messageInput.value = notifDef.defaultMessage;
    if (placeholdersInfo) {
        placeholdersInfo.textContent = `Verfügbare Platzhalter: ${notifDef.placeholders.map(p => `{${p}}`).join(', ')}`;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function initializeCustomizeNotificationModal() {
    const modal = document.getElementById('customizeNotificationModal');
    const closeBtn = document.getElementById('closeCustomizeNotificationModal');
    const saveBtn = document.getElementById('saveCustomNotificationBtn');
    const cancelBtn = document.getElementById('cancelCustomNotificationBtn');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            currentEditingNotification = null;
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            currentEditingNotification = null;
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            await saveCustomNotificationText();
        });
    }
}

async function saveCustomNotificationText() {
    if (!currentEditingNotification) return;

    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;

    const { programId, notifId } = currentEditingNotification;

    const titleInput = document.getElementById('customNotificationTitle');
    const messageInput = document.getElementById('customNotificationMessage');

    const customTitle = titleInput?.value || '';
    const customMessage = messageInput?.value || '';

    if (!customTitle || !customMessage) {
        alertUser('Bitte Titel und Nachricht eingeben.', 'error');
        return;
    }

    // Einstellungen laden und aktualisieren
    const settings = await loadPushmailNotificationSettings(userId);
    
    if (!settings.programs[programId]?.notifications[notifId]) {
        alertUser('Fehler: Benachrichtigung nicht gefunden.', 'error');
        return;
    }

    settings.programs[programId].notifications[notifId].customTitle = customTitle;
    settings.programs[programId].notifications[notifId].customMessage = customMessage;

    const success = await savePushmailNotificationSettings(userId, settings);
    
    if (success) {
        alertUser('Benachrichtigungstext gespeichert.', 'success');
        
        const modal = document.getElementById('customizeNotificationModal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        currentEditingNotification = null;
    }
}

// ========================================
// INITIALISIERUNG
// ========================================

export function initializePushmailSettingsUI() {
    console.log('Pushmail: Initialisiere Einstellungs-UI');
    renderPushmailNotificationSettingsUI();
    initializeCustomizeNotificationModal();
}
