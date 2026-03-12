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
let unsubAudit = null;
let shellMounted = false;
let listenersBound = false;
let helpHintsBound = false;
let ACCOUNTS = {};
let ITEMS = {};
let TRANSFERS = {};
let RECON = {};
let AUDIT = {};
let FORECAST = { timeline: [], alerts: [], details: {}, quality: [], setup: [], suggestions: [], imbalances: [] };
let filterTokens = [];
let filterState = { negate: false, joinMode: 'and', status: '', typ: '', interval: '', quick: '', sort: 'critical' };
let accountListFilterState = { type: 'all', query: '' };
let transferListFilterState = { type: 'all', query: '' };
let editingAccountId = '';
let editingTransferId = '';
let itemReadMode = false;

function uid() { return currentUser?.mode || currentUser?.displayName || null; }
function isGuest() { return !currentUser?.mode || currentUser.mode === GUEST_MODE; }
function canCreate() { const p = currentUser?.permissions || []; return currentUser?.role === 'SYSTEMADMIN' || p.includes('ABBUCHUNGSBERECHNER_CREATE'); }
function el(id) { return document.getElementById(id); }
function openModal(id) { const n = el(id); if (n) n.style.display = 'flex'; }
function closeModal(id) { const n = el(id); if (n) n.style.display = 'none'; }
function toNum(v, f = 0) { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : f; }
function roundMoney(v) { return Math.round(toNum(v, 0) * 100) / 100; }
function isoDate(v) { const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseDate(v) { if (!v) return null; const d = new Date(v); if (Number.isNaN(d.getTime())) return null; d.setHours(0, 0, 0, 0); return d; }
function timestampToDate(v) { if (!v) return null; if (v instanceof Date) return v; if (typeof v.toDate === 'function') return v.toDate(); const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function formatDate(v) { const d = parseDate(v) || timestampToDate(v); return d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : '-'; }
function formatDateTime(v) { const d = timestampToDate(v) || parseDate(v); return d ? `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '-'; }
function formatCurrency(v) { return `${roundMoney(v).toFixed(2)} €`; }
function formatSignedCurrency(v) { const n = roundMoney(v); return `${n >= 0 ? '+' : ''}${n.toFixed(2)} €`; }
function parseMonths(v) { return String(v || '').split(',').map(x => parseInt(x.trim(), 10)).filter(x => x >= 1 && x <= 12).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b); }
function parseCsvList(v) { return String(v || '').split(',').map((x) => x.trim()).filter(Boolean).filter((x, i, a) => a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i); }
function normalizeSearchText(v) { return String(v || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/€/g, '').replace(/\s+/g, ' ').trim(); }
function normalizeAccountType(accountOrType) { const raw = typeof accountOrType === 'string' ? accountOrType : accountOrType?.type; return String(raw || '').trim().toLowerCase() === 'person' ? 'person' : 'bank'; }
function normalizeAccountRole(accountOrRole) { const raw = typeof accountOrRole === 'string' ? accountOrRole : accountOrRole?.role; const n = String(raw || '').trim().toLowerCase(); return ['source', 'target', 'both'].includes(n) ? n : 'both'; }
function isPersonAccount(account) { return normalizeAccountType(account) === 'person'; }
function canBeSourceAccount(account) { const role = normalizeAccountRole(account); return role === 'source' || role === 'both' || isPersonAccount(account); }
function canBeTargetAccount(account) { const role = normalizeAccountRole(account); return role === 'target' || role === 'both'; }
function intervalLabel(i, cm = []) { if (i === 'monthly') return 'Monatlich'; if (i === 'quarterly') return 'Quartal'; if (i === 'semiannual') return 'Halbjahr'; if (i === 'annual') return 'Jährlich'; if (i === 'custom') return cm.length ? `Individuell (${cm.map(m => MONTHS[m - 1]).join(', ')})` : 'Individuell'; return '-'; }
function describeInterval(i, startMonth, customMonths, dayOfMonth) { const dayText = Number.isInteger(parseInt(dayOfMonth, 10)) ? ` am ${Math.min(Math.max(parseInt(dayOfMonth, 10), 1), 31)}. Tag` : ''; if (i === 'monthly') return `jeden Monat${dayText}`; if (i === 'quarterly') return `alle 3 Monate ab ${MONTHS[Math.max(0, (parseInt(startMonth, 10) || 1) - 1)]}${dayText}`; if (i === 'semiannual') return `alle 6 Monate ab ${MONTHS[Math.max(0, (parseInt(startMonth, 10) || 1) - 1)]}${dayText}`; if (i === 'annual') return `jährlich ab ${MONTHS[Math.max(0, (parseInt(startMonth, 10) || 1) - 1)]}${dayText}`; return `jedes Jahr in ${(customMonths || []).map(m => MONTHS[m - 1]).join(', ')}${dayText}`; }
function compareNumber(actual, op, expected) { const a = roundMoney(actual); const b = roundMoney(expected); if (op === '>') return a > b; if (op === '>=') return a >= b; if (op === '<') return a < b; if (op === '<=') return a <= b; return a === b; }
function helpButton(targetId) { return `<button type="button" class="ab2-help-btn inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold hover:bg-blue-200" data-help-target="${targetId}" title="Info">i</button>`; }
function helpContent(id, text) { return `<div id="${id}" class="ab2-help-content hidden mt-1 text-[11px] sm:text-xs leading-relaxed text-blue-900 bg-blue-50 border border-blue-200 rounded-lg p-2">${text}</div>`; }

function buildShell() {
    return `
    <div class="space-y-4">
        <div class="back-link-container w-full mb-1">
            <div class="flex justify-between items-center flex-wrap gap-2">
                <button class="back-link flex items-center text-gray-600 hover:text-indigo-600 transition" data-target="home"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 mr-1"><path d="m15 18-6-6 6-6"></path></svg><span class="text-base font-semibold">zurück</span></button>
                <div class="flex gap-2 flex-wrap">
                    <button id="ab2-open-accounts-modal" class="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-sm">Konten</button>
                    <button id="ab2-open-transfers-modal" class="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-sm">Transfers</button>
                    <button id="ab2-open-recon-modal" class="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-sm">Abgleich</button>
                    <button id="ab2-open-suggestions-modal" class="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-bold text-sm">Vorschläge</button>
                    <button id="ab2-btn-create" class="py-2 px-4 bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-bold rounded-lg hover:shadow-lg transition text-sm">Neu</button>
                </div>
            </div>
            <div class="border-t border-gray-300 mt-2"></div>
        </div>
        <div class="bg-gradient-to-r from-blue-700 via-indigo-600 to-sky-600 text-white p-4 rounded-2xl shadow-md">
            <div class="flex items-start justify-between gap-3 flex-wrap">
                <div><div class="flex items-center gap-2 flex-wrap"><h2 class="text-2xl font-bold">Abbuchungsberechner 2 (Test)</h2><span class="px-2 py-1 rounded-full bg-white/15 text-xs font-bold">Test-Version</span></div><p class="text-sm text-white/90 mt-1 max-w-3xl">Mehr Erklärung, bessere Vorschläge, stärkere Kontrolle über Datenqualität und Forecast.</p></div>
                <span id="ab2-total-status" class="px-4 py-2 rounded-lg font-bold text-white bg-green-500">STABIL</span>
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
        <div id="ab2-setup-panel" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"></div>
        <div id="ab2-quality-banner" class="hidden bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-900"></div>
        <div id="ab2-imbalance-banner" class="hidden bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-900"></div>
        <div class="grid grid-cols-1 gap-3">
            <div class="bg-white rounded-xl shadow p-3"><h3 class="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">12-Monate-Kontostandsprognose ${helpButton('ab2-help-forecast')}</h3>${helpContent('ab2-help-forecast', 'Zeigt die voraussichtlichen Endstände je Monat für die nächsten 12 Monate. Klick auf eine Zelle = Warum dieser Wert? Was wirkt? Was ist die beste Maßnahme?')}<div id="ab2-forecast-overview" class="text-sm text-gray-400 italic">Keine Forecast-Daten.</div></div>
        </div>
        <div class="bg-white rounded-xl shadow p-3"><h3 class="text-sm font-bold text-gray-700 mb-2">Ausgleichsvorschläge</h3><div id="ab2-suggestion-preview" class="space-y-2"><p class="text-sm text-gray-400 italic">Plan aktuell stabil.</p></div></div>
        <div class="bg-white rounded-xl shadow p-3"><div class="flex items-center justify-between gap-2"><h3 class="text-sm font-bold text-gray-700">Begriffe einfach erklärt</h3><button id="ab2-toggle-glossary" class="text-xs font-bold text-blue-700 hover:text-blue-900">anzeigen</button></div><div id="ab2-glossary" class="hidden mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs"></div></div>
        <div class="flex justify-center"><button id="ab2-toggle-filter-controls" class="text-gray-500 hover:text-blue-700 transition flex items-center gap-1 text-xs font-bold py-1 px-4 rounded-full hover:bg-blue-50"><span>Filter & Kategorien</span><svg id="ab2-toggle-filter-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 transform transition-transform"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"></path></svg></button></div>
        <div id="ab2-filter-controls-wrapper" class="hidden space-y-3">
            <div class="bg-white rounded-xl shadow p-3 space-y-3">
                <div class="flex flex-wrap gap-2 items-center"><label class="flex items-center gap-2 px-3 py-2 bg-white border-2 border-gray-300 rounded-lg cursor-pointer"><input type="checkbox" id="ab2-filter-negate" class="w-4 h-4"><span class="font-bold text-red-600 text-sm">NICHT</span></label><select id="ab2-search-join-mode" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm font-bold"><option value="and">AND</option><option value="or">OR</option></select><input type="text" id="ab2-search-input" placeholder="z. B. konto:giro oder betrag>100" class="flex-1 min-w-[220px] p-2 border-2 border-gray-300 rounded-lg text-sm"><button id="ab2-add-filter-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition text-sm">+ Filter</button><button id="ab2-reset-filters" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-bold transition text-sm">Reset</button></div>
                <div id="ab2-active-search-tags" class="flex flex-wrap gap-1"></div>
                <div class="flex flex-wrap gap-2"><select id="ab2-filter-status" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="">Alle Status</option><option value="aktiv">Aktiv</option><option value="geplant">Geplant</option><option value="vergangen">Vergangen</option><option value="fehler">Fehler</option></select><select id="ab2-filter-typ" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="">Alle Typen</option><option value="belastung">Belastung</option><option value="gutschrift">Gutschrift</option></select><select id="ab2-filter-interval" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="">Alle Intervalle</option><option value="monthly">Monatlich</option><option value="quarterly">Quartal</option><option value="semiannual">Halbjahr</option><option value="annual">Jährlich</option><option value="custom">Individuell</option></select><select id="ab2-filter-sort" class="p-2 border-2 border-gray-300 rounded-lg bg-white text-sm"><option value="critical">Kritischste zuerst</option><option value="next">Nächste Ausführung</option><option value="amount_desc">Betrag ↓</option><option value="amount_asc">Betrag ↑</option><option value="title">Titel A-Z</option></select></div>
                <div class="flex flex-wrap gap-2"><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="critical">Kritisch</button><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="contrib">Mit Beitrag</button><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="planned">Geplant</button><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="errors">Fehler</button><button type="button" class="ab2-quick-filter px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700" data-value="">Alle</button></div>
            </div>
        </div>
        <div class="bg-white rounded-xl shadow overflow-hidden"><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-blue-50 border-b-2 border-blue-200"><tr><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Status</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Titel</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Konto</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Typ</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Intervall</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Betrag</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Nächste</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Jahreswert</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Wirkung</th><th class="px-3 py-3 text-left text-xs font-bold text-blue-800 uppercase">Gültigkeit</th><th class="px-3 py-3 text-center text-xs font-bold text-blue-800 uppercase">Aktionen</th></tr></thead><tbody id="ab2-table-body" class="divide-y divide-gray-200"><tr><td colspan="11" class="px-4 py-8 text-center text-gray-400 italic">Keine Einträge vorhanden.</td></tr></tbody></table></div></div>
    </div>
    <div id="ab2-item-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-500 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Eintrag</h3><button id="ab2-close-item-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-4"><input type="hidden" id="ab2-item-id"><div class="grid grid-cols-1 md:grid-cols-2 gap-3"><div><label class="block text-sm font-bold text-gray-700 mb-1">Titel *</label><input id="ab2-item-title" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Konto *</label><select id="ab2-item-account" class="w-full p-2 border rounded-lg"></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Typ *</label><select id="ab2-item-type" class="w-full p-2 border rounded-lg"><option value="belastung">Belastung</option><option value="gutschrift">Gutschrift</option></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Betrag *</label><input id="ab2-item-amount" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Intervall</label><select id="ab2-item-interval" class="w-full p-2 border rounded-lg"><option value="monthly">Monatlich</option><option value="quarterly">Quartal</option><option value="semiannual">Halbjahr</option><option value="annual">Jährlich</option><option value="custom">Individuell</option></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Start-Monat ${helpButton('ab2-help-item-start-month')}</label><input id="ab2-item-start-month" type="number" min="1" max="12" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-item-start-month', 'Nur für Quartal, Halbjahr oder Jahr: Startmonat des Zyklus.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Monate ${helpButton('ab2-help-item-custom-months')}</label><input id="ab2-item-custom-months" type="text" placeholder="1,3,8" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-item-custom-months', 'Nur bei Individuell: Monate als Liste eingeben, z. B. 1,3,8.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Tag ${helpButton('ab2-help-item-day')}</label><input id="ab2-item-day" type="number" min="1" max="31" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-item-day', 'Optionaler Ausführungstag. Bei kurzen Monaten wird automatisch der Monatsletzte verwendet.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Gültig ab *</label><input id="ab2-item-valid-from" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Gültig bis</label><input id="ab2-item-valid-to" type="date" class="w-full p-2 border rounded-lg"></div></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Notizen</label><textarea id="ab2-item-notes" rows="2" class="w-full p-2 border rounded-lg"></textarea></div><div class="rounded-xl border border-blue-100 bg-blue-50 p-3"><div class="text-sm font-bold text-blue-900 mb-1">So wirkt dieser Eintrag</div><div id="ab2-item-preview" class="text-sm text-blue-900">Noch unvollständig.</div></div><div class="bg-gray-50 p-3 rounded-lg border"><div class="flex justify-between items-center mb-2"><label class="block text-sm font-bold text-gray-700">Beiträge / Gegenkonten</label><button id="ab2-add-contrib-btn" type="button" class="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm">+ Beitrag</button></div><div id="ab2-contrib-list" class="space-y-2"></div></div></div><div class="sticky bottom-0 bg-gray-100 p-4 rounded-b-2xl flex justify-between gap-2 flex-wrap"><div class="flex gap-2"><button id="ab2-item-edit-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300" style="display:none;">Bearbeiten</button><button id="ab2-item-delete-btn" class="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200" style="display:none;">Löschen</button><button id="ab2-item-abtausch-btn" class="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200" style="display:none;">Abtausch</button></div><div class="flex gap-2"><button id="ab2-cancel-item-btn" class="px-5 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400">Abbrechen</button><button id="ab2-item-save-btn" class="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-bold rounded-lg">Speichern</button></div></div></div></div>
    <div id="ab2-abtausch-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg"><div class="bg-gradient-to-r from-purple-600 to-indigo-500 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Abtausch</h3><button id="ab2-close-abtausch-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 space-y-3"><p id="ab2-abtausch-old-info" class="text-sm text-gray-600 bg-gray-50 border rounded p-2">-</p><div><label class="block text-sm font-bold text-gray-700 mb-1">Neues Startdatum *</label><input id="ab2-abtausch-new-start" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Neuer Betrag *</label><input id="ab2-abtausch-new-amount" type="text" class="w-full p-2 border rounded-lg"></div><div class="rounded-xl border border-purple-100 bg-purple-50 p-3"><div class="text-sm font-bold text-purple-900 mb-1">Auswirkung</div><div id="ab2-abtausch-preview" class="text-sm text-purple-900">Noch keine Vorschau.</div></div></div><div class="bg-gray-100 p-4 rounded-b-2xl flex justify-end gap-2"><button id="ab2-cancel-abtausch-btn" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg">Abbrechen</button><button id="ab2-save-abtausch-btn" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-500 text-white rounded-lg">Übernehmen</button></div></div></div>
    <div id="ab2-accounts-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-slate-700 to-slate-600 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Konten / Quellen</h3><button id="ab2-close-accounts-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="space-y-3"><input type="hidden" id="ab2-account-id"><div><label class="block text-sm font-bold text-gray-700 mb-1">Name *</label><input id="ab2-account-name" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Bank</label><input id="ab2-account-bank" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">IBAN</label><input id="ab2-account-iban" type="text" class="w-full p-2 border rounded-lg"></div><div class="grid grid-cols-2 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Typ</label><select id="ab2-account-type" class="w-full p-2 border rounded-lg"><option value="bank">Bank</option><option value="person">Person</option></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Rolle</label><select id="ab2-account-role" class="w-full p-2 border rounded-lg"><option value="both">Quelle & Ziel</option><option value="source">Nur Quelle</option><option value="target">Nur Ziel</option></select></div></div><div class="grid grid-cols-3 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Mindestpuffer ${helpButton('ab2-help-account-buffer')}</label><input id="ab2-account-min-buffer" type="text" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-account-buffer', 'Mindestbetrag, der auf dem Konto verbleiben soll. Unter diesem Wert entstehen Warnung oder Alarm.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Startsaldo ${helpButton('ab2-help-account-start')}</label><input id="ab2-account-start-balance" type="text" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-account-start', 'Wird zusammen mit dem Stand-Datum als Snapshot gespeichert oder aktualisiert.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Stand-Datum</label><input id="ab2-account-start-date" type="date" class="w-full p-2 border rounded-lg"></div></div><div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><div class="text-sm font-bold text-slate-900 mb-1">So wird dieses Konto verwendet</div><div id="ab2-account-preview" class="text-sm text-slate-900">Noch unvollständig.</div></div><div class="flex gap-2"><button id="ab2-reset-account-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Reset</button><button id="ab2-save-account-btn" class="px-4 py-2 bg-slate-700 text-white rounded-lg">Speichern</button></div></div><div><h4 class="font-bold text-gray-700 mb-2">Bestehende Konten</h4><div class="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-2"><div class="flex flex-wrap gap-2"><button id="ab2-accounts-filter-all" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-blue-600 text-white">ALLE</button><button id="ab2-accounts-filter-bank" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">Bank</button><button id="ab2-accounts-filter-person" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">Person</button></div><input id="ab2-accounts-search" type="text" placeholder="Konto/Person suchen..." class="w-full sm:flex-1 sm:min-w-[180px] p-2 border rounded text-sm"></div><div id="ab2-accounts-list" class="space-y-2"><p class="text-sm text-gray-400 italic">Noch keine Konten/Quellen.</p></div></div></div></div></div>
    <div id="ab2-transfers-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-blue-700 to-indigo-700 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Transferpläne</h3><button id="ab2-close-transfers-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="space-y-3"><input type="hidden" id="ab2-transfer-id"><div class="grid grid-cols-2 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Quelle *</label><select id="ab2-transfer-source" class="w-full p-2 border rounded-lg"></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Ziel *</label><select id="ab2-transfer-target" class="w-full p-2 border rounded-lg"></select></div></div><div class="grid grid-cols-2 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Betrag *</label><input id="ab2-transfer-amount" type="text" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Intervall</label><select id="ab2-transfer-interval" class="w-full p-2 border rounded-lg"><option value="monthly">Monatlich</option><option value="quarterly">Quartal</option><option value="semiannual">Halbjahr</option><option value="annual">Jährlich</option><option value="custom">Individuell</option></select></div></div><div class="grid grid-cols-3 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Start-Monat ${helpButton('ab2-help-transfer-start-month')}</label><input id="ab2-transfer-start-month" type="number" min="1" max="12" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-transfer-start-month', 'Nur für Quartal, Halbjahr oder Jahr relevant: Startmonat des Transferzyklus.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Monate ${helpButton('ab2-help-transfer-months')}</label><input id="ab2-transfer-custom-months" type="text" placeholder="1,3,8" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-transfer-months', 'Nur bei Individuell relevant: Monate als Liste eingeben.')}</div><div><label class="block text-sm font-bold text-gray-700 mb-1">Tag ${helpButton('ab2-help-transfer-day')}</label><input id="ab2-transfer-day" type="number" min="1" max="31" class="w-full p-2 border rounded-lg">${helpContent('ab2-help-transfer-day', 'Optionaler Ausführungstag im Monat.')}</div></div><div class="grid grid-cols-2 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Gültig ab *</label><input id="ab2-transfer-valid-from" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Gültig bis</label><input id="ab2-transfer-valid-to" type="date" class="w-full p-2 border rounded-lg"></div></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Notiz</label><input id="ab2-transfer-note" type="text" class="w-full p-2 border rounded-lg"></div><div class="rounded-xl border border-indigo-100 bg-indigo-50 p-3"><div class="text-sm font-bold text-indigo-900 mb-1">So wirkt dieser Transfer</div><div id="ab2-transfer-preview" class="text-sm text-indigo-900">Noch unvollständig.</div></div><div class="flex gap-2"><button id="ab2-reset-transfer-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Reset</button><button id="ab2-save-transfer-btn" class="px-4 py-2 bg-indigo-700 text-white rounded-lg">Speichern</button></div></div><div><h4 class="font-bold text-gray-700 mb-2">Bestehende Transfers</h4><div class="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-2"><div class="flex flex-wrap gap-2"><button id="ab2-transfers-filter-all" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-blue-600 text-white">ALLE</button><button id="ab2-transfers-filter-bank" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">Bank</button><button id="ab2-transfers-filter-person" type="button" class="ab2-list-filter-btn px-3 py-1.5 text-xs rounded font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">Person</button></div><input id="ab2-transfers-search" type="text" placeholder="Transfer suchen..." class="w-full sm:flex-1 sm:min-w-[180px] p-2 border rounded text-sm"></div><div id="ab2-transfers-list" class="space-y-2"><p class="text-sm text-gray-400 italic">Noch keine Daueraufträge.</p></div></div></div></div></div>
    <div id="ab2-reconciliation-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-emerald-700 to-teal-700 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Monatsabgleich</h3><button id="ab2-close-recon-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="space-y-3"><div><label class="block text-sm font-bold text-gray-700 mb-1">Konto *</label><select id="ab2-recon-account" class="w-full p-2 border rounded-lg"></select></div><div class="grid grid-cols-3 gap-2"><div><label class="block text-sm font-bold text-gray-700 mb-1">Typ</label><select id="ab2-recon-type" class="w-full p-2 border rounded-lg"><option value="snapshot">Snapshot</option><option value="manual">Manuell</option></select></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Datum *</label><input id="ab2-recon-date" type="date" class="w-full p-2 border rounded-lg"></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Wert *</label><input id="ab2-recon-value" type="text" class="w-full p-2 border rounded-lg"></div></div><div><label class="block text-sm font-bold text-gray-700 mb-1">Notiz</label><input id="ab2-recon-note" type="text" class="w-full p-2 border rounded-lg"></div><div class="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div class="text-sm font-bold text-emerald-900 mb-1">So wirkt dieser Abgleich</div><div id="ab2-recon-preview" class="text-sm text-emerald-900">Noch unvollständig.</div></div><div class="flex gap-2"><button id="ab2-recon-today-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Heute</button><button id="ab2-save-recon-btn" class="px-4 py-2 bg-emerald-700 text-white rounded-lg">Speichern</button></div></div><div><h4 class="font-bold text-gray-700 mb-2">Letzte Abgleiche</h4><div id="ab2-recon-list" class="space-y-2"><p class="text-sm text-gray-400 italic">Noch keine Abgleiche.</p></div></div></div></div></div>
    <div id="ab2-suggestions-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-indigo-700 to-blue-700 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 class="text-xl font-bold">Vorschläge</h3><button id="ab2-close-suggestions-modal" class="text-white/80 hover:text-white transition">✕</button></div><div class="p-4"><div id="ab2-suggestions-content" class="space-y-3"></div></div></div></div>
    <div id="ab2-detail-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" style="display:none;"><div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"><div class="sticky top-0 bg-gradient-to-r from-slate-700 to-slate-600 text-white p-4 rounded-t-2xl flex justify-between items-center"><h3 id="ab2-detail-title" class="text-xl font-bold">Details</h3><button id="ab2-close-detail-modal" class="text-white/80 hover:text-white transition">✕</button></div><div id="ab2-detail-content" class="p-4"></div></div></div>`;
}

function ensureTransferLinkingFields() {
    const noteInput = el('ab2-transfer-note');
    if (!noteInput || el('ab2-transfer-linking-block')) return;
    const noteWrap = noteInput.closest('div');
    if (!noteWrap || !noteWrap.parentElement) return;
    const block = document.createElement('div');
    block.id = 'ab2-transfer-linking-block';
    block.className = 'rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-2';
    block.innerHTML = `<div class="text-sm font-bold text-indigo-900 flex items-center gap-2">Titel-/Konten-Zuordnung (optional) ${helpButton('ab2-help-transfer-linking')}</div>${helpContent('ab2-help-transfer-linking', 'Hier kannst du den Transfer einem oder mehreren Titeln zuordnen (z. B. YouTube) und beteiligte Konten notieren. Diese Zuordnung wird für Ungleichgewichts-Analysen und Abtausch-Ausgleich genutzt.')}<div class="grid grid-cols-1 md:grid-cols-2 gap-2"><input id="ab2-transfer-linked-titles" type="text" class="w-full p-2 border rounded-lg" placeholder="Titel, getrennt mit Komma"><input id="ab2-transfer-linked-accounts" type="text" class="w-full p-2 border rounded-lg" placeholder="Konten/Personen, getrennt mit Komma"></div>`;
    noteWrap.parentElement.insertBefore(block, noteWrap.nextSibling);
}

function ensureContributionInfoHint() {
    const contribList = el('ab2-contrib-list');
    if (!contribList) return;
    const panel = contribList.closest('.bg-gray-50.p-3.rounded-lg.border') || contribList.parentElement;
    if (!panel || el('ab2-help-contrib-usage')) return;
    const headerLabel = panel.querySelector('label');
    if (headerLabel && !headerLabel.querySelector('.ab2-help-btn')) {
        headerLabel.insertAdjacentHTML('beforeend', ` ${helpButton('ab2-help-contrib-usage')}`);
    }
    const hintNode = document.createElement('div');
    hintNode.innerHTML = helpContent('ab2-help-contrib-usage', 'Beiträge/Gegenkonten nutzt du, wenn eine Belastung (z. B. YouTube) anteilig von anderen Konten/Personen mitgetragen wird. Trage hier nur den Anteil ein, der wirklich zur Belastung gehört. So siehst du später sofort Überzahlung/Unterzahlung und den Ausgleich nach Abtausch.');
    panel.insertBefore(hintNode.firstChild, contribList);
}

function enhanceStaticHelpTexts() {
    const bufferHelp = el('ab2-help-account-buffer');
    if (bufferHelp) {
        bufferHelp.textContent = 'Mindestbetrag, der auf Bankkonten verbleiben soll. Unter diesem Wert entstehen Warnung oder Alarm. Bei Person-Konten ist der Mindestpuffer absichtlich deaktiviert (immer 0), weil Personen als Geldquelle geführt werden und keine Bank-Unterdeckung auslösen sollen.';
    }
    const startBalanceHelp = el('ab2-help-account-start-balance');
    if (startBalanceHelp) {
        startBalanceHelp.textContent = 'Startsaldo ist der rechnerische Startwert. Praktisch für Personen, um offene Vorleistungen/Schulden mitzunehmen (z. B. Person hat schon 20 € vorausgezahlt). Praktisch für Bankkonten, wenn du mit einem realen Ist-Stand startest.';
    }
}

function ensureShell() {
    const root = el('abbuchungsberechner2-root');
    if (!root) return;
    if (!shellMounted) {
        root.innerHTML = buildShell();
        shellMounted = true;
    }
    ensureTransferLinkingFields();
    ensureContributionInfoHint();
    enhanceStaticHelpTexts();
}

function ensureRefs() {
    if (refsReady || !db) return;
    accountsRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_accounts');
    itemsRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_cost_items');
    transfersRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_transfer_plans');
    reconRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_reconciliation');
    auditRef = collection(db, 'artifacts', appId, 'public', 'data', 'abbuchungsberechner_audit');
    refsReady = true;
}

function setInputEnabled(n, enabled, clearWhenDisabled = false) { if (!n) return; if (!enabled && clearWhenDisabled) n.value = ''; n.disabled = !enabled; n.classList.toggle('bg-gray-100', !enabled); n.classList.toggle('text-gray-500', !enabled); }
function updateMainIntervalFields(prefix) { const interval = (el(`${prefix}-interval`)?.value || 'monthly').trim(); const startMonth = el(`${prefix}-start-month`); const customMonths = el(`${prefix}-custom-months`); if (interval === 'custom') { setInputEnabled(startMonth, false, true); setInputEnabled(customMonths, true, false); return; } if (interval === 'monthly') { setInputEnabled(startMonth, false, true); setInputEnabled(customMonths, false, true); return; } setInputEnabled(startMonth, true, false); setInputEnabled(customMonths, false, true); }
function updateContributionRowState(row) { if (!row) return; const interval = row.querySelector('.ab2-contrib-interval')?.value || 'inherit'; const customMonths = row.querySelector('.ab2-contrib-custom'); setInputEnabled(customMonths, interval === 'custom', interval !== 'custom'); }
function updateAccountTypeDependencies() { const type = (el('ab2-account-type')?.value || 'bank').trim(); const minBuffer = el('ab2-account-min-buffer'); const isPerson = normalizeAccountType(type) === 'person'; if (isPerson && minBuffer && !minBuffer.value) minBuffer.value = '0'; setInputEnabled(minBuffer, !isPerson, isPerson); }

function monthKey(year, month) { return `${year}-${String(month).padStart(2, '0')}`; }
function monthLabel(key) { const [year, month] = String(key || '').split('-').map(Number); return year && month ? `${MONTHS[month - 1]} ${year}` : '-'; }
function lastDayOfMonth(year, month) { return new Date(year, month, 0).getDate(); }
function currentMonthKey() { const now = new Date(); return monthKey(now.getFullYear(), now.getMonth() + 1); }
function freeMargin(account, row) { if (!row) return 0; return roundMoney(toNum(row.end, 0) - (isPersonAccount(account) ? 0 : toNum(account.minBuffer, 0))); }
function cloneClean(data) { const next = { ...(data || {}) }; delete next.id; return next; }
function monthNameList(list = []) { return list.map((m) => MONTHS[m - 1]).filter(Boolean).join(', ') || '-'; }
function nextExecutionDate(entity, horizon = 36) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    for (let i = 0; i < horizon; i += 1) {
        const date = getExecutionDateForMonth(entity, year, month);
        if (date && date >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) return date;
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    return null;
}
function yearlyHitCount(entity, horizon = 12) {
    const now = new Date();
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
function contributionTotal(item) { return roundMoney((Array.isArray(item?.contributions) ? item.contributions : []).reduce((sum, c) => sum + toNum(c?.amount, 0), 0)); }
function itemNetEffect(item) { const signed = item?.typ === 'gutschrift' ? toNum(item?.amount, 0) : -toNum(item?.amount, 0); return roundMoney(signed + contributionTotal(item)); }
function itemStatus(item) {
    const now = new Date();
    const start = parseDate(item?.validFrom);
    const end = parseDate(item?.validTo);
    if (!item?.title || !item?.accountId || toNum(item?.amount, NaN) <= 0 || !start) return { key: 'fehler', label: 'Fehler', css: 'bg-red-100 text-red-700' };
    if (end && start && end < start) return { key: 'fehler', label: 'Fehler', css: 'bg-red-100 text-red-700' };
    if (start > now) return { key: 'geplant', label: 'Geplant', css: 'bg-blue-100 text-blue-700' };
    if (end && end < now) return { key: 'vergangen', label: 'Vergangen', css: 'bg-gray-100 text-gray-700' };
    return { key: 'aktiv', label: 'Aktiv', css: 'bg-green-100 text-green-700' };
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
    else if (interval === 'quarterly') monthAllowed = ((month - startMonth + 120) % 3) === 0;
    else if (interval === 'semiannual') monthAllowed = ((month - startMonth + 120) % 6) === 0;
    else if (interval === 'annual') monthAllowed = ((month - startMonth + 120) % 12) === 0;
    else if (interval === 'custom') monthAllowed = customMonths.includes(month);
    if (!monthAllowed) return null;

    const maxDay = lastDayOfMonth(year, month);
    const targetDay = Math.min(Math.max(parseInt(entity?.dayOfMonth, 10) || (start ? start.getDate() : 1), 1), maxDay);
    let candidate = new Date(year, month - 1, targetDay);
    if (start && start.getFullYear() === year && start.getMonth() + 1 === month && candidate < start) candidate = new Date(start);
    if (end && end.getFullYear() === year && end.getMonth() + 1 === month && candidate > end) return null;
    return candidate;
}
function dueInMonth(entity, y, m) { return !!getExecutionDateForMonth(entity, y, m); }
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
    const now = new Date();
    const currentMonth = currentMonthKey();
    return Object.values(ACCOUNTS).map((account) => {
        const accountSnapshots = Object.values(RECON)
            .filter((entry) => entry?.type === 'snapshot' && entry?.accountId === account.id && entry?.date)
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const latest = accountSnapshots[0] || null;
        const latestDate = latest ? parseDate(latest.date) : null;
        const ageDays = latestDate ? Math.floor((now - latestDate) / 86400000) : null;
        const currentSnapshot = accountSnapshots.some((entry) => String(entry.date || '').startsWith(currentMonth));
        let status = 'ok';
        let text = 'aktuell';
        if (!latestDate) { status = isPersonAccount(account) ? 'warn' : 'alarm'; text = 'kein Snapshot'; }
        else if (!currentSnapshot && !isPersonAccount(account)) { status = ageDays > 90 ? 'alarm' : 'warn'; text = 'aktueller Monat fehlt'; }
        else if (ageDays > 90) { status = 'alarm'; text = `zu alt (${ageDays} Tage)`; }
        else if (ageDays > 45) { status = 'warn'; text = `älter (${ageDays} Tage)`; }
        const nextAlert = alerts.find((alert) => alert.accountId === account.id && alert.severity === 'alarm') || alerts.find((alert) => alert.accountId === account.id);
        return { accountId: account.id, latest, latestDate, ageDays, currentSnapshot, status, text, nextAlert };
    });
}
function monthsSinceInclusive(startDate, endDate = new Date()) {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end || end < start) return 1;
    return Math.max(1, ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1);
}
function transferLinkedToItem(transfer, itemTitle) {
    const normalizedItemTitle = normalizeSearchText(itemTitle || '');
    if (!normalizedItemTitle) return false;
    const linkedTitles = Array.isArray(transfer?.linkedTitles) ? transfer.linkedTitles : [];
    return linkedTitles.some((title) => {
        const normalizedTitle = normalizeSearchText(title);
        return normalizedTitle && (normalizedTitle.includes(normalizedItemTitle) || normalizedItemTitle.includes(normalizedTitle));
    });
}
function buildContributionImbalances() {
    const now = new Date();
    return Object.values(ITEMS)
        .map((item) => {
            if (itemStatus(item).key !== 'aktiv' || item?.typ !== 'belastung') return null;
            const directContribs = (Array.isArray(item.contributions) ? item.contributions : [])
                .filter((contrib) => contrib?.sourceAccountId && toNum(contrib.amount, 0) > 0)
                .map((contrib) => ({
                    kind: 'beitrag',
                    sourceId: contrib.sourceAccountId,
                    sourceName: ACCOUNTS[contrib.sourceAccountId]?.name || '-',
                    amount: roundMoney(toNum(contrib.amount, 0)),
                    note: contrib.note || ''
                }));
            const linkedTransferContribs = Object.values(TRANSFERS)
                .filter((transfer) => transferLinkedToItem(transfer, item.title))
                .filter((transfer) => toNum(transfer.amount, 0) > 0)
                .filter((transfer) => !!nextExecutionDate(transfer, 24))
                .map((transfer) => ({
                    kind: 'transfer',
                    sourceId: transfer.sourceAccountId,
                    sourceName: ACCOUNTS[transfer.sourceAccountId]?.name || '-',
                    amount: roundMoney(toNum(transfer.amount, 0)),
                    note: transfer.note || ''
                }));
            const allContribs = [...directContribs, ...linkedTransferContribs];
            if (!allContribs.length) return null;
            const itemAmount = roundMoney(toNum(item.amount, 0));
            if (itemAmount <= 0) return null;
            const totalCovered = roundMoney(allContribs.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
            const gapPerExecution = roundMoney(totalCovered - itemAmount);
            if (Math.abs(gapPerExecution) <= 0.009) return null;
            const referenceMonths = monthsSinceInclusive(item.validFrom || isoDate(now), now);
            const settlementAmount = roundMoney(gapPerExecution * referenceMonths);
            const account = ACCOUNTS[item.accountId] || {};
            const severity = Math.abs(gapPerExecution) >= Math.max(5, itemAmount * 0.2) ? 'alarm' : 'warn';
            return {
                id: item.id,
                itemId: item.id,
                title: item.title || '-',
                accountId: item.accountId,
                accountName: account.name || '-',
                itemAmount,
                totalCovered,
                gapPerExecution,
                referenceMonths,
                settlementAmount,
                severity,
                actionText: settlementAmount > 0 ? 'zurücküberweisen' : 'nachfordern',
                details: allContribs
            };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.gapPerExecution) - Math.abs(a.gapPerExecution));
}
function buildSetup(quality, alerts, imbalances) {
    const items = Object.values(ITEMS);
    const targetAccounts = Object.values(ACCOUNTS).filter((account) => canBeTargetAccount(account) && !isPersonAccount(account));
    const invalid = items.filter((item) => itemStatus(item).key === 'fehler').length;
    return [
        { title: 'Konten', ok: Object.keys(ACCOUNTS).length > 0, text: Object.keys(ACCOUNTS).length ? `${Object.keys(ACCOUNTS).length} vorhanden` : 'Noch kein Konto angelegt' },
        { title: 'Zielkonten', ok: targetAccounts.length > 0, text: targetAccounts.length ? `${targetAccounts.length} werden überwacht` : 'Kein Zielkonto für Forecast' },
        { title: 'Einträge', ok: items.length > 0, text: items.length ? `${items.length} Buchungen geplant` : 'Noch keine Einträge' },
        { title: 'Datenqualität', ok: quality.every((entry) => entry.status === 'ok' || isPersonAccount(ACCOUNTS[entry.accountId])), text: quality.filter((entry) => entry.status !== 'ok').length ? `${quality.filter((entry) => entry.status !== 'ok').length} Hinweise` : 'Alle relevanten Konten aktuell' },
        { title: 'Titel-Beiträge', ok: !imbalances.length, text: imbalances.length ? `${imbalances.length} Ungleichgewicht(e)` : 'Alle Beiträge im Gleichgewicht' },
        { title: 'Kontostandsprognose', ok: !alerts.some((alert) => alert.severity === 'alarm') && invalid === 0, text: invalid ? `${invalid} fehlerhafte Einträge` : alerts.some((alert) => alert.severity === 'alarm') ? `${alerts.filter((alert) => alert.severity === 'alarm').length} Alarm(e)` : 'Aktuell stabil' }
    ];
}
function suggestions(timelineInput = null) {
    const timeline = timelineInput || FORECAST.timeline || [];
    if (!timeline.length) return [];
    return Object.values(ACCOUNTS)
        .filter((account) => canBeTargetAccount(account) && !isPersonAccount(account))
        .map((target) => {
            const rows = timeline.map((bucket) => ({ ...bucket.accounts[target.id], key: bucket.key, label: bucket.label })).filter(Boolean);
            const deficits = rows.map((row) => roundMoney(Math.max(0, toNum(row.minBuffer, 0) - toNum(row.end, 0))));
            const firstBadIdx = deficits.findIndex((value) => value > 0.009);
            if (firstBadIdx < 0) return null;
            const deficitMonths = deficits.filter((value) => value > 0.009).length;
            const monthlyNeed = deficitMonths >= 2 ? roundMoney(deficits.reduce((maxNeed, value, idx) => Math.max(maxNeed, value / (idx + 1)), 0)) : 0;
            const onceNeed = roundMoney(Math.max(0, deficits[firstBadIdx] - (monthlyNeed * (firstBadIdx + 1))));
            const caps = Object.values(ACCOUNTS)
                .filter((source) => source.id !== target.id && canBeSourceAccount(source))
                .map((source) => {
                    const sourceRows = timeline.map((bucket) => bucket.accounts[source.id]).filter(Boolean);
                    if (!sourceRows.length) return null;
                    const futureRows = sourceRows.slice(firstBadIdx);
                    const onceCap = futureRows.length ? roundMoney(Math.max(0, Math.min(...futureRows.map((row) => freeMargin(source, row))))) : 0;
                    const monthlyCapRaw = sourceRows.reduce((minCap, row, idx) => Math.min(minCap, Math.max(0, freeMargin(source, row)) / (idx + 1)), Infinity);
                    const monthlyCap = Number.isFinite(monthlyCapRaw) ? roundMoney(Math.max(0, monthlyCapRaw)) : 0;
                    return { sourceId: source.id, sourceName: source.name, onceCap, monthlyCap };
                })
                .filter(Boolean)
                .sort((a, b) => Math.max(b.onceCap, b.monthlyCap) - Math.max(a.onceCap, a.monthlyCap));

            const take = (need, field) => {
                let remaining = roundMoney(need);
                return caps.map((cap) => {
                    if (remaining <= 0) return null;
                    const available = roundMoney(cap[field]);
                    if (available <= 0) return null;
                    const used = roundMoney(Math.min(available, remaining));
                    remaining = roundMoney(remaining - used);
                    return { sourceId: cap.sourceId, sourceName: cap.sourceName, amount: used };
                }).filter(Boolean);
            };

            const monthlyAllocations = monthlyNeed > 0 ? take(monthlyNeed, 'monthlyCap') : [];
            const onceAllocations = onceNeed > 0 ? take(onceNeed, 'onceCap') : [];
            const monthlyCovered = roundMoney(monthlyAllocations.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
            const onceCovered = roundMoney(onceAllocations.reduce((sum, row) => sum + toNum(row.amount, 0), 0));
            const reason = deficitMonths >= 2 ? 'strukturelles Defizit' : 'einmalige Spitze';
            return {
                id: `${target.id}__${rows[firstBadIdx]?.key || 'x'}`,
                targetId: target.id,
                targetName: target.name,
                criticalMonth: rows[firstBadIdx]?.key || currentMonthKey(),
                criticalLabel: rows[firstBadIdx]?.label || '-',
                reason,
                monthlyNeed,
                onceNeed,
                monthlyAllocations,
                onceAllocations,
                monthlyCovered,
                onceCovered,
                fullyCovered: monthlyCovered + onceCovered >= monthlyNeed + onceNeed - 0.01,
                shortfall: roundMoney(Math.max(0, monthlyNeed + onceNeed - monthlyCovered - onceCovered))
            };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.criticalMonth).localeCompare(String(b.criticalMonth)) || (b.monthlyNeed + b.onceNeed) - (a.monthlyNeed + a.onceNeed));
}
function buildForecast(horizon = 12) {
    const accounts = Object.values(ACCOUNTS);
    const alerts = [];
    const details = {};
    const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const baseSnapshots = latestSnapshots(startMonth);
    const monthSnapshots = latestSnapshotByAccountAndMonth();
    const balances = {};
    accounts.forEach((account) => { balances[account.id] = baseSnapshots[account.id] ? toNum(baseSnapshots[account.id].value, 0) : 0; });
    let year = startMonth.getFullYear();
    let month = startMonth.getMonth() + 1;
    const timeline = [];

    for (let i = 0; i < horizon; i += 1) {
        const key = monthKey(year, month);
        const bucket = { key, label: monthLabel(key), accounts: {} };
        const movement = {};
        accounts.forEach((account) => { movement[account.id] = { in: 0, out: 0, entries: [] }; });

        Object.values(TRANSFERS).forEach((transfer) => {
            const exec = getExecutionDateForMonth(transfer, year, month);
            const amount = toNum(transfer?.amount, 0);
            if (!exec || amount <= 0) return;
            if (movement[transfer.sourceAccountId]) {
                movement[transfer.sourceAccountId].out += amount;
                movement[transfer.sourceAccountId].entries.push({ type: 'transfer-out', date: isoDate(exec), label: `Transfer an ${ACCOUNTS[transfer.targetAccountId]?.name || '-'}`, amount: -amount, note: transfer.note || '' });
            }
            if (movement[transfer.targetAccountId]) {
                movement[transfer.targetAccountId].in += amount;
                movement[transfer.targetAccountId].entries.push({ type: 'transfer-in', date: isoDate(exec), label: `Transfer von ${ACCOUNTS[transfer.sourceAccountId]?.name || '-'}`, amount, note: transfer.note || '' });
            }
        });

        Object.values(ITEMS).forEach((item) => {
            const exec = getExecutionDateForMonth(item, year, month);
            const amount = toNum(item?.amount, 0);
            if (!exec || amount <= 0 || !movement[item.accountId]) return;
            const signed = item.typ === 'gutschrift' ? amount : -amount;
            if (signed >= 0) movement[item.accountId].in += signed; else movement[item.accountId].out += Math.abs(signed);
            movement[item.accountId].entries.push({ type: 'item', date: isoDate(exec), label: item.title || '-', amount: signed, note: item.notes || '' });
            (Array.isArray(item.contributions) ? item.contributions : []).forEach((contrib) => {
                const intervalType = contrib.intervalType === 'inherit' ? item.intervalType : (contrib.intervalType || item.intervalType || 'monthly');
                const execContrib = getExecutionDateForMonth({ intervalType, startMonth: contrib.startMonth || item.startMonth, customMonths: contrib.customMonths || [], dayOfMonth: contrib.dayOfMonth || item.dayOfMonth, validFrom: contrib.validFrom || item.validFrom, validTo: contrib.validTo || item.validTo }, year, month);
                const cAmount = toNum(contrib?.amount, 0);
                if (!execContrib || cAmount <= 0) return;
                movement[item.accountId].in += cAmount;
                movement[item.accountId].entries.push({ type: 'contrib-in', date: isoDate(execContrib), label: `Beitrag ${ACCOUNTS[contrib.sourceAccountId]?.name || '-'}`, amount: cAmount, note: contrib.note || '' });
                if (movement[contrib.sourceAccountId]) {
                    movement[contrib.sourceAccountId].out += cAmount;
                    movement[contrib.sourceAccountId].entries.push({ type: 'contrib-out', date: isoDate(execContrib), label: `Beitrag für ${item.title || '-'}`, amount: -cAmount, note: contrib.note || '' });
                }
            });
        });

        Object.values(RECON).forEach((entry) => {
            if (entry?.type !== 'manual' || !entry?.accountId || !entry?.date) return;
            const date = parseDate(entry.date);
            if (!date || date.getFullYear() !== year || date.getMonth() + 1 !== month || !movement[entry.accountId]) return;
            const value = toNum(entry.value, 0);
            if (value >= 0) movement[entry.accountId].in += value; else movement[entry.accountId].out += Math.abs(value);
            movement[entry.accountId].entries.push({ type: 'manual', date: entry.date, label: 'Manuelle Korrektur', amount: value, note: entry.note || '' });
        });

        accounts.forEach((account) => {
            const start = roundMoney(balances[account.id]);
            const inflow = roundMoney(movement[account.id]?.in || 0);
            const outflow = roundMoney(movement[account.id]?.out || 0);
            let end = roundMoney(start + inflow - outflow);
            const snapshot = monthSnapshots[`${account.id}__${key}`];
            if (snapshot) {
                end = roundMoney(snapshot.value);
                movement[account.id].entries.push({ type: 'snapshot', date: snapshot.date, label: 'Snapshot', amount: end, note: snapshot.note || '' });
            }
            balances[account.id] = end;
            const minBuffer = isPersonAccount(account) ? 0 : roundMoney(account.minBuffer);
            const delta = roundMoney(end - minBuffer);
            let severity = 'ok';
            if (!isPersonAccount(account) && delta < -0.009) severity = 'alarm';
            else if (!isPersonAccount(account) && minBuffer > 0 && delta < Math.max(25, minBuffer * 0.1)) severity = 'warn';
            if (severity !== 'ok') alerts.push({ severity, accountId: account.id, accountName: account.name, monthKey: key, endBalance: end, minBuffer, delta });
            details[`${account.id}__${key}`] = { start, inflow, outflow, end, minBuffer, delta, severity, entries: (movement[account.id]?.entries || []).sort((a, b) => String(a.date).localeCompare(String(b.date))) };
            bucket.accounts[account.id] = { start, inflow, outflow, end, minBuffer, delta, severity };
        });

        timeline.push(bucket);
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }

    const quality = buildQuality(alerts);
    const imbalances = buildContributionImbalances();
    return { timeline, alerts, details, quality, setup: buildSetup(quality, alerts, imbalances), suggestions: suggestions(timeline), imbalances };
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
function qualityEntry(accountId) { return FORECAST.quality.find((entry) => entry.accountId === accountId) || null; }
function forecastCss(severity) { if (severity === 'alarm') return 'bg-red-50 border-red-200 text-red-700'; if (severity === 'warn') return 'bg-amber-50 border-amber-200 text-amber-700'; return 'bg-emerald-50 border-emerald-200 text-emerald-700'; }
function matchItemToken(item, token) {
    const value = normalizeSearchText(token);
    const numeric = value.match(/^(betrag|puffer|diff|differenz)(<=|>=|=|<|>)(-?\d+(?:\.\d+)?)$/);
    if (numeric) {
        const account = ACCOUNTS[item.accountId] || {};
        const row = FORECAST.timeline[0]?.accounts[item.accountId] || {};
        const actual = numeric[1] === 'betrag' ? toNum(item.amount, 0) : numeric[1] === 'puffer' ? toNum(account.minBuffer, 0) : toNum(row.delta, 0);
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
    const sourceOptions = [{ value: '', label: 'Bitte wählen...' }, ...accounts.filter(canBeSourceAccount).map((account) => ({ value: account.id, label: `${account.name || '-'}${isPersonAccount(account) ? ' · Person' : ''}` }))];
    const targetOptions = [{ value: '', label: 'Bitte wählen...' }, ...accounts.filter(canBeTargetAccount).map((account) => ({ value: account.id, label: `${account.name || '-'}${isPersonAccount(account) ? ' · Person' : ''}` }))];
    setSelectOptions(el('ab2-item-account'), accountOptions);
    setSelectOptions(el('ab2-transfer-source'), sourceOptions);
    setSelectOptions(el('ab2-transfer-target'), targetOptions);
    setSelectOptions(el('ab2-recon-account'), accountOptions);
    document.querySelectorAll('.ab2-contrib-source').forEach((select) => setSelectOptions(select, sourceOptions, select.value || ''));
}
function renderDashboard() {
    const items = Object.values(ITEMS);
    const imbalanceWarn = (FORECAST.imbalances || []).filter((entry) => entry.severity === 'warn').length;
    const imbalanceAlarm = (FORECAST.imbalances || []).filter((entry) => entry.severity === 'alarm').length;
    const counts = {
        accounts: Object.keys(ACCOUNTS).length,
        active: items.filter((item) => itemStatus(item).key === 'aktiv').length,
        planned: items.filter((item) => itemStatus(item).key === 'geplant').length,
        past: items.filter((item) => itemStatus(item).key === 'vergangen').length,
        errors: items.filter((item) => itemStatus(item).key === 'fehler').length,
        warnings: FORECAST.alerts.filter((alert) => alert.severity === 'warn').length + imbalanceWarn,
        alarms: FORECAST.alerts.filter((alert) => alert.severity === 'alarm').length + imbalanceAlarm
    };
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
    if (setup) setup.innerHTML = FORECAST.setup.map((entry) => `<div class="rounded-xl border ${entry.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="text-xs font-bold ${entry.ok ? 'text-emerald-700' : 'text-amber-700'}">${entry.ok ? 'OK' : 'PRÜFEN'}</div><div class="text-sm font-bold text-gray-800 mt-1">${escapeHtml(entry.title)}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(entry.text)}</div></div>`).join('');
    const quality = el('ab2-quality-banner');
    const notes = FORECAST.quality.filter((entry) => entry.status !== 'ok').map((entry) => `${ACCOUNTS[entry.accountId]?.name || '-'}: ${entry.text}`);
    if (quality) {
        quality.innerHTML = notes.length ? `<strong>Datenqualität beachten:</strong> ${escapeHtml(notes.join(' · '))}` : '';
        quality.classList.toggle('hidden', !notes.length);
    }
    const imbalance = el('ab2-imbalance-banner');
    if (imbalance) {
        const rows = (FORECAST.imbalances || []).slice(0, 4).map((entry) => `${entry.title}: ${entry.gapPerExecution < 0 ? 'zu wenig' : 'zu viel'} Beitrag (${formatSignedCurrency(entry.gapPerExecution)})`).join(' · ');
        imbalance.innerHTML = rows ? `<strong>Titel-/Beitrags-Ungleichgewicht:</strong> ${escapeHtml(rows)}` : '';
        imbalance.classList.toggle('hidden', !rows);
    }
    const overview = el('ab2-account-overview');
    if (overview) overview.innerHTML = Object.values(ACCOUNTS).length ? Object.values(ACCOUNTS).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((account) => {
        const row = FORECAST.timeline[0]?.accounts[account.id] || {};
        const q = qualityEntry(account.id);
        return `<div class="rounded-lg border ${q?.status === 'alarm' ? 'border-red-200 bg-red-50' : q?.status === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'} p-3"><div class="flex items-start justify-between gap-2"><div><div class="text-sm font-bold text-gray-800">${escapeHtml(account.name || '-')}</div><div class="text-xs text-gray-500">${escapeHtml(isPersonAccount(account) ? 'Person / Quelle' : `${account.bank || 'Bankkonto'} · ${normalizeAccountRole(account)}`)}</div></div><span class="text-[10px] px-2 py-1 rounded-full ${q?.status === 'alarm' ? 'bg-red-100 text-red-700' : q?.status === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${escapeHtml(q?.text || 'aktuell')}</span></div><div class="grid grid-cols-2 gap-2 mt-3 text-xs"><div><div class="text-gray-500">Stand</div><div class="font-bold text-gray-800">${formatCurrency(row.end)}</div></div><div><div class="text-gray-500">Differenz</div><div class="font-bold ${toNum(row.delta, 0) < 0 ? 'text-red-700' : 'text-emerald-700'}">${formatSignedCurrency(row.delta)}</div></div></div></div>`;
    }).join('') : '<p class="text-sm text-gray-400 italic">Noch keine Konten/Quellen.</p>';
    const forecast = el('ab2-forecast-overview');
    if (forecast) {
        const monitored = Object.values(ACCOUNTS).filter((account) => canBeTargetAccount(account) && !isPersonAccount(account));
        forecast.innerHTML = monitored.length && FORECAST.timeline.length ? `<div class="overflow-x-auto"><table class="min-w-full text-xs"><thead><tr><th class="p-2 text-left text-gray-500">Monat</th>${monitored.map((account) => `<th class="p-2 text-left text-gray-500">${escapeHtml(account.name || '-')}</th>`).join('')}</tr></thead><tbody>${FORECAST.timeline.map((bucket) => `<tr class="border-t"><td class="p-2 font-bold text-gray-700">${escapeHtml(bucket.label)}</td>${monitored.map((account) => { const row = bucket.accounts[account.id] || {}; return `<td class="p-2"><button type="button" class="w-full text-left rounded-lg border px-2 py-2 ${forecastCss(row.severity)}" data-forecast-account="${account.id}" data-forecast-month="${bucket.key}"><div class="font-bold">${formatCurrency(row.end)}</div><div class="text-[10px]">Δ ${formatSignedCurrency(row.delta)}</div></button></td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="text-sm text-gray-400 italic">Keine Forecast-Daten.</p>';
    }
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
        return `<tr class="${itemHasAlert(item) ? 'bg-red-50/40' : ''}"><td class="px-3 py-3"><span class="px-2 py-1 rounded-full text-xs font-bold ${status.css}">${status.label}</span></td><td class="px-3 py-3"><div class="font-bold text-gray-800">${escapeHtml(item.title || '-')}</div><div class="text-xs text-gray-500">${escapeHtml(item.notes || '')}</div>${contributionTotal(item) > 0 ? `<div class="mt-1 text-[10px] font-bold text-indigo-700">Beiträge: ${formatCurrency(contributionTotal(item))}</div>` : ''}</td><td class="px-3 py-3 text-sm text-gray-700">${escapeHtml(account.name || '-')}</td><td class="px-3 py-3 text-sm text-gray-700">${escapeHtml(item.typ || '-')}</td><td class="px-3 py-3 text-sm text-gray-700">${escapeHtml(intervalLabel(item.intervalType, item.customMonths || []))}</td><td class="px-3 py-3 text-sm font-bold text-gray-800">${formatCurrency(item.amount)}</td><td class="px-3 py-3 text-sm text-gray-700">${next ? formatDate(next) : '-'}</td><td class="px-3 py-3 text-sm text-gray-700">${formatCurrency(yearly)}</td><td class="px-3 py-3 text-sm font-bold ${effect < 0 ? 'text-red-700' : 'text-emerald-700'}">${formatSignedCurrency(effect)}</td><td class="px-3 py-3 text-sm text-gray-700">${formatDate(item.validFrom)}${item.validTo ? ` → ${formatDate(item.validTo)}` : ''}</td><td class="px-3 py-3 text-center"><div class="flex gap-1 justify-center"><button type="button" class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs" data-item-view="${item.id}">Ansehen</button><button type="button" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs" data-item-edit="${item.id}">Bearbeiten</button><button type="button" class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs" data-item-delete="${item.id}">Löschen</button></div></td></tr>`;
    }).join('');
}
function renderAccounts() {
    const host = el('ab2-accounts-list');
    if (!host) return;
    const search = normalizeSearchText(accountListFilterState.query);
    const accounts = Object.values(ACCOUNTS)
        .filter((account) => accountListFilterState.type === 'all' || normalizeAccountType(account) === accountListFilterState.type)
        .filter((account) => !search || normalizeSearchText(`${account.name || ''} ${account.bank || ''} ${account.iban || ''} ${formatCurrency(account.minBuffer)}`).includes(search))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    host.innerHTML = accounts.length ? accounts.map((account) => {
        const row = FORECAST.timeline[0]?.accounts[account.id] || {};
        const latest = latestSnapshots()[account.id];
        const quality = qualityEntry(account.id);
        const itemCount = Object.values(ITEMS).filter((item) => item.accountId === account.id).length;
        const transferCount = Object.values(TRANSFERS).filter((transfer) => transfer.sourceAccountId === account.id || transfer.targetAccountId === account.id).length;
        return `<div class="rounded-lg border ${editingAccountId === account.id ? 'border-yellow-400 bg-yellow-50 shadow-md' : 'border-gray-200 bg-gray-50'} p-3"><div class="flex items-start justify-between gap-2"><div><div class="font-bold text-gray-800">${escapeHtml(account.name || '-')}</div><div class="text-xs text-gray-500">${escapeHtml(isPersonAccount(account) ? 'Person' : (account.bank || 'Bankkonto'))} · ${escapeHtml(normalizeAccountRole(account))}</div></div><div class="flex gap-1"><button type="button" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs" data-account-edit="${account.id}">Bearbeiten</button><button type="button" class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs" data-account-delete="${account.id}">Löschen</button></div></div><div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs"><div><div class="text-gray-500">Stand</div><div class="font-bold text-gray-800">${formatCurrency(latest?.value)}</div></div><div><div class="text-gray-500">Puffer</div><div class="font-bold text-gray-800">${formatCurrency(account.minBuffer)}</div></div><div><div class="text-gray-500">Differenz</div><div class="font-bold ${toNum(row.delta, 0) < 0 ? 'text-red-700' : 'text-emerald-700'}">${formatSignedCurrency(row.delta)}</div></div><div><div class="text-gray-500">Snapshot</div><div class="font-bold ${quality?.status === 'alarm' ? 'text-red-700' : quality?.status === 'warn' ? 'text-amber-700' : 'text-emerald-700'}">${quality?.latest ? formatDate(quality.latest.date) : 'fehlt'}</div></div></div><div class="mt-2 text-xs text-gray-600">Einträge: ${itemCount} · Transfers: ${transferCount}</div></div>`;
    }).join('') : '<p class="text-sm text-gray-400 italic">Noch keine Konten/Quellen.</p>';
}
function renderTransfers() {
    const host = el('ab2-transfers-list');
    if (!host) return;
    const search = normalizeSearchText(transferListFilterState.query);
    const transfers = Object.values(TRANSFERS)
        .filter((transfer) => {
            if (transferListFilterState.type === 'all') return true;
            const source = ACCOUNTS[transfer.sourceAccountId];
            const target = ACCOUNTS[transfer.targetAccountId];
            const person = isPersonAccount(source) || isPersonAccount(target);
            return transferListFilterState.type === 'person' ? person : !person;
        })
        .filter((transfer) => !search || normalizeSearchText(`${ACCOUNTS[transfer.sourceAccountId]?.name || ''} ${ACCOUNTS[transfer.targetAccountId]?.name || ''} ${transfer.note || ''} ${(Array.isArray(transfer.linkedTitles) ? transfer.linkedTitles : []).join(' ')} ${(Array.isArray(transfer.linkedAccounts) ? transfer.linkedAccounts : []).join(' ')} ${formatCurrency(transfer.amount)} ${intervalLabel(transfer.intervalType, transfer.customMonths || [])}`).includes(search))
        .sort((a, b) => String(ACCOUNTS[a.sourceAccountId]?.name || '').localeCompare(String(ACCOUNTS[b.sourceAccountId]?.name || '')));
    host.innerHTML = transfers.length ? transfers.map((transfer) => {
        const source = ACCOUNTS[transfer.sourceAccountId] || {};
        const target = ACCOUNTS[transfer.targetAccountId] || {};
        const sourceAlert = FORECAST.alerts.find((alert) => alert.accountId === transfer.sourceAccountId);
        const linkedTitles = Array.isArray(transfer.linkedTitles) ? transfer.linkedTitles : [];
        const linkedAccounts = Array.isArray(transfer.linkedAccounts) ? transfer.linkedAccounts : [];
        const linkedChunks = [];
        if (linkedTitles.length) linkedChunks.push(`Titel: ${escapeHtml(linkedTitles.join(', '))}`);
        if (linkedAccounts.length) linkedChunks.push(`Konten: ${escapeHtml(linkedAccounts.join(', '))}`);
        const linkedInfo = linkedChunks.length ? `<div class="mt-1 text-[11px] text-indigo-700">${linkedChunks.join(' · ')}</div>` : '';
        return `<div class="rounded-lg border ${editingTransferId === transfer.id ? 'border-yellow-400 bg-yellow-50 shadow-md' : 'border-gray-200 bg-gray-50'} p-3"><div class="flex items-start justify-between gap-2"><div><div class="font-bold text-gray-800">${escapeHtml(source.name || '-')} → ${escapeHtml(target.name || '-')}</div><div class="text-xs text-gray-500">${escapeHtml(intervalLabel(transfer.intervalType, transfer.customMonths || []))} · nächste Ausführung: ${nextExecutionDate(transfer) ? formatDate(nextExecutionDate(transfer)) : '-'}</div></div><div class="flex gap-1"><button type="button" class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs" data-transfer-edit="${transfer.id}">Bearbeiten</button><button type="button" class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs" data-transfer-delete="${transfer.id}">Löschen</button></div></div><div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs"><div><div class="text-gray-500">Betrag</div><div class="font-bold text-gray-800">${formatCurrency(transfer.amount)}</div></div><div><div class="text-gray-500">Start</div><div class="font-bold text-gray-800">${formatDate(transfer.validFrom)}</div></div><div><div class="text-gray-500">Ende</div><div class="font-bold text-gray-800">${transfer.validTo ? formatDate(transfer.validTo) : 'offen'}</div></div><div><div class="text-gray-500">Quellenlage</div><div class="font-bold ${sourceAlert?.severity === 'alarm' ? 'text-red-700' : sourceAlert?.severity === 'warn' ? 'text-amber-700' : 'text-emerald-700'}">${sourceAlert ? `${sourceAlert.severity} ${monthLabel(sourceAlert.monthKey)}` : 'stabil'}</div></div></div><div class="mt-2 text-xs text-gray-600">${escapeHtml(transfer.note || '')}${linkedInfo}</div></div>`;
    }).join('') : '<p class="text-sm text-gray-400 italic">Noch keine Transferpläne.</p>';
}
function renderRecon() {
    const host = el('ab2-recon-list');
    if (!host) return;
    const recons = Object.values(RECON).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    host.innerHTML = recons.length ? recons.map((entry) => `<div class="rounded-lg border border-gray-200 bg-gray-50 p-3"><div class="flex items-start justify-between gap-2"><div><div class="font-bold text-gray-800">${escapeHtml(ACCOUNTS[entry.accountId]?.name || '-')}</div><div class="text-xs text-gray-500">${entry.type === 'snapshot' ? 'Snapshot' : 'Manuell'} · ${formatDate(entry.date)}</div></div><button type="button" class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs" data-recon-delete="${entry.id}">Löschen</button></div><div class="mt-2 text-sm font-bold ${entry.type === 'snapshot' ? 'text-blue-700' : toNum(entry.value, 0) < 0 ? 'text-red-700' : 'text-emerald-700'}">${entry.type === 'snapshot' ? formatCurrency(entry.value) : formatSignedCurrency(entry.value)}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(entry.note || '')}</div></div>`).join('') : '<p class="text-sm text-gray-400 italic">Noch keine Abgleiche.</p>';
}
function suggestionCard(suggestion) {
    const monthly = suggestion.monthlyAllocations.map((row) => `${row.sourceName}: ${formatCurrency(row.amount)} / Monat`).join(' · ');
    const once = suggestion.onceAllocations.map((row) => `${row.sourceName}: ${formatCurrency(row.amount)} einmalig`).join(' · ');
    return `<div class="rounded-xl border ${suggestion.fullyCovered ? 'border-indigo-200 bg-indigo-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="flex items-start justify-between gap-2"><div><div class="text-sm font-bold text-gray-800">${escapeHtml(suggestion.targetName)}</div><div class="text-xs text-gray-500">kritisch ab ${escapeHtml(suggestion.criticalLabel)} · ${escapeHtml(suggestion.reason)}</div></div><span class="px-2 py-1 rounded-full ${suggestion.fullyCovered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} text-xs font-bold">${suggestion.fullyCovered ? 'abgedeckt' : 'Teilabdeckung'}</span></div><div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-xs"><div><div class="text-gray-500">Monatlich nötig</div><div class="font-bold text-gray-800">${formatCurrency(suggestion.monthlyNeed)}</div></div><div><div class="text-gray-500">Einmalig nötig</div><div class="font-bold text-gray-800">${formatCurrency(suggestion.onceNeed)}</div></div><div><div class="text-gray-500">Rest</div><div class="font-bold ${suggestion.shortfall > 0 ? 'text-amber-700' : 'text-emerald-700'}">${formatCurrency(suggestion.shortfall)}</div></div></div><div class="mt-2 text-xs text-gray-700">${monthly ? `<div><strong>Monatlich:</strong> ${escapeHtml(monthly)}</div>` : ''}${once ? `<div class="mt-1"><strong>Einmalig:</strong> ${escapeHtml(once)}</div>` : ''}${!monthly && !once ? '<div>Keine belastbare Quelle verfügbar. Bitte Snapshots und Einträge prüfen.</div>' : ''}</div><div class="mt-3 flex justify-end">${monthly || once ? `<button type="button" class="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700" data-suggestion-id="${suggestion.id}">Vorschlag übernehmen</button>` : ''}</div></div>`;
}
function renderSuggestionsModal() {
    const list = FORECAST.suggestions || [];
    const preview = el('ab2-suggestion-preview');
    const modal = el('ab2-suggestions-content');
    if (preview) preview.innerHTML = list.length ? list.slice(0, 3).map((suggestion) => suggestionCard(suggestion)).join('') : '<p class="text-sm text-gray-400 italic">Plan aktuell stabil. Keine Vorschläge nötig.</p>';
    if (modal) modal.innerHTML = list.length ? list.map((suggestion) => suggestionCard(suggestion)).join('') : '<p class="text-sm text-gray-400 italic">Keine Vorschläge nötig.</p>';
}
function renderPreviews() {
    const itemAccount = ACCOUNTS[el('ab2-item-account')?.value] || null;
    const itemAmount = toNum(el('ab2-item-amount')?.value, 0);
    const itemType = el('ab2-item-type')?.value || 'belastung';
    if (el('ab2-item-preview')) el('ab2-item-preview').textContent = itemAccount && itemAmount > 0 ? `${itemType === 'gutschrift' ? 'Erhöht' : 'Belastet'} ${itemAccount.name || '-'} mit ${formatCurrency(itemAmount)} ${describeInterval(el('ab2-item-interval')?.value || 'monthly', el('ab2-item-start-month')?.value, parseMonths(el('ab2-item-custom-months')?.value), el('ab2-item-day')?.value)}.` : 'Noch unvollständig.';
    const accType = normalizeAccountType(el('ab2-account-type')?.value || 'bank');
    if (el('ab2-account-preview')) el('ab2-account-preview').textContent = `${el('ab2-account-name')?.value || 'Dieses Konto'} wird als ${accType === 'person' ? 'Person / Geldquelle' : 'Bankkonto'} geführt.${accType === 'person' ? ' Mindestpuffer ist hier absichtlich 0 (keine Unterdeckungsalarme für Personen). Startsaldo ist sinnvoll, wenn bereits Vorleistungen/Schulden bestehen.' : ` Mindestpuffer: ${formatCurrency(el('ab2-account-min-buffer')?.value || 0)}.`}${Number.isFinite(toNum(el('ab2-account-start-balance')?.value, NaN)) ? ` Snapshot-Vorschau: ${formatCurrency(el('ab2-account-start-balance')?.value || 0)} am ${formatDate(el('ab2-account-start-date')?.value)}` : ''}`;
    const transferSource = ACCOUNTS[el('ab2-transfer-source')?.value] || null;
    const transferTarget = ACCOUNTS[el('ab2-transfer-target')?.value] || null;
    const transferAmount = toNum(el('ab2-transfer-amount')?.value, 0);
    const linkedTitles = parseCsvList(el('ab2-transfer-linked-titles')?.value || '');
    const linkedAccounts = parseCsvList(el('ab2-transfer-linked-accounts')?.value || '');
    const transferLinkText = linkedTitles.length || linkedAccounts.length ? ` Zugeordnet zu ${linkedTitles.length ? `Titeln: ${linkedTitles.join(', ')}` : ''}${linkedTitles.length && linkedAccounts.length ? ' | ' : ''}${linkedAccounts.length ? `Konten: ${linkedAccounts.join(', ')}` : ''}.` : '';
    if (el('ab2-transfer-preview')) el('ab2-transfer-preview').textContent = transferSource && transferTarget && transferAmount > 0 ? `${formatCurrency(transferAmount)} fließen von ${transferSource.name || '-'} nach ${transferTarget.name || '-'} ${describeInterval(el('ab2-transfer-interval')?.value || 'monthly', el('ab2-transfer-start-month')?.value, parseMonths(el('ab2-transfer-custom-months')?.value), el('ab2-transfer-day')?.value)}.${transferLinkText}` : 'Noch unvollständig.';
    const reconAccount = ACCOUNTS[el('ab2-recon-account')?.value] || null;
    const reconType = el('ab2-recon-type')?.value || 'snapshot';
    const reconValue = toNum(el('ab2-recon-value')?.value, 0);
    if (el('ab2-recon-preview')) el('ab2-recon-preview').textContent = reconAccount ? (reconType === 'snapshot' ? `Snapshot setzt ${reconAccount.name || '-'} auf ${formatCurrency(reconValue)}.` : `Manuelle Korrektur verändert ${reconAccount.name || '-'} einmalig um ${formatSignedCurrency(reconValue)}.`) : 'Noch unvollständig.';
    const item = ITEMS[el('ab2-item-id')?.value] || null;
    const swapStart = el('ab2-abtausch-new-start')?.value || '';
    const swapAmount = toNum(el('ab2-abtausch-new-amount')?.value, 0);
    if (el('ab2-abtausch-preview')) el('ab2-abtausch-preview').textContent = item && swapStart && swapAmount > 0 ? `${item.title || '-'} endet vor ${formatDate(swapStart)} und läuft ab dann mit ${formatCurrency(swapAmount)} weiter.` : 'Noch keine Vorschau.';
}
function renderAll() { populateSelects(); renderTags(); renderDashboard(); renderTable(); renderAccounts(); renderTransfers(); renderRecon(); renderPreviews(); }
function setItemReadOnly(readOnly) {
    itemReadMode = !!readOnly;
    document.querySelectorAll('#ab2-item-modal input, #ab2-item-modal select, #ab2-item-modal textarea').forEach((node) => {
        if (node.id === 'ab2-item-id') return;
        node.disabled = !!readOnly;
        node.classList.toggle('bg-gray-100', !!readOnly);
        node.classList.toggle('text-gray-500', !!readOnly);
    });
    document.querySelectorAll('#ab2-item-modal .ab2-remove-contrib').forEach((btn) => { btn.style.display = readOnly ? 'none' : 'inline-flex'; });
    if (el('ab2-add-contrib-btn')) el('ab2-add-contrib-btn').style.display = readOnly ? 'none' : 'inline-flex';
    if (el('ab2-item-save-btn')) el('ab2-item-save-btn').style.display = readOnly ? 'none' : 'inline-flex';
    if (el('ab2-item-edit-btn')) el('ab2-item-edit-btn').style.display = readOnly ? 'inline-flex' : 'none';
}
function resetItemForm() {
    if (el('ab2-item-id')) el('ab2-item-id').value = '';
    ['ab2-item-title', 'ab2-item-amount', 'ab2-item-start-month', 'ab2-item-custom-months', 'ab2-item-day', 'ab2-item-valid-to', 'ab2-item-notes'].forEach((id) => { if (el(id)) el(id).value = ''; });
    if (el('ab2-item-type')) el('ab2-item-type').value = 'belastung';
    if (el('ab2-item-interval')) el('ab2-item-interval').value = 'monthly';
    if (el('ab2-item-account')) el('ab2-item-account').value = '';
    if (el('ab2-item-valid-from')) el('ab2-item-valid-from').value = isoDate(new Date());
    if (el('ab2-contrib-list')) el('ab2-contrib-list').innerHTML = '';
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
    if (el('ab2-contrib-list')) el('ab2-contrib-list').innerHTML = '';
    (Array.isArray(item.contributions) ? item.contributions : []).forEach((row) => addContributionRow(row));
    if (el('ab2-item-delete-btn')) el('ab2-item-delete-btn').style.display = item.id ? 'inline-flex' : 'none';
    if (el('ab2-item-abtausch-btn')) el('ab2-item-abtausch-btn').style.display = item.id ? 'inline-flex' : 'none';
    updateMainIntervalFields('ab2-item');
    setItemReadOnly(!!readOnly);
    renderPreviews();
}
function addContributionRow(v = {}) {
    const host = el('ab2-contrib-list');
    if (!host) return;
    const row = document.createElement('div');
    row.className = 'ab2-contrib-row grid grid-cols-1 md:grid-cols-5 gap-2 items-start';
    row.innerHTML = `<select class="ab2-contrib-source w-full p-2 border rounded-lg"></select><input class="ab2-contrib-amount w-full p-2 border rounded-lg" type="text" placeholder="Betrag" value="${Number.isFinite(toNum(v.amount, NaN)) ? toNum(v.amount, 0).toFixed(2) : ''}"><select class="ab2-contrib-interval w-full p-2 border rounded-lg"><option value="inherit">wie Eintrag</option><option value="monthly">monatlich</option><option value="quarterly">quartal</option><option value="semiannual">halbjahr</option><option value="annual">jährlich</option><option value="custom">individuell</option></select><input class="ab2-contrib-custom w-full p-2 border rounded-lg" type="text" placeholder="Monate" value="${Array.isArray(v.customMonths) ? v.customMonths.join(',') : ''}"><div class="flex gap-2"><input class="ab2-contrib-note flex-1 p-2 border rounded-lg" type="text" placeholder="Notiz" value="${escapeHtml(v.note || '')}"><button type="button" class="ab2-remove-contrib px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">×</button></div>`;
    host.appendChild(row);
    populateSelects();
    row.querySelector('.ab2-contrib-source').value = v.sourceAccountId || '';
    row.querySelector('.ab2-contrib-interval').value = v.intervalType || 'inherit';
    updateContributionRowState(row);
}
function collectContribs() {
    return Array.from(document.querySelectorAll('.ab2-contrib-row')).map((row) => ({ sourceAccountId: row.querySelector('.ab2-contrib-source')?.value || '', amount: roundMoney(toNum(row.querySelector('.ab2-contrib-amount')?.value, 0)), intervalType: row.querySelector('.ab2-contrib-interval')?.value || 'inherit', customMonths: parseMonths(row.querySelector('.ab2-contrib-custom')?.value || ''), note: row.querySelector('.ab2-contrib-note')?.value?.trim() || '' })).filter((row) => row.sourceAccountId && row.amount > 0);
}
function resetAccountForm() {
    editingAccountId = '';
    ['ab2-account-id', 'ab2-account-name', 'ab2-account-bank', 'ab2-account-iban', 'ab2-account-min-buffer', 'ab2-account-start-balance'].forEach((id) => { if (el(id)) el(id).value = ''; });
    if (el('ab2-account-type')) el('ab2-account-type').value = 'bank';
    if (el('ab2-account-role')) el('ab2-account-role').value = 'both';
    if (el('ab2-account-start-date')) el('ab2-account-start-date').value = isoDate(new Date());
    updateAccountTypeDependencies();
    renderAccounts();
    renderPreviews();
}
function editAccount(id) {
    const account = ACCOUNTS[id];
    if (!account) return;
    editingAccountId = id;
    const latest = latestSnapshots()[id];
    if (el('ab2-account-id')) el('ab2-account-id').value = account.id || '';
    if (el('ab2-account-name')) el('ab2-account-name').value = account.name || '';
    if (el('ab2-account-bank')) el('ab2-account-bank').value = account.bank || '';
    if (el('ab2-account-iban')) el('ab2-account-iban').value = account.iban || '';
    if (el('ab2-account-type')) el('ab2-account-type').value = account.type || 'bank';
    if (el('ab2-account-role')) el('ab2-account-role').value = account.role || 'both';
    if (el('ab2-account-min-buffer')) el('ab2-account-min-buffer').value = toNum(account.minBuffer, 0).toFixed(2);
    if (el('ab2-account-start-balance')) el('ab2-account-start-balance').value = latest ? toNum(latest.value, 0).toFixed(2) : '';
    if (el('ab2-account-start-date')) el('ab2-account-start-date').value = latest?.date || isoDate(new Date());
    updateAccountTypeDependencies();
    openModal('ab2-accounts-modal');
    renderAccounts();
    renderPreviews();
}
function resetTransferForm() {
    editingTransferId = '';
    ['ab2-transfer-id', 'ab2-transfer-amount', 'ab2-transfer-start-month', 'ab2-transfer-custom-months', 'ab2-transfer-day', 'ab2-transfer-valid-to', 'ab2-transfer-note', 'ab2-transfer-linked-titles', 'ab2-transfer-linked-accounts'].forEach((id) => { if (el(id)) el(id).value = ''; });
    if (el('ab2-transfer-source')) el('ab2-transfer-source').value = '';
    if (el('ab2-transfer-target')) el('ab2-transfer-target').value = '';
    if (el('ab2-transfer-interval')) el('ab2-transfer-interval').value = 'monthly';
    if (el('ab2-transfer-valid-from')) el('ab2-transfer-valid-from').value = isoDate(new Date());
    updateMainIntervalFields('ab2-transfer');
    renderTransfers();
    renderPreviews();
}
function editTransfer(id) {
    const transfer = TRANSFERS[id];
    if (!transfer) return;
    editingTransferId = id;
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
    if (el('ab2-transfer-linked-titles')) el('ab2-transfer-linked-titles').value = Array.isArray(transfer.linkedTitles) ? transfer.linkedTitles.join(', ') : '';
    if (el('ab2-transfer-linked-accounts')) el('ab2-transfer-linked-accounts').value = Array.isArray(transfer.linkedAccounts) ? transfer.linkedAccounts.join(', ') : '';
    updateMainIntervalFields('ab2-transfer');
    openModal('ab2-transfers-modal');
    renderTransfers();
    renderPreviews();
}
function resetReconForm() {
    if (el('ab2-recon-account')) el('ab2-recon-account').value = '';
    ['ab2-recon-value', 'ab2-recon-note'].forEach((id) => { if (el(id)) el(id).value = ''; });
    if (el('ab2-recon-type')) el('ab2-recon-type').value = 'snapshot';
    if (el('ab2-recon-date')) el('ab2-recon-date').value = isoDate(new Date());
    renderPreviews();
}
async function writeAudit(action, entityType, entityId, beforeData = null, afterData = null, context = {}) {
    if (!auditRef || !uid()) return;
    try {
        await addDoc(auditRef, { action, entityType, entityId, beforeData, afterData, context, appModule: 'ABBUCHUNGSBERECHNER_2_TEST', createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp() });
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
    const payload = { title, accountId, typ: el('ab2-item-type')?.value || 'belastung', amount, intervalType, startMonth: intervalType === 'monthly' || intervalType === 'custom' ? null : (parseInt(el('ab2-item-start-month')?.value, 10) || null), customMonths, dayOfMonth: parseInt(el('ab2-item-day')?.value, 10) || 1, validFrom, validTo, notes: el('ab2-item-notes')?.value?.trim() || '', contributions: collectContribs(), createdBy: before?.createdBy || uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    try {
        if (id) {
            await updateDoc(doc(itemsRef, id), payload);
            await writeAudit('update', 'cost_item', id, cloneClean(before), payload, { action: 'save_item' });
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
    if (!window.confirm(`Eintrag "${before.title || '-'}" wirklich löschen?`)) return;
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
    const payload = { name, bank: el('ab2-account-bank')?.value?.trim() || '', iban: el('ab2-account-iban')?.value?.trim() || '', type: normalizeAccountType(el('ab2-account-type')?.value || 'bank'), role: normalizeAccountRole(el('ab2-account-role')?.value || 'both'), minBuffer: roundMoney(toNum(el('ab2-account-min-buffer')?.value, 0)), createdBy: before?.createdBy || uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    const startBalance = toNum(el('ab2-account-start-balance')?.value, NaN);
    const startDate = el('ab2-account-start-date')?.value || '';
    try {
        let accountId = id;
        if (id) {
            await updateDoc(doc(accountsRef, id), payload);
            await writeAudit('update', 'account', id, cloneClean(before), payload, { action: 'save_account' });
        } else {
            const createPayload = { ...payload, createdAt: serverTimestamp(), createdByName: currentUser?.displayName || 'Unbekannt' };
            const ref = await addDoc(accountsRef, createPayload);
            accountId = ref.id;
            await writeAudit('create', 'account', ref.id, null, createPayload, { action: 'create_account' });
        }
        if (Number.isFinite(startBalance) && startDate) await upsertSnapshotEntry(accountId, startDate, startBalance, 'Startsaldo aus Kontoformular');
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
    if (!sourceAccountId || !targetAccountId || sourceAccountId === targetAccountId || amount <= 0 || !validFrom) return alertUser('Bitte Quelle, Ziel, Betrag und Startdatum korrekt ausfüllen.', 'error');
    if (intervalType === 'custom' && !customMonths.length) return alertUser('Bitte bei Individuell mindestens einen Monat angeben.', 'error');
    if (validTo && parseDate(validTo) < parseDate(validFrom)) return alertUser('Gültig bis darf nicht vor Gültig ab liegen.', 'error');
    const before = TRANSFERS[id] || null;
    const linkedTitles = parseCsvList(el('ab2-transfer-linked-titles')?.value || '');
    const linkedAccounts = parseCsvList(el('ab2-transfer-linked-accounts')?.value || '');
    const payload = { sourceAccountId, targetAccountId, amount, intervalType, startMonth: intervalType === 'monthly' || intervalType === 'custom' ? null : (parseInt(el('ab2-transfer-start-month')?.value, 10) || null), customMonths, dayOfMonth: parseInt(el('ab2-transfer-day')?.value, 10) || 1, validFrom, validTo, note: el('ab2-transfer-note')?.value?.trim() || '', linkedTitles, linkedAccounts, createdBy: before?.createdBy || uid(), updatedBy: currentUser?.displayName || 'Unbekannt', updatedAt: serverTimestamp() };
    try {
        if (id) {
            await updateDoc(doc(transfersRef, id), payload);
            await writeAudit('update', 'transfer_plan', id, cloneClean(before), payload, { action: 'save_transfer' });
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
    const type = el('ab2-recon-type')?.value || 'snapshot';
    const date = el('ab2-recon-date')?.value || '';
    const value = toNum(el('ab2-recon-value')?.value, NaN);
    if (!accountId || !date || !Number.isFinite(value)) return alertUser('Bitte Konto, Datum und Wert ausfüllen.', 'error');
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
        const [year, month] = String(suggestion.criticalMonth || currentMonthKey()).split('-').map(Number);
        for (const row of suggestion.monthlyAllocations) {
            const payload = { sourceAccountId: row.sourceId, targetAccountId: suggestion.targetId, amount: row.amount, intervalType: 'monthly', startMonth: null, customMonths: [], dayOfMonth: 1, validFrom: isoDate(new Date()), validTo: '', note: `Automatisch aus AB2-Vorschlag (${suggestion.reason})`, createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
            const ref = await addDoc(transfersRef, payload);
            await writeAudit('create', 'transfer_plan', ref.id, null, payload, { action: 'apply_suggestion_monthly', suggestionId });
        }
        for (const row of suggestion.onceAllocations) {
            const from = `${year}-${String(month).padStart(2, '0')}-01`;
            const until = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth(year, month)).padStart(2, '0')}`;
            const payload = { sourceAccountId: row.sourceId, targetAccountId: suggestion.targetId, amount: row.amount, intervalType: 'custom', startMonth: null, customMonths: [month], dayOfMonth: 1, validFrom: from, validTo: until, note: `Einmaliger AB2-Ausgleich (${suggestion.reason})`, createdBy: uid(), createdByName: currentUser?.displayName || 'Unbekannt', updatedBy: currentUser?.displayName || 'Unbekannt', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
            const ref = await addDoc(transfersRef, payload);
            await writeAudit('create', 'transfer_plan', ref.id, null, payload, { action: 'apply_suggestion_once', suggestionId });
        }
        alertUser('Vorschlag übernommen.', 'success');
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
function openStatInsight(statKey) {
    let html = '<p class="text-sm text-gray-500">Keine Details vorhanden.</p>';
    if (statKey === 'accounts') {
        html = Object.values(ACCOUNTS).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).map((account) => {
            const row = FORECAST.timeline[0]?.accounts[account.id] || {};
            return `<div class="rounded-lg border border-gray-200 p-3"><div class="font-bold text-gray-800">${escapeHtml(account.name || '-')}</div><div class="text-xs text-gray-500 mt-1">Stand ${formatCurrency(row.end)} · Puffer ${formatCurrency(account.minBuffer)} · Differenz ${formatSignedCurrency(row.delta)}</div></div>`;
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
            .map((alert) => `<div class="rounded-lg border ${severity === 'alarm' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="font-bold text-gray-800">${escapeHtml(alert.accountName || '-')}</div><div class="text-xs text-gray-600 mt-1">${escapeHtml(monthLabel(alert.monthKey))} · Endstand ${formatCurrency(alert.endBalance)} · Puffer ${formatCurrency(alert.minBuffer)} · Differenz ${formatSignedCurrency(alert.delta)}</div></div>`)
            .join('');
        const imbalanceRows = (FORECAST.imbalances || [])
            .filter((entry) => entry.severity === severity)
            .map((entry) => `<div class="rounded-lg border ${severity === 'alarm' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} p-3"><div class="font-bold text-gray-800">${escapeHtml(entry.title)}</div><div class="text-xs text-gray-600 mt-1">Konto ${escapeHtml(entry.accountName)} · Pro Ausführung ${formatSignedCurrency(entry.gapPerExecution)} (${entry.gapPerExecution < 0 ? 'zu wenig' : 'zu viel'})</div><div class="text-xs text-gray-600 mt-1">Seit ${entry.referenceMonths} Monat(en): ${formatSignedCurrency(entry.settlementAmount)} → ${entry.actionText}</div></div>`)
            .join('');
        const sections = [];
        if (forecastRows) sections.push(`<div class="space-y-2"><div class="text-xs font-bold uppercase tracking-wide text-gray-500">Konten-Prognose</div>${forecastRows}</div>`);
        if (imbalanceRows) sections.push(`<div class="space-y-2"><div class="text-xs font-bold uppercase tracking-wide text-gray-500">Titel-/Beitrags-Ungleichgewicht</div>${imbalanceRows}</div>`);
        html = sections.join('<div class="h-3"></div>') || html;
        return openDetail(severity === 'alarm' ? 'Alarm-Details' : 'Warnungs-Details', `<div class="space-y-2">${html}</div>`);
    }
    return openDetail('Info', html);
}
function openForecastInsight(accountId, month) {
    const account = ACCOUNTS[accountId];
    const detail = FORECAST.details[`${accountId}__${month}`];
    if (!account || !detail) return;
    const rows = (detail.entries || []).map((entry) => `<tr class="border-t"><td class="p-2 text-xs text-gray-600">${formatDate(entry.date)}</td><td class="p-2 text-sm text-gray-700">${escapeHtml(entry.label || '-')}</td><td class="p-2 text-sm font-bold ${toNum(entry.amount, 0) < 0 ? 'text-red-700' : 'text-emerald-700'}">${entry.type === 'snapshot' ? formatCurrency(entry.amount) : formatSignedCurrency(entry.amount)}</td><td class="p-2 text-xs text-gray-500">${escapeHtml(entry.note || '')}</td></tr>`).join('');
    openDetail(`${account.name || '-'} · ${monthLabel(month)}`, `<div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4"> <div class="rounded-lg bg-gray-50 p-3"><div class="text-xs text-gray-500">Start</div><div class="font-bold text-gray-800">${formatCurrency(detail.start)}</div></div><div class="rounded-lg bg-gray-50 p-3"><div class="text-xs text-gray-500">Zufluss</div><div class="font-bold text-emerald-700">${formatCurrency(detail.inflow)}</div></div><div class="rounded-lg bg-gray-50 p-3"><div class="text-xs text-gray-500">Abfluss</div><div class="font-bold text-red-700">${formatCurrency(detail.outflow)}</div></div><div class="rounded-lg bg-gray-50 p-3"><div class="text-xs text-gray-500">Differenz zu Puffer</div><div class="font-bold ${detail.delta < 0 ? 'text-red-700' : 'text-emerald-700'}">${formatSignedCurrency(detail.delta)}</div></div></div><div class="overflow-x-auto"><table class="min-w-full"><thead><tr><th class="p-2 text-left text-xs font-bold text-gray-500 uppercase">Datum</th><th class="p-2 text-left text-xs font-bold text-gray-500 uppercase">Wirkung</th><th class="p-2 text-left text-xs font-bold text-gray-500 uppercase">Betrag</th><th class="p-2 text-left text-xs font-bold text-gray-500 uppercase">Notiz</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="p-4 text-sm text-gray-400 italic">Keine Bewegungen in diesem Monat.</td></tr>'}</tbody></table></div>`);
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
    on('ab2-open-accounts-modal', 'click', () => { resetAccountForm(); openModal('ab2-accounts-modal'); });
    on('ab2-open-transfers-modal', 'click', () => { resetTransferForm(); openModal('ab2-transfers-modal'); });
    on('ab2-open-recon-modal', 'click', () => { resetReconForm(); openModal('ab2-reconciliation-modal'); });
    on('ab2-open-suggestions-modal', 'click', () => { renderSuggestionsModal(); openModal('ab2-suggestions-modal'); });
    on('ab2-toggle-glossary', 'click', () => el('ab2-glossary')?.classList.toggle('hidden'));

    on('ab2-close-item-modal', 'click', () => closeModal('ab2-item-modal'));
    on('ab2-cancel-item-btn', 'click', () => closeModal('ab2-item-modal'));
    on('ab2-item-save-btn', 'click', saveItem);
    on('ab2-item-edit-btn', 'click', () => setItemReadOnly(false));
    on('ab2-item-delete-btn', 'click', () => deleteItem(el('ab2-item-id')?.value || ''));
    on('ab2-add-contrib-btn', 'click', () => addContributionRow());
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
    on('ab2-accounts-filter-all', 'click', () => { accountListFilterState.type = 'all'; renderAccounts(); });
    on('ab2-accounts-filter-bank', 'click', () => { accountListFilterState.type = 'bank'; renderAccounts(); });
    on('ab2-accounts-filter-person', 'click', () => { accountListFilterState.type = 'person'; renderAccounts(); });
    on('ab2-accounts-search', 'input', (e) => { accountListFilterState.query = e.target.value || ''; renderAccounts(); });

    on('ab2-close-transfers-modal', 'click', () => closeModal('ab2-transfers-modal'));
    on('ab2-save-transfer-btn', 'click', saveTransfer);
    on('ab2-reset-transfer-btn', 'click', resetTransferForm);
    on('ab2-transfer-interval', 'change', () => { updateMainIntervalFields('ab2-transfer'); renderPreviews(); });
    on('ab2-transfers-filter-all', 'click', () => { transferListFilterState.type = 'all'; renderTransfers(); });
    on('ab2-transfers-filter-bank', 'click', () => { transferListFilterState.type = 'bank'; renderTransfers(); });
    on('ab2-transfers-filter-person', 'click', () => { transferListFilterState.type = 'person'; renderTransfers(); });
    on('ab2-transfers-search', 'input', (e) => { transferListFilterState.query = e.target.value || ''; renderTransfers(); });

    on('ab2-close-recon-modal', 'click', () => closeModal('ab2-reconciliation-modal'));
    on('ab2-save-recon-btn', 'click', saveRecon);
    on('ab2-recon-today-btn', 'click', () => { if (el('ab2-recon-date')) el('ab2-recon-date').value = isoDate(new Date()); renderPreviews(); });
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
    ['ab2-item-modal', 'ab2-accounts-modal', 'ab2-transfers-modal', 'ab2-reconciliation-modal', 'ab2-abtausch-modal'].forEach((id) => {
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
    const itemHost = el('ab2-table-body');
    if (itemHost && !itemHost.dataset.listenerAttached) {
        itemHost.addEventListener('click', (e) => {
            const view = e.target.closest('[data-item-view]');
            const edit = e.target.closest('[data-item-edit]');
            const del = e.target.closest('[data-item-delete]');
            if (view) openItem(view.dataset.itemView, true);
            if (edit) openItem(edit.dataset.itemEdit, false);
            if (del) deleteItem(del.dataset.itemDelete);
        });
        itemHost.dataset.listenerAttached = 'true';
    }
    const contribHost = el('ab2-contrib-list');
    if (contribHost && !contribHost.dataset.listenerAttached) {
        contribHost.addEventListener('change', (e) => {
            const interval = e.target.closest('.ab2-contrib-interval');
            if (interval) updateContributionRowState(interval.closest('.ab2-contrib-row'));
        });
        contribHost.addEventListener('click', (e) => {
            const btn = e.target.closest('.ab2-remove-contrib');
            if (btn && !itemReadMode) btn.closest('.ab2-contrib-row')?.remove();
        });
        contribHost.dataset.listenerAttached = 'true';
    }
    const accHost = el('ab2-accounts-list');
    if (accHost && !accHost.dataset.listenerAttached) {
        accHost.addEventListener('click', (e) => {
            const edit = e.target.closest('[data-account-edit]');
            const del = e.target.closest('[data-account-delete]');
            if (edit) editAccount(edit.dataset.accountEdit);
            if (del) deleteAccount(del.dataset.accountDelete);
        });
        accHost.dataset.listenerAttached = 'true';
    }
    const transferHost = el('ab2-transfers-list');
    if (transferHost && !transferHost.dataset.listenerAttached) {
        transferHost.addEventListener('click', (e) => {
            const edit = e.target.closest('[data-transfer-edit]');
            const del = e.target.closest('[data-transfer-delete]');
            if (edit) editTransfer(edit.dataset.transferEdit);
            if (del) deleteTransfer(del.dataset.transferDelete);
        });
        transferHost.dataset.listenerAttached = 'true';
    }
    const reconHost = el('ab2-recon-list');
    if (reconHost && !reconHost.dataset.listenerAttached) {
        reconHost.addEventListener('click', (e) => {
            const del = e.target.closest('[data-recon-delete]');
            if (del) deleteRecon(del.dataset.reconDelete);
        });
        reconHost.dataset.listenerAttached = 'true';
    }
    const suggestionHosts = [el('ab2-suggestion-preview'), el('ab2-suggestions-content')].filter(Boolean);
    suggestionHosts.forEach((host) => {
        if (!host.dataset.listenerAttached) {
            host.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-suggestion-id]');
                if (btn) applySuggestion(btn);
            });
            host.dataset.listenerAttached = 'true';
        }
    });
    const forecast = el('ab2-forecast-overview');
    if (forecast && !forecast.dataset.listenerAttached) {
        forecast.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-forecast-account]');
            if (!btn) return;
            openForecastInsight(btn.dataset.forecastAccount, btn.dataset.forecastMonth);
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

    const rerender = () => { FORECAST = buildForecast(); renderAll(); };
    unsubAccounts = onSnapshot(query(accountsRef, where('createdBy', '==', userId)), (snap) => { ACCOUNTS = {}; snap.forEach((d) => { ACCOUNTS[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 accounts listener:', error));
    unsubItems = onSnapshot(query(itemsRef, where('createdBy', '==', userId)), (snap) => { ITEMS = {}; snap.forEach((d) => { ITEMS[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 items listener:', error));
    unsubTransfers = onSnapshot(query(transfersRef, where('createdBy', '==', userId)), (snap) => { TRANSFERS = {}; snap.forEach((d) => { TRANSFERS[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 transfers listener:', error));
    unsubRecon = onSnapshot(query(reconRef, where('createdBy', '==', userId)), (snap) => { RECON = {}; snap.forEach((d) => { RECON[d.id] = { id: d.id, ...d.data() }; }); rerender(); }, (error) => console.error('AB2 recon listener:', error));
    unsubAudit = onSnapshot(query(auditRef, where('createdBy', '==', userId)), (snap) => { AUDIT = {}; snap.forEach((d) => { AUDIT[d.id] = { id: d.id, ...d.data() }; }); }, (error) => console.error('AB2 audit listener:', error));
}

export function stopAbbuchungsberechner2Listeners() {
    if (unsubAccounts) { unsubAccounts(); unsubAccounts = null; }
    if (unsubItems) { unsubItems(); unsubItems = null; }
    if (unsubTransfers) { unsubTransfers(); unsubTransfers = null; }
    if (unsubRecon) { unsubRecon(); unsubRecon = null; }
    if (unsubAudit) { unsubAudit(); unsubAudit = null; }
    ACCOUNTS = {};
    ITEMS = {};
    TRANSFERS = {};
    RECON = {};
    AUDIT = {};
    FORECAST = { timeline: [], alerts: [], details: {}, quality: [], setup: [], suggestions: [], imbalances: [] };
}

export function initializeAbbuchungsberechner2() {
    if (!db) return;
    ensureShell();
    bindEvents();
    ensureRefs();
    populateSelects();
    attachListeners();
    renderAll();
    if (getUserSetting('ab2_filter_open') === '1') {
        const w = el('ab2-filter-controls-wrapper');
        const i = el('ab2-toggle-filter-icon');
        if (w) w.classList.remove('hidden');
        if (i) i.classList.add('rotate-180');
    }
}
