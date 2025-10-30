// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { db, usersCollectionRef, setButtonLoading, adminSectionsState, modalUserButtons, ADMIN_ROLES, adminRolesCollectionRef, rolesCollectionRef, ROLES, alertUser, initialAuthCheckDone, currentUser, GUEST_MODE, adminSettings, CHECKLISTS, ADMIN_STORAGE_KEY, USERS, navigate, auth } from './haupteingang.js';
import { renderModalUserButtons } from './admin_benutzersteuerung.js';

// ENDE-ZIKA //

// ERSETZE die komplette checkCurrentUserValidity Funktion in log-InOut.js hiermit:
export async function checkCurrentUserValidity() { // Funktion ist async
    console.log("--- Prüfe Benutzerberechtigungen (V5 - Mit Live-Sperre) ---");

    // Prüfe zuerst, ob 'auth' initialisiert wurde
    if (!auth) {
        console.error("checkCurrentUserValidity: Auth-Instanz ist noch nicht initialisiert.");
        if (currentUser.mode !== GUEST_MODE) switchToGuestMode(false);
        updateUIForMode();
        return;
    }

    const currentAuthUser = auth.currentUser; // Aktuellen Firebase Auth User holen
    const storedAppUserId = localStorage.getItem(ADMIN_STORAGE_KEY); // z.B. "JASMIN"
    // Stelle sicher, dass USERS nicht null/undefined ist, bevor darauf zugegriffen wird
    const userFromFirestore = storedAppUserId && USERS ? USERS[storedAppUserId] : null;

    // Fall 1: Kein Firebase User angemeldet -> Sicherstellen, dass Gastmodus aktiv ist
    if (!currentAuthUser) {
        console.log("checkCurrentUserValidity: Kein Firebase User angemeldet.");
        if (storedAppUserId || currentUser.mode !== GUEST_MODE) {
            switchToGuestMode(false); // Ausloggen, falls nötig
        }
        // Stelle sicher, dass currentUser auf Gast gesetzt ist, falls noch nicht geschehen
        else if (currentUser.mode !== GUEST_MODE) {
             Object.keys(currentUser).forEach(key => delete currentUser[key]);
             Object.assign(currentUser, { displayName: GUEST_MODE, mode: GUEST_MODE, role: 'GUEST', permissions: [] });
        }
        updateUIForMode();
        return;
    }

    // =================================================================
    // BEGINN DER KORREKTUR (Live-Sperre erzwingen)
    // =================================================================

    // Fall 2: Firebase User ist da, aber kein App User ausgewählt (oder ungültig/nicht gefunden)
    if (!storedAppUserId || !userFromFirestore) {
        console.log("checkCurrentUserValidity: Firebase User vorhanden, aber kein gültiger App User im Speicher oder User in Firestore nicht gefunden.");
        if (currentUser.mode !== GUEST_MODE) {
             console.log("Wechsle zum Gastmodus, da App User ungültig/fehlt.");
             // Hier keine Benachrichtigung, da der User wahrscheinlich nur die Seite geladen hat, ohne eingeloggt zu sein
             switchToGuestMode(false); 
        }
        updateUIForMode();
        return;
    }

    // NEU: Fall 2.5: User ist gefunden, ABER als 'inaktiv' (gesperrt) markiert.
    if (!userFromFirestore.isActive) {
        console.warn("checkCurrentUserValidity: Benutzer ist als INAKTIV (gesperrt) markiert. Erzwinge Logout.");
        
        // =================================================================
        // HIER IST DEINE GEWÜNSCHTE ÄNDERUNG:
        // Wir rufen switchToGuestMode jetzt mit dem dritten Parameter auf: 'error_long'
        // 1. Parameter (true): Zeige eine Benachrichtigung.
        // 2. Parameter (string): Die Nachricht, die angezeigt wird.
        // 3. Parameter ('error_long'): Der Typ, der (in alertUser) für Rote Farbe und 9 Sekunden Dauer sorgt.
        switchToGuestMode(true, "Ihr Konto wurde von einem Administrator gesperrt.", 'error_long');
        // =================================================================
        
        // updateUIForMode() wird bereits von switchToGuestMode aufgerufen.
        return; // WICHTIG: Hier abbrechen.
    }
    
    // =================================================================
    // ENDE DER KORREKTUR
    // =================================================================


    // Fall 3: Firebase User ist da UND App User ("JASMIN") ist ausgewählt/gültig/AKTIV
    console.log(`checkCurrentUserValidity: Firebase User ${currentAuthUser.uid} und App User ${storedAppUserId} vorhanden.`);
    try {
        
        // Token holen, um sicherzustellen, dass die Sitzung gültig ist
        const idTokenResult = await currentAuthUser.getIdTokenResult(true);
        if (!idTokenResult) {
            throw new Error("Konnte kein gültiges ID Token abrufen.");
        }
        
        // Wir vertrauen ab hier der "Live-Datenbank" (Firestore)
        const user = userFromFirestore; // Das ist die "Source of Truth"
        const effectiveRole = user.role; 

        console.log(`Effektiver Berechtigungs-Typ (aus DB): ${user.permissionType}`);
        
        let userPermissions = [];
        let currentAssignedAdminRoleId = null;
        
        // Logik zur Rechte-Ermittlung (bleibt gleich wie in V4)
        if (user.permissionType === 'role') {
            console.log(`Lade Rechte für ROLLE: ${effectiveRole}`);
            if (effectiveRole && ROLES[effectiveRole]) {
                userPermissions = [...(ROLES[effectiveRole].permissions || [])];
            }

            if (effectiveRole === 'ADMIN' && user.assignedAdminRoleId && ADMIN_ROLES[user.assignedAdminRoleId]) {
                currentAssignedAdminRoleId = user.assignedAdminRoleId;
                const adminPerms = ADMIN_ROLES[currentAssignedAdminRoleId].permissions || {};
                const permKeys = Object.keys(adminPerms).filter(
                    key => key !== 'approvalRequired' && adminPerms[key] === true
                );
                userPermissions = permKeys; 
                console.log(`Admin-Rollen-Rechte geladen: ${permKeys.length} Rechte.`);
            }
            else if (effectiveRole === 'SYSTEMADMIN') {
                userPermissions = ['ENTRANCE', 'PUSHOVER', 'CHECKLIST', 'CHECKLIST_SWITCH', 'CHECKLIST_SETTINGS', 'ESSENSBERECHNUNG'];
                console.log("Systemadmin-Rechte geladen.");
            }
        } 
        else if (user.permissionType === 'individual') {
            userPermissions = [...(user.customPermissions || [])];
            console.log(`Lade INDIVIDUELLE Rechte: ${userPermissions.length} Rechte.`);
        }
        
        console.log("Final zugewiesene Berechtigungen:", userPermissions);

        // Aktualisiere currentUser Objekt
        Object.keys(currentUser).forEach(key => delete currentUser[key]);
        Object.assign(currentUser, {
            mode: storedAppUserId,
            displayName: userFromFirestore.name,
            role: effectiveRole, 
            permissions: userPermissions,
            permissionType: userFromFirestore.permissionType,
            displayRole: userFromFirestore.displayRole,
            assignedAdminRoleId: currentAssignedAdminRoleId
        });

        console.log("currentUser Objekt aktualisiert:", currentUser);
        updateUIForMode(); 

        // Navigationsprüfung
         const activeView = document.querySelector('.view.active');
         const isAdminOrSysAdmin = effectiveRole === 'ADMIN' || effectiveRole === 'SYSTEMADMIN';
         if (activeView && activeView.id === 'adminView' && !isAdminOrSysAdmin) {
             alertUser("Ihre Administrator-Rechte wurden entzogen.", "error");
             navigate('home');
         }

    } catch (error) {
         console.error("Fehler beim Holen des ID Tokens oder Prüfen der Claims:", error);
         // BONUS-KORREKTUR: Wenn HIER ein Fehler passiert, ist die Meldung jetzt auch rot (aber normal kurz 'error')
         switchToGuestMode(true, "Fehler bei der Berechtigungsprüfung.", 'error');
         updateUIForMode();
    }
}

export function switchToGuestMode(showNotification = true, message = "Abgemeldet. Modus ist nun 'Gast'.", type = 'success') {
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
    
    // HIER IST DIE ÄNDERUNG:
    // Statt immer 'success' zu senden, verwenden wir jetzt den 'type'-Parameter,
    // der an diese Funktion übergeben wird.
    // Wenn kein Typ übergeben wird, ist der Standard 'success' (grün).
    if (showNotification) alertUser(message, type);
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
    const adminView = document.getElementById('adminView');

    if (adminView?.classList.contains('active') && noAdminPermissionsPrompt) { // Nur ausführen, wenn Admin-Seite aktiv ist
        // Prüfe, ob IRGENDWELCHE effektiven Admin-Rechte vorhanden sind
        const hasAnyPermission = isSysAdmin || Object.values(effectiveAdminPerms).some(perm => perm === true);

        // Zeige die Meldung, wenn der Benutzer Admin-Zugriff haben SOLLTE (showAdminButton ist true),
        // aber KEINE spezifischen Rechte hat (hasAnyPermission ist false) UND er nicht der Gast ist.
        const shouldShowPrompt = showAdminButton && !hasAnyPermission && currentUser.mode !== GUEST_MODE;

        noAdminPermissionsPrompt.style.display = shouldShowPrompt ? 'block' : 'none';
        console.log("updateUIForMode: 'Keine Admin Rechte'-Prompt angezeigt:", shouldShowPrompt); // Debug
    } else if (noAdminPermissionsPrompt) {
        // Sicherstellen, dass die Meldung ausgeblendet ist, wenn die Admin-Seite nicht aktiv ist
        noAdminPermissionsPrompt.style.display = 'none';
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
if (user) { 
            const actualRole = user.role; 
            const displayRole = user.displayRole; 
            const permissionType = user.permissionType || 'role'; 
            
            // Bestimme die effektive Rolle für die ANZEIGE
            const effectiveDisplayRoleId = (permissionType === 'individual' && displayRole) ? displayRole : actualRole;
            const roleObject = ROLES[effectiveDisplayRoleId] || ROLES['NO_RIGHTS'];

            roleNameToDisplay = roleObject.name || 'Keine Rechte';
            
            // Setze Farbe basierend auf effektiver Anzeige-Rolle
            if (effectiveDisplayRoleId === 'SYSTEMADMIN') roleColor = 'text-purple-400 font-bold';
            else if (effectiveDisplayRoleId === 'ADMIN') roleColor = 'text-red-400 font-bold';
            else if (effectiveDisplayRoleId === 'NO_RIGHTS') roleColor = 'text-gray-300 italic';
            else roleColor = 'text-gray-300';
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