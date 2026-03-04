import {
    alertUser,
    appId,
    currentUser,
    db,
    escapeHtml,
    GUEST_MODE
} from './haupteingang.js';

import {
    collection,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const TIME_ZONE = 'Europe/Vienna';
const MAX_DAILY_USAGE = 2;

const CARDS = [
    { id: 'markus', label: 'Markus', accent: 'from-red-500 to-rose-600' },
    { id: 'jasmin', label: 'Jasmin', accent: 'from-sky-500 to-cyan-600' }
];

function isValidDayKey(dayKey) {
    return typeof dayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dayKey);
}

function formatDayKeyLabel(dayKey) {
    if (!isValidDayKey(dayKey)) return '--';

    const parsed = new Date(`${dayKey}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dayKey;

    return new Intl.DateTimeFormat('de-AT', {
        timeZone: TIME_ZONE,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(parsed);
}

function getActiveModalHistoryDayKey() {
    if (isValidDayKey(modalHistoryDayKey)) return modalHistoryDayKey;
    return getDayKeyNow();
}

function resetModalHistorySelection() {
    modalHistoryDayKey = null;
    modalHistoryArchivedEvents = [];
    modalHistoryLoading = false;
    modalHistoryPickerOpen = false;
    modalHistoryLoadRequestId += 1;
}

function getHistoryEventsForDay(dayKey) {
    if (dayKey === currentDayKey) {
        return usageEvents;
    }
    return modalHistoryArchivedEvents;
}

async function loadModalHistoryForDay(dayKey) {
    if (!isValidDayKey(dayKey)) return;

    const requestId = ++modalHistoryLoadRequestId;
    modalHistoryLoading = true;
    modalHistoryArchivedEvents = [];
    renderMitarbeiterkarte();

    if (dayKey === currentDayKey) {
        modalHistoryLoading = false;
        renderMitarbeiterkarte();
        return;
    }

    try {
        const dayDocRef = getDayDocRef(dayKey);
        const eventsQuery = query(collection(dayDocRef, 'events'), orderBy('createdAt', 'desc'), limit(250));
        const snapshot = await getDocs(eventsQuery);

        if (requestId !== modalHistoryLoadRequestId) return;
        modalHistoryArchivedEvents = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (error) {
        if (requestId !== modalHistoryLoadRequestId) return;
        console.error('MA-Karte: Fehler beim Laden eines Archiv-Tages:', error);
        alertUser('MA-Karte: Protokoll für den gewählten Tag konnte nicht geladen werden.', 'error');
    } finally {
        if (requestId !== modalHistoryLoadRequestId) return;
        modalHistoryLoading = false;
        renderMitarbeiterkarte();
    }
}

function setModalHistoryDay(dayKey) {
    if (!isValidDayKey(dayKey)) return;
    modalHistoryDayKey = dayKey;
    void loadModalHistoryForDay(dayKey);
}

function isDayKeyInRange(dayKey, fromDayKey, toDayKey) {
    if (!isValidDayKey(dayKey) || !isValidDayKey(fromDayKey) || !isValidDayKey(toDayKey)) {
        return false;
    }
    return dayKey >= fromDayKey && dayKey <= toDayKey;
}

function toSafeVoucherLimit(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 1;
    return Math.max(1, Math.min(MAX_VOUCHER_LIMIT, Math.round(parsed)));
}

function toSafeVoucherCount(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.round(parsed));
}

function getVoucherCollectionRef() {
    return collection(db, 'artifacts', appId, 'public', 'data', 'ma-karten_gutscheine');
}

function getVoucherDocRef(voucherId) {
    return doc(db, 'artifacts', appId, 'public', 'data', 'ma-karten_gutscheine', voucherId);
}

function normalizeVoucher(rawData, id) {
    const maxRedemptions = toSafeVoucherLimit(rawData?.maxRedemptions);
    const usageTotal = toSafeVoucherCount(rawData?.usageTotal);
    const usageByUserRaw = rawData?.usageByUser;
    const usageByUser = {};

    if (usageByUserRaw && typeof usageByUserRaw === 'object') {
        Object.entries(usageByUserRaw).forEach(([userId, value]) => {
            if (!userId) return;
            usageByUser[userId] = toSafeVoucherCount(value);
        });
    }

    return {
        id,
        cardId: rawData?.cardId === 'jasmin' ? 'jasmin' : 'markus',
        title: typeof rawData?.title === 'string' ? rawData.title : '',
        conditionText: typeof rawData?.conditionText === 'string' ? rawData.conditionText : '',
        validFromDayKey: isValidDayKey(rawData?.validFromDayKey) ? rawData.validFromDayKey : getDayKeyNow(),
        validToDayKey: isValidDayKey(rawData?.validToDayKey) ? rawData.validToDayKey : getDayKeyNow(),
        infoText: typeof rawData?.infoText === 'string' ? rawData.infoText : '',
        createdById: typeof rawData?.createdById === 'string' ? rawData.createdById : '',
        createdByName: typeof rawData?.createdByName === 'string' ? rawData.createdByName : 'Unbekannt',
        createdAt: rawData?.createdAt || null,
        updatedAt: rawData?.updatedAt || null,
        maxRedemptions,
        usageTotal,
        usageByUser,
        deleted: Boolean(rawData?.deleted)
    };
}

function getVouchersForCard(cardId) {
    return mitarbeitergutscheine
        .filter((entry) => !entry.deleted && entry.cardId === cardId)
        .sort((a, b) => {
            const aDate = timestampToDate(a.updatedAt, null)?.getTime() || 0;
            const bDate = timestampToDate(b.updatedAt, null)?.getTime() || 0;
            return bDate - aDate;
        });
}

function getActiveVouchersForCard(cardId, dayKey) {
    return getVouchersForCard(cardId).filter((entry) => isDayKeyInRange(dayKey, entry.validFromDayKey, entry.validToDayKey));
}

function getVoucherById(voucherId) {
    return mitarbeitergutscheine.find((entry) => entry.id === voucherId) || null;
}

function isVoucherExpired(voucher, dayKey) {
    if (!voucher || !isValidDayKey(voucher.validToDayKey) || !isValidDayKey(dayKey)) return false;
    return voucher.validToDayKey < dayKey;
}

function getOwnVoucherUsedCount(voucher, userId) {
    if (!voucher || !userId) return 0;
    return toSafeVoucherCount(voucher.usageByUser?.[userId]);
}

function getVoucherStatusClasses(usedCount, maxCount) {
    if (usedCount >= maxCount) {
        return 'bg-red-100 text-red-700 border-red-200';
    }
    if (usedCount > 0) {
        return 'bg-amber-100 text-amber-700 border-amber-200';
    }
    return 'bg-violet-100 text-violet-700 border-violet-200';
}

function resetVoucherModalState() {
    voucherManagerCardId = null;
    voucherManagerEditVoucherId = null;
    voucherManagerShowExpired = false;
}

const COMPANIES = [
    { id: 'billa', label: 'BILLA / BILLA PLUS' },
    { id: 'penny', label: 'PENNY' },
    { id: 'bipa', label: 'BIPA' }
];

const COMPANY_LOGO_PATHS = {
    billa: 'assets/ma-karte/logo-billa-billaplus.png',
    penny: 'assets/ma-karte/logo-penny.png',
    bipa: 'assets/ma-karte/logo-bipa.png'
};

const CARD_ART_PATH = 'assets/ma-karte/rewe-mitarbeiterkarte.svg';
const MAX_VOUCHER_LIMIT = 999;

let unsubscribeDailyUsage = null;
let unsubscribeEvents = null;
let unsubscribeVoucherDefinitions = null;
let dayWatcherTimer = null;
let currentDayKey = null;
let currentUserMode = null;
let dailyUsageState = buildEmptyUsageState();
let usageEvents = [];
let mitarbeitergutscheine = [];
let modalInfoCardId = null;
let modalHistoryDayKey = null;
let modalHistoryArchivedEvents = [];
let modalHistoryLoading = false;
let modalHistoryPickerOpen = false;
let modalHistoryLoadRequestId = 0;
let modalInfoMenuOpen = false;
let voucherManagerCardId = null;
let voucherManagerEditVoucherId = null;
let voucherManagerShowExpired = false;
let voucherAccordionOpen = {
    markus: false,
    jasmin: false
};
let listenersAttached = false;
const actionInFlight = new Set();

function buildEmptyCardUsage() {
    return {
        markus: { billa: 0, penny: 0, bipa: 0 },
        jasmin: { billa: 0, penny: 0, bipa: 0 }
    };
}

function buildEmptyUsageState() {
    return {
        cards: buildEmptyCardUsage(),
        userUsageCounts: {}
    };
}

function getDayKeyNow() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE }).format(new Date());
}

function formatCurrentDayLabel() {
    return new Intl.DateTimeFormat('de-AT', {
        timeZone: TIME_ZONE,
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

function getRootElement() {
    return document.getElementById('maKarteAppRoot');
}

function getDayDocRef(dayKey) {
    return doc(db, 'artifacts', appId, 'public', 'data', 'ma-karten_daily', dayKey);
}

function getCompanyLabel(companyId) {
    const company = COMPANIES.find((entry) => entry.id === companyId);
    return company ? company.label : companyId;
}

function getCardConfig(cardId) {
    return CARDS.find((entry) => entry.id === cardId) || null;
}

function toSafeCount(value) {
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber)) return 0;
    return Math.max(0, Math.min(MAX_DAILY_USAGE, Math.round(asNumber)));
}

function normalizeUserUsageCounts(rawUserUsageCounts) {
    const normalized = {};
    if (!rawUserUsageCounts || typeof rawUserUsageCounts !== 'object') return normalized;

    Object.entries(rawUserUsageCounts).forEach(([userId, rawCardCounts]) => {
        if (!userId || !rawCardCounts || typeof rawCardCounts !== 'object') return;

        const emptyCardUsage = buildEmptyCardUsage();
        CARDS.forEach((card) => {
            const cardData = rawCardCounts[card.id] || {};
            emptyCardUsage[card.id] = {
                billa: toSafeCount(cardData.billa),
                penny: toSafeCount(cardData.penny),
                bipa: toSafeCount(cardData.bipa)
            };
        });

        normalized[userId] = emptyCardUsage;
    });

    return normalized;
}

function normalizeDailyUsageState(rawData) {
    const fallback = buildEmptyUsageState();
    if (!rawData || typeof rawData !== 'object') return fallback;

    const cards = { ...fallback.cards };

    CARDS.forEach((card) => {
        const cardData = rawData.cards?.[card.id] || {};
        cards[card.id] = {
            billa: toSafeCount(cardData.billa),
            penny: toSafeCount(cardData.penny),
            bipa: toSafeCount(cardData.bipa)
        };
    });

    const userUsageCounts = normalizeUserUsageCounts(rawData.userUsageCounts);
    return { cards, userUsageCounts };
}

function getRemainingCount(usedCount) {
    return Math.max(0, MAX_DAILY_USAGE - usedCount);
}

function getOwnUsedCount(state, userId, cardId, companyId) {
    if (!userId) return 0;
    return toSafeCount(state?.userUsageCounts?.[userId]?.[cardId]?.[companyId]);
}

function getStatusClasses(usedCount) {
    if (usedCount >= MAX_DAILY_USAGE) {
        return 'bg-red-100 text-red-700 border-red-200';
    }
    if (usedCount === 1) {
        return 'bg-amber-100 text-amber-700 border-amber-200';
    }
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

function timestampToDate(value, fallbackIso) {
    if (value && typeof value.toDate === 'function') {
        return value.toDate();
    }

    if (typeof fallbackIso === 'string') {
        const fallbackDate = new Date(fallbackIso);
        if (!Number.isNaN(fallbackDate.getTime())) {
            return fallbackDate;
        }
    }

    return null;
}

function formatEventDate(eventEntry) {
    const eventDate = timestampToDate(eventEntry.createdAt, eventEntry.clientTimestampIso);
    if (!eventDate) return '--:--';

    return new Intl.DateTimeFormat('de-AT', {
        timeZone: TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(eventDate);
}

function renderCardHistory(cardId, dayKey) {
    const selectedDayLabel = formatDayKeyLabel(dayKey);

    if (modalHistoryLoading) {
        return `<p class="text-sm text-gray-500">Lade Protokoll für ${escapeHtml(selectedDayLabel)} ...</p>`;
    }

    const historyEntries = getHistoryEventsForDay(dayKey).filter((entry) => entry.cardId === cardId);

    if (!historyEntries.length) {
        return `<p class="text-sm text-gray-500">Für ${escapeHtml(selectedDayLabel)} gibt es keine Einträge.</p>`;
    }

    return historyEntries.map((entry) => {
        const isVoucherEvent = entry?.entryType === 'voucher' || typeof entry?.voucherId === 'string';
        const isAdd = Number(entry.delta) > 0;
        const actionBadge = isVoucherEvent
            ? `<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">${isAdd ? '+ Verwendung' : '- Korrektur'} · Sonderfall</span>`
            : (isAdd
                ? '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">+ Verwendung</span>'
                : '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">- Korrektur</span>');

        const actorLabel = escapeHtml(entry.actorName || 'Unbekannt');
        const usedCardLabel = escapeHtml(getCardConfig(entry.cardId)?.label || cardId || 'Unbekannt');
        const companyLabel = isVoucherEvent
            ? `Gutschein: ${escapeHtml(entry.voucherTitle || 'Unbenannt')}`
            : escapeHtml(entry.companyLabel || getCompanyLabel(entry.company));

        return `
            <li class="py-3 border-b-2 border-slate-200 last:border-b-0">
                <div class="flex items-center justify-between gap-2 flex-wrap">
                    <span class="text-xs text-gray-500">${formatEventDate(entry)}</span>
                    <span class="inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1 text-xs font-bold">${actorLabel}</span>
                </div>
                <div class="mt-1 flex items-center gap-2 flex-wrap">
                    ${actionBadge}
                    <p class="text-sm text-gray-700">
                        MA-Karte <span class="inline-flex items-center rounded-md bg-orange-100 text-orange-700 px-2 py-0.5 font-bold">${usedCardLabel}</span> · ${companyLabel}
                    </p>
                </div>
            </li>
        `;
    }).join('');
}

function renderVoucherAccordion(cardId, dayKey) {
    const activeVouchers = getActiveVouchersForCard(cardId, dayKey);
    const hasActiveVouchers = activeVouchers.length > 0;
    const isOpen = hasActiveVouchers && Boolean(voucherAccordionOpen[cardId]);
    const caret = isOpen ? '&#9650;' : '&#9660;';

    const headerClasses = hasActiveVouchers
        ? 'cursor-pointer bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 text-white shadow-sm hover:opacity-95'
        : 'cursor-not-allowed bg-gradient-to-r from-slate-300 to-slate-400 text-white/95 opacity-80';

    const rowsHtml = hasActiveVouchers
        ? activeVouchers.map((voucher) => {
            const usedCount = toSafeVoucherCount(voucher.usageTotal);
            const maxCount = toSafeVoucherLimit(voucher.maxRedemptions);
            const ownUsedCount = getOwnVoucherUsedCount(voucher, currentUser?.mode || null);
            const remainingCount = Math.max(0, maxCount - usedCount);
            const ownCanReduce = ownUsedCount > 0;
            const canAdd = remainingCount > 0;

            const conditionHtml = voucher.conditionText
                ? `<p class="text-xs text-slate-600 mt-1">Bedingung: ${escapeHtml(voucher.conditionText)}</p>`
                : '';

            const infoHtml = voucher.infoText
                ? `<p class="text-xs text-slate-500 mt-1">Info: ${escapeHtml(voucher.infoText)}</p>`
                : '';

            return `
                <div class="rounded-xl border border-violet-200 bg-white p-2.5">
                    <div class="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                            <p class="text-sm font-black text-violet-800 leading-tight">${escapeHtml(voucher.title || 'Unbenannter Gutschein')}</p>
                            <p class="text-xs text-slate-500 mt-1">${usedCount} verwendet · davon du ${ownUsedCount}</p>
                            <p class="text-xs text-slate-500 mt-1">Von ${escapeHtml(voucher.createdByName || 'Unbekannt')} · gültig ${escapeHtml(formatDayKeyLabel(voucher.validFromDayKey))} bis ${escapeHtml(formatDayKeyLabel(voucher.validToDayKey))}</p>
                            ${conditionHtml}
                            ${infoHtml}
                        </div>
                        <span class="text-[11px] font-black px-2 py-1 rounded-full border whitespace-nowrap ${getVoucherStatusClasses(usedCount, maxCount)}">${remainingCount} frei</span>
                    </div>
                    <div class="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <button
                            data-action="add-voucher-usage"
                            data-voucher-id="${escapeHtml(voucher.id)}"
                            class="rounded-lg px-3 py-2 text-sm font-black tracking-wide transition ${canAdd ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}"
                            ${canAdd ? '' : 'disabled'}
                        >
                            Verwendung hinzufügen
                        </button>
                        <button
                            data-action="remove-voucher-usage"
                            data-voucher-id="${escapeHtml(voucher.id)}"
                            class="rounded-lg px-3 py-2 text-lg leading-none font-black transition ${ownCanReduce ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}"
                            ${ownCanReduce ? '' : 'disabled'}
                            aria-label="Gutscheinverwendung reduzieren"
                        >
                            -
                        </button>
                    </div>
                </div>
            `;
        }).join('')
        : '<p class="text-xs text-slate-500">Keine aktiven Gutscheine für heute.</p>';

    return `
        <div class="pt-1">
            <button
                data-action="toggle-voucher-accordion"
                data-card-id="${escapeHtml(cardId)}"
                class="w-full h-8 px-3 rounded-lg text-xs font-black uppercase tracking-wide flex items-center justify-between ${headerClasses}"
                ${hasActiveVouchers ? '' : 'disabled'}
            >
                <span>Mitarbeitergutscheine</span>
                <span class="text-sm">${hasActiveVouchers ? caret : '-'}</span>
            </button>
            <div class="mt-2 space-y-2 ${isOpen ? '' : 'hidden'}">
                ${rowsHtml}
            </div>
        </div>
    `;
}

function renderVoucherManagerModal() {
    const managerCard = voucherManagerCardId ? getCardConfig(voucherManagerCardId) : null;
    if (!managerCard) return '';

    const ownUserId = currentUser?.mode || '';
    const ownUserName = currentUser?.displayName || currentUser?.mode || 'Unbekannt';
    const editVoucher = voucherManagerEditVoucherId ? getVoucherById(voucherManagerEditVoucherId) : null;
    const canEditVoucher = Boolean(editVoucher && editVoucher.createdById === ownUserId && editVoucher.cardId === managerCard.id);

    const draftTitle = canEditVoucher ? editVoucher.title : '';
    const draftMax = canEditVoucher ? String(editVoucher.maxRedemptions) : '1';
    const draftCondition = canEditVoucher ? editVoucher.conditionText : '';
    const draftFrom = canEditVoucher ? editVoucher.validFromDayKey : getDayKeyNow();
    const draftTo = canEditVoucher ? editVoucher.validToDayKey : getDayKeyNow();
    const draftInfo = canEditVoucher ? editVoucher.infoText : '';

    const formTitle = canEditVoucher ? 'Gutschein bearbeiten' : 'Neuen Gutschein anlegen';
    const submitLabel = canEditVoucher ? 'Gutschein aktualisieren' : 'Gutschein speichern';

    const todayDayKey = getDayKeyNow();
    const allCardVouchers = getVouchersForCard(managerCard.id);
    const ownAllVouchers = allCardVouchers.filter((voucher) => voucher.createdById === ownUserId);
    const ownExpiredCount = ownAllVouchers.filter((voucher) => isVoucherExpired(voucher, todayDayKey)).length;
    const ownVisibleVouchers = ownAllVouchers.filter((voucher) => voucherManagerShowExpired || !isVoucherExpired(voucher, todayDayKey));

    const ownVoucherRows = ownVisibleVouchers
        .map((voucher) => {
            const usageTotal = toSafeVoucherCount(voucher.usageTotal);
            const isEditingThisVoucher = voucherManagerEditVoucherId === voucher.id;
            const rowClasses = isEditingThisVoucher
                ? 'rounded-lg border border-amber-300 bg-amber-100 p-2.5'
                : 'rounded-lg border border-slate-200 bg-slate-50 p-2.5';

            return `
                <li class="${rowClasses}">
                    <div class="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                            <p class="text-sm font-bold text-slate-800">${escapeHtml(voucher.title || 'Unbenannter Gutschein')}</p>
                            <p class="text-xs text-slate-500 mt-1">Gültig ${escapeHtml(formatDayKeyLabel(voucher.validFromDayKey))} bis ${escapeHtml(formatDayKeyLabel(voucher.validToDayKey))} · ${usageTotal}/${toSafeVoucherLimit(voucher.maxRedemptions)} verwendet</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button data-action="edit-voucher" data-voucher-id="${escapeHtml(voucher.id)}" class="rounded-md border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">Bearbeiten</button>
                            <button data-action="delete-voucher" data-voucher-id="${escapeHtml(voucher.id)}" class="rounded-md border border-red-200 bg-red-50 hover:bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Löschen</button>
                        </div>
                    </div>
                </li>
            `;
        }).join('');

    const ownVoucherListHtml = ownVoucherRows || '<p class="text-xs text-slate-500">Keine Gutscheine in dieser Ansicht.</p>';
    const expiredToggleLabel = voucherManagerShowExpired
        ? 'Abgelaufene ausblenden'
        : `Abgelaufene einblenden${ownExpiredCount > 0 ? ` (${ownExpiredCount})` : ''}`;

    return `
        <div class="fixed inset-0 z-[60]">
            <div class="absolute inset-0 bg-slate-900/50" data-action="close-voucher-manager"></div>
            <div class="relative z-10 h-full w-full flex items-center justify-center p-4">
                <div class="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                    <div class="px-4 py-3 bg-gradient-to-r from-violet-700 to-fuchsia-700 text-white flex items-center justify-between gap-3">
                        <div>
                            <h4 class="text-lg font-black">Gutscheineverwaltung · Karte ${escapeHtml(managerCard.label)}</h4>
                            <p class="text-xs opacity-90">Angelegt von ${escapeHtml(ownUserName)} · nur eigene Gutscheine sind editierbar</p>
                        </div>
                        <button data-action="close-voucher-manager" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 font-black" aria-label="Popup schließen">x</button>
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 max-h-[72vh] overflow-auto">
                        <section class="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
                            <h5 class="text-sm font-black text-violet-800 mb-2">${formTitle}</h5>
                            <div class="space-y-2">
                                <input id="maVoucherTitleInput" type="text" value="${escapeHtml(draftTitle)}" maxlength="120" placeholder="Titel" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-800">
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input id="maVoucherMaxInput" type="number" min="1" max="${MAX_VOUCHER_LIMIT}" value="${escapeHtml(draftMax)}" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-800" placeholder="Max. Einlösungen">
                                    <input id="maVoucherConditionInput" type="text" value="${escapeHtml(draftCondition)}" maxlength="160" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-800" placeholder="Bedingung">
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <input id="maVoucherFromInput" type="date" value="${escapeHtml(draftFrom)}" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-800">
                                    <input id="maVoucherToInput" type="date" value="${escapeHtml(draftTo)}" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-800">
                                </div>
                                <textarea id="maVoucherInfoInput" rows="4" maxlength="600" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm text-slate-800" placeholder="Informationstext">${escapeHtml(draftInfo)}</textarea>
                                <div class="flex items-center gap-2 flex-wrap">
                                    <button data-action="save-voucher" class="rounded-md bg-violet-600 hover:bg-violet-700 px-3 py-2 text-xs font-black text-white">${submitLabel}</button>
                                    <button data-action="cancel-voucher-edit" class="rounded-md border border-slate-300 bg-white hover:bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">Zurücksetzen</button>
                                </div>
                            </div>
                        </section>
                        <section class="rounded-xl border border-slate-200 bg-white p-3">
                            <div class="mb-2 flex items-center justify-between gap-2">
                                <h5 class="text-sm font-black text-slate-800">Deine Gutscheine</h5>
                                <button data-action="toggle-voucher-show-expired" class="rounded-md border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">${expiredToggleLabel}</button>
                            </div>
                            <div class="space-y-2">${ownVoucherListHtml}</div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderMitarbeiterkarte() {
    const root = getRootElement();
    if (!root) return;

    const dayLabel = formatCurrentDayLabel();

    const cardsHtml = CARDS.map((card) => {
        const cardUsage = dailyUsageState.cards?.[card.id] || {};
        const voucherAccordionHtml = renderVoucherAccordion(card.id, getDayKeyNow());

        const rowsHtml = COMPANIES.map((company) => {
            const usedCount = toSafeCount(cardUsage[company.id]);
            const ownUsedCount = getOwnUsedCount(dailyUsageState, currentUser?.mode || null, card.id, company.id);
            const remainingCount = getRemainingCount(usedCount);
            const limitReached = usedCount >= MAX_DAILY_USAGE;
            const ownIsZero = ownUsedCount <= 0;
            const companyLogoPath = COMPANY_LOGO_PATHS[company.id] || '';

            return `
                <div class="rounded-xl border border-slate-200 bg-white/95 p-2.5">
                    <div class="grid grid-cols-[84px_1fr_auto] items-center gap-2">
                        <div>
                            <img src="${companyLogoPath}" alt="${escapeHtml(company.label)}" class="h-8 w-full object-contain rounded-md border border-slate-200 bg-white p-0.5" loading="lazy">
                        </div>
                        <div>
                            <p class="text-sm font-bold text-slate-800 leading-tight">${escapeHtml(company.label)}</p>
                            <p class="text-xs text-slate-500 mt-1">${usedCount} verwendet · davon du ${ownUsedCount}</p>
                        </div>
                        <span class="text-[11px] font-black px-2 py-1 rounded-full border whitespace-nowrap ${getStatusClasses(usedCount)}">${remainingCount} frei</span>
                    </div>
                    <div class="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <button
                            data-action="add-usage"
                            data-card-id="${card.id}"
                            data-company-id="${company.id}"
                            class="rounded-lg px-3 py-2 text-sm font-black tracking-wide transition ${limitReached ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}"
                            ${limitReached ? 'disabled' : ''}
                        >
                            Verwendung hinzufügen
                        </button>
                        <button
                            data-action="remove-usage"
                            data-card-id="${card.id}"
                            data-company-id="${company.id}"
                            class="rounded-lg px-3 py-2 text-lg leading-none font-black transition ${ownIsZero ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}"
                            ${ownIsZero ? 'disabled' : ''}
                            aria-label="Verwendung reduzieren"
                        >
                            -
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <section class="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm overflow-hidden">
                <div class="relative h-14 overflow-hidden border-b border-slate-200">
                    <img src="${CARD_ART_PATH}" alt="REWE Mitarbeiterkarte" class="absolute inset-0 w-full h-full object-cover">
                    <div class="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-700/50 to-slate-600/10"></div>
                    <div class="relative z-10 h-full px-3 py-2 text-white flex items-center justify-between gap-2">
                        <div>
                            <h3 class="text-lg font-black tracking-wide">Karte ${escapeHtml(card.label)}</h3>
                            <p class="text-[11px] opacity-90">Live synchron für alle Benutzer</p>
                        </div>
                    </div>
                </div>

                <div class="-mt-4 px-3 relative z-20 flex justify-end">
                    <button
                        data-action="toggle-info"
                        data-card-id="${card.id}"
                        class="w-8 h-8 rounded-full shadow border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-black text-sm"
                        title="Nutzungshistorie"
                        aria-label="Nutzungshistorie"
                    >
                        i
                    </button>
                </div>

                <div class="px-3 pb-3 pt-1 space-y-2">
                    ${rowsHtml}
                    ${voucherAccordionHtml}
                </div>
            </section>
        `;
    }).join('');

    const activeModalCard = modalInfoCardId ? getCardConfig(modalInfoCardId) : null;
    const modalDayKey = getActiveModalHistoryDayKey();
    const modalDayLabel = formatDayKeyLabel(modalDayKey);
    const modalDayIsToday = modalDayKey === getDayKeyNow();
    const modalHistoryHtml = activeModalCard ? renderCardHistory(activeModalCard.id, modalDayKey) : '';
    const modalDayInputValue = isValidDayKey(modalDayKey) ? modalDayKey : getDayKeyNow();
    const pickerToggleLabel = modalHistoryPickerOpen ? 'Tagauswahl schließen' : 'Tag wählen';
    const modalMenuHtml = modalInfoMenuOpen
        ? `
            <div class="absolute right-0 top-full mt-1 w-44 rounded-lg border border-slate-200 bg-white shadow-lg text-slate-700 overflow-hidden z-10">
                <button data-action="open-voucher-manager" class="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-100">Gutscheineverwaltung</button>
            </div>
        `
        : '';
    const voucherManagerModalHtml = renderVoucherManagerModal();

    root.innerHTML = `
        <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="text-sm text-gray-600">Tag: <strong>${escapeHtml(dayLabel)}</strong></div>
            <div class="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                Wechsel um 00:00 Uhr (${TIME_ZONE})
            </div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">${cardsHtml}</div>

        <div class="fixed inset-0 z-50 ${activeModalCard ? '' : 'hidden'}" data-action="close-info-modal">
            <div class="absolute inset-0 bg-slate-900/50" data-action="close-info-modal"></div>
            <div class="relative z-10 h-full w-full flex items-center justify-center p-4">
                <div class="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
                    <div class="px-4 py-3 bg-gradient-to-r from-slate-900 to-slate-700 text-white flex items-center justify-between gap-3">
                        <div>
                            <h4 class="text-lg font-black">Nutzungsprotokoll: ${escapeHtml(activeModalCard?.label || '')}</h4>
                            <p class="text-xs opacity-90 flex items-center gap-2 flex-wrap">
                                <span>Tag: <strong>${escapeHtml(modalDayLabel)}</strong></span>
                                ${modalDayIsToday ? '<span class="rounded-full bg-emerald-100/20 border border-emerald-200/50 px-2 py-0.5 text-[11px] font-bold">Heute</span>' : '<span class="rounded-full bg-amber-100/20 border border-amber-200/50 px-2 py-0.5 text-[11px] font-bold">Archivtag</span>'}
                            </p>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="relative">
                                <button
                                    data-action="toggle-info-menu"
                                    class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 font-black text-lg leading-none"
                                    aria-label="Weitere Optionen"
                                    title="Weitere Optionen"
                                >
                                    ⋮
                                </button>
                                ${modalMenuHtml}
                            </div>
                            <button
                                data-action="toggle-history-day-picker"
                                class="rounded-lg border border-white/30 bg-white/20 hover:bg-white/30 px-3 py-1.5 text-xs font-bold"
                                aria-label="Tag für Nutzungsprotokoll auswählen"
                            >
                                ${pickerToggleLabel}
                            </button>
                            <button data-action="close-info-modal" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 font-black" aria-label="Popup schließen">x</button>
                        </div>
                    </div>
                    <div class="px-4 py-2 border-b border-slate-200 bg-slate-50 ${modalHistoryPickerOpen ? '' : 'hidden'}">
                        <div class="flex items-center gap-2 flex-wrap">
                            <label for="maKarteHistoryDayInput" class="text-xs font-semibold text-slate-700">Tag auswählen:</label>
                            <input
                                id="maKarteHistoryDayInput"
                                data-action="history-day-input"
                                type="date"
                                value="${escapeHtml(modalDayInputValue)}"
                                max="${escapeHtml(getDayKeyNow())}"
                                class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-800"
                            >
                            <button
                                data-action="show-history-today"
                                class="rounded-md border border-slate-300 bg-white hover:bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                                Heute
                            </button>
                        </div>
                    </div>
                    <div class="p-4 max-h-[65vh] overflow-auto">
                        <ul class="space-y-1">${modalHistoryHtml}</ul>
                    </div>
                </div>
            </div>
        </div>

        ${voucherManagerModalHtml}
    `;
}

function renderPleaseLogin() {
    const root = getRootElement();
    if (!root) return;

    root.innerHTML = `
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
            Bitte anmelden, um Karten-Verwendungen einzutragen.
        </div>
    `;
}

function stopRealtimeListeners() {
    if (typeof unsubscribeDailyUsage === 'function') {
        unsubscribeDailyUsage();
    }
    if (typeof unsubscribeEvents === 'function') {
        unsubscribeEvents();
    }
    if (typeof unsubscribeVoucherDefinitions === 'function') {
        unsubscribeVoucherDefinitions();
    }

    unsubscribeDailyUsage = null;
    unsubscribeEvents = null;
    unsubscribeVoucherDefinitions = null;
}

function subscribeToVoucherDefinitions() {
    if (!db) return;

    const voucherQuery = query(getVoucherCollectionRef(), orderBy('updatedAt', 'desc'), limit(300));
    unsubscribeVoucherDefinitions = onSnapshot(voucherQuery, (snapshot) => {
        mitarbeitergutscheine = snapshot.docs.map((docSnap) => normalizeVoucher(docSnap.data(), docSnap.id));
        renderMitarbeiterkarte();
    }, (error) => {
        console.error('MA-Karte: Fehler beim Laden der Gutscheine:', error);
        alertUser('MA-Karte: Gutscheine konnten nicht geladen werden.', 'error');
    });
}

function subscribeToCurrentDay(force = false) {
    if (!db) return;

    const nextDayKey = getDayKeyNow();
    const nextUserMode = currentUser?.mode || null;

    if (!nextUserMode || nextUserMode === GUEST_MODE) {
        stopRealtimeListeners();
        dailyUsageState = buildEmptyUsageState();
        usageEvents = [];
        mitarbeitergutscheine = [];
        currentDayKey = null;
        currentUserMode = null;
        resetModalHistorySelection();
        modalInfoMenuOpen = false;
        resetVoucherModalState();
        modalInfoCardId = null;
        renderPleaseLogin();
        return;
    }

    const shouldResubscribe =
        force ||
        !unsubscribeDailyUsage ||
        !unsubscribeEvents ||
        !unsubscribeVoucherDefinitions ||
        currentDayKey !== nextDayKey ||
        currentUserMode !== nextUserMode;

    if (!shouldResubscribe) {
        renderMitarbeiterkarte();
        return;
    }

    stopRealtimeListeners();

    currentDayKey = nextDayKey;
    currentUserMode = nextUserMode;
    usageEvents = [];

    const dayDocRef = getDayDocRef(nextDayKey);
    const eventsQuery = query(collection(dayDocRef, 'events'), orderBy('createdAt', 'desc'), limit(250));
    subscribeToVoucherDefinitions();

    unsubscribeDailyUsage = onSnapshot(dayDocRef, (snapshot) => {
        dailyUsageState = normalizeDailyUsageState(snapshot.exists() ? snapshot.data() : null);
        renderMitarbeiterkarte();
    }, (error) => {
        console.error('MA-Karte: Fehler beim Laden der Tagesdaten:', error);
        alertUser('MA-Karte: Tagesdaten konnten nicht geladen werden.', 'error');
    });

    unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
        usageEvents = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        renderMitarbeiterkarte();
    }, (error) => {
        console.error('MA-Karte: Fehler beim Laden der Historie:', error);
        alertUser('MA-Karte: Historie konnte nicht geladen werden.', 'error');
    });

    renderMitarbeiterkarte();
}

function startDayWatcher() {
    if (dayWatcherTimer) return;

    dayWatcherTimer = window.setInterval(() => {
        const isMitarbeiterkarteVisible = document.getElementById('maKarteView')?.classList.contains('active');
        if (!isMitarbeiterkarteVisible) return;

        const latestDayKey = getDayKeyNow();
        if (latestDayKey !== currentDayKey) {
            resetModalHistorySelection();
            modalInfoMenuOpen = false;
            resetVoucherModalState();
            modalInfoCardId = null;
            subscribeToCurrentDay(true);
        }
    }, 30000);
}

function stopDayWatcher() {
    if (!dayWatcherTimer) return;
    window.clearInterval(dayWatcherTimer);
    dayWatcherTimer = null;
}

function closeVoucherManager() {
    resetVoucherModalState();
    renderMitarbeiterkarte();
}

function openVoucherManagerForCard(cardId) {
    const card = getCardConfig(cardId);
    if (!card) return;
    voucherManagerCardId = card.id;
    voucherManagerEditVoucherId = null;
    modalInfoMenuOpen = false;
    renderMitarbeiterkarte();
}

async function saveVoucherFromModal() {
    const managerCard = voucherManagerCardId ? getCardConfig(voucherManagerCardId) : null;
    if (!managerCard) return;

    const titleInput = document.getElementById('maVoucherTitleInput');
    const maxInput = document.getElementById('maVoucherMaxInput');
    const conditionInput = document.getElementById('maVoucherConditionInput');
    const fromInput = document.getElementById('maVoucherFromInput');
    const toInput = document.getElementById('maVoucherToInput');
    const infoInput = document.getElementById('maVoucherInfoInput');

    const title = String(titleInput?.value || '').trim();
    const maxRedemptions = toSafeVoucherLimit(maxInput?.value);
    const conditionText = String(conditionInput?.value || '').trim();
    const validFromDayKey = String(fromInput?.value || '').trim();
    const validToDayKey = String(toInput?.value || '').trim();
    const infoText = String(infoInput?.value || '').trim();

    if (!title) {
        alertUser('Bitte einen Gutschein-Titel eingeben.', 'error');
        return;
    }
    if (!isValidDayKey(validFromDayKey) || !isValidDayKey(validToDayKey)) {
        alertUser('Bitte einen gültigen Zeitraum (von/bis) auswählen.', 'error');
        return;
    }
    if (validFromDayKey > validToDayKey) {
        alertUser('"Von" darf nicht nach "Bis" liegen.', 'error');
        return;
    }

    const actorId = currentUser?.mode || '';
    if (!actorId || actorId === GUEST_MODE) {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    try {
        const editVoucher = voucherManagerEditVoucherId ? getVoucherById(voucherManagerEditVoucherId) : null;

        await runTransaction(db, async (transaction) => {
            if (editVoucher) {
                const editRef = getVoucherDocRef(editVoucher.id);
                const editSnap = await transaction.get(editRef);
                if (!editSnap.exists()) throw new Error('VOUCHER_NOT_FOUND');

                const currentData = normalizeVoucher(editSnap.data(), editSnap.id);
                if (currentData.createdById !== actorId) throw new Error('VOUCHER_EDIT_FORBIDDEN');

                transaction.set(editRef, {
                    title,
                    maxRedemptions,
                    conditionText,
                    validFromDayKey,
                    validToDayKey,
                    infoText,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                return;
            }

            const createRef = doc(getVoucherCollectionRef());
            transaction.set(createRef, {
                cardId: managerCard.id,
                title,
                maxRedemptions,
                conditionText,
                validFromDayKey,
                validToDayKey,
                infoText,
                usageTotal: 0,
                usageByUser: {},
                deleted: false,
                createdById: actorId,
                createdByName: currentUser?.displayName || actorId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        voucherManagerEditVoucherId = null;
        alertUser('Gutschein gespeichert.', 'success');
        renderMitarbeiterkarte();
    } catch (error) {
        console.error('MA-Karte: Fehler beim Speichern eines Gutscheins:', error);
        alertUser(toFriendlyErrorMessage(error), 'error');
    }
}

async function deleteVoucher(voucherId) {
    const voucher = getVoucherById(voucherId);
    if (!voucher) {
        alertUser('Gutschein nicht gefunden.', 'error');
        return;
    }

    const actorId = currentUser?.mode || '';
    if (!actorId || actorId !== voucher.createdById) {
        alertUser('Du darfst nur eigene Gutscheine löschen.', 'error');
        return;
    }

    const confirmDelete = window.confirm(`Soll der Gutschein "${voucher.title || 'Unbenannter Gutschein'}" wirklich gelöscht werden?`);
    if (!confirmDelete) {
        return;
    }

    try {
        await runTransaction(db, async (transaction) => {
            const voucherRef = getVoucherDocRef(voucherId);
            const snapshot = await transaction.get(voucherRef);
            if (!snapshot.exists()) throw new Error('VOUCHER_NOT_FOUND');

            const currentData = normalizeVoucher(snapshot.data(), snapshot.id);
            if (currentData.createdById !== actorId) throw new Error('VOUCHER_EDIT_FORBIDDEN');

            transaction.set(voucherRef, {
                deleted: true,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });

        if (voucherManagerEditVoucherId === voucherId) {
            voucherManagerEditVoucherId = null;
        }

        alertUser('Gutschein gelöscht.', 'success');
        renderMitarbeiterkarte();
    } catch (error) {
        console.error('MA-Karte: Fehler beim Löschen eines Gutscheins:', error);
        alertUser(toFriendlyErrorMessage(error), 'error');
    }
}

async function adjustVoucherUsage(voucherId, delta) {
    if (!db || !appId) {
        alertUser('MA-Karte ist noch nicht bereit. Bitte kurz warten.', 'error');
        return;
    }

    const actorId = currentUser?.mode || '';
    if (!actorId || actorId === GUEST_MODE) {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    const opKey = `voucher:${voucherId}`;
    if (actionInFlight.has(opKey)) return;
    actionInFlight.add(opKey);

    try {
        const activeDayKey = getDayKeyNow();
        const dayDocRef = getDayDocRef(activeDayKey);
        const eventsCollectionRef = collection(dayDocRef, 'events');
        const voucherRef = getVoucherDocRef(voucherId);

        await runTransaction(db, async (transaction) => {
            const voucherSnap = await transaction.get(voucherRef);
            if (!voucherSnap.exists()) throw new Error('VOUCHER_NOT_FOUND');

            const voucher = normalizeVoucher(voucherSnap.data(), voucherSnap.id);
            if (voucher.deleted) throw new Error('VOUCHER_NOT_FOUND');
            if (!isDayKeyInRange(activeDayKey, voucher.validFromDayKey, voucher.validToDayKey)) {
                throw new Error('VOUCHER_NOT_ACTIVE');
            }

            const currentTotal = toSafeVoucherCount(voucher.usageTotal);
            const actorCurrent = toSafeVoucherCount(voucher.usageByUser?.[actorId]);
            const nextTotal = currentTotal + delta;
            const actorNext = actorCurrent + delta;

            if (nextTotal > toSafeVoucherLimit(voucher.maxRedemptions)) throw new Error('VOUCHER_LIMIT_REACHED');
            if (nextTotal < 0) throw new Error('VOUCHER_MIN_REACHED');
            if (delta < 0 && actorCurrent <= 0) throw new Error('VOUCHER_OWN_REDUCTION_FORBIDDEN');
            if (actorNext < 0) throw new Error('VOUCHER_OWN_REDUCTION_FORBIDDEN');

            const nextUsageByUser = {
                ...voucher.usageByUser,
                [actorId]: actorNext
            };

            transaction.set(voucherRef, {
                usageTotal: nextTotal,
                usageByUser: nextUsageByUser,
                updatedAt: serverTimestamp()
            }, { merge: true });

            const eventDocRef = doc(eventsCollectionRef);
            transaction.set(eventDocRef, {
                dayKey: activeDayKey,
                cardId: voucher.cardId,
                entryType: 'voucher',
                voucherId: voucher.id,
                voucherTitle: voucher.title,
                delta,
                actorId,
                actorName: currentUser?.displayName || actorId,
                createdAt: serverTimestamp(),
                clientTimestampIso: new Date().toISOString()
            });
        });
    } catch (error) {
        console.error('MA-Karte: Fehler bei Gutscheinverwendung:', error);
        alertUser(toFriendlyErrorMessage(error), 'error');
    } finally {
        actionInFlight.delete(opKey);
    }
}

function toFriendlyErrorMessage(error) {
    if (!error || !error.message) return 'Speichern fehlgeschlagen.';
    if (error.message.includes('MAX_LIMIT_REACHED')) return 'Limit erreicht: Heute ist für diese Firma nichts mehr frei.';
    if (error.message.includes('MIN_LIMIT_REACHED')) return 'Es gibt keine Verwendung mehr zum Zurücknehmen.';
    if (error.message.includes('OWN_REDUCTION_FORBIDDEN')) return 'Du kannst nur eigene Verwendungen reduzieren.';
    if (error.message.includes('VOUCHER_LIMIT_REACHED')) return 'Dieser Gutschein ist vollständig verbraucht.';
    if (error.message.includes('VOUCHER_MIN_REACHED')) return 'Für diesen Gutschein gibt es keine Verwendung zum Zurücknehmen.';
    if (error.message.includes('VOUCHER_OWN_REDUCTION_FORBIDDEN')) return 'Du kannst nur eigene Gutscheinverwendungen zurücknehmen.';
    if (error.message.includes('VOUCHER_NOT_FOUND')) return 'Der Gutschein wurde nicht gefunden oder ist nicht mehr verfügbar.';
    if (error.message.includes('VOUCHER_NOT_ACTIVE')) return 'Der Gutschein ist außerhalb seines Gültigkeitszeitraums.';
    if (error.message.includes('VOUCHER_EDIT_FORBIDDEN')) return 'Du darfst nur eigene Gutscheine bearbeiten.';
    return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

async function adjustUsage(cardId, companyId, delta) {
    if (!db || !appId) {
        alertUser('MA-Karte ist noch nicht bereit. Bitte kurz warten.', 'error');
        return;
    }

    if (!currentUser?.mode || currentUser.mode === GUEST_MODE) {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    const opKey = `${cardId}:${companyId}`;
    if (actionInFlight.has(opKey)) return;

    actionInFlight.add(opKey);

    try {
        const activeDayKey = getDayKeyNow();
        if (activeDayKey !== currentDayKey) {
            subscribeToCurrentDay(true);
        }

        const dayDocRef = getDayDocRef(activeDayKey);
        const eventsCollectionRef = collection(dayDocRef, 'events');

        await runTransaction(db, async (transaction) => {
            const daySnapshot = await transaction.get(dayDocRef);
            const currentState = normalizeDailyUsageState(daySnapshot.exists() ? daySnapshot.data() : null);
            const currentCount = toSafeCount(currentState.cards?.[cardId]?.[companyId]);
            const actorId = currentUser.mode;
            const actorUsageMap = currentState.userUsageCounts?.[actorId] || buildEmptyCardUsage();
            const actorCurrentCount = toSafeCount(actorUsageMap?.[cardId]?.[companyId]);
            const nextCount = currentCount + delta;
            const actorNextCount = actorCurrentCount + delta;

            if (nextCount > MAX_DAILY_USAGE) {
                throw new Error('MAX_LIMIT_REACHED');
            }
            if (nextCount < 0) {
                throw new Error('MIN_LIMIT_REACHED');
            }
            if (delta < 0 && actorCurrentCount <= 0) {
                throw new Error('OWN_REDUCTION_FORBIDDEN');
            }
            if (actorNextCount < 0) {
                throw new Error('OWN_REDUCTION_FORBIDDEN');
            }

            const nextCards = {
                ...currentState.cards,
                [cardId]: {
                    ...currentState.cards[cardId],
                    [companyId]: nextCount
                }
            };

            const nextUserUsageCounts = {
                ...currentState.userUsageCounts,
                [actorId]: {
                    ...actorUsageMap,
                    [cardId]: {
                        ...actorUsageMap[cardId],
                        [companyId]: actorNextCount
                    }
                }
            };

            const patchData = {
                dateKey: activeDayKey,
                timezone: TIME_ZONE,
                updatedAt: serverTimestamp(),
                cards: nextCards,
                userUsageCounts: nextUserUsageCounts
            };

            if (!daySnapshot.exists()) {
                patchData.createdAt = serverTimestamp();
            }

            transaction.set(dayDocRef, patchData, { merge: true });

            const eventDocRef = doc(eventsCollectionRef);
            transaction.set(eventDocRef, {
                dayKey: activeDayKey,
                cardId,
                company: companyId,
                companyLabel: getCompanyLabel(companyId),
                delta,
                actorId: currentUser.mode,
                actorName: currentUser.displayName || currentUser.mode || 'Unbekannt',
                createdAt: serverTimestamp(),
                clientTimestampIso: new Date().toISOString()
            });
        });
    } catch (error) {
        console.error('MA-Karte: Fehler beim Speichern:', error);
        alertUser(toFriendlyErrorMessage(error), 'error');
    } finally {
        actionInFlight.delete(opKey);
    }
}

function handleRootClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const cardId = actionButton.dataset.cardId;
    const voucherId = actionButton.dataset.voucherId;

    if (action === 'close-info-modal') {
        resetModalHistorySelection();
        modalInfoMenuOpen = false;
        resetVoucherModalState();
        modalInfoCardId = null;
        renderMitarbeiterkarte();
        return;
    }

    if (action === 'close-voucher-manager') {
        closeVoucherManager();
        return;
    }

    if (action === 'toggle-info-menu') {
        if (!modalInfoCardId) return;
        modalInfoMenuOpen = !modalInfoMenuOpen;
        renderMitarbeiterkarte();
        return;
    }

    if (action === 'open-voucher-manager') {
        if (!modalInfoCardId) return;
        openVoucherManagerForCard(modalInfoCardId);
        return;
    }

    if (action === 'toggle-history-day-picker') {
        if (!modalInfoCardId) return;
        modalHistoryPickerOpen = !modalHistoryPickerOpen;
        modalInfoMenuOpen = false;
        renderMitarbeiterkarte();
        return;
    }

    if (action === 'show-history-today') {
        if (!modalInfoCardId) return;
        modalInfoMenuOpen = false;
        setModalHistoryDay(getDayKeyNow());
        return;
    }

    if (action === 'toggle-voucher-accordion' && cardId) {
        const hasActiveVouchers = getActiveVouchersForCard(cardId, getDayKeyNow()).length > 0;
        if (!hasActiveVouchers) return;

        voucherAccordionOpen = {
            ...voucherAccordionOpen,
            [cardId]: !Boolean(voucherAccordionOpen[cardId])
        };
        renderMitarbeiterkarte();
        return;
    }

    if (action === 'save-voucher') {
        void saveVoucherFromModal();
        return;
    }

    if (action === 'cancel-voucher-edit') {
        voucherManagerEditVoucherId = null;
        renderMitarbeiterkarte();
        return;
    }

    if (action === 'toggle-voucher-show-expired') {
        voucherManagerShowExpired = !voucherManagerShowExpired;
        renderMitarbeiterkarte();
        return;
    }

    if (action === 'edit-voucher' && voucherId) {
        const voucher = getVoucherById(voucherId);
        const actorId = currentUser?.mode || '';
        if (!voucher || voucher.createdById !== actorId || voucher.cardId !== voucherManagerCardId) {
            alertUser('Du darfst nur eigene Gutscheine bearbeiten.', 'error');
            return;
        }
        voucherManagerEditVoucherId = voucherId;
        renderMitarbeiterkarte();
        return;
    }

    if (action === 'delete-voucher' && voucherId) {
        void deleteVoucher(voucherId);
        return;
    }

    if (action === 'add-voucher-usage' && voucherId) {
        void adjustVoucherUsage(voucherId, 1);
        return;
    }

    if (action === 'remove-voucher-usage' && voucherId) {
        void adjustVoucherUsage(voucherId, -1);
        return;
    }

    if (action === 'toggle-info' && cardId) {
        resetModalHistorySelection();
        modalInfoCardId = cardId;
        modalHistoryDayKey = getDayKeyNow();
        modalInfoMenuOpen = false;
        resetVoucherModalState();
        renderMitarbeiterkarte();
        return;
    }

    const companyId = actionButton.dataset.companyId;
    if (!cardId || !companyId) return;

    if (action === 'add-usage') {
        adjustUsage(cardId, companyId, 1);
        return;
    }

    if (action === 'remove-usage') {
        adjustUsage(cardId, companyId, -1);
    }
}

function handleRootChange(event) {
    const dayInput = event.target.closest('[data-action="history-day-input"]');
    if (!dayInput || !modalInfoCardId) return;

    const selectedDay = String(dayInput.value || '').trim();
    if (!isValidDayKey(selectedDay)) return;
    setModalHistoryDay(selectedDay);
}

export function initializeMitarbeiterkarte() {
    const root = getRootElement();
    if (!root) return;

    if (!listenersAttached) {
        root.addEventListener('click', handleRootClick);
        root.addEventListener('change', handleRootChange);
        listenersAttached = true;
    }

    subscribeToCurrentDay(false);
    startDayWatcher();
}

export function stopMitarbeiterkarteListeners() {
    stopRealtimeListeners();
    stopDayWatcher();
    resetModalHistorySelection();
    resetVoucherModalState();
    modalInfoMenuOpen = false;
    modalInfoCardId = null;
    actionInFlight.clear();
}
