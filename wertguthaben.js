// // @ts-check
// ========================================
// WERTGUTHABEN SYSTEM
// ========================================

import {
    alertUser,
    db,
    currentUser,
    USERS,
    usersCollectionRef,
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
    where,
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
let unsubscribeWertguthabenSettings = null;
let currentFilter = { typ: '', kategorie: '', eigentuemer: '', verifizierung: 'ignore', status: 'aktiv' };
let activeWertguthabenFilters = [];
let wertguthabenSearchJoinMode = 'and';
let pendingKategorieNormalizations = new Set();
let pendingFixedIdAssignments = new Set();
let currentEinloeseWertguthabenId = '';
let currentWertguthabenListId = '';
let wgEinloeseScannerStream = null;
let wgEinloeseScannerInterval = null;
let wgEinloeseScannerBusy = false;
let wgEinloeseBarcodeDetector = null;
let wertguthabenMenuOpen = false;
let wertguthabenDetailsMoreMenuOpen = false;
let wgTransaktionenRenderRequestId = 0;
let wgListDeleteTimer = null;
let wgListDeleteSecondsLeft = 0;
let wgListDeleteTargetId = '';
const WG_VERIFIABLE_TRANSACTION_TYPES = new Set(['verwendung', 'gutschrift', 'korrektur']);
let ARCHIVED_WERTGUTHABEN = {};
const wertguthabenDetailsState = {
    readOnly: false,
    entryId: '',
    entry: null
};
const wertguthabenFormState = {
    isCopyMode: false,
    copySourceId: '',
    statusManuallyChanged: false,
    statusManuallyChangedBeforeAktionscodeSwitch: false,
    isWertUnlocked: false,
    lockedEditEntryId: '',
    isListAssignmentOnly: false,
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
const transaktionVerificationModalState = {
    wertguthabenId: '',
    transaktionId: '',
    transaktion: null
};
const einloeseSelectionState = {
    requiresListConfirmation: false,
    confirmationGranted: false,
    warningText: '',
    isForeignListSelection: false,
    hasAdditionalForeignMatches: false
};
const WG_WERT_UNLOCK_COUNTDOWN_SECONDS = 30;
let wgWertUnlockSecondsLeft = 0;
let wgWertUnlockTimer = null;
let wertguthabenSettingsSyncUserId = '';

const WG_UNASSIGNED_KATEGORIE = 'Nicht zugeordnet';
const WG_UNASSIGNED_LIST_NAME = 'Nicht zugeordnete Elemente';
const WG_SPECIAL_LIST_ID = '__unassigned__';
const WG_LIST_DELETE_COUNTDOWN_SECONDS = 60;
const WG_LIST_DELETE_CONFIRM_TEXT = 'LISTE UNWIDERRUFLICH LÖSCHEN';
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
    archivGruende: [],
    listen: [],
    defaultListId: '',
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
    console.log("💰 Credit-Wallet-System wird initialisiert...");

    // Einstellungen aus Firebase laden (NACH loadUserSettings)
    loadSettings();
    startWertguthabenSettingsSync();

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

    const listSelector = document.getElementById('wg-list-selector');
    if (listSelector && !listSelector.dataset.listenerAttached) {
        listSelector.addEventListener('change', (event) => {
            setCurrentWertguthabenList(event.target.value);
        });
        listSelector.dataset.listenerAttached = 'true';
    }

    const settingsBtn = document.getElementById('btn-wertguthaben-settings');
    if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
        settingsBtn.addEventListener('click', () => {
            closeWertguthabenMenuDropdown();
            openSettingsModal();
        });
        settingsBtn.dataset.listenerAttached = 'true';
    }

    const menuBtn = document.getElementById('btn-wertguthaben-menu');
    if (menuBtn && !menuBtn.dataset.listenerAttached) {
        menuBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleWertguthabenMenuDropdown();
        });
        menuBtn.dataset.listenerAttached = 'true';
    }

    const openTransaktionenBtn = document.getElementById('btn-open-wg-transaktionen');
    if (openTransaktionenBtn && !openTransaktionenBtn.dataset.listenerAttached) {
        openTransaktionenBtn.addEventListener('click', async () => {
            closeWertguthabenMenuDropdown();
            await openWertguthabenTransaktionenModal();
        });
        openTransaktionenBtn.dataset.listenerAttached = 'true';
    }

    const openArchivBtn = document.getElementById('btn-open-wg-archiv');
    if (openArchivBtn && !openArchivBtn.dataset.listenerAttached) {
        openArchivBtn.addEventListener('click', async () => {
            closeWertguthabenMenuDropdown();
            await openWertguthabenArchivModal();
        });
        openArchivBtn.dataset.listenerAttached = 'true';
    }

    const closeTransaktionenModalBtn = document.getElementById('closeWertguthabenTransaktionenModal');
    if (closeTransaktionenModalBtn && !closeTransaktionenModalBtn.dataset.listenerAttached) {
        closeTransaktionenModalBtn.addEventListener('click', closeWertguthabenTransaktionenModal);
        closeTransaktionenModalBtn.dataset.listenerAttached = 'true';
    }

    const closeTransaktionenFooterBtn = document.getElementById('closeWertguthabenTransaktionenBtn');
    if (closeTransaktionenFooterBtn && !closeTransaktionenFooterBtn.dataset.listenerAttached) {
        closeTransaktionenFooterBtn.addEventListener('click', closeWertguthabenTransaktionenModal);
        closeTransaktionenFooterBtn.dataset.listenerAttached = 'true';
    }

    ['wgTransaktionenVon', 'wgTransaktionenBis'].forEach((inputId) => {
        const input = document.getElementById(inputId);
        if (!input || input.dataset.listenerAttached === 'true') return;
        input.addEventListener('change', renderWertguthabenTransaktionenOverview);
        input.dataset.listenerAttached = 'true';
    });

    [
        { id: 'wgTransaktionenQuickHeute', key: 'heute' },
        { id: 'wgTransaktionenQuick7Tage', key: '7tage' },
        { id: 'wgTransaktionenQuickMonat', key: 'monat' }
    ].forEach(({ id, key }) => {
        const button = document.getElementById(id);
        if (!button || button.dataset.listenerAttached === 'true') return;
        button.addEventListener('click', () => {
            setWertguthabenTransaktionenQuickRange(key);
        });
        button.dataset.listenerAttached = 'true';
    });

    const transaktionenTableBody = document.getElementById('wertguthabenTransaktionenTableBody');
    if (transaktionenTableBody && !transaktionenTableBody.dataset.listenerAttached) {
        transaktionenTableBody.addEventListener('click', (event) => {
            const row = event.target.closest('tr[data-wertguthaben-id]');
            if (!row) return;
            const wertguthabenId = String(row.dataset.wertguthabenId || '').trim();
            if (!wertguthabenId) return;
            window.openWertguthabenDetails(wertguthabenId);
        });
        transaktionenTableBody.dataset.listenerAttached = 'true';
    }

    const closeArchivModalBtn = document.getElementById('closeWertguthabenArchivModal');
    if (closeArchivModalBtn && !closeArchivModalBtn.dataset.listenerAttached) {
        closeArchivModalBtn.addEventListener('click', closeWertguthabenArchivModal);
        closeArchivModalBtn.dataset.listenerAttached = 'true';
    }

    const closeArchivFooterBtn = document.getElementById('closeWertguthabenArchivBtn');
    if (closeArchivFooterBtn && !closeArchivFooterBtn.dataset.listenerAttached) {
        closeArchivFooterBtn.addEventListener('click', closeWertguthabenArchivModal);
        closeArchivFooterBtn.dataset.listenerAttached = 'true';
    }

    const archivTableBody = document.getElementById('wertguthabenArchivTableBody');
    if (archivTableBody && !archivTableBody.dataset.listenerAttached) {
        archivTableBody.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-archiv-action]');
            if (!button) return;
            const entryId = String(button.dataset.entryId || '').trim();
            if (!entryId) return;
            const action = String(button.dataset.archivAction || '').trim();
            if (action === 'view') {
                await window.openArchivedWertguthabenDetails(entryId);
                return;
            }
            if (action === 'restore') {
                await restoreArchivedWertguthaben(entryId);
                return;
            }
            if (action === 'delete') {
                await permanentlyDeleteArchivedWertguthaben(entryId);
            }
        });
        archivTableBody.dataset.listenerAttached = 'true';
    }

    const closeArchiveConfirmModalBtn = document.getElementById('closeWertguthabenArchiveConfirmModal');
    if (closeArchiveConfirmModalBtn && !closeArchiveConfirmModalBtn.dataset.listenerAttached) {
        closeArchiveConfirmModalBtn.addEventListener('click', closeWertguthabenArchiveConfirmModal);
        closeArchiveConfirmModalBtn.dataset.listenerAttached = 'true';
    }

    const cancelArchiveBtn = document.getElementById('cancelWertguthabenArchiveBtn');
    if (cancelArchiveBtn && !cancelArchiveBtn.dataset.listenerAttached) {
        cancelArchiveBtn.addEventListener('click', closeWertguthabenArchiveConfirmModal);
        cancelArchiveBtn.dataset.listenerAttached = 'true';
    }

    const closeListDeleteBtn = document.getElementById('closeWertguthabenListenDeleteModal');
    if (closeListDeleteBtn && !closeListDeleteBtn.dataset.listenerAttached) {
        closeListDeleteBtn.addEventListener('click', closeWertguthabenListDeleteModal);
        closeListDeleteBtn.dataset.listenerAttached = 'true';
    }

    const cancelListDeleteBtn = document.getElementById('cancelWertguthabenListenDeleteBtn');
    if (cancelListDeleteBtn && !cancelListDeleteBtn.dataset.listenerAttached) {
        cancelListDeleteBtn.addEventListener('click', closeWertguthabenListDeleteModal);
        cancelListDeleteBtn.dataset.listenerAttached = 'true';
    }

    const listDeleteCheckbox = document.getElementById('wg-list-delete-checkbox');
    if (listDeleteCheckbox && !listDeleteCheckbox.dataset.listenerAttached) {
        listDeleteCheckbox.addEventListener('change', updateWertguthabenListDeleteConfirmState);
        listDeleteCheckbox.dataset.listenerAttached = 'true';
    }

    const listDeleteInput = document.getElementById('wg-list-delete-confirm-text');
    if (listDeleteInput && !listDeleteInput.dataset.listenerAttached) {
        listDeleteInput.addEventListener('input', () => {
            listDeleteInput.value = String(listDeleteInput.value || '').toUpperCase();
            updateWertguthabenListDeleteConfirmState();
        });
        listDeleteInput.addEventListener('copy', (event) => event.preventDefault());
        listDeleteInput.addEventListener('cut', (event) => event.preventDefault());
        listDeleteInput.addEventListener('select', () => {
            window.setTimeout(() => {
                const end = String(listDeleteInput.value || '').length;
                listDeleteInput.setSelectionRange(end, end);
            }, 0);
        });
        listDeleteInput.addEventListener('mouseup', () => {
            window.setTimeout(() => {
                const end = String(listDeleteInput.value || '').length;
                listDeleteInput.setSelectionRange(end, end);
            }, 0);
        });
        listDeleteInput.addEventListener('touchend', () => {
            window.setTimeout(() => {
                const end = String(listDeleteInput.value || '').length;
                listDeleteInput.setSelectionRange(end, end);
            }, 0);
        });
        listDeleteInput.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'x'].includes(String(event.key || '').toLowerCase())) {
                event.preventDefault();
            }
        });
        listDeleteInput.dataset.listenerAttached = 'true';
    }

    const listDeleteModal = document.getElementById('wertguthabenListenDeleteModal');
    if (listDeleteModal && !listDeleteModal.dataset.copyProtectionAttached) {
        ['copy', 'cut', 'dragstart', 'contextmenu'].forEach((eventName) => {
            listDeleteModal.addEventListener(eventName, (event) => {
                event.preventDefault();
            });
        });
        listDeleteModal.addEventListener('selectstart', (event) => {
            event.preventDefault();
        });
        listDeleteModal.dataset.copyProtectionAttached = 'true';
    }

    const listDeleteConfirmBtn = document.getElementById('wg-list-delete-confirm-btn');
    if (listDeleteConfirmBtn && !listDeleteConfirmBtn.dataset.listenerAttached) {
        listDeleteConfirmBtn.addEventListener('click', confirmWertguthabenListDeletion);
        listDeleteConfirmBtn.dataset.listenerAttached = 'true';
    }

    const confirmArchiveBtn = document.getElementById('confirmWertguthabenArchiveBtn');
    if (confirmArchiveBtn && !confirmArchiveBtn.dataset.listenerAttached) {
        confirmArchiveBtn.addEventListener('click', confirmWertguthabenArchivierung);
        confirmArchiveBtn.dataset.listenerAttached = 'true';
    }

    const archiveReasonSelect = document.getElementById('wgArchiveReasonSelect');
    if (archiveReasonSelect && !archiveReasonSelect.dataset.listenerAttached) {
        archiveReasonSelect.addEventListener('change', () => {
            const newReasonWrapper = document.getElementById('wgArchiveReasonNewWrapper');
            const newReasonInput = document.getElementById('wgArchiveReasonNew');
            const useNewReason = archiveReasonSelect.value === '__new__';
            if (newReasonWrapper) newReasonWrapper.classList.toggle('hidden', !useNewReason);
            if (!useNewReason && newReasonInput) newReasonInput.value = '';
            updateWertguthabenArchiveConfirmState();
        });
        archiveReasonSelect.dataset.listenerAttached = 'true';
    }

    const archiveReasonNew = document.getElementById('wgArchiveReasonNew');
    if (archiveReasonNew && !archiveReasonNew.dataset.listenerAttached) {
        archiveReasonNew.addEventListener('input', updateWertguthabenArchiveConfirmState);
        archiveReasonNew.dataset.listenerAttached = 'true';
    }

    const archiveConfirmText = document.getElementById('wgArchiveConfirmText');
    if (archiveConfirmText && !archiveConfirmText.dataset.listenerAttached) {
        archiveConfirmText.addEventListener('input', () => {
            archiveConfirmText.value = String(archiveConfirmText.value || '').toUpperCase();
            updateWertguthabenArchiveConfirmState();
        });
        archiveConfirmText.dataset.listenerAttached = 'true';
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
            closeWertguthabenDetailsMoreMenu();
            document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        });
        closeDetails.dataset.listenerAttached = 'true';
    }

    const closeVerificationModalBtn = document.getElementById('closeTransaktionVerificationModal');
    if (closeVerificationModalBtn && !closeVerificationModalBtn.dataset.listenerAttached) {
        closeVerificationModalBtn.addEventListener('click', closeTransaktionVerificationModal);
        closeVerificationModalBtn.dataset.listenerAttached = 'true';
    }

    const cancelVerificationBtn = document.getElementById('cancelTransaktionVerificationBtn');
    if (cancelVerificationBtn && !cancelVerificationBtn.dataset.listenerAttached) {
        cancelVerificationBtn.addEventListener('click', closeTransaktionVerificationModal);
        cancelVerificationBtn.dataset.listenerAttached = 'true';
    }

    const confirmVerificationBtn = document.getElementById('confirmTransaktionVerificationBtn');
    if (confirmVerificationBtn && !confirmVerificationBtn.dataset.listenerAttached) {
        confirmVerificationBtn.addEventListener('click', saveTransaktionVerification);
        confirmVerificationBtn.dataset.listenerAttached = 'true';
    }

    const verificationCheckbox = document.getElementById('transaktionVerificationConfirmCheckbox');
    if (verificationCheckbox && !verificationCheckbox.dataset.listenerAttached) {
        verificationCheckbox.addEventListener('change', updateTransaktionVerificationConfirmState);
        verificationCheckbox.dataset.listenerAttached = 'true';
    }

    const detailsMoreBtn = document.getElementById('wertguthabenDetailsMoreBtn');
    if (detailsMoreBtn && !detailsMoreBtn.dataset.listenerAttached) {
        detailsMoreBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleWertguthabenDetailsMoreMenu();
        });
        detailsMoreBtn.dataset.listenerAttached = 'true';
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

    const kategorieSelect = document.getElementById('wgKategorie');
    if (kategorieSelect && !kategorieSelect.dataset.categoryListenerAttached) {
        kategorieSelect.addEventListener('change', () => {
            kategorieSelect.dataset.selectedKategorie = String(kategorieSelect.value || '').trim();
        });
        kategorieSelect.dataset.categoryListenerAttached = 'true';
    }

    const listFieldSelect = document.getElementById('wgListe');
    if (listFieldSelect && !listFieldSelect.dataset.listenerAttached) {
        listFieldSelect.addEventListener('change', () => {
            if (!hasRealWertguthabenListen()) {
                updateWertguthabenListFieldHint('Bitte zuerst mindestens eine Liste anlegen.', 'error');
                return;
            }
            if (isSpecialWertguthabenListId(listFieldSelect.value)) {
                updateWertguthabenListFieldHint('Nicht zugeordnete Elemente können nur einer echten Liste zugewiesen werden.', 'warning');
                return;
            }
            if (!listFieldSelect.value) {
                updateWertguthabenListFieldHint('Neuanlage in „Nicht zugeordnete Elemente“ ist nicht möglich.', 'warning');
                return;
            }
            updateWertguthabenListFieldHint('');
        });
        listFieldSelect.dataset.listenerAttached = 'true';
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
            if (!e.target.closest('#btn-wertguthaben-menu') && !e.target.closest('#wertguthabenMenuDropdown')) {
                closeWertguthabenMenuDropdown();
            }
            if (!e.target.closest('#wertguthabenDetailsMoreBtn') && !e.target.closest('#wertguthabenDetailsMoreMenu')) {
                closeWertguthabenDetailsMoreMenu();
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

    const filterVerifizierung = document.getElementById('filter-wg-verifizierung');
    if (filterVerifizierung && !filterVerifizierung.dataset.listenerAttached) {
        filterVerifizierung.addEventListener('change', (e) => {
            const value = String(e.target.value || 'ignore');
            currentFilter.verifizierung = value === 'verified' || value === 'unverified' ? value : 'ignore';

            if (currentFilter.verifizierung !== 'ignore') {
                currentFilter.status = '';
                const statusSelect = document.getElementById('filter-wg-status');
                if (statusSelect) statusSelect.value = '';
            }

            syncWertguthabenTypFilterWithVerification();
            renderWertguthabenTable();
        });
        filterVerifizierung.dataset.listenerAttached = 'true';
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

    syncWertguthabenTypFilterWithVerification();

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
                const idMatches = resolveEinloeseIdMatches(normalizedTerm);
                if (idMatches.localExact) {
                    window.selectEinloeseWertguthaben(idMatches.localExact.id);
                    return;
                }
                if (idMatches.specialExact) {
                    hideEinloeseSuggestions();
                    alertUser('Einträge aus „Nicht zugeordnete Elemente“ können nicht über das Einlöse-System gebucht werden.', 'warning');
                    return;
                }
                if (idMatches.foreignExact) {
                    window.selectEinloeseWertguthaben(idMatches.foreignExact.id);
                    return;
                }
            }

            updateEinloeseSuggestions(term);
        });
        einloeseInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const idMatches = resolveEinloeseIdMatches(einloeseInput.value);
            if (idMatches.localExact) {
                window.selectEinloeseWertguthaben(idMatches.localExact.id);
                return;
            }
            if (idMatches.specialExact) {
                hideEinloeseSuggestions();
                alertUser('Einträge aus „Nicht zugeordnete Elemente“ können nicht über das Einlöse-System gebucht werden.', 'warning');
                return;
            }
            if (idMatches.foreignExact) {
                window.selectEinloeseWertguthaben(idMatches.foreignExact.id);
                return;
            }
            if (idMatches.localPartialMatches[0]) {
                window.selectEinloeseWertguthaben(idMatches.localPartialMatches[0].id);
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
            if (einloeseSelectionState.requiresListConfirmation && !einloeseSelectionState.confirmationGranted) {
                return;
            }
            window.openTransaktionModal(currentEinloeseWertguthabenId, { source: 'einloese' });
        });
        einloeseBookingBtn.dataset.listenerAttached = 'true';
    }

    const einloeseWarningConfirmBtn = document.getElementById('wg-einloese-list-warning-confirm');
    if (einloeseWarningConfirmBtn && !einloeseWarningConfirmBtn.dataset.listenerAttached) {
        einloeseWarningConfirmBtn.addEventListener('click', () => {
            einloeseSelectionState.confirmationGranted = true;
            updateEinloeseListWarningUi();
        });
        einloeseWarningConfirmBtn.dataset.listenerAttached = 'true';
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

    const einloesungAnzahlInput = document.getElementById('transaktionEinloesungAnzahl');
    if (einloesungAnzahlInput && !einloesungAnzahlInput.dataset.listenerAttached) {
        einloesungAnzahlInput.addEventListener('input', updateTransaktionPreview);
        einloesungAnzahlInput.dataset.listenerAttached = 'true';
    }

    const typSelect = document.getElementById('transaktionTyp');
    if (typSelect && !typSelect.dataset.listenerAttached) {
        typSelect.addEventListener('change', handleTransaktionTypChange);
        typSelect.dataset.listenerAttached = 'true';
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

function setEinloeseHeaderNavigationState(isEinloeseOpen) {
    const openButton = document.getElementById('btn-open-einloese-system');
    const closeButton = document.getElementById('btn-close-einloese-system');
    if (openButton) openButton.classList.toggle('hidden', !!isEinloeseOpen);
    if (closeButton) closeButton.classList.toggle('hidden', !isEinloeseOpen);
}

function openEinloeseSystemView() {
    setEinloeseHeaderNavigationState(true);
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
    setEinloeseHeaderNavigationState(false);
}

export function prepareWertguthabenViewForEntry() {
    ensureCurrentWertguthabenListSelection({ preferDefault: true });
    closeEinloeseSystemView();
    renderWertguthabenListSelector();
    renderWertguthabenTable();
    updateStatistics();
}

function resetEinloeseResult() {
    currentEinloeseWertguthabenId = '';
    document.getElementById('wg-einloese-result')?.classList.add('hidden');
    document.getElementById('wg-einloese-empty-state')?.classList.remove('hidden');
    resetEinloeseListSelectionState();
}

function resetEinloeseListSelectionState() {
    einloeseSelectionState.requiresListConfirmation = false;
    einloeseSelectionState.confirmationGranted = false;
    einloeseSelectionState.warningText = '';
    einloeseSelectionState.isForeignListSelection = false;
    einloeseSelectionState.hasAdditionalForeignMatches = false;
    updateEinloeseListWarningUi();
}

function updateEinloeseListWarningUi() {
    const warningBox = document.getElementById('wg-einloese-list-warning');
    const warningText = document.getElementById('wg-einloese-list-warning-text');
    const confirmButton = document.getElementById('wg-einloese-list-warning-confirm');
    const bookingButton = document.getElementById('wg-einloese-open-booking');

    if (warningBox && warningText) {
        const shouldShow = !!einloeseSelectionState.warningText;
        warningBox.classList.toggle('hidden', !shouldShow);
        warningText.textContent = einloeseSelectionState.warningText || 'ACHTUNG - Befindet sich auf einer anderen Liste';
    }

    if (confirmButton) {
        const requiresConfirmation = einloeseSelectionState.requiresListConfirmation === true;
        confirmButton.classList.toggle('hidden', !requiresConfirmation || einloeseSelectionState.confirmationGranted === true);
    }

    if (bookingButton) {
        const disabled = !currentEinloeseWertguthabenId || (einloeseSelectionState.requiresListConfirmation && !einloeseSelectionState.confirmationGranted);
        bookingButton.disabled = disabled;
        bookingButton.classList.toggle('opacity-50', disabled);
        bookingButton.classList.toggle('cursor-not-allowed', disabled);
    }
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

function getEinloeseLocalEntries() {
    return getVisibleWertguthabenEntries().filter((entry) => entry.typ !== 'aktionscode' && !isUnassignedWertguthabenEntry(entry));
}

function getEinloeseForeignEntries() {
    return Object.values(WERTGUTHABEN).filter((entry) => entry.typ !== 'aktionscode' && !isUnassignedWertguthabenEntry(entry) && !doesWertguthabenEntryMatchList(entry, currentWertguthabenListId));
}

function resolveEinloeseIdMatches(rawValue) {
    const normalized = normalizeEinloeseIdInput(rawValue);
    if (!normalized) {
        return { normalized: '', localExact: null, specialExact: null, foreignExact: null, localPartialMatches: [], foreignPartialMatches: [] };
    }

    const localEntries = getEinloeseLocalEntries();
    const specialEntries = Object.values(WERTGUTHABEN).filter((entry) => entry.typ !== 'aktionscode' && isUnassignedWertguthabenEntry(entry));
    const foreignEntries = getEinloeseForeignEntries();
    const findById = (entries, exact = false) => entries.filter((entry) => {
        const displayId = getWertguthabenDisplayId(entry).toUpperCase();
        return exact ? displayId === normalized : displayId.includes(normalized);
    });

    return {
        normalized,
        localExact: findById(localEntries, true)[0] || null,
        specialExact: normalized.length >= WG_SHORT_ID_LENGTH ? (findById(specialEntries, true)[0] || null) : null,
        foreignExact: normalized.length >= WG_SHORT_ID_LENGTH ? (findById(foreignEntries, true)[0] || null) : null,
        localPartialMatches: uniqueEinloeseEntries(findById(localEntries, false)),
        foreignPartialMatches: uniqueEinloeseEntries(findById(foreignEntries, false))
    };
}

function findEinloeseEntryByIdText(rawValue, options = {}) {
    const result = resolveEinloeseIdMatches(rawValue);
    const exactOnly = !!options.exactOnly;
    if (result.localExact) return result.localExact;
    if (result.specialExact) return null;
    if (result.foreignExact) return result.foreignExact;
    if (exactOnly) return null;
    return result.localPartialMatches[0] || null;
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

function doesMaskedAwareTextMatch(storedValue, queryValue) {
    const normalizedStoredText = String(storedValue ?? '').trim();
    const normalizedQueryText = String(queryValue ?? '').trim();
    if (!normalizedStoredText || !normalizedQueryText) return false;

    const lowerStored = normalizedStoredText.toLowerCase();
    const lowerQuery = normalizedQueryText.toLowerCase();
    if (lowerStored.includes(lowerQuery)) return true;

    const compactStored = normalizeEinloeseCodeInput(normalizedStoredText);
    const compactQuery = normalizeEinloeseCodeInput(normalizedQueryText);
    if (!compactStored || !compactQuery) return false;
    if (compactStored.includes(compactQuery)) return true;

    return compactStored.includes('*') && matchesMaskedEinloeseCode(compactQuery, compactStored);
}

function isVerifiableHistoryTransaktionCandidate(transaktion, wgTyp = '') {
    return wgTyp !== 'aktionscode'
        && !!transaktion?.id
        && WG_VERIFIABLE_TRANSACTION_TYPES.has(String(transaktion?.typ || '').trim());
}

function getLatestVerifiableHistoryTransaktionIdFromEntries(entries, wgTyp = '') {
    return [...(Array.isArray(entries) ? entries : [])]
        .filter((entry) => isVerifiableHistoryTransaktionCandidate(entry, wgTyp))
        .sort((a, b) => getTransaktionSortTimestamp(b) - getTransaktionSortTimestamp(a))[0]?.id || '';
}

async function getLatestVerifiableHistoryTransaktionId(wertguthabenId, wgTyp = '') {
    const transaktionen = await loadTransaktionen(wertguthabenId);
    return getLatestVerifiableHistoryTransaktionIdFromEntries(transaktionen, wgTyp);
}

function syncWertguthabenTypFilterWithVerification() {
    const filterTyp = document.getElementById('filter-wg-typ');
    if (!filterTyp) return;

    const allTypesOption = filterTyp.querySelector('option[value=""]');
    const aktionscodeOption = filterTyp.querySelector('option[value="aktionscode"]');
    const verifizierungActive = currentFilter.verifizierung === 'verified' || currentFilter.verifizierung === 'unverified';

    if (allTypesOption) {
        allTypesOption.textContent = verifizierungActive ? 'Alle Typen ohne Aktionscode' : 'Alle Typen';
    }
    if (aktionscodeOption) {
        aktionscodeOption.hidden = verifizierungActive;
        aktionscodeOption.disabled = verifizierungActive;
    }
    if (verifizierungActive && currentFilter.typ === 'aktionscode') {
        currentFilter.typ = '';
    }

    filterTyp.value = currentFilter.typ || '';
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

    const codeEntries = getEinloeseLocalEntries()
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
    const noticeText = String(options.noticeText || '').trim();
    const showCodeLabel = options.showCodeLabel !== false;
    const additionalForeignMatches = options.additionalForeignMatches === true;
    const candidates = uniqueEinloeseEntries(entries);

    const noticeHtml = noticeText
        ? `
            <li>
                <div class="w-full text-left px-4 py-3 bg-orange-50 border-b border-orange-200 last:border-0">
                    <div class="flex items-center justify-between gap-3">
                        <span class="font-mono font-bold text-orange-700">! </span>
                        <span class="text-xs font-semibold uppercase tracking-wide text-orange-700">Andere Liste</span>
                    </div>
                    <div class="text-sm text-orange-900 mt-1 break-all font-bold">${escapeHtml(noticeText)}</div>
                </div>
            </li>
        `
        : '';

    if (candidates.length === 0) {
        list.innerHTML = noticeHtml || `<li class="px-4 py-3 text-sm text-gray-500">${escapeHtml(emptyMessage)}</li>`;
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
                <button type="button" onclick="window.selectEinloeseWertguthaben('${entry.id}', { additionalForeignMatches: ${additionalForeignMatches ? 'true' : 'false'} })" class="w-full text-left px-4 py-3 hover:bg-emerald-50 border-b border-gray-100 last:border-0">
                    <div class="flex items-center justify-between gap-3">
                        <span class="font-mono font-bold text-emerald-700">#${escapeHtml(displayId)}</span>
                        <span class="text-sm font-semibold text-gray-700">${restwert.toFixed(2)} €</span>
                    </div>
                    <div class="text-xs text-gray-500 mt-1 break-all"><span>${namePart}</span> · <span>${companyPart}</span>${codePart}</div>
                </button>
            </li>
        `;
    }).join('');

    list.innerHTML = `${headerHtml}${itemsHtml}${noticeHtml}`;
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
            const idMatches = resolveEinloeseIdMatches(scannedId);
            if (idMatches.specialExact) {
                stopEinloeseScanner({ hidePanel: true, clearStatus: false });
                setEinloeseScannerStatus('Eintrag liegt in „Nicht zugeordnete Elemente“ und kann nicht eingelöst werden.', true);
                alertUser('Einträge aus „Nicht zugeordnete Elemente“ können nicht über das Einlöse-System gebucht werden.', 'warning');
                return;
            }
            const matchedEntry = idMatches.localExact || idMatches.foreignExact;
            if (matchedEntry) {
                window.selectEinloeseWertguthaben(matchedEntry.id);
                setEinloeseScannerStatus(`Treffer: #${getWertguthabenDisplayId(matchedEntry)}`);
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

    const idMatches = resolveEinloeseIdMatches(term);
    const normalized = String(idMatches.normalized || '').toLowerCase();
    if (!normalized) {
        list.innerHTML = '';
        box.classList.add('hidden');
        return;
    }

    const candidates = idMatches.localPartialMatches
        .map((entry) => ({
            entry,
            idText: getWertguthabenDisplayId(entry).toLowerCase()
        }))
        .sort((a, b) => {
            const aStarts = a.idText.startsWith(normalized) ? 0 : 1;
            const bStarts = b.idText.startsWith(normalized) ? 0 : 1;
            return aStarts - bStarts || a.idText.localeCompare(b.idText);
        })
        .slice(0, 12)
        .map(({ entry }) => entry);

    if (candidates.length === 0 && idMatches.foreignPartialMatches.length > 0 && normalized.length < WG_SHORT_ID_LENGTH) {
        const foreignListNames = Array.from(new Set(idMatches.foreignPartialMatches.map((entry) => getWertguthabenListNameById(entry.listId) || 'anderer Liste'))).filter(Boolean);
        renderEinloeseEntrySuggestions([], {
            noticeText: `Treffer befindet sich auf ${foreignListNames.join(', ')}. Bitte die vollständige 4-stellige ID eingeben.`,
            showCodeLabel: false
        });
        return;
    }

    renderEinloeseEntrySuggestions(candidates, {
        emptyMessage: 'Keine passende ID gefunden.',
        showCodeLabel: false,
        noticeText: idMatches.foreignPartialMatches.length > 0 ? 'Weitere Treffer auf anderer Liste' : '',
        additionalForeignMatches: idMatches.foreignPartialMatches.length > 0
    });
}

function refreshEinloeseSelection() {
    if (!currentEinloeseWertguthabenId) return;
    const entry = WERTGUTHABEN[currentEinloeseWertguthabenId];
    if (!entry) {
        resetEinloeseResult();
        return;
    }
    window.selectEinloeseWertguthaben(entry.id, {
        additionalForeignMatches: !doesWertguthabenEntryMatchList(entry, currentWertguthabenListId)
            ? false
            : einloeseSelectionState.hasAdditionalForeignMatches
    });
}

function renderEinloeseEntry(entry) {
    const restwert = entry.restwert !== undefined ? Number(entry.restwert || 0) : Number(entry.wert || 0);
    const status = STATUS_CONFIG[entry.status || 'aktiv'] || STATUS_CONFIG.aktiv;
    const eigentuemer = USERS[entry.eigentuemer]?.name || entry.eigentuemer || 'Unbekannt';
    const restzeit = entry.typ === 'aktionscode' ? calculateRestzeit(entry.gueltigBis) : calculateRestzeit(entry.einloesefrist);
    const listName = getWertguthabenListNameById(entry.listId) || WG_UNASSIGNED_LIST_NAME;

    const detailItems = [
        { label: 'Liste', valueHtml: escapeHtml(listName) },
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
    updateEinloeseListWarningUi();
}

window.selectEinloeseWertguthaben = function(entryId, options = {}) {
    const entry = WERTGUTHABEN[entryId];
    if (!entry) {
        alertUser('Credit Wallet nicht gefunden.', 'error');
        return;
    }

    if (isUnassignedWertguthabenEntry(entry)) {
        alertUser('Einträge aus „Nicht zugeordnete Elemente“ können nicht über das Einlöse-System gebucht werden.', 'warning');
        resetEinloeseResult();
        hideEinloeseSuggestions();
        return;
    }

    const entryListName = getWertguthabenListNameById(entry.listId) || WG_UNASSIGNED_LIST_NAME;
    const isForeignListSelection = !doesWertguthabenEntryMatchList(entry, currentWertguthabenListId);

    currentEinloeseWertguthabenId = entryId;
    const input = document.getElementById('wg-einloese-id-input');
    if (input) input.value = `#${getWertguthabenDisplayId(entry)}`;

    if (isForeignListSelection) {
        einloeseSelectionState.requiresListConfirmation = true;
        einloeseSelectionState.confirmationGranted = false;
        einloeseSelectionState.warningText = `ACHTUNG - Befindet sich auf Liste ${entryListName}`;
        einloeseSelectionState.isForeignListSelection = true;
        einloeseSelectionState.hasAdditionalForeignMatches = false;
    } else {
        einloeseSelectionState.requiresListConfirmation = false;
        einloeseSelectionState.confirmationGranted = true;
        einloeseSelectionState.warningText = options.additionalForeignMatches
            ? 'Hinweis - Weitere mögliche Treffer befinden sich auf anderen Listen.'
            : '';
        einloeseSelectionState.isForeignListSelection = false;
        einloeseSelectionState.hasAdditionalForeignMatches = !!options.additionalForeignMatches;
    }

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
    currentFilter = { typ: '', kategorie: '', eigentuemer: '', verifizierung: 'ignore', status: 'aktiv' };

    const searchInput = document.getElementById('search-wertguthaben');
    const negate = document.getElementById('wg-filter-negate');
    const joinMode = document.getElementById('wg-search-join-mode');
    const filterTyp = document.getElementById('filter-wg-typ');
    const filterKategorie = document.getElementById('filter-wg-kategorie');
    const filterEigentuemer = document.getElementById('filter-wg-eigentuemer');
    const filterVerifizierung = document.getElementById('filter-wg-verifizierung');
    const filterStatus = document.getElementById('filter-wg-status');

    if (searchInput) searchInput.value = '';
    if (negate) negate.checked = false;
    if (joinMode) joinMode.value = 'and';
    if (filterTyp) filterTyp.value = '';
    if (filterKategorie) filterKategorie.value = '';
    if (filterEigentuemer) filterEigentuemer.value = '';
    if (filterVerifizierung) filterVerifizierung.value = 'ignore';
    if (filterStatus) filterStatus.value = 'aktiv';
    syncWertguthabenTypFilterWithVerification();
    hideWertguthabenSearchSuggestions();

    renderWertguthabenSearchTags();
    renderWertguthabenTable();
}

function doesWertguthabenMatchSearchFilter(wertguthabenEintrag, filter) {
    const value = filter.value;
    const normalizedValue = String(value || '').replace(',', '.');
    const fixedId = getWertguthabenDisplayId(wertguthabenEintrag).toLowerCase();
    const fixedIdRaw = String(wertguthabenEintrag.fixedId || '').toLowerCase();
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
    const textValues = [
        fixedId,
        fixedIdRaw,
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
        String(wertguthabenEintrag.quelle || '').toLowerCase()
    ];
    const fulltextValues = [...textValues, ...amountValues].join(' ');
    const matchesTextValues = (...candidates) => candidates.some((candidate) => doesMaskedAwareTextMatch(candidate, value));

    switch (filter.category) {
        case 'id':
            return matchesTextValues(fixedId, fixedIdRaw);
        case 'name':
            return matchesTextValues(name);
        case 'code':
            return matchesTextValues(code);
        case 'pin':
            return matchesTextValues(pin);
        case 'seriennummer':
            return matchesTextValues(seriennummer);
        case 'unternehmen':
            return matchesTextValues(unternehmen);
        case 'kategorie':
            return matchesTextValues(kategorie);
        case 'eigentuemer':
            return matchesTextValues(eigentuemerName, eigentuemerId);
        case 'typ':
            return matchesTextValues(typ, typLabel);
        case 'status':
            return matchesTextValues(statusKey, statusLabel);
        case 'betrag':
            return amountValues.some((entry) => entry.includes(normalizedValue));
        case 'all':
        default:
            return textValues.some((entry) => doesMaskedAwareTextMatch(entry, value))
                || fulltextValues.includes(value)
                || fulltextValues.includes(normalizedValue);
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

    if (unsubscribeWertguthabenSettings) {
        unsubscribeWertguthabenSettings();
        unsubscribeWertguthabenSettings = null;
        wertguthabenSettingsSyncUserId = '';
        console.log("🛑 Credit-Wallet-Settings-Listener gestoppt.");
    }

    if (unsubscribeWertguthaben) {
        unsubscribeWertguthaben();
        unsubscribeWertguthaben = null;
        console.log("🛑 Credit-Wallet-Listener gestoppt.");
    }

    WERTGUTHABEN = {};
    try {
        renderWertguthabenTable();
        updateStatistics();
    } catch (e) {
        console.warn("Credit Wallet: UI konnte nach stopWertguthabenListener nicht aktualisiert werden:", e);
    }
}

export function listenForWertguthaben() {
    if (!currentUser?.mode || currentUser.mode === 'Gast') {
        stopWertguthabenListener();
        WERTGUTHABEN = {};
        currentWertguthabenListId = '';
        renderWertguthabenTable();
        updateStatistics();
        return;
    }

    if (!wertguthabenCollection) {
        console.warn("⚠️ Credit-Wallet-Collection noch nicht initialisiert. Warte...");
        setTimeout(listenForWertguthaben, 500);
        return;
    }

    try {
        if (unsubscribeWertguthaben) {
            unsubscribeWertguthaben();
            unsubscribeWertguthaben = null;
            console.log("🛑 Credit-Wallet-Listener gestoppt.");
        }

        const q = query(
            wertguthabenCollection,
            where('createdBy', '==', currentUser.mode)
        );
        
        unsubscribeWertguthaben = onSnapshot(q, (snapshot) => {
            const entries = [];
            
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                
                if (data.archiviert !== true) {
                    const normalizedCategory = normalizeWertguthabenKategorie(data.kategorie, { preserveUnknown: true });
                    const normalizedFixedId = normalizeFixedId(data.fixedId);

                    entries.push({
                        id: docSnap.id,
                        ...data,
                        ownerUserId: String(data.ownerUserId || data.createdBy || '').trim(),
                        listId: normalizeWertguthabenListId(data.listId),
                        kategorie: normalizedCategory,
                        fixedId: normalizedFixedId || ''
                    });

                    if (shouldNormalizeWertguthabenKategorieInFirestore(data.kategorie)) {
                        normalizeKategorieInFirestore(docSnap.id, normalizedCategory);
                    }

                    if (!normalizedFixedId) {
                        ensureEntryHasFixedId(docSnap.id);
                    }
                }
            });

            entries.sort((a, b) => getWertguthabenSortTimestamp(b, 'createdAt') - getWertguthabenSortTimestamp(a, 'createdAt'));
            WERTGUTHABEN = entries.reduce((accumulator, entry) => {
                accumulator[entry.id] = entry;
                return accumulator;
            }, {});

            ensureCurrentWertguthabenListSelection({ preferDefault: !normalizeWertguthabenListId(currentWertguthabenListId) });
            renderWertguthabenListSelector();
            renderWertguthabenListenSettingsList();
            renderWertguthabenTable();
            updateStatistics();
            checkWertguthabenForNotifications();
            refreshEinloeseSelection();
        }, (error) => {
            console.error("Fehler beim Laden der Credit Wallets:", error);
            alertUser("Fehler beim Laden der Credit Wallets. Bitte Firestore-Regeln prüfen.", 'error');
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

    ensureCurrentWertguthabenListSelection({ preferDefault: !normalizeWertguthabenListId(currentWertguthabenListId) });
    let wertguthaben = getVisibleWertguthabenEntries();

    // Filter anwenden
    if (currentFilter.verifizierung !== 'ignore') {
        wertguthaben = wertguthaben.filter((w) => w.typ !== 'aktionscode');
    }
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

    if (currentFilter.verifizierung === 'verified') {
        wertguthaben = wertguthaben.filter((w) => w.restwertVerifiziert === true);
    } else if (currentFilter.verifizierung === 'unverified') {
        wertguthaben = wertguthaben.filter((w) => !w.restwertVerifiziert);
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
        const hasRealLists = hasRealWertguthabenListen();
        const listName = getWertguthabenListNameById(currentWertguthabenListId);
        let emptyMessage = 'Keine Credit Wallets gefunden.';
        if (!hasRealLists) {
            emptyMessage = 'Bitte zuerst eine Liste anlegen.';
        } else if (isSpecialWertguthabenListId(currentWertguthabenListId)) {
            emptyMessage = 'Keine nicht zugeordneten Elemente gefunden.';
        } else if (listName) {
            emptyMessage = `Keine Credit Wallets in „${listName}“ gefunden.`;
        }
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="px-4 py-8 text-center text-gray-400 italic">
                    ${escapeHtml(emptyMessage)}
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
        const isUnassignedEntry = isUnassignedWertguthabenEntry(w);
        const transactionButtonTitle = isUnassignedEntry
            ? 'Für „Nicht zugeordnete Elemente“ nicht verfügbar'
            : 'Transaktion buchen';
        const eigentuemerCell = renderCompactDashboardCell(eigentuemerName, 'max-w-[6.5rem] text-[13px] font-semibold');
        const categoryCell = renderCompactDashboardCell(normalizeWertguthabenKategorie(w.kategorie), 'max-w-[6.5rem] text-sm');
        const nameCell = renderCompactDashboardCell(w.name || '-', 'max-w-[7.5rem] text-sm font-semibold');
        const unternehmenCell = renderCompactDashboardCell(w.unternehmen || '-', 'max-w-[7.5rem] text-sm text-gray-600');
        
        return `
            <tr class="hover:bg-gray-50 cursor-pointer transition" onclick="window.openWertguthabenDetails('${w.id}')">
                <td class="px-2 py-3 text-center align-top" onclick="event.stopPropagation()">
                    <button ${isUnassignedEntry ? 'disabled' : `onclick="window.openTransaktionModal('${w.id}')"`}
                        class="inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${isUnassignedEntry ? 'cursor-not-allowed text-gray-300 bg-gray-100' : 'text-violet-600 hover:bg-violet-50 hover:text-violet-800'}" title="${escapeHtml(transactionButtonTitle)}" aria-label="${escapeHtml(transactionButtonTitle)}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
                            <path d="M3.5 5A2.5 2.5 0 0 1 6 2.5h8A2.5 2.5 0 0 1 16.5 5v1.028c-.332-.063-.675-.095-1.028-.095H4.528c-.353 0-.696.032-1.028.095V5Z" />
                            <path fill-rule="evenodd" d="M2 8.75A1.75 1.75 0 0 1 3.75 7h11.5A1.75 1.75 0 0 1 17 8.75v5.5A1.75 1.75 0 0 1 15.25 16H3.75A1.75 1.75 0 0 1 2 14.25v-5.5ZM13 11a.75.75 0 0 0 0 1.5h1.5A.75.75 0 0 0 14.5 11H13Z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </td>
                <td class="w-[6.5rem] max-w-[6.5rem] px-2 py-3 align-top">${eigentuemerCell}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${typConfig.color}">
                        ${typConfig.icon} ${typConfig.label}
                    </span>
                </td>
                <td class="px-4 py-3 text-sm font-mono font-bold text-gray-700">#${escapeHtml(getWertguthabenDisplayId(w))}</td>
                <td class="px-4 py-3 align-top">${categoryCell}</td>
                <td class="px-4 py-3 align-top">${nameCell}</td>
                <td class="px-4 py-3 align-top">${unternehmenCell}</td>
                <td class="px-4 py-3 text-sm">
                    <div class="flex flex-col">
                        <span class="font-bold text-emerald-700">${restwert !== undefined ? restwert.toFixed(2) + ' €' : '-'}</span>
                        ${w.wert && w.wert !== restwert ? `<span class="text-xs text-gray-500">von ${w.wert.toFixed(2)} €</span>` : ''}
                        ${verificationBadge}
                    </div>
                </td>
                <td class="px-4 py-3 text-sm">${restzeit}</td>
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-2 py-3 text-center align-top" onclick="event.stopPropagation()">
                    <button onclick="window.openEditWertguthaben('${w.id}')" 
                        class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-50 hover:text-blue-800" title="Bearbeiten" aria-label="Bearbeiten">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
                            <path d="M5.433 13.917A4.5 4.5 0 0 1 6.5 11.028l6.586-6.586a2 2 0 1 1 2.828 2.828l-6.586 6.586a4.5 4.5 0 0 1-2.89 1.067H4.5a.5.5 0 0 1-.5-.5v-1.938Z" />
                            <path d="M3.5 5a1.5 1.5 0 0 1 1.5-1.5h4a.75.75 0 0 0 0-1.5H5A3 3 0 0 0 2 5v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4a.75.75 0 0 0-1.5 0v4a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 15V5Z" />
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ========================================
// STATISTIKEN AKTUALISIEREN
// ========================================
function updateStatistics() {
    const visibleEntries = getVisibleWertguthabenEntries();
    const gutscheine = visibleEntries.filter(w => w.typ === 'gutschein').length;
    const guthaben = visibleEntries.filter(w => w.typ === 'guthaben').length;
    const wertguthaben = visibleEntries.filter(w => String(w.typ || '').startsWith('wertguthaben')).length;
    const totalWert = visibleEntries.reduce((sum, w) => sum + (Number(w.wert) || 0), 0);

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

function getTodayDateInputValue() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDateInputValue(value, endOfDay = false) {
    const normalized = String(value || '').trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, year, month, day] = match;
    const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
    );
    return Number.isNaN(date.getTime()) ? null : date;
}

function getTransaktionSortTimestamp(transaktion) {
    const date = toDateValue(transaktion?.datum || transaktion?.createdAt || transaktion?.updatedAt);
    return date ? date.getTime() : 0;
}

function getWertguthabenSortTimestamp(entry, primaryField = 'createdAt') {
    const date = toDateValue(entry?.[primaryField] || entry?.updatedAt || entry?.createdAt);
    return date ? date.getTime() : 0;
}

function getWertguthabenTransaktionTypeMeta(transaktion) {
    if (transaktion?.typ === 'verwendung') return { icon: '📉', label: 'Verwendung' };
    if (transaktion?.typ === 'gutschrift') return { icon: '📈', label: 'Gutschrift' };
    if (transaktion?.typ === 'korrektur') return { icon: '🛠️', label: 'Korrektur' };
    if (transaktion?.typ === 'einloesung') return { icon: '🎟️', label: 'Einlösung' };
    if (isStartguthabenTransaktion(transaktion)) return { icon: '🔒', label: 'Systemeintrag' };
    return { icon: '📄', label: 'Transaktion' };
}

function getTransaktionEinloesungAnzahl(transaktion) {
    if (transaktion?.typ !== 'einloesung') return 0;

    const storedAnzahl = Number.parseInt(String(transaktion?.anzahl ?? ''), 10);
    if (Number.isFinite(storedAnzahl) && storedAnzahl > 0) {
        return storedAnzahl;
    }

    const legacyAnzahl = Number.parseInt(String(transaktion?.betrag ?? ''), 10);
    if (Number.isFinite(legacyAnzahl) && legacyAnzahl > 0) {
        return legacyAnzahl;
    }

    return 1;
}

function formatWertguthabenTransaktionSummary(transaktion) {
    const betrag = Number(transaktion?.betrag || 0);
    const isKorrektur = transaktion?.typ === 'korrektur';
    const isStartguthaben = isStartguthabenTransaktion(transaktion);
    const typeMeta = getWertguthabenTransaktionTypeMeta(transaktion);
    const typLabel = typeMeta.label;
    const icon = typeMeta.icon;
    const amountText = transaktion?.typ === 'verwendung'
        ? `- ${Math.abs(betrag).toFixed(2)} €`
        : (transaktion?.typ === 'gutschrift'
            ? `+ ${Math.abs(betrag).toFixed(2)} €`
            : (transaktion?.typ === 'einloesung'
                ? `${getTransaktionEinloesungAnzahl(transaktion)}x Einlösung`
                : (isKorrektur
                    ? `${betrag >= 0 ? '+' : '-'} ${Math.abs(betrag).toFixed(2)} €`
                    : `${Math.abs(betrag).toFixed(2)} €`)));
    const metaParts = [];
    if (transaktion?.beschreibung) metaParts.push(transaktion.beschreibung);
    if (transaktion?.bestellnr) metaParts.push(`Best.-Nr. ${transaktion.bestellnr}`);
    if (transaktion?.rechnungsnr) metaParts.push(`Rech.-Nr. ${transaktion.rechnungsnr}`);
    if (isStartguthaben) metaParts.push('Systemeintrag');

    return {
        title: `${icon} ${typLabel} · ${amountText}`,
        details: metaParts.join(' · ')
    };
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

function normalizeWertguthabenListId(value) {
    return String(value || '').trim();
}

function normalizeWertguthabenListName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function isSpecialWertguthabenListId(listId) {
    return normalizeWertguthabenListId(listId) === WG_SPECIAL_LIST_ID;
}

function createWertguthabenListId() {
    return `wglist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sortWertguthabenListen(rawLists, defaultListId = '') {
    const normalizedDefaultId = normalizeWertguthabenListId(defaultListId);
    return [...(Array.isArray(rawLists) ? rawLists : [])].sort((a, b) => {
        const aIsDefault = normalizeWertguthabenListId(a?.id) === normalizedDefaultId;
        const bIsDefault = normalizeWertguthabenListId(b?.id) === normalizedDefaultId;
        if (aIsDefault !== bIsDefault) return aIsDefault ? -1 : 1;
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'de');
    });
}

function sanitizeWertguthabenListen(rawLists, rawDefaultListId = '') {
    const byId = new Map();
    const usedNames = new Set();

    (Array.isArray(rawLists) ? rawLists : []).forEach((item) => {
        const name = normalizeWertguthabenListName(item?.name);
        if (!name) return;
        if (name.toLowerCase() === WG_UNASSIGNED_LIST_NAME.toLowerCase()) return;

        const nameKey = name.toLowerCase();
        if (usedNames.has(nameKey)) return;

        let id = normalizeWertguthabenListId(item?.id);
        if (!id || id === WG_SPECIAL_LIST_ID || byId.has(id)) {
            id = createWertguthabenListId();
        }

        usedNames.add(nameKey);
        byId.set(id, { id, name });
    });

    const provisional = sortWertguthabenListen(Array.from(byId.values()), rawDefaultListId);
    const normalizedDefaultId = normalizeWertguthabenListId(rawDefaultListId);
    const defaultListId = provisional.some((list) => list.id === normalizedDefaultId)
        ? normalizedDefaultId
        : (provisional[0]?.id || '');

    return {
        listen: sortWertguthabenListen(provisional, defaultListId),
        defaultListId
    };
}

function getRealWertguthabenListen() {
    return sortWertguthabenListen(wertguthabenSettings.listen, wertguthabenSettings.defaultListId);
}

function hasRealWertguthabenListen() {
    return getRealWertguthabenListen().length > 0;
}

function getDefaultWertguthabenListId() {
    const realLists = getRealWertguthabenListen();
    const configuredId = normalizeWertguthabenListId(wertguthabenSettings.defaultListId);
    if (realLists.some((list) => list.id === configuredId)) {
        return configuredId;
    }
    return realLists[0]?.id || '';
}

function isRealWertguthabenListId(listId) {
    const normalized = normalizeWertguthabenListId(listId);
    return !!normalized && getRealWertguthabenListen().some((list) => list.id === normalized);
}

function getEntryAssignedWertguthabenListId(entry) {
    const normalized = normalizeWertguthabenListId(entry?.listId);
    if (!normalized) return '';
    return isRealWertguthabenListId(normalized) ? normalized : '';
}

function isUnassignedWertguthabenEntry(entry) {
    return !getEntryAssignedWertguthabenListId(entry);
}

function hasUnassignedWertguthabenEntries(entries = Object.values(WERTGUTHABEN)) {
    return (Array.isArray(entries) ? entries : []).some((entry) => isUnassignedWertguthabenEntry(entry));
}

function getWertguthabenListNameById(listId) {
    const normalized = normalizeWertguthabenListId(listId);
    if (isSpecialWertguthabenListId(normalized)) {
        return WG_UNASSIGNED_LIST_NAME;
    }
    return getRealWertguthabenListen().find((list) => list.id === normalized)?.name || '';
}

function doesWertguthabenEntryMatchList(entry, listId = currentWertguthabenListId) {
    const normalizedListId = normalizeWertguthabenListId(listId);
    if (!normalizedListId) return false;

    const entryListId = getEntryAssignedWertguthabenListId(entry);
    if (isSpecialWertguthabenListId(normalizedListId)) {
        return !entryListId;
    }

    return entryListId === normalizedListId;
}

function getVisibleWertguthabenEntries(entries = Object.values(WERTGUTHABEN), listId = currentWertguthabenListId) {
    const normalizedListId = normalizeWertguthabenListId(listId);
    if (!normalizedListId) return [];
    return (Array.isArray(entries) ? entries : []).filter((entry) => doesWertguthabenEntryMatchList(entry, normalizedListId));
}

function getPreferredCreateListId() {
    if (isRealWertguthabenListId(currentWertguthabenListId)) {
        return currentWertguthabenListId;
    }
    return getDefaultWertguthabenListId();
}

function ensureCurrentWertguthabenListSelection(options = {}) {
    const preferDefault = options.preferDefault === true;
    const realLists = getRealWertguthabenListen();
    const hasUnassigned = hasUnassignedWertguthabenEntries();
    const currentIsValid = isSpecialWertguthabenListId(currentWertguthabenListId)
        ? hasUnassigned
        : realLists.some((list) => list.id === currentWertguthabenListId);

    if (currentIsValid && !preferDefault) {
        return currentWertguthabenListId;
    }

    if (realLists.length > 0) {
        currentWertguthabenListId = getDefaultWertguthabenListId() || realLists[0].id;
        return currentWertguthabenListId;
    }

    currentWertguthabenListId = hasUnassigned ? WG_SPECIAL_LIST_ID : '';
    return currentWertguthabenListId;
}

function updateWertguthabenCreateButtonState() {
    const createBtn = document.getElementById('btn-create-wertguthaben');
    if (!createBtn) return;

    const hasRealLists = hasRealWertguthabenListen();
    createBtn.disabled = !hasRealLists;
    createBtn.classList.toggle('opacity-50', !hasRealLists);
    createBtn.classList.toggle('cursor-not-allowed', !hasRealLists);
    createBtn.title = hasRealLists
        ? 'Neues Credit Wallet anlegen'
        : 'Bitte zuerst eine Liste anlegen';
    createBtn.setAttribute('aria-disabled', hasRealLists ? 'false' : 'true');
}

function renderWertguthabenListSelector() {
    const select = document.getElementById('wg-list-selector');
    if (!select) return;

    const realLists = getRealWertguthabenListen();
    const hasUnassigned = hasUnassignedWertguthabenEntries();
    ensureCurrentWertguthabenListSelection();

    if (realLists.length === 0 && !hasUnassigned) {
        select.innerHTML = '<option value="">Bitte zuerst Liste anlegen...</option>';
        select.value = '';
        select.disabled = true;
        updateWertguthabenCreateButtonState();
        return;
    }

    const options = realLists.map((list) => {
        const prefix = list.id === getDefaultWertguthabenListId() ? '★ ' : '';
        return `<option value="${escapeHtml(list.id)}">${escapeHtml(prefix + list.name)}</option>`;
    });

    if (hasUnassigned) {
        options.push(`<option value="${escapeHtml(WG_SPECIAL_LIST_ID)}">${escapeHtml(WG_UNASSIGNED_LIST_NAME)}</option>`);
    }

    select.innerHTML = options.join('');
    select.disabled = false;
    select.value = currentWertguthabenListId || realLists[0]?.id || (hasUnassigned ? WG_SPECIAL_LIST_ID : '');
    updateWertguthabenCreateButtonState();
}

function setCurrentWertguthabenList(listId, options = {}) {
    const normalized = normalizeWertguthabenListId(listId);
    const fallback = ensureCurrentWertguthabenListSelection();
    const nextListId = isSpecialWertguthabenListId(normalized)
        ? (hasUnassignedWertguthabenEntries() ? WG_SPECIAL_LIST_ID : fallback)
        : (isRealWertguthabenListId(normalized) ? normalized : fallback);

    currentWertguthabenListId = nextListId || '';
    renderWertguthabenListSelector();
    renderWertguthabenTable();
    updateStatistics();
    refreshEinloeseSelection();

    if (options.skipArchiveRefresh !== true && document.getElementById('wertguthabenArchivModal')?.style.display === 'flex') {
        renderWertguthabenArchivOverview();
    }

    if (options.skipTransactionsRefresh !== true && document.getElementById('wertguthabenTransaktionenModal')?.style.display === 'flex') {
        renderWertguthabenTransaktionenOverview();
    }
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

function sanitizeWertguthabenArchivGruende(rawReasons) {
    const unique = new Map();
    (Array.isArray(rawReasons) ? rawReasons : []).forEach((item) => {
        const value = String(item || '').trim();
        if (!value) return;
        const key = value.toLowerCase();
        if (!unique.has(key)) unique.set(key, value);
    });
    return Array.from(unique.values()).sort((a, b) => a.localeCompare(b, 'de'));
}

function getEditableWertguthabenKategorien() {
    return sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien);
}

function getObservedWertguthabenKategorien() {
    return sanitizeWertguthabenKategorien(
        Object.values(WERTGUTHABEN).map((entry) => {
            const value = String(entry?.kategorie || '').trim();
            if (!value) return '';
            if (value.toLowerCase() === WG_UNASSIGNED_KATEGORIE.toLowerCase()) return '';
            return value;
        })
    );
}

function getDefaultFormKategorie() {
    const editable = getEditableWertguthabenKategorien();
    return editable[0] || WG_UNASSIGNED_KATEGORIE;
}

function getAllWertguthabenKategorien() {
    return [WG_UNASSIGNED_KATEGORIE, ...sanitizeWertguthabenKategorien([
        ...getEditableWertguthabenKategorien(),
        ...getObservedWertguthabenKategorien()
    ])];
}

function normalizeWertguthabenKategorie(rawCategory, options = {}) {
    const { preserveUnknown = false } = options;
    const category = String(rawCategory || '').trim();
    if (!category) return WG_UNASSIGNED_KATEGORIE;
    if (category.toLowerCase() === WG_UNASSIGNED_KATEGORIE.toLowerCase()) return WG_UNASSIGNED_KATEGORIE;
    const all = getAllWertguthabenKategorien();
    if (all.includes(category)) return category;
    return preserveUnknown ? category : WG_UNASSIGNED_KATEGORIE;
}

function shouldNormalizeWertguthabenKategorieInFirestore(rawCategory) {
    const category = String(rawCategory || '').trim();
    if (!category) return true;
    return category.toLowerCase() === WG_UNASSIGNED_KATEGORIE.toLowerCase() && category !== WG_UNASSIGNED_KATEGORIE;
}

function normalizeWertguthabenDefaultWarnings(rawWarnings) {
    return {
        gutschein: 14,
        guthaben: 30,
        wertguthaben: 90,
        wertguthaben_gesetzlich: 180,
        aktionscode: 7,
        ...(rawWarnings && typeof rawWarnings === 'object' ? rawWarnings : {})
    };
}

function buildNormalizedWertguthabenSettingsPayload(rawSettings) {
    const parsed = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const normalizedListenPayload = sanitizeWertguthabenListen(parsed.listen, parsed.defaultListId);
    return {
        ...parsed,
        kategorien: sanitizeWertguthabenKategorien(parsed.kategorien),
        archivGruende: sanitizeWertguthabenArchivGruende(parsed.archivGruende),
        listen: normalizedListenPayload.listen,
        defaultListId: normalizedListenPayload.defaultListId,
        defaultWarnings: normalizeWertguthabenDefaultWarnings(parsed.defaultWarnings)
    };
}

function applyWertguthabenSettings(rawSettings) {
    const parsed = buildNormalizedWertguthabenSettingsPayload(rawSettings);
    wertguthabenSettings = {
        kategorien: parsed.kategorien,
        archivGruende: parsed.archivGruende,
        listen: parsed.listen,
        defaultListId: parsed.defaultListId,
        defaultWarnings: parsed.defaultWarnings
    };

    ensureCurrentWertguthabenListSelection({ preferDefault: !normalizeWertguthabenListId(currentWertguthabenListId) });
    renderWertguthabenListSelector();
    renderWertguthabenListenSettingsList();
    populateKategorieDropdowns();
    populateWertguthabenListFormDropdown(document.getElementById('wgListe')?.value || getPreferredCreateListId(), {
        includeSpecialOption: document.getElementById('editWertguthabenId')?.value ? isSpecialWertguthabenListId(document.getElementById('wgListe')?.value || '') : false,
        allowEmptySelection: true
    });
    renderWertguthabenKategorieSettingsList();
    renderWertguthabenArchiveReasonOptions();
}

function startWertguthabenSettingsSync() {
    if (!currentUser?.mode || currentUser.mode === 'Gast' || !usersCollectionRef) {
        if (unsubscribeWertguthabenSettings) {
            unsubscribeWertguthabenSettings();
            unsubscribeWertguthabenSettings = null;
            wertguthabenSettingsSyncUserId = '';
        }
        return;
    }

    if (unsubscribeWertguthabenSettings && wertguthabenSettingsSyncUserId === currentUser.mode) {
        return;
    }

    if (unsubscribeWertguthabenSettings) {
        unsubscribeWertguthabenSettings();
        unsubscribeWertguthabenSettings = null;
    }

    wertguthabenSettingsSyncUserId = currentUser.mode;
    const userDocRef = doc(usersCollectionRef, currentUser.mode);
    unsubscribeWertguthabenSettings = onSnapshot(userDocRef, (docSnap) => {
        const rawSettings = docSnap.exists()
            ? docSnap.data()?.userSettings?.wertguthabenSettings
            : null;
        applyWertguthabenSettings(rawSettings);
    }, (error) => {
        console.warn('Credit-Wallet-Settings-Sync fehlgeschlagen:', error);
    });
}

function setWertguthabenFormKategorieValue(rawCategory) {
    const formSelect = document.getElementById('wgKategorie');
    if (!formSelect) return;

    formSelect.dataset.selectedKategorie = normalizeWertguthabenKategorie(rawCategory, { preserveUnknown: true });
    populateKategorieDropdowns();
}

function populateKategorieDropdowns() {
    const allCategories = getAllWertguthabenKategorien();
    const editableCategories = getEditableWertguthabenKategorien();

    const formSelect = document.getElementById('wgKategorie');
    if (formSelect) {
        const previous = normalizeWertguthabenKategorie(
            formSelect.dataset.selectedKategorie || formSelect.value,
            { preserveUnknown: true }
        );
        const formCategories = [...editableCategories];
        if (previous !== WG_UNASSIGNED_KATEGORIE && !formCategories.includes(previous)) {
            formCategories.unshift(previous);
        }

        if (formCategories.length > 0) {
            formSelect.innerHTML = `
                <option value="${escapeHtml(WG_UNASSIGNED_KATEGORIE)}" disabled>${escapeHtml(WG_UNASSIGNED_KATEGORIE)} (automatisch)</option>
                ${formCategories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
            `;
            if (previous === WG_UNASSIGNED_KATEGORIE) {
                formSelect.value = WG_UNASSIGNED_KATEGORIE;
            } else {
                formSelect.value = formCategories.includes(previous) ? previous : formCategories[0];
            }
        } else {
            formSelect.innerHTML = `<option value="${escapeHtml(WG_UNASSIGNED_KATEGORIE)}">${escapeHtml(WG_UNASSIGNED_KATEGORIE)} (automatisch)</option>`;
            formSelect.value = WG_UNASSIGNED_KATEGORIE;
        }
        formSelect.dataset.selectedKategorie = String(formSelect.value || '').trim();
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

function updateWertguthabenListFieldHint(message = '', tone = 'default') {
    const hint = document.getElementById('wgListeHint');
    if (!hint) return;

    const text = String(message || '').trim();
    hint.textContent = text;
    hint.classList.toggle('hidden', !text);
    hint.classList.toggle('text-red-600', tone === 'error');
    hint.classList.toggle('text-amber-700', tone === 'warning');
    hint.classList.toggle('text-gray-500', tone === 'default');
}

function populateWertguthabenListFormDropdown(selectedId = '', options = {}) {
    const select = document.getElementById('wgListe');
    if (!select) return;

    const realLists = getRealWertguthabenListen();
    const normalizedSelected = normalizeWertguthabenListId(selectedId);
    const includeSpecialOption = options.includeSpecialOption === true && hasUnassignedWertguthabenEntries();
    const allowEmptySelection = options.allowEmptySelection !== false;

    const optionParts = [];
    if (allowEmptySelection) {
        optionParts.push('<option value="">Liste auswählen...</option>');
    }

    realLists.forEach((list) => {
        const prefix = list.id === getDefaultWertguthabenListId() ? '★ ' : '';
        optionParts.push(`<option value="${escapeHtml(list.id)}">${escapeHtml(prefix + list.name)}</option>`);
    });

    if (includeSpecialOption) {
        optionParts.push(`<option value="${escapeHtml(WG_SPECIAL_LIST_ID)}">${escapeHtml(WG_UNASSIGNED_LIST_NAME)}</option>`);
    }

    if (optionParts.length === 0) {
        optionParts.push('<option value="">Bitte zuerst Liste anlegen...</option>');
    }

    select.innerHTML = optionParts.join('');

    let nextValue = '';
    if (normalizedSelected && Array.from(select.options).some((option) => option.value === normalizedSelected)) {
        nextValue = normalizedSelected;
    } else if (!allowEmptySelection && realLists.length > 0) {
        nextValue = realLists[0].id;
    }

    select.value = nextValue;
    select.disabled = optionParts.length === 1 && optionParts[0].includes('Bitte zuerst Liste anlegen');

    if (!hasRealWertguthabenListen()) {
        updateWertguthabenListFieldHint('Bitte zuerst mindestens eine Liste anlegen.', 'error');
    } else if (isSpecialWertguthabenListId(select.value)) {
        updateWertguthabenListFieldHint('Nicht zugeordnete Elemente können nur einer echten Liste zugewiesen werden.', 'warning');
    } else if (!select.value && allowEmptySelection) {
        updateWertguthabenListFieldHint('Neuanlage in „Nicht zugeordnete Elemente“ ist nicht möglich.', 'warning');
    } else {
        updateWertguthabenListFieldHint('');
    }
}

function setWertguthabenFormListAssignmentMode(enabled) {
    wertguthabenFormState.isListAssignmentOnly = !!enabled;

    const notice = document.getElementById('wgListAssignmentNotice');
    if (notice) {
        notice.classList.toggle('hidden', !enabled);
    }

    const modal = document.getElementById('wertguthabenModal');
    if (!modal) return;

    const keepEnabledIds = new Set(['wgListe', 'saveWertguthabenBtn', 'cancelWertguthabenBtn', 'closeWertguthabenModal']);
    modal.querySelectorAll('input, select, textarea, button').forEach((element) => {
        const elementId = String(element.id || '').trim();
        if (keepEnabledIds.has(elementId) || elementId === 'editWertguthabenId') return;
        element.disabled = !!enabled;
        if (element.matches('input, select, textarea')) {
            element.classList.toggle('bg-gray-100', !!enabled);
            element.classList.toggle('cursor-not-allowed', !!enabled);
        }
        if (element.matches('button')) {
            element.classList.toggle('opacity-60', !!enabled);
            element.classList.toggle('cursor-not-allowed', !!enabled);
        }
    });

    if (!enabled) {
        handleEigentuemerChange();
        handleTypChange();
        updateSensitiveMaskHints();
    }
}

function renderWertguthabenListenSettingsList() {
    const container = document.getElementById('wg-settings-listen-list');
    if (!container) return;

    const realLists = getRealWertguthabenListen();
    const defaultListId = getDefaultWertguthabenListId();
    const hasUnassigned = hasUnassignedWertguthabenEntries();

    if (realLists.length === 0 && !hasUnassigned) {
        container.innerHTML = '<p class="text-sm text-gray-500 italic">Keine Listen vorhanden.</p>';
        return;
    }

    const rows = realLists.map((list) => `
        <div class="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-200 bg-white">
            <div class="min-w-0">
                <div class="text-sm font-semibold text-gray-800 truncate">${escapeHtml(list.name)}</div>
                <div class="text-[11px] font-semibold ${list.id === defaultListId ? 'text-blue-700' : 'text-gray-500'}">${list.id === defaultListId ? 'Standardliste' : 'Private Liste'}</div>
            </div>
            <div class="flex flex-wrap justify-end gap-1">
                <button onclick="window.setDefaultWertguthabenListe('${escapeHtml(list.id)}')" class="px-2 py-1 text-xs ${list.id === defaultListId ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200'} rounded transition">Standard</button>
                <button onclick="window.renameWertguthabenListe('${escapeHtml(list.id)}')" class="px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200 transition">Bearbeiten</button>
                <button onclick="window.deleteWertguthabenListe('${escapeHtml(list.id)}')" class="px-2 py-1 text-xs bg-red-100 text-red-800 rounded hover:bg-red-200 transition">Löschen</button>
            </div>
        </div>
    `);

    if (hasUnassigned) {
        rows.push(`
            <div class="flex items-center justify-between gap-2 p-2 rounded-lg border border-orange-200 bg-orange-50">
                <div class="min-w-0">
                    <div class="text-sm font-semibold text-orange-900 truncate">${escapeHtml(WG_UNASSIGNED_LIST_NAME)}</div>
                    <div class="text-[11px] font-semibold text-orange-700">Automatische Spezialliste</div>
                </div>
                <div class="text-[11px] font-semibold text-orange-700">Nicht bearbeitbar</div>
            </div>
        `);
    }

    container.innerHTML = rows.join('');
}

function resetWertguthabenListDeleteModal() {
    const modal = document.getElementById('wertguthabenListenDeleteModal');
    const checkbox = document.getElementById('wg-list-delete-checkbox');
    const input = document.getElementById('wg-list-delete-confirm-text');
    const button = document.getElementById('wg-list-delete-confirm-btn');

    if (wgListDeleteTimer) {
        window.clearInterval(wgListDeleteTimer);
        wgListDeleteTimer = null;
    }

    wgListDeleteSecondsLeft = WG_LIST_DELETE_COUNTDOWN_SECONDS;
    wgListDeleteTargetId = '';
    if (modal) modal.dataset.listId = '';
    if (checkbox) checkbox.checked = false;
    if (input) input.value = '';
    if (button) {
        button.disabled = true;
        button.className = 'w-full py-3 bg-gray-300 text-gray-500 font-bold rounded-lg cursor-not-allowed transition';
        button.innerHTML = `<span id="wg-list-delete-countdown-text">Warte ${WG_LIST_DELETE_COUNTDOWN_SECONDS} Sekunden...</span>`;
    }
}

function updateWertguthabenListDeleteConfirmState() {
    const checkbox = document.getElementById('wg-list-delete-checkbox');
    const input = document.getElementById('wg-list-delete-confirm-text');
    const button = document.getElementById('wg-list-delete-confirm-btn');
    if (!checkbox || !input || !button) return;

    const isCountdownFinished = wgListDeleteSecondsLeft <= 0;
    const hasCheckbox = checkbox.checked === true;
    const hasText = String(input.value || '').trim() === WG_LIST_DELETE_CONFIRM_TEXT;

    if (isCountdownFinished && hasCheckbox && hasText) {
        button.disabled = false;
        button.className = 'w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition';
        button.innerHTML = '🗑️ JETZT UNWIDERRUFLICH LÖSCHEN';
        return;
    }

    button.disabled = true;
    button.className = 'w-full py-3 bg-gray-300 text-gray-500 font-bold rounded-lg cursor-not-allowed transition';
    if (!isCountdownFinished) {
        button.innerHTML = `<span id="wg-list-delete-countdown-text">Warte ${wgListDeleteSecondsLeft} Sekunden...</span>`;
    } else if (!hasCheckbox) {
        button.innerHTML = 'Bitte Löschbestätigung aktivieren';
    } else {
        button.innerHTML = 'Bitte Text korrekt eingeben';
    }
}

function closeWertguthabenListDeleteModal() {
    const modal = document.getElementById('wertguthabenListenDeleteModal');
    if (modal) modal.style.display = 'none';
    resetWertguthabenListDeleteModal();
}

function openWertguthabenListDeleteModal(listId) {
    const listName = getWertguthabenListNameById(listId);
    const modal = document.getElementById('wertguthabenListenDeleteModal');
    const warningName = document.getElementById('wg-list-delete-warning-name');
    const countdownText = document.getElementById('wg-list-delete-countdown-text');
    if (!modal || !listName || isSpecialWertguthabenListId(listId)) return;

    resetWertguthabenListDeleteModal();
    wgListDeleteTargetId = normalizeWertguthabenListId(listId);
    modal.dataset.listId = wgListDeleteTargetId;
    if (warningName) {
        warningName.innerHTML = `Die Liste <strong>${escapeHtml(listName)}</strong> wird dauerhaft gelöscht.`;
    }
    if (countdownText) {
        countdownText.textContent = `Warte ${WG_LIST_DELETE_COUNTDOWN_SECONDS} Sekunden...`;
    }

    wgListDeleteTimer = window.setInterval(() => {
        wgListDeleteSecondsLeft -= 1;
        updateWertguthabenListDeleteConfirmState();
        if (wgListDeleteSecondsLeft <= 0 && wgListDeleteTimer) {
            window.clearInterval(wgListDeleteTimer);
            wgListDeleteTimer = null;
        }
    }, 1000);

    modal.style.display = 'flex';
}

async function addWertguthabenListeFromSettings() {
    const input = document.getElementById('new-wg-liste-input');
    const rawName = normalizeWertguthabenListName(input?.value || '');
    if (!rawName) {
        alertUser('Bitte einen Listennamen eingeben.', 'warning');
        return;
    }
    if (rawName.toLowerCase() === WG_UNASSIGNED_LIST_NAME.toLowerCase()) {
        alertUser(`"${WG_UNASSIGNED_LIST_NAME}" ist reserviert.`, 'warning');
        return;
    }
    if (getRealWertguthabenListen().some((list) => list.name.toLowerCase() === rawName.toLowerCase())) {
        alertUser('Listenname existiert bereits.', 'warning');
        return;
    }

    const nextListen = [...getRealWertguthabenListen(), { id: createWertguthabenListId(), name: rawName }];
    const normalized = sanitizeWertguthabenListen(nextListen, getDefaultWertguthabenListId() || nextListen[0]?.id || '');
    wertguthabenSettings.listen = normalized.listen;
    wertguthabenSettings.defaultListId = normalized.defaultListId;

    if (!await persistWertguthabenSettings()) {
        return;
    }

    if (input) input.value = '';
    ensureCurrentWertguthabenListSelection({ preferDefault: !normalizeWertguthabenListId(currentWertguthabenListId) });
    renderWertguthabenListenSettingsList();
    renderWertguthabenListSelector();
    populateWertguthabenListFormDropdown(getPreferredCreateListId(), { allowEmptySelection: true });
    updateWertguthabenCreateButtonState();
    alertUser('Liste angelegt.', 'success');
}

window.renameWertguthabenListe = async function(listId) {
    const targetId = normalizeWertguthabenListId(listId);
    const currentList = getRealWertguthabenListen().find((list) => list.id === targetId);
    if (!currentList) return;

    const nextName = prompt('Liste umbenennen:', currentList.name);
    const normalizedName = normalizeWertguthabenListName(nextName);
    if (!normalizedName || normalizedName === currentList.name) return;
    if (normalizedName.toLowerCase() === WG_UNASSIGNED_LIST_NAME.toLowerCase()) {
        alertUser(`"${WG_UNASSIGNED_LIST_NAME}" ist reserviert.`, 'warning');
        return;
    }
    if (getRealWertguthabenListen().some((list) => list.id !== targetId && list.name.toLowerCase() === normalizedName.toLowerCase())) {
        alertUser('Listenname existiert bereits.', 'warning');
        return;
    }

    wertguthabenSettings.listen = getRealWertguthabenListen().map((list) => (
        list.id === targetId ? { ...list, name: normalizedName } : list
    ));
    wertguthabenSettings.listen = sanitizeWertguthabenListen(wertguthabenSettings.listen, getDefaultWertguthabenListId()).listen;

    if (!await persistWertguthabenSettings()) {
        return;
    }

    renderWertguthabenListenSettingsList();
    renderWertguthabenListSelector();
    populateWertguthabenListFormDropdown(document.getElementById('wgListe')?.value || getPreferredCreateListId(), { allowEmptySelection: true, includeSpecialOption: isSpecialWertguthabenListId(document.getElementById('wgListe')?.value || '') });
    alertUser('Liste umbenannt.', 'success');
};

window.setDefaultWertguthabenListe = async function(listId) {
    const targetId = normalizeWertguthabenListId(listId);
    if (!isRealWertguthabenListId(targetId)) return;

    wertguthabenSettings.defaultListId = targetId;
    wertguthabenSettings.listen = sortWertguthabenListen(getRealWertguthabenListen(), targetId);
    if (!await persistWertguthabenSettings()) {
        return;
    }

    renderWertguthabenListenSettingsList();
    renderWertguthabenListSelector();
    alertUser('Standardliste gespeichert.', 'success');
};

window.deleteWertguthabenListe = function(listId) {
    const targetId = normalizeWertguthabenListId(listId);
    if (!isRealWertguthabenListId(targetId)) return;
    openWertguthabenListDeleteModal(targetId);
};

async function confirmWertguthabenListDeletion() {
    const targetId = normalizeWertguthabenListId(wgListDeleteTargetId || document.getElementById('wertguthabenListenDeleteModal')?.dataset.listId || '');
    if (!isRealWertguthabenListId(targetId)) {
        closeWertguthabenListDeleteModal();
        return;
    }

    try {
        const snapshot = await getDocs(query(wertguthabenCollection, where('createdBy', '==', currentUser.mode)));
        const deleteTasks = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            if (normalizeWertguthabenListId(data.listId) !== targetId) return;
            deleteTasks.push((async () => {
                await deleteAllWertguthabenTransaktionen(docSnap.id);
                await deleteDoc(docSnap.ref);
            })());
        });
        await Promise.all(deleteTasks);

        const remainingListen = getRealWertguthabenListen().filter((list) => list.id !== targetId);
        const nextDefaultId = remainingListen.some((list) => list.id === getDefaultWertguthabenListId())
            ? getDefaultWertguthabenListId()
            : (remainingListen[0]?.id || '');
        const normalized = sanitizeWertguthabenListen(remainingListen, nextDefaultId);
        wertguthabenSettings.listen = normalized.listen;
        wertguthabenSettings.defaultListId = normalized.defaultListId;

        if (!await persistWertguthabenSettings()) {
            return;
        }

        if (wertguthabenDetailsState.entry && normalizeWertguthabenListId(wertguthabenDetailsState.entry.listId) === targetId) {
            document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        }

        closeWertguthabenListDeleteModal();
        ensureCurrentWertguthabenListSelection({ preferDefault: !normalizeWertguthabenListId(currentWertguthabenListId) || currentWertguthabenListId === targetId });
        renderWertguthabenListenSettingsList();
        renderWertguthabenListSelector();
        renderWertguthabenTable();
        updateStatistics();
        refreshEinloeseSelection();
        alertUser('Liste und zugehörige Einträge wurden unwiderruflich gelöscht.', 'success');
    } catch (error) {
        console.error('Fehler beim Löschen der Liste:', error);
        alertUser('Liste konnte nicht gelöscht werden: ' + error.message, 'error');
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

async function persistWertguthabenSettings() {
    try {
        const payload = buildNormalizedWertguthabenSettingsPayload(wertguthabenSettings);
        await saveUserSetting('wertguthabenSettings', payload);

        const persisted = getUserSetting('wertguthabenSettings', null);
        const expectedSerialized = JSON.stringify(payload);
        const persistedSerialized = JSON.stringify(buildNormalizedWertguthabenSettingsPayload(persisted));

        if (persistedSerialized !== expectedSerialized) {
            throw new Error('Die Credit-Wallet-Einstellungen konnten nicht in Firebase bestätigt werden.');
        }

        return true;
    } catch (error) {
        console.error('Konnte Credit-Wallet-Einstellungen nicht speichern:', error);
        alertUser('Einstellungen konnten nicht gespeichert werden.', 'error');
        return false;
    }
}

function toggleWertguthabenMenuDropdown() {
    const menuBtn = document.getElementById('btn-wertguthaben-menu');
    const dropdown = document.getElementById('wertguthabenMenuDropdown');
    if (!menuBtn || !dropdown) return;

    wertguthabenMenuOpen = !wertguthabenMenuOpen;
    dropdown.classList.toggle('hidden', !wertguthabenMenuOpen);
    menuBtn.setAttribute('aria-expanded', wertguthabenMenuOpen ? 'true' : 'false');
}

function closeWertguthabenMenuDropdown() {
    const menuBtn = document.getElementById('btn-wertguthaben-menu');
    const dropdown = document.getElementById('wertguthabenMenuDropdown');
    wertguthabenMenuOpen = false;
    if (dropdown) dropdown.classList.add('hidden');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}

function toggleWertguthabenDetailsMoreMenu() {
    const menuBtn = document.getElementById('wertguthabenDetailsMoreBtn');
    const dropdown = document.getElementById('wertguthabenDetailsMoreMenu');
    if (!menuBtn || !dropdown) return;

    wertguthabenDetailsMoreMenuOpen = !wertguthabenDetailsMoreMenuOpen;
    dropdown.classList.toggle('hidden', !wertguthabenDetailsMoreMenuOpen);
    menuBtn.setAttribute('aria-expanded', wertguthabenDetailsMoreMenuOpen ? 'true' : 'false');
}

function closeWertguthabenDetailsMoreMenu() {
    const menuBtn = document.getElementById('wertguthabenDetailsMoreBtn');
    const dropdown = document.getElementById('wertguthabenDetailsMoreMenu');
    wertguthabenDetailsMoreMenuOpen = false;
    if (dropdown) dropdown.classList.add('hidden');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}

function setWertguthabenArchivSummary(text) {
    const summary = document.getElementById('wertguthabenArchivSummary');
    if (!summary) return;
    summary.textContent = String(text || '').trim();
}

function renderWertguthabenArchiveReasonOptions(selectedValue = '', newReasonValue = '') {
    const select = document.getElementById('wgArchiveReasonSelect');
    const newReasonWrapper = document.getElementById('wgArchiveReasonNewWrapper');
    const newReasonInput = document.getElementById('wgArchiveReasonNew');
    if (!select || !newReasonWrapper || !newReasonInput) return;

    const reasons = sanitizeWertguthabenArchivGruende(wertguthabenSettings.archivGruende);
    const normalizedSelected = String(selectedValue || '').trim();
    const hasExistingSelection = reasons.includes(normalizedSelected);
    const useNewReason = normalizedSelected === '__new__' || (!!normalizedSelected && !hasExistingSelection);
    const options = ['<option value="">Grund auswählen...</option>'];

    reasons.forEach((reason) => {
        options.push(`<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`);
    });
    options.push('<option value="__new__">+ Neuen Grund eingeben</option>');

    select.innerHTML = options.join('');
    if (hasExistingSelection) {
        select.value = normalizedSelected;
    } else if (useNewReason) {
        select.value = '__new__';
    } else {
        select.value = '';
    }

    newReasonWrapper.classList.toggle('hidden', select.value !== '__new__');
    newReasonInput.value = select.value === '__new__'
        ? String(newReasonValue || normalizedSelected || '').trim()
        : String(newReasonValue || '').trim();
}

function getSelectedWertguthabenArchiveReason() {
    const select = document.getElementById('wgArchiveReasonSelect');
    const newReasonInput = document.getElementById('wgArchiveReasonNew');
    if (!select) return '';
    if (select.value === '__new__') {
        return String(newReasonInput?.value || '').trim();
    }
    return String(select.value || '').trim();
}

function updateWertguthabenArchiveConfirmState() {
    const confirmButton = document.getElementById('confirmWertguthabenArchiveBtn');
    const confirmInput = document.getElementById('wgArchiveConfirmText');
    if (!confirmButton || !confirmInput) return;

    const hasValidReason = !!getSelectedWertguthabenArchiveReason();
    const hasValidConfirmation = String(confirmInput.value || '').trim() === 'OK';
    confirmButton.disabled = !(hasValidReason && hasValidConfirmation);
}

function resetWertguthabenArchiveConfirmModal() {
    const modal = document.getElementById('wertguthabenArchiveConfirmModal');
    const confirmInput = document.getElementById('wgArchiveConfirmText');
    if (modal) modal.dataset.entryId = '';
    if (confirmInput) confirmInput.value = '';
    renderWertguthabenArchiveReasonOptions();
    updateWertguthabenArchiveConfirmState();
}

function openWertguthabenArchiveConfirmModal(entryId) {
    const modal = document.getElementById('wertguthabenArchiveConfirmModal');
    if (!modal) return;
    const entry = WERTGUTHABEN[String(entryId || '').trim()];
    if (entry && isUnassignedWertguthabenEntry(entry)) {
        alertUser('Nicht zugeordnete Elemente können nicht archiviert werden.', 'warning');
        return;
    }
    resetWertguthabenArchiveConfirmModal();
    modal.dataset.entryId = String(entryId || '').trim();
    modal.style.display = 'flex';
}

function closeWertguthabenArchiveConfirmModal() {
    const modal = document.getElementById('wertguthabenArchiveConfirmModal');
    if (!modal) return;
    modal.style.display = 'none';
    resetWertguthabenArchiveConfirmModal();
}

async function ensureWertguthabenArchivGrundStored(reason) {
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) return false;
    const existingReasons = sanitizeWertguthabenArchivGruende(wertguthabenSettings.archivGruende);
    if (existingReasons.some((item) => item.toLowerCase() === trimmedReason.toLowerCase())) {
        return true;
    }

    wertguthabenSettings.archivGruende = sanitizeWertguthabenArchivGruende([
        ...existingReasons,
        trimmedReason
    ]);
    return await persistWertguthabenSettings();
}

async function loadArchivedWertguthabenEntries() {
    if (!wertguthabenCollection) return [];

    try {
        const snapshot = await getDocs(query(wertguthabenCollection, where('createdBy', '==', currentUser.mode)));
        const entries = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            if (data.archiviert !== true) return;
            entries.push({
                id: docSnap.id,
                ...data,
                ownerUserId: String(data.ownerUserId || data.createdBy || '').trim(),
                listId: normalizeWertguthabenListId(data.listId),
                kategorie: normalizeWertguthabenKategorie(data.kategorie, { preserveUnknown: true }),
                fixedId: normalizeFixedId(data.fixedId) || ''
            });
        });

        entries.sort((a, b) => getWertguthabenSortTimestamp(b, 'archiviertAm') - getWertguthabenSortTimestamp(a, 'archiviertAm'));

        ARCHIVED_WERTGUTHABEN = entries.reduce((accumulator, entry) => {
            accumulator[entry.id] = entry;
            return accumulator;
        }, {});
        return entries;
    } catch (error) {
        console.error('Fehler beim Laden des Credit-Wallet-Archivs:', error);
        alertUser('Archiv konnte nicht geladen werden.', 'error');
        return [];
    }
}

async function renderWertguthabenArchivOverview() {
    const tbody = document.getElementById('wertguthabenArchivTableBody');
    if (!tbody) return;

    setWertguthabenArchivSummary('Archiv wird geladen...');
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">Archiv wird geladen...</td></tr>';

    const entries = getVisibleWertguthabenEntries(await loadArchivedWertguthabenEntries());
    if (entries.length === 0) {
        setWertguthabenArchivSummary('0 archivierte Einträge');
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">Keine archivierten Einträge gefunden.</td></tr>';
        return;
    }

    setWertguthabenArchivSummary(`${entries.length} ${entries.length === 1 ? 'archivierter Eintrag' : 'archivierte Einträge'}`);
    tbody.innerHTML = entries.map((entry) => {
        const typConfig = TYP_CONFIG[entry.typ] || TYP_CONFIG.guthaben;
        const archiviertAm = formatDateTime(entry.archiviertAm) || '-';
        const archivGrund = String(entry.archivGrund || '-').trim() || '-';
        return `
            <tr>
                <td class="px-4 py-3 align-top font-semibold text-gray-900">${escapeHtml(entry.name || 'Ohne Name')}</td>
                <td class="px-4 py-3 align-top font-mono font-bold text-emerald-700">#${escapeHtml(getWertguthabenDisplayId(entry))}</td>
                <td class="px-4 py-3 align-top"><span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${typConfig.color}">${escapeHtml(typConfig.icon)} ${escapeHtml(typConfig.label)}</span></td>
                <td class="px-4 py-3 align-top whitespace-nowrap text-gray-600">${escapeHtml(archiviertAm)}</td>
                <td class="px-4 py-3 align-top text-gray-700">${escapeHtml(archivGrund)}</td>
                <td class="px-4 py-3 align-top">
                    <div class="flex flex-wrap gap-2">
                        <button data-archiv-action="view" data-entry-id="${escapeHtml(entry.id)}" class="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 font-semibold transition">Ansehen</button>
                        <button data-archiv-action="restore" data-entry-id="${escapeHtml(entry.id)}" class="px-3 py-1.5 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 font-semibold transition">Wiederherstellen</button>
                        <button data-archiv-action="delete" data-entry-id="${escapeHtml(entry.id)}" class="px-3 py-1.5 rounded-lg bg-red-100 text-red-800 hover:bg-red-200 font-semibold transition">Löschen</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function openWertguthabenArchivModal() {
    const modal = document.getElementById('wertguthabenArchivModal');
    if (!modal) return;
    modal.style.display = 'flex';
    await renderWertguthabenArchivOverview();
}

function closeWertguthabenArchivModal() {
    const modal = document.getElementById('wertguthabenArchivModal');
    if (!modal) return;
    modal.style.display = 'none';
}

async function confirmWertguthabenArchivierung() {
    const modal = document.getElementById('wertguthabenArchiveConfirmModal');
    const entryId = String(modal?.dataset.entryId || '').trim();
    const reason = getSelectedWertguthabenArchiveReason();
    const entry = WERTGUTHABEN[entryId];
    if (!entry) {
        alertUser('Credit Wallet nicht gefunden.', 'error');
        return;
    }
    if (!reason) {
        alertUser('Bitte einen Archivierungsgrund auswählen.', 'warning');
        return;
    }
    if (isUnassignedWertguthabenEntry(entry)) {
        alertUser('Nicht zugeordnete Elemente können nicht archiviert werden.', 'warning');
        return;
    }
    if (!await ensureWertguthabenArchivGrundStored(reason)) {
        return;
    }

    try {
        await updateDoc(doc(wertguthabenCollection, entryId), {
            archiviert: true,
            archiviertAm: serverTimestamp(),
            archiviertVon: currentUser.mode,
            archivGrund: reason,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        });
        closeWertguthabenArchiveConfirmModal();
        const detailsModal = document.getElementById('wertguthabenDetailsModal');
        if (detailsModal) detailsModal.style.display = 'none';
        alertUser('Credit Wallet archiviert.', 'success');
        if (document.getElementById('wertguthabenArchivModal')?.style.display === 'flex') {
            await renderWertguthabenArchivOverview();
        }
    } catch (error) {
        console.error('Fehler beim Archivieren des Credit Wallets:', error);
        alertUser('Fehler beim Archivieren: ' + error.message, 'error');
    }
}

async function restoreArchivedWertguthaben(entryId) {
    const entry = ARCHIVED_WERTGUTHABEN[entryId];
    if (!entry) {
        alertUser('Archivierter Eintrag nicht gefunden.', 'error');
        return;
    }
    if (!confirm(`Soll "${entry.name || 'dieser Eintrag'}" wirklich wiederhergestellt werden?`)) {
        return;
    }

    try {
        await updateDoc(doc(wertguthabenCollection, entryId), {
            archiviert: false,
            archiviertAm: null,
            archiviertVon: null,
            archivGrund: null,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        });
        if (wertguthabenDetailsState.readOnly && wertguthabenDetailsState.entryId === entryId) {
            document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        }
        alertUser('Credit Wallet wiederhergestellt.', 'success');
        await renderWertguthabenArchivOverview();
    } catch (error) {
        console.error('Fehler beim Wiederherstellen des Credit Wallets:', error);
        alertUser('Fehler beim Wiederherstellen: ' + error.message, 'error');
    }
}

async function deleteAllWertguthabenTransaktionen(entryId) {
    const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', entryId, 'transaktionen');
    const snapshot = await getDocs(transaktionenRef);
    const deletePromises = [];
    snapshot.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref));
    });
    await Promise.all(deletePromises);
}

async function permanentlyDeleteArchivedWertguthaben(entryId) {
    const entry = ARCHIVED_WERTGUTHABEN[entryId] || WERTGUTHABEN[entryId];
    if (!entry) {
        alertUser('Eintrag nicht gefunden.', 'error');
        return;
    }
    if (!confirm(`Soll "${entry.name || 'dieser Eintrag'}" endgültig und unwiderruflich gelöscht werden?`)) {
        return;
    }

    try {
        await deleteAllWertguthabenTransaktionen(entryId);
        await deleteDoc(doc(wertguthabenCollection, entryId));
        if (wertguthabenDetailsState.entryId === entryId) {
            document.getElementById('wertguthabenDetailsModal').style.display = 'none';
        }
        alertUser('Credit Wallet endgültig gelöscht.', 'success');
        if (document.getElementById('wertguthabenArchivModal')?.style.display === 'flex') {
            await renderWertguthabenArchivOverview();
        }
    } catch (error) {
        console.error('Fehler beim endgültigen Löschen des Credit Wallets:', error);
        alertUser('Fehler beim Löschen: ' + error.message, 'error');
    }
}

window.archiveWertguthaben = async function(id) {
    const entry = WERTGUTHABEN[String(id || '').trim()];
    if (entry && isUnassignedWertguthabenEntry(entry)) {
        alertUser('Nicht zugeordnete Elemente können nicht archiviert werden.', 'warning');
        return;
    }
    openWertguthabenArchiveConfirmModal(id);
};

window.openArchivedWertguthabenDetails = async function(id) {
    let entry = ARCHIVED_WERTGUTHABEN[id];
    if (!entry) {
        await loadArchivedWertguthabenEntries();
        entry = ARCHIVED_WERTGUTHABEN[id];
    }
    if (!entry) {
        alertUser('Archivierter Eintrag nicht gefunden.', 'error');
        return;
    }
    await window.openWertguthabenDetails(id, { readOnly: true, entry });
};

async function loadAllWertguthabenTransaktionen() {
    const entries = getVisibleWertguthabenEntries();
    const transaktionsPakete = await Promise.all(entries.map(async (entry) => {
        const transaktionen = await loadTransaktionen(entry.id);
        return transaktionen.map((transaktion) => ({
            ...transaktion,
            wertguthabenId: entry.id,
            wertguthabenName: entry.name || 'Ohne Name',
            wertguthabenDisplayId: getWertguthabenDisplayId(entry)
        }));
    }));

    return transaktionsPakete.flat();
}

function setWertguthabenTransaktionenSummary(text) {
    const summary = document.getElementById('wgTransaktionenSummary');
    if (!summary) return;
    summary.textContent = String(text || '').trim();
}

function updateWertguthabenTransaktionenQuickButtons(activeKey = '') {
    const buttonConfigs = [
        { id: 'wgTransaktionenQuickHeute', key: 'heute' },
        { id: 'wgTransaktionenQuick7Tage', key: '7tage' },
        { id: 'wgTransaktionenQuickMonat', key: 'monat' }
    ];
    buttonConfigs.forEach(({ id, key }) => {
        const button = document.getElementById(id);
        if (!button) return;
        const isActive = key === activeKey;
        button.classList.toggle('border-emerald-300', isActive);
        button.classList.toggle('bg-emerald-50', isActive);
        button.classList.toggle('text-emerald-700', isActive);
        button.classList.toggle('border-gray-300', !isActive);
        button.classList.toggle('bg-white', !isActive);
        button.classList.toggle('text-gray-700', !isActive);
    });
}

function resolveWertguthabenQuickRangeValues(rangeKey) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);

    if (rangeKey === '7tage') {
        start.setDate(start.getDate() - 6);
    } else if (rangeKey === 'monat') {
        start.setDate(1);
    }

    return {
        von: getTodayDateInputValueForDate(start),
        bis: getTodayDateInputValueForDate(end)
    };
}

function getTodayDateInputValueForDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function detectActiveWertguthabenQuickRange(vonValue, bisValue) {
    const normalizedVon = String(vonValue || '').trim();
    const normalizedBis = String(bisValue || '').trim();
    if (!normalizedVon || !normalizedBis) return '';

    const heute = resolveWertguthabenQuickRangeValues('heute');
    if (normalizedVon === heute.von && normalizedBis === heute.bis) return 'heute';
    const siebenTage = resolveWertguthabenQuickRangeValues('7tage');
    if (normalizedVon === siebenTage.von && normalizedBis === siebenTage.bis) return '7tage';
    const monat = resolveWertguthabenQuickRangeValues('monat');
    if (normalizedVon === monat.von && normalizedBis === monat.bis) return 'monat';
    return '';
}

function setWertguthabenTransaktionenQuickRange(rangeKey) {
    const vonInput = document.getElementById('wgTransaktionenVon');
    const bisInput = document.getElementById('wgTransaktionenBis');
    if (!vonInput || !bisInput) return;

    const range = resolveWertguthabenQuickRangeValues(rangeKey);
    vonInput.value = range.von;
    bisInput.value = range.bis;
    updateWertguthabenTransaktionenQuickButtons(rangeKey);
    renderWertguthabenTransaktionenOverview();
}

async function renderWertguthabenTransaktionenOverview() {
    const tbody = document.getElementById('wertguthabenTransaktionenTableBody');
    const vonInput = document.getElementById('wgTransaktionenVon');
    const bisInput = document.getElementById('wgTransaktionenBis');
    if (!tbody || !vonInput || !bisInput) return;

    updateWertguthabenTransaktionenQuickButtons(detectActiveWertguthabenQuickRange(vonInput.value, bisInput.value));

    const vonDate = parseLocalDateInputValue(vonInput.value, false);
    const bisDate = parseLocalDateInputValue(bisInput.value, true);

    if (!vonDate || !bisDate) {
        setWertguthabenTransaktionenSummary('Ungültiger Datumsbereich');
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">Bitte gültige Datumswerte wählen.</td></tr>';
        return;
    }

    if (vonDate.getTime() > bisDate.getTime()) {
        setWertguthabenTransaktionenSummary('Datumsbereich ungültig');
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-amber-700 italic">Der Von-Wert darf nicht nach dem Bis-Wert liegen.</td></tr>';
        return;
    }

    const requestId = ++wgTransaktionenRenderRequestId;
    setWertguthabenTransaktionenSummary('Transaktionen werden geladen...');
    tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">Transaktionen werden geladen...</td></tr>';

    const alleTransaktionen = await loadAllWertguthabenTransaktionen();
    if (requestId !== wgTransaktionenRenderRequestId) return;

    const gefiltert = alleTransaktionen
        .map((transaktion) => ({
            ...transaktion,
            _sortTimestamp: getTransaktionSortTimestamp(transaktion)
        }))
        .filter((transaktion) => transaktion._sortTimestamp >= vonDate.getTime() && transaktion._sortTimestamp <= bisDate.getTime())
        .sort((a, b) => b._sortTimestamp - a._sortTimestamp);

    if (gefiltert.length === 0) {
        setWertguthabenTransaktionenSummary('0 Transaktionen');
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400 italic">Keine Transaktionen im gewählten Zeitraum gefunden.</td></tr>';
        return;
    }

    setWertguthabenTransaktionenSummary(`${gefiltert.length} ${gefiltert.length === 1 ? 'Transaktion' : 'Transaktionen'}`);

    tbody.innerHTML = gefiltert.map((transaktion) => {
        const summary = formatWertguthabenTransaktionSummary(transaktion);
        const typeMeta = getWertguthabenTransaktionTypeMeta(transaktion);
        const datumText = formatDateTime(transaktion.datum || transaktion.createdAt || transaktion.updatedAt) || '-';
        const actor = isStartguthabenTransaktion(transaktion)
            ? 'System'
            : getDisplayUserName(transaktion.createdBy || transaktion.updatedBy || '');
        return `
            <tr data-wertguthaben-id="${escapeHtml(transaktion.wertguthabenId)}" class="cursor-pointer hover:bg-emerald-50 transition-colors">
                <td class="px-4 py-3 align-top">
                    <div class="font-semibold text-gray-900">${escapeHtml(transaktion.wertguthabenName || 'Ohne Name')}</div>
                </td>
                <td class="px-4 py-3 align-top">
                    <div class="font-mono font-bold text-emerald-700">#${escapeHtml(transaktion.wertguthabenDisplayId || '')}</div>
                </td>
                <td class="px-4 py-3 align-top whitespace-nowrap">
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-800 font-semibold">${escapeHtml(typeMeta.icon)} ${escapeHtml(typeMeta.label)}</span>
                </td>
                <td class="px-4 py-3 align-top">
                    <div class="font-semibold text-gray-800">${escapeHtml(summary.title)}</div>
                    ${summary.details ? `<div class="mt-1 text-xs text-gray-500">${escapeHtml(summary.details)}</div>` : ''}
                </td>
                <td class="px-4 py-3 align-top whitespace-nowrap text-gray-600">${escapeHtml(actor || 'Unbekannt')}</td>
                <td class="px-4 py-3 align-top whitespace-nowrap text-gray-600">${escapeHtml(datumText)}</td>
            </tr>
        `;
    }).join('');
}

async function openWertguthabenTransaktionenModal() {
    const modal = document.getElementById('wertguthabenTransaktionenModal');
    const vonInput = document.getElementById('wgTransaktionenVon');
    const bisInput = document.getElementById('wgTransaktionenBis');
    if (!modal || !vonInput || !bisInput) return;

    const today = getTodayDateInputValue();
    vonInput.value = today;
    bisInput.value = today;
    modal.style.display = 'flex';
    updateWertguthabenTransaktionenQuickButtons('heute');
    await renderWertguthabenTransaktionenOverview();
}

function closeWertguthabenTransaktionenModal() {
    const modal = document.getElementById('wertguthabenTransaktionenModal');
    if (!modal) return;
    modal.style.display = 'none';
}

async function addWertguthabenKategorieFromSettings() {
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
    if (!await persistWertguthabenSettings()) return;
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
    if (!await persistWertguthabenSettings()) return;
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
    if (!await persistWertguthabenSettings()) return;
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
    populateWertguthabenListFormDropdown(isSpecialWertguthabenListId(currentWertguthabenListId) ? '' : getPreferredCreateListId(), {
        allowEmptySelection: true,
        includeSpecialOption: false
    });
    setWertguthabenFormKategorieValue(getDefaultFormKategorie());
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
    wertguthabenFormState.isListAssignmentOnly = false;
    wertguthabenFormState.lastSelectedTyp = 'gutschein';
    wertguthabenFormState.statusManuallyChangedBeforeAktionscodeSwitch = false;
    wertguthabenFormState.wertBeforeAktionscodeSwitch = '';
    wertguthabenFormState.statusBeforeAktionscodeSwitch = '';

    setWertguthabenFormListAssignmentMode(false);
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
    const isUnassignedEntry = !getEntryAssignedWertguthabenListId(wg);

    if (isCopy) {
        populateWertguthabenListFormDropdown(isSpecialWertguthabenListId(currentWertguthabenListId) ? '' : getPreferredCreateListId(), {
            allowEmptySelection: true,
            includeSpecialOption: false
        });
        setWertguthabenFormListAssignmentMode(false);
    } else {
        populateWertguthabenListFormDropdown(isUnassignedEntry ? WG_SPECIAL_LIST_ID : getEntryAssignedWertguthabenListId(wg), {
            allowEmptySelection: false,
            includeSpecialOption: isUnassignedEntry
        });
        setWertguthabenFormListAssignmentMode(isUnassignedEntry);
    }

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
    setWertguthabenFormKategorieValue(normalizeWertguthabenKategorie(wg.kategorie, { preserveUnknown: true }));
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
    if (!hasRealWertguthabenListen()) {
        alertUser('Bitte zuerst eine Liste anlegen.', 'warning');
        openSettingsModal();
        return;
    }

    document.getElementById('wertguthabenModalTitle').textContent = 'Neues Credit Wallet';
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
    setWertguthabenFormListAssignmentMode(false);
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
    if (wertguthabenFormState.isListAssignmentOnly) {
        setWertguthabenFormListAssignmentMode(true);
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
// ========================================
async function saveWertguthaben() {
    const editId = document.getElementById('editWertguthabenId').value;
    const existingEntry = editId ? WERTGUTHABEN[editId] : null;
    const selectedListId = normalizeWertguthabenListId(document.getElementById('wgListe')?.value || '');

    if (!isRealWertguthabenListId(selectedListId)) {
        updateWertguthabenListFieldHint('Bitte eine echte Liste auswählen.', 'error');
        return alertUser('Bitte eine echte Liste auswählen.', 'error');
    }

    // Validierung
    const name = document.getElementById('wgName').value.trim();
    if (!name) {
        return alertUser('Bitte Name eingeben!', 'error');
    }

    const selectedKategorie = normalizeWertguthabenKategorie(
        document.getElementById('wgKategorie').dataset.selectedKategorie || document.getElementById('wgKategorie').value,
        { preserveUnknown: true }
    );
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
        ownerUserId: currentUser.mode,
        listId: selectedListId,
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
            alertUser('Credit Wallet aktualisiert!', 'success');
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
            alertUser('Credit Wallet erstellt!', 'success');
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

    document.getElementById('wertguthabenModalTitle').textContent = 'Credit Wallet bearbeiten';
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
    await permanentlyDeleteArchivedWertguthaben(id);
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
    const einloesungAnzahlInput = document.getElementById('transaktionEinloesungAnzahl');
    const typSelect = document.getElementById('transaktionTyp');
    const verfuegbar = document.getElementById('transaktionVerfuegbar');
    const urspruenglich = document.getElementById('transaktionUrspruenglich');
    if (!betragInput || !typSelect || !verfuegbar || !urspruenglich) return;

    if (typSelect.value === 'einloesung') {
        const max = transaktionModalState.maxEinloesungen;
        const current = transaktionModalState.bereitsEingeloest;
        const availableCount = max > 0 ? Math.max(0, max - current) : Number.POSITIVE_INFINITY;
        const enteredRaw = Number.parseFloat(String(einloesungAnzahlInput?.value || '').replace(',', '.'));
        const enteredCount = Number.isFinite(enteredRaw) ? enteredRaw : 0;
        const isPositiveInteger = Number.isInteger(enteredCount) && enteredCount > 0;
        const exceedsAvailableCount = max > 0 && enteredCount > availableCount;
        const disableSave = !isPositiveInteger || exceedsAvailableCount;
        let validationMessage = '';

        betragInput.removeAttribute('max');
        betragInput.classList.remove('border-red-500', 'focus:border-red-500');

        if (einloesungAnzahlInput) {
            einloesungAnzahlInput.min = '1';
            einloesungAnzahlInput.step = '1';
            if (max > 0) {
                einloesungAnzahlInput.max = String(availableCount);
            } else {
                einloesungAnzahlInput.removeAttribute('max');
            }
        }

        if (max > 0 && availableCount <= 0) {
            validationMessage = 'Keine Einlösungen mehr verfügbar.';
        } else if (exceedsAvailableCount) {
            validationMessage = `Maximal verfügbar: ${availableCount}`;
        } else if (!isPositiveInteger) {
            validationMessage = 'Bitte eine ganze Einlösemenge größer als 0 eingeben.';
        }

        setTransaktionSaveEnabled(!disableSave);
        setTransaktionValidationHint(validationMessage);

        if (einloesungAnzahlInput) {
            const hasError = !!validationMessage;
            einloesungAnzahlInput.classList.toggle('border-red-500', hasError);
            einloesungAnzahlInput.classList.toggle('focus:border-red-500', hasError);
            einloesungAnzahlInput.classList.toggle('focus:border-pink-500', !hasError);
        }

        const availableText = max > 0 ? `${Math.max(0, max - current)} verfügbar` : '∞ verfügbar';
        verfuegbar.textContent = `${current} / ${max > 0 ? max : '∞'} (${availableText})`;
        urspruenglich.textContent = 'Aktionscode';
        return;
    }

    if (einloesungAnzahlInput) {
        einloesungAnzahlInput.classList.remove('border-red-500', 'focus:border-red-500');
        einloesungAnzahlInput.classList.add('focus:border-pink-500');
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
    setTransaktionBetragHint(validationMessage);
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

function setTransaktionBetragHint(message) {
    const hint = document.getElementById('transaktionBetragHint');
    if (!hint) return;
    const text = String(message || '').trim();
    hint.textContent = text;
    hint.classList.toggle('hidden', !text);
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
    const einloesungAnzahlInput = document.getElementById('transaktionEinloesungAnzahl');
    const datumInput = document.getElementById('transaktionDatum');
    const detailsToggle = document.getElementById('transaktionDetailsToggle');

    const lockClassTargets = [betragInput, einloesungAnzahlInput, detailsToggle];
    lockClassTargets.forEach((target) => {
        if (!target) return;
        target.classList.toggle('opacity-60', !!enabled);
        target.classList.toggle('cursor-not-allowed', !!enabled);
    });

    if (typSelect) typSelect.disabled = !!enabled || source === 'einloese';
    if (betragInput) betragInput.disabled = !!enabled;
    if (einloesungAnzahlInput) einloesungAnzahlInput.disabled = !!enabled;
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
    const einloesungAnzahlInput = document.getElementById('transaktionEinloesungAnzahl');
    const betragInput = document.getElementById('transaktionBetrag');
    const betragLabel = document.querySelector('label[for="transaktionBetrag"]') || document.querySelector('#transaktionBetragContainer label');
    const source = document.getElementById('transaktionOpenSource')?.value || 'dashboard';

    const isEinloesungType = typ === 'einloesung';
    if (betragContainer) betragContainer.classList.toggle('hidden', isEinloesungType);
    if (isEinloesungType) setTransaktionBetragHint('');
    if (einloesungContainer) {
        const showEinloesung = isEinloesungType && wg?.typ === 'aktionscode';
        einloesungContainer.classList.toggle('hidden', !showEinloesung);
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

    if (einloesungAnzahlInput) {
        einloesungAnzahlInput.min = '1';
        einloesungAnzahlInput.step = '1';
        if (!isEinloesungType) {
            einloesungAnzahlInput.classList.remove('border-red-500', 'focus:border-red-500');
            einloesungAnzahlInput.classList.add('focus:border-pink-500');
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
        return alertUser('Credit Wallet nicht gefunden!', 'error');
    }

    const wg = wertguthabenDoc.data();
    WERTGUTHABEN[wertguthabenId] = { ...wg, id: wertguthabenId };

    const source = options.source === 'einloese' ? 'einloese' : 'dashboard';
    const isUnassignedEntry = isUnassignedWertguthabenEntry(wg);

    if (isUnassignedEntry) {
        alertUser('Transaktion buchen ist für „Nicht zugeordnete Elemente“ nicht möglich. Bitte zuerst eine Liste zuweisen.', 'warning');
        return;
    }

    const transaktionTypSelect = document.getElementById('transaktionTyp');
    const transaktionBetragInput = document.getElementById('transaktionBetrag');
    const transaktionBetragContainer = document.getElementById('transaktionBetragContainer');
    const transaktionEinloesungContainer = document.getElementById('transaktionEinloesungContainer');
    const transaktionEinloesungAnzahlInput = document.getElementById('transaktionEinloesungAnzahl');
    const transaktionDatumInput = document.getElementById('transaktionDatum');
    const restwertVerifiziertInfo = document.getElementById('transaktionRestwertVerifiziertInfo');
    const bookedForIdLabel = document.getElementById('transaktionBookedForIdLabel');
    const bookedForLabel = document.getElementById('transaktionBookedForLabel');
    const bookedForMeta = document.getElementById('transaktionBookedForMeta');
    const verfuegbarElement = document.getElementById('transaktionVerfuegbar');
    const betragLabel = document.querySelector('label[for="transaktionBetrag"]') || document.querySelector('#transaktionBetragContainer label');
    const saveBtn = document.getElementById('saveTransaktionBtn');
    const optionVerwendung = transaktionTypSelect?.querySelector('option[value="verwendung"]');
    const optionGutschrift = transaktionTypSelect?.querySelector('option[value="gutschrift"]');
    const optionKorrektur = transaktionTypSelect?.querySelector('option[value="korrektur"]');
    const optionEinloesung = transaktionTypSelect?.querySelector('option[value="einloesung"]');

    document.getElementById('transaktionWertguthabenId').value = wertguthabenId;
    document.getElementById('editTransaktionId').value = '';
    document.getElementById('transaktionOpenSource').value = source;

    transaktionModalState.source = source;
    transaktionModalState.editTransaktionId = '';
    transaktionModalState.isEditMode = false;
    transaktionModalState.isVerificationOnlyMode = false;
    transaktionModalState.isExistingTransaktionVerified = false;
    transaktionModalState.maxEinloesungen = Number(wg.maxEinloesungen || 0);
    transaktionModalState.bereitsEingeloest = Number(wg.bereitsEingeloest || 0);
    transaktionModalState.isEinloesungMode = false;

    const displayId = getWertguthabenDisplayId({ ...wg, id: wertguthabenId });
    const eigentuemerName = String(USERS[wg.eigentuemer]?.name || wg.eigentuemer || '-').trim() || '-';
    const unternehmenName = String(wg.unternehmen || '-').trim() || '-';
    const kategorieName = String(normalizeWertguthabenKategorie(wg.kategorie) || '-').trim() || '-';
    const listenName = String(getWertguthabenListNameById(normalizeWertguthabenListId(wg.listId)) || '-').trim() || '-';

    if (bookedForIdLabel) {
        bookedForIdLabel.textContent = `ID: #${displayId || '-'}`;
    }

    if (bookedForLabel) {
        bookedForLabel.textContent = String(wg.name || '').trim() || `#${displayId || '-'}`;
    }

    if (bookedForMeta) {
        bookedForMeta.textContent = `Eigentümer: ${eigentuemerName} · Unternehmen: ${unternehmenName} · Kategorie: ${kategorieName} · Liste: ${listenName}`;
    }

    const aktuellerRestwert = Number(wg.restwert !== undefined ? wg.restwert : wg.wert || 0);
    transaktionModalState.originalRestwert = Math.max(0, aktuellerRestwert);

    let typ = wg.typ === 'aktionscode' ? 'einloesung' : 'verwendung';
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

    transaktionBetragInput.value = '';
    if (transaktionEinloesungAnzahlInput) {
        transaktionEinloesungAnzahlInput.value = '';
    }
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

    document.getElementById('transaktionBestellnr').value = '';
    document.getElementById('transaktionRechnungsnr').value = '';
    document.getElementById('transaktionBeschreibung').value = '';

    if (saveBtn) {
        saveBtn.textContent = 'Transaktion buchen';
    }

    setTransaktionDetailsExpanded(false);
    handleTransaktionTypChange();
    updateTransaktionPreview();
    setTransaktionVerificationOnlyUi(false, source);

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
    const bookedForIdLabel = document.getElementById('transaktionBookedForIdLabel');
    const bookedForLabel = document.getElementById('transaktionBookedForLabel');
    const bookedForMeta = document.getElementById('transaktionBookedForMeta');
    const einloesungAnzahlInput = document.getElementById('transaktionEinloesungAnzahl');
    if (bookedForIdLabel) bookedForIdLabel.textContent = 'ID: #-';
    if (bookedForLabel) bookedForLabel.textContent = '-';
    if (bookedForMeta) bookedForMeta.textContent = 'Eigentümer: - · Unternehmen: - · Kategorie: - · Liste: -';
    if (einloesungAnzahlInput) einloesungAnzahlInput.value = '';
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
    setTransaktionBetragHint('');
    setTransaktionValidationHint('');
}

function updateTransaktionVerificationConfirmState() {
    const checkbox = document.getElementById('transaktionVerificationConfirmCheckbox');
    const confirmBtn = document.getElementById('confirmTransaktionVerificationBtn');
    if (!confirmBtn) return;
    const enabled = !!checkbox?.checked
        && !!transaktionVerificationModalState.wertguthabenId
        && !!transaktionVerificationModalState.transaktionId;
    confirmBtn.disabled = !enabled;
}

function closeTransaktionVerificationModal() {
    const modal = document.getElementById('transaktionVerificationModal');
    const checkbox = document.getElementById('transaktionVerificationConfirmCheckbox');
    const idLabel = document.getElementById('transaktionVerificationIdLabel');
    const nameLabel = document.getElementById('transaktionVerificationName');
    const summaryLabel = document.getElementById('transaktionVerificationSummary');
    const currentValueLabel = document.getElementById('transaktionVerificationCurrentValue');

    if (modal) modal.style.display = 'none';
    if (checkbox) checkbox.checked = false;
    if (idLabel) idLabel.textContent = 'ID: #-';
    if (nameLabel) nameLabel.textContent = '-';
    if (summaryLabel) summaryLabel.textContent = '-';
    if (currentValueLabel) currentValueLabel.textContent = 'Aktueller Wert: 0,00 €';

    transaktionVerificationModalState.wertguthabenId = '';
    transaktionVerificationModalState.transaktionId = '';
    transaktionVerificationModalState.transaktion = null;
    updateTransaktionVerificationConfirmState();
}

function openTransaktionVerificationModal(wertguthabenId, transaktion) {
    const wg = WERTGUTHABEN[wertguthabenId];
    const modal = document.getElementById('transaktionVerificationModal');
    const checkbox = document.getElementById('transaktionVerificationConfirmCheckbox');
    const idLabel = document.getElementById('transaktionVerificationIdLabel');
    const nameLabel = document.getElementById('transaktionVerificationName');
    const summaryLabel = document.getElementById('transaktionVerificationSummary');
    const currentValueLabel = document.getElementById('transaktionVerificationCurrentValue');

    if (!wg || !transaktion?.id || !modal) {
        alertUser('Verifizierungsdaten konnten nicht geladen werden.', 'error');
        return;
    }

    const displayId = getWertguthabenDisplayId({ ...wg, id: wertguthabenId });
    const transaktionBetrag = Number(transaktion.betrag || 0);
    const einloesungAnzahl = getTransaktionEinloesungAnzahl(transaktion);
    const isKorrektur = transaktion.typ === 'korrektur';
    const icon = transaktion.typ === 'verwendung'
        ? '📉'
        : (transaktion.typ === 'einloesung' ? '🎟️' : (isKorrektur ? '🛠️' : '📈'));
    const betragText = transaktion.typ === 'verwendung'
        ? `- ${Math.abs(transaktionBetrag).toFixed(2)} €`
        : (transaktion.typ === 'einloesung'
            ? `${einloesungAnzahl}x Einlösung`
            : (isKorrektur
                ? `${transaktionBetrag >= 0 ? '+' : '-'} ${Math.abs(transaktionBetrag).toFixed(2)} € (Korrektur)`
                : `+ ${Math.abs(transaktionBetrag).toFixed(2)} €`));
    const datum = formatDateTime(transaktion.datum || transaktion.createdAt || transaktion.updatedAt) || '-';
    const beschreibung = String(transaktion.beschreibung || '').trim();
    const summaryParts = [`${icon} ${betragText}`, `am ${datum}`];
    const aktuellerRestwert = Number(wg.restwert !== undefined ? wg.restwert : wg.wert || 0);
    const aktuellerRestwertText = `${aktuellerRestwert.toFixed(2).replace('.', ',')} €`;
    if (beschreibung) summaryParts.push(beschreibung);

    if (idLabel) idLabel.textContent = `ID: #${displayId || '-'}`;
    if (nameLabel) nameLabel.textContent = String(wg.name || '').trim() || `#${displayId || '-'}`;
    if (summaryLabel) summaryLabel.textContent = summaryParts.join(' · ');
    if (currentValueLabel) currentValueLabel.textContent = `Aktueller Wert: ${aktuellerRestwertText}`;
    if (checkbox) checkbox.checked = false;

    transaktionVerificationModalState.wertguthabenId = wertguthabenId;
    transaktionVerificationModalState.transaktionId = transaktion.id;
    transaktionVerificationModalState.transaktion = { ...transaktion };
    updateTransaktionVerificationConfirmState();

    modal.style.display = 'flex';
}

async function saveTransaktionVerification() {
    const wertguthabenId = transaktionVerificationModalState.wertguthabenId;
    const transaktionId = transaktionVerificationModalState.transaktionId;
    const wg = WERTGUTHABEN[wertguthabenId];

    if (!wertguthabenId || !transaktionId || !wg) {
        return alertUser('Verifizierungsdaten fehlen.', 'error');
    }

    if (isUnassignedWertguthabenEntry(wg)) {
        return alertUser('Betragsverifizierung ist für „Nicht zugeordnete Elemente“ nicht möglich.', 'warning');
    }

    if (wg.typ === 'aktionscode') {
        return alertUser('Für Aktionscodes ist keine Betragsverifizierung verfügbar.', 'warning');
    }

    try {
        const latestVerifiableTransaktionId = await getLatestVerifiableHistoryTransaktionId(wertguthabenId, wg.typ);
        if (!latestVerifiableTransaktionId || latestVerifiableTransaktionId !== transaktionId) {
            return alertUser('Nur der neueste Transaktionseintrag kann verifiziert werden.', 'warning');
        }

        const transaktionRef = doc(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen', transaktionId);
        const transaktionDoc = await getDoc(transaktionRef);
        if (!transaktionDoc.exists()) {
            return alertUser('Transaktion nicht gefunden!', 'error');
        }

        if (transaktionDoc.data()?.betragVerifiziert) {
            return alertUser('Der neueste Transaktionseintrag ist bereits verifiziert.', 'info');
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

        const updatedWertguthabenDoc = await getDoc(wertguthabenRef);
        if (updatedWertguthabenDoc.exists()) {
            WERTGUTHABEN[wertguthabenId] = {
                ...updatedWertguthabenDoc.data(),
                id: wertguthabenId
            };
        }

        closeTransaktionVerificationModal();
        alertUser('Transaktion verifiziert!', 'success');

        if (document.getElementById('wertguthabenDetailsModal')?.style.display === 'flex') {
            await window.openWertguthabenDetails(wertguthabenId);
        }
    } catch (error) {
        console.error('Fehler bei der Verifizierung der Transaktion:', error);
        alertUser('Fehler beim Verifizieren: ' + error.message, 'error');
    }
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
    const source = document.getElementById('transaktionOpenSource').value || 'dashboard';
    const typ = document.getElementById('transaktionTyp').value;
    const betrag = Number.parseFloat(document.getElementById('transaktionBetrag').value || '0') || 0;
    const einloesungAnzahlRaw = Number.parseFloat(String(document.getElementById('transaktionEinloesungAnzahl')?.value || '').replace(',', '.'));
    const einloesungAnzahl = Number.isFinite(einloesungAnzahlRaw) ? einloesungAnzahlRaw : 0;
    const bestellnr = document.getElementById('transaktionBestellnr').value.trim();
    const rechnungsnr = document.getElementById('transaktionRechnungsnr').value.trim();
    const beschreibung = document.getElementById('transaktionBeschreibung').value.trim();

    const wg = WERTGUTHABEN[wertguthabenId];
    if (!wg) {
        return alertUser('Credit Wallet nicht gefunden!', 'error');
    }

    if (isUnassignedWertguthabenEntry(wg)) {
        return alertUser('Transaktion buchen ist für „Nicht zugeordnete Elemente“ nicht möglich.', 'warning');
    }

    if (source === 'einloese' && einloeseSelectionState.requiresListConfirmation && !einloeseSelectionState.confirmationGranted) {
        return alertUser('Bitte zuerst den Fremdlisten-Hinweis bestätigen.', 'warning');
    }

    if (typ === 'einloesung' && wg.typ !== 'aktionscode') {
        return alertUser('Einlösung ist nur für Aktionscodes möglich.', 'error');
    }

    if (typ === 'einloesung') {
        const maxEinloesungen = transaktionModalState.maxEinloesungen;
        const bereitsEingeloest = transaktionModalState.bereitsEingeloest;
        const availableEinloesungen = maxEinloesungen > 0 ? Math.max(0, maxEinloesungen - bereitsEingeloest) : Number.POSITIVE_INFINITY;
        if (maxEinloesungen > 0 && bereitsEingeloest >= maxEinloesungen) {
            return alertUser('Keine Einlösungen mehr verfügbar! Der Aktionscode ist bereits vollständig eingelöst.', 'error');
        }

        if (!Number.isInteger(einloesungAnzahl) || einloesungAnzahl <= 0) {
            return alertUser('Bitte eine gültige Einlösemenge größer als 0 eingeben.', 'error');
        }

        if (maxEinloesungen > 0 && einloesungAnzahl > availableEinloesungen) {
            return alertUser(`Nicht genug Einlösungen verfügbar! Maximal möglich: ${availableEinloesungen}`, 'error');
        }

        try {
            const transaktionenRef = collection(db, 'artifacts', appId, 'public', 'data', 'wertguthaben', wertguthabenId, 'transaktionen');
            await addDoc(transaktionenRef, {
                typ: 'einloesung',
                anzahl: einloesungAnzahl,
                betrag: 0,
                datum: serverTimestamp(),
                bestellnr,
                rechnungsnr,
                beschreibung: beschreibung || (einloesungAnzahl === 1 ? 'Aktionscode eingelöst' : `Aktionscode ${einloesungAnzahl}x eingelöst`),
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode
            });

            await clearTransaktionVerificationStatuses(wertguthabenId);

            const neueEinloesungen = bereitsEingeloest + einloesungAnzahl;
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

        alertUser('Transaktion erfolgreich gebucht!', 'success');
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

        const wgEntry = WERTGUTHABEN[wertguthabenId];
        if (wgEntry && isUnassignedWertguthabenEntry(wgEntry)) {
            return alertUser('Betragsverifizierung ist für „Nicht zugeordnete Elemente“ nicht möglich.', 'warning');
        }

        const wgTyp = String(WERTGUTHABEN[wertguthabenId]?.typ || '').trim();
        const latestVerifiableTransaktionId = await getLatestVerifiableHistoryTransaktionId(wertguthabenId, wgTyp);
        if (!latestVerifiableTransaktionId || latestVerifiableTransaktionId !== transaktionId) {
            return alertUser('Nur der neueste Transaktionseintrag kann verifiziert werden.', 'warning');
        }

        if (transaktionDoc.data()?.betragVerifiziert) {
            return alertUser('Der neueste Transaktionseintrag ist bereits verifiziert.', 'info');
        }

        openTransaktionVerificationModal(wertguthabenId, {
            id: transaktionDoc.id,
            ...transaktionDoc.data()
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

window.openWertguthabenDetails = async function(id, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const wg = opts.entry
        ? { ...opts.entry, id: opts.entry.id || id }
        : (WERTGUTHABEN[id] || ARCHIVED_WERTGUTHABEN[id]);
    if (!wg) return;

    const effectiveId = String(wg.id || id || '').trim();
    const readOnly = !!opts.readOnly || wg.archiviert === true;
    wertguthabenDetailsState.readOnly = readOnly;
    wertguthabenDetailsState.entryId = effectiveId;
    wertguthabenDetailsState.entry = { ...wg, id: effectiveId };

    const typConfig = TYP_CONFIG[wg.typ] || TYP_CONFIG.guthaben;
    const eigentuemerName = USERS[wg.eigentuemer]?.name || wg.eigentuemer || 'Unbekannt';
    const restzeit = wg.typ === 'aktionscode' ? calculateRestzeit(wg.gueltigBis) : calculateRestzeit(wg.einloesefrist);
    const restwert = wg.restwert !== undefined ? wg.restwert : wg.wert || 0;
    const ursprungswert = wg.wert || 0;
    const archivedMeta = wg.archiviert === true
        ? `Archiviert am ${formatDateTime(wg.archiviertAm) || '-'} von ${getDisplayUserName(wg.archiviertVon)}${wg.archivGrund ? ` · Grund: ${wg.archivGrund}` : ''}`
        : '';

    const content = document.getElementById('wertguthabenDetailsContent');
    content.innerHTML = `
        ${readOnly ? `<div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">Archivierter Eintrag · Nur Lesen</div>` : ''}
        <div class="grid grid-cols-2 gap-4">
            <div>
                <p class="text-sm font-bold text-gray-600">Eigentümer</p>
                <p class="text-lg">${escapeHtml(eigentuemerName)}</p>
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
                <p class="text-lg font-semibold">${escapeHtml(wg.name || '-')}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">ID</p>
                <p class="text-lg font-mono font-bold">#${escapeHtml(getWertguthabenDisplayId(wg))}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Kategorie</p>
                <p class="text-lg">${escapeHtml(normalizeWertguthabenKategorie(wg.kategorie, { preserveUnknown: true }))}</p>
            </div>
            <div>
                <p class="text-sm font-bold text-gray-600">Unternehmen</p>
                <p class="text-lg">${escapeHtml(wg.unternehmen || '-')}</p>
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
            ${wg.warnung ? `<div><p class="text-sm font-bold text-gray-600">Warnung</p><p>${escapeHtml(String(wg.warnung))} Tage vor Ablauf</p></div>` : ''}
        </div>
        ${archivedMeta ? `<div class="mt-4 p-4 bg-red-50 rounded-lg border border-red-200"><p class="text-sm font-bold text-red-800 mb-1">🗃 Archiv-Information</p><p class="text-sm text-red-900">${escapeHtml(archivedMeta)}</p></div>` : ''}
        ${wg.bedingungen ? `
            <div class="mt-4 p-4 bg-blue-50 rounded-lg">
                <p class="text-sm font-bold text-blue-800 mb-2">📋 Bedingungen</p>
                <p class="text-sm whitespace-pre-wrap">${escapeHtml(wg.bedingungen)}</p>
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
                    <div><span class="font-bold">Kontogebunden:</span> ${wg.kontogebunden === 'ja' ? 'Ja' + (wg.konto ? ' (' + escapeHtml(wg.konto) + ')' : '') : (wg.kontogebunden === 'unbekannt' ? 'Unbekannt' : 'Nein')}</div>
                    <div><span class="font-bold">Nur Neukunden:</span> ${wg.neukunde === 'ja' ? 'Ja' : (wg.neukunde === 'unbekannt' ? 'Unbekannt' : 'Nein')}</div>
                    <div><span class="font-bold">Kombinierbar:</span> ${wg.kombinierbar === 'ja' ? 'Ja' : (wg.kombinierbar === 'unbekannt' ? 'Unbekannt' : 'Nein')}</div>
                    ${wg.kategorien ? `<div class="col-span-2"><span class="font-bold">Kategorien:</span> ${escapeHtml(wg.kategorien)}</div>` : ''}
                    ${wg.ausnahmen ? `<div class="col-span-2"><span class="font-bold">Ausnahmen:</span> ${escapeHtml(wg.ausnahmen)}</div>` : ''}
                    ${wg.quelle ? `<div class="col-span-2"><span class="font-bold">Quelle:</span> ${escapeHtml(wg.quelle)}</div>` : ''}
                </div>
            </div>
        ` : ''}
        ${wg.notizen ? `
            <div class="mt-4 p-4 bg-gray-50 rounded-lg">
                <p class="text-sm font-bold text-gray-700 mb-2">📝 Notizen</p>
                <p class="text-sm whitespace-pre-wrap">${escapeHtml(wg.notizen)}</p>
            </div>
        ` : ''}
    `;

    const transaktionen = await loadTransaktionen(effectiveId);
    const sortedTransaktionen = [...transaktionen].sort((a, b) => {
        const aSystem = isStartguthabenTransaktion(a);
        const bSystem = isStartguthabenTransaktion(b);
        if (aSystem !== bSystem) return aSystem ? -1 : 1;
        return getTransaktionSortTimestamp(a) - getTransaktionSortTimestamp(b);
    });
    const latestVerifiableTransaktionId = getLatestVerifiableHistoryTransaktionIdFromEntries(sortedTransaktionen, wg.typ);
    const transaktionsList = document.getElementById('transaktionsList');

    if (sortedTransaktionen.length === 0) {
        transaktionsList.innerHTML = '<p class="text-center text-gray-400 italic py-4">Noch keine Transaktionen vorhanden.</p>';
    } else {
        transaktionsList.innerHTML = sortedTransaktionen.map((t) => {
            const datum = formatDateTime(t.datum || t.createdAt || t.updatedAt) || '-';
            const transaktionBetrag = Number(t.betrag || 0);
            const isKorrektur = t.typ === 'korrektur';
            const isStartguthaben = isStartguthabenTransaktion(t);
            const einloesungAnzahl = getTransaktionEinloesungAnzahl(t);
            const isUnassignedEntry = isUnassignedWertguthabenEntry(wg);
            const icon = t.typ === 'verwendung' ? '📉' : (t.typ === 'einloesung' ? '🎟️' : (isKorrektur ? '🛠️' : '📈'));
            const colorClass = t.typ === 'verwendung'
                ? 'text-red-600'
                : (t.typ === 'einloesung' ? 'text-pink-600' : (isKorrektur ? 'text-amber-700' : 'text-green-600'));
            const betragText = t.typ === 'verwendung'
                ? `- ${Math.abs(transaktionBetrag).toFixed(2)} €`
                : (t.typ === 'einloesung'
                    ? `${einloesungAnzahl}x Einlösung`
                    : (isKorrektur
                        ? `${transaktionBetrag >= 0 ? '+' : '-'} ${Math.abs(transaktionBetrag).toFixed(2)} € (Korrektur)`
                        : `+ ${Math.abs(transaktionBetrag).toFixed(2)} €`));
            const canEdit = !readOnly
                && !isUnassignedEntry
                && isVerifiableHistoryTransaktionCandidate(t, wg.typ)
                && latestVerifiableTransaktionId === t.id
                && !t.betragVerifiziert;
            const canDelete = !readOnly && !isStartguthaben;
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
                            ${t.beschreibung ? `<p class="text-sm text-gray-600 mb-1">${escapeHtml(t.beschreibung)}</p>` : ''}
                            ${isStartguthaben ? '<div class="mb-1 text-xs font-semibold text-amber-700">🔒 Systemeintrag</div>' : ''}
                            <div class="flex gap-3 text-xs text-gray-500">
                                ${t.bestellnr ? `<span>📦 Best.-Nr: ${escapeHtml(t.bestellnr)}</span>` : ''}
                                ${t.rechnungsnr ? `<span>🧾 Rech.-Nr: ${escapeHtml(t.rechnungsnr)}</span>` : ''}
                            </div>
                            ${verifyInfo ? `<div class="mt-1 text-xs font-semibold text-emerald-700">${escapeHtml(verifyInfo)}</div>` : ''}
                        </div>
                        <div class="ml-2 flex items-center gap-1">
                            ${canEdit ? `<span class="text-xs font-semibold text-blue-700">Verifizieren</span><button onclick="window.openEditTransaktionFromHistory('${effectiveId}', '${t.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="Transaktion verifizieren">✅</button>` : ''}
                            ${canDelete ? `<button onclick="deleteTransaktion('${effectiveId}', '${t.id}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Transaktion löschen">🗑️</button>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    const detailsModal = document.getElementById('wertguthabenDetailsModal');
    const addTransaktionBtn = document.getElementById('addTransaktionBtn');
    const copyBtn = document.getElementById('copyWertguthabenBtn');
    const archiveBtn = document.getElementById('deleteWertguthabenBtn');
    const editBtn = document.getElementById('editWertguthabenDetailsBtn');
    const moreBtn = document.getElementById('wertguthabenDetailsMoreBtn');
    const detailsFooter = addTransaktionBtn?.parentElement || null;
    const isUnassignedEntry = isUnassignedWertguthabenEntry(wg);
    closeWertguthabenDetailsMoreMenu();

    if (addTransaktionBtn) {
        addTransaktionBtn.dataset.wertguthabenId = effectiveId;
        addTransaktionBtn.disabled = !!(readOnly || isUnassignedEntry);
        addTransaktionBtn.classList.toggle('opacity-50', !!(readOnly || isUnassignedEntry));
        addTransaktionBtn.classList.toggle('cursor-not-allowed', !!(readOnly || isUnassignedEntry));
        addTransaktionBtn.title = isUnassignedEntry ? 'Für „Nicht zugeordnete Elemente“ nicht verfügbar' : 'Transaktion buchen';
        addTransaktionBtn.onclick = () => {
            if (readOnly || isUnassignedEntry) return;
            closeWertguthabenDetailsMoreMenu();
            detailsModal.style.display = 'none';
            window.openTransaktionModal(effectiveId, { source: 'dashboard' });
        };
    }

    if (editBtn) {
        editBtn.onclick = () => {
            if (readOnly) return;
            closeWertguthabenDetailsMoreMenu();
            detailsModal.style.display = 'none';
            window.openEditWertguthaben(effectiveId);
        };
    }

    if (copyBtn) {
        copyBtn.disabled = !!readOnly;
        copyBtn.classList.toggle('opacity-50', !!readOnly);
        copyBtn.classList.toggle('cursor-not-allowed', !!readOnly);
        copyBtn.title = 'Kopieren';
        copyBtn.onclick = () => {
            if (readOnly) return;
            closeWertguthabenDetailsMoreMenu();
            detailsModal.style.display = 'none';
            openCreateModal({
                copyFromEntry: {
                    ...wg,
                    id: effectiveId
                }
            });
        };
    }

    if (archiveBtn) {
        archiveBtn.textContent = 'Archivieren';
        archiveBtn.disabled = !!(readOnly || isUnassignedEntry);
        archiveBtn.classList.toggle('opacity-50', !!(readOnly || isUnassignedEntry));
        archiveBtn.classList.toggle('cursor-not-allowed', !!(readOnly || isUnassignedEntry));
        archiveBtn.title = isUnassignedEntry ? 'Für „Nicht zugeordnete Elemente“ nicht verfügbar' : 'Archivieren';
        archiveBtn.onclick = async () => {
            if (readOnly || isUnassignedEntry) return;
            closeWertguthabenDetailsMoreMenu();
            await window.archiveWertguthaben(effectiveId);
        };
    }

    if (moreBtn) {
        moreBtn.disabled = !!readOnly;
        moreBtn.classList.toggle('opacity-50', !!readOnly);
        moreBtn.classList.toggle('cursor-not-allowed', !!readOnly);
        moreBtn.title = 'Weitere Aktionen';
    }

    if (detailsFooter) {
        detailsFooter.classList.toggle('hidden', readOnly);
    }

    detailsModal.style.display = 'flex';
};

function renderCompactDashboardCell(value, className = '') {
    const text = String(value ?? '-').trim() || '-';
    return `<div class="overflow-hidden break-words leading-tight ${className}" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escapeHtml(text)}</div>`;
}

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
    const newListInput = document.getElementById('new-wg-liste-input');
    if (newCategoryInput) newCategoryInput.value = '';
    if (newListInput) newListInput.value = '';
    renderWertguthabenListenSettingsList();
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

    const addListeBtn = document.getElementById('btn-add-wg-liste');
    if (addListeBtn && !addListeBtn.dataset.listenerAttached) {
        addListeBtn.addEventListener('click', addWertguthabenListeFromSettings);
        addListeBtn.dataset.listenerAttached = 'true';
    }

    if (newCategoryInput && !newCategoryInput.dataset.enterListenerAttached) {
        newCategoryInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addWertguthabenKategorieFromSettings();
        });
        newCategoryInput.dataset.enterListenerAttached = 'true';
    }

    if (newListInput && !newListInput.dataset.enterListenerAttached) {
        newListInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addWertguthabenListeFromSettings();
        });
        newListInput.dataset.enterListenerAttached = 'true';
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
    const aktionscodeInput = document.getElementById('settings-warning-aktionscode');
    const aktionscode = aktionscodeInput
        ? (parseInt(aktionscodeInput.value) || 7)
        : (wertguthabenSettings.defaultWarnings?.aktionscode || 7);

    // Einstellungen aktualisieren
    wertguthabenSettings.defaultWarnings = {
        gutschein,
        guthaben,
        wertguthaben,
        wertguthaben_gesetzlich,
        aktionscode
    };
    wertguthabenSettings.kategorien = sanitizeWertguthabenKategorien(wertguthabenSettings.kategorien);
    const normalizedListen = sanitizeWertguthabenListen(wertguthabenSettings.listen, wertguthabenSettings.defaultListId);
    wertguthabenSettings.listen = normalizedListen.listen;
    wertguthabenSettings.defaultListId = normalizedListen.defaultListId;

    // In Firebase speichern (geräteübergreifend)
    try {
        if (!await persistWertguthabenSettings()) {
            return;
        }
        renderWertguthabenListenSettingsList();
        renderWertguthabenListSelector();
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
        applyWertguthabenSettings(getUserSetting('wertguthabenSettings', null));
        console.log('✅ Credit-Wallet-Einstellungen geladen:', wertguthabenSettings);
    } catch (error) {
        console.warn('Konnte Einstellungen nicht laden:', error);
    }
}

async function ensureAllEntriesHaveValidKategorie() {
    const updates = Object.values(WERTGUTHABEN)
        .filter((entry) => shouldNormalizeWertguthabenKategorieInFirestore(entry.kategorie))
        .map((entry) => normalizeKategorieInFirestore(entry.id, normalizeWertguthabenKategorie(entry.kategorie)));

    await Promise.all(updates);
}

// Transaktion löschen
window.deleteTransaktion = async function(wertguthabenId, transaktionId) {
    const wg = WERTGUTHABEN[wertguthabenId];
    if (!wg) {
        return alertUser('Credit Wallet nicht gefunden!', 'error');
    }

    // Sicherheitsabfrage
    const confirmDelete = confirm(
        `Möchten Sie diese Transaktion wirklich löschen?\n\n` +
        `Dadurch wird die Buchung rückgängig gemacht und der Status des Credit Wallets angepasst.\n\n` +
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
            updateData.bereitsEingeloest = Math.max(0, bereitsEingeloest - getTransaktionEinloesungAnzahl(gelöschteTransaktion));
            
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

