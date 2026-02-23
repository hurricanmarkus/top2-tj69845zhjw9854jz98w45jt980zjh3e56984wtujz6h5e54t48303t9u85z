// ========================================
// SENDUNGSVERWALTUNG SYSTEM
// ========================================

import {
    alertUser,
    db,
    currentUser,
    navigate,
    appId,
    usersCollectionRef
} from './haupteingang.js';
import { saveUserSetting, getUserSetting, userSettings } from './log-InOut.js';
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
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let sendungenCollectionRef = null;
let SENDUNGEN = {};
let activeFilters = [];
let sendungSearchJoinMode = 'and';
let currentTab = 'empfang';
let unsubscribeSendungen = null;
let currentEditingSendungId = null;
let isSendungModalReadMode = false;
let sendungShowDetails = false;
let sendungViewMode = 'list';
let unsubscribeSendungSettings = null;

const SENDUNG_FILTER_LABELS = {
    all: 'Alles',
    status: 'Status',
    anbieter: 'Anbieter',
    produkt: 'Produkt',
    absender: 'Absender',
    empfaenger: 'Empfänger',
    prioritaet: 'Priorität',
    tag: 'Tag',
    bestellnummer: 'Bestellnummer'
};

const SENDUNG_SUGGESTION_ICONS = {
    all: '🔍',
    status: '📊',
    anbieter: '🏢',
    produkt: '📦',
    absender: '📤',
    empfaenger: '📥',
    prioritaet: '🚩',
    tag: '🏷️',
    bestellnummer: '#️⃣'
};

const SENDUNG_SETTING_KEYS = {
    showDetails: 'sv_dashboard_show_details',
    viewMode: 'sv_dashboard_view_mode'
};

const STATUS_CONFIG = {
    erwartet: { label: 'Erwartet', icon: '⏳', color: 'bg-blue-100 text-blue-800' },
    unterwegs: { label: 'Unterwegs', icon: '🚚', color: 'bg-yellow-100 text-yellow-800' },
    zugestellt: { label: 'Zugestellt', icon: '✅', color: 'bg-green-100 text-green-800' },
    problem: { label: 'Problem', icon: '⚠️', color: 'bg-red-100 text-red-800' },
    storniert: { label: 'Storniert', icon: '❌', color: 'bg-gray-100 text-gray-800' }
};

const TYP_CONFIG = {
    empfang: { label: 'Empfang', icon: '📥', color: 'text-blue-600' },
    versand: { label: 'Versand', icon: '📤', color: 'text-orange-600' },
    ruecksendung: { label: 'Rücksendung', icon: '🔄', color: 'text-purple-600' }
};

const PRIORITAET_CONFIG = {
    normal: { label: 'Normal', icon: '', badge: '' },
    hoch: { label: 'Hoch', icon: '⚡', badge: 'bg-orange-100 text-orange-800' },
    dringend: { label: 'Dringend', icon: '🚨', badge: 'bg-red-100 text-red-800' }
};

export function initializeSendungsverwaltungView() {
    if (!currentUser || !currentUser.mode) {
        console.log('[Sendungsverwaltung] User nicht geladen');
        return;
    }

    const rootPath = `/artifacts/${appId}/public/data`;
    sendungenCollectionRef = collection(db, `${rootPath}/sendungen`);

    setupEventListeners();
    setupTabs();
    loadSendungDisplaySettings();
    applySendungDisplaySettingsUI();
    addDefaultFilters();
    listenForSendungSettingsSync();
    // Listener erst starten, nachdem sendungenCollectionRef gesetzt wurde.
    // Sonst werden neue Einträge zwar gespeichert, aber nicht in SENDUNGEN geladen.
    listenForSendungen();
    applyFiltersAndRender();
}

function setupTabs() {
    const tabs = document.querySelectorAll('.sendung-tab');
    tabs.forEach(tab => {
        tab.onclick = () => switchTab(tab.dataset.tab);
    });
}

function switchTab(tabName) {
    currentTab = tabName;
    
    const tabs = document.querySelectorAll('.sendung-tab');
    const dashboards = document.querySelectorAll('.sendung-dashboard');
    
    tabs.forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('border-b-4', isActive);
        tab.classList.toggle('text-gray-500', !isActive);
        
        if (tabName === 'empfang' && isActive) {
            tab.classList.add('text-blue-600', 'border-blue-600');
            tab.classList.remove('text-orange-600', 'border-orange-600', 'text-purple-600', 'border-purple-600');
        } else if (tabName === 'versand' && isActive) {
            tab.classList.add('text-orange-600', 'border-orange-600');
            tab.classList.remove('text-blue-600', 'border-blue-600', 'text-purple-600', 'border-purple-600');
        } else if (tabName === 'ruecksendung' && isActive) {
            tab.classList.add('text-purple-600', 'border-purple-600');
            tab.classList.remove('text-blue-600', 'border-blue-600', 'text-orange-600', 'border-orange-600');
        }
    });
    
    dashboards.forEach(dashboard => {
        const shouldShow = dashboard.id === `dashboard${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
        dashboard.classList.toggle('hidden', !shouldShow);
    });
    
    applyFiltersAndRender();
}

function addDefaultFilters() {
    if (activeFilters.length > 0) {
        return;
    }
    
    activeFilters.push({
        category: 'status',
        value: 'zugestellt',
        negate: true,
        isDefault: true,
        label: 'Status',
        id: Date.now()
    });
    activeFilters.push({
        category: 'status',
        value: 'storniert',
        negate: true,
        isDefault: true,
        label: 'Status',
        id: Date.now() + 1
    });
    renderActiveFilters();
}

function setupEventListeners() {
    const openSendungModalBtn = document.getElementById('openSendungModalBtn');
    const closeSendungModal = document.getElementById('closeSendungModal');
    const cancelSendungBtn = document.getElementById('cancelSendungBtn');
    const saveSendungBtn = document.getElementById('saveSendungBtn');
    const deleteSendungBtn = document.getElementById('deleteSendungBtn');
    const editSendungBtn = document.getElementById('editSendungBtn');
    const duplicateSendungBtn = document.getElementById('duplicateSendungBtn');
    const sendungToggleDetailsBtn = document.getElementById('sendungToggleDetailsBtn');
    const sendungToggleViewBtn = document.getElementById('sendungToggleViewBtn');
    const sendungToggleFilterControls = document.getElementById('sendungToggleFilterControls');
    const addFilterBtn = document.getElementById('sendungAddFilterBtn');
    const sendungResetFiltersBtn = document.getElementById('sendungResetFiltersBtn');
    const sendungFilterJoinMode = document.getElementById('sendungFilterJoinMode');
    const sendungTyp = document.getElementById('sendungTyp');
    const sendungErinnerungenAktiv = document.getElementById('sendungErinnerungenAktiv');

    if (openSendungModalBtn) {
        openSendungModalBtn.onclick = () => openSendungModal();
    }

    if (closeSendungModal) {
        closeSendungModal.onclick = () => closeSendungModalUI();
    }

    if (cancelSendungBtn) {
        cancelSendungBtn.onclick = () => closeSendungModalUI();
    }

    if (saveSendungBtn) {
        saveSendungBtn.onclick = () => saveSendung();
    }

    if (deleteSendungBtn) {
        deleteSendungBtn.onclick = () => deleteSendung();
    }

    if (editSendungBtn) {
        editSendungBtn.onclick = () => enableSendungEditMode();
    }

    if (duplicateSendungBtn) {
        duplicateSendungBtn.onclick = () => duplicateCurrentSendungToNew();
    }

    if (sendungToggleDetailsBtn) {
        sendungToggleDetailsBtn.onclick = () => toggleSendungDetailsVisibility();
    }

    if (sendungToggleViewBtn) {
        sendungToggleViewBtn.onclick = () => toggleSendungViewMode();
    }

    if (sendungToggleFilterControls) {
        sendungToggleFilterControls.onclick = () => {
            const wrapper = document.getElementById('sendungFilterControlsWrapper');
            const icon = document.getElementById('sendungToggleFilterIcon');
            if (!wrapper || !icon) return;
            wrapper.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        };
    }

    if (addFilterBtn) {
        addFilterBtn.onclick = () => addFilter();
    }

    if (sendungResetFiltersBtn) {
        sendungResetFiltersBtn.onclick = () => resetFilters();
    }

    if (sendungFilterJoinMode) {
        sendungFilterJoinMode.onchange = (e) => {
            sendungSearchJoinMode = e.target.value === 'or' ? 'or' : 'and';
            applyFiltersAndRender();
        };
    }

    const searchInput = document.getElementById('sendungSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = String(e.target.value || '');
            if (!term.trim()) {
                hideSendungSearchSuggestions();
                return;
            }
            updateSendungSearchSuggestions(term);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addFilter();
            }
        });
        searchInput.addEventListener('focus', (e) => {
            const term = String(e.target.value || '').trim();
            if (term) updateSendungSearchSuggestions(term);
        });
    }

    if (!document.body.dataset.sendungSuggestionsListenerAttached) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#sendungSearchInput') && !e.target.closest('#sendungSearchSuggestionsBox')) {
                hideSendungSearchSuggestions();
            }
        });
        document.body.dataset.sendungSuggestionsListenerAttached = 'true';
    }

    if (sendungTyp) {
        sendungTyp.onchange = (e) => {
            const ruecksendungSection = document.getElementById('ruecksendungSection');
            if (ruecksendungSection) {
                ruecksendungSection.style.display = e.target.value === 'ruecksendung' ? 'block' : 'none';
            }
        };
    }

    if (sendungErinnerungenAktiv) {
        sendungErinnerungenAktiv.onchange = (e) => {
            const tageVorherSelect = document.getElementById('sendungErinnerungTageVorher');
            if (tageVorherSelect) {
                tageVorherSelect.disabled = !e.target.checked;
            }
        };
    }
}

function normalizeSendungViewMode(mode) {
    return mode === 'grid' ? 'grid' : 'list';
}

function loadSendungDisplaySettings() {
    const rawShowDetails = getUserSetting(SENDUNG_SETTING_KEYS.showDetails, false);
    const rawViewMode = getUserSetting(SENDUNG_SETTING_KEYS.viewMode, 'list');

    sendungShowDetails = rawShowDetails === true || rawShowDetails === 'true';
    sendungViewMode = normalizeSendungViewMode(rawViewMode);
}

function applySendungContainerLayout() {
    const container = document.getElementById('sendungenContainer');
    if (!container) return;

    container.classList.remove('space-y-3', 'grid', 'gap-3', 'md:grid-cols-2', 'xl:grid-cols-3');

    if (sendungViewMode === 'grid') {
        container.classList.add('grid', 'gap-3', 'md:grid-cols-2', 'xl:grid-cols-3');
    } else {
        container.classList.add('space-y-3');
    }
}

function applySendungDisplaySettingsUI() {
    const sendungToggleDetailsBtn = document.getElementById('sendungToggleDetailsBtn');
    if (sendungToggleDetailsBtn) {
        sendungToggleDetailsBtn.textContent = sendungShowDetails
            ? '🔍 Details ausblenden'
            : '🔍 Details anzeigen';
        sendungToggleDetailsBtn.classList.toggle('bg-amber-600', sendungShowDetails);
        sendungToggleDetailsBtn.classList.toggle('text-white', sendungShowDetails);
        sendungToggleDetailsBtn.classList.toggle('bg-gray-200', !sendungShowDetails);
        sendungToggleDetailsBtn.classList.toggle('text-gray-800', !sendungShowDetails);
    }

    const sendungToggleViewBtn = document.getElementById('sendungToggleViewBtn');
    if (sendungToggleViewBtn) {
        sendungToggleViewBtn.textContent = sendungViewMode === 'grid'
            ? '🔲 Ansicht: Kacheln'
            : '📋 Ansicht: Liste';
        sendungToggleViewBtn.classList.toggle('bg-blue-600', sendungViewMode === 'grid');
        sendungToggleViewBtn.classList.toggle('text-white', sendungViewMode === 'grid');
        sendungToggleViewBtn.classList.toggle('bg-gray-200', sendungViewMode !== 'grid');
        sendungToggleViewBtn.classList.toggle('text-gray-800', sendungViewMode !== 'grid');
    }

    applySendungContainerLayout();
}

async function toggleSendungDetailsVisibility() {
    sendungShowDetails = !sendungShowDetails;
    userSettings[SENDUNG_SETTING_KEYS.showDetails] = sendungShowDetails;
    applySendungDisplaySettingsUI();
    applyFiltersAndRender();
    await saveUserSetting(SENDUNG_SETTING_KEYS.showDetails, sendungShowDetails);
}

async function toggleSendungViewMode() {
    sendungViewMode = sendungViewMode === 'grid' ? 'list' : 'grid';
    userSettings[SENDUNG_SETTING_KEYS.viewMode] = sendungViewMode;
    applySendungDisplaySettingsUI();
    applyFiltersAndRender();
    await saveUserSetting(SENDUNG_SETTING_KEYS.viewMode, sendungViewMode);
}

function listenForSendungSettingsSync() {
    if (!usersCollectionRef || !currentUser?.mode) {
        return;
    }

    if (unsubscribeSendungSettings) {
        unsubscribeSendungSettings();
    }

    const userDocRef = doc(usersCollectionRef, currentUser.mode);

    unsubscribeSendungSettings = onSnapshot(userDocRef, (userDocSnap) => {
        if (!userDocSnap.exists()) {
            return;
        }

        const remoteSettings = userDocSnap.data()?.userSettings || {};
        const remoteShowDetails = remoteSettings[SENDUNG_SETTING_KEYS.showDetails] === true || remoteSettings[SENDUNG_SETTING_KEYS.showDetails] === 'true';
        const remoteViewMode = normalizeSendungViewMode(remoteSettings[SENDUNG_SETTING_KEYS.viewMode] || 'list');

        userSettings[SENDUNG_SETTING_KEYS.showDetails] = remoteShowDetails;
        userSettings[SENDUNG_SETTING_KEYS.viewMode] = remoteViewMode;

        if (remoteShowDetails === sendungShowDetails && remoteViewMode === sendungViewMode) {
            return;
        }

        sendungShowDetails = remoteShowDetails;
        sendungViewMode = remoteViewMode;
        applySendungDisplaySettingsUI();
        applyFiltersAndRender();
    }, (error) => {
        console.error('[Sendungsverwaltung] Listener-Fehler (Settings):', error);
    });
}

function addFilter(options = {}) {
    const searchInput = document.getElementById('sendungSearchInput');
    const negateCheckbox = document.getElementById('sendungFilterNegate');
    
    const rawValue = String((options.rawValue ?? searchInput?.value) || '').trim();
    const category = String(options.category || 'all');
    const negate = !!negateCheckbox?.checked;
    const value = rawValue.toLowerCase();
    
    if (!rawValue) {
        alertUser('Bitte Suchbegriff eingeben!', 'warning');
        return;
    }

    const duplicate = activeFilters.some((filter) => (
        !filter.isDefault &&
        filter.category === category &&
        String(filter.value || '').toLowerCase() === value &&
        !!filter.negate === negate
    ));
    if (duplicate) {
        if (searchInput) searchInput.value = '';
        if (negateCheckbox) negateCheckbox.checked = false;
        hideSendungSearchSuggestions();
        return;
    }
    
    activeFilters.push({
        category,
        value,
        rawValue,
        negate,
        isDefault: false,
        label: SENDUNG_FILTER_LABELS[category] || category,
        id: Date.now() + Math.floor(Math.random() * 1000)
    });
    
    if (searchInput) searchInput.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;
    hideSendungSearchSuggestions();
    
    renderActiveFilters();
    applyFiltersAndRender();
}

function removeFilter(filterId) {
    activeFilters = activeFilters.filter(f => f.id !== filterId);
    renderActiveFilters();
    applyFiltersAndRender();
}

function resetFilters() {
    activeFilters = [];
    sendungSearchJoinMode = 'and';
    addDefaultFilters();
    
    const searchInput = document.getElementById('sendungSearchInput');
    const negateCheckbox = document.getElementById('sendungFilterNegate');
    const joinMode = document.getElementById('sendungFilterJoinMode');
    
    if (searchInput) searchInput.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;
    if (joinMode) joinMode.value = 'and';
    hideSendungSearchSuggestions();
    
    applyFiltersAndRender();
}

function hideSendungSearchSuggestions() {
    document.getElementById('sendungSearchSuggestionsBox')?.classList.add('hidden');
}

function updateSendungSearchSuggestions(term) {
    const box = document.getElementById('sendungSearchSuggestionsBox');
    const list = document.getElementById('sendungSearchSuggestionsList');
    if (!box || !list) return;

    if (!term || !term.trim()) {
        list.innerHTML = '';
        box.classList.add('hidden');
        return;
    }

    const lowerTerm = term.toLowerCase().trim();
    const sendungen = Object.values(SENDUNGEN).filter((sendung) => sendung.typ === currentTab);
    list.innerHTML = '';

    const categories = ['status', 'anbieter', 'produkt', 'absender', 'empfaenger', 'prioritaet', 'tag', 'bestellnummer'];
    let hasHits = false;

    categories.forEach((category) => {
        const hasCategoryHit = sendungen.some((sendung) => doesSendungMatchSearchFilter(sendung, { category, value: lowerTerm }));
        if (!hasCategoryHit) return;

        hasHits = true;
        const li = document.createElement('li');
        li.className = 'px-3 py-2 hover:bg-amber-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
        li.innerHTML = `
            <span class="text-lg">${SENDUNG_SUGGESTION_ICONS[category] || '🔎'}</span>
            <div class="flex-grow leading-tight">
                <span class="font-bold text-gray-800 block">${SENDUNG_FILTER_LABELS[category] || category}: ${term}</span>
                <span class="text-xs text-gray-500">Filter in ${SENDUNG_FILTER_LABELS[category] || category}</span>
            </div>
        `;
        li.onclick = () => addFilter({ category, rawValue: term });
        list.appendChild(li);
    });

    const fallback = document.createElement('li');
    fallback.className = 'px-3 py-2 hover:bg-amber-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
    fallback.innerHTML = `
        <span class="text-lg">${SENDUNG_SUGGESTION_ICONS.all}</span>
        <div class="flex-grow leading-tight">
            <span class="font-bold text-gray-800 block">Alles: ${term}</span>
            <span class="text-xs text-gray-500">Volltextsuche</span>
        </div>
    `;
    fallback.onclick = () => addFilter({ category: 'all', rawValue: term });
    list.appendChild(fallback);

    box.classList.toggle('hidden', !hasHits);
}

function doesSendungMatchSearchFilter(sendung, filter) {
    const searchValue = String(filter?.value || '').toLowerCase();
    const category = String(filter?.category || '');

    if (category === 'all') {
        const tags = (sendung.tags || []).map((tag) => String(tag || '').toLowerCase());
        return String(sendung.status || '').toLowerCase().includes(searchValue) ||
            String(sendung.anbieter || '').toLowerCase().includes(searchValue) ||
            String(sendung.produkt || '').toLowerCase().includes(searchValue) ||
            String(sendung.absender || '').toLowerCase().includes(searchValue) ||
            String(sendung.empfaenger || '').toLowerCase().includes(searchValue) ||
            String(sendung.prioritaet || '').toLowerCase().includes(searchValue) ||
            String(sendung.bestellnummer || '').toLowerCase().includes(searchValue) ||
            tags.some((tag) => tag.includes(searchValue));
    }

    if (category === 'status') {
        return String(sendung.status || '').toLowerCase().includes(searchValue);
    }
    if (category === 'anbieter') {
        return String(sendung.anbieter || '').toLowerCase().includes(searchValue);
    }
    if (category === 'produkt') {
        return String(sendung.produkt || '').toLowerCase().includes(searchValue);
    }
    if (category === 'absender') {
        return String(sendung.absender || '').toLowerCase().includes(searchValue);
    }
    if (category === 'empfaenger') {
        return String(sendung.empfaenger || '').toLowerCase().includes(searchValue);
    }
    if (category === 'prioritaet') {
        return String(sendung.prioritaet || '').toLowerCase().includes(searchValue);
    }
    if (category === 'tag') {
        const tags = (sendung.tags || []).map((tag) => String(tag || '').toLowerCase());
        return tags.some((tag) => tag.includes(searchValue));
    }
    if (category === 'bestellnummer') {
        return String(sendung.bestellnummer || '').toLowerCase().includes(searchValue);
    }

    return false;
}

function renderActiveFilters() {
    const container = document.getElementById('sendungActiveFiltersContainer');
    if (!container) return;
    
    if (activeFilters.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 italic">Keine Filter aktiv</p>';
        return;
    }
    
    container.innerHTML = activeFilters.map(filter => `
        <div class="flex items-center gap-2 px-3 py-1.5 ${
            filter.negate 
                ? 'bg-red-100 text-red-800 border-red-300' 
                : 'bg-amber-100 text-amber-800 border-amber-300'
        } rounded-full text-sm font-medium border">
            ${filter.negate ? '<span class="font-bold text-red-600">NICHT</span>' : ''}
            <span class="font-bold">${filter.label}:</span>
            <span>${filter.rawValue || filter.value}</span>
            <button onclick="window.removeSendungFilter(${filter.id})" class="ml-1 ${
                filter.negate ? 'hover:bg-red-200' : 'hover:bg-amber-200'
            } rounded-full p-0.5 transition" title="Filter entfernen">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');
}

window.removeSendungFilter = removeFilter;

function openSendungModal(sendungId = null, copiedData = null) {
    currentEditingSendungId = sendungId;
    const modal = document.getElementById('sendungModal');
    const modalTitle = document.getElementById('sendungModalTitle');
    const deleteSendungBtn = document.getElementById('deleteSendungBtn');
    const editSendungBtn = document.getElementById('editSendungBtn');
    const duplicateSendungBtn = document.getElementById('duplicateSendungBtn');

    if (!modal) return;

    if (sendungId && SENDUNGEN[sendungId]) {
        modalTitle.textContent = '📦 Sendung ansehen';
        deleteSendungBtn.style.display = 'inline-block';
        if (editSendungBtn) editSendungBtn.style.display = 'inline-block';
        if (duplicateSendungBtn) duplicateSendungBtn.style.display = 'inline-block';
        fillModalWithSendungData(SENDUNGEN[sendungId]);
        setSendungModalReadMode(true);
    } else {
        modalTitle.textContent = '📦 Neue Sendung';
        deleteSendungBtn.style.display = 'none';
        if (editSendungBtn) editSendungBtn.style.display = 'none';
        if (duplicateSendungBtn) duplicateSendungBtn.style.display = 'none';
        clearModalFields();
        prefillIntelligentForm();
        if (copiedData) {
            fillModalWithSendungData(copiedData);
            modalTitle.textContent = '📦 Neue Sendung (Kopie)';
        }
        setSendungModalReadMode(false);
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function prefillIntelligentForm() {
    const typSelect = document.getElementById('sendungTyp');
    if (typSelect) {
        typSelect.value = currentTab;
    }
    
    const statusSelect = document.getElementById('sendungStatus');
    if (statusSelect) {
        if (currentTab === 'empfang') {
            statusSelect.value = 'erwartet';
        } else if (currentTab === 'versand') {
            statusSelect.value = 'erwartet';
        } else if (currentTab === 'ruecksendung') {
            statusSelect.value = 'erwartet';
        }
    }
    
    const ruecksendungSection = document.getElementById('ruecksendungSection');
    if (ruecksendungSection) {
        ruecksendungSection.style.display = currentTab === 'ruecksendung' ? 'block' : 'none';
    }
}

function closeSendungModalUI() {
    const modal = document.getElementById('sendungModal');
    const editSendungBtn = document.getElementById('editSendungBtn');
    const duplicateSendungBtn = document.getElementById('duplicateSendungBtn');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (editSendungBtn) {
        editSendungBtn.style.display = 'none';
    }
    if (duplicateSendungBtn) {
        duplicateSendungBtn.style.display = 'none';
    }
    setSendungModalReadMode(false);
    currentEditingSendungId = null;
    clearModalFields();
}

function setSendungModalReadMode(readMode) {
    const modal = document.getElementById('sendungModal');
    if (!modal) return;

    const formFields = modal.querySelectorAll('input, textarea, select');
    formFields.forEach(field => {
        if (field.id === 'sendungStatus') {
            field.disabled = false;
            return;
        }
        field.disabled = readMode;
    });

    if (!readMode) {
        const erinnerungenAktiv = document.getElementById('sendungErinnerungenAktiv');
        const tageVorherSelect = document.getElementById('sendungErinnerungTageVorher');
        if (tageVorherSelect) {
            tageVorherSelect.disabled = !(erinnerungenAktiv?.checked);
        }
    }

    const saveSendungBtn = document.getElementById('saveSendungBtn');
    if (saveSendungBtn) {
        saveSendungBtn.textContent = readMode ? 'Status speichern' : 'Speichern';
    }

    isSendungModalReadMode = readMode;
}

function enableSendungEditMode() {
    if (!currentEditingSendungId || !SENDUNGEN[currentEditingSendungId]) {
        alertUser('Keine Sendung zum Bearbeiten geöffnet.', 'warning');
        return;
    }

    const modalTitle = document.getElementById('sendungModalTitle');
    const editSendungBtn = document.getElementById('editSendungBtn');

    setSendungModalReadMode(false);
    if (modalTitle) modalTitle.textContent = '📦 Sendung bearbeiten';
    if (editSendungBtn) editSendungBtn.style.display = 'none';
    alertUser('Bearbeitungsmodus aktiviert.');
}

function clearModalFields() {
    const fields = {
        sendungTyp: 'empfang',
        sendungStatus: 'erwartet',
        sendungBeschreibung: '',
        sendungAnbieter: '',
        sendungTransportnummer: '',
        sendungProdukt: '',
        sendungPrioritaet: 'normal',
        sendungAbsender: '',
        sendungEmpfaenger: '',
        sendungDeadlineErwartet: '',
        sendungDeadlineVersand: '',
        sendungBestellnummer: '',
        sendungWert: '',
        sendungVersandkosten: '',
        sendungLagerort: '',
        sendungAufgeteiltIndex: '',
        sendungAufgeteiltAnzahl: '',
        sendungTags: '',
        sendungInhalt: '',
        sendungNotizen: '',
        sendungRuecksendungFrist: '',
        sendungRuecksendungGrund: ''
    };

    Object.entries(fields).forEach(([id, value]) => {
        const elem = document.getElementById(id);
        if (elem) elem.value = value;
    });

    const checkboxes = ['sendungErinnerungenAktiv', 'sendungRuecksendeEtikett'];
    checkboxes.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.checked = false;
    });

    const tageVorherSelect = document.getElementById('sendungErinnerungTageVorher');
    if (tageVorherSelect) {
        tageVorherSelect.value = '3';
        tageVorherSelect.disabled = true;
    }

    const ruecksendungSection = document.getElementById('ruecksendungSection');
    if (ruecksendungSection) ruecksendungSection.style.display = 'none';
}

function fillModalWithSendungData(sendung) {
    const fieldMapping = {
        sendungTyp: 'typ',
        sendungStatus: 'status',
        sendungBeschreibung: 'beschreibung',
        sendungAnbieter: 'anbieter',
        sendungTransportnummer: 'transportnummer',
        sendungProdukt: 'produkt',
        sendungPrioritaet: 'prioritaet',
        sendungAbsender: 'absender',
        sendungEmpfaenger: 'empfaenger',
        sendungBestellnummer: 'bestellnummer',
        sendungWert: 'wert',
        sendungVersandkosten: 'versandkosten',
        sendungLagerort: 'lagerort',
        sendungAufgeteiltIndex: 'aufgeteiltIndex',
        sendungAufgeteiltAnzahl: 'aufgeteiltAnzahl',
        sendungInhalt: 'inhalt',
        sendungNotizen: 'notizen',
        sendungRuecksendungGrund: 'ruecksendungGrund'
    };

    Object.entries(fieldMapping).forEach(([elemId, fieldKey]) => {
        const elem = document.getElementById(elemId);
        if (elem && sendung[fieldKey] !== undefined) {
            if (fieldKey === 'inhalt' && Array.isArray(sendung[fieldKey])) {
                elem.value = sendung[fieldKey].join('\n');
            } else {
                elem.value = sendung[fieldKey] || '';
            }
        }
    });

    const dateFields = {
        sendungDeadlineErwartet: 'deadlineErwartet',
        sendungDeadlineVersand: 'deadlineVersand',
        sendungRuecksendungFrist: 'ruecksendungFrist'
    };

    Object.entries(dateFields).forEach(([elemId, fieldKey]) => {
        const elem = document.getElementById(elemId);
        if (elem && sendung[fieldKey]) {
            elem.value = sendung[fieldKey];
        }
    });

    if (sendung.tags && Array.isArray(sendung.tags)) {
        const tagsInput = document.getElementById('sendungTags');
        if (tagsInput) tagsInput.value = sendung.tags.join(', ');
    }

    const erinnerungenAktiv = document.getElementById('sendungErinnerungenAktiv');
    if (erinnerungenAktiv) {
        erinnerungenAktiv.checked = sendung.erinnerungenAktiv || false;
        const tageVorher = document.getElementById('sendungErinnerungTageVorher');
        if (tageVorher) {
            tageVorher.disabled = !sendung.erinnerungenAktiv;
            tageVorher.value = sendung.erinnerungTageVorher || '3';
        }
    }

    const ruecksendeEtikett = document.getElementById('sendungRuecksendeEtikett');
    if (ruecksendeEtikett) {
        ruecksendeEtikett.checked = sendung.ruecksendeEtikett || false;
    }

    const ruecksendungSection = document.getElementById('ruecksendungSection');
    if (ruecksendungSection) {
        ruecksendungSection.style.display = sendung.typ === 'ruecksendung' ? 'block' : 'none';
    }
}

function duplicateCurrentSendungToNew() {
    if (!currentEditingSendungId || !SENDUNGEN[currentEditingSendungId]) {
        alertUser('Keine Sendung zum Kopieren gefunden.', 'warning');
        return;
    }

    const sourceSendung = { ...SENDUNGEN[currentEditingSendungId] };
    openSendungModal(null, sourceSendung);
    alertUser('Kopie geöffnet. Bitte prüfen und speichern.');
}

async function saveSendung() {
    const status = document.getElementById('sendungStatus')?.value || 'erwartet';

    if (currentEditingSendungId && isSendungModalReadMode) {
        try {
            const sendungRef = doc(sendungenCollectionRef, currentEditingSendungId);
            await updateDoc(sendungRef, {
                status,
                updatedAt: serverTimestamp()
            });
            alertUser('Status erfolgreich aktualisiert!');
            closeSendungModalUI();
        } catch (error) {
            console.error('[Sendungsverwaltung] Fehler beim Status-Update:', error);
            alertUser('Fehler beim Speichern des Status: ' + error.message);
        }
        return;
    }

    const beschreibung = document.getElementById('sendungBeschreibung')?.value.trim();
    const anbieter = document.getElementById('sendungAnbieter')?.value.trim();
    const transportnummer = document.getElementById('sendungTransportnummer')?.value.trim();

    if (!beschreibung) {
        alertUser('Bitte fülle das Pflichtfeld Beschreibung aus.');
        return;
    }
    
    const typ = document.getElementById('sendungTyp')?.value || 'empfang';

    const inhaltText = document.getElementById('sendungInhalt')?.value.trim() || '';
    const inhaltArray = inhaltText ? inhaltText.split('\n').map(i => i.trim()).filter(i => i) : [];

    const tagsText = document.getElementById('sendungTags')?.value.trim() || '';
    const tagsArray = tagsText ? tagsText.split(',').map(t => t.trim()).filter(t => t) : [];

    const sendungData = {
        typ: typ,
        status,
        beschreibung: beschreibung,
        anbieter: anbieter,
        transportnummer: transportnummer,
        produkt: document.getElementById('sendungProdukt')?.value.trim() || '',
        prioritaet: document.getElementById('sendungPrioritaet')?.value || 'normal',
        absender: document.getElementById('sendungAbsender')?.value.trim() || '',
        empfaenger: document.getElementById('sendungEmpfaenger')?.value.trim() || '',
        deadlineErwartet: document.getElementById('sendungDeadlineErwartet')?.value || null,
        deadlineVersand: document.getElementById('sendungDeadlineVersand')?.value || null,
        bestellnummer: document.getElementById('sendungBestellnummer')?.value.trim() || '',
        wert: parseFloat(document.getElementById('sendungWert')?.value) || 0,
        versandkosten: parseFloat(document.getElementById('sendungVersandkosten')?.value) || 0,
        lagerort: document.getElementById('sendungLagerort')?.value.trim() || '',
        aufgeteiltIndex: parseInt(document.getElementById('sendungAufgeteiltIndex')?.value) || null,
        aufgeteiltAnzahl: parseInt(document.getElementById('sendungAufgeteiltAnzahl')?.value) || null,
        tags: tagsArray,
        inhalt: inhaltArray,
        notizen: document.getElementById('sendungNotizen')?.value.trim() || '',
        erinnerungenAktiv: document.getElementById('sendungErinnerungenAktiv')?.checked || false,
        erinnerungTageVorher: parseInt(document.getElementById('sendungErinnerungTageVorher')?.value) || 3,
        ruecksendungFrist: document.getElementById('sendungRuecksendungFrist')?.value || null,
        ruecksendungGrund: document.getElementById('sendungRuecksendungGrund')?.value.trim() || '',
        ruecksendeEtikett: document.getElementById('sendungRuecksendeEtikett')?.checked || false,
        updatedAt: serverTimestamp()
    };

    try {
        let sendungId;
        if (currentEditingSendungId) {
            const sendungRef = doc(sendungenCollectionRef, currentEditingSendungId);
            await updateDoc(sendungRef, sendungData);
            sendungId = currentEditingSendungId;
            alertUser('Sendung erfolgreich aktualisiert!');
        } else {
            sendungData.createdBy = currentUser.mode;
            sendungData.createdAt = serverTimestamp();
            const docRef = await addDoc(sendungenCollectionRef, sendungData);
            sendungId = docRef.id;
            alertUser('Sendung erfolgreich erstellt!');
        }

        // Pushmail-Benachrichtigungen erstellen (nur für aktive Sendungen)
        const inaktiveStatus = ['zugestellt', 'storniert', 'verloren'];
        if (sendungData.erwarteteAnkunft && currentUser?.mode && !inaktiveStatus.includes(sendungData.status)) {
            const targetDate = new Date(sendungData.erwarteteAnkunft);
            const sendungName = `${sendungData.anbieter || 'Sendung'} (${sendungData.sendungsnummer || 'keine Nr.'})`;
            
            await createPendingNotification(
                currentUser.mode,
                'SENDUNGSVERWALTUNG',
                'x_tage_vor_ablauf_sendung',
                {
                    id: sendungId,
                    path: `/sendungen/${sendungId}`,
                    targetDate: targetDate,
                    sendungName: sendungName,
                    anbieter: sendungData.anbieter || 'Unbekannt',
                    sendungsnummer: sendungData.sendungsnummer || 'Keine',
                    ablaufDatum: targetDate.toLocaleDateString('de-DE')
                }
            );
        }

        closeSendungModalUI();
    } catch (error) {
        console.error('[Sendungsverwaltung] Fehler beim Speichern:', error);
        alertUser('Fehler beim Speichern der Sendung: ' + error.message);
    }
}

async function deleteSendung() {
    if (!currentEditingSendungId) return;

    const confirmationText = prompt('Zum endgültigen Löschen bitte "LÖSCHEN" eingeben:');
    if (confirmationText === null) return;

    if (confirmationText.trim() !== 'LÖSCHEN') {
        alertUser('Löschen abgebrochen: Eingabe war nicht "LÖSCHEN".', 'warning');
        return;
    }

    try {
        const sendungRef = doc(sendungenCollectionRef, currentEditingSendungId);
        await deleteDoc(sendungRef);
        alertUser('Sendung erfolgreich gelöscht!');
        closeSendungModalUI();
    } catch (error) {
        console.error('[Sendungsverwaltung] Fehler beim Löschen:', error);
        alertUser('Fehler beim Löschen der Sendung: ' + error.message);
    }
}

export function listenForSendungen() {
    if (!sendungenCollectionRef || !currentUser?.mode) {
        console.log('[Sendungsverwaltung] Collection nicht initialisiert');
        return;
    }

    if (unsubscribeSendungen) {
        unsubscribeSendungen();
    }

    const q = query(
        sendungenCollectionRef,
        where('createdBy', '==', currentUser.mode),
        orderBy('createdAt', 'desc')
    );

    unsubscribeSendungen = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            const id = change.doc.id;

            if (change.type === 'added' || change.type === 'modified') {
                SENDUNGEN[id] = { id, ...data };
            } else if (change.type === 'removed') {
                delete SENDUNGEN[id];
            }
        });

        applyFiltersAndRender();
    }, (error) => {
        console.error('[Sendungsverwaltung] Listener-Fehler:', error);
    });
}

export function stopSendungsverwaltungListeners() {
    if (unsubscribeSendungen) {
        unsubscribeSendungen();
        unsubscribeSendungen = null;
    }

    if (unsubscribeSendungSettings) {
        unsubscribeSendungSettings();
        unsubscribeSendungSettings = null;
    }

    SENDUNGEN = {};
}

function applyFiltersAndRender() {
    let filtered = Object.values(SENDUNGEN);
    
    filtered = filtered.filter(s => s.typ === currentTab);

    if (activeFilters.length > 0) {
        const evaluateFilter = (sendung, filter) => {
            const matches = doesSendungMatchSearchFilter(sendung, filter);
            return filter.negate ? !matches : matches;
        };

        const defaultFilters = activeFilters.filter((filter) => !!filter.isDefault);
        const userFilters = activeFilters.filter((filter) => !filter.isDefault);

        filtered = filtered.filter((sendung) => {
            const defaultsMatch = defaultFilters.every((filter) => evaluateFilter(sendung, filter));
            if (!defaultsMatch) return false;

            if (userFilters.length === 0) return true;

            return sendungSearchJoinMode === 'or'
                ? userFilters.some((filter) => evaluateFilter(sendung, filter))
                : userFilters.every((filter) => evaluateFilter(sendung, filter));
        });
    }

    renderSendungen(filtered);
    updateStatistics(filtered);
}

function updateStatistics(sendungen) {
    if (currentTab === 'empfang') {
        const erwartet = sendungen.filter(s => s.status === 'erwartet').length;
        const unterwegs = sendungen.filter(s => s.status === 'unterwegs').length;
        const problem = sendungen.filter(s => s.status === 'problem').length;
        
        const elemErwartet = document.getElementById('empfangErwartet');
        const elemUnterwegs = document.getElementById('empfangUnterwegs');
        const elemProblem = document.getElementById('empfangProblem');
        
        if (elemErwartet) elemErwartet.textContent = erwartet;
        if (elemUnterwegs) elemUnterwegs.textContent = unterwegs;
        if (elemProblem) elemProblem.textContent = problem;
        
    } else if (currentTab === 'versand') {
        const vorbereitung = sendungen.filter(s => s.status === 'erwartet').length;
        const unterwegs = sendungen.filter(s => s.status === 'unterwegs').length;
        const problem = sendungen.filter(s => s.status === 'problem').length;
        
        const elemVorbereitung = document.getElementById('versandVorbereitung');
        const elemUnterwegs = document.getElementById('versandUnterwegs');
        const elemProblem = document.getElementById('versandProblem');
        
        if (elemVorbereitung) elemVorbereitung.textContent = vorbereitung;
        if (elemUnterwegs) elemUnterwegs.textContent = unterwegs;
        if (elemProblem) elemProblem.textContent = problem;
        
    } else if (currentTab === 'ruecksendung') {
        const offen = sendungen.filter(s => s.status === 'erwartet').length;
        const unterwegs = sendungen.filter(s => s.status === 'unterwegs').length;
        
        const now = new Date();
        const fristLaeuftAb = sendungen.filter(s => {
            if (!s.ruecksendungFrist) return false;
            const fristDate = new Date(s.ruecksendungFrist);
            const diffDays = Math.ceil((fristDate - now) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 7;
        }).length;
        
        const elemOffen = document.getElementById('ruecksendungOffen');
        const elemUnterwegs = document.getElementById('ruecksendungUnterwegs');
        const elemFrist = document.getElementById('ruecksendungFrist');
        
        if (elemOffen) elemOffen.textContent = offen;
        if (elemUnterwegs) elemUnterwegs.textContent = unterwegs;
        if (elemFrist) elemFrist.textContent = fristLaeuftAb;
    }
}

function renderSendungen(sendungen) {
    const container = document.getElementById('sendungenContainer');
    if (!container) return;

    applySendungContainerLayout();

    if (sendungen.length === 0) {
        container.innerHTML = `
            <div class="bg-gray-100 p-8 rounded-xl text-center col-span-full">
                <p class="text-gray-500 text-lg">📦 Keine Sendungen gefunden.</p>
                <p class="text-gray-400 text-sm mt-2">Erstelle deine erste Sendung!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = sendungen.map(sendung => createSendungCard(sendung)).join('');

    sendungen.forEach(sendung => {
        const card = document.getElementById(`sendung-${sendung.id}`);
        if (card) {
            card.onclick = () => openSendungModal(sendung.id);
        }

        const copyBtn = document.getElementById(`copy-tracking-${sendung.id}`);
        if (copyBtn) {
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                copyToClipboard(sendung.transportnummer);
            };
        }

        const trackingLink = document.getElementById(`tracking-link-${sendung.id}`);
        if (trackingLink) {
            trackingLink.onclick = (e) => {
                e.stopPropagation();
            };
        }
    });
}

function createSendungCard(sendung) {
    const statusInfo = STATUS_CONFIG[sendung.status] || STATUS_CONFIG.erwartet;
    const typInfo = TYP_CONFIG[sendung.typ] || TYP_CONFIG.empfang;
    const prioritaetInfo = PRIORITAET_CONFIG[sendung.prioritaet] || PRIORITAET_CONFIG.normal;

    const deadlineText = getDeadlineText(sendung);
    const trackingUrl = getTrackingUrl(sendung.anbieter, sendung.transportnummer);
    const cardLayoutClass = sendungViewMode === 'grid' ? 'h-full' : '';

    if (!sendungShowDetails) {
        return `
            <div id="sendung-${sendung.id}" class="card bg-white p-4 rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer border-l-4 ${getBorderColor(sendung.typ)} ${cardLayoutClass}">
                <h3 class="text-lg font-bold ${typInfo.color} break-words mb-3">${sendung.beschreibung}</h3>
                <div class="space-y-2 text-sm">
                    <div>
                        ${trackingUrl
                            ? `<a id="tracking-link-${sendung.id}" href="${trackingUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 font-semibold">🔗 Tracking öffnen</a>`
                            : '<span class="text-gray-400">🔗 Kein Tracking-Link verfügbar</span>'}
                    </div>
                    <p class="font-semibold text-orange-600">${deadlineText ? `⏰ ${deadlineText}` : '⏰ Keine Deadline gesetzt'}</p>
                </div>
            </div>
        `;
    }

    const transportnummerDisplay = sendung.transportnummer
        ? `
                    <span class="text-gray-500">•</span>
                    <code class="bg-gray-100 px-2 py-0.5 rounded break-all">${sendung.transportnummer}</code>
                    <button id="copy-tracking-${sendung.id}" class="text-amber-600 hover:text-amber-800 ml-1" title="Kopieren">
                        📋
                    </button>
                    ${trackingUrl ? `<a id="tracking-link-${sendung.id}" href="${trackingUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 ml-1" title="Tracking öffnen">🔗</a>` : ''}
                `
        : '<span class="text-xs text-gray-500">(Keine Transportnummer)</span>';

    const prioritaetBadge = sendung.prioritaet !== 'normal' 
        ? `<span class="text-xs px-2 py-1 rounded-full ${prioritaetInfo.badge}">${prioritaetInfo.icon} ${prioritaetInfo.label}</span>`
        : '';

    const aufgeteiltBadge = sendung.aufgeteiltAnzahl > 1
        ? `<span class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">📦 ${sendung.aufgeteiltIndex || 1} von ${sendung.aufgeteiltAnzahl}</span>`
        : '';

    const tagsBadges = (sendung.tags && sendung.tags.length > 0)
        ? sendung.tags.map(tag => `<span class="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">#${tag}</span>`).join(' ')
        : '';
    
    const inhaltDisplay = sendung.inhalt && sendung.inhalt.length > 0
        ? `<div class="ml-8 mt-2">
            <p class="text-xs font-semibold text-gray-700">📦 Inhalt:</p>
            <div class="text-xs text-gray-600 flex flex-wrap gap-1">
                ${sendung.inhalt.map(item => `<span class="bg-gray-100 px-2 py-0.5 rounded">${item}</span>`).join('')}
            </div>
        </div>`
        : '';

    return `
        <div id="sendung-${sendung.id}" class="card bg-white p-4 rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer border-l-4 ${getBorderColor(sendung.typ)} ${cardLayoutClass}">
            <div class="flex justify-between items-start mb-2 flex-wrap gap-2">
                <div class="flex-1 min-w-[200px]">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="text-2xl">${typInfo.icon}</span>
                        <h3 class="text-lg font-bold ${typInfo.color} break-words">${sendung.beschreibung}</h3>
                    </div>
                    ${sendung.produkt ? `<p class="text-sm text-gray-600 ml-8 break-words">Produkt: ${sendung.produkt}</p>` : ''}
                </div>
                <span class="px-3 py-1 rounded-full text-sm font-bold ${statusInfo.color} whitespace-nowrap">${statusInfo.icon} ${statusInfo.label}</span>
            </div>

            <div class="ml-8 space-y-1 text-sm text-gray-700">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold">🚚 ${sendung.anbieter || 'Kein Anbieter'}</span>
                    ${transportnummerDisplay}
                </div>
                ${sendung.absender ? `<p class="break-words">📤 Von: ${sendung.absender}</p>` : ''}
                ${sendung.empfaenger ? `<p class="break-words">📥 An: ${sendung.empfaenger}</p>` : ''}
                ${deadlineText ? `<p class="font-semibold text-orange-600">⏰ ${deadlineText}</p>` : ''}
            </div>

            <div class="ml-8 mt-2 flex flex-wrap gap-2">
                ${prioritaetBadge}
                ${aufgeteiltBadge}
                ${tagsBadges}
            </div>
            
            ${inhaltDisplay}

            ${sendung.notizen ? `<div class="ml-8 mt-2 text-xs text-gray-500 italic break-words">${sendung.notizen}</div>` : ''}
        </div>
    `;
}

function getBorderColor(typ) {
    const colors = {
        empfang: 'border-blue-500',
        versand: 'border-orange-500',
        ruecksendung: 'border-purple-500'
    };
    return colors[typ] || 'border-gray-300';
}

function getDeadlineText(sendung) {
    const deadline = sendung.typ === 'empfang' ? sendung.deadlineErwartet : sendung.deadlineVersand;
    if (!deadline) return null;

    const deadlineDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return `Deadline überschritten (${Math.abs(diffDays)} Tage)`;
    } else if (diffDays === 0) {
        return 'Deadline: HEUTE';
    } else if (diffDays === 1) {
        return 'Deadline: Morgen';
    } else if (diffDays <= 7) {
        return `Deadline: in ${diffDays} Tagen`;
    } else {
        return `Deadline: ${deadlineDate.toLocaleDateString('de-DE')}`;
    }
}

function getTrackingUrl(anbieter, transportnummer) {
    const trackingNumber = String(transportnummer || '').trim();
    if (!trackingNumber) {
        return null;
    }

    const normalizedAnbieter = String(anbieter || '').trim().toLowerCase();
    const encodedTrackingNumber = encodeURIComponent(trackingNumber);

    const trackingUrls = {
        dhl: `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodedTrackingNumber}`,
        hermes: `https://www.hermesworld.com/de/sendungsverfolgung/tracking/?TrackID=${encodedTrackingNumber}`,
        dpd: `https://tracking.dpd.de/parcelstatus?query=${encodedTrackingNumber}`,
        'post österreich': `https://www.post.at/sv/sendungsdetails?snr=${encodedTrackingNumber}`,
        ups: `https://www.ups.com/track?tracknum=${encodedTrackingNumber}`,
        fedex: `https://www.fedex.com/fedextrack/?trknbr=${encodedTrackingNumber}`,
        gls: `https://gls-group.eu/DE/de/paketverfolgung?match=${encodedTrackingNumber}`,
        'amazon logistics': null
    };

    if (Object.prototype.hasOwnProperty.call(trackingUrls, normalizedAnbieter)) {
        return trackingUrls[normalizedAnbieter];
    }

    return `https://www.aftership.com/de/track/${encodedTrackingNumber}`;
}

function copyToClipboard(text) {
    if (!text) {
        alertUser('Keine Transportnummer vorhanden.', 'warning');
        return;
    }

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alertUser('📋 Transportnummer kopiert!');
        }).catch(err => {
            console.error('[Sendungsverwaltung] Clipboard-Fehler:', err);
            fallbackCopyToClipboard(text);
        });
    } else {
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        alertUser('📋 Transportnummer kopiert!');
    } catch (err) {
        console.error('[Sendungsverwaltung] Fallback-Fehler:', err);
        alertUser('Fehler beim Kopieren.');
    }
    document.body.removeChild(textArea);
}
