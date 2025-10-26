/* checklist.js
   Vollständige defensive Implementierung — 1:1 ersetzen.
   - Keine direkten Imports von haupteingang.js (vermeidet circular TDZ).
   - Nutzt window.*-Refs wenn vorhanden (z.B. checklistItemsCollectionRef).
   - Exportiert populatePersonDropdown und alle UI‑Renderer.
   - Hängt Funktionen an window für Console‑Debugging.
*/

/* =========================
   Helpers / Fallbacks
   ========================= */

// Small safe escape
function escapeHtml(s = '') { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// Ensure global caches without causing TDZ/circular import problems
function _ensureGlobalCache(globalName) {
  try {
    // if already on window keep it; otherwise leave as {} so code doesn't break
    window[globalName] = window[globalName] || {};
  } catch (e) {
    // extremely defensive
    window[globalName] = window[globalName] || {};
  }
}
['CHECKLISTS','CHECKLIST_GROUPS','CHECKLIST_CATEGORIES','CHECKLIST_STACKS','CHECKLIST_ITEMS','TEMPLATES','TEMPLATE_ITEMS','USERS','ARCHIVED_CHECKLISTS','DELETED_CHECKLISTS','adminSettings'].forEach(_ensureGlobalCache);

// Firestore presence checks (we expect the app to expose addDoc/updateDoc/etc. on window or global scope)
const hasFirestore = typeof window.addDoc === 'function' || typeof addDoc === 'function';
function getFirestoreFn(name) {
  if (typeof window[name] === 'function') return window[name];
  if (typeof globalThis[name] === 'function') return globalThis[name];
  try { if (typeof eval(name) === 'function') return eval(name); } catch(e){}
  return undefined;
}
// helpers to call firestore if present
const _addDoc = getFirestoreFn('addDoc');
const _updateDoc = getFirestoreFn('updateDoc');
const _deleteDoc = getFirestoreFn('deleteDoc');
const _doc = getFirestoreFn('doc');
const _collection = getFirestoreFn('collection');
const _serverTimestamp = getFirestoreFn('serverTimestamp');
const _writeBatch = getFirestoreFn('writeBatch');

/* Fallback alertUser if not provided */
if (typeof window.alertUser !== 'function') {
  window.alertUser = function(message, type = 'info') {
    if (type === 'error') console.error('ALERT:', message); else console.log('ALERT:', message);
  };
}
const alertUserFn = window.alertUser;

/* =========================
   Exports required by other modules
   ========================= */

/* populatePersonDropdown - used by essensberechnung.js */
export function populatePersonDropdown(selectedId = '') {
  const sel = document.getElementById('person-select');
  if (!sel) return null;
  const users = Object.values(window.USERS || {});
  const html = ['<option value="">Person wählen...</option>'].concat(
    users.map(u => {
      const label = escapeHtml(u.name || u.displayName || u.email || u.id || '');
      return `<option value="${u.id}" ${String(u.id) === String(selectedId) ? 'selected' : ''}>${label}</option>`;
    })
  ).join('');
  sel.innerHTML = html;
  return sel;
}
window.populatePersonDropdown = populatePersonDropdown;

/* =========================
   Checklist Main View
   ========================= */

export function renderChecklistView(listId) {
  const view = document.getElementById('checklistView');
  if (!view) return;
  view.innerHTML = `
    <div class="back-link-container w-full mb-2">
      <button class="back-link flex items-center text-gray-600 hover:text-indigo-600 transition" data-target="home">
        <span class="text-sm font-semibold">zurück</span>
      </button>
    </div>
    <div id="checklist-content-wrapper"></div>
  `;
  const content = view.querySelector('#checklist-content-wrapper');
  if (!content) return;

  const lists = Object.values(window.CHECKLISTS || {});
  if (!listId || !window.CHECKLISTS[listId]) {
    const message = lists.length === 0 ? "Keine Checkliste vorhanden. Bitte erstellen Sie zuerst eine in den Einstellungen." : "Keine Standard-Checkliste ausgewählt.";
    content.innerHTML = `<p class="text-center text-gray-500 mt-8">${escapeHtml(message)}</p>`;
    return;
  }

  view.dataset.currentListId = listId;

  content.innerHTML = `
    <div class="bg-white p-3 rounded shadow mb-4 flex justify-between items-center">
      <h2 class="font-semibold">${escapeHtml(window.CHECKLISTS[listId].name || '—')}</h2>
      <div>
        <button id="open-checklist-settings" class="py-1 px-2 bg-indigo-600 text-white rounded">Einstellungen</button>
      </div>
    </div>
    <div id="checklist-main-items"></div>
  `;

  renderChecklistItems(listId);

  const settingsBtn = document.getElementById('open-checklist-settings');
  if (settingsBtn) settingsBtn.addEventListener('click', () => { if (typeof renderChecklistSettingsView === 'function') renderChecklistSettingsView(listId); });
}
window.renderChecklistView = renderChecklistView;

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
        <div class="text-sm font-semibold">${escapeHtml(it.text||'')}</div>
        <div class="text-xs text-gray-500">von ${escapeHtml(it.addedBy||'')}</div>
      </div>
      <div><input type="checkbox" class="main-check-item-cb" data-id="${it.id}" ${it.status === 'done' ? 'checked' : ''}></div>
    </div>
  `).join('');

  if (!container.dataset.listenerAttached) {
    container.addEventListener('change', async (e) => {
      const cb = e.target.closest('.main-check-item-cb');
      if (!cb) return;
      const id = cb.dataset.id;
      try {
        // prefer globally exposed refs (set by haupteingang or similar)
        const checklistItemsCollectionRef = window.checklistItemsCollectionRef;
        if (hasFirestore && checklistItemsCollectionRef && _updateDoc && _doc) {
          await _updateDoc(_doc(checklistItemsCollectionRef, id), { status: cb.checked ? 'done' : 'open', lastActionBy: window.currentUser?.displayName || 'System', lastActionAt: _serverTimestamp ? _serverTimestamp() : null });
        } else {
          for (const lid of Object.keys(window.CHECKLIST_ITEMS || {})) {
            window.CHECKLIST_ITEMS[lid] = (window.CHECKLIST_ITEMS[lid] || []).map(i => i.id === id ? { ...i, status: cb.checked ? 'done' : 'open' } : i);
          }
          const cur = document.getElementById('checklistView')?.dataset.currentListId;
          renderChecklistItems(cur);
        }
      } catch (err) { console.error('Error updating status', err); alertUserFn('Fehler beim Speichern des Eintrags.', 'error'); }
    });
    container.dataset.listenerAttached = '1';
  }
}
window.renderChecklistItems = renderChecklistItems;

/* =========================
   Settings (delegated) view
   ========================= */

export function renderChecklistSettingsView(editListId = null) {
  const view = document.getElementById('checklistSettingsView');
  if (!view) return;

  window.currentUser = window.currentUser || { id: null, displayName: 'Gast', permissions: [] };
  window.adminSettings = window.adminSettings || {};

  const hasLists = Object.keys(window.CHECKLISTS || {}).length > 0;
  const listToEditId = editListId || view.dataset.editingListId || (hasLists ? Object.keys(window.CHECKLISTS)[0] : null);
  view.dataset.editingListId = listToEditId || '';

  // base layout (full replace)
  view.innerHTML = `
    <div class="back-link-container w-full mb-2"></div>
    <h2 class="text-2xl font-bold mb-4">Checklisten-Einstellungen</h2>
    <div id="settings-tabs" class="grid grid-cols-2 sm:grid-cols-4 gap-1 border rounded bg-gray-100 p-1 mb-4">
      <button data-target-card="card-default-list" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Standard</button>
      <button data-target-card="card-manage-lists" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Gruppen & Listen</button>
      <button data-target-card="card-categories" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Kategorien</button>
      <button data-target-card="card-templates" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Stack & Container</button>
    </div>

    <div id="card-default-list" class="settings-card hidden p-4 bg-white rounded mb-4"></div>
    <div id="card-manage-lists" class="settings-card hidden p-4 bg-white rounded mb-4"></div>
    <div id="card-categories" class="settings-card hidden p-4 bg-white rounded mb-4"></div>
    <div id="card-templates" class="settings-card hidden p-4 bg-white rounded mb-4"></div>

    <div id="card-list-item-editor" class="card bg-white p-4 rounded-xl shadow mt-6"></div>
  `;

  // fill cards
  view.querySelector('#card-default-list').innerHTML = `
    <h3 class="font-bold mb-2">Globale Standard-Checkliste</h3>
    <div class="flex gap-2"><select id="checklist-settings-default-group-switcher" class="w-1/2 p-2 border rounded"></select><select id="checklist-settings-default-list-switcher" class="w-1/2 p-2 border rounded" disabled><option>...</option></select></div>
  `;

  view.querySelector('#card-manage-lists').innerHTML = `
    <h3 class="font-bold mb-2">Gruppen & Listen verwalten</h3>
    <div class="p-3 bg-gray-50 rounded mb-4">
      <div class="flex items-center gap-2">
        <select id="manage-groups-dropdown" class="flex-grow p-2 border rounded"></select>
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
    <h3 class="font-bold mb-2">Kategorien verwalten</h3>
    <p class="text-sm mb-3">Wähle eine Gruppe.</p>
    <select id="category-group-selector" class="w-full p-2 border rounded mb-4"></select>
    <div id="category-content"><p class="text-sm text-center text-gray-500">Bitte Gruppe wählen.</p></div>
  `;

  view.querySelector('#card-templates').innerHTML = `
    <h3 class="font-bold mb-2">Stack & Container verwalten</h3>
    <div class="p-3 bg-gray-50 rounded mb-4">
      <div class="flex items-center gap-2">
        <select id="manage-stacks-dropdown" class="flex-grow p-2 border rounded"></select>
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

  view.querySelector('#card-list-item-editor').innerHTML = `
    <div class="flex gap-2 items-center mb-3">
      <select id="checklist-settings-editor-switcher" class="flex-grow p-2 border rounded"></select>
      <button id="show-template-modal-btn" class="p-2 bg-teal-100 rounded">+C</button>
      <button id="checklist-archive-list-btn" class="p-2 bg-yellow-100 rounded">📦</button>
    </div>

    <div class="mb-4 p-2 bg-gray-100 rounded">
      <div id="group-display-container" class="flex justify-between items-center">
        <p class="text-sm">Aktuelle Gruppe: <span id="current-group-name" class="font-bold">—</span></p>
        <button id="edit-group-assignment-btn" class="text-sm text-blue-600">ändern</button>
      </div>
      <div id="group-edit-container" class="hidden mt-2 flex gap-2">
        <select id="checklist-group-assign-switcher" class="flex-grow p-2 border rounded"></select>
        <button id="checklist-save-group-assignment" class="py-2 px-3 bg-blue-600 text-white rounded">Speichern</button>
      </div>
    </div>

    <div class="p-3 bg-gray-50 rounded mb-4">
      <input id="checklist-settings-add-text" class="w-full p-2 border rounded mb-2" placeholder="Neuer Eintrag...">
      <div class="grid grid-cols-2 gap-2 mb-2">
        <select id="checklist-settings-add-assignee" class="p-2 border rounded">${Object.values(window.USERS||{}).map(u=>`<option value="${u.id}">${escapeHtml(u.name||u.displayName||'')}</option>`).join('')}</select>
        <select id="checklist-settings-add-category" class="p-2 border rounded"><option value="">Keine Kategorie</option></select>
      </div>
      <div class="flex items-center gap-2 mb-2"><input id="checklist-settings-add-important" type="checkbox"><label for="checklist-settings-add-important">Als wichtig markieren</label></div>
      <button id="checklist-settings-add-item-btn" class="w-full py-2 bg-blue-600 text-white rounded">Eintrag hinzufügen</button>
    </div>

    <div id="checklist-items-editor-container" class="space-y-2 mb-4"></div>
  `;

  /* Helper rebuild functions */
  function rebuildGroupSelects() {
    const groupsHtml = Object.values(window.CHECKLIST_GROUPS || {}).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    const manage = view.querySelector('#manage-groups-dropdown');
    const createGroupSel = view.querySelector('#checklist-settings-new-group-selector');
    const catSel = view.querySelector('#category-group-selector');
    const assignSel = view.querySelector('#checklist-group-assign-switcher');
    if (manage) { const prev=manage.value; manage.innerHTML = groupsHtml; if (prev) manage.value = prev; }
    if (createGroupSel) { const prev=createGroupSel.value; createGroupSel.innerHTML = `<option value="">Gruppe wählen...</option>` + groupsHtml; if (prev) createGroupSel.value = prev; }
    if (catSel) { const prev=catSel.value; catSel.innerHTML = `<option value="">Gruppe wählen...</option>` + groupsHtml; if (prev) catSel.value = prev; }
    if (assignSel) { const prev=assignSel.value; assignSel.innerHTML = `<option value="">(Keine)</option>` + groupsHtml; if (prev) assignSel.value = prev; }
  }
  function rebuildStackSelects() {
    const stacksHtml = Object.values(window.CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const ms = view.querySelector('#manage-stacks-dropdown'); const newCont = view.querySelector('#checklist-settings-new-stack-selector');
    if (ms) { const p=ms.value; ms.innerHTML = stacksHtml; if (p) ms.value = p; }
    if (newCont) { const p=newCont.value; newCont.innerHTML = `<option value="">Stack wählen...</option>` + stacksHtml; if (p) newCont.value = p; }
  }
  function rebuildEditorSwitcher() {
    const editor = view.querySelector('#checklist-settings-editor-switcher');
    if (!editor) return;
    const html = Object.values(window.CHECKLIST_GROUPS || {}).map(g=>{
      const lists = Object.values(window.CHECKLISTS||{}).filter(l=>l.groupId === g.id);
      if (!lists.length) return '';
      return `<optgroup label="${escapeHtml(g.name)}">${lists.map(l=>`<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}</optgroup>`;
    }).join('');
    editor.innerHTML = html || `<option value="">Keine Listen vorhanden</option>`;
  }

  /* Delegated handler (attach once) */
  if (!view.dataset.delegationAttached) {
    view.addEventListener('click', async (e) => {
      try {
        const t = e.target;
        // Tabs
        const tab = t.closest('.settings-tab-btn');
        if (tab) {
          const target = tab.dataset.targetCard;
          view.querySelectorAll('.settings-tab-btn').forEach(b=>{ b.classList.remove('bg-white','shadow','text-indigo-600'); b.classList.add('text-gray-600'); });
          view.querySelectorAll('.settings-card').forEach(c=>c.classList.add('hidden'));
          tab.classList.add('bg-white','shadow','text-indigo-600'); tab.classList.remove('text-gray-600');
          const card = view.querySelector('#'+target); if (card) card.classList.remove('hidden');
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
          if (!name) return alertUserFn('Bitte Gruppennamen eingeben.', 'error');
          try {
            const checklistGroupsCollectionRef = window.checklistGroupsCollectionRef;
            if (hasFirestore && checklistGroupsCollectionRef && _addDoc) {
              await _addDoc(checklistGroupsCollectionRef, { name });
            } else {
              const id = String(Date.now());
              window.CHECKLIST_GROUPS[id] = { id, name };
            }
            view.querySelector('#checklist-settings-new-group-name').value = '';
            rebuildGroupSelects(); rebuildEditorSwitcher();
            alertUserFn('Gruppe erstellt.', 'success');
          } catch (err) { console.error(err); alertUserFn('Fehler beim Erstellen der Gruppe.', 'error'); }
          return;
        }

        // Rename
        if (t.closest('#edit-selected-group-btn')) {
          const sel = view.querySelector('#manage-groups-dropdown'); const id = sel?.value;
          if (!id) return alertUserFn('Bitte zuerst eine Gruppe auswählen.', 'error');
          const newName = prompt('Neuer Name für die Gruppe:', window.CHECKLIST_GROUPS[id]?.name || '');
          if (newName === null) return;
          const trimmed = newName.trim(); if (!trimmed) return alertUserFn('Name darf nicht leer sein.', 'error');
          try {
            const checklistGroupsCollectionRef = window.checklistGroupsCollectionRef;
            if (hasFirestore && checklistGroupsCollectionRef && _updateDoc && _doc) {
              await _updateDoc(_doc(checklistGroupsCollectionRef, id), { name: trimmed });
            } else {
              window.CHECKLIST_GROUPS[id].name = trimmed;
            }
            rebuildGroupSelects(); rebuildEditorSwitcher();
            alertUserFn('Gruppe umbenannt.', 'success');
          } catch (err) { console.error(err); alertUserFn('Fehler beim Umbennen.', 'error'); }
          return;
        }

        // Delete
        if (t.closest('#delete-selected-group-btn')) {
          const sel = view.querySelector('#manage-groups-dropdown'); const id = sel?.value;
          if (!id) return alertUserFn('Bitte eine Gruppe auswählen.', 'error');
          if (!confirm('Gruppe wirklich löschen?')) return;
          try {
            const checklistsColRef = window.checklistsCollectionRef;
            const checklistGroupsCollectionRef = window.checklistGroupsCollectionRef;
            if (hasFirestore && _writeBatch && checklistsColRef && checklistGroupsCollectionRef) {
              const batch = _writeBatch(window.db || db);
              Object.values(window.CHECKLISTS || {}).filter(l => l.groupId === id).forEach(l => batch.update(_doc(checklistsColRef, l.id), { isDeleted: true }));
              batch.delete(_doc(checklistGroupsCollectionRef, id));
              await batch.commit();
            } else {
              Object.values(window.CHECKLISTS || {}).forEach(l => { if (l.groupId === id) l.isDeleted = true; });
              delete window.CHECKLIST_GROUPS[id];
            }
            rebuildGroupSelects(); rebuildEditorSwitcher();
            alertUserFn('Gruppe gelöscht.', 'success');
          } catch (err) { console.error(err); alertUserFn('Fehler beim Löschen.', 'error'); }
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
          if (!listId) return alertUserFn('Bitte Liste auswählen.', 'error');
          try {
            const checklistsColRef = window.checklistsCollectionRef;
            if (hasFirestore && checklistsColRef && _updateDoc && _doc) {
              await _updateDoc(_doc(checklistsColRef, listId), { groupId: newGroup || null, groupName: newGroup ? (window.CHECKLIST_GROUPS[newGroup]?.name || null) : null });
            } else {
              window.CHECKLISTS[listId].groupId = newGroup || null;
              window.CHECKLISTS[listId].groupName = newGroup ? (window.CHECKLIST_GROUPS[newGroup]?.name || null) : null;
            }
            view.querySelector('#group-edit-container')?.classList.add('hidden');
            view.querySelector('#group-display-container')?.classList.remove('hidden');
            rebuildEditorSwitcher();
            alertUserFn('Gruppenzuordnung gespeichert.', 'success');
          } catch (err) { console.error(err); alertUserFn('Fehler beim Speichern.', 'error'); }
          return;
        }

        // Add list item
        if (t.closest('#checklist-settings-add-item-btn')) {
          const text = view.querySelector('#checklist-settings-add-text')?.value.trim();
          const listId = view.querySelector('#checklist-settings-editor-switcher')?.value;
          const important = !!view.querySelector('#checklist-settings-add-important')?.checked;
          const cat = view.querySelector('#checklist-settings-add-category')?.value || null;
          const assignee = view.querySelector('#checklist-settings-add-assignee')?.value || null;
          if (!text || !listId) return alertUserFn('Bitte Text und Liste wählen.', 'error');
          const payload = { listId, text, status: 'open', important, addedBy: window.currentUser?.displayName || 'Unbekannt', addedAt: _serverTimestamp ? _serverTimestamp() : null, categoryId: cat, assignedTo: assignee };
          try {
            const checklistItemsCollectionRef = window.checklistItemsCollectionRef;
            if (hasFirestore && checklistItemsCollectionRef && _addDoc) {
              await _addDoc(checklistItemsCollectionRef, payload);
            } else {
              window.CHECKLIST_ITEMS[listId] = window.CHECKLIST_ITEMS[listId] || [];
              window.CHECKLIST_ITEMS[listId].push({ id: String(Date.now()), ...payload });
              renderChecklistSettingsItems(listId);
            }
            view.querySelector('#checklist-settings-add-text').value = '';
            alertUserFn('Eintrag hinzugefügt.', 'success');
          } catch (err) { console.error(err); alertUserFn('Fehler beim Hinzufügen.', 'error'); }
          return;
        }

        // Show template modal
        if (t.closest('#show-template-modal-btn')) {
          const listId = view.querySelector('#checklist-settings-editor-switcher')?.value;
          if (!listId) return alertUserFn('Bitte zuerst eine Liste auswählen.', 'error');
          if (typeof openTemplateModal === 'function') openTemplateModal(listId);
          return;
        }

        // Show archive/deleted
        if (t.closest('#show-archived-lists-btn')) {
          window.renderArchivedListsModal && window.renderArchivedListsModal();
          return;
        }
        if (t.closest('#show-deleted-lists-btn')) {
          window.renderDeletedListsModal && window.renderDeletedListsModal();
          return;
        }

      } catch (err) {
        console.error('Error in settings handler', err);
      }
    }, true);
    view.dataset.delegationAttached = '1';
  }

  // populate selects after handler attached
  rebuildGroupSelects();
  rebuildStackSelects();
  rebuildEditorSwitcher();

  // editor switcher change handler
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

  // initial render
  const initial = editorSwitcher?.value || listToEditId;
  if (initial) {
    try { renderChecklistSettingsItems(initial); } catch(err) { console.error('Initial renderChecklistSettingsItems failed', err); }
  } else {
    const cont = view.querySelector('#checklist-items-editor-container');
    if (cont) cont.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte zuerst eine gültige Checkliste auswählen.</p>';
  }
}
window.renderChecklistSettingsView = renderChecklistSettingsView;

/* =========================
   renderChecklistSettingsItems
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
  items.sort((a,b)=> (b.important?1:0)-(a.important?1:0));
  container.innerHTML = items.map((it, idx)=>`
    <div class="p-3 rounded border flex justify-between items-start ${it.important ? 'bg-yellow-50' : 'bg-white'}" data-item-id="${it.id}">
      <div>
        <div class="text-sm font-semibold item-text">${escapeHtml(it.text||'')}</div>
        <div class="text-xs text-gray-500">von ${escapeHtml(it.addedBy||'')}</div>
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
        const row = edit.closest('[data-item-id]'); if (!row) return;
        const id = row.dataset.itemId;
        const currentText = row.querySelector('.item-text')?.textContent || '';
        const newText = prompt('Eintrag bearbeiten:', currentText);
        if (newText === null) return;
        const trimmed = newText.trim(); if (!trimmed) return alertUserFn('Text darf nicht leer sein.', 'error');
        try {
          const checklistItemsCollectionRef = window.checklistItemsCollectionRef;
          if (hasFirestore && checklistItemsCollectionRef && _updateDoc && _doc) {
            await _updateDoc(_doc(checklistItemsCollectionRef, id), { text: trimmed, lastEditedBy: window.currentUser?.displayName || 'System', lastEditedAt: _serverTimestamp ? _serverTimestamp() : null });
          } else {
            window.CHECKLIST_ITEMS[listId] = (window.CHECKLIST_ITEMS[listId] || []).map(i => i.id === id ? { ...i, text: trimmed } : i);
            renderChecklistSettingsItems(listId);
          }
          alertUserFn('Eintrag gespeichert.', 'success');
        } catch (err) { console.error(err); alertUserFn('Fehler beim Speichern', 'error'); }
        return;
      }
      if (del) {
        const row = del.closest('[data-item-id]'); if (!row) return;
        const id = row.dataset.itemId;
        if (!confirm('Eintrag wirklich löschen?')) return;
        try {
          const checklistItemsCollectionRef = window.checklistItemsCollectionRef;
          if (hasFirestore && checklistItemsCollectionRef && _deleteDoc && _doc) {
            await _deleteDoc(_doc(checklistItemsCollectionRef, id));
          } else {
            window.CHECKLIST_ITEMS[listId] = (window.CHECKLIST_ITEMS[listId] || []).filter(i => i.id !== id);
            renderChecklistSettingsItems(listId);
          }
          alertUserFn('Eintrag gelöscht.', 'success');
        } catch (err) { console.error(err); alertUserFn('Fehler beim Löschen', 'error'); }
        return;
      }
    });
    container.dataset.listenersAttached = '1';
  }
}
window.renderChecklistSettingsItems = renderChecklistSettingsItems;

/* =========================
   container list + templates minimal
   ========================= */
export function renderContainerList() {
  const editor = document.getElementById('container-list-editor');
  if (!editor) return;
  const containers = Object.values(window.TEMPLATES || {});
  if (!containers.length) { editor.innerHTML = '<p class="text-sm text-center text-gray-500">Keine Container gefunden.</p>'; return; }
  editor.innerHTML = containers.map(c => `<div class="p-2 border rounded mb-2"><div class="flex justify-between items-center"><div><strong>${escapeHtml(c.name)}</strong><div class="text-xs text-gray-500">${escapeHtml(c.stackName||'')}</div></div><div><button class="change-stack-btn p-1 text-blue-600" data-id="${c.id}">Stack ändern</button></div></div></div>`).join('');
}
window.renderContainerList = renderContainerList;

/* =========================
   template modal stubs
   ========================= */
export function openTemplateModal(targetListId) {
  const modal = document.getElementById('templateApplyModal');
  if (!modal) return alertUserFn('Template Modal nicht gefunden', 'error');
  modal.dataset.targetListId = targetListId || '';
  modal.style.display = 'flex';
}
export async function applyTemplateLogic() { alertUserFn('Template-Apply ist in dieser build nicht implementiert', 'info'); }
export function closeTemplateModal() { const m=document.getElementById('templateApplyModal'); if (m) { m.style.display='none'; m.dataset.targetListId=''; } }
window.openTemplateModal = openTemplateModal;
window.applyTemplateLogic = applyTemplateLogic;
window.closeTemplateModal = closeTemplateModal;

/* =========================
   Category editor
   ========================= */
export function renderCategoryEditor(groupId) {
  const target = document.getElementById('category-content');
  if (!target) return;
  if (!groupId) { target.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte Gruppe wählen.</p>'; return; }
  const cats = (window.CHECKLIST_CATEGORIES[groupId] || []).slice();
  if (!cats.length) { target.innerHTML = '<p class="text-sm text-center text-gray-500">Keine Kategorien vorhanden.</p>'; return; }
  target.innerHTML = cats.map(c=>`<div class="p-2 border rounded mb-2 flex justify-between items-center"><div>${escapeHtml(c.name)}</div><div><button class="edit-category-btn p-1 text-blue-600">✎</button><button class="delete-category-btn p-1 text-red-600">🗑</button></div></div>`).join('');
}
window.renderCategoryEditor = renderCategoryEditor;

/* =========================
   snapshot listeners (optional)
   - these rely on window.* collection refs provided by the app
   ========================= */
export function listenForChecklists() {
  if (typeof window.onSnapshot !== 'function') return;
  try {
    const checklistsCollectionRef = window.checklistsCollectionRef;
    if (!checklistsCollectionRef) return;
    window.onSnapshot(window.query ? window.query(checklistsCollectionRef, window.orderBy ? window.orderBy('name') : undefined) : checklistsCollectionRef, snap => {
      window.CHECKLISTS = {}; snap.forEach(ds => window.CHECKLISTS[ds.id] = { id: ds.id, ...ds.data() });
      const settingsOpen = document.getElementById('checklistSettingsView')?.classList.contains('active');
      if (settingsOpen) renderChecklistSettingsView();
      const mainOpen = document.getElementById('checklistView')?.classList.contains('active');
      if (mainOpen) {
        const cur = document.getElementById('checklistView')?.dataset.currentListId; renderChecklistItems(cur || Object.keys(window.CHECKLISTS)[0]);
      }
    });
  } catch(e){ console.error(e); }
}
// similar listeners for groups, categories, items, templates can be provided by app bootstrap

/* =========================
   Expose to window for convenience
   ========================= */
window.renderChecklistSettingsView = renderChecklistSettingsView;
window.renderChecklistSettingsItems = renderChecklistSettingsItems;
window.renderChecklistView = renderChecklistView;
window.renderChecklistItems = renderChecklistItems;
window.renderContainerList = renderContainerList;
window.renderCategoryEditor = renderCategoryEditor;
window.openTemplateModal = openTemplateModal;
window.populatePersonDropdown = populatePersonDropdown;

/* End of file */