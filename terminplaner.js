// NEU: Wir importieren die Datenbank-Tools, die wir brauchen
import { alertUser, db, votesCollectionRef, currentUser } from './haupteingang.js';
// NEU: Wir importieren die Firebase-Befehle zum Speichern und für Zeitstempel
import { addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

        // ----- Spione für die 4 Auswahl-Karten im Modal -----
        
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

    // ----- Spione für den Erstellungs-Assistenten -----
    
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

    // NEU: Spion für den finalen "Umfrage erstellen"-Button
    // Wir rufen jetzt unsere neue Speicher-Funktion auf
    const saveVoteButton = document.getElementById('vote-save-group-poll-btn');
    if (saveVoteButton && !saveVoteButton.dataset.listenerAttached) {
        saveVoteButton.addEventListener('click', saveGroupPoll); // <--- HIER IST DIE ÄNDERUNG
        saveVoteButton.dataset.listenerAttached = 'true';
    }
}


// ----- NEUE SPEICHER-FUNKTION -----

/**
 * Sammelt alle Daten aus dem "Gruppenumfrage"-Assistenten und speichert sie in Firebase.
 */
async function saveGroupPoll() {
    const saveBtn = document.getElementById('vote-save-group-poll-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Wird gespeichert...';

    try {
        // 1. Grund-Daten sammeln
        const title = document.getElementById('vote-title').value.trim();
        const description = document.getElementById('vote-description').value.trim();
        const isPublic = document.getElementById('vote-setting-public').checked;
        const isAnonymous = document.getElementById('vote-setting-anonymous').checked;

        // 2. Termine (Optionen) sammeln
        const options = [];
        const dateGroups = document.querySelectorAll('#vote-dates-container [data-date-group-id]');

        let hasValidOption = false;

        dateGroups.forEach(group => {
            const dateInput = group.querySelector('.vote-date-input');
            const dateValue = dateInput.value; // z.B. "2025-11-10"

            if (dateValue) { // Nur wenn ein Datum gesetzt ist
                const timeInputs = group.querySelectorAll('.vote-time-input');
                timeInputs.forEach(timeInput => {
                    const timeValue = timeInput.value; // z.B. "14:30"
                    if (timeValue) { // Nur wenn eine Uhrzeit gesetzt ist
                        options.push({
                            date: dateValue,
                            time: timeValue
                        });
                        hasValidOption = true;
                    }
                });
            }
        });

        // 3. Validierung (Prüfen, ob alles Nötige da ist)
        if (!title) {
            // Wir "werfen" einen Fehler. Das 'catch' unten wird ihn fangen.
            throw new Error("Bitte gib einen Titel für die Umfrage ein.");
        }
        if (!hasValidOption) {
            throw new Error("Bitte füge mindestens einen gültigen Termin (Datum + Uhrzeit) hinzu.");
        }

        // 4. Token erstellen (mit unserer neuen Helfer-Funktion)
        const token = generateVoteToken();

        // 5. Das finale Daten-Objekt für Firebase erstellen
        const voteData = {
            title: title,
            description: description,
            type: 'group-poll', // Damit wir später wissen, dass es eine Gruppenumfrage ist
            token: token,
            isPublic: isPublic,
            isAnonymous: isAnonymous,
            createdBy: currentUser.displayName || currentUser.mode, // Wer hat's erstellt?
            createdAt: serverTimestamp(), // Ein Zeitstempel von der Datenbank
            options: options, // Unser Array mit den Terminen
            participants: []  // Eine leere Liste, bereit für Teilnehmer
        };

        // 6. In Firebase speichern
        // Wir warten (await), bis Firebase "fertig" sagt
        console.log("Speichere Umfrage in Firebase...", voteData);
        const docRef = await addDoc(votesCollectionRef, voteData);

        // 7. Erfolg!
        console.log(`Umfrage erstellt! ID: ${docRef.id}, Token: ${token}`);
        // Wir zeigen dem Benutzer den Token. (Später können wir hier einen Link anzeigen)
        alertUser(`Umfrage erstellt! Dein Token: ${token}`, "success");

        showMainTerminplanerView(); // Zurück zur Hauptansicht

    } catch (error) {
        // Falls bei Schritt 3 oder 6 etwas schiefgeht, fangen wir den Fehler hier
        console.error("Fehler beim Speichern der Umfrage:", error);
        alertUser(error.message, "error"); // Zeige die Fehlermeldung (z.B. "Bitte gib einen Titel ein.")
    
    } finally {
        // WICHTIG: Egal ob Erfolg oder Fehler, mache den Button wieder klickbar
        saveBtn.disabled = false;
        saveBtn.textContent = 'Umfrage erstellen und Link erhalten';
    }
}


// ----- NEUE HELFER-FUNKTION: Token-Generator -----

/**
 * Erstellt einen 8-stelligen Zufalls-Token im Format XXXX - XXXX
 */
function generateVoteToken() {
    // Wir nehmen nicht alle Zeichen, um Verwechslungen (wie O und 0) zu vermeiden
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i++) {
        part1 += chars.charAt(Math.floor(Math.random() * chars.length));
        part2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${part1} - ${part2}`;
}


// ----- BESTEHENDE HELFER-FUNKTIONEN (unverändert) -----

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