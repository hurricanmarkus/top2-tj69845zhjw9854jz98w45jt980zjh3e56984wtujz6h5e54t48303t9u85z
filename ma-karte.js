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

const COMPANIES = [
    { id: 'billa', label: 'BILLA / BILLA PLUS' },
    { id: 'penny', label: 'PENNY' },
    { id: 'bipa', label: 'BIPA' }
];

const COMPANY_LOGO_PATHS = {
    billa: 'assets/ma-karte/logo-billa-billaplus.svg',
    penny: 'assets/ma-karte/logo-penny.svg',
    bipa: 'assets/ma-karte/logo-bipa.svg'
};

const CARD_ART_PATH = 'assets/ma-karte/rewe-mitarbeiterkarte.svg';

let unsubscribeDailyUsage = null;
let unsubscribeEvents = null;
let dayWatcherTimer = null;
let currentDayKey = null;
let currentUserMode = null;
let dailyUsageState = buildEmptyUsageState();
let usageEvents = [];
let modalInfoCardId = null;
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

function renderCardHistory(cardId) {
    const historyEntries = usageEvents.filter((entry) => entry.cardId === cardId);

    if (!historyEntries.length) {
        return '<p class="text-sm text-gray-500">Heute noch keine Einträge.</p>';
    }

    return historyEntries.map((entry) => {
        const isAdd = Number(entry.delta) > 0;
        const actionBadge = isAdd
            ? '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">+ Verwendung</span>'
            : '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">- Korrektur</span>';

        return `
            <li class="py-2 border-b border-gray-100 last:border-0">
                <div class="flex items-center justify-between gap-2 flex-wrap">${actionBadge}<span class="text-xs text-gray-500">${formatEventDate(entry)}</span></div>
                <p class="text-sm text-gray-700 mt-1">${escapeHtml(entry.actorName || 'Unbekannt')} · ${escapeHtml(entry.companyLabel || getCompanyLabel(entry.company))}</p>
            </li>
        `;
    }).join('');
}

function renderMitarbeiterkarte() {
    const root = getRootElement();
    if (!root) return;

    const dayLabel = formatCurrentDayLabel();

    const cardsHtml = CARDS.map((card) => {
        const cardUsage = dailyUsageState.cards?.[card.id] || {};

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

                <div class="px-3 pb-3 pt-1 space-y-2">${rowsHtml}</div>
            </section>
        `;
    }).join('');

    const activeModalCard = modalInfoCardId ? getCardConfig(modalInfoCardId) : null;
    const modalHistoryHtml = activeModalCard ? renderCardHistory(activeModalCard.id) : '';

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
                            <p class="text-xs opacity-90">Wer hat wann welche Firma verwendet</p>
                        </div>
                        <button data-action="close-info-modal" class="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 font-black" aria-label="Popup schließen">x</button>
                    </div>
                    <div class="p-4 max-h-[65vh] overflow-auto">
                        <ul class="space-y-1">${modalHistoryHtml}</ul>
                    </div>
                </div>
            </div>
        </div>
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

    unsubscribeDailyUsage = null;
    unsubscribeEvents = null;
}

function subscribeToCurrentDay(force = false) {
    if (!db) return;

    const nextDayKey = getDayKeyNow();
    const nextUserMode = currentUser?.mode || null;

    if (!nextUserMode || nextUserMode === GUEST_MODE) {
        stopRealtimeListeners();
        dailyUsageState = buildEmptyUsageState();
        usageEvents = [];
        currentDayKey = null;
        currentUserMode = null;
        renderPleaseLogin();
        return;
    }

    const shouldResubscribe =
        force ||
        !unsubscribeDailyUsage ||
        !unsubscribeEvents ||
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

function toFriendlyErrorMessage(error) {
    if (!error || !error.message) return 'Speichern fehlgeschlagen.';
    if (error.message.includes('MAX_LIMIT_REACHED')) return 'Limit erreicht: Heute ist für diese Firma nichts mehr frei.';
    if (error.message.includes('MIN_LIMIT_REACHED')) return 'Es gibt keine Verwendung mehr zum Zurücknehmen.';
    if (error.message.includes('OWN_REDUCTION_FORBIDDEN')) return 'Du kannst nur eigene Verwendungen reduzieren.';
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

    if (action === 'close-info-modal') {
        modalInfoCardId = null;
        renderMitarbeiterkarte();
        return;
    }

    if (action === 'toggle-info' && cardId) {
        modalInfoCardId = cardId;
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

export function initializeMitarbeiterkarte() {
    const root = getRootElement();
    if (!root) return;

    if (!listenersAttached) {
        root.addEventListener('click', handleRootClick);
        listenersAttached = true;
    }

    subscribeToCurrentDay(false);
    startDayWatcher();
}

export function stopMitarbeiterkarteListeners() {
    stopRealtimeListeners();
    stopDayWatcher();
    actionInFlight.clear();
}
