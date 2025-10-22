const IFTTT_EVENT = 'NFC_Stick_Switchbot_Bauteil_2_Wohnungsanlage_oeffnen';
const IFTTT_KEY = 'pECKM4iJ9sI_3ZF4DdYTzsH60p3cCg0yLbnPGzUFbFO';
const IFTTT_URL = `https://maker.ifttt.com/trigger/${IFTTT_EVENT}/with/key/${IFTTT_KEY}`;

function initializeNotrufSettingsView() {
    activeFlicEditorKlickTyp = null; // Aktiven Klick-Typ zurücksetzen
    document.getElementById('flic-details-editor-container').classList.add('hidden'); // Editor-Box verstecken

    populateFlicAssignmentSelectors(); // Den einen Editor-Dropdown befüllen
    updateFlicColumnDisplays(); // Die 3 Spalten mit den Modus-Namen befüllen

    // Alle Spalten-Hervorhebungen entfernen
    document.querySelectorAll('.flic-column-block').forEach(col => {
        col.classList.remove('bg-indigo-100', 'border-indigo-400');
        col.classList.add('bg-gray-50', 'border-gray-200');
    });

    // Editor-Bereiche standardmäßig verstecken
    document.getElementById('modeEditorArea').classList.add('hidden');
    document.getElementById('modeConfigFormContainer').classList.add('hidden');

    // Sicherstellen, dass die Zuweisungskarte (die obere) sichtbar ist
    const assignmentCard = document.querySelector('#card-flic-notruf .card');
    if (assignmentCard) assignmentCard.classList.remove('hidden');
    const tabsContainer = notrufView.querySelector('#notruf-settings-tabs');
    
    if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
        tabsContainer.addEventListener('click', (e) => {
            const clickedTab = e.target.closest('.settings-tab-btn');
            if (!clickedTab) return;

            const targetCardId = clickedTab.dataset.targetCard;
            const prompt = document.getElementById('notruf-prompt');
            const isAlreadyActive = clickedTab.classList.contains('bg-white');

            // 1. Alles zurücksetzen
            tabsContainer.querySelectorAll('.settings-tab-btn').forEach(tab => {
                tab.classList.remove('bg-white', 'shadow', 'text-indigo-600');
                tab.classList.add('text-gray-600');
            });
            notrufView.querySelectorAll('.notruf-settings-card').forEach(card => card.classList.add('hidden'));

            if (isAlreadyActive) {
                // 2. Wenn aktiver Tab geklickt wurde: Prompt anzeigen
                prompt.style.display = 'block';
            } else {
                // 3. Wenn neuer Tab geklickt wurde: Prompt verbergen, Tab anzeigen
                prompt.style.display = 'none';
                clickedTab.classList.add('bg-white', 'shadow', 'text-indigo-600');
                clickedTab.classList.remove('text-gray-600');
                const targetCard = document.getElementById(targetCardId);
                if (targetCard) {
                    targetCard.classList.remove('hidden');
                }
            }
        });
        tabsContainer.dataset.listenerAttached = 'true';
    }

    // --- Event Listener für das Kontaktbuch-Modal ---
const contactModal = document.getElementById('contactBookModal');
if (contactModal && !contactModal.dataset.listenerAttached) {
    contactModal.addEventListener('click', (e) => {
        // Modal schließen
        if (e.target.closest('#contactBookCloseButton')) {
            contactModal.style.display = 'none';
        }
        // Kontakt hinzufügen
        // NEUER CODE
        if (e.target.closest('#contactAddButton')) {
            const type = document.getElementById('contactIsGroup').value; // .trim() ist nicht mehr nötig
            const name = document.getElementById('contactName').value.trim();
            const key = document.getElementById('contactUserKey').value.trim();
            if (type && name && key) {
                if (!notrufSettings.contacts) notrufSettings.contacts = []; // Initialisieren, falls leer
                notrufSettings.contacts.push({ id: Date.now(), type, name, key });

                // Das ganze Objekt in Firebase speichern
                setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                    renderContactBook();
                    // Felder leeren (hier ist die Änderung)
                    document.getElementById('contactIsGroup').value = 'User'; // Setzt auf Standardwert zurück
                    document.getElementById('contactName').value = '';
                    document.getElementById('contactUserKey').value = '';
                }).catch(err => alertUser('Fehler beim Speichern des Kontakts.', 'error'));
            } else {
                alertUser('Bitte alle Felder für den Kontakt ausfüllen.', 'error');
            }
        }
        // Kontakt löschen
        if (e.target.closest('.delete-contact-btn')) {
            const contactId = e.target.closest('.delete-contact-btn').dataset.contactId;
            if (confirm('Möchten Sie diesen Kontakt wirklich löschen?')) {
                notrufSettings.contacts = notrufSettings.contacts.filter(c => c.id != contactId);

                // Das ganze Objekt in Firebase speichern
                setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                    renderContactBook();
                }).catch(err => alertUser('Fehler beim Löschen des Kontakts.', 'error'));
            }
        }
        // Auswahl übernehmen und Modal schließen
        if (e.target.closest('#contactBookApplyButton')) {
            const displayArea = document.getElementById('notrufUserKeyDisplay');
            displayArea.innerHTML = '';
            const selectedContacts = [];
            contactModal.querySelectorAll('.contact-checkbox:checked').forEach(cb => {
                const contact = (notrufSettings.contacts || []).find(c => c.id == cb.value);
                if (contact) {
                    displayArea.innerHTML += `<span class="contact-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-contact-id="${contact.id}">${contact.name}</span>`;
                }
            });
            contactModal.style.display = 'none';
        }
    });
    contactModal.dataset.listenerAttached = 'true';
}

const notrufConfigToggle = document.getElementById('notrufConfigToggle');
if (notrufConfigToggle) {
    notrufConfigToggle.addEventListener('click', () => {
        const area = document.getElementById('notrufConfigArea');
        const icon = document.getElementById('notrufConfigToggleIcon');
        area.classList.toggle('hidden');
        icon.classList.toggle('rotate-180');
    });
}
}

function populateFlicAssignmentSelectors() {
    const selector = document.getElementById('flic-editor-selector');
    if (!selector) return;

    const modes = notrufSettings.modes || [];

    // Erstelle die <option> Elemente
    let optionsHTML = '<option value="">Kein Modus zugewiesen</option>';
    modes.forEach(mode => {
        optionsHTML += `<option value="${mode.id}">${mode.title}</option>`;
    });

    selector.innerHTML = optionsHTML;
}

function updateFlicColumnDisplays() {
    const modes = notrufSettings.modes || [];
    const assignments = notrufSettings.flicAssignments || { einfach: null, doppel: null, halten: null };

    ['einfach', 'doppel', 'halten'].forEach(klickTyp => {
        const nameDisplay = document.getElementById(`flicDisplayModeName-${klickTyp}`);
        const descDisplay = document.getElementById(`flicDisplayModeDesc-${klickTyp}`); // <-- NEU
        if (!nameDisplay || !descDisplay) return; // <-- Geändert

        const assignedModeId = assignments[klickTyp];
        const assignedMode = modes.find(m => m.id === assignedModeId);

        if (assignedMode) {
            nameDisplay.textContent = assignedMode.title;
            nameDisplay.title = assignedMode.title;
            descDisplay.textContent = assignedMode.description || '(Keine Kurzbeschreibung)'; // <-- NEU
        } else {
            nameDisplay.textContent = 'Kein Modus';
            nameDisplay.title = 'Kein Modus';
            descDisplay.textContent = ''; // <-- NEU
        }
    });
}

function updateFlicEditorBox(klickTyp) {
    const modes = notrufSettings.modes || [];
    const assignments = notrufSettings.flicAssignments || { einfach: null, doppel: null, halten: null };

    const title = document.getElementById('flic-editor-title');
    const selector = document.getElementById('flic-editor-selector');
    const detailsDisplay = document.getElementById('flic-editor-details');

    if (!title || !selector || !detailsDisplay) return;

    const klickTypBezeichnung = klickTyp.toUpperCase();
    title.textContent = `Modus für KLICK: ${klickTypBezeichnung} ändern`;

    const assignedModeId = assignments[klickTyp];
    const selectedMode = modes.find(m => m.id === assignedModeId);

    // Setze den Dropdown auf den aktuell zugewiesenen Wert
    selector.value = assignedModeId ? assignedModeId : "";

    if (selectedMode) {
        // Modus ist zugewiesen -> Details anzeigen
        const config = selectedMode.config || {};
        const recipients = (config.userKeys || []).map(u => u.name).join(', ') || 'Niemand';
        detailsDisplay.innerHTML = `
            <strong class="block">Empfänger:</strong>
            <span class="block pl-2 mb-1">${recipients}</span>
            <strong class="block">Nachricht:</strong>
            <span class="block pl-2 mb-1">"${config.message || 'Keine'}"</span>
            <strong class="block">Prio:\u00A0${config.priority || 'N/A'}, Retry:\u00A0${config.retry || 'N/A'}s</strong>
        `;
    } else {
        // Kein Modus zugewiesen
        detailsDisplay.innerHTML = 'Kein Modus zugewiesen.';
    }
}

function updateFlicDisplay(klickTyp) {
    const modes = notrufSettings.modes || [];

    // Finde die UI-Elemente für die Spalte
    const selector = document.getElementById(`flicAssign${klickTyp.charAt(0).toUpperCase() + klickTyp.slice(1)}`);
    const nameDisplay = document.getElementById(`flicDisplayModeName-${klickTyp}`);
    const detailsDisplay = document.getElementById(`flicDisplayModeDetails-${klickTyp}`);

    if (!selector || !nameDisplay || !detailsDisplay) return; // Stellt sicher, dass alle Elemente da sind

    const selectedId = selector.value ? parseInt(selector.value) : null;
    const selectedMode = modes.find(m => m.id === selectedId);

    if (selectedMode) {
        // Modus ist zugewiesen
        nameDisplay.textContent = selectedMode.title;
        nameDisplay.title = selectedMode.title; // Für Tooltip, falls Text abgeschnitten wird

        // Detaillierte Einstellungen für die blaue Box
        const config = selectedMode.config || {};
        const recipients = (config.userKeys || []).map(u => u.name).join(', ') || 'Niemand';
        // HTML für die Details-Box, \u00A0 ist ein geschütztes Leerzeichen, um unschönen Umbruch zu verhindern
        detailsDisplay.innerHTML = `
            <strong class="block">Empfänger:</strong>
            <span class="block pl-2 mb-1">${recipients}</span>
            <strong class="block">Nachricht:</strong>
            <span class="block pl-2 mb-1">"${config.message || 'Keine'}"</span>
            <strong class="block">Prio:\u00A0${config.priority || 'N/A'}, Retry:\u00A0${config.retry || 'N/A'}s</strong>
        `;
    } else {
        // Kein Modus zugewiesen
        nameDisplay.textContent = 'Kein Modus';
        nameDisplay.title = 'Kein Modus';
        detailsDisplay.innerHTML = 'Kein Modus zugewiesen.';
    }
}

function renderModeEditorList() {
    const listContainer = document.getElementById('existingModesList');
    if (notrufSettings.modes.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Modi vorhanden.</p>';
        return;
    }
    listContainer.innerHTML = notrufSettings.modes.map(mode => `
        <div class="flex justify-between items-center p-2 bg-gray-50 rounded-md border">
            <div>
                <p class="font-semibold">${mode.title}</p>
                <p class="text-xs text-gray-500">${mode.description}</p>
            </div>
            <div class="flex gap-1">
                <button data-mode-id="${mode.id}" class="edit-mode-btn p-2 text-blue-500 hover:bg-blue-100 rounded-full" title="Bearbeiten">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.775a.75.75 0 0 0-.22.53l-.5 2.5a.75.75 0 0 0 .913.913l2.5-.5a.75.75 0 0 0 .53-.22l4.263-4.262a1.75 1.75 0 0 0 0-2.475Z" /><path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v9.5c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25V9.5a.75.75 0 0 1 1.5 0v5.25A2.75 2.75 0 0 1 14.25 18h-9.5A2.75 2.75 0 0 1 2 15.25v-9.5A2.75 2.75 0 0 1 4.75 3.5h5.25a.75.75 0 0 1 0 1.5H4.75Z" /></svg>
                 </button>
                 <button data-mode-id="${mode.id}" class="delete-mode-btn p-2 text-red-500 hover:bg-red-100 rounded-full" title="Löschen">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1H2V3Zm2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z" /></svg>
                 </button>
            </div>
        </div>
    `).join('');
}

function openModeConfigForm(modeId = null) {
    const formContainer = document.getElementById('modeConfigFormContainer');
    const formTitle = document.getElementById('modeConfigFormTitle');
    const editingModeIdInput = document.getElementById('editingModeId');
    const titleInput = document.getElementById('notrufModeTitle'); // Für Modus-Titel
    const descInput = document.getElementById('notrufModeDescInput');
    const pushoverTitleInput = document.getElementById('notrufTitle'); // Für Pushover-Titel
    const messageInput = document.getElementById('notrufMessage');
    const priorityButtons = document.querySelectorAll('#priority-buttons-container .priority-btn');
    // NEU: Referenzen für Retry-Input
    const retrySecondsInput = document.getElementById('retrySecondsInput');
    const retryCheckbox = document.getElementById('retryDeaktiviert');
    // -- Ende NEU --
    const apiTokenDisplay = document.getElementById('notrufApiTokenDisplay');
    const userKeyDisplay = document.getElementById('notrufUserKeyDisplay');
    const soundDisplay = document.getElementById('notrufSoundDisplay');

    // --- Standardwerte setzen & Felder leeren ---
    editingModeIdInput.value = '';
    titleInput.value = '';
    descInput.value = '';
    pushoverTitleInput.value = '';
    messageInput.value = '';
    apiTokenDisplay.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
    userKeyDisplay.innerHTML = '';
    soundDisplay.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
    tempSelectedApiTokenId = null;
    tempSelectedSoundId = null; // Standardmäßig null

    // Priorität zurücksetzen
    priorityButtons.forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
    const defaultPrioButton = document.querySelector('.priority-btn[data-priority="0"]');
    if (defaultPrioButton) defaultPrioButton.classList.add('bg-indigo-600', 'text-white');

    // NEU: Retry/Expire zurücksetzen
    retryCheckbox.checked = false;
    retrySecondsInput.value = 30;
    retrySecondsInput.disabled = false;
    // -- Ende NEU --

    if (modeId) {
        // --- Bearbeiten-Modus: Felder befüllen ---
        const modeToEdit = notrufSettings.modes.find(m => m.id == modeId);
        if (!modeToEdit) return;

        formTitle.textContent = 'Modus Bearbeiten';
        editingModeIdInput.value = modeId;
        titleInput.value = modeToEdit.title || '';
        descInput.value = modeToEdit.description || '';

        const config = modeToEdit.config || {};
        pushoverTitleInput.value = config.title || '';
        messageInput.value = config.message || '';

        // API Token anzeigen
        tempSelectedApiTokenId = config.selectedApiTokenId || null;
        const selectedToken = (notrufSettings.apiTokens || []).find(t => t.id === tempSelectedApiTokenId);
        if (selectedToken) {
            apiTokenDisplay.innerHTML = `<span class="api-token-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-token-id="${selectedToken.id}">${selectedToken.name}</span>`;
        } else {
            apiTokenDisplay.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
            tempSelectedApiTokenId = null;
        }

        // User Keys (Empfänger) anzeigen
        userKeyDisplay.innerHTML = '';
        (config.userKeys || []).forEach(contactRef => {
            const contact = (notrufSettings.contacts || []).find(c => c.id === contactRef.id);
            if (contact) {
                userKeyDisplay.innerHTML += `<span class="contact-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-contact-id="${contact.id}">${contact.name}</span>`;
            }
        });

        // Sound anzeigen
        tempSelectedSoundId = config.selectedSoundId === undefined ? null : config.selectedSoundId; // Explizit null, wenn nicht gesetzt
        const selectedSound = (notrufSettings.sounds || []).find(s => s.id === tempSelectedSoundId);
        if (selectedSound) {
            const displayName = selectedSound.useCustomName && selectedSound.customName ? selectedSound.customName : selectedSound.code;
            soundDisplay.innerHTML = `<span class="sound-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-sound-id="${selectedSound.id}">${displayName}</span>`;
        } else {
            soundDisplay.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
            tempSelectedSoundId = null;
        }

        // Priorität setzen
        priorityButtons.forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
        const prio = config.priority !== undefined ? config.priority : 0;
        const selectedPrioButton = document.querySelector(`.priority-btn[data-priority="${prio}"]`);
        if (selectedPrioButton) selectedPrioButton.classList.add('bg-indigo-600', 'text-white');

        // NEU: Retry/Expire setzen vom gespeicherten Wert
        const savedRetry = config.retry !== undefined ? config.retry : 30; // 'retry' statt 'retrySeconds'
        if (savedRetry === 0) {
            retryCheckbox.checked = true;
            retrySecondsInput.disabled = true;
            retrySecondsInput.value = 30; // Setze auf Minimum als Platzhalter
        } else {
            retryCheckbox.checked = false;
            retrySecondsInput.disabled = false;
            // Sicherstellen, dass der Wert im gültigen Bereich liegt
            retrySecondsInput.value = Math.max(30, Math.min(10800, savedRetry));
        }
        // -- Ende NEU --

    } else {
        // --- Neu-Anlegen-Modus ---
        formTitle.textContent = 'Neuen Modus Anlegen';
        // Felder wurden bereits oben zurückgesetzt
    }

    formContainer.classList.remove('hidden'); // Zeige das Formular an
}

function renderContactBook() {
    const list = document.getElementById('contactBookList');
    const contacts = notrufSettings.contacts || [];

    // Finde die aktuell im *Formular* angezeigten User Keys
    const currentFormUserKeys = [];
    document.querySelectorAll('#notrufUserKeyDisplay .contact-badge').forEach(badge => {
        currentFormUserKeys.push(parseInt(badge.dataset.contactId));
    });

    if (contacts.length === 0) {
        list.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Kontakte gefunden.</p>';
        return;
    }

    list.innerHTML = contacts.map(contact => {
        // Prüfe gegen die Keys im *Formular*
        const isChecked = currentFormUserKeys.includes(contact.id) ? 'checked' : '';
        return `
            <div class="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                <label class="flex items-center gap-3 cursor-pointer flex-grow">
                    <input type="checkbox" value="${contact.id}" class="h-4 w-4 contact-checkbox" ${isChecked}>
                    <div>
                        <span class="font-semibold text-gray-800">${contact.name}</span>
                        <p class="text-xs text-gray-500">${contact.type}: <span class="font-mono">${contact.key}</span></p>
                    </div>
                </label>
                <button data-contact-id="${contact.id}" class="delete-contact-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1H2V3Zm2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z" /></svg>
                </button>
            </div>
        `;
    }).join('');
}

function renderApiTokenBook() {
    const list = document.getElementById('apiTokenBookList');
    const tokens = notrufSettings.apiTokens || [];
    // 'tempSelectedApiTokenId' enthält die ID des Tokens, das gerade im Formular ausgewählt ist
    const currentlySelectedId = tempSelectedApiTokenId;

    if (tokens.length === 0) {
        list.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Tokens gefunden.</p>';
        return;
    }

    list.innerHTML = tokens.map(token => {
        const isChecked = token.id === currentlySelectedId ? 'checked' : '';
        return `
                    <div class="flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                        <label class="flex items-center gap-3 cursor-pointer flex-grow">
                            <input type="radio" name="apiTokenSelection" value="${token.id}" class="h-4 w-4 api-token-radio" ${isChecked}>
                            <div>
                                <span class="font-semibold text-gray-800">${token.name}</span>
                                <p class="text-xs text-gray-500 font-mono">${token.key.substring(0, 4)}...${token.key.substring(token.key.length - 4)}</p>
                            </div>
                        </label>
                        <button data-token-id="${token.id}" class="delete-api-token-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1H2V3Zm2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z" /></svg>
                        </button>
                    </div>
                    `;
    }).join('');
}

function renderSoundBook() {
    const list = document.getElementById('soundBookList');
    const sounds = notrufSettings.sounds || [];
    const currentlySelectedId = tempSelectedSoundId; // Kann null sein für Standard
    const placeholder = document.getElementById('sound-list-placeholder');

    // Entferne alte benutzerdefinierte Einträge (Standard-Option bleibt)
    list.querySelectorAll('.custom-sound-item').forEach(item => item.remove());

    if (sounds.length === 0) {
        if (placeholder) placeholder.classList.remove('hidden');
    } else {
        if (placeholder) placeholder.classList.add('hidden');
        let customSoundsHTML = '';
        sounds.forEach(sound => {
            // Wähle Radio aus, wenn seine ID mit der aktuell ausgewählten ID übereinstimmt
            const isChecked = sound.id === currentlySelectedId ? 'checked' : '';
            const displayName = sound.useCustomName && sound.customName ? sound.customName : sound.code;
            const displayCode = sound.useCustomName && sound.customName ? `(${sound.code})` : '';

            customSoundsHTML += `
                        <div class="custom-sound-item flex items-center justify-between p-2 hover:bg-gray-100 rounded-md">
                            <label class="flex items-center gap-3 cursor-pointer flex-grow">
                                <input type="radio" name="soundSelection" value="${sound.id}" class="h-4 w-4 sound-radio" ${isChecked}>
                                <div>
                                    <span class="font-semibold text-gray-800">${displayName}</span>
                                    <p class="text-xs text-gray-500 font-mono">${displayCode}</p>
                                </div>
                            </label>
                            <button data-sound-id="${sound.id}" class="delete-sound-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1H2V3Zm2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z" /></svg>
                            </button>
                        </div>
                        `;
        });
        // Füge die benutzerdefinierten Sounds nach der Standardoption ein
        list.insertAdjacentHTML('beforeend', customSoundsHTML);
    }

    // Stelle sicher, dass der Standard-Radio-Button ausgewählt ist, wenn currentlySelectedId null ist
    const defaultRadio = list.querySelector('input[name="soundSelection"][value="default"]');
    if (defaultRadio) {
        defaultRadio.checked = (currentlySelectedId === null);
    }
}
