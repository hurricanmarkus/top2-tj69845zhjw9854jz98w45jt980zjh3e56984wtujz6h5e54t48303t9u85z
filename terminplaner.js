// Wir importieren 'doc', 'updateDoc', UND 'getDoc'
import { alertUser, db, votesCollectionRef, currentUser, USERS, setButtonLoading, GUEST_MODE } from './haupteingang.js';
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
let currentParticipantAnswers = {};

// NEU: Diese Variable steuert, ob die "Du"-Spalte klickbar ist
let isVoteGridEditable = false; 

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
    
    // "Abbrechen"-Button
    const cancelCreationButton = document.getElementById('cancel-vote-creation-btn');
    if (cancelCreationButton && !cancelCreationButton.dataset.listenerAttached) {
        cancelCreationButton.addEventListener('click', () => {
            if (confirm("Möchtest du die Erstellung wirklich abbrechen? Alle Eingaben gehen verloren.")) {
                showView('main'); 
            }
        });
        cancelCreationButton.dataset.listenerAttached = 'true';
    }
    // "Endzeit Unbegrenzt"-Checkbox
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
    // "+ Tag hinzufügen"-Button
    const addDateButton = document.getElementById('vote-add-date-btn');
    if (addDateButton && !addDateButton.dataset.listenerAttached) {
        addDateButton.addEventListener('click', addNewDateGroup);
        addDateButton.dataset.listenerAttached = 'true';
    }
    
    // Delegierter Spion für "+ Uhrzeit", "Uhrzeit entfernen" UND VALIDIERUNG
    const datesContainer = document.getElementById('vote-dates-container');
    if (datesContainer && !datesContainer.dataset.clickListenerAttached) {
        // Klick-Spion (für Knöpfe)
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
                const timeGroup = removeTarget.closest('.time-input-group'); 
                const timesContainer = timeGroup.parentElement;
                if (timesContainer.children.length > 1) {
                    timeGroup.remove(); 
                } else {
                    alertUser("Du musst mindestens eine Uhrzeit pro Tag angeben.", "error");
                }
            }
            // Nach jeder Änderung (hinzufügen/löschen) prüfen
            validateLastDateGroup();
        });
        
        // Input-Spion (für die Felder)
        datesContainer.addEventListener('input', (e) => {
            if (e.target.matches('.vote-date-input, .vote-time-start-input')) {
                validateLastDateGroup();
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
    
    // "Zurück"-Button
    const cancelVoteButton = document.getElementById('cancel-vote-participation-btn');
    if (cancelVoteButton && !cancelVoteButton.dataset.listenerAttached) {
        cancelVoteButton.addEventListener('click', () => {
            showView('main'); 
            currentVoteData = null; 
        });
        cancelVoteButton.dataset.listenerAttached = 'true';
    }

    // Delegierter Spion für die Klicks IN DER TABELLE
    const voteOptionsContainer = document.getElementById('vote-options-container');
    if (voteOptionsContainer && !voteOptionsContainer.dataset.listenerAttached) {
        voteOptionsContainer.addEventListener('click', (e) => {
            
            // Fall 1: Klick auf einen (klickbaren) Abstimm-Knopf
            const clickedButton = e.target.closest('.vote-grid-btn');
            if (clickedButton && !clickedButton.disabled) { 
                const optionIndex = clickedButton.dataset.optionIndex;
                const answer = clickedButton.dataset.answer;

                currentParticipantAnswers[optionIndex] = answer;

                const rowButtons = voteOptionsContainer.querySelectorAll(`.vote-grid-btn[data-option-index="${optionIndex}"]`);
                rowButtons.forEach(btn => {
                    btn.classList.remove('bg-green-200', 'bg-yellow-200', 'bg-red-200', 'ring-2', 'ring-indigo-500');
                    btn.classList.add('bg-opacity-50'); 
                });
                
                if (answer === 'yes') clickedButton.classList.add('bg-green-200', 'ring-2', 'ring-indigo-500');
                if (answer === 'maybe') clickedButton.classList.add('bg-yellow-200', 'ring-2', 'ring-indigo-500');
                if (answer === 'no') clickedButton.classList.add('bg-red-200', 'ring-2', 'ring-indigo-500');
                clickedButton.classList.remove('bg-opacity-50'); 
                
                checkIfAllAnswered();
            }
            
            // Fall 2: Klick auf einen Korrektur-Zähler
            const correctionCounter = e.target.closest('.correction-counter');
            if (correctionCounter) {
                const userId = correctionCounter.dataset.userid;
                alertUser(`Zeige Korrektur-Log für User ${userId}... (Diese Funktion bauen wir als nächstes)`);
            }
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
    
    // Spion für den "Korrektur"-Button
    const correctionBtn = document.getElementById('vote-correction-btn');
    if (correctionBtn && !correctionBtn.dataset.listenerAttached) {
        correctionBtn.addEventListener('click', () => {
            switchToEditMode();
        });
        correctionBtn.dataset.listenerAttached = 'true';
    }
}


// ----- SPION-FUNKTIONEN (Listener) -----

export function listenForPublicVotes() {
    if (unsubscribePublicVotes) {
        unsubscribePublicVotes();
    }
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

export function listenForAssignedVotes(userId) {
    if (unsubscribeAssignedVotes) {
        unsubscribeAssignedVotes();
    }
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

export function stopAssignedVotesListener() {
    if (unsubscribeAssignedVotes) {
        unsubscribeAssignedVotes();
        unsubscribeAssignedVotes = null;
    }
    renderAssignedVotes([]); 
}


// ----- RENDER-FUNKTIONEN FÜR LISTEN -----

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
        if (voteData.startTime && now < voteData.startTime.toDate()) {
            throw new Error(`Diese Umfrage hat noch nicht begonnen. Sie startet am ${voteData.startTime.toDate().toLocaleString('de-DE')}.`);
        }
        if (voteData.endTime && now > voteData.endTime.toDate()) {
            throw new Error(`Diese Umfrage ist bereits beendet (seit ${voteData.endTime.toDate().toLocaleString('de-DE')}).`);
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
async function joinVoteById(voteId) {
    try {
        const voteDocRef = doc(votesCollectionRef, voteId);
        const voteDoc = await getDoc(voteDocRef); 
        if (!voteDoc.exists()) {
             throw new Error("Diese Umfrage existiert nicht mehr.");
        }
        const voteData = { id: voteDoc.id, ...voteDoc.data() }; 
        const now = new Date();
        if (voteData.startTime && now < voteData.startTime.toDate()) {
            throw new Error(`Diese Umfrage hat noch nicht begonnen. Sie startet am ${voteData.startTime.toDate().toLocaleString('de-DE')}.`);
        }
        if (voteData.endTime && now > voteData.endTime.toDate()) {
            throw new Error(`Diese Umfrage ist bereits beendet (seit ${voteData.endTime.toDate().toLocaleString('de-DE')}).`);
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
function renderVoteView(voteData) {
    
    // 1. Titel und Ersteller (ZENTRIERT)
    document.getElementById('vote-poll-title').textContent = voteData.title;
    const creatorUser = USERS[voteData.createdBy];
    const creatorName = creatorUser ? creatorUser.realName : voteData.createdByName; 
    document.getElementById('vote-poll-creator').textContent = `Erstellt von ${creatorName}`;

    // 2. Info-Box (Beschreibung, Ort, Gültigkeit)
    const infoBox = document.getElementById('vote-info-box');
    const descContainer = document.getElementById('vote-poll-description-container');
    const descEl = document.getElementById('vote-poll-description');
    const locContainer = document.getElementById('vote-poll-location-container');
    const locEl = document.getElementById('vote-poll-location');
    const validityContainer = document.getElementById('vote-poll-validity-container');
    const validityEl = document.getElementById('vote-poll-validity');
    
    let hasInfo = false;
    if (voteData.description) {
        descEl.textContent = voteData.description;
        descContainer.classList.remove('hidden');
        hasInfo = true;
    } else {
        descContainer.classList.add('hidden');
    }
    if (voteData.location) {
        locEl.textContent = voteData.location;
        locContainer.classList.remove('hidden');
        hasInfo = true;
    } else {
        locContainer.classList.add('hidden');
    }
    let validityText = '';
    if (voteData.startTime) {
        validityText = `Startet: ${voteData.startTime.toDate().toLocaleString('de-DE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})} Uhr`;
    }
    if (voteData.endTime) {
        validityText += ` | Endet: ${voteData.endTime.toDate().toLocaleString('de-DE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})} Uhr`;
    }
    if (validityText) {
        validityEl.textContent = validityText;
        validityContainer.classList.remove('hidden');
        hasInfo = true;
    } else {
        validityContainer.classList.add('hidden');
    }
    infoBox.classList.toggle('hidden', !hasInfo);


    // 3. Teilnehmer-Status-Box (ersetzt Namensfeld)
    const statusContainer = document.getElementById('vote-participant-status-container');
    const nameDisplay = document.getElementById('vote-participant-name');
    const guestNameContainer = document.getElementById('vote-guest-name-container');
    const guestNameInput = document.getElementById('vote-guest-name-input');
    const correctionBtn = document.getElementById('vote-correction-btn');
    
    let existingParticipant = null;
    
    if (currentUser.mode !== GUEST_MODE) {
        existingParticipant = voteData.participants.find(p => p.userId === currentUser.mode);
    }
    
    if (voteData.isAnonymous) {
        statusContainer.classList.add('hidden');
        guestNameContainer.classList.add('hidden');
        isVoteGridEditable = true; 
    } else if (existingParticipant) {
        statusContainer.classList.remove('hidden');
        nameDisplay.textContent = existingParticipant.name;
        guestNameContainer.classList.add('hidden');
        correctionBtn.classList.remove('hidden'); 
        isVoteGridEditable = false; 
    } else if (currentUser.mode !== GUEST_MODE) {
        statusContainer.classList.remove('hidden');
        const currentUserFull = USERS[currentUser.mode];
        nameDisplay.textContent = currentUserFull ? currentUserFull.realName : currentUser.displayName;
        guestNameContainer.classList.add('hidden');
        correctionBtn.classList.add('hidden'); 
        isVoteGridEditable = true; 
    } else {
        // GAST, der noch NICHT teilgenommen hat
        statusContainer.classList.remove('hidden');
        nameDisplay.textContent = "Gast";
        guestNameContainer.classList.remove('hidden'); 
        guestNameInput.value = '';
        correctionBtn.classList.add('hidden');
        isVoteGridEditable = true; 
    }
    
    // 4. Antworten laden
    currentParticipantAnswers = {};
    if (existingParticipant) {
        currentParticipantAnswers = { ...existingParticipant.currentAnswers };
    }

    // 5. Ansichten (Teilnahme, Edit-Token) zurücksetzen
    const saveButton = document.getElementById('vote-save-participation-btn');
    const editButton = document.getElementById('show-edit-vote-btn');
    
    resetEditWrapper();
    
    // 6. Prüfen, ob Termin fixiert ist
    if (voteData.fixedOptionIndex != null) {
        statusContainer.classList.add('hidden'); 
        saveButton.classList.add('hidden');    
        editButton.classList.add('hidden');    
        updatePollTableAnswers(voteData, false); // Ansicht sperren
    } else {
        saveButton.classList.add('hidden'); 
        editButton.classList.remove('hidden'); 
        updatePollTableAnswers(voteData, isVoteGridEditable); 
        checkIfAllAnswered();
    }
}

/**
 * Baut die Abstimmungs-Tabelle neu auf und füllt sie mit allen Antworten
 */
function updatePollTableAnswers(voteData, isEditable = false) {
    const optionsContainer = document.getElementById('vote-options-container');

    // 1. Fall: Termin ist fixiert
    if (voteData.fixedOptionIndex != null) {
        const fixedOption = voteData.options[voteData.fixedOptionIndex];
        if (fixedOption) {
            const dateObj = new Date(fixedOption.date + 'T12:00:00');
            const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
            const timeString = fixedOption.timeEnd ? 
                `${fixedOption.timeStart} - ${fixedOption.timeEnd} Uhr` : 
                `${fixedOption.timeStart} Uhr`;
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
                        ${timeString}
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
    
    // Spalten für jeden Teilnehmer (ausser dem aktuellen User)
    voteData.participants.forEach(p => {
        if (p.userId === currentUser.mode) return; 
        const correctionCount = p.correctionCount || 0;
        const correctionText = correctionCount > 0 ? `(${correctionCount} Korrekturen)` : '';
        tableHTML += `<th class="p-3 border-b text-center w-24">
                        ${p.name}
                        <br>
                        <span class="text-xs font-normal text-gray-500 correction-counter cursor-pointer" data-userid="${p.userId}">${correctionText}</span>
                      </th>`;
    });
    
    // Spalte für "Du" (den aktuellen User)
    const youParticipant = voteData.participants.find(p => p.userId === currentUser.mode);
    const youCorrectionCount = (youParticipant && youParticipant.correctionCount > 0) ? `(${youParticipant.correctionCount} Korrekturen)` : '';
    
    tableHTML += `<th class="p-3 border-b text-center w-48 sticky right-0 bg-gray-50 z-10 font-bold text-indigo-600">
                    Du
                    <br>
                    <span class="text-xs font-normal text-gray-500 correction-counter cursor-pointer" data-userid="${currentUser.mode}">${youCorrectionCount}</span>
                  </th>`;
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
            const timeString = option.timeEnd ? 
                `${option.timeStart} - ${option.timeEnd} Uhr` : 
                `${option.timeStart} Uhr`;
            
            tableHTML += `
                <tr class="vote-option-row" data-option-index="${optionIndex}">
                    <td class="p-3 border-b font-mono sticky left-0 bg-white z-10">${timeString}</td>
            `;

            // Spalten für gespeicherte Teilnehmer
            voteData.participants.forEach(p => {
                if (p.userId === currentUser.mode) return; 
                const answer = p.currentAnswers[optionIndex]; 
                let answerIcon = '';
                if (answer === 'yes') answerIcon = '<span class="text-green-500 font-bold text-xl">✔</span>';
                if (answer === 'no') answerIcon = '<span class="text-red-500 font-bold text-xl">✘</span>';
                if (answer === 'maybe') answerIcon = '<span class="text-yellow-500 font-bold text-xl">~</span>';
                tableHTML += `<td class="p-3 border-b text-center">${answerIcon}</td>`;
            });
            
            // Spalte für "Du" (Interaktiv ODER Schreibgeschützt)
            const currentAnswer = currentParticipantAnswers[optionIndex];
            
            if (isEditable) {
                // MODUS: BEARBEITBAR (Knöpfe)
                const yesSelected = currentAnswer === 'yes' ? 'bg-green-200 ring-2 ring-indigo-500' : 'hover:bg-green-100 bg-opacity-50';
                const maybeSelected = currentAnswer === 'maybe' ? 'bg-yellow-200 ring-2 ring-indigo-500' : 'hover:bg-yellow-100 bg-opacity-50';
                const noSelected = currentAnswer === 'no' ? 'bg-red-200 ring-2 ring-indigo-500' : 'hover:bg-red-100 bg-opacity-50';
                const maybeHidden = voteData.disableMaybe ? 'hidden' : '';

                tableHTML += `
                    <td class="p-2 border-b sticky right-0 bg-white z-10">
                        <div class="flex justify-center gap-1">
                            <button class="vote-grid-btn p-2 rounded-lg ${yesSelected} transition-colors" data-option-index="${optionIndex}" data-answer="yes" title="Ja">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-green-600"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" /></svg>
                            </button>
                            <button class="vote-grid-btn p-2 rounded-lg ${maybeSelected} ${maybeHidden} transition-colors" data-option-index="${optionIndex}" data-answer="maybe" title="Vielleicht">
                                 <span class="text-yellow-600 font-bold text-xl w-5 h-5 flex items-center justify-center">~</span>
                            </button>
                            <button class="vote-grid-btn p-2 rounded-lg ${noSelected} transition-colors" data-option-index="${optionIndex}" data-answer="no" title="Nein">
                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-red-600"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                            </button>
                        </div>
                    </td>
                `;
            } else {
                // MODUS: SCHREIBGESCHÜTZT (Symbole)
                let answerIcon = '';
                if (currentAnswer === 'yes') answerIcon = '<span class="text-green-500 font-bold text-xl">✔</span>';
                if (currentAnswer === 'no') answerIcon = '<span class="text-red-500 font-bold text-xl">✘</span>';
                if (currentAnswer === 'maybe') answerIcon = '<span class="text-yellow-500 font-bold text-xl">~</span>';
                
                tableHTML += `
                    <td class="p-3 border-b text-center sticky right-0 bg-white z-10">
                        ${answerIcon}
                    </td>
                `;
            }
            
            tableHTML += '</tr>';
        });
    }
    
    tableHTML += '</tbody></table>';
    optionsContainer.innerHTML = tableHTML;
}


// ----- HELFER-FUNKTION zum Prüfen der Antworten -----
function checkIfAllAnswered() {
    const saveBtn = document.getElementById('vote-save-participation-btn');
    if (!currentVoteData) {
        saveBtn.classList.add('hidden');
        return;
    }
    
    // Knopf nur anzeigen, wenn die Tabelle bearbeitbar ist
    if (!isVoteGridEditable) {
        saveBtn.classList.add('hidden');
        return;
    }
    
    const totalOptions = currentVoteData.options.length;
    
    // Prüfe, ob für JEDE Option eine Antwort existiert
    let allAnswered = true;
    for (let i = 0; i < totalOptions; i++) {
        if (!currentParticipantAnswers[i]) {
            allAnswered = false;
            break;
        }
    }

    if (allAnswered) {
        saveBtn.classList.remove('hidden'); 
    } else {
        saveBtn.classList.add('hidden'); 
    }
}


// ----- DATENBANK-FUNKTION (Abstimmung speichern) -----
async function saveVoteParticipation() {
    const saveBtn = document.getElementById('vote-save-participation-btn');
    
    let participantName = '';
    let participantId = '';
    
    if (currentVoteData.isAnonymous) {
        participantName = "Anonym";
        participantId = `anon_${Date.now()}`;
    } else if (currentUser.mode !== GUEST_MODE) {
        const user = USERS[currentUser.mode];
        participantName = user.realName;
        participantId = user.id;
    } else {
        participantName = document.getElementById('vote-guest-name-input').value.trim();
        participantId = `guest_${participantName}`; 
        if (!participantName) {
            return alertUser("Bitte gib deinen Namen als Gast ein.", "error");
        }
    }

    if (Object.keys(currentParticipantAnswers).length !== currentVoteData.options.length) {
         return alertUser("Bitte wähle für JEDEN Termin eine Antwort aus.", "error");
    }
    
    setButtonLoading(saveBtn, true);
    try {
        let existingParticipantIndex = currentVoteData.participants.findIndex(p => p.userId === participantId);
        
        const newParticipantsArray = [...currentVoteData.participants]; 
        let correctionCount = 0;
        
        if (existingParticipantIndex > -1) {
            // A. Teilnehmer AKTUALISIEREN
            console.log("Aktualisiere Teilnehmer:", participantName);
            correctionCount = (newParticipantsArray[existingParticipantIndex].correctionCount || 0) + 1;
            
            newParticipantsArray[existingParticipantIndex] = {
                ...newParticipantsArray[existingParticipantIndex], // Alte Daten (wie Name, ID)
                currentAnswers: currentParticipantAnswers,          // Neue Antworten
                correctionCount: correctionCount                  // Neuer Zähler
                // TODO: answerHistory hier hinzufügen
            };
            
        } else {
            // B. Teilnehmer HINZUFÜGEN
            console.log("Füge neuen Teilnehmer hinzu:", participantName);
            newParticipantsArray.push({
                userId: participantId,
                name: participantName, 
                currentAnswers: currentParticipantAnswers,
                correctionCount: 0,
                answerHistory: [] 
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
        
        // NEU: Nach dem Speichern in den schreibgeschützten Modus wechseln
        isVoteGridEditable = false;
        renderVoteView(currentVoteData); 

    } catch (error) {
        console.error("Fehler beim Speichern der Abstimmung:", error);
        alertUser("Fehler beim Speichern: " + error.message, "error");
    } finally {
        setButtonLoading(saveBtn, false);
    }
}


// ----- SPEICHER-FUNKTION (Erstellung) -----
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
                const timeGroups = group.querySelectorAll('.time-input-group');
                timeGroups.forEach(timeGroup => {
                    const timeStart = timeGroup.querySelector('.vote-time-start-input').value; 
                    const timeEnd = timeGroup.querySelector('.vote-time-end-input').value; 
                    if (timeStart) { 
                        options.push({ 
                            date: dateValue, 
                            timeStart: timeStart,
                            timeEnd: timeEnd || null 
                        });
                        hasValidOption = true;
                    }
                });
            }
        });
        if (!title) throw new Error("Bitte gib einen Titel für die Umfrage ein.");
        if (!hasValidOption) throw new Error("Bitte füge mindestens einen gültigen Termin (Datum + Startzeit) hinzu.");
        const token = generateVoteToken();
        const editToken = generateVoteToken(); 
        
        const creatorUser = USERS[currentUser.mode];
        const creatorNameToSave = (creatorUser && creatorUser.realName) ? creatorUser.realName : (currentUser.displayName || currentUser.mode);

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
            createdByName: creatorNameToSave, 
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
function resetEditWrapper() {
    document.getElementById('show-edit-vote-btn')?.classList.remove('hidden');
    document.getElementById('edit-token-input-inline')?.classList.add('hidden');
    document.getElementById('submit-edit-token-inline-btn')?.classList.add('hidden');
}
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

// ----- NEU: Funktion, die beim Klick auf "Korrektur" aufgerufen wird -----
function switchToEditMode() {
    // 1. Verstecke den Korrektur-Knopf
    document.getElementById('vote-correction-btn').classList.add('hidden');
    
    // 2. Setze den globalen Status
    isVoteGridEditable = true;
    
    // 3. Baue die Tabelle neu auf, diesmal klickbar
    updatePollTableAnswers(currentVoteData, true);
    
    // 4. Prüfe, ob der Speicher-Knopf angezeigt werden soll (sollte er, da alles ausgefüllt ist)
    checkIfAllAnswered();
}


// ----- PLATZHALTER für die Bearbeitungs-Ansicht -----
function renderEditView(voteData) {
    document.getElementById('edit-poll-title').textContent = `"${voteData.title}" bearbeiten`;
    
    const editContent = document.getElementById('edit-view-content');
    if (editContent) {
        editContent.innerHTML = `
            <h3 class="font-bold text-lg mb-2">Termin fixieren</h3>
            <p class="text-sm">Hier kannst du bald den finalen Termin auswählen.</p>
            <h3 class="font-bold text-lg mt-6 mb-2">Teilnehmer verwalten</h3>
            <p class="text-sm">Hier kannst du bald Teilnehmer löschen.</p>
        `;
    }
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
       resetEditWrapper();
    } else if (viewName === 'edit') {
       document.getElementById('terminplaner-edit-view').classList.remove('hidden');
    }
}
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
    validateLastDateGroup(); 
}

function validateLastDateGroup() {
    const addDateButton = document.getElementById('vote-add-date-btn');
    const lastGroup = document.querySelector('#vote-dates-container [data-date-group-id]:last-child');
    if (!addDateButton || !lastGroup) return; 
    let allValid = true;
    const dateInput = lastGroup.querySelector('.vote-date-input');
    if (!dateInput || !dateInput.value) {
        allValid = false;
    }
    const timeInputs = lastGroup.querySelectorAll('.vote-time-start-input');
    if (timeInputs.length === 0) {
        allValid = false; 
    }
    timeInputs.forEach(timeInput => {
        if (!timeInput.value) {
            allValid = false;
        }
    });
    if (allValid) {
        addDateButton.classList.remove('hidden');
    } else {
        addDateButton.classList.add('hidden');
    }
}
function getCurrentDateTimeLocalString() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000; 
    const localNow = new Date(now.getTime() - offset);
    return localNow.toISOString().slice(0, 16); 
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
    let newDateString = '';
    let timesToCopy = []; 
    const lastGroup = datesContainer.querySelector('[data-date-group-id]:last-child');
    if (lastGroup) {
        const lastDateInput = lastGroup.querySelector('.vote-date-input');
        if (lastDateInput && lastDateInput.value) {
            const lastDate = new Date(lastDateInput.value + "T12:00:00"); 
            lastDate.setDate(lastDate.getDate() + 1); 
            newDateString = formatDateToISO(lastDate); 
        }
        const lastTimeGroups = lastGroup.querySelectorAll('.time-input-group');
        timesToCopy = Array.from(lastTimeGroups).map(group => {
            return {
                timeStart: group.querySelector('.vote-time-start-input').value,
                timeEnd: group.querySelector('.vote-time-end-input').value
            };
        });
    }
    newGroup.innerHTML = `
        <label class="block text-sm font-bold text-gray-700">Tag ${dateGroupIdCounter}</label>
        <input type="date" class="vote-date-input w-full p-2 border rounded-lg" value="${newDateString}">
        <div class="vote-times-container space-y-2"></div>
        <button class="vote-add-time-btn text-sm font-semibold text-indigo-600 hover:underline">+ Uhrzeit hinzufügen</button>
    `;
    const newTimesContainer = newGroup.querySelector('.vote-times-container');
    if (timesToCopy.length > 0) {
        timesToCopy.forEach(time => {
            newTimesContainer.appendChild(createTimeInputHTML(time.timeStart, time.timeEnd));
        });
    } else {
        newTimesContainer.appendChild(createTimeInputHTML());
    }
    datesContainer.appendChild(newGroup);
    validateLastDateGroup();
}
function formatDateToISO(date) {
    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1); 
    const day = pad(date.getDate());
    return `${year}-${month}-${day}`;
}
function createTimeInputHTML(startTime = '', endTime = '') {
    const timeGroup = document.createElement('div');
    timeGroup.className = 'time-input-group flex items-center gap-2'; 
    timeGroup.innerHTML = `
        <input type="time" class="vote-time-start-input flex-grow p-1 border rounded-lg" title="Startzeit" value="${startTime}">
        <span class="text-gray-500">-</span>
        <input type="time" class="vote-time-end-input flex-grow p-1 border rounded-lg" title="Endzeit (optional)" value="${endTime}">
        <button class="vote-remove-time-btn p-1 text-red-500 hover:bg-red-100 rounded-full" title="Uhrzeit entfernen">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4">
                <path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" />
            </svg>
        </button>
    `;
    return timeGroup;
}
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