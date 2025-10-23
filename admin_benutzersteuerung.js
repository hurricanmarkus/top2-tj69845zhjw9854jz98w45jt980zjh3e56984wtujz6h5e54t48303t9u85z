// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 // TEST 1
import { onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { usersCollectionRef, USERS, initialAuthCheckDone, modalUserButtons } from './haupteingang.js';
import { checkCurrentUserValidity } from './log-InOut.js';
// ENDE-ZIKA //

export function listenForUserUpdates() {
    const mainContent = document.querySelector('.main-content');

    onSnapshot(usersCollectionRef, (snapshot) => {

        Object.keys(USERS).forEach(key => delete USERS[key]); snapshot.forEach((doc) => { USERS[doc.id] = { id: doc.id, ...doc.data() }; });

        // Verhindert ein Neuzeichnen, wenn die Änderung vom User selbst kam
        if (initialAuthCheckDone) {
            checkCurrentUserValidity();
        }
        renderModalUserButtons();

        // Prüft, ob geöffnete Admin-Sektionen neu gezeichnet werden müssen
        // Prüft, ob geöffnete Admin-Sektionen neu gezeichnet werden müssen
        const isAdminViewActive = document.getElementById('adminView').classList.contains('active');

        if (isAdminViewActive) {
            if (adminSectionsState.password) {
                renderUserKeyList();
            }
            if (adminSectionsState.user) {
                renderUserManagement();
            }
            if (adminSectionsState.role) {
                renderRoleManagement();
            }
            if (adminSectionsState.protocol) {
                renderProtocolHistory();
            }
        }
    }, (error) => {
        console.error("Error listening for user updates:", error);
    });

}

// ERSETZE die komplette Funktion hiermit:
export function renderModalUserButtons() {
    // --- SPIONE ---
    console.log("renderModalUserButtons: Funktion wird aufgerufen.");
    console.log("renderModalUserButtons: USERS Objekt VOR Filter:", USERS);

    // Prüfen, ob das importierte Element gültig ist
    if (!modalUserButtons) {
        console.error("renderModalUserButtons: FEHLER - Importierte Variable 'modalUserButtons' ist leer!");
        return; // Abbruch, wenn das Element fehlt
    }
    console.log("renderModalUserButtons: Importiertes Element 'modalUserButtons' gefunden:", modalUserButtons);
    // --- ENDE SPIONE ---

    const ROLE_BORDER_COLORS = {
        ADMIN: 'border-red-500',
        SYSTEMADMIN: 'border-purple-700',
        DEFAULT: 'border-indigo-500'
    };

    const allUsers = Object.values(USERS).filter(u =>
        u.name && u.permissionType !== 'not_registered'
    );

    console.log("renderModalUserButtons: Anzahl User NACH Filter:", allUsers.length); // Spion

    modalUserButtons.innerHTML = ''; // Leeren des Containers über die importierte Variable

    if (allUsers.length === 0) {
        console.log("renderModalUserButtons: Keine Benutzer zum Anzeigen nach Filterung."); // Spion
        modalUserButtons.innerHTML = '<p class="text-sm text-center text-gray-500">Keine anmeldbaren Benutzer gefunden.</p>';
        return;
    }

    allUsers.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'select-user-button w-full p-4 bg-gray-50 hover:bg-indigo-50 rounded-lg shadow-sm flex items-center gap-4 cursor-pointer transition duration-150 border-l-4';
        userCard.dataset.user = user.id;

        const borderColor = ROLE_BORDER_COLORS[user.role] || ROLE_BORDER_COLORS.DEFAULT;
        userCard.classList.add(borderColor);

        userCard.innerHTML = `
         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6 text-gray-400">
             <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clip-rule="evenodd" />
         </svg>
         <span class="text-lg font-medium text-gray-800">${user.name}</span>
         `;
        modalUserButtons.appendChild(userCard); // Füge zum korrekten Element hinzu (über importierte Variable)
    });

    console.log("renderModalUserButtons: Rendern der Benutzer abgeschlossen."); // Spion
}
function renderUserKeyList() {
    const userKeyList = document.getElementById('userKeyList'); // Sicherstellen, dass die Variable hier definiert ist
    userKeyList.innerHTML = '';
    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';

    // --- KORREKTUR START: Filter für nicht registrierte Benutzer ---
    Object.values(USERS)
        .filter(user => user.permissionType !== 'not_registered') // Nur Benutzer anzeigen, die NICHT 'not_registered' sind
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')) // Sortieren NACH dem Filtern
        .forEach(user => {
            // --- KORREKTUR ENDE ---
            const userId = user.id;
            // Der Rest der Logik innerhalb der Schleife bleibt gleich...
            if (!user.name) return;

            const isSelf = userId === currentUser.mode;
            const isTargetSysAdmin = user.role === 'SYSTEMADMIN';
            const canEditKey = isSelf || (isSysAdmin && !isTargetSysAdmin) || (isAdmin && !isTargetSysAdmin);
            const canViewKey = canEditKey;
            const keyDisplay = canViewKey ? (user.key || 'Nicht gesetzt') : '••••••••••';
            const currentUserLabel = isSelf ? '<span class="bg-indigo-100 text-indigo-800 font-bold text-xs px-2 py-1 rounded-full ml-2">AKTUELL</span>' : '';

            const userDiv = document.createElement('div');
            userDiv.className = `p-3 border rounded-lg ${!canEditKey ? 'bg-gray-200 opacity-70' : 'bg-gray-50'}`;
            userDiv.innerHTML = `
             <p class="font-bold text-gray-800 flex items-center">${user.name} ${currentUserLabel}</p>
             <p class="text-xs text-gray-500 mb-2">Rolle: ${ROLES[user.role]?.name || ROLES[user.displayRole]?.name || 'Keine Rolle'}</p>
             <div class="mb-3"><label class="block text-xs font-medium text-gray-600">Aktueller Schlüssel</label><input type="text" value="${keyDisplay}" class="w-full p-2 bg-gray-200 border rounded-md text-sm text-gray-700" readonly></div>
             <div class="flex space-x-2">
                 <input type="password" class="new-key-input flex-grow p-2 border rounded-lg text-sm" placeholder="Neuen Schlüssel eingeben" ${!canEditKey ? 'disabled' : ''}>
                 <button class="save-key-button py-2 px-3 bg-blue-600 text-white text-sm font-semibold rounded-lg ${!canEditKey ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}" data-userid="${userId}" ${!canEditKey ? 'disabled' : ''}>Speichern</button>
             </div>`;
            userKeyList.appendChild(userDiv);
        }); // Ende der forEach-Schleife

    // Event-Listener für die Speicher-Buttons (bleibt gleich)
    userKeyList.querySelectorAll('.save-key-button').forEach(button => {
        if (!button.dataset.listenerAttached) { // Verhindert doppelte Listener
            button.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userid;
                const isSelf = userId === currentUser.mode;
                if (!isSelf && !confirm(`Möchten Sie das Passwort für ${USERS[userId].name} wirklich ändern?`)) return;

                const newKeyInput = e.target.closest('.flex').querySelector('.new-key-input');
                const newKey = newKeyInput.value;
                if (newKey.length < 4) return alertUser("Schlüssel muss mind. 4 Zeichen haben.", "error");

                await updateDoc(doc(usersCollectionRef, userId), { key: newKey });
                await logAdminAction('password_changed', `Passwort für '${USERS[userId].name}' wurde geändert.`);
                alertUser(`Schlüssel für ${USERS[userId].name} wurde aktualisiert!`, "success");
                newKeyInput.value = '';
            });
            button.dataset.listenerAttached = 'true';
        }
    });
}

async function renderUserManagement() {
    // Frühe Überprüfung der Referenz (bleibt gleich)
    if (!roleChangeRequestsCollectionRef || !usersCollectionRef || !rolesCollectionRef) {
        userManagementArea.innerHTML = `<p class="text-center text-red-500">Datenbankverbindung wird noch aufgebaut...</p>`;
        setTimeout(renderUserManagement, 500);
        return;
    }

    // Admin-Berechtigungen ermitteln (bleibt gleich)
    let effectiveAdminPerms = {};
    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdminEditing = currentUser.role === 'SYSTEMADMIN';
    if (isAdmin) {
        const adminUser = USERS[currentUser.mode];
        if (adminUser) {
            if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
            } else {
                effectiveAdminPerms = adminUser.adminPermissions || {};
            }
        }
    }
    const permSet = (isSysAdminEditing) ? { canToggleUserActive: true, canDeleteUser: true, canRenameUser: true, canChangeUserPermissionType: true, canCreateUser: true } : effectiveAdminPerms;

    // --- HTML-Grundgerüst neu aufbauen (inkl. Listener für "+ Benutzer anlegen") ---
    userManagementArea.innerHTML = `
        <button id="showAddUserFormBtn" class="w-full p-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition shadow-md ${!permSet.canCreateUser ? 'hidden' : ''}">+ Benutzer anlegen</button>
        <div id="addUserFormContainer" class="p-4 border rounded-xl bg-green-50 hidden">
             <h4 class="font-bold text-lg text-green-800 mb-2">Neuen Benutzer anlegen</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" id="newUserName" class="p-2 border rounded-lg" placeholder="Nickname*">
                <input type="text" id="newUserRealName" class="p-2 border rounded-lg" placeholder="Vollständiger Name (Optional)">
<div id="newUserKeyWrapper" class="sm:col-span-1"> 
     <input type="password" id="newUserKey" class="p-2 border rounded-lg w-full" placeholder="Passwort* (mind. 4 Zeichen)">
 </div>
                <select id="newUserPermissionType" class="p-2 border rounded-lg bg-white">
                    <option value="role" selected>Typ: Rolle (Standard)</option>
                    <option value="individual">Typ: Individuell</option>
                    <option value="not_registered">Typ: Nicht registriert</option>
                </select>
                <select id="newUserRole" class="p-2 border rounded-lg bg-white sm:col-span-2">
                    
                </select>
                <button id="saveNewUserButton" class="sm:col-span-2 p-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Erstellen</button>
            </div>
            <p class="text-xs text-gray-500 mt-2">* Pflichtfelder (außer bei "Nicht registriert")</p>
        </div>
        <div id="registeredUserList" class="space-y-3 pt-4 border-t mt-4"></div>
        <div class="mt-6 pt-4 border-t">
            <button id="notRegisteredToggle" class="w-full flex justify-between items-center p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-left font-semibold text-gray-700">
                <span>Nicht registrierte Personen (<span id="notRegisteredCount">0</span>)</span>
                <svg id="notRegisteredToggleIcon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5 transform transition-transform"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </button>
            <div id="notRegisteredList" class="hidden mt-2 space-y-2 pl-4 border-l-2 border-gray-200">
                 <p class="text-xs text-center text-gray-400">Keine nicht registrierten Personen vorhanden.</p>
            </div>
        </div>`;

    // Listener für "+ Benutzer anlegen" Button
    const addUserBtn = userManagementArea.querySelector('#showAddUserFormBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', (e) => {
            e.currentTarget.style.display = 'none';
            userManagementArea.querySelector('#addUserFormContainer').classList.remove('hidden');
            // Setze Standardwerte im Formular
            document.getElementById('newUserPermissionType').value = 'role';
            toggleNewUserRoleField(); // Zeige Rollenauswahl initial an
        });
    }

    // Listener für Typ-Auswahl im "Neu anlegen"-Formular
    const newUserPermTypeSelect = userManagementArea.querySelector('#newUserPermissionType');
    if (newUserPermTypeSelect) {
        newUserPermTypeSelect.addEventListener('change', toggleNewUserRoleField);
    }

    // --- Daten vorbereiten ---
    const allUsers = Object.values(USERS).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const registeredUsers = allUsers.filter(u => u.permissionType !== 'not_registered');
    const notRegisteredUsers = allUsers.filter(u => u.permissionType === 'not_registered');

    const registeredListContainer = userManagementArea.querySelector('#registeredUserList');
    const notRegisteredListContainer = userManagementArea.querySelector('#notRegisteredList');
    registeredListContainer.innerHTML = ''; // Leeren für Neudarstellung
    notRegisteredListContainer.innerHTML = ''; // Leeren für Neudarstellung

    // Zähler aktualisieren
    document.getElementById('notRegisteredCount').textContent = notRegisteredUsers.length;

    // Rollenoptionen für Dropdowns vorbereiten
    const roleOptionsHTML = Object.values(ROLES)
        .filter(r => r.id !== 'SYSTEMADMIN' && r.id !== 'ADMIN' && r.id !== 'NO_RIGHTS') // Standard-Filter
        .map(role => `<option value="${role.id}">${role.name}</option>`)
        .join('');
    const newUserRoleSelect = userManagementArea.querySelector('#newUserRole');
    if (newUserRoleSelect) {
        newUserRoleSelect.innerHTML = roleOptionsHTML;
        newUserRoleSelect.value = 'ANGEMELDET'; // Standardrolle vorauswählen
    }

    // Verfügbare Berechtigungen (bleibt gleich)
    const allPermissions = { 'ENTRANCE': 'Haupteingang öffnen', 'PUSHOVER': 'Push-Nachricht senden', 'CHECKLIST': 'Aktuelle Checkliste', 'CHECKLIST_SWITCH': '-> Listen umschalten', 'CHECKLIST_SETTINGS': '-> Checkliste-Einstellungen', 'ESSENSBERECHNUNG': 'Essensberechnung' };
    // Anzeige-Rollen (bleibt gleich)
    const displayRoleOptions = Object.values(ROLES).filter(r => (isSysAdminEditing || r.id !== 'SYSTEMADMIN')).map(role => `<option value="${role.id}">${role.name.replace(/-/g, '').trim()}</option>`).join('');

    // --- Rendern der Benutzerkarten ---

    // Funktion zum Erstellen einer Benutzerkarte (wird für beide Listen verwendet)
    const createUserCardHTML = (user) => {
        const userId = user.id;
        const isSelf = userId === currentUser.mode;
        const isTargetSysAdmin = user.role === 'SYSTEMADMIN';
        const isTargetAdmin = user.role === 'ADMIN';
        const isNotRegistered = user.permissionType === 'not_registered';

        let canEdit = false;
        if (isSysAdminEditing) { canEdit = !isSelf; } // SysAdmin darf alle außer sich selbst
        else if (isAdmin) { canEdit = !isTargetSysAdmin && !isTargetAdmin; } // Admin darf keine Admins/SysAdmins

        // Überschreiben für nicht registrierte User: können von Admins bearbeitet werden
        if (isNotRegistered && isAdmin) canEdit = true;

        const canToggle = permSet.canToggleUserActive && canEdit && !isSelf && !isNotRegistered; // Nicht registrierte können nicht gesperrt werden
        const canDelete = permSet.canDeleteUser && canEdit && !isSelf;
        const canRename = permSet.canRenameUser && canEdit;
        const canChangePerms = permSet.canChangeUserPermissionType && canEdit && !isNotRegistered; // Nicht registrierte haben keine Berechtigungen zum Ändern

        const currentUserLabel = isSelf ? '<span class="bg-indigo-100 text-indigo-800 font-bold text-xs px-2 py-1 rounded-full ml-2">AKTUELL</span>' : '';
        const realNameDisplay = user.realName ? `<span class="text-gray-500 italic text-sm ml-1 real-name-display">(${user.realName})</span>` : '';

        // Rollenanzeige Logik
        let roleName = 'Unbekannt';
        let roleColorClass = 'text-gray-500';
        if (isNotRegistered) {
            roleName = 'Nicht registriert';
            roleColorClass = 'text-gray-400 italic';
        } else {
            const effectiveRoleId = user.role || user.displayRole || 'NO_RIGHTS';
            roleName = ROLES[effectiveRoleId]?.name || 'Keine Rolle';
            if (user.role === 'SYSTEMADMIN') roleColorClass = 'text-purple-600 font-bold';
            else if (user.role === 'ADMIN') roleColorClass = 'text-red-600 font-bold';
        }

        // Berechtigungs-HTML (nur für registrierte User relevant)
        let permissionsHTML = '';
        if (!isNotRegistered) {
            const permType = user.permissionType || 'role'; // Default to role if undefined
            let selectedDisplayRole = user.displayRole || 'NO_RIGHTS';
            // Korrektur: Wenn ein Admin individuelle Rechte hat, soll "Admin" angezeigt werden
            if (user.role === 'ADMIN' && permType === 'individual') selectedDisplayRole = 'ADMIN';

            const finalDisplayRoleOptionsWithSelection = displayRoleOptions.replace(`value="${selectedDisplayRole}"`, `value="${selectedDisplayRole}" selected`);

            permissionsHTML = `
            <div class="mt-4 pt-3 border-t" data-userid="${userId}">
                <label class="block text-sm font-medium text-gray-700 mb-2">Berechtigungs-Typ</label>
                <div class="flex items-center gap-4">
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="role" class="perm-type-toggle h-4 w-4" ${permType === 'role' ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}> <span class="ml-2">Rolle</span></label>
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="individual" class="perm-type-toggle h-4 w-4" ${permType === 'individual' ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}> <span class="ml-2">Individuell</span></label>
                </div>
                <div class="role-selection-area mt-2 ${permType === 'role' ? '' : 'hidden'}">
                    <select class="user-role-select w-full p-2 border rounded-lg bg-white text-sm" ${!canChangePerms ? 'disabled' : ''}>
                        ${Object.values(ROLES).filter(r => (isSysAdminEditing || (r.id !== 'SYSTEMADMIN' && r.id !== 'ADMIN'))).map(role => `<option value="${role.id}" ${user.role === role.id ? 'selected' : ''}>${role.name}</option>`).join('')}
                    </select>
                </div>
                <div class="individual-perms-area mt-3 ${permType === 'individual' ? '' : 'hidden'}">
                    <div class="flex items-center gap-3 p-2 bg-indigo-50 rounded-lg">
                         <label class="text-sm font-medium text-gray-700 whitespace-nowrap">Angezeigter Status:</label>
                         <select class="display-role-select w-full p-1 border rounded-lg bg-white text-sm" ${!canChangePerms ? 'disabled' : ''}>
                            ${finalDisplayRoleOptionsWithSelection}
                         </select>
                    </div>
                    <div class="space-y-2 mt-3 pt-3 border-t">
                        ${Object.keys(allPermissions).map(permKey => `<label class="flex items-center ${permKey.startsWith('CHECKLIST_') ? 'pl-6' : ''}"><input type="checkbox" class="custom-perm-checkbox h-4 w-4" data-perm="${permKey}" ${(user.customPermissions || []).includes(permKey) ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}><span class="ml-2 text-sm">${allPermissions[permKey]}</span></label>`).join('')}
                    </div>
                </div>
                <div class="flex justify-end mt-3 hidden save-perms-container">
                     <button class="save-perms-button py-1 px-3 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Berechtigungen speichern</button>
                </div>
            </div>`;
        }

        // Lock-Toggle HTML (nur für registrierte User)
        const lockToggleHTML = !isNotRegistered ? `
            <label class="flex items-center ${canToggle ? 'cursor-pointer' : 'cursor-not-allowed'}">
                <span class="mr-2 text-sm font-medium">Gesperrt: <span class="${!user.isActive ? 'text-red-700' : 'text-green-700'} font-bold">${!user.isActive ? 'JA' : 'NEIN'}</span></span>
                <div class="relative">
                    <input type="checkbox" class="sr-only user-active-toggle" data-userid="${userId}" ${!user.isActive ? 'checked' : ''} ${!canToggle ? 'disabled' : ''}>
                    <div class="block bg-gray-300 w-10 h-6 rounded-full"></div>
                    <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition"></div>
                </div>
            </label>` : '<div class="w-10 h-6"></div>'; // Platzhalter für Layout

        // Zusammenbau der Karte
        return `
        <div class="user-card p-3 border rounded-lg flex flex-col gap-3 ${!canEdit && !isSelf ? 'bg-gray-200 opacity-70' : (isNotRegistered ? 'bg-gray-50' : 'bg-gray-50')}" data-userid="${userId}">
            <div class="flex justify-between items-start">
                 <div class="flex-grow">
<div class="flex items-center gap-2 flex-wrap">
     <div data-userid="${userId}" class="name-display font-bold text-gray-800">${user.name || 'Unbenannt'} ${currentUserLabel} ${realNameDisplay}</div>
     <div data-userid="${userId}" class="name-edit-container hidden flex-grow gap-2 items-center">
         <input type="text" value="${user.name || ''}" class="edit-nickname-input p-1 border rounded w-full text-sm" placeholder="Nickname">
         <input type="text" value="${user.realName || ''}" class="edit-realname-input p-1 border rounded w-full text-sm" placeholder="Vollständiger Name">
         <button class="save-name-btn p-1 ml-1 bg-green-500 text-white rounded text-xs">✔️</button>
     </div>
     ${canRename ? `<button class="rename-user-btn p-1" data-userid="${userId}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-gray-500 hover:text-indigo-600"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.775a.75.75 0 0 0-.22.53l-.5 2.5a.75.75 0 0 0 .913.913l2.5-.5a.75.75 0 0 0 .53-.22l4.263-4.262a1.75 1.75 0 0 0 0-2.475Z" /><path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v9.5c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25V9.5a.75.75 0 0 1 1.5 0v5.25A2.75 2.75 0 0 1 14.25 18h-9.5A2.75 2.75 0 0 1 2 15.25v-9.5A2.75 2.75 0 0 1 4.75 3.5h5.25a.75.75 0 0 1 0 1.5H4.75Z" /></svg></button>` : ''}
 </div>
                    <p class="text-xs ${roleColorClass}">${roleName}</p>
                </div>
                ${lockToggleHTML}
            </div>
            ${permissionsHTML}
            <div class="flex justify-end mt-2">
                <button class="delete-user-button py-1 px-3 text-xs font-semibold bg-red-600 text-white rounded-lg ${!canDelete ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-700'}" data-userid="${userId}" ${!canDelete ? 'disabled' : ''}>Löschen</button>
            </div>
        </div>`;
    };

    // Rendere registrierte Benutzer
    if (registeredUsers.length > 0) {
        registeredUsers.forEach(user => {
            registeredListContainer.innerHTML += createUserCardHTML(user);
        });
    } else {
        registeredListContainer.innerHTML = '<p class="text-sm text-center text-gray-400">Keine registrierten Benutzer vorhanden.</p>';
    }

    // Rendere nicht registrierte Benutzer
    if (notRegisteredUsers.length > 0) {
        notRegisteredUsers.forEach(user => {
            notRegisteredListContainer.innerHTML += createUserCardHTML(user);
        });
    } else {
        notRegisteredListContainer.innerHTML = '<p class="text-xs text-center text-gray-400">Keine nicht registrierten Personen vorhanden.</p>';
    }

    // --- Event Listener hinzufügen ---
    addAdminUserManagementListeners(userManagementArea, isAdmin, isSysAdminEditing, permSet, allPermissions, displayRoleOptions);
    restoreAdminScrollIfAny();
}

function addAdminUserManagementListeners(area, isAdmin, isSysAdminEditing, permSet, allPermissions, displayRoleOptions) {

    // --- KORREKTUR START: Listener explizit entfernen und hinzufügen ---
    // Entferne den vorherigen Listener, falls er existiert (gespeichert in _handleUserManagementClick)
    if (area._handleUserManagementClick) {
        area.removeEventListener('click', area._handleUserManagementClick);
        // console.log("Removed previous user management click listener."); // Optional: Debugging
    }

    // Definiere die Listener-Funktion direkt hier und speichere sie am Element
    // Innerhalb von addAdminUserManagementListeners, ersetze die Definition von area._handleUserManagementClick:

    area._handleUserManagementClick = async (e) => {
        const userCard = e.target.closest('.user-card');
        if (!userCard) return;
        const userId = userCard.dataset.userid;
        if (!userId) return;

        // Hole Admin-Berechtigungen (wie zuvor)
        let effectiveAdminPerms = {};
        const isAdmin = currentUser.role === 'ADMIN';
        const isSysAdminEditing = currentUser.role === 'SYSTEMADMIN';
        if (isAdmin) { /* ... Logik zum Holen der Perms ... */
            const adminUser = USERS[currentUser.mode];
            if (adminUser) {
                if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                    effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
                } else {
                    effectiveAdminPerms = adminUser.adminPermissions || {};
                }
            }
        }
        const permSet = (isSysAdminEditing) ? { canToggleUserActive: true, canDeleteUser: true, canRenameUser: true, canChangeUserPermissionType: true, canCreateUser: true } : effectiveAdminPerms;


        // --- Aktivieren/Deaktivieren Toggle ---
        const toggleInput = e.target.closest('.user-active-toggle');
        if (toggleInput) {
            await new Promise(resolve => setTimeout(resolve, 0));
            const isChecked = toggleInput.checked;
            if (!confirm(`Möchten Sie den Status von ${USERS[userId].name} wirklich ändern?`)) {
                toggleInput.checked = !isChecked; return;
            }
            // ... (Restliche Logik für Toggle)
            if (isAdmin && permSet.approvalRequired?.toggleUserActive) {
                toggleInput.checked = !isChecked; // Zurücksetzen bis genehmigt
                await createApprovalRequest('TOGGLE_USER_ACTIVE', userId, { isActive: !isChecked });
            } else {
                try {
                    await updateDoc(doc(usersCollectionRef, userId), { isActive: !isChecked });
                    // Kein Log mehr hier
                } catch (error) {
                    console.error("Fehler beim Ändern des Aktivierungsstatus:", error);
                    alertUser("Fehler beim Ändern des Status.", "error");
                    toggleInput.checked = !isChecked;
                }
            }
            return;
        }

        // --- Löschen Button ---
        const deleteButton = e.target.closest('.delete-user-button');
        if (deleteButton) {
            const userToDelete = USERS[userId];
            const userNameToDelete = userToDelete?.name || `ID: ${userId}`;
            if (!confirm(`Möchten Sie ${userNameToDelete} wirklich löschen?`)) {
                return;
            }
            // ... (Restliche Logik für Delete)
            if (isAdmin && permSet.approvalRequired?.deleteUser) {
                await createApprovalRequest('DELETE_USER', userId);
            } else {
                try {
                    await deleteDoc(doc(usersCollectionRef, userId));
                    alertUser(`${userNameToDelete} wurde gelöscht.`, 'success');
                } catch (error) {
                    console.error(`Fehler beim Versuch, Benutzer '${userNameToDelete}' zu löschen:`, error);
                    alertUser("Fehler beim Löschen des Benutzers.", "error");
                }
            }
            return;
        }

        // --- Umbenennen Button (Stift) --- KORRIGIERT ---
        const renameButton = e.target.closest('.rename-user-btn');
        if (renameButton) {
            // Finde die relevanten Elemente innerhalb der geklickten Karte
            const nameDisplayEl = userCard.querySelector('.name-display');
            const editContainerEl = userCard.querySelector('.name-edit-container');

            // Nur umschalten, wenn beide Elemente gefunden wurden
            if (nameDisplayEl && editContainerEl) {
                nameDisplayEl.classList.add('hidden'); // Namensanzeige ausblenden
                renameButton.classList.add('hidden'); // Stift-Button ausblenden
                editContainerEl.classList.remove('hidden'); // Eingabefelder anzeigen

                // Optional: Fokus auf das erste Eingabefeld
                const nicknameInput = editContainerEl.querySelector('.edit-nickname-input');
                if (nicknameInput) {
                    setTimeout(() => nicknameInput.focus(), 0);
                }
            } else {
                console.error("Fehler: Konnte Elemente für die Umbenennungsansicht nicht finden für User:", userId);
            }
            return; // Wichtig: Weitere Ausführung verhindern
        }

        // --- Speichern nach Umbenennen Button (Häkchen) ---
        const saveNameButton = e.target.closest('.save-name-btn');
        if (saveNameButton) {
            const container = saveNameButton.closest('.name-edit-container');
            // Finde Elemente relativ zum Container
            const nameDisplayEl = userCard.querySelector('.name-display');
            const renameBtnEl = userCard.querySelector('.rename-user-btn'); // Stift-Button wieder finden

            const newNickname = container.querySelector('.edit-nickname-input').value.trim();
            const newRealName = container.querySelector('.edit-realname-input').value.trim() || null;
            const oldUser = USERS[userId];

            if (!newNickname) {
                alertUser("Nickname darf nicht leer sein.", "error"); return;
            }

            // Prüfen, ob sich was geändert hat
            if (newNickname === oldUser.name && newRealName === oldUser.realName) {
                // Nichts geändert, Ansicht zurücksetzen
                if (container) container.classList.add('hidden');
                if (nameDisplayEl) nameDisplayEl.classList.remove('hidden');
                if (renameBtnEl) renameBtnEl.classList.remove('hidden'); // Stift wieder anzeigen
                return;
            }

            if (!confirm(`Möchten Sie die Namen für '${oldUser.name}' wirklich ändern?`)) return;

            const updateData = { name: newNickname, realName: newRealName };

            if (isAdmin && permSet.approvalRequired?.renameUser) {
                await createApprovalRequest('RENAME_USER', userId, { newName: newNickname, newRealName: newRealName });
            } else {
                try {
                    await updateDoc(doc(usersCollectionRef, userId), updateData);
                    // Kein Log mehr hier
                } catch (error) {
                    console.error("Fehler beim Speichern des neuen Namens:", error);
                    alertUser("Fehler beim Speichern des Namens.", "error");
                }
            }
            // UI wird durch onSnapshot aktualisiert, aber wir können die Ansicht schon zurücksetzen
            if (container) container.classList.add('hidden');
            if (nameDisplayEl) nameDisplayEl.classList.remove('hidden');
            if (renameBtnEl) renameBtnEl.classList.remove('hidden'); // Stift wieder anzeigen
            return; // Wichtig
        }

        // --- Speichern der Berechtigungen Button ---
        const savePermsButton = e.target.closest('.save-perms-button');
        if (savePermsButton) {
            // ... (Logik zum Speichern der Berechtigungen, unverändert) ...
            const permContainer = e.target.closest('[data-userid]');
            const type = permContainer.querySelector('input[name^="perm-type-"]:checked').value;
            localUpdateInProgress = true;
            rememberAdminScroll();
            let updateData = {};
            if (type === 'role') {
                const newRole = permContainer.querySelector('.user-role-select').value;
                updateData = { role: newRole, permissionType: 'role', customPermissions: [], displayRole: null };
                if (newRole === 'ADMIN' || newRole === 'SYSTEMADMIN') {
                    updateData.assignedAdminRoleId = null;
                    updateData.adminPermissions = {};
                }
            } else { // type === 'individual'
                const customPermissions = Array.from(permContainer.querySelectorAll('.custom-perm-checkbox:checked')).map(cb => cb.dataset.perm);
                const selectedDisplayRole = permContainer.querySelector('.display-role-select').value || null;
                updateData = { permissionType: 'individual', customPermissions: customPermissions, role: null, displayRole: null };
                if (selectedDisplayRole === 'ADMIN' || selectedDisplayRole === 'SYSTEMADMIN') {
                    updateData.role = selectedDisplayRole;
                } else {
                    updateData.displayRole = selectedDisplayRole;
                }
            }
            try {
                await updateDoc(doc(usersCollectionRef, userId), updateData);
                permContainer.querySelector('.save-perms-container').classList.add('hidden');
                alertUser("Berechtigungen gespeichert!", "success");
            } catch (error) {
                console.error("Fehler beim Speichern der Berechtigungen:", error);
                alertUser("Fehler beim Speichern der Berechtigungen.", "error");
            } finally {
                localUpdateInProgress = false; // Zurücksetzen nach Abschluss
            }
            return; // Wichtig
        }

    }; // Ende der Definition von area._handleUserManagementClick                // Füge den neuen Listener hinzu
    area.addEventListener('click', area._handleUserManagementClick);
    // console.log("Added new user management click listener."); // Optional: Debugging
    // --- KORREKTUR ENDE ---


    // --- Listener für spezifische Buttons (wie "Speichern neu", "Nicht registriert Toggle") ---
    // Diese können weiterhin wie bisher hinzugefügt werden, da sie sich auf Elemente beziehen,
    // die bei jedem Render neu erstellt werden. Stelle sicher, dass auch sie nicht doppelt hinzugefügt werden.

    const saveNewUserButton = area.querySelector('#saveNewUserButton');
    if (saveNewUserButton && !saveNewUserButton.dataset.listenerAttached) {
        saveNewUserButton.addEventListener('click', async () => {
            console.log("1. 'Erstellen' Button geklickt!"); // Debugging bleibt drin

            const name = area.querySelector('#newUserName').value.trim();
            const realName = area.querySelector('#newUserRealName').value.trim() || null;
            const keyInput = area.querySelector('#newUserKey');
            const key = keyInput?.value.trim() || '';
            const permissionType = area.querySelector('#newUserPermissionType').value;
            const role = area.querySelector('#newUserRole').value;
            const newUserId = name.toUpperCase().replace(/\s/g, '');
            const isNotRegistered = (permissionType === 'not_registered');

            // --- Validation Checks ---
            if (!name || !newUserId) {
                console.log("Abbruch: Name oder UserID fehlt."); // Debugging
                return alertUser("Nickname muss angegeben werden.", "error");
            }
            // Korrekte Prüfung: Passwortfeld muss existieren UND Passwort muss lang genug sein, es sei denn, es ist 'not_registered'
            if (!isNotRegistered && (!keyInput || key.length < 4)) {
                console.log("Abbruch: Passwort zu kurz oder Feld fehlt (nur wenn nicht 'not_registered')."); // Debugging
                return alertUser("Passwort muss mind. 4 Zeichen haben.", "error");
            }
            if (USERS[newUserId]) {
                console.log("Abbruch: User ID existiert bereits."); // Debugging
                return alertUser(`ID '${newUserId}' existiert bereits (aus Nickname abgeleitet). Bitte ändern Sie den Nickname.`, "error");
            }
            // --- End Validation ---

            console.log("2. Validierung bestanden. Bereite Daten vor..."); // Debugging

            const userData = {
                name: name,
                realName: realName,
                permissionType: permissionType,
                isActive: true,
                key: isNotRegistered ? null : key,
                role: (permissionType === 'role' && !isNotRegistered) ? role : null,
                customPermissions: [],
                displayRole: null,
                assignedAdminRoleId: null,
                adminPermissions: {}
            };

            // --- KORREKTUR START: Definitionen für isAdmin, isSysAdminEditing, permSet hinzufügen ---
            let effectiveAdminPerms = {};
            const isAdmin = currentUser.role === 'ADMIN'; // Definiere isAdmin hier
            const isSysAdminEditing = currentUser.role === 'SYSTEMADMIN'; // Definiere isSysAdminEditing hier
            if (isAdmin) {
                const adminUser = USERS[currentUser.mode];
                if (adminUser) {
                    if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                        effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
                    } else {
                        effectiveAdminPerms = adminUser.adminPermissions || {};
                    }
                }
            }
            // Definiere permSet hier basierend auf den gerade ermittelten Werten
            const permSet = (isSysAdminEditing) ?
                { canToggleUserActive: true, canDeleteUser: true, canRenameUser: true, canChangeUserPermissionType: true, canCreateUser: true } : effectiveAdminPerms;
            // --- KORREKTUR ENDE ---


            // --- Approval / Direct Save Logic ---
            // Jetzt kann permSet sicher verwendet werden
            if (isAdmin && permSet.approvalRequired?.createUser) {
                console.log("3a. Genehmigung erforderlich. Rufe createApprovalRequest auf..."); // Debugging
                try {
                    await createApprovalRequest('CREATE_USER', newUserId, { userData: { ...userData, newUserId: newUserId } });
                    console.log("4a. createApprovalRequest erfolgreich beendet."); // Debugging
                } catch (error) {
                    console.error("Fehler in createApprovalRequest:", error); // Debugging
                    // alertUser wird bereits in createApprovalRequest aufgerufen
                }
            } else {
                console.log("3b. Keine Genehmigung nötig oder SysAdmin. Rufe setDoc auf..."); // Debugging
                try {
                    await setDoc(doc(usersCollectionRef, newUserId), userData);
                    console.log("4b. setDoc erfolgreich beendet."); // Debugging
                    await logAdminAction('user_created', `Benutzer '${name}' (${newUserId}) erstellt.`);
                    alertUser(`Benutzer '${name}' erstellt.`, 'success');
                    // Formular leeren und verstecken...
                    area.querySelector('#addUserFormContainer').classList.add('hidden');
                    const showBtn = area.querySelector('#showAddUserFormBtn');
                    if (showBtn) showBtn.style.display = 'block';
                    area.querySelector('#newUserName').value = '';
                    area.querySelector('#newUserRealName').value = '';
                    if (keyInput) keyInput.value = '';
                } catch (error) {
                    console.error("Fehler beim Erstellen des Benutzers (setDoc):", error); // Debugging
                    alertUser("Fehler beim Erstellen des Benutzers.", "error");
                }
            }
        });
        saveNewUserButton.dataset.listenerAttached = 'true';
    } const notRegisteredToggle = area.querySelector('#notRegisteredToggle');
    if (notRegisteredToggle && !notRegisteredToggle.dataset.listenerAttached) {
        notRegisteredToggle.addEventListener('click', () => {
            area.querySelector('#notRegisteredList').classList.toggle('hidden');
            area.querySelector('#notRegisteredToggleIcon').classList.toggle('rotate-180');
        });
        notRegisteredToggle.dataset.listenerAttached = 'true';
    }

    // Listener für Berechtigungstyp-Änderung (innerhalb der Karten)
    // Diese müssen bei jedem Render neu hinzugefügt werden
    area.querySelectorAll('.perm-type-toggle, .user-role-select, .custom-perm-checkbox, .display-role-select').forEach(el => {
        if (!el.dataset.changeListenerAttached) {
            el.addEventListener('change', (e) => {
                const container = e.target.closest('[data-userid]');
                if (!container) return;
                if (e.target.classList.contains('perm-type-toggle')) {
                    container.querySelector('.role-selection-area').classList.toggle('hidden', e.target.value !== 'role');
                    container.querySelector('.individual-perms-area').classList.toggle('hidden', e.target.value !== 'individual');
                }
                const saveBtnContainer = container.querySelector('.save-perms-container');
                if (saveBtnContainer) saveBtnContainer.classList.remove('hidden');
            });
            el.dataset.changeListenerAttached = 'true';
        }
    });

}

function toggleNewUserRoleField() {
    const typeSelect = document.getElementById('newUserPermissionType'); // 
    const roleSelect = document.getElementById('newUserRole'); // [cite: 770]
    const keyInput = document.getElementById('newUserKey'); // [cite: 770]
    const keyWrapper = document.getElementById('newUserKeyWrapper'); // [cite: 771]

    if (!typeSelect || !roleSelect || !keyInput || !keyWrapper) return; // [cite: 772]

    const selectedType = typeSelect.value; // [cite: 773]
    // Rollenauswahlfeld anzeigen/verstecken
    // Hides role select if type is NOT 'role' (includes 'not_registered')
    roleSelect.style.display = (selectedType === 'role') ? 'block' : 'none'; // 

    // Passwortfeld optional/versteckt für nicht registrierte
    keyInput.disabled = (selectedType === 'not_registered'); // 
    keyInput.required = !(selectedType === 'not_registered'); // 

    // Hides the password field's container if type IS 'not_registered'
    keyWrapper.style.display = (selectedType === 'not_registered') ? 'none' : 'block'; // 


    if (selectedType === 'not_registered') keyInput.value = ''; // [cite: 778]
}

function renderAdminUserDetails(userId) {
    const detailsArea = document.getElementById('admin-user-details-area');
    const adminUser = USERS[userId];

    if (detailsArea.dataset.editingUser === userId) {
        detailsArea.innerHTML = '';
        delete detailsArea.dataset.editingUser;
        return;
    }

    document.querySelectorAll('.edit-admin-user-btn').forEach(b => b.closest('.p-2').classList.remove('bg-indigo-100'));
    adminRightsArea.querySelector(`.edit-admin-user-btn[data-userid="${userId}"]`).closest('.p-2').classList.add('bg-indigo-100');


    detailsArea.dataset.editingUser = userId;

    const perms = adminUser.adminPermissions || {};
    const approvalPerms = perms.approvalRequired || {};
    const type = adminUser.permissionType || 'individual';

    let roleOptions = Object.values(ADMIN_ROLES)
        .filter(r => r.id !== 'LEERE_ROLLE')
        .map(r => `<option value="${r.id}" ${adminUser.assignedAdminRoleId === r.id ? 'selected' : ''}>${r.name}</option>`)
        .join('');
    detailsArea.innerHTML = `
        <div class="p-4 border-t-4 border-indigo-500 rounded-xl bg-gray-50 mt-4 relative shadow-lg">
            <button id="close-details-btn" class="absolute top-2 right-3 text-2xl font-bold text-gray-400 hover:text-red-600">&times;</button>
            <p class="font-bold text-lg text-indigo-800">${adminUser.name} bearbeiten</p>
            
            <div class="mt-4 pt-3 border-t">
                <label class="block text-sm font-medium text-gray-700 mb-2">Berechtigungs-Typ</label>
                <div class="flex items-center gap-4">
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="individual" class="perm-type-toggle" data-userid="${userId}" ${type === 'individual' ? 'checked' : ''}> <span class="ml-2">Individuell</span></label>
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="role" class="perm-type-toggle" data-userid="${userId}" ${type === 'role' ? 'checked' : ''}> <span class="ml-2">Rolle</span></label>
                </div>
            </div>

            <div class="role-selection-area mt-2 ${type === 'role' ? '' : 'hidden'}">
                <select id="assigned-admin-role-select" class="w-full p-2 border rounded-lg bg-white text-sm" data-userid="${userId}">${roleOptions}</select>
            </div>

            <div class="individual-perms-area mt-3 space-y-3 ${type === 'individual' ? '' : 'hidden'}">
                <div class="p-3 border rounded-lg bg-white">
                    <h5 class="font-semibold text-sm mb-2 text-gray-600">Sichtbarkeit von Admin-Menüpunkten</h5>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeePasswords" ${perms.canSeePasswords ? 'checked' : ''}> <span>Passwörter</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeApprovals" ${perms.canSeeApprovals ? 'checked' : ''}> <span>Genehmigungen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeRoleManagement" ${perms.canSeeRoleManagement ? 'checked' : ''}> <span>Rollenverwaltung</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canViewLogs" ${perms.canViewLogs ? 'checked' : ''}> <span>Protokolle</span></label>
                        <label class="flex items-center col-span-2 gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeUsers" ${perms.canSeeUsers ? 'checked' : ''}> <span>Benutzersteuerung</span></label>

                        <div class="col-span-2 mt-2 pt-2 border-t">
                            <label class="flex items-center gap-2 font-semibold"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeMainFunctions" ${perms.canSeeMainFunctions ? 'checked' : ''}> <span>Adminfunktionen Hauptseite</span></label>
                            <div class="pl-6 mt-1 space-y-1">
                                <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canUseMainPush" ${perms.canUseMainPush ? 'checked' : ''}> <span>-> Push</span></label>
                                <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canUseMainEntrance" ${perms.canUseMainEntrance ? 'checked' : ''}> <span>-> Eingang</span></label>
                                <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canUseMainChecklist" ${perms.canUseMainChecklist ? 'checked' : ''}> <span>-> Checkliste</span></label>
                            </div>
                        </div>
                    </div>
                    <div class="pl-6 mt-3 pt-3 border-t border-gray-200 space-y-3">
                        <h5 class="font-semibold text-sm mb-2 text-gray-500">Aktionen in "Benutzersteuerung"</h5>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canCreateUser" ${perms.canCreateUser ? 'checked' : ''}> <span>Benutzer anlegen</span></label>
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canDeleteUser" ${perms.canDeleteUser ? 'checked' : ''}> <span>Benutzer löschen</span></label>
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canRenameUser" ${perms.canRenameUser ? 'checked' : ''}> <span>Benutzer umbenennen</span></label>
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canToggleUserActive" ${perms.canToggleUserActive ? 'checked' : ''}> <span>Benutzer ent-/sperren</span></label>
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canChangeUserPermissionType" ${perms.canChangeUserPermissionType ? 'checked' : ''}> <span>Berechtigungs-Typ ändern</span></label>
                        </div>
                        <h5 class="font-semibold text-sm mb-2 mt-3 text-gray-500">Rechte in "Rollenverwaltung"</h5>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canEditUserRoles" ${perms.canEditUserRoles ? 'checked' : ''}> <span>Darf Benutzer-Rollen bearbeiten</span></label>
                        </div>
                            <h5 class="font-semibold text-sm mb-2 mt-3 text-gray-500">Rechte in "Protokoll History"</h5>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeSysadminLogs" ${perms.canSeeSysadminLogs ? 'checked' : ''}> <span>Darf Sysadmin-Einträge sehen</span></label>
                        </div>
                    </div>
                </div>
                <div class="p-3 border rounded-lg bg-white">
                    <h5 class="font-semibold text-sm mb-2 text-gray-600">Genehmigungsprozess</h5>
                    <p class="text-xs text-gray-500 mb-3">Wenn hier ein Haken gesetzt ist, muss die jeweilige Aktion von einem Systemadmin genehmigt werden.</p>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="setAdminStatus" ${approvalPerms.setAdminStatus ? 'checked' : ''}> <span>Admin-Status setzen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="createUser" ${approvalPerms.createUser ? 'checked' : ''}> <span>Benutzer anlegen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="deleteUser" ${approvalPerms.deleteUser ? 'checked' : ''}> <span>Benutzer löschen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="renameUser" ${approvalPerms.renameUser ? 'checked' : ''}> <span>Benutzer umbenennen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="toggleUserActive" ${approvalPerms.toggleUserActive ? 'checked' : ''}> <span>Benutzer ent-/sperren</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="changeUserPermissionType" ${approvalPerms.changeUserPermissionType ? 'checked' : ''}> <span>Berechtigungs-Typ ändern</span></label>
                    </div>
                </div>
            </div>
            
            <div class="mt-4 pt-4 border-t flex justify-end">
                <button id="save-admin-details-btn" data-userid="${userId}" class="py-2 px-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition">Änderungen speichern</button>
            </div>
        </div>
    `;
    detailsArea.querySelector('#close-details-btn').addEventListener('click', () => {
        detailsArea.innerHTML = '';
        delete detailsArea.dataset.editingUser;
        document.querySelectorAll('.edit-admin-user-btn').forEach(b => b.closest('.p-2').classList.remove('bg-indigo-100'));
    });
    detailsArea.querySelectorAll('.perm-type-toggle').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const type = e.target.value;
            const card = e.target.closest('.p-4');
            card.querySelector('.role-selection-area').classList.toggle('hidden', type !== 'role');
            card.querySelector('.individual-perms-area').classList.toggle('hidden', type !== 'individual');
        });
    });
    detailsArea.querySelector('#save-admin-details-btn').addEventListener('click', async (e) => {
        const userId = e.currentTarget.dataset.userid;
        const container = e.currentTarget.closest('.p-4');

        const selectedType = container.querySelector('input[name^="perm-type-"]:checked').value;
        const updateData = {
            permissionType: selectedType
        };

        if (selectedType === 'role') {
            updateData.assignedAdminRoleId = container.querySelector('#assigned-admin-role-select').value;
            updateData.adminPermissions = {};
        } else {
            const permissions = {};
            container.querySelectorAll('.admin-perm-cb').forEach(cb => {
                permissions[cb.dataset.perm] = cb.checked;
            });

            const approvalRequired = {};
            container.querySelectorAll('.approval-cb').forEach(cb => {
                approvalRequired[cb.dataset.perm] = cb.checked;
            });
            permissions.approvalRequired = approvalRequired;

            updateData.adminPermissions = permissions;
            updateData.assignedAdminRoleId = null;
        }

        await updateDoc(doc(usersCollectionRef, userId), updateData);
        alertUser("Änderungen gespeichert!", "success");

        setTimeout(async () => {
            await renderAdminRightsManagement();
            if (document.getElementById('admin-user-details-area')) {
                renderAdminUserDetails(userId);
            }
        }, 200);
    });

    // Stellt sicher, dass die Abhängigkeitslogik für die Checkboxen aktiv ist
    setupPermissionDependencies(detailsArea);
}
