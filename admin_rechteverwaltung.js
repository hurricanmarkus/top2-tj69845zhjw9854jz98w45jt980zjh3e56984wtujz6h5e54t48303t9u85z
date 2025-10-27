import { db, adminRolesCollectionRef, ADMIN_ROLES, USERS, alertUser } from './haupteingang.js'; // ADMIN_ROLES hinzugefügt
import { logAdminAction } from './admin_protokollHistory.js';
import { doc, updateDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

function setupPermissionDependencies(container) {
    const mainToggle = container.querySelector('[data-perm="canSeeMainFunctions"]');
    const subToggles = [
        container.querySelector('[data-perm="canUseMainPush"]'),
        container.querySelector('[data-perm="canUseMainEntrance"]'),
        container.querySelector('[data-perm="canUseMainChecklist"]')
    ];

    if (!mainToggle) return;

    const updateSubToggles = () => {
        const isEnabled = mainToggle.checked;
        subToggles.forEach(toggle => {
            if (toggle) {
                toggle.disabled = !isEnabled;
                if (!isEnabled) {
                    toggle.checked = false;
                }
            }
        });
    };

    mainToggle.addEventListener('change', updateSubToggles);
    updateSubToggles(); // Einmal beim Laden ausführen, um den initialen Status zu setzen
}

export async function renderAdminRightsManagement() {
    // Hole das Container-Element hier, um sicherzugehen, dass es verfügbar ist
    const adminRightsArea = document.getElementById('adminRightsArea');
    if (!adminRightsArea) {
        console.error("renderAdminRightsManagement: Container #adminRightsArea nicht gefunden.");
        return;
    }

    // --- KORREKTUR: Verwende 'role' statt 'sysAdmin' ---
    let sysAdminListHTML = '<h4 class="text-lg font-semibold text-gray-700 mb-2">Übersicht Admin-Rollen</h4>'; // Titel angepasst
    if (Object.keys(ADMIN_ROLES || {}).length > 0) {
        sysAdminListHTML += '<div class="space-y-1">';
        Object.values(ADMIN_ROLES || {}).forEach(role => { // Variable heißt jetzt 'role'
            // Prüfen, ob die aktuelle Rolle (role.id) die Rolle des aktuellen Benutzers ist.
            // Annahme: currentUser.assignedAdminRoleId enthält die ID der zugewiesenen Admin-Rolle für Admins
            // Annahme: SYSTEMADMIN hat keine zugewiesene Rolle, sondern ist direkt SYSTEMADMIN
            let isSelfRole = false;
            if (currentUser.role === 'ADMIN' && currentUser.assignedAdminRoleId === role.id) {
                isSelfRole = true;
            } else if (currentUser.role === 'SYSTEMADMIN' && role.id === 'SYSTEMADMIN') { // Prüfen, ob die Rolle SYSTEMADMIN ist (falls diese ID existiert)
                isSelfRole = true; // Oder eine andere Logik, falls SYSTEMADMIN nicht in ADMIN_ROLES ist
            }
             // Oder Prüfen, ob role.id === currentUser.role, falls die IDs übereinstimmen
            // const isSelf = role.id === currentUser.role; // Alternative Prüfung

            const currentUserLabel = isSelfRole ? '<span class="bg-indigo-100 text-indigo-800 font-bold text-xs px-2 py-1 rounded-full ml-2">AKTUELL</span>' : '';
            // Verwende role.name statt sysAdmin.name
            sysAdminListHTML += `<p class="p-2 bg-gray-100 rounded-md text-sm">${role.name} ${currentUserLabel}</p>`;
        });
        sysAdminListHTML += '</div>';
    } else {
        sysAdminListHTML += '<p class="text-sm text-gray-500">Keine Admin-Rollen gefunden.</p>';
    }
    // --- ENDE KORREKTUR ---

    adminRightsArea.innerHTML = `
             <h3 class="text-xl font-bold text-gray-800 mb-4">Admin-Benutzer verwalten</h3>
             <div class="grid grid-cols-2 gap-4">
                 <div>
                     <h4 class="font-semibold text-lg text-center mb-2 pb-2 border-b">Rolle</h4>
                     <div id="admin-role-users" class="space-y-2"></div>
                 </div>
                 <div>
                     <h4 class="font-semibold text-lg text-center mb-2 pb-2 border-b">Individuell</h4>
                     <div id="admin-individual-users" class="space-y-2"></div>
                 </div>
             </div>
             <div class="mt-6 border-t pt-4">
                 ${sysAdminListHTML}
             </div>
             <div id="admin-user-details-area" class="mt-6"></div>
           `;

    // --- Listener für Edit-Buttons hinzufügen ---
    // Wichtig: Wir müssen sicherstellen, dass die Funktion renderAdminUserDetails existiert und importiert ist.
    // Dieser Teil setzt voraus, dass renderAdminUserDetails korrekt implementiert ist.
    const editButtons = adminRightsArea.querySelectorAll('.edit-admin-user-btn');
    if (editButtons.length > 0) { // Nur hinzufügen, wenn es Buttons gibt
        // Prüfen, ob Listener schon dran sind (optional, aber sicherer)
        if (!adminRightsArea.dataset.editListenersAttached) {
            editButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const userId = e.currentTarget.dataset.userid;
                    if (typeof renderAdminUserDetails === 'function') { // Prüfen, ob die Funktion existiert
                        renderAdminUserDetails(userId);
                    } else {
                        console.error("Funktion renderAdminUserDetails ist nicht definiert oder importiert.");
                    }
                });
            });
            adminRightsArea.dataset.editListenersAttached = 'true'; // Markieren
        }
    }


    // --- Admin-Benutzer auflisten (Logik bleibt größtenteils gleich) ---
    const adminUsers = Object.values(USERS || {}).filter(user => user.role === 'ADMIN' || user.role === 'SYSTEMADMIN');

    const roleUsersContainer = adminRightsArea.querySelector('#admin-role-users');
    const individualUsersContainer = adminRightsArea.querySelector('#admin-individual-users');

    // Container leeren, bevor neue Elemente hinzugefügt werden
    if (roleUsersContainer) roleUsersContainer.innerHTML = '';
    if (individualUsersContainer) individualUsersContainer.innerHTML = '';


    if (adminUsers.length === 0) {
         if (roleUsersContainer) roleUsersContainer.innerHTML = '<p class="text-center text-sm text-gray-500">Keine Admins gefunden.</p>';
    } else {
        adminUsers.forEach(adminUser => {
            const permissionType = adminUser.role === 'SYSTEMADMIN' ? 'role' : (adminUser.permissionType || 'role');
            const canBeEdited = adminUser.role !== 'SYSTEMADMIN';

            const userCard = document.createElement('div');
            userCard.className = 'p-2 border rounded-lg bg-white shadow-sm flex justify-between items-center';

            let userInfoHTML;
            let targetContainer = null;

            if (permissionType === 'role') {
                 // Verwende ROLES für den Namen der Benutzerrolle (ADMIN)
                 // oder ADMIN_ROLES für den Namen der zugewiesenen Admin-Rolle
                 let roleName = 'Unbekannt';
                 if (adminUser.role === 'SYSTEMADMIN') {
                     roleName = 'Systemadmin'; // Fester Name für Systemadmin
                 } else if (adminUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                     roleName = ADMIN_ROLES[adminUser.assignedAdminRoleId].name; // Name der Admin-Rolle
                 } else if (ROLES && ROLES[adminUser.role]) {
                     roleName = ROLES[adminUser.role].name; // Fallback auf Benutzerrolle (sollte 'Admin' sein)
                 }

                 userInfoHTML = `<div><p class="font-bold text-gray-800">${adminUser.name}</p><p class="text-xs text-indigo-600 font-medium">${roleName}</p></div>`;
                 targetContainer = roleUsersContainer;
            } else { // Individuell
                 userInfoHTML = `<div><p class="font-bold text-gray-800">${adminUser.name}</p></div>`;
                 targetContainer = individualUsersContainer;
            }

            userCard.innerHTML = `
                     ${userInfoHTML}
                     ${canBeEdited ? `
                     <button class="edit-admin-user-btn p-1 text-gray-500 hover:text-indigo-600" data-userid="${adminUser.id}" title="Bearbeiten">
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>
                     </button>` : ''}
                   `;

             // Füge die Karte zum richtigen Container hinzu
             if (targetContainer) {
                 targetContainer.appendChild(userCard);
             } else {
                 console.warn(`Konnte Container für Admin-User ${adminUser.name} (Typ: ${permissionType}) nicht finden.`);
             }
        });

         // Füge die Listener für die neu erstellten Edit-Buttons hinzu (erneut, da sie jetzt im DOM sind)
         adminRightsArea.querySelectorAll('.edit-admin-user-btn').forEach(button => {
             // Prüfe, ob schon ein Listener dran ist, um Verdopplung zu vermeiden
             if (!button.dataset.listenerAttached) {
                 button.addEventListener('click', (e) => {
                     const userId = e.currentTarget.dataset.userid;
                     if (typeof renderAdminUserDetails === 'function') {
                         renderAdminUserDetails(userId);
                     } else {
                         console.error("Funktion renderAdminUserDetails ist nicht definiert oder importiert.");
                     }
                 });
                 button.dataset.listenerAttached = 'true';
             }
         });

    }
}