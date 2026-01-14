// // @ts-check
// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
// KORREKTUR: serverTimestamp (von Firebase) hinzugefügt
import { onSnapshot, query, where, orderBy, getDocs, addDoc, doc, updateDoc, writeBatch, getDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// KORREKTUR: Fehlende Imports (currentUser, alertUser, USERS) und
// die KORREKTE Sammlung (approvalRequestsCollectionRef) hinzugefügt.
// roleChangeRequestsCollectionRef wird NICHT MEHR importiert.
import { adminSectionsState, approvalRequestsCollectionRef, usersCollectionRef, db, ROLES, currentUser, alertUser, USERS, PENDING_REQUESTS } from './haupteingang.js';

// KORREKTUR: Fehlende Imports für die Render-Funktionen hinzugefügt
import { renderUserManagement } from './admin_benutzersteuerung.js';
// ENDE-ZIKA //


// =================================================================
// BEGINN DER KORREKTUR (FUNKTION ERSETZEN)
// =================================================================
export async function createApprovalRequest(type, userId, details = {}) {
    try {
        // Stellt sicher, dass der Benutzername auch für neue Benutzer korrekt ausgelesen wird.
        let reqUserName;
        if (type === 'CREATE_USER' && details.userData) {
            reqUserName = details.userData.name;
        } else {
            // HIER WURDE 'USERS' BENÖTIGT
            reqUserName = USERS[userId]?.name || 'Unbekannt';
        }

        const requestData = {
            type: type,
            userId: userId,
            userName: reqUserName,
            // HIER WURDE 'currentUser' BENÖTIGT
            requestedById: currentUser.mode,
            requestedByName: currentUser.displayName,
            details: details,
            status: 'pending',
            // HIER WURDE 'serverTimestamp' BENÖTIGT
            timestamp: serverTimestamp()
        };
        
        // KORREKTUR: Schreibt in die korrekte Sammlung, auf die der Bot hört.
        // ALT: await addDoc(roleChangeRequestsCollectionRef, requestData);
        await addDoc(approvalRequestsCollectionRef, requestData); // <-- KORREKT

        // KORREKTUR: Angepasste Erfolgsmeldung, je nachdem, ob die
        // Aktion sofort (autoApprove) oder später (pending) ausgeführt wird.
        if (details.autoApprove) {
             alertUser('Aktion wurde erfolgreich ausgeführt.', 'success');
        } else {
             alertUser('Ihre Anfrage wurde zur Genehmigung eingereicht.', 'success');
        }
        
        // HINWEIS: Die Zeilen 'localUpdateInProgress', 'rememberAdminScroll' 
        // und 'renderUserManagement' wurden entfernt. 
        // Die Funktion 'listenForApprovalRequests' (weiter unten)
        // erledigt das Neuladen der UI automatisch, sobald die
        // Datenbank (durch diese Funktion hier) aktualisiert wurde.
        // Das ist sauberer und verhindert Fehler.

    } catch (error) {
        console.error("Error creating approval request:", error);
        // HIER WURDE 'alertUser' BENÖTIGT
        alertUser('Fehler beim Erstellen der Anfrage.', 'error');
    }
}
// =================================================================
// ENDE DER KORREKTUR
// =================================================================


export function listenForApprovalRequests() {
    // KORREKTUR: 'async' und 'await import' ENTFERNT

    const q = currentUser?.role === 'SYSTEMADMIN'
        ? query(approvalRequestsCollectionRef, orderBy('timestamp', 'desc'))
        : query(approvalRequestsCollectionRef, where('requestedById', '==', currentUser?.mode || ''));

    onSnapshot(q, (snapshot) => {
        
        // 1. Leere die globale Liste
        Object.keys(PENDING_REQUESTS).forEach(key => delete PENDING_REQUESTS[key]);
        
        // 2. Fülle sie mit allen "pending" Anfragen
        snapshot.forEach(doc => {
            const request = doc.data();
            if (request.status === 'pending') {
                // Wir speichern die Anfrage, zugeordnet zur Benutzer-ID
                if (!PENDING_REQUESTS[request.userId]) {
                    PENDING_REQUESTS[request.userId] = [];
                }
                PENDING_REQUESTS[request.userId].push(request);
            }
        });

        // 3. Rufe die Render-Funktionen auf (wie vorher)
        if (adminSectionsState.approval) {
            renderApprovalProcess(snapshot);
        }
        if (adminSectionsState.user) {
            renderUserManagement(); // Diese Funktion wird die Sperre jetzt anzeigen
        }
    });
}


// =================================================================
// BEGINN DER KORREKTUR (FUNKTION ERSETZEN)
// =================================================================
export async function renderApprovalProcess(snapshot = null) {
    const approvalProcessArea = document.getElementById('approvalProcessArea');
    if (!approvalProcessArea) return; // Sicherheitsabbruch

    approvalProcessArea.innerHTML = '';

    if (!snapshot) {
        // KORREKTUR: Liest von der korrekten Sammlung
        // ALT: snapshot = await getDocs(query(roleChangeRequestsCollectionRef, orderBy('timestamp', 'desc')));
        const q = currentUser?.role === 'SYSTEMADMIN'
            ? query(approvalRequestsCollectionRef, orderBy('timestamp', 'desc'))
            : query(approvalRequestsCollectionRef, where('requestedById', '==', currentUser?.mode || ''));
        snapshot = await getDocs(q);
    }

    if (!snapshot || snapshot.empty) {
        approvalProcessArea.innerHTML += '<p class="text-gray-500">Keine Anfragen vorhanden.</p>';
        return;
    }

    snapshot.forEach(docSnap => {
        const request = docSnap.data();
        const requestId = docSnap.id;

        const requestCard = document.createElement('div');
        requestCard.className = 'p-3 border rounded-lg';
        let cardBG = 'bg-white', statusText = '', descriptionHTML = '';
        
        // KORREKTUR: 'failed' Status hinzugefügt (falls der Bot einen Fehler hat)
        let statusActor;
        if (request.status === 'failed') {
             statusActor = ` (BOT-FEHLER: ${request.actionTakenByName || ''})`;
        } else {
             statusActor = request.actionTakenByName ? ` (von ${request.actionTakenByName})` : '';
        }
        
        const time = request.timestamp?.toDate?.().toLocaleString('de-DE') || '';

        switch (request.status) {
            case 'pending': cardBG = 'bg-yellow-50'; statusText = 'Offen'; break;
            case 'approved': cardBG = 'bg-green-50'; statusText = 'Genehmigt' + statusActor; break;
            case 'denied': cardBG = 'bg-red-50'; statusText = 'Abgelehnt' + statusActor; break;
            case 'withdrawn': cardBG = 'bg-gray-100'; statusText = 'Zurückgezogen' + statusActor; break;
            case 'failed': cardBG = 'bg-pink-100'; statusText = 'Fehlgeschlagen' + statusActor; break; // KORREKTUR
            default: cardBG = 'bg-white'; statusText = request.status || '';
        }
        requestCard.classList.add(cardBG);

        // Beschreibung je Aktion
        switch (request.type) {
            case 'CREATE_USER':
                descriptionHTML = `<p>Aktion: <span class="font-medium">Benutzer anlegen</span></p><p class="text-sm text-gray-600">Neuer Name: ${request.details?.userData?.name || '—'}</p>`;
                break;
            case 'DELETE_USER':
                descriptionHTML = `<p>Aktion: <span class="font-medium text-red-600">Benutzer löschen</span> für <span class="font-medium">${request.userName}</span></p>`;
                break;
            case 'RENAME_USER':
                descriptionHTML = `<p>Aktion: <span class="font-medium">Benutzer umbenennen</span></p><p class="text-sm text-gray-600">'${request.userName}' ➜ '${request.details?.newName || '—'}'</p>`;
                break;
            case 'TOGGLE_USER_ACTIVE':
                {
                    const actionText = request.details?.isActive === false ? 'Sperren' : 'Entsperren';
                    const actionColor = request.details?.isActive === false ? 'text-red-600' : 'text-green-600';
                    descriptionHTML = `<p>Aktion: <span class="font-medium ${actionColor}">${actionText}</span> für Benutzer <span class="font-medium">${request.userName}</span></p>`;
                }
                break;
            case 'SET_ADMIN_STATUS':
                descriptionHTML = `<p>Aktion: <span class="font-medium text-purple-600">Zum Admin befördern</span> für <span class="font-medium">${request.userName}</span></p>`;
                break;
            // KORREKTUR: 'CHANGE_PERMISSION_TYPE' Logik angepasst (war 'CHANGE_USER_ROLE')
            case 'CHANGE_PERMISSION_TYPE':
                {
                    // =================================================================
                    // BEGINN DER KORREKTUR (FEHLER 3)
                    // =================================================================
                    let typeDetails = '';
                    if (request.details?.type === 'role') {
                        // Bisherige Logik für "Rolle"
                        typeDetails = `auf "Rolle" (${ROLES?.[request.details?.newRole]?.name || request.details?.newRole || 'Standard'})`;
                    } else {
                        // NEUE Logik für "Individuell"
                        typeDetails = `auf "Individuell"`;
                        // Prüfe, ob eine displayRole (angezeigte Rolle) mitgesendet wurde
                        if (request.details?.displayRole) {
                            // Hänge den Text an, indem wir den Namen der Rolle aus dem ROLES-Objekt holen
                            typeDetails += ` (Angezeigt als: ${ROLES?.[request.details?.displayRole]?.name || request.details?.displayRole})`;
                        } else if (request.details?.displayRole === null) {
                            // Falls die Rolle explizit entfernt wurde (auf "Keine Rechte" gesetzt)
                             typeDetails += ` (Angezeigt als: ${ROLES['NO_RIGHTS']?.name || 'Keine Rechte'})`;
                        }
                    }
                    // =================================================================
                    // ENDE DER KORREKTUR (FEHLER 3)
                    // =================================================================
                    descriptionHTML = `<p>Aktion: <span class="font-medium">Berechtigungstyp ändern</span> für <span class="font-medium">${request.userName}</span></p><p class="text-sm text-gray-600">Änderung: ${typeDetails}</p>`;
                }
                break;
            case 'CHANGE_CUSTOM_PERMISSIONS':
                descriptionHTML = `<p>Aktion: <span class="font-medium">Individuelle Rechte ändern</span> für <span class="font-medium">${request.userName}</span></p>`;
                break;
            default:
                descriptionHTML = `<p>Unbekannte Aktion: ${request.type}</p>`;
        }

        // Buttons für pending requests
        let buttonsHTML = '';
        // KORREKTUR: SysAdmin darf auch 'failed' Anfragen löschen (aufräumen)
        if (request.status === 'pending' || request.status === 'failed') {
            if (currentUser.role === 'SYSTEMADMIN') {
                // Bei 'failed' zeigen wir nur Ablehnen (Löschen)
                 if (request.status === 'failed') {
                    buttonsHTML = `
                    <button class="deny-request-btn py-1 px-3 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700" data-request-id="${requestId}">Löschen (Fehler)</button>`;
                } else {
                    buttonsHTML = `
                        <button class="deny-request-btn py-1 px-3 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700" data-request-id="${requestId}">Ablehnen</button>
                        <button class="approve-request-btn py-1 px-3 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700" data-request-id="${requestId}">Annehmen</button>`;
                }
            } else if (currentUser.mode === request.requestedById) {
                buttonsHTML = `<button class="withdraw-request-btn py-1 px-3 text-sm font-semibold bg-gray-500 text-white rounded-lg hover:bg-gray-600" data-request-id="${requestId}">Zurückziehen</button>`;
            }
        }

        requestCard.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-semibold text-gray-800">Antrag von: ${request.requestedByName}</p>
                    <p class="text-xs text-gray-500">${time}</p>
                </div>
                <span class="text-xs font-bold px-2 py-1 rounded-full ${cardBG}">${statusText}</span>
            </div>
            <div class="mt-2 pt-2 border-t">${descriptionHTML}</div>
            <div class="flex justify-end space-x-2 mt-3">${buttonsHTML}</div>`;
        approvalProcessArea.appendChild(requestCard);
    });

    // Event-Handler: Approve
    approvalProcessArea.querySelectorAll('.approve-request-btn').forEach(button => {
        if (button.dataset.listenerAttached) return;
        button.dataset.listenerAttached = 'true';
        button.addEventListener('click', async (e) => {
            const requestId = e.currentTarget.dataset.requestId;
            let requestType = null;
            try {
                // KORREKTUR: Liest von der korrekten Sammlung
                const requestDoc = await getDoc(doc(approvalRequestsCollectionRef, requestId));
                if (!requestDoc.exists()) return;
                const request = requestDoc.data();
                const { type, userId, details } = request;
                requestType = type;

                if (type === 'CREATE_USER') {
                    const userDataRaw = details.userData || {};
                    const newUserId = userDataRaw.newUserId;
                    const key = userDataRaw.key;

                    if (newUserId) {
                        const { key: _key, newUserId: _newUserId, ...userData } = userDataRaw;
                        Object.keys(userData).forEach((k) => (userData[k] === undefined && delete userData[k]));

                        const createBatch = writeBatch(db);
                        createBatch.set(doc(usersCollectionRef, newUserId), userData);
                        await createBatch.commit();

                        if (key) {
                            if (!window.setUserKey) {
                                throw new Error("Cloud Function (setUserKey) ist noch nicht initialisiert. Bitte warten.");
                            }
                            await window.setUserKey({ appUserId: newUserId, newKey: String(key) });
                        }
                    }

                    await updateDoc(doc(approvalRequestsCollectionRef, requestId), { status: 'approved', actionTakenByName: currentUser.displayName });
                    alertUser('Antrag genehmigt!', 'success');
                    return;
                }

                let batch = writeBatch(db);

                // KORREKTUR: Logik für 'CHANGE_PERMISSION_TYPE' und 'CREATE_USER' (mit 'realName')
                switch (type) {
                    case 'DELETE_USER':
                        batch.delete(doc(usersCollectionRef, userId));
                        break;
                    case 'RENAME_USER':
                        batch.update(doc(usersCollectionRef, userId), { name: details.newName });
                        break;
                    case 'TOGGLE_USER_ACTIVE':
                        batch.update(doc(usersCollectionRef, userId), { isActive: details.isActive });
                        break;
                    case 'SET_ADMIN_STATUS':
                        batch.update(doc(usersCollectionRef, userId), { role: 'ADMIN', permissionType: 'role', assignedAdminRoleId: null });
                        break;
                    case 'CHANGE_PERMISSION_TYPE':
                        {
                            let updateData = {};
                            if (details.type === 'role') {
                                updateData = { permissionType: 'role', role: details.newRole, customPermissions: [], displayRole: null };
                            } else {
                                updateData = { permissionType: 'individual', role: null, customPermissions: details.customPermissions || [], displayRole: details.displayRole || null };
                            }
                            batch.update(doc(usersCollectionRef, userId), updateData);
                        }
                        break;
                    case 'CHANGE_CUSTOM_PERMISSIONS':
                        batch.update(doc(usersCollectionRef, userId), { customPermissions: details.permissions || [] });
                        break;
                }

                // KORREKTUR: Schreibt in die korrekte Sammlung
                batch.update(doc(approvalRequestsCollectionRef, requestId), { status: 'approved', actionTakenByName: currentUser.displayName });
                await batch.commit();
                alertUser('Antrag genehmigt!', 'success');

            } catch (error) {
                console.error("Error approving request:", error);
                if (requestType === 'CREATE_USER') {
                    try {
                        await updateDoc(doc(approvalRequestsCollectionRef, requestId), {
                            status: 'failed',
                            actionTakenByName: currentUser.displayName,
                            errorMessage: String(error?.message || error)
                        });
                    } catch (e2) {
                        console.error("Error marking request as failed:", e2);
                    }
                }
                alertUser('Fehler bei der Genehmigung.', 'error');
            }
        });
    });

    // Deny handler
    approvalProcessArea.querySelectorAll('.deny-request-btn').forEach(button => {
        if (button.dataset.listenerAttached) return;
        button.dataset.listenerAttached = 'true';
        button.addEventListener('click', async (e) => {
            const requestId = e.currentTarget.dataset.requestId;
            try {
                // KORREKTUR: SysAdmin, der eine 'failed' Anfrage löscht, löscht sie.
                const requestDoc = await getDoc(doc(approvalRequestsCollectionRef, requestId));
                if(requestDoc.exists() && requestDoc.data().status === 'failed') {
                    await deleteDoc(doc(approvalRequestsCollectionRef, requestId));
                    alertUser('Fehlgeschlagene Anfrage gelöscht.', 'success');
                } else {
                    // Normales Ablehnen
                    await updateDoc(doc(approvalRequestsCollectionRef, requestId), { status: 'denied', actionTakenByName: currentUser.displayName });
                    alertUser('Antrag abgelehnt.', 'success');
                }
            } catch (error) {
                console.error("Error denying/deleting request:", error);
                alertUser('Fehler beim Ablehnen/Löschen des Antrags.', 'error');
            }
        });
    });

    // Withdraw handler
    approvalProcessArea.querySelectorAll('.withdraw-request-btn').forEach(button => {
        if (button.dataset.listenerAttached) return;
        button.dataset.listenerAttached = 'true';
        button.addEventListener('click', async (e) => {
            const requestId = e.currentTarget.dataset.requestId;
            try {
                // KORREKTUR: Schreibt in die korrekte Sammlung
                await updateDoc(doc(approvalRequestsCollectionRef, requestId), { status: 'withdrawn', actionTakenByName: currentUser.displayName });
                alertUser('Antrag zurückgezogen.', 'success');
            } catch (error) {
                console.error("Error withdrawing request:", error);
            }
        });
    });
}
// =================================================================
// ENDE DER KORREKTUR
// =================================================================