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
let selectedOptionIndex = null;
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
    // (Dieser Teil bleibt unverändert)
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
    // (Dieser Teil bleibt unverändert)
    const cancelCreationButton = document.getElementById('cancel-vote-creation-btn');
    if (cancelCreationButton && !cancelCreationButton.dataset.listenerAttached) {
        cancelCreationButton.addEventListener('click', () => {
            if (confirm("Möchtest du die Erstellung wirklich abbrechen? Alle Eingaben gehen verloren.")) {
                showView('main'); 
            }
        });
        cancelCreationButton.dataset.listenerAttached = 'true';
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
            showView('main'); // KORREKTUR: Geht jetzt immer zur Hauptseite
            currentVoteData = null; 
        });
        cancelVoteButton.dataset.listenerAttached = 'true';
    }

    // "Ja/Nein/Vielleicht"-Buttons
    document.querySelectorAll('.vote-answer-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', () => {
                if (selectedOptionIndex === null) return; 
                const answer = btn.dataset.answer; 
                currentParticipantAnswers[selectedOptionIndex] = answer;
                updatePollTableAnswers(currentVoteData);
                document.querySelectorAll('.vote-answer-btn').forEach(b => b.classList.remove('ring-4', 'ring-indigo-500'));
                btn.classList.add('ring-4', 'ring-indigo-500');
            });
            btn.dataset.listenerAttached = 'true';
        }
    });
    
    // "Abstimmung speichern"-Button
    const saveParticipationButton = document.getElementById('vote-save-participation-btn');
    if (saveParticipationButton && !saveParticipationButton.dataset.listenerAttached) {
        saveParticipationButton.addEventListener('click', saveVoteParticipation);
        saveParticipationButton.dataset.listenerAttached = 'true';
    }
    
    // ----- NEU: Spione für den "Transformations-Button" -----
    
    // Spion für den "EDIT"-Button (A)
    const editVoteButton = document.getElementById('show-edit-vote-btn');
    if (editVoteButton && !editVoteButton.dataset.listenerAttached) {
        editVoteButton.addEventListener('click', showInlineEditToken); // <-- Ruft die neue Inline-Funktion auf
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
            // Wir gehen zurück zur Abstimmungs-Ansicht
            showView('vote');
            // Wir müssen die Abstimmungs-Ansicht neu laden, falls
            // der Admin in der Zwischenzeit etwas geändert hat (z.B. Termin fixiert)
            joinVoteById(currentVoteData.id); 
        });
        cancelEditingBtn.dataset.listenerAttached = 'true';
    }
}


// ----- SPION-FUNKTIONEN (Listener) -----
// (Unverändert)
export function listenForPublicVotes() {
    if (unsubscribePublicVotes) unsubscribePublicVotes();
    const q = query(
        votesCollectionRef, 
        where("isPublic", "==", true), 
        orderBy("createdAt", "desc"), 
        limit(20) 
    );
    unsubscribePublicVotes = onSnapshot(q, (snapshot) => {
        const votes = [];
        snapshot.forEach(doc => {
            votes.push({ id: doc.id, ...doc.data() });
        });
        renderPublicVotes(votes); 
    }, (error) => {
        console.error("Fehler beim Lauschen auf öffentliche Umfragen:", error);
    });
}
// (Unverändert)
export function listenForAssignedVotes(userId) {
    if (unsubscribeAssignedVotes) unsubscribeAssignedVotes();
    if (!userId || userId === GUEST_MODE) {
        renderAssignedVotes([]); 
        return;
    }
    const q = query(
        votesCollectionRef, 
        where("participantIds", "array-contains", userId),
        orderBy("createdAt", "desc"), 
        limit(20)
    );
    unsubscribeAssignedVotes = onSnapshot(q, (snapshot) => {
        const votes = [];
        snapshot.forEach(doc => {
            votes.push({ id: doc.id, ...doc.data() });
        });
        renderAssignedVotes(votes); 
    }, (error) => {
        console.error("Fehler beim Lauschen auf zugewiesene Umfragen:", error);
    });
}
// (Unverändert)
export function stopAssignedVotesListener() {
    if (unsubscribeAssignedVotes) {
        unsubscribeAssignedVotes();
        unsubscribeAssignedVotes = null;
    }
    renderAssignedVotes([]); 
}


// ----- RENDER-FUNKTIONEN FÜR LISTEN -----
// (Unverändert, aber mit "createdByName")
function renderPublicVotes(votes) {
    const listContainer = document.getElementById('public-votes-list');
    if (!listContainer) return;
    if (votes.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">Derzeit gibt es keine öffentlichen Umfragen.</p>`;
        return;
    }
    listContainer.innerHTML = votes.map(vote => {
        const niceDate = vote.createdAt?.toDate().toLocaleDateString('de-DE') || '...';
        const fixedTag = vote.fixedOptionIndex != null ? '<span class="ml-2 bg-green-200 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">FIXIERT</span>' : '';
        return `
            <div class="vote-list-item card bg-white p-3 rounded-lg shadow-sm border flex justify-between items-center cursor-pointer hover:bg-indigo-50"
                 data-vote-id="${vote.id}">
                <div>
                    <span class="font-bold text-indigo-700">${vote.title}</span>
                    ${fixedTag}
                    <span class="text-sm text-gray-500 ml-2">(${vote.participants?.length || 0} Teilnehmer)</span>
                    <p class="text-xs text-gray-500">Erstellt von ${vote.createdByName} am ${niceDate}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-indigo-600"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" /></svg>
            </div>
        `;
    }).join('');
}
// (Unverändert, aber mit "createdByName")
function renderAssignedVotes(votes) {
    const listContainer = document.getElementById('assigned-votes-list');
    if (!listContainer) return;
    if (currentUser.mode === GUEST_MODE) {
         listContainer.innerHTML = `<p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">Melde dich an, um Umfragen zu sehen, an denen du teilgenommen hast.</p>`;
        return;
    }
    if (votes.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">Du hast noch an keiner Umfrage teilgenommen.</p>`;
        return;
    }
    listContainer.innerHTML = votes.map(vote => {
        const niceDate = vote.createdAt?.toDate().toLocaleDateString('de-DE') || '...';
        const fixedTag = vote.fixedOptionIndex != null ? '<span class="ml-2 bg-green-200 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">FIXIERT</span>' : '';
        return `
            <div class="vote-list-item card bg-white p-3 rounded-lg shadow-sm border flex justify-between items-center cursor-pointer hover:bg-indigo-50"
                 data-vote-id="${vote.id}">
                <div>
                    <span class="font-bold text-indigo-700">${vote.title}</span>
                    ${fixedTag}
                    <span class="text-sm text-gray-500 ml-2">(${vote.participants?.length || 0} Teilnehmer)</span>
                    <p class="text-xs text-gray-500">Erstellt von ${vote.createdByName} am ${niceDate}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-indigo-600"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" /></svg>
            </div>
        `;
    }).join('');
}


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
        currentVoteData = { id: voteDoc.id, ...voteDoc.data() }; 
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
        currentVoteData = { id: voteDoc.id, ...voteDoc.data() }; 
        console.log("Umfrage per ID geladen:", currentVoteData);
        renderVoteView(currentVoteData);
        showView('vote');
    } catch (error) {
        console.error("Fehler beim Laden der Umfrage per ID:", error);
        alertUser(error.message, "error");
    }
}


// ----- RENDER-FUNKTION (Abstimmungs-Seite) -----
// (Angepasst für "fixedOptionIndex" und "EDIT"-Button)
function renderVoteView(voteData) {
    // 1. Titel und Beschreibung
    document.getElementById('vote-poll-title').textContent = voteData.title;
    const descEl = document.getElementById('vote-poll-description');
    if (voteData.description) {
        descEl.textContent = voteData.description;
        descEl.classList.remove('hidden');
    } else {
        descEl.classList.add('hidden');
    }

    // 2. Namensfeld
    const nameContainer = document.getElementById('vote-name-input-container');
    const nameInput = document.getElementById('vote-participant-name');
    let existingParticipant = null;
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
        currentParticipantAnswers = existingParticipant.answers;
    }
    selectedOptionIndex = null;
    document.getElementById('vote-selected-option-text').textContent = "Bitte wähle einen Termin aus der Tabelle aus.";
    document.querySelectorAll('.vote-answer-btn').forEach(btn => btn.disabled = true);
    
    // 4. NEU: Ansichten (Teilnahme, Edit-Token) zurücksetzen
    const participationContainer = document.getElementById('vote-participation-container');
    const saveButton = document.getElementById('vote-save-participation-btn');
    const editButton = document.getElementById('show-edit-vote-btn');
    
    // NEU: Setze den Edit-Wrapper zurück
    resetEditWrapper();

    if (voteData.fixedOptionIndex != null) {
        // JA, EIN TERMIN IST FIXIERT
        participationContainer.classList.add('hidden');
        saveButton.classList.add('hidden');
        editButton.classList.add('hidden'); // EDIT-Knopf auch verstecken
    } else {
        // NEIN, es ist eine normale Abstimmung
        participationContainer.classList.remove('hidden');
        saveButton.classList.remove('hidden');
        editButton.classList.remove('hidden'); // EDIT-Knopf anzeigen
    }

    // 5. Die Abstimmungs-Tabelle bauen
    updatePollTableAnswers(voteData); 
    
    // 6. Klick-Spione für die neuen Tabellen-Zeilen hinzufügen
    const optionsContainer = document.getElementById('vote-options-container');
    optionsContainer.querySelectorAll('.vote-option-row').forEach(row => {
         row.replaceWith(row.cloneNode(true));
    });
    optionsContainer.querySelectorAll('.vote-option-row').forEach(row => {
        row.addEventListener('click', () => {
            if (voteData.fixedOptionIndex != null) return; 
            optionsContainer.querySelectorAll('.vote-option-row').forEach(r => r.classList.remove('bg-blue-200'));
            row.classList.add('bg-blue-200');
            selectedOptionIndex = parseInt(row.dataset.optionIndex);
            const selectedOption = voteData.options[selectedOptionIndex];
            const dateObj = new Date(selectedOption.date + 'T12:00:00');
            const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
            document.getElementById('vote-selected-option-text').textContent = 
                `Du stimmst ab für: ${niceDate} um ${selectedOption.time} Uhr`;
            document.querySelectorAll('.vote-answer-btn').forEach(btn => btn.disabled = false);
            document.querySelectorAll('.vote-answer-btn').forEach(btn => btn.classList.remove('ring-4', 'ring-indigo-500'));
            const currentAnswer = currentParticipantAnswers[selectedOptionIndex];
            if (currentAnswer) {
                document.querySelector(`.vote-answer-btn[data-answer="${currentAnswer}"]`)?.classList.add('ring-4', 'ring-indigo-500');
            }
        });
    });
}

// ----- Funktion zum Aktualisieren der Tabelle -----
// (Unverändert)
function updatePollTableAnswers(voteData) {
    const optionsContainer = document.getElementById('vote-options-container');

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
    
    const optionsByDate = {};
    voteData.options.forEach((option, index) => {
        if (!optionsByDate[option.date]) {
            optionsByDate[option.date] = []; 
        }
        optionsByDate[option.date].push({ ...option, originalIndex: index });
    });

    let tableHTML = '<table class="w-full border-collapse text-sm text-left">';
    tableHTML += '<thead><tr class="bg-gray-50">';
    tableHTML += '<th class="p-2 border-b sticky left-0 bg-gray-50 z-10">Termin</th>';
    voteData.participants.forEach(p => {
        tableHTML += `<th class="p-2 border-b text-center">${p.name}</th>`;
    });
    let showYouColumn = true;
    if(currentUser.mode !== GUEST_MODE && voteData.participants.find(p => p.userId === currentUser.mode)) {
        showYouColumn = false;
    }
    if (showYouColumn) {
        tableHTML += `<th class="p-2 border-b text-center font-bold text-indigo-600">Du</th>`;
    }
    tableHTML += '</tr></thead>';
    tableHTML += '<tbody>';
    for (const date in optionsByDate) {
        const dateObj = new Date(date + 'T12:00:00'); 
        const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
        tableHTML += `
            <tr class="bg-gray-100">
                <td class="p-2 font-bold sticky left-0 bg-gray-100 z-10" colspan="${voteData.participants.length + 2}">${niceDate}</td>
            </tr>
        `;
        optionsByDate[date].forEach(option => {
            const isSelected = option.originalIndex === selectedOptionIndex;
            tableHTML += `
                <tr class="vote-option-row ${isSelected ? 'bg-blue-200' : 'hover:bg-blue-50'} cursor-pointer" data-option-index="${option.originalIndex}">
                    <td class="p-2 border-b font-mono sticky left-0 ${isSelected ? 'bg-blue-200' : 'bg-white'} z-10">${option.time} Uhr</td>
            `;
            voteData.participants.forEach(p => {
                const answer = p.answers[option.originalIndex]; 
                let answerIcon = '';
                if (answer === 'yes') answerIcon = '<span class="text-green-500 font-bold">✔</span>';
                if (answer === 'no') answerIcon = '<span class="text-red-500 font-bold">✘</span>';
                if (answer === 'maybe') answerIcon = '<span class="text-yellow-500 font-bold">?</span>';
                tableHTML += `<td class="p-2 border-b text-center">${answerIcon}</td>`;
            });
            if (showYouColumn) {
                const currentAnswer = currentParticipantAnswers[option.originalIndex];
                let currentIcon = '';
                if (currentAnswer === 'yes') currentIcon = '<span class="text-green-500 font-bold">✔</span>';
                if (currentAnswer === 'no') currentIcon = '<span class="text-red-500 font-bold">✘</span>';
                if (currentAnswer === 'maybe') currentIcon = '<span class="text-yellow-500 font-bold">?</span>';
                tableHTML += `<td class="p-2 border-b text-center bg-indigo-50">${currentIcon}</td>`;
            }
            tableHTML += '</tr>';
        });
    }
    tableHTML += '</tbody></table>';
    optionsContainer.innerHTML = tableHTML;
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
        renderVoteView(currentVoteData); 
    } catch (error) {
        console.error("Fehler beim Speichern der Abstimmung:", error);
        alertUser("Fehler beim Speichern: " + error.message, "error");
    } finally {
        setButtonLoading(saveBtn, false);
    }
}


// ----- SPEICHER-FUNKTION (Erstellung) -----
// (Angepasst für 'editToken' und 'createdBy' ID)
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
            type: 'group-poll',
            token: token,
            editToken: editToken, // <-- Der Bearbeitungs-Token
            isPublic: isPublic,
            isAnonymous: isAnonymous,
            createdBy: currentUser.mode, // <-- Die Benutzer-ID (z.B. "JASMIN")
            createdByName: currentUser.displayName || currentUser.mode, // Der Anzeigename
            createdAt: serverTimestamp(), 
            options: options, 
            participants: [],
            participantIds: [],
            fixedOptionIndex: null // Feld für fixierten Termin
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


// ----- NEUE FUNKTIONEN für das INLINE EDIT -----

// Wird aufgerufen, wenn man auf "EDIT" klickt
function showInlineEditToken() {
    const editButton = document.getElementById('show-edit-vote-btn');
    const tokenInput = document.getElementById('edit-token-input-inline');
    const submitButton = document.getElementById('submit-edit-token-inline-btn');
    
    if (!editButton || !tokenInput || !submitButton || !currentVoteData) return;
    
    // 1. Verstecke den "EDIT"-Knopf
    editButton.classList.add('hidden');
    
    // 2. Zeige das Eingabefeld und den "OK"-Knopf
    tokenInput.classList.remove('hidden');
    submitButton.classList.remove('hidden');

    // 3. Prüfe, ob der aktuelle Benutzer der Ersteller ist
    if (currentUser.mode === currentVoteData.createdBy) {
        tokenInput.value = currentVoteData.editToken; 
        tokenInput.disabled = true; 
    } else {
        tokenInput.value = ''; 
        tokenInput.disabled = false;
        tokenInput.focus(); // Fokus auf das Feld für Gäste
    }
}

// Setzt den Edit-Button auf den Standard (nur "EDIT" anzeigen) zurück
function resetEditWrapper() {
    document.getElementById('show-edit-vote-btn')?.classList.remove('hidden');
    document.getElementById('edit-token-input-inline')?.classList.add('hidden');
    document.getElementById('submit-edit-token-inline-btn')?.classList.add('hidden');
}

// Wird aufgerufen, wenn man im Inline-Block auf "OK" klickt
function checkInlineEditToken() {
    const input = document.getElementById('edit-token-input-inline');
    const token = input.value.trim().toUpperCase();
    
    // Prüfe, ob der eingegebene Token mit dem der Umfrage übereinstimmt
    if (currentVoteData && token === currentVoteData.editToken) {
        alertUser("Token korrekt! Lade Bearbeitungs-Modus...", "success");
        
        // Zeige die (noch leere) Bearbeitungs-Ansicht
        showView('edit');
        
        // Fülle die Bearbeitungs-Ansicht (im nächsten Schritt)
        renderEditView(currentVoteData);
        
    } else {
        alertUser("Falscher Bearbeitungs-Token!", "error");
    }
}

// NEU: Platzhalter für die Render-Funktion der Bearbeitungs-Seite
function renderEditView(voteData) {
    // Fülle den Titel in der Bearbeitungs-Ansicht
    document.getElementById('edit-poll-title').textContent = `"${voteData.title}" bearbeiten`;
    
    // TODO:
    // Hier bauen wir im nächsten Schritt die Bearbeitungs-Logik auf:
    // 1. Liste aller Termine mit Checkbox zum "Fixieren"
    // 2. Liste aller Teilnehmer mit "Löschen"-Knopf
    // 3. "Umfrage löschen"-Knopf
}


// ----- HELFER-FUNKTIONEN (Rest) -----

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
        // NEU: Setze beim Anzeigen der Vote-Ansicht immer den Edit-Knopf zurück
        resetEditWrapper();
    } else if (viewName === 'edit') {
       document.getElementById('terminplaner-edit-view').classList.remove('hidden');
    }
}

function resetCreateWizard() {
    document.getElementById('vote-title').value = '';
    document.getElementById('vote-description').value = '';
    document.getElementById('vote-dates-container').innerHTML = '';
    document.getElementById('vote-setting-public').checked = false;
    document.getElementById('vote-setting-anonymous').checked = false;
    dateGroupIdCounter = 0;
    addNewDateGroup();
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
        <input type="time" class="vote-time-input flex-grow p-1 border rounded-lg">
        <button class="vote-remove-time-btn p-1 text-red-500 hover:bg-red-100 rounded-full" title="Uhrzeit entfernen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" />
            </svg>
        </button>
    `;
    return timeGroup;
}

// NEU: Die Funktion kann jetzt beide Token-Felder formatieren
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