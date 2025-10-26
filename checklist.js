/* checklist.js
   Vollständige, defensive, konsolidierte Datei zum 1:1 Ersetzen.
   - Beinhaltet alle nötigen Exports, Fallbacks und window‑Zuweisungen
   - Robust gegen fehlende Firestore-Umgebung (lokale Fallbacks)
   - Delegated Event-Handling, keine mehrfachen Listener
   - Enthält populatePersonDropdown (wird von anderen Modulen importiert)
*/

/* =========================
   IMPORTS (Firestore + lokale Module)
   ========================= */
import { query, where, orderBy, onSnapshot, collection, doc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { updateUIForMode } from './log-InOut.js';

// Haupteingang: die Datei liefert zentrale Collection-Refs und globale Caches.
// Wichtig: die importierten Namen müssen in haupteingang.js tatsächlich exportiert werden.
import {
  checklistItemsCollectionRef,
  DELETED_CHECKLISTS,
  ARCHIVED_CHECKLISTS,
  CHECKLIST_ITEMS,
  checklistGroupsCollectionRef,
  checklistsCollectionRef,
  CHECKLISTS,
  alertUser as importedAlertUser,
  CHECKLIST_GROUPS,
  checklistCategoriesCollectionRef,
  CHECKLIST_CATEGORIES,
  db,
  appId,
  TEMPLATES,
  USERS
} from './haupteingang.js';

/* =========================
   Defensive helpers & globals
   ========================= */

// If imported alertUser missing, fallback to console-based notifier
const alertUser = (typeof importedAlertUser === 'function') ? importedAlertUser : function (msg, type = 'info') {
  // type: 'success' | 'error' | 'info'
  if (type === 'error') console.error('ALERT:', msg);
  else console.log('ALERT:', msg);
};

// Small HTML escape helper
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Firestore availability check
const hasFirestore = (typeof addDoc === 'function' && typeof updateDoc === 'function' && typeof deleteDoc === 'function' && typeof onSnapshot === 'function');

/* =========================
   Sicheres Setup globaler Caches ohne TDZ-Abhängigkeit
   (vermeidet ReferenceError bei zirkulären Imports)
   ========================= */

function _ensureGlobalCache(globalName, importedBinding) {
  try {
    // Versuch, vorhandenes window[globalName] zu nutzen oder auf das importierte Binding zurückzufallen.
    // Wenn das importierteBinding noch nicht initialisiert ist (TDZ wegen circular import),
    // wirft die Expression und wir fangen den Fehler weiter unten ab.
    window[globalName] = window[globalName] || importedBinding || {};
  } catch (e) {
    // Fallback: importiertes Binding war nicht erreichbar (TDZ) — setze mindestens ein leeres Objekt
    window[globalName] = window[globalName] || {};
  }
}

// Verwende die helper-Funktion für alle globalen Caches, die evtl. per Import kommen
_ensureGlobalCache('CHECKLISTS', typeof CHECKLISTS !== 'undefined' ? CHECKLISTS : undefined);
_ensureGlobalCache('CHECKLIST_GROUPS', typeof CHECKLIST_GROUPS !== 'undefined' ? CHECKLIST_GROUPS : undefined);
_ensureGlobalCache('CHECKLIST_CATEGORIES', typeof CHECKLIST_CATEGORIES !== 'undefined' ? CHECKLIST_CATEGORIES : undefined);

// Elemente, die möglicherweise nicht per import kommen — setze Fallbacks
_ensureGlobalCache('CHECKLIST_STACKS', typeof CHECKLIST_STACKS !== 'undefined' ? CHECKLIST_STACKS : undefined);
_ensureGlobalCache('CHECKLIST_ITEMS', typeof CHECKLIST_ITEMS !== 'undefined' ? CHECKLIST_ITEMS : undefined);
_ensureGlobalCache('TEMPLATES', typeof TEMPLATES !== 'undefined' ? TEMPLATES : undefined);
_ensureGlobalCache('TEMPLATE_ITEMS', typeof TEMPLATE_ITEMS !== 'undefined' ? TEMPLATE_ITEMS : undefined);
_ensureGlobalCache('USERS', typeof USERS !== 'undefined' ? USERS : undefined);
_ensureGlobalCache('ARCHIVED_CHECKLISTS', typeof ARCHIVED_CHECKLISTS !== 'undefined' ? ARCHIVED_CHECKLISTS : undefined);
_ensureGlobalCache('DELETED_CHECKLISTS', typeof DELETED_CHECKLISTS !== 'undefined' ? DELETED_CHECKLISTS : undefined);
/* =========================
   Utility / UI helper functions
   ========================= */

export function populatePersonDropdown(selectedId = '') {
  const sel = document.getElementById('person-select');
  if (!sel) return null;
  const users = Object.values(window.USERS || {});
  const html = ['<option value="">Person wählen...</option>'].concat(users.map(u => {
    const label = escapeHtml(u.name || u.displayName || u.email || u.id || '');
    return `<option value="${u.id}" ${String(u.id) === String(selectedId) ? 'selected' : ''}>${label}</option>`;
  })).join('');
  sel.innerHTML = html;
  return sel;
}
window.populatePersonDropdown = populatePersonDropdown;

/* =========================
   Main: Checklist View
   ========================= */

export function renderChecklistView(listId) {
  const view = document.getElementById('checklistView');
  if (!view) return;
  view.innerHTML = `
    <div class="back-link-container w-full mb-2">
      <button class="back-link flex items-center text-gray-600 hover:text-indigo-600 transition" data-target="home">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 mr-1"><path d="m15 18-6-6 6-6" /></svg>
        <span class="text-sm font-semibold">zurück</span>
      </button>
      <div class="border-t border-gray-300 mt-2"></div>
    </div>
    <div id="checklist-content-wrapper"></div>
  `;
  const content = view.querySelector('#checklist-content-wrapper');
  if (!content) return;

  const hasLists = Object.keys(window.CHECKLISTS || {}).length > 0;
  if (!listId || !window.CHECKLISTS[listId]) {
    const message = !hasLists ? "Keine Checkliste vorhanden. Bitte erstellen Sie zuerst eine in den Einstellungen." : "Keine Standard-Checkliste ausgewählt. Bitte wählen Sie eine in den Einstellungen.";
    content.innerHTML = `<p class="text-center text-gray-500 mt-8">${escapeHtml(message)}</p>`;
    return;
  }

  view.dataset.currentListId = listId;

  content.innerHTML = `
    <div class="bg-white p-3 rounded-lg shadow-sm mb-4 flex justify-between items-center">
      <h2 class="text-lg font-semibold text-gray-800">${escapeHtml(window.CHECKLISTS[listId].name || '—')}</h2>
      <div class="flex gap-2">
        <button id="open-checklist-settings-btn" class="py-1 px-3 bg-indigo-600 text-white rounded">Einstellungen</button>
      </div>
    </div>
    <div id="checklist-main-items" class="space-y-2"></div>
  `;

  // render items
  renderChecklistItems(listId);

  const settingsBtn = document.getElementById('open-checklist-settings-btn');
  if (settingsBtn) settingsBtn.addEventListener('click', () => {
    // prefer existing app navigation if available
    if (typeof renderChecklistSettingsView === 'function') renderChecklistSettingsView(listId);
  });
}
window.renderChecklistView = renderChecklistView;

/* =========================
   Items rendering
   ========================= */
export function renderChecklistItems(listId) {
  const container = document.getElementById('checklist-main-items');
  if (!container) return;
  const items = (window.CHECKLIST_ITEMS[listId] || []).slice();
  if (!items.length) {
    container.innerHTML = '<p class="text-sm text-gray-500">Noch keine Einträge.</p>';
    return;
  }
  items.sort((a,b) => (b.important?1:0)-(a.important?1:0));
  container.innerHTML = items.map((it, idx) => `
    <div class="p-2 rounded border flex justify-between items-center ${it.important ? 'bg-yellow-50' : 'bg-white'}" data-item-id="${it.id}">
      <div>
        <div class="text-sm font-semibold">${escapeHtml(it.text || '')}</div>
        <div class="text-xs text-gray-500">von ${escapeHtml(it.addedBy || '')}</div>
      </div>
      <div>
        <input type="checkbox" class="main-check-item-cb" data-id="${it.id}" ${it.status === 'done' ? 'checked' : ''}>
      </div>
    </div>
  `).join('');

  if (!container.dataset._listener) {
    container.addEventListener('change', async (e) => {
      const cb = e.target.closest('.main-check-item-cb');
      if (!cb) return;
      const id = cb.dataset.id;
      try {
        if (hasFirestore && checklistItemsCollectionRef && typeof updateDoc === 'function' && typeof doc === 'function') {
          await updateDoc(doc(checklistItemsCollectionRef, id), { status: cb.checked ? 'done' : 'open', lastActionBy: window.currentUser?.displayName || 'System', lastActionAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null });
        } else {
          // local fallback
          for (const lid of Object.keys(window.CHECKLIST_ITEMS || {})) {
            window.CHECKLIST_ITEMS[lid] = (window.CHECKLIST_ITEMS[lid] || []).map(i => i.id === id ? { ...i, status: cb.checked ? 'done' : 'open' } : i);
          }
          const current = document.getElementById('checklistView')?.dataset.currentListId;
          renderChecklistItems(current);
        }
      } catch (err) {
        console.error('Error updating item status', err);
        alertUser('Fehler beim Speichern des Eintrags.', 'error');
      }
    });
    container.dataset._listener = '1';
  }
}
window.renderChecklistItems = renderChecklistItems;

/* =========================
   SETTINGS UI: renderChecklistSettingsView
   - builds all cards and attaches delegated handlers
   ========================= */

export function renderChecklistSettingsView(editListId = null) {
  const view = document.getElementById('checklistSettingsView');
  if (!view) return;

  window.currentUser = window.currentUser || { id: null, displayName: 'Gast', permissions: [] };
  window.adminSettings = window.adminSettings || {};

  const hasLists = Object.keys(window.CHECKLISTS || {}).length > 0;
  const listToEditId = editListId || view.dataset.editingListId || (hasLists ? Object.keys(window.CHECKLISTS)[0] : null);
  view.dataset.editingListId = listToEditId || '';

  // Build base UI (full replaces to avoid duplication)
  view.innerHTML = `
    <div class="back-link-container w-full mb-2"></div>
    <h2 class="text-2xl font-bold text-gray-800 mb-4">Checklisten-Einstellungen</h2>
    <div id="settings-tabs" class="grid grid-cols-2 sm:grid-cols-4 gap-1 border rounded-lg bg-gray-100 p-1 mb-4">
      <button data-target-card="card-default-list" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Standard</button>
      <button data-target-card="card-manage-lists" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Gruppen & Listen</button>
      <button data-target-card="card-categories" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Kategorien</button>
      <button data-target-card="card-templates" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Stack & Container</button>
    </div>

    <div id="card-default-list" class="settings-card hidden p-4 bg-white rounded-lg mb-4"></div>
    <div id="card-manage-lists" class="settings-card hidden p-4 bg-white rounded-lg mb-4"></div>
    <div id="card-categories" class="settings-card hidden p-4 bg-white rounded-lg mb-4"></div>
    <div id="card-templates" class="settings-card hidden p-4 bg-white rounded-lg mb-4"></div>

    <div id="card-list-item-editor" class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-green-500 mt-6"></div>
  `;

  // Fill cards
  view.querySelector('#card-default-list').innerHTML = `
    <h3 class="font-bold text-gray-800 mb-2">Globale Standard-Checkliste</h3>
    <div class="flex gap-2"><select id="checklist-settings-default-group-switcher" class="w-1/2 p-2 border rounded bg-white"></select><select id="checklist-settings-default-list-switcher" class="w-1/2 p-2 border rounded bg-white" disabled><option>...</option></select></div>
  `;

  view.querySelector('#card-manage-lists').innerHTML = `
    <h3 class="font-bold text-gray-800 mb-2">Gruppen & Listen verwalten</h3>
    <div class="p-3 bg-gray-50 rounded mb-4">
      <div class="flex items-center gap-2">
        <select id="manage-groups-dropdown" class="flex-grow p-2 border rounded bg-white"></select>
        <button id="edit-selected-group-btn" class="p-2 bg-blue-100 text-blue-600 rounded">✎</button>
        <button id="delete-selected-group-btn" class="p-2 bg-red-100 text-red-600 rounded">🗑</button>
      </div>
      <div id="create-group-form" class="hidden mt-3 flex gap-2">
        <input id="checklist-settings-new-group-name" class="flex-grow p-2 border rounded" placeholder="Name für neue Gruppe...">
        <button id="checklist-settings-create-group-btn" class="py-2 px-3 bg-blue-600 text-white rounded">Erstellen</button>
      </div>
      <button id="show-create-group-form-btn" class="mt-2 text-sm text-blue-600">+ Neue Gruppe erstellen</button>
    </div>

    <div class="p-3 bg-gray-50 rounded">
      <h4 class="font-semibold text-sm">Neue Liste erstellen</h4>
      <input id="checklist-settings-new-name" class="w-full p-2 border rounded mb-2" placeholder="Name der neuen Liste...">
      <select id="checklist-settings-new-group-selector" class="w-full p-2 border rounded mb-2"></select>
      <button id="checklist-settings-create-list-btn" class="w-full py-2 bg-green-600 text-white rounded">Liste erstellen</button>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2">
      <button id="show-archived-lists-btn" class="py-2 bg-gray-100 rounded">Archiv</button>
      <button id="show-deleted-lists-btn" class="py-2 bg-gray-100 rounded">Papierkorb</button>
    </div>
  `;

  view.querySelector('#card-categories').innerHTML = `
    <h3 class="font-bold text-gray-800 mb-2">Kategorien verwalten</h3>
    <p class="text-sm text-gray-600 mb-3">Wähle eine Gruppe.</p>
    <select id="category-group-selector" class="w-full p-2 border rounded mb-4"></select>
    <div id="category-content"><p class="text-sm text-center text-gray-500">Bitte Gruppe wählen.</p></div>
  `;

  view.querySelector('#card-templates').innerHTML = `
    <h3 class="font-bold text-gray-800 mb-2">Stack & Container verwalten</h3>
    <div class="p-3 bg-gray-50 rounded mb-4">
      <div class="flex items-center gap-2">
        <select id="manage-stacks-dropdown" class="flex-grow p-2 border rounded bg-white"></select>
        <button id="show-create-stack-form-btn" class="text-sm text-blue-600">+ Neuen Stack erstellen</button>
      </div>
      <div id="create-stack-form" class="hidden mt-3 flex gap-2">
        <input id="checklist-settings-new-stack-name" class="flex-grow p-2 border rounded" placeholder="Name für neuen Stack...">
        <button id="checklist-settings-create-stack-btn" class="py-2 px-3 bg-blue-600 text-white rounded">Erstellen</button>
      </div>
    </div>

    <div class="p-3 bg-gray-50 rounded">
      <input id="checklist-settings-new-container-name" class="w-full p-2 border rounded mb-2" placeholder="Name des neuen Containers...">
      <select id="checklist-settings-new-stack-selector" class="w-full p-2 border rounded mb-2"><option value="">Stack wählen...</option></select>
      <button id="checklist-settings-create-container-btn" class="w-full py-2 bg-green-600 text-white rounded">Container erstellen</button>
    </div>

    <div id="container-list-editor" class="mt-4"></div>
  `;

  // list-item-editor (green box)
  view.querySelector('#card-list-item-editor').innerHTML = `
    <div class="flex gap-2 items-center mb-3">
      <select id="checklist-settings-editor-switcher" class="flex-grow p-2 border rounded bg-white"></select>
      <button id="show-template-modal-btn" class="p-2 bg-teal-100 rounded">+C</button>
      <button id="checklist-archive-list-btn" class="p-2 bg-yellow-100 rounded">📦</button>
    </div>

    <div class="mb-4 p-2 bg-gray-100 rounded">
      <div id="group-display-container" class="flex justify-between items-center">
        <p class="text-sm">Aktuelle Gruppe: <span id="current-group-name" class="font-bold">—</span></p>
        <button id="edit-group-assignment-btn" class="text-sm text-blue-600">ändern</button>
      </div>
      <div id="group-edit-container" class="hidden mt-2 flex gap-2">
        <select id="checklist-group-assign-switcher" class="flex-grow p-2 border rounded bg-white"></select>
        <button id="checklist-save-group-assignment" class="py-2 px-3 bg-blue-600 text-white rounded">Speichern</button>
      </div>
    </div>

    <div class="p-3 bg-gray-50 rounded mb-4">
      <input id="checklist-settings-add-text" class="w-full p-2 border rounded mb-2" placeholder="Neuer Eintrag...">
      <div class="grid grid-cols-2 gap-2 mb-2">
        <select id="checklist-settings-add-assignee" class="p-2 border rounded bg-white">${Object.values(window.USERS||{}).map(u=>`<option value="${u.id}">${escapeHtml(u.name||u.displayName||'')}</option>`).join('')}</select>
        <select id="checklist-settings-add-category" class="p-2 border rounded bg-white"><option value="">Keine Kategorie</option></select>
      </div>
      <div class="flex items-center gap-2 mb-2"><input id="checklist-settings-add-important" type="checkbox"><label for="checklist-settings-add-important">Als wichtig markieren</label></div>
      <button id="checklist-settings-add-item-btn" class="w-full py-2 bg-blue-600 text-white rounded">Eintrag hinzufügen</button>
    </div>

    <div id="checklist-items-editor-container" class="space-y-2 mb-4"></div>
  `;

  /* Helpers to rebuild selects deterministically */
  function rebuildGroupSelects() {
    const groups = Object.values(window.CHECKLIST_GROUPS || {}).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    const manage = view.querySelector('#manage-groups-dropdown');
    const newListSel = view.querySelector('#checklist-settings-new-group-selector');
    const catSel = view.querySelector('#category-group-selector');
    const assignSel = view.querySelector('#checklist-group-assign-switcher');
    if (manage) { const prev = manage.value; manage.innerHTML = groups; if (prev) manage.value = prev; }
    if (newListSel) { const prev = newListSel.value; newListSel.innerHTML = `<option value="">Gruppe für neue Liste wählen...</option>` + groups; if (prev) newListSel.value = prev; }
    if (catSel) { const prev = catSel.value; catSel.innerHTML = `<option value="">Gruppe wählen...</option>` + groups; if (prev) catSel.value = prev; }
    if (assignSel) { const prev = assignSel.value; assignSel.innerHTML = `<option value="">(Keine)</option>` + groups; if (prev) assignSel.value = prev; }
  }

  function rebuildStackSelects() {
    const stacksHtml = Object.values(window.CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const ms = view.querySelector('#manage-stacks-dropdown');
    const newContainerSel = view.querySelector('#checklist-settings-new-stack-selector');
    if (ms) { const p = ms.value; ms.innerHTML = stacksHtml; if (p) ms.value = p; }
    if (newContainerSel) { const p = newContainerSel.value; newContainerSel.innerHTML = `<option value="">Stack wählen...</option>` + stacksHtml; if (p) newContainerSel.value = p; }
  }

  function rebuildEditorSwitcher() {
    const editor = view.querySelector('#checklist-settings-editor-switcher');
    if (!editor) return;
    const html = Object.values(window.CHECKLIST_GROUPS || {}).map(g => {
      const lists = Object.values(window.CHECKLISTS || {}).filter(l => l.groupId === g.id);
      if (!lists.length) return '';
      return `<optgroup label="${escapeHtml(g.name)}">${lists.map(l=>`<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}</optgroup>`;
    }).join('');
    editor.innerHTML = html || `<option value="">Keine Listen vorhanden</option>`;
  }

  /* Delegated handler (attach once) */
  if (!view.dataset.settingsDelegationAttached) {
    view.addEventListener('click', async (e) => {
      try {
        const t = e.target;
        // Tab switching
        const tabBtn = t.closest('.settings-tab-btn');
        if (tabBtn) {
          const target = tabBtn.dataset.targetCard;
          view.querySelectorAll('.settings-tab-btn').forEach(b => { b.classList.remove('bg-white','shadow','text-indigo-600'); b.classList.add('text-gray-600'); });
          view.querySelectorAll('.settings-card').forEach(c => c.classList.add('hidden'));
          tabBtn.classList.add('bg-white','shadow','text-indigo-600'); tabBtn.classList.remove('text-gray-600');
          const card = view.querySelector('#' + target);
          if (card) card.classList.remove('hidden');
          if (target === 'card-manage-lists') { rebuildGroupSelects(); rebuildEditorSwitcher(); }
          if (target === 'card-categories') { rebuildGroupSelects(); }
          if (target === 'card-templates') { rebuildStackSelects(); renderContainerList && renderContainerList(); }
          return;
        }

        // Show create group form
        if (t.closest('#show-create-group-form-btn')) {
          view.querySelector('#create-group-form')?.classList.remove('hidden');
          t.closest('#show-create-group-form-btn')?.classList.add('hidden');
          return;
        }

        // Create group
        if (t.closest('#checklist-settings-create-group-btn')) {
          const name = view.querySelector('#checklist-settings-new-group-name')?.value.trim();
          if (!name) return alertUser('Bitte Gruppennamen eingeben.', 'error');
          try {
            if (hasFirestore && checklistGroupsCollectionRef) {
              await addDoc(checklistGroupsCollectionRef, { name });
            } else {
              const id = String(Date.now());
              window.CHECKLIST_GROUPS[id] = { id, name };
            }
            view.querySelector('#checklist-settings-new-group-name').value = '';
            rebuildGroupSelects(); rebuildEditorSwitcher();
            alertUser('Gruppe erstellt.', 'success');
          } catch (err) {
            console.error('Creating group failed', err);
            alertUser('Fehler beim Erstellen der Gruppe.', 'error');
          }
          return;
        }

        // Rename group
        if (t.closest('#edit-selected-group-btn')) {
          const sel = view.querySelector('#manage-groups-dropdown'); const id = sel?.value;
          if (!id) return alertUser('Bitte zuerst eine Gruppe auswählen.', 'error');
          const newName = prompt('Neuer Name für die Gruppe:', window.CHECKLIST_GROUPS[id]?.name || '');
          if (newName === null) return;
          const trimmed = newName.trim(); if (!trimmed) return alertUser('Name darf nicht leer sein.', 'error');
          try {
            if (hasFirestore && checklistGroupsCollectionRef) {
              await updateDoc(doc(checklistGroupsCollectionRef, id), { name: trimmed });
            } else {
              window.CHECKLIST_GROUPS[id].name = trimmed;
            }
            rebuildGroupSelects(); rebuildEditorSwitcher();
            alertUser('Gruppe umbenannt.', 'success');
          } catch (err) {
            console.error('Rename group failed', err);
            alertUser('Fehler beim Umbennen.', 'error');
          }
          return;
        }

        // Delete group
        if (t.closest('#delete-selected-group-btn')) {
          const sel = view.querySelector('#manage-groups-dropdown'); const id = sel?.value;
          if (!id) return alertUser('Bitte eine Gruppe auswählen.', 'error');
          if (!confirm('Gruppe wirklich löschen?')) return;
          try {
            if (hasFirestore && typeof writeBatch === 'function') {
              const batch = writeBatch(db);
              Object.values(window.CHECKLISTS || {}).filter(l => l.groupId === id).forEach(l => batch.update(doc(checklistsCollectionRef, l.id), { isDeleted: true }));
              batch.delete(doc(checklistGroupsCollectionRef, id));
              await batch.commit();
            } else {
              Object.values(window.CHECKLISTS || {}).forEach(l => { if (l.groupId === id) l.isDeleted = true; });
              delete window.CHECKLIST_GROUPS[id];
            }
            rebuildGroupSelects(); rebuildEditorSwitcher();
            alertUser('Gruppe gelöscht.', 'success');
          } catch (err) {
            console.error('Delete group failed', err);
            alertUser('Fehler beim Löschen.', 'error');
          }
          return;
        }

        // Edit group assignment
        if (t.closest('#edit-group-assignment-btn')) {
          view.querySelector('#group-display-container')?.classList.add('hidden');
          view.querySelector('#group-edit-container')?.classList.remove('hidden');
          rebuildGroupSelects();
          return;
        }
        if (t.closest('#checklist-save-group-assignment')) {
          const assignSel = view.querySelector('#checklist-group-assign-switcher'); const newGroup = assignSel?.value || null;
          const editorSwitcher = view.querySelector('#checklist-settings-editor-switcher'); const listId = editorSwitcher?.value;
          if (!listId) return alertUser('Bitte Liste auswählen.', 'error');
          try {
            if (hasFirestore && checklistsCollectionRef) {
              await updateDoc(doc(checklistsCollectionRef, listId), { groupId: newGroup || null, groupName: newGroup ? (window.CHECKLIST_GROUPS[newGroup]?.name || null) : null });
            } else {
              window.CHECKLISTS[listId].groupId = newGroup || null;
              window.CHECKLISTS[listId].groupName = newGroup ? (window.CHECKLIST_GROUPS[newGroup]?.name || null) : null;
            }
            view.querySelector('#group-edit-container')?.classList.add('hidden');
            view.querySelector('#group-display-container')?.classList.remove('hidden');
            rebuildEditorSwitcher();
            alertUser('Gruppenzuordnung gespeichert.', 'success');
          } catch (err) {
            console.error('Saving group assignment failed', err);
            alertUser('Fehler beim Speichern der Gruppenzuordnung.', 'error');
          }
          return;
        }

        // Add list item
        if (t.closest('#checklist-settings-add-item-btn')) {
          const text = view.querySelector('#checklist-settings-add-text')?.value.trim();
          const listId = view.querySelector('#checklist-settings-editor-switcher')?.value;
          const important = !!view.querySelector('#checklist-settings-add-important')?.checked;
          const category = view.querySelector('#checklist-settings-add-category')?.value || null;
          const assignee = view.querySelector('#checklist-settings-add-assignee')?.value || null;
          if (!text || !listId) return alertUser('Bitte Text und Liste wählen.', 'error');
          const payload = { listId, text, status: 'open', important, addedBy: window.currentUser?.displayName || 'Unbekannt', addedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null, categoryId: category || null, assignedTo: assignee || null };
          try {
            if (hasFirestore && checklistItemsCollectionRef) {
              await addDoc(checklistItemsCollectionRef, payload);
            } else {
              window.CHECKLIST_ITEMS[listId] = window.CHECKLIST_ITEMS[listId] || [];
              window.CHECKLIST_ITEMS[listId].push({ id: String(Date.now()), ...payload });
              renderChecklistSettingsItems(listId);
            }
            view.querySelector('#checklist-settings-add-text').value = '';
            alertUser('Eintrag hinzugefügt.', 'success');
          } catch (err) {
            console.error('Add item failed', err);
            alertUser('Fehler beim Hinzufügen des Eintrags.', 'error');
          }
          return;
        }

        // Template modal open
        if (t.closest('#show-template-modal-btn')) {
          const listId = view.querySelector('#checklist-settings-editor-switcher')?.value;
          if (!listId) return alertUser('Bitte zuerst eine Liste auswählen.', 'error');
          if (typeof openTemplateModal === 'function') openTemplateModal(listId);
          return;
        }

        // Archive / Deleted lists
        if (t.closest('#show-archived-lists-btn')) {
          renderArchivedListsModal && renderArchivedListsModal();
          document.getElementById('archivedListsModal') && (document.getElementById('archivedListsModal').style.display = 'flex');
          return;
        }
        if (t.closest('#show-deleted-lists-btn')) {
          renderDeletedListsModal && renderDeletedListsModal();
          document.getElementById('deletedListsModal') && (document.getElementById('deletedListsModal').style.display = 'flex');
          return;
        }

      } catch (err) {
        console.error('Error in settings delegated handler', err);
      }
    }, true);
    view.dataset.settingsDelegationAttached = '1';
  }

  // populate selects
  rebuildGroupSelects();
  rebuildStackSelects();
  rebuildEditorSwitcher();

  // editor switcher change - attach once
  const editorSwitcher = view.querySelector('#checklist-settings-editor-switcher');
  if (editorSwitcher && !editorSwitcher.dataset.changeAttached) {
    editorSwitcher.addEventListener('change', (e) => {
      const val = e.target.value;
      renderChecklistSettingsItems(val);
      const span = view.querySelector('#current-group-name');
      const list = val ? window.CHECKLISTS[val] : null;
      span && (span.textContent = list ? (list.groupName || window.CHECKLIST_GROUPS[list.groupId]?.name || '—') : '—');
    });
    editorSwitcher.dataset.changeAttached = '1';
  }

  // initial render of editor area
  const initial = editorSwitcher?.value || listToEditId;
  if (initial) {
    try { renderChecklistSettingsItems(initial); } catch (err) { console.error('Initial renderChecklistSettingsItems failed', err); }
  } else {
    const cont = view.querySelector('#checklist-items-editor-container');
    if (cont) cont.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte zuerst eine gültige Checkliste auswählen.</p>';
  }
}
window.renderChecklistSettingsView = renderChecklistSettingsView;

/* =========================
   renderChecklistSettingsItems(listId)
   - populates the green editor area with entries
   ========================= */
export function renderChecklistSettingsItems(listId) {
  const container = document.getElementById('checklist-items-editor-container');
  if (!container) return;
  if (!listId || !window.CHECKLISTS[listId]) {
    container.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte zuerst eine gültige Checkliste auswählen.</p>';
    return;
  }

  const items = (window.CHECKLIST_ITEMS[listId] || []).slice();
  if (!items.length) {
    container.innerHTML = '<p class="text-sm text-center text-gray-500">Diese Liste hat noch keine Einträge.</p>';
    return;
  }

  items.sort((a,b) => (b.important?1:0)-(a.important?1:0));
  container.innerHTML = items.map((it, idx) => `
    <div class="p-3 rounded border flex justify-between items-start ${it.important ? 'bg-yellow-50' : 'bg-white'}" data-item-id="${it.id}">
      <div>
        <div class="text-sm font-semibold item-text">${escapeHtml(it.text || '')}</div>
        <div class="text-xs text-gray-500">von ${escapeHtml(it.addedBy || '')}</div>
      </div>
      <div class="flex flex-col gap-2">
        <button class="edit-checklist-item-btn p-1 text-blue-600 rounded">✎</button>
        <button class="delete-checklist-item-btn p-1 text-red-600 rounded">🗑</button>
      </div>
    </div>
  `).join('');

  if (!container.dataset.listenersAttached) {
    container.addEventListener('click', async (e) => {
      const edit = e.target.closest('.edit-checklist-item-btn');
      const del = e.target.closest('.delete-checklist-item-btn');
      if (edit) {
        const row = edit.closest('[data-item-id]');
        if (!row) return;
        const id = row.dataset.itemId;
        const currentText = row.querySelector('.item-text')?.textContent || '';
        const newText = prompt('Eintrag bearbeiten:', currentText);
        if (newText === null) return;
        const trimmed = newText.trim(); if (!trimmed) return alertUser('Text darf nicht leer sein.', 'error');
        try {
          if (hasFirestore && checklistItemsCollectionRef) {
            await updateDoc(doc(checklistItemsCollectionRef, id), { text: trimmed, lastEditedBy: window.currentUser?.displayName || 'System', lastEditedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null });
          } else {
            window.CHECKLIST_ITEMS[listId] = (window.CHECKLIST_ITEMS[listId] || []).map(i => i.id === id ? { ...i, text: trimmed } : i);
            renderChecklistSettingsItems(listId);
          }
          alertUser('Eintrag gespeichert.', 'success');
        } catch (err) { console.error('Save item failed', err); alertUser('Fehler beim Speichern des Eintrags.', 'error'); }
        return;
      }
      if (del) {
        const row = del.closest('[data-item-id]'); if (!row) return;
        const id = row.dataset.itemId;
        if (!confirm('Eintrag wirklich löschen?')) return;
        try {
          if (hasFirestore && checklistItemsCollectionRef) {
            await deleteDoc(doc(checklistItemsCollectionRef, id));
          } else {
            window.CHECKLIST_ITEMS[listId] = (window.CHECKLIST_ITEMS[listId] || []).filter(i => i.id !== id);
            renderChecklistSettingsItems(listId);
          }
          alertUser('Eintrag gelöscht.', 'success');
        } catch (err) { console.error('Delete item failed', err); alertUser('Fehler beim Löschen des Eintrags.', 'error'); }
        return;
      }
    });
    container.dataset.listenersAttached = '1';
  }
}
window.renderChecklistSettingsItems = renderChecklistSettingsItems;

/* =========================
   renderContainerList (minimal, defensive)
   ========================= */
export function renderContainerList() {
  const editor = document.getElementById('container-list-editor');
  if (!editor) return;
  const containers = Object.values(window.TEMPLATES || {});
  if (!containers.length) { editor.innerHTML = '<p class="text-sm text-center text-gray-500">Keine Container gefunden.</p>'; return; }
  editor.innerHTML = containers.map(c => `
    <div class="p-2 border rounded mb-2" data-template-id="${c.id}">
      <div class="flex justify-between items-center">
        <div><strong>${escapeHtml(c.name)}</strong><div class="text-xs text-gray-500">${escapeHtml(c.stackName||'')}</div></div>
        <div><button class="change-stack-btn p-1 text-blue-600" data-container-id="${c.id}">Stack ändern</button></div>
      </div>
    </div>
  `).join('');
}
window.renderContainerList = renderContainerList;

/* =========================
   Template modal handlers (minimal)
   ========================= */
export function openTemplateModal(targetListId) {
  const modal = document.getElementById('templateApplyModal');
  if (!modal) return alertUser('Template Modal nicht gefunden', 'error');
  modal.dataset.targetListId = targetListId || '';
  modal.style.display = 'flex';
}
export async function applyTemplateLogic() {
  alertUser('Vorlagedaten Anwenden ist nicht implementiert in dieser build.', 'info');
}
export function closeTemplateModal() {
  const m = document.getElementById('templateApplyModal');
  if (m) { m.style.display = 'none'; m.dataset.targetListId = ''; }
}
window.openTemplateModal = openTemplateModal;
window.applyTemplateLogic = applyTemplateLogic;
window.closeTemplateModal = closeTemplateModal;

/* =========================
   Category editor (renderCategoryEditor)
   ========================= */
export function renderCategoryEditor(groupId) {
  const out = document.getElementById('category-content');
  if (!out) return;
  if (!groupId) {
    out.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte wählen Sie eine Gruppe, um deren Kategorien zu verwalten.</p>';
    return;
  }
  const cats = (window.CHECKLIST_CATEGORIES[groupId] || []).slice();
  if (!cats.length) {
    out.innerHTML = '<p class="text-sm text-center text-gray-500">Für diese Gruppe existieren keine Kategorien.</p>';
    return;
  }
  out.innerHTML = cats.map(c => `
    <div class="flex justify-between items-center p-2 border rounded mb-2" data-category-id="${c.id}">
      <div class="flex items-center gap-2"><div class="h-4 w-4 rounded-full bg-gray-300"></div><span>${escapeHtml(c.name)}</span></div>
      <div><button class="edit-category-btn p-1 text-blue-600">✎</button><button class="delete-category-btn p-1 text-red-600">🗑</button></div>
    </div>
  `).join('');
}
window.renderCategoryEditor = renderCategoryEditor;

/* =========================
   Firestore snapshot listeners (optional)
   These functions hook snapshots to local caches and re-render.
   Ensure they are called from app init code (haupteingang).
   ========================= */
export function listenForTemplates() {
  if (typeof onSnapshot !== 'function') return;
  try {
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates');
    onSnapshot(query(colRef, orderBy('name')), snap => {
      window.TEMPLATES = {};
      snap.forEach(ds => window.TEMPLATES[ds.id] = { id: ds.id, ...ds.data() });
      renderContainerList();
    });
  } catch (err) { console.error(err); }
}

export function listenForChecklists() {
  if (typeof onSnapshot !== 'function') return;
  try {
    onSnapshot(query(checklistsCollectionRef, orderBy('name')), snap => {
      window.CHECKLISTS = {};
      snap.forEach(ds => window.CHECKLISTS[ds.id] = { id: ds.id, ...ds.data() });
      const settingsOpen = document.getElementById('checklistSettingsView')?.classList.contains('active');
      if (settingsOpen) renderChecklistSettingsView();
      const mainOpen = document.getElementById('checklistView')?.classList.contains('active');
      if (mainOpen) {
        const cur = document.getElementById('checklistView')?.dataset.currentListId;
        renderChecklistItems(cur || Object.keys(window.CHECKLISTS)[0]);
      }
    });
  } catch (err) { console.error(err); }
}

export function listenForChecklistGroups() {
  if (typeof onSnapshot !== 'function') return;
  try {
    onSnapshot(query(checklistGroupsCollectionRef, orderBy('name')), snap => {
      window.CHECKLIST_GROUPS = {};
      snap.forEach(ds => window.CHECKLIST_GROUPS[ds.id] = { id: ds.id, ...ds.data() });
      const view = document.getElementById('checklistSettingsView');
      if (view) {
        // update relevant selects
        const manageSel = view.querySelector('#manage-groups-dropdown'); if (manageSel) manageSel.innerHTML = Object.values(window.CHECKLIST_GROUPS).map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
        const editorSel = view.querySelector('#checklist-settings-editor-switcher'); if (editorSel) renderChecklistSettingsView(view.dataset.editingListId || null);
      }
    });
  } catch (err) { console.error(err); }
}

export function listenForChecklistCategories() {
  if (typeof onSnapshot !== 'function') return;
  try {
    onSnapshot(query(checklistCategoriesCollectionRef, orderBy('name')), snap => {
      window.CHECKLIST_CATEGORIES = {};
      snap.forEach(ds => {
        const c = { id: ds.id, ...ds.data() };
        if (!window.CHECKLIST_CATEGORIES[c.groupId]) window.CHECKLIST_CATEGORIES[c.groupId] = [];
        window.CHECKLIST_CATEGORIES[c.groupId].push(c);
      });
      const view = document.getElementById('checklistSettingsView');
      if (view) {
        const catSel = view.querySelector('#checklist-settings-add-category');
        if (catSel) {
          catSel.innerHTML = '<option value="">Keine Kategorie</option>' + Object.values(window.CHECKLIST_GROUPS || {}).map(g => {
            const cats = window.CHECKLIST_CATEGORIES[g.id] || [];
            if (!cats.length) return '';
            return `<optgroup label="${escapeHtml(g.name)}">${cats.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</optgroup>`;
          }).join('');
        }
      }
    });
  } catch (err) { console.error(err); }
}

export function listenForChecklistItems() {
  if (typeof onSnapshot !== 'function') return;
  try {
    onSnapshot(query(checklistItemsCollectionRef, orderBy('addedAt')), snap => {
      window.CHECKLIST_ITEMS = {};
      snap.forEach(ds => {
        const it = { id: ds.id, ...ds.data() };
        if (!window.CHECKLIST_ITEMS[it.listId]) window.CHECKLIST_ITEMS[it.listId] = [];
        window.CHECKLIST_ITEMS[it.listId].push(it);
      });
      const settingsOpen = document.getElementById('checklistSettingsView')?.classList.contains('active');
      if (settingsOpen) {
        const edit = document.getElementById('checklistSettingsView')?.dataset.editingListId;
        if (edit) renderChecklistSettingsItems(edit);
      }
      if (document.getElementById('checklistView')?.classList.contains('active')) {
        const id = document.getElementById('checklistView')?.dataset.currentListId;
        renderChecklistItems(id);
      }
    });
  } catch (err) { console.error(err); }
}
window.listenForChecklistGroups = listenForChecklistGroups;
window.listenForChecklists = listenForChecklists;
window.listenForChecklistItems = listenForChecklistItems;
window.listenForTemplates = listenForTemplates;
window.listenForChecklistCategories = listenForChecklistCategories;

/* =========================
   Defensive fallbacks for helpers that other modules may expect
   (attach to window so imports that expect them succeed)
   ========================= */
window.alertUser = window.alertUser || alertUser;
window.renderArchivedListsModal = window.renderArchivedListsModal || function() { const m = document.getElementById('archivedListsModal'); if (m) m.style.display = 'flex'; else alertUser('Archiv-Modal nicht gefunden', 'error'); };
window.renderDeletedListsModal = window.renderDeletedListsModal || function() { const m = document.getElementById('deletedListsModal'); if (m) m.style.display = 'flex'; else alertUser('Papierkorb-Modal nicht gefunden', 'error'); };

/* End of file */