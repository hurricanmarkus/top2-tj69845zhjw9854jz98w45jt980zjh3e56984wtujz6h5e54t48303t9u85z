// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { onSnapshot, query, orderBy, getDocs, addDoc, doc, updateDoc, writeBatch, getDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// =================================================================
// BEGINN DER KORREKTUR (Kreislauf-Fehler)
// =================================================================
// Wir importieren die KORREKTE V2-Sammlung (approvalRequestsCollectionRef)
// und entfernen die alte (roleChangeRequestsCollectionRef)
// WICHTIG: Die Importe für 'renderUserManagement' und 'rememberAdminScroll' sind ENTFERNT, um den Kreislauf zu brechen.
import { adminSectionsState, approvalRequestsCollectionRef, usersCollectionRef, db, ROLES, USERS, currentUser, alertUser } from './haupteingang.js';
// (Importiere auch USERS, currentUser, alertUser, da sie in der Funktion unten gebraucht werden)
// =================================================================
// ENDE DER KORREKTUR
// =================================================================


export async function createApprovalRequest(type, userId, details = {}) {
    try {
        // NEU: Stellt sicher, dass der Benutzername auch für neue Benutzer korrekt ausgelesen wird.
        let reqUserName;
        if (type === 'CREATE_USER' && details.userData) {
            reqUserName = details.userData.name;
        } else {
            // Stelle sicher, dass USERS geladen ist, bevor darauf zugegriffen wird
            reqUserName = (USERS && USERS[userId]) ? USERS[userId].name : 'Unbekannt';
        }

        const requestData = {
            type: type,
            userId: userId,
            userName: reqUserName,
            requestedById: currentUser.mode,
            requestedByName: currentUser.displayName,
            details: details,
            status: 'pending',
            timestamp: serverTimestamp()
        };
        
        // =================================================================
        // BEGINN DER KORREKTUR (aus vorigem Schritt - bleibt gleich)
        // =================================================================
        // Wir schreiben jetzt in die KORREKTE Sammlung, auf die der V2-Bot hört.
        await addDoc(approvalRequestsCollectionRef, requestData);
        // =================================================================
        // ENDE DER KORREKTUR
        // =================================================================

        // Wenn der Sticker 'autoApprove' nicht dran ist, zeigen wir die Standard-Meldung
        if (!details.autoApprove) {
            alertUser('Ihre Anfrage wurde zur Genehmigung eingereicht.', 'success');
        }
        
        // =================================================================
        // KORREKTUR (Kreislauf-Fehler): Diese Zeilen ENTFERNT, da sie den Fehler verursachen.
        // Die UI wird jetzt durch 'listenForUserUpdates' aktualisiert,
        // wenn der Bot die Daten ändert.
        // =================================================================
        // ENTFERNT: rememberAdminScroll();
        // ENTFERNT: if (typeof renderUserManagement === 'function') { ... }
        
    } catch (error) {
        // Diese Fehlermeldung sollte jetzt den FirebaseError (Permission Denied) anzeigen
        console.error("Error creating approval request:", error);
        alertUser(`Fehler beim Erstellen der Anfrage: ${error.message}`, 'error');
    }
}

export function listenForApprovalRequests() {
    // =================================================================
    // KORREKTUR (Zuhören - aus vorigem Schritt)
    // =================================================================
    // Wir müssen auch den Listener auf die KORREKTE Sammlung umstellen.
    onSnapshot(query(approvalRequestsCollectionRef, orderBy('timestamp', 'desc')), (snapshot) => {
    // =================================================================
    // ENDE KORREKTUR (Zuhören)
    // =================================================================
        
        // Dieser Teil ist OK, da er nur die "Genehmigungs-UI"
        // und nicht die "Benutzer-UI" aktualisiert.
        if (adminSectionsState.approval) {
            renderApprovalProcess(snapshot);
        }

        // =================================================================
        // KORREKTUR (Kreislauf-Fehler): Dieser Block wird ENTFERNT,
        // da er 'renderUserManagement' aufruft.
        // =================================================================
        // ENTFERNT: if (adminSectionsState.user) { ... }
        // =================================================================
    });
}


export async function renderApprovalProcess(snapshot = null) {
    const approvalProcessArea = document.getElementById('approvalProcessArea'); // Area holen
    if (!approvalProcessArea) {
        console.error("approvalProcessArea nicht gefunden!");
        return; // Abbruch, wenn das Element fehlt
    }
    approvalProcessArea.innerHTML = '';

    if (!snapshot) {
        // =================================================================
        // KORREKTUR (Laden - aus vorigem Schritt)
        // =================================================================
        // Wir müssen beim manuellen Laden die KORREKTE Sammlung abfragen.
        snapshot = await getDocs(query(approvalRequestsCollectionRef, orderBy('timestamp', 'desc')));
        // =================================================================
        // ENDE KORREKTUR (Laden)
        // =================================================================
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
        let statusActor = request.actionTakenByName ? ` (von ${request.actionTakenByName})` : '';
        const time = request.timestamp?.toDate?.().toLocaleString('de-DE') || '';

        switch (request.status) {
            case 'pending': cardBG = 'bg-yellow-50'; statusText = 'Offen'; break;
            case 'approved': cardBG = 'bg-green-50'; statusText = 'Genehmigt' + statusActor; break;
            case 'denied': cardBG = 'bg-red-50'; statusText = 'Abgelehnt' + statusActor; break;
            case 'withdrawn': cardBG = 'bg-gray-100'; statusText = 'Zurückgezogen' + statusActor; break;
            // NEU: Bot-Fehler anzeigen
            case 'failed': cardBG = 'bg-red-200'; statusText = 'Bot FEHLER' + statusActor; break;
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
            case 'CHANGE_USER_ROLE':
                {
                    const newRoleId = request.details?.newRole;
                    const newRoleName = (ROLES && ROLES[newRoleId]) ? ROLES[newRoleId].name : (newRoleId || '—');
                    descriptionHTML = `<p>Aktion: <span class="font-medium">Rolle ändern</span> für <span class="font-medium">${request.userName}</span></p><p class="text-sm text-gray-600">Neue Rolle: ${newRoleName}</p>`;
                }
                break;
            case 'CHANGE_PERMISSION_TYPE':
                {
                    let typeDetails = request.details?.type === 'role'
                        ? `auf "Rolle" (${(ROLES && ROLES[request.details?.newRole]) ? ROLES[request.details?.newRole].name : (request.details?.newRole || 'Standard')})`
                        : `auf "Individuell"`;
                    descriptionHTML = `<p>Aktion: <span class="font-medium">Berechtigungstyp ändern</span> für <span class="font-medium">${request.userName}</span></p><p class="text-sm text-gray-600">Änderung: ${typeDetails}</p>`;
                }
                break;
            case 'CHANGE_CUSTOM_PERMISSIONS':
                descriptionHTML = `<p>Aktion: <span class="font-medium">Individuelle Rechte ändern</span> für <span class="font-medium">${request.userName}</span></p>`;
                break;
            default:
                descriptionHTML = `<p>Unbekannte Aktion: ${request.type}</p>`;
        }
        
        // Zeige Auto-Approve Sticker
        if (request.details?.autoApprove === true && request.status === 'pending') {
            descriptionHTML += `<p class="text-xs text-blue-600 font-semibold mt-1">Wird sofort ausgeführt (Auto-Approve)...</p>`;
        }

        // Buttons für pending requests
        let buttonsHTML = '';
        if (request.status === 'pending') {
            // Nur SysAdmin darf annehmen/ablehnen
            if (currentUser.role === 'SYSTEMADMIN') {
                buttonsHTML = `
                    <button class="deny-request-btn py-1 px-3 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700" data-request-id="${requestId}">Ablehnen</button>
                    <button class="approve-request-btn py-1 px-3 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700" data-request-id="${requestId}">Annehmen</button>`;
            } 
            // Der Ersteller darf zurückziehen (AUCH wenn es auto-approve ist, falls es hängen bleibt)
            else if (currentUser.mode === request.requestedById) {
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
    approvalProcessArea.querySelectorAll('.approve-request-btn').forEach(button => button.addEventListener('click', async (e) => {
        const requestId = e.currentTarget.dataset.requestId;
        try {
            // =================================================================
            // KORREKTUR (Aktion - aus vorigem Schritt)
            // =================================================================
            // Holt den Antrag aus der KORREKTEN Sammlung
            const requestDoc = await getDoc(doc(approvalRequestsCollectionRef, requestId));
            // =================================================================
            // ENDE KORREKTUR (Aktion)
            // =================================================================
            
            if (!requestDoc.exists()) return;
            const request = requestDoc.data();
            const { type, userId, details } = request;
            let batch = writeBatch(db);

            // Diese Logik ist identisch zur Logik in der V2-Cloud-Function,
            // damit der SysAdmin dieselbe Aktion ausführt.
            switch (type) {
                case "CREATE_USER": {
                    const { name, key, role, isActive, newUserId, realName } = details.userData || {};
                    if (newUserId) {
                        const userDocRef = doc(usersCollectionRef, newUserId);
                        // Stelle sicher, dass alle Felder (auch realName) gesetzt werden
                        const userData = { name, key, role, isActive, realName: realName || "" }; 
                        Object.keys(userData).forEach((k) => (userData[k] === undefined && delete userData[k]));
                        batch.set(userDocRef, userData);
                    }
                    break;
                }
                case "DELETE_USER": {
                    batch.delete(doc(usersCollectionRef, userId));
                    break;
                }
                case "RENAME_USER": {
                    batch.update(doc(usersCollectionRef, userId), { name: details.newName });
                    break;
                }
                case "TOGGLE_USER_ACTIVE": {
                    batch.update(doc(usersCollectionRef, userId), { isActive: details.isActive });
                    break;
                }
                case "CHANGE_PERMISSION_TYPE": {
                    let updateData = {};
                    if (details.type === "role") {
                        updateData = { permissionType: "role", role: details.newRole, customPermissions: [], displayRole: null };
                    } else {
                        // KORREKTUR: Stelle sicher, dass die ECHTE Rolle (role) gesetzt wird, nicht nur die Anzeige-Rolle
                        let newActualRole = null;
                        if (details.displayRole === 'ADMIN') newActualRole = 'ADMIN';
                        else if (details.displayRole === 'SYSTEMADMIN') newActualRole = 'SYSTEMADMIN';
                        else if (details.displayRole === 'NO_RIGHTS') newActualRole = 'NO_RIGHTS';
                        else newActualRole = details.displayRole; // z.B. ANGEMELDET

                        updateData = { permissionType: "individual", role: newActualRole, customPermissions: details.customPermissions || [], displayRole: details.displayRole || null };
                    }
                    batch.update(doc(usersCollectionRef, userId), updateData);
                    break;
                }
                // (Andere Typen wie SET_ADMIN_STATUS oder CHANGE_USER_ROLE, falls nötig)
                case 'SET_ADMIN_STATUS':
                    batch.update(doc(usersCollectionRef, userId), { role: 'ADMIN', permissionType: 'role', assignedAdminRoleId: null });
                    break;
                case 'CHANGE_USER_ROLE': // (Wird vielleicht von CHANGE_PERMISSION_TYPE abgedeckt)
                    batch.update(doc(usersCollectionRef, userId), { role: details.newRole });
                    break;
                case 'CHANGE_CUSTOM_PERMISSIONS': // (Wird vielleicht von CHANGE_PERMISSION_TYPE abgedeckt)
                    batch.update(doc(usersCollectionRef, userId), { customPermissions: details.permissions || [] });
                    break;
            }
            
            // =================================================================
            // KORREKTUR (Aktion - aus vorigem Schritt)
            // =================================================================
            // Markiert den Antrag in der KORREKTEN Sammlung als 'approved'
            batch.update(doc(approvalRequestsCollectionRef, requestId), { status: 'approved', actionTakenByName: currentUser.displayName });
            // =================================================================
            // ENDE KORREKTUR (Aktion)
            // =================================================================
            await batch.commit();
            alertUser('Antrag genehmigt!', 'success');
        } catch (error) {
            console.error("Error approving request:", error);
            alertUser('Fehler bei der Genehmigung.', 'error');
        }
    }));

    // Deny handler
    approvalProcessArea.querySelectorAll('.deny-request-btn').forEach(button => button.addEventListener('click', async (e) => {
        const requestId = e.currentTarget.dataset.requestId;
        try {
            // =================================================================
            // KORREKTUR (Aktion - aus vorigem Schritt)
            // =================================================================
            await updateDoc(doc(approvalRequestsCollectionRef, requestId), { status: 'denied', actionTakenByName: currentUser.displayName });
            // =================================================================
            // ENDE KORREKTUR (Aktion)
            // =================================================================
            alertUser('Antrag abgelehnt.', 'success');
        } catch (error) {
            console.error("Error denying request:", error);
            alertUser('Fehler beim Ablehnen des Antrags.', 'error');
        }
    }));

    // Withdraw handler
    approvalProcessArea.querySelectorAll('.withdraw-request-btn').forEach(button => button.addEventListener('click', async (e) => {
        const requestId = e.currentTarget.dataset.requestId;
        try {
            // =================================================================
            // KORREKTUR (Aktion - aus vorigem Schritt)
            // =================================================================
            await updateDoc(doc(approvalRequestsCollectionRef, requestId), { status: 'withdrawn', actionTakenByName: currentUser.displayName });
            // =================================================================
            // ENDE KORREKTUR (Aktion)
            // =================================================================
            alertUser('Antrag zurückgezogen.', 'success');
        } catch (error) {
            console.error("Error withdrawing request:", error);
        }
    }));
}