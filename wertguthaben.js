// // @ts-check
// ========================================
// WERTGUTHABEN SYSTEM
// ========================================

import {
    alertUser,
    db,
    currentUser,
    USERS,
    navigate,
    appId
} from './haupteingang.js';
import { saveUserSetting, getUserSetting } from './log-InOut.js';

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
    getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================
let wertguthabenCollection = null;
let WERTGUTHABEN = {};
let currentFilter = { typ: '', eigentuemer: '', status: 'aktiv' };
let searchTerm = '';
let wertguthabenSettings = {
    defaultWarnings: {
        gutschein: 14,
        guthaben: 30,
        wertguthaben: 90,
        wertguthaben_gesetzlich: 180,
        aktionscode: 7
    }
};

// Status-Konfiguration
const STATUS_CONFIG = {
    aktiv: { label: 'Aktiv', icon: '✅', color: 'bg-green-100 text-green-800' },
    eingeloest: { label: 'Eingelöst', icon: '🎯', color: 'bg-blue-100 text-blue-800' },
    abgelaufen: { label: 'Abgelaufen', icon: '⏰', color: 'bg-orange-100 text-orange-800' },
    storniert: { label: 'Storniert', icon: '❌', color: 'bg-red-100 text-red-800' },
    verschenkt: { label: 'Verschenkt', icon: '🎁', color: 'bg-purple-100 text-purple-800' },
    verloren: { label: 'Verloren', icon: '❓', color: 'bg-gray-100 text-gray-800' }
};

// Typ-Konfiguration
const TYP_CONFIG = {
    gutschein: { 
        label: 'Gutschein', 
        icon: '🎁', 
        color: 'bg-blue-100 text-blue-800' 
    },
    guthaben: { 
        label: 'Guthaben', 
        icon: '💳', 
        color: 'bg-purple-100 text-purple-800' 
    },
    wertguthaben: { 
        label: 'Wertguthaben', 
        icon: '🏦', 
        color: 'bg-emerald-100 text-emerald-800' 
    },
    wertguthaben_gesetzlich: { 
        label: 'Wertguthaben (gesetzlich)', 
        icon: '⚖️', 
        color: 'bg-yellow-100 text-yellow-800' 
    },
    aktionscode: { 
        label: 'Aktionscode', 
        icon: '🏷️', 
        color: 'bg-pink-100 text-pink-800' 
    }
};

// ========================================
// INITIALISIERUNG
// ========================================
export function initializeWertguthaben() {
    console.log("💰 Wertguthaben-System wird initialisiert...");

    // Einstellungen aus Firebase laden (NACH loadUserSettings)
    loadSettings();

    if (db) {
        wertguthabenCollection = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben');
    }

    setupEventListeners();
    populateEigentuemerDropdowns();
    setKaufdatumToToday();
}

function setupEventListeners() {
    // Buttons
    const createBtn = document.getElementById('btn-create-wertguthaben');
    if (createBtn && !createBtn.dataset.listenerAttached) {
        createBtn.addEventListener('click', openCreateModal);
        createBtn.dataset.listenerAttached = 'true';
    }

    const settingsBtn = document.getElementById('btn-wertguthaben-settings');
    if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
        settingsBtn.addEventListener('click', openSettingsModal);
        settingsBtn.dataset.listenerAttached = 'true';
    }

    const closeModal = document.getElementById('closeWertguthabenModal');
    if (closeModal && !closeModal.dataset.listenerAttached) {
        closeModal.addEventListener('click', closeWertguthabenModal);
        closeModal.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelWertguthabenBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeWertguthabenModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveWertguthabenBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveWertguthaben);
        saveBtn.dataset.listenerAttached = 'true';
    }

    const closeDetails = document.getElementById('closeWertguthabenDetailsModal');
    if (closeDetails && !closeDetails.dataset.listenerAttached) {
        closeDetails.addEventListener('click', () => {
            document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        });
        closeDetails.dataset.listenerAttached = 'true';
    }

    // Typ-Change Event
    const typSelect = document.getElementById('wgTyp');
    if (typSelect && !typSelect.dataset.listenerAttached) {
        typSelect.addEventListener('change', handleTypChange);
        typSelect.dataset.listenerAttached = 'true';
    }

    // Eigentümer-Change Event
    const eigentuemerSelect = document.getElementById('wgEigentuemer');
    if (eigentuemerSelect && !eigentuemerSelect.dataset.listenerAttached) {
        eigentuemerSelect.addEventListener('change', handleEigentuemerChange);
        eigentuemerSelect.dataset.listenerAttached = 'true';
    }

    // Quick-Select Buttons für Ablaufdatum
    document.querySelectorAll('.wg-ablauf-quick').forEach(btn => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', (e) => {
                const years = e.target.dataset.years;
                const dateInput = document.getElementById('wgWertAblauf');
                
                if (years === 'unlimited') {
                    dateInput.value = '';
                    dateInput.placeholder = 'Unbegrenzt';
                } else {
                    const date = new Date();
                    date.setFullYear(date.getFullYear() + parseInt(years));
                    dateInput.value = date.toISOString().split('T')[0];
                }
            });
            btn.dataset.listenerAttached = 'true';
        }
    });

    // Suche & Filter
    const searchInput = document.getElementById('search-wertguthaben');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderWertguthabenTable();
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    const filterTyp = document.getElementById('filter-wg-typ');
    if (filterTyp && !filterTyp.dataset.listenerAttached) {
        filterTyp.addEventListener('change', (e) => {
            currentFilter.typ = e.target.value;
            renderWertguthabenTable();
        });
        filterTyp.dataset.listenerAttached = 'true';
    }

    const filterEigentuemer = document.getElementById('filter-wg-eigentuemer');
    if (filterEigentuemer && !filterEigentuemer.dataset.listenerAttached) {
        filterEigentuemer.addEventListener('change', (e) => {
            currentFilter.eigentuemer = e.target.value;
            renderWertguthabenTable();
        });
        filterEigentuemer.dataset.listenerAttached = 'true';
    }

    const filterStatus = document.getElementById('filter-wg-status');
    if (filterStatus && !filterStatus.dataset.listenerAttached) {
        filterStatus.addEventListener('change', (e) => {
            currentFilter.status = e.target.value;
            renderWertguthabenTable();
        });
        filterStatus.dataset.listenerAttached = 'true';
    }

    const resetFilters = document.getElementById('reset-filters-wertguthaben');
    if (resetFilters && !resetFilters.dataset.listenerAttached) {
        resetFilters.addEventListener('click', () => {
            currentFilter = { typ: '', eigentuemer: '', status: 'aktiv' };
            searchTerm = '';
            document.getElementById('search-wertguthaben').value = '';
            document.getElementById('filter-wg-typ').value = '';
            document.getElementById('filter-wg-eigentuemer').value = '';
            document.getElementById('filter-wg-status').value = 'aktiv';
            renderWertguthabenTable();
        });
        resetFilters.dataset.listenerAttached = 'true';
    }
}

// ========================================
// FIREBASE LISTENER
// ========================================
export function listenForWertguthaben() {
    if (!wertguthabenCollection) {
        console.warn("⚠️ Wertguthaben-Collection noch nicht initialisiert. Warte...");
        setTimeout(listenForWertguthaben, 500);
        return;
    }

    try {
        // DATENSCHUTZ-FIX: Nur Wertguthaben laden, die vom aktuellen User erstellt wurden
        // ODER wo der User als Eigentümer eingetragen ist
        const q = query(wertguthabenCollection, orderBy('createdAt', 'desc'));
        
        onSnapshot(q, (snapshot) => {
            WERTGUTHABEN = {};
            
            snapshot.forEach((doc) => {
                const data = doc.data();
                
                // DATENSCHUTZ: Nur eigene Einträge speichern
                // (erstellt von mir ODER ich bin Eigentümer)
                if (data.createdBy === currentUser.mode || data.eigentuemer === currentUser.mode) {
                    WERTGUTHABEN[doc.id] = {
                        id: doc.id,
                        ...data
                    };
                }
            });

            console.log(`✅ ${Object.keys(WERTGUTHABEN).length} Wertguthaben geladen (nur eigene)`);
            renderWertguthabenTable();
            updateStatistics();
        }, (error) => {
            console.error("Fehler beim Laden der Wertguthaben:", error);
            alertUser("Fehler beim Laden der Wertguthaben. Bitte Firestore-Regeln prüfen.", 'error');
        });
    } catch (error) {
        console.error("Fehler beim Setup des Listeners:", error);
    }
}

// ========================================
// TABELLE RENDERN
// ========================================
function renderWertguthabenTable() {
    const tbody = document.getElementById('wertguthaben-table-body');
    if (!tbody) return;

    let wertguthaben = Object.values(WERTGUTHABEN);

    // Filter anwenden
    if (currentFilter.typ) {
        wertguthaben = wertguthaben.filter(w => w.typ === currentFilter.typ);
    }
    if (currentFilter.eigentuemer) {
        wertguthaben = wertguthaben.filter(w => w.eigentuemer === currentFilter.eigentuemer);
    }
    if (currentFilter.status) {
        wertguthaben = wertguthaben.filter(w => (w.status || 'aktiv') === currentFilter.status);
    }

    // Suche anwenden
    if (searchTerm) {
        wertguthaben = wertguthaben.filter(w => {
            const name = (w.name || '').toLowerCase();
            const code = (w.code || '').toLowerCase();
            const unternehmen = (w.unternehmen || '').toLowerCase();
            const eigentuemerName = (USERS[w.eigentuemer]?.name || w.eigentuemer || '').toLowerCase();
            
            return name.includes(searchTerm) || 
                   code.includes(searchTerm) || 
                   unternehmen.includes(searchTerm) ||
                   eigentuemerName.includes(searchTerm);
        });
    }

    if (wertguthaben.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-4 py-8 text-center text-gray-400 italic">
                    Keine Wertguthaben gefunden.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = wertguthaben.map(w => {
        const typConfig = TYP_CONFIG[w.typ] || TYP_CONFIG.guthaben;
        const eigentuemerName = USERS[w.eigentuemer]?.name || w.eigentuemer || 'Unbekannt';
        // Bei Aktionscode: gueltigBis statt einloesefrist verwenden
        const restzeit = w.typ === 'aktionscode' ? calculateRestzeit(w.gueltigBis) : calculateRestzeit(w.einloesefrist);
        const statusBadge = getStatusBadge(w, restzeit);
        const restwert = w.restwert !== undefined ? w.restwert : w.wert;
        
        return `
            <tr class="hover:bg-gray-50 cursor-pointer transition" onclick="window.openWertguthabenDetails('${w.id}')">
                <td class="px-4 py-3 text-sm">${eigentuemerName}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${typConfig.color}">
                        ${typConfig.icon} ${typConfig.label}
                    </span>
                </td>
                <td class="px-4 py-3 text-sm font-semibold">${w.name || '-'}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${w.unternehmen || '-'}</td>
                <td class="px-4 py-3 text-sm">
                    <div class="flex flex-col">
                        <span class="font-bold text-emerald-700">${restwert !== undefined ? restwert.toFixed(2) + ' €' : '-'}</span>
                        ${w.wert && w.wert !== restwert ? `<span class="text-xs text-gray-500">von ${w.wert.toFixed(2)} €</span>` : ''}
                    </div>
                </td>
                <td class="px-4 py-3 text-sm">${restzeit}</td>
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3 text-center" onclick="event.stopPropagation()">
                    <div class="flex justify-center gap-2">
                        <button onclick="window.openWertguthabenDetails('${w.id}')" 
                            class="p-1 text-emerald-600 hover:text-emerald-800" title="Details ansehen">
                            👁️
                        </button>
                        <button onclick="window.openEditWertguthaben('${w.id}')" 
                            class="p-1 text-blue-600 hover:text-blue-800" title="Bearbeiten">
                            ✏️
                        </button>
                        <button onclick="window.openTransaktionModal('${w.id}')" 
                            class="p-1 text-purple-600 hover:text-purple-800" title="Transaktion buchen">
                            💳
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ========================================
// STATISTIKEN AKTUALISIEREN
// ========================================
function updateStatistics() {
    const gutscheine = Object.values(WERTGUTHABEN).filter(w => w.typ === 'gutschein').length;
    const guthaben = Object.values(WERTGUTHABEN).filter(w => w.typ === 'guthaben').length;
    const wertguthaben = Object.values(WERTGUTHABEN).filter(w => w.typ.startsWith('wertguthaben')).length;
    const totalWert = Object.values(WERTGUTHABEN).reduce((sum, w) => sum + (w.wert || 0), 0);

    document.getElementById('stat-gutscheine').textContent = gutscheine;
    document.getElementById('stat-guthaben').textContent = guthaben;
    document.getElementById('stat-wertguthaben').textContent = wertguthaben;
    document.getElementById('stat-total-wert').textContent = totalWert.toFixed(2) + '€';
}

// ========================================
// RESTZEIT BERECHNEN
// ========================================
function calculateRestzeit(einloesefrist) {
    if (!einloesefrist) return '<span class="text-gray-400">Unbegrenzt</span>';
    
    const frist = new Date(einloesefrist);
    const heute = new Date();
    const diff = frist - heute;
    const tage = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (tage < 0) {
        return '<span class="text-red-600 font-bold">Abgelaufen</span>';
    } else if (tage === 0) {
        return '<span class="text-orange-600 font-bold">Heute!</span>';
    } else if (tage <= 30) {
        return `<span class="text-orange-600 font-bold">${tage} Tage</span>`;
    } else if (tage <= 90) {
        return `<span class="text-yellow-600">${tage} Tage</span>`;
    } else {
        return `<span class="text-green-600">${tage} Tage</span>`;
    }
}

// ========================================
// STATUS BADGE
// ========================================
function getStatusBadge(wertguthaben, restzeit) {
    // Manueller Status hat Vorrang (außer "aktiv")
    const manuellerStatus = wertguthaben.status || 'aktiv';
    if (manuellerStatus !== 'aktiv') {
        const statusConfig = STATUS_CONFIG[manuellerStatus] || STATUS_CONFIG.aktiv;
        return `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${statusConfig.color}">${statusConfig.icon} ${statusConfig.label}</span>`;
    }

    // Automatischer Status basierend auf Einlösefrist
    if (!wertguthaben.einloesefrist) {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800">∞ Gültig</span>';
    }

    const frist = new Date(wertguthaben.einloesefrist);
    const heute = new Date();
    const diff = frist - heute;
    const tage = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (tage < 0) {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">❌ Abgelaufen</span>';
    } else if (tage <= 7) {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">⚠️ Läuft ab!</span>';
    } else if (tage <= 30) {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800">⏰ Bald</span>';
    } else {
        return '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">✅ Gültig</span>';
    }
}

// ========================================
// HELPER FUNKTIONEN
// ========================================

// Funktion zum Kopieren von Text in die Zwischenablage
window.copyToClipboard = async function(text) {
    try {
        await navigator.clipboard.writeText(text);
        alertUser('In die Zwischenablage kopiert!', 'success');
    } catch (err) {
        console.error('Fehler beim Kopieren:', err);
        alertUser('Fehler beim Kopieren: ' + err.message, 'error');
    }
};

// Kopier-Button zu Input-Feld hinzufügen
window.addCopyButton = function(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    
    if (!input || !button) return;
    
    // Button initialisieren
    button.innerHTML = '📋';
    button.className = 'ml-2 p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer';
    button.title = 'Kopieren';
    
    // Click-Handler
    button.onclick = async () => {
        const text = input.value.trim();
        if (text) {
            await window.copyToClipboard(text);
        } else {
            alertUser('Kein Text zum Kopieren vorhanden!', 'warning');
        }
    };
    
    // Button sichtbar machen, wenn Text vorhanden
    const updateButtonVisibility = () => {
        button.style.display = input.value.trim() ? 'inline-block' : 'none';
    };
    
    // Event-Listener für Input-Änderungen
    input.addEventListener('input', updateButtonVisibility);
    input.addEventListener('change', updateButtonVisibility);
    
    // Initiale Sichtbarkeit prüfen
    updateButtonVisibility();
};

// Reset form
function resetForm() {
    document.getElementById('wgEigentuemer').value = 'self';
    document.getElementById('wgEigentuemerFrei').classList.add('hidden');
    document.getElementById('wgTyp').value = 'gutschein';
    document.getElementById('wgStatus').value = 'aktiv';
    document.getElementById('wgWert').value = '';
    document.getElementById('wgName').value = '';
    document.getElementById('wgUnternehmen').value = '';
    setKaufdatumToToday();
    document.getElementById('wgEinloesefrist').value = '';
    document.getElementById('wgCode').value = '';
    document.getElementById('wgPin').value = '';
    document.getElementById('wgSeriennummer').value = '';
    document.getElementById('wgWarnung').value = '';
    document.getElementById('wgNotizen').value = '';
    document.getElementById('wgCodeAblauf').value = '';
    document.getElementById('wgBedingungen').value = '';
    document.getElementById('wgWertAblauf').value = '';

    // Aktionscode-Felder zurücksetzen
    document.getElementById('wgRabattTyp').value = 'prozent';
    document.getElementById('wgRabattWert').value = '';
    document.getElementById('wgRabattEinheit').value = '%';
    document.getElementById('wgMindestbestellwert').value = '';
    document.getElementById('wgMaxRabatt').value = '';
    document.getElementById('wgGueltigAb').value = '';
    document.getElementById('wgGueltigBis').value = '';
    document.getElementById('wgMaxEinloesungen').value = '';
    document.getElementById('wgBereitsEingeloest').value = '0';
    document.getElementById('wgKontogebunden').value = 'nein';
    document.getElementById('wgKonto').value = '';
    document.getElementById('wgNeukunde').value = 'nein';
    document.getElementById('wgKombinierbar').value = 'ja';
    document.getElementById('wgKategorien').value = '';
    document.getElementById('wgAusnahmen').value = '';
    document.getElementById('wgQuelle').value = '';

    handleTypChange();

    document.getElementById('wertguthabenModal').style.display = 'flex';
}

function openCreateModal() {
    resetForm();
}

function closeWertguthabenModal() {
    document.getElementById('wertguthabenModal').style.display = 'none';
}

function handleTypChange() {
    const typ = document.getElementById('wgTyp').value;
    const gutscheinFelder = document.getElementById('gutschein-felder');
    const wertguthabenFelder = document.getElementById('wertguthaben-felder');
    const aktionscodeFelder = document.getElementById('aktionscode-felder');
    const wertInput = document.getElementById('wgWert');
    const einloesefristInput = document.getElementById('wgEinloesefrist');
    const kaufdatumInput = document.getElementById('wgKaufdatum');

    gutscheinFelder.classList.add('hidden');
    wertguthabenFelder.classList.add('hidden');
    aktionscodeFelder.classList.add('hidden');

    // Wert, Einlösefrist und Kaufdatum für Aktionscode deaktivieren
    if (typ === 'aktionscode') {
        wertInput.disabled = true;
        wertInput.value = '';
        wertInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        einloesefristInput.disabled = true;
        einloesefristInput.value = '';
        einloesefristInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        kaufdatumInput.disabled = true;
        kaufdatumInput.value = '';
        kaufdatumInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        aktionscodeFelder.classList.remove('hidden');
        // Rabatt-Typ Handler aufrufen um Einheit-Dropdown zu setzen
        if (typeof handleRabattTypChange === 'function') {
            handleRabattTypChange();
        }
    } else {
        wertInput.disabled = false;
        wertInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        einloesefristInput.disabled = false;
        einloesefristInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        kaufdatumInput.disabled = false;
        kaufdatumInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        
        if (typ === 'gutschein') {
            gutscheinFelder.classList.remove('hidden');
        } else if (typ === 'wertguthaben' || typ === 'wertguthaben_gesetzlich') {
            wertguthabenFelder.classList.remove('hidden');
        }
    }
}

function handleEigentuemerChange() {
    const eigentuemer = document.getElementById('wgEigentuemer').value;
    const freiInput = document.getElementById('wgEigentuemerFrei');

    if (eigentuemer === 'custom') {
        freiInput.classList.remove('hidden');
    } else {
        freiInput.classList.add('hidden');
    }
}

function setKaufdatumToToday() {
    const today = new Date().toISOString().split('T')[0];
    const kaufdatumInput = document.getElementById('wgKaufdatum');
    if (kaufdatumInput) {
        kaufdatumInput.value = today;
    }
}

// Rabatt-Typ Änderung: Felder ein-/ausblenden
window.handleRabattTypChange = function() {
    const rabattTyp = document.getElementById('wgRabattTyp').value;
    const rabattWertInput = document.getElementById('wgRabattWert');
    const rabattEinheit = document.getElementById('wgRabattEinheit');
    const maxRabattInput = document.getElementById('wgMaxRabatt');
    
    // Einheit-Dropdown immer deaktiviert (wird automatisch gesetzt)
    rabattEinheit.disabled = true;
    rabattEinheit.classList.add('bg-gray-100', 'cursor-not-allowed');
    
    // Bei Gratis Versand oder Geschenk: Rabattwert und Max-Rabatt deaktivieren
    if (rabattTyp === 'gratis_versand' || rabattTyp === 'geschenk') {
        rabattWertInput.disabled = true;
        rabattWertInput.value = '';
        rabattWertInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        rabattEinheit.value = '';
        maxRabattInput.disabled = true;
        maxRabattInput.value = '';
        maxRabattInput.classList.add('bg-gray-100', 'cursor-not-allowed');
    } else {
        rabattWertInput.disabled = false;
        rabattWertInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        
        // Einheit automatisch basierend auf Rabatt-Typ setzen
        if (rabattTyp === 'prozent') {
            rabattEinheit.value = '%';
            // Max-Rabatt nur bei Prozent sinnvoll
            maxRabattInput.disabled = false;
            maxRabattInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        } else if (rabattTyp === 'betrag') {
            rabattEinheit.value = '€';
            // Max-Rabatt bei Betrag nicht sinnvoll
            maxRabattInput.disabled = true;
            maxRabattInput.value = '';
            maxRabattInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        }
    }
    
    // Konto-Feld basierend auf Kontogebunden
    handleKontogebundenChange();
};

// Kontogebunden Änderung: Konto-Feld ein-/ausblenden
window.handleKontogebundenChange = function() {
    const kontogebunden = document.getElementById('wgKontogebunden').value;
    const kontoInput = document.getElementById('wgKonto');
    
    if (kontogebunden === 'ja') {
        kontoInput.disabled = false;
        kontoInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
    } else {
        kontoInput.disabled = true;
        kontoInput.value = '';
        kontoInput.classList.add('bg-gray-100', 'cursor-not-allowed');
    }
};

// Validierung: bereitsEingeloest <= maxEinloesungen
window.validateEinloesungen = function() {
    const maxEinloesungen = parseInt(document.getElementById('wgMaxEinloesungen').value) || 0;
    const bereitsEingeloest = parseInt(document.getElementById('wgBereitsEingeloest').value) || 0;
    const bereitsInput = document.getElementById('wgBereitsEingeloest');
    
    // Wenn maxEinloesungen 0 ist (unbegrenzt), keine Beschränkung
    if (maxEinloesungen > 0 && bereitsEingeloest > maxEinloesungen) {
        bereitsInput.value = maxEinloesungen;
        alertUser(`Bereits eingelöst kann nicht größer als Max. Einlösungen (${maxEinloesungen}) sein!`, 'warning');
    }
    
    // Max für bereitsEingeloest setzen
    if (maxEinloesungen > 0) {
        bereitsInput.max = maxEinloesungen;
    } else {
        bereitsInput.removeAttribute('max');
    }
};

// ========================================
// SPEICHERN
// ========================================
async function saveWertguthaben() {
    const editId = document.getElementById('editWertguthabenId').value;
    
    // Validierung
    const name = document.getElementById('wgName').value.trim();
    if (!name) {
        return alertUser('Bitte Name eingeben!', 'error');
    }

    let eigentuemer = document.getElementById('wgEigentuemer').value;
    if (eigentuemer === 'self') {
        eigentuemer = currentUser.mode;
    } else if (eigentuemer === 'custom') {
        eigentuemer = document.getElementById('wgEigentuemerFrei').value.trim();
        if (!eigentuemer) {
            return alertUser('Bitte Eigentümer eingeben!', 'error');
        }
    }

    const typ = document.getElementById('wgTyp').value;
    const status = document.getElementById('wgStatus').value;
    const wert = parseFloat(document.getElementById('wgWert').value) || 0;
    const unternehmen = document.getElementById('wgUnternehmen').value.trim();
    const kaufdatum = document.getElementById('wgKaufdatum').value;
    const einloesefrist = document.getElementById('wgEinloesefrist').value;
    const code = document.getElementById('wgCode').value.trim();
    const pin = document.getElementById('wgPin').value.trim();
    const seriennummer = document.getElementById('wgSeriennummer').value.trim();
    const warnung = parseInt(document.getElementById('wgWarnung').value) || null;
    const notizen = document.getElementById('wgNotizen').value.trim();

    const data = {
        eigentuemer,
        typ,
        status,
        name,
        unternehmen,
        wert,
        kaufdatum,
        einloesefrist,
        code,
        pin,
        seriennummer,
        warnung,
        notizen,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.mode
    };

    // Typ-spezifische Felder
    if (typ === 'gutschein') {
        data.codeAblauf = document.getElementById('wgCodeAblauf').value;
        data.bedingungen = document.getElementById('wgBedingungen').value.trim();
    } else if (typ === 'wertguthaben' || typ === 'wertguthaben_gesetzlich') {
        data.wertAblauf = document.getElementById('wgWertAblauf').value;
    } else if (typ === 'aktionscode') {
        data.rabattTyp = document.getElementById('wgRabattTyp').value;
        data.rabattWert = parseFloat(document.getElementById('wgRabattWert').value) || null;
        data.rabattEinheit = document.getElementById('wgRabattEinheit').value;
        data.mindestbestellwert = parseFloat(document.getElementById('wgMindestbestellwert').value) || null;
        data.maxRabatt = parseFloat(document.getElementById('wgMaxRabatt').value) || null;
        data.gueltigAb = document.getElementById('wgGueltigAb').value;
        data.gueltigBis = document.getElementById('wgGueltigBis').value;
        data.maxEinloesungen = parseInt(document.getElementById('wgMaxEinloesungen').value) || 0;
        data.bereitsEingeloest = parseInt(document.getElementById('wgBereitsEingeloest').value) || 0;
        data.kontogebunden = document.getElementById('wgKontogebunden').value;
        data.konto = document.getElementById('wgKonto').value.trim();
        data.neukunde = document.getElementById('wgNeukunde').value;
        data.kombinierbar = document.getElementById('wgKombinierbar').value;
        data.kategorien = document.getElementById('wgKategorien').value.trim();
        data.ausnahmen = document.getElementById('wgAusnahmen').value.trim();
        data.quelle = document.getElementById('wgQuelle').value.trim();
    }

    try {
        if (editId) {
            // Update
            const docRef = doc(wertguthabenCollection, editId);
            await updateDoc(docRef, data);
            alertUser('Wertguthaben aktualisiert!', 'success');
        } else {
            // Create
            data.createdAt = serverTimestamp();
            data.createdBy = currentUser.mode;
            await addDoc(wertguthabenCollection, data);
            alertUser('Wertguthaben erstellt!', 'success');
        }

        closeWertguthabenModal();
    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        alertUser('Fehler beim Speichern: ' + error.message, 'error');
    }
}

// ========================================
// DETAILS ANZEIGEN (siehe unten bei Transaktions-System für erweiterte Version)
// ========================================

// ========================================
// BEARBEITEN
// ========================================
window.openEditWertguthaben = function(id) {
    const wg = WERTGUTHABEN[id];
    if (!wg) return;

    document.getElementById('wertguthabenModalTitle').textContent = 'Wertguthaben bearbeiten';
    document.getElementById('editWertguthabenId').value = id;

    // Eigentümer
    if (Object.keys(USERS).includes(wg.eigentuemer)) {
        document.getElementById('wgEigentuemer').value = wg.eigentuemer;
        document.getElementById('wgEigentuemerFrei').classList.add('hidden');
    } else {
        document.getElementById('wgEigentuemer').value = 'custom';
        document.getElementById('wgEigentuemerFrei').value = wg.eigentuemer;
        document.getElementById('wgEigentuemerFrei').classList.remove('hidden');
    }

    document.getElementById('wgTyp').value = wg.typ;
    document.getElementById('wgStatus').value = wg.status || 'aktiv';
    document.getElementById('wgWert').value = wg.wert || '';
    document.getElementById('wgName').value = wg.name || '';
    document.getElementById('wgUnternehmen').value = wg.unternehmen || '';
    document.getElementById('wgKaufdatum').value = wg.kaufdatum || '';
    document.getElementById('wgEinloesefrist').value = wg.einloesefrist || '';
    document.getElementById('wgCode').value = wg.code || '';
    document.getElementById('wgPin').value = wg.pin || '';
    document.getElementById('wgSeriennummer').value = wg.seriennummer || '';
    document.getElementById('wgWarnung').value = wg.warnung || '';
    document.getElementById('wgNotizen').value = wg.notizen || '';
    document.getElementById('wgCodeAblauf').value = wg.codeAblauf || '';
    document.getElementById('wgBedingungen').value = wg.bedingungen || '';
    document.getElementById('wgWertAblauf').value = wg.wertAblauf || '';

    // Aktionscode-Felder
    document.getElementById('wgRabattTyp').value = wg.rabattTyp || 'prozent';
    document.getElementById('wgRabattWert').value = wg.rabattWert || '';
    document.getElementById('wgRabattEinheit').value = wg.rabattEinheit || '%';
    document.getElementById('wgMindestbestellwert').value = wg.mindestbestellwert || '';
    document.getElementById('wgMaxRabatt').value = wg.maxRabatt || '';
    document.getElementById('wgGueltigAb').value = wg.gueltigAb || '';
    document.getElementById('wgGueltigBis').value = wg.gueltigBis || '';
    document.getElementById('wgMaxEinloesungen').value = wg.maxEinloesungen || '';
    document.getElementById('wgBereitsEingeloest').value = wg.bereitsEingeloest || '0';
    document.getElementById('wgKontogebunden').value = wg.kontogebunden || 'nein';
    document.getElementById('wgKonto').value = wg.konto || '';
    document.getElementById('wgNeukunde').value = wg.neukunde || 'nein';
    document.getElementById('wgKombinierbar').value = wg.kombinierbar || 'ja';
    document.getElementById('wgKategorien').value = wg.kategorien || '';
    document.getElementById('wgAusnahmen').value = wg.ausnahmen || '';
    document.getElementById('wgQuelle').value = wg.quelle || '';

    handleTypChange();

    document.getElementById('wertguthabenModal').style.display = 'flex';
};

// ========================================
// LÖSCHEN
// ========================================
window.deleteWertguthaben = async function(id) {
    if (!confirm('Wertguthaben wirklich löschen?')) return;

    try {
        const docRef = doc(wertguthabenCollection, id);
        await deleteDoc(docRef);
        alertUser('Wertguthaben gelöscht!', 'success');
    } catch (error) {
        console.error('Fehler beim Löschen:', error);
        alertUser('Fehler beim Löschen: ' + error.message, 'error');
    }
};

// ========================================
// DROPDOWNS FÜLLEN
// ========================================
function populateEigentuemerDropdowns() {
    const dropdowns = [
        document.getElementById('wgEigentuemer'),
        document.getElementById('filter-wg-eigentuemer')
    ];

    dropdowns.forEach(dropdown => {
        if (!dropdown) return;

        const currentOptions = dropdown.querySelectorAll('option[data-user]');
        currentOptions.forEach(opt => opt.remove());

        Object.entries(USERS).forEach(([userId, userData]) => {
            const option = document.createElement('option');
            option.value = userId;
            option.textContent = userData.name;
            option.dataset.user = 'true';
            
            if (dropdown.id === 'wgEigentuemer') {
                dropdown.insertBefore(option, dropdown.querySelector('option[value="custom"]'));
            } else {
                dropdown.appendChild(option);
            }
        });
    });
}
// ========================================
// TRANSAKTIONS-SYSTEM
// ========================================

// Transaktion Modal öffnen
window.openTransaktionModal = async function(wertguthabenId) {
    // WICHTIG: Aktuelle Daten aus der Datenbank holen, nicht aus Cache
    const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
    const wertguthabenDoc = await getDoc(wertguthabenRef);
    
    if (!wertguthabenDoc.exists()) {
        return alertUser('Wertguthaben nicht gefunden!', 'error');
    }
    
    const wg = wertguthabenDoc.data();
    
    // Cache aktualisieren
    WERTGUTHABEN[wertguthabenId] = { ...wg, id: wertguthabenId };

    document.getElementById('transaktionWertguthabenId').value = wertguthabenId;
    
    // Transaktionstyp basierend auf Wertguthaben-Typ setzen
    const transaktionTypSelect = document.getElementById('transaktionTyp');
    const transaktionBetragInput = document.getElementById('transaktionBetrag');
    const transaktionBetragContainer = document.getElementById('transaktionBetragContainer');
    const transaktionEinloesungContainer = document.getElementById('transaktionEinloesungContainer');
    const transaktionVerfuegbar = document.getElementById('transaktionVerfuegbar');
    
    // Standard: Verwendung
    let typ = 'verwendung';
    let betragPlatzhalter = '';
    let verfuegbarText = '';
    
    if (wg.typ === 'aktionscode') {
        // Bei Aktionscode: Einlösung als Standard
        typ = 'einloesung';
        betragPlatzhalter = '0';
        verfuegbarText = `${wg.bereitsEingeloest || 0} / ${wg.maxEinloesungen || '∞'} Einlösungen`;
    } else if (wg.typ === 'gutschein' || wg.typ === 'wertguthaben' || wg.typ === 'wertguthaben_gesetzlich') {
        // Bei Gutscheinen/Guthaben: Betrag eingeben
        typ = 'verwendung';
        betragPlatzhalter = '';
        const restwert = wg.restwert !== undefined ? wg.restwert : wg.wert || 0;
        verfuegbarText = restwert.toFixed(2) + ' €';
    }
    
    transaktionTypSelect.value = typ;
    transaktionTypSelect.disabled = true; // Typ nicht änderbar machen
    transaktionBetragInput.value = betragPlatzhalter;
    
    // Einlösung-Vormerkung zurücksetzen (wichtig für erneutes Öffnen)
    const einloesungBtn = document.getElementById('einloesungVormerkenBtn');
    const vorgemerktDiv = document.getElementById('einloesungVorgemerkt');
    if (einloesungBtn) {
        einloesungBtn.disabled = false;
        einloesungBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
        einloesungBtn.classList.add('bg-pink-600', 'hover:bg-pink-700');
        einloesungBtn.textContent = '🎟️ 1x Einlösung buchen';
    }
    if (vorgemerktDiv) {
        vorgemerktDiv.classList.add('hidden');
    }
    
    // Sichtbarkeit der Container anpassen
    if (wg.typ === 'aktionscode') {
        if (transaktionBetragContainer) transaktionBetragContainer.classList.add('hidden');
        if (transaktionEinloesungContainer) transaktionEinloesungContainer.classList.remove('hidden');
        transaktionVerfuegbar.innerHTML = `
            <div class="text-center">
                <div class="text-3xl font-bold text-pink-600 mb-2">${wg.bereitsEingeloest || 0} / ${wg.maxEinloesungen || '∞'}</div>
                <div class="text-sm text-gray-600">Einlösungen verwendet</div>
                <div class="mt-2 text-lg font-semibold ${(wg.maxEinloesungen > 0 && wg.bereitsEingeloest >= wg.maxEinloesungen) ? 'text-red-600' : 'text-green-600'}">
                    ${(wg.maxEinloesungen > 0 && wg.bereitsEingeloest >= wg.maxEinloesungen) ? '❌ Keine Einlösungen mehr verfügbar' : `✅ ${wg.maxEinloesungen > 0 ? (wg.maxEinloesungen - (wg.bereitsEingeloest || 0)) : '∞'} Einlösung(en) verfügbar`}
                </div>
            </div>
        `;
    } else {
        if (transaktionBetragContainer) transaktionBetragContainer.classList.remove('hidden');
        if (transaktionEinloesungContainer) transaktionEinloesungContainer.classList.add('hidden');
        transaktionVerfuegbar.textContent = verfuegbarText;
    }
    
    document.getElementById('transaktionDatum').value = new Date().toISOString().split('T')[0];
    document.getElementById('transaktionBestellnr').value = '';
    document.getElementById('transaktionRechnungsnr').value = '';
    document.getElementById('transaktionBeschreibung').value = '';

    // Event-Listener für Transaktions-Modal (nur einmal)
    const closeBtn = document.getElementById('closeTransaktionModal');
    if (closeBtn && !closeBtn.dataset.listenerAttached) {
        closeBtn.addEventListener('click', closeTransaktionModal);
        closeBtn.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelTransaktionBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeTransaktionModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveTransaktionBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveTransaktion);
        saveBtn.dataset.listenerAttached = 'true';
    }

    // Event-Listener für Einlösung-Vormerken-Button (einloesungBtn bereits oben deklariert)
    if (einloesungBtn && !einloesungBtn.dataset.listenerAttached) {
        einloesungBtn.addEventListener('click', function() {
            // Einlösung vormerken
            this.disabled = true;
            this.classList.add('bg-gray-400', 'cursor-not-allowed');
            this.classList.remove('bg-pink-600', 'hover:bg-pink-700');
            this.textContent = '✅ 1x Einlösung vorgemerkt';
            
            // Vorgemerkt-Info anzeigen (vorgemerktDiv bereits oben deklariert)
            if (vorgemerktDiv) {
                vorgemerktDiv.classList.remove('hidden');
            }
            
            // Transaktionstyp auf "einloesung" setzen
            document.getElementById('transaktionTyp').value = 'einloesung';
        });
        einloesungBtn.dataset.listenerAttached = 'true';
    }

    // Event-Listener für "Transaktion buchen" Button im Details-Modal
    const addTransBtn = document.getElementById('addTransaktionBtn');
    if (addTransBtn && !addTransBtn.dataset.listenerAttached) {
        addTransBtn.addEventListener('click', () => {
            const wgId = addTransBtn.dataset.wertguthabenId;
            if (wgId) {
                document.getElementById('wertguthabenDetailsModal').style.display = 'none';
                window.openTransaktionModal(wgId);
            }
        });
        addTransBtn.dataset.listenerAttached = 'true';
    }

    document.getElementById('transaktionModal').style.display = 'flex';
};

function closeTransaktionModal() {
    document.getElementById('transaktionModal').style.display = 'none';
}

// Transaktion speichern
async function saveTransaktion() {
    const wertguthabenId = document.getElementById('transaktionWertguthabenId').value;
    const typ = document.getElementById('transaktionTyp').value;
    const betrag = parseFloat(document.getElementById('transaktionBetrag').value) || 0;
    const datum = document.getElementById('transaktionDatum').value;
    const bestellnr = document.getElementById('transaktionBestellnr').value.trim();
    const rechnungsnr = document.getElementById('transaktionRechnungsnr').value.trim();
    const beschreibung = document.getElementById('transaktionBeschreibung').value.trim();

    if (!datum) {
        return alertUser('Bitte ein Datum eingeben!', 'error');
    }

    const wg = WERTGUTHABEN[wertguthabenId];
    if (!wg) {
        return alertUser('Wertguthaben nicht gefunden!', 'error');
    }

    // Aktionscode: Einlösung buchen
    if (wg.typ === 'aktionscode' && typ === 'einloesung') {
        const maxEinloesungen = wg.maxEinloesungen || 0;
        const bereitsEingeloest = wg.bereitsEingeloest || 0;
        
        // Prüfen ob noch Einlösungen verfügbar (0 = unbegrenzt)
        if (maxEinloesungen > 0 && bereitsEingeloest >= maxEinloesungen) {
            return alertUser('Keine Einlösungen mehr verfügbar! Der Aktionscode ist bereits vollständig eingelöst.', 'error');
        }

        try {
            // Transaktion als Subcollection speichern
            const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');
            
            const transaktionData = {
                typ: 'einloesung',
                betrag: 0,
                datum: serverTimestamp(),
                bestellnr,
                rechnungsnr,
                beschreibung: beschreibung || 'Aktionscode eingelöst',
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode
            };

            await addDoc(transaktionenRef, transaktionData);

            // Einlösungen erhöhen
            const neueEinloesungen = bereitsEingeloest + 1;
            
            // Update-Daten vorbereiten
            const updateData = {
                bereitsEingeloest: neueEinloesungen,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.mode
            };
            
            // Status auf "eingeloest" setzen wenn max erreicht
            if (maxEinloesungen > 0 && neueEinloesungen >= maxEinloesungen) {
                updateData.status = 'eingeloest';
            }

            const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
            await updateDoc(wertguthabenRef, updateData);

            const statusMsg = (maxEinloesungen > 0 && neueEinloesungen >= maxEinloesungen) 
                ? ' Der Aktionscode ist jetzt vollständig eingelöst!' 
                : '';
            alertUser(`Einlösung erfolgreich gebucht! (${neueEinloesungen}/${maxEinloesungen > 0 ? maxEinloesungen : '∞'})${statusMsg}`, 'success');
            closeTransaktionModal();

            // Details-Modal neu laden, falls offen
            if (document.getElementById('wertguthabenDetailsModal').style.display === 'flex') {
                setTimeout(() => openWertguthabenDetails(wertguthabenId), 300);
            }
        } catch (error) {
            console.error('Fehler beim Buchen der Einlösung:', error);
            alertUser('Fehler beim Buchen: ' + error.message, 'error');
        }
        return;
    }

    // Normaler Modus: Betrag-basierte Transaktion
    if (!betrag || betrag <= 0) {
        return alertUser('Bitte einen gültigen Betrag eingeben!', 'error');
    }

    const aktuellerRestwert = wg.restwert !== undefined ? wg.restwert : wg.wert || 0;

    // Bei Verwendung: Prüfen, ob genug Guthaben vorhanden ist
    if (typ === 'verwendung' && betrag > aktuellerRestwert) {
        return alertUser(`Nicht genug Guthaben! Verfügbar: ${aktuellerRestwert.toFixed(2)} €`, 'error');
    }

    try {
        // Transaktion als Subcollection speichern
        const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');
        
        const transaktionData = {
            typ,
            betrag,
            datum: serverTimestamp(),
            bestellnr,
            rechnungsnr,
            beschreibung,
            createdAt: serverTimestamp(),
            createdBy: currentUser.mode
        };

        await addDoc(transaktionenRef, transaktionData);

        // Restwert aktualisieren
        const neuerRestwert = typ === 'verwendung' 
            ? aktuellerRestwert - betrag 
            : aktuellerRestwert + betrag;

        const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
        await updateDoc(wertguthabenRef, {
            restwert: neuerRestwert,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        });

        alertUser('Transaktion erfolgreich gebucht!', 'success');
        closeTransaktionModal();

        // Details-Modal neu laden, falls offen
        if (document.getElementById('wertguthabenDetailsModal').style.display === 'flex') {
            setTimeout(() => openWertguthabenDetails(wertguthabenId), 300);
        }
    } catch (error) {
        console.error('Fehler beim Buchen der Transaktion:', error);
        alertUser('Fehler beim Buchen: ' + error.message, 'error');
    }
}

// Transaktionen laden
async function loadTransaktionen(wertguthabenId) {
    try {
        const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');
        const q = query(transaktionenRef, orderBy('datum', 'desc'));
        
        return new Promise((resolve) => {
            onSnapshot(q, (snapshot) => {
                const transaktionen = [];
                snapshot.forEach((doc) => {
                    transaktionen.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                resolve(transaktionen);
            });
        });
    } catch (error) {
        console.error('Fehler beim Laden der Transaktionen:', error);
        return [];
    }
}

// Details-Modal mit Transaktionen erweitern
window.openWertguthabenDetails = async function(id) {
    const wg = WERTGUTHABEN[id];
    if (!wg) return;

    const typConfig = TYP_CONFIG[wg.typ] || TYP_CONFIG.guthaben;
    const eigentuemerName = USERS[wg.eigentuemer]?.name || wg.eigentuemer || 'Unbekannt';
    // Bei Aktionscode: gueltigBis statt einloesefrist verwenden
    const restzeit = wg.typ === 'aktionscode' ? calculateRestzeit(wg.gueltigBis) : calculateRestzeit(wg.einloesefrist);
    const restwert = wg.restwert !== undefined ? wg.restwert : wg.wert || 0;
    const ursprungswert = wg.wert || 0;

    const content = document.getElementById('wertguthabenDetailsContent');
    content.innerHTML = `
        <div class="grid grid-cols-2 gap-4">
            <div>
                <p class="text-sm font-bold text-gray-600">Eigentümer</p>
                <p class="text-lg">${eigentuemerName}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Typ</p>
                <p><span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${typConfig.color}">
                    ${typConfig.icon} ${typConfig.label}
                </span></p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Status</p>
                <p><span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${(STATUS_CONFIG[wg.status] || STATUS_CONFIG.aktiv).color}">
                    ${(STATUS_CONFIG[wg.status] || STATUS_CONFIG.aktiv).icon} ${(STATUS_CONFIG[wg.status] || STATUS_CONFIG.aktiv).label}
                </span></p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Name</p>
                <p class="text-lg font-semibold">${wg.name || '-'}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Unternehmen</p>
                <p class="text-lg">${wg.unternehmen || '-'}</p>
            </div>
            ${wg.typ !== 'aktionscode' ? `
            <div>
                <p class="text-sm font-bold text-gray-600">Ursprungswert</p>
                <p class="text-xl font-bold text-gray-600">${ursprungswert.toFixed(2)} €</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Aktueller Restwert</p>
                <p class="text-2xl font-bold text-emerald-700">${restwert.toFixed(2)} €</p>
            </div>` : ''}
            <div>
                <p class="text-sm font-bold text-gray-600">Restzeit</p>
                <p class="text-lg">${restzeit}</p>
            </div>
            ${wg.typ !== 'aktionscode' ? `
            <div>
                <p class="text-sm font-bold text-gray-600">Kaufdatum</p>
                <p>${wg.kaufdatum ? new Date(wg.kaufdatum).toLocaleDateString('de-DE') : '-'}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Einlösefrist</p>
                <p>${wg.einloesefrist ? new Date(wg.einloesefrist).toLocaleDateString('de-DE') : 'Unbegrenzt'}</p>
            </div>` : ''}
            ${wg.code ? `<div><p class="text-sm font-bold text-gray-600">Code</p><div class="flex items-center gap-2"><p class="font-mono bg-gray-100 p-2 rounded flex-1">${wg.code}</p><button onclick="window.copyToClipboard('${wg.code}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Kopieren">📋</button></div></div>` : ''}
            ${wg.pin ? `<div><p class="text-sm font-bold text-gray-600">PIN</p><div class="flex items-center gap-2"><p class="font-mono bg-gray-100 p-2 rounded flex-1">${wg.pin}</p><button onclick="window.copyToClipboard('${wg.pin}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Kopieren">📋</button></div></div>` : ''}
            ${wg.seriennummer ? `<div><p class="text-sm font-bold text-gray-600">Seriennummer</p><div class="flex items-center gap-2"><p class="font-mono bg-gray-100 p-2 rounded flex-1">${wg.seriennummer}</p><button onclick="window.copyToClipboard('${wg.seriennummer}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Kopieren">📋</button></div></div>` : ''}
            ${wg.warnung ? `<div><p class="text-sm font-bold text-gray-600">Warnung</p><p>${wg.warnung} Tage vor Ablauf</p></div>` : ''}
        </div>
        
        ${wg.bedingungen ? `
            <div class="mt-4 p-4 bg-blue-50 rounded-lg">
                <p class="text-sm font-bold text-blue-800 mb-2">📋 Bedingungen</p>
                <p class="text-sm whitespace-pre-wrap">${wg.bedingungen}</p>
            </div>
        ` : ''}
        
        ${wg.typ === 'aktionscode' ? `
            <div class="mt-4 p-4 bg-pink-50 rounded-lg border-2 border-pink-200">
                <p class="text-sm font-bold text-pink-800 mb-3">🏷️ Aktionscode-Details</p>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div><span class="font-bold">Rabatt:</span> ${wg.rabattWert ? (wg.rabattTyp === 'prozent' ? wg.rabattWert + '%' : wg.rabattWert.toFixed(2) + ' €') : (wg.rabattTyp === 'gratis_versand' ? 'Gratis Versand' : (wg.rabattTyp === 'geschenk' ? 'Gratis Geschenk' : '-'))}</div>
                    <div><span class="font-bold">Mindestbestellwert:</span> ${wg.mindestbestellwert ? wg.mindestbestellwert.toFixed(2) + ' €' : 'Keiner'}</div>
                    <div><span class="font-bold">Max. Rabatt:</span> ${wg.maxRabatt ? wg.maxRabatt.toFixed(2) + ' €' : 'Unbegrenzt'}</div>
                    <div><span class="font-bold">Gültig ab:</span> ${wg.gueltigAb ? new Date(wg.gueltigAb).toLocaleDateString('de-DE') : 'Unbekannt'}</div>
                    <div><span class="font-bold">Gültig bis:</span> ${wg.gueltigBis ? new Date(wg.gueltigBis).toLocaleDateString('de-DE') : 'Unbekannt'}</div>
                    <div><span class="font-bold">Einlösungen:</span> ${wg.bereitsEingeloest || 0} / ${wg.maxEinloesungen || '∞'}</div>
                    <div><span class="font-bold">Kontogebunden:</span> ${wg.kontogebunden === 'ja' ? 'Ja' + (wg.konto ? ' (' + wg.konto + ')' : '') : (wg.kontogebunden === 'unbekannt' ? 'Unbekannt' : 'Nein')}</div>
                    <div><span class="font-bold">Nur Neukunden:</span> ${wg.neukunde === 'ja' ? 'Ja' : (wg.neukunde === 'unbekannt' ? 'Unbekannt' : 'Nein')}</div>
                    <div><span class="font-bold">Kombinierbar:</span> ${wg.kombinierbar === 'ja' ? 'Ja' : (wg.kombinierbar === 'unbekannt' ? 'Unbekannt' : 'Nein')}</div>
                    ${wg.kategorien ? `<div class="col-span-2"><span class="font-bold">Kategorien:</span> ${wg.kategorien}</div>` : ''}
                    ${wg.ausnahmen ? `<div class="col-span-2"><span class="font-bold">Ausnahmen:</span> ${wg.ausnahmen}</div>` : ''}
                    ${wg.quelle ? `<div class="col-span-2"><span class="font-bold">Quelle:</span> ${wg.quelle}</div>` : ''}
                </div>
            </div>
        ` : ''}
        
        ${wg.notizen ? `
            <div class="mt-4 p-4 bg-gray-50 rounded-lg">
                <p class="text-sm font-bold text-gray-700 mb-2">📝 Notizen</p>
                <p class="text-sm whitespace-pre-wrap">${wg.notizen}</p>
            </div>
        ` : ''}
    `;

    // Transaktionen laden und anzeigen
    const transaktionen = await loadTransaktionen(id);
    const transaktionsList = document.getElementById('transaktionsList');
    
    if (transaktionen.length === 0) {
        transaktionsList.innerHTML = '<p class="text-center text-gray-400 italic py-4">Noch keine Transaktionen vorhanden.</p>';
    } else {
        transaktionsList.innerHTML = transaktionen.map(t => {
            // Firebase Timestamp korrekt in Date konvertieren
            let datum = '-';
            if (t.datum) {
                // Firebase Timestamp hat toDate() Methode, oder es ist ein Objekt mit seconds
                let dateObj;
                if (t.datum.toDate && typeof t.datum.toDate === 'function') {
                    dateObj = t.datum.toDate();
                } else if (t.datum.seconds) {
                    dateObj = new Date(t.datum.seconds * 1000);
                } else if (typeof t.datum === 'string') {
                    dateObj = new Date(t.datum);
                } else {
                    dateObj = new Date(t.datum);
                }
                
                if (!isNaN(dateObj.getTime())) {
                    datum = dateObj.toLocaleString('de-DE', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                }
            }
            const icon = t.typ === 'verwendung' ? '📉' : (t.typ === 'einloesung' ? '🎟️' : '📈');
            const colorClass = t.typ === 'verwendung' ? 'text-red-600' : (t.typ === 'einloesung' ? 'text-pink-600' : 'text-green-600');
            const betragText = t.typ === 'verwendung' ? `- ${(t.betrag || 0).toFixed(2)} €` : (t.typ === 'einloesung' ? '1x Einlösung' : `+ ${(t.betrag || 0).toFixed(2)} €`);
            
            return `
                <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-lg">${icon}</span>
                                <span class="font-bold ${colorClass}">${betragText}</span>
                                <span class="text-sm text-gray-500">${datum}</span>
                            </div>
                            ${t.beschreibung ? `<p class="text-sm text-gray-600 mb-1">${t.beschreibung}</p>` : ''}
                            <div class="flex gap-3 text-xs text-gray-500">
                                ${t.bestellnr ? `<span>📦 Best.-Nr: ${t.bestellnr}</span>` : ''}
                                ${t.rechnungsnr ? `<span>🧾 Rech.-Nr: ${t.rechnungsnr}</span>` : ''}
                            </div>
                        </div>
                        <button onclick="deleteTransaktion('${id}', '${t.id}')" 
                                class="ml-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Transaktion löschen">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // WertguthabenId für Transaktion-Button speichern
    document.getElementById('addTransaktionBtn').dataset.wertguthabenId = id;

    // Event-Listener für Buttons
    document.getElementById('addTransaktionBtn').onclick = () => {
        document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        window.openTransaktionModal(id);
    };

    document.getElementById('editWertguthabenDetailsBtn').onclick = () => {
        document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        window.openEditWertguthaben(id);
    };

    document.getElementById('deleteWertguthabenBtn').onclick = async () => {
        // confirm() ist bereits in deleteWertguthaben() enthalten
        await window.deleteWertguthaben(id);
        document.getElementById('wertguthabenDetailsModal').style.display = 'none';
    };

    document.getElementById('wertguthabenDetailsModal').style.display = 'flex';
};

// ========================================
// EINSTELLUNGEN
// ========================================

function openSettingsModal() {
    // Aktuelle Werte laden
    document.getElementById('settings-warning-gutschein').value = wertguthabenSettings.defaultWarnings.gutschein;
    document.getElementById('settings-warning-guthaben').value = wertguthabenSettings.defaultWarnings.guthaben;
    document.getElementById('settings-warning-wertguthaben').value = wertguthabenSettings.defaultWarnings.wertguthaben;
    document.getElementById('settings-warning-wertguthaben_gesetzlich').value = wertguthabenSettings.defaultWarnings.wertguthaben_gesetzlich;

    // Event-Listener (nur einmal)
    const closeBtn = document.getElementById('closeWertguthabenSettingsModal');
    if (closeBtn && !closeBtn.dataset.listenerAttached) {
        closeBtn.addEventListener('click', closeSettingsModal);
        closeBtn.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelWertguthabenSettingsBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeSettingsModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveWertguthabenSettingsBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveSettings);
        saveBtn.dataset.listenerAttached = 'true';
    }

    document.getElementById('wertguthabenSettingsModal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('wertguthabenSettingsModal').style.display = 'none';
}

async function saveSettings() {
    const gutschein = parseInt(document.getElementById('settings-warning-gutschein').value) || 14;
    const guthaben = parseInt(document.getElementById('settings-warning-guthaben').value) || 30;
    const wertguthaben = parseInt(document.getElementById('settings-warning-wertguthaben').value) || 90;
    const wertguthaben_gesetzlich = parseInt(document.getElementById('settings-warning-wertguthaben_gesetzlich').value) || 180;

    // Einstellungen aktualisieren
    wertguthabenSettings.defaultWarnings = {
        gutschein,
        guthaben,
        wertguthaben,
        wertguthaben_gesetzlich
    };

    // In Firebase speichern (geräteübergreifend)
    try {
        saveUserSetting('wertguthabenSettings', wertguthabenSettings);
        alertUser('Einstellungen gespeichert!', 'success');
        closeSettingsModal();
    } catch (error) {
        console.error('Fehler beim Speichern der Einstellungen:', error);
        alertUser('Fehler beim Speichern: ' + error.message, 'error');
    }
}

// Einstellungen beim Start laden
function loadSettings() {
    try {
        const saved = getUserSetting('wertguthabenSettings');
        if (saved) {
            const parsed = saved; // Bereits ein Objekt, kein JSON.parse nötig
            wertguthabenSettings.defaultWarnings = {
                ...wertguthabenSettings.defaultWarnings,
                ...parsed.defaultWarnings
            };
            console.log('✅ Wertguthaben-Einstellungen geladen:', wertguthabenSettings);
        }
    } catch (error) {
        console.warn('Konnte Einstellungen nicht laden:', error);
    }
}

// Transaktion löschen
window.deleteTransaktion = async function(wertguthabenId, transaktionId) {
    const wg = WERTGUTHABEN[wertguthabenId];
    if (!wg) {
        return alertUser('Wertguthaben nicht gefunden!', 'error');
    }

    // Sicherheitsabfrage
    const confirmDelete = confirm(
        `Möchten Sie diese Transaktion wirklich löschen?\n\n` +
        `Dadurch wird die Buchung rückgängig gemacht und der Status des Wertguthabens angepasst.\n\n` +
        `Diese Aktion kann nicht rückgängig gemacht werden!`
    );

    if (!confirmDelete) {
        return;
    }

    try {
        // WICHTIG: Transaktionsdetails VORHER holen, bevor sie gelöscht wird
        const transaktionRef = doc(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen', transaktionId);
        const transaktionDoc = await getDoc(transaktionRef);
        
        if (!transaktionDoc.exists()) {
            return alertUser('Transaktion nicht gefunden!', 'error');
        }
        
        const gelöschteTransaktion = transaktionDoc.data();
        
        // Jetzt Transaktion löschen
        await deleteDoc(transaktionRef);

        // Wertguthaben-Daten anpassen
        const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
        const updateData = {
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        };
        
        // Aktuelle Wertguthaben-Daten aus DB holen für korrekte Berechnung
        const wertguthabenDoc = await getDoc(wertguthabenRef);
        const aktuelleDaten = wertguthabenDoc.data();
        
        if (gelöschteTransaktion.typ === 'verwendung') {
            // Verwendung wieder hinzufügen
            const aktuellerRestwert = aktuelleDaten.restwert !== undefined ? aktuelleDaten.restwert : aktuelleDaten.wert || 0;
            updateData.restwert = aktuellerRestwert + (gelöschteTransaktion.betrag || 0);
        } else if (gelöschteTransaktion.typ === 'gutschrift') {
            // Gutschrift wieder abziehen
            const aktuellerRestwert = aktuelleDaten.restwert !== undefined ? aktuelleDaten.restwert : aktuelleDaten.wert || 0;
            updateData.restwert = Math.max(0, aktuellerRestwert - (gelöschteTransaktion.betrag || 0));
        } else if (gelöschteTransaktion.typ === 'einloesung' && aktuelleDaten.typ === 'aktionscode') {
            // Einlösung wieder zurücknehmen
            const bereitsEingeloest = aktuelleDaten.bereitsEingeloest || 0;
            updateData.bereitsEingeloest = Math.max(0, bereitsEingeloest - 1);
            
            // Status ggf. wieder auf "aktiv" setzen
            if (aktuelleDaten.status === 'eingeloest') {
                updateData.status = 'aktiv';
            }
        }

        await updateDoc(wertguthabenRef, updateData);

        alertUser('Transaktion erfolgreich gelöscht!', 'success');
        
        // Details-Modal neu laden
        if (document.getElementById('wertguthabenDetailsModal').style.display === 'flex') {
            setTimeout(() => openWertguthabenDetails(wertguthabenId), 300);
        }
    } catch (error) {
        console.error('Fehler beim Löschen der Transaktion:', error);
        alertUser('Fehler beim Löschen: ' + error.message, 'error');
    }
};


// Einstellungen werden in initializeWertguthaben() geladen (NACH loadUserSettings)

