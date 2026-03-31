// // @ts-check
import { query, where, orderBy, onSnapshot, collection, doc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { updateUIForMode } from './log-InOut.js';
import {
    checklistItemsCollectionRef,
    DELETED_CHECKLISTS,
    ARCHIVED_CHECKLISTS,
    CHECKLIST_ITEMS,
    checklistGroupsCollectionRef,
    checklistsCollectionRef,
    CHECKLISTS,
    alertUser,
    CHECKLIST_GROUPS,
    checklistCategoriesCollectionRef,
    CHECKLIST_CATEGORIES,
    db,
    appId,
    TEMPLATES,
    USERS,
    currentUser, // <--- WICHTIG: Das hat gefehlt!
    settingsDocRef,
    checklistShipsCollectionRef,
    checklistTemplatesCollectionRef,
    CHECKLIST_SHIPS,
    COLOR_PALETTE,
    escapeHtml
} from './haupteingang.js';

export {
  listenForTemplates,
  listenForChecklists,
  listenForChecklistGroups,
  listenForChecklistCategories,
  listenForChecklistItems,
  openTemplateModal,
  renderChecklistSettingsView,
};
import { logAdminAction } from './admin_protokollHistory.js';

// ENDE-ZIKA //

const safeWindow = (name, fallback) => {
  if (typeof window[name] === 'undefined') window[name] = fallback;
  return window[name];
};

// Stelle sicher, dass erwartete globale Strukturen existieren
// Globale Variablen definieren (damit VS Code sie kennt)
// Diese kommen aus haupteingang.js, aber wir definieren die lokalen hier:
let selectedTemplateId = null;
let unsubscribeTemplateItems = null;
let TEMPLATE_ITEMS = {}; // Hier speichern wir die Items der Vorlagen
let lastTemplateItemFormSelection = { assignedTo: '', categoryId: '' };

// Hinweis: Die anderen großen Objekte (CHECKLISTS, USERS etc.) 
// kommen aus dem Import von 'haupteingang.js'.

// Kurz-Helper: sicherer Zugriff auf Firestore-Funktionen (falls vorhanden)
const hasFirestore = typeof addDoc === 'function' && typeof updateDoc === 'function' && typeof deleteDoc === 'function';

const getTemplateShipId = (template) => template?.shipId || template?.stackId || null;
const getTemplateShipName = (template) => template?.shipName || template?.stackName || null;
const checklistCheckboxClickTracker = new Map();

const PERSON_BADGE_CLASSES = [
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-lime-100 text-lime-900 border-lime-200',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
];

function getCurrentActorName() {
  const user = currentUser || window.currentUser || {};
  const candidate = user.displayName || user.name || user.fullName || user.username || user.email || window.currentUser?.displayName || window.currentUser?.name;
  const normalized = typeof candidate === 'string' ? candidate.trim() : '';
  return normalized || 'Unbekannt';
}

function getChecklistCategoryById(categoryId) {
  if (!categoryId) return null;
  for (const categories of Object.values(CHECKLIST_CATEGORIES || {})) {
    const found = (categories || []).find(category => category.id === categoryId);
    if (found) return found;
  }
  return null;
}

function getChecklistItemContext(itemId, preferredListId = null) {
  if (preferredListId && CHECKLIST_ITEMS[preferredListId]) {
    const item = (CHECKLIST_ITEMS[preferredListId] || []).find(entry => entry.id === itemId);
    if (item) return { item, listId: preferredListId };
  }
  for (const [listId, items] of Object.entries(CHECKLIST_ITEMS || {})) {
    const item = (items || []).find(entry => entry.id === itemId);
    if (item) return { item, listId };
  }
  return { item: null, listId: preferredListId || null };
}

function getTemplateItemContext(itemId, preferredTemplateId = null) {
  if (preferredTemplateId && TEMPLATE_ITEMS[preferredTemplateId]) {
    const item = (TEMPLATE_ITEMS[preferredTemplateId] || []).find(entry => entry.id === itemId);
    if (item) return { item, templateId: preferredTemplateId };
  }
  for (const [templateId, items] of Object.entries(TEMPLATE_ITEMS || {})) {
    const item = (items || []).find(entry => entry.id === itemId);
    if (item) return { item, templateId };
  }
  return { item: null, templateId: preferredTemplateId || null };
}

function buildChecklistAssigneeOptions(selectedValue = '') {
  const options = Object.values(USERS || {})
    .filter(user => user && (user.name || user.displayName))
    .sort((a, b) => String(a.name || a.displayName || '').localeCompare(String(b.name || b.displayName || ''), 'de', { sensitivity: 'base' }))
    .map(user => `<option value="${user.id}" ${selectedValue === user.id ? 'selected' : ''}>${escapeHtml(user.name || user.displayName || '')}</option>`)
    .join('');
  return `<option value="">Niemand zuweisen</option>${options}`;
}

function buildChecklistCategoryOptions(selectedValue = '') {
  const groupedOptions = Object.values(CHECKLIST_GROUPS || {})
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'de', { sensitivity: 'base' }))
    .map(group => {
      const categories = (CHECKLIST_CATEGORIES[group.id] || [])
        .slice()
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'de', { sensitivity: 'base' }));
      if (!categories.length) return '';
      const categoryOptions = categories
        .map(category => `<option value="${category.id}" ${selectedValue === category.id ? 'selected' : ''}>${escapeHtml(category.name || '')}</option>`)
        .join('');
      return `<optgroup label="${escapeHtml(group.name || '')}">${categoryOptions}</optgroup>`;
    })
    .join('');
  return `<option value="">Keine Kategorie</option>${groupedOptions}`;
}

function closeChecklistItemEditModal() {
  const modal = document.getElementById('checklistItemEditModal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.dataset.mode = '';
  modal.dataset.itemId = '';
  modal.dataset.listId = '';
  modal.dataset.templateId = '';
  modal.dataset.busy = 'false';
}

function ensureChecklistItemEditModal() {
  if (document.getElementById('checklistItemEditModal')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="checklistItemEditModal" class="fixed inset-0 bg-black/60 z-[140] items-center justify-center p-4" style="display: none;">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4 rounded-t-2xl flex items-center justify-between gap-3">
          <h3 id="checklistItemEditModalTitle" class="text-lg font-bold">Eintrag bearbeiten</h3>
          <button id="checklistItemEditModalCloseBtn" type="button" class="text-white/90 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label for="checklistItemEditName" class="block text-sm font-semibold text-gray-700 mb-1">Unbenennen</label>
            <input id="checklistItemEditName" type="text" class="w-full p-2 border rounded-lg" placeholder="Text für Eintrag...">
          </div>
          <div>
            <label for="checklistItemEditAssignee" class="block text-sm font-semibold text-gray-700 mb-1">Zuweisen an</label>
            <select id="checklistItemEditAssignee" class="w-full p-2 border rounded-lg bg-white"></select>
          </div>
          <div>
            <label for="checklistItemEditCategory" class="block text-sm font-semibold text-gray-700 mb-1">Kategorie</label>
            <select id="checklistItemEditCategory" class="w-full p-2 border rounded-lg bg-white"></select>
          </div>
          <label class="flex items-center justify-between gap-3 p-3 border rounded-lg bg-gray-50 cursor-pointer" for="checklistItemEditImportant">
            <span class="text-sm font-semibold text-gray-700">Als wichtig markieren</span>
            <input id="checklistItemEditImportant" type="checkbox" class="h-5 w-5 rounded border-gray-300 text-indigo-600">
          </label>
          <button id="checklistItemEditDeleteBtn" type="button" class="w-full py-2 border border-red-200 bg-red-50 text-red-700 font-semibold rounded-lg hover:bg-red-100">Eintrag löschen</button>
        </div>
        <div class="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
          <button id="checklistItemEditCancelBtn" type="button" class="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300">Abbrechen</button>
          <button id="checklistItemEditSaveBtn" type="button" class="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">Speichern</button>
        </div>
      </div>
    </div>
  `);

  const modal = document.getElementById('checklistItemEditModal');
  if (!modal || modal.dataset.listenersAttached === 'true') return;

  modal.addEventListener('click', async (e) => {
    if (modal.dataset.busy === 'true') return;
    if (e.target === modal || e.target.closest('#checklistItemEditModalCloseBtn') || e.target.closest('#checklistItemEditCancelBtn')) {
      closeChecklistItemEditModal();
      return;
    }

    if (e.target.closest('#checklistItemEditDeleteBtn')) {
      const mode = modal.dataset.mode;
      const itemId = modal.dataset.itemId;
      const templateId = modal.dataset.templateId || null;
      if (!itemId) return;
      if (!confirm('Eintrag wirklich löschen?')) return;

      modal.dataset.busy = 'true';
      try {
        if (mode === 'template') {
          if (!templateId) throw new Error('Template-ID fehlt.');
          await deleteDoc(doc(checklistTemplatesCollectionRef, templateId, 'template-items', itemId));
        } else {
          await deleteDoc(doc(checklistItemsCollectionRef, itemId));
        }
        closeChecklistItemEditModal();
        alertUser('Gelöscht.', 'success');
      } catch (err) {
        console.error(err);
        modal.dataset.busy = 'false';
        alertUser('Fehler beim Löschen.', 'error');
      }
      return;
    }

    if (e.target.closest('#checklistItemEditSaveBtn')) {
      const mode = modal.dataset.mode;
      const itemId = modal.dataset.itemId;
      const templateId = modal.dataset.templateId || null;
      const nameInput = modal.querySelector('#checklistItemEditName');
      const assigneeSelect = modal.querySelector('#checklistItemEditAssignee');
      const categorySelect = modal.querySelector('#checklistItemEditCategory');
      const importantCheckbox = modal.querySelector('#checklistItemEditImportant');
      const text = (nameInput?.value || '').trim();
      if (!text) {
        alertUser('Text darf nicht leer sein.', 'error');
        return;
      }

      const assignedTo = assigneeSelect?.value || null;
      const assignedToName = assignedTo ? (assigneeSelect?.options?.[assigneeSelect.selectedIndex]?.text || null) : null;
      const categoryId = categorySelect?.value || null;
      const category = getChecklistCategoryById(categoryId);
      const payload = {
        text,
        assignedTo,
        assignedToName,
        categoryId,
        categoryName: category?.name || null,
        categoryColor: category?.color || null,
        important: importantCheckbox?.checked === true,
        lastEditedBy: getCurrentActorName(),
        lastEditedAt: serverTimestamp()
      };

      modal.dataset.busy = 'true';
      try {
        if (mode === 'template') {
          if (!templateId) throw new Error('Template-ID fehlt.');
          await updateDoc(doc(checklistTemplatesCollectionRef, templateId, 'template-items', itemId), payload);
        } else {
          await updateDoc(doc(checklistItemsCollectionRef, itemId), payload);
        }
        closeChecklistItemEditModal();
        alertUser('Gespeichert.', 'success');
      } catch (err) {
        console.error(err);
        modal.dataset.busy = 'false';
        alertUser('Fehler beim Speichern.', 'error');
      }
    }
  });

  modal.dataset.listenersAttached = 'true';
}

function openChecklistItemEditModal({ mode, itemId, listId = null, templateId = null }) {
  ensureChecklistItemEditModal();
  const modal = document.getElementById('checklistItemEditModal');
  if (!modal) return;

  const resolved = mode === 'template'
    ? getTemplateItemContext(itemId, templateId || selectedTemplateId || document.getElementById('template-item-editor')?.dataset.templateId || null)
    : getChecklistItemContext(itemId, listId || document.getElementById('checklistSettingsView')?.dataset.editingListId || document.getElementById('checklistView')?.dataset.currentListId || null);

  if (!resolved.item) {
    alertUser('Eintrag konnte nicht geladen werden.', 'error');
    return;
  }

  modal.dataset.mode = mode;
  modal.dataset.itemId = itemId || '';
  modal.dataset.listId = resolved.listId || '';
  modal.dataset.templateId = resolved.templateId || '';
  modal.dataset.busy = 'false';

  const item = resolved.item;
  const titleEl = modal.querySelector('#checklistItemEditModalTitle');
  const nameInput = modal.querySelector('#checklistItemEditName');
  const assigneeSelect = modal.querySelector('#checklistItemEditAssignee');
  const categorySelect = modal.querySelector('#checklistItemEditCategory');
  const importantCheckbox = modal.querySelector('#checklistItemEditImportant');

  if (titleEl) titleEl.textContent = mode === 'template' ? 'Container-Eintrag bearbeiten' : 'Checklisten-Eintrag bearbeiten';
  if (nameInput) nameInput.value = item.text || '';
  if (assigneeSelect) assigneeSelect.innerHTML = buildChecklistAssigneeOptions(item.assignedTo || '');
  if (categorySelect) categorySelect.innerHTML = buildChecklistCategoryOptions(item.categoryId || '');
  if (importantCheckbox) importantCheckbox.checked = item.important === true;

  modal.style.display = 'flex';
  nameInput?.focus();
  nameInput?.select();
}

async function toggleChecklistItemStatusByDoubleClick(itemId, listId, checkboxEl) {
  const context = getChecklistItemContext(itemId, listId);
  if (!context.item) {
    alertUser('Eintrag konnte nicht gefunden werden.', 'error');
    return;
  }

  const nextChecked = context.item.status !== 'done';
  const userName = currentUser?.displayName || currentUser?.name || window.currentUser?.displayName || window.currentUser?.name || 'Unbekannt';
  const updatePayload = {
    status: nextChecked ? 'done' : 'open',
    lastActionBy: nextChecked ? userName : `Zurückgestellt von ${userName}`,
    lastActionAt: serverTimestamp()
  };

  if (checkboxEl) {
    checkboxEl.disabled = true;
    checkboxEl.checked = nextChecked;
  }

  try {
    await updateDoc(doc(checklistItemsCollectionRef, itemId), updatePayload);
  } catch (err) {
    console.error('Fehler beim Checkbox-Update:', err);
    if (checkboxEl) {
      checkboxEl.checked = context.item.status === 'done';
      checkboxEl.disabled = false;
    }
    alertUser('Fehler beim Speichern.', 'error');
    return;
  }

  if (checkboxEl) checkboxEl.disabled = false;
}

function getActiveTemplateId() {
  return document.getElementById('template-item-editor')?.dataset.templateId || selectedTemplateId || null;
}

function getPersonBadgeClass(personKey) {
  const key = String(personKey || '').trim().toLowerCase();
  if (!key) return PERSON_BADGE_CLASSES[0];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PERSON_BADGE_CLASSES[hash % PERSON_BADGE_CLASSES.length];
}


function renderTemplateList() {
    const container = document.getElementById('template-list-container');
    const editor = document.getElementById('template-item-editor');

    if (Object.keys(TEMPLATES).length === 0) {
        container.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Container gefunden. Erstellen Sie einen neuen!</p>';
        editor.classList.add('hidden');
        selectedTemplateId = null;
        return;
    }

    container.innerHTML = '';

    Object.values(TEMPLATES).forEach(template => {
        const isSelected = template.id === selectedTemplateId;
        container.innerHTML += `
            <div data-template-id="${template.id}" class="template-selection-item p-3 border rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-100 transition ${isSelected ? 'bg-indigo-50 border-indigo-300' : ''}">
                <span class="font-semibold">${template.name}</span>
            </div>
        `;
    });
}

export function renderContainerList() {
  const editorDiv = document.getElementById('container-list-editor');
  if (!editorDiv) return;
  const view = document.getElementById('checklistSettingsView');
  const editor = document.getElementById('template-item-editor');
  editorDiv.innerHTML = '';

  const ships = Object.values(CHECKLIST_SHIPS || {}).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' }));
  const containers = Object.values(TEMPLATES || {}).slice();

  if (!containers.some(container => container.id === selectedTemplateId)) {
    selectedTemplateId = null;
    if (editor) {
      editor.classList.add('hidden');
      editor.dataset.templateId = '';
    }
    if (typeof unsubscribeTemplateItems === 'function') {
      unsubscribeTemplateItems();
      unsubscribeTemplateItems = null;
    }
  }

  if (!containers.length) {
    editorDiv.innerHTML = `<p class="text-sm text-center text-gray-400">Keine Container gefunden.</p>`;
    return;
  }

  const byShip = {};
  containers.forEach(container => {
    const shipKey = getTemplateShipId(container) || '__noship';
    byShip[shipKey] = byShip[shipKey] || [];
    byShip[shipKey].push(container);
  });

  const shipGroups = ships
    .filter(ship => (byShip[ship.id] || []).length > 0)
    .map(ship => ({ id: ship.id, name: ship.name || 'Unbenanntes Schiff', containers: (byShip[ship.id] || []).slice() }));

  if ((byShip['__noship'] || []).length > 0) {
    shipGroups.push({ id: '__noship', name: 'Ohne Schiff', containers: (byShip['__noship'] || []).slice() });
  }

  const selectedShipGroup = selectedTemplateId && TEMPLATES[selectedTemplateId]
    ? (getTemplateShipId(TEMPLATES[selectedTemplateId]) || '__noship')
    : '';
  const currentActiveShipGroup = view?.dataset.activeTemplateShipGroup || '';
  const effectiveActiveShipGroup = shipGroups.some(group => group.id === currentActiveShipGroup)
    ? currentActiveShipGroup
    : (selectedShipGroup && shipGroups.some(group => group.id === selectedShipGroup) ? selectedShipGroup : '');

  if (view) {
    view.dataset.activeTemplateShipGroup = effectiveActiveShipGroup;
  }

  editorDiv.innerHTML = shipGroups.map(group => {
    const isExpanded = effectiveActiveShipGroup === group.id;
    const sortedContainers = group.containers
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' }));

    return `
      <div class="border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
        <button type="button" class="ship-group-toggle w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition ${isExpanded ? 'bg-gray-50' : ''}" data-ship-group-id="${group.id}">
          <div class="min-w-0">
            <div class="font-semibold text-gray-800 truncate">${escapeHtml(group.name)}</div>
            <div class="text-xs text-gray-500">${sortedContainers.length} Container</div>
          </div>
          <span class="text-xl leading-none text-gray-400">${isExpanded ? '−' : '+'}</span>
        </button>
        <div class="${isExpanded ? 'block' : 'hidden'} border-t border-gray-100 bg-gray-50 p-3 space-y-2">
          ${sortedContainers.map(container => createContainerHTML(container)).join('')}
        </div>
      </div>
    `;
  }).join('');

  function createContainerHTML(container) {
    const currentShipId = getTemplateShipId(container) || '';
    const currentShipName = getTemplateShipName(container) || 'Kein Schiff zugewiesen';
    const isSelected = container.id === selectedTemplateId;
    const shipOptions = `<option value="" ${!currentShipId ? 'selected' : ''}>Keinem Schiff zuweisen</option>` + ships.map(ship => `<option value="${ship.id}" ${currentShipId === ship.id ? 'selected' : ''}>${escapeHtml(ship.name || '')}</option>`).join('');
    return `
      <div data-template-id="${container.id}" class="template-selection-item p-3 border rounded-lg cursor-pointer transition ${isSelected ? 'bg-indigo-50 border-indigo-300' : 'bg-white hover:bg-gray-100 border-gray-200'}">
        <p class="font-semibold text-gray-800">${escapeHtml(container.name || 'Unbenannter Container')}</p>
        <div class="mt-2 p-2 bg-gray-50 rounded-lg">
          <div id="ship-display-container-${container.id}" class="flex justify-between items-center gap-2">
            <p class="text-sm text-gray-700">Aktuelles Schiff: <span class="font-bold text-teal-800">${escapeHtml(currentShipName)}</span></p>
            <button data-container-id="${container.id}" class="change-ship-btn text-sm font-semibold text-blue-600 hover:underline">ändern</button>
          </div>
          <div id="ship-edit-container-${container.id}" class="hidden flex gap-2 items-center mt-2">
            <select class="ship-assign-switcher flex-grow p-1 border rounded-lg bg-white text-sm">${shipOptions}</select>
            <button data-container-id="${container.id}" class="save-ship-assignment-btn py-1 px-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 text-xs">Speichern</button>
          </div>
        </div>
      </div>
    `;
  }
}

export async function applyTemplateLogic() {
  const modal = document.getElementById('templateApplyModal');
  if (!modal) return;
  const targetListId = modal.dataset.targetListId;
  if (!targetListId) return alertUser && alertUser('Keine Ziel-Checkliste definiert.', 'error');

  const selectedBoxes = Array.from(modal.querySelectorAll('.template-item-cb:checked'));
  if (!selectedBoxes.length) return alertUser && alertUser('Bitte mindestens einen Eintrag wählen.', 'error');

  try {
    const type = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
    const insertMode = modal.querySelector('input[name="insert-mode"]:checked')?.value || 'einfuegen';
    if (type === 'Schiff' && insertMode === 'ersetzen' && typeof getDocs === 'function' && typeof writeBatch === 'function') {
      const q = query(checklistItemsCollectionRef, where('listId', '==', targetListId));
      const snap = await getDocs(q);
      if (snap && snap.size > 0) {
        const batch = writeBatch(db);
        snap.forEach(s => batch.delete(s.ref));
        await batch.commit();
      }
    }

    let appliedItemCount = 0;

    const appendChecklistItem = async (itemLike) => {
      const data = {
        listId: targetListId,
        text: itemLike?.text || '',
        status: 'open',
        important: itemLike?.important === true || itemLike?.important === 'true',
        assignedTo: itemLike?.assignedTo || null,
        assignedToName: itemLike?.assignedToName || null,
        categoryId: itemLike?.categoryId || null,
        categoryName: itemLike?.categoryName || null,
        categoryColor: itemLike?.categoryColor || null,
        addedBy: getCurrentActorName(),
        addedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null
      };
      if (hasFirestore && typeof addDoc === 'function') {
        await addDoc(checklistItemsCollectionRef, data);
      } else {
        CHECKLIST_ITEMS[targetListId] = CHECKLIST_ITEMS[targetListId] || [];
        CHECKLIST_ITEMS[targetListId].push({ id: String(Date.now()), ...data });
      }
      appliedItemCount += 1;
    };

    if (type === 'Schiff') {
      for (const cb of selectedBoxes) {
        const templateId = cb.dataset.templateId || cb.value;
        if (!templateId) continue;

        let templateItems = [];
        if (typeof getDocs === 'function') {
          const itemsRef = collection(checklistTemplatesCollectionRef, templateId, 'template-items');
          const snap = await getDocs(query(itemsRef, orderBy('text')));
          snap.forEach(s => templateItems.push({ id: s.id, ...s.data() }));
        } else {
          templateItems = TEMPLATE_ITEMS[templateId] || [];
        }

        for (const item of templateItems) {
          await appendChecklistItem(item);
        }
      }
    } else {
      for (const cb of selectedBoxes) {
        await appendChecklistItem({
          text: cb.dataset.text || '',
          important: cb.dataset.important === 'true',
          assignedTo: cb.dataset.assignedTo || null,
          assignedToName: cb.dataset.assignedToName || null,
          categoryId: cb.dataset.categoryId || null,
          categoryName: cb.dataset.categoryName || null,
          categoryColor: cb.dataset.categoryColor || null
        });
      }
    }

    if (appliedItemCount === 0) {
      return alertUser && alertUser('In den gewählten Quellen wurden keine Einträge gefunden.', 'warning');
    }

    alertUser && alertUser(`${appliedItemCount} Einträge wurden hinzugefügt.`, 'success');
    closeTemplateModal();
  } catch (err) {
    console.error('applyTemplateLogic error:', err);
    alertUser && alertUser('Fehler beim Anwenden der Vorlage.', 'error');
  }
}


function listenForTemplates() {
  if (typeof onSnapshot !== 'function' || !checklistTemplatesCollectionRef) return;
  try {
    // const templatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates'); // ENTFERNT
    onSnapshot(query(checklistTemplatesCollectionRef, orderBy('name')), (snapshot) => { // BENUTZT JETZT IMPORT
      Object.keys(TEMPLATES).forEach(k => delete TEMPLATES[k]);
      snapshot.forEach(docSnap => { TEMPLATES[docSnap.id] = { id: docSnap.id, ...docSnap.data() }; });
      
      const settingsView = document.getElementById('checklistSettingsView');
      if (settingsView && settingsView.classList.contains('active')) {
        renderContainerList();
      }
    });
  } catch (err) {
    console.error('listenForTemplates error:', err);
  }
}

export function listenForSchiffe() {
  if (typeof onSnapshot !== 'function' || !checklistShipsCollectionRef) return;
  try {
    onSnapshot(query(checklistShipsCollectionRef, orderBy('name')), (snapshot) => {
      // Leere das globale Objekt, bevor du es neu füllst
      Object.keys(CHECKLIST_SHIPS).forEach(k => delete CHECKLIST_SHIPS[k]);
      snapshot.forEach(docSnap => { 
          CHECKLIST_SHIPS[docSnap.id] = { id: docSnap.id, ...docSnap.data() }; 
      });
      
      // WICHTIG: UI neu rendern, wenn die Einstellungsseite offen ist
      const settingsView = document.getElementById('checklistSettingsView');
      if (settingsView && settingsView.classList.contains('active')) {
          // Rufe renderChecklistSettingsView() auf, um die Dropdowns neu zu füllen
          // Wir behalten die aktuell ausgewählte Liste bei
          renderChecklistSettingsView(settingsView.dataset.editingListId);
      }
    });
  } catch (err) {
    console.error('listenForSchiffe error:', err);
  }
}

// Ersetze DIESE Funktion komplett
function listenForChecklists() {
  if (typeof onSnapshot !== 'function' || !checklistsCollectionRef) {
      console.error("listenForChecklists: Firestore onSnapshot oder checklistsCollectionRef fehlt.");
      return;
  }
  try {
    console.log("listenForChecklists: Starte Listener für Checklisten..."); // Debug
    onSnapshot(query(checklistsCollectionRef, orderBy('name')), (snapshot) => {
      console.log("listenForChecklists: Snapshot empfangen, Anzahl Dokumente:", snapshot.size); // Debug
      const newChecklists = {};
      const newArchived = {};
      const newDeleted = {};

      snapshot.forEach(docSnap => {
        const listData = { id: docSnap.id, ...docSnap.data() };
        //console.log(` - Liste ${listData.id} (${listData.name}): isDeleted=${listData.isDeleted}, isArchived=${listData.isArchived}`); // Detailliertes Debug

        // Nach Status sortieren
        if (listData.isDeleted) {
            newDeleted[docSnap.id] = listData;
        } else if (listData.isArchived) {
            newArchived[docSnap.id] = listData;
        } else {
            // Nur aktive Listen kommen in CHECKLISTS
            newChecklists[docSnap.id] = listData;
        }
      });

      // Globale Objekte sicher aktualisieren
      // (Überschreibt alte Daten komplett, statt sie nur zu löschen/hinzuzufügen)
      Object.keys(CHECKLISTS).forEach(k => delete CHECKLISTS[k]);
      Object.assign(CHECKLISTS, newChecklists);

      Object.keys(ARCHIVED_CHECKLISTS).forEach(k => delete ARCHIVED_CHECKLISTS[k]);
      Object.assign(ARCHIVED_CHECKLISTS, newArchived);

      Object.keys(DELETED_CHECKLISTS).forEach(k => delete DELETED_CHECKLISTS[k]);
      Object.assign(DELETED_CHECKLISTS, newDeleted);

      console.log(`listenForChecklists: Globale Objekte aktualisiert. Aktive: ${Object.keys(CHECKLISTS).length}, Archiviert: ${Object.keys(ARCHIVED_CHECKLISTS).length}, Gelöscht: ${Object.keys(DELETED_CHECKLISTS).length}`); // Debug

      // UI nur neu rendern, wenn die jeweilige Ansicht aktiv ist
      const checklistView = document.getElementById('checklistView');
      if (checklistView?.classList.contains('active')) {
          console.log("listenForChecklists: checklistView ist aktiv, rendere neu..."); // Debug
          const currentListId = checklistView.dataset.currentListId;
          // Wenn die aktuell angezeigte Liste nicht mehr in CHECKLISTS ist (weil archiviert/gelöscht),
          // versuche die erste verfügbare Liste oder zeige eine Meldung.
          const nextListId = CHECKLISTS[currentListId] ? currentListId : (Object.keys(CHECKLISTS)[0] || null);
          renderChecklistView(nextListId);
      }

      const settingsView = document.getElementById('checklistSettingsView');
      if (settingsView?.classList.contains('active')) {
           console.log("listenForChecklists: checklistSettingsView ist aktiv, rendere neu..."); // Debug
          // Wichtig: Beim Neuaufruf von renderChecklistSettingsView muss die ID der
          // aktuell bearbeiteten Liste übergeben werden, damit sie erhalten bleibt,
          // es sei denn, diese wurde gerade archiviert/gelöscht.
          const currentEditingId = settingsView.dataset.editingListId;
          const nextEditingId = CHECKLISTS[currentEditingId] ? currentEditingId : (Object.keys(CHECKLISTS)[0] || null);
          renderChecklistSettingsView(nextEditingId);
      }

       // Aktualisiere Modals, falls sie offen sind
       const archivedModal = document.getElementById('archivedListsModal');
       if (archivedModal && archivedModal.style.display === 'flex') {
           console.log("listenForChecklists: Archived Modal ist offen, rendere neu..."); // Debug
           renderArchivedListsModal();
       }
        const deletedModal = document.getElementById('deletedListsModal');
        if (deletedModal && deletedModal.style.display === 'flex') {
            console.log("listenForChecklists: Deleted Modal ist offen, rendere neu..."); // Debug
            renderDeletedListsModal();
        }


    }, (error) => { // Fehlerbehandlung für den Listener selbst
         console.error("listenForChecklists: FEHLER im Snapshot Listener:", error);
         alertUser("Fehler beim Laden der Checklisten-Updates.", "error");
    });
  } catch (err) { // Fehler beim initialen Setup des Listeners
    console.error('listenForChecklists: FEHLER beim Setup:', err);
    alertUser("Fehler beim Initialisieren des Checklisten-Listeners.", "error");
  }
}

function listenForChecklistGroups() {
  if (typeof onSnapshot !== 'function') return;
  try {
    onSnapshot(query(checklistGroupsCollectionRef, orderBy('name')), (snapshot) => {
      Object.keys(CHECKLIST_GROUPS).forEach(k => delete CHECKLIST_GROUPS[k]);
      snapshot.forEach(docSnap => CHECKLIST_GROUPS[docSnap.id] = { id: docSnap.id, ...docSnap.data() });
      if (document.getElementById('checklistSettingsView')?.classList.contains('active')) renderChecklistSettingsView();
    });
  } catch (err) {
    console.error('listenForChecklistGroups error:', err);
  }
}


function listenForChecklistCategories() {
  if (typeof onSnapshot !== 'function') return;
  try {
    onSnapshot(query(checklistCategoriesCollectionRef, orderBy('name')), (snapshot) => {
      // rebuild categories grouped by groupId
      Object.keys(CHECKLIST_CATEGORIES).forEach(k => delete CHECKLIST_CATEGORIES[k]);
      snapshot.forEach(docSnap => {
        const cat = { id: docSnap.id, ...docSnap.data() };
        if (!CHECKLIST_CATEGORIES[cat.groupId]) CHECKLIST_CATEGORIES[cat.groupId] = [];
        CHECKLIST_CATEGORIES[cat.groupId].push(cat);
      });
      if (document.getElementById('checklistSettingsView')?.classList.contains('active')) renderChecklistSettingsView();
    });
  } catch (err) {
    console.error('listenForChecklistCategories error:', err);
  }
}


function listenForChecklistItems() {
  if (typeof onSnapshot !== 'function') return;
  try {
    onSnapshot(query(checklistItemsCollectionRef, orderBy('addedAt')), (snapshot) => {
      Object.keys(CHECKLIST_ITEMS).forEach(k => delete CHECKLIST_ITEMS[k]);
      snapshot.forEach(docSnap => {
        const it = { id: docSnap.id, ...docSnap.data() };
        if (!CHECKLIST_ITEMS[it.listId]) CHECKLIST_ITEMS[it.listId] = [];
        CHECKLIST_ITEMS[it.listId].push(it);
      });
      // re-render active views
      if (document.getElementById('checklistView')?.classList.contains('active')) {
        const id = document.getElementById('checklistView').dataset.currentListId;
        renderChecklistItems(id);
      }
      if (document.getElementById('checklistSettingsView')?.classList.contains('active')) {
        const editId = document.getElementById('checklistSettingsView').dataset.editingListId;
        if (editId) renderChecklistSettingsItems(editId);
      }
    });
  } catch (err) {
    console.error('listenForChecklistItems error:', err);
  }
}

// ERSETZE die Funktion "renderChecklistView" in checklist.js:

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
  const contentWrapper = view.querySelector('#checklist-content-wrapper');
  if (!contentWrapper) return;

  // Defensive: prüfen ob Liste existiert
  const hasLists = Object.keys(CHECKLISTS || {}).length > 0;
  if (!listId || !CHECKLISTS[listId]) {
    const message = !hasLists
      ? "Keine Checkliste vorhanden. Bitte erstellen Sie zuerst eine in den Einstellungen."
      : "Keine Standard-Checkliste ausgewählt. Bitte wählen Sie eine in den Einstellungen.";
    contentWrapper.innerHTML = `<p class="text-center text-gray-500 mt-8">${message}</p>`;
    return;
  }

  view.dataset.currentListId = listId;

  // Dropdown Optionen bauen
  const groupedListOptions = Object.values(CHECKLIST_GROUPS || {}).map(group => {
    const listsInGroup = Object.values(CHECKLISTS || {}).filter(l => l.groupId === group.id);
    if (listsInGroup.length === 0) return '';
    return `<optgroup label="${group.name}">${listsInGroup.map(list => `<option value="${list.id}" ${list.id === listId ? 'selected' : ''}>${list.name}</option>`).join('')}</optgroup>`;
  }).join('');

  // --- FIX: BERECHTIGUNGSPRÜFUNG ---
  // Wir nutzen das importierte currentUser Objekt oder den Window-Fallback
  const userObj = currentUser || window.currentUser;
  
  // Darf umschalten, wenn Systemadmin ODER explizite Berechtigung
  const isSystemAdmin = userObj?.role === 'SYSTEMADMIN';
  const hasSwitchPerm = (userObj?.permissions || []).includes('CHECKLIST_SWITCH');
  
  const canSwitchLists = isSystemAdmin || hasSwitchPerm;
  const disabledAttr = canSwitchLists ? '' : 'disabled';
  // ----------------------------------

  contentWrapper.innerHTML = `
    <div class="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm mb-4">
      <h2 class="text-2xl font-bold text-gray-800">${CHECKLISTS[listId].name}</h2>
      <select id="checklist-switcher" class="p-2 border rounded-lg bg-gray-50 text-sm" ${disabledAttr}>${groupedListOptions}</select>
    </div>

    <div class="bg-white p-3 rounded-lg shadow-sm mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      <input type="text" id="checklist-filter-text" class="p-2 border rounded-lg text-sm" placeholder="Nach Text oder ID suchen...">
      <select id="checklist-filter-status" class="p-2 border rounded-lg bg-white text-sm">
        <option value="all">Alle anzeigen</option>
        <option value="open">Nur Offene</option>
        <option value="done">Nur Erledigte</option>
      </select>
    </div>

    <div id="checklist-stats" class="bg-indigo-50 p-3 rounded-lg text-center mb-4 text-sm font-semibold text-indigo-800"></div>
    <div id="checklist-items-container" class="space-y-2"></div>
    <div id="checklist-done-section" class="mt-6 hidden">
      <h3 class="font-bold text-lg text-gray-500 mb-2">Erledigt</h3>
      <div id="checklist-done-items-container" class="space-y-2"></div>
    </div>
  `;

  const switcher = contentWrapper.querySelector('#checklist-switcher');
  if (switcher && canSwitchLists) {
    switcher.addEventListener('change', (e) => renderChecklistView(e.target.value));
  }

  contentWrapper.querySelector('#checklist-filter-text')?.addEventListener('input', () => renderChecklistItems(listId));
  contentWrapper.querySelector('#checklist-filter-status')?.addEventListener('change', () => renderChecklistItems(listId));

  // render items
  renderChecklistItems(listId);
}


// ERSETZE die Funktion "renderChecklistItems" in checklist.js:

export function renderChecklistItems(listId) {
  const view = document.getElementById('checklistView');
  if (!view) return;
  const itemsContainer = view.querySelector('#checklist-items-container');
  const doneContainer = view.querySelector('#checklist-done-items-container');
  const statsEl = view.querySelector('#checklist-stats');
  if (!itemsContainer) return;

  const allItems = (CHECKLIST_ITEMS[listId] || []).map((it, idx) => ({ ...it, originalIndex: idx }));
  const filterText = (view.querySelector('#checklist-filter-text')?.value || '').toLowerCase();
  const filterStatus = view.querySelector('#checklist-filter-status')?.value || 'all';

  // 1. Filtern
  const filtered = allItems.filter(item => {
    const idStr = String(item.originalIndex + 1);
    const matchesText = !filterText || (item.text || '').toLowerCase().includes(filterText) || idStr.includes(filterText);
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'open' && item.status !== 'done') ||
      (filterStatus === 'done' && item.status === 'done');
    return matchesText && matchesStatus;
  });

  const doneItems = filtered.filter(i => i.status === 'done');
  const openItems = filtered.filter(i => i.status !== 'done');

  // Statistik
  const total = filtered.length;
  const doneCount = doneItems.length;
  const openCount = openItems.length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  if (statsEl) statsEl.innerHTML = `${doneCount} von ${total} erledigt - Noch ${openCount} offen (${percent}%)`;


  // HELPER: Robustes Datum formatieren
  function formatActionTime(timestamp) {
      if (!timestamp) return ''; // Kein Zeitstempel vorhanden

      let dateObj = null;
      // Fall 1: Firestore Timestamp (vom Server geladen)
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
          dateObj = timestamp.toDate();
      } 
      // Fall 2: Lokales Date Objekt (falls lokal optimistisch gesetzt)
      else if (timestamp instanceof Date) {
          dateObj = timestamp;
      }
      // Fall 3: Timestamp ist Sekunden-Objekt (manchmal bei Serialisierung)
      else if (timestamp.seconds) {
          dateObj = new Date(timestamp.seconds * 1000);
      }

      if (dateObj) {
          return ' • ' + dateObj.toLocaleString('de-DE', { 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit' 
          });
      }
      
      // Fall 4: Timestamp wurde gerade gesetzt (serverTimestamp placeholder)
      return ' • Gerade eben';
  }

  // Helper für Badges
  function getBadgesHTML(item) {
      let html = '';
      if (item.assignedToName) {
          html += `<span class="text-[10px] px-1.5 py-0.5 rounded-full border mr-1 font-semibold ${getPersonBadgeClass(item.assignedTo || item.assignedToName)}">${escapeHtml(item.assignedToName)}</span>`;
      }
      if (item.categoryName) {
          const styleClass = item.categoryColor && item.categoryColor !== 'gray' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-blue-50 text-blue-600 border-blue-100';
          html += `<span class="text-[10px] px-1.5 py-0.5 rounded border ${styleClass} font-semibold">${escapeHtml(item.categoryName)}</span>`;
      }
      return html;
  }

  // --- RENDER OPEN ITEMS (Gruppiert) ---
  itemsContainer.innerHTML = '';

  if (openItems.length === 0) {
      itemsContainer.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">Alles erledigt! 🎉</p>';
  } else {
      const groups = {};
      openItems.forEach(item => {
          const catName = item.categoryName || 'Allgemein';
          if (!groups[catName]) groups[catName] = [];
          groups[catName].push(item);
      });

      const sortedGroupNames = Object.keys(groups).sort();

      sortedGroupNames.forEach(groupName => {
          const groupItems = groups[groupName];
          groupItems.sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));

          itemsContainer.innerHTML += `
            <div class="mb-4">
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-200 pb-1 ml-1">${escapeHtml(groupName)}</h4>
                <div class="space-y-2">
                    ${groupItems.map(item => {
                        const importantClass = item.important ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-white border-l-4 border-transparent';
                        const badges = getBadgesHTML(item);
                        
                        let reactivatedInfo = '';
                        if (item.lastActionBy && item.lastActionBy.startsWith('Zurückgestellt')) {
                             const timeStr = formatActionTime(item.lastActionAt);
                             reactivatedInfo = `<p class="text-[10px] text-orange-400 mt-0.5 italic">${escapeHtml(item.lastActionBy)}${timeStr}</p>`;
                        }

                        return `
                          <div class="${importantClass} p-3 rounded-lg shadow-sm flex flex-col gap-1 border border-gray-100 transition-all hover:shadow-md" data-item-id="${item.id}">
                            <div class="flex items-start justify-between gap-3">
                              <div class="flex-grow min-w-0">
                                <span class="text-sm font-medium text-gray-800 block leading-snug select-none break-words">
                                    ${escapeHtml(item.text || '')}
                                </span>
                                <div class="mt-1 flex flex-wrap gap-1 items-center">
                                    ${badges}
                                </div>
                                ${reactivatedInfo}
                              </div>
                              <input type="checkbox" data-item-id="${item.id}" class="checklist-item-cb h-6 w-6 rounded border-gray-300 text-indigo-600 mt-0.5 cursor-pointer flex-shrink-0" ${item.status === 'done' ? 'checked' : ''}>
                            </div>
                          </div>
                        `;
                    }).join('')}
                </div>
            </div>
          `;
      });
  }

  // --- RENDER DONE ITEMS ---
  if (doneContainer) {
    if (doneItems.length > 0) {
      view.querySelector('#checklist-done-section')?.classList.remove('hidden');
      
      doneItems.sort((a, b) => {
          const timeA = a.lastActionAt?.seconds || 0;
          const timeB = b.lastActionAt?.seconds || 0;
          return timeB - timeA;
      });

      doneContainer.innerHTML = doneItems.map(item => {
        let doneMeta = '';
        if (item.lastActionBy) {
            const timeStr = formatActionTime(item.lastActionAt);
            doneMeta = `<p class="text-[10px] text-gray-400 mt-1">Erledigt von <strong class="text-gray-500">${escapeHtml(item.lastActionBy)}</strong>${timeStr}</p>`;
        }

        const badges = getBadgesHTML(item);

        return `
          <div class="bg-gray-50 p-2 rounded-lg shadow-sm flex flex-col gap-1 opacity-75 mb-2 border border-gray-200" data-item-id="${item.id}">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-grow min-w-0">
                <span class="text-sm line-through text-gray-500 select-none break-words">${escapeHtml(item.text || '')}</span>
                <div class="mt-0.5 flex flex-wrap gap-1 items-center opacity-60">
                    ${badges}
                </div>
                ${doneMeta}
              </div>
              <input type="checkbox" data-item-id="${item.id}" class="checklist-item-cb h-5 w-5 rounded border-gray-300 text-gray-400 mt-0.5 cursor-pointer flex-shrink-0" checked>
            </div>
          </div>
        `;
      }).join('');
    } else {
      view.querySelector('#checklist-done-section')?.classList.add('hidden');
      doneContainer.innerHTML = '';
    }
  }

  // --- LISTENER (Verhindert doppelte Registrierung) ---
  const wrapper = document.getElementById('checklist-content-wrapper');
  
  if (wrapper && !wrapper.dataset.checkboxListener) {
      wrapper.addEventListener('click', async (e) => {
          const cb = e.target.closest('.checklist-item-cb');
          if (!cb) return;
          e.preventDefault();
          const itemId = cb.dataset.itemId;
          const listId = view.dataset.currentListId;
          const now = Date.now();
          const lastClick = checklistCheckboxClickTracker.get(itemId) || 0;

          if (now - lastClick < 1000) {
              checklistCheckboxClickTracker.delete(itemId);
              await toggleChecklistItemStatusByDoubleClick(itemId, listId, cb);
              return;
          }

          checklistCheckboxClickTracker.set(itemId, now);
          window.setTimeout(() => {
              if (checklistCheckboxClickTracker.get(itemId) === now) {
                  checklistCheckboxClickTracker.delete(itemId);
              }
          }, 1000);
      });
      wrapper.dataset.checkboxListener = 'true';
  }
}





// ERSETZE die Funktion "renderChecklistSettingsItems" in checklist.js:

export function renderChecklistSettingsItems(listId) {
  const container = document.getElementById('checklist-items-editor-container');
  if (!container) return;
  
  if (!listId || !CHECKLISTS[listId]) {
    container.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte zuerst eine gültige Checkliste auswählen.</p>';
    return;
  }

  const items = (CHECKLIST_ITEMS[listId] || []).slice();
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="text-sm text-center text-gray-500">Diese Liste hat noch keine Einträge.</p>';
    return;
  }

  // Sortierung: Wichtig zuerst, dann nach Erstellung
  items.sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));

  container.innerHTML = items.map((item, idx) => {
    const impClass = item.important ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-white';
    const assigned = item.assignedToName ? `<span class="ml-2 text-[10px] py-0.5 px-2 rounded-full border ${getPersonBadgeClass(item.assignedTo || item.assignedToName)}">${escapeHtml(item.assignedToName)}</span>` : '';
    const cat = item.categoryName ? `<span class="ml-2 text-[10px] bg-blue-50 text-blue-600 border border-blue-100 py-0.5 px-2 rounded-full">${escapeHtml(item.categoryName)}</span>` : '';
    
    return `
      <div class="${impClass} p-3 rounded-lg flex justify-between items-start border border-gray-200 mb-2 shadow-sm" data-item-id="${item.id}">
        <div class="flex-1 min-w-0">
          <div class="flex items-start gap-2">
            <span class="text-xs font-bold text-gray-400 pt-1">${idx+1}.</span>
            <div class="flex-grow">
              <p class="font-semibold text-sm item-text text-gray-800 break-words">${escapeHtml(item.text)}</p>
              <div class="flex flex-wrap gap-1 mt-1 items-center">
                ${assigned} ${cat}
                <span class="text-[10px] text-gray-400 ml-1">von: ${escapeHtml(item.addedBy || 'Unbekannt')}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col items-end gap-2 ml-2">
          <button class="edit-checklist-item-btn p-1 text-blue-500 hover:bg-blue-100 rounded" title="Bearbeiten">✎</button>
        </div>
      </div>
    `;
  }).join('');
  
  // WICHTIG: Hier KEINE EventListener hinzufügen! Das macht jetzt setupListAndItemManagementListeners.
}



function renderDeletedListsModal() {
    const container = document.getElementById('deletedListsContainer');
    if (!container) return;
    container.innerHTML = ''; // Leeren

    const deletedLists = Object.values(DELETED_CHECKLISTS).sort((a, b) => {
        const timeA = a?.deletedAt?.seconds || 0;
        const timeB = b?.deletedAt?.seconds || 0;
        return timeB - timeA;
    });

    if (deletedLists.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Keine gelöschten Listen vorhanden.</p>';
        return;
    }

    deletedLists.forEach(list => {
        const date = list.deletedAt?.toDate().toLocaleString('de-DE') || 'Unbekannt';
        const itemDiv = document.createElement('div');
        itemDiv.className = 'p-3 bg-gray-50 rounded-lg flex justify-between items-center border';
        itemDiv.innerHTML = `
                    <div>
                        <p class="font-semibold">${list.name}</p>
                        <p class="text-xs text-gray-500">Gelöscht von ${list.deletedBy} am ${date}</p>
                    </div>
                    <button data-list-id="${list.id}" class="restore-checklist-btn py-1 px-3 bg-green-100 text-green-800 text-xs font-semibold rounded-lg hover:bg-green-200">Wiederherstellen</button>
                `;
        container.appendChild(itemDiv);
    });

    const deletedListsContainer = document.getElementById('deletedListsContainer');
    if (deletedListsContainer && !deletedListsContainer.dataset.listenerAttached) {
        deletedListsContainer.addEventListener('click', async (e) => {
            const restoreBtn = e.target.closest('.restore-checklist-btn');
            if (restoreBtn) {
                const listId = restoreBtn.dataset.listId;
                await updateDoc(doc(checklistsCollectionRef, listId), { isDeleted: false, deletedAt: null, deletedBy: null });
                alertUser("Liste wurde aus dem Papierkorb wiederhergestellt.", "success");
            }
        });
        deletedListsContainer.dataset.listenerAttached = 'true';
    }
    setupPermanentDeleteModalListeners();
}

function renderArchivedListsModal() {
    const container = document.getElementById('archivedListsContainer');
    container.innerHTML = '';

    const archivedLists = Object.values(ARCHIVED_CHECKLISTS).sort((a, b) => (b.archivedAt?.seconds || 0) - (a.archivedAt?.seconds || 0));

    if (archivedLists.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Keine archivierten Listen vorhanden.</p>';
        return;
    }

    archivedLists.forEach(list => {
        const date = list.archivedAt?.toDate().toLocaleString('de-DE') || 'Unbekannt';
        const itemDiv = document.createElement('div');
        itemDiv.className = 'p-3 bg-gray-50 rounded-lg border';
        itemDiv.innerHTML = `
            <div class="flex justify-between items-center">
                <div>
                    <p class="font-semibold">${list.name}</p>
                    <p class="text-xs text-gray-500">Archiviert von ${list.archivedBy || 'Unbekannt'} am ${date}</p>
                </div>
                <div class="flex gap-2">
                    <button data-list-id="${list.id}" class="restore-archived-btn py-1 px-3 bg-green-100 text-green-800 text-xs font-semibold rounded-lg hover:bg-green-200">Wiederherstellen</button>
                    <button data-list-id="${list.id}" class="delete-archived-btn py-1 px-3 bg-red-100 text-red-800 text-xs font-semibold rounded-lg hover:bg-red-200">Löschen</button>
                </div>
            </div>
        `;
        container.appendChild(itemDiv);
    });
}

function renderCategoryEditor(groupId) {
    const content = document.getElementById('category-content');
    if (!content) return;

    if (!groupId || !CHECKLIST_GROUPS[groupId]) {
        content.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte wählen Sie eine Gruppe.</p>';
        return;
    }

    const categories = (CHECKLIST_CATEGORIES[groupId] || []).slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'de'));
    const paletteEntries = Object.entries(COLOR_PALETTE || {});
    const defaultColor = categories[0]?.color && COLOR_PALETTE?.[categories[0].color] ? categories[0].color : (paletteEntries[0]?.[0] || 'gray');

    const paletteHtml = paletteEntries.map(([colorKey, colorMeta]) => `
        <button
            type="button"
            class="category-color-dot h-7 w-7 rounded-full border-2 ${colorMeta.border} ${colorMeta.bg} ${colorKey === defaultColor ? 'ring-2 ring-blue-500' : ''}"
            data-color="${colorKey}"
            title="${escapeHtml(colorMeta.name || colorKey)}">
        </button>
    `).join('');

    const categoriesHtml = categories.length
        ? categories.map(category => {
            const colorKey = category.color && COLOR_PALETTE?.[category.color] ? category.color : 'gray';
            const colorMeta = COLOR_PALETTE?.[colorKey] || COLOR_PALETTE.gray;
            const colorChoices = paletteEntries.map(([key, meta]) => `
                <button
                    type="button"
                    class="color-dot h-6 w-6 rounded-full border-2 ${meta.border} ${meta.bg} ${key === colorKey ? 'ring-2 ring-blue-500' : ''}"
                    data-category-id="${category.id}"
                    data-color="${key}"
                    title="${escapeHtml(meta.name || key)}">
                </button>
            `).join('');

            return `
                <div class="p-3 bg-white border rounded-lg space-y-3" data-category-id="${category.id}">
                    <div class="cat-display-content flex items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border ${colorMeta.bg} ${colorMeta.text} ${colorMeta.border}">${escapeHtml(colorMeta.name || colorKey)}</span>
                                <span class="font-semibold text-gray-800 break-words">${escapeHtml(category.name || 'Unbenannte Kategorie')}</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <button type="button" class="edit-category-btn py-1 px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded">Bearbeiten</button>
                            <button type="button" class="delete-category-btn py-1 px-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded">Löschen</button>
                        </div>
                    </div>
                    <div class="cat-edit-content hidden space-y-3">
                        <input type="text" class="edit-category-name-input w-full p-2 border rounded-lg" value="${escapeHtml(category.name || '')}">
                        <div class="flex flex-wrap gap-2">${colorChoices}</div>
                        <div class="flex justify-end">
                            <button type="button" class="save-category-btn hidden py-1.5 px-3 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">Speichern</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('')
        : '<p class="text-sm text-center text-gray-500">Für diese Gruppe sind noch keine Kategorien vorhanden.</p>';

    content.innerHTML = `
        <div class="space-y-4">
            <div class="p-3 bg-white border rounded-lg space-y-3">
                <h5 class="font-semibold text-gray-800">Neue Kategorie erstellen</h5>
                <input type="text" id="new-category-name" class="w-full p-2 border rounded-lg" placeholder="Name der Kategorie...">
                <input type="hidden" id="new-category-selected-color" value="${defaultColor}">
                <div id="new-category-color-palette" class="flex flex-wrap gap-2">${paletteHtml}</div>
                <button type="button" id="create-category-btn" class="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Kategorie erstellen</button>
            </div>
            <div class="space-y-2">${categoriesHtml}</div>
        </div>
    `;
}

function updateCategoryDropdowns() {
    // Baut die HTML-Optionen für die Kategorien neu auf, basierend auf den aktuellen Daten
    const categoryOptions = `<option value="">Keine Kategorie</option>` + Object.values(CHECKLIST_GROUPS).map(group => {
        const categoriesInGroup = CHECKLIST_CATEGORIES[group.id] || [];
        if (categoriesInGroup.length === 0) return '';
        return `<optgroup label="${escapeHtml(group.name)}">${categoriesInGroup.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('')}</optgroup>`;
    }).join('');

    const categorySelects = [
        document.getElementById('new-template-item-category'),
        document.getElementById('checklist-settings-add-category')
    ].filter(Boolean);

    categorySelects.forEach(select => {
        const selectedValue = select.value;
        select.innerHTML = categoryOptions;
        select.value = selectedValue;
    });

    // Falls du zukünftig weitere Kategorie-Dropdowns hinzufügst, können sie hier ebenfalls aktualisiert werden.
}

// ERSETZE die Funktion "setupListAndItemManagementListeners" in checklist.js:

function setupListAndItemManagementListeners(view) {
  if (!view) return;
  // Wichtig: Idempotenz-Check, damit wir Listener nicht doppelt anhängen
  if (view.dataset.listListenersAttached === 'true') return;
  view.dataset.listListenersAttached = 'true';

  // --- Archivieren-Button ---
  const archiveBtn = view.querySelector('#checklist-archive-list-btn');
  if (archiveBtn) {
      archiveBtn.addEventListener('click', async () => {
          const listIdToArchive = view.dataset.editingListId;
          if (!listIdToArchive || !CHECKLISTS[listIdToArchive]) {
              return alertUser("Keine gültige Liste zum Archivieren ausgewählt.", "error");
          }
          if (confirm(`Liste "${CHECKLISTS[listIdToArchive].name}" archivieren?`)) {
              try {
                  await updateDoc(doc(checklistsCollectionRef, listIdToArchive), {
                      isArchived: true,
                      archivedAt: serverTimestamp(),
                      archivedBy: window.currentUser?.displayName || 'Unbekannt'
                  });
                  alertUser('Liste archiviert.', 'success');
              } catch (error) {
                  console.error(error);
                  alertUser('Fehler beim Archivieren.', "error");
              }
          }
      });
  }

  // --- Eintrag hinzufügen ---
  const addItemBtn = view.querySelector('#checklist-settings-add-item-btn');
  const addTextInput = view.querySelector('#checklist-settings-add-text');
  
  const addHandler = async () => {
    const textInput = view.querySelector('#checklist-settings-add-text');
    const assigneeSelect = view.querySelector('#checklist-settings-add-assignee');
    const categorySelect = view.querySelector('#checklist-settings-add-category');
    const importantCheck = view.querySelector('#checklist-settings-add-important');
    const currentListId = view.dataset.editingListId;

    if (!currentListId || !CHECKLISTS[currentListId]) { 
        return alertUser("Bitte wähle eine gültige Liste aus.", "error");
    }
    
    const text = textInput.value.trim(); 
    if (!text) return alertUser('Bitte Text eingeben.', 'error');
    
    const assignee = assigneeSelect.value || null; 
    const category = categorySelect.value || null; 
    const important = importantCheck.checked || false;
    
    const payload = { 
        listId: currentListId, 
        text, 
        status: 'open', 
        important, 
        addedBy: getCurrentActorName(), 
        addedAt: serverTimestamp(), 
        assignedTo: assignee, 
        assignedToName: (assignee && USERS[assignee]?.name) ? USERS[assignee].name : null, 
        categoryId: category, 
        categoryName: null, 
        categoryColor: null 
    };
    
    if (category) { 
        for (const group of Object.values(CHECKLIST_CATEGORIES || {})) { 
            const found = (group || []).find(c => c.id === category); 
            if (found) { 
                payload.categoryName = found.name; 
                payload.categoryColor = found.color || 'gray'; 
                break; 
            } 
        } 
    }
    
    try {
      if (typeof addDoc === 'function' && checklistItemsCollectionRef) { 
          await addDoc(checklistItemsCollectionRef, payload); 
      }
      textInput.value = ''; 
      alertUser('Eintrag hinzugefügt.', 'success');
    } catch (err) { 
        console.error(err); 
        alertUser('Fehler beim Hinzufügen.', 'error'); 
    }
  };

  if (addItemBtn) addItemBtn.addEventListener('click', addHandler);
  if (addTextInput) addTextInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addHandler(); } });

  // --- ZENTRALE DELEGIERTE LISTENER FÜR ITEMS (BEARBEITEN / LÖSCHEN) ---
  // Fix für Bug 5 & 9: Wir hängen den Listener an den Container, NICHT an jedes Item
  const itemsEditor = view.querySelector('#checklist-items-editor-container');
  if (itemsEditor) {
    itemsEditor.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-checklist-item-btn');
      
      if (editBtn) {
          const row = editBtn.closest('[data-item-id]');
          if (!row) return;
          openChecklistItemEditModal({ mode: 'checklist', itemId: row.dataset.itemId, listId: view.dataset.editingListId || null });
          return;
      }
    });
  }

  // --- Listen-Verwaltung Buttons (Archiv/Papierkorb Öffnen) ---
   const showArchivedBtn = view.querySelector('#show-archived-lists-btn');
   if (showArchivedBtn) {
       showArchivedBtn.addEventListener('click', () => {
           if(typeof renderArchivedListsModal === 'function') renderArchivedListsModal();
           document.getElementById('archivedListsModal').style.display = 'flex';
       });
   }
   const showDeletedBtn = view.querySelector('#show-deleted-lists-btn');
   if (showDeletedBtn) {
       showDeletedBtn.addEventListener('click', () => {
           if(typeof renderDeletedListsModal === 'function') renderDeletedListsModal();
           document.getElementById('deletedListsModal').style.display = 'flex';
       });
   }

  // --- Neue Liste erstellen ---
  const createListBtn = view.querySelector('#checklist-settings-create-list-btn');
   if (createListBtn) {
       createListBtn.addEventListener('click', async () => {
         const nameInput = view.querySelector('#checklist-settings-new-name'); 
         const groupSelector = view.querySelector('#checklist-settings-new-group-selector'); 
         const name = nameInput?.value.trim(); 
         const groupId = groupSelector?.value; 
         
         if (!name || !groupId) return alertUser("Bitte Name und Gruppe angeben.", "error");
         
         try { 
             const docRef = await addDoc(checklistsCollectionRef, { 
                 name, 
                 isDeleted: false, 
                 isArchived: false, 
                 groupId, 
                 groupName: CHECKLIST_GROUPS[groupId]?.name || null 
             }); 
             nameInput.value = ''; 
             groupSelector.value = ''; 
             alertUser(`Liste "${name}" erstellt.`, 'success'); 
             // View neu laden mit neuer ID
             renderChecklistSettingsView(docRef.id); 
         } catch (err) { 
             console.error(err); 
             alertUser('Fehler beim Erstellen.', 'error'); 
         }
       });
   }
}

function setupGroupManagementListeners(view, currentUserData) {
    if (!view) return;
    // idempotent
    if (view.dataset.groupListenersAttached === 'true') return;
    view.dataset.groupListenersAttached = 'true';

    const showCreateBtn = view.querySelector('#show-create-group-form-btn');
    const createForm = view.querySelector('#create-group-form');
    const createBtn = view.querySelector('#checklist-settings-create-group-btn');
    const manageDropdown = view.querySelector('#manage-groups-dropdown');
    const editBtn = view.querySelector('#edit-selected-group-btn');
    const deleteBtn = view.querySelector('#delete-selected-group-btn');

    // Helfer: baut die Group-Dropdowns/Selects neu (setzt innerHTML komplett)
    const rebuildGroupSelects = () => {
        const groups = Object.values(CHECKLIST_GROUPS || {});
        const options = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        // setze überall dort, wo Gruppen verwendet werden
        const selects = [
            view.querySelector('#manage-groups-dropdown'),
            view.querySelector('#checklist-settings-new-group-selector'),
            view.querySelector('#category-group-selector')
        ].filter(Boolean);
        selects.forEach(sel => {
            const prev = sel.value;
            sel.innerHTML = `<option value="">Gruppe wählen...</option>` + options;
            // versuche vorherige Auswahl wiederherzustellen, falls noch vorhanden
            if (prev) sel.value = prev;
        });
    };

    // Zeige/Verstecke Create-Form
    if (showCreateBtn && createForm) {
        showCreateBtn.addEventListener('click', () => {
            createForm.classList.remove('hidden');
            createForm.classList.add('flex');
            showCreateBtn.classList.add('hidden');
        });
    }

    // Create Group
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const nameInput = view.querySelector('#checklist-settings-new-group-name');
            if (!nameInput) return;
            const newName = nameInput.value.trim();
            if (!newName) {
                if (typeof alertUser === 'function') alertUser('Bitte einen Gruppennamen eingeben.', 'error');
                return;
            }
            // Duplikatprüfung
            const allNames = Object.values(CHECKLIST_GROUPS || {}).map(g => g.name.toLowerCase());
            if (allNames.includes(newName.toLowerCase())) {
                if (typeof alertUser === 'function') alertUser(`Gruppe "${newName}" existiert bereits.`, 'error');
                return;
            }
            try {
                if (typeof addDoc === 'function' && typeof checklistGroupsCollectionRef !== 'undefined') {
                    await addDoc(checklistGroupsCollectionRef, { name: newName });
                } else {
                    // lokales Fallback (nur für Test)
                    const id = String(Date.now());
                    CHECKLIST_GROUPS[id] = { id, name: newName };
                }
                nameInput.value = '';
                if (typeof alertUser === 'function') alertUser(`Gruppe "${newName}" erstellt.`, 'success');
                // Rebuild selects & re-render settings view if open
                await (typeof renderChecklistSettingsView === 'function' ? renderChecklistSettingsView() : Promise.resolve());
                rebuildGroupSelects();
            } catch (err) {
                console.error('Fehler beim Erstellen der Gruppe:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Erstellen der Gruppe.', 'error');
            }
        });
    }

    // Edit group - Umbennen
    if (editBtn) {
        editBtn.addEventListener('click', async () => {
            const sel = view.querySelector('#manage-groups-dropdown');
            const groupId = sel?.value;
            if (!groupId) {
                if (typeof alertUser === 'function') alertUser('Bitte zuerst eine Gruppe auswählen.', 'error');
                return;
            }
            const currentName = (CHECKLIST_GROUPS[groupId] && CHECKLIST_GROUPS[groupId].name) || '';
            const newName = prompt('Neuer Name für die Gruppe:', currentName);
            if (newName === null) return; // Abbrechen
            const trimmed = newName.trim();
            if (!trimmed) {
                if (typeof alertUser === 'function') alertUser('Name darf nicht leer sein.', 'error');
                return;
            }
            // Duplikatprüfung
            const otherNames = Object.values(CHECKLIST_GROUPS || {}).filter(g => g.id !== groupId).map(g => g.name.toLowerCase());
            if (otherNames.includes(trimmed.toLowerCase())) {
                if (typeof alertUser === 'function') alertUser('Eine Gruppe mit diesem Namen existiert bereits.', 'error');
                return;
            }
            try {
                if (typeof updateDoc === 'function' && typeof doc === 'function') {
                    await updateDoc(doc(checklistGroupsCollectionRef, groupId), { name: trimmed });
                } else {
                    CHECKLIST_GROUPS[groupId].name = trimmed;
                }
                if (typeof alertUser === 'function') alertUser(`Gruppe umbenannt in "${trimmed}".`, 'success');
                // Synchronisiere Namen in Checklisten, falls nötig (falls du das wolltest)
                await (typeof renderChecklistSettingsView === 'function' ? renderChecklistSettingsView() : Promise.resolve());
                rebuildGroupSelects();
            } catch (err) {
                console.error('Fehler beim Umbennen der Gruppe:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Umbennen.', 'error');
            }
        });
    }

    // Delete group
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            const sel = view.querySelector('#manage-groups-dropdown');
            const groupId = sel?.value;
            if (!groupId) {
                if (typeof alertUser === 'function') alertUser('Bitte zuerst eine Gruppe auswählen.', 'error');
                return;
            }
            const groupName = CHECKLIST_GROUPS[groupId]?.name || 'Unbekannt';
            if (!confirm(`WARNUNG: Alle Listen in der Gruppe "${groupName}" werden in den Papierkorb verschoben. Fortfahren?`)) return;
            const finalConfirmation = prompt(`Um die Gruppe "${groupName}" und alle ihre Listen zu verschieben, gib bitte "GRUPPE LÖSCHEN" ein:`);
            if (finalConfirmation !== 'GRUPPE LÖSCHEN') {
                if (finalConfirmation !== null) if (typeof alertUser === 'function') alertUser('Löschvorgang abgebrochen.', 'error');
                return;
            }
            try {
                // Lösche Gruppe + verschiebe Listen in Papierkorb (Batch wenn möglich)
                if (typeof writeBatch === 'function' && typeof db !== 'undefined') {
                    const batch = writeBatch(db);
                    const listsToDelete = Object.values(CHECKLISTS || {}).filter(list => list.groupId === groupId);
                    listsToDelete.forEach(list => batch.update(doc(checklistsCollectionRef, list.id), { isDeleted: true, deletedAt: serverTimestamp ? serverTimestamp() : null }));
                    batch.delete(doc(checklistGroupsCollectionRef, groupId));
                    await batch.commit();
                } else {
                    // Fallback: lokal
                    Object.values(CHECKLISTS || {}).forEach(list => { if (list.groupId === groupId) { list.isDeleted = true; } });
                    delete CHECKLIST_GROUPS[groupId];
                }
                if (typeof alertUser === 'function') alertUser(`Gruppe "${groupName}" entfernt und Listen verschoben.`, 'success');
                rebuildGroupSelects();
                await (typeof renderChecklistSettingsView === 'function' ? renderChecklistSettingsView() : Promise.resolve());
            } catch (err) {
                console.error('Fehler beim Löschen der Gruppe:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Löschen der Gruppe.', 'error');
            }
        });
    }

    // initial build
    rebuildGroupSelects();
}

// Ersetze DIESE Funktion komplett
// Ersetze NUR diese Funktion in checklist.js
function setupSchiffAndContainerManagementListeners(view) {
    if (!view) {
        console.error("setupSchiffAndContainerManagementListeners: 'view' wurde nicht übergeben.");
        return;
    }
    const templatesCard = view.querySelector('#card-templates');
    if (!templatesCard) {
         console.error("setupSchiffAndContainerManagementListeners: Konnte #card-templates nicht finden.");
         return;
    }

    // --- NEUE PRÜFUNG ---
    // Prüfen, ob das Attribut direkt existiert
    if (templatesCard.hasAttribute('data-primary-listener-attached')) {
        console.log("setupSchiffAndContainerManagementListeners: Listener bereits vorhanden (via Attribut-Check), breche ab.");
        return; // Verhindert doppelte Listener zuverlässiger
    }
    // Attribut setzen, um zu markieren
    templatesCard.setAttribute('data-primary-listener-attached', 'true');
    // --- ENDE NEUE PRÜFUNG ---

    console.log("setupSchiffAndContainerManagementListeners: Hänge PRIMÄREN Listener an #card-templates an.");

    const clearTemplateEditorSelection = () => {
        selectedTemplateId = null;
        const editor = document.getElementById('template-item-editor');
        if (editor) {
            editor.classList.add('hidden');
            editor.dataset.templateId = '';
        }
        if (typeof unsubscribeTemplateItems === 'function') {
            unsubscribeTemplateItems();
            unsubscribeTemplateItems = null;
        }
    };

    const syncMaintenancePanels = () => {
        const activePanel = view.dataset.activeTemplateMaintenancePanel || '';
        const opsSection = view.querySelector('#ship-container-maintenance-section');
        const contentSection = view.querySelector('#content-maintenance-section');
        const opsButton = view.querySelector('#toggle-ship-container-maintenance-btn');
        const contentButton = view.querySelector('#toggle-content-maintenance-btn');

        opsSection?.classList.toggle('hidden', activePanel !== 'ops');
        contentSection?.classList.toggle('hidden', activePanel !== 'content');

        const opsChevron = opsButton?.querySelector('.maintenance-panel-chevron');
        const contentChevron = contentButton?.querySelector('.maintenance-panel-chevron');
        if (opsChevron) opsChevron.textContent = activePanel === 'ops' ? '−' : '+';
        if (contentChevron) contentChevron.textContent = activePanel === 'content' ? '−' : '+';
        opsButton?.setAttribute('aria-expanded', String(activePanel === 'ops'));
        contentButton?.setAttribute('aria-expanded', String(activePanel === 'content'));
    };

    const syncManagedShipForm = () => {
        const shipSelector = view.querySelector('#delete-ship-selector');
        if (!shipSelector) return;
        const currentValue = shipSelector.value;
        const shipOpts = Object.values(CHECKLIST_SHIPS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        shipSelector.innerHTML = `<option value="">Schiff auswählen...</option>` + shipOpts;
        if (currentValue && CHECKLIST_SHIPS[currentValue]) {
            shipSelector.value = currentValue;
        }
        const manageShipNameInput = view.querySelector('#manage-ship-name');
        if (manageShipNameInput) {
            manageShipNameInput.value = shipSelector.value ? (CHECKLIST_SHIPS[shipSelector.value]?.name || '') : '';
        }
    };

    syncMaintenancePanels();

    const applyTemplateItemFormSelection = () => {
        const assigneeSelect = document.getElementById('new-template-item-assignee');
        if (assigneeSelect) {
            assigneeSelect.value = lastTemplateItemFormSelection.assignedTo || '';
        }
        const categorySelect = document.getElementById('new-template-item-category');
        if (categorySelect) {
            categorySelect.value = lastTemplateItemFormSelection.categoryId || '';
        }
    };

    const addTemplateItemFromEditor = async () => {
        const textInput = document.getElementById('new-template-item-text');
        const assigneeSelect = document.getElementById('new-template-item-assignee');
        const categorySelect = document.getElementById('new-template-item-category');
        const importantCheckbox = document.getElementById('new-template-item-important');
        const activeTemplateId = getActiveTemplateId();
        if (!textInput || !assigneeSelect || !categorySelect || !importantCheckbox) {
            console.error("Fehler: Elemente zum Hinzufügen von Template-Items nicht gefunden.");
            alertUser("Fehler: UI-Elemente nicht gefunden.", "error");
            return false;
        }
        if (!activeTemplateId) {
            alertUser("Bitte zuerst einen Container auswählen.", "error");
            return false;
        }
        const text = textInput.value.trim();
        if (!text) {
            alertUser("Bitte Text eingeben.", "error");
            return false;
        }
        const assignedTo = assigneeSelect.value;
        const assignedToName = assignedTo ? assigneeSelect.options[assigneeSelect.selectedIndex].text : null;
        const categoryId = categorySelect.value;
        const categoryName = categoryId ? categorySelect.options[categorySelect.selectedIndex].text : null;
        const newItemData = { text, important: importantCheckbox.checked, assignedTo: assignedTo || null, assignedToName, categoryId: categoryId || null, categoryName, addedBy: getCurrentActorName(), addedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null };
        try {
            const itemsSubCollectionRef = collection(checklistTemplatesCollectionRef, activeTemplateId, 'template-items');
            await addDoc(itemsSubCollectionRef, newItemData);
            lastTemplateItemFormSelection.assignedTo = assignedTo || '';
            lastTemplateItemFormSelection.categoryId = categoryId || '';
            textInput.value = '';
            assigneeSelect.value = lastTemplateItemFormSelection.assignedTo;
            categorySelect.value = lastTemplateItemFormSelection.categoryId;
            importantCheckbox.checked = false;
            textInput.focus();
            return true;
        } catch (err) {
            console.error("Fehler beim Hinzufügen des Template-Items:", err);
            alertUser("Fehler beim Hinzufügen des Eintrags.", "error");
            return false;
        }
    };

    templatesCard.addEventListener('click', async (e) => {
        const maintenanceOpsToggle = e.target.closest('#toggle-ship-container-maintenance-btn');
        if (maintenanceOpsToggle) {
            view.dataset.activeTemplateMaintenancePanel = view.dataset.activeTemplateMaintenancePanel === 'ops' ? '' : 'ops';
            syncMaintenancePanels();
            return;
        }

        const maintenanceContentToggle = e.target.closest('#toggle-content-maintenance-btn');
        if (maintenanceContentToggle) {
            view.dataset.activeTemplateMaintenancePanel = view.dataset.activeTemplateMaintenancePanel === 'content' ? '' : 'content';
            syncMaintenancePanels();
            return;
        }

        const shipGroupToggle = e.target.closest('.ship-group-toggle');
        if (shipGroupToggle) {
            const shipGroupId = shipGroupToggle.dataset.shipGroupId || '';
            const nextShipGroup = view.dataset.activeTemplateShipGroup === shipGroupId ? '' : shipGroupId;
            const selectedShipGroup = selectedTemplateId && TEMPLATES[selectedTemplateId] ? (getTemplateShipId(TEMPLATES[selectedTemplateId]) || '__noship') : '';
            if (selectedTemplateId && selectedShipGroup !== nextShipGroup) {
                clearTemplateEditorSelection();
            }
            view.dataset.activeTemplateMaintenancePanel = 'content';
            view.dataset.activeTemplateShipGroup = nextShipGroup;
            syncMaintenancePanels();
            renderContainerList();
            return;
        }

        // Neues Schiff erstellen
        if (e.target.closest('#checklist-settings-create-ship-btn')) {
            console.log("... Klick auf Schiff erstellen verarbeitet.");
            const nameInput = view.querySelector('#checklist-settings-new-ship-name');
            if (!nameInput) return;
            const newName = (nameInput.value || '').trim();
            if (!newName) return alertUser && alertUser('Bitte Namen eingeben.', 'error');
            try {
                if (typeof addDoc === 'function' && checklistShipsCollectionRef) {
                    await addDoc(checklistShipsCollectionRef, { name: newName });
                } else { throw new Error("addDoc oder checklistShipsCollectionRef fehlt"); }
                nameInput.value = '';
                if (typeof alertUser === 'function') alertUser('Schiff erstellt.', 'success');
            } catch (err) {
                console.error('Fehler beim Erstellen des Schiffs:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Erstellen des Schiffs.', 'error');
            }
            return;
        }

        // Button zum Anzeigen/Verstecken des Lösch-Bereichs
        if (e.target.closest('#show-delete-ship-form-btn')) {
            console.log("... Klick auf 'Schiff verwalten...' Button verarbeitet.");
            const deleteSection = view.querySelector('#delete-ship-section');
            if (deleteSection) {
                deleteSection.classList.toggle('hidden');
                if (!deleteSection.classList.contains('hidden')) {
                    syncManagedShipForm();
                }
            }
            return;
        }

        if (e.target.closest('#rename-ship-btn')) {
            const selector = view.querySelector('#delete-ship-selector');
            const shipIdToRename = selector ? selector.value : null;
            const manageShipNameInput = view.querySelector('#manage-ship-name');
            const newShipName = manageShipNameInput ? manageShipNameInput.value.trim() : '';

            if (!shipIdToRename) {
                return alertUser && alertUser("Bitte zuerst ein Schiff auswählen.", "warning");
            }
            if (!newShipName) {
                return alertUser && alertUser("Bitte einen neuen Schiffsnamen eingeben.", "error");
            }
            const currentShipName = CHECKLIST_SHIPS[shipIdToRename]?.name || '';
            if (newShipName === currentShipName) {
                return alertUser && alertUser("Bitte einen anderen Namen eingeben.", "info");
            }
            const duplicateShip = Object.values(CHECKLIST_SHIPS || {}).find(ship => ship.id !== shipIdToRename && (ship.name || '').trim().toLowerCase() === newShipName.toLowerCase());
            if (duplicateShip) {
                return alertUser && alertUser("Ein Schiff mit diesem Namen existiert bereits.", "error");
            }

            try {
                if (!checklistShipsCollectionRef) throw new Error("checklistShipsCollectionRef ist nicht definiert!");
                await updateDoc(doc(checklistShipsCollectionRef, shipIdToRename), { name: newShipName });

                if (typeof getDocs === 'function' && typeof writeBatch === 'function' && checklistTemplatesCollectionRef) {
                    const shipSnapshots = await Promise.all([
                        getDocs(query(checklistTemplatesCollectionRef, where('shipId', '==', shipIdToRename))),
                        getDocs(query(checklistTemplatesCollectionRef, where('stackId', '==', shipIdToRename)))
                    ]);
                    const templateRefs = new Map();
                    shipSnapshots.forEach(snapshot => {
                        snapshot.forEach(docSnap => {
                            templateRefs.set(docSnap.id, docSnap.ref);
                        });
                    });
                    if (templateRefs.size > 0) {
                        const batch = writeBatch(db);
                        templateRefs.forEach(ref => {
                            batch.update(ref, { shipName: newShipName, stackName: newShipName });
                        });
                        await batch.commit();
                    }
                }

                if (CHECKLIST_SHIPS[shipIdToRename]) {
                    CHECKLIST_SHIPS[shipIdToRename].name = newShipName;
                }
                Object.values(TEMPLATES || {}).forEach(template => {
                    if (getTemplateShipId(template) === shipIdToRename) {
                        template.shipName = newShipName;
                        template.stackName = newShipName;
                    }
                });

                syncManagedShipForm();
                renderContainerList();
                if (typeof alertUser === 'function') alertUser('Schiff umbenannt.', 'success');
            } catch (err) {
                console.error("Fehler beim Umbenennen des Schiffs:", err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Umbenennen des Schiffs.', 'error');
            }
            return;
        }

        // Schiff löschen (im roten Bereich)
        if (e.target.closest('#delete-ship-btn')) {
            console.log("... Klick auf Schiff löschen (roter Button) verarbeitet.");
            const selector = view.querySelector('#delete-ship-selector');
            const shipIdToDelete = selector ? selector.value : null;

            if (!shipIdToDelete) {
                return alertUser && alertUser("Bitte zuerst ein Schiff zum Löschen auswählen.", "warning");
            }

            const containersInShip = Object.values(TEMPLATES || {}).filter(t => getTemplateShipId(t) === shipIdToDelete);
            if (containersInShip.length > 0) {
                 return alertUser && alertUser(`Das Schiff "${CHECKLIST_SHIPS[shipIdToDelete]?.name || 'Unbekannt'}" kann nicht gelöscht werden, da es noch ${containersInShip.length} Container enthält. Bitte verschieben oder löschen Sie diese zuerst.`, "error");
            }

            if (confirm(`Möchten Sie das leere Schiff "${CHECKLIST_SHIPS[shipIdToDelete]?.name || 'Unbekannt'}" wirklich unwiderruflich löschen?`)) {
                try {
                    if (!checklistShipsCollectionRef) throw new Error("checklistShipsCollectionRef ist nicht definiert!");
                    const shipRef = doc(checklistShipsCollectionRef, shipIdToDelete);
                    await deleteDoc(shipRef);
                    alertUser && alertUser("Schiff gelöscht.", "success");
                    view.querySelector('#delete-ship-section')?.classList.add('hidden');
                    const manageShipNameInput = view.querySelector('#manage-ship-name');
                    if (manageShipNameInput) manageShipNameInput.value = '';
                } catch (err) {
                     console.error("Fehler beim Löschen des Schiffs:", err);
                     alertUser && alertUser(`Fehler beim Löschen des Schiffs: ${err.message}`, "error");
                }
            }
            return;
        }


        // Neues Container erstellen
        if (e.target.closest('#checklist-settings-create-container-btn')) {
             console.log("... Klick auf Container erstellen verarbeitet.");
            const newName = view.querySelector('#checklist-settings-new-container-name')?.value.trim();
            const shipId = view.querySelector('#checklist-settings-new-ship-selector')?.value;
            if (!newName) return alertUser && alertUser('Bitte Containername eingeben.', 'error');
            if (!shipId) return alertUser && alertUser('Bitte Schiff wählen.', 'error');
            try {
                if (typeof addDoc === 'function' && checklistTemplatesCollectionRef) {
                    await addDoc(checklistTemplatesCollectionRef, {
                        name: newName,
                        shipId,
                        shipName: CHECKLIST_SHIPS[shipId]?.name || null,
                        stackId: shipId,
                        stackName: CHECKLIST_SHIPS[shipId]?.name || null,
                        createdAt: serverTimestamp ? serverTimestamp() : null
                    });
                } else { throw new Error("addDoc oder checklistTemplatesCollectionRef fehlt"); }
                view.querySelector('#checklist-settings-new-container-name').value = '';
                view.querySelector('#checklist-settings-new-ship-selector').value = '';
                if (typeof alertUser === 'function') alertUser('Container erstellt.', 'success');
            } catch (err) {
                console.error('Fehler beim Erstellen des Containers:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Erstellen des Containers.', 'error');
            }
            return;
        }

        // Auswahl eines bestehenden Container-Items (Öffnen/Schließen des Editors)
         const containerItem = e.target.closest('.template-selection-item');
         if (containerItem && !e.target.closest('button') && !e.target.closest('select')) {
             console.log("... Klick auf Container-Auswahl verarbeitet.");
             const clickedTemplateId = containerItem.dataset.templateId;
             const editor = document.getElementById('template-item-editor');
             if (!clickedTemplateId || !editor) { return console.error("ID oder Editor fehlt"); };

             view.dataset.activeTemplateMaintenancePanel = 'content';
             view.dataset.activeTemplateShipGroup = getTemplateShipId(TEMPLATES[clickedTemplateId]) || '__noship';
             syncMaintenancePanels();

             if (selectedTemplateId === clickedTemplateId) {
                 clearTemplateEditorSelection();
             } else {
                selectedTemplateId = clickedTemplateId;
                editor.dataset.templateId = clickedTemplateId;
                document.getElementById('template-editor-title').textContent = `Einträge für Container "${TEMPLATES[selectedTemplateId]?.name || '–'}"`;
                editor.classList.remove('hidden');
                applyTemplateItemFormSelection();
                if (typeof unsubscribeTemplateItems === 'function') {
                    unsubscribeTemplateItems();
                    unsubscribeTemplateItems = null;
                }
                if (typeof onSnapshot === 'function' && checklistTemplatesCollectionRef) {
                    const templateId = clickedTemplateId;
                    const itemsSubCollectionRef = collection(checklistTemplatesCollectionRef, templateId, 'template-items');
                     unsubscribeTemplateItems = onSnapshot(query(itemsSubCollectionRef, orderBy('text')), (snapshot) => {
                         TEMPLATE_ITEMS[templateId] = [];
                         snapshot.forEach(doc => TEMPLATE_ITEMS[templateId].push({ id: doc.id, ...doc.data() }));
                         renderTemplateItemsEditor(templateId);
                     }, console.error);
                }
             }
             renderContainerList();
             return;
         }

        // Schiff-Zuweisung ändern (Knopf "ändern")
        if (e.target.closest('.change-ship-btn')) {
             console.log("... Klick auf Schiff-Zuweisung ändern verarbeitet.");
            const cid = e.target.closest('.change-ship-btn').dataset.containerId;
            document.getElementById(`ship-display-container-${cid}`)?.classList.add('hidden');
            document.getElementById(`ship-edit-container-${cid}`)?.classList.remove('hidden');
            return;
        }
        // Schiff-Zuweisung speichern (Knopf "Speichern")
        if (e.target.closest('.save-ship-assignment-btn')) {
             console.log("... Klick auf Schiff-Zuweisung speichern verarbeitet.");
            const cid = e.target.closest('.save-ship-assignment-btn').dataset.containerId;
            const editContainer = document.getElementById(`ship-edit-container-${cid}`);
            const newShipId = editContainer?.querySelector('.ship-assign-switcher')?.value || null;
            try {
                if (typeof updateDoc === 'function' && checklistTemplatesCollectionRef) {
                    await updateDoc(doc(checklistTemplatesCollectionRef, cid), {
                        shipId: newShipId || null,
                        shipName: newShipId ? CHECKLIST_SHIPS[newShipId]?.name : null,
                        stackId: newShipId || null,
                        stackName: newShipId ? CHECKLIST_SHIPS[newShipId]?.name : null
                    });
                } else { throw new Error("updateDoc oder checklistTemplatesCollectionRef fehlt"); }
                if (selectedTemplateId === cid) {
                    view.dataset.activeTemplateShipGroup = newShipId || '__noship';
                }
                if (typeof alertUser === 'function') alertUser('Schiff-Zuweisung gespeichert.', 'success');
                 renderContainerList();
            } catch (err) {
                console.error('Fehler beim Speichern der Schiff-Zuweisung:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Speichern.', 'error');
            }
            return;
        }

        // --- Aktionen INNERHALB des Editors ---

        // "+ Eintrag hinzufügen" Button im Editor
        if (e.target.closest('#add-template-item-btn')) {
             console.log("... Klick auf '+ Eintrag hinzufügen' (im Editor) verarbeitet.");
            await addTemplateItemFromEditor();
            return;
        }

        // "Diesen Container löschen" Button im Editor
        const deleteTemplateBtn = e.target.closest('#delete-template-btn');
        if (deleteTemplateBtn && selectedTemplateId) {
             console.log("... Klick auf 'Diesen Container löschen' (im Editor) verarbeitet.");
            const activeTemplateId = getActiveTemplateId();
            const containerName = activeTemplateId ? (TEMPLATES[activeTemplateId]?.name || 'Unbekannt') : 'Unbekannt';
            if (confirm(`Möchten Sie den Container "${containerName}" wirklich unwiderruflich löschen?`)) {
                const idToDelete = activeTemplateId;
                try {
                    if (!checklistTemplatesCollectionRef) throw new Error("checklistTemplatesCollectionRef ist nicht definiert!");
                    const templateRef = doc(checklistTemplatesCollectionRef, idToDelete);
                    await deleteDoc(templateRef);
                    alertUser && alertUser('Container gelöscht.', 'success');
                    clearTemplateEditorSelection();
                    renderChecklistSettingsView();
                } catch (err) {
                    console.error("Fehler beim Löschen des Containers:", err);
                    alertUser && alertUser(`Fehler beim Löschen: ${err.message}. (Internet/Berechtigungen prüfen)`, 'error');
                }
            }
            return;
        }

        console.log("setupSchiffAndContainerManagementListeners: Klick wurde vom primären Listener erkannt, aber keiner der spezifischen Fälle passte.");

    }); // Ende addEventListener für templatesCard

    templatesCard.addEventListener('change', (e) => {
        if (e.target.matches('#delete-ship-selector')) {
            const manageShipNameInput = view.querySelector('#manage-ship-name');
            if (manageShipNameInput) {
                manageShipNameInput.value = e.target.value ? (CHECKLIST_SHIPS[e.target.value]?.name || '') : '';
            }
        }
    });

    templatesCard.addEventListener('keydown', async (e) => {
        const textInput = e.target.closest('#new-template-item-text');
        if (!textInput || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        e.preventDefault();
        await addTemplateItemFromEditor();
    });
}

/* BACKUP-FUNKTION ZIKA 26.10. FUNKT ALLES AUSSER ARCHIV VON LISTEN
function renderChecklistSettingsView(editListId = null) {
  const view = document.getElementById('checklistSettingsView');
  if (!view) return;

  delete view.dataset.listenersSetup;
  delete view.dataset.groupListenersAttached;
  delete view.dataset.categoryListenersAttached;
  delete view.dataset.tabListenersAttached;
  const templatesCard = view.querySelector('#card-templates');
  if (templatesCard) delete templatesCard.dataset.primaryListenerAttached;


  window.currentUser = window.currentUser || { id: null, name: 'Gast', permissions: [] };
  window.adminSettings = window.adminSettings || {};

  const hasLists = Object.keys(CHECKLISTS || {}).length > 0;
  const defaultListId = adminSettings.defaultChecklistId || null;
  const listToEditId = editListId || view.dataset.editingListId || (hasLists ? Object.keys(CHECKLISTS)[0] : null);
  view.dataset.editingListId = listToEditId || '';

  view.innerHTML = `
    <div class="back-link-container w-full mb-2"></div>
    <h2 class="text-2xl font-bold text-gray-800 mb-4">Checklisten‑Einstellungen</h2>
    <div class="mb-6">
      <h3 class="text-sm font-semibold text-gray-500 mb-1 px-1">Verwalten</h3>
      <div id="settings-tabs" class="grid grid-cols-2 sm:grid-cols-4 gap-1 border rounded-lg bg-gray-100 p-1">
        <button data-target-card="card-default-list" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Standard</button>
        <button data-target-card="card-manage-lists" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Gruppen & Listen</button>
        <button data-target-card="card-categories" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Kategorien</button>
        <button data-target-card="card-templates" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Schiff & Container</button>
      </div>
    </div>
    <div id="card-default-list" class="settings-card hidden p-4 bg-white rounded-lg mb-4 space-y-3">
      <h4 class="text-lg font-bold text-gray-800">Standard-Checkliste</h4>
      <p class="text-sm text-gray-600">Lege fest, welche Checkliste beim Öffnen der App standardmäßig geladen werden soll.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
            <label class="text-xs font-semibold text-gray-500 mb-1 block">Gruppe</label>
            <select id="default-group-selector" class="w-full p-2 border rounded-lg bg-white">
                <option value="">Keine Checkliste</option>
            </select>
        </div>
        <div>
            <label class="text-xs font-semibold text-gray-500 mb-1 block">Liste</label>
            <select id="default-list-selector" class="w-full p-2 border rounded-lg bg-white" disabled></select>
        </div>
      </div>
      <button id="save-default-checklist-btn" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">Standard speichern</button>
    </div>
    <div id="card-manage-lists" class="settings-card hidden p-4 bg-white rounded-lg mb-4 space-y-4">
      <div>
        <h4 class="text-lg font-bold text-gray-800 mb-2">Gruppen verwalten</h4>
        <div class="p-3 bg-gray-50 rounded-lg space-y-2">
          <select id="manage-groups-dropdown" class="w-full p-2 border rounded-lg bg-white"><option value="">Gruppe wählen...</option></select>
          <div class="flex gap-2">
            <button id="edit-selected-group-btn" class="flex-1 py-2 px-3 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 text-sm">Umbennenen</button>
            <button id="delete-selected-group-btn" class="flex-1 py-2 px-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 text-sm">Löschen</button>
          </div>
          <button id="show-create-group-form-btn" class="w-full text-sm text-blue-600 font-semibold hover:underline mt-1">+ Neue Gruppe erstellen</button>
          <div id="create-group-form" class="hidden gap-2 pt-2 border-t mt-2">
            <input type="text" id="checklist-settings-new-group-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neue Gruppe...">
            <button id="checklist-settings-create-group-btn" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Erstellen</button>
          </div>
        </div>
      </div>
      <div>
        <h4 class="text-lg font-bold text-gray-800 mb-2">Listen verwalten</h4>
        <div class="p-3 bg-gray-50 rounded-lg space-y-2">
          <h5 class="font-semibold text-gray-700">Neue Checkliste erstellen</h5>
          <input type="text" id="checklist-settings-new-name" class="w-full p-2 border rounded-lg" placeholder="Name der neuen Liste...">
          <select id="checklist-settings-new-group-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Gruppe zuweisen...</option></select>
          <button id="checklist-settings-create-list-btn" class="w-full py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Neue Liste erstellen</button>
        </div>
        <div class="flex gap-2 mt-4">
            <button id="show-archived-lists-btn" class="flex-1 py-2 px-3 bg-yellow-100 text-yellow-800 text-sm font-semibold rounded-lg hover:bg-yellow-200">Archiv anzeigen 📦</button>
            <button id="show-deleted-lists-btn" class="flex-1 py-2 px-3 bg-red-100 text-red-800 text-sm font-semibold rounded-lg hover:bg-red-200">Papierkorb 🗑️</button>
        </div>
      </div>
    </div>
    <div id="card-categories" class="settings-card hidden p-4 bg-white rounded-lg mb-4 space-y-3">
      <h4 class="text-lg font-bold text-gray-800">Kategorien verwalten</h4>
      <p class="text-sm text-gray-600">Kategorien sind an Gruppen gebunden. Wähle eine Gruppe, um ihre Kategorien zu bearbeiten.</p>
      <select id="category-group-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Gruppe wählen...</option></select>
      <div id="category-content" class="p-3 bg-gray-50 rounded-lg min-h-[100px]">
        <p class="text-sm text-center text-gray-500">Bitte wählen Sie eine Gruppe.</p>
      </div>
    </div>
    <div id="card-templates" class="settings-card hidden p-4 bg-white rounded-lg mb-4 space-y-4">
      <div class="p-3 bg-gray-50 rounded-lg space-y-2">
        <div class="flex justify-between items-center mb-1">
            <h4 class="font-bold text-gray-800">Neues Schiff erstellen</h4>
            <button id="show-delete-ship-form-btn" class="text-xs text-blue-600 font-semibold hover:underline">Schiff verwalten...</button>
        </div>
        <div class="flex gap-2">
          <input type="text" id="checklist-settings-new-ship-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neues Schiff...">
          <button id="checklist-settings-create-ship-btn" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Erstellen</button>
        </div>
        </div>

      <div id="delete-ship-section" class="hidden p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
        <h4 class="font-bold text-blue-800">Schiff verwalten</h4>
        <select id="delete-ship-selector" class="w-full p-2 border rounded-lg bg-white border-red-300">
            <option value="">Schiff auswählen...</option>
            ${Object.values(CHECKLIST_SHIPS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <input type="text" id="manage-ship-name" class="w-full p-2 border rounded-lg" placeholder="Schiffsname bearbeiten...">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button id="rename-ship-btn" class="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Ausgewähltes Schiff umbenennen</button>
          <button id="delete-ship-btn" class="w-full py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700">Ausgewähltes Schiff löschen</button>
        </div>
      </div>
      <div class="p-3 bg-gray-50 rounded-lg space-y-2">
        <h4 class="font-bold text-gray-800">Neuen Container erstellen</h4>
        <input type="text" id="checklist-settings-new-container-name" class="w-full p-2 border rounded-lg" placeholder="Name für neuen Container...">
        <select id="checklist-settings-new-ship-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Schiff zuweisen...</option></select>
        <button id="checklist-settings-create-container-btn" class="w-full py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Container erstellen</button>
      </div>
      <div id="container-list-editor" class="space-y-2">
      </div>
      <div id="template-item-editor" class="hidden p-3 bg-indigo-50 border-t-4 border-indigo-300 rounded-lg space-y-3">
        <h4 id="template-editor-title" class="font-bold text-gray-800">Einträge für Container...</h4>
        <div id="template-items-list" class="space-y-2 max-h-48 overflow-y-auto">
        </div>
        <h5 class="font-semibold text-sm pt-2 border-t">Neuen Eintrag hinzufügen</h5>
        <input type="text" id="new-template-item-text" class="w-full p-2 border rounded-lg" placeholder="Text für Eintrag...">
        <div class="grid grid-cols-2 gap-2">
          <select id="new-template-item-assignee" class="p-2 border rounded-lg bg-white"><option value="">Zuweisen...</option></select>
          <select id="new-template-item-category" class="p-2 border rounded-lg bg-white"><option value="">Kategorie...</option></select>
        </div>
        <div class="flex items-center">
          <input type="checkbox" id="new-template-item-important" class="h-4 w-4 rounded">
          <label for="new-template-item-important" class="ml-2 text-sm text-gray-700">Als wichtig markieren</label>
        </div>
        <button id="add-template-item-btn" class="w-full py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">Eintrag zum Container hinzufügen</button>
        <button id="delete-template-btn" class="w-full py-1 text-red-600 text-sm font-semibold hover:underline">Diesen Container löschen</button>
      </div>
    </div>
    <div id="card-list-item-editor" class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-green-500 mt-6">
      <div class="flex gap-2 items-center mb-3">
        <select id="checklist-settings-editor-switcher" class="flex-grow p-2 border rounded-lg bg-white"></select>
        <button id="show-template-modal-btn" class="p-2 bg-teal-100 text-teal-800 text-sm font-bold rounded-lg hover:bg-teal-200 transition">+C</button>
        <button id="checklist-archive-list-btn" class="p-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition">📦</button>
      </div>
      <div class="mb-4 p-2 bg-gray-100 rounded-lg">
        <div id="group-display-container" class="flex justify-between items-center">
          <p class="text-sm">Aktuelle Gruppe: <span id="current-group-name" class="font-bold">—</span></p>
          <button id="edit-group-assignment-btn" class="text-sm font-semibold text-blue-600 hover:underline">ändern</button>
        </div>
        <div id="group-edit-container" class="hidden flex gap-2 items-center mt-2">
          <select id="checklist-group-assign-switcher" class="flex-grow p-2 border rounded-lg bg-white text-sm"></select>
          <button id="checklist-save-group-assignment" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition text-sm">Speichern</button>
        </div>
      </div>
      <div class="p-3 bg-gray-50 rounded-lg space-y-3 mb-4 border-t pt-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="relative sm:col-span-2">
            <input type="text" id="checklist-settings-add-text" class="w-full p-2 border rounded-lg" placeholder="Neuer Eintrag..." autocomplete="off">
            <div id="item-suggestions-container" class="absolute z-10 w-full bg-white border rounded-lg mt-1 hidden max-h-48 overflow-y-auto shadow-lg"></div>
          </div>
          <select id="checklist-settings-add-assignee" class="p-2 border rounded-lg bg-white w-full">${Object.values(USERS || {}).map(u => `<option value="${u.id}">${escapeHtml(u.name||u.displayName||'')}</option>`).join('')}</select>
          <select id="checklist-settings-add-category" class="p-2 border rounded-lg bg-white w-full"><option value="">Keine Kategorie</option></select>
        </div>
        <div class="flex items-center">
          <input type="checkbox" id="checklist-settings-add-important" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
          <label for="checklist-settings-add-important" class="ml-2 text-sm text-gray-700">Als wichtig markieren</label>
        </div>
        <button id="checklist-settings-add-item-btn" class="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">Eintrag hinzufügen</button>
      </div>
      <div id="checklist-items-editor-container" class="space-y-2 mb-4"></div>
    </div>
  `;

  // --- Alle Hilfsfunktionen und Listener-Registrierungen ---
  // (Diese bleiben gleich wie in der vorherigen Version)

  function buildEditorSwitcherOptions() {
    const groups = Object.values(CHECKLIST_GROUPS || {});
    const opts = groups.map(g => {
      const lists = Object.values(CHECKLISTS || {}).filter(l => l.groupId === g.id);
      if (lists.length === 0) return '';
      return `<optgroup label="${escapeHtml(g.name)}">${lists.map(l => `<option value="${l.id}" ${l.id === listToEditId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}</optgroup>`;
    }).join('');
    const editorSwitcher = view.querySelector('#checklist-settings-editor-switcher');
    if (editorSwitcher) {
      editorSwitcher.innerHTML = (opts || `<option value="">Keine Listen vorhanden</option>`);
      if (listToEditId) editorSwitcher.value = listToEditId;
    }
  }

  function rebuildCategorySelectForAddForm() {
    const catSelect = view.querySelector('#checklist-settings-add-category');
    if (!catSelect) return;
    const groups = Object.values(CHECKLIST_GROUPS || {});
    const html = groups.map(g => {
      const cats = CHECKLIST_CATEGORIES[g.id] || [];
      if (!cats.length) return '';
      return `<optgroup label="${escapeHtml(g.name)}">${cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</optgroup>`;
    }).join('');
    catSelect.innerHTML = `<option value="">Keine Kategorie</option>` + html;
  }

  function rebuildGroupAssignSwitcher() {
    const sel = view.querySelector('#checklist-group-assign-switcher');
    if (!sel) return;
    const html = Object.values(CHECKLIST_GROUPS || {}).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    const prev = sel.value;
    sel.innerHTML = html;
    if (prev) sel.value = prev;
  }

  buildEditorSwitcherOptions();
  rebuildCategorySelectForAddForm();
  rebuildGroupAssignSwitcher();

  function updateCurrentGroupDisplay(listId) {
    const span = view.querySelector('#current-group-name');
    const list = listId ? CHECKLISTS[listId] : null;
    span && (span.textContent = list ? (list.groupName || (CHECKLIST_GROUPS[list.groupId] && CHECKLIST_GROUPS[list.groupId].name) || '—') : '—');
  }
  updateCurrentGroupDisplay(listToEditId);

  const editorSwitcher = view.querySelector('#checklist-settings-editor-switcher');
  if (editorSwitcher && !editorSwitcher.dataset.listenerAttached) {
    editorSwitcher.addEventListener('change', (e) => {
      const val = e.target.value;
      view.dataset.editingListId = val || '';
      updateCurrentGroupDisplay(val);
      renderChecklistSettingsItems(val);
    });
    editorSwitcher.dataset.listenerAttached = '1';
  }

  const catGroupSelector = view.querySelector('#category-group-selector');
  if (catGroupSelector) {
      const groupOpts = Object.values(CHECKLIST_GROUPS || {}).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
      catGroupSelector.innerHTML = `<option value="">Gruppe wählen...</option>` + groupOpts;
      if (!catGroupSelector.dataset.listenerAttached) {
          catGroupSelector.addEventListener('change', (e) => {
              const gid = e.target.value;
              view.dataset.selectedCategoryIdForRender = gid;
              if (typeof renderCategoryEditor === 'function') {
                  renderCategoryEditor(gid);
              } else {
                  const content = view.querySelector('#category-content');
                  if (content) content.innerHTML = `<p class="text-red-500">Fehler: renderCategoryEditor nicht gefunden.</p>`;
              }
          });
          catGroupSelector.dataset.listenerAttached = '1';
      }
      if(view.dataset.selectedCategoryIdForRender) {
        catGroupSelector.value = view.dataset.selectedCategoryIdForRender;
        // Wichtig: renderCategoryEditor muss hier aufgerufen werden, NACHDEM der Wert gesetzt wurde
        if (typeof renderCategoryEditor === 'function') {
             renderCategoryEditor(view.dataset.selectedCategoryIdForRender);
        }
      }
  }

  const defaultGroupSelector = view.querySelector('#default-group-selector');
  const defaultListSelector = view.querySelector('#default-list-selector');

  if (defaultGroupSelector && defaultListSelector) {
      const groupOpts = Object.values(CHECKLIST_GROUPS || {}).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
      defaultGroupSelector.innerHTML = `<option value="">Keine Checkliste</option>` + groupOpts;
      defaultListSelector.innerHTML = `<option value="">Zuerst Gruppe wählen</option>`;

      if (!defaultGroupSelector.dataset.listenerAttached) {
          defaultGroupSelector.addEventListener('change', () => {
              const selectedGroupId = defaultGroupSelector.value;
              if (selectedGroupId) {
                  const listsInGroup = Object.values(CHECKLISTS || {}).filter(l => l.groupId === selectedGroupId);
                  if (listsInGroup.length > 0) {
                      const listOpts = listsInGroup.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
                      defaultListSelector.innerHTML = listOpts;
                      defaultListSelector.disabled = false;
                  } else {
                      defaultListSelector.innerHTML = `<option value="">Keine Listen in Gruppe</option>`;
                      defaultListSelector.disabled = true;
                  }
              } else {
                  defaultListSelector.innerHTML = `<option value="">Zuerst Gruppe wählen</option>`;
                  defaultListSelector.disabled = true;
              }
          });
          defaultGroupSelector.dataset.listenerAttached = '1';
      }

      const savedListId = window.adminSettings.defaultChecklistId;
      if (savedListId && CHECKLISTS[savedListId]) {
          const savedGroupId = CHECKLISTS[savedListId].groupId;
          if (savedGroupId) {
              defaultGroupSelector.value = savedGroupId;
              defaultGroupSelector.dispatchEvent(new Event('change'));
              if (!defaultListSelector.disabled) {
                 defaultListSelector.value = savedListId;
              }
          }
      } else {
         defaultGroupSelector.value = "";
         defaultGroupSelector.dispatchEvent(new Event('change'));
      }
  }

  const saveDefaultBtn = view.querySelector('#save-default-checklist-btn');
  if (saveDefaultBtn && !saveDefaultBtn.dataset.listenerAttached) {
      saveDefaultBtn.addEventListener('click', async () => {
          const newDefaultId = view.querySelector('#default-list-selector')?.value || null;
          const selectedGroup = view.querySelector('#default-group-selector')?.value;
          try {
              if (!settingsDocRef) throw new Error("settingsDocRef ist nicht importiert oder nicht definiert.");
              let finalId = null;
              if (selectedGroup && newDefaultId && CHECKLISTS[newDefaultId]) {
                  finalId = newDefaultId;
              }
              await updateDoc(settingsDocRef, { defaultChecklistId: finalId });
              window.adminSettings.defaultChecklistId = finalId;
              if (finalId) alertUser && alertUser('Standard-Checkliste gespeichert.', 'success');
              else alertUser && alertUser('Standard-Auswahl entfernt.', 'success');
          } catch (err) {
              console.error("Fehler beim Speichern der Standard-Liste:", err);
              alertUser && alertUser('Fehler beim Speichern.', 'error');
          }
      });
      saveDefaultBtn.dataset.listenerAttached = '1';
  }

  const shipSelector = view.querySelector('#checklist-settings-new-ship-selector');
  if (shipSelector) {
      const shipOpts = Object.values(CHECKLIST_SHIPS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      shipSelector.innerHTML = `<option value="">Schiff wählen...</option>` + shipOpts;
  }
  const deleteShipSelector = view.querySelector('#delete-ship-selector');
  if (deleteShipSelector) {
        const shipOpts = Object.values(CHECKLIST_SHIPS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        deleteShipSelector.innerHTML = `<option value="">Schiff auswählen...</option>` + shipOpts;
  }
  const manageShipNameInput = view.querySelector('#manage-ship-name');
  if (manageShipNameInput) {
      manageShipNameInput.value = deleteShipSelector?.value ? (CHECKLIST_SHIPS[deleteShipSelector.value]?.name || '') : '';
  }

  const templateAssignee = view.querySelector('#new-template-item-assignee');
  if (templateAssignee) {
      templateAssignee.innerHTML = `<option value="">Zuweisen...</option>` + Object.values(USERS || {}).map(u => `<option value="${u.id}">${escapeHtml(u.name||u.displayName||'')}</option>`).join('');
  }
  if (typeof updateCategoryDropdowns === 'function') {
      updateCategoryDropdowns();
  }

  if (typeof setupListAndItemManagementListeners === 'function') {
      setupListAndItemManagementListeners(view);
  }
  if (typeof setupGroupManagementListeners === 'function') {
      setupGroupManagementListeners(view, window.currentUser);
  }
  if (typeof setupCategoryManagementListeners === 'function') {
      setupCategoryManagementListeners(view);
  }
  if (typeof setupSchiffAndContainerManagementListeners === 'function') {
      setupSchiffAndContainerManagementListeners(view);
  }
  if (typeof setupTemplateEditorListeners === 'function') {
      setupTemplateEditorListeners();
  }

  if (typeof renderContainerList === 'function') {
      renderContainerList();
  }

  const tabButtons = view.querySelectorAll('.settings-tab-btn');
  const greenBox = view.querySelector('#card-list-item-editor');

  if (tabButtons.length > 0 && !view.dataset.tabListenersAttached) {
      tabButtons.forEach(btn => {
          btn.addEventListener('click', () => {
              const targetCardId = btn.dataset.targetCard;
              const isActive = btn.classList.contains('bg-white');
              view.querySelectorAll('.settings-card').forEach(card => card.classList.add('hidden'));
              tabButtons.forEach(b => {
                  b.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
                  b.classList.add('text-gray-600');
              });
              if (isActive) {
                  view.dataset.activeSettingsTab = '';
                  greenBox?.classList.remove('hidden');
              } else {
                  const targetCard = view.querySelector(`#${targetCardId}`);
                  if (targetCard) targetCard.classList.remove('hidden');
                  btn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
                  btn.classList.remove('text-gray-600');
                  view.dataset.activeSettingsTab = targetCardId;
                  greenBox?.classList.add('hidden');
              }
          });
      });
      const lastTab = view.dataset.activeSettingsTab;
      if (lastTab) {
          const tabToClick = view.querySelector(`.settings-tab-btn[data-target-card="${lastTab}"]`);
          if (tabToClick) tabToClick.click();
      } else {
         greenBox?.classList.remove('hidden');
      }
      view.dataset.tabListenersAttached = '1';
  }

  const editGroupBtn = view.querySelector('#edit-group-assignment-btn');
  if (editGroupBtn && !editGroupBtn.dataset.listenerAttached) {
      editGroupBtn.addEventListener('click', () => {
          view.querySelector('#group-display-container')?.classList.add('hidden');
          view.querySelector('#group-edit-container')?.classList.remove('hidden');
          const currentList = (view.dataset.editingListId && CHECKLISTS) ? CHECKLISTS[view.dataset.editingListId] : null;
          if (currentList && currentList.groupId) {
              const assignSwitcher = view.querySelector('#checklist-group-assign-switcher');
              if (assignSwitcher) assignSwitcher.value = currentList.groupId;
          }
      });
      editGroupBtn.dataset.listenerAttached = '1';
  }
  const saveGroupBtn = view.querySelector('#checklist-save-group-assignment');
  if (saveGroupBtn && !saveGroupBtn.dataset.listenerAttached) {
      saveGroupBtn.addEventListener('click', async () => {
          const assignSwitcher = view.querySelector('#checklist-group-assign-switcher');
          const newGroupId = assignSwitcher ? assignSwitcher.value : null;
          const listId = view.dataset.editingListId;
          if (!listId || !newGroupId) return alertUser && alertUser('Fehler: Liste oder Gruppe nicht gefunden.', 'error');
          const newGroupName = (newGroupId && CHECKLIST_GROUPS && CHECKLIST_GROUPS[newGroupId]) ? CHECKLIST_GROUPS[newGroupId].name : null;
          try {
              if (typeof updateDoc === 'function' && typeof doc === 'function' && typeof checklistsCollectionRef !== 'undefined') {
                  await updateDoc(doc(checklistsCollectionRef, listId), { groupId: newGroupId, groupName: newGroupName });
              } else {
                  if (CHECKLISTS && CHECKLISTS[listId]) { CHECKLISTS[listId].groupId = newGroupId; CHECKLISTS[listId].groupName = newGroupName; }
              }
              updateCurrentGroupDisplay(listId);
              view.querySelector('#group-display-container')?.classList.remove('hidden');
              view.querySelector('#group-edit-container')?.classList.add('hidden');
              buildEditorSwitcherOptions();
              alertUser && alertUser('Gruppenzuweisung gespeichert.', 'success');
          } catch (err) {
              console.error('Fehler beim Speichern der Gruppe:', err);
              alertUser && alertUser('Fehler beim Speichern.', 'error');
          }
      });
      saveGroupBtn.dataset.listenerAttached = '1';
  }

  if (listToEditId) {
    renderChecklistSettingsItems(listToEditId);
  } else {
    const container = view.querySelector('#checklist-items-editor-container');
    if (container) container.innerHTML = '<p class="text-sm text-center text-gray-500">Keine Listen vorhanden. Bitte erstellen Sie zuerst eine Liste.</p>';
  }
}
  */

// ERSETZE die Funktion "renderChecklistSettingsView" in checklist.js:

function renderChecklistSettingsView(editListId = null) {
  const view = document.getElementById('checklistSettingsView');
  if (!view) return;

  // --- WICHTIG: Alle Listener-Marker löschen, damit Buttons neu verkabelt werden ---
  view.querySelectorAll('*').forEach(el => {
      delete el.dataset.listenerAttached;
      delete el.dataset.listenersAttached;
      delete el.dataset.clickListenerAttached;
      delete el.dataset.changeListenerAttached;
  });
  
  // Hier fehlte der Marker für die Listen-Items (Deshalb ging Archivieren nicht)
  delete view.dataset.listListenersAttached; 
  
  delete view.dataset.tabListenersAttached;
  delete view.dataset.groupListenersAttached;
  delete view.dataset.categoryListenersAttached;

  window.currentUser = window.currentUser || { id: null, name: 'Gast', permissions: [] };
  window.adminSettings = window.adminSettings || {};

  const activeListsObj = CHECKLISTS || {};
  const hasLists = Object.keys(activeListsObj).length > 0;
  
  // Validierung der editListId
  let listToEditId = editListId || view.dataset.editingListId;
  if (listToEditId && !activeListsObj[listToEditId]) {
      listToEditId = null; // Falls gelöscht/archiviert
  }
  if (!listToEditId && hasLists) {
      listToEditId = Object.keys(activeListsObj)[0];
  }
  
  view.dataset.editingListId = listToEditId || '';

  // HTML Aufbau
  view.innerHTML = `
    <div class="back-link-container w-full mb-2">
      <button class="back-link flex items-center text-gray-600 hover:text-indigo-600 transition" data-target="home">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 mr-1"><path d="m15 18-6-6 6-6" /></svg>
        <span class="text-sm font-semibold">zurück</span>
      </button>
      <div class="border-t border-gray-300 mt-2"></div>
    </div>
    <h2 class="text-2xl font-bold text-gray-800 mb-4">Checklisten‑Einstellungen</h2>
    
    <div class="mb-6">
      <h3 class="text-sm font-semibold text-gray-500 mb-1 px-1">Verwalten</h3>
      <div id="settings-tabs" class="grid grid-cols-2 sm:grid-cols-4 gap-1 border rounded-lg bg-gray-100 p-1">
        <button data-target-card="card-default-list" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Standard</button>
        <button data-target-card="card-manage-lists" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Gruppen & Listen</button>
        <button data-target-card="card-categories" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Kategorien</button>
        <button data-target-card="card-templates" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Schiff & Container</button>
      </div>
    </div>

    <div id="card-default-list" class="settings-card hidden p-4 bg-white rounded-lg mb-4 space-y-3">
      <h4 class="text-lg font-bold text-gray-800">Standard-Checkliste</h4>
      <p class="text-sm text-gray-600">Lege fest, welche Checkliste beim Öffnen der App standardmäßig geladen werden soll.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
            <label class="text-xs font-semibold text-gray-500 mb-1 block">Gruppe</label>
            <select id="default-group-selector" class="w-full p-2 border rounded-lg bg-white">
                <option value="">Keine Checkliste</option>
            </select>
        </div>
        <div>
            <label class="text-xs font-semibold text-gray-500 mb-1 block">Liste</label>
            <select id="default-list-selector" class="w-full p-2 border rounded-lg bg-white" disabled></select>
        </div>
      </div>
      <button id="save-default-checklist-btn" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">Standard speichern</button>
    </div>

    <div id="card-manage-lists" class="settings-card hidden p-4 bg-white rounded-lg mb-4 space-y-4">
      <div>
        <h4 class="text-lg font-bold text-gray-800 mb-2">Gruppen verwalten</h4>
        <div class="p-3 bg-gray-50 rounded-lg space-y-2">
          <select id="manage-groups-dropdown" class="w-full p-2 border rounded-lg bg-white"><option value="">Gruppe wählen...</option></select>
          <div class="flex gap-2">
            <button id="edit-selected-group-btn" class="flex-1 py-2 px-3 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 text-sm">Umbennenen</button>
            <button id="delete-selected-group-btn" class="flex-1 py-2 px-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 text-sm">Löschen</button>
          </div>
          <button id="show-create-group-form-btn" class="w-full text-sm text-blue-600 font-semibold hover:underline mt-1">+ Neue Gruppe erstellen</button>
          <div id="create-group-form" class="hidden flex-col gap-2 pt-2 border-t mt-2">
            <input type="text" id="checklist-settings-new-group-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neue Gruppe...">
            <button id="checklist-settings-create-group-btn" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Erstellen</button>
          </div>
        </div>
      </div>
      <div>
        <h4 class="text-lg font-bold text-gray-800 mb-2">Listen verwalten</h4>
        <div class="p-3 bg-gray-50 rounded-lg space-y-2">
          <h5 class="font-semibold text-gray-700">Neue Checkliste erstellen</h5>
          <input type="text" id="checklist-settings-new-name" class="w-full p-2 border rounded-lg" placeholder="Name der neuen Liste...">
          <select id="checklist-settings-new-group-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Gruppe zuweisen...</option></select>
          <button id="checklist-settings-create-list-btn" class="w-full py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Neue Liste erstellen</button>
        </div>
        <div class="flex gap-2 mt-4">
            <button id="show-archived-lists-btn" class="flex-1 py-2 px-3 bg-yellow-100 text-yellow-800 text-sm font-semibold rounded-lg hover:bg-yellow-200">Archiv anzeigen 📦</button>
            <button id="show-deleted-lists-btn" class="flex-1 py-2 px-3 bg-red-100 text-red-800 text-sm font-semibold rounded-lg hover:bg-red-200">Papierkorb 🗑️</button>
        </div>
      </div>
    </div>

    <div id="card-categories" class="settings-card hidden p-4 bg-white rounded-lg mb-4 space-y-3">
      <h4 class="text-lg font-bold text-gray-800">Kategorien verwalten</h4>
      <p class="text-sm text-gray-600">Kategorien sind an Gruppen gebunden. Wähle eine Gruppe, um ihre Kategorien zu bearbeiten.</p>
      <select id="category-group-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Gruppe wählen...</option></select>
      <div id="category-content" class="p-3 bg-gray-50 rounded-lg min-h-[100px]">
        <p class="text-sm text-center text-gray-500">Bitte wählen Sie eine Gruppe.</p>
      </div>
    </div>

    <div id="card-templates" class="settings-card hidden p-4 bg-white rounded-lg mb-4 space-y-4">
      <div class="space-y-3">
        <div class="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <button id="toggle-ship-container-maintenance-btn" type="button" class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition">
            <span class="font-bold text-gray-800">Schiff/Container-Wartung</span>
            <span class="maintenance-panel-chevron text-xl leading-none text-gray-400">+</span>
          </button>
          <div id="ship-container-maintenance-section" class="hidden p-3 bg-gray-50 space-y-3 border-t border-gray-100">
            <div class="p-3 bg-white rounded-lg space-y-2 border border-gray-200">
              <div class="flex justify-between items-center mb-1">
                  <h4 class="font-bold text-gray-800">Neues Schiff erstellen</h4>
                  <button id="show-delete-ship-form-btn" class="text-xs text-blue-600 font-semibold hover:underline">Schiff verwalten...</button>
              </div>
              <div class="flex gap-2">
                <input type="text" id="checklist-settings-new-ship-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neues Schiff...">
                <button id="checklist-settings-create-ship-btn" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Erstellen</button>
              </div>
            </div>

            <div id="delete-ship-section" class="hidden p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
              <h4 class="font-bold text-blue-800">Schiff verwalten</h4>
              <select id="delete-ship-selector" class="w-full p-2 border rounded-lg bg-white border-blue-300">
                  <option value="">Schiff auswählen...</option>
                  ${Object.values(CHECKLIST_SHIPS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
              </select>
              <input type="text" id="manage-ship-name" class="w-full p-2 border rounded-lg" placeholder="Schiffsname bearbeiten...">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button id="rename-ship-btn" class="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Ausgewähltes Schiff umbenennen</button>
                <button id="delete-ship-btn" class="w-full py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700">Ausgewähltes Schiff löschen</button>
              </div>
            </div>

            <div class="p-3 bg-white rounded-lg space-y-2 border border-gray-200">
              <h4 class="font-bold text-gray-800">Neuen Container erstellen</h4>
              <input type="text" id="checklist-settings-new-container-name" class="w-full p-2 border rounded-lg" placeholder="Name für neuen Container...">
              <select id="checklist-settings-new-ship-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Schiff zuweisen...</option></select>
              <button id="checklist-settings-create-container-btn" class="w-full py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Container erstellen</button>
            </div>
          </div>
        </div>

        <div class="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          <button id="toggle-content-maintenance-btn" type="button" class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition">
            <span class="font-bold text-gray-800">Inhaltswartung</span>
            <span class="maintenance-panel-chevron text-xl leading-none text-gray-400">+</span>
          </button>
          <div id="content-maintenance-section" class="hidden p-3 bg-gray-50 space-y-3 border-t border-gray-100">
            <div>
              <h4 class="font-bold text-gray-800 mb-2">Bestehende Container verwalten</h4>
              <div id="container-list-editor" class="space-y-2"></div>
            </div>

            <div id="template-item-editor" class="hidden p-3 bg-indigo-50 border-t-4 border-indigo-300 rounded-lg space-y-3">
              <h4 id="template-editor-title" class="font-bold text-gray-800">Einträge für Container...</h4>
              <div id="template-items-list" class="space-y-2 max-h-48 overflow-y-auto"></div>
              <h5 class="font-semibold text-sm pt-2 border-t">Neuen Eintrag hinzufügen</h5>
              <input type="text" id="new-template-item-text" class="w-full p-2 border rounded-lg" placeholder="Text für Eintrag...">
              <div class="grid grid-cols-2 gap-2">
                <select id="new-template-item-assignee" class="p-2 border rounded-lg bg-white"><option value="">Zuweisen...</option></select>
                <select id="new-template-item-category" class="p-2 border rounded-lg bg-white"><option value="">Kategorie...</option></select>
              </div>
              <div class="flex items-center">
                <input type="checkbox" id="new-template-item-important" class="h-4 w-4 rounded">
                <label for="new-template-item-important" class="ml-2 text-sm text-gray-700">Als wichtig markieren</label>
              </div>
              <button id="add-template-item-btn" class="w-full py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">Eintrag zum Container hinzufügen</button>
              <button id="delete-template-btn" class="w-full py-1 text-red-600 text-sm font-semibold hover:underline">Diesen Container löschen</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="card-list-item-editor" class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-green-500 mt-6">
      <div class="flex gap-2 items-center mb-3">
        <select id="checklist-settings-editor-switcher" class="flex-grow p-2 border rounded-lg bg-white"></select>
        <button id="show-template-modal-btn" class="p-2 bg-teal-100 text-teal-800 text-sm font-bold rounded-lg hover:bg-teal-200 transition">+C</button>
        <button id="checklist-archive-list-btn" class="p-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition">📦</button>
      </div>
      <div class="mb-4 p-2 bg-gray-100 rounded-lg">
        <div id="group-display-container" class="flex justify-between items-center">
          <p class="text-sm">Aktuelle Gruppe: <span id="current-group-name" class="font-bold">—</span></p>
          <button id="edit-group-assignment-btn" class="text-sm font-semibold text-blue-600 hover:underline">ändern</button>
        </div>
        <div id="group-edit-container" class="hidden flex gap-2 items-center mt-2">
          <select id="checklist-group-assign-switcher" class="flex-grow p-2 border rounded-lg bg-white text-sm"></select>
          <button id="checklist-save-group-assignment" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition text-sm">Speichern</button>
        </div>
      </div>
      <div class="p-3 bg-gray-50 rounded-lg space-y-3 mb-4 border-t pt-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="relative sm:col-span-2">
            <input type="text" id="checklist-settings-add-text" class="w-full p-2 border rounded-lg" placeholder="Neuer Eintrag..." autocomplete="off">
          </div>
          <select id="checklist-settings-add-assignee" class="p-2 border rounded-lg bg-white w-full">
             <option value="">Zuweisen an... (Optional)</option>
             ${Object.values(USERS || {}).map(u => `<option value="${u.id}">${escapeHtml(u.name||u.displayName||'')}</option>`).join('')}
          </select>
          <select id="checklist-settings-add-category" class="p-2 border rounded-lg bg-white w-full"><option value="">Keine Kategorie</option></select>
        </div>
        <div class="flex items-center">
          <input type="checkbox" id="checklist-settings-add-important" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
          <label for="checklist-settings-add-important" class="ml-2 text-sm text-gray-700">Als wichtig markieren</label>
        </div>
        <button id="checklist-settings-add-item-btn" class="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">Eintrag hinzufügen</button>
      </div>
      <div id="checklist-items-editor-container" class="space-y-2 mb-4"></div>
    </div>
  `;

  // --- HELPER FUNKTIONEN FÜR DROPDOWNS ---

  function buildEditorSwitcherOptions() {
    const groups = Object.values(CHECKLIST_GROUPS || {});
    let html = '';
    
    groups.forEach(g => {
        const lists = Object.values(CHECKLISTS || {}).filter(l => l.groupId === g.id);
        if (lists.length > 0) {
            html += `<option disabled class="font-bold text-gray-900 bg-gray-100">━━ ${escapeHtml(g.name)} ━━</option>`;
            lists.forEach(l => {
                const selected = l.id === listToEditId ? 'selected' : '';
                html += `<option value="${l.id}" ${selected}>&nbsp;&nbsp;${escapeHtml(l.name)}</option>`;
            });
        }
    });
    
    const editorSwitcher = view.querySelector('#checklist-settings-editor-switcher');
    if (editorSwitcher) {
      editorSwitcher.innerHTML = (html || `<option value="">Keine Listen vorhanden</option>`);
      if (listToEditId) editorSwitcher.value = listToEditId;
    }
  }

  function rebuildCategorySelectForAddForm() {
    const catSelect = view.querySelector('#checklist-settings-add-category');
    if (!catSelect) return;
    
    const groups = Object.values(CHECKLIST_GROUPS || {});
    let html = `<option value="">Keine Kategorie</option>`;
    
    groups.forEach(g => {
        const cats = CHECKLIST_CATEGORIES[g.id] || [];
        if (cats.length > 0) {
            html += `<option disabled class="font-bold text-gray-900 bg-gray-100">━━ ${escapeHtml(g.name)} ━━</option>`;
            cats.forEach(c => {
                html += `<option value="${c.id}">&nbsp;&nbsp;${escapeHtml(c.name)}</option>`;
            });
        }
    });
    catSelect.innerHTML = html;
  }

  function rebuildGroupAssignSwitcher() {
    const sel = view.querySelector('#checklist-group-assign-switcher');
    if (!sel) return;
    const html = Object.values(CHECKLIST_GROUPS || {}).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    const prev = sel.value;
    sel.innerHTML = html;
    if (prev) sel.value = prev;
  }

  function populateDropdownsWithSeparators(selectorId, useGroups = false) {
      const select = view.querySelector(selectorId);
      if (!select) return;
      
      const groups = Object.values(CHECKLIST_GROUPS || {});
      let html = `<option value="">Bitte wählen...</option>`;
      
      if(useGroups) {
          html = `<option value="">Gruppe wählen...</option>` + groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
      } else {
          html = `<option value="">Gruppe zuweisen...</option>` + groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
      }
      select.innerHTML = html;
  }

  // Initialisierung
  buildEditorSwitcherOptions();
  rebuildCategorySelectForAddForm();
  rebuildGroupAssignSwitcher();
  populateDropdownsWithSeparators('#manage-groups-dropdown', true);
  populateDropdownsWithSeparators('#checklist-settings-new-group-selector');
  populateDropdownsWithSeparators('#category-group-selector', true);
  populateDropdownsWithSeparators('#default-group-selector', true);

  const shipSelector = view.querySelector('#checklist-settings-new-ship-selector');
  if (shipSelector) {
      const shipOpts = Object.values(CHECKLIST_SHIPS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      shipSelector.innerHTML = `<option value="">Schiff wählen...</option>` + shipOpts;
  }
  const deleteShipSelector = view.querySelector('#delete-ship-selector');
  if (deleteShipSelector) {
        const shipOpts = Object.values(CHECKLIST_SHIPS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        deleteShipSelector.innerHTML = `<option value="">Schiff auswählen...</option>` + shipOpts;
  }
  const manageShipNameInput = view.querySelector('#manage-ship-name');
  if (manageShipNameInput) {
      manageShipNameInput.value = deleteShipSelector?.value ? (CHECKLIST_SHIPS[deleteShipSelector.value]?.name || '') : '';
  }

  const templateAssignee = view.querySelector('#new-template-item-assignee');
  if (templateAssignee) {
      templateAssignee.innerHTML = `<option value="">Zuweisen...</option>` + Object.values(USERS || {}).map(u => `<option value="${u.id}">${escapeHtml(u.name||u.displayName||'')}</option>`).join('');
      templateAssignee.value = lastTemplateItemFormSelection.assignedTo || '';
  }
  updateCategoryDropdowns();
  const templateCategory = view.querySelector('#new-template-item-category');
  if (templateCategory) {
      templateCategory.value = lastTemplateItemFormSelection.categoryId || '';
  }

  // --- Helper für Gruppen-Anzeige im Editor ---
  function updateCurrentGroupDisplay(listId) {
    const span = view.querySelector('#current-group-name');
    const list = listId ? CHECKLISTS[listId] : null;
    span && (span.textContent = list ? (list.groupName || (CHECKLIST_GROUPS[list.groupId] && CHECKLIST_GROUPS[list.groupId].name) || '—') : '—');
  }
  updateCurrentGroupDisplay(listToEditId);

  // --- EVENT LISTENERS (Jetzt direkt hier initiiert) ---

  // 1. Editor Switcher Change
  const editorSwitcher = view.querySelector('#checklist-settings-editor-switcher');
  if (editorSwitcher) {
    editorSwitcher.addEventListener('change', (e) => {
      const val = e.target.value;
      view.dataset.editingListId = val || '';
      updateCurrentGroupDisplay(val);
      renderChecklistSettingsItems(val);
    });
  }

  // 2. Default List Group/List Logic
  const defaultGroupSelector = view.querySelector('#default-group-selector');
  const defaultListSelector = view.querySelector('#default-list-selector');

  if (defaultGroupSelector && defaultListSelector) {
      defaultGroupSelector.addEventListener('change', () => {
          const selectedGroupId = defaultGroupSelector.value;
          if (selectedGroupId) {
              const listsInGroup = Object.values(CHECKLISTS || {}).filter(l => l.groupId === selectedGroupId);
              if (listsInGroup.length > 0) {
                  const listOpts = listsInGroup.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
                  defaultListSelector.innerHTML = listOpts;
                  defaultListSelector.disabled = false;
              } else {
                  defaultListSelector.innerHTML = `<option value="">Keine Listen in Gruppe</option>`;
                  defaultListSelector.disabled = true;
              }
          } else {
              defaultListSelector.innerHTML = `<option value="">Zuerst Gruppe wählen</option>`;
              defaultListSelector.disabled = true;
          }
      });

      // Initiale Werte setzen
      const savedListId = window.adminSettings.defaultChecklistId;
      if (savedListId && CHECKLISTS[savedListId]) {
          const savedGroupId = CHECKLISTS[savedListId].groupId;
          if (savedGroupId) {
              defaultGroupSelector.value = savedGroupId;
              defaultGroupSelector.dispatchEvent(new Event('change'));
              if (!defaultListSelector.disabled) {
                 defaultListSelector.value = savedListId;
              }
          }
      }
  }

  // 3. Speichern Standard
  const saveDefaultBtn = view.querySelector('#save-default-checklist-btn');
  if (saveDefaultBtn) {
      saveDefaultBtn.addEventListener('click', async () => {
          const newDefaultId = view.querySelector('#default-list-selector')?.value || null;
          try {
              if (!settingsDocRef) throw new Error("settingsDocRef fehlt");
              await updateDoc(settingsDocRef, { defaultChecklistId: newDefaultId });
              window.adminSettings.defaultChecklistId = newDefaultId;
              if (newDefaultId) alertUser('Standard-Checkliste gespeichert.', 'success');
              else alertUser('Standard-Auswahl entfernt.', 'success');
          } catch (err) {
              console.error(err);
              alertUser('Fehler beim Speichern.', 'error');
          }
      });
  }

  const catGroupSelector = view.querySelector('#category-group-selector');
  if (catGroupSelector) {
      const initialCategoryGroupId = view.dataset.selectedCategoryIdForRender || catGroupSelector.value || '';
      if (initialCategoryGroupId) {
          catGroupSelector.value = initialCategoryGroupId;
      }
      renderCategoryEditor(catGroupSelector.value || '');
  }

  // 5. Tabs Logik
  const tabButtons = view.querySelectorAll('.settings-tab-btn');
  const greenBox = view.querySelector('#card-list-item-editor');

  tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
          const targetCardId = btn.dataset.targetCard;
          const isActive = btn.classList.contains('bg-white');
          
          view.querySelectorAll('.settings-card').forEach(card => card.classList.add('hidden'));
          tabButtons.forEach(b => {
              b.classList.remove('bg-white', 'text-indigo-600', 'shadow-sm');
              b.classList.add('text-gray-600');
          });

          if (isActive) {
              view.dataset.activeSettingsTab = '';
              greenBox?.classList.remove('hidden');
          } else {
              const targetCard = view.querySelector(`#${targetCardId}`);
              if (targetCard) targetCard.classList.remove('hidden');
              btn.classList.add('bg-white', 'text-indigo-600', 'shadow-sm');
              btn.classList.remove('text-gray-600');
              view.dataset.activeSettingsTab = targetCardId;
              greenBox?.classList.add('hidden');
          }
      });
  });
  
  const lastTab = view.dataset.activeSettingsTab;
  if (lastTab) {
      const tabToClick = view.querySelector(`.settings-tab-btn[data-target-card="${lastTab}"]`);
      if (tabToClick) tabToClick.click();
  } else {
     greenBox?.classList.remove('hidden');
  }

  // --- HIER WAREN DIE FEHLENDEN LISTENERS ---

  // 8. Gruppe ändern Button (Der Fix)
  const editGroupBtn = view.querySelector('#edit-group-assignment-btn');
  if (editGroupBtn) {
      editGroupBtn.addEventListener('click', () => {
          view.querySelector('#group-display-container')?.classList.add('hidden');
          view.querySelector('#group-edit-container')?.classList.remove('hidden');
          
          const currentListId = view.dataset.editingListId || listToEditId;
          const currentList = (currentListId && CHECKLISTS) ? CHECKLISTS[currentListId] : null;
          if (currentList && currentList.groupId) {
              const assignSwitcher = view.querySelector('#checklist-group-assign-switcher');
              if (assignSwitcher) assignSwitcher.value = currentList.groupId;
          }
      });
  }

  // 9. Gruppe Speichern Button
  const saveGroupBtn = view.querySelector('#checklist-save-group-assignment');
  if (saveGroupBtn) {
      saveGroupBtn.addEventListener('click', async () => {
          const assignSwitcher = view.querySelector('#checklist-group-assign-switcher');
          const newGroupId = assignSwitcher ? assignSwitcher.value : null;
          const currentListId = view.dataset.editingListId || listToEditId;
          
          if (!currentListId || !newGroupId) return alertUser('Fehler: Liste oder Gruppe nicht gefunden.', 'error');
          
          const newGroupName = (newGroupId && CHECKLIST_GROUPS && CHECKLIST_GROUPS[newGroupId]) ? CHECKLIST_GROUPS[newGroupId].name : null;
          
          try {
              if (typeof updateDoc === 'function' && typeof doc === 'function' && typeof checklistsCollectionRef !== 'undefined') {
                  await updateDoc(doc(checklistsCollectionRef, currentListId), { groupId: newGroupId, groupName: newGroupName });
              }
              if (CHECKLISTS?.[currentListId]) {
                  CHECKLISTS[currentListId].groupId = newGroupId;
                  CHECKLISTS[currentListId].groupName = newGroupName;
              }
              updateCurrentGroupDisplay(currentListId);
              buildEditorSwitcherOptions();
              
              alertUser('Gruppenzuweisung gespeichert.', 'success');
              view.querySelector('#group-display-container')?.classList.remove('hidden');
              view.querySelector('#group-edit-container')?.classList.add('hidden');
              
          } catch (err) {
              console.error('Fehler beim Speichern der Gruppe:', err);
              alertUser('Fehler beim Speichern.', 'error');
          }
      });
  }

  // 6. Sub-Setup Funktionen aufrufen
  if (typeof setupListAndItemManagementListeners === 'function') setupListAndItemManagementListeners(view);
  if (typeof setupGroupManagementListeners === 'function') setupGroupManagementListeners(view, window.currentUser);
  if (typeof setupCategoryManagementListeners === 'function') setupCategoryManagementListeners(view);
  if (typeof setupSchiffAndContainerManagementListeners === 'function') setupSchiffAndContainerManagementListeners(view);
  if (typeof setupTemplateEditorListeners === 'function') setupTemplateEditorListeners();

  // 7. Initial List Render
  if (typeof renderContainerList === 'function') renderContainerList();
  
  if (listToEditId) {
    renderChecklistSettingsItems(listToEditId);
  } else {
    const container = view.querySelector('#checklist-items-editor-container');
    if (container) container.innerHTML = '<p class="text-sm text-center text-gray-500">Keine Listen vorhanden. Bitte erstellen Sie zuerst eine Liste.</p>';
  }
}




function setupCategoryManagementListeners(view) {
    if (!view) return;
    // Idempotent: Verhindert doppelte Listener
    // if (view.dataset.categoryListenersAttached === 'true') return; // Temporär entfernt für Test, ob Listener neu gesetzt werden muss
    view.dataset.categoryListenersAttached = 'true'; // Setzen wir es trotzdem

    const groupSelector = view.querySelector('#category-group-selector');
    const categoryContent = view.querySelector('#category-content');

    // Wenn Gruppe wechselt, rendere Editor neu (Listener nur einmal hinzufügen)
    if (groupSelector && !groupSelector.dataset.changeListenerAttached) {
        groupSelector.addEventListener('change', () => {
             // Merken, welche Gruppe ausgewählt wurde, für den Fall, dass wir neu rendern
             view.dataset.selectedCategoryIdForRender = groupSelector.value;
            renderCategoryEditor(groupSelector.value);
        });
        groupSelector.dataset.changeListenerAttached = 'true';
    }


    // Delegierter Click-Handler für Aktionen im categoryContent (Nur einmal hinzufügen)
    if (categoryContent && !categoryContent.dataset.clickListenerAttached) {
        categoryContent.addEventListener('click', async (e) => {
            const createBtn = e.target.closest('#create-category-btn');
            const editBtn = e.target.closest('.edit-category-btn');
            const saveBtn = e.target.closest('.save-category-btn');
            const deleteBtn = e.target.closest('.delete-category-btn');
            const colorDot = e.target.closest('.category-color-dot');
            const existingColorDot = e.target.closest('.color-dot'); // Falls woanders benutzt

            // Lese die aktuell ausgewählte Gruppe direkt aus dem Dropdown im Moment des Klicks
            const currentGroupId = view.querySelector('#category-group-selector')?.value;

            if (!currentGroupId && createBtn) { // Nur bei "Erstellen" prüfen
                 return alertUser && alertUser('Bitte zuerst eine Gruppe wählen.', 'error');
            }

            if (createBtn) {
                const nameInput = document.getElementById('new-category-name');
                const colorInput = document.getElementById('new-category-selected-color');
                const newName = nameInput?.value.trim();
                const color = colorInput?.value || 'gray';
                if (!newName) return alertUser && alertUser('Bitte einen Kategorienamen eingeben.', 'error');
                try {
                    if (typeof addDoc === 'function') {
                        await addDoc(checklistCategoriesCollectionRef, { name: newName, groupId: currentGroupId, color });
                    } else { /* lokales Fallback */ }
                    nameInput.value = '';
                    updateCategoryDropdowns();
                    if (typeof alertUser === 'function') alertUser('Kategorie gespeichert.', 'success');
                    
                    // Wichtig: Editor neu rendern, um die neue Kategorie anzuzeigen
                    renderCategoryEditor(currentGroupId);
                    
                    // --- FIX HIER: Gruppe im Dropdown wieder auswählen ---
                    const selector = view.querySelector('#category-group-selector');
                    if(selector) selector.value = currentGroupId;
                    // --- ENDE FIX ---

                } catch (err) {
                    console.error('Fehler beim Erstellen der Kategorie:', err);
                    if (typeof alertUser === 'function') alertUser('Fehler beim Speichern.', 'error');
                }
                return;
            }

            // Restliche Logik (Edit, Save, Delete, Color) bleibt gleich...
            if (editBtn) {
                const container = editBtn.closest('[data-category-id]');
                container?.querySelector('.cat-display-content')?.classList.add('hidden');
                container?.querySelector('.cat-edit-content')?.classList.remove('hidden');
                editBtn.classList.add('hidden');
                container?.querySelector('.save-category-btn')?.classList.remove('hidden');
                return;
            }

            if (saveBtn) {
                const container = saveBtn.closest('[data-category-id]');
                const catId = container?.dataset.categoryId;
                const input = container?.querySelector('.edit-category-name-input');
                const newName = input?.value.trim();
                if (!newName) return alertUser && alertUser('Name darf nicht leer sein.', 'error');
                const groupIdForRender = view.querySelector('#category-group-selector')?.value; // Gruppe merken
                try {
                    if (typeof updateDoc === 'function') {
                        await updateDoc(doc(checklistCategoriesCollectionRef, catId), { name: newName });
                    }
                    updateCategoryDropdowns();
                    if (typeof alertUser === 'function') alertUser('Kategorie umbenannt.', 'success');
                    renderCategoryEditor(groupIdForRender); // Editor für die gemerkte Gruppe neu rendern
                    // Gruppe wieder auswählen nach dem Rendern
                    const selector = view.querySelector('#category-group-selector');
                    if(selector) selector.value = groupIdForRender;

                } catch (err) {
                    console.error('Fehler beim Umbennen der Kategorie:', err);
                    if (typeof alertUser === 'function') alertUser('Fehler beim Umbennen.', 'error');
                }
                return;
            }

            if (deleteBtn) {
                const container = deleteBtn.closest('[data-category-id]');
                const catId = container?.dataset.categoryId;
                const groupIdForRender = view.querySelector('#category-group-selector')?.value; // Gruppe merken
                if (!confirm('Kategorie wirklich löschen?')) return;
                try {
                    if (typeof deleteDoc === 'function') {
                        await deleteDoc(doc(checklistCategoriesCollectionRef, catId));
                    } else { /* lokales Fallback */ }
                    updateCategoryDropdowns();
                    if (typeof alertUser === 'function') alertUser('Kategorie gelöscht.', 'success');
                    renderCategoryEditor(groupIdForRender); // Editor für die gemerkte Gruppe neu rendern
                    // Gruppe wieder auswählen nach dem Rendern
                    const selector = view.querySelector('#category-group-selector');
                    if(selector) selector.value = groupIdForRender;
                } catch (err) {
                    console.error('Fehler beim Löschen der Kategorie:', err);
                    if (typeof alertUser === 'function') alertUser('Fehler beim Löschen.', 'error');
                }
                return;
            }
             // Farbwahl Logik... (bleibt gleich)
            if (colorDot) {
                const selected = colorDot.dataset.color;
                const colorInput = document.getElementById('new-category-selected-color');
                if (colorInput) colorInput.value = selected;
                const palette = document.getElementById('new-category-color-palette');
                palette && palette.querySelectorAll('.category-color-dot').forEach(d => d.classList.remove('ring-2', 'ring-blue-500'));
                colorDot.classList.add('ring-2', 'ring-blue-500');
                return;
            }

            if (existingColorDot) {
                const catId = existingColorDot.dataset.categoryId;
                const newColor = existingColorDot.dataset.color;
                const groupIdForRender = view.querySelector('#category-group-selector')?.value; // Gruppe merken
                try {
                    if (typeof updateDoc === 'function') {
                        await updateDoc(doc(checklistCategoriesCollectionRef, catId), { color: newColor });
                    }
                    if (typeof alertUser === 'function') alertUser('Farbe gespeichert.', 'success');
                    renderCategoryEditor(groupIdForRender); // Editor für die gemerkte Gruppe neu rendern
                     // Gruppe wieder auswählen nach dem Rendern
                     const selector = view.querySelector('#category-group-selector');
                     if(selector) selector.value = groupIdForRender;
                } catch (err) {
                    console.error('Fehler beim Speichern der Farbe:', err);
                    if (typeof alertUser === 'function') alertUser('Fehler beim Speichern der Farbe.', 'error');
                }
                return;
            }
        });
        categoryContent.dataset.clickListenerAttached = 'true';
    }
}

export function renderPermanentDeleteModal() {
    // 1. Zuerst sicherstellen, dass die Knöpfe (Abbrechen, Löschen, Alle wählen) funktionieren
    setupPermanentDeleteModalListeners();

    const container = document.getElementById('permanentDeleteListsContainer');
    container.innerHTML = ''; // Vorherigen Inhalt leeren

    // Zugriff auf die globale Variable DELETED_CHECKLISTS
    const deletedLists = Object.values(DELETED_CHECKLISTS).sort((a, b) => {
        // Sortieren: Neueste zuerst (falls deletedAt vorhanden)
        const timeA = a.deletedAt?.seconds || 0;
        const timeB = b.deletedAt?.seconds || 0;
        return timeB - timeA;
    });

    if (deletedLists.length === 0) {
        container.innerHTML = '<p class="text-sm text-center text-gray-500">Keine Listen im Papierkorb.</p>';
        return;
    }

    deletedLists.forEach(list => {
        const date = list.deletedAt?.toDate ? list.deletedAt.toDate().toLocaleString('de-DE') : 'Unbekannt';
        
        // HTML für jedes Listen-Item im Papierkorb
        container.innerHTML += `
                <label class="flex items-start gap-3 p-2 cursor-pointer hover:bg-gray-100 rounded-md border-b border-gray-50 last:border-0">
                    <input type="checkbox" data-list-id="${list.id}" class="h-5 w-5 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500 mt-1 permanent-delete-cb">
                    <div>
                        <span class="font-semibold text-gray-800">${list.name}</span>
                        <p class="text-xs text-gray-500">Gelöscht von ${list.deletedBy || 'Unbekannt'} am ${date}</p>
                    </div>
                </label>
            `;
    });
}


function setupPermanentDeleteModalListeners() {
    const modal = document.getElementById('permanentDeleteModal');
    if (!modal || modal.dataset.listenerAttached === 'true') return;

    modal.addEventListener('click', async (e) => {
        const selectAllCheckbox = document.getElementById('permanent-delete-select-all');

        // Logik für "Alle auswählen"
        if (e.target.id === 'permanent-delete-select-all') {
            const isChecked = e.target.checked;
            modal.querySelectorAll('.permanent-delete-cb').forEach(cb => cb.checked = isChecked);
            return;
        }

        // Logik für "Abbrechen"-Button
        if (e.target.id === 'cancelPermanentDeleteBtn') {
            modal.style.display = 'none';
            return;
        }

        // Logik für "Auswahl endgültig löschen"-Button
        if (e.target.id === 'confirmPermanentDeleteBtn') {
            const selectedCheckboxes = modal.querySelectorAll('.permanent-delete-cb:checked');
            if (selectedCheckboxes.length === 0) {
                alertUser("Bitte wählen Sie mindestens eine Liste zum Löschen aus.", "error");
                return;
            }

            if (!confirm(`Möchten Sie die ausgewählten ${selectedCheckboxes.length} Liste(n) wirklich unwiderruflich löschen?`)) {
                return;
            }

            try {
                const batch = writeBatch(db);
                selectedCheckboxes.forEach(cb => {
                    const listId = cb.dataset.listId;
                    batch.delete(doc(checklistsCollectionRef, listId));
                });

                await batch.commit();
                await logAdminAction('cleared_trash_selection', `${selectedCheckboxes.length} Checklisten endgültig gelöscht.`);
                alertUser(`${selectedCheckboxes.length} Liste(n) wurden endgültig gelöscht.`, "success");
                modal.style.display = 'none';

            } catch (error) {
                console.error("Fehler beim Löschen der Auswahl:", error);
                alertUser("Ein Fehler ist aufgetreten.", "error");
            }
        }
    });
    modal.dataset.listenerAttached = 'true';
}

function getItemBadges(item) {
    let badgesHTML = '';
    // Die Kategorie wird jetzt als Überschrift angezeigt, daher hier entfernt.
    if (item.assignedToName) {
        badgesHTML += `<span class="text-xs font-semibold py-0.5 px-2 rounded-full whitespace-nowrap border ${getPersonBadgeClass(item.assignedTo || item.assignedToName)}">${escapeHtml(item.assignedToName)}</span>`;
    }
    // Reduziertes Margin für ein kompakteres Layout
    return `<div class="flex items-center gap-2 flex-wrap mt-1">${badgesHTML}</div>`;
};

export function populatePersonDropdown() {
    const userOptions = Object.values(USERS)
        .filter(u => u.name && u.isActive)
        .map(user => `<option value="${user.id}">${user.name}</option>`)
        .join('');
    document.getElementById('person-select').innerHTML = `<option value="">Benutzer auswählen...</option>${userOptions}`;
}

// Ersetze DIESE Funktion komplett
// ERSETZE die Funktion "setupTemplateEditorListeners" in checklist.js:

function setupTemplateEditorListeners() {
    ensureChecklistItemEditModal();
    // 1. Modal Listener (Einmalig)
    const modal = document.getElementById('templateApplyModal');
    if (modal && !modal.dataset.modalListenersAttached) {
        document.getElementById('closeTemplateModalBtn')?.addEventListener('click', closeTemplateModal);
        document.getElementById('cancel-template-modal-btn')?.addEventListener('click', closeTemplateModal);
        document.getElementById('apply-template-btn')?.addEventListener('click', applyTemplateLogic);
        modal.dataset.modalListenersAttached = 'true';
    }

    // 2. Container Editor Listener (Delegation für Edit/Delete im Container)
    const editorList = document.getElementById('template-items-list');
    if (editorList && !editorList.dataset.actionsListenerAttached) {
        editorList.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-template-item-btn');
            if (editBtn) {
                const row = editBtn.closest('[data-item-id]');
                if (!row) return;
                openChecklistItemEditModal({ mode: 'template', itemId: row.dataset.itemId, templateId: row.dataset.templateId || selectedTemplateId || null });
                return;
            }
        });
        editorList.dataset.actionsListenerAttached = 'true';
    }
}


// ERSETZE die Funktion "renderTemplateItemsEditor" in checklist.js:

function renderTemplateItemsEditor() {
    const itemsListContainer = document.getElementById('template-items-list');
    // Globale Variable TEMPLATE_ITEMS nutzen
    const items = TEMPLATE_ITEMS[selectedTemplateId] || [];

    itemsListContainer.innerHTML = '';

    if (items.length === 0) {
        itemsListContainer.innerHTML = '<p class="text-xs text-center text-gray-400 py-4">Dieser Container hat noch keine Einträge.</p>';
        return;
    }

    items.forEach(item => {
        const isImportantClass = item.important ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-white';
        let detailsHTML = '';
        
        if (item.categoryName) {
            detailsHTML += `<span class="ml-2 text-[10px] bg-blue-50 text-blue-600 border border-blue-100 py-0.5 px-2 rounded-full whitespace-nowrap">${escapeHtml(item.categoryName)}</span>`;
        }
        if (item.assignedToName) {
            detailsHTML += `<span class="ml-2 text-[10px] bg-gray-200 text-gray-700 py-0.5 px-2 rounded-full whitespace-nowrap">${escapeHtml(item.assignedToName)}</span>`;
        }

        itemsListContainer.innerHTML += `
            <div class="p-2 border rounded-md flex justify-between items-center ${isImportantClass} mb-1 shadow-sm" data-item-id="${item.id}" data-template-id="${selectedTemplateId || ''}">
                <div class="flex-grow min-w-0 pr-2">
                    <p class="text-sm font-medium text-gray-800 item-text truncate">${escapeHtml(item.text)}</p>
                    <div class="flex items-center mt-1 flex-wrap">
                        ${detailsHTML}
                    </div>
                </div>
                <div class="flex gap-1 flex-shrink-0">
                    <button class="edit-template-item-btn p-1.5 text-blue-500 hover:bg-blue-100 rounded transition" title="Bearbeiten">✎</button>
                </div>
            </div>
        `;
    });
}


// ERSETZE die Funktion "openTemplateModal" in checklist.js:

function openTemplateModal(targetListId) {
  const modal = document.getElementById('templateApplyModal');
  if (!modal) return;
  
  modal.dataset.targetListId = targetListId || '';
  const templateSelect = document.getElementById('template-select');
  const itemsContainer = document.getElementById('template-items-container');
  const modeSection = document.getElementById('template-mode-section');
  const resetSelectAllButton = () => {
    const button = document.getElementById('template-select-all-btn');
    if (button) button.textContent = 'Alle auswählen';
  };

  if (!document.getElementById('template-select-all-btn') && itemsContainer) {
      const btnDiv = document.createElement('div');
      btnDiv.className = "flex justify-end mb-2";
      btnDiv.innerHTML = `<button id="template-select-all-btn" class="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition">Alle auswählen</button>`;
      itemsContainer.parentNode.insertBefore(btnDiv, itemsContainer);
  }

  const renderSelectableItems = (items) => {
    itemsContainer.innerHTML = '';
    resetSelectAllButton();
    if (!items.length) {
      itemsContainer.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Keine Einträge gefunden.</p>';
      return;
    }
    items.forEach(it => {
      itemsContainer.innerHTML += `
              <label class="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-100 rounded border-b border-gray-50 last:border-0">
                <input type="checkbox" class="h-5 w-5 template-item-cb text-indigo-600 rounded" value="${it.id}"
                  data-text="${(it.text||'').replace(/"/g,'&quot;')}"
                  data-important="${!!it.important}"
                  data-assigned-to="${it.assignedTo || ''}"
                  data-assigned-to-name="${it.assignedToName || ''}"
                  data-category-id="${it.categoryId || ''}"
                  data-category-name="${it.categoryName || ''}"
                  data-category-color="${it.categoryColor || ''}">
                <span class="text-sm text-gray-700">${escapeHtml(it.text)}</span>
              </label>`;
    });
  };

  const renderSelectableContainers = (containers) => {
    itemsContainer.innerHTML = '';
    resetSelectAllButton();
    if (!containers.length) {
      itemsContainer.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Keine Container für dieses Schiff gefunden.</p>';
      return;
    }
    containers.forEach(container => {
      itemsContainer.innerHTML += `
              <label class="flex items-center gap-2 p-2 cursor-pointer hover:bg-gray-100 rounded border-b border-gray-50 last:border-0">
                <input type="checkbox" class="h-5 w-5 template-item-cb text-indigo-600 rounded" value="${container.id}" data-template-id="${container.id}">
                <span class="text-sm text-gray-700">${escapeHtml(container.name || 'Unbenannter Container')}</span>
              </label>`;
    });
  };

  const updateTemplateDropdown = () => {
    const type = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
    if (!templateSelect) return;
    
    templateSelect.innerHTML = '<option value="">Bitte Quelle wählen...</option>';
    resetSelectAllButton();
    
    if (type === 'Container') {
      const ships = Object.values(CHECKLIST_SHIPS || {});
      ships.forEach(ship => {
          const containers = Object.values(TEMPLATES || {}).filter(t => getTemplateShipId(t) === ship.id);
          if (containers.length > 0) {
              templateSelect.innerHTML += `<option disabled class="bg-gray-100 font-bold text-gray-900">━━ ${escapeHtml(ship.name)} ━━</option>`;
              containers.forEach(c => {
                  templateSelect.innerHTML += `<option value="${c.id}">&nbsp;&nbsp;${escapeHtml(c.name)}</option>`;
              });
          }
      });
      // Ohne Schiff
      const without = Object.values(TEMPLATES || {}).filter(t => !getTemplateShipId(t));
      if (without.length > 0) {
          templateSelect.innerHTML += `<option disabled class="bg-gray-100 font-bold text-gray-900">━━ Ohne Schiff ━━</option>`;
          without.forEach(t => {
              templateSelect.innerHTML += `<option value="${t.id}">&nbsp;&nbsp;${escapeHtml(t.name)}</option>`;
          });
      }
    } else {
      const ships = Object.values(CHECKLIST_SHIPS || {});
      if (ships.length > 0) {
          templateSelect.innerHTML += `<option disabled class="bg-gray-100 font-bold text-gray-900">━━ Schiffe ━━</option>`;
          ships.forEach(ship => {
              templateSelect.innerHTML += `<option value="${ship.id}">&nbsp;&nbsp;${escapeHtml(ship.name)}</option>`;
          });
      }
    }
    modeSection && modeSection.classList.toggle('hidden', type !== 'Schiff');
  };

  if (!modal.dataset.listenersAttached) {
    modal.querySelectorAll('input[name="template-type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            updateTemplateDropdown();
            itemsContainer.innerHTML = '';
        });
    });

    templateSelect?.addEventListener('change', async (e) => {
      const id = e.target.value;
      const type = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
      if (!itemsContainer) return;
      itemsContainer.innerHTML = '';
      resetSelectAllButton();
      if (!id) return;

      itemsContainer.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Lade Einträge...</p>';

      try {
          let items = [];
          
          if (type === 'Container') {
              if (typeof getDocs === 'function') {
                const itemsRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates', id, 'template-items');
                const snap = await getDocs(query(itemsRef, orderBy('text')));
                snap.forEach(s => items.push({ id: s.id, ...s.data() }));
              }
              renderSelectableItems(items);
          } else {
              const containers = Object.values(TEMPLATES || {})
                .filter(template => getTemplateShipId(template) === id)
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de', { sensitivity: 'base' }));
              renderSelectableContainers(containers);
          }

      } catch (err) {
          console.error('Fehler beim Laden:', err);
          itemsContainer.innerHTML = '<p class="text-xs text-red-500 text-center">Fehler beim Laden der Daten.</p>';
      }
    });

    document.addEventListener('click', (e) => {
        if (e.target.id === 'template-select-all-btn') {
            const checkboxes = itemsContainer.querySelectorAll('.template-item-cb');
            const allSelected = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => cb.checked = !allSelected);
            e.target.textContent = allSelected ? "Alle auswählen" : "Alle abwählen";
        }
    });

    modal.dataset.listenersAttached = 'true';
  }

  updateTemplateDropdown();
  modal.style.display = 'flex';
}


function renderTemplateItemsView(templateId, templateType) {
    const container = document.getElementById('template-items-container');
    container.innerHTML = '';
    let items = [];

    if (templateType === 'Container') {
        items = TEMPLATE_ITEMS[templateId] || [];
    } else if (templateType === 'Schiff') {
        items = CHECKLIST_ITEMS[templateId] || [];
    }

    if (items.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500">Diese Vorlage hat keine Einträge.</p>';
        return;
    }

    container.innerHTML += `
        <label class="flex items-center gap-2 p-2 border-b font-semibold cursor-pointer">
            <input type="checkbox" id="template-select-all" class="h-4 w-4">
            <span>Alle auswählen</span>
        </label>
    `;

    items.forEach(item => {
        container.innerHTML += `
            <label class="flex items-center gap-2 p-1 cursor-pointer hover:bg-gray-100 rounded">
                <input type="checkbox" value="${item.id}" class="h-4 w-4 template-item-cb" 
                    data-text="${item.text}" 
                    data-important="${item.important || false}"
                    data-assigned-to="${item.assignedTo || ''}"
                    data-assigned-to-name="${item.assignedToName || ''}"
                    data-category-id="${item.categoryId || ''}"
                    data-category-name="${item.categoryName || ''}"
                    data-category-color="${item.categoryColor || ''}"> 
                <span class="text-sm">${item.text}</span>
            </label>
        `;
    });

    document.getElementById('template-select-all').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        container.querySelectorAll('.template-item-cb').forEach(cb => cb.checked = isChecked);
    });
}

export function closeTemplateModal() {
  const modal = document.getElementById('templateApplyModal');
  if (!modal) return;
  modal.style.display = 'none';
  document.getElementById('template-items-container') && (document.getElementById('template-items-container').innerHTML = '');
  const sel = document.getElementById('template-select'); sel && (sel.innerHTML = '<option value="">Bitte zuerst Typ wählen...</option>');
  const modeSection = document.getElementById('template-mode-section'); modeSection && modeSection.classList.add('hidden');
  modal.dataset.targetListId = '';
}
