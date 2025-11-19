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
    orderBy,
    serverTimestamp,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Globale Variablen für diesen Modul
let unsubscribePayments = null;
let allPayments = []; // Cache für alle Zahlungen
let currentDetailPaymentId = null; // Welche Zahlung ist gerade im Detail offen?

// Initialisierung
export function initializeZahlungsverwaltungView() {
    // Event Listeners nur einmal hinzufügen
    const view = document.getElementById('zahlungsverwaltungView');
    if (view && !view.dataset.listenerAttached) {
        setupEventListeners();
        view.dataset.listenerAttached = 'true';
    }

    // Daten laden, wenn User eingeloggt
    if (currentUser.mode !== GUEST_MODE) {
        listenForPayments();
    } else {
        renderPaymentList([]); // Leere Liste für Gäste
    }
}

// Listener Setup
function setupEventListeners() {
    // 1. Button "Neuer Eintrag"
    const createBtn = document.getElementById('btn-create-new-payment');
    if (createBtn) createBtn.addEventListener('click', () => openCreateModal()); // Kein Argument = Neu

    // 2. Modal schließen
    const closeCreateBtn = document.getElementById('close-create-payment-modal');
    if (closeCreateBtn) closeCreateBtn.addEventListener('click', closeCreateModal);
    
    const cancelCreateBtn = document.getElementById('btn-cancel-create-payment');
    if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', closeCreateModal);

    // 3. Speichern
    const saveBtn = document.getElementById('btn-save-payment');
    if (saveBtn) saveBtn.addEventListener('click', savePayment);

    // 4. Richtung umschalten
    const dirIBtn = document.getElementById('btn-direction-i-owe');
    if (dirIBtn) dirIBtn.addEventListener('click', () => setDirection('i_owe'));
    
    const dirMeBtn = document.getElementById('btn-direction-owes-me');
    if (dirMeBtn) dirMeBtn.addEventListener('click', () => setDirection('owes_me'));

    // 5. Manueller Partner Toggle
    const togglePartnerBtn = document.getElementById('btn-toggle-partner-manual');
    if (togglePartnerBtn) togglePartnerBtn.addEventListener('click', togglePartnerManual);

    // 6. Erweiterte Optionen
    const advOptionsBtn = document.getElementById('btn-toggle-advanced-payment');
    if (advOptionsBtn) {
        advOptionsBtn.addEventListener('click', () => {
            const opts = document.getElementById('payment-advanced-options');
            if (opts) opts.classList.toggle('hidden');
        });
    }

    // 7. Filter und Suche
    const searchInput = document.getElementById('payment-search-input');
    if (searchInput) searchInput.addEventListener('input', applyFilters);
    
    const statusFilter = document.getElementById('payment-filter-status');
    if (statusFilter) statusFilter.addEventListener('change', applyFilters);
    
    const dirFilter = document.getElementById('payment-filter-direction');
    if (dirFilter) dirFilter.addEventListener('change', applyFilters);

    // 8. Detail Modal schließen
    const closeDetailBtn = document.getElementById('btn-close-detail-modal');
    if (closeDetailBtn) closeDetailBtn.addEventListener('click', closeDetailModal);

    // 9. Drucken
    const printBtn = document.getElementById('btn-print-payment');
    if (printBtn) printBtn.addEventListener('click', () => window.print());

    // 10. TBD Checkbox
    const tbdCheckbox = document.getElementById('payment-amount-tbd');
    if (tbdCheckbox) {
        tbdCheckbox.addEventListener('change', (e) => {
            const input = document.getElementById('payment-amount');
            if (input) {
                input.disabled = e.target.checked;
                if (e.target.checked) input.value = '';
            }
        });
    }
}

// --- DATENBANK LISTENER ---
function listenForPayments() {
    if (unsubscribePayments) unsubscribePayments();

    const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
    
    // Filter: Ich muss involviert sein (entweder als Ersteller oder als Partner)
    const q = query(paymentsRef, where('involvedUserIds', 'array-contains', currentUser.mode));

    unsubscribePayments = onSnapshot(q, (snapshot) => {
        allPayments = [];
        snapshot.forEach(doc => {
            allPayments.push({ id: doc.id, ...doc.data() });
        });
        
        applyFilters(); // Render Liste + Dashboard
        
        // Falls das Detail-Modal offen ist und sich der Eintrag geändert hat, aktualisieren wir die Anzeige live
        if (currentDetailPaymentId) {
            const updatedP = allPayments.find(x => x.id === currentDetailPaymentId);
            if (updatedP) {
                // Nur re-rendern, wenn wir NICHT gerade im Bearbeiten-Modus sind (Modal Create ist zu)
                const createModal = document.getElementById('createPaymentModal');
                if (createModal.classList.contains('hidden')) {
                     window.openPaymentDetail(currentDetailPaymentId, true); // true = refresh only
                }
            } else {
                // Eintrag wurde gelöscht
                closeDetailModal();
            }
        }
    }, (error) => {
        console.error("Fehler beim Laden der Zahlungen:", error);
        if (error.code === 'permission-denied') {
            alertUser("Fehler: Keine Berechtigung für Zahlungen. Bitte Datenbank-Regeln prüfen.", "error");
        }
    });
}

// --- UI FUNKTIONEN (MODAL) ---

// Kann im "Neu"-Modus (keine Args) oder "Bearbeiten"-Modus (paymentObject) aufgerufen werden
function openCreateModal(paymentToEdit = null) {
    const modal = document.getElementById('createPaymentModal');
    if (!modal) return;
    
    const titleEl = modal.querySelector('h3');
    const saveBtn = document.getElementById('btn-save-payment');
    const hiddenId = document.getElementById('edit-payment-id');

    if (paymentToEdit) {
        // --- BEARBEITEN MODUS ---
        titleEl.textContent = "Eintrag bearbeiten";
        saveBtn.textContent = "Änderungen speichern";
        hiddenId.value = paymentToEdit.id;

        // Felder füllen
        document.getElementById('payment-title').value = paymentToEdit.title;
        
        // Betrag: Da wir im Backend 'amount' und 'remainingAmount' haben, müssen wir aufpassen.
        // Wenn wir den ursprünglichen Betrag ändern, müssen wir den Restbetrag neu berechnen.
        // Das passiert in savePayment(). Hier zeigen wir den Ursprungsbetrag.
        document.getElementById('payment-amount').value = paymentToEdit.isTBD ? '' : paymentToEdit.amount;
        document.getElementById('payment-amount-tbd').checked = paymentToEdit.isTBD;
        document.getElementById('payment-amount').disabled = paymentToEdit.isTBD;
        
        document.getElementById('payment-deadline').value = paymentToEdit.deadline || '';
        document.getElementById('payment-invoice-nr').value = paymentToEdit.invoiceNr || '';
        document.getElementById('payment-order-nr').value = paymentToEdit.orderNr || '';
        document.getElementById('payment-notes').value = paymentToEdit.notes || '';
        document.getElementById('payment-type').value = paymentToEdit.type || 'debt';

        // Richtung & Partner setzen
        // Wir müssen rekonstruieren, ob "Ich schulde" oder "Mir geschuldet"
        const iAmDebtor = paymentToEdit.debtorId === currentUser.mode;
        setDirection(iAmDebtor ? 'i_owe' : 'owes_me');

        // Partner Feld setzen
        const partnerId = iAmDebtor ? paymentToEdit.creditorId : paymentToEdit.debtorId;
        const partnerName = iAmDebtor ? paymentToEdit.creditorName : paymentToEdit.debtorName;

        const select = document.getElementById('payment-partner-select');
        const manualInput = document.getElementById('payment-partner-name-manual');
        
        // Select neu bauen (um sicherzustellen, dass alle da sind)
        select.innerHTML = '<option value="">- Person auswählen -</option>';
        let foundInList = false;
        Object.values(USERS).forEach(user => {
            if (user.id !== currentUser.mode && user.isActive) {
                const isSelected = user.id === partnerId ? 'selected' : '';
                if (isSelected) foundInList = true;
                select.innerHTML += `<option value="${user.id}" ${isSelected}>${user.realName || user.name}</option>`;
            }
        });

        if (partnerId && foundInList) {
            // Partner ist in der Liste
            select.classList.remove('hidden');
            manualInput.classList.add('hidden');
            document.getElementById('btn-toggle-partner-manual').textContent = "Manueller Name";
        } else {
            // Partner ist manuell oder nicht mehr in der Liste
            select.classList.add('hidden');
            manualInput.classList.remove('hidden');
            manualInput.value = partnerName;
            select.value = "";
            document.getElementById('btn-toggle-partner-manual').textContent = "Liste wählen";
        }
        
        // Erweiterte Optionen aufklappen, wenn Daten drin sind
        if (paymentToEdit.invoiceNr || paymentToEdit.orderNr || paymentToEdit.notes || paymentToEdit.type === 'transfer') {
            document.getElementById('payment-advanced-options').classList.remove('hidden');
        }

    } else {
        // --- NEU ERSTELLEN MODUS ---
        titleEl.textContent = "Neuer Finanz-Eintrag";
        saveBtn.textContent = "Speichern";
        hiddenId.value = ""; // Leer = Neu

        // Reset Formular
        const amtInput = document.getElementById('payment-amount');
        if (amtInput) { amtInput.value = ''; amtInput.disabled = false; }
        
        const tbdInput = document.getElementById('payment-amount-tbd');
        if (tbdInput) tbdInput.checked = false;
        
        document.getElementById('payment-deadline').value = '';
        document.getElementById('payment-title').value = '';
        document.getElementById('payment-invoice-nr').value = '';
        document.getElementById('payment-order-nr').value = '';
        document.getElementById('payment-notes').value = '';
        document.getElementById('payment-type').value = 'debt';
        document.getElementById('payment-advanced-options').classList.add('hidden');
        
        // Partner Select füllen
        const select = document.getElementById('payment-partner-select');
        if (select) {
            select.innerHTML = '<option value="">- Person auswählen -</option>';
            Object.values(USERS).forEach(user => {
                if (user.id !== currentUser.mode && user.isActive) {
                    select.innerHTML += `<option value="${user.id}">${user.realName || user.name}</option>`;
                }
            });
        }

        // Standard Richtung & UI Reset
        setDirection('i_owe');
        const manualInput = document.getElementById('payment-partner-name-manual');
        const toggleBtn = document.getElementById('btn-toggle-partner-manual');
        select.classList.remove('hidden');
        manualInput.classList.add('hidden');
        manualInput.value = "";
        toggleBtn.textContent = "Manueller Name";
    }
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function closeCreateModal() {
    const modal = document.getElementById('createPaymentModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

function setDirection(dir) {
    const dirInput = document.getElementById('payment-direction');
    if (dirInput) dirInput.value = dir;
    
    const btnI = document.getElementById('btn-direction-i-owe');
    const btnMe = document.getElementById('btn-direction-owes-me');

    if (dir === 'i_owe') {
        if (btnI) {
            btnI.classList.add('bg-white', 'shadow', 'text-red-600');
            btnI.classList.remove('text-gray-500', 'hover:bg-gray-200');
        }
        if (btnMe) {
            btnMe.classList.remove('bg-white', 'shadow', 'text-emerald-600');
            btnMe.classList.add('text-gray-500', 'hover:bg-gray-200');
        }
    } else {
        if (btnMe) {
            btnMe.classList.add('bg-white', 'shadow', 'text-emerald-600');
            btnMe.classList.remove('text-gray-500', 'hover:bg-gray-200');
        }
        if (btnI) {
            btnI.classList.remove('bg-white', 'shadow', 'text-red-600');
            btnI.classList.add('text-gray-500', 'hover:bg-gray-200');
        }
    }
}

function togglePartnerManual() {
    const select = document.getElementById('payment-partner-select');
    const input = document.getElementById('payment-partner-name-manual');
    const btn = document.getElementById('btn-toggle-partner-manual');

    if (!select || !input || !btn) return;

    if (input.classList.contains('hidden')) {
        // Zu Manuell wechseln
        select.classList.add('hidden');
        input.classList.remove('hidden');
        select.value = ""; 
        btn.textContent = "Liste wählen";
    } else {
        // Zu Liste wechseln
        input.classList.add('hidden');
        select.classList.remove('hidden');
        input.value = ""; 
        btn.textContent = "Manueller Name";
    }
}

// --- SPEICHERN (NEU & EDIT) ---

async function savePayment() {
    const saveBtn = document.getElementById('btn-save-payment');
    setButtonLoading(saveBtn, true);

    try {
        const editId = document.getElementById('edit-payment-id').value; // Leer = Neu, ID = Edit
        
        // Daten sammeln
        const direction = document.getElementById('payment-direction').value;
        const partnerSelect = document.getElementById('payment-partner-select').value;
        const partnerManual = document.getElementById('payment-partner-name-manual').value.trim();
        
        const amountInput = document.getElementById('payment-amount').value;
        const isTBD = document.getElementById('payment-amount-tbd').checked;
        const amount = isTBD ? 0 : parseFloat(amountInput);
        
        const deadline = document.getElementById('payment-deadline').value;
        const title = document.getElementById('payment-title').value.trim();
        const invoiceNr = document.getElementById('payment-invoice-nr').value.trim();
        const orderNr = document.getElementById('payment-order-nr').value.trim();
        const notes = document.getElementById('payment-notes').value.trim();
        const type = document.getElementById('payment-type').value;

        // Validierung
        if (!title) throw new Error("Bitte einen Grund/Betreff angeben.");
        if (!isTBD && (isNaN(amount) || amount <= 0)) throw new Error("Bitte einen gültigen Betrag eingeben.");
        if (!partnerSelect && !partnerManual) throw new Error("Bitte eine Person auswählen oder eingeben.");

        // Partner Logik
        let creditorId, creditorName, debtorId, debtorName;
        let partnerId = partnerSelect || null;
        let partnerName = partnerSelect ? (USERS[partnerSelect]?.realName || USERS[partnerSelect]?.name) : partnerManual;

        if (direction === 'i_owe') {
            debtorId = currentUser.mode;
            debtorName = currentUser.displayName;
            creditorId = partnerId;
            creditorName = partnerName;
        } else {
            creditorId = currentUser.mode;
            creditorName = currentUser.displayName;
            debtorId = partnerId;
            debtorName = partnerName;
        }

        const involvedUserIds = [currentUser.mode];
        if (partnerId) involvedUserIds.push(partnerId);

        // Basis-Daten
        const paymentData = {
            title: title,
            isTBD: isTBD,
            deadline: deadline || null,
            invoiceNr: invoiceNr,
            orderNr: orderNr,
            notes: notes,
            type: type,
            debtorId: debtorId,
            debtorName: debtorName,
            creditorId: creditorId,
            creditorName: creditorName,
            involvedUserIds: involvedUserIds
        };

        const paymentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'payments');

        if (editId) {
            // --- UPDATE ---
            const existing = allPayments.find(p => p.id === editId);
            if (!existing) throw new Error("Eintrag nicht mehr gefunden.");

            // Betrags-Logik beim Update:
            // Wenn sich der Gesamtbetrag ändert, müssen wir den "Restbetrag" anpassen.
            // Formel: NeuerRest = AlterRest + (NeuerGesamt - AlterGesamt)
            let newRemaining = existing.remainingAmount;
            if (!isTBD && !existing.isTBD) {
                const diff = amount - existing.amount;
                newRemaining = parseFloat(existing.remainingAmount) + diff;
                if (newRemaining < 0) newRemaining = 0; // Sicherheitsnetz
            } else if (!isTBD && existing.isTBD) {
                // War TBD, ist jetzt fix -> Rest ist gleich dem neuen Betrag (da vorher nichts bezahlt wurde, TBD ist immer 0)
                newRemaining = amount;
            } else if (isTBD) {
                newRemaining = 0;
            }

            paymentData.amount = amount;
            paymentData.remainingAmount = newRemaining;

            // Logbuch Eintrag
            const newHistory = {
                date: new Date(),
                action: 'edited',
                user: currentUser.displayName,
                info: `Eintrag bearbeitet.`
            };
            paymentData.history = [...(existing.history || []), newHistory];

            await updateDoc(doc(paymentsRef, editId), paymentData);
            alertUser("Änderungen gespeichert!", "success");

        } else {
            // --- NEU ERSTELLEN ---
            paymentData.amount = amount;
            paymentData.remainingAmount = amount;
            paymentData.status = 'open';
            paymentData.createdAt = serverTimestamp();
            paymentData.createdBy = currentUser.mode;
            paymentData.history = [{
                date: new Date(),
                action: 'created',
                user: currentUser.displayName,
                info: `Eintrag erstellt. Betrag: ${isTBD ? 'TBD' : amount + '€'}`
            }];

            await addDoc(paymentsRef, paymentData);
            alertUser("Eintrag erfolgreich erstellt!", "success");
        }

        closeCreateModal();

    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        alertUser(error.message, "error");
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

// --- LÖSCHEN ---
window.deletePayment = async function(id) {
    if(!confirm("Diesen Eintrag wirklich unwiderruflich löschen?")) return;

    try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', id));
        alertUser("Eintrag gelöscht.", "success");
        closeDetailModal();
    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Löschen.", "error");
    }
}

// --- FILTER & RENDER ---

function applyFilters() {
    const searchTerm = document.getElementById('payment-search-input')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('payment-filter-status')?.value || 'all';
    const dirFilter = document.getElementById('payment-filter-direction')?.value || 'all';

    let filtered = allPayments.filter(p => {
        const textMatch = 
            (p.title && p.title.toLowerCase().includes(searchTerm)) || 
            (p.debtorName && p.debtorName.toLowerCase().includes(searchTerm)) ||
            (p.creditorName && p.creditorName.toLowerCase().includes(searchTerm)) ||
            (p.invoiceNr && p.invoiceNr.toLowerCase().includes(searchTerm));
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
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
        return dateB - dateA;
    });

    renderPaymentList(filtered);
    updateDashboard(allPayments);
}

function renderPaymentList(payments) {
    const container = document.getElementById('payments-list-container');
    if (!container) return;
    
    container.innerHTML = '';

    if (payments.length === 0) {
        container.innerHTML = `<div class="text-center p-8 bg-gray-50 rounded-xl text-gray-500">Keine Einträge gefunden.</div>`;
        return;
    }

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

        let amountDisplay = p.isTBD ? '<span class="text-gray-500 font-bold">TBD</span>' : `${parseFloat(p.remainingAmount).toFixed(2)} €`;
        
        let deadlineInfo = '';
        if (p.deadline && p.status === 'open') {
            const today = new Date();
            today.setHours(0,0,0,0);
            const dDate = new Date(p.deadline);
            const diffTime = dDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays < 0) deadlineInfo = `<span class="text-red-600 font-bold text-xs">Überfällig (${Math.abs(diffDays)} Tage)</span>`;
            else if (diffDays <= 3) deadlineInfo = `<span class="text-orange-600 font-bold text-xs">Fällig in ${diffDays} Tagen</span>`;
            else deadlineInfo = `<span class="text-gray-400 text-xs">Fällig: ${dDate.toLocaleDateString()}</span>`;
        }

        const html = `
        <div class="card p-4 rounded-xl border ${bgClass} shadow-sm hover:shadow-md transition cursor-pointer flex justify-between items-center" onclick="window.openPaymentDetail('${p.id}')">
            <div class="flex-grow">
                <div class="flex justify-between items-start">
                    <h4 class="font-bold text-gray-800">${p.title}</h4>
                    ${statusBadge}
                </div>
                <p class="text-xs text-gray-500 mt-1">${prefix} <strong>${partnerName}</strong></p>
                <div class="mt-2 flex items-center gap-2">
                    <span class="text-xl font-extrabold ${colorClass}">${amountDisplay}</span>
                    ${deadlineInfo}
                </div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-6 h-6 text-gray-400 ml-2">
                <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clip-rule="evenodd" />
            </svg>
        </div>
        `;
        container.innerHTML += html;
    });
}

function updateDashboard(payments) {
    let myDebt = 0;
    let myDebtCount = 0;
    let owedToMe = 0;
    let owedToMeCount = 0;

    payments.forEach(p => {
        if (p.status !== 'open' && p.status !== 'pending_approval') return;

        const amount = p.isTBD ? 0 : parseFloat(p.remainingAmount);

        if (p.debtorId === currentUser.mode) {
            myDebt += amount;
            myDebtCount++;
        } else if (p.creditorId === currentUser.mode) {
            owedToMe += amount;
            owedToMeCount++;
        }
    });

    const myDebtDisplay = document.getElementById('dashboard-my-debt-display');
    if (myDebtDisplay) myDebtDisplay.textContent = myDebt.toFixed(2) + " €";
    
    const myDebtDetail = document.getElementById('dashboard-my-debt-detail');
    if (myDebtDetail) myDebtDetail.textContent = `in ${myDebtCount} offenen Posten`;

    const oweMeDisplay = document.getElementById('dashboard-owe-me-display');
    if (oweMeDisplay) oweMeDisplay.textContent = owedToMe.toFixed(2) + " €";
    
    const oweMeDetail = document.getElementById('dashboard-owe-me-detail');
    if (oweMeDetail) oweMeDetail.textContent = `aus ${owedToMeCount} offenen Posten`;
}

// --- DETAIL ANSICHT & ACTIONS ---

// Global für onclick
window.editPayment = function(id) {
    const p = allPayments.find(x => x.id === id);
    if (p) {
        closeDetailModal();
        openCreateModal(p); // Rufe Modal im Edit-Modus auf
    }
}

window.openPaymentDetail = function(id, isRefresh = false) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;
    currentDetailPaymentId = id;

    const modal = document.getElementById('paymentDetailModal');
    const content = document.getElementById('payment-detail-content');
    const actions = document.getElementById('payment-detail-actions');
    const partialForm = document.getElementById('partial-payment-form');
    
    if(!modal || !content || !actions) return;

    const iAmDebtor = p.debtorId === currentUser.mode;
    const iAmCreditor = p.creditorId === currentUser.mode;
    
    // Nur der Ersteller darf bearbeiten/löschen
    const iAmCreator = p.createdBy === currentUser.mode;

    // Edit Button im Header des Contents
    let editControls = '';
    if (iAmCreator) {
        editControls = `
        <div class="flex justify-end gap-2 mb-4 no-print border-b pb-2">
            <button onclick="editPayment('${id}')" class="flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 text-sm font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /></svg>
                Bearbeiten
            </button>
            <button onclick="deletePayment('${id}')" class="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193v-.443A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" /></svg>
                Löschen
            </button>
        </div>
        `;
    }

    let historyHtml = (p.history || []).map(h => {
        const d = h.date?.toDate ? h.date.toDate() : new Date(h.date);
        return `
        <div class="text-xs text-gray-600 border-l-2 border-gray-300 pl-2 mb-2">
            <span class="font-bold">${d.toLocaleDateString()} ${d.toLocaleTimeString()}</span> - ${h.user}: ${h.info}
        </div>
        `;
    }).join('');

    content.innerHTML = `
        ${editControls}
        <h2 class="text-2xl font-bold text-gray-800 mb-1">${p.title}</h2>
        <div class="flex gap-2 mb-4">
            <span class="px-2 py-1 bg-gray-200 rounded text-xs">ID: ${p.id.substring(0,6)}...</span>
            ${p.invoiceNr ? `<span class="px-2 py-1 bg-blue-100 rounded text-xs">Rechnung: ${p.invoiceNr}</span>` : ''}
        </div>

        <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
                <p class="text-xs font-bold text-gray-500 uppercase">Schuldner (Zahlt)</p>
                <p class="text-lg font-semibold text-gray-900">${p.debtorName}</p>
            </div>
            <div class="text-right">
                <p class="text-xs font-bold text-gray-500 uppercase">Gläubiger (Empfängt)</p>
                <p class="text-lg font-semibold text-gray-900">${p.creditorName}</p>
            </div>
        </div>

        <div class="mb-6 text-center">
            <p class="text-sm text-gray-500">Offener Betrag</p>
            <p class="text-4xl font-extrabold text-gray-800">${p.isTBD ? 'TBD' : parseFloat(p.remainingAmount).toFixed(2) + ' €'}</p>
            ${!p.isTBD && p.amount > p.remainingAmount ? `<p class="text-xs text-green-600">Von ursprünglich ${p.amount.toFixed(2)} €</p>` : ''}
        </div>
        
        ${p.notes ? `<div class="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700"><strong>Notiz:</strong><br>${p.notes}</div>` : ''}

        <h4 class="font-bold text-gray-700 mb-2 border-b pb-1">Verlauf</h4>
        <div class="mb-4">
            ${historyHtml}
        </div>
    `;

    // Actions bauen
    actions.innerHTML = '';
    if (partialForm) partialForm.classList.add('hidden');

    if (p.status === 'open' || p.status === 'pending_approval') {
        if (iAmDebtor && p.status === 'open') {
            actions.innerHTML += `<button onclick="handlePaymentAction('${id}', 'mark_paid')" class="py-2 px-4 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">Als bezahlt melden</button>`;
            actions.innerHTML += `<button onclick="showPartialForm()" class="py-2 px-4 bg-blue-100 text-blue-800 font-bold rounded hover:bg-blue-200">Teilzahlung</button>`;
        }

        if (iAmCreditor) {
            if (p.status === 'pending_approval') {
                actions.innerHTML += `<button onclick="handlePaymentAction('${id}', 'confirm_payment')" class="py-2 px-4 bg-green-600 text-white font-bold rounded hover:bg-green-700">Bestätigen</button>`;
                actions.innerHTML += `<button onclick="handlePaymentAction('${id}', 'reject_payment')" class="py-2 px-4 bg-red-100 text-red-600 font-bold rounded hover:bg-red-200">Ablehnen</button>`;
            } else {
                actions.innerHTML += `<button onclick="handlePaymentAction('${id}', 'force_close')" class="py-2 px-4 bg-green-600 text-white font-bold rounded hover:bg-green-700">Als erledigt markieren</button>`;
                actions.innerHTML += `<button onclick="showPartialForm()" class="py-2 px-4 bg-blue-100 text-blue-800 font-bold rounded hover:bg-blue-200">Teilzahlung buchen</button>`;
            }
        }
    }

    window.showPartialForm = function() {
        if (partialForm) partialForm.classList.remove('hidden');
    }
    
    const submitPartialBtn = document.getElementById('btn-submit-partial');
    if (submitPartialBtn) {
        const newBtn = submitPartialBtn.cloneNode(true);
        submitPartialBtn.parentNode.replaceChild(newBtn, submitPartialBtn);
        newBtn.onclick = () => {
            const amt = parseFloat(document.getElementById('partial-amount-input').value);
            if (amt > 0) handlePaymentAction(id, 'partial_pay', amt);
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

// --- ACTIONS (Zahlen, Bestätigen, etc.) ---
window.handlePaymentAction = async function(id, action, amount = 0) {
    const p = allPayments.find(x => x.id === id);
    if (!p) return;

    let updateData = {};
    let logEntry = "";
    let newStatus = p.status;

    if (action === 'mark_paid') {
        newStatus = 'pending_approval';
        logEntry = "Als bezahlt markiert (wartet auf Bestätigung).";
    } 
    else if (action === 'confirm_payment' || action === 'force_close') {
        newStatus = 'paid';
        updateData.remainingAmount = 0;
        logEntry = "Zahlung bestätigt/abgeschlossen.";
    }
    else if (action === 'reject_payment') {
        newStatus = 'open';
        logEntry = "Zahlung abgelehnt (zurück auf offen).";
    }
    else if (action === 'partial_pay') {
        const newRemaining = p.remainingAmount - amount;
        updateData.remainingAmount = newRemaining < 0 ? 0 : newRemaining;
        if (newRemaining <= 0) newStatus = 'paid';
        logEntry = `Teilzahlung von ${amount.toFixed(2)}€ erfasst. Rest: ${updateData.remainingAmount.toFixed(2)}€`;
    }

    updateData.status = newStatus;
    
    const newHistory = {
        date: new Date(),
        action: action,
        user: currentUser.displayName,
        info: logEntry
    };
    
    updateData.history = [...(p.history || []), newHistory];

    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'payments', id);
        await updateDoc(docRef, updateData);
        alertUser("Status aktualisiert.", "success");
        if (action !== 'partial_pay' && action !== 'mark_paid') {
             closeDetailModal();
        } else {
             // Bei Teilzahlung offen lassen, um Ergebnis zu sehen
        }
    } catch (e) {
        console.error(e);
        alertUser("Fehler beim Aktualisieren: " + e.message, "error");
    }
}