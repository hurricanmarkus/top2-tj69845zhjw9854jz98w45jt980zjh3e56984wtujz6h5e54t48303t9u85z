// =================================================================
// BEGINN DER ÄNDERUNG (Importe)
// =================================================================
// 1. Importiere die benötigten Firebase-Funktionen DIREKT von Firebase
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, query, where, serverTimestamp, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 2. Importiere die Variablen/Funktionen, die tatsächlich aus haupteingang.js kommen
import {
    db, USERS, ADMIN_ROLES, DELETED_CHECKLISTS, alertUser, adminSectionsState, currentUser,
    votesCollectionRef // <-- NEU: Importiert, um auf Umfragen zuzugreifen
} from './haupteingang.js';
// =================================================================
// ENDE DER ÄNDERUNG
// =================================================================

// 3. Importiere die benötigten Render-Funktionen aus ihren jeweiligen Dateien
import { renderUserKeyList, renderUserManagement } from './admin_benutzersteuerung.js';
import { renderRoleManagement } from './admin_rollenverwaltung.js';
import { renderApprovalProcess } from './admin_genehmigungsprozess.js';
import { renderProtocolHistory, logAdminAction } from './admin_protokollHistory.js';
import { renderAdminRightsManagement } from './admin_rechteverwaltung.js'; // Pfad ggf. anpassen!
import { renderPermanentDeleteModal } from './checklist.js';
// --- (Der Rest deiner Importe bleibt, falls noch andere da waren) ---

(function setupGlobalScrollRestore() {
    const ROOT_SELECTOR = '.main-content'; // <— falls dein Haupt-Container anders heißt, hier anpassen

    let observer = null;

    function initObserver(rootEl) {
        if (!rootEl) return;
        if (observer) observer.disconnect();

        observer = new MutationObserver(() => {
            if (sessionStorage.getItem('adminScrollY') !== null) {
                restoreAdminScrollIfAny(); // nutzt deine Helfer-Funktion
            }
        });

        observer.observe(rootEl, { childList: true, subtree: true });
    }

    function getRootCandidate() {
        return document.querySelector(ROOT_SELECTOR) || document.body || document.documentElement;
    }

    // Wiederholt versuchen, bis der richtigen Container existiert
    (function waitForRoot() {
        const root = getRootCandidate();
        if (root) {
            initObserver(root);

            // Falls anfangs nur <body> existiert und später .main-content kommt, hängen wir uns um
            const reattachWatcher = new MutationObserver(() => {
                const main = document.querySelector(ROOT_SELECTOR);
                if (main && main !== root) {
                    initObserver(main);
                    reattachWatcher.disconnect();
                }
            });
            reattachWatcher.observe(document.documentElement, { childList: true, subtree: true });
            return;
        }
        // Noch nicht bereit? Im nächsten Frame nochmal probieren.
        requestAnimationFrame(waitForRoot);
    })();
})();

export function rememberAdminScroll() {
    const scroller = document.querySelector('.main-content') || document.scrollingElement || document.documentElement;
    if (scroller) sessionStorage.setItem('adminScrollY', String(scroller.scrollTop || scroller.scrollY || 0));
}

// Ersetze NUR DIESE Funktion in admin_adminfunktionenHome.js
export function restoreAdminScrollIfAny() {
    // Finde das scrollbare Element. WICHTIG: Stelle sicher, dass '.main-content' das Element ist, das tatsächlich scrollt!
    // Falls nicht, passe den Selektor an (z.B. 'body' oder 'html')
    const scroller = document.querySelector('.main-content') || document.body || document.documentElement;
    const yRaw = sessionStorage.getItem('adminScrollY');
    const y = yRaw !== null ? Number(yRaw) : NaN;

    console.log(`restoreAdminScrollIfAny: Versuch der Wiederherstellung. Scroller: ${scroller ? scroller.tagName : 'Nein'}, Y: ${yRaw} (${y})`);

    // Wert entfernen, egal was passiert, um Endlosschleifen zu vermeiden
    sessionStorage.removeItem('adminScrollY');
    console.log(`restoreAdminScrollIfAny: Gespeicherten Wert 'adminScrollY' entfernt.`);

    if (scroller && !Number.isNaN(y) && y > 0) { // Nur scrollen, wenn Wert gültig und nicht 0
        // --- LETZTER VERSUCH: Längere Verzögerung und Fokus-Management ---
        setTimeout(() => {
            console.log(`restoreAdminScrollIfAny (nach 150ms): Versuche Scroll zu ${y}`);
            try {
                // Erneut das Element holen, falls es sich geändert hat
                const currentScroller = document.querySelector('.main-content') || document.body || document.documentElement;
                if (currentScroller === scroller) {
                    // Fokus entfernen
                    if (document.activeElement && document.activeElement instanceof HTMLElement) {
                        console.log(`restoreAdminScrollIfAny: Entferne Fokus von ${document.activeElement.tagName}`);
                        document.activeElement.blur();
                    }

                    // Scrolle mit direkter Zuweisung
                    console.log(`restoreAdminScrollIfAny: Setze scrollTop direkt auf ${y}`);
                    currentScroller.scrollTop = y;

                    // FINALE Prüfung
                    const finalScrollTop = currentScroller.scrollTop;
                    console.log(`restoreAdminScrollIfAny: ScrollTop nach direkter Zuweisung (150ms): ${finalScrollTop}`);

                    // Wenn es immer noch 0 ist, ist das Problem woanders
                    if (finalScrollTop < y && y > 50) { // Toleranz für kleine Abweichungen, aber nicht wenn es auf 0 springt
                         console.error(`restoreAdminScrollIfAny: ScrollTop ist immer noch ${finalScrollTop} statt ${y}. Scroll wird extern überschrieben!`);
                         // Hier könnte man versuchen, den Fokus explizit auf den Scroller zu setzen,
                         // aber das kann unerwünschte Nebeneffekte haben.
                         // currentScroller.focus(); // Nur als letzter Ausweg testen
                    }

                } else {
                     console.warn("restoreAdminScrollIfAny (nach 150ms): Scroller-Element hat sich geändert!");
                }
            } catch (e) {
                console.error("restoreAdminScrollIfAny (nach 150ms): Fehler bei scrollTop Zuweisung:", e);
            }
        }, 150); // Verzögerung auf 150 Millisekunden erhöht
        // --- ENDE LETZTER VERSUCH ---
    } else {
        if (Number.isNaN(y)) { console.warn("restoreAdminScrollIfAny: Y-Wert war ungültig."); }
        else if (y === 0) { console.log("restoreAdminScrollIfAny: Gespeicherter Wert war 0, kein Scroll nötig."); }
        else { console.warn("restoreAdminScrollIfAny: Konnte Scroller nicht finden."); }
    }
}

export function renderMainFunctionsAdminArea() {
    const tabsContainer = document.getElementById('main-functions-tabs');
    if (!tabsContainer) return;

    // --- START DER ÄNDERUNG ---
    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    let effectiveAdminPerms = {};
    if (isAdmin) {
        const adminUser = USERS[currentUser.mode];
        if (adminUser) {
            if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
            } else {
                effectiveAdminPerms = adminUser.adminPermissions || {};
            }
        }
    }
    
    // (Benutzer-Berechtigungen werden hier nicht mehr für den Tab gebraucht)
    // const userPermissions = currentUser.permissions || [];

    // Tabs basierend auf Rechten ein- oder ausblenden
    const pushTab = tabsContainer.querySelector('[data-target-card="card-main-push"]');
    const entranceTab = tabsContainer.querySelector('[data-target-card="card-main-entrance"]');
    const checklistTab = tabsContainer.querySelector('[data-target-card="card-main-checklist"]');
    
    // 1. Finde den neuen Tab-Button (den wir unten dynamisch hinzufügen)
    let terminplanerTab = tabsContainer.querySelector('[data-target-card="card-main-terminplaner"]');

    if (pushTab) pushTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainPush) ? 'block' : 'none';
    if (entranceTab) entranceTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainEntrance) ? 'block' : 'none';
    if (checklistTab) checklistTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainChecklist) ? 'block' : 'none';
    
    // =================================================================
    // BEGINN DER FEHLERBEHEBUNG (Bug 1: Tab-Sichtbarkeit)
    // =================================================================
    // 2. (KORRIGIERT) Prüfe die ADMIN-Berechtigung "canUseMainTerminplaner"
    //    statt der Benutzer-Berechtigung "TERMINPLANER".
    // ALT: const canSeeTerminplaner = userPermissions.includes('TERMINPLANER') || isSysAdmin;
    const canSeeTerminplaner = isSysAdmin || effectiveAdminPerms.canUseMainTerminplaner;
    // =================================================================
    // ENDE DER FEHLERBEHEBUNG
    // =================================================================

    // 3. Den Tab-Button dynamisch erstellen, falls er fehlt
    if (canSeeTerminplaner && !terminplanerTab) {
        tabsContainer.insertAdjacentHTML('beforeend', `
            <button data-target-card="card-main-terminplaner"
                    class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Termin finden</button>
        `);
        // Button neu suchen, da wir ihn gerade erst erstellt haben
        terminplanerTab = tabsContainer.querySelector('[data-target-card="card-main-terminplaner"]');
    }
    
    // 4. Den Tab-Button anzeigen oder verstecken
    if (terminplanerTab) {
        terminplanerTab.style.display = canSeeTerminplaner ? 'block' : 'none';
    }

    // --- ENDE DER ÄNDERUNG ---

    const deletePermanentlyBtn = document.getElementById('permanently-delete-items-btn');
    if (deletePermanentlyBtn && !deletePermanentlyBtn.dataset.listenerAttached) {
        deletePermanentlyBtn.addEventListener('click', () => {
            const deletedCount = Object.keys(DELETED_CHECKLISTS || {}).length;
            if (deletedCount === 0) {
                alertUser("Der Papierkorb ist bereits leer.", "success");
                return;
            }
            renderPermanentDeleteModal();
            const modal = document.getElementById('permanentDeleteModal');
            if (modal) modal.style.display = 'flex';
        });
        deletePermanentlyBtn.dataset.listenerAttached = 'true';
    }

    // =================================================================
    // BEGINN DER FEHLERBEHEBUNG (Bug 2: Token-Spalten-Header)
    // =================================================================
    
    // NEU: Berechtigungen für Token-Spalten holen
    const canSeePollToken = isSysAdmin || effectiveAdminPerms.canSeePollToken;
    const canSeePollEditToken = isSysAdmin || effectiveAdminPerms.canSeePollEditToken;

    // NEU: colspan (Spaltenbreite für Lade-Text) anpassen
    let colspan = 11; // 13 (original) - 2 (tokens)
    if (canSeePollToken) colspan++;
    if (canSeePollEditToken) colspan++;

    const contentArea = document.getElementById('main-functions-content-area');
    if (contentArea && !document.getElementById('card-main-terminplaner')) {
        const terminplanerCard = document.createElement('div');
        terminplanerCard.id = 'card-main-terminplaner';
        terminplanerCard.className = 'main-functions-card hidden';
        terminplanerCard.innerHTML = `
            <div class="p-4 bg-gray-50 rounded-lg">
                <h3 class="text-lg font-bold text-gray-800 mb-3">Übersicht aller Umfragen</h3>
                
                <input type="text" id="terminplaner-admin-search" 
                       class="w-full p-2 border border-gray-300 rounded-lg mb-4" 
                       placeholder="Tabelle durchsuchen (nach Titel, Autor, Token...)"
                >
                
                <div class="overflow-x-auto w-full border border-gray-300 rounded-lg">
                    <table id="terminplaner-admin-table" class="min-w-full bg-white text-xs" style="border-collapse: collapse;">
                        <thead class="bg-gray-100">
                            <tr class="text-left">
                                <th class="p-2 border-b border-gray-300">Status</th>
                                <th class="p-2 border-b border-gray-300">Autor</th>
                                <th class="p-2 border-b border-gray-300">Titel</th>
                                <th class="p-2 border-b border-gray-300">Ort</th>
                                <th class="p-2 border-b border-gray-300">Dauer noch</th>
                                <th class="p-2 border-b border-gray-300">Gültig bis</th>
                                <th class="p-2 border-b border-gray-300">Öffentlich</th>
                                <th class="p-2 border-b border-gray-300">Anonym</th>
                                <th class="p-2 border-b border-gray-300">Vielleicht-Opt.</th>
                                <th class="p-2 border-b border-gray-300">Antw. versteckt</th>
                                <th class="p-2 border-b border-gray-300">Nur Benutzer</th>
                                
                                ${canSeePollToken ? `<th class="p-2 border-b border-gray-300">Umfrage-TOKEN</th>` : ''}
                                ${canSeePollEditToken ? `<th class="p-2 border-b border-gray-300">EDIT-Token</th>` : ''}
                            </tr>
                        </thead>
                        <tbody id="terminplaner-admin-tbody">
                            <tr>
                                <td colspan="${colspan}" class="p-4 text-center text-gray-500">
                                    Lade Umfrage-Daten...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        contentArea.appendChild(terminplanerCard);

        // Listener für die neue Suchleiste hinzufügen
        const searchInput = document.getElementById('terminplaner-admin-search');
        if (searchInput && !searchInput.dataset.listenerAttached) {
            searchInput.addEventListener('input', () => {
                renderAdminVotesTable(); 
            });
            searchInput.dataset.listenerAttached = 'true';
        }
    }
    // =================================================================
    // ENDE DER FEHLERBEHEBUNG
    // =================================================================


    if (tabsContainer.dataset.listenerAttached === 'true') return;

    tabsContainer.addEventListener('click', (e) => {
        const clickedTab = e.target.closest('.settings-tab-btn');
        if (!clickedTab) return;

        const targetCardId = clickedTab.dataset.targetCard;
        const prompt = document.getElementById('main-functions-prompt');
        const isAlreadyActive = clickedTab.classList.contains('bg-white');

        tabsContainer.querySelectorAll('.settings-tab-btn').forEach(tab => {
            tab.classList.remove('bg-white', 'shadow', 'text-indigo-600');
            tab.classList.add('text-gray-600');
        });
        document.querySelectorAll('.main-functions-card').forEach(card => card.classList.add('hidden'));

        if (isAlreadyActive) {
            if (prompt) prompt.classList.remove('hidden');
        } else {
            clickedTab.classList.add('bg-white', 'shadow', 'text-indigo-600');
            clickedTab.classList.remove('text-gray-600');
            const targetCard = document.getElementById(targetCardId);
            if (targetCard) {
                targetCard.classList.remove('hidden');
                if (prompt) prompt.classList.add('hidden');
            }
        }
    });
    tabsContainer.dataset.listenerAttached = 'true';
}

// ----------------------------------------------------------------
// (Diese Funktion ist in der GLEICHEN Datei admin_adminfunktionenHome.js)
// ----------------------------------------------------------------

export function renderAdminVotesTable() {
    const tbody = document.getElementById('terminplaner-admin-tbody');
    const searchInput = document.getElementById('terminplaner-admin-search');
    // Wichtig: Prüfen, ob USERS (aus den Imports) geladen ist
    if (!tbody || !USERS) {
        console.warn("renderAdminVotesTable: Abbruch, tbody oder USERS-Cache noch nicht bereit.");
        return; 
    }

    // =================================================================
    // BEGINN DER FEHLERBEHEBUNG (Bug 2: Token-Spalten-Inhalt)
    // =================================================================
    
    // NEU: Admin-Rechte holen, um zu entscheiden, ob Spalten angezeigt werden
    const isAdmin = currentUser.role === 'ADMIN';
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    let effectiveAdminPerms = {};
    if (isAdmin) {
        const adminUser = USERS[currentUser.mode];
        if (adminUser) {
            if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
            } else {
                effectiveAdminPerms = adminUser.adminPermissions || {};
            }
        }
    }
    const canSeePollToken = isSysAdmin || effectiveAdminPerms.canSeePollToken;
    const canSeePollEditToken = isSysAdmin || effectiveAdminPerms.canSeePollEditToken;
    
    // NEU: colspan (Spaltenbreite für Lade-Text) anpassen
    let colspan = 11; // 13 (original) - 2 (tokens)
    if (canSeePollToken) colspan++;
    if (canSeePollEditToken) colspan++;
    // ENDE NEU

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const now = new Date();

    // 1. Filtere die Daten basierend auf der Suche
    const filteredPolls = allPollsData.filter(poll => {
        if (searchTerm === '') return true; // Kein Filter = zeige alle
        
        // Finde den vollen Namen des Autors (falls vorhanden)
        const authorRealName = USERS[poll.createdBy]?.realName || '';

        // Erstelle einen durchsuchbaren Text-String
        const searchString = [
            poll.title,
            poll.createdByName,
            authorRealName,
            poll.location,
            poll.token,
            poll.editToken
        ].join(' ').toLowerCase();
        
        return searchString.includes(searchTerm);
    });

    if (filteredPolls.length === 0) {
        // KORRIGIERT: colspan
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="p-4 text-center text-gray-500">Keine Umfragen gefunden${searchTerm ? ' (für diesen Filter)' : ''}.</td></tr>`;
        return;
    }

    // 2. Baue die HTML-Zeilen
    tbody.innerHTML = filteredPolls.map(poll => {
        // --- Daten für jede Spalte aufbereiten ---
        const getSafeDate = (timestamp) => {
            if (!timestamp) return null;
            if (typeof timestamp.toDate === 'function') return timestamp.toDate();
            if (timestamp instanceof Date) return timestamp; 
            return new Date(timestamp);
        };

        const startTime = getSafeDate(poll.startTime);
        const endTime = getSafeDate(poll.endTime);
        const isFixed = poll.fixedOptionIndex != null;
        const isClosedByTime = (endTime && now > endTime);
        const isManuallyClosed = poll.isManuallyClosed === true;
        const isNotStarted = (startTime && now < startTime);

        // 1. Status
        let statusText = '';
        if (isFixed) statusText = '<span class="font-bold text-green-600">Fixiert</span>';
        else if (isClosedByTime) statusText = '<span class="text-red-600">Beendet</span>';
        else if (isManuallyClosed) statusText = '<span class="text-red-600">Beendet (Manuell)</span>';
        else if (isNotStarted) statusText = '<span class="text-blue-600">Startet bald</span>';
        else statusText = '<span class="text-yellow-600">Aktiv</span>';
        
        // 2. Autor (Voller Name, wenn verfügbar)
        const autorName = USERS[poll.createdBy]?.realName || poll.createdByName || 'Unbekannt';
        
        // 3. Titel
        const titel = poll.title || '---';
        
        // 4. Ort
        const ort = poll.location || '---';

        // 5. Dauer & 6. Gültig bis
        const dauerText = formatTimeRemaining(poll.endTime);
        const gueltigBisText = endTime ? endTime.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Unbegrenzt';

        // 7. Öffentlich
        const oeffentlichText = poll.isPublic ? 'Ja' : 'Nein';
        
        // 8. Anonym
        let anonymText = 'Nein';
        if (poll.isAnonymous) {
            anonymText = poll.anonymousMode === 'erzwingen' ? 'Ja (Erzwungen)' : 'Ja (Möglich)';
        }
        
        // 9. Vielleicht-Option
        const vielleichtText = poll.disableMaybe ? 'Deaktiviert' : 'Aktiv';
        
        // 10. Antworten verstecken
        let verstecktText = 'Nein';
        if (poll.hideAnswers) {
            if (poll.hideAnswersMode === 'bis_umfragenabschluss') verstecktText = 'Ja (Bis Abschluss)';
            else if (poll.hideAnswersMode === 'bis_stimmabgabe_mit_korrektur') verstecktText = 'Ja (Bis Abgabe)';
            else if (poll.hideAnswersMode === 'bis_stimmabgabe_ohne_korrektur') verstecktText = 'Ja (Bis Abgabe, keine Korr.)';
            else verstecktText = 'Ja';
        }

        // 11. Nur Benutzer
        const nurBenutzerText = (poll.accessPolicy === 'registered' || !poll.accessPolicy) ? 'Ja' : 'Nein (Gäste erlaubt)';

        // 12. & 13. Tokens
        const umfrageToken = poll.token || '---';
        const editToken = poll.editToken || '---';

        // HTML-Zeile bauen
        return `
            <tr class="hover:bg-gray-50 border-t border-gray-300">
                <td class="p-2 border-b border-gray-300">${statusText}</td>
                <td class="p-2 border-b border-gray-300">${autorName}</td>
                <td class="p-2 border-b border-gray-300 font-semibold">${titel}</td>
                <td class="p-2 border-b border-gray-300">${ort}</td>
                <td class="p-2 border-b border-gray-300">${dauerText}</td>
                <td class="p-2 border-b border-gray-300">${gueltigBisText}</td>
                <td class="p-2 border-b border-gray-300">${oeffentlichText}</td>
                <td class="p-2 border-b border-gray-300">${anonymText}</td>
                <td class="p-2 border-b border-gray-300">${vielleichtText}</td>
                <td class="p-2 border-b border-gray-300">${verstecktText}</td>
                <td class="p-2 border-b border-gray-300">${nurBenutzerText}</td>
                
                ${canSeePollToken ? `<td class="p-2 border-b border-gray-300 font-mono">${umfrageToken}</td>` : ''}
                ${canSeePollEditToken ? `<td class="p-2 border-b border-gray-300 font-mono">${editToken}</td>` : ''}
            </tr>
        `;
    }).join('');
    // =================================================================
    // ENDE DER FEHLERBEHEBUNG
    // =================================================================
}

// =================================================================
// BEGINN DER ÄNDERUNG (Funktion toggleAdminSection)
// =================================================================
export function toggleAdminSection(section) {
    Object.keys(adminSectionsState).forEach(key => {
        adminSectionsState[key] = key === section ? !adminSectionsState[key] : false;
    });

    // (Die 'getElementById'-Aufrufe müssen hier sein, da sie in der Originaldatei fehlen)
    const adminRightsArea = document.getElementById('adminRightsArea');
    const passwordManagementArea = document.getElementById('passwordManagementArea');
    const userManagementArea = document.getElementById('userManagementArea');
    const roleManagementArea = document.getElementById('roleManagementArea');
    const approvalProcessArea = document.getElementById('approvalProcessArea');
    const protocolHistoryArea = document.getElementById('protocolHistoryArea');
    const mainFunctionsArea = document.getElementById('mainFunctionsArea');

    const adminRightsToggleIcon = document.getElementById('adminRightsToggleIcon');
    const passwordToggleIcon = document.getElementById('passwordToggleIcon');
    const userManagementToggleIcon = document.getElementById('userManagementToggleIcon');
    const roleToggleIcon = document.getElementById('roleToggleIcon');
    const approvalToggleIcon = document.getElementById('approvalToggleIcon');
    const protocolHistoryToggleIcon = document.getElementById('protocolHistoryToggleIcon');
    const mainFunctionsToggleIcon = document.getElementById('mainFunctionsToggleIcon');
    
    // (Sicherheitsprüfungen, falls Elemente nicht gefunden werden)
    if (adminRightsArea) adminRightsArea.style.display = adminSectionsState.adminRights ? 'flex' : 'none';
    if (passwordManagementArea) passwordManagementArea.style.display = adminSectionsState.password ? 'flex' : 'none';
    if (userManagementArea) userManagementArea.style.display = adminSectionsState.user ? 'flex' : 'none';
    if (roleManagementArea) roleManagementArea.style.display = adminSectionsState.role ? 'flex' : 'none';
    if (approvalProcessArea) approvalProcessArea.style.display = adminSectionsState.approval ? 'flex' : 'none';
    if (protocolHistoryArea) protocolHistoryArea.style.display = adminSectionsState.protocol ? 'flex' : 'none';
    if (mainFunctionsArea) mainFunctionsArea.style.display = adminSectionsState.mainFunctions ? 'flex' : 'none';

    if (adminRightsToggleIcon) adminRightsToggleIcon.classList.toggle('rotate-180', adminSectionsState.adminRights);
    if (passwordToggleIcon) passwordToggleIcon.classList.toggle('rotate-180', adminSectionsState.password);
    if (userManagementToggleIcon) userManagementToggleIcon.classList.toggle('rotate-180', adminSectionsState.user);
    if (roleToggleIcon) roleToggleIcon.classList.toggle('rotate-180', adminSectionsState.role);
    if (approvalToggleIcon) approvalToggleIcon.classList.toggle('rotate-180', adminSectionsState.approval);
    if (protocolHistoryToggleIcon) protocolHistoryToggleIcon.classList.toggle('rotate-180', adminSectionsState.protocol);
    if (mainFunctionsToggleIcon) mainFunctionsToggleIcon.classList.toggle('rotate-180', adminSectionsState.mainFunctions);

    if (adminSectionsState.adminRights) renderAdminRightsManagement();
    if (adminSectionsState.password) renderUserKeyList();
    if (adminSectionsState.user) renderUserManagement();
    if (adminSectionsState.role) renderRoleManagement();
    if (adminSectionsState.approval) renderApprovalProcess();
    if (adminSectionsState.protocol) renderProtocolHistory();
    
    // --- Diese Logik ist NEU ---
    if (adminSectionsState.mainFunctions) {
        renderMainFunctionsAdminArea();
        listenForAdminVotes(); // Starte den Live-Spion für die Umfragen-Tabelle
    } else {
        listenForAdminVotes(true); // Stoppe den Spion, wenn die Sektion geschlossen wird
    }
}
// =================================================================
// ENDE DER ÄNDERUNG
// =================================================================


// =================================================================
// BEGINN DER ÄNDERUNG (Neue Funktionen)
// Füge diese Funktionen ganz am Ende der Datei hinzu.
// =================================================================

let allPollsData = []; // Speichert alle Umfragen im Cache
let unsubscribeAdminVotes = null; // Der Live-Spion

/**
 * Helfer-Funktion: Formatiert die verbleibende Zeit.
 */
function formatTimeRemaining(endTime) {
    if (!endTime) return 'Unbegrenzt';
    
    const now = new Date();
    // Prüfe, ob endTime ein Firebase Timestamp ist
    const endDate = (typeof endTime.toDate === 'function') ? endTime.toDate() : new Date(endTime);
    
    const diffMs = endDate.getTime() - now.getTime();

    if (diffMs <= 0) return "Beendet";

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) return `~${diffDays} T. ${diffHours} Std.`;
    
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours > 0) return `~${diffHours} Std. ${diffMinutes} Min.`;
    
    if (diffMinutes > 0) return `~${diffMinutes} Min.`;
    
    return "Endet bald";
}

/**
 * Startet (oder stoppt) den Live-Spion (onSnapshot) für ALLE Umfragen.
 */
function listenForAdminVotes(stopListener = false) {
    // Wenn die Sektion geschlossen wird, stoppe den Spion
    if (stopListener) {
        if (unsubscribeAdminVotes) {
            console.log("Stoppe Admin-Umfragen-Listener.");
            unsubscribeAdminVotes();
            unsubscribeAdminVotes = null;
        }
        return;
    }

    // Wenn der Spion schon läuft, starte ihn nicht nochmal
    if (unsubscribeAdminVotes) return; 

    console.log("Starte Admin-Umfragen-Listener...");
    // Prüfen, ob die votesCollectionRef (aus den Imports) verfügbar ist
    if (!votesCollectionRef) {
        console.error("Fehler: votesCollectionRef ist nicht importiert oder initialisiert!");
        return;
    }
    
    const q = query(votesCollectionRef, orderBy('createdAt', 'desc'));
    
    unsubscribeAdminVotes = onSnapshot(q, (snapshot) => {
        allPollsData = []; // Cache leeren
        snapshot.forEach(doc => {
            allPollsData.push({ id: doc.id, ...doc.data() });
        });
        console.log(`Admin-Listener: ${allPollsData.length} Umfragen geladen.`);
        // Rufe die Render-Funktion auf, um die Tabelle mit den neuen Daten zu füllen
        renderAdminVotesTable(); 
    }, (error) => {
        console.error("Fehler beim Laden der Admin-Umfragen:", error);
        const tbody = document.getElementById('terminplaner-admin-tbody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="p-4 text-center text-red-500">Fehler: ${error.message}</td></tr>`;
    });
}