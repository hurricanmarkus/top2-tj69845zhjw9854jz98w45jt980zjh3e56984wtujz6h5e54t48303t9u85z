// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { db, usersCollectionRef, setButtonLoading, adminSectionsState, modalUserButtons, ADMIN_ROLES, adminRolesCollectionRef, rolesCollectionRef, ROLES, alertUser, initialAuthCheckDone, currentUser, GUEST_MODE, adminSettings, CHECKLISTS, ADMIN_STORAGE_KEY, USERS, navigate, auth } from './haupteingang.js';
import { renderModalUserButtons } from './admin_benutzersteuerung.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { listenForAssignedVotes, stopAssignedVotesListener, listenForCreatedVotes } from './terminplaner.js';
// ENDE-ZIKA //

// ERSETZE die komplette checkCurrentUserValidity Funktion in log-InOut.js hiermit:
// ERSETZE die komplette checkCurrentUserValidity Funktion in log-InOut.js hiermit:
// In log-InOut.js
export async function checkCurrentUserValidity() { 
    console.log("--- Prüfe Benutzerberechtigungen (V7 - Robuste Cache-Prüfung) ---");

    if (!auth) {
        console.error("checkCurrentUserValidity: Auth-Instanz ist noch nicht initialisiert.");
        if (currentUser.mode !== GUEST_MODE) switchToGuestMode(false);
        updateUIForMode();
        return;
    }

    const currentAuthUser = auth.currentUser; 
    const storedAppUserId = localStorage.getItem(ADMIN_STORAGE_KEY); 

    let userFromFirestore = storedAppUserId && USERS ? USERS[storedAppUserId] : null;
    let fetchedFromDB = false; 

    if (!currentAuthUser) {
        console.log("checkCurrentUserValidity: Kein Firebase User angemeldet.");
        if (storedAppUserId || currentUser.mode !== GUEST_MODE) {
            switchToGuestMode(false); 
        }
        else if (currentUser.mode !== GUEST_MODE) {
             Object.keys(currentUser).forEach(key => delete currentUser[key]);
             Object.assign(currentUser, { displayName: GUEST_MODE, mode: GUEST_MODE, role: 'GUEST', permissions: [], adminPermissions: {} });
        }
        updateUIForMode();
        return;
    }

    if (!storedAppUserId) {
         console.log("checkCurrentUserValidity: Firebase User vorhanden, aber kein App User im Speicher.");
         if (currentUser.mode !== GUEST_MODE) {
              switchToGuestMode(false); 
         }
         updateUIForMode();
         return;
    }

    if (storedAppUserId && !userFromFirestore) {
        console.warn(`checkCurrentUserValidity: Benutzer ${storedAppUserId} nicht im Cache (USERS) gefunden. Versuche Direkt-Abfrage...`);
        try {
            const userDocRef = doc(usersCollectionRef, storedAppUserId);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                console.log(`checkCurrentUserValidity: Direkt-Abfrage erfolgreich!`);
                userFromFirestore = { id: docSnap.id, ...docSnap.data() };
                fetchedFromDB = true; 
            } else {
                console.error(`checkCurrentUserValidity: Direkt-Abfrage FEHLGESCHLAGEN. Benutzer ${storedAppUserId} existiert nicht. Erzwinge Logout.`);
                 switchToGuestMode(true, "Ihr Benutzerkonto konnte nicht gefunden werden. Sie wurden abgemeldet.", 'error'); 
                 updateUIForMode();
                 return;
            }
        } catch (error) {
            console.error("checkCurrentUserValidity: FEHLER bei Direkt-Abfrage:", error);
            switchToGuestMode(true, "Fehler bei der Benutzerprüfung. Sie wurden abgemeldet.", 'error'); 
            updateUIForMode();
            return;
        }
    }

    if (!userFromFirestore.isActive) {
        console.warn("checkCurrentUserValidity: Benutzer ist als INAKTIV (gesperrt) markiert. Erzwinge Logout.");
        switchToGuestMode(true, "Ihr Konto wurde von einem Administrator gesperrt.", 'error_long');
        return; 
    }

    console.log(`checkCurrentUserValidity: Firebase User ${currentAuthUser.uid} und App User ${storedAppUserId} vorhanden.`);
    try {

        const idTokenResult = await currentAuthUser.getIdToken(true); 
        if (!idTokenResult) {
            throw new Error("Konnte kein gültiges ID Token abrufen.");
        }

        const user = userFromFirestore; 
        const effectiveRole = user.role; 

        let userPermissions = [];
        let adminPermissions = {};
        let currentAssignedAdminRoleId = null; 

        // --- TEIL 1: Lade BENUTZER-Rechte ---
        if (user.permissionType === 'role') {
            if (effectiveRole && ROLES[effectiveRole]) {
                userPermissions = [...(ROLES[effectiveRole].permissions || [])];
            }
        } 
        else if (user.permissionType === 'individual') {
            userPermissions = [...(user.customPermissions || [])];
        }
        if (effectiveRole === 'SYSTEMADMIN') {
            userPermissions = ['ENTRANCE', 'PUSHOVER', 'CHECKLIST', 'CHECKLIST_SWITCH', 'CHECKLIST_SETTINGS', 'ESSENSBERECHNUNG'];
        }

        // --- TEIL 2: Lade ADMIN-Rechte ---
        if (effectiveRole === 'ADMIN') {
            if (user.adminPermissionType === 'role' && user.assignedAdminRoleId && ADMIN_ROLES[user.assignedAdminRoleId]) {
                adminPermissions = ADMIN_ROLES[user.assignedAdminRoleId].permissions || {};
                currentAssignedAdminRoleId = user.assignedAdminRoleId;
            } else {
                adminPermissions = user.adminPermissions || {};
            }
        } 
        else if (effectiveRole === 'SYSTEMADMIN') {
             adminPermissions = {
                canSeePasswords: true, canSeeUsers: true, canSeeApprovals: true, canViewLogs: true,
                canSeeRoleManagement: true, canSeeMainFunctions: true, canEditUserRoles: true,
                canCreateUser: true, canDeleteUser: true, canRenameUser: true,
                canToggleUserActive: true, canChangeUserPermissionType: true,
                canUseMainPush: true, canUseMainEntrance: true, canUseMainChecklist: true,
                canSeeSysadminLogs: true
            };
        }

        // Aktualisiere currentUser Objekt
        Object.keys(currentUser).forEach(key => delete currentUser[key]);
        Object.assign(currentUser, {
            mode: storedAppUserId,
            displayName: userFromFirestore.name,
            role: effectiveRole, 
            permissions: userPermissions, 
            adminPermissions: adminPermissions, 
            permissionType: userFromFirestore.permissionType,
            adminPermissionType: userFromFirestore.adminPermissionType, 
            displayRole: userFromFirestore.displayRole,
            assignedAdminRoleId: currentAssignedAdminRoleId
        });

        console.log("currentUser Objekt aktualisiert:", currentUser);

        // NEU: Starte den Spion für "An mich zugewiesen"
        // Wir übergeben die ID des eingeloggten Benutzers
        listenForAssignedVotes(currentUser.mode);
        listenForCreatedVotes(currentUser.mode); // NEU: Starte den Spion für "Von mir erstellt"

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
         switchToGuestMode(true, "Fehler bei der Berechtigungsprüfung.", 'error');
         updateUIForMode();
    }
}

// In log-InOut.js
export function switchToGuestMode(showNotification = true, message = "Abgemeldet. Modus ist nun 'Gast'.", type = 'success') {
    
    // NEU: Stoppe den Spion für "An mich zugewiesen", da wir jetzt Gast sind
    stopAssignedVotesListener();

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
    
    if (showNotification) alertUser(message, type);
}

// Diese Funktion gehört in log-InOut.js
export function updateUIForMode() {
    // Ermittle Admin-Status und effektive Admin-Rechte
    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';

    // =================================================================
    // BEGINN DER KORREKTUR (aus vorigem Schritt - bleibt gleich)
    // =================================================================
    // Wir holen sie direkt aus dem 'currentUser'-Objekt,
    // das von 'checkCurrentUserValidity' korrekt befüllt wurde.
    let effectiveAdminPerms = currentUser.adminPermissions || {};
    // =================================================================
    // ENDE DER KORREKTUR
    // =================================================================


    // Zeige/Verstecke Haupt-Funktionskarten basierend auf Benutzerrechten
    document.querySelectorAll('[data-permission]').forEach(card => {
        const permission = card.dataset.permission;
        // WICHTIG: Dies prüft 'currentUser.permissions' (BENUTZER-Rechte), nicht Admin-Rechte. Das ist korrekt.
        const hasPermission = currentUser.permissions?.includes(permission); // Sicherer Zugriff auf permissions
        if (permission === 'CHECKLIST') {
            card.style.display = hasPermission ? 'block' : 'none';
        } else {
            card.style.display = hasPermission ? 'flex' : 'none';
        }
    });

    // --- NEU: Sichtbarkeit für die Terminplaner-Karte ---
    // Wir holen uns die neue Karte
    const terminplanerCard = document.getElementById('terminplanerCard');
    if (terminplanerCard) {
        // Wir prüfen, ob der Benutzer NICHT der Gast ist
        // (Genau wie du es wolltest: "nur dann angezeigt, wenn man eingeloggt ist")
        if (currentUser.mode !== GUEST_MODE) {
            terminplanerCard.style.display = 'flex'; // Zeige sie als 'flex' (wie die anderen Karten)
            terminplanerCard.classList.remove('hidden');
        } else {
            terminplanerCard.style.display = 'none'; // Verstecke sie für Gäste
            terminplanerCard.classList.add('hidden');
        }
    }
    // --- ENDE NEUER TEIL ---


    // Zeige/Verstecke Einstellungs- und Admin-Knopf auf der Startseite
    // --- KORRIGIERTE LOGIK für Einstellungs- und Admin-Button ---
    const settingsButton = document.getElementById('mainSettingsButton');
    const adminButton = document.getElementById('mainAdminButton');
    const homeActionButtons = document.getElementById('homeActionButtons'); // Container holen

    // Standardmäßig beide Buttons ausblenden
    if (settingsButton) settingsButton.style.display = 'none';
    if (adminButton) adminButton.style.display = 'none';

    // Prüfe die Bedingungen
    const isAdminRole = currentUser.role === 'ADMIN';     // Echte Rolle (Dank Schritt 1 jetzt korrekt)
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
        
        // HIER: Nutze die 'effectiveAdminPerms', die wir oben geladen haben.
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
        // Prüft BENUTZER-Rechte. Das ist korrekt.
        checklistSettingsCard.style.display = currentUser.permissions?.includes('CHECKLIST_SETTINGS') ? 'flex' : 'none'; // Sicherer Zugriff
    }

    // --- Sicherer Zugriff auf Admin-Sektionen ---
    // HIER: Nutze die 'effectiveAdminPerms', die wir oben geladen haben.
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
        
    } else if (currentUser.permissions?.length === 0 && !isSysAdmin) { 
        if (noPermissionPrompt) noPermissionPrompt.style.display = 'block';
    }

    // Zeige Admin-Keine-Rechte-Meldung nur, wenn Admin-Seite aktiv ist
    const adminView = document.getElementById('adminView');

    if (adminView?.classList.contains('active') && noAdminPermissionsPrompt) { // Nur ausführen, wenn Admin-Seite aktiv ist
        // Prüfe, ob IRGENDWELCHE effektiven Admin-Rechte vorhanden sind
        // HIER: Nutze die 'effectiveAdminPerms', die wir oben geladen haben.
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

        loginButton.onclick = () => {
            console.log("Anmelden-Button geklickt! Zeige Modal."); // Spion
            const userSelectionModal = document.getElementById('userSelectionModal');
            if (userSelectionModal) {
                userSelectionModal.style.display = 'flex';
            } else {
                console.error("FEHLER: Konnte #userSelectionModal nicht finden!"); // Spion
            }
        };

        footerLogout.appendChild(loginButton);
    } else {
        // Code zum Anzeigen des eingeloggten Benutzers und Logout-Button
        const user = USERS ? USERS[currentUser.mode] : null; // Sicherer Zugriff auf USERS
        let roleNameToDisplay = 'Unbekannt';
        let roleColor = 'text-gray-300'; // Standardfarbe

if (user) { 
            const actualRole = user.role; 
            const displayRole = user.displayRole; 
            const permissionType = user.permissionType || 'role'; 
            
            const effectiveDisplayRoleId = (permissionType === 'individual' && displayRole) ? displayRole : actualRole;
            const roleObject = ROLES[effectiveDisplayRoleId] || ROLES['NO_RIGHTS'];

            roleNameToDisplay = roleObject.name || 'Keine Rechte';
            
            if (effectiveDisplayRoleId === 'SYSTEMADMIN') roleColor = 'text-purple-400 font-bold';
            else if (effectiveDisplayRoleId === 'ADMIN') roleColor = 'text-red-400 font-bold';
            else if (effectiveDisplayRoleId === 'NO_RIGHTS') roleColor = 'text-gray-300 italic';
            else roleColor = 'text-gray-300';
        }

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