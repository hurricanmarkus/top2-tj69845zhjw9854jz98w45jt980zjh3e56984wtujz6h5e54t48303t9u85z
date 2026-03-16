import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { alertUser, appId, currentUser, db, escapeHtml, GUEST_MODE } from './haupteingang.js';
import { getUserSetting, saveUserSetting } from './log-InOut.js';

const MONTHS = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
let refsReady = false;
let accountsRef = null;
let itemsRef = null;
let transfersRef = null;
let reconRef = null;
let auditRef = null;
let actionsRef = null;
let unsubAccounts = null;
let unsubItems = null;
let unsubTransfers = null;
let unsubRecon = null;
let unsubAudit = null;
let unsubActions = null;
let shellMounted = false;
let listenersBound = false;
let helpHintsBound = false;
let ACCOUNTS = {};
let ITEMS = {};
let TRANSFERS = {};
let RECON = {};
let AUDIT = {};
let ACTIONS = {};
let FORECAST = { timeline: [], alerts: [], details: {}, quality: [], setup: [], suggestions: [], imbalances: [], deviationWarnings: [] };
const FORECAST_HORIZON_OPTIONS = [3, 6, 12, 24];
let forecastHorizonMonths = 12;
let filterTokens = [];
let filterState = { negate: false, joinMode: 'and', status: '', typ: '', interval: '', quick: '', sort: 'critical' };
let accountListFilterState = { type: 'all', query: '', showActive: true, showPlanned: false, showPast: false };
let transferListFilterState = { type: 'all', query: '', showActive: true, showPlanned: false, showPast: false };
let editingAccountId = '';
let editingTransferId = '';
let accountAmountUnlockForId = '';
let transferAmountUnlockForId = '';
let amountUnlockMode = '';
let amountUnlockEntityId = '';
let amountUnlockSecondsLeft = 0;
let amountUnlockTimer = null;
const AMOUNT_UNLOCK_COUNTDOWN_SECONDS = 0;
const SOLL_INPUT_IDS = ['ab2-item-amount', 'ab2-account-min-buffer', 'ab2-transfer-amount', 'ab2-recon-value', 'ab2-abtausch-new-amount', 'ab2-transfer-abtausch-new-amount'];
let transferAbtauschSourceId = '';
let transferAbtauschOldEndManual = false;
let accountModalViewMode = 'list';
let transferModalViewMode = 'list';
let reconModalViewMode = 'list';
let editingReconId = '';
let reconOlderVisibleCount = 3;
let itemReadMode = false;
let transferSplitMode = 'right';
let accountSplitMode = 'right';
let reconSplitMode = 'right';
let forecastExpandedOverride = null;
let simulationDate = null;
let personControlAccountId = '';
const UNASSIGNED_TITLE_KEY = '__ab2_ohne_zuordnung__';

function uid() { return currentUser?.mode || currentUser?.displayName || null; }

function ensureAccountAbtauschButton() {
    if (el('ab2-account-abtausch-btn')) return;
    const saveBtn = el('ab2-save-account-btn');
    const resetBtn = el('ab2-reset-account-btn');
    const footer = (saveBtn || resetBtn)?.parentElement;
    if (!footer) return;
    const btn = document.createElement('button');
    btn.id = 'ab2-account-abtausch-btn';
    btn.type = 'button';
    btn.className = 'px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hidden';
    btn.textContent = 'Abtausch';
    footer.insertBefore(btn, saveBtn || null);
}
function isGuest() { return !currentUser?.mode || currentUser.mode === GUEST_MODE; }
function canCreate() { const p = currentUser?.permissions || []; return currentUser?.role === 'SYSTEMADMIN' || p.includes('ABBUCHUNGSBERECHNER_CREATE'); }
function el(id) { return document.getElementById(id); }
function openModal(id) { const n = el(id); if (n) n.style.display = 'flex'; }
function closeModal(id) { const n = el(id); if (n) n.style.display = 'none'; }
function ensureSplitLayout(leftAnchorId, rightListHostId, splitterId) {
    const leftPane = el(leftAnchorId)?.closest('.space-y-3');
    const rightHost = el(rightListHostId);
    const rightPane = rightHost?.parentElement;
    const container = leftPane?.parentElement;
    if (!leftPane || !rightPane || !container) return null;
    container.classList.add('ab2-transfer-split-layout');
    leftPane.classList.add('ab2-transfer-pane');
    rightPane.classList.add('ab2-transfer-pane');
    let splitter = el(splitterId);
    if (!splitter || splitter.parentElement !== container) {
        splitter = document.createElement('button');
        splitter.type = 'button';
        splitter.id = splitterId;
        splitter.className = 'ab2-transfer-splitter';
        splitter.title = 'Ansicht umschalten';
        splitter.setAttribute('aria-label', 'Ansicht umschalten');
        container.insertBefore(splitter, rightPane);
    }
    return { container, leftPane, rightPane, splitter };
}
function applySplitMode(layout, activeMode, leftLabel, rightLabel) {
    if (!layout) return;
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    if (!desktop) {
        layout.container.style.gridTemplateColumns = 'minmax(0, 1fr)';
        layout.splitter.classList.add('hidden');
        layout.leftPane.classList.remove('ab2-transfer-pane-muted');
        layout.rightPane.classList.remove('ab2-transfer-pane-muted');
        return;
    }
    layout.splitter.classList.remove('hidden');
    layout.container.style.gridTemplateColumns = activeMode === 'left' ? 'minmax(0, 4fr) 24px minmax(0, 1fr)' : 'minmax(0, 1fr) 24px minmax(0, 4fr)';
    layout.leftPane.classList.toggle('ab2-transfer-pane-muted', activeMode !== 'left');
    layout.rightPane.classList.toggle('ab2-transfer-pane-muted', activeMode !== 'right');
    layout.splitter.setAttribute('aria-pressed', activeMode === 'left' ? 'true' : 'false');
    layout.splitter.setAttribute('aria-label', activeMode === 'left' ? rightLabel : leftLabel);
    layout.splitter.innerHTML = `<span class="${activeMode === 'left' ? 'text-indigo-700' : 'text-slate-400'}">◀</span><span class="${activeMode === 'right' ? 'text-indigo-700' : 'text-slate-400'}">▶</span>`;
}
function setTransferSplitMode(mode, remember = true) {
    const resolved = mode === 'left' ? 'left' : 'right';
    if (remember) transferSplitMode = resolved;
}
function toggleTransferSplitMode() { setTransferSplitMode(transferSplitMode === 'right' ? 'left' : 'right'); }
function setAccountSplitMode(mode, remember = true) {
    const resolved = mode === 'left' ? 'left' : 'right';
    if (remember) accountSplitMode = resolved;
}
function toggleAccountSplitMode() { setAccountSplitMode(accountSplitMode === 'right' ? 'left' : 'right'); }
function setReconSplitMode(mode, remember = true) {
    const resolved = mode === 'left' ? 'left' : 'right';
    if (remember) reconSplitMode = resolved;
}
function toggleReconSplitMode() { setReconSplitMode(reconSplitMode === 'right' ? 'left' : 'right'); }
function setForecastExpanded(expanded, remember = false) {
    const wrap = el('ab2-forecast-overview-wrap');
    const btn = el('ab2-forecast-toggle');
    if (remember) forecastExpandedOverride = !!expanded;
    if (!wrap || !btn) return;
    wrap.classList.toggle('hidden', !expanded);
    btn.textContent = expanded ? 'einklappen' : 'ausklappen';
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}
function referenceDate() { return simulationDate ? new Date(simulationDate.getTime()) : new Date(); }
function referenceDayStart() {
    const ref = referenceDate();
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
}
function updateSimulationWarning() {
    const warning = el('ab2-simulation-warning');
    if (!warning) return;
    if (simulationDate) {
        warning.classList.remove('hidden');
        warning.textContent = `⚠️ DATUMS-SIMULATION IST AKTIV! (${formatDate(simulationDate)})`;
    } else {
        warning.classList.add('hidden');
        warning.textContent = '';
    }
}

function ensureFormActionLabels() {
    const labels = {
        'ab2-reset-account-btn': 'Abbrechen',
        'ab2-reset-transfer-btn': 'Abbrechen',
        'ab2-reset-item-btn': 'Abbrechen',
        'ab2-cancel-item-btn': 'Abbrechen'
    };
    Object.entries(labels).forEach(([id, label]) => {
        const btn = el(id);
        if (btn) btn.textContent = label;
    });
}

function ensureReconActionButtons() {
    const saveBtn = el('ab2-save-recon-btn');
    const footer = saveBtn?.parentElement;
    if (!footer) return;
    const todayBtn = el('ab2-recon-today-btn');
    if (todayBtn) todayBtn.remove();
    if (!el('ab2-cancel-recon-btn')) {
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'ab2-cancel-recon-btn';
        cancelBtn.type = 'button';
        cancelBtn.className = 'px-4 py-2 bg-gray-300 text-gray-700 rounded-lg';
        cancelBtn.textContent = 'Abbrechen';
        footer.insertBefore(cancelBtn, saveBtn);
    }
}

function ensureStatusVisibilityDropdown(prefix, searchInputId) {
    const searchInput = el(searchInputId);
    const parent = searchInput?.parentElement;
    if (!searchInput || !parent || el(`ab2-${prefix}-status-dropdown`)) return;
    const details = document.createElement('details');
    details.id = `ab2-${prefix}-status-dropdown`;
    details.className = 'relative';
    details.innerHTML = `<summary class="list-none cursor-pointer p-2 border-2 border-gray-300 rounded-lg bg-white text-sm font-bold text-gray-700"><span id="ab2-${prefix}-status-summary">Aktive (0)</span> ▾</summary><div class="absolute right-0 mt-1 w-64 z-20 rounded-lg border border-gray-200 bg-white shadow-lg p-2 space-y-2"><label class="flex items-center gap-2 text-xs text-gray-700"><input id="ab2-${prefix}-show-active-toggle" type="checkbox" class="h-4 w-4" checked><span id="ab2-${prefix}-show-active-label">Aktive (0) anzeigen</span></label><label class="flex items-center gap-2 text-xs text-gray-700"><input id="ab2-${prefix}-show-planned-toggle" type="checkbox" class="h-4 w-4"><span id="ab2-${prefix}-show-planned-label">Geplante (0) anzeigen</span></label><label class="flex items-center gap-2 text-xs text-gray-700"><input id="ab2-${prefix}-show-past-toggle" type="checkbox" class="h-4 w-4"><span id="ab2-${prefix}-show-past-label">Abgelaufene (0) anzeigen</span></label></div>`;
    parent.appendChild(details);
}

function ensureModalStatusVisibilityControls() {
    ensureStatusVisibilityDropdown('accounts', 'ab2-accounts-search');
    ensureStatusVisibilityDropdown('transfers', 'ab2-transfers-search');
}

function updateStatusVisibilityUi(prefix, state, counts) {
    const summary = el(`ab2-${prefix}-status-summary`);
    const activeLabel = el(`ab2-${prefix}-show-active-label`);
    const plannedLabel = el(`ab2-${prefix}-show-planned-label`);
    const pastLabel = el(`ab2-${prefix}-show-past-label`);
    const activeToggle = el(`ab2-${prefix}-show-active-toggle`);
    const plannedToggle = el(`ab2-${prefix}-show-planned-toggle`);
    const pastToggle = el(`ab2-${prefix}-show-past-toggle`);
    if (activeLabel) activeLabel.textContent = `Aktive (${counts.active}) anzeigen`;
    if (plannedLabel) plannedLabel.textContent = `Geplante (${counts.planned}) anzeigen`;
    if (pastLabel) pastLabel.textContent = `Abgelaufene (${counts.past}) anzeigen`;
    if (activeToggle) activeToggle.checked = state.showActive !== false;
    if (plannedToggle) plannedToggle.checked = !!state.showPlanned;
    if (pastToggle) pastToggle.checked = !!state.showPast;
    if (summary) {
        const segments = [];
        if (state.showActive !== false) segments.push(`Aktive (${counts.active})`);
        if (state.showPlanned) segments.push(`Geplante (${counts.planned})`);
        if (state.showPast) segments.push(`Abgelaufene (${counts.past})`);
        summary.textContent = segments.length ? segments.join(' + ') : 'Keine sichtbar';
    }
}
function normalizeForecastHorizon(value, fallback = 12) {
    const parsed = parseInt(value, 10);
    if (FORECAST_HORIZON_OPTIONS.includes(parsed)) return parsed;
    return FORECAST_HORIZON_OPTIONS.includes(fallback) ? fallback : 12;
}
function setForecastHorizon(value, persist = false) {
    forecastHorizonMonths = normalizeForecastHorizon(value, forecastHorizonMonths);
    const horizonInput = el('ab2-forecast-horizon');
    if (horizonInput) horizonInput.value = String(forecastHorizonMonths);
    if (persist) {
        saveUserSetting('ab2_forecast_horizon', String(forecastHorizonMonths)).catch((error) => console.warn(error));
    }
}
function rebuildForecastAndRender() {
    FORECAST = buildForecast(forecastHorizonMonths);
    renderAll();
}
function applySimulationDate(value) {
    const parsed = value ? parseDate(value) : null;
    simulationDate = parsed ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : null;
    rebuildForecastAndRender();
}
function toNum(v, f = 0) { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : f; }
function roundMoney(v) { return Math.round(toNum(v, 0) * 100) / 100; }
function isoDate(v) { const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseDate(v) { if (!v) return null; const d = new Date(v); if (Number.isNaN(d.getTime())) return null; d.setHours(0, 0, 0, 0); return d; }
function timestampMs(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v?.toMillis === 'function') return toNum(v.toMillis(), 0);
    if (typeof v?.seconds === 'number') return toNum(v.seconds, 0) * 1000;
    if (v instanceof Date) return toNum(v.getTime(), 0);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function newestEntityMs(entity) {
    return Math.max(timestampMs(entity?.updatedAt), timestampMs(entity?.createdAt));
}
function timestampToDate(v) { if (!v) return null; if (v instanceof Date) return v; if (typeof v.toDate === 'function') return v.toDate(); const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function formatDate(v) { const d = parseDate(v) || timestampToDate(v); return d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : '-'; }
function formatDateWithWeekday(v) {
    const d = parseDate(v) || timestampToDate(v);
    if (!d) return '-';
    return `${WEEKDAYS_SHORT[d.getDay()] || ''} ${formatDate(d)}`.trim();
}
function formatDateTime(v) { const d = timestampToDate(v) || parseDate(v); return d ? `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '-'; }
function formatEntityUpdateTime(entity, fallbackDate = null) {
    const stamp = timestampToDate(entity?.updatedAt) || timestampToDate(entity?.createdAt) || (fallbackDate ? parseDate(fallbackDate) : null);
    return formatDateTime(stamp);
}
function formatCurrency(v) { return `${roundMoney(v).toFixed(2)} €`; }
function formatSignedCurrency(v) { const n = roundMoney(v); return `${n >= 0 ? '+' : ''}${n.toFixed(2)} €`; }
function dateShiftDays(value, days = 0) {
    const date = parseDate(value);
    if (!date) return null;
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}
function previousDateIso(value) {
    const prev = dateShiftDays(value, -1);
    return prev ? isoDate(prev) : '';
}
function easterSunday(year) {
    const y = parseInt(year, 10);
    if (!Number.isInteger(y) || y < 1900) return null;
    const a = y % 19;
    const b = Math.floor(y / 100);
    const c = y % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + (2 * e) + (2 * i) - h - k) % 7;
    const m = Math.floor((a + (11 * h) + (22 * l)) / 451);
    const month = Math.floor((h + l - (7 * m) + 114) / 31);
    const day = ((h + l - (7 * m) + 114) % 31) + 1;
    return new Date(y, month - 1, day);
}
function austrianBankHolidaySet(year) {
    const y = parseInt(year, 10);
    if (!Number.isInteger(y)) return new Set();
    if (!austrianBankHolidaySet.cache) austrianBankHolidaySet.cache = {};
    if (austrianBankHolidaySet.cache[y]) return austrianBankHolidaySet.cache[y];
    const keys = new Set([
        `${y}-01-01`,
        `${y}-01-06`,
        `${y}-05-01`,
        `${y}-08-15`,
        `${y}-10-26`,
        `${y}-11-01`,
        `${y}-12-08`,
        `${y}-12-25`,
        `${y}-12-26`
    ]);
    const easter = easterSunday(y);
    if (easter) {
        [1, 39, 50, 60].forEach((offset) => {
            const day = new Date(easter);
            day.setDate(day.getDate() + offset);
            keys.add(isoDate(day));
        });
    }
    austrianBankHolidaySet.cache[y] = keys;
    return keys;
}
function isAustrianBankHoliday(value) {
    const date = parseDate(value);
    if (!date) return false;
    return austrianBankHolidaySet(date.getFullYear()).has(isoDate(date));
}
function isBusinessDay(value) {
    const date = parseDate(value);
    if (!date) return false;
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) return false;
    return !isAustrianBankHoliday(date);
}
function shiftToBusinessDay(value, direction = 1) {
    const date = parseDate(value);
    if (!date) return null;
    const step = direction < 0 ? -1 : 1;
    const candidate = new Date(date);
    for (let i = 0; i < 10 && !isBusinessDay(candidate); i += 1) {
        candidate.setDate(candidate.getDate() + step);
    }
    return candidate;
}
function parseMonths(v) { return String(v || '').split(',').map(x => parseInt(x.trim(), 10)).filter(x => x >= 1 && x <= 12).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b); }
function parseCsvList(v) { return String(v || '').split(',').map((x) => x.trim()).filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i); }
function normalizeSearchText(v) { return String(v || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/€/g, '').replace(/\s+/g, ' ').trim(); }
function normalizeAccountType(accountOrType) { const raw = typeof accountOrType === 'string' ? accountOrType : accountOrType?.type; return String(raw || '').trim().toLowerCase() === 'person' ? 'person' : 'bank'; }
function normalizeAccountRole(accountOrRole) { const raw = typeof accountOrRole === 'string' ? accountOrRole : accountOrRole?.role; const n = String(raw || '').trim().toLowerCase(); return ['source', 'target', 'both'].includes(n) ? n : 'both'; }
function isPersonAccount(account) { return normalizeAccountType(account) === 'person'; }
function accountUsesBuffer(accountOrType, roleOverride = null) {
    const type = normalizeAccountType(accountOrType);
    const role = normalizeAccountRole(roleOverride ?? (typeof accountOrType === 'object' ? accountOrType?.role : null));
    return type !== 'person' && role !== 'source';
}
function accountMinBuffer(account) { return accountUsesBuffer(account) ? roundMoney(toNum(account?.minBuffer, 0)) : 0; }
function canBeSourceAccount(account) { const role = normalizeAccountRole(account); return role === 'source' || role === 'both' || isPersonAccount(account); }
function canBeTargetAccount(account) { const role = normalizeAccountRole(account); return role === 'target' || role === 'both'; }
function isRelevantTargetAccount(account) { return !!account && canBeTargetAccount(account) && !isPersonAccount(account); }
function intervalLabel(i, cm = []) { if (i === 'monthly') return 'Monatlich'; if (i === 'quarterly') return 'Quartal'; if (i === 'semiannual') return 'Halbjahr'; if (i === 'annual') return 'Jährlich'; if (i === 'once') return 'Einmalig'; if (i === 'custom') return cm.length ? `Individuell (${cm.map(m => MONTHS[m - 1]).join(', ')})` : 'Individuell'; return '-'; }
function describeInterval(i, startMonth, customMonths, dayOfMonth) { const dayText = Number.isInteger(parseInt(dayOfMonth, 10)) ? ` am ${Math.min(Math.max(parseInt(dayOfMonth, 10), 1), 31)}. Tag` : ''; if (i === 'monthly') return `jeden Monat${dayText}`; if (i === 'once') return 'einmalig'; if (i === 'quarterly') return `alle 3 Monate ab ${MONTHS[Math.max(0, (parseInt(startMonth, 10) || 1) - 1)]}${dayText}`; if (i === 'semiannual') return `alle 6 Monate ab ${MONTHS[Math.max(0, (parseInt(startMonth, 10) || 1) - 1)]}${dayText}`; if (i === 'annual') return `jährlich ab ${MONTHS[Math.max(0, (parseInt(startMonth, 10) || 1) - 1)]}${dayText}`; return `jedes Jahr in ${(customMonths || []).map(m => MONTHS[m - 1]).join(', ')}${dayText}`; }
function compareNumber(actual, op, expected) { const a = roundMoney(actual); const b = roundMoney(expected); if (op === '>') return a > b; if (op === '>=') return a >= b; if (op === '<') return a < b; if (op === '<=') return a <= b; return a === b; }
function helpButton(targetId) { return `<button type="button" class="ab2-help-btn inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200" data-help-target="${targetId}" title="Info">i</button>`; }
function helpContent(id, text) { return `<div id="${id}" class="ab2-help-content hidden mt-1 text-[11px] sm:text-xs leading-relaxed text-blue-900 bg-blue-50 border border-blue-200 rounded-lg p-2">${text}</div>`; }

function ensureInlineStyles() {
    if (document.getElementById('ab2-inline-styles')) return;
    const style = document.createElement('style');
    style.id = 'ab2-inline-styles';
    style.textContent = `
        #abbuchungsberechner-root .ab2-shell {
            overflow-x: hidden;
        }
        #abbuchungsberechner-root .ab2-shell * {
            max-width: 100%;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        @media (max-width: 640px) {
            #abbuchungsberechner-root .ab2-shell {
                font-size: 12px;
            }
            #abbuchungsberechner-root .ab2-shell .ab2-compact-btn {
                font-size: 0.72rem;
                line-height: 1rem;
                padding: 0.4rem 0.55rem;
            }
            #abbuchungsberechner-root .ab2-shell .ab2-compact-card {
                padding: 0.65rem;
            }
        }
        #abbuchungsberechner-root .ab2-simple-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
        }
        #abbuchungsberechner-root .ab2-simple-table thead th {
            position: sticky;
            top: 0;
            z-index: 1;
        }
        #abbuchungsberechner-root .ab2-click-row {
            cursor: pointer;
        }
        #abbuchungsberechner-root .ab2-click-row:hover {
            background: rgba(224, 231, 255, 0.45);
        }
        #abbuchungsberechner-root .ab2-transfer-split-layout {
            align-items: start;
            transition: grid-template-columns 0.22s ease;
        }
        #abbuchungsberechner-root .ab2-transfer-splitter {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.2rem;
            min-height: 100%;
            border: 0;
            border-left: 1px solid #cbd5e1;
            border-right: 1px solid #cbd5e1;
            background: #f8fafc;
            color: #334155;
            font-size: 0.8rem;
            font-weight: 700;
            cursor: pointer;
            border-radius: 0.45rem;
        }
        #abbuchungsberechner-root .ab2-transfer-pane-muted {
            opacity: 0.72;
        }
        #abbuchungsberechner-root .ab2-soll-chip {
            display: inline-flex;
        }
        @media (max-width: 900px) {
            #abbuchungsberechner-root .ab2-soll-chip {
                display: none !important;
            }
        }
        @media (max-width: 1023px) {
            #abbuchungsberechner-root .ab2-transfer-split-layout {
                grid-template-columns: minmax(0, 1fr) !important;
            }
            #abbuchungsberechner-root .ab2-transfer-splitter {
                display: none;
            }
            #abbuchungsberechner-root .ab2-transfer-pane-muted {
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

function buildShell() {
    return `
    <div class="ab2-shell space-y-3 sm:space-y-4 text-[13px] sm:text-sm">
        <div class="back-link-container w-full mb-1">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <button class="back-link flex items-center text-gray-600 hover:text-indigo-600 transition" data-target="home"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 sm:w-6 sm:h-6 mr-1"><path d="m15 18-6-6 6-6"></path></svg><span class="text-sm sm:text-base font-semibold">zurück</span></button>
                <div class="flex gap-2 flex-wrap">
                    <button id="ab2-btn-create" class="ab2-compact-btn py-2 px-4 bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-bold rounded-lg hover:shadow-lg transition text-xs sm:text-sm">+ Buchung</button>
                </div>
            </div>
            <div class="border-t border-gray-300 mt-2"></div>
        </div>
        <div class="ab2-compact-card bg-gradient-to-r from-blue-700 via-indigo-600 to-sky-600 text-white p-3 sm:p-4 rounded-2xl shadow-md">
            <div class="flex items-start justify-between gap-3 flex-wrap">
                <div><div class="flex items-center gap-2 flex-wrap"><h2 class="text-xl sm:text-2xl font-bold">Abbuchungsberechner</h2></div><p class="text-xs sm:text-sm text-white/90 mt-1 max-w-3xl">Kosten, Daueraufträge & Einmalüberweisungen planen – und jederzeit prüfen, ob Ihre Konten gedeckt sind.</p></div>
                <span id="ab2-total-status" class="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-bold text-xs sm:text-sm text-white bg-green-500">STABIL</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-center mt-4">
                <button type="button" id="ab2-stat-card-accounts" data-stat="accounts" class="bg-white/20 px-2 py-2 rounded-lg transition cursor-pointer"><p id="ab2-stat-accounts" class="text-lg font-bold">0</p><p class="text-[10px]">Konten</p></button>
                <button type="button" id="ab2-stat-card-active" data-stat="aktiv" class="bg-green-500/30 px-2 py-2 rounded-lg transition cursor-pointer"><p id="ab2-stat-active" class="text-lg font-bold">0</p><p class="text-[10px]">Aktiv</p></button>
                <button type="button" id="ab2-stat-card-planned" data-stat="geplant" class="bg-blue-500/30 px-2 py-2 rounded-lg transition cursor-pointer"><p id="ab2-stat-planned" class="text-lg font-bold">0</p><p class="text-[10px]">Geplant</p></button>
                <button type="button" id="ab2-stat-card-past" data-stat="vergangen" class="bg-gray-500/30 px-2 py-2 rounded-lg transition cursor-pointer"><p id="ab2-stat-past" class="text-lg font-bold">0</p><p class="text-[10px]">Vergangen</p></button>
                <button type="button" id="ab2-stat-card-errors" data-stat="fehler" class="bg-yellow-500/30 px-2 py-2 rounded-lg transition cursor-pointer"><p id="ab2-stat-errors" class="text-lg font-bold">0</p><p class="text-[10px]">Fehler</p></button>
                <button type="button" id="ab2-stat-card-warnings" data-stat="warnings" class="bg-amber-500/30 px-2 py-2 rounded-lg transition cursor-pointer"><p id="ab2-stat-warnings" class="text-lg font-bold">0</p><p class="text-[10px]">Warnung</p></button>
                <button type="button" id="ab2-stat-card-alarms" data-stat="alarms" class="bg-red-500/30 px-2 py-2 rounded-lg transition cursor-pointer"><p id="ab2-stat-alarms" class="text-lg font-bold">0</p><p class="text-[10px]">Alarm</p></button>
            </div>
        </div>
        <div id="ab2-setup-panel" class="space-y-2"></div>
        <div id="ab2-quality-banner" class="hidden bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-900"></div>
        <div id="ab2-imbalance-banner" class="hidden bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-900"></div>
        <div id="ab2-simulation-warning" class="hidden bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-3 rounded-lg font-bold text-sm"></div>
        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200"><div class="flex flex-wrap gap-2 items-center"><label class="text-sm font-bold text-gray-700">📅 Datums-Simulation:</label><input type="date" id="ab2-simulation-datum" class="p-2 border-2 border-gray-300 rounded-lg text-sm"><button id="ab2-clear-simulation" type="button" class="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-bold text-sm">Zurücksetzen</button><label class="ml-auto text-xs font-bold text-gray-700" for="ab2-forecast-horizon">Forecast-Horizont</label><select id="ab2-forecast-horizon" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="3">3 Monate</option><option value="6">6 Monate</option><option value="12" selected>12 Monate</option><option value="24">24 Monate</option></select></div></div>
        <div class="grid grid-cols-1 gap-3">
            <div class="bg-white rounded-xl shadow p-3"><div class="flex items-center justify-between gap-2 mb-2"><h3 id="ab2-forecast-title" class="text-sm font-bold text-gray-700 flex items-center gap-2">12-Monate-Kontostandsprognose ${helpButton('ab2-help-forecast')}</h3><button id="ab2-forecast-toggle" type="button" class="px-2 py-1 rounded border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100">ausklappen</button></div><div id="ab2-forecast-state" class="inline-flex px-2 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">ALLE OK</div>${helpContent('ab2-help-forecast', 'Zeigt die Monatsvorschau mit tagesgenauer Simulation. Innerhalb eines Tages wird konservativ gerechnet (Abbuchung vor Eingang). Wochenenden und österreichische Bankfeiertage werden berücksichtigt. Klick auf eine Zelle = Warum kritisch? Welche Maßnahme hilft?')}<div id="ab2-forecast-overview-wrap" class="mt-2 hidden"><div id="ab2-forecast-overview" class="text-sm text-gray-400 italic">Keine Forecast-Daten.</div></div></div>
        </div>
        <div id="ab2-suggestion-panel" class="bg-white rounded-xl shadow p-3"><h3 class="text-sm font-bold text-gray-700 mb-2">Ausgleichsvorschläge</h3><div id="ab2-suggestion-preview" class="space-y-2"></div></div>
        <div class="relative"><div class="flex justify-end"><button id="ab2-toggle-glossary" type="button" class="w-5 h-5 rounded-full border border-blue-200 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100" title="Begriffe einfach erklärt">i</button></div><div id="ab2-glossary" class="hidden mt-1 rounded-xl border border-blue-100 bg-white/95 p-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs shadow"></div></div>
        <div class="flex justify-center"><button id="ab2-toggle-filter-controls" class="text-gray-500 hover:text-blue-700 transition flex items-center gap-1 text-xs font-bold py-1 px-4 rounded-full hover:bg-blue-50"><span>Filter & Kategorien</span><svg id="ab2-toggle-filter-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 transform transition-transform"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"></path></svg></button></div>
        <div id="ab2-filter-controls-wrapper" class="hidden space-y-3">
            <div class="bg-white rounded-xl shadow p-3 space-y-3">
                <div class="flex flex-wrap gap-2 items-center"><label class="flex items-center gap-2 px-3 py-2 bg-white border-2 border-gray-300 rounded-lg cursor-pointer"><input type="checkbox" id="ab2-filter-negate" class="w-4 h-4"><span class="font-bold text-red-600 text-sm">NICHT</span></label><select id="ab2-search-join-mode" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm font-bold"><option value="and">AND</option><option value="or">OR</option></select><input type="text" id="ab2-search-input" placeholder="z. B. konto:giro oder betrag>100" class="flex-1 min-w-[220px] p-2 border-2 border-gray-300 rounded-lg text-sm"><button id="ab2-add-filter-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition text-sm">+ Filter</button><button id="ab2-reset-filters" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-bold transition text-sm">Reset</button></div>
                <div id="ab2-active-search-tags" class="flex flex-wrap gap-1"></div>
                <div class="flex flex-wrap gap-2"><select id="ab2-filter-status" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="">Alle Status</option><option value="aktiv">Aktiv</option><option value="geplant">Geplant</option><option value="vergangen">Vergangen</option><option value="fehler">Fehler</option></select><select id="ab2-filter-typ" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="">Alle Typen</option><option value="belastung">Ausgabe</option><option value="gutschrift">Einnahme</option></select><select id="ab2-filter-interval" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="">Alle Intervalle</option><option value="monthly">Monatlich</option><option value="quarterly">Quartal</option><option value="semiannual">Halbjahr</option><option value="annual">Jährlich</option><option value="once">Einmalig</option><option value="custom">Individuell</option></select><select id="ab2-filter-sort" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="critical">Kritischste zuerst</option><option value="next">Nächste Ausführung</option><option value="amount_desc">Betrag ↓</option><option value="amount_asc">Betrag ↑</option><option value="title">Titel A-Z</option></select></div>
                <div class="flex flex-wrap gap-2"><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="critical">Kritisch</button><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="contrib">Mit Beitrag</button><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="planned">Geplant</button><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="errors">Fehler</button><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="">Alle</button></div>
            </div>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden"><div class="overflow-x-auto"><table class="min-w-[1240px]"><thead class="bg-blue-50 border-b-2 border-blue-200"><tr><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Status</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Titel</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Konto</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Typ</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Intervall</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Betrag</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Nächste</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Jahreswert</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Wirkung</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Gültigkeit</th><th class="px-3 py-3 text-center text-xs font-bold text-blue-800 uppercase">Aktionen</th></tr></thead><tbody id="ab2-table-body" class="divide-y divide-gray-200"><tr><td colspan="11" class="px-4 py-8 text-center text-gray-400 italic">Keine Einträge vorhanden.</td></tr></tbody></table></div></div>
    </div>
    <div id="ab2-item-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-500 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Buchung / Kostenstelle</h3><button id="ab2-close-item-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-4"><input type="hidden" id="ab2-item-id"><div class="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label class="block text-sm font-bold text-gray-700 mb-1">Titel *</label><input id="ab2-item-title" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Konto *</label><select id="ab2-item-account" class="w-full p-2 border rounded-lg"></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Typ *</label><select id="ab2-item-type" class="w-full p-2 border rounded-lg"><option value="belastung">Ausgabe / Abbuchung</option><option value="gutschrift">Einnahme / Gutschrift</option></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Betrag *</label><input id="ab2-item-amount" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Intervall</label><select id="ab2-item-interval" class="w-full p-2 border rounded-lg"><option value="monthly">Monatlich</option><option value="quarterly">Quartal</option><option value="semiannual">Halbjahr</option><option value="annual">Jährlich</option><option value="once">Einmalig</option><option value="custom">Individuell</option></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Start-Monat ${helpButton('ab2-help-item-start-month')}</label><input id="ab2-item-start-month" type="number" min="1" max="12" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-item-start-month', 'Nur für Quartal, Halbjahr oder Jahr: Startmonat des Zyklus.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Monate ${helpButton('ab2-help-item-custom-months')}</label><input id="ab2-item-custom-months" type="text" placeholder="1,3,8" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-item-custom-months', 'Nur bei Individuell: Monate als Liste eingeben, z. B. 1,3,8.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Tag ${helpButton('ab2-help-item-day')}</label><input id="ab2-item-day" type="number" min="1" max="31" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-item-day', 'Optionaler Ausführungstag. Bei kurzen Monaten wird automatisch der Monatsletzte verwendet.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Gültig ab *</label><input id="ab2-item-valid-from" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Gültig bis</label><input id="ab2-item-valid-to" type="date" class="w-full p-2 border rounded-lg"></div></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Notizen</label><textarea id="ab2-item-notes" rows="2" class="w-full p-2 border rounded-lg"></textarea></div><div class="rounded-xl border border-blue-100 bg-blue-50 p-3"><div class="text-sm font-bold text-blue-900 mb-1">So wirkt dieser Eintrag</div><div id="ab2-item-preview" class="text-sm text-blue-900">Noch unvollständig.</div></div><div class="bg-gray-50 p-3 rounded-lg border"><div class="flex justify-between items-center mb-2"><label class="block text-sm font-bold text-gray-700">Beiträge / Gegenkonten</label><button id="ab2-add-contrib-btn" type="button" class="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm">+ Beitrag</button></div><div id="ab2-contrib-list" class="space-y-2"></div></div></div><div class="sticky bottom-0 bg-gray-100 p-4 rounded-b-2xl flex justify-between gap-2 flex-wrap"><div class="flex gap-2"><button id="ab2-item-edit-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300" style="display:none;">Bearbeiten</button><button id="ab2-item-delete-btn" class="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200" style="display:none;">Löschen</button><button id="ab2-item-abtausch-btn" class="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200" style="display:none;">Abtausch</button></div><div class="flex gap-2"><button id="ab2-cancel-item-btn" class="px-5 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400">Abbrechen</button><button id="ab2-item-save-btn" class="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-bold rounded-lg">Speichern</button></div></div></div></div>
    <div id="ab2-abtausch-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg"><div class="bg-gradient-to-r from-purple-600 to-indigo-500 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Abtausch</h3><button id="ab2-close-abtausch-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-3"><p id="ab2-abtausch-old-info" class="text-sm text-gray-600 bg-gray-50 border rounded p-2">-</p><div><label class="block text-sm font-bold text-gray-700 mb-1">Neues Startdatum *</label><input id="ab2-abtausch-new-start" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Neuer Betrag *</label><input id="ab2-abtausch-new-amount" type="text" class="w-full p-2 border rounded-lg"></div><div class="rounded-xl border border-purple-100 bg-purple-50 p-3"><div class="text-sm font-bold text-purple-900 mb-1">Auswirkung</div><div id="ab2-abtausch-preview" class="text-sm text-purple-900">Noch keine Vorschau.</div></div></div><div class="bg-gray-100 p-4 rounded-b-2xl flex justify-end gap-2"><button id="ab2-cancel-abtausch-btn" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg">Abbrechen</button><button id="ab2-save-abtausch-btn" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-500 text-white rounded-lg">Übernehmen</button></div></div></div>
    <div id="ab2-accounts-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-slate-700 to-slate-600 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Konten / Quellen</h3><button id="ab2-close-accounts-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="space-y-3"><input type="hidden" id="ab2-account-id"><div><label class="block text-sm font-bold text-gray-700 mb-1">Name *</label><input id="ab2-account-name" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Bank</label><input id="ab2-account-bank" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">IBAN</label><input id="ab2-account-iban" type="text" class="w-full p-2 border rounded-lg"></div><div class="grid grid-cols-2 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Typ</label><select id="ab2-account-type" class="w-full p-2 border rounded-lg"><option value="bank">Bank</option><option value="person">Person</option></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Rolle</label><select id="ab2-account-role" class="w-full p-2 border rounded-lg"><option value="both">Quelle & Ziel</option><option value="source">Nur Quelle</option><option value="target">Nur Ziel</option></select></div></div><div class="grid grid-cols-3 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Mindestpuffer ${helpButton('ab2-help-account-buffer')}</label><input id="ab2-account-min-buffer" type="text" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-account-buffer', 'Mindestbetrag, der auf dem Konto verbleiben soll. Unter diesem Wert entstehen Warnung oder Alarm.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Startsaldo ${helpButton('ab2-help-account-start')}</label><input id="ab2-account-start-balance" type="text" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-account-start', 'Wird zusammen mit dem Stand-Datum als Snapshot gespeichert oder aktualisiert.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Stand-Datum</label><input id="ab2-account-start-date" type="date" class="w-full p-2 border rounded-lg"></div></div><div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><div class="text-sm font-bold text-slate-900 mb-1">So wird dieses Konto verwendet</div><div id="ab2-account-preview" class="text-sm text-slate-900">Noch unvollständig.</div></div><div class="flex gap-2"><button id="ab2-reset-account-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Reset</button><button id="ab2-save-account-btn" class="px-4 py-2 bg-slate-700 text-white rounded-lg">Speichern</button></div></div><div><h4 class="font-bold text-gray-700 mb-2">Bestehende Konten</h4><div class="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-2"><div class="flex flex-wrap gap-2"><button id="ab2-accounts-filter-all" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-blue-600 text-white">ALLE</button><button id="ab2-accounts-filter-bank" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">Bank</button><button id="ab2-accounts-filter-person" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">Person</button></div><input id="ab2-accounts-search" type="text" placeholder="Konto/Person suchen..." class="w-full sm:flex-1 sm:min-w-[180px] p-2 border rounded text-sm"></div><div id="ab2-accounts-list" class="space-y-2"><p class="text-sm text-gray-400 italic">Noch keine Konten/Quellen.</p></div></div></div></div></div>
    <div id="ab2-transfers-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-blue-700 to-indigo-700 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Daueraufträge &amp; Überweisungen</h3><button id="ab2-close-transfers-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="space-y-3"><input type="hidden" id="ab2-transfer-id"><div class="grid grid-cols-2 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Quelle *</label><select id="ab2-transfer-source" class="w-full p-2 border rounded-lg"></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Ziel *</label><select id="ab2-transfer-target" class="w-full p-2 border rounded-lg"></select></div></div><div class="grid grid-cols-2 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Betrag *</label><input id="ab2-transfer-amount" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Intervall</label><select id="ab2-transfer-interval" class="w-full p-2 border rounded-lg"><option value="monthly">Monatlich</option><option value="quarterly">Quartal</option><option value="semiannual">Halbjahr</option><option value="annual">Jährlich</option><option value="once">Einmalig (einmalige Überweisung)</option><option value="custom">Individuell</option></select></div></div><div class="grid grid-cols-3 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Start-Monat ${helpButton('ab2-help-transfer-start-month')}</label><input id="ab2-transfer-start-month" type="number" min="1" max="12" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-transfer-start-month', 'Nur für Quartal, Halbjahr oder Jahr relevant: Startmonat des Transferzyklus.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Monate ${helpButton('ab2-help-transfer-months')}</label><input id="ab2-transfer-custom-months" type="text" placeholder="1,3,8" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-transfer-months', 'Nur bei Individuell relevant: Monate als Liste eingeben.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Tag ${helpButton('ab2-help-transfer-day')}</label><input id="ab2-transfer-day" type="number" min="1" max="31" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-transfer-day', 'Optionaler Ausführungstag im Monat.')}</div></div><div class="grid grid-cols-2 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Gültig ab *</label><input id="ab2-transfer-valid-from" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Gültig bis</label><input id="ab2-transfer-valid-to" type="date" class="w-full p-2 border rounded-lg"></div></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Notiz</label><input id="ab2-transfer-note" type="text" class="w-full p-2 border rounded-lg"></div><div class="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><div class="text-sm font-bold text-indigo-900 mb-1">So wirkt dieser Transfer</div><div id="ab2-transfer-preview" class="text-sm text-indigo-900">Noch unvollständig.</div></div><div class="flex gap-2"><button id="ab2-reset-transfer-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Reset</button><button id="ab2-save-transfer-btn" class="px-4 py-2 bg-indigo-700 text-white rounded-lg">Speichern</button></div></div><div><h4 class="font-bold text-gray-700 mb-2">Bestehende Transfers</h4><div class="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-2"><div class="flex flex-wrap gap-2"><button id="ab2-transfers-filter-all" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-blue-600 text-white">ALLE</button><button id="ab2-transfers-filter-bank" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">Bank</button><button id="ab2-transfers-filter-person" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">Person</button></div><input id="ab2-transfers-search" type="text" placeholder="Transfer suchen..." class="w-full sm:flex-1 sm:min-w-[180px] p-2 border rounded text-sm"></div><div id="ab2-transfers-list" class="space-y-2"><p class="text-sm text-gray-400 italic">Noch keine Daueraufträge.</p></div></div></div></div></div>
    <div id="ab2-reconciliation-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-emerald-700 to-teal-700 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Monatsabgleich</h3><button id="ab2-close-recon-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="space-y-3"><div><label class="block text-sm font-bold text-gray-700 mb-1">Konto *</label><select id="ab2-recon-account" class="w-full p-2 border rounded-lg"></select></div><div class="grid grid-cols-3 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Typ</label><select id="ab2-recon-type" class="w-full p-2 border rounded-lg"><option value="snapshot">Snapshot</option><option value="manual">Manuell</option></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Datum *</label><input id="ab2-recon-date" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Wert *</label><input id="ab2-recon-value" type="text" class="w-full p-2 border rounded-lg"></div></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Notiz</label><input id="ab2-recon-note" type="text" class="w-full p-2 border rounded-lg"></div><div class="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div class="text-sm font-bold text-emerald-900 mb-1">So wirkt dieser Abgleich</div><div id="ab2-recon-preview" class="text-sm text-emerald-900">Noch unvollständig.</div></div><div class="flex gap-2"><button id="ab2-recon-today-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Heute</button><button id="ab2-save-recon-btn" class="px-4 py-2 bg-emerald-700 text-white rounded-lg">Speichern</button></div></div><div><h4 class="font-bold text-gray-700 mb-2">Letzte Abgleiche</h4><div id="ab2-recon-list" class="space-y-2"><p class="text-sm text-gray-400 italic">Noch keine Abgleiche.</p></div></div></div></div></div>
    <div id="ab2-suggestions-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-indigo-700 to-blue-700 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Vorschläge</h3><button id="ab2-close-suggestions-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4"><div id="ab2-suggestions-content" class="space-y-3"></div></div></div></div>
    <div id="ab2-detail-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-slate-700 to-slate-600 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 id="ab2-detail-title" class="text-xl font-bold">Details</h3><button id="ab2-close-detail-modal" class="text-white/80 hover:text-white transition">✕</button></div><div id="ab2-detail-content" class="p-4"></div></div></div>`;
}

function ensurePersonControlModal() {
    if (el('ab2-person-control-modal')) return;
    const root = el('abbuchungsberechner-root');
    if (!root) return;
    const modal = document.createElement('div');
    modal.id = 'ab2-person-control-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.style.display = 'none';
    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-violet-700 to-indigo-700 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 id="ab2-person-control-title" class="text-xl font-bold">Personenkontrolle</h3><button id="ab2-close-person-control-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-4"><div class="rounded-xl border border-violet-100 bg-violet-50 p-3"><div class="text-sm font-bold text-violet-900 mb-2">Zeitraum prüfen</div><div class="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end"><div><label class="block text-xs font-bold text-violet-900 mb-1">Von</label><input id="ab2-person-control-from" type="date" class="w-full p-2 border rounded-lg bg-white"></div><div><label class="block text-xs font-bold text-violet-900 mb-1">Bis</label><input id="ab2-person-control-to" type="date" class="w-full p-2 border rounded-lg bg-white"></div><div class="sm:col-span-2"><button id="ab2-person-control-refresh-btn" type="button" class="px-4 py-2 bg-violet-700 text-white rounded-lg font-bold hover:bg-violet-800 w-full sm:w-auto">Buchungen aktualisieren</button></div></div><div id="ab2-person-control-summary" class="mt-2 text-xs text-violet-800">-</div></div><div class="rounded-xl border border-gray-200 bg-white overflow-hidden"><div class="px-3 py-2 border-b border-gray-200 bg-gray-50 text-xs text-gray-600">Alle geplanten Buchungen von/an diese Person im gewählten Zeitraum.</div><div id="ab2-person-control-list" class="max-h-[38vh] overflow-auto p-2 text-sm text-gray-500">Bitte Zeitraum wählen.</div></div><div class="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3"><div class="text-sm font-bold text-slate-800">Kontrolle abschließen</div><div class="grid grid-cols-1 sm:grid-cols-3 gap-2"><div><label class="block text-xs font-bold text-slate-700 mb-1">Ergebnis *</label><select id="ab2-person-control-result" class="w-full p-2 border rounded-lg bg-white"><option value="">Bitte wählen...</option><option value="done">Kontrolle durchgeführt</option><option value="not_done">Kontrolle nicht durchgeführt</option></select></div><div class="sm:col-span-2"><label class="block text-xs font-bold text-slate-700 mb-1">Freitext / Grund</label><input id="ab2-person-control-note" type="text" class="w-full p-2 border rounded-lg bg-white" placeholder="z. B. Kontoauszug geprüft, 2 Beträge abgeglichen"></div></div><div class="flex flex-wrap justify-end gap-2"><button id="ab2-cancel-person-control-btn" type="button" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Abbrechen</button><button id="ab2-person-control-finish-btn" type="button" class="px-4 py-2 bg-violet-700 text-white rounded-lg font-bold hover:bg-violet-800">Protokollieren & beenden</button></div></div><div class="rounded-xl border border-amber-200 bg-amber-50 p-3"><div class="text-sm font-bold text-amber-900 mb-2">Bisherige Kontrollen</div><div id="ab2-person-control-history" class="space-y-2 text-sm text-amber-900">Noch keine Kontrollen protokolliert.</div></div></div></div>`;
    root.appendChild(modal);
}

function ensureTransferLinkingFields() {
    const noteInput = el('ab2-transfer-note');
    if (!noteInput) return;
    if (el('ab2-transfer-linking-block')) {
        populateTransferLinkingOptions();
        updateTransferLinkedTitleAllocationsUI();
        updateTransferLinkingBudgetState();
        return;
    }
    const noteWrap = noteInput.closest('div');
    if (!noteWrap || !noteWrap.parentElement) return;
    const block = document.createElement('div');
    block.id = 'ab2-transfer-linking-block';
    block.className = 'rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2';
    block.innerHTML = `<div class="text-sm font-bold text-indigo-900 flex items-center gap-2">Zahlungsgrund-Zuordnung <span class="text-xs font-normal text-indigo-500">(optional)</span> ${helpButton('ab2-help-transfer-linking')}</div>${helpContent('ab2-help-transfer-linking', 'Optional: Weise diesen Transfer einem oder mehreren Zahlungsgründen (Buchungen) zu, um zu prüfen, ob alle Kosten abgedeckt sind. Ohne Zuordnung ist der Transfer im Forecast trotzdem wirksam. [OHNE ZUORDNUNG] für Rundungsreste.')}<div class="grid grid-cols-1 lg:grid-cols-2 gap-3"><div><label class="block text-xs font-bold text-indigo-800 mb-1">Zahlungsgrund (Titel)</label><details id="ab2-transfer-linked-titles-dropdown" class="group relative"><summary class="list-none cursor-pointer w-full p-2 border rounded-lg bg-white text-sm text-gray-700 flex items-center justify-between gap-2"><span id="ab2-transfer-linked-titles-summary">Keine Titel ausgewählt</span><span class="text-[10px] text-gray-500">▼</span></summary><div id="ab2-transfer-linked-titles-list" class="mt-2 max-h-56 overflow-y-auto rounded-lg border border-indigo-200 bg-white p-2 space-y-1"></div></details></div><div class="space-y-2"><div id="ab2-transfer-allocation-summary" class="rounded-lg border border-indigo-200 bg-white p-2"><div class="text-[10px] uppercase tracking-wide text-indigo-700">Live-Bilanz</div><div id="ab2-transfer-linking-remaining" class="text-base font-extrabold text-indigo-900">Noch zu verplanen: 0.00 €</div><div id="ab2-transfer-linking-balance-line" class="text-xs text-indigo-700 mt-1">Verplant 0.00 € von 0.00 €</div></div><div id="ab2-transfer-allocation-list" class="space-y-2"></div></div></div><div class="text-[11px] text-indigo-800">Wenn Sie Zahlungsgründe wählen: Jeder benötigt einen Betrag, und das Transfer-Budget darf nicht überschritten werden.</div>`;
    noteWrap.parentElement.insertBefore(block, noteWrap.nextSibling);
    const linkedTitleList = el('ab2-transfer-linked-titles-list');
    if (linkedTitleList && !linkedTitleList.dataset.listenerAttached) {
        linkedTitleList.addEventListener('change', () => {
            updateTransferLinkedTitlesSummary();
            updateTransferLinkedTitleAllocationsUI();
            updateTransferLinkingBudgetState();
            renderPreviews();
        });
        linkedTitleList.dataset.listenerAttached = 'true';
    }
    const allocationHost = el('ab2-transfer-allocation-list');
    if (allocationHost && !allocationHost.dataset.listenerAttached) {
        allocationHost.addEventListener('input', () => {
            updateTransferLinkingBudgetState();
            renderPreviews();
        });
        allocationHost.addEventListener('click', (e) => {
            const infoBtn = e.target.closest('[data-transfer-allocation-info]');
            if (infoBtn) {
                openTransferAllocationInfo(infoBtn.dataset.transferAllocationInfo || '', el('ab2-transfer-id')?.value || '');
                return;
            }
            const sollBtn = e.target.closest('[data-transfer-allocation-soll]');
            if (sollBtn) {
                const row = sollBtn.closest('[data-transfer-allocation-row]');
                const input = row?.querySelector('[data-transfer-allocation-amount]');
                const amount = roundMoney(toNum(sollBtn.dataset.sollAmount, NaN));
                const title = transferLinkedTitleLabel(sollBtn.dataset.transferAllocationSoll || '') || '-';
                if (!input || input.disabled || !Number.isFinite(amount)) return;
                if (!window.confirm(`SOLL-Wert für „${title}“ übernehmen (${formatCurrency(amount)})?`)) return;
                input.value = amount.toFixed(2);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            const btn = e.target.closest('[data-transfer-balance-title]');
            if (!btn) return;
            openTransferAllocationBalanceInsight(btn.dataset.transferBalanceTitle || '', el('ab2-transfer-id')?.value || '');
        });
        allocationHost.dataset.listenerAttached = 'true';
    }
    populateTransferLinkingOptions();
    updateTransferLinkedTitleAllocationsUI();
    updateTransferLinkingBudgetState();
}

function normalizeTransferLinkedTitleKey(value) {
    const key = String(value || '').trim();
    if (!key) return '';
    return key;
}

function transferLinkedTitleLabel(value) {
    const key = normalizeTransferLinkedTitleKey(value);
    if (!key) return '';
    if (key === UNASSIGNED_TITLE_KEY) return '[OHNE ZUORDNUNG]';
    return ITEMS[key]?.title || key;
}

function transferAllocationAmountForTitle(transfer, titleKey) {
    const normalized = normalizeTransferLinkedTitleKey(titleKey);
    if (!normalized) return 0;
    return roundMoney(getTransferLinkedAllocations(transfer)
        .filter((row) => String(row.titleKey || '').toLowerCase() === normalized.toLowerCase())
        .reduce((sum, row) => sum + toNum(row.amount, 0), 0));
}

function currentTransferFormEntity() {
    const validFrom = el('ab2-transfer-valid-from')?.value || isoDate(referenceDate());
    return {
        intervalType: el('ab2-transfer-interval')?.value || 'monthly',
        startMonth: parseInt(el('ab2-transfer-start-month')?.value, 10) || null,
        customMonths: parseMonths(el('ab2-transfer-custom-months')?.value || ''),
        dayOfMonth: parseInt(el('ab2-transfer-day')?.value, 10) || 1,
        validFrom,
        validTo: el('ab2-transfer-valid-to')?.value || ''
    };
}

function transferAllocationStats(titleKey, currentTransferId = '') {
    const normalized = normalizeTransferLinkedTitleKey(titleKey);
    const item = ITEMS[normalized] || null;
    const intervalText = item ? intervalLabel(item.intervalType, item.customMonths || []) : '-';
    const totalRaw = item ? roundMoney(toNum(item.amount, 0)) : 0;
    const others = Object.values(TRANSFERS)
        .filter((transfer) => !currentTransferId || transfer.id !== currentTransferId)
        .map((transfer) => {
            const amount = transferAllocationAmountForTitle(transfer, normalized);
            if (amount <= 0.009) return null;
            const hits = hitsInHorizon(transfer, forecastHorizonMonths);
            return {
                transferId: transfer.id,
                sourceName: ACCOUNTS[transfer.sourceAccountId]?.name || '-',
                targetName: ACCOUNTS[transfer.targetAccountId]?.name || '-',
                intervalText: intervalLabel(transfer.intervalType, transfer.customMonths || []),
                amount,
                hits,
                amountInHorizon: roundMoney(amount * hits),
                nextDate: nextExecutionDate(transfer, 24)
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.amount - a.amount);
    const plannedByOthersRaw = roundMoney(others.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
    const openRaw = item ? roundMoney(Math.max(0, totalRaw - plannedByOthersRaw)) : 0;

    const needInHorizon = item ? itemNeedInHorizon(item, forecastHorizonMonths) : 0;
    const plannedByOthersInHorizon = roundMoney(others.reduce((sum, row) => sum + toNum(row.amountInHorizon, 0), 0));
    const openInHorizon = item ? roundMoney(Math.max(0, needInHorizon - plannedByOthersInHorizon)) : 0;

    const currentTransfer = TRANSFERS[currentTransferId] || null;
    const currentEntity = currentTransfer || currentTransferFormEntity();
    const currentHits = hitsInHorizon(currentEntity, forecastHorizonMonths);
    const suggestedPerExecution = item
        ? roundMoney(currentHits > 0 ? (openInHorizon / currentHits) : openRaw)
        : NaN;

    return {
        normalized,
        item,
        intervalText,
        totalRaw,
        plannedByOthersRaw,
        openRaw,
        needInHorizon,
        plannedByOthersInHorizon,
        openInHorizon,
        currentHits,
        suggestedPerExecution,
        others
    };
}

function openTransferAllocationInfo(titleKey, currentTransferId = '') {
    const normalized = normalizeTransferLinkedTitleKey(titleKey);
    if (!normalized) return;
    const stats = transferAllocationStats(normalized, currentTransferId);
    const item = stats.item;
    const directRows = (Array.isArray(item?.contributions) ? item.contributions : [])
        .filter((contrib) => contrib?.sourceAccountId && toNum(contrib.amount, 0) > 0)
        .map((contrib) => {
            const entity = contributionEntity(item, contrib);
            const intervalText = contrib.intervalType === 'inherit'
                ? `${intervalLabel(item.intervalType, item.customMonths || [])} (wie Zahlung)`
                : intervalLabel(contrib.intervalType || item.intervalType, contrib.customMonths || []);
            return {
                sourceName: ACCOUNTS[contrib.sourceAccountId]?.name || '-',
                amount: roundMoney(toNum(contrib.amount, 0)),
                intervalText,
                nextDate: nextExecutionDate(entity, 24)
            };
        });

    const directHtml = directRows.length
        ? directRows.map((row) => `<div class="rounded-lg border border-slate-200 bg-white p-2"><div class="text-sm font-bold text-slate-800">Direktbeitrag: ${escapeHtml(row.sourceName)}</div><div class="text-xs text-slate-600 mt-1">${formatCurrency(row.amount)} · ${escapeHtml(row.intervalText)}${row.nextDate ? ` · nächste Ausführung ${formatDate(row.nextDate)}` : ''}</div></div>`).join('')
        : '<p class="text-sm text-slate-500">Keine direkten Beiträge hinterlegt.</p>';

    const othersHtml = stats.others.length
        ? stats.others.map((row) => `<div class="rounded-lg border border-indigo-200 bg-indigo-50 p-2"><div class="text-sm font-bold text-indigo-900">${escapeHtml(row.sourceName)} → ${escapeHtml(row.targetName)}</div><div class="text-xs text-indigo-800 mt-1">${formatCurrency(row.amount)} je Ausführung · ${escapeHtml(row.intervalText)}${row.nextDate ? ` · nächste Ausführung ${formatDate(row.nextDate)}` : ''} · ${row.hits}x im ${forecastHorizonMonths}M-Horizont = ${formatCurrency(row.amountInHorizon)}</div></div>`).join('')
        : '<p class="text-sm text-slate-500">Noch keine Zuordnungen durch andere Transfers gefunden.</p>';

    const summaryHtml = item
        ? `<div class="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div class="text-xs uppercase tracking-wide text-emerald-700">Gesamtsicht</div><div class="text-sm text-emerald-900 mt-1">Zahlung: <strong>${escapeHtml(item.title || '-')}</strong> · ${formatCurrency(stats.totalRaw)} · ${escapeHtml(stats.intervalText)}</div><div class="text-sm text-emerald-900 mt-1">Durch andere verplant: <strong>${formatCurrency(stats.plannedByOthersRaw)}</strong>${stats.openRaw > 0.009 ? ` · offen: <strong>${formatCurrency(stats.openRaw)}</strong>` : ' · offen: 0.00 €'}</div><div class="text-xs text-emerald-800 mt-1">${forecastHorizonMonths}M-Horizont: Bedarf ${formatCurrency(stats.needInHorizon)} · durch andere verplant ${formatCurrency(stats.plannedByOthersInHorizon)} · offen ${formatCurrency(stats.openInHorizon)}</div>${Number.isFinite(stats.suggestedPerExecution) ? `<div class="text-xs text-emerald-800 mt-1">Empfohlener SOLL-Wert für den aktuellen Transfer: ${formatCurrency(stats.suggestedPerExecution)} je Ausführung</div>` : ''}</div>`
        : `<div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Kein passender Dashboard-Eintrag (Titel) gefunden. Nur Transfer-Zuordnungen sind vorhanden.</div>`;

    openDetail(
        `Zuordnungsdetails · ${transferLinkedTitleLabel(normalized)}`,
        `<div class="space-y-3">${summaryHtml}<div><div class="text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Direkte Beteiligte</div>${directHtml}</div><div><div class="text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Durch andere Transfers verplant</div>${othersHtml}</div></div>`
    );
}

function normalizeTransferLinkedAllocations(raw) {
    const map = new Map();
    (Array.isArray(raw) ? raw : []).forEach((row) => {
        const titleKey = normalizeTransferLinkedTitleKey(row?.titleKey || row?.value || row?.title || row?.linkedTitle);
        const amount = roundMoney(toNum(row?.amount, 0));
        if (!titleKey || amount <= 0) return;
        map.set(titleKey, roundMoney((map.get(titleKey) || 0) + amount));
    });
    return Array.from(map.entries()).map(([titleKey, amount]) => ({ titleKey, amount }));
}

function getTransferLinkedAllocations(transfer) {
    const explicit = normalizeTransferLinkedAllocations(transfer?.linkedTitleAllocations);
    if (explicit.length) return explicit;
    const linkedTitles = (Array.isArray(transfer?.linkedTitles) ? transfer.linkedTitles : [])
        .map((value) => normalizeTransferLinkedTitleKey(value))
        .filter(Boolean)
        .filter((value, index, all) => all.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index);
    if (!linkedTitles.length) return [];
    const total = roundMoney(toNum(transfer?.amount, 0));
    if (total <= 0) return [];
    const base = roundMoney(total / linkedTitles.length);
    let remaining = total;
    return linkedTitles.map((titleKey, index) => {
        const amount = index === linkedTitles.length - 1 ? roundMoney(remaining) : base;
        remaining = roundMoney(remaining - amount);
        return { titleKey, amount };
    }).filter((row) => row.amount > 0);
}

function transferPlannedAmount(transfer) {
    return roundMoney(getTransferLinkedAllocations(transfer).reduce((sum, row) => sum + toNum(row.amount, 0), 0));
}

function transferBudgetDiff(transfer) {
    return roundMoney(toNum(transfer?.amount, 0) - transferPlannedAmount(transfer));
}

function transferAmountForItem(transfer, item) {
    if (!item) return 0;
    const allocations = getTransferLinkedAllocations(transfer);
    if (!allocations.length) return 0;
    const itemId = normalizeTransferLinkedTitleKey(item.id);
    if (itemId) {
        const direct = roundMoney(allocations
            .filter((row) => String(row.titleKey || '').toLowerCase() === itemId.toLowerCase())
            .reduce((sum, row) => sum + toNum(row.amount, 0), 0));
        if (direct > 0.009) return direct;
    }
    const normalizedItemTitle = normalizeSearchText(item.title || '');
    if (!normalizedItemTitle) return 0;
    return roundMoney(allocations
        .filter((row) => {
            const normalizedTitle = normalizeSearchText(transferLinkedTitleLabel(row.titleKey));
            return normalizedTitle && (normalizedTitle.includes(normalizedItemTitle) || normalizedItemTitle.includes(normalizedTitle));
        })
        .reduce((sum, row) => sum + toNum(row.amount, 0), 0));
}

function getTransferLinkedTitleValues() {
    const host = el('ab2-transfer-linked-titles-list');
    if (!host) return [];
    return Array.from(host.querySelectorAll('input[type="checkbox"][data-transfer-linked-title]:checked'))
        .map((node) => String(node.value || '').trim())
        .filter(Boolean)
        .filter((value, index, all) => all.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index);
}

function updateTransferLinkedTitlesSummary() {
    const summary = el('ab2-transfer-linked-titles-summary');
    if (!summary) return;
    const selected = getTransferLinkedTitleValues().map((value) => transferLinkedTitleLabel(value));
    summary.textContent = selected.length ? selected.join(', ') : 'Keine Titel ausgewählt';
}

function collectTransferLinkedAllocationsFromForm() {
    const host = el('ab2-transfer-allocation-list');
    if (!host) return [];
    return normalizeTransferLinkedAllocations(Array.from(host.querySelectorAll('[data-transfer-allocation-row]')).map((row) => ({
        titleKey: row.dataset.transferAllocationRow || '',
        amount: toNum(row.querySelector('[data-transfer-allocation-amount]')?.value, 0)
    })));
}

function transferLinkingFormState() {
    const budget = roundMoney(toNum(el('ab2-transfer-amount')?.value, 0));
    const allocations = collectTransferLinkedAllocationsFromForm();
    const amountMap = new Map(allocations.map((row) => [String(row.titleKey || '').toLowerCase(), roundMoney(toNum(row.amount, 0))]));
    const planned = roundMoney(allocations.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
    const diff = roundMoney(budget - planned);
    const selected = getTransferLinkedTitleValues();
    const hasSelection = selected.length > 0;
    const hasPositive = allocations.some((row) => toNum(row.amount, 0) > 0);
    const allSelectedPlanned = selected.every((titleKey) => toNum(amountMap.get(String(titleKey || '').toLowerCase()), 0) > 0);
    return { budget, planned, diff, selected, allocations, hasSelection, hasPositive, allSelectedPlanned, overplanned: diff < -0.009 };
}

function updateTransferLinkingBudgetState() {
    const state = transferLinkingFormState();
    const remaining = el('ab2-transfer-linking-remaining');
    const balanceLine = el('ab2-transfer-linking-balance-line');
    const saveBtn = el('ab2-save-transfer-btn');
    if (remaining) {
        const text = state.diff > 0.009
            ? `Noch zu verplanen: ${formatCurrency(state.diff)}`
            : state.diff < -0.009
                ? `Überplant um: ${formatCurrency(Math.abs(state.diff))}`
                : 'Noch zu verplanen: 0.00 €';
        remaining.textContent = text;
        remaining.className = `text-base font-extrabold ${state.diff > 0.009 ? 'text-amber-700' : state.diff < -0.009 ? 'text-red-700' : 'text-emerald-700'}`;
    }
    if (balanceLine) {
        balanceLine.textContent = `Verplant ${formatCurrency(state.planned)} von ${formatCurrency(state.budget)} · Differenz ${formatSignedCurrency(state.diff)}`;
    }
    if (saveBtn) {
        const valid = (!state.hasSelection || (state.hasPositive && state.allSelectedPlanned)) && !state.overplanned;
        saveBtn.disabled = !valid;
        saveBtn.classList.toggle('opacity-50', !valid);
        saveBtn.classList.toggle('cursor-not-allowed', !valid);
    }
    return state;
}

function updateTransferLinkedTitleAllocationsUI(seedAllocations = null) {
    const host = el('ab2-transfer-allocation-list');
    if (!host) return;
    const selected = getTransferLinkedTitleValues();
    const currentTransferId = el('ab2-transfer-id')?.value || '';
    const currentMap = new Map(normalizeTransferLinkedAllocations(seedAllocations || collectTransferLinkedAllocationsFromForm()).map((row) => [String(row.titleKey || '').toLowerCase(), row.amount]));
    host.innerHTML = selected.length
        ? selected.map((titleKey) => {
            const normalized = normalizeTransferLinkedTitleKey(titleKey);
            const value = currentMap.get(normalized.toLowerCase());
            const stats = transferAllocationStats(normalized, currentTransferId);
            const infoLine = stats.item
                ? `Summe total: ${formatCurrency(stats.totalRaw)} (${escapeHtml(stats.intervalText)}) / Durch andere verplant: ${formatCurrency(stats.plannedByOthersRaw)}${stats.openRaw > 0.009 ? ` / offen: ${formatCurrency(stats.openRaw)}` : ''}`
                : 'Kein passender Dashboard-Eintrag gefunden.';
            const sollAmount = roundMoney(toNum(stats.suggestedPerExecution, NaN));
            const showSoll = Number.isFinite(sollAmount) && sollAmount > 0.009;
            const sollButton = showSoll
                ? `<button type="button" class="ab2-soll-chip w-full justify-center px-2 py-1 rounded-md border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-[11px] font-extrabold" data-transfer-allocation-soll="${escapeHtml(normalized)}" data-soll-amount="${escapeHtml(sollAmount.toFixed(2))}">SOLL: ${formatCurrency(sollAmount)}</button>`
                : '';
            return `<div class="rounded-lg border border-indigo-200 bg-white p-2" data-transfer-allocation-row="${escapeHtml(normalized)}"><div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,170px)_40px] gap-2 items-start"><div><div class="text-xs font-bold text-indigo-900">${escapeHtml(transferLinkedTitleLabel(normalized) || '-')}</div><div class="mt-1 text-[11px] text-indigo-700">${infoLine} / <button type="button" class="text-indigo-800 underline font-bold" data-transfer-allocation-info="${escapeHtml(normalized)}">[i]</button></div></div><div class="space-y-1"><input data-transfer-allocation-amount type="text" class="w-full p-2 border rounded-lg text-sm" placeholder="Betrag" value="${Number.isFinite(toNum(value, NaN)) ? toNum(value, 0).toFixed(2) : ''}">${sollButton}</div><button type="button" class="h-9 w-full sm:w-10 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold" title="Bilanz anzeigen" data-transfer-balance-title="${escapeHtml(normalized)}">⚖</button></div></div>`;
        }).join('')
        : '<div class="text-xs text-indigo-700">Bitte mindestens einen Zahlungsgrund auswählen.</div>';
    updateSollHintButtons();
}

function openTransferAllocationBalanceInsight(titleKey, currentTransferId = '') {
    const normalized = normalizeTransferLinkedTitleKey(titleKey);
    if (!normalized) return;
    const rows = Object.values(TRANSFERS)
        .map((transfer) => {
            if (currentTransferId && transfer.id === currentTransferId) return null;
            const amount = roundMoney(getTransferLinkedAllocations(transfer)
                .filter((row) => String(row.titleKey || '').toLowerCase() === normalized.toLowerCase())
                .reduce((sum, row) => sum + toNum(row.amount, 0), 0));
            if (amount <= 0) return null;
            return {
                transferId: transfer.id,
                sourceName: ACCOUNTS[transfer.sourceAccountId]?.name || '-',
                targetName: ACCOUNTS[transfer.targetAccountId]?.name || '-',
                amount,
                interval: intervalLabel(transfer.intervalType, transfer.customMonths || [])
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.amount - a.amount);
    const total = roundMoney(rows.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
    const list = rows.map((row) => `<div class="rounded-lg border border-gray-200 bg-gray-50 p-2"><div class="text-sm font-bold text-gray-800">${escapeHtml(row.sourceName)} → ${escapeHtml(row.targetName)}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(row.interval)} · ${formatCurrency(row.amount)}</div></div>`).join('') || '<p class="text-sm text-gray-500">Noch keine weiteren Zuordnungen gefunden.</p>';
    openDetail(`Bilanz · ${transferLinkedTitleLabel(normalized)}`, `<div class="space-y-2"><div class="rounded-lg border border-indigo-200 bg-indigo-50 p-2"><div class="text-xs uppercase tracking-wide text-indigo-700">Gesamtzuordnung anderer Transfers</div><div class="text-lg font-extrabold text-indigo-900">${formatCurrency(total)}</div></div>${list}</div>`);
}

function getListFieldValues(fieldId) {
    if (fieldId === 'ab2-transfer-linked-titles') {
        return getTransferLinkedTitleValues();
    }
    const node = el(fieldId);
    if (!node) return [];
    if (node.tagName === 'SELECT' && node.multiple) {
        return Array.from(node.selectedOptions)
            .map((option) => String(option.value || '').trim())
            .filter(Boolean)
            .filter((value, index, all) => all.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index);
    }
    return parseCsvList(node.value || '');
}

function setTransferLinkedTitleDropdownOptions(options, selectedValues = []) {
    const host = el('ab2-transfer-linked-titles-list');
    if (!host) return;
    const selected = (Array.isArray(selectedValues) ? selectedValues : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .filter((value, index, all) => all.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index);
    const selectedSet = new Set(selected.map((value) => value.toLowerCase()));
    const merged = [...options];
    selected.forEach((value) => {
        if (!merged.some((opt) => String(opt.value || '').trim().toLowerCase() === value.toLowerCase())) {
            merged.push({ value, label: value });
        }
    });
    host.innerHTML = merged.length
        ? merged.map((opt) => {
            const value = String(opt.value || '').trim();
            const checked = selectedSet.has(value.toLowerCase()) ? 'checked' : '';
            return `<label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-indigo-50 cursor-pointer"><input type="checkbox" data-transfer-linked-title="1" value="${escapeHtml(value)}" ${checked} class="h-4 w-4"><span class="text-xs text-gray-700">${escapeHtml(opt.label || '-')}</span></label>`;
        }).join('')
        : '<div class="text-xs text-gray-500 px-1 py-1">Keine Einträge verfügbar.</div>';
    updateTransferLinkedTitlesSummary();
}

function populateTransferLinkingOptions(preselectedTitles = null) {
    const selectedTitles = Array.isArray(preselectedTitles) ? preselectedTitles : getTransferLinkedTitleValues();
    const titleOptions = Object.values(ITEMS)
        .filter((item) => item?.id && String(item.title || '').trim())
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
        .map((item) => ({ value: item.id, label: item.title || '-' }));
    const fullOptions = [...titleOptions, { value: UNASSIGNED_TITLE_KEY, label: '[OHNE ZUORDNUNG]' }];
    setTransferLinkedTitleDropdownOptions(fullOptions, selectedTitles);
}

function ensureContributionInfoHint() {
    const contribList = el('ab2-contrib-list');
    if (!contribList) return;
    const addBtn = el('ab2-add-contrib-btn');
    if (addBtn) addBtn.style.display = 'none';
    const panel = contribList.closest('.bg-gray-50.p-3.rounded-lg.border') || contribList.parentElement;
    if (!panel || el('ab2-help-contrib-usage')) return;
    const headerLabel = panel.querySelector('label');
    if (headerLabel && !headerLabel.querySelector('.ab2-help-btn')) {
        headerLabel.insertAdjacentHTML('beforeend', ` ${helpButton('ab2-help-contrib-usage')}`);
    }
    const hintNode = document.createElement('div');
    hintNode.innerHTML = helpContent('ab2-help-contrib-usage', 'Beiträge/Gegenkonten werden hier als kompakte Tabelle gezeigt: Direktbeiträge plus passende Transfer-Zuordnungen. Transfer-Zeilen sind klickbar und führen direkt zum Transferplan.');
    panel.insertBefore(hintNode.firstChild, contribList);
}

function enhanceStaticHelpTexts() {
    const bufferHelp = el('ab2-help-account-buffer');
    if (bufferHelp) {
        bufferHelp.textContent = 'Mindestbetrag, der auf Bankkonten verbleiben soll. Unter diesem Wert entstehen Warnung oder Alarm. Für Person-Konten ist dieses Feld nicht verfügbar.';
    }
    const startBalanceHelp = el('ab2-help-account-start-balance');
    if (startBalanceHelp) startBalanceHelp.remove();
}

function updateAccountCurrentBalanceText(accountId = '') {
    const valueNode = el('ab2-account-current-balance-value');
    if (!valueNode) return;
    const id = accountId || el('ab2-account-id')?.value || '';
    if (!id) {
        valueNode.textContent = '--';
        return;
    }
    const latest = latestSnapshots()[id] || null;
    valueNode.textContent = latest ? formatCurrency(latest.value) : 'kein Snapshot';
}

function ensureAccountCurrentBalanceField() {
    const startBalanceInput = el('ab2-account-start-balance');
    const minBufferInput = el('ab2-account-min-buffer');
    const startWrap = startBalanceInput?.closest('div');
    if (startWrap && !el('ab2-account-current-balance-value')) {
        const label = startWrap.querySelector('label');
        if (label) label.textContent = 'Aktueller Kontostand:';
        startWrap.querySelectorAll('.ab2-help-btn, .ab2-help-content').forEach((node) => node.remove());
        if (startBalanceInput) startBalanceInput.remove();
        const valueNode = document.createElement('div');
        valueNode.id = 'ab2-account-current-balance-value';
        valueNode.className = 'mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-base font-extrabold text-slate-800 tabular-nums';
        valueNode.textContent = '--';
        startWrap.appendChild(valueNode);
    }
    const startDateWrap = el('ab2-account-start-date')?.closest('div');
    if (startDateWrap) startDateWrap.classList.add('hidden');
    const lockBtn = el('ab2-account-unlock-amount-btn');
    if (lockBtn && minBufferInput?.parentElement && lockBtn.parentElement !== minBufferInput.parentElement) {
        minBufferInput.parentElement.appendChild(lockBtn.parentElement);
    }
    updateAccountCurrentBalanceText();
}

function restoreClassicTopActionRow() {
    const anchor = el('ab2-open-settings-menu-modal') || el('ab2-btn-create');
    const topBar = anchor?.closest('.flex.justify-between.items-center');
    const actionWrap = anchor?.parentElement;
    const back = topBar?.querySelector('.back-link');
    if (!topBar || !actionWrap) return;
    if (back && !topBar.contains(back)) {
        topBar.insertBefore(back, topBar.firstChild);
    }
    if (back) {
        back.classList.remove('ab2-compact-btn', 'px-3', 'py-2', 'bg-gray-100', 'text-gray-700', 'rounded-lg', 'hover:bg-gray-200', 'font-bold', 'text-xs', 'sm:text-sm');
        const label = back.querySelector('span');
        if (label) label.textContent = 'zurück';
    }
    topBar.classList.add('justify-between', 'flex-wrap');
    topBar.classList.remove('justify-start');
    actionWrap.classList.add('flex-wrap');
    actionWrap.classList.remove('flex-nowrap', 'overflow-x-auto', 'w-full', 'pb-1');
}

function ensureSettingsMenuButton() {
    const createBtn = el('ab2-btn-create');
    const actionWrap = createBtn?.parentElement;
    if (!actionWrap || !createBtn) return;
    const suggestionsBtn = el('ab2-open-suggestions-modal');
    if (suggestionsBtn) suggestionsBtn.remove();
    el('ab2-open-accounts-modal')?.remove();
    el('ab2-open-transfers-modal')?.remove();
    el('ab2-open-recon-modal')?.remove();
    if (!el('ab2-open-settings-menu-modal')) {
        const btn = document.createElement('button');
        btn.id = 'ab2-open-settings-menu-modal';
        btn.type = 'button';
        btn.className = 'ab2-compact-btn px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-xs sm:text-sm';
        btn.setAttribute('aria-label', 'Einstellungen');
        btn.textContent = '⚙';
        actionWrap.insertBefore(btn, createBtn);
    }
}

function ensureSettingsMenuModal() {
    if (el('ab2-settings-menu-modal')) return;
    const root = el('abbuchungsberechner-root');
    if (!root) return;
    const modal = document.createElement('div');
    modal.id = 'ab2-settings-menu-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.style.display = 'none';
    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md"><div class="bg-gradient-to-r from-slate-700 to-slate-600 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Einstellungen</h3><button id="ab2-close-settings-menu-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-2"><button type="button" id="ab2-settings-open-accounts" class="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700">Konten / Quellen</button><button type="button" id="ab2-settings-open-transfers" class="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700">Daueraufträge</button><button type="button" id="ab2-settings-open-recon" class="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700">Abgleich</button><button type="button" id="ab2-settings-open-payments" class="w-full text-left px-4 py-3 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700">Zahlungen</button></div><div class="bg-gray-100 p-4 rounded-b-2xl flex justify-end"><button id="ab2-cancel-settings-menu-btn" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg">Schließen</button></div></div>`;
    root.appendChild(modal);
}

function ensurePaymentsOverviewModal() {
    if (el('ab2-payments-modal')) return;
    const root = el('abbuchungsberechner-root');
    if (!root) return;
    const modal = document.createElement('div');
    modal.id = 'ab2-payments-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.style.display = 'none';
    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-indigo-700 to-blue-700 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Zahlungen · Beteiligungsübersicht</h3><button id="ab2-close-payments-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-3"><div id="ab2-payments-summary" class="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">Lade Daten...</div><div class="rounded-xl border border-slate-200 bg-white overflow-hidden"><div class="overflow-x-auto"><table class="ab2-simple-table min-w-[1440px]"><thead class="bg-slate-100 text-slate-700"><tr><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Status</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Titel</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Konto</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Intervall</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Betrag</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Beteiligte</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Bedarf/Gedeckt (Horizont)</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Offen / Überdeckt</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Deckung</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Horizont</th><th class="px-3 py-2 text-left text-[11px] uppercase tracking-wide">Quellen (Person/Bank)</th><th class="px-3 py-2 text-right text-[11px] uppercase tracking-wide">Lesen</th></tr></thead><tbody id="ab2-payments-table-body"><tr><td colspan="12" class="px-3 py-8 text-center text-gray-400 italic">Keine Zahlungen vorhanden.</td></tr></tbody></table></div></div></div></div><div class="bg-gray-100 p-4 rounded-b-2xl flex justify-end"><button id="ab2-cancel-payments-btn" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg">Schließen</button></div></div>`;
    root.appendChild(modal);
}

function setAccountModalView(mode) { accountModalViewMode = mode === 'create' || mode === 'edit' ? mode : 'list'; }
function setTransferModalView(mode) { transferModalViewMode = mode === 'create' || mode === 'edit' ? mode : 'list'; }
function setReconModalView(mode) { reconModalViewMode = mode === 'create' || mode === 'edit' ? mode : 'list'; }

function modalPanels(formAnchorId, listHostId) {
    const formPane = el(formAnchorId)?.closest('.space-y-3');
    const listPane = el(listHostId)?.parentElement;
    if (!formPane || !listPane) return null;
    return { formPane, listPane };
}

function applyModalViewState() {
    const accountPanels = modalPanels('ab2-account-name', 'ab2-accounts-list');
    if (accountPanels) {
        const showForm = accountModalViewMode !== 'list';
        const showList = accountModalViewMode === 'list';
        accountPanels.formPane.classList.toggle('hidden', !showForm);
        accountPanels.listPane.classList.toggle('hidden', !showList);
    }
    const transferPanels = modalPanels('ab2-transfer-source', 'ab2-transfers-list');
    if (transferPanels) {
        const showForm = transferModalViewMode !== 'list';
        const showList = transferModalViewMode === 'list';
        transferPanels.formPane.classList.toggle('hidden', !showForm);
        transferPanels.listPane.classList.toggle('hidden', !showList);
    }
    const reconPanels = modalPanels('ab2-recon-account', 'ab2-recon-list');
    if (reconPanels) {
        const showForm = reconModalViewMode !== 'list';
        const showList = reconModalViewMode !== 'create';
        reconPanels.formPane.classList.toggle('hidden', !showForm);
        reconPanels.listPane.classList.toggle('hidden', !showList);
    }
}

function stackModalIntoSingleWindow(formAnchorId, listHostId, stackMarker) {
    const formPane = el(formAnchorId)?.closest('.space-y-3');
    const listHost = el(listHostId);
    const listPane = listHost?.parentElement;
    const container = formPane?.parentElement;
    if (!formPane || !listPane || !container) return;
    if (container.dataset[stackMarker] === '1') return;
    container.classList.remove('grid', 'grid-cols-1', 'lg:grid-cols-2', 'gap-4', 'ab2-transfer-split-layout');
    container.classList.add('space-y-4');
    const splitter = container.querySelector('.ab2-transfer-splitter');
    if (splitter) splitter.remove();
    container.insertBefore(listPane, formPane);
    container.dataset[stackMarker] = '1';
}

function ensureUnifiedModalLayouts() {
    stackModalIntoSingleWindow('ab2-account-name', 'ab2-accounts-list', 'ab2StackedAccounts');
    stackModalIntoSingleWindow('ab2-transfer-source', 'ab2-transfers-list', 'ab2StackedTransfers');
    stackModalIntoSingleWindow('ab2-recon-account', 'ab2-recon-list', 'ab2StackedRecon');
}

function clearAmountUnlockTimer() {
    if (amountUnlockTimer) {
        window.clearInterval(amountUnlockTimer);
        amountUnlockTimer = null;
    }
}

function closeAmountUnlockModal() {
    clearAmountUnlockTimer();
    amountUnlockMode = '';
    amountUnlockEntityId = '';
    amountUnlockSecondsLeft = 0;
    closeModal('ab2-amount-unlock-modal');
}

function updateAmountUnlockCountdownUi() {
    const okBtn = el('ab2-confirm-amount-unlock-btn');
    const hint = el('ab2-amount-unlock-countdown');
    if (!okBtn || !hint) return;
    if (amountUnlockSecondsLeft > 0) {
        okBtn.disabled = true;
        okBtn.classList.add('opacity-60', 'cursor-not-allowed');
        okBtn.textContent = `OK (${String(amountUnlockSecondsLeft).padStart(2, '0')}s)`;
        hint.textContent = `Freigabe in ${amountUnlockSecondsLeft}s verfügbar.`;
    } else {
        okBtn.disabled = false;
        okBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        okBtn.textContent = 'OK';
        hint.textContent = 'Freigabe aktiv. Nur für echte Korrektur verwenden.';
    }
}

function openAmountUnlockModal(mode, entityId) {
    amountUnlockMode = mode;
    amountUnlockEntityId = entityId;
    amountUnlockSecondsLeft = AMOUNT_UNLOCK_COUNTDOWN_SECONDS;
    const title = el('ab2-amount-unlock-title');
    const text = el('ab2-amount-unlock-text');
    if (title) title.textContent = mode === 'account' ? 'Konto-Betrag korrigieren' : 'Transfer-Betrag korrigieren';
    if (text) {
        text.textContent = 'Der Betrag darf nur bei außerordentlichen Gründen korrigiert werden (z. B. Eingabefehler). Bei planmäßiger Änderung bitte Abtausch verwenden.';
    }
    updateAmountUnlockCountdownUi();
    clearAmountUnlockTimer();
    if (amountUnlockSecondsLeft > 0) {
        amountUnlockTimer = window.setInterval(() => {
            amountUnlockSecondsLeft = Math.max(0, amountUnlockSecondsLeft - 1);
            updateAmountUnlockCountdownUi();
            if (amountUnlockSecondsLeft <= 0) clearAmountUnlockTimer();
        }, 1000);
    }
    openModal('ab2-amount-unlock-modal');
}

function transferSuggestedAmountFromSelections() {
    const selected = getTransferLinkedTitleValues();
    if (!selected.length) return NaN;
    const currentTransferId = el('ab2-transfer-id')?.value || '';
    const total = roundMoney(selected.reduce((sum, titleKey) => {
        const stats = transferAllocationStats(titleKey, currentTransferId);
        if (!Number.isFinite(toNum(stats.suggestedPerExecution, NaN))) return sum;
        return sum + Math.max(0, toNum(stats.suggestedPerExecution, 0));
    }, 0));
    return total > 0.009 ? total : NaN;
}

function resolveSollAmountForInput(inputId) {
    if (inputId === 'ab2-item-amount') {
        const id = el('ab2-item-id')?.value || '';
        return id && ITEMS[id] ? roundMoney(toNum(ITEMS[id].amount, 0)) : toNum(el(inputId)?.value, NaN);
    }
    if (inputId === 'ab2-account-min-buffer') {
        const usesBuffer = accountUsesBuffer(el('ab2-account-type')?.value || 'bank', el('ab2-account-role')?.value || 'both');
        if (!usesBuffer) return NaN;
        const id = el('ab2-account-id')?.value || '';
        if (id && ACCOUNTS[id]) return accountMinBuffer(ACCOUNTS[id]);
        return toNum(el(inputId)?.value, NaN);
    }
    if (inputId === 'ab2-transfer-amount') {
        const suggested = transferSuggestedAmountFromSelections();
        if (Number.isFinite(suggested)) return suggested;
        const id = el('ab2-transfer-id')?.value || '';
        if (id && TRANSFERS[id]) return roundMoney(toNum(TRANSFERS[id].amount, 0));
        return toNum(el(inputId)?.value, NaN);
    }
    if (inputId === 'ab2-recon-value') {
        const accountId = el('ab2-recon-account')?.value || '';
        const type = el('ab2-recon-type')?.value || 'snapshot';
        if (type === 'snapshot' && accountId) {
            const latest = latestSnapshots()[accountId] || null;
            if (latest) return roundMoney(toNum(latest.value, 0));
        }
        return toNum(el(inputId)?.value, NaN);
    }
    if (inputId === 'ab2-abtausch-new-amount') {
        const item = ITEMS[el('ab2-item-id')?.value || ''] || null;
        return item ? roundMoney(toNum(item.amount, 0)) : toNum(el(inputId)?.value, NaN);
    }
    if (inputId === 'ab2-transfer-abtausch-new-amount') {
        const sourceId = transferAbtauschSourceId || el('ab2-transfer-id')?.value || '';
        const transfer = TRANSFERS[sourceId] || null;
        return transfer ? roundMoney(toNum(transfer.amount, 0)) : toNum(el(inputId)?.value, NaN);
    }
    return NaN;
}

function ensureSollHintButtons() {
    SOLL_INPUT_IDS.forEach((inputId) => {
        const input = el(inputId);
        if (!input) return;
        let wrap = input.parentElement?.dataset.ab2SollWrap === inputId ? input.parentElement : null;
        if (!wrap) {
            const parent = input.parentElement;
            if (!parent) return;
            wrap = document.createElement('div');
            wrap.className = 'relative';
            wrap.dataset.ab2SollWrap = inputId;
            parent.insertBefore(wrap, input);
            wrap.appendChild(input);
        }
        input.classList.add('pr-32');
        let btn = wrap.querySelector(`[data-ab2-soll-target="${inputId}"]`);
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.ab2SollTarget = inputId;
            btn.className = 'ab2-soll-chip absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md border border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 text-[11px] font-extrabold';
            wrap.appendChild(btn);
        }
    });
    updateSollHintButtons();
}

function updateSollHintButtons() {
    SOLL_INPUT_IDS.forEach((inputId) => {
        const input = el(inputId);
        const btn = document.querySelector(`[data-ab2-soll-target="${inputId}"]`);
        if (!input || !btn) return;
        const value = roundMoney(toNum(resolveSollAmountForInput(inputId), NaN));
        const valid = Number.isFinite(value);
        btn.classList.toggle('hidden', !valid);
        if (!valid) {
            btn.dataset.sollValue = '';
            return;
        }
        btn.dataset.sollValue = value.toFixed(2);
        btn.textContent = `SOLL: ${formatCurrency(value)}`;
        const clickable = !input.disabled;
        btn.disabled = !clickable;
        btn.classList.toggle('opacity-50', !clickable);
        btn.classList.toggle('cursor-not-allowed', !clickable);
    });
}

function applySollAmountToInput(inputId, amount) {
    const input = el(inputId);
    const value = roundMoney(toNum(amount, NaN));
    if (!input || input.disabled || !Number.isFinite(value)) return;
    const label = input.closest('div')?.parentElement?.querySelector('label')?.textContent?.trim() || 'Betrag';
    if (!window.confirm(`SOLL-Wert übernehmen (${formatCurrency(value)}) für „${label}“?`)) return;
    input.value = value.toFixed(2);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function ensureAmountUnlockModal() {
    if (el('ab2-amount-unlock-modal')) return;
    const root = el('abbuchungsberechner-root');
    if (!root) return;
    const modal = document.createElement('div');
    modal.id = 'ab2-amount-unlock-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.style.display = 'none';
    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg"><div class="bg-gradient-to-r from-amber-600 to-orange-500 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 id="ab2-amount-unlock-title" class="text-xl font-bold">Betrag korrigieren</h3><button id="ab2-close-amount-unlock-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-3"><p id="ab2-amount-unlock-text" class="text-sm text-gray-700">Der Betrag darf nur bei außerordentlichen Gründen korrigiert werden.</p><div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div class="font-bold">Wichtiger Hinweis</div><div>Bei planmäßigen Änderungen bitte den Weg „Abtausch“ verwenden.</div></div><div id="ab2-amount-unlock-countdown" class="text-sm font-bold text-amber-800">Freigabe aktiv. Nur für echte Korrektur verwenden.</div></div><div class="bg-gray-100 p-4 rounded-b-2xl flex justify-end gap-2"><button id="ab2-cancel-amount-unlock-btn" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg">Schließen</button><button id="ab2-confirm-amount-unlock-btn" class="w-24 inline-flex justify-center px-4 py-2 bg-amber-600 text-white rounded-lg">OK</button></div></div>`;
    const okBtn = modal.querySelector('#ab2-confirm-amount-unlock-btn');
    if (okBtn) {
        okBtn.classList.remove('w-24');
        okBtn.classList.add('w-32', 'h-10', 'whitespace-nowrap', 'items-center', 'justify-center', 'leading-none', 'text-sm');
    }
    root.appendChild(modal);
}

function getEditableAccountAmountBase() {
    const id = el('ab2-account-id')?.value || '';
    if (!id) return NaN;
    const latest = latestSnapshots()[id];
    if (!latest) return NaN;
    return toNum(latest.value, NaN);
}

function syncAccountAmountLockState() {
    const minBufferInput = el('ab2-account-min-buffer');
    const id = el('ab2-account-id')?.value || '';
    const usesBuffer = accountUsesBuffer(el('ab2-account-type')?.value || 'bank', el('ab2-account-role')?.value || 'both');
    const lockBtn = el('ab2-account-unlock-amount-btn');
    if (!minBufferInput) {
        if (lockBtn) lockBtn.classList.add('hidden');
        return;
    }
    if (!usesBuffer) {
        minBufferInput.disabled = true;
        if (lockBtn) lockBtn.classList.add('hidden');
        return;
    }
    if (!id) {
        minBufferInput.disabled = false;
        if (lockBtn) lockBtn.classList.add('hidden');
        return;
    }
    const unlocked = accountAmountUnlockForId === id;
    minBufferInput.disabled = !unlocked;
    if (lockBtn) {
        lockBtn.classList.toggle('hidden', unlocked);
        lockBtn.textContent = 'Betrag bearbeiten';
    }
}

function prepareAccountAbtausch() {
    const id = el('ab2-account-id')?.value || '';
    if (!id) return;
    if (el('ab2-account-start-date')) el('ab2-account-start-date').value = isoDate(new Date());
    if (el('ab2-account-start-balance')) el('ab2-account-start-balance').value = '';
    accountAmountUnlockForId = id;
    syncAccountAmountLockState();
    renderPreviews();
    alertUser('Abtausch vorbereitet: Neues Startdatum gesetzt, Betrag bitte neu erfassen.', 'info');
}

function syncTransferAmountLockState() {
    const input = el('ab2-transfer-amount');
    const id = el('ab2-transfer-id')?.value || '';
    const lockBtn = el('ab2-transfer-unlock-amount-btn');
    if (!input) return;
    if (!id) {
        input.disabled = false;
        if (lockBtn) lockBtn.classList.add('hidden');
        return;
    }
    const unlocked = transferAmountUnlockForId === id;
    input.disabled = !unlocked;
    if (lockBtn) {
        lockBtn.classList.toggle('hidden', unlocked);
        lockBtn.textContent = 'Betrag bearbeiten';
    }
}

function ensureAmountEditButtons() {
    const accountInput = el('ab2-account-min-buffer');
    const transferInput = el('ab2-transfer-amount');
    if (accountInput && !el('ab2-account-unlock-amount-btn')) {
        const row = document.createElement('div');
        row.className = 'mt-2';
        row.innerHTML = '<button id="ab2-account-unlock-amount-btn" type="button" class="hidden px-3 py-2 text-xs font-bold rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200">Betrag bearbeiten</button>';
        accountInput.parentElement?.appendChild(row);
    }
    if (transferInput && !el('ab2-transfer-unlock-amount-btn')) {
        const row = document.createElement('div');
        row.className = 'mt-2';
        row.innerHTML = '<button id="ab2-transfer-unlock-amount-btn" type="button" class="hidden px-3 py-2 text-xs font-bold rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200">Betrag bearbeiten</button>';
        transferInput.parentElement?.appendChild(row);
    }
}

function ensureTransferAbtauschButton() {
    if (el('ab2-transfer-abtausch-btn')) return;
    const saveBtn = el('ab2-save-transfer-btn');
    const resetBtn = el('ab2-reset-transfer-btn');
    const footer = (saveBtn || resetBtn)?.parentElement;
    if (!footer) return;
    const btn = document.createElement('button');
    btn.id = 'ab2-transfer-abtausch-btn';
    btn.type = 'button';
    btn.className = 'px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hidden';
    btn.textContent = 'Abtausch';
    footer.insertBefore(btn, saveBtn || null);
}

function ensureTransferAbtauschModal() {
    if (el('ab2-transfer-abtausch-modal')) return;
    const root = el('abbuchungsberechner-root');
    if (!root) return;
    const modal = document.createElement('div');
    modal.id = 'ab2-transfer-abtausch-modal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    modal.style.display = 'none';
    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg"><div class="bg-gradient-to-r from-purple-600 to-indigo-500 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Transfer-Abtausch</h3><button id="ab2-close-transfer-abtausch-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-3"><p id="ab2-transfer-abtausch-old-info" class="text-sm text-gray-600 bg-gray-50 border rounded p-2">-</p><div><label class="block text-sm font-bold text-gray-700 mb-1">Neues Startdatum *</label><input id="ab2-transfer-abtausch-new-start" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Altes Enddatum</label><input id="ab2-transfer-abtausch-old-end" type="date" class="w-full p-2 border rounded-lg"><p class="mt-1 text-xs text-gray-500">Wird automatisch auf Startdatum - 1 Tag gesetzt, kann manuell korrigiert werden.</p></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Neuer Betrag *</label><input id="ab2-transfer-abtausch-new-amount" type="text" class="w-full p-2 border rounded-lg" placeholder="Betrag neu eingeben"></div></div><div class="bg-gray-100 p-4 rounded-b-2xl flex justify-end gap-2"><button id="ab2-cancel-transfer-abtausch-btn" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg">Abbrechen</button><button id="ab2-save-transfer-abtausch-btn" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-500 text-white rounded-lg">Übernehmen</button></div></div>`;
    root.appendChild(modal);
}

function updateTransferAbtauschOldEndFromStart(force = false) {
    const start = el('ab2-transfer-abtausch-new-start')?.value || '';
    const oldEnd = el('ab2-transfer-abtausch-old-end');
    if (!oldEnd) return;
    if (!force && transferAbtauschOldEndManual) return;
    oldEnd.value = previousDateIso(start || '') || '';
}

function openTransferAbtauschModal(transferId) {
    const transfer = TRANSFERS[transferId];
    if (!transfer) return;
    transferAbtauschSourceId = transferId;
    transferAbtauschOldEndManual = false;
    if (el('ab2-transfer-abtausch-old-info')) {
        el('ab2-transfer-abtausch-old-info').textContent = `${ACCOUNTS[transfer.sourceAccountId]?.name || '-'} → ${ACCOUNTS[transfer.targetAccountId]?.name || '-'} · ${formatCurrency(transfer.amount)} · ${formatDate(transfer.validFrom)}${transfer.validTo ? ` bis ${formatDate(transfer.validTo)}` : ' fortlaufend'}`;
    }
    if (el('ab2-transfer-abtausch-new-start')) el('ab2-transfer-abtausch-new-start').value = isoDate(new Date());
    if (el('ab2-transfer-abtausch-new-amount')) el('ab2-transfer-abtausch-new-amount').value = '';
    updateTransferAbtauschOldEndFromStart(true);
    openModal('ab2-transfer-abtausch-modal');
}

async function saveTransferAbtausch() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const before = TRANSFERS[transferAbtauschSourceId];
    const newStart = el('ab2-transfer-abtausch-new-start')?.value || '';
    const oldEndIso = el('ab2-transfer-abtausch-old-end')?.value || '';
    const newAmount = roundMoney(toNum(el('ab2-transfer-abtausch-new-amount')?.value, 0));
    if (!before) return alertUser('Transfer nicht gefunden.', 'error');
    if (!newStart || newAmount <= 0) return alertUser('Bitte Startdatum und neuen Betrag ausfüllen.', 'error');
    if (!oldEndIso) return alertUser('Bitte altes Enddatum angeben.', 'error');
    if (parseDate(oldEndIso) < parseDate(before.validFrom || '')) return alertUser('Altes Enddatum liegt vor dem bisherigen Start.', 'error');
    if (parseDate(newStart) <= parseDate(oldEndIso)) return alertUser('Neues Startdatum muss nach altem Enddatum liegen.', 'error');
    const nextPayload = {
        ...cloneClean(before),
        amount: newAmount,
        validFrom: newStart,
        validTo: before.validTo || '',
        sourceTransferId: before.sourceTransferId || before.id || '',
        createdBy: before.createdBy || uid(),
        createdByName: before.createdByName || currentUser?.displayName || 'Unbekannt',
        updatedBy: currentUser?.displayName || 'Unbekannt',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    try {
        await updateDoc(doc(transfersRef, before.id), { validTo: oldEndIso, updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() });
        const ref = await addDoc(transfersRef, nextPayload);
        await writeAudit('abtausch', 'transfer_plan', before.id, cloneClean(before), { newTransferId: ref.id, oldEndIso, validFrom: newStart, amount: newAmount }, { action: 'transfer_abtausch_manual' });
        closeModal('ab2-transfer-abtausch-modal');
        transferAbtauschSourceId = '';
        alertUser('Transfer-Abtausch gespeichert.', 'success');
    } catch (error) {
        console.error(error);
        alertUser(`Fehler beim Transfer-Abtausch: ${error.message || error}`, 'error');
    }
}

function ensureShell() {
    const root = el('abbuchungsberechner-root');
    if (!root) return;
    ensureInlineStyles();
    if (!shellMounted) {
        root.innerHTML = buildShell();
        shellMounted = true;
    }
    ensurePersonControlModal();
    ensureAmountUnlockModal();
    ensureTransferAbtauschModal();
    ensureTransferLinkingFields();
    ensureContributionInfoHint();
    ensureAmountEditButtons();
    ensureSollHintButtons();
    ensureAccountCurrentBalanceField();
    ensureAccountAbtauschButton();
    ensureTransferAbtauschButton();
    ensureSettingsMenuModal();
    ensurePaymentsOverviewModal();
    ensureSettingsMenuButton();
    ensureUnifiedModalLayouts();
    ensureModalStatusVisibilityControls();
    ensureReconActionButtons();
    ensureFormActionLabels();
    restoreClassicTopActionRow();
    applyModalViewState();
    enhanceStaticHelpTexts();
}

function ensureRefs() {
    if (refsReady || !db) return;
    accountsRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_accounts');
    itemsRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_cost_items');
    transfersRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_transfer_plans');
    reconRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_reconciliation');
    auditRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_audit');
    actionsRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_actions');
    refsReady = true;
}

function setInputEnabled(n, enabled, clearWhenDisabled = false) { if (!n) return; if (!enabled && clearWhenDisabled) n.value = ''; n.disabled = !enabled; n.classList.toggle('bg-gray-100', !enabled); n.classList.toggle('text-gray-500', !enabled); }
function updateMainIntervalFields(prefix) { const interval = (el(`${prefix}-interval`)?.value || 'monthly').trim(); const startMonth = el(`${prefix}-start-month`); const customMonths = el(`${prefix}-custom-months`); if (interval === 'custom') { setInputEnabled(startMonth, false, true); setInputEnabled(customMonths, true, false); return; } if (interval === 'monthly' || interval === 'once') { setInputEnabled(startMonth, false, true); setInputEnabled(customMonths, false, true); return; } setInputEnabled(startMonth, true, false); setInputEnabled(customMonths, false, true); }
function updateContributionRowState(row) { if (!row) return; const interval = row.querySelector('.ab2-contrib-interval')?.value || 'inherit'; const customMonths = row.querySelector('.ab2-contrib-custom'); setInputEnabled(customMonths, interval === 'custom', interval !== 'custom'); }
function updateAccountTypeDependencies() {
    const type = (el('ab2-account-type')?.value || 'bank').trim();
    const role = normalizeAccountRole(el('ab2-account-role')?.value || 'both');
    const usesBuffer = accountUsesBuffer(type, role);
    const minBuffer = el('ab2-account-min-buffer');
    const currentBalanceWrap = el('ab2-account-current-balance-value')?.closest('div') || el('ab2-account-start-balance')?.closest('div');
    const startDateWrap = el('ab2-account-start-date')?.closest('div');

    setInputEnabled(minBuffer, usesBuffer, !usesBuffer);
    if (!usesBuffer && minBuffer) minBuffer.value = '0';

    [minBuffer?.closest('div'), currentBalanceWrap].forEach((wrap) => {
        if (wrap) wrap.classList.toggle('hidden', !usesBuffer);
    });
    if (startDateWrap) startDateWrap.classList.add('hidden');
    syncAccountAmountLockState();
    updateAccountCurrentBalanceText();
}

function monthKey(year, month) { return `${year}-${String(month).padStart(2, '0')}`; }
function monthLabel(key) { const [year, month] = String(key || '').split('-').map(Number); return year && month ? `${MONTHS[month - 1]} ${year}` : '-'; }
function lastDayOfMonth(year, month) { return new Date(year, month, 0).getDate(); }
function compareMonthKey(a, b) { return String(a || '').localeCompare(String(b || '')); }
function monthKeyDate(key, day = 1) {
    const [year, month] = String(key || '').split('-').map(Number);
    if (!year || !month) return null;
    const safeDay = Math.min(Math.max(parseInt(day, 10) || 1, 1), lastDayOfMonth(year, month));
    return new Date(year, month - 1, safeDay);
}
function monthKeyFirstBusinessDay(key, day = 1) {
    const base = monthKeyDate(key, day);
    if (!base) return '';
    return isoDate(shiftToBusinessDay(base, 1) || base);
}
function currentMonthKey() { const now = referenceDate(); return monthKey(now.getFullYear(), now.getMonth() + 1); }
function freeMargin(account, row) { if (!row) return 0; return roundMoney(toNum(row.end, 0) - accountMinBuffer(account)); }
function cloneClean(data) { const next = { ...(data || {}) }; delete next.id; return next; }
function monthNameList(list = []) { return list.map((m) => MONTHS[m - 1]).filter(Boolean).join(', ') || '-'; }
function monthListEquals(left = [], right = []) {
    const a = parseMonths((Array.isArray(left) ? left : []).join(','));
    const b = parseMonths((Array.isArray(right) ? right : []).join(','));
    if (a.length !== b.length) return false;
    return a.every((value, idx) => value === b[idx]);
}
function normalizeContribForCompare(list = []) {
    return (Array.isArray(list) ? list : [])
        .map((row) => ({
            sourceAccountId: row?.sourceAccountId || '',
            amount: roundMoney(toNum(row?.amount, 0)),
            intervalType: row?.intervalType || 'inherit',
            customMonths: parseMonths((Array.isArray(row?.customMonths) ? row.customMonths : []).join(',')),
            note: String(row?.note || '').trim()
        }))
        .filter((row) => row.sourceAccountId && row.amount > 0)
        .sort((a, b) => `${a.sourceAccountId}|${a.intervalType}|${a.amount}`.localeCompare(`${b.sourceAccountId}|${b.intervalType}|${b.amount}`));
}
function itemVersionRequiresSplit(before, payload) {
    if (!before) return false;
    if (roundMoney(toNum(before.amount, 0)) !== roundMoney(toNum(payload.amount, 0))) return true;
    if (String(before.typ || '') !== String(payload.typ || '')) return true;
    if (String(before.accountId || '') !== String(payload.accountId || '')) return true;
    if (String(before.intervalType || 'monthly') !== String(payload.intervalType || 'monthly')) return true;
    if ((parseInt(before.startMonth, 10) || null) !== (parseInt(payload.startMonth, 10) || null)) return true;
    if ((parseInt(before.dayOfMonth, 10) || 1) !== (parseInt(payload.dayOfMonth, 10) || 1)) return true;
    if (!monthListEquals(before.customMonths || [], payload.customMonths || [])) return true;
    const contribBefore = JSON.stringify(normalizeContribForCompare(before.contributions || []));
    const contribAfter = JSON.stringify(normalizeContribForCompare(payload.contributions || []));
    return contribBefore !== contribAfter;
}
function transferVersionRequiresSplit(before, payload) {
    if (!before) return false;
    if (String(before.sourceAccountId || '') !== String(payload.sourceAccountId || '')) return true;
    if (String(before.targetAccountId || '') !== String(payload.targetAccountId || '')) return true;
    if (roundMoney(toNum(before.amount, 0)) !== roundMoney(toNum(payload.amount, 0))) return true;
    if (String(before.intervalType || 'monthly') !== String(payload.intervalType || 'monthly')) return true;
    if ((parseInt(before.startMonth, 10) || null) !== (parseInt(payload.startMonth, 10) || null)) return true;
    if ((parseInt(before.dayOfMonth, 10) || 1) !== (parseInt(payload.dayOfMonth, 10) || 1)) return true;
    if (!monthListEquals(before.customMonths || [], payload.customMonths || [])) return true;
    const linkedBefore = JSON.stringify(normalizeTransferLinkedAllocations(before.linkedTitleAllocations || []));
    const linkedAfter = JSON.stringify(normalizeTransferLinkedAllocations(payload.linkedTitleAllocations || []));
    return linkedBefore !== linkedAfter;
}
function nextExecutionDate(entity, horizon = 36) {
    const now = referenceDate();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    for (let i = 0; i < horizon; i += 1) {
        const date = getExecutionDateForMonth(entity, year, month);
        if (date && date >= today) return date;
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    return null;
}
function yearlyHitCount(entity, horizon = 12) {
    const now = referenceDate();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    let hits = 0;
    for (let i = 0; i < horizon; i += 1) {
        if (dueInMonth(entity, year, month)) hits += 1;
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    return hits;
}
function forecastWindow(horizonMonths = forecastHorizonMonths) {
    const horizon = normalizeForecastHorizon(horizonMonths, forecastHorizonMonths);
    const startDay = referenceDayStart();
    const startMonthDate = new Date(startDay.getFullYear(), startDay.getMonth(), 1);
    const endMonthDate = new Date(startMonthDate.getFullYear(), startMonthDate.getMonth() + horizon - 1, 1);
    return { horizon, startDay, startMonthDate, endMonthDate };
}
function executionDatesInHorizon(entity, horizonMonths = forecastHorizonMonths) {
    const { horizon, startDay, startMonthDate, endMonthDate } = forecastWindow(horizonMonths);
    const endMonthKey = monthKey(endMonthDate.getFullYear(), endMonthDate.getMonth() + 1);
    const dates = [];
    let year = startMonthDate.getFullYear();
    let month = startMonthDate.getMonth() + 1;
    for (let i = 0; i < horizon; i += 1) {
        const date = getExecutionDateForMonth(entity, year, month);
        if (date && date >= startDay) {
            const key = monthKey(date.getFullYear(), date.getMonth() + 1);
            if (compareMonthKey(key, endMonthKey) <= 0) dates.push(date);
        }
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    return dates;
}
function hitsInHorizon(entity, horizonMonths = forecastHorizonMonths) {
    return executionDatesInHorizon(entity, horizonMonths).length;
}
function monthlyEquivalent(total, horizonMonths = forecastHorizonMonths) {
    const horizon = Math.max(1, normalizeForecastHorizon(horizonMonths, forecastHorizonMonths));
    return roundMoney(toNum(total, 0) / horizon);
}
function contributionEntity(item, contrib) {
    const intervalType = contrib.intervalType === 'inherit' ? item.intervalType : (contrib.intervalType || item.intervalType || 'monthly');
    return {
        intervalType,
        startMonth: contrib.startMonth || item.startMonth,
        customMonths: contrib.customMonths || [],
        dayOfMonth: contrib.dayOfMonth || item.dayOfMonth,
        validFrom: contrib.validFrom || item.validFrom,
        validTo: contrib.validTo || item.validTo
    };
}
function itemNeedInHorizon(item, horizonMonths = forecastHorizonMonths) {
    const amount = roundMoney(toNum(item?.amount, 0));
    if (amount <= 0) return 0;
    return roundMoney(hitsInHorizon(item, horizonMonths) * amount);
}
function directCoverageInHorizon(item, horizonMonths = forecastHorizonMonths) {
    return roundMoney((Array.isArray(item?.contributions) ? item.contributions : [])
        .filter((contrib) => contrib?.sourceAccountId && toNum(contrib.amount, 0) > 0)
        .reduce((sum, contrib) => {
            const amount = roundMoney(toNum(contrib.amount, 0));
            const hits = hitsInHorizon(contributionEntity(item, contrib), horizonMonths);
            return sum + (hits * amount);
        }, 0));
}
function linkedCoverageInHorizon(item, horizonMonths = forecastHorizonMonths) {
    return roundMoney(Object.values(TRANSFERS)
        .filter((transfer) => transferLinkedToItem(transfer, item))
        .reduce((sum, transfer) => {
            const amount = roundMoney(transferAmountForItem(transfer, item));
            if (amount <= 0) return sum;
            const hits = hitsInHorizon(transfer, horizonMonths);
            return sum + (hits * amount);
        }, 0));
}
function contributionGapByHorizon(item, horizonMonths = forecastHorizonMonths) {
    const horizon = normalizeForecastHorizon(horizonMonths, forecastHorizonMonths);
    const itemAmount = roundMoney(toNum(item?.amount, 0));
    const needInHorizon = itemNeedInHorizon(item, horizon);
    const sourceMap = new Map();
    const appendParticipant = (key, sourceId, sourceName, amountInHorizon, kind) => {
        if (amountInHorizon <= 0.009) return;
        if (!sourceMap.has(key)) {
            sourceMap.set(key, {
                sourceId,
                sourceName,
                amountInHorizon: 0,
                kinds: new Set()
            });
        }
        const row = sourceMap.get(key);
        row.amountInHorizon = roundMoney(row.amountInHorizon + amountInHorizon);
        row.kinds.add(kind || '-');
    };
    (Array.isArray(item?.contributions) ? item.contributions : [])
        .filter((contrib) => contrib?.sourceAccountId && toNum(contrib.amount, 0) > 0)
        .forEach((contrib) => {
            const amount = roundMoney(toNum(contrib.amount, 0));
            const hits = hitsInHorizon(contributionEntity(item, contrib), horizon);
            appendParticipant(
                `direct_${String(contrib.sourceAccountId || '').toLowerCase()}`,
                contrib.sourceAccountId,
                ACCOUNTS[contrib.sourceAccountId]?.name || '-',
                roundMoney(hits * amount),
                'Direktbeitrag'
            );
        });
    Object.values(TRANSFERS)
        .filter((transfer) => transferLinkedToItem(transfer, item))
        .forEach((transfer) => {
            const perExecution = roundMoney(transferAmountForItem(transfer, item));
            if (perExecution <= 0.009) return;
            const hits = hitsInHorizon(transfer, horizon);
            appendParticipant(
                `transfer_${String(transfer.sourceAccountId || '').toLowerCase()}`,
                transfer.sourceAccountId || '',
                ACCOUNTS[transfer.sourceAccountId]?.name || '-',
                roundMoney(hits * perExecution),
                'Transferplan'
            );
        });
    const participants = Array.from(sourceMap.values())
        .map((row) => ({
            sourceId: row.sourceId,
            sourceName: row.sourceName,
            amountInHorizon: roundMoney(row.amountInHorizon),
            amountPerMonth: monthlyEquivalent(row.amountInHorizon, horizon),
            kindText: Array.from(row.kinds).join(' + ')
        }))
        .sort((a, b) => toNum(b.amountInHorizon, 0) - toNum(a.amountInHorizon, 0));
    const coveredInHorizon = roundMoney(participants.reduce((sum, row) => sum + toNum(row.amountInHorizon, 0), 0));
    const gapInHorizon = roundMoney(coveredInHorizon - needInHorizon);
    const gapPerMonth = monthlyEquivalent(gapInHorizon, horizon);
    return {
        horizonMonths: horizon,
        itemAmount,
        needInHorizon,
        coveredInHorizon,
        gapInHorizon,
        gapPerMonth,
        participants,
        coveragePercent: needInHorizon > 0 ? roundMoney((coveredInHorizon / needInHorizon) * 100) : 0
    };
}
function contributionTotal(item) { return roundMoney((Array.isArray(item?.contributions) ? item.contributions : []).reduce((sum, c) => sum + toNum(c?.amount, 0), 0)); }
function itemNetEffect(item) { const signed = item?.typ === 'gutschrift' ? toNum(item?.amount, 0) : -toNum(item?.amount, 0); return roundMoney(signed + contributionTotal(item)); }
function itemStatus(item) {
    const now = referenceDayStart();
    const start = parseDate(item?.validFrom);
    const end = parseDate(item?.validTo);
    if (!item?.title || !item?.accountId || toNum(item?.amount, NaN) <= 0 || !start) return { key: 'fehler', label: 'Fehler', css: 'bg-red-100 text-red-700' };
    if (end && start && end < start) return { key: 'fehler', label: 'Fehler', css: 'bg-red-100 text-red-700' };
    if (start > now) return { key: 'geplant', label: 'Geplant', css: 'bg-blue-100 text-blue-700' };
    if (end && end < now) return { key: 'vergangen', label: 'Vergangen', css: 'bg-gray-100 text-gray-700' };
    return { key: 'aktiv', label: 'Aktiv', css: 'bg-green-100 text-green-700' };
}

function transferPlanStatus(transfer) {
    const now = referenceDayStart();
    const start = parseDate(transfer?.validFrom);
    const end = parseDate(transfer?.validTo);
    if (!transfer?.sourceAccountId || !transfer?.targetAccountId || toNum(transfer?.amount, NaN) <= 0 || !start) return { key: 'aktiv' };
    if (start > now) return { key: 'geplant' };
    if (end && end < now) return { key: 'vergangen' };
    return { key: 'aktiv' };
}

function accountPlanStatus(account) {
    const now = referenceDayStart();
    const latest = latestSnapshots()[account?.id] || null;
    const start = parseDate(latest?.date);
    if (start && start > now) return { key: 'geplant' };
    return { key: 'aktiv' };
}

function includeWithStatusVisibility(statusKey, state) {
    if (statusKey === 'aktiv') return state.showActive !== false;
    if (statusKey === 'geplant') return !!state.showPlanned;
    if (statusKey === 'vergangen') return !!state.showPast;
    return true;
}
function getExecutionDateForMonth(entity, year, month) {
    const start = parseDate(entity?.validFrom);
    const end = parseDate(entity?.validTo);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    if (start && start > monthEnd) return null;
    if (end && end < monthStart) return null;

    const interval = String(entity?.intervalType || 'monthly').trim();
    const startMonth = parseInt(entity?.startMonth, 10) || (start ? start.getMonth() + 1 : month);
    const customMonths = Array.isArray(entity?.customMonths) ? entity.customMonths.map((m) => parseInt(m, 10)).filter((m) => m >= 1 && m <= 12) : [];
    let monthAllowed = false;
    if (interval === 'monthly') monthAllowed = true;
    else if (interval === 'once') monthAllowed = !!start && year === start.getFullYear() && month === start.getMonth() + 1;
    else if (interval === 'quarterly') monthAllowed = ((month - startMonth + 120) % 3) === 0;
    else if (interval === 'semiannual') monthAllowed = ((month - startMonth + 120) % 6) === 0;
    else if (interval === 'annual') monthAllowed = ((month - startMonth + 120) % 12) === 0;
    else if (interval === 'custom') monthAllowed = customMonths.includes(month);
    if (!monthAllowed) return null;

    const maxDay = lastDayOfMonth(year, month);
    const targetDay = Math.min(Math.max(parseInt(entity?.dayOfMonth, 10) || (start ? start.getDate() : 1), 1), maxDay);
    let candidate = new Date(year, month - 1, targetDay);
    if (start && start.getFullYear() === year && start.getMonth() + 1 === month && candidate < start) candidate = new Date(start);
    const shifted = shiftToBusinessDay(candidate, 1) || candidate;
    if (end && shifted > end) return null;
    return shifted;
}
function dueInMonth(entity, y, m) { return !!getExecutionDateForMonth(entity, y, m); }
function personEtaDelaysFromTransfer(transfer) {
    const observations = Array.isArray(transfer?.arrivalObservations) ? transfer.arrivalObservations : [];
    const delays = observations
        .map((row) => {
            if (!row) return null;
            const scheduled = parseDate(row.scheduledDate || row.sollDate || '');
            const arrived = parseDate(row.arrivalDate || row.istDate || row.date || '');
            if (!scheduled || !arrived) return null;
            const diffDays = Math.round((arrived - scheduled) / 86400000);
            if (!Number.isFinite(diffDays)) return null;
            return Math.max(0, diffDays);
        })
        .filter((value) => Number.isFinite(value));
    return delays;
}
function personEtaModel(transfer) {
    const delays = personEtaDelaysFromTransfer(transfer);
    if (delays.length >= 3) {
        const avg = roundMoney(delays.reduce((sum, value) => sum + value, 0) / delays.length);
        return { historyCount: delays.length, delayDays: Math.max(0, Math.round(avg)), learned: true };
    }
    const fallbackDelay = Math.max(0, Math.round(toNum(transfer?.personEtaDelayDays, 1)));
    const fallbackHistory = parseInt(transfer?.personEtaHistoryCount, 10) || 0;
    if (fallbackHistory >= 3) {
        return { historyCount: fallbackHistory, delayDays: fallbackDelay, learned: true };
    }
    return { historyCount: delays.length || fallbackHistory, delayDays: 1, learned: false };
}
function transferExecutionDateForForecast(transfer, year, month) {
    const planned = getExecutionDateForMonth(transfer, year, month);
    if (!planned) return null;
    const source = ACCOUNTS[transfer?.sourceAccountId] || null;
    if (!isPersonAccount(source)) return planned;
    const eta = personEtaModel(transfer);
    const shifted = dateShiftDays(planned, eta.delayDays);
    return shiftToBusinessDay(shifted || planned, 1) || planned;
}
function forEachExecutionInRange(entity, fromDate, toDate, callback) {
    const from = parseDate(fromDate);
    const to = parseDate(toDate);
    if (!from || !to || to < from || typeof callback !== 'function') return;
    let year = from.getFullYear();
    let month = from.getMonth() + 1;
    const endCursor = (to.getFullYear() * 12) + to.getMonth();
    while (((year * 12) + (month - 1)) <= endCursor) {
        const exec = getExecutionDateForMonth(entity, year, month);
        if (exec && exec >= from && exec <= to) callback(exec);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
}
function personControlDefaultRange(baseDate = new Date()) {
    const year = baseDate.getFullYear();
    const from = new Date(year, 0, 1);
    const prevMonthEnd = new Date(year, baseDate.getMonth(), 0);
    const to = prevMonthEnd < from ? from : prevMonthEnd;
    return { from: isoDate(from), to: isoDate(to) };
}
function personControlResultLabel(result) {
    return result === 'done' ? 'Kontrolle durchgeführt' : result === 'not_done' ? 'Kontrolle nicht durchgeführt' : '-';
}
function personControlRowsForAccount(accountId, fromDate, toDate) {
    if (!accountId) return [];
    const rows = [];
    Object.values(TRANSFERS).forEach((transfer) => {
        const amount = roundMoney(toNum(transfer?.amount, 0));
        if (amount <= 0 || (transfer.sourceAccountId !== accountId && transfer.targetAccountId !== accountId)) return;
        forEachExecutionInRange(transfer, fromDate, toDate, (exec) => {
            const fromPerson = transfer.sourceAccountId === accountId;
            const peerId = fromPerson ? transfer.targetAccountId : transfer.sourceAccountId;
            rows.push({
                date: isoDate(exec),
                direction: fromPerson ? 'von Person' : 'an Person',
                type: 'Transfer',
                counterparty: ACCOUNTS[peerId]?.name || '-',
                amount: fromPerson ? -amount : amount,
                note: transfer.note || ''
            });
        });
    });
    Object.values(ITEMS).forEach((item) => {
        const amount = roundMoney(toNum(item?.amount, 0));
        if (amount <= 0) return;
        if (item.accountId === accountId) {
            forEachExecutionInRange(item, fromDate, toDate, (exec) => {
                const signed = item.typ === 'gutschrift' ? amount : -amount;
                rows.push({
                    date: isoDate(exec),
                    direction: signed >= 0 ? 'an Person' : 'von Person',
                    type: 'Eintrag',
                    counterparty: item.title || '-',
                    amount: signed,
                    note: item.notes || ''
                });
            });
        }
        (Array.isArray(item.contributions) ? item.contributions : []).forEach((contrib) => {
            const cAmount = roundMoney(toNum(contrib?.amount, 0));
            if (!contrib?.sourceAccountId || contrib.sourceAccountId !== accountId || cAmount <= 0) return;
            const intervalType = contrib.intervalType === 'inherit' ? item.intervalType : (contrib.intervalType || item.intervalType || 'monthly');
            const contribEntity = {
                intervalType,
                startMonth: contrib.startMonth || item.startMonth,
                customMonths: contrib.customMonths || [],
                dayOfMonth: contrib.dayOfMonth || item.dayOfMonth,
                validFrom: contrib.validFrom || item.validFrom,
                validTo: contrib.validTo || item.validTo
            };
            forEachExecutionInRange(contribEntity, fromDate, toDate, (exec) => {
                rows.push({
                    date: isoDate(exec),
                    direction: 'von Person',
                    type: 'Beitrag',
                    counterparty: `${ACCOUNTS[item.accountId]?.name || '-'} (${item.title || '-'})`,
                    amount: -cAmount,
                    note: contrib.note || ''
                });
            });
        });
    });
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.type).localeCompare(String(b.type)) || String(a.counterparty).localeCompare(String(b.counterparty)));
}
function renderPersonControlHistory(accountId = personControlAccountId) {
    const host = el('ab2-person-control-history');
    if (!host) return;
    const account = ACCOUNTS[accountId];
    const logs = Array.isArray(account?.personControlLogs) ? account.personControlLogs.slice() : [];
    const sorted = logs.sort((a, b) => toNum(b?.checkedAtMs, 0) - toNum(a?.checkedAtMs, 0));
    if (!sorted.length) {
        host.innerHTML = '<p class="text-sm text-amber-900/80">Noch keine Kontrollen protokolliert.</p>';
        return;
    }
    host.innerHTML = sorted.slice(0, 20).map((entry) => {
        const result = personControlResultLabel(entry?.result);
        const resultCss = entry?.result === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';
        const from = formatDate(entry?.periodFrom || '');
        const to = formatDate(entry?.periodTo || '');
        const when = formatDate(entry?.checkedAt || '');
        const by = entry?.checkedBy || 'Unbekannt';
        const bookingCount = Number.isFinite(toNum(entry?.bookingCount, NaN)) ? ` · ${Math.max(0, parseInt(entry.bookingCount, 10) || 0)} Buchungen` : '';
        return `<div class="rounded-lg border border-amber-200 bg-white p-2"><div class="flex flex-wrap items-center justify-between gap-2"><div class="text-xs text-gray-600">${escapeHtml(when)} · ${escapeHtml(by)}</div><span class="px-2 py-1 rounded-full text-[11px] font-bold ${resultCss}">${escapeHtml(result)}</span></div><div class="mt-1 text-xs text-gray-700">Zeitraum: ${escapeHtml(from)} bis ${escapeHtml(to)}${bookingCount}</div>${entry?.note ? `<div class="mt-1 text-xs text-gray-700">Notiz: ${escapeHtml(entry.note)}</div>` : ''}</div>`;
    }).join('');
}
function renderPersonControlRows() {
    const account = ACCOUNTS[personControlAccountId];
    const list = el('ab2-person-control-list');
    const summary = el('ab2-person-control-summary');
    const fromValue = el('ab2-person-control-from')?.value || '';
    const toValue = el('ab2-person-control-to')?.value || '';
    const fromDate = parseDate(fromValue);
    const toDate = parseDate(toValue);
    if (!list || !summary) return;
    if (!account || !isPersonAccount(account)) {
        summary.textContent = 'Bitte eine Person auswählen.';
        list.innerHTML = '<p class="text-sm text-gray-500">Keine Person ausgewählt.</p>';
        return;
    }
    if (!fromDate || !toDate) {
        summary.textContent = 'Bitte gültigen Zeitraum eingeben.';
        list.innerHTML = '<p class="text-sm text-gray-500">Zeitraum ist unvollständig.</p>';
        return;
    }
    if (toDate < fromDate) {
        summary.textContent = 'Das Enddatum darf nicht vor dem Startdatum liegen.';
        list.innerHTML = '<p class="text-sm text-red-600">Bitte Zeitraum korrigieren.</p>';
        return;
    }
    const rows = personControlRowsForAccount(account.id, fromDate, toDate);
    const incoming = roundMoney(rows.reduce((sum, row) => sum + (toNum(row.amount, 0) > 0 ? toNum(row.amount, 0) : 0), 0));
    const outgoing = roundMoney(rows.reduce((sum, row) => sum + (toNum(row.amount, 0) < 0 ? Math.abs(toNum(row.amount, 0)) : 0), 0));
    summary.textContent = `${rows.length} Buchung(en) · an Person ${formatCurrency(incoming)} · von Person ${formatCurrency(outgoing)}`;
    if (!rows.length) {
        list.innerHTML = '<p class="text-sm text-gray-500">Keine Buchungen im gewählten Zeitraum.</p>';
        return;
    }
    const body = rows.map((row) => `<tr class="border-t"><td class="px-2 py-2 text-xs text-gray-600 whitespace-nowrap">${formatDate(row.date)}</td><td class="px-2 py-2 text-xs text-gray-700 whitespace-nowrap">${escapeHtml(row.direction)}</td><td class="px-2 py-2 text-xs text-gray-700 whitespace-nowrap">${escapeHtml(row.type)}</td><td class="px-2 py-2 text-sm text-gray-800">${escapeHtml(row.counterparty || '-')}</td><td class="px-2 py-2 text-sm font-bold whitespace-nowrap ${toNum(row.amount, 0) < 0 ? 'text-red-700' : 'text-emerald-700'}">${formatSignedCurrency(row.amount)}</td><td class="px-2 py-2 text-xs text-gray-600">${escapeHtml(row.note || '')}</td></tr>`).join('');
    list.innerHTML = `<div class="overflow-x-auto"><table class="min-w-[760px] w-full"><thead><tr class="bg-gray-50 border-b"><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">Datum</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">Richtung</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">Art</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">Gegenkonto / Zweck</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">Betrag</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-gray-500">Notiz</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function openPersonControl(accountId) {
    const account = ACCOUNTS[accountId];
    if (!account || !isPersonAccount(account)) return alertUser('Kontrolle ist nur für Personen verfügbar.', 'error');
    personControlAccountId = accountId;
    const title = el('ab2-person-control-title');
    if (title) title.textContent = `Personenkontrolle · ${account.name || '-'}`;
    const range = personControlDefaultRange(new Date());
    if (el('ab2-person-control-from')) el('ab2-person-control-from').value = range.from;
    if (el('ab2-person-control-to')) el('ab2-person-control-to').value = range.to;
    if (el('ab2-person-control-result')) el('ab2-person-control-result').value = '';
    if (el('ab2-person-control-note')) el('ab2-person-control-note').value = '';
    renderPersonControlRows();
    renderPersonControlHistory(accountId);
    openModal('ab2-person-control-modal');
}
function closePersonControlModal() {
    closeModal('ab2-person-control-modal');
    personControlAccountId = '';
}
async function finishPersonControl() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const account = ACCOUNTS[personControlAccountId];
    if (!account || !isPersonAccount(account)) return alertUser('Person nicht gefunden.', 'error');
    const periodFrom = el('ab2-person-control-from')?.value || '';
    const periodTo = el('ab2-person-control-to')?.value || '';
    const fromDate = parseDate(periodFrom);
    const toDate = parseDate(periodTo);
    if (!fromDate || !toDate || toDate < fromDate) return alertUser('Bitte gültigen Zeitraum eingeben.', 'error');
    const result = el('ab2-person-control-result')?.value || '';
    if (!result) return alertUser('Bitte Ergebnis der Kontrolle auswählen.', 'error');
    const note = el('ab2-person-control-note')?.value?.trim() || '';
    const rows = personControlRowsForAccount(account.id, fromDate, toDate);
    const entryDate = new Date();
    const entry = {
        result,
        note,
        periodFrom,
        periodTo,
        bookingCount: rows.length,
        incomingAmount: roundMoney(rows.reduce((sum, row) => sum + (toNum(row.amount, 0) > 0 ? toNum(row.amount, 0) : 0), 0)),
        outgoingAmount: roundMoney(rows.reduce((sum, row) => sum + (toNum(row.amount, 0) < 0 ? Math.abs(toNum(row.amount, 0)) : 0), 0)),
        checkedAt: isoDate(entryDate),
        checkedAtMs: entryDate.getTime(),
        checkedBy: currentUser?.displayName || uid() || 'Unbekannt'
    };
    const before = cloneClean(account);
    const existingLogs = Array.isArray(account.personControlLogs) ? account.personControlLogs : [];
    const nextLogs = [...existingLogs, entry].sort((a, b) => toNum(a?.checkedAtMs, 0) - toNum(b?.checkedAtMs, 0)).slice(-60);
    const payload = { personControlLogs: nextLogs, personControlLast: entry, updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    try {
        await updateDoc(doc(accountsRef, account.id), payload);
        await writeAudit('update', 'account', account.id, before, payload, { action: 'person_control_finish', result, periodFrom, periodTo, bookingCount: entry.bookingCount });
        alertUser('Personenkontrolle protokolliert.', 'success');
        closePersonControlModal();
    } catch (error) {
        console.error(error);
        alertUser(`Fehler beim Protokollieren: ${error.message || error}`, 'error');
    }
}

function latestSnapshots(beforeDate = null) {
    const map = {};
    Object.values(RECON).forEach((entry) => {
        if (entry?.type !== 'snapshot' || !entry?.accountId || !entry?.date) return;
        const date = parseDate(entry.date);
        if (!date) return;
        if (beforeDate && date >= beforeDate) return;
        const prev = map[entry.accountId];
        if (!prev || parseDate(prev.date) < date) map[entry.accountId] = entry;
    });
    return map;
}
function latestSnapshotByAccountAndMonth() {
    const map = {};
    Object.values(RECON).forEach((entry) => {
        if (entry?.type !== 'snapshot' || !entry?.accountId || !entry?.date) return;
        const date = parseDate(entry.date);
        if (!date) return;
        const key = `${entry.accountId}__${entry.date.slice(0, 7)}`;
        const prev = map[key];
        if (!prev || parseDate(prev.date) < date) map[key] = entry;
    });
    return map;
}
function buildQuality(alerts = []) {
    const now = referenceDayStart();
    const currentMonth = currentMonthKey();
    return Object.values(ACCOUNTS).filter(isRelevantTargetAccount).map((account) => {
        const accountSnapshots = Object.values(RECON)
            .filter((entry) => entry?.type === 'snapshot' && entry?.accountId === account.id && entry?.date)
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const latest = accountSnapshots[0] || null;
        const latestDate = latest ? parseDate(latest.date) : null;
        const ageDays = latestDate ? Math.floor((now - latestDate) / 86400000) : null;
        const currentSnapshot = accountSnapshots.some((entry) => String(entry.date || '').startsWith(currentMonth));
        let status = 'ok';
        let text = 'aktuell';
        if (!latestDate) { status = 'alarm'; text = 'kein Snapshot'; }
        else if (!currentSnapshot) { status = ageDays > 90 ? 'alarm' : 'warn'; text = 'aktueller Monat fehlt'; }
        else if (ageDays > 90) { status = 'alarm'; text = `zu alt (${ageDays} Tage)`; }
        else if (ageDays > 45) { status = 'warn'; text = `älter (${ageDays} Tage)`; }
        const nextAlert = alerts.find((alert) => alert.accountId === account.id && alert.severity === 'alarm') || alerts.find((alert) => alert.accountId === account.id);
        return { accountId: account.id, latest, latestDate, ageDays, currentSnapshot, status, text, nextAlert };
    });
}
function monthsSinceInclusive(startDate, endDate = referenceDate()) {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end || end < start) return 1;
    return Math.max(1, ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1);
}
function transferLinkedToItem(transfer, item) {
    return transferAmountForItem(transfer, item) > 0.009;
}
function buildContributionImbalances() {
    const horizon = forecastHorizonMonths;
    return Object.values(ITEMS)
        .map((item) => {
            const account = ACCOUNTS[item.accountId] || null;
            if (!isRelevantTargetAccount(account)) return null;
            if (itemStatus(item).key !== 'aktiv' || item?.typ !== 'belastung') return null;
            const gap = contributionGapByHorizon(item, horizon);
            if (!gap.participants.length) return null;
            if (Math.abs(gap.gapInHorizon) <= 0.009) return null;
            const severity = Math.abs(gap.gapPerMonth) >= Math.max(5, gap.itemAmount * 0.2) ? 'alarm' : 'warn';
            return {
                id: item.id,
                itemId: item.id,
                title: item.title || '-',
                accountId: item.accountId,
                accountName: account.name || '-',
                itemAmount: gap.itemAmount,
                horizonMonths: gap.horizonMonths,
                needInHorizon: gap.needInHorizon,
                coveredInHorizon: gap.coveredInHorizon,
                gapInHorizon: gap.gapInHorizon,
                gapPerMonth: gap.gapPerMonth,
                gapPerExecution: gap.gapPerMonth,
                totalCovered: gap.coveredInHorizon,
                referenceMonths: gap.horizonMonths,
                settlementAmount: gap.gapInHorizon,
                severity,
                actionText: gap.gapInHorizon > 0 ? 'senken / rückführen' : 'nachfordern',
                details: gap.participants.map((row) => ({
                    sourceId: row.sourceId,
                    sourceName: row.sourceName,
                    kind: row.kindText,
                    amount: row.amountInHorizon,
                    amountPerMonth: row.amountPerMonth
                }))
            };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.gapPerMonth) - Math.abs(a.gapPerMonth));
}
function buildSetup(quality, alerts, imbalances) {
    const items = Object.values(ITEMS);
    const targetAccounts = Object.values(ACCOUNTS).filter((account) => canBeTargetAccount(account) && !isPersonAccount(account));
    const invalid = items.filter((item) => itemStatus(item).key === 'fehler').length;
    const qualityIssues = quality.filter((entry) => entry.status !== 'ok');
    const alarms = alerts.filter((alert) => alert.severity === 'alarm');
    return [
        { key: 'accounts', title: 'Konten', ok: Object.keys(ACCOUNTS).length > 0, text: Object.keys(ACCOUNTS).length ? `${Object.keys(ACCOUNTS).length} vorhanden` : 'Noch kein Konto angelegt' },
        { key: 'target_accounts', title: 'Zielkonten', ok: targetAccounts.length > 0, text: targetAccounts.length ? `${targetAccounts.length} werden überwacht` : 'Kein Zielkonto für Forecast' },
        { key: 'items', title: 'Einträge', ok: items.length > 0, text: items.length ? `${items.length} Buchungen geplant` : 'Noch keine Einträge' },
        { key: 'quality', title: 'Datenqualität', ok: qualityIssues.length === 0, text: qualityIssues.length ? `${qualityIssues.length} Hinweise` : 'Alle relevanten Konten aktuell' },
        { key: 'imbalances', title: 'Titel-Beiträge', ok: !imbalances.length, text: imbalances.length ? `${imbalances.length} Ungleichgewicht(e)` : 'Alle Beiträge im Gleichgewicht' },
        { key: 'forecast', title: 'Kontostandsprognose', ok: !alarms.length && invalid === 0, text: invalid ? `${invalid} fehlerhafte Einträge` : alarms.length ? `${alarms.length} Alarm(e)` : 'Aktuell stabil' }
    ];
}
function preferredOwnSourceAccount(targetId) {
    const ownSources = Object.values(ACCOUNTS)
        .filter((account) => account.id !== targetId)
        .filter((account) => canBeSourceAccount(account) && !isPersonAccount(account))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return ownSources[0] || null;
}
function activeOwnMonthlyTransfer(targetId) {
    const today = referenceDayStart();
    const active = Object.values(TRANSFERS)
        .filter((transfer) => transfer.targetAccountId === targetId)
        .filter((transfer) => String(transfer.intervalType || '') === 'monthly')
        .filter((transfer) => canBeSourceAccount(ACCOUNTS[transfer.sourceAccountId]) && !isPersonAccount(ACCOUNTS[transfer.sourceAccountId]))
        .filter((transfer) => {
            const from = parseDate(transfer.validFrom);
            const to = parseDate(transfer.validTo);
            if (!from) return false;
            if (from > today) return false;
            if (to && to < today) return false;
            return true;
        })
        .sort((a, b) => toNum(b.amount, 0) - toNum(a.amount, 0));
    return active[0] || null;
}
function nextMonthlyExecutionDate(dayOfMonth = 1, fromDate = referenceDayStart()) {
    const from = parseDate(fromDate) || referenceDayStart();
    let year = from.getFullYear();
    let month = from.getMonth() + 1;
    for (let i = 0; i < 24; i += 1) {
        const candidate = getExecutionDateForMonth({ intervalType: 'monthly', dayOfMonth, validFrom: isoDate(from) }, year, month);
        if (candidate && candidate >= from) return candidate;
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    return null;
}
function earliestBusinessDayFromToday() {
    const today = referenceDayStart();
    return isoDate(shiftToBusinessDay(today, 1) || today);
}
function buildDeviationWarnings(suggestionList = []) {
    return suggestionList
        .filter((entry) => !!entry?.deviationWarning)
        .map((entry) => ({
            targetId: entry.targetId,
            targetName: entry.targetName,
            currentMonthlyAmount: roundMoney(toNum(entry.currentMonthlyAmount, 0)),
            recommendedMonthlyAmount: roundMoney(toNum(entry.recommendedMonthlyAmount, 0)),
            effectiveFrom: entry.effectiveFrom || '',
            criticalDate: entry.criticalDate || '',
            criticalMinDayDelta: roundMoney(toNum(entry.criticalMinDayDelta, 0)),
            text: `${entry.targetName}: ${entry.recommendedMonthlyAmount >= entry.currentMonthlyAmount ? 'Erhöhung' : 'Senkung'} empfohlen (${formatCurrency(entry.currentMonthlyAmount)} → ${formatCurrency(entry.recommendedMonthlyAmount)}) ab ${formatDate(entry.effectiveFrom)}${entry.criticalDate ? ` · Stichtag ${formatDate(entry.criticalDate)}` : ''}`
        }));
}
function suggestions(timelineInput = null, imbalancesInput = null) {
    const timeline = timelineInput || FORECAST.timeline || [];
    const imbalances = Array.isArray(imbalancesInput) ? imbalancesInput : (FORECAST.imbalances || []);
    if (!timeline.length) return [];
    const list = Object.values(ACCOUNTS)
        .filter((account) => canBeTargetAccount(account) && !isPersonAccount(account))
        .map((target) => {
            const rows = timeline.map((bucket) => ({ ...bucket.accounts[target.id], key: bucket.key, label: bucket.label })).filter(Boolean);
            const deficits = rows.map((row) => roundMoney(Math.max(0, -toNum(row.minDayDelta, toNum(row.delta, 0)))));
            const firstBadIdx = deficits.findIndex((value) => value > 0.009);
            if (firstBadIdx < 0) return null;
            const deficitMonths = deficits.filter((value) => value > 0.009).length;
            const monthlyNeed = deficitMonths >= 2 ? roundMoney(Math.max(...deficits)) : 0;
            const baseTransfer = activeOwnMonthlyTransfer(target.id);
            const fallbackSource = preferredOwnSourceAccount(target.id);
            const sourceAccount = baseTransfer ? ACCOUNTS[baseTransfer.sourceAccountId] : fallbackSource;
            const sourceId = sourceAccount?.id || '';
            const sourceName = sourceAccount?.name || '-';
            const currentMonthlyAmount = baseTransfer ? roundMoney(toNum(baseTransfer.amount, 0)) : 0;
            const recommendedMonthlyAmount = roundMoney(currentMonthlyAmount + monthlyNeed);
            const criticalKey = rows[firstBadIdx]?.key || currentMonthKey();
            const preferredDay = parseInt(baseTransfer?.dayOfMonth, 10) || 1;
            const nextTransferExecutionDate = isoDate(nextMonthlyExecutionDate(preferredDay, referenceDayStart()) || monthKeyDate(criticalKey, preferredDay) || referenceDayStart());
            const effectiveFrom = nextTransferExecutionDate;
            const latestChangeDate = previousDateIso(effectiveFrom) || effectiveFrom;
            const criticalDate = rows[firstBadIdx]?.criticalDate || monthKeyFirstBusinessDay(criticalKey, preferredDay);
            const bridgeEntity = {
                intervalType: 'monthly',
                dayOfMonth: preferredDay,
                validFrom: effectiveFrom,
                validTo: previousDateIso(criticalDate)
            };
            const bridgeHits = monthlyNeed > 0.009 ? hitsInHorizon(bridgeEntity, forecastHorizonMonths) : 0;
            const bridgeAmount = roundMoney(bridgeHits * monthlyNeed);
            const onceNeed = roundMoney(Math.max(0, deficits[firstBadIdx] - bridgeAmount));
            const onceDate = earliestBusinessDayFromToday();
            const monthlyAllocations = monthlyNeed > 0 && sourceId ? [{ sourceId, sourceName, amount: monthlyNeed, transferId: baseTransfer?.id || '' }] : [];
            const onceAllocations = onceNeed > 0 && sourceId ? [{ sourceId, sourceName, amount: onceNeed }] : [];
            const monthlyCovered = roundMoney(monthlyAllocations.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
            const onceCovered = roundMoney(onceAllocations.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
            const reason = deficitMonths >= 2 ? 'strukturelles Defizit' : 'einmalige Spitze';
            const deviationWarning = monthlyNeed > 0.009 && Math.abs(recommendedMonthlyAmount - currentMonthlyAmount) > 0.009;
            return {
                id: `${target.id}__${criticalKey}`,
                targetId: target.id,
                targetName: target.name,
                criticalMonth: criticalKey,
                criticalLabel: rows[firstBadIdx]?.label || '-',
                criticalDate,
                latestChangeDate,
                nextTransferExecutionDate,
                criticalMinDayDelta: roundMoney(toNum(rows[firstBadIdx]?.minDayDelta, toNum(rows[firstBadIdx]?.delta, 0))),
                reason,
                monthlyNeed,
                onceNeed,
                preferredSourceId: sourceId,
                preferredSourceName: sourceName,
                recommendedTransferId: baseTransfer?.id || '',
                currentMonthlyAmount,
                recommendedMonthlyAmount,
                effectiveFrom,
                onceDate,
                monthlyAllocations,
                onceAllocations,
                monthlyCovered,
                onceCovered,
                deviationWarning,
                actionType: 'raise_monthly',
                conservativeMode: true,
                fullyCovered: monthlyCovered + onceCovered >= monthlyNeed + onceNeed - 0.01,
                shortfall: roundMoney(Math.max(0, monthlyNeed + onceNeed - monthlyCovered - onceCovered))
            };
        })
        .filter(Boolean);
    Object.values(ACCOUNTS)
        .filter((account) => canBeTargetAccount(account) && !isPersonAccount(account))
        .forEach((target) => {
            if (list.some((entry) => entry.targetId === target.id && toNum(entry.monthlyNeed, 0) > 0.009)) return;
            const underRows = (imbalances || [])
                .filter((entry) => entry.accountId === target.id && toNum(entry.gapPerMonth, 0) < -0.009);
            if (!underRows.length) return;
            const monthlyNeed = roundMoney(underRows.reduce((sum, entry) => sum + Math.abs(toNum(entry.gapPerMonth, 0)), 0));
            if (monthlyNeed <= 0.5) return;
            const requiredInHorizon = roundMoney(underRows.reduce((sum, entry) => sum + Math.abs(toNum(entry.gapInHorizon, 0)), 0));
            const baseTransfer = activeOwnMonthlyTransfer(target.id);
            const fallbackSource = preferredOwnSourceAccount(target.id);
            const sourceAccount = baseTransfer ? ACCOUNTS[baseTransfer.sourceAccountId] : fallbackSource;
            const sourceId = sourceAccount?.id || '';
            const sourceName = sourceAccount?.name || '-';
            const currentMonthlyAmount = baseTransfer ? roundMoney(toNum(baseTransfer.amount, 0)) : 0;
            const recommendedMonthlyAmount = roundMoney(currentMonthlyAmount + monthlyNeed);
            const preferredDay = parseInt(baseTransfer?.dayOfMonth, 10) || 1;
            const effectiveFrom = isoDate(nextMonthlyExecutionDate(preferredDay, referenceDayStart()) || referenceDayStart());
            const bridgeEntity = {
                intervalType: 'monthly',
                dayOfMonth: preferredDay,
                validFrom: effectiveFrom,
                validTo: ''
            };
            const bridgeHits = hitsInHorizon(bridgeEntity, forecastHorizonMonths);
            const bridgeAmount = roundMoney(bridgeHits * monthlyNeed);
            const onceNeed = roundMoney(Math.max(0, requiredInHorizon - bridgeAmount));
            list.push({
                id: `${target.id}__${currentMonthKey()}__under`,
                targetId: target.id,
                targetName: target.name,
                criticalMonth: currentMonthKey(),
                criticalLabel: monthLabel(currentMonthKey()),
                criticalDate: monthKeyFirstBusinessDay(currentMonthKey(), preferredDay),
                latestChangeDate: previousDateIso(effectiveFrom) || effectiveFrom,
                nextTransferExecutionDate: effectiveFrom,
                criticalMinDayDelta: 0,
                reason: 'Titelunterdeckung im Horizont',
                monthlyNeed,
                onceNeed,
                preferredSourceId: sourceId,
                preferredSourceName: sourceName,
                recommendedTransferId: baseTransfer?.id || '',
                currentMonthlyAmount,
                recommendedMonthlyAmount,
                effectiveFrom,
                onceDate: earliestBusinessDayFromToday(),
                monthlyAllocations: monthlyNeed > 0 && sourceId ? [{ sourceId, sourceName, amount: monthlyNeed, transferId: baseTransfer?.id || '' }] : [],
                onceAllocations: onceNeed > 0 && sourceId ? [{ sourceId, sourceName, amount: onceNeed }] : [],
                monthlyCovered: monthlyNeed,
                onceCovered: onceNeed,
                deviationWarning: Math.abs(recommendedMonthlyAmount - currentMonthlyAmount) > 0.009,
                actionType: 'raise_monthly',
                conservativeMode: true,
                fullyCovered: true,
                shortfall: 0
            });
        });
    Object.values(ACCOUNTS)
        .filter((account) => canBeTargetAccount(account) && !isPersonAccount(account))
        .forEach((target) => {
            if (list.some((entry) => entry.targetId === target.id && toNum(entry.monthlyNeed, 0) > 0.009)) return;
            const baseTransfer = activeOwnMonthlyTransfer(target.id);
            if (!baseTransfer) return;
            const overMonthly = roundMoney((imbalances || [])
                .filter((entry) => entry.accountId === target.id && toNum(entry.gapPerMonth, 0) > 0.009)
                .reduce((sum, entry) => sum + toNum(entry.gapPerMonth, 0), 0));
            if (overMonthly <= 0.5) return;
            const currentMonthlyAmount = roundMoney(toNum(baseTransfer.amount, 0));
            const reduction = Math.min(currentMonthlyAmount, overMonthly);
            if (reduction <= 0.5) return;
            const recommendedMonthlyAmount = roundMoney(Math.max(0, currentMonthlyAmount - reduction));
            const preferredDay = parseInt(baseTransfer?.dayOfMonth, 10) || 1;
            const effectiveFrom = isoDate(nextMonthlyExecutionDate(preferredDay, referenceDayStart()) || referenceDayStart());
            list.push({
                id: `${target.id}__${currentMonthKey()}__lower`,
                targetId: target.id,
                targetName: target.name,
                criticalMonth: currentMonthKey(),
                criticalLabel: monthLabel(currentMonthKey()),
                criticalDate: '',
                latestChangeDate: previousDateIso(effectiveFrom) || effectiveFrom,
                nextTransferExecutionDate: effectiveFrom,
                criticalMinDayDelta: 0,
                reason: 'Überdeckung in Beitragsplanung',
                monthlyNeed: roundMoney(-reduction),
                onceNeed: 0,
                preferredSourceId: baseTransfer.sourceAccountId || '',
                preferredSourceName: ACCOUNTS[baseTransfer.sourceAccountId]?.name || '-',
                recommendedTransferId: baseTransfer.id || '',
                currentMonthlyAmount,
                recommendedMonthlyAmount,
                effectiveFrom,
                onceDate: '',
                monthlyAllocations: [{ sourceId: baseTransfer.sourceAccountId || '', sourceName: ACCOUNTS[baseTransfer.sourceAccountId]?.name || '-', amount: roundMoney(-reduction), transferId: baseTransfer.id || '' }],
                onceAllocations: [],
                monthlyCovered: 0,
                onceCovered: 0,
                deviationWarning: Math.abs(reduction) > 0.009,
                actionType: 'lower_monthly',
                conservativeMode: true,
                fullyCovered: true,
                shortfall: 0
            });
        });
    return list
        .filter(Boolean)
        .sort((a, b) => String(a.criticalMonth).localeCompare(String(b.criticalMonth)) || Math.abs(toNum(b.monthlyNeed, 0) + toNum(b.onceNeed, 0)) - Math.abs(toNum(a.monthlyNeed, 0) + toNum(a.onceNeed, 0)));
}
function buildForecast(horizon = forecastHorizonMonths) {
    const normalizedHorizon = normalizeForecastHorizon(horizon, forecastHorizonMonths);
    const accounts = Object.values(ACCOUNTS);
    const alerts = [];
    const details = {};
    const ref = referenceDate();
    const startMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const baseSnapshots = latestSnapshots(startMonth);
    const monthSnapshots = latestSnapshotByAccountAndMonth();
    const balances = {};
    accounts.forEach((account) => {
        const allowSnapshot = accountUsesBuffer(account);
        balances[account.id] = allowSnapshot && baseSnapshots[account.id] ? toNum(baseSnapshots[account.id].value, 0) : 0;
    });
    let year = startMonth.getFullYear();
    let month = startMonth.getMonth() + 1;
    const timeline = [];
    const carryEvents = {};
    const endMonthDate = new Date(startMonth.getFullYear(), startMonth.getMonth() + normalizedHorizon - 1, 1);
    const endMonthKey = monthKey(endMonthDate.getFullYear(), endMonthDate.getMonth() + 1);

    for (let i = 0; i < normalizedHorizon; i += 1) {
        const key = monthKey(year, month);
        const bucket = { key, label: monthLabel(key), accounts: {} };
        const monthEvents = Array.isArray(carryEvents[key]) ? [...carryEvents[key]] : [];
        delete carryEvents[key];
        const routeEvent = (event) => {
            const eventDate = parseDate(event?.date);
            if (!eventDate || !event?.accountId) return;
            const eventKey = monthKey(eventDate.getFullYear(), eventDate.getMonth() + 1);
            if (eventKey !== key) {
                if (compareMonthKey(eventKey, key) >= 0 && compareMonthKey(eventKey, endMonthKey) <= 0) {
                    if (!Array.isArray(carryEvents[eventKey])) carryEvents[eventKey] = [];
                    carryEvents[eventKey].push(event);
                }
                return;
            }
            monthEvents.push(event);
        };

        Object.values(TRANSFERS).forEach((transfer) => {
            const exec = transferExecutionDateForForecast(transfer, year, month);
            const amount = toNum(transfer?.amount, 0);
            if (!exec || amount <= 0) return;
            routeEvent({ type: 'transfer-out', date: isoDate(exec), accountId: transfer.sourceAccountId, amount: -amount, priority: 10, label: `Transfer an ${ACCOUNTS[transfer.targetAccountId]?.name || '-'}`, note: transfer.note || '' });
            routeEvent({ type: 'transfer-in', date: isoDate(exec), accountId: transfer.targetAccountId, amount, priority: 20, label: `Transfer von ${ACCOUNTS[transfer.sourceAccountId]?.name || '-'}`, note: transfer.note || '' });
        });

        Object.values(ITEMS).forEach((item) => {
            const exec = getExecutionDateForMonth(item, year, month);
            const amount = toNum(item?.amount, 0);
            if (!exec || amount <= 0 || !item.accountId) return;
            const signed = item.typ === 'gutschrift' ? amount : -amount;
            routeEvent({ type: 'item', date: isoDate(exec), accountId: item.accountId, amount: signed, priority: signed >= 0 ? 20 : 10, label: item.title || '-', note: item.notes || '' });
            (Array.isArray(item.contributions) ? item.contributions : []).forEach((contrib) => {
                const intervalType = contrib.intervalType === 'inherit' ? item.intervalType : (contrib.intervalType || item.intervalType || 'monthly');
                const execContrib = getExecutionDateForMonth({ intervalType, startMonth: contrib.startMonth || item.startMonth, customMonths: contrib.customMonths || [], dayOfMonth: contrib.dayOfMonth || item.dayOfMonth, validFrom: contrib.validFrom || item.validFrom, validTo: contrib.validTo || item.validTo }, year, month);
                const cAmount = toNum(contrib?.amount, 0);
                if (!execContrib || cAmount <= 0) return;
                routeEvent({ type: 'contrib-in', date: isoDate(execContrib), accountId: item.accountId, amount: cAmount, priority: 20, label: `Beitrag ${ACCOUNTS[contrib.sourceAccountId]?.name || '-'}`, note: contrib.note || '' });
                routeEvent({ type: 'contrib-out', date: isoDate(execContrib), accountId: contrib.sourceAccountId, amount: -cAmount, priority: 10, label: `Beitrag für ${item.title || '-'}`, note: contrib.note || '' });
            });
        });

        Object.values(RECON).forEach((entry) => {
            if (!entry?.accountId || !entry?.date) return;
            const date = parseDate(entry.date);
            if (!date || date.getFullYear() !== year || date.getMonth() + 1 !== month) return;
            if (entry.type === 'manual') {
                const value = toNum(entry.value, 0);
                routeEvent({ type: 'manual', date: entry.date, accountId: entry.accountId, amount: value, priority: value >= 0 ? 20 : 10, label: 'Manuelle Korrektur', note: entry.note || '' });
            }
        });

        accounts.forEach((account) => {
            const snapshot = monthSnapshots[`${account.id}__${key}`];
            if (!snapshot || !accountUsesBuffer(account)) return;
            routeEvent({ type: 'snapshot', date: snapshot.date, accountId: account.id, mode: 'set', value: roundMoney(toNum(snapshot.value, 0)), priority: 99, label: 'Snapshot', note: snapshot.note || '' });
        });

        monthEvents.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (toNum(a.priority, 50) - toNum(b.priority, 50)) || String(a.label || '').localeCompare(String(b.label || '')) || String(a.accountId || '').localeCompare(String(b.accountId || '')));

        const accountState = {};
        accounts.forEach((account) => {
            const start = roundMoney(toNum(balances[account.id], 0));
            const minBuffer = accountMinBuffer(account);
            accountState[account.id] = { start, end: start, in: 0, out: 0, entries: [], minBuffer, minDayDelta: roundMoney(start - minBuffer), criticalDate: `${key}-01` };
        });

        monthEvents.forEach((event) => {
            const state = accountState[event.accountId];
            if (!state) return;
            if (event.mode === 'set') {
                state.end = roundMoney(toNum(event.value, state.end));
            } else {
                const amount = roundMoney(toNum(event.amount, 0));
                state.end = roundMoney(state.end + amount);
                if (amount >= 0) state.in = roundMoney(state.in + amount);
                else state.out = roundMoney(state.out + Math.abs(amount));
            }
            const dayDelta = roundMoney(state.end - state.minBuffer);
            if (dayDelta < state.minDayDelta) {
                state.minDayDelta = dayDelta;
                state.criticalDate = event.date;
            }
            const entryAmount = event.mode === 'set' ? state.end : roundMoney(toNum(event.amount, 0));
            state.entries.push({ type: event.type, date: event.date, label: event.label || '-', amount: entryAmount, note: event.note || '', postBalance: state.end });
        });

        accounts.forEach((account) => {
            const state = accountState[account.id] || { start: roundMoney(balances[account.id]), in: 0, out: 0, end: roundMoney(balances[account.id]), minBuffer: accountMinBuffer(account), minDayDelta: roundMoney(roundMoney(balances[account.id]) - accountMinBuffer(account)), criticalDate: `${key}-01`, entries: [] };
            const start = roundMoney(state.start);
            const inflow = roundMoney(state.in);
            const outflow = roundMoney(state.out);
            const end = roundMoney(state.end);
            balances[account.id] = end;
            const minBuffer = state.minBuffer;
            const delta = roundMoney(end - minBuffer);
            const minDayDelta = roundMoney(state.minDayDelta);
            const relevantTarget = isRelevantTargetAccount(account);
            let severity = 'ok';
            if (relevantTarget && minDayDelta < -0.009) severity = 'alarm';
            else if (relevantTarget && minBuffer > 0 && minDayDelta > 0.009 && minDayDelta < Math.max(25, minBuffer * 0.1)) severity = 'warn';
            if (severity !== 'ok' && relevantTarget) alerts.push({ severity, accountId: account.id, accountName: account.name, monthKey: key, endBalance: end, minBuffer, delta, minDayDelta, criticalDate: state.criticalDate });
            details[`${account.id}__${key}`] = { start, inflow, outflow, end, minBuffer, delta, minDayDelta, criticalDate: state.criticalDate, severity, entries: state.entries };
            bucket.accounts[account.id] = { start, inflow, outflow, end, minBuffer, delta, minDayDelta, criticalDate: state.criticalDate, severity };
        });

        timeline.push(bucket);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }

    const quality = buildQuality(alerts);
    const imbalances = buildContributionImbalances();
    const suggestionList = suggestions(timeline, imbalances);
    return { timeline, alerts, details, quality, setup: buildSetup(quality, alerts, imbalances), suggestions: suggestionList, imbalances, deviationWarnings: buildDeviationWarnings(suggestionList) };
}
function openDetail(title, html) { const t = el('ab2-detail-title'); const c = el('ab2-detail-content'); if (t) t.textContent = title; if (c) c.innerHTML = html; openModal('ab2-detail-modal'); }
function renderTags() {
    const host = el('ab2-active-search-tags');
    if (!host) return;
    const parts = [];
    if (filterState.negate) parts.push('<span class="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">NICHT</span>');
    if (filterState.joinMode === 'or') parts.push('<span class="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">OR</span>');
    if (filterState.status) parts.push(`<span class="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">Status: ${escapeHtml(filterState.status)}</span>`);
    if (filterState.typ) parts.push(`<span class="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">Typ: ${escapeHtml(filterState.typ)}</span>`);
    if (filterState.interval) parts.push(`<span class="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">Intervall: ${escapeHtml(filterState.interval)}</span>`);
    if (filterState.quick) parts.push(`<span class="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">Quick: ${escapeHtml(filterState.quick)}</span>`);
    filterTokens.forEach((token, index) => parts.push(`<button type="button" class="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200" data-remove-token="${index}">${escapeHtml(token)} ×</button>`));
    host.innerHTML = parts.join('');
}
function itemHasAlert(item, severity = '') { return FORECAST.alerts.some((alert) => alert.accountId === item?.accountId && (!severity || alert.severity === severity)); }
function setSelectOptions(select, options, value = '') { if (!select) return; const current = value || select.value || ''; select.innerHTML = options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join(''); select.value = current; }
function transferLinkingText(transfer) {
    return getTransferLinkedAllocations(transfer)
        .map((row) => `${transferLinkedTitleLabel(row.titleKey)} ${formatCurrency(row.amount)}`)
        .join(' ')
        .trim();
}

function transferAllocationSummaryLines(transfer) {
    return getTransferLinkedAllocations(transfer)
        .filter((row) => toNum(row.amount, 0) > 0)
        .map((row) => `${transferLinkedTitleLabel(row.titleKey)}: ${formatCurrency(row.amount)}`);
}

function transferDiffCss(diff) {
    if (diff < -0.009) return 'text-red-700';
    if (diff > 0.009) return 'text-amber-700';
    return 'text-emerald-700';
}

function itemCoverageSummary(item) {
    const direct = roundMoney((Array.isArray(item?.contributions) ? item.contributions : []).reduce((sum, row) => sum + toNum(row.amount, 0), 0));
    const transfer = roundMoney(Object.values(TRANSFERS).reduce((sum, plan) => sum + transferAmountForItem(plan, item), 0));
    const covered = roundMoney(direct + transfer);
    const diff = roundMoney(covered - toNum(item?.amount, 0));
    return { direct, transfer, covered, diff };
}

function accountTransferBudgetDiff(accountId) {
    const sum = Object.values(TRANSFERS)
        .filter((transfer) => transfer.sourceAccountId === accountId)
        .reduce((total, transfer) => total + transferBudgetDiff(transfer), 0);
    return roundMoney(sum);
}

function updateModalFilterButtons(prefix, selectedType) {
    const keys = ['all', 'bank', 'person'];
    keys.forEach((key) => {
        const btn = el(`ab2-${prefix}-filter-${key}`);
        if (!btn) return;
        const active = selectedType === key;
        btn.classList.toggle('bg-blue-600', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('hover:bg-blue-700', active);
        btn.classList.toggle('bg-gray-100', !active);
        btn.classList.toggle('text-gray-700', !active);
        btn.classList.toggle('hover:bg-gray-200', !active);
    });
}
function qualityEntry(accountId) { return FORECAST.quality.find((entry) => entry.accountId === accountId) || null; }
function forecastCss(severity) { if (severity === 'alarm') return 'bg-red-50 border-red-200 text-red-700'; if (severity === 'warn') return 'bg-amber-50 border-amber-200 text-amber-700'; return 'bg-emerald-50 border-emerald-200 text-emerald-700'; }
function matchItemToken(item, token) {
    const value = normalizeSearchText(token);
    const numeric = value.match(/^(betrag|puffer|diff|differenz)(<=|>=|=|<|>)(-?\d+(?:\.\d+)?)$/);
    if (numeric) {
        const account = ACCOUNTS[item.accountId] || {};
        const row = FORECAST.timeline[0]?.accounts[item.accountId] || {};
        const actual = numeric[1] === 'betrag' ? toNum(item.amount, 0) : numeric[1] === 'puffer' ? accountMinBuffer(account) : toNum(row.minDayDelta, toNum(row.delta, 0));
        return compareNumber(actual, numeric[2], toNum(numeric[3], 0));
    }
    const structured = value.match(/^([^:]+):(.+)$/);
    if (structured) {
        const key = structured[1];
        const search = structured[2];
        const account = ACCOUNTS[item.accountId] || {};
        if (key === 'konto') return normalizeSearchText(`${account.name || ''} ${account.bank || ''}`).includes(search);
        if (key === 'titel') return normalizeSearchText(item.title || '').includes(search);
        if (key === 'typ') return normalizeSearchText(item.typ || '').includes(search);
        if (key === 'status') return normalizeSearchText(itemStatus(item).key).includes(search);
        if (key === 'intervall') return normalizeSearchText(intervalLabel(item.intervalType, item.customMonths || [])).includes(search);
        if (key === 'alarm') return search === 'ja' ? itemHasAlert(item, 'alarm') : (search === 'nein' ? !itemHasAlert(item, 'alarm') : false);
        if (key === 'warnung') return search === 'ja' ? itemHasAlert(item, 'warn') : (search === 'nein' ? !itemHasAlert(item, 'warn') : false);
        if (key === 'beitrag') return search === 'ja' ? contributionTotal(item) > 0 : (search === 'nein' ? contributionTotal(item) <= 0 : false);
        return false;
    }
    const account = ACCOUNTS[item.accountId] || {};
    return normalizeSearchText(`${item.title || ''} ${item.notes || ''} ${account.name || ''} ${account.bank || ''} ${item.typ || ''} ${intervalLabel(item.intervalType, item.customMonths || [])} ${formatCurrency(item.amount)} ${formatSignedCurrency(itemNetEffect(item))}`).includes(value);
}
function matchesFilters(item) {
    const checks = [];
    if (filterState.status) checks.push(itemStatus(item).key === filterState.status);
    if (filterState.typ) checks.push(String(item.typ || '') === filterState.typ);
    if (filterState.interval) checks.push(String(item.intervalType || '') === filterState.interval);
    if (filterState.quick === 'critical') checks.push(itemHasAlert(item));
    if (filterState.quick === 'contrib') checks.push(contributionTotal(item) > 0);
    if (filterState.quick === 'planned') checks.push(itemStatus(item).key === 'geplant');
    if (filterState.quick === 'errors') checks.push(itemStatus(item).key === 'fehler');
    if (filterTokens.length) {
        const tokenChecks = filterTokens.map((token) => matchItemToken(item, token));
        checks.push(filterState.joinMode === 'or' ? tokenChecks.some(Boolean) : tokenChecks.every(Boolean));
    }
    const ok = checks.every(Boolean);
    return filterState.negate ? !ok : ok;
}
function sortItems(list) {
    return [...list].sort((a, b) => {
        if (filterState.sort === 'amount_desc') return toNum(b.amount, 0) - toNum(a.amount, 0);
        if (filterState.sort === 'amount_asc') return toNum(a.amount, 0) - toNum(b.amount, 0);
        if (filterState.sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
        if (filterState.sort === 'next') return (nextExecutionDate(a)?.getTime() || Number.MAX_SAFE_INTEGER) - (nextExecutionDate(b)?.getTime() || Number.MAX_SAFE_INTEGER);
        const aScore = itemHasAlert(a) ? 1 : 0;
        const bScore = itemHasAlert(b) ? 1 : 0;
        return bScore - aScore || String(a.title || '').localeCompare(String(b.title || ''));
    });
}
function populateSelects() {
    const accounts = Object.values(ACCOUNTS).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const accountOptions = [{ value: '', label: 'Bitte wählen...' }, ...accounts.map((account) => ({ value: account.id, label: `${account.name || '-'}${account.bank ? ` · ${account.bank}` : ''}` }))];
    const reconAccountOptions = [{ value: '', label: 'Bitte wählen...' }, ...accounts.filter((account) => !isPersonAccount(account)).map((account) => ({ value: account.id, label: `${account.name || '-'}${account.bank ? ` · ${account.bank}` : ''}` }))];
    const sourceOptions = [{ value: '', label: 'Bitte wählen...' }, ...accounts.filter(canBeSourceAccount).map((account) => ({ value: account.id, label: `${account.name || '-'}${isPersonAccount(account) ? ' · Person' : ''}` }))];
    const targetOptions = [{ value: '', label: 'Bitte wählen...' }, ...accounts.filter(canBeTargetAccount).map((account) => ({ value: account.id, label: `${account.name || '-'}${isPersonAccount(account) ? ' · Person' : ''}` }))];
    setSelectOptions(el('ab2-item-account'), accountOptions);
    setSelectOptions(el('ab2-transfer-source'), sourceOptions);
    setSelectOptions(el('ab2-transfer-target'), targetOptions);
    setSelectOptions(el('ab2-recon-account'), reconAccountOptions);
    document.querySelectorAll('.ab2-contrib-source').forEach((select) => setSelectOptions(select, sourceOptions, select.value || ''));
    populateTransferLinkingOptions();
    updateTransferLinkedTitleAllocationsUI();
    updateTransferLinkingBudgetState();
}
function renderDashboard() {
    const items = Object.values(ITEMS);
    const hasTargets = Object.values(ACCOUNTS).some((account) => isRelevantTargetAccount(account));
    const openActions = Object.values(ACTIONS).filter((entry) => String(entry?.status || 'open') === 'open');
    const imbalanceWarn = (FORECAST.imbalances || []).filter((entry) => entry.severity === 'warn').length;
    const imbalanceAlarm = (FORECAST.imbalances || []).filter((entry) => entry.severity === 'alarm').length;
    const counts = {
        accounts: Object.keys(ACCOUNTS).length,
        active: items.filter((item) => itemStatus(item).key === 'aktiv').length,
        planned: items.filter((item) => itemStatus(item).key === 'geplant').length,
        past: items.filter((item) => itemStatus(item).key === 'vergangen').length,
        errors: items.filter((item) => itemStatus(item).key === 'fehler').length,
        warnings: FORECAST.alerts.filter((alert) => alert.severity === 'warn').length + imbalanceWarn + (FORECAST.deviationWarnings || []).length + openActions.length,
        alarms: FORECAST.alerts.filter((alert) => alert.severity === 'alarm').length + imbalanceAlarm
    };
    const simInput = el('ab2-simulation-datum');
    if (simInput) simInput.value = simulationDate ? isoDate(simulationDate) : '';
    setForecastHorizon(forecastHorizonMonths, false);
    const forecastTitle = el('ab2-forecast-title');
    if (forecastTitle) forecastTitle.innerHTML = `${forecastHorizonMonths}-Monate-Kontostandsprognose ${helpButton('ab2-help-forecast')}`;
    updateSimulationWarning();
    const total = el('ab2-total-status');
    if (total) {
        total.textContent = counts.alarms || counts.errors ? 'ALARM' : (counts.warnings ? 'HINWEIS' : (counts.accounts || items.length ? 'STABIL' : 'AUFBAU'));
        total.className = `px-4 py-2 rounded-lg font-bold text-white ${counts.alarms || counts.errors ? 'bg-red-500' : counts.warnings ? 'bg-amber-500' : counts.accounts || items.length ? 'bg-green-500' : 'bg-slate-500'}`;
    }
    [['accounts', 'accounts'], ['active', 'active'], ['planned', 'planned'], ['past', 'past'], ['errors', 'errors'], ['warnings', 'warnings'], ['alarms', 'alarms']].forEach(([domKey, valueKey]) => {
        const num = el(`ab2-stat-${domKey}`);
        const card = el(`ab2-stat-card-${domKey}`);
        if (num) num.textContent = String(counts[valueKey] || 0);
        if (card) card.classList.toggle('ring-2', (counts[valueKey] || 0) > 0);
    });
    const setup = el('ab2-setup-panel');
    if (setup) {
        const setupOrder = [
            { key: 'accounts', title: 'Konten' },
            { key: 'target_accounts', title: 'Zielkonten' },
            { key: 'items', title: 'Einträge' },
            { key: 'quality', title: 'Datenqualität' },
            { key: 'imbalances', title: 'Titel-Beiträge' },
            { key: 'forecast', title: 'Kontostandsprognose' }
        ];
        const setupMap = new Map((FORECAST.setup || []).map((entry) => [entry.key, entry]));
        const setupRows = setupOrder.map((column) => setupMap.get(column.key) || { key: column.key, title: column.title, ok: false, text: 'Keine Daten' });
        const header = setupRows.map((entry) => `<th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide text-slate-600">${escapeHtml(entry.title || '-')}</th>`).join('');
        const body = setupRows.map((entry) => {
            const tone = entry.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700';
            return `<td class="px-2 py-2 align-top"><button type="button" class="w-full text-left rounded-lg border ${tone} p-2 transition" data-setup-key="${escapeHtml(entry.key || '')}"><div class="text-[10px] font-bold">${entry.ok ? 'OK' : 'PRÜFEN'}</div><div class="mt-1 text-xs text-slate-700">${escapeHtml(entry.text || '-')}</div></button></td>`;
        }).join('');
        setup.innerHTML = `<div class="rounded-xl border border-slate-200 bg-white overflow-hidden"><div class="overflow-x-auto"><table class="ab2-simple-table w-full min-w-[930px] text-sm"><thead class="bg-slate-100"><tr>${header}</tr></thead><tbody><tr>${body}</tr></tbody></table></div></div>`;
    }
    const quality = el('ab2-quality-banner');
    const notes = FORECAST.quality
        .filter((entry) => entry.status !== 'ok' && isRelevantTargetAccount(ACCOUNTS[entry.accountId]))
        .map((entry) => `${ACCOUNTS[entry.accountId]?.name || '-'}: ${entry.text}`);
    const deviationNotes = (FORECAST.deviationWarnings || []).map((entry) => entry.text);
    const actionNotes = openActions
        .slice(0, 4)
        .map((entry) => `${entry.targetName || '-'}: offen bis Erledigt${entry.latestChangeDate ? ` · spätestens ${formatDate(entry.latestChangeDate)}` : ''}`);
    const dailyAlertNotes = (FORECAST.alerts || [])
        .slice()
        .sort((a, b) => String(a.monthKey || '').localeCompare(String(b.monthKey || '')) || String(a.accountName || '').localeCompare(String(b.accountName || '')))
        .slice(0, 4)
        .map((alert) => `${alert.accountName || '-'}: Min Tages-Δ ${formatSignedCurrency(alert.minDayDelta)}${alert.criticalDate ? ` am ${formatDate(alert.criticalDate)}` : ''}`);
    if (quality) {
        const qualityText = notes.length ? `<strong>Datenqualität beachten:</strong> ${escapeHtml(notes.join(' · '))}` : '';
        const deviationText = deviationNotes.length ? `<div class="mt-1"><strong>Dauerauftrag-Abweichung:</strong> ${escapeHtml(deviationNotes.join(' · '))}</div>` : '';
        const dailyText = hasTargets
            ? `<div class="mt-1"><strong>Tageslogik (Abbuchung vor Eingang):</strong> ${escapeHtml(dailyAlertNotes.length ? dailyAlertNotes.join(' · ') : `Keine Lücke unter Mindestpuffer in der ${forecastHorizonMonths}-Monats-Prognose.`)}</div>`
            : '';
        const actionsText = actionNotes.length
            ? `<div class="mt-1"><strong>Offene Aktionen (Bestätigung ausstehend):</strong> ${escapeHtml(actionNotes.join(' · '))}</div>`
            : '';
        quality.innerHTML = `${qualityText}${deviationText}${dailyText}${actionsText}`;
        quality.classList.toggle('hidden', !notes.length && !deviationNotes.length && !hasTargets && !actionNotes.length);
    }
    const imbalance = el('ab2-imbalance-banner');
    if (imbalance) {
        const rows = (FORECAST.imbalances || []).slice(0, 4).map((entry) => `${entry.title}: ${entry.gapPerMonth < 0 ? 'zu wenig' : 'zu viel'} (${formatSignedCurrency(entry.gapPerMonth)} / Monat)`).join(' · ');
        imbalance.innerHTML = rows ? `<strong>Titel-/Beitrags-Ungleichgewicht:</strong> ${escapeHtml(rows)}` : '';
        imbalance.classList.toggle('hidden', !rows);
    }
    const overview = el('ab2-account-overview');
    if (overview) overview.innerHTML = Object.values(ACCOUNTS).length ? Object.values(ACCOUNTS).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((account) => {
        const row = FORECAST.timeline[0]?.accounts[account.id] || {};
        const q = qualityEntry(account.id);
        return `<div class="rounded-lg border ${q?.status === 'alarm' ? 'border-red-200 bg-red-50' : q?.status === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'} p-3"><div class="flex items-start justify-between gap-2"><div><div class="text-sm font-bold text-gray-800">${escapeHtml(account.name || '-')}</div><div class="text-xs text-gray-500">${escapeHtml(isPersonAccount(account) ? 'Person / Quelle' : `${account.bank || 'Bankkonto'} · ${normalizeAccountRole(account)}`)}</div></div><span class="text-[10px] px-2 py-1 rounded-full ${q?.status === 'alarm' ? 'bg-red-100 text-red-700' : q?.status === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${escapeHtml(q?.text || 'aktuell')}</span></div><div class="grid grid-cols-2 gap-2 mt-3 text-xs"><div><div class="text-gray-500">Stand</div><div class="font-bold text-gray-800">${formatCurrency(row.end)}</div></div><div><div class="text-gray-500">Min Tages-Δ</div><div class="font-bold ${toNum(row.minDayDelta, toNum(row.delta, 0)) < 0 ? 'text-red-700' : 'text-emerald-700'}">${formatSignedCurrency(toNum(row.minDayDelta, toNum(row.delta, 0)))}</div></div></div></div>`;
    }).join('') : '<p class="text-sm text-gray-400 italic">Noch keine Konten/Quellen.</p>';
    const forecast = el('ab2-forecast-overview');
    if (forecast) {
        const monitored = Object.values(ACCOUNTS).filter((account) => canBeTargetAccount(account) && !isPersonAccount(account));
        if (!monitored.length || !FORECAST.timeline.length) {
            forecast.innerHTML = '<p class="text-sm text-gray-400 italic">Keine Forecast-Daten.</p>';
        } else {
            const monthlyBoxes = FORECAST.timeline.map((bucket) => {
                const total = roundMoney(monitored.reduce((sum, account) => sum + toNum(bucket.accounts[account.id]?.end, 0), 0));
                const hasAlarm = FORECAST.alerts.some((alert) => alert.monthKey === bucket.key && alert.severity === 'alarm');
                const hasWarn = !hasAlarm && FORECAST.alerts.some((alert) => alert.monthKey === bucket.key && alert.severity === 'warn');
                const tone = hasAlarm ? 'border-red-200 bg-red-50 text-red-700' : (hasWarn ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700');
                return `<button type="button" class="w-full rounded-lg border ${tone} px-2 py-2 text-left" data-forecast-month="${bucket.key}"><div class="text-[10px] sm:text-xs font-bold uppercase tracking-wide text-gray-600">${escapeHtml(bucket.label)}</div><div class="mt-1 text-sm sm:text-base font-bold">${formatCurrency(total)}</div></button>`;
            });
            forecast.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">${monthlyBoxes.join('')}</div>`;
        }
    }
    const forecastSetup = (FORECAST.setup || []).find((entry) => entry.key === 'forecast') || null;
    const forecastOk = forecastSetup ? !!forecastSetup.ok : true;
    const forecastState = el('ab2-forecast-state');
    if (forecastState) {
        forecastState.className = `inline-flex px-2 py-1 rounded-full text-[11px] font-bold ${forecastOk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`;
        forecastState.textContent = forecastOk ? (hasTargets ? 'ALLE OK · keine Tageslücke' : 'ALLE OK') : `PRÜFEN: ${forecastSetup?.text || 'Auffälligkeiten'}`;
    }
    const defaultForecastExpanded = !forecastOk;
    const expandedForecast = forecastExpandedOverride === null ? defaultForecastExpanded : !!forecastExpandedOverride;
    setForecastExpanded(expandedForecast, false);
    const glossary = el('ab2-glossary');
    if (glossary && !glossary.innerHTML.trim()) glossary.innerHTML = `<div class="rounded-lg border border-blue-100 bg-blue-50 p-3"><div class="font-bold text-blue-900">Snapshot</div><div class="mt-1 text-blue-800">Ein echter Kontostand zu einem Datum. Er überschreibt den reinen Rechenwert für diesen Monat.</div></div><div class="rounded-lg border border-blue-100 bg-blue-50 p-3"><div class="font-bold text-blue-900">Mindestpuffer</div><div class="mt-1 text-blue-800">Betrag, der auf einem Bankkonto mindestens übrig bleiben soll.</div></div><div class="rounded-lg border border-blue-100 bg-blue-50 p-3"><div class="font-bold text-blue-900">Manuell</div><div class="mt-1 text-blue-800">Einmalige Korrektur für Zu- oder Abgang in genau einem Monat.</div></div><div class="rounded-lg border border-blue-100 bg-blue-50 p-3"><div class="font-bold text-blue-900">Beitrag</div><div class="mt-1 text-blue-800">Ein anderes Konto oder eine Person übernimmt einen Teil der Belastung.</div></div>`;
    renderSuggestionsModal();
}
function renderTable() {
    const body = el('ab2-table-body');
    if (!body) return;
    const items = sortItems(Object.values(ITEMS).filter(matchesFilters));
    if (!items.length) {
        body.innerHTML = '<tr><td colspan="11" class="px-4 py-8 text-center text-gray-400 italic">Keine Einträge mit diesen Filtern.</td></tr>';
        return;
    }
    body.innerHTML = items.map((item) => {
        const status = itemStatus(item);
        const account = ACCOUNTS[item.accountId] || {};
        const next = nextExecutionDate(item);
        const yearly = roundMoney(yearlyHitCount(item) * toNum(item.amount, 0));
        const effect = itemNetEffect(item);
        return `<tr class="${itemHasAlert(item) ? 'bg-red-50/40' : ''} hover:bg-blue-50/40 transition cursor-pointer" data-item-row="${item.id}"><td class="px-3 py-3 whitespace-nowrap"><span class="px-2 py-1 rounded-full text-xs font-bold ${status.css}">${status.label}</span></td><td class="px-3 py-3"><div class="font-bold text-gray-800 whitespace-nowrap">${escapeHtml(item.title || '-')}</div><div class="text-xs text-gray-500">${escapeHtml(item.notes || '')}</div></td><td class="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">${escapeHtml(account.name || '-')}</td><td class="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">${escapeHtml(item.typ === 'belastung' ? 'Ausgabe' : item.typ === 'gutschrift' ? 'Einnahme' : (item.typ || '-'))}</td><td class="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">${escapeHtml(intervalLabel(item.intervalType, item.customMonths || []))}</td><td class="px-3 py-3 text-sm font-bold text-gray-800 whitespace-nowrap">${formatCurrency(item.amount)}</td><td class="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">${next ? formatDate(next) : '-'}</td><td class="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">${formatCurrency(yearly)}</td><td class="px-3 py-3 text-sm font-bold ${effect < 0 ? 'text-red-700' : 'text-emerald-700'} whitespace-nowrap">${formatSignedCurrency(effect)}</td><td class="px-3 py-3 text-sm text-gray-700 whitespace-nowrap">${formatDate(item.validFrom)}${item.validTo ? ` → ${formatDate(item.validTo)}` : ''}</td><td class="px-3 py-3 text-center whitespace-nowrap"><div class="flex gap-1 justify-center"><button type="button" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs" data-item-edit="${item.id}">Bearbeiten</button></div></td></tr>`;
    }).join('');
}
function renderAccounts() {
    const host = el('ab2-accounts-list');
    if (!host) return;
    updateModalFilterButtons('accounts', accountListFilterState.type);
    const search = normalizeSearchText(accountListFilterState.query);
    const baseAccounts = Object.values(ACCOUNTS)
        .filter((account) => accountListFilterState.type === 'all' || normalizeAccountType(account) === accountListFilterState.type)
        .filter((account) => !search || normalizeSearchText(`${account.name || ''} ${account.bank || ''} ${account.iban || ''} ${formatCurrency(accountMinBuffer(account))}`).includes(search))
        .sort((a, b) => newestEntityMs(b) - newestEntityMs(a) || String(a.name || '').localeCompare(String(b.name || '')));
    const accountStatuses = new Map(baseAccounts.map((account) => [account.id, accountPlanStatus(account).key]));
    const accountCounts = { active: 0, planned: 0, past: 0 };
    accountStatuses.forEach((status) => {
        if (status === 'geplant') accountCounts.planned += 1;
        else if (status === 'vergangen') accountCounts.past += 1;
        else accountCounts.active += 1;
    });
    updateStatusVisibilityUi('accounts', accountListFilterState, accountCounts);
    const accounts = baseAccounts.filter((account) => {
        if (accountModalViewMode === 'edit' && editingAccountId === account.id) return true;
        return includeWithStatusVisibility(accountStatuses.get(account.id) || 'aktiv', accountListFilterState);
    });
    const visibleAccounts = accountModalViewMode === 'edit' && editingAccountId
        ? accounts.filter((account) => account.id === editingAccountId)
        : accounts;
    const renderAccountCard = (account) => {
        const person = isPersonAccount(account);
        const row = FORECAST.timeline[0]?.accounts[account.id] || {};
        const quality = qualityEntry(account.id);
        const itemCount = Object.values(ITEMS).filter((item) => item.accountId === account.id).length;
        const transferCount = Object.values(TRANSFERS).filter((transfer) => transfer.sourceAccountId === account.id || transfer.targetAccountId === account.id).length;
        const transferDiff = accountTransferBudgetDiff(account.id);
        const latest = latestSnapshots()[account.id] || null;
        const amountText = latest ? formatCurrency(latest.value) : 'kein Betrag';
        const worstDayDelta = toNum(row.minDayDelta, toNum(row.delta, 0));
        const worstDayText = `Tages-Δ: ${formatSignedCurrency(worstDayDelta)}`;
        const transferText = `Transfer-Δ: ${formatSignedCurrency(transferDiff)}`;
        const updatedText = formatEntityUpdateTime(account);
        const active = editingAccountId === account.id;
        const cardTone = active ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-slate-200 bg-white hover:border-blue-300';
        const controlButton = person ? `<button type="button" class="px-2 py-1 bg-violet-100 text-violet-700 rounded text-xs" data-account-control="${account.id}">Kontrolle</button>` : '';
        const metricInfoButton = (metricKey) => `<button type="button" class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] leading-none" data-account-metric-info="${metricKey}" data-account-id="${escapeHtml(account.id || '')}" title="Bedeutung anzeigen">i</button>`;
        return `<div class="rounded-xl border ${cardTone} p-3 transition" data-account-card="${account.id}"><div class="flex items-start justify-between gap-2"><div><div class="text-sm font-bold text-slate-800">${escapeHtml(account.name || '-')}</div><div class="text-[11px] text-slate-500">${escapeHtml(person ? 'Person / Quelle' : `${account.bank || 'Bankkonto'} · ${normalizeAccountRole(account)}`)}</div></div><span class="px-2 py-1 rounded-full text-[10px] ${quality?.status === 'alarm' ? 'bg-red-100 text-red-700' : quality?.status === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${escapeHtml(quality?.text || 'aktuell')}</span></div><div class="mt-3 text-xs"><div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center"><div class="text-[10px] uppercase tracking-wide text-slate-500">Aktueller Kontostand</div><div class="mt-0.5 text-base font-extrabold text-slate-800 tabular-nums">${amountText}</div></div><div class="mt-2 flex items-center gap-1 font-bold ${worstDayDelta < 0 ? 'text-red-700' : 'text-emerald-700'}"><span>${worstDayText}</span>${metricInfoButton('day')}</div><div class="mt-1 flex items-center gap-1 ${transferDiffCss(transferDiff)} font-bold"><span>${transferText}</span>${metricInfoButton('transfer')}</div><div class="mt-1 text-slate-600">${itemCount} Einträge · ${transferCount} Transfers</div><div class="mt-1 text-[11px] text-slate-500">Zuletzt geändert: ${updatedText}</div></div><div class="mt-3 flex flex-wrap gap-1 justify-end">${controlButton}<button type="button" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs" data-account-edit="${account.id}">Bearbeiten</button><button type="button" class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs" data-account-delete="${account.id}">Löschen</button></div></div>`;
    };
    const bankCards = visibleAccounts.filter((account) => !isPersonAccount(account)).map(renderAccountCard).join('');
    const personCards = visibleAccounts.filter((account) => isPersonAccount(account)).map(renderAccountCard).join('');
    host.innerHTML = `<div class="space-y-3"><button type="button" data-account-new="1" class="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-4 text-left hover:bg-blue-100 transition"><div class="text-sm font-extrabold text-blue-800">+ NEU</div><div class="text-xs text-blue-700">Neues Konto oder neue Person anlegen</div></button><div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><div class="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Bankkonten (${visibleAccounts.filter((a) => !isPersonAccount(a)).length})</div><div class="grid grid-cols-1 md:grid-cols-2 gap-2">${bankCards || '<div class="text-sm text-slate-400 italic">Keine Bankkonten vorhanden.</div>'}</div></div><div class="rounded-xl border border-violet-200 bg-violet-50 p-3"><div class="text-xs font-bold uppercase tracking-wide text-violet-700 mb-2">Personen (${visibleAccounts.filter((a) => isPersonAccount(a)).length})</div><div class="grid grid-cols-1 md:grid-cols-2 gap-2">${personCards || '<div class="text-sm text-violet-400 italic">Keine Personen vorhanden.</div>'}</div></div></div>`;
    setAccountSplitMode(accountSplitMode, false);
    applyModalViewState();
}
function renderTransfers() {
    const host = el('ab2-transfers-list');
    if (!host) return;
    updateModalFilterButtons('transfers', transferListFilterState.type);
    const search = normalizeSearchText(transferListFilterState.query);
    const baseTransfers = Object.values(TRANSFERS)
        .filter((transfer) => {
            if (transferListFilterState.type === 'all') return true;
            const source = ACCOUNTS[transfer.sourceAccountId];
            const target = ACCOUNTS[transfer.targetAccountId];
            const person = isPersonAccount(source) || isPersonAccount(target);
            return transferListFilterState.type === 'person' ? person : !person;
        })
        .filter((transfer) => !search || normalizeSearchText(`${ACCOUNTS[transfer.sourceAccountId]?.name || ''} ${ACCOUNTS[transfer.targetAccountId]?.name || ''} ${transfer.note || ''} ${transferLinkingText(transfer)} ${formatCurrency(transfer.amount)} ${intervalLabel(transfer.intervalType, transfer.customMonths || [])}`).includes(search))
        .sort((a, b) => newestEntityMs(b) - newestEntityMs(a) || String(ACCOUNTS[a.sourceAccountId]?.name || '').localeCompare(String(ACCOUNTS[b.sourceAccountId]?.name || '')));
    const transferStatuses = new Map(baseTransfers.map((transfer) => [transfer.id, transferPlanStatus(transfer).key]));
    const transferCounts = { active: 0, planned: 0, past: 0 };
    transferStatuses.forEach((status) => {
        if (status === 'geplant') transferCounts.planned += 1;
        else if (status === 'vergangen') transferCounts.past += 1;
        else transferCounts.active += 1;
    });
    updateStatusVisibilityUi('transfers', transferListFilterState, transferCounts);
    const transfers = baseTransfers.filter((transfer) => {
        if (transferModalViewMode === 'edit' && editingTransferId === transfer.id) return true;
        return includeWithStatusVisibility(transferStatuses.get(transfer.id) || 'aktiv', transferListFilterState);
    });
    const visibleTransfers = transferModalViewMode === 'edit' && editingTransferId
        ? transfers.filter((transfer) => transfer.id === editingTransferId)
        : transfers;
    const cards = visibleTransfers.map((transfer) => {
        const source = ACCOUNTS[transfer.sourceAccountId] || {};
        const target = ACCOUNTS[transfer.targetAccountId] || {};
        const targetAlert = FORECAST.alerts.find((alert) => alert.accountId === transfer.targetAccountId);
        const allocationLines = transferAllocationSummaryLines(transfer);
        const planned = transferPlannedAmount(transfer);
        const diff = transferBudgetDiff(transfer);
        const active = editingTransferId === transfer.id;
        const cardTone = active ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-300' : 'border-slate-200 bg-white hover:border-blue-300';
        const stateText = targetAlert ? `${targetAlert.severity} ${monthLabel(targetAlert.monthKey)}` : 'stabil';
        const linkedText = allocationLines.length ? allocationLines.join(' | ') : 'Keine Zahlungsgrund-Zuordnung';
        const noteLine = transfer.note ? `<div class="mt-1 text-xs text-slate-600">${escapeHtml(transfer.note)}</div>` : '';
        const updatedText = formatEntityUpdateTime(transfer);
        return `<div class="rounded-xl border ${cardTone} p-3 transition" data-transfer-card="${transfer.id}"><div class="flex items-start justify-between gap-2"><div><div class="text-sm font-bold text-slate-800">${escapeHtml(source.name || '-')} → ${escapeHtml(target.name || '-')}</div><div class="text-[11px] text-slate-500">${escapeHtml(intervalLabel(transfer.intervalType, transfer.customMonths || []))} · Nächste ${nextExecutionDate(transfer) ? formatDate(nextExecutionDate(transfer)) : '-'}</div></div><span class="px-2 py-1 rounded-full text-[10px] ${targetAlert?.severity === 'alarm' ? 'bg-red-100 text-red-700' : targetAlert?.severity === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${escapeHtml(stateText)}</span></div><div class="mt-3 text-xs text-slate-700"><div class="font-bold text-slate-800">Betrag: ${formatCurrency(transfer.amount)}</div><div class="mt-1">Verplant ${formatCurrency(planned)} · <span class="font-bold ${transferDiffCss(diff)}">Differenz ${formatSignedCurrency(diff)}</span></div></div><div class="mt-1 text-xs text-indigo-700">${escapeHtml(linkedText)}</div>${noteLine}<div class="mt-1 text-[11px] text-slate-500">Zuletzt geändert: ${updatedText}</div><div class="mt-3 flex flex-wrap justify-end gap-1"><button type="button" class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs" data-transfer-abtausch-open="${transfer.id}">Abtausch</button><button type="button" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs" data-transfer-edit="${transfer.id}">Bearbeiten</button><button type="button" class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs" data-transfer-delete="${transfer.id}">Löschen</button></div></div>`;
    }).join('');
    host.innerHTML = `<div class="space-y-3"><button type="button" data-transfer-new="1" class="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-4 text-left hover:bg-blue-100 transition"><div class="text-sm font-extrabold text-blue-800">+ NEU</div><div class="text-xs text-blue-700">Neuen Dauerauftrag / neue Überweisung anlegen</div></button><div class="grid grid-cols-1 md:grid-cols-2 gap-2">${cards || '<p class="text-sm text-gray-400 italic">Noch keine Daueraufträge / Überweisungen.</p>'}</div></div>`;
    setTransferSplitMode(transferSplitMode, false);
    applyModalViewState();
}
function renderRecon() {
    const host = el('ab2-recon-list');
    if (!host) return;
    const recons = Object.values(RECON).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || newestEntityMs(b) - newestEntityMs(a));
    const visibleRecons = reconModalViewMode === 'edit' && editingReconId
        ? recons.filter((entry) => entry.id === editingReconId)
        : recons;
    const reconCard = (entry, badgeText = '', cardTone = 'border-gray-200 bg-gray-50') => {
        const recordedAt = formatEntityUpdateTime(entry, entry.date);
        const badge = badgeText ? `<div class="mb-1 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">${badgeText}</div>` : '';
        return `<div class="rounded-lg border ${cardTone} p-2" data-recon-card="${entry.id}">${badge}<div class="flex items-start justify-between gap-2"><div><div class="font-bold text-gray-800 text-sm">${escapeHtml(ACCOUNTS[entry.accountId]?.name || '-')}</div><div class="text-[11px] text-gray-500">${entry.type === 'snapshot' ? 'Snapshot (setzt Kontostand)' : 'Manuell (einmalige Korrektur)'} · Datum ${formatDate(entry.date)} · Uhrzeit ${recordedAt.split(' ')[1] || '--:--'}</div><div class="text-[11px] text-gray-500">Zuletzt geändert: ${recordedAt}</div></div><div class="flex gap-1"><button type="button" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs" data-recon-edit="${entry.id}">Bearbeiten</button><button type="button" class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs" data-recon-delete="${entry.id}">Löschen</button></div></div><div class="mt-1 text-sm font-bold ${entry.type === 'snapshot' ? 'text-blue-700' : toNum(entry.value, 0) < 0 ? 'text-red-700' : 'text-emerald-700'}">${entry.type === 'snapshot' ? formatCurrency(entry.value) : formatSignedCurrency(entry.value)}</div><div class="text-xs text-gray-600 mt-0.5">${escapeHtml(entry.note || '')}</div></div>`;
    };
    let content = '<p class="text-sm text-gray-400 italic">Noch keine Abgleiche.</p>';
    if (visibleRecons.length) {
        if (reconModalViewMode === 'edit' && editingReconId) {
            content = reconCard(visibleRecons[0], 'Ausgewählter Eintrag', 'border-blue-200 bg-blue-50');
        } else {
            const currentEntry = visibleRecons[0] || null;
            const olderEntries = visibleRecons.slice(1);
            const shownOlder = olderEntries.slice(0, reconOlderVisibleCount);
            const hasMore = olderEntries.length > shownOlder.length;
            const currentBlock = currentEntry
                ? `<div class="space-y-1"><div class="text-xs font-bold uppercase tracking-wide text-emerald-700">Aktueller Eintrag (neuester)</div>${reconCard(currentEntry, 'Aktuell', 'border-emerald-200 bg-emerald-50')}</div>`
                : '';
            const olderBlock = shownOlder.length
                ? `<div class="space-y-1"><div class="text-xs font-bold uppercase tracking-wide text-slate-600">Ältere Einträge</div>${shownOlder.map((entry) => reconCard(entry, 'Älter', 'border-slate-200 bg-slate-50')).join('')}</div>`
                : '';
            const loadMoreBtn = hasMore
                ? `<button type="button" data-recon-load-more="1" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100">Weitere anzeigen (+5)</button>`
                : '';
            content = `<div class="space-y-2">${currentBlock}${olderBlock}${loadMoreBtn}</div>`;
        }
    }
    host.innerHTML = `<div class="space-y-2"><button type="button" data-recon-new="1" class="w-full rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-3 text-left hover:bg-emerald-100 transition"><div class="text-sm font-extrabold text-emerald-800">+ NEU</div><div class="text-xs text-emerald-700">Neuen Abgleich anlegen</div></button>${content}</div>`;
    setReconSplitMode(reconSplitMode, false);
    applyModalViewState();
}
function actionCard(action) {
    const overdue = action.latestChangeDate && parseDate(action.latestChangeDate) && referenceDayStart() > parseDate(action.latestChangeDate);
    const statusLine = overdue
        ? `<div class="text-xs text-red-800"><strong>Überfällig:</strong> Stichtag ${formatDate(action.latestChangeDate)} überschritten – neu berechnen und ggf. Zusatzanpassung übernehmen.</div>`
        : `<div class="text-xs text-slate-700">Stichtag ${action.latestChangeDate ? formatDate(action.latestChangeDate) : '-'} · Wirksam ab ${formatDate(action.effectiveFrom)}${action.onceNeed > 0.009 ? ` · Einmalig ${formatCurrency(action.onceNeed)} am ${formatDate(action.onceDate)}` : ''}</div>`;
    const monthlyLine = Math.abs(toNum(action.monthlyNeed, 0)) > 0.009
        ? `<div class="text-xs text-slate-700">Dauerauftrag ${formatCurrency(action.currentMonthlyAmount)} → ${formatCurrency(action.recommendedMonthlyAmount)}</div>`
        : '<div class="text-xs text-slate-700">Keine monatliche Änderung.</div>';
    const plannedLine = action.plannedApplied
        ? `<div class="text-xs text-indigo-800">Geplant übernommen am ${formatDate(action.plannedAtIso)}${action.plannedBy ? ` durch ${escapeHtml(action.plannedBy)}` : ''}. Abschluss steht noch aus.</div>`
        : '<div class="text-xs text-amber-800">Noch nicht als geplant übernommen.</div>';
    return `<div class="rounded-xl border ${overdue ? 'border-red-200 bg-red-50' : 'border-indigo-200 bg-indigo-50'} p-3"><div class="flex items-start justify-between gap-2"><div><div class="text-sm font-bold text-slate-800">${escapeHtml(action.targetName || '-')}</div><div class="text-xs text-slate-500">Offene Aktion · ${escapeHtml(action.reason || '-')}</div></div><span class="px-2 py-1 rounded-full text-xs font-bold ${overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}">${overdue ? 'überfällig' : 'offen'}</span></div><div class="mt-2 space-y-1">${statusLine}${monthlyLine}${plannedLine}</div><div class="mt-3 flex justify-end"><button type="button" class="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700" data-action-done="${escapeHtml(action.id || '')}">Tatsächlich durchgeführt</button></div></div>`;
}
function suggestionCard(suggestion) {
    const action = openActionForSuggestion(suggestion);
    const monthly = suggestion.monthlyAllocations.map((row) => `${row.sourceName}: ${formatCurrency(Math.abs(toNum(row.amount, 0)))} / Monat`).join(' · ');
    const once = suggestion.onceAllocations.map((row) => `${row.sourceName}: ${formatCurrency(row.amount)} einmalig`).join(' · ');
    const isReduction = toNum(suggestion.monthlyNeed, 0) < -0.009;
    const criticalHint = suggestion.criticalDate
        ? `Kritischer Tag laut Tageslogik: ${formatDate(suggestion.criticalDate)} (Min Tages-Δ ${formatSignedCurrency(toNum(suggestion.criticalMinDayDelta, 0))}).`
        : '';
    const ownPlanLine = Math.abs(toNum(suggestion.monthlyNeed, 0)) > 0.009
        ? `Dauerauftrag ${formatCurrency(suggestion.currentMonthlyAmount)} → ${formatCurrency(suggestion.recommendedMonthlyAmount)} ab ${formatDate(suggestion.effectiveFrom)}.`
        : 'Kein Dauerauftragswechsel nötig.';
    const onceHint = suggestion.onceNeed > 0.009
        ? `<div class="mt-1"><strong>Einmalüberweisung so früh wie möglich:</strong> ${formatCurrency(suggestion.onceNeed)} am ${formatDate(suggestion.onceDate)}.</div>`
        : '';
    const deadlineHint = suggestion.latestChangeDate
        ? `<div class="mt-1 ${parseDate(suggestion.latestChangeDate) && referenceDayStart() > parseDate(suggestion.latestChangeDate) ? 'text-red-800' : 'text-slate-700'}"><strong>Späteste Änderung:</strong> ${formatDate(suggestion.latestChangeDate)}${suggestion.nextTransferExecutionDate ? ` · nächste Ausführung ${formatDate(suggestion.nextTransferExecutionDate)}` : ''}</div>`
        : '';
    const actionHint = action
        ? `<div class="mt-1 text-amber-800"><strong>Offene Aktion:</strong> bleibt sichtbar bis "Tatsächlich durchgeführt" gesetzt ist.</div>`
        : '';
    const applyPossible = (Math.abs(toNum(suggestion.monthlyNeed, 0)) > 0.009 || toNum(suggestion.onceNeed, 0) > 0.009) && (suggestion.preferredSourceId || suggestion.monthlyAllocations?.length || suggestion.onceAllocations?.length);
    return `<div class="rounded-xl border ${suggestion.fullyCovered ? 'border-indigo-200 bg-indigo-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="flex items-start justify-between gap-2"><div><div class="text-sm font-bold text-gray-800">${escapeHtml(suggestion.targetName)}</div><div class="text-xs text-gray-500">kritisch ab ${escapeHtml(suggestion.criticalLabel)} · ${escapeHtml(suggestion.reason)} · ${isReduction ? 'Senkung' : 'Erhöhung'} empfohlen</div></div><span class="px-2 py-1 rounded-full ${action ? 'bg-amber-100 text-amber-700' : (suggestion.fullyCovered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')} text-xs font-bold">${action ? 'Aktion offen' : (suggestion.fullyCovered ? 'abgedeckt' : 'Teilabdeckung')}</span></div><div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs"><div><div class="text-gray-500">Monatliche Anpassung</div><div class="font-bold text-gray-800">${formatSignedCurrency(suggestion.monthlyNeed)}</div></div><div><div class="text-gray-500">Einmalig nötig</div><div class="font-bold text-gray-800">${formatCurrency(suggestion.onceNeed)}</div></div><div><div class="text-gray-500">Rest</div><div class="font-bold ${suggestion.shortfall > 0 ? 'text-amber-700' : 'text-emerald-700'}">${formatCurrency(suggestion.shortfall)}</div></div></div><div class="mt-2 text-xs text-gray-700">${criticalHint ? `<div><strong>Tageswarnung:</strong> ${escapeHtml(criticalHint)}</div>` : ''}<div class="${criticalHint ? 'mt-1' : ''}"><strong>Empfehlung:</strong> ${escapeHtml(ownPlanLine)}</div>${deadlineHint}${monthly ? `<div class="mt-1"><strong>Monatlicher Zuschlag:</strong> ${escapeHtml(monthly)}</div>` : ''}${once ? `<div class="mt-1"><strong>Einmalig:</strong> ${escapeHtml(once)}</div>` : ''}${onceHint}${actionHint}${!monthly && !once ? '<div>Keine belastbare eigene Quelle verfügbar. Bitte eigenes Quellkonto oder Dauerauftrag prüfen.</div>' : ''}</div><div class="mt-3 flex flex-wrap justify-end gap-2">${applyPossible ? `<button type="button" class="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700" data-suggestion-id="${escapeHtml(suggestion.id || '')}">Übernommen (geplant)</button>` : ''}${action ? `<button type="button" class="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700" data-action-done="${escapeHtml(action.id || '')}">Tatsächlich durchgeführt</button>` : ''}</div></div>`;
}
function renderSuggestionsModal() {
    const list = FORECAST.suggestions || [];
    const openActions = openActionsSorted();
    const suggestionFingerprints = new Set(list.map((entry) => actionFingerprintFromSuggestion(entry)));
    const orphanActions = openActions.filter((entry) => !suggestionFingerprints.has(String(entry.fingerprint || '')));
    const preview = el('ab2-suggestion-preview');
    const panel = el('ab2-suggestion-panel');
    const modal = el('ab2-suggestions-content');
    if (panel) panel.classList.toggle('hidden', !list.length && !openActions.length);
    if (preview) {
        const suggestionPreview = list.slice(0, 2).map((suggestion) => suggestionCard(suggestion)).join('');
        const actionPreview = orphanActions.slice(0, 1).map((entry) => actionCard(entry)).join('');
        preview.innerHTML = suggestionPreview || actionPreview || '<p class="text-sm text-gray-400 italic">Keine Vorschläge nötig.</p>';
    }
    if (modal) {
        const suggestionSection = list.length ? `<div class="space-y-3"><div class="text-xs font-bold uppercase tracking-wide text-slate-600">Neue Empfehlungen</div>${list.map((suggestion) => suggestionCard(suggestion)).join('')}</div>` : '';
        const actionSection = orphanActions.length ? `<div class="space-y-3"><div class="text-xs font-bold uppercase tracking-wide text-slate-600">Offene Aktionen (Bestätigung ausstehend)</div>${orphanActions.map((entry) => actionCard(entry)).join('')}</div>` : '';
        modal.innerHTML = (suggestionSection || actionSection) ? `${suggestionSection}${suggestionSection && actionSection ? '<div class="h-2"></div>' : ''}${actionSection}` : '<p class="text-sm text-gray-400 italic">Keine Vorschläge nötig.</p>';
    }
}
function renderPreviews() {
    const itemAccount = ACCOUNTS[el('ab2-item-account')?.value] || null;
    const itemAmount = toNum(el('ab2-item-amount')?.value, 0);
    const itemType = el('ab2-item-type')?.value || 'belastung';
    if (el('ab2-item-preview')) el('ab2-item-preview').textContent = itemAccount && itemAmount > 0 ? `${itemType === 'gutschrift' ? 'Einnahme auf' : 'Ausgabe von'} ${itemAccount.name || '-'}: ${formatCurrency(itemAmount)} ${describeInterval(el('ab2-item-interval')?.value || 'monthly', el('ab2-item-start-month')?.value, parseMonths(el('ab2-item-custom-months')?.value), el('ab2-item-day')?.value)}.` : 'Noch unvollständig.';
    const accType = normalizeAccountType(el('ab2-account-type')?.value || 'bank');
    const accRole = normalizeAccountRole(el('ab2-account-role')?.value || 'both');
    const accUsesBuffer = accountUsesBuffer(accType, accRole);
    updateAccountCurrentBalanceText();
    const currentBalanceText = el('ab2-account-current-balance-value')?.textContent || '--';
    const roleText = accRole === 'source' ? 'nur Quelle' : accRole === 'target' ? 'nur Ziel' : 'Quelle & Ziel';
    const configHint = accType === 'person'
        ? ' Für Personen ist der Mindestpuffer deaktiviert.'
        : accUsesBuffer
            ? ` Mindestpuffer: ${formatCurrency(el('ab2-account-min-buffer')?.value || 0)}.`
            : ' Für reine Quellkonten ist der Mindestpuffer deaktiviert.';
    const balanceHint = accUsesBuffer ? ` Aktueller Kontostand: ${currentBalanceText}.` : '';
    if (el('ab2-account-preview')) el('ab2-account-preview').textContent = `${el('ab2-account-name')?.value || 'Dieses Konto'} wird als ${accType === 'person' ? 'Person / Geldquelle' : 'Bankkonto'} geführt (Rolle: ${roleText}).${configHint}${balanceHint}`;
    const transferSource = ACCOUNTS[el('ab2-transfer-source')?.value] || null;
    const transferTarget = ACCOUNTS[el('ab2-transfer-target')?.value] || null;
    const transferAmount = toNum(el('ab2-transfer-amount')?.value, 0);
    const linkingState = updateTransferLinkingBudgetState();
    const transferLinkText = linkingState.allocations.length
        ? ` Zugeordnet: ${linkingState.allocations.map((row) => `${transferLinkedTitleLabel(row.titleKey)} ${formatCurrency(row.amount)}`).join(', ')}. Differenz ${formatSignedCurrency(linkingState.diff)}.`
        : ' Noch keine Zahlungsgrund-Zuordnung.';
    if (el('ab2-transfer-preview')) el('ab2-transfer-preview').textContent = transferSource && transferTarget && transferAmount > 0 ? `${formatCurrency(transferAmount)} fließen von ${transferSource.name || '-'} nach ${transferTarget.name || '-'} ${describeInterval(el('ab2-transfer-interval')?.value || 'monthly', el('ab2-transfer-start-month')?.value, parseMonths(el('ab2-transfer-custom-months')?.value), el('ab2-transfer-day')?.value)}.${transferLinkText}` : 'Noch unvollständig.';
    const reconAccount = ACCOUNTS[el('ab2-recon-account')?.value] || null;
    const reconType = el('ab2-recon-type')?.value || 'snapshot';
    const reconValue = toNum(el('ab2-recon-value')?.value, 0);
    if (el('ab2-recon-preview')) el('ab2-recon-preview').textContent = reconAccount ? (reconType === 'snapshot' ? `Snapshot setzt ${reconAccount.name || '-'} auf ${formatCurrency(reconValue)}.` : `Manuelle Korrektur verändert ${reconAccount.name || '-'} einmalig um ${formatSignedCurrency(reconValue)}.`) : 'Noch unvollständig.';
    const item = ITEMS[el('ab2-item-id')?.value || ''] || null;
    const swapStart = el('ab2-abtausch-new-start')?.value || '';
    const swapAmount = toNum(el('ab2-abtausch-new-amount')?.value, 0);
    if (el('ab2-abtausch-preview')) el('ab2-abtausch-preview').textContent = item && swapStart && swapAmount > 0 ? `${item.title || '-'} endet vor ${formatDate(swapStart)} und läuft ab dann mit ${formatCurrency(swapAmount)} weiter.` : 'Noch keine Vorschau.';
    updateSollHintButtons();
}
function renderAll() { populateSelects(); renderTags(); renderDashboard(); renderTable(); renderAccounts(); renderTransfers(); renderRecon(); renderPaymentsOverview(); applyModalViewState(); renderPreviews(); }
function setItemReadOnly(readOnly) {
    itemReadMode = !!readOnly;
    document.querySelectorAll('#ab2-item-modal input, #ab2-item-modal select, #ab2-item-modal textarea').forEach((node) => {
        if (node.id === 'ab2-item-id') return;
        node.disabled = !!readOnly;
        node.classList.toggle('bg-gray-100', !!readOnly);
        node.classList.toggle('text-gray-500', !!readOnly);
    });
    if (el('ab2-add-contrib-btn')) el('ab2-add-contrib-btn').style.display = 'none';
    if (el('ab2-item-save-btn')) el('ab2-item-save-btn').style.display = readOnly ? 'none' : 'inline-flex';
    if (el('ab2-item-edit-btn')) el('ab2-item-edit-btn').style.display = readOnly ? 'inline-flex' : 'none';
    const editableExistingItem = !readOnly && Boolean(el('ab2-item-id')?.value);
    if (el('ab2-item-delete-btn')) el('ab2-item-delete-btn').style.display = editableExistingItem ? 'inline-flex' : 'none';
    if (el('ab2-item-abtausch-btn')) el('ab2-item-abtausch-btn').style.display = editableExistingItem ? 'inline-flex' : 'none';
}
function buildContributionRows(item) {
    const directRows = (Array.isArray(item?.contributions) ? item.contributions : [])
        .filter((row) => row?.sourceAccountId && toNum(row.amount, 0) > 0)
        .map((row) => ({
            sourceAccountId: row.sourceAccountId,
            sourceName: ACCOUNTS[row.sourceAccountId]?.name || '-',
            amount: roundMoney(toNum(row.amount, 0)),
            intervalType: row.intervalType || 'inherit',
            customMonths: Array.isArray(row.customMonths) ? row.customMonths : [],
            note: row.note || 'Direktbeitrag',
            kind: 'Direktbeitrag'
        }));

    const transferRows = Object.values(TRANSFERS)
        .map((transfer) => {
            const amount = transferAmountForItem(transfer, item);
            if (amount <= 0) return null;
            return {
                sourceAccountId: transfer.sourceAccountId,
                sourceName: ACCOUNTS[transfer.sourceAccountId]?.name || '-',
                amount: roundMoney(amount),
                intervalType: transfer.intervalType || 'monthly',
                customMonths: Array.isArray(transfer.customMonths) ? transfer.customMonths : [],
                note: `Transfer: ${ACCOUNTS[transfer.sourceAccountId]?.name || '-'} → ${ACCOUNTS[transfer.targetAccountId]?.name || '-'}`,
                transferId: transfer.id,
                kind: 'Transferplan'
            };
        })
        .filter(Boolean);

    return [...directRows, ...transferRows].sort((a, b) => String(a.sourceName || '').localeCompare(String(b.sourceName || '')));
}

function paymentCoverageStats(item, horizonMonths = forecastHorizonMonths) {
    const gap = contributionGapByHorizon(item, horizonMonths);
    const open = roundMoney(Math.max(0, -gap.gapInHorizon));
    const over = roundMoney(Math.max(0, gap.gapInHorizon));
    return {
        participants: gap.participants,
        participantCount: gap.participants.length,
        itemAmount: gap.itemAmount,
        executions: hitsInHorizon(item, horizonMonths),
        needInHorizon: gap.needInHorizon,
        coveredInHorizon: gap.coveredInHorizon,
        open,
        over,
        gapPerMonth: monthlyEquivalent(gap.gapInHorizon, horizonMonths),
        coveragePercent: gap.coveragePercent,
        horizonMonths: normalizeForecastHorizon(horizonMonths, forecastHorizonMonths)
    };
}

function renderPaymentsOverview() {
    const body = el('ab2-payments-table-body');
    const summary = el('ab2-payments-summary');
    if (!body) return;
    const statusOrder = { fehler: 0, aktiv: 1, geplant: 2, vergangen: 3 };
    const payments = Object.values(ITEMS)
        .filter((item) => item?.typ === 'belastung')
        .sort((a, b) => {
            const aStatus = itemStatus(a).key;
            const bStatus = itemStatus(b).key;
            const aOrder = statusOrder[aStatus] ?? 99;
            const bOrder = statusOrder[bStatus] ?? 99;
            return aOrder - bOrder || String(a.title || '').localeCompare(String(b.title || ''));
        });
    if (!payments.length) {
        body.innerHTML = '<tr><td colspan="12" class="px-3 py-8 text-center text-gray-400 italic">Keine Ausgaben vorhanden.</td></tr>';
        if (summary) summary.textContent = 'Noch keine Ausgaben im Dashboard vorhanden.';
        return;
    }
    const horizon = forecastHorizonMonths;
    let openCount = 0;
    let coveredCount = 0;
    let totalOpen = 0;
    let totalOver = 0;
    body.innerHTML = payments.map((item) => {
        const account = ACCOUNTS[item.accountId] || {};
        const status = itemStatus(item);
        const coverage = paymentCoverageStats(item, horizon);
        const isOpen = coverage.open > 0.009;
        if (isOpen) {
            openCount += 1;
            totalOpen = roundMoney(totalOpen + coverage.open);
        } else if (coverage.over <= 0.009) {
            coveredCount += 1;
        } else {
            totalOver = roundMoney(totalOver + coverage.over);
        }
        const rowTone = isOpen ? 'bg-yellow-50' : (coverage.over > 0.009 ? 'bg-blue-50/60' : 'bg-white');
        const detailsText = coverage.participants.length
            ? coverage.participants.map((entry) => `${entry.sourceName}: ${formatCurrency(entry.amountInHorizon)} (${entry.kindText})`).join(' · ')
            : '-';
        const deltaText = isOpen
            ? `<span class="font-bold text-amber-800">Offen ${formatCurrency(coverage.open)} / ${coverage.horizonMonths}M</span>`
            : coverage.over > 0.009
                ? `<span class="font-bold text-blue-700">Überdeckt ${formatCurrency(coverage.over)} / ${coverage.horizonMonths}M</span>`
                : '<span class="font-bold text-emerald-700">Ausgeglichen</span>';
        const monthDeltaText = `${formatSignedCurrency(coverage.gapPerMonth)} / Monat`;
        return `<tr class="border-t border-slate-100 ${rowTone}"><td class="px-3 py-2 whitespace-nowrap"><span class="px-2 py-1 rounded-full text-[11px] font-bold ${status.css}">${escapeHtml(status.label)}</span></td><td class="px-3 py-2"><div class="font-bold text-slate-800">${escapeHtml(item.title || '-')}</div><div class="text-[11px] text-slate-500">Gültig ab ${formatDate(item.validFrom)}${item.validTo ? ` bis ${formatDate(item.validTo)}` : ''}</div></td><td class="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">${escapeHtml(account.name || '-')}</td><td class="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">${escapeHtml(intervalLabel(item.intervalType, item.customMonths || []))}</td><td class="px-3 py-2 text-xs font-bold text-slate-900 whitespace-nowrap">${formatCurrency(item.amount)} · ${coverage.executions}x/${coverage.horizonMonths}M</td><td class="px-3 py-2 text-xs text-slate-700 text-center">${coverage.participantCount}</td><td class="px-3 py-2 text-xs font-bold text-slate-800 whitespace-nowrap">Bedarf ${formatCurrency(coverage.needInHorizon)} · gedeckt ${formatCurrency(coverage.coveredInHorizon)}</td><td class="px-3 py-2 text-xs whitespace-nowrap">${deltaText}<div class="text-[11px] text-slate-600 mt-0.5">${monthDeltaText}</div></td><td class="px-3 py-2 text-xs font-bold ${isOpen ? 'text-amber-800' : 'text-emerald-700'} whitespace-nowrap">${coverage.coveragePercent.toFixed(0)}%</td><td class="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">Horizont ${coverage.horizonMonths} Monate</td><td class="px-3 py-2 text-xs text-slate-700 min-w-[320px]">${escapeHtml(detailsText)}</td><td class="px-3 py-2 text-right whitespace-nowrap"><button type="button" class="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200" data-payment-open-item="${escapeHtml(item.id || '')}">Lesen</button></td></tr>`;
    }).join('');
    if (summary) {
        summary.innerHTML = `<div class="font-bold">Ausgaben gesamt: ${payments.length} · vollständig zugeordnet: ${coveredCount}</div><div class="mt-1 text-xs">Offene Zahlungen: <span class="font-bold text-amber-800">${openCount}</span> (gesamt ${formatCurrency(totalOpen)} im ${horizon}-Monats-Horizont). Überdeckungen: <span class="font-bold text-blue-700">${formatCurrency(totalOver)}</span> im Horizont.</div><div class="mt-1 text-xs">Gelb markierte Zeilen zeigen echte Unterdeckung im gewählten Forecast-Horizont.</div>`;
    }
}

function renderContributionTable(item) {
    const host = el('ab2-contrib-list');
    if (!host) return;
    const rows = buildContributionRows(item);
    if (!rows.length) {
        host.innerHTML = '<p class="text-xs text-gray-500 italic">Keine Beiträge/Zuordnungen vorhanden.</p>';
        return;
    }
    const body = rows.map((row) => {
        const rowClass = row.transferId ? 'ab2-click-row bg-indigo-50/40' : 'bg-white';
        const jumpAttr = row.transferId ? ` data-contrib-transfer-jump="${escapeHtml(row.transferId)}"` : '';
        const intervalText = row.intervalType === 'inherit' ? 'wie Eintrag' : intervalLabel(row.intervalType, row.customMonths || []);
        return `<tr class="border-t border-slate-100 ${rowClass}"${jumpAttr} data-contrib-direct="${row.transferId ? '0' : '1'}" data-contrib-source="${escapeHtml(row.sourceAccountId || '')}" data-contrib-amount="${escapeHtml(String(roundMoney(row.amount || 0)))}" data-contrib-interval="${escapeHtml(row.intervalType || 'inherit')}" data-contrib-custom="${escapeHtml(Array.isArray(row.customMonths) ? row.customMonths.join(',') : '')}" data-contrib-note="${escapeHtml(row.note || '')}"><td class="px-2 py-2 text-xs text-gray-700">${escapeHtml(row.sourceName || '-')}</td><td class="px-2 py-2 text-xs text-gray-600">${escapeHtml(row.kind || '-')}</td><td class="px-2 py-2 text-xs font-bold text-gray-900">${formatCurrency(row.amount)}</td><td class="px-2 py-2 text-xs text-gray-600">${escapeHtml(intervalText)}</td><td class="px-2 py-2 text-xs text-gray-600">${escapeHtml(row.note || '-')}</td><td class="px-2 py-2 text-right">${row.transferId ? `<button type="button" class="px-2 py-1 rounded bg-indigo-100 text-indigo-700 text-[11px] font-bold hover:bg-indigo-200" data-contrib-transfer-jump="${escapeHtml(row.transferId)}">Transfer</button>` : '<span class="text-[11px] text-gray-400">-</span>'}</td></tr>`;
    }).join('');
    const totalContrib = roundMoney(rows.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
    const itemTotal = roundMoney(toNum(item?.amount, 0));
    const diff = roundMoney(totalContrib - itemTotal);
    const diffClass = diff < -0.009 ? 'text-red-700' : diff > 0.009 ? 'text-amber-700' : 'text-emerald-700';
    const footer = `<tr class="border-t-2 border-slate-200 bg-slate-100"><td colspan="6" class="px-2 py-2 text-xs font-bold text-slate-800">Gesamtsumme ${formatCurrency(totalContrib)} · von gesamt: ${formatCurrency(itemTotal)} · Differenz: <span class="${diffClass}">${formatSignedCurrency(diff)}</span></td></tr>`;
    host.innerHTML = `<div class="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden"><div class="overflow-x-auto"><table class="ab2-simple-table min-w-[760px]"><thead class="bg-slate-100 text-slate-600"><tr><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide">Quelle</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide">Art</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide">Betrag</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide">Intervall</th><th class="px-2 py-2 text-left text-[11px] uppercase tracking-wide">Notiz</th><th class="px-2 py-2 text-right text-[11px] uppercase tracking-wide">Aktion</th></tr></thead><tbody>${body}</tbody><tfoot>${footer}</tfoot></table></div></div>`;
}
function resetItemForm() {
    if (el('ab2-item-id')) el('ab2-item-id').value = '';
    ['ab2-item-title', 'ab2-item-amount', 'ab2-item-start-month', 'ab2-item-custom-months', 'ab2-item-day', 'ab2-item-valid-to', 'ab2-item-notes'].forEach((id) => { if (el(id)) el(id).value = ''; });
    if (el('ab2-item-type')) el('ab2-item-type').value = 'belastung';
    if (el('ab2-item-interval')) el('ab2-item-interval').value = 'monthly';
    if (el('ab2-item-account')) el('ab2-item-account').value = '';
    if (el('ab2-item-valid-from')) el('ab2-item-valid-from').value = isoDate(new Date());
    renderContributionTable(null);
    if (el('ab2-item-delete-btn')) el('ab2-item-delete-btn').style.display = 'none';
    if (el('ab2-item-abtausch-btn')) el('ab2-item-abtausch-btn').style.display = 'none';
    updateMainIntervalFields('ab2-item');
    setItemReadOnly(false);
    renderPreviews();
}
function fillItemForm(item, readOnly) {
    if (!item) return;
    if (el('ab2-item-id')) el('ab2-item-id').value = item.id || '';
    if (el('ab2-item-title')) el('ab2-item-title').value = item.title || '';
    if (el('ab2-item-account')) el('ab2-item-account').value = item.accountId || '';
    if (el('ab2-item-type')) el('ab2-item-type').value = item.typ || 'belastung';
    if (el('ab2-item-amount')) el('ab2-item-amount').value = toNum(item.amount, 0).toFixed(2);
    if (el('ab2-item-interval')) el('ab2-item-interval').value = item.intervalType || 'monthly';
    if (el('ab2-item-start-month')) el('ab2-item-start-month').value = item.startMonth || '';
    if (el('ab2-item-custom-months')) el('ab2-item-custom-months').value = Array.isArray(item.customMonths) ? item.customMonths.join(',') : '';
    if (el('ab2-item-day')) el('ab2-item-day').value = item.dayOfMonth || '';
    if (el('ab2-item-valid-from')) el('ab2-item-valid-from').value = item.validFrom || '';
    if (el('ab2-item-valid-to')) el('ab2-item-valid-to').value = item.validTo || '';
    if (el('ab2-item-notes')) el('ab2-item-notes').value = item.notes || '';
    renderContributionTable(item);
    if (el('ab2-item-delete-btn')) el('ab2-item-delete-btn').style.display = item.id && !readOnly ? 'inline-flex' : 'none';
    if (el('ab2-item-abtausch-btn')) el('ab2-item-abtausch-btn').style.display = item.id && !readOnly ? 'inline-flex' : 'none';
    updateMainIntervalFields('ab2-item');
    setItemReadOnly(!!readOnly);
    renderPreviews();
}
function collectContribs() {
    return Array.from(document.querySelectorAll('#ab2-contrib-list [data-contrib-direct="1"]'))
        .map((row) => ({
            sourceAccountId: row.dataset.contribSource || '',
            amount: roundMoney(toNum(row.dataset.contribAmount, 0)),
            intervalType: row.dataset.contribInterval || 'inherit',
            customMonths: parseMonths(row.dataset.contribCustom || ''),
            note: row.dataset.contribNote || ''
        }))
        .filter((row) => row.sourceAccountId && row.amount > 0);
}
function resetAccountForm(mode = 'list') {
    editingAccountId = '';
    accountAmountUnlockForId = '';
    if (mode === 'list') {
        accountListFilterState.showActive = true;
        accountListFilterState.showPlanned = false;
        accountListFilterState.showPast = false;
    }
    setAccountModalView(mode);
    ['ab2-account-id', 'ab2-account-name', 'ab2-account-bank', 'ab2-account-iban', 'ab2-account-min-buffer'].forEach((id) => { if (el(id)) el(id).value = ''; });
    if (el('ab2-account-type')) el('ab2-account-type').value = 'bank';
    if (el('ab2-account-role')) el('ab2-account-role').value = 'both';
    updateAccountCurrentBalanceText('');
    if (el('ab2-account-abtausch-btn')) el('ab2-account-abtausch-btn').classList.add('hidden');
    updateAccountTypeDependencies();
    syncAccountAmountLockState();
    renderAccounts();
    applyModalViewState();
    setAccountSplitMode('right');
    renderPreviews();
}
function editAccount(id) {
    const account = ACCOUNTS[id];
    if (!account) return;
    editingAccountId = id;
    const accountType = normalizeAccountType(account.type || 'bank');
    const accountRole = normalizeAccountRole(account.role || 'both');
    const usesBuffer = accountUsesBuffer(accountType, accountRole);
    setAccountModalView('edit');
    accountAmountUnlockForId = '';
    if (el('ab2-account-id')) el('ab2-account-id').value = account.id || '';
    if (el('ab2-account-name')) el('ab2-account-name').value = account.name || '';
    if (el('ab2-account-bank')) el('ab2-account-bank').value = account.bank || '';
    if (el('ab2-account-iban')) el('ab2-account-iban').value = account.iban || '';
    if (el('ab2-account-type')) el('ab2-account-type').value = accountType;
    if (el('ab2-account-role')) el('ab2-account-role').value = accountRole;
    if (el('ab2-account-min-buffer')) el('ab2-account-min-buffer').value = usesBuffer ? accountMinBuffer(account).toFixed(2) : '0';
    updateAccountCurrentBalanceText(id);
    if (el('ab2-account-abtausch-btn')) el('ab2-account-abtausch-btn').classList.remove('hidden');
    updateAccountTypeDependencies();
    syncAccountAmountLockState();
    openModal('ab2-accounts-modal');
    setAccountSplitMode('right');
    renderAccounts();
    applyModalViewState();
    renderPreviews();
}
function resetTransferForm(mode = 'list') {
    editingTransferId = '';
    transferAmountUnlockForId = '';
    transferAbtauschSourceId = '';
    if (mode === 'list') {
        transferListFilterState.showActive = true;
        transferListFilterState.showPlanned = false;
        transferListFilterState.showPast = false;
    }
    setTransferModalView(mode);
    ['ab2-transfer-id', 'ab2-transfer-amount', 'ab2-transfer-start-month', 'ab2-transfer-custom-months', 'ab2-transfer-day', 'ab2-transfer-valid-to', 'ab2-transfer-note', 'ab2-transfer-linked-titles'].forEach((id) => { if (el(id)) el(id).value = ''; });
    if (el('ab2-transfer-source')) el('ab2-transfer-source').value = '';
    if (el('ab2-transfer-target')) el('ab2-transfer-target').value = '';
    if (el('ab2-transfer-interval')) el('ab2-transfer-interval').value = 'monthly';
    if (el('ab2-transfer-valid-from')) el('ab2-transfer-valid-from').value = isoDate(new Date());
    populateTransferLinkingOptions([]);
    updateTransferLinkedTitleAllocationsUI([]);
    updateTransferLinkingBudgetState();
    updateMainIntervalFields('ab2-transfer');
    if (el('ab2-transfer-abtausch-btn')) el('ab2-transfer-abtausch-btn').classList.add('hidden');
    syncTransferAmountLockState();
    renderTransfers();
    applyModalViewState();
    setTransferSplitMode('right');
    renderPreviews();
}
function editTransfer(id) {
    const transfer = TRANSFERS[id];
    if (!transfer) return;
    editingTransferId = id;
    setTransferModalView('edit');
    transferAmountUnlockForId = '';
    transferAbtauschSourceId = '';
    if (el('ab2-transfer-id')) el('ab2-transfer-id').value = transfer.id || '';
    if (el('ab2-transfer-source')) el('ab2-transfer-source').value = transfer.sourceAccountId || '';
    if (el('ab2-transfer-target')) el('ab2-transfer-target').value = transfer.targetAccountId || '';
    if (el('ab2-transfer-amount')) el('ab2-transfer-amount').value = toNum(transfer.amount, 0).toFixed(2);
    if (el('ab2-transfer-interval')) el('ab2-transfer-interval').value = transfer.intervalType || 'monthly';
    if (el('ab2-transfer-start-month')) el('ab2-transfer-start-month').value = transfer.startMonth || '';
    if (el('ab2-transfer-custom-months')) el('ab2-transfer-custom-months').value = Array.isArray(transfer.customMonths) ? transfer.customMonths.join(',') : '';
    if (el('ab2-transfer-day')) el('ab2-transfer-day').value = transfer.dayOfMonth || '';
    if (el('ab2-transfer-valid-from')) el('ab2-transfer-valid-from').value = transfer.validFrom || '';
    if (el('ab2-transfer-valid-to')) el('ab2-transfer-valid-to').value = transfer.validTo || '';
    if (el('ab2-transfer-note')) el('ab2-transfer-note').value = transfer.note || '';
    const linkedAllocations = getTransferLinkedAllocations(transfer);
    const selectedTitles = linkedAllocations.map((row) => row.titleKey);
    populateTransferLinkingOptions(selectedTitles);
    updateTransferLinkedTitleAllocationsUI(linkedAllocations);
    updateTransferLinkingBudgetState();
    updateMainIntervalFields('ab2-transfer');
    if (el('ab2-transfer-abtausch-btn')) el('ab2-transfer-abtausch-btn').classList.remove('hidden');
    syncTransferAmountLockState();
    openModal('ab2-transfers-modal');
    setTransferSplitMode('right');
    renderTransfers();
    applyModalViewState();
    renderPreviews();
}
function fillReconForm(entry) {
    if (!entry) return;
    editingReconId = entry.id || '';
    setReconModalView('edit');
    if (el('ab2-recon-account')) el('ab2-recon-account').value = entry.accountId || '';
    if (el('ab2-recon-type')) el('ab2-recon-type').value = entry.type || 'snapshot';
    if (el('ab2-recon-date')) el('ab2-recon-date').value = entry.date || isoDate(new Date());
    if (el('ab2-recon-value')) el('ab2-recon-value').value = toNum(entry.value, 0).toFixed(2);
    if (el('ab2-recon-note')) el('ab2-recon-note').value = entry.note || '';
    applyModalViewState();
    renderPreviews();
}
function resetReconForm(mode = 'list') {
    editingReconId = '';
    if (mode === 'list') reconOlderVisibleCount = 3;
    setReconModalView(mode);
    if (el('ab2-recon-account')) el('ab2-recon-account').value = '';
    ['ab2-recon-value', 'ab2-recon-note'].forEach((id) => { if (el(id)) el(id).value = ''; });
    if (el('ab2-recon-type')) el('ab2-recon-type').value = 'snapshot';
    if (el('ab2-recon-date')) el('ab2-recon-date').value = isoDate(new Date());
    renderRecon();
    applyModalViewState();
    setReconSplitMode('right');
    renderPreviews();
}
async function writeAudit(action, entityType, entityId, beforeData = null, afterData = null, context = {}) {
    if (!auditRef || !uid()) return;
    try {
        await addDoc(auditRef, { action, entityType, entityId, beforeData, afterData, context, appModule: 'ABBUCHUNGSBERECHNER', createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp() });
    } catch (error) { console.warn('AB2 Audit fehlgeschlagen:', error); }
}
async function upsertSnapshotEntry(accountId, date, value, note) {
    const existing = Object.values(RECON).find((entry) => entry.type === 'snapshot' && entry.accountId === accountId && entry.date === date);
    const payload = { type: 'snapshot', accountId, date, value: roundMoney(value), note: note || '', createdBy: existing?.createdBy || uid(), createdByName: existing?.createdByName || currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    if (existing) {
        await updateDoc(doc(reconRef, existing.id), payload);
        await writeAudit('update', 'reconciliation', existing.id, cloneClean(existing), payload, { action: 'snapshot_upsert' });
        return existing.id;
    }
    const ref = await addDoc(reconRef, { ...payload, createdAt: serverTimestamp() });
    await writeAudit('create', 'reconciliation', ref.id, null, payload, { action: 'snapshot_upsert' });
    return ref.id;
}
function actionFingerprintFromSuggestion(suggestion) {
    const kind = suggestion?.actionType || (toNum(suggestion?.monthlyNeed, 0) < 0 ? 'lower_monthly' : 'raise_monthly');
    return `${suggestion?.targetId || ''}__${suggestion?.criticalMonth || currentMonthKey()}__${kind}`;
}
function openActionForSuggestion(suggestion) {
    const fingerprint = actionFingerprintFromSuggestion(suggestion);
    return Object.values(ACTIONS).find((entry) => String(entry?.fingerprint || '') === fingerprint && String(entry?.status || 'open') === 'open') || null;
}
function openActionsSorted() {
    return Object.values(ACTIONS)
        .filter((entry) => String(entry?.status || 'open') === 'open')
        .sort((a, b) => String(a.latestChangeDate || '').localeCompare(String(b.latestChangeDate || '')) || String(a.targetName || '').localeCompare(String(b.targetName || '')));
}
async function upsertSuggestionAction(suggestion, context = {}) {
    if (!actionsRef || !uid()) return;
    const fingerprint = actionFingerprintFromSuggestion(suggestion);
    const existing = Object.values(ACTIONS).find((entry) => String(entry?.fingerprint || '') === fingerprint && String(entry?.status || 'open') === 'open') || null;
    const payload = {
        fingerprint,
        status: 'open',
        targetId: suggestion.targetId || '',
        targetName: suggestion.targetName || '-',
        suggestionId: suggestion.id || '',
        actionType: suggestion.actionType || (toNum(suggestion.monthlyNeed, 0) < 0 ? 'lower_monthly' : 'raise_monthly'),
        reason: suggestion.reason || '',
        criticalMonth: suggestion.criticalMonth || '',
        criticalDate: suggestion.criticalDate || '',
        latestChangeDate: suggestion.latestChangeDate || '',
        nextTransferExecutionDate: suggestion.nextTransferExecutionDate || '',
        effectiveFrom: suggestion.effectiveFrom || '',
        onceDate: suggestion.onceDate || '',
        currentMonthlyAmount: roundMoney(toNum(suggestion.currentMonthlyAmount, 0)),
        recommendedMonthlyAmount: roundMoney(toNum(suggestion.recommendedMonthlyAmount, 0)),
        monthlyNeed: roundMoney(toNum(suggestion.monthlyNeed, 0)),
        onceNeed: roundMoney(toNum(suggestion.onceNeed, 0)),
        plannedApplied: !!context.plannedApplied,
        plannedAtIso: context.plannedApplied ? isoDate(referenceDate()) : (existing?.plannedAtIso || ''),
        plannedBy: context.plannedApplied ? (currentUser?.displayName || uid() || 'Unbekannt') : (existing?.plannedBy || ''),
        updatedBy: currentUser?.displayName || 'Unbekannt',
        updatedAt: serverTimestamp()
    };
    if (existing?.id) {
        await updateDoc(doc(actionsRef, existing.id), payload);
        await writeAudit('update', 'ab2_action', existing.id, cloneClean(existing), payload, { action: 'suggestion_action_upsert', suggestionId: suggestion.id || '' });
        return existing.id;
    }
    const createPayload = {
        ...payload,
        createdBy: uid(),
        createdByName: currentUser?.displayName || 'Unbekannt',
        createdAt: serverTimestamp()
    };
    const ref = await addDoc(actionsRef, createPayload);
    await writeAudit('create', 'ab2_action', ref.id, null, createPayload, { action: 'suggestion_action_create', suggestionId: suggestion.id || '' });
    return ref.id;
}
async function markActionDone(actionId) {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const action = ACTIONS[actionId] || null;
    if (!action) return alertUser('Aktion nicht gefunden.', 'error');
    if (String(action.status || 'open') !== 'open') return alertUser('Aktion ist bereits abgeschlossen.', 'info');
    try {
        const payload = {
            status: 'done',
            doneAtIso: isoDate(referenceDate()),
            doneBy: currentUser?.displayName || uid() || 'Unbekannt',
            updatedBy: currentUser?.displayName || 'Unbekannt',
            updatedAt: serverTimestamp()
        };
        await updateDoc(doc(actionsRef, actionId), payload);
        await writeAudit('update', 'ab2_action', actionId, cloneClean(action), payload, { action: 'suggestion_action_done' });
        alertUser('Aktion als tatsächlich durchgeführt markiert.', 'success');
    } catch (error) {
        console.error(error);
        alertUser(`Fehler beim Abschließen: ${error.message || error}`, 'error');
    }
}
async function saveItem() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const id = el('ab2-item-id')?.value || '';
    const title = el('ab2-item-title')?.value?.trim() || '';
    const accountId = el('ab2-item-account')?.value || '';
    const amount = roundMoney(toNum(el('ab2-item-amount')?.value, 0));
    const intervalType = el('ab2-item-interval')?.value || 'monthly';
    const customMonths = intervalType === 'custom' ? parseMonths(el('ab2-item-custom-months')?.value || '') : [];
    const validFrom = el('ab2-item-valid-from')?.value || '';
    const validTo = el('ab2-item-valid-to')?.value || '';
    if (!title || !accountId || amount <= 0 || !validFrom) return alertUser('Bitte Titel, Konto, Betrag und Startdatum ausfüllen.', 'error');
    if (intervalType === 'custom' && !customMonths.length) return alertUser('Bitte bei Individuell mindestens einen Monat angeben.', 'error');
    if (validTo && parseDate(validTo) < parseDate(validFrom)) return alertUser('Gültig bis darf nicht vor Gültig ab liegen.', 'error');
    const before = ITEMS[id] || null;
    const payload = { title, accountId, typ: el('ab2-item-type')?.value || 'belastung', amount, intervalType, startMonth: intervalType === 'monthly' || intervalType === 'custom' || intervalType === 'once' ? null : (parseInt(el('ab2-item-start-month')?.value, 10) || null), customMonths, dayOfMonth: parseInt(el('ab2-item-day')?.value, 10) || 1, validFrom, validTo, notes: el('ab2-item-notes')?.value?.trim() || '', contributions: collectContribs(), createdBy: before?.createdBy || uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    try {
        if (id) {
            if (itemVersionRequiresSplit(before, payload)) {
                const beforeStart = parseDate(before.validFrom);
                const nextStart = parseDate(payload.validFrom);
                const correctionMode = !!beforeStart && !!nextStart && nextStart <= beforeStart;
                if (correctionMode) {
                    await updateDoc(doc(itemsRef, id), payload);
                    await writeAudit('update', 'cost_item', id, cloneClean(before), payload, { action: 'save_item_correction' });
                } else {
                    const oldEndIso = previousDateIso(payload.validFrom);
                    if (!oldEndIso || parseDate(oldEndIso) < parseDate(before.validFrom)) {
                        return alertUser('Bei Betrags-/Regeländerung bitte ein späteres "Gültig ab" setzen (Versionierung mit Abtausch).', 'error');
                    }
                    await updateDoc(doc(itemsRef, id), { validTo: oldEndIso, updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() });
                    const nextPayload = {
                        ...payload,
                        validFrom: payload.validFrom,
                        validTo: payload.validTo || '',
                        sourceItemId: before?.sourceItemId || before?.id || '',
                        createdBy: before?.createdBy || uid(),
                        createdByName: before?.createdByName || currentUser?.displayName || 'Unbekannt',
                        createdAt: serverTimestamp(),
                        updatedBy: currentUser?.displayName || 'Unbekannt',
                        updatedAt: serverTimestamp()
                    };
                    const ref = await addDoc(itemsRef, nextPayload);
                    await writeAudit('abtausch', 'cost_item', id, cloneClean(before), { newItemId: ref.id, oldEndIso, validFrom: payload.validFrom }, { action: 'save_item_version_split' });
                }
            } else {
                await updateDoc(doc(itemsRef, id), payload);
                await writeAudit('update', 'cost_item', id, cloneClean(before), payload, { action: 'save_item' });
            }
        } else {
            const createPayload = { ...payload, createdAt: serverTimestamp(), createdByName: currentUser?.displayName || 'Unbekannt' };
            const ref = await addDoc(itemsRef, createPayload);
            await writeAudit('create', 'cost_item', ref.id, null, createPayload, { action: 'create_item' });
        }
        closeModal('ab2-item-modal');
        resetItemForm();
        alertUser('Eintrag gespeichert.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Speichern: ${error.message || error}`, 'error'); }
}
async function deleteItem(id) {
    const itemId = id || el('ab2-item-id')?.value || '';
    const before = ITEMS[itemId];
    if (!before) return;
    const confirmation = window.prompt(`Zum Löschen von "${before.title || '-'}" bitte LÖSCHEN eingeben:`, '');
    if (confirmation !== 'LÖSCHEN') return;
    try {
        await deleteDoc(doc(itemsRef, itemId));
        await writeAudit('delete', 'cost_item', itemId, cloneClean(before), null, { action: 'delete_item' });
        closeModal('ab2-item-modal');
        resetItemForm();
        alertUser('Eintrag gelöscht.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Löschen: ${error.message || error}`, 'error'); }
}
async function saveAccount() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const id = el('ab2-account-id')?.value || '';
    const name = el('ab2-account-name')?.value?.trim() || '';
    if (!name) return alertUser('Bitte Namen eingeben.', 'error');
    const before = ACCOUNTS[id] || null;
    const accountType = normalizeAccountType(el('ab2-account-type')?.value || 'bank');
    const role = normalizeAccountRole(el('ab2-account-role')?.value || 'both');
    const usesBuffer = accountUsesBuffer(accountType, role);
    const payload = { name, bank: el('ab2-account-bank')?.value?.trim() || '', iban: el('ab2-account-iban')?.value?.trim() || '', type: accountType, role, minBuffer: usesBuffer ? roundMoney(toNum(el('ab2-account-min-buffer')?.value, 0)) : 0, createdBy: before?.createdBy || uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    if (id && usesBuffer && before && accountAmountUnlockForId !== id && Math.abs(roundMoney(payload.minBuffer) - roundMoney(toNum(before.minBuffer, 0))) > 0.009) {
        return alertUser('Mindestpuffer ist gesperrt. Bitte zuerst "Betrag bearbeiten" nutzen oder bei planmäßiger Änderung Abtausch verwenden.', 'error');
    }
    try {
        if (id) {
            await updateDoc(doc(accountsRef, id), payload);
            await writeAudit('update', 'account', id, cloneClean(before), payload, { action: 'save_account' });
        } else {
            const createPayload = { ...payload, createdAt: serverTimestamp(), createdByName: currentUser?.displayName || 'Unbekannt' };
            const ref = await addDoc(accountsRef, createPayload);
            await writeAudit('create', 'account', ref.id, null, createPayload, { action: 'create_account' });
        }
        resetAccountForm();
        alertUser('Konto gespeichert.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Speichern: ${error.message || error}`, 'error'); }
}
async function deleteAccount(id) {
    const before = ACCOUNTS[id];
    if (!before) return;
    if (Object.values(ITEMS).some((item) => item.accountId === id) || Object.values(TRANSFERS).some((transfer) => transfer.sourceAccountId === id || transfer.targetAccountId === id) || Object.values(RECON).some((entry) => entry.accountId === id)) return alertUser('Konto ist noch verknüpft und kann nicht gelöscht werden.', 'error');
    if (!window.confirm(`Konto "${before.name || '-'}" wirklich löschen?`)) return;
    try {
        await deleteDoc(doc(accountsRef, id));
        await writeAudit('delete', 'account', id, cloneClean(before), null, { action: 'delete_account' });
        resetAccountForm();
        alertUser('Konto gelöscht.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Löschen: ${error.message || error}`, 'error'); }
}
async function saveTransfer() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const id = el('ab2-transfer-id')?.value || '';
    const sourceAccountId = el('ab2-transfer-source')?.value || '';
    const targetAccountId = el('ab2-transfer-target')?.value || '';
    const amount = roundMoney(toNum(el('ab2-transfer-amount')?.value, 0));
    const intervalType = el('ab2-transfer-interval')?.value || 'monthly';
    const customMonths = intervalType === 'custom' ? parseMonths(el('ab2-transfer-custom-months')?.value || '') : [];
    const validFrom = el('ab2-transfer-valid-from')?.value || '';
    const validTo = el('ab2-transfer-valid-to')?.value || '';
    const linking = transferLinkingFormState();
    if (!sourceAccountId || !targetAccountId || sourceAccountId === targetAccountId || amount <= 0 || !validFrom) return alertUser('Bitte Quelle, Ziel, Betrag und Startdatum korrekt ausfüllen.', 'error');
    if (intervalType === 'custom' && !customMonths.length) return alertUser('Bitte bei Individuell mindestens einen Monat angeben.', 'error');
    if (validTo && parseDate(validTo) < parseDate(validFrom)) return alertUser('Gültig bis darf nicht vor Gültig ab liegen.', 'error');
    if (linking.hasSelection && (!linking.hasPositive || !linking.allSelectedPlanned)) return alertUser('Bitte für jeden ausgewählten Zahlungsgrund einen Betrag > 0 erfassen.', 'error');
    if (linking.overplanned) return alertUser('Die Zahlungsgrund-Zuordnung überschreitet das Transfer-Budget.', 'error');
    const before = TRANSFERS[id] || null;
    const linkedTitleAllocations = normalizeTransferLinkedAllocations(linking.allocations);
    const linkedTitles = linkedTitleAllocations.map((row) => row.titleKey);
    const payload = { sourceAccountId, targetAccountId, amount, intervalType, startMonth: intervalType === 'monthly' || intervalType === 'custom' || intervalType === 'once' ? null : (parseInt(el('ab2-transfer-start-month')?.value, 10) || null), customMonths, dayOfMonth: parseInt(el('ab2-transfer-day')?.value, 10) || 1, validFrom, validTo, note: el('ab2-transfer-note')?.value?.trim() || '', linkedTitles, linkedTitleAllocations, createdBy: before?.createdBy || uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    if (id && before && transferAmountUnlockForId !== id && Math.abs(roundMoney(amount) - roundMoney(toNum(before.amount, 0))) > 0.009) {
        return alertUser('Betrag ist gesperrt. Bitte zuerst "Betrag bearbeiten" nutzen oder bei planmäßiger Änderung Abtausch verwenden.', 'error');
    }
    try {
        if (id) {
            if (transferVersionRequiresSplit(before, payload)) {
                const beforeStart = parseDate(before.validFrom);
                const nextStart = parseDate(payload.validFrom);
                const correctionMode = !!beforeStart && !!nextStart && nextStart <= beforeStart;
                if (correctionMode) {
                    await updateDoc(doc(transfersRef, id), payload);
                    await writeAudit('update', 'transfer_plan', id, cloneClean(before), payload, { action: 'save_transfer_correction' });
                } else {
                    const oldEndIso = previousDateIso(payload.validFrom);
                    if (!oldEndIso || parseDate(oldEndIso) < parseDate(before.validFrom)) {
                        return alertUser('Bei Transfer-Änderungen bitte ein späteres "Gültig ab" setzen (Versionierung mit Abtausch).', 'error');
                    }
                    await updateDoc(doc(transfersRef, id), { validTo: oldEndIso, updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() });
                    const nextPayload = {
                        ...payload,
                        validFrom: payload.validFrom,
                        validTo: payload.validTo || '',
                        sourceTransferId: before?.sourceTransferId || before?.id || '',
                        createdBy: before?.createdBy || uid(),
                        createdByName: before?.createdByName || currentUser?.displayName || 'Unbekannt',
                        createdAt: serverTimestamp(),
                        updatedBy: currentUser?.displayName || 'Unbekannt',
                        updatedAt: serverTimestamp()
                    };
                    const ref = await addDoc(transfersRef, nextPayload);
                    await writeAudit('abtausch', 'transfer_plan', id, cloneClean(before), { newTransferId: ref.id, oldEndIso, validFrom: payload.validFrom }, { action: 'save_transfer_version_split' });
                }
            } else {
                await updateDoc(doc(transfersRef, id), payload);
                await writeAudit('update', 'transfer_plan', id, cloneClean(before), payload, { action: 'save_transfer' });
            }
        } else {
            const createPayload = { ...payload, createdAt: serverTimestamp(), createdByName: currentUser?.displayName || 'Unbekannt' };
            const ref = await addDoc(transfersRef, createPayload);
            await writeAudit('create', 'transfer_plan', ref.id, null, createPayload, { action: 'create_transfer' });
        }
        resetTransferForm();
        alertUser('Transfer gespeichert.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Speichern: ${error.message || error}`, 'error'); }
}
async function deleteTransfer(id) {
    const before = TRANSFERS[id];
    if (!before) return;
    if (!window.confirm('Diesen Transfer wirklich löschen?')) return;
    try {
        await deleteDoc(doc(transfersRef, id));
        await writeAudit('delete', 'transfer_plan', id, cloneClean(before), null, { action: 'delete_transfer' });
        resetTransferForm();
        alertUser('Transfer gelöscht.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Löschen: ${error.message || error}`, 'error'); }
}
async function saveRecon() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const accountId = el('ab2-recon-account')?.value || '';
    const account = ACCOUNTS[accountId] || null;
    const type = el('ab2-recon-type')?.value || 'snapshot';
    const date = el('ab2-recon-date')?.value || '';
    const value = toNum(el('ab2-recon-value')?.value, NaN);
    if (!accountId || !date || !Number.isFinite(value)) return alertUser('Bitte Konto, Datum und Wert ausfüllen.', 'error');
    if (account && isPersonAccount(account)) return alertUser('Abgleich ist nur für Bankkonten möglich.', 'error');
    const existing = Object.values(RECON).find((entry) => entry.accountId === accountId && entry.type === type && entry.date === date) || null;
    const payload = { accountId, type, date, value: roundMoney(value), note: el('ab2-recon-note')?.value?.trim() || '', createdBy: existing?.createdBy || uid(), createdByName: existing?.createdByName || currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    try {
        if (existing) {
            await updateDoc(doc(reconRef, existing.id), payload);
            await writeAudit('update', 'reconciliation', existing.id, cloneClean(existing), payload, { action: 'save_recon' });
        } else {
            const ref = await addDoc(reconRef, { ...payload, createdAt: serverTimestamp() });
            await writeAudit('create', 'reconciliation', ref.id, null, payload, { action: 'create_recon' });
        }
        resetReconForm();
        alertUser('Abgleich gespeichert.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Speichern: ${error.message || error}`, 'error'); }
}
async function deleteRecon(id) {
    const before = RECON[id];
    if (!before) return;
    if (!window.confirm('Diesen Abgleich wirklich löschen?')) return;
    try {
        await deleteDoc(doc(reconRef, id));
        await writeAudit('delete', 'reconciliation', id, cloneClean(before), null, { action: 'delete_recon' });
        alertUser('Abgleich gelöscht.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Löschen: ${error.message || error}`, 'error'); }
}
async function applySuggestion(btn) {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const suggestionId = btn?.dataset?.suggestionId || '';
    const suggestion = (FORECAST.suggestions || []).find((entry) => entry.id === suggestionId);
    if (!suggestion) return;
    try {
        const sourceId = suggestion.preferredSourceId || suggestion.monthlyAllocations?.[0]?.sourceId || suggestion.onceAllocations?.[0]?.sourceId || '';
        if (!sourceId) return alertUser('Kein eigenes Quellkonto für den Vorschlag gefunden.', 'error');
        const effectiveFrom = suggestion.effectiveFrom || monthKeyFirstBusinessDay(suggestion.criticalMonth || currentMonthKey(), 1) || isoDate(new Date());
        const onceDate = suggestion.onceDate || monthKeyFirstBusinessDay(suggestion.criticalMonth || currentMonthKey(), 1) || effectiveFrom;
        if (Math.abs(toNum(suggestion.monthlyNeed, 0)) > 0.009) {
            const currentTransfer = suggestion.recommendedTransferId ? TRANSFERS[suggestion.recommendedTransferId] : null;
            const targetValidTo = currentTransfer?.validTo || '';
            const delta = toNum(suggestion.monthlyNeed, 0);
            const newAmount = roundMoney(Math.max(0, toNum(suggestion.recommendedMonthlyAmount, toNum(currentTransfer?.amount, 0) + delta)));
            if (currentTransfer) {
                const oldEndIso = previousDateIso(effectiveFrom);
                if (!oldEndIso || parseDate(oldEndIso) < parseDate(currentTransfer.validFrom)) {
                    return alertUser('Vorschlag kann nicht versioniert werden. Bitte "Gültig ab" für den Vorschlag später wählen.', 'error');
                }
                await updateDoc(doc(transfersRef, currentTransfer.id), { validTo: oldEndIso, updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() });
                if (newAmount <= 0.009) {
                    await writeAudit('update', 'transfer_plan', currentTransfer.id, cloneClean(currentTransfer), { validTo: oldEndIso }, { action: 'apply_suggestion_monthly_stop', suggestionId });
                } else {
                    const linkedTitleAllocations = normalizeTransferLinkedAllocations(currentTransfer.linkedTitleAllocations || [{ titleKey: UNASSIGNED_TITLE_KEY, amount: newAmount }]);
                    const payload = {
                        ...cloneClean(currentTransfer),
                        amount: newAmount,
                        validFrom: effectiveFrom,
                        validTo: targetValidTo,
                        sourceTransferId: currentTransfer.sourceTransferId || currentTransfer.id,
                        linkedTitles: linkedTitleAllocations.map((row) => row.titleKey),
                        linkedTitleAllocations,
                        createdBy: currentTransfer.createdBy || uid(),
                        createdByName: currentTransfer.createdByName || currentUser?.displayName || 'Unbekannt',
                        updatedBy: currentUser?.displayName || 'Unbekannt',
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                        note: `${currentTransfer.note ? `${currentTransfer.note} | ` : ''}AB2 Empfehlung ${formatDate(effectiveFrom)}`
                    };
                    const ref = await addDoc(transfersRef, payload);
                    await writeAudit('abtausch', 'transfer_plan', currentTransfer.id, cloneClean(currentTransfer), { newTransferId: ref.id, oldEndIso, newAmount, effectiveFrom }, { action: 'apply_suggestion_monthly_split', suggestionId });
                }
            } else {
                if (newAmount <= 0.009) {
                    await writeAudit('info', 'transfer_plan', '', null, { targetId: suggestion.targetId, sourceId, effectiveFrom }, { action: 'apply_suggestion_monthly_skip_zero', suggestionId });
                } else {
                    const linkedTitleAllocations = [{ titleKey: UNASSIGNED_TITLE_KEY, amount: newAmount }];
                    const payload = { sourceAccountId: sourceId, targetAccountId: suggestion.targetId, amount: newAmount, intervalType: 'monthly', startMonth: null, customMonths: [], dayOfMonth: 1, validFrom: effectiveFrom, validTo: '', note: `Automatisch aus AB2-Vorschlag (${suggestion.reason})`, linkedTitles: [UNASSIGNED_TITLE_KEY], linkedTitleAllocations, createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
                    const ref = await addDoc(transfersRef, payload);
                    await writeAudit('create', 'transfer_plan', ref.id, null, payload, { action: 'apply_suggestion_monthly_create', suggestionId });
                }
            }
        }
        if (toNum(suggestion.onceNeed, 0) > 0.009) {
            const linkedTitleAllocations = [{ titleKey: UNASSIGNED_TITLE_KEY, amount: roundMoney(suggestion.onceNeed) }];
            const payload = { sourceAccountId: sourceId, targetAccountId: suggestion.targetId, amount: roundMoney(suggestion.onceNeed), intervalType: 'once', startMonth: null, customMonths: [], dayOfMonth: 1, validFrom: onceDate, validTo: onceDate, note: `Einmaliger AB2-Ausgleich (${suggestion.reason}) · nach Eingang per Snapshot bestätigen`, linkedTitles: [UNASSIGNED_TITLE_KEY], linkedTitleAllocations, createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
            const ref = await addDoc(transfersRef, payload);
            await writeAudit('create', 'transfer_plan', ref.id, null, payload, { action: 'apply_suggestion_once', suggestionId });
        }
        await upsertSuggestionAction(suggestion, { plannedApplied: true });
        alertUser('Vorschlag übernommen (geplant). Bitte danach als "tatsächlich durchgeführt" markieren.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Übernehmen: ${error.message || error}`, 'error'); }
}
async function abtausch() {
    const id = el('ab2-item-id')?.value || '';
    const before = ITEMS[id];
    const newStart = el('ab2-abtausch-new-start')?.value || '';
    const newAmount = roundMoney(toNum(el('ab2-abtausch-new-amount')?.value, 0));
    if (!before) return alertUser('Eintrag nicht gefunden.', 'error');
    if (!newStart || newAmount <= 0) return alertUser('Bitte neues Startdatum und Betrag ausfüllen.', 'error');
    const oldEnd = parseDate(newStart);
    oldEnd.setDate(oldEnd.getDate() - 1);
    if (oldEnd < parseDate(before.validFrom)) return alertUser('Neues Startdatum muss nach dem bisherigen Start liegen.', 'error');
    const oldEndIso = isoDate(oldEnd);
    const next = { ...cloneClean(before), amount: newAmount, validFrom: newStart, validTo: before.validTo || '', sourceItemId: before.id, createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    try {
        await updateDoc(doc(itemsRef, before.id), { validTo: oldEndIso, updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() });
        const ref = await addDoc(itemsRef, next);
        await writeAudit('abtausch', 'cost_item', before.id, cloneClean(before), { newItemId: ref.id, newStart, newAmount, oldEndIso }, { action: 'abtausch' });
        closeModal('ab2-abtausch-modal');
        closeModal('ab2-item-modal');
        resetItemForm();
        alertUser('Abtausch übernommen.', 'success');
    } catch (error) { console.error(error); alertUser(`Fehler beim Abtausch: ${error.message || error}`, 'error'); }
}
function closeAllHelpHints() { document.querySelectorAll('.ab2-help-content').forEach((node) => node.classList.add('hidden')); }
function toggleHelpHint(targetId) {
    const target = el(targetId);
    if (!target) return;
    const willOpen = target.classList.contains('hidden');
    closeAllHelpHints();
    if (willOpen) target.classList.remove('hidden');
}
function openItem(id, readOnly = false) {
    const item = ITEMS[id];
    if (!item) return alertUser('Eintrag nicht gefunden.', 'error');
    fillItemForm(item, readOnly);
    openModal('ab2-item-modal');
}

function openAccountMetricInfo(metricKey, accountId) {
    const account = ACCOUNTS[accountId] || null;
    if (!account) return;
    const row = FORECAST.timeline[0]?.accounts[accountId] || {};
    const transferDiff = accountTransferBudgetDiff(accountId);
    if (metricKey === 'day') {
        const criticalText = row.criticalDate
            ? `<div class="mt-1">Kritischer Tag in der Vorschau: <strong>${formatDate(row.criticalDate)}</strong>.</div>`
            : '<div class="mt-1">Aktuell gibt es in der Vorschau keinen einzelnen kritischen Tag.</div>';
        openDetail(
            `Erklärung · Tages-Δ (${account.name || '-'})`,
            `<div class="space-y-2 text-sm text-slate-700"><p><strong>Tages-Δ</strong> ist die niedrigste Tagesabweichung in der ${forecastHorizonMonths}-Monats-Prognose. Dafür wird pro Tag gerechnet: Kontostand minus Tagesbedarf.</p><p>Ein negativer Wert bedeutet, dass der Bedarf an mindestens einem Tag nicht vollständig gedeckt war. Je negativer der Wert ist, desto größer ist die Unterdeckung am schlechtesten Tag.</p><p>Ein positiver Wert zeigt, dass selbst am kritischsten Tag noch Reserve vorhanden war.</p>${criticalText}</div>`
        );
        return;
    }
    if (metricKey === 'transfer') {
        openDetail(
            `Erklärung · Transfer-Δ (${account.name || '-'})`,
            `<div class="space-y-2 text-sm text-slate-700"><p><strong>Transfer-Δ</strong> vergleicht die Summe der Transfer-Zuordnungen mit den dafür verplanten Transferbeträgen für dieses Konto.</p><p>Ein negativer Wert heißt: Es wurde mehr zugeordnet als aktuell durch Transfers bereitsteht. Dann ist ein Teil der Kosten rechnerisch noch offen.</p><p>Ein positiver Wert heißt: Es ist noch nicht vollständig verplantes Transfer-Budget vorhanden, das für weitere Zuordnungen genutzt werden kann.</p><p>Aktueller Wert: <strong>${formatSignedCurrency(transferDiff)}</strong>.</p></div>`
        );
    }
}

function openStatInsight(statKey) {
    let html = '<p class="text-sm text-gray-500">Keine Details vorhanden.</p>';
    if (statKey === 'accounts') {
        html = Object.values(ACCOUNTS).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((account) => {
            const row = FORECAST.timeline[0]?.accounts[account.id] || {};
            return `<div class="rounded-lg border border-gray-200 p-3"><div class="font-bold text-gray-800">${escapeHtml(account.name || '-')}</div><div class="text-xs text-gray-500 mt-1">Stand ${formatCurrency(row.end)} · Puffer ${formatCurrency(accountMinBuffer(account))} · Min Tages-Δ ${formatSignedCurrency(toNum(row.minDayDelta, toNum(row.delta, 0)))}${row.criticalDate ? ` · kritisch am ${formatDate(row.criticalDate)}` : ''}</div></div>`;
        }).join('') || html;
        return openDetail('Konten-Analyse', `<div class="space-y-2">${html}</div>`);
    }
    if (['aktiv', 'geplant', 'vergangen', 'fehler'].includes(statKey)) {
        html = Object.values(ITEMS).filter((item) => itemStatus(item).key === statKey).map((item) => `<div class="rounded-lg border border-gray-200 p-3"><div class="font-bold text-gray-800">${escapeHtml(item.title || '-')}</div><div class="text-xs text-gray-500 mt-1">${escapeHtml(ACCOUNTS[item.accountId]?.name || '-')} · ${formatCurrency(item.amount)} · ${escapeHtml(intervalLabel(item.intervalType, item.customMonths || []))}</div></div>`).join('') || html;
        return openDetail(`Status: ${statKey.toUpperCase()}`, `<div class="space-y-2">${html}</div>`);
    }
    if (statKey === 'warnings' || statKey === 'alarms') {
        const severity = statKey === 'alarms' ? 'alarm' : 'warn';
        const forecastRows = FORECAST.alerts
            .filter((alert) => alert.severity === severity)
            .map((alert) => `<div class="rounded-lg border ${severity === 'alarm' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="font-bold text-gray-800">${escapeHtml(alert.accountName || '-')}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(monthLabel(alert.monthKey))} · Endstand ${formatCurrency(alert.endBalance)} · Puffer ${formatCurrency(alert.minBuffer)} · Min Tages-Δ ${formatSignedCurrency(alert.minDayDelta)}${alert.criticalDate ? ` · kritisch am ${formatDate(alert.criticalDate)}` : ''}</div><div class="text-xs mt-1 ${severity === 'alarm' ? 'text-red-800' : 'text-amber-800'}">Tageslogik-Hinweis: Am kritischen Tag wird zuerst die Abbuchung gerechnet. ${severity === 'alarm' ? 'Empfehlung: Dauerauftrag erhöhen oder Einmalüberweisung vor diesem Tag einplanen.' : 'Puffer ist knapp: kleinen Zuschlag prüfen oder Verlauf eng beobachten.'}</div></div>`)
            .join('');
        const imbalanceRows = (FORECAST.imbalances || [])
            .filter((entry) => entry.severity === severity)
            .map((entry) => {
                const details = (Array.isArray(entry.details) ? entry.details : [])
                    .map((row) => `${row.sourceName || '-'}: ${formatCurrency(row.amount)}${Number.isFinite(toNum(row.amountPerMonth, NaN)) ? ` (${formatCurrency(row.amountPerMonth)} / Monat)` : ''} (${row.kind || '-'})`)
                    .join(' · ');
                return `<div class="rounded-lg border ${severity === 'alarm' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="font-bold text-gray-800">${escapeHtml(entry.title)}</div><div class="text-xs text-gray-600 mt-1">Konto ${escapeHtml(entry.accountName)} · Lücke ${formatSignedCurrency(entry.gapPerMonth)} / Monat (${entry.gapPerMonth < 0 ? 'zu wenig' : 'zu viel'})</div><div class="text-xs text-gray-600 mt-1">${entry.horizonMonths || forecastHorizonMonths}M-Horizont: ${formatSignedCurrency(entry.gapInHorizon)} → ${entry.actionText}</div>${details ? `<div class="text-xs text-gray-600 mt-1">Zugeordnete Zahler: ${escapeHtml(details)}</div>` : ''}</div>`;
            })
            .join('');
        const sections = [];
        if (forecastRows) sections.push(`<div class="space-y-2"><div class="text-xs font-bold uppercase tracking-wide text-gray-500">Konten-Prognose</div>${forecastRows}</div>`);
        if (imbalanceRows) sections.push(`<div class="space-y-2"><div class="text-xs font-bold uppercase tracking-wide text-gray-500">Titel-/Beitrags-Ungleichgewicht</div>${imbalanceRows}</div>`);
        html = sections.join('<div class="h-3"></div>') || html;
        return openDetail(severity === 'alarm' ? 'Alarm-Details' : 'Warnungs-Details', `<div class="space-y-2">${html}</div>`);
    }
    return openDetail('Info', html);
}
function openSetupInsight(setupKey) {
    const targets = Object.values(ACCOUNTS).filter(isRelevantTargetAccount).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const qualityIssues = (FORECAST.quality || []).filter((entry) => entry.status !== 'ok');
    if (setupKey === 'accounts') {
        const html = Object.values(ACCOUNTS)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .map((account) => `<div class="rounded-lg border border-gray-200 p-3"><div class="font-bold text-gray-800">${escapeHtml(account.name || '-')}</div><div class="text-xs text-gray-600 mt-1">Typ: ${escapeHtml(isPersonAccount(account) ? 'Person' : 'Bank')} · Rolle: ${escapeHtml(normalizeAccountRole(account))}</div></div>`)
            .join('') || '<p class="text-sm text-gray-500">Keine Konten vorhanden.</p>';
        return openDetail('Setup · Konten', `<div class="space-y-2">${html}</div>`);
    }
    if (setupKey === 'target_accounts') {
        const html = targets.map((account) => {
            const row = FORECAST.timeline[0]?.accounts[account.id] || {};
            return `<div class="rounded-lg border border-gray-200 p-3"><div class="font-bold text-gray-800">${escapeHtml(account.name || '-')}</div><div class="text-xs text-gray-600 mt-1">Puffer ${formatCurrency(accountMinBuffer(account))} · Aktueller Stand ${formatCurrency(row.end)} · Min Tages-Δ ${formatSignedCurrency(toNum(row.minDayDelta, toNum(row.delta, 0)))}</div></div>`;
        }).join('') || '<p class="text-sm text-gray-500">Keine Zielkonten vorhanden.</p>';
        return openDetail('Setup · Zielkonten', `<div class="space-y-2">${html}</div>`);
    }
    if (setupKey === 'items') {
        const html = Object.values(ITEMS)
            .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
            .map((item) => `<div class="rounded-lg border border-gray-200 p-3"><div class="font-bold text-gray-800">${escapeHtml(item.title || '-')}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(ACCOUNTS[item.accountId]?.name || '-')} · ${formatCurrency(item.amount)} · ${escapeHtml(intervalLabel(item.intervalType, item.customMonths || []))}</div></div>`)
            .join('') || '<p class="text-sm text-gray-500">Keine Einträge vorhanden.</p>';
        return openDetail('Setup · Einträge', `<div class="space-y-2">${html}</div>`);
    }
    if (setupKey === 'quality') {
        const html = qualityIssues
            .map((entry) => `<div class="rounded-lg border ${entry.status === 'alarm' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="font-bold text-gray-800">${escapeHtml(ACCOUNTS[entry.accountId]?.name || '-')}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(entry.text)}${entry.latest ? ` · letzter Snapshot ${formatDate(entry.latest.date)}` : ''}</div></div>`)
            .join('') || '<p class="text-sm text-gray-500">Alle Zielkonten haben aktuelle Snapshot-Daten.</p>';
        return openDetail('Setup · Datenqualität (nur Zielkonten)', `<div class="space-y-2">${html}</div>`);
    }
    if (setupKey === 'imbalances') {
        const html = (FORECAST.imbalances || [])
            .map((entry) => `<div class="rounded-lg border ${entry.severity === 'alarm' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="font-bold text-gray-800">${escapeHtml(entry.title || '-')}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(entry.accountName || '-')} · Lücke ${formatSignedCurrency(entry.gapPerMonth)} / Monat · ${entry.horizonMonths || forecastHorizonMonths}M: ${formatSignedCurrency(entry.gapInHorizon)}</div></div>`)
            .join('') || '<p class="text-sm text-gray-500">Keine Ungleichgewichte gefunden.</p>';
        return openDetail('Setup · Titel-Beiträge', `<div class="space-y-2">${html}</div>`);
    }
    if (setupKey === 'forecast') {
        const alerts = (FORECAST.alerts || []).slice().sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey)) || String(a.accountName || '').localeCompare(String(b.accountName || '')));
        const html = alerts.map((alert) => `<div class="rounded-lg border ${alert.severity === 'alarm' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="font-bold text-gray-800">${escapeHtml(alert.accountName || '-')}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(monthLabel(alert.monthKey))} · Endstand ${formatCurrency(alert.endBalance)} · Puffer ${formatCurrency(alert.minBuffer)} · Min Tages-Δ ${formatSignedCurrency(alert.minDayDelta)}${alert.criticalDate ? ` · kritisch am ${formatDate(alert.criticalDate)}` : ''}</div><div class="text-xs mt-1 ${alert.severity === 'alarm' ? 'text-red-800' : 'text-amber-800'}">${alert.severity === 'alarm' ? 'Maßnahme empfohlen: Dauerauftrag erhöhen bzw. Einmalüberweisung vor dem kritischen Tag planen.' : 'Hinweis: Puffer liegt knapp über dem Minimum, Verlauf weiter beobachten.'}</div></div>`).join('') || '<p class="text-sm text-gray-500">Prognose aktuell ohne Warnung/Alarm.</p>';
        return openDetail('Setup · Kontostandsprognose (nur Zielkonten)', `<div class="space-y-2">${html}</div>`);
    }
    return openDetail('Setup', '<p class="text-sm text-gray-500">Keine Details verfügbar.</p>');
}
function reconContextForMonth(accountId, year, month) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const rows = Object.values(RECON)
        .filter((entry) => entry.accountId === accountId && entry.date)
        .map((entry) => ({ ...entry, parsedDate: parseDate(entry.date) }))
        .filter((entry) => entry.parsedDate)
        .sort((a, b) => a.parsedDate - b.parsedDate);
    const within = rows.filter((entry) => entry.parsedDate >= monthStart && entry.parsedDate <= monthEnd);
    const before = [...rows].reverse().find((entry) => entry.parsedDate < monthStart) || null;
    const after = rows.find((entry) => entry.parsedDate > monthEnd) || null;
    return { before, within, after };
}

function reconContextLine(label, entry) {
    if (!entry) return `<div class="text-xs text-gray-500">${label}: -</div>`;
    const typeLabel = entry.type === 'snapshot' ? 'Snapshot' : 'Manuell';
    const amountLabel = entry.type === 'snapshot' ? formatCurrency(entry.value) : formatSignedCurrency(entry.value);
    return `<div class="text-xs text-gray-600">${label}: ${typeLabel} ${formatDate(entry.date)} · <span class="font-bold text-gray-800">${amountLabel}</span></div>`;
}

function openForecastInsight(month) {
    const bucket = (FORECAST.timeline || []).find((entry) => entry.key === month) || null;
    if (!bucket) return;
    const monitored = Object.values(ACCOUNTS)
        .filter(isRelevantTargetAccount)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    const totalOld = roundMoney(monitored.reduce((sum, account) => sum + toNum(FORECAST.details[`${account.id}__${month}`]?.start, 0), 0));
    const totalNew = roundMoney(monitored.reduce((sum, account) => sum + toNum(FORECAST.details[`${account.id}__${month}`]?.end, 0), 0));

    const cards = monitored.map((account) => {
        const detail = FORECAST.details[`${account.id}__${month}`] || { start: 0, inflow: 0, outflow: 0, end: 0, delta: 0, entries: [] };
        const flowDiff = roundMoney(toNum(detail.inflow, 0) - toNum(detail.outflow, 0));
        const flowDiffClass = flowDiff > 0.009 ? 'text-emerald-700' : flowDiff < -0.009 ? 'text-red-700' : 'text-gray-800';
        const flowDiffText = flowDiff > 0.009
            ? `+${formatCurrency(flowDiff)}`
            : flowDiff < -0.009
                ? `-${formatCurrency(Math.abs(flowDiff))}`
                : '0.00 €';
        const movementRows = (detail.entries || []).map((entry) => `<tr class="border-t"><td class="p-2 text-xs text-gray-600">${formatDateWithWeekday(entry.date)}</td><td class="p-2 text-xs sm:text-sm text-gray-700">${escapeHtml(entry.label || '-')}</td><td class="p-2 text-xs sm:text-sm font-bold ${toNum(entry.amount, 0) < 0 ? 'text-red-700' : 'text-emerald-700'}">${entry.type === 'snapshot' ? formatCurrency(entry.amount) : formatSignedCurrency(entry.amount)}</td><td class="p-2 text-xs text-gray-500">${escapeHtml(entry.note || '')}</td></tr>`).join('');
        return `<div class="rounded-xl border border-gray-200 bg-gray-50 p-3"><div class="font-bold text-gray-800 text-sm sm:text-base">${escapeHtml(account.name || '-')}</div><div class="mt-2 text-[11px] text-gray-500 font-bold flex items-center gap-2"><span class="text-base">↓</span><span>Buchungen laufen von oben nach unten</span></div><div class="mt-2 overflow-x-auto"><table class="min-w-full"><thead><tr><th class="p-2 text-left text-[10px] sm:text-xs font-bold text-gray-500 uppercase">Datum</th><th class="p-2 text-left text-[10px] sm:text-xs font-bold text-gray-500 uppercase">Wirkung</th><th class="p-2 text-left text-[10px] sm:text-xs font-bold text-gray-500 uppercase">Betrag</th><th class="p-2 text-left text-[10px] sm:text-xs font-bold text-gray-500 uppercase">Notiz</th></tr></thead><tbody>${movementRows || '<tr><td colspan="4" class="p-3 text-xs text-gray-400 italic">Keine Bewegungen in diesem Monat.</td></tr>'}</tbody></table></div><div class="mt-2 text-[11px] text-gray-600">Zufluss ${formatCurrency(detail.inflow)} · Abfluss ${formatCurrency(detail.outflow)} · Differenz <span class="font-extrabold ${flowDiffClass}">${flowDiffText}</span> · Δ zum Puffer ${formatSignedCurrency(detail.delta)}</div></div>`;
    }).join('');

    openDetail(`Monatsübersicht ${bucket.label}`, `<div class="h-[68vh] sm:h-[72vh] max-h-[72vh] flex flex-col overflow-hidden"><div class="shrink-0 rounded-lg border border-slate-300 bg-slate-100 p-3 shadow-sm"><div class="text-[10px] uppercase tracking-wide text-slate-600">ALT (Start des Monats)</div><div class="text-lg sm:text-xl font-extrabold text-slate-900">${formatCurrency(totalOld)}</div></div><div class="shrink-0 mt-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-2">Reihenfolge ist bewusst: <strong>oben ALT</strong> → dann alle Buchungen → <strong>unten NEU</strong>.</div><div class="flex-1 min-h-0 overflow-y-auto mt-2 space-y-3 pr-1">${cards || '<p class="text-sm text-gray-500">Keine Kontodaten vorhanden.</p>'}</div><div class="shrink-0 mt-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3 shadow-md"><div class="text-[10px] uppercase tracking-wide text-emerald-700">NEU (Monatsende nach allen Buchungen)</div><div class="text-lg sm:text-xl font-extrabold text-emerald-800">${formatCurrency(totalNew)}</div></div></div>`);
}
function resetFilters() {
    filterTokens = [];
    filterState = { negate: false, joinMode: 'and', status: '', typ: '', interval: '', quick: '', sort: 'critical' };
    if (el('ab2-search-input')) el('ab2-search-input').value = '';
    if (el('ab2-filter-negate')) el('ab2-filter-negate').checked = false;
    if (el('ab2-search-join-mode')) el('ab2-search-join-mode').value = 'and';
    if (el('ab2-filter-status')) el('ab2-filter-status').value = '';
    if (el('ab2-filter-typ')) el('ab2-filter-typ').value = '';
    if (el('ab2-filter-interval')) el('ab2-filter-interval').value = '';
    if (el('ab2-filter-sort')) el('ab2-filter-sort').value = 'critical';
    renderTags();
    renderTable();
}
function addToken() {
    const input = el('ab2-search-input');
    if (!input) return;
    const value = normalizeSearchText(input.value);
    if (!value) return;
    if (!filterTokens.includes(value)) filterTokens.push(value);
    input.value = '';
    renderTags();
    renderTable();
}
function bindEvents() {
    if (listenersBound) return;
    listenersBound = true;
    const on = (id, event, handler) => { const node = el(id); if (node && !node.dataset.listenerAttached) { node.addEventListener(event, handler); node.dataset.listenerAttached = 'true'; } };

    on('ab2-btn-create', 'click', () => { if (!canCreate()) return alertUser('Keine Berechtigung.', 'error'); resetItemForm(); openModal('ab2-item-modal'); });
    on('ab2-open-accounts-modal', 'click', () => { resetAccountForm('list'); openModal('ab2-accounts-modal'); setAccountSplitMode('right'); });
    on('ab2-open-transfers-modal', 'click', () => { resetTransferForm('list'); openModal('ab2-transfers-modal'); setTransferSplitMode('right'); });
    on('ab2-open-recon-modal', 'click', () => { resetReconForm('list'); openModal('ab2-reconciliation-modal'); setReconSplitMode('right'); });
    on('ab2-open-settings-menu-modal', 'click', () => openModal('ab2-settings-menu-modal'));
    on('ab2-close-settings-menu-modal', 'click', () => closeModal('ab2-settings-menu-modal'));
    on('ab2-cancel-settings-menu-btn', 'click', () => closeModal('ab2-settings-menu-modal'));
    on('ab2-settings-open-accounts', 'click', () => { closeModal('ab2-settings-menu-modal'); resetAccountForm('list'); openModal('ab2-accounts-modal'); });
    on('ab2-settings-open-transfers', 'click', () => { closeModal('ab2-settings-menu-modal'); resetTransferForm('list'); openModal('ab2-transfers-modal'); });
    on('ab2-settings-open-recon', 'click', () => { closeModal('ab2-settings-menu-modal'); resetReconForm('list'); openModal('ab2-reconciliation-modal'); });
    on('ab2-settings-open-payments', 'click', () => { closeModal('ab2-settings-menu-modal'); renderPaymentsOverview(); openModal('ab2-payments-modal'); });
    on('ab2-close-payments-modal', 'click', () => closeModal('ab2-payments-modal'));
    on('ab2-cancel-payments-btn', 'click', () => closeModal('ab2-payments-modal'));
    on('ab2-open-suggestions-modal', 'click', () => { renderSuggestionsModal(); openModal('ab2-suggestions-modal'); });
    on('ab2-toggle-glossary', 'click', () => el('ab2-glossary')?.classList.toggle('hidden'));
    on('ab2-forecast-toggle', 'click', () => {
        const expanded = !el('ab2-forecast-overview-wrap')?.classList.contains('hidden');
        setForecastExpanded(!expanded, true);
    });
    on('ab2-simulation-datum', 'change', (e) => applySimulationDate(e.target?.value || ''));
    on('ab2-clear-simulation', 'click', () => applySimulationDate(''));
    on('ab2-forecast-horizon', 'change', (e) => {
        setForecastHorizon(e.target?.value || forecastHorizonMonths, true);
        rebuildForecastAndRender();
    });
    on('ab2-close-amount-unlock-modal', 'click', closeAmountUnlockModal);
    on('ab2-cancel-amount-unlock-btn', 'click', closeAmountUnlockModal);
    on('ab2-confirm-amount-unlock-btn', 'click', () => {
        if (amountUnlockSecondsLeft > 0 || !amountUnlockMode || !amountUnlockEntityId) return;
        if (amountUnlockMode === 'account') {
            accountAmountUnlockForId = amountUnlockEntityId;
            syncAccountAmountLockState();
        } else if (amountUnlockMode === 'transfer') {
            transferAmountUnlockForId = amountUnlockEntityId;
            syncTransferAmountLockState();
        }
        closeAmountUnlockModal();
        alertUser('Betrag freigegeben. Bitte nur für Korrekturen nutzen.', 'info');
    });
    on('ab2-account-unlock-amount-btn', 'click', () => {
        const id = el('ab2-account-id')?.value || '';
        if (!id) return;
        openAmountUnlockModal('account', id);
    });
    on('ab2-transfer-unlock-amount-btn', 'click', () => {
        const id = el('ab2-transfer-id')?.value || '';
        if (!id) return;
        openAmountUnlockModal('transfer', id);
    });
    on('ab2-account-abtausch-btn', 'click', prepareAccountAbtausch);
    on('ab2-transfer-abtausch-btn', 'click', () => {
        const id = el('ab2-transfer-id')?.value || '';
        if (!id) return;
        openTransferAbtauschModal(id);
    });
    on('ab2-close-transfer-abtausch-modal', 'click', () => closeModal('ab2-transfer-abtausch-modal'));
    on('ab2-cancel-transfer-abtausch-btn', 'click', () => closeModal('ab2-transfer-abtausch-modal'));
    on('ab2-save-transfer-abtausch-btn', 'click', saveTransferAbtausch);
    on('ab2-transfer-abtausch-new-start', 'change', () => updateTransferAbtauschOldEndFromStart(false));
    on('ab2-transfer-abtausch-old-end', 'input', () => { transferAbtauschOldEndManual = true; });

    on('ab2-close-item-modal', 'click', () => closeModal('ab2-item-modal'));
    on('ab2-cancel-item-btn', 'click', () => closeModal('ab2-item-modal'));
    on('ab2-item-save-btn', 'click', saveItem);
    on('ab2-item-edit-btn', 'click', () => {
        const id = el('ab2-item-id')?.value || '';
        if (id && ITEMS[id]) {
            fillItemForm(ITEMS[id], false);
            return;
        }
        setItemReadOnly(false);
    });
    on('ab2-item-delete-btn', 'click', () => deleteItem(el('ab2-item-id')?.value || ''));
    on('ab2-item-interval', 'change', () => { updateMainIntervalFields('ab2-item'); renderPreviews(); });
    on('ab2-item-abtausch-btn', 'click', () => {
        const item = ITEMS[el('ab2-item-id')?.value || ''];
        if (!item) return;
        if (el('ab2-abtausch-old-info')) el('ab2-abtausch-old-info').textContent = `${item.title || '-'} · ${formatCurrency(item.amount)} · ${formatDate(item.validFrom)}${item.validTo ? ` bis ${formatDate(item.validTo)}` : ' fortlaufend'}`;
        if (el('ab2-abtausch-new-start')) el('ab2-abtausch-new-start').value = isoDate(new Date());
        if (el('ab2-abtausch-new-amount')) el('ab2-abtausch-new-amount').value = toNum(item.amount, 0).toFixed(2);
        renderPreviews();
        openModal('ab2-abtausch-modal');
    });
    on('ab2-close-abtausch-modal', 'click', () => closeModal('ab2-abtausch-modal'));
    on('ab2-cancel-abtausch-btn', 'click', () => closeModal('ab2-abtausch-modal'));
    on('ab2-save-abtausch-btn', 'click', abtausch);

    on('ab2-close-accounts-modal', 'click', () => closeModal('ab2-accounts-modal'));
    on('ab2-save-account-btn', 'click', saveAccount);
    on('ab2-reset-account-btn', 'click', resetAccountForm);
    on('ab2-account-type', 'change', () => { updateAccountTypeDependencies(); renderPreviews(); });
    on('ab2-account-role', 'change', () => { updateAccountTypeDependencies(); renderPreviews(); });
    on('ab2-accounts-filter-all', 'click', () => { accountListFilterState.type = 'all'; renderAccounts(); });
    on('ab2-accounts-filter-bank', 'click', () => { accountListFilterState.type = 'bank'; renderAccounts(); });
    on('ab2-accounts-filter-person', 'click', () => { accountListFilterState.type = 'person'; renderAccounts(); });
    on('ab2-accounts-show-active-toggle', 'change', (e) => { accountListFilterState.showActive = !!e.target?.checked; renderAccounts(); });
    on('ab2-accounts-show-planned-toggle', 'change', (e) => { accountListFilterState.showPlanned = !!e.target?.checked; renderAccounts(); });
    on('ab2-accounts-show-past-toggle', 'change', (e) => { accountListFilterState.showPast = !!e.target?.checked; renderAccounts(); });
    on('ab2-accounts-search', 'input', (e) => { accountListFilterState.query = e.target.value || ''; renderAccounts(); });
    on('ab2-close-person-control-modal', 'click', closePersonControlModal);
    on('ab2-cancel-person-control-btn', 'click', closePersonControlModal);
    on('ab2-person-control-refresh-btn', 'click', renderPersonControlRows);
    on('ab2-person-control-from', 'change', renderPersonControlRows);
    on('ab2-person-control-to', 'change', renderPersonControlRows);
    on('ab2-person-control-finish-btn', 'click', finishPersonControl);

    on('ab2-close-transfers-modal', 'click', () => closeModal('ab2-transfers-modal'));
    on('ab2-save-transfer-btn', 'click', saveTransfer);
    on('ab2-reset-transfer-btn', 'click', resetTransferForm);
    on('ab2-transfer-interval', 'change', () => { updateMainIntervalFields('ab2-transfer'); renderPreviews(); });
    on('ab2-transfers-filter-all', 'click', () => { transferListFilterState.type = 'all'; renderTransfers(); });
    on('ab2-transfers-filter-bank', 'click', () => { transferListFilterState.type = 'bank'; renderTransfers(); });
    on('ab2-transfers-filter-person', 'click', () => { transferListFilterState.type = 'person'; renderTransfers(); });
    on('ab2-transfers-show-active-toggle', 'change', (e) => { transferListFilterState.showActive = !!e.target?.checked; renderTransfers(); });
    on('ab2-transfers-show-planned-toggle', 'change', (e) => { transferListFilterState.showPlanned = !!e.target?.checked; renderTransfers(); });
    on('ab2-transfers-show-past-toggle', 'change', (e) => { transferListFilterState.showPast = !!e.target?.checked; renderTransfers(); });
    on('ab2-transfers-search', 'input', (e) => { transferListFilterState.query = e.target.value || ''; renderTransfers(); });

    on('ab2-close-recon-modal', 'click', () => closeModal('ab2-reconciliation-modal'));
    on('ab2-save-recon-btn', 'click', saveRecon);
    on('ab2-cancel-recon-btn', 'click', () => closeModal('ab2-reconciliation-modal'));
    on('ab2-close-suggestions-modal', 'click', () => closeModal('ab2-suggestions-modal'));
    on('ab2-close-detail-modal', 'click', () => closeModal('ab2-detail-modal'));

    on('ab2-stat-card-accounts', 'click', () => openStatInsight('accounts'));
    on('ab2-stat-card-active', 'click', () => openStatInsight('aktiv'));
    on('ab2-stat-card-planned', 'click', () => openStatInsight('geplant'));
    on('ab2-stat-card-past', 'click', () => openStatInsight('vergangen'));
    on('ab2-stat-card-errors', 'click', () => openStatInsight('fehler'));
    on('ab2-stat-card-warnings', 'click', () => openStatInsight('warnings'));
    on('ab2-stat-card-alarms', 'click', () => openStatInsight('alarms'));

    on('ab2-toggle-filter-controls', 'click', async () => {
        const wrap = el('ab2-filter-controls-wrapper');
        const icon = el('ab2-toggle-filter-icon');
        if (!wrap) return;
        wrap.classList.toggle('hidden');
        icon?.classList.toggle('rotate-180', !wrap.classList.contains('hidden'));
        try { await saveUserSetting('ab2_filter_open', wrap.classList.contains('hidden') ? '0' : '1'); } catch (error) { console.warn(error); }
    });
    on('ab2-add-filter-btn', 'click', addToken);
    on('ab2-search-input', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addToken(); } });
    on('ab2-reset-filters', 'click', resetFilters);
    on('ab2-filter-negate', 'change', (e) => { filterState.negate = e.target.checked; renderTable(); });
    on('ab2-search-join-mode', 'change', (e) => { filterState.joinMode = e.target.value === 'or' ? 'or' : 'and'; renderTable(); });
    on('ab2-filter-status', 'change', (e) => { filterState.status = e.target.value || ''; renderTable(); });
    on('ab2-filter-typ', 'change', (e) => { filterState.typ = e.target.value || ''; renderTable(); });
    on('ab2-filter-interval', 'change', (e) => { filterState.interval = e.target.value || ''; renderTable(); });
    on('ab2-filter-sort', 'change', (e) => { filterState.sort = e.target.value || 'critical'; renderTable(); });

    document.querySelectorAll('.ab2-quick-filter').forEach((btn) => {
        if (!btn.dataset.listenerAttached) {
            btn.addEventListener('click', () => { filterState.quick = btn.dataset.value || ''; renderTags(); renderTable(); });
            btn.dataset.listenerAttached = 'true';
        }
    });
    ['ab2-item-modal', 'ab2-accounts-modal', 'ab2-transfers-modal', 'ab2-reconciliation-modal', 'ab2-abtausch-modal', 'ab2-transfer-abtausch-modal'].forEach((id) => {
        const node = el(id);
        if (node && !node.dataset.previewAttached) {
            node.addEventListener('input', renderPreviews);
            node.addEventListener('change', renderPreviews);
            node.dataset.previewAttached = 'true';
        }
    });

    const tagHost = el('ab2-active-search-tags');
    if (tagHost && !tagHost.dataset.listenerAttached) {
        tagHost.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-token]');
            if (!btn) return;
            const idx = parseInt(btn.dataset.removeToken || '-1', 10);
            if (idx >= 0 && idx < filterTokens.length) filterTokens.splice(idx, 1);
            renderTags();
            renderTable();
        });
        tagHost.dataset.listenerAttached = 'true';
    }
    const setupHost = el('ab2-setup-panel');
    if (setupHost && !setupHost.dataset.listenerAttached) {
        setupHost.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-setup-key]');
            if (!btn) return;
            openSetupInsight(btn.dataset.setupKey || '');
        });
        setupHost.dataset.listenerAttached = 'true';
    }
    const itemHost = el('ab2-table-body');
    if (itemHost && !itemHost.dataset.listenerAttached) {
        itemHost.addEventListener('click', (e) => {
            const edit = e.target.closest('[data-item-edit]');
            if (edit) {
                openItem(edit.dataset.itemEdit, false);
                return;
            }
            const row = e.target.closest('[data-item-row]');
            if (row?.dataset.itemRow) {
                openItem(row.dataset.itemRow, true);
                return;
            }
        });
        itemHost.dataset.listenerAttached = 'true';
    }
    const contribHost = el('ab2-contrib-list');
    if (contribHost && !contribHost.dataset.listenerAttached) {
        contribHost.addEventListener('click', (e) => {
            const rowJump = e.target.closest('[data-contrib-transfer-jump]') || e.target.closest('tr[data-contrib-transfer-jump]');
            if (rowJump && rowJump.dataset.contribTransferJump) {
                closeModal('ab2-item-modal');
                editTransfer(rowJump.dataset.contribTransferJump || '');
                return;
            }
        });
        contribHost.dataset.listenerAttached = 'true';
    }
    const accHost = el('ab2-accounts-list');
    if (accHost && !accHost.dataset.listenerAttached) {
        accHost.addEventListener('click', (e) => {
            const create = e.target.closest('[data-account-new]');
            const metricInfo = e.target.closest('[data-account-metric-info]');
            const control = e.target.closest('[data-account-control]');
            const edit = e.target.closest('[data-account-edit]');
            const del = e.target.closest('[data-account-delete]');
            if (create) {
                resetAccountForm('create');
                return;
            }
            if (metricInfo?.dataset.accountMetricInfo) {
                openAccountMetricInfo(metricInfo.dataset.accountMetricInfo, metricInfo.dataset.accountId || '');
                return;
            }
            if (control) openPersonControl(control.dataset.accountControl);
            if (edit) editAccount(edit.dataset.accountEdit);
            if (del) deleteAccount(del.dataset.accountDelete);
        });
        accHost.dataset.listenerAttached = 'true';
    }
    const transferHost = el('ab2-transfers-list');
    if (transferHost && !transferHost.dataset.listenerAttached) {
        transferHost.addEventListener('click', (e) => {
            const create = e.target.closest('[data-transfer-new]');
            const openSwap = e.target.closest('[data-transfer-abtausch-open]');
            const edit = e.target.closest('[data-transfer-edit]');
            const del = e.target.closest('[data-transfer-delete]');
            if (create) {
                resetTransferForm('create');
                return;
            }
            if (openSwap?.dataset.transferAbtauschOpen) {
                editTransfer(openSwap.dataset.transferAbtauschOpen);
                openTransferAbtauschModal(openSwap.dataset.transferAbtauschOpen);
                return;
            }
            if (edit) editTransfer(edit.dataset.transferEdit);
            if (del) deleteTransfer(del.dataset.transferDelete);
        });
        transferHost.dataset.listenerAttached = 'true';
    }
    const transferModal = el('ab2-transfers-modal');
    if (transferModal && !transferModal.dataset.splitListenerAttached) {
        transferModal.addEventListener('click', (e) => {
            if (e.target.closest('#ab2-transfer-splitter')) toggleTransferSplitMode();
        });
        transferModal.dataset.splitListenerAttached = 'true';
    }
    const accountModal = el('ab2-accounts-modal');
    if (accountModal && !accountModal.dataset.splitListenerAttached) {
        accountModal.addEventListener('click', (e) => {
            if (e.target.closest('#ab2-account-splitter')) toggleAccountSplitMode();
        });
        accountModal.dataset.splitListenerAttached = 'true';
    }
    const reconModal = el('ab2-reconciliation-modal');
    if (reconModal && !reconModal.dataset.splitListenerAttached) {
        reconModal.addEventListener('click', (e) => {
            if (e.target.closest('#ab2-recon-splitter')) toggleReconSplitMode();
        });
        reconModal.dataset.splitListenerAttached = 'true';
    }
    const reconHost = el('ab2-recon-list');
    if (reconHost && !reconHost.dataset.listenerAttached) {
        reconHost.addEventListener('click', (e) => {
            const create = e.target.closest('[data-recon-new]');
            const edit = e.target.closest('[data-recon-edit]');
            const del = e.target.closest('[data-recon-delete]');
            const loadMore = e.target.closest('[data-recon-load-more]');
            if (create) {
                resetReconForm('create');
                return;
            }
            if (loadMore) {
                reconOlderVisibleCount += 5;
                renderRecon();
                return;
            }
            if (edit?.dataset.reconEdit) {
                fillReconForm(RECON[edit.dataset.reconEdit] || null);
                return;
            }
            if (del) deleteRecon(del.dataset.reconDelete);
        });
        reconHost.dataset.listenerAttached = 'true';
    }
    const paymentsHost = el('ab2-payments-table-body');
    if (paymentsHost && !paymentsHost.dataset.listenerAttached) {
        paymentsHost.addEventListener('click', (e) => {
            const openBtn = e.target.closest('[data-payment-open-item]');
            if (!openBtn?.dataset.paymentOpenItem) return;
            openItem(openBtn.dataset.paymentOpenItem, true);
        });
        paymentsHost.dataset.listenerAttached = 'true';
    }
    const suggestionHosts = [el('ab2-suggestion-preview'), el('ab2-suggestions-content')].filter(Boolean);
    suggestionHosts.forEach((host) => {
        if (!host.dataset.listenerAttached) {
            host.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-suggestion-id]');
                if (btn) {
                    applySuggestion(btn);
                    return;
                }
                const doneBtn = e.target.closest('[data-action-done]');
                if (doneBtn?.dataset.actionDone) {
                    markActionDone(doneBtn.dataset.actionDone);
                }
            });
            host.dataset.listenerAttached = 'true';
        }
    });
    const root = el('abbuchungsberechner-root');
    if (root && !root.dataset.sollListenerAttached) {
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-ab2-soll-target]');
            if (!btn) return;
            const inputId = btn.dataset.ab2SollTarget || '';
            const amount = toNum(btn.dataset.sollValue, NaN);
            applySollAmountToInput(inputId, amount);
        });
        root.dataset.sollListenerAttached = 'true';
    }
    const forecast = el('ab2-forecast-overview');
    if (forecast && !forecast.dataset.listenerAttached) {
        forecast.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-forecast-month]');
            if (!btn) return;
            openForecastInsight(btn.dataset.forecastMonth);
        });
        forecast.dataset.listenerAttached = 'true';
    }
    if (!helpHintsBound) {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab2-help-btn');
            if (btn) {
                e.preventDefault();
                toggleHelpHint(btn.dataset.helpTarget || '');
                return;
            }
            if (!e.target.closest('.ab2-help-content')) closeAllHelpHints();
        });
        helpHintsBound = true;
    }
    updateMainIntervalFields('ab2-item');
    updateMainIntervalFields('ab2-transfer');
    updateAccountTypeDependencies();
    setAccountSplitMode(accountSplitMode, false);
    setTransferSplitMode(transferSplitMode, false);
    setReconSplitMode(reconSplitMode, false);
    window.addEventListener('resize', () => {
        setAccountSplitMode(accountSplitMode, false);
        setTransferSplitMode(transferSplitMode, false);
        setReconSplitMode(reconSplitMode, false);
    });
}
function attachListeners() {
    if (isGuest()) return;
    ensureRefs();
    const userId = uid();
    if (!userId) return;
    if (unsubAccounts) unsubAccounts();
    if (unsubItems) unsubItems();
    if (unsubTransfers) unsubTransfers();
    if (unsubRecon) unsubRecon();
    if (unsubAudit) unsubAudit();
    if (unsubActions) unsubActions();

    const rerender = () => { FORECAST = buildForecast(forecastHorizonMonths); renderAll(); };
    unsubAccounts = onSnapshot(query(accountsRef, where('createdBy', '==', userId)), (snap) => { ACCOUNTS = {}; snap.forEach((d) => { ACCOUNTS[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 accounts listener:', error));
    unsubItems = onSnapshot(query(itemsRef, where('createdBy', '==', userId)), (snap) => { ITEMS = {}; snap.forEach((d) => { ITEMS[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 items listener:', error));
    unsubTransfers = onSnapshot(query(transfersRef, where('createdBy', '==', userId)), (snap) => { TRANSFERS = {}; snap.forEach((d) => { TRANSFERS[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 transfers listener:', error));
    unsubRecon = onSnapshot(query(reconRef, where('createdBy', '==', userId)), (snap) => { RECON = {}; snap.forEach((d) => { RECON[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 recon listener:', error));
    unsubAudit = onSnapshot(query(auditRef, where('createdBy', '==', userId)), (snap) => { AUDIT = {}; snap.forEach((d) => { AUDIT[d.id] = { id: d.id, ...d.data() }; }); }, (error) => console.error('AB2 audit listener:', error));
    unsubActions = onSnapshot(query(actionsRef, where('createdBy', '==', userId)), (snap) => { ACTIONS = {}; snap.forEach((d) => { ACTIONS[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 actions listener:', error));
}

export function stopAbbuchungsberechnerListeners() {
    if (unsubAccounts) { unsubAccounts(); unsubAccounts = null; }
    if (unsubItems) { unsubItems(); unsubItems = null; }
    if (unsubTransfers) { unsubTransfers(); unsubTransfers = null; }
    if (unsubRecon) { unsubRecon(); unsubRecon = null; }
    if (unsubAudit) { unsubAudit(); unsubAudit = null; }
    if (unsubActions) { unsubActions(); unsubActions = null; }
    ACCOUNTS = {};
    ITEMS = {};
    TRANSFERS = {};
    RECON = {};
    AUDIT = {};
    ACTIONS = {};
    FORECAST = { timeline: [], alerts: [], details: {}, quality: [], setup: [], suggestions: [], imbalances: [], deviationWarnings: [] };
}

export function initializeAbbuchungsberechner() {
    if (!db) return;
    ensureShell();
    bindEvents();
    ensureRefs();
    setForecastHorizon(getUserSetting('ab2_forecast_horizon') || String(forecastHorizonMonths), false);
    populateSelects();
    attachListeners();
    FORECAST = buildForecast(forecastHorizonMonths);
    renderAll();
    if (getUserSetting('ab2_filter_open') === '1') {
        const w = el('ab2-filter-controls-wrapper');
        const i = el('ab2-toggle-filter-icon');
        if (w) w.classList.remove('hidden');
        if (i) i.classList.add('rotate-180');
    }
}
