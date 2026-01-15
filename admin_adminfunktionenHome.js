// // @ts-check
// =================================================================
// BEGINN DER ÄNDERUNG (Importe)
// =================================================================
// 1. Importiere die benötigten Firebase-Funktionen DIREKT von Firebase
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, query, where, serverTimestamp, orderBy, limit, getDoc, deleteField, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 2. Importiere die Variablen/Funktionen, die tatsächlich aus haupteingang.js kommen
import {
    db, USERS, appId, ADMIN_ROLES, DELETED_CHECKLISTS, alertUser, adminSectionsState, currentUser,
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

// Variable für die Admin-Suche
let foundAdminUserForPayment = null; 
let markedPaymentsCache = [];

export function renderMainFunctionsAdminArea() {
    const tabsContainer = document.getElementById('main-functions-tabs');
    if (!tabsContainer) return;

    const isAdmin = currentUser.role === 'ADMIN' || (currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN');
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    let effectiveAdminPerms = {};
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
    
    // Tabs Elemente finden
    const pushTab = tabsContainer.querySelector('[data-target-card="card-main-push"]');
    const entranceTab = tabsContainer.querySelector('[data-target-card="card-main-entrance"]');
    const checklistTab = tabsContainer.querySelector('[data-target-card="card-main-checklist"]');
    let terminplanerTab = tabsContainer.querySelector('[data-target-card="card-main-terminplaner"]');
    let zahlungsTab = tabsContainer.querySelector('[data-target-card="card-main-zahlungsverwaltung"]');

    // Sichtbarkeit basierend auf Rechten steuern
    if (pushTab) pushTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainPush) ? 'block' : 'none';
    if (entranceTab) entranceTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainEntrance) ? 'block' : 'none';
    if (checklistTab) checklistTab.style.display = (isSysAdmin || effectiveAdminPerms.canUseMainChecklist) ? 'block' : 'none';
    
    const canSeeTerminplaner = isSysAdmin || effectiveAdminPerms.canUseMainTerminplaner;
    const canSeeZahlungAdmin = isSysAdmin || effectiveAdminPerms.canUseMainZahlungsverwaltung; 

    // Terminplaner Tab erstellen falls nötig
    if (canSeeTerminplaner && !terminplanerTab) {
        tabsContainer.insertAdjacentHTML('beforeend', `
            <button data-target-card="card-main-terminplaner"
                    class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Termin finden</button>
        `);
        terminplanerTab = tabsContainer.querySelector('[data-target-card="card-main-terminplaner"]');
    }
    if (terminplanerTab) terminplanerTab.style.display = canSeeTerminplaner ? 'block' : 'none';

    // Zahlungsverwaltung Tab erstellen falls nötig
    if (canSeeZahlungAdmin && !zahlungsTab) {
        tabsContainer.insertAdjacentHTML('beforeend', `
            <button data-target-card="card-main-zahlungsverwaltung"
                    class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Zahlungsverwaltung</button>
        `);
        zahlungsTab = tabsContainer.querySelector('[data-target-card="card-main-zahlungsverwaltung"]');
    }
    if (zahlungsTab) zahlungsTab.style.display = canSeeZahlungAdmin ? 'block' : 'none';


    // --- KARTEN INHALTE RENDERN ---
    const contentArea = document.getElementById('main-functions-content-area');
    
    // 1. Zahlungsverwaltung Karte erstellen (oder resetten)
    const existingZahlungsCard = document.getElementById('card-main-zahlungsverwaltung');
    if (existingZahlungsCard) existingZahlungsCard.remove(); 

    if (contentArea && canSeeZahlungAdmin) {
        const card = document.createElement('div');
        card.id = 'card-main-zahlungsverwaltung';
        card.className = 'main-functions-card hidden';
        
        card.innerHTML = `
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 class="text-lg font-bold text-gray-800 mb-3">Papierkorb-Anfragen verwalten</h3>
                <p class="text-sm text-gray-600 mb-4">Suche nach einem Benutzer, um dessen markierte Lösch-Anfragen zu bearbeiten.</p>
                
                <div class="flex gap-2 mb-4">
                    <input type="text" id="admin-zv-user-search" class="flex-grow p-2 border border-gray-300 rounded-lg" placeholder="Name des Benutzers eingeben...">
                    <button id="admin-zv-user-search-btn" class="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">Suchen</button>
                </div>
                
                <div id="admin-zv-result-area" class="hidden border-t pt-4">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-bold text-gray-700">Gefundene Markierungen für: <span id="admin-zv-found-name" class="text-indigo-600"></span></h4>
                        <label class="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="checkbox" id="admin-zv-select-all" class="h-4 w-4 rounded text-indigo-600">
                            Alle auswählen
                        </label>
                    </div>
                    
                    <div id="admin-zv-list" class="space-y-2 max-h-80 overflow-y-auto mb-4 bg-white p-2 border rounded-lg">
                        <p class="text-center text-gray-400 italic">Keine markierten Einträge gefunden.</p>
                    </div>
                    
                    <div class="flex flex-wrap gap-2 justify-end pt-2 border-t">
                        <button id="btn-admin-zv-unmark" class="px-3 py-2 bg-gray-200 text-gray-800 font-bold rounded text-xs hover:bg-gray-300" disabled>Markierung entfernen</button>
                        <button id="btn-admin-zv-restore" class="px-3 py-2 bg-green-100 text-green-800 font-bold rounded text-xs hover:bg-green-200 border border-green-200" disabled>Wiederherstellen (Archiv)</button>
                        <button id="btn-admin-zv-delete" class="px-3 py-2 bg-red-600 text-white font-bold rounded text-xs hover:bg-red-700" disabled>Endgültig löschen</button>
                    </div>
                </div>
            </div>
        `;
        contentArea.appendChild(card);

        // Listener für die Suche
        const searchInput = document.getElementById('admin-zv-user-search');
        const searchBtn = document.getElementById('admin-zv-user-search-btn');
        
        if(searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') executeAdminZVSearch();
            });
        }
        
        if(searchBtn) searchBtn.addEventListener('click', executeAdminZVSearch);

        // Listener für Select All
        const selectAll = document.getElementById('admin-zv-select-all');
        if(selectAll) {
            selectAll.addEventListener('change', (e) => {
                const checked = e.target.checked;
                document.querySelectorAll('.admin-zv-cb').forEach(cb => cb.checked = checked);
                updateAdminZVButtons();
            });
        }

        // Listener für Buttons
        document.getElementById('btn-admin-zv-unmark').addEventListener('click', () => executeAdminZVAction('unmark'));
        document.getElementById('btn-admin-zv-restore').addEventListener('click', () => executeAdminZVAction('restore'));
        document.getElementById('btn-admin-zv-delete').addEventListener('click', () => executeAdminZVAction('delete'));
    }

    // 2. Terminplaner Karte neu zeichnen
    const existingCard = document.getElementById('card-main-terminplaner');
    if (existingCard) existingCard.remove();
    
    if (contentArea && canSeeTerminplaner) {
        const terminplanerCard = document.createElement('div');
        terminplanerCard.id = 'card-main-terminplaner';
        const isTargetCard = tabsContainer.querySelector('.settings-tab-btn.bg-white[data-target-card="card-main-terminplaner"]');
        terminplanerCard.className = `main-functions-card ${isTargetCard ? '' : 'hidden'}`;
        
        // Berechtigungen für Token-Spalten
        const canSeePollToken = isSysAdmin || effectiveAdminPerms.canSeePollToken;
        const canSeePollEditToken = isSysAdmin || effectiveAdminPerms.canSeePollEditToken;
        let colspan = 11;
        if (canSeePollToken) colspan++;
        if (canSeePollEditToken) colspan++;

        terminplanerCard.innerHTML = `
            <div class="p-4 bg-gray-50 rounded-lg">
                <h3 class="text-lg font-bold text-gray-800 mb-3">Übersicht aller Umfragen</h3>
                <input type="text" id="terminplaner-admin-search" class="w-full p-2 border border-gray-300 rounded-lg mb-4" placeholder="Tabelle durchsuchen...">
                <div class="overflow-x-auto w-full border border-gray-300 rounded-lg">
                    <table id="terminplaner-admin-table" class="min-w-full bg-white text-xs" style="border-collapse: collapse;">
                        <thead class="bg-gray-100">
                            <tr class="text-left">
                                <th class="p-2 border-b">Status</th>
                                <th class="p-2 border-b">Autor</th>
                                <th class="p-2 border-b">Titel</th>
                                <th class="p-2 border-b">Ort</th>
                                <th class="p-2 border-b">Dauer</th>
                                <th class="p-2 border-b">Bis</th>
                                <th class="p-2 border-b">Öff.</th>
                                <th class="p-2 border-b">Anon.</th>
                                <th class="p-2 border-b">Viel.</th>
                                <th class="p-2 border-b">Verst.</th>
                                <th class="p-2 border-b">User</th>
                                ${canSeePollToken ? `<th class="p-2 border-b">Token</th>` : ''}
                                ${canSeePollEditToken ? `<th class="p-2 border-b">Edit-Token</th>` : ''}
                            </tr>
                        </thead>
                        <tbody id="terminplaner-admin-tbody"><tr><td colspan="${colspan}" class="p-4 text-center">Lade Daten...</td></tr></tbody>
                    </table>
                </div>
            </div>
        `;
        contentArea.appendChild(terminplanerCard);
        
        const searchInput = document.getElementById('terminplaner-admin-search');
        if (searchInput && !searchInput.dataset.listenerAttached) {
            searchInput.addEventListener('input', renderAdminVotesTable);
            searchInput.dataset.listenerAttached = 'true';
        }
    }

    // =========================================================
    // HIER IST DIE REPARATUR FÜR DEINEN CHECKLISTEN-BUTTON
    // =========================================================
    const checklistTrashBtn = document.getElementById('permanently-delete-items-btn');
    // Wir prüfen, ob der Button da ist und ob wir den Listener schon mal angehängt haben
    if (checklistTrashBtn && !checklistTrashBtn.dataset.listenerAttached) {
        checklistTrashBtn.addEventListener('click', () => {
            console.log("Button 'Papierkorb endgültig leeren' geklickt.");
            // Rufe die Funktion auf, die die Liste lädt
            if (typeof renderPermanentDeleteModal === 'function') {
                renderPermanentDeleteModal();
                // Zeige das Modal an
                const modal = document.getElementById('permanentDeleteModal');
                if (modal) {
                    modal.style.display = 'flex';
                } else {
                    console.error("FEHLER: Modal 'permanentDeleteModal' nicht im HTML gefunden!");
                }
            } else {
                console.error("FEHLER: renderPermanentDeleteModal ist nicht importiert!");
            }
        });
        // Markiere den Button, damit wir nicht 2x klicken auslösen
        checklistTrashBtn.dataset.listenerAttached = 'true';
    }
    // =========================================================
    // ENDE DER REPARATUR
    // =========================================================


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



// --- NEUE HELFER FUNKTIONEN FÜR ADMIN ZAHLUNGSVERWALTUNG ---

async function executeAdminZVSearch() {
    const input = document.getElementById('admin-zv-user-search');
    const term = input.value.trim().toLowerCase();
    
    if (!term) return;

    // Suche im USERS Objekt nach einem Match
    let foundUser = null;
    
    // 1. Exakter Match auf User-ID
    if (USERS[term]) foundUser = USERS[term];
    
    // 2. Suche nach Namen (RealName oder Name)
    if (!foundUser) {
        const matches = Object.values(USERS).filter(u => 
            (u.name && u.name.toLowerCase() === term) || 
            (u.realName && u.realName.toLowerCase() === term)
        );
        
        if (matches.length === 1) {
            foundUser = matches[0];
        } else if (matches.length > 1) {
            alertUser(`Mehrere Benutzer gefunden (${matches.length}). Bitte Namen präzisieren.`, "info");
            return;
        }
    }

    if (!foundUser) {
        alertUser("Benutzer nicht gefunden.", "error");
        document.getElementById('admin-zv-result-area').classList.add('hidden');
        return;
    }

    foundAdminUserForPayment = foundUser;
    document.getElementById('admin-zv-found-name').textContent = foundUser.realName || foundUser.name;
    document.getElementById('admin-zv-result-area').classList.remove('hidden');
    
    // Lade die Daten
    await loadMarkedPayments(foundUser.id);
}

async function loadMarkedPayments(userId) {
    const list = document.getElementById('admin-zv-list');
    list.innerHTML = '<p class="text-center text-gray-500">Lade...</p>';
    
    try {
        // VERBESSERUNG: Wir nutzen hier direkt die Variable 'appId' (die wir importiert haben).
        // Wir brauchen keine harte ID ('20LVob...') mehr eintippen.
        
        const q = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'payments'), 
            where('createdBy', '==', userId),
            where('status', '==', 'trash'),
            where('adminReviewStatus', '==', 'pending')
        );

        const snapshot = await getDocs(q);
        markedPaymentsCache = [];
        snapshot.forEach(doc => markedPaymentsCache.push({ id: doc.id, ...doc.data() }));

        renderMarkedPaymentsList();

    } catch (e) {
        console.error(e);
        list.innerHTML = `<p class="text-center text-red-500">Fehler beim Laden: ${e.message}</p>`;
    }
}

function renderMarkedPaymentsList() {
    const list = document.getElementById('admin-zv-list');
    list.innerHTML = '';

    if (markedPaymentsCache.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 italic py-2">Keine markierten Einträge gefunden.</p>';
        updateAdminZVButtons();
        return;
    }

    markedPaymentsCache.forEach(p => {
        const div = document.createElement('div');
        div.className = "flex items-center gap-2 p-2 border-b border-gray-100 hover:bg-gray-50";
        div.innerHTML = `
            <input type="checkbox" class="admin-zv-cb h-4 w-4 rounded text-indigo-600" value="${p.id}">
            <div class="flex-grow min-w-0">
                <p class="font-bold text-sm text-gray-800 truncate">${p.title}</p>
                <p class="text-xs text-gray-500">ID: #${p.id.slice(-4).toUpperCase()} • Betrag: ${parseFloat(p.amount).toFixed(2)}€</p>
            </div>
        `;
        
        div.querySelector('input').addEventListener('change', updateAdminZVButtons);
        list.appendChild(div);
    });
    
    updateAdminZVButtons();
}

function updateAdminZVButtons() {
    const selectedCount = document.querySelectorAll('.admin-zv-cb:checked').length;
    
    const btnUnmark = document.getElementById('btn-admin-zv-unmark');
    const btnRestore = document.getElementById('btn-admin-zv-restore');
    const btnDelete = document.getElementById('btn-admin-zv-delete');
    
    const disabled = selectedCount === 0;
    
    btnUnmark.disabled = disabled;
    btnRestore.disabled = disabled;
    btnDelete.disabled = disabled;
    
    if (disabled) {
        btnUnmark.classList.add('opacity-50', 'cursor-not-allowed');
        btnRestore.classList.add('opacity-50', 'cursor-not-allowed');
        btnDelete.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        btnUnmark.classList.remove('opacity-50', 'cursor-not-allowed');
        btnRestore.classList.remove('opacity-50', 'cursor-not-allowed');
        btnDelete.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

async function executeAdminZVAction(action) {
    const checkboxes = document.querySelectorAll('.admin-zv-cb:checked');
    const ids = Array.from(checkboxes).map(cb => cb.value);
    
    if (ids.length === 0) return;
    
    let confirmMsg = "";
    if (action === 'unmark') confirmMsg = `Markierung von ${ids.length} Elementen entfernen? Sie bleiben im Papierkorb des Users.`;
    if (action === 'restore') confirmMsg = `${ids.length} Elemente ins Archiv wiederherstellen?`;
    if (action === 'delete') confirmMsg = `${ids.length} Elemente ENDGÜLTIG und unwiderruflich löschen?`;
    
    if (!confirm(confirmMsg)) return;
    
    const batch = writeBatch(db);
    // Beachte: Wir brauchen die korrekte Collection Reference. 
    // Ich verwende hier den direkten Pfad, da 'appId' oft scope-Probleme hat, 
    // wenn nicht sauber importiert. Bitte sicherstellen, dass appId korrekt ist.
    // Fallback Hardcoded ID aus deinen Files: 20LVob88b3ovXRUyX3ra
    const paymentsRef = collection(db, 'artifacts', '20LVob88b3ovXRUyX3ra', 'public', 'data', 'payments');

    ids.forEach(id => {
        const ref = doc(paymentsRef, id);
        
        if (action === 'delete') {
            batch.delete(ref);
        } else if (action === 'restore') {
            batch.update(ref, {
                status: 'archived', // Zurück ins Archiv
                adminReviewStatus: deleteField(), // Markierung weg
                history: arrayUnion({ // Log
                    date: new Date(),
                    action: 'admin_restored',
                    user: currentUser.displayName,
                    info: 'Vom Admin aus Papierkorb wiederhergestellt (Archiv).'
                })
            });
        } else if (action === 'unmark') {
            batch.update(ref, {
                adminReviewStatus: deleteField(), // Nur Markierung weg
                adminReviewRequestedAt: deleteField(),
                adminReviewRequestedBy: deleteField()
            });
        }
    });
    
    try {
        // Für deleteField und arrayUnion brauchen wir Imports.
        // Da wir "writeBatch" importiert haben, fehlen die FieldValues evtl.
        // HACK: Da ich keine Imports oben hinzufügen kann ohne den Block zu brechen:
        // Wir müssen sicherstellen, dass deleteField importiert ist.
        // Wenn nicht: Das Skript wird crashen.
        // KORREKTUR: Ich füge die Imports oben in Block 3 hinzu oder nutze rohe Objekte wenn möglich (geht nicht bei Firestore V9).
        // Wir gehen davon aus, dass deleteField oben importiert wird.
        
        await batch.commit();
        alertUser("Aktion erfolgreich ausgeführt.", "success");
        await loadMarkedPayments(foundAdminUserForPayment.id); // Reload Liste
        
    } catch (e) {
        console.error(e);
        // Fallback Import Fehler Hinweis
        if (e.message.includes("deleteField is not defined")) {
            alertUser("Fehler: deleteField Import fehlt in admin_adminfunktionenHome.js!", "error");
        } else {
            alertUser("Fehler: " + e.message, "error");
        }
    }
}

// HINWEIS ZU IMPORTS in admin_adminfunktionenHome.js:
// Füge ganz oben hinzu: 
// import { deleteField, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";





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
    const isAdmin = currentUser.role === 'ADMIN' || (currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN');
    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    let effectiveAdminPerms = {};
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