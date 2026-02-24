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

const TRACKING_PROVIDER_CONFIG = {
    dhl: {
        label: 'DHL',
        logo: 'https://www.google.com/s2/favicons?domain=dhl.de&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodedTrackingNumber}`
    },
    hermes: {
        label: 'Hermes',
        logo: 'https://www.google.com/s2/favicons?domain=hermesworld.com&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://www.hermesworld.com/de/sendungsverfolgung/tracking/?TrackID=${encodedTrackingNumber}`
    },
    dpd: {
        label: 'DPD',
        logo: 'https://www.google.com/s2/favicons?domain=dpd.de&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://tracking.dpd.de/parcelstatus?query=${encodedTrackingNumber}`
    },
    'post österreich': {
        label: 'Post Österreich',
        logo: 'https://www.google.com/s2/favicons?domain=post.at&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://www.post.at/sv/sendungsdetails?snr=${encodedTrackingNumber}`
    },
    ups: {
        label: 'UPS',
        logo: 'https://www.google.com/s2/favicons?domain=ups.com&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://www.ups.com/track?tracknum=${encodedTrackingNumber}`
    },
    fedex: {
        label: 'FedEx',
        logo: 'https://www.google.com/s2/favicons?domain=fedex.com&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://www.fedex.com/fedextrack/?trknbr=${encodedTrackingNumber}`
    },
    gls: {
        label: 'GLS',
        logo: 'https://www.google.com/s2/favicons?domain=gls-group.eu&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://gls-group.eu/DE/de/paketverfolgung?match=${encodedTrackingNumber}`
    }
};

const TRACKING_FALLBACKS = {
    seventeenTrack: {
        label: '17TRACK.net',
        logo: 'https://www.google.com/s2/favicons?domain=17track.net&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://t.17track.net/de#nums=${encodedTrackingNumber}`
    },
    afterShip: {
        label: 'AfterShip',
        logo: 'https://www.google.com/s2/favicons?domain=aftership.com&sz=64',
        buildUrl: (encodedTrackingNumber) => `https://www.aftership.com/de/track/${encodedTrackingNumber}`
    }
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

const STATUS_VALUES = Object.keys(STATUS_CONFIG);

const EMPTY_TRANSPORT_ENTRY = Object.freeze({
    anbieter: '',
    transportnummer: ''
});

let currentSendungPakete = [];
let statusOverrideActive = false;
let isInternalStatusUpdate = false;
let currentInhaltItems = [];
let registeredEmpfaengerVornamen = [];

function normalizeStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return STATUS_VALUES.includes(normalized) ? normalized : 'erwartet';
}

function createPaketId() {
    return `paket_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function normalizeTransportEntry(entry = {}) {
    return {
        anbieter: String(entry?.anbieter || '').trim(),
        transportnummer: String(entry?.transportnummer || '').trim()
    };
}

function normalizeTransportEntries(entries = []) {
    const normalized = Array.isArray(entries)
        ? entries.map(normalizeTransportEntry)
        : [];
    return normalized.length > 0 ? normalized : [{ ...EMPTY_TRANSPORT_ENTRY }];
}

function normalizePaket(paket = {}, index = 0) {
    return {
        paketId: String(paket?.paketId || '').trim() || createPaketId(),
        paketLabel: String(paket?.paketLabel || '').trim() || `Paket ${index + 1}`,
        status: normalizeStatus(paket?.status),
        lieferziel: String(paket?.lieferziel || '').trim(),
        deadlineErwartet: String(paket?.deadlineErwartet || '').trim(),
        deadlineVersand: String(paket?.deadlineVersand || '').trim(),
        notiz: String(paket?.notiz || '').trim(),
        transportEntries: normalizeTransportEntries(paket?.transportEntries)
    };
}

function getPaketeContainer() {
    return document.getElementById('sendungPaketeContainer');
}

function getSendungPakete(sendung = {}) {
    if (Array.isArray(sendung?.pakete) && sendung.pakete.length > 0) {
        return sendung.pakete.map((paket, index) => normalizePaket(paket, index));
    }

    const legacyTransportEntries = Array.isArray(sendung?.transportEntries)
        ? sendung.transportEntries.map(normalizeTransportEntry).filter((entry) => entry.anbieter || entry.transportnummer)
        : [];

    const fallbackEntries = legacyTransportEntries.length > 0
        ? legacyTransportEntries
        : [{
            anbieter: String(sendung?.anbieter || '').trim(),
            transportnummer: String(sendung?.transportnummer || '').trim()
        }];

    return [normalizePaket({
        paketId: createPaketId(),
        paketLabel: 'Paket 1',
        status: normalizeStatus(sendung?.status),
        deadlineErwartet: sendung?.deadlineErwartet || '',
        deadlineVersand: sendung?.deadlineVersand || '',
        transportEntries: fallbackEntries
    }, 0)];
}

function getSendungTransportEntries(sendung = {}) {
    const pakete = getSendungPakete(sendung);
    const entries = [];

    pakete.forEach((paket, paketIndex) => {
        normalizeTransportEntries(paket.transportEntries).forEach((entry) => {
            if (!entry.anbieter && !entry.transportnummer) return;
            entries.push({
                ...entry,
                paketId: paket.paketId,
                paketLabel: paket.paketLabel || `Paket ${paketIndex + 1}`,
                paketStatus: paket.status
            });
        });
    });

    if (entries.length > 0) {
        return entries;
    }

    const legacyEntry = normalizeTransportEntry({
        anbieter: sendung?.anbieter,
        transportnummer: sendung?.transportnummer
    });

    return (legacyEntry.anbieter || legacyEntry.transportnummer) ? [legacyEntry] : [];
}

function extractFirstName(value = '') {
    return String(value || '').trim().split(/\s+/).filter(Boolean)[0] || '';
}

function getCurrentUserFirstName() {
    return extractFirstName(currentUser?.displayName || currentUser?.mode || '');
}

function normalizeTrackingProviderKey(anbieter = '') {
    const normalized = String(anbieter || '').trim().toLowerCase();
    if (!normalized) return '';

    if (normalized.includes('dhl')) return 'dhl';
    if (normalized.includes('hermes')) return 'hermes';
    if (normalized.includes('dpd')) return 'dpd';
    if (normalized.includes('ups')) return 'ups';
    if (normalized.includes('fedex')) return 'fedex';
    if (normalized.includes('gls')) return 'gls';

    if (normalized.includes('post') && (
        normalized.includes('österreich') ||
        normalized.includes('oesterreich') ||
        normalized.includes('austria')
    )) {
        return 'post österreich';
    }

    return normalized;
}

function getTrackingOptionsForEntry(anbieter, transportnummer) {
    const trackingNumber = String(transportnummer || '').trim();
    if (!trackingNumber) return [];

    const encodedTrackingNumber = encodeURIComponent(trackingNumber);
    const providerKey = normalizeTrackingProviderKey(anbieter);
    const providerConfig = TRACKING_PROVIDER_CONFIG[providerKey];
    const options = [];

    if (providerConfig?.buildUrl) {
        options.push({
            label: providerConfig.label,
            url: providerConfig.buildUrl(encodedTrackingNumber),
            logo: providerConfig.logo
        });
    }

    options.push({
        label: TRACKING_FALLBACKS.seventeenTrack.label,
        url: TRACKING_FALLBACKS.seventeenTrack.buildUrl(encodedTrackingNumber),
        logo: TRACKING_FALLBACKS.seventeenTrack.logo
    });

    options.push({
        label: TRACKING_FALLBACKS.afterShip.label,
        url: TRACKING_FALLBACKS.afterShip.buildUrl(encodedTrackingNumber),
        logo: TRACKING_FALLBACKS.afterShip.logo
    });

    return options;
}

function closeTrackingOptionsModal() {
    const modal = document.getElementById('sendungTrackingOptionsModal');
    const list = document.getElementById('sendungTrackingOptionsList');
    if (!modal) return;

    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (list) {
        list.innerHTML = '';
    }
}

function openTrackingOptionsModal(anbieter, transportnummer) {
    const trackingNumber = String(transportnummer || '').trim();
    if (!trackingNumber) {
        alertUser('Keine Transportnummer vorhanden.', 'warning');
        return;
    }

    const modal = document.getElementById('sendungTrackingOptionsModal');
    const list = document.getElementById('sendungTrackingOptionsList');
    const title = document.getElementById('sendungTrackingOptionsTitle');
    if (!modal || !list || !title) return;

    const options = getTrackingOptionsForEntry(anbieter, trackingNumber);
    if (options.length === 0) {
        alertUser('Keine Tracking-Links verfügbar.', 'warning');
        return;
    }

    title.textContent = `Tracking wählen (${trackingNumber})`;
    list.innerHTML = options.map((option) => `
        <a
            href="${option.url}"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full inline-flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-gray-200 bg-white hover:bg-amber-50 hover:border-amber-300 transition"
        >
            <img src="${option.logo}" alt="${option.label} Logo" class="w-7 h-7 rounded" loading="lazy">
            <span class="text-sm md:text-base font-semibold text-gray-800">${option.label}</span>
        </a>
    `).join('');

    list.querySelectorAll('a').forEach((link) => {
        link.onclick = () => closeTrackingOptionsModal();
    });

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function getLieferzielHistoryOptions() {
    const values = [];

    Object.values(SENDUNGEN).forEach((sendung) => {
        getSendungPakete(sendung).forEach((paket) => {
            const lieferziel = String(paket?.lieferziel || '').trim();
            if (lieferziel) values.push(lieferziel);
        });
    });

    currentSendungPakete.forEach((paket) => {
        const lieferziel = String(paket?.lieferziel || '').trim();
        if (lieferziel) values.push(lieferziel);
    });

    const unique = new Map();
    values.forEach((value) => {
        const key = value.toLowerCase();
        if (!unique.has(key)) {
            unique.set(key, value);
        }
    });

    return Array.from(unique.values())
        .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
}

function hideAllLieferzielSuggestionBoxes() {
    const container = getPaketeContainer();
    if (!container) return;
    container.querySelectorAll('.sendung-lieferziel-suggestions').forEach((box) => {
        box.classList.add('hidden');
    });
}

function renderLieferzielSuggestionsForInput(input) {
    const wrapper = input?.closest('.sendung-lieferziel-wrapper');
    const box = wrapper?.querySelector('.sendung-lieferziel-suggestions');
    const paketIndex = Number.parseInt(input?.dataset?.paketIndex || '-1', 10);
    if (!wrapper || !box || Number.isNaN(paketIndex) || paketIndex < 0) return;

    const term = String(input.value || '').trim().toLowerCase();
    const suggestions = getLieferzielHistoryOptions().filter((value) => value.toLowerCase().includes(term));

    box.innerHTML = '';
    if (suggestions.length === 0) {
        box.classList.add('hidden');
        return;
    }

    suggestions.slice(0, 8).forEach((value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b border-gray-100 last:border-b-0';
        button.textContent = value;
        button.onmousedown = (event) => {
            event.preventDefault();
            input.value = value;
            updatePaketField(paketIndex, 'lieferziel', value);
            box.classList.add('hidden');
        };
        box.appendChild(button);
    });

    box.classList.remove('hidden');
}

function hideEmpfaengerSuggestions() {
    document.getElementById('sendungEmpfaengerSuggestions')?.classList.add('hidden');
}

function renderEmpfaengerSuggestions(term = '') {
    const input = document.getElementById('sendungEmpfaenger');
    const box = document.getElementById('sendungEmpfaengerSuggestions');
    if (!input || !box) return;

    const normalizedTerm = String(term || '').trim().toLowerCase();
    const suggestions = registeredEmpfaengerVornamen
        .filter((name) => name.toLowerCase().includes(normalizedTerm));

    box.innerHTML = '';
    if (suggestions.length === 0) {
        box.classList.add('hidden');
        return;
    }

    suggestions.slice(0, 12).forEach((name) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full text-left px-3 py-2 text-sm hover:bg-amber-50 border-b border-gray-100 last:border-b-0';
        button.textContent = name;
        button.onmousedown = (event) => {
            event.preventDefault();
            input.value = name;
            box.classList.add('hidden');
        };
        box.appendChild(button);
    });

    box.classList.remove('hidden');
}

async function loadRegisteredEmpfaengerVornamen() {
    if (!usersCollectionRef) return;

    try {
        const snapshot = await getDocs(usersCollectionRef);
        const uniqueNames = new Map();

        snapshot.forEach((userDoc) => {
            const data = userDoc.data() || {};
            const candidates = [
                data.vorname,
                data.realName,
                data.name,
                data.displayName,
                data.nickname,
                userDoc.id
            ];

            for (const candidate of candidates) {
                const firstName = extractFirstName(candidate);
                if (!firstName) continue;
                const key = firstName.toLowerCase();
                if (!uniqueNames.has(key)) {
                    uniqueNames.set(key, firstName);
                }
                break;
            }
        });

        const ownFirstName = getCurrentUserFirstName();
        if (ownFirstName) {
            uniqueNames.set(ownFirstName.toLowerCase(), ownFirstName);
        }

        registeredEmpfaengerVornamen = Array.from(uniqueNames.values())
            .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    } catch (error) {
        console.warn('[Sendungsverwaltung] Empfänger-Vornamen konnten nicht geladen werden:', error);
    }
}

function computeAutoStatusFromPakete(pakete = []) {
    const statuses = pakete.map((paket) => normalizeStatus(paket.status));
    if (statuses.length === 0) return 'erwartet';

    if (statuses.includes('problem')) return 'problem';
    if (statuses.every((status) => status === 'storniert')) return 'storniert';
    if (statuses.every((status) => status === 'zugestellt' || status === 'storniert')) return 'zugestellt';
    if (statuses.includes('unterwegs')) return 'unterwegs';
    return 'erwartet';
}

function getEarliestPaketDeadline(pakete = [], fieldKey) {
    const validDates = pakete
        .map((paket) => String(paket?.[fieldKey] || '').trim())
        .filter(Boolean)
        .map((value) => ({ value, date: new Date(value) }))
        .filter((item) => !Number.isNaN(item.date.getTime()));

    if (validDates.length === 0) {
        return null;
    }

    validDates.sort((a, b) => a.date - b.date);
    return validDates[0].value;
}

function normalizeInhaltItem(item = {}) {
    if (typeof item === 'string') {
        return {
            menge: 1,
            bezeichnung: String(item || '').trim()
        };
    }

    const mengeRaw = Number.parseInt(item?.menge, 10);
    return {
        menge: Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 1,
        bezeichnung: String(item?.bezeichnung || '').trim()
    };
}

function getSendungInhaltItems(sendung = {}) {
    if (!Array.isArray(sendung?.inhalt)) {
        return [];
    }
    return sendung.inhalt
        .map(normalizeInhaltItem)
        .filter((item) => item.bezeichnung);
}

function getInhaltRowsContainer() {
    return document.getElementById('sendungInhaltRows');
}

function applyInhaltReadMode(readMode) {
    const container = getInhaltRowsContainer();
    const addRowBtn = document.getElementById('sendungAddInhaltRowBtn');

    if (container) {
        container.querySelectorAll('input, button').forEach((element) => {
            element.disabled = readMode;
        });
    }

    if (addRowBtn) {
        addRowBtn.disabled = readMode;
        addRowBtn.classList.toggle('opacity-50', readMode);
        addRowBtn.classList.toggle('cursor-not-allowed', readMode);
    }

    if (container) {
        const removeRowButtons = container.querySelectorAll('.sendung-remove-inhalt-row-btn');
        removeRowButtons.forEach((button) => {
            button.classList.toggle('opacity-50', readMode);
            button.classList.toggle('cursor-not-allowed', readMode);
        });
    }
}

function updateInhaltItem(rowIndex, field, value) {
    const item = currentInhaltItems[rowIndex];
    if (!item) return;

    if (field === 'menge') {
        const mengeRaw = Number.parseInt(value, 10);
        item.menge = Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 1;
        return;
    }

    item.bezeichnung = String(value || '').trim();
}

function addInhaltRow(insertIndex = currentInhaltItems.length, focusField = 'bezeichnung') {
    const safeIndex = Math.max(0, Math.min(insertIndex, currentInhaltItems.length));
    currentInhaltItems.splice(safeIndex, 0, { menge: 1, bezeichnung: '' });
    renderInhaltEditor(safeIndex, focusField);
}

function removeInhaltRow(rowIndex) {
    if (rowIndex < 0 || rowIndex >= currentInhaltItems.length) return;

    if (currentInhaltItems.length <= 1) {
        currentInhaltItems = [{ menge: 1, bezeichnung: '' }];
        renderInhaltEditor(0, 'bezeichnung');
        return;
    }

    currentInhaltItems.splice(rowIndex, 1);
    const nextFocusRow = Math.max(0, rowIndex - 1);
    renderInhaltEditor(nextFocusRow, 'bezeichnung');
}

function setInhaltItems(items = []) {
    const normalized = Array.isArray(items)
        ? items.map(normalizeInhaltItem)
        : [];
    currentInhaltItems = normalized.length > 0
        ? normalized
        : [{ menge: 1, bezeichnung: '' }];

    renderInhaltEditor();
}

function collectInhaltItemsForSave() {
    return currentInhaltItems
        .map(normalizeInhaltItem)
        .filter((item) => item.bezeichnung);
}

function renderInhaltEditor(focusRowIndex = null, focusField = 'bezeichnung') {
    const container = getInhaltRowsContainer();
    if (!container) return;

    container.innerHTML = currentInhaltItems.map((item, index) => `
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-2">
            <div class="grid grid-cols-12 gap-2 items-center">
                <div class="col-span-3 md:col-span-2">
                    <input type="number" min="1" step="1" class="sendung-inhalt-menge-input w-full p-2 border-2 border-gray-300 rounded-lg focus:border-amber-500 text-sm" data-row-index="${index}" value="${item.menge || 1}" placeholder="Menge">
                </div>
                <div class="col-span-9 md:col-span-9">
                    <input type="text" class="sendung-inhalt-bezeichnung-input w-full p-2 border-2 border-gray-300 rounded-lg focus:border-amber-500 text-sm" data-row-index="${index}" value="${item.bezeichnung || ''}" placeholder="Bezeichnung">
                </div>
                <div class="col-span-12 md:col-span-1 flex md:justify-end">
                    ${index === 0
                        ? '<span class="w-8 h-8"></span>'
                        : `<button type="button" class="sendung-remove-inhalt-row-btn w-8 h-8 rounded-full bg-red-500 text-white font-bold hover:bg-red-600 transition" data-row-index="${index}" title="Zeile entfernen">-</button>`}
                </div>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.sendung-inhalt-menge-input').forEach((input) => {
        input.oninput = () => updateInhaltItem(Number.parseInt(input.dataset.rowIndex || '-1', 10), 'menge', input.value);
        input.onkeydown = (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const rowIndex = Number.parseInt(input.dataset.rowIndex || '-1', 10);
            if (!input.value || Number.parseInt(input.value, 10) <= 0) {
                input.value = '1';
            }
            updateInhaltItem(rowIndex, 'menge', input.value);
            const target = container.querySelector(`.sendung-inhalt-bezeichnung-input[data-row-index="${rowIndex}"]`);
            target?.focus();
            target?.select();
        };
    });

    container.querySelectorAll('.sendung-inhalt-bezeichnung-input').forEach((input) => {
        input.oninput = () => updateInhaltItem(Number.parseInt(input.dataset.rowIndex || '-1', 10), 'bezeichnung', input.value);
        input.onkeydown = (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const rowIndex = Number.parseInt(input.dataset.rowIndex || '-1', 10);
            const mengeInput = container.querySelector(`.sendung-inhalt-menge-input[data-row-index="${rowIndex}"]`);
            if (mengeInput && (!mengeInput.value || Number.parseInt(mengeInput.value, 10) <= 0)) {
                mengeInput.value = '1';
            }
            updateInhaltItem(rowIndex, 'menge', mengeInput?.value || '1');
            updateInhaltItem(rowIndex, 'bezeichnung', input.value);
            addInhaltRow(rowIndex + 1, 'bezeichnung');
        };
    });

    container.querySelectorAll('.sendung-remove-inhalt-row-btn').forEach((button) => {
        button.onclick = () => removeInhaltRow(Number.parseInt(button.dataset.rowIndex || '-1', 10));
    });

    applyInhaltReadMode(isSendungModalReadMode);

    if (focusRowIndex === null) return;

    setTimeout(() => {
        const selector = focusField === 'menge'
            ? `.sendung-inhalt-menge-input[data-row-index="${focusRowIndex}"]`
            : `.sendung-inhalt-bezeichnung-input[data-row-index="${focusRowIndex}"]`;
        const target = container.querySelector(selector);
        target?.focus();
        target?.select();
    }, 0);
}

function updateStatusInfoUI(autoStatus) {
    const info = document.getElementById('sendungStatusInfo');
    const resetBtn = document.getElementById('sendungResetAutoStatusBtn');
    if (!info || !resetBtn) return;

    if (statusOverrideActive) {
        info.textContent = `Manuell (Auto: ${STATUS_CONFIG[autoStatus]?.label || autoStatus})`;
        info.className = 'text-xs font-semibold text-orange-800 bg-orange-100 px-2 py-1 rounded';
        resetBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        resetBtn.disabled = false;
    } else {
        info.textContent = `Automatisch (${STATUS_CONFIG[autoStatus]?.label || autoStatus})`;
        info.className = 'text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded';
        resetBtn.classList.add('opacity-50', 'cursor-not-allowed');
        resetBtn.disabled = true;
    }
}

function syncOverallStatusWithPakete(forceAuto = false) {
    const statusSelect = document.getElementById('sendungStatus');
    const autoStatus = computeAutoStatusFromPakete(currentSendungPakete);
    if (!statusSelect) return;

    if (forceAuto) {
        statusOverrideActive = false;
    }

    if (!statusOverrideActive || !statusSelect.value) {
        isInternalStatusUpdate = true;
        statusSelect.value = autoStatus;
        isInternalStatusUpdate = false;
    }

    updateStatusInfoUI(autoStatus);
}

function addPaket() {
    currentSendungPakete.push(normalizePaket({ status: 'erwartet' }, currentSendungPakete.length));
    renderPaketeEditor();
    syncOverallStatusWithPakete();
}

function removePaket(paketIndex) {
    if (currentSendungPakete.length <= 1) {
        return;
    }
    currentSendungPakete.splice(paketIndex, 1);
    currentSendungPakete = currentSendungPakete.map((paket, index) => normalizePaket({ ...paket, paketLabel: `Paket ${index + 1}` }, index));
    renderPaketeEditor();
    syncOverallStatusWithPakete();
}

function addTransportEntryToPaket(paketIndex) {
    const paket = currentSendungPakete[paketIndex];
    if (!paket) return;
    paket.transportEntries.push({ ...EMPTY_TRANSPORT_ENTRY });
    renderPaketeEditor();
}

function removeTransportEntryFromPaket(paketIndex, entryIndex) {
    const paket = currentSendungPakete[paketIndex];
    if (!paket) return;

    if (paket.transportEntries.length <= 1) {
        paket.transportEntries[0] = { ...EMPTY_TRANSPORT_ENTRY };
    } else {
        paket.transportEntries.splice(entryIndex, 1);
    }

    renderPaketeEditor();
}

function updatePaketField(paketIndex, field, value) {
    const paket = currentSendungPakete[paketIndex];
    if (!paket) return;
    paket[field] = field === 'status' ? normalizeStatus(value) : String(value || '').trim();
    if (field === 'status') {
        syncOverallStatusWithPakete();
    }
}

function updateTransportEntryField(paketIndex, entryIndex, field, value) {
    const paket = currentSendungPakete[paketIndex];
    if (!paket || !paket.transportEntries[entryIndex]) return;
    paket.transportEntries[entryIndex][field] = String(value || '').trim();
}

function collectPaketeForSave() {
    const normalized = currentSendungPakete.map((paket, index) => {
        const cleanedEntries = normalizeTransportEntries(paket.transportEntries)
            .map(normalizeTransportEntry)
            .filter((entry) => entry.anbieter || entry.transportnummer);

        const normalizedPaket = normalizePaket({
            ...paket,
            paketLabel: `Paket ${index + 1}`,
            transportEntries: cleanedEntries
        }, index);

        return {
            ...normalizedPaket,
            transportEntries: cleanedEntries
        };
    });

    return normalized.length > 0
        ? normalized
        : [{ ...normalizePaket({ status: 'erwartet' }, 0), transportEntries: [] }];
}

function applyPaketeReadMode(readMode) {
    const addPaketBtn = document.getElementById('sendungAddPaketBtn');
    if (addPaketBtn) {
        addPaketBtn.disabled = readMode;
        addPaketBtn.classList.toggle('opacity-50', readMode);
        addPaketBtn.classList.toggle('cursor-not-allowed', readMode);
    }

    const container = getPaketeContainer();
    if (!container) return;

    const paketInputs = container.querySelectorAll('input, textarea, select, button');
    paketInputs.forEach((element) => {
        element.disabled = readMode;
    });

    const lockedTransportButtons = container.querySelectorAll('.sendung-add-transport-entry-btn, .sendung-remove-transport-entry-btn');
    lockedTransportButtons.forEach((button) => {
        button.classList.toggle('opacity-50', readMode);
        button.classList.toggle('cursor-not-allowed', readMode);
    });

    const removePaketButtons = container.querySelectorAll('.sendung-remove-paket-btn');
    removePaketButtons.forEach((button) => {
        button.classList.toggle('opacity-50', readMode);
        button.classList.toggle('cursor-not-allowed', readMode);
    });

    const readModeOnlyElements = container.querySelectorAll('.sendung-readmode-only');
    readModeOnlyElements.forEach((element) => {
        element.classList.toggle('hidden', !readMode);
    });

    if (readMode) {
        const paketStatusSelects = container.querySelectorAll('.sendung-paket-status-select');
        paketStatusSelects.forEach((select) => {
            select.disabled = false;
        });

        const copyButtons = container.querySelectorAll('.sendung-copy-transportnummer-btn');
        copyButtons.forEach((button) => {
            button.disabled = false;
        });

        const trackingButtons = container.querySelectorAll('.sendung-open-tracking-options-btn');
        trackingButtons.forEach((button) => {
            button.disabled = false;
        });
    }
}

function renderPaketeEditor() {
    const container = getPaketeContainer();
    if (!container) return;

    container.innerHTML = currentSendungPakete.map((paket, paketIndex) => {
        const statusOptions = STATUS_VALUES.map((statusValue) => {
            const config = STATUS_CONFIG[statusValue] || { label: statusValue, icon: '' };
            const selected = paket.status === statusValue ? 'selected' : '';
            return `<option value="${statusValue}" ${selected}>${config.icon} ${config.label}</option>`;
        }).join('');

        const transportRows = normalizeTransportEntries(paket.transportEntries).map((entry, entryIndex) => {
            const readModeActions = `
                <div class="sendung-readmode-only hidden flex gap-1">
                    <button type="button" class="sendung-copy-transportnummer-btn w-9 h-10 shrink-0 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 transition" data-paket-index="${paketIndex}" data-entry-index="${entryIndex}" title="Nummer kopieren">📋</button>
                    ${entry.transportnummer
                        ? `<button type="button" class="sendung-open-tracking-options-btn inline-flex items-center justify-center w-9 h-10 shrink-0 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition" data-paket-index="${paketIndex}" data-entry-index="${entryIndex}" title="Tracking öffnen">🔗</button>`
                        : '<button type="button" class="w-9 h-10 shrink-0 rounded-lg bg-gray-100 text-gray-400 cursor-not-allowed" disabled title="Kein Tracking-Link">🔗</button>'}
                </div>
            `;

            return `
            <div class="grid grid-cols-1 md:grid-cols-[1fr_0.6fr_1.4fr] gap-2 items-start">
                ${entryIndex === 0
                    ? `<div class="sendung-lieferziel-wrapper relative w-full">
                        <input type="text" class="w-full p-2.5 border-2 border-gray-300 rounded-lg focus:border-amber-500 text-sm sendung-paket-lieferziel-input" data-paket-index="${paketIndex}" value="${paket.lieferziel || ''}" placeholder="Lieferziel (z.B. Zuhause, Büro)" autocomplete="off">
                        <div class="sendung-lieferziel-suggestions hidden absolute z-20 mt-1 w-full max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"></div>
                    </div>`
                    : '<div class="hidden md:block"></div>'}
                <input type="text" list="anbieterList" class="w-full p-2.5 border-2 border-gray-300 rounded-lg focus:border-amber-500 text-sm sendung-paket-anbieter-input" data-paket-index="${paketIndex}" data-entry-index="${entryIndex}" value="${entry.anbieter}" placeholder="Transporteur (z.B. DHL)">
                <div class="flex gap-2 w-full">
                    <input type="text" class="w-full p-2.5 border-2 border-gray-300 rounded-lg focus:border-amber-500 text-sm sendung-paket-transportnummer-input" data-paket-index="${paketIndex}" data-entry-index="${entryIndex}" value="${entry.transportnummer}" placeholder="Transportnummer / Sendungsnummer">
                    ${readModeActions}
                    ${entryIndex === 0
                        ? '<span class="w-10 h-10 shrink-0"></span>'
                        : `<button type="button" class="sendung-remove-transport-entry-btn w-10 h-10 shrink-0 rounded-full bg-red-500 text-white font-bold hover:bg-red-600 transition" data-paket-index="${paketIndex}" data-entry-index="${entryIndex}" title="Nummer entfernen">-</button>`}
                </div>
            </div>
        `;
        }).join('');

        return `
            <div class="rounded-lg border border-amber-200 bg-white p-3">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <h5 class="font-bold text-amber-800">📦 Paket ${paketIndex + 1}</h5>
                    <div class="flex items-center gap-2">
                        <select class="sendung-paket-status-select p-2 border-2 border-gray-300 rounded-lg bg-white text-sm" data-paket-index="${paketIndex}">
                            ${statusOptions}
                        </select>
                        ${paketIndex === 0
                            ? ''
                            : `<button type="button" class="sendung-remove-paket-btn px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition" data-paket-index="${paketIndex}" title="Paket entfernen">- Paket</button>`}
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                    <div>
                        <label class="block text-xs font-bold text-gray-600 mb-1">Deadline Erwartet</label>
                        <input type="date" class="sendung-paket-deadline-erwartet w-full p-2.5 border-2 border-gray-300 rounded-lg focus:border-amber-500 text-sm" data-paket-index="${paketIndex}" value="${paket.deadlineErwartet}">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-600 mb-1">Deadline Versand</label>
                        <input type="date" class="sendung-paket-deadline-versand w-full p-2.5 border-2 border-gray-300 rounded-lg focus:border-amber-500 text-sm" data-paket-index="${paketIndex}" value="${paket.deadlineVersand}">
                    </div>
                </div>

                <div class="mt-3">
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-gray-600">Lieferziel, Anbieter &amp; Sendungsnummern</label>
                        <button type="button" class="sendung-add-transport-entry-btn px-2 py-1 rounded bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition" data-paket-index="${paketIndex}">+ Nummer</button>
                    </div>
                    <div class="space-y-2">${transportRows}</div>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.sendung-remove-paket-btn').forEach((button) => {
        button.onclick = () => removePaket(Number.parseInt(button.dataset.paketIndex || '-1', 10));
    });

    container.querySelectorAll('.sendung-add-transport-entry-btn').forEach((button) => {
        button.onclick = () => addTransportEntryToPaket(Number.parseInt(button.dataset.paketIndex || '-1', 10));
    });

    container.querySelectorAll('.sendung-remove-transport-entry-btn').forEach((button) => {
        button.onclick = () => removeTransportEntryFromPaket(
            Number.parseInt(button.dataset.paketIndex || '-1', 10),
            Number.parseInt(button.dataset.entryIndex || '-1', 10)
        );
    });

    container.querySelectorAll('.sendung-paket-status-select').forEach((select) => {
        select.onchange = () => {
            updatePaketField(Number.parseInt(select.dataset.paketIndex || '-1', 10), 'status', select.value);
        };
    });

    container.querySelectorAll('.sendung-paket-deadline-erwartet').forEach((input) => {
        input.oninput = () => updatePaketField(Number.parseInt(input.dataset.paketIndex || '-1', 10), 'deadlineErwartet', input.value);
    });

    container.querySelectorAll('.sendung-paket-deadline-versand').forEach((input) => {
        input.oninput = () => updatePaketField(Number.parseInt(input.dataset.paketIndex || '-1', 10), 'deadlineVersand', input.value);
    });

    container.querySelectorAll('.sendung-paket-lieferziel-input').forEach((input) => {
        input.oninput = () => {
            updatePaketField(Number.parseInt(input.dataset.paketIndex || '-1', 10), 'lieferziel', input.value);
            renderLieferzielSuggestionsForInput(input);
        };
        input.onfocus = () => renderLieferzielSuggestionsForInput(input);
        input.onclick = () => renderLieferzielSuggestionsForInput(input);
        input.onkeydown = (event) => {
            if (event.key === 'Escape') {
                hideAllLieferzielSuggestionBoxes();
            }
        };
    });

    container.querySelectorAll('.sendung-paket-anbieter-input').forEach((input) => {
        input.oninput = () => updateTransportEntryField(
            Number.parseInt(input.dataset.paketIndex || '-1', 10),
            Number.parseInt(input.dataset.entryIndex || '-1', 10),
            'anbieter',
            input.value
        );
    });

    container.querySelectorAll('.sendung-paket-transportnummer-input').forEach((input) => {
        input.oninput = () => updateTransportEntryField(
            Number.parseInt(input.dataset.paketIndex || '-1', 10),
            Number.parseInt(input.dataset.entryIndex || '-1', 10),
            'transportnummer',
            input.value
        );
    });

    container.querySelectorAll('.sendung-copy-transportnummer-btn').forEach((button) => {
        button.onclick = () => {
            const paketIndex = Number.parseInt(button.dataset.paketIndex || '-1', 10);
            const entryIndex = Number.parseInt(button.dataset.entryIndex || '-1', 10);
            const paket = currentSendungPakete[paketIndex];
            const entry = normalizeTransportEntries(paket?.transportEntries)[entryIndex] || { ...EMPTY_TRANSPORT_ENTRY };
            copyToClipboard(entry.transportnummer || '');
        };
    });

    container.querySelectorAll('.sendung-open-tracking-options-btn').forEach((button) => {
        button.onclick = () => {
            const paketIndex = Number.parseInt(button.dataset.paketIndex || '-1', 10);
            const entryIndex = Number.parseInt(button.dataset.entryIndex || '-1', 10);
            const paket = currentSendungPakete[paketIndex];
            const entry = normalizeTransportEntries(paket?.transportEntries)[entryIndex] || { ...EMPTY_TRANSPORT_ENTRY };
            openTrackingOptionsModal(entry.anbieter, entry.transportnummer);
        };
    });

    applyPaketeReadMode(isSendungModalReadMode);
}

function setPakete(pakete = []) {
    const normalized = Array.isArray(pakete)
        ? pakete.map((paket, index) => normalizePaket(paket, index))
        : [];
    currentSendungPakete = normalized.length > 0
        ? normalized
        : [normalizePaket({ status: 'erwartet' }, 0)];

    renderPaketeEditor();
    syncOverallStatusWithPakete();
}

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
    loadRegisteredEmpfaengerVornamen();
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
    const sendungAddPaketBtn = document.getElementById('sendungAddPaketBtn');
    const sendungAddInhaltRowBtn = document.getElementById('sendungAddInhaltRowBtn');
    const sendungEmpfaenger = document.getElementById('sendungEmpfaenger');
    const sendungStatus = document.getElementById('sendungStatus');
    const sendungResetAutoStatusBtn = document.getElementById('sendungResetAutoStatusBtn');
    const closeTrackingOptionsBtn = document.getElementById('closeSendungTrackingOptionsModal');
    const trackingOptionsModal = document.getElementById('sendungTrackingOptionsModal');

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

    if (sendungAddPaketBtn) {
        sendungAddPaketBtn.onclick = () => addPaket();
    }

    if (sendungAddInhaltRowBtn) {
        sendungAddInhaltRowBtn.onclick = () => addInhaltRow(currentInhaltItems.length, 'bezeichnung');
    }

    if (sendungEmpfaenger) {
        sendungEmpfaenger.oninput = () => renderEmpfaengerSuggestions(sendungEmpfaenger.value);
        sendungEmpfaenger.onfocus = () => renderEmpfaengerSuggestions(sendungEmpfaenger.value);
        sendungEmpfaenger.onclick = () => renderEmpfaengerSuggestions(sendungEmpfaenger.value);
        sendungEmpfaenger.onkeydown = (event) => {
            if (event.key === 'Escape') {
                hideEmpfaengerSuggestions();
            }
        };
    }

    if (sendungStatus) {
        sendungStatus.onchange = () => {
            if (isInternalStatusUpdate) return;
            const autoStatus = computeAutoStatusFromPakete(currentSendungPakete);
            statusOverrideActive = normalizeStatus(sendungStatus.value) !== autoStatus;
            updateStatusInfoUI(autoStatus);
        };
    }

    if (sendungResetAutoStatusBtn) {
        sendungResetAutoStatusBtn.onclick = () => {
            syncOverallStatusWithPakete(true);
        };
    }

    if (closeTrackingOptionsBtn) {
        closeTrackingOptionsBtn.onclick = () => closeTrackingOptionsModal();
    }

    if (trackingOptionsModal) {
        trackingOptionsModal.onclick = (event) => {
            if (event.target === trackingOptionsModal) {
                closeTrackingOptionsModal();
            }
        };
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
            if (!e.target.closest('.sendung-lieferziel-wrapper')) {
                hideAllLieferzielSuggestionBoxes();
            }
            if (!e.target.closest('#sendungEmpfaenger') && !e.target.closest('#sendungEmpfaengerSuggestions')) {
                hideEmpfaengerSuggestions();
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
    const transportEntries = getSendungTransportEntries(sendung);
    const paketStatuses = getSendungPakete(sendung).map((paket) => normalizeStatus(paket.status));

    if (category === 'all') {
        const tags = (sendung.tags || []).map((tag) => String(tag || '').toLowerCase());
        return String(sendung.status || '').toLowerCase().includes(searchValue) ||
            String(sendung.anbieter || '').toLowerCase().includes(searchValue) ||
            String(sendung.produkt || '').toLowerCase().includes(searchValue) ||
            String(sendung.absender || '').toLowerCase().includes(searchValue) ||
            String(sendung.empfaenger || '').toLowerCase().includes(searchValue) ||
            String(sendung.prioritaet || '').toLowerCase().includes(searchValue) ||
            String(sendung.bestellnummer || '').toLowerCase().includes(searchValue) ||
            transportEntries.some((entry) => String(entry?.anbieter || '').toLowerCase().includes(searchValue) || String(entry?.transportnummer || '').toLowerCase().includes(searchValue)) ||
            paketStatuses.some((status) => status.includes(searchValue)) ||
            tags.some((tag) => tag.includes(searchValue));
    }

    if (category === 'status') {
        return String(sendung.status || '').toLowerCase().includes(searchValue) ||
            paketStatuses.some((status) => status.includes(searchValue));
    }
    if (category === 'anbieter') {
        return String(sendung.anbieter || '').toLowerCase().includes(searchValue) ||
            transportEntries.some((entry) => String(entry?.anbieter || '').toLowerCase().includes(searchValue));
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
    
    container.innerHTML = activeFilters.map((filter) => `
        <div class="flex items-center ${filter.negate ? 'bg-red-100 text-red-800 border-red-200' : 'bg-indigo-100 text-indigo-800 border-indigo-200'} text-xs font-bold px-2 py-1 rounded-full border">
            ${filter.negate ? '<span class="mr-1 text-red-600">NICHT</span>' : ''}
            <span>${filter.label}: ${filter.rawValue || filter.value}</span>
            <button onclick="window.removeSendungFilter(${filter.id})" class="ml-1 ${filter.negate ? 'text-red-500 hover:text-red-900' : 'text-indigo-500 hover:text-indigo-900'} focus:outline-none" title="Filter entfernen">&times;</button>
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

    const empfaengerInput = document.getElementById('sendungEmpfaenger');
    if (empfaengerInput && !String(empfaengerInput.value || '').trim()) {
        empfaengerInput.value = getCurrentUserFirstName();
    }
}

function closeSendungModalUI() {
    const modal = document.getElementById('sendungModal');
    const editSendungBtn = document.getElementById('editSendungBtn');
    const duplicateSendungBtn = document.getElementById('duplicateSendungBtn');
    closeTrackingOptionsModal();
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

    applyPaketeReadMode(readMode);
    applyInhaltReadMode(readMode);
    if (readMode) {
        hideAllLieferzielSuggestionBoxes();
        hideEmpfaengerSuggestions();
    }

    const resetAutoStatusBtn = document.getElementById('sendungResetAutoStatusBtn');
    if (resetAutoStatusBtn) {
        resetAutoStatusBtn.disabled = readMode || !statusOverrideActive;
        resetAutoStatusBtn.classList.toggle('opacity-50', resetAutoStatusBtn.disabled);
        resetAutoStatusBtn.classList.toggle('cursor-not-allowed', resetAutoStatusBtn.disabled);
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
        sendungPrioritaet: 'normal',
        sendungAbsender: '',
        sendungEmpfaenger: getCurrentUserFirstName(),
        sendungBestellnummer: '',
        sendungWert: '',
        sendungVersandkosten: '',
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

    setInhaltItems([]);
    statusOverrideActive = false;
    setPakete([normalizePaket({ status: 'erwartet' }, 0)]);
    syncOverallStatusWithPakete(true);
}

function fillModalWithSendungData(sendung) {
    const fieldMapping = {
        sendungTyp: 'typ',
        sendungBeschreibung: 'beschreibung',
        sendungPrioritaet: 'prioritaet',
        sendungAbsender: 'absender',
        sendungEmpfaenger: 'empfaenger',
        sendungBestellnummer: 'bestellnummer',
        sendungWert: 'wert',
        sendungVersandkosten: 'versandkosten',
        sendungNotizen: 'notizen',
        sendungRuecksendungGrund: 'ruecksendungGrund'
    };

    Object.entries(fieldMapping).forEach(([elemId, fieldKey]) => {
        const elem = document.getElementById(elemId);
        if (elem && sendung[fieldKey] !== undefined) {
            elem.value = sendung[fieldKey] || '';
        }
    });

    setInhaltItems(sendung.inhalt || []);

    const dateFields = {
        sendungRuecksendungFrist: 'ruecksendungFrist'
    };

    Object.entries(dateFields).forEach(([elemId, fieldKey]) => {
        const elem = document.getElementById(elemId);
        if (elem && sendung[fieldKey]) {
            elem.value = sendung[fieldKey];
        }
    });

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

    setPakete(getSendungPakete(sendung));

    const statusSelect = document.getElementById('sendungStatus');
    const autoStatus = computeAutoStatusFromPakete(currentSendungPakete);
    const storedStatus = normalizeStatus(sendung.status || autoStatus);
    statusOverrideActive = sendung.statusOverrideAktiv === true || storedStatus !== autoStatus;

    if (statusSelect) {
        isInternalStatusUpdate = true;
        statusSelect.value = statusOverrideActive ? storedStatus : autoStatus;
        isInternalStatusUpdate = false;
    }
    updateStatusInfoUI(autoStatus);
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
    const selectedStatus = normalizeStatus(document.getElementById('sendungStatus')?.value || 'erwartet');

    if (currentEditingSendungId && isSendungModalReadMode) {
        try {
            const pakete = collectPaketeForSave();
            const autoStatus = computeAutoStatusFromPakete(pakete);
            const finalStatus = statusOverrideActive ? selectedStatus : autoStatus;
            const isStatusOverride = statusOverrideActive && finalStatus !== autoStatus;

            const flatTransportEntries = pakete.flatMap((paket) => normalizeTransportEntries(paket.transportEntries))
                .map(normalizeTransportEntry)
                .filter((entry) => entry.anbieter || entry.transportnummer);
            const primaryTransportEntry = flatTransportEntries[0] || { ...EMPTY_TRANSPORT_ENTRY };

            const sendungRef = doc(sendungenCollectionRef, currentEditingSendungId);
            await updateDoc(sendungRef, {
                status: finalStatus,
                autoStatus,
                statusOverrideAktiv: isStatusOverride,
                pakete,
                anbieter: primaryTransportEntry.anbieter,
                transportnummer: primaryTransportEntry.transportnummer,
                sendungsnummer: primaryTransportEntry.transportnummer,
                transportEntries: flatTransportEntries,
                deadlineErwartet: getEarliestPaketDeadline(pakete, 'deadlineErwartet'),
                deadlineVersand: getEarliestPaketDeadline(pakete, 'deadlineVersand'),
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
    const pakete = collectPaketeForSave();
    const autoStatus = computeAutoStatusFromPakete(pakete);
    const finalStatus = statusOverrideActive ? selectedStatus : autoStatus;
    const isStatusOverride = statusOverrideActive && finalStatus !== autoStatus;

    const flatTransportEntries = pakete.flatMap((paket) => normalizeTransportEntries(paket.transportEntries))
        .map(normalizeTransportEntry)
        .filter((entry) => entry.anbieter || entry.transportnummer);
    const primaryTransportEntry = flatTransportEntries[0] || { ...EMPTY_TRANSPORT_ENTRY };
    const anbieter = primaryTransportEntry.anbieter;
    const transportnummer = primaryTransportEntry.transportnummer;

    if (!beschreibung) {
        alertUser('Bitte fülle das Pflichtfeld Beschreibung aus.');
        return;
    }
    
    const typ = document.getElementById('sendungTyp')?.value || 'empfang';

    const inhaltArray = collectInhaltItemsForSave();

    const sendungData = {
        typ: typ,
        status: finalStatus,
        autoStatus,
        statusOverrideAktiv: isStatusOverride,
        beschreibung: beschreibung,
        anbieter: anbieter,
        transportnummer: transportnummer,
        sendungsnummer: transportnummer,
        transportEntries: flatTransportEntries,
        pakete: pakete,
        prioritaet: document.getElementById('sendungPrioritaet')?.value || 'normal',
        absender: document.getElementById('sendungAbsender')?.value.trim() || '',
        empfaenger: document.getElementById('sendungEmpfaenger')?.value.trim() || '',
        deadlineErwartet: getEarliestPaketDeadline(pakete, 'deadlineErwartet'),
        deadlineVersand: getEarliestPaketDeadline(pakete, 'deadlineVersand'),
        bestellnummer: document.getElementById('sendungBestellnummer')?.value.trim() || '',
        wert: parseFloat(document.getElementById('sendungWert')?.value) || 0,
        versandkosten: parseFloat(document.getElementById('sendungVersandkosten')?.value) || 0,
        aufgeteiltIndex: null,
        aufgeteiltAnzahl: pakete.length,
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
        if (sendungData.deadlineErwartet && currentUser?.mode && !inaktiveStatus.includes(sendungData.status)) {
            const targetDate = new Date(sendungData.deadlineErwartet);
            const sendungName = `${sendungData.anbieter || 'Sendung'} (${sendungData.transportnummer || 'keine Nr.'})`;
            
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
                    sendungsnummer: sendungData.transportnummer || 'Keine',
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
        if (!card) return;

        card.onclick = () => openSendungModal(sendung.id);

        const transportEntries = getSendungTransportEntries(sendung);

        const copyButtons = card.querySelectorAll('[data-copy-transport-index]');
        copyButtons.forEach((copyBtn) => {
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                const index = Number.parseInt(copyBtn.dataset.copyTransportIndex || '-1', 10);
                const entry = transportEntries[index];
                copyToClipboard(entry?.transportnummer || '');
            };
        });

        const trackingLinks = card.querySelectorAll('[data-tracking-link]');
        trackingLinks.forEach((trackingLink) => {
            trackingLink.onclick = (e) => {
                e.stopPropagation();
                const index = Number.parseInt(trackingLink.dataset.openTrackingOptionsIndex || '-1', 10);
                const entry = transportEntries[index];
                openTrackingOptionsModal(entry?.anbieter || '', entry?.transportnummer || '');
            };
        });
    });
}

function createSendungCard(sendung) {
    const pakete = getSendungPakete(sendung);
    const statusInfo = STATUS_CONFIG[normalizeStatus(sendung.status)] || STATUS_CONFIG.erwartet;
    const typInfo = TYP_CONFIG[sendung.typ] || TYP_CONFIG.empfang;
    const prioritaetInfo = PRIORITAET_CONFIG[sendung.prioritaet] || PRIORITAET_CONFIG.normal;
    const transportEntries = getSendungTransportEntries(sendung);

    const deadlineText = getDeadlineText(sendung);
    const cardLayoutClass = sendungViewMode === 'grid' ? 'h-full' : '';

    const transportEntriesDisplay = transportEntries.length > 0
        ? `<div class="space-y-1">${transportEntries.map((entry, index) => {
            const paketStatusInfo = STATUS_CONFIG[normalizeStatus(entry.paketStatus)] || STATUS_CONFIG.erwartet;

            return `
                <div class="flex items-center gap-2 min-w-0">
                    ${entry.paketLabel ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 whitespace-nowrap">${entry.paketLabel}</span>` : ''}
                    ${entry.paketStatus ? `<span class="text-[11px] font-bold px-2 py-0.5 rounded ${paketStatusInfo.color} whitespace-nowrap">${paketStatusInfo.icon} ${paketStatusInfo.label}</span>` : ''}
                    <div class="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                        <span class="font-semibold shrink-0">🚚</span>
                        <span class="inline-block font-semibold truncate" style="max-width: 9rem;" title="${entry.anbieter || 'Kein Anbieter'}">${entry.anbieter || 'Kein Anbieter'}</span>
                        <span class="text-gray-400 shrink-0">•</span>
                        ${entry.transportnummer
                            ? `<code class="inline-block bg-gray-100 px-2 py-0.5 rounded truncate" style="max-width: 10rem;" title="${entry.transportnummer}">${entry.transportnummer}</code>`
                            : '<span class="text-xs text-gray-500 truncate" style="max-width: 10rem;">(Keine Transportnummer)</span>'}
                    </div>
                    ${entry.transportnummer
                        ? `<button type="button" data-copy-transport-index="${index}" class="text-amber-600 hover:text-amber-800 shrink-0" title="Kopieren">📋</button>`
                        : ''}
                    ${entry.transportnummer
                        ? `<button type="button" data-tracking-link="true" data-open-tracking-options-index="${index}" class="text-blue-600 hover:text-blue-800 shrink-0" title="Tracking öffnen">🔗</button>`
                        : ''}
                </div>
            `;
        }).join('')}</div>`
        : `
            <div class="flex items-center gap-2 min-w-0">
                <span class="font-semibold">🚚 Kein Anbieter</span>
                <span class="text-xs text-gray-500">(Keine Transportnummer)</span>
            </div>
        `;

    if (!sendungShowDetails) {
        return `
            <div id="sendung-${sendung.id}" class="card bg-white p-4 rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer border-l-4 ${getBorderColor(sendung.typ)} ${cardLayoutClass}">
                <h3 class="text-lg font-bold ${typInfo.color} break-words mb-3">${sendung.beschreibung}</h3>
                <div class="space-y-2 text-sm">
                    ${transportEntriesDisplay}
                    <p class="font-semibold text-orange-600">${deadlineText ? `⏰ ${deadlineText}` : '⏰ Keine Deadline gesetzt'}</p>
                </div>
            </div>
        `;
    }

    const prioritaetBadge = sendung.prioritaet !== 'normal' 
        ? `<span class="text-xs px-2 py-1 rounded-full ${prioritaetInfo.badge}">${prioritaetInfo.icon} ${prioritaetInfo.label}</span>`
        : '';

    const paketCountBadge = pakete.length > 1
        ? `<span class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">📦 ${pakete.length} Pakete</span>`
        : '';

    const tagsBadges = (sendung.tags && sendung.tags.length > 0)
        ? sendung.tags.map(tag => `<span class="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">#${tag}</span>`).join(' ')
        : '';
    
    const inhaltItems = getSendungInhaltItems(sendung);
    const inhaltDisplay = inhaltItems.length > 0
        ? `<div class="ml-8 mt-2">
            <p class="text-xs font-semibold text-gray-700">📦 Inhalt:</p>
            <div class="text-xs text-gray-600 flex flex-wrap gap-1">
                ${inhaltItems.map((item) => `<span class="bg-gray-100 px-2 py-0.5 rounded">${item.menge}x ${item.bezeichnung}</span>`).join('')}
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
                ${transportEntriesDisplay}
                ${sendung.absender ? `<p class="break-words">📤 Von: ${sendung.absender}</p>` : ''}
                ${sendung.empfaenger ? `<p class="break-words">📥 An: ${sendung.empfaenger}</p>` : ''}
                ${deadlineText ? `<p class="font-semibold text-orange-600">⏰ ${deadlineText}</p>` : ''}
            </div>

            <div class="ml-8 mt-2 flex flex-wrap gap-2">
                ${prioritaetBadge}
                ${paketCountBadge}
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
    const deadlineField = sendung.typ === 'empfang' ? 'deadlineErwartet' : 'deadlineVersand';
    const deadline = sendung[deadlineField] || getEarliestPaketDeadline(getSendungPakete(sendung), deadlineField);
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

    const options = getTrackingOptionsForEntry(anbieter, trackingNumber);
    if (options.length === 0) {
        return null;
    }

    return options[0].url;
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
