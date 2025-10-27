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
    USERS,
    settingsDocRef,
    checklistStacksCollectionRef,
    checklistTemplatesCollectionRef,
    CHECKLIST_STACKS,
    COLOR_PALETTE
} from './haupteingang.js';

export {
  listenForTemplates,
  listenForChecklists,
  listenForChecklistGroups,
  listenForChecklistCategories,
  listenForChecklistItems,
  openTemplateModal,
  renderChecklistView,
  renderChecklistSettingsView,
};

// ENDE-ZIKA //
  const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));


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

export function listenForStacks() {
  if (typeof onSnapshot !== 'function' || !checklistStacksCollectionRef) return;
  try {
    onSnapshot(query(checklistStacksCollectionRef, orderBy('name')), (snapshot) => {
      // Leere das globale Objekt, bevor du es neu füllst
      Object.keys(CHECKLIST_STACKS).forEach(k => delete CHECKLIST_STACKS[k]);
      snapshot.forEach(docSnap => { 
          CHECKLIST_STACKS[docSnap.id] = { id: docSnap.id, ...docSnap.data() }; 
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
    console.error('listenForStacks error:', err);
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
  if (!listId || !CHECKLISTS[listId]) {
    container.innerHTML = '<p class="text-sm text-center text-gray-500">Bitte zuerst eine gültige Checkliste auswählen.</p>';
    return;
  }

  const items = (CHECKLIST_ITEMS[listId] || []).slice();
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="text-sm text-center text-gray-500">Diese Liste hat noch keine Einträge.</p>';
    return;
  }

  // sort: important first, then insertion order
  items.sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));

  container.innerHTML = items.map((item, idx) => {
    const impClass = item.important ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-white';
    const assigned = item.assignedToName ? `<span class="ml-2 text-xs bg-gray-200 text-gray-700 py-0.5 px-2 rounded-full">${escapeHtml(item.assignedToName)}</span>` : '';
    const cat = item.categoryName ? `<span class="ml-2 text-xs font-semibold ${item.categoryColor ? '' : 'text-gray-700'}">${escapeHtml(item.categoryName)}</span>` : '';
    return `
      <div class="${impClass} p-3 rounded-lg flex justify-between items-start" data-item-id="${item.id}">
        <div class="flex-1">
          <div class="flex items-start gap-2">
            <span class="text-xs font-bold text-gray-400 pt-1">${idx+1}.</span>
            <div>
              <p class="font-semibold text-sm item-text">${escapeHtml(item.text || '')}</p>
              <div class="text-xs text-gray-500 mt-1">
                ${assigned} ${cat}
                <span class="ml-2">von: ${escapeHtml(item.addedBy || '')}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col items-end gap-2">
          <button class="edit-checklist-item-btn p-1 text-blue-600 rounded" title="Bearbeiten">✎</button>
          <button class="delete-checklist-item-btn p-1 text-red-600 rounded" title="Löschen">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  // Delegated item listeners (attach once on container)
  if (!container.dataset.listenersAttached) {
    container.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-checklist-item-btn');
      const deleteBtn = e.target.closest('.delete-checklist-item-btn');

      if (editBtn) {
        const row = editBtn.closest('[data-item-id]');
        if (!row) return;
        const id = row.dataset.itemId;
        const currentText = row.querySelector('.item-text')?.textContent || '';
        const newText = prompt('Eintrag bearbeiten:', currentText);
        if (newText === null) return;
        const trimmed = newText.trim();
        if (!trimmed) return alertUser && alertUser('Text darf nicht leer sein.', 'error');
        try {
          if (typeof updateDoc === 'function' && typeof doc === 'function') {
            await updateDoc(doc(checklistItemsCollectionRef, id), { text: trimmed, lastEditedBy: window.currentUser?.displayName || 'System', lastEditedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null });
          } else {
            // local fallback
            CHECKLIST_ITEMS[listId] = (CHECKLIST_ITEMS[listId] || []).map(it => it.id === id ? { ...it, text: trimmed } : it);
            renderChecklistSettingsItems(listId);
          }
          alertUser && alertUser('Eintrag gespeichert.', 'success');
        } catch (err) {
          console.error('Fehler beim Speichern des Eintrags:', err);
          alertUser && alertUser('Fehler beim Speichern des Eintrags.', 'error');
        }
        return;
      }

      if (deleteBtn) {
        const row = deleteBtn.closest('[data-item-id]');
        if (!row) return;
        const id = row.dataset.itemId;
        if (!confirm('Eintrag wirklich löschen?')) return;
        try {
          if (typeof deleteDoc === 'function' && typeof doc === 'function') {
            await deleteDoc(doc(checklistItemsCollectionRef, id));
          } else {
            CHECKLIST_ITEMS[listId] = (CHECKLIST_ITEMS[listId] || []).filter(it => it.id !== id);
            renderChecklistSettingsItems(listId);
          }
          alertUser && alertUser('Eintrag gelöscht.', 'success');
        } catch (err) {
          console.error('Fehler beim Löschen des Eintrags:', err);
          alertUser && alertUser('Fehler beim Löschen des Eintrags.', 'error');
        }
        return;
      }
    });
    container.dataset.listenersAttached = '1';
  }

  // small helper for escaping used above
  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
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

// Ersetze NUR diese Funktion in checklist.js
function setupListAndItemManagementListeners(view) {
  if (!view) return;

  // Globale Prüfung wurde entfernt in vorherigen Schritten, das ist gut so.
  console.log("setupListAndItemManagementListeners: Funktion wird aufgerufen und hängt Listener an."); // Debug

  // --- Archivieren-Button ---
  const archiveBtn = view.querySelector('#checklist-archive-list-btn');
  // Individuelle Prüfung mit dataset
  if (archiveBtn && !archiveBtn.dataset.listenerAttached) {
      archiveBtn.addEventListener('click', async () => {
          console.log("Archivieren-Button geklickt."); // Debug
          const listIdToArchive = view.dataset.editingListId; // ID im Moment des Klicks holen
          console.log("Liste zum Archivieren:", listIdToArchive); // Debug

          if (!listIdToArchive || !CHECKLISTS[listIdToArchive]) {
              console.error("Archivieren abgebrochen: Keine gültige Liste ausgewählt."); // Debug
              return alertUser && alertUser("Keine gültige Liste zum Archivieren ausgewählt.", "error");
          }

          const listName = CHECKLISTS[listIdToArchive]?.name || 'Unbekannte Liste';
          if (confirm(`Möchten Sie die Liste "${listName}" wirklich archivieren? Sie wird dann aus den normalen Auswahlen entfernt.`)) {
              console.log("Archivieren bestätigt für:", listName); // Debug
              try {
                  if (typeof updateDoc !== 'function' || typeof doc !== 'function' || !checklistsCollectionRef || typeof serverTimestamp !== 'function') {
                       throw new Error("Firebase-Funktionen/Referenzen fehlen.");
                  }
                  console.log("Sende updateDoc an Firebase für ID:", listIdToArchive); // Debug
                  await updateDoc(doc(checklistsCollectionRef, listIdToArchive), {
                      isArchived: true,
                      archivedAt: serverTimestamp(),
                      archivedBy: window.currentUser?.displayName || 'Unbekannt'
                  });
                  console.log("updateDoc erfolgreich gesendet (Firebase)."); // Angepasst

                  alertUser && alertUser(`Liste "${listName}" wurde archiviert.`, 'success');

                  // renderChecklistSettingsView(); // --- DIESE ZEILE IST DAS PROBLEM - ENTFERNT ---
                  console.log("renderChecklistSettingsView NICHT manuell aufgerufen. Warte auf Listener-Update."); // Debug

              } catch (error) {
                  console.error("FEHLER beim Archivieren der Liste:", error.code, error.message, error);
                  alertUser && alertUser(`Fehler beim Archivieren: ${error.message}`, "error");
              }
          } else {
               console.log("Archivieren abgebrochen."); // Debug
          }
      });
      archiveBtn.dataset.listenerAttached = 'true'; // Markieren
      console.log("Archivieren-Listener angehängt."); // Debug
  }


  // --- Eintrag hinzufügen ---
  const addItemBtn = view.querySelector('#checklist-settings-add-item-btn');
  const addTextInput = view.querySelector('#checklist-settings-add-text');
  const addHandler = async () => {
    console.log("addHandler aufgerufen."); // Debug
    const textInput = view.querySelector('#checklist-settings-add-text');
    const assigneeSelect = view.querySelector('#checklist-settings-add-assignee');
    const categorySelect = view.querySelector('#checklist-settings-add-category');
    const importantCheck = view.querySelector('#checklist-settings-add-important');
    const currentListId = view.querySelector('#checklist-settings-editor-switcher')?.value;
    // --- FIX 2: Prüfung auf gültige Liste und bessere Fehlermeldung ---
if (!currentListId || !CHECKLISTS[currentListId]) { // Auch prüfen, ob die ID in CHECKLISTS existiert
return alertUser && alertUser("Bitte wählen Sie zuerst eine gültige Liste aus, zu der Sie Einträge hinzufügen möchten.",
"error");
}
// --- ENDE FIX 2 ---
    if (!textInput || !assigneeSelect || !categorySelect || !importantCheck || !currentListId) { console.error("addHandler: Benötigte Elemente nicht gefunden."); return alertUser("Fehler...", "error"); }
    const text = textInput.value.trim(); if (!text) return alertUser && alertUser('Text eingeben.', 'error');
    const assignee = assigneeSelect.value || null; const category = categorySelect.value || null; const important = importantCheck.checked || false;
    const payload = { listId: currentListId, text, status: 'open', important, addedBy: window.currentUser?.displayName || 'Unbekannt', addedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null, assignedTo: assignee, assignedToName: (assignee && USERS[assignee]?.name) ? USERS[assignee].name : null, categoryId: category, categoryName: null, categoryColor: null };
    if (category) { for (const group of Object.values(CHECKLIST_CATEGORIES || {})) { const found = (group || []).find(c => c.id === category); if (found) { payload.categoryName = found.name; payload.categoryColor = found.color || 'gray'; break; } } }
    try {
      console.log("addHandler: Versuche Eintrag hinzuzufügen:", payload);
      if (typeof addDoc === 'function' && checklistItemsCollectionRef) { await addDoc(checklistItemsCollectionRef, payload); console.log("addHandler: Eintrag hinzugefügt (Firebase)."); }
      else { console.warn("addHandler: addDoc/Ref fehlt, füge lokal hinzu."); CHECKLIST_ITEMS[currentListId] = CHECKLIST_ITEMS[currentListId] || []; CHECKLIST_ITEMS[currentListId].push({ id: String(Date.now()), ...payload }); renderChecklistSettingsItems(currentListId); }
      textInput.value = ''; if (typeof alertUser === 'function') alertUser('Eintrag hinzugefügt.', 'success');
    } catch (err) { console.error('Fehler beim Hinzufügen:', err); if (typeof alertUser === 'function') alertUser('Fehler beim Hinzufügen.', 'error'); }
  }; // Ende addHandler

  if (addItemBtn && !addItemBtn.dataset.listenerAttached) {
      addItemBtn.addEventListener('click', addHandler);
      addItemBtn.dataset.listenerAttached = 'true';
      console.log("AddItem-Button-Listener angehängt."); // Debug
  }
  if (addTextInput && !addTextInput.dataset.listenerAttached) {
       addTextInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addHandler(); } });
       addTextInput.dataset.listenerAttached = 'true';
       console.log("AddItem-Texteingabe-Listener angehängt."); // Debug
   }

  // --- Editor Aktionen (Bearbeiten/Löschen von Einträgen) ---
  const itemsEditor = view.querySelector('#checklist-items-editor-container');
  if (itemsEditor && !itemsEditor.dataset.listenerAttached) {
    itemsEditor.addEventListener('click', async (e) => {
        console.log("Klick im Items-Editor erkannt.");
      const editBtn = e.target.closest('.edit-checklist-item-btn'); const deleteBtn = e.target.closest('.delete-checklist-item-btn'); const currentListIdForRender = view.dataset.editingListId;
      if (editBtn) {
           console.log("Bearbeiten-Button geklickt.");
          const row = editBtn.closest('[data-item-id]'); if (!row) return; const id = row.dataset.itemId; const currentText = row.querySelector('.item-text')?.textContent || ''; const newText = prompt('Eintrag bearbeiten:', currentText); if (newText === null) return; const trimmed = newText.trim(); if (!trimmed) return alertUser && alertUser('Text darf nicht leer sein.', 'error');
          try { if (typeof updateDoc === 'function' && typeof doc === 'function' && checklistItemsCollectionRef) { await updateDoc(doc(checklistItemsCollectionRef, id), { text: trimmed, lastEditedBy: window.currentUser?.displayName || 'System', lastEditedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null }); alertUser && alertUser('Eintrag gespeichert.', 'success'); } else { CHECKLIST_ITEMS[currentListIdForRender] = (CHECKLIST_ITEMS[currentListIdForRender] || []).map(it => it.id === id ? { ...it, text: trimmed } : it); renderChecklistSettingsItems(currentListIdForRender); alertUser && alertUser('Eintrag gespeichert (lokal).', 'success'); } } catch (err) { console.error('Fehler beim Speichern:', err); alertUser && alertUser('Fehler beim Speichern.', 'error'); } return;
      }
      if (deleteBtn) {
         console.log("Löschen-Button (Item) geklickt.");
        const row = deleteBtn.closest('[data-item-id]'); if (!row) return; const itemId = row.dataset.itemId; if (!confirm('Eintrag wirklich löschen?')) return;
        try { if (typeof deleteDoc === 'function' && typeof doc === 'function' && checklistItemsCollectionRef) { await deleteDoc(doc(checklistItemsCollectionRef, itemId)); alertUser && alertUser('Eintrag gelöscht.', 'success'); } else { Object.keys(CHECKLIST_ITEMS || {}).forEach(lid => { CHECKLIST_ITEMS[lid] = (CHECKLIST_ITEMS[lid] || []).filter(i => i.id !== itemId); }); renderChecklistSettingsItems(currentListIdForRender); alertUser && alertUser('Eintrag gelöscht (lokal).', 'success'); } } catch (err) { console.error('Fehler beim Löschen:', err); alertUser && alertUser('Fehler beim Löschen.', 'error'); } return;
      }
    });
    itemsEditor.dataset.listenerAttached = 'true'; // Markieren
    console.log("Items-Editor-Listener angehängt."); // Debug
  }

  // --- Buttons für Archiv/Papierkorb Modals ---
   const showArchivedBtn = view.querySelector('#show-archived-lists-btn');
   if (showArchivedBtn && !showArchivedBtn.dataset.listenerAttached) {
       showArchivedBtn.addEventListener('click', () => {
           console.log("Archiv anzeigen geklickt."); // Debug
           try { renderArchivedListsModal && renderArchivedListsModal(); document.getElementById('archivedListsModal') && (document.getElementById('archivedListsModal').style.display = 'flex'); } catch(e){console.error(e);}
       });
       showArchivedBtn.dataset.listenerAttached = 'true';
       console.log("ShowArchived-Button-Listener angehängt."); // Debug
   }
   const showDeletedBtn = view.querySelector('#show-deleted-lists-btn');
   if (showDeletedBtn && !showDeletedBtn.dataset.listenerAttached) {
       showDeletedBtn.addEventListener('click', () => {
           console.log("Papierkorb anzeigen geklickt."); // Debug
           try { renderDeletedListsModal && renderDeletedListsModal(); document.getElementById('deletedListsModal') && (document.getElementById('deletedListsModal').style.display = 'flex'); } catch(e){console.error(e);}
       });
       showDeletedBtn.dataset.listenerAttached = 'true';
       console.log("ShowDeleted-Button-Listener angehängt."); // Debug
   }

  // --- Neue Liste erstellen ---
  const createListBtn = view.querySelector('#checklist-settings-create-list-btn');
   if (createListBtn && !createListBtn.dataset.listenerAttached) {
       createListBtn.addEventListener('click', async () => {
         console.log("Neue Liste erstellen geklickt.");
         const nameInput = view.querySelector('#checklist-settings-new-name'); const groupSelector = view.querySelector('#checklist-settings-new-group-selector'); if(!nameInput || !groupSelector) return; const name = nameInput.value.trim(); const groupId = groupSelector.value; if (!name || !groupId) return alertUser && alertUser('Name/Gruppe angeben.', 'error');
         try { if (typeof addDoc === 'function' && checklistsCollectionRef) { const docRef = await addDoc(checklistsCollectionRef, { name, isDeleted: false, isArchived: false, groupId, groupName: CHECKLIST_GROUPS[groupId]?.name || null }); nameInput.value = ''; groupSelector.value = ''; alertUser && alertUser(`Liste "${name}" erstellt.`, 'success'); renderChecklistSettingsView(docRef?.id || null); } else { const id = String(Date.now()); CHECKLISTS[id] = { id, name, groupId, groupName: CHECKLIST_GROUPS[groupId]?.name || null, isDeleted: false, isArchived: false }; alertUser && alertUser('Liste erstellt (lokal).', 'success'); renderChecklistSettingsView(id); } } catch (err) { console.error('Fehler:', err); alertUser && alertUser('Fehler.', 'error'); }
       });
       createListBtn.dataset.listenerAttached = 'true';
       console.log("CreateList-Button-Listener angehängt."); // Debug
   }
} // Ende setupListAndItemManagementListeners


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
function setupStackAndContainerManagementListeners(view) {
    if (!view) {
        console.error("setupStackAndContainerManagementListeners: 'view' wurde nicht übergeben.");
        return;
    }
    const templatesCard = view.querySelector('#card-templates');
    if (!templatesCard) {
         console.error("setupStackAndContainerManagementListeners: Konnte #card-templates nicht finden.");
         return;
    }

    // --- NEUE PRÜFUNG ---
    // Prüfen, ob das Attribut direkt existiert
    if (templatesCard.hasAttribute('data-primary-listener-attached')) {
        console.log("setupStackAndContainerManagementListeners: Listener bereits vorhanden (via Attribut-Check), breche ab.");
        return; // Verhindert doppelte Listener zuverlässiger
    }
    // Attribut setzen, um zu markieren
    templatesCard.setAttribute('data-primary-listener-attached', 'true');
    // --- ENDE NEUE PRÜFUNG ---

    console.log("setupStackAndContainerManagementListeners: Hänge PRIMÄREN Listener an #card-templates an.");

    templatesCard.addEventListener('click', async (e) => {
        // Der Rest der Funktion bleibt genau gleich wie in der letzten Version
        // ... (Logik für Stack erstellen, Stack löschen, Container erstellen, Container auswählen, Stack zuweisen, Eintrag hinzufügen, Container löschen) ...

        // --- Aktionen AUSSERHALB des Editors ---

        // Neues Stack erstellen
        if (e.target.closest('#checklist-settings-create-stack-btn')) {
            console.log("... Klick auf Stack erstellen verarbeitet.");
            const nameInput = view.querySelector('#checklist-settings-new-stack-name');
            if (!nameInput) return;
            const newName = (nameInput.value || '').trim();
            if (!newName) return alertUser && alertUser('Bitte Namen eingeben.', 'error');
            try {
                if (typeof addDoc === 'function' && checklistStacksCollectionRef) {
                    await addDoc(checklistStacksCollectionRef, { name: newName });
                } else { throw new Error("addDoc oder checklistStacksCollectionRef fehlt"); }
                nameInput.value = '';
                if (typeof alertUser === 'function') alertUser('Stack erstellt.', 'success');
            } catch (err) {
                console.error('Fehler beim Erstellen des Stacks:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Erstellen des Stacks.', 'error');
            }
            return;
        }

        // Button zum Anzeigen/Verstecken des Lösch-Bereichs
        if (e.target.closest('#show-delete-stack-form-btn')) {
            console.log("... Klick auf 'Stack löschen...' Button verarbeitet.");
            const deleteSection = view.querySelector('#delete-stack-section');
            if (deleteSection) {
                deleteSection.classList.toggle('hidden');
                 if (!deleteSection.classList.contains('hidden')) {
                     const deleteStackSelector = view.querySelector('#delete-stack-selector');
                     if (deleteStackSelector) {
                         const stackOpts = Object.values(CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
                         deleteStackSelector.innerHTML = `<option value="">Stack zum Löschen auswählen...</option>` + stackOpts;
                     }
                 }
            }
            return;
        }

        // Stack löschen (im roten Bereich)
        if (e.target.closest('#delete-stack-btn')) {
            console.log("... Klick auf Stack löschen (roter Button) verarbeitet.");
            const selector = view.querySelector('#delete-stack-selector');
            const stackIdToDelete = selector ? selector.value : null;

            if (!stackIdToDelete) {
                return alertUser && alertUser("Bitte zuerst einen Stack zum Löschen auswählen.", "warning");
            }

            const containersInStack = Object.values(TEMPLATES || {}).filter(t => t.stackId === stackIdToDelete);
            if (containersInStack.length > 0) {
                 return alertUser && alertUser(`Der Stack "${CHECKLIST_STACKS[stackIdToDelete]?.name || 'Unbekannt'}" kann nicht gelöscht werden, da er noch ${containersInStack.length} Container enthält. Bitte verschieben oder löschen Sie diese zuerst.`, "error");
            }

            if (confirm(`Möchten Sie den leeren Stack "${CHECKLIST_STACKS[stackIdToDelete]?.name || 'Unbekannt'}" wirklich unwiderruflich löschen?`)) {
                try {
                    if (!checklistStacksCollectionRef) throw new Error("checklistStacksCollectionRef ist nicht definiert!");
                    const stackRef = doc(checklistStacksCollectionRef, stackIdToDelete);
                    await deleteDoc(stackRef);
                    alertUser && alertUser("Stack gelöscht.", "success");
                    view.querySelector('#delete-stack-section')?.classList.add('hidden');
                } catch (err) {
                     console.error("Fehler beim Löschen des Stacks:", err);
                     alertUser && alertUser(`Fehler beim Löschen des Stacks: ${err.message}`, "error");
                }
            }
            return;
        }


        // Neues Container erstellen
        if (e.target.closest('#checklist-settings-create-container-btn')) {
             console.log("... Klick auf Container erstellen verarbeitet.");
            const newName = view.querySelector('#checklist-settings-new-container-name')?.value.trim();
            const stackId = view.querySelector('#checklist-settings-new-stack-selector')?.value;
            if (!newName) return alertUser && alertUser('Bitte Containername eingeben.', 'error');
            if (!stackId) return alertUser && alertUser('Bitte Stack wählen.', 'error');
            try {
                if (typeof addDoc === 'function' && checklistTemplatesCollectionRef) {
                    await addDoc(checklistTemplatesCollectionRef, { name: newName, stackId, stackName: CHECKLIST_STACKS[stackId]?.name || null, createdAt: serverTimestamp ? serverTimestamp() : null });
                } else { throw new Error("addDoc oder checklistTemplatesCollectionRef fehlt"); }
                view.querySelector('#checklist-settings-new-container-name').value = '';
                view.querySelector('#checklist-settings-new-stack-selector').value = '';
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

             if (selectedTemplateId === clickedTemplateId) {
                 selectedTemplateId = null;
                 editor.classList.add('hidden');
                 if (typeof unsubscribeTemplateItems === 'function') unsubscribeTemplateItems();
             } else {
                 selectedTemplateId = clickedTemplateId;
                 document.getElementById('template-editor-title').textContent = `Einträge für Container "${TEMPLATES[selectedTemplateId]?.name || '–'}"`;
                 editor.classList.remove('hidden');
                 if (typeof unsubscribeTemplateItems === 'function') unsubscribeTemplateItems();
                 if (typeof onSnapshot === 'function' && checklistTemplatesCollectionRef) {
                     const itemsSubCollectionRef = collection(checklistTemplatesCollectionRef, selectedTemplateId, 'template-items');
                     unsubscribeTemplateItems = onSnapshot(query(itemsSubCollectionRef, orderBy('text')), (snapshot) => {
                         TEMPLATE_ITEMS[selectedTemplateId] = [];
                         snapshot.forEach(doc => TEMPLATE_ITEMS[selectedTemplateId].push({ id: doc.id, ...doc.data() }));
                         renderTemplateItemsEditor();
                     }, console.error);
                 }
             }
             renderContainerList();
             return;
         }

        // Stack-Zuweisung ändern (Knopf "ändern")
        if (e.target.closest('.change-stack-btn')) {
             console.log("... Klick auf Stack-Zuweisung ändern verarbeitet.");
            const cid = e.target.closest('.change-stack-btn').dataset.containerId;
            document.getElementById(`stack-display-container-${cid}`)?.classList.add('hidden');
            document.getElementById(`stack-edit-container-${cid}`)?.classList.remove('hidden');
            return;
        }
        // Stack-Zuweisung speichern (Knopf "Speichern")
        if (e.target.closest('.save-stack-assignment-btn')) {
             console.log("... Klick auf Stack-Zuweisung speichern verarbeitet.");
            const cid = e.target.closest('.save-stack-assignment-btn').dataset.containerId;
            const editContainer = document.getElementById(`stack-edit-container-${cid}`);
            const newStackId = editContainer?.querySelector('.stack-assign-switcher')?.value || null;
            try {
                if (typeof updateDoc === 'function' && checklistTemplatesCollectionRef) {
                    await updateDoc(doc(checklistTemplatesCollectionRef, cid), { stackId: newStackId || null, stackName: newStackId ? CHECKLIST_STACKS[newStackId]?.name : null });
                } else { throw new Error("updateDoc oder checklistTemplatesCollectionRef fehlt"); }
                if (typeof alertUser === 'function') alertUser('Stack-Zuweisung gespeichert.', 'success');
                 renderContainerList();
            } catch (err) {
                console.error('Fehler beim Speichern der Stack-Zuweisung:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Speichern.', 'error');
            }
            return;
        }

        // --- Aktionen INNERHALB des Editors ---

        // "+ Eintrag hinzufügen" Button im Editor
        if (e.target.closest('#add-template-item-btn') && selectedTemplateId) {
             console.log("... Klick auf '+ Eintrag hinzufügen' (im Editor) verarbeitet.");
            const textInput = document.getElementById('new-template-item-text');
            const assigneeSelect = document.getElementById('new-template-item-assignee');
            const categorySelect = document.getElementById('new-template-item-category');
            const importantCheckbox = document.getElementById('new-template-item-important');
            if (!textInput || !assigneeSelect || !categorySelect || !importantCheckbox) {
                console.error("Fehler: Elemente zum Hinzufügen von Template-Items nicht gefunden.");
                return alertUser("Fehler: UI-Elemente nicht gefunden.", "error");
            }
            const text = textInput.value.trim();
            if (!text) return alertUser("Bitte Text eingeben.", "error");
            const assignedTo = assigneeSelect.value;
            const assignedToName = assignedTo ? assigneeSelect.options[assigneeSelect.selectedIndex].text : null;
            const categoryId = categorySelect.value;
            const categoryName = categoryId ? categorySelect.options[categorySelect.selectedIndex].text : null;
            const newItemData = { text, important: importantCheckbox.checked, assignedTo: assignedTo || null, assignedToName, categoryId: categoryId || null, categoryName };
            try {
                const itemsSubCollectionRef = collection(checklistTemplatesCollectionRef, selectedTemplateId, 'template-items');
                await addDoc(itemsSubCollectionRef, newItemData);
                textInput.value = '';
                assigneeSelect.value = '';
                categorySelect.value = '';
                importantCheckbox.checked = false;
                textInput.focus();
            } catch (err) {
                 console.error("Fehler beim Hinzufügen des Template-Items:", err);
                 alertUser("Fehler beim Hinzufügen des Eintrags.", "error");
            }
            return;
        }

        // "Diesen Container löschen" Button im Editor
        const deleteTemplateBtn = e.target.closest('#delete-template-btn');
        if (deleteTemplateBtn && selectedTemplateId) {
             console.log("... Klick auf 'Diesen Container löschen' (im Editor) verarbeitet.");
            const containerName = TEMPLATES[selectedTemplateId]?.name || 'Unbekannt';
            if (confirm(`Möchten Sie den Container "${containerName}" wirklich unwiderruflich löschen?`)) {
                const idToDelete = selectedTemplateId;
                try {
                    if (!checklistTemplatesCollectionRef) throw new Error("checklistTemplatesCollectionRef ist nicht definiert!");
                    const templateRef = doc(checklistTemplatesCollectionRef, idToDelete);
                    await deleteDoc(templateRef);
                    alertUser && alertUser('Container gelöscht.', 'success');
                    selectedTemplateId = null;
                    if (unsubscribeTemplateItems) unsubscribeTemplateItems();
                    renderChecklistSettingsView();
                } catch (err) {
                    console.error("Fehler beim Löschen des Containers:", err);
                    alertUser && alertUser(`Fehler beim Löschen: ${err.message}. (Internet/Berechtigungen prüfen)`, 'error');
                }
            }
            return;
        }

        console.log("setupStackAndContainerManagementListeners: Klick wurde vom primären Listener erkannt, aber keiner der spezifischen Fälle passte.");

    }); // Ende addEventListener für templatesCard
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

  const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

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
            <h4 class="font-bold text-gray-800">Neuen Stack erstellen</h4>
            <button id="show-delete-stack-form-btn" class="text-xs text-red-600 font-semibold hover:underline">Stack löschen...</button>
        </div>
        <div class="flex gap-2">
          <input type="text" id="checklist-settings-new-stack-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neuen Stack...">
          <button id="checklist-settings-create-stack-btn" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Erstellen</button>
        </div>
        </div>

      <div id="delete-stack-section" class="hidden p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
        <h4 class="font-bold text-red-800">Stack löschen</h4>
        <p class="text-xs text-red-700">Hinweis: Ein Stack kann nur gelöscht werden, wenn keine Container mehr darin enthalten sind.</p>
        <select id="delete-stack-selector" class="w-full p-2 border rounded-lg bg-white border-red-300">
            <option value="">Stack zum Löschen auswählen...</option>
            ${Object.values(CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <button id="delete-stack-btn" class="w-full py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700">Ausgewählten Stack löschen</button>
      </div>
      <div class="p-3 bg-gray-50 rounded-lg space-y-2">
        <h4 class="font-bold text-gray-800">Neuen Container erstellen</h4>
        <input type="text" id="checklist-settings-new-container-name" class="w-full p-2 border rounded-lg" placeholder="Name für neuen Container...">
        <select id="checklist-settings-new-stack-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Stack zuweisen...</option></select>
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

  const stackSelector = view.querySelector('#checklist-settings-new-stack-selector');
  if (stackSelector) {
      const stackOpts = Object.values(CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      stackSelector.innerHTML = `<option value="">Stack wählen...</option>` + stackOpts;
  }
  const deleteStackSelector = view.querySelector('#delete-stack-selector');
  if (deleteStackSelector) {
        const stackOpts = Object.values(CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        deleteStackSelector.innerHTML = `<option value="">Stack zum Löschen auswählen...</option>` + stackOpts;
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
  if (typeof setupStackAndContainerManagementListeners === 'function') {
      setupStackAndContainerManagementListeners(view);
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

function renderChecklistSettingsView(editListId = null) {
  const view = document.getElementById('checklistSettingsView');
  if (!view) return;

  // --- Listener-Marker entfernen ---
  view.querySelector('#checklist-archive-list-btn')?.removeAttribute('data-listener-attached');
  view.querySelector('#checklist-settings-add-item-btn')?.removeAttribute('data-listener-attached');
  view.querySelector('#checklist-settings-add-text')?.removeAttribute('data-listener-attached');
  view.querySelector('#checklist-items-editor-container')?.removeAttribute('data-listener-attached');
  view.querySelector('#show-archived-lists-btn')?.removeAttribute('data-listener-attached');
  view.querySelector('#show-deleted-lists-btn')?.removeAttribute('data-listener-attached');
  view.querySelector('#checklist-settings-create-list-btn')?.removeAttribute('data-listener-attached');
  view.querySelector('#checklist-settings-editor-switcher')?.removeAttribute('data-listener-attached');
  view.querySelector('#category-group-selector')?.removeAttribute('data-listener-attached');
  view.querySelector('#default-group-selector')?.removeAttribute('data-listener-attached');
  view.querySelector('#save-default-checklist-btn')?.removeAttribute('data-listener-attached');
  view.querySelector('#edit-group-assignment-btn')?.removeAttribute('data-listener-attached');
  view.querySelector('#checklist-save-group-assignment')?.removeAttribute('data-listener-attached');
  const templatesCard = view.querySelector('#card-templates');
  if (templatesCard) templatesCard.removeAttribute('data-primary-listener-attached');
  delete view.dataset.tabListenersAttached; // Wichtig für die Tabs

  // console.log("renderChecklistSettingsView: Starte Neuaufbau, ALLE Listener-Marker entfernt."); // Debug entfernt

  window.currentUser = window.currentUser || { id: null, name: 'Gast', permissions: [] };
  window.adminSettings = window.adminSettings || {};

  // --- FIX 1: listToEditId korrekt bestimmen ---
  const activeListsObj = CHECKLISTS || {}; // Verwende das globale Objekt
  const hasLists = Object.keys(activeListsObj).length > 0; // Nur hier definieren
  const defaultListId = adminSettings.defaultChecklistId || null; // Bleibt unverändert
  const validEditListId = (editListId && activeListsObj[editListId]) ? editListId : null;
  let listToEditId = validEditListId || view.dataset.editingListId || (hasLists ? Object.keys(activeListsObj)[0] : null);
  // Erneut prüfen und ggf. auf null setzen
  if (listToEditId && !activeListsObj[listToEditId]) {
      listToEditId = hasLists ? Object.keys(activeListsObj)[0] : null; // Fallback zur ersten aktiven oder null
  }
  // Explizit null setzen, wenn keine Listen da sind
  if (!hasLists) {
      listToEditId = null;
  }
  view.dataset.editingListId = listToEditId || ''; // Korrekten Wert im dataset speichern
  // --- ENDE FIX 1 ---

  const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

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
            <h4 class="font-bold text-gray-800">Neuen Stack erstellen</h4>
            <button id="show-delete-stack-form-btn" class="text-xs text-red-600 font-semibold hover:underline">Stack löschen...</button>
        </div>
        <div class="flex gap-2">
          <input type="text" id="checklist-settings-new-stack-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neuen Stack...">
          <button id="checklist-settings-create-stack-btn" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Erstellen</button>
        </div>
        </div>

      <div id="delete-stack-section" class="hidden p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
        <h4 class="font-bold text-red-800">Stack löschen</h4>
        <p class="text-xs text-red-700">Hinweis: Ein Stack kann nur gelöscht werden, wenn keine Container mehr darin enthalten sind.</p>
        <select id="delete-stack-selector" class="w-full p-2 border rounded-lg bg-white border-red-300">
            <option value="">Stack zum Löschen auswählen...</option>
            ${Object.values(CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}
        </select>
        <button id="delete-stack-btn" class="w-full py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700">Ausgewählten Stack löschen</button>
      </div>
      <div class="p-3 bg-gray-50 rounded-lg space-y-2">
        <h4 class="font-bold text-gray-800">Neuen Container erstellen</h4>
        <input type="text" id="checklist-settings-new-container-name" class="w-full p-2 border rounded-lg" placeholder="Name für neuen Container...">
        <select id="checklist-settings-new-stack-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Stack zuweisen...</option></select>
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

  const stackSelector = view.querySelector('#checklist-settings-new-stack-selector');
  if (stackSelector) {
      const stackOpts = Object.values(CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
      stackSelector.innerHTML = `<option value="">Stack wählen...</option>` + stackOpts;
  }
  const deleteStackSelector = view.querySelector('#delete-stack-selector');
  if (deleteStackSelector) {
        const stackOpts = Object.values(CHECKLIST_STACKS || {}).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        deleteStackSelector.innerHTML = `<option value="">Stack zum Löschen auswählen...</option>` + stackOpts;
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
  if (typeof setupStackAndContainerManagementListeners === 'function') {
      setupStackAndContainerManagementListeners(view);
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

// Ersetze DIESE Funktion komplett
function setupTemplateEditorListeners() {
    // Dieser Listener ist NICHT mehr für Klicks IM EDITOR zuständig.
    // Das übernimmt jetzt setupStackAndContainerManagementListeners.

    // Wir brauchen aber weiterhin Listener für die MODAL-Buttons.
    // Sicherstellen, dass die Modal-Listener nur einmal hinzugefügt werden.
    const modal = document.getElementById('templateApplyModal');
    if (modal && !modal.dataset.modalListenersAttached) {
        console.log("setupTemplateEditorListeners: Hänge Listener an Modal-Buttons an."); // Debugging
        document.getElementById('closeTemplateModalBtn')?.addEventListener('click', closeTemplateModal);
        document.getElementById('cancel-template-modal-btn')?.addEventListener('click', closeTemplateModal);
        document.getElementById('apply-template-btn')?.addEventListener('click', applyTemplateLogic);
        modal.dataset.modalListenersAttached = 'true';
    } else if (modal && modal.dataset.modalListenersAttached === 'true') {
        // console.log("setupTemplateEditorListeners: Modal-Listener bereits angehängt."); // Optional: Zur Bestätigung
    } else {
        console.warn("setupTemplateEditorListeners: Konnte Modal #templateApplyModal nicht finden, um Listener anzuhängen."); // Warnung
    }
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
                </div>
        `;
    });
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
