// // @ts-check
import { db, adminRolesCollectionRef, ADMIN_ROLES, USERS, alertUser, currentUser, ROLES } from './haupteingang.js'; // ROLES hinzugefügt
import { logAdminAction } from './admin_protokollHistory.js';
import { doc, updateDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// KORREKTUR: Import hinzugefügt, um den Zirkelbezug aufzulösen
import { renderAdminUserDetails } from './admin_benutzersteuerung.js'; 

export function setupPermissionDependencies(container) {
    
    // Wir erstellen eine kleine, wiederverwendbare "Helfer-im-Helfer"-Funktion,
    // die die eigentliche Logik enthält.
    // Sie nimmt den "Hauptschalter" (mainSelector) und die "Unter-Schalter" (subSelectors).
    const setupToggleLogic = (mainSelector, subSelectors) => {
        
        // 1. Finde den Haupt-Schalter (z.B. "Aktuelle Checkliste")
        const mainToggle = container.querySelector(mainSelector);
        
        // 2. Wenn es diesen Schalter im aktuellen Fenster nicht gibt, höre sofort auf.
        if (!mainToggle) return; 

        // 3. Finde alle Unter-Schalter (z.B. "Listen umschalten")
        const subToggles = subSelectors.map(sel => container.querySelector(sel)).filter(Boolean); // .filter(Boolean) entfernt alle, die nicht gefunden wurden

        // 4. Wenn es keine Unter-Schalter gibt, höre auf.
        if (subToggles.length === 0) return; 

        // 5. Das ist die Funktion, die prüft, ob der Haken gesetzt ist oder nicht.
        const updateSubToggles = () => {
            // Wir prüfen auch, ob der Hauptschalter selbst deaktiviert ist
            const isEnabled = mainToggle.checked && !mainToggle.disabled; 
            
            subToggles.forEach(toggle => {
                // Setze den "disabled"-Status des Unter-Schalters auf das Gegenteil von "isEnabled"
                // (Wenn Haupt-Haken AN, ist disabled AUS)
                toggle.disabled = !isEnabled;
                
                // Wenn der Haupt-Haken AUSgeschaltet wird...
                if (!isEnabled) {
                    // ...muss auch der Haken beim Unter-Punkt entfernt werden.
                    toggle.checked = false;
                }
            });
        };

        // 6. Setze einen "Spion" (Event Listener) auf den Haupt-Schalter.
        // Jedes Mal, wenn du ihn anklickst, wird "updateSubToggles" ausgeführt.
        mainToggle.addEventListener('change', updateSubToggles);
        
        // 7. Führe die Funktion EINMAL beim Laden aus,
        // um den korrekten Start-Zustand herzustellen.
        updateSubToggles(); 
    };

    // ---
    // HIER WIRD DIE FUNKTION JETZT AUFGERUFEN:
    // ---

    // 1. Logik für ADMIN RECHTE (Hauptmenü -> Push, Eingang, Checkliste, TERMINPLANER, ZAHLUNGSVERWALTUNG)
    setupToggleLogic(
        '[data-perm="canSeeMainFunctions"]', // Hauptschalter
        [ // Unter-Schalter
            '[data-perm="canUseMainPush"]',
            '[data-perm="canUseMainEntrance"]',
            '[data-perm="canUseMainChecklist"]',
            '[data-perm="canUseMainTerminplaner"]',
            '[data-perm="canUseMainZahlungsverwaltung"]' // <-- NEU
        ]
    );

    // 2. (NEU) Logik für ADMIN RECHTE (Terminplaner -> Tokens)
    setupToggleLogic(
        '[data-perm="canUseMainTerminplaner"]', // Hauptschalter
        [ // Unter-Schalter
            '[data-perm="canSeePollToken"]',
            '[data-perm="canSeePollEditToken"]'
        ]
    );
    
    // 3. Logik für BENUTZERSTEUERUNG (Aktuelle Checkliste -> Umschalten, Einstellungen)
    setupToggleLogic(
        '[data-perm="CHECKLIST"]', // Hauptschalter
        [ // Unter-Schalter
            '[data-perm="CHECKLIST_SWITCH"]',
            '[data-perm="CHECKLIST_SETTINGS"]'
        ]
    );

    // 4. Logik für TERMINPLANER (Hauptansicht -> Erstellen)
    setupToggleLogic(
        '[data-perm="TERMINPLANER"]', // Hauptschalter
        [ // Unter-Schalter
            '[data-perm="TERMINPLANER_CREATE"]'
        ]
    );
    
    // 5. NEU: Logik für ZAHLUNGSVERWALTUNG (Hauptansicht -> Erstellen)
    setupToggleLogic(
        '[data-perm="ZAHLUNGSVERWALTUNG"]', // Hauptschalter (Benutzer-Rolle)
        [ // Unter-Schalter
            '[data-perm="ZAHLUNGSVERWALTUNG_CREATE"]'
        ]
    );
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
            sysAdminListHTML += `<p class="p-2 bg-gray-100 rounded-md text-sm">${sysAdmin.name} ${currentUserLabel}</p>`;
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
             <div id="admin-user-details-area" class="mt-6"></div>
           `;

    // --- KORRIGIERTE FILTERLOGIK ---
    const adminUsers = Object.values(USERS || {}).filter(user => 
        // WICHTIG: Filtere alle Benutzer, die entweder echte Admins sind oder als Admin angezeigt werden sollen.
        user.role === 'ADMIN' || 
        (user.permissionType === 'individual' && user.displayRole === 'ADMIN')
    );
    // SysAdmins sind bereits oben.

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
            
            // NEU: Bestimme den Admin-Berechtigungstyp aus dem dedizierten Feld
            const adminPermType = adminUser.adminPermissionType || 'role'; // <-- FIX: Nutzt neues Feld
            
            // NEU: Bestimme, ob die Karte in die 'Rolle'- oder 'Individuell'-Spalte soll
            const targetType = adminPermType === 'role' ? 'role' : 'individual';


            // SysAdmins dürfen Admins bearbeiten (hier sind nur Admins und Individuelle Admin-Displays)
            const canBeEdited = currentUser.role === 'SYSTEMADMIN'; 

            const userCard = document.createElement('div');
            userCard.className = 'p-2 border rounded-lg bg-white shadow-sm flex justify-between items-center';

            let userInfoHTML;
            let targetContainer = targetType === 'role' ? roleUsersContainer : individualUsersContainer;
            let roleName = 'Admin'; 

            if (targetType === 'role') {
                 // Zeige die zugewiesene Admin-Rolle an, falls vorhanden
                 if (adminUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                     roleName = ADMIN_ROLES[adminUser.assignedAdminRoleId].name;
                 }
                 userInfoHTML = `<div><p class="font-bold text-gray-800">${adminUser.name}</p><p class="text-xs text-indigo-600 font-medium">${roleName}</p></div>`;
            } else { // Individuell
                 // Wenn 'Individuell', zeige den Anzeigerollen-Typ oder "Individuell" an
                 const displayRoleName = adminUser.displayRole || 'Individuell';
                 userInfoHTML = `<div><p class="font-bold text-gray-800">${adminUser.name}</p><p class="text-xs text-indigo-600 font-medium">${displayRoleName}</p></div>`;
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

         // Füge die Listener für die neu erstellten Edit-Buttons hinzu
         adminRightsArea.querySelectorAll('.edit-admin-user-btn').forEach(button => {
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
