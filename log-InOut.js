// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { ROLES, alertUser, currentUser, GUEST_MODE, adminSettings, CHECKLISTS, ADMIN_STORAGE_KEY, USERS, navigate } from './haupteingang.js';
import { renderModalUserButtons } from './admin_benutzersteuerung.js';
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

        Object.keys(currentUser).forEach(key => delete currentUser[key]);
        // 2. Dann die neuen Eigenschaften hinzufügen
        Object.assign(currentUser, {
            mode: storedKey,
            displayName: user.name,
            role: user.role,
            permissions: userPermissions
        });
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
        mode: GUEST_MODE,
        role: 'GUEST',
        permissions: []
    });
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    updateUIForMode();
    navigate('home');
    if (showNotification) alertUser(message, 'success');
}

// Diese Funktion gehört in log-InOut.js
export function updateUIForMode() {
    const userMode = currentUser.mode;
    const permissions = currentUser.permissions || [];
    const isAdminRole = currentUser.role === 'ADMIN' || currentUser.role === 'SYSTEMADMIN'; // Echte Rolle
    const isIndividualAdminDisplay = currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN'; // Individuell mit Admin-Anzeige
    const showAdminButton = isAdminRole || isIndividualAdminDisplay; // Zeige Button in beiden Fällen

    console.log(`updateUIForMode: Aktualisiere UI für Modus: ${userMode}, Rolle: ${currentUser.role}, DisplayRole: ${currentUser.displayRole}, Typ: ${currentUser.permissionType}, AdminButton: ${showAdminButton}`); // Debug

    const footerUser = document.getElementById('footerUser');
    const footerLogout = document.getElementById('footerLogout');
    const guestPrompt = document.getElementById('guestPrompt');
    const noPermissionPrompt = document.getElementById('noPermissionPrompt');
    const mainSettingsButton = document.getElementById('mainSettingsButton');
    const mainAdminButton = document.getElementById('mainAdminButton');
    const homeActionButtons = document.getElementById('homeActionButtons'); // Container für die Buttons oben rechts

    // Footer aktualisieren
    if (footerUser) {
        let roleNameToDisplay = 'Unbekannt'; // Standard-Fallback
        // --- KORRIGIERTE LOGIK FÜR ROLLENANZEIGE IM FOOTER ---
        if (currentUser.permissionType === 'role' && currentUser.role && ROLES[currentUser.role]) {
            // Bei Typ 'role': Nimm den Namen der echten Rolle
            roleNameToDisplay = ROLES[currentUser.role].name;
        } else if (currentUser.permissionType === 'individual' && currentUser.displayRole && ROLES[currentUser.displayRole]) {
            // Bei Typ 'individual': Nimm den Namen der Display-Rolle
            roleNameToDisplay = ROLES[currentUser.displayRole].name;
        } else if (currentUser.permissionType === 'individual' && !currentUser.displayRole) {
             // Bei Typ 'individual' OHNE Display-Rolle (z.B. wenn "Keine Rechte" gewählt wurde und displayRole auf null gesetzt wird)
             roleNameToDisplay = ROLES['NO_RIGHTS']?.name || 'Keine Rechte'; // Zeige "Keine Rechte"
        } else if (userMode === GUEST_MODE) {
            roleNameToDisplay = ''; // Gast hat keine Rolle
        }
        // --- ENDE KORREKTUR ---

        // Baue den Text zusammen (mit escapeHtml, falls global verfügbar)
        const displayName = (typeof escapeHtml === 'function' ? escapeHtml(currentUser.displayName || userMode) : (currentUser.displayName || userMode));
        const roleDisplay = roleNameToDisplay ? ` (${(typeof escapeHtml === 'function' ? escapeHtml(roleNameToDisplay) : roleNameToDisplay)})` : '';
        footerUser.textContent = `Modus: ${displayName}${roleDisplay}`;
    }

    // Logout/Login Button
    if (footerLogout) {
        if (userMode !== GUEST_MODE) {
            // Logout Button Logik
            footerLogout.innerHTML = '<button id="logoutButton" class="text-red-300 hover:text-red-500 font-bold">Abmelden</button>';
            const logoutButton = document.getElementById('logoutButton');
            if (logoutButton && !logoutButton.dataset.listenerAttached) {
                logoutButton.addEventListener('click', () => {
                    const modal = document.getElementById('logoutConfirmModal');
                    if(modal) modal.style.display = 'flex';
                });
                logoutButton.dataset.listenerAttached = 'true';

                const confirmModal = document.getElementById('logoutConfirmModal');
                const confirmYes = document.getElementById('confirmLogoutYes');
                const confirmNo = document.getElementById('confirmLogoutNo');
                if (confirmModal && confirmYes && confirmNo && !confirmModal.dataset.listenerAttached) {
                     confirmYes.addEventListener('click', () => {
                         switchToGuestMode(true);
                         confirmModal.style.display = 'none';
                     });
                     confirmNo.addEventListener('click', () => {
                         confirmModal.style.display = 'none';
                     });
                     confirmModal.dataset.listenerAttached = 'true';
                }
            }
        } else {
            // Login Button Logik
            footerLogout.innerHTML = '<button id="loginButton" class="text-green-300 hover:text-green-500 font-bold">Anmelden</button>';
            const loginButton = document.getElementById('loginButton');
            if (loginButton && !loginButton.dataset.listenerAttached) {
                loginButton.addEventListener('click', () => {
                    const modal = document.getElementById('userSelectionModal');
                    if (modal) modal.style.display = 'flex';
                    // Sicherstellen, dass renderModalUserButtons existiert, bevor es aufgerufen wird
                    if (typeof renderModalUserButtons === 'function') {
                        renderModalUserButtons();
                    } else {
                        console.error("updateUIForMode: Funktion renderModalUserButtons nicht gefunden!");
                    }
                });
                loginButton.dataset.listenerAttached = 'true';
            }
        }
    }

    // Prompts ein/ausblenden
    if (guestPrompt) guestPrompt.classList.toggle('hidden', userMode !== GUEST_MODE);
    if (noPermissionPrompt) noPermissionPrompt.classList.toggle('hidden', userMode === GUEST_MODE || permissions.length > 0);

    // Haupt-Aktionsbuttons oben rechts ein/ausblenden
    if (mainSettingsButton) mainSettingsButton.classList.toggle('hidden', userMode === GUEST_MODE);
    if (mainAdminButton) {
        mainAdminButton.classList.toggle('hidden', !showAdminButton); // Verwendet die korrigierte Variable
        console.log("updateUIForMode: Admin Button wird angezeigt:", showAdminButton); // Debug
    }
    if (homeActionButtons) {
         const settingsVisible = mainSettingsButton && !mainSettingsButton.classList.contains('hidden');
         const adminVisible = mainAdminButton && !mainAdminButton.classList.contains('hidden');
         homeActionButtons.classList.toggle('hidden', !settingsVisible && !adminVisible);
         if (!homeActionButtons.classList.contains('hidden')) {
             homeActionButtons.style.display = 'flex';
         }
    }


    // Home View Cards basierend auf Berechtigungen ein/ausblenden
    document.querySelectorAll('#homeView .card[data-permission]').forEach(card => {
        const requiredPermission = card.dataset.permission;
        card.classList.toggle('hidden', userMode === GUEST_MODE || !permissions.includes(requiredPermission));
    });

    // Admin View Sections basierend auf Berechtigungen ein/ausblenden
    const adminView = document.getElementById('adminView');
    if (adminView) {
        let effectiveAdminPerms = {};
        if (isAdminRole) { // Prüfe ECHTE Rolle
            const adminUser = USERS[currentUser.mode];
            if (adminUser) {
                if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                    effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
                } else if (adminUser.permissionType === 'individual') {
                     // Wenn die ECHTE Rolle ADMIN ist, aber Typ INDIVIDUELL,
                     // verwenden wir die adminPermissions (individuelle Admin-Rechte)
                     effectiveAdminPerms = adminUser.adminPermissions || {};
                }
                 // Für SYSTEMADMIN werden unten alle Rechte gewährt
            }
        }
        const isSysAdmin = currentUser.role === 'SYSTEMADMIN';

        const toggleAdminElement = (elementId, condition) => {
            const el = document.getElementById(elementId);
            if (el) el.classList.toggle('hidden', !(isSysAdmin || condition));
        };

        // Einzelne Sektionen umschalten (SysAdmin sieht alles)
        toggleAdminElement('adminRightsSection', effectiveAdminPerms.canEditAdminPermissions); // Nur SysAdmin (angenommen)
        toggleAdminElement('roleManagementSection', effectiveAdminPerms.canSeeRoleManagement);
        toggleAdminElement('passwordSection', effectiveAdminPerms.canSeePasswords);
        toggleAdminElement('userSection', effectiveAdminPerms.canSeeUsers);
        toggleAdminElement('approvalProcessSection', effectiveAdminPerms.canSeeApprovals);
        toggleAdminElement('protocolHistorySection', effectiveAdminPerms.canViewLogs);
        toggleAdminElement('mainFunctionsSection', effectiveAdminPerms.canSeeMainFunctions);

         const hasAnyAdminPermission = isSysAdmin || Object.values(effectiveAdminPerms).some(value => value === true);
         const noAdminPermsPrompt = document.getElementById('noAdminPermissionsPrompt');
         if (noAdminPermsPrompt) {
             noAdminPermsPrompt.classList.toggle('hidden', hasAnyAdminPermission || userMode === GUEST_MODE);
         }
    }


    // Checklist Namen im Home View aktualisieren
    const checklistNameDisplay = document.getElementById('current-checklist-name-display');
    if (checklistNameDisplay) {
        const defaultListId = adminSettings.defaultChecklistId;
        const listName = (defaultListId && CHECKLISTS[defaultListId]) ? CHECKLISTS[defaultListId].name : 'Keine ausgewählt';
        checklistNameDisplay.textContent = (typeof escapeHtml === 'function' ? escapeHtml(listName) : listName);
    }
}