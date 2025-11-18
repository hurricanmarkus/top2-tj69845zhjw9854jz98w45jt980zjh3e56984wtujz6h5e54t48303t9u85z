// BEGINN-ZIKA: IMPORT-BEFEHLE
import { db, currentUser, USERS, alertUser, setButtonLoading, navigate } from './haupteingang.js';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// ENDE-ZIKA

// Konstanten
const COLLECTION_NAME = 'finances';
let unsubscribeFinance = null;
let financeData = []; // Lokaler Cache
let currentFilter = 'open'; // 'open', 'history', 'smart'

// Initiale Funktion (wird von haupteingang.js aufgerufen)
export function initializeFinanceView() {
    console.log("Finance View Initialized");
    
    setupFinanceListeners();
    listenForFinanceData();
}

function setupFinanceListeners() {
    const view = document.getElementById('financeView');
    if (view.dataset.listenersAttached === 'true') return;

    // Tabs
    view.querySelectorAll('.finance-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // UI Update
            view.querySelectorAll('.finance-tab-btn').forEach(b => {
                b.classList.remove('bg-white', 'shadow', 'text-indigo-600');
                b.classList.add('text-gray-500', 'hover:bg-gray-200');
            });
            e.target.classList.add('bg-white', 'shadow', 'text-indigo-600');
            e.target.classList.remove('text-gray-500', 'hover:bg-gray-200');
            
            currentFilter = e.target.dataset.tab;
            renderFinanceList();
        });
    });

    // FAB (Add Button)
    document.getElementById('finance-fab-add').addEventListener('click', () => openFinanceModal());

    // Modal Close
    document.getElementById('finance-modal-close').addEventListener('click', () => closeFinanceModal());

    // Toggle Advanced
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

    // Speichern Button
    document.getElementById('finance-save-btn').addEventListener('click', saveFinanceEntry);

    // Personenauswahl Logik
    document.getElementById('finance-receiver-box').addEventListener('click', () => openPersonSelector('receiver'));
    document.getElementById('finance-sender-box').addEventListener('click', () => openPersonSelector('sender')); // Falls man "im Namen von" buchen will (Admin)

    view.dataset.listenersAttached = 'true';
}

function listenForFinanceData() {
    if (unsubscribeFinance) unsubscribeFinance();

    // Wir laden ALLES wo der User beteiligt ist (als Schuldner oder Gläubiger)
    // Das Filtern machen wir client-seitig für Smart Netting
    const q = query(
        collection(db, 'artifacts', '20LVob88b3ovXRUyX3ra', 'public', 'data', COLLECTION_NAME),
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
    });
}

function updateDashboard() {
    let incoming = 0;
    let outgoing = 0;

    financeData.forEach(item => {
        if (item.status === 'paid') return; // Bezahlt zählt nicht mehr zum offenen Saldo

        // Logik: Wer bin ich?
        const amISender = item.senderId === currentUser.mode;
        const amIReceiver = item.receiverId === currentUser.mode;

        if (amISender) {
            // Ich habe bezahlt/verliehen -> Ich bekomme Geld zurück (Incoming)
            // ACHTUNG: Bei "Umbuchung" zählt das evtl. anders. Hier: Schuldenlogik.
            incoming += parseFloat(item.remainingAmount || item.amount);
        } else if (amIReceiver) {
            // Ich habe empfangen/schulde -> Ich muss zahlen (Outgoing)
            outgoing += parseFloat(item.remainingAmount || item.amount);
        }
    });

    document.getElementById('finance-total-incoming').textContent = incoming.toFixed(2) + ' €';
    document.getElementById('finance-total-outgoing').textContent = outgoing.toFixed(2) + ' €';
}

function renderFinanceList() {
    const container = document.getElementById('finance-list-container');
    container.innerHTML = '';

    let filteredData = financeData;

    if (currentFilter === 'open') {
        filteredData = financeData.filter(item => item.status !== 'paid');
    } else if (currentFilter === 'history') {
        filteredData = financeData.filter(item => item.status === 'paid');
    }
    // 'smart' kommt später

    if (filteredData.length === 0) {
        container.innerHTML = `<div class="text-center p-8 text-gray-400">Keine Einträge gefunden.</div>`;
        return;
    }

    // Sortieren nach Datum (neueste zuerst)
    filteredData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    filteredData.forEach(item => {
        const amISender = item.senderId === currentUser.mode;
        const otherPersonName = amISender ? item.receiverName : item.senderName;
        const colorClass = amISender ? 'text-green-600' : 'text-red-600';
        const prefix = amISender ? 'Du bekommst' : 'Du schuldest';
        const amount = parseFloat(item.remainingAmount || item.amount).toFixed(2);

        const card = document.createElement('div');
        card.className = 'card bg-white p-4 rounded-xl shadow-sm border-l-4 ' + (amISender ? 'border-green-500' : 'border-red-500') + ' flex justify-between items-center cursor-pointer hover:bg-gray-50';
        card.innerHTML = `
            <div>
                <h4 class="font-bold text-gray-800">${item.title}</h4>
                <p class="text-xs text-gray-500">${prefix} von <strong>${otherPersonName}</strong></p>
                ${item.deadline ? `<p class="text-xs text-red-400 mt-1">Fällig: ${item.deadline}</p>` : ''}
            </div>
            <div class="text-right">
                <span class="block text-lg font-bold ${colorClass}">${amount} €</span>
                <span class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">${item.status === 'open' ? 'Offen' : 'Bezahlt'}</span>
            </div>
        `;
        
        // TODO: Klick öffnet Detailansicht (kommt im nächsten Schritt)
        
        container.appendChild(card);
    });
}

// --- Modal Funktionen ---

let currentModalMode = 'create';
let tempSenderId = null;
let tempReceiverId = null;

function openFinanceModal() {
    const modal = document.getElementById('financeEntryModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Reset Form
    document.getElementById('finance-title').value = '';
    document.getElementById('finance-amount').value = '';
    
    // Defaults
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
    // Ziel speichern ('sender' oder 'receiver')
    document.getElementById('financePersonModal').dataset.target = target;
    document.getElementById('financePersonModal').classList.remove('hidden');
    document.getElementById('financePersonModal').classList.add('flex');
    
    renderPersonList();
}

function renderPersonList() {
    const list = document.getElementById('finance-person-list');
    list.innerHTML = '';
    
    // Echte User
    Object.values(USERS).forEach(user => {
        if (user.id === currentUser.mode) return; // Sich selbst nicht anzeigen (außer bei speziellen Fällen)
        
        const item = document.createElement('div');
        item.className = 'p-2 hover:bg-indigo-50 cursor-pointer border-b flex justify-between';
        item.textContent = user.realName || user.name;
        item.onclick = () => selectPerson(user.id, user.realName || user.name);
        list.appendChild(item);
    });
    
    // TODO: Externe Personen aus DB laden
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

// --- Speichern Logik ---

async function saveFinanceEntry() {
    const title = document.getElementById('finance-title').value;
    const amount = parseFloat(document.getElementById('finance-amount').value);
    
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
            remainingAmount: amount, // Anfangs gleich
            status: 'open',
            type: 'debt', // TODO: Auslesen vom Button
            
            senderId: tempSenderId,
            senderName: document.getElementById('finance-sender-name').textContent,
            
            receiverId: tempReceiverId,
            receiverName: document.getElementById('finance-receiver-name').textContent,
            
            participants: [tempSenderId, tempReceiverId], // WICHTIG für Queries
            
            createdAt: serverTimestamp(),
            createdBy: currentUser.mode,
            
            history: [{
                date: new Date(),
                action: 'created',
                by: currentUser.displayName,
                details: `Erstellt: ${amount}€`
            }]
        };
        
        await addDoc(collection(db, 'artifacts', '20LVob88b3ovXRUyX3ra', 'public', 'data', COLLECTION_NAME), newEntry);
        
        alertUser("Eintrag gespeichert!", "success");
        closeFinanceModal();
        
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        alertUser("Fehler beim Speichern.", "error");
    } finally {
        setButtonLoading(btn, false);
    }
}