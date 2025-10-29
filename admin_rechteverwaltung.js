import { db, adminRolesCollectionRef, ADMIN_ROLES, USERS, alertUser, currentUser, ROLES } from './haupteingang.js'; // ROLES hinzugefügt
import { logAdminAction } from './admin_protokollHistory.js';
import { doc, updateDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// KORREKTUR: Import hinzugefügt, um den Zirkelbezug aufzulösen
import { renderAdminUserDetails } from './admin_benutzersteuerung.js'; 

export function setupPermissionDependencies(container) {
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
    const adminRightsArea = document.getElementById('adminRightsArea');
    if (!adminRightsArea) {
        console.error("renderAdminRightsManagement: Container #adminRightsArea nicht gefunden.");
        return;
    }

    // --- Liste der Systemadmin-BENUTZER (Logik bleibt gleich) ---
    let sysAdminListHTML = '<h4 class="text-lg font-semibold text-gray-700 mb-2">Übersicht Systemadmins</h4>'; 
    const systemAdmins = Object.values(USERS || {}).filter(user => user.role === 'SYSTEMADMIN');

    if (systemAdmins.length > 0) {
        sysAdminListHTML += '<div class="space-y-1">';
        systemAdmins.forEach(sysAdmin => {
            const isSelf = sysAdmin.id === currentUser.mode; 
            const currentUserLabel = isSelf ? '<span class="bg-indigo-100 text-indigo-800 font-bold text-xs px-2 py-1 rounded-full ml-2">AKTUELL</span>' : '';
            // Sicherstellen, dass sysAdmin.name existiert
            sysAdminListHTML += `<p class="p-2 bg-gray-100 rounded-md text-sm">${sysAdmin.name || 'Unbenannter SysAdmin'} ${currentUserLabel}</p>`; 
        });
        sysAdminListHTML += '</div>';
    } else {
        sysAdminListHTML += '<p class="text-sm text-gray-500">Keine Systemadmins gefunden.</p>';
    }

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
             <div id="admin-user-details-area" class="mt-6 hidden"></div> 
           `;

    // --- Korrigierte Filterlogik (bleibt gleich) ---
    const adminUsers = Object.values(USERS || {}).filter(user => 
        user.role === 'ADMIN' || 
        (user.permissionType === 'individual' && user.displayRole === 'ADMIN')
    );

    const roleUsersContainer = adminRightsArea.querySelector('#admin-role-users');
    const individualUsersContainer = adminRightsArea.querySelector('#admin-individual-users');

    if (roleUsersContainer) roleUsersContainer.innerHTML = '';
    if (individualUsersContainer) individualUsersContainer.innerHTML = '';

    if (adminUsers.length === 0) {
         const msg = '<p class="text-center text-sm text-gray-500">Keine Admins gefunden.</p>';
         if (roleUsersContainer) roleUsersContainer.innerHTML = msg;
         if (individualUsersContainer) individualUsersContainer.innerHTML = msg;
    } else {
        adminUsers.forEach(adminUser => {
            const adminPermType = adminUser.adminPermissionType || 'role';
            const targetType = adminPermType === 'role' ? 'role' : 'individual';
            const canBeEdited = currentUser.role === 'SYSTEMADMIN'; 
            const userCard = document.createElement('div');
            userCard.className = 'p-2 border rounded-lg bg-white shadow-sm flex justify-between items-center';
            let userInfoHTML;
            let targetContainer = targetType === 'role' ? roleUsersContainer : individualUsersContainer;
            let roleName = 'Admin'; 

            if (targetType === 'role') {
                 if (adminUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                     roleName = ADMIN_ROLES[adminUser.assignedAdminRoleId].name;
                 }
                 userInfoHTML = `<div><p class="font-bold text-gray-800">${adminUser.name || 'Unbekannt'}</p><p class="text-xs text-indigo-600 font-medium">${roleName}</p></div>`;
            } else { // Individuell
                 const displayRoleName = adminUser.displayRole || 'Individuell';
                 userInfoHTML = `<div><p class="font-bold text-gray-800">${adminUser.name || 'Unbekannt'}</p><p class="text-xs text-indigo-600 font-medium">${displayRoleName}</p></div>`;
            }

            userCard.innerHTML = `
                     ${userInfoHTML}
                     ${canBeEdited ? `
                     <button class="edit-admin-user-btn p-1 text-gray-500 hover:text-indigo-600" data-userid="${adminUser.id}" title="Admin-Rechte bearbeiten">
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>
                     </button>` : ''}
                   `;

             if (targetContainer) {
                 targetContainer.appendChild(userCard);
             }
        });

        // --- KORREKTUR DES EVENT LISTENERS ---
        // Listener wird an den übergeordneten Container gehängt (Event Delegation)
        // Aber er prüft jetzt explizit, ob auf den Button geklickt wurde.
        if (!adminRightsArea.dataset.editListenerAttached) {
             adminRightsArea.addEventListener('click', (e) => {
                 // Finde den geklickten Button ODER sein SVG-Icon
                 const editButton = e.target.closest('.edit-admin-user-btn'); 
                 
                 // Nur fortfahren, wenn wirklich auf den Button geklickt wurde
                 if (editButton) { 
                     const userId = editButton.dataset.userid;
                     console.log(`Edit button clicked for user: ${userId}`); // Debug
                     if (typeof renderAdminUserDetails === 'function') {
                         renderAdminUserDetails(userId); 
                     } else {
                         console.error("Funktion renderAdminUserDetails ist nicht definiert oder importiert.");
                     }
                 } else {
                     // console.log("Click detected in adminRightsArea, but not on an edit button."); // Optional: Debug
                 }
             });
             adminRightsArea.dataset.editListenerAttached = 'true'; // Markieren, dass Listener hinzugefügt wurde
        }
    }
}