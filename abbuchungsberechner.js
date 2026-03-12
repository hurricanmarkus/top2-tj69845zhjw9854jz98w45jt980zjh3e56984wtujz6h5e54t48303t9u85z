import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { alertUser, appId, currentUser, db, escapeHtml, GUEST_MODE } from './haupteingang.js';
import { getUserSetting, saveUserSetting } from './log-InOut.js';

const MONTHS = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
let refsReady = false;
let accountsRef = null;
let itemsRef = null;
let transfersRef = null;
let reconRef = null;
let auditRef = null;

let unsubAccounts = null;
let unsubItems = null;
let unsubTransfers = null;
let unsubRecon = null;

let listenersBound = false;
let ACCOUNTS = {};
let ITEMS = {};
let TRANSFERS = {};
let RECON = {};
let FORECAST = { timeline: [], alerts: [], skippedMonths: [] };
let itemReadMode = false;

let filterTokens = [];
let filterState = { negate: false, joinMode: 'and', status: '', typ: '', interval: '' };

function uid() { return currentUser?.mode || currentUser?.displayName || null; }
function isGuest() { return !currentUser?.mode || currentUser.mode === GUEST_MODE; }
function canCreate() { const p = currentUser?.permissions || []; return currentUser?.role === 'SYSTEMADMIN' || p.includes('ABBUCHUNGSBERECHNER_CREATE'); }
function toNum(v, f = 0) { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : f; }
function isoDate(v) { const d = new Date(v); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseMonths(v) { return String(v || '').split(',').map(x => parseInt(x.trim(), 10)).filter(x => x >= 1 && x <= 12).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b); }

function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

function ensureRefs() {
    if (refsReady || !db) return;
    accountsRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_accounts');
    itemsRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_cost_items');
    transfersRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_transfer_plans');
    reconRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_reconciliation');
    auditRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_audit');
    refsReady = true;
}

function itemStatus(item) {
    const now = new Date();
    const start = item.validFrom ? new Date(item.validFrom) : null;
    const end = item.validTo ? new Date(item.validTo) : null;
    if (!item.title || !item.accountId || toNum(item.amount, NaN) <= 0 || !item.validFrom) return { key: 'fehler', label: 'Fehler', css: 'bg-red-100 text-red-700' };
    if (start && now < start) return { key: 'geplant', label: 'Geplant', css: 'bg-blue-100 text-blue-700' };
    if (end && now > end) return { key: 'vergangen', label: 'Vergangen', css: 'bg-gray-100 text-gray-700' };
    return { key: 'aktiv', label: 'Aktiv', css: 'bg-green-100 text-green-700' };
}

function dueInMonth(entity, y, m) {
    const start = entity.validFrom ? new Date(entity.validFrom) : null;
    const end = entity.validTo ? new Date(entity.validTo) : null;
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0);
    if (start && start > monthEnd) return false;
    if (end && end < monthStart) return false;

    const interval = entity.intervalType || 'monthly';
    const startMonth = Number(entity.startMonth || (start ? start.getMonth() + 1 : m));
    if (interval === 'monthly') return true;
    if (interval === 'quarterly') return ((m - startMonth + 120) % 3) === 0;
    if (interval === 'semiannual') return ((m - startMonth + 120) % 6) === 0;
    if (interval === 'annual') return ((m - startMonth + 120) % 12) === 0;
    if (interval === 'custom') return (Array.isArray(entity.customMonths) ? entity.customMonths : []).includes(m);
    return false;
}

function latestSnapshots() {
    const map = {};
    Object.values(RECON).forEach((r) => {
        if (r.type !== 'snapshot' || !r.accountId || !r.date) return;
        if (!map[r.accountId] || String(map[r.accountId].date) < String(r.date)) map[r.accountId] = r;
    });
    return map;
}

function findSkippedMonths() {
    const shots = Object.values(RECON).filter(r => r.type === 'snapshot' && r.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (shots.length === 0) return [];
    const [sy, sm] = String(shots[shots.length - 1].date).split('-').map(v => parseInt(v, 10));
    if (!Number.isInteger(sy) || !Number.isInteger(sm)) return [];
    const now = new Date();
    let y = sy, m = sm;
    const miss = [];
    while (y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1)) {
        m += 1; if (m > 12) { m = 1; y += 1; }
        if (y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth() + 1)) miss.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return miss;
}

function buildForecast(horizon = 12) {
    const accounts = Object.values(ACCOUNTS);
    const shots = latestSnapshots();
    const bal = {};
    const alerts = [];
    accounts.forEach(a => { bal[a.id] = shots[a.id] ? toNum(shots[a.id].value, 0) : 0; });

    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    const timeline = [];

    for (let i = 0; i < horizon; i += 1) {
        const mv = {};
        accounts.forEach(a => { mv[a.id] = { in: 0, out: 0 }; });

        Object.values(TRANSFERS).forEach((t) => {
            if (!dueInMonth(t, y, m)) return;
            const amount = toNum(t.amount, 0); if (amount <= 0) return;
            if (mv[t.sourceAccountId]) mv[t.sourceAccountId].out += amount;
            if (mv[t.targetAccountId]) mv[t.targetAccountId].in += amount;
        });

        Object.values(ITEMS).forEach((item) => {
            if (!dueInMonth(item, y, m)) return;
            const amount = toNum(item.amount, 0); if (amount <= 0) return;
            if (!mv[item.accountId]) mv[item.accountId] = { in: 0, out: 0 };
            if (item.typ === 'gutschrift') mv[item.accountId].in += amount; else mv[item.accountId].out += amount;

            const contribs = Array.isArray(item.contributions) ? item.contributions : [];
            contribs.forEach((c) => {
                const cInterval = c.intervalType === 'inherit' ? item.intervalType : (c.intervalType || item.intervalType || 'monthly');
                const cDue = dueInMonth({ intervalType: cInterval, startMonth: c.startMonth || item.startMonth, customMonths: c.customMonths || [], validFrom: c.validFrom || item.validFrom, validTo: c.validTo || item.validTo }, y, m);
                if (!cDue) return;
                const cAmount = toNum(c.amount, 0); if (cAmount <= 0) return;
                mv[item.accountId].in += cAmount;
                if (c.sourceAccountId && mv[c.sourceAccountId]) mv[c.sourceAccountId].out += cAmount;
            });
        });

        Object.values(RECON).forEach((r) => {
            if (r.type !== 'manual' || !r.accountId || !r.date) return;
            const d = new Date(r.date); if (Number.isNaN(d.getTime())) return;
            if (d.getFullYear() !== y || d.getMonth() + 1 !== m) return;
            const v = toNum(r.value, 0);
            if (!mv[r.accountId]) mv[r.accountId] = { in: 0, out: 0 };
            if (v >= 0) mv[r.accountId].in += v; else mv[r.accountId].out += Math.abs(v);
        });

        const bucket = { key: `${y}-${String(m).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}`, accounts: {} };
        accounts.forEach((a) => {
            const start = toNum(bal[a.id], 0);
            const inflow = toNum(mv[a.id]?.in, 0);
            const outflow = toNum(mv[a.id]?.out, 0);
            const end = start + inflow - outflow;
            bal[a.id] = end;
            const minBuffer = toNum(a.minBuffer, 0);
            let severity = 'ok';
            if (a.type !== 'person') {
                if (end < minBuffer) severity = 'alarm';
                else if (end < (minBuffer + Math.max(25, minBuffer * 0.1))) severity = 'warn';
            }
            if (severity !== 'ok') alerts.push({ severity, accountId: a.id, accountName: a.name, monthKey: bucket.key, endBalance: end, minBuffer });
            bucket.accounts[a.id] = { start, inflow, outflow, end, minBuffer, severity };
        });

        timeline.push(bucket);
        m += 1; if (m > 12) { m = 1; y += 1; }
    }

    return { timeline, alerts, skippedMonths: findSkippedMonths() };
}

function suggestions() {
    const list = [];
    const source = Object.values(ACCOUNTS)
        .filter(a => a.type !== 'person' && (a.role === 'source' || a.role === 'both'))
        .map((a) => {
            const s = latestSnapshots()[a.id];
            return { ...a, free: (s ? toNum(s.value, 0) : 0) - toNum(a.minBuffer, 0) };
        })
        .sort((a, b) => b.free - a.free)[0];

    if (!source) return list;

    Object.values(ACCOUNTS).filter(a => a.type !== 'person' && (a.role === 'target' || a.role === 'both')).forEach((target) => {
        const rows = FORECAST.timeline.map(t => t.accounts[target.id]).filter(Boolean);
        if (!rows.length) return;
        const firstBadIdx = rows.findIndex(r => r.end < r.minBuffer);
        if (firstBadIdx < 0) return;
        const once = Math.max(0, rows[firstBadIdx].minBuffer - rows[firstBadIdx].end);
        const trend = (rows[rows.length - 1].end - rows[0].start) / rows.length;
        const monthly = trend < 0 ? Math.abs(trend) : 0;
        list.push({
            id: `${target.id}_${firstBadIdx}`,
            sourceId: source.id,
            sourceName: source.name,
            targetId: target.id,
            targetName: target.name,
            onceAmount: Number(once.toFixed(2)),
            monthlyAmount: Number(monthly.toFixed(2)),
            criticalMonth: FORECAST.timeline[firstBadIdx]?.key || '-'
        });
    });

    return list;
}

async function writeAudit(action, entityType, entityId, beforeData = null, afterData = null, context = {}) {
    if (!auditRef || isGuest()) return;
    try {
        await addDoc(auditRef, {
            action, entityType, entityId, beforeData, afterData, context,
            createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), appModule: 'ABBUCHUNGSBERECHNER'
        });
    } catch (e) { console.warn('Audit fehlgeschlagen:', e); }
}

function intervalLabel(i, cm = []) {
    if (i === 'monthly') return 'Monatlich';
    if (i === 'quarterly') return 'Quartal';
    if (i === 'semiannual') return 'Halbjahr';
    if (i === 'annual') return 'Jaehrlich';
    if (i === 'custom') return cm.length ? `Individuell (${cm.map(m => MONTHS[m - 1]).join(', ')})` : 'Individuell';
    return '-';
}

function populateSelects() {
    const accounts = Object.values(ACCOUNTS).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    const mk = (fn) => ['<option value="">Bitte wählen...</option>', ...accounts.filter(fn).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} (${escapeHtml(a.type || '-')})</option>`)].join('');

    const itemAcc = document.getElementById('ab-item-account');
    if (itemAcc) { const old = itemAcc.value; itemAcc.innerHTML = mk(a => a.role === 'target' || a.role === 'both'); itemAcc.value = old; }
    const trS = document.getElementById('ab-transfer-source');
    if (trS) { const old = trS.value; trS.innerHTML = mk(a => a.role === 'source' || a.role === 'both' || a.type === 'person'); trS.value = old; }
    const trT = document.getElementById('ab-transfer-target');
    if (trT) { const old = trT.value; trT.innerHTML = mk(a => a.role === 'target' || a.role === 'both'); trT.value = old; }
    const recA = document.getElementById('ab-recon-account');
    if (recA) { const old = recA.value; recA.innerHTML = mk(() => true); recA.value = old; }

    document.querySelectorAll('.ab-contrib-source').forEach((sel) => {
        const old = sel.value;
        sel.innerHTML = mk(a => a.role === 'source' || a.role === 'both' || a.type === 'person');
        sel.value = old;
    });
}

function setReadMode(readOnly) {
    itemReadMode = readOnly;
    const modal = document.getElementById('abbuchungsberechnerItemModal');
    if (!modal) return;
    modal.querySelectorAll('input,select,textarea').forEach((el) => {
        if (el.id === 'ab-item-id' || el.dataset.keepEnabled === 'true') return;
        el.disabled = readOnly;
    });
    const id = (document.getElementById('ab-item-id')?.value || '').trim();
    const saveBtn = document.getElementById('ab-item-save-btn');
    const editBtn = document.getElementById('ab-item-edit-btn');
    const delBtn = document.getElementById('ab-item-delete-btn');
    const abtBtn = document.getElementById('ab-item-abtausch-btn');
    const addCBtn = document.getElementById('ab-add-contrib-btn');
    if (saveBtn) saveBtn.style.display = readOnly ? 'none' : 'inline-flex';
    if (editBtn) editBtn.style.display = id && readOnly ? 'inline-flex' : 'none';
    if (delBtn) delBtn.style.display = id ? 'inline-flex' : 'none';
    if (abtBtn) abtBtn.style.display = id ? 'inline-flex' : 'none';
    if (addCBtn) addCBtn.disabled = readOnly;
}

function resetItemForm() {
    ['ab-item-id', 'ab-item-title', 'ab-item-account', 'ab-item-amount', 'ab-item-start-month', 'ab-item-custom-months', 'ab-item-day', 'ab-item-valid-from', 'ab-item-valid-to', 'ab-item-notes'].forEach((id) => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const typ = document.getElementById('ab-item-type'); if (typ) typ.value = 'belastung';
    const interval = document.getElementById('ab-item-interval'); if (interval) interval.value = 'monthly';
    const c = document.getElementById('ab-contrib-list'); if (c) c.innerHTML = '';
    setReadMode(false); populateSelects();
}

function addContributionRow(v = {}) {
    const host = document.getElementById('ab-contrib-list'); if (!host) return;
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2 items-start bg-gray-50 p-2 rounded-lg border';
    row.innerHTML = `
        <div class="col-span-12 sm:col-span-4"><label class="text-xs font-bold text-gray-600">Quelle</label><select class="ab-contrib-source w-full p-2 border rounded text-sm"></select></div>
        <div class="col-span-6 sm:col-span-2"><label class="text-xs font-bold text-gray-600">Betrag</label><input type="text" class="ab-contrib-amount w-full p-2 border rounded text-sm" placeholder="0.00"></div>
        <div class="col-span-6 sm:col-span-3"><label class="text-xs font-bold text-gray-600">Intervall</label><select class="ab-contrib-interval w-full p-2 border rounded text-sm"><option value="inherit">Wie Haupt-Eintrag</option><option value="monthly">Monatlich</option><option value="quarterly">Quartal</option><option value="semiannual">Halbjahr</option><option value="annual">Jaehrlich</option><option value="custom">Individuell</option></select></div>
        <div class="col-span-10 sm:col-span-2"><label class="text-xs font-bold text-gray-600">Monate</label><input type="text" class="ab-contrib-custom w-full p-2 border rounded text-sm" placeholder="1,3,8"></div>
        <div class="col-span-2 sm:col-span-1 flex justify-end pt-5"><button type="button" class="ab-remove-contrib-btn text-red-600 hover:text-red-800 font-bold">✕</button></div>
    `;
    host.appendChild(row); populateSelects();
    row.querySelector('.ab-contrib-source').value = v.sourceAccountId || '';
    row.querySelector('.ab-contrib-amount').value = v.amount ?? '';
    row.querySelector('.ab-contrib-interval').value = v.intervalType || 'inherit';
    row.querySelector('.ab-contrib-custom').value = Array.isArray(v.customMonths) ? v.customMonths.join(',') : '';
}

function collectContribs() {
    const out = [];
    document.querySelectorAll('#ab-contrib-list > div').forEach((row) => {
        const sourceAccountId = row.querySelector('.ab-contrib-source')?.value || '';
        const amount = toNum(row.querySelector('.ab-contrib-amount')?.value, 0);
        const intervalType = row.querySelector('.ab-contrib-interval')?.value || 'inherit';
        const customMonths = parseMonths(row.querySelector('.ab-contrib-custom')?.value || '');
        if (!sourceAccountId || amount <= 0) return;
        out.push({ sourceAccountId, amount, intervalType, customMonths });
    });
    return out;
}

function renderDashboard() {
    const btn = document.getElementById('btn-create-abbuchung'); if (btn) btn.style.display = canCreate() ? 'inline-flex' : 'none';
    FORECAST = buildForecast(12);

    const items = Object.values(ITEMS);
    let active = 0, planned = 0, past = 0, errors = 0;
    items.forEach((i) => { const s = itemStatus(i); if (s.key === 'aktiv') active += 1; if (s.key === 'geplant') planned += 1; if (s.key === 'vergangen') past += 1; if (s.key === 'fehler') errors += 1; });
    const warns = FORECAST.alerts.filter(a => a.severity === 'warn').length;
    const alarms = FORECAST.alerts.filter(a => a.severity === 'alarm').length;

    const status = document.getElementById('ab-total-status');
    if (status) {
        if (alarms > 0) { status.textContent = 'ALARM'; status.className = 'px-4 py-2 rounded-lg font-bold text-white bg-red-500'; }
        else if (warns > 0 || FORECAST.skippedMonths.length > 0) { status.textContent = 'WARNUNG'; status.className = 'px-4 py-2 rounded-lg font-bold text-white bg-yellow-500'; }
        else { status.textContent = 'STABIL'; status.className = 'px-4 py-2 rounded-lg font-bold text-white bg-green-500'; }
    }

    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
    setTxt('ab-stat-accounts', Object.keys(ACCOUNTS).length);
    setTxt('ab-stat-active', active);
    setTxt('ab-stat-planned', planned);
    setTxt('ab-stat-past', past);
    setTxt('ab-stat-errors', errors);
    setTxt('ab-stat-warnings', warns);
    setTxt('ab-stat-alarms', alarms);

    const skipped = document.getElementById('ab-skipped-months');
    if (skipped) {
        if (FORECAST.skippedMonths.length) { skipped.classList.remove('hidden'); skipped.textContent = `Monatsabgleich fehlt fuer: ${FORECAST.skippedMonths.join(', ')}`; }
        else { skipped.classList.add('hidden'); skipped.textContent = ''; }
    }

    const accountHost = document.getElementById('ab-account-overview');
    if (accountHost) {
        const snaps = latestSnapshots();
        const html = Object.values(ACCOUNTS).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((a) => {
            const bal = snaps[a.id] ? toNum(snaps[a.id].value, 0) : 0;
            const buf = toNum(a.minBuffer, 0);
            const badge = a.type === 'person' ? '<span class="text-xs px-2 py-1 rounded bg-indigo-100 text-indigo-700">Person</span>' : (bal < buf ? '<span class="text-xs px-2 py-1 rounded bg-red-100 text-red-700">Unter Puffer</span>' : '<span class="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Puffer ok</span>');
            return `<div class="p-3 rounded-lg border bg-white"><div class="flex justify-between items-center"><div class="font-bold text-sm">${escapeHtml(a.name || '-')}</div>${badge}</div><div class="text-xs text-gray-500">${escapeHtml(a.bankName || '-')} ${a.iban ? `· ${escapeHtml(a.iban)}` : ''}</div><div class="text-sm font-semibold">Stand: ${bal.toFixed(2)} €</div><div class="text-xs text-gray-500">Puffer: ${buf.toFixed(2)} €</div></div>`;
        }).join('');
        accountHost.innerHTML = html || '<p class="text-sm text-gray-400 italic">Noch keine Konten/Quellen.</p>';
    }

    const forecastHost = document.getElementById('ab-forecast-overview');
    if (forecastHost) {
        const targets = Object.values(ACCOUNTS).filter(a => a.type !== 'person' && (a.role === 'target' || a.role === 'both'));
        if (!targets.length || !FORECAST.timeline.length) forecastHost.innerHTML = '<p class="text-sm text-gray-400 italic">Keine Forecast-Daten.</p>';
        else {
            const head = `<tr><th class="px-2 py-2 text-left text-xs font-bold text-blue-800">Monat</th>${targets.map(a => `<th class="px-2 py-2 text-left text-xs font-bold text-blue-800">${escapeHtml(a.name)}</th>`).join('')}</tr>`;
            const body = FORECAST.timeline.map((b) => `<tr class="border-b"><td class="px-2 py-2 text-xs font-semibold text-gray-600">${escapeHtml(b.label)}</td>${targets.map((a) => { const c = b.accounts[a.id]; if (!c) return '<td class="px-2 py-2 text-xs text-gray-400">-</td>'; const cls = c.severity === 'alarm' ? 'text-red-700 font-bold' : (c.severity === 'warn' ? 'text-yellow-700 font-semibold' : 'text-gray-700'); return `<td class="px-2 py-2 text-xs ${cls}">${c.end.toFixed(2)} €</td>`; }).join('')}</tr>`).join('');
            forecastHost.innerHTML = `<div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-blue-50">${head}</thead><tbody>${body}</tbody></table></div>`;
        }
    }

    const suggHost = document.getElementById('ab-suggestion-preview');
    if (suggHost) {
        const s = suggestions();
        suggHost.innerHTML = s.length ? s.map((x) => `<div class="p-3 rounded-lg border border-blue-200 bg-blue-50"><div class="text-sm font-bold text-blue-900">${escapeHtml(x.sourceName)} → ${escapeHtml(x.targetName)}</div><div class="text-xs text-blue-700">Kritischer Monat: ${escapeHtml(x.criticalMonth)}</div><div class="text-xs text-blue-700">Einmalig: ${x.onceAmount.toFixed(2)} € | Monatlich: ${x.monthlyAmount.toFixed(2)} €</div></div>`).join('') : '<p class="text-sm text-green-700">Plan aktuell stabil.</p>';
    }
}

function tokenMatch(text) {
    if (!filterTokens.length) return true;
    const checks = filterTokens.map(t => text.includes(t));
    const res = filterState.joinMode === 'or' ? checks.some(Boolean) : checks.every(Boolean);
    return filterState.negate ? !res : res;
}

function matchItem(item) {
    const st = itemStatus(item);
    if (filterState.status && st.key !== filterState.status) return false;
    if (filterState.typ && item.typ !== filterState.typ) return false;
    if (filterState.interval && item.intervalType !== filterState.interval) return false;
    const txt = `${item.title || ''} ${item.notes || ''} ${(ACCOUNTS[item.accountId]?.name || '')} ${item.typ || ''} ${item.intervalType || ''}`.toLowerCase();
    return tokenMatch(txt);
}

function renderTags() {
    const host = document.getElementById('ab-active-search-tags');
    if (!host) return;
    host.innerHTML = filterTokens.map((t, idx) => `<button class="ab-remove-filter-tag px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200" data-idx="${idx}">${escapeHtml(t)} ✕</button>`).join('');
}

function renderTable() {
    const body = document.getElementById('abbuchungsberechner-table-body');
    if (!body) return;
    const rows = Object.values(ITEMS).filter(matchItem).sort((a, b) => String(b.validFrom || '').localeCompare(String(a.validFrom || ''))).map((i) => {
        const s = itemStatus(i);
        const acc = ACCOUNTS[i.accountId]?.name || '-';
        const cTotal = (Array.isArray(i.contributions) ? i.contributions : []).reduce((sum, c) => sum + toNum(c.amount, 0), 0);
        return `<tr class="hover:bg-gray-50"><td class="px-3 py-2"><span class="px-2 py-1 text-xs rounded ${s.css}">${escapeHtml(s.label)}</span></td><td class="px-3 py-2 text-sm font-semibold">${escapeHtml(i.title || '-')}</td><td class="px-3 py-2 text-sm">${escapeHtml(acc)}</td><td class="px-3 py-2 text-sm">${i.typ === 'gutschrift' ? 'Gutschrift' : 'Belastung'}</td><td class="px-3 py-2 text-sm">${intervalLabel(i.intervalType, i.customMonths)}</td><td class="px-3 py-2 text-sm font-bold ${i.typ === 'gutschrift' ? 'text-green-700' : 'text-red-700'}">${toNum(i.amount, 0).toFixed(2)} €</td><td class="px-3 py-2 text-xs text-gray-600">${cTotal > 0 ? `${cTotal.toFixed(2)} €` : '-'}</td><td class="px-3 py-2 text-xs text-gray-600">${escapeHtml(i.validFrom || '-')} ${i.validTo ? `bis ${escapeHtml(i.validTo)}` : 'fortlaufend'}</td><td class="px-3 py-2 text-center"><div class="flex items-center justify-center gap-1"><button class="ab-item-action px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200" data-action="view" data-id="${escapeHtml(i.id)}">Ansehen</button><button class="ab-item-action px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200" data-action="edit" data-id="${escapeHtml(i.id)}">Bearb.</button><button class="ab-item-action px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200" data-action="delete" data-id="${escapeHtml(i.id)}">Löschen</button></div></td></tr>`;
    }).join('');
    body.innerHTML = rows || '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-400 italic">Keine Eintraege passend zum Filter.</td></tr>';
}

function renderAccounts() {
    const host = document.getElementById('ab-accounts-list'); if (!host) return;
    host.innerHTML = Object.values(ACCOUNTS).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((a) => `<div class="p-2 rounded border bg-white flex items-center justify-between gap-2"><div><div class="text-sm font-bold">${escapeHtml(a.name || '-')}</div><div class="text-xs text-gray-500">${escapeHtml(a.bankName || '-')} · ${escapeHtml(a.type || '-')} · Rolle: ${escapeHtml(a.role || '-')} ${a.iban ? `· ${escapeHtml(a.iban)}` : ''}</div><div class="text-xs text-gray-500">Puffer: ${toNum(a.minBuffer, 0).toFixed(2)} €</div></div><div class="flex gap-1"><button class="ab-account-action px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200" data-action="edit" data-id="${escapeHtml(a.id)}">Bearb.</button><button class="ab-account-action px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200" data-action="delete" data-id="${escapeHtml(a.id)}">Löschen</button></div></div>`).join('') || '<p class="text-sm text-gray-400 italic">Noch keine Konten/Quellen.</p>';
}

function renderTransfers() {
    const host = document.getElementById('ab-transfers-list'); if (!host) return;
    host.innerHTML = Object.values(TRANSFERS).sort((a, b) => String(a.validFrom || '').localeCompare(String(b.validFrom || ''))).map((t) => `<div class="p-2 rounded border bg-white flex items-center justify-between gap-2"><div><div class="text-sm font-bold">${escapeHtml(ACCOUNTS[t.sourceAccountId]?.name || '-')} → ${escapeHtml(ACCOUNTS[t.targetAccountId]?.name || '-')}</div><div class="text-xs text-gray-500">${toNum(t.amount, 0).toFixed(2)} € · ${intervalLabel(t.intervalType, t.customMonths)}</div><div class="text-xs text-gray-500">${escapeHtml(t.validFrom || '-')} ${t.validTo ? `bis ${escapeHtml(t.validTo)}` : 'fortlaufend'}</div></div><div class="flex gap-1"><button class="ab-transfer-action px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200" data-action="edit" data-id="${escapeHtml(t.id)}">Bearb.</button><button class="ab-transfer-action px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200" data-action="delete" data-id="${escapeHtml(t.id)}">Löschen</button></div></div>`).join('') || '<p class="text-sm text-gray-400 italic">Noch keine Dauerauftraege.</p>';
}

function renderRecon() {
    const host = document.getElementById('ab-recon-list'); if (!host) return;
    host.innerHTML = Object.values(RECON).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 80).map((r) => `<div class="p-2 rounded border bg-white flex items-center justify-between gap-2"><div><div class="text-sm font-bold">${escapeHtml(ACCOUNTS[r.accountId]?.name || '-')} · ${r.type === 'snapshot' ? 'Snapshot' : 'Manuell'}</div><div class="text-xs text-gray-500">${escapeHtml(r.date || '-')} · ${toNum(r.value, 0).toFixed(2)} €</div><div class="text-xs text-gray-500">${escapeHtml(r.note || '')}</div></div><button class="ab-recon-action px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200" data-action="delete" data-id="${escapeHtml(r.id)}">Löschen</button></div>`).join('') || '<p class="text-sm text-gray-400 italic">Noch keine Abgleiche.</p>';
}

function renderSuggestionsModal() {
    const host = document.getElementById('ab-suggestions-content'); if (!host) return;
    const s = suggestions();
    host.innerHTML = s.length ? s.map((x) => `<div class="p-3 rounded-lg border border-blue-200 bg-blue-50"><div class="font-bold text-blue-900">${escapeHtml(x.sourceName)} → ${escapeHtml(x.targetName)}</div><div class="text-xs text-blue-700">Kritischer Monat: ${escapeHtml(x.criticalMonth)}</div><div class="text-xs text-blue-700">Einmalig: ${x.onceAmount.toFixed(2)} €, monatlich: ${x.monthlyAmount.toFixed(2)} €</div><div class="mt-2"><button class="ab-apply-suggestion px-3 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700" data-source="${escapeHtml(x.sourceId)}" data-target="${escapeHtml(x.targetId)}" data-monthly="${x.monthlyAmount}" data-once="${x.onceAmount}">Als Dauerauftrag übernehmen</button></div></div>`).join('') : '<p class="text-sm text-green-700">Keine Vorschlaege noetig.</p>';
}

function renderAll() { renderTags(); renderDashboard(); renderTable(); renderAccounts(); renderTransfers(); renderRecon(); }

function fillItemForm(item, readOnly) {
    resetItemForm();
    if (!item) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    setVal('ab-item-id', item.id);
    setVal('ab-item-title', item.title || '');
    setVal('ab-item-account', item.accountId || '');
    setVal('ab-item-type', item.typ || 'belastung');
    setVal('ab-item-amount', toNum(item.amount, 0));
    setVal('ab-item-interval', item.intervalType || 'monthly');
    setVal('ab-item-start-month', item.startMonth || '');
    setVal('ab-item-custom-months', Array.isArray(item.customMonths) ? item.customMonths.join(',') : '');
    setVal('ab-item-day', item.dayOfMonth || '');
    setVal('ab-item-valid-from', item.validFrom || '');
    setVal('ab-item-valid-to', item.validTo || '');
    setVal('ab-item-notes', item.notes || '');
    (Array.isArray(item.contributions) ? item.contributions : []).forEach((c) => addContributionRow(c));
    setReadMode(readOnly);
}

async function saveItem() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const id = (document.getElementById('ab-item-id')?.value || '').trim();
    const payload = {
        title: (document.getElementById('ab-item-title')?.value || '').trim(),
        accountId: (document.getElementById('ab-item-account')?.value || '').trim(),
        typ: (document.getElementById('ab-item-type')?.value || 'belastung').trim(),
        amount: toNum(document.getElementById('ab-item-amount')?.value, 0),
        intervalType: (document.getElementById('ab-item-interval')?.value || 'monthly').trim(),
        startMonth: parseInt(document.getElementById('ab-item-start-month')?.value || '', 10) || null,
        customMonths: parseMonths(document.getElementById('ab-item-custom-months')?.value || ''),
        dayOfMonth: parseInt(document.getElementById('ab-item-day')?.value || '', 10) || null,
        validFrom: (document.getElementById('ab-item-valid-from')?.value || '').trim(),
        validTo: (document.getElementById('ab-item-valid-to')?.value || '').trim(),
        notes: (document.getElementById('ab-item-notes')?.value || '').trim(),
        contributions: collectContribs(),
        createdBy: uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp()
    };

    if (!payload.title || !payload.accountId || payload.amount <= 0 || !payload.validFrom) return alertUser('Bitte Titel, Konto, Betrag und Gueltig-Ab ausfuellen.', 'error');
    if (payload.intervalType === 'custom' && payload.customMonths.length === 0) return alertUser('Bei individuell bitte Monate angeben.', 'error');
    if (payload.validTo && new Date(payload.validTo) < new Date(payload.validFrom)) return alertUser('Gueltig-Bis liegt vor Gueltig-Ab.', 'error');

    try {
        if (id) {
            const before = JSON.parse(JSON.stringify(ITEMS[id] || {}));
            await updateDoc(doc(itemsRef, id), payload);
            await writeAudit('update', 'cost_item', id, before, payload, { action: 'save_item' });
            alertUser('Eintrag aktualisiert.', 'success');
        } else {
            const createPayload = { ...payload, createdAt: serverTimestamp(), createdByName: currentUser?.displayName || 'Unbekannt' };
            const ref = await addDoc(itemsRef, createPayload);
            await writeAudit('create', 'cost_item', ref.id, null, createPayload, { action: 'create_item' });
            alertUser('Eintrag erstellt.', 'success');
        }
        closeModal('abbuchungsberechnerItemModal');
    } catch (e) { console.error(e); alertUser(`Fehler beim Speichern: ${e.message || e}`, 'error'); }
}

async function deleteItem(id) {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const item = ITEMS[id]; if (!item) return;
    if (!confirm(`Eintrag "${item.title}" wirklich löschen?`)) return;
    try { await deleteDoc(doc(itemsRef, id)); await writeAudit('delete', 'cost_item', id, item, null, { action: 'delete_item' }); alertUser('Eintrag gelöscht.', 'success'); }
    catch (e) { console.error(e); alertUser(`Fehler beim Löschen: ${e.message || e}`, 'error'); }
}

async function abtausch() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const id = (document.getElementById('ab-item-id')?.value || '').trim();
    const old = ITEMS[id]; if (!old) return alertUser('Eintrag nicht gefunden.', 'error');
    const newStart = (document.getElementById('ab-abtausch-new-start')?.value || '').trim();
    const newAmount = toNum(document.getElementById('ab-abtausch-new-amount')?.value, 0);
    if (!newStart || newAmount <= 0) return alertUser('Bitte neues Startdatum und Betrag angeben.', 'error');
    if (new Date(newStart) <= new Date(old.validFrom)) return alertUser('Neues Startdatum muss nach altem Start liegen.', 'error');

    const oldEnd = new Date(newStart); oldEnd.setDate(oldEnd.getDate() - 1);
    const oldEndIso = isoDate(oldEnd);
    const next = { ...old, amount: newAmount, validFrom: newStart, validTo: old.validTo || '', sourceItemId: old.id, createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    delete next.id;

    try {
        await updateDoc(doc(itemsRef, old.id), { validTo: oldEndIso, updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() });
        const ref = await addDoc(itemsRef, next);
        await writeAudit('abtausch', 'cost_item', old.id, old, { newItemId: ref.id, newStart, newAmount, oldEndIso }, { action: 'abtausch' });
        closeModal('ab-abtausch-modal'); closeModal('abbuchungsberechnerItemModal');
        alertUser('Abtausch erfolgreich.', 'success');
    } catch (e) { console.error(e); alertUser(`Fehler beim Abtausch: ${e.message || e}`, 'error'); }
}

function resetAccountForm() {
    ['ab-account-id', 'ab-account-name', 'ab-account-bank', 'ab-account-iban', 'ab-account-min-buffer', 'ab-account-start-balance'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    const t = document.getElementById('ab-account-type'); if (t) t.value = 'bank';
    const r = document.getElementById('ab-account-role'); if (r) r.value = 'both';
}

async function saveAccount() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const id = (document.getElementById('ab-account-id')?.value || '').trim();
    const payload = {
        name: (document.getElementById('ab-account-name')?.value || '').trim(),
        bankName: (document.getElementById('ab-account-bank')?.value || '').trim(),
        iban: (document.getElementById('ab-account-iban')?.value || '').trim(),
        type: (document.getElementById('ab-account-type')?.value || 'bank').trim(),
        role: (document.getElementById('ab-account-role')?.value || 'both').trim(),
        minBuffer: toNum(document.getElementById('ab-account-min-buffer')?.value, 0),
        createdBy: uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp()
    };
    const startBalance = toNum(document.getElementById('ab-account-start-balance')?.value, NaN);
    if (!payload.name) return alertUser('Bitte Namen eingeben.', 'error');

    try {
        if (id) {
            const before = JSON.parse(JSON.stringify(ACCOUNTS[id] || {}));
            await updateDoc(doc(accountsRef, id), payload);
            await writeAudit('update', 'account', id, before, payload, { action: 'save_account' });
        } else {
            const createPayload = { ...payload, createdAt: serverTimestamp(), createdByName: currentUser?.displayName || 'Unbekannt' };
            const ref = await addDoc(accountsRef, createPayload);
            if (Number.isFinite(startBalance)) {
                await addDoc(reconRef, { accountId: ref.id, type: 'snapshot', date: isoDate(new Date()), value: startBalance, note: 'Startsaldo beim Anlegen', createdBy: uid(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            }
            await writeAudit('create', 'account', ref.id, null, createPayload, { action: 'create_account' });
        }
        resetAccountForm(); alertUser('Konto/Quelle gespeichert.', 'success');
    } catch (e) { console.error(e); alertUser(`Fehler beim Speichern: ${e.message || e}`, 'error'); }
}

function editAccount(id) {
    const a = ACCOUNTS[id]; if (!a) return;
    const setVal = (el, v) => { const n = document.getElementById(el); if (n) n.value = v ?? ''; };
    setVal('ab-account-id', a.id); setVal('ab-account-name', a.name); setVal('ab-account-bank', a.bankName); setVal('ab-account-iban', a.iban); setVal('ab-account-type', a.type || 'bank'); setVal('ab-account-role', a.role || 'both'); setVal('ab-account-min-buffer', toNum(a.minBuffer, 0)); setVal('ab-account-start-balance', '');
}

async function deleteAccount(id) {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const a = ACCOUNTS[id]; if (!a) return;
    if (Object.values(ITEMS).some(i => i.accountId === id) || Object.values(TRANSFERS).some(t => t.sourceAccountId === id || t.targetAccountId === id)) return alertUser('Konto wird noch verwendet.', 'error');
    if (!confirm(`Konto/Quelle "${a.name}" löschen?`)) return;
    try { await deleteDoc(doc(accountsRef, id)); await writeAudit('delete', 'account', id, a, null, { action: 'delete_account' }); alertUser('Konto/Quelle gelöscht.', 'success'); }
    catch (e) { console.error(e); alertUser(`Fehler beim Löschen: ${e.message || e}`, 'error'); }
}

function resetTransferForm() {
    ['ab-transfer-id', 'ab-transfer-source', 'ab-transfer-target', 'ab-transfer-amount', 'ab-transfer-start-month', 'ab-transfer-custom-months', 'ab-transfer-day', 'ab-transfer-valid-from', 'ab-transfer-valid-to', 'ab-transfer-note'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
    const i = document.getElementById('ab-transfer-interval'); if (i) i.value = 'monthly';
}

async function saveTransfer() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const id = (document.getElementById('ab-transfer-id')?.value || '').trim();
    const payload = {
        sourceAccountId: (document.getElementById('ab-transfer-source')?.value || '').trim(),
        targetAccountId: (document.getElementById('ab-transfer-target')?.value || '').trim(),
        amount: toNum(document.getElementById('ab-transfer-amount')?.value, 0),
        intervalType: (document.getElementById('ab-transfer-interval')?.value || 'monthly').trim(),
        startMonth: parseInt(document.getElementById('ab-transfer-start-month')?.value || '', 10) || null,
        customMonths: parseMonths(document.getElementById('ab-transfer-custom-months')?.value || ''),
        dayOfMonth: parseInt(document.getElementById('ab-transfer-day')?.value || '', 10) || null,
        validFrom: (document.getElementById('ab-transfer-valid-from')?.value || '').trim(),
        validTo: (document.getElementById('ab-transfer-valid-to')?.value || '').trim(),
        note: (document.getElementById('ab-transfer-note')?.value || '').trim(),
        createdBy: uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp()
    };

    if (!payload.sourceAccountId || !payload.targetAccountId || payload.sourceAccountId === payload.targetAccountId || payload.amount <= 0 || !payload.validFrom) return alertUser('Bitte Quelle, Ziel, Betrag > 0 und Gueltig-Ab ausfüllen.', 'error');
    if (payload.intervalType === 'custom' && payload.customMonths.length === 0) return alertUser('Bei individuell bitte Monate angeben.', 'error');

    try {
        if (id) {
            const before = JSON.parse(JSON.stringify(TRANSFERS[id] || {}));
            await updateDoc(doc(transfersRef, id), payload);
            await writeAudit('update', 'transfer_plan', id, before, payload, { action: 'save_transfer' });
        } else {
            const createPayload = { ...payload, createdAt: serverTimestamp(), createdByName: currentUser?.displayName || 'Unbekannt' };
            const ref = await addDoc(transfersRef, createPayload);
            await writeAudit('create', 'transfer_plan', ref.id, null, createPayload, { action: 'create_transfer' });
        }
        resetTransferForm(); alertUser('Dauerauftrag gespeichert.', 'success');
    } catch (e) { console.error(e); alertUser(`Fehler beim Speichern: ${e.message || e}`, 'error'); }
}

function editTransfer(id) {
    const t = TRANSFERS[id]; if (!t) return;
    const setVal = (el, v) => { const n = document.getElementById(el); if (n) n.value = v ?? ''; };
    setVal('ab-transfer-id', t.id); setVal('ab-transfer-source', t.sourceAccountId); setVal('ab-transfer-target', t.targetAccountId); setVal('ab-transfer-amount', toNum(t.amount, 0)); setVal('ab-transfer-interval', t.intervalType || 'monthly'); setVal('ab-transfer-start-month', t.startMonth || ''); setVal('ab-transfer-custom-months', Array.isArray(t.customMonths) ? t.customMonths.join(',') : ''); setVal('ab-transfer-day', t.dayOfMonth || ''); setVal('ab-transfer-valid-from', t.validFrom || ''); setVal('ab-transfer-valid-to', t.validTo || ''); setVal('ab-transfer-note', t.note || '');
}

async function deleteTransfer(id) {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const t = TRANSFERS[id]; if (!t) return;
    if (!confirm('Dauerauftrag wirklich löschen?')) return;
    try { await deleteDoc(doc(transfersRef, id)); await writeAudit('delete', 'transfer_plan', id, t, null, { action: 'delete_transfer' }); alertUser('Dauerauftrag gelöscht.', 'success'); }
    catch (e) { console.error(e); alertUser(`Fehler beim Löschen: ${e.message || e}`, 'error'); }
}

async function saveRecon() {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const payload = {
        accountId: (document.getElementById('ab-recon-account')?.value || '').trim(),
        type: (document.getElementById('ab-recon-type')?.value || 'snapshot').trim() === 'manual' ? 'manual' : 'snapshot',
        date: (document.getElementById('ab-recon-date')?.value || '').trim(),
        value: toNum(document.getElementById('ab-recon-value')?.value, NaN),
        note: (document.getElementById('ab-recon-note')?.value || '').trim(),
        createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    };
    if (!payload.accountId || !payload.date || !Number.isFinite(payload.value)) return alertUser('Bitte Konto, Datum und Wert ausfüllen.', 'error');
    try {
        const ref = await addDoc(reconRef, payload);
        await writeAudit('create', 'reconciliation', ref.id, null, payload, { action: 'create_recon' });
        ['ab-recon-date', 'ab-recon-value', 'ab-recon-note'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        alertUser('Abgleich gespeichert.', 'success');
    } catch (e) { console.error(e); alertUser(`Fehler beim Speichern: ${e.message || e}`, 'error'); }
}

async function deleteRecon(id) {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const r = RECON[id]; if (!r) return;
    if (!confirm('Abgleichseintrag löschen?')) return;
    try { await deleteDoc(doc(reconRef, id)); await writeAudit('delete', 'reconciliation', id, r, null, { action: 'delete_recon' }); alertUser('Abgleich gelöscht.', 'success'); }
    catch (e) { console.error(e); alertUser(`Fehler beim Löschen: ${e.message || e}`, 'error'); }
}

async function applySuggestion(btn) {
    if (!canCreate()) return alertUser('Keine Berechtigung.', 'error');
    const sourceId = btn.dataset.source || '';
    const targetId = btn.dataset.target || '';
    const monthly = toNum(btn.dataset.monthly, 0);
    const once = toNum(btn.dataset.once, 0);
    if (!sourceId || !targetId) return;

    try {
        if (monthly > 0) {
            const payload = { sourceAccountId: sourceId, targetAccountId: targetId, amount: monthly, intervalType: 'monthly', startMonth: null, customMonths: [], dayOfMonth: 1, validFrom: isoDate(new Date()), validTo: '', note: 'Automatisch aus Vorschlag übernommen', createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
            const ref = await addDoc(transfersRef, payload); await writeAudit('create', 'transfer_plan', ref.id, null, payload, { action: 'apply_suggestion_monthly' });
        }
        if (once > 0) {
            const now = new Date();
            const payload = { sourceAccountId: sourceId, targetAccountId: targetId, amount: once, intervalType: 'custom', startMonth: null, customMonths: [now.getMonth() + 1], dayOfMonth: 1, validFrom: isoDate(now), validTo: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())), note: 'Einmaliger Ausgleich aus Vorschlag', createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
            const ref = await addDoc(transfersRef, payload); await writeAudit('create', 'transfer_plan', ref.id, null, payload, { action: 'apply_suggestion_once' });
        }
        alertUser('Vorschlag übernommen.', 'success');
    } catch (e) { console.error(e); alertUser(`Fehler beim Übernehmen: ${e.message || e}`, 'error'); }
}

function openItem(id, readOnly) {
    const item = ITEMS[id]; if (!item) return;
    fillItemForm(item, readOnly); openModal('abbuchungsberechnerItemModal');
}

function resetFilters() {
    filterTokens = [];
    filterState = { negate: false, joinMode: 'and', status: '', typ: '', interval: '' };
    const negate = document.getElementById('ab-filter-negate'); if (negate) negate.checked = false;
    const join = document.getElementById('ab-search-join-mode'); if (join) join.value = 'and';
    const status = document.getElementById('ab-filter-status'); if (status) status.value = '';
    const typ = document.getElementById('ab-filter-typ'); if (typ) typ.value = '';
    const interval = document.getElementById('ab-filter-interval'); if (interval) interval.value = '';
    renderAll();
}

function addToken() {
    const input = document.getElementById('ab-search-input'); if (!input) return;
    const v = input.value.trim().toLowerCase(); if (!v) return;
    if (!filterTokens.includes(v)) filterTokens.push(v);
    input.value = '';
    renderTags(); renderTable();
}

function bindEvents() {
    if (listenersBound) return;
    listenersBound = true;

    const on = (id, event, fn) => {
        const el = document.getElementById(id);
        if (el && !el.dataset.listenerAttached) { el.addEventListener(event, fn); el.dataset.listenerAttached = 'true'; }
    };

    on('btn-create-abbuchung', 'click', () => { if (!canCreate()) return alertUser('Keine Berechtigung.', 'error'); resetItemForm(); openModal('abbuchungsberechnerItemModal'); });
    on('ab-open-accounts-modal', 'click', () => { resetAccountForm(); populateSelects(); openModal('ab-accounts-modal'); });
    on('ab-open-transfers-modal', 'click', () => { resetTransferForm(); populateSelects(); openModal('ab-transfers-modal'); });
    on('ab-open-recon-modal', 'click', () => { populateSelects(); openModal('ab-reconciliation-modal'); });
    on('ab-open-suggestions-modal', 'click', () => { renderSuggestionsModal(); openModal('ab-suggestions-modal'); });

    on('ab-close-item-modal', 'click', () => closeModal('abbuchungsberechnerItemModal'));
    on('ab-cancel-item-btn', 'click', () => closeModal('abbuchungsberechnerItemModal'));
    on('ab-item-save-btn', 'click', saveItem);
    on('ab-item-edit-btn', 'click', () => setReadMode(false));
    on('ab-item-delete-btn', 'click', () => { const id = (document.getElementById('ab-item-id')?.value || '').trim(); if (!id) return; deleteItem(id); closeModal('abbuchungsberechnerItemModal'); });
    on('ab-item-abtausch-btn', 'click', () => {
        const id = (document.getElementById('ab-item-id')?.value || '').trim();
        const old = ITEMS[id]; if (!old) return alertUser('Eintrag nicht gefunden.', 'error');
        const info = document.getElementById('ab-abtausch-old-info'); if (info) info.textContent = `${old.title} · ${toNum(old.amount, 0).toFixed(2)} € · ${old.validFrom || '-'} ${old.validTo ? `bis ${old.validTo}` : '(fortlaufend)'}`;
        const nS = document.getElementById('ab-abtausch-new-start'); if (nS) nS.value = isoDate(new Date());
        const nA = document.getElementById('ab-abtausch-new-amount'); if (nA) nA.value = String(toNum(old.amount, 0));
        openModal('ab-abtausch-modal');
    });

    on('ab-add-contrib-btn', 'click', () => addContributionRow());
    on('ab-close-abtausch-modal', 'click', () => closeModal('ab-abtausch-modal'));
    on('ab-cancel-abtausch-btn', 'click', () => closeModal('ab-abtausch-modal'));
    on('ab-save-abtausch-btn', 'click', abtausch);

    on('ab-close-accounts-modal', 'click', () => closeModal('ab-accounts-modal'));
    on('ab-save-account-btn', 'click', saveAccount);
    on('ab-reset-account-btn', 'click', resetAccountForm);

    on('ab-close-transfers-modal', 'click', () => closeModal('ab-transfers-modal'));
    on('ab-save-transfer-btn', 'click', saveTransfer);
    on('ab-reset-transfer-btn', 'click', resetTransferForm);

    on('ab-close-recon-modal', 'click', () => closeModal('ab-reconciliation-modal'));
    on('ab-save-recon-btn', 'click', saveRecon);

    on('ab-close-suggestions-modal', 'click', () => closeModal('ab-suggestions-modal'));

    on('ab-toggle-filter-controls', 'click', async () => {
        const w = document.getElementById('ab-filter-controls-wrapper');
        const i = document.getElementById('ab-toggle-filter-icon');
        if (!w) return;
        w.classList.toggle('hidden');
        i?.classList.toggle('rotate-180', !w.classList.contains('hidden'));
        try { await saveUserSetting('ab_filter_open', w.classList.contains('hidden') ? '0' : '1'); } catch (e) { console.warn(e); }
    });

    on('ab-add-filter-btn', 'click', addToken);
    on('ab-search-input', 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addToken(); } });
    on('ab-reset-filters', 'click', resetFilters);

    on('ab-filter-negate', 'change', (e) => { filterState.negate = e.target.checked; renderTable(); });
    on('ab-search-join-mode', 'change', (e) => { filterState.joinMode = e.target.value === 'or' ? 'or' : 'and'; renderTable(); });
    on('ab-filter-status', 'change', (e) => { filterState.status = e.target.value || ''; renderTable(); });
    on('ab-filter-typ', 'change', (e) => { filterState.typ = e.target.value || ''; renderTable(); });
    on('ab-filter-interval', 'change', (e) => { filterState.interval = e.target.value || ''; renderTable(); });

    const tagHost = document.getElementById('ab-active-search-tags');
    if (tagHost && !tagHost.dataset.listenerAttached) {
        tagHost.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab-remove-filter-tag'); if (!btn) return;
            const idx = parseInt(btn.dataset.idx || '-1', 10);
            if (idx >= 0 && idx < filterTokens.length) { filterTokens.splice(idx, 1); renderTags(); renderTable(); }
        });
        tagHost.dataset.listenerAttached = 'true';
    }

    const itemHost = document.getElementById('abbuchungsberechner-table-body');
    if (itemHost && !itemHost.dataset.listenerAttached) {
        itemHost.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab-item-action'); if (!btn) return;
            const id = btn.dataset.id; const act = btn.dataset.action;
            if (!id || !act) return;
            if (act === 'view') openItem(id, true);
            if (act === 'edit') openItem(id, false);
            if (act === 'delete') deleteItem(id);
        });
        itemHost.dataset.listenerAttached = 'true';
    }

    const contribHost = document.getElementById('ab-contrib-list');
    if (contribHost && !contribHost.dataset.listenerAttached) {
        contribHost.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab-remove-contrib-btn'); if (!btn || itemReadMode) return;
            const row = btn.closest('div.grid'); if (row) row.remove();
        });
        contribHost.dataset.listenerAttached = 'true';
    }

    const accHost = document.getElementById('ab-accounts-list');
    if (accHost && !accHost.dataset.listenerAttached) {
        accHost.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab-account-action'); if (!btn) return;
            const id = btn.dataset.id; const act = btn.dataset.action;
            if (!id || !act) return;
            if (act === 'edit') editAccount(id);
            if (act === 'delete') deleteAccount(id);
        });
        accHost.dataset.listenerAttached = 'true';
    }

    const trHost = document.getElementById('ab-transfers-list');
    if (trHost && !trHost.dataset.listenerAttached) {
        trHost.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab-transfer-action'); if (!btn) return;
            const id = btn.dataset.id; const act = btn.dataset.action;
            if (!id || !act) return;
            if (act === 'edit') editTransfer(id);
            if (act === 'delete') deleteTransfer(id);
        });
        trHost.dataset.listenerAttached = 'true';
    }

    const recHost = document.getElementById('ab-recon-list');
    if (recHost && !recHost.dataset.listenerAttached) {
        recHost.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab-recon-action'); if (!btn) return;
            const id = btn.dataset.id; if (id) deleteRecon(id);
        });
        recHost.dataset.listenerAttached = 'true';
    }

    const sugHost = document.getElementById('ab-suggestions-content');
    if (sugHost && !sugHost.dataset.listenerAttached) {
        sugHost.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab-apply-suggestion'); if (btn) applySuggestion(btn);
        });
        sugHost.dataset.listenerAttached = 'true';
    }
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

    unsubAccounts = onSnapshot(query(accountsRef, where('createdBy', '==', userId)), (snap) => {
        ACCOUNTS = {}; snap.forEach((d) => { ACCOUNTS[d.id] = { id: d.id, ...d.data() }; });
        populateSelects(); renderAll();
    }, (e) => console.error('ABBU accounts listener:', e));

    unsubItems = onSnapshot(query(itemsRef, where('createdBy', '==', userId)), (snap) => {
        ITEMS = {}; snap.forEach((d) => { ITEMS[d.id] = { id: d.id, ...d.data() }; });
        renderAll();
    }, (e) => console.error('ABBU items listener:', e));

    unsubTransfers = onSnapshot(query(transfersRef, where('createdBy', '==', userId)), (snap) => {
        TRANSFERS = {}; snap.forEach((d) => { TRANSFERS[d.id] = { id: d.id, ...d.data() }; });
        renderAll();
    }, (e) => console.error('ABBU transfers listener:', e));

    unsubRecon = onSnapshot(query(reconRef, where('createdBy', '==', userId)), (snap) => {
        RECON = {}; snap.forEach((d) => { RECON[d.id] = { id: d.id, ...d.data() }; });
        renderAll();
    }, (e) => console.error('ABBU recon listener:', e));
}

export function listenForAbbuchungsberechner() {
    attachListeners();
}

export function stopAbbuchungsberechnerListeners() {
    if (unsubAccounts) { unsubAccounts(); unsubAccounts = null; }
    if (unsubItems) { unsubItems(); unsubItems = null; }
    if (unsubTransfers) { unsubTransfers(); unsubTransfers = null; }
    if (unsubRecon) { unsubRecon(); unsubRecon = null; }
    ACCOUNTS = {}; ITEMS = {}; TRANSFERS = {}; RECON = {};
}

export async function initializeAbbuchungsberechner() {
    if (!db) return;
    bindEvents();
    ensureRefs();
    populateSelects();

    if (getUserSetting('ab_filter_open') === '1') {
        const w = document.getElementById('ab-filter-controls-wrapper');
        const i = document.getElementById('ab-toggle-filter-icon');
        if (w) w.classList.remove('hidden');
        if (i) i.classList.add('rotate-180');
    }

    attachListeners();
    renderAll();
}
