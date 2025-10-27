// 1. Importiere die benötigten Firebase-Funktionen DIREKT von Firebase
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, query, where, serverTimestamp, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 2. Importiere die Variablen/Funktionen, die tatsächlich aus haupteingang.js kommen
import {
    db, USERS, ADMIN_ROLES, DELETED_CHECKLISTS, alertUser, adminSectionsState, currentUser // logAdminAction hinzugefügt, falls benötigt
} from './haupteingang.js';

// 3. Importiere die benötigten Render-Funktionen aus ihren jeweiligen Dateien
import { renderUserKeyList, renderUserManagement } from './admin_benutzersteuerung.js';
import { renderRoleManagement } from './admin_rollenverwaltung.js';
import { renderApprovalProcess } from './admin_genehmigungsprozess.js';
import { renderProtocolHistory, logAdminAction } from './admin_protokollHistory.js';
import { renderAdminRightsManagement } from './admin_rechteverwaltung.js'; // Pfad ggf. anpassen!

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

// Ersetze DIESE Funktion in admin_adminfunktionenHome.js
export function rememberAdminScroll() {
    // Finde das scrollbare Element
    const scroller = document.querySelector('.main-content') || document.body || document.documentElement;
    if (scroller) {
        const scrollY = scroller.scrollTop; // Hole die aktuelle Scrollposition
        sessionStorage.setItem('adminScrollY', String(scrollY)); // Speichere sie
        console.log(`rememberAdminScroll: Scroller gefunden (${scroller.tagName}), ScrollY gespeichert: ${scrollY}`); // Debugging
    } else {
        console.warn("rememberAdminScroll: Konnte kein scrollbares Element finden."); // Debugging
    }
}

// Ersetze AUCH DIESE Funktion in admin_adminfunktionenHome.js
export function restoreAdminScrollIfAny() {
    // Finde das scrollbare Element erneut
    const scroller = document.querySelector('.main-content') || document.body || document.documentElement;
    const yRaw = sessionStorage.getItem('adminScrollY'); // Hole den gespeicherten Wert
    const y = yRaw !== null ? Number(yRaw) : NaN; // Wandle ihn in eine Zahl um

    console.log(`restoreAdminScrollIfAny: Versuch der Wiederherstellung. Scroller gefunden: ${scroller ? scroller.tagName : 'Nein'}, Gespeicherter Y-Wert: ${yRaw}, Umgewandelt: ${y}`); // Debugging

    if (scroller && !Number.isNaN(y)) {
        console.log(`restoreAdminScrollIfAny: Scrolle ${scroller.tagName} zu Position ${y}`); // Debugging
        try {
            // Versuche sofort zu scrollen
            scroller.scrollTo({ top: y, behavior: 'auto' });
            // Prüfe direkt danach die Position (kann manchmal 0 sein, wenn Layout noch nicht passt)
            console.log(`restoreAdminScrollIfAny: ScrollTop direkt nach scrollTo: ${scroller.scrollTop}`); // Debugging
        } catch (e) {
            console.error("restoreAdminScrollIfAny: Fehler bei scrollTo:", e); // Debugging
            // Fallback für ältere Browser
            scroller.scrollTop = y;
            console.log(`restoreAdminScrollIfAny: ScrollTop nach Fallback-Zuweisung: ${scroller.scrollTop}`); // Debugging
        }
        // Wichtig: Den gespeicherten Wert erst entfernen, NACHDEM gescrollt wurde
        sessionStorage.removeItem('adminScrollY');
        console.log(`restoreAdminScrollIfAny: Gespeicherten Wert 'adminScrollY' entfernt.`); // Debugging
    } else if (Number.isNaN(y)) {
        console.warn("restoreAdminScrollIfAny: Gespeicherter Y-Wert war ungültig."); // Debugging
    } else {
         console.warn("restoreAdminScrollIfAny: Konnte Scroller nicht finden, um Position wiederherzustellen."); // Debugging
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

    // Tabs basierend auf Rechten ein- oder ausblenden
    const pushTab = tabsContainer.querySelector('[data-target-card="card-main-push"]');
    const entranceTab = tabsContainer.querySelector('[data-target-card="card-main-entrance"]');
    const checklistTab = tabsContainer.querySelector('[data-target-card="card-main-checklist"]');

    if (pushTab) pushTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainPush) ? 'block' : 'none';
    if (entranceTab) entranceTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainEntrance) ? 'block' : 'none';
    if (checklistTab) checklistTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainChecklist) ? 'block' : 'none';
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

export function toggleAdminSection(section) {
    Object.keys(adminSectionsState).forEach(key => {
        adminSectionsState[key] = key === section ? !adminSectionsState[key] : false;
    });

    adminRightsArea.style.display = adminSectionsState.adminRights ? 'flex' : 'none';
    passwordManagementArea.style.display = adminSectionsState.password ? 'flex' : 'none';
    userManagementArea.style.display = adminSectionsState.user ? 'flex' : 'none';
    roleManagementArea.style.display = adminSectionsState.role ? 'flex' : 'none';
    approvalProcessArea.style.display = adminSectionsState.approval ? 'flex' : 'none';
    protocolHistoryArea.style.display = adminSectionsState.protocol ? 'flex' : 'none';
    mainFunctionsArea.style.display = adminSectionsState.mainFunctions ? 'flex' : 'none';

    adminRightsToggleIcon.classList.toggle('rotate-180', adminSectionsState.adminRights);
    passwordToggleIcon.classList.toggle('rotate-180', adminSectionsState.password);
    userManagementToggleIcon.classList.toggle('rotate-180', adminSectionsState.user);
    roleToggleIcon.classList.toggle('rotate-180', adminSectionsState.role);
    approvalToggleIcon.classList.toggle('rotate-180', adminSectionsState.approval);
    protocolHistoryToggleIcon.classList.toggle('rotate-180', adminSectionsState.protocol);
    mainFunctionsToggleIcon.classList.toggle('rotate-180', adminSectionsState.mainFunctions);

    if (adminSectionsState.adminRights) renderAdminRightsManagement();
    if (adminSectionsState.password) renderUserKeyList();
    if (adminSectionsState.user) renderUserManagement();
    if (adminSectionsState.role) renderRoleManagement();
    if (adminSectionsState.approval) renderApprovalProcess();
    if (adminSectionsState.protocol) renderProtocolHistory();
    if (adminSectionsState.mainFunctions) renderMainFunctionsAdminArea();
}