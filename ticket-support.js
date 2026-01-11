// // @ts-check
// ========================================
// TICKET SUPPORT SYSTEM - PROFESSIONELL
// ========================================

import {
    alertUser,
    db,
    currentUser,
    USERS,
    navigate
} from './haupteingang.js';

import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================
let ticketsCollection = null;
let TICKETS = {};
let activeTab = 'all';
let unsubscribeTickets = null;
let ticketIdCounter = 1;

// Filter-Status
let searchTerm = '';
let filterStatus = '';
let filterPriority = '';
let filterPerson = '';

// Konfiguration
const CATEGORIES = {
    handwerk: { icon: '🔨', label: 'Handwerk', color: 'amber' },
    technik: { icon: '💻', label: 'Technik', color: 'blue' },
    haushalt: { icon: '🏠', label: 'Haushalt', color: 'green' },
    einkauf: { icon: '🛒', label: 'Einkauf', color: 'orange' },
    erledigungen: { icon: '📋', label: 'Erledigungen', color: 'purple' },
    sonstiges: { icon: '📌', label: 'Sonstiges', color: 'gray' }
};

const PRIORITIES = {
    low: { icon: '🟢', label: 'Niedrig', color: 'bg-green-100 text-green-800 border-green-300' },
    normal: { icon: '🟡', label: 'Normal', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    high: { icon: '🟠', label: 'Hoch', color: 'bg-orange-100 text-orange-800 border-orange-300' },
    urgent: { icon: '🔴', label: 'Dringend', color: 'bg-red-100 text-red-800 border-red-300' }
};

const STATUS = {
    open: { label: 'Offen', color: 'bg-blue-100 text-blue-800', icon: '📝' },
    in_progress: { label: 'In Arbeit', color: 'bg-purple-100 text-purple-800', icon: '⚙️' },
    paused: { label: 'Pausiert', color: 'bg-orange-100 text-orange-800', icon: '⏸️' },
    done: { label: 'Erledigt', color: 'bg-green-100 text-green-800', icon: '✅' },
    reopened: { label: 'Wiedergeöffnet', color: 'bg-yellow-100 text-yellow-800', icon: '🔄' }
};

// ========================================
// INITIALISIERUNG
// ========================================
export function initializeTicketSupport() {
    console.log("🎫 Ticket Support (Professionell) wird initialisiert...");

    if (db) {
        ticketsCollection = collection(db, 'artifacts', '20LVob88b3ovXRUyX3ra', 'public', 'data', 'tickets');
    }

    setupEventListeners();
    populateUserDropdown();
    populateFilterDropdowns();
}

function setupEventListeners() {
    // Tabs
    const tabMy = document.getElementById('tab-my-tickets');
    const tabAssigned = document.getElementById('tab-assigned-to-me');
    const tabAll = document.getElementById('tab-all-tickets');
    
    if (tabMy && !tabMy.dataset.listenerAttached) {
        tabMy.addEventListener('click', () => switchTab('my'));
        tabMy.dataset.listenerAttached = 'true';
    }
    if (tabAssigned && !tabAssigned.dataset.listenerAttached) {
        tabAssigned.addEventListener('click', () => switchTab('assigned'));
        tabAssigned.dataset.listenerAttached = 'true';
    }
    if (tabAll && !tabAll.dataset.listenerAttached) {
        tabAll.addEventListener('click', () => switchTab('all'));
        tabAll.dataset.listenerAttached = 'true';
    }

    // Buttons
    const createBtn = document.getElementById('btn-create-ticket');
    if (createBtn && !createBtn.dataset.listenerAttached) {
        createBtn.addEventListener('click', openCreateModal);
        createBtn.dataset.listenerAttached = 'true';
    }

    const closeModal = document.getElementById('closeTicketModal');
    if (closeModal && !closeModal.dataset.listenerAttached) {
        closeModal.addEventListener('click', closeTicketModal);
        closeModal.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelTicketBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeTicketModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveTicketBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveTicket);
        saveBtn.dataset.listenerAttached = 'true';
    }

    const closeDetails = document.getElementById('closeDetailsModal');
    if (closeDetails && !closeDetails.dataset.listenerAttached) {
        closeDetails.addEventListener('click', () => {
            document.getElementById('ticketDetailsModal').style.display = 'none';
        });
        closeDetails.dataset.listenerAttached = 'true';
    }

    // Suche & Filter
    const searchInput = document.getElementById('search-tickets');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderTickets();
        });
    }

    document.getElementById('btn-clear-search')?.addEventListener('click', () => {
        searchTerm = '';
        filterStatus = '';
        filterPriority = '';
        filterPerson = '';
        document.getElementById('search-tickets').value = '';
        document.getElementById('filter-status').value = '';
        document.getElementById('filter-priority').value = '';
        document.getElementById('filter-person').value = '';
        renderTickets();
    });

    document.getElementById('filter-status')?.addEventListener('change', (e) => {
        filterStatus = e.target.value;
        renderTickets();
    });

    document.getElementById('filter-priority')?.addEventListener('change', (e) => {
        filterPriority = e.target.value;
        renderTickets();
    });

    document.getElementById('filter-person')?.addEventListener('change', (e) => {
        filterPerson = e.target.value;
        renderTickets();
    });

    // Notizen
    document.getElementById('addNoteBtn')?.addEventListener('click', addInternalNote);
}

// ========================================
// FIREBASE LISTENER
// ========================================
export function listenForTickets() {
    if (!ticketsCollection) {
        console.warn("⚠️ Collection noch nicht bereit...");
        setTimeout(listenForTickets, 1000);
        return;
    }

    if (unsubscribeTickets) unsubscribeTickets();

    // DATENSCHUTZ-FIX: Lade nur Tickets, die den aktuellen User betreffen
    // (createdBy ODER assignedTo = currentUser.mode)
    // Da Firestore keine OR-Queries unterstützt, laden wir alle und filtern clientseitig
    // ABER: Wir speichern nur Tickets, die den User betreffen
    const q = query(ticketsCollection, orderBy('createdAt', 'desc'));

    unsubscribeTickets = onSnapshot(q, (snapshot) => {
        TICKETS = {};
        let maxTicketNumber = 0;
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // DATENSCHUTZ: Nur Tickets speichern, die den User betreffen
            // (erstellt von mir ODER mir zugewiesen)
            if (data.createdBy === currentUser.mode || data.assignedTo === currentUser.mode) {
                TICKETS[docSnap.id] = { id: docSnap.id, ...data };
            }
            
            // Ticket-ID-Counter aktualisieren (für alle, damit Nummern eindeutig bleiben)
            if (data.ticketNumber) {
                maxTicketNumber = Math.max(maxTicketNumber, data.ticketNumber);
            }
        });
        
        ticketIdCounter = maxTicketNumber + 1;
        console.log(`📊 ${Object.keys(TICKETS).length} Tickets geladen (nur eigene/zugewiesene)`);
        renderTickets();
        updateStats();
    }, (error) => {
        console.error("❌ Fehler:", error);
    });
}

// ========================================
// TAB-SWITCHING
// ========================================
function switchTab(tab) {
    activeTab = tab;
    
    const tabs = {
        my: document.getElementById('tab-my-tickets'),
        assigned: document.getElementById('tab-assigned-to-me'),
        all: document.getElementById('tab-all-tickets')
    };

    Object.entries(tabs).forEach(([key, element]) => {
        if (element) {
            if (key === tab) {
                element.className = 'flex-1 py-2 px-3 rounded-lg font-bold transition bg-purple-600 text-white text-sm';
            } else {
                element.className = 'flex-1 py-2 px-3 rounded-lg font-bold transition bg-gray-200 text-gray-700 hover:bg-gray-300 text-sm';
            }
        }
    });

    renderTickets();
}

// ========================================
// TICKETS RENDERN
// ========================================
function renderTickets() {
    const container = document.getElementById('tickets-list');
    if (!container) return;

    let tickets = Object.values(TICKETS);

    // Tab-Filter
    if (activeTab === 'my') {
        tickets = tickets.filter(t => t.createdBy === currentUser.mode);
    } else if (activeTab === 'assigned') {
        tickets = tickets.filter(t => t.assignedTo === currentUser.mode);
    }

    // Such-Filter
    if (searchTerm) {
        tickets = tickets.filter(t => {
            const ticketId = `#TK-${String(t.ticketNumber || 0).padStart(4, '0')}`.toLowerCase();
            const subject = (t.subject || '').toLowerCase();
            const creatorName = (USERS && USERS[t.createdBy]?.name || '').toLowerCase();
            const assigneeName = (USERS && USERS[t.assignedTo]?.name || '').toLowerCase();
            
            return ticketId.includes(searchTerm) || 
                   subject.includes(searchTerm) || 
                   creatorName.includes(searchTerm) || 
                   assigneeName.includes(searchTerm);
        });
    }

    // Status-Filter
    if (filterStatus) {
        tickets = tickets.filter(t => t.status === filterStatus);
    }

    // Prioritäts-Filter
    if (filterPriority) {
        tickets = tickets.filter(t => t.priority === filterPriority);
    }

    // Personen-Filter
    if (filterPerson) {
        tickets = tickets.filter(t => t.createdBy === filterPerson || t.assignedTo === filterPerson);
    }

    // Sortieren
    const statusOrder = { open: 0, reopened: 1, in_progress: 2, paused: 3, done: 4 };
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };

    tickets.sort((a, b) => {
        if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status];
        }
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });

    if (tickets.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 italic py-8">Keine Tickets gefunden.</p>';
        return;
    }

    container.innerHTML = tickets.map(ticket => createTicketCard(ticket)).join('');

    // Event Listeners
    container.querySelectorAll('[data-ticket-id]').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.status-action-btn') || e.target.closest('.edit-ticket-btn')) return;
            const ticketId = card.dataset.ticketId;
            showTicketDetails(ticketId);
        });
    });

    container.querySelectorAll('.status-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ticketId = btn.dataset.ticketId;
            const newStatus = btn.dataset.newStatus;
            updateTicketStatus(ticketId, newStatus);
        });
    });

    container.querySelectorAll('.edit-ticket-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ticketId = btn.dataset.ticketId;
            openEditModal(ticketId);
        });
    });
}

function createTicketCard(ticket) {
    const category = CATEGORIES[ticket.category] || CATEGORIES.sonstiges;
    const priority = PRIORITIES[ticket.priority] || PRIORITIES.normal;
    const status = STATUS[ticket.status] || STATUS.open;
    
    const creatorName = USERS[ticket.createdBy]?.name || 'Unbekannt';
    const assigneeName = USERS[ticket.assignedTo]?.name || 'Unbekannt';
    
    const ticketId = `#TK-${String(ticket.ticketNumber || 0).padStart(4, '0')}`;

    // Überfällig?
    let dueDateHTML = '';
    if (ticket.dueDate) {
        const dueDate = new Date(ticket.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        const isOverdue = due < today && ticket.status !== 'done';
        const dateStr = dueDate.toLocaleDateString('de-DE');
        
        if (isOverdue) {
            dueDateHTML = `<span class="text-xs font-bold text-red-600">⚠️ Überfällig: ${dateStr}</span>`;
        } else {
            dueDateHTML = `<span class="text-xs text-gray-500">📅 Fällig: ${dateStr}</span>`;
        }
    }

    // Aktions-Buttons
    let actionButtons = '';
    if (ticket.assignedTo === currentUser.mode && ticket.status !== 'done') {
        if (ticket.status === 'open' || ticket.status === 'reopened') {
            actionButtons += `
                <button class="status-action-btn px-3 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700"
                    data-ticket-id="${ticket.id}" data-new-status="in_progress">
                    ▶️ Starten
                </button>
            `;
        } else if (ticket.status === 'in_progress') {
            actionButtons += `
                <button class="status-action-btn px-3 py-1.5 bg-orange-600 text-white text-sm font-bold rounded-lg hover:bg-orange-700"
                    data-ticket-id="${ticket.id}" data-new-status="paused">
                    ⏸️ Pausieren
                </button>
                <button class="status-action-btn px-3 py-1.5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700"
                    data-ticket-id="${ticket.id}" data-new-status="done">
                    ✅ Erledigen
                </button>
            `;
        } else if (ticket.status === 'paused') {
            actionButtons += `
                <button class="status-action-btn px-3 py-1.5 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-700"
                    data-ticket-id="${ticket.id}" data-new-status="in_progress">
                    ▶️ Fortsetzen
                </button>
            `;
        }
    }

    // Bearbeiten-Button (nur für Ersteller)
    if (ticket.createdBy === currentUser.mode) {
        actionButtons += `
            <button class="edit-ticket-btn px-3 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700"
                data-ticket-id="${ticket.id}">
                ✏️ Bearbeiten
            </button>
        `;
    }

    return `
        <div class="bg-white p-4 rounded-xl shadow-md hover:shadow-lg transition cursor-pointer border-l-4 border-${category.color}-500 ${ticket.status === 'done' ? 'opacity-60' : ''}"
            data-ticket-id="${ticket.id}">
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-lg font-bold text-purple-600">${ticketId}</span>
                        <span class="text-xl">${category.icon}</span>
                        <h3 class="font-bold text-gray-800 text-lg">${ticket.subject}</h3>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <span class="px-2 py-1 rounded-full text-xs font-bold border ${priority.color}">
                            ${priority.icon} ${priority.label}
                        </span>
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${status.color}">
                            ${status.icon} ${status.label}
                        </span>
                    </div>
                </div>
                <div class="flex gap-2 flex-wrap justify-end">
                    ${actionButtons}
                </div>
            </div>
            
            <div class="text-sm text-gray-600 space-y-1">
                <p><strong>Von:</strong> ${creatorName} <strong>→ Für:</strong> ${assigneeName}</p>
                ${dueDateHTML ? `<p>${dueDateHTML}</p>` : ''}
            </div>
        </div>
    `;
}

// ========================================
// MODAL FUNKTIONEN
// ========================================
function openCreateModal() {
    document.getElementById('ticketModalTitle').textContent = 'Neues Ticket';
    document.getElementById('editTicketId').value = '';
    document.getElementById('ticketSubject').value = '';
    document.getElementById('ticketCategory').value = 'handwerk';
    document.getElementById('ticketPriority').value = 'normal';
    document.getElementById('ticketAssignedTo').value = '';
    document.getElementById('ticketDueDate').value = '';
    document.getElementById('ticketDescription').value = '';
    document.getElementById('statusFieldContainer').style.display = 'none';
    document.getElementById('ticketModal').style.display = 'flex';
}

function openEditModal(ticketId) {
    const ticket = TICKETS[ticketId];
    if (!ticket) return;

    document.getElementById('ticketModalTitle').textContent = 'Ticket bearbeiten';
    document.getElementById('editTicketId').value = ticketId;
    document.getElementById('ticketSubject').value = ticket.subject;
    document.getElementById('ticketCategory').value = ticket.category;
    document.getElementById('ticketPriority').value = ticket.priority;
    document.getElementById('ticketAssignedTo').value = ticket.assignedTo;
    document.getElementById('ticketDueDate').value = ticket.dueDate || '';
    document.getElementById('ticketDescription').value = ticket.description || '';
    document.getElementById('statusFieldContainer').style.display = 'block';
    document.getElementById('ticketStatus').value = ticket.status;
    document.getElementById('ticketModal').style.display = 'flex';
}

function closeTicketModal() {
    document.getElementById('ticketModal').style.display = 'none';
}

async function saveTicket() {
    const editId = document.getElementById('editTicketId').value;
    const subject = document.getElementById('ticketSubject').value.trim();
    const category = document.getElementById('ticketCategory').value;
    const priority = document.getElementById('ticketPriority').value;
    const assignedTo = document.getElementById('ticketAssignedTo').value;
    const dueDate = document.getElementById('ticketDueDate').value;
    const description = document.getElementById('ticketDescription').value.trim();
    const status = editId ? document.getElementById('ticketStatus').value : 'open';

    if (!subject) {
        alertUser("Bitte Betreff eingeben.", "error");
        return;
    }

    if (!assignedTo) {
        alertUser("Bitte Person zuweisen.", "error");
        return;
    }

    try {
        if (editId) {
            // Bearbeiten
            const oldTicket = TICKETS[editId];
            const changes = [];
            
            if (oldTicket.subject !== subject) changes.push(`Betreff: "${oldTicket.subject}" → "${subject}"`);
            if (oldTicket.priority !== priority) changes.push(`Priorität: ${PRIORITIES[oldTicket.priority].label} → ${PRIORITIES[priority].label}`);
            if (oldTicket.status !== status) changes.push(`Status: ${STATUS[oldTicket.status].label} → ${STATUS[status].label}`);
            if (oldTicket.assignedTo !== assignedTo) changes.push(`Zugewiesen: ${USERS[oldTicket.assignedTo]?.name} → ${USERS[assignedTo]?.name}`);

            const activityLog = oldTicket.activityLog || [];
            if (changes.length > 0) {
                activityLog.push({
                    timestamp: new Date().toISOString(),
                    user: currentUser.displayName,
                    userId: currentUser.mode,
                    changes: changes
                });
            }

            await updateDoc(doc(ticketsCollection, editId), {
                subject,
                category,
                priority,
                assignedTo,
                dueDate: dueDate || null,
                description,
                status,
                activityLog,
                updatedAt: serverTimestamp()
            });
            alertUser("✅ Ticket aktualisiert!", "success");
        } else {
            // Neu erstellen
            const ticketData = {
                ticketNumber: ticketIdCounter,
                subject,
                category,
                priority,
                assignedTo,
                dueDate: dueDate || null,
                description,
                status: 'open',
                createdBy: currentUser.mode,
                createdByName: currentUser.displayName,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                internalNotes: [],
                activityLog: [{
                    timestamp: new Date().toISOString(),
                    user: currentUser.displayName,
                    userId: currentUser.mode,
                    changes: ['Ticket erstellt']
                }]
            };

            await addDoc(ticketsCollection, ticketData);
            alertUser("✅ Ticket erstellt!", "success");
        }

        closeTicketModal();
    } catch (error) {
        console.error("❌ Fehler:", error);
        alertUser("Fehler beim Speichern.", "error");
    }
}

// ========================================
// STATUS AKTUALISIEREN
// ========================================
async function updateTicketStatus(ticketId, newStatus) {
    try {
        const ticket = TICKETS[ticketId];
        
        // SICHERHEITSFRAGE: Vor dem Abschließen bestätigen lassen
        if (newStatus === 'done') {
            const confirmed = confirm(`Möchtest du das Ticket "${ticket.subject}" wirklich als erledigt markieren?`);
            if (!confirmed) {
                return; // Abbruch, wenn nicht bestätigt
            }
        }
        
        const activityLog = ticket.activityLog || [];
        
        activityLog.push({
            timestamp: new Date().toISOString(),
            user: currentUser.displayName,
            userId: currentUser.mode,
            changes: [`Status: ${STATUS[ticket.status].label} → ${STATUS[newStatus].label}`]
        });

        await updateDoc(doc(ticketsCollection, ticketId), {
            status: newStatus,
            activityLog,
            updatedAt: serverTimestamp()
        });
        alertUser(`Status: ${STATUS[newStatus].label}`, "success");
    } catch (error) {
        console.error("❌ Fehler:", error);
        alertUser("Fehler beim Aktualisieren.", "error");
    }
}

// ========================================
// TICKET DETAILS
// ========================================
function showTicketDetails(ticketId) {
    const ticket = TICKETS[ticketId];
    if (!ticket) return;

    const category = CATEGORIES[ticket.category] || CATEGORIES.sonstiges;
    const priority = PRIORITIES[ticket.priority] || PRIORITIES.normal;
    const status = STATUS[ticket.status] || STATUS.open;
    
    const creatorName = USERS[ticket.createdBy]?.name || 'Unbekannt';
    const assigneeName = USERS[ticket.assignedTo]?.name || 'Unbekannt';
    const ticketIdStr = `#TK-${String(ticket.ticketNumber || 0).padStart(4, '0')}`;

    const createdDate = ticket.createdAt?.toDate?.() || new Date();
    const createdStr = createdDate.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const dueDateStr = ticket.dueDate
        ? new Date(ticket.dueDate).toLocaleDateString('de-DE')
        : 'Nicht festgelegt';

    const content = document.getElementById('ticketDetailsContent');
    content.innerHTML = `
        <div class="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border-2 border-purple-200 mb-4">
            <div class="flex items-center gap-2 mb-2">
                <span class="text-xl font-bold text-purple-600">${ticketIdStr}</span>
                <span class="text-2xl">${category.icon}</span>
                <h2 class="text-2xl font-bold text-gray-800">${ticket.subject}</h2>
            </div>
            <div class="flex gap-2">
                <span class="px-3 py-1 rounded-full text-sm font-bold border ${priority.color}">
                    ${priority.icon} ${priority.label}
                </span>
                <span class="px-3 py-1 rounded-full text-sm font-bold ${status.color}">
                    ${status.icon} ${status.label}
                </span>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="bg-gray-50 p-3 rounded-lg">
                <p class="text-xs font-bold text-gray-500 mb-1">VON</p>
                <p class="font-bold text-gray-800">${creatorName}</p>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg">
                <p class="text-xs font-bold text-gray-500 mb-1">FÜR</p>
                <p class="font-bold text-gray-800">${assigneeName}</p>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg">
                <p class="text-xs font-bold text-gray-500 mb-1">ERSTELLT AM</p>
                <p class="text-sm text-gray-700">${createdStr}</p>
            </div>
            <div class="bg-gray-50 p-3 rounded-lg">
                <p class="text-xs font-bold text-gray-500 mb-1">FÄLLIG BIS</p>
                <p class="text-sm text-gray-700">${dueDateStr}</p>
            </div>
        </div>

        ${ticket.description ? `
            <div class="bg-gray-50 p-4 rounded-lg mb-4">
                <p class="text-xs font-bold text-gray-500 mb-2">BESCHREIBUNG</p>
                <p class="text-gray-700 whitespace-pre-wrap">${ticket.description}</p>
            </div>
        ` : ''}

        ${ticket.createdBy === currentUser.mode ? `
            <div class="flex gap-2 mb-4">
                <button onclick="editTicketFromDetails('${ticketId}')" 
                    class="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700">
                    ✏️ Bearbeiten
                </button>
                ${ticket.status === 'done' ? `
                    <button onclick="reopenTicket('${ticketId}')" 
                        class="px-4 py-2 bg-yellow-600 text-white font-bold rounded-lg hover:bg-yellow-700">
                        🔄 Wiederöffnen
                    </button>
                ` : ''}
                <button onclick="deleteTicket('${ticketId}')" 
                    class="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">
                    🗑️ Löschen
                </button>
            </div>
        ` : ''}
    `;

    // Interne Notizen (nur für Zugewiesenen)
    const notesSection = document.getElementById('internalNotesSection');
    if (ticket.assignedTo === currentUser.mode) {
        notesSection.classList.remove('hidden');
        notesSection.dataset.ticketId = ticketId;
        renderInternalNotes(ticket);
    } else {
        notesSection.classList.add('hidden');
    }

    // Aktivitätsprotokoll
    renderActivityLog(ticket);

    document.getElementById('ticketDetailsModal').style.display = 'flex';
}

function renderInternalNotes(ticket) {
    const notesList = document.getElementById('notesList');
    const notes = ticket.internalNotes || [];

    if (notes.length === 0) {
        notesList.innerHTML = '<p class="text-sm text-gray-400 italic">Keine Notizen</p>';
        return;
    }

    notesList.innerHTML = notes.map((note, idx) => `
        <div class="bg-yellow-50 p-2 rounded border-l-4 border-yellow-400">
            <p class="text-sm text-gray-700">${note.text}</p>
            <p class="text-xs text-gray-500 mt-1">
                ${new Date(note.timestamp).toLocaleString('de-DE')}
                <button onclick="deleteNote(${idx})" class="ml-2 text-red-600 hover:text-red-800">🗑️</button>
            </p>
        </div>
    `).join('');
}

async function addInternalNote() {
    const input = document.getElementById('newNoteInput');
    const ticketId = document.getElementById('internalNotesSection').dataset.ticketId;
    const text = input.value.trim();

    if (!text) return;

    try {
        const ticket = TICKETS[ticketId];
        const notes = ticket.internalNotes || [];
        
        notes.push({
            text,
            timestamp: new Date().toISOString(),
            user: currentUser.displayName
        });

        await updateDoc(doc(ticketsCollection, ticketId), {
            internalNotes: notes
        });

        input.value = '';
        alertUser("Notiz hinzugefügt", "success");
    } catch (error) {
        console.error("❌ Fehler:", error);
        alertUser("Fehler beim Hinzufügen.", "error");
    }
}

window.deleteNote = async function(index) {
    const ticketId = document.getElementById('internalNotesSection').dataset.ticketId;
    
    try {
        const ticket = TICKETS[ticketId];
        const notes = ticket.internalNotes || [];
        notes.splice(index, 1);

        await updateDoc(doc(ticketsCollection, ticketId), {
            internalNotes: notes
        });

        alertUser("Notiz gelöscht", "success");
    } catch (error) {
        console.error("❌ Fehler:", error);
        alertUser("Fehler beim Löschen.", "error");
    }
};

function renderActivityLog(ticket) {
    const logContainer = document.getElementById('activityLog');
    const log = ticket.activityLog || [];

    if (log.length === 0) {
        logContainer.innerHTML = '<p class="text-sm text-gray-400 italic">Keine Aktivitäten</p>';
        return;
    }

    logContainer.innerHTML = log.slice().reverse().map(entry => {
        const date = new Date(entry.timestamp).toLocaleString('de-DE');
        return `
            <div class="bg-white p-2 rounded border-l-4 border-blue-400">
                <p class="text-xs font-bold text-gray-700">${entry.user} - ${date}</p>
                <ul class="text-sm text-gray-600 mt-1 list-disc list-inside">
                    ${entry.changes.map(change => `<li>${change}</li>`).join('')}
                </ul>
            </div>
        `;
    }).join('');
}

window.editTicketFromDetails = function(ticketId) {
    document.getElementById('ticketDetailsModal').style.display = 'none';
    openEditModal(ticketId);
};

window.reopenTicket = async function(ticketId) {
    await updateTicketStatus(ticketId, 'reopened');
    document.getElementById('ticketDetailsModal').style.display = 'none';
};

window.deleteTicket = async function(ticketId) {
    const ticket = TICKETS[ticketId];
    if (!ticket) return;

    if (!confirm(`Ticket "${ticket.subject}" wirklich löschen?`)) return;

    try {
        await deleteDoc(doc(ticketsCollection, ticketId));
        alertUser("Ticket gelöscht.", "success");
        document.getElementById('ticketDetailsModal').style.display = 'none';
    } catch (error) {
        console.error("❌ Fehler:", error);
        alertUser("Fehler beim Löschen.", "error");
    }
};

// ========================================
// STATISTIKEN
// ========================================
function updateStats() {
    const stats = {
        open: 0,
        in_progress: 0,
        paused: 0,
        done: 0,
        assignedToMe: 0
    };

    Object.values(TICKETS).forEach(ticket => {
        if (ticket.status === 'open' || ticket.status === 'reopened') stats.open++;
        else if (ticket.status === 'in_progress') stats.in_progress++;
        else if (ticket.status === 'paused') stats.paused++;
        else if (ticket.status === 'done') stats.done++;

        if (ticket.assignedTo === currentUser.mode && ticket.status !== 'done') {
            stats.assignedToMe++;
        }
    });

    document.getElementById('stat-open').textContent = stats.open;
    document.getElementById('stat-in-progress').textContent = stats.in_progress;
    document.getElementById('stat-paused').textContent = stats.paused;
    document.getElementById('stat-done').textContent = stats.done;
    document.getElementById('stat-assigned-to-me').textContent = stats.assignedToMe;
}

// ========================================
// DROPDOWNS BEFÜLLEN
// ========================================
function populateUserDropdown() {
    const dropdown = document.getElementById('ticketAssignedTo');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">-- Bitte wählen --</option>';
    
    Object.entries(USERS).forEach(([userId, user]) => {
        if (user.isActive) {
            const option = document.createElement('option');
            option.value = userId;
            option.textContent = user.name;
            dropdown.appendChild(option);
        }
    });
}

function populateFilterDropdowns() {
    const dropdown = document.getElementById('filter-person');
    if (!dropdown) return;

    dropdown.innerHTML = '<option value="">Alle Personen</option>';
    
    Object.entries(USERS).forEach(([userId, user]) => {
        if (user.isActive) {
            const option = document.createElement('option');
            option.value = userId;
            option.textContent = user.name;
            dropdown.appendChild(option);
        }
    });
}
