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
let editTokenTimer = null; // Für den 10-Sekunden-Timeout
let tempAssignedUserIds = []; // NEU: Für den Erstellungs-Assistenten
let assignModalContext = 'create'; // NEU: Merkt sich 'create' or 'edit'
let myPollsMap = new Map();
let unsubscribeMyAssignedVotes = null;
let unsubscribeMyCreatedVotes = null;
let isParticipantChoosingAnonymous = false;
let unsubscribeCurrentVote = null; // NEU: Spion für die aktuell geöffnete Umfrage


// ----- VERSCHOBENE FUNKTIONEN (UM DEN FEHLER ZU BEHEBEN) -----

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
    // KORREKTUR: Wir holen den *neuen* "Tag & Zeit fixieren"-Knopf statt des alten "Schließen"-Knopfes
    const fixBtn = document.getElementById('vote-fix-date-btn'); 
    
    if (!selectionContainer || !listContainer || !fixBtn) {
        console.error("UI-Elemente für Terminfixierung nicht gefunden.");
        return;
    }

    // 2. Button verstecken, Container anzeigen
    fixBtn.classList.add('hidden'); // KORREKTUR: Verstecke den *neuen* Knopf
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
    // KORREKTUR: Wir holen den *neuen* "Tag & Zeit fixieren"-Knopf
    const fixBtn = document.getElementById('vote-fix-date-btn'); 
    
    if (selectionContainer) selectionContainer.classList.add('hidden');
    if (fixBtn) fixBtn.classList.remove('hidden'); // KORREKTUR: Original-Button wieder zeigen
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
        // --- KORREKTUR HIER ---
        // Die Zeile "const newEndTime = new Date();" wurde entfernt.
        
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        
        await updateDoc(voteDocRef, {
            // "endTime: newEndTime," wurde entfernt.
            fixedOptionIndex: selectedOptionIndex // Der entscheidende neue Wert!
        });
        
        // Lokale Daten aktualisieren
        // "currentVoteData.endTime = newEndTime;" wurde entfernt.
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

// ----- NEUE FUNKTIONEN FÜR ZUWEISUNGS-MODAL -----

/**
 * Öffnet das Modal zur Auswahl von registrierten Benutzern.
 * (MODIFIZIERT: Liest jetzt den 'assignModalContext')
 */
function openAssignUserModal() {
    const modal = document.getElementById('assignUserModal');
    const listContainer = document.getElementById('assign-user-list');
    if (!modal || !listContainer) return;

    listContainer.innerHTML = ''; // Vorherigen Inhalt leeren

    // NEU: Entscheiden, welche IDs geladen werden sollen
    // Im 'create'-Modus nehmen wir die IDs aus der temporären Variable.
    // Im 'edit'-Modus nehmen wir die IDs aus den aktuell geladenen Umfragedaten.
    let currentlyAssignedIds = [];
    if (assignModalContext === 'create') {
        currentlyAssignedIds = [...tempAssignedUserIds];
    } else if (assignModalContext === 'edit' && currentVoteData) {
        currentlyAssignedIds = [...(currentVoteData.assignedUserIds || [])];
    }
    // ENDE NEU

    // Filtere alle Benutzer, die "registriert" sind (ein Passwort haben)
    // und nicht der Ersteller (currentUser) selbst sind.
    const registeredUsers = Object.values(USERS).filter(user => 
        user.key && 
        user.isActive && 
        user.id !== currentUser.mode // Man muss sich nicht selbst zuweisen
    );

    if (registeredUsers.length === 0) {
        listContainer.innerHTML = '<p class="text-sm text-center text-gray-400">Keine anderen registrierten Benutzer gefunden.</p>';
    } else {
        // Sortiere alphabetisch nach 'realName' oder 'name'
        registeredUsers.sort((a, b) => {
            const nameA = a.realName || a.name || '';
            const nameB = b.realName || b.name || '';
            return nameA.localeCompare(nameB);
        });
        
        registeredUsers.forEach(user => {
            // MODIFIZIERT: Prüft die 'currentlyAssignedIds'-Liste
            const isChecked = currentlyAssignedIds.includes(user.id) ? 'checked' : '';
            const userName = user.realName ? `${user.realName} <span class="text-xs text-gray-500">(${user.name})</span>` : user.name;

            listContainer.innerHTML += `
                <label class="flex items-center gap-3 p-3 bg-white rounded-lg border hover:bg-indigo-50 cursor-pointer">
                    <input type="checkbox" value="${user.id}" class="assign-user-checkbox h-5 w-5 text-indigo-600 focus:ring-indigo-500" ${isChecked}>
                    <div>
                        <span class="font-semibold text-gray-800">${userName}</span>
                    </div>
                </label>
            `;
        });
    }

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

/**
 * Schließt das Modal, ohne Änderungen zu speichern.
 */
function closeAssignUserModal() {
    const modal = document.getElementById('assignUserModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

/**
 * Übernimmt die Auswahl aus dem Modal, aktualisiert die temporäre Liste
 * und die Anzeige im Erstellungs-Assistenten.
 * (MODIFIZIERT: Speichert je nach Kontext)
 */
function applyAssignedUsers() {
    const checkedBoxes = document.querySelectorAll('#assign-user-list .assign-user-checkbox:checked');
    
    // 1. Baue die neue ID-Liste auf
    const newIds = Array.from(checkedBoxes).map(box => box.value);
    
    // 2. Hole die Namen der ausgewählten Benutzer
    let selectedNames = "Niemand ausgewählt";
    if (newIds.length > 0) {
        selectedNames = newIds.map(id => {
            const user = USERS[id];
            return user ? (user.realName || user.name) : id; // Fallback auf ID
        }).join(', ');
    }

    // 3. Entscheide, wo die Daten gespeichert werden sollen
    if (assignModalContext === 'create') {
        // Im "Erstellen"-Modus: Speichere in der temporären Variable
        tempAssignedUserIds = newIds;
        
        const assignedDisplay = document.getElementById('vote-assigned-users-display');
        if (assignedDisplay) {
            assignedDisplay.textContent = selectedNames;
            assignedDisplay.title = selectedNames; // Tooltip
        }

    } else if (assignModalContext === 'edit' && currentVoteData) {
        // Im "Bearbeiten"-Modus: Speichere direkt in den geladenen Umfragedaten
        currentVoteData.assignedUserIds = newIds;
        
        const assignedDisplayEdit = document.getElementById('vote-assigned-users-display-edit');
        if (assignedDisplayEdit) {
            assignedDisplayEdit.textContent = selectedNames;
            assignedDisplayEdit.title = selectedNames; // Tooltip
        }
    }

    // 4. Schließe das Modal
    closeAssignUserModal();
}

// ----- ENDE VERSCHOBENE FUNKTIONEN -----


export function initializeTerminplanerView() {
    
    // =================================================================
    // BEGINN DER ÄNDERUNG (Berechtigungs-Prüfung)
    // =================================================================
    
    // HINWEIS: Der Code-Block, der hier stand, um den 'createVoteButton'
    // zu steuern, wurde ENTFERNT.
    // Diese Logik ist jetzt ZENTRAL in 'log-InOut.js' -> 'updateUIForMode',
    // damit sie auch auf Live-Rechte-Änderungen reagiert.
    
    // =================================================================
    // ENDE DER ÄNDERUNG
    // =================================================================

    // --- NEU: Logik für die Haupt-URL-Share-Box ---
    const mainUrlInput = document.getElementById('main-share-url');
    if (mainUrlInput) {
        // --- KORREKTUR HIER ---
        // Wir fügen den Hinweis "?view=terminplaner" hinzu,
        // damit der Link direkt zu dieser Ansicht führt.
        mainUrlInput.value = window.location.origin + window.location.pathname + '?view=terminplaner';
    }
    const copyMainUrlBtn = document.getElementById('copy-main-url-btn');
    if (copyMainUrlBtn && !copyMainUrlBtn.dataset.listenerAttached) {
        copyMainUrlBtn.addEventListener('click', () => {
            if (mainUrlInput.value) {
                copyToClipboard(mainUrlInput.value, "Startseiten-URL kopiert!");
            }
        });
        copyMainUrlBtn.dataset.listenerAttached = 'true';
    }
    // --- ENDE NEU ---
    
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
                    setTimeout(() => {
                        joinVoteById(voteId);
                    }, 0);
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
    
    // Spion für Anonym-Checkbox (Erstellen)
    const anonymousCheckbox = document.getElementById('vote-setting-anonymous');
    if (anonymousCheckbox && !anonymousCheckbox.dataset.listenerAttached) {
        anonymousCheckbox.addEventListener('change', (e) => {
            const wrapper = document.getElementById('vote-setting-anonymous-mode-wrapper');
            if (wrapper) {
                wrapper.classList.toggle('hidden', !e.target.checked);
            }
        });
        anonymousCheckbox.dataset.listenerAttached = 'true';
    }
    
    // Spion für Anonym-Checkbox (Bearbeiten)
    const anonymousCheckboxEdit = document.getElementById('vote-setting-anonymous-edit');
    if (anonymousCheckboxEdit && !anonymousCheckboxEdit.dataset.listenerAttached) {
        anonymousCheckboxEdit.addEventListener('change', (e) => {
            const wrapper = document.getElementById('vote-setting-anonymous-mode-wrapper-edit');
            if (wrapper) {
                wrapper.classList.toggle('hidden', !e.target.checked);
            }
        });
        anonymousCheckboxEdit.dataset.listenerAttached = 'true';
    }

    // Spion für "Antworten verstecken" (Erstellen)
    const hideAnswersCheckbox = document.getElementById('vote-setting-hide-answers');
    if (hideAnswersCheckbox && !hideAnswersCheckbox.dataset.listenerAttached) {
        hideAnswersCheckbox.addEventListener('change', (e) => {
            const wrapper = document.getElementById('vote-setting-hide-answers-mode-wrapper');
            if (wrapper) {
                wrapper.classList.toggle('hidden', !e.target.checked);
            }
        });
        hideAnswersCheckbox.dataset.listenerAttached = 'true';
    }
    
    // Spion für "Antworten verstecken" (Bearbeiten)
    const hideAnswersCheckboxEdit = document.getElementById('vote-setting-hide-answers-edit');
    if (hideAnswersCheckboxEdit && !hideAnswersCheckboxEdit.dataset.listenerAttached) {
        hideAnswersCheckboxEdit.addEventListener('change', (e) => {
            const wrapper = document.getElementById('vote-setting-hide-answers-mode-wrapper-edit');
            if (wrapper) {
                wrapper.classList.toggle('hidden', !e.target.checked);
            }
        });
        hideAnswersCheckboxEdit.dataset.listenerAttached = 'true';
    }
    
    // Spione für "Sichtbarkeit" (Erstellen & Bearbeiten)
    const accessBtn = document.getElementById('vote-setting-access-btn');
    if (accessBtn && !accessBtn.dataset.listenerAttached) {
        accessBtn.addEventListener('click', () => {
            toggleAccessPolicy('vote-setting-access-mode', 'vote-setting-access-text');
        });
        accessBtn.dataset.listenerAttached = 'true';
    }
    
    const accessBtnEdit = document.getElementById('vote-setting-access-btn-edit');
    if (accessBtnEdit && !accessBtnEdit.dataset.listenerAttached) {
        accessBtnEdit.addEventListener('click', () => {
            toggleAccessPolicy('vote-setting-access-mode-edit', 'vote-setting-access-text-edit');
        });
        accessBtnEdit.dataset.listenerAttached = 'true';
    }


    // ----- Spione für die Abstimmungs-Seite -----
    
    const cancelVoteButton = document.getElementById('cancel-vote-participation-btn');
    if (cancelVoteButton && !cancelVoteButton.dataset.listenerAttached) {
        // =================================================================
        // BEGINN DER ÄNDERUNG (Live-Spion stoppen)
        // =================================================================
        cancelVoteButton.addEventListener('click', () => {
            stopCurrentVoteListener(); // <-- NEU: Stoppt den Live-Spion
            showView('main'); 
            currentVoteData = null; 
        });
        // =================================================================
        // ENDE DER ÄNDERUNG
        // =================================================================
        cancelVoteButton.dataset.listenerAttached = 'true';
    }

    const voteView = document.getElementById('terminplaner-vote-view');
    // ... (Rest der Funktion bleibt gleich) ...
    if (voteView && !voteView.dataset.listenerAttached) {
        voteView.addEventListener('click', (e) => {
            
            // "Ändern"-Knopf für Benutzer
            const userChangeBtn = e.target.closest('#vote-user-change-to-anon-btn');
            if (userChangeBtn) {
                const nameDisplay = document.getElementById('vote-participant-name');
                if (isParticipantChoosingAnonymous) {
                    // Zurück zum Namen
                    isParticipantChoosingAnonymous = false;
                    const currentUserFull = USERS[currentUser.mode];
                    nameDisplay.textContent = currentUserFull ? currentUserFull.realName : currentUser.displayName;
                    userChangeBtn.textContent = 'Ändern';
                    userChangeBtn.classList.remove('bg-blue-600', 'text-white');
                    userChangeBtn.classList.add('bg-gray-200', 'text-gray-700');
                } else {
                    // Zu "Anonym" wechseln
                    isParticipantChoosingAnonymous = true;
                    nameDisplay.textContent = 'Anonym';
                    userChangeBtn.textContent = 'Meinen Namen verwenden';
                    userChangeBtn.classList.add('bg-blue-600', 'text-white');
                    userChangeBtn.classList.remove('bg-gray-200', 'text-gray-700');
                }
                return; // Klick ist erledigt
            }
            
            // "Ändern"-Knopf für Gäste
            const guestChangeBtn = e.target.closest('#vote-guest-change-to-anon-btn');
            if (guestChangeBtn) {
                const guestInput = document.getElementById('vote-guest-name-input');
                if (isParticipantChoosingAnonymous) {
                    // Zurück zum Namen-Eingabefeld
                    isParticipantChoosingAnonymous = false;
                    guestInput.disabled = false;
                    guestInput.value = '';
                    guestInput.placeholder = 'Vor- und Nachname...';
                    guestChangeBtn.textContent = 'Anonym teilnehmen';
                } else {
                    // Zu "Anonym" wechseln
                    isParticipantChoosingAnonymous = true;
                    guestInput.disabled = true;
                    guestInput.value = 'Anonym';
                    guestInput.placeholder = '';
                    guestChangeBtn.textContent = 'Namen eingeben';
                }
                return; // Klick ist erledigt
            }
            
            
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

            const pollHistoryBtnMain = e.target.closest('#show-poll-history-btn-main');
            if (pollHistoryBtnMain) {
                renderPollHistory();
            }

            const acknowledgeBtn = e.target.closest('#acknowledge-update-btn');
            if (acknowledgeBtn) {
                handleAcknowledgeUpdate();
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

    // ----- Spione für die Bearbeitungs-Seite (Ansicht 4) -----

    const cancelEditingBtn = document.getElementById('cancel-vote-editing-btn');
    if (cancelEditingBtn && !cancelEditingBtn.dataset.listenerAttached) {
        // =================================================================
        // BEGINN DER ÄNDERUNG (Live-Spion starten)
        // =================================================================
        cancelEditingBtn.addEventListener('click', () => {
            // Wir stoppen den Spion NICHT, sondern gehen zurück zur 'vote'-Ansicht
            // und rufen 'joinVoteById' auf. 'joinVoteById' startet
            // den Spion 'listenToCurrentVote' automatisch neu.
            showView('vote');
            joinVoteById(currentVoteData.id); 
        });
        // =================================================================
        // ENDE DER ÄNDERUNG
        // =================================================================
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
    
    const fixDateBtn = document.getElementById('vote-fix-date-btn');
    if (fixDateBtn && !fixDateBtn.dataset.listenerAttached) {
        fixDateBtn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            if (action === 'fix') {
                showFixDateSelection(); // Zeige die Auswahl
            } else if (action === 'unfix') {
                unfixPollDate(); // Hebe die Fixierung auf
            }
        });
        fixDateBtn.dataset.listenerAttached = 'true';
    }

    const toggleManualCloseBtn = document.getElementById('vote-toggle-manual-close-btn');
    if (toggleManualCloseBtn && !toggleManualCloseBtn.dataset.listenerAttached) {
        toggleManualCloseBtn.addEventListener('click', toggleManualPollClose);
        toggleManualCloseBtn.dataset.listenerAttached = 'true';
    }
    
    
    const deletePollBtn = document.getElementById('vote-delete-poll-btn');
    if (deletePollBtn && !deletePollBtn.dataset.listenerAttached) {
        deletePollBtn.addEventListener('click', deletePoll);
        deletePollBtn.dataset.listenerAttached = 'true';
    }
    
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
    
    // --- Spione für das Zuweisen-Modal ---
    // ... (unverändert) ...
    const showAssignModalBtn = document.getElementById('vote-show-assign-user-modal-btn');
    if (showAssignModalBtn && !showAssignModalBtn.dataset.listenerAttached) {
        showAssignModalBtn.addEventListener('click', () => {
            assignModalContext = 'create';
            openAssignUserModal();
        });
        showAssignModalBtn.dataset.listenerAttached = 'true';
    }
    const showAssignModalBtnEdit = document.getElementById('vote-show-assign-user-modal-btn-edit');
    if (showAssignModalBtnEdit && !showAssignModalBtnEdit.dataset.listenerAttached) {
        showAssignModalBtnEdit.addEventListener('click', () => {
            assignModalContext = 'edit';
            openAssignUserModal();
        });
        showAssignModalBtnEdit.dataset.listenerAttached = 'true';
    }
    const closeAssignModalBtn = document.getElementById('assign-user-modal-close-btn');
    if (closeAssignModalBtn && !closeAssignModalBtn.dataset.listenerAttached) {
        closeAssignModalBtn.addEventListener('click', closeAssignUserModal);
        closeAssignModalBtn.dataset.listenerAttached = 'true';
    }
    const cancelAssignModalBtn = document.getElementById('assign-user-modal-cancel-btn');
    if (cancelAssignModalBtn && !cancelAssignModalBtn.dataset.listenerAttached) {
        cancelAssignModalBtn.addEventListener('click', closeAssignUserModal);
        cancelAssignModalBtn.dataset.listenerAttached = 'true';
    }
    const applyAssignModalBtn = document.getElementById('assign-user-modal-apply-btn');
    if (applyAssignModalBtn && !applyAssignModalBtn.dataset.listenerAttached) {
        applyAssignModalBtn.addEventListener('click', applyAssignedUsers);
        applyAssignModalBtn.dataset.listenerAttached = 'true';
    }
    
    // ----- Spione für die Bearbeiten-Funktionen -----
    // ... (unverändert) ...
    const addDateButtonEdit = document.getElementById('vote-add-date-btn-edit');
    if (addDateButtonEdit && !addDateButtonEdit.dataset.listenerAttached) {
        addDateButtonEdit.addEventListener('click', addNewDateGroupEdit);
        addDateButtonEdit.dataset.listenerAttached = 'true';
    }
    const datesContainerEdit = document.getElementById('vote-dates-container-edit');
    if (datesContainerEdit && !datesContainerEdit.dataset.listenerAttached) {
        datesContainerEdit.addEventListener('click', (e) => {
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
        });
        datesContainerEdit.dataset.listenerAttached = 'true';
    }
    const adminGridContainer = document.getElementById('edit-participant-grid-container');
    if (adminGridContainer && !adminGridContainer.dataset.listenerAttached) {
        adminGridContainer.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.admin-vote-grid-btn');
            if (clickedButton && !clickedButton.disabled) {
                const participantId = clickedButton.dataset.participantId;
                const optionIndex = clickedButton.dataset.optionIndex;
                const newAnswer = clickedButton.dataset.answer;
                
                handleAdminVoteEdit(participantId, optionIndex, newAnswer, clickedButton);
            }
        });
        adminGridContainer.dataset.listenerAttached = 'true';
    }
    const manageTermsList = document.getElementById('manage-existing-terms-list');
    if (manageTermsList && !manageTermsList.dataset.listenerAttached) {
        manageTermsList.addEventListener('click', (e) => {
            const strikeBtn = e.target.closest('.strike-term-btn');
            if (strikeBtn) {
                const optionIndex = parseInt(strikeBtn.dataset.optionIndex, 10);
                handleStrikeTerm(optionIndex, true); // true = streichen
            }
            
            const restoreBtn = e.target.closest('.restore-term-btn');
            if (restoreBtn) {
                const optionIndex = parseInt(restoreBtn.dataset.optionIndex, 10);
                handleStrikeTerm(optionIndex, false); // false = wiederherstellen
            }
        });
        manageTermsList.dataset.listenerAttached = 'true';
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
        
        // --- NEUE FILTERUNG FÜR GÄSTE ---
        let filteredVotes = votes;
        // Wenn der Benutzer ein Gast ist...
        if (currentUser.mode === GUEST_MODE) {
            // ...zeige nur Umfragen, die 'guests' erlauben (oder alte Umfragen ohne die Einstellung)
            filteredVotes = votes.filter(vote => vote.accessPolicy !== 'registered');
        }
        // --- ENDE NEUE FILTERUNG ---
        
        renderPublicVotes(filteredVotes); // Übergebe die gefilterte Liste
        
    }, (error) => {
        console.error("Fehler beim Lauschen auf öffentliche Umfragen:", error);
    });
}

// ERSETZE listenForAssignedVotes hiermit:
export function listenForMyVotes(userId) {
    // Stoppe alte Listener, falls sie laufen
    stopMyVotesListener();

    if (!userId || userId === GUEST_MODE) {
        sortAndRenderAllVotes([]); // Leere das Dashboard
        return;
    }

    console.log(`[Terminplaner] Starte Listener für User: ${userId}`);
    myPollsMap.clear(); // Setze die gesammelten Umfragen zurück

    // Die Funktion, die die Daten sammelt und neu sortiert
    const combineAndRender = () => {
        const allMyVotes = Array.from(myPollsMap.values());
        sortAndRenderAllVotes(allMyVotes);
    };

    // Listener 1: Umfragen, die mir ZUGEWIESEN sind (im participantIds Array)
    const qAssigned = query(
        votesCollectionRef, 
        where("participantIds", "array-contains", userId)
    );
    unsubscribeMyAssignedVotes = onSnapshot(qAssigned, (snapshot) => {
        console.log(`[Terminplaner] ${snapshot.docs.length} zugewiesene Umfragen empfangen.`);
        snapshot.docs.forEach(doc => {
            myPollsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
        // (Wir müssen auch Dokumente entfernen, die nicht mehr im Query sind)
        snapshot.docChanges().forEach((change) => {
            if (change.type === "removed") {
                myPollsMap.delete(change.doc.id);
            }
        });
        combineAndRender();
    }, (error) => {
        console.error("Fehler bei 'Mir zugewiesen'-Listener:", error);
    });

    // Listener 2: Umfragen, die VON MIR ERSTELLT wurden
    const qCreated = query(
        votesCollectionRef, 
        where("createdBy", "==", userId)
    );
    unsubscribeMyCreatedVotes = onSnapshot(qCreated, (snapshot) => {
        console.log(`[Terminplaner] ${snapshot.docs.length} erstellte Umfragen empfangen.`);
        snapshot.docs.forEach(doc => {
            myPollsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
        snapshot.docChanges().forEach((change) => {
            if (change.type === "removed") {
                myPollsMap.delete(change.doc.id);
            }
        });
        combineAndRender();
    }, (error) => {
        console.error("Fehler bei 'Von mir erstellt'-Listener:", error);
    });
}

// ERSETZE stopAssignedVotesListener hiermit:
export function stopMyVotesListener() {
    if (unsubscribeMyAssignedVotes) {
        unsubscribeMyAssignedVotes();
        unsubscribeMyAssignedVotes = null;
    }
    if (unsubscribeMyCreatedVotes) {
        unsubscribeMyCreatedVotes();
        unsubscribeMyCreatedVotes = null;
    }
    myPollsMap.clear();
    sortAndRenderAllVotes([]); // Leere das Dashboard
}

/**
 * Stoppt den Live-Spion für die aktuell geöffnete Umfrage.
 */
function stopCurrentVoteListener() {
    if (unsubscribeCurrentVote) {
        console.log("[Terminplaner] Stoppe Live-Spion für die geöffnete Umfrage.");
        unsubscribeCurrentVote();
        unsubscribeCurrentVote = null;
    }
}

/**
 * Startet einen Live-Spion (onSnapshot) für eine spezifische Umfrage-ID.
 * Diese Funktion übernimmt jetzt das Rendern der Abstimmungs-Ansicht.
 */
function listenToCurrentVote(voteId) {
    // 1. Alten Spion stoppen
    stopCurrentVoteListener();

    console.log(`[Terminplaner] Starte Live-Spion für Umfrage-ID: ${voteId}`);
    
    // 2. Neuen Spion (onSnapshot) an das Dokument hängen
    unsubscribeCurrentVote = onSnapshot(
        doc(votesCollectionRef, voteId), 
        (docSnap) => {
            if (docSnap.exists()) {
                // 3. Daten gefunden -> UI live aktualisieren
                console.log("[Terminplaner] Live-Update für Umfrage empfangen!");
                currentVoteData = { id: docSnap.id, ...docSnap.data() };
                
                // 4. Prüfen, ob wir uns noch auf der Abstimm-Seite befinden
                const voteView = document.getElementById('terminplaner-vote-view');
                if (voteView && voteView.classList.contains('active')) {
                    // Nur wenn die Ansicht aktiv ist, rendern wir sie neu
                    renderVoteView(currentVoteData);
                } else {
                    // Wenn der Benutzer z.B. auf die "Bearbeiten"-Seite gewechselt ist,
                    // stoppen wir den Spion, um unnötige Neu-Renderings zu vermeiden.
                    stopCurrentVoteListener();
                }
                
            } else {
                // 5. Umfrage wurde gelöscht, während wir zuschauen
                console.warn("[Terminplaner] Live-Update: Geöffnete Umfrage wurde gelöscht!");
                stopCurrentVoteListener();
                alertUser("Diese Umfrage wurde vom Ersteller gelöscht.", "error");
                showView('main'); // Zurück zur Hauptseite
            }
        }, 
        (error) => {
            // 6. Fehlerbehandlung (z.B. keine Berechtigung)
            console.error("[Terminplaner] Fehler beim Live-Spion für Umfrage:", error);
            stopCurrentVoteListener();
            alertUser("Fehler beim Laden der Umfrage-Updates.", "error");
            showView('main');
        }
    );
}


// ----- RENDER-FUNKTIONEN FÜR LISTEN -----

function renderPublicVotes(votes) {
    const listContainer = document.getElementById('public-votes-list');
    if (!listContainer) return;

    // NEU: Sortierlogik (Punkt 2, identisch zu renderVoteList)
    const now = new Date();
    const getSafeDate = (timestamp) => {
        if (!timestamp) return null;
        if (typeof timestamp.toDate === 'function') return timestamp.toDate();
        return new Date(timestamp);
    };

    const endingSoon = [];
    const others = [];

    for (const vote of votes) {
        const endTime = getSafeDate(vote.endTime);
        const isFixed = vote.fixedOptionIndex != null;
        const isExpired = endTime && endTime < now;

        if (!isFixed && !isExpired && endTime) {
            endingSoon.push(vote);
        } else {
            others.push(vote);
        }
    }
    
    endingSoon.sort((a, b) => (getSafeDate(a.endTime) || 0) - (getSafeDate(b.endTime) || 0));
    others.sort((a, b) => (getSafeDate(b.createdAt) || 0) - (getSafeDate(a.createdAt) || 0));
    
    const sortedVotes = [...endingSoon, ...others];
    // ENDE NEU

    if (sortedVotes.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">Derzeit gibt es keine öffentlichen Umfragen.</p>`;
        return;
    }

    listContainer.innerHTML = sortedVotes.map(vote => {
        const niceDate = vote.createdAt?.toDate().toLocaleDateString('de-DE') || '...';
        const fixedTag = vote.fixedOptionIndex != null ? '<span class="ml-2 bg-green-200 text-green-800 text-xs font-bold px-2 py-0.5 rounded-full">FIXIERT</span>' : '';

        // Wir fügen die Countdown-Box auch hier hinzu
        const endTime = getSafeDate(vote.endTime);
        const isFixed = vote.fixedOptionIndex != null;
        const isExpired = endTime && endTime < now;
        
        let statusBox2 = '';
        if (isFixed) {
            statusBox2 = `<span class="text-xs font-semibold px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full">Termin fixiert</span>`;
        } else if (isExpired) {
            statusBox2 = `<span class="text-xs font-semibold px-2 py-0.5 bg-gray-300 text-gray-700 rounded-full">Abgelaufen</span>`;
        } else if (endTime) {
            const countdownText = formatTimeRemaining(endTime);
            statusBox2 = `<span class="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">${countdownText}</span>`;
        } else {
            statusBox2 = `<span class="text-xs font-semibold px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">Unbegrenzt</span>`;
        }

        return `
            <div class="vote-list-item card bg-white p-3 rounded-lg shadow-sm border flex justify-between items-center cursor-pointer hover:bg-indigo-50"
                 data-vote-id="${vote.id}">
                <div>
                    <span class="font-bold text-indigo-700">${vote.title}</span>
                    ${fixedTag}
                    <span class="text-sm text-gray-500 ml-2">(${vote.participants?.length || 0} Teilnehmer)</span>
                    <p class="text-xs text-gray-500">Erstellt von ${vote.createdByName} am ${niceDate}</p>
                    <div class="flex flex-wrap gap-2 mt-2">
                        ${statusBox2}
                    </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-indigo-600"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" /></svg>
            </div>
        `;
    }).join('');
}

// ----- DATENBANK-FUNKTION (Umfrage suchen per Token) -----
// (ANGEPASST: Ruft jetzt 'cleanUrl' auf)
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
        const voteId = voteDoc.id; // Nur die ID holen
        
        // --- ÄNDERUNG ---
        // Wir rufen jetzt die Haupt-Funktion 'joinVoteById' auf,
        // die sich um die Berechtigungs-Prüfung und den Live-Spion kümmert.
        
        // (Wir müssen 'await' verwenden, falls joinVoteById einen Fehler wirft,
        // z.B. wenn ein Gast versucht, einer privaten Umfrage beizutreten)
        await joinVoteById(voteId); 
        
        if (tokenInput) tokenInput.value = ''; 
        if (tokenFromUrl) cleanUrlParams(); // (wird von joinVoteById auch gemacht, aber doppelt schadet nicht)
        
    } catch (error) {
        // Fehler, die von getDocs ODER joinVoteById kommen, werden hier gefangen
        console.error("Fehler beim Suchen der Umfrage per Token:", error);
        alertUser(error.message, "error_long"); // Längere Anzeige
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
        
        // --- HINTERGRUND ---
        // Bisher hat diese Funktion die Daten geholt, aber NICHT
        // die Seite gezeichnet ('renderVoteView'). Das hat sie
        // dem 'listenToCurrentVote'-Spion überlassen.
        // Das führt zu einer Verzögerung (Race Condition), in der
        // die Seite leer ist (Symptom 1).
        
        const voteDocRef = doc(votesCollectionRef, idToLoad);
        const voteDoc = await getDoc(voteDocRef); 
        if (!voteDoc.exists()) {
             throw new Error("Diese Umfrage existiert nicht mehr.");
        }
        
        const voteData = { id: voteDoc.id, ...voteDoc.data() }; 

        const isRegisteredOnly = voteData.accessPolicy === 'registered' || !voteData.accessPolicy;
        if (isRegisteredOnly && currentUser.mode === GUEST_MODE) {
            throw new Error("Diese Umfrage ist nur für angemeldete Benutzer verfügbar. Bitte melde dich über den Modus-Bereich unten an.");
        }

        // 1. Globale Variable (korrekt) setzen
        currentVoteData = voteData; 
        console.log("Umfrage per ID geladen (Initial-Check):", currentVoteData.id);
        
        navigate('terminplaner'); 
        showView('vote'); 

        // --- KORREKTUR (1 von 2) ---
        // Rufe renderVoteView SOFORT mit den Snapshot-Daten auf.
        // Dies behebt das "leere Ansicht"-Problem (Symptom 1).
        renderVoteView(currentVoteData);
        // --- ENDE KORREKTUR (1 von 2) ---

        // --- KORREKTUR (2 von 2) ---
        // Entferne das 'setTimeout'. Der Listener soll sofort starten,
        // um nach Updates zu suchen.
        listenToCurrentVote(idToLoad); 
        // --- ENDE KORREKTUR (2 von 2) ---
        
        if (isFromUrl) cleanUrlParams();
        
    } catch (error) {
        console.error("Fehler beim Laden der Umfrage per ID:", error);
        alertUser(error.message, "error_long"); // Längere Anzeige
    }
}



// ERSETZE diese Funktion in terminplaner.js
function renderVoteView(voteData) {
    
    // ----- 0. Globale Variable zurücksetzen -----
    isParticipantChoosingAnonymous = false;
    
    // ----- 1. DEFINITIONEN -----
    const now = new Date();
    const getSafeDate = (timestamp) => {
        if (!timestamp) return null;
        if (typeof timestamp.toDate === 'function') return timestamp.toDate();
        return new Date(timestamp);
    };

    const startTime = getSafeDate(voteData.startTime);
    const endTime = getSafeDate(voteData.endTime);

    const isFixed = voteData.fixedOptionIndex != null;
    const isClosedByTime = (endTime && now > endTime); 
    const isManuallyClosed = voteData.isManuallyClosed === true; 
    const isNotStarted = (startTime && now < startTime); 
    
    const isPollClosed = isFixed || isClosedByTime || isManuallyClosed; // Gesamter "Geschlossen"-Status
    const isParticipationBlocked = isPollClosed || isNotStarted; // Darf man überhaupt abstimmen?

    const youParticipant = (currentUser.mode !== GUEST_MODE) ? 
        voteData.participants.find(p => p.userId === currentUser.mode) : 
        null;

    // ----- 2. Titel & Ersteller (Sicher) -----
    const titleEl = document.getElementById('vote-poll-title');
    if (titleEl) titleEl.textContent = voteData.title;
    
    const creatorUser = USERS[voteData.createdBy];
    const creatorName = creatorUser ? creatorUser.realName : voteData.createdByName; 
    const creatorEl = document.getElementById('vote-poll-creator');
    if (creatorEl) creatorEl.textContent = `Erstellt von ${creatorName}`;

    // ----- 3. Share-Box (Sicher) -----
    const tokenEl = document.getElementById('vote-share-token');
    if (tokenEl) tokenEl.textContent = voteData.token;
    
    const baseUrl = window.location.origin + window.location.pathname; 
    const directUrl = `${baseUrl}?vote_id=${currentVoteData.id}`; 
    const urlEl = document.getElementById('vote-share-url');
    if (urlEl) urlEl.value = directUrl;

    // ----- 4. Info-Box (Beschreibung, Ort, Updates) -----
    const infoBox = document.getElementById('vote-info-box');
    const descContainer = document.getElementById('vote-poll-description-container');
    const descEl = document.getElementById('vote-poll-description');
    const locContainer = document.getElementById('vote-poll-location-container');
    const locEl = document.getElementById('vote-poll-location');
    const updateBox = document.getElementById('poll-update-notification-box');
    const updateSubtitle = document.getElementById('poll-update-subtitle');
    const detailsBtn = document.getElementById('show-poll-history-btn-main');
    const ackBtn = document.getElementById('acknowledge-update-btn');

    // Setze Stile zurück
    if (descContainer) descContainer.classList.remove('blink-border-blue');
    if (locContainer) locContainer.classList.remove('blink-border-blue');
    if (titleEl) titleEl.classList.remove('blink-border-blue'); 
    
    if (updateBox) {
        updateBox.classList.add('hidden'); 
        updateBox.classList.remove('bg-transparent', 'border-gray-400'); 
        updateBox.classList.add('bg-blue-50', 'border-blue-500'); 
    }
    if (detailsBtn) {
        detailsBtn.classList.remove('btn-gray-acknowledged');
        detailsBtn.classList.add('bg-blue-600', 'hover:bg-blue-700'); 
    }
    
    // --- KORREKTUR HIER ---
    // Der "Quittieren"-Knopf wird standardmäßig versteckt.
    if (ackBtn) {
        ackBtn.classList.add('hidden');
    }
    // --- ENDE KORREKTUR ---
    
    if (updateSubtitle) updateSubtitle.classList.remove('hidden');

    let hasUpdate = false;
    let lastUpdateTimestamp = null;
    if (voteData.pollHistory && voteData.pollHistory.length > 0) {
        const lastUpdate = voteData.pollHistory[voteData.pollHistory.length - 1];
        if (lastUpdate.timestamp) {
            lastUpdateTimestamp = getSafeDate(lastUpdate.timestamp);
            hasUpdate = true;
        }
    }
    
    let userHasAcknowledged = false;
    if (hasUpdate && currentUser.mode !== GUEST_MODE) {
        const ackArray = voteData.acknowledgedBy || [];
        const userAckEntry = ackArray.find(a => a.userId === currentUser.mode);
        if (userAckEntry) {
            const userAckTimestamp = getSafeDate(userAckEntry.timestamp);
            if (userAckTimestamp && lastUpdateTimestamp && userAckTimestamp.getTime() >= lastUpdateTimestamp.getTime()) {
                userHasAcknowledged = true;
            }
        }
    }

    if (hasUpdate) {
        if (updateBox) updateBox.classList.remove('hidden');

        if (userHasAcknowledged) {
            // Benutzer hat bereits quittiert
            if (updateBox) {
                updateBox.classList.remove('bg-blue-50', 'border-blue-500');
                updateBox.classList.add('bg-transparent', 'border-gray-400'); 
            }
            if (detailsBtn) {
                detailsBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                detailsBtn.classList.add('btn-gray-acknowledged'); 
            }
            // ackBtn bleibt versteckt (wurde oben schon gesetzt)
            if (updateSubtitle) updateSubtitle.classList.add('hidden'); 

        } else {
            // Benutzer hat NOCH NICHT quittiert
            
            // --- KORREKTUR HIER ---
            // Wir zeigen den Knopf nur, wenn der Benutzer KEIN Gast ist.
            if (currentUser.mode !== GUEST_MODE) {
                if (ackBtn) ackBtn.classList.remove('hidden');
            }
            // --- ENDE KORREKTUR ---
            
            // Blink-Logik (unverändert)
            const lastUpdate = voteData.pollHistory[voteData.pollHistory.length - 1];
            if (lastUpdate && lastUpdate.changes) {
                const changedTitle = lastUpdate.changes.some(c => c.includes('Titel'));
                const changedDesc = lastUpdate.changes.some(c => c.includes('Beschreibung'));
                const changedLoc = lastUpdate.changes.some(c => c.includes('Ort'));
                if (changedTitle && titleEl) titleEl.classList.add('blink-border-blue');
                if (changedDesc && descContainer) descContainer.classList.add('blink-border-blue');
                if (changedLoc && locContainer) locContainer.classList.add('blink-border-blue');
            }
        }
    }

    let hasInfo = false;
    if (voteData.description) {
        if (descEl) descEl.textContent = voteData.description;
        if (descContainer) descContainer.classList.remove('hidden');
        hasInfo = true;
    } else { 
        if (descContainer) descContainer.classList.add('hidden'); 
    }
    if (voteData.location) {
        if (locEl) locEl.textContent = voteData.location;
        if (locContainer) locContainer.classList.remove('hidden');
        hasInfo = true;
    } else { 
        if (locContainer) locContainer.classList.add('hidden'); 
    }
    if (infoBox) infoBox.classList.toggle('hidden', !hasInfo && !hasUpdate);


    // ----- 5. Gültigkeits-Boxen (Sicher) -----
    const validityContainer = document.getElementById('vote-poll-validity-container');
    const validityEl = document.getElementById('vote-poll-validity');
    const warningBox = document.getElementById('vote-validity-warning-box');
    const warningText = document.getElementById('vote-validity-warning-text');
    const formatVoteDate = (dateObj) => {
        if (!dateObj) return '';
        return dateObj.toLocaleString('de-DE', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) + ' Uhr';
    };
    
    if (isPollClosed && !isFixed) { 
        if (validityEl) validityEl.textContent = "TEILNAHME GESCHLOSSEN";
        if (validityContainer) {
            validityContainer.classList.add('text-red-700', 'bg-red-50', 'p-3', 'font-bold'); 
            validityContainer.classList.remove('text-gray-600');
            validityContainer.classList.remove('hidden');
        }
    } else {
        const startTimeText = formatVoteDate(startTime);
        const endTimeText = formatVoteDate(endTime);
        let validityText = '';
        if (startTimeText) validityText = `Startet: ${startTimeText}`;
        if (endTimeText) validityText += (validityText ? ' | ' : '') + `Endet: ${endTimeText}`;
        if (validityText && !isFixed) { 
            if (validityEl) validityEl.textContent = validityText;
            if (validityContainer) validityContainer.classList.remove('hidden');
        } else {
            if (validityContainer) validityContainer.classList.add('hidden');
        }
        if (validityContainer) {
            validityContainer.classList.remove('text-red-700', 'bg-red-50', 'p-3', 'font-bold');
            validityContainer.classList.add('text-gray-600');
        }
    }
    
    if (isParticipationBlocked && !isFixed) { 
        if (isNotStarted) {
            if (warningText) warningText.textContent = `Diese Umfrage hat noch nicht begonnen. Sie startet am ${formatVoteDate(startTime)}.`;
        } else if (isClosedByTime) {
            if (warningText) warningText.textContent = `Diese Umfrage ist bereits beendet. Teilnahme und Korrekturen sind nicht mehr möglich.`;
        } else if (isManuallyClosed) { 
            if (warningText) warningText.textContent = `Diese Umfrage wurde vom Ersteller beendet. Teilnahme und Korrekturen sind nicht mehr möglich.`;
        }
        if (warningBox) warningBox.classList.remove('hidden');
    } else {
        if (warningBox) {
            warningBox.classList.add('hidden'); 
        } else {
            // console.warn("renderVoteView: Element 'vote-validity-warning-box' nicht gefunden.");
        }
    }

    // ----- 6. Teilnehmer-Status-Box (Logik von Anonym bleibt) -----
    const statusContainer = document.getElementById('vote-participant-status-container');
    const nameDisplay = document.getElementById('vote-participant-name');
    const userContainer = document.getElementById('vote-user-name-container');
    const userChangeBtn = document.getElementById('vote-user-change-to-anon-btn');
    const guestNameContainer = document.getElementById('vote-guest-name-container');
    const guestNameInput = document.getElementById('vote-guest-name-input');
    const guestChangeBtn = document.getElementById('vote-guest-change-to-anon-btn');
    
    if (statusContainer) statusContainer.classList.add('hidden');
    if (guestNameContainer) guestNameContainer.classList.add('hidden');
    if (userContainer) userContainer.classList.add('hidden');
    if (userChangeBtn) userChangeBtn.classList.add('hidden');
    if (guestChangeBtn) guestChangeBtn.classList.add('hidden');
    if (guestNameInput) {
        guestNameInput.disabled = false;
        guestNameInput.value = '';
        guestNameInput.placeholder = 'Vor- und Nachname...';
    }
    if (userChangeBtn) {
        userChangeBtn.textContent = 'Ändern';
        userChangeBtn.classList.remove('bg-blue-600', 'text-white');
        userChangeBtn.classList.add('bg-gray-200', 'text-gray-700');
    }
    isVoteGridEditable = false; 
    
    if (isParticipationBlocked) {
        // Nichts tun
    } 
    else {
        if (youParticipant) {
            if (statusContainer) statusContainer.classList.remove('hidden');
            if (userContainer) userContainer.classList.remove('hidden');
            if (nameDisplay) nameDisplay.textContent = youParticipant.name;
            isVoteGridEditable = false; 
        
        } else {
            isVoteGridEditable = true; 
            if (statusContainer) statusContainer.classList.remove('hidden');
            
            if (voteData.isAnonymous && voteData.anonymousMode === 'erzwingen') {
                if (userContainer) userContainer.classList.remove('hidden');
                if (nameDisplay) nameDisplay.textContent = 'Anonym';
            
            } else if (voteData.isAnonymous && voteData.anonymousMode === 'ermöglichen') {
                if (currentUser.mode !== GUEST_MODE) {
                    if (userContainer) userContainer.classList.remove('hidden');
                    const currentUserFull = USERS[currentUser.mode];
                    if (nameDisplay) nameDisplay.textContent = currentUserFull ? currentUserFull.realName : currentUser.displayName;
                    if (userChangeBtn) userChangeBtn.classList.remove('hidden'); 
                } else {
                    if (guestNameContainer) guestNameContainer.classList.remove('hidden');
                    if (guestChangeBtn) guestChangeBtn.classList.remove('hidden'); 
                }
                
            } else {
                if (currentUser.mode !== GUEST_MODE) {
                    if (userContainer) userContainer.classList.remove('hidden');
                    const currentUserFull = USERS[currentUser.mode];
                    if (nameDisplay) nameDisplay.textContent = currentUserFull ? currentUserFull.realName : currentUser.displayName;
                } else {
                    if (guestNameContainer) guestNameContainer.classList.remove('hidden');
                }
            }
        }
    }
    
    // ----- 7. Antworten laden (Sicher) -----
    currentParticipantAnswers = {};
    if (youParticipant) {
        currentParticipantAnswers = { ...youParticipant.currentAnswers };
    }

    // ----- 8. Knöpfe (Speichern, Admin-Edit) (Sicher) -----
    const saveButton = document.getElementById('vote-save-participation-btn');
    const editButton = document.getElementById('show-edit-vote-btn'); 
    resetEditWrapper(); 
    if (saveButton) saveButton.classList.add('hidden'); 
    if (isParticipationBlocked) {
        if (saveButton) saveButton.classList.add('hidden');
    }
    if (editButton) {
        editButton.classList.remove('hidden'); 
    }
    
    // ----- 9. NEUE LOGIK: "Antworten verstecken" & Infobox -----
    let shouldShowHidden = false;
    let infoText = "";
    const hiddenInfoBox = document.getElementById('vote-hidden-answers-infobox');
    const hiddenInfoBoxText = document.getElementById('vote-hidden-answers-infobox-text');

    if (voteData.hideAnswers && !isPollClosed) {
        // Die Funktion ist aktiv UND die Umfrage ist noch nicht zu
        
        if (voteData.hideAnswersMode === 'bis_umfragenabschluss') {
            shouldShowHidden = true;
            infoText = "Die Antworten aller Teilnehmer sind bis zum Abschluss der Umfrage versteckt.";
        } 
        else if (voteData.hideAnswersMode === 'bis_stimmabgabe_mit_korrektur') {
            if (!youParticipant) { // Wenn du noch NICHT abgestimmt hast
                shouldShowHidden = true;
                infoText = "Die Antworten werden sichtbar, sobald du deine Stimme abgegeben hast. Du kannst deine Stimme danach korrigieren.";
            } else {
                // Du hast schon abgestimmt, also ist shouldShowHidden = false
                infoText = "Du hast abgestimmt. Die Antworten sind jetzt für dich sichtbar.";
            }
        }
        else if (voteData.hideAnswersMode === 'bis_stimmabgabe_ohne_korrektur') {
             if (!youParticipant) { // Wenn du noch NICHT abgestimmt hast
                shouldShowHidden = true;
                infoText = "Die Antworten werden sichtbar, sobald du deine Stimme abgegeben hast. Achtung: Korrekturen sind danach nicht mehr möglich.";
            } else {
                // Du hast schon abgestimmt, also ist shouldShowHidden = false
                infoText = "Du hast abgestimmt. Die Antworten sind jetzt für dich sichtbar. Korrekturen sind nicht möglich.";
            }
        }
    }
    
    // Zeige die gelbe Infobox, wenn ein Text dafür generiert wurde
    if (infoText && hiddenInfoBox && hiddenInfoBoxText) {
        hiddenInfoBoxText.textContent = infoText;
        hiddenInfoBox.classList.remove('hidden');
    } else if (hiddenInfoBox) {
        hiddenInfoBox.classList.add('hidden');
    }

    // ----- 10. Tabelle rendern -----
    // Wir übergeben die neue Variable 'shouldShowHidden' an die Funktion
    updatePollTableAnswers(voteData, isVoteGridEditable, isPollClosed, shouldShowHidden); 
    
    if (!isParticipationBlocked) {
        checkIfAllAnswered();
    }
}







/**
 * Baut die Abstimmungs-Tabelle neu auf und füllt sie mit allen Antworten
 * KORREKTUR: Akzeptiert jetzt 'isClosed', um Korrekturen zu sperren
 */
// ERSETZE diese Funktion in terminplaner.js
// NEUE SIGNATUR: Akzeptiert 'forceHidden' als viertes Argument
function updatePollTableAnswers(voteData, isEditable = false, isClosed = false, forceHidden = false) {
    const optionsContainer = document.getElementById('vote-options-container');
    if (!optionsContainer) {
        console.error("Fehler: 'vote-options-container' nicht gefunden!");
        return;
    }

    // 1. Fall: Termin ist fixiert
    if (voteData.fixedOptionIndex != null) {
        // ... (Dieser Teil ist korrekt und bleibt unverändert) ...
        const fixedOption = voteData.options[voteData.fixedOptionIndex];
        if (fixedOption) {
            const dateObj = new Date(fixedOption.date + 'T12:00:00');
            const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
            const timeString = fixedOption.timeEnd ? 
                `${fixedOption.timeStart} - ${fixedOption.timeEnd} Uhr` : 
                `${fixedOption.timeStart} Uhr`;

            const fixedIndex = voteData.fixedOptionIndex;
            const yesNames = [];
            const maybeNames = [];
            const noNames = [];

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

            const createListHTML = (title, names, colorClass) => {
                if (names.length === 0) return '';
                return `
                    <div class="mt-2">
                        <span class="text-xs font-semibold ${colorClass}">${title} (${names.length}):</span>
                        <p class="text-xs text-gray-600">${names.join(', ')}</p>
                    </div>
                `;
            };
            
            const participantsListHTML = `
                <div class="text-left mt-4 border-t border-green-400 pt-2">
                    ${createListHTML('Zusagen', yesNames, 'text-green-800')}
                    ${createListHTML('Vielleicht', maybeNames, 'text-yellow-800')}
                    ${createListHTML('Absagen', noNames, 'text-red-800')}
                </div>
            `;

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
    
    tableHTML += '<th class="p-3 border-b sticky left-0 bg-gray-50 z-10 whitespace-nowrap border-r border-gray-300">Termin</th>';
    
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
    

    if (currentUser.mode !== GUEST_MODE) { 
        if (youParticipant) {
            const correctionCount = youParticipant.correctionCount || 0;
            const correctionText = correctionCount > 0 ? `(<span class="correction-counter cursor-pointer" data-userid="${currentUser.mode}">${correctionCount} Korrekturen</span>)` : '';
            
            // --- NEUE LOGIK: Korrektur-Knopf steuern ---
            let editButtonHtml = '';
            // Prüfe, ob Umfrage offen ist
            if (!isClosed) { 
                // Prüfe, ob Korrekturen verboten sind
                const correctionsForbidden = (voteData.hideAnswers && voteData.hideAnswersMode === 'bis_stimmabgabe_ohne_korrektur');
                
                if (correctionsForbidden) {
                    editButtonHtml = '<br><span class="text-xs font-semibold text-gray-500">(Korrektur deaktiviert)</span>';
                } else {
                    editButtonHtml = `<br><button class="vote-correction-btn text-xs font-semibold text-blue-600 hover:underline">Auswahl bearbeiten</button>`;
                }
            }
            // --- ENDE NEUE LOGIK ---

            youHeaderHTML = `
                <span class="font-bold text-indigo-600">Du</span>
                <br>
                <span class="text-xs font-normal text-gray-500">${correctionText}</span>
                ${editButtonHtml}
            `;
        } else {
            youHeaderHTML = isClosed 
                ? '<span class="font-bold text-gray-500">Du (Geschlossen)</span>' 
                : '<span class="font-bold text-indigo-600">Du (Klicke unten)</span>';
        }
    }


    tableHTML += `<th class="p-3 border-b text-center w-48 sticky right-0 bg-gray-50 z-10 border-l border-gray-300">
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
                <td class="p-2 font-bold sticky left-0 bg-gray-100 z-10 whitespace-nowrap border-r border-gray-300" colspan="${voteData.participants.length + 2}">${niceDate}</td>
            </tr>
        `;

        optionsByDate[date].forEach(option => {
            const optionIndex = option.originalIndex;
            const timeString = option.timeEnd ? 
                `${option.timeStart} - ${option.timeEnd} Uhr` : 
                `${option.timeStart} Uhr`;
            
            const isStricken = option.isStricken === true;
            const rowClasses = isStricken ? 'bg-gray-100 opacity-60' : '';
            const cellClasses = isStricken ? 'line-through text-gray-500' : 'font-mono';
            
            tableHTML += `
                <tr class="vote-option-row ${rowClasses}" data-option-index="${optionIndex}">
                    <td class="p-3 border-b ${cellClasses} sticky left-0 ${isStricken ? 'bg-gray-100' : 'bg-white'} z-10 whitespace-nowrap border-r border-gray-300">
                        ${timeString} ${isStricken ? '(Gestrichen)' : ''}
                    </td>
            `;

            voteData.participants.forEach(p => {
                if (p.userId === currentUser.mode) return; 
                const answer = p.currentAnswers[optionIndex]; 
                let answerIcon = '';
                
                // --- NEUE LOGIK: Antworten verstecken ---
                if (forceHidden) {
                    answerIcon = '<span class="text-gray-400 italic text-xs">Versteckt</span>';
                }
                // --- ENDE NEUE LOGIK ---
                else if (isStricken) {
                    answerIcon = '<span class="text-gray-400 font-bold">-</span>';
                }
                else if (answer === 'yes') answerIcon = '<span class="text-green-500 font-bold text-xl">✔</span>';
                else if (answer === 'no') answerIcon = '<span class="text-red-500 font-bold text-xl">✘</span>';
                else if (answer === 'maybe') answerIcon = '<span class="text-yellow-500 font-bold text-xl">~</span>';
                
                tableHTML += `<td class="p-3 border-b text-center">${answerIcon}</td>`;
            });
            
            const currentAnswer = currentParticipantAnswers[optionIndex];
            
            if (isStricken) {
                if (isEditable) {
                     tableHTML += `
                        <td class="p-2 border-b sticky right-0 ${isStricken ? 'bg-gray-100' : 'bg-white'} z-10 border-l border-gray-300">
                            <div class="flex justify-center gap-1">
                                <button class="p-2 rounded-lg" disabled title="Gestrichen">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" /></svg>
                                </button>
                                <button class="p-2 rounded-lg ${voteData.disableMaybe ? 'hidden' : ''}" disabled title="Gestrichen">
                                     <span class="text-gray-400 font-bold text-xl w-5 h-5 flex items-center justify-center">~</span>
                                </button>
                                <button class="p-2 rounded-lg" disabled title="Gestrichen">
                                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                </button>
                            </div>
                        </td>
                    `;
                } else {
                     tableHTML += `
                        <td class="p-3 border-b text-center sticky right-0 ${isStricken ? 'bg-gray-100' : 'bg-white'} z-10 border-l border-gray-300">
                            <span class="text-gray-400 font-bold">-</span>
                        </td>
                    `;
                }
            }
            else if (isEditable) {
                // MODUS: BEARBEITBAR (Knöpfe)
                const yesSelected = currentAnswer === 'yes' ? 'bg-green-200 ring-2 ring-indigo-500' : 'hover:bg-green-100 bg-opacity-50';
                const maybeSelected = currentAnswer === 'maybe' ? 'bg-yellow-200 ring-2 ring-indigo-500' : 'hover:bg-yellow-100 bg-opacity-50';
                const noSelected = currentAnswer === 'no' ? 'bg-red-200 ring-2 ring-indigo-500' : 'hover:bg-red-100 bg-opacity-50';
                const maybeHidden = voteData.disableMaybe ? 'hidden' : '';

                tableHTML += `
                    <td class="p-2 border-b sticky right-0 bg-white z-10 border-l border-gray-300">
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
                    <td class="p-3 border-b text-center sticky right-0 bg-white z-10 border-l border-gray-300">
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
    if (!currentVoteData || !saveBtn) {
        if (saveBtn) saveBtn.classList.add('hidden');
        return;
    }
    
    if (!isVoteGridEditable) {
        saveBtn.classList.add('hidden');
        return;
    }
    
    const totalOptions = currentVoteData.options.length;
    
    let allAnswered = true;
    for (let i = 0; i < totalOptions; i++) {
        // NEU: Überspringe gestrichene Termine
        if (currentVoteData.options[i].isStricken === true) {
            continue;
        }
        // ENDE NEU

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
    
    // Logik für Namensfindung
    if (isParticipantChoosingAnonymous) {
        participantName = "Anonym";
        if (currentUser.mode !== GUEST_MODE) {
            participantId = currentUser.mode; 
        } else {
            participantId = `guest_anon_${Date.now()}`; 
        }
    } else if (currentVoteData.isAnonymous && currentVoteData.anonymousMode === 'erzwingen') {
        participantName = "Anonym";
        if (currentUser.mode !== GUEST_MODE) {
            participantId = currentUser.mode; 
        } else {
            participantId = `guest_anon_${Date.now()}`;
        }
    } else {
        if (currentUser.mode !== GUEST_MODE) {
            participantName = document.getElementById('vote-participant-name').textContent; 
            participantId = currentUser.mode;
        } else {
            participantName = document.getElementById('vote-guest-name-input').value.trim();
            participantId = `guest_${participantName.replace(/\s/g, '_')}`; 
            if (!participantName) {
                return alertUser("Bitte gib deinen Namen als Gast ein.", "error");
            }
        }
    }

    // Zähle aktive Optionen
    const activeOptions = currentVoteData.options.filter(opt => !opt.isStricken);
    let answeredCount = 0;
    for (let i = 0; i < currentVoteData.options.length; i++) {
        if (!currentVoteData.options[i].isStricken && currentParticipantAnswers[i]) {
            answeredCount++;
        }
    }
    if (answeredCount !== activeOptions.length) {
         return alertUser("Bitte wähle für JEDEN (nicht-gestrichenen) Termin eine Antwort aus.", "error");
    }
    
    setButtonLoading(saveBtn, true);
    try {
        let existingParticipantIndex = currentVoteData.participants.findIndex(p => p.userId === participantId);
        
        // --- NEUE PRÜFUNG: Korrektur verboten? ---
        if (existingParticipantIndex > -1 && currentVoteData.hideAnswers && currentVoteData.hideAnswersMode === 'bis_stimmabgabe_ohne_korrektur') {
            // Der Benutzer existiert bereits (d.h. er korrigiert) UND der Modus verbietet Korrekturen
            throw new Error("Speichern fehlgeschlagen: Diese Umfrage erlaubt keine Korrekturen nach der ersten Stimmabgabe.");
        }
        // --- ENDE NEUE PRÜFUNG ---

        const newParticipantsArray = [...currentVoteData.participants]; 
        let correctionCount = 0;
        let answerHistory = [];
        
        const nameToSave = (isParticipantChoosingAnonymous || (currentVoteData.isAnonymous && currentVoteData.anonymousMode === 'erzwingen')) 
            ? "Anonym" 
            : participantName;
        
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
                    timestamp: new Date(), 
                    changes: changes,
                    changedBy: nameToSave 
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
        
        currentVoteData.assignedUserIds?.forEach(assignedId => {
            if (!participantIds.includes(assignedId)) {
                participantIds.push(assignedId);
            }
        });
        
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        
        await updateDoc(voteDocRef, {
            participants: newParticipantsArray,
            participantIds: participantIds 
        });
        
        alertUser("Deine Abstimmung wurde gespeichert!", "success");
        currentVoteData.participants = newParticipantsArray;
        currentVoteData.participantIds = participantIds;
        
        isVoteGridEditable = false;
        renderVoteView(currentVoteData); // Hier wird die Logik "Antworten anzeigen" neu ausgelöst

    } catch (error) {
        console.error("Fehler beim Speichern der Abstimmung:", error);
        alertUser("Fehler beim Speichern: " + error.message, "error_long"); // Längere Anzeige für die Fehlermeldung
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
        const disableMaybe = document.getElementById('vote-setting-disable-maybe').checked; 
        
        // Anonym-Einstellungen
        const isAnonymous = document.getElementById('vote-setting-anonymous').checked;
        const anonymousMode = document.getElementById('vote-setting-anonymous-mode').value; 
        
        // "Antworten verstecken"
        const hideAnswers = document.getElementById('vote-setting-hide-answers').checked;
        const hideAnswersMode = document.getElementById('vote-setting-hide-answers-mode').value;
        
        // --- NEU: "Sichtbarkeit" lesen ---
        const accessPolicy = document.getElementById('vote-setting-access-mode').value; // 'registered' or 'guests'
        // --- ENDE NEU ---
        
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
            anonymousMode: isAnonymous ? anonymousMode : null, 
            
            hideAnswers: hideAnswers,
            hideAnswersMode: hideAnswers ? hideAnswersMode : null,
            
            // --- NEU: "Sichtbarkeit" speichern ---
            accessPolicy: accessPolicy,
            // --- ENDE NEU ---
            
            createdBy: currentUser.mode, 
            createdByName: creatorNameToSave, 
            createdAt: serverTimestamp(), 
            options: options, 
            participants: [],
            
            participantIds: [...tempAssignedUserIds],
            assignedUserIds: [...tempAssignedUserIds],
            
            fixedOptionIndex: null,
            pollHistory: [],
            isManuallyClosed: false 
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
function renderEditView(voteData) {
    document.getElementById('edit-poll-title').textContent = `"${voteData.title}" bearbeiten`;
    
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
    document.getElementById('vote-setting-disable-maybe-edit').checked = voteData.disableMaybe;
    
    // Anonym-Einstellungen
    const anonymousCheckboxEdit = document.getElementById('vote-setting-anonymous-edit');
    const anonymousWrapperEdit = document.getElementById('vote-setting-anonymous-mode-wrapper-edit');
    const anonymousModeEdit = document.getElementById('vote-setting-anonymous-mode-edit');

    anonymousCheckboxEdit.checked = voteData.isAnonymous;
    if (voteData.isAnonymous) {
        anonymousWrapperEdit.classList.remove('hidden');
        anonymousModeEdit.value = voteData.anonymousMode || 'erzwingen';
    } else {
        anonymousWrapperEdit.classList.add('hidden');
        anonymousModeEdit.value = 'erzwingen'; 
    }
    
    // "Antworten verstecken" laden
    const hideAnswersCheckboxEdit = document.getElementById('vote-setting-hide-answers-edit');
    const hideAnswersWrapperEdit = document.getElementById('vote-setting-hide-answers-mode-wrapper-edit');
    const hideAnswersModeEdit = document.getElementById('vote-setting-hide-answers-mode-edit');

    hideAnswersCheckboxEdit.checked = voteData.hideAnswers;
    if (voteData.hideAnswers) {
        hideAnswersWrapperEdit.classList.remove('hidden');
        hideAnswersModeEdit.value = voteData.hideAnswersMode || 'bis_umfragenabschluss';
    } else {
        hideAnswersWrapperEdit.classList.add('hidden');
        hideAnswersModeEdit.value = 'bis_umfragenabschluss'; 
    }
    
    // --- "Sichtbarkeit" laden ---
    const accessModeEdit = document.getElementById('vote-setting-access-mode-edit');
    const accessTextEdit = document.getElementById('vote-setting-access-text-edit');
    const currentAccessPolicy = voteData.accessPolicy || 'registered'; // Fallback für alte Umfragen
    
    accessModeEdit.value = currentAccessPolicy;
    if (currentAccessPolicy === 'guests') {
        accessTextEdit.innerHTML = 'Diese Umfrage können <span class="text-green-600 font-bold">ALLE sehen</span>. (auch nicht angemeldete Personen/Gäste)';
    } else {
        accessTextEdit.innerHTML = 'Diese Umfrage können <span class="text-red-600 font-bold">nur angemeldete Benutzer</span> sehen.';
    }


    // 4. Zugewiesene Benutzer laden
    const assignedDisplayEdit = document.getElementById('vote-assigned-users-display-edit');
    const assignedIds = voteData.assignedUserIds || [];
    if (assignedDisplayEdit) {
        if (assignedIds.length === 0) {
            assignedDisplayEdit.textContent = "Niemand ausgewählt";
            assignedDisplayEdit.title = "Niemand ausgewählt";
        } else {
            const selectedNames = assignedIds.map(id => {
                const user = USERS[id];
                return user ? (user.realName || user.name) : id; 
            }).join(', ');
            assignedDisplayEdit.textContent = selectedNames;
            assignedDisplayEdit.title = selectedNames; 
        }
    }
    
    // 5. "UPDATE"-Log-Button
    
    // 6. Gefahrenzone-Knöpfe
    const fixBtn = document.getElementById('vote-fix-date-btn');
    const manualCloseBtn = document.getElementById('vote-toggle-manual-close-btn');
    
    if (!fixBtn || !manualCloseBtn) {
        console.error("Fehler: Knöpfe der Gefahrenzone nicht gefunden!");
        return;
    }
    fixBtn.classList.remove('hidden');
    manualCloseBtn.classList.remove('hidden');
    fixBtn.disabled = false;
    manualCloseBtn.disabled = false;
    if (voteData.fixedOptionIndex != null) {
        fixBtn.textContent = 'Tag & Zeit AUFHEBEN';
        fixBtn.dataset.action = 'unfix';
        fixBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        fixBtn.classList.add('bg-green-600', 'hover:bg-green-700'); 
        manualCloseBtn.disabled = true;
        manualCloseBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        fixBtn.textContent = 'Tag & Zeit fixieren';
        fixBtn.dataset.action = 'fix';
        fixBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        fixBtn.classList.add('bg-blue-600', 'hover:bg-blue-700'); 
        manualCloseBtn.disabled = false;
        manualCloseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        if (voteData.isManuallyClosed === true) {
            manualCloseBtn.textContent = 'Umfrage freigeben';
            manualCloseBtn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600', 'text-black');
            manualCloseBtn.classList.add('bg-green-600', 'hover:bg-green-700', 'text-white'); 
        } else {
            manualCloseBtn.textContent = 'Umfrage beenden';
            manualCloseBtn.classList.add('bg-yellow-500', 'hover:bg-yellow-600', 'text-black');
            manualCloseBtn.classList.remove('bg-green-600', 'hover:bg-green-700', 'text-white'); 
        }
    }
    const selectionContainer = document.getElementById('fix-date-selection-container');
    if (selectionContainer) selectionContainer.classList.add('hidden');
    
    // 7. Baut die Liste der "Bestehenden Termine"
    renderExistingTermsList(voteData);

    // 8. Baut die Admin-Abstimmungs-Tabelle
    renderParticipantEditGrid(voteData);
    
    // 9. Leert den "Neue Termine" Container
    const datesContainerEdit = document.getElementById('vote-dates-container-edit');
    if (datesContainerEdit) {
        datesContainerEdit.innerHTML = ''; 
    }
    addNewDateGroupEdit(true); // Fügt die erste leere Gruppe hinzu
    
    // KORREKTUR 2: Button initial verstecken und Validierung aufrufen
    const addDateButtonEdit = document.getElementById('vote-add-date-btn-edit');
    if (addDateButtonEdit) addDateButtonEdit.classList.add('hidden');
    validateLastDateGroupEdit();
}



async function saveVoteEdits() {
    const saveBtn = document.getElementById('vote-save-changes-btn');
    setButtonLoading(saveBtn, true);

    try {
        const updateData = {};
        const changes = []; // Für das Logbuch
        
        // 1. Details lesen (unverändert)
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

        // 2. Gültigkeit lesen (unverändert)
        const newStartTime = document.getElementById('vote-start-time-edit').value;
        const newEndTime = document.getElementById('vote-end-time-edit').value;
        const isUnlimited = document.getElementById('vote-end-time-unlimited-edit').checked;
        updateData.startTime = newStartTime ? new Date(newStartTime) : null;
        updateData.endTime = !isUnlimited && newEndTime ? new Date(newEndTime) : null;
        
        // 3. Einstellungen lesen (unverändert)
        updateData.isPublic = document.getElementById('vote-setting-public-edit').checked;
        updateData.disableMaybe = document.getElementById('vote-setting-disable-maybe-edit').checked;
        
        updateData.isAnonymous = document.getElementById('vote-setting-anonymous-edit').checked;
        if (updateData.isAnonymous) {
            updateData.anonymousMode = document.getElementById('vote-setting-anonymous-mode-edit').value;
        } else {
            updateData.anonymousMode = null;
        }

        updateData.hideAnswers = document.getElementById('vote-setting-hide-answers-edit').checked;
        if (updateData.hideAnswers) {
            updateData.hideAnswersMode = document.getElementById('vote-setting-hide-answers-mode-edit').value;
        } else {
            updateData.hideAnswersMode = null;
        }
        
        updateData.accessPolicy = document.getElementById('vote-setting-access-mode-edit').value;

        // 4. Teilnehmer-Listen speichern (unverändert)
        const newAssignedIds = currentVoteData.assignedUserIds || [];
        updateData.assignedUserIds = newAssignedIds;
        const existingParticipantIds = currentVoteData.participants.map(p => p.userId);
        const combinedIds = new Set([...existingParticipantIds, ...newAssignedIds]);
        updateData.participantIds = Array.from(combinedIds);
        updateData.participants = currentVoteData.participants;
        updateData.options = currentVoteData.options; 

        // 5. Neue Termine auslesen und anhängen (unverändert)
        const newOptions = [];
        const dateGroups = document.querySelectorAll('#vote-dates-container-edit [data-date-group-id]');
        dateGroups.forEach(group => {
            const dateInput = group.querySelector('.vote-date-input');
            const dateValue = dateInput.value; 
            if (dateValue) { 
                const timeGroups = group.querySelectorAll('.time-input-group');
                timeGroups.forEach(timeGroup => {
                    const timeStart = timeGroup.querySelector('.vote-time-start-input').value; 
                    if (timeStart) { 
                        const timeEnd = timeGroup.querySelector('.vote-time-end-input').value; 
                        newOptions.push({ 
                            date: dateValue, 
                            timeStart: timeStart,
                            timeEnd: timeEnd || null,
                            isStricken: false 
                        });
                    }
                });
            }
        });
        if (newOptions.length > 0) {
            updateData.options = [...currentVoteData.options, ...newOptions];
            changes.push(`${newOptions.length} neue(r) Termin(e) hinzugefügt.`);
        }
        
        // 6. Log-Eintrag erstellen (unverändert)
        if (changes.length > 0) {
            const historyLog = {
                timestamp: new Date(), 
                changedBy: USERS[currentUser.mode]?.realName || currentUser.displayName,
                changes: changes
            };
            updateData.pollHistory = [...(currentVoteData.pollHistory || []), historyLog];
            updateData.acknowledgedBy = []; 
        }
        
        // 7. Datenbank aktualisieren (unverändert)
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        await updateDoc(voteDocRef, updateData);
        
        // Lokale Daten (currentVoteData) werden NICHT manuell angefasst.
        // Der 'onSnapshot'-Listener, den wir gleich neu starten, macht das.
        
        alertUser("Änderungen gespeichert!", "success");
        
        // =================================================================
        // BEGINN DER KORREKTUR (Behebt den "Stale Data"-Bug)
        // =================================================================
        
        // Wir rufen NICHT mehr `showView('vote')` auf.
        // Stattdessen rufen wir `joinVoteById` auf. Diese Funktion
        // macht drei Dinge:
        // 1. Sie wechselt die Ansicht zu 'vote'.
        // 2. Sie holt die absolut frischen Daten (die wir gerade gespeichert haben).
        // 3. Sie startet den Live-Spion (`listenToCurrentVote`) neu,
        //    den wir beim Betreten der Edit-Seite gestoppt haben.
        
        joinVoteById(currentVoteData.id);
        
        // =================================================================
        // ENDE DER KORREKTUR
        // =================================================================

        // Die alten, entfernten Kommentare und der `setTimeout`
        // (die in deiner Datei standen) sind jetzt korrekt entfernt.

    } catch (error) {
        console.error("Fehler beim Speichern der Änderungen:", error);
        alertUser("Speichern fehlgeschlagen.", "error");
    } finally {
        setButtonLoading(saveBtn, false);
    }
}




/**
 * Schaltet den "isManuallyClosed"-Status um (Knopf: "Umfrage beenden" / "Umfrage freigeben")
 */
async function toggleManualPollClose() {
    const isCurrentlyClosed = currentVoteData.isManuallyClosed === true;
    const newStatus = !isCurrentlyClosed;
    
    const message = newStatus ?
        "Möchtest du die Umfrage wirklich beenden? Die Teilnahme ist dann nicht mehr möglich (genau wie bei 'Endet am'), aber du kannst später noch einen Termin fixieren." :
        "Möchtest du die Umfrage wieder freigeben? Teilnehmer können dann wieder abstimmen und korrigieren.";
        
    if (!confirm(message)) {
        return;
    }

    const manualCloseBtn = document.getElementById('vote-toggle-manual-close-btn');
    if (manualCloseBtn) setButtonLoading(manualCloseBtn, true);
    
    try {
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        
        await updateDoc(voteDocRef, {
            isManuallyClosed: newStatus
        });
        
        currentVoteData.isManuallyClosed = newStatus;
        
        alertUser(`Umfrage wurde ${newStatus ? 'beendet' : 'wieder freigegeben'}!`, "success");
        renderEditView(currentVoteData); // UI der Edit-Seite aktualisieren
        
    } catch (error)
 {
        console.error("Fehler beim Umschalten des Status:", error);
        alertUser("Fehler beim Umschalten.", "error");
    } finally {
        if (manualCloseBtn) setButtonLoading(manualCloseBtn, false);
    }
}

// --- ENDE NEUE FUNKTIONEN ---

/**
 * NEU: Hebt die Fixierung eines Termins auf (setzt fixedOptionIndex auf null)
 */
async function unfixPollDate() {
    if (!currentVoteData) return;

    // 1. Sicherheitsabfrage
    if (!confirm("Bist du sicher? Die Termin-Fixierung wird aufgehoben. Du kannst danach einen neuen Termin fixieren oder die Umfrage manuell wieder freigeben.")) {
        return;
    }

    // 2. Knopf finden und sperren
    const fixBtn = document.getElementById('vote-fix-date-btn');
    if (fixBtn) {
        fixBtn.disabled = true;
        fixBtn.textContent = 'Wird aufgehoben...';
    }

    try {
        // 3. Den Pfad zu unserer Umfrage in der Datenbank holen
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        
        // 4. Firebase anweisen, die Fixierung aufzuheben
        await updateDoc(voteDocRef, {
            fixedOptionIndex: null // Wir setzen das Feld einfach auf 'null' zurück
        });
        
        // 5. Unsere lokalen Daten (die wir im Browser haben) auch aktualisieren
        currentVoteData.fixedOptionIndex = null;
        
        // 6. Erfolg melden
        alertUser("Termin-Fixierung wurde aufgehoben!", "success");
        
        // 7. Die Bearbeiten-Ansicht neu laden.
        // Diese Funktion wird sehen, dass 'fixedOptionIndex' jetzt 'null' ist
        // und die Knöpfe automatisch korrekt anzeigen.
        renderEditView(currentVoteData);

    } catch (error) {
        console.error("Fehler beim Aufheben der Fixierung:", error);
        alertUser("Fehler beim Aufheben.", "error");
        
        // 8. Bei Fehler den Knopf wieder zurücksetzen
        if (fixBtn) {
            fixBtn.disabled = false;
            fixBtn.textContent = 'Tag & Zeit AUFHEBEN';
        }
    }
}

/**
 * NEU: Schaltet die Zugriffs-Richtlinie (nur registrierte / alle) um
 * Wird von den "ändern..."-Knöpfen aufgerufen
 */
function toggleAccessPolicy(modeInputId, textDisplayId) {
    const modeInput = document.getElementById(modeInputId);
    const textDisplay = document.getElementById(textDisplayId);
    if (!modeInput || !textDisplay) return;

    const currentMode = modeInput.value; // 'registered' or 'guests'
    const newMode = (currentMode === 'registered') ? 'guests' : 'registered';
    
    let message = "";
    if (newMode === 'guests') {
        message = "Bestätigen (JA): Diese Umfrage wird dann für ALLE (auch nicht angemeldete Gäste) sichtbar und zugänglich sein.";
    } else {
        message = "Bestätigen (JA): Diese Umfrage wird dann NUR für angemeldete Benutzer sichtbar sein. Gäste (per Link) werden blockiert.";
    }

    if (confirm(message)) {
        if (newMode === 'guests') {
            modeInput.value = 'guests';
            textDisplay.innerHTML = 'Diese Umfrage können <span class="text-green-600 font-bold">ALLE sehen</span>. (auch nicht angemeldete Personen/Gäste)';
        } else {
            modeInput.value = 'registered';
            textDisplay.innerHTML = 'Diese Umfrage können <span class="text-red-600 font-bold">nur angemeldete Benutzer</span> sehen.';
        }
    }
}

// ERSETZE diese Funktion in terminplaner.js
async function deletePoll() {
    // 1. Sicherheitsabfrage
    const confirmation = prompt(`Um die Umfrage "${currentVoteData.title}" endgültig zu löschen, gib bitte LÖSCHEN ein:`);
    if (confirmation !== 'LÖSCHEN') {
        alertUser("Löschvorgang abgebrochen.", "info");
        return;
    }
    
    // 2. Knopf sperren
    const deleteBtn = document.getElementById('vote-delete-poll-btn');
    if (deleteBtn) setButtonLoading(deleteBtn, true);

    try {
        // 3. Datenbank-Befehl zum Löschen
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        await deleteDoc(voteDocRef);
        
        // 4. Erfolg melden und zur Hauptseite zurückkehren
        alertUser("Umfrage wurde endgültig gelöscht.", "success");
        showView('main');
        currentVoteData = null;

    } catch (error) {
        console.error("Fehler beim Löschen der Umfrage:", error);
        alertUser("Fehler beim Löschen.", "error");
    } finally {
        // 5. Knopf wieder freigeben (falls der User auf der Seite bleibt)
        if (deleteBtn) setButtonLoading(deleteBtn, false);
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
// (Diese Funktion wird in haupteingang.js aufgerufen, nicht hier)
/*
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
*/


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

// ERSETZE diese Funktion in terminplaner.js
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
    document.getElementById('vote-setting-disable-maybe').checked = false; 
    document.getElementById('vote-dates-container').innerHTML = '';
    
    // Anonym-Einstellungen zurücksetzen
    document.getElementById('vote-setting-anonymous').checked = false;
    const anonWrapper = document.getElementById('vote-setting-anonymous-mode-wrapper');
    if (anonWrapper) {
        anonWrapper.classList.add('hidden');
    }
    const anonMode = document.getElementById('vote-setting-anonymous-mode');
    if (anonMode) {
        anonMode.value = 'erzwingen'; 
    }
    
    // "Antworten verstecken" zurücksetzen
    document.getElementById('vote-setting-hide-answers').checked = false;
    const hideWrapper = document.getElementById('vote-setting-hide-answers-mode-wrapper');
    if (hideWrapper) {
        hideWrapper.classList.add('hidden');
    }
    const hideMode = document.getElementById('vote-setting-hide-answers-mode');
    if (hideMode) {
        hideMode.value = 'bis_umfragenabschluss'; 
    }
    
    // --- "Sichtbarkeit" zurücksetzen ---
    const accessMode = document.getElementById('vote-setting-access-mode');
    if (accessMode) {
        accessMode.value = 'registered';
    }
    const accessText = document.getElementById('vote-setting-access-text');
    if (accessText) {
        accessText.innerHTML = 'Diese Umfrage können <span class="text-red-600 font-bold">nur angemeldete Benutzer</span> sehen.';
    }
    
    // Zuweisungen zurücksetzen
    tempAssignedUserIds = [];
    const assignedDisplay = document.getElementById('vote-assigned-users-display');
    if (assignedDisplay) {
        assignedDisplay.textContent = "Niemand ausgewählt";
        assignedDisplay.title = "Niemand ausgewählt";
    }
    
    dateGroupIdCounter = 0;
    addNewDateGroup(); 
    
    // KORREKTUR 2: Button initial verstecken
    const addDateButton = document.getElementById('vote-add-date-btn');
    if(addDateButton) addDateButton.classList.add('hidden');
    
    validateLastDateGroup(); 
}



// ERSETZE diese Funktion in terminplaner.js
function validateLastDateGroup() {
    const addDateButton = document.getElementById('vote-add-date-btn');
    if (!addDateButton) {
        // Knopf nicht gefunden, Abbruch
        return; 
    }

    // KORREKTUR 2: Die fehlerhafte 'if'-Abfrage wurde hier entfernt.

    const lastGroup = document.querySelector('#vote-dates-container [data-date-group-id]:last-child');
    if (!lastGroup) {
        // Keine Datums-Gruppe gefunden (sollte nicht passieren, da resetCreateWizard eine hinzufügt)
         addDateButton.classList.add('hidden');
        return; 
    }

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
    
    // HINWEIS: Dieser Teil wird jetzt nur noch für die "Erstellen"-Seite ausgeführt
    if (allValid) {
        addDateButton.classList.remove('hidden');
    } else {
        addDateButton.classList.add('hidden');
    }
}


// HINZUFÜGEN (NEUE FUNKTION) in terminplaner.js (z.B. nach validateLastDateGroup)
/**
 * NEU: Validiert die letzte Datums-Gruppe im "Bearbeiten"-Modus.
 */
function validateLastDateGroupEdit() {
    const addDateButton = document.getElementById('vote-add-date-btn-edit');
    if (!addDateButton) {
        return; 
    }

    const lastGroup = document.querySelector('#vote-dates-container-edit [data-date-group-id]:last-child');
    if (!lastGroup) {
        // Wenn keine Gruppe da ist (z.B. frisch geladen), Knopf anzeigen
         addDateButton.classList.remove('hidden');
        return; 
    }

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


// ERSETZE diese Funktion in terminplaner.js
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

    // --- KORREKTUR: HTML für den "Tag löschen" Knopf hinzugefügt ---
    newGroup.innerHTML = `
        <div class="flex justify-between items-center">
            <label class="block text-sm font-bold text-gray-700">Tag ${dateGroupIdCounter}</label>
            <button class="vote-remove-day-btn p-1 text-red-500 hover:bg-red-100 rounded-full hidden" title="Diesen Tag entfernen">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
                </svg>
            </button>
        </div>
        <input type="date" class="vote-date-input w-full p-2 border rounded-lg" value="${newDateString}">
        <div class="vote-times-container space-y-2"></div>
        <button class="vote-add-time-btn text-sm font-semibold text-indigo-600 hover:underline">+ Uhrzeit hinzufügen</button>
    `;
    // --- ENDE KORREKTUR ---

    const newTimesContainer = newGroup.querySelector('.vote-times-container');
    if (timesToCopy.length > 0 && timesToCopy.some(t => t.timeStart)) {
        timesToCopy.forEach(time => {
            newTimesContainer.appendChild(createTimeInputHTML(time.timeStart, time.timeEnd));
        });
    } else {
        newTimesContainer.appendChild(createTimeInputHTML());
    }
    datesContainer.appendChild(newGroup);
    validateLastDateGroup();

    // --- KORREKTUR: Ruft die Helfer-Funktion auf ---
    updateDeleteDayButtons('vote-dates-container');
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

// HINZUFÜGEN (NEUE FUNKTION) in terminplaner.js
/**
 * NEU: Überprüft die Anzahl der Datums-Blöcke und blendet die "Tag löschen"-Knöpfe
 * ein oder aus, um sicherzustellen, dass der letzte Block nicht gelöscht werden kann.
 */
function updateDeleteDayButtons(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Zähle alle Blöcke, die ein "data-date-group-id" haben
    const dayBlocks = container.querySelectorAll('[data-date-group-id]');
    const count = dayBlocks.length;

    // 2. Gehe jeden Block einzeln durch
    dayBlocks.forEach(block => {
        const deleteBtn = block.querySelector('.vote-remove-day-btn');
        if (deleteBtn) {
            // 3. Wenn die Gesamtanzahl größer als 1 ist...
            if (count > 1) {
                // ...zeige den Löschen-Knopf an
                deleteBtn.classList.remove('hidden');
            } else {
                // ...sonst (wenn es der letzte ist) verstecke ihn
                deleteBtn.classList.add('hidden');
            }
        }
    });
}

// ERSETZE 'copyToClipboard' UND 'cleanUrlParams' in terminplaner.js durch DIESE EINE FUNKTION
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
        alertUser("Bearbeitungsmodus AKTIV!", "success");
        
        // UI zurücksetzen (wird von showView erledigt, die resetEditWrapper aufruft)
        showView('edit');
        renderEditView(currentVoteData);
    } else {
        alertUser("Falscher Bearbeitungs-Token!", "error");
        // Bei Fehler: UI zurücksetzen, damit man es nochmal versuchen kann
        resetEditWrapper();
    }
}

// ----- NEUE FUNKTIONEN FÜR DAS DASHBOARD (AB HIER HINZUFÜGEN) -----

/**
 * Der neue "Gehirn"-Prozess: Nimmt ALLE Umfragen und sortiert sie
 * in die 4 Listen und die "Ausfällig"-Box.
 */
function sortAndRenderAllVotes(allPolls) {
    if (currentUser.mode === GUEST_MODE) {
        allPolls = []; // Gäste sehen keine persönlichen Umfragen
    }
    
    const now = new Date();
    // Wichtig: 'today' ist Mitternacht HEUTE. Ein Event von gestern 23:00 ist < today.
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const outstandingPolls = [];
    const assignedPolls = [];
    const createdPolls = [];
    const pastPolls = [];

    const userId = currentUser.mode;

    for (const poll of allPolls) {
        // --- 1. Status-Flaggen setzen ---
        const isCreator = poll.createdBy === userId;
        const isAssigned = poll.participantIds && poll.participantIds.includes(userId);
        const hasVoted = poll.participants && poll.participants.find(p => p.userId === userId);
        const isFixed = poll.fixedOptionIndex != null;
        
        let isExpired = false;
        if (poll.endTime) {
            const endTime = (typeof poll.endTime.toDate === 'function') ? poll.endTime.toDate() : new Date(poll.endTime);
            if (endTime < now) {
                isExpired = true;
            }
        }
        const isClosed = isFixed || isExpired;

        // --- 2. Logik für "Vergangene Umfragen" (Punkt 3) ---
        if (isFixed) {
            try {
                const fixedOption = poll.options[poll.fixedOptionIndex];
                // Kombiniere Datum (YYYY-MM-DD) und Startzeit (HH:MM)
                const eventDateTime = new Date(`${fixedOption.date}T${fixedOption.timeStart}`);
                
                // "Vergangen" ist, wenn das Event-Datum VOR dem Start von HEUTE liegt (d.h. gestern oder früher)
                if (eventDateTime < today) {
                    pastPolls.push(poll);
                    continue; // Diese Umfrage ist "vergangen", sie erscheint nirgendwo anders.
                }
            } catch (e) {
                console.error(`Fehler bei der Datumsprüfung für 'Vergangen': ${poll.id}`, e);
            }
        }

        // --- 3. Logik für "Ausständig" (Punkt 1) ---
        // Ausständig = (Mir zugewiesen ODER von mir erstellt) UND (Ich habe nicht gevotet) UND (Umfrage ist offen)
        if ((isAssigned || isCreator) && !hasVoted && !isClosed) {
            outstandingPolls.push(poll);
        }

        // --- 4. Logik für die 2x2 Listen ---
        if (isCreator) {
            createdPolls.push(poll);
        }
        
        // "Mir zugewiesen" soll NICHT die anzeigen, die ich selbst erstellt habe
        if (isAssigned && !isCreator) { 
            assignedPolls.push(poll);
        }
    }

    // --- 5. Alles rendern ---
    renderOutstandingSummary(outstandingPolls);
    renderVoteList(assignedPolls, 'assigned-votes-list', 'Mir zugewiesen');
    renderVoteList(createdPolls, 'created-votes-list', 'Von mir erstellt');
    renderVoteList(pastPolls, 'past-votes-list', 'Vergangene Umfragen');
    // Öffentliche Umfragen werden von ihrem eigenen Listener (listenForPublicVotes) gerendert
}

/**
 * Erzeugt die HTML-Karte für EINE Umfrage (Punkt 2)
 */
function createVoteCardHTML(vote, listTitle) {
    const userId = currentUser.mode;
    const isCreator = vote.createdBy === userId;
    const hasVoted = vote.participants && vote.participants.find(p => p.userId === userId);
    const isFixed = vote.fixedOptionIndex != null;
    
    let endTime = null;
    if (vote.endTime) {
        endTime = (typeof vote.endTime.toDate === 'function') ? vote.endTime.toDate() : new Date(vote.endTime);
    }
    const isExpired = endTime && endTime < new Date();
    const isClosed = isFixed || isExpired;
    
    let statusBox1 = ''; // Vote-Status
    let statusBox2 = ''; // Countdown
    
    // --- Logik für Box 1 (Vote Status) ---
    if (listTitle === 'Mir zugewiesen') {
        if (hasVoted) {
            statusBox1 = `<span class="text-xs font-bold px-2 py-0.5 bg-green-200 text-green-800 rounded-full">✓ VOTE ABGEGEBEN</span>`;
        } else if (!isClosed) {
            // Zeige "Ausständig" nur, wenn die Umfrage noch offen ist
            statusBox1 = `<span class="text-xs font-bold px-2 py-0.5 bg-red-200 text-red-800 rounded-full animate-pulse">VOTE AUSSTÄNDIG</span>`;
        }
    } else if (listTitle === 'Von mir erstellt') {
        if (hasVoted) {
            statusBox1 = `<span class="text-xs font-bold px-2 py-0.5 bg-green-200 text-green-800 rounded-full">✓ VOTE ABGEGEBEN</span>`;
        } else if (!isClosed) {
            statusBox1 = `<span class="text-xs font-bold px-2 py-0.5 bg-gray-300 text-gray-800 rounded-full">O VOTE NICHT ABGEGEBEN</span>`;
        }
    }

    // --- Logik für Box 2 (Countdown) ---
    if (isFixed) {
        statusBox2 = `<span class="text-xs font-semibold px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full">Termin fixiert</span>`;
    } else if (isExpired) {
        statusBox2 = `<span class="text-xs font-semibold px-2 py-0.5 bg-gray-300 text-gray-700 rounded-full">Abgelaufen</span>`;
    } else if (endTime) {
        // Nur wenn nicht fixiert/abgelaufen UND ein Enddatum hat
        const countdownText = formatTimeRemaining(endTime);
        statusBox2 = `<span class="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">${countdownText}</span>`;
    } else {
        // Läuft unbegrenzt und ist offen
        statusBox2 = `<span class="text-xs font-semibold px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">Zeitl. unbegrenzt</span>`;
    }

    // Creator-Name
    const niceDate = vote.createdAt?.toDate().toLocaleDateString('de-DE') || '...';
    const creatorName = (listTitle === 'Von mir erstellt') ? 'Dir' : (vote.createdByName || 'Unbekannt');
    
    // Kombiniere die Status-Boxen
    const statusTags = `
        <div class="flex flex-wrap gap-2 mt-2">
            ${statusBox1}
            ${statusBox2}
        </div>
    `;

    return `
        <div class="vote-list-item card bg-white p-3 rounded-lg shadow-sm border flex justify-between items-center cursor-pointer hover:bg-indigo-50"
             data-vote-id="${vote.id}">
            <div class="flex-grow">
                <span class="font-bold text-indigo-700">${vote.title}</span>
                <p class="text-xs text-gray-500">Erstellt von ${creatorName} am ${niceDate}</p>
                ${statusTags}
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-indigo-600 flex-shrink-0 ml-2"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" /></svg>
        </div>
    `;
}

/**
 * Eine generische Funktion, die eine Liste von Umfragen
 * in ein bestimmtes HTML-Element rendert.
 * (NEUE VERSION: Sortiert "bald ablaufend" nach oben)
 */
function renderVoteList(votes, elementId, listTitle) {
    const listContainer = document.getElementById(elementId);
    if (!listContainer) {
        console.error(`[Terminplaner] Container ${elementId} nicht gefunden.`);
        return;
    }

    // NEU: Sortierlogik (Punkt 2)
    const now = new Date();
    const getSafeDate = (timestamp) => {
        if (!timestamp) return null;
        if (typeof timestamp.toDate === 'function') return timestamp.toDate();
        return new Date(timestamp);
    };

    const endingSoon = [];
    const others = [];

    // Teile die Umfragen in zwei Gruppen
    for (const vote of votes) {
        const endTime = getSafeDate(vote.endTime);
        const isFixed = vote.fixedOptionIndex != null;
        const isExpired = endTime && endTime < now;

        // "Bald ablaufend" = nicht fixiert, nicht abgelaufen, hat ein End-Datum
        if (!isFixed && !isExpired && endTime) {
            endingSoon.push(vote);
        } else {
            others.push(vote);
        }
    }

    // Sortiere "bald ablaufend" nach End-Datum (früheste zuerst)
    endingSoon.sort((a, b) => (getSafeDate(a.endTime) || 0) - (getSafeDate(b.endTime) || 0));
    
    // Sortiere "andere" nach Erstellungs-Datum (neueste zuerst)
    others.sort((a, b) => (getSafeDate(b.createdAt) || 0) - (getSafeDate(a.createdAt) || 0));

    // Füge die Listen zusammen
    const sortedVotes = [...endingSoon, ...others];
    // ENDE NEU

    if (sortedVotes.length === 0) {
        let text = 'Keine Umfragen in dieser Kategorie.';
        if (listTitle === 'Mir zugewiesen') text = 'Niemand hat dich zu einer Umfrage eingeladen.';
        if (listTitle === 'Von mir erstellt') text = 'Du hast noch keine Umfragen erstellt.';
        if (listTitle === 'Vergangene Umfragen') text = 'Keine abgeschlossenen Umfragen mit fixiertem Termin.';
        listContainer.innerHTML = `<p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">${text}</p>`;
        return;
    }

    // Rendere die jetzt sortierten Umfragen
    listContainer.innerHTML = sortedVotes.map(vote => createVoteCardHTML(vote, listTitle)).join('');
}

/**
 * Rendert die Zusammenfassung der ausständigen Rückmeldungen (Punkt 1)
 * (NEUE VERSION: Erzeugt klickbare "Chips", die in einer Zeile umbrechen)
 */
function renderOutstandingSummary(outstandingPolls) {
    const summaryContainer = document.getElementById('outstanding-votes-summary');
    if (!summaryContainer) return;

    if (outstandingPolls.length === 0) {
        summaryContainer.classList.add('hidden');
        return;
    }

    const count = outstandingPolls.length;
    const plural = count === 1 ? 'Rückmeldung' : 'Rückmeldungen';
    // Dies ist der Titel in der roten Box
    const titleHTML = `<p class="font-bold text-lg mb-2">Du hast ${count} ausständige ${plural}!</p>`;

    // NEU: Erstelle klickbare "Chips" für jede ausständige Umfrage
    const itemsHTML = outstandingPolls.map(poll => {
        // HINWEIS: Die Klassen wurden geändert, um sie kleiner zu machen (px-3, py-1.5, text-sm)
        // und die interne Ausrichtung (gap-2) anzupassen. 'mt-3' wurde entfernt.
        return `
            <div class="vote-list-item px-3 py-1.5 bg-white text-gray-800 rounded-lg border border-red-200 shadow-sm cursor-pointer hover:bg-red-50 flex items-center gap-2"
                 data-vote-id="${poll.id}">
                
                <span class="font-semibold text-sm">${poll.title}</span>
                
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-red-600 flex-shrink-0">
                    <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" />
                </svg>
            </div>
        `;
    }).join('');

    // NEU: Ein Container für die Chips, der den Umbruch (wrap) steuert
    // 'flex' = nebeneinander, 'flex-wrap' = Zeilenumbruch, 'gap-2' = Abstand, 'mt-3' = Abstand zum Titel
    const itemsContainerHTML = `
        <div class="flex flex-wrap gap-2 mt-3">
            ${itemsHTML}
        </div>
    `;

    // Setze den Titel und den Container mit den Chips zusammen
    summaryContainer.innerHTML = titleHTML + itemsContainerHTML;
    summaryContainer.classList.remove('hidden');
}

/**
 * Helfer-Funktion für den Countdown (Punkt 2)
 */
function formatTimeRemaining(endTime) {
    const now = new Date();
    const diffMs = endTime.getTime() - now.getTime();

    if (diffMs <= 0) return "Gerade beendet";

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
        return `Endet in ${diffDays} Tag(en) ${diffHours} Std.`;
    }
    if (diffHours > 0) {
        return `Endet in ${diffHours} Std. ${diffMinutes} Min.`;
    }
    if (diffMinutes > 0) {
        return `Endet in ${diffMinutes} Min.`;
    }
    return "Endet in Kürze";
}

// ----- NEUE FUNKTIONEN FÜR BEARBEITEN-MODUS -----

/**
 * Fügt eine neue (leere) Datums/Zeit-Gruppe im "Bearbeiten"-Modus hinzu.
 * Fast identisch mit 'addNewDateGroup', aber zielt auf '-edit'-Container.
 */
// ERSETZE diese Funktion in terminplaner.js
/**
 * Fügt eine neue (leere) Datums/Zeit-Gruppe im "Bearbeiten"-Modus hinzu.
 * KORRIGIERT: Kopiert jetzt den letzten Eintrag, wie im "Erstellen"-Modus.
 */
// ERSETZE diese Funktion in terminplaner.js
function addNewDateGroupEdit(isFirst = false) {
    dateGroupIdCounter++; // Wir nutzen den globalen Zähler weiter
    const datesContainer = document.getElementById('vote-dates-container-edit');
    if (!datesContainer) return;

    // Wenn es nicht der erste Slot ist und der letzte Slot leer ist, füge keinen neuen hinzu
    const lastDateInputValidation = datesContainer.querySelector('.vote-date-input:last-of-type');
    if (!isFirst && lastDateInputValidation && !lastDateInputValidation.value) {
        alertUser("Bitte fülle erst den letzten Termin aus, bevor du einen neuen hinzufügst.", "info");
        return;
    }
    
    const newGroup = document.createElement('div');
    newGroup.className = 'p-3 border rounded-lg bg-gray-50 space-y-3';
    newGroup.dataset.dateGroupId = dateGroupIdCounter; // Eindeutige ID
    
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
    
    // --- KORREKTUR: HTML für den "Tag löschen" Knopf hinzugefügt ---
    newGroup.innerHTML = `
        <div class="flex justify-between items-center">
            <label class="block text-sm font-bold text-gray-700">Neuer Termin (Tag ${dateGroupIdCounter})</label>
            <button class="vote-remove-day-btn p-1 text-red-500 hover:bg-red-100 rounded-full hidden" title="Diesen Tag entfernen">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                    <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
                </svg>
            </button>
        </div>
        <input type="date" class="vote-date-input w-full p-2 border rounded-lg" value="${newDateString}">
        <div class="vote-times-container space-y-2"></div>
        <button class="vote-add-time-btn text-sm font-semibold text-indigo-600 hover:underline">+ Uhrzeit hinzufügen</button>
    `;
    // --- ENDE KORREKTUR ---
    
    const newTimesContainer = newGroup.querySelector('.vote-times-container');
    
    if (timesToCopy.length > 0 && timesToCopy.some(t => t.timeStart)) {
        timesToCopy.forEach(time => {
            newTimesContainer.appendChild(createTimeInputHTML(time.timeStart, time.timeEnd));
        });
    } else {
        newTimesContainer.appendChild(createTimeInputHTML());
    }
    
    datesContainer.appendChild(newGroup);
    validateLastDateGroupEdit();

    // --- KORREKTUR: Ruft die Helfer-Funktion auf ---
    updateDeleteDayButtons('vote-dates-container-edit');
}

/**
 * Baut die Admin-Tabelle, um Teilnehmer-Votes zu bearbeiten (Punkt 2)
 */
function renderParticipantEditGrid(voteData) {
    const container = document.getElementById('edit-participant-grid-container');
    if (!container) return;

    const participants = voteData.participants;
    if (!participants || participants.length === 0) {
        container.innerHTML = `<p class="text-sm text-center text-gray-500 p-4 bg-gray-50 rounded-lg">Noch keine Teilnehmer haben abgestimmt.</p>`;
        return;
    }

    // Baue die Kopfzeile (Alle Teilnehmer)
    let tableHTML = '<table class="w-full border-collapse text-sm text-left bg-white">';
    tableHTML += '<thead><tr class="bg-gray-50">';
    tableHTML += '<th class="p-3 border-b sticky left-0 bg-gray-50 z-10 w-48">Termin</th>';
    
    participants.forEach(p => {
        tableHTML += `<th class="p-3 border-b text-center w-36">${p.name}</th>`;
    });
    tableHTML += '</tr></thead>';

    // Baue die Zeilen (Alle Termine)
    tableHTML += '<tbody>';
    
    // Sortiere Optionen nach Datum (genau wie in der Hauptansicht)
    const optionsByDate = {};
    voteData.options.forEach((option, index) => {
        if (!optionsByDate[option.date]) {
            optionsByDate[option.date] = []; 
        }
        optionsByDate[option.date].push({ ...option, originalIndex: index });
    });

    for (const date in optionsByDate) {
        const dateObj = new Date(date + 'T12:00:00'); 
        const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

        tableHTML += `
            <tr class="bg-gray-100">
                <td class="p-2 font-bold sticky left-0 bg-gray-100 z-10" colspan="${participants.length + 1}">${niceDate}</td>
            </tr>
        `;

        optionsByDate[date].forEach(option => {
            const optionIndex = option.originalIndex;
            const timeString = option.timeEnd ? 
                `${option.timeStart} - ${option.timeEnd} Uhr` : 
                `${option.timeStart} Uhr`;
            
            tableHTML += `<tr class="vote-option-row" data-option-index="${optionIndex}">
                            <td class="p-3 border-b font-mono sticky left-0 bg-white z-10">${timeString}</td>`;

            // Für JEDEN Teilnehmer, erstelle die 3 Knöpfe
            participants.forEach(p => {
                const participantId = p.userId;
                const currentAnswer = p.currentAnswers[optionIndex];
                
                const yesSelected = currentAnswer === 'yes' ? 'bg-green-200 ring-2 ring-indigo-500' : 'hover:bg-green-100 bg-opacity-50';
                const maybeSelected = currentAnswer === 'maybe' ? 'bg-yellow-200 ring-2 ring-indigo-500' : 'hover:bg-yellow-100 bg-opacity-50';
                const noSelected = currentAnswer === 'no' ? 'bg-red-200 ring-2 ring-indigo-500' : 'hover:bg-red-100 bg-opacity-50';
                const maybeHidden = voteData.disableMaybe ? 'hidden' : '';

                tableHTML += `
                    <td class="p-2 border-b">
                        <div class="flex justify-center gap-1">
                            <button class="admin-vote-grid-btn p-2 rounded-lg ${yesSelected} transition-colors" data-participant-id="${participantId}" data-option-index="${optionIndex}" data-answer="yes" title="Ja">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-green-600"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" /></svg>
                            </button>
                            <button class="admin-vote-grid-btn p-2 rounded-lg ${maybeSelected} ${maybeHidden} transition-colors" data-participant-id="${participantId}" data-option-index="${optionIndex}" data-answer="maybe" title="Vielleicht">
                                 <span class="text-yellow-600 font-bold text-xl w-5 h-5 flex items-center justify-center">~</span>
                            </button>
                            <button class="admin-vote-grid-btn p-2 rounded-lg ${noSelected} transition-colors" data-participant-id="${participantId}" data-option-index="${optionIndex}" data-answer="no" title="Nein">
                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-red-600"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                            </button>
                        </div>
                    </td>
                `;
            });
            
            tableHTML += '</tr>';
        });
    }
    
    tableHTML += '</tbody></table>';
    container.innerHTML = tableHTML;
}

/**
 * Verarbeitet den Klick eines Admins auf die Abstimmungs-Tabelle (Punkt 2)
 * Aktualisiert die LOKALEN Daten und protokolliert die Änderung.
 */
function handleAdminVoteEdit(participantId, optionIndex, newAnswer, clickedButton) {
    if (!currentVoteData || !currentVoteData.participants) return;
    
    // 1. Finde den Teilnehmer im LOKALEN Objekt
    const participantIndex = currentVoteData.participants.findIndex(p => p.userId === participantId);
    if (participantIndex === -1) {
        console.error("Teilnehmer für Admin-Edit nicht gefunden:", participantId);
        return;
    }
    
    const participant = currentVoteData.participants[participantIndex];
    const oldAnswer = participant.currentAnswers[optionIndex] || 'keine';
    
    if (oldAnswer === newAnswer) {
        return; // Nichts zu tun
    }

    console.log(`Admin ändert Vote für ${participant.name}: Option ${optionIndex} von ${oldAnswer} zu ${newAnswer}`);

    // 2. Erstelle den Log-Eintrag (wie von dir gewünscht)
    const option = currentVoteData.options[optionIndex];
    const optionText = option.timeEnd ? 
        `${option.date} ${option.timeStart}-${option.timeEnd}` : 
        `${option.date} ${option.timeStart}`;
        
    const historyLog = { 
        timestamp: new Date(), // Lokale Zeit
        changes: [{ 
            optionText: optionText, 
            from: oldAnswer, 
            to: newAnswer 
        }],
        // Protokolliert, dass der Admin (currentUser) die Änderung gemacht hat
        changedBy: `Admin (${currentUser.displayName || 'Unbekannt'})` 
    };
    
    // 3. Aktualisiere die LOKALEN Daten (wird erst beim Klick auf "Speichern" gesendet)
    participant.currentAnswers[optionIndex] = newAnswer;
    if (!participant.answerHistory) participant.answerHistory = [];
    participant.answerHistory.unshift(historyLog); // Fügt den Log-Eintrag hinzu
    participant.correctionCount = participant.answerHistory.length;
    
    // 4. Aktualisiere die UI (Knöpfe in der Zeile)
    const rowButtons = clickedButton.parentElement.querySelectorAll(`.admin-vote-grid-btn[data-participant-id="${participantId}"][data-option-index="${optionIndex}"]`);
    rowButtons.forEach(btn => {
        btn.classList.remove('bg-green-200', 'bg-yellow-200', 'bg-red-200', 'ring-2', 'ring-indigo-500');
        btn.classList.add('bg-opacity-50'); 
    });
    
    if (newAnswer === 'yes') clickedButton.classList.add('bg-green-200', 'ring-2', 'ring-indigo-500');
    if (newAnswer === 'maybe') clickedButton.classList.add('bg-yellow-200', 'ring-2', 'ring-indigo-500');
    if (newAnswer === 'no') clickedButton.classList.add('bg-red-200', 'ring-2', 'ring-indigo-500');
    clickedButton.classList.remove('bg-opacity-50');
}

// ----- NEUE FUNKTIONEN FÜR "TERMINE STREICHEN" -----

/**
 * Baut die Liste der bestehenden Termine im "Bearbeiten"-Modus (Punkt 1)
 */
function renderExistingTermsList(voteData) {
    const listContainer = document.getElementById('manage-existing-terms-list');
    if (!listContainer) return;

    if (!voteData.options || voteData.options.length === 0) {
        listContainer.innerHTML = `<p class="text-sm text-center text-gray-400">Keine Termine vorhanden.</p>`;
        return;
    }

    let listHTML = '';
    voteData.options.forEach((option, index) => {
        const dateObj = new Date(option.date + 'T12:00:00');
        const niceDate = dateObj.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
        const timeString = option.timeEnd ? `${option.timeStart} - ${option.timeEnd}` : `${option.timeStart} Uhr`;

        const isStricken = option.isStricken === true;

        const textClasses = isStricken ? 'line-through text-gray-500' : 'font-semibold text-gray-800';
        const button = isStricken ?
            `<button class="restore-term-btn py-1 px-3 bg-green-100 text-green-700 text-sm font-semibold rounded-lg hover:bg-green-200" data-option-index="${index}">Wiederherstellen</button>` :
            `<button class="strike-term-btn py-1 px-3 bg-red-100 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-200" data-option-index="${index}">Streichen</button>`;

        listHTML += `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                <div>
                    <p class="${textClasses}">${niceDate} <span class="font-mono">(${timeString})</span></p>
                    ${isStricken ? '<p class="text-xs font-bold text-red-600">GESTREICHEN (Alle Stimmen entfernt)</p>' : ''}
                </div>
                ${button}
            </div>
        `;
    });

    listContainer.innerHTML = listHTML;
}

/**
 * Verarbeitet den Klick auf "Streichen" / "Wiederherstellen" (Punkt 1)
 */
function handleStrikeTerm(optionIndex, shouldBeStricken) {
    if (!currentVoteData || !currentVoteData.options[optionIndex]) return;

    const option = currentVoteData.options[optionIndex];
    option.isStricken = shouldBeStricken;

    const optionText = option.timeEnd ? 
        `${option.date} ${option.timeStart}-${option.timeEnd}` : 
        `${option.date} ${option.timeStart}`;

    if (shouldBeStricken) {
        // --- TERMIN WIRD GESTRICHEN ---
        // Gehe durch alle Teilnehmer und entferne ihre Stimmen für diesen Termin
        currentVoteData.participants.forEach(p => {
            const oldAnswer = p.currentAnswers[optionIndex];
            if (oldAnswer && oldAnswer !== 'no') {
                // Setze Stimme auf 'no' (sicherer als 'null')
                p.currentAnswers[optionIndex] = 'no'; 
                
                // Füge einen Log-Eintrag hinzu
                const historyLog = { 
                    timestamp: new Date(),
                    changes: [{ 
                        optionText: optionText, 
                        from: oldAnswer, 
                        to: 'no' 
                    }],
                    changedBy: `Admin (${currentUser.displayName || 'Unbekannt'}) - Termin gestrichen` 
                };
                if (!p.answerHistory) p.answerHistory = [];
                p.answerHistory.unshift(historyLog);
                p.correctionCount = p.answerHistory.length;
            }
        });

    } else {
        // --- TERMIN WIRD WIEDERHERGESTELLT ---
        // Wir setzen keine Stimmen zurück. Teilnehmer müssen ggf. neu abstimmen.
        // Wir könnten einen Log-Eintrag hinzufügen, aber das ist optional.
    }

    // Lade beide Admin-Listen neu, um die Änderungen (gestrichen / entfernte Votes)
    // sofort im Bearbeiten-Modus anzuzeigen
    renderExistingTermsList(currentVoteData);
    renderParticipantEditGrid(currentVoteData);
    
    alertUser(`Termin ${shouldBeStricken ? 'gestrichen' : 'wiederhergestellt'}. (Lokal geändert)`, "success");
}

/**
 * NEU: Verarbeitet den Klick auf "Ok, quittieren"
 * (KORRIGIERTE VERSION: Stoppt den Spinner zuverlässig)
 */
async function handleAcknowledgeUpdate() {
    if (!currentVoteData || currentUser.mode === GUEST_MODE) return;

    const ackBtn = document.getElementById('acknowledge-update-btn');
    if (ackBtn) setButtonLoading(ackBtn, true);

    try {
        const getSafeDate = (timestamp) => {
            if (!timestamp) return null;
            if (typeof timestamp.toDate === 'function') return timestamp.toDate();
            return new Date(timestamp);
        };
        
        // 1. Finde das letzte Update-Timestamp
        const lastUpdate = currentVoteData.pollHistory[currentVoteData.pollHistory.length - 1];
        const lastUpdateTimestamp = getSafeDate(lastUpdate.timestamp);
        
        if (!lastUpdateTimestamp) {
            throw new Error("Letzter Update-Zeitstempel nicht gefunden.");
        }

        // 2. Bereite den neuen Quittierungs-Eintrag vor
        const newAckEntry = {
            userId: currentUser.mode,
            timestamp: lastUpdateTimestamp // Wichtig: Wir speichern den Zeitstempel des Updates, das quittiert wurde
        };

        // 3. Hole die alte Liste
        let oldAckArray = currentVoteData.acknowledgedBy || [];
        
        // 4. Entferne den alten Eintrag für diesen User (falls vorhanden)
        let newAckArray = oldAckArray.filter(a => a.userId !== currentUser.mode);
        
        // 5. Füge den neuen Eintrag hinzu
        newAckArray.push(newAckEntry);

        // 6. Speichere in Firebase
        const voteDocRef = doc(votesCollectionRef, currentVoteData.id);
        await updateDoc(voteDocRef, {
            acknowledgedBy: newAckArray
        });

        // 7. Aktualisiere die lokalen Daten
        currentVoteData.acknowledgedBy = newAckArray;

        // 8. Lade die Ansicht neu, um die Stile (Blinken aus, etc.) anzuwenden
        renderVoteView(currentVoteData);
        
        alertUser("Update quittiert", "success");

    } catch (error) {
        console.error("Fehler beim Quittieren des Updates:", error);
        alertUser("Fehler beim Quittieren.", "error");
    } finally {
        // --- KORREKTUR ---
        // Wir stoppen den Lade-Spinner in JEDEM Fall (auch bei Fehler),
        // damit er nicht hängen bleibt.
        if (ackBtn) setButtonLoading(ackBtn, false);
        // --- ENDE KORREKTUR ---
    }
}