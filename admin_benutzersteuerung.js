// // @ts-check
// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 // TEST 2
import { onSnapshot, doc, updateDoc, setDoc, deleteDoc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, auth, usersCollectionRef, setButtonLoading, adminSectionsState, rolesCollectionRef, ROLES, roleChangeRequestsCollectionRef, currentUser, alertUser, USERS, initialAuthCheckDone, modalUserButtons, ADMIN_ROLES, ADMIN_STORAGE_KEY, PENDING_REQUESTS, appId } from './haupteingang.js';
import { logAdminAction, renderProtocolHistory } from './admin_protokollHistory.js'; // NEU: renderProtocolHistory importiert
import { setupPermissionDependencies, renderAdminRightsManagement } from './admin_rechteverwaltung.js'; // Oder der richtige Dateiname
// NEU: renderAdminVotesTable importiert
import { renderMainFunctionsAdminArea, restoreAdminScrollIfAny, rememberAdminScroll, renderAdminVotesTable } from './admin_adminfunktionenHome.js';
import { checkCurrentUserValidity, updateUIForMode, switchToGuestMode } from './log-InOut.js';
import { createApprovalRequest } from './admin_genehmigungsprozess.js';
import { renderRoleManagement } from './admin_rollenverwaltung.js'; // NEU: renderRoleManagement importiert
// ENDE-ZIKA //


const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// ERSETZE die Funktion "listenForUserUpdates" in admin_benutzersteuerung.js:

export function listenForUserUpdates() {
    // Sicherheitscheck
    if (!usersCollectionRef) {
        console.error("listenForUserUpdates: FEHLER - usersCollectionRef fehlt.");
        return;
    }

    onSnapshot(usersCollectionRef, (snapshot) => {
        // 1. Prüfen, ob Daten da sind
        if (!snapshot.empty) {
            // 2. Cache leeren und neu befüllen
            Object.keys(USERS).forEach(key => delete USERS[key]);
            snapshot.forEach((doc) => {
                const data = doc.data() || {};
                const { key, ...safeData } = data;
                USERS[doc.id] = { id: doc.id, ...safeData };
            });

            // 3. Eigene Berechtigung prüfen (Live-Schutz)
            if (initialAuthCheckDone) {
                checkCurrentUserValidity(); 
            }

            // 4. Modal für Login aktualisieren (falls offen)
            if (typeof renderModalUserButtons === 'function') {
                renderModalUserButtons();
            }

            // 5. ADMIN UI LIVE UPDATES (Fix für Bug 2 & 3)
            // Wir prüfen direkt, ob das Element im HTML existiert. 
            // Das ist viel sicherer als Status-Variablen.
            
            const isAdminViewActive = document.getElementById('adminView')?.classList.contains('active');
            
            if (isAdminViewActive) {
                // Passwort-Liste aktualisieren (nur wenn sichtbar)
                if (document.getElementById('userKeyList')) {
                    if (typeof renderUserKeyList === 'function') renderUserKeyList();
                }

                // Benutzer-Liste aktualisieren (Das behebt Bug 2!)
                // Wir prüfen, ob die Liste im DOM ist. Wenn ja -> Neu zeichnen.
                if (document.getElementById('registeredUserList')) {
                    console.log("Live-Update: Benutzerliste wird aktualisiert...");
                    if (typeof renderUserManagement === 'function') renderUserManagement();
                }

                // Rollen-Liste aktualisieren
                if (document.getElementById('roleList')) {
                    if (typeof renderRoleManagement === 'function') renderRoleManagement();
                }
                
                // Protokoll aktualisieren
                if (document.getElementById('protocolList')) {
                    if (typeof renderProtocolHistory === 'function') renderProtocolHistory();
                }

                // Admin-Funktionen Tabs aktualisieren
                if (document.getElementById('main-functions-tabs')) {
                    if (typeof renderMainFunctionsAdminArea === 'function') renderMainFunctionsAdminArea();
                }
                
                // Admin-Vote Tabelle aktualisieren (falls vorhanden)
                if (document.getElementById('terminplaner-admin-tbody')) {
                    console.log("Live-Update: Terminplaner Admin-Tabelle wird aktualisiert...");
                    if (typeof renderAdminVotesTable === 'function') renderAdminVotesTable();
                }
            }

        } else {
            console.warn("listenForUserUpdates: Snapshot war leer (Datenbank leer?).");
        }

    }, (error) => {
        console.error("listenForUserUpdates: FEHLER im Listener:", error);
    });
}


// ERSETZE die komplette Funktion hiermit:
// ERSETZE die komplette Funktion hiermit:
export function renderModalUserButtons() {
    // --- SPIONE ---
    console.log("renderModalUserButtons: Funktion wird aufgerufen.");
    console.log("renderModalUserButtons: USERS Objekt VOR Filter:", USERS); // Bleibt drin
    console.log("renderModalUserButtons: Detaillierte Benutzerdaten VOR Filter:", JSON.stringify(Object.values(USERS), null, 2)); // Bleibt drin

    // Prüfen, ob das importierte Element gültig ist
    if (!modalUserButtons) {
        console.error("renderModalUserButtons: FEHLER - Importierte Variable 'modalUserButtons' ist leer!");
        return; // Abbruch, wenn das Element fehlt
    }
    console.log("renderModalUserButtons: Importiertes Element 'modalUserButtons' gefunden:", modalUserButtons);
    // --- ENDE SPIONE ---

    // <<< NEUER CHECK: Sind überhaupt Daten im USERS Objekt? >>>
    if (Object.keys(USERS).length === 0) {
        console.log("renderModalUserButtons: USERS Objekt ist noch leer. Zeige Lade-Nachricht."); // Neuer Spion
        modalUserButtons.innerHTML = '<p class="text-sm text-center text-gray-500">Lade Benutzerdaten...</p>';
        return; // Wichtig: Hier abbrechen, da keine Daten zum Filtern da sind.
    }
    // <<< ENDE NEUER CHECK >>>

    const ROLE_BORDER_COLORS = {
        ADMIN: 'border-red-500',
        SYSTEMADMIN: 'border-purple-700',
        DEFAULT: 'border-indigo-500'
    };

    // Filter bleibt gleich
    const allUsers = Object.values(USERS).filter(u =>
        u.name && u.permissionType !== 'not_registered'
    );

    console.log("renderModalUserButtons: Anzahl User NACH Filter:", allUsers.length); // Spion bleibt

    modalUserButtons.innerHTML = ''; // Leeren des Containers

    // <<< ANGEPASSTER CHECK: Wird jetzt erst nach dem Filter geprüft >>>
    if (allUsers.length === 0) {
        console.log("renderModalUserButtons: Keine Benutzer zum Anzeigen nach Filterung."); // Spion bleibt
        // <<< ANGEPASSTE NACHRICHT: Deutlicher machen, WARUM nichts angezeigt wird >>>
        modalUserButtons.innerHTML = '<p class="text-sm text-center text-gray-500">Keine anmeldbaren Benutzer gefunden (Filterkriterien nicht erfüllt oder Datenproblem).</p>';
        return;
    }
    // <<< ENDE ANGEPASSTER CHECK >>>


    // Schleife zum Rendern der Buttons bleibt gleich
    allUsers.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'select-user-button w-full p-4 bg-gray-50 hover:bg-indigo-50 rounded-lg shadow-sm flex items-center gap-4 cursor-pointer transition duration-150 border-l-4';
        userCard.dataset.user = user.id;

        const borderColor = ROLE_BORDER_COLORS[user.role] || ROLE_BORDER_COLORS.DEFAULT;
        userCard.classList.add(borderColor);

        userCard.innerHTML = `
         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6 text-gray-400">
             <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-5.5-2.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM10 12a5.99 5.99 0 0 0-4.793 2.39A6.483 6.483 0 0 0 10 16.5a6.483 6.483 0 0 0 4.793-2.11A5.99 5.99 0 0 0 10 12Z" clip-rule="evenodd" />
         </svg>
         <span class="text-lg font-medium text-gray-800">${user.name}</span>
         `;
        modalUserButtons.appendChild(userCard); // Füge zum korrekten Element hinzu
    });

    console.log("renderModalUserButtons: Rendern der Benutzer abgeschlossen."); // Spion bleibt
}

// Ersetze diese Funktion komplett in admin_benutzersteuerung.js
export function renderUserKeyList() {
    const userKeyList = document.getElementById('userKeyList');
    if (!userKeyList) {
        console.error("renderUserKeyList: Container #userKeyList nicht gefunden.");
        return; // Frühzeitiger Abbruch, wenn Container fehlt
    }
    userKeyList.innerHTML = ''; // Leeren vor dem Neuaufbau

    // Prüfen, ob currentUser und ROLES geladen sind
    if (!currentUser || !ROLES) {
        userKeyList.innerHTML = '<p class="text-center text-gray-500">Benutzerdaten werden geladen...</p>';
        // Optional: Nach kurzer Zeit erneut versuchen
        // setTimeout(renderUserKeyList, 300);
        return;
    }

    const isAdmin = currentUser.role === 'ADMIN' || (currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN');
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';

    Object.values(USERS || {}) // || {} zur Sicherheit
        .filter(user => user.permissionType !== 'not_registered')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .forEach(user => {
            const userId = user.id;
            if (!user.name) return; // Überspringe Benutzer ohne Namen

            const isSelf = userId === currentUser.mode;
            const isTargetSysAdmin = user.role === 'SYSTEMADMIN';
            const isTargetAdmin = user.role === 'ADMIN' || (user.permissionType === 'individual' && user.displayRole === 'ADMIN');
            // Nur SysAdmin darf SysAdmin bearbeiten (sich selbst nicht), Admin darf nur Nicht-Admins/SysAdmins
            const canEditKey = (isSysAdmin && !isTargetSysAdmin && !isSelf) || (isAdmin && !isTargetSysAdmin && !isTargetAdmin) || isSelf;
            const canViewKey = canEditKey; // Gleiche Logik für das Sehen des Schlüssels
            const keyDisplay = '••••••••••';
            const currentUserLabel = isSelf ? '<span class="bg-indigo-100 text-indigo-800 font-bold text-xs px-2 py-1 rounded-full ml-2">AKTUELL</span>' : '';

            const userDiv = document.createElement('div');
            userDiv.className = `p-3 border rounded-lg ${!canEditKey ? 'bg-gray-200 opacity-70' : 'bg-gray-50'}`;
            // Verwende die globale escapeHtml Funktion
            userDiv.innerHTML = `
             <p class="font-bold text-gray-800 flex items-center">${escapeHtml(user.name)} ${currentUserLabel}</p>
             <p class="text-xs text-gray-500 mb-2">Rolle: ${escapeHtml(ROLES[user.role]?.name || ROLES[user.displayRole]?.name || 'Keine Rolle')}</p>
             <div class="mb-3"><label class="block text-xs font-medium text-gray-600">Aktueller Schlüssel</label><input type="text" value="${escapeHtml(keyDisplay)}" class="w-full p-2 bg-gray-200 border rounded-md text-sm text-gray-700" readonly></div>
             <div class="flex space-x-2">
                 <input type="password" class="new-key-input flex-grow p-2 border rounded-lg text-sm" placeholder="Neuen Schlüssel eingeben" ${!canEditKey ? 'disabled' : ''}>
                 <button class="save-key-button py-2 px-3 bg-blue-600 text-white text-sm font-semibold rounded-lg ${!canEditKey ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'}" data-userid="${userId}" ${!canEditKey ? 'disabled' : ''}>
                     <span class="button-text">Speichern</span>
                     <div class="loading-spinner" style="display: none;"></div>
                 </button>
             </div>`;
            userKeyList.appendChild(userDiv);
        });

    // --- KORRIGIERTER Event-Listener für die Speicher-Buttons ---
    userKeyList.querySelectorAll('.save-key-button').forEach(button => {
        // Prüfe mit dataset, ob Listener schon dran ist (sicherer)
        if (!button.dataset.listenerAttached) {
            button.addEventListener('click', async (e) => {
                const currentButton = e.currentTarget; // Den Button selbst referenzieren
                const userId = currentButton.dataset.userid;
                const userToEdit = USERS[userId]; // Benutzerdaten holen
                if (!userToEdit) return; // Abbruch, falls User nicht gefunden

                const isSelf = userId === currentUser.mode;

                // Sicherheitsabfrage nur für ANDERE Benutzer
                if (!isSelf && !confirm(`Möchten Sie das Passwort für ${userToEdit.name} wirklich ändern?`)) {
                    return; // Abbruch bei "Nein"
                }

                const flexContainer = currentButton.closest('.flex'); // Den Container des Buttons finden
                if (!flexContainer) return; // Abbruch, wenn Struktur unerwartet ist

                const newKeyInput = flexContainer.querySelector('.new-key-input');
                if (!newKeyInput) return; // Abbruch, wenn Input-Feld nicht gefunden

                const newKey = newKeyInput.value; // Kein .trim(), falls Leerzeichen erlaubt sind

                // Längenprüfung
                if (newKey.length < 4) {
                    return alertUser("Schlüssel muss mindestens 4 Zeichen haben.", "error");
                }

                // Try-Catch Block für Fehlerbehandlung und Await
                try {
                    setButtonLoading(currentButton, true); // Ladezustand aktivieren
                    console.log(`Versuche Passwort für User ${userId} zu ändern...`); // Debug

                    if (!window.setUserKey) {
                        throw new Error("Cloud Function (setUserKey) ist noch nicht initialisiert. Bitte warten.");
                    }
                    await window.setUserKey({ appUserId: userId, newKey });
                    console.log(`Passwort für User ${userId} erfolgreich in Firebase geändert.`); // Debug

                    // Warten auf Log-Eintrag
                    await logAdminAction('password_changed', `Passwort für '${userToEdit.name}' wurde geändert.`);
                    console.log(`Admin-Aktion geloggt.`); // Debug

                    // Erfolgsmeldung erst NACH erfolgreichem Speichern
                    alertUser(`Schlüssel für ${userToEdit.name} wurde aktualisiert!`, "success");

                    newKeyInput.value = ''; // Input-Feld leeren

                    // Optional: Lokale Daten auch aktualisieren (sollte aber durch Listener passieren)
                    // if (USERS[userId]) USERS[userId].key = newKey;
                    // renderUserKeyList(); // Nicht neu rendern, Listener sollte das tun

                } catch (error) {
                    // Fehlermeldung anzeigen
                    console.error("Fehler beim Speichern des Schlüssels:", error);
                    alertUser(`Fehler beim Speichern des Schlüssels: ${error.message}`, "error");
                } finally {
                    setButtonLoading(currentButton, false); // Ladezustand immer deaktivieren
                }
            });
            button.dataset.listenerAttached = 'true'; // Markieren, dass Listener dran ist
        }
    });
}

export function renderUserManagement() {
    // KORREKTUR: 'async' und 'await import' ENTFERNT

    const userManagementArea = document.getElementById('userManagementArea');
    if (!userManagementArea) {
        console.error("renderUserManagement: Container #userManagementArea nicht gefunden.");
        return;
    }

    // Frühe Überprüfung der Referenzen
    if (!roleChangeRequestsCollectionRef || !usersCollectionRef || !rolesCollectionRef) {
        userManagementArea.innerHTML = `<p class="text-center text-red-500">Datenbankverbindung wird noch aufgebaut...</p>`;
        return;
    }

    // Admin-Berechtigungen ermitteln
    let effectiveAdminPerms = {};
    const isAdmin = currentUser.role === 'ADMIN' || (currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN');
    const isSysAdminEditing = currentUser.role === 'SYSTEMADMIN';
    if (isAdmin) {
        const adminUser = USERS[currentUser.mode];
        if (adminUser) {
            const adminPermType = adminUser.adminPermissionType || 'role';
            if (adminPermType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
            } else {
                effectiveAdminPerms = adminUser.adminPermissions || {};
            }
        }
    }
    const permSet = (isSysAdminEditing) ? {
        canToggleUserActive: true, canDeleteUser: true, canRenameUser: true,
        canChangeUserPermissionType: true, canCreateUser: true
    } : effectiveAdminPerms;

    // --- HTML-Grundgerüst ---
    userManagementArea.innerHTML = `
        <button id="showAddUserFormBtn" class="w-full p-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition shadow-md ${!permSet.canCreateUser ? 'hidden' : ''}">+ Benutzer anlegen</button>
        
        <div id="addUserFormContainer" class="p-4 border rounded-xl bg-green-50 hidden">
            <h4 class="font-bold text-lg text-green-800 mb-2">Neuen Benutzer anlegen</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" id="newUserName" class="p-2 border rounded-lg" placeholder="Nickname">
                <input type="text" id="newUserRealName" class="p-2 border rounded-lg" placeholder="Vorname Nachname">
                <div id="newUserKeyWrapper" class="sm:col-span-1">
                    <input type="password" id="newUserKey" class="p-2 border rounded-lg w-full" placeholder="Passwort (mind. 4 Zeichen)">
                </div>
                <select id="newUserPermissionType" class="p-2 border rounded-lg bg-white">
                    <option value="role" selected>Rolle (Standard)</option>
                    <option value="individual">Individuell</option>
                    <option value="not_registered">Nicht registriert</option>
                </select>
                <select id="newUserRole" class="p-2 border rounded-lg bg-white sm:col-span-2">
                    </select>
                <button id="saveNewUserButton" class="sm:col-span-2 p-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">
                    <span class="button-text">Erstellen</span>
                    <div class="loading-spinner" style="display: none;"></div>
                </button>
            </div>
        </div>
        
        <div id="registeredUserList" class="space-y-3 pt-4 border-t mt-4"></div>
        
        <div class="mt-6 pt-4 border-t">
            <button id="notRegisteredToggle" class="w-full flex justify-between items-center p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-left font-semibold text-gray-700">
                <span>Nicht registrierte Personen (<span id="notRegisteredCount">0</span>)</span>
                <svg id="notRegisteredToggleIcon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5 transform transition-transform">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
            </button>
            <div id="notRegisteredList" class="hidden mt-2 space-y-2 pl-4 border-l-2 border-gray-200">
                </div>
        </div>`;

    // Listener für "+ Benutzer anlegen" Button
    const addUserBtn = userManagementArea.querySelector('#showAddUserFormBtn');
    if (addUserBtn && !addUserBtn.dataset.listenerAttached) {
        addUserBtn.addEventListener('click', () => {
            const formContainer = userManagementArea.querySelector('#addUserFormContainer');
            if (formContainer) {
                const isHidden = formContainer.classList.toggle('hidden');
                addUserBtn.textContent = isHidden ? '+ Benutzer anlegen' : 'Schließen';
            }
        });
        addUserBtn.dataset.listenerAttached = 'true';
    }

    // Listener für Typ-Auswahl im "Neu anlegen"-Formular
    const newUserPermTypeSelect = userManagementArea.querySelector('#newUserPermissionType');
    if (newUserPermTypeSelect && !newUserPermTypeSelect.dataset.listenerAttached) {
        newUserPermTypeSelect.addEventListener('change', toggleNewUserRoleField); // Ruft die importierte Funktion auf
        newUserPermTypeSelect.dataset.listenerAttached = 'true';
    }

    // --- Daten vorbereiten ---
    const allUsers = Object.values(USERS).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const registeredUsers = allUsers.filter(u => u.permissionType !== 'not_registered');
    const notRegisteredUsers = allUsers.filter(u => u.permissionType === 'not_registered');

    const registeredListContainer = userManagementArea.querySelector('#registeredUserList');
    const notRegisteredListContainer = userManagementArea.querySelector('#notRegisteredList');
    if (registeredListContainer) registeredListContainer.innerHTML = '';
    if (notRegisteredListContainer) notRegisteredListContainer.innerHTML = '';

    const notRegCountEl = userManagementArea.querySelector('#notRegisteredCount'); // Korrigierter Selektor
    if (notRegCountEl) notRegCountEl.textContent = notRegisteredUsers.length;

    // Rollenoptionen für "Neu Anlegen"
    const roleOptionsHTML = Object.values(ROLES).filter(r => r.id !== 'SYSTEMADMIN' && r.id !== 'ADMIN' && r.id !== 'NO_RIGHTS').map(role => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('');
    const newUserRoleSelect = userManagementArea.querySelector('#newUserRole');
    if (newUserRoleSelect) { newUserRoleSelect.innerHTML = roleOptionsHTML; newUserRoleSelect.value = 'ANGEMELDET'; }

    // =================================================================
    // BEGINN DER ÄNDERUNG (Neue Berechtigungen)
    // =================================================================
    // Verfügbare Berechtigungen
    const allPermissions = {
        'ENTRANCE': 'Haupteingang öffnen',
        'PUSHOVER': 'Push-Nachricht senden',
        'PUSHMAIL_CENTER': 'PUSHMAIL-Center',
        'PUSHOVER_SETTINGS_GRANTS': '-> Einstellungen-Button zum Berechtigungen anlegen',
        'PUSHOVER_NOTRUF_SETTINGS': '-> Notruf-Einstellungen',
        'PUSHOVER_NOTRUF_SETTINGS_FLIC': '-> -> Flic-Notruf-Button',
        'PUSHOVER_NOTRUF_SETTINGS_NACHRICHTENCENTER': '-> -> Nachrichtencenter',
        'PUSHOVER_NOTRUF_SETTINGS_ALARM_PROGRAMME': '-> -> Alarm-Programme',
        'CHECKLIST': 'Aktuelle Checkliste',
        'CHECKLIST_SWITCH': '-> Listen umschalten',
        'CHECKLIST_SETTINGS': '-> Checkliste-Einstellungen',
        'ESSENSBERECHNUNG': 'Essensberechnung',
        'TERMINPLANER': 'Termin finden',
        'TERMINPLANER_CREATE': '-> Neuen Termin anlegen',
        'ZAHLUNGSVERWALTUNG': 'Zahlungsverwaltung',
        'ZAHLUNGSVERWALTUNG_CREATE': '-> Neue Zahlung anlegen',
        'TICKET_SUPPORT': 'Ticket Support',
        'WERTGUTHABEN': 'Wertguthaben',
        'LIZENZEN': 'Lizenzen',
        'VERTRAGSVERWALTUNG': 'Vertragsverwaltung',
        'REZEPTE': 'Rezepte'
    };
    // =================================================================
    // ENDE DER ÄNDERUNG
    // =================================================================

    // Optionen für Angezeigten Status (OHNE SYSTEMADMIN)
    const displayRoleOptions = Object.values(ROLES)
        .filter(r => r.id !== 'SYSTEMADMIN') // SYSTEMADMIN herausfiltern
        .map(role => `<option value="${role.id}">${escapeHtml(role.name.replace(/-/g, '').trim())}</option>`)
        .join('');

    // --- Rendern der Benutzerkarten ---
    const createUserCardHTML = (user) => {
        const userId = user.id;

        // Prüfe, ob für diesen Benutzer eine "pending" Anfrage existiert
        const pendingRequestsForUser = PENDING_REQUESTS[userId] || [];
        const isLocked = pendingRequestsForUser.length > 0;

        const isSelf = userId === currentUser.mode;
        const isTargetSysAdmin = user.role === 'SYSTEMADMIN';

        // =================================================================
        // BEGINN DER KORREKTUR (FEHLER 1)
        // =================================================================

        // NEU: Prüfen, ob der ZIEL-Benutzer (user) ein Admin ist, EGAL WIE.
        const isTargetStandardAdmin = user.role === 'ADMIN';
        const isTargetIndividualAdmin = user.permissionType === 'individual' && user.displayRole === 'ADMIN';
        // NEUE Variable: ist wahr, wenn EGAL WELCHE Art von Admin
        const isTargetAnAdmin = isTargetStandardAdmin || isTargetIndividualAdmin;

        // =================================================================
        // ENDE DER KORREKTUR (FEHLER 1)
        // =================================================================

        const isNotRegistered = user.permissionType === 'not_registered';

        let canEdit = false;
        if (isSysAdminEditing) {
            canEdit = !isSelf && !isTargetSysAdmin;
        } else if (isAdmin) {
            // ALT: canEdit = !isTargetSysAdmin && !isTargetAdmin;
            // NEU: Ein Admin darf keinen SysAdmin UND auch keinen anderen Admin (egal ob Rolle oder Individuell) bearbeiten.
            canEdit = !isTargetSysAdmin && !isTargetAnAdmin; // <--- HIER DIE KORREKTUR
        }
        if (isNotRegistered && (isAdmin || isSysAdminEditing)) canEdit = true;

        // KORREKTUR: Wenn die Karte gesperrt ist, kann nichts geändert werden
        const canToggle = permSet.canToggleUserActive && canEdit && !isSelf && !isNotRegistered && !isLocked;
        const canDelete = permSet.canDeleteUser && canEdit && !isSelf && !isLocked;
        const canRename = (permSet.canRenameUser && canEdit && !isLocked) || (isSysAdminEditing && isSelf && !isLocked);
        const canChangePerms = permSet.canChangeUserPermissionType && canEdit && !isNotRegistered && !isLocked;

        const currentUserLabel = isSelf ? '<span class="bg-indigo-100 text-indigo-800 font-bold text-xs px-2 py-1 rounded-full ml-2">AKTUELL</span>' : '';
        const realNameDisplay = user.realName ? `<span class="text-gray-500 italic text-sm ml-1 real-name-display">(${escapeHtml(user.realName)})</span>` : '';

        let roleName = 'Unbekannt';
        let roleColorClass = 'text-gray-500';

        if (isNotRegistered) {
            roleName = 'Nicht registriert';
            roleColorClass = 'text-gray-400 italic';
        } else {
            const effectiveRoleId = (user.permissionType === 'role') ? user.role : (user.displayRole || 'NO_RIGHTS');
            roleName = ROLES[effectiveRoleId]?.name || 'Keine Rolle';

            if (effectiveRoleId === 'SYSTEMADMIN') {
                roleColorClass = 'text-purple-600 font-bold';
            } else if (effectiveRoleId === 'ADMIN') {
                roleColorClass = 'text-red-600 font-bold';
            }
        }

        let permissionsHTML = '';
        if (!isNotRegistered) {
            const permType = user.permissionType || 'role';
            let selectedDisplayRole = user.displayRole || 'NO_RIGHTS';

            const finalDisplayRoleOptionsWithSelection = displayRoleOptions.replace(`value="${selectedDisplayRole}"`, `value="${selectedDisplayRole}" selected`);

            // Diese Schleife erstellt jetzt automatisch die neuen Checkboxen
            // basierend auf der von uns geänderten 'allPermissions'-Liste.
            const allPermissionsHTML = Object.keys(allPermissions).map(permKey => {
                let marginLeft = '';
                if (permKey.startsWith('PUSHOVER_NOTRUF_SETTINGS_')) {
                    marginLeft = 'pl-12';
                } else {
                    const isSubPermission =
                        permKey.startsWith('CHECKLIST_') ||
                        permKey.startsWith('TERMINPLANER_') ||
                        permKey.startsWith('ZAHLUNGSVERWALTUNG_') ||
                        permKey.startsWith('TICKET_SUPPORT_') ||
                        permKey.startsWith('WERTGUTHABEN_') ||
                        (permKey.startsWith('PUSHOVER_') && permKey !== 'PUSHOVER');
                    marginLeft = isSubPermission ? 'pl-6' : '';
                }

                return `<label class="flex items-center ${marginLeft}">
                           <input type="checkbox" class="custom-perm-checkbox h-4 w-4" data-perm="${permKey}" ${(user.customPermissions || []).includes(permKey) ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}>
                           <span class="ml-2 text-sm">${escapeHtml(allPermissions[permKey])}</span>
                        </label>`;
            }).join('');

            permissionsHTML = `
            <div class="mt-4 pt-3 border-t" data-userid="${userId}">
                <label class="block text-sm font-medium text-gray-700 mb-2">Berechtigungs-Typ</label>
                <div class="flex items-center gap-4">
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="role" class="perm-type-toggle h-4 w-4" ${permType === 'role' ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}> <span class="ml-2">Rolle</span></label>
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="individual" class="perm-type-toggle h-4 w-4" ${permType === 'individual' ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}> <span class="ml-2">Individuell</span></label>
                </div>
                <div class="role-selection-area mt-2 ${permType === 'role' ? '' : 'hidden'}">
                    <select class="user-role-select w-full p-2 border rounded-lg bg-white text-sm" ${!canChangePerms ? 'disabled' : ''}>
                        ${Object.values(ROLES).filter(r => (isSysAdminEditing || (r.id !== 'SYSTEMADMIN'))).map(role => `<option value="${role.id}" ${user.role === role.id ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="individual-perms-area mt-3 ${permType === 'individual' ? '' : 'hidden'}">
                    <div class="flex items-center gap-3 p-2 bg-indigo-50 rounded-lg">
                         <label class="text-sm font-medium text-gray-700 whitespace-nowrap">Angezeigter Status:</label>
                         <select class="display-role-select w-full p-1 border rounded-lg bg-white text-sm" ${!canChangePerms ? 'disabled' : ''}>
                            ${finalDisplayRoleOptionsWithSelection}
                         </select>
                    </div>
                    <div class="space-y-2 mt-3 pt-3 border-t">
                        ${allPermissionsHTML} 
                    </div>
                </div>
                <div class="flex justify-end mt-3 hidden save-perms-container">
                     <button class="save-perms-button py-1 px-3 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Berechtigungen speichern</button>
                </div>
            </div>`;
        }
        const lockToggleHTML = !isNotRegistered ? `<label class="flex items-center ${canToggle ? 'cursor-pointer' : 'cursor-not-allowed'}"><span class="mr-2 text-sm font-medium">Gesperrt: <span class="${!user.isActive ? 'text-red-700' : 'text-green-700'} font-bold">${!user.isActive ? 'JA' : 'NEIN'}</span></span><div class="relative"><input type="checkbox" class="sr-only user-active-toggle" data-userid="${userId}" ${!user.isActive ? 'checked' : ''} ${!canToggle ? 'disabled' : ''}><div class="block bg-gray-300 w-10 h-6 rounded-full"></div><div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition"></div></div></label>` : '<div class="w-10 h-6"></div>';

        // Erzeuge die Warnmeldung, wenn die Karte gesperrt ist
        let lockedWarningHTML = '';
        if (isLocked) {
            const requestTypes = pendingRequestsForUser.map(r => r.type).join(', '); // z.B. "RENAME_USER"
            lockedWarningHTML = `
            <div class="mt-3 p-2 bg-yellow-100 border-l-4 border-yellow-400 text-yellow-800 rounded-md">
                <p class="font-bold text-sm flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v3.69l1.47-1.47a.75.75 0 1 1 1.06 1.06L9.81 7.25l1.47 1.47a.75.75 0 1 1-1.06 1.06L8.75 8.31v3.69a.75.75 0 0 1-1.5 0V8.31l-1.47 1.47a.75.75 0 1 1-1.06-1.06l1.47-1.47L5.22 5.78a.75.75 0 0 1 1.06-1.06l1.47 1.47V2.5A.75.75 0 0 1 8 1.75Z" clip-rule="evenodd" /></svg>
                    Genehmigung ausstehend
                </p>
                <p class="text-xs mt-1 ml-6">Aktion: ${requestTypes}</p>
            </div>`;
        }

        // Füge die Sperr-Klassen zur Hauptkarte hinzu
        const lockedClasses = isLocked ? 'bg-yellow-50 opacity-70 border-yellow-300' : 'bg-gray-50';

        return `
        <div class="user-card p-3 border rounded-lg flex flex-col gap-3 ${!canEdit && !isSelf ? 'bg-gray-200 opacity-70' : lockedClasses}" data-userid="${userId}">
            <div class="flex justify-between items-start"> 
                <div class="flex-grow"> 
                    <div class="flex items-center gap-2 flex-wrap"> 
                        <div data-userid="${userId}" class="name-display font-bold text-gray-800">${escapeHtml(user.name || 'Unbenannt')} ${currentUserLabel} ${realNameDisplay}</div> 
                        
                        <div data-userid="${userId}" class="name-edit-container hidden flex-grow gap-2 items-center"> 
                            <input type="text" value="${escapeHtml(user.name || '')}" class="edit-nickname-input p-1 border rounded w-full text-sm" placeholder="Nickname"> 
                            <input type="text" value="${escapeHtml(user.realName || '')}" class="edit-realname-input p-1 border rounded w-full text-sm bg-gray-100 cursor-not-allowed" placeholder="Vollständiger Name" disabled> 
                            <button class="save-name-btn p-1 ml-1 bg-green-500 text-white rounded text-xs">✔️</button> 
                        </div> 
                        
                        ${canRename ? `<button class="rename-user-btn p-1" data-userid="${userId}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-gray-500 hover:text-indigo-600"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.775a.75.75 0 0 0-.22.53l-.5 2.5a.75.75 0 0 0 .913.913l2.5-.5a.75.75 0 0 0 .53-.22l4.263-4.262a1.75 1.75 0 0 0 0-2.475Z" /><path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v9.5c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25V9.5a.75.75 0 0 1 1.5 0v5.25A2.75 2.75 0 0 1 14.25 18h-9.5A2.75 2.75 0 0 1 2 15.25v-9.5A2.75 2.75 0 0 1 4.75 3.5h5.25a.75.75 0 0 1 0 1.5H4.75Z" /></svg></button>` : ''} 
                    </div> 
                    <p class="text-xs ${roleColorClass}">${escapeHtml(roleName)}</p> 
                </div> 
                ${lockToggleHTML} 
            </div>
            ${permissionsHTML}
            <div class="flex justify-end mt-2"> 
                <button class="delete-user-button py-1 px-3 text-xs font-semibold bg-red-600 text-white rounded-lg ${!canDelete ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-700'}" data-userid="${userId}" ${!canDelete ? 'disabled' : ''}>Löschen</button> 
            </div>
            ${lockedWarningHTML} 
        </div>`;
    };

    // Rendere registrierte Benutzer
    if (registeredUsers.length > 0 && registeredListContainer) {
        registeredUsers.forEach(user => { registeredListContainer.innerHTML += createUserCardHTML(user); });
    } else if (registeredListContainer) {
        registeredListContainer.innerHTML = '<p class="text-sm text-center text-gray-400">Keine registrierten Benutzer vorhanden.</p>';
    }

    // Rendere nicht registrierte Benutzer
    if (notRegisteredUsers.length > 0 && notRegisteredListContainer) {
        notRegisteredUsers.forEach(user => { notRegisteredListContainer.innerHTML += createUserCardHTML(user); });
    } else if (notRegisteredListContainer) {
        notRegisteredListContainer.innerHTML = '<p class="text-xs text-center text-gray-400">Keine nicht registrierten Personen vorhanden.</p>';
    }

    // --- Event Listener hinzufügen ---
    addAdminUserManagementListeners(userManagementArea, isAdmin, isSysAdminEditing, permSet, allPermissions, displayRoleOptions);
    restoreAdminScrollIfAny();
}


// Ersetze DIESE Funktion komplett in admin_benutzersteuerung.js
// admin_benutzersteuerung.js

// ... (Rest der Datei, bis zur Funktion addAdminUserManagementListeners) ...


export function addAdminUserManagementListeners(area, isAdmin, isSysAdminEditing, permSet, allPermissions, displayRoleOptions) {
    if (!area) return;

    // --- Nur EINEN primären Listener hinzufügen ---
    if (area.dataset.userManagementListenerAttached === 'true') {
        return;
    }
    area.dataset.userManagementListenerAttached = 'true';
    console.log("addAdminUserManagementListeners: Hänge primären Listener an userManagementArea an.");

    // --- CLICK Listener ---
    area.addEventListener('click', async (e) => {
        const userCard = e.target.closest('.user-card');
        const userId = userCard?.dataset.userid;

        // =================================================================
        // Buttons AUSSERHALB der Karten (z.B. "Neuer Benutzer")
        // =================================================================

        // Logik für "Speichern" des neuen Benutzers
        const saveNewUserButton = e.target.closest('#saveNewUserButton');
        if (saveNewUserButton) {
            console.log("[CLICK] 'Neuen Benutzer speichern' geklickt.");
            const form = saveNewUserButton.closest('#addUserFormContainer');
            if (!form) return;

            const nameInput = form.querySelector('#newUserName');
            const realNameInput = form.querySelector('#newUserRealName');
            const keyInput = form.querySelector('#newUserKey');
            const typeSelect = form.querySelector('#newUserPermissionType');

            const roleSelect = form.querySelector('#newUserRole');

            const name = nameInput.value.trim();
            const realName = realNameInput.value.trim();
            const type = typeSelect.value;
            const key = keyInput.value; // Kein trim!

            if (!name) return alertUser("Nickname ist ein Pflichtfeld.", "error");
            if (!realName) return alertUser("Vorname & Nachname ist ein Pflichtfeld.", "error");

            if (type !== 'not_registered' && key.length < 4) return alertUser("Passwort muss mind. 4 Zeichen haben.", "error");

            if (type === 'role' && roleSelect.value === 'SYSTEMADMIN' && currentUser.role !== 'SYSTEMADMIN') {
                return alertUser("Nur Systemadmins dürfen die Rolle SYSTEMADMIN zuweisen.", "error");
            }

            // 1. Prüfe, ob der neue Benutzer ein Admin sein wird
            const willBeAdmin = (type === 'role' && roleSelect.value === 'ADMIN');

            // 2. Hole die Genehmigungsregeln des aktuellen Admins
            const approvalRules = currentUser.adminPermissions?.approvalRequired || {};

            let needsApproval = false;
            if (willBeAdmin) {
                // Wenn es eine Beförderung zum Admin ist
                needsApproval = approvalRules['setAdminStatus'] === true;
            } else {
                // Sonst normale User-Erstellung
                needsApproval = approvalRules['canCreateUser'] === true;
            }

            const newUserData = {
                name: name,
                realName: realName,
                key: type !== 'not_registered' ? key : null,
                permissionType: type,
                role: type === 'role' ? roleSelect.value : null,
                customPermissions: [],
                adminPermissions: {},
                assignedAdminRoleId: null,
                displayRole: null,
                isActive: true
            };

            try {
                setButtonLoading(saveNewUserButton, true);

                const autoApproveFlag = !needsApproval;

                console.log(`[Auto-Approve Check]: willBeAdmin='${willBeAdmin}', NeedsApproval='${needsApproval}', Setting autoApproveFlag='${autoApproveFlag}'`);

                const newDocRef = doc(usersCollectionRef);
                newUserData.newUserId = newDocRef.id;

                await createApprovalRequest(
                    'CREATE_USER',
                    newDocRef.id,
                    {
                        userData: newUserData,
                        autoApprove: autoApproveFlag
                    }
                );

                if (autoApproveFlag) {
                    await logAdminAction('user_created_autoapproved', `Neuen Benutzer angelegt (Auto-Approve): '${name}'.`);
                } else {
                    await logAdminAction('user_created_pending', `Antrag für Benutzer '${name}' eingereicht.`);
                }

                // Formular zurücksetzen
                nameInput.value = '';
                realNameInput.value = '';
                keyInput.value = '';
                typeSelect.value = 'role';
                roleSelect.value = 'ANGEMELDET';
                toggleNewUserRoleField();
                form.classList.add('hidden');
                const addUserBtn = document.getElementById('showAddUserFormBtn');
                if (addUserBtn) addUserBtn.textContent = '+ Benutzer anlegen';

            } catch (error) {
                console.error("Fehler beim Anlegen des Benutzers (via Request):", error);
                alertUser("Fehler beim Erstellen der Anfrage.", "error");
            } finally {
                setButtonLoading(saveNewUserButton, false);
            }
            return; // Klick behandelt
        }

        // Logik für "Nicht registrierte" aufklappen
        const notRegisteredToggle = e.target.closest('#notRegisteredToggle');
        if (notRegisteredToggle) {
            console.log("[CLICK] 'Nicht registrierte' Toggle geklickt.");
            const list = area.querySelector('#notRegisteredList');
            const icon = notRegisteredToggle.querySelector('svg');
            if (list) {
                list.classList.toggle('hidden');
                if (icon) {
                    icon.classList.toggle('rotate-100');
                }
            }
            return; // Klick behandelt
        }

        // =================================================================
        // Aktionen INNERHALB einer Benutzerkarte
        // =================================================================
        if (!userCard || !userId) return;

        // Hole den originalen Benutzerstatus
        const originalUser = USERS[userId];
        if (!originalUser) return;

        console.log(`[CLICK] Klick innerhalb der Karte für User: ${originalUser.name}`);

        // --- LÖSCHEN BUTTON (Der Teil, der defekt war) ---
        const deleteButton = e.target.closest('.delete-user-button');
        if (deleteButton) {

            // 1. Guthaben-Check (Benötigt appId aus Imports!)
            try {
                const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
                const qCredit = query(paymentsRef,
                    where('type', '==', 'credit'),
                    where('status', '==', 'open'),
                    where('involvedUserIds', 'array-contains', userId)
                );
                const snapCredit = await getDocs(qCredit);

                if (!snapCredit.empty) {
                    alertUser("Löschen nicht möglich: Benutzer hat noch aktives Guthaben (Schulden oder Guthaben)!", "error");
                    return;
                }
            } catch (err) {
                console.error("Fehler beim Guthaben-Check (1. Versuch):", err);

                try {
                    console.log("Guthaben-Check: Versuche Token/Claims zu refreshen und prüfe erneut...");
                    await auth?.currentUser?.getIdTokenResult(true);

                    const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
                    const qCredit = query(paymentsRef,
                        where('type', '==', 'credit'),
                        where('status', '==', 'open'),
                        where('involvedUserIds', 'array-contains', userId)
                    );
                    const snapCredit = await getDocs(qCredit);

                    if (!snapCredit.empty) {
                        alertUser("Löschen nicht möglich: Benutzer hat noch aktives Guthaben (Schulden oder Guthaben)!", "error");
                        return;
                    }
                } catch (retryErr) {
                    console.error("Fehler beim Guthaben-Check (2. Versuch):", retryErr);
                    alertUser("Fehler bei der Guthaben-Prüfung. Benutzer kann nicht sicher gelöscht werden.", "error");
                    return;
                }
            }

            // 2. Sicherheitsabfrage
            if (!confirm(`Soll der Benutzer '${originalUser.name}' wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;

            rememberAdminScroll();

            try {
                const approvalRules = currentUser.adminPermissions?.approvalRequired || {};
                const needsApproval = approvalRules['canDeleteUser'] === true;
                const autoApproveFlag = !needsApproval;

                await createApprovalRequest(
                    'DELETE_USER',
                    userId,
                    {
                        autoApprove: autoApproveFlag
                    }
                );

                if (autoApproveFlag) {
                    await logAdminAction('user_deleted_autoapproved', `Benutzer '${originalUser.name}' gelöscht (Auto-Approve).`);
                } else {
                    await logAdminAction('user_deleted_pending', `Antrag zum Löschen von '${originalUser.name}' eingereicht.`);
                }
            } catch (error) {
                console.error("Fehler beim Senden der Lösch-Anfrage:", error);
                alertUser("Fehler beim Senden der Lösch-Anfrage.", "error");
            }
            return;
        }

        // --- Umbenennen Button (Stift) ---
        const renameButton = e.target.closest('.rename-user-btn');
        if (renameButton) {
            const nameDisplay = userCard.querySelector('.name-display');
            const nameEdit = userCard.querySelector('.name-edit-container');
            if (nameDisplay && nameEdit) {
                nameDisplay.classList.add('hidden');
                nameEdit.classList.remove('hidden');
                nameEdit.querySelector('.edit-nickname-input')?.focus();
            }
            return;
        }

        // --- Speichern nach Umbenennen Button (Häkchen) ---
        const saveNameButton = e.target.closest('.save-name-btn');
        if (saveNameButton) {
            // Auch hier: Guthaben-Check beim Umbenennen
            try {
                const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
                const qCredit = query(paymentsRef,
                    where('type', '==', 'credit'),
                    where('status', '==', 'open'),
                    where('involvedUserIds', 'array-contains', userId)
                );
                const snapCredit = await getDocs(qCredit);

                if (!snapCredit.empty) {
                    alertUser("Umbenennen nicht möglich: Benutzer hat aktives Guthaben! Bitte erst klären.", "error");
                    return;
                }
            } catch (err) {
                console.error("Fehler beim Guthaben-Check (Umbenennen):", err);
            }

            const nameEditContainer = saveNameButton.closest('.name-edit-container');
            const nameDisplay = userCard.querySelector('.name-display');
            if (!nameEditContainer || !nameDisplay) return;

            const newNickname = nameEditContainer.querySelector('.edit-nickname-input').value.trim();

            if (!newNickname) return alertUser("Nickname darf nicht leer sein.", "error");

            rememberAdminScroll();

            try {
                const approvalRules = currentUser.adminPermissions?.approvalRequired || {};
                const needsApproval = approvalRules['canRenameUser'] === true;
                const autoApproveFlag = !needsApproval;

                await createApprovalRequest(
                    'RENAME_USER',
                    userId,
                    {
                        newName: newNickname,
                        autoApprove: autoApproveFlag
                    }
                );

                if (autoApproveFlag) {
                    await logAdminAction('user_renamed_autoapproved', `Benutzer ${originalUser.name} umbenannt in '${newNickname}' (Auto-Approve).`);
                } else {
                    await logAdminAction('user_renamed_pending', `Antrag auf Umbenennung für ${originalUser.name} eingereicht.`);
                }

                nameDisplay.classList.remove('hidden');
                nameEditContainer.classList.add('hidden');

            } catch (error) {
                console.error("Fehler beim Senden der Umbenennungs-Anfrage:", error);
                alertUser("Fehler beim Senden der Umbenennungs-Anfrage.", "error");
            }
            return;
        }

        // --- Speichern der Berechtigungen Button ---
        const savePermsButton = e.target.closest('.save-perms-button');
        if (savePermsButton) {
            console.log(`[CLICK] Speichern (Berechtigungen) für User ${userId} erkannt.`);
            const permContainer = savePermsButton.closest('[data-userid]');

            if (!permContainer) {
                console.error(`[CLICK] Konnte Berechtigungs-Container für User ${userId} nicht finden!`);
                return;
            }

            const typeRadio = permContainer.querySelector('input[name^="perm-type-"]:checked');
            if (!typeRadio) { console.error(`[CLICK] Konnte Berechtigungstyp-Radiobutton für User ${userId} nicht lesen!`); return; }
            const selectedType = typeRadio.value;

            rememberAdminScroll();

            let detailsForRequest = { type: selectedType };

            let newRole = originalUser.role;
            let newDisplayRole = originalUser.displayRole;
            let customPermissions = originalUser.customPermissions;

            if (selectedType === 'role') {
                const roleSelect = permContainer.querySelector('.user-role-select');
                if (!roleSelect) { console.error(`[CLICK] Konnte Rollen-Select für User ${userId} nicht finden!`); return; }
                newRole = roleSelect.value;
                newDisplayRole = null;
                customPermissions = [];

                if (newRole === 'SYSTEMADMIN' && currentUser.role !== 'SYSTEMADMIN') {
                    return alertUser("Nur Systemadmins dürfen die Rolle SYSTEMADMIN zuweisen.", "error");
                }

                detailsForRequest.newRole = newRole;

            } else { // type === 'individual'
                customPermissions = Array.from(permContainer.querySelectorAll('.custom-perm-checkbox:checked')).map(cb => cb.dataset.perm);
                const displayRoleSelect = permContainer.querySelector('.display-role-select');
                if (!displayRoleSelect) { console.error(`[CLICK] Konnte Display-Rollen-Select für User ${userId} nicht finden!`); return; }
                newDisplayRole = displayRoleSelect.value || 'NO_RIGHTS';

                // Leite die *echte* Rolle vom *Display* ab
                if (newDisplayRole === 'ADMIN') {
                    newRole = 'ADMIN';
                } else if (newDisplayRole === 'SYSTEMADMIN') {
                    newRole = 'SYSTEMADMIN';
                } else if (newDisplayRole === 'NO_RIGHTS') {
                    newRole = 'NO_RIGHTS';
                } else {
                    newRole = newDisplayRole;
                }

                detailsForRequest.customPermissions = customPermissions;
                detailsForRequest.displayRole = newDisplayRole !== 'NO_RIGHTS' ? newDisplayRole : null;
            }

            // Prüfen ob Beförderung zum Admin stattfindet
            const wasAdmin = (originalUser.role === 'ADMIN') || (originalUser.displayRole === 'ADMIN');
            const willBeAdmin = (newRole === 'ADMIN') || (newDisplayRole === 'ADMIN');

            const approvalRules = currentUser.adminPermissions?.approvalRequired || {};
            let needsApproval = false;

            if (willBeAdmin && !wasAdmin) {
                // Beförderung zum Admin
                needsApproval = approvalRules['setAdminStatus'] === true;
            } else {
                // Normale Änderung
                needsApproval = approvalRules['canChangeUserPermissionType'] === true;
            }

            const autoApproveFlag = !needsApproval;
            detailsForRequest.autoApprove = autoApproveFlag;

            try {
                await createApprovalRequest(
                    'CHANGE_PERMISSION_TYPE',
                    userId,
                    detailsForRequest
                );

                if (autoApproveFlag) {
                    await logAdminAction('user_perms_updated_autoapproved', `Berechtigungen für ${originalUser.name} geändert (Auto-Approve).`);
                } else {
                    await logAdminAction('user_perms_updated_pending', `Antrag auf Berechtigungsänderung für ${originalUser.name} eingereicht.`);
                }

                const saveBtnContainer = permContainer.querySelector('.save-perms-container');
                if (saveBtnContainer) saveBtnContainer.classList.add('hidden');

            } catch (error) {
                console.error(`[CLICK] FEHLER beim Senden der Berechtigungs-Anfrage für User ${userId}:`, error);
                alertUser(`Fehler beim Senden der Anfrage: ${error.message}`, "error");
            }
            return; // Klick behandelt
        }

    }); // Ende CLICK Listener

    // --- Separater CHANGE Listener für Inputs ---
    if (!area.dataset.userManagementChangeListenerAttached) {
        area.dataset.userManagementChangeListenerAttached = 'true';
        console.log("addAdminUserManagementListeners: Hänge CHANGE Listener an userManagementArea an.");
        area.addEventListener('change', async (e) => {
            console.log("[CHANGE] Event ausgelöst. Target:", e.target);
            const target = e.target;
            const userCard = target.closest('.user-card');
            if (!userCard) return;
            const userId = userCard.dataset.userid;
            if (!userId) return;

            const originalUser = USERS[userId];
            if (!originalUser) return;

            console.log(`[CHANGE] Änderung innerh. der Karte für User: ${originalUser.name}`);

            // SPERREN / ENTSPERREN Toggle
            if (target.classList.contains('user-active-toggle')) {
                const newIsLocked = target.checked;
                const newIsActive = !newIsLocked;
                const actionText = newIsActive ? "ENTSPERREN" : "SPERREN";

                if (!confirm(`Möchten Sie den Benutzer '${originalUser.name}' wirklich ${actionText}?`)) {
                    target.checked = !newIsLocked;
                    return;
                }

                rememberAdminScroll();

                try {
                    const approvalRules = currentUser.adminPermissions?.approvalRequired || {};
                    const needsApproval = approvalRules['canToggleUserActive'] === true;
                    const autoApproveFlag = !needsApproval;

                    await createApprovalRequest(
                        'TOGGLE_USER_ACTIVE',
                        userId,
                        {
                            isActive: newIsActive,
                            autoApprove: autoApproveFlag
                        }
                    );

                    const logMessage = `Benutzer '${originalUser.name}' wurde ${newIsActive ? 'entsperrt' : 'gesperrt'}.`;
                    const logMessagePending = `Antrag zum ${newIsActive ? 'Entsperren' : 'Sperren'} von '${originalUser.name}' eingereicht.`;

                    if (autoApproveFlag) {
                        await logAdminAction(newIsActive ? 'user_unlocked_autoapproved' : 'user_locked_autoapproved', logMessage);
                    } else {
                        await logAdminAction(newIsActive ? 'user_unlocked_pending' : 'user_locked_pending', logMessagePending);
                    }

                } catch (error) {
                    console.error("Fehler beim Senden der ${actionText}-Anfrage:", error);
                    alertUser(`Fehler: ${error.message}`, "error");
                    target.checked = !newIsLocked;
                }
                return; // Änderung behandelt
            }

            // --- Änderungen an Berechtigungs-Inputs ---
            if (target.matches('.perm-type-toggle, .user-role-select, .custom-perm-checkbox, .display-role-select')) {
                console.log(`[CHANGE] Berechtigungs-Input geändert.`);
                const container = target.closest('[data-userid]');

                if (!container) {
                    console.error("[CHANGE] Konnte Container nicht finden.");
                    return;
                }

                // 1. Rollenansicht umschalten
                if (target.classList.contains('perm-type-toggle')) {
                    container.querySelector('.role-selection-area')?.classList.toggle('hidden', target.value !== 'role');
                    const individualArea = container.querySelector('.individual-perms-area');
                    individualArea?.classList.toggle('hidden', target.value !== 'individual');

                    if (target.value === 'individual' && individualArea && typeof setupPermissionDependencies === 'function') {
                        setupPermissionDependencies(individualArea);
                    }
                }

                // 2. Speicher-Button zeigen
                const saveBtnContainer = container.querySelector('.save-perms-container');
                if (saveBtnContainer) {
                    saveBtnContainer.classList.remove('hidden');
                }

                // 3. Wenn eine Checkbox geändert wird, Abhängigkeiten prüfen
                if (target.classList.contains('custom-perm-checkbox') && target.closest('.individual-perms-area')) {
                    const individualPermsArea = container.querySelector('.individual-perms-area');
                    if (individualPermsArea && typeof setupPermissionDependencies === 'function') {
                        // KORREKTUR: Hier nutzen wir jetzt die richtige Variable 'individualPermsArea'
                        setupPermissionDependencies(individualPermsArea);
                    }
                }
                return;
            }

        }); // Ende CHANGE Listener
    }

    // Initial für alle 'individual' Karten die Abhängigkeiten aktivieren
    area.querySelectorAll('.individual-perms-area').forEach(individualArea => {
        if (!individualArea.classList.contains('hidden') && typeof setupPermissionDependencies === 'function') {
            setupPermissionDependencies(individualArea);
        }
    });
}


export function toggleNewUserRoleField() {
    const typeSelect = document.getElementById('newUserPermissionType'); // 
    const roleSelect = document.getElementById('newUserRole'); // [cite: 770]
    const keyInput = document.getElementById('newUserKey'); // [cite: 770]
    const keyWrapper = document.getElementById('newUserKeyWrapper'); // [cite: 771]

    if (!typeSelect || !roleSelect || !keyInput || !keyWrapper) return; // [cite: 772]

    const selectedType = typeSelect.value; // [cite: 773]
    // Rollenauswahlfeld anzeigen/verstecken
    // Hides role select if type is NOT 'role' (includes 'not_registered')
    roleSelect.style.display = (selectedType === 'role') ? 'block' : 'none'; // 

    // Passwortfeld optional/versteckt für nicht registrierte
    keyInput.disabled = (selectedType === 'not_registered'); // 
    keyInput.required = !(selectedType === 'not_registered'); // 

    // Hides the password field's container if type IS 'not_registered'
    keyWrapper.style.display = (selectedType === 'not_registered') ? 'none' : 'block'; // 


    if (selectedType === 'not_registered') keyInput.value = ''; // [cite: 778]
}

export function renderAdminUserDetails(userId) {
    const detailsArea = document.getElementById('admin-user-details-area');
    const adminUser = USERS[userId];

    if (!detailsArea || !adminUser) {
        if (detailsArea) {
            detailsArea.innerHTML = '';
        }
        return;
    }

    if (detailsArea.dataset.editingUser === userId) {
        detailsArea.innerHTML = '';
        delete detailsArea.dataset.editingUser;
        document.querySelectorAll('.edit-admin-user-btn').forEach(b => b.closest('.p-2')?.classList.remove('bg-indigo-100'));
        return;
    }

    document.querySelectorAll('.edit-admin-user-btn').forEach(b => b.closest('.p-2')?.classList.remove('bg-indigo-100'));
    const adminRightsArea = document.getElementById('adminRightsArea');
    if (adminRightsArea) {
        const userButton = adminRightsArea.querySelector(`.edit-admin-user-btn[data-userid="${userId}"]`);
        userButton?.closest('.p-2')?.classList.add('bg-indigo-100');
    }

    detailsArea.dataset.editingUser = userId;

    const perms = adminUser.adminPermissions || {};
    const approvalPerms = perms.approvalRequired || {};

    const type = adminUser.adminPermissionType || 'role';

    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    const canBeEdited = isSysAdmin;

    const generateCheckbox = (permKey, label, isSubItem = false, canBeApproved = false) => {
        const isChecked = perms[permKey] || false;
        const isApprovalChecked = approvalPerms[permKey] || false;
        const margin = isSubItem ? 'pl-6' : '';

        const mainCheckboxHTML = `
            <label class="flex items-center gap-2 cursor-pointer ${margin}">
                <input type="checkbox" class="admin-perm-cb h-4 w-4" data-perm="${permKey}" ${isChecked ? 'checked' : ''} ${!canBeEdited ? 'disabled' : ''}>
                <span class="text-sm">${label}</span>
            </label>
        `;

        let approvalCheckboxHTML = '';
        if (canBeApproved) {
            const approvalMargin = 'pl-6';
            approvalCheckboxHTML = `
                <label class="flex items-center gap-2 cursor-pointer ${approvalMargin} mt-1"> 
                    <input type="checkbox" class="approval-cb h-4 w-4" data-perm="${permKey}" ${isApprovalChecked ? 'checked' : ''} ${!canBeEdited ? 'disabled' : ''}>
                    <span class="text-xs text-red-600">Genehmigung erforderlich</span>
                </label>
            `;
        }

        return `
            <div>
                ${mainCheckboxHTML}
                ${approvalCheckboxHTML}
            </div>
        `;
    };

    let roleOptionsHTML = Object.values(ADMIN_ROLES)
        .filter(r => r.id !== 'LEERE_ROLLE')
        .map(r => `<option value="${r.id}" ${adminUser.assignedAdminRoleId === r.id ? 'selected' : ''}>${r.name}</option>`)
        .join('');

    detailsArea.innerHTML = `
        <div class="p-4 border-t-4 border-indigo-500 rounded-xl bg-gray-50 mt-4 relative shadow-lg" data-userid="${userId}">
            <button id="close-details-btn" class="absolute top-2 right-3 text-2xl font-bold text-gray-400 hover:text-red-600">&times;</button>
            <p class="font-bold text-lg text-indigo-800">${adminUser.name} bearbeiten</p>
            
            <div class="mt-4 pt-3 border-t">
                <label class="block text-sm font-medium text-gray-700 mb-2">Berechtigungs-Typ</label>
                <div class="flex items-center gap-4">
                    <label class="flex items-center"><input type="radio" class="perm-type-toggle" name="perm-type-${userId}" value="role" ${type === 'role' ? 'checked' : ''} ${!canBeEdited ? 'disabled' : ''}> <span class="ml-2">Rolle</span></label>
                    <label class="flex items-center"><input type="radio" class="perm-type-toggle" name="perm-type-${userId}" value="individual" ${type === 'individual' ? 'checked' : ''} ${!canBeEdited ? 'disabled' : ''}> <span class="ml-2">Individuelle Rechte</span></label>
                </div>
            </div>

            <div class="role-selection-area mt-2 ${type === 'role' ? '' : 'hidden'}">
                <select id="assigned-admin-role-select" class="w-full p-2 border rounded-lg bg-white text-sm" data-userid="${userId}" ${!canBeEdited ? 'disabled' : ''}>${roleOptionsHTML}</select>
            </div>

            <div id="admin-individual-perms-area" class="individual-perms-area mt-3 space-y-3 ${type === 'individual' ? '' : 'hidden'}">
                <div class="p-3 border rounded-lg bg-white">
                    <h5 class="font-semibold text-sm mb-2 text-gray-600">Sichtbarkeit und Hauptfunktionen</h5>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        ${generateCheckbox('canSeePasswords', 'Passwörter')}
                        ${generateCheckbox('canSeeApprovals', 'Genehmigungen')}
                        ${generateCheckbox('canSeeRoleManagement', 'Rollenverwaltung')}
                        ${generateCheckbox('canViewLogs', 'Protokolle')}
                        ${generateCheckbox('canSeeUsers', 'Benutzersteuerung')}
                    </div>
                    
                    <div class="mt-2 pt-2 border-t">
                        <h5 class="font-semibold text-sm text-gray-600">Adminfunktionen Hauptseite</h5>
                        ${generateCheckbox('canSeeMainFunctions', 'Hauptmenü anzeigen')}
                        ${generateCheckbox('canUseMainPush', '-> Push-Funktion', true)}
                        ${generateCheckbox('canUseMainEntrance', '-> Eingang öffnen', true)}
                        ${generateCheckbox('canUseMainChecklist', '-> Checkliste', true)}
                        
                        ${generateCheckbox('canUseMainTerminplaner', '-> Termin finden', true)}
                        <div class="pl-6"> ${generateCheckbox('canSeePollToken', '-> Umfrage-Token anzeigen', true)}
                            ${generateCheckbox('canSeePollEditToken', '-> EDIT-Token anzeigen', true)}
                        </div>

                        ${generateCheckbox('canUseMainZahlungsverwaltung', '-> Zahlungsverwaltung', true)}
                        ${generateCheckbox('canUseMainPushoverConfig', '-> Pushover Config', true)}
                        ${generateCheckbox('canUseMainHaushaltszahlungen', '-> Haushaltszahlungen', true)}
                        </div>
                    </div>
                
                 <div class="p-3 border rounded-lg bg-white">
                    <h5 class="font-semibold text-sm mb-3 text-gray-600">Aktionen und Genehmigung</h5>
                    
                    <div class="grid grid-cols-2 gap-4 text-sm"> 
                        
                        <div class="flex flex-col gap-4">
                            ${generateCheckbox('canCreateUser', 'Benutzer anlegen', false, true)}
                            ${generateCheckbox('canDeleteUser', 'Benutzer löschen', false, true)}
                            ${generateCheckbox('canRenameUser', 'Benutzer umbenennen', false, true)}
                        </div>
                        
                        <div class="flex flex-col gap-4">
                            ${generateCheckbox('canToggleUserActive', 'Benutzer sperren/entsperren', false, true)}
                            ${generateCheckbox('canChangeUserPermissionType', 'Berechtigungs-Typ ändern', false, true)}
                            
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Admin-Status setzen</label>
                                <select class="approval-cb w-full p-2 border rounded-lg bg-white text-sm mt-1" data-perm="setAdminStatus" ${!canBeEdited ? 'disabled' : ''}>
                                    <option value="true" ${approvalPerms['setAdminStatus'] === false ? '' : 'selected'}>Genehmigung erforderlich</option>
                                    <option value="false" ${approvalPerms['setAdminStatus'] === false ? 'selected' : ''}>Keine Genehmig. erforderlich</option>
                                </select>
                            </div>
                            </div>
                    </div>
                    
                    <div class="pt-4 border-t mt-4"> 
                        <h5 class="font-semibold text-sm mb-3 text-gray-600">Weitere Berechtigungen</h5>
                         
                         <div class="grid grid-cols-2 gap-4 text-sm">
                            <div class="flex flex-col gap-4"> ${generateCheckbox('canEditUserRoles', 'Darf Benutzer-Rollen bearbeiten')}
                            </div>
                            <div class="flex flex-col gap-4"> ${generateCheckbox('canSeeSysadminLogs', 'Darf Sysadmin-Einträge sehen')}
                            </div>
                         </div>
                    </div>

                </div>
            </div>

            <div id="admin-save-container" class="mt-4 pt-4 border-t ${!canBeEdited ? 'hidden' : ''}">
                 <button id="save-admin-perms-button" data-userid="${userId}" class="save-admin-perms-button w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" disabled>
                     Änderungen speichern
                 </button>
            </div>
        </div>
    `;

    detailsArea.querySelector('#close-details-btn')?.addEventListener('click', () => {
        detailsArea.innerHTML = '';
        delete detailsArea.dataset.editingUser;
        document.querySelectorAll('.edit-admin-user-btn').forEach(b => b.closest('.p-2')?.classList.remove('bg-indigo-100'));
    });

    const toggleSaveButton = () => {
        const saveBtn = detailsArea.querySelector('#admin-save-container button');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Änderungen speichern';
        }
    };

    detailsArea.querySelectorAll('.perm-type-toggle').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const newType = e.target.value;
            const card = e.target.closest('.p-4');
            card.querySelector('.role-selection-area')?.classList.toggle('hidden', newType !== 'role');
            const individualArea = card.querySelector('.individual-perms-area');
            individualArea?.classList.toggle('hidden', newType !== 'individual');

            if (newType === 'individual' && individualArea && typeof setupPermissionDependencies === 'function') {
                setupPermissionDependencies(individualArea);
            }
            toggleSaveButton();
        });
    });

    detailsArea.querySelectorAll('select, input[type="text"], input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', toggleSaveButton);
        input.addEventListener('input', toggleSaveButton);
    });

    detailsArea.querySelectorAll('.admin-perm-cb, .approval-cb').forEach(input => {
        input.addEventListener('change', (e) => {
            const container = e.target.closest('.individual-perms-area');
            if (container && typeof setupPermissionDependencies === 'function') {
                setupPermissionDependencies(container);
            }
            toggleSaveButton();
        });
    });

    const individualArea = detailsArea.querySelector('.individual-perms-area:not(.hidden)');
    if (individualArea && typeof setupPermissionDependencies === 'function') {
        setupPermissionDependencies(individualArea);
    }

    const permsArea = detailsArea.querySelector('#admin-individual-perms-area');
    if (permsArea) {
        permsArea.querySelectorAll('.admin-perm-cb').forEach(mainCb => {
            const wrapper = mainCb.closest('div');
            if (!wrapper) return;

            const approvalCb = wrapper.querySelector('.approval-cb');
            if (!approvalCb) {
                return;
            }

            const updateApprovalCbState = () => {
                const isMainChecked = mainCb.checked;

                if (canBeEdited) {
                    approvalCb.disabled = !isMainChecked;
                }

                if (approvalCb.tagName === 'INPUT' && !isMainChecked) {
                    approvalCb.checked = false;
                }
            };

            mainCb.addEventListener('change', updateApprovalCbState);
            updateApprovalCbState();
        });
    }

    const saveButton = detailsArea.querySelector('.save-admin-perms-button');
    if (saveButton && !saveButton.dataset.listenerAttached) {
        saveButton.addEventListener('click', async (e) => {
            const userId = e.currentTarget.dataset.userid;
            const container = e.currentTarget.closest('.p-4');
            const adminUserForUpdate = USERS[userId];

            const typeRadio = container?.querySelector('.perm-type-toggle:checked') || container?.querySelector('input[name^="perm-type-"]:checked');
            const selectedType = typeRadio?.value || adminUserForUpdate?.adminPermissionType || 'role';

            if (!typeRadio) {
                console.warn("Admin-Rechte speichern: Kein ausgewählter Berechtigungs-Typ gefunden. Fallback auf:", selectedType);
                console.log(
                    "Admin-Rechte speichern: Gefundene Radios:",
                    Array.from(container?.querySelectorAll('.perm-type-toggle') || []).map(r => ({ name: r.name, value: r.value, checked: r.checked, disabled: r.disabled }))
                );
            }

            e.currentTarget.disabled = true;
            e.currentTarget.textContent = 'Speichere...';

            let updateData = { adminPermissionType: selectedType };

            if (selectedType === 'role') {
                updateData = {
                    ...updateData,
                    assignedAdminRoleId: container.querySelector('#assigned-admin-role-select')?.value || null,
                    adminPermissions: {},
                };
            } else {
                const permissions = {};
                container.querySelectorAll('.admin-perm-cb').forEach(cb => { permissions[cb.dataset.perm] = cb.checked; });

                const approvalRequired = {};
                container.querySelectorAll('.approval-cb').forEach(el => {
                    const perm = el.dataset.perm;
                    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
                        approvalRequired[perm] = el.checked;
                    } else if (el.tagName === 'SELECT') {
                        approvalRequired[perm] = (el.value === 'true');
                    }
                });

                permissions.approvalRequired = approvalRequired;

                updateData = {
                    ...updateData,
                    adminPermissions: permissions,
                    assignedAdminRoleId: null,
                };
            }

            Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

            try {
                try {
                    const tokenResult = await auth?.currentUser?.getIdTokenResult(true);
                    console.log("Admin-Rechte speichern: Token-Claims", {
                        uid: auth?.currentUser?.uid || null,
                        appRole: tokenResult?.claims?.appRole || null,
                        appUserId: tokenResult?.claims?.appUserId || null
                    });
                } catch (tokenErr) {
                    console.warn("Admin-Rechte speichern: Konnte Token/Claims nicht refreshen.", tokenErr);
                }

                await updateDoc(doc(usersCollectionRef, userId), updateData);
                await logAdminAction('admin_perms_updated', `Admin-Berechtigungen für ${adminUserForUpdate.name} (${selectedType}) geändert.`);
                alertUser("Änderungen gespeichert!", "success");

                detailsArea.innerHTML = '';
                delete detailsArea.dataset.editingUser;
                document.querySelectorAll('.edit-admin-user-btn').forEach(b => b.closest('.p-2')?.classList.remove('bg-indigo-100'));

                if (typeof renderAdminRightsManagement === 'function') {
                    await renderAdminRightsManagement();
                }

            } catch (error) {
                console.error("FEHLER beim Speichern der Admin-Rechte:", error);
                alertUser(`Fehler beim Speichern: ${error.message}`, "error");
            }
        });
        saveButton.dataset.listenerAttached = 'true';
    }
}
