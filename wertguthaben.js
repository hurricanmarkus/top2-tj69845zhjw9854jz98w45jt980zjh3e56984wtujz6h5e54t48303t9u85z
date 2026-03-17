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
import { createPendingNotification, renderPendingNotifications } from './pushmail-notifications.js';

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
    getDocs,
    runTransaction
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================
let wertguthabenCollection = null;
let paymentsCollection = null;
let globalShortIdsCollection = null;
let WERTGUTHABEN = {};
let unsubscribeWertguthaben = null;
let currentFilter = { typ: '', kategorie: '', eigentuemer: '', status: 'aktiv' };
let activeWertguthabenFilters = [];
let wertguthabenSearchJoinMode = 'and';
let pendingKategorieNormalizations = new Set();
let pendingFixedIdAssignments = new Set();
let currentEinloeseWertguthabenId = '';
const transaktionModalState = {
    originalRestwert: 0,
    source: 'dashboard',
    editTransaktionId: '',
    isEinloesungMode: false,
    maxEinloesungen: 0,
    bereitsEingeloest: 0
};

const WG_UNASSIGNED_KATEGORIE = 'Nicht zugeordnet';
const WG_SHORT_ID_LENGTH = 4;
const WG_SHORT_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WG_MAX_SHORT_ID_ATTEMPTS = 200;

const WG_FILTER_LABELS = {
    all: 'Alles',
    id: 'ID',
    name: 'Name',
    code: 'Code',
    unternehmen: 'Unternehmen',
    kategorie: 'Kategorie',
    eigentuemer: 'Eigentümer',
    typ: 'Typ',
    status: 'Status',
    betrag: 'Wert/Betrag'
};

const WG_SUGGESTION_ICONS = {
    all: '🔍',
    id: '🆔',
    name: '🧾',
    code: '#️⃣',
    unternehmen: '🏢',
    kategorie: '🏷️',
    eigentuemer: '👤',
    typ: '🏷️',
    status: '📊',
    betrag: '💶'
};

let wertguthabenSettings = {
    kategorien: [],
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
        paymentsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'payments');
        globalShortIdsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'global-short-ids');
    }

    setupEventListeners();
    populateEigentuemerDropdowns();
    populateKategorieDropdowns();
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

    // Filterbereich Toggle
    const filterToggleBtn = document.getElementById('wg-toggle-filter-controls');
    if (filterToggleBtn && !filterToggleBtn.dataset.listenerAttached) {
        filterToggleBtn.addEventListener('click', () => {
            const wrapper = document.getElementById('wg-filter-controls-wrapper');
            const icon = document.getElementById('wg-toggle-filter-icon');
            if (!wrapper || !icon) return;
            wrapper.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
        filterToggleBtn.dataset.listenerAttached = 'true';
    }

    // Suche & Filter (harmonisiert)
    const searchInput = document.getElementById('search-wertguthaben');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            const term = String(e.target.value || '');
            if (!term.trim()) {
                hideWertguthabenSearchSuggestions();
                return;
            }
            updateWertguthabenSearchSuggestions(term);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addWertguthabenFilterFromUi();
            }
        });
        searchInput.addEventListener('focus', (e) => {
            const term = String(e.target.value || '').trim();
            if (term) updateWertguthabenSearchSuggestions(term);
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    if (!document.body.dataset.wgSuggestionsListenerAttached) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#search-wertguthaben') && !e.target.closest('#wg-search-suggestions-box')) {
                hideWertguthabenSearchSuggestions();
            }
            if (!e.target.closest('#wg-einloese-id-input') && !e.target.closest('#wg-einloese-suggestions-box')) {
                hideEinloeseSuggestions();
            }
        });
        document.body.dataset.wgSuggestionsListenerAttached = 'true';
    }

    const addFilterBtn = document.getElementById('wg-add-filter-btn');
    if (addFilterBtn && !addFilterBtn.dataset.listenerAttached) {
        addFilterBtn.addEventListener('click', addWertguthabenFilterFromUi);
        addFilterBtn.dataset.listenerAttached = 'true';
    }

    const joinModeSelect = document.getElementById('wg-search-join-mode');
    if (joinModeSelect && !joinModeSelect.dataset.listenerAttached) {
        joinModeSelect.addEventListener('change', (e) => {
            wertguthabenSearchJoinMode = e.target.value === 'or' ? 'or' : 'and';
            renderWertguthabenTable();
        });
        joinModeSelect.dataset.listenerAttached = 'true';
    }

    const filterTyp = document.getElementById('filter-wg-typ');
    if (filterTyp && !filterTyp.dataset.listenerAttached) {
        filterTyp.addEventListener('change', (e) => {
            currentFilter.typ = e.target.value;
            renderWertguthabenTable();
        });
        filterTyp.dataset.listenerAttached = 'true';
    }

    const filterKategorie = document.getElementById('filter-wg-kategorie');
    if (filterKategorie && !filterKategorie.dataset.listenerAttached) {
        filterKategorie.addEventListener('change', (e) => {
            currentFilter.kategorie = e.target.value;
            renderWertguthabenTable();
        });
        filterKategorie.dataset.listenerAttached = 'true';
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
        resetFilters.addEventListener('click', resetWertguthabenFiltersToDefault);
        resetFilters.dataset.listenerAttached = 'true';
    }

    const openEinloeseBtn = document.getElementById('btn-open-einloese-system');
    if (openEinloeseBtn && !openEinloeseBtn.dataset.listenerAttached) {
        openEinloeseBtn.addEventListener('click', openEinloeseSystemView);
        openEinloeseBtn.dataset.listenerAttached = 'true';
    }

    const closeEinloeseBtn = document.getElementById('btn-close-einloese-system');
    if (closeEinloeseBtn && !closeEinloeseBtn.dataset.listenerAttached) {
        closeEinloeseBtn.addEventListener('click', closeEinloeseSystemView);
        closeEinloeseBtn.dataset.listenerAttached = 'true';
    }

    const einloeseInput = document.getElementById('wg-einloese-id-input');
    if (einloeseInput && !einloeseInput.dataset.listenerAttached) {
        einloeseInput.addEventListener('input', (e) => {
            const term = String(e.target.value || '');
            resetEinloeseResult();
            if (!term.trim()) {
                hideEinloeseSuggestions();
                return;
            }
            updateEinloeseSuggestions(term);
        });
        einloeseInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const firstSuggestion = Object.values(WERTGUTHABEN)
                .filter((entry) => entry.typ !== 'aktionscode')
                .find((entry) => getWertguthabenDisplayId(entry).toLowerCase().includes(String(einloeseInput.value || '').replace('#', '').trim().toLowerCase()));
            if (firstSuggestion) {
                window.selectEinloeseWertguthaben(firstSuggestion.id);
            }
        });
        einloeseInput.dataset.listenerAttached = 'true';
    }

    const einloeseBookingBtn = document.getElementById('wg-einloese-open-booking');
    if (einloeseBookingBtn && !einloeseBookingBtn.dataset.listenerAttached) {
        einloeseBookingBtn.addEventListener('click', () => {
            if (!currentEinloeseWertguthabenId) {
                alertUser('Bitte zuerst eine gültige ID auswählen.', 'warning');
                return;
            }
            window.openTransaktionModal(currentEinloeseWertguthabenId, { source: 'einloese' });
        });
        einloeseBookingBtn.dataset.listenerAttached = 'true';
    }

    const detailsToggle = document.getElementById('transaktionDetailsToggle');
    if (detailsToggle && !detailsToggle.dataset.listenerAttached) {
        detailsToggle.addEventListener('click', () => {
            const body = document.getElementById('transaktionDetailsBody');
            const icon = document.getElementById('transaktionDetailsIcon');
            if (!body || !icon) return;
            body.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
        detailsToggle.dataset.listenerAttached = 'true';
    }

    const betragInput = document.getElementById('transaktionBetrag');
    if (betragInput && !betragInput.dataset.listenerAttached) {
        betragInput.addEventListener('input', updateTransaktionPreview);
        betragInput.dataset.listenerAttached = 'true';
    }

    const allesEinloesenBtn = document.getElementById('transaktionAllesEinloesenBtn');
    if (allesEinloesenBtn && !allesEinloesenBtn.dataset.listenerAttached) {
        allesEinloesenBtn.addEventListener('click', () => {
            const input = document.getElementById('transaktionBetrag');
            if (!input) return;
            input.value = transaktionModalState.originalRestwert.toFixed(2);
            updateTransaktionPreview();
        });
        allesEinloesenBtn.dataset.listenerAttached = 'true';
    }
}

function addWertguthabenFilterFromUi(options = {}) {
    const searchInput = document.getElementById('search-wertguthaben');
    const negateCheckbox = document.getElementById('wg-filter-negate');

    const rawValue = String((options.rawValue ?? searchInput?.value) || '').trim();
    if (!rawValue) {
        alertUser('Bitte einen Suchbegriff eingeben.', 'warning');
        return;
    }

    const category = String(options.category || 'all');
    const negate = !!negateCheckbox?.checked;
    const value = rawValue.toLowerCase();

    const duplicate = activeWertguthabenFilters.some((f) => f.category === category && f.value === value && !!f.negate === negate);
    if (duplicate) {
        if (searchInput) searchInput.value = '';
        if (negateCheckbox) negateCheckbox.checked = false;
        hideWertguthabenSearchSuggestions();
        return;
    }

    activeWertguthabenFilters.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        category,
        value,
        rawValue,
        negate,
        label: WG_FILTER_LABELS[category] || category
    });

    if (searchInput) searchInput.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;
    hideWertguthabenSearchSuggestions();

    renderWertguthabenSearchTags();
    renderWertguthabenTable();
}

function openEinloeseSystemView() {
    document.getElementById('wertguthabenDashboardSection')?.classList.add('hidden');
    document.getElementById('wertguthabenEinloeseSection')?.classList.remove('hidden');
    resetEinloeseSystemForm(true);
}

function closeEinloeseSystemView() {
    document.getElementById('wertguthabenEinloeseSection')?.classList.add('hidden');
    document.getElementById('wertguthabenDashboardSection')?.classList.remove('hidden');
    hideEinloeseSuggestions();
}

function resetEinloeseResult() {
    currentEinloeseWertguthabenId = '';
    document.getElementById('wg-einloese-result')?.classList.add('hidden');
    document.getElementById('wg-einloese-empty-state')?.classList.remove('hidden');
}

function resetEinloeseSystemForm(focusInput = false) {
    const input = document.getElementById('wg-einloese-id-input');
    if (input) input.value = '';
    resetEinloeseResult();
    hideEinloeseSuggestions();
    if (focusInput && input) {
        setTimeout(() => input.focus(), 0);
    }
}

function hideEinloeseSuggestions() {
    document.getElementById('wg-einloese-suggestions-box')?.classList.add('hidden');
}

function updateEinloeseSuggestions(term) {
    const box = document.getElementById('wg-einloese-suggestions-box');
    const list = document.getElementById('wg-einloese-suggestions-list');
    if (!box || !list) return;

    const normalized = String(term || '').replace('#', '').trim().toLowerCase();
    if (!normalized) {
        list.innerHTML = '';
        box.classList.add('hidden');
        return;
    }

    const candidates = Object.values(WERTGUTHABEN)
        .filter((entry) => entry.typ !== 'aktionscode')
        .map((entry) => ({
            entry,
            idText: getWertguthabenDisplayId(entry).toLowerCase()
        }))
        .filter(({ idText }) => idText.includes(normalized))
        .sort((a, b) => {
            const aStarts = a.idText.startsWith(normalized) ? 0 : 1;
            const bStarts = b.idText.startsWith(normalized) ? 0 : 1;
            return aStarts - bStarts || a.idText.localeCompare(b.idText);
        })
        .slice(0, 12)
        .map(({ entry }) => entry);

    if (candidates.length === 0) {
        list.innerHTML = '<li class="px-4 py-3 text-sm text-gray-500">Keine passende ID gefunden.</li>';
        box.classList.remove('hidden');
        return;
    }

    list.innerHTML = candidates.map((entry) => {
        const displayId = getWertguthabenDisplayId(entry);
        const restwert = entry.restwert !== undefined ? Number(entry.restwert || 0) : Number(entry.wert || 0);
        return `
            <li>
                <button type="button" onclick="window.selectEinloeseWertguthaben('${entry.id}')" class="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-gray-100 last:border-0">
                    <div class="flex items-center justify-between gap-3">
                        <span class="font-mono font-bold text-emerald-700">#${escapeHtml(displayId)}</span>
                        <span class="text-sm font-semibold text-gray-700">${restwert.toFixed(2)} €</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1">${escapeHtml(entry.name || '-')} · ${escapeHtml(entry.unternehmen || '-')}</div>
                </button>
            </li>
        `;
    }).join('');
    box.classList.remove('hidden');
}

function refreshEinloeseSelection() {
    if (!currentEinloeseWertguthabenId) return;
    const entry = WERTGUTHABEN[currentEinloeseWertguthabenId];
    if (!entry) {
        resetEinloeseResult();
        return;
    }
    renderEinloeseEntry(entry);
}

function renderEinloeseEntry(entry) {
    const restwert = entry.restwert !== undefined ? Number(entry.restwert || 0) : Number(entry.wert || 0);
    const status = STATUS_CONFIG[entry.status || 'aktiv'] || STATUS_CONFIG.aktiv;
    const eigentuemer = USERS[entry.eigentuemer]?.name || entry.eigentuemer || 'Unbekannt';
    const restzeit = entry.typ === 'aktionscode' ? calculateRestzeit(entry.gueltigBis) : calculateRestzeit(entry.einloesefrist);

    const detailItems = [
        ['Eigentümer', eigentuemer],
        ['Status', `${status.icon} ${status.label}`],
        ['Unternehmen', entry.unternehmen || '-'],
        ['Name', entry.name || '-'],
        ['Ursprungswert', `${Number(entry.wert || 0).toFixed(2)} €`],
        ['Restzeit', restzeit.replace(/<[^>]+>/g, '')],
        ['Einlösefrist', entry.einloesefrist ? new Date(entry.einloesefrist).toLocaleDateString('de-DE') : 'Unbegrenzt'],
        ['Code', entry.code || '-'],
        ['PIN', entry.pin || '-'],
        ['Seriennummer', entry.seriennummer || '-']
    ];

    const details = document.getElementById('wg-einloese-details');
    if (details) {
        details.innerHTML = detailItems.map(([label, value]) => `
            <div class="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">${escapeHtml(label)}</p>
                <p class="text-base font-semibold text-gray-800 break-words">${escapeHtml(String(value))}</p>
            </div>
        `).join('');
    }

    const stamp = document.getElementById('wg-einloese-verified-stamp');
    const verificationMeta = getWertguthabenVerificationMeta(entry);
    if (stamp) {
        if (verificationMeta) {
            stamp.textContent = `✅ ${verificationMeta}`;
            stamp.classList.remove('hidden');
        } else {
            stamp.classList.add('hidden');
            stamp.textContent = '';
        }
    }

    const balance = document.getElementById('wg-einloese-current-balance');
    if (balance) balance.textContent = `${restwert.toFixed(2)} €`;

    document.getElementById('wg-einloese-empty-state')?.classList.add('hidden');
    document.getElementById('wg-einloese-result')?.classList.remove('hidden');
}

window.selectEinloeseWertguthaben = function(entryId) {
    const entry = WERTGUTHABEN[entryId];
    if (!entry) {
        alertUser('Wertguthaben nicht gefunden.', 'error');
        return;
    }

    currentEinloeseWertguthabenId = entryId;
    const input = document.getElementById('wg-einloese-id-input');
    if (input) input.value = `#${getWertguthabenDisplayId(entry)}`;
    hideEinloeseSuggestions();
    renderEinloeseEntry(entry);
};

function hideWertguthabenSearchSuggestions() {
    document.getElementById('wg-search-suggestions-box')?.classList.add('hidden');
}

function updateWertguthabenSearchSuggestions(term) {
    const box = document.getElementById('wg-search-suggestions-box');
    const list = document.getElementById('wg-search-suggestions-list');
    if (!box || !list) return;

    if (!term || !term.trim()) {
        list.innerHTML = '';
        box.classList.add('hidden');
        return;
    }

    const lowerTerm = term.toLowerCase().trim();
    const data = Object.values(WERTGUTHABEN);
    list.innerHTML = '';

    const categories = ['id', 'name', 'code', 'unternehmen', 'kategorie', 'eigentuemer', 'typ', 'status', 'betrag'];
    let hasHits = false;

    categories.forEach((category) => {
        const hasCategoryHit = data.some((entry) =>
            doesWertguthabenMatchSearchFilter(entry, { category, value: lowerTerm })
        );
        if (!hasCategoryHit) return;

        hasHits = true;
        const li = document.createElement('li');
        li.className = 'px-3 py-2 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
        li.innerHTML = `
            <span class="text-lg">${WG_SUGGESTION_ICONS[category] || '🔎'}</span>
            <div class="flex-grow leading-tight">
                <span class="font-bold text-gray-800 block">${WG_FILTER_LABELS[category] || category}: ${term}</span>
                <span class="text-xs text-gray-500">Filter in ${WG_FILTER_LABELS[category] || category}</span>
            </div>
        `;
        li.onclick = () => addWertguthabenFilterFromUi({ category, rawValue: term });
        list.appendChild(li);
    });

    const fallback = document.createElement('li');
    fallback.className = 'px-3 py-2 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
    fallback.innerHTML = `
        <span class="text-lg">${WG_SUGGESTION_ICONS.all}</span>
        <div class="flex-grow leading-tight">
            <span class="font-bold text-gray-800 block">Alles: ${term}</span>
            <span class="text-xs text-gray-500">Volltextsuche</span>
        </div>
    `;
    fallback.onclick = () => addWertguthabenFilterFromUi({ category: 'all', rawValue: term });
    list.appendChild(fallback);

    box.classList.toggle('hidden', !hasHits && !term.trim());
    if (!box.classList.contains('hidden')) return;
    box.classList.remove('hidden');
}

function removeWertguthabenFilterById(filterId) {
    activeWertguthabenFilters = activeWertguthabenFilters.filter((f) => f.id !== filterId);
    renderWertguthabenSearchTags();
    renderWertguthabenTable();
}

function renderWertguthabenSearchTags() {
    const container = document.getElementById('wg-active-filters');
    if (!container) return;

    if (activeWertguthabenFilters.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = activeWertguthabenFilters.map((filter) => `
        <div class="flex items-center ${filter.negate ? 'bg-red-100 text-red-800 border-red-200' : 'bg-indigo-100 text-indigo-800 border-indigo-200'} text-xs font-bold px-2 py-1 rounded-full border">
            ${filter.negate ? '<span class="mr-1 text-red-600">NICHT</span>' : ''}
            <span>${filter.label}: ${filter.rawValue}</span>
            <button onclick="window.removeWertguthabenFilterById(${filter.id})" class="ml-1 ${filter.negate ? 'text-red-500 hover:text-red-900' : 'text-indigo-500 hover:text-indigo-900'} focus:outline-none" title="Filter entfernen">&times;</button>
        </div>
    `).join('');
}

function resetWertguthabenFiltersToDefault() {
    activeWertguthabenFilters = [];
    wertguthabenSearchJoinMode = 'and';
    currentFilter = { typ: '', kategorie: '', eigentuemer: '', status: 'aktiv' };

    const searchInput = document.getElementById('search-wertguthaben');
    const negate = document.getElementById('wg-filter-negate');
    const joinMode = document.getElementById('wg-search-join-mode');
    const filterTyp = document.getElementById('filter-wg-typ');
    const filterKategorie = document.getElementById('filter-wg-kategorie');
    const filterEigentuemer = document.getElementById('filter-wg-eigentuemer');
    const filterStatus = document.getElementById('filter-wg-status');

    if (searchInput) searchInput.value = '';
    if (negate) negate.checked = false;
    if (joinMode) joinMode.value = 'and';
    if (filterTyp) filterTyp.value = '';
    if (filterKategorie) filterKategorie.value = '';
    if (filterEigentuemer) filterEigentuemer.value = '';
    if (filterStatus) filterStatus.value = 'aktiv';
    hideWertguthabenSearchSuggestions();

    renderWertguthabenSearchTags();
    renderWertguthabenTable();
}

function doesWertguthabenMatchSearchFilter(wertguthabenEintrag, filter) {
    const value = filter.value;
    const normalizedValue = String(value || '').replace(',', '.');
    const fixedId = getWertguthabenDisplayId(wertguthabenEintrag).toLowerCase();
    const name = (wertguthabenEintrag.name || '').toLowerCase();
    const code = (wertguthabenEintrag.code || '').toLowerCase();
    const unternehmen = (wertguthabenEintrag.unternehmen || '').toLowerCase();
    const kategorie = normalizeWertguthabenKategorie(wertguthabenEintrag.kategorie).toLowerCase();
    const eigentuemerId = String(wertguthabenEintrag.eigentuemer || '').toLowerCase();
    const eigentuemerName = (USERS[wertguthabenEintrag.eigentuemer]?.name || wertguthabenEintrag.eigentuemer || '').toLowerCase();
    const typ = String(wertguthabenEintrag.typ || '').toLowerCase();
    const typLabel = (TYP_CONFIG[wertguthabenEintrag.typ]?.label || '').toLowerCase();
    const statusKey = String(wertguthabenEintrag.status || 'aktiv').toLowerCase();
    const statusLabel = (STATUS_CONFIG[wertguthabenEintrag.status || 'aktiv']?.label || '').toLowerCase();
    const wert = Number(wertguthabenEintrag.wert || 0);
    const restwert = wertguthabenEintrag.restwert !== undefined ? Number(wertguthabenEintrag.restwert || 0) : wert;
    const amountValues = [
        wert.toFixed(2),
        restwert.toFixed(2),
        `${wert.toFixed(2)} €`,
        `${restwert.toFixed(2)} €`
    ].map((entry) => entry.toLowerCase().replace(',', '.'));

    switch (filter.category) {
        case 'id':
            return fixedId.includes(value);
        case 'name':
            return name.includes(value);
        case 'code':
            return code.includes(value);
        case 'unternehmen':
            return unternehmen.includes(value);
        case 'kategorie':
            return kategorie.includes(value);
        case 'eigentuemer':
            return eigentuemerName.includes(value) || eigentuemerId.includes(value);
        case 'typ':
            return typ.includes(value) || typLabel.includes(value);
        case 'status':
            return statusKey.includes(value) || statusLabel.includes(value);
        case 'betrag':
            return amountValues.some((entry) => entry.includes(normalizedValue));
        case 'all':
        default:
            return fixedId.includes(value) ||
                name.includes(value) ||
                code.includes(value) ||
                unternehmen.includes(value) ||
                kategorie.includes(value) ||
                eigentuemerName.includes(value) ||
                eigentuemerId.includes(value) ||
                typ.includes(value) ||
                typLabel.includes(value) ||
                statusKey.includes(value) ||
                statusLabel.includes(value) ||
                amountValues.some((entry) => entry.includes(normalizedValue));
    }
}

// ========================================
// FIREBASE LISTENER
// ========================================
export function stopWertguthabenListener() {
    if (unsubscribeWertguthaben) {
        unsubscribeWertguthaben();
        unsubscribeWertguthaben = null;
        console.log("🛑 Wertguthaben-Listener gestoppt.");
    }

    WERTGUTHABEN = {};
    try {
        renderWertguthabenTable();
        updateStatistics();
    } catch (e) {
        console.warn("Wertguthaben: UI konnte nach stopWertguthabenListener nicht aktualisiert werden:", e);
    }
}

export function listenForWertguthaben() {
    if (!currentUser?.mode || currentUser.mode === 'Gast') {
        stopWertguthabenListener();
        WERTGUTHABEN = {};
        renderWertguthabenTable();
        updateStatistics();
        return;
    }

    if (!wertguthabenCollection) {
        console.warn("⚠️ Wertguthaben-Collection noch nicht initialisiert. Warte...");
        setTimeout(listenForWertguthaben, 500);
        return;
    }

    try {
        stopWertguthabenListener();

        // DATENSCHUTZ-FIX: Nur Wertguthaben laden, die vom aktuellen User erstellt wurden
        // ODER wo der User als Eigentümer eingetragen ist
        const q = query(wertguthabenCollection, orderBy('createdAt', 'desc'));
        
        unsubscribeWertguthaben = onSnapshot(q, (snapshot) => {
            WERTGUTHABEN = {};
            
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                
                // DATENSCHUTZ: Nur eigene Einträge speichern
                // (erstellt von mir ODER ich bin Eigentümer)
                if (data.createdBy === currentUser.mode || data.eigentuemer === currentUser.mode) {
                    const normalizedCategory = normalizeWertguthabenKategorie(data.kategorie);
                    const normalizedFixedId = normalizeFixedId(data.fixedId);

                    WERTGUTHABEN[docSnap.id] = {
                        id: docSnap.id,
                        ...data,
                        kategorie: normalizedCategory,
                        fixedId: normalizedFixedId || ''
                    };

                    if (data.kategorie !== normalizedCategory) {
                        normalizeKategorieInFirestore(docSnap.id, normalizedCategory);
                    }

                    if (!normalizedFixedId) {
                        ensureEntryHasFixedId(docSnap.id);
                    }
                }
            });

            console.log(`✅ ${Object.keys(WERTGUTHABEN).length} Wertguthaben geladen (nur eigene)`);
            renderWertguthabenTable();
            updateStatistics();
            checkWertguthabenForNotifications();
            refreshEinloeseSelection();
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
    if (currentFilter.kategorie) {
        wertguthaben = wertguthaben.filter(w => normalizeWertguthabenKategorie(w.kategorie) === currentFilter.kategorie);
    }
    if (currentFilter.eigentuemer) {
        wertguthaben = wertguthaben.filter(w => w.eigentuemer === currentFilter.eigentuemer);
    }
    if (currentFilter.status) {
        wertguthaben = wertguthaben.filter(w => (w.status || 'aktiv') === currentFilter.status);
    }

    // Tag-Filter (AND/OR + NICHT)
    if (activeWertguthabenFilters.length > 0) {
        wertguthaben = wertguthaben.filter((eintrag) => {
            const evaluate = (filter) => {
                const matches = doesWertguthabenMatchSearchFilter(eintrag, filter);
                return filter.negate ? !matches : matches;
            };

            return wertguthabenSearchJoinMode === 'or'
                ? activeWertguthabenFilters.some(evaluate)
                : activeWertguthabenFilters.every(evaluate);
        });
    }

    if (wertguthaben.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="px-4 py-8 text-center text-gray-400 italic">
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
        const verificationBadge = renderWertguthabenVerificationBadge(w);
        
        return `
            <tr class="hover:bg-gray-50 cursor-pointer transition" onclick="window.openWertguthabenDetails('${w.id}')">
                <td class="px-4 py-3 text-sm">${eigentuemerName}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${typConfig.color}">
                        ${typConfig.icon} ${typConfig.label}
                    </span>
                </td>
                <td class="px-4 py-3 text-sm font-mono font-bold text-gray-700">#${escapeHtml(getWertguthabenDisplayId(w))}</td>
                <td class="px-4 py-3 text-sm">${escapeHtml(normalizeWertguthabenKategorie(w.kategorie))}</td>
                <td class="px-4 py-3 text-sm font-semibold">${w.name || '-'}</td>
                <td class="px-4 py-3 text-sm text-gray-600">${w.unternehmen || '-'}</td>
                <td class="px-4 py-3 text-sm">
                    <div class="flex flex-col">
                        <span class="font-bold text-emerald-700">${restwert !== undefined ? restwert.toFixed(2) + ' €' : '-'}</span>
                        ${w.wert && w.wert !== restwert ? `<span class="text-xs text-gray-500">von ${w.wert.toFixed(2)} €</span>` : ''}
                        ${verificationBadge}
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
// BENACHRICHTIGUNGEN PRÜFEN
// ========================================
async function checkWertguthabenForNotifications() {
    if (!currentUser || !currentUser.mode) return;
    
    const eintraege = Object.values(WERTGUTHABEN);
    
    for (const eintrag of eintraege) {
        // Nur aktive Einträge prüfen
        if (eintrag.status !== 'aktiv') continue;
        
        const gutscheinName = eintrag.name || 'Unbekannter Gutschein';
        
        // X Tage vor Einlösefrist
        if (eintrag.einloesefrist) {
            const einloesefrist = new Date(eintrag.einloesefrist);
            await createPendingNotification(
                currentUser.mode,
                'WERTGUTHABEN',
                'x_tage_vor_einloesefrist',
                {
                    id: eintrag.id,
                    targetDate: einloesefrist,
                    gutscheinName,
                    ablaufDatum: einloesefrist.toLocaleDateString('de-DE'),
                    wert: eintrag.wert || 0
                }
            );
        }
        
        // X Tage vor Ablauf Code (nur für Aktionscode)
        if (eintrag.typ === 'Aktionscode' && eintrag.ablaufDatumCode) {
            const ablaufDatumCode = new Date(eintrag.ablaufDatumCode);
            await createPendingNotification(
                currentUser.mode,
                'WERTGUTHABEN',
                'x_tage_vor_ablauf_code',
                {
                    id: eintrag.id,
                    targetDate: ablaufDatumCode,
                    gutscheinName,
                    ablaufDatum: ablaufDatumCode.toLocaleDateString('de-DE')
                }
            );
        }
        
        // X Tage vor Warnung (basierend auf warnungVorAblauf Feld)
        if (eintrag.warnungVorAblauf && eintrag.einloesefrist) {
            const einloesefrist = new Date(eintrag.einloesefrist);
            await createPendingNotification(
                currentUser.mode,
                'WERTGUTHABEN',
                'x_tage_vor_warnung',
                {
                    id: eintrag.id,
                    targetDate: einloesefrist,
                    gutscheinName
                }
            );
        }
        
        // X Tage vor Gültig ab (nur für Aktionscode)
        if (eintrag.typ === 'Aktionscode' && eintrag.gueltigAb) {
            const gueltigAb = new Date(eintrag.gueltigAb);
            await createPendingNotification(
                currentUser.mode,
                'WERTGUTHABEN',
                'x_tage_vor_gueltig_ab',
                {
                    id: eintrag.id,
                    targetDate: gueltigAb,
                    gutscheinName,
                    gueltigAb: gueltigAb.toLocaleDateString('de-DE')
                }
            );
        }
        
        // X Tage vor Gültig bis (nur für Aktionscode)
        if (eintrag.typ === 'Aktionscode' && eintrag.gueltigBis) {
            const gueltigBis = new Date(eintrag.gueltigBis);
            await createPendingNotification(
                currentUser.mode,
                'WERTGUTHABEN',
                'x_tage_vor_gueltig_bis',
                {
                    id: eintrag.id,
                    targetDate: gueltigBis,
                    gutscheinName,
                    gueltigBis: gueltigBis.toLocaleDateString('de-DE')
                }
            );
        }
    }
    
    // Benachrichtigungen neu laden
    await renderPendingNotifications();
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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toDateValue(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (value.toDate && typeof value.toDate === 'function') {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value.seconds === 'number') {
        const date = new Date(value.seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
    const date = toDateValue(value);
    if (!date) return '';
    return date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getDisplayUserName(userId) {
    if (!userId) return 'Unbekannt';
    return USERS[userId]?.name || userId;
}

function getWertguthabenVerificationMeta(entry) {
    if (!entry?.restwertVerifiziert) return null;
    const timestamp = formatDateTime(entry.restwertVerifiziertAm);
    const userName = getDisplayUserName(entry.restwertVerifiziertVon);
    if (timestamp) return `Verifiziert am ${timestamp} von ${userName}`;
    return `Verifiziert von ${userName}`;
}

function renderWertguthabenVerificationBadge(entry, className = 'text-emerald-700') {
    const meta = getWertguthabenVerificationMeta(entry);
    if (!meta) return '';
    return `<span class="text-[11px] font-semibold ${className}">✅ ${escapeHtml(meta)}</span>`;
}

function normalizeFixedId(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, WG_SHORT_ID_LENGTH);
}

function getWertguthabenDisplayId(entry) {
    const fixedId = normalizeFixedId(entry?.fixedId);
    if (fixedId) return fixedId;
    return String(entry?.id || '').slice(-WG_SHORT_ID_LENGTH).toUpperCase();
}

function sanitizeWertguthabenKategorien(rawCategories) {
    const unique = new Set();
    (Array.isArray(rawCategories) ? rawCategories : []).forEach((item) => {
        const value = String(item || '').trim();
        if (!value) return;
        if (value.toLowerCase() === WG_UNASSIGNED_KATEGORIE.toLowerCase()) return;
        unique.add(value);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'de'));
}

function getAllWertguthabenKategorien() {
    return [WG_UNASSIGNED_KATEGORIE, ...sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien)];
}

function normalizeWertguthabenKategorie(rawCategory) {
    const category = String(rawCategory || '').trim();
    if (!category) return WG_UNASSIGNED_KATEGORIE;
    const all = getAllWertguthabenKategorien();
    return all.includes(category) ? category : WG_UNASSIGNED_KATEGORIE;
}

function populateKategorieDropdowns() {
    const allCategories = getAllWertguthabenKategorien();

    const formSelect = document.getElementById('wgKategorie');
    if (formSelect) {
        const previous = normalizeWertguthabenKategorie(formSelect.value);
        formSelect.innerHTML = allCategories
            .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
            .join('');
        formSelect.value = allCategories.includes(previous) ? previous : WG_UNASSIGNED_KATEGORIE;
    }

    const filterSelect = document.getElementById('filter-wg-kategorie');
    if (filterSelect) {
        const previous = String(filterSelect.value || '');
        filterSelect.innerHTML = `
            <option value="">Alle Kategorien</option>
            ${allCategories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
        `;
        filterSelect.value = allCategories.includes(previous) ? previous : '';
        currentFilter.kategorie = filterSelect.value;
    }
}

function renderWertguthabenKategorieSettingsList() {
    const container = document.getElementById('wg-settings-kategorien-list');
    if (!container) return;

    const editable = sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien);
    if (editable.length === 0) {
        container.innerHTML = `
            <div class="p-3 rounded-lg border border-emerald-100 bg-emerald-50">
                <p class="text-sm font-semibold text-emerald-900">Fix: ${escapeHtml(WG_UNASSIGNED_KATEGORIE)}</p>
                <p class="text-xs text-emerald-700">Keine zusätzlichen Kategorien vorhanden.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="p-2 rounded-lg border border-emerald-100 bg-emerald-50 mb-2">
            <p class="text-xs font-semibold text-emerald-900">Fixe Kategorie: ${escapeHtml(WG_UNASSIGNED_KATEGORIE)}</p>
        </div>
        ${editable.map((category) => `
            <div class="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-200 bg-white">
                <span class="text-sm font-semibold text-gray-800 truncate">${escapeHtml(category)}</span>
                <div class="flex gap-1">
                    <button onclick="window.renameWertguthabenKategorie(decodeURIComponent('${encodeURIComponent(category)}'))" class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded hover:bg-blue-200">Bearbeiten</button>
                    <button onclick="window.deleteWertguthabenKategorie(decodeURIComponent('${encodeURIComponent(category)}'))" class="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200">Löschen</button>
                </div>
            </div>
        `).join('')}
    `;
}

function persistWertguthabenSettings() {
    try {
        saveUserSetting('wertguthabenSettings', wertguthabenSettings);
        return true;
    } catch (error) {
        console.error('Konnte Wertguthaben-Einstellungen nicht speichern:', error);
        alertUser('Einstellungen konnten nicht gespeichert werden.', 'error');
        return false;
    }
}

function addWertguthabenKategorieFromSettings() {
    const input = document.getElementById('new-wg-kategorie-input');
    if (!input) return;

    const raw = String(input.value || '').trim();
    if (!raw) {
        alertUser('Bitte eine Kategorie eingeben.', 'warning');
        return;
    }
    if (raw.toLowerCase() === WG_UNASSIGNED_KATEGORIE.toLowerCase()) {
        alertUser('"Nicht zugeordnet" ist bereits fix vorhanden.', 'warning');
        return;
    }

    const current = sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien);
    if (current.some((item) => item.toLowerCase() === raw.toLowerCase())) {
        alertUser('Kategorie existiert bereits.', 'warning');
        return;
    }

    wertguthabenSettings.kategorien = sanitizeWertguthabenKategorien([...current, raw]);
    if (!persistWertguthabenSettings()) return;
    input.value = '';
    populateKategorieDropdowns();
    renderWertguthabenKategorieSettingsList();
}

window.renameWertguthabenKategorie = async function(oldCategory) {
    const current = sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien);
    if (!current.includes(oldCategory)) return;

    const next = prompt('Kategorie umbenennen:', oldCategory);
    if (next === null) return;

    const trimmed = String(next || '').trim();
    if (!trimmed) {
        alertUser('Kategorie darf nicht leer sein.', 'warning');
        return;
    }
    if (trimmed.toLowerCase() === WG_UNASSIGNED_KATEGORIE.toLowerCase()) {
        alertUser('"Nicht zugeordnet" ist reserviert.', 'warning');
        return;
    }
    if (current.some((item) => item.toLowerCase() === trimmed.toLowerCase() && item !== oldCategory)) {
        alertUser('Diese Kategorie existiert bereits.', 'warning');
        return;
    }

    wertguthabenSettings.kategorien = current.map((item) => (item === oldCategory ? trimmed : item));
    if (!persistWertguthabenSettings()) return;
    populateKategorieDropdowns();
    renderWertguthabenKategorieSettingsList();
    await reassignKategorieInEntries(oldCategory, trimmed);
};

window.deleteWertguthabenKategorie = async function(category) {
    const current = sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien);
    if (!current.includes(category)) return;

    if (!confirm(`Kategorie "${category}" löschen?\nBetroffene Einträge werden auf "${WG_UNASSIGNED_KATEGORIE}" gesetzt.`)) {
        return;
    }

    wertguthabenSettings.kategorien = current.filter((item) => item !== category);
    if (!persistWertguthabenSettings()) return;
    populateKategorieDropdowns();
    renderWertguthabenKategorieSettingsList();
    await reassignKategorieInEntries(category, WG_UNASSIGNED_KATEGORIE);
};

async function reassignKategorieInEntries(fromCategory, toCategory) {
    const target = normalizeWertguthabenKategorie(toCategory);
    const updates = Object.values(WERTGUTHABEN)
        .filter((entry) => normalizeWertguthabenKategorie(entry.kategorie) === fromCategory)
        .map((entry) => updateDoc(doc(wertguthabenCollection, entry.id), {
            kategorie: target,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        }));

    if (updates.length === 0) return;
    try {
        await Promise.all(updates);
    } catch (error) {
        console.warn('Kategorie-Reassign fehlgeschlagen:', error);
    }
}

async function normalizeKategorieInFirestore(entryId, normalizedCategory) {
    if (pendingKategorieNormalizations.has(entryId)) return;
    pendingKategorieNormalizations.add(entryId);
    try {
        await updateDoc(doc(wertguthabenCollection, entryId), {
            kategorie: normalizedCategory,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        });
    } catch (error) {
        console.warn('Kategorie-Normalisierung fehlgeschlagen:', error);
    } finally {
        pendingKategorieNormalizations.delete(entryId);
    }
}

function createRandomShortId() {
    let id = '';
    for (let i = 0; i < WG_SHORT_ID_LENGTH; i += 1) {
        id += WG_SHORT_ID_CHARS[Math.floor(Math.random() * WG_SHORT_ID_CHARS.length)];
    }
    return id;
}

async function loadUsedPaymentShortIds() {
    if (!paymentsCollection) return new Set();
    try {
        const snapshot = await getDocs(paymentsCollection);
        const used = new Set();
        snapshot.forEach((docSnap) => {
            used.add(String(docSnap.id || '').slice(-WG_SHORT_ID_LENGTH).toUpperCase());
        });
        return used;
    } catch (error) {
        console.warn('Konnte Zahlungs-IDs nicht laden:', error);
        return new Set();
    }
}

async function loadReservedGlobalShortIds() {
    if (!globalShortIdsCollection) return new Set();
    try {
        const snapshot = await getDocs(globalShortIdsCollection);
        const reserved = new Set();
        snapshot.forEach((docSnap) => {
            reserved.add(String(docSnap.id || '').toUpperCase());
        });
        return reserved;
    } catch (error) {
        console.warn('Konnte reservierte IDs nicht laden:', error);
        return new Set();
    }
}

async function reserveGlobalShortId(candidate) {
    if (!globalShortIdsCollection || !db) return false;
    const reservationRef = doc(globalShortIdsCollection, candidate);

    try {
        await runTransaction(db, async (transaction) => {
            const existing = await transaction.get(reservationRef);
            if (existing.exists()) {
                throw new Error('exists');
            }
            transaction.set(reservationRef, {
                module: 'wertguthaben',
                createdBy: currentUser.mode,
                createdAt: serverTimestamp()
            });
        });
        return true;
    } catch (_error) {
        return false;
    }
}

async function generateUniqueGlobalShortId() {
    const usedIds = new Set();

    Object.values(WERTGUTHABEN).forEach((entry) => {
        usedIds.add(getWertguthabenDisplayId(entry));
    });

    const paymentIds = await loadUsedPaymentShortIds();
    paymentIds.forEach((id) => usedIds.add(id));

    const reservedIds = await loadReservedGlobalShortIds();
    reservedIds.forEach((id) => usedIds.add(id));

    for (let attempt = 0; attempt < WG_MAX_SHORT_ID_ATTEMPTS; attempt += 1) {
        const candidate = createRandomShortId();
        if (usedIds.has(candidate)) continue;
        const reserved = await reserveGlobalShortId(candidate);
        if (reserved) return candidate;
    }

    throw new Error('Konnte keine freie globale ID erzeugen. Bitte erneut versuchen.');
}

async function ensureEntryHasFixedId(entryId) {
    if (pendingFixedIdAssignments.has(entryId)) return;
    pendingFixedIdAssignments.add(entryId);

    try {
        const fixedId = await generateUniqueGlobalShortId();
        await updateDoc(doc(wertguthabenCollection, entryId), {
            fixedId,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        });
    } catch (error) {
        console.warn('Fixe ID konnte nicht nachgezogen werden:', error);
    } finally {
        pendingFixedIdAssignments.delete(entryId);
    }
}

// Reset form
function resetForm() {
    document.getElementById('wgEigentuemer').value = 'self';
    document.getElementById('wgEigentuemerFrei').classList.add('hidden');
    document.getElementById('wgTyp').value = 'gutschein';
    document.getElementById('wgStatus').value = 'aktiv';
    document.getElementById('wgWert').value = '';
    document.getElementById('wgKategorie').value = WG_UNASSIGNED_KATEGORIE;
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
    document.getElementById('wertguthabenModalTitle').textContent = 'Neues Wertguthaben';
    document.getElementById('editWertguthabenId').value = '';
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

    const selectedKategorie = normalizeWertguthabenKategorie(document.getElementById('wgKategorie').value);
    if (!selectedKategorie) {
        return alertUser('Bitte eine Kategorie auswählen!', 'error');
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
        kategorie: selectedKategorie,
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
            data.fixedId = await generateUniqueGlobalShortId();
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
    document.getElementById('wgKategorie').value = normalizeWertguthabenKategorie(wg.kategorie);
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

function updateTransaktionPreview() {
    const betragInput = document.getElementById('transaktionBetrag');
    const typSelect = document.getElementById('transaktionTyp');
    const verfuegbar = document.getElementById('transaktionVerfuegbar');
    const urspruenglich = document.getElementById('transaktionUrspruenglich');
    if (!betragInput || !typSelect || !verfuegbar || !urspruenglich) return;

    if (typSelect.value === 'einloesung') {
        const max = transaktionModalState.maxEinloesungen;
        const current = transaktionModalState.bereitsEingeloest;
        const availableText = max > 0 ? `${Math.max(0, max - current)} verfügbar` : '∞ verfügbar';
        verfuegbar.textContent = `${current} / ${max > 0 ? max : '∞'} (${availableText})`;
        urspruenglich.textContent = 'Aktionscode';
        return;
    }

    const entered = Math.max(0, Number.parseFloat(betragInput.value || '0') || 0);
    let nextRestwert = transaktionModalState.originalRestwert;
    if (typSelect.value === 'verwendung') {
        nextRestwert = transaktionModalState.originalRestwert - entered;
    } else if (typSelect.value === 'gutschrift') {
        nextRestwert = transaktionModalState.originalRestwert + entered;
    }

    if (typSelect.value === 'verwendung') {
        nextRestwert = Math.max(0, nextRestwert);
    }

    verfuegbar.textContent = `${nextRestwert.toFixed(2)} €`;
    urspruenglich.textContent = `${transaktionModalState.originalRestwert.toFixed(2)} €`;
}

function setTransaktionDetailsExpanded(expanded) {
    const body = document.getElementById('transaktionDetailsBody');
    const icon = document.getElementById('transaktionDetailsIcon');
    if (!body || !icon) return;
    body.classList.toggle('hidden', !expanded);
    icon.classList.toggle('rotate-180', !!expanded);
}

// Transaktion Modal öffnen
window.openTransaktionModal = async function(wertguthabenId, options = {}) {
    const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
    const wertguthabenDoc = await getDoc(wertguthabenRef);

    if (!wertguthabenDoc.exists()) {
        return alertUser('Wertguthaben nicht gefunden!', 'error');
    }

    const wg = wertguthabenDoc.data();
    WERTGUTHABEN[wertguthabenId] = { ...wg, id: wertguthabenId };

    const source = options.source === 'einloese' ? 'einloese' : 'dashboard';
    const editTransaktion = options.editTransaktion || null;
    const isEditFromHistory = !!editTransaktion && !!options.openedFromHistory;

    const transaktionTypSelect = document.getElementById('transaktionTyp');
    const transaktionBetragInput = document.getElementById('transaktionBetrag');
    const transaktionBetragContainer = document.getElementById('transaktionBetragContainer');
    const transaktionEinloesungContainer = document.getElementById('transaktionEinloesungContainer');
    const transaktionDatumInput = document.getElementById('transaktionDatum');
    const verifySection = document.getElementById('transaktionVerifySection');
    const verifyCheckbox = document.getElementById('transaktionVerifyCheckbox');
    const verifyInfo = document.getElementById('transaktionVerifyInfo');
    const allesEinloesenBtn = document.getElementById('transaktionAllesEinloesenBtn');
    const verfuegbarElement = document.getElementById('transaktionVerfuegbar');
    const betragLabel = document.querySelector('label[for="transaktionBetrag"]') || document.querySelector('#transaktionBetragContainer label');
    const saveBtn = document.getElementById('saveTransaktionBtn');

    document.getElementById('transaktionWertguthabenId').value = wertguthabenId;
    document.getElementById('editTransaktionId').value = editTransaktion?.id || '';
    document.getElementById('transaktionOpenSource').value = source;

    transaktionModalState.source = source;
    transaktionModalState.editTransaktionId = editTransaktion?.id || '';
    transaktionModalState.maxEinloesungen = Number(wg.maxEinloesungen || 0);
    transaktionModalState.bereitsEingeloest = Number(wg.bereitsEingeloest || 0);
    transaktionModalState.isEinloesungMode = false;

    const aktuellerRestwert = Number(wg.restwert !== undefined ? wg.restwert : wg.wert || 0);
    let originalRestwert = aktuellerRestwert;
    if (editTransaktion && (editTransaktion.typ === 'verwendung' || editTransaktion.typ === 'gutschrift')) {
        const originalBetrag = Number(editTransaktion.betrag || 0);
        originalRestwert = editTransaktion.typ === 'verwendung'
            ? aktuellerRestwert + originalBetrag
            : aktuellerRestwert - originalBetrag;
    }
    transaktionModalState.originalRestwert = Math.max(0, originalRestwert);

    let typ = 'verwendung';
    if (wg.typ === 'aktionscode') {
        typ = 'einloesung';
    }
    if (editTransaktion?.typ) {
        typ = editTransaktion.typ;
    }
    if (source === 'einloese') {
        typ = 'verwendung';
    }

    transaktionTypSelect.value = typ;
    transaktionTypSelect.disabled = true;

    if (wg.typ === 'aktionscode' && typ === 'einloesung') {
        if (transaktionBetragContainer) transaktionBetragContainer.classList.add('hidden');
        if (transaktionEinloesungContainer) transaktionEinloesungContainer.classList.remove('hidden');
        if (allesEinloesenBtn) allesEinloesenBtn.classList.add('hidden');
        transaktionModalState.isEinloesungMode = true;
    } else {
        if (transaktionBetragContainer) transaktionBetragContainer.classList.remove('hidden');
        if (transaktionEinloesungContainer) transaktionEinloesungContainer.classList.add('hidden');
        if (allesEinloesenBtn) allesEinloesenBtn.classList.remove('hidden');
    }

    transaktionBetragInput.value = editTransaktion?.betrag !== undefined ? Number(editTransaktion.betrag || 0).toFixed(2) : '';

    if (source === 'einloese') {
        transaktionBetragInput.classList.add('text-3xl', 'font-black');
        if (verfuegbarElement) verfuegbarElement.classList.add('text-4xl');
        if (betragLabel) betragLabel.textContent = 'Betrag einlösen (€) *';
    } else {
        transaktionBetragInput.classList.remove('text-3xl', 'font-black');
        if (verfuegbarElement) verfuegbarElement.classList.remove('text-4xl');
        if (betragLabel) betragLabel.textContent = 'Betrag (€) *';
    }

    const today = new Date().toISOString().split('T')[0];
    transaktionDatumInput.value = today;
    transaktionDatumInput.disabled = source === 'einloese';

    if (editTransaktion?.datum) {
        const editDate = toDateValue(editTransaktion.datum);
        if (editDate) {
            transaktionDatumInput.value = editDate.toISOString().split('T')[0];
        }
    }

    document.getElementById('transaktionBestellnr').value = editTransaktion?.bestellnr || '';
    document.getElementById('transaktionRechnungsnr').value = editTransaktion?.rechnungsnr || '';
    document.getElementById('transaktionBeschreibung').value = editTransaktion?.beschreibung || '';

    if (verifySection && verifyCheckbox && verifyInfo) {
        if (isEditFromHistory) {
            verifySection.classList.remove('hidden');
            const alreadyVerified = !!editTransaktion?.betragVerifiziert;
            verifyCheckbox.checked = alreadyVerified;
            verifyInfo.textContent = alreadyVerified
                ? `Bereits verifiziert: ${formatDateTime(editTransaktion.betragVerifiziertAm)} · ${getDisplayUserName(editTransaktion.betragVerifiziertVon)}`
                : 'Bei Aktivierung wird der Betrag mit Zeitstempel und Benutzer verifiziert.';
        } else {
            verifySection.classList.add('hidden');
            verifyCheckbox.checked = false;
            verifyInfo.textContent = '';
        }
    }

    if (saveBtn) {
        saveBtn.textContent = editTransaktion ? 'Änderungen speichern' : 'Transaktion buchen';
    }

    setTransaktionDetailsExpanded(!!(editTransaktion?.bestellnr || editTransaktion?.rechnungsnr || editTransaktion?.beschreibung));
    updateTransaktionPreview();

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

    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveTransaktion);
        saveBtn.dataset.listenerAttached = 'true';
    }

    document.getElementById('transaktionModal').style.display = 'flex';
};

function closeTransaktionModal() {
    document.getElementById('transaktionModal').style.display = 'none';
    document.getElementById('editTransaktionId').value = '';
    document.getElementById('transaktionOpenSource').value = 'dashboard';
    transaktionModalState.source = 'dashboard';
    transaktionModalState.editTransaktionId = '';
    transaktionModalState.originalRestwert = 0;
    transaktionModalState.isEinloesungMode = false;
    transaktionModalState.maxEinloesungen = 0;
    transaktionModalState.bereitsEingeloest = 0;
    setTransaktionDetailsExpanded(false);
}

// Transaktion speichern
async function saveTransaktion() {
    const wertguthabenId = document.getElementById('transaktionWertguthabenId').value;
    const editTransaktionId = document.getElementById('editTransaktionId').value;
    const source = document.getElementById('transaktionOpenSource').value || 'dashboard';
    const typ = document.getElementById('transaktionTyp').value;
    const betrag = Number.parseFloat(document.getElementById('transaktionBetrag').value || '0') || 0;
    const bestellnr = document.getElementById('transaktionBestellnr').value.trim();
    const rechnungsnr = document.getElementById('transaktionRechnungsnr').value.trim();
    const beschreibung = document.getElementById('transaktionBeschreibung').value.trim();
    const verifySection = document.getElementById('transaktionVerifySection');
    const shouldVerify = !!(verifySection && !verifySection.classList.contains('hidden') && document.getElementById('transaktionVerifyCheckbox')?.checked);

    const wg = WERTGUTHABEN[wertguthabenId];
    if (!wg) {
        return alertUser('Wertguthaben nicht gefunden!', 'error');
    }

    if (typ === 'einloesung') {
        if (editTransaktionId) {
            return alertUser('Einlösung kann hier nicht bearbeitet werden.', 'warning');
        }

        const maxEinloesungen = transaktionModalState.maxEinloesungen;
        const bereitsEingeloest = transaktionModalState.bereitsEingeloest;
        if (maxEinloesungen > 0 && bereitsEingeloest >= maxEinloesungen) {
            return alertUser('Keine Einlösungen mehr verfügbar! Der Aktionscode ist bereits vollständig eingelöst.', 'error');
        }

        try {
            const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');
            await addDoc(transaktionenRef, {
                typ: 'einloesung',
                betrag: 0,
                datum: serverTimestamp(),
                bestellnr,
                rechnungsnr,
                beschreibung: beschreibung || 'Aktionscode eingelöst',
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode
            });

            const neueEinloesungen = bereitsEingeloest + 1;
            const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
            const updateData = {
                bereitsEingeloest: neueEinloesungen,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.mode
            };
            if (maxEinloesungen > 0 && neueEinloesungen >= maxEinloesungen) {
                updateData.status = 'eingeloest';
            }
            await updateDoc(wertguthabenRef, updateData);

            alertUser('Einlösung erfolgreich gebucht!', 'success');
            closeTransaktionModal();
            if (source === 'einloese') {
                resetEinloeseSystemForm(true);
            }
            if (document.getElementById('wertguthabenDetailsModal').style.display === 'flex') {
                setTimeout(() => openWertguthabenDetails(wertguthabenId), 300);
            }
        } catch (error) {
            console.error('Fehler beim Buchen der Einlösung:', error);
            alertUser('Fehler beim Buchen: ' + error.message, 'error');
        }
        return;
    }

    if (!betrag || betrag <= 0) {
        return alertUser('Bitte einen gültigen Betrag eingeben!', 'error');
    }

    if (typ === 'verwendung' && betrag > transaktionModalState.originalRestwert) {
        return alertUser(`Nicht genug Guthaben! Verfügbar: ${transaktionModalState.originalRestwert.toFixed(2)} €`, 'error');
    }

    const neuerRestwert = typ === 'verwendung'
        ? Math.max(0, transaktionModalState.originalRestwert - betrag)
        : transaktionModalState.originalRestwert + betrag;

    try {
        const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');
        const verificationData = shouldVerify
            ? {
                betragVerifiziert: true,
                betragVerifiziertAm: serverTimestamp(),
                betragVerifiziertVon: currentUser.mode
            }
            : {};

        if (editTransaktionId) {
            const transaktionRef = doc(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen', editTransaktionId);
            await updateDoc(transaktionRef, {
                typ,
                betrag,
                bestellnr,
                rechnungsnr,
                beschreibung,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.mode,
                ...verificationData
            });
        } else {
            await addDoc(transaktionenRef, {
                typ,
                betrag,
                datum: serverTimestamp(),
                bestellnr,
                rechnungsnr,
                beschreibung,
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode
            });
        }

        const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
        const wgUpdateData = {
            restwert: neuerRestwert,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        };
        if (shouldVerify) {
            wgUpdateData.restwertVerifiziert = true;
            wgUpdateData.restwertVerifiziertAm = serverTimestamp();
            wgUpdateData.restwertVerifiziertVon = currentUser.mode;
        }
        await updateDoc(wertguthabenRef, wgUpdateData);

        alertUser(editTransaktionId ? 'Transaktion aktualisiert!' : 'Transaktion erfolgreich gebucht!', 'success');
        closeTransaktionModal();

        if (source === 'einloese') {
            resetEinloeseSystemForm(true);
        }

        if (document.getElementById('wertguthabenDetailsModal').style.display === 'flex') {
            setTimeout(() => openWertguthabenDetails(wertguthabenId), 300);
        }
    } catch (error) {
        console.error('Fehler beim Speichern der Transaktion:', error);
        alertUser('Fehler beim Speichern: ' + error.message, 'error');
    }
}

window.openEditTransaktionFromHistory = async function(wertguthabenId, transaktionId) {
    try {
        const transaktionRef = doc(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen', transaktionId);
        const transaktionDoc = await getDoc(transaktionRef);
        if (!transaktionDoc.exists()) {
            return alertUser('Transaktion nicht gefunden!', 'error');
        }

        document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        await window.openTransaktionModal(wertguthabenId, {
            source: 'dashboard',
            openedFromHistory: true,
            editTransaktion: {
                id: transaktionDoc.id,
                ...transaktionDoc.data()
            }
        });
    } catch (error) {
        console.error('Fehler beim Laden der Transaktion:', error);
        alertUser('Transaktion konnte nicht geladen werden.', 'error');
    }
};

// Transaktionen laden
async function loadTransaktionen(wertguthabenId) {
    try {
        const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');
        const q = query(transaktionenRef, orderBy('datum', 'desc'));

        const snapshot = await getDocs(q);
        const transaktionen = [];
        snapshot.forEach((docSnap) => {
            transaktionen.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });
        return transaktionen;
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
                <p class="text-sm font-bold text-gray-600">ID</p>
                <p class="text-lg font-mono font-bold">#${escapeHtml(getWertguthabenDisplayId(wg))}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Kategorie</p>
                <p class="text-lg">${escapeHtml(normalizeWertguthabenKategorie(wg.kategorie))}</p>
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
                ${renderWertguthabenVerificationBadge(wg, 'text-emerald-700')}
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
            const canEdit = t.typ === 'verwendung' || t.typ === 'gutschrift';
            const verifyInfo = t.betragVerifiziert ? `✅ Verifiziert: ${formatDateTime(t.betragVerifiziertAm)} · ${getDisplayUserName(t.betragVerifiziertVon)}` : '';
            
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
                            ${verifyInfo ? `<div class="mt-1 text-xs font-semibold text-emerald-700">${verifyInfo}</div>` : ''}
                        </div>
                        <div class="ml-2 flex gap-1">
                            ${canEdit ? `<button onclick="window.openEditTransaktionFromHistory('${id}', '${t.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Transaktion bearbeiten">✏️</button>` : ''}
                            <button onclick="deleteTransaktion('${id}', '${t.id}')" 
                                    class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Transaktion löschen">
                                🗑️
                            </button>
                        </div>
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
        window.openTransaktionModal(id, { source: 'dashboard' });
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
    const newCategoryInput = document.getElementById('new-wg-kategorie-input');
    if (newCategoryInput) newCategoryInput.value = '';
    renderWertguthabenKategorieSettingsList();

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

    const addKategorieBtn = document.getElementById('btn-add-wg-kategorie');
    if (addKategorieBtn && !addKategorieBtn.dataset.listenerAttached) {
        addKategorieBtn.addEventListener('click', addWertguthabenKategorieFromSettings);
        addKategorieBtn.dataset.listenerAttached = 'true';
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
    wertguthabenSettings.kategorien = sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien);

    // In Firebase speichern (geräteübergreifend)
    try {
        saveUserSetting('wertguthabenSettings', wertguthabenSettings);
        populateKategorieDropdowns();
        await ensureAllEntriesHaveValidKategorie();
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
            wertguthabenSettings.kategorien = sanitizeWertguthabenKategorien(parsed.kategorien);
            console.log('✅ Wertguthaben-Einstellungen geladen:', wertguthabenSettings);
        }
    } catch (error) {
        console.warn('Konnte Einstellungen nicht laden:', error);
    }
}

async function ensureAllEntriesHaveValidKategorie() {
    const updates = Object.values(WERTGUTHABEN)
        .filter((entry) => normalizeWertguthabenKategorie(entry.kategorie) !== String(entry.kategorie || '').trim())
        .map((entry) => normalizeKategorieInFirestore(entry.id, normalizeWertguthabenKategorie(entry.kategorie)));

    await Promise.all(updates);
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

window.removeWertguthabenFilterById = removeWertguthabenFilterById;


// Einstellungen werden in initializeWertguthaben() geladen (NACH loadUserSettings)

