// // @ts-check
// ========================================
// HAUSHALTSZAHLUNGEN SYSTEM
// Digitalisierung der Excel-Haushaltsberechnung
// Mit Themen-System und Multi-Personen-Unterstützung
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
import { createPendingNotification, renderPendingNotifications, loadPushmailNotificationSettings } from './pushmail-notifications.js';

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
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================
let haushaltszahlungenCollection = null;
let haushaltszahlungenSettingsRef = null;
let haushaltszahlungenThemenRef = null;
let haushaltszahlungenProtokollRef = null;
let haushaltszahlungenEinladungenRef = null;
let HAUSHALTSZAHLUNGEN = {};
let THEMEN = {};
let EINLADUNGEN = {}; // Einladungen für den aktuellen Benutzer
let currentThemaId = null; // Aktuell ausgewähltes Thema
let currentFilter = { status: 'aktiv', typ: '', person: '', intervalle: [] }; // Standard: Nur aktive Einträge anzeigen
let activeHaushaltszahlungFilters = [];
let haushaltszahlungSearchJoinMode = 'and';
let simulationsDatum = null; // Für Datums-Simulation (wie W7 in Excel)

const HZ_FILTER_LABELS = {
    all: 'Alles',
    zweck: 'Zweck',
    organisation: 'Organisation',
    status: 'Status',
    typ: 'Typ',
    intervall: 'Intervall',
    betrag: 'Betrag',
    kundennummer: 'Kundennummer',
    vertragsnummer: 'Vertragsnummer'
};

const HZ_SUGGESTION_ICONS = {
    all: '🔍',
    zweck: '📝',
    organisation: '🏢',
    status: '📊',
    typ: '🔁',
    intervall: '🗓️',
    betrag: '💶',
    kundennummer: '#️⃣',
    vertragsnummer: '🧾'
};

let unsubscribeHaushaltszahlungen = null;
let unsubscribeEinladungen = null;

// Standard-Einstellungen
let haushaltszahlungenSettings = {
    personen: [],
    defaultAnteilMarkus: 50
};

// Zugriffsrechte
const ZUGRIFFSRECHTE = {
    nicht_teilen: { label: 'Nicht teilen (nur kalkulieren)', icon: '🔒', canEdit: false, canEditOwn: false, isShared: false },
    lesen: { label: 'Nur Lesen', icon: '👁️', canEdit: false, canEditOwn: false, isShared: true },
    eigene: { label: 'Eigene Zahlung ändern', icon: '✏️', canEdit: false, canEditOwn: true, isShared: true },
    vollzugriff: { label: 'Vollzugriff', icon: '🔓', canEdit: true, canEditOwn: true, isShared: true }
};

// Intervall-Konfiguration (Spalten G-S in Excel)
const INTERVALL_CONFIG = {
    monatlich: { label: 'Monatlich', short: 'M', multiplier: 12 },
    januar: { label: 'Januar', short: 'Jan', multiplier: 1 },
    februar: { label: 'Februar', short: 'Feb', multiplier: 1 },
    maerz: { label: 'März', short: 'Mär', multiplier: 1 },
    april: { label: 'April', short: 'Apr', multiplier: 1 },
    mai: { label: 'Mai', short: 'Mai', multiplier: 1 },
    juni: { label: 'Juni', short: 'Jun', multiplier: 1 },
    juli: { label: 'Juli', short: 'Jul', multiplier: 1 },
    august: { label: 'August', short: 'Aug', multiplier: 1 },
    september: { label: 'September', short: 'Sep', multiplier: 1 },
    oktober: { label: 'Oktober', short: 'Okt', multiplier: 1 },
    november: { label: 'November', short: 'Nov', multiplier: 1 },
    dezember: { label: 'Dezember', short: 'Dez', multiplier: 1 }
};

// Status-Konfiguration
const STATUS_CONFIG = {
    aktiv: { label: 'AKTIV', color: 'bg-green-100 text-green-800', icon: '✓' },
    'n-aktiv-geplant': { label: 'N-AKTIV:Geplant', color: 'bg-blue-100 text-blue-800', icon: '📅' },
    'n-aktiv-vergangen': { label: 'N-AKTIV:Vergangen', color: 'bg-gray-100 text-gray-600', icon: '⏰' },
    fehler: { label: 'FEHLER', color: 'bg-red-100 text-red-800', icon: '⚠️' }
};

// Typ-Konfiguration
const TYP_CONFIG = {
    belastung: { label: 'Belastung', color: 'bg-red-100 text-red-700', icon: '📤' },
    gutschrift: { label: 'Gutschrift', color: 'bg-green-100 text-green-700', icon: '📥' }
};

// ========================================
// INITIALISIERUNG
// ========================================
export async function initializeHaushaltszahlungen() {
    console.log("🏠 Haushaltszahlungen-System wird initialisiert...");

    if (db) {
        haushaltszahlungenSettingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'haushaltszahlungen');
        haushaltszahlungenThemenRef = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen_themen');
        haushaltszahlungenProtokollRef = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen_protokoll');
        haushaltszahlungenEinladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen_einladungen');
        
        console.log("📂 Firebase Referenzen erstellt:");
        console.log("  - Themen:", haushaltszahlungenThemenRef.path);
        console.log("  - Protokoll:", haushaltszahlungenProtokollRef.path);
        console.log("  - Einladungen:", haushaltszahlungenEinladungenRef.path);
        
        loadSettings();
        await loadThemen(); // Warte auf Themen bevor Dashboard gerendert wird
        loadEinladungen();
    }

    setupEventListeners();
    renderDashboard();
}

// Themen laden
async function loadThemen() {
    try {
        console.log("🔄 Lade Themen...");
        const snapshot = await getDocs(haushaltszahlungenThemenRef);
        THEMEN = {};
        snapshot.forEach((docSnap) => {
            const thema = { id: docSnap.id, ...docSnap.data() };
            THEMEN[docSnap.id] = thema;
            console.log(`  📁 Thema gefunden: "${thema.name}" (ID: ${docSnap.id})`);
        });
        
        console.log(`✅ ${Object.keys(THEMEN).length} Themen geladen`);
        
        // Wenn kein Thema existiert, erstelle ein Standard-Thema
        if (Object.keys(THEMEN).length === 0) {
            console.log("⚠️ Keine Themen gefunden - erstelle Standard-Thema");
            await createDefaultThema();
        }
        
        // Erstes Thema auswählen oder gespeichertes
        const savedThemaId = getUserSetting('hz_current_thema');
        console.log("💾 Gespeichertes Thema aus Firebase:", savedThemaId);
        
        if (savedThemaId && THEMEN[savedThemaId]) {
            currentThemaId = savedThemaId;
            console.log(`✅ Verwende gespeichertes Thema: ${THEMEN[savedThemaId].name}`);
        } else {
            currentThemaId = Object.keys(THEMEN)[0];
            console.log(`✅ Verwende erstes Thema: ${THEMEN[currentThemaId]?.name}`);
        }
        
        renderThemenDropdown();
        updateCollectionForThema();
    } catch (e) {
        console.error("❌ Fehler beim Laden der Themen:", e);
    }
}

export function stopHaushaltszahlungenListeners() {
    if (unsubscribeHaushaltszahlungen) {
        unsubscribeHaushaltszahlungen();
        unsubscribeHaushaltszahlungen = null;
    }
    if (unsubscribeEinladungen) {
        unsubscribeEinladungen();
        unsubscribeEinladungen = null;
    }
    HAUSHALTSZAHLUNGEN = {};
    EINLADUNGEN = {};
}

async function createDefaultThema() {
    try {
        const defaultThema = {
            name: 'Haushalt',
            ersteller: currentUser.displayName,
            erstelltAm: serverTimestamp(),
            mitglieder: [{
                userId: currentUser.mode || currentUser.displayName,
                name: currentUser.displayName,
                zugriffsrecht: 'vollzugriff',
                anteil: 50,
                dauerauftraege: {
                    monatlich: 0,
                    januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
                    juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
                }
            }]
        };
        const docRef = await addDoc(haushaltszahlungenThemenRef, defaultThema);
        THEMEN[docRef.id] = { id: docRef.id, ...defaultThema };
        currentThemaId = docRef.id;
        console.log("✅ Standard-Thema erstellt:", docRef.id);
    } catch (e) {
        console.error("Fehler beim Erstellen des Standard-Themas:", e);
    }
}

function updateCollectionForThema() {
    if (currentThemaId && db) {
        // Einträge liegen als Sub-Collection unter dem Thema-Dokument:
        // /artifacts/{appId}/public/data/haushaltszahlungen_themen/{themaId}/eintraege
        haushaltszahlungenCollection = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen_themen', currentThemaId, 'eintraege');
        console.log("📂 Einträge-Collection aktualisiert:", haushaltszahlungenCollection.path);
        listenForHaushaltszahlungen();
    } else {
        console.warn("⚠️ updateCollectionForThema: currentThemaId oder db fehlt", { currentThemaId, db: !!db });
    }
}

// Einladungen laden (mit Echtzeit-Listener für automatische Aktualisierung)
function loadEinladungen() {
    if (!haushaltszahlungenEinladungenRef || !currentUser?.displayName) return;
    
    try {
        // Echtzeit-Listener statt getDocs für automatische Updates
        const userId = currentUser.mode || currentUser.displayName;

        if (unsubscribeEinladungen) {
            unsubscribeEinladungen();
            unsubscribeEinladungen = null;
        }

        unsubscribeEinladungen = onSnapshot(haushaltszahlungenEinladungenRef, (snapshot) => {
            EINLADUNGEN = {};
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                // Nur Einladungen für den aktuellen Benutzer laden
                if (data.targetUserId === userId || data.targetUserName === currentUser.displayName) {
                    EINLADUNGEN[docSnap.id] = { id: docSnap.id, ...data };
                }
            });
            renderEinladungenBadge();
        }, (error) => {
            console.error("Fehler beim Laden der Einladungen:", error);
        });
    } catch (e) {
        console.error("Fehler beim Initialisieren des Einladungs-Listeners:", e);
    }
}

// Badge für offene Einladungen anzeigen
function renderEinladungenBadge() {
    const pendingCount = Object.values(EINLADUNGEN).filter(e => e.status === 'pending').length;
    const badge = document.getElementById('hz-einladungen-badge');
    if (badge) {
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function renderThemenDropdown() {
    const dropdown = document.getElementById('hz-thema-dropdown');
    if (!dropdown) return;
    
    // Nur aktive (nicht archivierte) Themen anzeigen
    dropdown.innerHTML = Object.values(THEMEN)
        .filter(thema => !thema.archiviert)
        .map(thema => 
            `<option value="${thema.id}" ${thema.id === currentThemaId ? 'selected' : ''}>${thema.name}</option>`
        ).join('');
}

async function loadSettings() {
    try {
        const settingsDoc = await getDoc(haushaltszahlungenSettingsRef);
        if (settingsDoc.exists()) {
            haushaltszahlungenSettings = { ...haushaltszahlungenSettings, ...settingsDoc.data() };
        }
    } catch (e) {
        console.error("Fehler beim Laden der Einstellungen:", e);
    }
}

function setupEventListeners() {
    // Thema-Dropdown
    const themaDropdown = document.getElementById('hz-thema-dropdown');
    if (themaDropdown && !themaDropdown.dataset.listenerAttached) {
        themaDropdown.addEventListener('change', (e) => {
            currentThemaId = e.target.value;
            saveUserSetting('hz_current_thema', currentThemaId);
            updateCollectionForThema();
            renderDashboard();
        });
        themaDropdown.dataset.listenerAttached = 'true';
    }

    // Neuer Eintrag Button
    const createBtn = document.getElementById('btn-create-haushaltszahlung');
    if (createBtn && !createBtn.dataset.listenerAttached) {
        createBtn.addEventListener('click', openCreateModal);
        createBtn.dataset.listenerAttached = 'true';
    }

    // Einstellungen Button
    const settingsBtn = document.getElementById('btn-haushaltszahlungen-settings');
    if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
        settingsBtn.addEventListener('click', openSettingsModal);
        settingsBtn.dataset.listenerAttached = 'true';
    }
    
    // Alle Monate auswählen/abwählen Button
    const alleMonateBtn = document.getElementById('hz-alle-monate-btn');
    if (alleMonateBtn && !alleMonateBtn.dataset.listenerAttached) {
        alleMonateBtn.addEventListener('click', toggleAlleMonate);
        alleMonateBtn.dataset.listenerAttached = 'true';
    }

    // Modal schließen
    const closeModal = document.getElementById('closeHaushaltszahlungModal');
    if (closeModal && !closeModal.dataset.listenerAttached) {
        closeModal.addEventListener('click', closeHaushaltszahlungModal);
        closeModal.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelHaushaltszahlungBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeHaushaltszahlungModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveHaushaltszahlungBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveHaushaltszahlung);
        saveBtn.dataset.listenerAttached = 'true';
    }

    // Filterbereich Toggle
    const filterToggleBtn = document.getElementById('hz-toggle-filter-controls');
    if (filterToggleBtn && !filterToggleBtn.dataset.listenerAttached) {
        filterToggleBtn.addEventListener('click', () => {
            const wrapper = document.getElementById('hz-filter-controls-wrapper');
            const icon = document.getElementById('hz-toggle-filter-icon');
            if (!wrapper || !icon) return;
            wrapper.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
        filterToggleBtn.dataset.listenerAttached = 'true';
    }

    // Suche & Tag-Filter (harmonisiert)
    const searchInput = document.getElementById('search-haushaltszahlungen');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            const term = String(e.target.value || '');
            if (!term.trim()) {
                hideHaushaltszahlungenSearchSuggestions();
                return;
            }
            updateHaushaltszahlungenSearchSuggestions(term);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addHaushaltszahlungFilterFromUi();
            }
        });
        searchInput.addEventListener('focus', (e) => {
            const term = String(e.target.value || '').trim();
            if (term) updateHaushaltszahlungenSearchSuggestions(term);
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    if (!document.body.dataset.hzSuggestionsListenerAttached) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#search-haushaltszahlungen') && !e.target.closest('#hz-search-suggestions-box')) {
                hideHaushaltszahlungenSearchSuggestions();
            }
        });
        document.body.dataset.hzSuggestionsListenerAttached = 'true';
    }

    const addFilterBtn = document.getElementById('hz-add-filter-btn');
    if (addFilterBtn && !addFilterBtn.dataset.listenerAttached) {
        addFilterBtn.addEventListener('click', addHaushaltszahlungFilterFromUi);
        addFilterBtn.dataset.listenerAttached = 'true';
    }

    const joinModeSelect = document.getElementById('hz-search-join-mode');
    if (joinModeSelect && !joinModeSelect.dataset.listenerAttached) {
        joinModeSelect.addEventListener('change', (e) => {
            haushaltszahlungSearchJoinMode = e.target.value === 'or' ? 'or' : 'and';
            renderHaushaltszahlungenTable();
        });
        joinModeSelect.dataset.listenerAttached = 'true';
    }

    const filterStatus = document.getElementById('filter-hz-status');
    if (filterStatus && !filterStatus.dataset.listenerAttached) {
        filterStatus.addEventListener('change', (e) => {
            currentFilter.status = e.target.value;
            renderHaushaltszahlungenTable();
        });
        filterStatus.dataset.listenerAttached = 'true';
    }

    const filterTyp = document.getElementById('filter-hz-typ');
    if (filterTyp && !filterTyp.dataset.listenerAttached) {
        filterTyp.addEventListener('change', (e) => {
            currentFilter.typ = e.target.value;
            renderHaushaltszahlungenTable();
        });
        filterTyp.dataset.listenerAttached = 'true';
    }

    // Intervall-Filter Dropdown (Mehrfachauswahl)
    const intervallFilterBtn = document.getElementById('hz-intervall-filter-btn');
    const intervallDropdown = document.getElementById('hz-intervall-dropdown');
    if (intervallFilterBtn && !intervallFilterBtn.dataset.listenerAttached) {
        intervallFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            intervallDropdown.classList.toggle('hidden');
        });
        intervallFilterBtn.dataset.listenerAttached = 'true';
    }
    
    // Intervall-Filter Checkboxen
    document.querySelectorAll('.hz-intervall-filter-cb').forEach(cb => {
        if (!cb.dataset.listenerAttached) {
            cb.addEventListener('change', () => {
                updateIntervallFilter();
                renderHaushaltszahlungenTable();
            });
            cb.dataset.listenerAttached = 'true';
        }
    });
    
    // Dropdown schließen bei Klick außerhalb (mit Flag um doppelte Listener zu verhindern)
    if (!document.body.dataset.hzDropdownListenerAttached) {
        document.addEventListener('click', (e) => {
            const intervallDropdown = document.getElementById('hz-intervall-dropdown');
            const intervallFilterBtn = document.getElementById('hz-intervall-filter-btn');
            if (intervallDropdown && !intervallDropdown.contains(e.target) && e.target !== intervallFilterBtn) {
                intervallDropdown.classList.add('hidden');
            }
        });
        document.body.dataset.hzDropdownListenerAttached = 'true';
    }

    const resetFilters = document.getElementById('reset-filters-haushaltszahlungen');
    if (resetFilters && !resetFilters.dataset.listenerAttached) {
        resetFilters.addEventListener('click', resetHaushaltszahlungenFiltersToDefault);
        resetFilters.dataset.listenerAttached = 'true';
    }

    // Simulations-Datum
    const simDatumInput = document.getElementById('hz-simulation-datum');
    if (simDatumInput && !simDatumInput.dataset.listenerAttached) {
        simDatumInput.addEventListener('change', (e) => {
            simulationsDatum = e.target.value ? new Date(e.target.value) : null;
            renderDashboard();
            renderHaushaltszahlungenTable();
            updateSimulationWarning();
        });
        simDatumInput.dataset.listenerAttached = 'true';
    }

    const clearSimBtn = document.getElementById('btn-clear-simulation');
    if (clearSimBtn && !clearSimBtn.dataset.listenerAttached) {
        clearSimBtn.addEventListener('click', () => {
            simulationsDatum = null;
            document.getElementById('hz-simulation-datum').value = '';
            renderDashboard();
            renderHaushaltszahlungenTable();
            updateSimulationWarning();
        });
        clearSimBtn.dataset.listenerAttached = 'true';
    }

    // Anteil-Slider im Modal
    const anteilSlider = document.getElementById('hz-anteil-markus');
    if (anteilSlider && !anteilSlider.dataset.listenerAttached) {
        anteilSlider.addEventListener('input', updateAnteilDisplay);
        anteilSlider.dataset.listenerAttached = 'true';
    }

    // Intervall-Checkboxen: Monatlich vs. Einzelmonate gegenseitig ausschließen
    setupIntervallCheckboxLogic();

    // Settings Modal
    const closeSettingsModal = document.getElementById('closeHaushaltszahlungenSettingsModal');
    if (closeSettingsModal && !closeSettingsModal.dataset.listenerAttached) {
        closeSettingsModal.addEventListener('click', () => {
            document.getElementById('haushaltszahlungenSettingsModal').style.display = 'none';
        });
        closeSettingsModal.dataset.listenerAttached = 'true';
    }

    const saveSettingsBtn = document.getElementById('saveHaushaltszahlungenSettingsBtn');
    if (saveSettingsBtn && !saveSettingsBtn.dataset.listenerAttached) {
        saveSettingsBtn.addEventListener('click', saveSettings);
        saveSettingsBtn.dataset.listenerAttached = 'true';
    }
}

function addHaushaltszahlungFilterFromUi(options = {}) {
    const searchInput = document.getElementById('search-haushaltszahlungen');
    const negateCheckbox = document.getElementById('hz-filter-negate');

    const rawValue = String((options.rawValue ?? searchInput?.value) || '').trim();
    if (!rawValue) {
        alertUser('Bitte einen Suchbegriff eingeben.', 'warning');
        return;
    }

    const category = String(options.category || 'all');
    const negate = !!negateCheckbox?.checked;
    const value = rawValue.toLowerCase();

    const duplicate = activeHaushaltszahlungFilters.some((filter) => (
        filter.category === category &&
        filter.value === value &&
        !!filter.negate === negate
    ));

    if (duplicate) {
        if (searchInput) searchInput.value = '';
        if (negateCheckbox) negateCheckbox.checked = false;
        hideHaushaltszahlungenSearchSuggestions();
        return;
    }

    activeHaushaltszahlungFilters.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        category,
        value,
        rawValue,
        negate,
        label: HZ_FILTER_LABELS[category] || category
    });

    if (searchInput) searchInput.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;
    hideHaushaltszahlungenSearchSuggestions();

    renderHaushaltszahlungSearchTags();
    renderHaushaltszahlungenTable();
}

function hideHaushaltszahlungenSearchSuggestions() {
    document.getElementById('hz-search-suggestions-box')?.classList.add('hidden');
}

function updateHaushaltszahlungenSearchSuggestions(term) {
    const box = document.getElementById('hz-search-suggestions-box');
    const list = document.getElementById('hz-search-suggestions-list');
    if (!box || !list) return;

    if (!term || !term.trim()) {
        list.innerHTML = '';
        box.classList.add('hidden');
        return;
    }

    const lowerTerm = term.toLowerCase().trim();
    const entries = Object.values(HAUSHALTSZAHLUNGEN).filter((eintrag) => !eintrag?.inTrash);
    list.innerHTML = '';

    const categories = ['zweck', 'organisation', 'status', 'typ', 'intervall', 'betrag', 'kundennummer', 'vertragsnummer'];
    let hasHits = false;

    categories.forEach((category) => {
        const hasCategoryHit = entries.some((eintrag) =>
            doesHaushaltszahlungMatchSearchFilter(eintrag, { category, value: lowerTerm })
        );
        if (!hasCategoryHit) return;

        hasHits = true;
        const li = document.createElement('li');
        li.className = 'px-3 py-2 hover:bg-cyan-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
        li.innerHTML = `
            <span class="text-lg">${HZ_SUGGESTION_ICONS[category] || '🔎'}</span>
            <div class="flex-grow leading-tight">
                <span class="font-bold text-gray-800 block">${HZ_FILTER_LABELS[category] || category}: ${term}</span>
                <span class="text-xs text-gray-500">Filter in ${HZ_FILTER_LABELS[category] || category}</span>
            </div>
        `;
        li.onclick = () => addHaushaltszahlungFilterFromUi({ category, rawValue: term });
        list.appendChild(li);
    });

    const fallback = document.createElement('li');
    fallback.className = 'px-3 py-2 hover:bg-cyan-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
    fallback.innerHTML = `
        <span class="text-lg">${HZ_SUGGESTION_ICONS.all}</span>
        <div class="flex-grow leading-tight">
            <span class="font-bold text-gray-800 block">Alles: ${term}</span>
            <span class="text-xs text-gray-500">Volltextsuche</span>
        </div>
    `;
    fallback.onclick = () => addHaushaltszahlungFilterFromUi({ category: 'all', rawValue: term });
    list.appendChild(fallback);

    box.classList.toggle('hidden', !hasHits && !term.trim());
    if (!box.classList.contains('hidden')) return;
    box.classList.remove('hidden');
}

function removeHaushaltszahlungFilterById(filterId) {
    activeHaushaltszahlungFilters = activeHaushaltszahlungFilters.filter((filter) => filter.id !== filterId);
    renderHaushaltszahlungSearchTags();
    renderHaushaltszahlungenTable();
}

function renderHaushaltszahlungSearchTags() {
    const container = document.getElementById('hz-active-search-tags');
    if (!container) return;

    if (activeHaushaltszahlungFilters.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = activeHaushaltszahlungFilters.map((filter) => `
        <div class="flex items-center ${filter.negate ? 'bg-red-100 text-red-800 border-red-200' : 'bg-indigo-100 text-indigo-800 border-indigo-200'} text-xs font-bold px-2 py-1 rounded-full border">
            ${filter.negate ? '<span class="mr-1 text-red-600">NICHT</span>' : ''}
            <span>${filter.label}: ${filter.rawValue}</span>
            <button onclick="window.removeHaushaltszahlungFilterById(${filter.id})" class="ml-1 ${filter.negate ? 'text-red-500 hover:text-red-900' : 'text-indigo-500 hover:text-indigo-900'} focus:outline-none" title="Filter entfernen">&times;</button>
        </div>
    `).join('');
}

function resetHaushaltszahlungenFiltersToDefault() {
    activeHaushaltszahlungFilters = [];
    haushaltszahlungSearchJoinMode = 'and';
    currentFilter = { status: 'aktiv', typ: '', person: '', intervalle: [] };

    const searchInput = document.getElementById('search-haushaltszahlungen');
    const negate = document.getElementById('hz-filter-negate');
    const joinMode = document.getElementById('hz-search-join-mode');
    const filterStatus = document.getElementById('filter-hz-status');
    const filterTyp = document.getElementById('filter-hz-typ');

    if (searchInput) searchInput.value = '';
    if (negate) negate.checked = false;
    if (joinMode) joinMode.value = 'and';
    if (filterStatus) filterStatus.value = 'aktiv';
    if (filterTyp) filterTyp.value = '';
    hideHaushaltszahlungenSearchSuggestions();

    // Intervall-Checkboxen zurücksetzen
    document.querySelectorAll('.hz-intervall-filter-cb').forEach((cb) => {
        cb.checked = false;
    });
    updateIntervallFilter();
    updateIntervallFilterLabel();

    renderHaushaltszahlungSearchTags();
    renderHaushaltszahlungenTable();
}

function doesHaushaltszahlungMatchSearchFilter(eintrag, filter) {
    const value = filter.value;
    const normalizedValue = String(value || '').replace(',', '.');
    const zweck = String(eintrag.zweck || '').toLowerCase();
    const organisation = String(eintrag.organisation || '').toLowerCase();
    const statusKey = String(berechneStatus(eintrag).status || '').toLowerCase();
    const statusLabel = String(STATUS_CONFIG[statusKey]?.label || '').toLowerCase();
    const typKey = String(berechneTyp(eintrag) || '').toLowerCase();
    const typLabel = String(TYP_CONFIG[typKey]?.label || '').toLowerCase();
    const kundennummer = String(eintrag.kundennummer || '').toLowerCase();
    const vertragsnummer = String(eintrag.vertragsnummer || '').toLowerCase();
    const intervalle = Array.isArray(eintrag.intervall) ? eintrag.intervall : [];
    const intervalValues = intervalle.flatMap((intervall) => {
        const key = String(intervall || '').toLowerCase();
        const label = String(INTERVALL_CONFIG[intervall]?.label || '').toLowerCase();
        const short = String(INTERVALL_CONFIG[intervall]?.short || '').toLowerCase();
        return [key, label, short];
    });
    const betrag = Number(eintrag.betrag || 0);
    const amountValues = [betrag.toFixed(2), `${betrag.toFixed(2)} €`, String(eintrag.betrag || '')]
        .map((entry) => entry.toLowerCase().replace(',', '.'));

    switch (filter.category) {
        case 'zweck':
            return zweck.includes(value);
        case 'organisation':
            return organisation.includes(value);
        case 'status':
            return statusKey.includes(value) || statusLabel.includes(value);
        case 'typ':
            return typKey.includes(value) || typLabel.includes(value);
        case 'intervall':
            return intervalValues.some((entry) => entry.includes(value));
        case 'betrag':
            return amountValues.some((entry) => entry.includes(normalizedValue));
        case 'kundennummer':
            return kundennummer.includes(value);
        case 'vertragsnummer':
            return vertragsnummer.includes(value);
        case 'all':
        default:
            return zweck.includes(value) ||
                organisation.includes(value) ||
                statusKey.includes(value) ||
                statusLabel.includes(value) ||
                typKey.includes(value) ||
                typLabel.includes(value) ||
                intervalValues.some((entry) => entry.includes(value)) ||
                amountValues.some((entry) => entry.includes(normalizedValue)) ||
                kundennummer.includes(value) ||
                vertragsnummer.includes(value);
    }
}

function updateSimulationWarning() {
    const warningEl = document.getElementById('hz-simulation-warning');
    if (warningEl) {
        if (simulationsDatum) {
            warningEl.classList.remove('hidden');
            warningEl.textContent = `⚠️ DATUMS-SIMULATION IST AKTIV! (${formatDate(simulationsDatum)})`;
        } else {
            warningEl.classList.add('hidden');
        }
    }
}

// Intervall-Checkbox-Logik: Monatlich vs. Einzelmonate gegenseitig ausschließen
function setupIntervallCheckboxLogic() {
    const monatlichCheckbox = document.querySelector('.hz-intervall-checkbox[value="monatlich"]');
    const einzelmonateCheckboxes = document.querySelectorAll('.hz-intervall-checkbox:not([value="monatlich"])');
    
    if (!monatlichCheckbox) return;
    
    // Wenn "Monatlich" bereits einen Listener hat, nicht erneut hinzufügen
    if (monatlichCheckbox.dataset.logicAttached) return;
    
    // Listener für "Monatlich"
    monatlichCheckbox.addEventListener('change', function() {
        if (this.checked) {
            // Deaktiviere alle Einzelmonate
            einzelmonateCheckboxes.forEach(cb => {
                cb.checked = false;
                cb.disabled = true;
                cb.parentElement.style.opacity = '0.5';
            });
        } else {
            // Aktiviere alle Einzelmonate wieder
            einzelmonateCheckboxes.forEach(cb => {
                cb.disabled = false;
                cb.parentElement.style.opacity = '1';
            });
        }
    });
    monatlichCheckbox.dataset.logicAttached = 'true';
    
    // Listener für Einzelmonate
    einzelmonateCheckboxes.forEach(cb => {
        if (cb.dataset.logicAttached) return;
        
        cb.addEventListener('change', function() {
            const checkedCount = Array.from(einzelmonateCheckboxes).filter(c => c.checked).length;
            
            // NEUE REGEL: Verhindere alle 12 Monate (wäre = Monatlich)
            if (checkedCount === 12) {
                this.checked = false;
                alertUser('⚠️ Für alle 12 Monate nutze bitte "Monatlich" statt einzelner Monate!', 'warning');
                return;
            }
            
            // Prüfe ob irgendein Einzelmonat ausgewählt ist
            const anyMonthSelected = Array.from(einzelmonateCheckboxes).some(c => c.checked);
            
            if (anyMonthSelected) {
                // Deaktiviere "Monatlich"
                monatlichCheckbox.checked = false;
                monatlichCheckbox.disabled = true;
            } else {
                // Aktiviere "Monatlich" wieder
                monatlichCheckbox.disabled = false;
            }
        });
        cb.dataset.logicAttached = 'true';
    });
}

// ========================================
// FIREBASE LISTENER
// ========================================
export function listenForHaushaltszahlungen() {
    // WICHTIG: Collection wird NUR durch updateCollectionForThema() gesetzt!
    // Kein Fallback zur alten Collection mehr - das war der Bug!
    
    if (!haushaltszahlungenCollection) {
        console.warn("⚠️ Haushaltszahlungen: Collection nicht verfuegbar - warte auf Thema-Auswahl");
        console.warn("   currentThemaId:", currentThemaId);
        console.warn("   db:", !!db);
        return;
    }

    console.log("✅ Listening auf Collection:", haushaltszahlungenCollection.path);
    console.log("   Vollständiger Pfad:", haushaltszahlungenCollection.path);
    console.log("   Aktuelles Thema ID:", currentThemaId);
    
    // Ohne orderBy, da das Feld moeglicherweise nicht existiert
    const q = query(haushaltszahlungenCollection);

    if (unsubscribeHaushaltszahlungen) {
        unsubscribeHaushaltszahlungen();
        unsubscribeHaushaltszahlungen = null;
    }

    unsubscribeHaushaltszahlungen = onSnapshot(q, (snapshot) => {
        HAUSHALTSZAHLUNGEN = {};
        console.log(`📦 Snapshot erhalten: ${snapshot.size} Dokumente gefunden`);
        
        snapshot.forEach((doc) => {
            const data = doc.data();
            console.log(`  - Dokument ${doc.id}:`, data);
            HAUSHALTSZAHLUNGEN[doc.id] = { id: doc.id, ...data };
        });
        
        console.log(`✅ Eintraege geladen: ${Object.keys(HAUSHALTSZAHLUNGEN).length} Stueck`);
        console.log(`   HAUSHALTSZAHLUNGEN Objekt:`, HAUSHALTSZAHLUNGEN);
        
        renderDashboard();
        renderHaushaltszahlungenTable();
        checkHaushaltszahlungenForNotifications();
    }, (error) => {
        console.error("❌ FEHLER beim Laden der Haushaltszahlungen:", error);
        console.error("   Error Code:", error.code);
        console.error("   Error Message:", error.message);
    });

    return unsubscribeHaushaltszahlungen;
}

// ========================================
// VALIDIERUNG (Y22 Formel aus Excel)
// ========================================
function validateEintrag(eintrag) {
    // Entspricht der Y22 Formel aus Excel
    if (!eintrag.zweck || eintrag.zweck.trim() === '') {
        return 'Zahlungszweck prüfen';
    }
    if (!eintrag.organisation || eintrag.organisation.trim() === '') {
        return 'Organisation prüfen';
    }
    if (!eintrag.intervall || eintrag.intervall.length === 0) {
        return 'Zahlungsintervall prüfen';
    }
    if (!eintrag.gueltigAb) {
        return 'Gültigkeitswert AB prüfen';
    }
    // GEÄNDERT: gueltigBis ist jetzt OPTIONAL (für "fortlaufende" Verträge)
    // Wenn leer, wird automatisch auf fernes Datum gesetzt (z.B. 31.12.2099)
    
    // Nur prüfen wenn BIS-Datum vorhanden ist
    if (eintrag.gueltigBis && new Date(eintrag.gueltigAb) > new Date(eintrag.gueltigBis)) {
        return 'Gültigkeitswert BIS prüfen (muss nach AB sein)';
    }
    
    // GEÄNDERT: Betrag ist jetzt OPTIONAL
    // null/undefined/'' = Betrag später nachtragen (wird als Warnung angezeigt)
    // 0 = Gratis-Monat (gültig)
    // X = Normaler Betrag (gültig)
    // --> Keine Validierungsfehler mehr für fehlenden Betrag!
    
    // Kostenaufteilung wird im saveHaushaltszahlung validiert (muss 100% sein)
    
    return '-'; // Alles OK
}

// ========================================
// STATUS-BERECHNUNG (C22 Formel aus Excel)
// ========================================
function berechneStatus(eintrag) {
    const validation = validateEintrag(eintrag);
    if (validation !== '-') {
        return { status: 'fehler', fehlerText: validation };
    }

    const referenzDatum = simulationsDatum || new Date();
    const gueltigAb = new Date(eintrag.gueltigAb);
    const gueltigBis = new Date(eintrag.gueltigBis);

    // Setze Zeit auf Mitternacht für korrekten Vergleich
    referenzDatum.setHours(0, 0, 0, 0);
    gueltigAb.setHours(0, 0, 0, 0);
    gueltigBis.setHours(0, 0, 0, 0);

    if (gueltigAb > referenzDatum) {
        return { status: 'n-aktiv-geplant', fehlerText: null };
    }
    if (gueltigBis < referenzDatum) {
        return { status: 'n-aktiv-vergangen', fehlerText: null };
    }
    return { status: 'aktiv', fehlerText: null };
}

// ========================================
// BENACHRICHTIGUNGEN PRÜFEN
// ========================================
async function checkHaushaltszahlungenForNotifications() {
    try {
        if (!currentUser || !currentUser.mode) {
            console.log('🔔 Haushaltszahlungen: Kein Benutzer angemeldet');
            return;
        }

        // Nutzer-Einstellungen laden (Pushmail Center) für DaysBefore
        const settings = await loadPushmailNotificationSettings(currentUser.mode);
        const progSettings = settings.programs?.HAUSHALTSZAHLUNGEN || { enabled: true, notifications: {} };
        const defGueltigAb = progSettings.notifications?.x_tage_vor_gueltig_ab?.daysBeforeX ?? 7;
        const defGueltigBis = progSettings.notifications?.x_tage_vor_gueltig_bis?.daysBeforeX ?? 7;
        const defErinnerung = progSettings.notifications?.x_tage_vor_erinnerung?.daysBeforeX ?? 7;

        console.log('🔔 Haushaltszahlungen: Prüfe Benachrichtigungen für', Object.keys(HAUSHALTSZAHLUNGEN).length, 'Einträge');

        const heute = new Date();
        heute.setHours(0, 0, 0, 0);

        const eintraege = Object.values(HAUSHALTSZAHLUNGEN);
        
        for (const eintrag of eintraege) {
        const { status, fehlerText } = berechneStatus(eintrag);
        
        // Benachrichtigung bei Fehler-Status ODER ALARM-Status
        if (status === 'fehler' || status === 'alarm') {
            console.log('🔔 Haushaltszahlungen: Problem/Alarm erkannt bei', eintrag.zweck, ':', fehlerText);
            await createPendingNotification(
                currentUser.mode,
                'HAUSHALTSZAHLUNGEN',
                'status_nicht_okay',
                {
                    id: eintrag.id,
                    problem: fehlerText || 'Unbekannter Fehler',
                    details: `${eintrag.zweck || 'Unbekannt'} - ${eintrag.organisation || 'Unbekannt'}`,
                    zahlungName: eintrag.zweck || 'Unbekannte Zahlung'
                }
            );
        }

        // Nur für aktive Einträge mit Startdatum
        const hatGueltigAb = Boolean(eintrag.gueltigAb);
        const hatGueltigBis = Boolean(eintrag.gueltigBis);

        // Keine Datum-Reminder, wenn kein Datum vorhanden oder bereits vergangen
        if (hatGueltigAb) {
            const gueltigAb = new Date(eintrag.gueltigAb);
            if (gueltigAb >= heute) {
                const daysLeftAb = calculateDaysLeft(gueltigAb);
                if (daysLeftAb <= defGueltigAb) {
                    await createPendingNotification(
                        currentUser.mode,
                        'HAUSHALTSZAHLUNGEN',
                        'x_tage_vor_gueltig_ab',
                        {
                            id: eintrag.id,
                            targetDate: gueltigAb,
                            zahlungName: eintrag.zweck || 'Unbekannte Zahlung',
                            gueltigAb: gueltigAb.toLocaleDateString('de-DE'),
                            daysLeft: daysLeftAb
                        }
                    );
                }
            }
        }

        if (hatGueltigBis) {
            const gueltigBis = new Date(eintrag.gueltigBis);
            if (gueltigBis >= heute) {
                const daysLeftBis = calculateDaysLeft(gueltigBis);
                if (daysLeftBis <= defGueltigBis) {
                    await createPendingNotification(
                        currentUser.mode,
                        'HAUSHALTSZAHLUNGEN',
                        'x_tage_vor_gueltig_bis',
                        {
                            id: eintrag.id,
                            targetDate: gueltigBis,
                            zahlungName: eintrag.zweck || 'Unbekannte Zahlung',
                            gueltigBis: gueltigBis.toLocaleDateString('de-DE'),
                            daysLeft: daysLeftBis
                        }
                    );
                }
            }
        }

        // Erinnerung: nur wenn es eine Zukunft gibt (gueltigBis oder gueltigAb) und innerhalb 7 Tage
        if (eintrag.erinnerung) {
            const reminderDate = hatGueltigBis ? new Date(eintrag.gueltigBis) : (hatGueltigAb ? new Date(eintrag.gueltigAb) : null);
            if (reminderDate && reminderDate >= heute) {
                const daysLeftRem = calculateDaysLeft(reminderDate);
                if (daysLeftRem <= defErinnerung) {
                    await createPendingNotification(
                        currentUser.mode,
                        'HAUSHALTSZAHLUNGEN',
                        'x_tage_vor_erinnerung',
                        {
                            id: eintrag.id,
                            zahlungName: eintrag.zweck || 'Unbekannte Zahlung',
                            erinnerungsText: eintrag.erinnerung,
                            daysLeft: daysLeftRem
                        }
                    );
                }
            }
        }
        }
        
        // Benachrichtigungen neu laden
        await renderPendingNotifications();
    } catch (error) {
        console.error('🔔 Haushaltszahlungen: Fehler beim Prüfen der Benachrichtigungen:', error);
    }
}

// Hilfsfunktion: Differenz in Tagen (>=0, gerundet)
function calculateDaysLeft(dateObj) {
    if (!dateObj) return null;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const diffMs = target - startOfToday;
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

// ========================================
// TYP-BERECHNUNG (D22 Formel aus Excel)
// ========================================
function berechneTyp(eintrag) {
    if (eintrag.betrag < 0) {
        return 'gutschrift';
    }
    return 'belastung';
}

// ========================================
// BETRAGS-BERECHNUNG (Flexibel für beliebig viele Mitglieder)
// ========================================
function berechneBetragFuerMitglied(eintrag, userId) {
    if (!eintrag.betrag) return 0;
    
    // Neue Struktur: kostenaufteilung Objekt
    if (eintrag.kostenaufteilung && eintrag.kostenaufteilung[userId] !== undefined) {
        return eintrag.betrag * (eintrag.kostenaufteilung[userId] / 100);
    }
    
    // Legacy-Support: Alte Einträge mit anteilMarkus
    const thema = THEMEN[currentThemaId];
    if (thema && thema.mitglieder && thema.mitglieder.length >= 1) {
        const ersteMitgliedId = thema.mitglieder[0].userId || thema.mitglieder[0].name;
        if (userId === ersteMitgliedId) {
            return eintrag.betrag * ((eintrag.anteilMarkus || 50) / 100);
        } else if (thema.mitglieder.length >= 2) {
            const zweiteMitgliedId = thema.mitglieder[1].userId || thema.mitglieder[1].name;
            if (userId === zweiteMitgliedId) {
                return eintrag.betrag * ((100 - (eintrag.anteilMarkus || 50)) / 100);
            }
        }
    }
    
    // Fallback: Gleichverteilung
    const anzahlMitglieder = thema?.mitglieder?.length || 1;
    return eintrag.betrag * (1 / anzahlMitglieder);
}

// Legacy-Funktionen für Rückwärtskompatibilität
function berechneBetragMarkus(eintrag) {
    const thema = THEMEN[currentThemaId];
    if (thema && thema.mitglieder && thema.mitglieder.length >= 1) {
        const ersteMitgliedId = thema.mitglieder[0].userId || thema.mitglieder[0].name;
        return berechneBetragFuerMitglied(eintrag, ersteMitgliedId);
    }
    return eintrag.betrag * ((eintrag.anteilMarkus || 50) / 100);
}

function berechneBetragJasmin(eintrag) {
    const thema = THEMEN[currentThemaId];
    if (thema && thema.mitglieder && thema.mitglieder.length >= 2) {
        const zweiteMitgliedId = thema.mitglieder[1].userId || thema.mitglieder[1].name;
        return berechneBetragFuerMitglied(eintrag, zweiteMitgliedId);
    }
    return eintrag.betrag * ((100 - (eintrag.anteilMarkus || 50)) / 100);
}

// ========================================
// DASHBOARD BERECHNUNGEN
// ========================================
function berechneDashboardStats() {
    const eintraege = Object.values(HAUSHALTSZAHLUNGEN);
    
    // Zähler (wie C3, C5, D3, D5, E3, E5, F3, F5)
    let countAktiv = 0;
    let countNAktiv = 0;
    let countGutschrift = 0;
    let countBelastung = 0;
    let countFehler = 0;
    let countAbgelaufen = 0;
    let countZukuenftig = 0;

    // Summen pro Monat (wie G3-S3, G5-S5)
    const summenProMonat = {
        gutschrift: { monatlich: 0, januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0, juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0 },
        belastung: { monatlich: 0, januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0, juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0 }
    };

    // Beitragsaufteilung (wie G9-S9, G10-S10)
    const beitraegeMarkus = { monatlich: 0, einmalig: 0 };
    const beitraegeJasmin = { monatlich: 0, einmalig: 0 };

    const referenzDatum = simulationsDatum || new Date();

    eintraege.forEach(eintrag => {
        const { status } = berechneStatus(eintrag);
        const typ = berechneTyp(eintrag);

        // Zähler aktualisieren
        if (status === 'aktiv') countAktiv++;
        if (status === 'n-aktiv-geplant' || status === 'n-aktiv-vergangen') countNAktiv++;
        if (status === 'fehler') countFehler++;
        if (typ === 'gutschrift') countGutschrift++;
        if (typ === 'belastung') countBelastung++;

        // Abgelaufen/Zukünftig zählen
        if (eintrag.gueltigBis) {
            const gueltigBis = new Date(eintrag.gueltigBis);
            if (gueltigBis < referenzDatum) countAbgelaufen++;
        }
        if (eintrag.gueltigAb) {
            const gueltigAb = new Date(eintrag.gueltigAb);
            if (gueltigAb > referenzDatum) countZukuenftig++;
        }

        // Nur AKTIV Einträge für Summen berücksichtigen
        if (status === 'aktiv' && eintrag.intervall) {
            const betragMarkus = berechneBetragMarkus(eintrag);
            const betragJasmin = berechneBetragJasmin(eintrag);

            eintrag.intervall.forEach(intervall => {
                // Summen pro Monat und Typ
                if (summenProMonat[typ][intervall] !== undefined) {
                    summenProMonat[typ][intervall] += Math.abs(eintrag.betrag);
                }

                // Beitragsaufteilung
                if (intervall === 'monatlich') {
                    beitraegeMarkus.monatlich += betragMarkus;
                    beitraegeJasmin.monatlich += betragJasmin;
                } else {
                    beitraegeMarkus.einmalig += betragMarkus;
                    beitraegeJasmin.einmalig += betragJasmin;
                }
            });
        }
    });

    // Jährliche Berechnung (D9, D10 Formeln)
    // =G9*12+SUMME(H9:S9)
    const jaehrlichMarkus = (beitraegeMarkus.monatlich * 12) + beitraegeMarkus.einmalig;
    const jaehrlichJasmin = (beitraegeJasmin.monatlich * 12) + beitraegeJasmin.einmalig;

    // Jährliche Summen berechnen (Summe aller Einzelmonate)
    const summenJaehrlich = {
        gutschrift: Object.entries(summenProMonat.gutschrift)
            .filter(([key]) => key !== 'monatlich')
            .reduce((sum, [, val]) => sum + val, 0) + (summenProMonat.gutschrift.monatlich * 12),
        belastung: Object.entries(summenProMonat.belastung)
            .filter(([key]) => key !== 'monatlich')
            .reduce((sum, [, val]) => sum + val, 0) + (summenProMonat.belastung.monatlich * 12)
    };

    // Kosten berechnen
    const kostenMonatlich = summenProMonat.belastung.monatlich - summenProMonat.gutschrift.monatlich;
    const kostenJaehrlichEinmalig = Object.entries(summenProMonat.belastung)
        .filter(([key]) => key !== 'monatlich')
        .reduce((sum, [, val]) => sum + val, 0) - 
        Object.entries(summenProMonat.gutschrift)
        .filter(([key]) => key !== 'monatlich')
        .reduce((sum, [, val]) => sum + val, 0);
    
    // Effektiv monatlich = (monatliche Kosten * 12 + Jahreskosten) / 12
    const effektivMonatlich = ((kostenMonatlich * 12) + kostenJaehrlichEinmalig) / 12;

    // Alarme berechnen
    const alarme = berechneAlarme();
    
    // NEUE ZÄHLER: Status-basiert statt Typ-basiert
    let anzahlAktiv = 0;
    let anzahlGeplant = 0;
    let anzahlVergangen = 0;
    let anzahlBetragFehlt = 0;
    
    eintraege.forEach(eintrag => {
        const { status } = berechneStatus(eintrag);
        
        if (status === 'aktiv') {
            anzahlAktiv++;
            // Prüfe ob Betrag fehlt (nur bei aktiven Einträgen relevant)
            if (eintrag.betrag === null || eintrag.betrag === undefined) {
                anzahlBetragFehlt++;
            }
        } else if (status === 'n-aktiv-geplant') {
            anzahlGeplant++;
        } else if (status === 'n-aktiv-vergangen') {
            anzahlVergangen++;
        }
    });
    
    // Einträge ohne Betrag finden (für Alarm)
    // GEÄNDERT: 0 ist ein gültiger Betrag (z.B. Gratis-Monate), nur undefined/null/'' sind Fehler
    const eintraegeOhneBetrag = eintraege.filter(eintrag => {
        const { status } = berechneStatus(eintrag);
        return status === 'aktiv' && (eintrag.betrag === undefined || eintrag.betrag === null || eintrag.betrag === '');
    });
    
    // Kosten pro Intervall für IST/SOLL Vergleich
    const kostenProIntervall = {
        monatlich: 0,
        januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
        juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
    };
    
    // SOLL-Beiträge pro Mitglied und Intervall (basierend auf individuellem anteilMarkus pro Eintrag)
    const sollProMitgliedUndIntervall = {};
    const thema = THEMEN[currentThemaId];
    if (thema?.mitglieder) {
        thema.mitglieder.forEach(m => {
            sollProMitgliedUndIntervall[m.userId || m.name] = {
                monatlich: 0,
                januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
                juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
            };
        });
    }
    
    eintraege.forEach(eintrag => {
        const { status } = berechneStatus(eintrag);
        if (status !== 'aktiv') return;
        
        const betrag = Math.abs(eintrag.betrag || 0);
        const anteilMarkus = eintrag.anteilMarkus ?? 50; // Default 50% wenn nicht gesetzt
        const anteilJasmin = 100 - anteilMarkus;
        
        (eintrag.intervall || []).forEach(intervall => {
            if (kostenProIntervall[intervall] !== undefined) {
                kostenProIntervall[intervall] += betrag;
            }
            
            // SOLL pro Mitglied berechnen (basierend auf individuellem Anteil des Eintrags)
            if (thema?.mitglieder) {
                thema.mitglieder.forEach((m, idx) => {
                    const mitgliedKey = m.userId || m.name;
                    if (sollProMitgliedUndIntervall[mitgliedKey]) {
                        // Für 2 Mitglieder: erstes = anteilMarkus, zweites = anteilJasmin
                        // Für mehr Mitglieder: verwende den globalen Anteil als Fallback
                        let mitgliedAnteil;
                        if (thema.mitglieder.length === 2) {
                            mitgliedAnteil = idx === 0 ? anteilMarkus : anteilJasmin;
                        } else {
                            mitgliedAnteil = m.anteil || (100 / thema.mitglieder.length);
                        }
                        sollProMitgliedUndIntervall[mitgliedKey][intervall] += betrag * (mitgliedAnteil / 100);
                    }
                });
            }
        });
    });

    return {
        counts: {
            aktiv: countAktiv,
            nAktiv: countNAktiv,
            gutschrift: countGutschrift,
            belastung: countBelastung,
            fehler: countFehler,
            gesamt: countAktiv + countNAktiv,
            abgelaufen: countAbgelaufen,
            zukuenftig: countZukuenftig
        },
        // NEUE ZÄHLER für Dashboard
        anzahlen: {
            aktiv: anzahlAktiv,
            geplant: anzahlGeplant,
            vergangen: anzahlVergangen,
            betragFehlt: anzahlBetragFehlt
        },
        summenProMonat,
        summenJaehrlich,
        kosten: {
            monatlich: kostenMonatlich,
            jaehrlichEinmalig: kostenJaehrlichEinmalig,
            effektivMonatlich: effektivMonatlich
        },
        beitraege: {
            markus: {
                monatlich: beitraegeMarkus.monatlich,
                jaehrlich: jaehrlichMarkus
            },
            jasmin: {
                monatlich: beitraegeJasmin.monatlich,
                jaehrlich: jaehrlichJasmin
            }
        },
        alarme,
        eintraegeOhneBetrag,
        kostenProIntervall,
        sollProMitgliedUndIntervall, // NEU: SOLL-Werte basierend auf individuellem anteilMarkus pro Eintrag
        gesamtBelastungMonatlich: summenProMonat.belastung.monatlich,
        gesamtGutschriftMonatlich: summenProMonat.gutschrift.monatlich
    };
}

// Alarme berechnen (Einzahlungen vs. Kosten) - basierend auf individuellem anteilMarkus pro Eintrag
function berechneAlarme() {
    const alarme = [];
    const thema = THEMEN[currentThemaId];
    
    if (!thema || !thema.mitglieder) return alarme;
    
    const eintraege = Object.values(HAUSHALTSZAHLUNGEN);
    
    // SOLL pro Mitglied und Intervall berechnen (basierend auf individuellem anteilMarkus pro Eintrag)
    const sollProMitglied = {};
    thema.mitglieder.forEach(m => {
        sollProMitglied[m.userId || m.name] = {
            monatlich: 0,
            januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
            juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
        };
    });
    
    eintraege.forEach(eintrag => {
        const { status } = berechneStatus(eintrag);
        if (status !== 'aktiv') return;
        
        const betrag = Math.abs(eintrag.betrag || 0);
        const anteilMarkus = eintrag.anteilMarkus ?? 50;
        const anteilJasmin = 100 - anteilMarkus;
        
        (eintrag.intervall || []).forEach(intervall => {
            thema.mitglieder.forEach((m, idx) => {
                const mitgliedKey = m.userId || m.name;
                if (sollProMitglied[mitgliedKey] && sollProMitglied[mitgliedKey][intervall] !== undefined) {
                    // Für 2 Mitglieder: erstes = anteilMarkus, zweites = anteilJasmin
                    let mitgliedAnteil;
                    if (thema.mitglieder.length === 2) {
                        mitgliedAnteil = idx === 0 ? anteilMarkus : anteilJasmin;
                    } else {
                        mitgliedAnteil = m.anteil || (100 / thema.mitglieder.length);
                    }
                    sollProMitglied[mitgliedKey][intervall] += betrag * (mitgliedAnteil / 100);
                }
            });
        });
    });
    
    // Für jedes Mitglied prüfen
    thema.mitglieder.forEach(mitglied => {
        if (!mitglied.dauerauftraege) return;
        
        const mitgliedKey = mitglied.userId || mitglied.name;
        const mitgliedSoll = sollProMitglied[mitgliedKey] || {};
        
        // Prüfe jeden Dauerauftrag
        Object.entries(mitglied.dauerauftraege).forEach(([intervall, betrag]) => {
            const sollAnteil = mitgliedSoll[intervall] || 0;
            
            if (betrag < sollAnteil - 0.01 && sollAnteil > 0) {
                alarme.push({
                    typ: 'unterdeckung',
                    person: mitglied.name,
                    intervall: INTERVALL_CONFIG[intervall]?.label || intervall,
                    differenz: sollAnteil - betrag,
                    message: `${mitglied.name} zahlt ${formatCurrency(betrag)} statt ${formatCurrency(sollAnteil)} (${INTERVALL_CONFIG[intervall]?.label || intervall})`
                });
            } else if (betrag > sollAnteil + 0.01 && sollAnteil > 0) {
                alarme.push({
                    typ: 'ueberdeckung',
                    person: mitglied.name,
                    intervall: INTERVALL_CONFIG[intervall]?.label || intervall,
                    differenz: betrag - sollAnteil,
                    message: `${mitglied.name} zahlt ${formatCurrency(betrag - sollAnteil)} zu viel (${INTERVALL_CONFIG[intervall]?.label || intervall})`
                });
            }
        });
    });
    
    return alarme;
}

function berechneGesamtStatus(stats) {
    // F17 Formel: =WENN(E17>0;"ALARM";WENN(ZÄHLENWENN(G17:S17;"Differenz SOLL-Wert")>0;"PRÜFEN";"ALLES OK"))
    if (stats.counts.fehler > 0) {
        return { status: 'ALARM', color: 'bg-red-500' };
    }
    // Hier könnte man noch SOLL-IST Vergleiche einbauen
    return { status: 'ALLES OK', color: 'bg-green-500' };
}

// ========================================
// RENDERING
// ========================================
function renderDashboard() {
    const stats = berechneDashboardStats();
    const gesamtStatus = berechneGesamtStatus(stats);

    // NEUE ZÄHLER: Status-basierte Anzahlen statt Beträge
    updateElement('hz-stat-aktiv', stats.anzahlen.aktiv);
    updateElement('hz-stat-geplant', stats.anzahlen.geplant);
    updateElement('hz-stat-vergangen', stats.anzahlen.vergangen);
    updateElement('hz-stat-betrag-fehlt', stats.anzahlen.betragFehlt);

    // Kosten-Übersicht
    updateElement('hz-kosten-monatlich', formatCurrency(stats.kosten.monatlich));
    updateElement('hz-kosten-jaehrlich', formatCurrency(stats.kosten.jaehrlichEinmalig));
    updateElement('hz-kosten-effektiv', formatCurrency(stats.kosten.effektivMonatlich));

    // Mitglieder-Beiträge dynamisch rendern
    renderMitgliederBeitraege(stats);

    // Gesamt-Status mit Alarmen (inkl. Einträge ohne Betrag)
    const statusEl = document.getElementById('hz-total-status');
    if (statusEl) {
        const hatEintraegeOhneBetrag = stats.eintraegeOhneBetrag && stats.eintraegeOhneBetrag.length > 0;
        const gesamtAlarme = stats.alarme.length + (hatEintraegeOhneBetrag ? stats.eintraegeOhneBetrag.length : 0);
        
        if (gesamtAlarme > 0) {
            statusEl.textContent = `⚠️ ${gesamtAlarme} ALARM${gesamtAlarme > 1 ? 'E' : ''}`;
            statusEl.className = 'px-4 py-2 rounded-lg font-bold text-white bg-red-500 cursor-pointer';
            statusEl.onclick = () => showAlarmeModal(stats.alarme, stats.eintraegeOhneBetrag);
        } else {
            statusEl.textContent = gesamtStatus.status;
            statusEl.className = `px-4 py-2 rounded-lg font-bold text-white ${gesamtStatus.color}`;
            statusEl.onclick = null;
        }
    }

    // Monatsübersicht rendern
    renderMonatsUebersicht(stats);
}

// Mitglieder-Beiträge dynamisch rendern - Neues Design mit ausklappbarer IST/SOLL-Liste
function renderMitgliederBeitraege(stats) {
    const container = document.getElementById('hz-mitglieder-beitraege');
    if (!container) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema || !thema.mitglieder || thema.mitglieder.length === 0) {
        container.innerHTML = '<p class="text-white/70 text-sm">Keine Mitglieder konfiguriert</p>';
        return;
    }
    
    // Prüfe Prozentverteilung
    const gesamtAnteil = thema.mitglieder.reduce((sum, m) => sum + (m.anteil || 0), 0);
    const hasPercentError = gesamtAnteil !== 100;
    
    // Fehler-Banner wenn Prozente nicht 100% ergeben
    let errorBanner = '';
    if (hasPercentError) {
        const differenz = 100 - gesamtAnteil;
        errorBanner = `
            <div class="mb-4 p-4 bg-red-500/30 border-2 border-red-400 rounded-lg">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-2xl">⚠️</span>
                    <span class="text-lg font-bold text-white">Fehler in Prozentverteilung!</span>
                </div>
                <p class="text-white/90 mb-2">
                    Aktuell verteilt: <strong>${gesamtAnteil}%</strong> (${differenz > 0 ? `${differenz}% fehlen` : `${Math.abs(differenz)}% zuviel`})
                </p>
                <button onclick="window.openThemaSettings()" class="px-3 py-1 bg-white text-red-600 font-bold rounded hover:bg-red-100 transition">
                    Jetzt korrigieren →
                </button>
            </div>
        `;
    }
    
    const colors = ['blue', 'pink', 'green', 'purple', 'orange', 'cyan'];
    
    container.innerHTML = errorBanner + thema.mitglieder.map((mitglied, index) => {
        const color = colors[index % colors.length];
        const mitgliedKey = mitglied.userId || mitglied.name;
        const mitgliedId = mitgliedKey.replace(/[^a-zA-Z0-9]/g, '_');
        
    // Vollen Namen ermitteln mit Null-Check
    const userObj = (USERS && typeof USERS === 'object' && Object.keys(USERS).length > 0)
        ? Object.values(USERS).find(u => u.id === mitglied.userId || u.name === mitglied.userId || u.name === mitglied.name)
        : null;
    const displayName = userObj?.realName || mitglied.name || mitglied.userId || 'Unbekannt';
        
        // SOLL-Werte aus der neuen Berechnung (basierend auf individuellem anteilMarkus pro Eintrag)
        const mitgliedSoll = stats.sollProMitgliedUndIntervall?.[mitgliedKey] || {};
        const sollMonatlich = mitgliedSoll.monatlich || 0;
        const sollJaehrlichEinzel = Object.entries(mitgliedSoll)
            .filter(([key]) => key !== 'monatlich')
            .reduce((sum, [, val]) => sum + (val || 0), 0);
        const sollJaehrlich = (sollMonatlich * 12) + sollJaehrlichEinzel;
        
        // Berechne IST-Einzahlungen (aus Daueraufträgen)
        const dauerauftraege = mitglied.dauerauftraege || {};
        const istMonatlich = dauerauftraege.monatlich || 0;
        const istJaehrlichEinzel = Object.entries(dauerauftraege)
            .filter(([key]) => key !== 'monatlich')
            .reduce((sum, [, val]) => sum + (val || 0), 0);
        const istJaehrlich = (istMonatlich * 12) + istJaehrlichEinzel;
        
        // Status berechnen
        const differenzMonatlich = istMonatlich - sollMonatlich;
        const differenzJaehrlich = istJaehrlich - sollJaehrlich;
        const hasAlarm = differenzMonatlich < -0.01 || differenzJaehrlich < -0.01;
        const hasOhneBetrag = stats.eintraegeOhneBetrag?.length > 0;
        
        const statusText = hasAlarm ? 'ALARM' : (hasOhneBetrag ? 'PRÜFEN' : 'Alles okay');
        const statusColor = hasAlarm ? 'bg-red-500' : (hasOhneBetrag ? 'bg-yellow-500' : 'bg-green-500');
        
        // IST/SOLL Details pro Intervall (vereinfacht: 3 Spalten - Monat, IST, SOLL)
        const intervallDetails = Object.entries(INTERVALL_CONFIG).map(([key, config]) => {
            const sollIntervall = mitgliedSoll[key] || 0;
            const istIntervall = dauerauftraege[key] || 0;
            const hasDiff = Math.abs(istIntervall - sollIntervall) > 0.01;
            
            // Nur anzeigen wenn SOLL oder IST > 0
            if (sollIntervall === 0 && istIntervall === 0) return '';
            
            // Rot markieren bei Abweichung
            const rowClass = hasDiff ? 'bg-red-500/40 text-white font-bold' : '';
            
            return `
                <div class="grid grid-cols-3 gap-2 py-1 border-b border-white/10 text-xs ${rowClass}">
                    <span>${config.label}</span>
                    <span class="text-right">${formatCurrency(istIntervall)}</span>
                    <span class="text-right">${formatCurrency(sollIntervall)}</span>
                </div>
            `;
        }).filter(Boolean).join('');
        
        return `
            <div class="bg-${color}-500/30 p-3 rounded-lg">
                <!-- Header mit Name und Status -->
                <div class="flex justify-between items-center mb-2" style="min-height: 40px;">
                    <p class="text-lg font-bold truncate" style="max-width: 150px;" title="${displayName}">${displayName.length > 15 ? displayName.substring(0, 14) + '...' : displayName}</p>
                    <button onclick="toggleMitgliedDetails('${mitgliedId}')" 
                        class="px-3 py-1 ${statusColor} text-white text-xs font-bold rounded-lg hover:opacity-80 transition cursor-pointer flex items-center gap-1 shrink-0">
                        ${statusText}
                        <svg id="hz-chevron-${mitgliedId}" class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </button>
                </div>
                
                <!-- Kompakte Übersicht -->
                <div class="grid grid-cols-3 gap-1 text-center text-xs mb-2 items-start">
                    <div>
                        <p class="font-bold h-5 flex items-center justify-center">${formatCurrency(sollMonatlich)}</p>
                        <p class="text-white/60 h-4 flex items-center justify-center">Monatlich</p>
                    </div>
                    <div>
                        <p class="font-bold h-5 flex items-center justify-center">${formatCurrency(sollJaehrlich)}</p>
                        <p class="text-white/60 h-4 flex items-center justify-center">Jährlich</p>
                    </div>
                    <div>
                        <p class="font-bold h-5 flex items-center justify-center">${formatCurrency(sollJaehrlich / 12)}</p>
                        <p class="text-white/60 h-4 flex items-center justify-center">Effektiv/M</p>
                    </div>
                </div>
                
                <!-- Ausklappbare Details -->
                <div id="hz-details-${mitgliedId}" class="hidden mt-2 bg-white/10 rounded-lg p-2">
                    <h5 class="text-xs font-bold mb-2 border-b border-white/20 pb-1">📊 IST vs. SOLL Einzahlungen</h5>
                    <!-- Tabellen-Header -->
                    <div class="grid grid-cols-3 gap-2 py-1 border-b border-white/30 text-xs font-bold text-white/80 mb-1">
                        <span>Intervall</span>
                        <span class="text-right">IST</span>
                        <span class="text-right">SOLL</span>
                    </div>
                    ${intervallDetails || '<p class="text-xs text-white/50">Keine Daueraufträge konfiguriert</p>'}
                    
                    <div class="mt-2 pt-2 border-t border-white/20">
                        <div class="flex justify-between text-xs font-bold">
                            <span>Gesamt Jährlich:</span>
                            <span class="${differenzJaehrlich < -0.01 ? 'text-red-300' : 'text-green-300'}">
                                IST: ${formatCurrency(istJaehrlich)} / SOLL: ${formatCurrency(sollJaehrlich)}
                            </span>
                        </div>
                    </div>
                </div>
                
                <button onclick="window.openDauerauftraegeModal('${mitglied.userId || mitglied.name}')" 
                    class="mt-2 text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition w-full">
                    ⚙️ Daueraufträge bearbeiten
                </button>
            </div>
        `;
    }).join('');
}

// Toggle für Mitglied-Details
function toggleMitgliedDetails(mitgliedId) {
    const details = document.getElementById(`hz-details-${mitgliedId}`);
    const chevron = document.getElementById(`hz-chevron-${mitgliedId}`);
    if (details) {
        details.classList.toggle('hidden');
        if (chevron) {
            chevron.classList.toggle('rotate-180');
        }
    }
}
window.toggleMitgliedDetails = toggleMitgliedDetails;

// Alarme Modal anzeigen (inkl. Einträge ohne Betrag)
function showAlarmeModal(alarme, eintraegeOhneBetrag = []) {
    const modal = document.getElementById('hz-alarme-modal');
    const content = document.getElementById('hz-alarme-content');
    
    if (!modal || !content) return;
    
    let html = '';
    
    // Einträge ohne Betrag zuerst anzeigen
    if (eintraegeOhneBetrag && eintraegeOhneBetrag.length > 0) {
        html += `<div class="mb-4"><h4 class="font-bold text-yellow-700 mb-2">⚠️ Einträge ohne Betrag (${eintraegeOhneBetrag.length})</h4>`;
        html += eintraegeOhneBetrag.map(eintrag => `
            <div class="p-3 rounded-lg bg-yellow-100 border-l-4 border-yellow-500 mb-2">
                <p class="font-bold text-yellow-700">📋 ${eintrag.zweck || 'Ohne Zweck'}</p>
                <p class="text-sm text-gray-700">${eintrag.organisation || '-'}</p>
                <p class="text-xs text-gray-500 mt-1">Bitte Betrag nachtragen!</p>
                <button onclick="window.editHaushaltszahlung('${eintrag.id}'); document.getElementById('hz-alarme-modal').style.display='none';" 
                    class="mt-2 px-3 py-1 bg-yellow-500 text-white text-xs font-bold rounded hover:bg-yellow-600 transition">
                    ✏️ Bearbeiten
                </button>
            </div>
        `).join('');
        html += '</div>';
    }
    
    // Normale Alarme
    if (alarme && alarme.length > 0) {
        html += `<div><h4 class="font-bold text-red-700 mb-2">💰 Deckungsalarme (${alarme.length})</h4>`;
        html += alarme.map(alarm => `
            <div class="p-3 rounded-lg ${alarm.typ === 'unterdeckung' ? 'bg-red-100 border-l-4 border-red-500' : 'bg-yellow-100 border-l-4 border-yellow-500'} mb-2">
                <p class="font-bold ${alarm.typ === 'unterdeckung' ? 'text-red-700' : 'text-yellow-700'}">
                    ${alarm.typ === 'unterdeckung' ? '⚠️ Unterdeckung' : '💰 Überdeckung'}
                </p>
                <p class="text-sm text-gray-700">${alarm.message}</p>
                <p class="text-xs text-gray-500 mt-1">Differenz: ${formatCurrency(alarm.differenz)}</p>
            </div>
        `).join('');
        html += '</div>';
    }
    
    if (!html) {
        html = '<p class="text-gray-500 text-center">Keine Alarme vorhanden</p>';
    }
    
    content.innerHTML = html;
    modal.style.display = 'flex';
}

function renderMonatsUebersicht(stats) {
    const container = document.getElementById('hz-monats-uebersicht');
    if (!container) return;

    // Nur die 12 Monate (ohne "monatlich")
    const monate = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
    
    // Horizontale Tabelle mit Monat als Spalten
    let html = `
        <table class="w-full border-collapse text-xs">
            <thead>
                <tr class="bg-gray-100">
                    <th class="p-2 text-left font-bold text-gray-700 border">Typ</th>
                    ${monate.map(m => `<th class="p-1 text-center font-bold text-gray-600 border">${INTERVALL_CONFIG[m]?.short || m}</th>`).join('')}
                    <th class="p-2 text-center font-bold text-gray-700 border bg-cyan-50">Σ Jahr</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="p-2 font-bold text-green-700 border">📥 Gutschrift</td>
                    ${monate.map(m => {
                        const wert = stats.summenProMonat.gutschrift[m] || 0;
                        return `<td class="p-1 text-center border ${wert > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}">${wert > 0 ? formatCurrency(wert) : '-'}</td>`;
                    }).join('')}
                    <td class="p-2 text-center font-bold text-green-700 border">${formatCurrency(stats.summenJaehrlich?.gutschrift || 0)}</td>
                </tr>
                <tr>
                    <td class="p-2 font-bold text-red-700 border">📤 Belastung</td>
                    ${monate.map(m => {
                        const wert = stats.summenProMonat.belastung[m] || 0;
                        return `<td class="p-1 text-center border ${wert > 0 ? 'text-red-700 font-medium' : 'text-gray-400'}">${wert > 0 ? formatCurrency(wert) : '-'}</td>`;
                    }).join('')}
                    <td class="p-2 text-center font-bold text-red-700 border">${formatCurrency(stats.summenJaehrlich?.belastung || 0)}</td>
                </tr>
                <tr>
                    <td class="p-2 font-bold text-gray-700 border">📊 Saldo</td>
                    ${monate.map(m => {
                        const gutschrift = stats.summenProMonat.gutschrift[m] || 0;
                        const belastung = stats.summenProMonat.belastung[m] || 0;
                        const saldo = gutschrift - belastung;
                        const color = saldo > 0 ? 'text-green-600' : saldo < 0 ? 'text-red-600' : 'text-gray-400';
                        return `<td class="p-1 text-center border ${color} font-medium">${saldo !== 0 ? formatCurrency(saldo) : '-'}</td>`;
                    }).join('')}
                    <td class="p-2 text-center font-bold border ${(stats.summenJaehrlich?.gutschrift || 0) - (stats.summenJaehrlich?.belastung || 0) >= 0 ? 'text-green-700' : 'text-red-700'}">${formatCurrency((stats.summenJaehrlich?.gutschrift || 0) - (stats.summenJaehrlich?.belastung || 0))}</td>
                </tr>
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// toggleAlleMonate und updateAlleMonateButton wurden entfernt
// Der "Alle Monate auswählen" Button wurde aus der UI entfernt
// Regel: Entweder "Monatlich" ODER max. 11 einzelne Monate (nicht alle 12)

function renderHaushaltszahlungenTable() {
    const tbody = document.getElementById('haushaltszahlungen-table-body');
    if (!tbody) return;

    let eintraege = Object.values(HAUSHALTSZAHLUNGEN);
    console.log(`Alle Eintraege vor Filter: ${eintraege.length}`);

    if (currentFilter.status) {
        const beforeFilter = eintraege.length;
        eintraege = eintraege.filter(e => berechneStatus(e).status === currentFilter.status);
        console.log(`Nach Status-Filter (${currentFilter.status}): ${eintraege.length} (vorher: ${beforeFilter})`);
    }

    if (currentFilter.typ) {
        eintraege = eintraege.filter(e => berechneTyp(e) === currentFilter.typ);
        console.log(`Nach Typ-Filter: ${eintraege.length}`);
    }

    // Mehrfachauswahl fuer Intervalle
    if (currentFilter.intervalle && currentFilter.intervalle.length > 0) {
        eintraege = eintraege.filter(e => {
            if (!e.intervall || e.intervall.length === 0) return false;
            // Eintrag muss mindestens eines der ausgewaehlten Intervalle haben
            return currentFilter.intervalle.some(filterIntervall => e.intervall.includes(filterIntervall));
        });
        console.log(`Nach Intervall-Filter: ${eintraege.length}`);
    }

    // Tag-Filter (AND/OR + NICHT)
    if (activeHaushaltszahlungFilters.length > 0) {
        eintraege = eintraege.filter((eintrag) => {
            const evaluate = (filter) => {
                const matches = doesHaushaltszahlungMatchSearchFilter(eintrag, filter);
                return filter.negate ? !matches : matches;
            };

            return haushaltszahlungSearchJoinMode === 'or'
                ? activeHaushaltszahlungFilters.some(evaluate)
                : activeHaushaltszahlungFilters.every(evaluate);
        });
        console.log(`Nach Tag-Filter: ${eintraege.length}`);
    }

    if (eintraege.length === 0) {
        const alleEintraege = Object.values(HAUSHALTSZAHLUNGEN).length;
        let message = '';
        
        if (alleEintraege > 0) {
            // Es gibt Eintraege, aber sie werden durch Filter ausgeblendet
            message = `
                <td colspan="9" class="px-4 py-8 text-center">
                    <div class="inline-block p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                        <p class="text-yellow-800 font-bold mb-2">Keine Eintraege mit den aktuellen Filtern gefunden!</p>
                        <p class="text-sm text-gray-600 mb-3">
                            Es gibt ${alleEintraege} Eintraege insgesamt, aber keiner entspricht den Filter-Kriterien.<br>
                            Aktueller Status-Filter: <strong>${currentFilter.status || 'Alle'}</strong>
                        </p>
                        <button onclick="document.getElementById('reset-filters-haushaltszahlungen').click()" 
                            class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-bold">
                            Filter zuruecksetzen
                        </button>
                    </div>
                </td>
            `;
        } else {
            message = `
                <td colspan="9" class="px-4 py-8 text-center text-gray-400 italic">
                    Keine Eintraege vorhanden. Erstelle deinen ersten Eintrag!
                </td>
            `;
        }
        
        tbody.innerHTML = `<tr>${message}</tr>`;
        return;
    }

    tbody.innerHTML = eintraege.map(eintrag => {
        const { status, fehlerText } = berechneStatus(eintrag);
        const typ = berechneTyp(eintrag);
        const statusConfig = STATUS_CONFIG[status];
        const typConfig = TYP_CONFIG[typ];
        const betragMarkus = berechneBetragMarkus(eintrag);
        const betragJasmin = berechneBetragJasmin(eintrag);
        const intervallLabels = (eintrag.intervall || []).map(i => INTERVALL_CONFIG[i]?.short || i).join(', ');
        
        // Prüfe ob Betrag fehlt (Alarm)
        // GEÄNDERT: 0 ist ein gültiger Betrag (z.B. Gratis-Monate), nur undefined/null/'' sind Fehler
        const betragFehlt = eintrag.betrag === undefined || eintrag.betrag === null || eintrag.betrag === '';
        const betragAlarm = status === 'aktiv' && betragFehlt;

        return `
            <tr class="hover:bg-gray-50 transition ${status === 'fehler' ? 'bg-red-50' : ''} ${betragAlarm ? 'bg-yellow-50 border-l-4 border-yellow-500' : ''}">
                <td class="px-3 py-3">
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${statusConfig.color}">
                        ${statusConfig.icon} ${statusConfig.label}
                    </span>
                    ${fehlerText ? `<div class="text-xs text-red-600 mt-1">${fehlerText}</div>` : ''}
                    ${betragAlarm ? `<div class="text-xs text-yellow-600 mt-1 font-bold">⚠️ Betrag fehlt!</div>` : ''}
                </td>
                <td class="px-3 py-3">
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${typConfig.color}">
                        ${typConfig.icon} ${typConfig.label}
                    </span>
                </td>
                <td class="px-3 py-3 font-medium text-gray-800">${eintrag.zweck || '-'}</td>
                <td class="px-3 py-3 text-gray-600">${eintrag.organisation || '-'}</td>
                <td class="px-3 py-3 text-xs text-gray-500">${intervallLabels || '-'}</td>
                <td class="px-3 py-3 font-bold ${betragAlarm ? 'text-yellow-600 bg-yellow-100' : (typ === 'gutschrift' ? 'text-green-600' : 'text-red-600')}">
                    ${betragAlarm ? '⚠️ FEHLT' : (eintrag.betrag === 0 ? '<span class="text-blue-600">0,00 € (Gratis)</span>' : formatCurrency(eintrag.betrag))}
                </td>
                <td class="px-3 py-3 text-sm">
                    ${(() => {
                        const thema = THEMEN[currentThemaId];
                        if (!thema || !thema.mitglieder || thema.mitglieder.length === 0) {
                            return `<div class="text-gray-600">Keine Mitglieder</div>`;
                        }
                        
                        const colors = ['blue', 'pink', 'green', 'purple', 'orange'];
                        
                        // Voller VORNAME (vor dem ersten Leerzeichen)
                        const getName = (m) => {
                            const fullName = m.name || m.userId || '';
                            return fullName.split(' ')[0];
                        };
                        
                        // NEUE STRUKTUR: Zeige alle Mitglieder mit ihren Anteilen
                        return thema.mitglieder.map((mitglied, index) => {
                            const userId = mitglied.userId || mitglied.name;
                            const name = getName(mitglied);
                            const color = colors[index % colors.length];
                            
                            // Hole Anteil aus kostenaufteilung oder fallback auf anteilMarkus
                            let anteil;
                            if (eintrag.kostenaufteilung && eintrag.kostenaufteilung[userId] !== undefined) {
                                anteil = eintrag.kostenaufteilung[userId];
                            } else {
                                // Legacy: Alte Einträge mit anteilMarkus
                                if (index === 0) {
                                    anteil = eintrag.anteilMarkus || 50;
                                } else if (index === 1) {
                                    anteil = 100 - (eintrag.anteilMarkus || 50);
                                } else {
                                    anteil = 0; // Neue Mitglieder in alten Einträgen
                                }
                            }
                            
                            return `<div class="text-${color}-600 font-medium" title="${mitglied.name || mitglied.userId}">${anteil}% ${name}</div>`;
                        }).join('');
                    })()}
                </td>
                <td class="px-3 py-3 text-xs text-gray-500">
                    ${formatDate(eintrag.gueltigAb)} - ${eintrag.gueltigBis === '2099-12-31' ? '<span class="text-blue-600 font-bold">∞ Fortlaufend</span>' : formatDate(eintrag.gueltigBis)}
                </td>
                <td class="px-3 py-3 text-center">
                    <div class="flex justify-center gap-1">
                        <button onclick="window.editHaushaltszahlung('${eintrag.id}')" 
                            class="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Bearbeiten">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button onclick="window.deleteHaushaltszahlung('${eintrag.id}')" 
                            class="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition" title="Löschen">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ========================================
// MODAL FUNKTIONEN
// ========================================

// Autocomplete-Listen für Zweck und Organisation aktualisieren
function updateAutocompleteLists() {
    const eintraege = Object.values(HAUSHALTSZAHLUNGEN);
    
    // Eindeutige Zwecke sammeln
    const zwecke = [...new Set(eintraege.map(e => e.zweck).filter(Boolean))].sort();
    const organisationen = [...new Set(eintraege.map(e => e.organisation).filter(Boolean))].sort();
    
    // Zweck-Datalist befüllen
    const zweckList = document.getElementById('hz-zweck-list');
    if (zweckList) {
        zweckList.innerHTML = zwecke.map(z => `<option value="${z}">`).join('');
    }
    
    // Organisation-Datalist befüllen
    const orgList = document.getElementById('hz-organisation-list');
    if (orgList) {
        orgList.innerHTML = organisationen.map(o => `<option value="${o}">`).join('');
    }
}

function openCreateModal() {
    const modal = document.getElementById('haushaltszahlungModal');
    const title = document.getElementById('haushaltszahlungModalTitle');
    
    if (modal && title) {
        title.textContent = 'Neuer Eintrag';
        document.getElementById('hz-id').value = '';
        document.getElementById('hz-zweck').value = '';
        document.getElementById('hz-organisation').value = '';
        document.getElementById('hz-betrag').value = '';
        document.getElementById('hz-gueltig-ab').value = new Date().toISOString().split('T')[0];
        document.getElementById('hz-gueltig-bis').value = '';
        document.getElementById('hz-kundennummer').value = '';
        document.getElementById('hz-vertragsnummer').value = '';
        document.getElementById('hz-vormerk').value = '';
        document.getElementById('hz-erinnerung').value = '';
        if (document.getElementById('hz-notizen')) document.getElementById('hz-notizen').value = '';
        
        // Intervall-Checkboxen zurücksetzen und aktivieren
        document.querySelectorAll('.hz-intervall-checkbox').forEach(cb => {
            cb.checked = false;
            cb.disabled = false;
        });
        
        // Abtausch-Button verstecken (neuer Eintrag)
        const abtauschBtn = document.getElementById('hz-abtausch-btn');
        if (abtauschBtn) abtauschBtn.classList.add('hidden');
        
        // Betrag-Hinweis anzeigen (da Feld leer ist)
        const hinweis = document.getElementById('hz-betrag-hinweis');
        if (hinweis) hinweis.classList.remove('hidden');
        
        // Autocomplete-Listen aktualisieren
        updateAutocompleteLists();
        
        // WICHTIG: Dynamische Kostenaufteilung basierend auf Themen-Mitgliedern
        renderKostenaufteilungInputs(null); // null = neuer Eintrag, Standard-Aufteilung
        
        modal.style.display = 'flex';
    }
}

function openEditModal(eintrag) {
    const modal = document.getElementById('haushaltszahlungModal');
    const title = document.getElementById('haushaltszahlungModalTitle');
    
    if (modal && title) {
        title.textContent = 'Eintrag bearbeiten';
        document.getElementById('hz-id').value = eintrag.id;
        document.getElementById('hz-zweck').value = eintrag.zweck || '';
        document.getElementById('hz-organisation').value = eintrag.organisation || '';
        
        // WICHTIG: Unterscheide zwischen null (fehlt) und 0 (Gratis)
        const betragInput = document.getElementById('hz-betrag');
        if (eintrag.betrag === null || eintrag.betrag === undefined) {
            betragInput.value = ''; // Leer lassen wenn Betrag fehlt
        } else {
            betragInput.value = eintrag.betrag; // Auch 0 anzeigen
        }
        
        document.getElementById('hz-gueltig-ab').value = eintrag.gueltigAb || '';
        
        // BIS-Datum: Wenn "fortlaufend" (2099-12-31), zeige leer
        const gueltigBis = eintrag.gueltigBis || '';
        if (gueltigBis === '2099-12-31') {
            document.getElementById('hz-gueltig-bis').value = ''; // Leer = fortlaufend
        } else {
            document.getElementById('hz-gueltig-bis').value = gueltigBis;
        }
        document.getElementById('hz-kundennummer').value = eintrag.kundennummer || '';
        document.getElementById('hz-vertragsnummer').value = eintrag.vertragsnummer || '';
        document.getElementById('hz-vormerk').value = eintrag.vormerk || '';
        document.getElementById('hz-erinnerung').value = eintrag.erinnerung || '';
        if (document.getElementById('hz-notizen')) document.getElementById('hz-notizen').value = eintrag.notizen || '';
        
        // Intervall-Checkboxen setzen und Logik anwenden
        const hasMonatlich = (eintrag.intervall || []).includes('monatlich');
        const einzelmonate = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
        const hasEinzelmonat = einzelmonate.some(m => (eintrag.intervall || []).includes(m));
        
        document.querySelectorAll('.hz-intervall-checkbox').forEach(cb => {
            cb.checked = (eintrag.intervall || []).includes(cb.value);
            // Logik: Wenn monatlich ausgewählt, Einzelmonate deaktivieren und umgekehrt
            if (cb.value === 'monatlich') {
                cb.disabled = hasEinzelmonat;
            } else {
                cb.disabled = hasMonatlich;
            }
        });
        
        // Abtausch-Button nur bei aktiven Einträgen anzeigen
        const abtauschBtn = document.getElementById('hz-abtausch-btn');
        const { status } = berechneStatus(eintrag);
        if (abtauschBtn) {
            if (status === 'aktiv') {
                abtauschBtn.classList.remove('hidden');
                abtauschBtn.onclick = () => {
                    closeHaushaltszahlungModal();
                    window.openAbtauschModal(eintrag.id);
                };
            } else {
                abtauschBtn.classList.add('hidden');
            }
        }
        
        // Autocomplete-Listen aktualisieren
        updateAutocompleteLists();
        
        // WICHTIG: Dynamische Kostenaufteilung basierend auf Themen-Mitgliedern
        renderKostenaufteilungInputs(eintrag); // Übergebe Eintrag für gespeicherte Aufteilung
        
        modal.style.display = 'flex';
    }
}

function closeHaushaltszahlungModal() {
    const modal = document.getElementById('haushaltszahlungModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// NEUE FUNKTION: Dynamische Kostenaufteilung basierend auf Themen-Mitgliedern
function renderKostenaufteilungInputs(existingEintrag) {
    const container = document.getElementById('hz-kostenaufteilung-inputs');
    const summeContainer = document.getElementById('hz-kostenaufteilung-summe');
    
    if (!container || !summeContainer) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema || !thema.mitglieder || thema.mitglieder.length === 0) {
        container.innerHTML = '<p class="text-red-600 text-sm">⚠️ Keine Mitglieder im Thema! Bitte zuerst Mitglieder hinzufügen.</p>';
        return;
    }
    
    const mitglieder = thema.mitglieder;
    
    // Bestimme Standard-Aufteilung
    let anteile = {};
    if (existingEintrag && existingEintrag.kostenaufteilung) {
        // Bestehender Eintrag: Lade gespeicherte Aufteilung
        anteile = { ...existingEintrag.kostenaufteilung };
    } else {
        // Neuer Eintrag: Gleichmäßige Verteilung
        const gleichverteilung = Math.floor(100 / mitglieder.length);
        const rest = 100 - (gleichverteilung * mitglieder.length);
        
        mitglieder.forEach((m, index) => {
            const userId = m.userId || m.name;
            anteile[userId] = index === 0 ? gleichverteilung + rest : gleichverteilung;
        });
    }
    
    const colors = ['blue', 'pink', 'green', 'purple', 'orange', 'cyan'];
    
    // Erstelle Input-Felder für jedes Mitglied
    // WICHTIG: Letzte Person wird automatisch berechnet (bequemer!)
    const isLastPerson = (index) => index === mitglieder.length - 1;
    
    container.innerHTML = mitglieder.map((mitglied, index) => {
        const userId = mitglied.userId || mitglied.name;
        const userObj = (USERS && typeof USERS === 'object' && Object.keys(USERS).length > 0)
            ? Object.values(USERS).find(u => u.id === mitglied.userId || u.name === mitglied.userId || u.name === mitglied.name)
            : null;
        const displayName = userObj?.realName || mitglied.name || mitglied.userId || 'Unbekannt';
        const color = colors[index % colors.length];
        const anteil = anteile[userId] || 0;
        const isLast = isLastPerson(index);
        
        return `
            <div class="flex items-center gap-3">
                <span class="w-32 font-bold text-${color}-600">${displayName}:</span>
                ${isLast ? `
                    <input type="number" 
                        value="${anteil}" 
                        data-user-id="${userId}"
                        class="hz-anteil-input hz-anteil-auto w-20 p-2 border-2 border-blue-400 bg-blue-50 rounded-lg text-center font-bold"
                        readonly
                        title="Wird automatisch berechnet (100% - Summe der anderen)">
                    <span class="text-blue-600 text-xs">✨ Auto</span>
                ` : `
                    <input type="number" 
                        min="0" 
                        max="100" 
                        value="${anteil}" 
                        data-user-id="${userId}"
                        data-index="${index}"
                        class="hz-anteil-input w-20 p-2 border-2 border-gray-300 rounded-lg text-center font-bold focus:border-${color}-500"
                        oninput="window.updateKostenaufteilungSumme()">
                    <span class="text-gray-500">%</span>
                `}
                <div class="flex-1 bg-gray-200 rounded-full h-3">
                    <div class="bg-${color}-500 h-3 rounded-full transition-all" style="width: ${Math.min(anteil, 100)}%"></div>
                </div>
            </div>
        `;
    }).join('');
    
    // Initiale Summen-Berechnung
    updateKostenaufteilungSumme();
}

// NEUE FUNKTION: Berechne und validiere Summe der Kostenaufteilung
window.updateKostenaufteilungSumme = function() {
    const inputs = document.querySelectorAll('.hz-anteil-input:not(.hz-anteil-auto)'); // Nur editierbare Inputs
    const autoInput = document.querySelector('.hz-anteil-auto'); // Auto-berechnete letzte Person
    const summeContainer = document.getElementById('hz-kostenaufteilung-summe');
    
    if (!summeContainer) return;
    
    // Berechne Summe der manuellen Eingaben
    let summe = 0;
    inputs.forEach(input => {
        const value = parseInt(input.value) || 0;
        summe += value;
        
        // Update visuelle Balken
        const parent = input.closest('.flex');
        const bar = parent?.querySelector('.bg-gray-200 > div');
        if (bar) {
            bar.style.width = `${Math.min(value, 100)}%`;
        }
    });
    
    // Automatische Berechnung für letzte Person
    if (autoInput) {
        const autoWert = Math.max(0, 100 - summe); // Kann nicht negativ sein
        autoInput.value = autoWert;
        summe += autoWert;
        
        // Update visueller Balken für Auto-Person
        const parent = autoInput.closest('.flex');
        const bar = parent?.querySelector('.bg-gray-200 > div');
        if (bar) {
            bar.style.width = `${Math.min(autoWert, 100)}%`;
        }
    }
    
    // Validierung und Anzeige
    if (summe === 100) {
        summeContainer.className = 'mt-3 p-2 rounded text-sm font-bold text-center bg-green-100 text-green-700';
        summeContainer.innerHTML = `✅ Summe: ${summe}% (Korrekt)`;
    } else if (summe < 100) {
        summeContainer.className = 'mt-3 p-2 rounded text-sm font-bold text-center bg-yellow-100 text-yellow-700';
        summeContainer.innerHTML = `⚠️ Summe: ${summe}% (${100 - summe}% fehlen noch)`;
    } else {
        summeContainer.className = 'mt-3 p-2 rounded text-sm font-bold text-center bg-red-100 text-red-700';
        summeContainer.innerHTML = `❌ Summe: ${summe}% (${summe - 100}% zu viel!)`;
    }
};

// Alte Funktion für Legacy-Zwecke beibehalten (falls irgendwo noch verwendet)
function updateAnteilDisplay() {
    // Diese Funktion ist jetzt deprecated - nutze renderKostenaufteilungInputs()
    updateKostenaufteilungSumme();
}

// ========================================
// SPEICHERN & LÖSCHEN
// ========================================
async function saveHaushaltszahlung() {
    // Validiere dass Collection verfügbar ist
    if (!haushaltszahlungenCollection) {
        alertUser('Fehler: Keine Verbindung zur Datenbank. Bitte lade die Seite neu.', 'error');
        return;
    }
    
    // Validiere currentUser
    if (!currentUser || !currentUser.displayName) {
        alertUser('Fehler: Benutzer nicht angemeldet.', 'error');
        return;
    }
    
    const id = document.getElementById('hz-id')?.value || '';
    const zweck = document.getElementById('hz-zweck')?.value?.trim() || '';
    const organisation = document.getElementById('hz-organisation')?.value?.trim() || '';
    
    // WICHTIG: Unterscheide zwischen leer (null) und bewusst 0 eingegeben
    const betragInput = document.getElementById('hz-betrag')?.value?.trim();
    let betrag;
    if (betragInput === '' || betragInput === undefined || betragInput === null) {
        // Feld ist leer → Betrag fehlt → null speichern
        betrag = null;
    } else {
        // Wert wurde eingegeben (auch 0) → als Zahl speichern
        betrag = parseFloat(betragInput);
        if (isNaN(betrag)) {
            betrag = null; // Ungültige Eingabe → null
        }
    }
    
    const gueltigAb = document.getElementById('hz-gueltig-ab')?.value || '';
    
    // BIS-Datum: Wenn leer, setze auf "fortlaufend" (31.12.2099)
    let gueltigBis = document.getElementById('hz-gueltig-bis')?.value?.trim();
    if (!gueltigBis || gueltigBis === '') {
        gueltigBis = '2099-12-31'; // Fortlaufend bis auf Widerruf
        console.log("ℹ️ Kein BIS-Datum angegeben → Setze auf fortlaufend (31.12.2099)");
    }
    
    // NEUE KOSTENAUFTEILUNG: Sammle Anteile aller Mitglieder
    const kostenaufteilung = {};
    let summeAnteile = 0;
    document.querySelectorAll('.hz-anteil-input').forEach(input => {
        const userId = input.dataset.userId;
        const anteil = parseInt(input.value) || 0;
        kostenaufteilung[userId] = anteil;
        summeAnteile += anteil;
    });
    
    // Validierung: Summe muss 100% sein
    if (summeAnteile !== 100) {
        alertUser(`Kostenaufteilung muss 100% ergeben! Aktuell: ${summeAnteile}%`, 'error');
        return;
    }
    
    // Legacy-Support: Wenn nur 2 Personen, speichere auch anteilMarkus für Rückwärtskompatibilität
    const thema = THEMEN[currentThemaId];
    let anteilMarkus = 50; // Fallback
    if (thema && thema.mitglieder && thema.mitglieder.length >= 1) {
        const ersteMitgliedId = thema.mitglieder[0].userId || thema.mitglieder[0].name;
        anteilMarkus = kostenaufteilung[ersteMitgliedId] || 50;
    }
    
    const kundennummer = document.getElementById('hz-kundennummer')?.value?.trim() || '';
    const vertragsnummer = document.getElementById('hz-vertragsnummer')?.value?.trim() || '';
    const vormerk = document.getElementById('hz-vormerk')?.value?.trim() || '';
    const erinnerung = document.getElementById('hz-erinnerung')?.value || '';
    const notizen = document.getElementById('hz-notizen')?.value?.trim() || '';

    // Intervalle sammeln
    const intervall = [];
    document.querySelectorAll('.hz-intervall-checkbox:checked').forEach(cb => {
        intervall.push(cb.value);
    });

    const data = {
        zweck,
        organisation,
        betrag,
        gueltigAb,
        gueltigBis,
        anteilMarkus, // Legacy-Support für alte Einträge
        kostenaufteilung, // NEUE STRUKTUR: Flexibel für beliebig viele Mitglieder
        intervall,
        kundennummer,
        vertragsnummer,
        vormerk,
        erinnerung,
        notizen,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.displayName
    };

    // Validierung
    const testEintrag = { ...data };
    const validation = validateEintrag(testEintrag);
    if (validation !== '-') {
        alertUser(`Validierungsfehler: ${validation}`, 'error');
        return;
    }

    try {
        if (id) {
            // Update
            await updateDoc(doc(haushaltszahlungenCollection, id), data);
            alertUser('Eintrag erfolgreich aktualisiert!', 'success');
        } else {
            // Create
            data.createdAt = serverTimestamp();
            data.createdBy = currentUser.displayName;
            await addDoc(haushaltszahlungenCollection, data);
            alertUser('Eintrag erfolgreich erstellt!', 'success');
        }
        closeHaushaltszahlungModal();
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        alertUser('Fehler beim Speichern: ' + (error.message || 'Unbekannter Fehler'), 'error');
    }
}

async function deleteHaushaltszahlung(id) {
    if (!confirm('Möchtest du diesen Eintrag wirklich löschen?')) return;
    
    // Validiere dass Collection verfügbar ist
    if (!haushaltszahlungenCollection) {
        alertUser('Fehler: Keine Verbindung zur Datenbank. Bitte lade die Seite neu.', 'error');
        return;
    }

    try {
        await deleteDoc(doc(haushaltszahlungenCollection, id));
        alertUser('Eintrag erfolgreich gelöscht!', 'success');
    } catch (error) {
        console.error("Fehler beim Löschen:", error);
        alertUser('Fehler beim Löschen: ' + (error.message || 'Unbekannter Fehler'), 'error');
    }
}

// ========================================
// EINSTELLUNGEN
// ========================================
function openSettingsModal() {
    const modal = document.getElementById('haushaltszahlungenSettingsModal');
    if (modal) {
        renderThemenListe();
        renderMitgliederListe();
        // renderKostenaufteilung() wurde entfernt - Aufteilung erfolgt individuell pro Eintrag
        modal.style.display = 'flex';
    }
    
    // Event-Listener für Buttons
    setupSettingsEventListeners();
}

function setupSettingsEventListeners() {
    const addThemaBtn = document.getElementById('hz-add-thema-btn');
    if (addThemaBtn && !addThemaBtn.dataset.listenerAttached) {
        addThemaBtn.addEventListener('click', () => {
            document.getElementById('hz-add-thema-modal').style.display = 'flex';
        });
        addThemaBtn.dataset.listenerAttached = 'true';
    }
    
    const saveThemaBtn = document.getElementById('hz-save-thema-btn');
    if (saveThemaBtn && !saveThemaBtn.dataset.listenerAttached) {
        saveThemaBtn.addEventListener('click', saveNewThema);
        saveThemaBtn.dataset.listenerAttached = 'true';
    }
    
    const addMitgliedBtn = document.getElementById('hz-add-mitglied-btn');
    if (addMitgliedBtn && !addMitgliedBtn.dataset.listenerAttached) {
        addMitgliedBtn.addEventListener('click', openAddMitgliedModal);
        addMitgliedBtn.dataset.listenerAttached = 'true';
    }
    
    const saveMitgliedBtn = document.getElementById('hz-save-mitglied-btn');
    if (saveMitgliedBtn && !saveMitgliedBtn.dataset.listenerAttached) {
        saveMitgliedBtn.addEventListener('click', saveNewMitglied);
        saveMitgliedBtn.dataset.listenerAttached = 'true';
    }
    
    const saveDauerauftraegeBtn = document.getElementById('hz-save-dauerauftraege-btn');
    if (saveDauerauftraegeBtn && !saveDauerauftraegeBtn.dataset.listenerAttached) {
        saveDauerauftraegeBtn.addEventListener('click', saveDauerauftraege);
        saveDauerauftraegeBtn.dataset.listenerAttached = 'true';
    }
    
    const showProtokollBtn = document.getElementById('hz-show-protokoll-btn');
    if (showProtokollBtn && !showProtokollBtn.dataset.listenerAttached) {
        showProtokollBtn.addEventListener('click', toggleProtokoll);
        showProtokollBtn.dataset.listenerAttached = 'true';
    }
}

function renderThemenListe() {
    const container = document.getElementById('hz-themen-liste');
    if (!container) return;
    
    // Filtere nur aktive (nicht archivierte) Themen
    const activeThemen = Object.values(THEMEN).filter(t => !t.archiviert);
    const archivedThemen = Object.values(THEMEN).filter(t => t.archiviert);
    
    if (activeThemen.length === 0 && archivedThemen.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Keine Themen vorhanden</p>';
        return;
    }
    
    let html = '';
    
    // Aktive Themen
    if (activeThemen.length > 0) {
        html += activeThemen.map(thema => `
            <div class="flex items-center justify-between p-2 bg-white rounded-lg border ${thema.id === currentThemaId ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200'}">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-gray-800">${thema.name}</span>
                    ${thema.id === currentThemaId ? '<span class="text-xs bg-cyan-500 text-white px-2 py-0.5 rounded">Aktiv</span>' : ''}
                    <span class="text-xs text-gray-500">(${thema.mitglieder?.length || 0} Mitglieder)</span>
                </div>
                <div class="flex gap-1">
                    ${thema.ersteller === currentUser.displayName ? `
                        <button onclick="window.archiveThema('${thema.id}')" class="p-1 text-orange-600 hover:bg-orange-100 rounded" title="Archivieren">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }
    
    // Archivierte Themen (falls vorhanden)
    if (archivedThemen.length > 0) {
        html += `
            <div class="mt-4 pt-3 border-t border-gray-200">
                <p class="text-xs font-bold text-gray-500 mb-2">📦 ARCHIVIERT</p>
                ${archivedThemen.map(thema => `
                    <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200 opacity-70 mb-1">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-gray-600">${thema.name}</span>
                            <span class="text-xs text-gray-400">(${thema.mitglieder?.length || 0} Mitglieder)</span>
                        </div>
                        <div class="flex gap-1">
                            ${thema.ersteller === currentUser.displayName ? `
                                <button onclick="window.restoreThema('${thema.id}')" class="p-1 text-green-600 hover:bg-green-100 rounded" title="Wiederherstellen">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function renderMitgliederListe() {
    const container = document.getElementById('hz-mitglieder-liste');
    if (!container) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema || !thema.mitglieder || thema.mitglieder.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Keine Mitglieder vorhanden</p>';
        return;
    }
    
    container.innerHTML = thema.mitglieder.map((mitglied, index) => {
        // Vollen Namen ermitteln (aus USERS oder direkt aus mitglied.name) mit Null-Check
        const userObj = (USERS && typeof USERS === 'object' && Object.keys(USERS).length > 0)
            ? Object.values(USERS).find(u => u.id === mitglied.userId || u.name === mitglied.userId || u.name === mitglied.name)
            : null;
        const displayName = userObj?.realName || mitglied.name || mitglied.userId || 'Unbekannt';
        const isCurrentUser = mitglied.userId === currentUser.displayName || mitglied.userId === currentUser.mode;
        
        return `
        <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 ${isCurrentUser ? 'border-cyan-400 bg-cyan-50' : ''}">
            <div class="flex items-center gap-2">
                <span class="font-bold text-gray-800">${displayName}</span>
                ${isCurrentUser ? '<span class="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">Du</span>' : ''}
                <span class="text-xs ${ZUGRIFFSRECHTE[mitglied.zugriffsrecht]?.icon ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 rounded">
                    ${ZUGRIFFSRECHTE[mitglied.zugriffsrecht]?.label || mitglied.zugriffsrecht}
                </span>
            </div>
            <div class="flex gap-1">
                <button onclick="window.openDauerauftraegeModal('${mitglied.userId || mitglied.name}')" class="p-1 text-blue-600 hover:bg-blue-100 rounded" title="Daueraufträge">
                    💳
                </button>
                ${thema.ersteller === currentUser.displayName && mitglied.userId !== currentUser.displayName && mitglied.userId !== thema.ersteller ? `
                    <button onclick="window.removeMitglied(${index})" class="p-1 text-red-600 hover:bg-red-100 rounded" title="Entfernen">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

// renderKostenaufteilung wurde entfernt - Kostenaufteilung erfolgt jetzt individuell pro Eintrag
// Die Funktion wird nicht mehr benötigt, da die Aufteilung direkt im Eintrag-Modal definiert wird

async function saveNewThema() {
    const nameInput = document.getElementById('hz-thema-name');
    const name = nameInput?.value?.trim();
    
    if (!name) {
        alertUser('Bitte gib einen Namen ein', 'error');
        return;
    }
    
    // Vollen Namen des aktuellen Benutzers ermitteln mit Null-Check
    const currentUserObj = USERS && typeof USERS === 'object'
        ? Object.values(USERS).find(u => u.id === currentUser.mode || u.name === currentUser.displayName)
        : null;
    const fullName = currentUserObj?.realName || currentUser.displayName;
    
    try {
        const newThema = {
            name,
            ersteller: currentUser.displayName,
            erstelltAm: serverTimestamp(),
            mitglieder: [{
                userId: currentUser.displayName,
                name: fullName, // Voller Name statt displayName
                zugriffsrecht: 'vollzugriff',
                anteil: 100,
                dauerauftraege: {
                    monatlich: 0,
                    januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
                    juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
                }
            }]
        };
        
        const docRef = await addDoc(haushaltszahlungenThemenRef, newThema);
        THEMEN[docRef.id] = { id: docRef.id, ...newThema };
        
        nameInput.value = '';
        document.getElementById('hz-add-thema-modal').style.display = 'none';
        renderThemenListe();
        renderThemenDropdown();
        alertUser('Thema erstellt!', 'success');
    } catch (error) {
        console.error("Fehler beim Erstellen des Themas:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
}

function openAddMitgliedModal() {
    const userSelect = document.getElementById('hz-mitglied-user-select');
    const thema = THEMEN[currentThemaId];
    
    if (userSelect) {
        const existingMemberIds = thema?.mitglieder?.map(m => m.userId || m.name) || [];
        
        // Prüfe ob der eigene Benutzer bereits Mitglied ist
        const currentUserIsMember = existingMemberIds.includes(currentUser.displayName) || 
                                     existingMemberIds.includes(currentUser.mode);
        
        const availableUsers = (USERS && typeof USERS === 'object')
            ? Object.values(USERS).filter(user => {
                // Nur aktive, registrierte Benutzer
                if (!user.isActive || user.permissionType === 'not_registered') return false;
                // Nicht bereits Mitglieder
                if (existingMemberIds.includes(user.id) || existingMemberIds.includes(user.name)) return false;
                return true;
            })
            : [];
        
        // Wenn der eigene Benutzer fehlt, füge ihn zur Liste hinzu (an erster Stelle)
        let options = '<option value="">Benutzer wählen...</option>';
        
        if (!currentUserIsMember) {
            const currentUserObj = USERS && typeof USERS === 'object'
                ? Object.values(USERS).find(u => u.id === currentUser.mode || u.name === currentUser.displayName)
                : null;
            const currentDisplayName = currentUserObj?.realName || currentUser.displayName;
            options += `<option value="${currentUser.displayName}" class="font-bold">${currentDisplayName} (Du selbst)</option>`;
        }
        
        options += availableUsers.map(user => {
            const displayName = user.realName || user.name || user.displayName || user.id;
            const id = user.id || user.name;
            return `<option value="${id}">${displayName}</option>`;
        }).join('');
        
        userSelect.innerHTML = options;
    }
    document.getElementById('hz-add-mitglied-modal').style.display = 'flex';
}

async function saveNewMitglied() {
    const userSelect = document.getElementById('hz-mitglied-user-select');
    const rechtSelect = document.getElementById('hz-mitglied-recht-select');
    
    const userId = userSelect?.value;
    let recht = rechtSelect?.value || 'lesen';
    
    if (!userId) {
        alertUser('Bitte wähle einen Benutzer', 'error');
        return;
    }
    
    const thema = THEMEN[currentThemaId];
    if (!thema) return;
    
    // Finde den Benutzer für den Namen mit Null-Check
    const targetUser = USERS && typeof USERS === 'object'
        ? Object.values(USERS).find(u => u.id === userId || u.name === userId)
        : null;
    const userName = targetUser?.realName || targetUser?.name || userId;
    
    // Prüfe ob es der eigene Benutzer ist - dann immer Vollzugriff
    const isCurrentUser = userId === currentUser.displayName || userId === currentUser.mode;
    if (isCurrentUser) {
        recht = 'vollzugriff'; // Eigener Benutzer hat immer Vollzugriff
    }
    
    // Prüfe ob Benutzer bereits Mitglied ist
    if (thema.mitglieder?.some(m => m.userId === userId || m.name === userName)) {
        alertUser('Benutzer ist bereits Mitglied', 'error');
        return;
    }
    
    // Für andere Benutzer: Prüfe Einladungsstatus
    if (!isCurrentUser) {
        // Prüfe ob eine abgelehnte Einladung existiert
        const rejectedInvite = Object.values(EINLADUNGEN).find(e => 
            e.themaId === currentThemaId && 
            e.targetUserId === userId && 
            e.status === 'rejected'
        );
        if (rejectedInvite) {
            alertUser('Dieser Benutzer hat die Einladung abgelehnt. Er muss die Ablehnung erst widerrufen.', 'error');
            return;
        }
        
        // Prüfe ob bereits eine ausstehende Einladung existiert
        const pendingInvite = Object.values(EINLADUNGEN).find(e => 
            e.themaId === currentThemaId && 
            e.targetUserId === userId && 
            e.status === 'pending'
        );
        if (pendingInvite) {
            alertUser('Es existiert bereits eine ausstehende Einladung für diesen Benutzer.', 'error');
            return;
        }
    }
    
    try {
        const zugriffsrecht = ZUGRIFFSRECHTE[recht];
        
        // Eigener Benutzer oder "Nicht teilen" -> direkt hinzufügen ohne Einladung
        if (isCurrentUser || !zugriffsrecht?.isShared) {
            const newMitglied = {
                userId: userId,
                name: userName,
                zugriffsrecht: recht,
                // Kein anteil mehr - wird individuell pro Eintrag festgelegt
                dauerauftraege: {
                    monatlich: 0,
                    januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
                    juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
                }
            };
            
            thema.mitglieder = thema.mitglieder || [];
            thema.mitglieder.push(newMitglied);
            
            await updateDoc(doc(haushaltszahlungenThemenRef, currentThemaId), {
                mitglieder: thema.mitglieder
            });
            
            document.getElementById('hz-add-mitglied-modal').style.display = 'none';
            renderMitgliederListe();
            // renderKostenaufteilung() entfernt - nicht mehr nötig
            renderDashboard();
            alertUser(isCurrentUser ? 'Du wurdest wieder hinzugefügt!' : 'Mitglied hinzugefügt (ohne Einladung)!', 'success');
        } else {
            // Einladung senden
            const einladung = {
                themaId: currentThemaId,
                themaName: thema.name,
                targetUserId: userId,
                targetUserName: userName,
                invitedBy: currentUser.displayName,
                invitedById: currentUser.mode,
                zugriffsrecht: recht,
                // anteil wurde entfernt - wird individuell pro Eintrag festgelegt
                status: 'pending',
                createdAt: serverTimestamp()
            };
            
            await addDoc(haushaltszahlungenEinladungenRef, einladung);
            
            document.getElementById('hz-add-mitglied-modal').style.display = 'none';
            alertUser(`Einladung an ${userName} gesendet!`, 'success');
        }
    } catch (error) {
        console.error("Fehler beim Hinzufügen des Mitglieds:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
}

let currentDauerauftraegeMitglied = null;

function openDauerauftraegeModal(userId) {
    console.log("🔷 openDauerauftraegeModal aufgerufen für userId:", userId);
    
    const thema = THEMEN[currentThemaId];
    if (!thema) {
        console.error("❌ Kein Thema gefunden");
        return;
    }
    
    const mitglied = thema.mitglieder?.find(m => m.userId === userId || m.name === userId);
    if (!mitglied) {
        console.error("❌ Kein Mitglied gefunden für userId:", userId);
        return;
    }
    
    currentDauerauftraegeMitglied = mitglied;
    console.log("✅ Mitglied gesetzt:", mitglied);
    
    const content = document.getElementById('hz-dauerauftraege-content');
    if (!content) {
        console.error("❌ Content-Element nicht gefunden");
        return;
    }
    
    const intervalle = ['monatlich', 'januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
    
    content.innerHTML = `
        <p class="font-bold text-gray-700 mb-3">Daueraufträge für: ${mitglied.name}</p>
        ${intervalle.map(intervall => `
            <div class="flex items-center gap-3 justify-between">
                <span class="text-sm font-medium text-gray-600 text-left" style="min-width: 80px;">${INTERVALL_CONFIG[intervall]?.label || intervall}</span>
                <div class="flex items-center gap-2">
                    <input type="number" step="0.01" min="0" value="${mitglied.dauerauftraege?.[intervall] || 0}" 
                        data-intervall="${intervall}"
                        class="hz-dauerauftrag-input w-28 p-2 border-2 border-gray-300 rounded-lg text-right font-bold"
                        style="max-width: 120px;">
                    <span class="text-gray-500">€</span>
                </div>
            </div>
        `).join('')}
    `;
    
    // EVENT LISTENER DIREKT HIER REGISTRIEREN!
    // Problem: setupSettingsEventListeners() wird nur in openSettingsModal() aufgerufen,
    // aber openDauerauftraegeModal() kann auch direkt aufgerufen werden
    const saveDauerauftraegeBtn = document.getElementById('hz-save-dauerauftraege-btn');
    if (saveDauerauftraegeBtn) {
        // Entferne alte Listener falls vorhanden
        const newBtn = saveDauerauftraegeBtn.cloneNode(true);
        saveDauerauftraegeBtn.parentNode.replaceChild(newBtn, saveDauerauftraegeBtn);
        
        newBtn.addEventListener('click', () => {
            console.log("💾 Speichern-Button geklickt!");
            saveDauerauftraege();
        });
        console.log("✅ Event Listener für Speichern-Button registriert");
    } else {
        console.error("❌ Speichern-Button nicht gefunden!");
    }
    
    const showProtokollBtn = document.getElementById('hz-show-protokoll-btn');
    if (showProtokollBtn) {
        // Entferne alte Listener falls vorhanden
        const newBtn = showProtokollBtn.cloneNode(true);
        showProtokollBtn.parentNode.replaceChild(newBtn, showProtokollBtn);
        
        newBtn.addEventListener('click', () => {
            console.log("📋 Protokoll-Button geklickt!");
            toggleProtokoll();
        });
        console.log("✅ Event Listener für Protokoll-Button registriert");
    } else {
        console.error("❌ Protokoll-Button nicht gefunden!");
    }
    
    document.getElementById('hz-dauerauftraege-modal').style.display = 'flex';
    loadProtokoll(userId);
}

async function saveDauerauftraege() {
    console.log("💾 saveDauerauftraege aufgerufen");
    console.log("  - currentDauerauftraegeMitglied:", currentDauerauftraegeMitglied);
    console.log("  - currentThemaId:", currentThemaId);
    
    if (!currentDauerauftraegeMitglied) {
        console.error("❌ Kein Mitglied ausgewählt");
        alertUser('Fehler: Kein Mitglied ausgewählt', 'error');
        return;
    }
    
    const thema = THEMEN[currentThemaId];
    if (!thema) {
        console.error("❌ Kein Thema gefunden für ID:", currentThemaId);
        alertUser('Fehler: Kein Thema gefunden', 'error');
        return;
    }
    
    const inputs = document.querySelectorAll('.hz-dauerauftrag-input');
    console.log("  - Gefundene Inputs:", inputs.length);
    
    const newDauerauftraege = {};
    const changes = [];
    
    inputs.forEach(input => {
        const intervall = input.dataset.intervall;
        const newValue = parseFloat(input.value) || 0;
        const oldValue = currentDauerauftraegeMitglied.dauerauftraege?.[intervall] || 0;
        
        newDauerauftraege[intervall] = newValue;
        
        if (newValue !== oldValue) {
            changes.push({
                intervall,
                oldValue,
                newValue,
                timestamp: new Date().toISOString(),
                user: currentUser.displayName
            });
        }
    });
    
    console.log("  - Neue Daueraufträge:", newDauerauftraege);
    console.log("  - Änderungen:", changes);
    
    try {
        // Update Mitglied
        const mitgliedIndex = thema.mitglieder.findIndex(m => 
            m.name === currentDauerauftraegeMitglied.name || 
            m.userId === currentDauerauftraegeMitglied.userId
        );
        
        console.log("  - Mitglied Index:", mitgliedIndex);
        
        if (mitgliedIndex >= 0) {
            thema.mitglieder[mitgliedIndex].dauerauftraege = newDauerauftraege;
            
            console.log("  - Speichere in Firebase...");
            await updateDoc(doc(haushaltszahlungenThemenRef, currentThemaId), {
                mitglieder: thema.mitglieder
            });
            console.log("  ✅ Thema aktualisiert");
            
            // Protokoll speichern (optional, Fehler ignorieren)
            if (changes.length > 0) {
                try {
                    await addDoc(haushaltszahlungenProtokollRef, {
                        themaId: currentThemaId,
                        mitgliedName: currentDauerauftraegeMitglied.name,
                        mitgliedUserId: currentDauerauftraegeMitglied.userId,
                        changes,
                        timestamp: serverTimestamp(),
                        changedBy: currentUser.displayName
                    });
                    console.log("  ✅ Protokoll gespeichert");
                } catch (protokollError) {
                    console.warn("⚠️ Protokoll konnte nicht gespeichert werden:", protokollError);
                }
            }
            
            // Update lokales Objekt
            THEMEN[currentThemaId] = thema;
        } else {
            console.error("❌ Mitglied nicht gefunden in Thema");
            alertUser('Fehler: Mitglied nicht gefunden', 'error');
            return;
        }
        
        document.getElementById('hz-dauerauftraege-modal').style.display = 'none';
        currentDauerauftraegeMitglied = null;
        renderDashboard();
        alertUser('Daueraufträge gespeichert!', 'success');
    } catch (error) {
        console.error("❌ Fehler beim Speichern:", error);
        alertUser('Fehler beim Speichern: ' + (error.message || error), 'error');
    }
}

async function loadProtokoll(userId) {
    const container = document.getElementById('hz-protokoll-liste');
    if (!container) return;
    
    try {
        const q = query(
            haushaltszahlungenProtokollRef,
            orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        
        const protokolle = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Prüfe sowohl mitgliedName als auch mitgliedUserId für Kompatibilität
            if (data.themaId === currentThemaId && 
                (data.mitgliedName === userId || data.mitgliedUserId === userId || data.mitgliedName === currentDauerauftraegeMitglied?.name)) {
                protokolle.push(data);
            }
        });
        
        if (protokolle.length === 0) {
            container.innerHTML = '<p class="text-gray-500 italic text-sm">Keine Änderungen protokolliert</p>';
            return;
        }
        
        container.innerHTML = protokolle.slice(0, 20).map(p => `
            <div class="p-2 bg-gray-50 rounded">
                <p class="font-bold text-gray-700">${formatDate(p.timestamp?.toDate?.() || p.timestamp)} - ${p.changedBy}</p>
                ${p.changes.map(c => `
                    <p class="text-gray-600">${INTERVALL_CONFIG[c.intervall]?.label}: ${formatCurrency(c.oldValue)} → ${formatCurrency(c.newValue)}</p>
                `).join('')}
            </div>
        `).join('');
    } catch (error) {
        console.error("Fehler beim Laden des Protokolls:", error);
    }
}

function toggleProtokoll() {
    const container = document.getElementById('hz-dauerauftraege-protokoll');
    if (container) {
        container.classList.toggle('hidden');
    }
}

async function saveSettings() {
    // Speichere Thema-Änderungen
    const thema = THEMEN[currentThemaId];
    if (thema) {
        try {
            await updateDoc(doc(haushaltszahlungenThemenRef, currentThemaId), {
                mitglieder: thema.mitglieder
            });
            alertUser('Einstellungen gespeichert!', 'success');
            document.getElementById('haushaltszahlungenSettingsModal').style.display = 'none';
            renderDashboard();
        } catch (error) {
            console.error("Fehler beim Speichern:", error);
            alertUser('Fehler: ' + error.message, 'error');
        }
    }
}

// Funktion: Erlaubt nur gültige Zeichen für Betragseingabe (inkl. Minus!)
window.allowNumberInput = function(event) {
    const char = event.key;
    const currentValue = event.target.value;
    
    // Erlaubte Zeichen: 0-9, Punkt, Komma, Minus
    const isNumber = /[0-9]/.test(char);
    const isDot = char === '.';
    const isComma = char === ',';
    const isMinus = char === '-';
    
    // Minus nur am Anfang erlauben (wenn Feld leer ist oder Cursor ganz vorne)
    if (isMinus) {
        const cursorPosition = event.target.selectionStart;
        // Minus nur am Anfang erlauben, wenn noch kein Minus vorhanden ist
        if (cursorPosition === 0 && !currentValue.includes('-')) {
            return true; // Minus am Anfang erlauben
        }
        return false; // Minus an anderer Stelle blockieren
    }
    
    // Punkt/Komma nur einmal erlauben
    if (isDot || isComma) {
        if (currentValue.includes('.') || currentValue.includes(',')) {
            return false;
        }
        return true;
    }
    
    // Zahlen immer erlauben
    if (isNumber) {
        return true;
    }
    
    // Spezielle Tasten erlauben (Backspace, Delete, Pfeiltasten, etc.)
    if (event.ctrlKey || event.metaKey || 
        char === 'Backspace' || char === 'Delete' || 
        char === 'ArrowLeft' || char === 'ArrowRight' ||
        char === 'Tab' || char === 'Enter') {
        return true;
    }
    
    // Alle anderen Zeichen blockieren
    return false;
};

// Funktion zum Aktualisieren des Betrag-Hinweises
window.updateBetragHinweis = function(input) {
    const hinweis = document.getElementById('hz-betrag-hinweis');
    if (!hinweis) return;
    
    // Komma durch Punkt ersetzen für parseFloat
    let value = input.value.trim().replace(',', '.');
    input.value = value; // Aktualisiere Feld mit Punkt statt Komma
    
    const numValue = parseFloat(value);
    
    // Zeige Hinweis nur wenn Feld komplett leer ist
    if (value === '' || value === '-') {
        hinweis.classList.remove('hidden');
        hinweis.className = 'mt-2 p-2 bg-yellow-50 border border-yellow-300 rounded text-xs text-yellow-800';
        hinweis.innerHTML = '⚠️ Betrag noch unbekannt? Für Gratis-Monate gib bitte 0 ein. Lass das Feld nur leer, wenn der Betrag wirklich noch unbekannt ist.';
    } else if (numValue < 0) {
        // Zeige Info bei Gutschrift
        hinweis.classList.remove('hidden');
        hinweis.className = 'mt-2 p-2 bg-green-50 border-l-4 border-green-400 text-green-800 text-xs';
        hinweis.innerHTML = '💰 Gutschrift erkannt! Negative Beträge werden als Guthaben/Rückzahlung behandelt.';
    } else {
        hinweis.classList.add('hidden');
    }
};

// Globale Funktionen für Daueraufträge und Protokoll
window.saveDauerauftraege = saveDauerauftraege;
window.toggleProtokoll = toggleProtokoll;
window.saveSettings = saveSettings;
window.closeDauerauftraegeModal = function() {
    const modal = document.getElementById('hz-dauerauftraege-modal');
    if (modal) modal.style.display = 'none';
    currentDauerauftraegeMitglied = null;
};
window.openThemaSettings = function() {
    openSettingsModal();
};
window.closeSettingsModal = function() {
    const modal = document.getElementById('haushaltszahlungenSettingsModal');
    if (modal) modal.style.display = 'none';
};
window.closeAddThemaModal = function() {
    const modal = document.getElementById('hz-add-thema-modal');
    if (modal) modal.style.display = 'none';
};
window.closeAddMitgliedModal = function() {
    const modal = document.getElementById('hz-add-mitglied-modal');
    if (modal) modal.style.display = 'none';
};
window.closeAlarmeModal = function() {
    const modal = document.getElementById('hz-alarme-modal');
    if (modal) modal.style.display = 'none';
};
window.closeEinladungenModal = function() {
    const modal = document.getElementById('hz-einladungen-modal');
    if (modal) modal.style.display = 'none';
};

// Globale Funktionen für Einstellungen
window.archiveThema = async function(themaId) {
    // Prüfe ob es das aktuell aktive Thema ist
    if (currentThemaId === themaId) {
        const activeThemen = Object.values(THEMEN).filter(t => !t.archiviert && t.id !== themaId);
        if (activeThemen.length === 0) {
            alertUser('Das aktive Thema kann nicht archiviert werden, wenn es das einzige ist. Bitte erstelle zuerst ein neues Thema.', 'error');
            return;
        }
        alertUser('Bitte wähle zuerst ein anderes Thema aus, bevor du dieses archivierst.', 'error');
        return;
    }
    
    if (!confirm('Möchtest du dieses Thema archivieren? Es kann später wiederhergestellt werden.')) return;
    
    try {
        await updateDoc(doc(haushaltszahlungenThemenRef, themaId), {
            archiviert: true,
            archiviertAm: serverTimestamp(),
            archiviertVon: currentUser.displayName
        });
        
        THEMEN[themaId].archiviert = true;
        
        renderThemenListe();
        renderThemenDropdown();
        alertUser('Thema erfolgreich archiviert!', 'success');
    } catch (error) {
        console.error("Fehler beim Archivieren:", error);
        alertUser('Fehler beim Archivieren: ' + error.message, 'error');
    }
};

window.restoreThema = async function(themaId) {
    if (!confirm('Möchtest du dieses Thema wiederherstellen?')) return;
    
    try {
        await updateDoc(doc(haushaltszahlungenThemenRef, themaId), {
            archiviert: false,
            wiederhergestelltAm: serverTimestamp(),
            wiederhergestelltVon: currentUser.displayName
        });
        
        THEMEN[themaId].archiviert = false;
        
        renderThemenListe();
        renderThemenDropdown();
        alertUser('Thema wiederhergestellt!', 'success');
    } catch (error) {
        console.error("Fehler beim Wiederherstellen:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
};

window.removeMitglied = async function(index) {
    if (!confirm('Möchtest du dieses Mitglied wirklich entfernen?')) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema) return;
    
    try {
        thema.mitglieder.splice(index, 1);
        await updateDoc(doc(haushaltszahlungenThemenRef, currentThemaId), {
            mitglieder: thema.mitglieder
        });
        
        renderMitgliederListe();
        // renderKostenaufteilung() entfernt - nicht mehr nötig
        renderDashboard();
        alertUser('Mitglied entfernt!', 'success');
    } catch (error) {
        console.error("Fehler:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
};

// window.updateMitgliedAnteil wurde entfernt - Kostenaufteilung erfolgt jetzt individuell pro Eintrag

window.openDauerauftraegeModal = openDauerauftraegeModal;
window.toggleMitgliedDetails = toggleMitgliedDetails;

// ========================================
// HILFSFUNKTIONEN
// ========================================
function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('de-DE');
    } catch {
        return dateStr;
    }
}

// ========================================
// GLOBALE FUNKTIONEN FÜR ONCLICK
// ========================================
window.editHaushaltszahlung = function(id) {
    const eintrag = HAUSHALTSZAHLUNGEN[id];
    if (eintrag) {
        openEditModal(eintrag);
    }
};

window.removeHaushaltszahlungFilterById = removeHaushaltszahlungFilterById;

window.deleteHaushaltszahlung = deleteHaushaltszahlung;

// ========================================
// EINLADUNGS-SYSTEM
// ========================================
window.openEinladungenModal = function() {
    const modal = document.getElementById('hz-einladungen-modal');
    if (!modal) return;
    
    renderEinladungenListe();
    modal.style.display = 'flex';
};

function renderEinladungenListe() {
    const container = document.getElementById('hz-einladungen-liste');
    if (!container) return;
    
    const pendingEinladungen = Object.values(EINLADUNGEN).filter(e => e.status === 'pending');
    const rejectedEinladungen = Object.values(EINLADUNGEN).filter(e => e.status === 'rejected');
    
    if (pendingEinladungen.length === 0 && rejectedEinladungen.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Keine Einladungen vorhanden</p>';
        return;
    }
    
    let html = '';
    
    // Ausstehende Einladungen
    if (pendingEinladungen.length > 0) {
        html += '<p class="font-bold text-gray-700 mb-2">📬 Ausstehende Einladungen</p>';
        html += pendingEinladungen.map(e => `
            <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-2">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-gray-800">${e.themaName}</p>
                        <p class="text-sm text-gray-600">Eingeladen von: ${e.invitedBy}</p>
                        <p class="text-sm text-gray-600">Berechtigung: ${ZUGRIFFSRECHTE[e.zugriffsrecht]?.label || e.zugriffsrecht}</p>
                        <p class="text-sm text-gray-600">Kostenanteil: ${e.anteil}%</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.respondToEinladung('${e.id}', 'accepted')" 
                            class="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm">
                            ✓ Annehmen
                        </button>
                        <button onclick="window.respondToEinladung('${e.id}', 'rejected')" 
                            class="px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm">
                            ✗ Ablehnen
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // Abgelehnte Einladungen
    if (rejectedEinladungen.length > 0) {
        html += '<p class="font-bold text-gray-700 mb-2 mt-4">🚫 Abgelehnte Einladungen</p>';
        html += '<p class="text-xs text-gray-500 mb-2">Solange eine Ablehnung besteht, kann der Einladende keine neue Anfrage stellen.</p>';
        html += rejectedEinladungen.map(e => `
            <div class="p-3 bg-red-50 border border-red-200 rounded-lg mb-2 opacity-70">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-gray-600">${e.themaName}</p>
                        <p class="text-sm text-gray-500">Eingeladen von: ${e.invitedBy}</p>
                    </div>
                    <button onclick="window.revokeRejection('${e.id}')" 
                        class="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm">
                        ↩ Ablehnung zurückrufen
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    container.innerHTML = html;
}

window.respondToEinladung = async function(einladungId, response) {
    const einladung = EINLADUNGEN[einladungId];
    if (!einladung) return;
    
    try {
        if (response === 'accepted') {
            // Einladung annehmen: Mitglied zum Thema hinzufügen
            const thema = THEMEN[einladung.themaId];
            if (thema) {
                // Konsistente Verwendung von userId und Name
                const userId = currentUser.mode || currentUser.displayName;
                const userName = USERS && typeof USERS === 'object'
                    ? (Object.values(USERS).find(u => u.id === userId || u.name === currentUser.displayName)?.realName || currentUser.displayName)
                    : currentUser.displayName;
                
                const newMitglied = {
                    userId: userId,
                    name: userName,
                    zugriffsrecht: einladung.zugriffsrecht,
                    anteil: einladung.anteil,
                    dauerauftraege: {
                        monatlich: 0,
                        januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
                        juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
                    }
                };
                
                thema.mitglieder = thema.mitglieder || [];
                thema.mitglieder.push(newMitglied);
                
                await updateDoc(doc(haushaltszahlungenThemenRef, einladung.themaId), {
                    mitglieder: thema.mitglieder
                });
            }
            
            // Einladung löschen
            await deleteDoc(doc(haushaltszahlungenEinladungenRef, einladungId));
            delete EINLADUNGEN[einladungId];
            
            alertUser('Einladung angenommen! Du bist jetzt Mitglied.', 'success');
            loadThemen(); // Themen neu laden
        } else {
            // Einladung ablehnen
            await updateDoc(doc(haushaltszahlungenEinladungenRef, einladungId), {
                status: 'rejected',
                rejectedAt: serverTimestamp()
            });
            EINLADUNGEN[einladungId].status = 'rejected';
            
            alertUser('Einladung abgelehnt.', 'success');
        }
        
        renderEinladungenListe();
        renderEinladungenBadge();
    } catch (error) {
        console.error("Fehler bei Einladungs-Antwort:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
};

window.revokeRejection = async function(einladungId) {
    if (!confirm('Möchtest du die Ablehnung widerrufen? Der Einladende kann dann erneut eine Anfrage stellen.')) return;
    
    try {
        // Einladung komplett löschen
        await deleteDoc(doc(haushaltszahlungenEinladungenRef, einladungId));
        delete EINLADUNGEN[einladungId];
        
        renderEinladungenListe();
        renderEinladungenBadge();
        alertUser('Ablehnung widerrufen.', 'success');
    } catch (error) {
        console.error("Fehler beim Widerrufen:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
};

// ========================================
// ABTAUSCH-FUNKTION
// ========================================
let currentAbtauschEintragId = null;

window.openAbtauschModal = function(eintragId) {
    const eintrag = HAUSHALTSZAHLUNGEN[eintragId];
    if (!eintrag) {
        alertUser('Eintrag nicht gefunden', 'error');
        return;
    }
    
    currentAbtauschEintragId = eintragId;
    
    const modal = document.getElementById('hz-abtausch-modal');
    if (!modal) return;
    
    // Aktuelles Datum als Standardwert für neuen Beginn
    const heute = new Date();
    const morgen = new Date(heute);
    morgen.setDate(morgen.getDate() + 1);
    
    // Felder befüllen
    document.getElementById('hz-abtausch-neuer-beginn').value = morgen.toISOString().split('T')[0];
    
    // Vorheriges Ende berechnen (Tag vor neuem Beginn)
    updateAbtauschEnde();
    
    // Vorherige Werte übernehmen
    document.getElementById('hz-abtausch-zweck').value = eintrag.zweck || '';
    document.getElementById('hz-abtausch-organisation').value = eintrag.organisation || '';
    document.getElementById('hz-abtausch-betrag').value = eintrag.betrag || '';
    document.getElementById('hz-abtausch-anteil').value = eintrag.anteilMarkus || 50;
    document.getElementById('hz-abtausch-kundennummer').value = eintrag.kundennummer || '';
    document.getElementById('hz-abtausch-vertragsnummer').value = eintrag.vertragsnummer || '';
    
    // Intervall-Checkboxen setzen
    document.querySelectorAll('.hz-abtausch-intervall').forEach(cb => {
        cb.checked = (eintrag.intervall || []).includes(cb.value);
    });
    
    // Anzeige der alten Werte
    document.getElementById('hz-abtausch-alter-zweck').textContent = eintrag.zweck || '-';
    document.getElementById('hz-abtausch-alter-betrag').textContent = formatCurrency(eintrag.betrag);
    document.getElementById('hz-abtausch-alter-gueltig').textContent = `${formatDate(eintrag.gueltigAb)} - ${formatDate(eintrag.gueltigBis)}`;
    
    modal.style.display = 'flex';
};

function updateAbtauschEnde() {
    const neuerBeginn = document.getElementById('hz-abtausch-neuer-beginn').value;
    if (neuerBeginn) {
        const neuerBeginnDate = new Date(neuerBeginn);
        neuerBeginnDate.setDate(neuerBeginnDate.getDate() - 1);
        document.getElementById('hz-abtausch-altes-ende').value = neuerBeginnDate.toISOString().split('T')[0];
    }
}

// Event-Listener für Abtausch-Datum wurde in den Haupt-DOMContentLoaded-Block verschoben
// (siehe Ende der Datei)

window.closeAbtauschModal = function() {
    const modal = document.getElementById('hz-abtausch-modal');
    if (modal) modal.style.display = 'none';
    currentAbtauschEintragId = null;
};

window.saveAbtausch = async function() {
    if (!currentAbtauschEintragId) return;
    
    const alterEintrag = HAUSHALTSZAHLUNGEN[currentAbtauschEintragId];
    if (!alterEintrag) return;
    
    const neuerBeginn = document.getElementById('hz-abtausch-neuer-beginn').value;
    const altesEnde = document.getElementById('hz-abtausch-altes-ende').value;
    const neuerBetrag = parseFloat(document.getElementById('hz-abtausch-betrag').value) || 0;
    const neuerZweck = document.getElementById('hz-abtausch-zweck').value;
    const neueOrganisation = document.getElementById('hz-abtausch-organisation').value;
    const neuerAnteil = parseInt(document.getElementById('hz-abtausch-anteil').value) || 50;
    const neueKundennummer = document.getElementById('hz-abtausch-kundennummer').value;
    const neueVertragsnummer = document.getElementById('hz-abtausch-vertragsnummer').value;
    
    // Intervalle sammeln
    const neueIntervalle = [];
    document.querySelectorAll('.hz-abtausch-intervall:checked').forEach(cb => {
        neueIntervalle.push(cb.value);
    });
    
    if (!neuerBeginn || !altesEnde) {
        alertUser('Bitte alle Datumsfelder ausfüllen', 'error');
        return;
    }
    
    try {
        // 1. Alten Eintrag beenden (gueltigBis auf altesEnde setzen)
        await updateDoc(doc(haushaltszahlungenCollection, currentAbtauschEintragId), {
            gueltigBis: altesEnde,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser?.displayName || 'System'
        });
        
        // 2. Neuen Eintrag erstellen
        const neuerEintrag = {
            zweck: neuerZweck,
            organisation: neueOrganisation,
            betrag: neuerBetrag,
            gueltigAb: neuerBeginn,
            gueltigBis: alterEintrag.gueltigBis, // Übernimmt das ursprüngliche Ende
            anteilMarkus: neuerAnteil,
            intervall: neueIntervalle,
            kundennummer: neueKundennummer,
            vertragsnummer: neueVertragsnummer,
            vormerk: alterEintrag.vormerk || '',
            erinnerung: alterEintrag.erinnerung || '',
            notizen: `Abtausch von Eintrag vom ${formatDate(alterEintrag.gueltigAb)}. Alter Betrag: ${formatCurrency(alterEintrag.betrag)}`,
            createdAt: serverTimestamp(),
            createdBy: currentUser?.displayName || 'System',
            updatedAt: serverTimestamp(),
            updatedBy: currentUser?.displayName || 'System',
            abtauschVon: currentAbtauschEintragId // Referenz zum alten Eintrag
        };
        
        await addDoc(haushaltszahlungenCollection, neuerEintrag);
        
        alertUser('Abtausch erfolgreich! Alter Eintrag beendet, neuer Eintrag erstellt.', 'success');
        window.closeAbtauschModal();
        
    } catch (error) {
        console.error("Fehler beim Abtausch:", error);
        alertUser('Fehler beim Abtausch: ' + error.message, 'error');
    }
};

// ========================================
// INTERVALL-FILTER FUNKTIONEN
// ========================================

// Intervall-Filter aktualisieren (Mehrfachauswahl)
function updateIntervallFilter() {
    const checked = [];
    document.querySelectorAll('.hz-intervall-filter-cb:checked').forEach(cb => {
        checked.push(cb.value);
    });
    currentFilter.intervalle = checked;
    updateIntervallFilterLabel();
}

// Label für Intervall-Filter aktualisieren
function updateIntervallFilterLabel() {
    const label = document.getElementById('hz-intervall-filter-label');
    if (!label) return;
    
    const checked = [];
    document.querySelectorAll('.hz-intervall-filter-cb:checked').forEach(cb => {
        checked.push(cb.value);
    });
    
    if (checked.length === 0) {
        label.textContent = 'Alle Intervalle';
    } else if (checked.length === 1) {
        const config = INTERVALL_CONFIG[checked[0]];
        label.textContent = config ? config.short : checked[0];
    } else {
        label.textContent = `${checked.length} ausgewählt`;
    }
}

// Abtausch-Intervall Checkbox-Logik (Monatlich vs. Einzelmonate)
function setupAbtauschIntervallLogic() {
    // Verhindere mehrfaches Anhängen von Event-Listenern
    const checkboxes = document.querySelectorAll('.hz-abtausch-intervall');
    
    checkboxes.forEach(cb => {
        // Prüfe ob Listener bereits angehängt wurde
        if (cb.dataset.abtauschLogicAttached) return;
        
        cb.addEventListener('change', function() {
            const isMonatlich = this.value === 'monatlich';
            const isChecked = this.checked;
            
            if (isMonatlich && isChecked) {
                // Monatlich ausgewählt -> Einzelmonate deaktivieren
                document.querySelectorAll('.hz-abtausch-intervall[data-type="einzelmonat"]').forEach(einzelCb => {
                    einzelCb.checked = false;
                    einzelCb.disabled = true;
                });
            } else if (isMonatlich && !isChecked) {
                // Monatlich abgewählt -> Einzelmonate aktivieren
                document.querySelectorAll('.hz-abtausch-intervall[data-type="einzelmonat"]').forEach(einzelCb => {
                    einzelCb.disabled = false;
                });
            } else if (!isMonatlich && isChecked) {
                // Einzelmonat ausgewählt -> Monatlich deaktivieren
                const monatlichCb = document.querySelector('.hz-abtausch-intervall[data-type="monatlich"]');
                if (monatlichCb) {
                    monatlichCb.checked = false;
                    monatlichCb.disabled = true;
                }
            } else if (!isMonatlich) {
                // Prüfen ob noch Einzelmonate ausgewählt sind
                const anyEinzelChecked = Array.from(document.querySelectorAll('.hz-abtausch-intervall[data-type="einzelmonat"]:checked')).length > 0;
                const monatlichCb = document.querySelector('.hz-abtausch-intervall[data-type="monatlich"]');
                if (monatlichCb) {
                    monatlichCb.disabled = anyEinzelChecked;
                }
            }
        });
        
        cb.dataset.abtauschLogicAttached = 'true';
    });
}

// Initialisierung beim DOMContentLoaded (nur einmal)
if (!window.hzDOMContentLoadedAttached) {
    document.addEventListener('DOMContentLoaded', () => {
        setupAbtauschIntervallLogic();
        
        // Standard-Filter: AKTIV (wie im HTML-Select voreingestellt)
        currentFilter.status = 'aktiv';
        
        // Event-Listener für Abtausch-Datum
        const neuerBeginnInput = document.getElementById('hz-abtausch-neuer-beginn');
        if (neuerBeginnInput && !neuerBeginnInput.dataset.listenerAttached) {
            neuerBeginnInput.addEventListener('change', updateAbtauschEnde);
            neuerBeginnInput.dataset.listenerAttached = 'true';
        }
    });
    window.hzDOMContentLoadedAttached = true;
}
