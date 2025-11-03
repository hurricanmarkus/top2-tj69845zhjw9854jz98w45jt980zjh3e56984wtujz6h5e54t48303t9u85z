// NEU: Wir importieren viel mehr Tools
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
    onSnapshot, // NEU: Um live zuzuhören
    orderBy,    // NEU: Zum Sortieren
    limit       // NEU: Um die Anzahl zu begrenzen
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ----- Globale Variablen für den Zustand -----
let dateGroupIdCounter = 0;
let currentVoteData = null;
let selectedOptionIndex = null;
let currentParticipantAnswers = {};

// NEU: Globale Variablen, um unsere "Spione" (Listener) zu speichern,
// damit wir sie auch wieder stoppen können.
let unsubscribePublicVotes = null;
let unsubscribeAssignedVotes = null;


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
        joinVoteButton.addEventListener('click', joinVoteByToken);
        joinVoteButton.dataset.listenerAttached = 'true';
    }

    // ----- NEU: Delegierter Spion für die Listen -----
    // Wir fügen einen Spion zur Hauptseite hinzu, der auf Klicks 
    // auf die Umfrage-Karten in den Listen wartet.
    const mainView = document.getElementById('terminplaner-main-view');
    if (mainView && !mainView.dataset.listenerAttached) {
        mainView.addEventListener('click', (e) => {
            const pollCard = e.target.closest('.vote-list-item');
            if (pollCard) {
                const voteId = pollCard.dataset.voteId;
                if (voteId) {
                    console.log(`Klick auf Umfrage-Karte, ID: ${voteId}`);
                    joinVoteById(voteId); // Rufe unsere neue Funktion auf
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
                modal.style.display = 'none';
                modal.classList.add('hidden');
                showView('create');
            });
            groupPollButton.dataset.listenerAttached = 'true';
        }
        // Platzhalter-Spione
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
    // (Dieser Teil bleibt unverändert)
    const cancelVoteButton = document.getElementById('cancel-vote-participation-btn');
    if (cancelVoteButton && !cancelVoteButton.dataset.listenerAttached) {
        cancelVoteButton.addEventListener('click', () => {
            showView('main');
            currentVoteData = null;
        });
        cancelVoteButton.dataset.listenerAttached = 'true';
    }
    document.querySelectorAll('.vote-answer-btn').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', () => {
                if (selectedOptionIndex === null) return;
                const answer = btn.dataset.answer;
                currentParticipantAnswers[selectedOptionIndex] = answer;
                console.log("Antworten:", currentParticipantAnswers);
                updatePollTableAnswers(currentVoteData);
            });
            btn.dataset.listenerAttached = 'true';
        }
    });
    const saveParticipationButton = document.getElementById('vote-save-participation-btn');
    if (saveParticipationButton && !saveParticipationButton.dataset.listenerAttached) {
        saveParticipationButton.addEventListener('click', saveVoteParticipation);
        saveParticipationButton.dataset.listenerAttached = 'true';
    }
}


// ----- NEU: SPION-FUNKTIONEN (Listener) -----

/**
 * Startet den Spion für ÖFFENTLICHE Umfragen.
 * Diese Funktion wird von haupteingang.js aufgerufen.
 */
export function listenForPublicVotes() {
    // Stoppe den alten Spion, falls er läuft
    if (unsubscribePublicVotes) {
        unsubscribePublicVotes();
    }

    // Suche nach Umfragen, die 'isPublic' sind, sortiert nach Erstellungsdatum (neueste zuerst)
    const q = query(
        votesCollectionRef,
        where("isPublic", "==", true),
        orderBy("createdAt", "desc"),
        limit(20) // Zeige maximal die 20 neuesten
    );

    // Starte den neuen Spion
    unsubscribePublicVotes = onSnapshot(q, (snapshot) => {
        const votes = [];
        snapshot.forEach(doc => {
            votes.push({ id: doc.id, ...doc.data() });
        });
        renderPublicVotes(votes); // Übergebe die gefundenen Umfragen an die Render-Funktion
    }, (error) => {
        console.error("Fehler beim Lauschen auf öffentliche Umfragen:", error);
    });
}

/**
 * Startet den Spion für "An mich ZUGEWIESENE" Umfragen.
 * "Zugewiesen" bedeutet hier: Du hast schon mal teilgenommen.
 * Diese Funktion wird von log-InOut.js aufgerufen.
 */
export function listenForAssignedVotes(userId) {
    // Stoppe den alten Spion
    if (unsubscribeAssignedVotes) {
        unsubscribeAssignedVotes();
    }

    // Wenn kein Benutzer angemeldet ist (z.B. Gast oder Logout),
    // leere die Liste und starte keinen neuen Spion.
    if (!userId || userId === GUEST_MODE) {
        renderAssignedVotes([]); // Leere Liste rendern
        return;
    }

    // Suche nach Umfragen, bei denen deine 'userId' in der Teilnehmer-ID-Liste ('participantIds') vorkommt
    const q = query(
        votesCollectionRef,
        where("participantIds", "array-contains", userId),
        orderBy("createdAt", "desc"),
        limit(20)
    );

    // Starte den neuen Spion
    unsubscribeAssignedVotes = onSnapshot(q, (snapshot) => {
        const votes = [];
        snapshot.forEach(doc => {
            votes.push({ id: doc.id, ...doc.data() });
        });
        renderAssignedVotes(votes); // Übergebe die gefundenen Umfragen an die Render-Funktion
    }, (error) => {
        console.error("Fehler beim Lauschen auf zugewiesene Umfragen:", error);
    });
}

/**
 * Stoppt den "Zugewiesen"-Spion (wird bei Logout aufgerufen).
 */
export function stopAssignedVotesListener() {
    if (unsubscribeAssignedVotes) {
        unsubscribeAssignedVotes();
        unsubscribeAssignedVotes = null;
    }
    renderAssignedVotes([]); // Leere die Liste
}


// ----- NEU: RENDER-FUNKTIONEN FÜR LISTEN -----

/**
 * Baut die HTML-Liste für "Öffentliche Umfragen"
 */
function renderPublicVotes(votes) {
    const listContainer = document.getElementById('public-votes-list');
    if (!listContainer) return;

    if (votes.length === 0) {
        listContainer.innerHTML = `
            <p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">
                Derzeit gibt es keine öffentlichen Umfragen.
            </p>`;
        return;
    }

    listContainer.innerHTML = votes.map(vote => {
        const niceDate = vote.createdAt?.toDate().toLocaleDateString('de-DE') || '...';
        return `
            <div class="vote-list-item card bg-white p-3 rounded-lg shadow-sm border flex justify-between items-center cursor-pointer hover:bg-indigo-50"
                 data-vote-id="${vote.id}">
                <div>
                    <span class="font-bold text-indigo-700">${vote.title}</span>
                    <span class="text-sm text-gray-500 ml-2">(${vote.participants?.length || 0} Teilnehmer)</span>
                    <p class="text-xs text-gray-500">Erstellt von ${vote.createdBy} am ${niceDate}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-indigo-600">
                    <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" />
                </svg>
            </div>
        `;
    }).join('');
}

/**
 * Baut die HTML-Liste für "An mich zugewiesen"
 */
function renderAssignedVotes(votes) {
    const listContainer = document.getElementById('assigned-votes-list');
    if (!listContainer) return;

    // Wenn der Benutzer Gast ist, zeige eine andere Meldung
    if (currentUser.mode === GUEST_MODE) {
        listContainer.innerHTML = `
            <p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">
                Melde dich an, um Umfragen zu sehen, an denen du teilgenommen hast.
            </p>`;
        return;
    }

    if (votes.length === 0) {
        listContainer.innerHTML = `
            <p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">
                Du hast noch an keiner Umfrage teilgenommen.
            </p>`;
        return;
    }

    listContainer.innerHTML = votes.map(vote => {
        const niceDate = vote.createdAt?.toDate().toLocaleDateString('de-DE') || '...';
        return `
            <div class="vote-list-item card bg-white p-3 rounded-lg shadow-sm border flex justify-between items-center cursor-pointer hover:bg-indigo-50"
                 data-vote-id="${vote.id}">
                <div>
                    <span class="font-bold text-indigo-700">${vote.title}</span>
                    <span class="text-sm text-gray-500 ml-2">(${vote.participants?.length || 0} Teilnehmer)</span>
                    <p class="text-xs text-gray-500">Erstellt von ${vote.createdBy} am ${niceDate}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-indigo-600">
                    <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" />
                </svg>
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

// ----- NEU: DATENBANK-FUNKTION (Umfrage suchen per ID) -----
/**
 * Sucht eine Umfrage basierend auf der Datenbank-ID (aus der Liste)
 */
async function joinVoteById(voteId) {
    try {
        // Wir müssen die Umfrage neu laden, falls sich in der Zwischenzeit
        // etwas geändert hat (obwohl der Listener das tun sollte, ist dies sicherer).

        // Da wir 'onSnapshot' verwenden, sind die Daten in der Liste
        // (publicVotes / assignedVotes) bereits aktuell.
        // Wir müssen nicht extra zur Datenbank gehen.

        // Finde die Umfrage in den globalen Listen (die vom Spion gefüllt wurden)
        // TODO: Das ist nicht ideal. Besser ist, die Daten direkt aus der DB zu holen.

        // BESSERER ANSATZ: Wir holen die Daten frisch aus der DB,
        // um sicherzugehen, dass wir die aktuellsten Teilnehmer haben.

        const voteDocRef = doc(votesCollectionRef, voteId);
        const voteDoc = await getDoc(voteDocRef); // NEU: Importiere 'getDoc'

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
    // WICHTIG: Setze den ausgewählten Termin zurück
    selectedOptionIndex = null;
    // Deaktiviere die Knöpfe, bis ein Termin geklickt wird
    document.getElementById('vote-selected-option-text').textContent = "Bitte wähle einen Termin aus der Tabelle aus.";
    document.querySelectorAll('.vote-answer-btn').forEach(btn => btn.disabled = true);


    // 4. Die Abstimmungs-Tabelle bauen
    updatePollTableAnswers(voteData); // Ausgelagert in eigene Funktion

    // 5. Klick-Spione für die neuen Tabellen-Zeilen hinzufügen
    const optionsContainer = document.getElementById('vote-options-container');

    // Entferne alte Spione (sicherheitshalber)
    optionsContainer.querySelectorAll('.vote-option-row').forEach(row => {
        // Trick: Klonen, um alle alten Spione zu entfernen
        row.replaceWith(row.cloneNode(true));
    });

    // Füge Spione zu den neuen Zeilen hinzu
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

            // Markiere den Button, der der aktuellen Antwort entspricht
            document.querySelectorAll('.vote-answer-btn').forEach(btn => btn.classList.remove('ring-4', 'ring-indigo-500'));
            const currentAnswer = currentParticipantAnswers[selectedOptionIndex];
            if (currentAnswer) {
                document.querySelector(`.vote-answer-btn[data-answer="${currentAnswer}"]`)?.classList.add('ring-4', 'ring-indigo-500');
            }
        });
    });
}

// ----- Funktion zum Aktualisieren der Tabelle -----
function updatePollTableAnswers(voteData) {
    const optionsContainer = document.getElementById('vote-options-container');

    const optionsByDate = {};
    voteData.options.forEach((option, index) => {
        if (!optionsByDate[option.date]) {
            optionsByDate[option.date] = [];
        }
        optionsByDate[option.date].push({ ...option, originalIndex: index });
    });

    let tableHTML = '<table class="w-full border-collapse text-sm text-left">';

    // Kopfzeile der Tabelle
    tableHTML += '<thead><tr class="bg-gray-50">';
    tableHTML += '<th class="p-2 border-b sticky left-0 bg-gray-50 z-10">Termin</th>';

    voteData.participants.forEach(p => {
        tableHTML += `<th class="p-2 border-b text-center">${p.name}</th>`;
    });

    // "Du"-Spalte nur anzeigen, wenn der Benutzer nicht schon in der Liste ist
    let showYouColumn = true;
    if (currentUser.mode !== GUEST_MODE && voteData.participants.find(p => p.userId === currentUser.mode)) {
        showYouColumn = false;
    }
    if (showYouColumn) {
        tableHTML += `<th class="p-2 border-b text-center font-bold text-indigo-600">Du</th>`;
    }

    tableHTML += '</tr></thead>';

    // Zeilen der Tabelle
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

            // Antworten der gespeicherten Teilnehmer
            voteData.participants.forEach(p => {
                const answer = p.answers[option.originalIndex];
                let answerIcon = '';
                if (answer === 'yes') answerIcon = '<span class="text-green-500 font-bold">✔</span>';
                if (answer === 'no') answerIcon = '<span class="text-red-500 font-bold">✘</span>';
                if (answer === 'maybe') answerIcon = '<span class="text-yellow-500 font-bold">?</span>';
                tableHTML += `<td class="p-2 border-b text-center">${answerIcon}</td>`;
            });

            // Antwort des aktuellen Benutzers (noch nicht gespeichert)
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
            console.log("Aktualisiere Teilnehmer:", participantName);
            newParticipantsArray[existingParticipantIndex].answers = currentParticipantAnswers;
        } else {
            console.log("Füge neuen Teilnehmer hinzu:", participantName);
            newParticipantsArray.push({
                userId: participantId,
                name: participantName,
                answers: currentParticipantAnswers
            });
        }

        // NEU: Erstelle die Liste der Teilnehmer-IDs für die Datenbank-Suche
        const participantIds = newParticipantsArray.map(p => p.userId);

        // Datenbank-Update
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        await updateDoc(voteDocRef, {
            participants: newParticipantsArray,
            participantIds: participantIds // <-- NEU: Diese Liste speichern wir mit ab
        });

        alertUser("Deine Abstimmung wurde gespeichert!", "success");

        // Lokale Daten aktualisieren und Ansicht neu laden
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
            participants: [],
            participantIds: [] // NEU: Leere ID-Liste beim Erstellen
        };

        console.log("Speichere Umfrage in Firebase...", voteData);
        const docRef = await addDoc(votesCollectionRef, voteData);

        console.log(`Umfrage erstellt! ID: ${docRef.id}, Token: ${token}`);
        alertUser(`Umfrage erstellt! Dein Token: ${token}`, "success");

        showView('main');

    } catch (error) {
        console.error("Fehler beim Speichern der Umfrage:", error);
        alertUser(error.message, "error");

    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Umfrage erstellen und Link erhalten';
    }
}


// ----- HELFER-FUNKTIONEN -----

function showView(viewName) {
    document.getElementById('terminplaner-main-view').classList.add('hidden');
    document.getElementById('terminplaner-create-view').classList.add('hidden');
    document.getElementById('terminplaner-vote-view').classList.add('hidden');

    if (viewName === 'main') {
        document.getElementById('terminplaner-main-view').classList.remove('hidden');
    } else if (viewName === 'create') {
        document.getElementById('terminplaner-create-view').classList.remove('hidden');
        resetCreateWizard();
    } else if (viewName === 'vote') {
        document.getElementById('terminplaner-vote-view').classList.remove('hidden');
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