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
let wgEinloeseScannerStream = null;
let wgEinloeseScannerInterval = null;
let wgEinloeseScannerBusy = false;
let wgEinloeseBarcodeDetector = null;
const wertguthabenFormState = {
    isCopyMode: false,
    copySourceId: '',
    statusManuallyChanged: false,
    statusManuallyChangedBeforeAktionscodeSwitch: false,
    isWertUnlocked: false,
    lockedEditEntryId: '',
    lastSelectedTyp: 'gutschein',
    wertBeforeAktionscodeSwitch: '',
    statusBeforeAktionscodeSwitch: ''
};
const transaktionModalState = {
    originalRestwert: 0,
    source: 'dashboard',
    editTransaktionId: '',
    isEditMode: false,
    isVerificationOnlyMode: false,
    isExistingTransaktionVerified: false,
    isEinloesungMode: false,
    maxEinloesungen: 0,
    bereitsEingeloest: 0
};
const WG_WERT_UNLOCK_COUNTDOWN_SECONDS = 30;
let wgWertUnlockSecondsLeft = 0;
let wgWertUnlockTimer = null;

const WG_UNASSIGNED_KATEGORIE = 'Nicht zugeordnet';
const WG_SHORT_ID_LENGTH = 4;
const WG_SHORT_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WG_MAX_SHORT_ID_ATTEMPTS = 200;

const WG_FILTER_LABELS = {
    all: 'Alles',
    id: 'ID',
    name: 'Name',
    code: 'Code',
    pin: 'PIN',
    seriennummer: 'Seriennummer',
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
    pin: '🔐',
    seriennummer: '🏷️',
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
    const wgTypSelect = document.getElementById('wgTyp');
    if (wgTypSelect && !wgTypSelect.dataset.listenerAttached) {
        wgTypSelect.addEventListener('change', handleTypChange);
        wgTypSelect.dataset.listenerAttached = 'true';
    }

    // Eigentümer-Change Event
    const eigentuemerSelect = document.getElementById('wgEigentuemer');
    if (eigentuemerSelect && !eigentuemerSelect.dataset.listenerAttached) {
        eigentuemerSelect.addEventListener('change', handleEigentuemerChange);
        eigentuemerSelect.dataset.listenerAttached = 'true';
    }

    const statusSelect = document.getElementById('wgStatus');
    if (statusSelect && !statusSelect.dataset.listenerAttached) {
        statusSelect.addEventListener('change', () => {
            wertguthabenFormState.statusManuallyChanged = true;
        });
        statusSelect.dataset.listenerAttached = 'true';
    }

    const sensitiveFieldConfigs = [
        { inputId: 'wgCode', hintId: 'wgCodeMaskHint', label: 'Code' },
        { inputId: 'wgPin', hintId: 'wgPinMaskHint', label: 'PIN' },
        { inputId: 'wgSeriennummer', hintId: 'wgSeriennummerMaskHint', label: 'Seriennummer' }
    ];
    sensitiveFieldConfigs.forEach(({ inputId, hintId, label }) => {
        const input = document.getElementById(inputId);
        if (!input || input.dataset.maskListenerAttached === 'true') return;
        const refreshMaskState = () => updateSensitiveFieldMaskHint(inputId, hintId, label);
        input.addEventListener('input', refreshMaskState);
        input.addEventListener('change', refreshMaskState);
        input.dataset.maskListenerAttached = 'true';
        refreshMaskState();
    });

    const wertUnlockBtn = document.getElementById('wgWertUnlockBtn');
    if (wertUnlockBtn && !wertUnlockBtn.dataset.listenerAttached) {
        wertUnlockBtn.addEventListener('click', openWertBetragUnlockPanel);
        wertUnlockBtn.dataset.listenerAttached = 'true';
    }

    const wertUnlockCancelBtn = document.getElementById('wgWertUnlockCancelBtn');
    if (wertUnlockCancelBtn && !wertUnlockCancelBtn.dataset.listenerAttached) {
        wertUnlockCancelBtn.addEventListener('click', closeWertBetragUnlockPanel);
        wertUnlockCancelBtn.dataset.listenerAttached = 'true';
    }

    const wertUnlockCloseBtn = document.getElementById('closeWgWertUnlockModal');
    if (wertUnlockCloseBtn && !wertUnlockCloseBtn.dataset.listenerAttached) {
        wertUnlockCloseBtn.addEventListener('click', closeWertBetragUnlockPanel);
        wertUnlockCloseBtn.dataset.listenerAttached = 'true';
    }

    const wertUnlockConfirmBtn = document.getElementById('wgWertUnlockConfirmBtn');
    if (wertUnlockConfirmBtn && !wertUnlockConfirmBtn.dataset.listenerAttached) {
        wertUnlockConfirmBtn.addEventListener('click', confirmWertBetragUnlock);
        wertUnlockConfirmBtn.dataset.listenerAttached = 'true';
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

            const normalizedTerm = normalizeEinloeseIdInput(term);
            if (normalizedTerm.length >= WG_SHORT_ID_LENGTH) {
                const exactEntry = findEinloeseEntryByIdText(normalizedTerm, { exactOnly: true });
                if (exactEntry) {
                    window.selectEinloeseWertguthaben(exactEntry.id);
                    return;
                }
            }

            updateEinloeseSuggestions(term);
        });
        einloeseInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const firstSuggestion = findEinloeseEntryByIdText(einloeseInput.value, { exactOnly: false });
            if (firstSuggestion) {
                window.selectEinloeseWertguthaben(firstSuggestion.id);
            }
        });
        einloeseInput.addEventListener('focus', () => {
            selectEinloeseInputTextIfPresent(einloeseInput);
        });
        einloeseInput.addEventListener('mouseup', (event) => {
            if (!String(einloeseInput.value || '').trim()) return;
            event.preventDefault();
            selectEinloeseInputTextIfPresent(einloeseInput);
        });
        einloeseInput.addEventListener('touchend', () => {
            selectEinloeseInputTextIfPresent(einloeseInput);
        });
        einloeseInput.dataset.listenerAttached = 'true';
    }

    const openScannerBtn = document.getElementById('wg-einloese-open-scanner-btn');
    if (openScannerBtn && !openScannerBtn.dataset.listenerAttached) {
        openScannerBtn.addEventListener('click', startEinloeseScanner);
        openScannerBtn.dataset.listenerAttached = 'true';
    }

    const closeScannerBtn = document.getElementById('wg-einloese-close-scanner-btn');
    if (closeScannerBtn && !closeScannerBtn.dataset.listenerAttached) {
        closeScannerBtn.addEventListener('click', () => {
            stopEinloeseScanner({ hidePanel: true, clearStatus: true });
        });
        closeScannerBtn.dataset.listenerAttached = 'true';
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
        betragInput.addEventListener('keydown', (event) => {
            if (event.key !== '-' && event.key !== 'Subtract') return;
            const typ = document.getElementById('transaktionTyp')?.value;
            if (typ !== 'korrektur') return;

            const currentValue = String(betragInput.value || '').trim();
            if (currentValue.startsWith('-')) {
                event.preventDefault();
                return;
            }

            event.preventDefault();
            const normalized = currentValue.replace(/^-/, '');
            betragInput.value = normalized ? `-${normalized}` : '-';
            updateTransaktionPreview();
        });
        betragInput.dataset.listenerAttached = 'true';
    }

    const typSelect = document.getElementById('transaktionTyp');
    if (typSelect && !typSelect.dataset.listenerAttached) {
        typSelect.addEventListener('change', handleTransaktionTypChange);
        typSelect.dataset.listenerAttached = 'true';
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

function isStartguthabenTransaktion(transaktion) {
    if (!transaktion) return false;
    if (transaktion.isSystemGeneratedStartguthaben === true) return true;

    const typ = String(transaktion.typ || '').toLowerCase();
    const beschreibung = String(transaktion.beschreibung || '').trim().toLowerCase();
    return typ === 'gutschrift' && beschreibung === 'startguthaben bei erstellung';
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
    stopEinloeseScanner({ hidePanel: true, clearStatus: true });
    resetEinloeseSystemForm(true);
}

function closeEinloeseSystemView() {
    stopEinloeseScanner({ hidePanel: true, clearStatus: true });
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
    stopEinloeseScanner({ hidePanel: true, clearStatus: true });
    if (focusInput && input) {
        setTimeout(() => input.focus(), 0);
    }
}

function normalizeEinloeseIdInput(rawValue) {
    return String(rawValue || '')
        .replace('#', '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .trim()
        .toUpperCase();
}

function findEinloeseEntryByIdText(rawValue, options = {}) {
    const normalized = normalizeEinloeseIdInput(rawValue);
    if (!normalized) return null;

    const exactOnly = !!options.exactOnly;
    const entries = Object.values(WERTGUTHABEN).filter((entry) => entry.typ !== 'aktionscode');

    const exact = entries.find((entry) => getWertguthabenDisplayId(entry).toUpperCase() === normalized);
    if (exact || exactOnly) return exact || null;

    return entries.find((entry) => getWertguthabenDisplayId(entry).toUpperCase().includes(normalized)) || null;
}

function selectEinloeseInputTextIfPresent(inputEl) {
    if (!inputEl) return;
    if (!String(inputEl.value || '').trim()) return;
    window.setTimeout(() => {
        try {
            inputEl.select();
            inputEl.setSelectionRange(0, String(inputEl.value || '').length);
        } catch (error) {
            console.warn('Einloese-Input konnte nicht selektiert werden:', error);
        }
    }, 0);
}

function formatMaskedSensitiveDisplayHtml(rawValue, options = {}) {
    const value = String(rawValue ?? '').trim();
    const fallback = options.emptyFallback || '-';
    if (!value) {
        return `<span class="font-mono text-gray-500">${escapeHtml(fallback)}</span>`;
    }

    const safeValue = escapeHtml(value);
    if (!safeValue.includes('*')) {
        return `<span class="font-mono break-all">${safeValue}</span>`;
    }

    const maskDecorated = safeValue.replace(/\*+/g, (stars) => `<span class="inline-flex items-center px-1 rounded bg-amber-100 text-amber-700 font-black">${stars}</span>`);
    const badge = options.showMaskBadge === false
        ? ''
        : '<span class="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wide">maskiert</span>';

    return `<span class="font-mono break-all">${maskDecorated}</span>${badge}`;
}

function buildSensitiveCopyFieldHtml(label, value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return '';

    const encodedValue = encodeURIComponent(normalized);
    return `
        <div>
            <p class="text-sm font-bold text-gray-600">${escapeHtml(label)}</p>
            <div class="flex items-center gap-2">
                <p class="bg-gray-100 p-2 rounded flex-1">${formatMaskedSensitiveDisplayHtml(normalized)}</p>
                <button onclick="window.copyToClipboard(decodeURIComponent('${encodedValue}'))" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="Kopieren">📋</button>
            </div>
        </div>
    `;
}

function updateSensitiveFieldMaskHint(inputId, hintId, label) {
    const input = document.getElementById(inputId);
    const hint = document.getElementById(hintId);
    if (!input || !hint) return;

    const value = String(input.value || '').trim();
    const hasMask = /\*+/.test(value);
    hint.classList.toggle('hidden', !hasMask);
    if (hasMask) {
        hint.textContent = `Maskierter ${label}-Wert erkannt (Scanner nutzt * als Platzhalter).`;
    }

    input.classList.toggle('ring-1', hasMask);
    input.classList.toggle('ring-amber-300', hasMask);
    input.classList.toggle('bg-amber-50', hasMask);
}

function updateSensitiveMaskHints() {
    updateSensitiveFieldMaskHint('wgCode', 'wgCodeMaskHint', 'Code');
    updateSensitiveFieldMaskHint('wgPin', 'wgPinMaskHint', 'PIN');
    updateSensitiveFieldMaskHint('wgSeriennummer', 'wgSeriennummerMaskHint', 'Seriennummer');
}

function normalizeEinloeseCodeInput(rawValue) {
    return String(rawValue || '')
        .trim()
        .replace(/\s+/g, '')
        .toUpperCase();
}

function escapeRegExpForScanner(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesMaskedEinloeseCode(scannedCode, storedCodePattern) {
    const normalizedScanned = normalizeEinloeseCodeInput(scannedCode);
    const normalizedPattern = normalizeEinloeseCodeInput(storedCodePattern);
    if (!normalizedScanned || !normalizedPattern || !normalizedPattern.includes('*')) return false;

    const regexSource = escapeRegExpForScanner(normalizedPattern).replace(/\\\*+/g, '.*');
    try {
        return new RegExp(`^${regexSource}$`, 'i').test(normalizedScanned);
    } catch (error) {
        console.warn('Masked-Code-Regex konnte nicht gebaut werden:', error);
        return false;
    }
}

function getSharedPrefixLength(first, second) {
    const left = String(first || '');
    const right = String(second || '');
    const maxLength = Math.min(left.length, right.length);
    let index = 0;
    while (index < maxLength && left[index] === right[index]) {
        index += 1;
    }
    return index;
}

function scoreEinloeseCodeCandidate(scannedCode, storedCode) {
    const normalizedScanned = normalizeEinloeseCodeInput(scannedCode);
    const normalizedStored = normalizeEinloeseCodeInput(storedCode);
    if (!normalizedScanned || !normalizedStored) return 0;
    if (normalizedScanned === normalizedStored) return 1000 + normalizedStored.length;

    const storedWithoutMask = normalizedStored.replace(/\*/g, '');
    if (!storedWithoutMask) return 0;

    const prefixLength = getSharedPrefixLength(normalizedScanned, storedWithoutMask);
    const minLength = Math.min(normalizedScanned.length, storedWithoutMask.length);
    let alignedMatches = 0;
    for (let i = 0; i < minLength; i += 1) {
        if (normalizedScanned[i] === storedWithoutMask[i]) {
            alignedMatches += 1;
        }
    }

    let score = prefixLength * 8 + alignedMatches * 2;
    if (normalizedScanned.includes(storedWithoutMask) || storedWithoutMask.includes(normalizedScanned)) {
        score += 18;
    }
    if (normalizedStored.includes('*') && matchesMaskedEinloeseCode(normalizedScanned, normalizedStored)) {
        score += 40;
    }

    score -= Math.min(Math.abs(normalizedScanned.length - storedWithoutMask.length), 10);
    return Math.max(score, 0);
}

function uniqueEinloeseEntries(entries) {
    const uniqueMap = new Map();
    (Array.isArray(entries) ? entries : []).forEach((entry) => {
        if (!entry?.id || uniqueMap.has(entry.id)) return;
        uniqueMap.set(entry.id, entry);
    });
    return Array.from(uniqueMap.values());
}

function findEinloeseEntriesByScannedCode(rawValue) {
    const scannedCode = normalizeEinloeseCodeInput(rawValue);
    if (!scannedCode) {
        return { scannedCode: '', exactMatches: [], maskedMatches: [], fuzzyMatches: [] };
    }

    const codeEntries = Object.values(WERTGUTHABEN)
        .filter((entry) => entry.typ !== 'aktionscode')
        .map((entry) => ({
            entry,
            normalizedCode: normalizeEinloeseCodeInput(entry.code)
        }))
        .filter(({ normalizedCode }) => !!normalizedCode);

    const exactMatches = uniqueEinloeseEntries(
        codeEntries
            .filter(({ normalizedCode }) => normalizedCode === scannedCode)
            .map(({ entry }) => entry)
    );

    const maskedMatches = exactMatches.length > 0
        ? []
        : uniqueEinloeseEntries(
            codeEntries
                .filter(({ normalizedCode }) => normalizedCode.includes('*') && matchesMaskedEinloeseCode(scannedCode, normalizedCode))
                .map(({ entry }) => entry)
        );

    const scoredCandidates = codeEntries
        .map(({ entry, normalizedCode }) => ({
            entry,
            score: scoreEinloeseCodeCandidate(scannedCode, normalizedCode)
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);

    const bestScore = scoredCandidates[0]?.score || 0;
    const fuzzyMatches = bestScore <= 0
        ? []
        : uniqueEinloeseEntries(
            scoredCandidates
                .filter(({ score }) => score >= Math.max(6, bestScore - 4))
                .slice(0, 12)
                .map(({ entry }) => entry)
        );

    return {
        scannedCode,
        exactMatches,
        maskedMatches,
        fuzzyMatches
    };
}

function renderEinloeseEntrySuggestions(entries, options = {}) {
    const box = document.getElementById('wg-einloese-suggestions-box');
    const list = document.getElementById('wg-einloese-suggestions-list');
    if (!box || !list) return;

    const emptyMessage = String(options.emptyMessage || 'Keine passende ID gefunden.');
    const headerText = String(options.headerText || '').trim();
    const showCodeLabel = options.showCodeLabel !== false;
    const candidates = uniqueEinloeseEntries(entries);

    if (candidates.length === 0) {
        list.innerHTML = `<li class="px-4 py-3 text-sm text-gray-500">${escapeHtml(emptyMessage)}</li>`;
        box.classList.remove('hidden');
        return;
    }

    const headerHtml = headerText
        ? `<li class="px-4 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border-b border-emerald-100">${escapeHtml(headerText)}</li>`
        : '';

    const itemsHtml = candidates.map((entry) => {
        const displayId = getWertguthabenDisplayId(entry);
        const restwert = entry.restwert !== undefined ? Number(entry.restwert || 0) : Number(entry.wert || 0);
        const codeSnippet = String(entry.code || '').trim();
        const namePart = escapeHtml(entry.name || '-');
        const companyPart = escapeHtml(entry.unternehmen || '-');
        const codePart = showCodeLabel && codeSnippet
            ? `<span class="text-gray-500"> · Code:</span> ${formatMaskedSensitiveDisplayHtml(codeSnippet, { showMaskBadge: false })}`
            : '';

        return `
            <li>
                <button type="button" onclick="window.selectEinloeseWertguthaben('${entry.id}')" class="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-gray-100 last:border-0">
                    <div class="flex items-center justify-between gap-3">
                        <span class="font-mono font-bold text-emerald-700">#${escapeHtml(displayId)}</span>
                        <span class="text-sm font-semibold text-gray-700">${restwert.toFixed(2)} €</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1 break-all"><span>${namePart}</span> · <span>${companyPart}</span>${codePart}</div>
                </button>
            </li>
        `;
    }).join('');

    list.innerHTML = `${headerHtml}${itemsHtml}`;
    box.classList.remove('hidden');
}

function showScannerEntrySelection(entries, options = {}) {
    const candidates = uniqueEinloeseEntries(entries);
    if (candidates.length === 0) return;

    const scannedValue = String(options.scannedValue || '').trim();
    const input = document.getElementById('wg-einloese-id-input');
    if (input && scannedValue) {
        input.value = scannedValue;
    }

    resetEinloeseResult();
    renderEinloeseEntrySuggestions(candidates, {
        headerText: options.headerText || 'Treffer auswählen',
        emptyMessage: options.emptyMessage || 'Keine passenden Einträge gefunden.',
        showCodeLabel: true
    });
    stopEinloeseScanner({ hidePanel: true, clearStatus: false });
    setEinloeseScannerStatus(options.statusText || `${candidates.length} Treffer gefunden.`);
}

function setEinloeseScannerStatus(message, isError = false) {
    const statusEl = document.getElementById('wg-einloese-scanner-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('text-red-600', !!isError);
    statusEl.classList.toggle('text-gray-600', !isError);
}

function stopEinloeseScanner(options = {}) {
    const hidePanel = options.hidePanel !== false;
    const clearStatus = options.clearStatus !== false;

    if (wgEinloeseScannerInterval) {
        window.clearInterval(wgEinloeseScannerInterval);
        wgEinloeseScannerInterval = null;
    }
    wgEinloeseScannerBusy = false;

    if (wgEinloeseScannerStream) {
        wgEinloeseScannerStream.getTracks().forEach((track) => {
            try {
                track.stop();
            } catch (error) {
                console.warn('Scanner-Track konnte nicht gestoppt werden:', error);
            }
        });
        wgEinloeseScannerStream = null;
    }

    const video = document.getElementById('wg-einloese-scanner-video');
    if (video) {
        try {
            video.pause();
        } catch (error) {
            console.warn('Scanner-Video konnte nicht pausiert werden:', error);
        }
        video.srcObject = null;
    }

    if (hidePanel) {
        document.getElementById('wg-einloese-scanner-panel')?.classList.add('hidden');
    }

    if (clearStatus) {
        setEinloeseScannerStatus('Kamera gestoppt.');
    }
}

function extractEinloeseIdFromScannedText(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return '';

    const prefixedMatch = text.match(/#\s*([A-Za-z0-9]{4})/);
    if (prefixedMatch?.[1]) {
        return prefixedMatch[1].toUpperCase();
    }

    const normalized = normalizeEinloeseIdInput(text);
    if (normalized.length === WG_SHORT_ID_LENGTH) {
        return normalized;
    }

    return '';
}

async function scanEinloeseFrame() {
    if (!wgEinloeseBarcodeDetector || !wgEinloeseScannerStream || wgEinloeseScannerBusy) return;

    const video = document.getElementById('wg-einloese-scanner-video');
    if (!video || video.readyState < 2) return;

    wgEinloeseScannerBusy = true;
    try {
        const detections = await wgEinloeseBarcodeDetector.detect(video);
        if (!Array.isArray(detections) || detections.length === 0) return;

        const rawValue = detections
            .map((detection) => String(detection?.rawValue || '').trim())
            .find((value) => !!value);
        if (!rawValue) return;

        const scannedId = extractEinloeseIdFromScannedText(rawValue);
        if (scannedId) {
            const idMatch = findEinloeseEntryByIdText(scannedId, { exactOnly: true });
            if (idMatch) {
                window.selectEinloeseWertguthaben(idMatch.id);
                setEinloeseScannerStatus(`Treffer: #${getWertguthabenDisplayId(idMatch)}`);
                stopEinloeseScanner({ hidePanel: true, clearStatus: true });
                return;
            }

            stopEinloeseScanner({ hidePanel: true, clearStatus: false });
            setEinloeseScannerStatus(`ID #${scannedId} ist nicht vorhanden.`, true);
            alertUser(`ID #${scannedId} ist nicht vorhanden.`, 'error');
            return;
        }

        const codeMatchResult = findEinloeseEntriesByScannedCode(rawValue);
        const { scannedCode, exactMatches, maskedMatches, fuzzyMatches } = codeMatchResult;
        const displayScanCode = scannedCode || rawValue;

        if (exactMatches.length === 1) {
            const match = exactMatches[0];
            window.selectEinloeseWertguthaben(match.id);
            setEinloeseScannerStatus(`Treffer: #${getWertguthabenDisplayId(match)} (Code ${displayScanCode})`);
            stopEinloeseScanner({ hidePanel: true, clearStatus: true });
            return;
        }

        if (exactMatches.length > 1) {
            showScannerEntrySelection(exactMatches, {
                scannedValue: displayScanCode,
                headerText: `Code ${displayScanCode}: ${exactMatches.length} IDs gefunden`,
                statusText: `${exactMatches.length} IDs mit demselben Code gefunden.`
            });
            return;
        }

        if (maskedMatches.length > 0) {
            showScannerEntrySelection(maskedMatches, {
                scannedValue: displayScanCode,
                headerText: `Maskierte Code-Treffer (${maskedMatches.length})`,
                statusText: `Code passt auf ${maskedMatches.length} maskierte Einträge.`
            });
            return;
        }

        if (fuzzyMatches.length > 0) {
            showScannerEntrySelection(fuzzyMatches, {
                scannedValue: displayScanCode,
                headerText: 'Ähnlichste Code-Treffer',
                statusText: 'Kein exakter Code gefunden – bitte passenden Eintrag auswählen.'
            });
            return;
        }

        stopEinloeseScanner({ hidePanel: true, clearStatus: false });
        setEinloeseScannerStatus('Kein passender Code gefunden.', true);
        alertUser('Kein passender Code gefunden.', 'error');
    } catch (error) {
        console.warn('Scanner-Analyse fehlgeschlagen:', error);
    } finally {
        wgEinloeseScannerBusy = false;
    }
}

async function startEinloeseScanner() {
    const panel = document.getElementById('wg-einloese-scanner-panel');
    const video = document.getElementById('wg-einloese-scanner-video');
    if (!panel || !video) return;

    if (!navigator?.mediaDevices?.getUserMedia) {
        alertUser('Kamera wird auf diesem Gerät/Browser nicht unterstützt.', 'error');
        return;
    }

    if (!('BarcodeDetector' in window)) {
        alertUser('Barcode/QR-Scanner wird in diesem Browser nicht unterstützt.', 'warning');
        return;
    }

    try {
        wgEinloeseBarcodeDetector = new window.BarcodeDetector({
            formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar']
        });
    } catch (error) {
        console.error('BarcodeDetector konnte nicht initialisiert werden:', error);
        alertUser('Scanner konnte nicht gestartet werden.', 'error');
        return;
    }

    stopEinloeseScanner({ hidePanel: false, clearStatus: false });
    panel.classList.remove('hidden');
    setEinloeseScannerStatus('Kamera startet...');

    try {
        wgEinloeseScannerStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });

        video.srcObject = wgEinloeseScannerStream;
        await video.play();

        setEinloeseScannerStatus('Code in den roten Bereich halten...');
        wgEinloeseScannerInterval = window.setInterval(scanEinloeseFrame, 220);
    } catch (error) {
        console.error('Kamera konnte nicht geöffnet werden:', error);
        stopEinloeseScanner({ hidePanel: true, clearStatus: true });
        alertUser('Kamera-Zugriff fehlgeschlagen. Bitte Berechtigung prüfen.', 'error');
    }
}

function hideEinloeseSuggestions() {
    document.getElementById('wg-einloese-suggestions-box')?.classList.add('hidden');
}

function updateEinloeseSuggestions(term) {
    const box = document.getElementById('wg-einloese-suggestions-box');
    const list = document.getElementById('wg-einloese-suggestions-list');
    if (!box || !list) return;

    const normalized = normalizeEinloeseIdInput(term).toLowerCase();
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

    renderEinloeseEntrySuggestions(candidates, {
        emptyMessage: 'Keine passende ID gefunden.',
        showCodeLabel: false
    });
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
        { label: 'Eigentümer', valueHtml: escapeHtml(eigentuemer) },
        { label: 'Status', valueHtml: escapeHtml(`${status.icon} ${status.label}`) },
        { label: 'Unternehmen', valueHtml: escapeHtml(entry.unternehmen || '-') },
        { label: 'Name', valueHtml: escapeHtml(entry.name || '-') },
        { label: 'Ursprungswert', valueHtml: escapeHtml(`${Number(entry.wert || 0).toFixed(2)} €`) },
        { label: 'Restzeit', valueHtml: escapeHtml(restzeit.replace(/<[^>]+>/g, '')) },
        { label: 'Einlösefrist', valueHtml: escapeHtml(entry.einloesefrist ? new Date(entry.einloesefrist).toLocaleDateString('de-DE') : 'Unbegrenzt') },
        { label: 'Code', valueHtml: formatMaskedSensitiveDisplayHtml(entry.code || '-', { showMaskBadge: true }) },
        { label: 'PIN', valueHtml: formatMaskedSensitiveDisplayHtml(entry.pin || '-', { showMaskBadge: true }) },
        { label: 'Seriennummer', valueHtml: formatMaskedSensitiveDisplayHtml(entry.seriennummer || '-', { showMaskBadge: true }) }
    ];

    const details = document.getElementById('wg-einloese-details');
    if (details) {
        details.innerHTML = detailItems.map((item) => `
            <div class="p-3 rounded-lg border border-gray-200 bg-gray-50">
                <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">${escapeHtml(item.label)}</p>
                <p class="text-base font-semibold text-gray-800 break-words">${item.valueHtml}</p>
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

    const categories = ['id', 'name', 'code', 'pin', 'seriennummer', 'unternehmen', 'kategorie', 'eigentuemer', 'typ', 'status', 'betrag'];
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
    const pin = (wertguthabenEintrag.pin || '').toLowerCase();
    const seriennummer = (wertguthabenEintrag.seriennummer || '').toLowerCase();
    const fulltextValues = [
        fixedId,
        String(wertguthabenEintrag.fixedId || '').toLowerCase(),
        name,
        code,
        pin,
        seriennummer,
        unternehmen,
        kategorie,
        eigentuemerName,
        eigentuemerId,
        typ,
        typLabel,
        statusKey,
        statusLabel,
        String(wertguthabenEintrag.kaufdatum || '').toLowerCase(),
        String(wertguthabenEintrag.einloesefrist || '').toLowerCase(),
        String(wertguthabenEintrag.warnung || '').toLowerCase(),
        String(wertguthabenEintrag.notizen || '').toLowerCase(),
        String(wertguthabenEintrag.codeAblauf || '').toLowerCase(),
        String(wertguthabenEintrag.bedingungen || '').toLowerCase(),
        String(wertguthabenEintrag.wertAblauf || '').toLowerCase(),
        String(wertguthabenEintrag.rabattTyp || '').toLowerCase(),
        String(wertguthabenEintrag.rabattWert || '').toLowerCase(),
        String(wertguthabenEintrag.rabattEinheit || '').toLowerCase(),
        String(wertguthabenEintrag.mindestbestellwert || '').toLowerCase(),
        String(wertguthabenEintrag.maxRabatt || '').toLowerCase(),
        String(wertguthabenEintrag.gueltigAb || '').toLowerCase(),
        String(wertguthabenEintrag.gueltigBis || '').toLowerCase(),
        String(wertguthabenEintrag.maxEinloesungen || '').toLowerCase(),
        String(wertguthabenEintrag.bereitsEingeloest || '').toLowerCase(),
        String(wertguthabenEintrag.kontogebunden || '').toLowerCase(),
        String(wertguthabenEintrag.konto || '').toLowerCase(),
        String(wertguthabenEintrag.neukunde || '').toLowerCase(),
        String(wertguthabenEintrag.kombinierbar || '').toLowerCase(),
        String(wertguthabenEintrag.kategorien || '').toLowerCase(),
        String(wertguthabenEintrag.ausnahmen || '').toLowerCase(),
        String(wertguthabenEintrag.quelle || '').toLowerCase(),
        ...amountValues
    ].join(' ');

    switch (filter.category) {
        case 'id':
            return fixedId.includes(value);
        case 'name':
            return name.includes(value);
        case 'code':
            return code.includes(value);
        case 'pin':
            return pin.includes(value);
        case 'seriennummer':
            return seriennummer.includes(value);
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
            return fulltextValues.includes(value) || fulltextValues.includes(normalizedValue);
    }
}

function clearWertBetragUnlockTimer() {
    if (wgWertUnlockTimer) {
        window.clearInterval(wgWertUnlockTimer);
        wgWertUnlockTimer = null;
    }
}

function updateWertBetragUnlockCountdownUi() {
    const okBtn = document.getElementById('wgWertUnlockConfirmBtn');
    const countdown = document.getElementById('wgWertUnlockCountdown');
    if (!okBtn || !countdown) return;

    if (wgWertUnlockSecondsLeft > 0) {
        okBtn.disabled = true;
        okBtn.classList.add('opacity-60', 'cursor-not-allowed');
        okBtn.textContent = `OK (${String(wgWertUnlockSecondsLeft).padStart(2, '0')}s)`;
        countdown.textContent = `Freigabe in ${wgWertUnlockSecondsLeft}s verfügbar.`;
    } else {
        okBtn.disabled = false;
        okBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        okBtn.textContent = 'OK';
        countdown.textContent = 'Freigabe aktiv. Nur für echte Korrektur verwenden.';
    }
}

function setWertBetragLockedState(locked, entryId = '') {
    const wertInput = document.getElementById('wgWert');
    const unlockBtn = document.getElementById('wgWertUnlockBtn');
    const lockInfo = document.getElementById('wgWertLockInfo');
    if (!wertInput) return;

    wertInput.disabled = !!locked;
    wertInput.classList.toggle('bg-gray-100', !!locked);
    wertInput.classList.toggle('cursor-not-allowed', !!locked);
    if (unlockBtn) unlockBtn.classList.toggle('hidden', !locked);
    if (lockInfo) lockInfo.classList.toggle('hidden', !locked);

    if (locked) {
        wertguthabenFormState.isWertUnlocked = false;
        wertguthabenFormState.lockedEditEntryId = String(entryId || '');
        closeWertBetragUnlockPanel();
    } else {
        wertguthabenFormState.lockedEditEntryId = '';
        closeWertBetragUnlockPanel();
    }
}

function openWertBetragUnlockPanel() {
    const modal = document.getElementById('wgWertUnlockModal');
    if (!modal || !wertguthabenFormState.lockedEditEntryId) return;

    modal.style.display = 'flex';
    wgWertUnlockSecondsLeft = WG_WERT_UNLOCK_COUNTDOWN_SECONDS;
    updateWertBetragUnlockCountdownUi();
    clearWertBetragUnlockTimer();

    wgWertUnlockTimer = window.setInterval(() => {
        wgWertUnlockSecondsLeft = Math.max(0, wgWertUnlockSecondsLeft - 1);
        updateWertBetragUnlockCountdownUi();
        if (wgWertUnlockSecondsLeft <= 0) {
            clearWertBetragUnlockTimer();
        }
    }, 1000);
}

function closeWertBetragUnlockPanel() {
    const modal = document.getElementById('wgWertUnlockModal');
    if (modal) modal.style.display = 'none';
    clearWertBetragUnlockTimer();
    wgWertUnlockSecondsLeft = 0;
    updateWertBetragUnlockCountdownUi();
}

function confirmWertBetragUnlock() {
    if (wgWertUnlockSecondsLeft > 0 || !wertguthabenFormState.lockedEditEntryId) return;
    wertguthabenFormState.isWertUnlocked = true;
    setWertBetragLockedState(false);
    alertUser('Betrag freigegeben. Bitte nur für echte Korrekturen nutzen.', 'info');
}

// ========================================
// FIREBASE LISTENER
// ========================================
export function stopWertguthabenListener() {
    stopEinloeseScanner({ hidePanel: true, clearStatus: true });

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
        const verificationBadge = renderWertguthabenVerificationBadge(w, 'text-emerald-700', 'icon');
        
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

function renderWertguthabenVerificationBadge(entry, className = 'text-emerald-700', mode = 'full') {
    const meta = getWertguthabenVerificationMeta(entry);
    if (!meta) return '';
    if (mode === 'icon') {
        return `<span class="text-xs font-semibold ${className}" title="${escapeHtml(meta)}">✅</span>`;
    }
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

function getEditableWertguthabenKategorien() {
    return sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien);
}

function getDefaultFormKategorie() {
    const editable = getEditableWertguthabenKategorien();
    return editable[0] || WG_UNASSIGNED_KATEGORIE;
}

function getAllWertguthabenKategorien() {
    return [WG_UNASSIGNED_KATEGORIE, ...getEditableWertguthabenKategorien()];
}

function normalizeWertguthabenKategorie(rawCategory) {
    const category = String(rawCategory || '').trim();
    if (!category) return WG_UNASSIGNED_KATEGORIE;
    const all = getAllWertguthabenKategorien();
    return all.includes(category) ? category : WG_UNASSIGNED_KATEGORIE;
}

function populateKategorieDropdowns() {
    const allCategories = getAllWertguthabenKategorien();
    const editableCategories = getEditableWertguthabenKategorien();

    const formSelect = document.getElementById('wgKategorie');
    if (formSelect) {
        const previous = normalizeWertguthabenKategorie(formSelect.value);
        if (editableCategories.length > 0) {
            formSelect.innerHTML = `
                <option value="${escapeHtml(WG_UNASSIGNED_KATEGORIE)}" disabled>${escapeHtml(WG_UNASSIGNED_KATEGORIE)} (automatisch)</option>
                ${editableCategories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
            `;
            if (previous === WG_UNASSIGNED_KATEGORIE) {
                formSelect.value = WG_UNASSIGNED_KATEGORIE;
            } else {
                formSelect.value = editableCategories.includes(previous) ? previous : editableCategories[0];
            }
        } else {
            formSelect.innerHTML = `<option value="${escapeHtml(WG_UNASSIGNED_KATEGORIE)}">${escapeHtml(WG_UNASSIGNED_KATEGORIE)} (automatisch)</option>`;
            formSelect.value = WG_UNASSIGNED_KATEGORIE;
        }
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

    const deleteKeyword = 'LÖSCHEN';
    const confirmation = prompt(
        `Kategorie "${category}" löschen?\nBetroffene Einträge werden auf "${WG_UNASSIGNED_KATEGORIE}" gesetzt.\n\nBitte zur Bestätigung ${deleteKeyword} eingeben:`
    );
    if (confirmation === null) {
        return;
    }
    if (String(confirmation).trim() !== deleteKeyword) {
        alertUser(`Löschen abgebrochen: Bitte exakt ${deleteKeyword} eingeben.`, 'warning');
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
    document.getElementById('wgKategorie').value = getDefaultFormKategorie();
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
    updateSensitiveMaskHints();

    wertguthabenFormState.isWertUnlocked = false;
    wertguthabenFormState.lockedEditEntryId = '';
    wertguthabenFormState.lastSelectedTyp = 'gutschein';
    wertguthabenFormState.statusManuallyChangedBeforeAktionscodeSwitch = false;
    wertguthabenFormState.wertBeforeAktionscodeSwitch = '';
    wertguthabenFormState.statusBeforeAktionscodeSwitch = '';

    handleTypChange();

    document.getElementById('wertguthabenModal').style.display = 'flex';
}

function setWertguthabenCopyMode(enabled, sourceId = '') {
    const notice = document.getElementById('wgCopyNotice');
    if (notice) {
        notice.classList.toggle('hidden', !enabled);
    }
    wertguthabenFormState.isCopyMode = !!enabled;
    wertguthabenFormState.copySourceId = enabled ? String(sourceId || '') : '';
}

function populateWertguthabenFormFromEntry(wg, options = {}) {
    if (!wg) return;
    const isCopy = !!options.isCopy;

    if (Object.keys(USERS).includes(wg.eigentuemer)) {
        document.getElementById('wgEigentuemer').value = wg.eigentuemer;
        document.getElementById('wgEigentuemerFrei').classList.add('hidden');
        document.getElementById('wgEigentuemerFrei').value = '';
    } else {
        document.getElementById('wgEigentuemer').value = 'custom';
        document.getElementById('wgEigentuemerFrei').value = wg.eigentuemer || '';
        document.getElementById('wgEigentuemerFrei').classList.remove('hidden');
    }

    document.getElementById('wgTyp').value = wg.typ || 'gutschein';
    document.getElementById('wgStatus').value = wg.status || 'aktiv';
    document.getElementById('wgWert').value = isCopy ? '' : (wg.wert || '');
    document.getElementById('wgKategorie').value = normalizeWertguthabenKategorie(wg.kategorie);
    document.getElementById('wgName').value = wg.name || '';
    document.getElementById('wgUnternehmen').value = wg.unternehmen || '';
    document.getElementById('wgKaufdatum').value = wg.kaufdatum || '';
    document.getElementById('wgEinloesefrist').value = wg.einloesefrist || '';
    document.getElementById('wgCode').value = isCopy ? '' : (wg.code || '');
    document.getElementById('wgPin').value = isCopy ? '' : (wg.pin || '');
    document.getElementById('wgSeriennummer').value = isCopy ? '' : (wg.seriennummer || '');
    document.getElementById('wgWarnung').value = wg.warnung || '';
    document.getElementById('wgNotizen').value = wg.notizen || '';
    document.getElementById('wgCodeAblauf').value = wg.codeAblauf || '';
    document.getElementById('wgBedingungen').value = wg.bedingungen || '';
    document.getElementById('wgWertAblauf').value = wg.wertAblauf || '';

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
    updateSensitiveMaskHints();

    const currentTyp = wg.typ || 'gutschein';
    const currentWertSnapshot = normalizeWertSnapshotValue(wg.wert);
    const persistedWertSnapshot = normalizeWertSnapshotValue(wg.wertBeforeAktionscodeSwitch);
    const currentStatusSnapshot = String(wg.status || 'aktiv');
    const persistedStatusSnapshot = String(wg.statusBeforeAktionscodeSwitch || '');

    wertguthabenFormState.lastSelectedTyp = currentTyp;
    wertguthabenFormState.statusManuallyChangedBeforeAktionscodeSwitch = false;
    wertguthabenFormState.wertBeforeAktionscodeSwitch = isCopy
        ? ''
        : (currentTyp === 'aktionscode'
            ? pickFirstNonEmptyString([persistedWertSnapshot, currentWertSnapshot])
            : currentWertSnapshot);
    wertguthabenFormState.statusBeforeAktionscodeSwitch = isCopy
        ? ''
        : (currentTyp === 'aktionscode'
            ? pickFirstNonEmptyString([persistedStatusSnapshot, currentStatusSnapshot])
            : currentStatusSnapshot);

    handleTypChange();
    validateEinloesungen();
}

function openCreateModal(options = {}) {
    const opts = options instanceof Event ? {} : options;
    document.getElementById('wertguthabenModalTitle').textContent = 'Neues Wertguthaben';
    document.getElementById('editWertguthabenId').value = '';
    resetForm();
    wertguthabenFormState.statusManuallyChanged = false;
    setWertguthabenCopyMode(false);
    setWertBetragLockedState(false);

    if (opts.copyFromEntry) {
        populateWertguthabenFormFromEntry(opts.copyFromEntry, { isCopy: true });
        setWertguthabenCopyMode(true, opts.copyFromEntry.id || '');
    }
}

function closeWertguthabenModal() {
    document.getElementById('wertguthabenModal').style.display = 'none';
    setWertguthabenCopyMode(false);
    wertguthabenFormState.statusManuallyChanged = false;
    setWertBetragLockedState(false);
    wertguthabenFormState.lastSelectedTyp = 'gutschein';
    wertguthabenFormState.statusManuallyChangedBeforeAktionscodeSwitch = false;
    wertguthabenFormState.wertBeforeAktionscodeSwitch = '';
    wertguthabenFormState.statusBeforeAktionscodeSwitch = '';
}

function normalizeWertSnapshotValue(rawValue) {
    const normalizedRaw = String(rawValue ?? '').trim().replace(',', '.');
    if (!normalizedRaw) return '';
    const numericValue = Number(normalizedRaw);
    if (!Number.isFinite(numericValue)) return '';
    return String(numericValue);
}

function pickFirstNonEmptyString(values = []) {
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized) {
            return normalized;
        }
    }
    return '';
}

function parseWertAmount(rawValue, fallback = 0) {
    const normalized = normalizeWertSnapshotValue(rawValue);
    if (!normalized) return fallback;
    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function shouldAutoSetStatusToEingeloest(typ, wert, maxEinloesungen, bereitsEingeloest) {
    if (typ === 'aktionscode') {
        return maxEinloesungen > 0 && bereitsEingeloest >= maxEinloesungen;
    }

    if (['gutschein', 'guthaben', 'wertguthaben', 'wertguthaben_gesetzlich'].includes(typ)) {
        return wert <= 0;
    }

    return false;
}

function handleTypChange() {
    const typ = document.getElementById('wgTyp').value;
    const editId = document.getElementById('editWertguthabenId')?.value || '';
    const gutscheinFelder = document.getElementById('gutschein-felder');
    const wertguthabenFelder = document.getElementById('wertguthaben-felder');
    const aktionscodeFelder = document.getElementById('aktionscode-felder');
    const wertInput = document.getElementById('wgWert');
    const statusSelect = document.getElementById('wgStatus');
    const einloesefristInput = document.getElementById('wgEinloesefrist');
    const kaufdatumInput = document.getElementById('wgKaufdatum');
    const previousTyp = wertguthabenFormState.lastSelectedTyp;
    const existingEntry = editId ? WERTGUTHABEN[editId] : null;

    if (typ === 'aktionscode' && previousTyp && previousTyp !== 'aktionscode') {
        const currentWertSnapshot = normalizeWertSnapshotValue(wertInput?.value);
        const existingWertSnapshot = normalizeWertSnapshotValue(existingEntry?.wert);
        const persistedWertSnapshot = normalizeWertSnapshotValue(existingEntry?.wertBeforeAktionscodeSwitch);
        const inMemoryWertSnapshot = normalizeWertSnapshotValue(wertguthabenFormState.wertBeforeAktionscodeSwitch);

        const preferredWertOrder = (editId && !wertguthabenFormState.isWertUnlocked)
            ? [existingWertSnapshot, currentWertSnapshot, persistedWertSnapshot, inMemoryWertSnapshot]
            : [currentWertSnapshot, existingWertSnapshot, persistedWertSnapshot, inMemoryWertSnapshot];

        wertguthabenFormState.wertBeforeAktionscodeSwitch = pickFirstNonEmptyString(preferredWertOrder);
        wertguthabenFormState.statusBeforeAktionscodeSwitch = pickFirstNonEmptyString([
            String(statusSelect?.value || ''),
            String(existingEntry?.statusBeforeAktionscodeSwitch || ''),
            String(existingEntry?.status || ''),
            String(wertguthabenFormState.statusBeforeAktionscodeSwitch || '')
        ]);
        wertguthabenFormState.statusManuallyChangedBeforeAktionscodeSwitch = !!wertguthabenFormState.statusManuallyChanged;
    }

    if (typ !== 'aktionscode' && previousTyp === 'aktionscode') {
        const restoreWert = wertguthabenFormState.wertBeforeAktionscodeSwitch;
        if (restoreWert !== '') {
            wertInput.value = restoreWert;
        } else {
            const fallbackWert = pickFirstNonEmptyString([
                normalizeWertSnapshotValue(existingEntry?.wertBeforeAktionscodeSwitch),
                normalizeWertSnapshotValue(existingEntry?.wert)
            ]);
            if (fallbackWert !== '') {
                wertInput.value = fallbackWert;
            }
        }

        const restoredWertNumeric = parseWertAmount(wertInput?.value, 0);

        const restoreStatus = pickFirstNonEmptyString([
            wertguthabenFormState.statusBeforeAktionscodeSwitch,
            String(existingEntry?.statusBeforeAktionscodeSwitch || ''),
            String(existingEntry?.status || '')
        ]);
        if (statusSelect && restoreStatus) {
            statusSelect.value = restoreStatus;
        }

        if (statusSelect && !wertguthabenFormState.statusManuallyChangedBeforeAktionscodeSwitch) {
            const isMonetaryTyp = ['gutschein', 'guthaben', 'wertguthaben', 'wertguthaben_gesetzlich'].includes(typ);
            if (isMonetaryTyp && restoredWertNumeric > 0 && statusSelect.value === 'eingeloest') {
                statusSelect.value = 'aktiv';
            }
        }

        wertguthabenFormState.statusManuallyChanged = !!wertguthabenFormState.statusManuallyChangedBeforeAktionscodeSwitch;
    }

    gutscheinFelder.classList.add('hidden');
    wertguthabenFelder.classList.add('hidden');
    aktionscodeFelder.classList.add('hidden');

    // Wert, Einlösefrist und Kaufdatum für Aktionscode deaktivieren
    if (typ === 'aktionscode') {
        wertguthabenFormState.isWertUnlocked = false;
        setWertBetragLockedState(false);
        wertInput.disabled = true;
        wertInput.value = '0';
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
        const shouldLockWert = !!editId && !wertguthabenFormState.isWertUnlocked;
        setWertBetragLockedState(shouldLockWert, editId);
        if (!shouldLockWert) {
            wertInput.disabled = false;
            wertInput.classList.remove('bg-gray-100', 'cursor-not-allowed');
        }
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

    wertguthabenFormState.lastSelectedTyp = typ;
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
    const existingEntry = editId ? WERTGUTHABEN[editId] : null;
    
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
    const statusSelect = document.getElementById('wgStatus');
    let status = statusSelect.value;
    const wert = parseWertAmount(document.getElementById('wgWert').value, 0);
    const unternehmen = document.getElementById('wgUnternehmen').value.trim();
    const kaufdatum = document.getElementById('wgKaufdatum').value;
    const einloesefrist = document.getElementById('wgEinloesefrist').value;
    const code = document.getElementById('wgCode').value.trim();
    const pin = document.getElementById('wgPin').value.trim();
    const seriennummer = document.getElementById('wgSeriennummer').value.trim();
    const warnung = parseInt(document.getElementById('wgWarnung').value) || null;
    const notizen = document.getElementById('wgNotizen').value.trim();
    const maxEinloesungen = parseInt(document.getElementById('wgMaxEinloesungen').value) || 0;
    const bereitsEingeloest = parseInt(document.getElementById('wgBereitsEingeloest').value) || 0;
    const statusEvaluationAmount = editId
        ? parseWertAmount(existingEntry?.restwert, wert)
        : wert;

    if (editId && typ !== 'aktionscode' && !wertguthabenFormState.isWertUnlocked) {
        const lockedWertReference = pickFirstNonEmptyString([
            normalizeWertSnapshotValue(wertguthabenFormState.wertBeforeAktionscodeSwitch),
            normalizeWertSnapshotValue(existingEntry?.wertBeforeAktionscodeSwitch),
            normalizeWertSnapshotValue(existingEntry?.wert)
        ]);
        const originalWert = parseWertAmount(lockedWertReference, 0);
        if (Math.abs(wert - originalWert) > 0.0001) {
            return alertUser('Wert ist gesperrt. Bitte zuerst über das Schloss entsperren.', 'error');
        }
    }

    if (!wertguthabenFormState.statusManuallyChanged && shouldAutoSetStatusToEingeloest(typ, statusEvaluationAmount, maxEinloesungen, bereitsEingeloest)) {
        status = 'eingeloest';
        statusSelect.value = 'eingeloest';
    }

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

    const statusSnapshotForStorage = (typ === 'aktionscode')
        ? pickFirstNonEmptyString([
            wertguthabenFormState.statusBeforeAktionscodeSwitch,
            String(existingEntry?.statusBeforeAktionscodeSwitch || ''),
            String(existingEntry?.status || ''),
            String(status || '')
        ])
        : String(status || '');

    const wertSnapshotForStorage = (typ === 'aktionscode')
        ? pickFirstNonEmptyString([
            normalizeWertSnapshotValue(wertguthabenFormState.wertBeforeAktionscodeSwitch),
            normalizeWertSnapshotValue(existingEntry?.wertBeforeAktionscodeSwitch),
            normalizeWertSnapshotValue(existingEntry?.wert),
            normalizeWertSnapshotValue(wert)
        ])
        : normalizeWertSnapshotValue(wert);

    data.wertBeforeAktionscodeSwitch = wertSnapshotForStorage;
    data.statusBeforeAktionscodeSwitch = statusSnapshotForStorage;

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
        data.maxEinloesungen = maxEinloesungen;
        data.bereitsEingeloest = bereitsEingeloest;
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
            if (typ !== 'aktionscode') {
                data.restwert = wert;
            }
            data.createdAt = serverTimestamp();
            data.createdBy = currentUser.mode;
            const createdRef = await addDoc(wertguthabenCollection, data);
            const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', createdRef.id, 'transaktionen');
            await addDoc(transaktionenRef, {
                typ: 'gutschrift',
                betrag: wert,
                datum: serverTimestamp(),
                beschreibung: 'Startguthaben bei Erstellung',
                isSystemGeneratedStartguthaben: true,
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode
            });
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
    populateWertguthabenFormFromEntry(wg, { isCopy: false });
    setWertguthabenCopyMode(false);
    wertguthabenFormState.statusManuallyChanged = false;
    wertguthabenFormState.isWertUnlocked = false;
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
        betragInput.removeAttribute('max');
        betragInput.classList.remove('border-red-500', 'focus:border-red-500');
        setTransaktionSaveEnabled(true);
        setTransaktionValidationHint('');
        const max = transaktionModalState.maxEinloesungen;
        const current = transaktionModalState.bereitsEingeloest;
        const availableText = max > 0 ? `${Math.max(0, max - current)} verfügbar` : '∞ verfügbar';
        verfuegbar.textContent = `${current} / ${max > 0 ? max : '∞'} (${availableText})`;
        urspruenglich.textContent = 'Aktionscode';
        return;
    }

    const enteredRaw = Number.parseFloat(betragInput.value || '0');
    const entered = Number.isFinite(enteredRaw) ? enteredRaw : 0;
    const isVerwendung = typSelect.value === 'verwendung';
    const isGutschrift = typSelect.value === 'gutschrift';
    const isKorrektur = typSelect.value === 'korrektur';
    let nextRestwert = transaktionModalState.originalRestwert;
    if (isVerwendung) {
        nextRestwert = transaktionModalState.originalRestwert - entered;
    } else if (isGutschrift || isKorrektur) {
        nextRestwert = transaktionModalState.originalRestwert + entered;
    }

    if (isVerwendung) {
        betragInput.max = transaktionModalState.originalRestwert.toFixed(2);
        betragInput.min = '0';
        nextRestwert = Math.max(0, nextRestwert);
    } else if (isGutschrift) {
        betragInput.removeAttribute('max');
        betragInput.min = '0';
    } else if (isKorrektur) {
        betragInput.removeAttribute('max');
        betragInput.removeAttribute('min');
    } else {
        betragInput.removeAttribute('max');
    }

    const exceedsRestwert = isVerwendung && entered > transaktionModalState.originalRestwert;
    const negativeAfterKorrektur = isKorrektur && nextRestwert < 0;
    const hasValidAmount = isKorrektur ? entered !== 0 : entered > 0;
    const disableSave = !hasValidAmount || exceedsRestwert || negativeAfterKorrektur;

    setTransaktionSaveEnabled(!disableSave);
    let validationMessage = '';
    if (exceedsRestwert) {
        validationMessage = `Maximal verfügbar: ${transaktionModalState.originalRestwert.toFixed(2)} €`;
    } else if (negativeAfterKorrektur) {
        validationMessage = 'Korrektur würde den Restwert unter 0 setzen.';
    } else if (!hasValidAmount) {
        validationMessage = isKorrektur
            ? 'Bitte einen Korrekturwert ungleich 0 eingeben.'
            : 'Bitte einen Betrag größer als 0 eingeben.';
    }
    setTransaktionValidationHint(validationMessage);
    const hasError = !!validationMessage;
    betragInput.classList.toggle('border-red-500', hasError);
    betragInput.classList.toggle('focus:border-red-500', hasError);

    verfuegbar.textContent = `${nextRestwert.toFixed(2)} €`;
    urspruenglich.textContent = `${transaktionModalState.originalRestwert.toFixed(2)} €`;
}

function setTransaktionSaveEnabled(enabled) {
    const saveBtn = document.getElementById('saveTransaktionBtn');
    if (!saveBtn) return;
    saveBtn.disabled = !enabled;
    saveBtn.classList.toggle('opacity-50', !enabled);
    saveBtn.classList.toggle('cursor-not-allowed', !enabled);
}

function setTransaktionValidationHint(message) {
    const hint = document.getElementById('transaktionValidationHint');
    if (!hint) return;
    const text = String(message || '').trim();
    hint.textContent = text;
    hint.classList.toggle('hidden', !text);
}

function setTransaktionVerificationOnlyUi(enabled, source = 'dashboard') {
    const typSelect = document.getElementById('transaktionTyp');
    const betragInput = document.getElementById('transaktionBetrag');
    const allesEinloesenBtn = document.getElementById('transaktionAllesEinloesenBtn');
    const einloesungBtn = document.getElementById('einloesungVormerkenBtn');
    const datumInput = document.getElementById('transaktionDatum');
    const detailsToggle = document.getElementById('transaktionDetailsToggle');

    const lockClassTargets = [betragInput, allesEinloesenBtn, einloesungBtn, detailsToggle];
    lockClassTargets.forEach((target) => {
        if (!target) return;
        target.classList.toggle('opacity-60', !!enabled);
        target.classList.toggle('cursor-not-allowed', !!enabled);
    });

    if (typSelect) typSelect.disabled = !!enabled || source === 'einloese';
    if (betragInput) betragInput.disabled = !!enabled;
    if (allesEinloesenBtn) allesEinloesenBtn.disabled = !!enabled;
    if (einloesungBtn) einloesungBtn.disabled = !!enabled;
    if (datumInput) datumInput.disabled = !!enabled || source === 'einloese';
    if (detailsToggle) detailsToggle.disabled = !!enabled;

    ['transaktionBestellnr', 'transaktionRechnungsnr', 'transaktionBeschreibung'].forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.disabled = !!enabled;
        field.classList.toggle('bg-gray-100', !!enabled);
        field.classList.toggle('cursor-not-allowed', !!enabled);
    });
}

function handleTransaktionTypChange() {
    const typSelect = document.getElementById('transaktionTyp');
    const typ = typSelect?.value || 'verwendung';
    const wgId = document.getElementById('transaktionWertguthabenId')?.value;
    const wg = WERTGUTHABEN[wgId];
    const betragContainer = document.getElementById('transaktionBetragContainer');
    const einloesungContainer = document.getElementById('transaktionEinloesungContainer');
    const allesEinloesenBtn = document.getElementById('transaktionAllesEinloesenBtn');
    const betragInput = document.getElementById('transaktionBetrag');
    const betragLabel = document.querySelector('label[for="transaktionBetrag"]') || document.querySelector('#transaktionBetragContainer label');
    const source = document.getElementById('transaktionOpenSource')?.value || 'dashboard';

    const isEinloesungType = typ === 'einloesung';
    if (betragContainer) betragContainer.classList.toggle('hidden', isEinloesungType);
    if (einloesungContainer) {
        const showEinloesung = isEinloesungType && wg?.typ === 'aktionscode';
        einloesungContainer.classList.toggle('hidden', !showEinloesung);
    }

    if (allesEinloesenBtn) {
        const showAlles = !transaktionModalState.isEditMode && !isEinloesungType && typ === 'verwendung';
        allesEinloesenBtn.classList.toggle('hidden', !showAlles);
    }

    if (betragLabel) {
        if (typ === 'korrektur') {
            betragLabel.textContent = 'Korrekturbetrag (+/- €) *';
        } else {
            betragLabel.textContent = source === 'einloese' ? 'Betrag einlösen (€) *' : 'Betrag (€) *';
        }
    }

    if (betragInput) {
        if (typ === 'korrektur') {
            if (betragInput.type !== 'text') {
                betragInput.type = 'text';
            }
            betragInput.inputMode = 'decimal';
            betragInput.placeholder = 'z. B. -5.00 oder +5.00';
            betragInput.removeAttribute('min');
        } else {
            if (betragInput.type !== 'number') {
                betragInput.type = 'number';
            }
            betragInput.inputMode = 'decimal';
            betragInput.placeholder = '0.00';
            betragInput.min = '0';
        }
    }

    updateTransaktionPreview();
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
    const restwertVerifiziertInfo = document.getElementById('transaktionRestwertVerifiziertInfo');
    const allesEinloesenBtn = document.getElementById('transaktionAllesEinloesenBtn');
    const verfuegbarElement = document.getElementById('transaktionVerfuegbar');
    const betragLabel = document.querySelector('label[for="transaktionBetrag"]') || document.querySelector('#transaktionBetragContainer label');
    const saveBtn = document.getElementById('saveTransaktionBtn');
    const optionVerwendung = transaktionTypSelect?.querySelector('option[value="verwendung"]');
    const optionGutschrift = transaktionTypSelect?.querySelector('option[value="gutschrift"]');
    const optionKorrektur = transaktionTypSelect?.querySelector('option[value="korrektur"]');
    const optionEinloesung = transaktionTypSelect?.querySelector('option[value="einloesung"]');

    document.getElementById('transaktionWertguthabenId').value = wertguthabenId;
    document.getElementById('editTransaktionId').value = editTransaktion?.id || '';
    document.getElementById('transaktionOpenSource').value = source;

    transaktionModalState.source = source;
    transaktionModalState.editTransaktionId = editTransaktion?.id || '';
    transaktionModalState.isEditMode = !!editTransaktion;
    transaktionModalState.isVerificationOnlyMode = isEditFromHistory;
    transaktionModalState.isExistingTransaktionVerified = !!editTransaktion?.betragVerifiziert;
    transaktionModalState.maxEinloesungen = Number(wg.maxEinloesungen || 0);
    transaktionModalState.bereitsEingeloest = Number(wg.bereitsEingeloest || 0);
    transaktionModalState.isEinloesungMode = false;

    const aktuellerRestwert = Number(wg.restwert !== undefined ? wg.restwert : wg.wert || 0);
    let originalRestwert = aktuellerRestwert;
    if (editTransaktion && (editTransaktion.typ === 'verwendung' || editTransaktion.typ === 'gutschrift' || editTransaktion.typ === 'korrektur')) {
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

    if (wg.typ === 'aktionscode') {
        if (optionVerwendung) {
            optionVerwendung.hidden = true;
            optionVerwendung.disabled = true;
        }
        if (optionGutschrift) {
            optionGutschrift.hidden = true;
            optionGutschrift.disabled = true;
        }
        if (optionKorrektur) {
            optionKorrektur.hidden = true;
            optionKorrektur.disabled = true;
        }
        if (optionEinloesung) {
            optionEinloesung.hidden = false;
            optionEinloesung.disabled = false;
        }
        typ = 'einloesung';
    } else {
        if (optionVerwendung) {
            optionVerwendung.hidden = false;
            optionVerwendung.disabled = false;
        }
        if (optionGutschrift) {
            optionGutschrift.hidden = false;
            optionGutschrift.disabled = false;
        }
        if (optionKorrektur) {
            optionKorrektur.hidden = false;
            optionKorrektur.disabled = false;
        }
        if (optionEinloesung) {
            optionEinloesung.hidden = true;
            optionEinloesung.disabled = true;
        }
        if (typ === 'einloesung') typ = 'verwendung';
    }

    transaktionTypSelect.value = typ;
    transaktionTypSelect.disabled = source === 'einloese';

    if (wg.typ === 'aktionscode' && typ === 'einloesung') {
        transaktionModalState.isEinloesungMode = true;
    }

    transaktionBetragInput.value = editTransaktion?.betrag !== undefined ? Number(editTransaktion.betrag || 0).toFixed(2) : '';
    if (betragLabel) betragLabel.textContent = source === 'einloese' ? 'Betrag einlösen (€) *' : 'Betrag (€) *';

    if (restwertVerifiziertInfo) {
        const verificationMeta = getWertguthabenVerificationMeta(wg);
        if (verificationMeta) {
            restwertVerifiziertInfo.textContent = `✅ ${verificationMeta}`;
            restwertVerifiziertInfo.classList.remove('hidden');
        } else {
            restwertVerifiziertInfo.textContent = '';
            restwertVerifiziertInfo.classList.add('hidden');
        }
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

    const verificationAllowed = isEditFromHistory && wg.typ !== 'aktionscode';
    let alreadyVerified = false;

    if (verifySection && verifyCheckbox && verifyInfo) {
        if (verificationAllowed) {
            verifySection.classList.remove('hidden');
            alreadyVerified = !!editTransaktion?.betragVerifiziert;
            verifyCheckbox.checked = alreadyVerified;
            verifyCheckbox.disabled = alreadyVerified;
            verifyInfo.textContent = alreadyVerified
                ? `Bereits verifiziert: ${formatDateTime(editTransaktion.betragVerifiziertAm)} · ${getDisplayUserName(editTransaktion.betragVerifiziertVon)} (nicht änderbar)`
                : 'Bei Aktivierung wird der Betrag mit Zeitstempel und Benutzer verifiziert.';
        } else {
            verifySection.classList.add('hidden');
            verifyCheckbox.checked = false;
            verifyCheckbox.disabled = !!isEditFromHistory;
            verifyInfo.textContent = '';
        }
    }

    if (saveBtn) {
        saveBtn.textContent = editTransaktion ? 'Verifizierung speichern' : 'Transaktion buchen';
    }

    setTransaktionDetailsExpanded(!!(editTransaktion?.bestellnr || editTransaktion?.rechnungsnr || editTransaktion?.beschreibung));
    handleTransaktionTypChange();
    updateTransaktionPreview();
    setTransaktionVerificationOnlyUi(isEditFromHistory, source);

    if (isEditFromHistory) {
        if (!verificationAllowed) {
            setTransaktionSaveEnabled(false);
            setTransaktionValidationHint('Für Aktionscodes ist keine Betragsverifizierung möglich.');
        } else if (alreadyVerified) {
            setTransaktionSaveEnabled(false);
            setTransaktionValidationHint('Diese Transaktion ist bereits verifiziert und gesperrt.');
        } else {
            setTransaktionSaveEnabled(true);
            setTransaktionValidationHint('Nur "Betrag verifizieren" kann in diesem Modus geändert werden.');
        }
    }

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
    transaktionModalState.isEditMode = false;
    transaktionModalState.isVerificationOnlyMode = false;
    transaktionModalState.isExistingTransaktionVerified = false;
    transaktionModalState.originalRestwert = 0;
    transaktionModalState.isEinloesungMode = false;
    transaktionModalState.maxEinloesungen = 0;
    transaktionModalState.bereitsEingeloest = 0;
    setTransaktionVerificationOnlyUi(false, 'dashboard');
    setTransaktionDetailsExpanded(false);
}

async function clearTransaktionVerificationStatuses(wertguthabenId) {
    if (!wertguthabenId) return;

    const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');
    const snapshot = await getDocs(transaktionenRef);
    const resetPromises = [];

    snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const hasVerificationMeta = !!data.betragVerifiziert || !!data.betragVerifiziertAm || !!data.betragVerifiziertVon;
        if (!hasVerificationMeta) return;

        resetPromises.push(updateDoc(docSnap.ref, {
            betragVerifiziert: false,
            betragVerifiziertAm: null,
            betragVerifiziertVon: null,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        }));
    });

    if (resetPromises.length > 0) {
        await Promise.all(resetPromises);
    }
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
    const needsNewVerification = shouldVerify && !transaktionModalState.isExistingTransaktionVerified;

    const wg = WERTGUTHABEN[wertguthabenId];
    if (!wg) {
        return alertUser('Wertguthaben nicht gefunden!', 'error');
    }

    if (editTransaktionId) {
        try {
            if (wg.typ === 'aktionscode') {
                return alertUser('Für Aktionscodes ist keine Betragsverifizierung verfügbar.', 'warning');
            }

            const transaktionRef = doc(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen', editTransaktionId);
            const transaktionDoc = await getDoc(transaktionRef);
            if (!transaktionDoc.exists()) {
                return alertUser('Transaktion nicht gefunden!', 'error');
            }

            if (!needsNewVerification) {
                return alertUser('In diesem Modus kann nur "Betrag verifizieren" gespeichert werden.', 'warning');
            }

            await updateDoc(transaktionRef, {
                betragVerifiziert: true,
                betragVerifiziertAm: serverTimestamp(),
                betragVerifiziertVon: currentUser.mode,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.mode
            });

            const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
            await updateDoc(wertguthabenRef, {
                restwertVerifiziert: true,
                restwertVerifiziertAm: serverTimestamp(),
                restwertVerifiziertVon: currentUser.mode,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.mode
            });

            alertUser('Transaktion verifiziert!', 'success');
            closeTransaktionModal();

            if (document.getElementById('wertguthabenDetailsModal').style.display === 'flex') {
                setTimeout(() => openWertguthabenDetails(wertguthabenId), 300);
            }
        } catch (error) {
            console.error('Fehler bei der Verifizierung der Transaktion:', error);
            alertUser('Fehler beim Verifizieren: ' + error.message, 'error');
        }
        return;
    }

    if (typ === 'einloesung' && wg.typ !== 'aktionscode') {
        return alertUser('Einlösung ist nur für Aktionscodes möglich.', 'error');
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

            await clearTransaktionVerificationStatuses(wertguthabenId);

            const neueEinloesungen = bereitsEingeloest + 1;
            const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
            const updateData = {
                bereitsEingeloest: neueEinloesungen,
                restwertVerifiziert: false,
                restwertVerifiziertAm: null,
                restwertVerifiziertVon: null,
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

    if (typ === 'korrektur') {
        if (Math.abs(betrag) <= 0) {
            return alertUser('Bitte einen gültigen Korrekturbetrag eingeben (nicht 0).', 'error');
        }
    } else if (!betrag || betrag <= 0) {
        return alertUser('Bitte einen gültigen Betrag eingeben!', 'error');
    }

    if (typ === 'verwendung' && betrag > transaktionModalState.originalRestwert) {
        return alertUser(`Nicht genug Guthaben! Verfügbar: ${transaktionModalState.originalRestwert.toFixed(2)} €`, 'error');
    }

    if (typ === 'korrektur' && (transaktionModalState.originalRestwert + betrag) < 0) {
        return alertUser('Korrektur würde den Restwert unter 0 setzen.', 'error');
    }

    const neuerRestwert = typ === 'verwendung'
        ? Math.max(0, transaktionModalState.originalRestwert - betrag)
        : Math.max(0, transaktionModalState.originalRestwert + betrag);

    try {
        const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');

        if (editTransaktionId) {
            const transaktionRef = doc(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen', editTransaktionId);
            await updateDoc(transaktionRef, {
                typ,
                betrag,
                bestellnr,
                rechnungsnr,
                beschreibung,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser.mode
            });
        } else {
            await addDoc(transaktionenRef, {
                typ,
                betrag,
                datum: serverTimestamp(),
                bestellnr,
                rechnungsnr,
                beschreibung,
                isSystemGeneratedStartguthaben: false,
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode
            });

            await clearTransaktionVerificationStatuses(wertguthabenId);
        }

        const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
        const wgUpdateData = {
            restwert: neuerRestwert,
            restwertVerifiziert: false,
            restwertVerifiziertAm: null,
            restwertVerifiziertVon: null,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        };
        if (wg.typ !== 'aktionscode' && shouldAutoSetStatusToEingeloest(wg.typ, neuerRestwert, Number(wg.maxEinloesungen || 0), Number(wg.bereitsEingeloest || 0))) {
            wgUpdateData.status = 'eingeloest';
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
            ${buildSensitiveCopyFieldHtml('Code', wg.code)}
            ${buildSensitiveCopyFieldHtml('PIN', wg.pin)}
            ${buildSensitiveCopyFieldHtml('Seriennummer', wg.seriennummer)}
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
    const getTransaktionSortTimestamp = (transaktion) => {
        const date = toDateValue(transaktion?.datum || transaktion?.createdAt || transaktion?.updatedAt);
        return date ? date.getTime() : 0;
    };
    const sortedTransaktionen = [...transaktionen].sort((a, b) => {
        const aSystem = isStartguthabenTransaktion(a);
        const bSystem = isStartguthabenTransaktion(b);
        if (aSystem !== bSystem) return aSystem ? -1 : 1;
        return getTransaktionSortTimestamp(a) - getTransaktionSortTimestamp(b);
    });
    const transaktionsList = document.getElementById('transaktionsList');
    
    if (sortedTransaktionen.length === 0) {
        transaktionsList.innerHTML = '<p class="text-center text-gray-400 italic py-4">Noch keine Transaktionen vorhanden.</p>';
    } else {
        transaktionsList.innerHTML = sortedTransaktionen.map(t => {
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
            const transaktionBetrag = Number(t.betrag || 0);
            const isKorrektur = t.typ === 'korrektur';
            const isStartguthaben = isStartguthabenTransaktion(t);
            const icon = t.typ === 'verwendung' ? '📉' : (t.typ === 'einloesung' ? '🎟️' : (isKorrektur ? '🛠️' : '📈'));
            const colorClass = t.typ === 'verwendung'
                ? 'text-red-600'
                : (t.typ === 'einloesung' ? 'text-pink-600' : (isKorrektur ? 'text-amber-700' : 'text-green-600'));
            const betragText = t.typ === 'verwendung'
                ? `- ${Math.abs(transaktionBetrag).toFixed(2)} €`
                : (t.typ === 'einloesung'
                    ? '1x Einlösung'
                    : (isKorrektur
                        ? `${transaktionBetrag >= 0 ? '+' : '-'} ${Math.abs(transaktionBetrag).toFixed(2)} € (Korrektur)`
                        : `+ ${Math.abs(transaktionBetrag).toFixed(2)} €`));
            const canEdit = (t.typ === 'verwendung' || t.typ === 'gutschrift' || t.typ === 'korrektur') && wg.typ !== 'aktionscode';
            const canDelete = !isStartguthaben;
            const verifyInfo = (wg.typ !== 'aktionscode' && t.betragVerifiziert)
                ? `✅ Verifiziert: ${formatDateTime(t.betragVerifiziertAm)} · ${getDisplayUserName(t.betragVerifiziertVon)}`
                : '';
            
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
                            ${isStartguthaben ? '<div class="mb-1 text-xs font-semibold text-amber-700">🔒 Systemeintrag</div>' : ''}
                            <div class="flex gap-3 text-xs text-gray-500">
                                ${t.bestellnr ? `<span>📦 Best.-Nr: ${t.bestellnr}</span>` : ''}
                                ${t.rechnungsnr ? `<span>🧾 Rech.-Nr: ${t.rechnungsnr}</span>` : ''}
                            </div>
                            ${verifyInfo ? `<div class="mt-1 text-xs font-semibold text-emerald-700">${verifyInfo}</div>` : ''}
                        </div>
                        <div class="ml-2 flex gap-1">
                            ${canEdit ? `<button onclick="window.openEditTransaktionFromHistory('${id}', '${t.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Transaktion bearbeiten">✏️</button>` : ''}
                            ${canDelete ? `<button onclick="deleteTransaktion('${id}', '${t.id}')" 
                                    class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Transaktion löschen">
                                🗑️
                            </button>` : ''}
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

    document.getElementById('copyWertguthabenBtn').onclick = () => {
        document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        openCreateModal({
            copyFromEntry: {
                ...wg,
                id
            }
        });
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

    if (newCategoryInput && !newCategoryInput.dataset.enterListenerAttached) {
        newCategoryInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addWertguthabenKategorieFromSettings();
        });
        newCategoryInput.dataset.enterListenerAttached = 'true';
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
        if (isStartguthabenTransaktion(gelöschteTransaktion)) {
            return alertUser('Die Startguthaben-Transaktion ist gesperrt und kann nicht gelöscht werden.', 'warning');
        }
        
        // Jetzt Transaktion löschen
        await deleteDoc(transaktionRef);

        // Wertguthaben-Daten anpassen
        const wertguthabenRef = doc(wertguthabenCollection, wertguthabenId);
        const updateData = {
            restwertVerifiziert: false,
            restwertVerifiziertAm: null,
            restwertVerifiziertVon: null,
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
        } else if (gelöschteTransaktion.typ === 'korrektur') {
            // Korrektur rückgängig machen
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

        await clearTransaktionVerificationStatuses(wertguthabenId);
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

