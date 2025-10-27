// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 // TEST 2
import { onSnapshot, doc, updateDoc, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, usersCollectionRef, setButtonLoading, adminSectionsState, rolesCollectionRef, ROLES, roleChangeRequestsCollectionRef, currentUser, alertUser, USERS, initialAuthCheckDone, modalUserButtons, ADMIN_ROLES, ADMIN_STORAGE_KEY } from './haupteingang.js';
import { logAdminAction } from './admin_protokollHistory.js';
import { setupPermissionDependencies } from './admin_rechteverwaltung.js'; // Oder der richtige Dateiname
import { restoreAdminScrollIfAny, rememberAdminScroll } from './admin_adminfunktionenHome.js';
// ENDE-ZIKA //


function checkCurrentUserValidity_COPY_V2() {
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


const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

export function listenForUserUpdates() {
    const mainContent = document.querySelector('.main-content');

    // <<< NEUER SPION: Prüfen, ob usersCollectionRef gültig ist BEVOR onSnapshot >>>
    if (!usersCollectionRef) {
        console.error("listenForUserUpdates: FEHLER - usersCollectionRef ist nicht definiert, bevor onSnapshot aufgerufen wird!");
        return; // Abbruch, wenn die Referenz fehlt
    } else {
        console.log("listenForUserUpdates: usersCollectionRef scheint gültig zu sein:", usersCollectionRef.path); // Log den Pfad
    }
    // <<< ENDE NEUER SPION >>>


    onSnapshot(usersCollectionRef, (snapshot) => {
        // <<< SPION: Bestätigen, dass Daten empfangen wurden (bleibt drin) >>>
        console.log("listenForUserUpdates: onSnapshot hat Daten empfangen!", snapshot.size, "Dokumente");

        // <<< WICHTIG: Prüfen, ob die Snapshot-Größe > 0 ist >>>
        if (snapshot.empty) {
            console.warn("listenForUserUpdates: onSnapshot hat eine leere Snapshot empfangen (keine Benutzer in der DB oder Filterproblem?).");
        }
        // <<< ENDE WICHTIGE PRÜFUNG >>>


        Object.keys(USERS).forEach(key => delete USERS[key]);
        snapshot.forEach((doc) => {
             // <<< NEUER SPION: Logge jedes einzelne Dokument, das verarbeitet wird >>>
             console.log("listenForUserUpdates: Verarbeite Dokument:", doc.id, doc.data());
             USERS[doc.id] = { id: doc.id, ...doc.data() };
        });

        // Verhindert ein Neuzeichnen, wenn die Änderung vom User selbst kam
        if (initialAuthCheckDone) {
            checkCurrentUserValidity_COPY_V2();
        }
        renderModalUserButtons(); // <<< Wird jetzt immer aufgerufen, wenn Daten kommen

        // Prüft, ob geöffnete Admin-Sektionen neu gezeichnet werden müssen (bleibt gleich)
        const isAdminViewActive = document.getElementById('adminView')?.classList.contains('active'); // Sicherer Zugriff

        // --- HINWEIS: Stelle sicher, dass diese Render-Funktionen existieren oder auskommentiert sind, wenn nicht benötigt ---
        if (isAdminViewActive) {
            // Beispiel: Wenn renderUserKeyList in einer anderen Datei ist, musst du sie ggf. importieren
            if (adminSectionsState.password && typeof renderUserKeyList === 'function') {
                 renderUserKeyList();
            }
            if (adminSectionsState.user && typeof renderUserManagement === 'function') {
                 renderUserManagement();
            }
            if (adminSectionsState.role && typeof renderRoleManagement === 'function') {
                 renderRoleManagement();
            }
             if (adminSectionsState.protocol && typeof renderProtocolHistory === 'function') {
                 renderProtocolHistory();
             }
        }
        // --- ENDE HINWEIS ---

    }, (error) => { // <<< NEU: Fehlerbehandlung für den Listener >>>
        console.error("listenForUserUpdates: FEHLER im onSnapshot Listener:", error);
        // Optional: Dem Benutzer eine Fehlermeldung anzeigen
        alertUser("Fehler beim Laden der Benutzerdaten. Prüfen Sie die Konsole.", "error"); // Annahme: alertUser ist global verfügbar oder importiert
    }); // <<< ENDE NEU >>>

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

    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';

    Object.values(USERS || {}) // || {} zur Sicherheit
        .filter(user => user.permissionType !== 'not_registered')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .forEach(user => {
            const userId = user.id;
            if (!user.name) return; // Überspringe Benutzer ohne Namen

            const isSelf = userId === currentUser.mode;
            const isTargetSysAdmin = user.role === 'SYSTEMADMIN';
            // Nur SysAdmin darf SysAdmin bearbeiten (sich selbst nicht), Admin darf nur Nicht-Admins/SysAdmins
            const canEditKey = (isSysAdmin && !isTargetSysAdmin && !isSelf) || (isAdmin && !isTargetSysAdmin && user.role !== 'ADMIN') || isSelf;
            const canViewKey = canEditKey; // Gleiche Logik für das Sehen des Schlüssels
            const keyDisplay = canViewKey ? (user.key || 'Nicht gesetzt') : '••••••••••';
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

                    // Warten auf Firebase Update
                    await updateDoc(doc(usersCollectionRef, userId), { key: newKey });
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

// Ersetze diese Funktion komplett in admin_benutzersteuerung.js
export async function renderUserManagement() {
    const userManagementArea = document.getElementById('userManagementArea'); // Sicherstellen, dass die Variable hier definiert ist
    if (!userManagementArea) {
        console.error("renderUserManagement: Container #userManagementArea nicht gefunden.");
        return;
    }

    // Frühe Überprüfung der Referenzen
    if (!roleChangeRequestsCollectionRef || !usersCollectionRef || !rolesCollectionRef) {
        userManagementArea.innerHTML = `<p class="text-center text-red-500">Datenbankverbindung wird noch aufgebaut...</p>`;
        // Optional: setTimeout(renderUserManagement, 500); // Erneut versuchen
        return;
    }

    // Admin-Berechtigungen ermitteln
    let effectiveAdminPerms = {};
    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdminEditing = currentUser.role === 'SYSTEMADMIN';
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
    const permSet = (isSysAdminEditing) ? { canToggleUserActive: true, canDeleteUser: true, canRenameUser: true, canChangeUserPermissionType: true, canCreateUser: true } : effectiveAdminPerms;

    // --- HTML-Grundgerüst ---
    userManagementArea.innerHTML = `
        <button id="showAddUserFormBtn" class="w-full p-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition shadow-md ${!permSet.canCreateUser ? 'hidden' : ''}">+ Benutzer anlegen</button>
        <div id="addUserFormContainer" class="p-4 border rounded-xl bg-green-50 hidden">
             <h4 class="font-bold text-lg text-green-800 mb-2">Neuen Benutzer anlegen</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" id="newUserName" class="p-2 border rounded-lg" placeholder="Nickname*">
                <input type="text" id="newUserRealName" class="p-2 border rounded-lg" placeholder="Vollständiger Name (Optional)">
                <div id="newUserKeyWrapper" class="sm:col-span-1">
                     <input type="password" id="newUserKey" class="p-2 border rounded-lg w-full" placeholder="Passwort* (mind. 4 Zeichen)">
                 </div>
                <select id="newUserPermissionType" class="p-2 border rounded-lg bg-white">
                    <option value="role" selected>Typ: Rolle (Standard)</option>
                    <option value="individual">Typ: Individuell</option>
                    <option value="not_registered">Typ: Nicht registriert</option>
                </select>
                <select id="newUserRole" class="p-2 border rounded-lg bg-white sm:col-span-2"></select>
                <button id="saveNewUserButton" class="sm:col-span-2 p-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Erstellen</button>
            </div>
            <p class="text-xs text-gray-500 mt-2">* Pflichtfelder (außer bei "Nicht registriert")</p>
        </div>
        <div id="registeredUserList" class="space-y-3 pt-4 border-t mt-4"></div>
        <div class="mt-6 pt-4 border-t">
            <button id="notRegisteredToggle" class="w-full flex justify-between items-center p-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-left font-semibold text-gray-700">
                <span>Nicht registrierte Personen (<span id="notRegisteredCount">0</span>)</span>
                <svg id="notRegisteredToggleIcon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-5 h-5 transform transition-transform"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </button>
            <div id="notRegisteredList" class="hidden mt-2 space-y-2 pl-4 border-l-2 border-gray-200">
                 <p class="text-xs text-center text-gray-400">Keine nicht registrierten Personen vorhanden.</p>
            </div>
        </div>`;

    // Listener für "+ Benutzer anlegen" Button
    const addUserBtn = userManagementArea.querySelector('#showAddUserFormBtn');
    if (addUserBtn && !addUserBtn.dataset.listenerAttached) {
        addUserBtn.addEventListener('click', (e) => {
            e.currentTarget.style.display = 'none';
            userManagementArea.querySelector('#addUserFormContainer')?.classList.remove('hidden');
            const permTypeSelect = document.getElementById('newUserPermissionType');
            if (permTypeSelect) permTypeSelect.value = 'role';
            toggleNewUserRoleField();
        });
        addUserBtn.dataset.listenerAttached = 'true';
    }

    // Listener für Typ-Auswahl im "Neu anlegen"-Formular
    const newUserPermTypeSelect = userManagementArea.querySelector('#newUserPermissionType');
    if (newUserPermTypeSelect && !newUserPermTypeSelect.dataset.listenerAttached) {
        newUserPermTypeSelect.addEventListener('change', toggleNewUserRoleField);
        newUserPermTypeSelect.dataset.listenerAttached = 'true';
    }

    // --- Daten vorbereiten ---
    const allUsers = Object.values(USERS).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const registeredUsers = allUsers.filter(u => u.permissionType !== 'not_registered');
    const notRegisteredUsers = allUsers.filter(u => u.permissionType === 'not_registered');

    const registeredListContainer = userManagementArea.querySelector('#registeredUserList');
    const notRegisteredListContainer = userManagementArea.querySelector('#notRegisteredList');
    if(registeredListContainer) registeredListContainer.innerHTML = '';
    if(notRegisteredListContainer) notRegisteredListContainer.innerHTML = '';

    const notRegCountEl = document.getElementById('notRegisteredCount');
    if (notRegCountEl) notRegCountEl.textContent = notRegisteredUsers.length;

    // Rollenoptionen für "Neu Anlegen"
    const roleOptionsHTML = Object.values(ROLES)
        .filter(r => r.id !== 'SYSTEMADMIN' && r.id !== 'ADMIN' && r.id !== 'NO_RIGHTS')
        .map(role => `<option value="${role.id}">${escapeHtml(role.name)}</option>`)
        .join('');
    const newUserRoleSelect = userManagementArea.querySelector('#newUserRole');
    if (newUserRoleSelect) {
        newUserRoleSelect.innerHTML = roleOptionsHTML;
        newUserRoleSelect.value = 'ANGEMELDET';
    }

    // Verfügbare Berechtigungen
    const allPermissions = { 'ENTRANCE': 'Haupteingang öffnen', 'PUSHOVER': 'Push-Nachricht senden', 'CHECKLIST': 'Aktuelle Checkliste', 'CHECKLIST_SWITCH': '-> Listen umschalten', 'CHECKLIST_SETTINGS': '-> Checkliste-Einstellungen', 'ESSENSBERECHNUNG': 'Essensberechnung' };

    // Optionen für Angezeigten Status (OHNE SYSTEMADMIN)
    const displayRoleOptions = Object.values(ROLES)
        .filter(r => r.id !== 'SYSTEMADMIN') // SYSTEMADMIN herausfiltern
        .map(role => `<option value="${role.id}">${escapeHtml(role.name.replace(/-/g, '').trim())}</option>`)
        .join('');

    // --- Rendern der Benutzerkarten ---
    const createUserCardHTML = (user) => {
        const userId = user.id; const isSelf = userId === currentUser.mode; const isTargetSysAdmin = user.role === 'SYSTEMADMIN'; const isTargetAdmin = user.role === 'ADMIN'; const isNotRegistered = user.permissionType === 'not_registered';
        let canEdit = false; if (isSysAdminEditing) { canEdit = !isSelf; } else if (isAdmin) { canEdit = !isTargetSysAdmin && !isTargetAdmin; } if (isNotRegistered && isAdmin) canEdit = true;
        const canToggle = permSet.canToggleUserActive && canEdit && !isSelf && !isNotRegistered; const canDelete = permSet.canDeleteUser && canEdit && !isSelf; const canRename = permSet.canRenameUser && canEdit; const canChangePerms = permSet.canChangeUserPermissionType && canEdit && !isNotRegistered;
        const currentUserLabel = isSelf ? '<span class="bg-indigo-100 text-indigo-800 font-bold text-xs px-2 py-1 rounded-full ml-2">AKTUELL</span>' : ''; const realNameDisplay = user.realName ? `<span class="text-gray-500 italic text-sm ml-1 real-name-display">(${escapeHtml(user.realName)})</span>` : '';
        let roleName = 'Unbekannt'; let roleColorClass = 'text-gray-500'; if (isNotRegistered) { roleName = 'Nicht registriert'; roleColorClass = 'text-gray-400 italic'; } else { const effectiveRoleId = user.role || user.displayRole || 'NO_RIGHTS'; roleName = ROLES[effectiveRoleId]?.name || 'Keine Rolle'; if (user.role === 'SYSTEMADMIN') roleColorClass = 'text-purple-600 font-bold'; else if (user.role === 'ADMIN') roleColorClass = 'text-red-600 font-bold'; }
        let permissionsHTML = '';
        if (!isNotRegistered) {
            const permType = user.permissionType || 'role';
            let selectedDisplayRole = user.displayRole || 'NO_RIGHTS';
            if (user.role === 'ADMIN' && permType === 'individual') selectedDisplayRole = 'ADMIN';
            const finalDisplayRoleOptionsWithSelection = displayRoleOptions.replace(`value="${selectedDisplayRole}"`, `value="${selectedDisplayRole}" selected`); // Fügt 'selected' zur richtigen Option hinzu
            permissionsHTML = `
            <div class="mt-4 pt-3 border-t" data-userid="${userId}">
                <label class="block text-sm font-medium text-gray-700 mb-2">Berechtigungs-Typ</label>
                <div class="flex items-center gap-4">
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="role" class="perm-type-toggle h-4 w-4" ${permType === 'role' ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}> <span class="ml-2">Rolle</span></label>
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="individual" class="perm-type-toggle h-4 w-4" ${permType === 'individual' ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}> <span class="ml-2">Individuell</span></label>
                </div>
                <div class="role-selection-area mt-2 ${permType === 'role' ? '' : 'hidden'}">
                    <select class="user-role-select w-full p-2 border rounded-lg bg-white text-sm" ${!canChangePerms ? 'disabled' : ''}>
                        ${Object.values(ROLES).filter(r => (isSysAdminEditing || (r.id !== 'SYSTEMADMIN' && r.id !== 'ADMIN'))).map(role => `<option value="${role.id}" ${user.role === role.id ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}
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
                        ${Object.keys(allPermissions).map(permKey => `<label class="flex items-center ${permKey.startsWith('CHECKLIST_') ? 'pl-6' : ''}"><input type="checkbox" class="custom-perm-checkbox h-4 w-4" data-perm="${permKey}" ${(user.customPermissions || []).includes(permKey) ? 'checked' : ''} ${!canChangePerms ? 'disabled' : ''}><span class="ml-2 text-sm">${escapeHtml(allPermissions[permKey])}</span></label>`).join('')}
                    </div>
                </div>
                <div class="flex justify-end mt-3 hidden save-perms-container">
                     <button class="save-perms-button py-1 px-3 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">Berechtigungen speichern</button>
                </div>
            </div>`;
        }
        const lockToggleHTML = !isNotRegistered ? `<label class="flex items-center ${canToggle ? 'cursor-pointer' : 'cursor-not-allowed'}"><span class="mr-2 text-sm font-medium">Gesperrt: <span class="${!user.isActive ? 'text-red-700' : 'text-green-700'} font-bold">${!user.isActive ? 'JA' : 'NEIN'}</span></span><div class="relative"><input type="checkbox" class="sr-only user-active-toggle" data-userid="${userId}" ${!user.isActive ? 'checked' : ''} ${!canToggle ? 'disabled' : ''}><div class="block bg-gray-300 w-10 h-6 rounded-full"></div><div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition"></div></div></label>` : '<div class="w-10 h-6"></div>';
        return `
        <div class="user-card p-3 border rounded-lg flex flex-col gap-3 ${!canEdit && !isSelf ? 'bg-gray-200 opacity-70' : (isNotRegistered ? 'bg-gray-50' : 'bg-gray-50')}" data-userid="${userId}">
            <div class="flex justify-between items-start"> <div class="flex-grow"> <div class="flex items-center gap-2 flex-wrap"> <div data-userid="${userId}" class="name-display font-bold text-gray-800">${escapeHtml(user.name || 'Unbenannt')} ${currentUserLabel} ${realNameDisplay}</div> <div data-userid="${userId}" class="name-edit-container hidden flex-grow gap-2 items-center"> <input type="text" value="${escapeHtml(user.name || '')}" class="edit-nickname-input p-1 border rounded w-full text-sm" placeholder="Nickname"> <input type="text" value="${escapeHtml(user.realName || '')}" class="edit-realname-input p-1 border rounded w-full text-sm" placeholder="Vollständiger Name"> <button class="save-name-btn p-1 ml-1 bg-green-500 text-white rounded text-xs">✔️</button> </div> ${canRename ? `<button class="rename-user-btn p-1" data-userid="${userId}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-gray-500 hover:text-indigo-600"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.775a.75.75 0 0 0-.22.53l-.5 2.5a.75.75 0 0 0 .913.913l2.5-.5a.75.75 0 0 0 .53-.22l4.263-4.262a1.75 1.75 0 0 0 0-2.475Z" /><path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v9.5c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25V9.5a.75.75 0 0 1 1.5 0v5.25A2.75 2.75 0 0 1 14.25 18h-9.5A2.75 2.75 0 0 1 2 15.25v-9.5A2.75 2.75 0 0 1 4.75 3.5h5.25a.75.75 0 0 1 0 1.5H4.75Z" /></svg></button>` : ''} </div> <p class="text-xs ${roleColorClass}">${escapeHtml(roleName)}</p> </div> ${lockToggleHTML} </div>
            ${permissionsHTML}
            <div class="flex justify-end mt-2"> <button class="delete-user-button py-1 px-3 text-xs font-semibold bg-red-600 text-white rounded-lg ${!canDelete ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-700'}" data-userid="${userId}" ${!canDelete ? 'disabled' : ''}>Löschen</button> </div>
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
    // Der Aufruf bleibt hier, die Funktion selbst wird separat aktualisiert/ersetzt
    addAdminUserManagementListeners(userManagementArea, isAdmin, isSysAdminEditing, permSet, allPermissions, displayRoleOptions);
    restoreAdminScrollIfAny();
}

// Ersetze NUR diese Funktion in admin_benutzersteuerung.js
export function addAdminUserManagementListeners(area, isAdmin, isSysAdminEditing, permSet, allPermissions, displayRoleOptions) {
    if (!area) {
        console.error("addAdminUserManagementListeners: FEHLER - 'area' wurde nicht übergeben.");
        return;
    }

    // --- Nur EINEN primären Listener hinzufügen ---
    if (area.dataset.userManagementListenerAttached === 'true') {
        console.log("addAdminUserManagementListeners: Primärer Listener bereits vorhanden."); // Debug
        return;
    }
    area.dataset.userManagementListenerAttached = 'true';
    console.log("addAdminUserManagementListeners: Hänge primären CLICK Listener an userManagementArea an."); // Debug

    // --- CLICK Listener ---
    area.addEventListener('click', async (e) => {
        console.log("[CLICK] Event ausgelöst. Target:", e.target); // DEBUG: Welches Element wurde geklickt?
        const userCard = e.target.closest('.user-card');
        const userId = userCard?.dataset.userid;

        // --- Buttons AUSSERHALB der Karten ---
        const saveNewUserButton = e.target.closest('#saveNewUserButton');
        if (saveNewUserButton) {
            console.log("[CLICK] 'Neuen Benutzer speichern' Button erkannt."); // DEBUG
            // ... (Logik zum Speichern neuer Benutzer - Annahme: funktioniert) ...
            return;
        }
        const notRegisteredToggle = e.target.closest('#notRegisteredToggle');
        if (notRegisteredToggle) {
            console.log("[CLICK] 'Nicht registriert' Toggle erkannt."); // DEBUG
            // ... (Logik zum Umschalten der Liste) ...
            return;
        }

        // --- Aktionen INNERHALB einer Benutzerkarte ---
        if (!userCard || !userId) {
            console.log("[CLICK] Klick war nicht innerhalb einer User Card oder User ID fehlt."); // DEBUG
            return; // Klick war nicht relevant für eine spezifische Karte
        }
        console.log(`[CLICK] Klick innerhalb der Karte für User: ${userId}`); // DEBUG

        // Löschen Button
        const deleteButton = e.target.closest('.delete-user-button');
        if (deleteButton) {
            console.log(`[CLICK] Löschen Button für User ${userId} erkannt.`); // DEBUG
            // ... (Logik zum Löschen) ...
            return;
        }

        // Umbenennen Button (Stift)
        const renameButton = e.target.closest('.rename-user-btn');
        if (renameButton) {
            console.log(`[CLICK] Umbenennen (Stift) für User ${userId} erkannt.`); // DEBUG
            // ... (Logik zum Anzeigen der Edit-Felder) ...
            return;
        }

        // Speichern nach Umbenennen Button (Häkchen)
        const saveNameButton = e.target.closest('.save-name-btn');
        if (saveNameButton) {
            console.log(`[CLICK] Speichern (Name) für User ${userId} erkannt.`); // DEBUG
            // ... (Logik zum Speichern des Namens) ...
            return;
        }

        // --- Speichern der Berechtigungen Button ---
        const savePermsButton = e.target.closest('.save-perms-button');
        if (savePermsButton) {
            console.log(`[CLICK] Speichern (Berechtigungen) für User ${userId} erkannt.`); // DEBUG
            const permContainer = savePermsButton.closest('[data-userid]'); // Finde den Container der Karte
            if (!permContainer) {
                 console.error(`[CLICK] Konnte Berechtigungs-Container für User ${userId} nicht finden!`); // DEBUG
                 return;
            }

            const typeRadio = permContainer.querySelector('input[name^="perm-type-"]:checked');
            if (!typeRadio) {
                console.error(`[CLICK] Konnte Berechtigungstyp-Radiobutton für User ${userId} nicht lesen!`); // DEBUG
                return;
            }
            const type = typeRadio.value;
            console.log(`[CLICK] Gelesener Typ: ${type}`); // DEBUG

            rememberAdminScroll();
            let updateData = {};

            if (type === 'role') {
                const roleSelect = permContainer.querySelector('.user-role-select');
                if (!roleSelect) { console.error(`[CLICK] Konnte Rollen-Select für User ${userId} nicht finden!`); return; } // DEBUG
                const newRole = roleSelect.value;
                updateData = { role: newRole, permissionType: 'role', customPermissions: [], displayRole: null, assignedAdminRoleId: null, adminPermissions: {} };
                 console.log(`[CLICK] Update-Daten (Rolle):`, updateData); // DEBUG
            } else { // type === 'individual'
                const customPermissions = Array.from(permContainer.querySelectorAll('.custom-perm-checkbox:checked')).map(cb => cb.dataset.perm);
                const displayRoleSelect = permContainer.querySelector('.display-role-select');
                if (!displayRoleSelect) { console.error(`[CLICK] Konnte Display-Rollen-Select für User ${userId} nicht finden!`); return; } // DEBUG
                const selectedDisplayRole = displayRoleSelect.value || null;

                updateData = { permissionType: 'individual', customPermissions: customPermissions, role: null, displayRole: null, assignedAdminRoleId: null, adminPermissions: {} };
                if (selectedDisplayRole === 'ADMIN' || selectedDisplayRole === 'SYSTEMADMIN') {
                    updateData.role = selectedDisplayRole;
                } else {
                    updateData.displayRole = selectedDisplayRole;
                }
                 console.log(`[CLICK] Update-Daten (Individuell):`, updateData); // DEBUG
            }

            try {
                console.log(`[CLICK] Versuche updateDoc für User ${userId}...`); // DEBUG
                await updateDoc(doc(usersCollectionRef, userId), updateData);
                console.log(`[CLICK] updateDoc für User ${userId} erfolgreich.`); // DEBUG
                const saveBtnContainer = permContainer.querySelector('.save-perms-container');
                if (saveBtnContainer) saveBtnContainer.classList.add('hidden');
                alertUser("Berechtigungen gespeichert!", "success");
            } catch (error) {
                console.error(`[CLICK] FEHLER beim Speichern der Berechtigungen für User ${userId}:`, error); // DEBUG mit Fehlerdetails
                alertUser(`Fehler beim Speichern: ${error.message}`, "error");
            }
            return; // Klick behandelt
        }

        console.log("[CLICK] Klick innerhalb einer Karte, aber kein bekannter Button."); // DEBUG

    }); // Ende CLICK Listener

    // --- Separater CHANGE Listener für Inputs ---
    // Prüfen ob Listener schon dran ist
    if (area.dataset.userManagementChangeListenerAttached === 'true') {
         console.log("addAdminUserManagementListeners: CHANGE Listener bereits vorhanden."); // Debug
        // Nichts tun, wenn schon vorhanden
    } else {
        area.dataset.userManagementChangeListenerAttached = 'true'; // Markieren
        console.log("addAdminUserManagementListeners: Hänge CHANGE Listener an userManagementArea an."); // Debug
        area.addEventListener('change', async (e) => {
            console.log("[CHANGE] Event ausgelöst. Target:", e.target); // DEBUG: Welches Element wurde geändert?
            const target = e.target;
            const userCard = target.closest('.user-card');
            if (!userCard) return;
            const userId = userCard.dataset.userid;
            if (!userId) return;
            console.log(`[CHANGE] Änderung innerhalb der Karte für User: ${userId}`); // DEBUG

             // --- Aktivieren/Deaktivieren Toggle ---
             if (target.classList.contains('user-active-toggle')) {
                console.log(`[CHANGE] Aktiv-Toggle geändert für User ${userId}. Neuer Status (checked=gesperrt): ${target.checked}`); // DEBUG
                const isChecked = target.checked;
                 if (!confirm(`Möchten Sie den Status von ${USERS[userId].name} wirklich ändern?`)) {
                     target.checked = !isChecked; return;
                 }
                 // Berechtigungen prüfen...
                 let currentAdminPerms = {}; if (currentUser.role === 'ADMIN') { /*...*/ } const currentPermSet = (currentUser.role === 'SYSTEMADMIN') ? { canToggleUserActive: true } : currentAdminPerms; const requiresApproval = (currentUser.role === 'ADMIN' && currentPermSet.approvalRequired?.toggleUserActive);

                 if (requiresApproval) {
                     console.log(`[CHANGE] Genehmigung für Toggle erforderlich.`); // DEBUG
                     target.checked = !isChecked;
                     await createApprovalRequest('TOGGLE_USER_ACTIVE', userId, { isActive: !isChecked });
                 } else {
                     console.log(`[CHANGE] Speichere neuen Aktiv-Status direkt.`); // DEBUG
                     try {
                         await updateDoc(doc(usersCollectionRef, userId), { isActive: !isChecked });
                         console.log(`[CHANGE] Aktiv-Status gespeichert.`); // DEBUG
                     } catch (error) {
                         console.error("[CHANGE] Fehler beim Ändern des Status:", error); // DEBUG
                         alertUser("Fehler beim Ändern.", "error");
                         target.checked = !isChecked;
                     }
                 }
                 return; // Änderung behandelt
             }

            // --- Änderungen an Berechtigungs-Inputs (Radio, Select, Checkbox) ---
            if (target.matches('.perm-type-toggle, .user-role-select, .custom-perm-checkbox, .display-role-select')) {
                 console.log(`[CHANGE] Berechtigungs-Input geändert für User ${userId}. Element:`, target); // DEBUG
                const container = target.closest('[data-userid]');
                if (!container) return;

                // Ansicht umschalten bei Radio-Button Änderung
                if (target.classList.contains('perm-type-toggle')) {
                     console.log(`[CHANGE] Berechtigungstyp umgeschaltet auf: ${target.value}`); // DEBUG
                    container.querySelector('.role-selection-area')?.classList.toggle('hidden', target.value !== 'role');
                    container.querySelector('.individual-perms-area')?.classList.toggle('hidden', target.value !== 'individual');
                }

                // Speicher-Button anzeigen
                const saveBtnContainer = container.querySelector('.save-perms-container');
                if (saveBtnContainer) {
                    console.log("[CHANGE] Zeige Speicher-Button an."); // DEBUG
                    saveBtnContainer.classList.remove('hidden');
                } else {
                     console.warn("[CHANGE] Konnte Speicher-Button-Container nicht finden zum Anzeigen!"); // DEBUG
                }


                // Abhängigkeiten für Checklist-Checkboxen prüfen
                if (target.dataset.perm === 'CHECKLIST') {
                     console.log("[CHANGE] Checklist-Haupt-Checkbox geändert, prüfe Abhängigkeiten."); // DEBUG
                     const individualPermsArea = container.querySelector('.individual-perms-area');
                     if (individualPermsArea) {
                         setupPermissionDependencies(individualPermsArea);
                     }
                }
                 return; // Änderung behandelt
            }

            console.log("[CHANGE] Änderung wurde erkannt, aber kein bekannter Input-Typ."); // DEBUG

        }); // Ende CHANGE Listener
    } // Ende if Listener noch nicht angehängt

} // Ende addAdminUserManagementListeners


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

function renderAdminUserDetails(userId) {
    const detailsArea = document.getElementById('admin-user-details-area');
    const adminUser = USERS[userId];

    if (detailsArea.dataset.editingUser === userId) {
        detailsArea.innerHTML = '';
        delete detailsArea.dataset.editingUser;
        return;
    }

    document.querySelectorAll('.edit-admin-user-btn').forEach(b => b.closest('.p-2').classList.remove('bg-indigo-100'));
    adminRightsArea.querySelector(`.edit-admin-user-btn[data-userid="${userId}"]`).closest('.p-2').classList.add('bg-indigo-100');


    detailsArea.dataset.editingUser = userId;

    const perms = adminUser.adminPermissions || {};
    const approvalPerms = perms.approvalRequired || {};
    const type = adminUser.permissionType || 'individual';

    let roleOptions = Object.values(ADMIN_ROLES)
        .filter(r => r.id !== 'LEERE_ROLLE')
        .map(r => `<option value="${r.id}" ${adminUser.assignedAdminRoleId === r.id ? 'selected' : ''}>${r.name}</option>`)
        .join('');
    detailsArea.innerHTML = `
        <div class="p-4 border-t-4 border-indigo-500 rounded-xl bg-gray-50 mt-4 relative shadow-lg">
            <button id="close-details-btn" class="absolute top-2 right-3 text-2xl font-bold text-gray-400 hover:text-red-600">&times;</button>
            <p class="font-bold text-lg text-indigo-800">${adminUser.name} bearbeiten</p>
            
            <div class="mt-4 pt-3 border-t">
                <label class="block text-sm font-medium text-gray-700 mb-2">Berechtigungs-Typ</label>
                <div class="flex items-center gap-4">
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="individual" class="perm-type-toggle" data-userid="${userId}" ${type === 'individual' ? 'checked' : ''}> <span class="ml-2">Individuell</span></label>
                    <label class="flex items-center"><input type="radio" name="perm-type-${userId}" value="role" class="perm-type-toggle" data-userid="${userId}" ${type === 'role' ? 'checked' : ''}> <span class="ml-2">Rolle</span></label>
                </div>
            </div>

            <div class="role-selection-area mt-2 ${type === 'role' ? '' : 'hidden'}">
                <select id="assigned-admin-role-select" class="w-full p-2 border rounded-lg bg-white text-sm" data-userid="${userId}">${roleOptions}</select>
            </div>

            <div class="individual-perms-area mt-3 space-y-3 ${type === 'individual' ? '' : 'hidden'}">
                <div class="p-3 border rounded-lg bg-white">
                    <h5 class="font-semibold text-sm mb-2 text-gray-600">Sichtbarkeit von Admin-Menüpunkten</h5>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeePasswords" ${perms.canSeePasswords ? 'checked' : ''}> <span>Passwörter</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeApprovals" ${perms.canSeeApprovals ? 'checked' : ''}> <span>Genehmigungen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeRoleManagement" ${perms.canSeeRoleManagement ? 'checked' : ''}> <span>Rollenverwaltung</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canViewLogs" ${perms.canViewLogs ? 'checked' : ''}> <span>Protokolle</span></label>
                        <label class="flex items-center col-span-2 gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeUsers" ${perms.canSeeUsers ? 'checked' : ''}> <span>Benutzersteuerung</span></label>

                        <div class="col-span-2 mt-2 pt-2 border-t">
                            <label class="flex items-center gap-2 font-semibold"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeMainFunctions" ${perms.canSeeMainFunctions ? 'checked' : ''}> <span>Adminfunktionen Hauptseite</span></label>
                            <div class="pl-6 mt-1 space-y-1">
                                <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canUseMainPush" ${perms.canUseMainPush ? 'checked' : ''}> <span>-> Push</span></label>
                                <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canUseMainEntrance" ${perms.canUseMainEntrance ? 'checked' : ''}> <span>-> Eingang</span></label>
                                <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canUseMainChecklist" ${perms.canUseMainChecklist ? 'checked' : ''}> <span>-> Checkliste</span></label>
                            </div>
                        </div>
                    </div>
                    <div class="pl-6 mt-3 pt-3 border-t border-gray-200 space-y-3">
                        <h5 class="font-semibold text-sm mb-2 text-gray-500">Aktionen in "Benutzersteuerung"</h5>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canCreateUser" ${perms.canCreateUser ? 'checked' : ''}> <span>Benutzer anlegen</span></label>
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canDeleteUser" ${perms.canDeleteUser ? 'checked' : ''}> <span>Benutzer löschen</span></label>
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canRenameUser" ${perms.canRenameUser ? 'checked' : ''}> <span>Benutzer umbenennen</span></label>
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canToggleUserActive" ${perms.canToggleUserActive ? 'checked' : ''}> <span>Benutzer ent-/sperren</span></label>
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canChangeUserPermissionType" ${perms.canChangeUserPermissionType ? 'checked' : ''}> <span>Berechtigungs-Typ ändern</span></label>
                        </div>
                        <h5 class="font-semibold text-sm mb-2 mt-3 text-gray-500">Rechte in "Rollenverwaltung"</h5>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canEditUserRoles" ${perms.canEditUserRoles ? 'checked' : ''}> <span>Darf Benutzer-Rollen bearbeiten</span></label>
                        </div>
                            <h5 class="font-semibold text-sm mb-2 mt-3 text-gray-500">Rechte in "Protokoll History"</h5>
                        <div class="grid grid-cols-2 gap-2 text-sm">
                            <label class="flex items-center gap-2"><input type="checkbox" class="admin-perm-cb" data-perm="canSeeSysadminLogs" ${perms.canSeeSysadminLogs ? 'checked' : ''}> <span>Darf Sysadmin-Einträge sehen</span></label>
                        </div>
                    </div>
                </div>
                <div class="p-3 border rounded-lg bg-white">
                    <h5 class="font-semibold text-sm mb-2 text-gray-600">Genehmigungsprozess</h5>
                    <p class="text-xs text-gray-500 mb-3">Wenn hier ein Haken gesetzt ist, muss die jeweilige Aktion von einem Systemadmin genehmigt werden.</p>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="setAdminStatus" ${approvalPerms.setAdminStatus ? 'checked' : ''}> <span>Admin-Status setzen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="createUser" ${approvalPerms.createUser ? 'checked' : ''}> <span>Benutzer anlegen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="deleteUser" ${approvalPerms.deleteUser ? 'checked' : ''}> <span>Benutzer löschen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="renameUser" ${approvalPerms.renameUser ? 'checked' : ''}> <span>Benutzer umbenennen</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="toggleUserActive" ${approvalPerms.toggleUserActive ? 'checked' : ''}> <span>Benutzer ent-/sperren</span></label>
                        <label class="flex items-center gap-2"><input type="checkbox" class="approval-cb" data-perm="changeUserPermissionType" ${approvalPerms.changeUserPermissionType ? 'checked' : ''}> <span>Berechtigungs-Typ ändern</span></label>
                    </div>
                </div>
            </div>
            
            <div class="mt-4 pt-4 border-t flex justify-end">
                <button id="save-admin-details-btn" data-userid="${userId}" class="py-2 px-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition">Änderungen speichern</button>
            </div>
        </div>
    `;
    detailsArea.querySelector('#close-details-btn').addEventListener('click', () => {
        detailsArea.innerHTML = '';
        delete detailsArea.dataset.editingUser;
        document.querySelectorAll('.edit-admin-user-btn').forEach(b => b.closest('.p-2').classList.remove('bg-indigo-100'));
    });
    detailsArea.querySelectorAll('.perm-type-toggle').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const type = e.target.value;
            const card = e.target.closest('.p-4');
            card.querySelector('.role-selection-area').classList.toggle('hidden', type !== 'role');
            card.querySelector('.individual-perms-area').classList.toggle('hidden', type !== 'individual');
        });
    });
    detailsArea.querySelector('#save-admin-details-btn').addEventListener('click', async (e) => {
        const userId = e.currentTarget.dataset.userid;
        const container = e.currentTarget.closest('.p-4');

        const selectedType = container.querySelector('input[name^="perm-type-"]:checked').value;
        const updateData = {
            permissionType: selectedType
        };

        if (selectedType === 'role') {
            updateData.assignedAdminRoleId = container.querySelector('#assigned-admin-role-select').value;
            updateData.adminPermissions = {};
        } else {
            const permissions = {};
            container.querySelectorAll('.admin-perm-cb').forEach(cb => {
                permissions[cb.dataset.perm] = cb.checked;
            });

            const approvalRequired = {};
            container.querySelectorAll('.approval-cb').forEach(cb => {
                approvalRequired[cb.dataset.perm] = cb.checked;
            });
            permissions.approvalRequired = approvalRequired;

            updateData.adminPermissions = permissions;
            updateData.assignedAdminRoleId = null;
        }

        await updateDoc(doc(usersCollectionRef, userId), updateData);
        alertUser("Änderungen gespeichert!", "success");

        setTimeout(async () => {
            await renderAdminRightsManagement();
            if (document.getElementById('admin-user-details-area')) {
                renderAdminUserDetails(userId);
            }
        }, 200);
    });

    // Stellt sicher, dass die Abhängigkeitslogik für die Checkboxen aktiv ist
    setupPermissionDependencies(detailsArea);
}
