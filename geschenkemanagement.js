// @ts-check
// ========================================
// GESCHENKEMANAGEMENT SYSTEM
// Professionelle Geschenkeverwaltung für alle Anlässe
// Mit Themen-System, Kontaktbuch und Freigabemanagement
// ========================================

import {
    alertUser,
    db,
    currentUser,
    USERS,
    navigate,
    appId
} from './haupteingang.js';

import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    getDoc,
    setDoc,
    getDocs,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================
let geschenkeCollection = null;
let geschenkeSettingsRef = null;
let geschenkeThemenRef = null;
let geschenkeKontakteRef = null;
let geschenkeVorlagenRef = null;
let geschenkeFreigabenRef = null;
let geschenkeEinladungenRef = null;
let geschenkeBudgetsRef = null;
let geschenkeErinnerungenRef = null;

let GESCHENKE = {};
let THEMEN = {};
let KONTAKTE = {};
let VORLAGEN = {};
let FREIGABEN = {};
let EINLADUNGEN = {};
let BUDGETS = {};
let ERINNERUNGEN = {};
let currentThemaId = null;
let searchTerm = '';
let currentFilter = {};

// Einladungs-Status
const EINLADUNG_STATUS = {
    pending: { label: 'Ausstehend', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
    accepted: { label: 'Angenommen', color: 'bg-green-100 text-green-800', icon: '✅' },
    declined: { label: 'Abgelehnt', color: 'bg-red-100 text-red-800', icon: '❌' },
    blocked: { label: 'Blockiert', color: 'bg-gray-100 text-gray-800', icon: '🚫' }
};

// Eigene Person (unlöschbar)
let eigenePerson = null;

// ========================================
// KONFIGURATIONEN
// ========================================
export const STATUS_CONFIG = {
    offen: { label: 'Offen', color: 'bg-gray-100 text-gray-800', icon: '⭕' },
    idee: { label: 'Idee', color: 'bg-yellow-100 text-yellow-800', icon: '💡' },
    zu_bestellen: { label: 'zu Bestellen', color: 'bg-orange-100 text-orange-800', icon: '🛒' },
    bestellt: { label: 'Bestellt', color: 'bg-blue-100 text-blue-800', icon: '📦' },
    teillieferung: { label: 'Teillieferung', color: 'bg-cyan-100 text-cyan-800', icon: '📬' },
    teillieferung_temp: { label: 'Teillieferung - temp. Platz', color: 'bg-cyan-50 text-cyan-700', icon: '📍' },
    geliefert_temp: { label: 'Geliefert - temp. Platz', color: 'bg-teal-100 text-teal-800', icon: '🏠' },
    beschaedigt: { label: 'Beschädigt', color: 'bg-red-100 text-red-800', icon: '💔' },
    problem: { label: 'Problem', color: 'bg-red-200 text-red-900', icon: '⚠️' },
    abgeschlossen: { label: 'Abgeschlossen', color: 'bg-green-100 text-green-800', icon: '✅' },
    storniert: { label: 'Storniert', color: 'bg-gray-200 text-gray-600', icon: '❌' }
};

export const ZAHLUNGSART_SOLL = {
    konto_weihnachten: { label: 'Konto-Weihnachten' },
    hauptkonto: { label: 'Hauptkonto' },
    kreditkarte: { label: 'Kreditkarte' },
    bar: { label: 'Bar' },
    nicht_bezahlt: { label: 'Nicht bezahlt' },
    div_bezahlung: { label: 'div. Bezahlung' },
    haushaltskonto_giro: { label: 'Haushaltskonto - Giro' },
    haushaltskonto_geschenk: { label: 'Haush.k. (2) - Geschenk' }
};

export const ZAHLUNGSART_IST = {
    konto_weihnachten: { label: 'Konto-Weihnachten' },
    lastschrift_hauptkonto: { label: 'Lastschrift-Hauptkonto' },
    hauptkonto: { label: 'Hauptkonto' },
    kreditkarte: { label: 'Kreditkarte' },
    bar: { label: 'Bar' },
    rechnung: { label: 'Rechnung' },
    nicht_bezahlt: { label: 'Nicht bezahlt' },
    div_bezahlung: { label: 'div. Bezahlung' },
    haushaltskonto_giro: { label: 'Haushaltskonto - Giro' },
    haushaltskonto_geschenk: { label: 'Haush.k. (2) - Geschenk' }
};

// Standard-Einstellungen
let geschenkeSettings = {
    statusOptionen: Object.keys(STATUS_CONFIG),
    zahlungsartSoll: Object.keys(ZAHLUNGSART_SOLL),
    zahlungsartIst: Object.keys(ZAHLUNGSART_IST),
    geschenkeStandorte: ['zu Hause', 'Anderer Standort'],
    customStatusOptionen: [],
    customZahlungsartSoll: [],
    customZahlungsartIst: [],
    customGeschenkeStandorte: []
};

// ========================================
// INITIALISIERUNG
// ========================================
export async function initializeGeschenkemanagement() {
    console.log("🎁 Geschenkemanagement-System wird initialisiert...");

    if (db) {
        geschenkeSettingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'geschenkemanagement');
        geschenkeThemenRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_themen');
        geschenkeKontakteRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_kontakte');
        geschenkeVorlagenRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_vorlagen');
        geschenkeFreigabenRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_freigaben');
        geschenkeEinladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_einladungen');
        geschenkeBudgetsRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_budgets');
        geschenkeErinnerungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_erinnerungen');
        
        await loadSettings();
        await loadKontakte();
        await loadThemen();
        await loadVorlagen();
        await loadFreigaben();
        await loadEinladungen();
        await loadBudgets();
        await loadErinnerungen();
        
        // Prüfe auf ausstehende Einladungen
        checkPendingInvitations();
    }

    setupEventListeners();
    renderDashboard();
}

// ========================================
// DATEN LADEN
// ========================================
async function loadSettings() {
    try {
        const settingsDoc = await getDoc(geschenkeSettingsRef);
        if (settingsDoc.exists()) {
            geschenkeSettings = { ...geschenkeSettings, ...settingsDoc.data() };
        } else {
            await setDoc(geschenkeSettingsRef, geschenkeSettings);
        }
    } catch (e) {
        console.error("Fehler beim Laden der Einstellungen:", e);
    }
}

async function loadKontakte() {
    try {
        const snapshot = await getDocs(geschenkeKontakteRef);
        KONTAKTE = {};
        snapshot.forEach((docSnap) => {
            KONTAKTE[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
            if (docSnap.data().istEigenePerson) {
                eigenePerson = { id: docSnap.id, ...docSnap.data() };
            }
        });
        
        // Eigene Person erstellen falls nicht vorhanden
        if (!eigenePerson && currentUser?.displayName) {
            await createEigenePerson();
        }
    } catch (e) {
        console.error("Fehler beim Laden der Kontakte:", e);
    }
}

async function createEigenePerson() {
    try {
        const eigenPersonData = {
            name: currentUser.displayName,
            istEigenePerson: true,
            erstelltAm: serverTimestamp(),
            erstelltVon: currentUser.displayName
        };
        const docRef = await addDoc(geschenkeKontakteRef, eigenPersonData);
        eigenePerson = { id: docRef.id, ...eigenPersonData };
        KONTAKTE[docRef.id] = eigenePerson;
    } catch (e) {
        console.error("Fehler beim Erstellen der eigenen Person:", e);
    }
}

async function loadThemen() {
    try {
        const snapshot = await getDocs(geschenkeThemenRef);
        THEMEN = {};
        snapshot.forEach((docSnap) => {
            THEMEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        
        const savedThemaId = localStorage.getItem('gm_current_thema');
        if (savedThemaId && THEMEN[savedThemaId]) {
            currentThemaId = savedThemaId;
        } else if (Object.keys(THEMEN).length > 0) {
            currentThemaId = Object.keys(THEMEN)[0];
        }
        
        renderThemenDropdown();
        if (currentThemaId) {
            updateCollectionForThema();
        }
    } catch (e) {
        console.error("Fehler beim Laden der Themen:", e);
    }
}

async function loadVorlagen() {
    try {
        const snapshot = await getDocs(geschenkeVorlagenRef);
        VORLAGEN = {};
        snapshot.forEach((docSnap) => {
            VORLAGEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
    } catch (e) {
        console.error("Fehler beim Laden der Vorlagen:", e);
    }
}

async function loadFreigaben() {
    try {
        const snapshot = await getDocs(geschenkeFreigabenRef);
        FREIGABEN = {};
        snapshot.forEach((docSnap) => {
            FREIGABEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
    } catch (e) {
        console.error("Fehler beim Laden der Freigaben:", e);
    }
}

function updateCollectionForThema() {
    if (currentThemaId && db) {
        geschenkeCollection = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_themen', currentThemaId, 'eintraege');
        listenForGeschenke();
    }
}

// ========================================
// ECHTZEIT-LISTENER
// ========================================
export function listenForGeschenke() {
    if (!geschenkeCollection) return;
    
    onSnapshot(query(geschenkeCollection, orderBy('erstelltAm', 'desc')), (snapshot) => {
        GESCHENKE = {};
        snapshot.forEach((docSnap) => {
            GESCHENKE[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        renderGeschenkeTabelle();
        updateDashboardStats();
    }, (error) => {
        console.error("Fehler beim Laden der Geschenke:", error);
    });
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Thema-Dropdown
    const themaDropdown = document.getElementById('gm-thema-dropdown');
    if (themaDropdown && !themaDropdown.dataset.listenerAttached) {
        themaDropdown.addEventListener('change', (e) => {
            currentThemaId = e.target.value;
            localStorage.setItem('gm_current_thema', currentThemaId);
            updateCollectionForThema();
            renderDashboard();
        });
        themaDropdown.dataset.listenerAttached = 'true';
    }

    // Neuer Eintrag Button
    const createBtn = document.getElementById('btn-create-geschenk');
    if (createBtn && !createBtn.dataset.listenerAttached) {
        createBtn.addEventListener('click', openCreateModal);
        createBtn.dataset.listenerAttached = 'true';
    }

    // Einstellungen Button
    const settingsBtn = document.getElementById('btn-geschenke-settings');
    if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
        settingsBtn.addEventListener('click', openSettingsModal);
        settingsBtn.dataset.listenerAttached = 'true';
    }

    // Suche
    const searchInput = document.getElementById('search-geschenke');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderGeschenkeTabelle();
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    // Filter Reset
    const resetBtn = document.getElementById('reset-filters-geschenke');
    if (resetBtn && !resetBtn.dataset.listenerAttached) {
        resetBtn.addEventListener('click', resetFilters);
        resetBtn.dataset.listenerAttached = 'true';
    }

    // Modal schließen
    setupModalListeners();
}

function setupModalListeners() {
    const closeModal = document.getElementById('closeGeschenkModal');
    if (closeModal && !closeModal.dataset.listenerAttached) {
        closeModal.addEventListener('click', closeGeschenkModal);
        closeModal.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelGeschenkBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeGeschenkModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveGeschenkBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveGeschenk);
        saveBtn.dataset.listenerAttached = 'true';
    }

    // Settings Modal
    const closeSettingsModal = document.getElementById('closeGeschenkeSettingsModal');
    if (closeSettingsModal && !closeSettingsModal.dataset.listenerAttached) {
        closeSettingsModal.addEventListener('click', closeSettingsModalFn);
        closeSettingsModal.dataset.listenerAttached = 'true';
    }
}

// ========================================
// RENDER FUNKTIONEN
// ========================================
function renderThemenDropdown() {
    const dropdown = document.getElementById('gm-thema-dropdown');
    if (!dropdown) return;
    
    const activeThemen = Object.values(THEMEN).filter(t => !t.archiviert);
    dropdown.innerHTML = activeThemen.length === 0 
        ? '<option value="">Kein Thema vorhanden</option>'
        : activeThemen.map(thema => 
            `<option value="${thema.id}" ${thema.id === currentThemaId ? 'selected' : ''}>${thema.name}</option>`
        ).join('');
}

function renderDashboard() {
    renderThemenDropdown();
    renderPersonenUebersicht();
    renderGeschenkeTabelle();
    updateDashboardStats();
}

function renderPersonenUebersicht() {
    const container = document.getElementById('gm-personen-uebersicht');
    if (!container || !currentThemaId) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema?.personen || thema.personen.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <p class="text-lg font-semibold">Keine Personen hinzugefügt</p>
                <p class="text-sm">Füge Personen aus deinem Kontaktbuch hinzu, um Geschenke zu planen.</p>
                <button onclick="window.openAddPersonToThemaModal()" class="mt-3 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition">
                    + Person hinzufügen
                </button>
            </div>
        `;
        return;
    }
    
    // Personen-Karten mit Geschenke-Status
    let html = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">';
    
    thema.personen.forEach(personId => {
        const person = KONTAKTE[personId];
        if (!person) return;
        
        const geschenkeFuerPerson = Object.values(GESCHENKE).filter(g => 
            g.fuer && g.fuer.includes(personId)
        );
        
        const stats = {
            total: geschenkeFuerPerson.length,
            offen: geschenkeFuerPerson.filter(g => ['offen', 'idee', 'zu_bestellen'].includes(g.status)).length,
            bestellt: geschenkeFuerPerson.filter(g => ['bestellt', 'teillieferung'].includes(g.status)).length,
            fertig: geschenkeFuerPerson.filter(g => g.status === 'abgeschlossen').length
        };
        
        const progressPercent = stats.total > 0 ? Math.round((stats.fertig / stats.total) * 100) : 0;
        
        html += `
            <div class="bg-white rounded-xl shadow-md p-4 border-l-4 border-pink-500 hover:shadow-lg transition cursor-pointer" 
                 onclick="window.filterByPerson('${personId}')">
                <div class="flex items-center gap-3 mb-2">
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold">
                        ${person.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-800 truncate">${person.name}</p>
                        <p class="text-xs text-gray-500">${stats.total} Geschenk${stats.total !== 1 ? 'e' : ''}</p>
                    </div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div class="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full transition-all" style="width: ${progressPercent}%"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-600">
                    <span>🔴 ${stats.offen} offen</span>
                    <span>📦 ${stats.bestellt} bestellt</span>
                    <span>✅ ${stats.fertig} fertig</span>
                </div>
            </div>
        `;
    });
    
    html += `
        <div class="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-4 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition"
             onclick="window.openAddPersonToThemaModal()">
            <div class="text-center text-gray-500">
                <span class="text-2xl">+</span>
                <p class="text-sm font-semibold">Person hinzufügen</p>
            </div>
        </div>
    </div>`;
    
    container.innerHTML = html;
}

function renderGeschenkeTabelle() {
    const tbody = document.getElementById('geschenke-table-body');
    if (!tbody) return;
    
    let geschenkeArray = Object.values(GESCHENKE);
    
    // Filter anwenden
    if (searchTerm) {
        geschenkeArray = geschenkeArray.filter(g => 
            g.geschenk?.toLowerCase().includes(searchTerm) ||
            g.shop?.toLowerCase().includes(searchTerm) ||
            g.notizen?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (currentFilter.status) {
        geschenkeArray = geschenkeArray.filter(g => g.status === currentFilter.status);
    }
    
    if (currentFilter.personId) {
        geschenkeArray = geschenkeArray.filter(g => 
            g.fuer?.includes(currentFilter.personId) || g.von?.includes(currentFilter.personId)
        );
    }
    
    if (geschenkeArray.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="px-4 py-8 text-center text-gray-400 italic">
                    ${Object.keys(GESCHENKE).length === 0 
                        ? 'Keine Einträge vorhanden. Erstelle deinen ersten Geschenk-Eintrag!' 
                        : 'Keine Einträge gefunden für die aktuelle Filterung.'}
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = geschenkeArray.map(g => renderGeschenkRow(g)).join('');
}

function renderGeschenkRow(geschenk) {
    const statusConfig = STATUS_CONFIG[geschenk.status] || STATUS_CONFIG.offen;
    const fuerPersonen = (geschenk.fuer || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ');
    const vonPersonen = (geschenk.von || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ');
    const beteiligtePersonen = (geschenk.beteiligung || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ');
    
    return `
        <tr class="hover:bg-pink-50 transition cursor-pointer" onclick="window.openEditGeschenkModal('${geschenk.id}')">
            <td class="px-3 py-3">
                <span class="px-2 py-1 rounded-full text-xs font-bold ${statusConfig.color}">
                    ${statusConfig.icon} ${statusConfig.label}
                </span>
            </td>
            <td class="px-3 py-3 text-sm font-medium text-gray-900">${fuerPersonen || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${vonPersonen || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.id?.slice(-4) || '-'}</td>
            <td class="px-3 py-3 text-sm font-medium text-gray-900">${geschenk.geschenk || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.bezahltVon ? (KONTAKTE[geschenk.bezahltVon]?.name || '-') : '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${beteiligtePersonen || '-'}</td>
            <td class="px-3 py-3 text-sm font-bold text-gray-900">${geschenk.gesamtkosten ? formatCurrency(geschenk.gesamtkosten) : '-'}</td>
            <td class="px-3 py-3 text-sm font-bold text-green-700">${geschenk.eigeneKosten ? formatCurrency(geschenk.eigeneKosten) : '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.sollBezahlung || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.istBezahlung || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.standort || '-'}</td>
        </tr>
    `;
}

function updateDashboardStats() {
    const geschenkeArray = Object.values(GESCHENKE);
    
    // Status-Statistiken
    const stats = {
        total: geschenkeArray.length,
        offen: geschenkeArray.filter(g => ['offen', 'idee'].includes(g.status)).length,
        zuBestellen: geschenkeArray.filter(g => g.status === 'zu_bestellen').length,
        bestellt: geschenkeArray.filter(g => ['bestellt', 'teillieferung', 'teillieferung_temp', 'geliefert_temp'].includes(g.status)).length,
        abgeschlossen: geschenkeArray.filter(g => g.status === 'abgeschlossen').length,
        probleme: geschenkeArray.filter(g => ['beschaedigt', 'problem'].includes(g.status)).length
    };
    
    // Kosten-Statistiken
    const gesamtkosten = geschenkeArray.reduce((sum, g) => sum + (parseFloat(g.gesamtkosten) || 0), 0);
    const eigeneKosten = geschenkeArray.reduce((sum, g) => sum + (parseFloat(g.eigeneKosten) || 0), 0);
    
    // UI aktualisieren
    updateStatElement('gm-stat-total', stats.total);
    updateStatElement('gm-stat-offen', stats.offen);
    updateStatElement('gm-stat-bestellt', stats.bestellt);
    updateStatElement('gm-stat-abgeschlossen', stats.abgeschlossen);
    updateStatElement('gm-kosten-gesamt', formatCurrency(gesamtkosten));
    updateStatElement('gm-kosten-eigen', formatCurrency(eigeneKosten));
}

function updateStatElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ========================================
// MODAL FUNKTIONEN
// ========================================
function openCreateModal() {
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    document.getElementById('geschenkModalTitle').textContent = 'Neues Geschenk';
    document.getElementById('gm-id').value = '';
    clearModalForm();
    renderModalSelects();
    modal.style.display = 'flex';
}

window.openEditGeschenkModal = function(id) {
    const geschenk = GESCHENKE[id];
    if (!geschenk) return;
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    document.getElementById('geschenkModalTitle').textContent = 'Geschenk bearbeiten';
    document.getElementById('gm-id').value = id;
    
    fillModalForm(geschenk);
    renderModalSelects(geschenk);
    modal.style.display = 'flex';
};

function clearModalForm() {
    const fields = ['gm-geschenk', 'gm-shop', 'gm-bestellnummer', 'gm-rechnungsnummer', 
                    'gm-gesamtkosten', 'gm-eigene-kosten', 'gm-notizen'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function fillModalForm(geschenk) {
    document.getElementById('gm-geschenk').value = geschenk.geschenk || '';
    document.getElementById('gm-shop').value = geschenk.shop || '';
    document.getElementById('gm-bestellnummer').value = geschenk.bestellnummer || '';
    document.getElementById('gm-rechnungsnummer').value = geschenk.rechnungsnummer || '';
    document.getElementById('gm-gesamtkosten').value = geschenk.gesamtkosten || '';
    document.getElementById('gm-eigene-kosten').value = geschenk.eigeneKosten || '';
    document.getElementById('gm-notizen').value = geschenk.notizen || '';
}

function renderModalSelects(geschenk = null) {
    // Status
    const statusSelect = document.getElementById('gm-status');
    if (statusSelect) {
        statusSelect.innerHTML = Object.entries(STATUS_CONFIG).map(([key, config]) =>
            `<option value="${key}" ${geschenk?.status === key ? 'selected' : ''}>${config.icon} ${config.label}</option>`
        ).join('');
    }
    
    // Kontakte für FÜR, VON, Beteiligung, Bezahlt von
    const kontakteOptions = Object.values(KONTAKTE).map(k =>
        `<option value="${k.id}">${k.name}${k.istEigenePerson ? ' (Ich)' : ''}</option>`
    ).join('');
    
    ['gm-fuer', 'gm-von', 'gm-beteiligung'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = kontakteOptions;
            if (geschenk) {
                const fieldMap = { 'gm-fuer': 'fuer', 'gm-von': 'von', 'gm-beteiligung': 'beteiligung' };
                const values = geschenk[fieldMap[id]] || [];
                Array.from(select.options).forEach(opt => {
                    opt.selected = values.includes(opt.value);
                });
            }
        }
    });
    
    // Bezahlt von (Single Select)
    const bezahltVonSelect = document.getElementById('gm-bezahlt-von');
    if (bezahltVonSelect) {
        bezahltVonSelect.innerHTML = '<option value="">-- Auswählen --</option>' + kontakteOptions;
        if (geschenk?.bezahltVon) bezahltVonSelect.value = geschenk.bezahltVon;
    }
    
    // Zahlungsarten
    renderZahlungsartSelect('gm-soll-bezahlung', ZAHLUNGSART_SOLL, geschenk?.sollBezahlung);
    renderZahlungsartSelect('gm-ist-bezahlung', ZAHLUNGSART_IST, geschenk?.istBezahlung);
    
    // Standort
    const standortSelect = document.getElementById('gm-standort');
    if (standortSelect) {
        const standorte = [...geschenkeSettings.geschenkeStandorte, ...geschenkeSettings.customGeschenkeStandorte];
        standortSelect.innerHTML = '<option value="">-- Auswählen --</option>' + 
            standorte.map(s => `<option value="${s}" ${geschenk?.standort === s ? 'selected' : ''}>${s}</option>`).join('');
    }
}

function renderZahlungsartSelect(id, options, selectedValue) {
    const select = document.getElementById(id);
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Auswählen --</option>' +
        Object.entries(options).map(([key, config]) =>
            `<option value="${key}" ${selectedValue === key ? 'selected' : ''}>${config.label}</option>`
        ).join('');
}

function closeGeschenkModal() {
    const modal = document.getElementById('geschenkModal');
    if (modal) modal.style.display = 'none';
}

async function saveGeschenk() {
    const id = document.getElementById('gm-id').value;
    
    const geschenkData = {
        geschenk: document.getElementById('gm-geschenk').value.trim(),
        status: document.getElementById('gm-status').value,
        fuer: getMultiSelectValues('gm-fuer'),
        von: getMultiSelectValues('gm-von'),
        beteiligung: getMultiSelectValues('gm-beteiligung'),
        bezahltVon: document.getElementById('gm-bezahlt-von').value,
        shop: document.getElementById('gm-shop').value.trim(),
        bestellnummer: document.getElementById('gm-bestellnummer').value.trim(),
        rechnungsnummer: document.getElementById('gm-rechnungsnummer').value.trim(),
        gesamtkosten: parseFloat(document.getElementById('gm-gesamtkosten').value) || 0,
        eigeneKosten: parseFloat(document.getElementById('gm-eigene-kosten').value) || 0,
        sollBezahlung: document.getElementById('gm-soll-bezahlung').value,
        istBezahlung: document.getElementById('gm-ist-bezahlung').value,
        standort: document.getElementById('gm-standort').value,
        notizen: document.getElementById('gm-notizen').value.trim(),
        aktualisiertAm: serverTimestamp(),
        aktualisiertVon: currentUser.displayName
    };
    
    if (!geschenkData.geschenk) {
        alertUser('Bitte gib einen Geschenknamen ein.', 'warning');
        return;
    }
    
    try {
        if (id) {
            await updateDoc(doc(geschenkeCollection, id), geschenkData);
            alertUser('Geschenk aktualisiert!', 'success');
        } else {
            geschenkData.erstelltAm = serverTimestamp();
            geschenkData.erstelltVon = currentUser.displayName;
            await addDoc(geschenkeCollection, geschenkData);
            alertUser('Geschenk erstellt!', 'success');
        }
        closeGeschenkModal();
    } catch (e) {
        console.error("Fehler beim Speichern:", e);
        alertUser('Fehler beim Speichern: ' + e.message, 'error');
    }
}

function getMultiSelectValues(id) {
    const select = document.getElementById(id);
    if (!select) return [];
    return Array.from(select.selectedOptions).map(opt => opt.value);
}

// ========================================
// EINSTELLUNGEN MODAL
// ========================================
function openSettingsModal() {
    const modal = document.getElementById('geschenkeSettingsModal');
    if (!modal) return;
    
    renderSettingsTabs();
    modal.style.display = 'flex';
}

function closeSettingsModalFn() {
    const modal = document.getElementById('geschenkeSettingsModal');
    if (modal) modal.style.display = 'none';
}

function renderSettingsTabs() {
    // Kontaktbuch rendern
    renderKontaktbuch();
    // Themen rendern
    renderThemenVerwaltung();
    // Freigaben rendern
    renderFreigabenVerwaltung();
    // Optionen rendern
    renderOptionenVerwaltung();
}

function renderKontaktbuch() {
    const container = document.getElementById('gm-kontaktbuch-list');
    if (!container) return;
    
    const kontakteArray = Object.values(KONTAKTE).sort((a, b) => {
        if (a.istEigenePerson) return -1;
        if (b.istEigenePerson) return 1;
        return a.name.localeCompare(b.name);
    });
    
    container.innerHTML = kontakteArray.map(k => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg ${k.istEigenePerson ? 'border-2 border-pink-400' : ''}">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                    ${k.name.charAt(0).toUpperCase()}
                </div>
                <span class="font-medium">${k.name}</span>
                ${k.istEigenePerson ? '<span class="text-xs bg-pink-200 text-pink-800 px-2 py-0.5 rounded-full">Ich</span>' : ''}
            </div>
            ${!k.istEigenePerson ? `
                <button onclick="window.deleteKontakt('${k.id}')" class="text-red-500 hover:text-red-700 p-1">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </button>
            ` : ''}
        </div>
    `).join('');
}

function renderThemenVerwaltung() {
    const container = document.getElementById('gm-themen-list');
    if (!container) return;
    
    const themenArray = Object.values(THEMEN);
    
    container.innerHTML = themenArray.length === 0 
        ? '<p class="text-gray-500 text-center py-4">Keine Themen vorhanden</p>'
        : themenArray.map(t => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg ${t.archiviert ? 'opacity-50' : ''}">
                <div>
                    <span class="font-medium">${t.name}</span>
                    ${t.archiviert ? '<span class="text-xs bg-gray-300 text-gray-700 px-2 py-0.5 rounded-full ml-2">Archiviert</span>' : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="window.editThema('${t.id}')" class="text-blue-500 hover:text-blue-700 p-1" title="Bearbeiten">✏️</button>
                    <button onclick="window.toggleArchiveThema('${t.id}')" class="text-yellow-500 hover:text-yellow-700 p-1" title="${t.archiviert ? 'Wiederherstellen' : 'Archivieren'}">
                        ${t.archiviert ? '📤' : '📥'}
                    </button>
                    <button onclick="window.deleteThema('${t.id}')" class="text-red-500 hover:text-red-700 p-1" title="Löschen">🗑️</button>
                </div>
            </div>
        `).join('');
}

function renderFreigabenVerwaltung() {
    const container = document.getElementById('gm-freigaben-list');
    if (!container) return;
    
    // Registrierte Benutzer aus USERS
    const registrierteBenutzer = Object.values(USERS).filter(u => u.permissionType !== 'not_registered');
    
    container.innerHTML = registrierteBenutzer.length === 0
        ? '<p class="text-gray-500 text-center py-4">Keine registrierten Benutzer gefunden</p>'
        : registrierteBenutzer.map(user => {
            const freigabe = Object.values(FREIGABEN).find(f => f.userId === user.id);
            return `
                <div class="p-4 bg-gray-50 rounded-lg border">
                    <div class="flex items-center justify-between mb-3">
                        <span class="font-bold">${user.displayName || user.name}</span>
                        <button onclick="window.openFreigabeEditor('${user.id}')" class="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600">
                            Freigaben bearbeiten
                        </button>
                    </div>
                    ${freigabe ? `
                        <div class="text-xs text-gray-600">
                            <p>Themen: ${freigabe.themen?.length || 0} freigegeben</p>
                        </div>
                    ` : '<p class="text-xs text-gray-400">Keine Freigaben konfiguriert</p>'}
                </div>
            `;
        }).join('');
}

function renderOptionenVerwaltung() {
    // Status-Optionen
    renderOptionList('gm-status-optionen', STATUS_CONFIG, geschenkeSettings.customStatusOptionen, 'status');
    // Zahlungsart SOLL
    renderOptionList('gm-zahlungsart-soll-optionen', ZAHLUNGSART_SOLL, geschenkeSettings.customZahlungsartSoll, 'zahlungsartSoll');
    // Zahlungsart IST
    renderOptionList('gm-zahlungsart-ist-optionen', ZAHLUNGSART_IST, geschenkeSettings.customZahlungsartIst, 'zahlungsartIst');
    // Standorte
    renderStandortList();
}

function renderOptionList(containerId, defaultOptions, customOptions, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const allOptions = [...Object.entries(defaultOptions).map(([k, v]) => ({ key: k, label: v.label, isDefault: true })),
                        ...customOptions.map(o => ({ key: o, label: o, isDefault: false }))];
    
    container.innerHTML = allOptions.map(opt => `
        <div class="flex items-center justify-between p-2 bg-white rounded border text-sm">
            <span>${opt.label}</span>
            ${!opt.isDefault ? `<button onclick="window.removeCustomOption('${type}', '${opt.key}')" class="text-red-500">✕</button>` : ''}
        </div>
    `).join('');
}

function renderStandortList() {
    const container = document.getElementById('gm-standort-optionen');
    if (!container) return;
    
    const allStandorte = [...geschenkeSettings.geschenkeStandorte.map(s => ({ name: s, isDefault: true })),
                          ...geschenkeSettings.customGeschenkeStandorte.map(s => ({ name: s, isDefault: false }))];
    
    container.innerHTML = allStandorte.map(s => `
        <div class="flex items-center justify-between p-2 bg-white rounded border text-sm">
            <span>${s.name}</span>
            ${!s.isDefault ? `<button onclick="window.removeCustomStandort('${s.name}')" class="text-red-500">✕</button>` : ''}
        </div>
    `).join('');
}

// ========================================
// HILFSFUNKTIONEN
// ========================================
function formatCurrency(value) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function resetFilters() {
    searchTerm = '';
    currentFilter = {};
    const searchInput = document.getElementById('search-geschenke');
    if (searchInput) searchInput.value = '';
    renderGeschenkeTabelle();
}

// ========================================
// GLOBALE FUNKTIONEN (für onclick)
// ========================================
window.filterByPerson = function(personId) {
    currentFilter.personId = personId;
    renderGeschenkeTabelle();
};

window.openAddPersonToThemaModal = async function() {
    // Einfache Prompt-Lösung für schnelle Implementierung
    const kontakteList = Object.values(KONTAKTE)
        .filter(k => !THEMEN[currentThemaId]?.personen?.includes(k.id))
        .map(k => k.name)
        .join(', ');
    
    if (!kontakteList) {
        alertUser('Alle Kontakte sind bereits hinzugefügt oder es gibt keine Kontakte.', 'info');
        return;
    }
    
    const personName = prompt(`Verfügbare Kontakte: ${kontakteList}\n\nGib den Namen der Person ein:`);
    if (!personName) return;
    
    const kontakt = Object.values(KONTAKTE).find(k => k.name.toLowerCase() === personName.toLowerCase());
    if (!kontakt) {
        alertUser('Kontakt nicht gefunden. Bitte erst im Kontaktbuch anlegen.', 'warning');
        return;
    }
    
    try {
        const thema = THEMEN[currentThemaId];
        const personen = thema.personen || [];
        if (!personen.includes(kontakt.id)) {
            personen.push(kontakt.id);
            await updateDoc(doc(geschenkeThemenRef, currentThemaId), { personen });
            THEMEN[currentThemaId].personen = personen;
            renderPersonenUebersicht();
            alertUser(`${kontakt.name} wurde hinzugefügt!`, 'success');
        }
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.deleteKontakt = async function(id) {
    if (!confirm('Kontakt wirklich löschen?')) return;
    try {
        await deleteDoc(doc(geschenkeKontakteRef, id));
        delete KONTAKTE[id];
        renderKontaktbuch();
        alertUser('Kontakt gelöscht!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.editThema = function(id) {
    const thema = THEMEN[id];
    const newName = prompt('Neuer Name für das Thema:', thema.name);
    if (newName && newName !== thema.name) {
        updateDoc(doc(geschenkeThemenRef, id), { name: newName }).then(() => {
            THEMEN[id].name = newName;
            renderThemenDropdown();
            renderThemenVerwaltung();
            alertUser('Thema umbenannt!', 'success');
        });
    }
};

window.toggleArchiveThema = async function(id) {
    const thema = THEMEN[id];
    try {
        await updateDoc(doc(geschenkeThemenRef, id), { archiviert: !thema.archiviert });
        THEMEN[id].archiviert = !thema.archiviert;
        renderThemenDropdown();
        renderThemenVerwaltung();
        alertUser(thema.archiviert ? 'Thema wiederhergestellt!' : 'Thema archiviert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.deleteThema = async function(id) {
    if (!confirm('Thema und alle Geschenke darin wirklich löschen?')) return;
    try {
        await deleteDoc(doc(geschenkeThemenRef, id));
        delete THEMEN[id];
        if (currentThemaId === id) {
            currentThemaId = Object.keys(THEMEN)[0] || null;
            localStorage.setItem('gm_current_thema', currentThemaId || '');
        }
        renderThemenDropdown();
        renderThemenVerwaltung();
        renderDashboard();
        alertUser('Thema gelöscht!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Thema erstellen
window.createNewThema = async function() {
    const name = prompt('Name des neuen Themas (z.B. "Weihnachten 2025"):');
    if (!name) return;
    
    try {
        const themaData = {
            name: name.trim(),
            ersteller: currentUser.displayName,
            erstelltAm: serverTimestamp(),
            personen: [],
            archiviert: false
        };
        const docRef = await addDoc(geschenkeThemenRef, themaData);
        THEMEN[docRef.id] = { id: docRef.id, ...themaData };
        currentThemaId = docRef.id;
        localStorage.setItem('gm_current_thema', docRef.id);
        renderThemenDropdown();
        renderThemenVerwaltung();
        updateCollectionForThema();
        renderDashboard();
        alertUser('Thema erstellt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Kontakt erstellen
window.createNewKontakt = async function() {
    const name = prompt('Name des neuen Kontakts:');
    if (!name) return;
    
    try {
        const kontaktData = {
            name: name.trim(),
            erstelltAm: serverTimestamp(),
            erstelltVon: currentUser.displayName
        };
        const docRef = await addDoc(geschenkeKontakteRef, kontaktData);
        KONTAKTE[docRef.id] = { id: docRef.id, ...kontaktData };
        renderKontaktbuch();
        alertUser('Kontakt erstellt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Geschenk kopieren
window.copyGeschenk = async function(id) {
    const original = GESCHENKE[id];
    if (!original) return;
    
    try {
        const kopie = { ...original };
        delete kopie.id;
        kopie.geschenk = kopie.geschenk + ' (Kopie)';
        kopie.erstelltAm = serverTimestamp();
        kopie.erstelltVon = currentUser.displayName;
        
        await addDoc(geschenkeCollection, kopie);
        alertUser('Geschenk kopiert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Geschenk löschen
window.deleteGeschenk = async function(id) {
    if (!confirm('Geschenk wirklich löschen?')) return;
    try {
        await deleteDoc(doc(geschenkeCollection, id));
        alertUser('Geschenk gelöscht!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Als Vorlage speichern
window.saveAsVorlage = async function(id) {
    const geschenk = GESCHENKE[id];
    if (!geschenk) return;
    
    const name = prompt('Name der Vorlage:', geschenk.geschenk);
    if (!name) return;
    
    try {
        const vorlageData = {
            name: name.trim(),
            geschenkData: { ...geschenk },
            erstelltAm: serverTimestamp(),
            erstelltVon: currentUser.displayName
        };
        delete vorlageData.geschenkData.id;
        delete vorlageData.geschenkData.erstelltAm;
        
        const docRef = await addDoc(geschenkeVorlagenRef, vorlageData);
        VORLAGEN[docRef.id] = { id: docRef.id, ...vorlageData };
        alertUser('Vorlage gespeichert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Vorlage anwenden
window.applyVorlage = async function(vorlageId) {
    const vorlage = VORLAGEN[vorlageId];
    if (!vorlage) return;
    
    try {
        const geschenkData = { ...vorlage.geschenkData };
        geschenkData.erstelltAm = serverTimestamp();
        geschenkData.erstelltVon = currentUser.displayName;
        geschenkData.status = 'offen';
        
        await addDoc(geschenkeCollection, geschenkData);
        alertUser('Vorlage angewendet!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// EINLADUNGEN, BUDGETS, ERINNERUNGEN - LADEN
// ========================================
async function loadEinladungen() {
    try {
        const snapshot = await getDocs(geschenkeEinladungenRef);
        EINLADUNGEN = {};
        snapshot.forEach((docSnap) => {
            EINLADUNGEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
    } catch (e) {
        console.error("Fehler beim Laden der Einladungen:", e);
    }
}

async function loadBudgets() {
    try {
        const snapshot = await getDocs(geschenkeBudgetsRef);
        BUDGETS = {};
        snapshot.forEach((docSnap) => {
            BUDGETS[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
    } catch (e) {
        console.error("Fehler beim Laden der Budgets:", e);
    }
}

async function loadErinnerungen() {
    try {
        const snapshot = await getDocs(geschenkeErinnerungenRef);
        ERINNERUNGEN = {};
        snapshot.forEach((docSnap) => {
            ERINNERUNGEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
    } catch (e) {
        console.error("Fehler beim Laden der Erinnerungen:", e);
    }
}

// ========================================
// EINLADUNGSSYSTEM MIT ZUSTIMMUNG/ABLEHNUNG
// ========================================
function checkPendingInvitations() {
    const pendingForMe = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerId === currentUser?.odooUserId && e.status === 'pending'
    );
    
    if (pendingForMe.length > 0) {
        showPendingInvitationsModal(pendingForMe);
    }
}

function showPendingInvitationsModal(invitations) {
    const existingModal = document.getElementById('gm-einladungen-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'gm-einladungen-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div class="bg-gradient-to-r from-pink-500 to-purple-600 p-4 text-white">
                <h2 class="text-xl font-bold">📨 Ausstehende Einladungen</h2>
                <p class="text-sm opacity-90">Du hast ${invitations.length} neue Freigabe-Anfrage(n)</p>
            </div>
            <div class="p-4 max-h-[60vh] overflow-y-auto space-y-4">
                ${invitations.map(inv => `
                    <div class="border rounded-xl p-4 bg-gray-50">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold">
                                ${(inv.absenderName || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p class="font-bold">${inv.absenderName || 'Unbekannt'}</p>
                                <p class="text-xs text-gray-500">möchte Thema "${inv.themaName || 'Unbekannt'}" mit dir teilen</p>
                            </div>
                        </div>
                        <div class="text-sm text-gray-600 mb-3">
                            <p><strong>Freigaben:</strong></p>
                            <ul class="list-disc list-inside text-xs">
                                ${inv.freigaben?.fuer ? '<li>FÜR-Einträge sichtbar</li>' : ''}
                                ${inv.freigaben?.von ? '<li>VON-Einträge sichtbar</li>' : ''}
                                ${inv.freigaben?.id ? '<li>IDs sichtbar</li>' : ''}
                                ${inv.freigaben?.bezahltVon ? '<li>Bezahlt von sichtbar</li>' : ''}
                                ${inv.freigaben?.beteiligung ? '<li>Beteiligungen sichtbar</li>' : ''}
                                ${inv.freigaben?.sollBezahlung ? '<li>SOLL-Bezahlung sichtbar</li>' : ''}
                                ${inv.freigaben?.istBezahlung ? '<li>IST-Bezahlung sichtbar</li>' : ''}
                                ${inv.freigaben?.standort ? '<li>Standort sichtbar</li>' : ''}
                            </ul>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.acceptInvitation('${inv.id}')" 
                                class="flex-1 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition">
                                ✅ Annehmen
                            </button>
                            <button onclick="window.declineInvitation('${inv.id}')" 
                                class="flex-1 py-2 bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition">
                                ❌ Ablehnen
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="p-4 border-t">
                <button onclick="document.getElementById('gm-einladungen-modal').remove()" 
                    class="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    Später entscheiden
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.acceptInvitation = async function(invitationId) {
    try {
        const invitation = EINLADUNGEN[invitationId];
        if (!invitation) return;
        
        // Einladung akzeptieren
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'accepted',
            akzeptiertAm: serverTimestamp()
        });
        
        // Freigabe erstellen
        const freigabeData = {
            odooUserId: currentUser.odooUserId,
            displayName: currentUser.displayName,
            themaId: invitation.themaId,
            themaName: invitation.themaName,
            freigaben: invitation.freigaben,
            freigegebenVon: invitation.absenderId,
            freigegebenVonName: invitation.absenderName,
            erstelltAm: serverTimestamp(),
            aktiv: true
        };
        await addDoc(geschenkeFreigabenRef, freigabeData);
        
        EINLADUNGEN[invitationId].status = 'accepted';
        alertUser('Einladung angenommen! Du kannst jetzt auf das geteilte Thema zugreifen.', 'success');
        
        document.getElementById('gm-einladungen-modal')?.remove();
        await loadFreigaben();
        renderDashboard();
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.declineInvitation = async function(invitationId) {
    if (!confirm('Einladung wirklich ablehnen? Der Absender kann dich erst wieder einladen, wenn du die Ablehnung zurücknimmst.')) return;
    
    try {
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'declined',
            abgelehntAm: serverTimestamp()
        });
        
        EINLADUNGEN[invitationId].status = 'declined';
        alertUser('Einladung abgelehnt.', 'info');
        
        document.getElementById('gm-einladungen-modal')?.remove();
        checkPendingInvitations();
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.revokeDecline = async function(invitationId) {
    try {
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'revoked',
            widerrufenAm: serverTimestamp()
        });
        
        EINLADUNGEN[invitationId].status = 'revoked';
        alertUser('Ablehnung zurückgenommen. Der Absender kann dich jetzt erneut einladen.', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.endSharing = async function(freigabeId) {
    if (!confirm('Freigabe wirklich beenden? Du verlierst den Zugriff auf dieses Thema.')) return;
    
    try {
        await updateDoc(doc(geschenkeFreigabenRef, freigabeId), {
            aktiv: false,
            beendetAm: serverTimestamp(),
            beendetVon: currentUser.displayName
        });
        
        alertUser('Freigabe beendet.', 'success');
        await loadFreigaben();
        renderDashboard();
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Einladung senden
window.sendInvitation = async function(userId, userName, themaId, freigaben) {
    // Prüfen ob bereits eine abgelehnte Einladung existiert
    const existingDeclined = Object.values(EINLADUNGEN).find(e => 
        e.empfaengerId === userId && 
        e.themaId === themaId && 
        e.absenderId === currentUser.odooUserId &&
        e.status === 'declined'
    );
    
    if (existingDeclined) {
        alertUser('Diese Person hat deine vorherige Einladung abgelehnt. Du kannst erst wieder einladen, wenn sie die Ablehnung zurücknimmt.', 'warning');
        return false;
    }
    
    // Prüfen ob bereits eine ausstehende Einladung existiert
    const existingPending = Object.values(EINLADUNGEN).find(e => 
        e.empfaengerId === userId && 
        e.themaId === themaId && 
        e.absenderId === currentUser.odooUserId &&
        e.status === 'pending'
    );
    
    if (existingPending) {
        alertUser('Es gibt bereits eine ausstehende Einladung für diese Person.', 'warning');
        return false;
    }
    
    try {
        const thema = THEMEN[themaId];
        const einladungData = {
            absenderId: currentUser.odooUserId,
            absenderName: currentUser.displayName,
            empfaengerId: userId,
            empfaengerName: userName,
            themaId: themaId,
            themaName: thema?.name || 'Unbekannt',
            freigaben: freigaben,
            status: 'pending',
            erstelltAm: serverTimestamp()
        };
        
        const docRef = await addDoc(geschenkeEinladungenRef, einladungData);
        EINLADUNGEN[docRef.id] = { id: docRef.id, ...einladungData };
        
        alertUser(`Einladung an ${userName} gesendet!`, 'success');
        return true;
    } catch (e) {
        alertUser('Fehler beim Senden der Einladung: ' + e.message, 'error');
        return false;
    }
};

// ========================================
// FREIGABE-FILTER-LOGIK (Punkt 18)
// ========================================
function filterGeschenkeByFreigaben(geschenkeArray, freigabe) {
    if (!freigabe || !freigabe.freigaben) return geschenkeArray;
    
    return geschenkeArray.filter(geschenk => {
        // Prüfe ob der Benutzer dieses Geschenk sehen darf basierend auf Freigaben
        const f = freigabe.freigaben;
        
        // Wenn spezifische Personen-Filter gesetzt sind
        if (f.fuerPersonen && f.fuerPersonen.length > 0) {
            const hatFuerMatch = geschenk.fuer?.some(personId => f.fuerPersonen.includes(personId));
            if (!hatFuerMatch) return false;
        }
        
        if (f.vonPersonen && f.vonPersonen.length > 0) {
            const hatVonMatch = geschenk.von?.some(personId => f.vonPersonen.includes(personId));
            if (!hatVonMatch) return false;
        }
        
        if (f.bezahltVonPersonen && f.bezahltVonPersonen.length > 0) {
            if (!f.bezahltVonPersonen.includes(geschenk.bezahltVon)) return false;
        }
        
        if (f.beteiligungPersonen && f.beteiligungPersonen.length > 0) {
            const hatBeteiligungMatch = geschenk.beteiligung?.some(personId => f.beteiligungPersonen.includes(personId));
            if (!hatBeteiligungMatch) return false;
        }
        
        // Wenn spezifische IDs freigegeben sind
        if (f.spezifischeIds && f.spezifischeIds.length > 0) {
            if (!f.spezifischeIds.includes(geschenk.id)) return false;
        }
        
        return true;
    });
}

function getVisibleFieldsForFreigabe(freigabe) {
    if (!freigabe || !freigabe.freigaben) {
        return { fuer: true, von: true, id: true, bezahltVon: true, beteiligung: true, sollBezahlung: true, istBezahlung: true, standort: true };
    }
    
    return {
        fuer: freigabe.freigaben.fuer !== false,
        von: freigabe.freigaben.von !== false,
        id: freigabe.freigaben.id !== false,
        bezahltVon: freigabe.freigaben.bezahltVon !== false,
        beteiligung: freigabe.freigaben.beteiligung !== false,
        sollBezahlung: freigabe.freigaben.sollBezahlung !== false,
        istBezahlung: freigabe.freigaben.istBezahlung !== false,
        standort: freigabe.freigaben.standort !== false
    };
}

// ========================================
// BUDGET-SYSTEM
// ========================================
window.openBudgetModal = function() {
    const existingModal = document.getElementById('gm-budget-modal');
    if (existingModal) existingModal.remove();
    
    const thema = THEMEN[currentThemaId];
    const budget = Object.values(BUDGETS).find(b => b.themaId === currentThemaId);
    
    const modal = document.createElement('div');
    modal.id = 'gm-budget-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div class="bg-gradient-to-r from-green-500 to-teal-600 p-4 text-white rounded-t-2xl">
                <h2 class="text-xl font-bold">💰 Budget verwalten</h2>
                <p class="text-sm opacity-90">${thema?.name || 'Aktuelles Thema'}</p>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Gesamtbudget (€)</label>
                    <input type="number" id="budget-gesamt" value="${budget?.gesamtBudget || ''}" 
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" placeholder="z.B. 500">
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Budget pro Person (€)</label>
                    <input type="number" id="budget-pro-person" value="${budget?.budgetProPerson || ''}" 
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" placeholder="z.B. 50">
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Warnung bei (% des Budgets)</label>
                    <input type="number" id="budget-warnung" value="${budget?.warnungBei || 80}" 
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" placeholder="80">
                </div>
                
                ${budget ? `
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-sm font-bold text-gray-700">Aktueller Stand:</p>
                        <div class="mt-2">
                            <div class="flex justify-between text-sm">
                                <span>Ausgegeben:</span>
                                <span class="font-bold">${formatCurrency(calculateTotalSpent())}</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span>Verbleibend:</span>
                                <span class="font-bold ${(budget.gesamtBudget - calculateTotalSpent()) < 0 ? 'text-red-600' : 'text-green-600'}">
                                    ${formatCurrency(budget.gesamtBudget - calculateTotalSpent())}
                                </span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3 mt-2">
                                <div class="h-3 rounded-full transition-all ${getBudgetProgressColor(budget)}" 
                                    style="width: ${Math.min(100, (calculateTotalSpent() / budget.gesamtBudget) * 100)}%"></div>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
            <div class="p-4 border-t flex gap-2">
                <button onclick="document.getElementById('gm-budget-modal').remove()" 
                    class="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    Abbrechen
                </button>
                <button onclick="window.saveBudget()" 
                    class="flex-1 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition">
                    💾 Speichern
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

function calculateTotalSpent() {
    return Object.values(GESCHENKE).reduce((sum, g) => sum + (parseFloat(g.eigeneKosten) || 0), 0);
}

function getBudgetProgressColor(budget) {
    const percent = (calculateTotalSpent() / budget.gesamtBudget) * 100;
    if (percent >= 100) return 'bg-red-500';
    if (percent >= budget.warnungBei) return 'bg-yellow-500';
    return 'bg-green-500';
}

window.saveBudget = async function() {
    const gesamtBudget = parseFloat(document.getElementById('budget-gesamt').value) || 0;
    const budgetProPerson = parseFloat(document.getElementById('budget-pro-person').value) || 0;
    const warnungBei = parseFloat(document.getElementById('budget-warnung').value) || 80;
    
    try {
        const existingBudget = Object.values(BUDGETS).find(b => b.themaId === currentThemaId);
        
        const budgetData = {
            themaId: currentThemaId,
            gesamtBudget,
            budgetProPerson,
            warnungBei,
            aktualisiertAm: serverTimestamp(),
            aktualisiertVon: currentUser.displayName
        };
        
        if (existingBudget) {
            await updateDoc(doc(geschenkeBudgetsRef, existingBudget.id), budgetData);
            BUDGETS[existingBudget.id] = { ...existingBudget, ...budgetData };
        } else {
            budgetData.erstelltAm = serverTimestamp();
            const docRef = await addDoc(geschenkeBudgetsRef, budgetData);
            BUDGETS[docRef.id] = { id: docRef.id, ...budgetData };
        }
        
        alertUser('Budget gespeichert!', 'success');
        document.getElementById('gm-budget-modal')?.remove();
        updateDashboardStats();
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// ERINNERUNGEN/BENACHRICHTIGUNGEN
// ========================================
window.openErinnerungModal = function(geschenkId = null) {
    const existingModal = document.getElementById('gm-erinnerung-modal');
    if (existingModal) existingModal.remove();
    
    const geschenk = geschenkId ? GESCHENKE[geschenkId] : null;
    
    const modal = document.createElement('div');
    modal.id = 'gm-erinnerung-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div class="bg-gradient-to-r from-orange-500 to-red-600 p-4 text-white rounded-t-2xl">
                <h2 class="text-xl font-bold">🔔 Erinnerung erstellen</h2>
                ${geschenk ? `<p class="text-sm opacity-90">Für: ${geschenk.geschenk}</p>` : ''}
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Erinnerungsdatum</label>
                    <input type="datetime-local" id="erinnerung-datum" 
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500">
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Nachricht</label>
                    <textarea id="erinnerung-nachricht" rows="3"
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                        placeholder="z.B. Geschenk bestellen nicht vergessen!">${geschenk ? `Erinnerung für "${geschenk.geschenk}"` : ''}</textarea>
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Typ</label>
                    <select id="erinnerung-typ" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500">
                        <option value="bestellen">🛒 Bestellen</option>
                        <option value="abholen">📦 Abholen</option>
                        <option value="verpacken">🎁 Verpacken</option>
                        <option value="bezahlen">💳 Bezahlen</option>
                        <option value="sonstiges">📝 Sonstiges</option>
                    </select>
                </div>
            </div>
            <div class="p-4 border-t flex gap-2">
                <button onclick="document.getElementById('gm-erinnerung-modal').remove()" 
                    class="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    Abbrechen
                </button>
                <button onclick="window.saveErinnerung('${geschenkId || ''}')" 
                    class="flex-1 py-2 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-600 transition">
                    🔔 Speichern
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.saveErinnerung = async function(geschenkId) {
    const datum = document.getElementById('erinnerung-datum').value;
    const nachricht = document.getElementById('erinnerung-nachricht').value;
    const typ = document.getElementById('erinnerung-typ').value;
    
    if (!datum) {
        alertUser('Bitte wähle ein Datum aus.', 'warning');
        return;
    }
    
    try {
        const erinnerungData = {
            datum: new Date(datum),
            nachricht,
            typ,
            geschenkId: geschenkId || null,
            themaId: currentThemaId,
            odooUserId: currentUser.odooUserId,
            erstelltAm: serverTimestamp(),
            erledigt: false
        };
        
        const docRef = await addDoc(geschenkeErinnerungenRef, erinnerungData);
        ERINNERUNGEN[docRef.id] = { id: docRef.id, ...erinnerungData };
        
        alertUser('Erinnerung gespeichert!', 'success');
        document.getElementById('gm-erinnerung-modal')?.remove();
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.markErinnerungDone = async function(erinnerungId) {
    try {
        await updateDoc(doc(geschenkeErinnerungenRef, erinnerungId), {
            erledigt: true,
            erledigtAm: serverTimestamp()
        });
        ERINNERUNGEN[erinnerungId].erledigt = true;
        alertUser('Erinnerung als erledigt markiert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// JAHRESVERGLEICH
// ========================================
window.openJahresvergleichModal = function() {
    const existingModal = document.getElementById('gm-jahresvergleich-modal');
    if (existingModal) existingModal.remove();
    
    // Sammle Daten aus allen Themen
    const themenMitDaten = Object.values(THEMEN).map(thema => {
        const jahr = extractYearFromThemaName(thema.name);
        return {
            ...thema,
            jahr,
            // Hier würden wir die Geschenke-Daten pro Thema laden
        };
    }).filter(t => t.jahr);
    
    // Gruppiere nach Jahr
    const jahresDaten = {};
    themenMitDaten.forEach(thema => {
        if (!jahresDaten[thema.jahr]) {
            jahresDaten[thema.jahr] = { themen: [], gesamtkosten: 0, anzahl: 0 };
        }
        jahresDaten[thema.jahr].themen.push(thema);
    });
    
    const modal = document.createElement('div');
    modal.id = 'gm-jahresvergleich-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 text-white rounded-t-2xl">
                <h2 class="text-xl font-bold">📊 Jahresvergleich</h2>
                <p class="text-sm opacity-90">Vergleiche deine Ausgaben über die Jahre</p>
            </div>
            <div class="p-6 max-h-[60vh] overflow-y-auto">
                ${Object.keys(jahresDaten).length === 0 ? `
                    <p class="text-center text-gray-500 py-8">Keine Jahresdaten verfügbar. Benenne deine Themen mit Jahreszahlen (z.B. "Weihnachten 2024").</p>
                ` : `
                    <div class="space-y-4">
                        ${Object.entries(jahresDaten).sort((a, b) => b[0] - a[0]).map(([jahr, daten]) => `
                            <div class="border rounded-xl p-4">
                                <div class="flex justify-between items-center mb-2">
                                    <h3 class="text-lg font-bold text-gray-800">${jahr}</h3>
                                    <span class="text-sm text-gray-500">${daten.themen.length} Thema/Themen</span>
                                </div>
                                <div class="grid grid-cols-2 gap-4 text-sm">
                                    <div class="bg-gray-50 p-3 rounded-lg">
                                        <p class="text-gray-500">Themen</p>
                                        <p class="font-bold">${daten.themen.map(t => t.name).join(', ')}</p>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
            <div class="p-4 border-t">
                <button onclick="document.getElementById('gm-jahresvergleich-modal').remove()" 
                    class="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

function extractYearFromThemaName(name) {
    const match = name.match(/\b(20\d{2})\b/);
    return match ? match[1] : null;
}

// ========================================
// EXPORT-FUNKTIONEN (Excel/PDF)
// ========================================
window.exportToExcel = function() {
    const geschenkeArray = Object.values(GESCHENKE);
    const thema = THEMEN[currentThemaId];
    
    // CSV erstellen (Excel-kompatibel)
    const headers = ['Status', 'FÜR', 'VON', 'ID', 'Geschenk', 'Shop', 'Bezahlt von', 'Beteiligung', 'Gesamtkosten', 'Eigene Kosten', 'SOLL-Bezahlung', 'IST-Bezahlung', 'Standort', 'Bestellnummer', 'Rechnungsnummer', 'Notizen'];
    
    const rows = geschenkeArray.map(g => [
        STATUS_CONFIG[g.status]?.label || g.status,
        (g.fuer || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join('; '),
        (g.von || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join('; '),
        g.id?.slice(-4) || '',
        g.geschenk || '',
        g.shop || '',
        KONTAKTE[g.bezahltVon]?.name || '',
        (g.beteiligung || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join('; '),
        g.gesamtkosten || 0,
        g.eigeneKosten || 0,
        ZAHLUNGSART_SOLL[g.sollBezahlung]?.label || g.sollBezahlung || '',
        ZAHLUNGSART_IST[g.istBezahlung]?.label || g.istBezahlung || '',
        g.standort || '',
        g.bestellnummer || '',
        g.rechnungsnummer || '',
        g.notizen || ''
    ]);
    
    // BOM für Excel UTF-8
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers, ...rows].map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Geschenke_${thema?.name || 'Export'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    alertUser('Export als CSV erstellt!', 'success');
};

window.exportToPDF = function() {
    const geschenkeArray = Object.values(GESCHENKE);
    const thema = THEMEN[currentThemaId];
    
    // Einfache HTML-to-Print Lösung
    const printWindow = window.open('', '_blank');
    
    const stats = {
        total: geschenkeArray.length,
        abgeschlossen: geschenkeArray.filter(g => g.status === 'abgeschlossen').length,
        gesamtkosten: geschenkeArray.reduce((sum, g) => sum + (parseFloat(g.gesamtkosten) || 0), 0),
        eigeneKosten: geschenkeArray.reduce((sum, g) => sum + (parseFloat(g.eigeneKosten) || 0), 0)
    };
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Geschenkeliste - ${thema?.name || 'Export'}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #db2777; border-bottom: 2px solid #db2777; padding-bottom: 10px; }
                .stats { display: flex; gap: 20px; margin-bottom: 20px; }
                .stat-box { background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; }
                .stat-value { font-size: 24px; font-weight: bold; color: #db2777; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                th { background: #db2777; color: white; }
                tr:nth-child(even) { background: #f9f9f9; }
                .footer { margin-top: 20px; text-align: center; color: #666; font-size: 12px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>🎁 ${thema?.name || 'Geschenkeliste'}</h1>
            <div class="stats">
                <div class="stat-box">
                    <div class="stat-value">${stats.total}</div>
                    <div>Gesamt</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${stats.abgeschlossen}</div>
                    <div>Abgeschlossen</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${formatCurrency(stats.gesamtkosten)}</div>
                    <div>Gesamtkosten</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${formatCurrency(stats.eigeneKosten)}</div>
                    <div>Eigene Kosten</div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>FÜR</th>
                        <th>Geschenk</th>
                        <th>Gesamtkosten</th>
                        <th>Eigene Kosten</th>
                        <th>Standort</th>
                    </tr>
                </thead>
                <tbody>
                    ${geschenkeArray.map(g => `
                        <tr>
                            <td>${STATUS_CONFIG[g.status]?.icon || ''} ${STATUS_CONFIG[g.status]?.label || g.status}</td>
                            <td>${(g.fuer || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ')}</td>
                            <td>${g.geschenk || '-'}</td>
                            <td>${formatCurrency(g.gesamtkosten || 0)}</td>
                            <td>${formatCurrency(g.eigeneKosten || 0)}</td>
                            <td>${g.standort || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="footer">
                Erstellt am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')}
            </div>
            <script>window.print();</script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

// ========================================
// FREIGABE-EDITOR (erweitert)
// ========================================
window.openFreigabeEditor = function(userId) {
    const user = Object.values(USERS).find(u => u.id === userId);
    if (!user) return;
    
    const existingFreigabe = Object.values(FREIGABEN).find(f => f.odooUserId === userId);
    
    const existingModal = document.getElementById('gm-freigabe-editor-modal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'gm-freigabe-editor-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
            <div class="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 text-white rounded-t-2xl">
                <h2 class="text-xl font-bold">🔐 Freigaben für ${user.displayName || user.name}</h2>
            </div>
            <div class="p-6 max-h-[70vh] overflow-y-auto space-y-6">
                <!-- Thema auswählen -->
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">Thema freigeben</label>
                    <select id="freigabe-thema" class="w-full px-4 py-2 border rounded-lg">
                        <option value="">-- Thema auswählen --</option>
                        ${Object.values(THEMEN).filter(t => !t.archiviert).map(t => 
                            `<option value="${t.id}">${t.name}</option>`
                        ).join('')}
                    </select>
                </div>
                
                <!-- Sichtbare Felder -->
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">Sichtbare Felder</label>
                    <div class="grid grid-cols-2 gap-2">
                        <label class="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input type="checkbox" id="freigabe-fuer" checked class="rounded">
                            <span>FÜR</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input type="checkbox" id="freigabe-von" checked class="rounded">
                            <span>VON</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input type="checkbox" id="freigabe-id" checked class="rounded">
                            <span>ID</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input type="checkbox" id="freigabe-bezahlt-von" checked class="rounded">
                            <span>Bezahlt von</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input type="checkbox" id="freigabe-beteiligung" checked class="rounded">
                            <span>Beteiligung</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input type="checkbox" id="freigabe-soll" checked class="rounded">
                            <span>SOLL-Bezahlung</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input type="checkbox" id="freigabe-ist" checked class="rounded">
                            <span>IST-Bezahlung</span>
                        </label>
                        <label class="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <input type="checkbox" id="freigabe-standort" checked class="rounded">
                            <span>Standort</span>
                        </label>
                    </div>
                </div>
                
                <!-- Filter nach Personen -->
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">Nur Einträge FÜR bestimmte Personen zeigen (optional)</label>
                    <select id="freigabe-fuer-personen" multiple class="w-full px-4 py-2 border rounded-lg h-24">
                        ${Object.values(KONTAKTE).map(k => 
                            `<option value="${k.id}">${k.name}</option>`
                        ).join('')}
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Mehrfachauswahl mit Strg/Cmd. Leer lassen = alle Einträge sichtbar.</p>
                </div>
            </div>
            <div class="p-4 border-t flex gap-2">
                <button onclick="document.getElementById('gm-freigabe-editor-modal').remove()" 
                    class="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    Abbrechen
                </button>
                <button onclick="window.sendFreigabeInvitation('${userId}', '${user.displayName || user.name}')" 
                    class="flex-1 py-2 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 transition">
                    📨 Einladung senden
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.sendFreigabeInvitation = async function(userId, userName) {
    const themaId = document.getElementById('freigabe-thema').value;
    if (!themaId) {
        alertUser('Bitte wähle ein Thema aus.', 'warning');
        return;
    }
    
    const freigaben = {
        fuer: document.getElementById('freigabe-fuer').checked,
        von: document.getElementById('freigabe-von').checked,
        id: document.getElementById('freigabe-id').checked,
        bezahltVon: document.getElementById('freigabe-bezahlt-von').checked,
        beteiligung: document.getElementById('freigabe-beteiligung').checked,
        sollBezahlung: document.getElementById('freigabe-soll').checked,
        istBezahlung: document.getElementById('freigabe-ist').checked,
        standort: document.getElementById('freigabe-standort').checked,
        fuerPersonen: Array.from(document.getElementById('freigabe-fuer-personen').selectedOptions).map(o => o.value)
    };
    
    const success = await window.sendInvitation(userId, userName, themaId, freigaben);
    if (success) {
        document.getElementById('gm-freigabe-editor-modal')?.remove();
    }
};
