// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { ROLES, alertUser, currentUser, GUEST_MODE, adminSettings, CHECKLISTS, ADMIN_STORAGE_KEY, USERS, navigate } from './haupteingang.js';
// ENDE-ZIKA //

export function checkCurrentUserValidity() {
    // Dieser "Spion" sagt uns, wann die Funktion aufgerufen wird.
    console.log("--- Prüfe Benutzerberechtigungen ---");

    if (Object.keys(USERS).length === 0 || Object.keys(ROLES).length === 0) {
        return;
    }

    const storedKey = localStorage.getItem(ADMIN_STORAGE_KEY);
    const user = USERS[storedKey];

    // Dieser Spion zeigt uns das komplette Benutzer-Objekt, mit dem wir arbeiten.
    if (user) {
        console.log("Aktuelles Benutzer-Objekt aus der Datenbank:", user);
    }

    if (user && user.isActive) {
        let userPermissions = [];
        let permissionSource = "Unbekannt"; // Eine Notiz, woher die Rechte kommen.

        if (user.role === 'SYSTEMADMIN') {
            userPermissions = ['ENTRANCE', 'PUSHOVER', 'CHECKLIST', 'CHECKLIST_SWITCH', 'CHECKLIST_SETTINGS', 'ESSENSBERECHNUNG'];
            permissionSource = "Feste Regel für SYSTEMADMIN";
        } else if (user.role === 'ADMIN') {
            userPermissions = ROLES['ADMIN']?.permissions || [];
            permissionSource = "Aus der Rollenverwaltung für 'ADMIN'";
            // Dieser Spion zeigt uns, was genau für die ADMIN-Rolle gefunden wurde.
            console.log("Für ADMIN-Rolle gefundene Rechte:", ROLES['ADMIN']?.permissions);

        } else if (user.permissionType === 'individual') {
            userPermissions = user.customPermissions || [];
            permissionSource = "Aus den individuellen Einstellungen des Benutzers";

        } else if (user.role && ROLES[user.role]) {
            userPermissions = ROLES[user.role].permissions || [];
            permissionSource = `Aus der Rollenverwaltung für '${user.role}'`;
        }

        // Dieser Spion gibt das Endergebnis aus.
        console.log(`Quelle der Berechtigungen: ${permissionSource}`);
        console.log("Final zugewiesene Berechtigungen:", userPermissions);

        currentUser = {
            mode: storedKey,
            displayName: user.name,
            role: user.role,
            permissions: userPermissions
        };
    } else {
        if (currentUser.mode !== GUEST_MODE) {
            switchToGuestMode(true, "Ihr Profil ist nicht mehr gültig oder wurde deaktiviert.");
        } else if (storedKey && USERS[storedKey] && !USERS[storedKey].isActive) {
            switchToGuestMode(true, "Ihr Profil wurde deaktiviert.");
        } else {
            switchToGuestMode(false);
        }
    }
    updateUIForMode();

    const activeView = document.querySelector('.view.active');
    if (!activeView) return;
    const isAdminView = activeView.id === 'adminView';
    if (isAdminView && !(currentUser.role === 'ADMIN' || currentUser.role === 'SYSTEMADMIN')) {
        alertUser("Ihre Administrator-Rechte wurden entzogen.", "error");
        navigate('home');
    }
}

export function switchToGuestMode(showNotification = true, message = "Abgemeldet. Modus ist nun 'Gast'.") {
Object.keys(currentUser).forEach(key => delete currentUser[key]);
Object.assign(currentUser, {
    displayName: GUEST_MODE,
    mode: 'guest',
    role: 'GUEST',
    permissions: []
});
localStorage.removeItem(ADMIN_STORAGE_KEY);
    updateUIForMode();
    navigate('home');
    if (showNotification) alertUser(message, 'success');
}

export function updateUIForMode() {
    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    let effectiveAdminPerms = {};
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

    document.querySelectorAll('[data-permission]').forEach(card => {
        const permission = card.dataset.permission;
        if (permission === 'CHECKLIST') {
            card.style.display = currentUser.permissions.includes('CHECKLIST') ? 'block' : 'none';
        } else {
            card.style.display = currentUser.permissions.includes(permission) ? 'flex' : 'none';
        }
    });

    const settingsButton = document.getElementById('mainSettingsButton');
    const adminButton = document.getElementById('mainAdminButton');
    settingsButton.style.display = 'none';
    adminButton.style.display = 'none';

    if (document.getElementById('homeView').classList.contains('active')) {
        if (isSysAdmin) {
            adminButton.style.display = 'block';
            adminButton.textContent = 'SYS-ADMIN';
            adminButton.className = 'bg-purple-800 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg hover:bg-opacity-80 transition z-10';
        } else if (isAdmin) {
            adminButton.style.display = 'block';
            adminButton.textContent = 'ADMIN';
            adminButton.className = 'bg-red-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg hover:bg-red-700 transition z-10';
        }

        // --- START DER ÄNDERUNG ---
        // Prüft, ob der Benutzer die Passwort-Sektion sehen darf.
        const canSeePasswords = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeePasswords);

        // Der "Einstellungen"-Button wird angezeigt, wenn der Benutzer angemeldet ist UND die Passwort-Sektion NICHT sehen darf.
        // Das gilt für normale Benutzer und für Admins ohne das entsprechende Recht.
        if (currentUser.mode !== GUEST_MODE && !canSeePasswords) {
            settingsButton.style.display = 'block';
        }
        // --- ENDE DER ÄNDERUNG ---
    }

    const checklistSettingsCard = document.getElementById('checklistSettingsCard');
    if (checklistSettingsCard) {
        checklistSettingsCard.style.display = currentUser.permissions.includes('CHECKLIST_SETTINGS') ? 'flex' : 'none';
    }

    adminRightsSection.style.display = isSysAdmin ? 'block' : 'none';
    roleManagementSection.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeeRoleManagement) ? 'block' : 'none';
    passwordSection.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeePasswords) ? 'block' : 'none';
    userSection.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeeUsers) ? 'block' : 'none';

    // --- START DER ÄNDERUNG ---
    // Die Sichtbarkeit dieses Menüpunkts wird jetzt durch die Rechte gesteuert.
    const mainFunctionsSection = document.getElementById('mainFunctionsSection');
    mainFunctionsSection.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeeMainFunctions) ? 'block' : 'none';
    // --- ENDE DER ÄNDERUNG ---

    approvalProcessSection.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeeApprovals) ? 'block' : 'none';
    protocolHistorySection.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canViewLogs) ? 'block' : 'none';

    const guestPrompt = document.getElementById('guestPrompt');
    const noPermissionPrompt = document.getElementById('noPermissionPrompt');
    guestPrompt.style.display = 'none';
    noPermissionPrompt.style.display = 'none';
    noAdminPermissionsPrompt.style.display = 'none';

    if (currentUser.mode === GUEST_MODE) {
        guestPrompt.style.display = 'block';
    } else if (currentUser.permissions.length === 0 && !isAdmin && !isSysAdmin) {
        noPermissionPrompt.style.display = 'block';
    }

    if (isAdmin && document.getElementById('adminView').classList.contains('active')) {
        const hasAnyPermission = Object.values(effectiveAdminPerms).some(perm => perm === true);
        noAdminPermissionsPrompt.style.display = hasAnyPermission ? 'none' : 'block';
    }

    const footerUser = document.getElementById('footerUser');
    const footerLogout = document.getElementById('footerLogout');
    footerUser.innerHTML = '';
    footerLogout.innerHTML = '';

    if (currentUser.mode === GUEST_MODE) {
        footerUser.textContent = 'Nicht angemeldet';
        const loginButton = document.createElement('button');
        loginButton.textContent = 'Anmelden';
        loginButton.className = 'font-bold text-indigo-400 hover:text-indigo-300';
        loginButton.onclick = () => userSelectionModal.style.display = 'flex';
        footerLogout.appendChild(loginButton);
    } else {
        const user = USERS[currentUser.mode];
        const effectiveRoleId = user?.role || user?.displayRole;
        const roleName = ROLES[effectiveRoleId]?.name || 'Unbekannt';

        let roleColor = 'text-gray-300';
        if (currentUser.role === 'SYSTEMADMIN') roleColor = 'text-purple-400 font-bold';
        if (currentUser.role === 'ADMIN') roleColor = 'text-red-400 font-bold';

        // --- ÄNDERUNG HIER ---
        const realNamePart = user?.realName ? `<span class="text-gray-400 italic text-xs ml-1">(${user.realName})</span>` : '';
        footerUser.innerHTML = `${currentUser.displayName} ${realNamePart} <span class="mx-1 text-gray-400">❖</span> <span class="${roleColor} italic">(${roleName})</span>`;
        // --- ENDE ÄNDERUNG ---

        footerUser.innerHTML = `${currentUser.displayName} <span class="mx-1 text-gray-400">❖</span> <span class="${roleColor} italic">(${roleName})</span>`;

        const logoutButton = document.createElement('button');
        logoutButton.id = 'logoutButton';
        logoutButton.textContent = 'Ausloggen';
        logoutButton.className = 'font-bold text-white hover:text-gray-300';
        footerLogout.appendChild(logoutButton);

        logoutButton.onclick = () => {
            footerLogout.innerHTML = '';
            const confirmationText = document.createElement('span');
            confirmationText.className = 'font-bold mr-3';
            confirmationText.textContent = 'Sicher ausloggen?';
            const noButton = document.createElement('button');
            noButton.textContent = 'NEIN';
            noButton.className = 'font-bold text-gray-300 hover:text-white mr-3';
            noButton.onclick = () => updateUIForMode();
            const yesButton = document.createElement('button');
            yesButton.textContent = 'JA';
            yesButton.className = 'font-bold text-red-400 hover:text-red-300';
            yesButton.onclick = () => switchToGuestMode();
            footerLogout.append(confirmationText, noButton, yesButton);
        };
    }

    const checklistNameDisplay = document.getElementById('current-checklist-name-display');
    if (checklistNameDisplay) {
        const defaultListId = adminSettings.defaultChecklistId;
        const checklistName = CHECKLISTS[defaultListId]?.name;
        if (checklistName) {
            checklistNameDisplay.textContent = checklistName;
        } else {
            checklistNameDisplay.textContent = '(Keine Liste gewählt)';
        }
    }
}
