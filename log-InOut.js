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
    const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SYSTEMADMIN'; // Echte Rolle
    const isIndividualAdminDisplay = currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN'; // Individuell mit Admin-Anzeige
    const showAdminButton = isAdmin || isIndividualAdminDisplay; // Zeige Button in beiden Fällen

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
        footerUser.textContent = `Modus: ${currentUser.displayName || userMode}`;
    }
    if (footerLogout) {
        if (userMode !== GUEST_MODE) {
            footerLogout.innerHTML = '<button id="logoutButton" class="text-red-300 hover:text-red-500 font-bold">Abmelden</button>';
            const logoutButton = document.getElementById('logoutButton');
            // Stelle sicher, dass der Listener nur einmal hinzugefügt wird
            if (logoutButton && !logoutButton.dataset.listenerAttached) {
                logoutButton.addEventListener('click', () => {
                    const modal = document.getElementById('logoutConfirmModal');
                    if(modal) modal.style.display = 'flex';
                });
                logoutButton.dataset.listenerAttached = 'true';

                // Listener für das Bestätigungs-Modal (nur einmal hinzufügen)
                const confirmModal = document.getElementById('logoutConfirmModal');
                const confirmYes = document.getElementById('confirmLogoutYes');
                const confirmNo = document.getElementById('confirmLogoutNo');
                if (confirmModal && confirmYes && confirmNo && !confirmModal.dataset.listenerAttached) {
                     confirmYes.addEventListener('click', () => {
                         switchToGuestMode(true); // Mit Neuladen der Seite
                         confirmModal.style.display = 'none';
                     });
                     confirmNo.addEventListener('click', () => {
                         confirmModal.style.display = 'none';
                     });
                     confirmModal.dataset.listenerAttached = 'true';
                }
            }
        } else {
            footerLogout.innerHTML = '<button id="loginButton" class="text-green-300 hover:text-green-500 font-bold">Anmelden</button>';
            const loginButton = document.getElementById('loginButton');
            // Stelle sicher, dass der Listener nur einmal hinzugefügt wird
            if (loginButton && !loginButton.dataset.listenerAttached) {
                loginButton.addEventListener('click', () => {
                    const modal = document.getElementById('userSelectionModal');
                    if (modal) modal.style.display = 'flex';
                    renderModalUserButtons(); // Lade Benutzer neu, wenn Modal geöffnet wird
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
    }
    // Container nur anzeigen, wenn mindestens ein Button drin sichtbar ist
    if (homeActionButtons) {
         const settingsVisible = mainSettingsButton && !mainSettingsButton.classList.contains('hidden');
         const adminVisible = mainAdminButton && !mainAdminButton.classList.contains('hidden');
         homeActionButtons.classList.toggle('hidden', !settingsVisible && !adminVisible);
         // Stellt sicher, dass der Container flex ist, wenn sichtbar
         if (!homeActionButtons.classList.contains('hidden')) {
             homeActionButtons.style.display = 'flex';
         }
    }


    // Home View Cards basierend auf Berechtigungen ein/ausblenden
    document.querySelectorAll('#homeView .card[data-permission]').forEach(card => {
        const requiredPermission = card.dataset.permission;
        // Spezielle Logik für Admin-Card: Nur anzeigen, wenn showAdminButton true ist
        if (requiredPermission === 'ADMIN') {
             // Es gibt keine explizite 'ADMIN'-Card, aber falls doch, hier die Logik
             // card.classList.toggle('hidden', !showAdminButton);
        }
        // Spezielle Logik für Settings: Immer anzeigen, außer für Gast
        else if (requiredPermission === 'SETTINGS') {
             card.classList.toggle('hidden', userMode === GUEST_MODE);
        }
        // Normale Berechtigungsprüfung
        else {
            card.classList.toggle('hidden', userMode === GUEST_MODE || !permissions.includes(requiredPermission));
        }
    });

    // Admin View Sections basierend auf Berechtigungen ein/ausblenden
    // Diese Logik muss sicherstellen, dass sie nur läuft, wenn die Admin-View überhaupt geladen ist
    const adminView = document.getElementById('adminView');
    if (adminView) { // Prüfen, ob das Element existiert
        let effectiveAdminPerms = {};
        if (isAdmin) { // Echte Rolle ist Admin/SysAdmin
            const adminUser = USERS[currentUser.mode];
            if (adminUser) {
                if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                    effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
                } else if (adminUser.permissionType === 'individual') {
                     // Wenn die ECHTE Rolle ADMIN ist, aber Typ INDIVIDUELL,
                     // verwenden wir die adminPermissions (individuelle Admin-Rechte)
                     effectiveAdminPerms = adminUser.adminPermissions || {};
                }
            }
        }
        // Wenn currentUser.role SYSTEMADMIN ist, hat er alle Rechte
        const isSysAdmin = currentUser.role === 'SYSTEMADMIN';

        // Funktion zum Umschalten der Sichtbarkeit
        const toggleAdminElement = (elementId, condition) => {
            const el = document.getElementById(elementId);
            if (el) el.classList.toggle('hidden', !(isSysAdmin || condition)); // SysAdmin sieht alles
        };

        // Einzelne Sektionen umschalten
        toggleAdminElement('adminRightsSection', effectiveAdminPerms.canEditAdminPermissions); // Nur SysAdmin kann Admin-Rechte bearbeiten (angenommen)
        toggleAdminElement('roleManagementSection', effectiveAdminPerms.canSeeRoleManagement);
        toggleAdminElement('passwordSection', effectiveAdminPerms.canSeePasswords);
        toggleAdminElement('userSection', effectiveAdminPerms.canSeeUsers);
        toggleAdminElement('approvalProcessSection', effectiveAdminPerms.canSeeApprovals);
        toggleAdminElement('protocolHistorySection', effectiveAdminPerms.canViewLogs);
        toggleAdminElement('mainFunctionsSection', effectiveAdminPerms.canSeeMainFunctions);

         // Prüfen, ob überhaupt Admin-Berechtigungen vorhanden sind (für die "Keine Rechte"-Meldung)
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
        checklistNameDisplay.textContent = (defaultListId && CHECKLISTS[defaultListId]) ? CHECKLISTS[defaultListId].name : 'Keine ausgewählt';
    }

    // Scrollposition wiederherstellen, falls nötig (z.B. nach Login/Logout)
    // restoreAdminScrollIfAny(); // Wird jetzt durch Observer oder manuell ausgelöst
}