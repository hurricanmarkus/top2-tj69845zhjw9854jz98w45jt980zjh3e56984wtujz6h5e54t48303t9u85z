// // @ts-check 
// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { db, usersCollectionRef, setButtonLoading, adminSectionsState, modalUserButtons, ADMIN_ROLES, adminRolesCollectionRef, rolesCollectionRef, ROLES, alertUser, initialAuthCheckDone, currentUser, GUEST_MODE, adminSettings, CHECKLISTS, ADMIN_STORAGE_KEY, USERS, navigate, auth } from './haupteingang.js';
import { renderModalUserButtons } from './admin_benutzersteuerung.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { listenForMyVotes, stopMyVotesListener } from './terminplaner.js';
// ENDE-ZIKA //

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// ERSETZE die komplette checkCurrentUserValidity Funktion in log-InOut.js hiermit:
// In log-InOut.js
export async function checkCurrentUserValidity() { 
    console.log("--- Prüfe Benutzerberechtigungen (V8 - Mismatch-Erkennung) ---");

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

    if (userFromFirestore && !userFromFirestore.isActive) {
        console.warn("checkCurrentUserValidity: Benutzer ist als INAKTIV (gesperrt) markiert. Erzwinge Logout.");
        switchToGuestMode(true, "Ihr Konto wurde von einem Administrator gesperrt.", 'error_long');
        return; 
    }

    console.log(`checkCurrentUserValidity: Firebase User ${currentAuthUser.uid} und App User ${storedAppUserId} vorhanden.`);
    try {

        // =========================================================
        // START BUG 1 FIX
        // =========================================================
        
        // 1. Hole das ID-Token. 'true' erzwingt eine Erneuerung vom Server,
        //    aber es holt KEINE neuen Custom Claims, die es nicht kennt.
        //    Es holt nur die, die der Auth-Server *kennt*.
        const idTokenResult = await currentAuthUser.getIdTokenResult(true); 
        if (!idTokenResult) {
            throw new Error("Konnte kein gültiges ID Token abrufen.");
        }

        // 2. Lese die Rolle aus dem Token (der alte "Ausweis")
        //    Wir verwenden 'appRole', wie in 'handleLogin' definiert.
        const tokenRole = idTokenResult.claims.appRole || null;

        // 3. Lese die Rolle aus Firestore (die neue, live geänderte Rolle)
        const firestoreRole = userFromFirestore.role || null;

        // 4. Vergleiche!
        //    Wir ignorieren den Fall, wo beide 'null' sind (z.B. bei 'not_registered')
        if (tokenRole !== firestoreRole && (tokenRole || firestoreRole)) {
            console.warn(`CHECK-MISMATCH! Rolle im Token: '${tokenRole}', Rolle in Firestore: '${firestoreRole}'`);
            
            // 5. Erzwinge Logout, damit der Benutzer sich neu anmelden MUSS,
            //    um ein korrektes Token (neuen "Ausweis") zu bekommen.
            switchToGuestMode(
                true, 
                "Ihre Benutzer-Berechtigungen wurden von einem Admin geändert. Bitte melden Sie sich erneut an, um die Änderungen zu übernehmen.", 
                "info" // "info" ist besser als "error"
            );
            
            // WICHTIG: Hier abbrechen, damit der Rest der Funktion nicht
            // die UI mit falschen Rechten (halb alt, halb neu) aufbaut.
            return; 
        }
        
        // =========================================================
        // END BUG 1 FIX
        // =========================================================


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
        listenForMyVotes(currentUser.mode);

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
    stopMyVotesListener();

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

// In log-InOut.js
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


    // =================================================================
    // BEGINN DER KORREKTUR (Die "Verbindung")
    // =================================================================
    // Zeige/Verstecke Haupt-Funktionskarten basierend auf Benutzerrechten
    document.querySelectorAll('[data-permission]').forEach(card => {
        const permission = card.dataset.permission;
        // Wir holen die Berechtigungen (sicher, falls 'permissions' mal nicht existiert)
        const userPermissions = currentUser.permissions || [];
        const hasPermission = userPermissions.includes(permission);
        
        // ERLAUBT = Der Benutzer hat die Berechtigung ODER er ist Systemadmin
        // (Systemadmin darf immer alles sehen, egal was in den Rollen steht)
        const isAllowed = hasPermission || currentUser.role === 'SYSTEMADMIN';

        if (permission === 'CHECKLIST') {
            card.style.display = isAllowed ? 'block' : 'none';
        } else {
            // Dies gilt jetzt für PUSHOVER, ENTRANCE, ESSENSBERECHNUNG
            // und (NEU) TERMINPLANER, da sie alle 'flex' sind.
            card.style.display = isAllowed ? 'flex' : 'none';
        }
    });
    // =================================================================
    // ENDE DER KORREKTUR
    // =================================================================


    // --- (Hier war der alte, falsche Code-Block für Terminplaner, der jetzt entfernt ist) ---


    // =================================================================
    // NEUER TEIL FÜR TERMINPLANER (LIVE-BERECHTIGUNG)
    // =================================================================
    // Steuert den "+ Neuen Termin" Knopf auf der Terminplaner-Seite
    const createVoteButton = document.getElementById('show-create-vote-modal-btn');
    if (createVoteButton) {
        // Finde heraus, ob die Terminplaner-Seite gerade aktiv ist
        const isTerminplanerActive = document.getElementById('terminplanerView')?.classList.contains('active');
        
        // Prüfe die Berechtigung
        const permissions = currentUser.permissions || [];
        const hasCreatePermission = permissions.includes('TERMINPLANER_CREATE') || currentUser.role === 'SYSTEMADMIN';
        
        // Bedingungen für die Anzeige:
        // 1. Man ist NICHT Gast
        // 2. Man hat die BERECHTIGUNG
        // 3. Die TERMINPLANER-SEITE ist gerade überhaupt sichtbar
        if (currentUser.mode !== GUEST_MODE && hasCreatePermission && isTerminplanerActive) {
            createVoteButton.style.display = 'flex'; // 'flex', da er ein Icon hat
        } else {
            createVoteButton.style.display = 'none';
        }
    }
    // =================================================================
    // ENDE NEUER TEIL
    // =================================================================


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
        // (Wir fügen die SysAdmin-Ausnahme hinzu)
        const hasChecklistSettingsPerm = (currentUser.permissions || []).includes('CHECKLIST_SETTINGS') || currentUser.role === 'SYSTEMADMIN';
        checklistSettingsCard.style.display = hasChecklistSettingsPerm ? 'flex' : 'none';
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
        
    } else if ((currentUser.permissions || []).length === 0 && !isSysAdmin) { // Sicherer Zugriff
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
        const displayName = (typeof escapeHtml === 'function' ? escapeHtml(currentUser.displayName || currentUser.mode) : (currentUser.displayName || currentUser.mode));
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
    
    // =================================================================
    // START: HIER IST DIE KORREKTUR FÜR DEINEN BUG
    // =================================================================
    // Wir entfernen die Steuerung der Terminplaner-Listen für Gäste
    // aus dieser Funktion. Das macht jetzt terminplaner.js allein.
    
    const terminplanerMainView = document.getElementById('terminplaner-main-view');
    if (terminplanerMainView) {
        
        const mainShareUrlInput = document.getElementById('main-share-url');
        const mainShareBox = mainShareUrlInput ? mainShareUrlInput.closest('.p-3.bg-gray-100') : null;
        
        // const outstandingSummary = document.getElementById('outstanding-votes-summary'); // <- ENTFERNT
        const divider = terminplanerMainView.querySelector('.my-6.border-t-2.border-gray-800');
        const listsGrid = terminplanerMainView.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.gap-6'); 

        const isGuest = (currentUser.mode === GUEST_MODE);

        if (mainShareBox) {
            mainShareBox.style.display = isGuest ? 'none' : 'inline-flex'; 
        }
        
        // if (outstandingSummary) { // <- BLOCK ENTFERNT
        //     outstandingSummary.style.display = isGuest ? 'none' : 'block'; 
        // }
        
        if (divider) {
            divider.style.display = isGuest ? 'none' : 'block';
        }
        if (listsGrid) {
            listsGrid.style.display = isGuest ? 'none' : 'grid'; 
        }
    }
    // =================================================================
    // ENDE: KORREKTUR
    // =================================================================
}
