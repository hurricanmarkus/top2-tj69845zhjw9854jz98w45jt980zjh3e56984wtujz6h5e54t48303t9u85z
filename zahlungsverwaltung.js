// zahlungsverwaltung.js

import { alertUser, db, currentUser, USERS, setButtonLoading, GUEST_MODE, navigate, appId } from './haupteingang.js';
import {
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBALE VARIABLEN ---
let unsubscribePayments = null;
let unsubscribeTemplates = null;
let unsubscribeContacts = null;
let unsubscribeAccounts = null;
let unsubscribeCategories = null; // NEU

let allPayments = [];
let allTemplates = [];
let allContacts = [];
let allAccounts = [];
let allCategories = []; // NEU

let currentDetailPaymentId = null;
let activeSettlementPartnerId = null;
let isSelectionMode = false;
let selectedPaymentIds = new Set();
let pendingOverpaymentData = null;

// --- INITIALISIERUNG HAUPTANSICHT ---
export function initializeZahlungsverwaltungView() {
    const view = document.getElementById('zahlungsverwaltungView');
    if (view && !view.dataset.listenerAttached) {
        setupEventListeners();
        view.dataset.listenerAttached = 'true';
    }

    if (currentUser.mode !== GUEST_MODE) {
        listenForPayments();
        listenForTemplates();
        listenForContacts();
        listenForAccounts();
        listenForCategories(); // NEU: Kategorien laden
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
    renderCategoryList(); // NEU: Liste laden
    renderCreditOverview();
}


// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {

    // Szenario Umschalter (Create Modal)
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
    
    // Toggle Logic im Create Modal
    document.getElementById('btn-toggle-debtor-manual')?.addEventListener('click', () => toggleInputMode('debtor'));
    document.getElementById('btn-toggle-creditor-manual')?.addEventListener('click', () => toggleInputMode('creditor'));
    document.getElementById('toggle-split-mode')?.addEventListener('change', (e) => toggleSplitMode(e.target.checked));
    document.getElementById('payment-creditor-select')?.addEventListener('change', updateCreditorHint);

    // Split Logik
    document.getElementById('btn-add-split-manual')?.addEventListener('click', addSplitManualPartner);
    document.getElementById('split-manual-name-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSplitManualPartner(); } });
    document.getElementById('payment-amount')?.addEventListener('input', updateSplitPreview);

    // Erweiterte Optionen
    document.getElementById('btn-toggle-advanced-payment')?.addEventListener('click', () => document.getElementById('payment-advanced-options').classList.toggle('hidden'));
    document.getElementById('payment-is-installment')?.addEventListener('change', (e) => document.getElementById('installment-options').classList.toggle('hidden', !e.target.checked));
    
    // Filter & Listen (NEU: Category Listener)
    document.getElementById('payment-search-input')?.addEventListener('input', applyFilters);
    document.getElementById('payment-filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('payment-filter-category')?.addEventListener('change', applyFilters); // NEU
    document.getElementById('payment-filter-direction')?.addEventListener('change', applyFilters);
    
    document.getElementById('btn-close-detail-modal')?.addEventListener('click', closeDetailModal);
    document.getElementById('btn-print-payment')?.addEventListener('click', () => window.print());
    
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
    
    document.getElementById('btn-op-credit')?.addEventListener('click', () => resolveOverpayment('credit'));
    document.getElementById('btn-op-tip')?.addEventListener('click', () => resolveOverpayment('tip'));
    document.getElementById('btn-op-cancel')?.addEventListener('click', () => { document.getElementById('overpaymentModal').style.display = 'none'; pendingOverpaymentData = null; });

    document.getElementById('btn-zv-settings')?.addEventListener('click', () => navigate('zahlungsverwaltungSettings'));
    document.getElementById('payment-template-select')?.addEventListener('change', applySelectedTemplate);
    document.getElementById('btn-save-as-template')?.addEventListener('click', saveCurrentAsTemplate);

    document.getElementById('btn-dashboard-credits')?.addEventListener('click', () => {
        navigate('zahlungsverwaltungSettings');
        setTimeout(() => openSettingsTab('credits'), 50);
    });
    
    document.getElementById('close-credit-details-btn')?.addEventListener('click', () => document.getElementById('creditDetailsModal').style.display = 'none');
    document.getElementById('btn-close-credit-details')?.addEventListener('click', () => document.getElementById('creditDetailsModal').style.display = 'none');
}

function setupSettingsListeners() {
    document.getElementById('tab-zv-templates')?.addEventListener('click', () => openSettingsTab('templates'));
    document.getElementById('tab-zv-contacts')?.addEventListener('click', () => openSettingsTab('contacts'));
    document.getElementById('tab-zv-credits')?.addEventListener('click', () => openSettingsTab('credits'));
    document.getElementById('tab-zv-accounts')?.addEventListener('click', () => openSettingsTab('accounts'));
    document.getElementById('tab-zv-categories')?.addEventListener('click', () => openSettingsTab('categories')); // NEU

    document.getElementById('zv-templates-list')?.addEventListener('click', (e) => {
        if (e.target.closest('.delete-tpl-btn')) deleteTemplate(e.target.closest('.delete-tpl-btn').dataset.id);
    });

    document.getElementById('btn-add-contact-setting')?.addEventListener('click', addContactFromSettings);
    document.getElementById('btn-add-account-setting')?.addEventListener('click', addAccountFromSettings);
    document.getElementById('btn-add-category')?.addEventListener('click', addCategory); // NEU

    // Listen Aktionen
    const contactList = document.getElementById('zv-contacts-list');
    if(contactList) {
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

    const categoryList = document.getElementById('zv-categories-list'); // NEU
    if (categoryList) {
        categoryList.onclick = (e) => {
             if (e.target.closest('.delete-cat-btn')) deleteCategory(e.target.closest('.delete-cat-btn').dataset.id);
             if (e.target.closest('.edit-cat-btn')) renameCategory(e.target.closest('.edit-cat-btn').dataset.id);
        }
    }

    document.getElementById('btn-execute-migration')?.addEventListener('click', executeMigration);
    document.getElementById('btn-add-my-credit')?.addEventListener('click', () => openCreditModal('add', 'my'));
    document.getElementById('btn-add-other-credit')?.addEventListener('click', () => openCreditModal('add', 'other'));

    document.getElementById('btn-cancel-credit')?.addEventListener('click', () => {
        const modal = document.getElementById('creditManageModal');
        modal.classList.add('hidden'); modal.style.display = 'none'; 
    });
    document.getElementById('btn-save-credit')?.addEventListener('click', executeCreditAction);
}



// --- DATENBANK LISTENER ---

function listenForPayments() {
    if (unsubscribePayments) unsubscribePayments();
    const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
    const q = query(paymentsRef, where('involvedUserIds', 'array-contains', currentUser.mode));

    unsubscribePayments = onSnapshot(q, (snapshot) => {
        allPayments = [];
        snapshot.forEach(doc => allPayments.push({ id: doc.id, ...doc.data() }));
        
        applyFilters();
        if (currentDetailPaymentId) {
            const updatedP = allPayments.find(x => x.id === currentDetailPaymentId);
            if (updatedP) openPaymentDetail(currentDetailPaymentId, true); else closeDetailModal();
        }
        if (document.getElementById('zahlungsverwaltungSettingsView').classList.contains('active')) {
            renderCreditOverview();
        }
    }, error => console.error("Fehler Payments:", error));
}

function listenForTemplates() {
    if (unsubscribeTemplates) unsubscribeTemplates();
    const tplRef = collection(db, 'artifacts', appId, 'public', 'data', 'payment-templates');
    unsubscribeTemplates = onSnapshot(tplRef, (snapshot) => {
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


// NEU: Konten Listener
function listenForAccounts() {
    if (unsubscribeAccounts) unsubscribeAccounts();
    const accRef = collection(db, 'artifacts', appId, 'public', 'data', 'private-accounts');
    const q = query(accRef, where('createdBy', '==', currentUser.mode));
    unsubscribeAccounts = onSnapshot(q, (snapshot) => {
        allAccounts = [];
        snapshot.forEach(doc => allAccounts.push({ id: doc.id, ...doc.data() }));
        if (document.getElementById('zahlungsverwaltungSettingsView').classList.contains('active')) renderAccountList();
    });
}



// NEU: Kategorien Listener + Seeding
function listenForCategories() {
    if (unsubscribeCategories) unsubscribeCategories();
    const catRef = collection(db, 'artifacts', appId, 'public', 'data', 'payment-categories');
    // Lade alle Kategorien
    unsubscribeCategories = onSnapshot(catRef, (snapshot) => {
        allCategories = [];
        snapshot.forEach(doc => allCategories.push({ id: doc.id, ...doc.data() }));
        
        // Wenn keine Kategorien existieren, erstelle die Standards
        if (allCategories.length === 0) {
             seedDefaultCategories();
        }
        
        updateCategoryFilterDropdown(); // Dropdown im Dashboard
        renderCategoryList(); // Liste in den Settings
        updateDashboard(allPayments); // Dashboard Zahlen aktualisieren
    });
}

async function seedDefaultCategories() {
    const catRef = collection(db, 'artifacts', appId, 'public', 'data', 'payment-categories');
    const defaults = ["Rückerstattung", "Diverse"];
    
    const batch = writeBatch(db);
    defaults.forEach(name => {
        const newRef = doc(catRef);
        batch.set(newRef, { name: name, isSystem: true, createdAt: serverTimestamp() });
    });
    try { await batch.commit(); } catch(e) { console.error("Seeding failed", e); }
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

    for (const id of ids) {
        const p = allPayments.find(item => item.id === id);
        if (!p) continue;

        // Validierung: Gleicher Partner, gleiche Richtung, Status Offen
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
    }

    if (!confirm(`Möchtest du diese ${ids.length} Einträge zu einem neuen Eintrag über ${totalAmount.toFixed(2)}€ zusammenfassen?`)) return;

    const btn = document.getElementById('btn-execute-merge');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        // 1. Alte Einträge schließen (Status: closed)
        ids.forEach(id => {
            const ref = doc(paymentsRef, id);
            const p = allPayments.find(item => item.id === id);
            const history = p.history || [];
            batch.update(ref, {
                status: 'closed',
                history: [...history, { date: new Date(), action: 'merged', user: currentUser.displayName, info: 'In Sammelrechnung zusammengefasst.' }]
            });
        });

        // 2. Neuen Sammel-Eintrag erstellen
        const newTitle = `Sammelrechnung (${ids.length} Posten)`;
        const newNotes = "Zusammenfassung von:\n- " + titleList.join("\n- ");

        const newData = {
            title: newTitle,
            amount: totalAmount,
            remainingAmount: totalAmount,
            isTBD: false,
            deadline: first.deadline, // Nimm Deadline vom ersten Eintrag
            invoiceNr: "",
            orderNr: "",
            notes: newNotes,
            type: 'debt',
            status: 'open',
            createdAt: serverTimestamp(),
            createdBy: currentUser.mode,
            debtorId: first.debtorId, debtorName: first.debtorName,
            creditorId: first.creditorId, creditorName: first.creditorName,
            involvedUserIds: first.involvedUserIds,
            history: [{ date: new Date(), action: 'created_merge', user: currentUser.displayName, info: `Zusammenfassung aus ${ids.length} Einträgen erstellt.` }]
        };

        const newDocRef = doc(paymentsRef);
        batch.set(newDocRef, newData);

        await batch.commit();
        alertUser("Einträge erfolgreich zusammengefasst!", "success");
        toggleSelectionMode(); // Auswahlmodus beenden

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    } finally {
        setButtonLoading(btn, false);
    }
}

// --- SPLIT EXISTING ENTRY LOGIK (Aufsplitten) ---

window.openSplitModal = function(id) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    if (p.isTBD) {
        alertUser("TBD-Einträge können nicht gesplittet werden.", "error");
        return;
    }

    const modal = document.getElementById('splitEntryModal');
    modal.dataset.originId = id;

    document.getElementById('split-original-amount-display').textContent = parseFloat(p.remainingAmount).toFixed(2) + " €";
    document.getElementById('split-amount-input').value = '';
    document.getElementById('split-title-input').value = p.title + " (Teil 2)";

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

async function executeSplitEntry() {
    const modal = document.getElementById('splitEntryModal');
    const originId = modal.dataset.originId;
    const p = allPayments.find(x => x.id === originId);
    if (!p) return;

    const splitAmount = parseFloat(document.getElementById('split-amount-input').value);
    const splitTitle = document.getElementById('split-title-input').value.trim();
    const currentRest = parseFloat(p.remainingAmount);

    // Validierung
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

        // 1. Ursprungseintrag aktualisieren (Restbetrag verringern)
        const originRef = doc(paymentsRef, originId);
        batch.update(originRef, {
            remainingAmount: newRest,
            history: [...(p.history || []), { date: new Date(), action: 'split_source', user: currentUser.displayName, info: `Betrag von ${splitAmount.toFixed(2)}€ abgespalten.` }]
        });

        // 2. Neuen Eintrag für den abgespaltenen Betrag erstellen
        const newData = {
            ...p, // Kopiere alle Felder vom Original
            id: undefined, // Wichtig: ID löschen, wird neu generiert
            title: splitTitle,
            amount: splitAmount, // Bei Split ist der neue Betrag = Splitbetrag
            remainingAmount: splitAmount,
            createdAt: serverTimestamp(),
            history: [{ date: new Date(), action: 'split_target', user: currentUser.displayName, info: `Abgespalten von "${p.title}".` }]
        };
        delete newData.id; // Sicherstellen, dass keine ID im Objekt ist

        const newDocRef = doc(paymentsRef);
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


// --- ADJUST AMOUNT LOGIK (Betrag anpassen) ---
// Globale Variable für aktuelle Bearbeitungs-ID
let currentAdjustId = null; 

window.openAdjustAmountModal = function(id) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    currentAdjustId = id;
    const modal = document.getElementById('adjustAmountModal');
    const inputField = document.getElementById('adjust-new-amount');
    
    // Aktuellen Wert setzen
    const currentAmount = parseFloat(p.remainingAmount);
    document.getElementById('adjust-current-amount-display').textContent = currentAmount.toFixed(2) + " €";
    inputField.value = currentAmount.toFixed(2); 
    
    document.getElementById('adjust-reason').value = 'correction';
    document.getElementById('adjust-note').value = '';

    // --- NEU: Differenz-Anzeige vorbereiten ---
    // Wir schauen, ob wir das Anzeige-Element schon haben, sonst bauen wir es ein
    let diffDisplay = document.getElementById('adjust-diff-display');
    if (!diffDisplay) {
        diffDisplay = document.createElement('div');
        diffDisplay.id = 'adjust-diff-display';
        diffDisplay.className = "text-right text-sm font-bold mt-1 h-5"; // Platzhalterhöhe
        // Wir fügen es direkt nach dem Eingabefeld ein
        inputField.parentNode.appendChild(diffDisplay);
    }
    diffDisplay.textContent = ""; // Reset beim Öffnen

    // Event Listener: Wenn man tippt, sofort rechnen
    inputField.oninput = function() {
        const newVal = parseFloat(inputField.value);
        if (isNaN(newVal)) {
            diffDisplay.textContent = "";
            return;
        }

        const diff = newVal - currentAmount;
        
        if (Math.abs(diff) < 0.01) {
            diffDisplay.textContent = "Keine Änderung";
            diffDisplay.className = "text-right text-sm font-bold mt-1 text-gray-400";
        } else if (diff > 0) {
            // Neuer Betrag ist höher -> Schlecht (mehr Schulden) oder Korrektur nach oben
            diffDisplay.textContent = `+ ${diff.toFixed(2)} €`;
            diffDisplay.className = "text-right text-sm font-bold mt-1 text-red-600";
        } else {
            // Neuer Betrag ist niedriger -> Gut (weniger Schulden)
            diffDisplay.textContent = `${diff.toFixed(2)} €`; // Minus ist schon im Wert
            diffDisplay.className = "text-right text-sm font-bold mt-1 text-emerald-600";
        }
    };

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function closeAdjustAmountModal() {
    document.getElementById('adjustAmountModal').classList.add('hidden');
    document.getElementById('adjustAmountModal').style.display = 'none';
    currentAdjustId = null;
}

async function executeAdjustAmount() {
    if (!currentAdjustId) return;
    const p = allPayments.find(x => x.id === currentAdjustId);
    if (!p) return;

    const newAmountVal = parseFloat(document.getElementById('adjust-new-amount').value);
    const reason = document.getElementById('adjust-reason').value;
    const note = document.getElementById('adjust-note').value.trim();

    if (isNaN(newAmountVal) || newAmountVal < 0) {
        alertUser("Bitte gültigen positiven Betrag eingeben.", "error");
        return;
    }

    const oldAmount = parseFloat(p.remainingAmount);
    const diff = newAmountVal - oldAmount;

    if (Math.abs(diff) < 0.01) {
        alertUser("Keine Änderung am Betrag festgestellt.", "info");
        return;
    }

    const btn = document.getElementById('btn-save-adjust');
    setButtonLoading(btn, true);

    try {
        const paymentRef = doc(db, 'artifacts', appId, 'public', 'data', 'payments', currentAdjustId);
        
        // Mapping für schöne Texte im Verlauf
        const reasonTexts = {
            'correction': 'Korrektur',
            'interest': 'Zinsen/Gebühr',
            'discount': 'Erlass/Rabatt',
            'other': 'Anpassung'
        };
        
        // NEU: Differenz berechnen für den Text
        let diffText = "";
        if (diff > 0) diffText = `(+${diff.toFixed(2)})`;
        else diffText = `(${diff.toFixed(2)})`; // Minus ist schon dabei

        const reasonText = reasonTexts[reason] || 'Anpassung';
        
        // NEU: Log Text enthält jetzt die Differenz
        const logInfo = `${reasonText}: ${diffText} | Neu: ${newAmountVal.toFixed(2)}€ ${note ? `(${note})` : ''}`;

        await updateDoc(paymentRef, {
            remainingAmount: newAmountVal,
            // Wir ändern hier nur remainingAmount, es sei denn, amount war kleiner als der neue Rest.
            amount: (newAmountVal > p.amount) ? newAmountVal : p.amount, 
            history: [...(p.history || []), { 
                date: new Date(), 
                action: 'adjusted', 
                user: currentUser.displayName, 
                info: logInfo 
            }]
        });

        alertUser("Betrag erfolgreich angepasst.", "success");
        closeAdjustAmountModal();

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
    updateCategorySelectInModal(); // NEU

    const tplSelect = document.getElementById('payment-template-select');
    if(tplSelect) tplSelect.value = "";

    document.getElementById('payment-start-date').value = new Date().toISOString().split('T')[0]; 
    document.getElementById('payment-deadline').value = '';
    document.getElementById('payment-title').value = '';
    document.getElementById('payment-invoice-nr').value = '';
    document.getElementById('payment-order-nr').value = '';
    document.getElementById('payment-notes').value = '';
    document.getElementById('payment-type').value = 'debt';
    document.getElementById('payment-advanced-options').classList.add('hidden');
    document.getElementById('payment-amount').value = '';
    document.getElementById('payment-amount-tbd').checked = false;
    document.getElementById('split-manual-name-input').value = '';
    document.getElementById('payment-is-installment').checked = false;
    document.getElementById('installment-options').classList.add('hidden');
    
    toggleInputMode('debtor', false);
    toggleInputMode('creditor', false);
    toggleSplitMode(false);
    document.getElementById('toggle-split-mode').checked = false;

    fillDropdown(document.getElementById('payment-debtor-select'), 'debtor');
    fillDropdown(document.getElementById('payment-creditor-select'), 'creditor');

    if (paymentToEdit) {
        document.getElementById('scenario-selector-container').classList.add('hidden');
        document.getElementById('transaction-details-container').classList.remove('hidden');
        document.getElementById('edit-payment-id').value = paymentToEdit.id;
        document.getElementById('payment-title').value = paymentToEdit.title;
        document.getElementById('payment-amount').value = paymentToEdit.amount;
        document.getElementById('payment-start-date').value = paymentToEdit.startDate || '';
        document.getElementById('payment-deadline').value = paymentToEdit.deadline || '';
        
        // Kategorie setzen
        if (paymentToEdit.categoryId) document.getElementById('payment-category-select').value = paymentToEdit.categoryId;

        const debSelect = document.getElementById('payment-debtor-select');
        let foundDeb = setSelectValueWithPrefix(debSelect, paymentToEdit.debtorId);
        if (!foundDeb && paymentToEdit.debtorId) { toggleInputMode('debtor', true); document.getElementById('payment-debtor-manual').value = paymentToEdit.debtorName; }

        const credSelect = document.getElementById('payment-creditor-select');
        let foundCred = setSelectValueWithPrefix(credSelect, paymentToEdit.creditorId);
        if (!foundCred) { toggleInputMode('creditor', true); document.getElementById('payment-creditor-manual').value = paymentToEdit.creditorName; }
        updateCreditorHint();
        
        if (paymentToEdit.invoiceNr || paymentToEdit.orderNr || paymentToEdit.notes || paymentToEdit.type === 'transfer') {
            document.getElementById('payment-advanced-options').classList.remove('hidden');
            document.getElementById('payment-invoice-nr').value = paymentToEdit.invoiceNr || '';
            document.getElementById('payment-order-nr').value = paymentToEdit.orderNr || '';
            document.getElementById('payment-notes').value = paymentToEdit.notes || '';
            document.getElementById('payment-type').value = paymentToEdit.type || 'debt';
        }
    } else {
        document.getElementById('edit-payment-id').value = "";
        document.getElementById('scenario-selector-container').classList.remove('hidden');
        document.getElementById('transaction-details-container').classList.add('hidden');
    }
    modal.classList.remove('hidden'); modal.style.display = 'flex';
}



function updateCategorySelectInModal() {
    const select = document.getElementById('payment-category-select');
    if (!select) return;
    select.innerHTML = '<option value="">- Keine Kategorie -</option>';
    
    allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });
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
    if (isActive) {
        singleWrap.classList.add('hidden');
        splitWrap.classList.remove('hidden');
        
        // Split Liste befüllen
        const splitList = document.getElementById('split-partner-list');
        splitList.innerHTML = '';
        let html = '';
        
        // User laden (ALLE AKTIVEN, auch ICH)
        Object.values(USERS).forEach(u => { 
            if(u.isActive) {
                let displayName = u.name;
                if (u.id === currentUser.mode) displayName += " (Ich)";
                
                html += `<label class="flex gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer border-b border-gray-100 last:border-0">
                            <input type="checkbox" class="split-cb h-4 w-4 text-indigo-600 rounded" value="${u.id}" data-name="${u.name}">
                            <span class="text-sm text-gray-700">${displayName}</span>
                         </label>`; 
            }
        });
        
        // Kontakte laden
        if (allContacts.length > 0) {
             html += `<div class="text-[10px] font-bold text-gray-400 mt-2 mb-1 uppercase">Eigene Kontakte</div>`;
             allContacts.forEach(c => { 
                html += `<label class="flex gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer border-b border-gray-100 last:border-0">
                            <input type="checkbox" class="split-cb h-4 w-4 text-indigo-600 rounded" value="${c.id}" data-name="${c.name}">
                            <span class="text-sm text-gray-700">${c.name}</span>
                         </label>`; 
            });
        }
        splitList.innerHTML = html;
    } else {
        singleWrap.classList.remove('hidden');
        splitWrap.classList.add('hidden');
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
    const total = parseFloat(document.getElementById('payment-amount').value) || 0;
    const checkboxes = document.querySelectorAll('.split-cb:checked');
    // "Mich einschließen" gibt es im neuen Design nicht mehr als Checkbox, 
    // da "Ich" einfach einer der Empfänger/Schuldner sein kann.
    // Wir teilen einfach durch die Anzahl der Haken.
    
    const count = checkboxes.length;
    const previewEl = document.getElementById('split-calculation-preview');
    
    if (count > 0 && total > 0) {
        previewEl.textContent = `Anteil pro Person: ${(total/count).toFixed(2)} €`;
    } else {
        previewEl.textContent = "";
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
    const id = 'MANUAL_' + Date.now();
    const div = document.createElement('div');
    div.innerHTML = `<label class="flex gap-2 p-1 bg-yellow-50 rounded"><input type="checkbox" class="split-cb" value="${id}" data-name="${name}" checked>${name} <span class="text-xs text-gray-500">(Gast)</span></label>`;
    list.insertBefore(div, list.firstChild);
    input.value = '';
}

async function savePayment() {
    const btn = document.getElementById('btn-save-payment'); setButtonLoading(btn, true);
    try {
        const editId = document.getElementById('edit-payment-id').value;
        const title = document.getElementById('payment-title').value.trim();
        const amount = parseFloat(document.getElementById('payment-amount').value);
        const startDate = document.getElementById('payment-start-date').value;
        const deadline = document.getElementById('payment-deadline').value;
        const categoryId = document.getElementById('payment-category-select').value; // NEU
        
        if (!title || isNaN(amount) || !startDate) throw new Error("Pflichtfelder fehlen.");

        // 1. GLÄUBIGER
        let creditorId = null, creditorName = "";
        const credManual = !document.getElementById('payment-creditor-manual').classList.contains('hidden');
        if (credManual) {
            creditorName = document.getElementById('payment-creditor-manual').value.trim();
            if(!creditorName) throw new Error("Gläubiger fehlt.");
        } else {
            const val = document.getElementById('payment-creditor-select').value;
            if (!val) throw new Error("Empfänger fehlt.");
            creditorId = val.split(':')[1]; 
            creditorName = document.getElementById('payment-creditor-select').options[document.getElementById('payment-creditor-select').selectedIndex].text.replace(" (Ich)", "");
        }

        // 2. SCHULDNER
        let debtorId = null, debtorName = "";
        const splitMode = document.getElementById('toggle-split-mode').checked;
        
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        const baseData = {
            title, amount, remainingAmount: amount, isTBD: false,
            startDate, deadline: deadline || null,
            status: 'open', type: document.getElementById('payment-type').value,
            creditorId, creditorName, categoryId, // NEU: Kategorie ID speichern
            invoiceNr: document.getElementById('payment-invoice-nr').value,
            orderNr: document.getElementById('payment-order-nr').value,
            notes: document.getElementById('payment-notes').value,
            createdAt: serverTimestamp(), createdBy: currentUser.mode
        };

        if (!splitMode) {
            const debManual = !document.getElementById('payment-debtor-manual').classList.contains('hidden');
            if (debManual) {
                debtorName = document.getElementById('payment-debtor-manual').value.trim();
                if(!debtorName) throw new Error("Schuldner fehlt.");
            } else {
                const val = document.getElementById('payment-debtor-select').value;
                if (!val) throw new Error("Schuldner fehlt.");
                debtorId = val.split(':')[1];
                debtorName = document.getElementById('payment-debtor-select').options[document.getElementById('payment-debtor-select').selectedIndex].text.replace(" (Ich)", "");
            }

            const involved = [currentUser.mode];
            if (creditorId && !involved.includes(creditorId)) involved.push(creditorId);
            if (debtorId && !involved.includes(debtorId)) involved.push(debtorId);
            
            const finalData = { ...baseData, debtorId, debtorName, involvedUserIds: involved, history: [{date: new Date(), action: 'created', user: currentUser.displayName, info: 'Erstellt'}] };
            
            if (editId) {
                delete finalData.createdAt;
                batch.update(doc(paymentsRef, editId), finalData);
            } else {
                batch.set(doc(paymentsRef), finalData);
            }
        } else {
             if (editId) throw new Error("Split-Einträge können nicht als Gruppe bearbeitet werden.");
             const checkboxes = document.querySelectorAll('.split-cb:checked');
             if (checkboxes.length === 0) throw new Error("Keine Personen für Split gewählt.");
             const share = amount / checkboxes.length;
             
             checkboxes.forEach(cb => {
                 const pId = cb.value; const pName = cb.dataset.name;
                 const involved = [currentUser.mode];
                 if (creditorId && !involved.includes(creditorId)) involved.push(creditorId);
                 if (!pId.startsWith('MANUAL_') && !involved.includes(pId)) involved.push(pId);

                 const entry = { 
                     ...baseData, amount: share, remainingAmount: share, 
                     debtorId: pId.startsWith('MANUAL_') ? null : pId, debtorName: pName, 
                     involvedUserIds: involved, title: `${title} (Split)`, 
                     history: [{date: new Date(), action: 'created_split', user: currentUser.displayName, info: `Split-Anteil von ${share.toFixed(2)}€`}] 
                 };
                 batch.set(doc(paymentsRef), entry); 
             });
        }

        await batch.commit();
        alertUser("Gespeichert!", "success");
        closeCreateModal();
    } catch(e) { console.error(e); alertUser(e.message, "error"); } finally { setButtonLoading(btn, false); }
}




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

    allPayments.forEach(p => {
        if (p.status !== 'open' && p.status !== 'pending_approval') return;

        const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);

        let partnerId, partnerName;
        let isMyDebt = false;

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

        if (isMyDebt) partners[partnerId].iOwe += amount;
        else partners[partnerId].owesMe += amount;
    });

    list.innerHTML = '';
    const partnerArray = Object.values(partners);

    if (partnerArray.length === 0) {
        list.innerHTML = '<p class="text-center text-gray-400 py-4">Keine offenen Posten zum Verrechnen.</p>';
        return;
    }

    partnerArray.forEach(p => {
        const net = p.owesMe - p.iOwe;
        let netText = '';
        let colorClass = '';
        if (net > 0) { netText = `+ ${net.toFixed(2)} €`; colorClass = 'text-emerald-600'; }
        else if (net < 0) { netText = `${net.toFixed(2)} €`; colorClass = 'text-red-600'; }
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

    allPayments.forEach(p => {
        if (p.status !== 'open' && p.status !== 'pending_approval') return;

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
    if (!confirm("Möchtest du wirklich alle offenen Posten verrechnen und glattstellen?")) return;

    const btn = document.getElementById('btn-execute-settlement');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        const involvedDocs = [];
        let partnerName = "";
        let net = 0;

        allPayments.forEach(p => {
            if (p.status !== 'open' && p.status !== 'pending_approval') return;

            let pIdCheck = (p.debtorId === currentUser.mode) ? p.creditorId : p.debtorId;
            let pNameCheck = (p.debtorId === currentUser.mode) ? p.creditorName : p.debtorName;
            if (!pIdCheck) pIdCheck = "MANUAL_" + pNameCheck;

            if (pIdCheck === activeSettlementPartnerId) {
                partnerName = pNameCheck;
                involvedDocs.push(p);
                const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);
                if (p.debtorId === currentUser.mode) net -= amount;
                else net += amount;
            }
        });

        involvedDocs.forEach(p => {
            const ref = doc(paymentsRef, p.id);
            batch.update(ref, {
                status: 'paid',
                remainingAmount: 0,
                history: [...(p.history || []), { date: new Date(), action: 'settled', user: currentUser.displayName, info: 'Durch Verrechnung ausgeglichen.' }]
            });
        });

        if (Math.abs(net) > 0.01) {
            const isCreditor = net > 0;
            const absAmount = Math.abs(net);

            const realPartnerId = activeSettlementPartnerId.startsWith("MANUAL_") ? null : activeSettlementPartnerId;

            const newData = {
                title: "Restbetrag nach Verrechnung",
                amount: absAmount,
                remainingAmount: absAmount,
                isTBD: false,
                deadline: null,
                invoiceNr: "", orderNr: "", notes: "Automatisch erstellt.", type: 'debt',
                status: 'open',
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode,
                debtorId: isCreditor ? realPartnerId : currentUser.mode,
                debtorName: isCreditor ? partnerName : currentUser.displayName,
                creditorId: isCreditor ? currentUser.mode : realPartnerId,
                creditorName: isCreditor ? currentUser.displayName : partnerName,
                involvedUserIds: [currentUser.mode],
                history: [{ date: new Date(), action: 'created_settlement', user: currentUser.displayName, info: `Restbetrag aus Verrechnung.` }]
            };
            if (realPartnerId) newData.involvedUserIds.push(realPartnerId);

            batch.set(doc(paymentsRef), newData);
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
window.editPayment = function(id) {
    const p = allPayments.find(x => x.id === id);
    if (p) {
        closeDetailModal();
        openCreateModal(p);
    }
};

window.deletePayment = async function(id) {
    if (!confirm("Diesen Eintrag wirklich unwiderruflich löschen?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', id));
        alertUser("Eintrag gelöscht.", "success");
        closeDetailModal();
    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Löschen.", "error");
    }
};

window.openPaymentDetail = function(id, isRefresh = false) {
    const p = allPayments.find(x => x.id === id); if (!p) return;
    currentDetailPaymentId = id;
    const modal = document.getElementById('paymentDetailModal');
    const content = document.getElementById('payment-detail-content');
    const actions = document.getElementById('payment-detail-actions');
    const iAmCreator = p.createdBy === currentUser.mode;
    const iAmDebtor = p.debtorId === currentUser.mode;
    const iAmCreditor = p.creditorId === currentUser.mode;

    // Kategorie Name holen
    const catName = allCategories.find(c => c.id === p.categoryId)?.name || "Keine Kategorie";

    let editControls = iAmCreator ? `<div class="flex justify-end gap-2 mb-4 no-print flex-wrap border-b pb-2"><button onclick="openAdjustAmountModal('${p.id}')" class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">€ Anpassen</button><button onclick="openSplitModal('${p.id}')" class="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">Split</button><button onclick="editPayment('${p.id}')" class="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">Bearbeiten</button><button onclick="deletePayment('${p.id}')" class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">Löschen</button></div>` : '';

    content.innerHTML = `
        ${editControls}
        <h2 class="text-2xl font-bold text-gray-800 leading-tight">${p.title}</h2>
        <div class="flex flex-wrap gap-2 mb-4 mt-2">
            <span class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs font-bold">${catName}</span>
            ${p.type === 'credit' ? '<span class="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-bold">Guthaben</span>' : ''}
            ${p.startDate ? `<span class="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">${new Date(p.startDate).toLocaleDateString()}</span>` : ''}
        </div>
        <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg border">
            <div><p class="text-xs font-bold text-gray-500 uppercase">Schuldner</p><p class="text-lg font-semibold text-gray-900">${p.debtorName}</p></div>
            <div class="text-right"><p class="text-xs font-bold text-gray-500 uppercase">Gläubiger</p><p class="text-lg font-semibold text-gray-900">${p.creditorName}</p></div>
        </div>
        <div class="mb-6 text-center p-4 border-2 border-dashed border-gray-200 rounded-xl ${p.remainingAmount <= 0.01 ? 'bg-green-50 border-green-300' : ''}">
            <p class="text-sm text-gray-500 uppercase font-bold tracking-wide">Offen</p>
            <p class="text-5xl font-extrabold text-gray-800 mt-1">${p.isTBD ? 'TBD' : parseFloat(p.remainingAmount).toFixed(2) + ' €'}</p>
        </div>
        ${p.notes ? `<div class="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700"><strong>Notiz:</strong><br>${p.notes}</div>` : ''}
    `;
    
    actions.innerHTML = '';
    if (p.status === 'open' || p.status === 'pending_approval') {
        if (iAmDebtor && p.status === 'open') {
            actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'mark_paid')" class="py-3 px-6 bg-blue-600 text-white font-bold rounded-lg shadow w-full sm:w-auto">✅ Alles bezahlt</button>`;
            actions.innerHTML += `<button onclick="showPartialForm()" class="py-3 px-6 bg-blue-100 text-blue-800 font-bold rounded-lg w-full sm:w-auto">Teilzahlung</button>`;
        }
        if (iAmCreditor) {
            if (p.status === 'pending_approval') {
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'confirm_payment')" class="py-3 px-6 bg-green-600 text-white font-bold rounded-lg shadow flex-grow">Bestätigen</button><button onclick="handlePaymentAction('${p.id}', 'reject_payment')" class="py-3 px-6 bg-red-100 text-red-600 font-bold rounded-lg flex-grow">Ablehnen</button>`;
            } else {
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'force_close')" class="py-3 px-6 bg-emerald-600 text-white font-bold rounded-lg shadow w-full sm:w-auto">Erledigt</button>`;
            }
        }
    }
    // Partial Form Handler Hook
    window.showPartialForm = function () { document.getElementById('partial-payment-form').classList.remove('hidden'); }
    const submitPartialBtn = document.getElementById('btn-submit-partial');
    if(submitPartialBtn) {
        const newBtn = submitPartialBtn.cloneNode(true); submitPartialBtn.parentNode.replaceChild(newBtn, submitPartialBtn);
        newBtn.onclick = () => { const amt = parseFloat(document.getElementById('partial-amount-input').value); if (amt > 0) handlePaymentAction(p.id, 'partial_pay', amt); };
    }

    if (!isRefresh) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
}

function renderDetailContent(p, isRefresh) {
    const modal = document.getElementById('paymentDetailModal');
    const content = document.getElementById('payment-detail-content');
    const actions = document.getElementById('payment-detail-actions');
    const partialForm = document.getElementById('partial-payment-form');
    const transactionSection = document.getElementById('transaction-history-section'); // NEU
    const transactionList = document.getElementById('transaction-list'); // NEU

    if (!modal || !content || !actions) return;

    const iAmDebtor = p.debtorId === currentUser.mode;
    const iAmCreditor = p.creditorId === currentUser.mode;
    const iAmCreator = p.createdBy === currentUser.mode;
    const shortId = p.id.slice(-4).toUpperCase();

    let editControls = '';
    if (iAmCreator) {
        editControls = `
        <div class="flex justify-end gap-2 mb-4 no-print border-b pb-2 flex-wrap">
            <button onclick="openAdjustAmountModal('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm font-bold">€ Anpassen</button>
            <button onclick="openSplitModal('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm font-bold">Aufteilen</button>
            <button onclick="editPayment('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-sm font-bold">Bearbeiten</button>
            <button onclick="deletePayment('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-bold">Löschen</button>
        </div>`;
    }

    let installmentInfo = '';
    if (p.installment && p.installment.total > 0) {
        const paidAmount = p.amount - p.remainingAmount;
        const rateApprox = p.amount / p.installment.total;
        const ratesPaid = Math.floor(paidAmount / rateApprox);
        installmentInfo = `
            <div class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p class="text-xs font-bold text-indigo-600 uppercase mb-1">Ratenplan (${p.installment.interval === 'monthly' ? 'Monatlich' : 'Wöchentlich'})</p>
                <div class="flex justify-between items-end">
                    <div><span class="text-xl font-bold text-gray-800">${ratesPaid} / ${p.installment.total}</span> <span class="text-xs text-gray-500">Raten</span></div>
                    <div class="text-right"><span class="text-sm font-semibold text-gray-700">~${rateApprox.toFixed(2)} €</span> <span class="text-xs text-gray-500 block">pro Rate</span></div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2.5 mt-2"><div class="bg-indigo-600 h-2.5 rounded-full" style="width: ${(ratesPaid / p.installment.total) * 100}%"></div></div>
            </div>`;
    }

    // NEU: Transaktions-Liste anzeigen
    if (p.transactions && p.transactions.length > 0) {
        transactionSection.classList.remove('hidden');
        transactionList.innerHTML = '';
        p.transactions.forEach((tx, index) => {
            const canDelete = (iAmCreator || iAmCreditor);
            const row = document.createElement('div');
            row.className = "flex justify-between items-center p-2 bg-white rounded border shadow-sm";
            const dateStr = tx.date?.toDate ? tx.date.toDate().toLocaleDateString() : new Date(tx.date).toLocaleDateString();
            row.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="font-bold text-green-700">+ ${parseFloat(tx.amount).toFixed(2)} €</span>
                    <span class="text-xs text-gray-400">| ${dateStr}</span>
                    <span class="text-xs text-gray-500 italic">(${tx.type === 'credit_usage' ? 'Guthaben' : 'Zahlung'})</span>
                </div>
                ${canDelete ? `<button class="text-red-400 hover:text-red-600 text-xs font-bold delete-tx-btn px-2 py-1 bg-red-50 rounded border border-red-100">Löschen</button>` : ''}
            `;
            // Event Listener für Löschen
            if (canDelete) row.querySelector('.delete-tx-btn').addEventListener('click', () => deleteTransaction(p.id, index));
            transactionList.appendChild(row);
        });
    } else {
        transactionSection.classList.add('hidden');
    }

    content.innerHTML = `
        ${editControls}
        <h2 class="text-2xl font-bold text-gray-800 mb-1 leading-tight">${p.title}</h2>
        <div class="flex flex-wrap gap-2 mb-4 mt-2">
            <span class="px-2 py-1 bg-gray-800 text-white rounded text-xs font-mono tracking-wider">#${shortId}</span>
            ${p.type === 'credit' ? '<span class="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-bold">Guthaben</span>' : ''}
            ${p.startDate ? `<span class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">Start: ${new Date(p.startDate).toLocaleDateString()}</span>` : ''}
        </div>
        
        <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg border">
            <div><p class="text-xs font-bold text-gray-500 uppercase">Schuldner</p><p class="text-lg font-semibold text-gray-900 break-words">${p.debtorName}</p></div>
            <div class="text-right"><p class="text-xs font-bold text-gray-500 uppercase">Gläubiger</p><p class="text-lg font-semibold text-gray-900 break-words">${p.creditorName}</p></div>
        </div>

        ${installmentInfo}

        <div class="mb-6 text-center p-4 border-2 border-dashed border-gray-200 rounded-xl ${p.remainingAmount <= 0.01 ? 'bg-green-50 border-green-300' : ''}">
            <p class="text-sm text-gray-500 uppercase font-bold tracking-wide">Offener Betrag</p>
            <p class="text-5xl font-extrabold text-gray-800 mt-1">${p.isTBD ? 'TBD' : parseFloat(p.remainingAmount).toFixed(2) + ' €'}</p>
            ${!p.isTBD && p.amount > p.remainingAmount ? `<p class="text-xs text-green-600 font-semibold mt-1">Bezahlt: ${(p.amount - p.remainingAmount).toFixed(2)} €</p>` : ''}
        </div>
        
        ${p.notes ? `<div class="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700"><strong>Notiz:</strong><br>${p.notes}</div>` : ''}
        
        <h4 class="font-bold text-gray-700 mb-2 border-b pb-1 mt-8">System-Log</h4>
        <div class="mb-4 max-h-40 overflow-y-auto text-xs text-gray-400">
            ${(p.history || []).map(h => {
                const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
                return `<div class="mb-1">${d.toLocaleDateString()} - ${h.info}</div>`;
            }).join('')}
        </div>
    `;

    actions.innerHTML = '';
    if (partialForm) partialForm.classList.add('hidden');

    if (p.status === 'open' || p.status === 'pending_approval') {
        if (iAmDebtor && p.status === 'open') {
            actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'mark_paid')" class="py-3 px-6 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 w-full sm:w-auto">✅ Alles bezahlt</button>`;
            actions.innerHTML += `<button onclick="showPartialForm()" class="py-3 px-6 bg-blue-100 text-blue-800 font-bold rounded-lg hover:bg-blue-200 w-full sm:w-auto">Teilzahlung</button>`;
        }
        if (iAmCreditor) {
            if (p.status === 'pending_approval') {
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'confirm_payment')" class="py-3 px-6 bg-green-600 text-white font-bold rounded-lg shadow hover:bg-green-700 flex-grow">Bestätigen</button>`;
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'reject_payment')" class="py-3 px-6 bg-red-100 text-red-600 font-bold rounded-lg hover:bg-red-200 flex-grow">Ablehnen</button>`;
            } else {
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'force_close')" class="py-3 px-6 bg-emerald-600 text-white font-bold rounded-lg shadow hover:bg-emerald-700 w-full sm:w-auto">Als erledigt markieren</button>`;
                actions.innerHTML += `<button onclick="showPartialForm()" class="py-3 px-6 bg-blue-100 text-blue-800 font-bold rounded-lg hover:bg-blue-200 w-full sm:w-auto">Teilzahlung empfangen</button>`;
            }
        }
    }
    window.showPartialForm = function () { if (partialForm) partialForm.classList.remove('hidden'); }
    const submitPartialBtn = document.getElementById('btn-submit-partial');
    if (submitPartialBtn) {
        const newBtn = submitPartialBtn.cloneNode(true);
        submitPartialBtn.parentNode.replaceChild(newBtn, submitPartialBtn);
        newBtn.onclick = () => {
            const amt = parseFloat(document.getElementById('partial-amount-input').value);
            if (amt > 0) handlePaymentAction(p.id, 'partial_pay', amt);
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

// --- LIST RENDER & FILTER ---
function applyFilters() {
    const searchTerm = document.getElementById('payment-search-input')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('payment-filter-status')?.value || 'all';
    const categoryFilter = document.getElementById('payment-filter-category')?.value || 'all'; // NEU
    const dirFilter = document.getElementById('payment-filter-direction')?.value || 'all';

    let filtered = allPayments.filter(p => {
        // Grundfilter
        if (p.type === 'credit') return false; // Credits raus
        
        // Text Suche
        const textMatch = (p.title && p.title.toLowerCase().includes(searchTerm)) || (p.debtorName && p.debtorName.toLowerCase().includes(searchTerm)) || (p.creditorName && p.creditorName.toLowerCase().includes(searchTerm));
        if (!textMatch) return false;

        // Status Filter
        if (statusFilter !== 'all') {
            if (statusFilter === 'open' && p.status !== 'open') return false;
            if (statusFilter === 'pending' && p.status !== 'pending_approval') return false;
            if (statusFilter === 'closed' && (p.status !== 'paid' && p.status !== 'cancelled')) return false;
        }

        // NEU: Kategorie Filter
        if (categoryFilter !== 'all') {
            if (p.categoryId !== categoryFilter) return false;
        }

        // Richtung Filter
        if (dirFilter !== 'all') {
            const iAmDebtor = p.debtorId === currentUser.mode;
            if (dirFilter === 'i_owe' && !iAmDebtor) return false;
            if (dirFilter === 'owes_me' && iAmDebtor) return false;
        }
        return true;
    });

    filtered.sort((a, b) => (b.createdAt?.toDate ? b.createdAt.toDate() : new Date()) - (a.createdAt?.toDate ? a.createdAt.toDate() : new Date()));
    renderPaymentList(filtered);
    updateDashboard(allPayments);
}


function renderPaymentList(payments) {
    const container = document.getElementById('payments-list-container');
    if (!container) return;
    container.innerHTML = '';
    if (payments.length === 0) { container.innerHTML = `<div class="text-center p-8 bg-gray-50 rounded-xl text-gray-500">Keine Einträge.</div>`; return; }

    payments.forEach(p => {
        const iAmDebtor = p.debtorId === currentUser.mode;
        const partnerName = iAmDebtor ? p.creditorName : p.debtorName;
        const prefix = iAmDebtor ? "Ich schulde an" : "Schuldet mir";
        const colorClass = iAmDebtor ? "text-red-600" : "text-emerald-600";
        const bgClass = iAmDebtor ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200";
        
        // Kategorie Name finden und Badge erstellen
        const catName = allCategories.find(c => c.id === p.categoryId)?.name || "";
        const catBadge = catName ? `<span class="text-[10px] bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 mr-2 font-semibold">${catName}</span>` : '';

        let statusBadge = '';
        if (p.status === 'open') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-800">Offen</span>`;
        else if (p.status === 'pending_approval') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800">Wartet</span>`;
        else if (p.status === 'paid') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-800">Bezahlt</span>`;
        
        const checkboxHtml = isSelectionMode ? `<div class="mr-3 flex items-center"><input type="checkbox" class="payment-select-cb h-5 w-5 text-indigo-600" value="${p.id}" ${selectedPaymentIds.has(p.id) ? 'checked' : ''}></div>` : '';

        const html = `
        <div class="payment-card-item card p-4 rounded-xl border ${bgClass} shadow-sm hover:shadow-md transition cursor-pointer flex items-center" data-id="${p.id}">
            ${checkboxHtml}
            <div class="flex-grow">
                <div class="flex justify-between items-start">
                    <div class="flex flex-col">
                        <div class="flex items-center mb-1">
                            ${catBadge}
                            <h4 class="font-bold text-gray-800 leading-tight text-sm sm:text-base">${p.title}</h4>
                        </div>
                        ${p.startDate ? `<span class="text-[10px] text-gray-400">Vom: ${new Date(p.startDate).toLocaleDateString()}</span>` : ''}
                    </div>
                    ${statusBadge}
                </div>
                <p class="text-xs text-gray-500 mt-2">${prefix} <strong>${partnerName}</strong></p>
                <div class="mt-1 flex items-center gap-2"><span class="text-xl font-extrabold ${colorClass}">${p.isTBD ? 'TBD' : parseFloat(p.remainingAmount).toFixed(2) + ' €'}</span></div>
            </div>
        </div>`;
        container.innerHTML += html;
    });
}



function updateDashboard(payments) {
    let myDebt = 0; let owedToMe = 0; let totalCredits = 0;
    let myDebtCount = 0; let owedToMeCount = 0;

    // NEU: Kategorien Summen
    const catSums = {}; // { catId: { name, count, amount } }

    payments.forEach(p => {
        if (p.status !== 'open' && p.status !== 'pending_approval') return;
        const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);

        if (p.type === 'credit') {
            if (p.creditorId === currentUser.mode) totalCredits += amount;
        } else {
            if (p.debtorId === currentUser.mode) { myDebt += amount; myDebtCount++; } 
            else if (p.creditorId === currentUser.mode) { owedToMe += amount; owedToMeCount++; }
            
            // Kategorie Logik (Summiert alle offenen Beträge dieser Kategorie)
            if (p.categoryId) {
                if (!catSums[p.categoryId]) {
                    const c = allCategories.find(x => x.id === p.categoryId);
                    catSums[p.categoryId] = { name: c ? c.name : 'Unbekannt', count: 0, amount: 0 };
                }
                catSums[p.categoryId].count++;
                catSums[p.categoryId].amount += amount;
            }
        }
    });

    // Dashboard Standard Zahlen
    document.getElementById('dashboard-my-debt-display').textContent = myDebt.toFixed(2) + " €";
    document.getElementById('dashboard-my-debt-detail').textContent = `in ${myDebtCount} offenen Posten`;
    document.getElementById('dashboard-owe-me-display').textContent = owedToMe.toFixed(2) + " €";
    document.getElementById('dashboard-owe-me-detail').textContent = `aus ${owedToMeCount} offenen Posten`;
    document.getElementById('dashboard-credit-display').textContent = totalCredits.toFixed(2) + " €";

    // Dashboard Kategorien Rendern (Horizontal Scroll)
    const catContainer = document.getElementById('dashboard-categories-container');
    if (catContainer) {
        catContainer.innerHTML = '';
        const sortedKeys = Object.keys(catSums).sort((a,b) => catSums[b].amount - catSums[a].amount);
        
        if (sortedKeys.length === 0) {
            catContainer.innerHTML = '<span class="text-xs text-gray-400 p-1">Keine offenen Kategorien.</span>';
        } else {
            sortedKeys.forEach(catId => {
                const data = catSums[catId];
                const box = document.createElement('div');
                box.className = "flex-shrink-0 bg-white border rounded-lg p-2 min-w-[100px] shadow-sm flex flex-col justify-center snap-start";
                box.innerHTML = `
                    <span class="text-[10px] text-gray-500 font-bold uppercase truncate">${data.name}</span>
                    <span class="text-sm font-extrabold text-gray-800">${data.amount.toFixed(2)} €</span>
                    <span class="text-[10px] text-gray-400">${data.count} offen</span>
                `;
                catContainer.appendChild(box);
            });
        }
    }
}



// --- LOGIK FÜR ZAHLUNGEN UND ÜBERZAHLUNG ---

window.handlePaymentAction = async function (id, action, amount = 0) {
    const p = allPayments.find(x => x.id === id); if (!p) return;
    
    if (action === 'partial_pay' || action === 'mark_paid') {
        const currentRest = parseFloat(p.remainingAmount);
        let payAmount = amount;
        
        if (action === 'mark_paid') payAmount = currentRest;
        
        // Toleranz für Rundungsfehler (0.01)
        if (payAmount > currentRest + 0.01) {
            const overpayment = payAmount - currentRest;
            pendingOverpaymentData = { paymentId: id, payAmount: payAmount, debtAmount: currentRest, excessAmount: overpayment };
            document.getElementById('overpayment-amount').textContent = overpayment.toFixed(2) + " €";
            document.getElementById('overpaymentModal').classList.remove('hidden');
            document.getElementById('overpaymentModal').style.display = 'flex';
            return; // STOPPT HIER, WARTET AUF MODAL
        }
    }
    await executePayment(id, action, amount);
};

async function executePayment(id, action, amount) {
    const p = allPayments.find(x => x.id === id);
    let updateData = {}; 
    let logEntry = ""; 
    let newStatus = p.status; 
    let transaction = null;

    if (action === 'mark_paid') { 
        // Logik: Wer muss das genehmigen?
        // Normalerweise derjenige, der das Geld bekommt (Creditor).
        // Ist der Creditor ein System-User?
        const creditorIsSystemUser = USERS[p.creditorId] && USERS[p.creditorId].isActive;
        const iAmCreditor = p.creditorId === currentUser.mode;

        // Wir genehmigen SOFORT, wenn:
        // 1. Der Gläubiger KEIN System-User ist (Gast kann nicht einloggen zum Genehmigen)
        // 2. ODER: Ich selbst der Gläubiger bin (ich bestätige ja gerade, dass ich Geld habe)
        // 3. (Hier könnte man später noch 'userSettings.autoApprove' einbauen)
        
        const autoApprove = !creditorIsSystemUser || iAmCreditor;

        if (autoApprove) {
            // SOFORT BEZAHLT
            amount = parseFloat(p.remainingAmount);
            newStatus = 'paid';
            updateData.remainingAmount = 0;
            logEntry = creditorIsSystemUser 
                ? "Als erledigt markiert." 
                : "Als bezahlt markiert (Auto-Genehmigt, da Gast).";
            
            // WICHTIG: Wenn wir auto-genehmigen, müssen wir auch die Transaktion schreiben!
            if (amount > 0) transaction = { date: new Date(), amount: amount, type: 'payment', user: currentUser.displayName };

        } else {
            // WARTEN AUF GENEHMIGUNG
            amount = parseFloat(p.remainingAmount); 
            newStatus = 'pending_approval'; 
            logEntry = "Als bezahlt markiert (Wartet auf Bestätigung)."; 
        }

    } else if (action === 'confirm_payment' || action === 'force_close') { 
        amount = parseFloat(p.remainingAmount); newStatus = 'paid'; updateData.remainingAmount = 0; logEntry = "Abgeschlossen.";
        if (amount > 0) transaction = { date: new Date(), amount: amount, type: 'payment', user: currentUser.displayName };
    
    } else if (action === 'reject_payment') { 
        newStatus = 'open'; logEntry = "Zahlung abgelehnt."; 
    
    } else if (action === 'partial_pay') {
        const newRemaining = parseFloat(p.remainingAmount) - amount; 
        updateData.remainingAmount = newRemaining < 0 ? 0 : newRemaining;
        if (newRemaining <= 0.001) newStatus = 'paid'; 
        logEntry = `Teilzahlung ${amount.toFixed(2)}€.`;
        transaction = { date: new Date(), amount: amount, type: 'payment', user: currentUser.displayName };
    }

    updateData.status = newStatus;
    updateData.history = [...(p.history || []), { date: new Date(), action, user: currentUser.displayName, info: logEntry }];
    
    // NEU: Transaktion speichern (falls vorhanden)
    if (transaction) {
        updateData.transactions = [...(p.transactions || []), transaction];
    }

    try { 
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', id), updateData); 
        alertUser("Gespeichert.", "success"); 
        if (action !== 'partial_pay' && action !== 'mark_paid') closeDetailModal(); 
        // Wenn es auto-approved wurde (mark_paid -> paid), schließen wir das Fenster auch besser
        if (action === 'mark_paid' && newStatus === 'paid') closeDetailModal();

    } catch (e) { console.error(e); alertUser("Fehler: " + e.message, "error"); }
}


async function resolveOverpayment(decision) {
    if (!pendingOverpaymentData) return;
    const { paymentId, payAmount, debtAmount, excessAmount } = pendingOverpaymentData;
    const p = allPayments.find(x => x.id === paymentId);

    // --- NEU: SICHERHEITSCHECK ---
    // Wir prüfen, ob der Partner (der das Guthaben bekommen soll) ein echter User oder Kontakt ist.
    // Bei Überzahlung ist der Partner immer der, der Geld GEGEBEN hat (also p.creditorId, wenn er bezahlt wurde).
    // Moment... wer hat bezahlt?
    // Szenario: Ich schulde Max 10€. Ich markiere "Max hat bezahlt" (bzw ich habe bezahlt).
    // Wenn ich auf "Alles bezahlt" klicke bei "Ich schulde", dann zahle ICH an MAX.
    // Wenn ich 15€ eingebe, hat MAX 5€ Guthaben bei mir.
    // Partner ID ist also der Gläubiger des ursprünglichen Eintrags.
    
    let targetPartnerId = (p.debtorId === currentUser.mode) ? p.creditorId : p.debtorId;
    
    // Wenn targetPartnerId null ist (manueller Gast) ODER die ID nicht in Users/Contacts gefunden wird:
    const isRealUser = USERS[targetPartnerId];
    const isContact = allContacts.some(c => c.id === targetPartnerId);

    if (decision === 'credit' && !isRealUser && !isContact) {
        alertUser("FEHLER: Guthaben kann nur für gespeicherte Kontakte angelegt werden!", "error_long");
        alert("Achtung:\nDieser Partner ist nur als Text (Gast) hinterlegt.\n\nBitte zuerst:\n1. Den Partner unter 'Einstellungen > Eigene Kontakte' anlegen.\n2. Den offenen Eintrag bearbeiten und die Person auf den neuen Kontakt ändern.\n3. Dann die Zahlung erneut erfassen.");
        
        // Modal schließen, aber nichts buchen
        document.getElementById('overpaymentModal').style.display = 'none';
        pendingOverpaymentData = null;
        return;
    }
    // --- ENDE CHECK ---

    setButtonLoading(document.getElementById(decision === 'credit' ? 'btn-op-credit' : 'btn-op-tip'), true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
        const transaction = { date: new Date(), amount: debtAmount, type: 'payment', user: currentUser.displayName };
        
        batch.update(doc(paymentsRef, paymentId), {
            remainingAmount: 0, status: 'paid',
            history: [...(p.history||[]), { date: new Date(), action: 'paid_excess', user: currentUser.displayName, info: `Bezahlt mit Überzahlung (${payAmount.toFixed(2)}€).` }],
            transactions: [...(p.transactions||[]), transaction]
        });

        if (decision === 'credit') {
            const creditDocRef = doc(paymentsRef);
            batch.set(creditDocRef, {
                title: `Guthaben (aus "${p.title}")`, amount: excessAmount, remainingAmount: excessAmount, isTBD: false, type: 'credit', status: 'open', createdAt: serverTimestamp(), createdBy: currentUser.mode, debtorId: p.creditorId, debtorName: p.creditorName, creditorId: p.debtorId, creditorName: p.debtorName, involvedUserIds: p.involvedUserIds, history: [{ date: new Date(), action: 'created_credit', user: currentUser.displayName, info: `Guthaben aus Überzahlung.` }]
            });
            alertUser("Guthaben angelegt!", "success");
        } else { alertUser("Als Trinkgeld verbucht.", "success"); }
        
        await batch.commit(); 
        document.getElementById('overpaymentModal').style.display = 'none'; 
        closeDetailModal(); 
        pendingOverpaymentData = null;

    } catch (e) { console.error(e); alertUser(e.message, "error"); } 
    finally { 
        setButtonLoading(document.getElementById('btn-op-credit'), false); 
        setButtonLoading(document.getElementById('btn-op-tip'), false); 
    }
}


// Transaktion löschen (Neu)
window.deleteTransaction = async function(paymentId, txIndex) {
    const p = allPayments.find(x => x.id === paymentId);
    if (!p || !p.transactions) return;
    if (!confirm("Diese Zahlung stornieren? Der Betrag wird wieder offen.")) return;

    const tx = p.transactions[txIndex];
    const amountToAddBack = parseFloat(tx.amount);

    try {
        const newTransactions = p.transactions.filter((_, i) => i !== txIndex);
        const newRemaining = parseFloat(p.remainingAmount) + amountToAddBack;

        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentId), {
            remainingAmount: newRemaining,
            status: 'open', // Wieder öffnen
            transactions: newTransactions,
            history: [...(p.history || []), { date: new Date(), action: 'tx_deleted', user: currentUser.displayName, info: `Zahlung von ${amountToAddBack.toFixed(2)}€ storniert.` }]
        });
        alertUser("Zahlung storniert.", "success");
    } catch (e) { console.error(e); alertUser("Fehler beim Löschen.", "error"); }
}

// --- HELPER: DROPDOWN BEFÜLLEN (INKL. EIGENER USER) ---
function fillDropdown(selectElement, type) {
    selectElement.innerHTML = '';
    selectElement.innerHTML = '<option value="">- Bitte wählen -</option>';

    // 1. MEINE KONTEN
    if (allAccounts.length > 0) {
        const grpAcc = document.createElement('optgroup');
        grpAcc.label = "[MEINE KONTEN]";
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
    
    // 2. REGISTRIERTE PERSONEN (JETZT MIT MIR SELBST!)
    const grpUsers = document.createElement('optgroup');
    grpUsers.label = "[REGISTRIERTE PERSONEN]";
    Object.values(USERS).forEach(user => {
        if (user.isActive) { // KORREKTUR: Wir filtern currentUser NICHT mehr aus!
            const opt = document.createElement('option');
            opt.value = `USR:${user.id}`;
            opt.dataset.type = "user";
            opt.textContent = user.realName || user.name;
            
            // Markiere mich selbst zur Orientierung
            if (user.id === currentUser.mode) {
                opt.textContent += " (Ich)";
                opt.style.fontWeight = "bold";
            }
            
            grpUsers.appendChild(opt);
        }
    });
    selectElement.appendChild(grpUsers);

    // 3. EIGENE KONTAKTE
    const grpContacts = document.createElement('optgroup');
    grpContacts.label = "[EIGENE KONTAKTE]";
    allContacts.forEach(contact => {
        const opt = document.createElement('option');
        opt.value = `CON:${contact.id}`;
        opt.dataset.type = "contact";
        opt.textContent = contact.name;
        grpContacts.appendChild(opt);
    });
    selectElement.appendChild(grpContacts);
}


async function addCategory() {
    const input = document.getElementById('new-category-input');
    const name = input.value.trim();
    if (!name) return;

    // Prüfen ob existiert
    if (allCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        alertUser("Kategorie existiert bereits.", "error");
        return;
    }

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'payment-categories'), {
            name: name,
            isSystem: false,
            createdAt: serverTimestamp()
        });
        alertUser("Kategorie erstellt!", "success");
        input.value = '';
    } catch(e) { console.error(e); alertUser("Fehler.", "error"); }
}

async function deleteCategory(id) {
    const cat = allCategories.find(c => c.id === id);
    if (!cat) return;
    if (cat.isSystem) { alertUser("System-Kategorien können nicht gelöscht werden.", "error"); return; }
    if (!confirm(`Kategorie "${cat.name}" löschen?`)) return;

    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payment-categories', id));
        alertUser("Gelöscht.", "success");
    } catch(e) { console.error(e); }
}

async function renameCategory(id) {
    const cat = allCategories.find(c => c.id === id);
    if (!cat) return;
    if (cat.isSystem) { alertUser("System-Kategorien können nicht umbenannt werden.", "error"); return; }
    
    const newName = prompt("Neuer Name:", cat.name);
    if (newName && newName.trim()) {
         try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payment-categories', id), { name: newName.trim() });
        } catch(e) { console.error(e); }
    }
}

function renderCategoryList() {
    const container = document.getElementById('zv-categories-list');
    if (!container) return;
    container.innerHTML = '';
    if (allCategories.length === 0) return;

    allCategories.forEach(c => {
        const isSys = c.isSystem;
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 bg-white rounded shadow-sm border";
        div.innerHTML = `
            <span class="font-bold ${isSys ? 'text-gray-500' : 'text-gray-800'}">${c.name} ${isSys ? '(System)' : ''}</span>
            ${!isSys ? `
            <div class="flex gap-1">
                <button class="edit-cat-btn p-1.5 text-indigo-500 hover:bg-indigo-50 rounded" data-id="${c.id}">✏️</button>
                <button class="delete-cat-btn p-1.5 text-red-500 hover:bg-red-50 rounded" data-id="${c.id}">🗑️</button>
            </div>` : ''}
        `;
        container.appendChild(div);
    });
}



// --- TABS LOGIK ---
function openSettingsTab(tabName) {
    const tabs = ['templates', 'contacts', 'credits', 'accounts', 'categories']; // "categories" hinzugefügt
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-zv-${t}`);
        const content = document.getElementById(`content-zv-${t}`);
        if (!btn || !content) return;
        if (t === tabName) {
            btn.className = "px-4 py-2 font-bold text-indigo-600 border-b-2 border-indigo-600 whitespace-nowrap";
            content.classList.remove('hidden');
        } else {
            btn.className = "px-4 py-2 font-bold text-gray-500 hover:text-gray-700 whitespace-nowrap";
            content.classList.add('hidden');
        }
    });
}


// --- KONTEN VERWALTUNG (NEU) ---
async function addAccountFromSettings() {
    const name = document.getElementById('new-account-name').value.trim();
    const details = document.getElementById('new-account-details').value.trim();
    if (!name) return;
    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'private-accounts'), {
            name, details, createdBy: currentUser.mode, createdAt: serverTimestamp()
        });
        alertUser("Konto erstellt!", "success");
        document.getElementById('new-account-name').value = '';
        document.getElementById('new-account-details').value = '';
    } catch(e) { console.error(e); alertUser("Fehler.", "error"); }
}

async function deleteAccount(id) {
    if(!confirm("Konto löschen?")) return;
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'private-accounts', id)); } catch(e) { console.error(e); }
}

function renderAccountList() {
    const container = document.getElementById('zv-accounts-list');
    if (!container) return;
    container.innerHTML = '';
    if (allAccounts.length === 0) { container.innerHTML = '<p class="text-center text-gray-400 italic">Keine eigenen Konten.</p>'; return; }
    allAccounts.forEach(acc => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-white rounded shadow-sm border";
        div.innerHTML = `
            <div>
                <span class="font-bold text-blue-700 block">${acc.name}</span>
                <span class="text-xs text-gray-500">${acc.details || ''}</span>
            </div>
            <button class="delete-acc-btn p-1 text-red-400 hover:bg-red-50 rounded" data-id="${acc.id}">🗑️</button>
        `;
        container.appendChild(div);
    });
}

// --- KONTAKTE VERWALTUNG (KOMPLETT NEU) ---

async function addContact(name) {
    const cleanName = name.trim();
    if (!cleanName) return;

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
    if(!confirm("Kontakt löschen?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'private-contacts', id));
    } catch(e) { console.error(e); }
}

async function renameContact(id) {
    const contact = allContacts.find(c => c.id === id);
    const newName = prompt("Neuer Name:", contact?.name);
    if (newName && newName.trim()) {
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'private-contacts', id), { name: newName.trim() });
        } catch(e) { console.error(e); }
    }
}

function renderContactList() {
    const container = document.getElementById('zv-contacts-list');
    if (!container) return;
    container.innerHTML = '';
    
    if (allContacts.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 italic">Keine Kontakte.</p>';
        return;
    }

    allContacts.forEach(c => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 bg-white rounded-lg shadow-sm border hover:shadow-md transition";
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center font-bold text-xs">
                    ${c.name.substring(0,2).toUpperCase()}
                </div>
                <span class="font-bold text-gray-700">${c.name}</span>
            </div>
            <div class="flex gap-1">
                <button class="share-contact-btn p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded transition" data-id="${c.id}" title="Gast-Link kopieren">
                    🔗
                </button>
                <button class="migrate-contact-btn p-1.5 text-gray-500 hover:bg-orange-50 hover:text-orange-600 rounded transition" data-id="${c.id}" title="In echten User umwandeln">
                    🔄
                </button>
                <button class="edit-contact-btn p-1.5 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 rounded transition" data-id="${c.id}" title="Umbenennen">
                    ✏️
                </button>
                <button class="delete-contact-btn p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded transition" data-id="${c.id}" title="Löschen">
                    🗑️
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}
// --- SCHNELL-SPEICHERN LOGIK (NEU) ---
function checkManualInputForContact() {
    const val = this.value.trim();
    const btn = document.getElementById('btn-quick-save-contact');
    
    // Zeige Button nur, wenn Text da ist UND es diesen Namen noch nicht gibt
    if (val.length > 0) {
        const exists = allContacts.some(c => c.name.toLowerCase() === val.toLowerCase());
        if (!exists) {
            btn.classList.remove('hidden');
            btn.textContent = `💾 "${val}" als Kontakt speichern`;
        } else {
            btn.classList.add('hidden');
        }
    } else {
        btn.classList.add('hidden');
    }
}

async function quickSaveContact() {
    const input = document.getElementById('payment-partner-name-manual');
    const name = input.value;
    if (await addContact(name)) {
        alertUser(`"${name}" wurde als Kontakt gespeichert!`, "success");
        document.getElementById('btn-quick-save-contact').classList.add('hidden');
        // Umschalten auf Dropdown
        togglePartnerManual(); 
    }
}

// --- VORLAGEN (TEMPLATES) LOGIK (NEU) ---

async function saveCurrentAsTemplate() {
    const title = document.getElementById('payment-title').value.trim();
    if (!title) { alertUser("Bitte erst einen Titel eingeben.", "error"); return; }

    const amount = parseFloat(document.getElementById('payment-amount').value) || 0;
    const partnerId = document.getElementById('payment-partner-select').value;
    const partnerManual = document.getElementById('payment-partner-name-manual').value;
    
    const tplData = {
        title: title,
        amount: amount,
        partnerId: partnerId,
        partnerManual: partnerManual,
        direction: document.getElementById('payment-direction').value,
        createdBy: currentUser.mode
    };

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'payment-templates'), tplData);
        alertUser("Vorlage gespeichert!", "success");
    } catch(e) { console.error(e); alertUser("Fehler beim Speichern.", "error"); }
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
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 bg-white rounded shadow-sm border hover:shadow-md";
        div.innerHTML = `
            <div>
                <p class="font-bold text-gray-800">${tpl.title}</p>
                <p class="text-xs text-gray-500">${tpl.amount ? tpl.amount.toFixed(2) + '€' : 'Variabel'}</p>
            </div>
            <button class="delete-tpl-btn text-red-400 hover:text-red-600 p-2" data-id="${tpl.id}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>
            </button>
        `;
        container.appendChild(div);
    });
}

async function deleteTemplate(id) {
    if (!confirm("Vorlage wirklich löschen?")) return;
    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payment-templates', id));
    } catch(e) { console.error(e); }
}

function updateTemplateDropdown() {
    const select = document.getElementById('payment-template-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Vorlage wählen --</option>';
    allTemplates.forEach(tpl => {
        const opt = document.createElement('option');
        opt.value = tpl.id;
        opt.textContent = `${tpl.title}`;
        select.appendChild(opt);
    });
}

function applySelectedTemplate() {
    const id = document.getElementById('payment-template-select').value;
    const tpl = allTemplates.find(t => t.id === id);
    if (!tpl) return;

    document.getElementById('payment-title').value = tpl.title;
    if (tpl.amount) document.getElementById('payment-amount').value = tpl.amount;
    if (tpl.direction) setDirection(tpl.direction);
    
    if (tpl.partnerId) {
        document.getElementById('payment-partner-select').value = tpl.partnerId;
        document.getElementById('payment-partner-select').classList.remove('hidden');
        document.getElementById('payment-partner-name-manual').classList.add('hidden');
        document.getElementById('btn-toggle-partner-manual').textContent = "Manueller Name";
    } else if (tpl.partnerManual) {
        document.getElementById('payment-partner-name-manual').value = tpl.partnerManual;
        document.getElementById('payment-partner-select').classList.add('hidden');
        document.getElementById('payment-partner-name-manual').classList.remove('hidden');
        document.getElementById('btn-toggle-partner-manual').textContent = "Liste wählen";
    }
}

// --- GUTHABEN (CREDIT) LOGIK (NEU) ---

// --- GUTHABEN (CREDIT) LIST RENDER (GRUPPIERT) ---
function renderCreditOverview() {
    const myCreditsList = document.getElementById('my-credits-list');
    const othersCreditsList = document.getElementById('others-credits-list');
    myCreditsList.innerHTML = ''; othersCreditsList.innerHTML = '';
    
    const credits = allPayments.filter(p => p.type === 'credit' && p.status === 'open');

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
function openCreditDetails(group) {
    const modal = document.getElementById('creditDetailsModal');
    const list = document.getElementById('credit-details-list');
    
    document.getElementById('credit-details-title').textContent = group.name;
    document.getElementById('credit-details-total').textContent = group.total.toFixed(2) + " €";
    list.innerHTML = '';

    // Hole die echten Objekte anhand der gespeicherten IDs
    const entries = allPayments.filter(p => group.ids.includes(p.id));

    entries.forEach(p => {
        const row = document.createElement('div');
        row.className = "flex justify-between items-center p-2 bg-white border rounded shadow-sm";
        
        // Button Text je nach Kontext
        const btnText = group.context === 'my' ? "Abbuchen" : "Auszahlen";
        const btnClass = "text-xs border border-gray-300 px-2 py-1 rounded hover:bg-gray-100 text-gray-600";

        row.innerHTML = `
            <div class="flex-grow">
                <p class="text-sm font-bold text-gray-800">${p.title}</p>
                <p class="text-xs text-gray-500">${new Date(p.createdAt?.toDate()).toLocaleDateString()}</p>
            </div>
            <div class="flex items-center gap-2">
                <span class="font-mono font-semibold text-gray-700">${parseFloat(p.remainingAmount).toFixed(2)}€</span>
                <button class="${btnClass} action-btn" data-id="${p.id}">${btnText}</button>
            </div>
        `;
        
        // Event Listener für den Button im Detail-Fenster
        row.querySelector('.action-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            // Modal schließen und Action-Modal öffnen
            document.getElementById('creditDetailsModal').style.display = 'none';
            openCreditModal('sub', group.context, p.id);
        });

        list.appendChild(row);
    });

    modal.style.display = 'flex';
}

// --- CREDITS MODAL & ACTIONS ---

window.openCreditModal = function(mode, context, paymentId = null) {
    const modal = document.getElementById('creditManageModal');
    document.getElementById('credit-mode').value = mode;
    document.getElementById('credit-context').value = context;
    modal.dataset.paymentId = paymentId || "";

    const select = document.getElementById('credit-partner-select');
    const amountInput = document.getElementById('credit-amount');
    const reasonInput = document.getElementById('credit-reason');
    
    amountInput.value = ''; reasonInput.value = ''; select.innerHTML = ''; select.disabled = false;

    // Standard Dropdown füllen
    fillPartnerSelect(select, false);

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
                
                // ID des Partners ermitteln
                const partnerId = (context === 'my') ? p.debtorId : p.creditorId;
                const partnerName = (context === 'my') ? p.debtorName : p.creditorName;

                // FIX: Prüfen, ob der Partner im Dropdown ist. Wenn nicht (weil "Geist"), fügen wir ihn hinzu.
                let optionExists = select.querySelector(`option[value="${partnerId}"]`);
                if (!optionExists && partnerId) {
                    const opt = document.createElement('option');
                    opt.value = partnerId;
                    opt.textContent = partnerName + " (Archiviert/Gast)";
                    // Am Anfang einfügen
                    select.insertBefore(opt, select.firstChild);
                } else if (!partnerId) {
                     // Ganz schlimmer Fall: Keine ID. Wir nehmen den Namen als Value (Notlösung)
                     const opt = document.createElement('option');
                     opt.value = partnerName; // Vorsicht, hier muss executeCreditAction drauf reagieren
                     opt.textContent = partnerName + " (Nur Name)";
                     select.insertBefore(opt, select.firstChild);
                }

                select.value = partnerId || partnerName;
                select.disabled = true;
            }
        }
    }
    modal.classList.remove('hidden'); modal.style.display = 'flex';
}
async function executeCreditAction() {
    const mode = document.getElementById('credit-mode').value;
    const context = document.getElementById('credit-context').value;
    const partnerId = document.getElementById('credit-partner-select').value;
    
    // NEU: Runden
    let amount = parseFloat(document.getElementById('credit-amount').value);
    if (!isNaN(amount)) { amount = parseFloat(amount.toFixed(2)); }
    
    const reason = document.getElementById('credit-reason').value.trim();
    const paymentId = document.getElementById('creditManageModal').dataset.paymentId;

    if (!partnerId) { alertUser("Bitte eine Person aus der Liste wählen.", "error"); return; }
    if (isNaN(amount) || amount <= 0) { alertUser("Bitte einen gültigen Betrag eingeben.", "error"); return; }
    if (!reason) { alertUser("Bitte einen Grund angeben.", "error"); return; }

    // --- NEU: SICHERHEITSCHECK FÜR MANUELLES AUFLADEN ---
    // Wenn wir ADDEN (Zubuchen), muss der Partner valid sein.
    // Beim Abbuchen (SUB) erlauben wir es ausnahmsweise, damit man "Leichen" entfernen kann.
    if (mode === 'add') {
        const isRealUser = USERS[partnerId];
        const isContact = allContacts.some(c => c.id === partnerId);
        
        if (!isRealUser && !isContact) {
             // Das passiert eigentlich nur, wenn jemand den Value im HTML manipuliert,
             // aber sicher ist sicher.
             alertUser("Guthaben kann nur für registrierte Kontakte angelegt werden.", "error");
             return;
        }
    }
    // --- ENDE CHECK ---

    const btn = document.getElementById('btn-save-credit');
    setButtonLoading(btn, true);
    
    // ... (Rest der Funktion bleibt gleich wie vorher) ...
    // Hier unten folgt der try { ... } Block.
    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
        
        let partnerName = "Unbekannt";
        if (USERS[partnerId]) partnerName = USERS[partnerId].realName || USERS[partnerId].name;
        else {
            const c = allContacts.find(c => c.id === partnerId);
            if (c) partnerName = c.name;
            // Fallback für Abbuchen von "Leichen"
            else if (paymentId) {
                 const p = allPayments.find(x => x.id === paymentId);
                 if(p) partnerName = (context === 'my') ? p.debtorName : p.creditorName;
            }
        }

        if (mode === 'add') {
            const docData = {
                title: reason, amount: amount, remainingAmount: amount, type: 'credit', status: 'open', isTBD: false,
                startDate: new Date().toISOString().split('T')[0], createdAt: serverTimestamp(), createdBy: currentUser.mode,
                involvedUserIds: [currentUser.mode, partnerId],
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
    const link = `${baseUrl}?guest_id=${contactId}`;
    
    try {
        await navigator.clipboard.writeText(link);
        alertUser("Geheimer Link kopiert! 📋\nSende ihn an deinen Freund.", "success");
    } catch (err) {
        prompt("Link kopieren:", link);
    }
}

// --- GAST VIEW INITIALISIERUNG (Wird von haupteingang.js gerufen) ---

export async function initializeGuestView(guestId) {
    const view = document.getElementById('guestView');
    if (!view) return;
    view.classList.add('active');

    // 1. Kontaktdaten laden (Name)
    try {
        const contactDoc = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'private-contacts'), where('__name__', '==', guestId))); // Hack für ID Query in V9 Lite
        // Firestore Client SDK V9: getDoc(doc(...)) ist besser
        const docSnap = await getDocs(query(collection(db, 'artifacts', appId, 'public', 'data', 'private-contacts'))); 
        // Wir müssen durchsuchen, da wir keine Auth haben und die Regeln vielleicht ID-basiert sind? 
        // Nein, wir nutzen einfach den Client.
        
        // Einfacherer Weg mit Referenz, falls Regeln public read erlauben:
        // Da wir nicht eingeloggt sind, greifen wir auf "public" Daten zu.
        // ACHTUNG: Firebase Regeln müssen read für "private-contacts" und "payments" erlauben (if true).
        
        // Da wir den Gastnamen nicht kennen, laden wir ihn.
        // Wir suchen in den Payments nach dem Namen, das ist robuster ohne Auth auf Contacts.
        
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
        // Wir suchen Zahlungen, wo dieser Gast involviert ist.
        // Da involvedUserIds auch die Kontakt-ID enthält:
        const q = query(paymentsRef, where('involvedUserIds', 'array-contains', guestId));
        
        const snapshot = await getDocs(q);
        const listContainer = document.getElementById('guest-payment-list');
        listContainer.innerHTML = '';
        
        let totalDebt = 0;
        let nameFound = "Gast";

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-center text-gray-500">Keine Einträge gefunden.</p>';
        } else {
            snapshot.forEach(doc => {
                const p = doc.data();
                if (p.status !== 'open' && p.status !== 'pending_approval') return;

                // Name finden
                if (p.debtorId === guestId) nameFound = p.debtorName;
                if (p.creditorId === guestId) nameFound = p.creditorName;

                // Rechnen (Aus Sicht des Gastes!)
                // Wenn Gast Debtor ist -> Er schuldet -> Negativ (rot)
                // Wenn Gast Creditor ist -> Er kriegt -> Positiv (grün)
                // Aber meistens zeigen wir "Was muss ich zahlen?".
                
                let amount = parseFloat(p.remainingAmount);
                let isDebt = (p.debtorId === guestId);
                
                if (isDebt) totalDebt -= amount; // Ich schulde
                else totalDebt += amount; // Ich kriege

                const div = document.createElement('div');
                div.className = "p-3 bg-white border rounded shadow-sm flex justify-between items-center";
                div.innerHTML = `
                    <div>
                        <p class="font-bold text-gray-800">${p.title}</p>
                        <p class="text-xs text-gray-500">
                            ${isDebt ? 'Du schuldest an' : 'Dir schuldet'} 
                            <strong>${isDebt ? p.creditorName : p.debtorName}</strong>
                        </p>
                    </div>
                    <span class="font-mono font-bold ${isDebt ? 'text-red-600' : 'text-green-600'}">
                        ${isDebt ? '- ' : '+ '}${amount.toFixed(2)} €
                    </span>
                `;
                listContainer.appendChild(div);
            });
        }
        
        document.getElementById('guest-name-display').textContent = nameFound;
        
        const totalEl = document.getElementById('guest-total-display');
        const statusEl = document.getElementById('guest-status-text');
        
        if (totalDebt < 0) {
            totalEl.textContent = Math.abs(totalDebt).toFixed(2) + " €";
            totalEl.className = "text-4xl font-extrabold text-red-600";
            statusEl.textContent = "Das musst du noch zurückzahlen.";
        } else if (totalDebt > 0) {
            totalEl.textContent = totalDebt.toFixed(2) + " €";
            totalEl.className = "text-4xl font-extrabold text-emerald-600";
            statusEl.textContent = "Das bekommst du noch.";
        } else {
            totalEl.textContent = "0,00 €";
            totalEl.className = "text-4xl font-extrabold text-gray-400";
            statusEl.textContent = "Alles ausgeglichen.";
        }

    } catch (e) {
        console.error(e);
        alert("Fehler beim Laden. Eventuell ist der Link abgelaufen oder die Berechtigungen fehlen.");
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
        
        // Wir müssen ALLE Zahlungen finden, wo der Kontakt involviert ist.
        const q = query(paymentsRef, where('involvedUserIds', 'array-contains', currentMigrationContactId));
        const snapshot = await getDocs(q);

        let count = 0;
        snapshot.forEach(docSnap => {
            const p = docSnap.data();
            const ref = doc(paymentsRef, docSnap.id);
            const updates = {};
            let changed = false;

            // Array aktualisieren: Alten ID raus, Neue ID rein
            let newInvolved = p.involvedUserIds.filter(id => id !== currentMigrationContactId);
            if (!newInvolved.includes(targetUserId)) newInvolved.push(targetUserId);
            updates.involvedUserIds = newInvolved;

            // Rollen umschreiben
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
        
    } catch (e) {
        console.error(e);
        alertUser("Fehler bei der Migration: " + e.message, "error");
    } finally {
        setButtonLoading(btn, false);
    }
}


function updateCategoryFilterDropdown() {
    const select = document.getElementById('payment-filter-category');
    if (!select) return;
    
    const currentVal = select.value;

    select.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'all'; allOpt.textContent = 'Alle Kategorien';
    select.appendChild(allOpt);

    const grp = document.createElement('optgroup');
    grp.label = "[KATEGORIEN]";
    
    allCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        grp.appendChild(opt);
    });
    select.appendChild(grp);
    
    select.value = currentVal || 'all';
    
    // Auch Status-Dropdown neu bauen für fettgedruckte Überschrift
    const statusSelect = document.getElementById('payment-filter-status');
    if (statusSelect && statusSelect.children.length <= 1) {
        statusSelect.innerHTML = '';
        const sAll = document.createElement('option'); sAll.value = 'all'; sAll.textContent = 'Alle Status'; statusSelect.appendChild(sAll);
        const sGrp = document.createElement('optgroup'); sGrp.label = "[BEZAHLSTATUS]";
        sGrp.innerHTML = `
            <option value="open">Offen / Teilbezahlt</option>
            <option value="pending">Wartet auf Bestätigung</option>
            <option value="closed">Abgeschlossen / Bezahlt</option>
        `;
        statusSelect.appendChild(sGrp);
    }
}