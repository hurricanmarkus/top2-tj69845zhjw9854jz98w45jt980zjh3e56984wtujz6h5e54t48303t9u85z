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

const WARENUEBERNAHME_STATUS_VALUES = ['offen', 'in_pruefung', 'abgeschlossen', 'problem'];
const WARENUEBERNAHME_ABWEICHUNG_OPTIONS = {
    ok: 'OK',
    nicht_geprueft: 'Nicht geprüft',
    fehlt: 'Fehlt',
    zuviel: 'Zuviel',
    defekt: 'Defekt',
    vertauscht: 'Vertauscht',
    unbekannt: 'Unbekannt'
};
const WARENUEBERNAHME_PROBLEM_TYPEN = ['fehlt', 'zuviel', 'defekt', 'vertauscht', 'unbekannt'];
const WARENUEBERNAHME_GELOEST_TYPEN = ['storno', 'rueckerstattet', 'sonstiges'];
const WARENUEBERNAHME_NAV_STATUS_META = {
    ungeprueft: { label: 'Ungeprüft', dot: 'bg-gray-900', badge: 'bg-gray-900 text-white', filterText: 'text-gray-700' },
    in_pruefung: { label: 'In Prüfung', dot: 'bg-blue-600', badge: 'bg-blue-100 text-blue-700', filterText: 'text-blue-700' },
    bestaetigt: { label: 'Bestätigt', dot: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-700', filterText: 'text-emerald-700' },
    unvollstaendig: { label: 'Unvollständig', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', filterText: 'text-amber-800' },
    problem: { label: 'Problem', dot: 'bg-red-600', badge: 'bg-red-100 text-red-700', filterText: 'text-red-700' }
};
const WARENUEBERNAHME_RESET_REQUIRED_CLICKS = 5;
const WARENUEBERNAHME_RESET_WINDOW_MS = 5000;

let currentSendungPakete = [];
let statusOverrideActive = false;
let isInternalStatusUpdate = false;
let currentInhaltItems = [];
let currentOffenerInhaltPot = [];
let currentWarenuebernahmeProblemPot = [];
let currentZuordnungPaketIndex = null;
let currentWarenuebernahmePaketIndex = null;
let registeredEmpfaengerVornamen = [];
let warenuebernahmeResetClickTimestamps = [];
let waSelectedInhaltId = '';
let waFilterStatus = 'all';

function normalizeStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return STATUS_VALUES.includes(normalized) ? normalized : 'erwartet';
}

function createPaketId() {
    return `paket_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function createInhaltId() {
    return `inhalt_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function createWarenuebernahmeId() {
    return `wu_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function createPotEntryId() {
    return `pot_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function createProblemResolutionId() {
    return `potres_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function nowIso() {
    return new Date().toISOString();
}

function isEmpfangTypValue(value = '') {
    return String(value || '').trim().toLowerCase() === 'empfang';
}

function getCurrentModalTyp() {
    return String(document.getElementById('sendungTyp')?.value || currentTab || 'empfang').trim().toLowerCase();
}

function isEmpfangContextActive() {
    return isEmpfangTypValue(getCurrentModalTyp());
}

function normalizeTransportEntry(entry = {}) {
    return {
        anbieter: String(entry?.anbieter || '').trim(),
        transportnummer: String(entry?.transportnummer || '').trim()
    };
}

function normalizeWarenuebernahmeProblemResolution(entry = {}) {
    const mengeRaw = Number.parseInt(entry?.menge, 10);
    const aktionRaw = String(entry?.aktion || 'geloest').trim().toLowerCase();
    const aktion = aktionRaw === 'zuweisen' ? 'zuweisen' : 'geloest';
    const geloestTypRaw = String(entry?.geloestTyp || '').trim().toLowerCase();
    const geloestTyp = WARENUEBERNAHME_GELOEST_TYPEN.includes(geloestTypRaw) ? geloestTypRaw : 'sonstiges';

    return {
        resolutionId: String(entry?.resolutionId || '').trim() || createProblemResolutionId(),
        problemPotEntryId: String(entry?.problemPotEntryId || '').trim(),
        inhaltId: String(entry?.inhaltId || '').trim(),
        menge: Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 1,
        aktion,
        zielPaketId: String(entry?.zielPaketId || '').trim(),
        geloestTyp: aktion === 'geloest' ? geloestTyp : '',
        kommentar: String(entry?.kommentar || '').trim(),
        createdAt: entry?.createdAt || nowIso(),
        createdBy: String(entry?.createdBy || '').trim()
    };
}

function normalizeOffenerInhaltPotEntry(entry = {}, inhaltById = new Map()) {
    const mengeOffenRaw = Number.parseInt(entry?.mengeOffen, 10);
    const inhaltId = String(entry?.inhaltId || '').trim();
    const inhalt = inhaltById.get(inhaltId);

    return {
        inhaltId,
        bezeichnung: String(entry?.bezeichnung || inhalt?.bezeichnung || '').trim(),
        mengeOffen: Number.isFinite(mengeOffenRaw) && mengeOffenRaw > 0 ? mengeOffenRaw : 0
    };
}

function normalizeTransportEntries(entries = []) {
    const normalized = Array.isArray(entries)
        ? entries.map(normalizeTransportEntry)
        : [];
    return normalized.length > 0 ? normalized : [{ ...EMPTY_TRANSPORT_ENTRY }];
}

function normalizeInhaltZuordnungEntry(entry = {}) {
    const mengeRaw = Number.parseInt(entry?.mengeSoll, 10);
    return {
        inhaltId: String(entry?.inhaltId || '').trim(),
        mengeSoll: Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 0
    };
}

function normalizeProblemVerteilung(raw = {}) {
    const source = (raw && typeof raw === 'object') ? raw : {};
    const normalized = {};

    WARENUEBERNAHME_PROBLEM_TYPEN.forEach((typ) => {
        const mengeRaw = Number.parseInt(source[typ], 10);
        if (Number.isFinite(mengeRaw) && mengeRaw > 0) {
            normalized[typ] = mengeRaw;
        }
    });

    return normalized;
}

function normalizeWarenuebernahmePosition(position = {}) {
    const mengeSollRaw = Number.parseInt(position?.mengeSoll, 10);
    const mengeIstRaw = Number.parseInt(position?.mengeIst, 10);
    const problemVerteilung = normalizeProblemVerteilung(position?.problemVerteilung || {});
    const rawTyp = String(position?.abweichungstyp || 'ok').trim().toLowerCase();
    const abweichungstyp = Object.prototype.hasOwnProperty.call(WARENUEBERNAHME_ABWEICHUNG_OPTIONS, rawTyp)
        ? rawTyp
        : 'ok';

    return {
        inhaltId: String(position?.inhaltId || '').trim(),
        mengeSoll: Number.isFinite(mengeSollRaw) && mengeSollRaw > 0 ? mengeSollRaw : 0,
        mengeIst: Number.isFinite(mengeIstRaw) && mengeIstRaw >= 0 ? mengeIstRaw : 0,
        abweichungstyp,
        problemVerteilung,
        kommentar: String(position?.kommentar || '').trim(),
        bestaetigtAt: position?.bestaetigtAt || null
    };
}

function normalizeWarenuebernahmeProblemItem(problem = {}) {
    const mengeSollRaw = Number.parseInt(problem?.mengeSoll, 10);
    const mengeIstRaw = Number.parseInt(problem?.mengeIst, 10);
    const mengeProblemRaw = Number.parseInt(problem?.mengeProblem, 10);
    const rawTyp = String(problem?.typ || 'unbekannt').trim().toLowerCase();

    return {
        potEntryId: String(problem?.potEntryId || '').trim() || createPotEntryId(),
        inhaltId: String(problem?.inhaltId || '').trim(),
        paketId: String(problem?.paketId || '').trim(),
        bezeichnung: String(problem?.bezeichnung || '').trim(),
        mengeSoll: Number.isFinite(mengeSollRaw) && mengeSollRaw >= 0 ? mengeSollRaw : 0,
        mengeIst: Number.isFinite(mengeIstRaw) && mengeIstRaw >= 0 ? mengeIstRaw : 0,
        mengeProblem: Number.isFinite(mengeProblemRaw) && mengeProblemRaw > 0 ? mengeProblemRaw : 1,
        typ: Object.prototype.hasOwnProperty.call(WARENUEBERNAHME_ABWEICHUNG_OPTIONS, rawTyp) ? rawTyp : 'unbekannt',
        kommentar: String(problem?.kommentar || '').trim(),
        sourceUebernahmeId: String(problem?.sourceUebernahmeId || '').trim(),
        createdAt: problem?.createdAt || nowIso(),
        createdBy: String(problem?.createdBy || '').trim()
    };
}

function normalizeWarenuebernahme(warenuebernahme = {}) {
    const statusRaw = String(warenuebernahme?.status || 'offen').trim().toLowerCase();
    const status = WARENUEBERNAHME_STATUS_VALUES.includes(statusRaw) ? statusRaw : 'offen';
    const positionen = Array.isArray(warenuebernahme?.positionen)
        ? warenuebernahme.positionen.map(normalizeWarenuebernahmePosition).filter((position) => position.inhaltId)
        : [];
    const problemartikel = Array.isArray(warenuebernahme?.problemartikel)
        ? warenuebernahme.problemartikel.map(normalizeWarenuebernahmeProblemItem).filter((problem) => problem.inhaltId)
        : [];
    const problemaufloesungen = Array.isArray(warenuebernahme?.problemaufloesungen)
        ? warenuebernahme.problemaufloesungen
            .map(normalizeWarenuebernahmeProblemResolution)
            .filter((entry) => entry.problemPotEntryId && entry.inhaltId && entry.menge > 0)
        : [];

    const totalSoll = positionen.reduce((sum, position) => sum + (position.mengeSoll || 0), 0);
    const totalIst = positionen.reduce((sum, position) => sum + (position.mengeIst || 0), 0);
    const totalProblem = problemartikel.reduce((sum, problem) => sum + (problem.mengeProblem || 0), 0);
    const totalBestaetigt = positionen.length;

    return {
        uebernahmeId: String(warenuebernahme?.uebernahmeId || '').trim() || createWarenuebernahmeId(),
        aktiv: warenuebernahme?.aktiv === true,
        startedAt: warenuebernahme?.startedAt || null,
        completedAt: warenuebernahme?.completedAt || null,
        status,
        positionen,
        problemartikel,
        problemaufloesungen,
        zusammenfassung: {
            totalSoll,
            totalIst,
            totalProblem,
            totalBestaetigt
        },
        updatedAt: warenuebernahme?.updatedAt || null,
        updatedBy: String(warenuebernahme?.updatedBy || '').trim()
    };
}

function computeAbweichungstypFromSollIst(mengeSoll, mengeIst) {
    if (mengeIst < mengeSoll) return 'fehlt';
    if (mengeIst > mengeSoll) return 'zuviel';
    return 'ok';
}

function applyWarenuebernahmeStatusToPaket(paket = {}) {
    const normalizedWarenuebernahme = normalizeWarenuebernahme(paket?.warenuebernahme || {});
    if (!normalizedWarenuebernahme.aktiv) {
        return normalizeStatus(paket?.status);
    }
    return normalizedWarenuebernahme.status === 'problem' ? 'problem' : 'zugestellt';
}

function getEffectiveInhaltItems(items = currentInhaltItems) {
    if (!Array.isArray(items)) return [];
    return items
        .map(normalizeInhaltItem)
        .filter((item) => item.bezeichnung);
}

function getInhaltItemsById(items = currentInhaltItems) {
    const byId = new Map();
    getEffectiveInhaltItems(items).forEach((item) => {
        byId.set(item.inhaltId, item);
    });
    return byId;
}

function getPaketZuordnungMengeForItem(paket = {}, inhaltId = '') {
    if (!Array.isArray(paket?.inhaltZuordnung)) return 0;
    const entry = paket.inhaltZuordnung.find((candidate) => String(candidate?.inhaltId || '').trim() === inhaltId);
    if (!entry) return 0;
    const mengeRaw = Number.parseInt(entry.mengeSoll, 10);
    return Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 0;
}

function computeOffenerInhaltPot(inhaltItems = currentInhaltItems, pakete = currentSendungPakete) {
    const normalizedItems = getEffectiveInhaltItems(inhaltItems);
    if (normalizedItems.length === 0) return [];

    if (Array.isArray(pakete) && pakete.length === 1) {
        const firstPaket = pakete[0] || {};
        const hasExplicitZuordnung = Array.isArray(firstPaket.inhaltZuordnung) && firstPaket.inhaltZuordnung.length > 0;
        if (!hasExplicitZuordnung) {
            return [];
        }
    }

    const assignedByInhaltId = new Map();
    pakete.forEach((paket) => {
        const zuordnung = Array.isArray(paket?.inhaltZuordnung) ? paket.inhaltZuordnung : [];
        zuordnung.forEach((entry) => {
            const normalizedEntry = normalizeInhaltZuordnungEntry(entry);
            if (!normalizedEntry.inhaltId || normalizedEntry.mengeSoll <= 0) return;
            assignedByInhaltId.set(
                normalizedEntry.inhaltId,
                (assignedByInhaltId.get(normalizedEntry.inhaltId) || 0) + normalizedEntry.mengeSoll
            );
        });
    });

    return normalizedItems
        .map((item) => {
            const assigned = assignedByInhaltId.get(item.inhaltId) || 0;
            const mengeOffen = Math.max(0, item.menge - assigned);
            return {
                inhaltId: item.inhaltId,
                bezeichnung: item.bezeichnung,
                mengeOffen
            };
        })
        .filter((entry) => entry.mengeOffen > 0);
}

function computeProblemPotFromPakete(pakete = currentSendungPakete, inhaltItems = currentInhaltItems) {
    const inhaltById = getInhaltItemsById(inhaltItems);
    const results = [];

    pakete.forEach((paket) => {
        const normalizedWarenuebernahme = normalizeWarenuebernahme(paket?.warenuebernahme || {});
        if (!normalizedWarenuebernahme.aktiv) return;

        const reassignedByPotEntryId = new Map();
        normalizedWarenuebernahme.problemaufloesungen.forEach((resolution) => {
            const problemPotEntryId = String(resolution?.problemPotEntryId || '').trim();
            if (!problemPotEntryId || resolution.aktion !== 'zuweisen') return;
            reassignedByPotEntryId.set(
                problemPotEntryId,
                (reassignedByPotEntryId.get(problemPotEntryId) || 0) + (resolution.menge || 0)
            );
        });

        normalizedWarenuebernahme.problemartikel.forEach((problem) => {
            const inhalt = inhaltById.get(problem.inhaltId);
            const reassigned = reassignedByPotEntryId.get(problem.potEntryId) || 0;
            const remainingProblem = Math.max(0, (problem.mengeProblem || 0) - reassigned);
            if (remainingProblem <= 0) return;
            results.push(normalizeWarenuebernahmeProblemItem({
                ...problem,
                mengeProblem: remainingProblem,
                paketId: String(paket?.paketId || '').trim(),
                bezeichnung: String(problem?.bezeichnung || inhalt?.bezeichnung || '').trim(),
                sourceUebernahmeId: String(problem?.sourceUebernahmeId || normalizedWarenuebernahme.uebernahmeId || '').trim(),
                createdBy: String(problem?.createdBy || normalizedWarenuebernahme.updatedBy || '').trim(),
                createdAt: problem?.createdAt || normalizedWarenuebernahme.updatedAt || nowIso()
            }));
        });
    });

    return results;
}

function getSendungOffenerInhaltPot(sendung = {}) {
    const inhaltItems = getSendungInhaltItems(sendung);
    const inhaltById = new Map(inhaltItems.map((item) => [item.inhaltId, item]));

    if (Array.isArray(sendung?.offenerInhaltPot)) {
        return sendung.offenerInhaltPot
            .map((entry) => normalizeOffenerInhaltPotEntry(entry, inhaltById))
            .filter((entry) => entry.inhaltId && entry.mengeOffen > 0);
    }

    return computeOffenerInhaltPot(inhaltItems, getSendungPakete(sendung));
}

function getSendungWarenuebernahmeProblemPot(sendung = {}) {
    const inhaltItems = getSendungInhaltItems(sendung);

    if (Array.isArray(sendung?.warenuebernahmeProblemPot)) {
        return sendung.warenuebernahmeProblemPot
            .map((entry) => normalizeWarenuebernahmeProblemItem(entry))
            .filter((entry) => entry.inhaltId && entry.mengeProblem > 0);
    }

    return computeProblemPotFromPakete(getSendungPakete(sendung), inhaltItems);
}

function ensureInhaltZuordnungConsistency() {
    if (!Array.isArray(currentSendungPakete) || currentSendungPakete.length === 0) return;

    const inhaltItems = getEffectiveInhaltItems();
    const inhaltById = new Map(inhaltItems.map((item) => [item.inhaltId, item]));

    currentSendungPakete = currentSendungPakete.map((paket, index) => {
        const normalizedPaket = normalizePaket({ ...paket, paketLabel: `Paket ${index + 1}` }, index);
        const zuordnungMap = new Map();
        normalizedPaket.inhaltZuordnung.forEach((entry) => {
            const normalizedEntry = normalizeInhaltZuordnungEntry(entry);
            if (!normalizedEntry.inhaltId || normalizedEntry.mengeSoll <= 0 || !inhaltById.has(normalizedEntry.inhaltId)) return;
            zuordnungMap.set(
                normalizedEntry.inhaltId,
                (zuordnungMap.get(normalizedEntry.inhaltId) || 0) + normalizedEntry.mengeSoll
            );
        });

        normalizedPaket.inhaltZuordnung = Array.from(zuordnungMap.entries()).map(([inhaltId, mengeSoll]) => ({
            inhaltId,
            mengeSoll
        }));

        normalizedPaket.warenuebernahme = normalizeWarenuebernahme(normalizedPaket.warenuebernahme);
        return normalizedPaket;
    });

    if (inhaltItems.length === 0) {
        currentSendungPakete.forEach((paket) => {
            paket.inhaltZuordnung = [];
        });
        currentOffenerInhaltPot = [];
        currentWarenuebernahmeProblemPot = computeProblemPotFromPakete(currentSendungPakete, inhaltItems);
        return;
    }

    if (currentSendungPakete.length === 1) {
        currentSendungPakete[0].inhaltZuordnung = inhaltItems.map((item) => ({
            inhaltId: item.inhaltId,
            mengeSoll: item.menge
        }));
    } else {
        inhaltItems.forEach((item) => {
            let remaining = item.menge;
            currentSendungPakete.forEach((paket) => {
                const entry = paket.inhaltZuordnung.find((candidate) => candidate.inhaltId === item.inhaltId);
                if (!entry) return;
                const clamped = Math.max(0, Math.min(entry.mengeSoll, remaining));
                entry.mengeSoll = clamped;
                remaining -= clamped;
            });
        });

        currentSendungPakete.forEach((paket) => {
            paket.inhaltZuordnung = paket.inhaltZuordnung.filter((entry) => entry.mengeSoll > 0);
        });
    }

    currentSendungPakete.forEach((paket) => {
        paket.status = applyWarenuebernahmeStatusToPaket(paket);
    });

    currentOffenerInhaltPot = computeOffenerInhaltPot(inhaltItems, currentSendungPakete);
    currentWarenuebernahmeProblemPot = computeProblemPotFromPakete(currentSendungPakete, inhaltItems);
}

function getPaketZuordnungSummary(paket = {}, inhaltItems = currentInhaltItems) {
    const normalizedItems = getEffectiveInhaltItems(inhaltItems);
    let positionen = 0;
    let menge = 0;

    normalizedItems.forEach((item) => {
        const assigned = getPaketZuordnungMengeForItem(paket, item.inhaltId);
        if (assigned > 0) {
            positionen += 1;
            menge += assigned;
        }
    });

    return { positionen, menge };
}

function getWarenuebernahmeStatusMeta(paket = {}) {
    const wa = normalizeWarenuebernahme(paket?.warenuebernahme || {});
    if (!wa.aktiv) {
        return { label: 'Nicht aktiv', color: 'bg-gray-100 text-gray-600' };
    }

    if (wa.status === 'problem') {
        return { label: 'Problem', color: 'bg-red-100 text-red-700' };
    }
    if (wa.status === 'abgeschlossen') {
        return { label: 'Abgeschlossen', color: 'bg-green-100 text-green-700' };
    }
    if (wa.status === 'in_pruefung') {
        return { label: 'In Prüfung', color: 'bg-blue-100 text-blue-700' };
    }
    return { label: 'Offen', color: 'bg-amber-100 text-amber-700' };
}

function normalizePaket(paket = {}, index = 0) {
    const normalizedWarenuebernahme = normalizeWarenuebernahme(paket?.warenuebernahme || {});
    const normalizedStatus = normalizeStatus(paket?.status);

    return {
        paketId: String(paket?.paketId || '').trim() || createPaketId(),
        paketLabel: String(paket?.paketLabel || '').trim() || `Paket ${index + 1}`,
        status: normalizedWarenuebernahme.aktiv
            ? (normalizedWarenuebernahme.status === 'problem' ? 'problem' : 'zugestellt')
            : normalizedStatus,
        lieferziel: String(paket?.lieferziel || '').trim(),
        deadlineErwartet: String(paket?.deadlineErwartet || '').trim(),
        deadlineVersand: String(paket?.deadlineVersand || '').trim(),
        notiz: String(paket?.notiz || '').trim(),
        transportEntries: normalizeTransportEntries(paket?.transportEntries),
        inhaltZuordnung: Array.isArray(paket?.inhaltZuordnung)
            ? paket.inhaltZuordnung.map(normalizeInhaltZuordnungEntry).filter((entry) => entry.inhaltId && entry.mengeSoll > 0)
            : [],
        warenuebernahme: normalizedWarenuebernahme
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
            inhaltId: createInhaltId(),
            menge: 1,
            bezeichnung: String(item || '').trim()
        };
    }

    const mengeRaw = Number.parseInt(item?.menge, 10);
    return {
        inhaltId: String(item?.inhaltId || '').trim() || createInhaltId(),
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
        addRowBtn.classList.toggle('hidden', readMode);
    }

    if (container) {
        const removeRowButtons = container.querySelectorAll('.sendung-remove-inhalt-row-btn');
        removeRowButtons.forEach((button) => {
            button.classList.toggle('opacity-50', readMode);
            button.classList.toggle('cursor-not-allowed', readMode);
            button.classList.toggle('hidden', readMode);
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
    currentInhaltItems.splice(safeIndex, 0, { inhaltId: createInhaltId(), menge: 1, bezeichnung: '' });
    renderInhaltEditor(safeIndex, focusField);
}

function removeInhaltRow(rowIndex) {
    if (rowIndex < 0 || rowIndex >= currentInhaltItems.length) return;

    if (currentInhaltItems.length <= 1) {
        currentInhaltItems = [{ inhaltId: createInhaltId(), menge: 1, bezeichnung: '' }];
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
        : [{ inhaltId: createInhaltId(), menge: 1, bezeichnung: '' }];

    ensureInhaltZuordnungConsistency();

    renderInhaltEditor();
    renderEmpfangPotOverview();
}

function collectInhaltItemsForSave() {
    return getEffectiveInhaltItems(currentInhaltItems);
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
    ensureInhaltZuordnungConsistency();
    renderEmpfangPotOverview();

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

function getEmpfangPotOverviewContainer() {
    return document.getElementById('sendungEmpfangPotOverview');
}

function renderEmpfangPotOverview() {
    const container = getEmpfangPotOverviewContainer();
    if (!container) return;

    if (!isEmpfangContextActive()) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    ensureInhaltZuordnungConsistency();

    const offeneMenge = currentOffenerInhaltPot.reduce((sum, entry) => sum + (entry.mengeOffen || 0), 0);
    const problemMenge = currentWarenuebernahmeProblemPot.reduce((sum, entry) => sum + (entry.mengeProblem || 0), 0);

    const offenerPotText = currentOffenerInhaltPot.length > 0
        ? currentOffenerInhaltPot.map((entry) => `${entry.mengeOffen}x ${entry.bezeichnung || 'Artikel'}`).join(' • ')
        : 'Keine offenen Mengen';

    const problemPotText = currentWarenuebernahmeProblemPot.length > 0
        ? currentWarenuebernahmeProblemPot
            .slice(0, 5)
            .map((entry) => `${entry.mengeProblem}x ${entry.bezeichnung || 'Artikel'} (${WARENUEBERNAHME_ABWEICHUNG_OPTIONS[entry.typ] || entry.typ})`)
            .join(' • ')
        : 'Keine Problempositionen';

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 space-y-2">
            <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 font-semibold">Zuordnungs-Pot: ${offeneMenge} Stk</span>
                <span class="px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold">Problem-Pot: ${problemMenge} Stk</span>
            </div>
            <p class="text-xs text-indigo-800"><span class="font-bold">Offen:</span> ${offenerPotText}</p>
            <p class="text-xs text-red-700"><span class="font-bold">Probleme:</span> ${problemPotText}</p>
        </div>
    `;
}

function closeInhaltZuordnungModal() {
    const modal = document.getElementById('sendungInhaltZuordnungModal');
    const rows = document.getElementById('sendungInhaltZuordnungRows');
    currentZuordnungPaketIndex = null;
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (rows) rows.innerHTML = '';
}

function renderInhaltZuordnungModal() {
    const paketIndex = currentZuordnungPaketIndex;
    const paket = currentSendungPakete[paketIndex];
    const rows = document.getElementById('sendungInhaltZuordnungRows');
    const hint = document.getElementById('sendungInhaltZuordnungHint');
    const title = document.getElementById('sendungInhaltZuordnungTitle');
    if (!paket || !rows || !hint || !title) return;

    ensureInhaltZuordnungConsistency();

    const inhaltItems = getEffectiveInhaltItems();
    title.textContent = `Artikel zuordnen – ${paket.paketLabel || `Paket ${paketIndex + 1}`}`;

    if (inhaltItems.length === 0) {
        rows.innerHTML = '<div class="text-sm text-gray-500 italic">Keine Artikel in der Inhalt-Liste vorhanden.</div>';
        hint.textContent = 'Füge zuerst Artikel in der Inhalt-Liste hinzu.';
        return;
    }

    rows.innerHTML = inhaltItems.map((item) => {
        const thisAssigned = getPaketZuordnungMengeForItem(paket, item.inhaltId);
        const assignedOther = currentSendungPakete.reduce((sum, candidate, index) => {
            if (index === paketIndex) return sum;
            return sum + getPaketZuordnungMengeForItem(candidate, item.inhaltId);
        }, 0);
        const maxForThis = Math.max(0, item.menge - assignedOther);

        return `
            <div class="rounded-lg border border-gray-200 bg-white p-3 space-y-2 sendung-zuordnung-row" data-inhalt-id="${item.inhaltId}" data-max-for-this="${maxForThis}" data-counter="0">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div class="font-semibold text-sm text-gray-800">${item.bezeichnung}</div>
                    <div class="text-xs text-gray-600">Gesamt: <span class="font-bold">${item.menge}</span> • Andere Pakete: <span class="font-bold">${assignedOther}</span></div>
                </div>
                <div class="flex flex-wrap items-center gap-2 justify-start">
                    <button type="button" class="sendung-zuordnung-minus-btn w-9 h-9 rounded-full bg-gray-100 text-gray-700 font-bold text-lg leading-none hover:bg-gray-200 transition">-</button>
                    ${maxForThis > 10
                        ? `<div class="flex items-center gap-1">
                            <input type="number" min="1" step="1" class="sendung-zuordnung-quick-add-input w-20 p-1.5 border border-gray-300 rounded text-xs" placeholder="Anzahl">
                            <button type="button" class="sendung-zuordnung-quick-add-btn px-2.5 py-1.5 rounded bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition">+ Buchen</button>
                        </div>`
                        : ''}
                    <button type="button" class="sendung-zuordnung-plus-btn w-9 h-9 rounded-full bg-indigo-600 text-white font-bold text-lg leading-none hover:bg-indigo-700 transition">+</button>
                    <div class="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-800 font-bold text-sm min-w-[4rem] text-center">
                        <span class="sendung-zuordnung-counter-value">0</span>
                    </div>
                </div>
                <div class="text-xs text-gray-600 flex flex-wrap gap-3">
                    <span>Max möglich: <span class="font-bold text-indigo-700">${maxForThis}</span></span>
                    <span>Gezählt: <span class="font-bold text-indigo-700 sendung-zuordnung-counter-value">0</span></span>
                    <span>Noch frei: <span class="font-bold text-indigo-700 sendung-zuordnung-remaining-value">${maxForThis}</span></span>
                    ${thisAssigned > 0 ? `<span>Bisher gespeichert: <span class="font-bold text-gray-700">${thisAssigned}</span></span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    rows.querySelectorAll('.sendung-zuordnung-row').forEach((row) => {
        const maxForThis = Number.parseInt(row.dataset.maxForThis || '0', 10);

        const renderCounter = (nextValue) => {
            const safeValue = Number.isFinite(nextValue) ? Math.max(0, Math.min(maxForThis, nextValue)) : 0;
            row.dataset.counter = String(safeValue);

            row.querySelectorAll('.sendung-zuordnung-counter-value').forEach((element) => {
                element.textContent = String(safeValue);
            });

            const remainingElement = row.querySelector('.sendung-zuordnung-remaining-value');
            if (remainingElement) {
                remainingElement.textContent = String(Math.max(0, maxForThis - safeValue));
            }
        };

        renderCounter(0);

        const minusBtn = row.querySelector('.sendung-zuordnung-minus-btn');
        const plusBtn = row.querySelector('.sendung-zuordnung-plus-btn');
        const quickAddInput = row.querySelector('.sendung-zuordnung-quick-add-input');
        const quickAddBtn = row.querySelector('.sendung-zuordnung-quick-add-btn');

        if (minusBtn) {
            minusBtn.onclick = () => {
                const currentValue = Number.parseInt(row.dataset.counter || '0', 10);
                renderCounter((Number.isFinite(currentValue) ? currentValue : 0) - 1);
            };
        }

        if (plusBtn) {
            plusBtn.onclick = () => {
                const currentValue = Number.parseInt(row.dataset.counter || '0', 10);
                renderCounter((Number.isFinite(currentValue) ? currentValue : 0) + 1);
            };
        }

        if (quickAddBtn && quickAddInput) {
            quickAddBtn.onclick = () => {
                const currentValue = Number.parseInt(row.dataset.counter || '0', 10);
                const addRaw = Number.parseInt(quickAddInput.value || '0', 10);
                const addValue = Number.isFinite(addRaw) && addRaw > 0 ? addRaw : 0;
                renderCounter((Number.isFinite(currentValue) ? currentValue : 0) + addValue);
                quickAddInput.value = '';
                quickAddInput.focus();
            };

            quickAddInput.onkeydown = (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                quickAddBtn.click();
            };
        }
    });

    const totalOffen = currentOffenerInhaltPot.reduce((sum, entry) => sum + (entry.mengeOffen || 0), 0);
    hint.textContent = `Aktueller Zuordnungs-Pot: ${totalOffen} Stück`;
}

function openInhaltZuordnungModal(paketIndex) {
    if (!isEmpfangContextActive()) return;
    if (isSendungModalReadMode) {
        alertUser('Artikelzuordnung ist nur im Bearbeitungsmodus möglich.', 'warning');
        return;
    }

    const paket = currentSendungPakete[paketIndex];
    const modal = document.getElementById('sendungInhaltZuordnungModal');
    if (!paket || !modal) return;

    currentZuordnungPaketIndex = paketIndex;
    renderInhaltZuordnungModal();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function applyInhaltZuordnungModal() {
    const paketIndex = currentZuordnungPaketIndex;
    const paket = currentSendungPakete[paketIndex];
    const rows = document.querySelectorAll('#sendungInhaltZuordnungRows .sendung-zuordnung-row');
    if (!paket) return;

    const entries = [];
    rows.forEach((row) => {
        const inhaltId = String(row.dataset.inhaltId || '').trim();
        if (!inhaltId) return;
        const maxForThisRaw = Number.parseInt(row.dataset.maxForThis || '0', 10);
        const maxForThis = Number.isFinite(maxForThisRaw) && maxForThisRaw >= 0 ? maxForThisRaw : 0;
        const rawCounter = Number.parseInt(row.dataset.counter || '0', 10);
        const mengeSoll = Number.isFinite(rawCounter) ? Math.max(0, Math.min(maxForThis, rawCounter)) : 0;
        if (mengeSoll > 0) {
            entries.push({ inhaltId, mengeSoll });
        }
    });

    paket.inhaltZuordnung = entries;
    ensureInhaltZuordnungConsistency();
    renderPaketeEditor();
    syncOverallStatusWithPakete();
    closeInhaltZuordnungModal();
}

function closeWarenuebernahmeModal() {
    const modal = document.getElementById('sendungWarenuebernahmeModal');
    const rows = document.getElementById('sendungWarenuebernahmeRows');
    currentWarenuebernahmePaketIndex = null;
    waSelectedInhaltId = '';
    waFilterStatus = 'all';
    resetWarenuebernahmeResetSequence();
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    if (rows) rows.innerHTML = '';
}

function renderWarenuebernahmeModal() {
    const paketIndex = currentWarenuebernahmePaketIndex;
    const paket = currentSendungPakete[paketIndex];
    const title = document.getElementById('sendungWarenuebernahmeTitle');
    const subtitle = document.getElementById('sendungWarenuebernahmeSubtitle');
    const rows = document.getElementById('sendungWarenuebernahmeRows');
    const problemList = document.getElementById('sendungWarenuebernahmeProblemList');
    if (!paket || !title || !subtitle || !rows || !problemList) return;

    const inhaltById = getInhaltItemsById();
    const warenuebernahme = normalizeWarenuebernahme(paket.warenuebernahme || {});
    const positionById = new Map(warenuebernahme.positionen.map((position) => [position.inhaltId, position]));
    const problemByInhaltTyp = new Map();
    warenuebernahme.problemartikel.forEach((problem) => {
        const inhaltId = String(problem?.inhaltId || '').trim();
        const typ = String(problem?.typ || '').trim().toLowerCase();
        const mengeRaw = Number.parseInt(problem?.mengeProblem, 10);
        if (!inhaltId || !WARENUEBERNAHME_PROBLEM_TYPEN.includes(typ)) return;
        if (!Number.isFinite(mengeRaw) || mengeRaw <= 0) return;
        const key = `${inhaltId}__${typ}`;
        problemByInhaltTyp.set(key, (problemByInhaltTyp.get(key) || 0) + mengeRaw);
    });

    const zuordnung = Array.isArray(paket.inhaltZuordnung)
        ? paket.inhaltZuordnung.map(normalizeInhaltZuordnungEntry).filter((entry) => entry.inhaltId && entry.mengeSoll > 0)
        : [];

    title.textContent = `Warenübernahme – ${paket.paketLabel || `Paket ${paketIndex + 1}`}`;
    subtitle.textContent = `Status: ${getWarenuebernahmeStatusMeta(paket).label}`;

    if (zuordnung.length === 0) {
        rows.innerHTML = '<div class="text-sm text-gray-500 italic">Dieses Paket hat noch keine zugeordneten Artikel.</div>';
        problemList.innerHTML = '<span class="text-xs text-gray-500">Noch keine Problempositionen.</span>';
        return;
    }

    const getBaseStatus = (ungeprueft, geprueft, problemTotal) => {
        if (problemTotal > 0) return 'problem';
        if (ungeprueft <= 0) return 'bestaetigt';
        if (geprueft > 0) return 'unvollstaendig';
        return 'ungeprueft';
    };

    const detailRowsHtml = zuordnung.map((entry, index) => {
        const inhalt = inhaltById.get(entry.inhaltId);
        const existing = positionById.get(entry.inhaltId);
        const existingProblemVerteilung = normalizeProblemVerteilung(existing?.problemVerteilung || {});
        const mengeIst = Number.isFinite(existing?.mengeIst) && existing.mengeIst >= 0 ? existing.mengeIst : 0;
        const kommentar = existing?.kommentar || '';

        const problemByTyp = {};
        let problemTotal = 0;
        WARENUEBERNAHME_PROBLEM_TYPEN.forEach((typ) => {
            const fallback = problemByInhaltTyp.get(`${entry.inhaltId}__${typ}`) || 0;
            const menge = Math.max(0, existingProblemVerteilung[typ] || fallback);
            problemByTyp[typ] = menge;
            problemTotal += menge;
        });

        const geprueft = mengeIst + problemTotal;
        const ungeprueft = Math.max(0, entry.mengeSoll - geprueft);
        const baseStatus = getBaseStatus(ungeprueft, geprueft, problemTotal);

        return `
            <div class="sendung-wa-row rounded-xl border border-gray-200 bg-white p-3 space-y-3" data-order="${index}" data-inhalt-id="${entry.inhaltId}" data-menge-soll="${entry.mengeSoll}" data-counter="${mengeIst}" data-base-status="${baseStatus}" data-unchecked="${ungeprueft}">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <div class="font-semibold text-sm text-gray-800 sendung-wa-item-label">${inhalt?.bezeichnung || 'Artikel'}</div>
                    <span class="sendung-wa-status-pill text-[11px] px-2 py-1 rounded font-bold">${WARENUEBERNAHME_NAV_STATUS_META[baseStatus]?.label || 'Ungeprüft'}</span>
                </div>

                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
                        <div class="text-[10px] uppercase tracking-wide text-gray-500">Sollmenge</div>
                        <div class="text-xl md:text-2xl font-extrabold text-gray-900 sendung-wa-soll-value">${entry.mengeSoll}</div>
                    </div>
                    <div class="rounded-lg border border-gray-200 bg-amber-50 px-2 py-2">
                        <div class="text-[10px] uppercase tracking-wide text-amber-700">Offen</div>
                        <div class="text-xl md:text-2xl font-extrabold text-amber-700 sendung-wa-offen-value">${ungeprueft}</div>
                    </div>
                    <div class="rounded-lg border border-gray-200 bg-emerald-50 px-2 py-2">
                        <div class="text-[10px] uppercase tracking-wide text-emerald-700">Istmenge</div>
                        <div class="text-xl md:text-2xl font-extrabold text-emerald-700 sendung-wa-main-counter-value">${mengeIst}</div>
                    </div>
                </div>

                <div class="flex items-center justify-center gap-3">
                    <button type="button" class="sendung-wa-main-minus-btn w-14 h-14 rounded-full bg-gray-100 text-gray-800 font-black text-3xl leading-none hover:bg-gray-200 transition">-</button>
                    <button type="button" class="sendung-wa-main-plus-btn w-14 h-14 rounded-full bg-emerald-600 text-white font-black text-3xl leading-none hover:bg-emerald-700 transition">+</button>
                </div>

                <div>
                    <label class="text-xs text-gray-600">Kommentar (optional)</label>
                    <input type="text" class="sendung-wa-kommentar-input mt-1 w-full p-2 border-2 border-gray-300 rounded-lg focus:border-emerald-500 text-sm" value="${kommentar}" placeholder="Optional">
                </div>

                <div class="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                    <button type="button" class="sendung-wa-toggle-diff-btn w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 transition">Differenzen buchen</button>
                    <div class="sendung-wa-diff-box hidden p-3 border-t border-gray-200 space-y-2">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            ${WARENUEBERNAHME_PROBLEM_TYPEN.map((typ) => `
                                <div class="sendung-wa-problem-counter rounded-lg border border-gray-200 bg-white p-2" data-problem-typ="${typ}" data-counter="${problemByTyp[typ] || 0}">
                                    <div class="text-xs font-semibold text-gray-700 mb-1">${WARENUEBERNAHME_ABWEICHUNG_OPTIONS[typ] || typ}</div>
                                    <div class="flex items-center gap-2">
                                        <button type="button" class="sendung-wa-problem-minus-btn w-8 h-8 rounded-full bg-gray-100 text-gray-700 font-bold leading-none hover:bg-gray-200 transition">-</button>
                                        <div class="px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-xs font-bold min-w-[2.5rem] text-center">
                                            <span class="sendung-wa-problem-counter-value">${problemByTyp[typ] || 0}</span>
                                        </div>
                                        <button type="button" class="sendung-wa-problem-plus-btn w-8 h-8 rounded-full bg-emerald-600 text-white font-bold leading-none hover:bg-emerald-700 transition">+</button>
                                    </div>
                                    <div class="text-[10px] text-gray-500 sendung-wa-problem-rule-state"></div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    rows.innerHTML = `
        <div class="space-y-3">
            <div class="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div class="text-xs font-bold text-gray-700 mb-2">Produkte</div>
                <div id="sendungWarenuebernahmeNavigatorList" class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1"></div>
            </div>
            <div id="sendungWarenuebernahmeLegend" class="flex flex-wrap gap-2"></div>
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <p id="sendungWarenuebernahmeScopeHint" class="text-xs text-gray-600">Einzelansicht</p>
                <button type="button" id="sendungWarenuebernahmeNextBtn" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition">Nächstes</button>
            </div>
            <div id="sendungWarenuebernahmeDetailList" class="space-y-3">${detailRowsHtml}</div>
        </div>
    `;

    const navigatorList = rows.querySelector('#sendungWarenuebernahmeNavigatorList');
    const legend = rows.querySelector('#sendungWarenuebernahmeLegend');
    const detailList = rows.querySelector('#sendungWarenuebernahmeDetailList');
    const scopeHint = rows.querySelector('#sendungWarenuebernahmeScopeHint');
    const nextBtn = rows.querySelector('#sendungWarenuebernahmeNextBtn');
    if (!navigatorList || !legend || !detailList || !scopeHint || !nextBtn) return;

    const rowElements = Array.from(detailList.querySelectorAll('.sendung-wa-row'));
    const orderedRows = () => [...rowElements].sort((left, right) => {
        const l = Number.parseInt(left.dataset.order || '0', 10);
        const r = Number.parseInt(right.dataset.order || '0', 10);
        return (Number.isFinite(l) ? l : 0) - (Number.isFinite(r) ? r : 0);
    });
    const findRow = (inhaltId) => rowElements.find((row) => String(row.dataset.inhaltId || '').trim() === inhaltId) || null;

    if (!waSelectedInhaltId || !findRow(waSelectedInhaltId)) {
        const firstUnchecked = orderedRows().find((row) => String(row.dataset.baseStatus || '') === 'ungeprueft');
        waSelectedInhaltId = String(firstUnchecked?.dataset.inhaltId || orderedRows()[0]?.dataset.inhaltId || '');
    }

    const updateRowSummary = (row) => {
        const mengeSollRaw = Number.parseInt(row.dataset.mengeSoll || '0', 10);
        const mengeSoll = Number.isFinite(mengeSollRaw) && mengeSollRaw > 0 ? mengeSollRaw : 0;
        const mengeIstRaw = Number.parseInt(row.dataset.counter || '0', 10);
        const mengeIst = Number.isFinite(mengeIstRaw) && mengeIstRaw > 0 ? mengeIstRaw : 0;
        row.dataset.counter = String(mengeIst);

        const problemByTyp = { fehlt: 0, zuviel: 0, defekt: 0, vertauscht: 0, unbekannt: 0 };
        row.querySelectorAll('.sendung-wa-problem-counter').forEach((problemRow) => {
            const typ = String(problemRow.dataset.problemTyp || '').trim().toLowerCase();
            if (!WARENUEBERNAHME_PROBLEM_TYPEN.includes(typ)) return;
            const mengeRaw = Number.parseInt(problemRow.dataset.counter || '0', 10);
            problemByTyp[typ] = Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 0;
        });

        const nonFehlt = (problemByTyp.defekt || 0) + (problemByTyp.vertauscht || 0) + (problemByTyp.unbekannt || 0);
        const maxFehlt = Math.max(0, mengeSoll - mengeIst - nonFehlt);
        problemByTyp.fehlt = Math.min(problemByTyp.fehlt || 0, maxFehlt);

        if (mengeSoll !== mengeIst) {
            problemByTyp.zuviel = 0;
        }

        let problemTotal = 0;
        row.querySelectorAll('.sendung-wa-problem-counter').forEach((problemRow) => {
            const typ = String(problemRow.dataset.problemTyp || '').trim().toLowerCase();
            const value = problemByTyp[typ] || 0;
            problemTotal += value;
            problemRow.dataset.counter = String(value);
            const counterValue = problemRow.querySelector('.sendung-wa-problem-counter-value');
            if (counterValue) counterValue.textContent = String(value);

            const minusBtn = problemRow.querySelector('.sendung-wa-problem-minus-btn');
            const plusBtn = problemRow.querySelector('.sendung-wa-problem-plus-btn');
            if (minusBtn) {
                minusBtn.disabled = value <= 0;
                minusBtn.classList.toggle('opacity-40', value <= 0);
                minusBtn.classList.toggle('cursor-not-allowed', value <= 0);
            }

            let plusDisabled = false;
            let ruleText = 'immer möglich';
            if (typ === 'fehlt') {
                ruleText = 'nur bis Offen';
                plusDisabled = maxFehlt <= value;
            } else if (typ === 'zuviel') {
                ruleText = 'nur wenn Soll = Ist';
                plusDisabled = mengeSoll !== mengeIst;
            }
            if (plusBtn) {
                plusBtn.disabled = plusDisabled;
                plusBtn.classList.toggle('opacity-40', plusDisabled);
                plusBtn.classList.toggle('cursor-not-allowed', plusDisabled);
            }

            const ruleState = problemRow.querySelector('.sendung-wa-problem-rule-state');
            if (ruleState) ruleState.textContent = ruleText;
        });

        const geprueft = mengeIst + problemTotal;
        const ungeprueft = Math.max(0, mengeSoll - geprueft);
        const baseStatus = getBaseStatus(ungeprueft, geprueft, problemTotal);
        row.dataset.baseStatus = baseStatus;
        row.dataset.unchecked = String(ungeprueft);

        const istValue = row.querySelector('.sendung-wa-main-counter-value');
        if (istValue) istValue.textContent = String(mengeIst);
        const offenValue = row.querySelector('.sendung-wa-offen-value');
        if (offenValue) offenValue.textContent = String(ungeprueft);

        const statusPill = row.querySelector('.sendung-wa-status-pill');
        if (statusPill) {
            statusPill.className = 'sendung-wa-status-pill text-[11px] px-2 py-1 rounded font-bold';
            const meta = WARENUEBERNAHME_NAV_STATUS_META[baseStatus] || WARENUEBERNAHME_NAV_STATUS_META.ungeprueft;
            statusPill.classList.add(...meta.badge.split(' '));
            statusPill.textContent = meta.label;
        }
    };

    const renderProblemList = () => {
        const grouped = new Map();
        rowElements.forEach((row) => {
            row.querySelectorAll('.sendung-wa-problem-counter').forEach((problemRow) => {
                const typ = String(problemRow.dataset.problemTyp || '').trim().toLowerCase();
                const mengeRaw = Number.parseInt(problemRow.dataset.counter || '0', 10);
                const menge = Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 0;
                if (!menge || !WARENUEBERNAHME_PROBLEM_TYPEN.includes(typ)) return;
                const inhaltId = String(row.dataset.inhaltId || '').trim();
                const key = `${inhaltId}__${typ}`;
                grouped.set(key, {
                    key,
                    inhaltId,
                    typ,
                    menge,
                    label: row.querySelector('.sendung-wa-item-label')?.textContent?.trim() || 'Artikel'
                });
            });
        });

        const resolutionsByPot = new Map();
        warenuebernahme.problemaufloesungen.forEach((resolution) => {
            const potId = String(resolution?.problemPotEntryId || '').trim();
            if (!potId) return;
            if (!resolutionsByPot.has(potId)) resolutionsByPot.set(potId, []);
            resolutionsByPot.get(potId).push(resolution);
        });

        if (grouped.size === 0) {
            problemList.innerHTML = '<span class="text-xs text-gray-500">Noch keine Problempositionen.</span>';
            return;
        }

        const paketOptions = currentSendungPakete
            .filter((candidate) => String(candidate?.paketId || '').trim() !== String(paket?.paketId || '').trim())
            .map((candidate, idx) => `<option value="${candidate.paketId}">${candidate.paketLabel || `Paket ${idx + 1}`}</option>`)
            .join('');

        const existingProblemByKey = new Map();
        warenuebernahme.problemartikel.forEach((problem) => {
            const key = `${problem.inhaltId}__${problem.typ}`;
            if (!existingProblemByKey.has(key)) existingProblemByKey.set(key, problem);
        });

        problemList.innerHTML = [...grouped.values()].map((entry) => {
            const match = existingProblemByKey.get(entry.key);
            const potEntryId = String(match?.potEntryId || `pot_${warenuebernahme.uebernahmeId}_${entry.key}`);
            const linkedResolutions = resolutionsByPot.get(potEntryId) || [];
            const resolvedTotal = linkedResolutions.reduce((sum, resolution) => sum + (resolution.menge || 0), 0);
            const remainingForResolution = Math.max(0, entry.menge - resolvedTotal);
            const linkedBadges = linkedResolutions.length > 0
                ? linkedResolutions.map((resolution) => {
                    const typLabel = resolution.aktion === 'zuweisen'
                        ? `Zugewiesen (${resolution.menge})`
                        : `Gelöst: ${(resolution.geloestTyp || 'sonstiges').replace('rueckerstattet', 'rückerstattet')}`;
                    return `<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[11px] font-semibold">${typLabel}</span>`;
                }).join(' ')
                : '<span class="text-[11px] text-gray-500">Noch keine Auflösung</span>';

            return `
                <div class="rounded-lg border border-red-200 bg-white p-2 space-y-2">
                    <div class="text-xs font-semibold text-red-700">${entry.menge}x ${entry.label} (${WARENUEBERNAHME_ABWEICHUNG_OPTIONS[entry.typ] || entry.typ})</div>
                    <div class="text-[11px] text-red-700">Offen für Auflösung: <span class="font-bold">${remainingForResolution}</span></div>
                    <div class="flex flex-wrap gap-1">${linkedBadges}</div>
                    <div class="sendung-wa-problem-resolution-row grid grid-cols-1 md:grid-cols-5 gap-2 items-end" data-problem-pot-entry-id="${potEntryId}" data-inhalt-id="${entry.inhaltId}" data-counter="0" data-max="${remainingForResolution}">
                        <select class="sendung-wa-resolution-action p-2 border border-gray-300 rounded text-xs md:col-span-1">
                            <option value="zuweisen">Zu Paket zuweisen</option>
                            <option value="geloest">Als gelöst bestätigen</option>
                        </select>
                        <select class="sendung-wa-resolution-target p-2 border border-gray-300 rounded text-xs md:col-span-1">${paketOptions || '<option value="">Kein weiteres Paket</option>'}</select>
                        <select class="sendung-wa-resolution-geloest-typ p-2 border border-gray-300 rounded text-xs md:col-span-1 hidden">
                            <option value="storno">Storno</option>
                            <option value="rueckerstattet">Rückerstattet</option>
                            <option value="sonstiges">Sonstiges</option>
                        </select>
                        <input type="text" class="sendung-wa-resolution-kommentar p-2 border border-gray-300 rounded text-xs md:col-span-1" placeholder="Kommentar">
                        <div class="flex items-center gap-2 md:col-span-1">
                            <button type="button" class="sendung-wa-resolution-minus w-8 h-8 rounded-full bg-gray-100 text-gray-700 font-bold leading-none">-</button>
                            <span class="sendung-wa-resolution-counter-value text-xs font-bold text-gray-700 min-w-[1.5rem] text-center">0</span>
                            <button type="button" class="sendung-wa-resolution-plus w-8 h-8 rounded-full bg-red-600 text-white font-bold leading-none">+</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        problemList.querySelectorAll('.sendung-wa-problem-resolution-row').forEach((resolutionRow) => {
            const actionSelect = resolutionRow.querySelector('.sendung-wa-resolution-action');
            const targetSelect = resolutionRow.querySelector('.sendung-wa-resolution-target');
            const geloestTypSelect = resolutionRow.querySelector('.sendung-wa-resolution-geloest-typ');
            const minusBtn = resolutionRow.querySelector('.sendung-wa-resolution-minus');
            const plusBtn = resolutionRow.querySelector('.sendung-wa-resolution-plus');
            const counterValue = resolutionRow.querySelector('.sendung-wa-resolution-counter-value');

            const updateResolutionUi = () => {
                const action = String(actionSelect?.value || 'zuweisen').trim().toLowerCase();
                if (targetSelect) targetSelect.classList.toggle('hidden', action !== 'zuweisen');
                if (geloestTypSelect) geloestTypSelect.classList.toggle('hidden', action !== 'geloest');
                const counterRaw = Number.parseInt(resolutionRow.dataset.counter || '0', 10);
                const maxRaw = Number.parseInt(resolutionRow.dataset.max || '0', 10);
                const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0;
                const counter = Number.isFinite(counterRaw) && counterRaw > 0 ? Math.min(counterRaw, max) : 0;
                resolutionRow.dataset.counter = String(counter);
                if (counterValue) counterValue.textContent = String(counter);
                if (minusBtn) minusBtn.disabled = counter <= 0;
                if (plusBtn) plusBtn.disabled = counter >= max || max <= 0;
            };

            if (actionSelect) actionSelect.onchange = updateResolutionUi;
            if (minusBtn) {
                minusBtn.onclick = () => {
                    const current = Number.parseInt(resolutionRow.dataset.counter || '0', 10);
                    resolutionRow.dataset.counter = String(Math.max(0, (Number.isFinite(current) ? current : 0) - 1));
                    updateResolutionUi();
                };
            }
            if (plusBtn) {
                plusBtn.onclick = () => {
                    const current = Number.parseInt(resolutionRow.dataset.counter || '0', 10);
                    resolutionRow.dataset.counter = String((Number.isFinite(current) ? current : 0) + 1);
                    updateResolutionUi();
                };
            }

            updateResolutionUi();
        });
    };

    const getDisplayStatus = (row) => {
        const inhaltId = String(row.dataset.inhaltId || '').trim();
        const base = String(row.dataset.baseStatus || 'ungeprueft');
        return inhaltId === waSelectedInhaltId ? 'in_pruefung' : base;
    };

    const renderNavigator = () => {
        navigatorList.innerHTML = orderedRows().map((row) => {
            const inhaltId = String(row.dataset.inhaltId || '').trim();
            const label = row.querySelector('.sendung-wa-item-label')?.textContent?.trim() || 'Artikel';
            const statusKey = getDisplayStatus(row);
            const meta = WARENUEBERNAHME_NAV_STATUS_META[statusKey] || WARENUEBERNAHME_NAV_STATUS_META.ungeprueft;
            const isActive = inhaltId === waSelectedInhaltId;
            return `
                <button type="button" class="sendung-wa-nav-item w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded-lg border ${isActive ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'} hover:border-blue-300" data-inhalt-id="${inhaltId}">
                    <span class="text-xs font-semibold text-gray-800 truncate">${label}</span>
                    <span class="inline-flex items-center gap-1.5 text-[10px] font-bold ${meta.filterText}"><span class="w-2.5 h-2.5 rounded-full ${meta.dot}"></span>${meta.label}</span>
                </button>
            `;
        }).join('');
    };

    const renderLegend = () => {
        const options = [
            { key: 'ungeprueft', text: 'Ungeprüft' },
            { key: 'in_pruefung', text: 'In Prüfung' },
            { key: 'bestaetigt', text: 'Bestätigt' },
            { key: 'unvollstaendig', text: 'Unvollständig' },
            { key: 'problem', text: 'Problem' }
        ];
        legend.innerHTML = options.map((option) => {
            const meta = WARENUEBERNAHME_NAV_STATUS_META[option.key];
            const active = waFilterStatus === option.key;
            return `
                <button type="button" class="sendung-wa-legend-filter px-2.5 py-1.5 rounded-full text-xs font-bold border ${active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700'}" data-filter-status="${option.key}">
                    <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full ${meta.dot}"></span>${option.text}</span>
                </button>
            `;
        }).join('');
    };

    const isRowVisible = (row) => {
        const inhaltId = String(row.dataset.inhaltId || '').trim();
        const base = String(row.dataset.baseStatus || 'ungeprueft');
        if (waFilterStatus === 'all') return inhaltId === waSelectedInhaltId;
        if (waFilterStatus === 'in_pruefung') return inhaltId === waSelectedInhaltId;
        return base === waFilterStatus;
    };

    const applyDetailFilter = () => {
        rowElements.forEach((row) => {
            row.classList.toggle('hidden', !isRowVisible(row));
        });

        if (waFilterStatus === 'all' || waFilterStatus === 'in_pruefung') {
            scopeHint.textContent = 'Einzelansicht';
        } else {
            const label = WARENUEBERNAHME_NAV_STATUS_META[waFilterStatus]?.label || waFilterStatus;
            scopeHint.textContent = `Filter: ${label}`;
        }
    };

    const refreshAll = () => {
        rowElements.forEach((row) => updateRowSummary(row));
        renderNavigator();
        renderLegend();
        applyDetailFilter();
        renderProblemList();
    };

    rowElements.forEach((row) => {
        const toggleDiffBtn = row.querySelector('.sendung-wa-toggle-diff-btn');
        const diffBox = row.querySelector('.sendung-wa-diff-box');
        const mainMinusBtn = row.querySelector('.sendung-wa-main-minus-btn');
        const mainPlusBtn = row.querySelector('.sendung-wa-main-plus-btn');

        if (toggleDiffBtn && diffBox) {
            toggleDiffBtn.onclick = () => diffBox.classList.toggle('hidden');
        }
        if (mainMinusBtn) {
            mainMinusBtn.onclick = () => {
                const current = Number.parseInt(row.dataset.counter || '0', 10);
                row.dataset.counter = String(Math.max(0, (Number.isFinite(current) ? current : 0) - 1));
                refreshAll();
            };
        }
        if (mainPlusBtn) {
            mainPlusBtn.onclick = () => {
                const current = Number.parseInt(row.dataset.counter || '0', 10);
                row.dataset.counter = String((Number.isFinite(current) ? current : 0) + 1);
                refreshAll();
            };
        }

        row.querySelectorAll('.sendung-wa-problem-counter').forEach((problemRow) => {
            const minusBtn = problemRow.querySelector('.sendung-wa-problem-minus-btn');
            const plusBtn = problemRow.querySelector('.sendung-wa-problem-plus-btn');
            if (minusBtn) {
                minusBtn.onclick = () => {
                    const current = Number.parseInt(problemRow.dataset.counter || '0', 10);
                    problemRow.dataset.counter = String(Math.max(0, (Number.isFinite(current) ? current : 0) - 1));
                    refreshAll();
                };
            }
            if (plusBtn) {
                plusBtn.onclick = () => {
                    if (plusBtn.disabled) return;
                    const current = Number.parseInt(problemRow.dataset.counter || '0', 10);
                    problemRow.dataset.counter = String((Number.isFinite(current) ? current : 0) + 1);
                    refreshAll();
                };
            }
        });
    });

    navigatorList.onclick = (event) => {
        const button = event.target.closest('.sendung-wa-nav-item');
        if (!button) return;
        const inhaltId = String(button.dataset.inhaltId || '').trim();
        if (!inhaltId) return;
        waSelectedInhaltId = inhaltId;
        waFilterStatus = 'all';
        refreshAll();
        findRow(inhaltId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    legend.onclick = (event) => {
        const button = event.target.closest('.sendung-wa-legend-filter');
        if (!button) return;
        waFilterStatus = String(button.dataset.filterStatus || 'all').trim();
        refreshAll();
    };

    nextBtn.onclick = () => {
        const allRows = orderedRows();
        const visibleRows = allRows.filter((row) => {
            if (waFilterStatus === 'all') return true;
            if (waFilterStatus === 'in_pruefung') return true;
            return String(row.dataset.baseStatus || '') === waFilterStatus;
        });
        if (visibleRows.length === 0) return;

        const currentIndex = visibleRows.findIndex((row) => String(row.dataset.inhaltId || '') === waSelectedInhaltId);
        const afterCurrent = currentIndex >= 0 ? visibleRows.slice(currentIndex + 1) : visibleRows;
        const beforeCurrent = currentIndex >= 0 ? visibleRows.slice(0, currentIndex + 1) : [];
        const nextUnchecked = afterCurrent.find((row) => String(row.dataset.baseStatus || '') === 'ungeprueft')
            || beforeCurrent.find((row) => String(row.dataset.baseStatus || '') === 'ungeprueft');
        let nextRow = nextUnchecked;
        if (!nextRow && currentIndex >= 0) {
            nextRow = visibleRows[currentIndex + 1] || visibleRows[0];
        }
        if (!nextRow) nextRow = visibleRows[0];
        waSelectedInhaltId = String(nextRow.dataset.inhaltId || '');
        if (waFilterStatus === 'in_pruefung') waFilterStatus = 'all';
        refreshAll();
        nextRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    refreshAll();
}

function resetWarenuebernahmeResetSequence() {
    warenuebernahmeResetClickTimestamps = [];
}

function registerWarenuebernahmeResetClick() {
    const now = Date.now();
    warenuebernahmeResetClickTimestamps = [
        ...warenuebernahmeResetClickTimestamps.filter((timestamp) => now - timestamp <= WARENUEBERNAHME_RESET_WINDOW_MS),
        now
    ];
    return warenuebernahmeResetClickTimestamps.length;
}

function resetCurrentWarenuebernahmeToStandardwerte() {
    const paket = currentSendungPakete[currentWarenuebernahmePaketIndex];
    if (!paket) return;

    const bestehend = normalizeWarenuebernahme(paket.warenuebernahme || {});
    paket.warenuebernahme = normalizeWarenuebernahme({
        ...bestehend,
        aktiv: true,
        status: 'offen',
        completedAt: null,
        positionen: [],
        problemartikel: [],
        problemaufloesungen: [],
        updatedAt: nowIso(),
        updatedBy: currentUser?.mode || '',
        startedAt: bestehend.startedAt || nowIso()
    });

    paket.status = applyWarenuebernahmeStatusToPaket(paket);
    ensureInhaltZuordnungConsistency();
    renderPaketeEditor();
    syncOverallStatusWithPakete();
    renderWarenuebernahmeModal();
}

function handleWarenuebernahmeResetRequest() {
    const paket = currentSendungPakete[currentWarenuebernahmePaketIndex];
    if (!paket) return;

    const count = registerWarenuebernahmeResetClick();
    const remaining = WARENUEBERNAHME_RESET_REQUIRED_CLICKS - count;
    if (remaining > 0) {
        alertUser(`Zum Zurücksetzen noch ${remaining}x innerhalb von 5 Sekunden drücken.`, 'warning');
        return;
    }

    resetWarenuebernahmeResetSequence();
    resetCurrentWarenuebernahmeToStandardwerte();
    alertUser('Warenübernahme wurde auf Standardwerte zurückgesetzt.');
}

function openWarenuebernahmeModal(paketIndex) {
    if (!isEmpfangContextActive()) return;
    if (!isSendungModalReadMode) {
        alertUser('Warenübernahme öffnest du im Lesemodus der Sendung.', 'warning');
        return;
    }

    const paket = currentSendungPakete[paketIndex];
    const modal = document.getElementById('sendungWarenuebernahmeModal');
    if (!paket || !modal) return;

    const warenuebernahme = normalizeWarenuebernahme(paket.warenuebernahme || {});
    if (!warenuebernahme.aktiv) {
        alertUser('Warenübernahme ist für dieses Paket nicht aktiv.', 'warning');
        return;
    }

    currentWarenuebernahmePaketIndex = paketIndex;
    resetWarenuebernahmeResetSequence();
    renderWarenuebernahmeModal();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function collectWarenuebernahmeFromModal() {
    const paket = currentSendungPakete[currentWarenuebernahmePaketIndex];
    if (!paket) return null;

    const existing = normalizeWarenuebernahme(paket.warenuebernahme || {});
    const rows = document.querySelectorAll('#sendungWarenuebernahmeRows .sendung-wa-row');
    const positionen = [];
    const problemartikel = [];
    const existingProblemByKey = new Map();
    existing.problemartikel.forEach((problem) => {
        const key = `${problem.inhaltId}__${problem.typ}`;
        if (!existingProblemByKey.has(key)) {
            existingProblemByKey.set(key, problem);
        }
    });

    const problemaufloesungen = Array.isArray(existing.problemaufloesungen)
        ? existing.problemaufloesungen.map(normalizeWarenuebernahmeProblemResolution)
        : [];
    let hasUnchecked = false;

    rows.forEach((row) => {
        const inhaltId = String(row.dataset.inhaltId || '').trim();
        const mengeSoll = Number.parseInt(row.dataset.mengeSoll || '0', 10);
        if (!inhaltId || !Number.isFinite(mengeSoll) || mengeSoll <= 0) return;

        const kommentarInput = row.querySelector('.sendung-wa-kommentar-input');
        const kommentar = String(kommentarInput?.value || '').trim();

        const mengeIstRaw = Number.parseInt(row.dataset.counter || '0', 10);
        const mengeIst = Number.isFinite(mengeIstRaw) && mengeIstRaw >= 0 ? mengeIstRaw : 0;
        const problemVerteilung = {};
        let problemTotal = 0;

        row.querySelectorAll('.sendung-wa-problem-counter').forEach((problemRow) => {
            const typ = String(problemRow.dataset.problemTyp || '').trim().toLowerCase();
            if (!WARENUEBERNAHME_PROBLEM_TYPEN.includes(typ)) return;

            const mengeRaw = Number.parseInt(problemRow.dataset.counter || '0', 10);
            const menge = Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 0;
            if (menge <= 0) return;

            problemVerteilung[typ] = menge;
            problemTotal += menge;

            const previous = existingProblemByKey.get(`${inhaltId}__${typ}`);
            const fallbackPotEntryId = `pot_${existing.uebernahmeId}_${inhaltId}__${typ}`;

            problemartikel.push({
                potEntryId: previous?.potEntryId || fallbackPotEntryId,
                inhaltId,
                paketId: paket.paketId,
                mengeSoll,
                mengeIst,
                mengeProblem: menge,
                typ,
                kommentar,
                sourceUebernahmeId: existing.uebernahmeId,
                createdAt: previous?.createdAt || nowIso(),
                createdBy: previous?.createdBy || currentUser?.mode || ''
            });
        });

        const ungeprueft = Math.max(0, mengeSoll - mengeIst - problemTotal);
        if (ungeprueft > 0) {
            hasUnchecked = true;
        }

        const dominantProblemTyp = Object.entries(problemVerteilung)
            .sort((left, right) => right[1] - left[1])[0]?.[0] || null;
        const finalTyp = dominantProblemTyp
            ? dominantProblemTyp
            : (ungeprueft > 0 ? 'nicht_geprueft' : (mengeIst > mengeSoll ? 'zuviel' : 'ok'));

        positionen.push({
            inhaltId,
            mengeSoll,
            mengeIst,
            abweichungstyp: finalTyp,
            problemVerteilung,
            kommentar,
            bestaetigtAt: ungeprueft > 0 ? null : nowIso()
        });
    });

    const resolutionRows = document.querySelectorAll('#sendungWarenuebernahmeProblemList .sendung-wa-problem-resolution-row');
    resolutionRows.forEach((row) => {
        const mengeRaw = Number.parseInt(row.dataset.counter || '0', 10);
        const menge = Number.isFinite(mengeRaw) && mengeRaw > 0 ? mengeRaw : 0;
        if (menge <= 0) return;

        const problemPotEntryId = String(row.dataset.problemPotEntryId || '').trim();
        const inhaltId = String(row.dataset.inhaltId || '').trim();
        const action = String(row.querySelector('.sendung-wa-resolution-action')?.value || 'zuweisen').trim().toLowerCase();
        const zielPaketId = String(row.querySelector('.sendung-wa-resolution-target')?.value || '').trim();
        const geloestTyp = String(row.querySelector('.sendung-wa-resolution-geloest-typ')?.value || 'sonstiges').trim().toLowerCase();
        const kommentar = String(row.querySelector('.sendung-wa-resolution-kommentar')?.value || '').trim();

        if (!problemPotEntryId || !inhaltId) return;
        if (action === 'zuweisen' && !zielPaketId) return;

        problemaufloesungen.push(normalizeWarenuebernahmeProblemResolution({
            resolutionId: createProblemResolutionId(),
            problemPotEntryId,
            inhaltId,
            menge,
            aktion: action === 'zuweisen' ? 'zuweisen' : 'geloest',
            zielPaketId: action === 'zuweisen' ? zielPaketId : '',
            geloestTyp: action === 'geloest' ? geloestTyp : '',
            kommentar,
            createdAt: nowIso(),
            createdBy: currentUser?.mode || ''
        }));
    });

    let status = 'offen';
    if (positionen.length > 0) {
        status = hasUnchecked
            ? 'in_pruefung'
            : (problemartikel.length > 0 ? 'problem' : 'abgeschlossen');
    }

    const istFinalisiert = status === 'abgeschlossen' || status === 'problem';

    return normalizeWarenuebernahme({
        ...existing,
        aktiv: true,
        startedAt: existing.startedAt || nowIso(),
        completedAt: istFinalisiert ? (existing.completedAt || nowIso()) : null,
        status,
        positionen,
        problemartikel,
        problemaufloesungen,
        updatedAt: nowIso(),
        updatedBy: currentUser?.mode || ''
    });
}

function getFlatTransportEntriesFromPakete(pakete = []) {
    const entries = pakete
        .flatMap((paket) => normalizeTransportEntries(paket.transportEntries))
        .map(normalizeTransportEntry)
        .filter((entry) => entry.anbieter || entry.transportnummer);

    const primary = entries[0] || { ...EMPTY_TRANSPORT_ENTRY };
    return { entries, primary };
}

async function writeWarenuebernahmeAudit(sendungId, paket, action, payloadDelta = {}) {
    if (!sendungId || !sendungenCollectionRef) return;

    try {
        const sendungRef = doc(sendungenCollectionRef, sendungId);
        const auditCollectionRef = collection(sendungRef, 'warenuebernahme_audit');
        await addDoc(auditCollectionRef, {
            timestamp: serverTimestamp(),
            clientTimestamp: nowIso(),
            userId: currentUser?.mode || '',
            paketId: paket?.paketId || '',
            uebernahmeId: paket?.warenuebernahme?.uebernahmeId || '',
            action,
            payloadDelta
        });
    } catch (error) {
        console.warn('[Sendungsverwaltung] Audit-Log konnte nicht gespeichert werden:', error);
    }
}

async function saveWarenuebernahmeFromModal() {
    const paketIndex = currentWarenuebernahmePaketIndex;
    const paket = currentSendungPakete[paketIndex];
    if (!paket) return;

    const aktualisiert = collectWarenuebernahmeFromModal();
    if (!aktualisiert) return;

    paket.warenuebernahme = aktualisiert;
    paket.status = applyWarenuebernahmeStatusToPaket(paket);

    ensureInhaltZuordnungConsistency();
    renderPaketeEditor();
    syncOverallStatusWithPakete();

    if (!currentEditingSendungId || !sendungenCollectionRef) {
        closeWarenuebernahmeModal();
        return;
    }

    try {
        const pakete = collectPaketeForSave();
        const inhalt = collectInhaltItemsForSave();
        const offenerInhaltPot = computeOffenerInhaltPot(inhalt, pakete);
        const warenuebernahmeProblemPot = computeProblemPotFromPakete(pakete, inhalt);
        const autoStatus = computeAutoStatusFromPakete(pakete);
        const selectedStatus = normalizeStatus(document.getElementById('sendungStatus')?.value || autoStatus);
        const finalStatus = statusOverrideActive ? selectedStatus : autoStatus;
        const isStatusOverride = statusOverrideActive && finalStatus !== autoStatus;
        const { entries: flatTransportEntries, primary } = getFlatTransportEntriesFromPakete(pakete);

        const sendungRef = doc(sendungenCollectionRef, currentEditingSendungId);
        await updateDoc(sendungRef, {
            status: finalStatus,
            autoStatus,
            statusOverrideAktiv: isStatusOverride,
            pakete,
            inhalt,
            offenerInhaltPot,
            warenuebernahmeProblemPot,
            anbieter: primary.anbieter,
            transportnummer: primary.transportnummer,
            sendungsnummer: primary.transportnummer,
            transportEntries: flatTransportEntries,
            deadlineErwartet: getEarliestPaketDeadline(pakete, 'deadlineErwartet'),
            deadlineVersand: getEarliestPaketDeadline(pakete, 'deadlineVersand'),
            updatedAt: serverTimestamp()
        });

        await writeWarenuebernahmeAudit(
            currentEditingSendungId,
            pakete[paketIndex],
            'buchen',
            {
                status: aktualisiert.status,
                totalProblem: aktualisiert.zusammenfassung.totalProblem,
                totalSoll: aktualisiert.zusammenfassung.totalSoll,
                totalIst: aktualisiert.zusammenfassung.totalIst
            }
        );

        closeWarenuebernahmeModal();
        alertUser('Warenübernahme gebucht und synchronisiert.');
    } catch (error) {
        console.error('[Sendungsverwaltung] Fehler beim Speichern der Warenübernahme:', error);
        alertUser('Fehler beim Speichern der Warenübernahme: ' + error.message);
    }
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
    ensureInhaltZuordnungConsistency();
    renderPaketeEditor();
    syncOverallStatusWithPakete();
}

function removePaket(paketIndex) {
    if (currentSendungPakete.length <= 1) {
        return;
    }
    currentSendungPakete.splice(paketIndex, 1);
    currentSendungPakete = currentSendungPakete.map((paket, index) => normalizePaket({ ...paket, paketLabel: `Paket ${index + 1}` }, index));
    ensureInhaltZuordnungConsistency();
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
        const normalizedWarenuebernahme = normalizeWarenuebernahme(paket.warenuebernahme || {});
        if (normalizedWarenuebernahme.aktiv) {
            paket.status = applyWarenuebernahmeStatusToPaket(paket);
        }
        syncOverallStatusWithPakete();
    }
}

function updateTransportEntryField(paketIndex, entryIndex, field, value) {
    const paket = currentSendungPakete[paketIndex];
    if (!paket || !paket.transportEntries[entryIndex]) return;
    paket.transportEntries[entryIndex][field] = String(value || '').trim();
}

function collectPaketeForSave() {
    ensureInhaltZuordnungConsistency();

    const normalized = currentSendungPakete.map((paket, index) => {
        const cleanedEntries = normalizeTransportEntries(paket.transportEntries)
            .map(normalizeTransportEntry)
            .filter((entry) => entry.anbieter || entry.transportnummer);

        const cleanedZuordnung = Array.isArray(paket.inhaltZuordnung)
            ? paket.inhaltZuordnung
                .map(normalizeInhaltZuordnungEntry)
                .filter((entry) => entry.inhaltId && entry.mengeSoll > 0)
            : [];

        const normalizedPaket = normalizePaket({
            ...paket,
            paketLabel: `Paket ${index + 1}`,
            transportEntries: cleanedEntries,
            inhaltZuordnung: cleanedZuordnung,
            warenuebernahme: normalizeWarenuebernahme(paket.warenuebernahme || {})
        }, index);

        normalizedPaket.status = applyWarenuebernahmeStatusToPaket(normalizedPaket);

        return {
            ...normalizedPaket,
            transportEntries: cleanedEntries,
            inhaltZuordnung: cleanedZuordnung,
            warenuebernahme: normalizeWarenuebernahme(normalizedPaket.warenuebernahme || {})
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
        addPaketBtn.classList.toggle('hidden', readMode);
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

    const editModeOnlyElements = container.querySelectorAll('.sendung-editmode-only');
    editModeOnlyElements.forEach((element) => {
        element.classList.toggle('hidden', readMode);
    });

    if (readMode) {
        const paketStatusSelects = container.querySelectorAll('.sendung-paket-status-select');
        paketStatusSelects.forEach((select) => {
            const statusLocked = select.dataset.warenuebernahmeLocked === 'true';
            select.disabled = statusLocked;
            select.classList.toggle('opacity-50', statusLocked);
            select.classList.toggle('cursor-not-allowed', statusLocked);
        });

        const copyButtons = container.querySelectorAll('.sendung-copy-transportnummer-btn');
        copyButtons.forEach((button) => {
            button.disabled = false;
        });

        const trackingButtons = container.querySelectorAll('.sendung-open-tracking-options-btn');
        trackingButtons.forEach((button) => {
            button.disabled = false;
        });

        const warenuebernahmeButtons = container.querySelectorAll('.sendung-open-warenuebernahme-btn');
        warenuebernahmeButtons.forEach((button) => {
            button.disabled = false;
        });
    }

    if (!readMode) {
        const paketStatusSelects = container.querySelectorAll('.sendung-paket-status-select');
        paketStatusSelects.forEach((select) => {
            const statusLocked = select.dataset.warenuebernahmeLocked === 'true';
            select.disabled = statusLocked;
            select.classList.toggle('opacity-50', statusLocked);
            select.classList.toggle('cursor-not-allowed', statusLocked);
        });
    }
}

function renderPaketeEditor() {
    const container = getPaketeContainer();
    if (!container) return;

    ensureInhaltZuordnungConsistency();

    const isEmpfang = isEmpfangContextActive();
    const totalOffen = currentOffenerInhaltPot.reduce((sum, entry) => sum + (entry.mengeOffen || 0), 0);

    container.innerHTML = currentSendungPakete.map((paket, paketIndex) => {
        const warenuebernahmeMeta = getWarenuebernahmeStatusMeta(paket);
        const zuordnungSummary = getPaketZuordnungSummary(paket);
        const statusLocked = normalizeWarenuebernahme(paket.warenuebernahme || {}).aktiv;

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
                        : `<button type="button" class="sendung-remove-transport-entry-btn sendung-editmode-only w-10 h-10 shrink-0 rounded-full bg-red-500 text-white font-bold hover:bg-red-600 transition" data-paket-index="${paketIndex}" data-entry-index="${entryIndex}" title="Nummer entfernen">-</button>`}
                </div>
            </div>
        `;
        }).join('');

        return `
            <div class="rounded-lg border border-amber-200 bg-white p-3">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <h5 class="font-bold text-amber-800">📦 Paket ${paketIndex + 1}</h5>
                    <div class="flex flex-col items-end gap-1">
                        <div class="flex items-center gap-2">
                            <select class="sendung-paket-status-select p-2 border-2 border-gray-300 rounded-lg bg-white text-sm" data-paket-index="${paketIndex}" data-warenuebernahme-locked="${statusLocked ? 'true' : 'false'}">
                                ${statusOptions}
                            </select>
                            ${paketIndex === 0
                                ? ''
                                : `<button type="button" class="sendung-remove-paket-btn sendung-editmode-only px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition" data-paket-index="${paketIndex}" title="Paket entfernen">- Paket</button>`}
                        </div>
                        ${(isEmpfang && statusLocked)
                            ? `<button type="button" class="sendung-open-warenuebernahme-btn sendung-readmode-only hidden px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition" data-paket-index="${paketIndex}">Warenübernahme öffnen</button>`
                            : ''}
                    </div>
                </div>

                ${isEmpfang
                    ? `<div class="mt-2 flex flex-wrap gap-2 items-center text-xs">
                        <span class="px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-semibold">Zuordnung: ${zuordnungSummary.positionen} Pos., ${zuordnungSummary.menge} Stk</span>
                        <span class="px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 font-semibold">Offener Pot: ${totalOffen} Stk</span>
                        <span class="px-2 py-1 rounded-full ${warenuebernahmeMeta.color} font-semibold">Warenübernahme: ${warenuebernahmeMeta.label}</span>
                    </div>
                    <div class="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                        <button type="button" class="sendung-open-zuordnung-btn sendung-editmode-only px-3 py-2 rounded-lg bg-indigo-500 text-white text-xs font-bold hover:bg-indigo-600 transition" data-paket-index="${paketIndex}">Artikel zuordnen</button>
                        <label class="sendung-editmode-only flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white">
                            <input type="checkbox" class="sendung-paket-warenuebernahme-toggle" data-paket-index="${paketIndex}" ${normalizeWarenuebernahme(paket.warenuebernahme || {}).aktiv ? 'checked' : ''}>
                            <span class="font-semibold text-gray-700">Warenübernahme aktiv</span>
                        </label>
                        <div class="sendung-editmode-only"></div>
                    </div>`
                    : ''}

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
                        <button type="button" class="sendung-add-transport-entry-btn sendung-editmode-only px-2 py-1 rounded bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition" data-paket-index="${paketIndex}">+ Nummer</button>
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

    container.querySelectorAll('.sendung-open-zuordnung-btn').forEach((button) => {
        button.onclick = () => {
            const paketIndex = Number.parseInt(button.dataset.paketIndex || '-1', 10);
            openInhaltZuordnungModal(paketIndex);
        };
    });

    container.querySelectorAll('.sendung-paket-warenuebernahme-toggle').forEach((toggle) => {
        toggle.onchange = () => {
            const paketIndex = Number.parseInt(toggle.dataset.paketIndex || '-1', 10);
            const paket = currentSendungPakete[paketIndex];
            if (!paket || !isEmpfangContextActive()) return;

            const normalizedWarenuebernahme = normalizeWarenuebernahme(paket.warenuebernahme || {});
            normalizedWarenuebernahme.aktiv = toggle.checked;
            normalizedWarenuebernahme.updatedAt = nowIso();
            normalizedWarenuebernahme.updatedBy = currentUser?.mode || '';
            if (toggle.checked && !normalizedWarenuebernahme.startedAt) {
                normalizedWarenuebernahme.startedAt = nowIso();
            }
            if (!toggle.checked) {
                normalizedWarenuebernahme.status = 'offen';
                normalizedWarenuebernahme.completedAt = null;
            }

            paket.warenuebernahme = normalizedWarenuebernahme;
            paket.status = applyWarenuebernahmeStatusToPaket(paket);

            ensureInhaltZuordnungConsistency();
            renderPaketeEditor();
            syncOverallStatusWithPakete();
        };
    });

    container.querySelectorAll('.sendung-open-warenuebernahme-btn').forEach((button) => {
        button.onclick = () => {
            const paketIndex = Number.parseInt(button.dataset.paketIndex || '-1', 10);
            openWarenuebernahmeModal(paketIndex);
        };
    });

    applyPaketeReadMode(isSendungModalReadMode);
    renderEmpfangPotOverview();
}

function setPakete(pakete = []) {
    const normalized = Array.isArray(pakete)
        ? pakete.map((paket, index) => normalizePaket(paket, index))
        : [];
    currentSendungPakete = normalized.length > 0
        ? normalized
        : [normalizePaket({ status: 'erwartet' }, 0)];

    ensureInhaltZuordnungConsistency();

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
    const closeInhaltZuordnungBtn = document.getElementById('closeSendungInhaltZuordnungModal');
    const applyInhaltZuordnungBtn = document.getElementById('applySendungInhaltZuordnungBtn');
    const inhaltZuordnungModal = document.getElementById('sendungInhaltZuordnungModal');
    const closeWarenuebernahmeBtn = document.getElementById('closeSendungWarenuebernahmeModal');
    const resetWarenuebernahmeBtn = document.getElementById('resetSendungWarenuebernahmeBtn');
    const saveWarenuebernahmeBtn = document.getElementById('saveSendungWarenuebernahmeBtn');
    const warenuebernahmeModal = document.getElementById('sendungWarenuebernahmeModal');

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

    if (closeInhaltZuordnungBtn) {
        closeInhaltZuordnungBtn.onclick = () => closeInhaltZuordnungModal();
    }

    if (applyInhaltZuordnungBtn) {
        applyInhaltZuordnungBtn.onclick = () => applyInhaltZuordnungModal();
    }

    if (inhaltZuordnungModal) {
        inhaltZuordnungModal.onclick = (event) => {
            if (event.target === inhaltZuordnungModal) {
                closeInhaltZuordnungModal();
            }
        };
    }

    if (closeWarenuebernahmeBtn) {
        closeWarenuebernahmeBtn.onclick = () => closeWarenuebernahmeModal();
    }

    if (resetWarenuebernahmeBtn) {
        resetWarenuebernahmeBtn.onclick = () => handleWarenuebernahmeResetRequest();
    }

    if (saveWarenuebernahmeBtn) {
        saveWarenuebernahmeBtn.onclick = () => saveWarenuebernahmeFromModal();
    }

    if (warenuebernahmeModal) {
        warenuebernahmeModal.onclick = (event) => {
            if (event.target === warenuebernahmeModal) {
                closeWarenuebernahmeModal();
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

            renderPaketeEditor();
            renderEmpfangPotOverview();
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
    closeInhaltZuordnungModal();
    closeWarenuebernahmeModal();
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

    const erinnerungenToggleWrapper = document.getElementById('sendungErinnerungenAktiv')?.closest('div.flex.items-center');
    if (erinnerungenToggleWrapper) {
        erinnerungenToggleWrapper.classList.toggle('hidden', readMode);
    }

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
    renderEmpfangPotOverview();
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

    currentOffenerInhaltPot = [];
    currentWarenuebernahmeProblemPot = [];
    currentZuordnungPaketIndex = null;
    currentWarenuebernahmePaketIndex = null;

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

    currentOffenerInhaltPot = getSendungOffenerInhaltPot(sendung);
    currentWarenuebernahmeProblemPot = getSendungWarenuebernahmeProblemPot(sendung);

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
    renderEmpfangPotOverview();
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
    const typ = document.getElementById('sendungTyp')?.value || 'empfang';
    const isEmpfangTyp = isEmpfangTypValue(typ);

    if (currentEditingSendungId && isSendungModalReadMode) {
        try {
            const rawPakete = collectPaketeForSave();
            const pakete = isEmpfangTyp
                ? rawPakete
                : rawPakete.map((paket) => {
                    const { inhaltZuordnung, warenuebernahme, ...rest } = paket;
                    return rest;
                });
            const inhalt = collectInhaltItemsForSave();
            const offenerInhaltPot = isEmpfangTyp ? computeOffenerInhaltPot(inhalt, rawPakete) : [];
            const warenuebernahmeProblemPot = isEmpfangTyp ? computeProblemPotFromPakete(rawPakete, inhalt) : [];
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
                inhalt,
                offenerInhaltPot,
                warenuebernahmeProblemPot,
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
    const rawPakete = collectPaketeForSave();
    const pakete = isEmpfangTyp
        ? rawPakete
        : rawPakete.map((paket) => {
            const { inhaltZuordnung, warenuebernahme, ...rest } = paket;
            return rest;
        });
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

    const inhaltArray = collectInhaltItemsForSave();
    const offenerInhaltPot = isEmpfangTyp ? computeOffenerInhaltPot(inhaltArray, rawPakete) : [];
    const warenuebernahmeProblemPot = isEmpfangTyp ? computeProblemPotFromPakete(rawPakete, inhaltArray) : [];

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
        offenerInhaltPot,
        warenuebernahmeProblemPot,
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
    const inhaltItems = getSendungInhaltItems(sendung);
    const offenerPot = getSendungOffenerInhaltPot(sendung);
    const problemPot = getSendungWarenuebernahmeProblemPot(sendung);

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

    const empfangMetaDisplay = sendung.typ === 'empfang'
        ? `<div class="ml-8 mt-2 space-y-1">
            <div class="flex flex-wrap gap-1.5 text-[11px]">
                <span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold">Zuordnungs-Pot: ${offenerPot.reduce((sum, entry) => sum + (entry.mengeOffen || 0), 0)} Stk</span>
                <span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Problem-Pot: ${problemPot.reduce((sum, entry) => sum + (entry.mengeProblem || 0), 0)} Stk</span>
            </div>
            <div class="flex flex-wrap gap-1.5 text-[11px]">
                ${pakete.map((paket, index) => {
                    const waMeta = getWarenuebernahmeStatusMeta(paket);
                    const zuordnungSummary = getPaketZuordnungSummary(paket, inhaltItems);
                    return `<span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">P${index + 1}: ${zuordnungSummary.menge} Stk • WA ${waMeta.label}</span>`;
                }).join('')}
            </div>
        </div>`
        : '';

    if (!sendungShowDetails) {
        return `
            <div id="sendung-${sendung.id}" class="card bg-white p-4 rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer border-l-4 ${getBorderColor(sendung.typ)} ${cardLayoutClass}">
                <h3 class="text-lg font-bold ${typInfo.color} break-words mb-3">${sendung.beschreibung}</h3>
                <div class="space-y-2 text-sm">
                    ${transportEntriesDisplay}
                    <p class="font-semibold text-orange-600">${deadlineText ? `⏰ ${deadlineText}` : '⏰ Keine Deadline gesetzt'}</p>
                    ${empfangMetaDisplay}
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
            ${empfangMetaDisplay}

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
