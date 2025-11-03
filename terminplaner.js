// NEU: Wir importieren mehr Datenbank-Tools
import { alertUser, db, votesCollectionRef, currentUser, setButtonLoading } from './haupteingang.js';
// NEU: Wir importieren die Firebase-Befehle zum Speichern und für Zeitstempel
import { addDoc, serverTimestamp, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ----- Globale Variablen für den Zustand -----
let dateGroupIdCounter = 0;
// Hier merken wir uns die Umfrage, an der wir gerade teilnehmen
let currentVoteData = null;
// Hier merken wir uns, welche Option (Termin) wir gerade angeklickt haben
let selectedOptionIndex = null;


// Diese Funktion wird von haupteingang.js aufgerufen
export function initializeTerminplanerView() {
    
    // ----- Spion für das Token-Feld -----
    const tokenInput = document.getElementById('vote-token-input');
    if (tokenInput && !tokenInput.dataset.listenerAttached) {
        tokenInput.addEventListener('input', formatTokenInput);
        tokenInput.dataset.listenerAttached = 'true';
    }

    // ----- Spion für den "Teilnehmen"-Button -----
    const joinVoteButton = document.getElementById('join-vote-by-token-btn');
    if (joinVoteButton && !joinVoteButton.dataset.listenerAttached) {
        joinVoteButton.addEventListener('click', joinVoteByToken); // Ruft unsere Suchfunktion auf
        joinVoteButton.dataset.listenerAttached = 'true';
    }

    // ----- Spione für das Modal (Pop-up Fenster) -----
    const openModalButton = document.getElementById('show-create-vote-modal-btn');
    const closeModalButton = document.getElementById('close-create-vote-modal-btn');
    const modal = document.getElementById('createVoteModal');

    if (openModalButton && closeModalButton && modal) {
        // "+ Neuen Termin"-Button
        if (!openModalButton.dataset.listenerAttached) {
            openModalButton.addEventListener('click', () => {
                modal.style.display = 'flex';
                modal.classList.remove('hidden');
            });
            openModalButton.dataset.listenerAttached = 'true';
        }

        // "Schließen" (X)-Button
        if (!closeModalButton.dataset.listenerAttached) {
            closeModalButton.addEventListener('click', () => {
                modal.style.display = 'none';
                modal.classList.add('hidden');
            });
            closeModalButton.dataset.listenerAttached = 'true';
        }

        // Spion für "Gruppenumfrage"
        const groupPollButton = document.getElementById('select-vote-type-group');
        if (groupPollButton && !groupPollButton.dataset.listenerAttached) {
            groupPollButton.addEventListener('click', () => {
                console.log("Wähle Typ: Gruppenumfrage");
                modal.style.display = 'none'; 
                modal.classList.add('hidden');
                showView('create'); // Benutzt Helfer-Funktion
            });
            groupPollButton.dataset.listenerAttached = 'true';
        }
        
        // Platzhalter-Spione
        document.getElementById('select-vote-type-event')?.addEventListener('click', () => alertUser("Eventplaner ist noch nicht verfügbar.", "error"));
        document.getElementById('select-vote-type-1on1')?.addEventListener('click', () => alertUser("1:1 ist noch nicht verfügbar.", "error"));
        document.getElementById('select-vote-type-booking')?.addEventListener('click', () => alertUser("Buchungsseite ist noch nicht verfügbar.", "error"));

    }

    // ----- Spione für den Erstellungs-Assistenten -----
    
    // "Abbrechen"-Button im Assistenten
    const cancelCreationButton = document.getElementById('cancel-vote-creation-btn');
    if (cancelCreationButton && !cancelCreationButton.dataset.listenerAttached) {
        cancelCreationButton.addEventListener('click', () => {
            if (confirm("Möchtest du die Erstellung wirklich abbrechen? Alle Eingaben gehen verloren.")) {
                showView('main'); // Benutzt Helfer-Funktion
            }
        });
        cancelCreationButton.dataset.listenerAttached = 'true';
    }

    // "+ Tag hinzufügen"-Button
    const addDateButton = document.getElementById('vote-add-date-btn');
    if (addDateButton && !addDateButton.dataset.listenerAttached) {
        addDateButton.addEventListener('click', addNewDateGroup);
        addDateButton.dataset.listenerAttached = 'true';
    }

    // Delegierter Spion für "+ Uhrzeit" und "Uhrzeit entfernen"
    const datesContainer = document.getElementById('vote-dates-container');
    if (datesContainer && !datesContainer.dataset.clickListenerAttached) {
        datesContainer.addEventListener('click', (e) => {
            
            const addTarget = e.target.closest('.vote-add-time-btn');
            if (addTarget) {
                const timesContainer = addTarget.previousElementSibling; 
                if (timesContainer) {
                    timesContainer.appendChild(createTimeInputHTML());
                }
            }
            const removeTarget = e.target.closest('.vote-remove-time-btn');
            if (removeTarget) {
                const timeGroup = removeTarget.parentElement; 
                const timesContainer = timeGroup.parentElement;
                if (timesContainer.children.length > 1) {
                    timeGroup.remove();
                } else {
                    alertUser("Du musst mindestens eine Uhrzeit pro Tag angeben.", "error");
                }
            }
        });
        datesContainer.dataset.clickListenerAttached = 'true';
    }

    // "Umfrage erstellen"-Button (Speichern)
    const saveVoteButton = document.getElementById('vote-save-group-poll-btn');
    if (saveVoteButton && !saveVoteButton.dataset.listenerAttached) {
        saveVoteButton.addEventListener('click', saveGroupPoll); 
        saveVoteButton.dataset.listenerAttached = 'true';
    }

    // ----- Spione für die Abstimmungs-Seite -----

    // "Zurück"-Button auf der Abstimmungs-Seite
    const cancelVoteButton = document.getElementById('cancel-vote-participation-btn');
    if (cancelVoteButton && !cancelVoteButton.dataset.listenerAttached) {
        cancelVoteButton.addEventListener('click', () => {
            showView('main'); // Zurück zur Hauptseite
            currentVoteData = null; // Vergiss die geladene Umfrage
        });
        cancelVoteButton.dataset.listenerAttached = 'true';
    }
}


// ----- KORRIGIERTE DATENBANK-FUNKTION (Umfrage suchen) -----

/**
 * Sucht eine Umfrage basierend auf dem eingegebenen Token.
 */
async function joinVoteByToken() {
    const tokenInput = document.getElementById('vote-token-input');
    const joinBtn = document.getElementById('join-vote-by-token-btn');
    const token = tokenInput.value.trim().toUpperCase(); // z.B. "A1B2 - C3D4"

    // =================================================================
    // HIER IST DIE KORREKTUR
    // Prüfung 1: Ist das Format gültig?
    // Es muss 11 Zeichen lang sein, nicht 10.
    // =================================================================
    if (token.length !== 11 || token[4] !== ' ' || token[5] !== '-' || token[6] !== ' ') {
        alertUser("Ungültiges Token-Format. Es muss 'XXXX - XXXX' sein.", "error");
        return;
    }
    // =================================================================
    // ENDE DER KORREKTUR
    // =================================================================
    
    setButtonLoading(joinBtn, true); // Lade-Spinner anzeigen

    try {
        // Prüfung 2: Gibt es diese Umfrage in der Datenbank?
        const q = query(votesCollectionRef, where("token", "==", token));
        
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            // Nichts gefunden
            throw new Error("Umfrage nicht gefunden. Prüfe den Token.");
        }

        if (snapshot.size > 1) {
            // Sollte nie passieren, aber sicher ist sicher
            throw new Error("Fehler: Mehrere Umfragen mit diesem Token gefunden. Admin kontaktieren.");
        }

        // Erfolg! Wir haben genau eine Umfrage gefunden.
        const voteDoc = snapshot.docs[0];
        currentVoteData = { id: voteDoc.id, ...voteDoc.data() }; // Daten merken

        console.log("Umfrage gefunden:", currentVoteData);

        // Baue die Abstimmungs-Seite auf
        renderVoteView(currentVoteData);
        // Zeige die Abstimmungs-Seite an
        showView('vote');
        
        tokenInput.value = ''; // Feld leeren

    } catch (error) {
        console.error("Fehler beim Suchen der Umfrage:", error);
        alertUser(error.message, "error");
    } finally {
        setButtonLoading(joinBtn, false); // Lade-Spinner ausblenden
    }
}


// ----- RENDER-FUNKTION (Abstimmungs-Seite) -----

/**
 * Baut die Abstimmungs-Seite (Tabelle) basierend auf den Umfragedaten auf.
 */
function renderVoteView(voteData) {
    // 1. Titel und Beschreibung setzen
    document.getElementById('vote-poll-title').textContent = voteData.title;
    const descEl = document.getElementById('vote-poll-description');
    if (voteData.description) {
        descEl.textContent = voteData.description;
        descEl.classList.remove('hidden');
    } else {
        descEl.classList.add('hidden');
    }

    // 2. Namensfeld anzeigen/verstecken
    const nameContainer = document.getElementById('vote-name-input-container');
    if (voteData.isAnonymous) {
        nameContainer.classList.add('hidden');
    } else {
        nameContainer.classList.remove('hidden');
        // Versuche, den Namen des eingeloggten Benutzers vorauszufüllen
        const nameInput = document.getElementById('vote-participant-name');
        if (currentUser.mode !== 'Gast') {
            nameInput.value = currentUser.displayName;
        } else {
            nameInput.value = ''; // Leeren, falls Gast
        }
    }

    // 3. Die Abstimmungs-Tabelle bauen
    const optionsContainer = document.getElementById('vote-options-container');
    
    // Termine nach Datum gruppieren
    const optionsByDate = {};
    voteData.options.forEach((option, index) => {
        if (!optionsByDate[option.date]) {
            optionsByDate[option.date] = []; 
        }
        optionsByDate[option.date].push({ ...option, originalIndex: index });
    });

    let tableHTML = '<table class="w-full border-collapse text-sm text-left">';
    
    // 4. Kopfzeile der Tabelle
    tableHTML += '<thead><tr class="bg-gray-50">';
    tableHTML += '<th class="p-2 border-b">Termin</th>';
    // (Hier kommen später die Teilnehmer-Namen hin)
    tableHTML += '</tr></thead>';

    // 5. Zeilen der Tabelle
    tableHTML += '<tbody>';
    
    for (const date in optionsByDate) {
        const dateObj = new Date(date + 'T12:00:00'); 
        const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

        // Datums-Trenn-Zeile
        tableHTML += `
            <tr class="bg-gray-100">
                <td class="p-2 font-bold" colspan="100%">${niceDate}</td>
            </tr>
        `;

        // Uhrzeit-Zeilen
        optionsByDate[date].forEach(option => {
            tableHTML += `
                <tr class="vote-option-row hover:bg-blue-50 cursor-pointer" data-option-index="${option.originalIndex}">
                    <td class="p-2 border-b font-mono">${option.time} Uhr</td>
                    </tr>
            `;
        });
    }
    
    tableHTML += '</tbody></table>';
    optionsContainer.innerHTML = tableHTML;
    
    // 6. Klick-Spione für die neuen Tabellen-Zeilen hinzufügen
    optionsContainer.querySelectorAll('.vote-option-row').forEach(row => {
        row.addEventListener('click', () => {
            optionsContainer.querySelectorAll('.vote-option-row').forEach(r => r.classList.remove('bg-blue-200'));
            row.classList.add('bg-blue-200');
            
            selectedOptionIndex = parseInt(row.dataset.optionIndex);
            const selectedOption = voteData.options[selectedOptionIndex];
            
            const dateObj = new Date(selectedOption.date + 'T12:00:00');
            const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
            document.getElementById('vote-selected-option-text').textContent = 
                `Du stimmst ab für: ${niceDate} um ${selectedOption.time} Uhr`;
                
            document.querySelectorAll('.vote-answer-btn').forEach(btn => btn.disabled = false);
        });
    });
}


// ----- SPEICHER-FUNKTION (VON LETZTEM MAL) -----
async function saveGroupPoll() {
    const saveBtn = document.getElementById('vote-save-group-poll-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Wird gespeichert...';

    try {
        const title = document.getElementById('vote-title').value.trim();
        const description = document.getElementById('vote-description').value.trim();
        const isPublic = document.getElementById('vote-setting-public').checked;
        const isAnonymous = document.getElementById('vote-setting-anonymous').checked;

        const options = [];
        const dateGroups = document.querySelectorAll('#vote-dates-container [data-date-group-id]');
        let hasValidOption = false;

        dateGroups.forEach(group => {
            const dateInput = group.querySelector('.vote-date-input');
            const dateValue = dateInput.value; 

            if (dateValue) { 
                const timeInputs = group.querySelectorAll('.vote-time-input');
                timeInputs.forEach(timeInput => {
                    const timeValue = timeInput.value; 
                    if (timeValue) { 
                        options.push({
                            date: dateValue,
                            time: timeValue
                        });
                        hasValidOption = true;
                    }
                });
            }
        });

        if (!title) throw new Error("Bitte gib einen Titel für die Umfrage ein.");
        if (!hasValidOption) throw new Error("Bitte füge mindestens einen gültigen Termin (Datum + Uhrzeit) hinzu.");

        const token = generateVoteToken();

        const voteData = {
            title: title,
            description: description,
            type: 'group-poll',
            token: token,
            isPublic: isPublic,
            isAnonymous: isAnonymous,
            createdBy: currentUser.displayName || currentUser.mode,
            createdAt: serverTimestamp(), 
            options: options, 
            participants: []  
        };

        console.log("Speichere Umfrage in Firebase...", voteData);
        const docRef = await addDoc(votesCollectionRef, voteData);

        console.log(`Umfrage erstellt! ID: ${docRef.id}, Token: ${token}`);
        alertUser(`Umfrage erstellt! Dein Token: ${token}`, "success");

        showView('main'); // Benutzt Helfer-Funktion

    } catch (error) {
        console.error("Fehler beim Speichern der Umfrage:", error);
        alertUser(error.message, "error");
    
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Umfrage erstellen und Link erhalten';
    }
}


// ----- HELFER-FUNKTIONEN (unverändert) -----

// Helfer-Funktion zum Umschalten der Ansichten
function showView(viewName) { // viewName kann 'main', 'create' oder 'vote' sein
    document.getElementById('terminplaner-main-view').classList.add('hidden');
    document.getElementById('terminplaner-create-view').classList.add('hidden');
    document.getElementById('terminplaner-vote-view').classList.add('hidden');
    
    if (viewName === 'main') {
        document.getElementById('terminplaner-main-view').classList.remove('hidden');
    } else if (viewName === 'create') {
        document.getElementById('terminplaner-create-view').classList.remove('hidden');
        resetCreateWizard(); // Beim Anzeigen direkt zurücksetzen
    } else if (viewName === 'vote') {
        document.getElementById('terminplaner-vote-view').classList.remove('hidden');
    }
}

// umbenannt von showVoteCreationWizard
function resetCreateWizard() {
    document.getElementById('vote-title').value = '';
    document.getElementById('vote-description').value = '';
    document.getElementById('vote-dates-container').innerHTML = '';
    document.getElementById('vote-setting-public').checked = false;
    document.getElementById('vote-setting-anonymous').checked = false;
    dateGroupIdCounter = 0;
    addNewDateGroup();
}

// Zeigt die Hauptseite an und versteckt den Assistenten
function showMainTerminplanerView() {
    showView('main');
}

function generateVoteToken() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i++) {
        part1 += chars.charAt(Math.floor(Math.random() * chars.length));
        part2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${part1} - ${part2}`;
}

function addNewDateGroup() {
    dateGroupIdCounter++;
    const datesContainer = document.getElementById('vote-dates-container');
    const newGroup = document.createElement('div');
    newGroup.className = 'p-3 border rounded-lg bg-gray-50 space-y-3';
    newGroup.dataset.dateGroupId = dateGroupIdCounter;
    newGroup.innerHTML = `
        <label class="block text-sm font-bold text-gray-700">Tag ${dateGroupIdCounter}</label>
        <input type="date" class="vote-date-input w-full p-2 border rounded-lg">
        <div class="vote-times-container space-y-2"></div>
        <button class="vote-add-time-btn text-sm font-semibold text-indigo-600 hover:underline">+ Uhrzeit hinzufügen</button>
    `;
    newGroup.querySelector('.vote-times-container').appendChild(createTimeInputHTML());
    datesContainer.appendChild(newGroup);
}

function createTimeInputHTML() {
    const timeGroup = document.createElement('div');
    timeGroup.className = 'flex items-center gap-2';
    timeGroup.innerHTML = `
        <input type"time" class="vote-time-input flex-grow p-1 border rounded-lg">
        <button class="vote-remove-time-btn p-1 text-red-500 hover:bg-red-100 rounded-full" title="Uhrzeit entfernen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" />
            </svg>
        </button>
    `;
    return timeGroup;
}

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