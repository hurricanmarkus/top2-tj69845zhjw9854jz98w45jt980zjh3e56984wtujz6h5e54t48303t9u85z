import { alertUser, appId, auth, currentUser, db, escapeHtml, GUEST_MODE, navigate, USERS } from './haupteingang.js';
import { getUserSetting, saveUserSetting } from './log-InOut.js';
import { addDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, or, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

const MODES = [{ id: 'shop', label: 'Listenmodus' }, { id: 'manage', label: 'Verwaltung' }, { id: 'notify', label: 'Benachrichtigungen' }];
const MANAGE = [{ id: 'general', label: 'Allgemein' }, { id: 'stores', label: 'Geschäftewartung' }, { id: 'articles', label: 'Artikelwartung' }, { id: 'categories', label: 'Kategorienwartung' }, { id: 'remarks', label: 'Anmerkungswartung' }, { id: 'notes', label: 'Notizwartung' }];
const UNITS = ['Stück', 'Kg', 'Gramm', 'Liter', 'Milliliter', 'Bund', 'Netz', 'Sack', 'Dose', 'Flasche', 'Becher', 'Packung'];
const NOTIFY_ACTIONS = [
    { id: 'added', label: 'Hinzugefügt', description: 'Neue Artikel auf der Liste' },
    { id: 'checked', label: 'Abgehakt', description: 'Artikel wurden erledigt/gekauft' },
    { id: 'changed', label: 'Geändert', description: 'Einträge wurden bearbeitet' },
    { id: 'invited', label: 'Zur Liste eingeladen', description: 'Du wurdest zu einer Liste hinzugefügt' }
];
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
let pendingFocusRequest = null;
let pendingNotificationListId = null;
let pendingNotificationMode = '';

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
    inputDetailsOpen: false,
    search: '',
    settingsOpen: false,
    detailsOpen: false,
    modePickerOpen: false,
    purchase: null,
    detailId: null,
    detailDraft: null,
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
    checkedOpen: false,
    drafts: { category: '', store: '', remark: '', note: '' },
    notificationSettings: null,
    notificationTemplate: null,
    notificationCopyTargets: [],
    notificationPublicKey: '',
    notificationSubscribed: false,
    notificationBusy: false,
    notificationError: ''
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
const webPushSettingsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'app-settings', 'einkaufsliste_webpush');
const notificationSettingsDoc = (listId = state.listId, userId = uid()) => doc(sub(listId, 'notification_settings'), userId);
const notificationSubscriptionsRef = (userId = uid()) => collection(db, 'artifacts', appId, 'public', 'data', 'einkaufsliste_notification_subscriptions', userId, 'devices');
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
    s.textContent += '.elmetaicons{display:inline-flex;align-items:center;gap:.32rem;flex-wrap:wrap}.elmetaicon{display:inline-flex;align-items:center;justify-content:center;min-width:1.85rem;height:1.68rem;padding:0 .4rem;border-radius:999px;border:1px solid currentColor;line-height:1;background:#fff;box-shadow:0 1px 0 rgba(15,23,42,.03)}.elmetaicon svg{width:1rem;height:1rem;display:block}.elmetaicon-barcode{color:#2563eb;background:#eff6ff}.elmetaicon-note{color:#7c3aed;background:#f5f3ff}.elmetaicon-store{color:#0f766e;background:#ecfeff}.elmetaicon-qty{color:#b45309;background:#fffbeb}.elmetaicon-category{color:#be185d;background:#fdf2f8}.elsuggest{margin-top:.35rem;border:1px solid #dbeafe;border-radius:.9rem;background:#f8fbff;overflow:hidden}.elsuggest-btn{width:100%;display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.65rem .8rem;border:0;border-top:1px solid #e0e7ff;background:transparent;text-align:left}.elsuggest-btn:first-child{border-top:0}.elsuggest-btn:active{background:#eef2ff}.elpresence{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;min-height:1.5rem}.elnotifyrow{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:.75rem;align-items:center}.elnotifytag{display:inline-flex;align-items:center;justify-content:center;min-height:1.8rem;padding:0 .65rem;border-radius:999px;border:1px solid #d1d5db;background:#fff;font-size:.72rem;font-weight:800;color:#334155}.elnotifyselect{display:flex;flex-wrap:wrap;gap:.45rem}.elnotifyselect button{border-radius:999px;border:1px solid #cbd5e1;background:#fff;padding:.42rem .72rem;font-size:.75rem;font-weight:800}.elnotifyselect button.a{background:#e0e7ff;border-color:#a5b4fc;color:#3730a3}@media(max-width:480px){.elsuggest-btn{padding:.55rem .65rem}.elmetaicon{min-width:1.68rem;height:1.54rem;padding:0 .34rem}.elmetaicon svg{width:.92rem;height:.92rem}.elnotifyrow{grid-template-columns:1fr}}';
    s.textContent += '.elinputstack{display:flex;flex-direction:column;gap:.45rem;min-width:0}.elinputgrid{display:grid;grid-template-columns:minmax(0,1fr) 108px 72px 50px;gap:.5rem;align-items:center}.eltitlewrap{position:relative;min-width:0}.eltitleinput{padding-left:2.8rem}.eltitlecam{position:absolute;left:.5rem;top:50%;transform:translateY(-50%);width:1.9rem;height:1.9rem;border-radius:.7rem;border:1px solid #cbd5e1;background:#fff;color:#475569;display:inline-flex;align-items:center;justify-content:center;font-size:.9rem;line-height:1}.eltitlecam.a{background:#fef2f2;border-color:#fecaca;color:#b91c1c}.eltitlecam.h{display:none}.eldetailtoggle{display:inline-flex;align-items:center;gap:.35rem;border:0;background:transparent;color:#64748b;font-size:.76rem;font-weight:800;padding:.1rem 0}.eldetailtoggle:active{transform:scale(.98)}.eldetailtoggle .arr{transition:transform .15s ease}.eldetailtoggle.o .arr{transform:rotate(180deg)}.eldetailpanel{display:grid;gap:.5rem}.eldetailrow{display:grid;gap:.5rem;align-items:center}@media(max-width:480px){.elinputgrid{grid-template-columns:minmax(0,1fr) 96px 64px 46px;gap:.35rem}.eltitleinput{padding-left:2.55rem}.eltitlecam{width:1.75rem;height:1.75rem;left:.45rem}.eldetailrow{grid-template-columns:1fr}}@media(min-width:481px){.eldetailrow{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}';
    s.textContent += '.elinputgrid{grid-template-columns:108px 72px minmax(0,1fr) 50px}.eldetailhead{display:flex;align-items:center;justify-content:space-between;gap:.5rem}.eldetailhead .elpresence{flex:1;min-width:0}.eldetailhead .eldetailtoggle{margin-left:auto;white-space:nowrap}.eldetailrow{grid-template-columns:minmax(0,.42fr) minmax(0,1fr)}@media(max-width:480px){.elinputgrid{grid-template-columns:92px 64px minmax(0,1fr) 46px;gap:.35rem}.eldetailrow{grid-template-columns:minmax(0,.42fr) minmax(0,1fr)}}';
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

function requestFocusAfterRender(id, start = null, end = null) {
    pendingFocusRequest = { id, start, end };
}

function applyPendingFocus() {
    if (!pendingFocusRequest) return;
    const req = pendingFocusRequest;
    pendingFocusRequest = null;
    focusInputById(req.id, req.start, req.end);
}

function sessionStorageRead(key) {
    try {
        return String(sessionStorage.getItem(key) || '').trim();
    } catch {
        return '';
    }
}

function sessionStorageWrite(key, value) {
    try {
        if (value) sessionStorage.setItem(key, String(value));
        else sessionStorage.removeItem(key);
    } catch {}
}

function normalizeNotificationInterval(value, fallback = 0) {
    const num = Number(String(value ?? fallback).replace(',', '.'));
    if (!Number.isFinite(num) || num < 0) return fallback;
    return Math.min(1440, Math.round(num));
}

function defaultNotificationSettings(listId = '') {
    return {
        listId,
        userId: uid(),
        userName: uname(),
        enabled: false,
        onlyOthers: true,
        directLink: true,
        pushActions: true,
        actions: {
            added: { enabled: true, intervalMinutes: 5 },
            checked: { enabled: true, intervalMinutes: 60 },
            changed: { enabled: true, intervalMinutes: 15 },
            invited: { enabled: true, intervalMinutes: 0 }
        }
    };
}

function cloneNotificationSettings(config = state.notificationSettings || defaultNotificationSettings(state.listId)) {
    const source = config || defaultNotificationSettings(state.listId);
    return {
        listId: source.listId || state.listId || '',
        userId: uid(),
        userName: uname(),
        enabled: source.enabled !== false,
        onlyOthers: source.onlyOthers !== false,
        directLink: source.directLink !== false,
        pushActions: source.pushActions !== false,
        actions: Object.fromEntries(NOTIFY_ACTIONS.map((entry) => {
            const current = source.actions?.[entry.id] || {};
            const fallback = defaultNotificationSettings(state.listId).actions[entry.id];
            return [entry.id, {
                enabled: current.enabled !== false,
                intervalMinutes: normalizeNotificationInterval(current.intervalMinutes, fallback.intervalMinutes)
            }];
        }))
    };
}

function normalizeNotificationSettings(raw = {}, listId = state.listId || '') {
    return { ...defaultNotificationSettings(listId), ...cloneNotificationSettings({ ...defaultNotificationSettings(listId), ...raw, listId }) };
}

function notificationTemplatePayload() {
    const cloned = cloneNotificationSettings();
    return {
        enabled: cloned.enabled,
        onlyOthers: cloned.onlyOthers,
        directLink: cloned.directLink,
        pushActions: cloned.pushActions,
        actions: cloned.actions
    };
}

function webPushSupported() {
    return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

function subscriptionDocId(endpoint = '') {
    const text = String(endpoint || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash) + text.charCodeAt(i);
    return `sub_${Math.abs(hash >>> 0).toString(36)}`;
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function notificationPermissionLabel() {
    if (!webPushSupported()) return 'Nicht unterstützt';
    if (Notification.permission === 'granted') return 'Erlaubt';
    if (Notification.permission === 'denied') return 'Blockiert';
    return 'Noch nicht erlaubt';
}

async function refreshNotificationSubscriptionState() {
    if (!uid() || uid() === GUEST_MODE) return;
    state.notificationSubscribed = false;
    state.notificationError = '';
    if (!webPushSupported()) {
        render();
        return;
    }
    try {
        const registration = await navigator.serviceWorker.ready;
        const current = await registration.pushManager.getSubscription();
        state.notificationSubscribed = !!current;
    } catch (error) {
        console.warn('Einkaufsliste Web-Push Status konnte nicht gelesen werden:', error);
    }
    render();
}

async function loadNotificationEnvironment() {
    if (!db || !uid() || uid() === GUEST_MODE) return;
    state.notificationPublicKey = '';
    try {
        if (typeof window.getEinkaufslisteWebPushConfig === 'function') {
            try {
                const result = await window.getEinkaufslisteWebPushConfig({});
                state.notificationPublicKey = String(result?.data?.publicKey || '').trim();
            } catch (callableError) {
                console.warn('Einkaufsliste Web-Push Callable noch nicht verfügbar, verwende Firestore-Fallback:', callableError);
            }
        }
        if (!state.notificationPublicKey) {
            const snap = await getDoc(webPushSettingsDoc());
            state.notificationPublicKey = snap.exists() ? String(snap.data()?.publicKey || '').trim() : '';
        }
    } catch (error) {
        console.warn('Einkaufsliste Web-Push Konfiguration konnte nicht geladen werden:', error);
        state.notificationPublicKey = '';
    }
    await refreshNotificationSubscriptionState();
}

async function saveNotificationSettings() {
    const list = activeList();
    if (!list || !canRead(list)) return alertUser('Bitte zuerst eine zugängliche Liste auswählen.', 'error');
    const payload = {
        ...cloneNotificationSettings(),
        listId: list.id,
        userId: uid(),
        userName: uname(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
    };
    await setDoc(notificationSettingsDoc(list.id), payload, { merge: true });
    state.notificationSettings = normalizeNotificationSettings(payload, list.id);
    alertUser('Benachrichtigungseinstellungen gespeichert.', 'success');
    render();
}

async function saveNotificationTemplate() {
    const payload = notificationTemplatePayload();
    await saveUserSetting(EL_NOTIFY_TEMPLATE_KEY, payload);
    state.notificationTemplate = payload;
    alertUser('Vorlage für Benachrichtigungen gespeichert.', 'success');
    render();
}

function applyNotificationTemplate() {
    if (!state.notificationTemplate) return alertUser('Es ist noch keine gespeicherte Vorlage vorhanden.', 'info');
    state.notificationSettings = normalizeNotificationSettings(state.notificationTemplate, state.listId);
    render();
}

function toggleNotificationCopyTarget(listId) {
    state.notificationCopyTargets = state.notificationCopyTargets.includes(listId)
        ? state.notificationCopyTargets.filter((id) => id !== listId)
        : [...state.notificationCopyTargets, listId];
    render();
}

async function copyNotificationSettingsToTargets() {
    const targets = state.notificationCopyTargets.filter(Boolean);
    if (!targets.length) return alertUser('Bitte mindestens eine Zielliste auswählen.', 'info');
    const payload = cloneNotificationSettings();
    await Promise.all(targets.map((listId) => setDoc(notificationSettingsDoc(listId), {
        ...payload,
        listId,
        userId: uid(),
        userName: uname(),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
    }, { merge: true })));
    state.notificationCopyTargets = [];
    alertUser('Benachrichtigungseinstellungen auf die gewählten Listen übertragen.', 'success');
    render();
}

async function syncWebPushSubscription({ requestPermission = false } = {}) {
    if (!webPushSupported()) return alertUser('Web-Push wird auf diesem Gerät/Browser nicht unterstützt.', 'error');
    if (!state.notificationPublicKey) return alertUser('Web-Push Public Key ist noch nicht konfiguriert.', 'error');
    state.notificationBusy = true;
    state.notificationError = '';
    render();
    try {
        let permission = Notification.permission;
        if (requestPermission && permission !== 'granted') permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            state.notificationError = 'Benachrichtigungen wurden nicht erlaubt.';
            alertUser(state.notificationError, 'info');
            return;
        }
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(state.notificationPublicKey)
            });
        }
        const data = subscription.toJSON();
        await setDoc(doc(notificationSubscriptionsRef(), subscriptionDocId(subscription.endpoint)), {
            userId: uid(),
            userName: uname(),
            endpoint: subscription.endpoint,
            subscription: data,
            permission,
            userAgent: navigator.userAgent || '',
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
        }, { merge: true });
        state.notificationSubscribed = true;
        alertUser('Web-Push für dieses Gerät aktiviert/synchronisiert.', 'success');
    } catch (error) {
        console.error('Einkaufsliste Web-Push Aktivierung fehlgeschlagen:', error);
        state.notificationError = error?.message || 'Web-Push konnte nicht aktiviert werden.';
        alertUser(state.notificationError, 'error');
    } finally {
        state.notificationBusy = false;
        render();
    }
}

async function disableWebPushSubscription() {
    if (!webPushSupported()) return alertUser('Web-Push wird auf diesem Gerät/Browser nicht unterstützt.', 'error');
    state.notificationBusy = true;
    state.notificationError = '';
    render();
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            const endpoint = subscription.endpoint;
            await subscription.unsubscribe();
            await deleteDoc(doc(notificationSubscriptionsRef(), subscriptionDocId(endpoint)));
        }
        state.notificationSubscribed = false;
        alertUser('Web-Push für dieses Gerät deaktiviert.', 'success');
    } catch (error) {
        console.error('Einkaufsliste Web-Push Deaktivierung fehlgeschlagen:', error);
        state.notificationError = error?.message || 'Web-Push konnte nicht deaktiviert werden.';
        alertUser(state.notificationError, 'error');
    } finally {
        state.notificationBusy = false;
        render();
    }
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
    if (pendingNotificationListId && state.lists.some((x) => x.id === pendingNotificationListId)) {
        state.listId = pendingNotificationListId;
        pendingNotificationListId = '';
        sessionStorageWrite(EL_NOTIFY_PENDING_LIST_KEY, '');
    } else if (preferredListId && state.lists.some((x) => x.id === preferredListId)) state.listId = preferredListId;
    else if (state.listId && state.lists.some((x) => x.id === state.listId)) state.listId = state.listId;
    if (!state.listId || !state.lists.some((x) => x.id === state.listId)) state.listId = state.lists[0]?.id || null;
    if (pendingNotificationMode) {
        pendingNotificationMode = '';
        sessionStorageWrite(EL_NOTIFY_PENDING_MODE_KEY, '');
    }
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
    unsubs.push(onSnapshot(query(collectionGroup(db, 'permissions'), where('userId', '==', uid())), (snap) => {
        const sharedListIds = Array.from(new Set(snap.docs
            .filter((d) => d.ref.path.includes('/einkaufsliste_lists/'))
            .map((d) => String(d.data()?.listId || '').trim())
            .filter(Boolean)));
        syncSharedListDocs(sharedListIds);
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
        pendingNotificationListId = sessionStorageRead(EL_NOTIFY_PENDING_LIST_KEY);
        pendingNotificationMode = sessionStorageRead(EL_NOTIFY_PENDING_MODE_KEY);
        const storedMode = getUserSetting(EL_MODE_KEY, 'shop');
        state.mode = MODES.some((entry) => entry.id === storedMode) ? storedMode : 'shop';
        if (pendingNotificationMode && MODES.some((entry) => entry.id === pendingNotificationMode)) state.mode = pendingNotificationMode;
        state.listMode = storedMode === 'add' ? 'input' : (getUserSetting(EL_LIST_MODE_KEY, 'search') === 'input' ? 'input' : 'search');
        state.section = getUserSetting(EL_SECTION_KEY, 'general');
        state.storeDisplay = getUserSetting(EL_STORE_KEY, 'split');
        state.storeNumbers = isSettingTrue(EL_STORE_NUMBERS_KEY, false);
        state.listId = storedListId();
        state.notificationTemplate = getUserSetting(EL_NOTIFY_TEMPLATE_KEY, null) || null;
    }
    try {
        const tokenResult = await auth?.currentUser?.getIdTokenResult?.(true);
        if (!tokenResult?.claims?.appUserId || tokenResult.claims.appUserId !== uid()) {
            root.innerHTML = '<div class="elc text-sm text-amber-700">Anmeldung noch nicht vollständig. Bitte neu anmelden und die Einkaufsliste erneut öffnen.</div>';
            alertUser('Einkaufsliste konnte nicht geladen werden: appUserId-Claim fehlt. Bitte neu anmelden.', 'error');
            return;
        }
        await runInitStep('loadNotificationEnvironment', () => loadNotificationEnvironment());
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
const EL_NOTIFY_TEMPLATE_KEY = 'el_notify_template';
const EL_NOTIFY_PENDING_LIST_KEY = 'einkaufsliste_pending_list';
const EL_NOTIFY_PENDING_MODE_KEY = 'einkaufsliste_pending_mode';

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
    if (!list) {
        state.notificationSettings = null;
        state.notificationCopyTargets = [];
        return;
    }
    state.notificationSettings = normalizeNotificationSettings({}, list.id);
    state.notificationCopyTargets = [];
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
    activeUnsubs.push(onSnapshot(notificationSettingsDoc(list.id), (snap) => {
        state.notificationSettings = normalizeNotificationSettings(snap.exists() ? snap.data() : {}, list.id);
        render();
    }, (error) => reportListenerError('listenActiveList:notificationSettings', error)));
    touchPresence();
    presenceTimer = setInterval(touchPresence, 30000);
}

async function touchPresence() {
    const list = activeList();
    if (!list) return;
    await setDoc(doc(sub(list.id, 'presence'), uid()), { userId: uid(), userName: uname(), currentArea: state.mode === 'manage' ? MANAGE.find((x) => x.id === state.section)?.label || 'Verwaltung' : (state.mode === 'notify' ? 'Benachrichtigungen' : (state.listMode === 'input' ? 'Listenmodus · Eingeben' : 'Listenmodus · Suchen')), lastSeen: serverTimestamp() }, { merge: true });
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
    const order = effectiveStoreOrder();
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

function effectiveStoreOrder(list = activeList()) {
    const storeIds = state.stores.map((s) => s.id).filter(Boolean);
    const base = Array.isArray(list?.storeOrder) ? list.storeOrder.filter((id) => storeIds.includes(id)) : [];
    return [...base, ...storeIds.filter((id) => !base.includes(id))];
}

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
    const scannerText = isArticleMode ? 'Mehrere Codes können gesammelt und gemeinsam gespeichert werden.' : state.scanMode === 'list-add' ? 'Gefundene EANs übernehmen Titel, Einheit, Menge und Details in die Eingabefelder. Hinzugefügt wird erst mit +.' : 'Gefundene EANs öffnen die Mengenübernahme. Der Scan bleibt aktiv.';
    const manualLabel = isArticleMode ? 'Code hinzufügen' : state.scanMode === 'list-add' ? 'Werte übernehmen' : 'Code übernehmen';
    const shellClass = embedded ? 'mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3' : 'elpanel p-4 sm:p-5 space-y-4';
    const titleClass = embedded ? 'text-base font-black text-gray-900' : 'text-xl font-black text-gray-900';
    const videoWrapClass = embedded ? 'elcam mx-auto w-full max-w-[92vw] sm:max-w-[70%]' : 'elcam';
    return `<div class="${shellClass}"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="${titleClass}">${scannerTitle}</div><div class="text-sm text-gray-500">${scannerText}</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-scan">Schließen</button></div><div class="${videoWrapClass}"><video id="el-video" autoplay playsinline muted></video></div><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><input id="el-scan-manual" class="eli" placeholder="${isArticleMode ? 'EAN/QR eingeben oder per Scanner senden' : 'EAN/QR manuell eingeben'}"><button class="elb a w-full sm:w-auto" data-a="manual-scan">${manualLabel}</button></div><div id="el-scan-status" class="text-sm text-gray-500">${escapeHtml(state.scanStatus || 'Kamera wird gestartet...')}</div>${isArticleMode ? `<div class="elc space-y-2"><div class="text-xs font-bold uppercase text-gray-500">Erfasste Codes</div><div id="el-scan-collected" class="elm">${state.scanCodes.length ? state.scanCodes.map((code) => chip(`${escapeHtml(code)} <button type="button" class="elchipbtn" data-a="remove-scanned-code" data-id="${escapeHtml(code)}">×</button>`, 'bg-indigo-100 text-indigo-700')).join(' ') : '<span class="text-sm text-gray-400">Noch keine Codes erfasst.</span>'}</div></div><div class="flex flex-col sm:flex-row justify-end gap-2"><button class="elb bg-emerald-600 text-white w-full sm:w-auto" data-a="save-scanned-codes" ${state.scanCodes.length ? '' : 'disabled'}>OK</button><button class="elb bg-indigo-600 text-white w-full sm:w-auto" data-a="save-scanned-codes-next" ${state.scanCodes.length && nextMissingEanArticle(state.scanArticleId) ? '' : 'disabled'}>Nächsten Artikel ohne EAN</button></div>` : ''}</div>`;
}

function renderActionBar() {
    if (state.mode === 'manage' || state.mode === 'notify') return '';
    if (state.listMode === 'search') {
        return `<div class="elc !p-3 space-y-3"><div class="flex justify-center">${renderModeToggle()}</div><div class="eltitlewrap"><input id="el-search" class="eli eltitleinput" placeholder="Suchen oder scannen..." value="${escapeHtml(state.search)}"><button class="eltitlecam ${state.scanOpen ? 'a' : ''}" data-a="open-scan" title="Scanner ${state.scanOpen ? 'deaktivieren' : 'aktivieren'}">📷</button></div>${renderArticleSuggestionList('search')}${renderPresenceInline()}${state.scanOpen && state.scanMode !== 'article-ean' ? renderScannerPanelActive(true) : ''}</div>`;
    }
    return `<div class="elc !p-3 space-y-3"><div class="flex justify-center">${renderModeToggle()}</div><div class="elinputstack"><div class="elinputgrid"><select id="el-unit" class="els">${UNITS.map((u) => `<option value="${u}" ${state.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select><input id="el-q" class="eli text-center" value="${escapeHtml(state.q)}" placeholder="Menge"><div class="eltitlewrap"><input id="el-title" class="eli eltitleinput" placeholder="Artikel eingeben..." value="${escapeHtml(state.title)}"><button id="el-title-scan" class="eltitlecam ${state.scanOpen ? 'a ' : ''}${String(state.title || '').trim() ? 'h' : ''}" data-a="open-scan" title="Scanner ${state.scanOpen ? 'deaktivieren' : 'aktivieren'}">📷</button></div><button class="elb a !px-0" data-a="add-item" ${!canAdd() ? 'disabled' : ''}>+</button></div><div id="el-title-suggestions">${renderArticleSuggestionList('title')}</div><div class="eldetailhead">${renderPresenceInline()}<button class="eldetailtoggle ${state.inputDetailsOpen ? 'o' : ''}" data-a="toggle-input-details">+ Details</button></div>${state.inputDetailsOpen ? `<div class="eldetailpanel"><div class="eldetailrow"><select id="el-store-add" class="els"><option value="">Geschäft zuordnen...</option>${state.stores.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select><input id="el-note" class="eli" placeholder="Anmerkung optional" value="${escapeHtml(state.note)}"></div>${state.storeIds.length ? `<div class="elm">${state.storeIds.map((id) => chip(`${escapeHtml(state.stores.find((s) => s.id === id)?.name || id)} <button data-a="del-store" data-id="${id}">×</button>`, 'bg-orange-100 text-orange-700')).join(' ')}</div>` : ''}</div>` : ''}${state.scanOpen && state.scanMode !== 'article-ean' ? renderScannerPanelActive(true) : ''}</div></div>`;
}

function renderNotificationCenterLegacy() {
    const list = activeList();
    if (!list) return '<div class="elc text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</div>';
    const cfg = state.notificationSettings || normalizeNotificationSettings({}, list.id);
    const pushSupported = webPushSupported();
    const otherLists = state.lists.filter((entry) => entry.id !== list.id);
    const permissionLabel = notificationPermissionLabel();
    const templateAvailable = !!state.notificationTemplate;
    const subscriptionLabel = pushSupported ? (state.notificationSubscribed ? 'Gerät registriert' : 'Kein Gerät registriert') : 'Nicht verfügbar';
    const webPushHint = state.notificationPublicKey ? '' : '<div class="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Web-Push ist im UI und Backend vorbereitet, aber der öffentliche Web-Push-Schlüssel ist noch nicht konfiguriert. Einstellungen können bereits gespeichert und auf andere Listen übertragen werden.</div>';
    return `<div class="space-y-3"><div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-start"><div><div class="text-xl font-black text-gray-900">Benachrichtigungen</div><div class="text-sm text-gray-500">Pro Liste kannst du jetzt fein steuern, wann und wie Web-Push gesendet wird.</div></div><div class="text-right text-xs font-bold text-gray-500">Liste: ${escapeHtml(list.name)}</div></div><div class="elm"><span class="elnotifytag">Support: ${escapeHtml(pushSupported ? 'Ja' : 'Nein')}</span><span class="elnotifytag">Erlaubnis: ${escapeHtml(permissionLabel)}</span><span class="elnotifytag">Status: ${escapeHtml(subscriptionLabel)}</span></div>${webPushHint}${state.notificationError ? `<div class="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">${escapeHtml(state.notificationError)}</div>` : ''}<div class="flex flex-wrap gap-2"><button class="elb a" data-a="enable-web-push" ${state.notificationBusy ? 'disabled' : ''}>Web-Push aktivieren</button><button class="elb bg-gray-100 text-gray-700" data-a="sync-web-push" ${state.notificationBusy || !pushSupported ? 'disabled' : ''}>Gerät synchronisieren</button><button class="elb bg-red-100 text-red-700" data-a="disable-web-push" ${state.notificationBusy || !pushSupported || !state.notificationSubscribed ? 'disabled' : ''}>Gerät abmelden</button></div></div><div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">Einstellungen für diese Liste</div><button class="elb a" data-a="save-notify-settings">Einstellungen speichern</button></div><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-n-enabled" ${cfg.enabled !== false ? 'checked' : ''}> Benachrichtigungen für diese Liste aktivieren</label><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-n-only-others" ${cfg.onlyOthers !== false ? 'checked' : ''}> Nur bei Änderungen anderer Personen</label><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-n-direct-link" ${cfg.directLink !== false ? 'checked' : ''}> Direktlink in Push mitgeben</label><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-n-push-actions" ${cfg.pushActions !== false ? 'checked' : ''}> Aktionen im Push anzeigen</label><div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3">${NOTIFY_ACTIONS.map((entry) => `<div class="elnotifyrow"><div class="space-y-1"><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-800"><input type="checkbox" id="el-n-event-${entry.id}" ${(cfg.actions?.[entry.id]?.enabled ?? true) ? 'checked' : ''}> ${entry.label}</label><div class="text-xs text-gray-500">${entry.description}</div></div><label class="text-sm font-bold text-gray-700">Intervall in Minuten<input id="el-n-int-${entry.id}" class="eli mt-1 text-center" inputmode="numeric" value="${escapeHtml(String(cfg.actions?.[entry.id]?.intervalMinutes ?? 0))}"></label></div>`).join('')}</div><div class="text-xs font-semibold text-gray-500">0 Minuten = jedes Ereignis einzeln senden. Werte größer als 0 erzeugen Sammelbenachrichtigungen im eingestellten Abstand.</div></div><div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">Vorlage & Übertragung</div><div class="flex flex-wrap gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="save-notify-template">Als Vorlage speichern</button><button class="elb bg-indigo-100 text-indigo-700" data-a="apply-notify-template" ${templateAvailable ? '' : 'disabled'}>Vorlage anwenden</button></div></div><div class="text-sm text-gray-500">Du kannst die aktuelle Konfiguration speichern und auf weitere Listen übertragen.</div>${otherLists.length ? `<div class="elnotifyselect">${otherLists.map((entry) => `<button class="${state.notificationCopyTargets.includes(entry.id) ? 'a' : ''}" data-a="toggle-notify-target" data-id="${entry.id}">${escapeHtml(entry.name)}</button>`).join('')}</div><div class="flex flex-wrap gap-2"><button class="elb a" data-a="copy-notify-settings" ${state.notificationCopyTargets.length ? '' : 'disabled'}>Auf gewählte Listen übertragen</button><button class="elb bg-gray-100 text-gray-700" data-a="clear-notify-targets" ${state.notificationCopyTargets.length ? '' : 'disabled'}>Auswahl leeren</button></div>` : '<div class="text-sm text-gray-400">Keine weiteren Listen zum Übertragen vorhanden.</div>'}</div></div>`;
}

function renderNotificationCenter() {
    const list = activeList();
    if (!list) return '<div class="elc text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</div>';
    const cfg = state.notificationSettings || normalizeNotificationSettings({}, list.id);
    const pushSupported = webPushSupported();
    const otherLists = state.lists.filter((entry) => entry.id !== list.id);
    const permissionLabel = notificationPermissionLabel();
    const templateAvailable = !!state.notificationTemplate;
    const subscriptionLabel = pushSupported ? (state.notificationSubscribed ? 'Gerät registriert' : 'Kein Gerät registriert') : 'Nicht verfügbar';
    const webPushHint = state.notificationPublicKey ? '' : '<div class="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">Web-Push ist im UI und Backend vorbereitet, aber der öffentliche Web-Push-Schlüssel ist noch nicht konfiguriert. Einstellungen können bereits gespeichert und auf andere Listen übertragen werden.</div>';
    const templateTransferContent = otherLists.length
        ? `<div class="elnotifyselect">${otherLists.map((entry) => `<button class="${state.notificationCopyTargets.includes(entry.id) ? 'a' : ''}" data-a="toggle-notify-target" data-id="${entry.id}">${escapeHtml(entry.name)}</button>`).join('')}</div><div class="flex flex-wrap gap-2"><button class="elb a" data-a="copy-notify-settings" ${state.notificationCopyTargets.length ? '' : 'disabled'}>Auf gewählte Listen übertragen</button><button class="elb bg-gray-100 text-gray-700" data-a="clear-notify-targets" ${state.notificationCopyTargets.length ? '' : 'disabled'}>Auswahl leeren</button></div>`
        : '<div class="text-sm text-gray-400">Keine weiteren Listen zum Übertragen vorhanden.</div>';
    return `<div class="space-y-3"><div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-start"><div><div class="text-xl font-black text-gray-900">Benachrichtigungen</div><div class="text-sm text-gray-500">Pro Liste kannst du jetzt fein steuern, wann und wie Web-Push gesendet wird.</div></div><div class="text-right text-xs font-bold text-gray-500">Liste: ${escapeHtml(list.name)}</div></div><div class="elm"><span class="elnotifytag">Support: ${escapeHtml(pushSupported ? 'Ja' : 'Nein')}</span><span class="elnotifytag">Erlaubnis: ${escapeHtml(permissionLabel)}</span><span class="elnotifytag">Status: ${escapeHtml(subscriptionLabel)}</span></div>${webPushHint}${state.notificationError ? `<div class="rounded-2xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">${escapeHtml(state.notificationError)}</div>` : ''}<div class="flex flex-wrap gap-2"><button class="elb a" data-a="enable-web-push" ${state.notificationBusy ? 'disabled' : ''}>Web-Push aktivieren</button><button class="elb bg-gray-100 text-gray-700" data-a="sync-web-push" ${state.notificationBusy || !pushSupported ? 'disabled' : ''}>Gerät synchronisieren</button><button class="elb bg-red-100 text-red-700" data-a="disable-web-push" ${state.notificationBusy || !pushSupported || !state.notificationSubscribed ? 'disabled' : ''}>Gerät abmelden</button></div></div><div class="elc space-y-3"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">Einstellungen für diese Liste</div><button class="elb a" data-a="save-notify-settings">Einstellungen speichern</button></div><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-n-enabled" ${cfg.enabled !== false ? 'checked' : ''}> Benachrichtigungen für diese Liste aktivieren</label><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-n-only-others" ${cfg.onlyOthers !== false ? 'checked' : ''}> Nur bei Änderungen anderer Personen</label><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-n-direct-link" ${cfg.directLink !== false ? 'checked' : ''}> Direktlink in Push mitgeben</label><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-700"><input type="checkbox" id="el-n-push-actions" ${cfg.pushActions !== false ? 'checked' : ''}> Aktionen im Push anzeigen</label><div class="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3">${NOTIFY_ACTIONS.map((entry) => `<div class="elnotifyrow"><div class="space-y-1"><label class="inline-flex items-center gap-2 text-sm font-bold text-gray-800"><input type="checkbox" id="el-n-event-${entry.id}" ${(cfg.actions?.[entry.id]?.enabled ?? true) ? 'checked' : ''}> ${entry.label}</label><div class="text-xs text-gray-500">${entry.description}</div></div><label class="text-sm font-bold text-gray-700">Intervall in Minuten<input id="el-n-int-${entry.id}" class="eli mt-1 text-center" inputmode="numeric" value="${escapeHtml(String(cfg.actions?.[entry.id]?.intervalMinutes ?? 0))}"></label></div>`).join('')}</div><div class="text-xs font-semibold text-gray-500">0 Minuten = jedes Ereignis einzeln senden. Werte größer als 0 erzeugen Sammelbenachrichtigungen im eingestellten Abstand.</div></div><details class="elc"><summary class="cursor-pointer text-sm font-black text-gray-900">Vorlage & Übertragung</summary><div class="mt-3 space-y-3"><div class="flex flex-wrap gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="save-notify-template">Als Vorlage speichern</button><button class="elb bg-indigo-100 text-indigo-700" data-a="apply-notify-template" ${templateAvailable ? '' : 'disabled'}>Vorlage anwenden</button></div><div class="text-sm text-gray-500">Du kannst die aktuelle Konfiguration speichern und auf weitere Listen übertragen.</div>${templateTransferContent}</div></details></div>`;
}

function storeNumberMap(list = activeList()) {
    const order = effectiveStoreOrder(list);
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
    const storeOrder = effectiveStoreOrder();
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

function articleHasBarcode(article) {
    return !!(article?.eanCodes?.length || article?.variants?.some((v) => v?.eanCodes?.length));
}

function metaIconSvg(kind) {
    const icons = {
        barcode: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 5h1v14H3V5Zm3 0h2v14H6V5Zm4 0h1v14h-1V5Zm3 0h3v14h-3V5Zm5 0h1v14h-1V5Z"/></svg>',
        note: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 1.5V9h4.5L14 4.5ZM8 12h8v1.5H8V12Zm0 4h8v1.5H8V16Z"/></svg>',
        store: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4h16l1 4a3 3 0 0 1-2 2.82V20a1 1 0 0 1-1 1h-4v-6h-4v6H6a1 1 0 0 1-1-1v-9.18A3 3 0 0 1 3 8l1-4Zm3 7v8h2v-6h6v6h2v-8H7Z"/></svg>',
        quantity: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 7h16v2H4V7Zm0 4h10v2H4v-2Zm0 4h7v2H4v-2Zm12-8h4v10h-4V7Zm1.5 1.5v7h1V8.5h-1Z"/></svg>',
        category: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v3H4V5Zm0 6h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z"/></svg>'
    };
    return icons[kind] || '';
}

function renderMetaIcons({ hasBarcode = false, hasNote = false, hasStores = false, hasQuantity = false, hasCategory = false } = {}) {
    const icons = [];
    if (hasBarcode) icons.push(`<span class="elmetaicon elmetaicon-barcode" title="Barcode hinterlegt">${metaIconSvg('barcode')}</span>`);
    if (hasNote) icons.push(`<span class="elmetaicon elmetaicon-note" title="Anmerkung hinterlegt">${metaIconSvg('note')}</span>`);
    if (hasStores) icons.push(`<span class="elmetaicon elmetaicon-store" title="Geschäfte zugeordnet">${metaIconSvg('store')}</span>`);
    if (hasQuantity) icons.push(`<span class="elmetaicon elmetaicon-qty" title="Mengen-Vorschlag hinterlegt">${metaIconSvg('quantity')}</span>`);
    if (hasCategory) icons.push(`<span class="elmetaicon elmetaicon-category" title="Kategorie hinterlegt">${metaIconSvg('category')}</span>`);
    return icons.length ? `<span class="elmetaicons">${icons.join('')}</span>` : '';
}

function renderArticleMetaIcons(article) {
    return renderMetaIcons({
        hasBarcode: articleHasBarcode(article),
        hasNote: !!(article?.persistentNotes?.length),
        hasStores: !!(article?.storeIds?.length),
        hasQuantity: !!(Number(article?.defaultQuantity || 0) > 0 || article?.defaultUnit),
        hasCategory: !!article?.categoryId
    });
}

function renderItemMetaIcons(item) {
    const article = state.articles.find((a) => a.id === item.articleId);
    return renderMetaIcons({
        hasBarcode: !!((item.eanCodes || []).length || articleHasBarcode(article)),
        hasNote: !!(item.note || item.persistentNote || article?.persistentNotes?.length),
        hasStores: !!((item.storeIds || []).length || article?.storeIds?.length),
        hasQuantity: !!(Number(article?.defaultQuantity || item.quantity || 0) > 0 || article?.defaultUnit || item.unit),
        hasCategory: !!(item.categoryId || article?.categoryId)
    });
}

function listSuggestionArticles() {
    const articleIds = new Set();
    const titles = new Set();
    state.items.filter((item) => item.status !== 'checked').forEach((item) => {
        const articleId = String(item.articleId || '').trim();
        const title = String(item.title || '').trim().toLowerCase();
        if (articleId) articleIds.add(articleId);
        if (title) titles.add(title);
    });
    return state.articles.filter((article) => articleIds.has(String(article.id || '').trim()) || titles.has(String(article.title || '').trim().toLowerCase()));
}

function articleSuggestions(term, field = 'title') {
    const query = String(term || '').trim().toLowerCase();
    if (!query) return [];
    const source = field === 'search' ? listSuggestionArticles() : state.articles;
    return source
        .map((article) => {
            const title = String(article.title || '').toLowerCase();
            if (!title.includes(query)) return null;
            const startsWith = title.startsWith(query) ? 0 : 1;
            return { article, startsWith, lengthDelta: Math.abs(title.length - query.length) };
        })
        .filter(Boolean)
        .sort((a, b) => a.startsWith - b.startsWith || a.lengthDelta - b.lengthDelta || String(a.article.title || '').localeCompare(String(b.article.title || ''), 'de'))
        .slice(0, 8)
        .map((entry) => entry.article);
}

function renderArticleSuggestionList(field) {
    const term = field === 'search' ? state.search : state.title;
    const suggestions = articleSuggestions(term, field);
    if (!suggestions.length) return '';
    const action = field === 'search' ? 'pick-search-suggestion' : 'pick-title-suggestion';
    return `<div class="elsuggest">${suggestions.map((article) => `<button type="button" class="elsuggest-btn" data-a="${action}" data-id="${article.id}"><span class="min-w-0 flex-1"><span class="block truncate text-sm font-bold text-slate-800">${escapeHtml(article.title || '')}</span><span class="block truncate text-[11px] text-slate-500">${fmtQty(article.defaultQuantity || 1)} ${escapeHtml(article.defaultUnit || 'Stück')}${article.categoryId ? ` · ${escapeHtml(state.categories.find((c) => c.id === article.categoryId)?.name || 'Ohne Kategorie')}` : ''}</span></span>${renderArticleMetaIcons(article)}</button>`).join('')}</div>`;
}

function articlePrefillNote(article) {
    return String((article?.persistentNotes || []).map((entry) => String(entry || '').trim()).filter(Boolean).join(' · ')).trim();
}

function parseDetailPersistentNotes(value) {
    return Array.from(new Set(String(value || '').split(/\n|\s+[·•]\s+/).map((entry) => String(entry || '').trim()).filter(Boolean)));
}

function buildDetailPersistentNoteValue(entries) {
    return (entries || []).map((entry) => String(entry || '').trim()).filter(Boolean).join(' · ');
}

function initDetailDraft(item, article = state.articles.find((entry) => entry.id === item?.articleId)) {
    if (!item) { state.detailDraft = null; return; }
    const activeNotes = parseDetailPersistentNotes(item.persistentNote);
    const articleNotes = Array.from(new Set((article?.persistentNotes || []).map((entry) => String(entry || '').trim()).filter(Boolean)));
    state.detailDraft = {
        itemId: item.id,
        title: String(item.title || ''),
        quantity: formatEditableQty(item.quantity || '1'),
        categoryId: String(item.categoryId || ''),
        note: String(item.note || ''),
        storeId: String(item.storeIds?.[0] || ''),
        persistentNotes: [...activeNotes],
        removedPersistentNotes: articleNotes.filter((entry) => !activeNotes.includes(entry))
    };
}

function prefillInputFromArticle(article) {
    if (!article) return;
    const note = articlePrefillNote(article);
    state.title = String(article.title || '');
    state.q = formatEditableQty(article.defaultQuantity || 1) || '1';
    state.unit = String(article.defaultUnit || 'Stück');
    state.storeIds = [...(article.storeIds || [])];
    state.note = note;
    state.inputDetailsOpen = !!(state.storeIds.length || note);
}

function updateInputTitleUi() {
    if (state.listMode !== 'input') return;
    const suggestionHost = root?.querySelector('#el-title-suggestions');
    if (suggestionHost) suggestionHost.innerHTML = renderArticleSuggestionList('title');
    const scanButton = root?.querySelector('#el-title-scan');
    if (scanButton) scanButton.classList.toggle('h', !!String(state.title || '').trim());
}

function renderPresenceInline() {
    if (!activeList()) return '';
    return `<div class="elpresence">${state.presence.length ? state.presence.map((p) => chip(`${escapeHtml(p.userName || p.userId)} (${escapeHtml(p.currentArea || 'Liste')})`, 'bg-emerald-100 text-emerald-700')).join(' ') : '<span class="text-xs text-gray-400">Niemand sonst gerade aktiv.</span>'}</div>`;
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
    state.scanStatus = mode === 'article-ean' ? 'Kamera wird für die EAN-Erfassung gestartet...' : mode === 'list-add' ? 'Kamera wird gestartet. Gefundene EANs übernehmen die Eingabefelder...' : 'Kamera wird gestartet. Gefundene EANs öffnen die Mengenübernahme...';
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
    const shopControls = state.mode === 'shop'
        ? `<div class="flex flex-wrap justify-between gap-2 items-start"><div class="flex flex-wrap gap-2 text-xs">${list ? `${list.ownerId === uid() ? chip('Owner', 'bg-indigo-100 text-indigo-700') : chip(permActive(perm()) ? 'freigegeben' : 'abgelaufen', permActive(perm()) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')} ${chip(`Letztes Update ${dt(list.updatedAt)}`)} ${chip(`Von ${escapeHtml(list.updatedByName || list.ownerName || '—')}`)}` : '<span class="text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</span>'}</div><div class="flex flex-wrap gap-2">${list ? `<button class="elb bg-gray-100 text-gray-700" data-a="store-display">${state.storeDisplay === 'split' ? 'Nach Geschäft' : 'Kombiniert'}</button>` : ''}</div></div><div class="flex flex-wrap justify-between gap-2 items-center"><label class="inline-flex items-center gap-2 text-xs font-bold text-gray-600"><input id="el-store-numbers" type="checkbox" ${state.storeNumbers ? 'checked' : ''}> Geschäfte nummerieren</label><div class="text-xs text-gray-400">${list ? `${state.stores.length} Geschäfte verfügbar` : 'Keine Liste ausgewählt.'}</div></div>`
        : `<div class="flex flex-wrap gap-2 text-xs">${list ? `${list.ownerId === uid() ? chip('Owner', 'bg-indigo-100 text-indigo-700') : chip(permActive(perm()) ? 'freigegeben' : 'abgelaufen', permActive(perm()) ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')} ${chip(`Letztes Update ${dt(list.updatedAt)}`)} ${chip(`Von ${escapeHtml(list.updatedByName || list.ownerName || '—')}`)}` : '<span class="text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</span>'}</div>`;
    return `<div class="space-y-3"><div>${renderListSelect()}</div>${shopControls}<div class="space-y-2 text-xs text-gray-600"><div class="font-semibold text-gray-600">${activityText}</div></div></div>`;
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
        ${state.mode === 'shop' ? renderChecked() : ''}
    `;
    renderModePicker();
    renderSettings();
    renderPurchase();
    renderDetail();
    renderStoreCategoryEditorActive();
    renderArticle();
    renderScannerActive();
    renderUnknown();
    applyPendingFocus();
}

function renderBody() {
    const list = activeList();
    if (!list) return '<div class="elc text-sm text-gray-500">Bitte zuerst eine Liste auswählen.</div>';
    if (state.mode === 'shop') {
        return `<div class="space-y-3"><div class="elc"><div class="grid grid-cols-[90px_110px_minmax(0,1fr)] gap-2"><input id="el-q" class="eli" value="${escapeHtml(state.q)}"><select id="el-unit" class="els">${UNITS.map((u) => `<option value="${u}" ${state.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select><input id="el-title" class="eli" placeholder="Artikel eingeben..." value="${escapeHtml(state.title)}"></div><div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><select id="el-store-add" class="els"><option value="">Geschäft zuordnen...</option>${state.stores.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select><input id="el-note" class="eli" placeholder="Anmerkung optional" value="${escapeHtml(state.note)}"><button class="elb a" data-a="add-item" ${!canAdd() ? 'disabled' : ''}>+ Hinzufügen</button></div>${state.storeIds.length ? `<div class="elm">${state.storeIds.map((id) => chip(`${escapeHtml(state.stores.find((s) => s.id === id)?.name || id)} <button data-a="del-store" data-id="${id}">×</button>`, 'bg-orange-100 text-orange-700')).join(' ')}</div>` : '<div class="text-xs text-gray-400">Optional einem oder mehreren Geschäften zuordnen.</div>'}</div>`;
    }
    if (state.mode === 'shop') return `<div class="space-y-3">${groupedOpen().map((g) => `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-center"><div class="font-black text-sm">${escapeHtml(g.label)}</div><div class="text-xs font-bold text-gray-600">${g.items.length} offen</div></div>${g.note ? `<div class="text-xs rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-orange-800">${escapeHtml(g.note)}</div>` : ''}${g.items.length ? g.items.map(renderItem).join('') : '<div class="py-3 text-sm text-gray-400">Keine offenen Artikel.</div>'}</div>`).join('') || '<div class="elc text-sm text-gray-400">Keine Artikel gefunden.</div>'}</div>`;
    if (state.mode === 'notify') return renderNotificationCenter();
    if (!canManage()) return '<div class="elc text-sm text-red-700">Keine Verwaltungsberechtigung für diese Liste.</div>';
    if (state.section === 'general') return `<div class="space-y-3"><div class="elc"><div class="elstat"><div><div class="text-[11px] font-bold uppercase text-gray-500">Aktive Listen</div><div class="text-xl font-black text-indigo-700">${state.lists.filter((l) => l.active !== false).length}</div></div><div><div class="text-[11px] font-bold uppercase text-gray-500">Offene Artikel</div><div class="text-xl font-black text-orange-700">${state.items.filter((x) => x.status !== 'checked').length}</div></div><div><div class="text-[11px] font-bold uppercase text-gray-500">Letztes Update</div><div class="text-sm font-black text-slate-700">${dt(activeList()?.updatedAt)}</div></div></div></div>${state.lists.map((l) => `<div class="elc"><div class="flex justify-between gap-2"><div><div class="font-bold text-sm">${escapeHtml(l.name)}</div><div class="text-xs text-gray-500">${dt(l.updatedAt)} · ${escapeHtml(l.updatedByName || l.ownerName || '—')}</div></div><div class="text-xs font-bold text-gray-600">${l.id === state.listId ? state.items.filter((x) => x.status !== 'checked').length : 0} offen</div></div></div>`).join('')}</div>`;
    if (state.section === 'stores') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-store" class="eli" placeholder="Neues Geschäft" value="${escapeHtml(state.drafts.store)}"><button class="elb a" data-a="add-store" ${!canManageWrite() ? 'disabled' : ''}>+ Geschäft</button></div>${effectiveStoreOrder(activeList()).map((id, i, arr) => { const s = state.stores.find((x) => x.id === id); if (!s) return ''; const categoryNames = (s.categoryOrder || []).map((catId) => state.categories.find((c) => c.id === catId)?.name).filter(Boolean); return `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-start"><div><div class="font-bold text-sm">${escapeHtml(s.name)}</div><div class="text-xs text-gray-500">${categoryNames.length ? `${categoryNames.length} Kategorie(n) für Sortierung gewählt` : 'Noch keine Kategorien ausgewählt'}</div></div><div class="flex flex-wrap gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="store-up" data-id="${s.id}" ${i === 0 || !canManageWrite() ? 'disabled' : ''}>↑</button><button class="elb bg-gray-100 text-gray-700" data-a="store-down" data-id="${s.id}" ${i === arr.length - 1 || !canManageWrite() ? 'disabled' : ''}>↓</button><button class="elb bg-indigo-100 text-indigo-700" data-a="open-store-categories" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Kategorienwartung</button><button class="elb bg-red-600 text-white" data-a="del-store-master" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div></div><div class="elm">${categoryNames.length ? categoryNames.map((name) => chip(escapeHtml(name), 'bg-indigo-100 text-indigo-700')).join(' ') : '<span class="text-xs text-gray-400">Keine Kategorien sortiert.</span>'}</div></div>`; }).join('')}</div>`;
    if (state.section === 'articles') return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-article-search" class="eli" placeholder="Artikel suchen..." value="${escapeHtml(state.articleSearch)}"><label class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold bg-slate-100 text-slate-700"><input type="checkbox" id="el-missing-ean" ${state.missingEanOnly ? 'checked' : ''}> Ohne EAN</label><button class="elb a" data-a="open-article" ${!canManageWrite() ? 'disabled' : ''}>+ Artikel</button></div>${filteredManageArticles().map((a) => { const hasAnyEan = articleHasBarcode(a); return `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-center"><div><div class="flex flex-wrap items-center gap-2"><div class="font-bold text-sm">${escapeHtml(a.title)}</div>${renderArticleMetaIcons(a)}</div><div class="text-xs text-gray-500">${fmtQty(a.defaultQuantity || 1)} ${escapeHtml(a.defaultUnit || 'Stück')} · ${escapeHtml(state.categories.find((c) => c.id === a.categoryId)?.name || 'Ohne Kategorie')}</div></div><div class="flex flex-wrap gap-2">${hasAnyEan ? chip('EAN OK', 'bg-emerald-100 text-emerald-700') : `<button class="elb bg-red-100 text-red-700" data-a="capture-ean" data-id="${a.id}" ${!canManageWrite() ? 'disabled' : ''}>ohne EAN</button>`}<button class="elb bg-gray-100 text-gray-700" data-a="edit-article" data-id="${a.id}" ${!canManageWrite() ? 'disabled' : ''}>Bearbeiten</button></div></div><div class="text-xs text-gray-600">${escapeHtml((a.persistentNotes || []).join(' · ')) || '<span class="text-gray-400">Keine permanente Anmerkung.</span>'}</div><div class="elm">${(a.eanCodes || []).length ? (a.eanCodes || []).map((code) => chip(escapeHtml(code))).join(' ') : '<span class="text-xs text-gray-400">Keine Haupt-EAN</span>'}</div></div>`; }).join('') || '<div class="elc text-sm text-gray-400">Keine Artikel gefunden.</div>'}</div>`;
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
    if (state.mode === 'notify') return renderBody();
    if (!canManage()) return '<div class="elc text-sm text-red-700">Keine Verwaltungsberechtigung für diese Liste.</div>';
    if (state.section === 'stores') {
        return `<div class="space-y-3"><div class="elc flex flex-wrap gap-2"><input id="el-draft-store" class="eli" placeholder="Neues Geschäft" value="${escapeHtml(state.drafts.store)}"><button class="elb a" data-a="add-store" ${!canManageWrite() ? 'disabled' : ''}>+ Geschäft</button></div>${effectiveStoreOrder(activeList()).map((id, i, arr) => { const s = state.stores.find((x) => x.id === id); if (!s) return ''; const categoryNames = (s.categoryOrder || []).map((catId) => state.categories.find((c) => c.id === catId)?.name).filter(Boolean); return `<div class="elc space-y-2"><div class="flex flex-wrap justify-between gap-2 items-start"><div><div class="font-bold text-sm">${escapeHtml(s.name)}</div><div class="text-xs text-gray-500">${categoryNames.length ? `${categoryNames.length} Kategorie(n) für Sortierung gewählt` : 'Noch keine Kategorien ausgewählt'}</div></div><div class="flex flex-wrap gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="store-up" data-id="${s.id}" ${i === 0 || !canManageWrite() ? 'disabled' : ''}>↑</button><button class="elb bg-gray-100 text-gray-700" data-a="store-down" data-id="${s.id}" ${i === arr.length - 1 || !canManageWrite() ? 'disabled' : ''}>↓</button><button class="elb bg-indigo-100 text-indigo-700" data-a="open-store-categories" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Kategorienwartung</button><button class="elb bg-red-600 text-white" data-a="del-store-master" data-id="${s.id}" ${!canManageWrite() ? 'disabled' : ''}>Löschen</button></div></div><div class="flex flex-wrap items-center gap-1.5 text-xs">${categoryNames.length ? categoryNames.map((name, index) => `${index ? '<span class="font-black text-slate-400">→</span>' : ''}${chip(escapeHtml(name), 'bg-indigo-100 text-indigo-700')}`).join(' ') : '<span class="text-xs text-gray-400">Keine Kategorien sortiert.</span>'}</div></div>`; }).join('')}</div>`;
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
    return `<div class="elitem border-t border-gray-100"><button type="button" class="text-left min-w-0 flex-1" data-a="edit-item" data-id="${item.id}" title="Doppelklick für Bearbeitungsaktionen"><div class="flex flex-wrap gap-2 items-center"><div class="font-bold text-sm text-gray-900 truncate flex-1">${escapeHtml(ell(item.title, 40))}</div>${renderItemMetaIcons(item)}${chip(`${fmtQty(item.quantity)} ${escapeHtml(item.unit || '')}`, 'bg-indigo-50 text-indigo-700')}${state.categories.find((c) => c.id === item.categoryId) ? chip(escapeHtml(state.categories.find((c) => c.id === item.categoryId).name), 'bg-amber-50 text-amber-700') : ''}${locked ? chip(`gesperrt von ${escapeHtml(lock.userName || lock.userId)}`, 'bg-red-100 text-red-700') : ''}${restItem ? chip('Rest', 'bg-orange-100 text-orange-800 ring-1 ring-orange-300') : ''}</div><div class="text-xs text-gray-500 mt-1">${escapeHtml(stores)}${item.restoredAt ? ` · Wiederhergestellt von ${escapeHtml(item.restoredByName || '—')} · ${dt(item.restoredAt)}` : ''}</div>${item.persistentNote ? `<div class="text-xs text-gray-600 mt-2">${escapeHtml(item.persistentNote)}</div>` : ''}${item.note ? `<div class="text-xs text-gray-600 mt-1">${escapeHtml(item.note)}</div>` : ''}</button><div class="flex items-center justify-end gap-1 sm:gap-2 flex-wrap sm:flex-nowrap">${qtyActionVisible ? `<button class="elaction elaction-qty text-[11px] sm:text-xs px-2 sm:px-3 whitespace-nowrap" data-a="quantity" data-id="${item.id}" title="Menge übernehmen"><span class="sm:hidden">Menge</span><span class="hidden sm:inline">Menge übernehmen</span></button>` : ''}${controls}</div></div>`;
}

function renderChecked() {
    const done = state.items.filter((x) => x.status === 'checked').sort((a, b) => (toDate(b.checkedAt)?.getTime() || 0) - (toDate(a.checkedAt)?.getTime() || 0));
    return `<div class="elc !p-0 overflow-visible"><div class="flex items-center justify-between gap-2 px-3 py-3"><button class="flex min-w-0 flex-1 items-center gap-2 text-left" data-a="toggle-checked-section"><div class="font-black text-sm text-gray-900">Abgehakt-Liste</div><div class="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-[11px] font-black text-slate-700">${done.length}</div><div class="ml-auto text-sm font-black text-slate-400">${state.checkedOpen ? '⌃' : '⌄'}</div></button><div class="flex items-center gap-2"><div class="relative"><button class="elb bg-gray-100 text-gray-700 !px-2 text-base leading-none" data-a="toggle-checked-menu" title="Mehr Optionen" ${!done.length ? 'disabled' : ''}>⋮</button>${state.checkedMenuOpen && done.length ? `<div class="absolute right-0 top-full z-20 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"><button class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50" data-a="delete-all-checked">Alle Einträge löschen</button></div>` : ''}</div></div></div>${state.checkedOpen ? `<div class="border-t border-gray-100 px-3 pb-3 pt-3 space-y-3">${done.length ? done.map((item) => { const restItem = isRestItem(item); return `<div class="elitem border-t border-gray-100 first:border-t-0"><button class="text-left min-w-0" data-a="detail" data-id="${item.id}"><div class="flex flex-wrap gap-2 items-center"><div class="font-bold text-sm text-gray-800 truncate">${escapeHtml(ell(item.title, 40))}</div>${restItem ? chip('Rest', 'bg-orange-100 text-orange-800 ring-1 ring-orange-300') : ''}</div><div class="text-xs text-gray-500 mt-1">Von ${escapeHtml(item.checkedByName || '—')} · ${dt(item.checkedAt)}</div></button><div class="flex items-center gap-2"><button class="elcheck" data-a="restore" data-id="${item.id}" title="2x schnell = wiederherstellen">↺</button><button class="elcheck bg-red-50 text-red-700" data-a="delete-checked-item" data-id="${item.id}" title="Dauerhaft löschen">×</button></div></div>`; }).join('') : '<div class="py-2 text-sm text-gray-400">Noch nichts abgehakt.</div>'}</div>` : ''}</div>`;
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
    if (!item) { state.detailDraft = null; el.innerHTML = ''; return; }
    if (!state.detailDraft || state.detailDraft.itemId !== item.id) initDetailDraft(item, article);
    const draft = state.detailDraft || { itemId: item.id, title: String(item.title || ''), quantity: formatEditableQty(item.quantity || '1'), categoryId: String(item.categoryId || ''), note: String(item.note || ''), storeId: String(item.storeIds?.[0] || ''), persistentNotes: parseDetailPersistentNotes(item.persistentNote), removedPersistentNotes: [] };
    const activeNotes = draft.persistentNotes || [];
    const removedNotes = draft.removedPersistentNotes || [];
    el.innerHTML = `<div class="elpanel p-4 sm:p-5 space-y-4"><div class="flex flex-wrap justify-between gap-2 items-start"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><div class="text-xl font-black text-gray-900">Produkt bearbeiten</div>${isRestItem(item) ? chip('REST', 'bg-orange-100 text-orange-800 ring-1 ring-orange-300') : ''}</div><div class="text-sm text-gray-500">${isRestItem(item) ? `Automatisch angelegt als Rest von ${escapeHtml(String(item.title || '').replace(/^Rest von\s+/i, '').trim() || item.title || 'Artikel')}.` : 'Über das Zahnradsymbol des Eintrags wird dieses Fenster geöffnet.'}</div></div><button class="elb bg-gray-100 text-gray-700" data-a="close-detail">Schließen</button></div>${isRestItem(item) ? '<div class="rounded-2xl border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-800">Dieser Eintrag ist ein automatisch erzeugter Rest-Eintrag und kann wie jeder andere Eintrag bearbeitet oder gelöscht werden.</div>' : ''}<div class="space-y-2"><div class="text-xs font-black uppercase text-gray-500">Geschäft zuordnen</div><select id="el-d-store" class="els" ${!canEditItems() ? 'disabled' : ''}><option value="">Keine Zuordnung</option>${state.stores.map((store) => `<option value="${store.id}" ${draft.storeId === store.id ? 'selected' : ''}>${escapeHtml(store.name)}</option>`).join('')}</select></div><div class="grid gap-3 sm:grid-cols-2"><input id="el-d-title" class="eli" value="${escapeHtml(draft.title || '')}" ${!canEditItems() ? 'disabled' : ''}><input id="el-d-qty" class="eli" value="${escapeHtml(draft.quantity || '')}" ${!canEditItems() ? 'disabled' : ''}></div><div class="grid gap-3 sm:grid-cols-2"><select id="el-d-cat" class="els" ${!canEditItems() ? 'disabled' : ''}><option value="">Kategorie wählen...</option>${state.categories.map((c) => `<option value="${c.id}" ${draft.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select><div class="flex items-center rounded-2xl border border-gray-200 bg-slate-50 px-3 text-sm font-bold text-gray-600">Einheit: ${escapeHtml(item.unit || 'Stück')}</div></div><textarea id="el-d-note" class="elt" placeholder="Anmerkung für diese Position" ${!canEditItems() ? 'disabled' : ''}>${escapeHtml(draft.note || '')}</textarea><div class="space-y-2"><div class="text-xs font-black uppercase text-gray-500">Gespeicherte Anmerkungen</div>${activeNotes.length ? `<div class="elm">${activeNotes.map((entry, index) => chip(`${escapeHtml(entry)} ${canEditItems() ? `<button type="button" class="elchipbtn" data-a="remove-detail-pnote" data-index="${index}">×</button>` : ''}`, 'bg-indigo-100 text-indigo-700')).join(' ')}</div>` : '<div class="text-sm text-gray-400">Keine gespeicherte Anmerkung aktiv.</div>'}</div>${removedNotes.length ? `<div class="space-y-2"><div class="text-xs font-black uppercase text-gray-500">Entfernte Anmerkungen wiederherstellen</div><div class="elm">${removedNotes.map((entry, index) => chip(`${escapeHtml(entry)} ${canEditItems() ? `<button type="button" class="elchipbtn" data-a="restore-detail-pnote" data-index="${index}">↺</button>` : ''}`, 'bg-slate-100 text-slate-700')).join(' ')}</div></div>` : ''}<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><select id="el-d-move-list" class="els" ${!otherLists.length || !canEditItems() ? 'disabled' : ''}><option value="">Auf andere Liste verschieben...</option>${otherLists.map((list) => `<option value="${list.id}">${escapeHtml(list.name)}</option>`).join('')}</select><button class="elb bg-gray-100 text-gray-700" data-a="move-detail" ${!otherLists.length || !canEditItems() ? 'disabled' : ''}>Verschieben</button></div><div class="elc space-y-2 bg-slate-50 text-sm"><div><b>Artikel:</b> ${escapeHtml(article?.title || item.title || '—')}</div><div><b>Status:</b> ${escapeHtml(item.status || 'open')}</div><div><b>Erfasst:</b> ${dt(item.createdAt)}</div><div><b>Gekauft:</b> ${item.checkedAt ? `${dt(item.checkedAt)} · ${escapeHtml(item.checkedByName || '—')}` : '—'}</div>${item.restoredAt ? `<div><b>Wiederhergestellt:</b> ${dt(item.restoredAt)} · ${escapeHtml(item.restoredByName || '—')}</div>` : ''}${item.purchasedQuantity ? `<div><b>Gekauft-Menge:</b> ${fmtQty(item.purchasedQuantity)}</div>` : ''}</div><div class="flex flex-wrap justify-end gap-2"><button class="elb bg-gray-100 text-gray-700" data-a="close-detail">Schließen</button>${canEditItems() ? '<button class="elb bg-red-600 text-white" data-a="delete-detail-item">Löschen</button><button class="elb a" data-a="save-detail">Speichern</button>' : ''}</div></div>`;
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
     if (t.id === 'el-title') { state.title = t.value; updateInputTitleUi(); return; }
     if (t.id === 'el-note') state.note = t.value;
     if (t.id === 'el-search') { state.search = t.value; requestFocusAfterRender('el-search', t.selectionStart, t.selectionEnd); render(); return; }
     if (t.id === 'el-article-search') { state.articleSearch = t.value; requestFocusAfterRender('el-article-search', t.selectionStart, t.selectionEnd); render(); return; }
     if (String(t.id || '').startsWith('el-n-int-')) {
         const key = String(t.id).replace('el-n-int-', '');
         if (state.notificationSettings?.actions?.[key]) state.notificationSettings.actions[key].intervalMinutes = normalizeNotificationInterval(t.value, state.notificationSettings.actions[key].intervalMinutes);
         return;
     }
     if (t.id === 'el-draft-store') state.drafts.store = t.value;
     if (t.id === 'el-draft-category') state.drafts.category = t.value;
     if (t.id === 'el-draft-remark') state.drafts.remark = t.value;
     if (t.id === 'el-draft-note') state.drafts.note = t.value;
     if (t.id === 'el-c-from') state.collab.accessFrom = t.value;
     if (t.id === 'el-c-until') state.collab.accessUntil = t.value;
     if (t.id === 'el-d-title' && state.detailDraft) { state.detailDraft.title = t.value; return; }
     if (t.id === 'el-d-qty' && state.detailDraft) { state.detailDraft.quantity = t.value; return; }
     if (t.id === 'el-d-note' && state.detailDraft) { state.detailDraft.note = t.value; return; }
 }

 function onChange(e) {
     const t = e.target;
     if (t.id === 'el-unit') state.unit = t.value;
     if (t.id === 'el-d-cat' && state.detailDraft) { state.detailDraft.categoryId = t.value; return; }
     if (t.id === 'el-d-store' && state.detailDraft) { state.detailDraft.storeId = t.value; return; }
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
     if (t.id === 'el-n-enabled' && state.notificationSettings) state.notificationSettings.enabled = t.checked;
     if (t.id === 'el-n-only-others' && state.notificationSettings) state.notificationSettings.onlyOthers = t.checked;
     if (t.id === 'el-n-direct-link' && state.notificationSettings) state.notificationSettings.directLink = t.checked;
     if (t.id === 'el-n-push-actions' && state.notificationSettings) state.notificationSettings.pushActions = t.checked;
     if (String(t.id || '').startsWith('el-n-event-') && state.notificationSettings) {
         const key = String(t.id).replace('el-n-event-', '');
         if (state.notificationSettings.actions?.[key]) state.notificationSettings.actions[key].enabled = t.checked;
     }
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
    return await addDoc(master(name), { [key]: v, createdBy: uid(), createdByName: uname(), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
    const persistentNote = articlePrefillNote(article);
    const note = String(state.note || '').trim();
    const itemNote = note && note === persistentNote ? '' : note;
    await addDoc(sub(state.listId, 'items'), { articleId: article.id, title: article.title, quantity, unit: state.unit, categoryId: article.categoryId || '', storeIds: [...state.storeIds], status: 'open', note: itemNote, persistentNote, eanCodes: article.eanCodes || [], createdAt: serverTimestamp(), createdBy: uid(), createdByName: uname() });
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname(), storeOrder: effectiveStoreOrder() });
    await logActivity('Artikel hinzugefügt', { title, quantity, unit: state.unit });
    state.q = '1'; state.unit = 'Stück'; state.title = ''; state.note = ''; state.storeIds = []; state.inputDetailsOpen = false; render();
}

async function saveDetailItem() {
    const item = state.items.find((x) => x.id === state.detailId);
    if (!item) return;
    if (!canEditItems()) return alertUser('Keine Berechtigung zum Bearbeiten.', 'error');
    if (!(await acquireLock(item.id))) return;
    const draft = state.detailDraft?.itemId === item.id ? state.detailDraft : null;
    const title = String(draft?.title ?? document.getElementById('el-d-title')?.value ?? '').trim();
    const quantity = parseQty((draft?.quantity ?? document.getElementById('el-d-qty')?.value) || String(item.quantity || '1'));
    const categoryId = String((draft?.categoryId ?? document.getElementById('el-d-cat')?.value) || '');
    const note = String((draft?.note ?? document.getElementById('el-d-note')?.value) || '').trim();
    const storeId = String(draft?.storeId || '').trim();
    const persistentNote = buildDetailPersistentNoteValue(draft?.persistentNotes || parseDetailPersistentNotes(item.persistentNote));
    if (!title) return alertUser('Bitte Produktnamen eingeben.', 'error');
    const itemData = { title, quantity, categoryId, note, persistentNote, storeIds: storeId ? [storeId] : [] };
    await updateDoc(doc(sub(state.listId, 'items'), item.id), itemData);
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() });
    await logActivity('Artikel bearbeitet', { itemId: item.id, title, quantity });
    Object.assign(item, itemData);
    render();
}

async function moveDetailItem() {
    const item = state.items.find((x) => x.id === state.detailId);
    if (!item) return;
    if (!canEditItems()) return alertUser('Keine Berechtigung zum Verschieben.', 'error');
    const targetListId = String(document.getElementById('el-d-move-list')?.value || '').trim();
    if (!targetListId) return alertUser('Bitte zuerst eine Zielliste auswählen.', 'info');
    if (targetListId === state.listId) return alertUser('Bitte eine andere Liste auswählen.', 'info');
    const targetList = state.lists.find((x) => x.id === targetListId);
    if (!targetList) return alertUser('Zielliste wurde nicht gefunden.', 'error');
    if (!(canAdd(targetList) || canShop(targetList))) return alertUser('Keine Berechtigung für die Zielliste.', 'error');
    if (!(await acquireLock(item.id))) return;
    const sourceList = activeList();
    const { id: _itemId, ...payload } = item;
    await addDoc(sub(targetListId, 'items'), {
        ...payload,
        movedFromListId: sourceList?.id || '',
        movedFromListName: sourceList?.name || '',
        movedAt: serverTimestamp(),
        movedBy: uid(),
        movedByName: uname()
    });
    await deleteDoc(doc(sub(state.listId, 'items'), item.id));
    await Promise.all([
        updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }),
        updateDoc(listDoc(targetListId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() })
    ]);
    await logActivity('Artikel verschoben', { itemId: item.id, title: item.title, targetListId, targetListName: targetList.name || '' });
    state.detailId = null;
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
    const persistentNote = articlePrefillNote(article);
    const note = String(state.note || '').trim();
    const itemNote = note && note === persistentNote ? '' : note;
    await addDoc(sub(state.listId, 'items'), { articleId: article.id, title: article.title, quantity, unit, categoryId: article.categoryId || '', storeIds, status: 'open', note: itemNote, persistentNote, eanCodes: article.eanCodes || [], createdAt: serverTimestamp(), createdBy: uid(), createdByName: uname() });
    await updateDoc(listDoc(state.listId), { updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname(), storeOrder: effectiveStoreOrder() });
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
        prefillInputFromArticle(article);
        flashScanSuccess();
        closeScannerModal();
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
    const list = activeList(); if (!list) return; const order = [...effectiveStoreOrder(list)]; const i = order.indexOf(id); const j = i + dir; if (i < 0 || j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; await updateDoc(listDoc(list.id), { storeOrder: order, updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); await logActivity('Geschäftsreihenfolge geändert', { storeId: id });
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
    if (a === 'mode') { state.mode = MODES.some((entry) => entry.id === btn.dataset.v) ? btn.dataset.v : 'shop'; state.modePickerOpen = false; saveUserSetting(EL_MODE_KEY, state.mode); touchPresence(); render(); return; }
    if (a === 'quick-mode') { state.mode = 'shop'; state.listMode = btn.dataset.v === 'input' ? 'input' : 'search'; saveUserSetting(EL_MODE_KEY, state.mode); saveUserSetting(EL_LIST_MODE_KEY, state.listMode); touchPresence(); render(); return; }
    if (a === 'toggle-input-details') { state.inputDetailsOpen = !state.inputDetailsOpen; render(); return; }
    if (a === 'section') { state.section = btn.dataset.v; saveUserSetting(EL_SECTION_KEY, state.section); touchPresence(); render(); return; }
    if (a === 'store-display') { state.storeDisplay = state.storeDisplay === 'split' ? 'combined' : 'split'; saveUserSetting(EL_STORE_KEY, state.storeDisplay); render(); return; }
    if (a === 'list') { selectList(btn.dataset.id); return; }
    if (a === 'open-settings') { state.settingsOpen = true; render(); return; }
    if (a === 'close-settings') { state.settingsOpen = false; render(); return; }
    if (a === 'del-store') { state.storeIds = state.storeIds.filter((x) => x !== btn.dataset.id); render(); return; }
    if (a === 'add-item') { await addItem(); return; }
    if (a === 'edit-item') { await handleDouble(btn.dataset.id, 'edit-item'); return; }
    if (a === 'open-detail-item') { const item = state.items.find((x) => x.id === btn.dataset.id); hideItemActionButtons(btn.dataset.id); state.detailId = btn.dataset.id; initDetailDraft(item); render(); return; }
    if (a === 'delete-item-direct') { hideItemActionButtons(btn.dataset.id); hideQuantityActionButton(btn.dataset.id); await deleteListItem(btn.dataset.id, 'Artikel gelöscht'); return; }
    if (a === 'check' || a === 'restore') { await handleDouble(btn.dataset.id, a); return; }
    if (a === 'quantity') { await handleDouble(btn.dataset.id, 'quantity'); return; }
    if (a === 'detail') { const item = state.items.find((x) => x.id === btn.dataset.id); state.detailId = btn.dataset.id; initDetailDraft(item); render(); return; }
    if (a === 'close-detail') { state.detailId = null; state.detailDraft = null; render(); return; }
    if (a === 'remove-detail-pnote') { const index = Number(btn.dataset.index); if (state.detailDraft && index >= 0 && index < state.detailDraft.persistentNotes.length) { const [entry] = state.detailDraft.persistentNotes.splice(index, 1); if (entry && !state.detailDraft.removedPersistentNotes.includes(entry)) state.detailDraft.removedPersistentNotes.push(entry); render(); } return; }
    if (a === 'restore-detail-pnote') { const index = Number(btn.dataset.index); if (state.detailDraft && index >= 0 && index < state.detailDraft.removedPersistentNotes.length) { const [entry] = state.detailDraft.removedPersistentNotes.splice(index, 1); if (entry && !state.detailDraft.persistentNotes.includes(entry)) state.detailDraft.persistentNotes.push(entry); render(); } return; }
    if (a === 'toggle-checked-section') { state.checkedOpen = !state.checkedOpen; if (!state.checkedOpen) state.checkedMenuOpen = false; render(); return; }
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
    if (a === 'pick-title-suggestion') { const article = state.articles.find((x) => x.id === btn.dataset.id); if (article) { state.title = article.title || ''; requestFocusAfterRender('el-title'); render(); } return; }
    if (a === 'pick-search-suggestion') { const article = state.articles.find((x) => x.id === btn.dataset.id); if (article) { state.search = article.title || ''; requestFocusAfterRender('el-search'); render(); } return; }
    if (a === 'open-article') { state.articleEditor = { title: '', defaultQuantity: 1, defaultUnit: 'Stück', categoryId: '', eanCodes: [], variants: [], persistentNotes: [], storeIds: [] }; render(); return; }
    if (a === 'edit-article') { const article = state.articles.find((x) => x.id === btn.dataset.id); if (article) { state.articleEditor = JSON.parse(JSON.stringify(article)); render(); } return; }
    if (a === 'capture-ean') { openScanner('article-ean', btn.dataset.id); return; }
    if (a === 'close-article') { state.articleEditor = null; render(); return; }
    if (a === 'art-store') { const ids = state.articleEditor.storeIds || []; state.articleEditor.storeIds = ids.includes(btn.dataset.id) ? ids.filter((x) => x !== btn.dataset.id) : [...ids, btn.dataset.id]; renderArticle(); return; }
    if (a === 'save-article') { await saveArticle(); return; }
    if (a === 'delete-article') { await deleteDoc(doc(master('articles'), btn.dataset.id)); await logActivity('Artikel gelöscht', { articleId: btn.dataset.id }); state.articleEditor = null; render(); return; }
    if (a === 'add-category') { await addMaster('categories', state.drafts.category, 'name'); state.drafts.category = ''; render(); return; }
    if (a === 'del-category') { await deleteDoc(doc(master('categories'), btn.dataset.id)); await logActivity('Kategorie gelöscht', { categoryId: btn.dataset.id }); return; }
    if (a === 'add-store') { const ref = await addMaster('stores', state.drafts.store, 'name'); if (ref?.id && state.listId) { const currentOrder = effectiveStoreOrder(); if (!currentOrder.includes(ref.id)) await updateDoc(listDoc(state.listId), { storeOrder: [...currentOrder, ref.id], updatedAt: serverTimestamp(), updatedBy: uid(), updatedByName: uname() }); } state.drafts.store = ''; render(); return; }
    if (a === 'del-store-master') { const store = state.stores.find((entry) => entry.id === btn.dataset.id); if (!store) return; if (!confirm(`Geschäft "${store.name}" wirklich löschen?`)) return; await deleteDoc(doc(master('stores'), btn.dataset.id)); await logActivity('Geschäft gelöscht', { storeId: btn.dataset.id, storeName: store.name }); return; }
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
    if (a === 'save-notify-settings') { await saveNotificationSettings(); return; }
    if (a === 'save-notify-template') { await saveNotificationTemplate(); return; }
    if (a === 'apply-notify-template') { applyNotificationTemplate(); return; }
    if (a === 'toggle-notify-target') { toggleNotificationCopyTarget(btn.dataset.id); return; }
    if (a === 'clear-notify-targets') { state.notificationCopyTargets = []; render(); return; }
    if (a === 'copy-notify-settings') { await copyNotificationSettingsToTargets(); return; }
    if (a === 'enable-web-push') { await syncWebPushSubscription({ requestPermission: true }); return; }
    if (a === 'sync-web-push') { await syncWebPushSubscription({ requestPermission: false }); return; }
    if (a === 'disable-web-push') { await disableWebPushSubscription(); return; }
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
