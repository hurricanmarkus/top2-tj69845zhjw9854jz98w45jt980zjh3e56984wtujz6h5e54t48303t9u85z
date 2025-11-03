// NEU: Wir importieren die alertUser Funktion, um den Benutzer zu benachrichtigen
import { alertUser } from './haupteingang.js';

// Ein Zähler, damit jede Datums-Gruppe eine eindeutige ID hat
let dateGroupIdCounter = 0;

// Diese Funktion wird von haupteingang.js aufgerufen
export function initializeTerminplanerView() {
    
    // ----- Spion für das Token-Feld -----
    const tokenInput = document.getElementById('vote-token-input');
    if (tokenInput && !tokenInput.dataset.listenerAttached) {
        tokenInput.addEventListener('input', formatTokenInput);
        tokenInput.dataset.listenerAttached = 'true';
    }

    // ----- Spione für das Modal (Pop-up Fenster) -----
    const openModalButton = document.getElementById('show-create-vote-modal-btn');
    const closeModalButton = document.getElementById('close-create-vote-modal-btn');
    const modal = document.getElementById('createVoteModal');

    if (openModalButton && closeModalButton && modal) {
        // Spion für den "+ Neuen Termin"-Button
        if (!openModalButton.dataset.listenerAttached) {
            openModalButton.addEventListener('click', () => {
                modal.style.display = 'flex';
                modal.classList.remove('hidden');
            });
            openModalButton.dataset.listenerAttached = 'true';
        }

        // Spion für den "Schließen" (X)-Button
        if (!closeModalButton.dataset.listenerAttached) {
            closeModalButton.addEventListener('click', () => {
                modal.style.display = 'none';
                modal.classList.add('hidden');
            });
            closeModalButton.dataset.listenerAttached = 'true';
        }

        // ----- NEU: Spione für die 4 Auswahl-Karten im Modal -----
        
        // Spion für "Gruppenumfrage"
        const groupPollButton = document.getElementById('select-vote-type-group');
        if (groupPollButton && !groupPollButton.dataset.listenerAttached) {
            groupPollButton.addEventListener('click', () => {
                console.log("Wähle Typ: Gruppenumfrage");
                modal.style.display = 'none'; // Modal schließen
                modal.classList.add('hidden');
                showVoteCreationWizard(); // Den neuen Assistenten zeigen
            });
            groupPollButton.dataset.listenerAttached = 'true';
        }
        
        // Platzhalter-Spione für die anderen 3 (noch nicht gebaut)
        document.getElementById('select-vote-type-event')?.addEventListener('click', () => alertUser("Eventplaner ist noch nicht verfügbar.", "error"));
        document.getElementById('select-vote-type-1on1')?.addEventListener('click', () => alertUser("1:1 ist noch nicht verfügbar.", "error"));
        document.getElementById('select-vote-type-booking')?.addEventListener('click', () => alertUser("Buchungsseite ist noch nicht verfügbar.", "error"));

    }

    // ----- NEU: Spione für den Erstellungs-Assistenten -----
    
    // Spion für den "Abbrechen"-Button im Assistenten
    const cancelCreationButton = document.getElementById('cancel-vote-creation-btn');
    if (cancelCreationButton && !cancelCreationButton.dataset.listenerAttached) {
        cancelCreationButton.addEventListener('click', () => {
            if (confirm("Möchtest du die Erstellung wirklich abbrechen? Alle Eingaben gehen verloren.")) {
                showMainTerminplanerView(); // Zurück zur Hauptseite
            }
        });
        cancelCreationButton.dataset.listenerAttached = 'true';
    }

    // Spion für den "+ Tag hinzufügen"-Button
    const addDateButton = document.getElementById('vote-add-date-btn');
    if (addDateButton && !addDateButton.dataset.listenerAttached) {
        addDateButton.addEventListener('click', addNewDateGroup);
        addDateButton.dataset.listenerAttached = 'true';
    }

    // Spion für "+ Uhrzeit hinzufügen" und "Uhrzeit entfernen"
    // Wir nutzen einen "delegierten" Spion, der auf den ganzen Datums-Container lauscht
    const datesContainer = document.getElementById('vote-dates-container');
    if (datesContainer && !datesContainer.dataset.clickListenerAttached) {
        datesContainer.addEventListener('click', (e) => {
            
            // Fall 1: Klick auf "+ Uhrzeit hinzufügen"
            const addTarget = e.target.closest('.vote-add-time-btn');
            if (addTarget) {
                const timesContainer = addTarget.previousElementSibling; // Das <div> davor
                if (timesContainer) {
                    timesContainer.appendChild(createTimeInputHTML());
                }
            }
            
            // Fall 2: Klick auf "Uhrzeit entfernen" (Mülleimer)
            const removeTarget = e.target.closest('.vote-remove-time-btn');
            if (removeTarget) {
                const timeGroup = removeTarget.parentElement; // Die <div class="flex...">
                const timesContainer = timeGroup.parentElement;
                
                // Wir löschen die Uhrzeit nur, wenn es nicht die letzte ist
                if (timesContainer.children.length > 1) {
                    timeGroup.remove();
                } else {
                    alertUser("Du musst mindestens eine Uhrzeit pro Tag angeben.", "error");
                }
            }
        });
        datesContainer.dataset.clickListenerAttached = 'true';
    }

    // Spion für den finalen "Umfrage erstellen"-Button
    const saveVoteButton = document.getElementById('vote-save-group-poll-btn');
    if (saveVoteButton && !saveVoteButton.dataset.listenerAttached) {
        saveVoteButton.addEventListener('click', () => {
            // HIER kommt später die ganze Speicher-Logik (Datenbank, Token erstellen)
            // Fürs Erste:
            console.log("Speichere Gruppenumfrage... (Logik fehlt noch)");
            alertUser("Umfrage gespeichert! (Simulation)", "success");
            showMainTerminplanerView(); // Zurück zur Hauptseite
        });
        saveVoteButton.dataset.listenerAttached = 'true';
    }
}


// ----- NEUE HELFER-FUNKTIONEN -----

// Zeigt den Assistenten an und versteckt die Hauptseite
function showVoteCreationWizard() {
    document.getElementById('terminplaner-main-view').classList.add('hidden');
    document.getElementById('terminplaner-create-view').classList.remove('hidden');
    
    // Setze den Assistenten zurück
    document.getElementById('vote-title').value = '';
    document.getElementById('vote-description').value = '';
    document.getElementById('vote-dates-container').innerHTML = '';
    document.getElementById('vote-setting-public').checked = false;
    document.getElementById('vote-setting-anonymous').checked = false;
    dateGroupIdCounter = 0;
    
    // Füge automatisch den ersten Tag hinzu, damit es nicht leer ist
    addNewDateGroup();
}

// Zeigt die Hauptseite an und versteckt den Assistenten
function showMainTerminplanerView() {
    document.getElementById('terminplaner-main-view').classList.remove('hidden');
    document.getElementById('terminplaner-create-view').classList.add('hidden');
}

// Erstellt eine neue Datums-Gruppe
function addNewDateGroup() {
    dateGroupIdCounter++;
    const datesContainer = document.getElementById('vote-dates-container');
    
    const newGroup = document.createElement('div');
    newGroup.className = 'p-3 border rounded-lg bg-gray-50 space-y-3';
    newGroup.dataset.dateGroupId = dateGroupIdCounter;
    
    newGroup.innerHTML = `
        <label class="block text-sm font-bold text-gray-700">Tag ${dateGroupIdCounter}</label>
        <input type="date" class="vote-date-input w-full p-2 border rounded-lg">
        
        <div class="vote-times-container space-y-2">
            </div>
        
        <button class="vote-add-time-btn text-sm font-semibold text-indigo-600 hover:underline">+ Uhrzeit hinzufügen</button>
    `;
    
    // Füge die erste Uhrzeit hinzu
    newGroup.querySelector('.vote-times-container').appendChild(createTimeInputHTML());
    
    datesContainer.appendChild(newGroup);
}

// Erstellt den HTML-Code für ein einzelnes Uhrzeit-Feld
function createTimeInputHTML() {
    const timeGroup = document.createElement('div');
    timeGroup.className = 'flex items-center gap-2';
    timeGroup.innerHTML = `
        <input type="time" class="vote-time-input flex-grow p-1 border rounded-lg">
        <button class="vote-remove-time-btn p-1 text-red-500 hover:bg-red-100 rounded-full" title="Uhrzeit entfernen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" />
            </svg>
        </button>
    `;
    return timeGroup;
}


// Die Token-Formatierungsfunktion (bleibt gleich)
function formatTokenInput(e) {
    const input = e.target;
    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); 
    let formattedValue = '';
    if (value.length > 4) {
        formattedValue = value.substring(0, 4) + ' - ' + value.substring(4, 8);
    } else {
        formattedValue = value;
    }
    const cursorPos = input.selectionStart;
    const originalLength = input.value.length;
    input.value = formattedValue;
    const newLength = formattedValue.length;
    if (newLength > originalLength) {
         input.selectionStart = newLength;
         input.selectionEnd = newLength;
    } else {
         input.selectionStart = cursorPos;
         input.selectionEnd = cursorPos;
    }
}