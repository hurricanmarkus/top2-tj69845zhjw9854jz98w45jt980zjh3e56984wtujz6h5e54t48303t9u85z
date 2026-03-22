import { alertUser, appId, auth, currentUser, db, escapeHtml, GUEST_MODE, navigate, USERS } from './haupteingang.js';
import { getUserSetting, saveUserSetting } from './log-InOut.js';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, or, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const MODES = [{ id: 'manage', label: 'Verwaltung' }, { id: 'shop', label: 'Listenmodus' }];
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
let ownListDocs = [];
let sharedListDocs = [];
let sharedListDocMap = new Map();
let sharedListDocUnsubs = [];
let masterUnsubs = [];
let activeUnsubs = [];
let presenceTimer = null;
let scanStream = null;
let scanTimer = null;
let autoScanTimer = null;
let scanFlashTimer = null;
const itemActionTimers = new Map();
const itemActionVisible = new Set();
const quantityActionTimers = new Map();
const quantityActionVisible = new Set();
const scanRecentCodes = new Map();
const ITEM_ACTION_MS = 5000;
const QUANTITY_ACTION_MS = 5000;
const SCAN_LOCKOUT_MS = 10000;
let holdTimer = null;
let holdPayload = null;
let holdConsumedKey = '';
let holdConsumedAt = 0;
let doubleHintTimers = new Map();

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
    mode: 'shop',
    listMode: 'search',
    section: 'general',
    storeDisplay: 'split',
    q: '1',
    unit: 'Stück',
    title: '',
    note: '',
    storeIds: [],
    search: '',
    settingsOpen: false,
    detailsOpen: false,
    modePickerOpen: false,
    purchase: null,
    detailId: null,
    storeCategoryEditor: null,
    articleEditor: null,
    scanOpen: false,
    scanMode: 'shopping',
    scanArticleId: '',
    scanCodes: [],
    scanStatus: '',
    scanLastCode: '',
    scanLastAt: 0,
    unknownCode: '',
    unknownArticleId: '',
    dragStoreCategory: null,
    collab: { userId: '', accessFrom: '', accessUntil: '', canRead: true, canAdd: false, canShop: false, canManage: false, canManageWrite: false },
    lastTap: new Map(),
    missingEanOnly: false,
    storeNumbers: false,
    articleSearch: '',
    checkedMenuOpen: false,
    drafts: { category: '', store: '', remark: '', note: '' }
};

async function deleteListItem(itemId, activityLabel = 'Artikel gelöscht') {
    const item = state.items.find((x) => x.id === itemId);
    if (!item) return;
    if (!canEditItems()) return alertUser('Keine Berechtigung zum Löschen.', 'error');
    if (state.detailId === itemId) {
        state.detailId = null;
        render();
    }
    if (!(await acquireLock(item.id))) return;
    await deleteDoc(doc(sub(state.listId, 'items'), item.id));
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() });
    await logActivity(activityLabel, { itemId: item.id, title: item.title });
    render();
}

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
const isSettingTrue = (key, fallback = false) => { const value = getUserSetting(key, fallback); return value === true || value === 'true'; };
const chip = (t, cls = 'bg-slate-100 text-slate-700') => `<span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${cls}">${t}</span>`;
const ell = (s, n = 34) => String(s || '').length > n ? `${String(s || '').slice(0, n - 1)}…` : String(s || '');
const activeList = () => state.lists.find((x) => x.id === state.listId) || null;
const storedListId = () => { const value = String(getUserSetting(EL_LIST_KEY, '') || '').trim(); return value || null; };
const persistListId = () => saveUserSetting(EL_LIST_KEY, state.listId || '');
const perm = (listId = state.listId, userId = uid()) => state.perms.get(`${listId}:${userId}`) || null;
const permActive = (p) => { if (!p || p.paused) return false; const now = Date.now(); const a = toDate(p.accessFrom)?.getTime?.() || 0; const b = toDate(p.accessUntil)?.getTime?.() || Infinity; return now >= a && now <= b; };
const canRead = (l = activeList()) => !!l && (l.ownerId === uid() || perm(l.id)?.canRead);
const canNow = (l = activeList()) => !!l && l.active !== false && (l.ownerId === uid() || (perm(l.id)?.canRead && permActive(perm(l.id))));
const canAdd = (l = activeList()) => !!l && l.active !== false && (l.ownerId === uid() || (perm(l.id)?.canAdd && permActive(perm(l.id))));
const canShop = (l = activeList()) => !!l && l.active !== false && (l.ownerId === uid() || (perm(l.id)?.canShop && permActive(perm(l.id))));
const canManage = (l = activeList()) => !!l && (l.ownerId === uid() || (perm(l.id)?.canManage && permActive(perm(l.id))));
const canManageWrite = (l = activeList()) => !!l && (l.ownerId === uid() || (perm(l.id)?.canManage && perm(l.id)?.canManageWrite && permActive(perm(l.id))));
const canAddToList = (l = activeList()) => !!l && canAdd(l);
const canEditItems = (l = activeList()) => !!l && l.active !== false && (canAdd(l) || canShop(l));
const isRestItem = (item) => /^Rest von\s+/i.test(String(item?.title || '').trim());

function closePurchaseModal() {
    if (autoScanTimer) clearTimeout(autoScanTimer);
    autoScanTimer = null;
    state.purchase = null;
    render();
}

function closeDetailModal() {
    state.detailId = null;
    render();
}

function scheduleTimedVisibility(visibleSet, timerMap, id, durationMs) {
    if (!id) return;
    const existing = timerMap.get(id);
    if (existing) clearTimeout(existing);
    visibleSet.add(id);
    render();
    const timer = setTimeout(() => {
        visibleSet.delete(id);
        timerMap.delete(id);
        render();
    }, durationMs);
    timerMap.set(id, timer);
}

function clearTimedVisibility(visibleSet, timerMap, id) {
    if (!id) return;
    const existing = timerMap.get(id);
    if (existing) clearTimeout(existing);
    timerMap.delete(id);
    visibleSet.delete(id);
}

function showItemActionButtons(id) {
    scheduleTimedVisibility(itemActionVisible, itemActionTimers, id, ITEM_ACTION_MS);
}

function showQuantityActionButton(id) {
    scheduleTimedVisibility(quantityActionVisible, quantityActionTimers, id, QUANTITY_ACTION_MS);
}

function hideItemActionButtons(id) {
    clearTimedVisibility(itemActionVisible, itemActionTimers, id);
}

function hideQuantityActionButton(id) {
    clearTimedVisibility(quantityActionVisible, quantityActionTimers, id);
}

function isItemActionVisible(id) {
    return itemActionVisible.has(id);
}

function isQuantityActionVisible(id) {
    return quantityActionVisible.has(id);
}

function ensureStyle() {
    if (document.getElementById('el-style')) return;
    const s = document.createElement('style');
    s.id = 'el-style';
    s.textContent = '.elc{background:#fff;border:1px solid #e5e7eb;border-radius:1rem;padding:.8rem;box-shadow:0 10px 24px rgba(15,23,42,.06)}.elb{border-radius:.8rem;padding:.5rem .75rem;font-size:.78rem;font-weight:800}.elb.a{background:linear-gradient(135deg,#4338ca,#6d28d9);color:#fff}.eli,.els,.elt{width:100%;border:1px solid #d1d5db;border-radius:.8rem;background:#fff;padding:.62rem .75rem;font-size:.83rem}.elt{min-height:82px;resize:vertical}.elm{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center}.elitem{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.6rem;align-items:start;padding:.72rem 0}.elcheck{width:2.25rem;height:2.25rem;border-radius:.8rem;border:1px solid #cbd5e1;background:#fff;font-weight:900}.elmodal{position:fixed;inset:0;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center;padding:.8rem;z-index:120}.elmodal.o{display:flex}.elpanel{width:min(100%,760px);max-height:92vh;overflow:auto;background:#fff;border-radius:1.2rem;box-shadow:0 24px 60px rgba(15,23,42,.28)}.elkey{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.45rem}.elkey button{border-radius:.8rem;min-height:2.35rem;border:1px solid #d1d5db;background:#f8fafc;font-weight:800}.elcam{background:#020617;border-radius:1rem;overflow:hidden;position:relative;aspect-ratio:4/3}.elcam video{width:100%;height:100%;object-fit:cover}.elcam:after{content:"";position:absolute;inset:14%;border:3px solid rgba(255,255,255,.85);border-radius:1rem}.elstat{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem}.elstat>div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:.85rem;padding:.55rem}@media(max-width:480px){.elstat{grid-template-columns:repeat(2,minmax(0,1fr))}}';
    s.textContent += '.elitem{padding:.56rem 0}.elstorecat-row{touch-action:none}.elstorecat-row.dragging{opacity:.58;transform:scale(.985)}.elstorecat-row.drop-before{box-shadow:inset 0 4px 0 #6366f1}.elstorecat-row.drop-after{box-shadow:inset 0 -4px 0 #6366f1}.elchipbtn{display:inline-flex;align-items:center;justify-content:center;width:1rem;height:1rem;border-radius:999px;background:rgba(255,255,255,.7);font-size:.72rem;font-weight:900;line-height:1;margin-left:.15rem}.elaction{display:inline-flex;align-items:center;justify-content:center;min-height:2.25rem;min-width:2.25rem;border:1px solid #cbd5e1;border-radius:.8rem;background:#fff;padding:.35rem .55rem;font-size:.78rem;font-weight:900;line-height:1;transition:transform .12s ease,background-color .12s ease,border-color .12s ease}.elaction:active{transform:scale(.96)}.elaction-gear{background:#eef2ff;border-color:#c7d2fe;color:#4338ca}.elaction-trash{background:#fef2f2;border-color:#fecaca;color:#b91c1c}.elaction-qty{background:#ecfdf5;border-color:#a7f3d0;color:#047857;min-width:7.8rem}@media(max-width:480px){.elitem{padding:.48rem 0}.elaction{min-height:2rem;min-width:2rem;padding:.28rem .42rem;font-size:.72rem}.elaction-qty{min-width:auto;max-width:100%}}.elcam.el-scan-success{animation:elcamScanSuccess 750ms ease-in-out 1;box-shadow:0 0 0 4px rgba(34,197,94,.82),0 0 0 12px rgba(34,197,94,.24)}@keyframes elcamScanSuccess{0%{box-shadow:0 0 0 0 rgba(34,197,94,0)}15%{box-shadow:0 0 0 4px rgba(34,197,94,.82),0 0 0 12px rgba(34,197,94,.22)}30%{box-shadow:0 0 0 0 rgba(34,197,94,0)}55%{box-shadow:0 0 0 4px rgba(34,197,94,.82),0 0 0 12px rgba(34,197,94,.22)}70%{box-shadow:0 0 0 0 rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}';
    document.head.appendChild(s);
}

function ensureRoot() {
    root = document.getElementById('einkaufsliste-root');
    if (!root) return;
    if (!root.querySelector('#el-main')) {
        root.innerHTML = `<div class="space-y-3" id="el-main"></div><div id="el-modepicker"></div><div id="el-settings"></div><div id="el-purchase"></div><div id="el-detail"></div><div id="el-storecat"></div><div id="el-article"></div><div id="el-scanner"></div><div id="el-unknown"></div>`;
    }
    if (root.dataset.ready === 'true') return;
    root.dataset.ready = 'true';
    root.addEventListener('click', onClickActive);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKeyDownActive);
    root.addEventListener('pointermove', onPointerMoveActive);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointerup', finalizePointerState);
    root.addEventListener('pointerleave', finalizePointerState);
    root.addEventListener('pointercancel', finalizePointerState);
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
    const q = query(listsRef(), where('ownerId', '==', uid()), where('isPrivateSystemList', '==', true), limit(1));
    const snap = await getDocs(q);
    const ownPrivate = snap.docs[0] || null;
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

async function runInitStep(label, fn) {
    try {
        return await fn();
    } catch (error) {
        console.error(`Einkaufsliste Schritt fehlgeschlagen (${label}):`, error);
        throw new Error(label);
    }
}

function reportListenerError(label, error) {
    console.error(`Einkaufsliste Listener fehlgeschlagen (${label}):`, error);
}

function showInlineError(message) {
    const main = root?.querySelector('#el-main');
    if (main) main.innerHTML = `<div class="elc text-sm text-red-700">${escapeHtml(message)}</div>`;
}

function focusInputById(id, start = null, end = null) {
    requestAnimationFrame(() => {
        const input = root?.querySelector(`#${id}`);
        if (!input) return;
        input.focus({ preventScroll: true });
        if (typeof input.setSelectionRange === 'function') {
            const nextStart = Number.isInteger(start) ? start : input.value.length;
            const nextEnd = Number.isInteger(end) ? end : nextStart;
            input.setSelectionRange(nextStart, nextEnd);
        }
    });
}

function clearPermEntries(listId) {
    Array.from(state.perms.keys()).filter((k) => k.startsWith(`${listId}:`)).forEach((k) => state.perms.delete(k));
}

function stopSharedListDocListeners() {
    sharedListDocUnsubs.forEach((fn) => typeof fn === 'function' && fn());
    sharedListDocUnsubs = [];
    sharedListDocMap = new Map();
    sharedListDocs = [];
}

function syncSharedListDocs(listIds) {
    stopSharedListDocListeners();
    const ownerIds = new Set(ownListDocs.map((d) => d.id));
    const nextIds = Array.from(new Set((listIds || []).filter(Boolean))).filter((id) => !ownerIds.has(id));
    if (!nextIds.length) {
        applyListDocs([...ownListDocs]);
        return;
    }
    nextIds.forEach((listId) => {
        const unsub = onSnapshot(listDoc(listId), (snap) => {
            if (snap.exists()) sharedListDocMap.set(listId, snap);
            else sharedListDocMap.delete(listId);
            sharedListDocs = Array.from(sharedListDocMap.values());
            applyListDocs([...ownListDocs, ...sharedListDocs]);
        }, (error) => {
            reportListenerError(`listenLists:sharedDoc:${listId}`, error);
            sharedListDocMap.delete(listId);
            sharedListDocs = Array.from(sharedListDocMap.values());
            applyListDocs([...ownListDocs, ...sharedListDocs]);
        });
        sharedListDocUnsubs.push(unsub);
    });
}

function applyListDocs(docs) {
    const merged = new Map();
    docs.forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
    state.lists = Array.from(merged.values()).sort((a, b) => (Number(toDate(b.updatedAt)?.getTime() || 0) - Number(toDate(a.updatedAt)?.getTime() || 0)) || String(a.name).localeCompare(String(b.name), 'de'));
    const preferredListId = storedListId();
    if (preferredListId && state.lists.some((x) => x.id === preferredListId)) state.listId = preferredListId;
    else if (state.listId && state.lists.some((x) => x.id === state.listId)) state.listId = state.listId;
    if (!state.listId || !state.lists.some((x) => x.id === state.listId)) state.listId = state.lists[0]?.id || null;
    persistListId();
    listenActiveList();
    render();
}

function subscribeLists() {
    if (listUnsub) listUnsub();
    ownListDocs = [];
    sharedListDocs = [];
    sharedListDocMap = new Map();
    stopSharedListDocListeners();
    const unsubs = [];
    unsubs.push(onSnapshot(query(listsRef(), where('ownerId', '==', uid())), (snap) => {
        ownListDocs = snap.docs;
        applyListDocs([...ownListDocs, ...sharedListDocs]);
    }, (error) => {
        reportListenerError('listenLists:owner', error);
        state.lists = [];
        state.listId = null;
        persistListId();
        stopActive();
        showInlineError('Einkaufsliste konnte nicht geladen werden (listenLists). Bitte neu anmelden.');
        alertUser('Einkaufsliste konnte nicht geladen werden (listenLists). Bitte neu anmelden.', 'error');
        render();
    }));
    unsubs.push(onSnapshot(query(listsRef(), where('memberIds', 'array-contains', uid())), (snap) => {
        sharedListDocs = snap.docs.filter((d) => d.data()?.ownerId !== uid());
        applyListDocs([...ownListDocs, ...sharedListDocs]);
    }, (error) => {
        reportListenerError('listenLists:sharedLists', error);
        sharedListDocs = [];
        applyListDocs([...ownListDocs]);
    }));
    listUnsub = () => {
        unsubs.forEach((fn) => typeof fn === 'function' && fn());
        stopSharedListDocListeners();
    };
}

export function stopEinkaufslisteListeners() {
    if (listUnsub) listUnsub();
    listUnsub = null;
    ownListDocs = [];
    sharedListDocs = [];
    sharedListDocMap = new Map();
    stopSharedListDocListeners();
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
        const storedMode = getUserSetting(EL_MODE_KEY, 'shop');
        state.mode = storedMode === 'manage' ? 'manage' : 'shop';
        state.listMode = storedMode === 'add' ? 'input' : (getUserSetting(EL_LIST_MODE_KEY, 'search') === 'input' ? 'input' : 'search');
        state.section = getUserSetting(EL_SECTION_KEY, 'general');
        state.storeDisplay = getUserSetting(EL_STORE_KEY, 'split');
        state.storeNumbers = isSettingTrue(EL_STORE_NUMBERS_KEY, false);
        state.listId = storedListId();
    }
    try {
        const tokenResult = await auth?.currentUser?.getIdTokenResult?.(true);
        if (!tokenResult?.claims?.appUserId || tokenResult.claims.appUserId !== uid()) {
            root.innerHTML = '<div class="elc text-sm text-amber-700">Anmeldung noch nicht vollständig. Bitte neu anmelden und die Einkaufsliste erneut öffnen.</div>';
            alertUser('Einkaufsliste konnte nicht geladen werden: appUserId-Claim fehlt. Bitte neu anmelden.', 'error');
            return;
        }
        await runInitStep('seedDefaults', () => seedDefaults());
        await runInitStep('ensurePrivateList', () => ensurePrivateList());
        await runInitStep('listenMasters', async () => { listenMasters(); });
        await runInitStep('listenLists', async () => { listenLists(); });
        render();
    } catch (error) {
        console.error('Einkaufsliste Initialisierung fehlgeschlagen:', error);
        const step = String(error?.message || '').trim();
        const suffix = step ? ` (${step})` : '';
        root.innerHTML = `<div class="elc text-sm text-red-700">Einkaufsliste konnte wegen fehlender Berechtigung nicht geladen werden${escapeHtml(suffix)}. Bitte neu anmelden.</div>`;
        alertUser(`Einkaufsliste konnte nicht geladen werden${suffix}. Bitte neu anmelden.`, 'error');
    }
}

const EL_MODE_KEY = 'el_mode';
const EL_LIST_MODE_KEY = 'el_list_mode';
const EL_SECTION_KEY = 'el_section';
const EL_STORE_KEY = 'el_store';
const EL_STORE_NUMBERS_KEY = 'el_store_numbers';
const EL_LIST_KEY = 'el_list';

function listenMasters() {
    if (masterUnsubs.length) return;
    if (root.dataset.masters === 'true') return;
    root.dataset.masters = 'true';
    masterUnsubs.push(onSnapshot(query(master('categories'), where('createdBy', '==', uid())), (s) => { state.categories = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'de')); render(); }, (error) => reportListenerError('listenMasters:categories', error)));
    masterUnsubs.push(onSnapshot(query(master('stores'), where('createdBy', '==', uid())), (s) => { state.stores = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'de')); render(); }, (error) => reportListenerError('listenMasters:stores', error)));
    masterUnsubs.push(onSnapshot(query(master('articles'), where('createdBy', '==', uid())), (s) => { state.articles = s.docs.map((d) => ({ id: d.id, ...d.data(), eanCodes: d.data().eanCodes || [], variants: d.data().variants || [], persistentNotes: d.data().persistentNotes || [], storeIds: d.data().storeIds || [] })).sort((a, b) => String(a.title).localeCompare(String(b.title), 'de')); render(); }, (error) => reportListenerError('listenMasters:articles', error)));
    masterUnsubs.push(onSnapshot(query(master('notes'), where('createdBy', '==', uid())), (s) => { state.remarks = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, (error) => reportListenerError('listenMasters:notes', error)));
    masterUnsubs.push(onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notizen'), where('createdBy', '==', uid())), (s) => { state.notes = s.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, (error) => reportListenerError('listenMasters:notizen', error)));
}

function listenLists() {
    subscribeLists();
}

function listenActiveList() {
    stopActive();
    const list = activeList();
    if (!list) return;
    if (list.ownerId === uid()) {
        activeUnsubs.push(onSnapshot(sub(list.id, 'permissions'), (s) => {
            clearPermEntries(list.id);
            s.docs.forEach((d) => state.perms.set(`${list.id}:${d.id}`, { listId: list.id, userId: d.id, ...d.data() }));
            render();
        }, (error) => reportListenerError('listenActiveList:permissions:owner', error)));
    } else {
        activeUnsubs.push(onSnapshot(doc(sub(list.id, 'permissions'), uid()), (s) => {
            clearPermEntries(list.id);
            if (s.exists()) state.perms.set(`${list.id}:${uid()}`, { listId: list.id, userId: uid(), ...s.data() });
            render();
        }, (error) => reportListenerError('listenActiveList:permissions:self', error)));
    }
    activeUnsubs.push(onSnapshot(query(sub(list.id, 'items'), orderBy('createdAt', 'desc')), (s) => { state.items = s.docs.map((d) => ({ ...d.data(), id: d.id, storeIds: d.data().storeIds || [], eanCodes: d.data().eanCodes || [] })); render(); }, (error) => reportListenerError('listenActiveList:items', error)));
    activeUnsubs.push(onSnapshot(query(sub(list.id, 'presence'), orderBy('lastSeen', 'desc')), (s) => { state.presence = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => Date.now() - (toDate(x.lastSeen)?.getTime() || 0) <= PRESENCE_MS); render(); }, (error) => reportListenerError('listenActiveList:presence', error)));
    activeUnsubs.push(onSnapshot(query(sub(list.id, 'activity'), orderBy('createdAt', 'desc'), limit(1)), (s) => { state.activity = s.docs[0] ? { id: s.docs[0].id, ...s.docs[0].data() } : null; render(); }, (error) => reportListenerError('listenActiveList:activity', error)));
    activeUnsubs.push(onSnapshot(sub(list.id, 'locks'), (s) => { state.locks.clear(); s.docs.forEach((d) => state.locks.set(d.id, { id: d.id, ...d.data() })); render(); }, (error) => reportListenerError('listenActiveList:locks', error)));
    touchPresence();
    presenceTimer = setInterval(touchPresence, 30000);
}

async function touchPresence() {
    const list = activeList();
    if (!list) return;
    await setDoc(doc(sub(list.id, 'presence'), uid()), { userId: uid(), userName: uname(), currentArea: state.mode === 'manage' ? MANAGE.find((x) => x.id === state.section)?.label || 'Verwaltung' : (state.listMode === 'input' ? 'Listenmodus · Eingeben' : 'Listenmodus · Suchen'), lastSeen: serverTimestamp() }, { merge: true });
}

async function logActivity(text, payload = {}) {
    const list = activeList();
    if (!list) return;
    await logActivityForList(list.id, text, payload);
}

async function logActivityForList(listId, text, payload = {}) {
    if (!listId) return;
    const entry = { actorId: uid(), actorName: uname(), text, payload, createdAt: serverTimestamp() };
    await addDoc(sub(listId, 'activity'), entry);
    await addDoc(sub(listId, 'audit'), entry);
}

function groupedOpen() {
    const searchTerm = state.mode === 'shop' && state.listMode === 'search' ? String(state.search || '').trim().toLowerCase() : '';
    const items = state.items.filter((x) => x.status !== 'checked').filter((x) => !searchTerm || [x.title, x.note, x.persistentNote, ...(x.eanCodes || [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(searchTerm)));
    if (state.storeDisplay === 'combined') return [{ id: 'combined', label: 'Alle Geschäfte', note: '', items: sortItemsForShopDisplay(items) }];
    const order = activeList()?.storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id);
    const map = new Map(order.map((id, index) => {
        const store = state.stores.find((s) => s.id === id);
        const label = store ? `${state.storeNumbers ? `[${index + 1}] ` : ''}${store.name}` : id;
        return [id, { id, label, note: activeList()?.storeNotes?.[id] || '', items: [] }];
    }));
    const none = { id: 'none', label: 'Ohne Geschäft', note: '', items: [] };
    items.forEach((item) => { const sid = item.storeIds?.[0]; sid && map.has(sid) ? map.get(sid).items.push(item) : none.items.push(item); });
    const out = order.map((id) => {
        const entry = map.get(id);
        if (!entry || !entry.items.length) return null;
        return { ...entry, items: sortItemsForShopDisplay(entry.items, id) };
    }).filter((x) => x && x.items.length);
    none.items = sortItemsForShopDisplay(none.items);
    if (none.items.length) out.push(none);
    return out.length ? out : [{ id: 'empty', label: 'Keine offenen Artikel', note: '', items: [] }];
}

function currentModeDef() { return MODES.find((m) => m.id === state.mode) || MODES[0]; }

function cameraButtonClass() {
    return state.scanOpen
        ? 'bg-red-600 text-white animate-pulse shadow-lg shadow-red-200'
        : 'bg-gray-100 text-gray-700';
}

function renderModeToggle() {
    return `<div class="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1"><button class="rounded-full px-3 py-1.5 text-xs font-black ${state.listMode === 'search' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}" data-a="quick-mode" data-v="search">Suchen</button><button class="rounded-full px-3 py-1.5 text-xs font-black ${state.listMode === 'input' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'}" data-a="quick-mode" data-v="input">Eingeben</button></div>`;
}

function renderScannerPanelActive(embedded = false) {
    const article = state.articles.find((a) => a.id === state.scanArticleId);
    const isArticleMode = state.scanMode === 'article-ean';
    const scannerTitle = isArticleMode ? `EAN zuordnen: ${escapeHtml(article?.title || 'Artikel')}` : state.scanMode === 'list-add' ? 'Scanner · Eingeben' : 'Scanner · Listenmodus';
    const scannerText = isArticleMode ? 'Mehrere Codes können gesammelt und gemeinsam gespeichert werden.' : state.scanMode === 'list-add' ? 'Gefundene EANs werden direkt mit Menge, Einheit, Geschäft und Anmerkung hinzugefügt.' : 'Gefundene EANs öffnen die Mengenübernahme. Der Scan bleibt aktiv.';
    const manualLabel = isArticleMode ? 'Code hinzufügen' : state.scanMode === 'list-add' ? 'Artikel hinzufügen' : 'Code übernehmen';
    const shellClass = embedded ? 'mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3' : 'elpanel p-4 sm:p-5 space-y-4';
    const titleClass = embedded ? 'text-base font-black text-gray-900' : 'text-xl font-black text-gray-900';
    const videoWrapClass = embedded ? 'elcam mx-auto w-full max-w-[92vw] sm:max-w-[70%]' : 'elcam';
    return `<div class="${shellClass}"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="${titleClass}">${scannerTitle}</div><div class="text-sm text-gray-500">${scannerText}</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-scan">Schließen</button></div><div class="${videoWrapClass}"><video id="el-video" autoplay playsinline muted></video></div><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input id="el-scan-manual" class="eli" placeholder="${isArticleMode ? 'EAN/QR eingeben oder per Scanner senden' : 'EAN/QR manuell eingeben'}"><button class="elb a w-full sm:w-auto" data-a="manual-scan">${manualLabel}</button></div><div id="el-scan-status" class="text-sm text-gray-500">${escapeHtml(state.scanStatus || 'Kamera wird gestartet...')}</div>${isArticleMode ? `<div class="elc space-y-2"><div class="text-xs font-bold uppercase text-gray-500">Erfasste Codes</div><div id="el-scan-collected" class="elm">${state.scanCodes.length ? state.scanCodes.map((code) => chip(`${escapeHtml(code)} <button type="button" class="elchipbtn" data-a="remove-scanned-code" data-id="${escapeHtml(code)}">×</button>`, 'bg-indigo-100 text-indigo-700')).join(' ') : '<span class="text-sm text-gray-400">Noch keine Codes erfasst.</span>'}</div></div><div class="flex flex-col sm:flex-row justify-end gap-2"><button class="elb bg-emerald-600 text-white w-full sm:w-auto" data-a="save-scanned-codes" ${state.scanCodes.length ? '' : 'disabled'}>OK</button><button class="elb bg-indigo-600 text-white w-full sm:w-auto" data-a="save-scanned-codes-next" ${state.scanCodes.length && nextMissingEanArticle(state.scanArticleId) ? '' : 'disabled'}>Nächsten Artikel ohne EAN</button></div>` : ''}</div>`;
}

function renderActionBar() {
    if (state.mode === 'manage') return '';
    if (state.listMode === 'search') {
        return `<div class="elc !p-3"><div class="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)] items-center"><div class="flex justify-center lg:justify-start">${renderModeToggle()}</div><div class="flex w-full items-center gap-2"><input id="el-search" class="eli text-center" placeholder="Suchen oder scannen..." value="${escapeHtml(state.search)}"><button class="elb ${cameraButtonClass()}" data-a="open-scan" title="Scanner ${state.scanOpen ? 'deaktivieren' : 'aktivieren'}">📷</button></div></div>${state.scanOpen && state.scanMode !== 'article-ean' ? renderScannerPanelActive(true) : ''}</div>`;
    }
    return `<div class="elc !p-3"><div class="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)] items-start"><div class="space-y-2"><div class="flex justify-center lg:justify-start">${renderModeToggle()}</div><div class="grid w-full grid-cols-[minmax(0,1fr)_110px] gap-2 lg:max-w-[210px]"><input id="el-q" class="eli text-center" value="${escapeHtml(state.q)}" placeholder="Menge"><select id="el-unit" class="els">${UNITS.map((u) => `<option value="${u}" ${state.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div><div class="w-full space-y-2"><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center"><select id="el-store-add" class="els"><option value="">Geschäft zuordnen...</option>${state.stores.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select><input id="el-note" class="eli" placeholder="Anmerkung optional" value="${escapeHtml(state.note)}"><button class="elb ${cameraButtonClass()}" data-a="open-scan" title="Scanner ${state.scanOpen ? 'deaktivieren' : 'aktivieren'}">📷</button></div><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_56px] items-center"><input id="el-title" class="eli" placeholder="Artikel eingeben..." value="${escapeHtml(state.title)}"><button class="elb a !px-0" data-a="add-item" ${!canAdd() ? 'disabled' : ''}>+</button></div>${state.storeIds.length ? `<div class="elm">${state.storeIds.map((id) => chip(`${escapeHtml(state.stores.find((s) => s.id === id)?.name || id)} <button data-a="del-store" data-id="${id}">×</button>`, 'bg-orange-100 text-orange-700')).join(' ')}</div>` : '<div class="text-xs text-gray-400">Optional einem oder mehreren Geschäften zuordnen.</div>'}${state.scanOpen && state.scanMode !== 'article-ean' ? renderScannerPanelActive(true) : ''}</div></div>`;
}

function storeNumberMap(list = activeList()) {
    const order = list?.storeOrder?.length ? list.storeOrder : state.stores.map((s) => s.id);
    return new Map(order.map((id, index) => [id, index + 1]));
}

function numberedStoreLabel(storeId) {
    const name = state.stores.find((s) => s.id === storeId)?.name || storeId;
    if (!state.storeNumbers) return name;
    const number = storeNumberMap().get(storeId);
    return number ? `[${number}] ${name}` : name;
}

function storeCategoryOrder(storeId) {
    return state.stores.find((s) => s.id === storeId)?.categoryOrder || [];
}

function sortItemsForShopDisplay(items, forcedStoreId = '') {
    const storeOrder = activeList()?.storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id);
    const storeRanks = new Map(storeOrder.map((id, index) => [id, index]));
    return [...(items || [])].sort((a, b) => {
        const storeA = forcedStoreId || a.storeIds?.[0] || '';
        const storeB = forcedStoreId || b.storeIds?.[0] || '';
        const storeRankA = storeRanks.has(storeA) ? storeRanks.get(storeA) : Number.MAX_SAFE_INTEGER;
        const storeRankB = storeRanks.has(storeB) ? storeRanks.get(storeB) : Number.MAX_SAFE_INTEGER;
        if (storeRankA !== storeRankB) return storeRankA - storeRankB;
        const catOrderA = storeCategoryOrder(storeA);
        const catOrderB = storeCategoryOrder(storeB);
        const catIndexA = catOrderA.indexOf(a.categoryId);
        const catIndexB = catOrderB.indexOf(b.categoryId);
        const catRankA = catIndexA >= 0 ? catIndexA : catOrderA.length + 100;
        const catRankB = catIndexB >= 0 ? catIndexB : catOrderB.length + 100;
        if (catRankA !== catRankB) return catRankA - catRankB;
        return String(a.title || '').localeCompare(String(b.title || ''), 'de');
    });
}

function filteredManageArticles() {
    return state.articles.filter((a) => {
        const hasAnyEan = !!(a.eanCodes?.length || a.variants?.some((v) => v?.eanCodes?.length));
        const matchesSearch = !state.articleSearch.trim() || [a.title, ...(a.eanCodes || [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(state.articleSearch.toLowerCase()));
        return (!state.missingEanOnly || !hasAnyEan) && matchesSearch;
    });
}

function nextMissingEanArticle(currentId = '') {
    const missing = filteredManageArticles().filter((a) => !(a.eanCodes?.length || a.variants?.some((v) => v?.eanCodes?.length)));
    if (!missing.length) return null;
    if (!currentId) return missing[0];
    const index = missing.findIndex((a) => a.id === currentId);
    return missing[index + 1] || null;
}

function canConfirmPurchase(p = state.purchase) {
    return !!p && Number(p.quantity || 0) > 0;
}

function openScanner(mode = 'shopping', articleId = '') {
    document.activeElement?.blur?.();
    state.scanOpen = true;
    state.scanMode = mode;
    state.scanArticleId = articleId;
    state.scanCodes = [];
    state.scanStatus = mode === 'article-ean' ? 'Kamera wird für die EAN-Erfassung gestartet...' : mode === 'list-add' ? 'Kamera wird gestartet. Gefundene EANs werden direkt hinzugefügt...' : 'Kamera wird gestartet. Gefundene EANs öffnen die Mengenübernahme...';
    state.scanLastCode = '';
    state.scanLastAt = 0;
    render();
}

function closeScannerModal() {
    state.scanOpen = false;
    state.scanMode = 'shopping';
    state.scanArticleId = '';
    state.scanCodes = [];
    state.scanStatus = '';
    state.scanLastCode = '';
    state.scanLastAt = 0;
    stopScanner();
    render();
}

function closeUnknownModal() {
    state.unknownCode = '';
    state.unknownArticleId = '';
    render();
}

function flashScanSuccess() {
    if (navigator.vibrate) navigator.vibrate(1000);
    const cams = Array.from(document.querySelectorAll('.elcam'));
    if (!cams.length) return;
    if (scanFlashTimer) clearTimeout(scanFlashTimer);
    cams.forEach((cam) => {
        cam.classList.remove('el-scan-success');
        void cam.offsetWidth;
        cam.classList.add('el-scan-success');
    });
    scanFlashTimer = setTimeout(() => {
        cams.forEach((cam) => cam.classList.remove('el-scan-success'));
        scanFlashTimer = null;
    }, 750);
}

function updateScannerDynamicUi() {
    const status = document.getElementById('el-scan-status');
    if (status) status.textContent = state.scanStatus || '';
    const collected = document.getElementById('el-scan-collected');
    if (collected) {
        collected.innerHTML = state.scanCodes.length ? state.scanCodes.map((code) => chip(`${escapeHtml(code)} <button type="button" class="elchipbtn" data-a="remove-scanned-code" data-id="${escapeHtml(code)}">×</button>`, 'bg-indigo-100 text-indigo-700')).join(' ') : '<span class="text-sm text-gray-400">Noch keine Codes erfasst.</span>';
    }
    const okButton = root?.querySelector('[data-a="save-scanned-codes"]');
    if (okButton) okButton.disabled = !state.scanCodes.length;
    const nextButton = root?.querySelector('[data-a="save-scanned-codes-next"]');
    if (nextButton) nextButton.disabled = !state.scanCodes.length || !nextMissingEanArticle(state.scanArticleId);
}

function removeScannedCodeActive(code) {
    state.scanCodes = state.scanCodes.filter((entry) => entry !== code);
    state.scanStatus = state.scanCodes.length ? `${state.scanCodes.length} Code(s) erfasst.` : 'Noch keine Codes erfasst.';
    updateScannerDynamicUi();
    focusInputById('el-scan-manual');
}

function renderListSelect() {
    return `<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"><div class="text-xs font-bold tracking-wide text-slate-500 whitespace-nowrap">Liste wechseln:</div><div class="w-full sm:w-1/2"><select id="el-list-select" class="els text-center" ${state.lists.length ? '' : 'disabled'}>${state.lists.length ? state.lists.map((l) => `<option value="${l.id}" ${state.listId === l.id ? 'selected' : ''}>${escapeHtml(l.name || 'Liste')}</option>`).join('') : '<option value="">Keine Liste verfügbar</option>'}</select></div></div>`;
}

function renderDetailRows(list) {
    if (!state.detailsOpen) return '';
    const activityText = state.activity && Date.now() - (toDate(state.activity.createdAt)?.getTime() || 0) <= ACTIVITY_MS ? `${escapeHtml(state.activity.actorName || 'User')} · ${dt(state.activity.createdAt)} · ${escapeHtml(state.activity.text || '')}` : 'Keine aktuelle Aktivität.';
    return `<div class="space-y-3"><div>${renderListSelect()}</div><div class="flex flex-wrap justify-between gap-2 items-start"><div class="flex flex-wrap gap-2 text-xs">${list ? `${list.ownerId === uid() ? chip('Owner', 'bg-indigo-100 text-indigo-700') : chip(permActive(perm()) ? 'freigegeben' : 'abgelaufen', permActive(perm()) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')} ${chip(`Letztes Update ${dt(list.updatedAt)}`)} ${chip(`Von ${escapeHtml(list.updatedByName || list.ownerName || '—')}`)}` : '<span class="text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</span>'}</div><div class="flex flex-wrap gap-2">${list ? `<button class="elb bg-gray-100 text-gray-700" data-a="store-display">${state.storeDisplay === 'split' ? 'Nach Geschäft' : 'Kombiniert'}</button>` : ''}</div></div><div class="flex flex-wrap justify-between gap-2 items-center"><label class="inline-flex items-center gap-2 text-xs font-bold text-gray-600"><input id="el-store-numbers" type="checkbox" ${state.storeNumbers ? 'checked' : ''}> Geschäfte nummerieren</label><div class="text-xs text-gray-400">${list ? `${state.stores.length} Geschäfte verfügbar` : 'Keine Liste ausgewählt.'}</div></div><div class="space-y-2 text-xs text-gray-600"><div>${list ? (state.presence.length ? state.presence.map((p) => chip(`${escapeHtml(p.userName || p.userId)} (${escapeHtml(p.currentArea || 'Liste')})`, 'bg-emerald-100 text-emerald-700')).join(' ') : '<span class="text-gray-400">Niemand sonst gerade aktiv.</span>') : '<span class="text-gray-400">Keine Liste ausgewählt.</span>'}</div><div class="font-semibold text-gray-600">${activityText}</div></div></div>`;
}

function renderHeader(list) {
    return renderHeaderActive(list);
}

function renderHeaderActive(list) {
    const listBoxClass = list ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-slate-300 text-slate-500 bg-slate-50';
    const listBoxText = list?.name || 'Keine Liste';
    return `<div class="space-y-2"><div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"><div class="back-link-container flex flex-col items-start min-w-0"><button class="back-link flex items-center text-gray-600 hover:text-indigo-600 transition" data-a="back-home"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 mr-1"><path d="m15 18-6-6 6-6" /></svg><span class="text-sm font-semibold">zurück</span></button><div class="border-t border-gray-300 mt-2 w-full"></div></div><div class="min-w-0 flex justify-center"><div class="inline-flex max-w-full items-center rounded-full border-2 px-2.5 py-1 text-[11px] sm:text-sm font-black shadow-sm whitespace-nowrap overflow-hidden text-ellipsis ${listBoxClass}">${escapeHtml(listBoxText)}</div></div><div class="flex items-center justify-end gap-1 sm:gap-2 min-w-0"><button class="elb bg-gray-100 text-gray-700 !px-2 sm:!px-3 text-[11px] sm:text-xs whitespace-nowrap" data-a="open-mode-picker">${escapeHtml(currentModeDef().label)}</button><button class="elb bg-gray-100 text-gray-700 !px-2 text-base sm:text-lg leading-none" data-a="toggle-details" title="Menü">⋮</button></div></div>${state.detailsOpen ? `<div class="elc">${renderDetailRows(list)}</div>` : ''}${renderActionBar()}</div>`;
}

function renderManageSections() {
    return `<div class="elc"><div class="elm justify-center">${MANAGE.map((s) => `<button class="elb ${state.section === s.id ? 'a' : 'bg-gray-100 text-gray-700'}" data-a="section" data-v="${s.id}">${s.label}</button>`).join('')}<button class="elb bg-gray-100 text-gray-700" data-a="open-settings">Einstellungen</button></div></div>`;
}

function selectList(nextId) {
    const list = state.lists.find((x) => x.id === nextId);
    if (!list) return;
    if (list.ownerId !== uid() && !permActive(perm(list.id))) {
        alertUser('Diese Liste ist außerhalb deiner Zugriffszeit gesperrt.', 'error');
        return;
    }
    state.listId = nextId;
    persistListId();
    listenActiveList();
    render();
}

function render() {
    ensureRoot();
    if (!root) return;
    const main = root.querySelector('#el-main');
    if (!main) return;
    const list = activeList();
    const blocked = list && !canNow(list);
    main.innerHTML = `
        ${renderHeaderActive(list)}
        ${state.mode === 'manage' ? renderManageSections() : ''}
        ${blocked ? '<div class="elc text-sm text-red-700">Diese Liste ist sichtbar, aber außerhalb deiner Zugriffszeit aktuell gesperrt.</div>' : renderBodyActive()}
        ${state.mode === 'manage' ? '' : renderChecked()}
    `;
    renderModePicker();
    renderSettings();
    renderPurchase();
    renderDetail();
    renderStoreCategoryEditorActive();
    renderArticle();
    renderScannerActive();
    renderUnknown();
}

function renderBody() {
    const list = activeList();
    if (!list) return '<div class="elc text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</div>';
    if (state.mode === 'shop') {
        return `<div class="space-y-3"><div class="elc"><div class="grid grid-cols-[90px_110px_minmax(0,1fr)] gap-2"><input id="el-q" class="eli" value="${escapeHtml(state.q)}"><select id="el-unit" class="els">${UNITS.map((u) => `<option value="${u}" ${state.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select><input id="el-title" class="eli" placeholder="Artikel eingeben..." value="${escapeHtml(state.title)}"></div><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><select id="el-store-add" class="els"><option value="">Geschäft zuordnen...</option>${state.stores.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select><input id="el-note" class="eli" placeholder="Anmerkung optional" value="${escapeHtml(state.note)}"><button class="elb a" data-a="add-item" ${!canAdd() ? 'disabled' : ''}>+ Hinzufügen</button></div>${state.storeIds.length ? `<div class="elm">${state.storeIds.map((id) => chip(`${escapeHtml(state.stores.find((s) => s.id === id)?.name || id)} <button data-a="del-store" data-id="${id}">×</button>`, 'bg-orange-100 text-orange-700')).join(' ')}</div>` : '<div class="text-xs text-gray-400">Optional einem oder mehreren Geschäften zuordnen.</div>'}</div>`;
    }
    if (state.mode === 'shop') return `<div class="space-y-3">${groupedOpen().map((g) => `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">${escapeHtml(g.label)}</div><div class="text-xs font-bold text-gray-600">${g.items.length} offen</div></div>${g.note ? `<div class="text-xs rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-orange-800">${escapeHtml(g.note)}</div>` : ''}${g.items.length ? g.items.map(renderItem).join('') : '<div class="py-3 text-sm text-gray-400">Keine offenen Artikel.</div>'}</div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Artikel gefunden.</div>'}</div>`;
    if (!canManage()) return '<div class="elc text-sm text-red-700">Keine Verwaltungsberechtigung für diese Liste.</div>';
    if (state.section === 'general') return `<div class="space-y-3"><div class="elc"><div class="elstat"><div><div class="text-[11px] font-bold uppercase text-gray-500">Aktive Listen</div><div class="text-xl font-black text-indigo-700">${state.lists.filter((l) => l.active !== false).length}</div></div><div><div class="text-[11px] font-bold uppercase text-gray-500">Offene Artikel</div><div class="text-xl font-black text-orange-700">${state.items.filter((x) => x.status !== 'checked').length}</div></div><div><div class="text-[11px] font-bold uppercase text-gray-500">Letztes Update</div><div class="text-sm font-black text-slate-700">${dt(activeList()?.updatedAt)}</div></div></div></div>${state.lists.map((l) => `<div class="elc"><div class="flex justify-between gap-2"><div><div class="font-bold text-sm">${escapeHtml(l.name)}</div><div class="text-xs text-gray-500">${dt(l.updatedAt)} · ${escapeHtml(l.updatedByName || l.ownerName || '—')}</div></div><div class="text-xs font-bold text-gray-600">${l.id === state.listId ? state.items.filter((x) => x.status !== 'checked').length : '…'} offen</div></div></div>`).join('')}</div>`;
    if (state.section === 'stores') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-store" class="eli" placeholder="Neues Geschäft" value="${escapeHtml(state.drafts.store)}"><button class="elb a" data-a="add-store" ${!canManageWrite() ? 'disabled' : ''}>+ Geschäft</button></div>${(activeList()?.storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id)).map((id, i, arr) => { const s = state.stores.find((x) => x.id === id); if (!s) return ''; const categoryNames = (s.categoryOrder || []).map((catId) => state.categories.find((c) => c.id === catId)?.name).filter(Boolean); return `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-start"><div><div class="font-bold text-sm">${escapeHtml(s.name)}</div><div class="text-xs text-gray-500">${categoryNames.length ? `${categoryNames.length} Kategorie(n) für Sortierung gewählt` : 'Noch keine Kategorien ausgewählt'}</div></div><div class="flex flex-wrap gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="store-up" data-id="${s.id}" ${i === 0 || !canManageWrite() ? 'disabled' : ''}>↑</button><button class="elb bg-gray-100 text-gray-700" data-a="store-down" data-id="${s.id}" ${i === arr.length - 1 || !canManageWrite() ? 'disabled' : ''}>↓</button><button class="elb bg-indigo-100 text-indigo-700" data-a="open-store-categories" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Kategorienwartung</button><button class="elb bg-red-600 text-white" data-a="del-store-master" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div></div><div class="elm">${categoryNames.length ? categoryNames.map((name) => chip(escapeHtml(name), 'bg-indigo-100 text-indigo-700')).join(' ') : '<span class="text-xs text-gray-400">Keine Kategorien sortiert.</span>'}</div></div>`; }).join('')}</div>`;
    if (state.section === 'articles') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-article-search" class="eli" placeholder="Artikel suchen..." value="${escapeHtml(state.articleSearch)}"><label class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold bg-slate-100 text-slate-700"><input type="checkbox" id="el-missing-ean" ${state.missingEanOnly ? 'checked' : ''}> Ohne EAN</label><button class="elb a" data-a="open-article" ${!canManageWrite() ? 'disabled' : ''}>+ Artikel</button></div>${filteredManageArticles().map((a) => { const hasAnyEan = !!(a.eanCodes?.length || a.variants?.some((v) => v?.eanCodes?.length)); return `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="font-bold text-sm">${escapeHtml(a.title)}</div><div class="text-xs text-gray-500">${fmtQty(a.defaultQuantity || 1)} ${escapeHtml(a.defaultUnit || 'Stück')} · ${escapeHtml(state.categories.find((c) => c.id === a.categoryId)?.name || 'Ohne Kategorie')}</div></div><div class="flex flex-wrap gap-2">${hasAnyEan ? chip('EAN OK', 'bg-emerald-100 text-emerald-700') : `<button class="elb bg-red-100 text-red-700" data-a="capture-ean" data-id="${a.id}" ${!canManageWrite() ? 'disabled' : ''}>ohne EAN</button>`}<button class="elb bg-gray-100 text-gray-700" data-a="edit-article" data-id="${a.id}" ${!canManageWrite() ? 'disabled' : ''}>Bearbeiten</button></div></div><div class="text-xs text-gray-600">${escapeHtml((a.persistentNotes || []).join(' · ')) || '<span class="text-gray-400">Keine permanente Anmerkung.</span>'}</div><div class="elm">${(a.eanCodes || []).length ? (a.eanCodes || []).map((code) => chip(escapeHtml(code))).join(' ') : '<span class="text-xs text-gray-400">Keine Haupt-EAN</span>'}</div></div>`; }).join('') || '<div class="elc text-sm text-gray-400">Keine Artikel gefunden.</div>'}</div>`;
    if (state.section === 'categories') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-category" class="eli" placeholder="Neue Kategorie" value="${escapeHtml(state.drafts.category)}"><button class="elb a" data-a="add-category" ${!canManageWrite() ? 'disabled' : ''}>+ Kategorie</button></div>${state.categories.map((c) => `<div class="elc flex flex-wrap justify-between gap-2"><div class="font-bold text-sm">${escapeHtml(c.name)}</div><button class="elb bg-red-600 text-white" data-a="del-category" data-id="${c.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div>`).join('')}</div>`;
    if (state.section === 'remarks') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-remark" class="eli" placeholder="Häufige Anmerkung" value="${escapeHtml(state.drafts.remark)}"><button class="elb a" data-a="add-remark" ${!canManageWrite() ? 'disabled' : ''}>+ Anmerkung</button></div>${state.remarks.map((n) => `<div class="elc flex flex-wrap justify-between gap-2"><div class="font-bold text-sm">${escapeHtml(n.text || n.name || '')}</div><button class="elb bg-red-600 text-white" data-a="del-remark" data-id="${n.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Anmerkungen.</div>'}</div>`;
    return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-note" class="eli" placeholder="Meta-Notiz" value="${escapeHtml(state.drafts.note)}"><button class="elb a" data-a="add-note" ${!canManageWrite() ? 'disabled' : ''}>+ Notiz</button></div>${state.notes.map((n) => `<div class="elc flex flex-wrap justify-between gap-2"><div class="font-bold text-sm">${escapeHtml(n.text || n.name || '')}</div><button class="elb bg-red-600 text-white" data-a="del-note" data-id="${n.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Notizen.</div>'}</div>`;
}

function renderBodyActive() {
    const list = activeList();
    if (!list) return '<div class="elc text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</div>';
    if (state.mode === 'shop') {
        return `<div class="space-y-2">${groupedOpen().map((g) => `<div class="elc !p-3 space-y-1.5"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">${escapeHtml(g.label)}</div><div class="text-[11px] font-bold text-gray-600">${g.items.length} offen</div></div>${g.note ? `<div class="text-xs rounded-xl border border-orange-300 bg-orange-50 px-3 py-1.5 text-orange-800">${escapeHtml(g.note)}</div>` : ''}${g.items.length ? g.items.map(renderItem).join('') : '<div class="py-2 text-sm text-gray-400">Keine offenen Artikel.</div>'}</div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Artikel gefunden.</div>'}</div>`;
    }
    if (!canManage()) return '<div class="elc text-sm text-red-700">Keine Verwaltungsberechtigung für diese Liste.</div>';
    if (state.section === 'stores') {
        return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-store" class="eli" placeholder="Neues Geschäft" value="${escapeHtml(state.drafts.store)}"><button class="elb a" data-a="add-store" ${!canManageWrite() ? 'disabled' : ''}>+ Geschäft</button></div>${(activeList()?.storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id)).map((id, i, arr) => { const s = state.stores.find((x) => x.id === id); if (!s) return ''; const categoryNames = (s.categoryOrder || []).map((catId) => state.categories.find((c) => c.id === catId)?.name).filter(Boolean); return `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-start"><div><div class="font-bold text-sm">${escapeHtml(s.name)}</div><div class="text-xs text-gray-500">${categoryNames.length ? `${categoryNames.length} Kategorie(n) für Sortierung gewählt` : 'Noch keine Kategorien ausgewählt'}</div></div><div class="flex flex-wrap gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="store-up" data-id="${s.id}" ${i === 0 || !canManageWrite() ? 'disabled' : ''}>↑</button><button class="elb bg-gray-100 text-gray-700" data-a="store-down" data-id="${s.id}" ${i === arr.length - 1 || !canManageWrite() ? 'disabled' : ''}>↓</button><button class="elb bg-indigo-100 text-indigo-700" data-a="open-store-categories" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Kategorienwartung</button><button class="elb bg-red-600 text-white" data-a="del-store-master" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div></div><div class="flex flex-wrap items-center gap-1.5 text-xs">${categoryNames.length ? categoryNames.map((name, index) => `${index ? '<span class="font-black text-slate-400">→</span>' : ''}${chip(escapeHtml(name), 'bg-indigo-100 text-indigo-700')}`).join(' ') : '<span class="text-xs text-gray-400">Keine Kategorien sortiert.</span>'}</div></div>`; }).join('')}</div>`;
    }
    return renderBody();
}

function renderItem(item) {
    const lock = state.locks.get(item.id);
    const locked = lock && lock.userId !== uid() && Date.now() < ((toDate(lock.expiresAt)?.getTime() || 0));
    const stores = (item.storeIds || []).map((id) => numberedStoreLabel(id)).join(', ');
    const restItem = isRestItem(item);
    const itemActionsVisible = isItemActionVisible(item.id);
    const qtyActionVisible = isQuantityActionVisible(item.id);
    const controls = itemActionsVisible
        ? `<button class="elaction elaction-trash" data-a="delete-item-direct" data-id="${item.id}" title="Eintrag ohne Rückfrage löschen">🗑</button><button class="elaction elaction-gear" data-a="open-detail-item" data-id="${item.id}" title="Produkt bearbeiten">⚙</button>`
        : `<button class="elcheck" data-a="check" data-id="${item.id}" title="Abhaken">✓</button>`;
    return `<div class="elitem border-t border-gray-100"><button type="button" class="text-left min-w-0 flex-1" data-a="edit-item" data-id="${item.id}" title="Doppelklick für Bearbeitungsaktionen"><div class="flex flex-wrap gap-2 items-center"><div class="font-bold text-sm text-gray-900 truncate flex-1">${escapeHtml(ell(item.title, 40))}</div>${chip(`${fmtQty(item.quantity)} ${escapeHtml(item.unit || '')}`, 'bg-indigo-50 text-indigo-700')}${state.categories.find((c) => c.id === item.categoryId) ? chip(escapeHtml(state.categories.find((c) => c.id === item.categoryId).name), 'bg-amber-50 text-amber-700') : ''}${locked ? chip(`gesperrt von ${escapeHtml(lock.userName || lock.userId)}`, 'bg-red-100 text-red-700') : ''}${restItem ? chip('Rest', 'bg-orange-100 text-orange-800 ring-1 ring-orange-300') : ''}</div><div class="text-xs text-gray-500 mt-1">${escapeHtml(stores)}${item.restoredAt ? ` · Wiederhergestellt von ${escapeHtml(item.restoredByName || '—')} · ${dt(item.restoredAt)}` : ''}</div>${item.persistentNote ? `<div class="text-xs text-gray-600 mt-2">${escapeHtml(item.persistentNote)}</div>` : ''}${item.note ? `<div class="text-xs text-gray-600 mt-1">${escapeHtml(item.note)}</div>` : ''}</button><div class="flex items-center justify-end gap-1 sm:gap-2 flex-wrap sm:flex-nowrap">${qtyActionVisible ? `<button class="elaction elaction-qty text-[11px] sm:text-xs px-2 sm:px-3 whitespace-nowrap" data-a="quantity" data-id="${item.id}" title="Menge übernehmen"><span class="sm:hidden">Menge</span><span class="hidden sm:inline">Menge übernehmen</span></button>` : ''}${controls}</div></div>`;
}

function renderChecked() {
    const done = state.items.filter((x) => x.status === 'checked').sort((a, b) => (toDate(b.checkedAt)?.getTime() || 0) - (toDate(a.checkedAt)?.getTime() || 0));
    return `<div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">Abgehackt-Liste</div><div class="flex items-center gap-2"><div class="text-xs font-bold text-gray-600">${done.length} erledigt</div><div class="relative"><button class="elb bg-gray-100 text-gray-700 !px-2 text-base leading-none" data-a="toggle-checked-menu" title="Mehr Optionen">⋮</button>${state.checkedMenuOpen ? `<div class="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"><button class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50" data-a="delete-all-checked">Alle Einträge löschen</button></div>` : ''}</div></div></div>${done.length ? done.map((item) => { const restItem = isRestItem(item); return `<div class="elitem border-t border-gray-100"><button class="text-left min-w-0" data-a="detail" data-id="${item.id}"><div class="flex flex-wrap gap-2 items-center"><div class="font-bold text-sm text-gray-800 truncate">${escapeHtml(ell(item.title, 40))}</div>${restItem ? chip('Rest', 'bg-orange-100 text-orange-800 ring-1 ring-orange-300') : ''}</div><div class="text-xs text-gray-500 mt-1">Von ${escapeHtml(item.checkedByName || '—')} · ${dt(item.checkedAt)}</div></button><div class="flex items-center gap-2"><button class="elcheck" data-a="restore" data-id="${item.id}" title="2x schnell = wiederherstellen">↺</button><button class="elcheck bg-red-50 text-red-700" data-a="delete-checked-item" data-id="${item.id}" title="Dauerhaft löschen">×</button></div></div>`; }).join('') : '<div class="py-2 text-sm text-gray-400">Noch nichts abgehakt.</div>'}</div>`;
}

function renderStoreCategoryEditor() {
    const el = document.getElementById('el-storecat');
    if (!el) return;
    const editor = state.storeCategoryEditor;
    el.className = `elmodal ${editor ? 'o' : ''}`;
    if (!editor) { el.innerHTML = ''; return; }
    const store = state.stores.find((s) => s.id === editor.storeId);
    const selected = editor.categoryOrder.map((catId) => state.categories.find((c) => c.id === catId)).filter(Boolean);
    const available = state.categories.filter((c) => !editor.categoryOrder.includes(c.id));
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Kategorienwartung</div><div class="text-sm text-gray-500">${escapeHtml(store?.name || 'Geschäft')} sortiert die Anzeige im Einkaufsmodus.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-store-categories">Schließen</button></div><div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div class="elc space-y-2"><div class="text-sm font-black text-gray-900">Verfügbare Kategorien</div>${available.length ? available.map((c) => `<label class="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" data-a="toggle-store-category" data-id="${c.id}"> ${escapeHtml(c.name)}</label>`).join('') : '<div class="text-sm text-gray-400">Alle Kategorien sind bereits ausgewählt.</div>'}</div><div class="elc space-y-2"><div class="flex items-center justify-between gap-2"><div class="text-sm font-black text-gray-900">Ausgewählte Reihenfolge</div><div class="text-xs font-semibold text-slate-400">Ziehen zum Sortieren</div></div>${selected.length ? selected.map((c, index) => `<div class="elstorecat-row flex items-center justify-between gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2"><div class="flex items-center gap-3 min-w-0"><button type="button" class="cursor-grab rounded-xl border border-indigo-200 bg-white px-2 py-1 text-base font-black text-indigo-700" data-drag-store-category data-id="${c.id}" aria-label="Kategorie ziehen">↕</button><div class="text-sm font-bold text-indigo-900">${index + 1}. ${escapeHtml(c.name)}</div></div><div class="flex gap-2"><button class="elb bg-white text-gray-700" data-a="store-category-up" data-id="${c.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button class="elb bg-white text-gray-700" data-a="store-category-down" data-id="${c.id}" ${index === selected.length - 1 ? 'disabled' : ''}>↓</button><button class="elb bg-red-100 text-red-700" data-a="toggle-store-category" data-id="${c.id}">Entfernen</button></div></div>`).join('') : '<div class="text-sm text-gray-400">Noch keine Kategorie gewählt.</div>'}</div></div><div class="flex flex-wrap justify-end gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="close-store-categories">Abbruch</button><button class="elb bg-emerald-600 text-white" data-a="save-store-categories">Speichern</button></div></div>`;
}

function renderStoreCategoryEditorActive() {
    const el = document.getElementById('el-storecat');
    if (!el) return;
    const editor = state.storeCategoryEditor;
    el.className = `elmodal ${editor ? 'o' : ''}`;
    if (!editor) { el.innerHTML = ''; return; }
    const store = state.stores.find((s) => s.id === editor.storeId);
    const selected = editor.categoryOrder.map((catId) => state.categories.find((c) => c.id === catId)).filter(Boolean);
    const available = state.categories.filter((c) => !editor.categoryOrder.includes(c.id));
    const drag = state.dragStoreCategory;
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Kategorienwartung</div><div class="text-sm text-gray-500">${escapeHtml(store?.name || 'Geschäft')} sortiert die Anzeige im Einkaufsmodus.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-store-categories">Schließen</button></div><div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div class="elc space-y-2"><div class="text-sm font-black text-gray-900">Verfügbare Kategorien</div>${available.length ? available.map((c) => `<label class="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" data-a="toggle-store-category" data-id="${c.id}"> ${escapeHtml(c.name)}</label>`).join('') : '<div class="text-sm text-gray-400">Alle Kategorien sind bereits ausgewählt.</div>'}</div><div class="elc space-y-2"><div class="flex items-center justify-between gap-2"><div class="text-sm font-black text-gray-900">Ausgewählte Reihenfolge</div><div class="text-xs font-semibold text-slate-400">Ziehen zum Sortieren</div></div>${selected.length ? selected.map((c, index) => { const dropClass = drag?.overId === c.id ? (drag.after ? ' drop-after' : ' drop-before') : ''; const draggingClass = drag?.id === c.id ? ' dragging' : ''; return `<div class="elstorecat-row flex items-center justify-between gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2${dropClass}${draggingClass}" data-store-category-row data-id="${c.id}"><div class="flex items-center gap-3 min-w-0"><button type="button" class="cursor-grab rounded-xl border border-indigo-200 bg-white px-2 py-1 text-base font-black text-indigo-700" data-drag-store-category data-id="${c.id}" aria-label="Kategorie ziehen">↕</button><div class="text-sm font-bold text-indigo-900">${index + 1}. ${escapeHtml(c.name)}</div></div><div class="flex gap-2"><button class="elb bg-white text-gray-700" data-a="store-category-up" data-id="${c.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button class="elb bg-white text-gray-700" data-a="store-category-down" data-id="${c.id}" ${index === selected.length - 1 ? 'disabled' : ''}>↓</button><button class="elb bg-red-100 text-red-700" data-a="toggle-store-category" data-id="${c.id}">Entfernen</button></div></div>`; }).join('') : '<div class="text-sm text-gray-400">Noch keine Kategorie gewählt.</div>'}</div></div><div class="flex flex-wrap justify-end gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="close-store-categories">Abbruch</button><button class="elb bg-emerald-600 text-white" data-a="save-store-categories">Speichern</button></div></div>`;
}

function renderScannerActive() {
    const el = document.getElementById('el-scanner');
    if (!el) return;
    const isArticleMode = state.scanOpen && state.scanMode === 'article-ean';
    el.className = `elmodal ${isArticleMode ? 'o' : ''}`;
    if (!state.scanOpen) { el.innerHTML = ''; stopScanner(); return; }
    if (isArticleMode) {
        el.innerHTML = renderScannerPanelActive(false);
    } else {
        el.innerHTML = '';
        el.className = '';
    }
    startScannerActive();
}

function renderModePicker() {
    const el = document.getElementById('el-modepicker');
    if (!el) return;
    el.className = `elmodal ${state.modePickerOpen ? 'o' : ''}`;
    if (!state.modePickerOpen) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Modus wählen</div><div class="text-sm text-gray-500">Bitte den gewünschten Arbeitsmodus auswählen.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-mode-picker">Schließen</button></div><div class="space-y-2">${MODES.map((m) => `<button class="w-full rounded-2xl border p-3 text-left ${state.mode === m.id ? 'border-indigo-300 ring-2 ring-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'}" data-a="mode" data-v="${m.id}"><div class="font-bold text-sm">${m.label}</div></button>`).join('')}</div></div>`;
}

function renderSettings() {
    const el = document.getElementById('el-settings');
    if (!el) return;
    const list = activeList();
    el.className = `elmodal ${state.settingsOpen ? 'o' : ''}`;
    if (!state.settingsOpen) { el.innerHTML = ''; return; }
    const permissionEntries = state.listId ? Array.from(state.perms.values()).filter((p) => p.listId === state.listId).filter((p) => p.userId !== uid()) : [];
    const candidates = Object.values(USERS || {}).filter((u) => u.id !== uid() && u.name && u.permissionType !== 'not_registered');
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Einkaufslisten verwalten</div><div class="text-sm text-gray-500">Privatliste ist fix, nicht umbenennbar und nicht teilbar.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-settings">Schließen</button></div><div class="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]"><div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">Listen</div><button class="elb a" data-a="create-list" ${!(currentUser.permissions || []).includes('EINKAUFSLISTE_CREATE') && currentUser.role !== 'SYSTEMADMIN' ? 'disabled' : ''}>+ Liste</button></div>${state.lists.map((l) => `<button class="w-full text-left rounded-2xl border p-3 ${state.listId === l.id ? 'ring-2 ring-indigo-500 border-indigo-300' : 'border-gray-200'}" data-a="list" data-id="${l.id}"><div class="font-bold text-sm">${escapeHtml(l.name)}</div><div class="text-xs text-gray-500">${l.isPrivateSystemList ? 'Privatliste' : 'Normale Liste'} · ${l.active !== false ? 'aktiv' : 'pausiert'}</div></button>`).join('')}</div><div class="space-y-4">${list ? `<div class="elc space-y-3"><div class="font-black text-sm">Allgemein</div><div class="grid gap-3 sm:grid-cols-2"><input id="el-set-name" class="eli" value="${escapeHtml(list.name || '')}" ${list.isPrivateSystemList || list.ownerId !== uid() ? 'disabled' : ''}><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-set-active" ${list.active !== false ? 'checked' : ''} ${list.isPrivateSystemList || list.ownerId !== uid() ? 'disabled' : ''}> aktiv</label></div>${list.ownerId === uid() && !list.isPrivateSystemList ? `<div class="flex flex-wrap gap-2"><button class="elb a" data-a="save-list">Liste speichern</button><button class="elb bg-red-600 text-white" data-a="delete-list" data-id="${list.id}">Liste löschen</button></div>` : '<div class="text-sm text-gray-400">Nur der Listeninhaber kann diese Liste ändern.</div>'}</div><div class="elc space-y-3"><div class="font-black text-sm">Freigaben</div><div class="grid gap-2 sm:grid-cols-2"><select id="el-c-user" class="els"><option value="">Person wählen...</option>${candidates.map((u) => `<option value="${u.id}" ${state.collab.userId === u.id ? 'selected' : ''}>${escapeHtml(u.name)}</option>`).join('')}</select><input id="el-c-from" type="datetime-local" class="eli" value="${escapeHtml(state.collab.accessFrom || dtLocal(new Date()))}"><input id="el-c-until" type="datetime-local" class="eli" value="${escapeHtml(state.collab.accessUntil || '')}"><div class="elm"><label class="inline-flex items-center gap-1 text-xs font-bold text-gray-600"><input id="el-cr" type="checkbox" ${state.collab.canRead ? 'checked' : ''}> Lesen</label><label class="inline-flex items-center gap-1 text-xs font-bold text-gray-600"><input id="el-ca" type="checkbox" ${state.collab.canAdd ? 'checked' : ''}> Hinzufügen</label><label class="inline-flex items-center gap-1 text-xs font-bold text-gray-600"><input id="el-cs" type="checkbox" ${state.collab.canShop ? 'checked' : ''}> Einkaufen</label><label class="inline-flex items-center gap-1 text-xs font-bold text-gray-600"><input id="el-cm" type="checkbox" ${state.collab.canManage ? 'checked' : ''}> Verwalten</label><label class="inline-flex items-center gap-1 text-xs font-bold text-gray-600"><input id="el-cw" type="checkbox" ${state.collab.canManageWrite ? 'checked' : ''}> Schreibrechte</label></div></div><button class="elb a" data-a="save-collab" ${list.ownerId !== uid() || list.isPrivateSystemList ? 'disabled' : ''}>Freigabe speichern</button>${permissionEntries.length ? permissionEntries.map((p) => `<div class="rounded-2xl border border-gray-200 p-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="font-bold text-sm">${escapeHtml(p.userName || p.userId)}</div><div class="text-xs text-gray-500">${dt(p.accessFrom)} bis ${p.accessUntil ? dt(p.accessUntil) : 'offen'}</div></div><button class="elb bg-red-600 text-white" data-a="del-collab" data-id="${p.userId}" ${list.ownerId !== uid() || list.isPrivateSystemList ? 'disabled' : ''}>Entfernen</button></div></div>`).join('') : '<div class="text-sm text-gray-400">Keine Freigaben.</div>'}</div>` : '<div class="elc text-sm text-gray-400">Bitte zuerst eine Liste wählen.</div>'}</div></div>`;
}

function renderPurchase() {
    const el = document.getElementById('el-purchase');
    if (!el) return;
    const p = state.purchase;
    el.className = `elmodal ${p ? 'o' : ''}`;
    if (!p) { el.innerHTML = ''; return; }
    const delta = Number((Number(p.quantity || 0) - Number(p.target || 0)).toFixed(2));
    const keyBtn = 'rounded-2xl min-h-[3.25rem] border border-slate-300 bg-white text-lg font-black text-slate-800';
    const keyAccent = 'rounded-2xl min-h-[3.25rem] border text-base font-black';
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="space-y-1 text-center"><div class="text-xl font-black text-gray-900">${escapeHtml(p.title)}</div><div class="text-sm text-gray-500">${p.kind === 'scan' ? 'Scan-Erfassung' : 'Mengenübernahme'}</div></div><div class="elc space-y-3 bg-slate-50"><div class="text-xs font-bold uppercase text-gray-500 text-center">Menge</div><div class="flex min-h-[6.5rem] flex-col items-center justify-center text-center"><div class="text-5xl font-black leading-none text-indigo-700">${purchaseDisplayValue(p)}</div><div class="mt-2 text-base font-bold text-slate-500">${escapeHtml(p.unit)}</div></div>${p.target ? `<div class="text-sm text-center text-gray-600">Soll lt. Liste: ${fmtQty(p.target)} ${escapeHtml(p.unit)}</div>` : ''}${delta !== 0 ? `<div class="rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-800 text-center">${delta > 0 ? `Achtung +${fmtQty(delta)} – übernehmen?` : `Achtung ${fmtQty(delta)} – übernehmen?`}</div>` : ''}</div><div class="space-y-2"><div class="grid grid-cols-4 gap-2"><button class="${keyBtn}" data-a="digit" data-v="7">7</button><button class="${keyBtn}" data-a="digit" data-v="8">8</button><button class="${keyBtn}" data-a="digit" data-v="9">9</button><button class="${keyAccent} border-indigo-200 bg-indigo-50 text-indigo-700" data-a="full">SOLL</button></div><div class="grid grid-cols-4 gap-2"><button class="${keyBtn}" data-a="digit" data-v="4">4</button><button class="${keyBtn}" data-a="digit" data-v="5">5</button><button class="${keyBtn}" data-a="digit" data-v="6">6</button><button class="${keyAccent} border-orange-200 bg-orange-50 text-orange-700" data-a="clear">C</button></div><div class="grid grid-cols-4 gap-2"><button class="${keyBtn}" data-a="digit" data-v="1">1</button><button class="${keyBtn}" data-a="digit" data-v="2">2</button><button class="${keyBtn}" data-a="digit" data-v="3">3</button><button class="${keyBtn}" data-a="back">⌫</button></div><div class="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2"><div class="grid grid-cols-[7fr_3fr] gap-2"><button class="${keyAccent} border-slate-300 bg-slate-100 text-slate-700" data-a="close-purchase">Abbruch</button><button class="${keyBtn}" data-a="digit" data-v=",">,</button></div><button class="${keyBtn}" data-a="digit" data-v="0">0</button><button class="${keyAccent} border-emerald-600 bg-emerald-600 text-white" data-a="confirm-purchase">Übernehmen</button></div></div></div>`;
}

function renderDetail() {
    const el = document.getElementById('el-detail');
    if (!el) return;
    const item = state.items.find((x) => x.id === state.detailId);
    const article = item ? state.articles.find((a) => a.id === item.articleId) : null;
    const otherLists = state.lists.filter((x) => x.id !== state.listId).filter((x) => canAdd(x) || canShop(x));
    el.className = `elmodal ${item ? 'o' : ''}`;
    if (!item) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-start"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><div class="text-xl font-black text-gray-900">Produkt bearbeiten</div>${isRestItem(item) ? chip('REST', 'bg-orange-100 text-orange-800 ring-1 ring-orange-300') : ''}</div><div class="text-sm text-gray-500">${isRestItem(item) ? `Automatisch angelegt als Rest von ${escapeHtml(String(item.title || '').replace(/^Rest von\s+/i, '').trim() || item.title || 'Artikel')}.` : 'Über das Zahnradsymbol des Eintrags wird dieses Fenster geöffnet.'}</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-detail">Schließen</button></div>${isRestItem(item) ? '<div class="rounded-2xl border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">Dieser Eintrag ist ein automatisch erzeugter Rest-Eintrag und kann wie jeder andere Eintrag bearbeitet oder gelöscht werden.</div>' : ''}<div class="grid gap-3 sm:grid-cols-2"><input id="el-d-title" class="eli" value="${escapeHtml(item.title || '')}" ${!canEditItems() ? 'disabled' : ''}><input id="el-d-qty" class="eli" value="${escapeHtml(formatEditableQty(item.quantity || '1'))}" ${!canEditItems() ? 'disabled' : ''}></div><div class="grid gap-3 sm:grid-cols-2"><select id="el-d-cat" class="els" ${!canEditItems() ? 'disabled' : ''}><option value="">Kategorie wählen...</option>${state.categories.map((c) => `<option value="${c.id}" ${item.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select><div class="flex items-center rounded-2xl border border-gray-200 bg-slate-50 px-3 text-sm font-bold text-gray-600">Einheit: ${escapeHtml(item.unit || 'Stück')}</div></div><textarea id="el-d-note" class="elt" placeholder="Anmerkung für diese Position" ${!canEditItems() ? 'disabled' : ''}>${escapeHtml(item.note || '')}</textarea><textarea id="el-d-pnote" class="elt" placeholder="Gespeicherte Anmerkung" ${!canEditItems() ? 'disabled' : ''}>${escapeHtml(item.persistentNote || '')}</textarea><div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><select id="el-d-move-list" class="els" ${!otherLists.length || !canEditItems() ? 'disabled' : ''}><option value="">Auf andere Liste verschieben...</option>${otherLists.map((list) => `<option value="${list.id}">${escapeHtml(list.name)}</option>`).join('')}</select><button class="elb bg-gray-100 text-gray-700" data-a="move-detail" ${!otherLists.length || !canEditItems() ? 'disabled' : ''}>Verschieben</button></div><div class="elc space-y-2 bg-slate-50 text-sm"><div><b>Artikel:</b> ${escapeHtml(article?.title || item.title || '—')}</div><div><b>Status:</b> ${escapeHtml(item.status || 'open')}</div><div><b>Erfasst:</b> ${dt(item.createdAt)}</div><div><b>Gekauft:</b> ${item.checkedAt ? `${dt(item.checkedAt)} · ${escapeHtml(item.checkedByName || '—')}` : '—'}</div>${item.restoredAt ? `<div><b>Wiederhergestellt:</b> ${dt(item.restoredAt)} · ${escapeHtml(item.restoredByName || '—')}</div>` : ''}${item.purchasedQuantity ? `<div><b>Gekauft-Menge:</b> ${fmtQty(item.purchasedQuantity)}</div>` : ''}</div><div class="flex flex-wrap justify-end gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="close-detail">Schließen</button>${canEditItems() ? '<button class="elb bg-red-600 text-white" data-a="delete-detail-item">Löschen</button><button class="elb a" data-a="save-detail">Speichern</button>' : ''}</div></div>`;
}

function renderArticle() {
    const el = document.getElementById('el-article'); if (!el) return; const a = state.articleEditor; el.className = `elmodal ${a ? 'o' : ''}`; if (!a) { el.innerHTML = ''; return; } el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="text-xl font-black text-gray-900">${a.id ? 'Artikel bearbeiten' : 'Artikel anlegen'}</div><button class="elb bg-gray-100 text-gray-700" data-a="close-article">Schließen</button></div><div class="grid gap-2 sm:grid-cols-2"><input id="ela-title" class="eli" placeholder="Bezeichnung" value="${escapeHtml(a.title || '')}"><input id="ela-q" class="eli" placeholder="Standardmenge" value="${escapeHtml(String(a.defaultQuantity || '1'))}"><select id="ela-unit" class="els">${UNITS.map((u) => `<option value="${u}" ${a.defaultUnit === u ? 'selected' : ''}>${u}</option>`).join('')}</select><select id="ela-cat" class="els"><option value="">Kategorie wählen...</option>${state.categories.map((c) => `<option value="${c.id}" ${a.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></div><textarea id="ela-ean" class="elt" placeholder="EAN-Codes, eine Zeile pro Code">${escapeHtml((a.eanCodes || []).join('\n'))}</textarea>${a.id ? `<div class="flex justify-end"><button class="elb bg-red-100 text-red-700" data-a="capture-ean" data-id="${a.id}">Ohne EAN scannen</button></div>` : ''}<textarea id="ela-var" class="elt" placeholder="Varianten je Zeile: Name|EAN1,EAN2">${escapeHtml((a.variants || []).map((v) => `${v.label || ''}|${(v.eanCodes || []).join(',')}`).join('\n'))}</textarea><textarea id="ela-note" class="elt" placeholder="Permanente Anmerkungen, je Zeile">${escapeHtml((a.persistentNotes || []).join('\n'))}</textarea><div class="elm">${state.stores.map((s) => `<label class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${(a.storeIds || []).includes(s.id) ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}"><input type="checkbox" data-a="art-store" data-id="${s.id}" ${(a.storeIds || []).includes(s.id) ? 'checked' : ''}> ${escapeHtml(s.name)}</label>`).join(' ')}</div><div class="flex flex-wrap justify-end gap-2">${a.id ? `<button class="elb bg-red-600 text-white" data-a="delete-article" data-id="${a.id}">Löschen</button>` : ''}<button class="elb bg-emerald-600 text-white" data-a="save-article">Speichern</button></div></div>`;
}

function renderScanner() {
    const el = document.getElementById('el-scanner'); if (!el) return; el.className = `elmodal ${state.scanOpen ? 'o' : ''}`; if (!state.scanOpen) { el.innerHTML = ''; stopScanner(); return; } el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Scanner</div><div class="text-sm text-gray-500">Barcode + QR live, ohne Refresh.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-scan">Schließen</button></div><div class="elcam"><video id="el-video" autoplay playsinline muted></video></div><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input id="el-scan-manual" class="eli" placeholder="EAN/QR manuell eingeben"><button class="elb a" data-a="manual-scan">Code übernehmen</button></div><div id="el-scan-status" class="text-sm text-gray-500">Kamera wird gestartet...</div></div>`; startScanner();
}

function renderUnknown() {
    const el = document.getElementById('el-unknown'); if (!el) return; el.className = `elmodal ${state.unknownCode ? 'o' : ''}`; if (!state.unknownCode) { el.innerHTML = ''; return; } el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="text-xl font-black text-gray-900">Unbekannter Code</div><div class="text-sm text-gray-500">Bitte zuerst einem bestehenden Artikel zuordnen.</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-unknown">Abbruch</button></div><div class="elc bg-slate-50 text-sm"><div><b>Code:</b> ${escapeHtml(state.unknownCode)}</div><select id="el-unknown-article" class="els"><option value="">Bestehendem Artikel zuordnen...</option>${state.articles.map((a) => `<option value="${a.id}" ${state.unknownArticleId === a.id ? 'selected' : ''}>${escapeHtml(a.title)}</option>`).join('')}</select><div class="flex flex-wrap justify-end gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="close-unknown">Abbruch</button><button class="elb bg-emerald-600 text-white" data-a="save-unknown">Zuordnen</button></div></div>`;
}

function formatEditableQty(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return '';
    return (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))).replace('.', ',');
}

function purchaseDisplayValue(p) {
    if (!p) return '';
    if (p.pristine) return escapeHtml(fmtQty(p.quantity));
    if (String(p.raw || '') === '') return '&nbsp;';
    return escapeHtml(String(p.raw));
}

function appendPurchaseInput(value) {
    if (!state.purchase) return;
    let raw = state.purchase.pristine ? '' : String(state.purchase.raw || '');
    if (value === ',') {
        if (raw.includes(',')) return;
        raw = raw ? `${raw},` : '0,';
    } else {
        raw = `${raw}${value}`;
    }
    state.purchase.pristine = false;
    state.purchase.raw = raw;
    state.purchase.quantity = parseQty(raw);
}

function removePurchaseInput() {
    if (!state.purchase) return;
    const raw = state.purchase.pristine ? '' : String(state.purchase.raw || '');
    const next = raw.slice(0, -1);
    state.purchase.pristine = false;
    state.purchase.raw = next;
    state.purchase.quantity = next ? parseQty(next) : 0;
}

function clearPurchaseInput() {
    if (!state.purchase) return;
    state.purchase.pristine = false;
    state.purchase.raw = '';
    state.purchase.quantity = 0;
}

function setPurchaseToTarget() {
    if (!state.purchase) return;
    const value = Number(state.purchase.target || state.purchase.base || 1);
    state.purchase.pristine = false;
    state.purchase.raw = formatEditableQty(value);
    state.purchase.quantity = value;
}

function onKeyDownActive(e) {
     const activeId = document.activeElement?.id || '';
     if (state.scanOpen && e.key === 'Enter' && activeId === 'el-scan-manual') {
         e.preventDefault();
         submitScannerManualInputActive();
         return;
     }
     if (state.mode === 'shop' && state.listMode === 'input' && e.key === 'Enter' && !e.shiftKey && ['el-title', 'el-q', 'el-note'].includes(activeId)) {
         e.preventDefault();
         addItem();
     }
 }

 function onInput(e) {
     const t = e.target;
     if (t.id === 'el-q') state.q = t.value;
     if (t.id === 'el-title') state.title = t.value;
     if (t.id === 'el-note') state.note = t.value;
     if (t.id === 'el-search') state.search = t.value;
     if (t.id === 'el-article-search') { state.articleSearch = t.value; render(); return; }
     if (t.id === 'el-draft-store') state.drafts.store = t.value;
     if (t.id === 'el-draft-category') state.drafts.category = t.value;
     if (t.id === 'el-draft-remark') state.drafts.remark = t.value;
     if (t.id === 'el-draft-note') state.drafts.note = t.value;
     if (t.id === 'el-c-from') state.collab.accessFrom = t.value;
     if (t.id === 'el-c-until') state.collab.accessUntil = t.value;
 }

 function onChange(e) {
     const t = e.target;
     if (t.id === 'el-unit') state.unit = t.value;
     if (t.id === 'el-list-select' && t.value) { selectList(t.value); return; }
     if (t.id === 'el-store-add' && t.value) {
         if (!state.storeIds.includes(t.value)) state.storeIds.push(t.value);
         t.value = '';
         render();
         return;
     }
     if (t.id === 'el-store-numbers') { state.storeNumbers = t.checked; saveUserSetting(EL_STORE_NUMBERS_KEY, state.storeNumbers); render(); return; }
     if (t.id === 'el-missing-ean') { state.missingEanOnly = t.checked; render(); return; }
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

 function openStoreCategoryEditor(storeId) {
    const store = state.stores.find((s) => s.id === storeId);
    if (!store) return;
    state.storeCategoryEditor = { storeId, categoryOrder: [...(store.categoryOrder || [])] };
    state.dragStoreCategory = null;
    render();
}

function toggleStoreCategoryDraft(catId) {
    const editor = state.storeCategoryEditor;
    if (!editor) return;
    editor.categoryOrder = editor.categoryOrder.includes(catId) ? editor.categoryOrder.filter((id) => id !== catId) : [...editor.categoryOrder, catId];
    renderStoreCategoryEditorActive();
}

function moveStoreCategoryDraft(catId, dir) {
    const editor = state.storeCategoryEditor;
    if (!editor) return;
    const from = editor.categoryOrder.indexOf(catId);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= editor.categoryOrder.length) return;
    const next = [...editor.categoryOrder];
    [next[from], next[to]] = [next[to], next[from]];
    editor.categoryOrder = next;
    renderStoreCategoryEditorActive();
}

function onDown(e) {
    const dragHandle = e.target.closest('[data-drag-store-category]');
    if (dragHandle) {
        startStoreCategoryDrag(dragHandle.dataset.id, e);
    }
}

function startStoreCategoryDrag(catId, e) {
    const editor = state.storeCategoryEditor;
    if (!editor || !catId) return;
    state.dragStoreCategory = { id: catId, pointerId: e.pointerId, overId: catId, after: false };
    if (typeof e.preventDefault === 'function') e.preventDefault();
    renderStoreCategoryEditorActive();
}

function onPointerMoveActive(e) {
    const drag = state.dragStoreCategory;
    const editor = state.storeCategoryEditor;
    if (!drag || !editor) return;
    const row = e.target.closest('[data-store-category-row]');
    if (!row) return;
    const overId = row.dataset.id;
    if (!overId || overId === drag.id) return;
    const rect = row.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    if (drag.overId === overId && drag.after === after) return;
    drag.overId = overId;
    drag.after = after;
    renderStoreCategoryEditorActive();
}

function finishStoreCategoryDrag() {
    const drag = state.dragStoreCategory;
    const editor = state.storeCategoryEditor;
    if (!drag || !editor) {
        state.dragStoreCategory = null;
        return;
    }
    const currentOrder = Array.isArray(editor.categoryOrder) ? [...editor.categoryOrder] : [];
    const sourceIndex = currentOrder.indexOf(drag.id);
    if (sourceIndex < 0) {
        state.dragStoreCategory = null;
        renderStoreCategoryEditorActive();
        return;
    }
    const next = currentOrder.filter((id) => id !== drag.id);
    const targetId = drag.overId && drag.overId !== drag.id ? drag.overId : null;
    if (targetId) {
        const targetIndex = next.indexOf(targetId);
        if (targetIndex >= 0) {
            const insertAt = Math.max(0, Math.min(targetIndex + (drag.after ? 1 : 0), next.length));
            next.splice(insertAt, 0, drag.id);
        } else {
            next.splice(Math.max(0, Math.min(sourceIndex, next.length)), 0, drag.id);
        }
    } else {
        next.splice(Math.max(0, Math.min(sourceIndex, next.length)), 0, drag.id);
    }
    editor.categoryOrder = next;
    state.dragStoreCategory = null;
    renderStoreCategoryEditorActive();
}

function finalizePointerState() {
    finishStoreCategoryDrag();
}

async function addMaster(name, value, key) {
    const v = String(value || '').trim();
    if (!v) return;
    await addDoc(master(name), { [key]: v, createdBy: uid(), createdByName: uname(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

async function addFree(ref, value) {
    const v = String(value || '').trim();
    if (!v) return;
    await addDoc(ref, { text: v, createdBy: uid(), createdByName: uname(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

async function addItem() {
    if (!canAdd()) return alertUser('Keine Berechtigung zum Hinzufügen.', 'error');
    const title = String(state.title || '').trim();
    if (!title) return alertUser('Bitte Artikel eingeben.', 'error');
    const quantity = parseQty(state.q || '1') || 1;
    let article = state.articles.find((a) => a.title?.trim().toLowerCase() === title.toLowerCase());
    if (!article) {
        const ref = await addDoc(master('articles'), { title, defaultQuantity: quantity, defaultUnit: state.unit, categoryId: '', eanCodes: [], variants: [], persistentNotes: [], storeIds: [...state.storeIds], createdBy: uid(), createdByName: uname(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        article = { id: ref.id, title, defaultQuantity: quantity, defaultUnit: state.unit, persistentNotes: [], eanCodes: [], storeIds: [...state.storeIds] };
    }
    const persistentNote = article.persistentNotes?.length ? article.persistentNotes.join(' · ') : '';
    await addDoc(sub(state.listId, 'items'), { articleId: article.id, title: article.title, quantity, unit: state.unit, categoryId: article.categoryId || '', storeIds: [...state.storeIds], status: 'open', note: state.note || '', persistentNote, eanCodes: article.eanCodes || [], createdAt: serverTimestamp(), createdBy: uid(), createdByName: uname() });
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname(), storeOrder: activeList()?.storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id) });
    await logActivity('Artikel hinzugefügt', { title, quantity, unit: state.unit });
    state.q = '1'; state.title = ''; state.note = ''; state.storeIds = []; render();
}

async function saveDetailItem() {
    const item = state.items.find((x) => x.id === state.detailId);
    if (!item) return;
    if (!canEditItems()) return alertUser('Keine Berechtigung zum Bearbeiten.', 'error');
    if (!(await acquireLock(item.id))) return;
    const title = document.getElementById('el-d-title')?.value?.trim();
    const quantity = parseQty(document.getElementById('el-d-qty')?.value || String(item.quantity || '1'));
    const categoryId = String(document.getElementById('el-d-cat')?.value || '');
    const note = String(document.getElementById('el-d-note')?.value || '').trim();
    const persistentNote = String(document.getElementById('el-d-pnote')?.value || '').trim();
    if (!title) return alertUser('Bitte Produktnamen eingeben.', 'error');
    const unit = String(document.getElementById('el-d-unit')?.value || '');
    const itemData = { title, quantity, categoryId, note, persistentNote, unit };
    await updateDoc(doc(sub(state.listId, 'items'), item.id), itemData);
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() });
    await logActivity('Artikel bearbeitet', { itemId: item.id, title, quantity });
    render();
}

async function handleDouble(id, action) {
    const key = `${action}:${id}`;
    const last = state.lastTap.get(key) || 0;
    const now = Date.now();
    state.lastTap.set(key, now);
    if (now - last > DOUBLE_MS) {
        if (action === 'check') showQuantityActionButton(id);
        return;
    }
    state.lastTap.delete(key);
    if (action === 'check') { hideQuantityActionButton(id); await checkItemDirect(id); return; }
    if (action === 'edit-item') { showItemActionButtons(id); return; }
    if (action === 'quantity') { hideQuantityActionButton(id); const item = state.items.find((x) => x.id === id); if (item) openPurchase(item, false); return; }
    const item = state.items.find((x) => x.id === id); if (!item) return;
    await updateDoc(doc(sub(state.listId, 'items'), item.id), { status: 'open', restoredAt: serverTimestamp(), restoredBy: uid(), restoredByName: uname(), checkedAt: null, checkedBy: null, checkedByName: null });
    await logActivity('Artikel wiederhergestellt', { itemId: id, title: item.title });
}

async function checkItemDirect(id) {
    const item = state.items.find((x) => x.id === id);
    if (!item) return;
    if (!canShop()) return alertUser('Keine Berechtigung zum Abhaken.', 'error');
    if (!(await acquireLock(item.id))) return;
    hideItemActionButtons(id);
    hideQuantityActionButton(id);
    await updateDoc(doc(sub(state.listId, 'items'), item.id), { status: 'checked', purchasedQuantity: Number(item.quantity || 0), checkedAt: serverTimestamp(), checkedBy: uid(), checkedByName: uname() });
    await logActivity('Artikel abgehakt', { itemId: id, title: item.title, quantity: item.quantity });
}

async function deleteDetailItem() {
    const item = state.items.find((x) => x.id === state.detailId);
    if (!item) return;
    if (!confirm(`Produkt "${item.title}" löschen?`)) return;
    await deleteListItem(item.id, 'Artikel gelöscht');
}

async function deleteCheckedItem(itemId) {
    const item = state.items.find((x) => x.id === itemId);
    if (!item) return;
    if (!confirm(`Produkt "${item.title}" dauerhaft löschen?`)) return;
    hideItemActionButtons(itemId);
    hideQuantityActionButton(itemId);
    await deleteListItem(item.id, 'Abgehakten Artikel gelöscht');
}

async function deleteAllCheckedItems() {
    const checked = state.items.filter((x) => x.status === 'checked');
    if (!checked.length) return alertUser('Keine abgehakten Einträge vorhanden.', 'info');
    if (!confirm(`Alle ${checked.length} abgehakten Einträge löschen?`)) return;
    state.checkedMenuOpen = false;
    render();
    for (const item of checked) {
        hideItemActionButtons(item.id);
        hideQuantityActionButton(item.id);
        await deleteDoc(doc(sub(state.listId, 'items'), item.id));
    }
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() });
    await logActivity('Alle abgehakten Einträge gelöscht', { count: checked.length });
    render();
}

function openPurchase(itemOrArticle, isScan) {
    const item = itemOrArticle?.status ? itemOrArticle : null;
    const article = item ? state.articles.find((a) => a.id === item.articleId) : itemOrArticle;
    const title = item?.title || article?.title || 'Artikel';
    const unit = item?.unit || article?.defaultUnit || 'Stück';
    const base = Number(item?.quantity || article?.defaultQuantity || 1);
    const startQuantity = item ? Number(item.quantity || 0) : base;
    state.purchase = { kind: isScan ? 'scan' : 'manual', itemId: item?.id || '', articleId: item?.articleId || article?.id || '', title, unit, target: item ? Number(item.quantity || 0) : 0, base, raw: '', quantity: startQuantity, pristine: true };
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
    closePurchaseModal();
    if (p.itemId) {
        const item = state.items.find((x) => x.id === p.itemId); if (!item) return;
        hideItemActionButtons(item.id);
        hideQuantityActionButton(item.id);
        if (qty >= Number(item.quantity || 0)) {
            await updateDoc(doc(sub(state.listId, 'items'), item.id), { status: 'checked', purchasedQuantity: qty, checkedAt: serverTimestamp(), checkedBy: uid(), checkedByName: uname() });
        } else {
            const rest = Number((Number(item.quantity || 0) - qty).toFixed(2));
            await updateDoc(doc(sub(state.listId, 'items'), item.id), { status: 'checked', purchasedQuantity: qty, checkedAt: serverTimestamp(), checkedBy: uid(), checkedByName: uname() });
            const { id: _restItemId, ...restPayload } = item;
            await addDoc(sub(state.listId, 'items'), { ...restPayload, quantity: rest, title: `Rest von ${item.title}`, status: 'open', createdAt: serverTimestamp(), createdBy: uid(), createdByName: uname(), restoredAt: null, restoredBy: null, restoredByName: null, checkedAt: null, checkedBy: null, checkedByName: null });
        }
        await logActivity('Artikel gekauft/abgehakt', { itemId: item.id, title: item.title, quantity: qty });
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
    render();
}

async function acquireLock(itemId) {
    const ref = doc(sub(state.listId, 'locks'), itemId);
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref); const data = snap.exists() ? snap.data() : null; const exp = toDate(data?.expiresAt)?.getTime() || 0;
            if (data && data.userId !== uid() && Date.now() < exp) throw new Error('Gesperrt');
            tx.set(ref, { itemId, userId: uid(), userName: uname(), expiresAt: Timestamp.fromDate(new Date(Date.now() + LOCK_MS)), updatedAt: serverTimestamp() }, { merge: true });
        });
        return true;
    } catch {
        alertUser('Artikel wird gerade von jemand anderem bearbeitet.', 'error');
        return false;
    }
}

async function submitScannerManualInputActive() {
    const input = document.getElementById('el-scan-manual');
    const value = String(input?.value || '').trim();
    if (!value) return;
    input.value = '';
    await processScannerCodeActive(value);
}

async function processScannerCodeActive(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) return false;
    const now = Date.now();
    for (const [scannedCode, scannedAt] of scanRecentCodes.entries()) {
        if (now - scannedAt >= SCAN_LOCKOUT_MS) scanRecentCodes.delete(scannedCode);
    }
    const lastSeen = scanRecentCodes.get(code) || 0;
    if (now - lastSeen < SCAN_LOCKOUT_MS) return false;
    scanRecentCodes.set(code, now);
    state.scanLastCode = code;
    state.scanLastAt = now;
    if (state.scanMode === 'article-ean') {
        state.scanCodes = Array.from(new Set([...(state.scanCodes || []), code]));
        state.scanStatus = `${state.scanCodes.length} Code(s) erfasst.`;
        updateScannerDynamicUi();
        flashScanSuccess();
        return true;
    }
    await handleScanCode(code);
    return true;
}

async function addScannedArticleToList(article, code = '') {
    if (!article) return;
    if (!canAdd()) return alertUser('Keine Berechtigung zum Hinzufügen.', 'error');
    const quantity = parseQty(state.q || String(article.defaultQuantity || '1')) || Number(article.defaultQuantity || 1) || 1;
    const unit = String(state.unit || article.defaultUnit || 'Stück') || 'Stück';
    const storeIds = state.storeIds.length ? [...state.storeIds] : [...(article.storeIds || [])];
    const persistentNote = article.persistentNotes?.length ? article.persistentNotes.join(' · ') : '';
    await addDoc(sub(state.listId, 'items'), { articleId: article.id, title: article.title, quantity, unit, categoryId: article.categoryId || '', storeIds, status: 'open', note: state.note || '', persistentNote, eanCodes: article.eanCodes || [], createdAt: serverTimestamp(), createdBy: uid(), createdByName: uname() });
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname(), storeOrder: activeList()?.storeOrder?.length ? activeList().storeOrder : state.stores.map((s) => s.id) });
    await logActivity('Artikel per Scan hinzugefügt', { articleId: article.id, title: article.title, code, quantity, unit });
    state.scanStatus = `Hinzugefügt: ${article.title}`;
    updateScannerDynamicUi();
    flashScanSuccess();
}

async function saveScannedCodesActive(openNext = false) {
    const article = state.articles.find((a) => a.id === state.scanArticleId);
    if (!article) return alertUser('Artikel für die EAN-Erfassung wurde nicht gefunden.', 'error');
    if (!state.scanCodes.length) return alertUser('Bitte zuerst mindestens einen Code erfassen.', 'error');
    const eanCodes = Array.from(new Set([...(article.eanCodes || []), ...state.scanCodes]));
    await updateDoc(doc(master('articles'), article.id), { eanCodes, updatedAt: serverTimestamp() });
    await logActivity('EANs zum Artikel hinzugefügt', { articleId: article.id, count: state.scanCodes.length });
    flashScanSuccess();
    if (openNext) {
        const nextArticle = nextMissingEanArticle(article.id);
        if (nextArticle) {
            state.scanArticleId = nextArticle.id;
            state.scanCodes = [];
            state.scanStatus = `Nächster Artikel: ${nextArticle.title}`;
            state.scanLastCode = '';
            state.scanLastAt = 0;
            render();
            return;
        }
        closeScannerModal();
        alertUser('Keine weiteren Artikel ohne EAN gefunden.', 'success');
        return;
    }
    closeScannerModal();
}

async function startScannerActive() {
    try {
        const video = document.getElementById('el-video');
        const status = document.getElementById('el-scan-status');
        if (!video) return;
        if (!scanStream) scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        video.srcObject = scanStream;
        state.scanStatus = state.scanMode === 'article-ean' ? 'Scanner aktiv. Mehrere Codes können gesammelt werden.' : 'Scanner aktiv.';
        if (status) status.textContent = state.scanStatus;
        if ('BarcodeDetector' in window) {
            if (!scanTimer) {
                const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code'] });
                scanTimer = setInterval(async () => {
                    if (!state.scanOpen) return;
                    const liveVideo = document.getElementById('el-video');
                    if (!liveVideo) return;
                    try {
                        const codes = await detector.detect(liveVideo);
                        if (codes?.length) await processScannerCodeActive(codes[0].rawValue || '');
                    } catch {}
                }, 700);
            }
        } else {
            state.scanStatus = 'BarcodeDetector nicht verfügbar. Bitte Code manuell eingeben.';
            if (status) status.textContent = state.scanStatus;
        }
        updateScannerDynamicUi();
    } catch {
        const status = document.getElementById('el-scan-status');
        state.scanStatus = 'Kamera konnte nicht gestartet werden.';
        if (status) status.textContent = state.scanStatus;
    }
}

async function handleScanCode(code) {
    const article = state.articles.find((a) => (a.eanCodes || []).includes(code) || (a.variants || []).some((v) => (v.eanCodes || []).includes(code)));
    if (!article) {
        state.scanStatus = `EAN nicht gefunden: ${code}`;
        updateScannerDynamicUi();
        alertUser('Kein Artikel zu diesem EAN-Code gefunden.', 'error');
        return;
    }
    if (state.scanMode === 'list-add') {
        await addScannedArticleToList(article, code);
        return;
    }
    state.scanStatus = `Gefunden: ${article.title}`;
    updateScannerDynamicUi();
    flashScanSuccess();
    openPurchase(article, true);
}

async function saveUnknownCode() {
    if (!state.unknownCode) return;
    if (!state.unknownArticleId) return alertUser('Bitte Artikel auswählen.', 'error');
    const article = state.articles.find((x) => x.id === state.unknownArticleId);
    if (!article) return alertUser('Artikel wurde nicht gefunden.', 'error');
    const code = state.unknownCode;
    closeUnknownModal();
    await updateDoc(doc(master('articles'), article.id), { eanCodes: Array.from(new Set([...(article.eanCodes || []), code])), updatedAt: serverTimestamp() });
    await logActivity('Unbekannter Code zugeordnet', { articleId: article.id, code });
    render();
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

async function saveStoreCategoryEditorActive() {
    const editor = state.storeCategoryEditor;
    if (!editor) return;
    await updateDoc(doc(master('stores'), editor.storeId), { categoryOrder: editor.categoryOrder, updatedAt: serverTimestamp() });
    await logActivity('Geschäftskategorien sortiert', { storeId: editor.storeId, categoryCount: editor.categoryOrder.length });
    state.dragStoreCategory = null;
    state.storeCategoryEditor = null;
    render();
}

async function createList() {
    const name = prompt('Name der neuen Einkaufsliste:'); if (!String(name || '').trim()) return;
    const ref = doc(listsRef()); await setDoc(ref, { name: String(name).trim(), ownerId: uid(), ownerName: uname(), isPrivateSystemList: false, active: true, memberIds: [uid()], storeOrder: state.stores.map((s) => s.id), storeNotes: {}, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); state.listId = ref.id; persistListId(); await logActivity('Liste erstellt', { listId: ref.id, name: String(name).trim() });
}

async function saveList() {
    const list = activeList(); if (!list || list.ownerId !== uid() || list.isPrivateSystemList) return; const name = document.getElementById('el-set-name')?.value?.trim() || list.name; const active = !!document.getElementById('el-set-active')?.checked; await updateDoc(listDoc(list.id), { name, active, updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); await logActivity('Liste gespeichert', { listId: list.id, active, name });
}

async function deleteList(id) {
    const list = state.lists.find((x) => x.id === id); if (!list || list.ownerId !== uid() || list.isPrivateSystemList) return; if (!confirm(`Liste "${list.name}" löschen?`)) return; await deleteDoc(listDoc(id)); if (state.listId === id) state.listId = null; persistListId(); }

async function saveCollaborator() {
    const list = activeList(); if (!list || list.ownerId !== uid() || list.isPrivateSystemList) return; const c = state.collab; if (!c.userId) return alertUser('Bitte Person auswählen.', 'error'); await setDoc(doc(sub(list.id, 'permissions'), c.userId), { listId: list.id, userId: c.userId, userName: USERS[c.userId]?.name || c.userId, accessFrom: fromLocal(c.accessFrom || dtLocal(new Date())), accessUntil: fromLocal(c.accessUntil || ''), canRead: !!c.canRead, canAdd: !!c.canAdd, canShop: !!c.canShop, canManage: !!c.canManage, canManageWrite: !!c.canManageWrite, paused: list.active === false, updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); await updateDoc(listDoc(list.id), { memberIds: Array.from(new Set([...(list.memberIds || []), c.userId])), updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); await logActivity('Mitbearbeiter gespeichert', { userId: c.userId });
}

async function deleteCollaborator(userId) {
    const list = activeList();
    if (!list || list.ownerId !== uid() || !userId) return;
    await deleteDoc(doc(sub(list.id, 'permissions'), userId));
    const memberIds = Array.from(new Set([...(list.memberIds || []).filter((id) => id !== userId), uid()]));
    await updateDoc(listDoc(list.id), { memberIds, updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() });
    await logActivity('Mitbearbeiter entfernt', { userId });
}

async function onClickActive(e) {
    return onClick(e);
}

async function onClick(e) {
    const btn = e.target.closest('[data-a]');
    if (!btn) return;
    const a = btn.dataset.a;
    const clickKey = btn.dataset.id ? `${a}:${btn.dataset.id}` : a;
    if (holdConsumedKey === clickKey && Date.now() - holdConsumedAt < 900) { holdConsumedKey = ''; return; }
    if (a === 'back-home') { navigate('home'); return; }
    if (a === 'open-mode-picker') { state.modePickerOpen = true; render(); return; }
    if (a === 'close-mode-picker') { state.modePickerOpen = false; render(); return; }
    if (a === 'toggle-details') { state.detailsOpen = !state.detailsOpen; render(); return; }
    if (a === 'mode') { state.mode = btn.dataset.v === 'manage' ? 'manage' : 'shop'; state.modePickerOpen = false; saveUserSetting(EL_MODE_KEY, state.mode); touchPresence(); render(); return; }
    if (a === 'quick-mode') { state.mode = 'shop'; state.listMode = btn.dataset.v === 'input' ? 'input' : 'search'; saveUserSetting(EL_MODE_KEY, state.mode); saveUserSetting(EL_LIST_MODE_KEY, state.listMode); touchPresence(); render(); return; }
    if (a === 'section') { state.section = btn.dataset.v; saveUserSetting(EL_SECTION_KEY, state.section); touchPresence(); render(); return; }
    if (a === 'store-display') { state.storeDisplay = state.storeDisplay === 'split' ? 'combined' : 'split'; saveUserSetting(EL_STORE_KEY, state.storeDisplay); render(); return; }
    if (a === 'list') { selectList(btn.dataset.id); return; }
    if (a === 'open-settings') { state.settingsOpen = true; render(); return; }
    if (a === 'close-settings') { state.settingsOpen = false; render(); return; }
    if (a === 'del-store') { state.storeIds = state.storeIds.filter((x) => x !== btn.dataset.id); render(); return; }
    if (a === 'add-item') { await addItem(); return; }
    if (a === 'edit-item') { await handleDouble(btn.dataset.id, 'edit-item'); return; }
    if (a === 'open-detail-item') { hideItemActionButtons(btn.dataset.id); state.detailId = btn.dataset.id; render(); return; }
    if (a === 'delete-item-direct') { hideItemActionButtons(btn.dataset.id); hideQuantityActionButton(btn.dataset.id); await deleteListItem(btn.dataset.id, 'Artikel gelöscht'); return; }
    if (a === 'check' || a === 'restore') { await handleDouble(btn.dataset.id, a); return; }
    if (a === 'quantity') { await handleDouble(btn.dataset.id, 'quantity'); return; }
    if (a === 'detail') { state.detailId = btn.dataset.id; render(); return; }
    if (a === 'close-detail') { state.detailId = null; render(); return; }
    if (a === 'toggle-checked-menu') { state.checkedMenuOpen = !state.checkedMenuOpen; render(); return; }
    if (a === 'delete-all-checked') { await deleteAllCheckedItems(); return; }
    if (a === 'delete-checked-item') { await deleteCheckedItem(btn.dataset.id); return; }
    if (a === 'open-scan') { if (state.scanOpen) closeScannerModal(); else openScanner(state.listMode === 'input' ? 'list-add' : 'shopping'); return; }
    if (a === 'close-scan') { closeScannerModal(); return; }
    if (a === 'manual-scan') { await submitScannerManualInputActive(); return; }
    if (a === 'save-scanned-codes') { await saveScannedCodesActive(false); return; }
    if (a === 'save-scanned-codes-next') { await saveScannedCodesActive(true); return; }
    if (a === 'remove-scanned-code') { removeScannedCodeActive(btn.dataset.id); return; }
    if (a === 'close-unknown') { closeUnknownModal(); return; }
    if (a === 'save-unknown') { await saveUnknownCode(); return; }
    if (a === 'open-article') { state.articleEditor = { title: '', defaultQuantity: 1, defaultUnit: 'Stück', categoryId: '', eanCodes: [], variants: [], persistentNotes: [], storeIds: [] }; render(); return; }
    if (a === 'edit-article') { const article = state.articles.find((x) => x.id === btn.dataset.id); if (article) { state.articleEditor = JSON.parse(JSON.stringify(article)); render(); } return; }
    if (a === 'capture-ean') { openScanner('article-ean', btn.dataset.id); return; }
    if (a === 'close-article') { state.articleEditor = null; render(); return; }
    if (a === 'art-store') { const ids = state.articleEditor.storeIds || []; state.articleEditor.storeIds = ids.includes(btn.dataset.id) ? ids.filter((x) => x !== btn.dataset.id) : [...ids, btn.dataset.id]; renderArticle(); return; }
    if (a === 'save-article') { await saveArticle(); return; }
    if (a === 'delete-article') { await deleteDoc(doc(master('articles'), btn.dataset.id)); await logActivity('Artikel gelöscht', { articleId: btn.dataset.id }); state.articleEditor = null; render(); return; }
    if (a === 'add-category') { await addMaster('categories', state.drafts.category, 'name'); state.drafts.category = ''; render(); return; }
    if (a === 'del-category') { await deleteDoc(doc(master('categories'), btn.dataset.id)); await logActivity('Kategorie gelöscht', { categoryId: btn.dataset.id }); return; }
    if (a === 'add-store') { await addMaster('stores', state.drafts.store, 'name'); state.drafts.store = ''; render(); return; }
    if (a === 'del-store-master') { await deleteDoc(doc(master('stores'), btn.dataset.id)); await logActivity('Geschäft gelöscht', { storeId: btn.dataset.id }); return; }
    if (a === 'store-up' || a === 'store-down') { await moveStore(btn.dataset.id, a === 'store-up' ? -1 : 1); return; }
    if (a === 'open-store-categories') { openStoreCategoryEditor(btn.dataset.id); return; }
    if (a === 'close-store-categories') { state.storeCategoryEditor = null; state.dragStoreCategory = null; render(); return; }
    if (a === 'toggle-store-category') { toggleStoreCategoryDraft(btn.dataset.id); return; }
    if (a === 'store-category-up') { moveStoreCategoryDraft(btn.dataset.id, -1); return; }
    if (a === 'store-category-down') { moveStoreCategoryDraft(btn.dataset.id, 1); return; }
    if (a === 'save-store-categories') { await saveStoreCategoryEditorActive(); return; }
    if (a === 'add-remark') { await addFree(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notes'), state.drafts.remark); state.drafts.remark = ''; render(); return; }
    if (a === 'del-remark') { await deleteDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notes'), btn.dataset.id)); return; }
    if (a === 'add-note') { await addFree(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notizen'), state.drafts.note); state.drafts.note = ''; render(); return; }
    if (a === 'del-note') { await deleteDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_master_notizen'), btn.dataset.id)); return; }
    if (a === 'create-list') { await createList(); return; }
    if (a === 'save-list') { await saveList(); return; }
    if (a === 'delete-list') { await deleteList(btn.dataset.id); return; }
    if (a === 'save-collab') { await saveCollaborator(); return; }
    if (a === 'del-collab') { await deleteCollaborator(btn.dataset.id); return; }
    if (a === 'save-detail') { await saveDetailItem(); return; }
    if (a === 'move-detail') { await moveDetailItem(); return; }
    if (a === 'delete-detail-item') { await deleteDetailItem(); return; }
    if (a === 'close-purchase') { closePurchaseModal(); return; }
    if (a === 'digit') { appendPurchaseInput(btn.dataset.v); renderPurchase(); resetAutoScan(); return; }
    if (a === 'back') { removePurchaseInput(); renderPurchase(); resetAutoScan(); return; }
    if (a === 'clear') { clearPurchaseInput(); renderPurchase(); resetAutoScan(); return; }
    if (a === 'full') { setPurchaseToTarget(); renderPurchase(); resetAutoScan(); return; }
    if (a === 'confirm-purchase') { await confirmPurchase(); return; }
}
