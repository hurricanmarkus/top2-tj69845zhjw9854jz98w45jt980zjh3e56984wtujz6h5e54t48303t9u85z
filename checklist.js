// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
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
    USERS
} from './haupteingang.js';

export {
  listenForTemplates,
  listenForChecklists,
  listenForChecklistGroups,
  listenForChecklistCategories,
  listenForChecklistItems,
  openTemplateModal,
  renderChecklistView,
  renderChecklistSettingsView
};

// ENDE-ZIKA //

const safeWindow = (name, fallback) => {
  if (typeof window[name] === 'undefined') window[name] = fallback;
  return window[name];
};

// Stelle sicher, dass erwartete globale Strukturen existieren
safeWindow('CHECKLISTS', {});
safeWindow('CHECKLIST_GROUPS', {});
safeWindow('CHECKLIST_CATEGORIES', {});
safeWindow('CHECKLIST_STACKS', {});
safeWindow('CHECKLIST_ITEMS', {});
safeWindow('TEMPLATES', {});
safeWindow('TEMPLATE_ITEMS', {});
safeWindow('USERS', {});
safeWindow('ARCHIVED_CHECKLISTS', {});
safeWindow('DELETED_CHECKLISTS', {});
safeWindow('adminSettings', {});
safeWindow('selectedTemplateId', null);
safeWindow('unsubscribeTemplateItems', null);

// Kurz-Helper: sicherer Zugriff auf Firestore-Funktionen (falls vorhanden)
const hasFirestore = typeof addDoc === 'function' && typeof updateDoc === 'function' && typeof deleteDoc === 'function';


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

function renderTemplateItemsEditor() {
    const itemsListContainer = document.getElementById('template-items-list');
    const items = TEMPLATE_ITEMS[selectedTemplateId] || [];

    itemsListContainer.innerHTML = '';

    if (items.length === 0) {
        itemsListContainer.innerHTML = '<p class="text-xs text-center text-gray-400">Dieser Container hat noch keine Einträge.</p>';
        return;
    }

    items.forEach(item => {
        const isImportantClass = item.important ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-white';
        let detailsHTML = '';
        if (item.categoryName) {
            const colorKey = item.categoryColor || 'gray';
            const color = COLOR_PALETTE[colorKey] || COLOR_PALETTE.gray;
            detailsHTML += `<span class="ml-2 text-xs font-semibold py-0.5 px-2 rounded-full whitespace-nowrap ${color.bg} ${color.text}">${item.categoryName}</span>`;
        }
        if (item.assignedToName) {
            detailsHTML += `<span class="ml-2 text-xs bg-gray-200 text-gray-700 font-semibold py-0.5 px-2 rounded-full whitespace-nowrap">${item.assignedToName}</span>`;
        }

        itemsListContainer.innerHTML += `
            <div class="p-2 border rounded-md flex justify-between items-center ${isImportantClass}">
                <div class="flex items-center flex-wrap">
                    <span>${item.text}</span>
                    <div class="flex items-center mt-1 sm:mt-0">
                        ${detailsHTML}
                    </div>
                </div>
                <button data-item-id="${item.id}" class="delete-template-item-btn p-1 text-red-400 hover:text-red-600 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1H2V3Zm2 2h8v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Z" /></svg>
                </button>
            </div>
        `;
    });
}

export function renderContainerList() {
  const editorDiv = document.getElementById('container-list-editor');
  if (!editorDiv) return;
  editorDiv.innerHTML = `<h3 class="font-bold text-gray-800 mb-2 mt-6">Bestehende Container verwalten</h3>`;

  const stacks = Object.values(CHECKLIST_STACKS || {});
  const containers = Object.values(TEMPLATES || {});
  const stackOptions = `<option value="">Keinen Stack zuweisen</option>` + stacks.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

  if (!containers.length) {
    editorDiv.innerHTML += `<p class="text-sm text-center text-gray-400">Keine Container gefunden.</p>`;
    return;
  }

  // group by stack
  const byStack = {};
  containers.forEach(c => {
    const sid = c.stackId || '__nostack';
    byStack[sid] = byStack[sid] || [];
    byStack[sid].push(c);
  });

  // render stacks first
  Object.keys(byStack).forEach(sid => {
    if (sid === '__nostack') return;
    const stack = CHECKLIST_STACKS[sid] || {};
    editorDiv.innerHTML += `<h4 class="font-semibold text-sm text-gray-600 mt-4 mb-1">${stack.name || 'Unbenannter Stack'}</h4>`;
    byStack[sid].forEach(c => editorDiv.innerHTML += createContainerHTML(c, stackOptions));
  });

  // render without stack
  if (byStack['__nostack'] && byStack['__nostack'].length) {
    editorDiv.innerHTML += `<h4 class="font-semibold text-sm text-gray-600 mt-4 mb-1">Ohne Stack</h4>`;
    byStack['__nostack'].forEach(c => editorDiv.innerHTML += createContainerHTML(c, stackOptions));
  }

  function createContainerHTML(container, stackOptionsHtml) {
    const currentStackName = container.stackName || 'Kein Stack zugewiesen';
    return `
      <div data-template-id="${container.id}" class="template-selection-item p-2 border rounded-md bg-white cursor-pointer hover:bg-gray-100 mb-2">
        <p class="font-semibold">${container.name}</p>
        <div class="mt-2 p-2 bg-gray-50 rounded-lg">
          <div id="stack-display-container-${container.id}" class="flex justify-between items-center">
            <p class="text-sm">Aktueller Stack: <span class="font-bold text-teal-800">${currentStackName}</span></p>
            <button data-container-id="${container.id}" class="change-stack-btn text-sm font-semibold text-blue-600 hover:underline">ändern</button>
          </div>
          <div id="stack-edit-container-${container.id}" class="hidden flex gap-2 items-center mt-2">
            <select class="stack-assign-switcher flex-grow p-1 border rounded-lg bg-white text-sm">${stackOptionsHtml}</select>
            <button data-container-id="${container.id}" class="save-stack-assignment-btn py-1 px-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 text-xs">Speichern</button>
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

  const selectedBoxes = Array.from(document.querySelectorAll('.template-item-cb:checked'));
  if (!selectedBoxes.length) return alertUser && alertUser('Bitte mindestens einen Eintrag wählen.', 'error');

  try {
    // optional replace if 'Schiff' + 'ersetzen' selected
    const type = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
    const insertMode = modal.querySelector('input[name="insert-mode"]:checked')?.value || 'append';
    if (type === 'Schiff' && insertMode === 'ersetzen' && typeof getDocs === 'function' && typeof writeBatch === 'function') {
      const q = query(checklistItemsCollectionRef, where('listId', '==', targetListId));
      const snap = await getDocs(q);
      if (snap && snap.size > 0) {
        const batch = writeBatch(db);
        snap.forEach(s => batch.delete(s.ref));
        await batch.commit();
      }
    }

    for (const cb of selectedBoxes) {
      const data = {
        listId: targetListId,
        text: cb.dataset.text || '',
        status: 'open',
        important: cb.dataset.important === 'true',
        assignedTo: cb.dataset.assignedTo || null,
        assignedToName: cb.dataset.assignedToName || null,
        categoryId: cb.dataset.categoryId || null,
        categoryName: cb.dataset.categoryName || null,
        categoryColor: cb.dataset.categoryColor || null,
        addedBy: window.currentUser?.displayName || 'Unbekannt',
        addedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null
      };
      if (hasFirestore && typeof addDoc === 'function') {
        await addDoc(checklistItemsCollectionRef, data);
      } else {
        CHECKLIST_ITEMS[targetListId] = CHECKLIST_ITEMS[targetListId] || [];
        CHECKLIST_ITEMS[targetListId].push({ id: String(Date.now()), ...data });
      }
    }

    alertUser && alertUser(`${selectedBoxes.length} Einträge wurden hinzugefügt.`, 'success');
    closeTemplateModal();
  } catch (err) {
    console.error('applyTemplateLogic error:', err);
    alertUser && alertUser('Fehler beim Anwenden der Vorlage.', 'error');
  }
}


function listenForTemplates() {
  if (typeof onSnapshot !== 'function') return;
  try {
    const templatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates');
    onSnapshot(query(templatesCollectionRef, orderBy('name')), (snapshot) => {
      Object.keys(TEMPLATES).forEach(k => delete TEMPLATES[k]);
      snapshot.forEach(docSnap => { TEMPLATES[docSnap.id] = { id: docSnap.id, ...docSnap.data() }; });
      // wenn settings view offen und templates tab aktiv -> render
      const settingsView = document.getElementById('checklistSettingsView');
      if (settingsView && settingsView.classList.contains('active')) {
        renderContainerList();
      }
    });
  } catch (err) {
    console.error('listenForTemplates error:', err);
  }
}


function listenForChecklists() {
  if (typeof onSnapshot !== 'function') return;
  try {
    onSnapshot(query(checklistsCollectionRef, orderBy('name')), (snapshot) => {
      Object.keys(CHECKLISTS).forEach(k => delete CHECKLISTS[k]);
      snapshot.forEach(docSnap => { const d = { id: docSnap.id, ...docSnap.data() }; CHECKLISTS[docSnap.id] = d; });
      // trigger re-render if needed
      if (document.getElementById('checklistView')?.classList.contains('active')) {
        const id = document.getElementById('checklistView').dataset.currentListId;
        renderChecklistView(id || Object.keys(CHECKLISTS)[0]);
      }
      if (document.getElementById('checklistSettingsView')?.classList.contains('active')) {
        renderChecklistSettingsView();
      }
    });
  } catch (err) {
    console.error('listenForChecklists error:', err);
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

function renderChecklistView(listId) {
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

  const groupedListOptions = Object.values(CHECKLIST_GROUPS || {}).map(group => {
    const listsInGroup = Object.values(CHECKLISTS || {}).filter(l => l.groupId === group.id);
    if (listsInGroup.length === 0) return '';
    return `<optgroup label="${group.name}">${listsInGroup.map(list => `<option value="${list.id}" ${list.id === listId ? 'selected' : ''}>${list.name}</option>`).join('')}</optgroup>`;
  }).join('');

  const canSwitchLists = Boolean((window.currentUser && Array.isArray(window.currentUser.permissions) && window.currentUser.permissions.includes('CHECKLIST_SWITCH')));

  const disabledAttr = canSwitchLists ? '' : 'disabled';

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

  const total = filtered.length;
  const doneCount = doneItems.length;
  const openCount = openItems.length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  if (statsEl) statsEl.innerHTML = `${doneCount} von ${total} erledigt - Noch ${openCount} offen (${percent}%)`;

  // render open
  itemsContainer.innerHTML = '';
  openItems.forEach(item => {
    const importantClass = item.important ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-white';
    itemsContainer.innerHTML += `
      <div class="${importantClass} p-2 rounded-lg shadow-sm flex flex-col gap-1" data-item-id="${item.id}">
        <div class="flex items-start gap-2.5">
          <span class="text-xs font-bold text-gray-400 pt-1">${item.originalIndex + 1}.</span>
          <input type="checkbox" data-item-id="${item.id}" class="checklist-item-cb h-5 w-5 rounded border-gray-300 text-indigo-600 mt-0.5" ${item.status === 'done' ? 'checked' : ''}>
          <div class="flex-grow">
            <label class="text-sm">${item.text || ''}</label>
            ${item.lastActionBy ? `<p class="text-xs text-gray-400">${item.lastActionBy}</p>` : ''}
          </div>
        </div>
      </div>
    `;
  });

  // render done
  if (doneContainer) {
    if (doneItems.length > 0) {
      view.querySelector('#checklist-done-section')?.classList.remove('hidden');
      doneContainer.innerHTML = doneItems.map(item => {
        const importantClass = item.important ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-white';
        return `
          <div class="${importantClass} p-2 rounded-lg shadow-sm flex flex-col gap-1" data-item-id="${item.id}">
            <div class="flex items-start gap-2.5">
              <span class="text-xs font-bold text-gray-400 pt-1">${item.originalIndex + 1}.</span>
              <input type="checkbox" data-item-id="${item.id}" class="checklist-item-cb h-5 w-5 rounded border-gray-300 text-indigo-600 mt-0.5" checked>
              <div class="flex-grow">
                <label class="text-sm line-through">${item.text || ''}</label>
                ${item.lastActionBy ? `<p class="text-xs text-gray-400">${item.lastActionBy}</p>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      view.querySelector('#checklist-done-section')?.classList.add('hidden');
      doneContainer.innerHTML = '';
    }
  }

  // Delegierter Listener für Checkbox-Änderungen (einmalig)
  if (!itemsContainer.dataset.listenerAttached) {
    itemsContainer.addEventListener('change', async (e) => {
      const cb = e.target.closest('.checklist-item-cb');
      if (!cb) return;
      const itemId = cb.dataset.itemId;
      const checked = cb.checked;
      try {
        if (hasFirestore && typeof updateDoc === 'function' && typeof doc === 'function' && typeof checklistItemsCollectionRef !== 'undefined') {
          await updateDoc(doc(checklistItemsCollectionRef, itemId), {
            status: checked ? 'done' : 'open',
            lastActionBy: (window.currentUser && window.currentUser.displayName) ? window.currentUser.displayName : 'System',
            lastActionAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null
          });
        } else {
          // local fallback: update cache and re-render
          for (const lid of Object.keys(CHECKLIST_ITEMS || {})) {
            CHECKLIST_ITEMS[lid] = (CHECKLIST_ITEMS[lid] || []).map(it => it.id === itemId ? { ...it, status: checked ? 'done' : 'open' } : it);
          }
          renderChecklistItems(window.document.getElementById('checklistView')?.dataset.currentListId);
        }
      } catch (err) {
        console.error('Fehler beim Aktualisieren des Eintrags:', err);
        if (typeof alertUser === 'function') alertUser('Fehler beim Speichern des Eintrags.', 'error');
      }
    });
    itemsContainer.dataset.listenerAttached = 'true';
  }
}


export function renderChecklistSettingsItems(listId) {
  const container = document.getElementById('checklist-items-editor-container');
  if (!container) return;
  const items = (CHECKLIST_ITEMS[listId] || []).slice();
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="text-sm text-center text-gray-500">Diese Liste hat noch keine Einträge.</p>';
    return;
  }

  items.sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));
  container.innerHTML = items.map(item => {
    const colorKey = item.categoryColor || 'gray';
    const colorClass = (window.COLOR_PALETTE && COLOR_PALETTE[colorKey]) ? COLOR_PALETTE[colorKey].text : 'text-gray-700';
    return `
      <div class="p-2 border rounded-lg flex items-center gap-2 ${item.important ? 'bg-yellow-100' : ''}" data-item-id="${item.id}">
        <div class="item-display-content flex-grow">
          <p class="font-semibold">${item.text || ''}</p>
          <div class="text-xs text-gray-500 mt-1">
            ${item.assignedToName ? `<span class="font-semibold text-blue-600">Zugewiesen an: ${item.assignedToName}</span>` : ''}
            ${item.categoryName ? `<span class="${colorClass}">Kategorie: ${item.categoryName}</span>` : ''}
            <div>Hinzugefügt von: ${item.addedBy || ''}</div>
          </div>
        </div>
        <div class="item-edit-content hidden flex-grow">
          <input type="text" class="w-full p-2 border rounded-lg edit-item-input" value="${item.text || ''}">
        </div>
        <div class="flex items-center">
          <button class="edit-checklist-item-btn p-2 text-blue-500 hover:bg-blue-100 rounded">✎</button>
          <button class="save-checklist-item-btn p-2 text-green-500 hover:bg-green-100 rounded hidden">✓</button>
          <button class="delete-checklist-item-btn p-2 text-red-500 hover:bg-red-100 rounded">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  // Delegated listeners are set by setupListAndItemManagementListeners (which we bind in renderChecklistSettingsView)
}


function renderDeletedListsModal() {
    const container = document.getElementById('deletedListsContainer');
    container.innerHTML = ''; // Leeren

    const deletedLists = Object.values(DELETED_CHECKLISTS).sort((a, b) => b.deletedAt - a.deletedAt);

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
    if (deletedListsContainer) {
        deletedListsContainer.addEventListener('click', async (e) => {
            const restoreBtn = e.target.closest('.restore-checklist-btn');
            if (restoreBtn) {
                const listId = restoreBtn.dataset.listId;
                await updateDoc(doc(checklistsCollectionRef, listId), { isDeleted: false, deletedAt: null, deletedBy: null });
                alertUser("Liste wurde aus dem Papierkorb wiederhergestellt.", "success");
            }
        });
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
    const categoryContent = document.getElementById('category-content');
    if (!categoryContent) return;
    if (!groupId) {
        categoryContent.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte wählen Sie eine Gruppe, um deren Kategorien zu verwalten.</p>';
        return;
    }

    const categories = (CHECKLIST_CATEGORIES[groupId] || []).slice();

    // Baue Color-Palette HTML (einfaches Set)
    const colorKeys = Object.keys(COLOR_PALETTE || { gray: { bg: 'bg-gray-100', text: 'text-gray-700' } });
    const colorDots = colorKeys.map(colorKey => `<div data-color="${colorKey}" class="category-color-dot h-6 w-6 rounded-full cursor-pointer ${ (COLOR_PALETTE[colorKey] && COLOR_PALETTE[colorKey].bg) ? COLOR_PALETTE[colorKey].bg.replace('100','300') : 'bg-gray-300'}" title="${colorKey}"></div>`).join('');

    const listHtml = categories.length === 0 ? '<p class="text-xs text-center text-gray-500">Für diese Gruppe existieren keine Kategorien.</p>' :
        categories.map(cat => {
            const colorKey = cat.color || 'gray';
            const colorClass = (COLOR_PALETTE && COLOR_PALETTE[colorKey]) ? COLOR_PALETTE[colorKey].bg.replace('100','400') : 'bg-gray-300';
            return `
                <div class="flex justify-between items-center p-2 bg-white rounded-md border mb-2" data-category-id="${cat.id}">
                    <div class="cat-display-content flex items-center gap-2">
                        <div class="h-4 w-4 rounded-full ${colorClass} border"></div>
                        <span class="cat-name">${cat.name}</span>
                    </div>
                    <div class="cat-edit-content hidden flex-grow mr-2">
                        <input type="text" class="w-full p-1 border rounded-md edit-category-name-input" value="${cat.name}">
                    </div>
                    <div class="flex items-center gap-2">
                        <button class="edit-category-btn p-1 text-blue-500 hover:bg-blue-100 rounded" title="Bearbeiten">✎</button>
                        <button class="save-category-btn p-1 text-green-500 hover:bg-green-100 rounded hidden" title="Speichern">✓</button>
                        <button class="delete-category-btn p-1 text-red-500 hover:bg-red-100 rounded" title="Löschen">🗑</button>
                    </div>
                </div>
            `;
        }).join('');

    categoryContent.innerHTML = `
        <div id="category-list-container">${listHtml}</div>
        <div class="flex flex-col gap-2 pt-2 border-t mt-3">
            <input type="text" id="new-category-name" class="w-full p-2 border rounded-lg" placeholder="Name für neue Kategorie...">
            <div id="new-category-color-palette" class="flex gap-2 items-center">${colorDots}<input type="hidden" id="new-category-selected-color" value="gray"></div>
            <button id="create-category-btn" class="py-2 px-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">Erstellen</button>
        </div>
    `;
}

function updateCategoryDropdowns() {
    // Baut die HTML-Optionen für die Kategorien neu auf, basierend auf den aktuellen Daten
    const categoryOptions = `<option value="">Keine Kategorie</option>` + Object.values(CHECKLIST_GROUPS).map(group => {
        const categoriesInGroup = CHECKLIST_CATEGORIES[group.id] || [];
        if (categoriesInGroup.length === 0) return '';
        return `<optgroup label="${group.name}">${categoriesInGroup.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}</optgroup>`;
    }).join('');

    // Findet das Dropdown-Feld im "Vorlagen"-Tab
    const templateCategorySelect = document.getElementById('new-template-item-category');
    if (templateCategorySelect) {
        const selectedValue = templateCategorySelect.value; // Merkt sich die aktuelle Auswahl
        templateCategorySelect.innerHTML = categoryOptions; // Füllt das Dropdown mit den neuen Daten
        templateCategorySelect.value = selectedValue; // Versucht, die alte Auswahl wiederherzustellen
    }

    // Falls du zukünftig weitere Kategorie-Dropdowns hinzufügst, können sie hier ebenfalls aktualisiert werden.
}

function setupListAndItemManagementListeners(view) {
  if (!view) return;
  if (view.dataset.listenersSetup === 'true') return;
  view.dataset.listenersSetup = 'true';

  // Add item
  const addItemBtn = view.querySelector('#checklist-settings-add-item-btn');
  const addHandler = async () => {
    const textInput = view.querySelector('#checklist-settings-add-text');
    const assignee = view.querySelector('#checklist-settings-add-assignee')?.value || null;
    const category = view.querySelector('#checklist-settings-add-category')?.value || null;
    const important = view.querySelector('#checklist-settings-add-important')?.checked || false;
    const currentListId = view.querySelector('#checklist-settings-editor-switcher')?.value;
    if (!textInput || !currentListId) return;
    const text = textInput.value.trim();
    if (!text) return alertUser && alertUser('Bitte Text für den Eintrag eingeben.', 'error');

    const payload = {
      listId: currentListId,
      text,
      status: 'open',
      important,
      addedBy: window.currentUser?.displayName || 'Unbekannt',
      addedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null,
      assignedTo: assignee || null,
      assignedToName: (assignee && (USERS[assignee] && USERS[assignee].name)) ? USERS[assignee].name : null,
      categoryId: category || null,
      categoryName: null
    };

    // determine category name if provided
    if (category) {
      for (const group of Object.values(CHECKLIST_CATEGORIES || {})) {
        const found = (group || []).find(c => c.id === category);
        if (found) { payload.categoryName = found.name; payload.categoryColor = found.color || 'gray'; break; }
      }
    }

    try {
      if (hasFirestore && typeof addDoc === 'function') {
        await addDoc(checklistItemsCollectionRef, payload);
      } else {
        CHECKLIST_ITEMS[currentListId] = CHECKLIST_ITEMS[currentListId] || [];
        CHECKLIST_ITEMS[currentListId].push({ id: String(Date.now()), ...payload });
        renderChecklistSettingsItems(currentListId);
      }
      textInput.value = '';
      if (typeof alertUser === 'function') alertUser('Eintrag wurde hinzugefügt.', 'success');
    } catch (err) {
      console.error('Fehler beim Hinzufügen:', err);
      if (typeof alertUser === 'function') alertUser('Fehler beim Hinzufügen.', 'error');
    }
  };
  addItemBtn?.addEventListener('click', addHandler);
  view.querySelector('#checklist-settings-add-text')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addHandler(); } });

  // Editor actions (delegated)
  const itemsEditor = view.querySelector('#checklist-items-editor-container');
  if (itemsEditor && !itemsEditor.dataset.listenerAttached) {
    itemsEditor.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-checklist-item-btn');
      const saveBtn = e.target.closest('.save-checklist-item-btn');
      const deleteBtn = e.target.closest('.delete-checklist-item-btn');

      if (editBtn) {
        const row = editBtn.closest('[data-item-id]');
        row.querySelector('.item-display-content')?.classList.add('hidden');
        row.querySelector('.item-edit-content')?.classList.remove('hidden');
        editBtn.classList.add('hidden');
        row.querySelector('.save-checklist-item-btn')?.classList.remove('hidden');
        row.querySelector('.edit-item-input')?.focus();
        return;
      }

      if (saveBtn) {
        const row = saveBtn.closest('[data-item-id]');
        const itemId = row?.dataset.itemId;
        const newText = row.querySelector('.edit-item-input')?.value.trim();
        if (!newText) return alertUser && alertUser('Text darf nicht leer sein.', 'error');
        try {
          if (hasFirestore && typeof updateDoc === 'function') {
            await updateDoc(doc(checklistItemsCollectionRef, itemId), { text: newText, lastEditedBy: window.currentUser?.displayName || 'System', lastEditedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null });
          } else {
            for (const lid of Object.keys(CHECKLIST_ITEMS || {})) {
              CHECKLIST_ITEMS[lid] = (CHECKLIST_ITEMS[lid] || []).map(it => it.id === itemId ? { ...it, text: newText } : it);
            }
            renderChecklistSettingsItems(view.querySelector('#checklist-settings-editor-switcher')?.value);
          }
          row.querySelector('.item-display-content p') && (row.querySelector('.item-display-content p').textContent = newText);
          row.querySelector('.item-display-content')?.classList.remove('hidden');
          row.querySelector('.item-edit-content')?.classList.add('hidden');
          saveBtn.classList.add('hidden');
          row.querySelector('.edit-checklist-item-btn')?.classList.remove('hidden');
        } catch (err) {
          console.error('Fehler beim Speichern des Eintrags:', err);
          alertUser && alertUser('Fehler beim Speichern.', 'error');
        }
        return;
      }

      if (deleteBtn) {
        const row = deleteBtn.closest('[data-item-id]');
        const itemId = row?.dataset.itemId;
        if (!confirm('Eintrag wirklich löschen?')) return;
        try {
          if (hasFirestore && typeof deleteDoc === 'function') {
            await deleteDoc(doc(checklistItemsCollectionRef, itemId));
          } else {
            Object.keys(CHECKLIST_ITEMS || {}).forEach(lid => {
              CHECKLIST_ITEMS[lid] = (CHECKLIST_ITEMS[lid] || []).filter(i => i.id !== itemId);
            });
            renderChecklistSettingsItems(view.querySelector('#checklist-settings-editor-switcher')?.value);
          }
        } catch (err) {
          console.error('Fehler beim Löschen:', err);
          alertUser && alertUser('Fehler beim Löschen.', 'error');
        }
        return;
      }
    });
    itemsEditor.dataset.listenerAttached = 'true';
  }

  // Archive / show archived / show deleted
  view.querySelector('#show-archived-lists-btn')?.addEventListener('click', () => { try { renderArchivedListsModal && renderArchivedListsModal(); document.getElementById('archivedListsModal') && (document.getElementById('archivedListsModal').style.display = 'flex'); } catch(e){console.error(e);} });
  view.querySelector('#show-deleted-lists-btn')?.addEventListener('click', () => { try { renderDeletedListsModal && renderDeletedListsModal(); document.getElementById('deletedListsModal') && (document.getElementById('deletedListsModal').style.display = 'flex'); } catch(e){console.error(e);} });

  // Create list button
  view.querySelector('#checklist-settings-create-list-btn')?.addEventListener('click', async () => {
    const name = view.querySelector('#checklist-settings-new-name')?.value.trim();
    const groupId = view.querySelector('#checklist-settings-new-group-selector')?.value;
    if (!name || !groupId) return alertUser && alertUser('Bitte Namen und Gruppe angeben.', 'error');
    try {
      if (hasFirestore && typeof addDoc === 'function') {
        const docRef = await addDoc(checklistsCollectionRef, { name, isDeleted: false, isArchived: false, groupId, groupName: CHECKLIST_GROUPS[groupId]?.name || null });
        view.querySelector('#checklist-settings-new-name').value = '';
        view.querySelector('#checklist-settings-new-group-selector').value = '';
        alertUser && alertUser(`Liste "${name}" wurde erstellt.`, 'success');
        renderChecklistSettingsView(docRef?.id || null);
      } else {
        const id = String(Date.now());
        CHECKLISTS[id] = { id, name, groupId, groupName: CHECKLIST_GROUPS[groupId]?.name || null };
        alertUser && alertUser('Liste erstellt (lokal).', 'success');
        renderChecklistSettingsView(id);
      }
    } catch (err) {
      console.error('Fehler beim Erstellen der Liste:', err);
      alertUser && alertUser('Fehler beim Erstellen der Liste.', 'error');
    }
  });
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

function setupStackAndContainerManagementListeners(view) {
    if (!view) return;
    const templatesCard = view.querySelector('#card-templates');
    if (!templatesCard) return;
    if (templatesCard.dataset.listenerAttached === 'true') return;
    templatesCard.dataset.listenerAttached = 'true';

    templatesCard.addEventListener('click', async (e) => {
        // Neues Stack erstellen
        if (e.target.closest('#checklist-settings-create-stack-btn')) {
            const nameInput = view.querySelector('#checklist-settings-new-stack-name');
            if (!nameInput) return;
            const newName = (nameInput.value || '').trim();
            if (!newName) return alertUser && alertUser('Bitte Namen eingeben.', 'error');
            try {
                const stacksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-stacks');
                if (typeof addDoc === 'function') {
                    await addDoc(stacksCollectionRef, { name: newName });
                }
                nameInput.value = '';
                if (typeof alertUser === 'function') alertUser('Stack erstellt.', 'success');
                // Re-render
                renderContainerList();
            } catch (err) {
                console.error('Fehler beim Erstellen des Stacks:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Erstellen des Stacks.', 'error');
            }
            return;
        }

        // Neues Container erstellen
        if (e.target.closest('#checklist-settings-create-container-btn')) {
            const newName = view.querySelector('#checklist-settings-new-container-name')?.value.trim();
            const stackId = view.querySelector('#checklist-settings-new-stack-selector')?.value;
            if (!newName) return alertUser && alertUser('Bitte Containername eingeben.', 'error');
            if (!stackId) return alertUser && alertUser('Bitte Stack wählen.', 'error');
            try {
                const templatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates');
                if (typeof addDoc === 'function') {
                    await addDoc(templatesCollectionRef, { name: newName, stackId, stackName: CHECKLIST_STACKS[stackId]?.name || null, createdAt: serverTimestamp ? serverTimestamp() : null });
                }
                view.querySelector('#checklist-settings-new-container-name').value = '';
                view.querySelector('#checklist-settings-new-stack-selector').value = '';
                if (typeof alertUser === 'function') alertUser('Container erstellt.', 'success');
                renderContainerList();
            } catch (err) {
                console.error('Fehler beim Erstellen des Containers:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Erstellen des Containers.', 'error');
            }
            return;
        }

        // Auswahl eines bestehenden Container-Items (aus renderContainerList)
        const containerItem = e.target.closest('.template-selection-item');
        if (containerItem && !e.target.closest('button') && !e.target.closest('select')) {
            const clickedTemplateId = containerItem.dataset.templateId;
            const editor = document.getElementById('template-item-editor');
            if (!clickedTemplateId) return;
            if (selectedTemplateId === clickedTemplateId) {
                selectedTemplateId = null;
                editor && editor.classList.add('hidden');
                if (typeof unsubscribeTemplateItems === 'function') unsubscribeTemplateItems();
            } else {
                selectedTemplateId = clickedTemplateId;
                document.getElementById('template-editor-title').textContent = `Einträge für Container "${TEMPLATES[selectedTemplateId]?.name || '–'}"`;
                editor && editor.classList.remove('hidden');
                if (typeof unsubscribeTemplateItems === 'function') unsubscribeTemplateItems();
                if (typeof onSnapshot === 'function') {
                    const itemsSubCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates', selectedTemplateId, 'template-items');
                    unsubscribeTemplateItems = onSnapshot(query(itemsSubCollectionRef, orderBy('text')), (snapshot) => {
                        TEMPLATE_ITEMS[selectedTemplateId] = [];
                        snapshot.forEach(doc => TEMPLATE_ITEMS[selectedTemplateId].push({ id: doc.id, ...doc.data() }));
                        renderTemplateItemsEditor();
                    });
                }
            }
            renderContainerList();
            return;
        }

        // change/save stack assignment (in-place)
        if (e.target.closest('.change-stack-btn')) {
            const cid = e.target.closest('.change-stack-btn').dataset.containerId;
            document.getElementById(`stack-display-container-${cid}`)?.classList.add('hidden');
            document.getElementById(`stack-edit-container-${cid}`)?.classList.remove('hidden');
            return;
        }
        if (e.target.closest('.save-stack-assignment-btn')) {
            const cid = e.target.closest('.save-stack-assignment-btn').dataset.containerId;
            const editContainer = document.getElementById(`stack-edit-container-${cid}`);
            const newStackId = editContainer?.querySelector('.stack-assign-switcher')?.value || null;
            try {
                if (typeof updateDoc === 'function') {
                    await updateDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates'), cid), { stackId: newStackId || null, stackName: newStackId ? CHECKLIST_STACKS[newStackId]?.name : null });
                } else {
                    TEMPLATES[cid] = TEMPLATES[cid] || {};
                    TEMPLATES[cid].stackId = newStackId;
                    TEMPLATES[cid].stackName = newStackId ? CHECKLIST_STACKS[newStackId]?.name : null;
                }
                if (typeof alertUser === 'function') alertUser('Stack-Zuweisung gespeichert.', 'success');
                renderContainerList();
            } catch (err) {
                console.error('Fehler beim Speichern der Stack-Zuweisung:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Speichern.', 'error');
            }
            return;
        }
    });
}

// Ersetze die vorhandene renderChecklistSettingsView durch diese komplette Funktion (ganze Function austauschen)
function renderChecklistSettingsView(editListId = null) {
  const view = document.getElementById('checklistSettingsView');
  if (!view) return;

  // Defensive defaults
  window.currentUser = window.currentUser || { id: null, name: 'Gast', permissions: [] };
  window.adminSettings = window.adminSettings || {};

  const hasLists = Object.keys(CHECKLISTS || {}).length > 0;
  const defaultListId = adminSettings.defaultChecklistId || null;
  const listToEditId = editListId || view.dataset.editingListId || (hasLists ? Object.keys(CHECKLISTS)[0] : null);
  view.dataset.editingListId = listToEditId || '';

  // small html-escape helper
  const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  // Build base structure (we will populate selects via rebuildSelects to avoid += bugs)
  view.innerHTML = `
    <div class="back-link-container w-full mb-2"></div>
    <h2 class="text-2xl font-bold text-gray-800 mb-4">Checklisten‑Einstellungen</h2>
    <div class="mb-6">
      <h3 class="text-sm font-semibold text-gray-500 mb-1 px-1">Verwalten</h3>
      <div id="settings-tabs" class="grid grid-cols-2 sm:grid-cols-4 gap-1 border rounded-lg bg-gray-100 p-1">
        <button data-target-card="card-default-list" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Standard</button>
        <button data-target-card="card-manage-lists" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Gruppen & Listen</button>
        <button data-target-card="card-categories" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Kategorien</button>
        <button data-target-card="card-templates" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Stack & Container</button>
      </div>
    </div>

    <div id="card-default-list" class="settings-card hidden p-4 bg-white rounded-lg mb-4"></div>
    <div id="card-manage-lists" class="settings-card hidden p-4 bg-white rounded-lg mb-4"></div>
    <div id="card-categories" class="settings-card hidden p-4 bg-white rounded-lg mb-4"></div>
    <div id="card-templates" class="settings-card hidden p-4 bg-white rounded-lg mb-4"></div>
    <div id="card-list-item-editor" class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-green-500 mt-6"></div>
  `;

  // Fill cards (full innerHTML replacements to keep things deterministic)
  view.querySelector('#card-default-list').innerHTML = `
    <h3 class="font-bold text-gray-800 mb-2">Globale Standard‑Checkliste festlegen</h3>
    <div class="flex gap-2">
      <select id="checklist-settings-default-group-switcher" class="w-1/2 p-2 border rounded-lg bg-white"><option value="none">(Keine Liste)</option></select>
      <select id="checklist-settings-default-list-switcher" class="w-1/2 p-2 border rounded-lg bg-white" disabled><option>...</option></select>
    </div>
  `;

  view.querySelector('#card-manage-lists').innerHTML = `
    <h3 class="font-bold text-gray-800 mb-2">Gruppen & Listen verwalten</h3>
    <div class="p-3 bg-gray-50 rounded-lg mb-4">
      <div class="flex items-center gap-2">
        <select id="manage-groups-dropdown" class="flex-grow p-2 border rounded-lg bg-white"></select>
        <button id="edit-selected-group-btn" class="p-2 bg-blue-100 text-blue-600 rounded-lg" title="Gruppe umbenennen">✎</button>
        <button id="delete-selected-group-btn" class="p-2 bg-red-100 text-red-600 rounded-lg" title="Gruppe löschen">🗑</button>
      </div>
      <div id="create-group-form" class="hidden mt-3 flex gap-2">
        <input type="text" id="checklist-settings-new-group-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neue Gruppe...">
        <button id="checklist-settings-create-group-btn" class="py-2 px-3 bg-blue-600 text-white rounded-lg">Erstellen</button>
      </div>
      <button id="show-create-group-form-btn" class="mt-2 text-sm text-blue-600">+ Neue Gruppe erstellen</button>
    </div>

    <div class="p-3 bg-gray-50 rounded-lg">
      <h4 class="font-semibold text-sm">Neue Liste erstellen</h4>
      <input type="text" id="checklist-settings-new-name" class="w-full p-2 border rounded-lg mb-2" placeholder="Name der neuen Liste...">
      <select id="checklist-settings-new-group-selector" class="w-full p-2 border rounded-lg bg-white mb-2"><option value="">Gruppe für neue Liste wählen...</option></select>
      <button id="checklist-settings-create-list-btn" class="w-full py-2 bg-green-600 text-white rounded-lg">Liste erstellen</button>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2">
      <button id="show-archived-lists-btn" class="py-2 bg-gray-100 rounded-lg">Archiv</button>
      <button id="show-deleted-lists-btn" class="py-2 bg-gray-100 rounded-lg">Papierkorb</button>
    </div>
  `;

  view.querySelector('#card-categories').innerHTML = `
    <h3 class="font-bold text-gray-800 mb-2">Kategorien verwalten</h3>
    <p class="text-sm text-gray-600 mb-3">Wähle eine Gruppe.</p>
    <select id="category-group-selector" class="w-full p-2 border rounded-lg bg-white mb-4"><option value="">Gruppe wählen...</option></select>
    <div id="category-content"><p class="text-sm text-center text-gray-500">Bitte Gruppe wählen.</p></div>
  `;

  view.querySelector('#card-templates').innerHTML = `
    <h3 class="font-bold text-gray-800 mb-2">Stack & Container verwalten</h3>
    <div class="p-3 bg-gray-50 rounded-lg mb-4">
      <div class="flex items-center gap-2">
        <select id="manage-stacks-dropdown" class="flex-grow p-2 border rounded-lg bg-white"></select>
        <button id="show-create-stack-form-btn" class="text-sm text-blue-600">+ Neuen Stack erstellen</button>
      </div>
      <div id="create-stack-form" class="hidden mt-3 flex gap-2">
        <input type="text" id="checklist-settings-new-stack-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neuen Stack...">
        <button id="checklist-settings-create-stack-btn" class="py-2 px-3 bg-blue-600 text-white rounded-lg">Erstellen</button>
      </div>
    </div>

    <div class="p-3 bg-gray-50 rounded-lg">
      <input type="text" id="checklist-settings-new-container-name" class="w-full p-2 border rounded-lg mb-2" placeholder="Name des neuen Containers...">
      <select id="checklist-settings-new-stack-selector" class="w-full p-2 border rounded-lg bg-white mb-2"><option value="">Stack wählen...</option></select>
      <button id="checklist-settings-create-container-btn" class="w-full py-2 bg-green-600 text-white rounded-lg">Container erstellen</button>
    </div>

    <div id="container-list-editor" class="mt-4"></div>
  `;

  // Helper to rebuild all group/stack selects in one consistent way
  function rebuildSelects() {
    const groups = Object.values(CHECKLIST_GROUPS || {}).map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    const manageSel = view.querySelector('#manage-groups-dropdown');
    const newListGroupSel = view.querySelector('#checklist-settings-new-group-selector');
    const catGroupSel = view.querySelector('#category-group-selector');
    if (manageSel) { const prev = manageSel.value; manageSel.innerHTML = groups; if (prev) manageSel.value = prev; }
    if (newListGroupSel) { const prev2 = newListGroupSel.value; newListGroupSel.innerHTML = `<option value="">Gruppe für neue Liste wählen...</option>` + groups; if (prev2) newListGroupSel.value = prev2; }
    if (catGroupSel) { const prev3 = catGroupSel.value; catGroupSel.innerHTML = `<option value="">Gruppe wählen...</option>` + groups; if (prev3) catGroupSel.value = prev3; }

    const stacksHtml = Object.values(CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const stacksSel = view.querySelector('#manage-stacks-dropdown');
    const newContainerStackSel = view.querySelector('#checklist-settings-new-stack-selector');
    if (stacksSel) { const p = stacksSel.value; stacksSel.innerHTML = stacksHtml; if (p) stacksSel.value = p; }
    if (newContainerStackSel) { const p2 = newContainerStackSel.value; newContainerStackSel.innerHTML = `<option value="">Stack wählen...</option>` + stacksHtml; if (p2) newContainerStackSel.value = p2; }
  }

  // Delegated handler attached once on view (tab switching + all actions)
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
          tabBtn.classList.add('bg-white','shadow','text-indigo-600');
          tabBtn.classList.remove('text-gray-600');
          const card = view.querySelector('#' + target);
          if (card) card.classList.remove('hidden');
          if (target === 'card-templates' && typeof renderContainerList === 'function') {
            try { renderContainerList(); } catch(err) { console.warn(err); }
          }
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
          const nameInput = view.querySelector('#checklist-settings-new-group-name');
          const name = nameInput?.value.trim();
          if (!name) return alertUser && alertUser('Bitte Gruppennamen eingeben.', 'error');
          const exists = Object.values(CHECKLIST_GROUPS || {}).some(g => g.name.toLowerCase() === name.toLowerCase());
          if (exists) return alertUser && alertUser('Gruppe existiert bereits.', 'error');
          try {
            if (typeof addDoc === 'function') {
              await addDoc(checklistGroupsCollectionRef, { name });
            } else {
              const id = String(Date.now());
              CHECKLIST_GROUPS[id] = { id, name };
            }
            nameInput.value = '';
            rebuildSelects();
            alertUser && alertUser('Gruppe erstellt.', 'success');
          } catch (err) {
            console.error(err);
            alertUser && alertUser('Fehler beim Erstellen der Gruppe.', 'error');
          }
          return;
        }

        // Rename group
        if (t.closest('#edit-selected-group-btn')) {
          const sel = view.querySelector('#manage-groups-dropdown');
          const id = sel?.value;
          if (!id) return alertUser && alertUser('Bitte zuerst eine Gruppe auswählen.', 'error');
          const newName = prompt('Neuer Name für die Gruppe:', CHECKLIST_GROUPS[id]?.name || '');
          if (newName === null) return;
          const trimmed = newName.trim();
          if (!trimmed) return alertUser && alertUser('Name darf nicht leer sein.', 'error');
          const dup = Object.values(CHECKLIST_GROUPS || {}).filter(g => g.id !== id).some(g => g.name.toLowerCase() === trimmed.toLowerCase());
          if (dup) return alertUser && alertUser('Gruppe mit diesem Namen existiert bereits.', 'error');
          try {
            if (typeof updateDoc === 'function') {
              await updateDoc(doc(checklistGroupsCollectionRef, id), { name: trimmed });
            } else {
              CHECKLIST_GROUPS[id].name = trimmed;
            }
            rebuildSelects();
            alertUser && alertUser('Gruppe umbenannt.', 'success');
          } catch (err) {
            console.error(err);
            alertUser && alertUser('Fehler beim Umbennen.', 'error');
          }
          return;
        }

        // Delete group
        if (t.closest('#delete-selected-group-btn')) {
          const sel = view.querySelector('#manage-groups-dropdown');
          const id = sel?.value;
          if (!id) return alertUser && alertUser('Bitte eine Gruppe auswählen.', 'error');
          const name = CHECKLIST_GROUPS[id]?.name || 'Unbekannt';
          if (!confirm(`Gruppe "${name}" löschen?`)) return;
          try {
            if (typeof writeBatch === 'function') {
              const batch = writeBatch(db);
              Object.values(CHECKLISTS || {}).filter(l => l.groupId === id).forEach(l => batch.update(doc(checklistsCollectionRef, l.id), { isDeleted: true }));
              batch.delete(doc(checklistGroupsCollectionRef, id));
              await batch.commit();
            } else {
              Object.values(CHECKLISTS || {}).forEach(l => { if (l.groupId === id) l.isDeleted = true; });
              delete CHECKLIST_GROUPS[id];
            }
            rebuildSelects();
            alertUser && alertUser('Gruppe gelöscht.', 'success');
          } catch (err) {
            console.error(err);
            alertUser && alertUser('Fehler beim Löschen.', 'error');
          }
          return;
        }

        // Create stack
        if (t.closest('#checklist-settings-create-stack-btn')) {
          const name = view.querySelector('#checklist-settings-new-stack-name')?.value.trim();
          if (!name) return alertUser && alertUser('Bitte Namen eingeben.', 'error');
          try {
            if (typeof addDoc === 'function') {
              const col = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-stacks');
              await addDoc(col, { name });
            } else {
              const id = String(Date.now());
              CHECKLIST_STACKS[id] = { id, name };
            }
            view.querySelector('#checklist-settings-new-stack-name').value = '';
            rebuildSelects();
            alertUser && alertUser('Stack erstellt.', 'success');
          } catch (err) {
            console.error(err);
            alertUser && alertUser('Fehler beim Erstellen des Stacks.', 'error');
          }
          return;
        }

        // Create container
        if (t.closest('#checklist-settings-create-container-btn')) {
          const name = view.querySelector('#checklist-settings-new-container-name')?.value.trim();
          const stackId = view.querySelector('#checklist-settings-new-stack-selector')?.value;
          if (!name) return alertUser && alertUser('Bitte Containername eingeben.', 'error');
          try {
            if (typeof addDoc === 'function') {
              const templatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates');
              await addDoc(templatesCollectionRef, { name, stackId, stackName: CHECKLIST_STACKS[stackId]?.name || null, createdAt: serverTimestamp ? serverTimestamp() : null });
            } else {
              const id = String(Date.now());
              TEMPLATES[id] = { id, name, stackId, stackName: CHECKLIST_STACKS[stackId]?.name || null };
            }
            view.querySelector('#checklist-settings-new-container-name').value = '';
            rebuildSelects();
            renderContainerList && renderContainerList();
            alertUser && alertUser('Container erstellt.', 'success');
          } catch (err) {
            console.error(err);
            alertUser && alertUser('Fehler beim Erstellen des Containers.', 'error');
          }
          return;
        }

        // open template modal
        if (t.closest('#show-template-modal-btn')) {
          const listId = view.querySelector('#checklist-settings-editor-switcher')?.value;
          if (!listId) return alertUser && alertUser('Bitte zuerst eine Liste auswählen.', 'error');
          openTemplateModal && openTemplateModal(listId);
          return;
        }

        // show archived / deleted
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
        console.error('Fehler im settings delegated handler:', err);
      }
    }, true);
    view.dataset.settingsDelegationAttached = '1';
  }

  // initial select population
  rebuildSelects();

  // ensure a tab is active
  const anyActive = Array.from(view.querySelectorAll('.settings-tab-btn')).some(b => b.classList.contains('bg-white'));
  if (!anyActive) {
    const first = view.querySelector('.settings-tab-btn');
    first && first.click();
  }
}

function setupCategoryManagementListeners(view) {
    if (!view) return;
    if (view.dataset.categoryListenersAttached === 'true') return;
    view.dataset.categoryListenersAttached = 'true';

    const groupSelector = view.querySelector('#category-group-selector');
    const categoryContent = view.querySelector('#category-content');

    // Wenn Gruppe wechselt, rendere Editor neu
    if (groupSelector) {
        groupSelector.addEventListener('change', () => {
            renderCategoryEditor(groupSelector.value);
        });
    }

    // Delegierter Click-Handler für Aktionen im categoryContent
    categoryContent && categoryContent.addEventListener('click', async (e) => {
        const createBtn = e.target.closest('#create-category-btn');
        const editBtn = e.target.closest('.edit-category-btn');
        const saveBtn = e.target.closest('.save-category-btn');
        const deleteBtn = e.target.closest('.delete-category-btn');
        const colorDot = e.target.closest('.category-color-dot'); // neue palette
        const existingColorDot = e.target.closest('.color-dot'); // if used elsewhere

        const groupId = groupSelector?.value;
        if (!groupId) {
            if (createBtn) return alertUser && alertUser('Bitte zuerst eine Gruppe wählen.', 'error');
            return;
        }

        if (createBtn) {
            const nameInput = document.getElementById('new-category-name');
            const colorInput = document.getElementById('new-category-selected-color');
            const newName = nameInput?.value.trim();
            const color = colorInput?.value || 'gray';
            if (!newName) return alertUser && alertUser('Bitte einen Kategorienamen eingeben.', 'error');
            try {
                if (typeof addDoc === 'function') {
                    await addDoc(checklistCategoriesCollectionRef, { name: newName, groupId, color });
                } else {
                    const id = String(Date.now());
                    if (!CHECKLIST_CATEGORIES[groupId]) CHECKLIST_CATEGORIES[groupId] = [];
                    CHECKLIST_CATEGORIES[groupId].push({ id, name: newName, color });
                }
                nameInput.value = '';
                if (typeof alertUser === 'function') alertUser('Kategorie gespeichert.', 'success');
                renderCategoryEditor(groupId);
            } catch (err) {
                console.error('Fehler beim Erstellen der Kategorie:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Speichern.', 'error');
            }
            return;
        }

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
            try {
                if (typeof updateDoc === 'function') {
                    await updateDoc(doc(checklistCategoriesCollectionRef, catId), { name: newName });
                }
                if (typeof alertUser === 'function') alertUser('Kategorie umbenannt.', 'success');
                renderCategoryEditor(groupId);
            } catch (err) {
                console.error('Fehler beim Umbennen der Kategorie:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Umbennen.', 'error');
            }
            return;
        }

        if (deleteBtn) {
            const container = deleteBtn.closest('[data-category-id]');
            const catId = container?.dataset.categoryId;
            if (!confirm('Kategorie wirklich löschen?')) return;
            try {
                if (typeof deleteDoc === 'function') {
                    await deleteDoc(doc(checklistCategoriesCollectionRef, catId));
                } else {
                    CHECKLIST_CATEGORIES[groupId] = (CHECKLIST_CATEGORIES[groupId] || []).filter(c => c.id !== catId);
                }
                if (typeof alertUser === 'function') alertUser('Kategorie gelöscht.', 'success');
                renderCategoryEditor(groupId);
            } catch (err) {
                console.error('Fehler beim Löschen der Kategorie:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Löschen.', 'error');
            }
            return;
        }

        // Farbwahl (neu): Klick auf Farbe wählt für "new category" aus
        if (colorDot) {
            const selected = colorDot.dataset.color;
            const colorInput = document.getElementById('new-category-selected-color');
            if (colorInput) colorInput.value = selected;
            // Visual feedback: ring um gewählte Farbe (einfach)
            const palette = document.getElementById('new-category-color-palette');
            palette && palette.querySelectorAll('.category-color-dot').forEach(d => d.classList.remove('ring-2', 'ring-blue-500'));
            colorDot.classList.add('ring-2', 'ring-blue-500');
            return;
        }

        // Farbwechsel für bestehende Kategorie (wenn vorhanden)
        if (existingColorDot) {
            const catId = existingColorDot.dataset.categoryId;
            const newColor = existingColorDot.dataset.color;
            try {
                if (typeof updateDoc === 'function') {
                    await updateDoc(doc(checklistCategoriesCollectionRef, catId), { color: newColor });
                }
                if (typeof alertUser === 'function') alertUser('Farbe gespeichert.', 'success');
                renderCategoryEditor(groupId);
            } catch (err) {
                console.error('Fehler beim Speichern der Farbe:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Speichern der Farbe.', 'error');
            }
            return;
        }
    });
}

function renderPermanentDeleteModal() {
    const container = document.getElementById('permanentDeleteListsContainer');
    container.innerHTML = ''; // Vorherigen Inhalt leeren

    const deletedLists = Object.values(DELETED_CHECKLISTS);

    if (deletedLists.length === 0) {
        container.innerHTML = '<p class="text-sm text-center text-gray-500">Keine Listen im Papierkorb.</p>';
        return;
    }

    deletedLists.forEach(list => {
        const date = list.deletedAt?.toDate().toLocaleDateString('de-DE') || 'Unbekannt';
        container.innerHTML += `
                <label class="flex items-start gap-3 p-2 cursor-pointer hover:bg-gray-100 rounded-md">
                    <input type="checkbox" data-list-id="${list.id}" class="h-5 w-5 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500 mt-1 permanent-delete-cb">
                    <div>
                        <span class="font-semibold text-gray-800">${list.name}</span>
                        <p class="text-xs text-gray-500">Gelöscht von ${list.deletedBy} am ${date}</p>
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
        badgesHTML += `<span class="text-xs font-semibold py-0.5 px-2 rounded-full whitespace-nowrap bg-gray-200 text-gray-700">${item.assignedToName}</span>`;
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

function setupTemplateEditorListeners() {
    const templatesCard = document.getElementById('card-templates');
    if (!templatesCard || templatesCard.dataset.listenerAttached === 'true') {
        return; // Verhindert, dass der Listener mehrfach hinzugefügt wird
    }

    templatesCard.addEventListener('click', async (e) => {
        const templateItem = e.target.closest('.template-selection-item');
        if (templateItem) {
            selectedTemplateId = templateItem.dataset.templateId;
            document.getElementById('template-editor-title').textContent = `Einträge für Container "${TEMPLATES[selectedTemplateId].name}"`;
            document.getElementById('template-item-editor').classList.remove('hidden');
            renderTemplateList();

            if (unsubscribeTemplateItems) unsubscribeTemplateItems();

            const itemsSubCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates', selectedTemplateId, 'template-items');
            unsubscribeTemplateItems = onSnapshot(query(itemsSubCollectionRef), (snapshot) => {
                TEMPLATE_ITEMS[selectedTemplateId] = [];
                snapshot.forEach(doc => TEMPLATE_ITEMS[selectedTemplateId].push({ id: doc.id, ...doc.data() }));
                renderTemplateItemsEditor();
            });
            return;
        }

        if (e.target.closest('#add-template-item-btn') && selectedTemplateId) {
            const textInput = document.getElementById('new-template-item-text');
            const assigneeSelect = document.getElementById('new-template-item-assignee');
            const categorySelect = document.getElementById('new-template-item-category');
            const importantCheckbox = document.getElementById('new-template-item-important');
            const text = textInput.value.trim();
            if (!text) return alertUser("Bitte Text eingeben.", "error");

            const assignedTo = assigneeSelect.value;
            const assignedToName = assignedTo ? assigneeSelect.options[assigneeSelect.selectedIndex].text : null;
            const categoryId = categorySelect.value;
            const categoryName = categoryId ? categorySelect.options[categorySelect.selectedIndex].text : null;

            const newItemData = { text, important: importantCheckbox.checked, assignedTo: assignedTo || null, assignedToName, categoryId: categoryId || null, categoryName };
            const itemsSubCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates', selectedTemplateId, 'template-items');
            await addDoc(itemsSubCollectionRef, newItemData);

            textInput.value = '';
            assigneeSelect.value = '';
            categorySelect.value = '';
            importantCheckbox.checked = false;
            textInput.focus();
            return;
        }

        const createForm = templatesCard.querySelector('#create-template-form');
        const showCreateFormBtn = templatesCard.querySelector('#show-create-template-form-btn');

        if (e.target.closest('#show-create-template-form-btn')) {
            createForm.classList.remove('hidden');
            showCreateFormBtn.classList.add('hidden');
        }

        if (e.target.closest('#create-template-btn')) {
            const newTemplateNameInput = document.getElementById('new-template-name');
            const templateName = newTemplateNameInput.value.trim();
            if (!templateName) return alertUser("Bitte geben Sie einen Namen für den Container ein.", "error");

            const templatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates');
            await addDoc(templatesCollectionRef, { name: templateName, createdAt: serverTimestamp() });
            alertUser(`Container "${templateName}" wurde erstellt!`, "success");
            newTemplateNameInput.value = '';
            createForm.classList.add('hidden');
            showCreateFormBtn.classList.remove('hidden');
            return;
        }

        const deleteTemplateItemBtn = e.target.closest('.delete-template-item-btn');
        if (deleteTemplateItemBtn && selectedTemplateId) {
            const itemId = deleteTemplateItemBtn.dataset.itemId;
            if (confirm("Möchten Sie diesen Eintrag wirklich aus dem Container löschen?")) {
                const itemRef = doc(db, 'artifacts', appId, 'public', 'data', 'checklist-templates', selectedTemplateId, 'template-items', itemId);
                await deleteDoc(itemRef);
            }
            return;
        }

        const deleteTemplateBtn = e.target.closest('#delete-template-btn');
        if (deleteTemplateBtn && selectedTemplateId) {
            if (confirm(`Möchten Sie den Container "${TEMPLATES[selectedTemplateId].name}" wirklich unwiderruflich löschen?`)) {
                const templateRef = doc(db, 'artifacts', appId, 'public', 'data', 'checklist-templates', selectedTemplateId);
                await deleteDoc(templateRef);
                selectedTemplateId = null;
                document.getElementById('template-item-editor').classList.add('hidden');
                renderTemplateList();
            }
            return;
        }
    });

    templatesCard.dataset.listenerAttached = 'true';
    document.getElementById('closeTemplateModalBtn').addEventListener('click', closeTemplateModal);
    document.getElementById('cancel-template-modal-btn').addEventListener('click', closeTemplateModal);
    document.getElementById('apply-template-btn').addEventListener('click', applyTemplateLogic);

}

function openTemplateModal(targetListId) {
  const modal = document.getElementById('templateApplyModal');
  if (!modal) return;
  modal.dataset.targetListId = targetListId || '';
  const templateSelect = document.getElementById('template-select');
  const itemsContainer = document.getElementById('template-items-container');
  const modeSection = document.getElementById('template-mode-section');

  const updateTemplateDropdown = () => {
    const type = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
    if (!templateSelect) return;
    templateSelect.innerHTML = '<option value="">Bitte Quelle wählen...</option>';
    if (type === 'Container') {
      const grouped = Object.values(CHECKLIST_STACKS || {}).map(stack => {
        const containers = Object.values(TEMPLATES || {}).filter(t => t.stackId === stack.id);
        if (!containers.length) return '';
        return `<optgroup label="${stack.name}">${containers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</optgroup>`;
      }).join('');
      const without = Object.values(TEMPLATES || {}).filter(t => !t.stackId).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
      templateSelect.innerHTML += grouped + (without ? `<optgroup label="Ohne Stack">${without}</optgroup>` : '');
    } else {
      templateSelect.innerHTML += Object.values(CHECKLISTS || {}).map(cl => `<option value="${cl.id}">${cl.name}</option>`).join('');
    }
    modeSection && modeSection.classList.toggle('hidden', type !== 'Schiff');
  };

  if (!modal.dataset.listenersAttached) {
    templateSelect?.addEventListener('change', async (e) => {
      const id = e.target.value;
      const type = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
      if (!itemsContainer) return;
      itemsContainer.innerHTML = '';
      if (!id) return;
      if (type === 'Container') {
        itemsContainer.innerHTML = '<p class="text-xs text-gray-500">Lade Einträge...</p>';
        try {
          if (typeof getDocs === 'function') {
            const itemsRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates', id, 'template-items');
            const snap = await getDocs(query(itemsRef, orderBy('text')));
            const items = [];
            snap.forEach(s => items.push({ id: s.id, ...s.data() }));
            if (!items.length) { itemsContainer.innerHTML = '<p class="text-xs text-gray-500">Keine Einträge.</p>'; return; }
            itemsContainer.innerHTML = items.map(it => `
              <label class="flex items-center gap-2 p-1 cursor-pointer hover:bg-gray-100 rounded">
                <input type="checkbox" class="h-4 w-4 template-item-cb" value="${it.id}"
                  data-text="${(it.text||'').replace(/"/g,'&quot;')}"
                  data-important="${!!it.important}"
                  data-assigned-to="${it.assignedTo || ''}"
                  data-assigned-to-name="${it.assignedToName || ''}"
                  data-category-id="${it.categoryId || ''}"
                  data-category-name="${it.categoryName || ''}"
                  data-category-color="${it.categoryColor || ''}">
                <span class="text-sm">${it.text}</span>
              </label>
            `).join('');
          } else {
            itemsContainer.innerHTML = '<p class="text-xs text-gray-500">Datenbank nicht verfügbar.</p>';
          }
        } catch (err) {
          console.error('Fehler beim Laden der Template-Items:', err);
          itemsContainer.innerHTML = '<p class="text-xs text-red-500">Fehler beim Laden.</p>';
        }
      } else {
        const items = CHECKLIST_ITEMS[id] || [];
        if (!items.length) { itemsContainer.innerHTML = '<p class="text-xs text-gray-500">Keine Einträge.</p>'; return; }
        itemsContainer.innerHTML = items.map(it => `
          <label class="flex items-center gap-2 p-1 cursor-pointer hover:bg-gray-100 rounded">
            <input type="checkbox" class="h-4 w-4 template-item-cb" value="${it.id}"
              data-text="${(it.text||'').replace(/"/g,'&quot;')}"
              data-important="${!!it.important}"
              data-assigned-to="${it.assignedTo || ''}"
              data-assigned-to-name="${it.assignedToName || ''}"
              data-category-id="${it.categoryId || ''}"
              data-category-name="${it.categoryName || ''}"
              data-category-color="${it.categoryColor || ''}">
            <span class="text-sm">${it.text}</span>
          </label>
        `).join('');
      }
    });

    document.getElementById('apply-template-btn')?.addEventListener('click', applyTemplateLogic);
    document.getElementById('cancel-template-modal-btn')?.addEventListener('click', closeTemplateModal);
    document.getElementById('closeTemplateModalBtn')?.addEventListener('click', closeTemplateModal);

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
