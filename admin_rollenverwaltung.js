// // @ts-check
// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
// KORREKTUR: Fehlende Firebase-Funktionen für Lösch-Logik importiert
import { doc, updateDoc, setDoc, deleteDoc, onSnapshot, writeBatch, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { initialAuthCheckDone, adminSectionsState, rolesCollectionRef, ADMIN_ROLES, ROLES, adminRolesCollectionRef, currentUser, db, roleManagementSectionsState, alertUser, USERS, usersCollectionRef } from './haupteingang.js'; // USERS importiert
import { checkCurrentUserValidity } from './log-InOut.js';
import { logAdminAction } from './admin_protokollHistory.js';
import { setupPermissionDependencies, renderAdminRightsManagement } from './admin_rechteverwaltung.js';
import { renderMainFunctionsAdminArea, renderAdminVotesTable } from './admin_adminfunktionenHome.js';
// ENDE-ZIKA //

export function listenForRoleUpdates() {
    onSnapshot(rolesCollectionRef, (snapshot) => {
        
        // =================================================================
        // BEGINN DER KORREKTUR (Logout-Problem)
        // =================================================================
        if (!snapshot.empty) {
            Object.keys(ROLES).forEach(key => delete ROLES[key]);
            snapshot.forEach((doc) => { ROLES[doc.id] = { id: doc.id, ...doc.data() }; });
            
            if (initialAuthCheckDone) {
                checkCurrentUserValidity();
            }
            // Sicherstellen, dass die Render-Funktion existiert, bevor sie aufgerufen wird
            if (adminSectionsState.role && typeof renderRoleManagement === 'function') renderRoleManagement();
        } else {
            console.warn("listenForRoleUpdates: Leerer Snapshot empfangen. ROLES-Cache wird nicht geleert.");
        }
        // =================================================================
        // ENDE DER KORREKTUR
        // =================================================================

    }, (error) => {
        console.error("Error listening for role updates:", error);
    });
}

export function listenForAdminRoleUpdates() {
    onSnapshot(adminRolesCollectionRef, (snapshot) => {
        
        // =================================================================
        // BEGINN DER KORREKTUR (Logout-Problem)
        // =================================================================
        if (snapshot.size > 0) { 
            // 1. Alle alten Admin-Rollen aus dem Speicher löschen
            Object.keys(ADMIN_ROLES).forEach(key => delete ADMIN_ROLES[key]); 
            
            // 2. Die neuen, frischen Admin-Rollen aus der Datenbank einlesen
            snapshot.forEach((doc) => { ADMIN_ROLES[doc.id] = { id: doc.id, ...doc.data() }; });
            
            
            // 3. Prüfen, ob die App schon gestartet ist
            if (initialAuthCheckDone) {
                // 4. Rechte des aktuellen Benutzers SOFORT neu berechnen.
                checkCurrentUserValidity(); // <-- DAS IST AUCH DER SCHLÜSSEL ZUM LIVE-UPDATE
            }

            // =================================================================
            // BEGINN DER KORREKTUR (FEHLER 2: Live-Anzeige)
            // =================================================================
            // HIER rufen wir jetzt die importierte Funktion auf.
            // Wenn die Admin-Rechte-Sektion offen ist, wird sie neu geladen.
            if (adminSectionsState.adminRights && typeof renderAdminRightsManagement === 'function') {
                 renderAdminRightsManagement(); 
            }
            // =================================================================
            // ENDE DER KORREKTUR
            // =================================================================

            if (adminSectionsState.role && typeof renderRoleManagement === 'function') renderRoleManagement();
            
            // =================================================================
            // BEGINN DER ÄNDERUNG (LIVE-UPDATE FÜR ADMIN-FUNKTIONEN)
            // =================================================================
            // NEU: Prüfen, ob der Tab "Adminfunktionen Hauptseite" offen ist
            // und die Funktionen importiert wurden.
            if (adminSectionsState.mainFunctions && typeof renderMainFunctionsAdminArea === 'function') {
                console.log("Live-Update (Admin-Rolle): Neuzeichnen der Adminfunktionen-Tabs...");
                // Zeichnet die TABS ("Termin finden") und die TABELLEN-KÖPFE (TH) neu
                renderMainFunctionsAdminArea(); 
            }
            if (adminSectionsState.mainFunctions && typeof renderAdminVotesTable === 'function') {
                 console.log("Live-Update (Admin-Rolle): Neuzeichnen der Admin-Umfragetabelle...");
                 // Zeichnet den TABELLEN-INHALT (TBODY) neu (mit korrekter Spaltenanzahl)
                 renderAdminVotesTable(); 
            }
            // =================================================================
            // ENDE DER ÄNDERUNG
            // =================================================================
            
        } else {
             console.warn("listenForAdminRoleUpdates: Leerer Snapshot empfangen. ADMIN_ROLES-Cache wird nicht geleert.");
        }
        // =================================================================
        // ENDE DER KORREKTUR
        // =================================================================
    
    
    }, (error) => {
        console.error("Error listening for admin role updates:", error);
    });
}

export function renderRoleManagement() {
    const roleManagementArea = document.getElementById('roleManagementArea');
    if (!roleManagementArea) {
        console.error("renderRoleManagement: Container #roleManagementArea nicht gefunden.");
        return; 
    }

    roleManagementArea.innerHTML = '';
    let effectiveAdminPerms = {};
    const isAdmin = currentUser.role === 'ADMIN' || (currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN');
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    
    if (isAdmin && USERS && USERS[currentUser.mode]) { 
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

    const canEditUserRoles = isSysAdmin ||
        (isAdmin && effectiveAdminPerms.canEditUserRoles);

    const userRolesContainer = document.createElement('div');
    userRolesContainer.className = 'pl-2 border-l-4 border-gray-200';
    userRolesContainer.innerHTML = `
        <div id="userRolesToggle" class="card bg-white p-4 rounded-xl shadow cursor-pointer hover:shadow-md transition duration-200">
            <div class="flex justify-between items-center">
                <span class="text-xl font-bold text-gray-800">Benutzer-Rollen verwalten</span>
                <svg id="userRolesToggleIcon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6 transform transition-transform ${roleManagementSectionsState.userRolesOpen ? 'rotate-180' : ''}">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
            </div>
        </div>
        <div id="userRolesArea" class="bg-gray-50 rounded-b-xl mt-0 p-4 flex flex-col gap-4 ${roleManagementSectionsState.userRolesOpen ? '' : 'hidden'}">
            <button id="showAddRoleFormBtn" class="w-full p-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition shadow-sm ${!canEditUserRoles ? 'hidden' : ''}">+ Benutzerrolle anlegen</button>
            <div id="addRoleFormContainer" class="p-4 border rounded-xl bg-green-50 hidden">
                <h4 class="font-bold text-lg text-green-800 mb-3">Neue Benutzer-Rolle anlegen</h4>
                <div class="space-y-3" id="newRolePermissions">
                    <input type="text" id="newRoleName" class="w-full p-2 border rounded-lg" placeholder="Rollenname">
                </div>
                <button id="saveNewRoleButton" class="w-full mt-3 p-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition">
                    <span class="button-text">Benutzer-Rolle erstellen</span>
                    <div class="loading-spinner" style="display: none;"></div>
                </button>
            </div>
            <div id="userRolesList" class="space-y-3 pt-4"></div>
        </div>`;
    roleManagementArea.appendChild(userRolesContainer);

    const allRolePermissions = {
        'ENTRANCE': { label: 'Haupteingang öffnen', indent: false },
        'PUSHOVER': { label: 'Push-Nachricht senden', indent: false },
        'PUSHOVER_SETTINGS_GRANTS': { label: '-> Einstellungen-Button zum Berechtigungen anlegen', indent: true },
        'PUSHOVER_NOTRUF_SETTINGS': { label: '-> Notruf-Einstellungen', indent: true },
        'PUSHOVER_NOTRUF_SETTINGS_FLIC': { label: '-> -> Flic-Notruf-Button', indent: true },
        'PUSHOVER_NOTRUF_SETTINGS_NACHRICHTENCENTER': { label: '-> -> Nachrichtencenter', indent: true },
        'PUSHOVER_NOTRUF_SETTINGS_ALARM_PROGRAMME': { label: '-> -> Alarm-Programme', indent: true },
        'CHECKLIST': { label: 'Aktuelle Checkliste', indent: false },
        'CHECKLIST_SWITCH': { label: '-> Listen umschalten', indent: true },
        'CHECKLIST_SETTINGS': { label: '-> Checkliste-Einstellungen', indent: true },
        'ESSENSBERECHNUNG': { label: 'Essensberechnung', indent: false },
        'TERMINPLANER': { label: 'Termin finden', indent: false }, 
        'TERMINPLANER_CREATE': { label: '-> Neuen Termin anlegen', indent: true },
        'ZAHLUNGSVERWALTUNG': { label: 'Zahlungsverwaltung', indent: false },
        'ZAHLUNGSVERWALTUNG_CREATE': { label: '-> Neue Zahlung anlegen', indent: true },
        'TICKET_SUPPORT': { label: 'Ticket Support', indent: false },
        'WERTGUTHABEN': { label: 'Wertguthaben', indent: false },
        'LIZENZEN': { label: 'Lizenzen', indent: false },
        'VERTRAGSVERWALTUNG': { label: 'Vertragsverwaltung', indent: false },
        'REZEPTE': { label: 'Rezepte', indent: false },
        'HAUSHALTSZAHLUNGEN': { label: 'Haushaltszahlungen', indent: false },
        'HAUSHALTSZAHLUNGEN_CREATE': { label: '-> Neue Zahlung anlegen', indent: true },
        'GESCHENKEMANAGEMENT': { label: 'Geschenkemanagement', indent: false },
        'GESCHENKEMANAGEMENT_CREATE': { label: '-> Neues Geschenk anlegen', indent: true }
    };
    
    const newRolePermsContainer = document.getElementById('newRolePermissions');
    Object.keys(allRolePermissions).forEach(permKey => {
        const perm = allRolePermissions[permKey];
        const marginLeft = permKey.startsWith('PUSHOVER_NOTRUF_SETTINGS_') ? 'pl-12' : (perm.indent ? 'pl-6' : '');
        const isDisabled = perm.indent ? 'disabled' : ''; 
        
        newRolePermsContainer.innerHTML += `
            <label class="flex items-center gap-2 cursor-pointer ${marginLeft}">
                <input type="checkbox" id="newRolePerm-${permKey}" data-perm="${permKey}" class="h-4 w-4 new-role-perm-cb" ${isDisabled}> <span>${perm.label}</span>
            </label>`;
    });

    const userRolesList = document.getElementById('userRolesList');
    Object.values(ROLES).forEach(role => {
        const isProtectedRole = ['SYSTEMADMIN', 'ADMIN', 'NO_RIGHTS'].includes(role.id);
        const canEditThisRole = canEditUserRoles && (!isProtectedRole || isSysAdmin);
        const canDeleteThisRole = canEditUserRoles && role.deletable !== false && !isProtectedRole; 
        
        let permissionsCheckboxesHTML = ''; 

        if (role.id === 'SYSTEMADMIN') {
            permissionsCheckboxesHTML = `<p class="text-sm font-semibold text-purple-700 italic p-2 bg-purple-50 rounded-lg">Alle Rechte freigeschaltet</p>`;
        } else {
            const isChecklistEnabled = role.permissions?.includes('CHECKLIST'); 
            const isPushoverEnabled = role.permissions?.includes('PUSHOVER');
            const isPushoverNotrufEnabled = role.permissions?.includes('PUSHOVER_NOTRUF_SETTINGS');
            const isTerminplanerEnabled = role.permissions?.includes('TERMINPLANER'); 
            const isZahlungsverwaltungEnabled = role.permissions?.includes('ZAHLUNGSVERWALTUNG');
            const isHaushaltszahlungenEnabled = role.permissions?.includes('HAUSHALTSZAHLUNGEN');
            const isGeschenkemanagementEnabled = role.permissions?.includes('GESCHENKEMANAGEMENT');
            
            permissionsCheckboxesHTML = Object.keys(allRolePermissions).map(permKey => {
                const perm = allRolePermissions[permKey];
                const isChecked = role.permissions?.includes(permKey) ? 'checked' : '';
                
                let isDisabled = !canEditThisRole;
                if (permKey.startsWith('CHECKLIST_') && !isChecklistEnabled) {
                    isDisabled = true;
                }
                if (permKey.startsWith('PUSHOVER_') && permKey !== 'PUSHOVER' && !isPushoverEnabled) {
                    isDisabled = true;
                }
                if (permKey.startsWith('PUSHOVER_NOTRUF_SETTINGS_') && !isPushoverNotrufEnabled) {
                    isDisabled = true;
                }
                if (permKey.startsWith('TERMINPLANER_') && !isTerminplanerEnabled) {
                    isDisabled = true;
                }
                if (permKey.startsWith('ZAHLUNGSVERWALTUNG_') && !isZahlungsverwaltungEnabled) {
                    isDisabled = true;
                }
                if (permKey.startsWith('HAUSHALTSZAHLUNGEN_') && !isHaushaltszahlungenEnabled) {
                    isDisabled = true;
                }
                if (permKey.startsWith('GESCHENKEMANAGEMENT_') && !isGeschenkemanagementEnabled) {
                    isDisabled = true;
                }
                
                const marginLeft = permKey.startsWith('PUSHOVER_NOTRUF_SETTINGS_') ? 'pl-12' : (perm.indent ? 'pl-6' : '');
                return `
                    <label class="flex items-center gap-2 ${canEditThisRole ? 'cursor-pointer' : ''} ${marginLeft} ${isDisabled ? 'opacity-50' : ''}">
                        <input type="checkbox" class="role-perm-toggle" data-roleid="${role.id}" data-perm="${permKey}" ${isChecked} ${isDisabled ? 'disabled' : ''}> 
                        <span>${perm.label}</span>
                    </label>`;
            }).join('');
        }

        const roleCard = document.createElement('div');
        roleCard.className = `p-3 border rounded-lg bg-white shadow-sm ${!canEditThisRole && isProtectedRole ? 'opacity-60 bg-gray-50' : ''}`;
        
        roleCard.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <p class="font-bold text-gray-800">${role.name}</p>
                ${canDeleteThisRole ?
                `<button class="delete-role-button p-1 bg-red-100 text-red-600 rounded hover:bg-red-200" data-roleid="${role.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button>` : ''}
            </div>
            <div class="space-y-2 text-sm">${permissionsCheckboxesHTML}</div>`;
        userRolesList.appendChild(roleCard);
    });

    const setupCheckboxDependencies = (container) => {
        const setupPair = (mainPerm, subPerms) => {
            const mainCheckbox = container.querySelector(`[data-perm="${mainPerm}"]`);
            if (!mainCheckbox) return; 

            const subCheckboxes = subPerms.map(perm => container.querySelector(`[data-perm="${perm}"]`)).filter(Boolean);
            if (subCheckboxes.length === 0) return; 

            const toggleSubPermissions = () => {
                const isEnabled = mainCheckbox.checked && !mainCheckbox.disabled;
                
                subCheckboxes.forEach(subCb => {
                    subCb.disabled = !isEnabled; 
                    if (!isEnabled) { 
                        if (subCb.checked) { 
                            subCb.checked = false; 
                            subCb.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                });
            };
            
            mainCheckbox.addEventListener('change', toggleSubPermissions);
            toggleSubPermissions(); 
        };

        setupPair('CHECKLIST', ['CHECKLIST_SWITCH', 'CHECKLIST_SETTINGS']);
        setupPair('PUSHOVER', ['PUSHOVER_SETTINGS_GRANTS', 'PUSHOVER_NOTRUF_SETTINGS']);
        setupPair('PUSHOVER_NOTRUF_SETTINGS', ['PUSHOVER_NOTRUF_SETTINGS_FLIC', 'PUSHOVER_NOTRUF_SETTINGS_NACHRICHTENCENTER', 'PUSHOVER_NOTRUF_SETTINGS_ALARM_PROGRAMME']);
        setupPair('TERMINPLANER', ['TERMINPLANER_CREATE']);
        setupPair('ZAHLUNGSVERWALTUNG', ['ZAHLUNGSVERWALTUNG_CREATE']);
        setupPair('HAUSHALTSZAHLUNGEN', ['HAUSHALTSZAHLUNGEN_CREATE']);
        setupPair('GESCHENKEMANAGEMENT', ['GESCHENKEMANAGEMENT_CREATE']);
    };

    userRolesList.querySelectorAll('.p-3.border').forEach(card => setupCheckboxDependencies(card));
    setupCheckboxDependencies(document.getElementById('addRoleFormContainer'));

    document.getElementById('showAddRoleFormBtn').addEventListener('click', (e) => {
        e.target.style.display = 'none';
        document.getElementById('addRoleFormContainer').classList.remove('hidden');
    });

    document.getElementById('saveNewRoleButton').addEventListener('click', async (e) => {
        roleManagementSectionsState.userRolesOpen = true;
        const saveBtn = e.currentTarget;
        const roleNameInput = document.getElementById('newRoleName');
        const roleName = roleNameInput.value.trim();
        const roleId = roleName.toUpperCase().replace(/\s/g, '');
        
        if (!roleName || (ROLES[roleId] && ROLES[roleId].name === roleName)) {
            return alertUser("Bitte einen gültigen, eindeutigen Rollennamen eingeben.", "error");
        }

        const permissions = [];
        document.querySelectorAll('.new-role-perm-cb:checked').forEach(cb => {
            permissions.push(cb.dataset.perm);
        });

        try {
            saveBtn.disabled = true;
            await setDoc(doc(rolesCollectionRef, roleId), { name: roleName, permissions, deletable: true });
            await logAdminAction('role_created', `Rolle '${roleName}' (${roleId}) erstellt.`);
            renderRoleManagement();
            
        } catch (error) {
            console.error("Fehler beim Speichern der Benutzer-Rolle:", error);
            alertUser("Fehler beim Speichern.", "error");
            saveBtn.disabled = false;
        }
    });
    
    userRolesList.querySelectorAll('.role-perm-toggle').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            const { roleid, perm } = e.target.dataset;
            const role = ROLES[roleid];
            const permissions = Array.from(document.querySelectorAll(`.role-perm-toggle[data-roleid="${roleid}"]:checked`))
                .map(cb => cb.dataset.perm);
            await updateDoc(doc(rolesCollectionRef, roleid), { permissions });
            if (ROLES[roleid]) ROLES[roleid].permissions = permissions;
            await logAdminAction('role_permissions_changed', `Berechtigungen für Rolle '${role.name}' geändert: ${perm} ${e.target.checked ? 'aktiviert' : 'deaktiviert'}.`);
            renderRoleManagement();
        });
    });
    
    const deleteAdminRoleHandler = async (e) => {
        roleManagementSectionsState.adminRolesOpen = true;
        const roleId = e.currentTarget.dataset.roleid;
        const roleName = ADMIN_ROLES[roleId]?.name;
        if (!roleName) return;
        if (confirm(`Möchten Sie die Admin-Rolle '${roleName}' wirklich löschen? Alle Admins, die diese Rolle verwenden, verlieren dadurch ihre Rollen-Berechtigungen.`)) {
            try {
                const batch = writeBatch(db);
                const q = query(usersCollectionRef, where('assignedAdminRoleId', '==', roleId));
                const usersToUpdateSnapshot = await getDocs(q);
                usersToUpdateSnapshot.forEach(userDoc => {
                    batch.update(userDoc.ref, { assignedAdminRoleId: null });
                });
                batch.delete(doc(adminRolesCollectionRef, roleId));
                await batch.commit();

                await logAdminAction('admin_role_deleted', `Admin-Rolle '${roleName}' (${roleId}) gelöscht.`);
                renderRoleManagement(); 
            } catch (error) {
                 console.error("Fehler beim Löschen der Admin-Rolle:", error);
                 alertUser("Fehler beim Löschen der Admin-Rolle.", "error");
            }
        }
    };

    userRolesList.querySelectorAll('.delete-role-button').forEach(button => {
        button.addEventListener('click', async (e) => {
            roleManagementSectionsState.userRolesOpen = true;
            const roleId = e.currentTarget.dataset.roleid;
            const roleToDeleteName = ROLES[roleId]?.name || 'Unbekannte Rolle'; 
            
            if (confirm(`Möchten Sie die Rolle '${roleToDeleteName}' wirklich löschen?`)) {
                try {
                    await deleteDoc(doc(rolesCollectionRef, roleId));
                    await logAdminAction('role_deleted', `Rolle '${roleToDeleteName}' (${roleId}) gelöscht.`);
                    alertUser(`Rolle '${roleToDeleteName}' wurde erfolgreich gelöscht!`, "success"); 
                } catch (error) {
                    console.error("Fehler beim Löschen der Benutzer-Rolle:", error);
                    alertUser(`Fehler beim Löschen der Benutzer-Rolle: ${error.message || error.toString()}`, "error"); 
                }
            }
        });
    });
    
    document.getElementById('userRolesToggle').addEventListener('click', () => {
        roleManagementSectionsState.userRolesOpen = !roleManagementSectionsState.userRolesOpen;
        document.getElementById('userRolesArea').classList.toggle('hidden');
        document.getElementById('userRolesToggleIcon').classList.toggle('rotate-180');
    });

    if (currentUser.role === 'SYSTEMADMIN') {
        const adminRolesContainer = document.createElement('div');
        adminRolesContainer.className = "mt-6 pl-2 border-l-4 border-gray-200";
        
        adminRolesContainer.innerHTML = `
            <div id="adminRolesToggle" class="card bg-white p-4 rounded-xl shadow cursor-pointer hover:shadow-md transition duration-200">
                <div class="flex justify-between items-center">
                    <span class="text-xl font-bold text-purple-800">Admin-Rollen verwalten</span>
                    <svg id="adminRolesToggleIcon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-6 h-6 transform transition-transform ${roleManagementSectionsState.adminRolesOpen ? 'rotate-180' : ''}">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                </div>
            </div>
            <div id="adminRolesArea" class="bg-gray-50 rounded-b-xl mt-0 p-4 flex flex-col gap-4 ${roleManagementSectionsState.adminRolesOpen ? '' : 'hidden'}">
                <button id="showAddAdminRoleFormBtn" class="w-full p-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition shadow-sm">+ Admin-Rolle anlegen</button>
                <div id="addAdminRoleFormContainer" class="p-4 border rounded-xl bg-purple-50 hidden">
                    <h4 id="adminRoleFormTitle" class="font-bold text-lg text-purple-800 mb-3">Neue Admin-Rolle anlegen</h4>
                    <input type="hidden" id="editingAdminRoleId">
                    <div class="space-y-3">
                        <input type="text" id="newAdminRoleName" class="w-full p-2 border rounded-lg" placeholder="Admin-Rollenname">
                        
                        <div class="space-y-3 mt-3">
                            <div class="p-3 border rounded-lg bg-white bg-opacity-50">
                                <h5 class="font-semibold text-sm mb-2 text-gray-600">Sichtbarkeit von Admin-Menüpunkten</h5>
                                <div class="grid grid-cols-2 gap-2 text-sm">
                                    <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canSeePasswords"> <span>Passwörter</span></label>
                                    <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canSeeApprovals"> <span>Genehmigungen</span></label>
                                    <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canSeeRoleManagement"> <span>Rollenverwaltung</span></label>
                                    <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canViewLogs"> <span>Protokolle</span></label>
                                    <label class="flex items-center col-span-2 gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canSeeUsers"> <span>Benutzersteuerung</span></label>
                                    
                                    <div class="col-span-2 mt-2 pt-2 border-t">
                                        <label class="flex items-center gap-2 font-semibold"><input type="checkbox" class="new-admin-perm-cb" data-perm="canSeeMainFunctions"> <span>Adminfunktionen Hauptseite</span></label>
                                        
                                        <div class="pl-6 mt-1 space-y-1">
                                            <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canUseMainPush"> <span>-> Push</span></label>
                                            <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canUseMainEntrance"> <span>-> Eingang</span></label>
                                            <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canUseMainChecklist"> <span>-> Checkliste</span></label>
                                            
                                            <div class="pt-1"> <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canUseMainTerminplaner"> <span>-> Termin finden</span></label>
                                                <div class="pl-6 mt-1 space-y-1"> <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canSeePollToken"> <span>-> Umfrage-Token anzeigen</span></label>
                                                    <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canSeePollEditToken"> <span>-> EDIT-Token anzeigen</span></label>
                                                </div>
                                            </div>

                                            <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canUseMainZahlungsverwaltung"> <span>-> Zahlungsverwaltung</span></label>
                                            <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canUseMainHaushaltszahlungen"> <span>-> Haushaltszahlungen</span></label>
                                            <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canUseMainGeschenkemanagement"> <span>-> Geschenkemanagement</span></label>

                                            </div>
                                        </div>
                                </div>
                                
                                <div class="pl-0 mt-3 pt-3 border-t border-gray-200 space-y-3"> <h5 class="font-semibold text-sm mb-3 text-gray-500">Aktionen und Genehmigung</h5>
                                    
                                    <div class="grid grid-cols-2 gap-4 text-sm">
                                        <div class="flex flex-col gap-4">
                                            <div>
                                                <label class="flex items-center gap-2">
                                                    <input type="checkbox" class="new-admin-perm-cb h-4 w-4" data-perm="canCreateUser">
                                                    <span class="text-sm">Benutzer anlegen</span>
                                                </label>
                                                <label class="flex items-center gap-2 pl-6 mt-1">
                                                    <input type="checkbox" class="approval-cb h-4 w-4" data-perm="createUser">
                                                    <span class="text-xs text-red-600">Genehmigung erforderlich</span>
                                                </label>
                                            </div>
                                            <div>
                                                <label class="flex items-center gap-2">
                                                    <input type="checkbox" class="new-admin-perm-cb h-4 w-4" data-perm="canDeleteUser">
                                                    <span class="text-sm">Benutzer löschen</span>
                                                </label>
                                                <label class="flex items-center gap-2 pl-6 mt-1">
                                                    <input type="checkbox" class="approval-cb h-4 w-4" data-perm="deleteUser">
                                                    <span class="text-xs text-red-600">Genehmigung erforderlich</span>
                                                </label>
                                            </div>
                                            <div>
                                                <label class="flex items-center gap-2">
                                                    <input type="checkbox" class="new-admin-perm-cb h-4 w-4" data-perm="canRenameUser">
                                                    <span class="text-sm">Benutzer umbenennen</span>
                                                </label>
                                                <label class="flex items-center gap-2 pl-6 mt-1">
                                                    <input type="checkbox" class="approval-cb h-4 w-4" data-perm="renameUser">
                                                    <span class="text-xs text-red-600">Genehmigung erforderlich</span>
                                                </label>
                                            </div>
                                        </div>
                                        
                                        <div class="flex flex-col gap-4">
                                            <div>
                                                <label class="flex items-center gap-2">
                                                    <input type="checkbox" class="new-admin-perm-cb h-4 w-4" data-perm="canToggleUserActive">
                                                    <span class="text-sm">Benutzer ent-/sperren</span>
                                                </label>
                                                <label class="flex items-center gap-2 pl-6 mt-1">
                                                    <input type="checkbox" class="approval-cb h-4 w-4" data-perm="toggleUserActive">
                                                    <span class="text-xs text-red-600">Genehmigung erforderlich</span>
                                                </label>
                                            </div>
                                            <div>
                                                <label class="flex items-center gap-2">
                                                    <input type="checkbox" class="new-admin-perm-cb h-4 w-4" data-perm="canChangeUserPermissionType">
                                                    <span class="text-sm">Berechtigungs-Typ ändern</span>
                                                </label>
                                                <label class="flex items-center gap-2 pl-6 mt-1">
                                                    <input type="checkbox" class="approval-cb h-4 w-4" data-perm="changeUserPermissionType">
                                                    <span class="text-xs text-red-600">Genehmigung erforderlich</span>
                                                </label>
                                            </div>
                                            <div>
                                                <label class="flex items-center gap-2 mt-1">
                                                    <input type="checkbox" class="approval-cb h-4 w-4" data-perm="setAdminStatus">
                                                    <span class="text-sm">Admin-Status setzen</span>
                                                    <span class="text-xs text-red-600">(Genehmigung)</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <h5 class="font-semibold text-sm mb-2 mt-3 text-gray-500">Weitere Berechtigungen</h5>
                                    <div class="grid grid-cols-2 gap-4 text-sm">
                                        <div class="flex flex-col gap-2">
                                            <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canEditUserRoles"> <span>Darf Benutzer-Rollen bearbeiten</span></label>
                                        </div>
                                        <div class="flex flex-col gap-2">
                                            <label class="flex items-center gap-2"><input type="checkbox" class="new-admin-perm-cb" data-perm="canSeeSysadminLogs"> <span>Darf Sysadmin-Einträge sehen</span></label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            </div>
                        <button id="saveNewAdminRoleButton" class="w-full p-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition mt-3">
                            <span class="button-text">Admin-Rolle speichern</span>
                            <div class="loading-spinner" style="display: none;"></div>
                        </button>
                    </div>
                </div>
                <div id="adminRolesList" class="space-y-3 pt-4"></div>
            </div>`;
            
        roleManagementArea.appendChild(adminRolesContainer);

        const adminRolesList = document.getElementById('adminRolesList');
        Object.values(ADMIN_ROLES).filter(role => role.id !== 'LEERE_ROLLE').forEach(adminRole => {
            const isDeletable = adminRole.deletable !== false;
            const roleCard = document.createElement('div');
            roleCard.className = 'p-3 border rounded-lg bg-white shadow-sm';
            roleCard.innerHTML = `
                <div class="flex justify-between items-center">
                    <p class="font-bold text-gray-800">${adminRole.name}</p>
                    <div class="flex items-center gap-2">
                        <button class="edit-admin-role-btn p-1 text-gray-500 hover:text-indigo-600" data-roleid="${adminRole.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.775a.75.75 0 0 0-.22.53l-.5 2.5a.75.75 0 0 0 .913.913l2.5-.5a.75.75 0 0 0 .53-.22l4.263-4.262a1.75 1.75 0 0 0 0-2.475Z" /><path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v9.5c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25V9.5a.75.75 0 0 1 1.5 0v5.25A2.75 2.75 0 0 1 14.25 18h-9.5A2.75 2.75 0 0 1 2 15.25v-9.5A2.75 2.75 0 0 1 4.75 3.5h5.25a.75.75 0 0 1 0 1.5H4.75Z" /></svg></button>
                        ${isDeletable ?
                    `<button class="delete-admin-role-button p-1 bg-red-100 text-red-600 rounded hover:bg-red-200" data-roleid="${adminRole.id}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button>` : ''}
                    </div>
                </div>`;
            adminRolesList.appendChild(roleCard);
        });

        const adminRoleForm = document.getElementById('addAdminRoleFormContainer');
        const showAdminRoleFormBtn = document.getElementById('showAddAdminRoleFormBtn');

        const openAdminRoleEditor = (roleId = null) => {
            const formTitle = adminRoleForm.querySelector('#adminRoleFormTitle');
            const nameInput = adminRoleForm.querySelector('#newAdminRoleName');
            const idInput = adminRoleForm.querySelector('#editingAdminRoleId');
            const permCheckboxes = adminRoleForm.querySelectorAll('.new-admin-perm-cb');
            const approvalCheckboxes = adminRoleForm.querySelectorAll('.approval-cb');
            
            if (roleId) {
                const role = ADMIN_ROLES[roleId];
                if (!role) {
                    alertUser("Fehler: Rolle nicht gefunden.", "error");
                    return;
                }
                formTitle.textContent = 'Admin-Rolle bearbeiten';
                idInput.value = roleId;
                nameInput.value = role.name;
                nameInput.disabled = false; 
                
                permCheckboxes.forEach(cb => {
                    cb.checked = role.permissions[cb.dataset.perm] || false;
                });
                approvalCheckboxes.forEach(cb => {
                    cb.checked = role.permissions.approvalRequired?.[cb.dataset.perm] || false;
                });
            } else {
                formTitle.textContent = 'Neue Admin-Rolle anlegen';
                idInput.value = '';
                nameInput.value = '';
                nameInput.disabled = false;
                permCheckboxes.forEach(cb => cb.checked = false);
                approvalCheckboxes.forEach(cb => cb.checked = false);
            }
            showAdminRoleFormBtn.style.display = 'none';
            adminRoleForm.classList.remove('hidden');

            setupPermissionDependencies(adminRoleForm);
            
            const setupApprovalDependencies = (form) => {
                const permPairs = [
                    { main: 'canCreateUser', approval: 'createUser' },
                    { main: 'canDeleteUser', approval: 'deleteUser' },
                    { main: 'canRenameUser', approval: 'renameUser' },
                    { main: 'canToggleUserActive', approval: 'toggleUserActive' },
                    { main: 'canChangeUserPermissionType', approval: 'changeUserPermissionType' }
                ];

                permPairs.forEach(pair => {
                    const mainCb = form.querySelector(`.new-admin-perm-cb[data-perm="${pair.main}"]`);
                    const approvalCb = form.querySelector(`.approval-cb[data-perm="${pair.approval}"]`);

                    if (mainCb && approvalCb) {
                        const updateState = () => {
                            const isMainChecked = mainCb.checked;
                            approvalCb.disabled = !isMainChecked; 
                            if (!isMainChecked) {
                                approvalCb.checked = false; 
                            }
                        };
                        
                        mainCb.addEventListener('change', updateState);
                        updateState(); 
                    }
                });
            };
            
            setupApprovalDependencies(adminRoleForm);
        };

        showAdminRoleFormBtn.addEventListener('click', () => openAdminRoleEditor());
        adminRolesList.querySelectorAll('.edit-admin-role-btn').forEach(button => {
            button.addEventListener('click', (e) => openAdminRoleEditor(e.currentTarget.dataset.roleid));
        });
        
        adminRolesList.querySelectorAll('.delete-admin-role-button').forEach(button => {
            button.addEventListener('click', deleteAdminRoleHandler); 
        });

        document.getElementById('saveNewAdminRoleButton').addEventListener('click', async (e) => {
            roleManagementSectionsState.adminRolesOpen = true;
            const saveBtn = e.currentTarget;
            const roleName = document.getElementById('newAdminRoleName').value.trim();
            const editingId = document.getElementById('editingAdminRoleId').value;
            const roleId = editingId ? editingId : roleName.toUpperCase().replace(/\s/g, '');

            if (!roleName) return alertUser("Bitte gültigen Namen eingeben.", "error");
            if (!editingId && ADMIN_ROLES[roleId]) return alertUser("Eine Rolle mit diesem Namen (oder ID) existiert bereits.", "error");

            const permissions = {};
            document.querySelectorAll('#addAdminRoleFormContainer .new-admin-perm-cb').forEach(cb => {
                permissions[cb.dataset.perm] = cb.checked;
            });

            const approvalRequired = {};
            document.querySelectorAll('#addAdminRoleFormContainer .approval-cb').forEach(cb => {
                approvalRequired[cb.dataset.perm] = cb.checked;
            });
            permissions.approvalRequired = approvalRequired;

            saveBtn.disabled = true; 
            
            try {
                if (editingId) {
                    await updateDoc(doc(adminRolesCollectionRef, editingId), { 
                        name: roleName, 
                        permissions: permissions 
                    });
                    await logAdminAction('admin_role_edited', `Admin-Rolle '${roleName}' bearbeitet.`);
                } else {
                    const docData = { name: roleName, permissions, deletable: true };
                    await setDoc(doc(adminRolesCollectionRef, roleId), docData);
                    await logAdminAction('admin_role_created', `Admin-Rolle '${roleName}' erstellt.`);
                }
                
                adminRoleForm.classList.add('hidden');
                showAdminRoleFormBtn.style.display = 'block';
                renderRoleManagement();
                
            } catch (error) {
                console.error("Fehler beim Speichern der Admin-Rolle:", error);
                alertUser("Fehler beim Speichern der Admin-Rolle.", "error");
                saveBtn.disabled = false;
            }
        });

        document.getElementById('adminRolesToggle').addEventListener('click', () => {
            roleManagementSectionsState.adminRolesOpen = !roleManagementSectionsState.adminRolesOpen;
            document.getElementById('adminRolesArea').classList.toggle('hidden');
            document.getElementById('adminRolesToggleIcon').classList.toggle('rotate-180');
        });
    }
}