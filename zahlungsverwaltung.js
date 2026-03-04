// // @ts-check 

import { alertUser, db, currentUser, USERS, setButtonLoading, GUEST_MODE, navigate, appId } from './haupteingang.js';
import { saveUserSetting, getUserSetting } from './log-InOut.js';
import { createPendingNotification } from './pushmail-notifications.js';
import {
collection,
    addDoc,
    getDocs,
    getDoc, // <--- WICHTIG: Fehlte vorher
    doc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    writeBatch,
    serverTimestamp,
    deleteField,
    increment // <--- WICHTIG: Fehlte vorher
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- GLOBALE VARIABLEN ---
let unsubscribePayments = null;
let unsubscribeTemplates = null;
let unsubscribeContacts = null;
let unsubscribeAccounts = null;
let unsubscribeCategories = null; // NEU
let unsubscribeSystemUsers = null;
let allSystemUsers = [];

let allPayments = [];
let allTemplates = [];
let allContacts = [];
let allAccounts = [];
let allCategories = []; // NEU: Benutzerdefinierte Kategorien

let currentDetailPaymentId = null;
let currentShareModalId = null;
let activeSettlementPartnerId = null;
let isSelectionMode = false;
let selectedPaymentIds = new Set();
let pendingOverpaymentData = null;
let showClosedRequests = false;
let showClosedCredits = false;
let currentPositions = [];
let currentSplitOffsets = {};
let currentSplitAdjustments = {};
let activeSearchFilters = [];
let paymentSearchJoinMode = 'and';
let isListView = false; // Wird in initializeZahlungsverwaltungView gesetzt
let isTrashAdvancedMode = false;
let selectedTrashIds = new Set();




// STANDARD KATEGORIEN (Unveränderlich)
const SYSTEM_CATEGORIES = [
    { id: 'cat_refund', name: 'Rückerstattung' },
    { id: 'cat_misc', name: 'Diverse' }
];

// --- INITIALISIERUNG HAUPTANSICHT ---
export function initializeZahlungsverwaltungView() {
    // Einstellung aus Firebase laden (NACH loadUserSettings)
    isListView = getUserSetting('zv_view_mode') === 'list';
    
    const view = document.getElementById('zahlungsverwaltungView');
    
    // Listener Setup (nur einmalig beim ersten Laden)
    if (view && !view.dataset.listenerAttached) {
        setupEventListeners();
        
        // --- NEU: GLOBALE WÄCHTER FÜR ZAHLENFELDER ---
        
        // 1. Verhindere 'e', '+', '-' (Tasten blockieren)
        document.body.addEventListener('keydown', (e) => {
            if (e.target.type === 'number') {
                // Diese Zeichen ergeben bei Währungen keinen Sinn und werden blockiert
                if (['e', 'E', '+', '-'].includes(e.key)) {
                    e.preventDefault();
                }
            }
        });

        // 2. Begrenze auf 2 Kommastellen (beim Tippen/Einfügen)
        document.body.addEventListener('input', (e) => {
            if (e.target.type === 'number') {
                const val = e.target.value;
                if (val.includes('.')) {
                    const parts = val.split('.');
                    // Wenn mehr als 2 Stellen nach dem Punkt -> Abschneiden
                    if (parts[1].length > 2) {
                        e.target.value = parts[0] + '.' + parts[1].slice(0, 2);
                    }
                }
            }
        });
        // ----------------------------------------------

        view.dataset.listenerAttached = 'true';
    }

    const createBtn = document.getElementById('btn-create-new-payment');
    const settingsBtn = document.getElementById('btn-zv-settings');

    const isSysAdmin = currentUser.role === 'SYSTEMADMIN';
    const canCreate = currentUser.mode !== GUEST_MODE && (isSysAdmin || (currentUser.permissions || []).includes('ZAHLUNGSVERWALTUNG_CREATE'));

    if (createBtn) createBtn.style.display = canCreate ? 'flex' : 'none';
    if (settingsBtn) settingsBtn.style.display = canCreate ? 'block' : 'none';

    if (currentUser.mode !== GUEST_MODE) {
        listenForPayments();
        listenForTemplates();
        listenForContacts();
        listenForAccounts();
        listenForCategories();
    } else {
        renderPaymentList([]);
    }
}

// --- INITIALISIERUNG EINSTELLUNGSANSICHT ---
export function initializeZahlungsverwaltungSettingsView() {
    const view = document.getElementById('zahlungsverwaltungSettingsView');
    if (!view) return;

    if (!view.dataset.listenerAttached) {
        setupSettingsListeners();
        view.dataset.listenerAttached = 'true';
    }

    openSettingsTab('templates');
    renderTemplateList();
    renderContactList();
    renderAccountList(); 
    renderCreditOverview();
    
    // NEU: Live-Listener für System-User starten
    listenForSystemUsers();
}


// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {

    // Szenario Umschalter
    document.getElementById('scenario-i-owe')?.addEventListener('click', () => setTransactionScenario('i_owe'));
    document.getElementById('scenario-owes-me')?.addEventListener('click', () => setTransactionScenario('owes_me'));
    document.getElementById('scenario-other')?.addEventListener('click', () => setTransactionScenario('other'));
    document.getElementById('btn-back-to-scenario')?.addEventListener('click', () => {
        document.getElementById('scenario-selector-container').classList.remove('hidden');
        document.getElementById('transaction-details-container').classList.add('hidden');
    });

    // Standard Buttons
    document.getElementById('btn-create-new-payment')?.addEventListener('click', () => openCreateModal());
    document.getElementById('close-create-payment-modal')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-cancel-create-payment')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-save-payment')?.addEventListener('click', savePayment);

    // Toggle Logic
    document.getElementById('btn-toggle-debtor-manual')?.addEventListener('click', () => toggleInputMode('debtor'));
    document.getElementById('btn-toggle-creditor-manual')?.addEventListener('click', () => toggleInputMode('creditor'));
    document.getElementById('toggle-split-mode')?.addEventListener('change', (e) => toggleSplitMode(e.target.checked));
    document.getElementById('payment-creditor-select')?.addEventListener('change', updateCreditorHint);

    // Split Logik
    document.getElementById('btn-add-split-manual')?.addEventListener('click', addSplitManualPartner);
    document.getElementById('split-manual-name-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSplitManualPartner(); } });

    // Direkte Verbindung Amount -> Split
    const amountInput = document.getElementById('payment-amount');
    if (amountInput) {
        amountInput.addEventListener('input', () => {
            if (document.getElementById('split-people-container')) {
                updateSplitPreview();
            }
        });
    }

    // Erweiterte Optionen
    document.getElementById('btn-toggle-advanced-payment')?.addEventListener('click', () => document.getElementById('payment-advanced-options').classList.toggle('hidden'));

    // Dashboard Controls
    document.getElementById('btn-toggle-dashboard-controls')?.addEventListener('click', () => {
        const wrapper = document.getElementById('dashboard-controls-wrapper');
        const icon = document.getElementById('icon-dashboard-toggle');
        if (wrapper.classList.contains('hidden')) {
            wrapper.classList.remove('hidden');
            icon.classList.add('rotate-180');
        } else {
            wrapper.classList.add('hidden');
            icon.classList.remove('rotate-180');
        }
    });

    // Filter & Suche
    const searchInput = document.getElementById('payment-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value;
            if (!val) {
                document.getElementById('search-suggestions-box').classList.add('hidden');
                applyFilters();
            } else {
                updateSearchSuggestions(val);
            }
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addSearchTagFromControls();
            }
        });
        searchInput.addEventListener('focus', (e) => {
            if (e.target.value.trim()) updateSearchSuggestions(e.target.value);
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#payment-search-input') && !e.target.closest('#search-suggestions-box')) {
                document.getElementById('search-suggestions-box')?.classList.add('hidden');
            }
        });
    }

    document.getElementById('btn-payment-add-filter')?.addEventListener('click', addSearchTagFromControls);
    document.getElementById('btn-payment-reset-filters')?.addEventListener('click', resetPaymentFilterControls);
    document.getElementById('payment-search-join-mode')?.addEventListener('change', (e) => {
        paymentSearchJoinMode = e.target.value === 'or' ? 'or' : 'and';
        applyFilters();
    });

    document.getElementById('payment-filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('payment-filter-category')?.addEventListener('change', applyFilters);
    document.getElementById('payment-filter-direction')?.addEventListener('change', applyFilters);

    document.getElementById('btn-close-detail-modal')?.addEventListener('click', closeDetailModal);

    document.getElementById('btn-print-payment')?.addEventListener('click', () => {
        if (currentDetailPaymentId) printPaymentDetail(currentDetailPaymentId);
    });

    const listContainer = document.getElementById('payments-list-container');
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('payment-select-cb')) { e.stopPropagation(); togglePaymentSelection(e.target.value, e.target.checked); return; }
            const card = e.target.closest('.payment-card-item');
            if (card && card.dataset.id) {
                if (isSelectionMode) { const cb = card.querySelector('.payment-select-cb'); if (cb) { cb.checked = !cb.checked; togglePaymentSelection(card.dataset.id, cb.checked); } }
                else { openPaymentDetail(card.dataset.id); }
            }
        });
    }

    // Spezialfunktionen
    document.getElementById('btn-open-settlement')?.addEventListener('click', openSettlementModal);
    document.getElementById('close-settlement-modal')?.addEventListener('click', closeSettlementModal);
    document.getElementById('btn-execute-settlement')?.addEventListener('click', executeSettlement);
    document.getElementById('btn-toggle-selection-mode')?.addEventListener('click', toggleSelectionMode);
    document.getElementById('btn-execute-merge')?.addEventListener('click', executeMerge);

    document.getElementById('btn-cancel-split')?.addEventListener('click', () => document.getElementById('splitEntryModal').style.display = 'none');
    document.getElementById('btn-confirm-split')?.addEventListener('click', executeSplitEntry);

    document.getElementById('close-adjust-modal')?.addEventListener('click', closeAdjustAmountModal);
    document.getElementById('btn-cancel-adjust')?.addEventListener('click', closeAdjustAmountModal);
    document.getElementById('btn-save-adjust')?.addEventListener('click', executeAdjustAmount);

    // Überzahlung Buttons
    document.getElementById('btn-op-credit')?.addEventListener('click', () => resolveOverpayment('credit'));
    document.getElementById('btn-op-tip')?.addEventListener('click', () => resolveOverpayment('tip'));
    
    // --- NEU: INTELLIGENTER ABBRUCH-BUTTON ---
    document.getElementById('btn-op-cancel')?.addEventListener('click', () => { 
        document.getElementById('overpaymentModal').style.display = 'none'; 
        
        // Wenn wir aus dem TBD-Prozess kommen, öffnen wir das Eingabefenster wieder
        if (pendingOverpaymentData && pendingOverpaymentData.isTBDResolution) {
            const tbdModal = document.getElementById('resolveTBDModal');
            if (tbdModal) tbdModal.style.display = 'flex';
        }
        
        pendingOverpaymentData = null; 
    });

    document.getElementById('btn-zv-settings')?.addEventListener('click', () => navigate('zahlungsverwaltungSettings'));
    document.getElementById('payment-template-select')?.addEventListener('change', applySelectedTemplate);
    document.getElementById('btn-save-as-template')?.addEventListener('click', saveCurrentAsTemplate);

    document.getElementById('btn-dashboard-credits')?.addEventListener('click', () => {
        navigate('zahlungsverwaltungSettings');
        setTimeout(() => openSettingsTab('credits'), 50);
    });

    document.getElementById('close-credit-details-btn')?.addEventListener('click', () => document.getElementById('creditDetailsModal').style.display = 'none');
    document.getElementById('btn-close-credit-details')?.addEventListener('click', () => document.getElementById('creditDetailsModal').style.display = 'none');

    document.getElementById('btn-action-requests')?.addEventListener('click', () => {
        navigate('zahlungsverwaltungSettings');
        setTimeout(() => openSettingsTab('requests'), 50);
    });

    document.getElementById('btn-action-trans-approvals')?.addEventListener('click', openPendingTransactionsModal);

    // TBD Logik
    document.getElementById('payment-amount-tbd')?.addEventListener('change', (e) => {
        const amountInput = document.getElementById('payment-amount');
        const splitToggle = document.getElementById('toggle-split-mode');
        const isChecked = e.target.checked;

        if (isChecked) {
            amountInput.type = 'text';
            amountInput.value = 'Betrag unbekannt';
            amountInput.disabled = true;
            amountInput.classList.add('bg-orange-50', 'text-orange-600', 'font-bold', 'italic', 'text-center');
            amountInput.classList.remove('text-right');
            if (splitToggle) {
                splitToggle.checked = false;
                splitToggle.disabled = true;
                splitToggle.dispatchEvent(new Event('change'));
            }
        } else {
            amountInput.type = 'number';
            amountInput.value = '';
            amountInput.disabled = false;
            amountInput.classList.remove('bg-orange-50', 'text-orange-600', 'font-bold', 'italic', 'text-center');
            amountInput.classList.add('text-right');
            amountInput.focus();
            if (splitToggle) splitToggle.disabled = false;
        }
    });

    const mainAmountInput = document.getElementById('payment-amount');
    if (mainAmountInput) {
        mainAmountInput.addEventListener('input', () => {
            const splitMode = document.getElementById('toggle-split-mode').checked;
            const saveBtn = document.getElementById('btn-save-payment');
            if (!splitMode && saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                saveBtn.title = "";
            }
        });
    }

    // Ansicht umschalten
    document.getElementById('btn-toggle-view-mode')?.addEventListener('click', () => {
        isListView = !isListView;
        saveUserSetting('zv_view_mode', isListView ? 'list' : 'card');
        const btn = document.getElementById('btn-toggle-view-mode');
        if (btn) btn.textContent = isListView ? "📱" : "📋";
        applyFilters();
    });
}






function setupSettingsListeners() {
    document.getElementById('tab-zv-templates')?.addEventListener('click', () => openSettingsTab('templates'));
    document.getElementById('tab-zv-requests')?.addEventListener('click', () => openSettingsTab('requests'));
    document.getElementById('tab-zv-contacts')?.addEventListener('click', () => openSettingsTab('contacts'));
    document.getElementById('tab-zv-credits')?.addEventListener('click', () => openSettingsTab('credits'));
    document.getElementById('tab-zv-accounts')?.addEventListener('click', () => openSettingsTab('accounts'));
    document.getElementById('tab-zv-categories')?.addEventListener('click', () => openSettingsTab('categories'));
    document.getElementById('tab-zv-archive')?.addEventListener('click', () => openSettingsTab('archive'));

    // Listener für Vorlagen-Liste (Löschen UND Umbenennen)
    document.getElementById('zv-templates-list')?.addEventListener('click', (e) => {
        if (e.target.closest('.delete-tpl-btn')) deleteTemplate(e.target.closest('.delete-tpl-btn').dataset.id);
        if (e.target.closest('.edit-tpl-btn')) renameTemplate(e.target.closest('.edit-tpl-btn').dataset.id); // NEU
    });

    document.getElementById('btn-add-contact-setting')?.addEventListener('click', addContactFromSettings);
    document.getElementById('btn-add-account-setting')?.addEventListener('click', addAccountFromSettings);
    document.getElementById('btn-add-category-setting')?.addEventListener('click', addCategoryFromSettings);

    // Listen Aktionen (Kontakte, Accounts, Kategorien) - wie gehabt
    const contactList = document.getElementById('zv-contacts-list');
    if (contactList) {
        contactList.onclick = (e) => {
            const btnDelete = e.target.closest('.delete-contact-btn');
            const btnEdit = e.target.closest('.edit-contact-btn');
            const btnShare = e.target.closest('.share-contact-btn');
            const btnMigrate = e.target.closest('.migrate-contact-btn');
            if (btnDelete) deleteContact(btnDelete.dataset.id);
            if (btnEdit) renameContact(btnEdit.dataset.id);
            if (btnShare) shareContactLink(btnShare.dataset.id);
            if (btnMigrate) openMigrationModal(btnMigrate.dataset.id);
        };
    }

    const accountList = document.getElementById('zv-accounts-list');
    if (accountList) {
        accountList.onclick = (e) => {
            if (e.target.closest('.delete-acc-btn')) deleteAccount(e.target.closest('.delete-acc-btn').dataset.id);
        }
    }

    const categoryList = document.getElementById('zv-categories-list');
    if (categoryList) {
        categoryList.onclick = (e) => {
            if (e.target.closest('.delete-cat-btn')) deleteCategory(e.target.closest('.delete-cat-btn').dataset.id);
        }
    }

    document.getElementById('btn-execute-migration')?.addEventListener('click', executeMigration);
    document.getElementById('btn-add-my-credit')?.addEventListener('click', () => openCreditModal('add', 'my'));
    document.getElementById('btn-add-other-credit')?.addEventListener('click', () => openCreditModal('add', 'other'));

    document.getElementById('btn-cancel-credit')?.addEventListener('click', () => {
        const modal = document.getElementById('creditManageModal');
        modal.classList.add('hidden');
        modal.style.display = 'none';
    });
    document.getElementById('btn-save-credit')?.addEventListener('click', executeCreditAction);
}



function listenForPayments() {
    if (unsubscribePayments) unsubscribePayments();
    const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

    // Laden wo ich beteiligt bin
    const q = query(paymentsRef, where('involvedUserIds', 'array-contains', currentUser.mode));

    unsubscribePayments = onSnapshot(q, (snapshot) => {
        allPayments = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const p = { id: doc.id, ...data };

            if (p.createdBy === currentUser.mode) {
                allPayments.push(p);
                return;
            }

            const myAccess = p.accessRights ? p.accessRights[currentUser.mode] : null;
            if (myAccess) {
                p.myStatus = myAccess.status;
                p.myRights = myAccess.rights;
                allPayments.push(p);
            }
        });

        updateCategoryDashboard();
        fillFilterDropdowns();
        applyFilters();

        // Dashboard Alerts & Buttons aktualisieren
        updateInvitationDashboard();
        updateActionDashboard();
        updateHomeAlerts();

        // Falls Settings offen sind -> Liste aktualisieren
        const requestsTab = document.getElementById('content-zv-requests');
        if (requestsTab && !requestsTab.classList.contains('hidden')) {
            renderRequestOverview();
        }

        // Detail-Ansicht refreshen
        if (currentDetailPaymentId) {
            const updatedP = allPayments.find(x => x.id === currentDetailPaymentId);
            if (updatedP) openPaymentDetail(currentDetailPaymentId, true); else closeDetailModal();
        }

        // Share-Modal refreshen
        const shareModal = document.getElementById('sharePaymentModal');
        if (currentShareModalId && shareModal && shareModal.style.display !== 'none') {
            const pStillExists = allPayments.find(x => x.id === currentShareModalId);
            if (pStillExists) {
                openShareModal(currentShareModalId);
            } else {
                shareModal.style.display = 'none';
                currentShareModalId = null;
            }
        }

        // --- NEU: LIVE UPDATE FÜR ZUKUNFTS-MODAL ---
        const futureModal = document.getElementById('futurePaymentsModal');
        if (futureModal && futureModal.style.display !== 'none' && !futureModal.classList.contains('hidden')) {
            renderFuturePaymentsList();
        }

        if (document.getElementById('zahlungsverwaltungSettingsView').classList.contains('active')) {
            renderCreditOverview();
        }
    }, error => console.error("Fehler Payments:", error));
}




function listenForTemplates() {
    if (unsubscribeTemplates) unsubscribeTemplates();
    const tplRef = collection(db, 'artifacts', appId, 'public', 'data', 'payment-templates');
    
    // --- FIX: Nur EIGENE Vorlagen laden ---
    const q = query(tplRef, where('createdBy', '==', currentUser.mode));
    // --------------------------------------

    unsubscribeTemplates = onSnapshot(q, (snapshot) => {
        allTemplates = [];
        snapshot.forEach(doc => allTemplates.push({ id: doc.id, ...doc.data() }));
        updateTemplateDropdown();
        if (document.getElementById('zahlungsverwaltungSettingsView').classList.contains('active')) renderTemplateList();
    });
}


// NEU: Kontakte laden
function listenForContacts() {
    if (unsubscribeContacts) unsubscribeContacts();
    const contactRef = collection(db, 'artifacts', appId, 'public', 'data', 'private-contacts');
    // Lade nur Kontakte, die von MIR erstellt wurden
    const q = query(contactRef, where('createdBy', '==', currentUser.mode));

    unsubscribeContacts = onSnapshot(q, (snapshot) => {
        allContacts = [];
        snapshot.forEach(doc => allContacts.push({ id: doc.id, ...doc.data() }));

        // Überall aktualisieren, wo Dropdowns sind
        if (document.getElementById('zahlungsverwaltungSettingsView').classList.contains('active')) renderContactList();
    });
}




// NEU: Listener für System-User (Live-Updates für Links/Views)
function listenForSystemUsers() {
    if (unsubscribeSystemUsers) unsubscribeSystemUsers();
    
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'user-config');
    // Wir laden alle User, um sie live anzuzeigen
    // (Optimierung: Könnte man auf isActive filtern, aber wir filtern im Render)
    
    unsubscribeSystemUsers = onSnapshot(usersRef, (snapshot) => {
        allSystemUsers = [];
        snapshot.forEach(doc => {
            const data = doc.data() || {};
            const { key, ...safeData } = data;
            allSystemUsers.push({ id: doc.id, ...safeData });
        });

        // Wenn der Settings-View aktiv ist und der Tab "Adressbuch" offen ist (oder generell), updaten
        if (document.getElementById('zahlungsverwaltungSettingsView').classList.contains('active')) {
            renderContactList();
        }
    });
}


// NEU: Konten Listener (mit virtuellem Bargeld-Konto)
function listenForAccounts() {
    if (unsubscribeAccounts) unsubscribeAccounts();
    const accRef = collection(db, 'artifacts', appId, 'public', 'data', 'private-accounts');
    const q = query(accRef, where('createdBy', '==', currentUser.mode));

    unsubscribeAccounts = onSnapshot(q, (snapshot) => {
        allAccounts = [];

        // 1. Das unlöschbare System-Konto "Bargeld" immer an erster Stelle einfügen
        allAccounts.push({
            id: 'sys_cash',
            name: 'Bargeld',
            details: 'Geldbörse',
            isSystem: true // Markierung, damit wir den Löschen-Button ausblenden können
        });

        // 2. Die echten Datenbank-Konten hinzufügen
        snapshot.forEach(doc => allAccounts.push({ id: doc.id, ...doc.data() }));

        // 3. UI Updates
        if (document.getElementById('zahlungsverwaltungSettingsView').classList.contains('active')) renderAccountList();
    });
}



// NEU: Kategorien Listener
function listenForCategories() {
    if (unsubscribeCategories) unsubscribeCategories();
    const catRef = collection(db, 'artifacts', appId, 'public', 'data', 'payment-categories');
    // Wir laden Kategorien, die von MIR erstellt wurden
    const q = query(catRef, where('createdBy', '==', currentUser.mode));

    unsubscribeCategories = onSnapshot(q, (snapshot) => {
        allCategories = [];
        snapshot.forEach(doc => allCategories.push({ id: doc.id, ...doc.data() }));

        // UI Updates überall anstoßen
        const catSelect = document.getElementById('payment-category-select');
        if (catSelect) fillCategoryDropdown(catSelect);

        fillFilterDropdowns(); // Filter aktualisieren
        updateCategoryDashboard(); // Dashboard aktualisieren

        if (document.getElementById('zahlungsverwaltungSettingsView').classList.contains('active')) {
            renderCategoryList();
        }
    });
}


// --- SELECTION & MERGE LOGIK (Zusammenfassen) ---

function toggleSelectionMode() {
    isSelectionMode = !isSelectionMode;
    const btn = document.getElementById('btn-toggle-selection-mode');
    const bar = document.getElementById('merge-action-bar');

    if (isSelectionMode) {
        btn.classList.add('bg-indigo-600', 'text-white');
        btn.classList.remove('bg-gray-100', 'text-gray-600');
        bar.classList.remove('hidden');
        bar.style.display = 'flex';
    } else {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-gray-100', 'text-gray-600');
        bar.classList.add('hidden');
        bar.style.display = 'none';
        selectedPaymentIds.clear();
        updateMergeCount();
    }
    // Liste neu rendern, um Checkboxen anzuzeigen/verstecken
    applyFilters();
}

function togglePaymentSelection(id, isChecked) {
    if (isChecked) selectedPaymentIds.add(id);
    else selectedPaymentIds.delete(id);
    updateMergeCount();
}

function updateMergeCount() {
    document.getElementById('merge-count').textContent = selectedPaymentIds.size;
}

async function executeMerge() {
    if (selectedPaymentIds.size < 2) {
        alertUser("Bitte mindestens 2 Einträge auswählen.", "info");
        return;
    }

    const ids = Array.from(selectedPaymentIds);
    const first = allPayments.find(p => p.id === ids[0]);

    let totalAmount = 0;
    let titleList = [];
    const mergedLinks = [];

    // NEU: Arrays zum Sammeln aller Datumswerte
    const allStartDates = [];
    const allDeadlines = [];

    for (const id of ids) {
        const p = allPayments.find(item => item.id === id);
        if (!p) continue;

        // SICHERHEITS-CHECKS
        if (p.createdBy !== currentUser.mode) {
            alertUser("Fehler: Du kannst nur Einträge zusammenfassen, die du selbst erstellt hast.", "error");
            return;
        }
        if (p.debtorId !== first.debtorId || p.creditorId !== first.creditorId) {
            alertUser("Fehler: Man kann nur Einträge derselben Person und Richtung zusammenfassen.", "error");
            return;
        }
        if (p.status !== 'open') {
            alertUser("Fehler: Nur offene Einträge können zusammengefasst werden.", "error");
            return;
        }
        if (p.isTBD) {
            alertUser("Fehler: Einträge mit unbekanntem Betrag (TBD) können nicht zusammengefasst werden.", "error");
            return;
        }

        totalAmount += parseFloat(p.remainingAmount);
        titleList.push(p.title);

        const short = p.id.slice(-4).toUpperCase();
        mergedLinks.push(`[LINK:${p.id}:#${short}]`);

        // --- ROBUSTE DATUMS-SAMMLUNG ---
        
        // 1. Startdatum
        if (p.startDate) {
            allStartDates.push(p.startDate);
        } else if (p.createdAt) {
            // Fallback: Erstellungsdatum zu YYYY-MM-DD konvertieren
            const d = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            allStartDates.push(`${year}-${month}-${day}`);
        }

        // 2. Deadline
        if (p.deadline) {
            allDeadlines.push(p.deadline);
        }
    }

    // --- SORTIERUNG (Das erste ist das früheste) ---
    allStartDates.sort(); // String-Sortierung '2023-01-01' < '2023-02-01' funktioniert perfekt bei ISO
    allDeadlines.sort();

    // Ergebnisse setzen
    let finalStartDate = allStartDates.length > 0 ? allStartDates[0] : new Date().toISOString().split('T')[0];
    let finalDeadline = allDeadlines.length > 0 ? allDeadlines[0] : null;

    if (!confirm(`Möchtest du diese ${ids.length} Einträge zu einem neuen Eintrag über ${totalAmount.toFixed(2)}€ zusammenfassen?`)) return;

    const btn = document.getElementById('btn-execute-merge');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        // 1. Neue Referenz
        const newDocRef = doc(paymentsRef);
        const newShort = newDocRef.id.slice(-4).toUpperCase();
        const linkToNew = `[LINK:${newDocRef.id}:#${newShort}]`;

        // 2. Alte Einträge schließen
        ids.forEach(id => {
            const ref = doc(paymentsRef, id);
            const p = allPayments.find(item => item.id === id);
            const currentRest = parseFloat(p.remainingAmount).toFixed(2);

            const history = p.history || [];
            batch.update(ref, {
                status: 'closed',
                remainingAmount: 0,
                history: [...history, {
                    date: new Date(),
                    action: 'merged',
                    user: currentUser.displayName,
                    info: `In Sammelrechnung ${linkToNew} (${currentRest} €) zusammengefasst.`
                }]
            });
        });

        // 3. Neuen Sammel-Eintrag erstellen
        const newTitle = `Sammelrechnung (${ids.length} Posten)`;
        const newNotes = "Zusammenfassung von:\n- " + titleList.join("\n- ");
        const logInfo = `Zusammenfassung aus ${ids.length} Einträgen erstellt: ${mergedLinks.join(', ')}`;

        const newData = {
            title: newTitle,
            amount: totalAmount,
            remainingAmount: totalAmount,
            isTBD: false,
            // Hier nutzen wir die sortierten Daten
            startDate: finalStartDate,
            deadline: finalDeadline, 
            invoiceNr: "",
            orderNr: "",
            notes: newNotes,
            type: 'debt',
            status: 'open',
            categoryId: 'cat_misc',
            createdAt: serverTimestamp(),
            createdBy: currentUser.mode,
            debtorId: first.debtorId, debtorName: first.debtorName,
            creditorId: first.creditorId, creditorName: first.creditorName,
            involvedUserIds: first.involvedUserIds,
            history: [{
                date: new Date(),
                action: 'created_merge',
                user: currentUser.displayName,
                info: logInfo
            }]
        };

        batch.set(newDocRef, newData);

        await batch.commit();
        alertUser("Einträge erfolgreich zusammengefasst!", "success");
        toggleSelectionMode(); 

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    } finally {
        setButtonLoading(btn, false);
    }
}






// --- SPLIT EXISTING ENTRY LOGIK (Aufsplitten) ---

window.openSplitModal = function (id) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    if (p.isTBD) {
        alertUser("TBD-Einträge können nicht gesplittet werden.", "error");
        return;
    }

    const modal = document.getElementById('splitEntryModal');
    
    // --- FIX: Modal nach vorne holen ---
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    // -----------------------------------

    modal.dataset.originId = id;

    document.getElementById('split-original-amount-display').textContent = parseFloat(p.remainingAmount).toFixed(2) + " €";
    document.getElementById('split-amount-input').value = '';
    document.getElementById('split-title-input').value = p.title + " (Teil 2)";

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};



async function executeSplitEntry() {
    const modal = document.getElementById('splitEntryModal');
    const originId = modal.dataset.originId;
    const p = allPayments.find(x => x.id === originId);
    if (!p) return;

    const splitAmount = parseFloat(document.getElementById('split-amount-input').value);
    const splitTitle = document.getElementById('split-title-input').value.trim();
    const currentRest = parseFloat(p.remainingAmount);

    if (isNaN(splitAmount) || splitAmount <= 0 || splitAmount >= currentRest) {
        alertUser("Bitte einen gültigen Betrag eingeben (kleiner als der aktuelle Rest).", "error");
        return;
    }
    if (!splitTitle) {
        alertUser("Bitte einen Titel für den neuen Eintrag eingeben.", "error");
        return;
    }

    const btn = document.getElementById('btn-confirm-split');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
        const newRest = currentRest - splitAmount;

        const newDocRef = doc(paymentsRef);
        const newShort = newDocRef.id.slice(-4).toUpperCase();
        const originShort = originId.slice(-4).toUpperCase();

        const linkToNew = `[LINK:${newDocRef.id}:#${newShort}]`;
        const linkToOrigin = `[LINK:${originId}:#${originShort}]`;

        // Ursprung aktualisieren
        const originRef = doc(paymentsRef, originId);
        batch.update(originRef, {
            remainingAmount: newRest,
            history: [...(p.history || []), {
                date: new Date(),
                action: 'split_source',
                user: currentUser.displayName,
                info: `Betrag von ${splitAmount.toFixed(2)}€ abgespalten auf Eintrag ${linkToNew} ("${splitTitle}").`
            }]
        });

        // Neuen Eintrag erstellen
        const newData = {
            ...p,
            id: undefined,
            title: splitTitle,
            amount: splitAmount,
            remainingAmount: splitAmount,
            createdAt: serverTimestamp(),
            history: [{
                date: new Date(),
                action: 'split_target',
                user: currentUser.displayName,
                // NEU: Betrag hier auch eingefügt für Klarheit
                info: `Abgespalten (${splitAmount.toFixed(2)} €) von Eintrag ${linkToOrigin} ("${p.title}").`
            }]
        };
        delete newData.id;

        batch.set(newDocRef, newData);

        await batch.commit();
        alertUser("Eintrag erfolgreich aufgesplittet!", "success");
        modal.classList.add('hidden');
        modal.style.display = 'none';
        closeDetailModal();

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    } finally {
        setButtonLoading(btn, false);
    }
}



// --- HELPER FÜR ADJUST MODAL (Positionen) ---

// --- HELPER FÜR ADJUST MODAL (Positionen) ---

function addAdjustPositionInput(name = '', price = '') {
    const container = document.getElementById('adjust-positions-container');
    if (!container) return;

    container.classList.remove('hidden');

    const div = document.createElement('div');
    div.className = "flex gap-2 items-center adj-position-row animate-fade-in";

    div.innerHTML = `
        <input type="text" class="adj-pos-name flex-grow p-1.5 border border-gray-300 rounded text-sm" placeholder="Beschreibung" value="${name}">
        <div class="relative w-24">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">€</span>
            <input type="number" class="adj-pos-price w-full pl-5 p-1.5 border border-gray-300 rounded text-sm text-right font-mono" placeholder="0.00" step="0.01" value="${price}">
        </div>
        <button class="text-red-400 hover:text-red-600 p-1 remove-adj-pos-btn">&times;</button>
    `;

    const nameInput = div.querySelector('.adj-pos-name');
    const priceInput = div.querySelector('.adj-pos-price');

    // --- NEU: ENTER-LOGIK ---
    
    // 1. Enter im Namen -> Springe zum Preis
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            priceInput.focus();
        }
    });

    // 2. Enter im Preis -> Neue Zeile erstellen
    priceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addAdjustPositionInput(); // Neue Zeile
        }
    });

    // Listener für Summen-Update
    priceInput.addEventListener('input', calculateAdjustTotal);

    // Listener Löschen
    div.querySelector('.remove-adj-pos-btn').onclick = () => {
        div.remove();
        calculateAdjustTotal();
        if (container.children.length === 0) container.classList.add('hidden');
    };

    container.appendChild(div);
    
    // Fokus nur wenn es ein neuer leerer Eintrag ist (damit beim Laden existierender Daten nicht wild gesprungen wird)
    if (name === '') nameInput.focus();
}


function calculateAdjustTotal() {
    const inputs = document.querySelectorAll('.adj-pos-price');
    let total = 0;
    let hasValue = false;

    inputs.forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
            total += val;
            hasValue = true;
        }
    });

    const mainAmount = document.getElementById('adjust-new-amount');
    // Nur überschreiben, wenn Positionen da sind
    if (hasValue) {
        mainAmount.value = total.toFixed(2);
        mainAmount.disabled = true;
        mainAmount.classList.add('bg-gray-100');

        // Event feuern damit die Differenz-Anzeige aktualisiert wird
        mainAmount.dispatchEvent(new Event('input'));
    } else if (inputs.length === 0) {
        mainAmount.disabled = false;
        mainAmount.classList.remove('bg-gray-100');
    }
}



// --- ADJUST AMOUNT LOGIK (Betrag anpassen) ---
// Globale Variable für aktuelle Bearbeitungs-ID
let currentAdjustId = null;

window.openAdjustAmountModal = function (id) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    currentAdjustId = id;
    const modal = document.getElementById('adjustAmountModal');
    
    // --- FIX: Modal nach vorne holen (in den Body verschieben) ---
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    // ------------------------------------------------------------

    const inputField = document.getElementById('adjust-new-amount');
    const inputLabel = document.getElementById('adjust-input-label');
    const posContainer = document.getElementById('adjust-positions-container');

    // --- 1. HISTORIE AUFBAUEN ---
    const historyList = document.getElementById('adjust-history-list');
    const historyContainer = document.getElementById('adjust-history-trace');
    historyList.innerHTML = '';

    const historyPoints = [];
    historyPoints.push({ val: parseFloat(p.amount), date: "Aktuell" });
    if (p.originalAmount !== undefined && Math.abs(p.originalAmount - p.amount) > 0.01) {
        historyPoints.unshift({ val: parseFloat(p.originalAmount), date: "Ursprünglich" });
    }

    if (historyPoints.length > 1) {
        historyContainer.classList.remove('hidden');
        historyPoints.forEach(pt => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="font-semibold">${pt.date}:</span> ${pt.val.toFixed(2)} €`;
            historyList.appendChild(li);
        });
    } else {
        historyContainer.classList.add('hidden');
    }

    // --- 2. UI RESET & POSITIONS ---
    inputField.disabled = false;
    inputField.classList.remove('bg-gray-100');
    if (posContainer) {
        posContainer.innerHTML = '';
        posContainer.classList.add('hidden');
    }

    const addBtn = document.getElementById('btn-add-adjust-position');
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener('click', () => addAdjustPositionInput());

    if (p.positions && p.positions.length > 0) {
        p.positions.forEach(pos => {
            addAdjustPositionInput(pos.name, pos.price);
        });
        calculateAdjustTotal();
    }

    // --- 3. METADATEN FÜLLEN (NEU) ---
    document.getElementById('adjust-title').value = p.title || '';
    document.getElementById('adjust-invoice-nr').value = p.invoiceNr || '';
    document.getElementById('adjust-order-nr').value = p.orderNr || '';
    document.getElementById('adjust-note').value = p.notes || '';
    document.getElementById('adjust-start-date').value = p.startDate || '';
    document.getElementById('adjust-deadline').value = p.deadline || '';
    document.getElementById('adjust-type').value = p.type || 'debt';

    // Kategorien Dropdown füllen
    const catSelect = document.getElementById('adjust-category');
    fillCategoryDropdown(catSelect);
    if (p.categoryId) catSelect.value = p.categoryId;

    document.getElementById('adjust-reason').value = 'correction';

    // --- 4. MODUS LOGIK ---
    const radioTotal = document.querySelector('input[name="adjust-mode"][value="total"]');
    const radioRemaining = document.querySelector('input[name="adjust-mode"][value="remaining"]');
    radioTotal.checked = true;

    const updateInputMode = () => {
        if (radioTotal.checked) {
            inputLabel.textContent = "Neuer Gesamtbetrag (€)";
            inputField.value = parseFloat(p.amount).toFixed(2);
        } else {
            inputLabel.textContent = "Neuer offener Betrag (Rest) (€)";
            inputField.value = parseFloat(p.remainingAmount).toFixed(2);
        }
        inputField.dispatchEvent(new Event('input'));
    };

    radioTotal.addEventListener('change', updateInputMode);
    radioRemaining.addEventListener('change', updateInputMode);
    updateInputMode();

    // --- 5. DIFFERENZ ANZEIGE ---
    let diffDisplay = document.getElementById('adjust-diff-display');
    if (!diffDisplay) {
        diffDisplay = document.createElement('div');
        diffDisplay.id = 'adjust-diff-display';
        diffDisplay.className = "text-right text-sm font-bold mt-1 h-5";
        inputField.parentNode.appendChild(diffDisplay);
    }
    diffDisplay.textContent = "";

    inputField.oninput = function () {
        const newVal = parseFloat(inputField.value);
        if (isNaN(newVal)) { diffDisplay.textContent = ""; return; }

        let compareValue = radioTotal.checked ? parseFloat(p.amount) : parseFloat(p.remainingAmount);
        const diff = newVal - compareValue;

        // BUGFIX: Toleranz auf 0.001 verringert, damit auch 1 Cent (0.01) als Änderung erkannt wird
        if (Math.abs(diff) < 0.001) {
            diffDisplay.textContent = "Keine Änderung";
            diffDisplay.className = "text-right text-sm font-bold mt-1 text-gray-400";
        } else if (diff > 0) {
            diffDisplay.textContent = `+ ${diff.toFixed(2)} €`;
            diffDisplay.className = "text-right text-sm font-bold mt-1 text-red-600";
        } else {
            diffDisplay.textContent = `${diff.toFixed(2)} €`;
            diffDisplay.className = "text-right text-sm font-bold mt-1 text-emerald-600";
        }
    };

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};






function closeAdjustAmountModal() {
    document.getElementById('adjustAmountModal').classList.add('hidden');
    document.getElementById('adjustAmountModal').style.display = 'none';
    currentAdjustId = null;
}

async function executeAdjustAmount() {
    if (!currentAdjustId) return;
    const p = allPayments.find(x => x.id === currentAdjustId);
    if (!p) return;

    const newTotalAmount = parseFloat(document.getElementById('adjust-new-amount').value);
    const reason = document.getElementById('adjust-reason').value;
    
    const newTitle = document.getElementById('adjust-title').value.trim();
    const newCat = document.getElementById('adjust-category').value;
    const newType = document.getElementById('adjust-type').value;
    const newStart = document.getElementById('adjust-start-date').value;
    const newDeadline = document.getElementById('adjust-deadline').value || null; // Null wenn leer
    const newInv = document.getElementById('adjust-invoice-nr').value.trim();
    const newOrd = document.getElementById('adjust-order-nr').value.trim();
    const newNoteInput = document.getElementById('adjust-note').value.trim();
    
    const mode = document.querySelector('input[name="adjust-mode"]:checked').value;

    // DATUMS-VALIDIERUNG
    if (newStart && newDeadline) {
        if (newDeadline < newStart) {
            alertUser("Fehler: Die Frist darf nicht vor dem Startdatum liegen.", "error");
            return;
        }
    }

    if (isNaN(newTotalAmount) || newTotalAmount < 0) {
        alertUser("Bitte gültigen positiven Betrag (oder 0) eingeben.", "error");
        return;
    }

    const currentTotal = parseFloat(p.amount) || 0;
    const currentRemaining = parseFloat(p.remainingAmount) || 0;
    const paidSoFar = currentTotal - currentRemaining;

    let finalTotalAmount = 0;
    let finalRemaining = 0;

    // Berechnung für Closed/Settled Fälle oder Offene
    if (p.status === 'closed' || p.status === 'settled' || p.status === 'paid') {
        if (mode === 'total') {
            const delta = newTotalAmount - currentTotal;
            finalTotalAmount = newTotalAmount;
            finalRemaining = delta; 
        } else {
            finalRemaining = newTotalAmount;
            finalTotalAmount = currentTotal + finalRemaining;
        }
    } else {
        if (mode === 'total') {
            finalTotalAmount = newTotalAmount;
            finalRemaining = finalTotalAmount - paidSoFar;
        } else {
            finalRemaining = newTotalAmount;
            finalTotalAmount = paidSoFar + finalRemaining;
        }
    }

    const newPositions = [];
    document.querySelectorAll('.adj-position-row').forEach(row => {
        const name = row.querySelector('.adj-pos-name').value.trim();
        const price = parseFloat(row.querySelector('.adj-pos-price').value);
        if (name && !isNaN(price)) newPositions.push({ name, price });
    });

    // --- DETAILLIERTE ÄNDERUNGSPROTOKOLLE ---
    let changes = [];

    // Helper für Text-Vergleiche
    const checkChange = (label, oldVal, newVal) => {
        const o = oldVal || "";
        const n = newVal || "";
        if (o !== n) {
            const displayOld = o === "" ? "Leer" : `"${o}"`;
            const displayNew = n === "" ? "Leer" : `"${n}"`;
            changes.push(`${label}: ${displayOld} -> ${displayNew}`);
        }
    };

    // 1. Betrag
    if (Math.abs(finalTotalAmount - currentTotal) > 0.001) {
        changes.push(`Betrag: ${currentTotal.toFixed(2)}€ -> ${finalTotalAmount.toFixed(2)}€`);
    }

    // 2. Texte & Daten
    checkChange("Titel", p.title, newTitle);
    checkChange("Rechnung", p.invoiceNr, newInv);
    checkChange("Bestellung", p.orderNr, newOrd);
    
    // 3. Datum
    const oldStart = p.startDate || "";
    if (oldStart !== newStart) {
        changes.push(`Start: ${oldStart || 'Leer'} -> ${newStart || 'Leer'}`);
    }
    
    const oldDead = p.deadline || "";
    const cleanNewDead = newDeadline || "";
    if (oldDead !== cleanNewDead) {
        changes.push(`Frist: ${oldDead || 'Leer'} -> ${cleanNewDead || 'Leer'}`);
    }

    // 4. Listen-Werte
    if (p.categoryId !== newCat) {
        const oldCatName = [...SYSTEM_CATEGORIES, ...allCategories].find(c => c.id === p.categoryId)?.name || p.categoryId;
        const newCatName = [...SYSTEM_CATEGORIES, ...allCategories].find(c => c.id === newCat)?.name || newCat;
        changes.push(`Kat: ${oldCatName} -> ${newCatName}`);
    }
    
    if (p.type !== newType) {
        const typeNames = { 'debt': 'Schuld', 'transfer': 'Umbuchung', 'credit': 'Guthaben' };
        changes.push(`Typ: ${typeNames[p.type] || p.type} -> ${typeNames[newType] || newType}`);
    }

    // 5. Positionen
    if (JSON.stringify(newPositions) !== JSON.stringify(p.positions || [])) {
        const oldCount = p.positions ? p.positions.length : 0;
        const newCount = newPositions.length;
        changes.push(`Positionen: ${oldCount} Stk -> ${newCount} Stk`);
    }

    // 6. Status-Änderung (Implizit) - BUGFIX HIER
    const isClosed = (p.status === 'closed' || p.status === 'settled' || p.status === 'paid');
    const willBeOpen = finalRemaining > 0.001;
    if (isClosed && willBeOpen) {
        // Hier wurde der Text erweitert, um die Werte anzuzeigen
        changes.push(`Status: Wiedereröffnet (Offen: 0.00€ -> ${finalRemaining.toFixed(2)}€)`);
    }

    // Abbruch wenn nichts geändert
    if (changes.length === 0 && !newNoteInput) {
        alertUser("Keine Änderung festgestellt.", "info");
        return;
    }

    const btn = document.getElementById('btn-save-adjust');
    setButtonLoading(btn, true);

    const updateBase = {
        title: newTitle, categoryId: newCat, type: newType, startDate: newStart, deadline: newDeadline, invoiceNr: newInv, orderNr: newOrd
    };

    const reasonTexts = { 'correction': 'Korrektur', 'storno': 'Storno', 'interest': 'Zinsen/Gebühr', 'discount': 'Erlass/Rabatt', 'other': 'Anpassung', 'update': 'Update' };
    const reasonText = reasonTexts[reason] || 'Anpassung';
    
    // Log zusammenbauen
    let logInfo = `${reasonText}: ${changes.join(' | ')}`;
    if (newNoteInput) logInfo += ` (Notiz: ${newNoteInput})`;

    let originalAmountToSave = p.originalAmount ?? p.amount;
    let originalPositionsToSave = p.originalPositions ?? (p.positions || []);

    // --- FALL A: ÜBERZAHLUNG (Negativer Restbetrag) ---
    if (finalRemaining < -0.01) {
        const excessAmount = Math.abs(finalRemaining);
        
        pendingOverpaymentData = {
            paymentId: currentAdjustId,
            payAmount: paidSoFar,       
            debtAmount: finalTotalAmount,
            excessAmount: excessAmount,
            extras: {
                isAdjustment: true,
                updatePayload: {
                    ...updateBase,
                    amount: finalTotalAmount,
                    originalAmount: originalAmountToSave,
                    originalPositions: originalPositionsToSave,
                    positions: newPositions,
                    adjustReason: reason,
                    adjustNote: logInfo
                }
            }
        };

        const ovModal = document.getElementById('overpaymentModal');
        if (ovModal && ovModal.parentElement !== document.body) {
            document.body.appendChild(ovModal);
        }

        const btnCredit = document.getElementById('btn-op-credit');
        let partnerId = (p.debtorId === currentUser.mode) ? p.creditorId : p.debtorId;
        const isRealUser = USERS[partnerId];
        const isContact = allContacts.some(c => c.id === partnerId);
        
        if (isRealUser || isContact) {
            btnCredit.disabled = false;
            btnCredit.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
            btnCredit.classList.add('bg-purple-600', 'hover:bg-purple-700');
            btnCredit.innerHTML = "<span>🏦 Als Guthaben speichern</span>";
        } else {
            btnCredit.disabled = false; 
            btnCredit.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
            btnCredit.classList.add('bg-purple-600', 'hover:bg-purple-700');
            btnCredit.innerHTML = "<span>🏦 Als Guthaben speichern</span>";
        }

        document.getElementById('overpayment-amount').textContent = excessAmount.toFixed(2) + " €";
        closeAdjustAmountModal();
        ovModal.classList.remove('hidden');
        ovModal.style.display = 'flex';
        setButtonLoading(btn, false);
        return;
    }

    // --- FALL B: NORMALE KORREKTUR ---
    try {
        const paymentRef = doc(db, 'artifacts', appId, 'public', 'data', 'payments', currentAdjustId);
        
        const updateData = {
            ...updateBase,
            remainingAmount: finalRemaining,
            amount: finalTotalAmount,
            originalAmount: originalAmountToSave,
            originalPositions: originalPositionsToSave, 
            positions: newPositions,
            history: [...(p.history || []), { date: new Date(), action: 'adjusted', user: currentUser.displayName, info: logInfo }]
        };

        // Status logik
        if (finalRemaining <= 0.001) {
            updateData.status = 'paid';
        } else {
            updateData.status = 'open';
        }

        await updateDoc(paymentRef, updateData);

        alertUser("Eintrag aktualisiert.", "success");
        closeAdjustAmountModal();
        
        if (currentDetailPaymentId === currentAdjustId) openPaymentDetail(currentAdjustId);

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    } finally {
        setButtonLoading(btn, false);
    }
}


















// --- CREATE & EDIT MODAL ---

// --- CREATE & EDIT MODAL (KOMPLETT) ---

function openCreateModal(paymentToEdit = null) {
    const modal = document.getElementById('createPaymentModal');
    if (!modal) return;

    updateTemplateDropdown();
    fillCategoryDropdown(document.getElementById('payment-category-select'));

    const tplSelect = document.getElementById('payment-template-select');
    if (tplSelect) tplSelect.value = "";

    // Reset Standard
    document.getElementById('payment-start-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('payment-deadline').value = '';
    document.getElementById('payment-title').value = '';
    document.getElementById('payment-invoice-nr').value = '';
    document.getElementById('payment-order-nr').value = '';
    document.getElementById('payment-notes').value = '';
    document.getElementById('payment-type').value = 'debt';
    document.getElementById('payment-advanced-options').classList.add('hidden');

    // Reset Amount & TBD
    const amountInput = document.getElementById('payment-amount');
    const tbdCheckbox = document.getElementById('payment-amount-tbd');

    // Standard Zustand (Zahl) wiederherstellen
    tbdCheckbox.checked = false;
    amountInput.type = 'number';
    amountInput.value = '';
    amountInput.disabled = false;
    amountInput.classList.remove('bg-gray-100', 'bg-orange-50', 'text-orange-600', 'font-bold', 'italic', 'text-center');
    amountInput.classList.add('text-right');

    document.getElementById('split-manual-name-input').value = '';
    document.getElementById('payment-category-select').value = 'cat_misc';

    // Positionen Reset
    const posContainer = document.getElementById('positions-container');
    if (posContainer) {
        posContainer.innerHTML = '';
        posContainer.classList.add('hidden');
    }

    // Button Listener (für Positionen)
    const addPosBtn = document.getElementById('btn-add-position');
    const newBtn = addPosBtn.cloneNode(true);
    addPosBtn.parentNode.replaceChild(newBtn, addPosBtn);
    newBtn.addEventListener('click', () => addPositionInput());

    // Inputs und Modi zurücksetzen
    toggleInputMode('debtor', false);
    toggleInputMode('creditor', false);
    
    // WICHTIG: Hier muss toggleSplitMode(false) aufgerufen werden, um Layout zu resetten
    // Wir machen das aber manuell gleich beim Reset des Schalters unten

    const splitToggle = document.getElementById('toggle-split-mode');
    splitToggle.checked = false;
    splitToggle.disabled = false;

    fillDropdown(document.getElementById('payment-debtor-select'), 'debtor');
    fillDropdown(document.getElementById('payment-creditor-select'), 'creditor');

    // --- HTML UPDATE: IDs HINZUFÜGEN FÜR LAYOUT-STEUERUNG ---
    // Wir geben dem Container 'payment-direction-wrapper' und dem Pfeil 'payment-direction-arrow'
    // Damit können wir in toggleSplitMode zwischen Zeile (Row) und Spalte (Col) wechseln.
    
    if (paymentToEdit) {
        document.getElementById('scenario-selector-container').classList.add('hidden');
        document.getElementById('transaction-details-container').classList.remove('hidden');

        document.getElementById('edit-payment-id').value = paymentToEdit.id;
        document.getElementById('payment-title').value = paymentToEdit.title;

        if (paymentToEdit.isTBD) {
            tbdCheckbox.checked = true;
            amountInput.type = 'text';
            amountInput.value = 'Betrag unbekannt';
            amountInput.disabled = true;
            amountInput.classList.add('bg-orange-50', 'text-orange-600', 'font-bold', 'italic', 'text-center');
            amountInput.classList.remove('text-right');
            splitToggle.disabled = true;
        } else {
            amountInput.value = paymentToEdit.amount;
            amountInput.disabled = true;
        }

        document.getElementById('payment-start-date').value = paymentToEdit.startDate || '';
        document.getElementById('payment-deadline').value = paymentToEdit.deadline || '';

        if (paymentToEdit.categoryId) document.getElementById('payment-category-select').value = paymentToEdit.categoryId;
        else document.getElementById('payment-category-select').value = 'cat_misc';

        const debSelect = document.getElementById('payment-debtor-select');
        let foundDeb = false;
        const prefixes = ['USR', 'CON', 'ACC'];
        for (let p of prefixes) { if (debSelect.querySelector(`option[value="${p}:${paymentToEdit.debtorId}"]`)) { debSelect.value = `${p}:${paymentToEdit.debtorId}`; foundDeb = true; break; } }
        if (!foundDeb && paymentToEdit.debtorId) { toggleInputMode('debtor', true); document.getElementById('payment-debtor-manual').value = paymentToEdit.debtorName; }

        const credSelect = document.getElementById('payment-creditor-select');
        let foundCred = false;
        for (let p of prefixes) { if (credSelect.querySelector(`option[value="${p}:${paymentToEdit.creditorId}"]`)) { credSelect.value = `${p}:${paymentToEdit.creditorId}`; foundCred = true; break; } }
        if (!foundCred) { toggleInputMode('creditor', true); document.getElementById('payment-creditor-manual').value = paymentToEdit.creditorName; }
        updateCreditorHint();

        if (paymentToEdit.invoiceNr || paymentToEdit.orderNr || paymentToEdit.notes || paymentToEdit.type === 'transfer') {
            document.getElementById('payment-advanced-options').classList.remove('hidden');
        }

        if (paymentToEdit.positions && paymentToEdit.positions.length > 0) {
            paymentToEdit.positions.forEach(p => addPositionInput(p.name, p.price));
        }

        newBtn.style.display = 'none';

    } else {
        document.getElementById('edit-payment-id').value = "";
        document.getElementById('scenario-selector-container').classList.remove('hidden');
        document.getElementById('transaction-details-container').classList.add('hidden');
        newBtn.style.display = 'flex';
    }

    // --- FIX: Container IDs sicherstellen (falls HTML neu gebaut wurde) ---
    // Da das HTML statisch im Modal liegt, müssen wir sicherstellen, dass die IDs da sind.
    // Wir ersetzen den inneren Teil des `transaction-details-container` NICHT per JS string, 
    // sondern gehen davon aus, dass er im HTML (index.html/js string) richtig sitzt.
    // DA ABER DAS HTML HIER IM JS GENERIERT WIRD (in createPaymentModal im index.html Teil),
    // müssen wir sicherstellen, dass die IDs dort existieren.
    // Da ich den index.html Code nicht ändern kann, nutzen wir JS, um IDs nachträglich zu setzen,
    // falls sie fehlen.
    
    const container = document.getElementById('transaction-details-container');
    // Wir suchen das Flex-Div, das Debtor und Creditor hält.
    // Es ist das zweite Kind von bg-gray-50 div.
    const settingsBox = container.querySelector('.bg-gray-50');
    if (settingsBox) {
        // Das Flex-Div hat die Klasse 'flex flex-row items-start gap-2'
        const flexDiv = settingsBox.querySelector('.flex.flex-row');
        if (flexDiv) {
            flexDiv.id = 'payment-direction-wrapper';
            flexDiv.classList.add('transition-all', 'duration-300'); // Animation
            
            // Pfeil Container suchen (der mittlere Div)
            if (flexDiv.children.length === 3) {
                flexDiv.children[1].id = 'payment-direction-arrow';
                flexDiv.children[1].classList.add('transition-transform', 'duration-300');
            }
        }
    }

    // Initial Reset des Layouts
    toggleSplitMode(false);

    const saveBtn = document.getElementById('btn-save-payment');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        saveBtn.title = "";
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}








function closeCreateModal() { document.getElementById('createPaymentModal').style.display = 'none'; }


function setTransactionScenario(scenario) {
    const myId = `USR:${currentUser.mode}`;
    const debtSelect = document.getElementById('payment-debtor-select');
    const credSelect = document.getElementById('payment-creditor-select');

    // 1. UI Umschalten: Buttons weg, Details da
    document.getElementById('scenario-selector-container').classList.add('hidden');
    document.getElementById('transaction-details-container').classList.remove('hidden');

    // 2. Logik anwenden (Vorbelegung)
    if (scenario === 'i_owe') {
        // Ich schulde -> Von Mir -> An ?
        toggleInputMode('debtor', false);
        toggleInputMode('creditor', false);

        // Versuche "MICH" auszuwählen
        if (debtSelect.querySelector(`option[value="${myId}"]`)) {
            debtSelect.value = myId;
        }
        credSelect.value = ""; // Empfänger offen lassen

    } else if (scenario === 'owes_me') {
        // Mir schuldet -> Von ? -> An Mich
        toggleInputMode('debtor', false);
        toggleInputMode('creditor', false);

        if (credSelect.querySelector(`option[value="${myId}"]`)) {
            credSelect.value = myId;
        }
        debtSelect.value = ""; // Schuldner offen lassen

    } else {
        // Sonstiges -> Alles leer lassen
        debtSelect.value = "";
        credSelect.value = "";
    }

    updateCreditorHint();
}



// --- HELFER FÜR DAS MODAL ---

function toggleInputMode(who, forceManual = null) {
    const select = document.getElementById(`payment-${who}-select`);
    const manual = document.getElementById(`payment-${who}-manual`);
    const btn = document.getElementById(`btn-toggle-${who}-manual`);

    let isManual = !manual.classList.contains('hidden');
    if (forceManual !== null) isManual = !forceManual;

    if (isManual) {
        // Zu Dropdown wechseln
        manual.classList.add('hidden');
        select.classList.remove('hidden');
        btn.textContent = "Tippen";
        btn.classList.remove('bg-indigo-200', 'text-indigo-700');
        btn.classList.add('bg-gray-200', 'text-gray-500');
    } else {
        // Zu Manuell wechseln
        select.classList.add('hidden');
        manual.classList.remove('hidden');
        btn.textContent = "Liste";
        btn.classList.add('bg-indigo-200', 'text-indigo-700');
        btn.classList.remove('bg-gray-200', 'text-gray-500');
    }
}

function toggleSplitMode(isActive) {
    const singleWrap = document.getElementById('debtor-single-wrapper');
    const splitWrap = document.getElementById('debtor-split-wrapper');
    const saveBtn = document.getElementById('btn-save-payment');
    const tbdWrapper = document.getElementById('tbd-wrapper'); 
    const tbdCheckbox = document.getElementById('payment-amount-tbd');

    // --- NEU: Layout Steuerung ---
    const dirWrapper = document.getElementById('payment-direction-wrapper');
    const dirArrow = document.getElementById('payment-direction-arrow');

    // Reset beim Öffnen
    currentSplitOffsets = {};
    currentSplitAdjustments = {};

    if (isActive) {
        // TBD Logik: Beim Splitten kein TBD erlaubt
        if (tbdWrapper) tbdWrapper.classList.add('hidden');
        if (tbdCheckbox && tbdCheckbox.checked) {
            tbdCheckbox.click(); 
        }

        // --- LAYOUT AUF "UNTEREINANDER" UMSCHALTEN ---
        if (dirWrapper) {
            dirWrapper.classList.remove('flex-row', 'items-start');
            dirWrapper.classList.add('flex-col', 'items-stretch'); // Untereinander & Volle Breite
        }
        if (dirArrow) {
            dirArrow.classList.remove('pt-6'); // Padding oben weg (war für nebeneinander nötig)
            dirArrow.classList.add('py-2', 'rotate-90'); // Padding vertikal & drehen
        }

        singleWrap.classList.add('hidden');
        splitWrap.classList.remove('hidden');

        const splitList = document.getElementById('split-partner-list');
        splitList.innerHTML = '';

        let html = `
        <div class="mb-2 pb-2 border-b border-indigo-100">
            <select id="split-distribution-method" class="w-full p-1 text-xs border rounded bg-indigo-50 font-bold text-indigo-700">
                <option value="equal">Gleichmäßig teilen (mit Anpassung)</option>
                <option value="manual">Komplett manuell</option>
            </select>
            
            <div id="manual-split-feedback" class="hidden mt-2 text-xs font-bold text-right">
                Noch zu verteilen: <span id="manual-split-remaining">0.00</span> €
            </div>
        </div>
        
        <div id="split-people-container" class="space-y-1">
        `;

        // --- ULTRA ROBUSTES LAYOUT (Beibehalten!) ---
        const createRow = (id, name) => `
            <div class="row-item flex items-center w-full p-1.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 rounded" data-id="${id}" data-name="${name}">
                
                <label class="flex items-center flex-grow min-w-0 cursor-pointer mr-2">
                    <input type="checkbox" class="split-cb flex-shrink-0 h-5 w-5 text-indigo-600 rounded accent-indigo-600" value="${id}" data-name="${name}">
                    <span class="ml-2 text-xs sm:text-sm font-bold text-gray-700 truncate leading-tight">${name}</span>
                </label>

                <div class="flex items-center gap-1 flex-shrink-0">
                    <button type="button" class="btn-adj-split flex-shrink-0 w-7 h-7 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded flex items-center justify-center text-[10px] font-bold transition-colors shadow-sm" title="Anpassen">
                        ±
                    </button>
                    <input type="number" class="split-amount-input w-14 sm:w-20 p-1 text-xs border rounded text-right font-bold bg-gray-100 text-gray-900" placeholder="0" disabled step="0.01">
                </div>
            </div>`;

        // User laden
        Object.values(USERS).forEach(u => {
            if (u.isActive) {
                let displayName = u.realName || u.name;
                if (u.id === currentUser.mode) displayName += " (Ich)";
                html += createRow(u.id, displayName);
            }
        });

        // Kontakte laden
        if (allContacts.length > 0) {
            html += `<div class="text-[10px] font-bold text-gray-400 mt-2 mb-1 uppercase">Eigene Kontakte</div>`;
            allContacts.forEach(c => html += createRow(c.id, c.name));
        }

        html += `</div>`;
        splitList.innerHTML = html;

        // --- Event Listeners ---

        const methodSelect = document.getElementById('split-distribution-method');
        methodSelect.addEventListener('change', () => {
            const isManual = methodSelect.value === 'manual';
            const inputs = document.querySelectorAll('.split-amount-input');
            const adjBtns = document.querySelectorAll('.btn-adj-split');
            const feedbackBox = document.getElementById('manual-split-feedback');

            currentSplitOffsets = {};
            currentSplitAdjustments = {};

            inputs.forEach(inp => {
                inp.disabled = !isManual;
                if (isManual) {
                    inp.classList.remove('bg-gray-100', 'font-bold');
                    inp.classList.add('bg-white', 'border-indigo-300');
                } else {
                    inp.classList.add('bg-gray-100', 'font-bold');
                    inp.classList.remove('bg-white', 'border-indigo-300');
                    inp.value = '';
                }
            });

            adjBtns.forEach(btn => {
                btn.style.display = isManual ? 'none' : 'flex';
                // Reset Button Style beim Umschalten
                btn.className = "btn-adj-split flex-shrink-0 w-7 h-7 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded flex items-center justify-center text-[10px] font-bold transition-colors shadow-sm";
            });

            if (feedbackBox) feedbackBox.classList.toggle('hidden', !isManual);
            updateSplitPreview();
        });

        document.querySelectorAll('.split-cb').forEach(cb => cb.addEventListener('change', updateSplitPreview));
        document.querySelectorAll('.split-amount-input').forEach(inp => inp.addEventListener('input', updateSplitPreview));

        if (!splitWrap.dataset.listenerAttached) {
            splitWrap.addEventListener('click', (e) => {
                const btn = e.target.closest('.btn-adj-split');
                if (btn) {
                    e.stopPropagation();
                    e.preventDefault();

                    const row = btn.closest('.row-item');
                    const cb = row.querySelector('.split-cb');

                    if (!cb.checked) {
                        alertUser("Bitte Person erst auswählen.", "info");
                        return;
                    }

                    openSplitAdjustmentModal(row.dataset.id, row.dataset.name);
                }
            });
            splitWrap.dataset.listenerAttached = 'true';
        }

        // Initiale Berechnung
        updateSplitPreview();

    } else {
        // DEAKTIVIERT (Normalmodus)
        
        // --- LAYOUT AUF "NEBENEINANDER" ZURÜCKSETZEN ---
        if (dirWrapper) {
            dirWrapper.classList.add('flex-row', 'items-start');
            dirWrapper.classList.remove('flex-col', 'items-stretch');
        }
        if (dirArrow) {
            dirArrow.classList.add('pt-6'); // Padding oben wieder rein
            dirArrow.classList.remove('py-2', 'rotate-90'); // Drehung weg
        }

        singleWrap.classList.remove('hidden');
        splitWrap.classList.add('hidden');

        // TBD wieder anzeigen
        if (tbdWrapper) tbdWrapper.classList.remove('hidden');

        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            saveBtn.title = "";
        }
    }
}

















// Diese Funktion wurde umbenannt/ersetzt (früher togglePartnerManual),
// wird aber vom HTML EventListener benötigt. Wir leiten sie um oder entfernen sie,
// aber da wir den HTML-Button im Code oben auf toggleInputMode gelegt haben, brauchen wir diese hier eigentlich nicht mehr.
// Ich lasse sie weg, da sie durch toggleInputMode ersetzt wurde.

// Aber wir brauchen diese Helfer für die "alte" Logik der Split-Berechnung und UI:
function setCreateMode(mode) {
    // Diese Funktion wird in der neuen Logik eigentlich nicht mehr gebraucht,
    // da wir jetzt Checkboxen für Split haben.
    // Aber damit keine Fehler kommen, lassen wir eine leere Hülle oder entfernen die Aufrufe.
    // Besser: Wir entfernen sie, da wir das HTML geändert haben und die Buttons 'mode-single' nicht mehr existieren.
}
function setDirection(dir) {
    // Auch diese Funktion wird nicht mehr benötigt, da wir jetzt explizit "Schuldner" und "Gläubiger" wählen.
}

function updateSplitPreview() {
    // 1. Gesamtbetrag holen
    const totalInput = document.getElementById('payment-amount');
    let valStr = totalInput ? totalInput.value : "";
    valStr = valStr.replace(',', '.');
    const total = parseFloat(valStr) || 0;

    const previewEl = document.getElementById('split-calculation-preview'); // Altes Preview Element (unten)
    const methodSelect = document.getElementById('split-distribution-method');
    const container = document.getElementById('split-people-container');
    const saveBtn = document.getElementById('btn-save-payment');

    // Elemente für manuelles Feedback
    const feedbackBox = document.getElementById('manual-split-feedback');

    if (!methodSelect || !container) return;

    const mode = methodSelect.value;
    const rows = container.querySelectorAll('.row-item');

    let checkedCount = 0;
    let currentSum = 0;

    // Zählen
    rows.forEach(row => {
        const cb = row.querySelector('.split-cb');
        if (cb && cb.checked) checkedCount++;
    });

    // Abbruch wenn niemand gewählt
    if (checkedCount === 0) {
        if (previewEl) {
            previewEl.textContent = "Bitte Personen auswählen.";
            previewEl.className = "text-xs text-red-500 font-bold mt-1";
        }
        currentSplitOffsets = {};
        rows.forEach(row => {
            const inp = row.querySelector('.split-amount-input');
            if (inp) inp.value = "";
        });
        // Feedback reset & Speichern sperren
        if (feedbackBox) {
            feedbackBox.innerHTML = `Noch zu verteilen: <span>${total.toFixed(2)}</span> €`;
            feedbackBox.className = "mt-2 text-xs font-bold text-right text-red-600";
        }
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
            saveBtn.title = "Bitte erst Personen auswählen";
        }
        return;
    }

    // --- BERECHNUNG ---

    if (mode === 'equal') {
        // GLEICHMÄSSIG
        const baseShare = (total > 0) ? (total / checkedCount) : 0;

        let checkSumEqual = 0;

        // NEU: Variable um Minus-Salden zu erkennen
        let negativeDetected = false;
        let negativeNames = [];

        rows.forEach(row => {
            const cb = row.querySelector('.split-cb');
            const inp = row.querySelector('.split-amount-input');
            const id = String(row.dataset.id);

            if (cb && inp) {
                if (cb.checked) {
                    const offset = (currentSplitOffsets && typeof currentSplitOffsets[id] === 'number') ? currentSplitOffsets[id] : 0;
                    const finalVal = baseShare + offset;

                    inp.value = finalVal.toFixed(2);
                    checkSumEqual += parseFloat(finalVal.toFixed(2));

                    // === NEU: MINUS PRÜFUNG ===
                    if (finalVal < -0.01) {
                        negativeDetected = true;
                        // Name aus Dataset holen, "(Gast)" entfernen für saubere Anzeige
                        let cleanName = row.dataset.name.replace(" (Gast)", "");
                        negativeNames.push(cleanName);

                        // Feld ROT markieren
                        inp.classList.add('bg-red-100', 'text-red-600', 'border-red-500', 'font-bold');
                        inp.classList.remove('text-indigo-800', 'bg-indigo-50', 'text-gray-900', 'bg-gray-100');
                    }
                    else {
                        // Normaler Style Logik (Gefärbt wenn angepasst, sonst grau)
                        if (Math.abs(offset) > 0.001) {
                            inp.classList.add('text-indigo-800', 'bg-indigo-50', 'font-black');
                            inp.classList.remove('text-gray-900', 'bg-gray-100', 'bg-red-100', 'text-red-600', 'border-red-500');
                        } else {
                            inp.classList.remove('text-indigo-800', 'bg-indigo-50', 'font-black', 'bg-red-100', 'text-red-600', 'border-red-500');
                            inp.classList.add('text-gray-900', 'bg-gray-100');
                        }
                    }
                    // ===========================

                } else {
                    inp.value = "";
                    if (currentSplitOffsets && currentSplitOffsets[id]) delete currentSplitOffsets[id];
                    // Reset Style bei abgewählten
                    inp.className = "split-amount-input w-20 p-1 text-xs border rounded text-right bg-gray-100 text-gray-900 font-bold";
                }
            }
        });

        // Sicherheitsprüfung Summe
        const diffEqual = total - checkSumEqual;
        const isValidSum = Math.abs(diffEqual) < 0.05;

        // === NEU: Button Logik inkl. Minus-Check ===
        if (saveBtn) {
            // Button ist nur aktiv, wenn Summe stimmt UND niemand im Minus ist
            if (isValidSum && total > 0 && !negativeDetected) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                saveBtn.title = "";
                if (feedbackBox) feedbackBox.classList.add('hidden');
            } else {
                saveBtn.disabled = true;
                saveBtn.classList.add('opacity-50', 'cursor-not-allowed');

                // Feedback anzeigen
                if (feedbackBox) {
                    feedbackBox.classList.remove('hidden');
                    feedbackBox.className = "mt-2 text-xs font-bold text-right text-red-600";

                    if (negativeDetected) {
                        saveBtn.title = "Negative Beträge nicht erlaubt";
                        const nameStr = negativeNames.slice(0, 2).join(', ') + (negativeNames.length > 2 ? '...' : '');
                        feedbackBox.innerHTML = `Nicht möglich: <span class="underline">${nameStr}</span> im Minus!`;
                    } else {
                        saveBtn.title = "Summe stimmt nicht überein";
                        feedbackBox.innerHTML = `Abweichung: <span>${diffEqual.toFixed(2)}</span> €`;
                    }
                }
            }
        }

        if (previewEl) {
            if (total > 0) {
                previewEl.textContent = `Basis: ${baseShare.toFixed(2)} € (+/- Anpassungen)`;
                previewEl.className = "text-xs text-indigo-600 font-bold mt-1";
            } else {
                previewEl.textContent = "Bitte Gesamtbetrag eingeben.";
                previewEl.className = "text-xs text-gray-400 font-bold mt-1";
            }
        }

    } else {
        // MANUELL
        rows.forEach(row => {
            const cb = row.querySelector('.split-cb');
            const inp = row.querySelector('.split-amount-input');
            if (cb && inp) {
                if (cb.checked) {
                    let vStr = inp.value.replace(',', '.');
                    let val = parseFloat(vStr);
                    if (isNaN(val)) val = 0;
                    currentSum += val;
                } else {
                    inp.value = "";
                }
            }
        });

        const diff = total - currentSum;
        if (previewEl) previewEl.textContent = "";

        const isBalanced = Math.abs(diff) < 0.02;

        if (feedbackBox) {
            feedbackBox.classList.remove('hidden');

            if (isBalanced) {
                feedbackBox.className = "mt-2 text-xs font-bold text-right text-green-600";
                feedbackBox.innerHTML = `✔ Perfekt aufgeteilt: ${currentSum.toFixed(2)} €`;

                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    saveBtn.title = "";
                }

            } else {
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    saveBtn.title = "Beträge müssen aufgehen";
                }

                if (diff > 0) {
                    feedbackBox.className = "mt-2 text-xs font-bold text-right text-orange-600";
                    feedbackBox.innerHTML = `Noch zu verteilen: <span>${diff.toFixed(2)}</span> €`;
                } else {
                    feedbackBox.className = "mt-2 text-xs font-bold text-right text-red-600";
                    feedbackBox.innerHTML = `Zu viel verteilt: <span>${Math.abs(diff).toFixed(2)}</span> €`;
                }
            }
        }
    }
}














function updateCreditorHint() {
    const sel = document.getElementById('payment-creditor-select');
    const opt = sel.options[sel.selectedIndex];
    const hint = document.getElementById('creditor-details-hint');
    if (opt && opt.dataset.details) {
        hint.textContent = `Details: ${opt.dataset.details}`;
    } else {
        hint.textContent = "";
    }
}

function addSplitManualPartner() {
    const input = document.getElementById('split-manual-name-input');
    const name = input.value.trim();
    if (!name) return;

    const list = document.getElementById('split-partner-list');
    const container = document.getElementById('split-people-container');

    if (!container) {
        alertUser("Bitte erst 'Gruppe / Split' aktivieren.", "info");
        return;
    }

    const id = 'MANUAL_' + Date.now();

    // 1. HTML Struktur
    const div = document.createElement('div');
    div.className = "flex items-center justify-between p-1 hover:bg-gray-50 rounded border-b border-gray-50 last:border-0 row-item";
    div.dataset.id = id;
    div.dataset.name = name + " (Gast)";

    div.innerHTML = `
        <label class="flex items-center gap-2 cursor-pointer flex-grow min-w-0">
            <input type="checkbox" class="split-cb h-4 w-4 text-indigo-600 rounded" value="${id}" data-name="${name} (Gast)" checked>
            <span class="text-sm text-gray-700 truncate">${name} <span class="text-xs text-gray-400">(Gast)</span></span>
        </label>
        <div class="flex items-center gap-1">
            <button type="button" class="btn-adj-split flex p-1 bg-gray-200 hover:bg-gray-300 text-gray-600 rounded text-[10px] font-bold w-6 h-6 items-center justify-center transition-colors" title="Betrag anpassen">
                ±
            </button>
            <input type="number" class="split-amount-input w-20 p-1 text-xs border rounded text-right bg-gray-100 text-gray-900 font-bold" placeholder="0.00" disabled step="0.01">
        </div>
    `;

    // 2. Style setzen
    const methodSelect = document.getElementById('split-distribution-method');
    const isManual = methodSelect && methodSelect.value === 'manual';
    const amountInput = div.querySelector('.split-amount-input');
    const adjBtn = div.querySelector('.btn-adj-split');

    amountInput.disabled = !isManual;
    if (isManual) {
        amountInput.classList.remove('bg-gray-100', 'font-bold');
        amountInput.classList.add('bg-white', 'border-indigo-300');
        adjBtn.style.display = 'none';
    } else {
        amountInput.classList.add('bg-gray-100', 'font-bold');
        amountInput.classList.remove('bg-white', 'border-indigo-300');
        adjBtn.style.display = 'flex';
    }

    // 3. Event Listener (Nur für Input & Checkbox, Button wird vom Container übernommen!)
    div.querySelector('.split-cb').addEventListener('change', updateSplitPreview);
    div.querySelector('.split-amount-input').addEventListener('input', updateSplitPreview);

    // Oben einfügen
    container.insertBefore(div, container.firstChild);

    input.value = '';
    input.focus();

    updateSplitPreview();
}



async function savePayment() {
    const btn = document.getElementById('btn-save-payment');
    setButtonLoading(btn, true);

    try {
        const editId = document.getElementById('edit-payment-id').value;
        const title = document.getElementById('payment-title').value.trim();
        const startDate = document.getElementById('payment-start-date').value;
        const deadlineDate = document.getElementById('payment-deadline').value || null;
        const categoryId = document.getElementById('payment-category-select').value || 'cat_misc';

        // TBD Prüfung
        const isTBD = document.getElementById('payment-amount-tbd').checked;
        let totalAmount = 0;

        if (isTBD) {
            totalAmount = 0;
        } else {
            totalAmount = parseFloat(document.getElementById('payment-amount').value);
        }

        // Validierung
        if (!title || startDate === "") throw new Error("Pflichtfelder fehlen (Titel, Datum).");
        if (!isTBD && (isNaN(totalAmount) || totalAmount === "")) throw new Error("Bitte einen Betrag eingeben oder 'Unbekannt' wählen.");

        // --- NEU: DATUMS-VALIDIERUNG ---
        if (startDate && deadlineDate) {
            if (deadlineDate < startDate) {
                throw new Error("Die Frist darf nicht vor dem Startdatum liegen.");
            }
        }

        // Positionen sammeln
        const positions = [];
        document.querySelectorAll('.position-row').forEach(row => {
            const name = row.querySelector('.pos-name').value.trim();
            const price = parseFloat(row.querySelector('.pos-price').value);
            if (name && !isNaN(price)) positions.push({ name, price });
        });

        // 1. GLÄUBIGER
        let creditorId = null, creditorName = "";
        const credManualEl = document.getElementById('payment-creditor-manual');
        const credManual = credManualEl && !credManualEl.classList.contains('hidden');
        
        if (credManual) {
            creditorName = credManualEl.value.trim();
            if (!creditorName) throw new Error("Gläubiger fehlt.");
            const duplicate = allContacts.find(c => c.name.toLowerCase() === creditorName.toLowerCase());
            if (duplicate) throw new Error(`Der Name "${creditorName}" existiert bereits! Bitte Liste nutzen.`);
        } else {
            const val = document.getElementById('payment-creditor-select').value;
            if (!val) throw new Error("Bitte einen Empfänger (Gläubiger) auswählen.");
            const parts = val.split(':');
            creditorId = parts[1];
            creditorName = document.getElementById('payment-creditor-select').options[document.getElementById('payment-creditor-select').selectedIndex].text;
        }

        // 2. SCHULDNER
        let debtorId = null, debtorName = "";
        const splitToggleEl = document.getElementById('toggle-split-mode');
        const splitMode = splitToggleEl ? splitToggleEl.checked : false;

        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        const baseData = {
            title, isTBD, startDate, 
            deadline: deadlineDate,
            status: 'open', type: document.getElementById('payment-type').value,
            categoryId, creditorId, creditorName,
            invoiceNr: document.getElementById('payment-invoice-nr').value,
            orderNr: document.getElementById('payment-order-nr').value,
            notes: document.getElementById('payment-notes').value,
            positions, createdAt: serverTimestamp(), createdBy: currentUser.mode
        };

        // Helper: Beteiligte User IDs sammeln
        const getInvolvedArray = (dId, cId) => {
            const arr = [currentUser.mode];
            if (dId && !dId.startsWith('MANUAL_') && dId !== currentUser.mode) arr.push(dId);
            if (cId && !cId.startsWith('MANUAL_') && cId !== currentUser.mode) arr.push(cId);
            return [...new Set(arr)];
        };

        if (!splitMode) {
            // --- EINZEL-MODUS ---
            const debManualEl = document.getElementById('payment-debtor-manual');
            const debManual = debManualEl && !debManualEl.classList.contains('hidden');
            
            if (debManual) {
                debtorName = debManualEl.value.trim();
                if (!debtorName) throw new Error("Schuldner fehlt.");
                const duplicate = allContacts.find(c => c.name.toLowerCase() === debtorName.toLowerCase());
                if (duplicate) throw new Error(`Der Name "${debtorName}" existiert bereits! Bitte Liste nutzen.`);
            } else {
                const val = document.getElementById('payment-debtor-select').value;
                if (!val) throw new Error("Bitte einen Schuldner auswählen.");
                const parts = val.split(':');
                debtorId = parts[1];
                debtorName = document.getElementById('payment-debtor-select').options[document.getElementById('payment-debtor-select').selectedIndex].text;
            }

            let logText = isTBD ? "Erstellt (Betrag unbekannt)" : `Erstellt (${totalAmount.toFixed(2)} €)`;
            const involved = getInvolvedArray(debtorId, creditorId);

            const finalData = {
                ...baseData,
                amount: totalAmount,
                remainingAmount: totalAmount,
                debtorId, debtorName, involvedUserIds: involved,
                accessRights: { [currentUser.mode]: { status: 'accepted', rights: 'owner' } },
                history: [{ date: new Date(), action: 'created', user: currentUser.displayName, info: logText }]
            };

            if (editId) {
                delete finalData.createdAt;
                delete finalData.history; 
                const pOld = allPayments.find(x => x.id === editId);
                if(pOld) {
                    finalData.history = [...(pOld.history || []), { date: new Date(), action: 'edited', user: currentUser.displayName, info: 'Stammdaten bearbeitet' }];
                }
                batch.update(doc(paymentsRef, editId), finalData);
            } else {
                batch.set(doc(paymentsRef), finalData);
            }

        } else {
            // --- SPLIT-MODUS ---
            if (editId) throw new Error("Split-Einträge können nicht als Gruppe bearbeitet werden.");
            if (isTBD) throw new Error("Split ist mit unbekanntem Betrag nicht möglich.");

            const rows = document.querySelectorAll('.row-item');
            let checkedCount = 0;
            rows.forEach(row => { if (row.querySelector('.split-cb').checked) checkedCount++; });
            if (checkedCount === 0) throw new Error("Keine Personen gewählt.");

            const methodSelect = document.getElementById('split-distribution-method');
            const isManual = methodSelect && methodSelect.value === 'manual';
            const baseShare = (totalAmount / checkedCount);
            const splitItems = [];
            let sumCheck = 0;

            for (const row of rows) {
                const cb = row.querySelector('.split-cb');
                if (cb && cb.checked) {
                    const pId = String(cb.value);
                    if (pId.startsWith('MANUAL_')) {
                        const rawName = cb.dataset.name.replace(" (Gast)", "").trim();
                        const duplicate = allContacts.find(c => c.name.toLowerCase() === rawName.toLowerCase());
                        if (duplicate) throw new Error(`Split-Person "${rawName}" existiert bereits. Bitte Liste nutzen.`);
                    }
                    
                    let myShare = 0;
                    if (isManual) {
                        const inp = row.querySelector('.split-amount-input');
                        myShare = parseFloat(inp.value) || 0;
                    } else {
                        const offset = (currentSplitOffsets && typeof currentSplitOffsets[pId] === 'number') ? currentSplitOffsets[pId] : 0;
                        myShare = baseShare + offset;
                    }
                    myShare = parseFloat(myShare.toFixed(2));
                    if (myShare < -0.01) throw new Error(`Betrag negativ.`);
                    sumCheck += myShare;
                    splitItems.push({ id: pId, name: cb.dataset.name, share: myShare });
                }
            }

            if (Math.abs(totalAmount - sumCheck) > 0.05) throw new Error(`Summenfehler.`);

            const splitGroupId = "GRP_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

            splitItems.forEach(item => {
                const dId = item.id.startsWith('MANUAL_') ? null : item.id;
                const involved = getInvolvedArray(dId, creditorId);

                const entry = {
                    ...baseData,
                    amount: item.share,
                    remainingAmount: item.share,
                    debtorId: dId,
                    debtorName: item.name,
                    involvedUserIds: involved,
                    accessRights: { [currentUser.mode]: { status: 'accepted', rights: 'owner' } },
                    splitGroupId: splitGroupId,
                    title: `${title}`,
                    status: (item.share <= 0.001) ? 'paid' : 'open',
                    history: [{ date: new Date(), action: 'created_split', user: currentUser.displayName, info: `Erstellt (Split-Anteil: ${item.share.toFixed(2)} €)` }]
                };
                batch.set(doc(paymentsRef), entry);
            });
        }

        await batch.commit();
        alertUser("Gespeichert!", "success");
        closeCreateModal();

    } catch (e) { console.error(e); alertUser(e.message, "error"); } 
    finally { setButtonLoading(btn, false); }
}












// --- SETTLEMENT (BILANZ) ---
// --- SETTLEMENT (BILANZ) ---
function openSettlementModal() {
    const modal = document.getElementById('settlementModal');
    const list = document.getElementById('settlement-user-list');
    const detail = document.getElementById('settlement-detail-view');

    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    detail.classList.add('hidden');
    activeSettlementPartnerId = null;

    const partners = {};
    // BUGFIX: Datum für Zukunfts-Check
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allPayments.forEach(p => {
        // Nur offene Posten
        if (p.status !== 'open' && p.status !== 'pending_approval') return;

        // WICHTIG: Nur Einträge, die ICH erstellt habe (Admin)
        if (p.createdBy !== currentUser.mode) return;

        // BUGFIX: Zukünftige Zahlungen ignorieren
        if (p.startDate) {
            const start = new Date(p.startDate);
            start.setHours(0, 0, 0, 0);
            if (start > today) return; 
        }

        const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);

        let partnerId, partnerName;
        let isMyDebt = false; // Bedeutet: Ich schulde (oder ich verwalte das Guthaben für jemanden)

        if (p.debtorId === currentUser.mode) {
            partnerId = p.creditorId; partnerName = p.creditorName;
            isMyDebt = true;
        } else {
            partnerId = p.debtorId; partnerName = p.debtorName;
            isMyDebt = false;
        }

        if (!partnerId) partnerId = "MANUAL_" + partnerName;

        if (!partners[partnerId]) {
            partners[partnerId] = { id: partnerId, name: partnerName, iOwe: 0, owesMe: 0 };
        }

        // Berechnung:
        if (isMyDebt) partners[partnerId].iOwe += amount;
        else partners[partnerId].owesMe += amount;
    });

    list.innerHTML = '';
    const partnerArray = Object.values(partners);

    if (partnerArray.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">Keine fälligen offenen Posten zum Verrechnen.</p>';
        return;
    }

    partnerArray.forEach(p => {
        const net = p.owesMe - p.iOwe;
        let netText = '';
        let colorClass = '';
        if (net > 0.001) { netText = `+ ${net.toFixed(2)} €`; colorClass = 'text-emerald-600'; }
        else if (net < -0.001) { netText = `${net.toFixed(2)} €`; colorClass = 'text-red-600'; }
        else { netText = '0,00 €'; colorClass = 'text-gray-500'; }

        const item = document.createElement('div');
        item.className = "flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer border";
        item.innerHTML = `
            <div>
                <p class="font-bold text-gray-800">${p.name}</p>
                <p class="text-xs text-gray-500">Offen: Du ${p.iOwe.toFixed(2)} | Dir ${p.owesMe.toFixed(2)}</p>
            </div>
            <div class="font-bold ${colorClass}">${netText}</div>
        `;
        item.onclick = () => selectSettlementPartner(p.id);
        list.appendChild(item);
    });
}




function selectSettlementPartner(partnerId) {
    activeSettlementPartnerId = partnerId;
    const detail = document.getElementById('settlement-detail-view');
    detail.classList.remove('hidden');

    let iOwe = 0;
    let owesMe = 0;
    let partnerName = "Unbekannt";
    
    // BUGFIX: Datum für Zukunfts-Check
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allPayments.forEach(p => {
        // Nur offene Einträge
        if (p.status !== 'open' && p.status !== 'pending_approval') return;

        // Nur eigene Einträge zählen
        if (p.createdBy !== currentUser.mode) return;

        // BUGFIX: Zukünftige Zahlungen ignorieren
        if (p.startDate) {
            const start = new Date(p.startDate);
            start.setHours(0, 0, 0, 0);
            if (start > today) return; 
        }

        let pIdCheck = (p.debtorId === currentUser.mode) ? p.creditorId : p.debtorId;
        let pNameCheck = (p.debtorId === currentUser.mode) ? p.creditorName : p.debtorName;
        if (!pIdCheck) pIdCheck = "MANUAL_" + pNameCheck;

        if (pIdCheck === partnerId) {
            partnerName = pNameCheck;
            const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);
            if (p.debtorId === currentUser.mode) iOwe += amount;
            else owesMe += amount;
        }
    });

    document.getElementById('settlement-partner-name').textContent = partnerName;
    document.getElementById('settlement-i-owe').textContent = iOwe.toFixed(2) + ' €';
    document.getElementById('settlement-owes-me').textContent = owesMe.toFixed(2) + ' €';

    const net = owesMe - iOwe;
    const resultEl = document.getElementById('settlement-net-result');
    const actionEl = document.getElementById('settlement-action-text');
    const execBtn = document.getElementById('btn-execute-settlement');

    if (net > 0.01) {
        resultEl.textContent = net.toFixed(2) + " €";
        resultEl.className = "text-2xl font-extrabold text-emerald-600";
        actionEl.textContent = `${partnerName} muss dir noch ${net.toFixed(2)} € zahlen.`;
        execBtn.disabled = false;
        execBtn.className = "w-full py-3 bg-emerald-600 text-white font-bold rounded-lg shadow hover:bg-emerald-700 transition";
    } else if (net < -0.01) {
        resultEl.textContent = Math.abs(net).toFixed(2) + " €";
        resultEl.className = "text-2xl font-extrabold text-red-600";
        actionEl.textContent = `Du musst ${partnerName} noch ${Math.abs(net).toFixed(2)} € zahlen.`;
        execBtn.disabled = false;
        execBtn.className = "w-full py-3 bg-red-600 text-white font-bold rounded-lg shadow hover:bg-red-700 transition";
    } else {
        resultEl.textContent = "0,00 €";
        resultEl.className = "text-2xl font-extrabold text-gray-500";
        actionEl.textContent = "Alles ausgeglichen.";
        execBtn.disabled = true;
        execBtn.className = "w-full py-3 bg-gray-300 text-gray-500 font-bold rounded-lg shadow cursor-not-allowed";
    }
}



async function executeSettlement() {
    if (!activeSettlementPartnerId) return;
    if (!confirm("Wirklich verrechnen? Es werden nur fällige Einträge verrechnet.")) return;
    const btn = document.getElementById('btn-execute-settlement');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        let partnerName = "";
        let net = 0;
        const involvedLinks = [];
        const involvedDocs = [];
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Arrays für Datums-Sammlung
        const allStartDates = [];
        const allDeadlines = [];

        // 1. Daten sammeln
        allPayments.forEach(p => {
            // Nur offene Posten
            if (p.status !== 'open' && p.status !== 'pending_approval') return;

            // Nur meine eigenen Einträge
            if (p.createdBy !== currentUser.mode) return;

            // Zukünftige Zahlungen ignorieren
            if (p.startDate) {
                const start = new Date(p.startDate);
                start.setHours(0, 0, 0, 0);
                if (start > today) return; 
            }

            let pIdCheck = (p.debtorId === currentUser.mode) ? p.creditorId : p.debtorId;
            let pNameCheck = (p.debtorId === currentUser.mode) ? p.creditorName : p.debtorName;
            if (!pIdCheck) pIdCheck = "MANUAL_" + pNameCheck;

            if (pIdCheck === activeSettlementPartnerId) {
                partnerName = pNameCheck;
                involvedDocs.push(p);

                const short = p.id.slice(-4).toUpperCase();
                involvedLinks.push(`[LINK:${p.id}:#${short}]`);

                const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);
                
                if (p.debtorId === currentUser.mode) net -= amount; 
                else net += amount;

                // --- DATEN SAMMELN ---
                if (p.startDate) allStartDates.push(p.startDate);
                if (p.deadline) allDeadlines.push(p.deadline);
            }
        });

        // --- SORTIEREN ---
        allStartDates.sort();
        allDeadlines.sort();

        // Ergebnisse
        let finalStartDate = allStartDates.length > 0 ? allStartDates[0] : new Date().toISOString().split('T')[0];
        let finalDeadline = allDeadlines.length > 0 ? allDeadlines[0] : null;

        // 2. Neue ID vorbereiten (Falls ein Rest bleibt)
        let newDocRef = null;
        let newLinkCode = "";

        if (Math.abs(net) > 0.01) {
            newDocRef = doc(paymentsRef);
            const newShort = newDocRef.id.slice(-4).toUpperCase();
            newLinkCode = `[LINK:${newDocRef.id}:#${newShort}]`;
        }

        // 3. Alte Einträge aktualisieren
        involvedDocs.forEach(p => {
            const ref = doc(paymentsRef, p.id);
            const currentRest = parseFloat(p.remainingAmount).toFixed(2);

            let logInfo = "";
            if (newDocRef) {
                logInfo = `Verrechnet (${currentRest} €). Restbetrag auf Eintrag ${newLinkCode} übertragen.`;
            } else {
                logInfo = `Verrechnet und vollständig glattgestellt (${currentRest} €).`;
            }

            batch.update(ref, {
                status: 'settled', 
                remainingAmount: 0, 
                history: [...(p.history || []), {
                    date: new Date(),
                    action: 'settled',
                    user: currentUser.displayName,
                    info: logInfo
                }]
            });
        });

        // 4. Neuen Eintrag erstellen
        if (newDocRef) {
            const isCreditor = net > 0; 
            const absAmount = Math.abs(net);
            const realPartnerId = activeSettlementPartnerId.startsWith("MANUAL_") ? null : activeSettlementPartnerId;

            const logText = `Restbetrag (${absAmount.toFixed(2)} €) aus Verrechnung von: ${involvedLinks.join(', ')}`;

            const newData = {
                title: "Restbetrag nach Verrechnung",
                amount: absAmount,
                remainingAmount: absAmount,
                isTBD: false,
                // Sortierte Daten verwenden
                startDate: finalStartDate,
                deadline: finalDeadline, 
                invoiceNr: "",
                orderNr: "",
                notes: `Automatisch erstellt aus Bilanzierung mit ${partnerName}.`,
                type: 'debt',
                status: 'open',
                categoryId: 'cat_misc',
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode,
                debtorId: isCreditor ? realPartnerId : currentUser.mode,
                debtorName: isCreditor ? partnerName : currentUser.displayName,
                creditorId: isCreditor ? currentUser.mode : realPartnerId,
                creditorName: isCreditor ? currentUser.displayName : partnerName,
                involvedUserIds: [currentUser.mode, ...(realPartnerId ? [realPartnerId] : [])],
                history: [{
                    date: new Date(),
                    action: 'created_settlement',
                    user: currentUser.displayName,
                    info: logText
                }]
            };
            batch.set(newDocRef, newData);
        }

        await batch.commit();
        alertUser("Erfolgreich verrechnet!", "success");
        closeSettlementModal();

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    } finally {
        setButtonLoading(btn, false);
    }
}









function closeSettlementModal() {
    document.getElementById('settlementModal').classList.add('hidden');
    document.getElementById('settlementModal').style.display = 'none';
    activeSettlementPartnerId = null;
}

// --- DETAIL ANSICHT ---
// WICHTIG: Globale Zuweisung für HTML onclick
window.editPayment = function (id) {
    const p = allPayments.find(x => x.id === id);
    if (p) {
        closeDetailModal();
        openCreateModal(p);
    }
};

// NEU: Archivieren statt Löschen
window.archivePayment = async function (id) {
    if (!confirm("Diesen Eintrag ins Archiv verschieben? Er ist dann nicht mehr in der Hauptliste sichtbar.")) return;

    try {
        const p = allPayments.find(x => x.id === id);
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', id);

        await updateDoc(ref, {
            status: 'archived', // Statusänderung statt Löschen
            archivedAt: serverTimestamp(),
            archivedBy: currentUser.displayName,
            history: [...(p.history || []), {
                date: new Date(),
                action: 'archived',
                user: currentUser.displayName,
                info: "Eintrag ins Archiv verschoben."
            }]
        });

        alertUser("Eintrag archiviert.", "success");
        closeDetailModal();
    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Archivieren.", "error");
    }
};

function openPaymentDetail(id, isRefresh = false) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;
    currentDetailPaymentId = id;

    // --- FIX PUNKT 1: Modal sichtbar machen, auch wenn man in Settings ist ---
    const modal = document.getElementById('paymentDetailModal');
    if (modal && modal.parentElement !== document.body) {
        // Wir hängen das Modal direkt an den Body, damit es nicht von
        // ausgeblendeten Eltern-Ansichten (wie der Hauptliste) versteckt wird.
        document.body.appendChild(modal);
    }
    // ------------------------------------------------------------------------

    renderDetailContent(p, isRefresh);
};
window.openPaymentDetail = openPaymentDetail;



function renderDetailContent(p, isRefresh) {
    const modal = document.getElementById('paymentDetailModal');
    const content = document.getElementById('payment-detail-content');
    const actions = document.getElementById('payment-detail-actions');
    const partialForm = document.getElementById('partial-payment-form');
    
    const oldSection = document.getElementById('transaction-history-section');
    if (oldSection) oldSection.classList.add('hidden');

    if (!modal || !content || !actions) return;

    const closeBtn = document.getElementById('btn-close-detail-modal');
    if(closeBtn) closeBtn.onclick = closeDetailModal;

    // Helper für Links
    const parseLinks = (text) => {
        if (!text) return "";
        return text.replace(/\[LINK:([^:]+):([^\]]+)\]/g, (match, id, label) => {
            return `<span class="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-bold" onclick="openPaymentDetail('${id}'); event.stopPropagation();">${label}</span>`;
        });
    };

    // --- 1. SPEZIAL-ANSICHT FÜR GUTHABEN (NUR LESEN) ---
    if (p.type === 'credit') {
        const dateStr = new Date(p.createdAt?.toDate ? p.createdAt.toDate() : p.createdAt).toLocaleDateString();
        const logContentId = "log-content-" + p.id;
        const logIconId = "log-icon-" + p.id;

        content.innerHTML = `
            <div class="p-6 bg-purple-50 border border-purple-100 rounded-xl text-center mb-6 shadow-inner">
                <div class="inline-flex items-center justify-center w-12 h-12 bg-purple-100 text-purple-600 rounded-full mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h2 class="text-2xl font-bold text-purple-900 mb-1 leading-tight">${p.title}</h2>
                <p class="text-xs text-purple-600 uppercase font-bold tracking-wider mb-4">Guthaben-Eintrag</p>
                
                <div class="text-5xl font-black text-purple-800 mb-2">${parseFloat(p.remainingAmount).toFixed(2)} €</div>
                <p class="text-xs text-purple-400">ID: #${p.id.slice(-4).toUpperCase()} • Erstellt am ${dateStr}</p>
            </div>

            <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded-r-lg">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-yellow-800 font-bold">Information</p>
                        <p class="text-sm text-yellow-700 mt-1">
                            Dies ist ein reiner Guthaben-Posten. Er wird automatisch verwendet, wenn Zahlungen getätigt werden.
                            <br><br>
                            Bearbeitung nur über: <strong>Einstellungen &gt; Guthaben</strong>
                        </p>
                    </div>
                </div>
            </div>

            <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div class="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition" onclick="document.getElementById('${logContentId}').classList.toggle('hidden'); document.getElementById('${logIconId}').classList.toggle('rotate-180');">
                    <p class="text-xs font-bold text-gray-600 uppercase flex items-center gap-2">
                        System-Log (Verwendung)
                    </p>
                    <svg id="${logIconId}" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
                <div id="${logContentId}" class="hidden p-2 border-t border-gray-100 max-h-60 overflow-y-auto bg-gray-50 text-xs text-gray-500">
                    ${(p.history || []).slice().reverse().map(h => {
                        const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
                        const dStr = d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                        return `<div class="mb-2 border-b border-gray-200 pb-1 last:border-0"><span class="font-bold text-gray-700">${h.user || 'System'}</span> <span class="text-[10px] text-gray-400 ml-1">(${dStr})</span><div class="mt-0.5 leading-relaxed">${parseLinks(h.info)}</div></div>`;
                    }).join('')}
                </div>
            </div>
        `;
        
        actions.innerHTML = ''; 
        return;
    }

    // --- 2. NORMALE ZAHLUNGS-ANSICHT ---

    const iAmCreator = p.createdBy === currentUser.mode;
    const iAmDebtor = p.debtorId === currentUser.mode;
    const iAmCreditor = p.creditorId === currentUser.mode;
    const shortId = p.id.slice(-4).toUpperCase();

    const isArchivedOrTrash = p.status === 'archived' || p.status === 'trash';

    // Rechte ermitteln
    let myRights = 'none';
    if (iAmCreator) {
        myRights = 'owner';
    } else if (p.accessRights && p.accessRights[currentUser.mode]) {
        myRights = p.accessRights[currentUser.mode].rights;
    }

    // Rechte Text Label
    let rightsLabel = "";
    let rightsColor = "";
    if (myRights === 'view') { rightsLabel = "Nur Leserechte"; rightsColor = "bg-gray-200 text-gray-600"; }
    else if (myRights === 'transact_approve') { rightsLabel = "Zahlen (mit Genehmigung)"; rightsColor = "bg-yellow-100 text-yellow-800"; }
    else if (myRights === 'transact_full') { rightsLabel = "Vollzugriff"; rightsColor = "bg-green-100 text-green-800"; }
    else if (myRights === 'owner') { rightsLabel = "Ersteller (Admin)"; rightsColor = "bg-indigo-100 text-indigo-800"; }

    // Guthaben berechnen
    let availableCredit = 0;
    const creditEntries = allPayments.filter(cp => 
        cp.type === 'credit' && 
        cp.status === 'open' &&
        cp.creditorId === p.debtorId && 
        cp.debtorId === p.creditorId
    );
    creditEntries.forEach(c => availableCredit += parseFloat(c.remainingAmount));
    availableCredit = Math.round(availableCredit * 100) / 100;

    let catName = "Diverse";
    const sysCat = SYSTEM_CATEGORIES.find(c => c.id === p.categoryId);
    if (sysCat) catName = sysCat.name;
    else {
        const customCat = allCategories.find(c => c.id === p.categoryId);
        if (customCat) catName = customCat.name;
    }

    const typeLabels = { 'debt': 'Schuld / Forderung', 'transfer': 'Umbuchung', 'credit': 'Guthaben' };
    const typeName = typeLabels[p.type] || 'Transaktion';

    // Deadline & Blinken
    let deadlineHtml = '';
    const blinkStyle = `
    <style>
        @keyframes urgent-flash-box {
            0%, 100% { background-color: #fee2e2; border-color: #ef4444; color: #b91c1c; }
            50% { background-color: #fef2f2; border-color: #fca5a5; color: #ef4444; }
        }
        .urgent-blink-box {
            animation: urgent-flash-box 1s infinite; 
            border: 1px solid #ef4444 !important;
            font-weight: bold;
        }
    </style>`;

    if (p.deadline && p.status === 'open') {
        const deadlineDate = new Date(p.deadline);
        deadlineDate.setHours(23, 59, 59, 999);
        const now = new Date();
        const diffMs = deadlineDate - now;
        
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const dateStr = deadlineDate.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

        let timeText = "";
        let boxClass = "bg-gray-200 text-gray-700"; 

        if (diffMs < 0) {
            timeText = "ABGELAUFEN";
            boxClass = "bg-red-600 text-white border border-red-700 font-bold";
        } else {
            timeText = `${diffDays}T ${diffHours}h`;
            if (diffDays < 3) {
                boxClass = "urgent-blink-box bg-red-50"; 
            } else if (diffDays < 7) {
                boxClass = "bg-yellow-100 text-yellow-800 border border-yellow-300 font-bold";
            } else {
                boxClass = "bg-gray-100 text-gray-600 border border-gray-300";
            }
        }

        deadlineHtml = `
            <span class="px-2 py-1 rounded text-xs flex items-center gap-1 ${boxClass}">
                <span class="font-normal text-[10px] opacity-80">Frist: ${dateStr}</span>
                <span class="font-bold border-l border-current pl-1 ml-1">${timeText}</span>
            </span>
        `;
    }

    let topButtonsHTML = '';
    const btnHistory = `<button onclick="openHistoryModal('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-bold shadow-sm transition transform hover:scale-105 mr-auto">🌳 Verlauf</button>`;
    const btnShare = `<button onclick="openShareModal('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200 text-sm font-bold shadow-sm ml-2">🔒 Rechte</button>`;

    if (iAmCreator) {
        let standardActions = '';
        if (!p.isTBD && !isArchivedOrTrash) {
            standardActions += `
            <button onclick="openAdjustAmountModal('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-1"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg>
                Korrektur
            </button>`;
            
            if (p.status === 'open') {
                standardActions += `
                <button onclick="openSplitModal('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm font-bold ml-2">Aufteilen</button>`;
            }
        }

        let archiveButton = '';
        const isFinishStatus = p.status === 'paid' || p.status === 'settled' || p.status === 'cancelled' || p.status === 'closed';
        if (isFinishStatus && !isArchivedOrTrash) {
            archiveButton = `
            <button onclick="archivePayment('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 text-sm font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                Archivieren
            </button>`;
        }

        topButtonsHTML = `
        <div class="flex flex-wrap justify-end gap-2 mb-4 no-print border-b pb-2 items-center">
            ${btnHistory}
            ${btnShare}
            ${standardActions}
            ${archiveButton}
        </div>`;
    } else {
        topButtonsHTML = `
        <div class="flex justify-start gap-2 mb-4 no-print border-b pb-2">
            ${btnHistory}
        </div>`;
    }

    // Positionen HTML aufbauen
    let positionsHtml = '';
    const hasCurrentPos = p.positions && p.positions.length > 0;
    const hasOriginalPos = p.originalPositions && p.originalPositions.length > 0;
    const hasDeletedItems = p.deletedItems && p.deletedItems.length > 0;

    if (hasCurrentPos || hasOriginalPos || hasDeletedItems) {
        let rowsHtml = '';
        const tempNewPositions = p.positions ? [...p.positions] : [];
        const originalList = p.originalPositions || [];
        const deletedIntermediate = p.deletedItems || [];

        originalList.forEach(oldPos => {
            const matchIndex = tempNewPositions.findIndex(np => np.name === oldPos.name);
            if (matchIndex !== -1) {
                const newPos = tempNewPositions[matchIndex];
                tempNewPositions.splice(matchIndex, 1);
                const oldPrice = parseFloat(oldPos.price);
                const newPrice = parseFloat(newPos.price);
                if (Math.abs(oldPrice - newPrice) > 0.01) {
                    rowsHtml += `
                    <div class="flex justify-between text-xs border-b border-gray-100 py-1 last:border-0 bg-yellow-50/50 rounded px-1">
                        <span class="text-gray-700 font-medium">${newPos.name}</span>
                        <div><span class="text-gray-400 line-through mr-1 text-[10px]">${oldPrice.toFixed(2)}</span><span class="font-mono font-bold text-indigo-700">${newPrice.toFixed(2)} €</span></div>
                    </div>`;
                } else {
                    rowsHtml += `
                    <div class="flex justify-between text-xs border-b border-gray-100 py-1 last:border-0 px-1">
                        <span class="text-gray-600">${newPos.name}</span><span class="font-mono font-medium text-gray-800">${newPrice.toFixed(2)} €</span>
                    </div>`;
                }
            } else {
                rowsHtml += `
                <div class="flex justify-between text-xs border-b border-gray-100 py-1 last:border-0 opacity-60 px-1 bg-red-50/30">
                    <span class="text-red-400 line-through decoration-red-300">${oldPos.name}</span><span class="font-mono text-red-300 line-through decoration-red-300">${parseFloat(oldPos.price).toFixed(2)} €</span>
                </div>`;
            }
        });

        tempNewPositions.forEach(newPos => {
            rowsHtml += `
            <div class="flex justify-between text-xs border-b border-gray-100 py-1 last:border-0 bg-green-50/30 rounded px-1">
                <span class="text-gray-800 font-bold">${newPos.name} <span class="text-[9px] text-green-600 font-normal">(Neu)</span></span><span class="font-mono font-bold text-gray-800">${parseFloat(newPos.price).toFixed(2)} €</span>
            </div>`;
        });

        deletedIntermediate.forEach(delPos => {
            rowsHtml += `
            <div class="flex justify-between text-xs border-b border-gray-100 py-1 last:border-0 opacity-50 px-1 bg-gray-50">
                <span class="text-gray-400 line-through decoration-gray-300">${delPos.name} <span class="text-[9px] font-normal">(Verworfen)</span></span><span class="font-mono text-gray-300 line-through decoration-gray-300">${parseFloat(delPos.price).toFixed(2)} €</span>
            </div>`;
        });

        const posContentId = "pos-content-" + p.id;
        const posIconId = "pos-icon-" + p.id;
        const countDisplay = (p.positions ? p.positions.length : 0);

        positionsHtml = `
            <div class="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
                <div class="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition" onclick="document.getElementById('${posContentId}').classList.toggle('hidden'); document.getElementById('${posIconId}').classList.toggle('rotate-180');">
                    <p class="text-xs font-bold text-gray-600 uppercase flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        Postenaufstellung (${countDisplay})
                    </p>
                    <svg id="${posIconId}" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
                <div id="${posContentId}" class="hidden p-3 pt-0 border-t border-gray-100">
                    <div class="mt-2 space-y-1">${rowsHtml}</div>
                    <div class="flex justify-between text-sm font-bold pt-2 border-t border-gray-300 mt-2"><span>Summe (Aktuell)</span><span>${parseFloat(p.amount).toFixed(2)} €</span></div>
                </div>
            </div>
        `;
    }

    let priceDisplayHtml = '';
    let paidOrSplitText = '';

    if (p.isTBD) {
        priceDisplayHtml = `<span class="text-3xl text-orange-600 font-bold">Betrag unbekannt</span>`;
    } else {
        let displayAmount = parseFloat(p.remainingAmount);
        const showStrike = (p.originalAmount !== undefined && p.originalAmount !== null && Math.abs(p.originalAmount - p.amount) > 0.01);
        
        if (p.status === 'closed' || p.status === 'settled' || p.status === 'paid') {
            displayAmount = 0;
        }

        if (showStrike) {
            priceDisplayHtml = `
                <span class="text-xl text-gray-400 line-through mr-2 decoration-red-500 decoration-2">${parseFloat(p.originalAmount).toFixed(2)} €</span>
                <span class="text-5xl font-extrabold text-gray-800">${displayAmount.toFixed(2)} €</span>
            `;
        } else {
            priceDisplayHtml = `<span class="text-5xl font-extrabold text-gray-800">${displayAmount.toFixed(2)} €</span>`;
        }

        const paidAmount = p.amount - parseFloat(p.remainingAmount); 
        const hasSplit = p.history && p.history.some(h => h.action === 'split_source');
        
        if (p.status === 'closed') {
            paidOrSplitText = `<p class="text-xs text-orange-600 font-semibold mt-1">WEG-Fusiert: ${parseFloat(p.amount).toFixed(2)} €</p>`;
        } else if (p.status === 'settled') {
            paidOrSplitText = `<p class="text-xs text-orange-600 font-semibold mt-1">WEG-Verrechnet: ${parseFloat(p.amount).toFixed(2)} €</p>`;
        } else {
            if (hasSplit) {
                paidOrSplitText = `<p class="text-xs text-orange-600 font-semibold mt-1">WEG-Übertragen: ${paidAmount.toFixed(2)} €</p>`;
            } else if (paidAmount > 0.01) {
                paidOrSplitText = `<p class="text-xs text-green-600 font-semibold mt-1">Bezahlt: ${paidAmount.toFixed(2)} €</p>`;
            }
        }
    }

    const txContentId = "tx-content-" + p.id;
    const txIconId = "tx-icon-" + p.id;
    const logContentId = "log-content-" + p.id;
    const logIconId = "log-icon-" + p.id;

    content.innerHTML = `
        ${blinkStyle}
        
        ${rightsLabel ? `<div class="mb-2 inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${rightsColor}">${rightsLabel}</div>` : ''}

        ${topButtonsHTML}
        <h2 class="text-2xl font-bold text-gray-800 mb-1 leading-tight">${p.title}</h2>
        
        <div class="flex flex-wrap gap-2 mb-4 mt-2 items-center">
            <span class="px-2 py-1 bg-gray-800 text-white rounded text-xs font-mono tracking-wider">#${shortId}</span>
            ${p.type === 'credit' ? '<span class="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-bold">Guthaben</span>' : ''}
            <span class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">Start: ${new Date(p.startDate || p.createdAt.toDate()).toLocaleDateString()}</span>
            ${deadlineHtml}
        </div>
        
        <div class="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-lg border">
            <div><p class="text-xs font-bold text-gray-500 uppercase">Schuldner</p><p class="text-lg font-semibold text-gray-900 break-words">${p.debtorName}</p></div>
            <div class="text-right"><p class="text-xs font-bold text-gray-500 uppercase">Gläubiger</p><p class="text-lg font-semibold text-gray-900 break-words">${p.creditorName}</p></div>
        </div>

        <div class="grid grid-cols-2 gap-y-2 gap-x-4 mb-6 p-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-700">
            <div><span class="font-bold text-gray-500">Kategorie:</span> <br>${catName}</div>
            <div><span class="font-bold text-gray-500">Typ:</span> <br>${typeName}</div>
            ${p.invoiceNr ? `<div><span class="font-bold text-gray-500">Rechnungs-Nr.:</span> <br>${p.invoiceNr}</div>` : ''}
            ${p.orderNr ? `<div><span class="font-bold text-gray-500">Bestell-Nr.:</span> <br>${p.orderNr}</div>` : ''}
        </div>
        
        <div class="mb-4 text-center p-4 border-2 border-dashed border-gray-200 rounded-xl ${p.remainingAmount <= 0.01 && !p.isTBD ? 'bg-green-50 border-green-300' : ''}">
            <p class="text-sm text-gray-500 uppercase font-bold tracking-wide">
                Offener Betrag 
                ${!p.isTBD ? `<span class="text-xs text-gray-400 font-normal ml-1 normal-case">(von gesamt ${parseFloat(p.amount).toFixed(2)} €)</span>` : ''}
            </p>
            
            <div class="mt-1 flex justify-center items-baseline">
                ${priceDisplayHtml}
            </div>
            
            ${p.isTBD && iAmCreator ? `
                <div class="mt-4 pt-2 border-t border-gray-100">
                    <button onclick="resolveTBD('${p.id}')" class="w-full py-3 bg-orange-500 text-white font-bold text-lg rounded-lg shadow-md hover:bg-orange-600 transition flex items-center justify-center gap-2 animate-pulse">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        Betrag jetzt nachtragen
                    </button>
                </div>
            ` : ''}
            
            ${paidOrSplitText}
        </div>

        ${positionsHtml}

        ${p.notes ? `<div class="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700"><strong>Notiz:</strong><br>${p.notes}</div>` : ''}
        
        <div id="internal-transactions-wrapper" class="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden ${(!p.transactions || p.transactions.length === 0) ? 'hidden' : ''}">
            <div class="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition" onclick="document.getElementById('${txContentId}').classList.toggle('hidden'); document.getElementById('${txIconId}').classList.toggle('rotate-180');">
                <p class="text-xs font-bold text-gray-600 uppercase flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Zahlungshistorie
                </p>
                <svg id="${txIconId}" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
            <div id="${txContentId}" class="hidden p-2 border-t border-gray-100">
                <div id="internal-tx-list" class="space-y-2"></div>
            </div>
        </div>

        <div class="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
            <div class="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition" onclick="document.getElementById('${logContentId}').classList.toggle('hidden'); document.getElementById('${logIconId}').classList.toggle('rotate-180');">
                <p class="text-xs font-bold text-gray-600 uppercase flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    System-Log
                </p>
                <svg id="${logIconId}" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
            <div id="${logContentId}" class="hidden p-2 border-t border-gray-100 max-h-60 overflow-y-auto bg-gray-50 text-xs text-gray-500">
                ${(p.history || []).slice().reverse().map(h => {
                    const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
                    const dateStr = d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                    return `<div class="mb-2 border-b border-gray-200 pb-1 last:border-0"><span class="font-bold text-gray-700">${h.user || 'System'}</span> <span class="text-[10px] text-gray-400 ml-1">(${dateStr})</span><div class="mt-0.5 leading-relaxed">${parseLinks(h.info)}</div></div>`;
                }).join('')}
            </div>
        </div>
    `;

    if (p.transactions && p.transactions.length > 0) {
        const internalList = document.getElementById('internal-tx-list');
        
        let displayList = p.transactions.map((tx, idx) => ({ ...tx, originalIndex: idx }));
        displayList.sort((a, b) => {
            const dA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
            const dB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
            return dB - dA;
        });

        const renderTxSubset = (limit) => {
            internalList.innerHTML = '';
            const visibleItems = displayList.slice(0, limit);

            visibleItems.forEach((tx) => {
                const originalIndex = tx.originalIndex;
                const isPending = tx.approvalPending === true;
                const canDelete = iAmCreator && !isArchivedOrTrash; 
                
                const bgClass = isPending ? "bg-yellow-50 border-yellow-300" : "bg-white";
                const txDateObj = tx.date?.toDate ? tx.date.toDate() : new Date(tx.date);
                const dateStr = txDateObj.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                const userName = tx.user || 'Unbekannt';
                const infoText = parseLinks(tx.info || ''); 
                let extraMeta = "";
                if (tx.paymentMethodName) extraMeta += ` • 🏦 ${tx.paymentMethodName}`;
                if (tx.customDate) {
                     const cd = new Date(tx.customDate).toLocaleDateString();
                     extraMeta += ` • 📅 ${cd}`;
                }
                let statusBadge = isPending ? `<span class="ml-2 text-[9px] bg-yellow-200 text-yellow-800 px-1 rounded animate-pulse">⏳ Wartet</span>` : '';

                let actionButtons = "";
                if (isPending && iAmCreator && !isArchivedOrTrash) {
                    actionButtons = `<div class="flex gap-1"><button class="bg-green-500 text-white p-1 rounded hover:bg-green-600 btn-approve" data-idx="${originalIndex}">✔</button><button class="bg-red-500 text-white p-1 rounded hover:bg-red-600 btn-reject" data-idx="${originalIndex}">✖</button></div>`;
                } else if (canDelete && !isPending) {
                    actionButtons = `<button class="text-red-400 hover:text-red-600 text-xs font-bold delete-tx-btn px-2 py-1 bg-red-50 rounded border border-red-100" data-idx="${originalIndex}">Löschen</button>`;
                }

                const row = document.createElement('div');
                row.className = `flex justify-between items-center p-2 rounded border shadow-sm ${bgClass}`;
                row.innerHTML = `
                    <div class="flex flex-col">
                        <div class="flex items-center gap-2"><span class="font-bold text-green-700">+ ${parseFloat(tx.amount).toFixed(2)} €</span><span class="text-xs text-gray-500 italic">(${tx.type === 'credit_usage' ? 'Guthaben' : 'Zahlung'})</span>${statusBadge}</div>
                        <span class="text-[10px] text-gray-400">von <strong>${userName}</strong> am ${dateStr}${extraMeta}</span>
                        ${infoText ? `<span class="text-[10px] text-gray-500 mt-0.5 block">${infoText}</span>` : ''}
                    </div>
                    ${actionButtons}
                `;
                
                if (row.querySelector('.delete-tx-btn')) row.querySelector('.delete-tx-btn').onclick = () => deleteTransaction(p.id, originalIndex);
                if (row.querySelector('.btn-approve')) row.querySelector('.btn-approve').onclick = () => approveTransaction(p.id, originalIndex);
                if (row.querySelector('.btn-reject')) row.querySelector('.btn-reject').onclick = () => rejectTransaction(p.id, originalIndex);
                internalList.appendChild(row);
            });

            if (displayList.length > limit) {
                const remaining = displayList.length - limit;
                const controlsDiv = document.createElement('div');
                controlsDiv.className = "flex gap-2 justify-center pt-2 pb-1";
                const btnMore = document.createElement('button');
                btnMore.className = "text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 transition bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm";
                btnMore.textContent = "+ 3 ältere laden";
                btnMore.onclick = (e) => { e.stopPropagation(); renderTxSubset(limit + 3); };
                
                const btnAll = document.createElement('button');
                btnAll.className = "text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm";
                btnAll.textContent = `Alle anzeigen (${remaining} weitere)`;
                btnAll.onclick = (e) => { e.stopPropagation(); renderTxSubset(displayList.length); };

                controlsDiv.appendChild(btnMore);
                controlsDiv.appendChild(btnAll);
                internalList.appendChild(controlsDiv);
            }
        };
        renderTxSubset(3);
    }

    actions.innerHTML = '';
    if (partialForm) partialForm.remove(); 

    // BUG 1 FIX: Nur wenn nicht 'view'-Recht und nicht archiviert
    const canAct = (iAmDebtor || iAmCreditor || iAmCreator) && (p.status === 'open' || p.status === 'pending_approval') && !isArchivedOrTrash && myRights !== 'view';

    if (canAct) {
        const currentRest = p.isTBD ? 0 : parseFloat(p.remainingAmount);
        const btnLabel = p.isTBD ? "Vorauszahlung / Guthaben" : "Transaktion tätigen";
        
        const initialBtn = document.createElement('button');
        initialBtn.className = "w-full py-4 bg-indigo-600 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 mb-2";
        initialBtn.innerHTML = `<span>${btnLabel}</span>`;
        
        const paymentInterface = document.createElement('div');
        paymentInterface.className = "w-full bg-gray-50 p-2 rounded-lg border border-gray-200 shadow-inner mt-2 hidden";
        
        initialBtn.onclick = () => {
            initialBtn.remove();
            paymentInterface.classList.remove('hidden');
        };
        
        actions.appendChild(initialBtn);
        actions.appendChild(paymentInterface);

        let accountOptions = '<option value="">- Standard -</option>';
        if (allAccounts.length > 0) {
            allAccounts.forEach(acc => {
                const label = acc.details ? `${acc.name} (${acc.details})` : acc.name;
                accountOptions += `<option value="${acc.id}">${label}</option>`;
            });
        }

        // --- FIX: Guthaben-Tabs nur anzeigen, wenn man der Ersteller ist ---
        let tabsHtml = '';
        let creditWarningHtml = '';

        if (iAmCreator && availableCredit > 0) {
            // Nur der Ersteller darf Guthaben auswählen
            tabsHtml = `
            <div class="flex gap-2 mb-3 p-1 bg-gray-200 rounded-lg">
                <button id="tab-mode-money" class="flex-1 py-1.5 rounded-md text-xs font-bold transition bg-white text-indigo-700 shadow-sm">💶 Geldzahlung</button>
                <button id="tab-mode-credit" class="flex-1 py-1.5 rounded-md text-xs font-bold transition text-gray-500 hover:text-gray-700">💎 Guthaben (${availableCredit.toFixed(2)}€)</button>
            </div>`;
        } else if (!iAmCreator) {
            // Eingeladene sehen nur den Hinweis, dass sie Guthaben nicht verrechnen können
            creditWarningHtml = `
            <div class="mb-3 p-2 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-700">
                <strong>Hinweis:</strong> Guthaben kann hier nicht direkt eingelöst werden. Bitte kontaktiere den Gläubiger, damit er dies für dich verrechnet.
            </div>`;
        }

        paymentInterface.innerHTML = `
            ${tabsHtml}
            ${creditWarningHtml}
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1" id="pay-label">${p.isTBD ? 'Vorauszahlung leisten' : 'Zahlung erfassen'}</label>
            
            <div class="flex gap-2 items-stretch mb-3">
                <div class="relative flex-1">
                    <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xl">€</span>
                    <input type="number" id="smart-payment-amount" 
                        class="w-full pl-6 pr-1 h-16 border-2 border-gray-300 rounded-xl font-black text-2xl text-gray-800 focus:border-indigo-500 focus:ring-0 text-center" 
                        step="0.01" placeholder="0.00" value="">
                </div>
                <button id="btn-smart-pay" 
                    class="flex-1 h-16 bg-gray-400 text-white rounded-xl shadow-md transition flex flex-col justify-center items-center leading-tight px-1 cursor-not-allowed">
                    <span id="btn-smart-pay-text" class="font-black text-base uppercase tracking-wide">Betrag eingeben</span>
                    <span id="btn-smart-pay-subtext" class="text-[10px] font-medium opacity-90">...</span>
                </button>
            </div>

            <div class="border border-gray-200 rounded-lg bg-white">
                <button class="w-full flex justify-between items-center p-2 bg-gray-100 text-xs font-bold text-gray-600 uppercase rounded-t-lg" onclick="document.getElementById('pay-advanced-area').classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-180');">
                    <span>Erweiterte Infos (Optional)</span>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                <div id="pay-advanced-area" class="hidden p-3 space-y-3">
                    
                    <div class="flex gap-3">
                        <div class="flex-grow">
                            <label class="block text-[10px] font-bold text-gray-500 mb-1">Zahlungsvariante</label>
                            <select id="pay-method-select" class="w-full p-2 border rounded text-sm bg-white text-gray-700">${accountOptions}</select>
                        </div>
                        <div class="w-1/3 min-w-[120px]">
                            <label class="block text-[10px] font-bold text-gray-500 mb-1">Datum</label>
                            <input type="date" id="pay-date-input" class="w-full p-2 border rounded text-sm bg-white text-gray-700" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                    </div>

                    <div>
                        <label class="block text-[10px] font-bold text-gray-500 mb-1">Notiz</label>
                        <textarea id="pay-note-input" rows="2" class="w-full p-2 border rounded text-sm" placeholder="Zusatzinfo..."></textarea>
                    </div>
                </div>
            </div>
        `;
        
        const input = document.getElementById('smart-payment-amount');
        const payBtn = document.getElementById('btn-smart-pay');
        const payText = document.getElementById('btn-smart-pay-text');
        const paySubText = document.getElementById('btn-smart-pay-subtext');
        const tabMoney = document.getElementById('tab-mode-money');
        const tabCredit = document.getElementById('tab-mode-credit');
        const advancedArea = document.getElementById('pay-advanced-area').parentElement; 
        
        let currentMode = 'money';
        const epsilon = 0.001;

        if (tabMoney && tabCredit) {
            const switchMode = (mode) => {
                currentMode = mode;
                input.value = '';
                input.dispatchEvent(new Event('input')); 

                if (mode === 'money') {
                    tabMoney.className = "flex-1 py-1.5 rounded-md text-xs font-bold transition bg-white text-indigo-700 shadow-sm";
                    tabCredit.className = "flex-1 py-1.5 rounded-md text-xs font-bold transition text-gray-500 hover:text-gray-700";
                    document.getElementById('pay-label').textContent = p.isTBD ? "Vorauszahlung leisten" : "Zahlung erfassen";
                    advancedArea.style.display = 'block';
                } else {
                    tabMoney.className = "flex-1 py-1.5 rounded-md text-xs font-bold transition text-gray-500 hover:text-gray-700";
                    tabCredit.className = "flex-1 py-1.5 rounded-md text-xs font-bold transition bg-purple-100 text-purple-800 shadow-sm border border-purple-200";
                    document.getElementById('pay-label').textContent = "Guthaben einlösen";
                    advancedArea.style.display = 'none';
                }
            };
            tabMoney.onclick = () => switchMode('money');
            tabCredit.onclick = () => switchMode('credit');
        }

        input.oninput = () => {
            const valStr = input.value;
            const val = parseFloat(valStr);
            
            payBtn.className = "flex-1 h-16 text-white rounded-xl shadow-md transition flex flex-col justify-center items-center leading-tight px-1";

            if (!valStr || isNaN(val)) {
                payText.textContent = "Betrag eingeben";
                paySubText.textContent = "...";
                payBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
                return;
            }

            if (currentMode === 'money') {
                if (p.isTBD) {
                    payText.textContent = "Vorauszahlung";
                    paySubText.textContent = "buchen";
                    payBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                } else {
                    const diff = currentRest - val;
                    if (diff < -epsilon) { 
                        const over = Math.abs(diff).toFixed(2);
                        payText.textContent = `Überzahlung!`;
                        paySubText.textContent = `+ ${over} € Guthaben/Tip`;
                        payBtn.classList.add('bg-orange-500', 'hover:bg-orange-600');
                    } else if (Math.abs(diff) < epsilon) { 
                        payText.textContent = "Alles zahlen";
                        paySubText.textContent = "und schließen";
                        payBtn.classList.add('bg-green-600', 'hover:bg-green-700');
                    } else { 
                        payText.textContent = "Teilbetrag";
                        paySubText.textContent = `Rest: ${diff.toFixed(2)} €`;
                        payBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
                    }
                }
            } else {
                if (val > availableCredit + epsilon) {
                    payText.textContent = "Zu wenig Guthaben";
                    paySubText.textContent = `Max: ${availableCredit.toFixed(2)} €`;
                    payBtn.classList.add('bg-gray-500', 'cursor-not-allowed');
                } else if (!p.isTBD && val > currentRest + epsilon) {
                    payText.textContent = "Betrag zu hoch";
                    paySubText.textContent = `Schuld nur ${currentRest.toFixed(2)} €`;
                    payBtn.classList.add('bg-gray-500', 'cursor-not-allowed');
                } else {
                    payText.textContent = "Guthaben einlösen";
                    paySubText.textContent = `-${val.toFixed(2)} € vom Konto`;
                    payBtn.classList.add('bg-purple-600', 'hover:bg-purple-700');
                }
            }
        };

        payBtn.onclick = () => {
            if (payBtn.classList.contains('cursor-not-allowed')) return;
            const val = parseFloat(input.value);

            if (currentMode === 'money') {
                const action = (p.isTBD || val < currentRest - 0.001) ? 'partial_pay' : 'mark_paid';
                
                const extras = {
                    paymentMethodId: document.getElementById('pay-method-select').value,
                    customDate: document.getElementById('pay-date-input').value,
                    note: document.getElementById('pay-note-input').value
                };
                
                handlePaymentAction(p.id, action, val, extras);
            } else {
                if (confirm(`Möchtest du ${val.toFixed(2)} € Guthaben einlösen?`)) {
                    executePayWithCredit(p.id, val);
                }
            }
        };
    }

    if (!isRefresh) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
}





































function closeDetailModal() {
    const modal = document.getElementById('paymentDetailModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    currentDetailPaymentId = null;
}

// Füllt die Filter-Dropdowns mit den speziellen Gruppen (Fett & Farbig)
// Füllt die Filter-Dropdowns mit visuellen Trennern für Handys
function fillFilterDropdowns() {
    const statusSelect = document.getElementById('payment-filter-status');
    const categorySelect = document.getElementById('payment-filter-category');

    if (!statusSelect || !categorySelect) return;

    // 1. Status Dropdown
    const currentStatus = statusSelect.value;
    statusSelect.innerHTML = '';

    // Welcher Wert soll aktiv sein?
    const targetStatus = (currentStatus && currentStatus !== "") ? currentStatus : 'open';

    const grpStatus = document.createElement('optgroup');
    // TRICK: Wir nutzen Symbole und Linien, da Handys keine Farben anzeigen
    grpStatus.label = "━━ BEZAHLSTATUS ━━";

    const statuses = [
        { val: 'all', txt: 'Alle Status' },
        { val: 'open', txt: 'Offen / Teilbezahlt' },
        { val: 'pending', txt: 'Wartet auf Bestätigung' },
        { val: 'closed', txt: 'Abgeschlossen / Bezahlt' }
    ];

    statuses.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.val;
        opt.textContent = s.txt;
        if (s.val === targetStatus) {
            opt.selected = true;
        }
        grpStatus.appendChild(opt);
    });
    statusSelect.appendChild(grpStatus);
    statusSelect.value = targetStatus;

    // 2. Kategorie Dropdown
    const currentCat = categorySelect.value;
    const targetCat = (currentCat && currentCat !== "") ? currentCat : 'all';
    categorySelect.innerHTML = '';

    const grpCat = document.createElement('optgroup');
    grpCat.label = "━━ KATEGORIEN ━━";

    // Option "Alle"
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'Alle Kategorien';
    if (targetCat === 'all') optAll.selected = true;
    grpCat.appendChild(optAll);

    SYSTEM_CATEGORIES.forEach(sc => {
        const opt = document.createElement('option');
        opt.value = sc.id;
        opt.textContent = sc.name;
        if (sc.id === targetCat) opt.selected = true;
        grpCat.appendChild(opt);
    });

    allCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === targetCat) opt.selected = true;
        grpCat.appendChild(opt);
    });

    categorySelect.appendChild(grpCat);
    categorySelect.value = targetCat;
}




// --- NEU: INTELLIGENTE SUCHE LOGIK ---

// --- INTELLIGENTE SUCHE & TAGS ---

const PAYMENT_SEARCH_TYPE_LABELS = {
    all: 'Alles',
    debtor: 'Von',
    creditor: 'An',
    content: 'Inhalt',
    numbers: 'Nummer/ID',
    date: 'Datum',
    category_id: 'Kategorie',
    amount: 'Betrag'
};

function addSearchTagFromControls() {
    const input = document.getElementById('payment-search-input');
    const typeSelect = document.getElementById('payment-search-type');
    const term = input?.value?.trim();
    const type = typeSelect?.value || 'all';

    if (!term) return;

    const labelPrefix = PAYMENT_SEARCH_TYPE_LABELS[type] || type;
    addSearchTag(type, term, `${labelPrefix}: ${term}`);
}

function resetPaymentFilterControls() {
    activeSearchFilters = [];
    paymentSearchJoinMode = 'and';

    const searchInput = document.getElementById('payment-search-input');
    const searchType = document.getElementById('payment-search-type');
    const searchNegate = document.getElementById('payment-search-negate');
    const searchJoinMode = document.getElementById('payment-search-join-mode');
    const statusSelect = document.getElementById('payment-filter-status');
    const categorySelect = document.getElementById('payment-filter-category');
    const directionSelect = document.getElementById('payment-filter-direction');

    if (searchInput) searchInput.value = '';
    if (searchType) searchType.value = 'all';
    if (searchNegate) searchNegate.checked = false;
    if (searchJoinMode) searchJoinMode.value = 'and';
    if (statusSelect) statusSelect.value = 'open';
    if (categorySelect) categorySelect.value = 'all';
    if (directionSelect) directionSelect.value = 'all';

    document.getElementById('search-suggestions-box')?.classList.add('hidden');

    renderSearchTags();
    applyFilters();
}

function addSearchTag(type, term, label) {
    const normalizedTerm = String(term || '').trim().toLowerCase();
    const negateCheckbox = document.getElementById('payment-search-negate');
    const negate = negateCheckbox?.checked || false;

    if (!normalizedTerm) return;

    // Duplikat-Check
    if (activeSearchFilters.some(f => f.type === type && f.term === normalizedTerm && !!f.negate === !!negate)) return;

    const labelText = label || `${PAYMENT_SEARCH_TYPE_LABELS[type] || type}: ${term}`;

    activeSearchFilters.push({ type, term: normalizedTerm, label: labelText, negate: !!negate });
    renderSearchTags();
    
    // Input leeren und Fokus halten
    const input = document.getElementById('payment-search-input');
    if (input) {
        input.value = '';
        input.focus();
    }
    if (negateCheckbox) negateCheckbox.checked = false;
    document.getElementById('search-suggestions-box').classList.add('hidden');
    
    applyFilters(); // Sofort filtern
}

function removeSearchTag(index) {
    activeSearchFilters.splice(index, 1);
    renderSearchTags();
    applyFilters();
}

function renderSearchTags() {
    const container = document.getElementById('active-search-tags');
    if (!container) return;
    container.innerHTML = '';

    activeSearchFilters.forEach((filter, index) => {
        const tag = document.createElement('div');
        tag.className = filter.negate
            ? "flex items-center bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full border border-red-200"
            : "flex items-center bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded-full border border-indigo-200";
        tag.innerHTML = `
            ${filter.negate ? '<span class="mr-1 text-red-600">NICHT</span>' : ''}
            <span>${filter.label}</span>
            <button class="ml-1 ${filter.negate ? 'text-red-500 hover:text-red-900' : 'text-indigo-500 hover:text-indigo-900'} focus:outline-none" onclick="window.removeSearchTagGlobal(${index})">&times;</button>
        `;
        container.appendChild(tag);
    });
}

// Global verfügbar machen für onclick im HTML string
window.removeSearchTagGlobal = (index) => removeSearchTag(index);

function updateSearchSuggestions(term) {
    const box = document.getElementById('search-suggestions-box');
    const list = document.getElementById('search-suggestions-list');
    if (!term || !term.trim()) {
        box.classList.add('hidden');
        return;
    }

    const lowerTerm = term.toLowerCase().trim();
    const normalizedLowerTerm = lowerTerm.replace(',', '.');
    list.innerHTML = '';
    let hasHits = false;

    const addSuggestion = (label, icon, filterType, subtext = "") => {
        hasHits = true;
        const li = document.createElement('li');
        li.className = "px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2";
        li.innerHTML = `
            <span class="text-lg">${icon}</span>
            <div class="flex-grow leading-tight">
                <span class="font-bold text-gray-800 block">${label}</span>
                ${subtext ? `<span class="text-xs text-gray-500">${subtext}</span>` : ''}
            </div>
        `;
        li.onclick = () => addSearchTag(filterType, lowerTerm, label);
        list.appendChild(li);
    };

    // --- SUCHE IN ALLEN FELDERN ---
    
    // 1. Personen
    if (allPayments.some(p => p.debtorName?.toLowerCase().includes(lowerTerm))) 
        addSuggestion(`Von: ${term}`, "👤", "debtor", "Suche in Schuldner");
    
    if (allPayments.some(p => p.creditorName?.toLowerCase().includes(lowerTerm))) 
        addSuggestion(`An: ${term}`, "💰", "creditor", "Suche in Gläubiger");

    // 2. Inhalt (Titel, Notizen, Positionen)
    // NEU: Auch in Positionen suchen!
    const hasContent = allPayments.some(p => 
        (p.title?.toLowerCase().includes(lowerTerm)) || 
        (p.notes?.toLowerCase().includes(lowerTerm)) ||
        (p.positions && p.positions.some(pos => pos.name.toLowerCase().includes(lowerTerm)))
    );
    if (hasContent) addSuggestion(`Inhalt: ${term}`, "📝", "content", "Betreff, Notizen oder Positionen");

    // 3. Nummern (Rechnung, Bestellung, ID)
    const hasNumbers = allPayments.some(p => 
        (p.invoiceNr?.toLowerCase().includes(lowerTerm)) || 
        (p.orderNr?.toLowerCase().includes(lowerTerm)) ||
        (p.id.toLowerCase().includes(lowerTerm)) ||
        (p.splitGroupId?.toLowerCase().includes(lowerTerm))
    );
    if (hasNumbers) addSuggestion(`Nummer/ID: ${term}`, "#️⃣", "numbers", "Rechnungs-, Bestellnr. oder ID");

    // 4. Datum (Start oder Deadline)
    // Wir prüfen, ob der Suchterm wie ein Datum oder Jahr aussieht (einfacher String-Check)
    const hasDate = allPayments.some(p => 
        (p.startDate && p.startDate.includes(lowerTerm)) ||
        (p.deadline && p.deadline.includes(lowerTerm))
    );
    if (hasDate) addSuggestion(`Datum: ${term}`, "📅", "date", "Startdatum oder Fälligkeit");
    
    // 5. Kategorie (Name auflösen)
    // Wir prüfen, ob der Suchbegriff in einem Kategorienamen vorkommt
    const matchingCat = [...SYSTEM_CATEGORIES, ...allCategories].find(c => c.name.toLowerCase().includes(lowerTerm));
    if (matchingCat) {
        // Spezialfall: Wir suchen nach der ID der Kategorie, zeigen aber den Namen an
        // Hier fügen wir einen speziellen Tag hinzu, der nach der ID filtert
        const li = document.createElement('li');
        li.className = "px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2";
        li.innerHTML = `<span class="text-lg">🏷️</span><div class="flex-grow leading-tight"><span class="font-bold text-gray-800 block">Kategorie: ${matchingCat.name}</span></div>`;
        li.onclick = () => addSearchTag('category_id', matchingCat.id, `Kat: ${matchingCat.name}`);
        list.appendChild(li);
        hasHits = true;
    }

    // 6. Betrag
    const hasAmount = allPayments.some(p => {
        const remStr = parseFloat(p.remainingAmount).toFixed(2).replace(',', '.');
        const totStr = parseFloat(p.amount).toFixed(2).replace(',', '.');
        return remStr.includes(normalizedLowerTerm) || totStr.includes(normalizedLowerTerm);
    });
    if (hasAmount) addSuggestion(`Betrag: ${term}`, "💶", "amount", "Offen oder Gesamt");

    // Fallback: Freitextsuche (wenn keine spezifischen Treffer, oder immer als Option)
    addSuggestion(`Alles: "${term}"`, "🔍", "all", "Volltextsuche überall");

    if (hasHits) box.classList.remove('hidden');
    else box.classList.add('hidden');
}



function applyFilters() {
    const statusSelect = document.getElementById('payment-filter-status');
    const categorySelect = document.getElementById('payment-filter-category');
    const dirSelect = document.getElementById('payment-filter-direction');
    const joinModeSelect = document.getElementById('payment-search-join-mode');

    const statusFilter = statusSelect?.value || 'open'; 
    const categoryFilter = categorySelect?.value || 'all';
    const dirFilter = dirSelect?.value || 'all';
    paymentSearchJoinMode = joinModeSelect?.value === 'or' ? 'or' : 'and';

    // 1. Prüfen ob wir aktive Tags haben
    const hasTags = activeSearchFilters.length > 0;
    
    // Spezial: Wenn wir explizit nach ID suchen (in den Tags), ignorieren wir den Status-Filter
    const isIdSearch = hasTags && activeSearchFilters.some(f => f.type === 'numbers' || f.type === 'id');

    let filtered = allPayments.filter(p => {
        // --- BASIS CHECKS ---
        if (p.createdBy !== currentUser.mode) {
            const myAccess = p.accessRights ? p.accessRights[currentUser.mode] : null;
            if (myAccess && myAccess.status !== 'accepted') return false;
        }

        // Archiv & Papierkorb nur anzeigen wenn ID-Suche
        if (!isIdSearch && (p.status === 'archived' || p.status === 'trash')) return false;

        // Dropdown Filter (nur wenn KEINE ID-Suche)
        if (!isIdSearch) {
            if (statusFilter !== 'all') {
                if (statusFilter === 'open' && p.status !== 'open') return false;
                if (statusFilter === 'pending' && p.status !== 'pending_approval') return false;
                
                // --- FIX: Auch 'closed' (Merge) und 'settled' (Bilanz) als erledigt anzeigen ---
                if (statusFilter === 'closed') {
                    // Zeige NICHT an, wenn der Status NICHT einer der "erledigten" ist
                    const isFinished = p.status === 'paid' || p.status === 'cancelled' || p.status === 'closed' || p.status === 'settled';
                    if (!isFinished) return false;
                }
            }
            if (categoryFilter !== 'all') {
                const pCat = p.categoryId || 'cat_misc';
                if (pCat !== categoryFilter) return false;
            }
            if (dirFilter !== 'all') {
                const iAmDebtor = p.debtorId === currentUser.mode;
                if (dirFilter === 'i_owe' && !iAmDebtor) return false;
                if (dirFilter === 'owes_me' && iAmDebtor) return false;
            }
        }

        // --- SMART SEARCH TAGS (AND/OR, inkl. NICHT) ---
        if (hasTags) {
            const evaluateTag = (filter) => {
                const term = filter.term; 
                const type = filter.type;

                const contains = (val) => val && val.toLowerCase().includes(term);
                let matches = true;

                if (type === 'all') {
                    matches = contains(p.title) || contains(p.notes) || 
                              contains(p.debtorName) || contains(p.creditorName) ||
                              contains(p.invoiceNr) || contains(p.orderNr) ||
                              contains(p.id) ||
                              (p.positions && p.positions.some(pos => contains(pos.name)));
                    return filter.negate ? !matches : matches;
                }
                if (type === 'debtor') {
                    matches = contains(p.debtorName);
                    return filter.negate ? !matches : matches;
                }
                if (type === 'creditor') {
                    matches = contains(p.creditorName);
                    return filter.negate ? !matches : matches;
                }
                
                if (type === 'content') {
                    matches = contains(p.title) || contains(p.notes) || 
                              (p.positions && p.positions.some(pos => contains(pos.name)));
                    return filter.negate ? !matches : matches;
                }
                
                if (type === 'numbers' || type === 'id') {
                    matches = contains(p.id) || contains(p.invoiceNr) || contains(p.orderNr) || contains(p.splitGroupId);
                    return filter.negate ? !matches : matches;
                }
                
                if (type === 'date') {
                    matches = contains(p.startDate) || contains(p.deadline);
                    return filter.negate ? !matches : matches;
                }

                if (type === 'category_id') {
                    const pCat = p.categoryId || 'cat_misc';
                    matches = pCat.toLowerCase() === term;
                    return filter.negate ? !matches : matches;
                }

                if (type === 'amount') {
                    const normalizedAmountTerm = String(term || '').replace(',', '.');
                    const rem = parseFloat(p.remainingAmount).toFixed(2).replace(',', '.');
                    const tot = parseFloat(p.amount).toFixed(2).replace(',', '.');
                    matches = rem.includes(normalizedAmountTerm) || tot.includes(normalizedAmountTerm);
                    return filter.negate ? !matches : matches;
                }

                return filter.negate ? !matches : matches;
            };

            return paymentSearchJoinMode === 'or'
                ? activeSearchFilters.some(evaluateTag)
                : activeSearchFilters.every(evaluateTag);
        }

        return true;
    });

    // Sortierung
    filtered.sort((a, b) => {
        const deadA = (a.splitGroupId ? a.earliestDeadline : a.deadline) || '9999-12-31';
        const deadB = (b.splitGroupId ? b.earliestDeadline : b.deadline) || '9999-12-31';
        if (isListView && deadA !== deadB) return deadA.localeCompare(deadB);

        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        return (b.createdAt?.toDate ? b.createdAt.toDate() : new Date()) - (a.createdAt?.toDate ? a.createdAt.toDate() : new Date());
    });
    
    renderPaymentList(filtered);
    
    updateDashboard(allPayments);
    updateCategoryDashboard();
}








function renderPaymentList(payments) {
    const container = document.getElementById('payments-list-container');
    if (!container) return;
    container.innerHTML = '';
    
    const viewBtn = document.getElementById('btn-toggle-view-mode');
    if(viewBtn) viewBtn.textContent = isListView ? "📱" : "📋";

    // HEUTE definieren (Uhrzeit auf 00:00:00)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- PRÜFEN OB WIR IM SUCHMODUS SIND ---
    const searchInput = document.getElementById('payment-search-input');
    const hasSearchTerm = searchInput && searchInput.value.trim() !== "";
    const hasSearchTags = activeSearchFilters && activeSearchFilters.length > 0;
    const isSearching = hasSearchTerm || hasSearchTags;

    // Filter
    const visiblePayments = payments.filter(p => {
        // Credits gehören in die Einstellungen, nie ins Dashboard
        if (p.type === 'credit') return false;
        
        // Startdatum prüfen
        if (p.startDate) {
            const start = new Date(p.startDate);
            start.setHours(0, 0, 0, 0);
            
            // WENN Startdatum in der Zukunft liegt (> today) ...
            if (start > today) {
                // 1. Zeigen, wenn wir suchen
                if (isSearching) return true;

                // 2. NEU: Zeigen, wenn es bereits BEZAHLT/ERLEDIGT ist
                // Damit erscheint es im "Abgeschlossen"-Filter, auch wenn der Termin in der Zukunft war.
                const isFinished = p.status === 'paid' || p.status === 'closed' || p.status === 'settled' || p.status === 'cancelled';
                if (isFinished) return true;

                // Sonst ausblenden (landet im "Zukunft"-Modal)
                return false;
            }
        }
        
        return true;
    });
    
    if (visiblePayments.length === 0) { 
        container.innerHTML = `<div class="col-span-1 sm:col-span-2 text-center p-8 bg-gray-50 rounded-xl text-gray-500">Keine Einträge gefunden.</div>`; 
        return; 
    }

    // 1. GRUPPIERUNG
    const groups = {};
    const singles = [];

    visiblePayments.forEach(p => {
        // Betrag logik
        const displayRemaining = (p.status === 'closed' || p.status === 'settled' || p.status === 'paid') ? 0 : parseFloat(p.remainingAmount);
        
        if (p.splitGroupId) {
            if (!groups[p.splitGroupId]) {
                groups[p.splitGroupId] = {
                    id: p.splitGroupId, title: p.title, items: [], 
                    totalRemaining: 0, 
                    totalAmount: 0, categoryId: p.categoryId, date: p.createdAt, earliestDeadline: '9999-12-31' 
                };
            }
            groups[p.splitGroupId].items.push(p);
            groups[p.splitGroupId].totalRemaining += displayRemaining;
            groups[p.splitGroupId].totalAmount += parseFloat(p.amount);
            
            if (p.deadline && p.deadline < groups[p.splitGroupId].earliestDeadline) {
                groups[p.splitGroupId].earliestDeadline = p.deadline;
            }
        } else {
            singles.push(p);
        }
    });

    const combinedList = [...singles, ...Object.values(groups)];

    // 2. SORTIERUNG
    combinedList.sort((a, b) => {
        const deadA = (a.items ? a.earliestDeadline : a.deadline) || '9999-12-31';
        const deadB = (b.items ? b.earliestDeadline : b.deadline) || '9999-12-31';
        if (deadA !== deadB) return deadA.localeCompare(deadB);
        const amountA = a.items ? a.totalRemaining : ((a.status === 'closed' || a.status === 'settled') ? 0 : parseFloat(a.remainingAmount));
        const amountB = b.items ? b.totalRemaining : ((b.status === 'closed' || b.status === 'settled') ? 0 : parseFloat(b.remainingAmount));
        return amountB - amountA; 
    });

    if (isListView) {
        container.className = "flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm pb-20";
        container.innerHTML = `
            <div class="grid grid-cols-[1.5fr_40px_55px_70px_45px] sm:grid-cols-[70px_2fr_1fr_1fr_1fr_85px_110px] gap-1 p-2 bg-gray-100 border-b border-gray-300 text-[10px] font-bold text-gray-500 uppercase tracking-wider sticky top-0 z-10">
                <div class="hidden sm:block">Datum</div>
                <div>Betreff</div>
                <div>Kat.</div>
                <div>Von</div>
                <div class="hidden sm:block">An</div>
                <div class="text-right">Betrag</div>
                <div class="text-right">Frist</div>
            </div>
        `;
    } else {
        container.className = "grid grid-cols-1 sm:grid-cols-2 gap-3 pb-20";
    }

    // RENDER LOOP
    combinedList.forEach(item => {
        if (item.items) { 
            const g = item;
            const isAllPaid = g.totalRemaining <= 0.01;
            const timeDiff = (new Date(g.earliestDeadline) - today) / (1000 * 60 * 60 * 24);
            
            let groupStatusClass = "";
            
            if (isListView) {
                if (isAllPaid) {
                    groupStatusClass = "bg-green-50/50 hover:bg-green-100 border-l-4 border-green-500";
                } else {
                    groupStatusClass = "bg-indigo-50/50 hover:bg-indigo-100";
                    if (g.earliestDeadline !== '9999-12-31') {
                        if (timeDiff < 3) groupStatusClass = "bg-red-50/50 hover:bg-red-100 border-l-4 border-red-500 animate-pulse"; 
                        else if (timeDiff < 7) groupStatusClass = "bg-yellow-50/50 hover:bg-yellow-100 border-l-4 border-yellow-400";
                    }
                }
            } else {
                if (isAllPaid) {
                    groupStatusClass = "border-2 border-dashed border-green-200 bg-green-50";
                } else {
                    groupStatusClass = "border-2 border-dashed border-indigo-200 bg-indigo-50";
                    if (g.earliestDeadline !== '9999-12-31') {
                        if (timeDiff < 3) groupStatusClass = "border-2 border-red-500 bg-red-50 animate-pulse"; 
                        else if (timeDiff < 7) groupStatusClass = "border-2 border-yellow-400 bg-yellow-50";
                    }
                }
            }

            if (isListView) {
                const folderHtml = `
                <div class="border-b border-gray-200 ${groupStatusClass} transition-colors">
                    <div class="flex items-center p-2 cursor-pointer gap-2"
                         onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.arrow-icon').classList.toggle('rotate-180');">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-500 arrow-icon transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                        <span class="text-lg">📂</span>
                        <span class="text-xs font-bold text-gray-800 flex-grow truncate">${g.title} (Split: ${g.items.length})</span>
                        <span class="font-mono font-bold text-xs ${isAllPaid ? 'text-green-600' : 'text-indigo-600'} mr-2">${g.totalRemaining.toFixed(2)} €</span>
                    </div>
                    <div class="hidden pl-0 bg-white border-t border-gray-100">
                        ${g.items.map(p => createSingleListRowHtml(p, today, true)).join('')} 
                    </div>
                </div>`;
                container.innerHTML += folderHtml;
            } else {
                const textColor = isAllPaid ? 'text-green-700' : 'text-indigo-700';
                const colSpan = "col-span-1 sm:col-span-2";
                
                const folderHtml = `
                <div class="${colSpan}">
                    <div class="group-folder relative p-3 rounded-xl shadow-sm cursor-pointer hover:shadow-md transition flex justify-between items-center ${groupStatusClass}"
                         onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.arrow-icon').classList.toggle('rotate-180');">
                        <div class="flex items-center gap-3">
                            <div class="p-2 bg-white/80 rounded-lg border border-gray-200">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6 text-indigo-500"><path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" /></svg>
                            </div>
                            <div class="min-w-0">
                                <p class="font-bold text-gray-800 text-sm truncate">${g.title}</p>
                                <p class="text-xs text-gray-600 font-medium">${g.items.length} Personen</p>
                            </div>
                        </div>
                        <div class="text-right flex items-center gap-2 flex-shrink-0">
                            <span class="font-black text-base sm:text-lg ${textColor}">${g.totalRemaining.toFixed(2)} €</span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-gray-500 transition-transform arrow-icon"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                        </div>
                    </div>
                    <div class="hidden grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pl-2 border-l-4 border-indigo-100">
                        ${g.items.map(p => createSingleCardHtml(p, today)).join('')}
                    </div>
                </div>`;
                container.innerHTML += folderHtml;
            }
        } else {
            if (isListView) container.innerHTML += createSingleListRowHtml(item, today, false);
            else container.innerHTML += createSingleCardHtml(item, today);
        }
    });
}











// Hilfsfunktion für das Karten-Design (damit wir es nicht doppelt schreiben müssen)
function createSingleCardHtml(p, today) {
    const iAmDebtor = p.debtorId === currentUser.mode;
    const partnerName = iAmDebtor ? p.creditorName : p.debtorName;
    const prefix = iAmDebtor ? "an" : "von"; 
    const colorClass = iAmDebtor ? "text-red-600" : "text-emerald-600";
    
    let rowBgClass = iAmDebtor ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200";
    
    let catName = "Diverse";
    const sysCat = SYSTEM_CATEGORIES.find(c => c.id === p.categoryId);
    if (sysCat) catName = sysCat.name;
    else {
        const customCat = allCategories.find(c => c.id === p.categoryId);
        if (customCat) catName = customCat.name;
    }

    // --- FIX: Betrag auf 0 setzen bei Fusiert/Verrechnet ---
    let displayAmount = parseFloat(p.remainingAmount);
    if (p.status === 'closed' || p.status === 'settled' || p.status === 'paid') {
        displayAmount = 0;
    }

    const amountDisplay = p.isTBD 
        ? '<span class="inline-block px-2 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded font-bold text-xs sm:text-sm whitespace-nowrap">Betrag unbekannt</span>' 
        : displayAmount.toFixed(2) + '€';

    // --- DEADLINE & BLINK LOGIK ---
    let statusDot = '';
    let deadlineHtml = "";

    const blinkStyle = `
    <style>
        @keyframes urgent-flash-box {
            0%, 100% { background-color: #fee2e2; border-color: #ef4444; color: #b91c1c; }
            50% { background-color: #fef2f2; border-color: #fca5a5; color: #ef4444; }
        }
        .urgent-blink-box {
            animation: urgent-flash-box 1s infinite; 
            border: 1px solid #ef4444 !important;
            font-weight: bold;
        }
    </style>`;

    if (p.status === 'open') {
        statusDot = `<div class="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow-sm flex-shrink-0" title="Offen"></div>`;

        if (p.deadline) {
            const deadlineDate = new Date(p.deadline);
            deadlineDate.setHours(23, 59, 59, 999);
            const now = new Date();
            const diffMs = deadlineDate - now;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const dateStr = deadlineDate.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

            let timeText = "";
            let boxClass = "bg-white/70 border border-gray-300 text-gray-500";

            if (diffMs < 0) {
                statusDot = `<div class="w-3.5 h-3.5 rounded-full bg-red-600 border-2 border-white shadow-sm flex-shrink-0" title="Überfällig"></div>`;
                timeText = "!";
                boxClass = "bg-red-600 text-white border border-red-700 font-bold";
            } else {
                timeText = `${diffDays}T`;
                if (diffDays < 3) {
                    statusDot = `<div class="w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white shadow-sm animate-pulse flex-shrink-0"></div>`;
                    boxClass = "urgent-blink-box bg-red-50";
                } else if (diffDays < 7) {
                    statusDot = `<div class="w-3.5 h-3.5 rounded-full bg-orange-400 border-2 border-white shadow-sm flex-shrink-0"></div>`;
                    boxClass = "bg-yellow-100 text-yellow-800 border border-yellow-300 font-bold";
                }
            }

            deadlineHtml = `
                <div class="flex flex-col items-center justify-center px-2 py-1 rounded ${boxClass} min-w-[40px]">
                    <span class="text-[9px] leading-none mb-0.5">${dateStr}</span>
                    <span class="text-[10px] leading-none font-bold whitespace-nowrap">${timeText}</span>
                </div>
            `;
        }
    } 
    else if (p.status === 'pending_approval') {
        statusDot = `<div class="w-3.5 h-3.5 rounded-full bg-yellow-500 animate-pulse border-2 border-white shadow-sm flex-shrink-0" title="Wartet"></div>`;
        rowBgClass = "bg-yellow-50 border-yellow-200";
    } 
    else if (p.status === 'paid' || p.status === 'closed' || p.status === 'settled') {
        statusDot = `<div class="w-3.5 h-3.5 rounded-full bg-green-500 border-2 border-white shadow-sm flex-shrink-0" title="Erledigt"></div>`;
        rowBgClass = "bg-green-50 border-green-200";
    } 
    else {
        statusDot = `<div class="w-3.5 h-3.5 rounded-full bg-gray-400 border-2 border-white shadow-sm flex-shrink-0" title="Storniert"></div>`;
        rowBgClass = "bg-gray-100 border-gray-300 opacity-75";
    }

    const checkboxHtml = isSelectionMode ?
        `<div class="absolute top-1/2 -translate-y-1/2 right-8 z-20"><input type="checkbox" class="payment-select-cb h-5 w-5 text-indigo-600 accent-indigo-600" value="${p.id}" ${selectedPaymentIds.has(p.id) ? 'checked' : ''}></div>` : '';

    return `
    ${blinkStyle}
    <div class="payment-card-item relative p-3 rounded-xl border ${rowBgClass} shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between h-full min-h-[90px]" data-id="${p.id}">
        ${checkboxHtml}
        <div class="absolute top-2 right-2 z-10">${statusDot}</div>
        
        <div class="pr-5 mb-1 min-w-0">
            <span class="text-sm font-bold text-gray-900 leading-snug break-words line-clamp-2" title="${p.title}">${p.title}</span>
            <div class="flex flex-wrap gap-1 mt-1">
                <span class="inline-block text-[9px] font-bold text-gray-500 bg-white/60 px-1.5 py-0.5 rounded border border-gray-200/50 whitespace-nowrap">${catName}</span>
            </div>
        </div>
        
        <div class="flex justify-between items-end mt-auto pt-2 border-t border-gray-100/50">
            <div class="min-w-0 flex-grow mr-2">
                <p class="text-[10px] text-gray-600 truncate leading-tight">
                    ${prefix} <strong class="text-gray-800">${partnerName}</strong>
                </p>
                <div class="font-black text-base sm:text-lg ${colorClass} leading-none mt-0.5 truncate">
                    ${amountDisplay}
                </div>
            </div>
            
            ${deadlineHtml}
        </div>
    </div>`;
}










// --- KATEGORIE DASHBOARD (Max 5 + Mehr Button) ---
// --- KATEGORIE DASHBOARD (Max 5 + Mehr Button) ---
function updateCategoryDashboard() {
    const container = document.getElementById('category-dashboard-container');
    const modalList = document.getElementById('category-overview-list');
    if (!container) return;

    container.innerHTML = '';
    if (modalList) modalList.innerHTML = '';

    // BUGFIX: Datum für Zukunfts-Check definieren
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Daten sammeln (Nur Kategorien mit offenen Beträgen > 0)
    const sums = [];
    const allCats = [...SYSTEM_CATEGORIES, ...allCategories];

    allCats.forEach(cat => {
        let count = 0;
        let amount = 0;

        allPayments.forEach(p => {
            // Nur offene, nicht-guthaben Einträge zählen
            if ((p.status === 'open' || p.status === 'pending_approval') && p.type !== 'credit') {
                
                // BUGFIX: Zukünftige Zahlungen ignorieren
                if (p.startDate) {
                    const start = new Date(p.startDate);
                    start.setHours(0, 0, 0, 0);
                    if (start > today) return; // Überspringen
                }

                const pCat = p.categoryId || 'cat_misc';
                // Direkter Match
                if (pCat === cat.id) {
                    count++;
                    amount += parseFloat(p.remainingAmount || 0);
                }
                // Fallback für "Diverse" (fängt alles ohne gültige Kat)
                if (cat.id === 'cat_misc' && p.categoryId && !allCats.find(c => c.id === p.categoryId)) {
                    count++;
                    amount += parseFloat(p.remainingAmount || 0);
                }
            }
        });

        // Nur speichern, wenn es offene Posten gibt
        if (count > 0) {
            sums.push({ id: cat.id, name: cat.name, count: count, amount: amount });
        }
    });

    // 2. Leerer Zustand: Nichts anzeigen (kein Text mehr)
    if (sums.length === 0) {
        container.innerHTML = '';
        return;
    }

    // 3. Helper zum Bauen der Boxen
    const createBox = (item, isModal = false) => {
        const div = document.createElement('div');

        if (isModal) {
            // Listen-Ansicht im Popup
            div.className = "bg-gray-50 border border-gray-200 rounded-lg p-3 flex justify-between items-center shadow-sm hover:bg-gray-100 cursor-pointer transition";
            div.innerHTML = `
                 <div class="text-left">
                    <p class="text-base font-bold text-gray-800">${item.name}</p>
                    <p class="text-sm text-gray-500">${item.count} Posten</p>
                 </div>
                 <p class="text-xl font-bold text-gray-900">${item.amount.toFixed(2)} €</p>
             `;
        } else {
            // Kachel-Ansicht im Dashboard
            div.className = "flex-shrink-0 bg-white border border-gray-200 rounded-xl px-3 py-2 min-w-[110px] max-w-[140px] shadow-sm text-center flex flex-col justify-between hover:shadow-md transition cursor-pointer h-auto min-h-[70px] group hover:border-indigo-300";

            div.innerHTML = `
                 <div class="flex items-center justify-center flex-grow min-h-[28px]">
                    <p class="text-xs font-bold text-gray-700 uppercase leading-tight line-clamp-2 break-words w-full group-hover:text-indigo-600">${item.name}</p>
                 </div>
                 <div class="mt-1">
                    <p class="text-lg font-black text-indigo-600 leading-none">${item.amount.toFixed(2)} €</p>
                    <p class="text-[10px] text-gray-500 font-semibold leading-none mt-1">${item.count} off.</p>
                 </div>
             `;
        }

        // Klick-Logik (Filter setzen)
        div.onclick = () => {
            const catSelect = document.getElementById('payment-filter-category');
            if (catSelect) catSelect.value = item.id;

            const statusSelect = document.getElementById('payment-filter-status');
            if (statusSelect) statusSelect.value = 'open';

            const dirSelect = document.getElementById('payment-filter-direction');
            if (dirSelect) dirSelect.value = 'all';

            if (isModal) document.getElementById('categoryOverviewModal').style.display = 'none';

            applyFilters();

            const listContainer = document.getElementById('payments-list-container');
            if (listContainer) listContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        return div;
    };

    // 4. Dashboard Rendern (Max 5 + Button)
    const MAX_DASHBOARD_ITEMS = 5;
    const showMoreButton = sums.length > MAX_DASHBOARD_ITEMS;

    // Welche Items zeigen wir direkt an? (Alle oder nur die ersten 5)
    const dashboardItems = showMoreButton ? sums.slice(0, MAX_DASHBOARD_ITEMS) : sums;

    dashboardItems.forEach(item => {
        container.appendChild(createBox(item, false));
    });

    // Wenn mehr als 5, den "Mehr anzeigen" Button als 6. Element anfügen
    if (showMoreButton) {
        const moreCount = sums.length - MAX_DASHBOARD_ITEMS;
        const btn = document.createElement('button');
        btn.className = "flex-shrink-0 bg-indigo-50 border border-indigo-200 rounded-xl px-2 py-2 min-w-[70px] text-indigo-700 font-bold hover:bg-indigo-100 transition flex flex-col justify-center items-center shadow-sm min-h-[70px]";
        btn.innerHTML = `<span class="text-xl leading-none">+${moreCount}</span><span class="text-[10px] font-semibold">mehr</span>`;
        btn.onclick = () => {
            document.getElementById('categoryOverviewModal').style.display = 'flex';
        };
        container.appendChild(btn);
    }

    // 5. Modal Rendern (Immer alle Items)
    if (modalList) {
        sums.forEach(item => {
            modalList.appendChild(createBox(item, true));
        });
    }
}






function updateDashboard(payments) {
    let myDebt = 0;
    let myDebtCount = 0;
    let owedToMe = 0;
    let owedToMeCount = 0;

    // NEU: Wir trennen Guthaben in zwei Variablen
    let myCreditAtOthers = 0; // Guthaben, das ICH bei anderen habe
    let othersCreditAtMe = 0; // Guthaben, das ANDERE bei mir haben

    payments.forEach(p => {
        // Nur offene Einträge zählen
        if (p.status !== 'open' && p.status !== 'pending_approval') return;

        // Berechtigungs-Check (unverändert)
        if (p.createdBy !== currentUser.mode) {
            const myAccess = p.accessRights ? p.accessRights[currentUser.mode] : null;
            if (!myAccess || myAccess.status !== 'accepted') {
                return; // Ignorieren für die Berechnung
            }
        }

        const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);

        if (p.type === 'credit') {
            // --- GUTHABEN LOGIK ---
            if (p.creditorId === currentUser.mode) {
                // Ich bin der "Gläubiger" (Besitzer) des Guthabens -> Es liegt bei jemand anderem
                myCreditAtOthers += amount;
            } else if (p.debtorId === currentUser.mode) {
                // Ich bin der "Schuldner" (Verwalter) des Guthabens -> Es liegt bei mir
                othersCreditAtMe += amount;
            }
        } else {
            // --- NORMALE SCHULDEN LOGIK ---
            if (p.debtorId === currentUser.mode) {
                myDebt += amount;
                myDebtCount++;
            } else if (p.creditorId === currentUser.mode) {
                owedToMe += amount;
                owedToMeCount++;
            }
        }
    });

    // Alte Elemente aktualisieren
    const mD = document.getElementById('dashboard-my-debt-display');
    if (mD) mD.textContent = myDebt.toFixed(2) + " €";

    const mDD = document.getElementById('dashboard-my-debt-detail');
    if (mDD) mDD.textContent = `in ${myDebtCount} offenen Posten`;

    const oD = document.getElementById('dashboard-owe-me-display');
    if (oD) oD.textContent = owedToMe.toFixed(2) + " €";

    const oDD = document.getElementById('dashboard-owe-me-detail');
    if (oDD) oDD.textContent = `aus ${owedToMeCount} offenen Posten`;

    // NEU: Die zwei neuen Felder für Guthaben aktualisieren
    // "Bei Anderen" (Mein Guthaben)
    const cOther = document.getElementById('dashboard-credit-others-display');
    if (cOther) cOther.textContent = myCreditAtOthers.toFixed(2) + " €";

    // "Bei Mir" (Fremdes Guthaben)
    const cMe = document.getElementById('dashboard-credit-me-display');
    if (cMe) cMe.textContent = othersCreditAtMe.toFixed(2) + " €";
}


function renderFuturePaymentsList() {
    const list = document.getElementById('future-payments-list');
    const sumDebt = document.getElementById('future-debt-sum');
    const sumCredit = document.getElementById('future-credit-sum');
    const modal = document.getElementById('futurePaymentsModal');

    if (!list || !sumDebt || !sumCredit) return;

    list.innerHTML = '';
    const today = new Date();
    today.setHours(0,0,0,0);
    const now = new Date();

    const futurePayments = [];
    let totalDebt = 0;
    let totalCredit = 0;

    allPayments.forEach(p => {
        if (!p.startDate) return;
        const start = new Date(p.startDate);
        start.setHours(0,0,0,0);

        if (start <= today) return;
        if (p.status !== 'open' && p.status !== 'pending_approval') return;

        const iAmCreator = (p.createdBy === currentUser.mode);
        const myAccess = p.accessRights ? p.accessRights[currentUser.mode] : null;
        const isAccepted = myAccess && myAccess.status === 'accepted';

        if (!iAmCreator && !isAccepted) return;

        futurePayments.push(p);

        const amount = parseFloat(p.remainingAmount);
        if (p.debtorId === currentUser.mode) totalDebt += amount;
        else if (p.creditorId === currentUser.mode) totalCredit += amount;
    });

    sumDebt.textContent = totalDebt.toFixed(2) + " €";
    sumCredit.textContent = totalCredit.toFixed(2) + " €";

    futurePayments.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (futurePayments.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 italic py-8">Keine geplanten Zahlungen.</p>';
    } else {
        // Style für das Blinken einfügen, falls noch nicht vorhanden
        const blinkStyle = `<style>@keyframes urgent-flash-box { 0%, 100% { background-color: #fee2e2; border-color: #ef4444; color: #b91c1c; } 50% { background-color: #fef2f2; border-color: #fca5a5; color: #ef4444; } } .urgent-blink-box { animation: urgent-flash-box 1s infinite; border: 1px solid #ef4444 !important; font-weight: bold; }</style>`;
        list.innerHTML += blinkStyle;

        futurePayments.forEach(p => {
            const dateObj = new Date(p.startDate);
            const dateStr = dateObj.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            const iAmDebtor = p.debtorId === currentUser.mode;
            const partnerName = iAmDebtor ? p.creditorName : p.debtorName;
            const prefix = iAmDebtor ? "an" : "von"; 
            const colorClass = iAmDebtor ? "text-red-600" : "text-green-600";
            
            // Standard BG
            let bgClass = iAmDebtor ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100";
            let deadlineHtml = "";

            // --- DEADLINE LOGIK ---
            if (p.deadline) {
                const deadlineDate = new Date(p.deadline);
                deadlineDate.setHours(23, 59, 59, 999);
                const dDiffMs = deadlineDate - now;
                const dDays = Math.floor(dDiffMs / (1000 * 60 * 60 * 24));
                const dDateStr = deadlineDate.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });

                let timeText = "";
                let badgeClass = "bg-white border border-gray-200 text-gray-500";

                if (dDiffMs < 0) {
                    timeText = "!";
                    badgeClass = "bg-red-600 text-white border-red-700 font-bold";
                    bgClass = "urgent-blink-box bg-red-50"; // Zeile blinkt auch
                } else {
                    timeText = `${dDays}T`;
                    if (dDays < 3) {
                        badgeClass = "urgent-blink-box bg-red-50 text-red-800";
                        bgClass = "border-red-300 bg-red-50"; 
                    } else if (dDays < 7) {
                        badgeClass = "bg-yellow-100 text-yellow-800 border-yellow-300 font-bold";
                        bgClass = "border-yellow-200 bg-yellow-50";
                    }
                }

                deadlineHtml = `
                    <div class="flex flex-col items-center justify-center px-1 py-0.5 rounded ${badgeClass} min-w-[45px] ml-2">
                        <span class="text-[9px] leading-none mb-0.5 opacity-80">Frist: ${dDateStr}</span>
                        <span class="text-[10px] leading-none font-bold">${timeText}</span>
                    </div>
                `;
            }

            const div = document.createElement('div');
            div.className = `p-3 rounded-lg border ${bgClass} cursor-pointer hover:shadow-md transition flex justify-between items-center`;
            
            div.innerHTML = `
                <div class="flex-grow min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 whitespace-nowrap">
                            Start: ${dateStr}
                        </span>
                        <span class="font-bold text-sm text-gray-800 truncate">${p.title}</span>
                    </div>
                    <p class="text-xs text-gray-500 truncate">
                        ${prefix} <strong>${partnerName}</strong>
                    </p>
                </div>
                
                <div class="flex items-center">
                    <span class="font-mono font-bold text-lg ${colorClass} whitespace-nowrap">
                        ${parseFloat(p.remainingAmount).toFixed(2)} €
                    </span>
                    ${deadlineHtml}
                </div>
            `;

            div.onclick = () => {
                if(modal) modal.style.display = 'none'; 
                openPaymentDetail(p.id); 
            };

            list.appendChild(div);
        });
    }
}




function updateActionDashboard() {
    // 1. Anfragen (Einladungen an MICH)
    let requestCount = 0;
    allPayments.forEach(p => {
        if (p.createdBy !== currentUser.mode) {
            const myAccess = p.accessRights ? p.accessRights[currentUser.mode] : null;
            if (myAccess && myAccess.status === 'pending') {
                requestCount++;
            }
        }
    });

    const boxReq = document.getElementById('btn-action-requests');
    const txtReq = document.getElementById('dashboard-requests-count');
    const baseClasses = "p-1 border rounded-lg shadow-sm cursor-pointer transition flex flex-col justify-center text-center min-h-[45px]";
    const labelClasses = "text-[9px] font-bold uppercase leading-none";
    const numberClasses = "text-base font-extrabold leading-none mt-0.5";

    if (boxReq && txtReq) {
        txtReq.textContent = requestCount;
        if (requestCount > 0) {
            boxReq.className = `${baseClasses} bg-orange-100 border-orange-300 shadow-md animate-pulse`;
            boxReq.querySelector('p').className = `${labelClasses} text-orange-800`;
            txtReq.className = `${numberClasses} text-orange-700`;
        } else {
            boxReq.className = `${baseClasses} bg-gray-50 border-gray-200`;
            boxReq.querySelector('p').className = `${labelClasses} text-gray-500`;
            txtReq.className = `${numberClasses} text-gray-800`;
        }
    }

    // 2. Transaktionsbuchungen (Genehmigungen)
    let transCount = 0;
    allPayments.forEach(p => {
        if (p.createdBy === currentUser.mode && p.transactions) {
            p.transactions.forEach(tx => {
                if (tx.approvalPending) transCount++;
            });
        }
    });

    const boxTrans = document.getElementById('btn-action-trans-approvals');
    const txtTrans = document.getElementById('dashboard-trans-approvals-count');

    if (boxTrans && txtTrans) {
        txtTrans.textContent = transCount;
        if (transCount > 0) {
            boxTrans.className = `${baseClasses} bg-orange-100 border-orange-300 shadow-md animate-pulse`;
            boxTrans.querySelector('p').className = `${labelClasses} text-orange-800`;
            txtTrans.className = `${numberClasses} text-orange-700`;
        } else {
            boxTrans.className = `${baseClasses} bg-gray-50 border-gray-200`;
            boxTrans.querySelector('p').className = `${labelClasses} text-gray-500`;
            txtTrans.className = `${numberClasses} text-gray-800`;
        }
    }

    // 3. ZUKÜNFTIGE ZAHLUNGEN
    const boxFuture = document.getElementById('btn-action-future-payments') || document.getElementById('btn-action-value-credit');
    
    const today = new Date(); 
    today.setHours(0,0,0,0);
    const now = new Date(); // Für exakten Countdown
    
    const futurePayments = [];
    let hasUrgentFuture = false; // < 3 Tage
    let hasWarningFuture = false; // < 7 Tage

    allPayments.forEach(p => {
        if (!p.startDate) return;
        const start = new Date(p.startDate);
        start.setHours(0,0,0,0);

        // Muss in Zukunft sein UND offen
        if (start <= today) return;
        if (p.status !== 'open' && p.status !== 'pending_approval') return;

        const iAmCreator = (p.createdBy === currentUser.mode);
        const myAccess = p.accessRights ? p.accessRights[currentUser.mode] : null;
        const isAccepted = myAccess && myAccess.status === 'accepted';

        if (iAmCreator || isAccepted) {
            futurePayments.push({ ...p, startTime: start.getTime() });

            // DEADLINE CHECK FÜR DASHBOARD-BOX
            if (p.deadline) {
                const deadlineDate = new Date(p.deadline);
                deadlineDate.setHours(23, 59, 59, 999);
                const diffMs = deadlineDate - now;
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                if (diffDays < 3) hasUrgentFuture = true;
                else if (diffDays < 7) hasWarningFuture = true;
            }
        }
    });

    // Sortieren: Nächste zuerst
    futurePayments.sort((a, b) => a.startTime - b.startTime);

    if (boxFuture) {
        boxFuture.id = "btn-action-future-payments";
        boxFuture.onclick = openFuturePaymentsModal;
        boxFuture.style.opacity = "1";
        boxFuture.style.cursor = "pointer";

        if (futurePayments.length > 0) {
            const count = futurePayments.length;
            const nextOne = futurePayments[0];
            const nextDate = new Date(nextOne.startTime);
            
            // Countdown zum START-DATUM (Wann wird es aktiv?)
            const diffMs = nextDate - now;
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            let timeText = "";
            if (days > 0) timeText = `${days}T ${hours}h`;
            else timeText = `${hours}h`;

            // STYLE LOGIK
            let boxClass = `${baseClasses} bg-indigo-50 border-indigo-200 shadow-sm`;
            let textClass = "text-indigo-500";
            let numberClass = "text-indigo-700";

            if (hasUrgentFuture) {
                // Rot & Blinkend
                boxClass = `${baseClasses} bg-red-100 border-red-300 shadow-md animate-pulse`;
                textClass = "text-red-800";
                numberClass = "text-red-900";
            } else if (hasWarningFuture) {
                // Gelb
                boxClass = `${baseClasses} bg-yellow-50 border-yellow-300 shadow-sm`;
                textClass = "text-yellow-800";
                numberClass = "text-yellow-900";
            }

            boxFuture.className = boxClass;
            boxFuture.innerHTML = `
                <div class="flex items-center justify-center gap-2 w-full">
                    <div class="text-center">
                        <p class="${labelClasses} ${textClass}">Zukunft</p>
                        <p class="${numberClasses} ${numberClass}">${count}</p>
                    </div>
                    <div class="h-6 w-px bg-gray-300/50"></div>
                    <div class="text-center">
                        <p class="text-[8px] font-bold text-gray-500 uppercase leading-none">Start in</p>
                        <p class="text-xs font-bold text-gray-700 leading-none mt-0.5">${timeText}</p>
                    </div>
                </div>
            `;
        } else {
            boxFuture.className = `${baseClasses} bg-gray-50 border-gray-200 opacity-60`;
            boxFuture.innerHTML = `
                <p class="${labelClasses} text-gray-400">Zukunft</p>
                <p class="text-[9px] text-gray-400 italic leading-none mt-0.5">Keine Einträge</p>
            `;
        }
    }
}



// --- NEUE FUNKTION: MODAL FÜR ZUKUNFT ÖFFNEN ---
function openFuturePaymentsModal() {
    const modal = document.getElementById('futurePaymentsModal');
    if (!modal) return;
    
    // Rendern
    renderFuturePaymentsList();
    
    // Anzeigen
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}




// --- NEU: Steuerung der Home-Screen Warnleuchten (Optimiert & Größer) ---
function updateHomeAlerts() {
    const cardStrip = document.getElementById('zv-card-alert-strip');
    if (!cardStrip) return;

    let alertCount = 0;
    let urgentCount = 0; // Rot (Deadline < 3 Tage oder überfällig)
    let hasWarning = false; // Gelb (Deadline < 7 Tage)

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    allPayments.forEach(p => {
        // Wir prüfen nur offene Sachen
        if (p.status !== 'open' && p.status !== 'pending_approval') return;
        
        // 1. Prüfe Deadlines (Nur bei 'open')
        if (p.status === 'open' && p.deadline) {
            const deadlineDate = new Date(p.deadline);
            deadlineDate.setHours(23, 59, 59, 999);
            
            // Differenz in Tagen
            const diffMs = deadlineDate - today;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffMs < 0) {
                // Überfällig -> Sofort Alarm (Rot)
                urgentCount++;
            } else if (diffDays < 3) {
                // < 3 Tage -> Dringend (Rot)
                urgentCount++;
            } else if (diffDays < 7) {
                // < 7 Tage -> Warnung (Gelb/Orange)
                hasWarning = true;
            }
        }

        // 2. Prüfe auf ausstehende Genehmigungen (Ich bin Ersteller)
        if (p.createdBy === currentUser.mode && p.transactions) {
            const hasPending = p.transactions.some(tx => tx.approvalPending);
            if (hasPending) hasWarning = true;
        }

        // 3. Prüfe auf offene Einladungen an MICH
        if (p.createdBy !== currentUser.mode) {
            const myAccess = p.accessRights ? p.accessRights[currentUser.mode] : null;
            if (myAccess && myAccess.status === 'pending') {
                hasWarning = true;
            }
        }
    });

    // Gesamtzustand ermitteln
    const hasAnyAlert = urgentCount > 0 || hasWarning;

    // --- UI UPDATE ---

    if (hasAnyAlert) {
        // Streifen auf der Karte (Hauptmenü)
        cardStrip.classList.remove('hidden');
        if (urgentCount > 0) {
            cardStrip.classList.remove('bg-orange-500');
            cardStrip.classList.add('bg-red-600');
        } else {
            cardStrip.classList.remove('bg-red-600');
            cardStrip.classList.add('bg-orange-500');
        }

    } else {
        // Keine Alerts -> Alles verstecken
        cardStrip.classList.add('hidden');
    }
}


// --- LOGIK FÜR ZAHLUNGEN UND ÜBERZAHLUNG ---

async function handlePaymentAction(id, action, amount = 0, extras = null) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    const currentRest = parseFloat(p.remainingAmount);
    let payAmount = amount;

    if (action === 'mark_paid' && amount === 0) {
        payAmount = currentRest;
    }

    if (!p.isTBD && payAmount > currentRest + 0.01) {
        const overpayment = payAmount - currentRest;
        pendingOverpaymentData = {
            paymentId: id,
            payAmount: payAmount,
            debtAmount: currentRest,
            excessAmount: overpayment,
            extras: extras
        };

        const ovModal = document.getElementById('overpaymentModal');
        if (ovModal && ovModal.parentElement !== document.body) {
            document.body.appendChild(ovModal);
        }

        document.getElementById('overpayment-amount').textContent = overpayment.toFixed(2) + " €";
        ovModal.classList.remove('hidden');
        ovModal.style.display = 'flex';
        return;
    }

    await executePayment(id, action, payAmount, extras);
}
// Global verfügbar machen
window.handlePaymentAction = handlePaymentAction;





async function executePayment(id, action, amount, extras = null) {
    const p = allPayments.find(x => x.id === id);
    
    // 1. Prüfen, wer ich bin (Ersteller oder Eingeladener)
    const iAmCreator = p.createdBy === currentUser.mode;
    
    // --- BUG 4 FIX: Rechte explizit neu ermitteln ---
    // Wir müssen sicherstellen, dass wir die aktuellen Rechte aus der Datenbank kennen
    let myRights = 'none';
    if (iAmCreator) {
        myRights = 'owner';
    } else if (p.accessRights && p.accessRights[currentUser.mode]) {
        myRights = p.accessRights[currentUser.mode].rights;
    }

    // Prüfen, ob eine Genehmigung nötig ist
    // Bedingung: Ich bin NICHT der Ersteller UND mein Recht ist "transact_approve"
    const needsApproval = !iAmCreator && myRights === 'transact_approve';

    let updateData = {}; 
    let logEntry = ""; 
    let transaction = null;

    // --- HAUPT-LOGIK FÜR ZAHLUNGEN ---
    if (action === 'mark_paid' || action === 'partial_pay' || action === 'confirm_payment') {
        
        // Basis-Transaktionsobjekt erstellen
        transaction = { 
            date: new Date(), 
            amount: amount, 
            type: 'payment', 
            user: currentUser.displayName 
        };
        
        // Extras verarbeiten (Datum, Notiz, Konto)
        if (extras) {
            if (extras.customDate) {
                transaction.customDate = extras.customDate;
            }
            if (extras.note) {
                transaction.info = extras.note; 
            }
            if (extras.paymentMethodId) {
                const acc = allAccounts.find(a => a.id === extras.paymentMethodId);
                if (acc) {
                    transaction.paymentMethodId = acc.id;
                    transaction.paymentMethodName = acc.name;
                }
            }
        }
        
        // Fallback-Text, falls keine Notiz eingegeben wurde
        if (!transaction.info) {
             if (p.isTBD) {
                 transaction.info = "Vorauszahlung (Betrag noch unbekannt)";
             } else if (action === 'mark_paid') {
                 transaction.info = "Vollständige Zahlung";
             } else {
                 transaction.info = "Teilzahlung";
             }
        }
        
        // --- ZWEIG A: GENEHMIGUNG NÖTIG ---
        if (needsApproval) {
            transaction.approvalPending = true;
            transaction.type = 'payment_request';
            logEntry = `Zahlung von ${amount.toFixed(2)} € zur Genehmigung eingereicht.`;
            
            // Wir speichern nur die Transaktion und den Log-Eintrag, ändern aber NICHT den Kontostand
            updateData.history = [...(p.history || []), { 
                date: new Date(), 
                action: 'payment_request', 
                user: currentUser.displayName, 
                info: logEntry 
            }];
            updateData.transactions = [...(p.transactions || []), transaction];
            
        } 
        // --- ZWEIG B: DIREKTE BUCHUNG (Keine Genehmigung nötig) ---
        else {
            let newStatus = p.status;
            let newRest = parseFloat(p.remainingAmount);

            if (action === 'mark_paid' || action === 'confirm_payment') {
                // Alles bezahlen
                newRest = 0;
                newStatus = 'paid';
                logEntry = `Zahlung (${amount.toFixed(2)} €) verbucht. Status: Bezahlt.`;
            } else {
                // Teilzahlung oder TBD
                newRest -= amount;
                
                if (p.isTBD) {
                    // Bei TBD bleibt es immer offen, auch wenn man was zahlt
                    newStatus = 'open';
                    logEntry = `Vorauszahlung (${amount.toFixed(2)} €) verbucht.`;
                } else {
                    // Bei normaler Schuld: Wenn Rest 0 ist, dann "paid"
                    if (newRest <= 0.001) { 
                        newRest = 0; 
                        newStatus = 'paid'; 
                    }
                    logEntry = `Teilzahlung (${amount.toFixed(2)} €) verbucht.`;
                }
            }
            
            // Daten für das Update vorbereiten
            updateData.remainingAmount = newRest;
            updateData.status = newStatus;
            updateData.history = [...(p.history || []), { 
                date: new Date(), 
                action: 'paid', 
                user: currentUser.displayName, 
                info: logEntry 
            }];
            updateData.transactions = [...(p.transactions || []), transaction];
        }
    }
    // --- LOGIK FÜR MANUELLES SCHLIESSEN ---
    else if (action === 'force_close') {
        updateData.remainingAmount = 0;
        updateData.status = 'paid';
        updateData.history = [...(p.history || []), { 
            date: new Date(), 
            action: 'force_close', 
            user: currentUser.displayName, 
            info: "Manuell abgeschlossen." 
        }];
    }

    // --- DATENBANK UPDATE SENDEN ---
    try { 
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', id), updateData); 
        
        // Feedback geben
        if (needsApproval) {
            alertUser("Zur Genehmigung gesendet!", "success");
        } else {
            alertUser("Gespeichert.", "success");
        }

    } catch (e) { 
        console.error(e); 
        alertUser("Fehler: " + e.message, "error"); 
    }
}








async function resolveOverpayment(decision) {
    if (!pendingOverpaymentData) return;

    const { paymentId, payAmount, debtAmount, excessAmount, extras, isTBDResolution } = pendingOverpaymentData;
    const p = allPayments.find(x => x.id === paymentId);

    // Partner bestimmen (Wer kriegt das Guthaben?)
    let creditOwnerId, creditHolderId, creditOwnerName, creditHolderName;
    if (p.debtorId === currentUser.mode) {
        creditOwnerId = p.debtorId; creditOwnerName = p.debtorName; 
        creditHolderId = p.creditorId; creditHolderName = p.creditorName; 
    } else {
        creditOwnerId = p.debtorId; creditOwnerName = p.debtorName; 
        creditHolderId = p.creditorId; creditHolderName = p.creditorName; 
    }

    // --- INTELLIGENTE PRÜFUNG AUF GAST ---
    if (decision === 'credit') {
        const partnerIdToCheck = (creditOwnerId === currentUser.mode) ? creditHolderId : creditOwnerId;
        const partnerNameToCheck = (creditOwnerId === currentUser.mode) ? creditHolderName : creditOwnerName;

        const isRealUser = USERS[partnerIdToCheck];
        const isContact = allContacts.some(c => c.id === partnerIdToCheck);

        if (!isRealUser && !isContact && partnerIdToCheck !== currentUser.mode) {
            // Es ist ein Gast!
            if (confirm(`Guthaben kann nur für gespeicherte Kontakte angelegt werden.\n\nMöchtest du "${partnerNameToCheck}" jetzt als Kontakt anlegen?`)) {
                
                // 1. Duplikat Check
                const duplicateContact = allContacts.find(c => c.name.toLowerCase() === partnerNameToCheck.toLowerCase());
                const duplicateAccount = allAccounts.find(a => a.name.toLowerCase() === partnerNameToCheck.toLowerCase());
                
                if (duplicateContact || duplicateAccount) {
                    let errorMsgContext = duplicateContact ? "im Adressbuch" : "in 'Meine Konten'";
                    let conflictingName = duplicateContact ? duplicateContact.name : duplicateAccount.name;

                    alert(`⚠️ ACHTUNG: NAME EXISTIERT BEREITS!\n\nDer Name "${conflictingName}" ist bereits ${errorMsgContext} vorhanden.\n\nDas System kann diesen Gast nicht automatisch anlegen.\n\nBITTE:\n1. Klicke auf OK.\n2. Klicke im Fenster auf "Abbrechen".\n3. Gib den Betrag passend ein.\n4. Kläre den Namenskonflikt.\n5. Buche das Guthaben danach manuell.`);
                    return; 
                }

                // 2. Kontakt automatisch anlegen
                try {
                    setButtonLoading(document.getElementById('btn-op-credit'), true);
                    
                    const newContactRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'private-contacts'), {
                        name: partnerNameToCheck,
                        createdBy: currentUser.mode,
                        createdAt: serverTimestamp()
                    });
                    
                    const newContactId = newContactRef.id;
                    
                    // 3. Aktuelle Zahlung auf neuen Kontakt migrieren
                    const payRef = doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId);
                    const updates = {};
                    
                    let newInvolved = (p.involvedUserIds || []).filter(uid => uid !== partnerIdToCheck);
                    newInvolved.push(newContactId);
                    updates.involvedUserIds = newInvolved;

                    if (p.debtorId === partnerIdToCheck) { updates.debtorId = newContactId; }
                    if (p.creditorId === partnerIdToCheck) { updates.creditorId = newContactId; }

                    updates.history = [...(p.history || []), {
                        date: new Date(), action: 'migrated', user: currentUser.displayName,
                        info: `Automatisch von Gast zu Kontakt ${partnerNameToCheck} umgewandelt (für Guthaben).`
                    }];

                    await updateDoc(payRef, updates);

                    if (creditOwnerId === partnerIdToCheck) creditOwnerId = newContactId;
                    if (creditHolderId === partnerIdToCheck) creditHolderId = newContactId;

                    alertUser(`Kontakt "${partnerNameToCheck}" erstellt. Guthaben wird gebucht...`, "success");

                } catch (e) {
                    console.error(e);
                    alertUser("Fehler beim Anlegen des Kontakts: " + e.message, "error");
                    setButtonLoading(document.getElementById('btn-op-credit'), false);
                    return;
                }

            } else {
                return;
            }
        }
    }
    // -------------------------------------------

    const btnId = decision === 'credit' ? 'btn-op-credit' : 'btn-op-tip';
    setButtonLoading(document.getElementById(btnId), true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        let creditLink = "";
        let creditDocRef = null;
        if (decision === 'credit') {
            creditDocRef = doc(paymentsRef);
            const short = creditDocRef.id.slice(-4).toUpperCase();
            creditLink = `[LINK:${creditDocRef.id}:#${short}]`;
        }

        const isAdjustment = extras && extras.isAdjustment;
        const isTBDContext = isTBDResolution; // Nutzen wir den neuen Merker

        let logInfo = "";
        if (decision === 'credit') logInfo = `Überzahlung (${excessAmount.toFixed(2)} €) als Guthaben auf ${creditLink} gebucht.`;
        else logInfo = `Überzahlung (${excessAmount.toFixed(2)} €) als Trinkgeld verbucht.`;

        const payRef = doc(paymentsRef, paymentId);
        let finalUpdateData = {};

        // FALL 1: KORREKTUR MODUS
        if (isAdjustment) {
            const payload = extras.updatePayload;
            const reasonTexts = { 'correction': 'Korrektur', 'storno': 'Storno', 'interest': 'Zinsen/Gebühr', 'discount': 'Erlass/Rabatt', 'other': 'Anpassung' };
            const reasonText = reasonTexts[payload.adjustReason] || 'Anpassung';
            const diff = payload.amount - p.amount;
            const diffText = `(${diff.toFixed(2)})`;
            const adjustLog = `${reasonText}: ${diffText} | Neu: ${payload.amount.toFixed(2)}€ ${payload.adjustNote ? `(${payload.adjustNote})` : ''}`;

            finalUpdateData = {
                remainingAmount: 0,       
                amount: payload.amount,   
                status: 'paid',           
                isTBD: false,
                originalAmount: payload.originalAmount,
                originalPositions: payload.originalPositions,
                positions: payload.positions,
                history: [...(p.history || []),
                { date: new Date(), action: 'adjusted', user: currentUser.displayName, info: adjustLog },
                { date: new Date(), action: 'paid_excess', user: currentUser.displayName, info: logInfo }
                ]
            };

        // FALL 2: TBD AUFLÖSUNG (Hier werden die Daten jetzt erst geschrieben!)
        } else if (isTBDContext) {
            const payload = extras.tbdPayload;
            
            finalUpdateData = {
                amount: payload.amount, // Der neue Endbetrag (z.B. 50€)
                remainingAmount: 0,     // Alles ist bezahlt (inkl. Überzahlung)
                isTBD: false,           // TBD Flag entfernen
                status: 'paid',
                positions: payload.positions,
                history: [...(p.history || []), 
                    { date: new Date(), action: 'tbd_resolved', user: currentUser.displayName, info: `Betrag nachgetragen: ${payload.amount.toFixed(2)} €.` },
                    { date: new Date(), action: 'paid_excess', user: currentUser.displayName, info: logInfo }
                ]
            };

        // FALL 3: NORMALE ÜBERZAHLUNG
        } else {
            finalUpdateData = {
                remainingAmount: 0,
                status: 'paid',
                history: [...(p.history || []), { date: new Date(), action: 'paid_excess', user: currentUser.displayName, info: logInfo }]
            };

            // Transaktion hinzufügen, wenn es keine reine Korrektur war
            if (!p.isTBD) {
                finalUpdateData.transactions = [...(p.transactions || []), {
                    date: new Date(),
                    amount: debtAmount, 
                    type: 'payment',
                    user: currentUser.displayName,
                    info: `Zahlung inkl. Überzahlung`
                }];
            }
        }

        batch.update(payRef, finalUpdateData);

        if (decision === 'credit' && creditDocRef) {
            const originShort = paymentId.slice(-4).toUpperCase();
            const originLink = `[LINK:${paymentId}:#${originShort}]`;

            batch.set(creditDocRef, {
                title: `Guthaben aus Überzahlung`,
                amount: excessAmount,
                remainingAmount: excessAmount,
                isTBD: false,
                type: 'credit',
                status: 'open',
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode,
                debtorId: creditOwnerId,   
                debtorName: creditOwnerName,
                creditorId: creditHolderId, 
                creditorName: creditHolderName,
                involvedUserIds: [creditOwnerId, creditHolderId],
                history: [{ date: new Date(), action: 'created_credit', user: currentUser.displayName, info: `Aus Überzahlung von ${originLink}.` }]
            });
            alertUser("Guthaben angelegt und Fall geschlossen!", "success");
        } else {
            alertUser("Als Trinkgeld verbucht und Fall geschlossen.", "success");
        }

        await batch.commit();
        document.getElementById('overpaymentModal').style.display = 'none';
        closeDetailModal();
        pendingOverpaymentData = null;

    } catch (e) { console.error(e); alertUser(e.message, "error"); }
    finally { setButtonLoading(document.getElementById(btnId), false); }
}









// Transaktion löschen (Neu)
window.deleteTransaction = async function (paymentId, txIndex) {
    const p = allPayments.find(x => x.id === paymentId);
    if (!p || !p.transactions) return;
    if (!confirm("Diese Zahlung stornieren? Der Betrag wird wieder offen.")) return;

    const tx = p.transactions[txIndex];
    const amountToAddBack = parseFloat(tx.amount);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        // 1. Haupt-Eintrag zurücksetzen
        const newTransactions = p.transactions.filter((_, i) => i !== txIndex);
        const newRemaining = parseFloat(p.remainingAmount) + amountToAddBack;
        const debtRef = doc(paymentsRef, paymentId);

        batch.update(debtRef, {
            remainingAmount: newRemaining,
            status: 'open',
            transactions: newTransactions,
            history: [...(p.history || []), {
                date: new Date(),
                action: 'tx_deleted',
                user: currentUser.displayName,
                info: `Zahlung von ${amountToAddBack.toFixed(2)}€ storniert.`
            }]
        });

        // 2. Falls es eine Guthaben-Zahlung war -> Guthaben erstatten
        if (tx.type === 'credit_usage' && tx.creditSources) {
            for (const source of tx.creditSources) {
                // Wir müssen den aktuellen Zustand des Guthaben-Eintrags holen
                // Da wir allPayments live haben, suchen wir ihn dort.
                const creditEntry = allPayments.find(x => x.id === source.id);

                if (creditEntry) {
                    const currentCreditRest = parseFloat(creditEntry.remainingAmount);
                    const newCreditRest = currentCreditRest + parseFloat(source.amount);
                    const creditRef = doc(paymentsRef, source.id);

                    const shortDebtId = paymentId.slice(-4).toUpperCase();
                    const linkToDebt = `[LINK:${paymentId}:#${shortDebtId}]`;

                    batch.update(creditRef, {
                        remainingAmount: newCreditRest,
                        status: 'open', // Wieder öffnen, falls es zu war
                        history: [...(creditEntry.history || []), {
                            date: new Date(),
                            action: 'credit_refunded',
                            user: currentUser.displayName,
                            info: `Rückerstattung (${parseFloat(source.amount).toFixed(2)} €) durch Storno von ${linkToDebt}.`
                        }]
                    });
                } else {
                    console.warn("Ursprünglicher Guthaben-Eintrag nicht mehr gefunden:", source.id);
                    // Optional: Alert, aber wir lassen den Prozess nicht crashen
                }
            }
        }

        await batch.commit();
        alertUser("Zahlung storniert und ggf. Guthaben erstattet.", "success");
        // UI Refresh via Listener (automatisch) oder manuell
        // closeDetailModal(); // Offen lassen zum sehen
    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Löschen.", "error");
    }
}


// --- HELPER: DROPDOWN BEFÜLLEN (INKL. EIGENER USER) ---
// --- HELPER: DROPDOWN BEFÜLLEN (INKL. EIGENER USER) ---
function fillDropdown(selectElement, type) {
    selectElement.innerHTML = '';
    selectElement.innerHTML = '<option value="">- Bitte wählen -</option>';

    // 1. MEINE KONTEN
    if (allAccounts.length > 0) {
        const grpAcc = document.createElement('optgroup');
        grpAcc.label = "━━ MEINE KONTEN ━━";
        allAccounts.forEach(acc => {
            const opt = document.createElement('option');
            opt.value = `ACC:${acc.id}`;
            opt.dataset.type = "account";
            opt.dataset.details = acc.details || "";
            opt.textContent = acc.name;
            grpAcc.appendChild(opt);
        });
        selectElement.appendChild(grpAcc);
    }

    // 2. REGISTRIERTE PERSONEN
    const grpUsers = document.createElement('optgroup');
    grpUsers.label = "━━ PERSONEN ━━";
    Object.values(USERS).forEach(user => {
        if (user.isActive) { 
            const opt = document.createElement('option');
            opt.value = `USR:${user.id}`;
            opt.dataset.type = "user";
            opt.textContent = user.realName || user.name;

            // Markiere mich selbst zur Orientierung
            if (user.id === currentUser.mode) {
                opt.textContent += " (Ich)";
                // Fettdruck wird am Handy oft ignoriert, aber wir lassen es für PC drin
                opt.style.fontWeight = "bold";
            }

            grpUsers.appendChild(opt);
        }
    });
    selectElement.appendChild(grpUsers);

    // 3. EIGENE KONTAKTE
    const grpContacts = document.createElement('optgroup');
    grpContacts.label = "━━ EIGENE KONTAKTE ━━";
    allContacts.forEach(contact => {
        const opt = document.createElement('option');
        opt.value = `CON:${contact.id}`;
        opt.dataset.type = "contact";
        opt.textContent = contact.name;
        grpContacts.appendChild(opt);
    });
    selectElement.appendChild(grpContacts);
}


// --- TABS LOGIK ---
// --- TABS LOGIK ---
function openSettingsTab(tabName) {
    // NEU: 'archive' hinzugefügt
    const tabs = ['templates', 'contacts', 'credits', 'accounts', 'categories', 'requests', 'archive'];

    tabs.forEach(t => {
        const btn = document.getElementById(`tab-zv-${t}`);
        const content = document.getElementById(`content-zv-${t}`);

        if (!btn || !content) return;

        if (t === tabName) {
            // Aktiver Tab
            btn.className = "px-4 py-2 font-bold text-indigo-600 border-b-2 border-indigo-600 whitespace-nowrap";
            content.classList.remove('hidden');

            // Render-Funktionen aufrufen
            if (tabName === 'categories') renderCategoryList();
            if (tabName === 'contacts') renderContactList();
            if (tabName === 'accounts') renderAccountList();
            if (tabName === 'templates') renderTemplateList();
            if (tabName === 'credits') renderCreditOverview();
            if (tabName === 'requests') renderRequestOverview();
            // NEU:
            if (tabName === 'archive') renderArchiveOverview();

        } else {
            // Inaktiver Tab
            btn.className = "px-4 py-2 font-bold text-gray-500 hover:text-gray-700 whitespace-nowrap";
            content.classList.add('hidden');
        }
    });
}




// --- KONTEN VERWALTUNG (NEU) ---
async function addAccountFromSettings() {
    const nameInput = document.getElementById('new-account-name');
    const detailsInput = document.getElementById('new-account-details');
    const name = nameInput.value.trim();
    const details = detailsInput.value.trim();

    if (!name) return;

    // --- NEU: SICHERHEITSPRÜFUNG ---
    // 1. Prüfen ob Konto schon existiert
    const existsAccount = allAccounts.some(a => a.name.toLowerCase() === name.toLowerCase());
    if (existsAccount) {
        alertUser("Ein Konto mit diesem Namen existiert bereits.", "error");
        return;
    }

    // 2. Prüfen ob im Adressbuch (Verwechslungsgefahr)
    const existsContact = allContacts.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (existsContact) {
        alertUser("Name wird bereits im Adressbuch verwendet. Bitte eindeutigen Namen wählen.", "error");
        return;
    }

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'private-accounts'), {
            name, details, createdBy: currentUser.mode, createdAt: serverTimestamp()
        });
        alertUser("Konto erstellt!", "success");
        nameInput.value = '';
        detailsInput.value = '';
    } catch (e) { console.error(e); alertUser("Fehler.", "error"); }
}


async function deleteAccount(id) {
    // 1. Prüfen ob es ein System-Konto ist (z.B. Bargeld)
    const acc = allAccounts.find(a => a.id === id);
    if (acc && acc.isSystem) {
        alertUser("Dieses Standard-Konto kann nicht gelöscht werden.", "error");
        return;
    }

    // --- NEU: SICHERHEITSPRÜFUNG ---
    // Wir prüfen, ob dieses Konto in irgendeiner offenen Zahlung als 
    // Schuldner (debtorId) oder Gläubiger (creditorId) eingetragen ist.
    
    const hasActiveItems = allPayments.some(p => 
        (p.status === 'open' || p.status === 'pending_approval') &&
        (p.debtorId === id || p.creditorId === id) &&
        parseFloat(p.remainingAmount) > 0.001
    );

    if (hasActiveItems) {
        alertUser("Löschen blockiert: Dieses Konto ist noch in offenen Zahlungen involviert.", "error_long");
        return;
    }

    // 2. Eigentliches Löschen
    if (!confirm("Konto löschen?")) return;
    
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'private-accounts', id));
        alertUser("Konto gelöscht.", "success");
    } catch (e) { 
        console.error(e); 
        alertUser("Fehler beim Löschen.", "error");
    }
}



function renderAccountList() {
    const container = document.getElementById('zv-accounts-list');
    if (!container) return;
    container.innerHTML = '';

    if (allAccounts.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 italic">Keine Konten verfügbar.</p>';
        return;
    }

    allAccounts.forEach(acc => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-white rounded shadow-sm border";

        // Wenn es ein System-Konto ist (Bargeld), zeigen wir ein Schloss oder nichts statt dem Mülleimer
        let actionHtml = '';
        if (acc.isSystem) {
            actionHtml = `<span class="text-gray-300 text-xs italic pr-2">Standard</span>`;
        } else {
            actionHtml = `<button class="delete-acc-btn p-1 text-red-400 hover:bg-red-50 rounded" data-id="${acc.id}">🗑️</button>`;
        }

        div.innerHTML = `
            <div>
                <span class="font-bold text-blue-700 block">${acc.name}</span>
                <span class="text-xs text-gray-500">${acc.details || ''}</span>
            </div>
            ${actionHtml}
        `;
        container.appendChild(div);
    });
}

// --- KONTAKTE VERWALTUNG (KOMPLETT NEU) ---

async function addContact(name) {
    const cleanName = name.trim();
    if (!cleanName) return false;

    // --- NEU: SICHERHEITSPRÜFUNG ---
    // 1. Prüfen ob schon im Adressbuch
    const existsContact = allContacts.some(c => c.name.toLowerCase() === cleanName.toLowerCase());
    if (existsContact) {
        alertUser("Dieser Name existiert bereits im Adressbuch.", "error");
        return false;
    }

    // 2. Prüfen ob in "Meine Konten" (Verwechslungsgefahr)
    const existsAccount = allAccounts.some(a => a.name.toLowerCase() === cleanName.toLowerCase());
    if (existsAccount) {
        alertUser("Name existiert bereits unter 'Meine Konten'. Bitte einen anderen Namen wählen.", "error");
        return false;
    }

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'private-contacts'), {
            name: cleanName,
            createdBy: currentUser.mode,
            createdAt: serverTimestamp()
        });
        return true;
    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Erstellen des Kontakts.", "error");
        return false;
    }
}


async function addContactFromSettings() {
    const input = document.getElementById('new-contact-name-input');
    const name = input.value;
    if (await addContact(name)) {
        alertUser("Kontakt erstellt!", "success");
        input.value = '';
    }
}

async function deleteContact(id) {
    // --- SICHERHEITSPRÜFUNG ---
    // Wir schauen, ob dieser Kontakt in irgendeiner offenen Zahlung verwickelt ist.
    // Bedingungen:
    // 1. Status ist 'open' oder 'pending_approval'
    // 2. Der Kontakt ist entweder Schuldner (debtorId) ODER Gläubiger (creditorId)
    // 3. Es ist noch ein Restbetrag > 0 offen
    
    const hasActiveItems = allPayments.some(p => 
        (p.status === 'open' || p.status === 'pending_approval') &&
        (p.debtorId === id || p.creditorId === id) &&
        parseFloat(p.remainingAmount) > 0.001
    );

    if (hasActiveItems) {
        alertUser("Löschen blockiert: Es gibt noch offene Zahlungen oder Guthaben mit diesem Kontakt. Bitte erst begleichen oder auf 0 setzen.", "error_long");
        return;
    }

    if (!confirm("Kontakt endgültig löschen?")) return;
    
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'private-contacts', id));
        alertUser("Kontakt gelöscht.", "success");
    } catch (e) { 
        console.error(e); 
        alertUser("Fehler beim Löschen.", "error");
    }
}


async function renameContact(id) {
    // --- SICHERHEITSPRÜFUNG ---
    // Auch beim Umbenennen prüfen wir auf offene Fälle, um Verwirrung in der Historie zu vermeiden.
    
    const hasActiveItems = allPayments.some(p => 
        (p.status === 'open' || p.status === 'pending_approval') &&
        (p.debtorId === id || p.creditorId === id) &&
        parseFloat(p.remainingAmount) > 0.001
    );

    if (hasActiveItems) {
        alertUser("Namensänderung blockiert: Es laufen noch offene Zahlungen mit diesem Kontakt.", "error_long");
        return;
    }

    const contact = allContacts.find(c => c.id === id);
    if (!contact) return;

    const newName = prompt("Neuer Name:", contact.name);
    
    if (newName && newName.trim() && newName !== contact.name) {
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'private-contacts', id), { 
                name: newName.trim() 
            });
            alertUser("Kontakt umbenannt.", "success");
        } catch (e) { 
            console.error(e); 
            alertUser("Fehler beim Umbenennen.", "error");
        }
    }
}



// Generiert einen zufälligen Sicherheits-Token (12 Zeichen)
function generateGuestToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}


function renderContactList() {
    const container = document.getElementById('zv-contacts-list');
    if (!container) return;
    container.innerHTML = '';

    // Helper zum Rendern der Token-Infos
    const renderTokenInfo = (obj, collectionName, docId) => {
        const hasToken = !!obj.guestToken;
        let infoHtml = '<span class="text-[10px] text-gray-400 italic">Kein Link aktiv</span>';
        
        if (hasToken) {
            const date = obj.guestTokenCreatedAt?.toDate ? obj.guestTokenCreatedAt.toDate() : new Date();
            const dateStr = date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const count = obj.guestTokenViews || 0;
            infoHtml = `<span class="text-[10px] text-indigo-400 font-medium">Generiert: ${dateStr} • Aufrufe: ${count}</span>`;
        }

        return { hasToken, infoHtml };
    };

    // Helper: Token neu generieren (FÜR ALLE ERLAUBT)
    const handleRegenerate = async (collectionName, docId, currentToken, btnElement) => {
        if (currentToken && !confirm("Achtung: Wenn du einen neuen Link generierst, wird der alte Link SOFORT ungültig!\n\nFortfahren?")) return;
        
        const btnContent = btnElement.innerHTML;
        btnElement.innerHTML = '⏳';
        btnElement.disabled = true;

        try {
            const newToken = generateGuestToken();
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, docId), {
                guestToken: newToken,
                guestTokenCreatedAt: serverTimestamp(),
                guestTokenViews: 0
            });
            
            alertUser("Neuer Link generiert!", "success");
        } catch (e) {
            console.error(e);
            if (e.code === 'permission-denied') {
                alertUser("Fehler: Fehlende Schreibrechte in der Datenbank für diesen Benutzer.", "error");
            } else {
                alertUser("Fehler beim Generieren: " + e.message, "error");
            }
        } finally {
            btnElement.innerHTML = btnContent;
            btnElement.disabled = false;
        }
    };

    // Helper: Link kopieren (FÜR ALLE ERLAUBT)
    const handleCopyLink = async (collectionName, docId, currentToken) => {
        let tokenToUse = currentToken;

        if (!tokenToUse) {
            try {
                tokenToUse = generateGuestToken();
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, docId), {
                    guestToken: tokenToUse,
                    guestTokenCreatedAt: serverTimestamp(),
                    guestTokenViews: 0
                });
            } catch (e) {
                console.error(e);
                if (e.code === 'permission-denied') {
                    alertUser("Fehler: Du hast keine Berechtigung, einen Link für diesen Benutzer zu erstellen.", "error");
                } else {
                    alertUser("Fehler beim Erstellen des Links.", "error");
                }
                return;
            }
        }

        const baseUrl = window.location.origin + window.location.pathname;
        const link = `${baseUrl}?guest_id=${docId}&token=${tokenToUse}`;
        
        navigator.clipboard.writeText(link).then(() => {
            alertUser("Sicherer Gast-Link kopiert!", "success");
        }).catch(() => prompt("Link kopieren:", link));
    };


    // --- TEIL 1: MEIN ADRESSBUCH (Manuelle Kontakte) ---
    const headerContacts = document.createElement('div');
    headerContacts.className = "font-bold text-gray-500 text-xs uppercase mb-2 px-1";
    headerContacts.textContent = "Mein Adressbuch (Manuell)";
    container.appendChild(headerContacts);

    if (allContacts.length === 0) {
        const empty = document.createElement('p');
        empty.className = "text-center text-gray-400 italic text-sm mb-4";
        empty.textContent = "Keine manuellen Kontakte.";
        container.appendChild(empty);
    } else {
        allContacts.forEach(c => {
            const { hasToken, infoHtml } = renderTokenInfo(c, 'private-contacts', c.id);

            const div = document.createElement('div');
            div.className = "p-3 bg-white rounded-lg shadow-sm border hover:shadow-md transition mb-2";
            div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center font-bold text-xs">
                            ${c.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <span class="font-bold text-gray-700 block leading-tight">${c.name}</span>
                            ${infoHtml}
                        </div>
                    </div>
                    <div class="flex gap-1">
                        <button class="copy-contact-link-btn px-2 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded hover:bg-blue-100 transition border border-blue-200" title="Link kopieren">
                            🔗 Link
                        </button>
                        <button class="regen-contact-token-btn px-2 py-1.5 bg-gray-50 text-gray-600 text-xs font-bold rounded hover:bg-gray-100 transition border border-gray-200" title="Link erneuern / ungültig machen">
                            ↻
                        </button>
                    </div>
                </div>
                
                <div class="flex gap-1 justify-end pt-2 border-t border-gray-100">
                    <button class="migrate-contact-btn p-1.5 text-gray-400 hover:bg-orange-50 hover:text-orange-600 rounded text-xs" data-id="${c.id}" title="In User umwandeln">🔄 User</button>
                    <button class="edit-contact-btn p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600 rounded text-xs" data-id="${c.id}" title="Umbenennen">✏️ Edit</button>
                    <button class="delete-contact-btn p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded text-xs" data-id="${c.id}" title="Löschen">🗑️ Löschen</button>
                </div>
            `;
            
            div.querySelector('.copy-contact-link-btn').onclick = () => handleCopyLink('private-contacts', c.id, c.guestToken);
            div.querySelector('.regen-contact-token-btn').onclick = (e) => handleRegenerate('private-contacts', c.id, c.guestToken, e.target);

            container.appendChild(div);
        });
    }

    // --- TEIL 2: REGISTRIERTE SYSTEM-USER ---
    const headerUsers = document.createElement('div');
    headerUsers.className = "font-bold text-gray-500 text-xs uppercase mb-2 mt-6 pt-4 border-t border-gray-200 px-1";
    headerUsers.textContent = "Registrierte Personen im System";
    container.appendChild(headerUsers);

    // FIX: Nutze allSystemUsers (Live) statt USERS (Statisch)
    // Wenn allSystemUsers noch leer ist (beim allerersten Laden), Fallback auf USERS versuchen oder leer lassen
    let usersSource = allSystemUsers.length > 0 ? allSystemUsers : Object.values(USERS);
    
    const systemUsers = usersSource.filter(u => u.id !== currentUser.mode && u.isActive);

    if (systemUsers.length === 0) {
        const emptyUsers = document.createElement('p');
        emptyUsers.className = "text-center text-gray-400 italic text-sm";
        emptyUsers.textContent = "Keine anderen Benutzer im System.";
        container.appendChild(emptyUsers);
    } else {
        systemUsers.forEach(user => {
            const displayName = user.realName || user.name;
            const { hasToken, infoHtml } = renderTokenInfo(user, 'user-config', user.id);
            
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg shadow-sm hover:shadow-md transition mb-2";
            
            div.innerHTML = `
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs">
                        ${displayName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <span class="font-bold text-gray-800 block leading-tight">${displayName}</span>
                        <span class="text-[10px] text-indigo-400 block mb-0.5">Registrierter Nutzer</span>
                        ${infoHtml}
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <button class="copy-user-link-btn px-3 py-1 bg-white border border-gray-200 text-gray-600 text-xs font-bold rounded hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition shadow-sm">
                        🔗 Link
                    </button>
                    <button class="regen-user-token-btn px-3 py-1 bg-white border border-gray-200 text-gray-400 text-xs font-bold rounded hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition shadow-sm">
                        ↻ Neu
                    </button>
                </div>
            `;

            div.querySelector('.copy-user-link-btn').onclick = () => handleCopyLink('user-config', user.id, user.guestToken);
            div.querySelector('.regen-user-token-btn').onclick = (e) => handleRegenerate('user-config', user.id, user.guestToken, e.target);

            container.appendChild(div);
        });
    }
}



// --- VORLAGEN (TEMPLATES) LOGIK (NEU) ---

async function saveCurrentAsTemplate() {
    const title = document.getElementById('payment-title').value.trim();
    // Wir brauchen zumindest einen Titel im Formular als Basis
    if (!title) { alertUser("Bitte gib erst einen Titel/Betreff für die Zahlung ein.", "error"); return; }

    // 1. Name für die Vorlage abfragen
    const tplName = prompt("Bitte einen Namen für diese Vorlage eingeben:", title);
    if (!tplName || !tplName.trim()) return; // Abbrechen gedrückt

    // 2. Prüfen ob Name schon existiert (Duplikat-Check)
    // Wir prüfen 'name' (neu) und 'title' (alt)
    const exists = allTemplates.some(t => (t.name || t.title).toLowerCase() === tplName.trim().toLowerCase());
    if (exists) {
        alertUser("Eine Vorlage mit diesem Namen existiert bereits.", "error");
        return;
    }

    // Werte auslesen
    const amount = parseFloat(document.getElementById('payment-amount').value) || 0;
    const categoryId = document.getElementById('payment-category-select').value;

    // Schuldner Status ermitteln
    const debManualHidden = document.getElementById('payment-debtor-manual').classList.contains('hidden');
    const debtorVal = debManualHidden ? document.getElementById('payment-debtor-select').value : null;
    const debtorMan = !debManualHidden ? document.getElementById('payment-debtor-manual').value : null;

    // Gläubiger Status ermitteln
    const credManualHidden = document.getElementById('payment-creditor-manual').classList.contains('hidden');
    const creditorVal = credManualHidden ? document.getElementById('payment-creditor-select').value : null;
    const creditorMan = !credManualHidden ? document.getElementById('payment-creditor-manual').value : null;

    const tplData = {
        name: tplName.trim(), // NEU: Der Anzeigename der Vorlage
        title: title,         // Der Betreff der Zahlung
        amount: amount,
        categoryId: categoryId,
        debtorVal: debtorVal,
        debtorMan: debtorMan,
        creditorVal: creditorVal,
        creditorMan: creditorMan,
        createdBy: currentUser.mode
    };

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'payment-templates'), tplData);
        alertUser("Vorlage gespeichert!", "success");
    } catch (e) { console.error(e); alertUser("Fehler beim Speichern.", "error"); }
}



function renderTemplateList() {
    const container = document.getElementById('zv-templates-list');
    if (!container) return;
    container.innerHTML = '';

    if (allTemplates.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 italic">Keine Vorlagen.</p>';
        return;
    }

    allTemplates.forEach(tpl => {
        const displayName = tpl.name || tpl.title; // Fallback für alte Vorlagen

        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 bg-white rounded shadow-sm border hover:shadow-md";
        div.innerHTML = `
            <div>
                <p class="font-bold text-gray-800">${displayName}</p>
                <p class="text-xs text-gray-500">${tpl.amount ? tpl.amount.toFixed(2) + '€' : 'Variabel'}</p>
            </div>
            <div class="flex gap-1">
                <button class="edit-tpl-btn text-indigo-400 hover:text-indigo-600 p-2" data-id="${tpl.id}" title="Umbenennen">
                    ✏️
                </button>
                <button class="delete-tpl-btn text-red-400 hover:text-red-600 p-2" data-id="${tpl.id}" title="Löschen">
                    🗑️
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}


async function deleteTemplate(id) {
    if (!confirm("Vorlage wirklich löschen?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payment-templates', id));
    } catch (e) { console.error(e); }
}


async function renameTemplate(id) {
    const tpl = allTemplates.find(t => t.id === id);
    if (!tpl) return;

    const oldName = tpl.name || tpl.title;
    const newName = prompt("Neuer Name für die Vorlage:", oldName);

    if (!newName || newName.trim() === "" || newName === oldName) return;

    // Duplikat-Check (ausgenommen die eigene ID)
    const exists = allTemplates.some(t => t.id !== id && (t.name || t.title).toLowerCase() === newName.trim().toLowerCase());
    if (exists) {
        alertUser("Dieser Name ist bereits vergeben.", "error");
        return;
    }

    try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payment-templates', id), {
            name: newName.trim()
        });
        alertUser("Vorlage umbenannt.", "success");
    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Umbenennen.", "error");
    }
}

function updateTemplateDropdown() {
    const select = document.getElementById('payment-template-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Vorlage wählen --</option>';
    allTemplates.forEach(tpl => {
        const opt = document.createElement('option');
        opt.value = tpl.id;
        // Zeige 'name' wenn vorhanden, sonst 'title'
        opt.textContent = tpl.name || tpl.title;
        select.appendChild(opt);
    });
}

function applySelectedTemplate() {
    const id = document.getElementById('payment-template-select').value;
    const tpl = allTemplates.find(t => t.id === id);
    if (!tpl) return;

    // NEU: Sofort zur Eingabemaske wechseln (Szenario-Auswahl überspringen)
    document.getElementById('scenario-selector-container').classList.add('hidden');
    document.getElementById('transaction-details-container').classList.remove('hidden');

    // 1. Basisdaten setzen
    document.getElementById('payment-title').value = tpl.title || "";
    if (tpl.amount) {
        const amountInput = document.getElementById('payment-amount');
        amountInput.value = tpl.amount;
        // Falls wir im Edit-Mode sind, bleibt es disabled, bei Neu ist es enabled
        // (Das wird durch openCreateModal gesteuert, hier greifen wir nur auf Werte zu)
    }
    if (tpl.categoryId) document.getElementById('payment-category-select').value = tpl.categoryId;

    // 2. Schuldner setzen
    if (tpl.debtorVal) {
        toggleInputMode('debtor', false);
        document.getElementById('payment-debtor-select').value = tpl.debtorVal;
    } else if (tpl.debtorMan) {
        toggleInputMode('debtor', true);
        document.getElementById('payment-debtor-manual').value = tpl.debtorMan;
    }

    // 3. Gläubiger setzen
    if (tpl.creditorVal) {
        toggleInputMode('creditor', false);
        document.getElementById('payment-creditor-select').value = tpl.creditorVal;
    } else if (tpl.creditorMan) {
        toggleInputMode('creditor', true);
        document.getElementById('payment-creditor-manual').value = tpl.creditorMan;
    }

    updateCreditorHint();
}


// --- GUTHABEN (CREDIT) LOGIK (NEU) ---
function renderCreditOverview() {
    const container = document.getElementById('content-zv-credits');
    const myCreditsList = document.getElementById('my-credits-list');
    const othersCreditsList = document.getElementById('others-credits-list');

    if (!container || !myCreditsList || !othersCreditsList) return;

    // 1. Checkbox UI automatisch einfügen (falls noch nicht da)
    if (!document.getElementById('credit-filter-controls')) {
        const controls = document.createElement('div');
        controls.id = 'credit-filter-controls';
        controls.className = "mb-4 flex justify-end px-1";
        controls.innerHTML = `
            <label class="flex items-center gap-2 cursor-pointer bg-gray-100 px-3 py-1 rounded-full border border-gray-200 hover:bg-gray-200 transition shadow-sm">
                <input type="checkbox" id="cb-show-closed-credits" class="h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500" ${showClosedCredits ? 'checked' : ''}>
                <span class="text-xs font-bold text-gray-600">Leere Guthaben-Posten anzeigen</span>
            </label>
        `;
        // Ganz oben im Container einfügen
        container.insertBefore(controls, container.firstChild);

        // Listener anhängen
        document.getElementById('cb-show-closed-credits').addEventListener('change', (e) => {
            showClosedCredits = e.target.checked;
            renderCreditOverview(); // Liste neu laden
        });
    }

    myCreditsList.innerHTML = '';
    othersCreditsList.innerHTML = '';

    // 2. Daten filtern
    const credits = allPayments.filter(p => {
        if (p.type !== 'credit') return false;

        // Offene immer anzeigen
        if (p.status === 'open' && parseFloat(p.remainingAmount) > 0.001) return true;

        // Geschlossene/Leere nur anzeigen, wenn Checkbox aktiv
        if (showClosedCredits) {
            return (p.status === 'paid' || parseFloat(p.remainingAmount) <= 0.001);
        }

        return false;
    });

    // 1. Mein Guthaben (Ich bin creditor)
    const myCreditsRaw = credits.filter(p => p.creditorId === currentUser.mode);
    renderGroupedCredits(myCreditsRaw, myCreditsList, 'my');

    // 2. Fremdes Guthaben (Ich bin debtor)
    const othersCreditsRaw = credits.filter(p => p.debtorId === currentUser.mode);
    renderGroupedCredits(othersCreditsRaw, othersCreditsList, 'other');
}


function renderGroupedCredits(rawList, container, context) {
    if (rawList.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 italic">Leer.</p>';
        return;
    }

    // Gruppieren nach Partner ID
    const groups = {};
    rawList.forEach(p => {
        // Wer ist der Partner?
        const partnerId = (context === 'my') ? p.debtorId : p.creditorId;
        const partnerName = (context === 'my') ? p.debtorName : p.creditorName;

        // ID generieren (falls manueller Name ohne ID, nutzen wir den Namen als Key)
        const key = partnerId || partnerName;

        if (!groups[key]) {
            groups[key] = {
                name: partnerName,
                total: 0,
                count: 0,
                ids: [], // Wir speichern alle IDs dieser Person
                context: context
            };
        }
        groups[key].total += parseFloat(p.remainingAmount);
        groups[key].count++;
        groups[key].ids.push(p.id);
    });

    // Rendern
    Object.values(groups).forEach(g => {
        const div = document.createElement('div');
        const colorClass = context === 'my' ? 'bg-purple-50 border-purple-100 text-purple-900' : 'bg-orange-50 border-orange-100 text-orange-900';
        const amountClass = context === 'my' ? 'text-purple-700' : 'text-orange-700';

        div.className = `flex justify-between items-center p-3 rounded border ${colorClass} cursor-pointer hover:shadow-md transition`;
        div.onclick = () => openCreditDetails(g); // Klick öffnet Details

        div.innerHTML = `
            <div class="flex items-center gap-2">
                <div>
                    <p class="font-bold">${g.name}</p>
                    <p class="text-xs text-gray-500">${g.count} Eintrag/Einträge</p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                 <span class="font-mono font-bold text-lg ${amountClass}">${g.total.toFixed(2)}€</span>
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-gray-400"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" /></svg>
            </div>
        `;
        container.appendChild(div);
    });
}


// --- NEU: CREDIT DETAILS ANZEIGEN ---
// --- NEU: CREDIT DETAILS ANZEIGEN (Mit Uhrzeit) ---
function openCreditDetails(group) {
    const modal = document.getElementById('creditDetailsModal');
    const list = document.getElementById('credit-details-list');

    document.getElementById('credit-details-title').textContent = group.name;
    document.getElementById('credit-details-total').textContent = group.total.toFixed(2) + " €";
    list.innerHTML = '';

    // Helper: Links reparieren
    const parseLinks = (text) => {
        if (!text) return "";
        return text.replace(/\[LINK:([^:]+):([^\]]+)\]/g, (match, id, label) => {
            return `<span class="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer font-bold" onclick="document.getElementById('creditDetailsModal').style.display='none'; setTimeout(() => openPaymentDetail('${id}'), 100); event.stopPropagation();">${label}</span>`;
        });
    };

    const entries = allPayments.filter(p => group.ids.includes(p.id));

    // Sortieren: Offene zuerst, dann Datum
    entries.sort((a, b) => {
        const remA = parseFloat(a.remainingAmount);
        const remB = parseFloat(b.remainingAmount);
        if (remA > 0 && remB <= 0) return -1;
        if (remA <= 0 && remB > 0) return 1;
        return b.createdAt - a.createdAt;
    });

    entries.forEach(p => {
        const row = document.createElement('div');
        const currentAmount = parseFloat(p.remainingAmount);
        const isPaid = currentAmount <= 0.001;

        // Style anpassen für erledigte Einträge
        row.className = isPaid
            ? "bg-gray-50 border border-gray-200 rounded shadow-sm p-2 mb-2 opacity-90"
            : "bg-white border border-indigo-100 rounded shadow-sm p-2 mb-2";

        const btnText = group.context === 'my' ? "Abbuchen" : "Auszahlen";
        
        // PUNKT 4 OPTIMIERUNG: Datum + Uhrzeit für den Haupteintrag
        const dateObj = new Date(p.createdAt?.toDate ? p.createdAt.toDate() : p.createdAt);
        const dateStr = dateObj.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

        let actionBtnHtml = '';
        if (isPaid) {
            actionBtnHtml = `<button class="delete-credit-entry-btn text-xs bg-white text-gray-400 border border-gray-200 px-2 py-1 rounded hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition" title="Eintrag löschen">🗑️ Löschen</button>`;
        } else {
            actionBtnHtml = `<button class="text-xs bg-red-50 text-red-600 px-2 py-1 rounded border border-red-100 hover:bg-red-100 action-btn" data-id="${p.id}">${btnText}</button>`;
        }

        row.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="text-sm font-bold text-gray-800 ${isPaid ? 'line-through text-gray-500' : ''}">${p.title}</p>
                    <p class="text-xs text-gray-500">${dateStr} • ID: #${p.id.slice(-4).toUpperCase()}</p>
                </div>
                <div class="text-right">
                    <p class="font-mono font-bold ${isPaid ? 'text-gray-400' : 'text-gray-800'}">${currentAmount.toFixed(2)}€</p>
                    <div class="flex gap-1 mt-1 justify-end">
                        <button class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border hover:bg-gray-200 toggle-history-btn">Verlauf</button>
                        ${actionBtnHtml}
                    </div>
                </div>
            </div>
            <div class="history-container hidden mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                ${(p.history || []).slice().reverse().map(h => {
                    const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
                    // PUNKT 4 OPTIMIERUNG: Datum + Uhrzeit für den Verlauf
                    const dStr = d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
                    const infoText = parseLinks(h.info);
                    return `<div><span class="font-semibold text-gray-600">${dStr}:</span> ${infoText}</div>`;
                }).join('')}
            </div>
        `;

        // Listener Logik
        if (isPaid) {
            row.querySelector('.delete-credit-entry-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm("Diesen erledigten Guthaben-Eintrag unwiderruflich aus der Datenbank löschen?")) {
                    try {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', p.id));
                        row.remove(); 
                        alertUser("Eintrag gelöscht.", "success");
                    } catch (err) {
                        console.error(err);
                        alertUser("Fehler beim Löschen.", "error");
                    }
                }
            });
        } else {
            row.querySelector('.action-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('creditDetailsModal').style.display = 'none';
                openCreditModal('sub', group.context, p.id);
            });
        }

        row.querySelector('.toggle-history-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const hist = row.querySelector('.history-container');
            hist.classList.toggle('hidden');
            e.target.textContent = hist.classList.contains('hidden') ? 'Verlauf' : 'Verbergen';
        });

        list.appendChild(row);
    });

    modal.style.display = 'flex';
}




// --- CREDITS MODAL & ACTIONS ---

function openCreditModal(mode, context, paymentId = null) {
    const modal = document.getElementById('creditManageModal');
    document.getElementById('credit-mode').value = mode;
    document.getElementById('credit-context').value = context;
    modal.dataset.paymentId = paymentId || "";

    const select = document.getElementById('credit-partner-select');
    const amountInput = document.getElementById('credit-amount');
    const reasonInput = document.getElementById('credit-reason');

    amountInput.value = ''; reasonInput.value = ''; select.innerHTML = ''; select.disabled = false;

    // FIX BUG 2: Falscher Funktionsname korrigiert (fillPartnerSelect -> fillDropdown)
    // Wir nutzen einfach fillDropdown, filtern aber im Kopf, was wir brauchen
    fillDropdown(select, 'user');

    if (mode === 'add') {
        document.getElementById('credit-sub-warning').classList.add('hidden');
        document.getElementById('btn-save-credit').textContent = "Zubuchen";
        document.getElementById('btn-save-credit').className = "px-4 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700";
        document.getElementById('credit-modal-title').textContent = context === 'my' ? "Guthaben aufladen" : "Guthaben gutschreiben";
        document.getElementById('credit-modal-desc').textContent = context === 'my' ? "Du gibst jemandem Geld." : "Du erhältst Geld als Guthaben.";
    } else {
        document.getElementById('credit-sub-warning').classList.remove('hidden');
        document.getElementById('btn-save-credit').textContent = "Abbuchen";
        document.getElementById('btn-save-credit').className = "px-4 py-2 bg-red-600 text-white font-bold rounded hover:bg-red-700";
        document.getElementById('credit-modal-title').textContent = "Guthaben nutzen / auszahlen";
        document.getElementById('credit-modal-desc').textContent = "Guthaben wird reduziert.";

        if (paymentId) {
            const p = allPayments.find(x => x.id === paymentId);
            if (p) {
                amountInput.value = p.remainingAmount;
                reasonInput.value = "Auszahlung / Verrechnung";

                const partnerId = (context === 'my') ? p.debtorId : p.creditorId;
                const partnerName = (context === 'my') ? p.debtorName : p.creditorName;

                let optionExists = select.querySelector(`option[value="USR:${partnerId}"]`) || select.querySelector(`option[value="CON:${partnerId}"]`);

                // Wenn Partner nicht in der Liste (z.B. gelöscht oder Gast), manuell hinzufügen
                if (!optionExists && partnerId) {
                    const opt = document.createElement('option');
                    // Wir wissen nicht genau ob User oder Contact, probieren wir es generisch zu setzen oder nehmen USR als fallback
                    opt.value = partnerId; // Hier nehmen wir die rohe ID
                    opt.textContent = partnerName + " (Archiviert/Gast)";
                    select.insertBefore(opt, select.firstChild);
                    select.value = partnerId;
                } else if (optionExists) {
                    select.value = optionExists.value;
                }

                select.disabled = true;
            }
        }
    }
    modal.classList.remove('hidden'); modal.style.display = 'flex';
}
window.openCreditModal = openCreditModal;




async function executeCreditAction() {
    const mode = document.getElementById('credit-mode').value;
    const context = document.getElementById('credit-context').value;

    // 1. Rohwert aus dem Select holen (kann USR:..., CON:... oder ID sein)
    let rawPartnerValue = document.getElementById('credit-partner-select').value;

    // 2. ID bereinigen (Prefix entfernen)
    let partnerId = rawPartnerValue;
    if (partnerId && partnerId.includes(':')) {
        partnerId = partnerId.split(':')[1];
    }

    let amount = parseFloat(document.getElementById('credit-amount').value);
    if (!isNaN(amount)) { amount = parseFloat(amount.toFixed(2)); }

    const reason = document.getElementById('credit-reason').value.trim();
    const paymentId = document.getElementById('creditManageModal').dataset.paymentId;

    if (!partnerId) { alertUser("Bitte eine Person aus der Liste wählen.", "error"); return; }
    if (isNaN(amount) || amount <= 0) { alertUser("Bitte einen gültigen Betrag eingeben.", "error"); return; }
    if (!reason) { alertUser("Bitte einen Grund angeben.", "error"); return; }

    // --- FIX: Korrekte Prüfung auf Existenz ---
    if (mode === 'add') {
        const isRealUser = USERS[partnerId];
        // Prüfen, ob ID in allContacts (Array) existiert
        const isContact = allContacts.some(c => c.id === partnerId);

        if (!isRealUser && !isContact) {
            alertUser("Guthaben kann nur für registrierte Kontakte/User angelegt werden.", "error");
            return;
        }
    }

    const btn = document.getElementById('btn-save-credit');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        let partnerName = "Unbekannt";
        if (USERS[partnerId]) {
            partnerName = USERS[partnerId].realName || USERS[partnerId].name;
        } else {
            const c = allContacts.find(c => c.id === partnerId);
            if (c) partnerName = c.name;
            else if (paymentId) {
                const p = allPayments.find(x => x.id === paymentId);
                if (p) partnerName = (context === 'my') ? p.debtorName : p.creditorName;
            }
        }

        if (mode === 'add') {
            const docData = {
                title: reason, amount: amount, remainingAmount: amount, type: 'credit', status: 'open', isTBD: false,
                startDate: new Date().toISOString().split('T')[0], createdAt: serverTimestamp(), createdBy: currentUser.mode,
                involvedUserIds: [currentUser.mode, partnerId], // Wichtig: ID ohne Prefix speichern!
                history: [{ date: new Date(), action: 'created_manual_credit', user: currentUser.displayName, info: `Guthaben manuell angelegt: ${amount.toFixed(2)}€` }]
            };
            if (context === 'my') { docData.creditorId = currentUser.mode; docData.creditorName = currentUser.displayName; docData.debtorId = partnerId; docData.debtorName = partnerName; }
            else { docData.creditorId = partnerId; docData.creditorName = partnerName; docData.debtorId = currentUser.mode; docData.debtorName = currentUser.displayName; }
            batch.set(doc(paymentsRef), docData);
            alertUser("Erfolgreich.", "success");
        } else {
            if (paymentId) {
                const p = allPayments.find(x => x.id === paymentId);
                if (p) {
                    const newRest = parseFloat((parseFloat(p.remainingAmount) - amount).toFixed(2));
                    if (newRest < 0) throw new Error("Nicht genug Guthaben.");
                    const updateData = {
                        remainingAmount: newRest,
                        history: [...(p.history || []), { date: new Date(), action: 'credit_used', user: currentUser.displayName, info: `Abgebucht: ${amount.toFixed(2)}€` }]
                    };
                    if (newRest === 0) updateData.status = 'paid';
                    batch.update(doc(paymentsRef, paymentId), updateData);
                    alertUser("Erfolgreich.", "success");
                }
            }
        }
        await batch.commit();
        document.getElementById('creditManageModal').style.display = 'none';
    } catch (e) { console.error(e); alertUser(e.message, "error"); } finally { setButtonLoading(btn, false); }
}


// --- GAST LINK LOGIK ---

async function shareContactLink(contactId) {
    // Wir erstellen einen Link mit der ID. 
    // Sicherheit: Da es nur Read-Only ist und man die ID erraten müsste (was bei Firestore IDs schwer ist),
    // ist das für diesen Zweck ("geheimer Link") ausreichend.

    const baseUrl = window.location.origin + window.location.pathname;
    let tokenToUse = null;

    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'private-contacts', contactId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
            const d = snap.data();
            tokenToUse = d.guestToken || null;
        }

        if (!tokenToUse) {
            tokenToUse = generateGuestToken();
            await updateDoc(ref, {
                guestToken: tokenToUse,
                guestTokenCreatedAt: serverTimestamp(),
                guestTokenViews: 0
            });
        }
    } catch (e) {
        console.error(e);
    }

    const link = tokenToUse
        ? `${baseUrl}?guest_id=${contactId}&token=${tokenToUse}`
        : `${baseUrl}?guest_id=${contactId}`;

    try {
        await navigator.clipboard.writeText(link);
        alertUser("Geheimer Link kopiert! 📋\nSende ihn an deinen Freund.", "success");
    } catch (err) {
        prompt("Link kopieren:", link);
    }
}

// --- GAST VIEW INITIALISIERUNG (Wird von haupteingang.js gerufen) ---

// --- GAST VIEW INITIALISIERUNG & DETAILS ---

// --- GAST VIEW INITIALISIERUNG & DETAILS ---

export async function initializeGuestView(guestId) {
    const view = document.getElementById('guestView');
    if (!view) return;
    view.classList.add('active');

    // Gastmodus: keine erzwungene, leere Scroll-Leiste + kein künstlicher Top-Abstand
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.classList.add('guest-main-content');
        mainContent.classList.remove('space-y-4');
        mainContent.style.setProperty('overflow-y', 'auto', 'important');
        mainContent.style.setProperty('scrollbar-gutter', 'auto', 'important');
    }

    // Close Button Listener
    const closeBtn = document.getElementById('btn-close-guest-modal');
    if (closeBtn) closeBtn.onclick = closeGuestDetailModal;

    // BUGFIX 5: Variable für den echten Namen
    let guestRealName = "Gast";

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        let docsList = [];
        let isSinglePaymentMode = false;

        console.log("initializeGuestView: starte - rufe Cloud Function getGuestPayments an...");
        if (!window.getGuestPayments) {
            throw new Error("Cloud Function 'getGuestPayments' ist nicht initialisiert.");
        }

        const result = await window.getGuestPayments({ guestId: guestId, token: urlToken });
        if (!result.data || result.data.status !== 'success') {
            throw new Error("Fehler: Ungültige Antwort von getGuestPayments.");
        }

        docsList = result.data.payments || [];
        isSinglePaymentMode = !!result.data.isSinglePaymentMode;
        guestRealName = result.data.guestRealName || "Gast";

        // --- RENDERING ---
        const listContainer = document.getElementById('guest-payment-list');
        listContainer.innerHTML = '';

        let totalDebt = 0; // Summe NUR für aktive Posten
        let hasUnknownActiveAmount = false;
        
        // BUGFIX 5: Namen im Header setzen
        document.getElementById('guest-name-display').textContent = guestRealName;

        const today = new Date();
        today.setHours(0,0,0,0);
        const now = new Date();

        // Arrays für Trennung
        const activeItems = [];
        const futureItems = [];

        if (docsList.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-gray-500">Keine offenen Einträge gefunden.</p>';
        } else {
            docsList.forEach(p => {
                // Filter: Nur Offene (außer Einzel-Link, der zeigt auch erledigte)
                if (!isSinglePaymentMode && p.status !== 'open' && p.status !== 'pending_approval') return;

                // Zeit-Check
                let isFuture = false;
                if (p.startDate) {
                    const start = new Date(p.startDate);
                    start.setHours(0,0,0,0);
                    if (start > today) isFuture = true;
                }

                // In Listen sortieren
                if (isFuture) futureItems.push(p);
                else activeItems.push(p);

                // Summe berechnen (NUR für Aktive!)
                if (!isFuture) {
                    let amount = parseFloat(p.remainingAmount);
                    const safeAmount = Number.isFinite(amount) ? amount : 0;
                    let isMyDebt = (p.createdBy === p.creditorId); // Ersteller kriegt Geld -> Gast schuldet
                    // Logik Check:
                    // Wenn Ersteller = Creditor, dann schuldet Gast (Debtor) mir -> Gast hat Schuld (-)
                    // Wenn Ersteller = Debtor, dann schuldet Ersteller mir -> Gast hat Guthaben (+)
                    if (p.creditorId === p.createdBy) totalDebt -= safeAmount; // Gast muss zahlen
                    else totalDebt += safeAmount; // Gast bekommt Geld
                }
            });

            // 1. RENDER AKTIVE ITEMS
            activeItems.forEach(p => {
                const isUnknownAmount = p.isTBD === true;
                const amount = isUnknownAmount ? null : parseFloat(p.remainingAmount);
                // Logik für Gast-Sicht:
                // Wenn Ersteller (Admin) = Creditor, dann schulde ICH (Gast) das Geld. -> Rot
                let isMyDebt = (p.creditorId === p.createdBy);
                
                const div = document.createElement('div');
                div.className = "p-3 bg-white border rounded shadow-sm flex justify-between items-center cursor-pointer hover:bg-indigo-50 transition mb-2";
                
                let textInfo = isMyDebt ? "Du schuldest" : "Du bekommst";
                if(isSinglePaymentMode && p.status === 'paid') textInfo = "✅ Erledigt";

                let amountHtml = '';
                if (isUnknownAmount) {
                    amountHtml = `
                        <span class="inline-block px-2 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded font-bold text-xs whitespace-nowrap">
                            Betrag unbekannt
                        </span>
                    `;
                } else {
                    const safeAmount = Number.isFinite(amount) ? amount : 0;
                    amountHtml = `
                        <span class="font-mono font-bold ${isMyDebt ? 'text-red-600' : 'text-green-600'}">
                            ${safeAmount.toFixed(2)} €
                        </span>
                    `;
                }

                div.innerHTML = `
                    <div>
                        <p class="font-bold text-gray-800">${p.title}</p>
                        <p class="text-xs text-gray-500">${textInfo}</p>
                    </div>
                    ${amountHtml}
                `;
                div.onclick = () => openGuestDetailModal(p);
                listContainer.appendChild(div);
            });

            // 2. RENDER ZUKÜNFTIGE ITEMS (Separate Section)
            if (futureItems.length > 0) {
                const separator = document.createElement('div');
                separator.className = "mt-6 mb-3 flex items-center gap-2";
                separator.innerHTML = `
                    <div class="h-px bg-gray-300 flex-grow"></div>
                    <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Zukünftige Zahlungen</span>
                    <div class="h-px bg-gray-300 flex-grow"></div>
                `;
                listContainer.appendChild(separator);

                futureItems.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

                futureItems.forEach(p => {
                    const isUnknownAmount = p.isTBD === true;
                    const amount = isUnknownAmount ? null : parseFloat(p.remainingAmount);
                    let isMyDebt = (p.creditorId === p.createdBy);

                    const startObj = new Date(p.startDate);
                    const diffMs = startObj - now;
                    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    
                    let timeText = (days > 0) ? `${days}T ${hours}h` : `${hours}h`;

                    const div = document.createElement('div');
                    div.className = "p-3 bg-gray-50 border border-gray-200 rounded shadow-sm flex justify-between items-center cursor-pointer hover:bg-white transition mb-2 opacity-90";
                    const amountHtml = isUnknownAmount
                        ? `<span class="inline-block px-2 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded font-bold text-xs whitespace-nowrap">Betrag unbekannt</span>`
                        : `<span class="font-mono font-bold text-gray-500">${(Number.isFinite(amount) ? amount : 0).toFixed(2)} €</span>`;
                    
                    div.innerHTML = `
                        <div>
                            <div class="flex items-center gap-2">
                                <p class="font-bold text-gray-700">${p.title}</p>
                                <span class="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold border border-indigo-200">
                                    Aktiv in ${timeText}
                                </span>
                            </div>
                            <p class="text-xs text-gray-400">Vorschau (${isMyDebt ? 'Schuld' : 'Haben'})</p>
                        </div>
                        ${amountHtml}
                    `;
                    div.onclick = () => openGuestDetailModal(p);
                    listContainer.appendChild(div);
                });
            }
        }

        const totalEl = document.getElementById('guest-total-display');
        const statusEl = document.getElementById('guest-status-text');

        if (totalDebt < -0.001) {
            totalEl.textContent = Math.abs(totalDebt).toFixed(2) + " €";
            totalEl.className = "text-4xl font-extrabold text-red-600";
            statusEl.textContent = "Das musst du aktuell zahlen.";
        } else if (totalDebt > 0.001) {
            totalEl.textContent = totalDebt.toFixed(2) + " €";
            totalEl.className = "text-4xl font-extrabold text-emerald-600";
            statusEl.textContent = "Das bekommst du aktuell.";
        } else {
            totalEl.textContent = "0,00 €";
            totalEl.className = "text-4xl font-extrabold text-gray-400";
            statusEl.textContent = "Alles erledigt.";
        }

        // Unbekannte Beträge klar kennzeichnen
        activeItems.forEach((p) => {
            if (p.isTBD === true) hasUnknownActiveAmount = true;
        });

        if (hasUnknownActiveAmount) {
            const baseText = statusEl.textContent;
            statusEl.innerHTML = `${baseText}<br><span class="text-[11px] text-orange-600 font-semibold">Hinweis: Es gibt Posten mit "Betrag unbekannt". Dieser Wert kann spaeter nachgetragen werden.</span>`;
        }

    } catch (e) {
        console.error(e);
        if (e && (e.code === 'functions/permission-denied' || String(e.message || '').toLowerCase().includes('abgelaufen'))) {
            document.getElementById('guestView').innerHTML = `
                <div class="flex flex-col items-center justify-center h-screen bg-gray-100 p-4 text-center">
                    <div class="bg-white p-8 rounded-xl shadow-xl">
                        <h1 class="text-2xl font-bold text-red-600 mb-2">Link abgelaufen</h1>
                        <p class="text-gray-600">Dieser Sicherheits-Link ist nicht mehr gültig.<br>Bitte fordere einen neuen Link an.</p>
                    </div>
                </div>`;
            return;
        }

        if (e && e.code === 'functions/not-found') {
            alert("Link ungültig: Benutzer/Kontakt/Zahlung nicht gefunden.");
            return;
        }

        alert("Fehler beim Laden der Daten.");
    }
}





// --- NEU: HILFSFUNKTIONEN FÜR GAST-DETAILS ---

function openGuestDetailModal(p) {
    const modal = document.getElementById('guestDetailModal');
    const content = document.getElementById('guest-detail-content');
    
    // Modal nach vorne holen
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
    const formatDate = (value, withTime = false) => {
        if (!value) return '—';
        const dateValue = value?.toDate ? value.toDate() : value;
        const d = new Date(dateValue);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('de-DE', withTime
            ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { day: '2-digit', month: '2-digit', year: 'numeric' }
        );
    };

    const parseInfoText = (rawText) => {
        if (!rawText) return '';
        return escapeHtml(rawText).replace(/\[LINK:[^\]]+\]/g, '<span class="text-indigo-500 font-semibold">Verknüpfter Eintrag</span>');
    };

    const typeLabels = { debt: 'Schuld / Forderung', transfer: 'Umbuchung', credit: 'Guthaben' };
    const typeLabel = typeLabels[p.type] || 'Transaktion';

    const knownCategories = [...SYSTEM_CATEGORIES, ...allCategories];
    const foundCategory = knownCategories.find((c) => c.id === p.categoryId);
    const categoryLabel = foundCategory?.name
        ? escapeHtml(foundCategory.name)
        : (p.categoryId ? `Eigene Kategorie (${escapeHtml(p.categoryId)})` : 'Diverse');

    const createdStr = formatDate(p.createdAt, false);
    const startStr = formatDate(p.startDate, false);
    const deadlineStr = formatDate(p.deadline, false);

    const totalAmount = Number.parseFloat(p.amount);
    const remainingAmount = Number.parseFloat(p.remainingAmount);
    const isTBD = p.isTBD === true;

    const amountDisplay = isTBD
        ? '<span class="inline-block px-2 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded font-bold text-xs">Betrag unbekannt</span>'
        : `${(Number.isFinite(totalAmount) ? totalAmount : 0).toFixed(2)} €`;

    const remainingDisplay = isTBD
        ? '<span class="inline-block px-2 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded font-bold text-xs">Betrag unbekannt</span>'
        : `${(Number.isFinite(remainingAmount) ? remainingAmount : 0).toFixed(2)} €`;

    const hasDeadline = deadlineStr !== '—';
    let deadlineClass = 'text-gray-700';
    if (hasDeadline) {
        const dObj = new Date(p.deadline);
        dObj.setHours(23, 59, 59, 999);
        if (!Number.isNaN(dObj.getTime()) && dObj < new Date()) deadlineClass = 'text-red-600';
    }

    let positionsHtml = '<p class="text-xs italic text-gray-400">Keine Posten erfasst.</p>';
    if (Array.isArray(p.positions) && p.positions.length > 0) {
        positionsHtml = p.positions.map((pos) => {
            if (typeof pos === 'string') {
                return `
                    <div class="flex justify-between items-center text-xs border-b border-gray-100 py-1 last:border-0">
                        <span class="text-gray-700">${escapeHtml(pos)}</span>
                        <span class="text-gray-400">—</span>
                    </div>
                `;
            }
            const pName = escapeHtml(pos?.name || 'Posten');
            const pPrice = Number.parseFloat(pos?.price);
            const pPriceText = Number.isFinite(pPrice)
                ? `${pPrice.toFixed(2)} €`
                : '—';
            return `
                <div class="flex justify-between items-center text-xs border-b border-gray-100 py-1 last:border-0">
                    <span class="text-gray-700">${pName}</span>
                    <span class="font-mono font-semibold text-gray-800">${pPriceText}</span>
                </div>
            `;
        }).join('');
    }

    let transactionsHtml = '<p class="text-xs italic text-gray-400">Keine Zahlungen erfasst.</p>';
    if (Array.isArray(p.transactions) && p.transactions.length > 0) {
        const sortedTransactions = [...p.transactions].sort((a, b) => {
            const dateA = new Date(a?.date?.toDate ? a.date.toDate() : a?.date).getTime() || 0;
            const dateB = new Date(b?.date?.toDate ? b.date.toDate() : b?.date).getTime() || 0;
            return dateB - dateA;
        });
        transactionsHtml = sortedTransactions.map((tx) => {
            const txAmount = Number.parseFloat(tx?.amount);
            const amountText = Number.isFinite(txAmount) ? `+ ${txAmount.toFixed(2)} €` : '+ 0,00 €';
            const txUser = escapeHtml(tx?.user || 'Unbekannt');
            const txDate = formatDate(tx?.date, true);
            const txInfo = tx?.info ? `<div class="text-[11px] text-gray-500 mt-0.5">${parseInfoText(tx.info)}</div>` : '';
            return `
                <div class="bg-green-50 border border-green-100 rounded-lg p-2 mb-2 last:mb-0">
                    <div class="flex justify-between items-start gap-2">
                        <span class="font-bold text-green-700 text-sm">${amountText}</span>
                        <span class="text-[10px] text-gray-500">${txDate}</span>
                    </div>
                    <p class="text-xs text-gray-600">von ${txUser}</p>
                    ${txInfo}
                </div>
            `;
        }).join('');
    }

    let historyHtml = '<p class="text-xs italic text-gray-400">Kein Verlauf vorhanden.</p>';
    if (Array.isArray(p.history) && p.history.length > 0) {
        historyHtml = [...p.history].reverse().map((h) => {
            const user = escapeHtml(h?.user || 'System');
            const date = formatDate(h?.date, true);
            const info = parseInfoText(h?.info || '');
            return `
                <div class="border-b border-gray-100 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                    <div class="flex justify-between items-start gap-2 mb-0.5">
                        <span class="font-bold text-gray-700 text-xs">${user}</span>
                        <span class="text-[10px] text-gray-400">${date}</span>
                    </div>
                    <div class="text-xs text-gray-600 leading-relaxed">${info}</div>
                </div>
            `;
        }).join('');
    }

    const posContentId = `guest-pos-content-${p.id}`;
    const posIconId = `guest-pos-icon-${p.id}`;
    const txContentId = `guest-tx-content-${p.id}`;
    const txIconId = `guest-tx-icon-${p.id}`;
    const logContentId = `guest-log-content-${p.id}`;
    const logIconId = `guest-log-icon-${p.id}`;

    const detailsText = String(p.notes || '').trim();

    content.innerHTML = `
        <div class="bg-gradient-to-br from-emerald-50 to-white p-4 rounded-xl border border-emerald-100 mb-4 shadow-sm">
            <h2 class="text-xl font-bold text-gray-800 mb-1">${escapeHtml(p.title || 'Eintrag')}</h2>
            <p class="text-xs text-gray-500">ID: #${escapeHtml(String(p.id || '').slice(-4).toUpperCase())} • Erstellt: ${createdStr}</p>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-4 text-center">
            <div class="p-3 border rounded-xl bg-white shadow-sm">
                <p class="text-xs font-bold text-gray-400 uppercase">Gesamt</p>
                <p class="font-bold text-gray-800 mt-1">${amountDisplay}</p>
            </div>
            <div class="p-3 border rounded-xl bg-yellow-50 border-yellow-200 shadow-sm">
                <p class="text-xs font-bold text-yellow-700 uppercase">Noch Offen</p>
                <p class="font-bold text-yellow-800 mt-1">${remainingDisplay}</p>
            </div>
        </div>

        ${isTBD ? '<div class="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800 font-medium">Betrag unbekannt: Der Betrag wird ggf. später nachgetragen.</div>' : ''}

        <div class="grid grid-cols-2 gap-y-3 gap-x-3 mb-4 p-3 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 shadow-sm">
            <div><span class="font-bold text-gray-500">Startdatum:</span><br>${startStr}</div>
            <div><span class="font-bold text-gray-500">Frist:</span><br><span class="${deadlineClass}">${deadlineStr}</span></div>
            <div><span class="font-bold text-gray-500">Kategorie:</span><br>${categoryLabel}</div>
            <div><span class="font-bold text-gray-500">Typ:</span><br>${escapeHtml(typeLabel)}</div>
            ${p.invoiceNr ? `<div><span class="font-bold text-gray-500">Rechnungs-Nr.:</span><br>${escapeHtml(p.invoiceNr)}</div>` : ''}
            ${p.orderNr ? `<div><span class="font-bold text-gray-500">Bestell-Nr.:</span><br>${escapeHtml(p.orderNr)}</div>` : ''}
        </div>

        ${detailsText ? `<div class="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700"><p class="text-[11px] uppercase font-bold text-gray-500 mb-1">Details</p>${escapeHtml(detailsText)}</div>` : ''}

        <div class="bg-white border border-gray-200 rounded-xl mb-4 overflow-hidden shadow-sm">
            <button class="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition" onclick="document.getElementById('${posContentId}').classList.toggle('hidden'); document.getElementById('${posIconId}').classList.toggle('rotate-180');">
                <span class="text-xs font-bold text-gray-600 uppercase">Posten (${Array.isArray(p.positions) ? p.positions.length : 0})</span>
                <svg id="${posIconId}" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div id="${posContentId}" class="hidden p-3 border-t border-gray-100 max-h-52 overflow-y-auto">${positionsHtml}</div>
        </div>

        <div class="bg-white border border-gray-200 rounded-xl mb-4 overflow-hidden shadow-sm">
            <button class="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition" onclick="document.getElementById('${txContentId}').classList.toggle('hidden'); document.getElementById('${txIconId}').classList.toggle('rotate-180');">
                <span class="text-xs font-bold text-gray-600 uppercase">Zahlungshistorie</span>
                <svg id="${txIconId}" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div id="${txContentId}" class="hidden p-3 border-t border-gray-100 max-h-52 overflow-y-auto bg-gray-50">${transactionsHtml}</div>
        </div>

        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <button class="w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 transition" onclick="document.getElementById('${logContentId}').classList.toggle('hidden'); document.getElementById('${logIconId}').classList.toggle('rotate-180');">
                <span class="text-xs font-bold text-gray-600 uppercase">System-Log</span>
                <svg id="${logIconId}" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div id="${logContentId}" class="hidden p-3 border-t border-gray-100 max-h-60 overflow-y-auto bg-gray-50">${historyHtml}</div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}



function closeGuestDetailModal() {
    const modal = document.getElementById('guestDetailModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}



// --- MIGRATION (KONTAKT -> USER) ---

let currentMigrationContactId = null;

function openMigrationModal(contactId) {
    currentMigrationContactId = contactId;
    const contact = allContacts.find(c => c.id === contactId);
    if (!contact) return;

    document.getElementById('mig-contact-name').textContent = contact.name;
    const select = document.getElementById('migration-target-select');
    select.innerHTML = '';

    // Fülle Select mit echten Usern
    Object.values(USERS).forEach(user => {
        if (user.id !== currentUser.mode && user.isActive) {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.textContent = user.realName || user.name;
            select.appendChild(opt);
        }
    });

    document.getElementById('migrationModal').style.display = 'flex';
}

async function executeMigration() {
    const targetUserId = document.getElementById('migration-target-select').value;
    if (!targetUserId || !currentMigrationContactId) return;

    const targetUser = USERS[targetUserId];
    const targetName = targetUser.realName || targetUser.name;

    if (!confirm(`Wirklich alle Daten auf "${targetName}" übertragen? Dies kann nicht rückgängig gemacht werden.`)) return;

    const btn = document.getElementById('btn-execute-migration');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        // --- FIX: Robuste Suche in debtorId UND creditorId ---
        // Wir können in Firestore nicht "OR" über verschiedene Felder suchen,
        // deshalb machen wir zwei parallele Abfragen.
        
        const p1 = getDocs(query(paymentsRef, where('debtorId', '==', currentMigrationContactId)));
        const p2 = getDocs(query(paymentsRef, where('creditorId', '==', currentMigrationContactId)));
        
        const [snapDebtor, snapCreditor] = await Promise.all([p1, p2]);

        // Wir nutzen eine Map, um Duplikate zu vermeiden (falls ID in beiden drin wäre)
        const paymentsToMigrate = new Map();

        snapDebtor.forEach(doc => paymentsToMigrate.set(doc.id, doc));
        snapCreditor.forEach(doc => paymentsToMigrate.set(doc.id, doc));

        let count = 0;

        paymentsToMigrate.forEach((docSnap) => {
            const p = docSnap.data();
            const ref = doc(paymentsRef, docSnap.id);
            const updates = {};
            let changed = false;

            // 1. involvedUserIds aktualisieren
            // Der alte Kontakt (falls vorhanden) fliegt raus, der neue ECHTE User kommt rein.
            // Das ist wichtig, damit der echte User die Zahlung auch sehen kann!
            let newInvolved = (p.involvedUserIds || []).filter(id => id !== currentMigrationContactId);
            if (!newInvolved.includes(targetUserId)) newInvolved.push(targetUserId);
            updates.involvedUserIds = newInvolved;

            // 2. Zugriff gewähren (Access Rights)
            // Damit der neue User sofort Zugriff hat ("Akzeptiert")
            if (!p.accessRights) p.accessRights = {};
            updates[`accessRights.${targetUserId}`] = {
                status: 'accepted',
                rights: 'transact_approve', // Standard-Recht: Darf zahlen/bestätigen
                invitedAt: new Date().toISOString(),
                migratedFrom: currentMigrationContactId
            };

            // 3. Rollen umschreiben
            if (p.debtorId === currentMigrationContactId) {
                updates.debtorId = targetUserId;
                updates.debtorName = targetName;
                changed = true;
            }
            if (p.creditorId === currentMigrationContactId) {
                updates.creditorId = targetUserId;
                updates.creditorName = targetName;
                changed = true;
            }

            if (changed) {
                updates.history = [...(p.history || []), {
                    date: new Date(),
                    action: 'migrated',
                    user: currentUser.displayName,
                    info: `Migriert von Kontakt zu User ${targetName}.`
                }];
                batch.update(ref, updates);
                count++;
            }
        });

        // Kontakt löschen
        const contactRef = doc(db, 'artifacts', appId, 'public', 'data', 'private-contacts', currentMigrationContactId);
        batch.delete(contactRef);

        await batch.commit();

        alertUser(`Erfolgreich ${count} Einträge auf ${targetName} übertragen.`, "success");
        document.getElementById('migrationModal').style.display = 'none';
        
        // Listen aktualisieren
        renderContactList();

    } catch (e) {
        console.error(e);
        alertUser("Fehler bei der Migration: " + e.message, "error");
    } finally {
        setButtonLoading(btn, false);
    }
}



// --- KATEGORIEN VERWALTUNG (SETTINGS) ---

async function addCategoryFromSettings() {
    const input = document.getElementById('new-category-name-input');
    const name = input.value.trim();
    if (!name) return;

    // Prüfen ob Name schon existiert (System oder Custom)
    const exists = SYSTEM_CATEGORIES.some(c => c.name.toLowerCase() === name.toLowerCase()) ||
        allCategories.some(c => c.name.toLowerCase() === name.toLowerCase());

    if (exists) { alertUser("Kategorie existiert bereits.", "error"); return; }

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'payment-categories'), {
            name: name,
            createdBy: currentUser.mode,
            createdAt: serverTimestamp()
        });
        alertUser("Kategorie erstellt!", "success");
        input.value = '';
    } catch (e) { console.error(e); alertUser("Fehler.", "error"); }
}

async function deleteCategory(id) {
    if (!confirm("Kategorie löschen? Einträge in dieser Kategorie fallen zurück auf 'Diverse'.")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payment-categories', id));
    } catch (e) { console.error(e); }
}

function renderCategoryList() {
    const container = document.getElementById('zv-categories-list');
    if (!container) return;
    container.innerHTML = '';

    // 1. System Kategorien (Nicht löschbar)
    SYSTEM_CATEGORIES.forEach(sc => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-gray-100 rounded border border-gray-200";
        div.innerHTML = `
            <span class="font-bold text-gray-600">${sc.name} <span class="text-[10px] font-normal">(System)</span></span>
            <span class="text-xs text-gray-400">Standard</span>
        `;
        container.appendChild(div);
    });

    // 2. Eigene Kategorien
    allCategories.forEach(c => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-white rounded shadow-sm border";
        div.innerHTML = `
            <span class="font-bold text-gray-800">${c.name}</span>
            <button class="delete-cat-btn p-1 text-red-400 hover:bg-red-50 rounded" data-id="${c.id}">🗑️</button>
        `;
        container.appendChild(div);
    });
}

function fillCategoryDropdown(selectElement) {
    if (!selectElement) return;
    selectElement.innerHTML = '';

    // System
    SYSTEM_CATEGORIES.forEach(sc => {
        const opt = document.createElement('option');
        opt.value = sc.id;
        opt.textContent = sc.name;
        selectElement.appendChild(opt);
    });

    // Custom
    allCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        selectElement.appendChild(opt);
    });

    // Default auswählen falls vorhanden
    if (selectElement.value === '') selectElement.value = 'cat_misc';
}

// --- VISUELLER VERLAUF (Stammbaum) ---

window.openHistoryModal = function (startId) {
    const modal = document.getElementById('paymentHistoryModal');
    const container = document.getElementById('history-graph-container');
    if (!modal || !container) return;

    // --- FIX: Modal nach vorne holen ---
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    // -----------------------------------

    modal.style.display = 'flex';
    container.innerHTML = '<div class="loading-spinner border-gray-500"></div> <span class="ml-2 text-gray-500">Berechne Stammbaum...</span>';

    // Wir bauen den Graphen rekursiv auf
    setTimeout(() => {
        generateMermaidGraph(startId);
    }, 100);
};



// Diese Funktion ersetzt deine alte generateMermaidGraph komplett
// VERSION: DETAIL-ANSICHT (Keine Platzhalter, volle Infos)
function generateMermaidGraph(rootId) {
    const container = document.getElementById('history-graph-container');
    container.innerHTML = '<div class="flex justify-center items-center h-full flex-col gap-2"><div class="loading-spinner border-gray-500"></div><span class="text-sm text-gray-500">Lade Details...</span></div>';

    // --- HELFER ---
    const cleanId = (id) => "N" + String(id).replace(/[^a-zA-Z0-9]/g, ''); 
    
    // Bereinigt Texte aggressiv für Mermaid (keine Klammern, Anführungszeichen etc.)
    const cleanLabel = (text) => text ? String(text).replace(/["#;:<>{}\[\]()]/g, ' ').trim() : "";
    
    const extractLinks = (text) => {
        const links = [];
        const regex = /LINK:([^:]+):/g;
        let match;
        while ((match = regex.exec(text)) !== null) links.push(match[1]);
        return links;
    };

    const extractAmount = (text) => {
        const match = text.match(/(\d+(?:[.,]\d{2})?)\s?€/);
        return match ? match[0] : "";
    };

    // 1. CRAWLER (Alle Daten sammeln)
    const relatedIds = new Set();
    const queue = [rootId];
    const paymentsMap = new Map();
    allPayments.forEach(p => paymentsMap.set(p.id, p));
    let loops = 0;

    while (queue.length > 0 && loops < 2000) {
        const currentId = queue.shift();
        if (relatedIds.has(currentId)) continue;
        relatedIds.add(currentId);
        loops++;

        const p = paymentsMap.get(currentId);
        if (!p || !p.history) continue;

        // Links in Historie finden
        p.history.forEach(h => {
            const links = extractLinks(h.info);
            links.forEach(linkId => {
                if (!relatedIds.has(linkId) && paymentsMap.has(linkId)) queue.push(linkId);
            });
        });
        
        // Rückwärts-Links finden
        allPayments.forEach(otherP => {
            if (!relatedIds.has(otherP.id) && otherP.history && JSON.stringify(otherP.history).includes(currentId)) {
                queue.push(otherP.id);
            }
        });
    }

    // 2. MERMAID DEFINITION (Zeitstrahl von Links nach Rechts)
    let graphDef = `%%{init: {'flowchart': {'curve': 'basis', 'rankSpacing': 60, 'nodeSpacing': 30}}}%%\ngraph LR\n`;

    // 3. KNOTEN BAUEN
    relatedIds.forEach(nodeId => {
        const p = paymentsMap.get(nodeId);
        const sId = cleanId(nodeId);

        if (p) {
            // A) HAUPT-BAHNHÖFE (Die Einträge/Akten)
            const short = nodeId.slice(-4).toUpperCase();
            const amt = parseFloat(p.amount).toFixed(2);
            const safeTitle = cleanLabel(p.title);
            
            let style = "fill:#fff,stroke:#333,stroke-width:2px,rx:5,ry:5"; // Eckig abgerundet
            let icon = "📄";

            if (p.status === 'paid') { 
                style = "fill:#ecfdf5,stroke:#059669,stroke-width:2px"; icon = "🏁"; // Grün (Erledigt)
            } else if (p.status === 'closed' || p.status === 'settled') { 
                style = "fill:#f3f4f6,stroke:#9ca3af,stroke-dasharray: 5 5"; icon = "📦"; // Grau (Archiviert)
            } else if (p.type === 'credit') { 
                style = "fill:#faf5ff,stroke:#7e22ce,stroke-width:2px"; icon = "💎"; // Lila (Guthaben)
            } else if (p.status === 'open') {
                style = "fill:#fff7ed,stroke:#ea580c,stroke-width:3px"; icon = "🚩"; // Orange (Offen)
            }

            if (nodeId === rootId) style += ",stroke-dasharray: 0"; 

            const label = `"${icon} <b>${safeTitle}</b><br>${amt} €<br><small>#${short}</small>"`;
            graphDef += `    ${sId}(${label})\n`;
            graphDef += `    style ${sId} ${style}\n`;
            graphDef += `    click ${sId} call openPaymentDetail("${nodeId}")\n`;

            // B) HALTESTELLEN (Die exakte Historie)
            if (p.history) {
                p.history.forEach((h, idx) => {
                    const evtId = `${sId}_E${idx}`;
                    const links = extractLinks(h.info);
                    const money = extractAmount(h.info);
                    
                    let evtTxt = "";
                    let evtColor = "fill:#fff,stroke:#666";
                    let isConnector = false; // Zeichnet Pfeil zu anderem Eintrag?
                    let shape = "(["; let shapeEnd = "])"; // Standard: Oval

                    // --- TEXTE DEFINIEREN (Alles auf Deutsch) ---
                    switch (h.action) {
                        // ERSTELLUNG (Jetzt sichtbar!)
                        case 'created': 
                            evtTxt = `✨ Erstellt<br>${money}`; 
                            evtColor = "fill:#eff6ff,stroke:#1d4ed8"; // Blau
                            break;
                        case 'created_manual_credit':
                            evtTxt = `✨ Guthaben angelegt<br>${money}`;
                            evtColor = "fill:#faf5ff,stroke:#7e22ce"; 
                            break;
                        case 'created_split':
                            evtTxt = `✨ Erstellt aus Split<br>${money}`;
                            evtColor = "fill:#eff6ff,stroke:#1d4ed8";
                            break;
                        case 'created_merge':
                            evtTxt = `✨ Erstellt aus Fusion<br>${money}`;
                            evtColor = "fill:#eff6ff,stroke:#1d4ed8";
                            break;
                        case 'created_settlement':
                            evtTxt = `✨ Rest aus Bilanz<br>${money}`;
                            evtColor = "fill:#eff6ff,stroke:#1d4ed8";
                            break;

                        // ZAHLUNGEN
                        case 'mark_paid': case 'partial_pay': case 'confirm_payment':
                            evtTxt = `💰 Zahlung gebucht<br>${money}`;
                            evtColor = "fill:#dcfce7,stroke:#166534"; // Grün
                            break;
                        case 'paid_with_credit': case 'credit_used':
                            evtTxt = `💎 Guthaben verrechnet<br>${money}`;
                            evtColor = "fill:#f3e8ff,stroke:#6b21a8"; // Lila
                            break;

                        // STRUKTUR (Verbindungen)
                        case 'split_source': 
                            evtTxt = `✂️ Abgespalten<br>${money}`; 
                            evtColor = "fill:#fee2e2,stroke:#b91c1c"; // Rot
                            isConnector = true; 
                            shape = "{{"; shapeEnd = "}}"; 
                            break;
                        case 'merged': 
                            evtTxt = `🔗 Fusioniert<br>${money}`; 
                            evtColor = "fill:#eff6ff,stroke:#1d4ed8"; 
                            isConnector = true; 
                            shape = "{{"; shapeEnd = "}}";
                            break;
                        case 'settled':
                            evtTxt = `⚖️ Bilanziert<br>${money}`; 
                            evtColor = "fill:#eff6ff,stroke:#1d4ed8"; 
                            isConnector = true; 
                            shape = "{{"; shapeEnd = "}}";
                            break;
                        case 'paid_excess': 
                            evtTxt = `➡️ Übertrag (Rest)<br>${money}`; 
                            evtColor = "fill:#fff7ed,stroke:#c2410c"; 
                            isConnector = true; 
                            break;

                        // KORREKTUREN
                        case 'adjusted': case 'tbd_resolved': case 'edited':
                            evtTxt = `🔧 Korrektur/Edit<br>${money}`;
                            evtColor = "fill:#fef3c7,stroke:#b45309"; // Gelb
                            break;

                        // STORNO
                        case 'tx_deleted': case 'credit_refunded':
                            evtTxt = `❌ Storniert<br>${money}`;
                            evtColor = "fill:#fee2e2,stroke:#991b1b,stroke-dasharray: 3 3";
                            break;

                        // DIE VERWIRRENDEN DINGER (Weglassen!)
                        // Wir zeigen KEINEN Knoten für "Ich komme von..." (split_target),
                        // da der Pfeil vom Ursprung (split_source) das bereits zeigt.
                        case 'split_target': 
                            return; 

                        // SONSTIGES (Text anzeigen statt "Info")
                        default:
                            // Wir nehmen den Text aus dem Protokoll und kürzen ihn ggf.
                            // Entferne [LINK:...] für die Anzeige im Knoten
                            let cleanInfo = cleanLabel(h.info).replace(/LINK  [^ ]+  /g, ''); 
                            if (cleanInfo.length > 20) cleanInfo = cleanInfo.substring(0, 20) + "...";
                            evtTxt = `ℹ️ ${cleanInfo}`;
                    }

                    if (!evtTxt) return;

                    // Knoten zeichnen
                    graphDef += `    ${evtId}${shape}"${evtTxt}"${shapeEnd}\n`;
                    graphDef += `    style ${evtId} ${evtColor}\n`;
                    
                    // Verbindung zum Haupt-Eintrag
                    graphDef += `    ${sId} --- ${evtId}\n`;

                    // Verbindung zu ANDEREN Einträgen (wenn Connector)
                    if (isConnector && links.length > 0) {
                        links.forEach(targetId => {
                            if (relatedIds.has(targetId)) {
                                const tId = cleanId(targetId);
                                
                                // Pfeil-Richtung: Von Event -> Ziel Eintrag
                                if (['split_source', 'merged', 'settled', 'paid_excess'].includes(h.action)) {
                                    graphDef += `    ${evtId} ==> ${tId}\n`;
                                }
                            }
                        });
                    }
                    
                    // Klick zeigt vollen Text
                    const alertMsg = cleanLabel(h.info);
                    graphDef += `    click ${evtId} call alert("${alertMsg}")\n`;
                });
            }
        } else {
            // Gelöschter Eintrag (Damit die Linie nicht ins Leere läuft)
            graphDef += `    ${sId}(("🚫 Gelöscht"))\n`;
            graphDef += `    style ${sId} fill:#eee,stroke:#999,stroke-dasharray: 3 3\n`;
        }
    });

    graphDef += `    linkStyle default stroke:#64748b,stroke-width:3px,fill:none;\n`; 

    // 4. RENDERN
    const uniqueId = "mermaid-" + Date.now();
    container.innerHTML = `<div id="${uniqueId}" class="mermaid" style="width: 100%; height: 100%; overflow: hidden;">${graphDef}</div>`;

    setTimeout(() => {
        try {
            mermaid.init(undefined, document.getElementById(uniqueId));
            
            setTimeout(() => {
                const svg = document.querySelector(`#${uniqueId} svg`);
                if (svg) {
                    svg.style.maxWidth = "none";
                    svg.style.height = "100%";
                    svg.style.width = "100%";
                    svg.removeAttribute('height'); 

                    if (typeof svgPanZoom !== 'undefined') {
                        svgPanZoom(svg, {
                            zoomEnabled: true,
                            controlIconsEnabled: true,
                            fit: true,
                            center: true, 
                            minZoom: 0.1,
                            maxZoom: 10
                        });
                    }
                }
            }, 300);
        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="text-red-500 text-center p-4">Grafikfehler.<br><small>${e.message}</small></div>`;
        }
    }, 50);
}








// --- GUTHABEN EINLÖSEN LOGIK ---
async function executePayWithCredit(debtPaymentId, amountToUse, replaceTxIndex = null) {
    const p = allPayments.find(x => x.id === debtPaymentId);
    if (!p) return;

    // Button Loading Animation (falls aus Modal gerufen)
    const btn = document.getElementById('btn-smart-pay');
    if (btn) setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        // 1. Passende Guthaben-Einträge suchen
        const creditEntries = allPayments.filter(cp =>
            cp.type === 'credit' &&
            cp.status === 'open' &&
            cp.creditorId === p.debtorId &&
            cp.debtorId === p.creditorId
        );

        // Check ob genug da ist
        let totalAvailable = 0;
        creditEntries.forEach(c => totalAvailable += parseFloat(c.remainingAmount));
        
        if (totalAvailable < amountToUse - 0.01) {
            throw new Error(`Nicht genug Guthaben verfügbar (Nur ${totalAvailable.toFixed(2)} €).`);
        }

        let remainingToDeduct = amountToUse;
        const usedCreditInfo = []; 
        const creditSourceData = [];

        for (const credit of creditEntries) {
            if (remainingToDeduct <= 0.001) break;

            const available = parseFloat(credit.remainingAmount);
            const take = Math.min(available, remainingToDeduct);

            const newCreditRest = available - take;
            remainingToDeduct -= take;

            // Guthaben-Eintrag aktualisieren
            const creditRef = doc(paymentsRef, credit.id);
            const shortId = p.id.slice(-4).toUpperCase();
            const linkToDebt = `[LINK:${p.id}:#${shortId}]`;

            batch.update(creditRef, {
                remainingAmount: newCreditRest,
                status: (newCreditRest <= 0.001) ? 'paid' : 'open',
                history: [...(credit.history || []), {
                    date: new Date(),
                    action: 'credit_used',
                    user: currentUser.displayName,
                    info: `Guthaben (${take.toFixed(2)} €) eingelöst für Eintrag ${linkToDebt}.`
                }]
            });

            const cShort = credit.id.slice(-4).toUpperCase();
            usedCreditInfo.push(`[LINK:${credit.id}:#${cShort}] (${take.toFixed(2)} €)`);
            creditSourceData.push({ id: credit.id, amount: take });
        }

        // 2. Schulden-Eintrag aktualisieren
        const currentRest = parseFloat(p.remainingAmount);
        const newRest = currentRest - amountToUse;
        const debtRef = doc(paymentsRef, p.id);

        // Transaktions-Liste vorbereiten
        let newTransactions = [...(p.transactions || [])];

        // Wenn wir eine Anfrage ersetzen, löschen wir sie aus der Liste
        if (replaceTxIndex !== null && replaceTxIndex >= 0) {
            newTransactions.splice(replaceTxIndex, 1);
        }

        const transaction = {
            date: new Date(),
            amount: amountToUse,
            type: 'credit_usage',
            user: currentUser.displayName, // Der Admin, der genehmigt hat
            info: `Bezahlt mit Guthaben aus: ${usedCreditInfo.join(', ')}`,
            creditSources: creditSourceData
        };
        
        newTransactions.push(transaction);

        let newStatus = 'open';
        if (!p.isTBD && newRest <= 0.001) {
            newStatus = 'paid';
        }

        const logInfo = p.isTBD
            ? `Vorauszahlung durch Guthaben (${amountToUse.toFixed(2)} €).`
            : `Zahlung erhalten durch Guthaben (${amountToUse.toFixed(2)} €).`;

        batch.update(debtRef, {
            remainingAmount: newRest,
            status: newStatus,
            transactions: newTransactions,
            history: [...(p.history || []), {
                date: new Date(),
                action: 'paid_with_credit',
                user: currentUser.displayName,
                info: logInfo
            }]
        });

        await batch.commit();
        alertUser("Guthaben erfolgreich verrechnet!", "success");
        // UI refresh (Modal neu laden, falls offen)
        // Da wir den Listener haben, passiert das meist automatisch, aber sicher ist sicher
        // closeDetailModal() NICHT aufrufen, damit man das Ergebnis sieht

    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Verrechnen: " + e.message, "error");
    } finally {
        if (btn) setButtonLoading(btn, false);
    }
}



// --- DRUCK FUNKTION (Robust) ---
function printPaymentDetail(paymentId) {
    const p = allPayments.find(x => x.id === paymentId);
    if (!p) return;

    // Content holen
    const contentEl = document.getElementById('payment-detail-content');
    if (!contentEl) return;

    // Druck-Container erstellen (falls nicht vorhanden)
    let printContainer = document.getElementById('print-container');
    if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'print-container';
        printContainer.style.display = 'none';
        document.body.appendChild(printContainer);
    }

    // Inhalt kopieren
    let html = `
        <div style="font-family: sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
            <h1 style="font-size: 24px; margin-bottom: 10px;">${p.title}</h1>
            <div style="border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <table style="width: 100%; margin-bottom: 10px;">
                    <tr>
                        <td><strong>Von:</strong> ${p.debtorName}</td>
                        <td style="text-align: right;"><strong>An:</strong> ${p.creditorName}</td>
                    </tr>
                </table>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 10px 0;">
                <div style="text-align: center;">
                    <div style="font-size: 12px; color: #666;">OFFENER BETRAG</div>
                    <div style="font-size: 32px; font-weight: bold;">${parseFloat(p.remainingAmount).toFixed(2)} €</div>
                </div>
            </div>
            
            <h3>Details</h3>
            <p><strong>ID:</strong> #${p.id.slice(-4).toUpperCase()}</p>
            <p><strong>Datum:</strong> ${new Date(p.createdAt?.toDate()).toLocaleDateString()}</p>
            ${p.notes ? `<p><strong>Notiz:</strong> ${p.notes}</p>` : ''}
            
            <h3 style="margin-top: 20px;">Verlauf & Protokoll</h3>
            <ul style="font-size: 12px; color: #444; list-style: none; padding: 0;">
                ${(p.history || []).map(h => {
        const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
        return `<li style="margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px dotted #ddd;">
                        <strong>${d.toLocaleString()}</strong> - ${h.user}: ${h.info}
                    </li>`;
    }).join('')}
            </ul>
        </div>
    `;

    printContainer.innerHTML = html;

    // Styles für Druck vorbereiten
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            body > * { display: none !important; }
            #print-container { display: block !important; }
            #print-container * { visibility: visible !important; }
        }
    `;
    document.head.appendChild(style);

    // Drucken
    window.print();

    // Aufräumen
    setTimeout(() => {
        document.head.removeChild(style);
        printContainer.innerHTML = '';
    }, 1000);
}

// --- RECHTE VERWALTUNG (SHARE) ---

function openShareModal(id) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    if (p.createdBy !== currentUser.mode) {
        alertUser("Nur der Ersteller kann Rechte verwalten.", "error");
        return;
    }

    // ID merken für Live-Updates
    currentShareModalId = id;

    const modal = document.getElementById('sharePaymentModal');
    
    // Modal nach vorne holen (Z-Index Fix)
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    const list = document.getElementById('share-users-list');
    const select = document.getElementById('share-add-user-select');
    const btnInvite = document.getElementById('btn-share-invite');
    const btnLink = document.getElementById('btn-copy-guest-link');

    // Helper für Labels
    const getRightLabel = (code) => {
        if (code === 'view') return 'Nur Ansehen';
        if (code === 'transact_approve') return 'Zahlen (Genehmigung)';
        if (code === 'transact_full') return 'Vollzugriff';
        return code;
    };

    // Funktion zum Entfernen von Rechten
    const handleRemoveAccess = async (userId) => {
        const access = p.accessRights ? p.accessRights[userId] : null;
        if (access && access.status === 'rejected') {
            alertUser("Nicht möglich: Der Nutzer hat abgelehnt. Er muss die Ablehnung selbst widerrufen.", "error_long");
            return;
        }

        if (!confirm("Zugriff für diesen Benutzer wirklich entfernen?")) return;

        try {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', id);

            const newInvolved = p.involvedUserIds.filter(uid => uid !== userId);

            await updateDoc(ref, {
                involvedUserIds: newInvolved,
                [`accessRights.${userId}`]: deleteField(),
                history: [...(p.history || []), {
                    date: new Date(), action: 'access_removed', user: currentUser.displayName,
                    info: `Zugriff für ${USERS[userId]?.name} entfernt.`
                }]
            });

            // Lokal auch entfernen für sofortiges UI-Feedback
            if (p.accessRights) delete p.accessRights[userId];
            p.involvedUserIds = newInvolved;

            alertUser("Zugriff entfernt.", "success");

            renderList();
            fillSelect();

        } catch (e) { 
            console.error(e); 
            alertUser("Fehler: " + e.message, "error"); 
        }
    };

    // Liste der berechtigten User rendern
    const renderList = () => {
        list.innerHTML = '';
        const rightsMap = p.accessRights || {};

        Object.keys(rightsMap).forEach(userId => {
            if (userId === currentUser.mode) return;

            const access = rightsMap[userId];
            // 'removed' ignorieren wir, das ist ein Soft-Delete Status
            if (access.status === 'removed') return;

            const userObj = USERS[userId];
            const name = userObj ? (userObj.realName || userObj.name) : "Unbekannt (" + userId + ")";

            let statusColor = 'text-gray-500';
            let statusText = 'Wartet...';
            if (access.status === 'accepted') { statusColor = 'text-green-600'; statusText = 'Akzeptiert'; }
            if (access.status === 'rejected') { statusColor = 'text-red-600'; statusText = 'Abgelehnt'; }

            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-2 bg-gray-50 border rounded shadow-sm";
            div.innerHTML = `
                <div>
                    <p class="font-bold text-sm text-gray-800">${name}</p>
                    <p class="text-xs ${statusColor}">${statusText} • ${getRightLabel(access.rights)}</p>
                </div>
                <button class="text-red-500 hover:text-red-700 p-1 remove-btn" title="Zugriff entziehen">&times;</button>
            `;

            div.querySelector('.remove-btn').onclick = () => handleRemoveAccess(userId);
            list.appendChild(div);
        });

        if (list.innerHTML === '') {
            list.innerHTML = '<p class="text-center text-gray-400 text-xs py-2">Noch niemand eingeladen.</p>';
        }
    };

    // Dropdown füllen (nur User, die noch keinen Zugriff haben)
    const fillSelect = () => {
        select.innerHTML = '';
        const rightsMap = p.accessRights || {};

        Object.values(USERS).forEach(u => {
            // Mich selbst und inaktive User ausschließen
            if (u.id !== currentUser.mode && u.isActive) {
                // Prüfen, ob schon eingeladen
                const isInvited = rightsMap[u.id] && rightsMap[u.id].status !== 'removed';
                if (!isInvited) {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = u.realName || u.name;
                    select.appendChild(opt);
                }
            }
        });
    };

    // Initialer Render-Aufruf
    renderList();
    fillSelect();

    // Einladen-Button Logik
    btnInvite.onclick = async () => {
        const targetUserId = select.value;
        const rights = document.getElementById('share-add-rights-select').value;
        
        if (!targetUserId) return;

        setButtonLoading(btnInvite, true);
        try {
            const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', id);

            const newInvolved = [...(p.involvedUserIds || [])];
            if (!newInvolved.includes(targetUserId)) newInvolved.push(targetUserId);

            // Update Objekt bauen
            const updateData = {};
            updateData[`accessRights.${targetUserId}`] = {
                status: 'pending',
                rights: rights,
                invitedAt: new Date().toISOString()
            };
            updateData['involvedUserIds'] = newInvolved;

            const historyEntry = {
                date: new Date(),
                action: 'invite_sent',
                user: currentUser.displayName,
                info: `Benutzer ${USERS[targetUserId]?.name} eingeladen (${getRightLabel(rights)}).`
            };

            await updateDoc(ref, {
                ...updateData,
                history: [...(p.history || []), historyEntry]
            });

            // Lokal aktualisieren
            if (!p.accessRights) p.accessRights = {};
            p.accessRights[targetUserId] = { status: 'pending', rights: rights, invitedAt: new Date().toISOString() };
            p.involvedUserIds = newInvolved;

            // Pushmail-Benachrichtigung für eingeladenen User (nur wenn Zahlung nicht gelöscht)
            if (!p.deleted && !p.inTrash) {
                await createPendingNotification(
                    targetUserId,
                    'ZAHLUNGSVERWALTUNG',
                    'teilungsanfrage_eingehend',
                {
                    id: id,
                    path: `/zahlungsverwaltung/payment/${id}`,
                    absender: currentUser.displayName || currentUser.mode,
                    betrag: parseFloat(p.amount || 0).toFixed(2),
                    grund: p.title || 'Keine Beschreibung'
                }
                );
            }

            alertUser("Einladung gesendet!", "success");
            renderList();
            fillSelect();

        } catch (e) { 
            console.error(e); 
            alertUser("Fehler: " + e.message, "error"); 
        } finally { 
            setButtonLoading(btnInvite, false); 
        }
    };

    // Link kopieren Logik (BUG 2 FIX & Einzel-Link Logik)
    btnLink.onclick = () => {
        // Wir prüfen kurz, ob es ein "echter" registrierter App-User ist (kein Kontakt)
        let partnerId = (p.debtorId === currentUser.mode) ? p.creditorId : p.debtorId;
        const isRegistered = USERS[partnerId];

        if (isRegistered) {
            alertUser("Info: Registrierte Nutzer sollten sich normal einloggen.", "info");
            // Wir erlauben das Kopieren trotzdem für den Notfall
        }

        const baseUrl = window.location.origin + window.location.pathname;

        (async () => {
            let tokenToUse = p.guestToken || null;

            if (!tokenToUse) {
                try {
                    tokenToUse = generateGuestToken();
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', id), {
                        guestToken: tokenToUse,
                        guestTokenCreatedAt: serverTimestamp(),
                        guestTokenViews: 0
                    });
                    p.guestToken = tokenToUse;
                } catch (e) {
                    console.error(e);
                }
            }

            const link = tokenToUse
                ? `${baseUrl}?guest_id=PAYMENT:${id}&token=${tokenToUse}`
                : `${baseUrl}?guest_id=PAYMENT:${id}`;

            navigator.clipboard.writeText(link).then(() => { 
                alertUser("Link für DIESE EINE Zahlung kopiert!", "success"); 
            }).catch(() => {
                prompt("Link kopieren:", link);
            });
        })();
    };

    modal.style.display = 'flex';
};
window.openShareModal = openShareModal;








async function removeAccess(paymentId, userId) {
    const p = allPayments.find(x => x.id === paymentId);
    if (!p) return;

    // NEU: Check auf 'rejected'
    const access = p.accessRights ? p.accessRights[userId] : null;
    if (access && access.status === 'rejected') {
        alertUser("Nicht möglich: Der Nutzer hat abgelehnt. Er muss die Ablehnung selbst widerrufen, bevor du ihn neu einladen kannst.", "error_long");
        return;
    }

    if (!confirm("Zugriff für diesen Benutzer entfernen?")) return;

    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId);

        const newInvolved = p.involvedUserIds.filter(uid => uid !== userId);

        await updateDoc(ref, {
            involvedUserIds: newInvolved,
            [`accessRights.${userId}`]: deleteField(),
            history: [...(p.history || []), {
                date: new Date(), action: 'access_removed', user: currentUser.displayName,
                info: `Zugriff für ${USERS[userId]?.name} entfernt.`
            }]
        });

        if (p.accessRights) delete p.accessRights[userId];
        p.involvedUserIds = newInvolved;

        const list = document.getElementById('share-users-list');
        if (list) {
            const btn = list.querySelector(`.remove-access-btn[data-uid="${userId}"]`);
            if (btn) btn.closest('div').remove();
        }

        alertUser("Zugriff entfernt.", "success");

    } catch (e) { console.error(e); alertUser("Fehler: " + e.message, "error"); }
}



function getRightLabel(code) {
    if (code === 'view') return 'Nur Ansehen';
    if (code === 'transact_approve') return 'Zahlen (Genehmigung)';
    if (code === 'transact_full') return 'Vollzugriff';
    return code;
}

function updateInvitationDashboard() {
    let inviteContainer = document.getElementById('invitation-alert-container');

    if (!inviteContainer) {
        const parent = document.getElementById('zahlungsverwaltungView');
        const ref = document.getElementById('dashboard-controls-wrapper');
        const fallback = document.getElementById('payments-list-container');

        inviteContainer = document.createElement('div');
        inviteContainer.id = 'invitation-alert-container';

        if (ref) {
            parent.insertBefore(inviteContainer, ref);
        } else if (fallback) {
            parent.insertBefore(inviteContainer, fallback);
        } else {
            parent.appendChild(inviteContainer);
        }
    }

    inviteContainer.innerHTML = '';

    const pendingInvites = allPayments.filter(p =>
        p.accessRights &&
        p.accessRights[currentUser.mode] &&
        p.accessRights[currentUser.mode].status === 'pending'
    );

    if (pendingInvites.length === 0) {
        inviteContainer.classList.add('hidden');
        return;
    }

    inviteContainer.classList.remove('hidden');

    pendingInvites.forEach(p => {
        // NEU: Daten auflösen
        const creatorUser = USERS[p.createdBy];
        const creatorName = creatorUser ? (creatorUser.realName || creatorUser.name) : "Unbekannt";

        const myAccess = p.accessRights[currentUser.mode];
        const debtDate = p.startDate ? new Date(p.startDate).toLocaleDateString() : '?';
        const inviteDate = myAccess.invitedAt ? new Date(myAccess.invitedAt).toLocaleDateString() : '?';

        const div = document.createElement('div');
        div.className = "bg-indigo-600 text-white p-3 rounded-xl shadow-lg mb-3 flex flex-col gap-2 animate-pulse-slow";
        div.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-sm">💌 Neue Einladung!</p>
                    <p class="text-xs font-bold mt-0.5">${p.title}</p>
                    <p class="text-[10px] opacity-90 mt-1 leading-tight">
                        Von: <strong>${creatorName}</strong><br>
                        Fall vom: ${debtDate} • Eingeladen am: ${inviteDate}
                    </p>
                </div>
                <span class="font-mono font-bold text-lg">${parseFloat(p.remainingAmount).toFixed(2)}€</span>
            </div>
            <div class="flex gap-2 mt-1">
                <button class="flex-1 bg-white text-indigo-700 py-2 rounded-lg font-bold text-xs hover:bg-gray-100 btn-accept shadow-sm">Annehmen</button>
                <button class="flex-1 bg-indigo-800 text-white py-2 rounded-lg font-bold text-xs hover:bg-indigo-900 btn-reject shadow-sm">Ablehnen</button>
            </div>
        `;

        div.querySelector('.btn-accept').onclick = () => respondToInvite(p.id, 'accepted');
        div.querySelector('.btn-reject').onclick = () => respondToInvite(p.id, 'rejected');

        inviteContainer.appendChild(div);
    });
}



async function respondToInvite(paymentId, response) {
    try {
        const p = allPayments.find(x => x.id === paymentId);
        if (!p) return;

        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId);

        await updateDoc(ref, {
            [`accessRights.${currentUser.mode}.status`]: response,
            history: [...(p.history || []), {
                date: new Date(), action: 'invite_response', user: currentUser.displayName,
                info: `Einladung ${response === 'accepted' ? 'angenommen' : 'abgelehnt'}.`
            }]
        });

        // Pushmail-Benachrichtigung für Ersteller (nur wenn Zahlung nicht gelöscht)
        const statusText = response === 'accepted' ? 'angenommen' : 'abgelehnt';
        if (!p.deleted && !p.inTrash) {
            await createPendingNotification(
                p.createdBy,
                'ZAHLUNGSVERWALTUNG',
                'teilungsanfrage_antwort',
                {
                    id: paymentId,
                    path: `/zahlungsverwaltung/payment/${paymentId}`,
                    empfaenger: currentUser.displayName || currentUser.mode,
                    antwort: statusText,
                    betrag: parseFloat(p.amount || 0).toFixed(2)
                }
            );
        }

        alertUser(response === 'accepted' ? "Einladung angenommen!" : "Einladung abgelehnt.", "success");
    } catch (e) { console.error(e); alertUser("Fehler: " + e.message, "error"); }
}


// BUG 3 FIX: Neue Funktion zum kompletten Verlassen
async function leavePayment(paymentId) {
    if (!confirm("Möchtest du den Zugriff auf diesen Eintrag wirklich entfernen?")) return;

    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId);
        const p = allPayments.find(x => x.id === paymentId);

        // Entferne mich aus der Liste der Beteiligten
        const newInvolved = p.involvedUserIds.filter(uid => uid !== currentUser.mode);

        // Entferne meinen Eintrag aus accessRights komplett
        await updateDoc(ref, {
            involvedUserIds: newInvolved,
            [`accessRights.${currentUser.mode}`]: deleteField(),
            history: [...(p.history || []), {
                date: new Date(), action: 'access_left', user: currentUser.displayName,
                info: `Benutzer hat den Eintrag verlassen.`
            }]
        });

        alertUser("Eintrag entfernt.", "success");
        renderRequestOverview(); // Liste aktualisieren

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    }
}


// --- ANFRAGEN VERWALTUNG (SETTINGS) ---
function renderRequestOverview() {
    const contentArea = document.getElementById('content-zv-requests');
    if (!contentArea) return;

    // Helper für lesbare Rechte
    const getRightLabel = (code) => {
        if (code === 'view') return 'Nur Ansehen';
        if (code === 'transact_approve') return 'Zahlen (Genehmigung)';
        if (code === 'transact_full') return 'Vollzugriff';
        return code;
    };

    // Grundgerüst HTML aufbauen
    contentArea.innerHTML = `
        <div class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-yellow-500">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">Anfragen & Freigaben</h3>
                    <p class="text-xs text-gray-500">Verwalte deine Zugriffsrechte.</p>
                </div>
                <label class="flex items-center gap-2 cursor-pointer bg-gray-50 px-2 py-1 rounded border border-gray-200">
                    <input type="checkbox" id="show-closed-requests-cb" class="h-4 w-4 text-indigo-600 rounded" ${showClosedRequests ? 'checked' : ''}>
                    <span class="text-xs font-bold text-gray-600">Geschlossene Fälle anzeigen</span>
                </label>
            </div>
            
            <div class="mb-6">
                <h4 class="font-black text-sm text-gray-600 uppercase tracking-wider border-b pb-1 mb-2 bg-gray-100 p-1 rounded">📥 Posteingang (Empfangen)</h4>
                
                <h5 class="font-bold text-xs text-indigo-700 mt-2 mb-1">Offene Anfragen</h5>
                <div id="zv-requests-pending-list" class="space-y-2 mb-2"></div>

                <h5 class="font-bold text-xs text-green-700 mt-2 mb-1">Angenommen (Aktiv)</h5>
                <div id="zv-requests-accepted-list" class="space-y-2 mb-2"></div>

                <h5 class="font-bold text-xs text-red-700 mt-2 mb-1">Abgelehnt</h5>
                <div id="zv-requests-rejected-list" class="space-y-2"></div>
            </div>

            <div>
                <h4 class="font-black text-sm text-gray-600 uppercase tracking-wider border-b pb-1 mb-2 bg-gray-100 p-1 rounded">📤 Postausgang (Gesendet)</h4>
                <div id="zv-requests-sent-list" class="space-y-2"></div>
            </div>
        </div>
    `;

    // Event Listener für die Checkbox "Geschlossene anzeigen"
    document.getElementById('show-closed-requests-cb').addEventListener('change', (e) => {
        showClosedRequests = e.target.checked;
        renderRequestOverview(); // Liste neu laden
    });

    const pendList = document.getElementById('zv-requests-pending-list');
    const accList = document.getElementById('zv-requests-accepted-list');
    const rejList = document.getElementById('zv-requests-rejected-list');
    const sentList = document.getElementById('zv-requests-sent-list');

    let hasPend = false, hasAcc = false, hasRej = false, hasSent = false;

    // Durch alle Zahlungen iterieren
    allPayments.forEach(p => {
        // Filter-Logik: Ist der Fall geschlossen?
        const isClosed = (p.status === 'paid' || p.status === 'cancelled' || p.status === 'settled' || parseFloat(p.remainingAmount) <= 0.001);

        // Wenn geschlossen UND Checkbox aus -> Überspringen
        if (isClosed && !showClosedRequests) return;


        // --- 1. EMPFANGENE (Ich wurde eingeladen) ---
        if (p.createdBy !== currentUser.mode) {
            const myAccess = p.accessRights ? p.accessRights[currentUser.mode] : null;
            
            if (myAccess) {
                const creatorUser = USERS[p.createdBy];
                const creatorName = creatorUser ? (creatorUser.realName || creatorUser.name) : "Unbekannt";
                const debtDate = p.startDate ? new Date(p.startDate).toLocaleDateString() : '?';

                // Style für geschlossene Fälle anpassen (ausgegraut)
                const opacityClass = isClosed ? 'opacity-60 bg-gray-100' : 'bg-white';
                const statusBadge = isClosed ? '<span class="ml-1 text-[9px] bg-gray-200 px-1 rounded text-gray-500">Geschlossen</span>' : '';

                const div = document.createElement('div');
                div.className = `flex justify-between items-center p-2 border rounded text-sm ${opacityClass}`;
                const infoHtml = `
                    <div>
                        <span class="font-bold block">${p.title} ${statusBadge}</span>
                        <div class="text-xs text-gray-500">
                            Von: <strong>${creatorName}</strong> • ${parseFloat(p.remainingAmount).toFixed(2)}€<br>
                            <span class="text-[10px]">Vom: ${debtDate} • Rechte: ${getRightLabel(myAccess.rights)}</span>
                        </div>
                    </div>`;

                if (myAccess.status === 'pending') {
                    div.innerHTML = infoHtml + `
                        <div class="flex gap-1 ml-2">
                            <button class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 btn-accept">✔</button>
                            <button class="text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 btn-reject">✖</button>
                        </div>`;
                    
                    div.querySelector('.btn-accept').onclick = () => respondToInvite(p.id, 'accepted');
                    div.querySelector('.btn-reject').onclick = () => respondToInvite(p.id, 'rejected');
                    
                    pendList.appendChild(div);
                    hasPend = true;
                }
                else if (myAccess.status === 'accepted') {
                    // BUG 3 FIX: Hier nutzen wir 'leavePayment' statt 'respondToInvite'
                    div.innerHTML = infoHtml + `<button class="text-xs text-gray-400 hover:text-red-500 hover:underline btn-leave ml-2">Verlassen</button>`;
                    
                    div.querySelector('.btn-leave').onclick = () => leavePayment(p.id);
                    
                    accList.appendChild(div);
                    hasAcc = true;
                }
                else if (myAccess.status === 'rejected') {
                    div.innerHTML = infoHtml + `<button class="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded border border-orange-200 hover:bg-orange-200 revoke-btn ml-2">Widerrufen</button>`;
                    
                    div.querySelector('.revoke-btn').onclick = () => revokeRejection(p.id);
                    
                    rejList.appendChild(div);
                    hasRej = true;
                }
            }
        }

        // --- 2. GESENDETE (Ich habe eingeladen) ---
        if (p.createdBy === currentUser.mode && p.accessRights) {
            Object.keys(p.accessRights).forEach(userId => {
                if (userId === currentUser.mode) return;
                
                const acc = p.accessRights[userId];
                if (acc.status === 'removed') return;

                const userObj = USERS[userId];
                const targetName = userObj ? (userObj.realName || userObj.name) : userId;

                let stColor = 'text-gray-500', stText = 'Wartet';
                if (acc.status === 'accepted') { stColor = 'text-green-600 font-bold'; stText = 'Angenommen'; }
                if (acc.status === 'rejected') { stColor = 'text-red-600 font-bold'; stText = 'Abgelehnt'; }

                const opacityClass = isClosed ? 'opacity-60 bg-gray-50' : 'bg-white';
                const statusBadge = isClosed ? '<span class="ml-1 text-[9px] bg-gray-200 px-1 rounded text-gray-500">Geschlossen</span>' : '';

                const div = document.createElement('div');
                div.className = `p-2 border border-gray-200 rounded text-sm flex justify-between items-center ${opacityClass}`;
                div.innerHTML = `
                    <div>
                        <span class="font-bold block text-gray-800">An: ${targetName} ${statusBadge}</span>
                        <div class="text-xs text-gray-500">
                            Betreff: ${p.title}<br>
                            <span class="text-[10px]">Rechte: ${getRightLabel(acc.rights)}</span>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-xs ${stColor} block">${stText}</span>
                        <button class="text-[10px] text-indigo-500 hover:underline edit-share-btn">Verwalten</button>
                    </div>
                `;
                
                div.querySelector('.edit-share-btn').onclick = () => openShareModal(p.id);
                
                sentList.appendChild(div);
                hasSent = true;
            });
        }
    });

    // Leere Listen Texte
    if (!hasPend) pendList.innerHTML = '<p class="text-xs text-gray-400 italic pl-2">Keine offenen Anfragen.</p>';
    if (!hasAcc) accList.innerHTML = '<p class="text-xs text-gray-400 italic pl-2">Keine aktiven Freigaben.</p>';
    if (!hasRej) rejList.innerHTML = '<p class="text-xs text-gray-400 italic pl-2">Keine abgelehnten Einladungen.</p>';
    if (!hasSent) sentList.innerHTML = '<p class="text-xs text-gray-400 italic pl-2">Keine Einladungen versendet.</p>';
}





async function revokeRejection(paymentId) {
    if (!confirm("Möchtest du deine Ablehnung widerrufen? Die Einladung wird entfernt, sodass du erneut eingeladen werden kannst.")) return;

    try {
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId);
        const p = allPayments.find(x => x.id === paymentId);

        // Wir entfernen den Eintrag aus accessRights und aus involvedUserIds
        // Damit ist der Zustand so, als wäre man nie eingeladen worden.
        // Der Ersteller sieht dann wieder "Einladen" im Dropdown.

        // 1. Local Arrays kopieren & filtern
        const newInvolved = p.involvedUserIds.filter(uid => uid !== currentUser.mode);

        // 2. Firestore Update (Feld löschen via update)
        // Da wir `deleteField` nicht importiert haben, nutzen wir den Trick mit dem kompletten Überschreiben der accessRights Map
        // oder wir setzen den status auf null/removed.
        // Am saubersten: Status auf 'removed' setzen (Soft Delete). Dann weiß der Ersteller Bescheid.
        // ODER: Einfach löschen. Wir löschen es logisch.

        // Da wir dynamische Keys haben, lesen wir erst die Map, ändern sie und schreiben zurück? 
        // Nein, wir haben ja p.accessRights lokal.
        const newAccessRights = { ...p.accessRights };
        delete newAccessRights[currentUser.mode]; // Löschen

        await updateDoc(ref, {
            involvedUserIds: newInvolved,
            accessRights: newAccessRights,
            history: [...(p.history || []), {
                date: new Date(), action: 'invite_revoked', user: currentUser.displayName,
                info: `Benutzer hat Ablehnung widerrufen und Eintrag verlassen.`
            }]
        });

        alertUser("Entscheidung widerrufen.", "success");
        renderRequestOverview(); // Neu zeichnen

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    }
}




async function requestCreditUsage(paymentId, amount, note) {
    const p = allPayments.find(x => x.id === paymentId);
    if (!p) return;

    const btn = document.getElementById('btn-smart-pay');
    if (btn) setButtonLoading(btn, true);

    try {
        const transaction = {
            date: new Date(),
            amount: amount,
            type: 'credit_request', // Spezieller Typ
            user: currentUser.displayName,
            approvalPending: true, // Gelbe Markierung
            info: `Guthaben-Anfrage: ${note ? note : 'Keine Notiz'}`
        };

        // Log-Eintrag
        const historyEntry = {
            date: new Date(),
            action: 'payment_request',
            user: currentUser.displayName,
            info: `Anfrage auf Guthaben-Verrechnung (${amount.toFixed(2)} €) gestellt.`
        };

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId), {
            transactions: [...(p.transactions || []), transaction],
            history: [...(p.history || []), historyEntry]
        });

        alertUser("Anfrage an Admin gesendet.", "success");
        // UI wird durch Listener aktualisiert (Modal bleibt offen aber zeigt neuen Status)

    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Senden der Anfrage.", "error");
    } finally {
        if (btn) setButtonLoading(btn, false);
    }
}





async function approveTransaction(paymentId, txIndex) {
    const p = allPayments.find(x => x.id === paymentId);
    if (!p) return;

    const tx = p.transactions[txIndex];
    const isCreditRequest = tx.type === 'credit_request';

    let confirmMsg = "Diese Zahlung genehmigen und verbuchen?";
    if (isCreditRequest) confirmMsg = `Guthaben-Anfrage über ${parseFloat(tx.amount).toFixed(2)} € genehmigen und verrechnen?`;

    if (!confirm(confirmMsg)) return;

    if (isCreditRequest) {
        await executePayWithCredit(paymentId, parseFloat(tx.amount), txIndex);
        return;
    }

    try {
        const amount = parseFloat(tx.amount);
        const newTransactions = [...p.transactions];
        newTransactions[txIndex] = {
            ...tx,
            approvalPending: false,
            type: 'payment',
            approvedBy: currentUser.displayName,
            approvedAt: new Date()
        };

        let currentRest = parseFloat(p.remainingAmount);
        let newRest = currentRest - amount;
        let newStatus = p.status;

        if (newRest <= 0.001) {
            newRest = 0;
            newStatus = 'paid';
        }

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId), {
            transactions: newTransactions,
            remainingAmount: newRest,
            status: newStatus,
            history: [...(p.history || []), {
                date: new Date(), action: 'payment_approved', user: currentUser.displayName,
                info: `Zahlung von ${tx.user} (${amount.toFixed(2)} €) genehmigt und verbucht.`
            }]
        });

        alertUser("Zahlung genehmigt.", "success");
    } catch (e) { console.error(e); alertUser("Fehler.", "error"); }
}
// Global verfügbar machen
window.approveTransaction = approveTransaction;


async function rejectTransaction(paymentId, txIndex) {
    const p = allPayments.find(x => x.id === paymentId);
    if (!p) return;

    if (!confirm("Diese Zahlungsanfrage ablehnen und löschen?")) return;

    try {
        const tx = p.transactions[txIndex];
        const newTransactions = p.transactions.filter((_, i) => i !== txIndex);

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId), {
            transactions: newTransactions,
            history: [...(p.history || []), {
                date: new Date(), action: 'payment_rejected', user: currentUser.displayName,
                info: `Zahlungsanfrage von ${tx.user} (${parseFloat(tx.amount).toFixed(2)} €) abgelehnt.`
            }]
        });

        alertUser("Anfrage abgelehnt.", "success");
    } catch (e) { console.error(e); alertUser("Fehler.", "error"); }
}
// Global verfügbar machen
window.rejectTransaction = rejectTransaction;




// --- POSITIONS LOGIK (Multi-Item) ---

// --- POSITIONS LOGIK (Multi-Item) ---

function addPositionInput(name = '', price = '') {
    const container = document.getElementById('positions-container');
    if (!container) return;

    container.classList.remove('hidden');

    const id = Date.now() + Math.random();
    const div = document.createElement('div');
    div.className = "flex gap-2 items-center position-row animate-fade-in";
    div.dataset.id = id;

    div.innerHTML = `
        <input type="text" class="pos-name flex-grow p-1.5 border border-gray-300 rounded text-sm" placeholder="Beschreibung (z.B. Ticket)" value="${name}">
        <div class="relative w-24">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">€</span>
            <input type="number" class="pos-price w-full pl-5 p-1.5 border border-gray-300 rounded text-sm text-right font-mono" placeholder="0.00" step="0.01" value="${price}">
        </div>
        <button class="text-red-400 hover:text-red-600 p-1 remove-pos-btn">&times;</button>
    `;

    const nameInput = div.querySelector('.pos-name');
    const priceInput = div.querySelector('.pos-price');

    // --- NEU: ENTER-LOGIK FÜR SCHNELLERES EINTIPPEN ---
    
    // 1. Enter im Namen -> Springe zum Preis
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Verhindert Formular-Submit
            priceInput.focus();
        }
    });

    // 2. Enter im Preis -> Neue Zeile erstellen
    priceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addPositionInput(); // Ruft sich selbst auf -> Neue Zeile
        }
    });

    // Listener für Summen-Update
    priceInput.addEventListener('input', calculateTotalFromPositions);

    // Listener Löschen
    div.querySelector('.remove-pos-btn').onclick = () => {
        div.remove();
        calculateTotalFromPositions();
        if (container.children.length === 0) container.classList.add('hidden');
    };

    container.appendChild(div);
    
    // Fokus auf Name setzen (passiert automatisch beim Erstellen)
    nameInput.focus();
}


function calculateTotalFromPositions() {
    const inputs = document.querySelectorAll('.pos-price');
    let total = 0;
    let hasValue = false;

    inputs.forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
            total += val;
            hasValue = true;
        }
    });

    const mainAmount = document.getElementById('payment-amount');
    const isTBD = document.getElementById('payment-amount-tbd')?.checked;

    // --- FIX: Wenn TBD aktiv ist, ignorieren wir die Summen-Berechnung für das Hauptfeld ---
    if (isTBD) {
        return;
    }

    // Nur überschreiben, wenn Positionen da sind
    if (hasValue) {
        mainAmount.value = total.toFixed(2);
        mainAmount.disabled = true; // Sperren, damit man nicht manuell die Summe manipuliert
        mainAmount.classList.add('bg-gray-100');

        // Button aktivieren (falls er durch manuelles Löschen deaktiviert war)
        const saveBtn = document.getElementById('btn-save-payment');
        const splitMode = document.getElementById('toggle-split-mode').checked;
        if (!splitMode && saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            saveBtn.title = "";
        }

    } else if (inputs.length === 0) {
        // Keine Positionen mehr -> Freigeben
        mainAmount.disabled = false;
        mainAmount.classList.remove('bg-gray-100');
    }

    // Split-Berechnung aktualisieren (falls Split aktiv)
    if (document.getElementById('split-people-container')) {
        updateSplitPreview();
    }
}


function openPendingTransactionsModal() {
    const modal = document.getElementById('pendingTransactionsModal');
    const list = document.getElementById('pending-transactions-list');
    if (!modal || !list) return;

    list.innerHTML = '';
    let found = false;

    allPayments.forEach(p => {
        if (p.createdBy === currentUser.mode && p.transactions) {
            p.transactions.forEach((tx, index) => {
                if (tx.approvalPending) {
                    found = true;

                    const div = document.createElement('div');
                    div.className = "bg-white border border-orange-200 rounded-lg p-3 shadow-sm";

                    const dateStr = new Date(tx.date?.toDate ? tx.date.toDate() : tx.date).toLocaleDateString();

                    div.innerHTML = `
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <p class="font-bold text-gray-800">${p.title}</p>
                                <p class="text-xs text-gray-500">Von: <strong>${tx.user}</strong> am ${dateStr}</p>
                            </div>
                            <span class="font-mono font-bold text-lg text-orange-600">${parseFloat(tx.amount).toFixed(2)} €</span>
                        </div>
                        <div class="text-xs text-gray-600 bg-gray-50 p-2 rounded mb-2">
                            ${tx.info || 'Keine Info'}
                        </div>
                        <div class="flex gap-2">
                            <button class="flex-1 py-2 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 btn-approve">Genehmigen</button>
                            <button class="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded hover:bg-red-100 btn-reject">Ablehnen</button>
                        </div>
                    `;

                    // Button Logik
                    div.querySelector('.btn-approve').onclick = async () => {
                        await approveTransaction(p.id, index);
                        openPendingTransactionsModal(); // Modal neu laden (aktualisieren)
                    };
                    div.querySelector('.btn-reject').onclick = async () => {
                        await rejectTransaction(p.id, index);
                        openPendingTransactionsModal(); // Modal neu laden
                    };

                    list.appendChild(div);
                }
            });
        }
    });

    if (!found) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">Keine offenen Buchungen.</p>';
    }

    modal.style.display = 'flex';
}


// --- SMART SPLIT LOGIK ---

// --- SMART SPLIT LOGIK ---

function openSplitAdjustmentModal(targetId, targetName) {
    const modal = document.getElementById('splitAdjustmentModal');
    document.getElementById('adj-target-name').textContent = targetName;
    document.getElementById('adj-target-id').value = targetId;

    // --- FIX: Modal nach vorne holen (Z-Index Problem) ---
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    // -----------------------------------------------------

    // Reset UI
    document.getElementById('adj-amount').value = '';
    document.getElementById('adj-selection-list').innerHTML = '';
    document.getElementById('adj-manual-status').classList.add('hidden');
    document.getElementById('adj-selection-list').classList.add('hidden');

    // Buttons
    const btnDelete = document.getElementById('btn-delete-adj');

    // --- LADEN EXISTIERENDER DATEN ---
    const existingConfig = currentSplitAdjustments[targetId];

    if (existingConfig) {
        // Werte setzen
        document.getElementById('adj-amount').value = existingConfig.amount.toFixed(2);
        document.getElementById('adj-direction').value = existingConfig.direction;

        // Radio Button setzen
        const distVal = existingConfig.mode === 'select' ? 'select' : 'all';
        const radio = document.querySelector(`input[name="adj-distribution"][value="${distVal}"]`);
        if (radio) {
            radio.checked = true;
            if (distVal === 'select') {
                document.getElementById('adj-selection-list').classList.remove('hidden');
                document.getElementById('adj-manual-status').classList.remove('hidden');
            }
        }

        // Löschen Button zeigen
        btnDelete.classList.remove('hidden');
        btnDelete.onclick = () => {
            delete currentSplitAdjustments[targetId];
            recalculateGlobalOffsets();
            updateSplitPreview();
            // WICHTIG: Button Style resetten (orange weg)
            const row = document.querySelector(`.row-item[data-id="${targetId}"]`);
            if (row) {
                const btn = row.querySelector('.btn-adj-split');
                btn.classList.remove('bg-orange-100', 'text-orange-600', 'border', 'border-orange-400', 'font-black');
                btn.classList.add('bg-gray-200', 'text-gray-600', 'font-bold');
            }
            modal.style.display = 'none';
        };

    } else {
        // Neu -> Reset
        document.querySelector('input[name="adj-distribution"][value="all"]').checked = true;
        document.getElementById('adj-direction').value = 'more';
        btnDelete.classList.add('hidden');
    }

    // --- ENTER-LOGIK HINZUFÜGEN ---
    const amountInput = document.getElementById('adj-amount');
    // Altes Event entfernen (durch Klonen des Elements - sauberer Reset)
    const newAmountInput = amountInput.cloneNode(true);
    amountInput.parentNode.replaceChild(newAmountInput, amountInput);
    
    newAmountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            applySplitAdjustment();
        }
    });

    // UI FIX: Dropdown darf schrumpfen, Input und Euro bleiben fest
    const containerDiv = newAmountInput.parentElement;
    if (containerDiv) {
        // Wir bauen den HTML Inhalt des Containers neu auf, um die Klassen zu fixen
        // Ziel: Dropdown (flex-1 min-w-0), Input (w-20 flex-shrink-0), Euro (flex-shrink-0)
        const select = document.getElementById('adj-direction');
        
        // Klassen anpassen
        select.className = "flex-1 min-w-0 p-2 border rounded-lg text-xs sm:text-sm bg-white"; // min-w-0 verhindert Überlauf
        newAmountInput.className = "w-20 flex-shrink-0 p-2 border rounded-lg text-right font-bold"; // flex-shrink-0 verhindert Quetschen
        
        // Euro Zeichen finden und Klasse anpassen
        const euroSpan = containerDiv.querySelector('span');
        if(euroSpan) euroSpan.className = "text-gray-600 font-bold flex-shrink-0";
    }

    // --- PARTNER LISTE GENERIEREN ---
    const list = document.getElementById('adj-selection-list');
    const activeCheckboxes = document.querySelectorAll('.split-cb:checked');
    let countOthers = 0;

    activeCheckboxes.forEach(cb => {
        if (cb.value !== targetId) {
            countOthers++;
            const pId = String(cb.value);
            const div = document.createElement('div');
            div.className = "flex justify-between items-center bg-gray-50 p-1 rounded border border-gray-100";

            let isChecked = false;
            let manualAmount = "";

            if (existingConfig) {
                if (existingConfig.mode === 'all') {
                    isChecked = true; 
                } else {
                    if (existingConfig.partners.includes(pId)) {
                        isChecked = true;
                        if (existingConfig.manualDistribution && existingConfig.manualDistribution[pId]) {
                            manualAmount = existingConfig.manualDistribution[pId].toFixed(2);
                        }
                    }
                }
            }

            const disabledAttr = isChecked ? '' : 'disabled';
            const bgClass = isChecked ? 'bg-white border-indigo-300 text-gray-800' : 'bg-gray-100 text-gray-400';

            div.innerHTML = `
                <label class="flex items-center gap-2 cursor-pointer flex-grow min-w-0">
                    <input type="checkbox" class="adj-partner-cb h-4 w-4 text-indigo-600 rounded" value="${pId}" ${isChecked ? 'checked' : ''}>
                    <span class="text-xs text-gray-700 truncate">${cb.dataset.name}</span>
                </label>
                <div class="flex items-center gap-1">
                    <input type="number" class="adj-partner-amount w-16 p-1 text-xs border rounded text-right ${bgClass}" placeholder="0.00" ${disabledAttr} step="0.01" value="${manualAmount}">
                    <span class="text-[10px] text-gray-500">€</span>
                </div>`;

            list.appendChild(div);

            const pCb = div.querySelector('.adj-partner-cb');
            const pInp = div.querySelector('.adj-partner-amount');

            pCb.addEventListener('change', () => {
                pInp.disabled = !pCb.checked;
                if (pCb.checked) {
                    pInp.classList.remove('bg-gray-100', 'text-gray-400');
                    pInp.classList.add('bg-white', 'text-gray-800', 'border-indigo-300');
                    pInp.focus();
                } else {
                    pInp.value = '';
                    pInp.classList.add('bg-gray-100', 'text-gray-400');
                    pInp.classList.remove('bg-white', 'text-gray-800', 'border-indigo-300');
                }
                newAmountInput.dispatchEvent(new Event('input'));
            });

            pInp.addEventListener('input', () => {
                newAmountInput.dispatchEvent(new Event('input'));
            });
        }
    });

    if (countOthers === 0) {
        alertUser("Mindestens eine weitere Person erforderlich.", "error");
        return;
    }

    // Live Validierung
    const updateStatus = () => {
        const statusDiv = document.getElementById('adj-manual-status');
        const remainingSpan = document.getElementById('adj-remaining-display');
        const targetVal = parseFloat(newAmountInput.value) || 0;
        let distributed = 0;

        document.querySelectorAll('.adj-partner-cb:checked').forEach(cb => {
            const row = cb.closest('div');
            const val = parseFloat(row.querySelector('.adj-partner-amount').value) || 0;
            distributed += val;
        });

        const diff = targetVal - distributed;
        remainingSpan.textContent = diff.toFixed(2);

        if (Math.abs(diff) < 0.02) {
            statusDiv.classList.remove('text-orange-600', 'text-red-600');
            statusDiv.classList.add('text-green-600');
            statusDiv.innerHTML = `✔ Aufgeteilt: ${distributed.toFixed(2)} €`;
        } else {
            statusDiv.classList.remove('text-green-600');
            statusDiv.classList.add('text-orange-600');
            statusDiv.innerHTML = `Noch zu verteilen: <span id="adj-remaining-display">${diff.toFixed(2)}</span> €`;
        }
    };

    newAmountInput.addEventListener('input', updateStatus);

    const radios = document.getElementsByName('adj-distribution');
    radios.forEach(r => r.addEventListener('change', () => {
        const isSelect = (r.value === 'select');
        document.getElementById('adj-selection-list').classList.toggle('hidden', !isSelect);
        document.getElementById('adj-manual-status').classList.toggle('hidden', !isSelect);
        if (isSelect) updateStatus();
    }));

    const btnApply = document.getElementById('btn-apply-adj');
    const newBtnApply = btnApply.cloneNode(true);
    btnApply.parentNode.replaceChild(newBtnApply, btnApply);
    newBtnApply.addEventListener('click', () => applySplitAdjustment());

    if (existingConfig && existingConfig.mode === 'select') updateStatus();

    modal.style.display = 'flex';
    
    // Fokus in das Feld
    newAmountInput.focus();
}




function applySplitAdjustment() {
    const targetId = String(document.getElementById('adj-target-id').value);
    const direction = document.getElementById('adj-direction').value;
    let amount = parseFloat(document.getElementById('adj-amount').value);

    if (isNaN(amount) || amount < 0) {
        alertUser("Bitte validen Betrag eingeben.", "error");
        return;
    }

    const distMode = document.querySelector('input[name="adj-distribution"]:checked').value;
    let partners = [];
    let manualDist = {};

    // Partner sammeln
    if (distMode === 'all') {
        document.querySelectorAll('.split-cb:checked').forEach(cb => {
            if (String(cb.value) !== targetId) partners.push(String(cb.value));
        });
    } else {
        document.querySelectorAll('.adj-partner-cb:checked').forEach(cb => {
            partners.push(String(cb.value));
        });
    }

    if (partners.length === 0) {
        alertUser("Es muss mindestens eine weitere Person ausgewählt sein.", "error");
        return;
    }

    // Manuelle Verteilung prüfen
    if (distMode === 'select') {
        let distSum = 0;
        document.querySelectorAll('.adj-partner-cb:checked').forEach(cb => {
            const pId = String(cb.value);
            const row = cb.closest('div');
            const inp = row.querySelector('.adj-partner-amount');
            let val = parseFloat(inp.value);
            if (isNaN(val)) val = 0;

            manualDist[pId] = val;
            distSum += val;
        });

        if (Math.abs(amount - distSum) > 0.02) {
            alertUser(`Summe (${distSum.toFixed(2)}€) entspricht nicht dem Zielbetrag (${amount.toFixed(2)}€).`, "error_long");
            return;
        }
    }

    // ============================================================
    // NEU: SIMULATION & VALIDIERUNG (Minus-Check)
    // ============================================================

    // 1. Basisdaten holen
    const totalInput = document.getElementById('payment-amount');
    let totalStr = totalInput ? totalInput.value.replace(',', '.') : "0";
    const total = parseFloat(totalStr) || 0;

    const allActiveCheckboxes = document.querySelectorAll('.split-cb:checked');
    const count = allActiveCheckboxes.length;
    const baseShare = (count > 0) ? (total / count) : 0;

    // 2. Wir kopieren die aktuellen Anpassungen, um zu simulieren
    const simAdjustments = { ...currentSplitAdjustments };

    // 3. Wir fügen die NEUE (geplante) Anpassung hinzu
    simAdjustments[targetId] = {
        amount: amount,
        direction: direction,
        mode: distMode,
        partners: partners,
        manualDistribution: (distMode === 'select') ? manualDist : null
    };

    // 4. Offsets berechnen (Logik analog zu recalculateGlobalOffsets)
    const simOffsets = {};

    Object.keys(simAdjustments).forEach(tId => {
        const config = simAdjustments[tId];
        const amt = config.amount;
        const sign = (config.direction === 'more') ? 1 : -1;

        // Ziel-Person Auswirkung
        if (!simOffsets[tId]) simOffsets[tId] = 0;
        simOffsets[tId] += (amt * sign);

        // Partner Auswirkung (Gegenteil)
        const partnerSign = sign * -1;

        if (config.partners && config.partners.length > 0) {
            if (config.manualDistribution) {
                // Manuell
                Object.keys(config.manualDistribution).forEach(pId => {
                    const pAmount = config.manualDistribution[pId];
                    if (!simOffsets[pId]) simOffsets[pId] = 0;
                    simOffsets[pId] += (pAmount * partnerSign);
                });
            } else {
                // Equal
                const share = (amt / config.partners.length) * partnerSign;
                config.partners.forEach(pId => {
                    if (!simOffsets[pId]) simOffsets[pId] = 0;
                    simOffsets[pId] += share;
                });
            }
        }
    });

    // 5. Jede Person prüfen: Rutscht jemand ins Minus?
    for (const cb of allActiveCheckboxes) {
        const id = String(cb.value);
        const name = cb.dataset.name.replace(" (Gast)", ""); // Name für Fehlermeldung

        const offset = simOffsets[id] || 0;
        const finalShare = baseShare + offset;

        // Toleranz von 1 Cent wegen Rundung
        if (finalShare < -0.01) {
            alertUser(`Nicht möglich! ${name} würde ins Minus rutschen (${finalShare.toFixed(2)} €).`, "error_long");
            return; // ABBRUCH DES SPEICHERNS
        }
    }
    // ============================================================
    // ENDE SIMULATION
    // ============================================================


    // Wenn wir hier sind, ist alles okay -> Echt speichern
    currentSplitAdjustments[targetId] = simAdjustments[targetId];

    recalculateGlobalOffsets();

    document.getElementById('splitAdjustmentModal').style.display = 'none';
    updateSplitPreview();

    // Style Update (Ohne Pulse Animation für bessere Klickbarkeit)
    const row = document.querySelector(`.row-item[data-id="${targetId}"]`);
    if (row) {
        const btn = row.querySelector('.btn-adj-split');
        if (btn) {
            btn.className = "btn-adj-split flex p-1 bg-orange-100 text-orange-700 border border-orange-400 rounded text-[10px] font-black w-6 h-6 items-center justify-center transition-colors shadow-sm";
        }
    }
}






function recalculateGlobalOffsets() {
    // Reset Ergebnis
    currentSplitOffsets = {};

    // Gehe alle gespeicherten Anpassungen durch
    Object.keys(currentSplitAdjustments).forEach(targetId => {
        const config = currentSplitAdjustments[targetId];
        const amount = config.amount;
        const sign = (config.direction === 'more') ? 1 : -1;

        // 1. Auswirkung auf das Ziel (z.B. +10)
        const targetChange = amount * sign;

        if (!currentSplitOffsets[targetId]) currentSplitOffsets[targetId] = 0;
        currentSplitOffsets[targetId] += targetChange;

        // 2. Auswirkung auf die Partner (z.B. -10 verteilt)
        const partnerSign = sign * -1;

        // Wir müssen prüfen, ob die Partner aus der Config noch "aktiv" (angehakt) sind
        // Falls einer abgewählt wurde, ändert sich die Verteilung für die anderen
        let activePartners = [];

        // Checkboxen im Hauptfenster prüfen
        // Da wir hier keinen Zugriff auf DOM 'rows' haben wollen wir effizient sein.
        // Wir nehmen an, dass 'currentSplitAdjustments' sauber gehalten wird oder wir filtern hier.
        // Besser: Wir nehmen die Partner aus der Config.

        if (config.partners && config.partners.length > 0) {
            // Manueller Modus oder All Modus mit fester Liste
            // Bei 'manual' Verteilung haben wir feste Beträge
            if (config.manualDistribution) {
                // { partnerId: amount }
                Object.keys(config.manualDistribution).forEach(pId => {
                    const pAmount = config.manualDistribution[pId];
                    if (!currentSplitOffsets[pId]) currentSplitOffsets[pId] = 0;
                    currentSplitOffsets[pId] += (pAmount * partnerSign);
                });
            } else {
                // 'Equal' Verteilung auf Liste
                const share = (amount / config.partners.length) * partnerSign;
                config.partners.forEach(pId => {
                    if (!currentSplitOffsets[pId]) currentSplitOffsets[pId] = 0;
                    currentSplitOffsets[pId] += share;
                });
            }
        }
    });
}

// --- HELPER FÜR TBD MODAL ---

// --- HELPER FÜR TBD MODAL ---

function addResolvePositionInput(name = '', price = '') {
    const container = document.getElementById('tbd-positions-container');
    if (!container) return;

    container.classList.remove('hidden');

    const div = document.createElement('div');
    div.className = "flex gap-2 items-center tbd-position-row animate-fade-in";

    div.innerHTML = `
        <input type="text" class="tbd-pos-name flex-grow p-1.5 border border-gray-300 rounded text-sm" placeholder="Beschreibung" value="${name}">
        <div class="relative w-24">
            <span class="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">€</span>
            <input type="number" class="tbd-pos-price w-full pl-5 p-1.5 border border-gray-300 rounded text-sm text-right font-mono" placeholder="0.00" step="0.01" value="${price}">
        </div>
        <button class="text-red-400 hover:text-red-600 p-1 remove-tbd-pos-btn">&times;</button>
    `;

    const nameInput = div.querySelector('.tbd-pos-name');
    const priceInput = div.querySelector('.tbd-pos-price');

    // --- NEU: ENTER-LOGIK ---

    // 1. Enter im Namen -> Springe zum Preis
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            priceInput.focus();
        }
    });

    // 2. Enter im Preis -> Neue Zeile erstellen
    priceInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addResolvePositionInput(); // Neue Zeile
        }
    });

    // Listener für Summen-Update
    priceInput.addEventListener('input', calculateResolveTotal);

    // Listener Löschen
    div.querySelector('.remove-tbd-pos-btn').onclick = () => {
        div.remove();
        calculateResolveTotal();
        if (container.children.length === 0) container.classList.add('hidden');
    };

    container.appendChild(div);
    
    // Fokus setzen
    if (name === '') nameInput.focus();
}


function calculateResolveTotal() {
    const inputs = document.querySelectorAll('.tbd-pos-price');
    let total = 0;
    let hasValue = false;

    inputs.forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) {
            total += val;
            hasValue = true;
        }
    });

    const mainAmount = document.getElementById('tbd-resolve-amount');
    if (hasValue) {
        mainAmount.value = total.toFixed(2);
        mainAmount.disabled = true;
        mainAmount.classList.add('bg-gray-100');
    } else if (inputs.length === 0) {
        mainAmount.disabled = false;
        mainAmount.classList.remove('bg-gray-100');
    }
}



// --- NEU: Betrag nachtragen Funktion (Öffnet Modal) ---
// --- NEU: Betrag nachtragen Funktion (Öffnet Modal) ---
window.resolveTBD = function (id) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    // Modal Elemente vorbereiten
    const modal = document.getElementById('resolveTBDModal');
    
    // --- FIX: Modal nach vorne holen ---
    if (modal && modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    // -----------------------------------

    const amountInput = document.getElementById('tbd-resolve-amount');
    const container = document.getElementById('tbd-positions-container');
    const idInput = document.getElementById('resolve-tbd-id');

    // Reset
    idInput.value = id;
    amountInput.value = '';
    amountInput.disabled = false;
    amountInput.classList.remove('bg-gray-100');
    container.innerHTML = '';
    container.classList.add('hidden');

    // Button Listener neu binden
    const addBtn = document.getElementById('btn-add-tbd-position');
    // Alten Listener entfernen durch Klonen
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.onclick = () => addResolvePositionInput();

    const saveBtn = document.getElementById('btn-save-tbd-resolve');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.onclick = saveResolvedTBD;

    // --- NEU: Bestehende Positionen laden ---
    if (p.positions && p.positions.length > 0) {
        p.positions.forEach(pos => {
            addResolvePositionInput(pos.name, pos.price);
        });
        // Summe berechnen und Feld sperren/füllen
        calculateResolveTotal();
    }

    modal.style.display = 'flex';

    // Fokus Logik: Wenn Positionen da sind, nichts fokussieren (damit man Summe sieht), sonst Input
    if (!p.positions || p.positions.length === 0) {
        amountInput.focus();
    }
};






async function saveResolvedTBD() {
    const btn = document.getElementById('btn-save-tbd-resolve');
    const id = document.getElementById('resolve-tbd-id').value;
    const amountInput = document.getElementById('tbd-resolve-amount');

    if (!id) return;

    setButtonLoading(btn, true);

    try {
        const newVal = parseFloat(amountInput.value);
        if (isNaN(newVal) || newVal < 0) throw new Error("Bitte eine gültige positive Zahl eingeben.");

        const p = allPayments.find(x => x.id === id);
        const paidTotal = -parseFloat(p.remainingAmount); // Der bisher bezahlte Betrag (als positive Zahl)
        const diff = paidTotal - newVal;

        const positions = [];
        document.querySelectorAll('.tbd-position-row').forEach(row => {
            const name = row.querySelector('.tbd-pos-name').value.trim();
            const price = parseFloat(row.querySelector('.tbd-pos-price').value);
            if (name && !isNaN(price)) positions.push({ name, price });
        });

        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', id);

        // Fall A: Überzahlung (Konflikt)
        if (diff > 0.01) {
            // WICHTIG: Wir schreiben hier NICHTS in die Datenbank!
            // Wir schließen nur das Eingabe-Fenster und bereiten die Daten vor.
            
            document.getElementById('resolveTBDModal').style.display = 'none';

            pendingOverpaymentData = {
                paymentId: id,
                payAmount: paidTotal, 
                debtAmount: newVal,   
                excessAmount: diff,
                isTBDResolution: true, // Merker für den Abbruch-Button
                extras: {
                    // Wir speichern die Daten, die wir schreiben WOLLTEN, für später
                    tbdPayload: {
                        amount: newVal,
                        positions: positions
                    }
                }
            };

            const ovModal = document.getElementById('overpaymentModal');
            if (ovModal && ovModal.parentElement !== document.body) {
                document.body.appendChild(ovModal);
            }

            const btnCredit = document.getElementById('btn-op-credit');
            let partnerId = (p.debtorId === currentUser.mode) ? p.creditorId : p.debtorId;
            const isRealUser = USERS[partnerId];
            const isContact = allContacts.some(c => c.id === partnerId);
            
            if (isRealUser || isContact) {
                btnCredit.disabled = false;
                btnCredit.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
                btnCredit.classList.add('bg-purple-600', 'hover:bg-purple-700');
                btnCredit.innerHTML = "<span>🏦 Als Guthaben speichern</span>";
            } else {
                btnCredit.disabled = false; 
                btnCredit.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
                btnCredit.classList.add('bg-purple-600', 'hover:bg-purple-700');
                btnCredit.innerHTML = "<span>🏦 Als Guthaben speichern</span>";
            }

            document.getElementById('overpayment-amount').textContent = diff.toFixed(2) + " €";
            ovModal.classList.remove('hidden');
            ovModal.style.display = 'flex';

            setButtonLoading(btn, false);
            return; // HIER STOPPEN WIR! Kein DB Update.
        }

        // Fall B: Normal (Restbetrag offen oder exakt 0) - Hier schreiben wir sofort
        const newRemaining = newVal - paidTotal;

        const updateData = {
            amount: newVal,
            remainingAmount: newRemaining,
            isTBD: false,
            positions: positions,
            history: [...(p.history || []), { date: new Date(), action: 'tbd_resolved', user: currentUser.displayName, info: `Betrag nachgetragen: ${newVal.toFixed(2)} €.` }]
        };

        if (newRemaining <= 0.001) updateData.status = 'paid';
        else updateData.status = 'open';

        await updateDoc(ref, updateData);
        alertUser("Betrag erfolgreich eingetragen!", "success");

        document.getElementById('resolveTBDModal').style.display = 'none';

    } catch (e) { console.error(e); alertUser("Fehler: " + e.message, "error"); }
    finally { setButtonLoading(btn, false); }
}




// --- ARCHIV & PAPIERKORB LOGIK ---

// --- ERWEITERTE PAPIERKORB LOGIK ---

// Diese Funktion ersetzt deine alte renderArchiveOverview komplett
function renderArchiveOverview() {
    const listArchived = document.getElementById('zv-archive-list');
    const listTrash = document.getElementById('zv-trash-list');

    if (!listArchived || !listTrash) return;

    // --- NEU: Box-Höhe angepasst (ca. 3-fach statt 4-fach) ---
    listArchived.style.minHeight = '12rem'; 
    listTrash.style.minHeight = '12rem';
    
    // Flexbox aktivieren für vertikale Verteilung
    listArchived.classList.add('flex', 'flex-col');
    listTrash.classList.add('flex', 'flex-col');

    listArchived.innerHTML = '';
    listTrash.innerHTML = '';

    // Wir suchen in allPayments
    const archivedItems = allPayments.filter(p => p.status === 'archived');
    const trashItems = allPayments.filter(p => p.status === 'trash');

    // A) RENDER ARCHIVIERT
    if (archivedItems.length === 0) {
        // Text perfekt zentriert in der Box
        listArchived.innerHTML = '<div class="flex-grow flex items-center justify-center text-gray-400 italic text-xs h-full">Keine archivierten Einträge.</div>';
    } else {
        const itemsContainer = document.createElement('div');
        itemsContainer.className = "flex-grow space-y-2";
        
        archivedItems.sort((a, b) => b.createdAt - a.createdAt).forEach(p => {
            const div = document.createElement('div');
            div.className = "w-full bg-white border border-gray-200 rounded p-2 text-sm flex justify-between items-center";
            div.innerHTML = `
                <div class="overflow-hidden">
                    <p class="font-bold text-gray-700 truncate">${p.title}</p>
                    <p class="text-[10px] text-gray-500">ID: #${p.id.slice(-4).toUpperCase()} • ${parseFloat(p.amount).toFixed(2)}€</p>
                </div>
                <div class="flex gap-1 flex-shrink-0">
                    <button class="btn-restore text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-100" title="Wiederherstellen">♻</button>
                    <button class="btn-trash text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded hover:bg-red-100" title="In Papierkorb verschieben">🗑</button>
                </div>
            `;

            div.querySelector('.btn-restore').onclick = () => restorePayment(p.id);
            div.querySelector('.btn-trash').onclick = () => moveToTrash(p.id);

            itemsContainer.appendChild(div);
        });
        listArchived.appendChild(itemsContainer);
    }

    // B) RENDER PAPIERKORB
    
    // Header für Papierkorb manipulieren (Button einfügen)
    const cardParent = listTrash.parentElement;
    const existingHeader = cardParent.querySelector('h3');
    
    if (existingHeader && !existingHeader.querySelector('#btn-toggle-trash-advanced')) {
        existingHeader.className = "text-lg font-bold text-gray-800 mb-2 flex items-center justify-between";
        
        const btn = document.createElement('button');
        btn.id = 'btn-toggle-trash-advanced';
        btn.className = "text-[10px] font-bold px-2 py-1 rounded border bg-white text-gray-500 border-gray-300 hover:bg-gray-50 transition ml-2";
        btn.textContent = "Erweitert";
        btn.onclick = (e) => {
            e.stopPropagation(); 
            isTrashAdvancedMode = !isTrashAdvancedMode;
            btn.className = isTrashAdvancedMode 
                ? "text-[10px] font-bold px-2 py-1 rounded border bg-indigo-600 text-white border-indigo-600 transition ml-2"
                : "text-[10px] font-bold px-2 py-1 rounded border bg-white text-gray-500 border-gray-300 hover:bg-gray-50 transition ml-2";
            btn.textContent = isTrashAdvancedMode ? "Normal" : "Erweitert";
            
            selectedTrashIds.clear();
            renderArchiveOverview();
        };
        existingHeader.appendChild(btn);
    } 
    else if (existingHeader) {
        const btn = existingHeader.querySelector('#btn-toggle-trash-advanced');
        if(btn) {
             btn.className = isTrashAdvancedMode 
                ? "text-[10px] font-bold px-2 py-1 rounded border bg-indigo-600 text-white border-indigo-600 transition ml-2"
                : "text-[10px] font-bold px-2 py-1 rounded border bg-white text-gray-500 border-gray-300 hover:bg-gray-50 transition ml-2";
             btn.textContent = isTrashAdvancedMode ? "Normal" : "Erweitert";
        }
    }

    // Info-Box (Erweitert)
    let infoBoxHtml = '';
    let actionFooterHtml = '';

    if (isTrashAdvancedMode) {
        infoBoxHtml = `
            <div class="bg-blue-50 border border-blue-200 rounded p-2 mb-2 text-xs text-blue-800">
                <p class="font-bold mb-1">Erweiterte Verwaltung:</p>
                <ul class="list-disc list-inside space-y-0.5">
                    <li>Markiere Einträge, um sie zur Prüfung an einen Admin zu senden.</li>
                    <li>Der Admin sieht nur ID und Titel.</li>
                    <li>Er kann wiederherstellen oder endgültig löschen.</li>
                    <li><span class="font-bold">Achtung:</span> Sobald gesendet, kannst du die Markierung nicht mehr entfernen.</li>
                </ul>
                <div class="mt-2 flex justify-between items-center border-t border-blue-200 pt-1">
                    <label class="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" id="cb-trash-select-all" class="h-4 w-4 rounded text-indigo-600">
                        <span class="font-bold">Alle wählen</span>
                    </label>
                </div>
            </div>
        `;

        actionFooterHtml = `
            <div class="mt-2 pt-2 border-t border-gray-200 flex justify-end flex-shrink-0">
                <button id="btn-send-trash-admin" class="bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded hover:bg-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                    Markierung senden
                </button>
            </div>
        `;
    }

    // Content Bereich Papierkorb
    let listContentHtml = '';
    
    if (trashItems.length === 0) {
        // Text perfekt zentriert in der Box
        listContentHtml = '<div class="flex-grow flex items-center justify-center text-gray-400 italic text-xs h-full">Papierkorb leer.</div>';
    } else {
        let itemsHtml = '';
        trashItems.sort((a, b) => b.createdAt - a.createdAt).forEach(p => {
            const isMarked = p.adminReviewStatus === 'pending';
            const isSelected = selectedTrashIds.has(p.id);
            
            let checkboxHtml = '';
            let rowClass = "w-full bg-white border border-red-100 rounded p-2 text-sm opacity-75 hover:opacity-100 transition flex items-center gap-2 mb-2 last:mb-0";
            
            if (isTrashAdvancedMode) {
                if (isMarked) {
                    checkboxHtml = `<span class="text-lg" title="Bereits an Admin gesendet">🔒</span>`;
                    rowClass = "w-full bg-gray-100 border border-gray-300 rounded p-2 text-sm flex items-center gap-2 cursor-not-allowed mb-2 last:mb-0";
                } else {
                    checkboxHtml = `<input type="checkbox" class="trash-cb h-5 w-5 rounded text-indigo-600 flex-shrink-0" value="${p.id}" ${isSelected ? 'checked' : ''}>`;
                    rowClass = "w-full bg-white border border-red-100 rounded p-2 text-sm hover:bg-red-50 transition flex items-center gap-2 cursor-pointer mb-2 last:mb-0";
                }
            } else {
                if (isMarked) checkboxHtml = `<span class="text-xs" title="In Prüfung">🔒</span>`;
            }

            const contentHtml = `
                <div class="overflow-hidden flex-grow min-w-0">
                    <p class="font-bold text-gray-700 truncate ${isMarked ? 'text-gray-500' : 'decoration-red-400 line-through'}">${p.title}</p>
                    <p class="text-[10px] text-gray-500">ID: #${p.id.slice(-4).toUpperCase()} ${isMarked ? '• <span class="text-indigo-600 font-bold">Wartet</span>' : ''}</p>
                </div>
            `;

            itemsHtml += `<div class="${rowClass}" onclick="window.toggleTrashItem('${p.id}', ${isMarked})">${checkboxHtml}${contentHtml}</div>`;
        });
        
        // Wrapper, der wachsen kann, aber oben beginnt
        listContentHtml = `<div class="flex-grow overflow-y-auto space-y-0">${itemsHtml}</div>`;
    }

    // Zusammensetzen
    listTrash.innerHTML = infoBoxHtml + listContentHtml + actionFooterHtml;

    // Listeners (Advanced Mode)
    if (isTrashAdvancedMode) {
        const sendBtn = document.getElementById('btn-send-trash-admin');
        const updateSendButton = () => {
            if (sendBtn) {
                sendBtn.disabled = selectedTrashIds.size === 0;
                sendBtn.textContent = selectedTrashIds.size > 0 ? `Senden (${selectedTrashIds.size})` : "Markierung senden";
                if(selectedTrashIds.size > 0) sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                else sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        };

        const cbAll = document.getElementById('cb-trash-select-all');
        if (cbAll) {
            cbAll.addEventListener('change', (e) => {
                const checked = e.target.checked;
                document.querySelectorAll('.trash-cb').forEach(cb => {
                    cb.checked = checked;
                    if(checked) selectedTrashIds.add(cb.value);
                    else selectedTrashIds.clear();
                });
                updateSendButton();
            });
        }
        
        if (sendBtn) sendBtn.onclick = executeSendTrashToAdmin;
        updateSendButton();
    }
}




// Globaler Handler für Klick auf Zeile
window.toggleTrashItem = function(id, isLocked) {
    if (!isTrashAdvancedMode || isLocked) return;
    
    // Checkbox toggeln
    const cb = document.querySelector(`.trash-cb[value="${id}"]`);
    if (cb) {
        cb.checked = !cb.checked;
        if (cb.checked) selectedTrashIds.add(id);
        else selectedTrashIds.delete(id);
        
        // Button Update
        const sendBtn = document.getElementById('btn-send-trash-admin');
        if (sendBtn) {
            sendBtn.disabled = selectedTrashIds.size === 0;
            sendBtn.textContent = selectedTrashIds.size > 0 ? `Markierung senden (${selectedTrashIds.size})` : "Markierung an Admin senden";
             if(selectedTrashIds.size > 0) {
                sendBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                sendBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }
};

async function executeSendTrashToAdmin() {
    if (selectedTrashIds.size === 0) return;
    if (!confirm(`Möchtest du ${selectedTrashIds.size} Elemente zur Prüfung an den Admin senden?\nDu kannst diese Markierung nicht selbst entfernen.`)) return;

    const btn = document.getElementById('btn-send-trash-admin');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        selectedTrashIds.forEach(id => {
            const ref = doc(paymentsRef, id);
            batch.update(ref, {
                adminReviewStatus: 'pending',
                adminReviewRequestedAt: serverTimestamp(),
                adminReviewRequestedBy: currentUser.mode
            });
        });

        await batch.commit();
        alertUser("Erfolgreich an Admin gesendet.", "success");
        
        selectedTrashIds.clear();
        renderArchiveOverview();

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    } finally {
        if(btn) setButtonLoading(btn, false);
    }
}



window.restorePayment = async function (id) {
    if (!confirm("Eintrag wiederherstellen? Er erscheint wieder in der normalen Liste.")) return;
    try {
        const p = allPayments.find(x => x.id === id);
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', id);

        // Status zurücksetzen (Falls Restbetrag <= 0 war es wohl paid, sonst open)
        // Sicherheitshalber setzen wir es auf 'open', außer es ist offensichtlich 0
        let newStatus = 'open';
        if (p.remainingAmount <= 0.001 && !p.isTBD) newStatus = 'paid';

        await updateDoc(ref, {
            status: newStatus,
            history: [...(p.history || []), { date: new Date(), action: 'restored', user: currentUser.displayName, info: "Aus Archiv wiederhergestellt." }]
        });

        renderArchiveOverview();
    } catch (e) { console.error(e); alertUser("Fehler.", "error"); }
};

window.moveToTrash = async function (id) {
    if (!confirm("In den Papierkorb verschieben? Dies dient nur der Nachvollziehbarkeit.")) return;
    try {
        const p = allPayments.find(x => x.id === id);
        const ref = doc(db, 'artifacts', appId, 'public', 'data', 'payments', id);

        await updateDoc(ref, {
            status: 'trash',
            archivedBy: currentUser.displayName, // Wer hat es endgültig gelöscht?
            history: [...(p.history || []), { date: new Date(), action: 'trashed', user: currentUser.displayName, info: "In den Papierkorb verschoben." }]
        });

        renderArchiveOverview();
    } catch (e) { console.error(e); alertUser("Fehler.", "error"); }
};

// --- NEU: Design für Listen-Ansicht (Excel-Style) ---
// --- NEU: Optimierte Listen-Ansicht (5 Spalten Handy, 7 Spalten PC) ---
// --- NEU: Optimierte Listen-Ansicht (Fix: Doppelte Checkbox) ---
function createSingleListRowHtml(p, today, isGroupItem = false) {
    const iAmDebtor = p.debtorId === currentUser.mode;
    const partnerName = iAmDebtor ? p.creditorName : p.debtorName;
    
    const colorClass = iAmDebtor ? "text-red-600" : "text-emerald-600";
    const rowBgClass = iAmDebtor ? "bg-red-50 border-red-100 hover:bg-red-100" : "bg-emerald-50 border-emerald-100 hover:bg-emerald-100";
    
    const startDateObj = p.startDate ? new Date(p.startDate) : (p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt));
    const startDateStr = startDateObj.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });

    let catName = "Diverse";
    const sysCat = SYSTEM_CATEGORIES.find(c => c.id === p.categoryId);
    if (sysCat) catName = sysCat.name;
    else {
        const customCat = allCategories.find(c => c.id === p.categoryId);
        if (customCat) catName = customCat.name;
    }

    // Betrag auf 0 setzen bei Fusiert/Verrechnet
    let displayAmount = parseFloat(p.remainingAmount);
    if (p.status === 'closed' || p.status === 'settled' || p.status === 'paid') {
        displayAmount = 0;
    }

    const amountDisplay = p.isTBD 
        ? '<span class="inline-block px-1 py-0.5 bg-orange-100 text-orange-700 border border-orange-300 rounded font-bold text-[10px] whitespace-nowrap">Unbekannt</span>' 
        : `<span class="font-mono font-bold ${colorClass}">${displayAmount.toFixed(2)} €</span>`;

    let deadlineHtml = '<span class="text-gray-300 text-[10px]">-</span>';
    
    const blinkStyle = `
    <style>
        @keyframes urgent-flash-box {
            0%, 100% { background-color: #fee2e2; border-color: #ef4444; color: #b91c1c; }
            50% { background-color: #fef2f2; border-color: #fca5a5; color: #ef4444; }
        }
        .urgent-blink-box {
            animation: urgent-flash-box 1s infinite; 
            border: 1px solid #ef4444 !important;
            font-weight: bold;
        }
    </style>`;

    if (p.deadline && p.status === 'open') {
        const deadlineDate = new Date(p.deadline);
        deadlineDate.setHours(23, 59, 59, 999);
        const now = new Date();
        const diffMs = deadlineDate - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        const dateStr = deadlineDate.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
        let timeText = "";
        let boxClass = "bg-white border border-gray-200 text-gray-500"; 

        if (diffMs < 0) {
            timeText = "!";
            boxClass = "bg-red-600 text-white border border-red-700 font-bold";
        } else {
            timeText = `${diffDays}T`;
            if (diffDays < 3) boxClass = "urgent-blink-box bg-red-50";
            else if (diffDays < 7) boxClass = "bg-yellow-100 text-yellow-800 border border-yellow-300 font-bold";
            else boxClass = "bg-white/80 text-green-700 border border-green-200";
        }

        deadlineHtml = `
            <div class="flex flex-col items-center justify-center px-1 py-0.5 rounded ${boxClass} min-w-[45px] sm:min-w-[50px]">
                <span class="text-[9px] leading-none mb-0.5">${dateStr}</span>
                <span class="text-[9px] leading-none font-bold">${timeText}</span>
            </div>
        `;
    } else if (p.status === 'pending_approval') {
        deadlineHtml = `<span class="text-[9px] bg-orange-100 text-orange-700 px-1 rounded border border-orange-200">Wartet</span>`;
    } else if (p.status === 'paid' || p.status === 'closed' || p.status === 'settled') {
        deadlineHtml = `<span class="text-[9px] bg-green-100 text-green-700 px-1 rounded border border-green-200">✔</span>`;
    }

    const checkboxHtml = isSelectionMode ?
        `<div class="mr-1 flex-shrink-0 flex items-center"><input type="checkbox" class="payment-select-cb h-4 w-4 text-indigo-600 accent-indigo-600" value="${p.id}" ${selectedPaymentIds.has(p.id) ? 'checked' : ''}></div>` : '';

    const paddingLeft = isGroupItem ? "pl-4 sm:pl-6 border-l-4 border-indigo-300" : "pl-2";

    return `
    ${blinkStyle}
    <div class="payment-card-item grid grid-cols-[1.5fr_40px_55px_70px_45px] sm:grid-cols-[70px_2fr_1fr_1fr_1fr_85px_110px] gap-1 items-center border-b border-gray-200 py-1.5 ${paddingLeft} ${rowBgClass} cursor-pointer transition text-xs hover:brightness-95" data-id="${p.id}">
        
        <div class="hidden sm:flex items-center overflow-hidden">
            ${checkboxHtml}
            <span class="text-gray-600 font-mono text-[10px] opacity-80">${startDateStr}</span>
        </div>

        <div class="font-bold text-gray-800 leading-tight whitespace-normal line-clamp-2 pr-1 flex items-center" title="${p.title}">
            ${isSelectionMode ? `<span class="sm:hidden flex items-center shrink-0">${checkboxHtml}</span>` : ''}
            ${p.title}
        </div>

        <div class="text-[10px] text-gray-600 leading-tight whitespace-normal line-clamp-2 pr-1">
            <span class="bg-white/50 px-1 rounded border border-gray-200/50 break-words">${catName}</span>
        </div>

        <div class="text-gray-700 leading-tight whitespace-normal line-clamp-2 pr-1 text-[10px]" title="${p.debtorName}">${p.debtorName}</div>

        <div class="hidden sm:block text-gray-700 leading-tight whitespace-normal line-clamp-2 pr-1 text-[10px]" title="${p.creditorName}">${p.creditorName}</div>

        <div class="text-right font-mono pr-1">${amountDisplay}</div>

        <div class="text-right flex justify-end pl-1">${deadlineHtml}</div>
    </div>`;
}






