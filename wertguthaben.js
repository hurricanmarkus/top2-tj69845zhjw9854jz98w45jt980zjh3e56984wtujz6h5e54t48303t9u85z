// @ts-check
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
let currentFilter = { typ: '', eigentuemer: '' };
let searchTerm = '';
let wertguthabenSettings = {
    defaultWarnings: {
        gutschein: 14,
        guthaben: 30,
        wertguthaben: 90,
        wertguthaben_gesetzlich: 180
    }
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
    }
};

// ========================================
// INITIALISIERUNG
// ========================================
export function initializeWertguthaben() {
    console.log("💰 Wertguthaben-System wird initialisiert...");

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

    const filterTyp = document.getElementById('filter-typ');
    if (filterTyp && !filterTyp.dataset.listenerAttached) {
        filterTyp.addEventListener('change', (e) => {
            currentFilter.typ = e.target.value;
            renderWertguthabenTable();
        });
        filterTyp.dataset.listenerAttached = 'true';
    }

    const filterEigentuemer = document.getElementById('filter-eigentuemer');
    if (filterEigentuemer && !filterEigentuemer.dataset.listenerAttached) {
        filterEigentuemer.addEventListener('change', (e) => {
            currentFilter.eigentuemer = e.target.value;
            renderWertguthabenTable();
        });
        filterEigentuemer.dataset.listenerAttached = 'true';
    }

    const resetFilters = document.getElementById('reset-filters-wertguthaben');
    if (resetFilters && !resetFilters.dataset.listenerAttached) {
        resetFilters.addEventListener('click', () => {
            currentFilter = { typ: '', eigentuemer: '' };
            searchTerm = '';
            document.getElementById('search-wertguthaben').value = '';
            document.getElementById('filter-typ').value = '';
            document.getElementById('filter-eigentuemer').value = '';
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
        const q = query(wertguthabenCollection, orderBy('createdAt', 'desc'));
        
        onSnapshot(q, (snapshot) => {
            WERTGUTHABEN = {};
            
            snapshot.forEach((doc) => {
                WERTGUTHABEN[doc.id] = {
                    id: doc.id,
                    ...doc.data()
                };
            });

            console.log(`✅ ${Object.keys(WERTGUTHABEN).length} Wertguthaben geladen`);
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
        const restzeit = calculateRestzeit(w.einloesefrist);
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
// MODAL FUNKTIONEN
// ========================================
window.openCreateModal = function() {
    document.getElementById('wertguthabenModalTitle').textContent = 'Neues Wertguthaben';
    document.getElementById('editWertguthabenId').value = '';
    
    // Reset form
    document.getElementById('wgEigentuemer').value = 'self';
    document.getElementById('wgEigentuemerFrei').classList.add('hidden');
    document.getElementById('wgTyp').value = 'gutschein';
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

    handleTypChange();

    document.getElementById('wertguthabenModal').style.display = 'flex';
};

function openCreateModal() {
    window.openCreateModal();
}

function closeWertguthabenModal() {
    document.getElementById('wertguthabenModal').style.display = 'none';
}

function handleTypChange() {
    const typ = document.getElementById('wgTyp').value;
    const gutscheinFelder = document.getElementById('gutschein-felder');
    const wertguthabenFelder = document.getElementById('wertguthaben-felder');

    gutscheinFelder.classList.add('hidden');
    wertguthabenFelder.classList.add('hidden');

    if (typ === 'gutschein') {
        gutscheinFelder.classList.remove('hidden');
    } else if (typ === 'wertguthaben' || typ === 'wertguthaben_gesetzlich') {
        wertguthabenFelder.classList.remove('hidden');
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
        document.getElementById('filter-eigentuemer')
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

// Transaktions-Modal öffnen
window.openTransaktionModal = function(wertguthabenId) {
    const wg = WERTGUTHABEN[wertguthabenId];
    if (!wg) return;

    document.getElementById('transaktionWertguthabenId').value = wertguthabenId;
    document.getElementById('transaktionTyp').value = 'verwendung';
    document.getElementById('transaktionBetrag').value = '';
    document.getElementById('transaktionDatum').value = new Date().toISOString().split('T')[0];
    document.getElementById('transaktionBestellnr').value = '';
    document.getElementById('transaktionRechnungsnr').value = '';
    document.getElementById('transaktionBeschreibung').value = '';

    const restwert = wg.restwert !== undefined ? wg.restwert : wg.wert || 0;
    document.getElementById('transaktionVerfuegbar').textContent = restwert.toFixed(2) + ' €';

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
    const betrag = parseFloat(document.getElementById('transaktionBetrag').value);
    const datum = document.getElementById('transaktionDatum').value;
    const bestellnr = document.getElementById('transaktionBestellnr').value.trim();
    const rechnungsnr = document.getElementById('transaktionRechnungsnr').value.trim();
    const beschreibung = document.getElementById('transaktionBeschreibung').value.trim();

    // Validierung
    if (!betrag || betrag <= 0) {
        return alertUser('Bitte einen gültigen Betrag eingeben!', 'error');
    }

    if (!datum) {
        return alertUser('Bitte ein Datum eingeben!', 'error');
    }

    const wg = WERTGUTHABEN[wertguthabenId];
    if (!wg) {
        return alertUser('Wertguthaben nicht gefunden!', 'error');
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
            datum,
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
    const restzeit = calculateRestzeit(wg.einloesefrist);
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
                <p class="text-sm font-bold text-gray-600">Name</p>
                <p class="text-lg font-semibold">${wg.name || '-'}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Unternehmen</p>
                <p class="text-lg">${wg.unternehmen || '-'}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Ursprungswert</p>
                <p class="text-xl font-bold text-gray-600">${ursprungswert.toFixed(2)} €</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Aktueller Restwert</p>
                <p class="text-2xl font-bold text-emerald-700">${restwert.toFixed(2)} €</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Restzeit</p>
                <p class="text-lg">${restzeit}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Kaufdatum</p>
                <p>${wg.kaufdatum ? new Date(wg.kaufdatum).toLocaleDateString('de-DE') : '-'}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Einlösefrist</p>
                <p>${wg.einloesefrist ? new Date(wg.einloesefrist).toLocaleDateString('de-DE') : 'Unbegrenzt'}</p>
            </div>
            ${wg.code ? `<div><p class="text-sm font-bold text-gray-600">Code</p><p class="font-mono bg-gray-100 p-2 rounded">${wg.code}</p></div>` : ''}
            ${wg.pin ? `<div><p class="text-sm font-bold text-gray-600">PIN</p><p class="font-mono bg-gray-100 p-2 rounded">${wg.pin}</p></div>` : ''}
            ${wg.seriennummer ? `<div><p class="text-sm font-bold text-gray-600">Seriennummer</p><p class="font-mono bg-gray-100 p-2 rounded">${wg.seriennummer}</p></div>` : ''}
            ${wg.warnung ? `<div><p class="text-sm font-bold text-gray-600">Warnung</p><p>${wg.warnung} Tage vor Ablauf</p></div>` : ''}
        </div>
        
        ${wg.bedingungen ? `
            <div class="mt-4 p-4 bg-blue-50 rounded-lg">
                <p class="text-sm font-bold text-blue-800 mb-2">📋 Bedingungen</p>
                <p class="text-sm whitespace-pre-wrap">${wg.bedingungen}</p>
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
            const datum = t.datum ? new Date(t.datum).toLocaleDateString('de-DE') : '-';
            const icon = t.typ === 'verwendung' ? '📉' : '📈';
            const colorClass = t.typ === 'verwendung' ? 'text-red-600' : 'text-green-600';
            const betragText = t.typ === 'verwendung' ? `- ${t.betrag.toFixed(2)} €` : `+ ${t.betrag.toFixed(2)} €`;
            
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
                    </div>
                </div>
            `;
        }).join('');
    }

    // WertguthabenId für Transaktion-Button speichern
    document.getElementById('addTransaktionBtn').dataset.wertguthabenId = id;

    // Event-Listener für Buttons
    document.getElementById('editWertguthabenDetailsBtn').onclick = () => {
        document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        openEditWertguthaben(id);
    };

    document.getElementById('deleteWertguthabenBtn').onclick = () => {
        if (confirm('Wertguthaben wirklich löschen?')) {
            deleteWertguthaben(id);
            document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        }
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

    // In localStorage speichern
    try {
        localStorage.setItem('wertguthabenSettings', JSON.stringify(wertguthabenSettings));
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
        const saved = localStorage.getItem('wertguthabenSettings');
        if (saved) {
            const parsed = JSON.parse(saved);
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

// Einstellungen beim Initialisieren laden
loadSettings();

