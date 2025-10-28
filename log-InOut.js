// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { db, usersCollectionRef, setButtonLoading, adminSectionsState, modalUserButtons, ADMIN_ROLES, adminRolesCollectionRef, rolesCollectionRef, ROLES, alertUser, initialAuthCheckDone, currentUser, GUEST_MODE, adminSettings, CHECKLISTS, ADMIN_STORAGE_KEY, USERS, navigate, auth } from './haupteingang.js';
import { renderModalUserButtons } from './admin_benutzersteuerung.js';
// ENDE-ZIKA //

// ERSETZE die komplette checkCurrentUserValidity Funktion hiermit:
// ERSETZE die komplette checkCurrentUserValidity Funktion hiermit:
export async function checkCurrentUserValidity() { // Funktion ist async
    console.log("--- Prüfe Benutzerberechtigungen (mit Claims V2) ---");

    if (!auth) {
        console.error("checkCurrentUserValidity: Auth-Instanz ist noch nicht initialisiert.");
        if (currentUser.mode !== GUEST_MODE) switchToGuestMode(false);
        updateUIForMode();
        return;
    }

    const currentAuthUser = auth.currentUser; // Aktuellen Firebase Auth User holen
    const storedAppUserId = localStorage.getItem(ADMIN_STORAGE_KEY); // z.B. "MARKUS"
    const userFromFirestore = storedAppUserId ? USERS[storedAppUserId] : null;

    // Fall 1: Kein Firebase User angemeldet -> Sicherstellen, dass Gastmodus aktiv ist
    if (!currentAuthUser) {
        console.log("checkCurrentUserValidity: Kein Firebase User angemeldet.");
        if (storedAppUserId || currentUser.mode !== GUEST_MODE) {
            switchToGuestMode(false); // Ausloggen, falls nötig
        }
        updateUIForMode();
        return;
    }

    // Fall 2: Firebase User ist da, aber kein App User ausgewählt (oder ungültig) -> Als Gast behandeln
    if (!storedAppUserId || !userFromFirestore || !userFromFirestore.isActive) {
        console.log("checkCurrentUserValidity: Firebase User vorhanden, aber kein gültiger App User im Speicher.");
        // Wenn vorher ein App User da war (aber jetzt ungültig ist), ausloggen.
        // Ansonsten prüfen, ob der aktuelle Zustand Gast ist.
        if (currentUser.mode !== GUEST_MODE) {
             // Wenn vorher ein Claim gesetzt war, muss dieser entfernt werden (nicht trivial ohne Backend)
             // Sicherste Lösung: Zum Gastmodus wechseln
             console.log("Wechsle zum Gastmodus, da App User ungültig/fehlt.");
             switchToGuestMode(storedAppUserId ? true : false, storedAppUserId ? "Ihr Profil ist nicht mehr gültig oder wurde deaktiviert." : undefined);
        }
        updateUIForMode();
        return;
    }

    // Fall 3: Firebase User ist da UND App User ("MARKUS") ist ausgewählt/gültig
    console.log(`checkCurrentUserValidity: Firebase User ${currentAuthUser.uid} und App User ${storedAppUserId} vorhanden.`);
    try {
        let idTokenResult = await currentAuthUser.getIdTokenResult();
        let userClaimRole = idTokenResult.claims.appRole;
        console.log("Vorhandener Claim 'appRole':", userClaimRole);

        // --- NEU: Claim setzen, falls nötig ---
        // Wenn der gespeicherte App User ("MARKUS") NICHT mit dem aktuellen Claim übereinstimmt
        // ODER wenn noch gar kein Claim gesetzt ist, dann Cloud Function aufrufen.
        if (!userClaimRole || ROLES[userClaimRole]?.name !== userFromFirestore.role) { // Vergleiche Claim-Rolle mit Firestore-Rolle
             console.log(`Claim fehlt oder stimmt nicht überein (${userClaimRole} vs ${userFromFirestore.role}). Rufe setRoleClaim für ${storedAppUserId}...`);

             // Hier brauchen wir den PIN erneut - das geht so nicht ohne Weiteres.
             // *** WORKAROUND FÜR JETZT: Wir vertrauen darauf, dass handleLogin den PIN geprüft hat ***
             // *** und rufen die Cloud Function ohne erneute PIN-Prüfung auf ***
             // *** ACHTUNG: Das ist weniger sicher! Besser wäre PIN erneut abfragen oder sichere Session. ***

             // Stelle sicher, dass setRoleClaim initialisiert wurde (in haupteingang.js)
             // Dieses Konstrukt ist unschön, besser wäre es, setRoleClaim zu importieren, wenn möglich.
             const tempSetRoleClaim = window.setRoleClaim; // Provisorischer Zugriff über globales Fensterobjekt
             if (!tempSetRoleClaim) throw new Error("Referenz zur setRoleClaim Cloud Function nicht gefunden.");

             // Rufe CF auf, um Claim zu setzen (ohne PIN!)
             // Die CF *muss* angepasst werden, um dies zu erlauben oder eine andere Verifizierung zu nutzen!
             // FÜR DEN TEST JETZT - die CF erwartet den PIN, das wird fehlschlagen!
             // WIR MÜSSEN DIE CF ANPASSEN!

             // ---- BIS HIERHER GEDACHT - NEUER ANSATZ NÖTIG ----

             // *** ALTERNATIVER ANSATZ: ***
             // handleLogin setzt den Claim. checkCurrentUserValidity prüft nur noch.

             // Wir gehen davon aus, dass handleLogin den Claim korrekt gesetzt hat.
             // Wenn kein Claim da ist, ist der Login fehlgeschlagen -> Gastmodus.
             if (!userClaimRole) {
                 console.warn("checkCurrentUserValidity: Kein 'appRole' Claim gefunden nach Login-Versuch. Wechsle zu Gast.");
                 switchToGuestMode(true, "Anmeldung fehlgeschlagen (Rollenprüfung).");
                 updateUIForMode();
                 return;
             }
             // Wenn der Claim nicht zur Rolle im Firestore passt, stimmt etwas nicht -> Gastmodus
              if (ROLES[userClaimRole]?.name !== userFromFirestore.role) { // Ggf. anpassen, falls ROLES[id] !== ROLES[name]
                 console.error(`Claim-Rolle '${userClaimRole}' stimmt nicht mit Firestore-Rolle '${userFromFirestore.role}' überein!`);
                 switchToGuestMode(true, "Rollenkonflikt erkannt. Bitte Admin kontaktieren.");
                 updateUIForMode();
                 return;
             }
        }
        // --- Ende Claim setzen Logik ---


        // --- Berechtigungen basierend auf Claim bestimmen (wie vorher) ---
        let userPermissions = [];
         if (ROLES && ROLES[userClaimRole]) {
             userPermissions = [...(ROLES[userClaimRole].permissions || [])];
         } else {
             console.warn(`Rolle '${userClaimRole}' aus Claim nicht in ROLES gefunden oder ROLES noch nicht geladen.`);
             userPermissions = [...(ROLES && ROLES['NO_RIGHTS'] ? ROLES['NO_RIGHTS'].permissions : [])];
         }

         let currentAssignedAdminRoleId = null;
         if (userClaimRole === 'SYSTEMADMIN') {
             userPermissions = ['ENTRANCE', 'PUSHOVER', 'CHECKLIST', 'CHECKLIST_SWITCH', 'CHECKLIST_SETTINGS', 'ESSENSBERECHNUNG'];
         } else if (userClaimRole === 'ADMIN') {
             if (userFromFirestore.permissionType === 'role' && userFromFirestore.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[userFromFirestore.assignedAdminRoleId]) {
                currentAssignedAdminRoleId = userFromFirestore.assignedAdminRoleId;
             }
         }
        console.log("Final zugewiesene Berechtigungen:", userPermissions);

        // Aktualisiere currentUser Objekt
        Object.keys(currentUser).forEach(key => delete currentUser[key]);
        Object.assign(currentUser, {
            mode: storedAppUserId,
            displayName: userFromFirestore.name,
            role: userClaimRole, // Rolle aus dem Claim!
            permissions: userPermissions,
            permissionType: userFromFirestore.permissionType,
            displayRole: userFromFirestore.displayRole,
            assignedAdminRoleId: currentAssignedAdminRoleId
        });

        console.log("currentUser Objekt aktualisiert:", currentUser);
        updateUIForMode(); // UI aktualisieren

        // Navigation prüfen
         const activeView = document.querySelector('.view.active');
         const isAdminOrSysAdminByClaim = userClaimRole === 'ADMIN' || userClaimRole === 'SYSTEMADMIN';
         if (activeView && activeView.id === 'adminView' && !isAdminOrSysAdminByClaim) {
             alertUser("Ihre Administrator-Rechte wurden entzogen.", "error");
             navigate('home');
         }

    } catch (error) {
         console.error("Fehler beim Holen des ID Tokens oder Prüfen der Claims:", error);
         switchToGuestMode(true, "Fehler bei der Berechtigungsprüfung.");
         updateUIForMode();
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