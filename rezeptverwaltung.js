// ========================================
// REZEPTVERWALTUNG - Rezeptsammlung
// ========================================

import {
    alertUser,
    db,
    currentUser,
    navigate,
    appId
} from './haupteingang.js';

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// Globale Variablen
let rezepteCollection = null;
let unsubscribeRezepte = null;
let REZEPTE = {};
let rezeptIdCounter = 0;
let activeRezeptFilters = [];
let rezeptSearchJoinMode = 'and';

const REZEPT_FILTER_LABELS = {
    all: 'Alles',
    titel: 'Titel',
    rezeptId: 'Rezept-ID',
    kategorie: 'Kategorie',
    arbeitszeit: 'Arbeitszeit',
    bewertung: 'Bewertung',
    typ: 'Typ',
    mappenNr: 'Mappen-Nr.',
    zutaten: 'Zutaten'
};

const REZEPT_SUGGESTION_ICONS = {
    all: '🔍',
    titel: '📝',
    rezeptId: '#️⃣',
    kategorie: '🏷️',
    arbeitszeit: '⏱️',
    bewertung: '⭐',
    typ: '📄',
    mappenNr: '🗂️',
    zutaten: '🥬'
};

// Temporäre Daten für Modal
let tempZutaten = [];
let tempSchritte = [];
let tempDokumente = [];
let aktuellePortionen = 4;
let originalPortionen = 4;
let aktuellesRezept = null;

// Kategorien-Konfiguration
const KATEGORIE_CONFIG = {
    vorspeise: { label: 'Vorspeise', icon: '🥗' },
    hauptgericht: { label: 'Hauptgericht', icon: '🍽️' },
    dessert: { label: 'Dessert', icon: '🍰' },
    getraenk: { label: 'Getränk', icon: '🥤' },
    snack: { label: 'Snack', icon: '🍿' },
    backen: { label: 'Backen', icon: '🥧' },
    suppe: { label: 'Suppe', icon: '🍲' },
    salat: { label: 'Salat', icon: '🥬' },
    sonstiges: { label: 'Sonstiges', icon: '📦' }
};

// Einheiten für Zutaten
const EINHEITEN = [
    { value: 'g', label: 'Gramm (g)', rundbar: true },
    { value: 'kg', label: 'Kilogramm (kg)', rundbar: true },
    { value: 'ml', label: 'Milliliter (ml)', rundbar: true },
    { value: 'l', label: 'Liter (l)', rundbar: true },
    { value: 'stueck', label: 'Stück', rundbar: false },
    { value: 'el', label: 'Esslöffel (EL)', rundbar: true },
    { value: 'tl', label: 'Teelöffel (TL)', rundbar: true },
    { value: 'prise', label: 'Prise', rundbar: false },
    { value: 'packung', label: 'Packung', rundbar: false },
    { value: 'dose', label: 'Dose', rundbar: false },
    { value: 'becher', label: 'Becher', rundbar: false },
    { value: 'tasse', label: 'Tasse', rundbar: true },
    { value: 'bund', label: 'Bund', rundbar: false },
    { value: 'scheibe', label: 'Scheibe(n)', rundbar: false },
    { value: 'zehe', label: 'Zehe(n)', rundbar: false }
];

// ========================================
// INITIALISIERUNG
// ========================================
export function initRezeptverwaltung() {
    console.log("=== Rezeptverwaltung wird initialisiert ===");
    
    // Collection initialisieren
    if (db) {
        rezepteCollection = collection(db, 'artifacts', appId, 'public', 'data', 'rezepte');
    }
    
    // Event Listeners einrichten
    setupEventListeners();
    
    // Firestore Listener starten
    listenForRezepte();
    
    console.log("=== Rezeptverwaltung Initialisierung abgeschlossen ===");
}

function listenForRezepte() {
    if (!rezepteCollection) {
        console.warn("Rezepte Collection nicht initialisiert");
        return;
    }
    
    if (unsubscribeRezepte) {
        unsubscribeRezepte();
    }
    
    // DATENSCHUTZ-FIX: Nur Rezepte laden, die vom aktuellen User erstellt wurden
    const q = query(rezepteCollection, orderBy('titel', 'asc'));
    
    unsubscribeRezepte = onSnapshot(q, (snapshot) => {
        REZEPTE = {};
        rezeptIdCounter = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // DATENSCHUTZ: Nur eigene Rezepte speichern
            // (erstellt von mir - prüfe sowohl displayName als auch mode)
            if (data.createdBy === currentUser?.displayName || data.createdBy === currentUser?.mode) {
                REZEPTE[doc.id] = { id: doc.id, ...data };
            }
            
            // Höchste Rezept-Nummer ermitteln (für alle, damit Nummern eindeutig bleiben)
            const rezeptNr = parseInt(data.rezeptNummer) || 0;
            if (rezeptNr > rezeptIdCounter) rezeptIdCounter = rezeptNr;
        });
        console.log(`🍳 ${Object.keys(REZEPTE).length} Rezepte geladen (nur eigene)`);
        renderRezepteListe();
        updateStatistics();
    }, (error) => {
        console.error("Fehler beim Laden der Rezepte:", error);
    });
}

function setupEventListeners() {
    console.log("Rezeptverwaltung: Event Listeners werden eingerichtet...");
    
    // Rezepte-Card Click (wird bereits in haupteingang.js gemacht)
    
    // Neues Rezept Buttons
    const btnNeuesRezept = document.getElementById('btn-neues-rezept');
    const btnErstesRezept = document.getElementById('btn-erstes-rezept');
    
    if (btnNeuesRezept) {
        btnNeuesRezept.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log("Neues Rezept Button geklickt");
            openCreateModal();
        });
        console.log("Event Listener für btn-neues-rezept hinzugefügt");
    } else {
        console.warn("btn-neues-rezept nicht gefunden!");
    }
    
    if (btnErstesRezept) {
        btnErstesRezept.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openCreateModal();
        });
    }
    
    // Modal schließen
    const closeRezeptModal = document.getElementById('closeRezeptModal');
    const cancelRezeptBtn = document.getElementById('cancelRezeptBtn');
    if (closeRezeptModal) closeRezeptModal.addEventListener('click', closeModal);
    if (cancelRezeptBtn) cancelRezeptBtn.addEventListener('click', closeModal);
    
    // Details Modal schließen
    const closeRezeptDetailsModal = document.getElementById('closeRezeptDetailsModal');
    if (closeRezeptDetailsModal) closeRezeptDetailsModal.addEventListener('click', closeDetailsModal);
    
    // Speichern
    const saveRezeptBtn = document.getElementById('saveRezeptBtn');
    if (saveRezeptBtn) saveRezeptBtn.addEventListener('click', saveRezept);
    
    // Rezept-Typ Auswahl
    document.querySelectorAll('.rezept-typ-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const value = option.dataset.value;
            document.querySelectorAll('.rezept-typ-option').forEach(opt => {
                opt.classList.remove('border-orange-500', 'bg-orange-50');
                opt.classList.add('border-gray-300');
            });
            option.classList.remove('border-gray-300');
            option.classList.add('border-orange-500', 'bg-orange-50');
            option.querySelector('input').checked = true;
            toggleRezeptTypSections(value);
        });
    });
    
    // Zutaten & Schritte hinzufügen
    const btnAddZutat = document.getElementById('btn-add-zutat');
    const btnAddSchritt = document.getElementById('btn-add-schritt');
    if (btnAddZutat) btnAddZutat.addEventListener('click', addZutat);
    if (btnAddSchritt) btnAddSchritt.addEventListener('click', addSchritt);
    
    // Bewertung Sterne
    document.querySelectorAll('.stern-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const wert = parseInt(btn.dataset.wert);
            document.getElementById('rezeptBewertung').value = wert;
            updateSterneAnzeige(wert);
        });
    });
    
    // Filterbereich Toggle
    const filterToggleBtn = document.getElementById('rz-toggle-filter-controls');
    if (filterToggleBtn && !filterToggleBtn.dataset.listenerAttached) {
        filterToggleBtn.addEventListener('click', () => {
            const wrapper = document.getElementById('rz-filter-controls-wrapper');
            const icon = document.getElementById('rz-toggle-filter-icon');
            if (!wrapper || !icon) return;
            wrapper.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
        filterToggleBtn.dataset.listenerAttached = 'true';
    }

    // Suche & Tag-Filter (harmonisiert)
    const searchInput = document.getElementById('rz-search-input');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            const term = String(e.target.value || '');
            if (!term.trim()) {
                hideRezeptSearchSuggestions();
                return;
            }
            updateRezeptSearchSuggestions(term);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addRezeptFilterFromUi();
            }
        });
        searchInput.addEventListener('focus', (e) => {
            const term = String(e.target.value || '').trim();
            if (term) updateRezeptSearchSuggestions(term);
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    if (!document.body.dataset.rzSuggestionsListenerAttached) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#rz-search-input') && !e.target.closest('#rz-search-suggestions-box')) {
                hideRezeptSearchSuggestions();
            }
        });
        document.body.dataset.rzSuggestionsListenerAttached = 'true';
    }

    const addFilterBtn = document.getElementById('rz-add-filter-btn');
    if (addFilterBtn && !addFilterBtn.dataset.listenerAttached) {
        addFilterBtn.addEventListener('click', addRezeptFilterFromUi);
        addFilterBtn.dataset.listenerAttached = 'true';
    }

    const joinModeSelect = document.getElementById('rz-search-join-mode');
    if (joinModeSelect && !joinModeSelect.dataset.listenerAttached) {
        joinModeSelect.addEventListener('change', (e) => {
            rezeptSearchJoinMode = e.target.value === 'or' ? 'or' : 'and';
            filterRezepte();
        });
        joinModeSelect.dataset.listenerAttached = 'true';
    }

    const toggleAdvancedFilter = document.getElementById('rz-toggle-advanced-filter');
    if (toggleAdvancedFilter && !toggleAdvancedFilter.dataset.listenerAttached) {
        toggleAdvancedFilter.addEventListener('click', () => {
            const panel = document.getElementById('rz-advanced-filter-panel');
            const icon = document.getElementById('rz-advanced-filter-toggle-icon');
            if (!panel || !icon) return;
            panel.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
        toggleAdvancedFilter.dataset.listenerAttached = 'true';
    }

    ['rz-filter-kategorie', 'rz-filter-arbeitszeit', 'rz-filter-bewertung', 'rz-filter-typ', 'rz-filter-id', 'rz-filter-mappennr']
        .forEach((id) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.listenerAttached) return;
            el.addEventListener('change', filterRezepte);
            if (el.tagName === 'INPUT') {
                el.addEventListener('input', filterRezepte);
            }
            el.dataset.listenerAttached = 'true';
        });

    const resetAllFiltersBtn = document.getElementById('rz-reset-all-filters');
    if (resetAllFiltersBtn && !resetAllFiltersBtn.dataset.listenerAttached) {
        resetAllFiltersBtn.addEventListener('click', resetRezeptFilter);
        resetAllFiltersBtn.dataset.listenerAttached = 'true';
    }

    const resetAdvancedFilterBtn = document.getElementById('rz-reset-advanced-filter');
    if (resetAdvancedFilterBtn && !resetAdvancedFilterBtn.dataset.listenerAttached) {
        resetAdvancedFilterBtn.addEventListener('click', () => {
            resetRezeptAdvancedFilters();
            filterRezepte();
        });
        resetAdvancedFilterBtn.dataset.listenerAttached = 'true';
    }
    
    // Portionen +/-
    const portionenMinus = document.getElementById('portionen-minus');
    const portionenPlus = document.getElementById('portionen-plus');
    if (portionenMinus) portionenMinus.addEventListener('click', () => changePortionen(-1));
    if (portionenPlus) portionenPlus.addEventListener('click', () => changePortionen(1));
    
    // Kamera Button
    const btnKamera = document.getElementById('btn-kamera');
    if (btnKamera) {
        btnKamera.addEventListener('click', () => {
            const input = document.getElementById('rezeptDokument');
            input.setAttribute('capture', 'environment');
            input.click();
        });
    }
    
    // Datei-Upload
    const rezeptDokument = document.getElementById('rezeptDokument');
    if (rezeptDokument) {
        rezeptDokument.addEventListener('change', handleFileUpload);
    }
}

// ========================================
// MODAL FUNKTIONEN
// ========================================
function openCreateModal() {
    console.log("openCreateModal wird aufgerufen...");
    
    const modal = document.getElementById('rezeptModal');
    if (!modal) {
        console.error("rezeptModal nicht gefunden!");
        return;
    }
    
    const titleEl = document.getElementById('rezeptModalTitle');
    const idEl = document.getElementById('rezeptId');
    
    if (titleEl) titleEl.textContent = 'Neues Rezept';
    if (idEl) idEl.value = '';
    
    // Felder zurücksetzen
    const fields = {
        'rezeptTitel': '',
        'rezeptKategorie': 'hauptgericht',
        'rezeptMappenNr': '',
        'rezeptPortionen': '4',
        'rezeptArbeitszeit': '',
        'rezeptGesamtzeit': '',
        'rezeptNotizen': '',
        'rezeptBewertung': '0'
    };
    
    Object.entries(fields).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
    
    // Rezept-Typ auf manuell setzen
    document.querySelectorAll('.rezept-typ-option').forEach(opt => {
        opt.classList.remove('border-orange-500', 'bg-orange-50');
        opt.classList.add('border-gray-300');
    });
    const manuellOption = document.querySelector('.rezept-typ-option[data-value="manuell"]');
    if (manuellOption) {
        manuellOption.classList.remove('border-gray-300');
        manuellOption.classList.add('border-orange-500', 'bg-orange-50');
        const input = manuellOption.querySelector('input');
        if (input) input.checked = true;
    }
    toggleRezeptTypSections('manuell');
    
    // Temporäre Daten zurücksetzen
    tempZutaten = [];
    tempSchritte = [];
    tempDokumente = [];
    renderZutaten();
    renderSchritte();
    renderDokumentPreview();
    updateSterneAnzeige(0);
    
    modal.style.display = 'flex';
    console.log("Modal geöffnet");
}

function openEditModal(rezeptId) {
    const rezept = REZEPTE[rezeptId];
    if (!rezept) return;
    
    document.getElementById('rezeptModalTitle').textContent = 'Rezept bearbeiten';
    document.getElementById('rezeptId').value = rezeptId;
    
    // Felder befüllen
    document.getElementById('rezeptTitel').value = rezept.titel || '';
    document.getElementById('rezeptKategorie').value = rezept.kategorie || 'hauptgericht';
    document.getElementById('rezeptMappenNr').value = rezept.mappenNr || '';
    document.getElementById('rezeptPortionen').value = rezept.portionen || '4';
    document.getElementById('rezeptArbeitszeit').value = rezept.arbeitszeit || '';
    document.getElementById('rezeptGesamtzeit').value = rezept.gesamtzeit || '';
    document.getElementById('rezeptNotizen').value = rezept.notizen || '';
    document.getElementById('rezeptBewertung').value = rezept.bewertung || '0';
    
    // Rezept-Typ setzen
    const typ = rezept.typ || 'manuell';
    document.querySelectorAll('.rezept-typ-option').forEach(opt => {
        opt.classList.remove('border-orange-500', 'bg-orange-50');
        opt.classList.add('border-gray-300');
        if (opt.dataset.value === typ) {
            opt.classList.remove('border-gray-300');
            opt.classList.add('border-orange-500', 'bg-orange-50');
            opt.querySelector('input').checked = true;
        }
    });
    toggleRezeptTypSections(typ);
    
    // Temporäre Daten laden
    tempZutaten = rezept.zutaten ? [...rezept.zutaten] : [];
    tempSchritte = rezept.schritte ? [...rezept.schritte] : [];
    tempDokumente = rezept.dokumente ? [...rezept.dokumente] : [];
    renderZutaten();
    renderSchritte();
    renderDokumentPreview();
    updateSterneAnzeige(rezept.bewertung || 0);
    
    document.getElementById('rezeptModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('rezeptModal').style.display = 'none';
}

function closeDetailsModal() {
    document.getElementById('rezeptDetailsModal').style.display = 'none';
}

function toggleRezeptTypSections(typ) {
    const dokumentSection = document.getElementById('rezept-dokument-section');
    const zutatenSection = document.getElementById('rezept-zutaten-section');
    const schritteSection = document.getElementById('rezept-schritte-section');
    
    if (typ === 'dokument') {
        dokumentSection.classList.remove('hidden');
        zutatenSection.classList.add('hidden');
        schritteSection.classList.add('hidden');
    } else {
        dokumentSection.classList.add('hidden');
        zutatenSection.classList.remove('hidden');
        schritteSection.classList.remove('hidden');
    }
}

// ========================================
// ZUTATEN FUNKTIONEN
// ========================================
function addZutat() {
    tempZutaten.push({
        id: Date.now(),
        menge: '',
        einheit: 'g',
        name: '',
        notiz: ''
    });
    renderZutaten();
}

function removeZutat(id) {
    tempZutaten = tempZutaten.filter(z => z.id !== id);
    renderZutaten();
}

function updateZutat(id, field, value) {
    const zutat = tempZutaten.find(z => z.id === id);
    if (zutat) {
        zutat[field] = value;
    }
}

function renderZutaten() {
    const container = document.getElementById('zutaten-container');
    const leerState = document.getElementById('zutaten-leer');
    
    if (tempZutaten.length === 0) {
        container.innerHTML = '';
        leerState.classList.remove('hidden');
        return;
    }
    
    leerState.classList.add('hidden');
    
    const einheitenOptions = EINHEITEN.map(e => 
        `<option value="${e.value}">${e.label}</option>`
    ).join('');
    
    container.innerHTML = tempZutaten.map((z, idx) => `
        <div class="flex gap-2 items-start bg-white p-2 rounded-lg border" data-zutat-id="${z.id}">
            <input type="number" value="${z.menge}" placeholder="Menge" step="0.1" min="0"
                onchange="window.updateZutat(${z.id}, 'menge', this.value)"
                class="w-20 p-2 border rounded text-sm">
            <select onchange="window.updateZutat(${z.id}, 'einheit', this.value)"
                class="w-24 p-2 border rounded text-sm">
                ${einheitenOptions.replace(`value="${z.einheit}"`, `value="${z.einheit}" selected`)}
            </select>
            <input type="text" value="${z.name}" placeholder="Zutat (z.B. Mehl)"
                onchange="window.updateZutat(${z.id}, 'name', this.value)"
                class="flex-1 p-2 border rounded text-sm">
            <button type="button" onclick="window.removeZutat(${z.id})"
                class="p-2 text-red-500 hover:text-red-700">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `).join('');
}

// ========================================
// ARBEITSSCHRITTE FUNKTIONEN
// ========================================
function addSchritt() {
    tempSchritte.push({
        id: Date.now(),
        beschreibung: '',
        notiz: ''
    });
    renderSchritte();
}

function removeSchritt(id) {
    tempSchritte = tempSchritte.filter(s => s.id !== id);
    renderSchritte();
}

function updateSchritt(id, field, value) {
    const schritt = tempSchritte.find(s => s.id === id);
    if (schritt) {
        schritt[field] = value;
    }
}

function renderSchritte() {
    const container = document.getElementById('schritte-container');
    const leerState = document.getElementById('schritte-leer');
    
    if (tempSchritte.length === 0) {
        container.innerHTML = '';
        leerState.classList.remove('hidden');
        return;
    }
    
    leerState.classList.add('hidden');
    
    container.innerHTML = tempSchritte.map((s, idx) => `
        <div class="bg-white p-3 rounded-lg border" data-schritt-id="${s.id}">
            <div class="flex items-start gap-3">
                <span class="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    ${idx + 1}
                </span>
                <div class="flex-1 space-y-2">
                    <textarea placeholder="Beschreibung des Arbeitsschritts..."
                        onchange="window.updateSchritt(${s.id}, 'beschreibung', this.value)"
                        class="w-full p-2 border rounded text-sm resize-none" rows="2">${s.beschreibung || ''}</textarea>
                    <input type="text" value="${s.notiz || ''}" placeholder="📝 Notiz zu diesem Schritt (optional)"
                        onchange="window.updateSchritt(${s.id}, 'notiz', this.value)"
                        class="w-full p-2 border rounded text-sm text-gray-600 bg-gray-50">
                </div>
                <button type="button" onclick="window.removeSchritt(${s.id})"
                    class="p-2 text-red-500 hover:text-red-700">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

// ========================================
// DOKUMENT UPLOAD
// ========================================
function handleFileUpload(e) {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            tempDokumente.push({
                id: Date.now() + Math.random(),
                name: file.name,
                type: file.type,
                data: event.target.result
            });
            renderDokumentPreview();
        };
        reader.readAsDataURL(file);
    });
}

function removeDokument(id) {
    tempDokumente = tempDokumente.filter(d => d.id !== id);
    renderDokumentPreview();
}

function renderDokumentPreview() {
    const container = document.getElementById('rezept-dokument-preview');
    if (!container) return;
    
    if (tempDokumente.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = tempDokumente.map(d => {
        const isImage = d.type.startsWith('image/');
        return `
            <div class="relative group">
                ${isImage ? 
                    `<img src="${d.data}" class="w-full h-24 object-cover rounded-lg border">` :
                    `<div class="w-full h-24 bg-gray-200 rounded-lg border flex items-center justify-center">
                        <span class="text-2xl">📄</span>
                    </div>`
                }
                <button type="button" onclick="window.removeDokument(${d.id})"
                    class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold hover:bg-red-600">
                    ×
                </button>
                <p class="text-xs text-center mt-1 truncate">${d.name}</p>
            </div>
        `;
    }).join('');
}

// ========================================
// BEWERTUNG
// ========================================
function updateSterneAnzeige(wert) {
    document.querySelectorAll('.stern-btn').forEach(btn => {
        const btnWert = parseInt(btn.dataset.wert);
        if (btnWert <= wert) {
            btn.classList.remove('text-gray-300');
            btn.classList.add('text-yellow-400');
        } else {
            btn.classList.remove('text-yellow-400');
            btn.classList.add('text-gray-300');
        }
    });
}

// ========================================
// SPEICHERN / LÖSCHEN
// ========================================
async function saveRezept() {
    const rezeptId = document.getElementById('rezeptId').value;
    const titel = document.getElementById('rezeptTitel').value.trim();
    
    if (!titel) {
        alertUser('Bitte gib einen Titel ein.', 'error');
        return;
    }
    
    const selectedTyp = document.querySelector('input[name="rezeptTyp"]:checked');
    const typ = selectedTyp ? selectedTyp.value : 'manuell';
    
    // Neue Rezept-Nummer generieren
    let rezeptNummer = rezeptIdCounter + 1;
    if (rezeptId && REZEPTE[rezeptId]) {
        rezeptNummer = REZEPTE[rezeptId].rezeptNummer || rezeptNummer;
    }
    
    const rezeptData = {
        titel: titel,
        kategorie: document.getElementById('rezeptKategorie').value,
        mappenNr: parseInt(document.getElementById('rezeptMappenNr').value) || null,
        portionen: parseInt(document.getElementById('rezeptPortionen').value) || 4,
        arbeitszeit: parseInt(document.getElementById('rezeptArbeitszeit').value) || null,
        gesamtzeit: parseInt(document.getElementById('rezeptGesamtzeit').value) || null,
        notizen: document.getElementById('rezeptNotizen').value.trim(),
        bewertung: parseInt(document.getElementById('rezeptBewertung').value) || 0,
        typ: typ,
        zutaten: typ === 'manuell' ? tempZutaten : [],
        schritte: typ === 'manuell' ? tempSchritte : [],
        dokumente: typ === 'dokument' ? tempDokumente : [],
        rezeptNummer: rezeptNummer,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.displayName || 'Unbekannt'
    };
    
    try {
        if (rezeptId) {
            await updateDoc(doc(rezepteCollection, rezeptId), rezeptData);
            alertUser('Rezept erfolgreich aktualisiert!', 'success');
        } else {
            rezeptData.createdAt = serverTimestamp();
            rezeptData.createdBy = currentUser?.displayName || 'Unbekannt';
            rezeptData.rezeptId = `RZ${String(rezeptNummer).padStart(3, '0')}`;
            await addDoc(rezepteCollection, rezeptData);
            alertUser('Rezept erfolgreich erstellt!', 'success');
        }
        closeModal();
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        alertUser('Fehler beim Speichern des Rezepts.', 'error');
    }
}

async function deleteRezept(rezeptId) {
    const rezept = REZEPTE[rezeptId];
    if (!rezept) return;
    
    if (!confirm(`Möchtest du das Rezept "${rezept.titel}" wirklich löschen?`)) {
        return;
    }
    
    try {
        await deleteDoc(doc(rezepteCollection, rezeptId));
        alertUser('Rezept gelöscht.', 'success');
    } catch (error) {
        console.error("Fehler beim Löschen:", error);
        alertUser('Fehler beim Löschen des Rezepts.', 'error');
    }
}

// ========================================
// LISTE RENDERN
// ========================================
function renderRezepteListe() {
    const container = document.getElementById('rezepte-liste');
    const leerState = document.getElementById('rezepte-leer');
    
    if (!container) return;
    
    const rezepteArray = Object.values(REZEPTE);
    
    if (rezepteArray.length === 0) {
        container.innerHTML = '';
        if (leerState) leerState.classList.remove('hidden');
        return;
    }
    
    if (leerState) leerState.classList.add('hidden');
    
    container.innerHTML = rezepteArray.map(rezept => {
        const kategorie = KATEGORIE_CONFIG[rezept.kategorie] || KATEGORIE_CONFIG.sonstiges;
        const sterne = '⭐'.repeat(rezept.bewertung || 0) + '☆'.repeat(5 - (rezept.bewertung || 0));
        const typIcon = rezept.typ === 'dokument' ? '📄' : '📝';
        
        return `
            <div class="bg-white rounded-xl shadow-lg p-4 hover:shadow-xl transition cursor-pointer border-l-4 border-orange-500"
                onclick="window.showRezeptDetails('${rezept.id}')">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-lg">${kategorie.icon}</span>
                            <h3 class="font-bold text-gray-800">${rezept.titel}</h3>
                            <span class="text-xs bg-gray-200 px-2 py-0.5 rounded">${typIcon}</span>
                        </div>
                        <div class="flex flex-wrap gap-2 text-xs text-gray-500">
                            <span>🆔 ${rezept.rezeptId || '-'}</span>
                            ${rezept.mappenNr ? `<span>📁 Nr. ${rezept.mappenNr}</span>` : ''}
                            ${rezept.arbeitszeit ? `<span>⏱️ ${rezept.arbeitszeit} Min</span>` : ''}
                            <span>🍽️ ${rezept.portionen || 4} Port.</span>
                        </div>
                        <div class="text-sm mt-1">${sterne}</div>
                    </div>
                    <div class="flex gap-1">
                        <button onclick="event.stopPropagation(); window.editRezept('${rezept.id}')"
                            class="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button onclick="event.stopPropagation(); window.deleteRezept('${rezept.id}')"
                            class="p-2 text-red-600 hover:bg-red-100 rounded-lg transition">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    filterRezepte();
}

// ========================================
// DETAILS ANZEIGEN
// ========================================
function showRezeptDetails(rezeptId) {
    const rezept = REZEPTE[rezeptId];
    if (!rezept) return;
    
    aktuellesRezept = rezept;
    originalPortionen = rezept.portionen || 4;
    aktuellePortionen = originalPortionen;
    
    document.getElementById('rezeptDetailsTitle').textContent = rezept.titel;
    document.getElementById('portionen-anzeige').textContent = aktuellePortionen;
    document.getElementById('original-portionen').textContent = originalPortionen;
    
    // Portionen-Rechner nur bei manuellen Rezepten anzeigen
    const portionenRechner = document.getElementById('portionen-rechner');
    if (rezept.typ === 'dokument') {
        portionenRechner.classList.add('hidden');
    } else {
        portionenRechner.classList.remove('hidden');
    }
    
    renderRezeptDetails();
    document.getElementById('rezeptDetailsModal').style.display = 'flex';
}

function renderRezeptDetails() {
    const rezept = aktuellesRezept;
    if (!rezept) return;
    
    const kategorie = KATEGORIE_CONFIG[rezept.kategorie] || KATEGORIE_CONFIG.sonstiges;
    const sterne = '⭐'.repeat(rezept.bewertung || 0) + '☆'.repeat(5 - (rezept.bewertung || 0));
    const faktor = aktuellePortionen / originalPortionen;
    
    let content = `
        <div class="space-y-4">
            <!-- Meta-Infos -->
            <div class="flex flex-wrap gap-3 text-sm">
                <span class="bg-orange-100 text-orange-800 px-3 py-1 rounded-full font-semibold">
                    ${kategorie.icon} ${kategorie.label}
                </span>
                <span class="bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                    🆔 ${rezept.rezeptId || '-'}
                </span>
                ${rezept.mappenNr ? `<span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">📁 Mappe Nr. ${rezept.mappenNr}</span>` : ''}
            </div>
            
            <!-- Zeit & Bewertung -->
            <div class="grid grid-cols-3 gap-3 text-center">
                <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-xs text-gray-500">Arbeitszeit</p>
                    <p class="font-bold text-lg">${rezept.arbeitszeit ? rezept.arbeitszeit + ' Min' : '-'}</p>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-xs text-gray-500">Gesamtzeit</p>
                    <p class="font-bold text-lg">${rezept.gesamtzeit ? rezept.gesamtzeit + ' Min' : '-'}</p>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-xs text-gray-500">Bewertung</p>
                    <p class="text-lg">${sterne}</p>
                </div>
            </div>
    `;
    
    // Bei Dokument-Typ: Dokumente anzeigen
    if (rezept.typ === 'dokument' && rezept.dokumente && rezept.dokumente.length > 0) {
        content += `
            <div class="bg-blue-50 p-4 rounded-xl">
                <h4 class="font-bold text-blue-800 mb-3">📄 Angehängte Dokumente</h4>
                <div class="grid grid-cols-2 gap-3">
                    ${rezept.dokumente.map(d => {
                        const isImage = d.type.startsWith('image/');
                        return `
                            <div class="bg-white rounded-lg overflow-hidden border">
                                ${isImage ? 
                                    `<img src="${d.data}" class="w-full h-32 object-cover cursor-pointer" onclick="window.open('${d.data}', '_blank')">` :
                                    `<div class="w-full h-32 flex items-center justify-center bg-gray-100">
                                        <a href="${d.data}" download="${d.name}" class="text-blue-600 hover:underline">📄 ${d.name}</a>
                                    </div>`
                                }
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    // Bei manuellem Typ: Zutaten anzeigen
    if (rezept.typ === 'manuell' && rezept.zutaten && rezept.zutaten.length > 0) {
        content += `
            <div class="bg-green-50 p-4 rounded-xl">
                <h4 class="font-bold text-green-800 mb-3">🥕 Zutaten</h4>
                <ul class="space-y-2">
                    ${rezept.zutaten.map(z => {
                        const einheit = EINHEITEN.find(e => e.value === z.einheit);
                        let menge = parseFloat(z.menge) * faktor;
                        
                        // Rundung für nicht-rundbare Einheiten (Stück, Eier, etc.)
                        if (einheit && !einheit.rundbar) {
                            menge = Math.round(menge);
                        } else {
                            // Auf 1 Dezimalstelle runden
                            menge = Math.round(menge * 10) / 10;
                        }
                        
                        const mengeStr = menge % 1 === 0 ? menge.toString() : menge.toFixed(1);
                        
                        return `
                            <li class="flex items-center gap-2 bg-white p-2 rounded-lg">
                                <span class="font-bold text-green-700 w-20 text-right">${mengeStr} ${z.einheit}</span>
                                <span class="flex-1">${z.name}</span>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `;
    }
    
    // Bei manuellem Typ: Arbeitsschritte anzeigen
    if (rezept.typ === 'manuell' && rezept.schritte && rezept.schritte.length > 0) {
        content += `
            <div class="bg-yellow-50 p-4 rounded-xl">
                <h4 class="font-bold text-yellow-800 mb-3">📋 Zubereitung</h4>
                <ol class="space-y-3">
                    ${rezept.schritte.map((s, idx) => `
                        <li class="flex gap-3">
                            <span class="w-8 h-8 bg-yellow-500 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                                ${idx + 1}
                            </span>
                            <div class="flex-1">
                                <p class="text-gray-800">${s.beschreibung}</p>
                                ${s.notiz ? `<p class="text-sm text-gray-500 mt-1 italic">📝 ${s.notiz}</p>` : ''}
                            </div>
                        </li>
                    `).join('')}
                </ol>
            </div>
        `;
    }
    
    // Notizen
    if (rezept.notizen) {
        content += `
            <div class="bg-purple-50 p-4 rounded-xl">
                <h4 class="font-bold text-purple-800 mb-2">📝 Notizen</h4>
                <p class="text-gray-700 whitespace-pre-wrap">${rezept.notizen}</p>
            </div>
        `;
    }
    
    content += `
            <!-- Aktionen -->
            <div class="flex gap-3 pt-4">
                <button onclick="window.editRezept('${rezept.id}'); document.getElementById('rezeptDetailsModal').style.display='none';"
                    class="flex-1 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition">
                    Bearbeiten
                </button>
                <button onclick="window.deleteRezept('${rezept.id}'); document.getElementById('rezeptDetailsModal').style.display='none';"
                    class="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition">
                    Löschen
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('rezeptDetailsContent').innerHTML = content;
}

// ========================================
// PORTIONEN UMRECHNEN
// ========================================
function changePortionen(delta) {
    aktuellePortionen = Math.max(1, aktuellePortionen + delta);
    document.getElementById('portionen-anzeige').textContent = aktuellePortionen;
    renderRezeptDetails();
}

// ========================================
// FILTER & SUCHE
// ========================================
function addRezeptFilterFromUi(options = {}) {
    const searchInput = document.getElementById('rz-search-input');
    const categorySelect = document.getElementById('rz-filter-category-tag');
    const negateCheckbox = document.getElementById('rz-filter-negate');

    const rawValue = String((options.rawValue ?? searchInput?.value) || '').trim();
    if (!rawValue) {
        alertUser('Bitte einen Suchbegriff eingeben.', 'warning');
        return;
    }

    const category = String(options.category || categorySelect?.value || 'all');
    const negate = !!negateCheckbox?.checked;
    const value = rawValue.toLowerCase();

    const duplicate = activeRezeptFilters.some((filter) => (
        filter.category === category &&
        filter.value === value &&
        !!filter.negate === negate
    ));

    if (duplicate) {
        if (searchInput) searchInput.value = '';
        if (negateCheckbox) negateCheckbox.checked = false;
        hideRezeptSearchSuggestions();
        return;
    }

    activeRezeptFilters.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        category,
        value,
        rawValue,
        negate,
        label: REZEPT_FILTER_LABELS[category] || category
    });

    if (searchInput) searchInput.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;
    if (categorySelect) categorySelect.value = category;
    hideRezeptSearchSuggestions();

    renderRezeptSearchTags();
    filterRezepte();
}

function hideRezeptSearchSuggestions() {
    document.getElementById('rz-search-suggestions-box')?.classList.add('hidden');
}

function updateRezeptSearchSuggestions(term) {
    const box = document.getElementById('rz-search-suggestions-box');
    const list = document.getElementById('rz-search-suggestions-list');
    if (!box || !list) return;

    if (!term || !term.trim()) {
        list.innerHTML = '';
        box.classList.add('hidden');
        return;
    }

    const lowerTerm = term.toLowerCase().trim();
    const rezepte = Object.values(REZEPTE);
    list.innerHTML = '';

    const categories = ['titel', 'rezeptId', 'kategorie', 'arbeitszeit', 'bewertung', 'typ', 'mappenNr', 'zutaten'];
    let hasHits = false;

    categories.forEach((category) => {
        const hasCategoryHit = rezepte.some((rezept) =>
            doesRezeptMatchSearchFilter(rezept, { category, value: lowerTerm })
        );
        if (!hasCategoryHit) return;

        hasHits = true;
        const li = document.createElement('li');
        li.className = 'px-3 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
        li.innerHTML = `
            <span class="text-lg">${REZEPT_SUGGESTION_ICONS[category] || '🔎'}</span>
            <div class="flex-grow leading-tight">
                <span class="font-bold text-gray-800 block">${REZEPT_FILTER_LABELS[category] || category}: ${term}</span>
                <span class="text-xs text-gray-500">Filter in ${REZEPT_FILTER_LABELS[category] || category}</span>
            </div>
        `;
        li.onclick = () => addRezeptFilterFromUi({ category, rawValue: term });
        list.appendChild(li);
    });

    const fallback = document.createElement('li');
    fallback.className = 'px-3 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
    fallback.innerHTML = `
        <span class="text-lg">${REZEPT_SUGGESTION_ICONS.all}</span>
        <div class="flex-grow leading-tight">
            <span class="font-bold text-gray-800 block">Alles: ${term}</span>
            <span class="text-xs text-gray-500">Volltextsuche</span>
        </div>
    `;
    fallback.onclick = () => addRezeptFilterFromUi({ category: 'all', rawValue: term });
    list.appendChild(fallback);

    box.classList.toggle('hidden', !hasHits && !term.trim());
    if (!box.classList.contains('hidden')) return;
    box.classList.remove('hidden');
}

function removeRezeptFilterById(filterId) {
    activeRezeptFilters = activeRezeptFilters.filter((filter) => filter.id !== filterId);
    renderRezeptSearchTags();
    filterRezepte();
}

function renderRezeptSearchTags() {
    const container = document.getElementById('rz-active-filters');
    if (!container) return;

    if (activeRezeptFilters.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = activeRezeptFilters.map((filter) => `
        <div class="flex items-center gap-2 px-3 py-1.5 ${filter.negate ? 'bg-red-100 text-red-800 border-red-300' : 'bg-orange-100 text-orange-800 border-orange-300'} rounded-full text-sm font-medium border">
            ${filter.negate ? '<span class="font-bold text-red-600">NICHT</span>' : ''}
            <span class="font-bold">${filter.label}:</span>
            <span>${filter.rawValue}</span>
            <button onclick="window.removeRezeptFilterById(${filter.id})" class="ml-1 ${filter.negate ? 'hover:bg-red-200' : 'hover:bg-orange-200'} rounded-full p-0.5 transition" title="Filter entfernen">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');
}

function resetRezeptAdvancedFilters() {
    const kategorie = document.getElementById('rz-filter-kategorie');
    const arbeitszeit = document.getElementById('rz-filter-arbeitszeit');
    const bewertung = document.getElementById('rz-filter-bewertung');
    const typ = document.getElementById('rz-filter-typ');
    const filterId = document.getElementById('rz-filter-id');
    const filterMappenNr = document.getElementById('rz-filter-mappennr');

    if (kategorie) kategorie.value = '';
    if (arbeitszeit) arbeitszeit.value = '';
    if (bewertung) bewertung.value = '';
    if (typ) typ.value = '';
    if (filterId) filterId.value = '';
    if (filterMappenNr) filterMappenNr.value = '';
}

function doesRezeptMatchSearchFilter(rezept, filter) {
    const value = filter.value;
    const titel = String(rezept.titel || '').toLowerCase();
    const rezeptId = String(rezept.rezeptId || '').toLowerCase();
    const kategorieKey = String(rezept.kategorie || '').toLowerCase();
    const kategorieLabel = String(KATEGORIE_CONFIG[rezept.kategorie]?.label || '').toLowerCase();
    const arbeitszeit = String(rezept.arbeitszeit || '').toLowerCase();
    const bewertung = String(rezept.bewertung || '').toLowerCase();
    const typ = String(rezept.typ || '').toLowerCase();
    const mappenNr = String(rezept.mappenNr || '').toLowerCase();
    const zutaten = (rezept.zutaten || []).map((zutat) => String(zutat?.name || '').toLowerCase());

    switch (filter.category) {
        case 'titel':
            return titel.includes(value);
        case 'rezeptId':
            return rezeptId.includes(value);
        case 'kategorie':
            return kategorieKey.includes(value) || kategorieLabel.includes(value);
        case 'arbeitszeit':
            return arbeitszeit.includes(value);
        case 'bewertung':
            return bewertung.includes(value);
        case 'typ':
            return typ.includes(value);
        case 'mappenNr':
            return mappenNr.includes(value);
        case 'zutaten':
            return zutaten.some((name) => name.includes(value));
        case 'all':
        default:
            return titel.includes(value) ||
                rezeptId.includes(value) ||
                kategorieKey.includes(value) ||
                kategorieLabel.includes(value) ||
                arbeitszeit.includes(value) ||
                bewertung.includes(value) ||
                typ.includes(value) ||
                mappenNr.includes(value) ||
                zutaten.some((name) => name.includes(value));
    }
}

function filterRezepte() {
    const kategorie = document.getElementById('rz-filter-kategorie')?.value || '';
    const arbeitszeit = parseInt(document.getElementById('rz-filter-arbeitszeit')?.value || '') || 0;
    const bewertung = parseInt(document.getElementById('rz-filter-bewertung')?.value || '') || 0;
    const typ = document.getElementById('rz-filter-typ')?.value || '';
    const filterId = String(document.getElementById('rz-filter-id')?.value || '').toLowerCase();
    const filterMappenNr = String(document.getElementById('rz-filter-mappennr')?.value || '');
    
    const container = document.getElementById('rezepte-liste');
    if (!container) return;
    
    Object.values(REZEPTE).forEach(rezept => {
        const card = container.querySelector(`[onclick*="${rezept.id}"]`);
        if (!card) return;
        
        let visible = true;
        
        // Kategorie
        if (kategorie && rezept.kategorie !== kategorie) visible = false;
        
        // Arbeitszeit
        if (arbeitszeit) {
            const zeit = rezept.arbeitszeit || 999;
            if (arbeitszeit === 999) {
                if (zeit <= 120) visible = false;
            } else {
                if (zeit > arbeitszeit) visible = false;
            }
        }
        
        // Bewertung
        if (bewertung && (rezept.bewertung || 0) < bewertung) visible = false;
        
        // Typ
        if (typ && rezept.typ !== typ) visible = false;
        
        // ID
        if (filterId && !(rezept.rezeptId || '').toLowerCase().includes(filterId)) visible = false;
        
        // Mappen-Nr
        if (filterMappenNr && String(rezept.mappenNr) !== filterMappenNr) visible = false;

        // Tag-Filter (AND/OR + NICHT)
        if (visible && activeRezeptFilters.length > 0) {
            const evaluate = (filter) => {
                const matches = doesRezeptMatchSearchFilter(rezept, filter);
                return filter.negate ? !matches : matches;
            };

            const tagMatches = rezeptSearchJoinMode === 'or'
                ? activeRezeptFilters.some(evaluate)
                : activeRezeptFilters.every(evaluate);

            if (!tagMatches) visible = false;
        }
        
        card.style.display = visible ? '' : 'none';
    });
}

function resetRezeptFilter() {
    activeRezeptFilters = [];
    rezeptSearchJoinMode = 'and';

    const searchInput = document.getElementById('rz-search-input');
    const categoryTag = document.getElementById('rz-filter-category-tag');
    const negate = document.getElementById('rz-filter-negate');
    const joinMode = document.getElementById('rz-search-join-mode');

    if (searchInput) searchInput.value = '';
    if (categoryTag) categoryTag.value = 'all';
    if (negate) negate.checked = false;
    if (joinMode) joinMode.value = 'and';
    hideRezeptSearchSuggestions();

    resetRezeptAdvancedFilters();
    renderRezeptSearchTags();
    filterRezepte();
}

// ========================================
// STATISTIKEN
// ========================================
function updateStatistics() {
    const count = Object.keys(REZEPTE).length;
    const statEl = document.getElementById('stat-rezepte-gesamt');
    if (statEl) statEl.textContent = count;
}

// ========================================
// GLOBALE FUNKTIONEN FÜR HTML ONCLICK
// ========================================
window.editRezept = openEditModal;
window.deleteRezept = deleteRezept;
window.showRezeptDetails = showRezeptDetails;
window.addZutat = addZutat;
window.removeZutat = removeZutat;
window.updateZutat = updateZutat;
window.addSchritt = addSchritt;
window.removeSchritt = removeSchritt;
window.updateSchritt = updateSchritt;
window.removeDokument = removeDokument;
window.removeRezeptFilterById = removeRezeptFilterById;

// ========================================
// HINWEIS: Initialisierung erfolgt durch haupteingang.js
// ========================================
