import { alertUser, appId, currentUser, db, escapeHtml, GUEST_MODE, USERS } from './haupteingang.js';
import { getUserSetting, saveUserSetting } from './log-InOut.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const MODES = [{ id: 'add', label: 'Hinzufügemodus' }, { id: 'shop', label: 'Einkaufsmodus' }, { id: 'manage', label: 'Verwaltung' }];
const MANAGE = [{ id: 'general', label: 'Allgemein' }, { id: 'stores', label: 'Geschäftewartung' }, { id: 'articles', label: 'Artikelwartung' }, { id: 'categories', label: 'Kategorienwartung' }, { id: 'remarks', label: 'Anmerkungswartung' }, { id: 'notes', label: 'Notizwartung' }];
const UNITS = ['Stück', 'Kg', 'Gramm', 'Liter', 'Milliliter', 'Bund', 'Netz', 'Sack', 'Dose', 'Flasche', 'Becher', 'Packung'];
const DEFAULTS = {
    categories: ['Obst', 'Gemüse', 'Tiefkühl', 'Süßigkeiten', 'Saison', 'Hygiene', 'Haushalt', 'Getränke'],
    stores: ['Billa', 'BIPA', 'Penny', 'Lidl', 'Hofer'],
    remarks: ['In Aktion kaufen', 'MHD schauen', 'Rücksprache halten!'],
    notes: ['Gutschein verwenden', 'Angebote prüfen']
};
const HOLD_MS = 2000;
const DOUBLE_MS = 1000;
const ACTIVITY_MS = 5 * 60 * 1000;
const PRESENCE_MS = 90 * 1000;
const LOCK_MS = 2 * 60 * 1000;
const AUTO_SCAN_MS = 5000;

let root = null;
let inited = false;
let listUnsub = null;
let masterUnsubs = [];
let activeUnsubs = [];
let presenceTimer = null;
let scanStream = null;
let scanTimer = null;
let autoScanTimer = null;
let holdTimer = null;
let holdPayload = null;

const state = {
    lists: [],
    perms: new Map(),
    items: [],
    presence: [],
    activity: null,
    locks: new Map(),
    categories: [],
    stores: [],
    articles: [],
    remarks: [],
    notes: [],
    listId: null,
    mode: 'add',
    section: 'general',
    storeDisplay: 'split',
    q: '1',
    unit: 'Stück',
    title: '',
    note: '',
    storeIds: [],
    search: '',
    settingsOpen: false,
    purchase: null,
    detailId: null,
    articleEditor: null,
    scanOpen: false,
    unknownCode: '',
    unknownArticleId: '',
    collab: { userId: '', accessFrom: '', accessUntil: '', canRead: true, canAdd: false, canShop: false, canManage: false, canManageWrite: false },
    lastTap: new Map(),
    missingEanOnly: false,
    articleSearch: '',
    drafts: { category: '', store: '', remark: '', note: '' }
};

const uid = () => currentUser?.mode || '';
const uname = () => currentUser?.displayName || 'Unbekannt';
const listsRef = () => collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_lists');
const listDoc = (id) => doc(listsRef(), id);
const sub = (id, name) => collection(listDoc(id), name);
const master = (name) => collection(db, 'artifacts', appId, 'public', 'data', `einkaufsliste_master_${name}`);
const fmtQty = (v) => Number(v || 0).toLocaleString('de-AT', { minimumFractionDigits: Number(v || 0) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const parseQty = (v) => { const n = Number(String(v || '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const toDate = (v) => v?.toDate ? v.toDate() : (v ? new Date(v) : null);
const dt = (v) => { const d = toDate(v); return d && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat('de-AT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Vienna' }).format(d) : '—'; };
const dtLocal = (v) => { const d = toDate(v) || new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocal = (v) => { if (!v) return null; const d = new Date(v); d.setSeconds(0, 0); return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d); };
const chip = (t, cls = 'bg-slate-100 text-slate-700') => `<span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${cls}">${t}</span>`;
const ell = (s, n = 34) => String(s || '').length > n ? `${String(s || '').slice(0, n - 1)}…` : String(s || '');
const activeList = () => state.lists.find((x) => x.id === state.listId) || null;
const perm = (listId = state.listId, userId = uid()) => state.perms.get(`${listId}:${userId}`) || null;
const permActive = (p) => { if (!p || p.paused) return false; const now = Date.now(); const a = toDate(p.accessFrom)?.getTime?.() || 0; const b = toDate(p.accessUntil)?.getTime?.() || Infinity; return now >= a && now <= b; };
const canRead = (l = activeList()) => !!l && (l.ownerId === uid() || perm(l.id)?.canRead);
const canNow = (l = activeList()) => !!l && l.active !== false && (l.ownerId === uid() || (perm(l.id)?.canRead && permActive(perm(l.id))));
const canAdd = (l = activeList()) => !!l && l.active !== false && (l.ownerId === uid() || (perm(l.id)?.canAdd && permActive(perm(l.id))));
const canShop = (l = activeList()) => !!l && l.active !== false && (l.ownerId === uid() || (perm(l.id)?.canShop && permActive(perm(l.id))));
const canManage = (l = activeList()) => !!l && (l.ownerId === uid() || (perm(l.id)?.canManage && permActive(perm(l.id))));
const canManageWrite = (l = activeList()) => !!l && (l.ownerId === uid() || (perm(l.id)?.canManage && perm(l.id)?.canManageWrite && permActive(perm(l.id))));

function ensureStyle() {
    if (document.getElementById('el-style')) return;
    const s = document.createElement('style');
    s.id = 'el-style';
    s.textContent = '.elc{background:#fff;border:1px solid #e5e7eb;border-radius:1rem;padding:.8rem;box-shadow:0 10px 24px rgba(15,23,42,.06)}.elb{border-radius:.8rem;padding:.5rem .75rem;font-size:.78rem;font-weight:800}.elb.a{background:linear-gradient(135deg,#4338ca,#6d28d9);color:#fff}.eli,.els,.elt{width:100%;border:1px solid #d1d5db;border-radius:.8rem;background:#fff;padding:.62rem .75rem;font-size:.83rem}.elt{min-height:82px;resize:vertical}.elm{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center}.elitem{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem;align-items:start;padding:.72rem 0}.elcheck{width:2.25rem;height:2.25rem;border-radius:.8rem;border:1px solid #cbd5e1;background:#fff;font-weight:900}.elmodal{position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:.8rem;z-index:120}.elmodal.o{display:flex}.elpanel{width:min(100%,760px);max-height:92vh;overflow:auto;background:#fff;border-radius:1.2rem;box-shadow:0 24px 60px rgba(15,23,42,.28)}.elkey{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.45rem}.elkey button{border-radius:.8rem;min-height:2.35rem;border:1px solid #d1d5db;background:#f8fafc;font-weight:800}.elcam{background:#020617;border-radius:1rem;overflow:hidden;position:relative;aspect-ratio:4/3}.elcam video{width:100%;height:100%;object-fit:cover}.elcam:after{content:"";position:absolute;inset:14%;border:3px solid rgba(255,255,255,.85);border-radius:1rem}.elstat{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem}.elstat>div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:.85rem;padding:.55rem}@media(max-width:480px){.elstat{grid-template-columns:repeat(2,minmax(0,1fr))}}';
    document.head.appendChild(s);
}

function ensureRoot() {
    root = document.getElementById('einkaufsliste-root');
    if (!root || root.dataset.ready === 'true') return;
    root.dataset.ready = 'true';
    root.innerHTML = '<div id="el-main" class="space-y-3"></div><div id="el-settings" class="elmodal"></div><div id="el-purchase" class="elmodal"></div><div id="el-detail" class="elmodal"></div><div id="el-article" class="elmodal"></div><div id="el-scanner" class="elmodal"></div><div id="el-unknown" class="elmodal"></div>';
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointerup', clearHold);
    root.addEventListener('pointerleave', clearHold);
    root.addEventListener('pointercancel', clearHold);
}

async function seedDefaults() {
    if (!uid() || uid() === GUEST_MODE) return;
    const batch = [];
    const checkSeed = async (ref, items, key = 'name') => {
        const snap = await getDocs(query(ref, where('createdBy', '==', uid()), limit(1)));
        if (!snap.empty) return;
        for (const name of items) batch.push(addDoc(ref, { [key]: name, text: name, createdBy: uid(), createdByName: uname(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    };
    await Promise.all([
        checkSeed(master('categories'), DEFAULTS.categories),
        checkSeed(master('stores'), DEFAULTS.stores),
        checkSeed(master('notes'), DEFAULTS.remarks, 'text'),
        checkSeed(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notizen'), DEFAULTS.notes, 'text')
    ]);
    await Promise.all(batch);
}

async function ensurePrivateList() {
    const q = query(listsRef(), where('memberIds', 'array-contains', uid()));
    const snap = await getDocs(q);
    const ownPrivate = snap.docs.find((d) => d.data()?.ownerId === uid() && d.data()?.isPrivateSystemList === true);
    if (ownPrivate) return;
    const ref = doc(listsRef());
    await setDoc(ref, { name: 'Einkaufsliste Privat', ownerId: uid(), ownerName: uname(), isPrivateSystemList: true, active: true, memberIds: [uid()], storeOrder: [], storeNotes: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() });
}

function stopActive() {
    activeUnsubs.forEach((fn) => typeof fn === 'function' && fn());
    activeUnsubs = [];
    state.items = [];
    state.presence = [];
    state.activity = null;
    state.locks.clear();
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = null;
}

function stopMasters() {
    masterUnsubs.forEach((fn) => typeof fn === 'function' && fn());
    masterUnsubs = [];
    if (root?.dataset) delete root.dataset.masters;
}

function stopScanner() {
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = null;
    if (autoScanTimer) clearTimeout(autoScanTimer);
    autoScanTimer = null;
    if (scanStream) scanStream.getTracks().forEach((t) => t.stop());
    scanStream = null;
}

export function stopEinkaufslisteListeners() {
    if (listUnsub) listUnsub();
    listUnsub = null;
    stopMasters();
    stopActive();
    stopScanner();
}

export async function initializeEinkaufsliste() {
    if (!db || !uid() || uid() === GUEST_MODE) return;
    ensureStyle();
    ensureRoot();
    if (!root) return;
    if (!inited) {
        inited = true;
        state.mode = getUserSetting(EL_MODE_KEY, 'add');
        state.section = getUserSetting(EL_SECTION_KEY, 'general');
        state.storeDisplay = getUserSetting(EL_STORE_KEY, 'split');
    }
    await seedDefaults();
    await ensurePrivateList();
    listenMasters();
    listenLists();
    render();
}

const EL_MODE_KEY = 'el_mode';
const EL_SECTION_KEY = 'el_section';
const EL_STORE_KEY = 'el_store';
const EL_LIST_KEY = 'el_list';

function listenMasters() {
    if (masterUnsubs.length) return;
    if (root.dataset.masters === 'true') return;
    root.dataset.masters = 'true';
    masterUnsubs.push(onSnapshot(query(master('categories'), where('createdBy', '==', uid())), (s) => { state.categories = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'de')); render(); }));
    masterUnsubs.push(onSnapshot(query(master('stores'), where('createdBy', '==', uid())), (s) => { state.stores = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'de')); render(); }));
    masterUnsubs.push(onSnapshot(query(master('articles'), where('createdBy', '==', uid())), (s) => { state.articles = s.docs.map((d) => ({ id: d.id, ...d.data(), eanCodes: d.data().eanCodes || [], variants: d.data().variants || [], persistentNotes: d.data().persistentNotes || [], storeIds: d.data().storeIds || [] })).sort((a, b) => String(a.title).localeCompare(String(b.title), 'de')); render(); }));
    masterUnsubs.push(onSnapshot(query(master('notes'), where('createdBy', '==', uid())), (s) => { state.remarks = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }));
    masterUnsubs.push(onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notizen'), where('createdBy', '==', uid())), (s) => { state.notes = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }));
}

function listenLists() {
    if (listUnsub) listUnsub();
    listUnsub = onSnapshot(query(listsRef(), where('memberIds', 'array-contains', uid())), (snap) => {
        state.lists = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (Number(toDate(b.updatedAt)?.getTime() || 0) - Number(toDate(a.updatedAt)?.getTime() || 0)) || String(a.name).localeCompare(String(b.name), 'de'));
        if (!state.listId || !state.lists.some((x) => x.id === state.listId)) state.listId = getUserSetting(EL_LIST_KEY, state.lists[0]?.id || null);
        if (!state.listId || !state.lists.some((x) => x.id === state.listId)) state.listId = state.lists[0]?.id || null;
        if (state.listId) saveUserSetting(EL_LIST_KEY, state.listId);
        listenActiveList();
        render();
    });
}

function listenActiveList() {
    stopActive();
    const list = activeList();
    if (!list) return;
    activeUnsubs.push(onSnapshot(sub(list.id, 'permissions'), (s) => { Array.from(state.perms.keys()).filter((k) => k.startsWith(`${list.id}:`)).forEach((k) => state.perms.delete(k)); s.docs.forEach((d) => state.perms.set(`${list.id}:${d.id}`, { listId: list.id, userId: d.id, ...d.data() })); render(); }));
    activeUnsubs.push(onSnapshot(query(sub(list.id, 'items'), orderBy('createdAt', 'desc')), (s) => { state.items = s.docs.map((d) => ({ id: d.id, ...d.data(), storeIds: d.data().storeIds || [], eanCodes: d.data().eanCodes || [] })); render(); }));
    activeUnsubs.push(onSnapshot(query(sub(list.id, 'presence'), orderBy('lastSeen', 'desc')), (s) => { state.presence = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => Date.now() - (toDate(x.lastSeen)?.getTime() || 0) <= PRESENCE_MS); render(); }));
    activeUnsubs.push(onSnapshot(query(sub(list.id, 'activity'), orderBy('createdAt', 'desc'), limit(1)), (s) => { state.activity = s.docs[0] ? { id: s.docs[0].id, ...s.docs[0].data() } : null; render(); }));
    activeUnsubs.push(onSnapshot(sub(list.id, 'locks'), (s) => { state.locks.clear(); s.docs.forEach((d) => state.locks.set(d.id, { id: d.id, ...d.data() })); render(); }));
    touchPresence();
    presenceTimer = setInterval(touchPresence, 30000);
}

async function touchPresence() {
    const list = activeList();
    if (!list) return;
    await setDoc(doc(sub(list.id, 'presence'), uid()), { userId: uid(), userName: uname(), currentArea: state.mode === 'manage' ? MANAGE.find((x) => x.id === state.section)?.label || 'Verwaltung' : (state.mode === 'shop' ? 'Einkaufsmodus' : 'Eingabe'), lastSeen: serverTimestamp() }, { merge: true });
}

async function logActivity(text, payload = {}) {
    const list = activeList();
    if (!list) return;
    await addDoc(sub(list.id, 'activity'), { actorId: uid(), actorName: uname(), text, payload, createdAt: serverTimestamp() });
    await addDoc(sub(list.id, 'audit'), { actorId: uid(), actorName: uname(), text, payload, createdAt: serverTimestamp() });
}

function groupedOpen() {
    const items = state.items.filter((x) => x.status !== 'checked').filter((x) => !state.search.trim() || [x.title, x.note, x.persistentNote, ...(x.eanCodes || [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(state.search.trim().toLowerCase())));
    if (state.storeDisplay === 'combined') return [{ id: 'combined', label: 'Alle Geschäfte', note: '', items }];
    const map = new Map(state.stores.map((s) => [s.id, { id: s.id, label: s.name, note: activeList()?.storeNotes?.[s.id] || '', items: [] }]));
    const none = { id: 'none', label: 'Ohne Geschäft', note: '', items: [] };
    items.forEach((item) => { const sid = item.storeIds?.[0]; sid && map.has(sid) ? map.get(sid).items.push(item) : none.items.push(item); });
    const order = activeList()?.storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id);
    const out = order.map((id) => map.get(id)).filter((x) => x && x.items.length);
    if (none.items.length) out.push(none);
    return out.length ? out : [{ id: 'empty', label: 'Keine offenen Artikel', note: '', items: [] }];
}

function render() {
    if (!root) return;
    const list = activeList();
    const blocked = list && !canNow(list);
    document.getElementById('el-main').innerHTML = `
        <div class="elc space-y-3">
            <div class="flex flex-wrap justify-between gap-2 items-center">
                <div class="flex flex-wrap gap-2">${MODES.map((m) => `<button class="elb ${state.mode === m.id ? 'a' : 'bg-gray-100 text-gray-700'}" data-a="mode" data-v="${m.id}">${m.label}</button>`).join('')}</div>
                <div class="flex flex-wrap gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="store-display">${state.storeDisplay === 'split' ? 'Nach Geschäft' : 'Kombiniert'}</button><button class="elb a" data-a="open-settings">⚙️ Einstellungen</button></div>
            </div>
            <div class="elm">${state.lists.map((l) => `<button class="elb ${state.listId === l.id ? 'a' : 'bg-gray-100 text-gray-700'}" data-a="list" data-id="${l.id}">${escapeHtml(ell(l.name, 18))}</button>`).join('')}</div>
            ${state.mode === 'manage' ? `<div class="elm">${MANAGE.map((s) => `<button class="elb ${state.section === s.id ? 'a' : 'bg-gray-100 text-gray-700'}" data-a="section" data-v="${s.id}">${s.label}</button>`).join('')}</div>` : ''}
        </div>
        ${list ? `<div class="elc text-xs">${list.ownerId === uid() ? chip('Owner', 'bg-indigo-100 text-indigo-700') : chip(permActive(perm()) ? 'freigegeben' : 'abgelaufen', permActive(perm()) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')} ${chip(`Letztes Update ${dt(list.updatedAt)}`)} ${chip(`Von ${escapeHtml(list.updatedByName || list.ownerName || '—')}`)}</div>` : ''}
        ${list ? `<div class="elc text-xs">${state.presence.length ? state.presence.map((p) => chip(`${escapeHtml(p.userName || p.userId)} (${escapeHtml(p.currentArea || 'Liste')})`, 'bg-emerald-100 text-emerald-700')).join(' ') : '<span class="text-gray-400">Niemand sonst gerade aktiv.</span>'}</div>` : ''}
        <div class="elc text-xs font-semibold text-gray-600">${state.activity && Date.now() - (toDate(state.activity.createdAt)?.getTime() || 0) <= ACTIVITY_MS ? `${escapeHtml(state.activity.actorName || 'User')} · ${dt(state.activity.createdAt)} · ${escapeHtml(state.activity.text || '')}` : ' '}</div>
        ${blocked ? '<div class="elc text-sm font-bold text-red-700 bg-red-50 border-red-200">Diese Liste ist sichtbar, aber außerhalb deiner Zugriffszeit aktuell gesperrt.</div>' : renderBody()}
        ${renderChecked()}
    `;
    renderSettings();
    renderPurchase();
    renderDetail();
    renderArticle();
    renderScanner();
    renderUnknown();
}

function renderBody() {
    const list = activeList();
    if (!list) return '<div class="elc text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</div>';
    if (state.mode === 'add') return `<div class="elc space-y-3"><div class="grid grid-cols-[90px_110px_minmax(0,1fr)] gap-2"><input id="el-q" class="eli" value="${escapeHtml(state.q)}"><select id="el-unit" class="els">${UNITS.map((u) => `<option value="${u}" ${state.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select><input id="el-title" class="eli" placeholder="Artikel eingeben..." value="${escapeHtml(state.title)}"></div><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><select id="el-store-add" class="els"><option value="">Geschäft zuordnen...</option>${state.stores.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select><input id="el-note" class="eli" placeholder="Anmerkung optional" value="${escapeHtml(state.note)}"><button class="elb a" data-a="add-item" ${!canAdd() ? 'disabled' : ''}>+ Hinzufügen</button></div>${state.storeIds.length ? `<div class="elm">${state.storeIds.map((id) => chip(`${escapeHtml(state.stores.find((s) => s.id === id)?.name || id)} <button data-a="del-store" data-id="${id}">×</button>`, 'bg-orange-100 text-orange-700')).join(' ')}</div>` : '<div class="text-xs text-gray-400">Optional einem oder mehreren Geschäften zuordnen.</div>'}</div>`;
    if (state.mode === 'shop') return `<div class="space-y-3"><div class="elc"><div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input id="el-search" class="eli" placeholder="Suchen oder scannen..." value="${escapeHtml(state.search)}"><button class="elb a" data-a="open-scan">📷</button></div></div>${groupedOpen().map((g) => `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">${escapeHtml(g.label)}</div><div class="text-xs font-bold text-gray-600">${g.items.length} offen</div></div>${g.note ? `<div class="text-xs rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-orange-800">${escapeHtml(g.note)}</div>` : ''}${g.items.length ? g.items.map(renderItem).join('') : '<div class="py-3 text-sm text-gray-400">Keine offenen Artikel.</div>'}</div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Artikel gefunden.</div>'}</div>`;
    if (!canManage()) return '<div class="elc text-sm text-red-700">Keine Verwaltungsberechtigung für diese Liste.</div>';
    if (state.section === 'general') return `<div class="space-y-3"><div class="elc"><div class="elstat"><div><div class="text-[11px] font-bold uppercase text-gray-500">Aktive Listen</div><div class="text-xl font-black text-indigo-700">${state.lists.filter((l) => l.active !== false).length}</div></div><div><div class="text-[11px] font-bold uppercase text-gray-500">Offene Artikel</div><div class="text-xl font-black text-orange-700">${state.items.filter((x) => x.status !== 'checked').length}</div></div><div><div class="text-[11px] font-bold uppercase text-gray-500">Letztes Update</div><div class="text-sm font-black text-slate-700">${dt(activeList()?.updatedAt)}</div></div></div></div>${state.lists.map((l) => `<div class="elc"><div class="flex justify-between gap-2"><div><div class="font-bold text-sm">${escapeHtml(l.name)}</div><div class="text-xs text-gray-500">${dt(l.updatedAt)} · ${escapeHtml(l.updatedByName || l.ownerName || '—')}</div></div><div class="text-xs font-bold text-gray-600">${l.id === state.listId ? state.items.filter((x) => x.status !== 'checked').length : '…'} offen</div></div></div>`).join('')}</div>`;
    if (state.section === 'stores') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-store" class="eli" placeholder="Neues Geschäft" value="${escapeHtml(state.drafts.store)}"><button class="elb a" data-a="add-store" ${!canManageWrite() ? 'disabled' : ''}>+ Geschäft</button></div>${(activeList()?.storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id)).map((id, i, arr) => { const s = state.stores.find((x) => x.id === id); if (!s) return ''; return `<div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-bold text-sm">${escapeHtml(s.name)}</div><div class="flex flex-wrap gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="store-up" data-id="${s.id}" ${i === 0 || !canManageWrite() ? 'disabled' : ''}>↑</button><button class="elb bg-gray-100 text-gray-700" data-a="store-down" data-id="${s.id}" ${i === arr.length - 1 || !canManageWrite() ? 'disabled' : ''}>↓</button><button class="elb bg-red-600 text-white" data-a="del-store-master" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div></div><div class="elm">${state.categories.map((c) => `<label class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${(s.categoryOrder || []).includes(c.id) ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}"><input type="checkbox" data-a="store-cat" data-store="${s.id}" data-cat="${c.id}" ${(s.categoryOrder || []).includes(c.id) ? 'checked' : ''} ${!canManageWrite() ? 'disabled' : ''}>${escapeHtml(c.name)}</label>`).join(' ')}</div></div>`; }).join('')}</div>`;
    if (state.section === 'articles') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-article-search" class="eli" placeholder="Artikel suchen..." value="${escapeHtml(state.articleSearch)}"><label class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold bg-slate-100 text-slate-700"><input type="checkbox" id="el-missing-ean" ${state.missingEanOnly ? 'checked' : ''}> Ohne EAN</label><button class="elb a" data-a="open-article" ${!canManageWrite() ? 'disabled' : ''}>+ Artikel</button></div>${state.articles.filter((a) => (!state.missingEanOnly || !(a.eanCodes?.length || a.variants?.some((v) => v?.eanCodes?.length))) && (!state.articleSearch.trim() || [a.title, ...(a.eanCodes || [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(state.articleSearch.toLowerCase())))).map((a) => `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="font-bold text-sm">${escapeHtml(a.title)}</div><div class="text-xs text-gray-500">${fmtQty(a.defaultQuantity || 1)} ${escapeHtml(a.defaultUnit || 'Stück')} · ${escapeHtml(state.categories.find((c) => c.id === a.categoryId)?.name || 'Ohne Kategorie')}</div></div><div class="flex flex-wrap gap-2">${a.eanCodes?.length || a.variants?.some((v) => v?.eanCodes?.length) ? chip('EAN OK', 'bg-emerald-100 text-emerald-700') : chip('ohne EAN', 'bg-red-100 text-red-700')}<button class="elb bg-gray-100 text-gray-700" data-a="edit-article" data-id="${a.id}" ${!canManageWrite() ? 'disabled' : ''}>Bearbeiten</button></div></div><div class="text-xs text-gray-600">${escapeHtml((a.persistentNotes || []).join(' · '))}</div><div class="elm">${(a.eanCodes || []).map((code) => chip(escapeHtml(code))).join(' ') || '<span class="text-xs text-gray-400">Keine Haupt-EAN</span>'}</div></div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Artikel gefunden.</div>'}</div>`;
    if (state.section === 'categories') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-category" class="eli" placeholder="Neue Kategorie" value="${escapeHtml(state.drafts.category)}"><button class="elb a" data-a="add-category" ${!canManageWrite() ? 'disabled' : ''}>+ Kategorie</button></div>${state.categories.map((c) => `<div class="elc flex flex-wrap justify-between gap-2"><div class="font-bold text-sm">${escapeHtml(c.name)}</div><button class="elb bg-red-600 text-white" data-a="del-category" data-id="${c.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div>`).join('')}</div>`;
    if (state.section === 'remarks') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-remark" class="eli" placeholder="Häufige Anmerkung" value="${escapeHtml(state.drafts.remark)}"><button class="elb a" data-a="add-remark" ${!canManageWrite() ? 'disabled' : ''}>+ Anmerkung</button></div>${state.remarks.map((n) => `<div class="elc flex flex-wrap justify-between gap-2"><div class="font-bold text-sm">${escapeHtml(n.text || n.name || '')}</div><button class="elb bg-red-600 text-white" data-a="del-remark" data-id="${n.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Anmerkungen.</div>'}</div>`;
    return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-note" class="eli" placeholder="Meta-Notiz" value="${escapeHtml(state.drafts.note)}"><button class="elb a" data-a="add-note" ${!canManageWrite() ? 'disabled' : ''}>+ Notiz</button></div>${state.notes.map((n) => `<div class="elc flex flex-wrap justify-between gap-2"><div class="font-bold text-sm">${escapeHtml(n.text || n.name || '')}</div><button class="elb bg-red-600 text-white" data-a="del-note" data-id="${n.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Notizen.</div>'}</div>`;
}

function renderItem(item) {
    const lock = state.locks.get(item.id); const locked = lock && lock.userId !== uid() && Date.now() < ((toDate(lock.expiresAt)?.getTime() || 0));
    return `<div class="elitem border-t border-gray-100"><button class="text-left min-w-0" data-a="detail" data-id="${item.id}"><div class="flex flex-wrap gap-2 items-center"><div class="font-bold text-sm text-gray-900 truncate flex-1">${escapeHtml(ell(item.title, 40))}</div>${chip(`${fmtQty(item.quantity)} ${escapeHtml(item.unit || '')}`, 'bg-indigo-50 text-indigo-700')}${state.categories.find((c) => c.id === item.categoryId) ? chip(escapeHtml(state.categories.find((c) => c.id === item.categoryId).name), 'bg-amber-50 text-amber-700') : ''}${locked ? chip(`gesperrt von ${escapeHtml(lock.userName || lock.userId)}`, 'bg-red-100 text-red-700') : ''}</div><div class="text-xs text-gray-500 mt-1">${escapeHtml((item.storeIds || []).map((id) => state.stores.find((s) => s.id === id)?.name || id).join(', '))}${item.restoredAt ? ` · Wiederhergestellt von ${escapeHtml(item.restoredByName || '—')} · ${dt(item.restoredAt)}` : ''}</div>${item.persistentNote ? `<div class="text-xs text-gray-600 mt-2">${escapeHtml(item.persistentNote)}</div>` : ''}${item.note ? `<div class="text-xs text-gray-600 mt-1">${escapeHtml(item.note)}</div>` : ''}</button><button class="elcheck" data-a="check" data-id="${item.id}" title="2x schnell = abhaken · 2s halten = Menge">✓</button></div>`;
}

function renderChecked() {
    const done = state.items.filter((x) => x.status === 'checked').sort((a, b) => (toDate(b.checkedAt)?.getTime() || 0) - (toDate(a.checkedAt)?.getTime() || 0));
    return `<div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">Abgehackt-Liste</div><div class="text-xs font-bold text-gray-600">${done.length} erledigt</div></div>${done.length ? done.map((item) => `<div class="elitem border-t border-gray-100"><button class="text-left min-w-0" data-a="detail" data-id="${item.id}"><div class="font-bold text-sm text-gray-800 truncate">${escapeHtml(ell(item.title, 40))}</div><div class="text-xs text-gray-500 mt-1">Von ${escapeHtml(item.checkedByName || '—')} · ${dt(item.checkedAt)}</div></button><button class="elcheck" data-a="restore" data-id="${item.id}" title="2x schnell = wiederherstellen">↺</button></div>`).join('') : '<div class="py-2 text-sm text-gray-400">Noch nichts abgehakt.</div>'}</div>`;
}

function renderSettings() {
    const el = document.getElementById('el-settings');
    if (!el) return;
    const list = activeList();
    el.className = `elmodal ${state.settingsOpen ? 'o' : ''}`;
    if (!state.settingsOpen) { el.innerHTML = ''; return; }
    const permissionEntries = state.listId ? Array.from(state.perms.values()).filter((p) => p.listId === state.listId).filter((p) => p.userId !== uid()) : [];
    const candidates = Object.values(USERS || {}).filter((u) => u.id !== uid() && u.name && u.permissionType !== 'not_registered');
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Einkaufslisten verwalten</div><div class="text-sm text-gray-500">Privatliste ist fix, nicht umbenennbar und nicht teilbar.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-settings">Schließen</button></div><div class="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"><div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">Listen</div><button class="elb a" data-a="create-list" ${!(currentUser.permissions || []).includes('EINKAUFSLISTE_CREATE') && currentUser.role !== 'SYSTEMADMIN' ? 'disabled' : ''}>+ Liste</button></div>${state.lists.map((l) => `<button class="w-full text-left rounded-2xl border p-3 ${state.listId === l.id ? 'ring-2 ring-indigo-500 border-indigo-300' : 'border-gray-200'}" data-a="list" data-id="${l.id}"><div class="font-bold text-sm">${escapeHtml(l.name)}</div><div class="text-xs text-gray-500">${l.isPrivateSystemList ? 'Privatliste' : 'Normale Liste'} · ${l.active !== false ? 'aktiv' : 'pausiert'}</div></button>`).join('')}</div><div class="space-y-4">${list ? `<div class="elc space-y-3"><div class="font-black text-sm">Allgemein</div><div class="grid gap-3 sm:grid-cols-2"><input id="el-set-name" class="eli" value="${escapeHtml(list.name || '')}" ${list.isPrivateSystemList || list.ownerId !== uid() ? 'disabled' : ''}><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-set-active" ${list.active !== false ? 'checked' : ''} ${list.isPrivateSystemList || list.ownerId !== uid() ? 'disabled' : ''}> aktiv</label></div>${list.ownerId === uid() && !list.isPrivateSystemList ? `<div class="flex flex-wrap gap-2"><button class="elb a" data-a="save-list">Liste speichern</button><button class="elb bg-red-600 text-white" data-a="delete-list" data-id="${list.id}">Liste löschen</button></div>` : ''}</div><div class="elc space-y-3"><div class="font-black text-sm">Mitbearbeiter</div>${list.ownerId === uid() && !list.isPrivateSystemList ? `<div class="space-y-3"><div class="grid gap-2 sm:grid-cols-3"><select id="el-c-user" class="els"><option value="">Person auswählen...</option>${candidates.map((u) => `<option value="${u.id}" ${state.collab.userId === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select><input id="el-c-from" type="datetime-local" class="eli" value="${escapeHtml(state.collab.accessFrom)}"><input id="el-c-until" type="datetime-local" class="eli" value="${escapeHtml(state.collab.accessUntil)}"></div><div class="elm"><label>${'<input id="el-cr" type="checkbox" ' + (state.collab.canRead ? 'checked' : '') + '> Lesen'}</label><label>${'<input id="el-ca" type="checkbox" ' + (state.collab.canAdd ? 'checked' : '') + '> Hinzufügen'}</label><label>${'<input id="el-cs" type="checkbox" ' + (state.collab.canShop ? 'checked' : '') + '> Einkaufsmodus'}</label><label>${'<input id="el-cm" type="checkbox" ' + (state.collab.canManage ? 'checked' : '') + '> Verwaltung'}</label><label>${'<input id="el-cw" type="checkbox" ' + (state.collab.canManageWrite ? 'checked' : '') + '> Lesen/Bearbeiten'}</label></div><button class="elb a" data-a="save-collab">Freigabe speichern</button></div>` : '<div class="text-sm text-gray-500">Nur der Owner kann Freigaben verwalten.</div>'}${permissionEntries.map((p) => `<div class="rounded-2xl border border-gray-200 p-3"><div class="flex flex-wrap justify-between gap-2"><div><div class="font-bold text-sm">${escapeHtml(p.userName || USERS[p.userId]?.name || p.userId)}</div><div class="text-xs text-gray-500">Von ${dt(p.accessFrom)} · Bis ${p.accessUntil ? dt(p.accessUntil) : 'unbegrenzt'}</div><div class="mt-2 text-xs">${p.canRead ? chip('Lesen') : ''} ${p.canAdd ? chip('Hinzufügen', 'bg-indigo-100 text-indigo-700') : ''} ${p.canShop ? chip('Einkauf', 'bg-emerald-100 text-emerald-700') : ''} ${p.canManage ? chip('Verwaltung', 'bg-amber-100 text-amber-700') : ''} ${!permActive(p) ? chip('abgelaufen', 'bg-red-100 text-red-700') : ''}</div></div>${list.ownerId === uid() ? `<button class="elb bg-red-600 text-white" data-a="del-collab" data-id="${p.userId}">Entfernen</button>` : ''}</div></div>`).join('') || '<div class="text-sm text-gray-400">Keine Mitbearbeiter eingetragen.</div>'}</div>` : '<div class="elc text-sm text-gray-400">Keine Liste ausgewählt.</div>'}</div></div></div>`;
}

function renderPurchase() {
    const el = document.getElementById('el-purchase');
    if (!el) return;
    const p = state.purchase;
    el.className = `elmodal ${p ? 'o' : ''}`;
    if (!p) { el.innerHTML = ''; return; }
    const delta = Number((Number(p.quantity || 0) - Number(p.target || 0)).toFixed(2));
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">${escapeHtml(p.title)}</div><div class="text-sm text-gray-500">${p.kind === 'scan' ? 'Scan-Erfassung' : 'Mengenübernahme'}</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-purchase">Abbruch</button></div><div class="elc space-y-2 bg-slate-50"><div class="text-xs font-bold uppercase text-gray-500">Menge</div><div class="text-3xl font-black text-indigo-700">${fmtQty(p.quantity)} ${escapeHtml(p.unit)}</div>${p.target ? `<div class="text-sm text-gray-600">Soll lt. Liste: ${fmtQty(p.target)} ${escapeHtml(p.unit)}</div>` : ''}${delta !== 0 ? `<div class="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800">${delta > 0 ? `Achtung +${fmtQty(delta)} – übernehmen?` : `Achtung ${fmtQty(delta)} – übernehmen?`}</div>` : ''}</div><div class="elkey">${['1','2','3','4','5','6','7','8','9','0',','].map((d) => `<button data-a="digit" data-v="${d}">${d}</button>`).join('')}<button data-a="back">⌫</button><button data-a="full">Soll</button><button data-a="clear">C</button><button data-a="one">1</button></div><div class="flex flex-wrap justify-between gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="close-purchase">Abbruch</button><button class="elb bg-emerald-600 text-white" data-a="confirm-purchase">Übernehmen</button></div></div>`;
}

function renderDetail() {
    const el = document.getElementById('el-detail'); if (!el) return; const item = state.items.find((x) => x.id === state.detailId); el.className = `elmodal ${item ? 'o' : ''}`; if (!item) { el.innerHTML = ''; return; } const article = state.articles.find((a) => a.id === item.articleId); el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="text-xl font-black text-gray-900">${escapeHtml(item.title)}</div><button class="elb bg-gray-100 text-gray-700" data-a="close-detail">Schließen</button></div><div class="elc space-y-2 bg-slate-50 text-sm"><div><b>Voller Name:</b> ${escapeHtml(item.title)}</div><div><b>Menge:</b> ${fmtQty(item.quantity)} ${escapeHtml(item.unit || '')}</div><div><b>Kategorie:</b> ${escapeHtml(state.categories.find((c) => c.id === item.categoryId)?.name || '—')}</div><div><b>Bemerkung:</b> ${escapeHtml(item.note || '—')}</div><div><b>Permanente Anmerkung:</b> ${escapeHtml(item.persistentNote || '—')}</div><div><b>EAN-Codes:</b> ${escapeHtml((article?.eanCodes || []).join(', ') || 'keine')}</div></div></div>`;
}

function renderArticle() {
    const el = document.getElementById('el-article'); if (!el) return; const a = state.articleEditor; el.className = `elmodal ${a ? 'o' : ''}`; if (!a) { el.innerHTML = ''; return; } el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="text-xl font-black text-gray-900">${a.id ? 'Artikel bearbeiten' : 'Artikel anlegen'}</div><button class="elb bg-gray-100 text-gray-700" data-a="close-article">Schließen</button></div><div class="grid gap-2 sm:grid-cols-2"><input id="ela-title" class="eli" placeholder="Bezeichnung" value="${escapeHtml(a.title || '')}"><input id="ela-q" class="eli" placeholder="Standardmenge" value="${escapeHtml(String(a.defaultQuantity || '1'))}"><select id="ela-unit" class="els">${UNITS.map((u) => `<option value="${u}" ${a.defaultUnit === u ? 'selected' : ''}>${u}</option>`).join('')}</select><select id="ela-cat" class="els"><option value="">Kategorie wählen...</option>${state.categories.map((c) => `<option value="${c.id}" ${a.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div><textarea id="ela-ean" class="elt" placeholder="EAN-Codes, eine Zeile pro Code">${escapeHtml((a.eanCodes || []).join('\n'))}</textarea><textarea id="ela-var" class="elt" placeholder="Varianten je Zeile: Name|EAN1,EAN2">${escapeHtml((a.variants || []).map((v) => `${v.label || ''}|${(v.eanCodes || []).join(',')}`).join('\n'))}</textarea><textarea id="ela-note" class="elt" placeholder="Permanente Anmerkungen, je Zeile">${escapeHtml((a.persistentNotes || []).join('\n'))}</textarea><div class="elm">${state.stores.map((s) => `<label class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${(a.storeIds || []).includes(s.id) ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}"><input type="checkbox" data-a="art-store" data-id="${s.id}" ${(a.storeIds || []).includes(s.id) ? 'checked' : ''}> ${escapeHtml(s.name)}</label>`).join(' ')}</div><div class="flex flex-wrap justify-end gap-2">${a.id ? `<button class="elb bg-red-600 text-white" data-a="delete-article" data-id="${a.id}">Löschen</button>` : ''}<button class="elb bg-emerald-600 text-white" data-a="save-article">Speichern</button></div></div>`;
}

function renderScanner() {
    const el = document.getElementById('el-scanner'); if (!el) return; el.className = `elmodal ${state.scanOpen ? 'o' : ''}`; if (!state.scanOpen) { el.innerHTML = ''; stopScanner(); return; } el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Scanner</div><div class="text-sm text-gray-500">Barcode + QR live, ohne Refresh.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-scan">Schließen</button></div><div class="elcam"><video id="el-video" autoplay playsinline muted></video></div><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input id="el-scan-manual" class="eli" placeholder="EAN/QR manuell eingeben"><button class="elb a" data-a="manual-scan">Code übernehmen</button></div><div id="el-scan-status" class="text-sm text-gray-500">Kamera wird gestartet...</div></div>`; startScanner();
}

function renderUnknown() {
    const el = document.getElementById('el-unknown'); if (!el) return; el.className = `elmodal ${state.unknownCode ? 'o' : ''}`; if (!state.unknownCode) { el.innerHTML = ''; return; } el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Unbekannter Code</div><div class="text-sm text-gray-500">Bitte zuerst einem bestehenden Artikel zuordnen.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-unknown">Abbruch</button></div><div class="elc bg-slate-50 text-sm font-bold text-slate-700">Code: ${escapeHtml(state.unknownCode)}</div><select id="el-unknown-article" class="els"><option value="">Bestehendem Artikel zuordnen...</option>${state.articles.map((a) => `<option value="${a.id}" ${state.unknownArticleId === a.id ? 'selected' : ''}>${escapeHtml(a.title)}</option>`).join('')}</select><div class="flex flex-wrap justify-end gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="close-unknown">Abbruch</button><button class="elb bg-emerald-600 text-white" data-a="save-unknown">Zuordnen</button></div></div>`;
}

function onInput(e) {
    const t = e.target;
    if (t.id === 'el-q') state.q = t.value;
    if (t.id === 'el-title') state.title = t.value;
    if (t.id === 'el-note') state.note = t.value;
    if (t.id === 'el-search') { state.search = t.value; render(); }
    if (t.id === 'el-article-search') { state.articleSearch = t.value; render(); }
    if (t.id === 'el-draft-category') state.drafts.category = t.value;
    if (t.id === 'el-draft-store') state.drafts.store = t.value;
    if (t.id === 'el-draft-remark') state.drafts.remark = t.value;
    if (t.id === 'el-draft-note') state.drafts.note = t.value;
}

function onChange(e) {
    const t = e.target;
    if (t.id === 'el-unit') state.unit = t.value;
    if (t.id === 'el-store-add' && t.value) { if (!state.storeIds.includes(t.value)) state.storeIds.push(t.value); t.value = ''; render(); }
    if (t.id === 'el-missing-ean') { state.missingEanOnly = t.checked; render(); }
    if (t.id === 'el-unknown-article') state.unknownArticleId = t.value;
    if (t.id === 'el-c-user') state.collab.userId = t.value;
    if (t.id === 'el-c-from') state.collab.accessFrom = t.value;
    if (t.id === 'el-c-until') state.collab.accessUntil = t.value;
    if (t.id === 'el-cr') state.collab.canRead = t.checked;
    if (t.id === 'el-ca') state.collab.canAdd = t.checked;
    if (t.id === 'el-cs') state.collab.canShop = t.checked;
    if (t.id === 'el-cm') state.collab.canManage = t.checked;
    if (t.id === 'el-cw') state.collab.canManageWrite = t.checked;
}

function onDown(e) {
    const btn = e.target.closest('[data-a="check"], [data-a="detail"]');
    if (!btn) return;
    holdPayload = { action: btn.dataset.a, id: btn.dataset.id };
    holdTimer = setTimeout(() => onHold(holdPayload), HOLD_MS);
}

function clearHold() { if (holdTimer) clearTimeout(holdTimer); holdTimer = null; holdPayload = null; }

function onHold(payload) {
    const item = state.items.find((x) => x.id === payload.id);
    if (!item) return;
    if (navigator.vibrate) navigator.vibrate(30);
    openPurchase(item, false);
}

async function onClick(e) {
    const btn = e.target.closest('[data-a]');
    if (!btn) return;
    const a = btn.dataset.a;
    if (a === 'mode') { state.mode = btn.dataset.v; saveUserSetting(EL_MODE_KEY, state.mode); touchPresence(); render(); return; }
    if (a === 'section') { state.section = btn.dataset.v; saveUserSetting(EL_SECTION_KEY, state.section); touchPresence(); render(); return; }
    if (a === 'store-display') { state.storeDisplay = state.storeDisplay === 'split' ? 'combined' : 'split'; saveUserSetting(EL_STORE_KEY, state.storeDisplay); render(); return; }
    if (a === 'list') { const list = state.lists.find((x) => x.id === btn.dataset.id); if (list && list.ownerId !== uid() && !permActive(perm(list.id))) { alertUser('Diese Liste ist außerhalb deiner Zugriffszeit gesperrt.', 'error'); return; } state.listId = btn.dataset.id; saveUserSetting(EL_LIST_KEY, state.listId); listenActiveList(); render(); return; }
    if (a === 'open-settings') { state.settingsOpen = true; render(); return; }
    if (a === 'close-settings') { state.settingsOpen = false; render(); return; }
    if (a === 'del-store') { state.storeIds = state.storeIds.filter((x) => x !== btn.dataset.id); render(); return; }
    if (a === 'add-item') { await addItem(); return; }
    if (a === 'check' || a === 'restore') { await handleDouble(btn.dataset.id, a); return; }
    if (a === 'detail') { state.detailId = btn.dataset.id; render(); return; }
    if (a === 'close-detail') { state.detailId = null; render(); return; }
    if (a === 'open-scan') { state.scanOpen = true; render(); return; }
    if (a === 'close-scan') { state.scanOpen = false; render(); return; }
    if (a === 'manual-scan') { const v = document.getElementById('el-scan-manual')?.value || ''; if (v.trim()) await handleScanCode(v.trim()); return; }
    if (a === 'close-unknown') { state.unknownCode = ''; state.unknownArticleId = ''; render(); return; }
    if (a === 'save-unknown') { await saveUnknownCode(); return; }
    if (a === 'open-article') { state.articleEditor = { title: '', defaultQuantity: 1, defaultUnit: 'Stück', categoryId: '', eanCodes: [], variants: [], persistentNotes: [], storeIds: [] }; render(); return; }
    if (a === 'edit-article') { const article = state.articles.find((x) => x.id === btn.dataset.id); if (article) { state.articleEditor = JSON.parse(JSON.stringify(article)); render(); } return; }
    if (a === 'close-article') { state.articleEditor = null; render(); return; }
    if (a === 'art-store') { const ids = state.articleEditor.storeIds || []; state.articleEditor.storeIds = ids.includes(btn.dataset.id) ? ids.filter((x) => x !== btn.dataset.id) : [...ids, btn.dataset.id]; renderArticle(); return; }
    if (a === 'save-article') { await saveArticle(); return; }
    if (a === 'delete-article') { await deleteDoc(doc(master('articles'), btn.dataset.id)); await logActivity('Artikel gelöscht', { articleId: btn.dataset.id }); state.articleEditor = null; return; }
    if (a === 'add-category') { await addMaster('categories', state.drafts.category, 'name'); state.drafts.category = ''; render(); return; }
    if (a === 'del-category') { await deleteDoc(doc(master('categories'), btn.dataset.id)); await logActivity('Kategorie gelöscht', { categoryId: btn.dataset.id }); return; }
    if (a === 'add-store') { await addMaster('stores', state.drafts.store, 'name'); state.drafts.store = ''; render(); return; }
    if (a === 'del-store-master') { await deleteDoc(doc(master('stores'), btn.dataset.id)); await logActivity('Geschäft gelöscht', { storeId: btn.dataset.id }); return; }
    if (a === 'store-up' || a === 'store-down') { await moveStore(btn.dataset.id, a === 'store-up' ? -1 : 1); return; }
    if (a === 'store-cat') { await toggleStoreCategory(btn.dataset.store, btn.dataset.cat, e.target.checked); return; }
    if (a === 'add-remark') { await addFree(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notes'), state.drafts.remark); state.drafts.remark = ''; render(); return; }
    if (a === 'del-remark') { await deleteDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notes'), btn.dataset.id)); return; }
    if (a === 'add-note') { await addFree(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notizen'), state.drafts.note); state.drafts.note = ''; render(); return; }
    if (a === 'del-note') { await deleteDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notizen'), btn.dataset.id)); return; }
    if (a === 'create-list') { await createList(); return; }
    if (a === 'save-list') { await saveList(); return; }
    if (a === 'delete-list') { await deleteList(btn.dataset.id); return; }
    if (a === 'save-collab') { await saveCollaborator(); return; }
    if (a === 'del-collab') { await deleteDoc(doc(sub(state.listId, 'permissions'), btn.dataset.id)); await logActivity('Mitbearbeiter entfernt', { userId: btn.dataset.id }); return; }
    if (a === 'close-purchase') { state.purchase = null; render(); return; }
    if (a === 'digit') { state.purchase.raw = `${state.purchase.raw || ''}${btn.dataset.v}`; state.purchase.quantity = parseQty(state.purchase.raw || '0'); renderPurchase(); resetAutoScan(); return; }
    if (a === 'back') { state.purchase.raw = String(state.purchase.raw || '').slice(0, -1); state.purchase.quantity = parseQty(state.purchase.raw || '0'); renderPurchase(); resetAutoScan(); return; }
    if (a === 'clear') { state.purchase.raw = ''; state.purchase.quantity = 0; renderPurchase(); resetAutoScan(); return; }
    if (a === 'one') { state.purchase.raw = '1'; state.purchase.quantity = 1; renderPurchase(); resetAutoScan(); return; }
    if (a === 'full') { state.purchase.raw = String(state.purchase.target || state.purchase.base || 1).replace('.', ','); state.purchase.quantity = Number(state.purchase.target || state.purchase.base || 1); renderPurchase(); resetAutoScan(); return; }
    if (a === 'confirm-purchase') { await confirmPurchase(); return; }
}

async function addMaster(name, value, key) { const v = String(value || '').trim(); if (!v) return; await addDoc(master(name), { [key]: v, createdBy: uid(), createdByName: uname(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
async function addFree(ref, value) { const v = String(value || '').trim(); if (!v) return; await addDoc(ref, { text: v, createdBy: uid(), createdByName: uname(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); }

async function addItem() {
    if (!canAdd()) return alertUser('Keine Berechtigung zum Hinzufügen.', 'error');
    const title = String(state.title || '').trim(); if (!title) return alertUser('Bitte Artikel eingeben.', 'error');
    const quantity = parseQty(state.q || '1') || 1;
    let article = state.articles.find((a) => a.title?.trim().toLowerCase() === title.toLowerCase());
    if (!article) {
        const ref = await addDoc(master('articles'), { title, defaultQuantity: quantity, defaultUnit: state.unit, categoryId: '', eanCodes: [], variants: [], persistentNotes: [], storeIds: [...state.storeIds], createdBy: uid(), createdByName: uname(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        article = { id: ref.id, title, defaultQuantity: quantity, defaultUnit: state.unit, persistentNotes: [], eanCodes: [], storeIds: [...state.storeIds] };
    }
    const persistentNote = article.persistentNotes?.length ? article.persistentNotes.join(' · ') : '';
    await addDoc(sub(state.listId, 'items'), { articleId: article.id, title, quantity, unit: state.unit, categoryId: article.categoryId || '', storeIds: [...state.storeIds], status: 'open', note: state.note || '', persistentNote, eanCodes: article.eanCodes || [], createdAt: serverTimestamp(), createdBy: uid(), createdByName: uname() });
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname(), storeOrder: activeList().storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id) });
    await logActivity('Artikel hinzugefügt', { title, quantity, unit: state.unit });
    state.q = '1'; state.title = ''; state.note = ''; state.storeIds = []; render();
}

async function handleDouble(id, action) {
    const key = `${action}:${id}`; const last = state.lastTap.get(key) || 0; const now = Date.now(); state.lastTap.set(key, now);
    if (now - last > DOUBLE_MS) return;
    if (action === 'check') { openPurchase(state.items.find((x) => x.id === id), false); return; }
    const item = state.items.find((x) => x.id === id); if (!item) return;
    await updateDoc(doc(sub(state.listId, 'items'), id), { status: 'open', restoredAt: serverTimestamp(), restoredBy: uid(), restoredByName: uname(), checkedAt: null, checkedBy: null, checkedByName: null });
    await logActivity('Artikel wiederhergestellt', { itemId: id, title: item.title });
}

function openPurchase(itemOrArticle, isScan) {
    const item = itemOrArticle?.status ? itemOrArticle : null;
    const article = item ? state.articles.find((a) => a.id === item.articleId) : itemOrArticle;
    const title = item?.title || article?.title || 'Artikel';
    const unit = item?.unit || article?.defaultUnit || 'Stück';
    const base = Number(item?.quantity || article?.defaultQuantity || 1);
    state.purchase = { kind: isScan ? 'scan' : 'manual', itemId: item?.id || '', articleId: item?.articleId || article?.id || '', title, unit, target: item ? Number(item.quantity || 0) : 0, base, raw: '1', quantity: 1 };
    renderPurchase();
    resetAutoScan(isScan);
}

function resetAutoScan(isScan = state.purchase?.kind === 'scan') {
    if (autoScanTimer) clearTimeout(autoScanTimer);
    if (isScan && state.purchase) autoScanTimer = setTimeout(() => { if (state.purchase) confirmPurchase(); }, AUTO_SCAN_MS);
}

async function confirmPurchase() {
    const p = state.purchase; if (!p) return;
    const qty = Number(p.quantity || 0); if (!(qty > 0)) return alertUser('Bitte eine Menge eingeben.', 'error');
    if (p.itemId) {
        const item = state.items.find((x) => x.id === p.itemId); if (!item) return;
        await acquireLock(item.id);
        if (qty >= Number(item.quantity || 0)) {
            await updateDoc(doc(sub(state.listId, 'items'), item.id), { status: 'checked', purchasedQuantity: qty, checkedAt: serverTimestamp(), checkedBy: uid(), checkedByName: uname() });
        } else {
            const rest = Number((Number(item.quantity || 0) - qty).toFixed(2));
            await updateDoc(doc(sub(state.listId, 'items'), item.id), { status: 'checked', purchasedQuantity: qty, checkedAt: serverTimestamp(), checkedBy: uid(), checkedByName: uname() });
            await addDoc(sub(state.listId, 'items'), { ...item, quantity: rest, title: `Rest von ${item.title}`, status: 'open', createdAt: serverTimestamp(), createdBy: uid(), createdByName: uname(), restoredAt: null, restoredBy: null, restoredByName: null, checkedAt: null, checkedBy: null, checkedByName: null });
        }
        await logActivity('Artikel gekauft/abgehakt', { itemId: item.id, quantity: qty });
    } else {
        const article = state.articles.find((x) => x.id === p.articleId); if (!article) return;
        const open = state.items.find((x) => x.articleId === article.id && x.status !== 'checked');
        if (open) {
            openPurchase(open, true);
            state.purchase.quantity = qty;
            await confirmPurchase();
            return;
        }
        await addDoc(sub(state.listId, 'items'), { articleId: article.id, title: article.title, quantity: qty, unit: article.defaultUnit || 'Stück', categoryId: article.categoryId || '', storeIds: article.storeIds || [], status: 'checked', note: '', persistentNote: (article.persistentNotes || []).join(' · '), eanCodes: article.eanCodes || [], createdAt: serverTimestamp(), createdBy: uid(), createdByName: uname(), purchasedQuantity: qty, checkedAt: serverTimestamp(), checkedBy: uid(), checkedByName: uname() });
        await logActivity('Scan übernommen', { articleId: article.id, quantity: qty });
    }
    state.purchase = null;
    render();
}

async function acquireLock(itemId) {
    const ref = doc(sub(state.listId, 'locks'), itemId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref); const data = snap.exists() ? snap.data() : null; const exp = toDate(data?.expiresAt)?.getTime() || 0;
        if (data && data.userId !== uid() && Date.now() < exp) throw new Error('Gesperrt');
        tx.set(ref, { itemId, userId: uid(), userName: uname(), expiresAt: Timestamp.fromDate(new Date(Date.now() + LOCK_MS)), updatedAt: serverTimestamp() }, { merge: true });
    }).catch(() => alertUser('Artikel wird gerade von jemand anderem bearbeitet.', 'error'));
}

async function startScanner() {
    try {
        const video = document.getElementById('el-video'); const status = document.getElementById('el-scan-status'); if (!video) return;
        scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); video.srcObject = scanStream; if (status) status.textContent = 'Scanner aktiv.';
        if ('BarcodeDetector' in window) {
            const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
            scanTimer = setInterval(async () => {
                if (!state.scanOpen) return; try { const codes = await detector.detect(video); if (codes?.length) await handleScanCode(codes[0].rawValue || ''); } catch {}
            }, 700);
        } else if (status) status.textContent = 'BarcodeDetector nicht verfügbar. Bitte Code manuell eingeben.';
    } catch (e) { const status = document.getElementById('el-scan-status'); if (status) status.textContent = 'Kamera konnte nicht gestartet werden.'; }
}

async function handleScanCode(code) {
    const article = state.articles.find((a) => (a.eanCodes || []).includes(code) || (a.variants || []).some((v) => (v.eanCodes || []).includes(code)));
    if (!article) { state.unknownCode = code; state.unknownArticleId = ''; render(); return; }
    if (state.purchase) state.purchase = null;
    openPurchase(article, true);
}

async function saveUnknownCode() {
    if (!state.unknownCode || !state.unknownArticleId) return alertUser('Bitte Artikel auswählen.', 'error');
    const article = state.articles.find((a) => a.id === state.unknownArticleId); if (!article) return;
    await updateDoc(doc(master('articles'), article.id), { eanCodes: Array.from(new Set([...(article.eanCodes || []), state.unknownCode])) });
    await logActivity('EAN zugeordnet', { articleId: article.id, code: state.unknownCode });
    const code = state.unknownCode; state.unknownCode = ''; state.unknownArticleId = ''; render(); await handleScanCode(code);
}

async function saveArticle() {
    const a = state.articleEditor; if (!a) return; const title = document.getElementById('ela-title')?.value?.trim() || ''; if (!title) return alertUser('Bitte Bezeichnung eingeben.', 'error');
    const payload = { title, defaultQuantity: parseQty(document.getElementById('ela-q')?.value || '1') || 1, defaultUnit: document.getElementById('ela-unit')?.value || 'Stück', categoryId: document.getElementById('ela-cat')?.value || '', eanCodes: String(document.getElementById('ela-ean')?.value || '').split('\n').map((x) => x.trim()).filter(Boolean), variants: String(document.getElementById('ela-var')?.value || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => { const [label, codes] = line.split('|'); return { label: (label || '').trim(), eanCodes: String(codes || '').split(',').map((x) => x.trim()).filter(Boolean) }; }), persistentNotes: String(document.getElementById('ela-note')?.value || '').split('\n').map((x) => x.trim()).filter(Boolean), storeIds: a.storeIds || [], updatedAt: serverTimestamp(), createdBy: uid(), createdByName: uname() };
    if (a.id) await updateDoc(doc(master('articles'), a.id), payload); else await addDoc(master('articles'), { ...payload, createdAt: serverTimestamp() });
    await logActivity('Artikel gespeichert', { title }); state.articleEditor = null; render();
}

async function moveStore(id, dir) {
    const list = activeList(); if (!list) return; const order = list.storeOrder?.length ? [...list.storeOrder] : state.stores.map((s) => s.id); const i = order.indexOf(id); const j = i + dir; if (i < 0 || j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; await updateDoc(listDoc(list.id), { storeOrder: order, updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); await logActivity('Geschäftsreihenfolge geändert', { storeId: id });
}

async function toggleStoreCategory(storeId, catId, checked) {
    const store = state.stores.find((s) => s.id === storeId); if (!store) return; const next = checked ? Array.from(new Set([...(store.categoryOrder || []), catId])) : (store.categoryOrder || []).filter((x) => x !== catId); await updateDoc(doc(master('stores'), storeId), { categoryOrder: next, updatedAt: serverTimestamp() }); await logActivity('Geschäftskategorie geändert', { storeId, catId, checked });
}

async function createList() {
    const name = prompt('Name der neuen Einkaufsliste:'); if (!String(name || '').trim()) return;
    const ref = doc(listsRef()); await setDoc(ref, { name: String(name).trim(), ownerId: uid(), ownerName: uname(), isPrivateSystemList: false, active: true, memberIds: [uid()], storeOrder: state.stores.map((s) => s.id), storeNotes: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); state.listId = ref.id; await logActivity('Liste erstellt', { listId: ref.id, name: String(name).trim() });
}

async function saveList() {
    const list = activeList(); if (!list || list.ownerId !== uid() || list.isPrivateSystemList) return; const name = document.getElementById('el-set-name')?.value?.trim() || list.name; const active = !!document.getElementById('el-set-active')?.checked; await updateDoc(listDoc(list.id), { name, active, updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); await logActivity('Liste gespeichert', { listId: list.id, active, name });
}

async function deleteList(id) {
    const list = state.lists.find((x) => x.id === id); if (!list || list.ownerId !== uid() || list.isPrivateSystemList) return; if (!confirm(`Liste "${list.name}" löschen?`)) return; await deleteDoc(listDoc(id)); if (state.listId === id) state.listId = null; }

async function saveCollaborator() {
    const list = activeList(); if (!list || list.ownerId !== uid() || list.isPrivateSystemList) return; const c = state.collab; if (!c.userId) return alertUser('Bitte Person auswählen.', 'error'); await setDoc(doc(sub(list.id, 'permissions'), c.userId), { listId: list.id, userId: c.userId, userName: USERS[c.userId]?.name || c.userId, accessFrom: fromLocal(c.accessFrom || dtLocal(new Date())), accessUntil: fromLocal(c.accessUntil || ''), canRead: !!c.canRead, canAdd: !!c.canAdd, canShop: !!c.canShop, canManage: !!c.canManage, canManageWrite: !!c.canManageWrite, paused: list.active === false, updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); await updateDoc(listDoc(list.id), { memberIds: Array.from(new Set([...(list.memberIds || []), c.userId])), updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); await logActivity('Mitbearbeiter gespeichert', { userId: c.userId });
}
