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

// ENDE-ZIKA //

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

function renderContainerList() {
    const editorDiv = document.getElementById('container-list-editor');
    if (!editorDiv) return;
    editorDiv.innerHTML = `<h3 class="font-bold text-gray-800 mb-2 mt-6">Bestehende Container verwalten</h3>`;

    const stacks = Object.values(CHECKLIST_STACKS || {});
    const containers = Object.values(TEMPLATES || {});
    const stackOptions = `<option value="">Keinen Stack zuweisen</option>` + stacks.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    if (stacks.length === 0 && containers.length === 0) {
        editorDiv.innerHTML += `<p class="text-sm text-center text-gray-500">Keine Container oder Stacks vorhanden.</p>`;
        return;
    }

    const createContainerItemHTML = (container) => {
        const currentStackName = container.stackName || "Kein Stack zugewiesen";
        return `
            <div data-template-id="${container.id}" class="template-selection-item p-2 border rounded-md bg-white cursor-pointer hover:bg-gray-100">
                <p class="font-semibold">${container.name}</p>
                <div class="mt-2 p-2 bg-gray-50 rounded-lg">
                    <div id="stack-display-container-${container.id}" class="flex justify-between items-center">
                        <p class="text-sm">Aktueller Stack: <span class="font-bold text-teal-800">${currentStackName}</span></p>
                        <button data-container-id="${container.id}" class="change-stack-btn text-sm font-semibold text-blue-600 hover:underline">ändern</button>
                    </div>
                    <div id="stack-edit-container-${container.id}" class="hidden flex gap-2 items-center">
                        <select class="stack-assign-switcher flex-grow p-1 border rounded-lg bg-white text-sm">${stackOptions}</select>
                        <button data-container-id="${container.id}" class="save-stack-assignment-btn py-1 px-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 text-xs">Speichern</button>
                    </div>
                </div>
            </div>
        `;
    };

    // Gruppiert nach Stack
    stacks.forEach(stack => {
        const containersInStack = containers.filter(c => c.stackId === stack.id);
        if (containersInStack.length > 0) {
            editorDiv.innerHTML += `<h4 class="font-semibold text-sm text-gray-600 mt-4 mb-1">${stack.name}</h4>`;
            containersInStack.forEach(container => editorDiv.innerHTML += createContainerItemHTML(container));
        }
    });

    const containersWithoutStack = containers.filter(c => !c.stackId);
    if (containersWithoutStack.length > 0) {
        editorDiv.innerHTML += `<h4 class="font-semibold text-sm text-gray-600 mt-4 mb-1">Ohne Stack</h4>`;
        containersWithoutStack.forEach(container => editorDiv.innerHTML += createContainerItemHTML(container));
    }
}

async function applyTemplateLogic() {
    const modal = document.getElementById('templateApplyModal');
    if (!modal) return console.warn('applyTemplateLogic: modal fehlt');
    const targetListId = modal.dataset.targetListId;
    if (!targetListId) {
        if (typeof alertUser === 'function') alertUser('Fehler: Keine Ziel-Checkliste angegeben.', 'error');
        return;
    }

    const applyBtn = document.getElementById('apply-template-btn');
    applyBtn && (applyBtn.disabled = true);

    try {
        const selectedType = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
        const insertMode = modal.querySelector('input[name="insert-mode"]:checked')?.value || 'append';
        const selectedItems = Array.from(modal.querySelectorAll('.template-item-cb:checked'));
        if (selectedItems.length === 0) {
            if (typeof alertUser === 'function') alertUser('Bitte wählen Sie mindestens einen Eintrag.', 'error');
            return;
        }

        // optionales Ersetzen
        if (selectedType === 'Schiff' && insertMode === 'ersetzen') {
            if (typeof query === 'function' && typeof getDocs === 'function' && typeof writeBatch === 'function') {
                try {
                    const q = query(checklistItemsCollectionRef, where('listId', '==', targetListId));
                    const snap = await getDocs(q);
                    if (snap && snap.size > 0) {
                        const batch = writeBatch(db);
                        snap.forEach(s => batch.delete(s.ref));
                        await batch.commit();
                    }
                } catch (err) {
                    console.warn('applyTemplateLogic: Fehler beim Löschen vorhandener Einträge', err);
                }
            }
        }

        // Einfügen
        for (const cb of selectedItems) {
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
                addedBy: (window.currentUser?.displayName) || 'Unbekannt',
                addedAt: (typeof serverTimestamp === 'function' ? serverTimestamp() : null)
            };
            if (typeof addDoc === 'function') {
                await addDoc(checklistItemsCollectionRef, data);
            } else {
                // Fallback: lokal
                CHECKLIST_ITEMS[targetListId] = CHECKLIST_ITEMS[targetListId] || [];
                CHECKLIST_ITEMS[targetListId].push({ id: Date.now(), ...data });
            }
        }

        if (typeof alertUser === 'function') alertUser(`${selectedItems.length} Einträge hinzugefügt.`, 'success');
        closeTemplateModal();
    } catch (err) {
        console.error('applyTemplateLogic error:', err);
        if (typeof alertUser === 'function') alertUser('Fehler beim Anwenden der Vorlage.', 'error');
    } finally {
        applyBtn && (applyBtn.disabled = false);
    }
}

export function listenForTemplates() {
    const templatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates');
    onSnapshot(query(templatesCollectionRef, orderBy('name')), (snapshot) => {
        Object.assign(TEMPLATES, {});
        snapshot.forEach((doc) => {
            TEMPLATES[doc.id] = { id: doc.id, ...doc.data() };
        });

        const settingsView = document.getElementById('checklistSettingsView');
        if (settingsView.classList.contains('active')) {
            const activeTab = settingsView.querySelector('#settings-tabs .settings-tab-btn.bg-white');
            if (activeTab && activeTab.dataset.targetCard === 'card-templates') {
                renderContainerList(); // Ruft nur die Funktion zum Neuzeichnen der Container-Liste auf
            }
        }
    });
}

export function listenForChecklists() {
    onSnapshot(query(checklistsCollectionRef, orderBy('name')), (snapshot) => {
        const oldChecklists = { ...CHECKLISTS };
        Object.assign(CHECKLISTS, {}); // Ersetzt den Inhalt, nicht die Variable
        Object.assign(ARCHIVED_CHECKLISTS, {});
        Object.assign(DELETED_CHECKLISTS, {});
        snapshot.forEach((doc) => {
            const list = { id: doc.id, ...doc.data() };
            if (list.isDeleted) {
                DELETED_CHECKLISTS[doc.id] = list;
            } else if (list.isArchived) {
                ARCHIVED_CHECKLISTS[doc.id] = list;
            } else {
                CHECKLISTS[doc.id] = list;
            }
        });

        const deletedListIds = Object.keys(oldChecklists).filter(id => !CHECKLISTS[id] && !ARCHIVED_CHECKLISTS[id]);
        if (deletedListIds.length > 0) {
            const currentUserData = USERS[currentUser.mode] || {};
            if (deletedListIds.includes(currentUserData.defaultChecklistId)) {
                updateDoc(doc(usersCollectionRef, currentUser.mode), { defaultChecklistId: null });
            }
        }

        if (Object.keys(CHECKLIST_GROUPS).length > 0 && Object.keys(CHECKLIST_CATEGORIES).length > 0) {
            const activeTab = settingsView.querySelector('#settings-tabs .settings-tab-btn.bg-white');
            const activeTabId = activeTab ? activeTab.dataset.targetCard : null;

            // === START: KORRIGIERTE LOGIK ===
            // Diese neue Logik behebt das Problem der "Geister-Einträge".

            const currentlyEditingId = settingsView.dataset.editingListId;
            let nextListToEditId = null;

            // 1. Prüfen, ob die Liste, die gerade bearbeitet wurde, noch existiert.
            if (currentlyEditingId && CHECKLISTS[currentlyEditingId]) {
                // Wenn ja, bleiben wir bei dieser Liste.
                nextListToEditId = currentlyEditingId;
            } else {
                // 2. Wenn sie archiviert/gelöscht wurde, wählen wir die erste verfügbare, aktive Liste als neuen Standard.
                nextListToEditId = Object.keys(CHECKLISTS).length > 0 ? Object.keys(CHECKLISTS)[0] : null;
            }

            // 3. Wir rufen die Render-Funktion explizit mit der korrekten neuen Listen-ID auf.
            renderChecklistSettingsView(nextListToEditId);

            // === ENDE: KORRIGIERTE LOGIK ===

            if (activeTabId) {
                const tabToReactivate = settingsView.querySelector(`button[data-target-card="${activeTabId}"]`);
                if (tabToReactivate) tabToReactivate.click();
            }
        }

        if (document.getElementById('checklistView').classList.contains('active')) {
            const listId = document.getElementById('checklistView').dataset.currentListId;
            // Prüfen, ob die angezeigte Liste noch aktiv ist, sonst zur ersten verfügbaren wechseln
            if (CHECKLISTS[listId]) {
                renderChecklistView(listId);
            } else {
                const fallbackListId = Object.keys(CHECKLISTS).length > 0 ? Object.keys(CHECKLISTS)[0] : null;
                renderChecklistView(fallbackListId);
            }
        }
        if (document.getElementById('deletedListsModal').style.display === 'flex') {
            renderDeletedListsModal();
        }
        if (document.getElementById('archivedListsModal').style.display === 'flex') {
            renderArchivedListsModal();
        }

        updateUIForMode();
    });
}

export function listenForChecklistGroups() {
    onSnapshot(query(checklistGroupsCollectionRef, orderBy('name')), (snapshot) => {
        Object.assign(CHECKLIST_GROUPS, {});
        snapshot.forEach((doc) => {
            CHECKLIST_GROUPS[doc.id] = { id: doc.id, ...doc.data() };
        });

        // NEU: Merkt sich den aktiven Tab und stellt ihn wieder her
        const settingsView = document.getElementById('checklistSettingsView');
        if (settingsView.classList.contains('active')) {
            const activeTab = settingsView.querySelector('#settings-tabs .settings-tab-btn.bg-white');
            const activeTabId = activeTab ? activeTab.dataset.targetCard : null;
            renderChecklistSettingsView();
            if (activeTabId) {
                const tabToReactivate = settingsView.querySelector(`button[data-target-card="${activeTabId}"]`);
                if (tabToReactivate) tabToReactivate.click();
            }
        }
    });
}

export function listenForChecklistCategories() {
    onSnapshot(query(checklistCategoriesCollectionRef, orderBy('name')), (snapshot) => {
        Object.assign(CHECKLIST_CATEGORIES, {});
        snapshot.forEach((doc) => {
            const category = { id: doc.id, ...doc.data() };
            if (!category.groupId) return;
            if (!CHECKLIST_CATEGORIES[category.groupId]) {
                CHECKLIST_CATEGORIES[category.groupId] = [];
            }
            CHECKLIST_CATEGORIES[category.groupId].push(category);
        });

        // Prüft, ob die Einstellungs-Ansicht überhaupt geöffnet ist
        const settingsView = document.getElementById('checklistSettingsView');
        if (settingsView.classList.contains('active')) {

            // 1. Aktualisiert die Kategorie-Verwaltungsansicht selbst (wie bisher)
            const categoriesCard = settingsView.querySelector('#card-categories');
            if (categoriesCard && !categoriesCard.classList.contains('hidden')) {
                const groupId = settingsView.querySelector('#category-group-selector')?.value;
                renderCategoryEditor(groupId);
            }

            // 2. NEU: Ruft unsere Hilfsfunktion auf, um alle anderen Dropdowns zu aktualisieren
            updateCategoryDropdowns();
        }
    });
}

export function listenForChecklistItems() {
    onSnapshot(query(checklistItemsCollectionRef, orderBy('addedAt')), (snapshot) => {
        // NEU: Lädt immer alle Einträge. Die Filterung geschieht erst bei der Anzeige.
        Object.assign(CHECKLIST_ITEMS, {});
        snapshot.forEach((doc) => {
            const item = { id: doc.id, ...doc.data() };
            if (!CHECKLIST_ITEMS[item.listId]) {
                CHECKLIST_ITEMS[item.listId] = [];
            }
            CHECKLIST_ITEMS[item.listId].push(item);
        });

        // Aktualisiert die Ansichten, die von der Eintrags-Änderung betroffen sind
        if (document.getElementById('checklistView').classList.contains('active')) {
            const listId = document.getElementById('checklistView').dataset.currentListId;
            if (listId) renderChecklistItems(listId);
        }
        if (document.getElementById('checklistSettingsView').classList.contains('active')) {
            const listId = document.getElementById('checklistSettingsView').dataset.editingListId;
            if (listId) renderChecklistSettingsItems(listId);
        }
    });
}

export function renderChecklistItems(listId) {
    const view = document.getElementById('checklistView');
    if (!view) return;
    const items = (typeof CHECKLIST_ITEMS !== 'undefined' && CHECKLIST_ITEMS[listId]) ? CHECKLIST_ITEMS[listId] : [];
    const filterTextEl = view.querySelector('#checklist-filter-text');
    const filterStatusEl = view.querySelector('#checklist-filter-status');
    const filterText = (filterTextEl?.value || '').toLowerCase();
    const filterStatus = filterStatusEl?.value || 'all';

    const itemsWithIndex = items.map((item, index) => ({ ...item, originalIndex: index }));
    const filtered = itemsWithIndex.filter(item => {
        const itemIdStr = String(item.originalIndex + 1);
        const matchesText = filterText === '' || (item.text || '').toLowerCase().includes(filterText) || itemIdStr.includes(filterText);
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
    const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    const statsEl = view.querySelector('#checklist-stats');
    if (statsEl) statsEl.innerHTML = `${doneCount} von ${total} erledigt - Noch ${openCount} offen (${percentage}%)`;

    const openItemsContainer = view.querySelector('#checklist-items-container');
    const doneItemsContainer = view.querySelector('#checklist-done-items-container');

    if (!openItemsContainer) return;

    openItemsContainer.innerHTML = '';
    doneItemsContainer && (doneItemsContainer.innerHTML = '');

    const renderItemHTML = (item) => {
        const importantClass = item.important ? 'bg-yellow-50 border-l-4 border-yellow-400' : 'bg-white';
        return `
            <div class="${importantClass} p-2 rounded-lg shadow-sm flex flex-col gap-1" data-item-id="${item.id}">
                <div class="flex items-start gap-2.5">
                    <span class="text-xs font-bold text-gray-400 pt-1">${item.originalIndex + 1}.</span>
                    <input type="checkbox" data-item-id="${item.id}" class="checklist-item-cb h-5 w-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-0.5 flex-shrink-0" ${item.status === 'done' ? 'checked' : ''}>
                    <div class="flex-grow">
                        <label class="text-sm">${item.text || ''}</label>
                        ${item.lastActionBy && item.lastActionAt ? `<p class="text-xs text-gray-400">${item.lastActionBy} (${(item.lastActionAt && item.lastActionAt.toDate) ? item.lastActionAt.toDate().toLocaleString() : ''})</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    };

    openItems.forEach(item => openItemsContainer.innerHTML += renderItemHTML(item));
    if (doneItemsContainer) {
        if (doneItems.length > 0) {
            view.querySelector('#checklist-done-section')?.classList.remove('hidden');
            doneItemsContainer.innerHTML = doneItems.map(item => renderItemHTML(item)).join('');
        } else {
            view.querySelector('#checklist-done-section')?.classList.add('hidden');
        }
    }

    // Delegierter Listener (einmalig) für Checkbox-Änderungen
    if (!openItemsContainer.dataset.listenerAttached) {
        openItemsContainer.addEventListener('change', async (e) => {
            const cb = e.target.closest('.checklist-item-cb');
            if (!cb) return;
            const itemId = cb.dataset.itemId;
            const isChecked = cb.checked;
            // Defensive checks
            if (!itemId) return;
            try {
                // Update in DB wenn verfügbar
                if (typeof updateDoc === 'function' && typeof doc === 'function' && typeof checklistItemsCollectionRef !== 'undefined') {
                    await updateDoc(doc(checklistItemsCollectionRef, itemId), {
                        status: isChecked ? 'done' : 'open',
                        lastActionBy: (window.currentUser && window.currentUser.displayName) ? window.currentUser.displayName : 'System',
                        lastActionAt: typeof serverTimestamp === 'function' ? serverTimestamp() : null
                    });
                } else {
                    // Fallback: update local cache (useful for testing without DB)
                    const local = (CHECKLIST_ITEMS[itemId] ? CHECKLIST_ITEMS[itemId] : null);
                    // No-op if no DB functions
                }
            } catch (err) {
                console.error('Fehler beim Aktualisieren des Item-Status:', err);
                if (typeof alertUser === 'function') alertUser('Fehler beim Speichern des Eintragsstatus.', 'error');
            }
        });
        openItemsContainer.dataset.listenerAttached = 'true';
    }
}

export function renderChecklistView(listId) {
    const view = document.getElementById('checklistView');

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

    if (!listId || !CHECKLISTS[listId]) {
        const message = Object.keys(CHECKLISTS).length === 0
            ? "Keine Checkliste vorhanden. Bitte erstellen Sie zuerst eine in den Einstellungen."
            : "Keine Standard-Checkliste ausgewählt. Bitte wählen Sie eine in den Einstellungen.";
        contentWrapper.innerHTML = `<p class="text-center text-gray-500 mt-8">${message}</p>`;
        return;
    }

    view.dataset.currentListId = listId;

    let groupedListOptions = Object.values(CHECKLIST_GROUPS).map(group => {
        const listsInGroup = Object.values(CHECKLISTS).filter(list => list.groupId === group.id);
        if (listsInGroup.length === 0) return '';
        return `
            <optgroup label="${group.name}">
                ${listsInGroup.map(list => `<option value="${list.id}" ${list.id === listId ? 'selected' : ''}>${list.name}</option>`).join('')}
            </optgroup>
        `;
    }).join('');

    // HIER IST DIE ÄNDERUNG: Das Dropdown wird basierend auf der Berechtigung gesperrt
    const canSwitchLists = currentUser.permissions.includes('CHECKLIST_SWITCH');
    const disabledAttribute = canSwitchLists ? '' : 'disabled';

    contentWrapper.innerHTML = `
        <div class="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm mb-4">
            <h2 class="text-2xl font-bold text-gray-800">${CHECKLISTS[listId].name}</h2>
            <select id="checklist-switcher" class="p-2 border rounded-lg bg-gray-50 text-sm" ${disabledAttribute}>${groupedListOptions}</select>
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
    contentWrapper.querySelector('#checklist-filter-text').addEventListener('input', () => renderChecklistItems(listId));
    contentWrapper.querySelector('#checklist-filter-status').addEventListener('change', () => renderChecklistItems(listId));

    renderChecklistItems(listId);
}

export function renderChecklistSettingsItems(listId) {
    const container = document.getElementById('checklist-items-editor-container');
    if (!container) return;
    const items = (typeof CHECKLIST_ITEMS !== 'undefined' && CHECKLIST_ITEMS[listId]) ? [...CHECKLIST_ITEMS[listId]] : [];

    if (items.length === 0) {
        container.innerHTML = '<p class="text-xs text-center text-gray-500">Dieser Liste sind noch keine Einträge vorhanden.</p>';
        return;
    }

    items.sort((a, b) => (b.important || 0) - (a.important || 0));
    container.innerHTML = items.map(item => {
        const colorKey = item.categoryColor || 'gray';
        const color = (typeof COLOR_PALETTE !== 'undefined' && COLOR_PALETTE[colorKey]) ? COLOR_PALETTE[colorKey] : { bg: 'bg-gray-100', text: 'text-gray-700' };
        return `
            <div class="p-2 border rounded-lg flex items-center gap-2 ${item.important ? 'bg-yellow-100' : ''}" data-item-id="${item.id}">
                <div class="item-display-content flex-grow">
                    <p class="font-semibold">${item.text}</p>
                    <div class="text-xs text-gray-500 mt-1 space-y-1">
                        ${item.assignedToName ? `<p class="font-semibold text-blue-600">Zugewiesen an: ${item.assignedToName}</p>` : ''}
                        ${item.categoryName ? `<p class="font-semibold ${color.text}">Kategorie: ${item.categoryName}</p>` : ''}
                        <p>Hinzugefügt von: ${item.addedBy || ''} ${item.addedAt ? `<span class="text-gray-400">(${(item.addedAt && item.addedAt.toDate) ? item.addedAt.toDate().toLocaleString() : ''})</span>` : ''}</p>
                    </div>
                </div>
                <div class="item-edit-content hidden flex-grow">
                    <input type="text" class="w-full p-2 border rounded-lg" value="${item.text || ''}">
                </div>
                <div class="flex items-center">
                    <button class="edit-checklist-item-btn p-2 text-blue-500 hover:bg-blue-100 rounded-full" title="Bearbeiten">✎</button>
                    <button class="save-checklist-item-btn p-2 text-green-500 hover:bg-green-100 rounded-full hidden" title="Speichern">✓</button>
                    <button class="delete-checklist-item-btn p-2 text-red-500 hover:bg-red-100 rounded-full" title="Löschen">🗑</button>
                </div>
            </div>
        `;
    }).join('');

    // Delegierter Click-Handler (einmalig)
    if (!container.dataset.listenerAttached) {
        container.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-checklist-item-btn');
            const saveBtn = e.target.closest('.save-checklist-item-btn');
            const deleteBtn = e.target.closest('.delete-checklist-item-btn');

            if (editBtn) {
                const itemDiv = editBtn.closest('[data-item-id]');
                if (!itemDiv) return;
                itemDiv.querySelector('.item-display-content')?.classList.add('hidden');
                itemDiv.querySelector('.item-edit-content')?.classList.remove('hidden');
                editBtn.classList.add('hidden');
                itemDiv.querySelector('.save-checklist-item-btn')?.classList.remove('hidden');
                const input = itemDiv.querySelector('.item-edit-content input');
                input && input.focus();
                return;
            }

            if (saveBtn) {
                const itemDiv = saveBtn.closest('[data-item-id]');
                if (!itemDiv) return;
                const itemId = itemDiv.dataset.itemId;
                const newText = itemDiv.querySelector('.item-edit-content input')?.value.trim();
                if (!newText) {
                    if (typeof alertUser === 'function') alertUser('Eintragstext darf nicht leer sein.', 'error');
                    return;
                }
                try {
                    if (typeof updateDoc === 'function' && typeof doc === 'function') {
                        await updateDoc(doc(checklistItemsCollectionRef, itemId), { text: newText, lastEditedBy: (window.currentUser?.displayName) || 'System', lastEditedAt: (typeof serverTimestamp === 'function' ? serverTimestamp() : null) });
                    }
                } catch (err) {
                    console.error('Fehler beim Speichern des Eintrags:', err);
                    if (typeof alertUser === 'function') alertUser('Fehler beim Speichern.', 'error');
                }
                // lokal sofort UI zurücksetzen (DB-Listener aktualisiert später)
                itemDiv.querySelector('.item-display-content p') && (itemDiv.querySelector('.item-display-content p').textContent = newText);
                itemDiv.querySelector('.item-display-content')?.classList.remove('hidden');
                itemDiv.querySelector('.item-edit-content')?.classList.add('hidden');
                saveBtn.classList.add('hidden');
                itemDiv.querySelector('.edit-checklist-item-btn')?.classList.remove('hidden');
                return;
            }

            if (deleteBtn) {
                const itemDiv = deleteBtn.closest('[data-item-id]');
                if (!itemDiv) return;
                const itemId = itemDiv.dataset.itemId;
                if (!confirm('Möchten Sie diesen Eintrag wirklich löschen?')) return;
                try {
                    if (typeof deleteDoc === 'function' && typeof doc === 'function') {
                        await deleteDoc(doc(checklistItemsCollectionRef, itemId));
                    } else {
                        // Fallback: remove from local structure
                        Object.keys(CHECKLIST_ITEMS || {}).forEach(list => {
                            CHECKLIST_ITEMS[list] = (CHECKLIST_ITEMS[list] || []).filter(i => String(i.id) !== String(itemId));
                        });
                        renderChecklistSettingsItems(listId);
                    }
                } catch (err) {
                    console.error('Fehler beim Löschen des Eintrags:', err);
                    if (typeof alertUser === 'function') alertUser('Fehler beim Löschen', 'error');
                }
            }
        });
        container.dataset.listenerAttached = 'true';
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

function setupListAndItemManagementListeners(view) {
    if (!view) return;
    // Verhindere mehrfaches Binden
    if (view.dataset.listenersSetup === 'true') return;
    view.dataset.listenersSetup = 'true';

    const addItemHandler = async () => {
        try {
            const textInput = view.querySelector('#checklist-settings-add-text');
            const assigneeSelect = view.querySelector('#checklist-settings-add-assignee');
            const categorySelect = view.querySelector('#checklist-settings-add-category');
            const importantCheckbox = view.querySelector('#checklist-settings-add-important');
            const currentListId = view.querySelector('#checklist-settings-editor-switcher')?.value;

            if (!textInput) return console.warn('addItemHandler: kein Textinput gefunden');
            const text = textInput.value.trim();
            if (!text) {
                if (typeof alertUser === 'function') alertUser('Bitte Text für den Eintrag eingeben.', 'error');
                return;
            }
            if (!currentListId) {
                if (typeof alertUser === 'function') alertUser('Bitte wählen Sie zuerst eine Liste zum Hinzufügen.', 'error');
                return;
            }

            const assignedTo = assigneeSelect?.value || null;
            const assignedToName = (assigneeSelect && assigneeSelect.options[assigneeSelect.selectedIndex]) ? assigneeSelect.options[assigneeSelect.selectedIndex].text : null;
            const categoryId = categorySelect?.value || null;
            let categoryName = null, categoryColor = null;
            if (categoryId) {
                for (const g of Object.values(CHECKLIST_CATEGORIES || {})) {
                    const found = (g || []).find(c => c.id === categoryId);
                    if (found) { categoryName = found.name; categoryColor = found.color || 'gray'; break; }
                }
            }

            const payload = {
                listId: currentListId,
                text,
                status: 'open',
                important: !!importantCheckbox?.checked,
                addedBy: (window.currentUser?.displayName) || 'Unbekannt',
                addedAt: (typeof serverTimestamp === 'function') ? serverTimestamp() : null,
                assignedTo: assignedTo || null,
                assignedToName: assignedToName || null,
                categoryId: categoryId || null,
                categoryName: categoryName || null,
                categoryColor: categoryColor || null
            };

            if (typeof addDoc === 'function' && typeof checklistItemsCollectionRef !== 'undefined') {
                await addDoc(checklistItemsCollectionRef, payload);
            } else {
                console.warn('Datenbank nicht verfügbar; füge lokal hinzu.');
                CHECKLIST_ITEMS[currentListId] = CHECKLIST_ITEMS[currentListId] || [];
                CHECKLIST_ITEMS[currentListId].push({ id: Date.now(), ...payload });
                renderChecklistSettingsItems(currentListId);
            }

            // reset UI
            textInput.value = '';
            importantCheckbox && (importantCheckbox.checked = false);
            assigneeSelect && (assigneeSelect.value = '');
            categorySelect && (categorySelect.value = '');
            textInput.focus();
            if (typeof alertUser === 'function') alertUser('Eintrag wurde hinzugefügt.', 'success');
        } catch (err) {
            console.error('addItemHandler error:', err);
            if (typeof alertUser === 'function') alertUser('Fehler beim Hinzufügen des Eintrags.', 'error');
        }
    };

    const addItemBtn = view.querySelector('#checklist-settings-add-item-btn');
    if (addItemBtn) addItemBtn.addEventListener('click', addItemHandler);

    const addTextInput = view.querySelector('#checklist-settings-add-text');
    if (addTextInput) addTextInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addItemHandler(); }
    });

    // Editor switcher
    const editorSwitcher = view.querySelector('#checklist-settings-editor-switcher');
    if (editorSwitcher) editorSwitcher.addEventListener('change', (e) => {
        renderChecklistSettingsView(e.target.value);
    });

    // Archive / modals buttons: re-use existing functions if available
    view.querySelector('#checklist-archive-list-btn')?.addEventListener('click', async () => {
        const listId = view.querySelector('#checklist-settings-editor-switcher')?.value;
        if (!listId) return;
        const name = CHECKLISTS[listId]?.name || 'Unbekannt';
        if (!confirm(`Möchten Sie die Liste "${name}" archivieren?`)) return;
        try {
            if (typeof updateDoc === 'function') {
                await updateDoc(doc(checklistsCollectionRef, listId), { isArchived: true, archivedAt: serverTimestamp(), archivedBy: (window.currentUser?.displayName) || 'System' });
                if (typeof alertUser === 'function') alertUser(`Liste "${name}" archiviert.`, 'success');
            }
        } catch (err) {
            console.error('Archivieren fehlgeschlagen:', err);
            if (typeof alertUser === 'function') alertUser('Fehler beim Archivieren.', 'error');
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

export function renderChecklistSettingsView(editListId = null) {
    const view = document.getElementById('checklistSettingsView');
    if (!view) return;

    // --- SAFE GUARDS: Verhindert ReferenceError wenn Globals fehlen ---
    // Setze nur sichere Default-Objekte, keine privilegierten Fake-Benutzer.
    window.currentUser = window.currentUser || { id: null, name: 'Gast', mode: null, permissions: [], displayName: 'Gast' };
    window.adminSettings = window.adminSettings || {};
    window.CHECKLIST_STACKS = window.CHECKLIST_STACKS || {};
    window.CHECKLIST_GROUPS = window.CHECKLIST_GROUPS || {};
    window.CHECKLIST_CATEGORIES = window.CHECKLIST_CATEGORIES || {};
    window.CHECKLISTS = window.CHECKLISTS || {};
    window.CHECKLIST_ITEMS = window.CHECKLIST_ITEMS || {};
    window.USERS = window.USERS || {};
    window.TEMPLATES = window.TEMPLATES || {};
    window.TEMPLATE_ITEMS = window.TEMPLATE_ITEMS || {};
    window.ARCHIVED_CHECKLISTS = window.ARCHIVED_CHECKLISTS || {};
    window.DELETED_CHECKLISTS = window.DELETED_CHECKLISTS || {};

    const currentUserSafe = window.currentUser;
    const currentUserData = USERS[currentUserSafe.mode] || {};
    const adminSettingsSafe = window.adminSettings;

    // WICHTIG: Diese beiden Zeilen müssen VOR der Berechnung von 'listToEditId' stehen.
    const hasLists = Object.keys(CHECKLISTS).length > 0;
    const defaultListId = adminSettingsSafe.defaultChecklistId || null; // Liest die globale Einstellung

    // KORREKTUR: Die Berechnung von 'listToEditId' kommt jetzt NACH der Definition von 'hasLists'.
    const listToEditId = editListId || view.dataset.editingListId || (hasLists ? Object.keys(CHECKLISTS)[0] : null);
    view.dataset.editingListId = listToEditId;

    const defaultGroupId = defaultListId ? CHECKLISTS[defaultListId]?.groupId : null;
    let defaultGroupOptions = `<option value="none" ${!defaultListId ? 'selected' : ''}>(Keine Liste)</option>` + Object.values(CHECKLIST_GROUPS).map(group => `<option value="${group.id}" ${group.id === defaultGroupId ? 'selected' : ''}>${group.name}</option>`).join('');

    const listToEdit = CHECKLISTS[listToEditId];
    const groupOptions = Object.values(CHECKLIST_GROUPS).map(group => `<option value="${group.id}" ${listToEdit && listToEdit.groupId === group.id ? 'selected' : ''}>${group.name}</option>`).join('');
    const stackOptions = Object.values(CHECKLIST_STACKS).map(stack => `<option value="${stack.id}">${stack.name}</option>`).join('');

    const userOptions = `<option value="">Keine Zuweisung</option>` + Object.values(USERS).filter(u => u.name).map(user => `<option value="${user.id}">${user.name}</option>`).join('');
    const categoryOptions = `<option value="">Keine Kategorie</option>` + Object.values(CHECKLIST_GROUPS).map(group => {
        const categoriesInGroup = CHECKLIST_CATEGORIES[group.id] || [];
        if (categoriesInGroup.length === 0) return '';
        return `<optgroup label="${group.name}">${categoriesInGroup.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}</optgroup>`;
    }).join('');

    view.innerHTML = `
        <div class="back-link-container w-full mb-2"></div>
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Checklisten-Einstellungen</h2>
        <div class="mb-6">
            <h3 class="text-sm font-semibold text-gray-500 mb-1 px-1">Verwalten</h3>
            <div id="settings-tabs" class="grid grid-cols-2 sm:grid-cols-4 gap-1 border rounded-lg bg-gray-100 p-1">
                <button data-target-card="card-default-list" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Standard</button>
                <button data-target-card="card-manage-lists" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Gruppen & Listen</button>
                <button data-target-card="card-categories" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Kategorien</button>
                <button data-target-card="card-templates" class="settings-tab-btn p-2 text-sm font-semibold rounded-md text-gray-600">Stack & Container</button>
            </div>
        </div>
        <div id="card-default-list" class="settings-card space-y-6 hidden"></div>
        <div id="card-manage-lists" class="settings-card space-y-6 hidden"></div>
        <div id="card-categories" class="settings-card hidden"></div>
        <div id="card-templates" class="settings-card hidden space-y-6"></div>
        <div id="card-list-item-editor" class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-green-500 mt-6"></div>
    `;
    view.querySelector('.back-link-container').innerHTML = `<button class="back-link flex items-center text-gray-600 hover:text-indigo-600 transition" data-target="home"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 mr-1"><path d="m15 18-6-6 6-6" /></svg><span class="text-sm font-semibold">zurück</span></button><div class="border-t border-gray-300 mt-2"></div>`;
    view.querySelector('#card-default-list').innerHTML = `<div class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-indigo-500"><h3 class="font-bold text-gray-800 mb-2">Globale Standard-Checkliste festlegen</h3><p class="text-sm text-gray-600 mb-3">Diese Einstellung gilt für alle Benutzer.</p><div class="flex gap-2"><select id="checklist-settings-default-group-switcher" class="w-1/2 p-2 border rounded-lg bg-white">${defaultGroupOptions}</select><select id="checklist-settings-default-list-switcher" class="w-1/2 p-2 border rounded-lg bg-white" ${!defaultGroupId ? 'disabled' : ''}><option>...</option></select></div></div>`;
    view.querySelector('#card-manage-lists').innerHTML = `<div class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-gray-500"><h3 class="font-bold text-gray-800 mb-2">Gruppen & Listen verwalten</h3><div class="p-3 bg-gray-50 rounded-lg space-y-3 mb-4 border-b pb-4"><h4 class="font-semibold text-sm text-gray-700">Gruppen verwalten</h4><div class="flex items-center gap-2"><select id="manage-groups-dropdown" class="flex-grow p-2 border rounded-lg bg-white">${groupOptions}</select><button id="edit-selected-group-btn" class="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition" title="Gruppe umbenennen"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.775a.75.75 0 0 0-.22.53l-.5 2.5a.75.75 0 0 0 .913.913l2.5-.5a.75.75 0 0 0 .53-.22l4.263-4.262a1.75 1.75 0 0 0 0-2.475Z" /><path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v9.5c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25V9.5a.75.75 0 0 1 1.5 0v5.25A2.75 2.75 0 0 1 14.25 18h-9.5A2.75 2.75 0 0 1 2 15.25v-9.5A2.75 2.75 0 0 1 4.75 3.5h5.25a.75.75 0 0 1 0 1.5H4.75Z" /></svg></button><button id="delete-selected-group-btn" class="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition" title="Gruppe löschen"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button></div><div id="create-group-form" class="hidden flex gap-2 pt-2 border-t"><input type="text" id="checklist-settings-new-group-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neue Gruppe..."><button id="checklist-settings-create-group-btn" class="py-2 px-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">Erstellen</button></div><button id="show-create-group-form-btn" class="w-full text-left text-sm text-blue-600 font-semibold hover:underline">+ Neue Gruppe erstellen</button></div><div class="p-3 bg-gray-50 rounded-lg space-y-3"><h4 class="font-semibold text-sm text-gray-700">Neue Liste erstellen</h4><input type="text" id="checklist-settings-new-name" class="w-full p-2 border rounded-lg" placeholder="Name der neuen Liste..."><select id="checklist-settings-new-group-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Gruppe für neue Liste wählen...</option>${groupOptions}</select><button id="checklist-settings-create-list-btn" class="w-full py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition">Liste erstellen</button></div><div class="mt-4 border-t pt-4 grid grid-cols-2 gap-2"><button id="show-archived-lists-btn" class="w-full py-2 text-sm text-gray-700 font-semibold bg-gray-100 rounded-lg hover:bg-gray-200">Archiv</button><button id="show-deleted-lists-btn" class="w-full py-2 text-sm text-gray-700 font-semibold bg-gray-100 rounded-lg hover:bg-gray-200">Papierkorb</button></div></div>`;
    view.querySelector('#card-categories').innerHTML = `<div class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-cyan-500"><h3 class="font-bold text-gray-800 mb-2">Kategorien verwalten</h3><p class="text-sm text-gray-600 mb-3">Wählen Sie eine Gruppe, um deren spezifische Kategorien zu bearbeiten.</p><select id="category-group-selector" class="w-full p-2 border rounded-lg bg-white mb-4"><option value="">Gruppe wählen...</option>${groupOptions}</select><div id="category-content"><p class="text-sm text-center text-gray-500">Bitte wählen Sie eine Gruppe, um deren Kategorien zu verwalten.</p></div></div>`;
    view.querySelector('#card-templates').innerHTML = `<div class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-teal-500"><h3 class="font-bold text-gray-800 mb-2">Stack & Container verwalten</h3><div class="p-3 bg-gray-50 rounded-lg space-y-3 mb-4 border-b pb-4"><h4 class="font-semibold text-sm text-gray-700">Stacks verwalten</h4><div class="flex items-center gap-2"><select id="manage-stacks-dropdown" class="flex-grow p-2 border rounded-lg bg-white">${stackOptions}</select><button id="edit-selected-stack-btn" class="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition" title="Stack umbenennen"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.775a.75.75 0 0 0-.22.53l-.5 2.5a.75.75 0 0 0 .913.913l2.5-.5a.75.75 0 0 0 .53-.22l4.263-4.262a1.75 1.75 0 0 0 0-2.475Z" /><path d="M4.75 3.5c-.69 0-1.25.56-1.25 1.25v9.5c0 .69.56 1.25 1.25 1.25h9.5c.69 0 1.25-.56 1.25-1.25V9.5a.75.75 0 0 1 1.5 0v5.25A2.75 2.75 0 0 1 14.25 18h-9.5A2.75 2.75 0 0 1 2 15.25v-9.5A2.75 2.75 0 0 1 4.75 3.5h5.25a.75.75 0 0 1 0 1.5H4.75Z" /></svg></button><button id="delete-selected-stack-btn" class="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition" title="Stack löschen"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg></button></div><div id="create-stack-form" class="hidden flex gap-2 pt-2 border-t"><input type="text" id="checklist-settings-new-stack-name" class="flex-grow p-2 border rounded-lg" placeholder="Name für neuen Stack..."><button id="checklist-settings-create-stack-btn" class="py-2 px-3 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition">Erstellen</button></div><button id="show-create-stack-form-btn" class="w-full text-left text-sm text-blue-600 font-semibold hover:underline">+ Neuen Stack erstellen</button></div><div class="p-3 bg-gray-50 rounded-lg space-y-3"><h4 class="font-semibold text-sm text-gray-700">Neuen Container erstellen</h4><input type="text" id="checklist-settings-new-container-name" class="w-full p-2 border rounded-lg" placeholder="Name des neuen Containers..."><select id="checklist-settings-new-stack-selector" class="w-full p-2 border rounded-lg bg-white"><option value="">Stack für neuen Container wählen...</option>${stackOptions}</select><button id="checklist-settings-create-container-btn" class="w-full py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition">Container erstellen</button></div><div class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-gray-500 mt-6"><div id="container-list-editor"></div><div id="template-item-editor" class="hidden"><div class="border-t pt-4"><div class="flex justify-between items-center mb-2"><h4 id="template-editor-title" class="font-semibold text-gray-700"></h4><button id="delete-template-btn" class="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition" title="Diesen Container löschen"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0 0011.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5Zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5Z" clip-rule="evenodd" /></svg></button></div><div class="p-3 bg-gray-50 rounded-lg space-y-3 mb-4"><input type="text" id="new-template-item-text" class="w-full p-2 border rounded-lg" placeholder="Neuer Eintrag für den Container..."><div class="grid grid-cols-2 gap-2"><select id="new-template-item-assignee" class="p-2 border rounded-lg bg-white text-sm">${userOptions}</select><select id="new-template-item-category" class="p-2 border rounded-lg bg-white text-sm">${categoryOptions}</select></div><div class="flex items-center"><input type="checkbox" id="new-template-item-important" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"><label for="new-template-item-important" class="ml-2 text-sm text-gray-700">Als wichtig markieren</label></div><button id="add-template-item-btn" class="w-full py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition">Eintrag zum Container hinzufügen</button></div><div id="template-items-list" class="space-y-2"></div></div></div></div>`;

    const currentGroupName = CHECKLISTS[listToEditId]?.groupName || 'Keine';
    const editorCardContent = `
        <div class="flex gap-2 items-center mb-2">
            <select id="checklist-settings-editor-switcher" class="flex-grow p-2 border rounded-lg bg-white" ${!hasLists ? 'disabled' : ''}>
                ${Object.values(CHECKLIST_GROUPS).map(group => { const listsInGroup = Object.values(CHECKLISTS).filter(list => list.groupId === group.id); if (listsInGroup.length === 0) return ''; return `<optgroup label="${group.name}">${listsInGroup.map(list => `<option value="${list.id}" ${list.id === listToEditId ? 'selected' : ''}>${list.name}</option>`).join('')}</optgroup>`; }).join('')}
            </select>
            <button id="show-template-modal-btn" title="Container anwenden" class="p-2 bg-teal-100 text-teal-800 text-sm font-bold rounded-lg hover:bg-teal-200 transition" ${!hasLists ? 'disabled' : ''}>+C</button>
            <button id="checklist-archive-list-btn" title="Liste archivieren" class="p-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 transition" ${!hasLists ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h13A1.5 1.5 0 0 1 18 3.5v10A1.5 1.5 0 0 1 16.5 15h-13A1.5 1.5 0 0 1 2 13.5v-10Zm14.5.5a.5.5 0 0 0-.5-.5h-13a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-10ZM8 7a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 8 7Z" /></svg></button>
        </div>
        <div class="mb-4 p-2 bg-gray-100 rounded-lg">
            <div id="group-display-container" class="flex justify-between items-center">
                <p class="text-sm">Aktuelle Gruppe: <span class="font-bold">${currentGroupName}</span></p>
                <button id="edit-group-assignment-btn" class="text-sm font-semibold text-blue-600 hover:underline">ändern</button>
            </div>
            <div id="group-edit-container" class="hidden flex gap-2 items-center">
                <select id="checklist-group-assign-switcher" class="flex-grow p-2 border rounded-lg bg-white text-sm" ${!hasLists ? 'disabled' : ''}>${groupOptions}</select>
                <button id="checklist-save-group-assignment" class="py-2 px-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition text-sm" ${!hasLists ? 'disabled' : ''}>Speichern</button>
            </div>
        </div>
        <div class="p-3 bg-gray-50 rounded-lg space-y-3 mb-4 border-t pt-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="relative sm:col-span-2">
                    <input type="text" id="checklist-settings-add-text" class="w-full p-2 border rounded-lg" placeholder="Neuer Eintrag..." ${!hasLists ? 'disabled' : ''} autocomplete="off">
                    <div id="item-suggestions-container" class="absolute z-10 w-full bg-white border rounded-lg mt-1 hidden max-h-48 overflow-y-auto shadow-lg"></div>
                </div>
                <select id="checklist-settings-add-assignee" class="p-2 border rounded-lg bg-white w-full" ${!hasLists ? 'disabled' : ''}>${userOptions}</select>
                <select id="checklist-settings-add-category" class="p-2 border rounded-lg bg-white w-full" ${!hasLists ? 'disabled' : ''}>${categoryOptions}</select>
            </div>
            <div class="flex items-center">
                <input type="checkbox" id="checklist-settings-add-important" class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" ${!hasLists ? 'disabled' : ''}>
                <label for="checklist-settings-add-important" class="ml-2 text-sm text-gray-700">Als wichtig markieren</label>
            </div>
            <button id="checklist-settings-add-item-btn" class="w-full py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition ${!hasLists ? 'opacity-50 cursor-not-allowed' : ''}" ${!hasLists ? 'disabled' : ''}>Eintrag hinzufügen</button>
        </div>
        <div id="checklist-items-editor-container" class="space-y-2 mb-4">${!hasLists ? '<p class="text-center text-sm text-gray-500">Keine Listen vorhanden. Bitte erstellen Sie zuerst eine.</p>' : ''}</div>
        
        `;
    view.querySelector('#card-list-item-editor').innerHTML = editorCardContent;

    const tabs = view.querySelector('#settings-tabs');
    if (tabs && !tabs.dataset.listenerAttached) {
        tabs.addEventListener('click', (e) => {
            const clickedTab = e.target.closest('.settings-tab-btn');
            if (!clickedTab) return;
            const targetCardId = clickedTab.dataset.targetCard;
            const editorCard = view.querySelector('#card-list-item-editor');
            const isAlreadyActive = clickedTab.classList.contains('bg-white');
            view.querySelectorAll('.settings-tab-btn').forEach(tab => {
                tab.classList.remove('bg-white', 'shadow', 'text-indigo-600');
                tab.classList.add('text-gray-600');
            });
            view.querySelectorAll('.settings-card').forEach(card => card.classList.add('hidden'));
            if (isAlreadyActive) {
                editorCard.classList.remove('hidden');
            } else {
                editorCard.classList.add('hidden');
                clickedTab.classList.add('bg-white', 'shadow', 'text-indigo-600');
                clickedTab.classList.remove('text-gray-600');
                const targetCard = view.querySelector(`#${targetCardId}`);
                if (targetCard) {
                    targetCard.classList.remove('hidden');
                }
                if (targetCardId === 'card-templates') {
                    renderContainerList();
                    setupStackAndContainerManagementListeners(view);
                }
            }
        });
        tabs.dataset.listenerAttached = 'true';
    }

    if (hasLists) {
        const selectedGroupForList = CHECKLISTS[listToEditId]?.groupId;
        if (selectedGroupForList) {
            const assignSwitcher = view.querySelector('#checklist-group-assign-switcher');
            if (assignSwitcher) {
                assignSwitcher.value = selectedGroupForList;
            }
        }
        renderChecklistSettingsItems(listToEditId);
    }

    // Übergibt nur das sichere currentUserData; interne Listener verwenden weiterhin window.currentUser (sicher initialisiert oben).
    setupGroupManagementListeners(view, currentUserData);
    setupListAndItemManagementListeners(view);
    setupCategoryManagementListeners(view);
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

export function openTemplateModal(targetListId) {
    const modal = document.getElementById('templateApplyModal');
    if (!modal) return console.warn('openTemplateModal: modal fehlt');
    modal.dataset.targetListId = targetListId || '';

    const templateSelect = document.getElementById('template-select');
    const itemsContainer = document.getElementById('template-items-container');
    const modeSection = document.getElementById('template-mode-section');

    const updateTemplateDropdown = async () => {
        const selectedType = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
        if (itemsContainer) itemsContainer.innerHTML = '';
        if (modeSection) modeSection.classList.toggle('hidden', selectedType !== 'Schiff');
        if (!templateSelect) return;
        templateSelect.innerHTML = '<option value="">Bitte Quelle wählen...</option>';
        if (selectedType === 'Container') {
            const grouped = Object.values(CHECKLIST_STACKS || {}).map(stack => {
                const containers = Object.values(TEMPLATES || {}).filter(t => t.stackId === stack.id);
                if (containers.length === 0) return '';
                return `<optgroup label="${stack.name}">${containers.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</optgroup>`;
            }).join('');
            const withoutStack = Object.values(TEMPLATES || {}).filter(t => !t.stackId).map(t => `<option value="${t.id}">${t.name}</option>`).join('');
            templateSelect.innerHTML += grouped + (withoutStack ? `<optgroup label="Ohne Stack">${withoutStack}</optgroup>` : '');
        } else {
            Object.values(CHECKLISTS || {}).forEach(cl => templateSelect.innerHTML += `<option value="${cl.id}">${cl.name}</option>`);
        }
    };

    if (!modal.dataset.listenersAttached) {
        // change handler for select
        templateSelect?.addEventListener('change', async (e) => {
            const selectedId = e.target.value;
            const selectedType = modal.querySelector('input[name="template-type"]:checked')?.value || 'Container';
            if (!itemsContainer) return;
            itemsContainer.innerHTML = '';
            if (!selectedId) return;
            if (selectedType === 'Container') {
                if (typeof getDocs === 'function') {
                    itemsContainer.innerHTML = '<p class="text-xs text-gray-500">Lade Einträge...</p>';
                    try {
                        const itemsRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates', selectedId, 'template-items');
                        const snap = await getDocs(query(itemsRef, orderBy('text')));
                        const items = [];
                        snap.forEach(s => items.push({ id: s.id, ...s.data() }));
                        if (items.length === 0) { itemsContainer.innerHTML = '<p class="text-xs text-gray-500">Keine Einträge.</p>'; return; }
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
                    } catch (err) {
                        console.error('Fehler beim Laden der Template-Items:', err);
                        itemsContainer.innerHTML = '<p class="text-xs text-red-500">Fehler beim Laden.</p>';
                    }
                } else {
                    itemsContainer.innerHTML = '<p class="text-xs text-gray-500">Datenbank nicht verfügbar.</p>';
                }
            } else {
                // Schiff: use CHECKLIST_ITEMS snapshot
                const items = CHECKLIST_ITEMS[selectedId] || [];
                if (!items || items.length === 0) { itemsContainer.innerHTML = '<p class="text-xs text-gray-500">Keine Einträge.</p>'; return; }
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

function closeTemplateModal() {
    const modal = document.getElementById('templateApplyModal');
    if (!modal) return;
    modal.style.display = 'none';
    const itemsContainer = document.getElementById('template-items-container');
    if (itemsContainer) itemsContainer.innerHTML = '';
    const templateSelect = document.getElementById('template-select');
    if (templateSelect) templateSelect.innerHTML = '<option value="">Bitte zuerst Typ wählen...</option>';
    const modeSection = document.getElementById('template-mode-section');
    if (modeSection) modeSection.classList.add('hidden');
    modal.dataset.targetListId = '';
}
