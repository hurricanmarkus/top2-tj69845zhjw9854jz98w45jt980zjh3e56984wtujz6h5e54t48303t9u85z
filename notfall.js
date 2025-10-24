export const IFTTT_EVENT = 'NFC_Stick_Switchbot_Bauteil_2_Wohnungsanlage_oeffnen';
export const IFTTT_KEY = 'pECKM4iJ9sI_3ZF4DdYTzsH60p3cCg0yLbnPGzUFbFO';
export const IFTTT_URL = `https://maker.ifttt.com/trigger/${IFTTT_EVENT}/with/key/${IFTTT_KEY}`;

import { notrufSettings, notrufSettingsDocRef, alertUser, setButtonLoading } from './haupteingang.js'; // <-- NEU: notrufSettings importiert (ggf. auch andere benötigte Dinge wie alertUser, setButtonLoading, setDoc, notrufSettingsDocRef hinzufügen, falls sie in notfall.js verwendet werden)
import { setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js"; // <-- NEU: setDoc importieren, falls noch nicht geschehen

let activeFlicEditorKlickTyp = null;
let tempSelectedApiTokenId = null; // Für das Bearbeiten-Formular
let tempSelectedSoundId = null;    // Für das Bearbeiten-Formular

function updateFlicEditorDetails(selectedModeId) {
    const detailsDisplay = document.getElementById('flic-editor-details');
    if (!detailsDisplay) {
         console.error("updateFlicEditorDetails: Element #flic-editor-details nicht gefunden!");
         return;
    }
    // Greift auf das importierte notrufSettings zu
    const modes = notrufSettings.modes || [];
    // Finde den Modus anhand der ID
    const selectedMode = modes.find(m => m.id === selectedModeId);

     if (selectedMode) { // Wenn ein Modus ausgewählt ist
        const config = selectedMode.config || {};
        const recipients = (config.userKeys || []).map(u => u.name).join(', ') || 'Niemand';
        // Zeige Details des ausgewählten Modus an
        detailsDisplay.innerHTML = `
            <strong class="block">Empfänger:</strong>
            <span class="block pl-2 mb-1">${recipients}</span>
            <strong class="block">Nachricht:</strong>
            <span class="block pl-2 mb-1">"${config.message || 'Keine'}"</span>
            <strong class="block">Prio:\u00A0${config.priority ?? '0'}, Retry:\u00A0${config.retry ?? '0'}s</strong>`; // ?? für Default 0
    } else { // Wenn "Kein Modus zugewiesen" ausgewählt ist
        detailsDisplay.innerHTML = 'Kein Modus zugewiesen.';
    }
}

export function initializeNotrufSettingsView() {
    const notrufView = document.getElementById('notrufSettingsView'); // <-- Holt sich das Element selbst
    if (!notrufView) {
        console.error("initializeNotrufSettingsView: Element #notrufSettingsView nicht gefunden!");
        return;
    }
    console.log("initializeNotrufSettingsView: Wird ausgeführt und setzt Listener...");

    activeFlicEditorKlickTyp = null; // Aktiven Klick-Typ zurücksetzen

    // --- Initialen UI-Zustand setzen ---
    const editorContainer = document.getElementById('flic-details-editor-container');
    if (editorContainer) editorContainer.classList.add('hidden');

    populateFlicAssignmentSelectors(); // Editor-Dropdown befüllen
    updateFlicColumnDisplays(); // 3 Spalten befüllen

    notrufView.querySelectorAll('.flic-column-block').forEach(col => { // Hervorhebungen entfernen
        col.classList.remove('bg-indigo-100', 'border-indigo-400');
        col.classList.add('bg-gray-50', 'border-gray-200');
    });

    const modeEditorArea = document.getElementById('modeEditorArea');
    const modeConfigFormContainer = document.getElementById('modeConfigFormContainer');
    if (modeEditorArea) modeEditorArea.classList.add('hidden');
    if (modeConfigFormContainer) modeConfigFormContainer.classList.add('hidden');

    const assignmentCard = notrufView.querySelector('#card-flic-notruf .card');
    if (assignmentCard) assignmentCard.classList.remove('hidden');

    // --- Event Listener HIER hinzufügen ---

    // Listener für das Tab-Menü (Notruf vs. App)
    const tabsContainer = notrufView.querySelector('#notruf-settings-tabs');
    if (tabsContainer && !tabsContainer.dataset.tabListenerAttached) {
        tabsContainer.addEventListener('click', (e) => {
            const clickedTab = e.target.closest('.settings-tab-btn');
            if (!clickedTab) return;
            const targetCardId = clickedTab.dataset.targetCard;
            const prompt = document.getElementById('notruf-prompt');
            const isAlreadyActive = clickedTab.classList.contains('bg-white');

            tabsContainer.querySelectorAll('.settings-tab-btn').forEach(tab => {
                tab.classList.remove('bg-white', 'shadow', 'text-indigo-600');
                tab.classList.add('text-gray-600');
            });
            notrufView.querySelectorAll('.notruf-settings-card').forEach(card => card.classList.add('hidden'));

            if (isAlreadyActive) {
                if (prompt) prompt.style.display = 'block';
            } else {
                if (prompt) prompt.style.display = 'none';
                clickedTab.classList.add('bg-white', 'shadow', 'text-indigo-600');
                clickedTab.classList.remove('text-gray-600');
                const targetCard = document.getElementById(targetCardId);
                if (targetCard) {
                    targetCard.classList.remove('hidden');
                    if (targetCardId === 'card-flic-notruf') {
                         if(modeEditorArea) modeEditorArea.classList.add('hidden');
                         if(assignmentCard) assignmentCard.classList.remove('hidden');
                    }
                }
            }
        });
        tabsContainer.dataset.tabListenerAttached = 'true';
    }

    // Listener für den Flic-Button Tab-Inhalt (Zuweisungsbereich + Editor-Logik)
    const flicCard = document.getElementById('card-flic-notruf');
    if (flicCard && !flicCard.dataset.flicListenerAttached) {

        // --- Listener für den EINEN Editor-Dropdown ---
        const editorSelector = document.getElementById('flic-editor-selector');
        if (editorSelector && !editorSelector.dataset.changeListenerAttached) {
            editorSelector.addEventListener('change', (e) => {
                if (!activeFlicEditorKlickTyp) return;
                const newModeId = e.target.value ? parseInt(e.target.value) : null;
                updateFlicEditorDetails(newModeId);
            });
            editorSelector.dataset.changeListenerAttached = 'true';
        }

        // --- Haupt-Click-Listener für die gesamte Flic-Karte ---
        flicCard.addEventListener('click', async (e) => {
            const editorContainer = document.getElementById('flic-details-editor-container');
            const modeEditorArea = document.getElementById('modeEditorArea');
            const assignmentAreaContainer = flicCard.querySelector('.card');

            // --- Logik für Klick auf eine der 3 Spalten ---
            const clickedColumn = e.target.closest('.flic-column-block');
            if (clickedColumn && editorContainer) {
                const klickTyp = clickedColumn.dataset.klickTyp;
                flicCard.querySelectorAll('.flic-column-block').forEach(col => {
                    col.classList.remove('bg-indigo-100', 'border-indigo-400');
                    col.classList.add('bg-gray-50', 'border-gray-200');
                });
                if (klickTyp === activeFlicEditorKlickTyp) {
                    editorContainer.classList.add('hidden');
                    activeFlicEditorKlickTyp = null;
                } else {
                    activeFlicEditorKlickTyp = klickTyp;
                    updateFlicEditorBox(klickTyp);
                    editorContainer.classList.remove('hidden');
                    clickedColumn.classList.add('bg-indigo-100', 'border-indigo-400');
                    clickedColumn.classList.remove('bg-gray-50', 'border-gray-200');
                }
                return;
            }

            // --- Logik für "Zuweisungen Speichern" Button ---
            const saveBtn = e.target.closest('#saveFlicAssignmentsBtn');
            if (saveBtn && editorContainer && notrufSettingsDocRef) {
                setButtonLoading(saveBtn, true);
                if (!activeFlicEditorKlickTyp) { setButtonLoading(saveBtn, false); return; }
                const selector = document.getElementById('flic-editor-selector');
                const newModeId = selector ? (selector.value ? parseInt(selector.value) : null) : null;
                if (!notrufSettings.flicAssignments) notrufSettings.flicAssignments = {};
                notrufSettings.flicAssignments[activeFlicEditorKlickTyp] = newModeId;
                try {
                    await setDoc(notrufSettingsDocRef, notrufSettings);
                    alertUser('Flic-Zuweisungen gespeichert!', 'success');
                    updateFlicColumnDisplays();
                    editorContainer.classList.add('hidden');
                    activeFlicEditorKlickTyp = null;
                    flicCard.querySelectorAll('.flic-column-block').forEach(col => {
                        col.classList.remove('bg-indigo-100', 'border-indigo-400');
                        col.classList.add('bg-gray-50', 'border-gray-200');
                    });
                } catch (err) {
                    console.error("Fehler beim Speichern der Flic-Zuweisungen:", err);
                    alertUser('Fehler beim Speichern.', 'error');
                } finally {
                    setButtonLoading(saveBtn, false);
                }
                return;
            }

            // --- Listener für den "Modi Verwalten" Editor ---
            if (e.target.closest('#notrufOpenModeEditor')) {
                if (assignmentAreaContainer) assignmentAreaContainer.classList.add('hidden');
                if (editorContainer) editorContainer.classList.add('hidden');
                if (modeEditorArea) modeEditorArea.classList.remove('hidden');
                activeFlicEditorKlickTyp = null;
                flicCard.querySelectorAll('.flic-column-block').forEach(col => {
                    col.classList.remove('bg-indigo-100', 'border-indigo-400');
                    col.classList.add('bg-gray-50', 'border-gray-200');
                });
                renderModeEditorList();
                const modeConfigForm = document.getElementById('modeConfigFormContainer');
                if(modeConfigForm) modeConfigForm.classList.add('hidden');
                return;
            }

            // Nur reagieren, wenn Klick im Modi-Editor-Bereich war
            if (modeEditorArea && modeEditorArea.contains(e.target)) {
                if (e.target.closest('#notrufCloseModeEditor')) {
                    modeEditorArea.classList.add('hidden');
                    if (assignmentAreaContainer) assignmentAreaContainer.classList.remove('hidden');
                    const modeConfigForm = document.getElementById('modeConfigFormContainer');
                    if(modeConfigForm) modeConfigForm.classList.add('hidden');
                    return;
                }
                if (e.target.closest('#notrufAddNewModeButton')) {
                    openModeConfigForm(); return;
                }
                const editBtn = e.target.closest('.edit-mode-btn');
                if (editBtn && editBtn.dataset.modeId) {
                    openModeConfigForm(editBtn.dataset.modeId); return;
                }
                const deleteBtn = e.target.closest('.delete-mode-btn');
                if (deleteBtn && deleteBtn.dataset.modeId) {
                    const modeIdToDelete = parseInt(deleteBtn.dataset.modeId);
                    if (isNaN(modeIdToDelete)) return;
                    const modeToDelete = (notrufSettings.modes || []).find(m => m.id === modeIdToDelete);
                    if (!modeToDelete) return;
                    const confirmation = prompt(`Um den Modus "${modeToDelete.title}" unwiderruflich zu löschen, geben Sie bitte "MODI LÖSCHEN" ein:`);
                    if (confirmation === 'MODI LÖSCHEN' && notrufSettingsDocRef) {
                        notrufSettings.modes = (notrufSettings.modes || []).filter(m => m.id !== modeIdToDelete);
                        if (notrufSettings.flicAssignments) {
                            for (const klick in notrufSettings.flicAssignments) {
                                if (notrufSettings.flicAssignments[klick] === modeIdToDelete) {
                                    notrufSettings.flicAssignments[klick] = null;
                                }
                            }
                        }
                        try {
                             await setDoc(notrufSettingsDocRef, notrufSettings);
                             alertUser('Modus gelöscht!', 'success');
                             renderModeEditorList();
                             populateFlicAssignmentSelectors();
                             updateFlicColumnDisplays();
                             if (activeFlicEditorKlickTyp) { updateFlicEditorBox(activeFlicEditorKlickTyp); }
                        } catch(err) {
                             console.error("Fehler beim Löschen des Modus:", err);
                             alertUser('Fehler beim Löschen.', 'error');
                        }
                    } else if (confirmation !== null) {
                        alertUser('Löschvorgang abgebrochen.', 'info');
                    }
                    return;
                }
                const cancelEditBtn = e.target.closest('#notrufCancelEditModeButton');
                 if(cancelEditBtn){
                     const modeConfigForm = document.getElementById('modeConfigFormContainer');
                     if(modeConfigForm) modeConfigForm.classList.add('hidden');
                     tempSelectedApiTokenId = null;
                     tempSelectedSoundId = null;
                     return;
                 }

                 // --- Listener für Modals und Speichern innerhalb des Konfig-Formulars ---
                 const configForm = document.getElementById('modeConfigFormContainer');
                 if (configForm && configForm.contains(e.target)) {
                     if (e.target.closest('#notrufOpenContactBook')) {
                         renderContactBook();
                         const modal = document.getElementById('contactBookModal');
                         if (modal) modal.style.display = 'flex';
                         return;
                     }
                     if (e.target.closest('#notrufOpenApiTokenBook')) {
                         renderApiTokenBook();
                         const modal = document.getElementById('apiTokenBookModal');
                         if (modal) modal.style.display = 'flex';
                         return;
                     }
                     if (e.target.closest('#notrufOpenSoundBook')) {
                         renderSoundBook();
                         const modal = document.getElementById('soundBookModal');
                         if (modal) modal.style.display = 'flex';
                         return;
                     }
                     const prioBtn = e.target.closest('.priority-btn');
                     if (prioBtn) {
                         configForm.querySelectorAll('.priority-btn').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
                         prioBtn.classList.add('bg-indigo-600', 'text-white');
                         return;
                     }
                     if (e.target.closest('#notrufSaveModeButton')) {
                         await saveNotrufMode();
                         return;
                     }
                 }
            } // Ende if (modeEditorArea...)
        }); // Ende Haupt-Click-Listener flicCard
        flicCard.dataset.flicListenerAttached = 'true';
    } // Ende if (flicCard...)

    // --- Listener für Retry Checkbox ---
    const configArea = document.getElementById('notrufConfigArea'); // Holen wir uns hier
    const retryCheckbox = document.getElementById('retryDeaktiviert');
    const retrySecondsInput = document.getElementById('retrySecondsInput');
    // Stelle sicher, dass der Listener nur einmal hinzugefügt wird
    if (configArea && retryCheckbox && retrySecondsInput && !configArea.dataset.retryListenerAttached) {
        retryCheckbox.addEventListener('change', (e) => {
            const isDisabled = e.target.checked;
            retrySecondsInput.disabled = isDisabled;
            if (isDisabled) {
                // retrySecondsInput.value = 30; // Optional zurücksetzen
            } else {
                if (parseInt(retrySecondsInput.value) < 30) {
                    retrySecondsInput.value = 30;
                }
            }
        });
        configArea.dataset.retryListenerAttached = 'true'; // Markieren
    }

    console.log("initializeNotrufSettingsView: Alle Listener hinzugefügt.");

const contactModal = document.getElementById('contactBookModal');
    if (contactModal && !contactModal.dataset.listenerAttached) {
        console.log("Füge Listener für contactModal hinzu."); // DEBUG LOG
        contactModal.addEventListener('click', async (e) => {
            console.log("Klick im contactModal erkannt!", e.target); // DEBUG LOG
            // Modal schließen
            if (e.target.closest('#contactBookCloseButton')) {
                contactModal.style.display = 'none';
            }
            // Kontakt hinzufügen
            if (e.target.closest('#contactAddButton')) {
                const typeInput = document.getElementById('contactIsGroup');
                const nameInput = document.getElementById('contactName');
                const keyInput = document.getElementById('contactUserKey');
                if (!typeInput || !nameInput || !keyInput) return;
                const type = typeInput.value;
                const name = nameInput.value.trim();
                const key = keyInput.value.trim();
                if (type && name && key && notrufSettingsDocRef) {
                    if (!notrufSettings.contacts) notrufSettings.contacts = [];
                    notrufSettings.contacts.push({ id: Date.now(), type, name, key });
                    try {
                        await setDoc(notrufSettingsDocRef, notrufSettings);
                        typeInput.value = 'User';
                        nameInput.value = '';
                        keyInput.value = '';
                    } catch (err) {
                        console.error("Fehler beim Speichern des Kontakts:", err);
                        alertUser('Fehler beim Speichern des Kontakts.', 'error');
                    }
                } else {
                    if (!notrufSettingsDocRef) console.error("Kontakt hinzufügen: notrufSettingsDocRef ist nicht definiert!");
                    alertUser('Bitte alle Felder für den Kontakt ausfüllen.', 'error');
                }
            }
            // Kontakt löschen
            const deleteContactBtn = e.target.closest('.delete-contact-btn');
            if (deleteContactBtn) {
                const contactId = parseInt(deleteContactBtn.dataset.contactId);
                if (isNaN(contactId)) return;
                if (confirm('Möchten Sie diesen Kontakt wirklich löschen?') && notrufSettingsDocRef) {
                    notrufSettings.contacts = (notrufSettings.contacts || []).filter(c => c.id !== contactId);
                    (notrufSettings.modes || []).forEach(mode => {
                        if (mode.config && mode.config.userKeys) {
                            mode.config.userKeys = mode.config.userKeys.filter(uk => uk.id !== contactId);
                        }
                    });
                    const badgeToRemove = document.querySelector(`#notrufUserKeyDisplay .contact-badge[data-contact-id="${contactId}"]`);
                    if (badgeToRemove) badgeToRemove.remove();
                    try {
                        await setDoc(notrufSettingsDocRef, notrufSettings);
                    } catch (err) {
                        console.error("Fehler beim Löschen des Kontakts:", err);
                        alertUser('Fehler beim Löschen des Kontakts.', 'error');
                    }
                }
            }
            // Auswahl übernehmen
            if (e.target.closest('#contactBookApplyButton')) {
                const displayArea = document.getElementById('notrufUserKeyDisplay');
                if (displayArea) {
                    displayArea.innerHTML = '';
                    contactModal.querySelectorAll('.contact-checkbox:checked').forEach(cb => {
                        const contactId = parseInt(cb.value);
                        if (isNaN(contactId)) return;
                        const contact = (notrufSettings.contacts || []).find(c => c.id === contactId);
                        if (contact) {
                            displayArea.innerHTML += `<span class="contact-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-contact-id="${contact.id}">${contact.name}</span>`;
                        }
                    });
                }
                contactModal.style.display = 'none';
            }
        });
        contactModal.dataset.listenerAttached = 'true';
    } else if (!contactModal) {
        console.error("Kontaktbuch-Modal (#contactBookModal) nicht gefunden!");
    } else {
        console.log("Listener für contactModal bereits vorhanden.");
    }

    // Listener für das API-Token-Modal
    const apiTokenModal = document.getElementById('apiTokenBookModal');
    if (apiTokenModal && !apiTokenModal.dataset.listenerAttached) {
        console.log("Füge Listener für apiTokenModal hinzu."); // DEBUG LOG
        apiTokenModal.addEventListener('click', async (e) => {
            console.log("Klick im apiTokenModal erkannt!", e.target); // DEBUG LOG
            // Modal schließen
            if (e.target.closest('#apiTokenBookCloseButton')) {
                apiTokenModal.style.display = 'none';
            }
            // Token hinzufügen
            if (e.target.closest('#apiTokenAddButton')) {
                const nameInput = document.getElementById('apiTokenName');
                const keyInput = document.getElementById('apiTokenKey');
                if (!nameInput || !keyInput) return;
                const name = nameInput.value.trim();
                const key = keyInput.value.trim();
                if (name && key && notrufSettingsDocRef) {
                    if (!notrufSettings.apiTokens) notrufSettings.apiTokens = [];
                    notrufSettings.apiTokens.push({ id: Date.now(), name, key });
                    try {
                        await setDoc(notrufSettingsDocRef, notrufSettings);
                        nameInput.value = '';
                        keyInput.value = '';
                    } catch (err) {
                        console.error("Fehler beim Speichern des Tokens:", err);
                        alertUser('Fehler beim Speichern des Tokens.', 'error');
                    }
                } else {
                    if (!notrufSettingsDocRef) console.error("Token hinzufügen: notrufSettingsDocRef ist nicht definiert!");
                    alertUser('Bitte Bezeichnung und Key ausfüllen.', 'error');
                }
            }
            // Token löschen
            const deleteTokenBtn = e.target.closest('.delete-api-token-btn');
            if (deleteTokenBtn) {
                const tokenId = parseInt(deleteTokenBtn.dataset.tokenId);
                if (isNaN(tokenId)) return;
                if (confirm('Möchten Sie diesen API-Token wirklich löschen?') && notrufSettingsDocRef) {
                    notrufSettings.apiTokens = (notrufSettings.apiTokens || []).filter(t => t.id !== tokenId);
                    (notrufSettings.modes || []).forEach(mode => {
                        if (mode.config && mode.config.selectedApiTokenId === tokenId) {
                            mode.config.selectedApiTokenId = null;
                        }
                    });
                    if (tempSelectedApiTokenId === tokenId) {
                        tempSelectedApiTokenId = null;
                        const display = document.getElementById('notrufApiTokenDisplay');
                        if (display) display.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
                    }
                    try {
                        await setDoc(notrufSettingsDocRef, notrufSettings);
                    } catch (err) {
                        console.error("Fehler beim Löschen des Tokens:", err);
                        alertUser('Fehler beim Löschen des Tokens.', 'error');
                    }
                }
            }
            // Auswahl übernehmen
            if (e.target.closest('#apiTokenBookApplyButton')) {
                const selectedRadio = apiTokenModal.querySelector('.api-token-radio:checked');
                const displayArea = document.getElementById('notrufApiTokenDisplay');
                if (displayArea) {
                    if (selectedRadio) {
                        const tokenId = parseInt(selectedRadio.value);
                        if (isNaN(tokenId)) {
                            tempSelectedApiTokenId = null;
                            displayArea.innerHTML = '<span class="text-gray-400 italic">Ungültige Auswahl</span>';
                        } else {
                            const token = (notrufSettings.apiTokens || []).find(t => t.id === tokenId);
                            if (token) {
                                tempSelectedApiTokenId = tokenId;
                                displayArea.innerHTML = `<span class="api-token-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-token-id="${token.id}">${token.name}</span>`;
                            } else {
                                tempSelectedApiTokenId = null;
                                displayArea.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
                            }
                        }
                    } else {
                        tempSelectedApiTokenId = null;
                        displayArea.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
                    }
                }
                apiTokenModal.style.display = 'none';
            }
        });
        apiTokenModal.dataset.listenerAttached = 'true';
    } else if (!apiTokenModal) {
        console.error("API-Token-Modal (#apiTokenBookModal) nicht gefunden!");
    } else {
        console.log("Listener für apiTokenModal bereits vorhanden.");
    }

    // Listener für das Soundbuch-Modal
    const soundModal = document.getElementById('soundBookModal');
    if (soundModal && !soundModal.dataset.listenerAttached) {
        console.log("Füge Listener für soundModal hinzu."); // DEBUG LOG
        // Listener für Checkbox "Eigenen Namen verwenden"
        const useCustomNameCheckbox = soundModal.querySelector('#soundUseCustomName');
        const customNameInput = soundModal.querySelector('#soundCustomName');
        if (useCustomNameCheckbox && customNameInput && !useCustomNameCheckbox.dataset.changeListenerAttached) {
            useCustomNameCheckbox.addEventListener('change', (e) => {
                customNameInput.classList.toggle('hidden', !e.target.checked);
                if (!e.target.checked) customNameInput.value = '';
            });
            useCustomNameCheckbox.dataset.changeListenerAttached = 'true';
        }

        // Haupt-Click-Listener für das Modal
        soundModal.addEventListener('click', async (e) => {
            console.log("Klick im soundModal erkannt!", e.target); // DEBUG LOG
            // Modal schließen
            if (e.target.closest('#soundBookCloseButton')) {
                soundModal.style.display = 'none';
            }
            // Sound hinzufügen
            if (e.target.closest('#soundAddButton')) {
                const codeInput = document.getElementById('soundCode');
                const customNameInput = document.getElementById('soundCustomName');
                const useCustomCheckbox = document.getElementById('soundUseCustomName');
                if (!codeInput || !useCustomCheckbox || !customNameInput) return;
                const code = codeInput.value.trim();
                const useCustom = useCustomCheckbox.checked;
                const customName = customNameInput.value.trim();
                if (code && (!useCustom || (useCustom && customName)) && notrufSettingsDocRef) {
                    if (!notrufSettings.sounds) notrufSettings.sounds = [];
                    notrufSettings.sounds.push({ id: Date.now(), code, useCustomName: useCustom, customName: useCustom ? customName : null });
                    try {
                        await setDoc(notrufSettingsDocRef, notrufSettings);
                        codeInput.value = '';
                        useCustomCheckbox.checked = false;
                        customNameInput.value = '';
                        customNameInput.classList.add('hidden');
                    } catch (err) {
                        console.error("Fehler beim Speichern des Sounds:", err);
                        alertUser('Fehler beim Speichern des Sounds.', 'error');
                    }
                } else {
                    if (!notrufSettingsDocRef) console.error("Sound hinzufügen: notrufSettingsDocRef ist nicht definiert!");
                    alertUser('Bitte Soundcode und ggf. eigenen Namen ausfüllen.', 'error');
                }
            }
            // Sound löschen
            const deleteSoundBtn = e.target.closest('.delete-sound-btn');
            if (deleteSoundBtn) {
                const soundId = parseInt(deleteSoundBtn.dataset.soundId);
                if (isNaN(soundId)) return;
                if (confirm('Möchten Sie diesen Sound wirklich löschen?') && notrufSettingsDocRef) {
                    notrufSettings.sounds = (notrufSettings.sounds || []).filter(s => s.id !== soundId);
                    (notrufSettings.modes || []).forEach(mode => {
                        if (mode.config && mode.config.selectedSoundId === soundId) {
                            mode.config.selectedSoundId = null;
                        }
                    });
                    if (tempSelectedSoundId === soundId) {
                        tempSelectedSoundId = null;
                        const display = document.getElementById('notrufSoundDisplay');
                        if (display) display.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
                    }
                    try {
                        await setDoc(notrufSettingsDocRef, notrufSettings);
                    } catch (err) {
                        console.error("Fehler beim Löschen des Sounds:", err);
                        alertUser('Fehler beim Löschen des Sounds.', 'error');
                    }
                }
            }
            // Auswahl übernehmen
            if (e.target.closest('#soundBookApplyButton')) {
                const selectedRadio = soundModal.querySelector('.sound-radio:checked');
                const displayArea = document.getElementById('notrufSoundDisplay');
                if (displayArea) {
                    if (selectedRadio && selectedRadio.value !== 'default') {
                        const soundId = parseInt(selectedRadio.value);
                        if (isNaN(soundId)) {
                            tempSelectedSoundId = null;
                            displayArea.innerHTML = '<span class="text-gray-400 italic">Ungültige Auswahl</span>';
                        } else {
                            const sound = (notrufSettings.sounds || []).find(s => s.id === soundId);
                            if (sound) {
                                tempSelectedSoundId = soundId;
                                const displayName = sound.useCustomName && sound.customName ? sound.customName : sound.code;
                                displayArea.innerHTML = `<span class="sound-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-sound-id="${sound.id}">${displayName}</span>`;
                            } else {
                                tempSelectedSoundId = null;
                                displayArea.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
                            }
                        }
                    } else {
                        tempSelectedSoundId = null;
                        displayArea.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
                    }
                }
                soundModal.style.display = 'none';
            }
        });
        soundModal.dataset.listenerAttached = 'true';
    } else if (!soundModal) {
        console.error("Soundbuch-Modal (#soundBookModal) nicht gefunden!");
    } else {
        console.log("Listener für soundModal bereits vorhanden.");
    }
    }
// === Restliche Hilfsfunktionen für Notruf (populateFlicAssignmentSelectors, updateFlicColumnDisplays, etc.) bleiben unverändert HIER in notfall.js ===
// ... (füge hier die Definitionen für populateFlicAssignmentSelectors, updateFlicColumnDisplays, updateFlicEditorDetails, updateFlicEditorBox, renderModeEditorList, openModeConfigForm, saveNotrufMode, renderContactBook, renderApiTokenBook, renderSoundBook ein, wie sie in der vorherigen Antwort standen) ...

// Beispielhaft hier eine der Funktionen (die anderen müssen auch hier rein!)
// (updateFlicColumnDisplays, updateFlicEditorDetails, updateFlicEditorBox, renderModeEditorList, openModeConfigForm, saveNotrufMode, renderContactBook, renderApiTokenBook, renderSoundBook)
function populateFlicAssignmentSelectors() {
    const selector = document.getElementById('flic-editor-selector');
    if (!selector) return;
    const modes = notrufSettings.modes || [];
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
