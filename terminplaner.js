// Wir importieren 'doc', 'updateDoc', UND 'getDoc'
import { alertUser, db, votesCollectionRef, currentUser, setButtonLoading, GUEST_MODE } from './haupteingang.js';
import { 
    addDoc, 
    serverTimestamp, 
    getDocs, 
    getDoc, 
    query, 
    where, 
    doc, 
    updateDoc, 
    onSnapshot, 
    orderBy,    
    limit       
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ----- Globale Variablen für den Zustand -----
let dateGroupIdCounter = 0;
let currentVoteData = null;
// NEU: 'selectedOptionIndex' wird nicht mehr gebraucht
// let selectedOptionIndex = null; 
let currentParticipantAnswers = {};

let unsubscribePublicVotes = null;
let unsubscribeAssignedVotes = null;


// Diese Funktion wird von haupteingang.js aufgerufen
export function initializeTerminplanerView() {
    
    // ----- Spion für das Token-Feld -----
    const tokenInput = document.getElementById('vote-token-input');
    if (tokenInput && !tokenInput.dataset.listenerAttached) {
        tokenInput.addEventListener('input', (e) => formatTokenInput(e, 'vote-token-input')); 
        tokenInput.dataset.listenerAttached = 'true';
    }

    // ----- Spion für den "Teilnehmen"-Button -----
    const joinVoteButton = document.getElementById('join-vote-by-token-btn');
    if (joinVoteButton && !joinVoteButton.dataset.listenerAttached) {
        joinVoteButton.addEventListener('click', joinVoteByToken); 
        joinVoteButton.dataset.listenerAttached = 'true';
    }

    // ----- Delegierter Spion für die Listen -----
    const mainView = document.getElementById('terminplaner-main-view');
    if (mainView && !mainView.dataset.listenerAttached) {
        mainView.addEventListener('click', (e) => {
            const pollCard = e.target.closest('.vote-list-item');
            if (pollCard) {
                const voteId = pollCard.dataset.voteId;
                if (voteId) {
                    joinVoteById(voteId); 
                }
            }
        });
        mainView.dataset.listenerAttached = 'true';
    }

    // ----- Spione für das Modal (Pop-up Fenster) -----
    // (Unverändert)
    const openModalButton = document.getElementById('show-create-vote-modal-btn');
    const closeModalButton = document.getElementById('close-create-vote-modal-btn');
    const modal = document.getElementById('createVoteModal');
    if (openModalButton && closeModalButton && modal) {
        if (!openModalButton.dataset.listenerAttached) {
            openModalButton.addEventListener('click', () => {
                modal.style.display = 'flex';
                modal.classList.remove('hidden');
            });
            openModalButton.dataset.listenerAttached = 'true';
        }
        if (!closeModalButton.dataset.listenerAttached) {
            closeModalButton.addEventListener('click', () => {
                modal.style.display = 'none';
                modal.classList.add('hidden');
            });
            closeModalButton.dataset.listenerAttached = 'true';
        }
        const groupPollButton = document.getElementById('select-vote-type-group');
        if (groupPollButton && !groupPollButton.dataset.listenerAttached) {
            groupPollButton.addEventListener('click', () => {
                modal.style.display = 'none'; 
                modal.classList.add('hidden');
                showView('create'); 
            });
            groupPollButton.dataset.listenerAttached = 'true';
        }
        document.getElementById('select-vote-type-event')?.addEventListener('click', () => alertUser("Eventplaner ist noch nicht verfügbar.", "error"));
        document.getElementById('select-vote-type-1on1')?.addEventListener('click', () => alertUser("1:1 ist noch nicht verfügbar.", "error"));
        document.getElementById('select-vote-type-booking')?.addEventListener('click', () => alertUser("Buchungsseite ist noch nicht verfügbar.", "error"));
    }

    // ----- Spione für den Erstellungs-Assistenten -----
    // (Unverändert, bis auf Hinzufügen von 'unlimitedCheckbox')
    const cancelCreationButton = document.getElementById('cancel-vote-creation-btn');
    if (cancelCreationButton && !cancelCreationButton.dataset.listenerAttached) {
        cancelCreationButton.addEventListener('click', () => {
            if (confirm("Möchtest du die Erstellung wirklich abbrechen? Alle Eingaben gehen verloren.")) {
                showView('main'); 
            }
        });
        cancelCreationButton.dataset.listenerAttached = 'true';
    }
    const unlimitedCheckbox = document.getElementById('vote-end-time-unlimited');
    if (unlimitedCheckbox && !unlimitedCheckbox.dataset.listenerAttached) {
        unlimitedCheckbox.addEventListener('change', (e) => {
            const endTimeInput = document.getElementById('vote-end-time');
            if (endTimeInput) {
                endTimeInput.disabled = e.target.checked;
                if (e.target.checked) {
                    endTimeInput.value = ''; 
                }
            }
        });
        unlimitedCheckbox.dataset.listenerAttached = 'true';
    }
    const addDateButton = document.getElementById('vote-add-date-btn');
    if (addDateButton && !addDateButton.dataset.listenerAttached) {
        addDateButton.addEventListener('click', addNewDateGroup);
        addDateButton.dataset.listenerAttached = 'true';
    }
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
    const saveVoteButton = document.getElementById('vote-save-group-poll-btn');
    if (saveVoteButton && !saveVoteButton.dataset.listenerAttached) {
        saveVoteButton.addEventListener('click', saveGroupPoll); 
        saveVoteButton.dataset.listenerAttached = 'true';
    }

    // ----- Spione für die Abstimmungs-Seite -----
    
    // "Zurück"-Button
    const cancelVoteButton = document.getElementById('cancel-vote-participation-btn');
    if (cancelVoteButton && !cancelVoteButton.dataset.listenerAttached) {
        cancelVoteButton.addEventListener('click', () => {
            showView('main'); 
            currentVoteData = null; 
        });
        cancelVoteButton.dataset.listenerAttached = 'true';
    }

    // NEU: Delegierter Spion für die Klicks IN DER TABELLE
    const voteOptionsContainer = document.getElementById('vote-options-container');
    if (voteOptionsContainer && !voteOptionsContainer.dataset.listenerAttached) {
        voteOptionsContainer.addEventListener('click', (e) => {
            // Finde den geklickten Knopf
            const clickedButton = e.target.closest('.vote-grid-btn');
            if (!clickedButton) return; // Klick war woanders

            const optionIndex = clickedButton.dataset.optionIndex;
            const answer = clickedButton.dataset.answer;

            // 1. Speichere die Antwort in unserer globalen Variable
            currentParticipantAnswers[optionIndex] = answer;

            // 2. Aktualisiere die Ansicht (Klasse 'selected' setzen)
            // Finde alle Knöpfe in DIESER Zeile
            const rowButtons = voteOptionsContainer.querySelectorAll(`.vote-grid-btn[data-option-index="${optionIndex}"]`);
            rowButtons.forEach(btn => {
                btn.classList.remove('bg-green-200', 'bg-yellow-200', 'bg-red-200', 'ring-2', 'ring-indigo-500');
            });
            
            // Setze die richtige Hintergrundfarbe für den geklickten Knopf
            if (answer === 'yes') clickedButton.classList.add('bg-green-200', 'ring-2', 'ring-indigo-500');
            if (answer === 'maybe') clickedButton.classList.add('bg-yellow-200', 'ring-2', 'ring-indigo-500');
            if (answer === 'no') clickedButton.classList.add('bg-red-200', 'ring-2', 'ring-indigo-500');
            
            // 3. Prüfe, ob alle Antworten gegeben wurden, um den Speicher-Knopf anzuzeigen
            checkIfAllAnswered();
        });
        voteOptionsContainer.dataset.listenerAttached = 'true';
    }
    
    // "Abstimmung speichern"-Button
    const saveParticipationButton = document.getElementById('vote-save-participation-btn');
    if (saveParticipationButton && !saveParticipationButton.dataset.listenerAttached) {
        saveParticipationButton.addEventListener('click', saveVoteParticipation);
        saveParticipationButton.dataset.listenerAttached = 'true';
    }
    
    // Spion für den "EDIT"-Button (A)
    const editVoteButton = document.getElementById('show-edit-vote-btn');
    if (editVoteButton && !editVoteButton.dataset.listenerAttached) {
        editVoteButton.addEventListener('click', showInlineEditToken); 
        editVoteButton.dataset.listenerAttached = 'true';
    }
    
    // Spion für den "OK"-Button (C)
    const submitEditBtn = document.getElementById('submit-edit-token-inline-btn');
    if (submitEditBtn && !submitEditBtn.dataset.listenerAttached) {
        submitEditBtn.addEventListener('click', checkInlineEditToken);
        submitEditBtn.dataset.listenerAttached = 'true';
    }
    
    // Spion für die Token-Formatierung (B)
    const editTokenInput = document.getElementById('edit-token-input-inline');
    if (editTokenInput && !editTokenInput.dataset.listenerAttached) {
        editTokenInput.addEventListener('input', (e) => formatTokenInput(e, 'edit-token-input-inline'));
        editTokenInput.dataset.listenerAttached = 'true';
    }
    
    // Spion für den "Zurück zur Umfrage"-Button auf der finalen Edit-Seite
    const cancelEditingBtn = document.getElementById('cancel-vote-editing-btn');
    if (cancelEditingBtn && !cancelEditingBtn.dataset.listenerAttached) {
        cancelEditingBtn.addEventListener('click', () => {
            showView('vote');
            joinVoteById(currentVoteData.id); 
        });
        cancelEditingBtn.dataset.listenerAttached = 'true';
    }
}


// ----- SPION-FUNKTIONEN (Listener) -----
// (Unverändert)
export function listenForPublicVotes() { /* ... */ }
export function listenForAssignedVotes(userId) { /* ... */ }
export function stopAssignedVotesListener() { /* ... */ }


// ----- RENDER-FUNKTIONEN FÜR LISTEN -----
// (Unverändert)
function renderPublicVotes(votes) { /* ... */ }
function renderAssignedVotes(votes) { /* ... */ }


// ----- DATENBANK-FUNKTION (Umfrage suchen per Token) -----
// (Unverändert)
async function joinVoteByToken() {
    const tokenInput = document.getElementById('vote-token-input');
    const joinBtn = document.getElementById('join-vote-by-token-btn');
    const token = tokenInput.value.trim().toUpperCase(); 
    if (token.length !== 11 || token[4] !== ' ' || token[5] !== '-' || token[6] !== ' ') {
        alertUser("Ungültiges Token-Format. Es muss 'XXXX - XXXX' sein.", "error");
        return;
    }
    setButtonLoading(joinBtn, true); 
    try {
        const q = query(votesCollectionRef, where("token", "==", token));
        const snapshot = await getDocs(q);
        if (snapshot.empty) throw new Error("Umfrage nicht gefunden. Prüfe den Token.");
        if (snapshot.size > 1) throw new Error("Fehler: Mehrere Umfragen mit diesem Token gefunden. Admin kontaktieren.");
        const voteDoc = snapshot.docs[0];
        const voteData = { id: voteDoc.id, ...voteDoc.data() }; 
        const now = new Date();
        if (voteData.startTime && now < new Date(voteData.startTime)) {
            throw new Error(`Diese Umfrage hat noch nicht begonnen. Sie startet am ${new Date(voteData.startTime).toLocaleString('de-DE')}.`);
        }
        if (voteData.endTime && now > new Date(voteData.endTime)) {
            throw new Error(`Diese Umfrage ist bereits beendet (seit ${new Date(voteData.endTime).toLocaleString('de-DE')}).`);
        }
        currentVoteData = voteData; 
        console.log("Umfrage gefunden:", currentVoteData);
        renderVoteView(currentVoteData);
        showView('vote');
        tokenInput.value = ''; 
    } catch (error) {
        console.error("Fehler beim Suchen der Umfrage:", error);
        alertUser(error.message, "error");
    } finally {
        setButtonLoading(joinBtn, false); 
    }
}

// ----- DATENBANK-FUNKTION (Umfrage suchen per ID) -----
// (Unverändert)
async function joinVoteById(voteId) {
    try {
        const voteDocRef = doc(votesCollectionRef, voteId);
        const voteDoc = await getDoc(voteDocRef); 
        if (!voteDoc.exists()) {
             throw new Error("Diese Umfrage existiert nicht mehr.");
        }
        const voteData = { id: voteDoc.id, ...voteDoc.data() }; 
        const now = new Date();
        if (voteData.startTime && now < new Date(voteData.startTime)) {
            throw new Error(`Diese Umfrage hat noch nicht begonnen. Sie startet am ${new Date(voteData.startTime).toLocaleString('de-DE')}.`);
        }
        if (voteData.endTime && now > new Date(voteData.endTime)) {
            throw new Error(`Diese Umfrage ist bereits beendet (seit ${new Date(voteData.endTime).toLocaleString('de-DE')}).`);
        }
        currentVoteData = voteData; 
        console.log("Umfrage per ID geladen:", currentVoteData);
        renderVoteView(currentVoteData);
        showView('vote');
    } catch (error) {
        console.error("Fehler beim Laden der Umfrage per ID:", error);
        alertUser(error.message, "error");
    }
}


// ----- RENDER-FUNKTION (Abstimmungs-Seite) -----
/**
 * Baut die Abstimmungs-Seite (Tabelle) basierend auf den Umfragedaten auf.
 * KOMPLETT NEU GEBAUT
 */
function renderVoteView(voteData) {
    
    // 1. Titel, Beschreibung und Ort setzen
    document.getElementById('vote-poll-title').textContent = voteData.title;
    
    const descContainer = document.getElementById('vote-poll-description-container');
    const descEl = document.getElementById('vote-poll-description');
    if (voteData.description) {
        descEl.textContent = voteData.description;
        descContainer.classList.remove('hidden');
    } else {
        descContainer.classList.add('hidden');
    }
    
    const locContainer = document.getElementById('vote-poll-location-container');
    const locEl = document.getElementById('vote-poll-location');
    if (voteData.location) {
        locEl.textContent = voteData.location;
        locContainer.classList.remove('hidden');
    } else {
        locContainer.classList.add('hidden');
    }
    // Verstecke die Info-Box ganz, wenn beides leer ist
    if (!voteData.description && !voteData.location) {
        document.getElementById('vote-info-box').classList.add('hidden');
    } else {
        document.getElementById('vote-info-box').classList.remove('hidden');
    }


    // 2. Namensfeld
    const nameContainer = document.getElementById('vote-name-input-container');
    const nameInput = document.getElementById('vote-participant-name');
    let existingParticipant = null;
    let isEditing = false; // Ist der aktuelle User schon in der Teilnehmerliste?
    
    if (currentUser.mode !== GUEST_MODE) {
        existingParticipant = voteData.participants.find(p => p.userId === currentUser.mode);
    }
    
    if (voteData.isAnonymous) {
        nameContainer.classList.add('hidden');
    } else {
        nameContainer.classList.remove('hidden');
        if (existingParticipant) {
            nameInput.value = existingParticipant.name;
            nameInput.disabled = true; 
            isEditing = true;
        } else if (currentUser.mode !== GUEST_MODE) {
            nameInput.value = currentUser.displayName;
            nameInput.disabled = false;
        } else {
            nameInput.value = ''; 
            nameInput.disabled = false;
        }
    }
    
    // 3. Antworten laden
    currentParticipantAnswers = {};
    if (existingParticipant) {
        // Lade die gespeicherten Antworten
        currentParticipantAnswers = { ...existingParticipant.answers };
    }

    // 4. Ansichten (Teilnahme, Edit-Token) zurücksetzen
    const saveButton = document.getElementById('vote-save-participation-btn');
    const editButton = document.getElementById('show-edit-vote-btn');
    
    // Setze den Edit-Wrapper zurück
    resetEditWrapper();
    
    // 5. Prüfen, ob Termin fixiert ist
    if (voteData.fixedOptionIndex != null) {
        // JA, EIN TERMIN IST FIXIERT
        nameContainer.classList.add('hidden'); // Verstecke Namensfeld
        saveButton.classList.add('hidden');    // Verstecke Speichern-Knopf
        editButton.classList.add('hidden');    // Verstecke Edit-Knopf
        
        // Zeige die "Fixiert"-Nachricht
        updatePollTableAnswers(voteData); 

    } else {
        // NEIN, es ist eine normale Abstimmung
        saveButton.classList.add('hidden'); // Bleibt versteckt, bis alles ausgefüllt ist
        editButton.classList.remove('hidden'); // EDIT-Knopf anzeigen
        
        // Baue die Abstimmungs-Tabelle
        updatePollTableAnswers(voteData); 
        
        // Prüfe, ob der Speicher-Knopf angezeigt werden soll
        // (falls der User schon teilgenommen hat und alle Antworten geladen sind)
        checkIfAllAnswered();
    }
}

/**
 * Baut die Abstimmungs-Tabelle neu auf und füllt sie mit allen Antworten
 * KOMPLETT NEU GEBAUT
 */
function updatePollTableAnswers(voteData) {
    const optionsContainer = document.getElementById('vote-options-container');

    // 1. Fall: Termin ist fixiert -> Zeige die grüne Box
    if (voteData.fixedOptionIndex != null) {
        const fixedOption = voteData.options[voteData.fixedOptionIndex];
        if (fixedOption) {
            const dateObj = new Date(fixedOption.date + 'T12:00:00');
            const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
            optionsContainer.innerHTML = `
                <div class="p-6 bg-green-100 border-l-4 border-green-500 rounded-lg text-center">
                    <h3 class="text-xl font-bold text-green-800">Termin fixiert!</h3>
                    <p class="text-lg text-gray-700 mt-2">
                        Die Umfrage ist geschlossen. Der finale Termin ist:
                    </p>
                    <p class="text-3xl font-bold text-black mt-3">
                        ${niceDate}
                    </p>
                    <p class="text-3xl font-bold text-black mt-1">
                        ${fixedOption.time} Uhr
                    </p>
                </div>
            `;
            return; 
        }
    }
    
    // 2. Fall: Normale Abstimmung -> Baue die Tabelle
    const optionsByDate = {};
    voteData.options.forEach((option, index) => {
        if (!optionsByDate[option.date]) {
            optionsByDate[option.date] = []; 
        }
        optionsByDate[option.date].push({ ...option, originalIndex: index });
    });

    let tableHTML = '<table class="w-full border-collapse text-sm text-left bg-white">';
    
    // 3. Kopfzeile der Tabelle
    tableHTML += '<thead><tr class="bg-gray-50">';
    tableHTML += '<th class="p-3 border-b sticky left-0 bg-gray-50 z-10 w-48">Termin</th>';
    
    // Spalten für jeden Teilnehmer
    voteData.participants.forEach(p => {
        // Wenn der Teilnehmer der aktuelle User ist, überspringe ihn (er kommt in die "Du"-Spalte)
        if (p.userId === currentUser.mode) return; 
        tableHTML += `<th class="p-3 border-b text-center w-24">${p.name}</th>`;
    });
    
    // Spalte für "Du" (den aktuellen User)
    tableHTML += `<th class="p-3 border-b text-center w-48 sticky right-0 bg-gray-50 z-10 font-bold text-indigo-600">Du</th>`;
    tableHTML += '</tr></thead>';

    // 4. Zeilen der Tabelle
    tableHTML += '<tbody>';
    
    for (const date in optionsByDate) {
        const dateObj = new Date(date + 'T12:00:00'); 
        const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

        tableHTML += `
            <tr class="bg-gray-100">
                <td class="p-2 font-bold sticky left-0 bg-gray-100 z-10" colspan="${voteData.participants.length + 2}">${niceDate}</td>
            </tr>
        `;

        // Uhrzeit-Zeilen
        optionsByDate[date].forEach(option => {
            const optionIndex = option.originalIndex;
            
            tableHTML += `
                <tr class="vote-option-row" data-option-index="${optionIndex}">
                    <td class="p-3 border-b font-mono sticky left-0 bg-white z-10">${option.time} Uhr</td>
            `;

            // Spalten für gespeicherte Teilnehmer
            voteData.participants.forEach(p => {
                if (p.userId === currentUser.mode) return; // Überspringen
                const answer = p.answers[optionIndex]; 
                let answerIcon = '';
                if (answer === 'yes') answerIcon = '<span class="text-green-500 font-bold text-xl">✔</span>';
                if (answer === 'no') answerIcon = '<span class="text-red-500 font-bold text-xl">✘</span>';
                if (answer === 'maybe') answerIcon = '<span class="text-yellow-500 font-bold text-xl">?</span>';
                tableHTML += `<td class="p-3 border-b text-center">${answerIcon}</td>`;
            });
            
            // Spalte für "Du" (Interaktiv)
            const currentAnswer = currentParticipantAnswers[optionIndex];
            const yesSelected = currentAnswer === 'yes' ? 'bg-green-200 ring-2 ring-indigo-500' : 'hover:bg-green-100';
            const maybeSelected = currentAnswer === 'maybe' ? 'bg-yellow-200 ring-2 ring-indigo-500' : 'hover:bg-yellow-100';
            const noSelected = currentAnswer === 'no' ? 'bg-red-200 ring-2 ring-indigo-500' : 'hover:bg-red-100';
            const maybeHidden = voteData.disableMaybe ? 'hidden' : '';

            tableHTML += `
                <td class="p-2 border-b sticky right-0 bg-white z-10">
                    <div class="flex justify-center gap-1">
                        <button class="vote-grid-btn p-2 rounded-lg ${yesSelected} transition-colors" data-option-index="${optionIndex}" data-answer="yes">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-green-600"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" /></svg>
                        </button>
                        <button class="vote-grid-btn p-2 rounded-lg ${maybeSelected} ${maybeHidden} transition-colors" data-option-index="${optionIndex}" data-answer="maybe">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-yellow-600"><path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.75 6a.75.75 0 0 0-1.5 0v5.5a.75.75 0 0 0 1.5 0V6ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" /></svg>
                        </button>
                        <button class="vote-grid-btn p-2 rounded-lg ${noSelected} transition-colors" data-option-index="${optionIndex}" data-answer="no">
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-red-600"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                        </button>
                    </div>
                </td>
            `;
            tableHTML += '</tr>';
        });
    }
    
    tableHTML += '</tbody></table>';
    optionsContainer.innerHTML = tableHTML;
}


// ----- NEU: HELFER-FUNKTION zum Prüfen der Antworten -----
function checkIfAllAnswered() {
    const saveBtn = document.getElementById('vote-save-participation-btn');
    if (!currentVoteData) {
        saveBtn.classList.add('hidden');
        return;
    }
    
    const totalOptions = currentVoteData.options.length;
    const answeredCount = Object.keys(currentParticipantAnswers).length;
    
    // Prüfe, ob für JEDE Option eine Antwort existiert
    let allAnswered = true;
    for (let i = 0; i < totalOptions; i++) {
        if (!currentParticipantAnswers[i]) {
            allAnswered = false;
            break;
        }
    }

    if (allAnswered) {
        saveBtn.classList.remove('hidden'); // Alle beantwortet -> Knopf anzeigen
    } else {
        saveBtn.classList.add('hidden'); // Es fehlen noch Antworten -> Knopf verstecken
    }
}


// ----- DATENBANK-FUNKTION (Abstimmung speichern) -----
// (Unverändert)
async function saveVoteParticipation() {
    const saveBtn = document.getElementById('vote-save-participation-btn');
    const nameInput = document.getElementById('vote-participant-name');
    let participantName = nameInput.value.trim();
    if (!currentVoteData) return alertUser("Fehler: Keine Umfrage geladen.", "error");
    if (!currentVoteData.isAnonymous && !participantName) {
        return alertUser("Bitte gib deinen Namen ein.", "error");
    }
    if (currentVoteData.isAnonymous) {
        participantName = "Anonym";
    }
    if (Object.keys(currentParticipantAnswers).length === 0) {
        return alertUser("Du hast noch für keinen Termin abgestimmt.", "error");
    }
    // NEU: Doppelte Prüfung, ob wirklich alle beantwortet sind
    if (Object.keys(currentParticipantAnswers).length !== currentVoteData.options.length) {
         return alertUser("Bitte wähle für JEDEN Termin eine Antwort aus.", "error");
    }
    
    setButtonLoading(saveBtn, true);
    try {
        const participantId = (currentUser.mode !== GUEST_MODE) ? currentUser.mode : participantName;
        let existingParticipantIndex = -1;
        if (currentUser.mode !== GUEST_MODE) {
             existingParticipantIndex = currentVoteData.participants.findIndex(p => p.userId === participantId);
        } else if (!currentVoteData.isAnonymous) {
             existingParticipantIndex = currentVoteData.participants.findIndex(p => p.name === participantId);
        }
        const newParticipantsArray = [...currentVoteData.participants]; 
        if (existingParticipantIndex > -1) {
            newParticipantsArray[existingParticipantIndex].answers = currentParticipantAnswers;
        } else {
            newParticipantsArray.push({
                userId: participantId,
                name: participantName,
                answers: currentParticipantAnswers
            });
        }
        const participantIds = newParticipantsArray.map(p => p.userId);
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        await updateDoc(voteDocRef, {
            participants: newParticipantsArray,
            participantIds: participantIds 
        });
        alertUser("Deine Abstimmung wurde gespeichert!", "success");
        currentVoteData.participants = newParticipantsArray;
        currentVoteData.participantIds = participantIds;
        renderVoteView(currentVoteData); // Lädt die Ansicht neu (jetzt mit dir in der Teilnehmerliste)
    } catch (error) {
        console.error("Fehler beim Speichern der Abstimmung:", error);
        alertUser("Fehler beim Speichern: " + error.message, "error");
    } finally {
        setButtonLoading(saveBtn, false);
    }
}


// ----- SPEICHER-FUNKTION (Erstellung) -----
// (ERWEITERT: Speichert jetzt Ort, Zeiten und "Vielleicht"-Einstellung)
async function saveGroupPoll() {
    const saveBtn = document.getElementById('vote-save-group-poll-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Wird gespeichert...';
    try {
        const title = document.getElementById('vote-title').value.trim();
        const description = document.getElementById('vote-description').value.trim();
        const location = document.getElementById('vote-location').value.trim();
        const startTimeInput = document.getElementById('vote-start-time').value;
        const endTimeInput = document.getElementById('vote-end-time').value;
        const isEndTimeUnlimited = document.getElementById('vote-end-time-unlimited').checked;
        const startTime = startTimeInput ? new Date(startTimeInput) : null;
        const endTime = !isEndTimeUnlimited && endTimeInput ? new Date(endTimeInput) : null;
        const isPublic = document.getElementById('vote-setting-public').checked;
        const isAnonymous = document.getElementById('vote-setting-anonymous').checked;
        const disableMaybe = document.getElementById('vote-setting-disable-maybe').checked; 
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
                        options.push({ date: dateValue, time: timeValue });
                        hasValidOption = true;
                    }
                });
            }
        });
        if (!title) throw new Error("Bitte gib einen Titel für die Umfrage ein.");
        if (!hasValidOption) throw new Error("Bitte füge mindestens einen gültigen Termin (Datum + Uhrzeit) hinzu.");
        const token = generateVoteToken();
        const editToken = generateVoteToken(); 
        const voteData = {
            title: title,
            description: description,
            location: location || null, 
            startTime: startTime,      
            endTime: endTime,          
            disableMaybe: disableMaybe,
            type: 'group-poll',
            token: token,
            editToken: editToken, 
            isPublic: isPublic,
            isAnonymous: isAnonymous,
            createdBy: currentUser.mode, 
            createdByName: currentUser.displayName || currentUser.mode, 
            createdAt: serverTimestamp(), 
            options: options, 
            participants: [],
            participantIds: [],
            fixedOptionIndex: null 
        };
        console.log("Speichere Umfrage in Firebase...", voteData);
        const docRef = await addDoc(votesCollectionRef, voteData);
        console.log(`Umfrage erstellt! ID: ${docRef.id}, Token: ${token}, Edit-Token: ${editToken}`);
        alertUser(`Umfrage erstellt! Teilnahme-Token: ${token} (Zum Bearbeiten: ${editToken})`, "success");
        showView('main'); 
    } catch (error) {
        console.error("Fehler beim Speichern der Umfrage:", error);
        alertUser(error.message, "error");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Umfrage erstellen und Link erhalten';
    }
}


// ----- FUNKTIONEN für das INLINE EDIT -----
// (Unverändert)
function showInlineEditToken() {
    const editButton = document.getElementById('show-edit-vote-btn');
    const tokenInput = document.getElementById('edit-token-input-inline');
    const submitButton = document.getElementById('submit-edit-token-inline-btn');
    if (!editButton || !tokenInput || !submitButton || !currentVoteData) return;
    editButton.classList.add('hidden');
    tokenInput.classList.remove('hidden');
    submitButton.classList.remove('hidden');
    if (currentUser.mode === currentVoteData.createdBy) {
        tokenInput.value = currentVoteData.editToken; 
        tokenInput.disabled = true; 
    } else {
        tokenInput.value = ''; 
        tokenInput.disabled = false;
        tokenInput.focus(); 
    }
}
// (Unverändert)
function resetEditWrapper() {
    document.getElementById('show-edit-vote-btn')?.classList.remove('hidden');
    document.getElementById('edit-token-input-inline')?.classList.add('hidden');
    document.getElementById('submit-edit-token-inline-btn')?.classList.add('hidden');
}
// (Unverändert)
function checkInlineEditToken() {
    const input = document.getElementById('edit-token-input-inline');
    const token = input.value.trim().toUpperCase();
    if (currentVoteData && token === currentVoteData.editToken) {
        alertUser("Token korrekt! Lade Bearbeitungs-Modus...", "success");
        showView('edit');
        renderEditView(currentVoteData);
    } else {
        alertUser("Falscher Bearbeitungs-Token!", "error");
    }
}

// ----- PLATZHALTER für die Bearbeitungs-Ansicht -----
// (Unverändert)
function renderEditView(voteData) {
    document.getElementById('edit-poll-title').textContent = `"${voteData.title}" bearbeiten`;
    // TODO: Nächster Schritt
}


// ----- HELFER-FUNKTIONEN (Rest) -----
// (Unverändert)
function showView(viewName) { 
    document.getElementById('terminplaner-main-view').classList.add('hidden');
    document.getElementById('terminplaner-create-view').classList.add('hidden');
    document.getElementById('terminplaner-vote-view').classList.add('hidden');
    document.getElementById('terminplaner-edit-view').classList.add('hidden');
    
    if (viewName === 'main') {
        document.getElementById('terminplaner-main-view').classList.remove('hidden');
    } else if (viewName === 'create') {
        document.getElementById('terminplaner-create-view').classList.remove('hidden');
        resetCreateWizard(); 
    } else if (viewName === 'vote') {
       document.getElementById('terminplaner-vote-view').classList.remove('hidden');
       resetEditWrapper();
       // WICHTIG: Die Teilnahme-Box wird jetzt von renderVoteView gesteuert
    } else if (viewName === 'edit') {
       document.getElementById('terminplaner-edit-view').classList.remove('hidden');
    }
}
// (Unverändert)
function resetCreateWizard() {
    document.getElementById('vote-title').value = '';
    document.getElementById('vote-description').value = '';
    document.getElementById('vote-location').value = '';
    document.getElementById('vote-start-time').value = getCurrentDateTimeLocalString();
    const endTimeInput = document.getElementById('vote-end-time');
    const unlimitedCheckbox = document.getElementById('vote-end-time-unlimited');
    endTimeInput.value = '';
    unlimitedCheckbox.checked = true;
    endTimeInput.disabled = true; 
    document.getElementById('vote-setting-public').checked = false;
    document.getElementById('vote-setting-anonymous').checked = false;
    document.getElementById('vote-setting-disable-maybe').checked = false; 
    document.getElementById('vote-dates-container').innerHTML = '';
    dateGroupIdCounter = 0;
    addNewDateGroup();
}
// (Unverändert)
function getCurrentDateTimeLocalString() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000; 
    const localNow = new Date(now.getTime() - offset);
    return localNow.toISOString().slice(0, 16); 
}
// (Unverändert)
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
// (Unverändert)
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
// (Unverändert)
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
// (Unverändert)
function formatTokenInput(e, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
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