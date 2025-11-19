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

// Globale Variablen
let unsubscribePayments = null;
let allPayments = []; 
let currentDetailPaymentId = null;
let currentSplitMode = 'single'; // 'single' oder 'split'
let activeSettlementPartnerId = null; 

// Initialisierung
export function initializeZahlungsverwaltungView() {
    const view = document.getElementById('zahlungsverwaltungView');
    if (view && !view.dataset.listenerAttached) {
        setupEventListeners();
        view.dataset.listenerAttached = 'true';
    }

    if (currentUser.mode !== GUEST_MODE) {
        listenForPayments();
    } else {
        renderPaymentList([]);
    }
}

// Listener Setup
function setupEventListeners() {
    // Create / Modal
    document.getElementById('btn-create-new-payment')?.addEventListener('click', () => openCreateModal());
    document.getElementById('close-create-payment-modal')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-cancel-create-payment')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-save-payment')?.addEventListener('click', savePayment);

    // Modes & Toggles
    document.getElementById('mode-single')?.addEventListener('click', () => setCreateMode('single'));
    document.getElementById('mode-split')?.addEventListener('click', () => setCreateMode('split'));
    
    document.getElementById('btn-direction-i-owe')?.addEventListener('click', () => setDirection('i_owe'));
    document.getElementById('btn-direction-owes-me')?.addEventListener('click', () => setDirection('owes_me'));
    document.getElementById('btn-toggle-partner-manual')?.addEventListener('click', togglePartnerManual);

    // SPLIT: Gast hinzufügen
    document.getElementById('btn-add-split-manual')?.addEventListener('click', addSplitManualPartner);
    // Enter-Taste im Gast-Feld soll nicht speichern, sondern Gast hinzufügen
    document.getElementById('split-manual-name-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSplitManualPartner();
        }
    });

    document.getElementById('btn-toggle-advanced-payment')?.addEventListener('click', () => {
        document.getElementById('payment-advanced-options').classList.toggle('hidden');
    });

    // Split Calculation Logic
    document.getElementById('payment-amount')?.addEventListener('input', updateSplitPreview);
    document.getElementById('split-include-me')?.addEventListener('change', updateSplitPreview);

    // Filters
    document.getElementById('payment-search-input')?.addEventListener('input', applyFilters);
    document.getElementById('payment-filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('payment-filter-direction')?.addEventListener('change', applyFilters);

    // Details
    document.getElementById('btn-close-detail-modal')?.addEventListener('click', closeDetailModal);
    document.getElementById('btn-print-payment')?.addEventListener('click', () => window.print());

    // List Click Delegation
    const listContainer = document.getElementById('payments-list-container');
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.payment-card-item');
            if (card && card.dataset.id) openPaymentDetail(card.dataset.id);
        });
    }

    // SETTLEMENT
    document.getElementById('btn-open-settlement')?.addEventListener('click', openSettlementModal);
    document.getElementById('close-settlement-modal')?.addEventListener('click', closeSettlementModal);
    document.getElementById('btn-execute-settlement')?.addEventListener('click', executeSettlement);
}

// --- DATENBANK ---
function listenForPayments() {
    if (unsubscribePayments) unsubscribePayments();

    const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
    const q = query(paymentsRef, where('involvedUserIds', 'array-contains', currentUser.mode));

    unsubscribePayments = onSnapshot(q, (snapshot) => {
        allPayments = [];
        snapshot.forEach(doc => {
            allPayments.push({ id: doc.id, ...doc.data() });
        });
        
        applyFilters(); 
        
        if (currentDetailPaymentId) {
            const updatedP = allPayments.find(x => x.id === currentDetailPaymentId);
            if (updatedP) {
                 const createModal = document.getElementById('createPaymentModal');
                 if (!createModal || createModal.classList.contains('hidden')) {
                     openPaymentDetail(currentDetailPaymentId, true); 
                 }
            } else {
                closeDetailModal();
            }
        }
        
        const settlementModal = document.getElementById('settlementModal');
        if (settlementModal && !settlementModal.classList.contains('hidden')) {
            if (activeSettlementPartnerId) {
                selectSettlementPartner(activeSettlementPartnerId); 
            } else {
                openSettlementModal(); 
            }
        }

    }, (error) => {
        console.error("Fehler:", error);
    });
}

// --- CREATE & EDIT MODAL ---

function openCreateModal(paymentToEdit = null) {
    const modal = document.getElementById('createPaymentModal');
    if (!modal) return;
    
    const saveBtn = document.getElementById('btn-save-payment');
    const hiddenId = document.getElementById('edit-payment-id');

    // Reset Inputs
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
    document.getElementById('split-manual-name-input').value = ''; // Reset Gast Input

    // Partner Select füllen
    const select = document.getElementById('payment-partner-select');
    const splitList = document.getElementById('split-partner-list');
    
    let partnerOptions = `<option value="">- Person auswählen -</option>`;
    let splitCheckboxes = ``;

    Object.values(USERS).forEach(user => {
        if (user.id !== currentUser.mode && user.isActive) {
            const name = user.realName || user.name;
            partnerOptions += `<option value="${user.id}">${name}</option>`;
            splitCheckboxes += `
                <label class="flex items-center gap-2 p-1 hover:bg-gray-100 rounded cursor-pointer">
                    <input type="checkbox" class="split-partner-cb h-4 w-4" value="${user.id}" data-name="${name}">
                    <span class="text-gray-700 font-medium">${name}</span>
                </label>
            `;
        }
    });
    select.innerHTML = partnerOptions;
    splitList.innerHTML = splitCheckboxes;
    
    // Listener für Checkboxen (wichtig für Berechnung)
    document.querySelectorAll('.split-partner-cb').forEach(cb => {
        cb.addEventListener('change', updateSplitPreview);
    });

    if (paymentToEdit) {
        // --- EDIT MODE (Nur Einzel) ---
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
        document.getElementById('payment-deadline').value = paymentToEdit.deadline || '';
        document.getElementById('payment-invoice-nr').value = paymentToEdit.invoiceNr || '';
        document.getElementById('payment-order-nr').value = paymentToEdit.orderNr || '';
        document.getElementById('payment-notes').value = paymentToEdit.notes || '';
        document.getElementById('payment-type').value = paymentToEdit.type || 'debt';

        const iAmDebtor = paymentToEdit.debtorId === currentUser.mode;
        setDirection(iAmDebtor ? 'i_owe' : 'owes_me');

        const partnerId = iAmDebtor ? paymentToEdit.creditorId : paymentToEdit.debtorId;
        const partnerName = iAmDebtor ? paymentToEdit.creditorName : paymentToEdit.debtorName;
        
        const optionExists = select.querySelector(`option[value="${partnerId}"]`);
        if (optionExists) {
            select.value = partnerId;
            select.classList.remove('hidden');
            document.getElementById('payment-partner-name-manual').classList.add('hidden');
            document.getElementById('btn-toggle-partner-manual').textContent = "Manueller Name";
        } else {
            select.value = "";
            select.classList.add('hidden');
            const manualInput = document.getElementById('payment-partner-name-manual');
            manualInput.classList.remove('hidden');
            manualInput.value = partnerName;
            document.getElementById('btn-toggle-partner-manual').textContent = "Liste wählen";
        }
        
        if (paymentToEdit.invoiceNr || paymentToEdit.orderNr || paymentToEdit.notes || paymentToEdit.type === 'transfer') {
            document.getElementById('payment-advanced-options').classList.remove('hidden');
        }

    } else {
        // --- NEW MODE ---
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
    }
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function closeCreateModal() {
    document.getElementById('createPaymentModal').classList.add('hidden');
    document.getElementById('createPaymentModal').style.display = 'none';
}

// --- SPLIT LOGIK: Gast hinzufügen ---
function addSplitManualPartner() {
    const input = document.getElementById('split-manual-name-input');
    const name = input.value.trim();
    if (!name) return;

    const list = document.getElementById('split-partner-list');
    const id = 'MANUAL_' + Date.now(); // Temporäre ID für die UI-Logik

    const div = document.createElement('div');
    div.innerHTML = `
        <label class="flex items-center gap-2 p-1 hover:bg-gray-100 rounded cursor-pointer bg-yellow-50 border border-yellow-100">
            <input type="checkbox" class="split-partner-cb h-4 w-4" value="${id}" data-name="${name}" checked>
            <span class="text-gray-800 font-medium">${name} <span class="text-xs text-gray-500">(Gast)</span></span>
        </label>
    `;
    
    // Am Anfang einfügen
    list.insertBefore(div.firstElementChild, list.firstChild);
    input.value = '';
    
    // Listener für die neue Checkbox
    list.querySelector('.split-partner-cb').addEventListener('change', updateSplitPreview);
    
    updateSplitPreview(); // Update Berechnung
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
    if (input.classList.contains('hidden')) {
        select.classList.add('hidden'); input.classList.remove('hidden'); select.value = ""; btn.textContent = "Liste wählen";
    } else {
        input.classList.add('hidden'); select.classList.remove('hidden'); input.value = ""; btn.textContent = "Manueller Name";
    }
}

// --- SAVE FUNCTION ---

async function savePayment() {
    const saveBtn = document.getElementById('btn-save-payment');
    setButtonLoading(saveBtn, true);

    try {
        const editId = document.getElementById('edit-payment-id').value;
        const deadline = document.getElementById('payment-deadline').value;
        const title = document.getElementById('payment-title').value.trim();
        const invoiceNr = document.getElementById('payment-invoice-nr').value.trim();
        const orderNr = document.getElementById('payment-order-nr').value.trim();
        const notes = document.getElementById('payment-notes').value.trim();
        const type = document.getElementById('payment-type').value;

        if (!title) throw new Error("Bitte einen Grund/Betreff angeben.");

        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        if (currentSplitMode === 'single') {
            // --- SINGLE MODE ---
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
            let partnerName = partnerSelect ? (USERS[partnerSelect]?.realName || USERS[partnerSelect]?.name) : partnerManual;

            if (direction === 'i_owe') {
                debtorId = currentUser.mode; debtorName = currentUser.displayName;
                creditorId = partnerId; creditorName = partnerName;
            } else {
                creditorId = currentUser.mode; creditorName = currentUser.displayName;
                debtorId = partnerId; debtorName = partnerName;
            }

            const involvedUserIds = [currentUser.mode];
            if (partnerId) involvedUserIds.push(partnerId);

            const data = {
                title, isTBD, deadline: deadline || null, invoiceNr, orderNr, notes, type,
                debtorId, debtorName, creditorId, creditorName, involvedUserIds
            };

            if (editId) {
                const existing = allPayments.find(p => p.id === editId);
                let newRemaining = existing.remainingAmount;
                if (!isTBD && !existing.isTBD) {
                    newRemaining = parseFloat(existing.remainingAmount) + (amount - existing.amount);
                    if (newRemaining < 0) newRemaining = 0;
                } else if (!isTBD && existing.isTBD) newRemaining = amount;
                else if (isTBD) newRemaining = 0;

                data.amount = amount;
                data.remainingAmount = newRemaining;
                data.history = [...(existing.history || []), { date: new Date(), action: 'edited', user: currentUser.displayName, info: 'Bearbeitet.' }];
                
                batch.update(doc(paymentsRef, editId), data);
            } else {
                data.amount = amount;
                data.remainingAmount = amount;
                data.status = 'open';
                data.createdAt = serverTimestamp();
                data.createdBy = currentUser.mode;
                data.history = [{ date: new Date(), action: 'created', user: currentUser.displayName, info: `Erstellt: ${isTBD?'TBD':amount+'€'}` }];
                
                batch.set(doc(paymentsRef), data);
            }

        } else {
            // --- SPLIT MODE ---
            if (editId) throw new Error("Split-Einträge können nicht als Gruppe bearbeitet werden.");
            
            const totalAmount = parseFloat(document.getElementById('payment-amount').value);
            if (isNaN(totalAmount) || totalAmount <= 0) throw new Error("Bitte Gesamtbetrag angeben.");

            const selectedCheckboxes = document.querySelectorAll('.split-partner-cb:checked');
            if (selectedCheckboxes.length === 0) throw new Error("Bitte mindestens eine Person auswählen.");

            const includeMe = document.getElementById('split-include-me').checked;
            const count = selectedCheckboxes.length + (includeMe ? 1 : 0);
            const share = totalAmount / count;

            // Split-Einträge erstellen
            selectedCheckboxes.forEach(cb => {
                let pId = cb.value; // ID oder MANUAL_XYZ
                const pName = cb.dataset.name;
                let involved = [currentUser.mode];
                
                // Wenn es ein manueller Gast ist, ist ID null
                if (pId.startsWith('MANUAL_')) {
                    pId = null;
                } else {
                    involved.push(pId);
                }
                
                const docRef = doc(paymentsRef);
                
                const entryData = {
                    title: `${title} (Split)`,
                    amount: share,
                    remainingAmount: share,
                    isTBD: false,
                    deadline: deadline || null,
                    invoiceNr, orderNr, notes, type,
                    status: 'open',
                    createdAt: serverTimestamp(),
                    createdBy: currentUser.mode,
                    
                    // Ich bin Gläubiger (ich hab bezahlt)
                    creditorId: currentUser.mode,
                    creditorName: currentUser.displayName,
                    debtorId: pId, // Null für Gast
                    debtorName: pName,
                    involvedUserIds: involved,
                    
                    history: [{
                        date: new Date(),
                        action: 'created_split',
                        user: currentUser.displayName,
                        info: `Split-Anteil von ${share.toFixed(2)}€ (Gesamt: ${totalAmount.toFixed(2)}€)`
                    }]
                };
                batch.set(docRef, entryData);
            });
        }

        await batch.commit();
        alertUser("Gespeichert!", "success");
        closeCreateModal();

    } catch (error) {
        console.error("Fehler:", error);
        alertUser(error.message, "error");
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

// --- SETTLEMENT ---

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

// Helpers
window.editPayment = function(id) { const p = allPayments.find(x => x.id === id); if (p) { closeDetailModal(); openCreateModal(p); } }
window.deletePayment = async function(id) { if(!confirm("Löschen?")) return; try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', id)); alertUser("Gelöscht.", "success"); closeDetailModal(); } catch(e) { console.error(e); } }
window.openPaymentDetail = function(id, r=false) { 
    const p = allPayments.find(x=>x.id===id); if(!p) return; 
    currentDetailPaymentId=id; 
    renderDetailContent(p, r);
};

function renderDetailContent(p, isRefresh) {
    const modal = document.getElementById('paymentDetailModal');
    const content = document.getElementById('payment-detail-content');
    const actions = document.getElementById('payment-detail-actions');
    const partialForm = document.getElementById('partial-payment-form');
    
    if(!modal || !content || !actions) return;

    const iAmDebtor = p.debtorId === currentUser.mode;
    const iAmCreditor = p.creditorId === currentUser.mode;
    const iAmCreator = p.createdBy === currentUser.mode;

    let editControls = '';
    if (iAmCreator) {
        editControls = `
        <div class="flex justify-end gap-2 mb-4 no-print border-b pb-2">
            <button onclick="editPayment('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-sm font-bold">Bearbeiten</button>
            <button onclick="deletePayment('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-bold">Löschen</button>
        </div>`;
    }

    let historyHtml = (p.history || []).map(h => {
        const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
        return `<div class="text-xs text-gray-600 border-l-2 border-gray-300 pl-2 mb-2"><span class="font-bold">${d.toLocaleDateString()} ${d.toLocaleTimeString()}</span> - ${h.user}: ${h.info}</div>`;
    }).join('');

    content.innerHTML = `
        ${editControls}
        <h2 class="text-2xl font-bold text-gray-800 mb-1">${p.title}</h2>
        <div class="flex gap-2 mb-4"><span class="px-2 py-1 bg-gray-200 rounded text-xs">ID: ${p.id.substring(0,6)}...</span>${p.invoiceNr ? `<span class="px-2 py-1 bg-blue-100 rounded text-xs">Rechnung: ${p.invoiceNr}</span>` : ''}</div>
        <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div><p class="text-xs font-bold text-gray-500 uppercase">Schuldner</p><p class="text-lg font-semibold text-gray-900">${p.debtorName}</p></div>
            <div class="text-right"><p class="text-xs font-bold text-gray-500 uppercase">Gläubiger</p><p class="text-lg font-semibold text-gray-900">${p.creditorName}</p></div>
        </div>
        <div class="mb-6 text-center">
            <p class="text-sm text-gray-500">Offener Betrag</p>
            <p class="text-4xl font-extrabold text-gray-800">${p.isTBD ? 'TBD' : parseFloat(p.remainingAmount).toFixed(2) + ' €'}</p>
            ${!p.isTBD && p.amount > p.remainingAmount ? `<p class="text-xs text-green-600">Von ursprünglich ${p.amount.toFixed(2)} €</p>` : ''}
        </div>
        ${p.notes ? `<div class="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700"><strong>Notiz:</strong><br>${p.notes}</div>` : ''}
        <h4 class="font-bold text-gray-700 mb-2 border-b pb-1">Verlauf</h4>
        <div class="mb-4">${historyHtml}</div>
    `;

    actions.innerHTML = '';
    if (partialForm) partialForm.classList.add('hidden');

    if (p.status === 'open' || p.status === 'pending_approval') {
        if (iAmDebtor && p.status === 'open') {
            actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'mark_paid')" class="py-2 px-4 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">Als bezahlt melden</button>`;
            actions.innerHTML += `<button onclick="showPartialForm()" class="py-2 px-4 bg-blue-100 text-blue-800 font-bold rounded hover:bg-blue-200">Teilzahlung</button>`;
        }
        if (iAmCreditor) {
            if (p.status === 'pending_approval') {
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'confirm_payment')" class="py-2 px-4 bg-green-600 text-white font-bold rounded hover:bg-green-700">Bestätigen</button>`;
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'reject_payment')" class="py-2 px-4 bg-red-100 text-red-600 font-bold rounded hover:bg-red-200">Ablehnen</button>`;
            } else {
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'force_close')" class="py-2 px-4 bg-green-600 text-white font-bold rounded hover:bg-green-700">Als erledigt markieren</button>`;
                actions.innerHTML += `<button onclick="showPartialForm()" class="py-2 px-4 bg-blue-100 text-blue-800 font-bold rounded hover:bg-blue-200">Teilzahlung buchen</button>`;
            }
        }
    }

    window.showPartialForm = function() { if (partialForm) partialForm.classList.remove('hidden'); }
    
    const submitPartialBtn = document.getElementById('btn-submit-partial');
    if (submitPartialBtn) {
        const newBtn = submitPartialBtn.cloneNode(true);
        submitPartialBtn.parentNode.replaceChild(newBtn, submitPartialBtn);
        newBtn.onclick = () => {
            const amt = parseFloat(document.getElementById('partial-amount-input').value);
            if (amt > 0) handlePaymentAction(p.id, 'partial_pay', amt);
        };
    }

    if (!isRefresh) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

function closeDetailModal() {
    const modal = document.getElementById('paymentDetailModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    currentDetailPaymentId = null;
}

// Helper for applyFilters & renderPaymentList
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

    payments.forEach(p => {
        const iAmDebtor = p.debtorId === currentUser.mode;
        const partnerName = iAmDebtor ? p.creditorName : p.debtorName;
        const prefix = iAmDebtor ? "Ich schulde an" : "Schuldet mir";
        const colorClass = iAmDebtor ? "text-red-600" : "text-emerald-600";
        const bgClass = iAmDebtor ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200";
        let statusBadge = '';
        if (p.status === 'open') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-800">Offen</span>`;
        else if (p.status === 'pending_approval') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-yellow-100 text-yellow-800">Wartet</span>`;
        else if (p.status === 'paid') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-800">Bezahlt</span>`;
        else if (p.status === 'cancelled') statusBadge = `<span class="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-600">Storniert</span>`;

        const html = `
        <div class="payment-card-item card p-4 rounded-xl border ${bgClass} shadow-sm hover:shadow-md transition cursor-pointer flex justify-between items-center" data-id="${p.id}">
            <div class="flex-grow">
                <div class="flex justify-between items-start"><h4 class="font-bold text-gray-800">${p.title}</h4>${statusBadge}</div>
                <p class="text-xs text-gray-500 mt-1">${prefix} <strong>${partnerName}</strong></p>
                <div class="mt-2 flex items-center gap-2"><span class="text-xl font-extrabold ${colorClass}">${p.isTBD ? 'TBD' : parseFloat(p.remainingAmount).toFixed(2) + ' €'}</span></div>
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
    const mD = document.getElementById('dashboard-my-debt-display'); if(mD) mD.textContent = myDebt.toFixed(2) + " €";
    const mDD = document.getElementById('dashboard-my-debt-detail'); if(mDD) mDD.textContent = `in ${myDebtCount} offenen Posten`;
    const oD = document.getElementById('dashboard-owe-me-display'); if(oD) oD.textContent = owedToMe.toFixed(2) + " €";
    const oDD = document.getElementById('dashboard-owe-me-detail'); if(oDD) oDD.textContent = `aus ${owedToMeCount} offenen Posten`;
}

window.handlePaymentAction = async function(id, action, amount = 0) {
    const p = allPayments.find(x => x.id === id); if (!p) return;
    let updateData = {}; let logEntry = ""; let newStatus = p.status;

    if (action === 'mark_paid') { newStatus = 'pending_approval'; logEntry = "Als bezahlt markiert."; } 
    else if (action === 'confirm_payment' || action === 'force_close') { newStatus = 'paid'; updateData.remainingAmount = 0; logEntry = "Abgeschlossen."; }
    else if (action === 'reject_payment') { newStatus = 'open'; logEntry = "Abgelehnt."; }
    else if (action === 'partial_pay') {
        const newRemaining = p.remainingAmount - amount; updateData.remainingAmount = newRemaining < 0 ? 0 : newRemaining;
        if (newRemaining <= 0) newStatus = 'paid'; logEntry = `Teilzahlung ${amount.toFixed(2)}€.`;
    }
    updateData.status = newStatus;
    updateData.history = [...(p.history || []), { date: new Date(), action, user: currentUser.displayName, info: logEntry }];

    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', id), updateData); alertUser("Status aktualisiert.", "success"); if (action !== 'partial_pay' && action !== 'mark_paid') closeDetailModal(); } 
    catch (e) { console.error(e); alertUser("Fehler: " + e.message, "error"); }
}