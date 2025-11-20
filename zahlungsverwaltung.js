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
let unsubscribeContacts = null; // NEU

let allPayments = [];
let allTemplates = [];
let allContacts = []; // NEU

let currentDetailPaymentId = null;
let currentSplitMode = 'single';
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
        listenForContacts(); // NEU
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
    
    // Standard-Tab öffnen
    openSettingsTab('templates');
    renderTemplateList();
    renderContactList(); // NEU
    renderCreditOverview();
}

// --- SETUP EVENT LISTENERS ---
function setupEventListeners() {
    document.getElementById('btn-create-new-payment')?.addEventListener('click', () => openCreateModal());
    document.getElementById('close-create-payment-modal')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-cancel-create-payment')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-save-payment')?.addEventListener('click', savePayment);
    
    document.getElementById('mode-single')?.addEventListener('click', () => setCreateMode('single'));
    document.getElementById('mode-split')?.addEventListener('click', () => setCreateMode('split'));
    document.getElementById('btn-direction-i-owe')?.addEventListener('click', () => setDirection('i_owe'));
    document.getElementById('btn-direction-owes-me')?.addEventListener('click', () => setDirection('owes_me'));
    document.getElementById('btn-toggle-partner-manual')?.addEventListener('click', togglePartnerManual);
    
    document.getElementById('btn-add-split-manual')?.addEventListener('click', addSplitManualPartner);
    document.getElementById('split-manual-name-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSplitManualPartner(); } });
    
    document.getElementById('btn-toggle-advanced-payment')?.addEventListener('click', () => document.getElementById('payment-advanced-options').classList.toggle('hidden'));
    document.getElementById('payment-is-installment')?.addEventListener('change', (e) => document.getElementById('installment-options').classList.toggle('hidden', !e.target.checked));
    
    document.getElementById('payment-amount')?.addEventListener('input', updateSplitPreview);
    document.getElementById('split-include-me')?.addEventListener('change', updateSplitPreview);
    
    document.getElementById('payment-search-input')?.addEventListener('input', applyFilters);
    document.getElementById('payment-filter-status')?.addEventListener('change', applyFilters);
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

    // NEU: Listener für manuellen Namen & Schnell-Speichern
    document.getElementById('payment-partner-name-manual')?.addEventListener('input', checkManualInputForContact);
    document.getElementById('btn-quick-save-contact')?.addEventListener('click', quickSaveContact);
}

function setupSettingsListeners() {
    document.getElementById('tab-zv-templates')?.addEventListener('click', () => openSettingsTab('templates'));
    document.getElementById('tab-zv-contacts')?.addEventListener('click', () => openSettingsTab('contacts')); // NEU
    document.getElementById('tab-zv-credits')?.addEventListener('click', () => openSettingsTab('credits'));

    document.getElementById('zv-templates-list')?.addEventListener('click', (e) => {
        if (e.target.closest('.delete-tpl-btn')) deleteTemplate(e.target.closest('.delete-tpl-btn').dataset.id);
    });

    // NEU: Kontakte in Settings
    document.getElementById('btn-add-contact-setting')?.addEventListener('click', addContactFromSettings);
    document.getElementById('zv-contacts-list')?.addEventListener('click', (e) => {
        if (e.target.closest('.delete-contact-btn')) deleteContact(e.target.closest('.delete-contact-btn').dataset.id);
        if (e.target.closest('.edit-contact-btn')) renameContact(e.target.closest('.edit-contact-btn').dataset.id);
    });

    document.getElementById('btn-add-my-credit')?.addEventListener('click', () => openCreditModal('add', 'my'));
    document.getElementById('btn-add-other-credit')?.addEventListener('click', () => openCreditModal('add', 'other'));

    document.getElementById('btn-cancel-credit')?.addEventListener('click', () => {
        const modal = document.getElementById('creditManageModal');
        modal.classList.add('hidden');
        modal.style.display = 'none'; 
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

function openCreateModal(paymentToEdit = null) {
    const modal = document.getElementById('createPaymentModal');
    if (!modal) return;

    updateTemplateDropdown();
    const tplSelect = document.getElementById('payment-template-select');
    if(tplSelect) tplSelect.value = "";

    const saveBtn = document.getElementById('btn-save-payment');
    const hiddenId = document.getElementById('edit-payment-id');

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
    document.getElementById('payment-amount').disabled = false;
    document.getElementById('split-manual-name-input').value = '';

    document.getElementById('payment-is-installment').checked = false;
    document.getElementById('installment-options').classList.add('hidden');
    document.getElementById('payment-installments-total').value = '';

    // NEU: Partner Select mit Gruppen befüllen
    const select = document.getElementById('payment-partner-select');
    fillPartnerSelect(select);

    // Split Liste neu bauen
    const splitList = document.getElementById('split-partner-list');
    let splitCheckboxes = ``;
    
    // User
    Object.values(USERS).forEach(user => {
        if (user.id !== currentUser.mode && user.isActive) {
            const name = user.realName || user.name;
            splitCheckboxes += `<div class="p-1 hover:bg-gray-100 rounded"><label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="split-partner-cb h-4 w-4" value="${user.id}" data-name="${name}"><span class="text-gray-700 font-medium">${name}</span></label></div>`;
        }
    });
    // Kontakte
    if (allContacts.length > 0) {
        splitCheckboxes += `<div class="text-xs font-bold text-gray-500 mt-2 mb-1 uppercase">Eigene Kontakte</div>`;
        allContacts.forEach(c => {
             splitCheckboxes += `<div class="p-1 hover:bg-gray-100 rounded"><label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" class="split-partner-cb h-4 w-4" value="${c.id}" data-name="${c.name}"><span class="text-gray-700 font-medium">${c.name}</span></label></div>`;
        });
    }
    splitList.innerHTML = splitCheckboxes;

    document.querySelectorAll('.split-partner-cb').forEach(cb => { cb.addEventListener('change', updateSplitPreview); });

    if (paymentToEdit) {
        if (paymentToEdit.installment) {
            document.getElementById('payment-is-installment').checked = true;
            document.getElementById('installment-options').classList.remove('hidden');
            document.getElementById('payment-installments-total').value = paymentToEdit.installment.total || '';
            document.getElementById('payment-installment-interval').value = paymentToEdit.installment.interval || 'monthly';
            document.getElementById('payment-advanced-options').classList.remove('hidden');
        }
        setCreateMode('single');
        document.getElementById('mode-single').disabled = true;
        document.getElementById('mode-split').disabled = true;
        document.getElementById('mode-split').classList.add('opacity-50', 'cursor-not-allowed');

        saveBtn.textContent = "Änderungen speichern";
        hiddenId.value = paymentToEdit.id;

        document.getElementById('payment-title').value = paymentToEdit.title;
        document.getElementById('payment-amount').value = paymentToEdit.isTBD ? '' : paymentToEdit.amount;
        document.getElementById('payment-amount-tbd').checked = paymentToEdit.isTBD;
        document.getElementById('payment-amount').disabled = paymentToEdit.isTBD;
        document.getElementById('payment-start-date').value = paymentToEdit.startDate || '';
        document.getElementById('payment-deadline').value = paymentToEdit.deadline || '';
        document.getElementById('payment-invoice-nr').value = paymentToEdit.invoiceNr || '';
        document.getElementById('payment-order-nr').value = paymentToEdit.orderNr || '';
        document.getElementById('payment-notes').value = paymentToEdit.notes || '';
        document.getElementById('payment-type').value = paymentToEdit.type || 'debt';

        const iAmDebtor = paymentToEdit.debtorId === currentUser.mode;
        setDirection(iAmDebtor ? 'i_owe' : 'owes_me');
        const partnerId = iAmDebtor ? paymentToEdit.creditorId : paymentToEdit.debtorId;
        const partnerName = iAmDebtor ? paymentToEdit.creditorName : paymentToEdit.debtorName;

        // Prüfen ob ID im Select ist
        const optionExists = select.querySelector(`option[value="${partnerId}"]`);
        if (optionExists) {
            select.value = partnerId;
            select.classList.remove('hidden');
            document.getElementById('payment-partner-name-manual').classList.add('hidden');
            document.getElementById('btn-toggle-partner-manual').textContent = "Manueller Name";
            document.getElementById('btn-quick-save-contact').classList.add('hidden');
        } else {
            select.value = "";
            select.classList.add('hidden');
            const manualInput = document.getElementById('payment-partner-name-manual');
            manualInput.classList.remove('hidden');
            manualInput.value = partnerName;
            document.getElementById('btn-toggle-partner-manual').textContent = "Liste wählen";
            checkManualInputForContact.call(manualInput);
        }
        if (paymentToEdit.invoiceNr || paymentToEdit.orderNr || paymentToEdit.notes || paymentToEdit.type === 'transfer') {
            document.getElementById('payment-advanced-options').classList.remove('hidden');
        }
    } else {
        setCreateMode('single');
        document.getElementById('mode-single').disabled = false;
        document.getElementById('mode-split').disabled = false;
        document.getElementById('mode-split').classList.remove('opacity-50', 'cursor-not-allowed');
        saveBtn.textContent = "Speichern";
        hiddenId.value = "";
        setDirection('i_owe');
        select.classList.remove('hidden');
        document.getElementById('payment-partner-name-manual').classList.add('hidden');
        document.getElementById('payment-partner-name-manual').value = "";
        document.getElementById('btn-toggle-partner-manual').textContent = "Manueller Name";
        document.getElementById('btn-quick-save-contact').classList.add('hidden');
    }
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}




function closeCreateModal() {
    document.getElementById('createPaymentModal').classList.add('hidden');
    document.getElementById('createPaymentModal').style.display = 'none';
}

// --- SPLIT MANUELL: Gast hinzufügen / bearbeiten / löschen ---
function addSplitManualPartner() {
    const input = document.getElementById('split-manual-name-input');
    const name = input.value.trim();
    if (!name) return;
    const list = document.getElementById('split-partner-list');
    const id = 'MANUAL_' + Date.now();
    const div = document.createElement('div');
    div.className = "flex items-center justify-between p-1 mb-1 hover:bg-gray-100 rounded bg-yellow-50 border border-yellow-100";
    div.innerHTML = `<label class="flex items-center gap-2 cursor-pointer flex-grow"><input type="checkbox" class="split-partner-cb h-4 w-4" value="${id}" data-name="${name}" checked><span class="text-gray-800 font-medium partner-name-display">${name} <span class="text-xs text-gray-500">(Gast)</span></span></label>`;
    list.insertBefore(div, list.firstChild);
    input.value = '';
    div.querySelector('.split-partner-cb').addEventListener('change', updateSplitPreview);
    updateSplitPreview();
}

function setCreateMode(mode) {
    currentSplitMode = mode;
    const btnSingle = document.getElementById('mode-single');
    const btnSplit = document.getElementById('mode-split');

    const singleWrappers = [
        document.getElementById('direction-wrapper'),
        document.getElementById('single-partner-wrapper'),
        document.getElementById('tbd-wrapper')
    ];
    const splitWrappers = [
        document.getElementById('split-partner-wrapper'),
        document.getElementById('split-options-wrapper')
    ];

    if (mode === 'single') {
        btnSingle.classList.add('bg-white', 'shadow', 'text-gray-800');
        btnSingle.classList.remove('text-gray-500', 'hover:bg-gray-200');
        btnSplit.classList.remove('bg-white', 'shadow', 'text-gray-800');
        btnSplit.classList.add('text-gray-500', 'hover:bg-gray-200');

        singleWrappers.forEach(el => el.classList.remove('hidden'));
        splitWrappers.forEach(el => el.classList.add('hidden'));

        document.getElementById('label-partner').textContent = "Person (Gegenseite)";
        document.getElementById('label-amount').textContent = "Betrag (€)";

    } else {
        // SPLIT
        btnSplit.classList.add('bg-white', 'shadow', 'text-gray-800');
        btnSplit.classList.remove('text-gray-500', 'hover:bg-gray-200');
        btnSingle.classList.remove('bg-white', 'shadow', 'text-gray-800');
        btnSingle.classList.add('text-gray-500', 'hover:bg-gray-200');

        singleWrappers.forEach(el => el.classList.add('hidden'));
        splitWrappers.forEach(el => el.classList.remove('hidden'));

        document.getElementById('label-partner').textContent = "Gruppe (Wer muss zahlen?)";
        document.getElementById('label-amount').textContent = "Gesamtbetrag der Rechnung (€)";

        updateSplitPreview();
    }
}

function updateSplitPreview() {
    if (currentSplitMode !== 'split') return;

    const total = parseFloat(document.getElementById('payment-amount').value) || 0;
    const checkboxes = document.querySelectorAll('.split-partner-cb:checked');
    const includeMe = document.getElementById('split-include-me').checked;

    const count = checkboxes.length + (includeMe ? 1 : 0);
    const previewEl = document.getElementById('split-calculation-preview');

    if (count === 0 || total === 0) {
        previewEl.textContent = "";
        return;
    }

    const share = total / count;
    previewEl.textContent = `Anteil pro Person: ${share.toFixed(2)} € (bei ${count} Personen)`;
}

function setDirection(dir) {
    document.getElementById('payment-direction').value = dir;
    const btnI = document.getElementById('btn-direction-i-owe');
    const btnMe = document.getElementById('btn-direction-owes-me');

    if (dir === 'i_owe') {
        btnI.classList.add('bg-white', 'shadow', 'text-red-600');
        btnI.classList.remove('text-gray-500', 'hover:bg-gray-200');
        btnMe.classList.remove('bg-white', 'shadow', 'text-emerald-600');
        btnMe.classList.add('text-gray-500', 'hover:bg-gray-200');
    } else {
        btnMe.classList.add('bg-white', 'shadow', 'text-emerald-600');
        btnMe.classList.remove('text-gray-500', 'hover:bg-gray-200');
        btnI.classList.remove('bg-white', 'shadow', 'text-red-600');
        btnI.classList.add('text-gray-500', 'hover:bg-gray-200');
    }
}

function togglePartnerManual() {
    const select = document.getElementById('payment-partner-select');
    const input = document.getElementById('payment-partner-name-manual');
    const btn = document.getElementById('btn-toggle-partner-manual');
    const saveBtn = document.getElementById('btn-quick-save-contact');

    if (input.classList.contains('hidden')) {
        select.classList.add('hidden'); input.classList.remove('hidden'); select.value = ""; btn.textContent = "Liste wählen";
        checkManualInputForContact.call(input); // Status prüfen
    } else {
        input.classList.add('hidden'); select.classList.remove('hidden'); input.value = ""; btn.textContent = "Manueller Name";
        saveBtn.classList.add('hidden');
    }
}

async function savePayment() {
    const saveBtn = document.getElementById('btn-save-payment');
    setButtonLoading(saveBtn, true);
    try {
        const editId = document.getElementById('edit-payment-id').value;
        const startDate = document.getElementById('payment-start-date').value;
        const deadline = document.getElementById('payment-deadline').value;
        const title = document.getElementById('payment-title').value.trim();
        const invoiceNr = document.getElementById('payment-invoice-nr').value.trim();
        const orderNr = document.getElementById('payment-order-nr').value.trim();
        const notes = document.getElementById('payment-notes').value.trim();
        const type = document.getElementById('payment-type').value;
        const isInstallment = document.getElementById('payment-is-installment').checked;
        let installmentData = null;
        if (isInstallment) { installmentData = { total: parseInt(document.getElementById('payment-installments-total').value) || 0, interval: document.getElementById('payment-installment-interval').value }; }
        if (!title) throw new Error("Bitte einen Grund/Betreff angeben.");
        if (!startDate) throw new Error("Bitte ein Buchungsdatum (Start) angeben.");

        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        if (currentSplitMode === 'single') {
            const direction = document.getElementById('payment-direction').value;
            const partnerSelect = document.getElementById('payment-partner-select').value;
            const partnerManual = document.getElementById('payment-partner-name-manual').value.trim();
            const amountInput = document.getElementById('payment-amount').value;
            const isTBD = document.getElementById('payment-amount-tbd').checked;
            const amount = isTBD ? 0 : parseFloat(amountInput);
            if (!isTBD && (isNaN(amount) || amount <= 0)) throw new Error("Bitte gültigen Betrag.");
            if (!partnerSelect && !partnerManual) throw new Error("Bitte Person angeben.");

            let creditorId, creditorName, debtorId, debtorName;
            let partnerId = partnerSelect || null;
            
            // Name ermitteln: Entweder aus Users, oder aus Kontakten, oder Manuell
            let partnerName = "";
            if (partnerSelect) {
                if (USERS[partnerSelect]) partnerName = USERS[partnerSelect].realName || USERS[partnerSelect].name;
                else {
                    const c = allContacts.find(c => c.id === partnerSelect);
                    if (c) partnerName = c.name;
                }
            } else {
                partnerName = partnerManual;
            }

            if (direction === 'i_owe') { debtorId = currentUser.mode; debtorName = currentUser.displayName; creditorId = partnerId; creditorName = partnerName; } 
            else { creditorId = currentUser.mode; creditorName = currentUser.displayName; debtorId = partnerId; debtorName = partnerName; }

            const involvedUserIds = [currentUser.mode]; if (partnerId) involvedUserIds.push(partnerId);
            const data = { title, isTBD, startDate: startDate || null, deadline: deadline || null, invoiceNr, orderNr, notes, type, debtorId, debtorName, creditorId, creditorName, involvedUserIds, installment: installmentData };

            if (editId) {
                const existing = allPayments.find(p => p.id === editId);
                let newRemaining = existing.remainingAmount;
                if (!isTBD && !existing.isTBD) { newRemaining = parseFloat(existing.remainingAmount) + (amount - existing.amount); if (newRemaining < 0) newRemaining = 0; } 
                else if (!isTBD && existing.isTBD) newRemaining = amount; else if (isTBD) newRemaining = 0;
                data.amount = amount; data.remainingAmount = newRemaining; data.history = [...(existing.history || []), { date: new Date(), action: 'edited', user: currentUser.displayName, info: 'Bearbeitet.' }];
                batch.update(doc(paymentsRef, editId), data);
            } else {
                data.amount = amount; data.remainingAmount = amount; data.status = 'open'; data.createdAt = serverTimestamp(); data.createdBy = currentUser.mode;
                data.history = [{ date: new Date(), action: 'created', user: currentUser.displayName, info: `Erstellt: ${isTBD ? 'TBD' : amount + '€'}` }];
                batch.set(doc(paymentsRef), data);
            }
        } else {
            const totalAmount = parseFloat(document.getElementById('payment-amount').value);
            const selectedCheckboxes = document.querySelectorAll('.split-partner-cb:checked');
            const includeMe = document.getElementById('split-include-me').checked;
            const count = selectedCheckboxes.length + (includeMe ? 1 : 0);
            const share = totalAmount / count;
            selectedCheckboxes.forEach(cb => {
                let pId = cb.value; const pName = cb.dataset.name; let involved = [currentUser.mode];
                if (pId.startsWith('MANUAL_')) pId = null; else involved.push(pId);
                const entryData = {
                    title: `${title} (Split)`, amount: share, remainingAmount: share, isTBD: false, startDate: startDate || null, deadline: deadline || null, invoiceNr, orderNr, notes, type, status: 'open', createdAt: serverTimestamp(), createdBy: currentUser.mode, creditorId: currentUser.mode, creditorName: currentUser.displayName, debtorId: pId, debtorName: pName, involvedUserIds: involved, installment: installmentData,
                    history: [{ date: new Date(), action: 'created_split', user: currentUser.displayName, info: `Split-Anteil von ${share.toFixed(2)}€` }]
                };
                batch.set(doc(paymentsRef), entryData);
            });
        }
        await batch.commit(); alertUser("Gespeichert!", "success"); closeCreateModal();
    } catch (e) { console.error(e); alertUser(e.message, "error"); } finally { setButtonLoading(saveBtn, false); }
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
    const p = allPayments.find(x => x.id === id);
    if (!p) return;
    currentDetailPaymentId = id;
    renderDetailContent(p, isRefresh);
};

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
    const dirFilter = document.getElementById('payment-filter-direction')?.value || 'all';

    let filtered = allPayments.filter(p => {
        const textMatch = (p.title && p.title.toLowerCase().includes(searchTerm)) || (p.debtorName && p.debtorName.toLowerCase().includes(searchTerm)) || (p.creditorName && p.creditorName.toLowerCase().includes(searchTerm));
        if (!textMatch) return false;
        if (statusFilter !== 'all') {
            if (statusFilter === 'open' && p.status !== 'open') return false;
            if (statusFilter === 'pending' && p.status !== 'pending_approval') return false;
            if (statusFilter === 'closed' && (p.status !== 'paid' && p.status !== 'cancelled')) return false;
        }
        if (dirFilter !== 'all') {
            const iAmDebtor = p.debtorId === currentUser.mode;
            if (dirFilter === 'i_owe' && !iAmDebtor) return false;
            if (dirFilter === 'owes_me' && iAmDebtor) return false;
        }
        return true;
    });

    filtered.sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        return (b.createdAt?.toDate ? b.createdAt.toDate() : new Date()) - (a.createdAt?.toDate ? a.createdAt.toDate() : new Date());
    });
    renderPaymentList(filtered);
    updateDashboard(allPayments);
}

function renderPaymentList(payments) {
    const container = document.getElementById('payments-list-container');
    if (!container) return;
    container.innerHTML = '';
    if (payments.length === 0) { container.innerHTML = `<div class="text-center p-8 bg-gray-50 rounded-xl text-gray-500">Keine Einträge.</div>`; return; }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zeit ignorieren für Vergleich

    payments.forEach(p => {
        const iAmDebtor = p.debtorId === currentUser.mode;
        const partnerName = iAmDebtor ? p.creditorName : p.debtorName;
        const prefix = iAmDebtor ? "Ich schulde an" : "Schuldet mir";
        const colorClass = iAmDebtor ? "text-red-600" : "text-emerald-600";
        const bgClass = iAmDebtor ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200";
        
        let statusBadge = '';
        let timeBadge = '';

        // --- LOGIK FÜR DEADLINE WARNUNGEN ---
        if (p.status === 'open') {
            statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-800">Offen</span>`;

            if (p.deadline) {
                const deadlineDate = new Date(p.deadline);
                deadlineDate.setHours(0,0,0,0);
                
                const diffTime = deadlineDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays < 0) {
                    // Überfällig
                    timeBadge = `<span class="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">Überfällig (${Math.abs(diffDays)} Tage)</span>`;
                } else if (diffDays === 0) {
                    // Heute
                    timeBadge = `<span class="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white">Fällig: HEUTE</span>`;
                } else if (diffDays <= 3) {
                    // Bald
                    timeBadge = `<span class="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">Fällig in ${diffDays} Tagen</span>`;
                } else {
                    // Zukunft
                    timeBadge = `<span class="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">Fällig in ${diffDays} Tagen</span>`;
                }
            }
        } 
        else if (p.status === 'pending_approval') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800">Wartet</span>`;
        else if (p.status === 'paid') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-800">Bezahlt</span>`;
        else if (p.status === 'cancelled') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-600">Storniert</span>`;

        const checkboxHtml = isSelectionMode ?
            `<div class="mr-3 flex items-center"><input type="checkbox" class="payment-select-cb h-5 w-5 text-indigo-600" value="${p.id}" ${selectedPaymentIds.has(p.id) ? 'checked' : ''}></div>` : '';

        const html = `
        <div class="payment-card-item card p-4 rounded-xl border ${bgClass} shadow-sm hover:shadow-md transition cursor-pointer flex items-center" data-id="${p.id}">
            ${checkboxHtml}
            <div class="flex-grow">
                <div class="flex justify-between items-start">
                    <div class="flex flex-col">
                        <h4 class="font-bold text-gray-800 leading-tight">${p.title}</h4>
                        ${p.startDate ? `<span class="text-[10px] text-gray-400 mt-0.5">Vom: ${new Date(p.startDate).toLocaleDateString()}</span>` : ''}
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${statusBadge}
                        ${timeBadge}
                    </div>
                </div>
                <p class="text-xs text-gray-500 mt-2">${prefix} <strong>${partnerName}</strong></p>
                <div class="mt-1 flex items-center gap-2"><span class="text-xl font-extrabold ${colorClass}">${p.isTBD ? 'TBD' : parseFloat(p.remainingAmount).toFixed(2) + ' €'}</span></div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6 text-gray-400 ml-2"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" /></svg>
        </div>`;
        container.innerHTML += html;
    });
}

function updateDashboard(payments) {
    let myDebt = 0; let myDebtCount = 0; let owedToMe = 0; let owedToMeCount = 0;
    payments.forEach(p => {
        if (p.status !== 'open' && p.status !== 'pending_approval') return;
        const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);
        if (p.debtorId === currentUser.mode) { myDebt += amount; myDebtCount++; } else if (p.creditorId === currentUser.mode) { owedToMe += amount; owedToMeCount++; }
    });
    const mD = document.getElementById('dashboard-my-debt-display'); if (mD) mD.textContent = myDebt.toFixed(2) + " €";
    const mDD = document.getElementById('dashboard-my-debt-detail'); if (mDD) mDD.textContent = `in ${myDebtCount} offenen Posten`;
    const oD = document.getElementById('dashboard-owe-me-display'); if (oD) oD.textContent = owedToMe.toFixed(2) + " €";
    const oDD = document.getElementById('dashboard-owe-me-detail'); if (oDD) oDD.textContent = `aus ${owedToMeCount} offenen Posten`;
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

    setButtonLoading(document.getElementById(decision === 'credit' ? 'btn-op-credit' : 'btn-op-tip'), true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        // 1. Alte Schuld begleichen
        const transaction = { date: new Date(), amount: debtAmount, type: 'payment', user: currentUser.displayName };
        batch.update(doc(paymentsRef, paymentId), {
            remainingAmount: 0, status: 'paid',
            history: [...(p.history || []), { date: new Date(), action: 'paid_excess', user: currentUser.displayName, info: `Bezahlt mit Überzahlung (${payAmount.toFixed(2)}€).` }],
            transactions: [...(p.transactions || []), transaction]
        });

        // 2. Entscheidung
        if (decision === 'credit') {
            const creditDocRef = doc(paymentsRef);
            // NEU: Guthaben erstellen (Rollentausch!)
            batch.set(creditDocRef, {
                title: `Guthaben (aus "${p.title}")`,
                amount: excessAmount, remainingAmount: excessAmount, isTBD: false, type: 'credit', status: 'open',
                createdAt: serverTimestamp(), createdBy: currentUser.mode,
                debtorId: p.creditorId, debtorName: p.creditorName, creditorId: p.debtorId, creditorName: p.debtorName,
                involvedUserIds: p.involvedUserIds, history: [{ date: new Date(), action: 'created_credit', user: currentUser.displayName, info: `Guthaben aus Überzahlung.` }]
            });
            alertUser("Guthabenkonto angelegt!", "success");
        } else { 
            alertUser("Rest als Trinkgeld verbucht.", "success"); 
        }

        await batch.commit();
        document.getElementById('overpaymentModal').classList.add('hidden');
        document.getElementById('overpaymentModal').style.display = 'none';
        closeDetailModal();
        pendingOverpaymentData = null;
    } catch (e) { console.error(e); alertUser("Fehler: " + e.message, "error"); } 
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

// --- HELPER: DROPDOWN BEFÜLLEN (MIT GRUPPEN) ---
function fillPartnerSelect(selectElement, includeEmpty = true) {
    selectElement.innerHTML = '';
    if (includeEmpty) {
        selectElement.innerHTML = '<option value="">- Person auswählen -</option>';
    }

    // Gruppe 1: Registrierte Personen
    const grpUsers = document.createElement('optgroup');
    grpUsers.label = "[REGISTRIERTE PERSONEN]";
    let hasUsers = false;
    Object.values(USERS).forEach(user => {
        if (user.id !== currentUser.mode && user.isActive) {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.textContent = user.realName || user.name;
            grpUsers.appendChild(opt);
            hasUsers = true;
        }
    });
    if (hasUsers) selectElement.appendChild(grpUsers);

    // Gruppe 2: Eigene Kontakte
    const grpContacts = document.createElement('optgroup');
    grpContacts.label = "[EIGENE KONTAKTE]";
    let hasContacts = false;
    allContacts.forEach(contact => {
        const opt = document.createElement('option');
        opt.value = contact.id; // ID des Kontakt-Dokuments
        opt.textContent = contact.name;
        grpContacts.appendChild(opt);
        hasContacts = true;
    });
    if (hasContacts) selectElement.appendChild(grpContacts);
}

// --- TABS LOGIK ---
function openSettingsTab(tabName) {
    const tabs = ['templates', 'contacts', 'credits'];
    
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-zv-${t}`);
        const content = document.getElementById(`content-zv-${t}`);
        if (t === tabName) {
            btn.className = "px-4 py-2 font-bold text-indigo-600 border-b-2 border-indigo-600 whitespace-nowrap";
            content.classList.remove('hidden');
        } else {
            btn.className = "px-4 py-2 font-bold text-gray-500 hover:text-gray-700 whitespace-nowrap";
            content.classList.add('hidden');
        }
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
        div.className = "flex justify-between items-center p-2 bg-white rounded shadow-sm border";
        div.innerHTML = `
            <span class="font-bold text-gray-700 pl-2">${c.name}</span>
            <div class="flex gap-1">
                <button class="edit-contact-btn p-1 text-blue-400 hover:bg-blue-50 rounded" data-id="${c.id}">✏️</button>
                <button class="delete-contact-btn p-1 text-red-400 hover:bg-red-50 rounded" data-id="${c.id}">🗑️</button>
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

function renderCreditOverview() {
    const myCreditsList = document.getElementById('my-credits-list');
    const othersCreditsList = document.getElementById('others-credits-list');
    
    myCreditsList.innerHTML = '';
    othersCreditsList.innerHTML = '';

    const credits = allPayments.filter(p => p.type === 'credit' && p.status === 'open');

    // 1. Mein Guthaben
    const myCredits = credits.filter(p => p.creditorId === currentUser.mode);
    if (myCredits.length === 0) myCreditsList.innerHTML = '<p class="text-sm text-gray-400 italic">Leer.</p>';
    
    myCredits.forEach(p => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-purple-50 rounded border border-purple-100";
        div.innerHTML = `
            <div><p class="font-bold text-purple-900">${p.debtorName}</p><p class="text-xs text-gray-500">${p.title}</p></div>
            <div class="flex items-center gap-2"><span class="font-mono font-bold text-purple-700">${parseFloat(p.remainingAmount).toFixed(2)}€</span><button class="text-xs bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-50" onclick="openCreditModal('sub', 'my', '${p.id}')">Abbuchen</button></div>
        `;
        myCreditsList.appendChild(div);
    });

    // 2. Fremdes Guthaben
    const othersCredits = credits.filter(p => p.debtorId === currentUser.mode);
    if (othersCredits.length === 0) othersCreditsList.innerHTML = '<p class="text-sm text-gray-400 italic">Leer.</p>';
    
    othersCredits.forEach(p => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-2 bg-orange-50 rounded border border-orange-100";
        div.innerHTML = `
            <div><p class="font-bold text-orange-900">${p.creditorName}</p><p class="text-xs text-gray-500">${p.title}</p></div>
            <div class="flex items-center gap-2"><span class="font-mono font-bold text-orange-700">${parseFloat(p.remainingAmount).toFixed(2)}€</span><button class="text-xs bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-50" onclick="openCreditModal('sub', 'other', '${p.id}')">Auszahlen</button></div>
        `;
        othersCreditsList.appendChild(div);
    });
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

    // NEU: Dropdown mit Kontakten füllen
    fillPartnerSelect(select, false); // false = kein "- Wählen -" Platzhalter (optional)

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
                select.value = (context === 'my') ? p.debtorId : p.creditorId;
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
    const amount = parseFloat(document.getElementById('credit-amount').value);
    const reason = document.getElementById('credit-reason').value.trim();
    const paymentId = document.getElementById('creditManageModal').dataset.paymentId;

    if (!partnerId || isNaN(amount) || amount <= 0) { alertUser("Bitte Partner und Betrag wählen.", "error"); return; }
    if (!reason) { alertUser("Grund fehlt.", "error"); return; }

    const btn = document.getElementById('btn-save-credit');
    setButtonLoading(btn, true);

    try {
        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
        
        // Name auflösen (User oder Kontakt)
        let partnerName = "Unbekannt";
        if (USERS[partnerId]) partnerName = USERS[partnerId].realName || USERS[partnerId].name;
        else {
            const c = allContacts.find(c => c.id === partnerId);
            if (c) partnerName = c.name;
        }

        if (mode === 'add') {
            const docData = {
                title: reason, amount: amount, remainingAmount: amount, type: 'credit', status: 'open', isTBD: false,
                startDate: new Date().toISOString().split('T')[0], createdAt: serverTimestamp(), createdBy: currentUser.mode,
                involvedUserIds: [currentUser.mode, partnerId],
                history: [{ date: new Date(), action: 'created_manual_credit', user: currentUser.displayName, info: `Guthaben manuell angelegt.` }]
            };
            if (context === 'my') { docData.creditorId = currentUser.mode; docData.creditorName = currentUser.displayName; docData.debtorId = partnerId; docData.debtorName = partnerName; } 
            else { docData.creditorId = partnerId; docData.creditorName = partnerName; docData.debtorId = currentUser.mode; docData.debtorName = currentUser.displayName; }
            batch.set(doc(paymentsRef), docData);
            alertUser("Erfolgreich.", "success");
        } else {
            if (paymentId) {
                const p = allPayments.find(x => x.id === paymentId);
                if (p) {
                    const newRest = parseFloat(p.remainingAmount) - amount;
                    if (newRest < -0.01) throw new Error("Nicht genug Guthaben.");
                    const updateData = { remainingAmount: Math.max(0, newRest), history: [...(p.history || []), { date: new Date(), action: 'credit_used', user: currentUser.displayName, info: `Abgebucht: ${amount.toFixed(2)}€` }] };
                    if (newRest <= 0.001) updateData.status = 'paid';
                    batch.update(doc(paymentsRef, paymentId), updateData);
                    alertUser("Erfolgreich.", "success");
                }
            }
        }
        await batch.commit();
        document.getElementById('creditManageModal').style.display = 'none';
    } catch (e) { console.error(e); alertUser(e.message, "error"); } finally { setButtonLoading(btn, false); }
}