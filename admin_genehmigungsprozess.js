// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { roleChangeRequestsCollectionRef, adminSectionsState, approvalRequestsCollectionRef } from './haupteingang.js';
// ENDE-ZIKA //

export async function createApprovalRequest(type, userId, details = {}) {
    try {
        // NEU: Stellt sicher, dass der Benutzername auch für neue Benutzer korrekt ausgelesen wird.
        let reqUserName;
        if (type === 'CREATE_USER' && details.userData) {
            reqUserName = details.userData.name;
        } else {
            reqUserName = USERS[userId]?.name || 'Unbekannt';
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
        await addDoc(roleChangeRequestsCollectionRef, requestData);
        alertUser('Ihre Anfrage wurde zur Genehmigung eingereicht.', 'success');
        localUpdateInProgress = true;
        rememberAdminScroll();
        renderUserManagement();
    } catch (error) {
        console.error("Error creating approval request:", error);
        alertUser('Fehler beim Erstellen der Anfrage.', 'error');
    }
}

export function listenForApprovalRequests() {
    onSnapshot(query(roleChangeRequestsCollectionRef, orderBy('timestamp', 'desc')), (snapshot) => {
        if (adminSectionsState.approval) {
            renderApprovalProcess(snapshot);
        }
        if (adminSectionsState.user) {
            renderUserManagement();
        }
    });
}

export async function renderApprovalProcess(snapshot = null) {
    approvalProcessArea.innerHTML = '';

    if (!snapshot) {
        snapshot = await getDocs(query(roleChangeRequestsCollectionRef, orderBy('timestamp', 'desc')));
    }

    if (snapshot.empty) {
        approvalProcessArea.innerHTML += '<p class="text-gray-500">Keine Anfragen vorhanden.</p>';
        return;
    }

    snapshot.forEach(docSnap => {
        const request = docSnap.data();
        const requestId = docSnap.id;

        const requestCard = document.createElement('div');
        requestCard.className = 'p-3 border rounded-lg';
        let cardBG, statusText, descriptionHTML;
        let statusActor = request.actionTakenByName ? ` (von ${request.actionTakenByName})` : '';
        const time = request.timestamp?.toDate().toLocaleString('de-DE') || '';

        switch (request.status) {
            case 'pending': cardBG = 'bg-yellow-50'; statusText = 'Offen'; break;
            case 'approved': cardBG = 'bg-green-50'; statusText = 'Genehmigt' + statusActor; break;
            case 'denied': cardBG = 'bg-red-50'; statusText = 'Abgelehnt' + statusActor; break;
            case 'withdrawn': cardBG = 'bg-gray-100'; statusText = 'Zurückgezogen' + statusActor; break;
        }
        requestCard.classList.add(cardBG);

        switch (request.type) {
            case 'CREATE_USER':
                descriptionHTML = `<p>Aktion: <span class="font-medium">Benutzer anlegen</span></p><p class="text-sm text-gray-600">Neuer Name: ${request.details.userData.name}</p>`;
                break;
            case 'DELETE_USER':
                descriptionHTML = `<p>Aktion: <span class="font-medium text-red-600">Benutzer löschen</span> für <span class="font-medium">${request.userName}</span></p>`;
                break;
            case 'RENAME_USER':
                descriptionHTML = `<p>Aktion: <span class="font-medium">Benutzer umbenennen</span></p><p class="text-sm text-gray-600">'${request.userName}' ➜ '${request.details.newName}'</p>`;
                break;
            // NEU: Angepasste Anzeige für Sperren/Entsperren
            case 'TOGGLE_USER_ACTIVE':
                const actionText = request.details.isActive === false ? 'Sperren' : 'Entsperren';
                const actionColor = request.details.isActive === false ? 'text-red-600' : 'text-green-600';
                descriptionHTML = `<p>Aktion: <span class="font-medium ${actionColor}">${actionText}</span> für Benutzer <span class="font-medium">${request.userName}</span></p>`;
                break;
            case 'SET_ADMIN_STATUS':
                descriptionHTML = `<p>Aktion: <span class="font-medium text-purple-600">Zum Admin befördern</span> für <span class="font-medium">${request.userName}</span></p>`;
                break;
            case 'CHANGE_USER_ROLE':
                descriptionHTML = `<p>Aktion: <span class="font-medium">Rolle ändern</span> für <span class="font-medium">${request.userName}</span></p><p class="text-sm text-gray-600">Neue Rolle: ${request.details.newRoleName}</p>`;
                break;
            case 'CHANGE_PERMISSION_TYPE':
                let typeDetails = request.details.type === 'role'
                    ? `auf "Rolle" (${ROLES[request.details.newRole]?.name || 'Standard'})`
                    : `auf "Individuell"`;
                descriptionHTML = `<p>Aktion: <span class="font-medium">Berechtigungstyp ändern</span> für <span class="font-medium">${request.userName}</span></p><p class="text-sm text-gray-600">Neuer Typ: ${typeDetails}</p>`;
                break;
            case 'CHANGE_CUSTOM_PERMISSIONS':
                descriptionHTML = `<p>Aktion: <span class="font-medium">Individuelle Rechte ändern</span> für <span class="font-medium">${request.userName}</span></p>`;
                break;
            default:
                descriptionHTML = `<p>Unbekannte Aktion: ${request.type}</p>`;
        }


        let buttonsHTML = '';
        if (request.status === 'pending') {
            if (currentUser.role === 'SYSTEMADMIN') {
                buttonsHTML = `
                        <button class="deny-request-btn py-1 px-3 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700" data-request-id="${requestId}">Ablehnen</button>
                        <button class="approve-request-btn py-1 px-3 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700" data-request-id="${requestId}">Annehmen</button>`;
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

    approvalProcessArea.querySelectorAll('.approve-request-btn').forEach(button => button.addEventListener('click', async (e) => {
        const requestId = e.currentTarget.dataset.requestId;
        const requestDoc = await getDoc(doc(roleChangeRequestsCollectionRef, requestId));
        if (!requestDoc.exists()) return;

        const request = requestDoc.data();
        const { type, userId, details } = request;
        let batch = writeBatch(db);

        try {
            switch (type) {
                case 'CREATE_USER':
                    const { name, key, role, isActive, newUserId } = details.userData;
                    batch.set(doc(usersCollectionRef, newUserId), { name, key, role, isActive });
                    break;
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
                case 'CHANGE_USER_ROLE':
                    batch.update(doc(usersCollectionRef, userId), { role: details.newRole });
                    break;
                case 'CHANGE_PERMISSION_TYPE':
                    if (details.type === 'role') {
                        batch.update(doc(usersCollectionRef, userId), { role: details.newRole, customPermissions: [] });
                    } else {
                        batch.update(doc(usersCollectionRef, userId), { role: null, customPermissions: details.customPermissions });
                    }
                    break;
                case 'CHANGE_CUSTOM_PERMISSIONS':
                    batch.update(doc(usersCollectionRef, userId), { customPermissions: details.permissions });
                    break;
            }
            batch.update(doc(roleChangeRequestsCollectionRef, requestId), { status: 'approved', actionTakenByName: currentUser.displayName });
            await batch.commit();
            alertUser('Antrag genehmigt!', 'success');
        } catch (error) {
            console.error("Error approving request:", error);
            alertUser('Fehler bei der Genehmigung.', 'error');
        }
    }));

    approvalProcessArea.querySelectorAll('.deny-request-btn').forEach(button => button.addEventListener('click', async (e) => {
        const { requestId } = e.currentTarget.dataset;
        await updateDoc(doc(roleChangeRequestsCollectionRef, requestId), { status: 'denied', actionTakenByName: currentUser.displayName });
    }));

    approvalProcessArea.querySelectorAll('.withdraw-request-btn').forEach(button => button.addEventListener('click', async (e) => {
        const { requestId } = e.currentTarget.dataset;
        await updateDoc(doc(roleChangeRequestsCollectionRef, requestId), { status: 'withdrawn', actionTakenByName: currentUser.displayName });
    }));
}
