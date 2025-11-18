// BEGINN-ZIKA: IMPORT-BEFEHLE
import { db, currentUser, USERS, alertUser, setButtonLoading, navigate, appId } from './haupteingang.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// ENDE-ZIKA

// Konstanten & Referenzen
const COLLECTION_NAME = 'finances';
let financeCollectionRef = null; // Wird in initializeFinanceView gesetzt
let unsubscribeFinance = null;
let financeData = []; // Lokaler Cache aller Daten
let currentFilter = 'open'; // 'open', 'history', 'smart'
let currentDetailId = null; // ID des aktuell geöffneten Eintrags

// Initiale Funktion
export function initializeFinanceView() {
    console.log("Finance View Initialized");
    
    // Referenz sicher erstellen (mit der korrekten appId)
    financeCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', COLLECTION_NAME);
    
    setupFinanceListeners();
    listenForFinanceData();
}

function setupFinanceListeners() {
    const view = document.getElementById('financeView');
    if (view.dataset.listenersAttached === 'true') return;

    // Tabs umschalten
    view.querySelectorAll('.finance-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            view.querySelectorAll('.finance-tab-btn').forEach(b => {
                b.classList.remove('bg-white', 'shadow', 'text-indigo-600');
                b.classList.add('text-gray-500', 'hover:bg-gray-200');
            });
            e.target.classList.add('bg-white', 'shadow', 'text-indigo-600');
            e.target.classList.remove('text-gray-500', 'hover:bg-gray-200');
            
            currentFilter = e.target.dataset.tab;
            renderFinanceList(); // Liste neu rendern basierend auf Filter
        });
    });

    // FAB (Add Button) & Modal Close
    document.getElementById('finance-fab-add').addEventListener('click', () => openFinanceModal());
    document.getElementById('finance-modal-close').addEventListener('click', () => closeFinanceModal());
    document.getElementById('detail-close-btn').addEventListener('click', () => document.getElementById('financeDetailModal').classList.add('hidden'));

    // Toggle Advanced im Erstellen-Modal
    document.getElementById('finance-advanced-toggle').addEventListener('click', () => {
        const area = document.getElementById('finance-advanced-area');
        area.classList.toggle('hidden');
        const icon = document.getElementById('finance-advanced-toggle').querySelector('svg');
        icon.classList.toggle('rotate-180');
    });

    // Split Slider Logik
    document.getElementById('finance-split-active').addEventListener('change', (e) => {
        document.getElementById('finance-split-details').classList.toggle('hidden', !e.target.checked);
    });
    document.getElementById('finance-split-slider').addEventListener('input', (e) => {
        document.getElementById('finance-split-value').textContent = e.target.value + '%';
    });

    // Speichern Button (Erstellen)
    document.getElementById('finance-save-btn').addEventListener('click', saveFinanceEntry);

    // Personenauswahl
    document.getElementById('finance-receiver-box').addEventListener('click', () => openPersonSelector('receiver'));
    document.getElementById('finance-sender-box').addEventListener('click', () => openPersonSelector('sender'));
    
    // Detail-Ansicht Buttons
    document.getElementById('btn-settle-full').addEventListener('click', () => handleSettleFull());
    document.getElementById('btn-settle-part').addEventListener('click', () => handleSettlePart());
    document.getElementById('btn-delete-entry').addEventListener('click', () => handleDeleteEntry());

    view.dataset.listenersAttached = 'true';
}

function listenForFinanceData() {
    if (unsubscribeFinance) unsubscribeFinance();

    // Sicherstellen, dass wir angemeldet sind
    if (!currentUser || !currentUser.mode) {
        console.warn("Finance: Kein Benutzer angemeldet.");
        renderFinanceList(true); // NEU: Render als Leerzustand
        return;
    }

    // Lade alles, wo der User beteiligt ist
    const q = query(
        financeCollectionRef,
        where('participants', 'array-contains', currentUser.mode)
    );

    unsubscribeFinance = onSnapshot(q, (snapshot) => {
        financeData = [];
        snapshot.forEach(doc => {
            financeData.push({ id: doc.id, ...doc.data() });
        });
        updateDashboard();
        renderFinanceList();
    }, (error) => {
        console.error("Fehler beim Laden der Finanzdaten:", error);
        alertUser("Zugriffsfehler: Datenbank verweigert Zugriff.", "error");
    });
}

function updateDashboard() {
    let incoming = 0;
    let outgoing = 0;

    financeData.forEach(item => {
        if (item.status === 'paid') return; 

        const amISender = item.senderId === currentUser.mode;
        const val = parseFloat(item.remainingAmount || item.amount);

        if (amISender) {
            // Ich habe bezahlt/verliehen -> Ich bekomme Geld
            incoming += val;
        } else {
            // Ich bin Empfänger -> Ich schulde Geld
            outgoing += val;
        }
    });

    document.getElementById('finance-total-incoming').textContent = incoming.toFixed(2) + ' €';
    document.getElementById('finance-total-outgoing').textContent = outgoing.toFixed(2) + ' €';
}

// --- Haupt-Rendering Funktion ---
// AKZEPTIERT JETZT EINEN OPTIONALEN FLAG FÜR LEEREN ZUSTAND
function renderFinanceList(forceEmpty = false) {
    const container = document.getElementById('finance-list-container');
    if (!container) return; // Wichtig: Falls der Container fehlt, hier abbrechen
    
    container.innerHTML = '';

    if (currentFilter === 'smart') {
        renderSmartView(container);
        return;
    }

    let filteredData = financeData;

    if (currentFilter === 'open') {
        filteredData = financeData.filter(item => item.status !== 'paid');
        filteredData.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    } else if (currentFilter === 'history') {
        filteredData = financeData.filter(item => item.status === 'paid');
        filteredData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }

    // WENN LEER ODER KEIN USER (forceEmpty)
    if (filteredData.length === 0 || forceEmpty) {
        container.innerHTML = `<div class="text-center p-8 text-gray-400">Keine Einträge in dieser Ansicht.</div>`;
        return;
    }

    filteredData.forEach(item => {
        const amISender = item.senderId === currentUser.mode;
        const otherPersonName = amISender ? item.receiverName : item.senderName;
        const colorClass = amISender ? 'text-green-600' : 'text-red-600';
        const prefix = amISender ? 'Du bekommst' : 'Du schuldest';
        const amount = parseFloat(item.remainingAmount || item.amount).toFixed(2);

        const card = document.createElement('div');
        card.className = 'card bg-white p-4 rounded-xl shadow-sm border-l-4 ' + (amISender ? 'border-green-500' : 'border-red-500') + ' flex justify-between items-center cursor-pointer hover:bg-gray-50 transition';
        card.innerHTML = `
            <div>
                <h4 class="font-bold text-gray-800">${item.title}</h4>
                <p class="text-xs text-gray-500">${prefix} von <strong>${otherPersonName}</strong></p>
                ${item.deadline ? `<p class="text-xs text-red-400 mt-1 font-bold">Fällig: ${new Date(item.deadline).toLocaleDateString()}</p>` : ''}
            </div>
            <div class="text-right">
                <span class="block text-lg font-bold ${colorClass}">${amount} €</span>
                <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">${item.status === 'open' ? 'Offen' : 'Erledigt'}</span>
            </div>
        `;
        
        card.addEventListener('click', () => openDetailModal(item));
        container.appendChild(card);
    });
}

// --- SMART NETTING LOGIK (Die "Intelligenz") ---
function renderSmartView(container) {
    // 1. Berechne Salden pro Person
    const balances = {}; // Key: UserID, Value: Amount (Positiv = Bekomme ich, Negativ = Schulde ich)
    const userNames = {};

    financeData.forEach(item => {
        if (item.status === 'paid') return;

        const amISender = item.senderId === currentUser.mode;
        const otherId = amISender ? item.receiverId : item.senderId;
        const otherName = amISender ? item.receiverName : item.senderName;
        const amount = parseFloat(item.remainingAmount || item.amount);

        if (!balances[otherId]) balances[otherId] = 0;
        userNames[otherId] = otherName;

        if (amISender) {
            balances[otherId] += amount; // Ich bekomme Geld (+)
        } else {
            balances[otherId] -= amount; // Ich schulde Geld (-)
        }
    });

    const personIds = Object.keys(balances);
    if (personIds.length === 0) {
        container.innerHTML = `<div class="text-center p-8 text-gray-400">Alles ausgeglichen! Keine offenen Salden.</div>`;
        return;
    }

    container.innerHTML = `<div class="p-3 bg-indigo-50 text-indigo-800 text-sm rounded-lg mb-4">
        <strong>Smart View:</strong> Hier siehst du den <u>Gesamt-Saldo</u> pro Person. Alle einzelnen Schulden wurden gegengerechnet.
    </div>`;

    personIds.forEach(pid => {
        const balance = balances[pid];
        if (Math.abs(balance) < 0.01) return; // Ignoriere 0-Salden

        const isPositive = balance > 0;
        const colorClass = isPositive ? 'text-green-600' : 'text-red-600';
        const text = isPositive ? 'schuldet dir insgesamt' : 'bekommt von dir insgesamt';
        
        const card = document.createElement('div');
        card.className = 'card bg-white p-4 rounded-xl shadow-lg mb-3 border border-gray-200 flex justify-between items-center';
        
        card.innerHTML = `
            <div>
                <h4 class="font-bold text-xl text-gray-800">${userNames[pid]}</h4>
                <p class="text-sm text-gray-500">${text}</p>
            </div>
            <div class="text-right">
                <span class="block text-2xl font-bold ${colorClass}">${Math.abs(balance).toFixed(2)} €</span>
                <button class="mt-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200" onclick="alert('Funktion zum Gesamt-Ausgleich kommt im nächsten Update!')">Details</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Detail & Payment Funktionen ---

function openDetailModal(item) {
    currentDetailId = item.id;
    const modal = document.getElementById('financeDetailModal');
    
    // Basics füllen
    document.getElementById('detail-title').textContent = item.title;
    document.getElementById('detail-amount').textContent = parseFloat(item.remainingAmount || item.amount).toFixed(2) + ' €';
    
    const amISender = item.senderId === currentUser.mode;
    const directionText = amISender 
        ? `DU BEKOMMST VON ${item.receiverName}` 
        : `DU SCHULDEST AN ${item.senderName}`;
    
    document.getElementById('detail-direction-text').textContent = directionText;
    document.getElementById('detail-direction-text').className = amISender 
        ? "text-sm text-green-600 font-bold uppercase tracking-wider mb-1" 
        : "text-sm text-red-600 font-bold uppercase tracking-wider mb-1";

    // Status Badge
    const statusBadge = document.getElementById('detail-status-badge');
    statusBadge.textContent = item.status === 'paid' ? 'BEZAHLT / ABGESCHLOSSEN' : 'OFFEN';
    statusBadge.className = item.status === 'paid' 
        ? "inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800" 
        : "inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800";

    // Meta Daten
    document.getElementById('detail-id').textContent = item.id;
    const createdDate = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Unbekannt';
    document.getElementById('detail-creator').textContent = createdDate;

    // Deadline
    const dlEl = document.getElementById('detail-deadline');
    if (item.deadline) {
        dlEl.textContent = `Fällig bis: ${new Date(item.deadline).toLocaleDateString()}`;
        dlEl.classList.remove('hidden');
    } else {
        dlEl.classList.add('hidden');
    }

    // Buttons verstecken wenn bezahlt
    const actionDiv = document.getElementById('detail-actions');
    if (item.status === 'paid') {
        actionDiv.classList.add('hidden');
    } else {
        actionDiv.classList.remove('hidden');
    }

    // Verlauf rendern
    const historyList = document.getElementById('detail-history-list');
    historyList.innerHTML = '';
    if (item.history && item.history.length > 0) {
        // Neueste zuerst
        const sortedHistory = [...item.history].reverse();
        sortedHistory.forEach(h => {
            let dateStr = '...';
            if (h.date && h.date.seconds) dateStr = new Date(h.date.seconds * 1000).toLocaleString();
            else if (h.date instanceof Date) dateStr = h.date.toLocaleString();
            
            historyList.innerHTML += `
                <div class="flex justify-between border-b pb-1 last:border-0">
                    <div>
                        <span class="font-semibold block">${h.action === 'created' ? 'Erstellt' : (h.action === 'payment' ? 'Zahlung' : h.action)}</span>
                        <span class="text-xs text-gray-500">${h.by}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-xs text-gray-400 block">${dateStr}</span>
                        <span class="text-xs">${h.details}</span>
                    </div>
                </div>
            `;
        });
    } else {
        historyList.innerHTML = '<p class="text-gray-400 italic">Kein Verlauf vorhanden.</p>';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

async function handleSettleFull() {
    if (!confirm("Möchtest du diesen Eintrag wirklich komplett als BEZAHLT markieren?")) return;
    
    const btn = document.getElementById('btn-settle-full');
    setButtonLoading(btn, true);

    try {
        // Benutze die sichere Referenz
        const docRef = doc(financeCollectionRef, currentDetailId);
        
        // Wir holen das aktuelle Doc für die History
        const docSnap = await getDoc(docRef);
        const currentData = docSnap.data();
        const oldHistory = currentData.history || [];
        
        const newHistoryEntry = {
            date: new Date(),
            action: 'settled',
            by: currentUser.displayName,
            details: `Restbetrag (${currentData.remainingAmount}€) beglichen.`
        };

        await updateDoc(docRef, {
            status: 'paid',
            remainingAmount: 0,
            history: [...oldHistory, newHistoryEntry]
        });

        alertUser("Eintrag als bezahlt markiert!", "success");
        document.getElementById('financeDetailModal').classList.add('hidden');

    } catch (error) {
        console.error("Fehler beim Begleichen:", error);
        alertUser("Fehler beim Speichern.", "error");
    } finally {
        setButtonLoading(btn, false);
    }
}

async function handleSettlePart() {
    const amountStr = prompt("Welchen Betrag möchtest du einzahlen?");
    if (!amountStr) return;
    
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return alertUser("Ungültiger Betrag.", "error");

    const btn = document.getElementById('btn-settle-part');
    setButtonLoading(btn, true);

    try {
        // Benutze die sichere Referenz
        const docRef = doc(financeCollectionRef, currentDetailId);
        const docSnap = await getDoc(docRef);
        const currentData = docSnap.data();
        
        const oldRemaining = parseFloat(currentData.remainingAmount);
        let newRemaining = oldRemaining - amount;
        let newStatus = 'open';

        if (newRemaining <= 0.01) {
            newRemaining = 0;
            newStatus = 'paid';
            alertUser("Betrag vollständig beglichen!", "success");
        }

        const newHistoryEntry = {
            date: new Date(),
            action: 'payment',
            by: currentUser.displayName,
            details: `Teilzahlung: ${amount}€`
        };

        await updateDoc(docRef, {
            status: newStatus,
            remainingAmount: newRemaining,
            history: [...(currentData.history || []), newHistoryEntry]
        });

        if (newStatus === 'open') alertUser("Teilzahlung gespeichert.", "success");
        document.getElementById('financeDetailModal').classList.add('hidden');

    } catch (error) {
        console.error("Fehler bei Teilzahlung:", error);
        alertUser("Fehler beim Speichern.", "error");
    } finally {
        setButtonLoading(btn, false);
    }
}

async function handleDeleteEntry() {
    if (!confirm("ACHTUNG: Möchtest du diesen Eintrag wirklich LÖSCHEN? Das kann nicht rückgängig gemacht werden.")) return;
    
    try {
        // Benutze die sichere Referenz
        await deleteDoc(doc(financeCollectionRef, currentDetailId));
        alertUser("Eintrag gelöscht.", "success");
        document.getElementById('financeDetailModal').classList.add('hidden');
    } catch (error) {
        console.error("Fehler beim Löschen:", error);
        alertUser("Fehler beim Löschen.", "error");
    }
}

// --- Modal Funktionen (Erstellen) ---

let tempSenderId = null;
let tempReceiverId = null;

function openFinanceModal() {
    const modal = document.getElementById('financeEntryModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    document.getElementById('finance-title').value = '';
    document.getElementById('finance-amount').value = '';
    document.getElementById('finance-date').valueAsDate = new Date();
    
    tempSenderId = currentUser.mode;
    document.getElementById('finance-sender-name').textContent = currentUser.displayName || 'Mir';
    tempReceiverId = null;
    document.getElementById('finance-receiver-name').textContent = 'Auswählen...';
}

function closeFinanceModal() {
    const modal = document.getElementById('financeEntryModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function openPersonSelector(target) {
    document.getElementById('financePersonModal').dataset.target = target;
    document.getElementById('financePersonModal').classList.remove('hidden');
    document.getElementById('financePersonModal').classList.add('flex');
    renderPersonList();
}

function renderPersonList() {
    const list = document.getElementById('finance-person-list');
    list.innerHTML = '';
    
    Object.values(USERS).forEach(user => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-white rounded-lg border hover:bg-indigo-50 cursor-pointer flex justify-between items-center';
        item.innerHTML = `<span class="font-bold text-gray-700">${user.realName || user.name}</span>`;
        item.onclick = () => selectPerson(user.id, user.realName || user.name);
        list.appendChild(item);
    });
}

function selectPerson(id, name) {
    const target = document.getElementById('financePersonModal').dataset.target;
    if (target === 'sender') {
        tempSenderId = id;
        document.getElementById('finance-sender-name').textContent = name;
    } else {
        tempReceiverId = id;
        document.getElementById('finance-receiver-name').textContent = name;
    }
    document.getElementById('financePersonModal').classList.add('hidden');
    document.getElementById('financePersonModal').classList.remove('flex');
}

async function saveFinanceEntry() {
    const title = document.getElementById('finance-title').value;
    const amount = parseFloat(document.getElementById('finance-amount').value);
    const deadline = document.getElementById('finance-deadline').value;
    
    if (!title || !amount || !tempReceiverId) {
        alertUser("Bitte Titel, Betrag und Empfänger angeben.", "error");
        return;
    }
    
    const btn = document.getElementById('finance-save-btn');
    setButtonLoading(btn, true);
    
    try {
        const newEntry = {
            title: title,
            amount: amount,
            remainingAmount: amount,
            status: 'open',
            type: 'debt',
            senderId: tempSenderId,
            senderName: document.getElementById('finance-sender-name').textContent,
            receiverId: tempReceiverId,
            receiverName: document.getElementById('finance-receiver-name').textContent,
            participants: [tempSenderId, tempReceiverId],
            deadline: deadline || null,
            createdAt: serverTimestamp(),
            createdBy: currentUser.mode,
            history: [{
                date: new Date(),
                action: 'created',
                by: currentUser.displayName,
                details: `Erstellt: ${amount}€`
            }]
        };
        
        // Benutze die sichere Referenz
        await addDoc(financeCollectionRef, newEntry);
        
        alertUser("Eintrag gespeichert!", "success");
        closeFinanceModal();
        
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        alertUser("Fehler beim Speichern.", "error");
    } finally {
        setButtonLoading(btn, false);
    }
}