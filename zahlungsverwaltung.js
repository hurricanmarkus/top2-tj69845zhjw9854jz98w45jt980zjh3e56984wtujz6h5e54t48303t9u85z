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
let allPayments = [];
let currentDetailPaymentId = null;
let currentSplitMode = 'single'; // 'single' oder 'split'
let activeSettlementPartnerId = null;

// Multi-Select Variablen (für Zusammenfassen)
let isSelectionMode = false;
let selectedPaymentIds = new Set();

// --- INITIALISIERUNG ---
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

// --- EVENT LISTENER SETUP ---
function setupEventListeners() {
    // Create / Modal Buttons
    document.getElementById('btn-create-new-payment')?.addEventListener('click', () => openCreateModal());
    document.getElementById('close-create-payment-modal')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-cancel-create-payment')?.addEventListener('click', closeCreateModal);
    document.getElementById('btn-save-payment')?.addEventListener('click', savePayment);

    // Modes & Toggles (Erstellen)
    document.getElementById('mode-single')?.addEventListener('click', () => setCreateMode('single'));
    document.getElementById('mode-split')?.addEventListener('click', () => setCreateMode('split'));

    document.getElementById('btn-direction-i-owe')?.addEventListener('click', () => setDirection('i_owe'));
    document.getElementById('btn-direction-owes-me')?.addEventListener('click', () => setDirection('owes_me'));
    document.getElementById('btn-toggle-partner-manual')?.addEventListener('click', togglePartnerManual);

    // SPLIT: Gast hinzufügen (im Erstellen-Modal)
    document.getElementById('btn-add-split-manual')?.addEventListener('click', addSplitManualPartner);
    document.getElementById('split-manual-name-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSplitManualPartner();
        }
    });

    // Advanced Options & Ratenzahlung Toggle
    document.getElementById('btn-toggle-advanced-payment')?.addEventListener('click', () => {
        document.getElementById('payment-advanced-options').classList.toggle('hidden');
    });
    document.getElementById('payment-is-installment')?.addEventListener('change', (e) => {
        const opts = document.getElementById('installment-options');
        if (e.target.checked) {
            opts.classList.remove('hidden');
        } else {
            opts.classList.add('hidden');
        }
    });

    // Split Calculation Logic (Live-Berechnung)
    document.getElementById('payment-amount')?.addEventListener('input', updateSplitPreview);
    document.getElementById('split-include-me')?.addEventListener('change', updateSplitPreview);

    // Filter & Suche
    document.getElementById('payment-search-input')?.addEventListener('input', applyFilters);
    document.getElementById('payment-filter-status')?.addEventListener('change', applyFilters);
    document.getElementById('payment-filter-direction')?.addEventListener('change', applyFilters);

    // Details Modal
    document.getElementById('btn-close-detail-modal')?.addEventListener('click', closeDetailModal);
    document.getElementById('btn-print-payment')?.addEventListener('click', () => window.print());

    // Klick auf Liste (Delegation für Details & Auswahl)
    const listContainer = document.getElementById('payments-list-container');
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            // Fall 1: Checkbox Klick (Selection Mode)
            if (e.target.classList.contains('payment-select-cb')) {
                e.stopPropagation();
                togglePaymentSelection(e.target.value, e.target.checked);
                return;
            }

            // Fall 2: Karte Klick (Detail öffnen oder Auswählen)
            const card = e.target.closest('.payment-card-item');
            if (card && card.dataset.id) {
                if (isSelectionMode) {
                    // Im Auswahlmodus: Klick auf Karte toggelt Checkbox
                    const cb = card.querySelector('.payment-select-cb');
                    if (cb) {
                        cb.checked = !cb.checked;
                        togglePaymentSelection(card.dataset.id, cb.checked);
                    }
                } else {
                    // Normaler Modus: Detail öffnen
                    openPaymentDetail(card.dataset.id);
                }
            }
        });
    }

    // SETTLEMENT (Bilanz)
    document.getElementById('btn-open-settlement')?.addEventListener('click', openSettlementModal);
    document.getElementById('close-settlement-modal')?.addEventListener('click', closeSettlementModal);
    document.getElementById('btn-execute-settlement')?.addEventListener('click', executeSettlement);

    // MERGE (Zusammenfassen)
    document.getElementById('btn-toggle-selection-mode')?.addEventListener('click', toggleSelectionMode);
    document.getElementById('btn-execute-merge')?.addEventListener('click', executeMerge);

    // SPLIT EXISTING (Aufsplitten eines Eintrags)
    document.getElementById('btn-cancel-split')?.addEventListener('click', () => {
        document.getElementById('splitEntryModal').classList.add('hidden');
        document.getElementById('splitEntryModal').style.display = 'none';
    });
    document.getElementById('btn-confirm-split')?.addEventListener('click', executeSplitEntry);

    // NEU: ADJUST AMOUNT (Betrag anpassen)
    document.getElementById('close-adjust-modal')?.addEventListener('click', closeAdjustAmountModal);
    document.getElementById('btn-cancel-adjust')?.addEventListener('click', closeAdjustAmountModal);
    document.getElementById('btn-save-adjust')?.addEventListener('click', executeAdjustAmount);
}

// --- DATENBANK LISTENER ---
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

        // Live-Update für offenes Detail-Fenster
        if (currentDetailPaymentId) {
            const updatedP = allPayments.find(x => x.id === currentDetailPaymentId);
            if (updatedP) {
                const createModal = document.getElementById('createPaymentModal');
                // Nur aktualisieren, wenn wir nicht gerade im Bearbeiten-Modus sind
                if (!createModal || createModal.classList.contains('hidden')) {
                    openPaymentDetail(currentDetailPaymentId, true);
                }
            } else {
                closeDetailModal();
            }
        }

        // Live-Update für Bilanz-Fenster
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
let currentAdjustId = null;

window.openAdjustAmountModal = function(id) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    currentAdjustId = id;
    const modal = document.getElementById('adjustAmountModal');
    
    document.getElementById('adjust-current-amount-display').textContent = parseFloat(p.remainingAmount).toFixed(2) + " €";
    document.getElementById('adjust-new-amount').value = parseFloat(p.remainingAmount).toFixed(2); // Standardwert = aktueller Wert
    document.getElementById('adjust-reason').value = 'correction';
    document.getElementById('adjust-note').value = '';

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    
    // Detail-Modal kurz schließen/verstecken, damit Fokus klar ist (optional, hier lassen wir es offen im Hintergrund)
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
        const reasonText = reasonTexts[reason] || 'Anpassung';
        const logInfo = `${reasonText}: Von ${oldAmount.toFixed(2)}€ auf ${newAmountVal.toFixed(2)}€ gesetzt. ${note ? `(${note})` : ''}`;

        await updateDoc(paymentRef, {
            remainingAmount: newAmountVal,
            // Falls es eine Korrektur ist, passen wir vielleicht auch den Ursprungsbetrag 'amount' an? 
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
        // Detailansicht aktualisiert sich automatisch durch den Snapshot Listener

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

    const saveBtn = document.getElementById('btn-save-payment');
    const hiddenId = document.getElementById('edit-payment-id');

    // Reset aller Felder
    document.getElementById('payment-start-date').value = new Date().toISOString().split('T')[0]; // Standard: Heute
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

    // Ratenzahlung Reset
    document.getElementById('payment-is-installment').checked = false;
    document.getElementById('installment-options').classList.add('hidden');
    document.getElementById('payment-installments-total').value = '';

    // Partner Select neu befüllen (User Liste + Split Checkboxen)
    const select = document.getElementById('payment-partner-select');
    const splitList = document.getElementById('split-partner-list');

    let partnerOptions = `<option value="">- Person auswählen -</option>`;
    let splitCheckboxes = ``;

    Object.values(USERS).forEach(user => {
        if (user.id !== currentUser.mode && user.isActive) {
            const name = user.realName || user.name;
            partnerOptions += `<option value="${user.id}">${name}</option>`;
            splitCheckboxes += `
                <div class="p-1 hover:bg-gray-100 rounded">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" class="split-partner-cb h-4 w-4" value="${user.id}" data-name="${name}">
                        <span class="text-gray-700 font-medium">${name}</span>
                    </label>
                </div>
            `;
        }
    });
    select.innerHTML = partnerOptions;
    splitList.innerHTML = splitCheckboxes;

    // Checkbox-Listener anhängen
    document.querySelectorAll('.split-partner-cb').forEach(cb => {
        cb.addEventListener('change', updateSplitPreview);
    });

    if (paymentToEdit) {
        // --- EDIT MODE (Nur Einzel-Modus erlaubt) ---
        
        // Ratenzahlung laden
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
        
        // Datumswerte setzen
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

// --- SPLIT MANUELL: Gast hinzufügen / bearbeiten / löschen ---
function addSplitManualPartner() {
    const input = document.getElementById('split-manual-name-input');
    const name = input.value.trim();
    if (!name) return;

    const list = document.getElementById('split-partner-list');
    const id = 'MANUAL_' + Date.now();

    const div = document.createElement('div');
    div.className = "flex items-center justify-between p-1 mb-1 hover:bg-gray-100 rounded bg-yellow-50 border border-yellow-100";
    div.innerHTML = `
        <label class="flex items-center gap-2 cursor-pointer flex-grow">
            <input type="checkbox" class="split-partner-cb h-4 w-4" value="${id}" data-name="${name}" checked>
            <span class="text-gray-800 font-medium partner-name-display">${name} <span class="text-xs text-gray-500">(Gast)</span></span>
        </label>
        <div class="flex gap-1">
            <button type="button" class="edit-guest-btn p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded" title="Umbenennen">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /></svg>
            </button>
            <button type="button" class="delete-guest-btn p-1 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded" title="Entfernen">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>
            </button>
        </div>
    `;

    // Am Anfang einfügen
    list.insertBefore(div, list.firstChild);
    input.value = '';

    // Listener für die neue Checkbox
    const checkbox = div.querySelector('.split-partner-cb');
    checkbox.addEventListener('change', updateSplitPreview);

    // Listener für Löschen
    div.querySelector('.delete-guest-btn').addEventListener('click', () => {
        div.remove();
        updateSplitPreview();
    });

    // Listener für Umbenennen
    div.querySelector('.edit-guest-btn').addEventListener('click', () => {
        const currentName = checkbox.dataset.name;
        const newName = prompt("Namen ändern:", currentName);
        if (newName && newName.trim() !== "") {
            const cleanName = newName.trim();
            checkbox.dataset.name = cleanName;
            div.querySelector('.partner-name-display').innerHTML = `${cleanName} <span class="text-xs text-gray-500">(Gast)</span>`;
        }
    });

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
    if (input.classList.contains('hidden')) {
        select.classList.add('hidden');
        input.classList.remove('hidden');
        select.value = "";
        btn.textContent = "Liste wählen";
    } else {
        input.classList.add('hidden');
        select.classList.remove('hidden');
        input.value = "";
        btn.textContent = "Manueller Name";
    }
}

async function savePayment() {
    const saveBtn = document.getElementById('btn-save-payment');
    setButtonLoading(saveBtn, true);

    try {
        const editId = document.getElementById('edit-payment-id').value;
        const startDate = document.getElementById('payment-start-date').value; // NEU
        const deadline = document.getElementById('payment-deadline').value;
        const title = document.getElementById('payment-title').value.trim();
        const invoiceNr = document.getElementById('payment-invoice-nr').value.trim();
        const orderNr = document.getElementById('payment-order-nr').value.trim();
        const notes = document.getElementById('payment-notes').value.trim();
        const type = document.getElementById('payment-type').value;

        // Installment Data
        const isInstallment = document.getElementById('payment-is-installment').checked;
        let installmentData = null;
        if (isInstallment) {
            installmentData = {
                total: parseInt(document.getElementById('payment-installments-total').value) || 0,
                interval: document.getElementById('payment-installment-interval').value
            };
        }

        if (!title) throw new Error("Bitte einen Grund/Betreff angeben.");
        if (!startDate) throw new Error("Bitte ein Buchungsdatum (Start) angeben."); // NEU

        const batch = writeBatch(db);
        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        if (currentSplitMode === 'single') {
            // --- SINGLE ---
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
                title, isTBD, 
                startDate: startDate || null, // NEU
                deadline: deadline || null, 
                invoiceNr, orderNr, notes, type,
                debtorId, debtorName, creditorId, creditorName, involvedUserIds,
                installment: installmentData
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
                data.history = [{ date: new Date(), action: 'created', user: currentUser.displayName, info: `Erstellt: ${isTBD ? 'TBD' : amount + '€'}` }];

                batch.set(doc(paymentsRef), data);
            }

        } else {
            // --- SPLIT ---
            if (editId) throw new Error("Split-Einträge können nicht als Gruppe bearbeitet werden.");

            const totalAmount = parseFloat(document.getElementById('payment-amount').value);
            if (isNaN(totalAmount) || totalAmount <= 0) throw new Error("Bitte Gesamtbetrag angeben.");

            const selectedCheckboxes = document.querySelectorAll('.split-partner-cb:checked');
            if (selectedCheckboxes.length === 0) throw new Error("Bitte mindestens eine Person auswählen.");

            const includeMe = document.getElementById('split-include-me').checked;
            const count = selectedCheckboxes.length + (includeMe ? 1 : 0);
            const share = totalAmount / count;

            selectedCheckboxes.forEach(cb => {
                let pId = cb.value;
                const pName = cb.dataset.name;
                let involved = [currentUser.mode];

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
                    startDate: startDate || null, // NEU
                    deadline: deadline || null,
                    invoiceNr, orderNr, notes, type,
                    status: 'open',
                    createdAt: serverTimestamp(),
                    createdBy: currentUser.mode,
                    creditorId: currentUser.mode,
                    creditorName: currentUser.displayName,
                    debtorId: pId,
                    debtorName: pName,
                    involvedUserIds: involved,
                    installment: installmentData,
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

    if (!modal || !content || !actions) return;

    const iAmDebtor = p.debtorId === currentUser.mode;
    const iAmCreditor = p.creditorId === currentUser.mode;
    const iAmCreator = p.createdBy === currentUser.mode;

    // Short ID generieren (die letzten 4 Zeichen)
    const shortId = p.id.slice(-4).toUpperCase();

    let editControls = '';
    // Ersteller darf bearbeiten/löschen
    if (iAmCreator) {
        editControls = `
        <div class="flex justify-end gap-2 mb-4 no-print border-b pb-2 flex-wrap">
             <button onclick="openAdjustAmountModal('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm font-bold">
                € Anpassen
            </button>
            <button onclick="openSplitModal('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm font-bold">
                Aufteilen
            </button>
            <button onclick="editPayment('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-sm font-bold">
                Bearbeiten
            </button>
            <button onclick="deletePayment('${p.id}')" class="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-bold">
                Löschen
            </button>
        </div>`;
    }

    // Raten-Info anzeigen
    let installmentInfo = '';
    if (p.installment && p.installment.total > 0) {
        const paidAmount = p.amount - p.remainingAmount;
        const rateApprox = p.amount / p.installment.total;
        const ratesPaid = Math.floor(paidAmount / rateApprox);

        installmentInfo = `
            <div class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p class="text-xs font-bold text-indigo-600 uppercase mb-1">Ratenplan (${p.installment.interval === 'monthly' ? 'Monatlich' : 'Wöchentlich'})</p>
                <div class="flex justify-between items-end">
                    <div>
                        <span class="text-xl font-bold text-gray-800">${ratesPaid} / ${p.installment.total}</span>
                        <span class="text-xs text-gray-500">Raten bezahlt</span>
                    </div>
                    <div class="text-right">
                        <span class="text-sm font-semibold text-gray-700">~${rateApprox.toFixed(2)} €</span>
                        <span class="text-xs text-gray-500 block">pro Rate</span>
                    </div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div class="bg-indigo-600 h-2.5 rounded-full" style="width: ${(ratesPaid / p.installment.total) * 100}%"></div>
                </div>
            </div>
        `;
    }

    let historyHtml = (p.history || []).map(h => {
        const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
        return `<div class="text-xs text-gray-600 border-l-2 border-gray-300 pl-2 mb-2"><span class="font-bold">${d.toLocaleDateString()} ${d.toLocaleTimeString()}</span> - ${h.user}: ${h.info}</div>`;
    }).join('');

    content.innerHTML = `
        ${editControls}
        <h2 class="text-2xl font-bold text-gray-800 mb-1 leading-tight">${p.title}</h2>
        
        <div class="flex flex-wrap gap-2 mb-4 mt-2">
            <span class="px-2 py-1 bg-gray-800 text-white rounded text-xs font-mono tracking-wider">#${shortId}</span>
            ${p.invoiceNr ? `<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">Rechnung: ${p.invoiceNr}</span>` : ''}
            ${p.startDate ? `<span class="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">Start: ${new Date(p.startDate).toLocaleDateString()}</span>` : ''}
        </div>
        
        <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg border">
            <div><p class="text-xs font-bold text-gray-500 uppercase">Schuldner</p><p class="text-lg font-semibold text-gray-900 break-words">${p.debtorName}</p></div>
            <div class="text-right"><p class="text-xs font-bold text-gray-500 uppercase">Gläubiger</p><p class="text-lg font-semibold text-gray-900 break-words">${p.creditorName}</p></div>
        </div>

        ${installmentInfo}

        <div class="mb-6 text-center p-4 border-2 border-dashed border-gray-200 rounded-xl">
            <p class="text-sm text-gray-500 uppercase font-bold tracking-wide">Offener Betrag</p>
            <p class="text-5xl font-extrabold text-gray-800 mt-1">${p.isTBD ? 'TBD' : parseFloat(p.remainingAmount).toFixed(2) + ' €'}</p>
            ${!p.isTBD && p.amount > p.remainingAmount ? `<p class="text-xs text-green-600 font-semibold mt-1">Ursprünglich: ${p.amount.toFixed(2)} €</p>` : ''}
        </div>
        
        ${p.notes ? `<div class="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700"><strong>Notiz:</strong><br>${p.notes}</div>` : ''}
        
        <h4 class="font-bold text-gray-700 mb-2 border-b pb-1 mt-8">Verlauf</h4>
        <div class="mb-4 max-h-40 overflow-y-auto">${historyHtml}</div>
    `;

    actions.innerHTML = '';
    if (partialForm) partialForm.classList.add('hidden');

    // ACTION BUTTONS LOGIK
    if (p.status === 'open' || p.status === 'pending_approval') {
        
        // Wenn ICH der Schuldner bin (und es offen ist) -> Ich kann bezahlen
        if (iAmDebtor && p.status === 'open') {
            actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'mark_paid')" class="py-3 px-6 bg-blue-600 text-white font-bold rounded-lg shadow hover:bg-blue-700 w-full sm:w-auto">✅ Als bezahlt melden</button>`;
            actions.innerHTML += `<button onclick="showPartialForm()" class="py-3 px-6 bg-blue-100 text-blue-800 font-bold rounded-lg hover:bg-blue-200 w-full sm:w-auto">Teilzahlung</button>`;
        }
        
        // Wenn ICH der Gläubiger bin
        if (iAmCreditor) {
            if (p.status === 'pending_approval') {
                // Bestätigen oder Ablehnen
                actions.innerHTML += `<div class="w-full bg-yellow-50 border border-yellow-200 p-3 rounded-lg mb-2 text-center text-sm text-yellow-800 font-semibold">Der Schuldner hat gemeldet, dass bezahlt wurde. Bitte bestätigen.</div>`;
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'confirm_payment')" class="py-3 px-6 bg-green-600 text-white font-bold rounded-lg shadow hover:bg-green-700 flex-grow">Geld erhalten (Bestätigen)</button>`;
                actions.innerHTML += `<button onclick="handlePaymentAction('${p.id}', 'reject_payment')" class="py-3 px-6 bg-red-100 text-red-600 font-bold rounded-lg hover:bg-red-200 flex-grow">Nicht erhalten (Ablehnen)</button>`;
            } else {
                // Normal offen -> Ich kann es manuell schließen oder Teilzahlung buchen
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

window.handlePaymentAction = async function (id, action, amount = 0) {
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
};

// --- ADJUST AMOUNT LOGIK (Betrag anpassen) ---
// Globale Variable für aktuelle Bearbeitungs-ID
let currentAdjustId = null; 

window.openAdjustAmountModal = function(id) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    currentAdjustId = id;
    const modal = document.getElementById('adjustAmountModal');
    
    document.getElementById('adjust-current-amount-display').textContent = parseFloat(p.remainingAmount).toFixed(2) + " €";
    document.getElementById('adjust-new-amount').value = parseFloat(p.remainingAmount).toFixed(2); // Standardwert = aktueller Wert
    document.getElementById('adjust-reason').value = 'correction';
    document.getElementById('adjust-note').value = '';

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
        const reasonText = reasonTexts[reason] || 'Anpassung';
        const logInfo = `${reasonText}: Von ${oldAmount.toFixed(2)}€ auf ${newAmountVal.toFixed(2)}€ gesetzt. ${note ? `(${note})` : ''}`;

        await updateDoc(paymentRef, {
            remainingAmount: newAmountVal,
            // Falls es eine Korrektur ist, passen wir vielleicht auch den Ursprungsbetrag 'amount' an? 
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
        // Detailansicht aktualisiert sich automatisch durch den Snapshot Listener

    } catch (e) {
        console.error(e);
        alertUser("Fehler: " + e.message, "error");
    } finally {
        setButtonLoading(btn, false);
    }
}