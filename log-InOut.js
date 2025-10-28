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
    // Ermittle Admin-Status und effektive Admin-Rechte
    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    let effectiveAdminPerms = {};
    if (isAdmin && USERS && USERS[currentUser.mode]) { // Zusätzliche Prüfung für USERS
        const adminUser = USERS[currentUser.mode];
        if (adminUser) {
            if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[adminUser.assignedAdminRoleId]) { // Zusätzliche Prüfung für ADMIN_ROLES
                effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
            } else {
                effectiveAdminPerms = adminUser.adminPermissions || {};
            }
        }
    } else if (isSysAdmin) {
        // SysAdmin hat implizit alle Rechte
        effectiveAdminPerms = {
            canSeePasswords: true, canSeeUsers: true, canSeeApprovals: true, canViewLogs: true,
            canSeeRoleManagement: true, canSeeMainFunctions: true, canEditUserRoles: true,
            canCreateUser: true, canDeleteUser: true, canRenameUser: true,
            canToggleUserActive: true, canChangeUserPermissionType: true,
            canUseMainPush: true, canUseMainEntrance: true, canUseMainChecklist: true,
            canSeeSysadminLogs: true
        };
    }

    // Zeige/Verstecke Haupt-Funktionskarten basierend auf Benutzerrechten
    document.querySelectorAll('[data-permission]').forEach(card => {
        const permission = card.dataset.permission;
        const hasPermission = currentUser.permissions?.includes(permission); // Sicherer Zugriff auf permissions
        if (permission === 'CHECKLIST') {
            card.style.display = hasPermission ? 'block' : 'none';
        } else {
            card.style.display = hasPermission ? 'flex' : 'none';
        }
    });

    // Zeige/Verstecke Einstellungs- und Admin-Knopf auf der Startseite
// --- KORRIGIERTE LOGIK für Einstellungs- und Admin-Button ---
    const settingsButton = document.getElementById('mainSettingsButton');
    const adminButton = document.getElementById('mainAdminButton');
    const homeActionButtons = document.getElementById('homeActionButtons'); // Container holen

    // Standardmäßig beide Buttons ausblenden
    if (settingsButton) settingsButton.style.display = 'none';
    if (adminButton) adminButton.style.display = 'none';

    // Prüfe die Bedingungen
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN'; // Echte Rolle
    const isAdminRole = currentUser.role === 'ADMIN';     // Echte Rolle
    const isIndividualAdminDisplay = currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN'; // Individuell mit Admin-Anzeige
    const showAdminButton = isSysAdmin || isAdminRole || isIndividualAdminDisplay; // Zeige Button, wenn eine der Bedingungen zutrifft

    // Nur auf der Home-Seite anzeigen
    if (document.getElementById('homeView')?.classList.contains('active')) {
        // Admin-Button anzeigen und stylen, wenn Bedingung erfüllt
        if (showAdminButton && adminButton) {
            adminButton.style.display = 'block';
            if (isSysAdmin) { // Echter Systemadmin
                adminButton.textContent = 'SYS-ADMIN';
                adminButton.className = 'bg-purple-800 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg hover:bg-opacity-80 transition z-10';
            } else { // Echter Admin ODER Individuell mit Admin-Anzeige
                adminButton.textContent = 'ADMIN';
                adminButton.className = 'bg-red-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg hover:bg-red-700 transition z-10';
            }
        }

        // Einstellungs-Button anzeigen (Bedingung bleibt wie vorher: eingeloggt, aber kein Admin/SysAdmin)
        // ODER wenn Admin/Sysadmin KEINE Passwort-Rechte hat (selten, aber möglich)
        const canSeePasswords = isSysAdmin || (isAdminRole && effectiveAdminPerms.canSeePasswords);
        if (currentUser.mode !== GUEST_MODE && !showAdminButton && settingsButton) { // Zeige nur an, wenn KEIN Admin-Button angezeigt wird
             settingsButton.style.display = 'block';
             settingsButton.className = 'bg-gray-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg hover:bg-gray-700 transition z-10'; // Standard-Styling
        } else if (currentUser.mode !== GUEST_MODE && showAdminButton && !canSeePasswords && settingsButton) {
             // Spezialfall: Admin/Sysadmin OHNE Passwortrechte sieht trotzdem Einstellungen
             settingsButton.style.display = 'block';
             settingsButton.className = 'bg-gray-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-lg hover:bg-gray-700 transition z-10';
        }

        // Container (#homeActionButtons) nur anzeigen, wenn mindestens ein Button sichtbar ist
        if (homeActionButtons) {
             const settingsVisible = settingsButton && settingsButton.style.display !== 'none';
             const adminVisible = adminButton && adminButton.style.display !== 'none';
             homeActionButtons.style.display = (settingsVisible || adminVisible) ? 'flex' : 'none'; // 'flex' verwenden
             homeActionButtons.classList.toggle('hidden', !(settingsVisible || adminVisible)); // hidden Klasse auch steuern
        }
    }
    // --- ENDE KORRIGIERTE LOGIK ---

    // Zeige/Verstecke Checklist-Einstellungskarte
    const checklistSettingsCard = document.getElementById('checklistSettingsCard');
    if (checklistSettingsCard) {
        checklistSettingsCard.style.display = currentUser.permissions?.includes('CHECKLIST_SETTINGS') ? 'flex' : 'none'; // Sicherer Zugriff
    }

    // --- Sicherer Zugriff auf Admin-Sektionen ---
    const adminRightsSectionEl = document.getElementById('adminRightsSection');
    if (adminRightsSectionEl) adminRightsSectionEl.style.display = isSysAdmin ? 'block' : 'none';

    const roleManagementSectionEl = document.getElementById('roleManagementSection');
    if (roleManagementSectionEl) roleManagementSectionEl.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeeRoleManagement) ? 'block' : 'none';

    const passwordSectionEl = document.getElementById('passwordSection');
    if (passwordSectionEl) passwordSectionEl.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeePasswords) ? 'block' : 'none';

    const userSectionEl = document.getElementById('userSection');
    if (userSectionEl) userSectionEl.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeeUsers) ? 'block' : 'none';

    const mainFunctionsSectionEl = document.getElementById('mainFunctionsSection');
    if (mainFunctionsSectionEl) mainFunctionsSectionEl.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeeMainFunctions) ? 'block' : 'none';

    const approvalProcessSectionEl = document.getElementById('approvalProcessSection');
    if (approvalProcessSectionEl) approvalProcessSectionEl.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canSeeApprovals) ? 'block' : 'none';

    const protocolHistorySectionEl = document.getElementById('protocolHistorySection');
    if (protocolHistorySectionEl) protocolHistorySectionEl.style.display = isSysAdmin || (isAdmin && effectiveAdminPerms.canViewLogs) ? 'block' : 'none';
    // --- Ende Sicherer Zugriff ---

    // Zeige/Verstecke Gast- oder Keine-Rechte-Meldungen
    const guestPrompt = document.getElementById('guestPrompt');
    const noPermissionPrompt = document.getElementById('noPermissionPrompt');
    const noAdminPermissionsPrompt = document.getElementById('noAdminPermissionsPrompt');
    if (guestPrompt) guestPrompt.style.display = 'none';
    if (noPermissionPrompt) noPermissionPrompt.style.display = 'none';
    if (noAdminPermissionsPrompt) noAdminPermissionsPrompt.style.display = 'none';

    if (currentUser.mode === GUEST_MODE) {
        if (guestPrompt) guestPrompt.style.display = 'block';
    } else if (currentUser.permissions?.length === 0 && !isAdmin && !isSysAdmin) { // Sicherer Zugriff
        if (noPermissionPrompt) noPermissionPrompt.style.display = 'block';
    }

    // Zeige Admin-Keine-Rechte-Meldung nur, wenn Admin-Seite aktiv ist
    if (isAdmin && document.getElementById('adminView')?.classList.contains('active')) { // Sicherer Zugriff
        const hasAnyPermission = Object.values(effectiveAdminPerms).some(perm => perm === true);
        if (noAdminPermissionsPrompt) noAdminPermissionsPrompt.style.display = hasAnyPermission ? 'none' : 'block';
    }

    // Aktualisiere Footer (Benutzername, Login/Logout Button)
    const footerUser = document.getElementById('footerUser');
    const footerLogout = document.getElementById('footerLogout');
    if (!footerUser || !footerLogout) return; // Wichtige Prüfung

    footerUser.innerHTML = '';
    footerLogout.innerHTML = '';

    if (currentUser.mode === GUEST_MODE) {
        footerUser.textContent = 'Nicht angemeldet';
        const loginButton = document.createElement('button');
        loginButton.textContent = 'Anmelden';
        loginButton.className = 'font-bold text-indigo-400 hover:text-indigo-300';

        // --- HIER DIE KORREKTUR ---
        // Der onclick-Handler öffnet jetzt NUR NOCH das Modal.
        // Das Befüllen passiert automatisch durch listenForUserUpdates.
        loginButton.onclick = () => {
            console.log("Anmelden-Button geklickt! Zeige Modal."); // Spion
            // renderModalUserButtons(); // <<< RAUS DAMIT!
            const userSelectionModal = document.getElementById('userSelectionModal');
            if (userSelectionModal) {
                userSelectionModal.style.display = 'flex';
            } else {
                 console.error("FEHLER: Konnte #userSelectionModal nicht finden!"); // Spion
            }
        };
        // --- ENDE KORREKTUR ---

        footerLogout.appendChild(loginButton);
    } else {
        // Code zum Anzeigen des eingeloggten Benutzers und Logout-Button

// Code zum Anzeigen des eingeloggten Benutzers und Logout-Button
        const user = USERS ? USERS[currentUser.mode] : null; // Sicherer Zugriff auf USERS
        let roleNameToDisplay = 'Unbekannt';
        let roleColor = 'text-gray-300'; // Standardfarbe

        // --- KORRIGIERTE LOGIK FÜR ROLLENANZEIGE ---
        if (user) { // Nur wenn Benutzerdaten vorhanden sind
            const actualRole = user.role; // Die echte Rolle aus der DB
            const displayRole = user.displayRole; // Die eingestellte Anzeige-Rolle
            const permissionType = user.permissionType || 'role'; // Der Berechtigungstyp

            if (permissionType === 'role') {
                // Bei Typ 'role': Nimm den Namen der echten Rolle
                roleNameToDisplay = ROLES[actualRole]?.name || 'Unbekannt';
                // Setze Farbe basierend auf echter Rolle
                if (actualRole === 'SYSTEMADMIN') roleColor = 'text-purple-400 font-bold';
                else if (actualRole === 'ADMIN') roleColor = 'text-red-400 font-bold';
                // Hier ggf. weitere Farben für andere Rollen hinzufügen
            } else if (permissionType === 'individual') {
                // Bei Typ 'individual': Nimm den Namen der Display-Rolle (oder "Keine Rechte")
                const roleIdToDisplay = displayRole || 'NO_RIGHTS'; // Fallback auf NO_RIGHTS
                roleNameToDisplay = ROLES[roleIdToDisplay]?.name || 'Keine Rechte';
                // Setze Farbe basierend auf Display-Rolle
                if (roleIdToDisplay === 'ADMIN') roleColor = 'text-red-400 font-bold';
                // Hier ggf. weitere Farben für andere Display-Rollen hinzufügen
                else roleColor = 'text-gray-300'; // Standard für individuelle ohne spezielle Anzeige
            }
        }
        // --- ENDE KORREKTUR ---

        const realNamePart = user?.realName ? `<span class="text-gray-400 italic text-xs ml-1">(${(typeof escapeHtml === 'function' ? escapeHtml(user.realName) : user.realName)})</span>` : '';
        const displayName = (typeof escapeHtml === 'function' ? escapeHtml(currentUser.displayName || userMode) : (currentUser.displayName || userMode));
        const roleDisplay = roleNameToDisplay ? ` <span class="mx-1 text-gray-400">❖</span> <span class="${roleColor} italic">(${(typeof escapeHtml === 'function' ? escapeHtml(roleNameToDisplay) : roleNameToDisplay)})</span>` : '';
        footerUser.innerHTML = `${displayName} ${realNamePart}${roleDisplay}`;

        const logoutButton = document.createElement('button');
        logoutButton.id = 'logoutButton';
        logoutButton.textContent = 'Ausloggen';
        logoutButton.className = 'font-bold text-white hover:text-gray-300';
        footerLogout.appendChild(logoutButton);

        logoutButton.onclick = () => { // Logout Bestätigung
            footerLogout.innerHTML = '';
            const confirmationText = document.createElement('span');
            confirmationText.className = 'font-bold mr-3';
            confirmationText.textContent = 'Sicher ausloggen?';
            const noButton = document.createElement('button');
            noButton.textContent = 'NEIN';
            noButton.className = 'font-bold text-gray-300 hover:text-white mr-3';
            noButton.onclick = () => updateUIForMode(); // Stellt Button wieder her
            const yesButton = document.createElement('button');
            yesButton.textContent = 'JA';
            yesButton.className = 'font-bold text-red-400 hover:text-red-300';
            yesButton.onclick = () => switchToGuestMode(); // Führt Logout aus
            footerLogout.append(confirmationText, noButton, yesButton);
        };
    }

    // Aktualisiere Standard-Checklisten-Namen im Header der Checkliste (wenn sichtbar)
    const checklistNameDisplay = document.getElementById('current-checklist-name-display');
    if (checklistNameDisplay) {
        const defaultListId = adminSettings?.defaultChecklistId; // Sicherer Zugriff
        const checklistName = (CHECKLISTS && CHECKLISTS[defaultListId]?.name); // Sicherer Zugriff
        if (checklistName) {
            checklistNameDisplay.textContent = checklistName;
        } else {
            checklistNameDisplay.textContent = '(Keine Liste gewählt)';
        }
    }
}