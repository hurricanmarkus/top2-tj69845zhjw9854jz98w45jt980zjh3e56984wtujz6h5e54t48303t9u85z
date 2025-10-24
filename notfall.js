// In notfall.js
const IFTTT_EVENT = 'NFC_Stick_Switchbot_Bauteil_2_Wohnungsanlage_oeffnen';
const IFTTT_KEY = 'pECKM4iJ9sI_3ZF4DdYTzsH60p3cCg0yLbnPGzUFbFO';
export const IFTTT_URL = `https://maker.ifttt.com/trigger/${IFTTT_EVENT}/with/key/${IFTTT_KEY}`; // Exportieren für haupteingang.js

// === WICHTIGE IMPORTE ===
import { notrufSettings, notrufSettingsDocRef, alertUser, setButtonLoading } from './haupteingang.js';
import { setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// === ENDE IMPORTE ===

let activeFlicEditorKlickTyp = null;
let tempSelectedApiTokenId = null; // Für das Bearbeiten-Formular (Modus Editor)
let tempSelectedSoundId = null;    // Für das Bearbeiten-Formular (Modus Editor)

export function initializeNotrufSettingsView() {
    const notrufView = document.getElementById('notrufSettingsView');
    if (!notrufView) {
        console.error("initializeNotrufSettingsView: Element #notrufSettingsView nicht gefunden!");
        return;
    }
    console.log("initializeNotrufSettingsView: Wird ausgeführt..."); // Debugging

    activeFlicEditorKlickTyp = null; // Aktiven Klick-Typ zurücksetzen

    // UI-Zustände initial setzen
    const editorContainer = document.getElementById('flic-details-editor-container');
    if (editorContainer) editorContainer.classList.add('hidden'); // Editor-Box verstecken

    populateFlicAssignmentSelectors(); // Den einen Editor-Dropdown befüllen
    updateFlicColumnDisplays(); // Die 3 Spalten mit den Modus-Namen befüllen

    // Alle Spalten-Hervorhebungen entfernen
    notrufView.querySelectorAll('.flic-column-block').forEach(col => {
        col.classList.remove('bg-indigo-100', 'border-indigo-400');
        col.classList.add('bg-gray-50', 'border-gray-200');
    });

    // Editor-Bereiche standardmäßig verstecken
    const modeEditorArea = document.getElementById('modeEditorArea');
    const modeConfigFormContainer = document.getElementById('modeConfigFormContainer');
    if (modeEditorArea) modeEditorArea.classList.add('hidden');
    if (modeConfigFormContainer) modeConfigFormContainer.classList.add('hidden');

    // Sicherstellen, dass die Zuweisungskarte (die obere) sichtbar ist
    const assignmentCard = notrufView.querySelector('#card-flic-notruf .card');
    if (assignmentCard) assignmentCard.classList.remove('hidden');

    // --- Event Listener HIER hinzufügen (statt in haupteingang.js) ---

    // Listener für das Tab-Menü (Notruf vs. App)
    const tabsContainer = notrufView.querySelector('#notruf-settings-tabs');
    if (tabsContainer && !tabsContainer.dataset.tabListenerAttached) { // Verhindert doppelte Listener
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
                if (prompt) prompt.style.display = 'block'; // Sicherer Zugriff
            } else {
                if (prompt) prompt.style.display = 'none'; // Sicherer Zugriff
                clickedTab.classList.add('bg-white', 'shadow', 'text-indigo-600');
                clickedTab.classList.remove('text-gray-600');
                const targetCard = document.getElementById(targetCardId);
                if (targetCard) {
                    targetCard.classList.remove('hidden');
                    // Ggf. Logik beim Aktivieren des Flic-Tabs ausführen
                    if (targetCardId === 'card-flic-notruf') {
                         if(modeEditorArea) modeEditorArea.classList.add('hidden'); // Sicherer Zugriff
                         if(assignmentCard) assignmentCard.classList.remove('hidden'); // Sicherer Zugriff
                         // Hier könnte man populateFlicAssignmentSelectors() etc. aufrufen, wenn nötig
                    }
                }
            }
        });
        tabsContainer.dataset.tabListenerAttached = 'true';
    }

    // Listener für den Flic-Button Tab-Inhalt (Zuweisungsbereich + Editor-Logik)
    const flicCard = document.getElementById('card-flic-notruf');
    if (flicCard && !flicCard.dataset.flicListenerAttached) { // Verhindert doppelte Listener

        // --- Listener für den EINEN Editor-Dropdown ---
        const editorSelector = document.getElementById('flic-editor-selector');
        if (editorSelector && !editorSelector.dataset.changeListenerAttached) { // Verhindert doppelte Listener
            editorSelector.addEventListener('change', (e) => {
                if (!activeFlicEditorKlickTyp) return; // Nur wenn eine Box aktiv ist
                const newModeId = e.target.value ? parseInt(e.target.value) : null;
                updateFlicEditorDetails(newModeId); // Eigene Funktion zum Aktualisieren der Details
            });
            editorSelector.dataset.changeListenerAttached = 'true';
        }

        // --- Haupt-Click-Listener für die gesamte Flic-Karte ---
        flicCard.addEventListener('click', async (e) => { // Async für setDoc
            const editorContainer = document.getElementById('flic-details-editor-container');
            const modeEditorArea = document.getElementById('modeEditorArea'); // Referenz holen
            const assignmentAreaContainer = flicCard.querySelector('.card'); // Die obere Karte

            // --- Logik für Klick auf eine der 3 Spalten ---
            const clickedColumn = e.target.closest('.flic-column-block');
            if (clickedColumn && editorContainer) { // Stelle sicher, dass editorContainer existiert
                const klickTyp = clickedColumn.dataset.klickTyp;

                // Alle Spalten-Hervorhebungen entfernen
                flicCard.querySelectorAll('.flic-column-block').forEach(col => {
                    col.classList.remove('bg-indigo-100', 'border-indigo-400');
                    col.classList.add('bg-gray-50', 'border-gray-200');
                });

                if (klickTyp === activeFlicEditorKlickTyp) {
                    // Fall 1: Aktive Spalte erneut geklickt -> Schließen
                    editorContainer.classList.add('hidden');
                    activeFlicEditorKlickTyp = null;
                } else {
                    // Fall 2: Neue Spalte geklickt -> Öffnen/Wechseln
                    activeFlicEditorKlickTyp = klickTyp;
                    updateFlicEditorBox(klickTyp); // Füllt Editor mit aktuellen Daten
                    editorContainer.classList.remove('hidden');
                    // Geklickte Spalte hervorheben
                    clickedColumn.classList.add('bg-indigo-100', 'border-indigo-400');
                    clickedColumn.classList.remove('bg-gray-50', 'border-gray-200');
                }
                return; // Klick verarbeitet
            }

            // --- Logik für "Zuweisungen Speichern" Button ---
            const saveBtn = e.target.closest('#saveFlicAssignmentsBtn');
            if (saveBtn && editorContainer && notrufSettingsDocRef) { // Stelle sicher, dass Elemente/Refs existieren
                setButtonLoading(saveBtn, true);

                if (!activeFlicEditorKlickTyp) {
                    setButtonLoading(saveBtn, false); return;
                }
                const selector = document.getElementById('flic-editor-selector');
                const newModeId = selector ? (selector.value ? parseInt(selector.value) : null) : null;

                if (!notrufSettings.flicAssignments) notrufSettings.flicAssignments = {};
                notrufSettings.flicAssignments[activeFlicEditorKlickTyp] = newModeId;

                try {
                    await setDoc(notrufSettingsDocRef, notrufSettings);
                    alertUser('Flic-Zuweisungen erfolgreich gespeichert!', 'success');
                    updateFlicColumnDisplays(); // Spalten-Anzeige aktualisieren
                    editorContainer.classList.add('hidden'); // Editor schließen
                    activeFlicEditorKlickTyp = null;
                    flicCard.querySelectorAll('.flic-column-block').forEach(col => {
                        col.classList.remove('bg-indigo-100', 'border-indigo-400');
                        col.classList.add('bg-gray-50', 'border-gray-200');
                    });
                } catch (err) {
                    console.error("Fehler beim Speichern der Flic-Zuweisungen:", err);
                    alertUser('Fehler beim Speichern der Zuweisungen.', 'error');
                } finally {
                    setButtonLoading(saveBtn, false);
                }
                return; // Klick verarbeitet
            }

            // --- Listener für den "Modi Verwalten" Editor ---
            // "Modi Verwalten" Button -> Zeigt den Modus-Editor an
            if (e.target.closest('#notrufOpenModeEditor')) {
                if (assignmentAreaContainer) assignmentAreaContainer.classList.add('hidden'); // Versteckt Zuweisungs-Karte
                if (editorContainer) editorContainer.classList.add('hidden'); // Versteckt Details-Editor, falls offen
                if (modeEditorArea) modeEditorArea.classList.remove('hidden'); // Zeigt Modi-Editor

                activeFlicEditorKlickTyp = null; // Setzt aktiven Klick zurück
                flicCard.querySelectorAll('.flic-column-block').forEach(col => { // Entfernt Hervorhebung
                    col.classList.remove('bg-indigo-100', 'border-indigo-400');
                    col.classList.add('bg-gray-50', 'border-gray-200');
                });

                renderModeEditorList(); // Füllt die Liste der Modi
                const modeConfigForm = document.getElementById('modeConfigFormContainer'); // Konfig-Formular verstecken
                if(modeConfigForm) modeConfigForm.classList.add('hidden');
                return;
            }

            // Nur reagieren, wenn Klick im Modi-Editor-Bereich war
            if (modeEditorArea && modeEditorArea.contains(e.target)) {
                // "Modi-Editor schließen" Button (X)
                if (e.target.closest('#notrufCloseModeEditor')) {
                    modeEditorArea.classList.add('hidden');
                    if (assignmentAreaContainer) assignmentAreaContainer.classList.remove('hidden'); // Zeigt Zuweisungs-Karte wieder an
                    const modeConfigForm = document.getElementById('modeConfigFormContainer');
                    if(modeConfigForm) modeConfigForm.classList.add('hidden'); // Auch Konfig-Form schließen
                    return;
                }
                // "Neuen Modus anlegen" Button (+)
                if (e.target.closest('#notrufAddNewModeButton')) {
                    openModeConfigForm(); // Öffnet leeres Konfig-Formular
                    return;
                }
                // "Bearbeiten" Knopf (Stift-Symbol) in der Modusliste
                const editBtn = e.target.closest('.edit-mode-btn');
                if (editBtn && editBtn.dataset.modeId) {
                    openModeConfigForm(editBtn.dataset.modeId); // Öffnet Konfig-Formular mit Daten
                    return;
                }
                // "Löschen" Knopf (Mülleimer-Symbol) in der Modusliste
                const deleteBtn = e.target.closest('.delete-mode-btn');
                if (deleteBtn && deleteBtn.dataset.modeId) {
                    const modeIdToDelete = parseInt(deleteBtn.dataset.modeId);
                     if (isNaN(modeIdToDelete)) return;
                    const modeToDelete = (notrufSettings.modes || []).find(m => m.id === modeIdToDelete);
                    if (!modeToDelete) return;

                    const confirmation = prompt(`Um den Modus "${modeToDelete.title}" unwiderruflich zu löschen, geben Sie bitte "MODI LÖSCHEN" ein:`);
                    if (confirmation === 'MODI LÖSCHEN' && notrufSettingsDocRef) {
                        notrufSettings.modes = (notrufSettings.modes || []).filter(m => m.id !== modeIdToDelete);
                        // Zuweisungen entfernen, die diesen Modus verwenden
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
                             // UI Updates: Liste, Dropdowns, Spalten
                             renderModeEditorList();
                             populateFlicAssignmentSelectors();
                             updateFlicColumnDisplays();
                             // Falls der gelöschte Modus im Zuweisungs-Editor offen war, diesen auch aktualisieren
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
                // "Abbrechen" im Konfigurationsformular
                 const cancelEditBtn = e.target.closest('#notrufCancelEditModeButton');
                 if(cancelEditBtn){
                     const modeConfigForm = document.getElementById('modeConfigFormContainer');
                     if(modeConfigForm) modeConfigForm.classList.add('hidden');
                     // Globale Temp-Variablen zurücksetzen
                     tempSelectedApiTokenId = null;
                     tempSelectedSoundId = null;
                     return;
                 }

                 // --- Listener für Modals (Kontaktbuch etc.) und Speichern innerhalb des Konfig-Formulars ---
                 const configForm = document.getElementById('modeConfigFormContainer');
                 if (configForm && configForm.contains(e.target)) {
                     // Kontaktbuch öffnen
                     if (e.target.closest('#notrufOpenContactBook')) {
                         renderContactBook(); // Füllt das Modal mit aktuellen Daten
                         const modal = document.getElementById('contactBookModal');
                         if (modal) modal.style.display = 'flex';
                         return;
                     }
                      // API Token Buch öffnen
                     if (e.target.closest('#notrufOpenApiTokenBook')) {
                         renderApiTokenBook(); // Füllt das Modal mit aktuellen Daten
                         const modal = document.getElementById('apiTokenBookModal');
                         if (modal) modal.style.display = 'flex';
                         return;
                     }
                      // Sound Buch öffnen
                     if (e.target.closest('#notrufOpenSoundBook')) {
                         renderSoundBook(); // Füllt das Modal mit aktuellen Daten
                         const modal = document.getElementById('soundBookModal');
                         if (modal) modal.style.display = 'flex';
                         return;
                     }
                     // Priorität Button Klick
                     const prioBtn = e.target.closest('.priority-btn');
                     if (prioBtn) {
                         configForm.querySelectorAll('.priority-btn').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
                         prioBtn.classList.add('bg-indigo-600', 'text-white');
                         return;
                     }
                     // Modus speichern (Neuer oder Bearbeiteter)
                     if (e.target.closest('#notrufSaveModeButton')) {
                         // ... (Logik zum Speichern des Modus - siehe Funktion unten)
                         await saveNotrufMode(); // Eigene Funktion zum Speichern
                         return;
                     }
                 } // Ende if (configForm && configForm.contains(e.target))

            } // Ende if (modeEditorArea && modeEditorArea.contains(e.target))
        }); // Ende des Haupt-Click-Listeners für flicCard
        flicCard.dataset.flicListenerAttached = 'true';
    } // Ende if (flicCard && !flicCard.dataset.flicListenerAttached)

    // --- Listener für Retry Checkbox (gehört zum Konfig-Formular) ---
    const configArea = document.getElementById('notrufConfigArea');
    const retryCheckbox = document.getElementById('retryDeaktiviert');
    const retrySecondsInput = document.getElementById('retrySecondsInput');
    if (configArea && retryCheckbox && retrySecondsInput && !configArea.dataset.retryListenerAttached) { // Verhindert doppelte Listener
        retryCheckbox.addEventListener('change', (e) => {
            const isDisabled = e.target.checked;
            retrySecondsInput.disabled = isDisabled;
            if (isDisabled) {
                // Optional: Wert zurücksetzen
                // retrySecondsInput.value = 30;
            } else {
                // Sicherstellen, dass ein gültiger Wert drin steht
                if (parseInt(retrySecondsInput.value) < 30) {
                    retrySecondsInput.value = 30;
                }
            }
        });
        configArea.dataset.retryListenerAttached = 'true';
    }

    console.log("initializeNotrufSettingsView: Listener hinzugefügt."); // Debugging
} // --- ENDE initializeNotrufSettingsView ---


// === Hilfsfunktionen für Notruf ===

// Befüllt den Dropdown im Zuweisungs-Editor
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

// Aktualisiert die Anzeige der 3 Spalten (Einfach, Doppel, Hold)
function updateFlicColumnDisplays() {
    const modes = notrufSettings.modes || [];
    const assignments = notrufSettings.flicAssignments || { einfach: null, doppel: null, halten: null };

    ['einfach', 'doppel', 'halten'].forEach(klickTyp => {
        const nameDisplay = document.getElementById(`flicDisplayModeName-${klickTyp}`);
        const descDisplay = document.getElementById(`flicDisplayModeDesc-${klickTyp}`);
        if (!nameDisplay || !descDisplay) return;

        const assignedModeId = assignments[klickTyp];
        const assignedMode = modes.find(m => m.id === assignedModeId);

        if (assignedMode) {
            nameDisplay.textContent = assignedMode.title;
            nameDisplay.title = assignedMode.title;
            descDisplay.textContent = assignedMode.description || '(Keine Beschreibung)';
        } else {
            nameDisplay.textContent = 'Kein Modus';
            nameDisplay.title = 'Kein Modus';
            descDisplay.textContent = '';
        }
    });
}

// Aktualisiert die Details-Box im Zuweisungs-Editor basierend auf der Auswahl im Dropdown
function updateFlicEditorDetails(selectedModeId) {
    const detailsDisplay = document.getElementById('flic-editor-details');
    if (!detailsDisplay) return;
    const modes = notrufSettings.modes || [];
    const selectedMode = modes.find(m => m.id === selectedModeId);

     if (selectedMode) {
        const config = selectedMode.config || {};
        const recipients = (config.userKeys || []).map(u => u.name).join(', ') || 'Niemand';
        detailsDisplay.innerHTML = `
            <strong class="block">Empfänger:</strong>
            <span class="block pl-2 mb-1">${recipients}</span>
            <strong class="block">Nachricht:</strong>
            <span class="block pl-2 mb-1">"${config.message || 'Keine'}"</span>
            <strong class="block">Prio:\u00A0${config.priority ?? '0'}, Retry:\u00A0${config.retry ?? '0'}s</strong>`; // ?? für Default 0
    } else {
        detailsDisplay.innerHTML = 'Kein Modus zugewiesen.';
    }
}


// Aktualisiert den Zuweisungs-Editor (Dropdown + Details), wenn eine Spalte geklickt wird
function updateFlicEditorBox(klickTyp) {
    const modes = notrufSettings.modes || [];
    const assignments = notrufSettings.flicAssignments || { einfach: null, doppel: null, halten: null };

    const title = document.getElementById('flic-editor-title');
    const selector = document.getElementById('flic-editor-selector');
    const detailsDisplay = document.getElementById('flic-editor-details');

    if (!title || !selector || !detailsDisplay) return;

    const klickTypBezeichnung = klickTyp.charAt(0).toUpperCase() + klickTyp.slice(1); // Macht 'Einfach', 'Doppel', 'Halten'
    title.textContent = `Modus für Klick: ${klickTypBezeichnung} ändern`;

    const assignedModeId = assignments[klickTyp];

    // Setze den Dropdown auf den aktuell zugewiesenen Wert
    selector.value = assignedModeId ? assignedModeId.toString() : ""; // Stelle sicher, dass es ein String ist für value

    // Aktualisiere die Details-Box
    updateFlicEditorDetails(assignedModeId);
}


// Rendert die Liste der vorhandenen Modi im "Modi verwalten"-Bereich
function renderModeEditorList() {
    const listContainer = document.getElementById('existingModesList');
    if (!listContainer) return;
    const modes = notrufSettings.modes || [];

    if (modes.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Modi vorhanden.</p>';
        return;
    }
    listContainer.innerHTML = modes.map(mode => `
        <div class="flex justify-between items-center p-2 bg-gray-50 rounded-md border">
            <div>
                <p class="font-semibold">${mode.title}</p>
                <p class="text-xs text-gray-500">${mode.description || '(Keine Beschreibung)'}</p>
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

// Öffnet das Formular zum Bearbeiten/Erstellen eines Modus
function openModeConfigForm(modeId = null) {
    const formContainer = document.getElementById('modeConfigFormContainer');
    const formTitle = document.getElementById('modeConfigFormTitle');
    const editingModeIdInput = document.getElementById('editingModeId');
    const titleInput = document.getElementById('notrufModeTitle');
    const descInput = document.getElementById('notrufModeDescInput');
    const pushoverTitleInput = document.getElementById('notrufTitle');
    const messageInput = document.getElementById('notrufMessage');
    const priorityButtons = document.querySelectorAll('#priority-buttons-container .priority-btn');
    const retrySecondsInput = document.getElementById('retrySecondsInput');
    const retryCheckbox = document.getElementById('retryDeaktiviert');
    const apiTokenDisplay = document.getElementById('notrufApiTokenDisplay');
    const userKeyDisplay = document.getElementById('notrufUserKeyDisplay');
    const soundDisplay = document.getElementById('notrufSoundDisplay');

    if(!formContainer || !formTitle || !editingModeIdInput || !titleInput || !descInput || !pushoverTitleInput || !messageInput || !retrySecondsInput || !retryCheckbox || !apiTokenDisplay || !userKeyDisplay || !soundDisplay) {
        console.error("openModeConfigForm: Eines oder mehrere Formular-Elemente nicht gefunden!");
        return;
    }

    // --- Standardwerte setzen & Felder leeren ---
    editingModeIdInput.value = '';
    titleInput.value = '';
    descInput.value = '';
    pushoverTitleInput.value = '';
    messageInput.value = '';
    apiTokenDisplay.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
    userKeyDisplay.innerHTML = ''; // Wird unten gefüllt
    soundDisplay.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
    tempSelectedApiTokenId = null; // Globale Variable zurücksetzen
    tempSelectedSoundId = null;    // Globale Variable zurücksetzen

    priorityButtons.forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
    const defaultPrioButton = formContainer.querySelector('.priority-btn[data-priority="0"]');
    if (defaultPrioButton) defaultPrioButton.classList.add('bg-indigo-600', 'text-white');

    retryCheckbox.checked = true; // Standard: Deaktiviert
    retrySecondsInput.value = 30;
    retrySecondsInput.disabled = true;

    let modeToEdit = null;
    if (modeId) {
        modeToEdit = (notrufSettings.modes || []).find(m => m.id == modeId); // Lockere Prüfung wg. String/Number
    }

    if (modeToEdit) {
        // --- Bearbeiten-Modus: Felder befüllen ---
        formTitle.textContent = 'Modus Bearbeiten';
        editingModeIdInput.value = modeId;
        titleInput.value = modeToEdit.title || '';
        descInput.value = modeToEdit.description || '';

        const config = modeToEdit.config || {};
        pushoverTitleInput.value = config.title || '';
        messageInput.value = config.message || '';

        // API Token anzeigen & temp ID setzen
        tempSelectedApiTokenId = config.selectedApiTokenId || null;
        const selectedToken = (notrufSettings.apiTokens || []).find(t => t.id === tempSelectedApiTokenId);
        if (selectedToken) {
            apiTokenDisplay.innerHTML = `<span class="api-token-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-token-id="${selectedToken.id}">${selectedToken.name}</span>`;
        } // Else-Fall wird oben schon behandelt

        // User Keys (Empfänger) anzeigen
        userKeyDisplay.innerHTML = ''; // Sicherstellen, dass leer
        (config.userKeys || []).forEach(contactRef => {
            // Finde den Kontakt im globalen Objekt basierend auf der gespeicherten ID
            const contact = (notrufSettings.contacts || []).find(c => c.id === contactRef.id);
            if (contact) {
                userKeyDisplay.innerHTML += `<span class="contact-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-contact-id="${contact.id}">${contact.name}</span>`;
            }
        });

        // Sound anzeigen & temp ID setzen
        tempSelectedSoundId = config.selectedSoundId === undefined ? null : config.selectedSoundId; // Null für Standard
        const selectedSound = (notrufSettings.sounds || []).find(s => s.id === tempSelectedSoundId);
        if (selectedSound) {
            const displayName = selectedSound.useCustomName && selectedSound.customName ? selectedSound.customName : selectedSound.code;
            soundDisplay.innerHTML = `<span class="sound-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-sound-id="${selectedSound.id}">${displayName}</span>`;
        } // Else-Fall wird oben schon behandelt

        // Priorität setzen
        priorityButtons.forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
        const prio = config.priority !== undefined ? config.priority : 0;
        const selectedPrioButton = formContainer.querySelector(`.priority-btn[data-priority="${prio}"]`);
        if (selectedPrioButton) selectedPrioButton.classList.add('bg-indigo-600', 'text-white');

        // Retry/Expire setzen
        const savedRetry = config.retry !== undefined ? config.retry : 0; // Standard 0 = deaktiviert
        if (savedRetry === 0) {
            retryCheckbox.checked = true;
            retrySecondsInput.disabled = true;
            retrySecondsInput.value = 30; // Platzhalter
        } else {
            retryCheckbox.checked = false;
            retrySecondsInput.disabled = false;
            retrySecondsInput.value = Math.max(30, Math.min(10800, savedRetry)); // Im gültigen Bereich halten
        }

    } else {
        // --- Neu-Anlegen-Modus ---
        formTitle.textContent = 'Neuen Modus Anlegen';
        // Felder wurden bereits oben zurückgesetzt
    }

    formContainer.classList.remove('hidden'); // Zeige das Formular an
}

// Speichert einen neuen oder bearbeiteten Notruf-Modus
async function saveNotrufMode() {
    const formContainer = document.getElementById('modeConfigFormContainer');
    if (!formContainer || !notrufSettingsDocRef) return; // Wichtige Elemente prüfen

    const editingId = document.getElementById('editingModeId').value ? parseInt(document.getElementById('editingModeId').value) : null;
    const title = document.getElementById('notrufModeTitle').value.trim(); // Modus-Titel
    const description = document.getElementById('notrufModeDescInput').value.trim();
    const pushoverTitle = document.getElementById('notrufTitle').value.trim(); // Pushover-Titel
    const message = document.getElementById('notrufMessage').value.trim();

    if (!title || !description) return alertUser('Bitte Titel und Beschreibung für den Modus eingeben.', 'error');
    if (tempSelectedApiTokenId === null) return alertUser('Bitte einen API-Token auswählen.', 'error');

    // Empfänger (User Keys) sammeln
    const selectedUserKeys = [];
    document.querySelectorAll('#notrufUserKeyDisplay .contact-badge').forEach(badge => {
        const contactId = parseInt(badge.dataset.contactId);
        const contact = (notrufSettings.contacts || []).find(c => c.id === contactId);
        if (contact) { selectedUserKeys.push({ id: contact.id, name: contact.name, key: contact.key }); } // Speichere Referenz-Objekt
    });

    // Priorität auslesen
    const selectedPrioButton = formContainer.querySelector('.priority-btn.bg-indigo-600');
    const priority = selectedPrioButton ? parseInt(selectedPrioButton.dataset.priority) : 0;

    // Retry/Expire auslesen
    const retryDeaktiviert = document.getElementById('retryDeaktiviert').checked;
    let retryValue = 0;
    let expireValue = 0;
    if (!retryDeaktiviert) {
        const inputRetry = parseInt(document.getElementById('retrySecondsInput').value);
        if (isNaN(inputRetry) || inputRetry < 30 || inputRetry > 10800) {
            return alertUser('Retry-Intervall muss zwischen 30 und 10800 Sekunden liegen.', 'error');
        }
        retryValue = inputRetry;
        expireValue = 10800; // Max Expire
    }

    if (priority === 2 && retryValue === 0) {
        return alertUser('Notfall-Priorität (2) erfordert ein aktiviertes Retry/Expire-Intervall (mind. 30 Sekunden).', 'error');
    }

    // Sound-Code ermitteln
    let soundCodeToSend = null; // Standard Pushover Sound
    if (tempSelectedSoundId !== null) {
        const sound = (notrufSettings.sounds || []).find(s => s.id === tempSelectedSoundId);
        if (sound) { soundCodeToSend = sound.code; }
    }

    // Config-Objekt zusammenbauen
    const configData = {
        selectedApiTokenId: tempSelectedApiTokenId,
        userKeys: selectedUserKeys,
        title: pushoverTitle,
        message: message,
        selectedSoundId: tempSelectedSoundId, // ID speichern für die Anzeige
        sound: soundCodeToSend, // Den Code für die API speichern
        priority: priority,
        retry: retryValue,
        expire: expireValue
    };

    if (!notrufSettings.modes) notrufSettings.modes = [];

    if (editingId !== null) { // Bearbeiten
        const modeIndex = notrufSettings.modes.findIndex(m => m.id === editingId);
        if (modeIndex > -1) {
            notrufSettings.modes[modeIndex].title = title;
            notrufSettings.modes[modeIndex].description = description;
            notrufSettings.modes[modeIndex].config = configData;
        } else {
             console.error(`Modus mit ID ${editingId} zum Bearbeiten nicht gefunden.`);
             return alertUser('Fehler: Zu bearbeitender Modus nicht gefunden.', 'error');
        }
    } else { // Neu anlegen
        notrufSettings.modes.push({
            id: Date.now(), title: title, description: description, config: configData
        });
    }

    try {
        await setDoc(notrufSettingsDocRef, notrufSettings);
        alertUser('Modus gespeichert!', 'success');
        formContainer.classList.add('hidden'); // Formular schließen
        // UI Updates werden durch onSnapshot getriggert, aber wir rufen sie hier explizit auf für sofortiges Feedback
        renderModeEditorList();
        populateFlicAssignmentSelectors();
        updateFlicColumnDisplays();
        // Globale Temp-Variablen zurücksetzen
        tempSelectedApiTokenId = null;
        tempSelectedSoundId = null;
    } catch (err) {
        console.error("Error saving mode:", err);
        alertUser('Fehler beim Speichern des Modus.', 'error');
    }
}

// Rendert das Kontaktbuch-Modal
function renderContactBook() {
    const list = document.getElementById('contactBookList');
    const modal = document.getElementById('contactBookModal');
    if (!list || !modal) return;
    const contacts = notrufSettings.contacts || [];

    // Finde die aktuell im *Formular* (nicht im globalen Objekt!) angezeigten User Keys
    const currentFormUserKeys = [];
    document.querySelectorAll('#notrufUserKeyDisplay .contact-badge').forEach(badge => {
        const id = parseInt(badge.dataset.contactId);
        if(!isNaN(id)) currentFormUserKeys.push(id);
    });

    if (contacts.length === 0) {
        list.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Kontakte gefunden.</p>';
    } else {
        list.innerHTML = contacts.map(contact => {
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
                    <button data-contact-id="${contact.id}" class="delete-contact-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0" title="Kontakt löschen">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1H2V3Zm2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z" /></svg>
                    </button>
                </div>`;
        }).join('');
    }
}

// Rendert das API-Token-Modal
function renderApiTokenBook() {
    const list = document.getElementById('apiTokenBookList');
    const modal = document.getElementById('apiTokenBookModal');
    if (!list || !modal) return;
    const tokens = notrufSettings.apiTokens || [];
    const currentlySelectedId = tempSelectedApiTokenId; // Aus globaler Variable

    if (tokens.length === 0) {
        list.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Tokens gefunden.</p>';
    } else {
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
                    <button data-token-id="${token.id}" class="delete-api-token-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0" title="Token löschen">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1H2V3Zm2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z" /></svg>
                    </button>
                </div>`;
        }).join('');
    }
}

// Rendert das Sound-Buch-Modal
function renderSoundBook() {
    const list = document.getElementById('soundBookList');
    const modal = document.getElementById('soundBookModal');
    if (!list || !modal) return;
    const sounds = notrufSettings.sounds || [];
    const currentlySelectedId = tempSelectedSoundId; // null für Standard
    const placeholder = document.getElementById('sound-list-placeholder');

    // Entferne alte benutzerdefinierte Einträge (Standard-Option bleibt immer)
    list.querySelectorAll('.custom-sound-item').forEach(item => item.remove());

    if (sounds.length === 0) {
        if (placeholder) placeholder.classList.remove('hidden');
    } else {
        if (placeholder) placeholder.classList.add('hidden');
        let customSoundsHTML = '';
        sounds.forEach(sound => {
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
                    <button data-sound-id="${sound.id}" class="delete-sound-btn p-2 text-red-400 hover:text-red-600 flex-shrink-0" title="Sound löschen">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1H2V3Zm2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z" /></svg>
                    </button>
                </div>`;
        });
        list.insertAdjacentHTML('beforeend', customSoundsHTML);
    }

    // Stelle sicher, dass Standard ausgewählt ist, wenn nichts anderes passt
    const defaultRadio = list.querySelector('input[name="soundSelection"][value="default"]');
    if (defaultRadio) {
        defaultRadio.checked = (currentlySelectedId === null);
    }
}