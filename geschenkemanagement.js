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

// Vereinheitlichte Zahlungsarten (für SOLL und IST)
export const ZAHLUNGSARTEN = {
    konto_weihnachten: { label: 'Konto-Weihnachten' },
    hauptkonto: { label: 'Hauptkonto' },
    lastschrift_hauptkonto: { label: 'Lastschrift-Hauptkonto' },
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
    zahlungsarten: Object.keys(ZAHLUNGSARTEN),
    geschenkeStandorte: ['zu Hause', 'Anderer Standort'],
    customStatusOptionen: [],
    customZahlungsarten: [],
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
        geschenkeCollection = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_themen', currentThemaId, 'geschenke');
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
    
    // Gesamtstatistik berechnen
    const alleGeschenke = Object.values(GESCHENKE);
    const gesamtStats = {
        total: alleGeschenke.length,
        fertig: alleGeschenke.filter(g => g.status === 'abgeschlossen').length
    };
    
    // Personen-Daten sammeln
    const personenDaten = thema.personen.map(personId => {
        const person = KONTAKTE[personId];
        if (!person) return null;
        
        const geschenkeFuerPerson = alleGeschenke.filter(g => g.fuer && g.fuer.includes(personId));
        return {
            id: personId,
            name: person.name,
            total: geschenkeFuerPerson.length,
            offen: geschenkeFuerPerson.filter(g => ['offen', 'idee', 'zu_bestellen'].includes(g.status)).length,
            bestellt: geschenkeFuerPerson.filter(g => ['bestellt', 'teillieferung'].includes(g.status)).length,
            fertig: geschenkeFuerPerson.filter(g => g.status === 'abgeschlossen').length
        };
    }).filter(p => p !== null);
    
    // HTML mit ausklappbarer Übersicht
    let html = `
        <div class="bg-white rounded-xl shadow-md p-4 mb-4">
            <div class="flex items-center justify-between cursor-pointer" onclick="window.togglePersonenDetails()">
                <div class="flex items-center gap-4">
                    <div class="text-2xl">👥</div>
                    <div>
                        <p class="font-bold text-gray-800 text-lg">Personen-Übersicht</p>
                        <p class="text-sm text-gray-600">
                            <span class="font-bold text-green-600">${gesamtStats.fertig}</span> von 
                            <span class="font-bold">${gesamtStats.total}</span> Geschenken fertig
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-32 bg-gray-200 rounded-full h-3">
                        <div class="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all" 
                             style="width: ${gesamtStats.total > 0 ? Math.round((gesamtStats.fertig / gesamtStats.total) * 100) : 0}%"></div>
                    </div>
                    <span id="gm-personen-toggle-icon" class="text-gray-500 transition-transform">▼</span>
                </div>
            </div>
        </div>
        
        <div id="gm-personen-details" class="hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    `;
    
    personenDaten.forEach(p => {
        const progressPercent = p.total > 0 ? Math.round((p.fertig / p.total) * 100) : 0;
        
        html += `
            <div class="bg-white rounded-xl shadow-md p-4 border-l-4 border-pink-500 hover:shadow-lg transition cursor-pointer" 
                 onclick="window.filterByPerson('${p.id}')">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                        ${p.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-800 text-base leading-tight" style="word-wrap: break-word; overflow-wrap: break-word;">${p.name}</p>
                        <p class="text-sm text-gray-500">${p.fertig}/${p.total} fertig</p>
                    </div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div class="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full transition-all" style="width: ${progressPercent}%"></div>
                </div>
                <div class="grid grid-cols-3 gap-1 text-xs text-center">
                    <div class="bg-red-50 rounded p-1">
                        <span class="font-bold text-red-600">${p.offen}</span>
                        <span class="text-gray-500 block">offen</span>
                    </div>
                    <div class="bg-blue-50 rounded p-1">
                        <span class="font-bold text-blue-600">${p.bestellt}</span>
                        <span class="text-gray-500 block">bestellt</span>
                    </div>
                    <div class="bg-green-50 rounded p-1">
                        <span class="font-bold text-green-600">${p.fertig}</span>
                        <span class="text-gray-500 block">fertig</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
        <div class="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-4 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition"
             onclick="window.openAddPersonToThemaModal()">
            <div class="text-center text-gray-500">
                <span class="text-3xl">+</span>
                <p class="text-sm font-semibold mt-1">Person hinzufügen</p>
            </div>
        </div>
    </div>`;
    
    container.innerHTML = html;
}

// Toggle für Personen-Details
window.togglePersonenDetails = function() {
    const details = document.getElementById('gm-personen-details');
    const icon = document.getElementById('gm-personen-toggle-icon');
    if (details && icon) {
        if (details.classList.contains('hidden')) {
            details.classList.remove('hidden');
            icon.textContent = '▼';
            icon.style.transform = 'rotate(0deg)';
        } else {
            details.classList.add('hidden');
            icon.textContent = '▶';
            icon.style.transform = 'rotate(0deg)';
        }
    }
};

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
    // Prüfe ob ein Thema ausgewählt ist
    if (!currentThemaId) {
        alertUser('Bitte erstelle zuerst ein Thema in den Einstellungen, bevor du Geschenke hinzufügst.', 'warning');
        return;
    }
    
    const thema = THEMEN[currentThemaId];
    if (!thema?.personen || thema.personen.length === 0) {
        alertUser('Bitte füge zuerst Personen zum Thema hinzu, bevor du Geschenke erstellst.', 'warning');
        return;
    }
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    document.getElementById('geschenkModalTitle').textContent = 'Neues Geschenk';
    const idField = document.getElementById('gm-id');
    idField.value = '';
    idField.removeAttribute('data-is-copy'); // Entferne Kopie-Markierung
    clearModalForm();
    renderModalSelects();
    updateModalActionButtons(false, true); // Keine Aktions-Buttons, aber "Vorlage laden" anzeigen
    modal.style.display = 'flex';
}

// Aktions-Buttons im Modal ein-/ausblenden
function updateModalActionButtons(showActions, showVorlageButton = false) {
    const actionsContainer = document.getElementById('gm-modal-actions');
    const vorlageButton = document.getElementById('gm-btn-vorlage-laden');
    
    // Bearbeitungs-Buttons (Kopieren, Vorlage speichern, Löschen)
    if (actionsContainer) {
        actionsContainer.style.display = showActions ? 'flex' : 'none';
    }
    
    // "Vorlage laden" Button nur bei neuem Eintrag anzeigen
    if (vorlageButton) {
        vorlageButton.style.display = showVorlageButton ? 'inline-flex' : 'none';
    }
}

window.openEditGeschenkModal = function(id) {
    const geschenk = GESCHENKE[id];
    if (!geschenk) return;
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    document.getElementById('geschenkModalTitle').textContent = 'Geschenk bearbeiten';
    const idField = document.getElementById('gm-id');
    idField.value = id;
    idField.removeAttribute('data-is-copy'); // Entferne Kopie-Markierung
    
    fillModalForm(geschenk);
    renderModalSelects(geschenk);
    updateModalActionButtons(true, false); // Aktions-Buttons anzeigen, aber KEIN "Vorlage laden" Button
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
    
    // Checkbox-basierte Personenauswahl für FÜR, VON, Beteiligung
    renderPersonenCheckboxes('gm-fuer-checkboxes', 'gm-fuer', geschenk?.fuer || []);
    renderPersonenCheckboxes('gm-von-checkboxes', 'gm-von', geschenk?.von || []);
    renderPersonenCheckboxes('gm-beteiligung-checkboxes', 'gm-beteiligung', geschenk?.beteiligung || []);
    
    // Bezahlt von (Single Select)
    const kontakteOptions = Object.values(KONTAKTE).map(k =>
        `<option value="${k.id}">${k.name}${k.istEigenePerson ? ' (Ich)' : ''}</option>`
    ).join('');
    
    const bezahltVonSelect = document.getElementById('gm-bezahlt-von');
    if (bezahltVonSelect) {
        bezahltVonSelect.innerHTML = '<option value="">-- Auswählen --</option>' + kontakteOptions;
        if (geschenk?.bezahltVon) bezahltVonSelect.value = geschenk.bezahltVon;
    }
    
    // Zahlungsarten (beide nutzen dieselbe Liste)
    renderZahlungsartSelect('gm-soll-bezahlung', ZAHLUNGSARTEN, geschenk?.sollBezahlung);
    renderZahlungsartSelect('gm-ist-bezahlung', ZAHLUNGSARTEN, geschenk?.istBezahlung);
    
    // Standort
    const standortSelect = document.getElementById('gm-standort');
    if (standortSelect) {
        const standorte = [...geschenkeSettings.geschenkeStandorte, ...geschenkeSettings.customGeschenkeStandorte];
        standortSelect.innerHTML = '<option value="">-- Auswählen --</option>' + 
            standorte.map(s => `<option value="${s}" ${geschenk?.standort === s ? 'selected' : ''}>${s}</option>`).join('');
    }
}

// Checkbox-basierte Personenauswahl rendern
function renderPersonenCheckboxes(containerId, fieldName, selectedValues) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const kontakte = Object.values(KONTAKTE).sort((a, b) => {
        if (a.istEigenePerson) return -1;
        if (b.istEigenePerson) return 1;
        return a.name.localeCompare(b.name);
    });
    
    container.innerHTML = kontakte.map(k => {
        const isChecked = selectedValues.includes(k.id);
        return `
            <label class="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-pink-50 transition ${isChecked ? 'bg-pink-100' : ''}">
                <input type="checkbox" name="${fieldName}" value="${k.id}" 
                    ${isChecked ? 'checked' : ''}
                    onchange="window.updateEigeneKostenAuto()"
                    class="w-4 h-4 text-pink-600 rounded focus:ring-pink-500">
                <span class="text-sm ${k.istEigenePerson ? 'font-bold text-pink-600' : 'text-gray-700'}">
                    ${k.name}${k.istEigenePerson ? ' (Ich)' : ''}
                </span>
            </label>
        `;
    }).join('');
}

// Auto-Berechnung: Wenn nur ICH an Geschenk beteiligt bin → Eigene Kosten = Gesamtkosten
window.updateEigeneKostenAuto = function() {
    const beteiligungCheckboxes = document.querySelectorAll('input[name="gm-beteiligung"]:checked');
    const gesamtkostenInput = document.getElementById('gm-gesamtkosten');
    const eigeneKostenInput = document.getElementById('gm-eigene-kosten');
    const hintElement = document.getElementById('gm-eigene-kosten-hint');
    
    if (!beteiligungCheckboxes || !gesamtkostenInput || !eigeneKostenInput) return;
    
    const beteiligteIds = Array.from(beteiligungCheckboxes).map(cb => cb.value);
    
    // Wenn nur ICH beteiligt bin (eigenePerson.id)
    if (beteiligteIds.length === 1 && eigenePerson && beteiligteIds[0] === eigenePerson.id) {
        const gesamtkosten = parseFloat(gesamtkostenInput.value) || 0;
        eigeneKostenInput.value = gesamtkosten.toFixed(2);
        eigeneKostenInput.readOnly = true;
        eigeneKostenInput.style.backgroundColor = '#e0f2fe'; // Hellblau
        eigeneKostenInput.style.borderColor = '#0ea5e9'; // Blau
        if (hintElement) hintElement.textContent = '✨ Auto-berechnet';
    } else {
        eigeneKostenInput.readOnly = false;
        eigeneKostenInput.style.backgroundColor = '';
        eigeneKostenInput.style.borderColor = '';
        if (hintElement) hintElement.textContent = '';
    }
};

// Checkbox-Werte auslesen
function getCheckboxValues(fieldName) {
    const checkboxes = document.querySelectorAll(`input[name="${fieldName}"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
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
        fuer: getCheckboxValues('gm-fuer'),
        von: getCheckboxValues('gm-von'),
        beteiligung: getCheckboxValues('gm-beteiligung'),
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
    console.log('📋 renderSettingsTabs aufgerufen');
    console.log('👥 USERS verfügbar:', Object.keys(USERS).length, 'User(s)');
    console.log('🔑 currentUser:', currentUser?.displayName, currentUser?.odooUserId);
    
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

// ========================================
// NEUES FREIGABEMANAGEMENT-SYSTEM
// ========================================

function renderFreigabenVerwaltung() {
    const container = document.getElementById('gm-freigaben-list');
    if (!container) return;
    
    // DEBUG: Prüfe USERS und currentUser
    console.log('🔍 DEBUG Freigaben:', {
        totalUsers: Object.keys(USERS).length,
        usersIsEmpty: Object.keys(USERS).length === 0,
        currentUserId: currentUser?.odooUserId,
        currentUserName: currentUser?.displayName,
        usersArray: Object.values(USERS).slice(0, 5).map(u => ({
            id: u.id,
            odooUserId: u.odooUserId,
            name: u.name || u.displayName,
            permissionType: u.permissionType
        }))
    });
    
    // Prüfe ob USERS geladen ist
    if (!USERS || Object.keys(USERS).length === 0) {
        container.innerHTML = `
            <div class="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                <p class="text-sm text-yellow-800">
                    <strong>⚠️ Benutzerdaten werden geladen...</strong><br>
                    Falls diese Meldung bestehen bleibt, lade die Seite bitte neu.
                </p>
                <button onclick="location.reload()" class="mt-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-bold">
                    🔄 Seite neu laden
                </button>
            </div>
        `;
        
        // Versuche nach 2 Sekunden erneut zu rendern
        setTimeout(() => {
            if (Object.keys(USERS).length > 0) {
                renderFreigabenVerwaltung();
            }
        }, 2000);
        return;
    }
    
    // Registrierte Benutzer (außer ich selbst)
    const registrierteBenutzer = Object.values(USERS).filter(u => {
        if (!u) return false;
        if (u.permissionType === 'not_registered') return false;
        
        // Vergleiche mit mehreren Feldern um sicherzugehen
        if (u.id === currentUser?.odooUserId) return false;
        if (u.odooUserId === currentUser?.odooUserId) return false;
        if (u.displayName === currentUser?.displayName) return false;
        if (u.name === currentUser?.displayName) return false;
        
        return true;
    });
    
    console.log('✅ Gefilterte Benutzer:', registrierteBenutzer.length, registrierteBenutzer.map(u => u.displayName || u.name));
    
    if (registrierteBenutzer.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine registrierten Benutzer gefunden</p>';
        return;
    }
    
    container.innerHTML = registrierteBenutzer.map(user => {
        // Finde Einladungen für diesen Benutzer
        const einladungen = Object.values(EINLADUNGEN).filter(e => 
            e.empfaengerId === user.id && 
            e.absenderId === currentUser.odooUserId
        );
        const aktiveFreigaben = Object.values(FREIGABEN).filter(f => 
            f.userId === user.id && 
            f.aktiv
        );
        
        return `
            <div class="p-4 bg-gray-50 rounded-lg border-2">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <span class="font-bold text-lg">${user.displayName || user.name}</span>
                        ${aktiveFreigaben.length > 0 ? `
                            <span class="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">
                                ✅ ${aktiveFreigaben.length} Freigabe${aktiveFreigaben.length !== 1 ? 'n' : ''} aktiv
                            </span>
                        ` : ''}
                        ${einladungen.filter(e => e.status === 'pending').length > 0 ? `
                            <span class="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-bold">
                                ⏳ ${einladungen.filter(e => e.status === 'pending').length} Einladung${einladungen.filter(e => e.status === 'pending').length !== 1 ? 'en' : ''} ausstehend
                            </span>
                        ` : ''}
                    </div>
                    <button onclick="window.openFreigabeEditor('${user.id}')" 
                        class="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold rounded-lg hover:shadow-lg transition">
                        🔐 Freigaben verwalten
                    </button>
                </div>
                
                ${aktiveFreigaben.length > 0 ? `
                    <div class="mt-2 space-y-1">
                        ${aktiveFreigaben.map(f => {
                            const thema = THEMEN[f.themaId];
                            return `
                                <div class="flex items-center justify-between p-2 bg-white rounded-lg border">
                                    <div class="flex items-center gap-2">
                                        <span class="text-2xl">📁</span>
                                        <div>
                                            <p class="font-semibold text-sm">${thema?.name || 'Unbekanntes Thema'}</p>
                                            <p class="text-xs text-gray-500">
                                                ${f.freigabeTyp === 'komplett' ? 
                                                    `Komplett • ${f.rechte === 'lesen' ? '👁️ Lesen' : '✏️ Bearbeiten'}` :
                                                    `Gefiltert • ${Object.keys(f.filter || {}).length} Filter`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                    <button onclick="window.deleteFreigabe('${f.id}')" 
                                        class="text-red-500 hover:text-red-700 p-1" title="Freigabe entfernen">
                                        🗑️
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : '<p class="text-xs text-gray-400 italic mt-2">Keine aktiven Freigaben</p>'}
            </div>
        `;
    }).join('');
}

// ========================================
// NEUER FREIGABE-EDITOR
// ========================================

window.openFreigabeEditor = function(userId) {
    const user = USERS[userId];
    if (!user) return;
    
    // Finde bestehende Freigaben/Einladungen für diesen Benutzer
    const userFreigaben = Object.values(FREIGABEN).filter(f => f.userId === userId && f.aktiv);
    const userEinladungen = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerId === userId && 
        e.absenderId === currentUser.odooUserId
    );
    
    let modal = document.getElementById('freigabeEditorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'freigabeEditorModal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    const themenArray = Object.values(THEMEN).filter(t => !t.archiviert);
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden">
            <div class="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
                <div>
                    <h3 class="text-2xl font-bold">🔐 Freigaben für ${user.displayName || user.name}</h3>
                    <p class="text-sm text-white/90 mt-1">Themen auswählen und Berechtigungen festlegen</p>
                </div>
                <button onclick="window.closeFreigabeEditor()" class="text-white/80 hover:text-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div class="p-6 overflow-y-auto max-h-[calc(95vh-180px)]">
                ${themenArray.length === 0 ? `
                    <p class="text-gray-500 text-center py-8">Keine Themen vorhanden. Erstelle zuerst Themen.</p>
                ` : `
                    <!-- TEIL 1: THEMA AUSWÄHLEN -->
                    <div class="mb-6 p-5 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border-2 border-blue-300">
                        <h4 class="text-lg font-bold text-blue-900 mb-3">📁 TEIL 1: Thema auswählen</h4>
                        <p class="text-sm text-gray-700 mb-4">Wähle aus, welche Themen ${user.displayName} sehen kann:</p>
                        <div class="grid grid-cols-2 gap-3">
                            ${themenArray.map(t => `
                                <label class="flex items-center gap-3 p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-blue-500 transition">
                                    <input type="checkbox" 
                                        id="thema-select-${t.id}" 
                                        value="${t.id}"
                                        onchange="window.updateTeil2Visibility()"
                                        class="w-5 h-5 text-blue-600 rounded">
                                    <span class="font-semibold text-gray-800">${t.name}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- TEIL 2: BERECHTIGUNGEN FESTLEGEN -->
                    <div id="teil2-container" class="mb-6 p-5 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border-2 border-green-300 hidden">
                        <h4 class="text-lg font-bold text-green-900 mb-3">🔐 TEIL 2: Berechtigungen festlegen</h4>
                        <p class="text-sm text-gray-700 mb-4">Wähle einen Filter aus und lege fest, welche Einträge sichtbar sind:</p>
                        
                        <!-- Filter-Auswahl -->
                        <div class="bg-white rounded-lg p-4 mb-4 border-2 border-gray-300">
                            <label class="block text-sm font-bold text-gray-700 mb-2">Filter-Typ wählen:</label>
                            <select id="filter-typ-select" onchange="window.updateFilterDetails()" 
                                class="w-full p-3 border-2 border-gray-300 rounded-lg font-semibold">
                                <option value="">-- Bitte wählen --</option>
                                <option value="fuerPerson">🎁 ALLE Einträge FÜR Person(en)</option>
                                <option value="vonPerson">🎀 ALLE Einträge VON Person(en)</option>
                                <option value="beteiligungPerson">👥 ALLE Einträge mit BETEILIGUNG Person(en)</option>
                                <option value="bezahltVonPerson">💳 ALLE Einträge BEZAHLT VON Person(en)</option>
                                <option value="sollBezahlungKonto">💰 ALLE Einträge mit SOLL-Bezahlung Konto</option>
                                <option value="istBezahlungKonto">✅ ALLE Einträge mit IST-Bezahlung Konto</option>
                                <option value="bezahlungKonto">🏦 ALLE Einträge mit Bezahlung Konto (SOLL ODER IST)</option>
                            </select>
                        </div>
                        
                        <!-- Filter-Details (Person/Konto Auswahl) -->
                        <div id="filter-details-container" class="hidden bg-white rounded-lg p-4 mb-4 border-2 border-blue-300">
                            <!-- Wird dynamisch befüllt -->
                        </div>
                        
                        <!-- Berechtigungen -->
                        <div id="rechte-container" class="hidden bg-white rounded-lg p-4 mb-4 border-2 border-purple-300">
                            <label class="block text-sm font-bold text-gray-700 mb-3">Berechtigung für diese Regel:</label>
                            <div class="flex gap-4">
                                <label class="flex-1 flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 border-gray-300 hover:border-blue-500">
                                    <input type="radio" name="regel-rechte" value="lesen" checked class="w-4 h-4 text-blue-600">
                                    <div>
                                        <p class="font-bold">👁️ Leserechte</p>
                                        <p class="text-xs text-gray-500">Nur ansehen</p>
                                    </div>
                                </label>
                                <label class="flex-1 flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 border-gray-300 hover:border-green-500">
                                    <input type="radio" name="regel-rechte" value="bearbeiten" class="w-4 h-4 text-green-600">
                                    <div>
                                        <p class="font-bold">✏️ Bearbeitungsrechte</p>
                                        <p class="text-xs text-gray-500">Ansehen & ändern</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Hinzufügen Button -->
                        <button id="add-regel-btn" onclick="window.addRegelToListe()" 
                            class="hidden w-full py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white font-bold rounded-lg hover:shadow-lg transition">
                            ➕ Regel zur Berechtigungsliste hinzufügen
                        </button>
                        
                        <!-- Berechtigungsliste -->
                        <div class="mt-6">
                            <h5 class="text-md font-bold text-gray-800 mb-3">📋 Berechtigungsliste:</h5>
                            <div id="berechtigungs-liste" class="space-y-2 min-h-[100px] p-3 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                <p class="text-gray-400 text-sm text-center py-4">Noch keine Berechtigungen hinzugefügt</p>
                            </div>
                        </div>
                    </div>
                `}
            </div>
            
            <div class="sticky bottom-0 bg-gray-100 p-4 rounded-b-2xl flex justify-between gap-3">
                <button onclick="window.closeFreigabeEditor()" class="px-6 py-3 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                    Abbrechen
                </button>
                <button onclick="window.sendNeueFreigabeEinladungen('${userId}')" 
                    class="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-500 text-white font-bold rounded-lg hover:shadow-lg transition flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    📧 Einladungen senden
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Initialisiere Berechtigungsliste
    window.berechtigungsListe = [];
};

// ========================================
// NEUE HELPER-FUNKTIONEN FÜR TEIL 2
// ========================================

// Globale Berechtigungsliste
window.berechtigungsListe = [];

// Zeige/Verstecke Teil 2 basierend auf Thema-Auswahl
window.updateTeil2Visibility = function() {
    const themaCheckboxes = document.querySelectorAll('[id^="thema-select-"]:checked');
    const teil2Container = document.getElementById('teil2-container');
    
    if (themaCheckboxes.length > 0) {
        teil2Container?.classList.remove('hidden');
    } else {
        teil2Container?.classList.add('hidden');
    }
};

// Aktualisiere Filter-Details basierend auf Filter-Typ
window.updateFilterDetails = function() {
    const filterTyp = document.getElementById('filter-typ-select')?.value;
    const detailsContainer = document.getElementById('filter-details-container');
    const rechteContainer = document.getElementById('rechte-container');
    const addBtn = document.getElementById('add-regel-btn');
    
    if (!filterTyp || !detailsContainer) return;
    
    detailsContainer.classList.remove('hidden');
    rechteContainer?.classList.remove('hidden');
    addBtn?.classList.remove('hidden');
    
    let html = '';
    
    if (filterTyp.includes('Person')) {
        // Person-Auswahl
        const kontakte = Object.values(KONTAKTE);
        html = `
            <label class="block text-sm font-bold text-gray-700 mb-3">Person(en) auswählen:</label>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 bg-gray-50 rounded">
                ${kontakte.map(k => `
                    <label class="flex items-center gap-2 p-2 hover:bg-blue-100 rounded cursor-pointer">
                        <input type="checkbox" 
                            name="filter-wert-checkbox" 
                            value="${k.id}"
                            class="w-4 h-4 text-blue-600 rounded">
                        <span class="text-sm ${k.istEigenePerson ? 'font-bold text-blue-600' : ''}">${k.name}</span>
                    </label>
                `).join('')}
            </div>
        `;
    } else if (filterTyp.includes('Konto')) {
        // Konto-Auswahl
        const konten = Object.entries(ZAHLUNGSARTEN);
        html = `
            <label class="block text-sm font-bold text-gray-700 mb-3">Konto auswählen:</label>
            <div class="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 bg-gray-50 rounded">
                ${konten.map(([key, config]) => `
                    <label class="flex items-center gap-2 p-2 hover:bg-blue-100 rounded cursor-pointer">
                        <input type="radio" 
                            name="filter-wert-radio" 
                            value="${key}"
                            class="w-4 h-4 text-blue-600">
                        <span class="text-sm">${config.label}</span>
                    </label>
                `).join('')}
            </div>
        `;
    }
    
    detailsContainer.innerHTML = html;
};

// Füge Regel zur Berechtigungsliste hinzu
window.addRegelToListe = function() {
    const filterTyp = document.getElementById('filter-typ-select')?.value;
    if (!filterTyp) return;
    
    // Hole ausgewählte Werte
    let selectedValues = [];
    let filterLabel = '';
    
    if (filterTyp.includes('Person')) {
        const checkboxes = document.querySelectorAll('input[name="filter-wert-checkbox"]:checked');
        if (checkboxes.length === 0) {
            alertUser('Bitte wähle mindestens eine Person aus', 'warning');
            return;
        }
        selectedValues = Array.from(checkboxes).map(cb => ({
            id: cb.value,
            name: KONTAKTE[cb.value]?.name || 'Unbekannt'
        }));
        
        switch(filterTyp) {
            case 'fuerPerson': filterLabel = '🎁 FÜR'; break;
            case 'vonPerson': filterLabel = '🎀 VON'; break;
            case 'beteiligungPerson': filterLabel = '👥 BETEILIGUNG'; break;
            case 'bezahltVonPerson': filterLabel = '💳 BEZAHLT VON'; break;
        }
    } else {
        const radio = document.querySelector('input[name="filter-wert-radio"]:checked');
        if (!radio) {
            alertUser('Bitte wähle ein Konto aus', 'warning');
            return;
        }
        selectedValues = [{
            id: radio.value,
            name: ZAHLUNGSARTEN[radio.value]?.label || 'Unbekannt'
        }];
        
        switch(filterTyp) {
            case 'sollBezahlungKonto': filterLabel = '💰 SOLL-Bezahlung'; break;
            case 'istBezahlungKonto': filterLabel = '✅ IST-Bezahlung'; break;
            case 'bezahlungKonto': filterLabel = '🏦 Bezahlung (SOLL/IST)'; break;
        }
    }
    
    // Hole Berechtigung
    const rechteRadio = document.querySelector('input[name="regel-rechte"]:checked');
    const rechte = rechteRadio?.value || 'lesen';
    
    // Füge zur Liste hinzu
    const regel = {
        id: Date.now(),
        filterTyp,
        filterLabel,
        selectedValues,
        rechte
    };
    
    window.berechtigungsListe.push(regel);
    renderBerechtigungsListe();
    
    // Reset
    document.getElementById('filter-typ-select').value = '';
    document.getElementById('filter-details-container').classList.add('hidden');
    document.getElementById('rechte-container').classList.add('hidden');
    document.getElementById('add-regel-btn').classList.add('hidden');
};

// Rendere Berechtigungsliste
function renderBerechtigungsListe() {
    const container = document.getElementById('berechtigungs-liste');
    if (!container) return;
    
    if (window.berechtigungsListe.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Noch keine Berechtigungen hinzugefügt</p>';
        return;
    }
    
    container.innerHTML = window.berechtigungsListe.map(regel => `
        <div class="flex items-center justify-between p-3 bg-white rounded-lg border-2 border-blue-200">
            <div class="flex-1">
                <p class="font-bold text-sm">${regel.filterLabel}</p>
                <p class="text-xs text-gray-600">
                    ${regel.selectedValues.map(v => v.name).join(', ')}
                </p>
                <span class="inline-block mt-1 px-2 py-0.5 text-xs font-bold rounded ${regel.rechte === 'lesen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                    ${regel.rechte === 'lesen' ? '👁️ Lesen' : '✏️ Bearbeiten'}
                </span>
            </div>
            <button onclick="window.removeRegelFromListe(${regel.id})" 
                class="ml-3 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-bold text-sm">
                🗑️
            </button>
        </div>
    `).join('');
}

// Entferne Regel aus Liste
window.removeRegelFromListe = function(regelId) {
    window.berechtigungsListe = window.berechtigungsListe.filter(r => r.id !== regelId);
    renderBerechtigungsListe();
};

window.addThemaFreigabe = function() {
    const container = document.getElementById('freigaben-container');
    if (!container) return;
    
    const themenArray = Object.values(THEMEN).filter(t => !t.archiviert);
    const freigabeId = `freigabe-${freigabenCounter++}`;
    
    const freigabeDiv = document.createElement('div');
    freigabeDiv.id = freigabeId;
    freigabeDiv.className = 'border-2 border-blue-300 rounded-lg p-4 bg-blue-50';
    freigabeDiv.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-lg text-blue-800">📁 Neue Freigabe</h4>
            <button onclick="window.removeFreigabe('${freigabeId}')" class="text-red-500 hover:text-red-700 font-bold">
                ✕ Entfernen
            </button>
        </div>
        
        <!-- Thema-Auswahl -->
        <div class="mb-4">
            <label class="block text-sm font-bold text-gray-700 mb-2">Thema auswählen:</label>
            <select id="${freigabeId}-thema" onchange="window.updateFreigabeTypOptions('${freigabeId}')" 
                class="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-blue-500">
                <option value="">-- Thema wählen --</option>
                ${themenArray.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
        </div>
        
        <div id="${freigabeId}-config" class="hidden">
            <!-- Freigabe-Typ -->
            <div class="mb-4 p-3 bg-white rounded-lg border-2">
                <label class="block text-sm font-bold text-gray-700 mb-2">Freigabe-Typ:</label>
                <div class="space-y-2">
                    <label class="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-blue-50">
                        <input type="radio" name="${freigabeId}-typ" value="komplett" 
                            onchange="window.updateFreigabeConfig('${freigabeId}')"
                            class="w-4 h-4 text-blue-600">
                        <div>
                            <p class="font-semibold">📂 Komplettes Thema teilen</p>
                            <p class="text-xs text-gray-500">Person sieht ALLE Einträge im Thema</p>
                        </div>
                    </label>
                    <label class="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-blue-50">
                        <input type="radio" name="${freigabeId}-typ" value="gefiltert" checked
                            onchange="window.updateFreigabeConfig('${freigabeId}')"
                            class="w-4 h-4 text-blue-600">
                        <div>
                            <p class="font-semibold">🔍 Gefilterte Ansicht</p>
                            <p class="text-xs text-gray-500">Nur bestimmte Einträge anzeigen (nach Kriterien)</p>
                        </div>
                    </label>
                </div>
            </div>
            
            <!-- Rechte -->
            <div class="mb-4 p-3 bg-white rounded-lg border-2">
                <label class="block text-sm font-bold text-gray-700 mb-2">Berechtigungen:</label>
                <div class="flex gap-3">
                    <label class="flex-1 flex items-center gap-2 p-3 rounded cursor-pointer hover:bg-blue-50 border-2 border-gray-300">
                        <input type="radio" name="${freigabeId}-rechte" value="lesen" checked
                            class="w-4 h-4 text-blue-600">
                        <div>
                            <p class="font-semibold">👁️ Leserechte</p>
                            <p class="text-xs text-gray-500">Nur ansehen</p>
                        </div>
                    </label>
                    <label class="flex-1 flex items-center gap-2 p-3 rounded cursor-pointer hover:bg-green-50 border-2 border-gray-300">
                        <input type="radio" name="${freigabeId}-rechte" value="bearbeiten"
                            class="w-4 h-4 text-green-600">
                        <div>
                            <p class="font-semibold">✏️ Bearbeitungsrechte</p>
                            <p class="text-xs text-gray-500">Ansehen & ändern</p>
                        </div>
                    </label>
                </div>
            </div>
            
            <!-- Filter-Konfiguration (nur bei "gefiltert") -->
            <div id="${freigabeId}-filter" class="p-3 bg-white rounded-lg border-2">
                <label class="block text-sm font-bold text-gray-700 mb-2">Filter-Kriterien:</label>
                <p class="text-xs text-gray-600 mb-3">Wähle aus, welche Einträge sichtbar sein sollen:</p>
                
                <div class="space-y-3">
                    ${renderFilterOption(freigabeId, 'fuerPersonen', '🎁 FÜR Person(en)', 'Nur Geschenke FÜR diese Person(en) anzeigen')}
                    ${renderFilterOption(freigabeId, 'vonPersonen', '🎀 VON Person(en)', 'Nur Geschenke VON diese Person(en) anzeigen')}
                    ${renderFilterOption(freigabeId, 'beteiligungPersonen', '👥 BETEILIGUNG Person(en)', 'Nur Geschenke mit Beteiligung dieser Person(en)')}
                    ${renderFilterOption(freigabeId, 'bezahltVonPersonen', '💳 BEZAHLT VON Person(en)', 'Nur Geschenke die von diesen Person(en) bezahlt wurden')}
                    ${renderFilterOption(freigabeId, 'sollBezahlungKonten', '💰 SOLL-Bezahlung Konto(en)', 'Nur Geschenke mit diesen SOLL-Bezahlarten')}
                    ${renderFilterOption(freigabeId, 'istBezahlungKonten', '✅ IST-Bezahlung Konto(en)', 'Nur Geschenke mit diesen IST-Bezahlarten')}
                    ${renderFilterOption(freigabeId, 'bezahlungKonten', '🏦 Bezahlung Konto(en) (SOLL ODER IST)', 'Geschenke wo Konto bei SOLL ODER IST vorkommt')}
                    ${renderFilterOption(freigabeId, 'spezifischeIds', '🔖 Spezifische Einträge', 'Bestimmte Einträge per ID auswählen')}
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(freigabeDiv);
};

function renderFilterOption(freigabeId, filterType, label, description) {
    return `
        <div class="border rounded-lg p-2 hover:bg-blue-50">
            <label class="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" 
                    id="${freigabeId}-filter-${filterType}" 
                    onchange="window.toggleFilterDetails('${freigabeId}', '${filterType}')"
                    class="w-4 h-4 text-blue-600 rounded mt-1">
                <div class="flex-1">
                    <p class="font-semibold text-sm">${label}</p>
                    <p class="text-xs text-gray-500">${description}</p>
                    <div id="${freigabeId}-filter-${filterType}-details" class="hidden mt-2">
                        <!-- Wird dynamisch befüllt -->
                    </div>
                </div>
            </label>
        </div>
    `;
}

window.updateFreigabeTypOptions = function(freigabeId) {
    const themaSelect = document.getElementById(`${freigabeId}-thema`);
    const configDiv = document.getElementById(`${freigabeId}-config`);
    
    if (themaSelect && themaSelect.value) {
        configDiv?.classList.remove('hidden');
        window.updateFreigabeConfig(freigabeId);
    } else {
        configDiv?.classList.add('hidden');
    }
};

window.updateFreigabeConfig = function(freigabeId) {
    const typRadios = document.getElementsByName(`${freigabeId}-typ`);
    const selectedTyp = Array.from(typRadios).find(r => r.checked)?.value;
    const filterDiv = document.getElementById(`${freigabeId}-filter`);
    
    if (filterDiv) {
        if (selectedTyp === 'komplett') {
            filterDiv.style.display = 'none';
        } else {
            filterDiv.style.display = 'block';
        }
    }
};

window.toggleFilterDetails = function(freigabeId, filterType) {
    const checkbox = document.getElementById(`${freigabeId}-filter-${filterType}`);
    const detailsDiv = document.getElementById(`${freigabeId}-filter-${filterType}-details`);
    
    if (!checkbox || !detailsDiv) return;
    
    if (checkbox.checked) {
        detailsDiv.classList.remove('hidden');
        detailsDiv.innerHTML = renderFilterDetailsContent(freigabeId, filterType);
    } else {
        detailsDiv.classList.add('hidden');
        detailsDiv.innerHTML = '';
    }
};

function renderFilterDetailsContent(freigabeId, filterType) {
    const themaSelectEl = document.getElementById(`${freigabeId}-thema`);
    const themaId = themaSelectEl?.value;
    
    if (!themaId) return '<p class="text-xs text-gray-500">Bitte wähle zuerst ein Thema aus</p>';
    
    let options = [];
    
    // Bestimme Optionen basierend auf Filter-Typ
    if (filterType === 'fuerPersonen' || filterType === 'vonPersonen' || 
        filterType === 'beteiligungPersonen' || filterType === 'bezahltVonPersonen') {
        options = Object.values(KONTAKTE).map(k => ({ value: k.id, label: k.name }));
    } else if (filterType === 'sollBezahlungKonten' || filterType === 'istBezahlungKonten' || filterType === 'bezahlungKonten') {
        options = Object.entries(ZAHLUNGSARTEN).map(([k, v]) => ({ value: k, label: v.label }));
    } else if (filterType === 'spezifischeIds') {
        // Lade Einträge aus dem Thema
        return `
            <p class="text-xs text-gray-600 mb-2">Einträge auswählen oder IDs eingeben:</p>
            <div class="max-h-40 overflow-y-auto border rounded p-2 mb-2">
                <p class="text-xs text-gray-500 italic">Einträge werden geladen...</p>
            </div>
            <input type="text" 
                id="${freigabeId}-filter-${filterType}-input" 
                placeholder="Oder IDs kommagetrennt: abc123, def456"
                class="w-full p-2 border rounded text-xs">
        `;
    }
    
    if (options.length === 0) {
        return '<p class="text-xs text-gray-500">Keine Optionen verfügbar</p>';
    }
    
    return `
        <div class="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded">
            ${options.map(opt => `
                <label class="flex items-center gap-2 p-1 hover:bg-blue-100 rounded cursor-pointer text-xs">
                    <input type="checkbox" 
                        name="${freigabeId}-filter-${filterType}-values" 
                        value="${opt.value}"
                        class="w-3 h-3 text-blue-600 rounded">
                    <span>${opt.label}</span>
                </label>
            `).join('')}
        </div>
    `;
}

window.removeFreigabe = function(freigabeId) {
    const freigabeDiv = document.getElementById(freigabeId);
    if (freigabeDiv && confirm('Diese Freigabe-Konfiguration entfernen?')) {
        freigabeDiv.remove();
    }
};

// ========================================
// EINLADUNGSSYSTEM (NEU)
// ========================================

window.sendNeueFreigabeEinladungen = async function(userId) {
    const user = USERS[userId];
    if (!user) return;
    
    // Hole ausgewählte Themen
    const themaCheckboxes = document.querySelectorAll('[id^="thema-select-"]:checked');
    if (themaCheckboxes.length === 0) {
        alertUser('Bitte wähle mindestens ein Thema aus', 'warning');
        return;
    }
    
    if (window.berechtigungsListe.length === 0) {
        alertUser('Bitte füge mindestens eine Berechtigung hinzu', 'warning');
        return;
    }
    
    const selectedThemen = Array.from(themaCheckboxes).map(cb => cb.value);
    
    try {
        // Erstelle für jedes Thema eine Einladung
        for (const themaId of selectedThemen) {
            const thema = THEMEN[themaId];
            if (!thema) continue;
            
            // Konvertiere Berechtigungsliste in Filter-Format
            const filter = {};
            const rechteMap = {}; // Für jede Regel die Rechte speichern
            
            window.berechtigungsListe.forEach(regel => {
                const filterKey = regel.filterTyp;
                const valueIds = regel.selectedValues.map(v => v.id);
                
                // Speichere Filter
                filter[filterKey] = valueIds;
                
                // Speichere Rechte für diese Regel
                rechteMap[filterKey] = regel.rechte;
            });
            
            // Prüfe ob bereits Einladung existiert
            const existingEinladung = Object.values(EINLADUNGEN).find(e =>
                e.empfaengerId === userId &&
                e.absenderId === currentUser.odooUserId &&
                e.themaId === themaId &&
                e.status === 'pending'
            );
            
            if (existingEinladung) {
                // Update
                await updateDoc(doc(geschenkeEinladungenRef, existingEinladung.id), {
                    filter,
                    rechteMap,
                    freigabeTyp: 'gefiltert',
                    aktualisiertAm: serverTimestamp()
                });
            } else {
                // Neu erstellen
                await addDoc(geschenkeEinladungenRef, {
                    absenderId: currentUser.odooUserId,
                    absenderName: currentUser.displayName,
                    empfaengerId: userId,
                    empfaengerName: user.displayName || user.name,
                    themaId,
                    themaName: thema.name,
                    filter,
                    rechteMap,
                    freigabeTyp: 'gefiltert',
                    status: 'pending',
                    erstelltAm: serverTimestamp()
                });
            }
        }
        
        await loadEinladungen();
        alertUser(`📧 ${selectedThemen.length} Einladung(en) erfolgreich gesendet!`, 'success');
        window.closeFreigabeEditor();
        renderFreigabenVerwaltung();
    } catch (e) {
        console.error('Fehler beim Senden:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ALTE Funktion (behalten für Kompatibilität)
window.sendFreigabeEinladungen = async function(userId) {
    const user = USERS[userId];
    if (!user) return;
    
    // Sammle alle konfigurierten Freigaben
    const freigabenConfigs = [];
    const freigabenDivs = document.querySelectorAll('[id^="freigabe-"]');
    
    freigabenDivs.forEach(div => {
        const freigabeId = div.id;
        const themaSelect = document.getElementById(`${freigabeId}-thema`);
        const themaId = themaSelect?.value;
        
        if (!themaId) return; // Keine Thema ausgewählt
        
        const thema = THEMEN[themaId];
        if (!thema) return;
        
        // Freigabe-Typ
        const typRadios = document.getElementsByName(`${freigabeId}-typ`);
        const freigabeTyp = Array.from(typRadios).find(r => r.checked)?.value || 'gefiltert';
        
        // Rechte
        const rechteRadios = document.getElementsByName(`${freigabeId}-rechte`);
        const rechte = Array.from(rechteRadios).find(r => r.checked)?.value || 'lesen';
        
        // Filter (nur wenn "gefiltert")
        const filter = {};
        if (freigabeTyp === 'gefiltert') {
            const filterTypes = ['fuerPersonen', 'vonPersonen', 'beteiligungPersonen', 'bezahltVonPersonen',
                                'sollBezahlungKonten', 'istBezahlungKonten', 'bezahlungKonten', 'spezifischeIds'];
            
            filterTypes.forEach(filterType => {
                const checkbox = document.getElementById(`${freigabeId}-filter-${filterType}`);
                if (checkbox && checkbox.checked) {
                    if (filterType === 'spezifischeIds') {
                        const input = document.getElementById(`${freigabeId}-filter-${filterType}-input`);
                        if (input && input.value.trim()) {
                            filter[filterType] = input.value.split(',').map(id => id.trim()).filter(id => id);
                        }
                    } else {
                        const selectedValues = Array.from(document.querySelectorAll(`input[name="${freigabeId}-filter-${filterType}-values"]:checked`))
                            .map(cb => cb.value);
                        if (selectedValues.length > 0) {
                            filter[filterType] = selectedValues;
                        }
                    }
                }
            });
        }
        
        freigabenConfigs.push({
            themaId,
            themaName: thema.name,
            freigabeTyp,
            rechte,
            filter
        });
    });
    
    if (freigabenConfigs.length === 0) {
        alertUser('Bitte konfiguriere mindestens eine Freigabe', 'warning');
        return;
    }
    
    try {
        // Erstelle Einladungen für jede Freigabe
        for (const config of freigabenConfigs) {
            // Prüfe ob bereits eine Einladung für dieses Thema existiert
            const existingEinladung = Object.values(EINLADUNGEN).find(e =>
                e.empfaengerId === userId &&
                e.absenderId === currentUser.odooUserId &&
                e.themaId === config.themaId &&
                e.status === 'pending'
            );
            
            if (existingEinladung) {
                // Update existierende Einladung
                await updateDoc(doc(geschenkeEinladungenRef, existingEinladung.id), {
                    freigabeTyp: config.freigabeTyp,
                    rechte: config.rechte,
                    filter: config.filter,
                    aktualisiertAm: serverTimestamp()
                });
            } else {
                // Erstelle neue Einladung
                await addDoc(geschenkeEinladungenRef, {
                    absenderId: currentUser.odooUserId,
                    absenderName: currentUser.displayName,
                    empfaengerId: userId,
                    empfaengerName: user.displayName || user.name,
                    themaId: config.themaId,
                    themaName: config.themaName,
                    freigabeTyp: config.freigabeTyp,
                    rechte: config.rechte,
                    filter: config.filter,
                    status: 'pending',
                    erstelltAm: serverTimestamp()
                });
            }
        }
        
        await loadEinladungen();
        alertUser(`📧 ${freigabenConfigs.length} Einladung(en) erfolgreich gesendet!`, 'success');
        window.closeFreigabeEditor();
        renderFreigabenVerwaltung();
    } catch (e) {
        console.error('Fehler beim Senden der Einladungen:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Freigabe löschen
window.deleteFreigabe = async function(freigabeId) {
    if (!confirm('Diese Freigabe wirklich entfernen?')) return;
    
    try {
        await deleteDoc(doc(geschenkeFreigabenRef, freigabeId));
        await loadFreigaben();
        alertUser('Freigabe entfernt!', 'success');
        renderFreigabenVerwaltung();
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.closeFreigabeEditor = function() {
    const modal = document.getElementById('freigabeEditorModal');
    if (modal) modal.remove();
};

function renderOptionenVerwaltung() {
    // Status-Optionen
    renderOptionList('gm-status-optionen', STATUS_CONFIG, geschenkeSettings.customStatusOptionen, 'status');
    // Zahlungsarten (vereinheitlicht)
    renderOptionList('gm-zahlungsarten-optionen', ZAHLUNGSARTEN, geschenkeSettings.customZahlungsarten, 'zahlungsarten');
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
// OPTIONEN VERWALTUNG (für Einstellungen)
// ========================================
window.addCustomOption = async function(type) {
    let inputId, settingsKey;
    
    switch(type) {
        case 'status':
            inputId = 'gm-new-status';
            settingsKey = 'customStatusOptionen';
            break;
        case 'zahlungsarten':
            inputId = 'gm-new-zahlungsarten';
            settingsKey = 'customZahlungsarten';
            break;
        default:
            return;
    }
    
    const input = document.getElementById(inputId);
    if (!input || !input.value.trim()) {
        alertUser('Bitte gib einen Wert ein.', 'warning');
        return;
    }
    
    const newValue = input.value.trim();
    
    // Prüfen ob bereits vorhanden
    if (geschenkeSettings[settingsKey].includes(newValue)) {
        alertUser('Dieser Wert existiert bereits.', 'warning');
        return;
    }
    
    try {
        geschenkeSettings[settingsKey].push(newValue);
        await setDoc(geschenkeSettingsRef, geschenkeSettings);
        input.value = '';
        renderOptionenVerwaltung();
        alertUser('Option hinzugefügt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.removeCustomOption = async function(type, value) {
    let settingsKey;
    
    switch(type) {
        case 'status':
            settingsKey = 'customStatusOptionen';
            break;
        case 'zahlungsarten':
            settingsKey = 'customZahlungsarten';
            break;
        default:
            return;
    }
    
    if (!confirm(`"${value}" wirklich entfernen?`)) return;
    
    try {
        geschenkeSettings[settingsKey] = geschenkeSettings[settingsKey].filter(o => o !== value);
        await setDoc(geschenkeSettingsRef, geschenkeSettings);
        renderOptionenVerwaltung();
        alertUser('Option entfernt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.addCustomStandort = async function() {
    const input = document.getElementById('gm-new-standort');
    if (!input || !input.value.trim()) {
        alertUser('Bitte gib einen Standort ein.', 'warning');
        return;
    }
    
    const newStandort = input.value.trim();
    
    // Prüfen ob bereits vorhanden
    const allStandorte = [...geschenkeSettings.geschenkeStandorte, ...geschenkeSettings.customGeschenkeStandorte];
    if (allStandorte.includes(newStandort)) {
        alertUser('Dieser Standort existiert bereits.', 'warning');
        return;
    }
    
    try {
        geschenkeSettings.customGeschenkeStandorte.push(newStandort);
        await setDoc(geschenkeSettingsRef, geschenkeSettings);
        input.value = '';
        renderOptionenVerwaltung();
        alertUser('Standort hinzugefügt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.removeCustomStandort = async function(standort) {
    if (!confirm(`"${standort}" wirklich entfernen?`)) return;
    
    try {
        geschenkeSettings.customGeschenkeStandorte = geschenkeSettings.customGeschenkeStandorte.filter(s => s !== standort);
        await setDoc(geschenkeSettingsRef, geschenkeSettings);
        renderOptionenVerwaltung();
        alertUser('Standort entfernt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

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

window.openAddPersonToThemaModal = function() {
    const verfuegbareKontakte = Object.values(KONTAKTE)
        .filter(k => !THEMEN[currentThemaId]?.personen?.includes(k.id));
    
    if (verfuegbareKontakte.length === 0) {
        alertUser('Alle Kontakte sind bereits hinzugefügt oder es gibt keine Kontakte. Erstelle neue Kontakte in den Einstellungen.', 'info');
        return;
    }
    
    // Modal erstellen
    let modal = document.getElementById('addPersonModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'addPersonModal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div class="bg-gradient-to-r from-pink-500 to-purple-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
                <h3 class="text-xl font-bold">👤 Person hinzufügen</h3>
                <button onclick="document.getElementById('addPersonModal').style.display='none'" class="text-white/80 hover:text-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="p-4">
                <p class="text-sm text-gray-600 mb-3">Wähle eine Person aus dem Kontaktbuch:</p>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    ${verfuegbareKontakte.map(k => `
                        <button onclick="window.addPersonToThema('${k.id}')" 
                            class="w-full p-3 text-left bg-gray-50 hover:bg-pink-50 border border-gray-200 hover:border-pink-300 rounded-lg transition flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold">
                                ${(k.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span class="font-semibold text-gray-800">${k.name}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="p-4 bg-gray-100 rounded-b-2xl">
                <button onclick="document.getElementById('addPersonModal').style.display='none'" 
                    class="w-full px-4 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                    Abbrechen
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
};

window.addPersonToThema = async function(kontaktId) {
    const kontakt = KONTAKTE[kontaktId];
    if (!kontakt) return;
    
    try {
        const thema = THEMEN[currentThemaId];
        const personen = thema.personen || [];
        if (!personen.includes(kontaktId)) {
            personen.push(kontaktId);
            await updateDoc(doc(geschenkeThemenRef, currentThemaId), { personen });
            THEMEN[currentThemaId].personen = personen;
            renderPersonenUebersicht();
            alertUser(`${kontakt.name} wurde hinzugefügt!`, 'success');
        }
        document.getElementById('addPersonModal').style.display = 'none';
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

// Geschenk kopieren - öffnet Modal zum Bearbeiten der Kopie
window.copyGeschenk = function(id) {
    const original = GESCHENKE[id];
    if (!original) return;
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    // Kopie-Daten vorbereiten
    const kopie = { ...original };
    kopie.geschenk = (kopie.geschenk || '') + ' (Kopie)';
    
    // Modal als "Kopie bearbeiten" öffnen
    document.getElementById('geschenkModalTitle').innerHTML = `
        <span>Kopie erstellen</span>
        <span class="block text-sm font-normal bg-yellow-400 text-yellow-900 px-2 py-1 rounded mt-1">⚠️ Hier wird die KOPIE bearbeitet</span>
    `;
    document.getElementById('gm-id').value = ''; // Leere ID = neuer Eintrag
    document.getElementById('gm-id').setAttribute('data-is-copy', 'true'); // Markierung dass es eine Kopie ist
    
    fillModalForm(kopie);
    renderModalSelects(kopie);
    updateModalActionButtons(false); // Keine Aktions-Buttons bei Kopie (inkl. "Vorlage laden")
    modal.style.display = 'flex';
};

// Geschenk löschen
window.deleteGeschenk = async function(id) {
    if (!confirm('Geschenk wirklich löschen?')) return;
    try {
        await deleteDoc(doc(geschenkeCollection, id));
        closeGeschenkModal(); // Modal schließen nach erfolgreichem Löschen
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
        const geschenkCopy = { ...geschenk };
        delete geschenkCopy.id;
        delete geschenkCopy.erstelltAm;
        
        const vorlageData = {
            name: name.trim(),
            geschenk: geschenkCopy.geschenk || name.trim(), // Geschenkname für Anzeige
            shop: geschenkCopy.shop || '',
            gesamtkosten: geschenkCopy.gesamtkosten || 0,
            geschenkData: geschenkCopy,
            erstelltAm: serverTimestamp(),
            erstelltVon: currentUser.displayName
        };
        
        const docRef = await addDoc(geschenkeVorlagenRef, vorlageData);
        VORLAGEN[docRef.id] = { id: docRef.id, ...vorlageData };
        alertUser('Vorlage gespeichert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Vorlage anwenden - füllt das Modal mit Vorlagendaten
window.applyVorlage = function(vorlageId) {
    const vorlage = VORLAGEN[vorlageId];
    if (!vorlage) return;
    
    // Prüfe ob ein Thema ausgewählt ist
    if (!currentThemaId) {
        alertUser('Bitte erstelle zuerst ein Thema, bevor du eine Vorlage einfügst.', 'warning');
        return;
    }
    
    const thema = THEMEN[currentThemaId];
    if (!thema?.personen || thema.personen.length === 0) {
        alertUser('Bitte füge zuerst Personen zum Thema hinzu.', 'warning');
        return;
    }
    
    closeVorlagenModal();
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    // Geschenkdaten aus der Vorlage extrahieren
    const geschenkData = vorlage.geschenkData || vorlage;
    
    document.getElementById('geschenkModalTitle').innerHTML = `
        <span>Neues Geschenk aus Vorlage</span>
        <span class="block text-sm font-normal bg-purple-200 text-purple-800 px-2 py-1 rounded mt-1">📑 Vorlage: ${vorlage.name || 'Unbenannt'}</span>
    `;
    const idField = document.getElementById('gm-id');
    idField.value = ''; // Leere ID = neuer Eintrag
    idField.removeAttribute('data-is-copy'); // Keine Kopie, sondern Vorlage
    
    fillModalForm(geschenkData);
    renderModalSelects(geschenkData);
    updateModalActionButtons(false, false); // Keine Aktions-Buttons, kein "Vorlage laden" (da bereits geladen)
    modal.style.display = 'flex';
    
    alertUser('Vorlage geladen! Passe die Daten an und speichere.', 'info');
};

// Vorlagen-Modal öffnen
window.openVorlagenModal = function() {
    let modal = document.getElementById('vorlagenModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'vorlagenModal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    const vorlagenArray = Object.values(VORLAGEN);
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div class="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
                <h3 class="text-xl font-bold">📑 Vorlagen verwalten</h3>
                <button onclick="closeVorlagenModal()" class="text-white/80 hover:text-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div class="p-4 overflow-y-auto max-h-[60vh]">
                ${vorlagenArray.length === 0 ? `
                    <div class="text-center py-8 text-gray-500">
                        <span class="text-4xl">📂</span>
                        <p class="mt-2 font-semibold">Keine Vorlagen vorhanden</p>
                        <p class="text-sm">Speichere ein Geschenk als Vorlage, um es hier zu sehen.</p>
                    </div>
                ` : `
                    <div class="space-y-3">
                        ${vorlagenArray.map(v => `
                            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-purple-300 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex-1">
                                        <p class="font-bold text-gray-800">${v.name || v.geschenk || 'Unbenannte Vorlage'}</p>
                                        <p class="text-sm text-gray-500">
                                            ${v.shop ? `🛍️ ${v.shop}` : ''}
                                            ${v.gesamtkosten ? ` • ${formatCurrency(v.gesamtkosten)}` : ''}
                                        </p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onclick="window.applyVorlage('${v.id}')" 
                                            class="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-bold">
                                            ➕ Einfügen
                                        </button>
                                        <button onclick="window.deleteVorlage('${v.id}')" 
                                            class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm">
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
            
            <div class="sticky bottom-0 bg-gray-100 p-4 rounded-b-2xl">
                <button onclick="closeVorlagenModal()" class="w-full px-4 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
};

function closeVorlagenModal() {
    const modal = document.getElementById('vorlagenModal');
    if (modal) modal.style.display = 'none';
}
window.closeVorlagenModal = closeVorlagenModal;

// Vorlage löschen
window.deleteVorlage = async function(vorlageId) {
    if (!confirm('Vorlage wirklich löschen?')) return;
    
    try {
        await deleteDoc(doc(geschenkeVorlagenRef, vorlageId));
        delete VORLAGEN[vorlageId];
        alertUser('Vorlage gelöscht!', 'success');
        window.openVorlagenModal(); // Modal neu rendern
    } catch (e) {
        alertUser('Fehler beim Löschen: ' + e.message, 'error');
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
            <div class="bg-gradient-to-r from-green-500 to-blue-600 p-4 text-white">
                <h2 class="text-2xl font-bold">📨 Neue Einladungen!</h2>
                <p class="text-sm text-white/90 mt-1">Du hast ${invitations.length} ausstehende Einladung${invitations.length !== 1 ? 'en' : ''}</p>
            </div>
            <div class="p-4 max-h-[60vh] overflow-y-auto space-y-3">
                ${invitations.map(inv => {
                    const filterCount = inv.filter ? Object.keys(inv.filter).length : 0;
                    return `
                        <div class="border-2 border-blue-200 rounded-xl p-4 bg-gradient-to-br from-blue-50 to-purple-50">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                                    ${(inv.absenderName || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div class="flex-1">
                                    <p class="font-bold text-lg">${inv.absenderName || 'Unbekannt'}</p>
                                    <p class="text-sm text-gray-600">möchte ein Thema mit dir teilen</p>
                                </div>
                            </div>
                            
                            <div class="bg-white rounded-lg p-3 mb-3">
                                <p class="text-sm font-bold text-gray-700 mb-2">📁 Thema: <span class="text-blue-600">${inv.themaName || 'Unbekannt'}</span></p>
                                <div class="flex items-center gap-4 text-xs">
                                    <span class="px-2 py-1 rounded ${inv.freigabeTyp === 'komplett' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">
                                        ${inv.freigabeTyp === 'komplett' ? '📂 Komplett' : `🔍 Gefiltert (${filterCount} Filter)`}
                                    </span>
                                    <span class="px-2 py-1 rounded ${inv.rechte === 'lesen' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}">
                                        ${inv.rechte === 'lesen' ? '👁️ Leserechte' : '✏️ Bearbeitungsrechte'}
                                    </span>
                                </div>
                            </div>
                            
                            ${inv.freigabeTyp === 'gefiltert' && filterCount > 0 ? `
                                <div class="bg-white rounded-lg p-3 mb-3">
                                    <p class="text-xs font-bold text-gray-700 mb-2">🔍 Sichtbare Einträge:</p>
                                    <div class="grid grid-cols-2 gap-1 text-xs">
                                        ${inv.filter.fuerPersonen ? `<span class="text-blue-700">• FÜR ${inv.filter.fuerPersonen.length} Person(en)</span>` : ''}
                                        ${inv.filter.vonPersonen ? `<span class="text-purple-700">• VON ${inv.filter.vonPersonen.length} Person(en)</span>` : ''}
                                        ${inv.filter.beteiligungPersonen ? `<span class="text-green-700">• BETEILIGUNG ${inv.filter.beteiligungPersonen.length} Person(en)</span>` : ''}
                                        ${inv.filter.bezahltVonPersonen ? `<span class="text-orange-700">• BEZAHLT VON ${inv.filter.bezahltVonPersonen.length} Person(en)</span>` : ''}
                                        ${inv.filter.sollBezahlungKonten ? `<span class="text-cyan-700">• SOLL-Konto ${inv.filter.sollBezahlungKonten.length}x</span>` : ''}
                                        ${inv.filter.istBezahlungKonten ? `<span class="text-teal-700">• IST-Konto ${inv.filter.istBezahlungKonten.length}x</span>` : ''}
                                        ${inv.filter.bezahlungKonten ? `<span class="text-indigo-700">• Konto (SOLL/IST) ${inv.filter.bezahlungKonten.length}x</span>` : ''}
                                        ${inv.filter.spezifischeIds ? `<span class="text-pink-700">• ${inv.filter.spezifischeIds.length} spez. Einträge</span>` : ''}
                                    </div>
                                </div>
                            ` : ''}
                            
                            <div class="flex gap-2">
                                <button onclick="window.acceptGeschenkeInvitation('${inv.id}')" 
                                    class="flex-1 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-bold hover:shadow-lg transition flex items-center justify-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Annehmen
                                </button>
                                <button onclick="window.declineGeschenkeInvitation('${inv.id}')" 
                                    class="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-bold hover:shadow-lg transition flex items-center justify-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Ablehnen
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
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

// Einladung annehmen (NEUES SYSTEM)
window.acceptGeschenkeInvitation = async function(invitationId) {
    try {
        const invitation = EINLADUNGEN[invitationId];
        if (!invitation) return;
        
        // Einladung akzeptieren
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'accepted',
            akzeptiertAm: serverTimestamp()
        });
        
        // Freigabe erstellen mit NEUEM Datenmodell
        const freigabeData = {
            userId: currentUser.odooUserId,
            userName: currentUser.displayName,
            themaId: invitation.themaId,
            themaName: invitation.themaName,
            freigabeTyp: invitation.freigabeTyp,
            rechte: invitation.rechte,
            filter: invitation.filter || {},
            einladungId: invitationId,
            freigegebenVon: invitation.absenderId,
            freigegebenVonName: invitation.absenderName,
            aktiv: true,
            erstelltAm: serverTimestamp()
        };
        await addDoc(geschenkeFreigabenRef, freigabeData);
        
        EINLADUNGEN[invitationId].status = 'accepted';
        alertUser('✅ Einladung angenommen! Du kannst jetzt auf das Thema zugreifen.', 'success');
        
        document.getElementById('gm-einladungen-modal')?.remove();
        await loadFreigaben();
        renderDashboard();
    } catch (e) {
        console.error('Fehler beim Annehmen:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Einladung ablehnen
window.declineGeschenkeInvitation = async function(invitationId) {
    if (!confirm('Einladung wirklich ablehnen?\n\nDer Absender kann dich erst wieder einladen, wenn du die Ablehnung in deinen Einstellungen widerrufst.')) return;
    
    try {
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'declined',
            abgelehntAm: serverTimestamp()
        });
        
        EINLADUNGEN[invitationId].status = 'declined';
        alertUser('❌ Einladung abgelehnt. Du kannst die Ablehnung in deinen Einstellungen widerrufen.', 'info');
        
        document.getElementById('gm-einladungen-modal')?.remove();
        checkPendingInvitations();
    } catch (e) {
        console.error('Fehler beim Ablehnen:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Ablehnung widerrufen
window.revokeDeclinedInvitation = async function(invitationId) {
    if (!confirm('Möchtest du deine Ablehnung wirklich widerrufen?\n\nDer Absender kann dir dann wieder neue Einladungen senden.')) return;
    
    try {
        // Lösche die abgelehnte Einladung komplett
        await deleteDoc(doc(geschenkeEinladungenRef, invitationId));
        delete EINLADUNGEN[invitationId];
        
        alertUser('✅ Ablehnung widerrufen. Der Absender kann dich nun wieder einladen.', 'success');
        await loadEinladungen();
        renderFreigabenVerwaltung();
    } catch (e) {
        console.error('Fehler beim Widerruf:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Zeige abgelehnte Einladungen in Einstellungen
window.showDeclinedInvitations = function() {
    const declinedInvitations = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerId === currentUser?.odooUserId && e.status === 'declined'
    );
    
    if (declinedInvitations.length === 0) {
        alertUser('Du hast keine abgelehnten Einladungen.', 'info');
        return;
    }
    
    let modal = document.getElementById('declined-invitations-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'declined-invitations-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div class="bg-gradient-to-r from-red-500 to-orange-600 p-4 text-white">
                <h2 class="text-2xl font-bold">❌ Abgelehnte Einladungen</h2>
                <p class="text-sm text-white/90 mt-1">Du kannst Ablehnungen widerrufen</p>
            </div>
            <div class="p-4 max-h-[60vh] overflow-y-auto space-y-3">
                ${declinedInvitations.map(inv => `
                    <div class="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                        <div class="flex items-center justify-between mb-2">
                            <div>
                                <p class="font-bold text-lg">${inv.absenderName || 'Unbekannt'}</p>
                                <p class="text-sm text-gray-600">Thema: ${inv.themaName || 'Unbekannt'}</p>
                            </div>
                            <span class="px-3 py-1 bg-red-200 text-red-800 rounded-full text-xs font-bold">
                                Abgelehnt am ${inv.abgelehntAm ? new Date(inv.abgelehntAm.toDate()).toLocaleDateString('de-DE') : '-'}
                            </span>
                        </div>
                        <button onclick="window.revokeDeclinedInvitation('${inv.id}')" 
                            class="w-full mt-2 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg font-bold hover:shadow-lg transition">
                            🔄 Ablehnung widerrufen
                        </button>
                    </div>
                `).join('')}
            </div>
            <div class="p-4 border-t">
                <button onclick="document.getElementById('declined-invitations-modal').remove()" 
                    class="w-full py-2 bg-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-400 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
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
        ZAHLUNGSARTEN[g.sollBezahlung]?.label || g.sollBezahlung || '',
        ZAHLUNGSARTEN[g.istBezahlung]?.label || g.istBezahlung || '',
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
