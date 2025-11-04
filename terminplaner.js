// Wir importieren 'doc', 'updateDoc', UND 'getDoc'
import { alertUser, db, votesCollectionRef, currentUser, USERS, setButtonLoading, GUEST_MODE, navigate } from './haupteingang.js';
import { 
    addDoc, 
    serverTimestamp, 
    getDocs, 
    getDoc, 
    query, 
    where, 
    doc, 
    updateDoc, 
    deleteDoc,
    onSnapshot, 
    orderBy,    
    limit       
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ----- Globale Variablen für den Zustand -----
let dateGroupIdCounter = 0;
let currentVoteData = null;
let currentParticipantAnswers = {};
let isVoteGridEditable = false; 
let unsubscribePublicVotes = null;
let unsubscribeAssignedVotes = null;
let unsubscribeCreatedVotes = null; // NEU
let unsubscribePastVotes = null; // NEU
let editTokenTimer = null; // Für den 10-Sekunden-Timeout


// ERSETZE diese Funktion in terminplaner.js

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
        joinVoteButton.addEventListener('click', () => joinVoteByToken(null)); // null übergeben
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
                const timeGroup = removeTarget.closest('.time-input-group'); 
                const timesContainer = timeGroup.parentElement;
                if (timesContainer.children.length > 1) {
                    timeGroup.remove(); 
                } else {
                    alertUser("Du musst mindestens eine Uhrzeit pro Tag angeben.", "error");
                }
            }
            validateLastDateGroup();
        });
        datesContainer.addEventListener('input', (e) => {
            if (e.target.matches('.vote-date-input, .vote-time-start-input')) {
                validateLastDateGroup();
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
    
    const cancelVoteButton = document.getElementById('cancel-vote-participation-btn');
    if (cancelVoteButton && !cancelVoteButton.dataset.listenerAttached) {
        cancelVoteButton.addEventListener('click', () => {
            showView('main'); 
            currentVoteData = null; 
        });
        cancelVoteButton.dataset.listenerAttached = 'true';
    }

    const voteView = document.getElementById('terminplaner-vote-view');
    if (voteView && !voteView.dataset.listenerAttached) {
        voteView.addEventListener('click', (e) => {
            
            const clickedButton = e.target.closest('.vote-grid-btn');
            if (clickedButton && !clickedButton.disabled) { 
                const optionIndex = clickedButton.dataset.optionIndex;
                const answer = clickedButton.dataset.answer;
                currentParticipantAnswers[optionIndex] = answer;
                const rowButtons = voteView.querySelectorAll(`.vote-grid-btn[data-option-index="${optionIndex}"]`);
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
            
            const correctionCounter = e.target.closest('.correction-counter');
            if (correctionCounter) {
                const userId = correctionCounter.dataset.userid;
                renderCorrectionHistory(userId);
            }
            
            const correctionButton = e.target.closest('.vote-correction-btn');
            if (correctionButton) {
                switchToEditMode();
            }

            const copyTokenBtn = e.target.closest('#copy-vote-token-btn');
            if (copyTokenBtn) {
                const token = document.getElementById('vote-share-token').textContent;
                copyToClipboard(token, "Token kopiert!");
            }

            const copyUrlBtn = e.target.closest('#copy-vote-url-btn');
            if (copyUrlBtn) {
                const url = document.getElementById('vote-share-url').value;
                copyToClipboard(url, "URL kopiert!");
            }
        });
        voteView.dataset.listenerAttached = 'true';
    }
    
    const saveParticipationButton = document.getElementById('vote-save-participation-btn');
    if (saveParticipationButton && !saveParticipationButton.dataset.listenerAttached) {
        saveParticipationButton.addEventListener('click', saveVoteParticipation);
        saveParticipationButton.dataset.listenerAttached = 'true';
    }
    
    const editVoteButton = document.getElementById('show-edit-vote-btn');
    if (editVoteButton && !editVoteButton.dataset.listenerAttached) {
        editVoteButton.addEventListener('click', showInlineEditToken); 
        editVoteButton.dataset.listenerAttached = 'true';
    }
    
    const submitEditBtn = document.getElementById('submit-edit-token-inline-btn');
    if (submitEditBtn && !submitEditBtn.dataset.listenerAttached) {
        submitEditBtn.addEventListener('click', checkInlineEditToken);
        submitEditBtn.dataset.listenerAttached = 'true';
    }
    
    const editTokenInput = document.getElementById('edit-token-input-inline');
    if (editTokenInput && !editTokenInput.dataset.listenerAttached) {
        editTokenInput.addEventListener('input', (e) => formatTokenInput(e, 'edit-token-input-inline'));
        editTokenInput.dataset.listenerAttached = 'true';
    }
    
    const closeLogBtn = document.getElementById('close-correction-log-btn');
    if (closeLogBtn && !closeLogBtn.dataset.listenerAttached) {
        closeLogBtn.addEventListener('click', () => {
            const modal = document.getElementById('correctionLogModal');
            if (modal) {
                modal.classList.add('hidden');
                modal.style.display = 'none'; 
            }
        });
        closeLogBtn.dataset.listenerAttached = 'true';
    }

    // ----- NEU: Spione für die Bearbeitungs-Seite (Ansicht 4) -----

    const cancelEditingBtn = document.getElementById('cancel-vote-editing-btn');
    if (cancelEditingBtn && !cancelEditingBtn.dataset.listenerAttached) {
        cancelEditingBtn.addEventListener('click', () => {
            showView('vote');
            joinVoteById(currentVoteData.id); 
        });
        cancelEditingBtn.dataset.listenerAttached = 'true';
    }
    
    const unlimitedEditCheckbox = document.getElementById('vote-end-time-unlimited-edit');
    if (unlimitedEditCheckbox && !unlimitedEditCheckbox.dataset.listenerAttached) {
        unlimitedEditCheckbox.addEventListener('change', (e) => {
            const endTimeInput = document.getElementById('vote-end-time-edit');
            if (endTimeInput) {
                endTimeInput.disabled = e.target.checked;
                if (e.target.checked) {
                    endTimeInput.value = ''; 
                }
            }
        });
        unlimitedEditCheckbox.dataset.listenerAttached = 'true';
    }
    
    const saveChangesBtn = document.getElementById('vote-save-changes-btn');
    if (saveChangesBtn && !saveChangesBtn.dataset.listenerAttached) {
        saveChangesBtn.addEventListener('click', saveVoteEdits);
        saveChangesBtn.dataset.listenerAttached = 'true';
    }
    
    const closePollBtn = document.getElementById('vote-close-poll-btn');
    if (closePollBtn && !closePollBtn.dataset.listenerAttached) {
        // KORREKTUR: Ruft jetzt die neue Funktion auf, um die Auswahl anzuzeigen
        closePollBtn.addEventListener('click', showFixDateSelection);
        closePollBtn.dataset.listenerAttached = 'true';
    }

    const reopenPollBtn = document.getElementById('vote-reopen-poll-btn');
    if (reopenPollBtn && !reopenPollBtn.dataset.listenerAttached) {
        reopenPollBtn.addEventListener('click', reopenPoll);
        reopenPollBtn.dataset.listenerAttached = 'true';
    }
    
    const deletePollBtn = document.getElementById('vote-delete-poll-btn');
    if (deletePollBtn && !deletePollBtn.dataset.listenerAttached) {
        deletePollBtn.addEventListener('click', deletePoll);
        deletePollBtn.dataset.listenerAttached = 'true';
    }
    
    const pollHistoryBtn = document.getElementById('show-poll-history-btn');
    if (pollHistoryBtn && !pollHistoryBtn.dataset.listenerAttached) {
        pollHistoryBtn.addEventListener('click', renderPollHistory);
        pollHistoryBtn.dataset.listenerAttached = 'true';
    }

    // ----- KORREKTUR: Spione für das "Termin fixieren"-Modal -----
    // (Diese sind NEU)
    const cancelFixDateBtn = document.getElementById('cancel-fix-date-btn');
    if (cancelFixDateBtn && !cancelFixDateBtn.dataset.listenerAttached) {
        cancelFixDateBtn.addEventListener('click', hideFixDateSelection);
        cancelFixDateBtn.dataset.listenerAttached = 'true';
    }

    const confirmFixDateBtn = document.getElementById('confirm-fix-date-btn');
    if (confirmFixDateBtn && !confirmFixDateBtn.dataset.listenerAttached) {
        confirmFixDateBtn.addEventListener('click', confirmAndFixDate);
        confirmFixDateBtn.dataset.listenerAttached = 'true';
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
    // NEU: Auch den "Erstellt"-Listener stoppen
    if (unsubscribeCreatedVotes) {
        unsubscribeCreatedVotes();
        unsubscribeCreatedVotes = null;
    }
    renderAssignedVotes([]); 
    renderC


// ----- RENDER-FUNKTIONEN FÜR LISTEN -----

// ERSETZE diese Funktion in terminplaner.js
function renderPublicVotes(votes) {
    const listContainer = document.getElementById('public-votes-list');
    if (!listContainer) return;
    if (votes.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">Derzeit gibt es keine öffentlichen Umfragen.</p>`;
        return;
    }
    // KORREKTUR: Benutze die neue Helfer-Funktion
    listContainer.innerHTML = votes.map(vote => renderVoteCardHTML(vote, 'public')).join('');
}

// ERSETZE diese Funktion in terminplaner.js
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
    // KORREKTUR: Benutze die neue Helfer-Funktion (Anforderung 2 & 3)
    listContainer.innerHTML = votes.map(vote => renderVoteCardHTML(vote, 'assigned')).join('');
}


// ----- DATENBANK-FUNKTION (Umfrage suchen per Token) -----
// (ANGEPASST: Ruft jetzt 'cleanUrl' auf)
// ERSETZE diese Funktion in terminplaner.js

// ERSETZE diese Funktion in terminplaner.js

export async function joinVoteByToken(tokenFromUrl = null) {
    const tokenInput = document.getElementById('vote-token-input');
    const joinBtn = document.getElementById('join-vote-by-token-btn');
    
    const token = (tokenFromUrl || tokenInput.value).trim().toUpperCase(); 

    if (token.length !== 11 || token[4] !== ' ' || token[5] !== '-' || token[6] !== ' ') {
        if (!tokenFromUrl) {
            alertUser("Ungültiges Token-Format. Es muss 'XXXX - XXXX' sein.", "error");
        }
        console.warn("Ungültiges Token-Format.");
        return;
    }
    
    if (joinBtn) setButtonLoading(joinBtn, true); 
    
    try {
        const q = query(votesCollectionRef, where("token", "==", token));
        const snapshot = await getDocs(q);
        if (snapshot.empty) throw new Error("Umfrage nicht gefunden. Prüfe den Token.");
        if (snapshot.size > 1) throw new Error("Fehler: Mehrere Umfragen mit diesem Token gefunden. Admin kontaktieren.");
        
        const voteDoc = snapshot.docs[0];
        const voteData = { id: voteDoc.id, ...voteDoc.data() }; 
        
        // ----- KORREKTUR: START-ZEIT-PRÜFUNG ENTFERNT -----
        // Die folgende 'if'-Bedingung, die geprüft hat, ob die Umfrage
        // schon gestartet ist, wurde entfernt.
        // Die 'renderVoteView'-Funktion kümmert sich jetzt darum,
        // die Warnmeldung anzuzeigen.
        // ----- ENDE KORREKTUR -----
        
        currentVoteData = voteData; 
        console.log("Umfrage gefunden:", currentVoteData);
        
        navigate('terminplaner'); // Navigiere zur Terminplaner-Seite
        
        renderVoteView(currentVoteData); // Zeigt die Umfrage an (und die Warn-Box, falls nötig)
        showView('vote'); // Zeige die Abstimmungs-Ansicht
        if (tokenInput) tokenInput.value = ''; 
        
        if (tokenFromUrl) cleanUrlParams();
        
    } catch (error) {
        console.error("Fehler beim Suchen der Umfrage:", error);
        alertUser(error.message, "error");
    } finally {
        if (joinBtn) setButtonLoading(joinBtn, false); 
    }
}

// ERSETZE diese Funktion in terminplaner.js

// ERSETZE diese Funktion in terminplaner.js

export async function joinVoteById(voteId = null) {
    let idToLoad = voteId;
    let isFromUrl = false;
    
    try {
        if (!idToLoad) {
            const urlParams = new URLSearchParams(window.location.search);
            idToLoad = urlParams.get('vote_id');
            if (!idToLoad) return; 
            isFromUrl = true;
        }
        
        const voteDocRef = doc(votesCollectionRef, idToLoad);
        const voteDoc = await getDoc(voteDocRef); 
        if (!voteDoc.exists()) {
             throw new Error("Diese Umfrage existiert nicht mehr.");
        }
        
        const voteData = { id: voteDoc.id, ...voteDoc.data() }; 
        
        // ----- KORREKTUR: START-ZEIT-PRÜFUNG ENTFERNT -----
        // Die folgende 'if'-Bedingung, die geprüft hat, ob die Umfrage
        // schon gestartet ist, wurde entfernt.
        // Die 'renderVoteView'-Funktion kümmert sich jetzt darum,
        // die Warnmeldung anzuzeigen.
        // ----- ENDE KORREKTUR -----

        currentVoteData = voteData; 
        console.log("Umfrage per ID geladen:", currentVoteData);
        
        navigate('terminplaner'); // Navigiere zur Terminplaner-Seite

        renderVoteView(currentVoteData); // Zeigt die Umfrage an (und die Warn-Box, falls nötig)
        showView('vote'); // Zeige die Abstimmungs-Ansicht
        
        if (isFromUrl) cleanUrlParams();
        
    } catch (error) {
        console.error("Fehler beim Laden der Umfrage per ID:", error);
        alertUser(error.message, "error");
    }
}

function renderVoteView(voteData) {
    
    // ----- 1. DEFINITIONEN -----
    const now = new Date();
    // Helfer, um Timestamps (von Firebase) oder JS-Dates (lokal) sicher zu lesen
    const getSafeDate = (timestamp) => {
        if (!timestamp) return null;
        if (typeof timestamp.toDate === 'function') return timestamp.toDate();
        return new Date(timestamp);
    };

    const startTime = getSafeDate(voteData.startTime);
    const endTime = getSafeDate(voteData.endTime);

    const isFixed = voteData.fixedOptionIndex != null;
    const isClosed = (endTime && now > endTime); // Abgelaufen
    const isNotStarted = (startTime && now < startTime); // Noch nicht gestartet
    
    // Teilnahme ist blockiert, wenn fixiert, abgelaufen ODER noch nicht gestartet
    const isParticipationBlocked = isFixed || isClosed || isNotStarted;

    // ----- 2. Titel & Ersteller (ZENTRIERT) -----
    document.getElementById('vote-poll-title').textContent = voteData.title;
    const creatorUser = USERS[voteData.createdBy];
    const creatorName = creatorUser ? creatorUser.realName : voteData.createdByName; 
    document.getElementById('vote-poll-creator').textContent = `Erstellt von ${creatorName}`;

    // ----- 3. Share-Box -----
    document.getElementById('vote-share-token').textContent = voteData.token;
    const baseUrl = window.location.origin + window.location.pathname; 
    const directUrl = `${baseUrl}?vote_id=${currentVoteData.id}`; 
    document.getElementById('vote-share-url').value = directUrl;

    // ----- 4. Info-Box (Beschreibung, Ort) -----
    const infoBox = document.getElementById('vote-info-box');
    const descContainer = document.getElementById('vote-poll-description-container');
    const descEl = document.getElementById('vote-poll-description');
    const locContainer = document.getElementById('vote-poll-location-container');
    const locEl = document.getElementById('vote-poll-location');
    
    let hasInfo = false;
    if (voteData.description) {
        descEl.textContent = voteData.description;
        descContainer.classList.remove('hidden');
        hasInfo = true;
    } else { descContainer.classList.add('hidden'); }
    if (voteData.location) {
        locEl.textContent = voteData.location;
        locContainer.classList.remove('hidden');
        hasInfo = true;
    } else { locContainer.classList.add('hidden'); }
    infoBox.classList.toggle('hidden', !hasInfo);

    // ----- 5. Gültigkeits-Boxen (Anforderung 3 & 4) -----
    const validityContainer = document.getElementById('vote-poll-validity-container');
    const validityEl = document.getElementById('vote-poll-validity');
    const warningBox = document.getElementById('vote-validity-warning-box');
    const warningText = document.getElementById('vote-validity-warning-text');
    
    // Helfer-Funktion
    const formatVoteDate = (dateObj) => {
        if (!dateObj) return '';
        return dateObj.toLocaleString('de-DE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) + ' Uhr';
    };
    
    // Rote Box (Anforderung 3)
    // Zeige "Geschlossen" nur, wenn abgelaufen, aber noch nicht fixiert
    if (isClosed && !isFixed) { 
        validityEl.textContent = "TEILNAHME GESCHLOSSEN";
        // NEU: p-3 (für Höhe) und font-bold hinzugefügt (Anforderung 3)
        validityContainer.classList.add('text-red-700', 'bg-red-50', 'p-3', 'font-bold'); 
        validityContainer.classList.remove('text-gray-600');
        validityContainer.classList.remove('hidden');
    } else {
        // Normale Gültigkeit anzeigen (oder Box verstecken)
        const startTimeText = formatVoteDate(startTime);
        const endTimeText = formatVoteDate(endTime);
        let validityText = '';
        if (startTimeText) validityText = `Startet: ${startTimeText}`;
        if (endTimeText) validityText += (validityText ? ' | ' : '') + `Endet: ${endTimeText}`;

        if (validityText && !isFixed) { // Zeige nicht, wenn fixiert
            validityEl.textContent = validityText;
            validityContainer.classList.remove('hidden');
        } else {
            validityContainer.classList.add('hidden');
        }
        // NEU: Styling (p-3, font-bold) sicher entfernen (Anforderung 3)
        validityContainer.classList.remove('text-red-700', 'bg-red-50', 'p-3', 'font-bold');
        validityContainer.classList.add('text-gray-600');
    }

    // Gelbe Box (Anforderung 4)
    // Zeige Warnung nur, wenn blockiert, aber noch nicht fixiert
    if (isParticipationBlocked && !isFixed) { 
        if (isNotStarted) {
            warningText.textContent = `Diese Umfrage hat noch nicht begonnen. Sie startet am ${formatVoteDate(startTime)}.`;
        } else if (isClosed) {
            warningText.textContent = `Diese Umfrage ist bereits beendet. Teilnahme und Korrekturen sind nicht mehr möglich.`;
        }
        warningBox.classList.remove('hidden');
    } else {
        warningBox.classList.add('hidden');
    }


    // ----- 6. Teilnehmer-Status-Box (angepasst für Anforderung 4) -----
    const statusContainer = document.getElementById('vote-participant-status-container');
    const nameDisplay = document.getElementById('vote-participant-name');
    const userContainer = document.getElementById('vote-user-name-container');
    const guestNameContainer = document.getElementById('vote-guest-name-container');
    const guestNameInput = document.getElementById('vote-guest-name-input');
    
    let existingParticipant = null;
    if (currentUser.mode !== GUEST_MODE) {
        existingParticipant = voteData.participants.find(p => p.userId === currentUser.mode);
    }
    
    // Standard: Alles verstecken, Grid nicht editierbar
    statusContainer.classList.add('hidden');
    guestNameContainer.classList.add('hidden');
    userContainer.classList.add('hidden');
    isVoteGridEditable = false; // Standard
    
    // NEU: Prüfe 'isParticipationBlocked' (Anforderung 4)
    if (!isParticipationBlocked) { // Nur wenn Teilnahme erlaubt ist
        if (voteData.isAnonymous) {
            isVoteGridEditable = true; 
        } else if (existingParticipant) {
            statusContainer.classList.remove('hidden');
            userContainer.classList.remove('hidden'); 
            nameDisplay.textContent = existingParticipant.name;
            isVoteGridEditable = false; // Hat schon abgestimmt -> nicht editierbar (muss "Korrektur" klicken)
        } else if (currentUser.mode !== GUEST_MODE) {
            statusContainer.classList.remove('hidden');
            userContainer.classList.remove('hidden'); 
            const currentUserFull = USERS[currentUser.mode];
            nameDisplay.textContent = currentUserFull ? currentUserFull.realName : currentUser.displayName;
            isVoteGridEditable = true; 
        } else { // Gast
            statusContainer.classList.remove('hidden');
            guestNameContainer.classList.remove('hidden'); 
            guestNameInput.value = '';
            isVoteGridEditable = true; 
        }
    }
    
    // ----- 7. Antworten laden -----
    currentParticipantAnswers = {};
    if (existingParticipant) {
        currentParticipantAnswers = { ...existingParticipant.currentAnswers };
    }

    // ----- 8. Knöpfe (Speichern, Admin-Edit) -----
    const saveButton = document.getElementById('vote-save-participation-btn');
    const editButton = document.getElementById('show-edit-vote-btn'); // Admin-Edit
    
    resetEditWrapper(); // Admin-Edit-Token-Feld zurücksetzen
    
    saveButton.classList.add('hidden'); // Standardmäßig versteckt
    if (isParticipationBlocked) {
        saveButton.classList.add('hidden');
    }
    
    // Admin-Edit-Knopf
    if (isFixed) {
        editButton.classList.add('hidden'); // Verstecken, wenn fixiert
    } else {
        editButton.classList.remove('hidden'); // Anzeigen, wenn nicht fixiert
    }
    
    // ----- 9. Tabelle rendern -----
    // 'isVoteGridEditable' ist jetzt korrekt gesetzt (basierend auf Anforderung 4)
    // 'isClosed' wird übergeben, um Korrektur-Link zu sperren (Anforderung 1)
    updatePollTableAnswers(voteData, isVoteGridEditable, isClosed); 
    
    // Speichern-Knopf (finaler Check)
    if (!isParticipationBlocked) {
        checkIfAllAnswered();
    }
}


// ERSETZE diese Funktion in terminplaner.js

function updatePollTableAnswers(voteData, isEditable = false, isClosed = false) {
    const optionsContainer = document.getElementById('vote-options-container');

    // 1. Fall: Termin ist fixiert (Anforderung 2)
    if (voteData.fixedOptionIndex != null) {
        const fixedOption = voteData.options[voteData.fixedOptionIndex];
        if (fixedOption) {
            const dateObj = new Date(fixedOption.date + 'T12:00:00');
            const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
            const timeString = fixedOption.timeEnd ? 
                `${fixedOption.timeStart} - ${fixedOption.timeEnd} Uhr` : 
                `${fixedOption.timeStart} Uhr`;

            // ----- NEU: Logik für Teilnehmerliste (Anforderung 2) -----
            const fixedIndex = voteData.fixedOptionIndex;
            const yesNames = [];
            const maybeNames = [];
            const noNames = [];

            // Sortiere Teilnehmer in die drei Listen
            voteData.participants.forEach(p => {
                const answer = p.currentAnswers[fixedIndex];
                if (answer === 'yes') {
                    yesNames.push(p.name);
                } else if (answer === 'maybe') {
                    maybeNames.push(p.name);
                } else if (answer === 'no') {
                    noNames.push(p.name);
                }
            });

            // Helfer-Funktion zum Erstellen der HTML-Listen
            const createListHTML = (title, names, colorClass) => {
                if (names.length === 0) return '';
                // `colorClass` färbt den Titel (z.B. "Zusagen")
                return `
                    <div class="mt-2">
                        <span class="text-xs font-semibold ${colorClass}">${title} (${names.length}):</span>
                        <p class="text-xs text-gray-600">${names.join(', ')}</p>
                    </div>
                `;
            };
            
            // Das finale HTML für die Teilnehmerliste
            const participantsListHTML = `
                <div class="text-left mt-4 border-t border-green-400 pt-2">
                    ${createListHTML('Zusagen', yesNames, 'text-green-800')}
                    ${createListHTML('Vielleicht', maybeNames, 'text-yellow-800')}
                    ${createListHTML('Absagen', noNames, 'text-red-800')}
                </div>
            `;
            // ----- ENDE NEU: Logik für Teilnehmerliste -----

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
                    ${participantsListHTML}
                </div>
            `;
            return; // Wichtig: Funktion hier beenden
        }
    }
    
    // 2. Fall: Normale Abstimmung -> Baue die Tabelle
    // (Der Rest der Funktion bleibt exakt gleich wie in der VORHERIGEN Antwort)
    // Er stellt sicher, dass "Auswahl bearbeiten" bei 'isClosed=true' versteckt wird.
    
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
    
    const youParticipant = voteData.participants.find(p => p.userId === currentUser.mode);
    
    let youHeaderHTML = '<span class="font-bold text-indigo-600">Du</span>'; 
    
    if (currentUser.mode !== GUEST_MODE && !voteData.isAnonymous) {
        if (youParticipant) {
            const correctionCount = youParticipant.correctionCount || 0;
            const correctionText = correctionCount > 0 ? `(<span class="correction-counter cursor-pointer" data-userid="${currentUser.mode}">${correctionCount} Korrekturen</span>)` : '';
            
            // "Auswahl bearbeiten" nur anzeigen, wenn NICHT geschlossen
            const editButtonHtml = !isClosed ? `<br><button class="vote-correction-btn text-xs font-semibold text-blue-600 hover:underline">Auswahl bearbeiten</button>` : '';

            youHeaderHTML = `
                <span class="font-bold text-indigo-600">Du</span>
                <br>
                <span class="text-xs font-normal text-gray-500">${correctionText}</span>
                ${editButtonHtml}
            `;
        } else {
            // Wenn geschlossen, "Du (Geschlossen)" anzeigen
            youHeaderHTML = isClosed 
                ? '<span class="font-bold text-gray-500">Du (Geschlossen)</span>' 
                : '<span class="font-bold text-indigo-600">Du (Klicke unten)</span>';
        }
    }

    tableHTML += `<th class="p-3 border-b text-center w-48 sticky right-0 bg-gray-50 z-10">
                    ${youHeaderHTML}
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

        optionsByDate[date].forEach(option => {
            const optionIndex = option.originalIndex;
            const timeString = option.timeEnd ? 
                `${option.timeStart} - ${option.timeEnd} Uhr` : 
                `${option.timeStart} Uhr`;
            
            tableHTML += `
                <tr class="vote-option-row" data-option-index="${optionIndex}">
                    <td class="p-3 border-b font-mono sticky left-0 bg-white z-10">${timeString}</td>
            `;

            voteData.participants.forEach(p => {
                if (p.userId === currentUser.mode) return; 
                const answer = p.currentAnswers[optionIndex]; 
                let answerIcon = '';
                if (answer === 'yes') answerIcon = '<span class="text-green-500 font-bold text-xl">✔</span>';
                if (answer === 'no') answerIcon = '<span class="text-red-500 font-bold text-xl">✘</span>';
                if (answer === 'maybe') answerIcon = '<span class="text-yellow-500 font-bold text-xl">~</span>';
                tableHTML += `<td class="p-3 border-b text-center">${answerIcon}</td>`;
            });
            
            const currentAnswer = currentParticipantAnswers[optionIndex];
            
            // 'isEditable' steuert, ob Knöpfe angezeigt werden
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
    
    if (!isVoteGridEditable) {
        saveBtn.classList.add('hidden');
        return;
    }
    
    const totalOptions = currentVoteData.options.length;
    
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
        participantName = document.getElementById('vote-participant-name').textContent; 
        participantId = currentUser.mode;
    } else {
        participantName = document.getElementById('vote-guest-name-input').value.trim();
        participantId = `guest_${participantName.replace(/\s/g, '_')}`; 
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
        let answerHistory = [];
        
        const user = (currentUser.mode !== GUEST_MODE) ? USERS[currentUser.mode] : null;
        const nameToSave = user ? user.realName : participantName;
        
        if (existingParticipantIndex > -1) {
            // A. Teilnehmer AKTUALISIEREN
            console.log("Aktualisiere Teilnehmer:", nameToSave);
            
            const oldParticipantData = newParticipantsArray[existingParticipantIndex];
            const oldAnswers = oldParticipantData.currentAnswers;
            const newAnswers = currentParticipantAnswers;
            
            const changes = [];
            const options = currentVoteData.options;
            for (let i = 0; i < options.length; i++) {
                const oldA = oldAnswers[i] || 'keine';
                const newA = newAnswers[i] || 'keine';
                
                if (oldA !== newA) {
                    const option = options[i];
                    const optionText = option.timeEnd ? 
                        `${option.date} ${option.timeStart}-${option.timeEnd}` : 
                        `${option.date} ${option.timeStart}`;
                    changes.push({ 
                        optionText: optionText, 
                        from: oldA, 
                        to: newA 
                    });
                }
            }
            
            answerHistory = oldParticipantData.answerHistory || [];
            
            if (changes.length > 0) {
                const historyLog = { 
                    timestamp: new Date(), // Benutze die lokale Uhrzeit (new Date())
                    changes: changes,
                    changedBy: currentUser.displayName || "Gast" 
                };
                answerHistory.unshift(historyLog); 
            }

            correctionCount = answerHistory.length; 
            
            newParticipantsArray[existingParticipantIndex] = {
                ...oldParticipantData, 
                name: nameToSave,
                currentAnswers: newAnswers,
                correctionCount: correctionCount,
                answerHistory: answerHistory 
            };
            
        } else {
            // B. Teilnehmer HINZUFÜGEN
            console.log("Füge neuen Teilnehmer hinzu:", nameToSave);
            newParticipantsArray.push({
                userId: participantId,
                name: nameToSave, 
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
            fixedOptionIndex: null,
            pollHistory: [] // NEU: Feld für den Bearbeitungs-Log
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
    // 0. Alten Timer stoppen, falls einer läuft (falls man schnell doppelt klickt)
    if (editTokenTimer) {
        clearInterval(editTokenTimer);
    }

    const editButton = document.getElementById('show-edit-vote-btn');
    const tokenInput = document.getElementById('edit-token-input-inline');
    const submitButton = document.getElementById('submit-edit-token-inline-btn');
    if (!editButton || !tokenInput || !submitButton || !currentVoteData) return;

    // 1. UI-Elemente anzeigen
    editButton.classList.add('hidden');
    tokenInput.classList.remove('hidden');
    submitButton.classList.remove('hidden');

    // 2. Token-Feld füllen (wie bisher)
    if (currentUser.mode === currentVoteData.createdBy) {
        tokenInput.value = currentVoteData.editToken; 
        tokenInput.disabled = true; 
    } else {
        tokenInput.value = ''; 
        tokenInput.disabled = false;
        tokenInput.focus(); // Fokus auf das Feld für Gäste
    }

    // 3. Den Timer starten
    let counter = 10; // 10 Sekunden
    submitButton.textContent = `OK (${counter})`; // Sofort den Zähler anzeigen
    submitButton.disabled = false; // Sicherstellen, dass der Knopf klickbar ist

    editTokenTimer = setInterval(() => {
        counter--;
        if (counter > 0) {
            // Zähler aktualisieren
            submitButton.textContent = `OK (${counter})`;
        } else {
            // Zeit abgelaufen
            clearInterval(editTokenTimer);
            editTokenTimer = null;
            resetEditWrapper(); // UI zurücksetzen (versteckt das Feld)
            alertUser("Zeit abgelaufen. Bitte erneut versuchen.", "error");
        }
    }, 1000); // Jede Sekunde
}


function resetEditWrapper() {
    // 1. UI zurücksetzen
    document.getElementById('show-edit-vote-btn')?.classList.remove('hidden');
    document.getElementById('edit-token-input-inline')?.classList.add('hidden');
    
    const submitButton = document.getElementById('submit-edit-token-inline-btn');
    if (submitButton) {
        submitButton.classList.add('hidden');
        submitButton.textContent = 'OK'; // Text auf Standard zurücksetzen
        submitButton.disabled = false; // Knopf wieder aktivieren
    }
    
    // 2. Timer stoppen, falls er noch läuft!
    if (editTokenTimer) {
        clearInterval(editTokenTimer);
        editTokenTimer = null;
    }
}

// ----- Funktion, die beim Klick auf "Korrektur" aufgerufen wird -----
function switchToEditMode() {
    const correctionBtn = document.querySelector('.vote-correction-btn');
    if (correctionBtn) correctionBtn.classList.add('hidden');
    isVoteGridEditable = true;
    updatePollTableAnswers(currentVoteData, true);
    checkIfAllAnswered();
}


// ----- Funktion zum Anzeigen des Korrektur-Verlaufs -----
function renderCorrectionHistory(userId) {
    if (!userId || !currentVoteData) return;
    
    const modal = document.getElementById('correctionLogModal');
    const title = document.getElementById('correction-log-title');
    const content = document.getElementById('correction-log-content');
    
    const participant = currentVoteData.participants.find(p => p.userId === userId);
    
    if (!participant) {
        console.error("Teilnehmer für Korrektur-Log nicht gefunden:", userId);
        return;
    }
    
    title.textContent = `Korrektur-Verlauf für ${participant.name}`;
    
    const history = participant.answerHistory;
    
    if (!history || history.length === 0) {
        content.innerHTML = `<p class="text-sm text-center text-gray-400">Keine Korrekturen für diesen Benutzer gefunden.</p>`;
    } else {
        // Baue den HTML-Inhalt für den Verlauf
        content.innerHTML = history.map(log => {
            
            let dateObject = null;
            if (log.timestamp) {
                if (typeof log.timestamp.toDate === 'function') {
                    dateObject = log.timestamp.toDate();
                }
                else if (log.timestamp instanceof Date) { 
                    dateObject = log.timestamp;
                }
            }
            
            const timestamp = dateObject ? dateObject.toLocaleString('de-DE', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Unbekanntes Datum';
            
            const changesHTML = log.changes.map(change => {
                const formatAnswer = (answer) => {
                    if (answer === 'yes') return '<span class="text-green-600 font-bold">Ja</span>';
                    if (answer === 'no') return '<span class="text-red-600 font-bold">Nein</span>';
                    if (answer === 'maybe') return '<span class="text-yellow-600 font-bold">Vielleicht</span>';
                    return '<span class="text-gray-500 italic">keine</span>';
                };
                
                return `
                    <li class="text-sm">
                        <strong>${change.optionText}:</strong> 
                        geändert von ${formatAnswer(change.from)} auf ${formatAnswer(change.to)}
                    </li>
                `;
            }).join('');
            
            return `
                <div class="p-3 bg-white rounded-lg shadow-sm border">
                    <p class="text-xs font-semibold text-gray-700">
                        Änderung am ${timestamp} Uhr (von ${log.changedBy})
                    </p>
                    <ul class="list-disc list-inside mt-2">
                        ${changesHTML}
                    </ul>
                </div>
            `;
        }).join('');
    }
    
    // Zeige das Modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}


// ERSETZE diese Funktion in terminplaner.js

// ERSETZE diese Funktion in terminplaner.js

function renderEditView(voteData) {
    document.getElementById('edit-poll-title').textContent = `"${voteData.title}" bearbeiten`;
    
    // Helfer-Funktion, um Firebase-Timestamps ODER JS-Dates in 'datetime-local' Strings umzuwandeln
    const formatTimestampToInput = (timestamp) => {
        if (!timestamp) return '';
        
        let dateObject = null;
        if (typeof timestamp.toDate === 'function') {
            dateObject = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            dateObject = timestamp;
        } else {
            try { dateObject = new Date(timestamp); } catch (e) { return ''; }
        }

        if (isNaN(dateObject.getTime())) { 
            return '';
        }

        const offset = dateObject.getTimezoneOffset() * 60000;
        const localDate = new Date(dateObject.getTime() - offset);
        return localDate.toISOString().slice(0, 16);
    };

    // 1. Details füllen
    document.getElementById('vote-title-edit').value = voteData.title;
    document.getElementById('vote-description-edit').value = voteData.description || '';
    document.getElementById('vote-location-edit').value = voteData.location || '';
    
    // 2. Gültigkeit füllen
    const startTimeInput = document.getElementById('vote-start-time-edit');
    const endTimeInput = document.getElementById('vote-end-time-edit');
    const unlimitedCheckbox = document.getElementById('vote-end-time-unlimited-edit');

    startTimeInput.value = formatTimestampToInput(voteData.startTime);
        
    if (voteData.endTime) {
        endTimeInput.value = formatTimestampToInput(voteData.endTime);
        unlimitedCheckbox.checked = false;
        endTimeInput.disabled = false;
    } else {
        endTimeInput.value = '';
        unlimitedCheckbox.checked = true;
        endTimeInput.disabled = true;
    }

    // 3. Einstellungen füllen
    document.getElementById('vote-setting-public-edit').checked = voteData.isPublic;
    document.getElementById('vote-setting-anonymous-edit').checked = voteData.isAnonymous;
    document.getElementById('vote-setting-disable-maybe-edit').checked = voteData.disableMaybe;
    
    // 4. "UPDATE"-Log-Button anzeigen
    const historyContainer = document.getElementById('poll-history-log-container');
    if (voteData.pollHistory && voteData.pollHistory.length > 0) {
        historyContainer.classList.remove('hidden');
    } else {
        historyContainer.classList.add('hidden');
    }

    // 5. Gefahrenzone-Knöpfe-Status setzen
    const closeBtn = document.getElementById('vote-close-poll-btn');
    const reopenBtn = document.getElementById('vote-reopen-poll-btn');
    
    // Helfer-Funktion, um das End-Datum sicher zu prüfen
    let endTimeDate = null;
    if (voteData.endTime) {
        if (typeof voteData.endTime.toDate === 'function') {
            endTimeDate = voteData.endTime.toDate();
        } else if (voteData.endTime instanceof Date) {
            endTimeDate = voteData.endTime;
        }
    }

    // ----- KORREKTUR: NEUE LOGIK (basierend auf deinem Feedback) -----
    if (voteData.fixedOptionIndex != null) {
        // Fall: Termin ist fixiert. Schließen ist nicht möglich.
        closeBtn.classList.add('hidden');
        // ABER: Wiedereröffnen ist möglich (um Fixierung aufzuheben)
        reopenBtn.classList.remove('hidden');

    } else if (endTimeDate && endTimeDate < new Date()) {
        // Fall: Umfrage ist geschlossen (abgelaufen), aber nicht fixiert
        closeBtn.classList.add('hidden');
        reopenBtn.classList.remove('hidden'); // Zeige "Wieder öffnen"

    } else {
        // Fall: Umfrage ist offen (weder fixiert noch abgelaufen)
        closeBtn.classList.remove('hidden'); // Zeige "Schließen"
        reopenBtn.classList.add('hidden');
    }
    // ----- ENDE DER KORREKTUR -----


    // WICHTIG: Sicherstellen, dass die Terminauswahl (die wir per Klick öffnen)
    // beim Neuladen der Ansicht immer versteckt ist.
    const selectionContainer = document.getElementById('fix-date-selection-container');
    if (selectionContainer) selectionContainer.classList.add('hidden');


    // Temporärer Inhalt (ersetzen wir als nächstes)
    const editContent = document.getElementById('edit-view-content');
    if (editContent) {
        editContent.innerHTML = `
            <h3 class="font-bold text-lg mb-2">Termin fixieren</h3>
            <p class="text-sm">Bitte benutze den "Umfrage jetzt schließen" Knopf in der Gefahrenzone, um den finalen Termin auszuwählen.</p>
            <h3 class="font-bold text-lg mt-6 mb-2">Teilnehmer verwalten</h3>
            <p class="text-sm">Hier kannst du bald Teilnehmer löschen.</p>
        `;
    }
}


async function saveVoteEdits() {
    const saveBtn = document.getElementById('vote-save-changes-btn');
    setButtonLoading(saveBtn, true);

    try {
        const updateData = {};
        const changes = []; // Für das Logbuch
        
        // 1. Details lesen
        const newTitle = document.getElementById('vote-title-edit').value.trim();
        const newDesc = document.getElementById('vote-description-edit').value.trim();
        const newLoc = document.getElementById('vote-location-edit').value.trim();

        if (newTitle !== currentVoteData.title) {
            updateData.title = newTitle;
            changes.push(`Titel geändert: von "${currentVoteData.title}" zu "${newTitle}"`);
        }
        if (newDesc !== (currentVoteData.description || '')) {
            updateData.description = newDesc;
            changes.push(`Beschreibung geändert.`);
        }
        if (newLoc !== (currentVoteData.location || '')) {
            updateData.location = newLoc || null;
            changes.push(`Ort geändert.`);
        }

        // 2. Gültigkeit lesen
        const newStartTime = document.getElementById('vote-start-time-edit').value;
        const newEndTime = document.getElementById('vote-end-time-edit').value;
        const isUnlimited = document.getElementById('vote-end-time-unlimited-edit').checked;

        updateData.startTime = newStartTime ? new Date(newStartTime) : null;
        updateData.endTime = !isUnlimited && newEndTime ? new Date(newEndTime) : null;
        // (Wir loggen Gültigkeitsänderungen vorerst nicht im Detail)
        
        // 3. Einstellungen lesen
        updateData.isPublic = document.getElementById('vote-setting-public-edit').checked;
        updateData.isAnonymous = document.getElementById('vote-setting-anonymous-edit').checked;
        updateData.disableMaybe = document.getElementById('vote-setting-disable-maybe-edit').checked;
        
        // 4. Log-Eintrag erstellen, WENN es Änderungen gab
        if (changes.length > 0) {
            const historyLog = {
                timestamp: new Date(), // Lokale Zeit (vermeidet Firebase-Array-Fehler)
                changedBy: USERS[currentUser.mode]?.realName || currentUser.displayName,
                changes: changes // Array mit den Text-Änderungen
            };
            // Füge den neuen Log-Eintrag zum bestehenden Verlauf hinzu
            updateData.pollHistory = [...(currentVoteData.pollHistory || []), historyLog];
        }
        
        // 5. Datenbank aktualisieren
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        await updateDoc(voteDocRef, updateData);
        
        // 6. Lokale Daten aktualisieren
        currentVoteData = { ...currentVoteData, ...updateData };
        
        alertUser("Änderungen gespeichert!", "success");
        
        // Zurück zur Abstimmungs-Seite (die sich jetzt selbst aktualisiert)
        showView('vote');
        renderVoteView(currentVoteData); // Ansicht mit den neuen Daten neu laden

    } catch (error) {
        console.error("Fehler beim Speichern der Änderungen:", error);
        alertUser("Speichern fehlgeschlagen.", "error");
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

// ERSETZE diese Funktion in terminplaner.js

async function closePollNow() {
    console.warn("Veraltete Funktion 'closePollNow' aufgerufen. Bitte 'showFixDateSelection' verwenden.");
    alertUser("Ein interner Fehler ist aufgetreten (Veralteter Aufruf)", "error");
}

async function reopenPoll() {
    if (!confirm("Bist du sicher? Dadurch wird die Umfrage wieder geöffnet und (falls gesetzt) der fixierte Termin entfernt. Jeder kann wieder teilnehmen.")) {
        return;
    }

    const reopenBtn = document.getElementById('vote-reopen-poll-btn');
    setButtonLoading(reopenBtn, true);
    
    try {
        // Wir setzen die Endzeit UND den fixierten Index auf 'null'
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        
        await updateDoc(voteDocRef, {
            endTime: null,
            fixedOptionIndex: null // KORREKTUR: Auch den fixierten Termin aufheben
        });
        
        // Lokale Daten aktualisieren
        currentVoteData.endTime = null;
        currentVoteData.fixedOptionIndex = null; // KORREKTUR: Auch lokal aufheben
        
        alertUser("Umfrage wurde wieder geöffnet!", "success");
        
        // UI der Edit-Seite aktualisieren, um den Knopf zu wechseln
        renderEditView(currentVoteData);
        
    } catch (error) {
        console.error("Fehler beim Wiedereröffnen der Umfrage:", error);
        alertUser("Fehler beim Wiedereröffnen.", "error");
    } finally {
        setButtonLoading(reopenBtn, false);
    }
}

async function deletePoll() {
    const confirmation = prompt(`Um die Umfrage "${currentVoteData.title}" endgültig zu löschen, gib bitte LÖSCHEN ein:`);
    if (confirmation !== 'LÖSCHEN') {
        alertUser("Löschvorgang abgebrochen.", "info");
        return;
    }
    
    const deleteBtn = document.getElementById('vote-delete-poll-btn');
    setButtonLoading(deleteBtn, true);

    try {
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        await deleteDoc(voteDocRef);
        
        alertUser("Umfrage wurde endgültig gelöscht.", "success");
        
        // Zurück zur Hauptseite
        showView('main');
        currentVoteData = null;

    } catch (error) {
        console.error("Fehler beim Löschen der Umfrage:", error);
        alertUser("Fehler beim Löschen.", "error");
        setButtonLoading(deleteBtn, false);
    }
}

function renderPollHistory() {
    if (!currentVoteData || !currentVoteData.pollHistory || currentVoteData.pollHistory.length === 0) {
        return alertUser("Kein Bearbeitungsverlauf gefunden.", "info");
    }

    const modal = document.getElementById('correctionLogModal');
    const title = document.getElementById('correction-log-title');
    const content = document.getElementById('correction-log-content');
    
    title.textContent = "Bearbeitungs-Verlauf (Details)";
    
    content.innerHTML = currentVoteData.pollHistory.map(log => {
        // Umgang mit Firebase Timestamp ODER lokalem Datum
        let dateObject = null;
        if (log.timestamp) {
            if (typeof log.timestamp.toDate === 'function') dateObject = log.timestamp.toDate();
            else if (log.timestamp instanceof Date) dateObject = log.timestamp;
        }
        
        const timestamp = dateObject ? dateObject.toLocaleString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'Unbekanntes Datum';

        // Änderungen auflisten
        const changesHTML = log.changes.map(changeText => {
            return `<li class="text-sm">${changeText}</li>`;
        }).join('');

        return `
            <div class="p-3 bg-white rounded-lg shadow-sm border">
                <p class="text-xs font-semibold text-gray-700">
                    Änderung am ${timestamp} Uhr (von ${log.changedBy})
                </p>
                <ul class="list-disc list-inside mt-2">
                    ${changesHTML}
                </ul>
            </div>
        `;
    }).reverse().join(''); // .reverse(), damit Älteste oben sind

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

// ----- HELFER-FUNKTIONEN (Rest) -----


// NEU: Funktion zum Prüfen der URL auf Token/ID
function checkUrlForToken() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const voteId = urlParams.get('vote_id');
        const voteToken = urlParams.get('vote_token');

        if (voteId) {
            console.log("URL-Parameter 'vote_id' gefunden:", voteId);
            // Wir rufen joinVoteById auf, das async ist, aber wir müssen nicht darauf warten (es kümmert sich selbst)
            joinVoteById(voteId); 
        } else if (voteToken) {
             console.log("URL-Parameter 'vote_token' gefunden:", voteToken);
             joinVoteByToken(voteToken); 
        }
        
        // URL aufräumen, damit der Parameter weg ist
        if (voteId || voteToken) {
            cleanUrlParams();
        }
    } catch (e) {
        console.error("Fehler beim Prüfen der URL:", e);
    }
}


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

// HINZUFÜGEN (GANZ AM ENDE von terminplaner.js)

// ----- HELFER-FUNKTIONEN (Rest) -----

// HINZUFÜGEN (GANZ AM ENDE von terminplaner.js)

// ----- HELFER-FUNKTIONEN (Rest) -----

// NEU: Funktion zum Kopieren in die Zwischenablage
function copyToClipboard(text, successMessage) {
    if (!navigator.clipboard) {
        // Fallback für ältere/unsichere Browser (selten)
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alertUser(successMessage, "success");
        } catch (err) {
            console.error('Fallback-Kopieren fehlgeschlagen: ', err);
            alertUser("Kopieren wird von deinem Browser nicht unterstützt.", "error");
        }
        return;
    }
    // Moderne Methode
    navigator.clipboard.writeText(text).then(() => {
        alertUser(successMessage, "success");
    }).catch(err => {
        console.error('Fehler beim Kopieren: ', err);
        alertUser("Kopieren fehlgeschlagen.", "error");
    });
}

// NEU: Helfer zum Aufräumen der URL
function cleanUrlParams() {
    try {
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        console.log("URL-Parameter aufgeräumt.");
    } catch (e) {
        console.warn("URL konnte nicht aufgeräumt werden:", e);
    }
}

function checkInlineEditToken() {
    // 1. Timer stoppen, sobald geklickt wird
    if (editTokenTimer) {
        clearInterval(editTokenTimer);
        editTokenTimer = null;
    }
    
    const input = document.getElementById('edit-token-input-inline');
    const token = input.value.trim().toUpperCase();
    
    // 2. Token prüfen (wie bisher)
    if (currentVoteData && token === currentVoteData.editToken) {
        alertUser("Token korrekt! Lade Bearbeitungs-Modus...", "success");
        
        // UI zurücksetzen (wird von showView erledigt, die resetEditWrapper aufruft)
        showView('edit');
        renderEditView(currentVoteData);
    } else {
        alertUser("Falscher Bearbeitungs-Token!", "error");
        // Bei Fehler: UI zurücksetzen, damit man es nochmal versuchen kann
        resetEditWrapper();
    }
}

// ----- HINZUFÜGEN (GANZ AM ENDE von terminplaner.js) -----

// NEU: Berechnet die beste Option basierend auf "Ja"-Stimmen und Datum
function calculateBestOption(voteData) {
    if (!voteData || !voteData.options || voteData.options.length === 0) {
        return null;
    }

    let bestOption = null;
    let maxYesVotes = -1;
    let earliestDate = null;

    voteData.options.forEach((option, index) => {
        // 1. Zähle "Ja"-Stimmen
        const yesVotes = voteData.participants.filter(p => p.currentAnswers[index] === 'yes').length;
        
        // 2. Erstelle ein vergleichbares Datum-Objekt
        // Wichtig: Wir müssen Datum UND Startzeit kombinieren
        const currentOptionDate = new Date(`${option.date}T${option.timeStart}`);

        // 3. Logik anwenden (Deine Anforderung)
        if (yesVotes > maxYesVotes) {
            // Neuer Bester: Hat mehr "Ja"-Stimmen
            maxYesVotes = yesVotes;
            earliestDate = currentOptionDate;
            bestOption = { index: index, ...option, yesVotes: yesVotes };
        } else if (yesVotes === maxYesVotes) {
            // Gleichstand: Prüfe, ob dieser Termin *früher* ist
            if (earliestDate === null || currentOptionDate < earliestDate) {
                earliestDate = currentOptionDate;
                bestOption = { index: index, ...option, yesVotes: yesVotes };
            }
        }
    });
    
    return bestOption;
}

// NEU: Zeigt die UI zur Auswahl des finalen Termins an
function showFixDateSelection() {
    if (!currentVoteData) return;

    // 1. UI-Elemente holen
    const selectionContainer = document.getElementById('fix-date-selection-container');
    const listContainer = document.getElementById('final-date-options-list');
    const closeBtn = document.getElementById('vote-close-poll-btn'); // Den originalen "Schließen"-Button
    
    if (!selectionContainer || !listContainer || !closeBtn) {
        console.error("UI-Elemente für Terminfixierung nicht gefunden.");
        return;
    }

    // 2. Button verstecken, Container anzeigen
    closeBtn.classList.add('hidden');
    selectionContainer.classList.remove('hidden');
    listContainer.innerHTML = '<p class="text-sm text-gray-400 text-center">Berechne besten Termin...</p>';

    // 3. Besten Termin berechnen (Deine Anforderung)
    const suggestion = calculateBestOption(currentVoteData);

    // 4. Liste der Optionen generieren
    let optionsHTML = '';
    currentVoteData.options.forEach((option, index) => {
        // Zähle "Ja"-Stimmen für diese Option
        const yesVotes = currentVoteData.participants.filter(p => p.currentAnswers[index] === 'yes').length;
        
        const dateObj = new Date(option.date + 'T12:00:00');
        const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const timeString = option.timeEnd ? `${option.timeStart} - ${option.timeEnd}` : `${option.timeStart} Uhr`;

        // Prüfen, ob dies die vorgeschlagene Option ist
        const isSuggestion = (suggestion && suggestion.index === index);
        const suggestionBadge = isSuggestion ? '<span class="ml-2 bg-green-200 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">Vorschlag</span>' : '';
        
        // Radio-Button als 'checked' markieren, wenn es der Vorschlag ist
        const isChecked = isSuggestion ? 'checked' : '';

        optionsHTML += `
            <label class="flex items-center gap-3 p-3 bg-white rounded-lg border hover:bg-indigo-50 cursor-pointer">
                <input type="radio" name="final-date-option" value="${index}" class="h-5 w-5 text-indigo-600 focus:ring-indigo-500" ${isChecked}>
                <div>
                    <p class="font-semibold text-gray-800">${niceDate} <span class="font-mono">(${timeString})</span></p>
                    <p class="text-sm text-green-600 font-medium">
                        ${yesVotes} "Ja"-Stimme(n)
                        ${suggestionBadge}
                    </p>
                </div>
            </label>
        `;
    });
    
    if (currentVoteData.options.length === 0) {
         listContainer.innerHTML = '<p class="text-sm text-red-500 text-center">Fehler: Diese Umfrage hat keine Termin-Optionen.</p>';
    } else {
         listContainer.innerHTML = optionsHTML;
    }
}

// NEU: Versteckt die UI zur Auswahl des finalen Termins
function hideFixDateSelection() {
    const selectionContainer = document.getElementById('fix-date-selection-container');
    const closeBtn = document.getElementById('vote-close-poll-btn'); // Der originale "Schließen"-Button
    
    if (selectionContainer) selectionContainer.classList.add('hidden');
    if (closeBtn) closeBtn.classList.remove('hidden'); // Original-Button wieder zeigen
}

// NEU: Speichert den ausgewählten finalen Termin und schließt die Umfrage
async function confirmAndFixDate() {
    const confirmBtn = document.getElementById('confirm-fix-date-btn');
    
    // 1. Finde den ausgewählten Radio-Button
    const selectedRadio = document.querySelector('input[name="final-date-option"]:checked');
    if (!selectedRadio) {
        return alertUser("Bitte wähle einen finalen Termin aus der Liste aus.", "error");
    }
    
    const selectedOptionIndex = parseInt(selectedRadio.value, 10);
    if (isNaN(selectedOptionIndex)) {
        return alertUser("Ungültige Auswahl.", "error");
    }

    if (!confirm("Bist du sicher? Die Umfrage wird geschlossen und der Termin wird fixiert. Dies kann nicht rückgängig gemacht werden (außer durch 'Wieder öffnen').")) {
        return;
    }

    setButtonLoading(confirmBtn, true);

    try {
        const newEndTime = new Date(); // Setzt Endzeit auf "Jetzt"
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        
        await updateDoc(voteDocRef, {
            endTime: newEndTime,
            fixedOptionIndex: selectedOptionIndex // Der entscheidende neue Wert!
        });
        
        // Lokale Daten aktualisieren
        currentVoteData.endTime = newEndTime;
        currentVoteData.fixedOptionIndex = selectedOptionIndex;
        
        alertUser("Umfrage wurde geschlossen und Termin fixiert!", "success");
        
        // UI der Edit-Seite aufräumen
        hideFixDateSelection();
        
        // UI der Edit-Seite komplett neu rendern, um Status (geschlossen) zu zeigen
        renderEditView(currentVoteData);
        
        // Zurück zur (jetzt fixierten) Abstimmungs-Ansicht
        showView('vote');
        renderVoteView(currentVoteData);

    } catch (error) {
        console.error("Fehler beim Fixieren des Termins:", error);
        alertUser("Fehler beim Schließen.", "error");
    } finally {
        setButtonLoading(confirmBtn, false);
    }
}