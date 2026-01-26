// NOTIZEN-PROGRAMM - Strukturierte Notizen mit Kategorien, Sharing & Live-Sync
import { db, appId, currentUser, GUEST_MODE, alertUser } from './haupteingang.js';
import { collection, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp, writeBatch, orderBy, limit as firestoreLimit, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let kategorienListener = null, notizenListener = null, einladungenListener = null;
let allKategorien = [], allNotizen = [], allEinladungen = [];
let currentEditingNotizId = null, checkoutHeartbeat = null;

export function initializeNotizen() {
    console.log('Notizen: Init...');
    setupEventListeners();
    loadKategorien();
    loadNotizen();
    loadEinladungen();
}

export function listenForNotizen() {
    loadNotizen();
}

export function stopNotizenListeners() {
    if (kategorienListener) kategorienListener();
    if (notizenListener) notizenListener();
    if (einladungenListener) einladungenListener();
    stopCheckoutHeartbeat();
}

function setupEventListeners() {
    const setupBtn = (id, fn) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.replaceWith(btn.cloneNode(true));
            document.getElementById(id).addEventListener('click', fn);
        } else {
            console.warn(`Button ${id} nicht gefunden`);
        }
    };

    setupBtn('btn-notizen-settings', openSettings);
    setupBtn('btn-notizen-einladungen', openEinladungen);
    setupBtn('btn-neue-notiz', () => openNotizEditor());
    setupBtn('btn-kategorie-erstellen', createKategorie);
    setupBtn('close-notizen-settings', () => {
        const modal = document.getElementById('notizenSettingsModal');
        if (modal) modal.classList.add('hidden');
    });
    setupBtn('close-notiz-editor', closeNotizEditor);
    setupBtn('btn-notiz-save', saveNotiz);
    setupBtn('btn-notiz-cancel', closeNotizEditor);
    setupBtn('btn-notiz-delete', deleteNotiz);
    setupBtn('btn-notiz-share', openShareModal);
    setupBtn('close-notiz-share', () => {
        const modal = document.getElementById('notizShareModal');
        if (modal) modal.classList.add('hidden');
    });
    setupBtn('btn-share-send', sendShareInvitation);
    setupBtn('btn-share-cancel', () => {
        const modal = document.getElementById('notizShareModal');
        if (modal) modal.classList.add('hidden');
    });
    setupBtn('close-notizen-einladungen', () => {
        const modal = document.getElementById('notizenEinladungenModal');
        if (modal) modal.classList.add('hidden');
    });
    setupBtn('close-notiz-history', () => {
        const modal = document.getElementById('notizHistoryModal');
        if (modal) modal.classList.add('hidden');
    });
    setupBtn('btn-show-history', showHistory);

    ['search-notizen', 'filter-notizen-status', 'filter-notizen-kategorie', 'filter-notizen-shared'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(id.includes('search') ? 'input' : 'change', applyFilters);
        }
    });

    const resetBtn = document.getElementById('reset-filters-notizen');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            ['search-notizen', 'filter-notizen-status', 'filter-notizen-kategorie', 'filter-notizen-shared'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            applyFilters();
        });
    }

    const kategorieSelect = document.getElementById('notiz-kategorie');
    if (kategorieSelect) kategorieSelect.addEventListener('change', updateSubkategorienDropdown);

    // Event-Listener für dynamische Element-Buttons
    const addElementButtons = document.querySelectorAll('.notiz-add-element');
    addElementButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.currentTarget.dataset.type;
            if (type) addElement(type);
        });
    });
    console.log(`Notizen: ${addElementButtons.length} Element-Buttons gefunden`);
}

function openSettings() {
    const modal = document.getElementById('notizenSettingsModal');
    if (!modal) {
        console.error('Notizen: Settings-Modal nicht gefunden!');
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    console.log('Notizen: Settings-Modal geöffnet');
}

async function loadKategorien() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;
    if (kategorienListener) kategorienListener();

    const colRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien');
    kategorienListener = onSnapshot(colRef, async (snapshot) => {
        allKategorien = [];
        for (const docSnap of snapshot.docs) {
            const kategorie = { id: docSnap.id, ...docSnap.data(), subkategorien: [] };
            const subColRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', docSnap.id, 'subkategorien');
            const subSnap = await getDocs(subColRef);
            subSnap.forEach(subDoc => kategorie.subkategorien.push({ id: subDoc.id, ...subDoc.data() }));
            allKategorien.push(kategorie);
        }
        renderKategorienListe();
        updateKategorienDropdowns();
    });
}

function renderKategorienListe() {
    const container = document.getElementById('kategorien-liste');
    if (!container) return;
    if (allKategorien.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Noch keine Kategorien</p>';
        return;
    }
    container.innerHTML = allKategorien.map(kat => `
        <div class="border rounded-lg p-3">
            <div class="flex justify-between items-center mb-2">
                <span class="font-bold">📁 ${kat.name}</span>
                <button onclick="window.deleteKategorie('${kat.id}')" class="text-red-500 text-sm">🗑️</button>
            </div>
            <div class="ml-4 space-y-1">
                ${kat.subkategorien.map(sub => `
                    <div class="flex justify-between text-sm">
                        <span>📄 ${sub.name}</span>
                        <button onclick="window.deleteSubkategorie('${kat.id}','${sub.id}')" class="text-red-500">✕</button>
                    </div>
                `).join('')}
                <div class="flex gap-2 mt-2">
                    <input type="text" id="neue-subkat-${kat.id}" placeholder="Neue Subkategorie..." class="flex-1 p-1 border rounded text-sm">
                    <button onclick="window.createSubkategorie('${kat.id}')" class="px-2 py-1 bg-amber-500 text-white text-xs rounded">➕</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function createKategorie() {
    const input = document.getElementById('neue-kategorie-name');
    if (!input || !input.value.trim()) {
        alertUser('Bitte Name eingeben', 'error');
        return;
    }
    try {
        const colRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen_kategorien');
        await addDoc(colRef, { name: input.value.trim(), createdAt: serverTimestamp(), createdBy: currentUser.mode });
        input.value = '';
        alertUser('Kategorie erstellt', 'success');
    } catch (error) {
        alertUser('Fehler', 'error');
    }
}

window.createSubkategorie = async function(kategorieId) {
    const input = document.getElementById(`neue-subkat-${kategorieId}`);
    if (!input || !input.value.trim()) return;
    try {
        const colRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen_kategorien', kategorieId, 'subkategorien');
        await addDoc(colRef, { name: input.value.trim(), createdAt: serverTimestamp(), createdBy: currentUser.mode });
        input.value = '';
        alertUser('Subkategorie erstellt', 'success');
    } catch (error) {
        alertUser('Fehler', 'error');
    }
};

window.deleteKategorie = async function(kategorieId) {
    if (!confirm('Löschen?')) return;
    const userId = currentUser.mode;
    try {
        const notizenRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen');
        const q = query(notizenRef, where('kategorieId', '==', kategorieId));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            alertUser('Kategorie enthält Notizen!', 'error');
            return;
        }
        const subColRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', kategorieId, 'subkategorien');
        const subSnap = await getDocs(subColRef);
        const batch = writeBatch(db);
        subSnap.forEach(doc => batch.delete(doc.ref));
        const katRef = doc(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', kategorieId);
        batch.delete(katRef);
        await batch.commit();
        alertUser('Gelöscht', 'success');
    } catch (error) {
        alertUser('Fehler', 'error');
    }
};

window.deleteSubkategorie = async function(kategorieId, subkategorieId) {
    if (!confirm('Löschen?')) return;
    const userId = currentUser.mode;
    try {
        const notizenRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen');
        const q = query(notizenRef, where('subkategorieId', '==', subkategorieId));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            alertUser('Subkategorie enthält Notizen!', 'error');
            return;
        }
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', kategorieId, 'subkategorien', subkategorieId);
        await deleteDoc(docRef);
        alertUser('Gelöscht', 'success');
    } catch (error) {
        alertUser('Fehler', 'error');
    }
};

function updateKategorienDropdowns() {
    const filterSelect = document.getElementById('filter-notizen-kategorie');
    const editorSelect = document.getElementById('notiz-kategorie');
    const options = allKategorien.map(kat => `<option value="${kat.id}">${kat.name}</option>`).join('');
    if (filterSelect) {
        const v = filterSelect.value;
        filterSelect.innerHTML = '<option value="">Alle Kategorien</option>' + options;
        filterSelect.value = v;
    }
    if (editorSelect) {
        const v = editorSelect.value;
        editorSelect.innerHTML = '<option value="">Bitte wählen...</option>' + options;
        editorSelect.value = v;
        if (v) updateSubkategorienDropdown();
    }
}

function updateSubkategorienDropdown() {
    const kategorieSelect = document.getElementById('notiz-kategorie');
    const subSelect = document.getElementById('notiz-subkategorie');
    if (!kategorieSelect || !subSelect) return;
    const kategorieId = kategorieSelect.value;
    if (!kategorieId) {
        subSelect.disabled = true;
        subSelect.innerHTML = '<option value="">Erst Kategorie wählen...</option>';
        return;
    }
    const kategorie = allKategorien.find(k => k.id === kategorieId);
    if (!kategorie || !kategorie.subkategorien.length) {
        subSelect.disabled = true;
        subSelect.innerHTML = '<option value="">Keine Subkategorien</option>';
        return;
    }
    subSelect.disabled = false;
    subSelect.innerHTML = '<option value="">Bitte wählen...</option>' + kategorie.subkategorien.map(sub => `<option value="${sub.id}">${sub.name}</option>`).join('');
}

async function loadNotizen() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;
    if (notizenListener) notizenListener();
    const colRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen');
    notizenListener = onSnapshot(colRef, (snapshot) => {
        allNotizen = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        applyFilters();
        updateStats();
    });
}

function applyFilters() {
    const searchTerm = document.getElementById('search-notizen')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('filter-notizen-status')?.value || '';
    const kategorieFilter = document.getElementById('filter-notizen-kategorie')?.value || '';
    const sharedFilter = document.getElementById('filter-notizen-shared')?.value || '';
    const userId = currentUser.mode;

    let filtered = allNotizen.filter(notiz => {
        if (statusFilter && notiz.status !== statusFilter) return false;
        if (kategorieFilter && notiz.kategorieId !== kategorieFilter) return false;
        if (sharedFilter === 'own' && notiz.owner !== userId) return false;
        if (sharedFilter === 'shared' && (!notiz.sharedWith || Object.keys(notiz.sharedWith).length === 0)) return false;
        if (searchTerm) {
            const searchable = `${notiz.betreff} ${notiz.status}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }
        return true;
    });

    renderNotizenListe(filtered);
}

function renderNotizenListe(notizen) {
    const container = document.getElementById('notizen-list-container');
    const countSpan = document.getElementById('notizen-filtered-count');
    if (!container) return;
    if (countSpan) countSpan.textContent = notizen.length;
    if (notizen.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">Keine Notizen</p>';
        return;
    }
    container.innerHTML = notizen.map(notiz => {
        const kategorie = allKategorien.find(k => k.id === notiz.kategorieId);
        const kategorieName = kategorie?.name || 'Unbekannt';
        const isShared = notiz.sharedWith && Object.keys(notiz.sharedWith).length > 0;
        const isCheckedOut = notiz.checkedOutBy && notiz.checkedOutBy !== currentUser.mode;
        const statusColors = { 'offen': 'bg-blue-100 text-blue-800', 'in_bearbeitung': 'bg-yellow-100 text-yellow-800', 'erledigt': 'bg-green-100 text-green-800' };
        const statusIcons = { 'offen': '🔵', 'in_bearbeitung': '🟡', 'erledigt': '🟢' };
        return `
            <div class="bg-white p-4 rounded-lg shadow hover:shadow-md transition border-l-4 ${notiz.status === 'offen' ? 'border-blue-500' : notiz.status === 'in_bearbeitung' ? 'border-yellow-500' : 'border-green-500'}">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg">${notiz.betreff || 'Ohne Titel'}</h3>
                    <div class="flex gap-2">
                        ${isShared ? '<span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">👥</span>' : ''}
                        ${isCheckedOut ? '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">🔒</span>' : ''}
                        <span class="text-xs px-2 py-1 rounded ${statusColors[notiz.status] || 'bg-gray-100'}">${statusIcons[notiz.status] || ''} ${notiz.status}</span>
                    </div>
                </div>
                <div class="text-sm text-gray-600 mb-3">
                    <span class="mr-3">📁 ${kategorieName}</span>
                </div>
                <button onclick="window.openNotizById('${notiz.id}')" class="px-3 py-1 bg-amber-500 text-white text-sm rounded hover:bg-amber-600">📝 Öffnen</button>
            </div>
        `;
    }).join('');
}

function updateStats() {
    const total = allNotizen.length;
    const offen = allNotizen.filter(n => n.status === 'offen').length;
    const bearbeitung = allNotizen.filter(n => n.status === 'in_bearbeitung').length;
    const shared = allNotizen.filter(n => n.sharedWith && Object.keys(n.sharedWith).length > 0).length;
    const setCount = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setCount('notizen-count-total', total);
    setCount('notizen-count-offen', offen);
    setCount('notizen-count-bearbeitung', bearbeitung);
    setCount('notizen-count-shared', shared);
}

window.openNotizById = function(notizId) { openNotizEditor(notizId); };

async function openNotizEditor(notizId = null) {
    currentEditingNotizId = notizId;
    const modal = document.getElementById('notizEditorModal');
    if (!modal) {
        console.error('Notizen: Editor-Modal nicht gefunden!');
        alertUser('Editor-Modal fehlt', 'error');
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    console.log('Notizen: Editor-Modal geöffnet für', notizId || 'neue Notiz');
    
    const titleEl = document.getElementById('notiz-editor-title');
    const deleteBtn = document.getElementById('btn-notiz-delete');
    
    if (notizId) {
        if (titleEl) titleEl.textContent = '📝 Bearbeiten';
        if (deleteBtn) deleteBtn.classList.remove('hidden');
        await loadNotizData(notizId);
        await checkoutNotiz(notizId);
    } else {
        if (titleEl) titleEl.textContent = '📝 Neue Notiz';
        if (deleteBtn) deleteBtn.classList.add('hidden');
        resetEditorForm();
    }
}

async function loadNotizData(notizId) {
    const docRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', notizId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        alertUser('Nicht gefunden', 'error');
        closeNotizEditor();
        return;
    }
    const notiz = docSnap.data();
    document.getElementById('notiz-betreff').value = notiz.betreff || '';
    document.getElementById('notiz-kategorie').value = notiz.kategorieId || '';
    updateSubkategorienDropdown();
    document.getElementById('notiz-subkategorie').value = notiz.subkategorieId || '';
    document.getElementById('notiz-status').value = notiz.status || 'offen';
    if (notiz.erinnerung) {
        const date = notiz.erinnerung.toDate ? notiz.erinnerung.toDate() : new Date(notiz.erinnerung);
        document.getElementById('notiz-erinnerung').value = date.toISOString().slice(0, 16);
    }
    if (notiz.frist) {
        const date = notiz.frist.toDate ? notiz.frist.toDate() : new Date(notiz.frist);
        document.getElementById('notiz-frist').value = date.toISOString().slice(0, 16);
    }
    const container = document.getElementById('notiz-hauptteil-container');
    container.innerHTML = '';
    if (notiz.elements && notiz.elements.length > 0) {
        notiz.elements.forEach(el => renderElement(el));
    } else {
        container.innerHTML = '<p class="text-gray-400 text-center text-sm">Füge Elemente hinzu...</p>';
    }
    renderSharedUsers(notiz.sharedWith);
    if (notiz.checkedOutBy && notiz.checkedOutBy !== currentUser.mode) {
        showCheckoutWarning(notiz.checkedOutBy);
    } else {
        hideCheckoutWarning();
    }
    const metaDiv = document.getElementById('notiz-metadata');
    if (metaDiv && notiz.createdAt) {
        metaDiv.classList.remove('hidden');
        document.getElementById('notiz-meta-created').textContent = new Date(notiz.createdAt.toDate()).toLocaleString('de-DE');
        document.getElementById('notiz-meta-edited').textContent = notiz.lastEditedAt ? new Date(notiz.lastEditedAt.toDate()).toLocaleString('de-DE') + ' von ' + (notiz.lastEditedBy || '?') : 'Noch nicht bearbeitet';
    }
}

function resetEditorForm() {
    document.getElementById('notiz-betreff').value = '';
    document.getElementById('notiz-kategorie').value = '';
    document.getElementById('notiz-subkategorie').value = '';
    document.getElementById('notiz-subkategorie').disabled = true;
    document.getElementById('notiz-status').value = 'offen';
    document.getElementById('notiz-erinnerung').value = '';
    document.getElementById('notiz-frist').value = '';
    const container = document.getElementById('notiz-hauptteil-container');
    container.innerHTML = '<p class="text-gray-400 text-center text-sm">Füge Elemente hinzu...</p>';
    document.getElementById('notiz-shared-users-list').innerHTML = '<p class="text-gray-400 text-sm">Privat</p>';
    document.getElementById('notiz-metadata').classList.add('hidden');
    hideCheckoutWarning();
}

async function saveNotiz() {
    const betreff = document.getElementById('notiz-betreff').value.trim();
    const kategorieId = document.getElementById('notiz-kategorie').value;
    const subkategorieId = document.getElementById('notiz-subkategorie').value;
    const status = document.getElementById('notiz-status').value;
    const erinnerungStr = document.getElementById('notiz-erinnerung').value;
    const fristStr = document.getElementById('notiz-frist').value;
    if (!betreff || !kategorieId || !subkategorieId) {
        alertUser('Pflichtfelder ausfüllen', 'error');
        return;
    }
    const elements = collectElements();
    const notizData = {
        betreff, kategorieId, subkategorieId, status, elements,
        erinnerung: erinnerungStr ? Timestamp.fromDate(new Date(erinnerungStr)) : null,
        frist: fristStr ? Timestamp.fromDate(new Date(fristStr)) : null,
        lastEditedAt: serverTimestamp(),
        lastEditedBy: currentUser.mode
    };
    try {
        if (currentEditingNotizId) {
            const docRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', currentEditingNotizId);
            await updateDoc(docRef, notizData);
            await addHistory(currentEditingNotizId, 'Bearbeitet', notizData);
            await releaseCheckout(currentEditingNotizId);
            alertUser('Gespeichert', 'success');
        } else {
            const colRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen');
            const newDoc = await addDoc(colRef, { ...notizData, createdAt: serverTimestamp(), createdBy: currentUser.mode, owner: currentUser.mode, sharedWith: {}, checkedOutBy: null, checkedOutAt: null });
            await addHistory(newDoc.id, 'Erstellt', notizData);
            alertUser('Erstellt', 'success');
        }
        closeNotizEditor();
    } catch (error) {
        alertUser('Fehler', 'error');
    }
}

function collectElements() {
    const container = document.getElementById('notiz-hauptteil-container');
    const elements = [];
    container.querySelectorAll('[data-element-type]').forEach((el, index) => {
        const type = el.dataset.elementType;
        const element = { type, order: index };
        switch (type) {
            case 'text': element.content = el.querySelector('textarea')?.value || ''; break;
            case 'checkbox':
                element.label = el.querySelector('input[type="text"]')?.value || '';
                element.checked = el.querySelector('input[type="checkbox"]')?.checked || false;
                break;
            case 'link':
                element.url = el.querySelector('input[name="url"]')?.value || '';
                element.label = el.querySelector('input[name="label"]')?.value || '';
                break;
            case 'password': element.content = el.querySelector('input')?.value || ''; break;
            case 'infobox':
                element.content = el.querySelector('textarea')?.value || '';
                element.color = el.querySelector('select')?.value || 'blue';
                break;
            case 'table':
                const rows = [];
                el.querySelectorAll('tbody tr').forEach(tr => {
                    const cells = Array.from(tr.querySelectorAll('input')).map(inp => inp.value);
                    rows.push(cells);
                });
                element.rows = rows;
                element.headers = Array.from(el.querySelectorAll('thead input')).map(inp => inp.value);
                break;
        }
        elements.push(element);
    });
    return elements;
}

async function deleteNotiz() {
    if (!currentEditingNotizId || !confirm('Löschen?')) return;
    try {
        await releaseCheckout(currentEditingNotizId);
        const docRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', currentEditingNotizId);
        await deleteDoc(docRef);
        alertUser('Gelöscht', 'success');
        closeNotizEditor();
    } catch (error) {
        alertUser('Fehler', 'error');
    }
}

async function closeNotizEditor() {
    if (currentEditingNotizId) await releaseCheckout(currentEditingNotizId);
    stopCheckoutHeartbeat();
    currentEditingNotizId = null;
    document.getElementById('notizEditorModal').classList.add('hidden');
    document.getElementById('notizEditorModal').classList.remove('flex');
}

function addElement(type) {
    const container = document.getElementById('notiz-hauptteil-container');
    if (container.querySelector('.text-gray-400')) container.innerHTML = '';
    const elementDiv = document.createElement('div');
    elementDiv.className = 'border border-gray-300 rounded p-3 bg-white relative';
    elementDiv.dataset.elementType = type;
    let content = '';
    switch (type) {
        case 'text':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">📝 Text</span><div class="flex gap-1"><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><textarea class="w-full p-2 border rounded" rows="3"></textarea>`;
            break;
        case 'checkbox':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">☑️ Checkbox</span><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div><div class="flex gap-2"><input type="checkbox" class="w-5 h-5"><input type="text" placeholder="Label..." class="flex-1 p-2 border rounded"></div>`;
            break;
        case 'line':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">➖ Linie</span><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div><hr class="border-t-2">`;
            break;
        case 'table':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">📊 Tabelle</span><div class="flex gap-1"><button class="add-table-row text-xs px-2 py-1 bg-blue-500 text-white rounded">+ Zeile</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><table class="w-full border"><thead><tr><th><input type="text" placeholder="Spalte 1" class="w-full p-1 border"></th><th><input type="text" placeholder="Spalte 2" class="w-full p-1 border"></th></tr></thead><tbody><tr><td><input type="text" class="w-full p-1 border"></td><td><input type="text" class="w-full p-1 border"></td></tr></tbody></table>`;
            break;
        case 'link':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">🔗 Link</span><div class="flex gap-1"><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="url" name="url" placeholder="https://..." class="w-full p-2 border rounded mb-2"><input type="text" name="label" placeholder="Anzeigetext" class="w-full p-2 border rounded">`;
            break;
        case 'password':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">🔐 Passwort</span><div class="flex gap-1"><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="toggle-pw text-xs px-2 py-1 bg-blue-500 text-white rounded">👁️</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="password" class="w-full p-2 border rounded">`;
            break;
        case 'infobox':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">💡 Infobox</span><div class="flex gap-1"><select class="text-xs border rounded px-1"><option value="blue">Blau</option><option value="green">Grün</option><option value="yellow">Gelb</option><option value="red">Rot</option></select><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><textarea class="w-full p-2 border rounded bg-blue-50" rows="2"></textarea>`;
            break;
    }
    elementDiv.innerHTML = content;
    elementDiv.querySelector('.delete-element')?.addEventListener('click', () => {
        elementDiv.remove();
        if (container.children.length === 0) container.innerHTML = '<p class="text-gray-400 text-center text-sm">Füge Elemente hinzu...</p>';
    });
    const copyBtn = elementDiv.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            let textToCopy = '';
            if (type === 'text' || type === 'infobox') textToCopy = elementDiv.querySelector('textarea')?.value || '';
            else if (type === 'password') textToCopy = elementDiv.querySelector('input')?.value || '';
            else if (type === 'link') textToCopy = elementDiv.querySelector('input[name="url"]')?.value || '';
            navigator.clipboard.writeText(textToCopy).then(() => alertUser('Kopiert!', 'success'));
        });
    }
    const togglePw = elementDiv.querySelector('.toggle-pw');
    if (togglePw) {
        togglePw.addEventListener('click', () => {
            const input = elementDiv.querySelector('input');
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    }
    const addRowBtn = elementDiv.querySelector('.add-table-row');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            const tbody = elementDiv.querySelector('tbody');
            const colCount = elementDiv.querySelectorAll('thead th').length;
            const tr = document.createElement('tr');
            for (let i = 0; i < colCount; i++) tr.innerHTML += '<td><input type="text" class="w-full p-1 border"></td>';
            tbody.appendChild(tr);
        });
    }
    const colorSelect = elementDiv.querySelector('select');
    if (colorSelect && type === 'infobox') {
        colorSelect.addEventListener('change', (e) => {
            const textarea = elementDiv.querySelector('textarea');
            textarea.className = textarea.className.replace(/bg-\w+-\d+/, `bg-${e.target.value}-50`);
        });
    }
    container.appendChild(elementDiv);
}

function renderElement(element) {
    addElement(element.type);
    const container = document.getElementById('notiz-hauptteil-container');
    const lastEl = container.lastElementChild;
    switch (element.type) {
        case 'text': lastEl.querySelector('textarea').value = element.content || ''; break;
        case 'checkbox':
            lastEl.querySelector('input[type="checkbox"]').checked = element.checked || false;
            lastEl.querySelector('input[type="text"]').value = element.label || '';
            break;
        case 'link':
            lastEl.querySelector('input[name="url"]').value = element.url || '';
            lastEl.querySelector('input[name="label"]').value = element.label || '';
            break;
        case 'password': lastEl.querySelector('input').value = element.content || ''; break;
        case 'infobox':
            lastEl.querySelector('textarea').value = element.content || '';
            lastEl.querySelector('select').value = element.color || 'blue';
            break;
        case 'table':
            if (element.headers) {
                const headers = lastEl.querySelectorAll('thead input');
                element.headers.forEach((h, i) => { if (headers[i]) headers[i].value = h; });
            }
            if (element.rows) {
                const tbody = lastEl.querySelector('tbody');
                tbody.innerHTML = '';
                element.rows.forEach(row => {
                    const tr = document.createElement('tr');
                    row.forEach(cell => tr.innerHTML += `<td><input type="text" class="w-full p-1 border" value="${cell}"></td>`);
                    tbody.appendChild(tr);
                });
            }
            break;
    }
}

function openShareModal() {
    if (!currentEditingNotizId) {
        alertUser('Erst speichern', 'error');
        return;
    }
    const modal = document.getElementById('notizShareModal');
    if (!modal) {
        console.error('Notizen: Share-Modal nicht gefunden!');
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    console.log('Notizen: Share-Modal geöffnet');
    loadUserList();
}

async function loadUserList() {
    const select = document.getElementById('share-user-select');
    if (!select) return;
    try {
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'user-config');
        const snapshot = await getDocs(colRef);
        const options = snapshot.docs.filter(doc => doc.id !== currentUser.mode).map(doc => `<option value="${doc.id}">${doc.id}</option>`).join('');
        select.innerHTML = '<option value="">Bitte wählen...</option>' + options;
    } catch (error) {
        console.error('Fehler:', error);
    }
}

async function sendShareInvitation() {
    const userId = document.getElementById('share-user-select').value;
    const role = document.getElementById('share-role-select').value;
    if (!userId || !currentEditingNotizId) {
        alertUser('Benutzer auswählen', 'error');
        return;
    }
    try {
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
        await addDoc(colRef, { notizId: currentEditingNotizId, fromUserId: currentUser.mode, toUserId: userId, role, status: 'pending', createdAt: serverTimestamp() });
        alertUser('Einladung gesendet', 'success');
        document.getElementById('notizShareModal').classList.add('hidden');
    } catch (error) {
        alertUser('Fehler', 'error');
    }
}

function renderSharedUsers(sharedWith) {
    const container = document.getElementById('notiz-shared-users-list');
    if (!container) return;
    if (!sharedWith || Object.keys(sharedWith).length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">Privat</p>';
        return;
    }
    container.innerHTML = Object.entries(sharedWith).map(([userId, data]) => `
        <div class="flex justify-between text-sm bg-gray-50 p-2 rounded">
            <span>${userId} (${data.role === 'read' ? '👁️ Lesen' : '✏️ Schreiben'})</span>
            <button onclick="window.removeSharedUser('${userId}')" class="text-red-500 text-xs">Entfernen</button>
        </div>
    `).join('');
}

window.removeSharedUser = async function(userId) {
    if (!currentEditingNotizId || !confirm('Entziehen?')) return;
    try {
        const docRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', currentEditingNotizId);
        const docSnap = await getDoc(docRef);
        const data = docSnap.data();
        delete data.sharedWith[userId];
        await updateDoc(docRef, { sharedWith: data.sharedWith });
        await addHistory(currentEditingNotizId, `Berechtigung entzogen: ${userId}`, {});
        alertUser('Entzogen', 'success');
        renderSharedUsers(data.sharedWith);
    } catch (error) {
        alertUser('Fehler', 'error');
    }
};

async function loadEinladungen() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;
    if (einladungenListener) einladungenListener();
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
    const q = query(colRef, where('toUserId', '==', userId), where('status', '==', 'pending'));
    einladungenListener = onSnapshot(q, (snapshot) => {
        allEinladungen = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateEinladungenBadge();
    });
}

function updateEinladungenBadge() {
    const badge = document.getElementById('notizen-einladungen-badge');
    if (badge) {
        if (allEinladungen.length > 0) {
            badge.classList.remove('hidden');
            badge.textContent = allEinladungen.length;
        } else {
            badge.classList.add('hidden');
        }
    }
}

function openEinladungen() {
    const modal = document.getElementById('notizenEinladungenModal');
    if (!modal) {
        console.error('Notizen: Einladungen-Modal nicht gefunden!');
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    console.log('Notizen: Einladungen-Modal geöffnet');
    renderEinladungen();
}

function renderEinladungen() {
    const container = document.getElementById('notizen-einladungen-liste');
    if (!container) return;
    if (allEinladungen.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Keine Einladungen</p>';
        return;
    }
    container.innerHTML = allEinladungen.map(einl => `
        <div class="bg-white p-4 rounded-lg shadow border">
            <div class="mb-2"><span class="font-bold">${einl.fromUserId}</span> teilt eine Notiz</div>
            <div class="text-sm text-gray-600 mb-3">Berechtigung: ${einl.role === 'read' ? '👁️ Lesen' : '✏️ Schreiben'}</div>
            <div class="flex gap-2">
                <button onclick="window.acceptEinladung('${einl.id}')" class="px-3 py-1 bg-green-500 text-white rounded">✓ Annehmen</button>
                <button onclick="window.rejectEinladung('${einl.id}')" class="px-3 py-1 bg-red-500 text-white rounded">✕ Ablehnen</button>
            </div>
        </div>
    `).join('');
}

window.acceptEinladung = async function(einladungId) {
    const einladung = allEinladungen.find(e => e.id === einladungId);
    if (!einladung) return;
    try {
        const einlRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen', einladungId);
        await updateDoc(einlRef, { status: 'accepted', respondedAt: serverTimestamp() });
        const notizRef = doc(db, 'artifacts', appId, 'users', einladung.fromUserId, 'notizen', einladung.notizId);
        await updateDoc(notizRef, { [`sharedWith.${currentUser.mode}`]: { role: einladung.role, since: serverTimestamp(), status: 'active' } });
        alertUser('Angenommen', 'success');
    } catch (error) {
        alertUser('Fehler', 'error');
    }
};

window.rejectEinladung = async function(einladungId) {
    try {
        const einlRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen', einladungId);
        await updateDoc(einlRef, { status: 'rejected', respondedAt: serverTimestamp() });
        alertUser('Abgelehnt', 'success');
    } catch (error) {
        alertUser('Fehler', 'error');
    }
};

async function checkoutNotiz(notizId) {
    const docRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', notizId);
    try {
        await updateDoc(docRef, { checkedOutBy: currentUser.mode, checkedOutAt: serverTimestamp() });
        startCheckoutHeartbeat(notizId);
    } catch (error) {
        console.error('Checkout Fehler:', error);
    }
}

async function releaseCheckout(notizId) {
    if (!notizId) return;
    const docRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', notizId);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().checkedOutBy === currentUser.mode) {
            await updateDoc(docRef, { checkedOutBy: null, checkedOutAt: null });
        }
    } catch (error) {
        console.error('Release Fehler:', error);
    }
}

function startCheckoutHeartbeat(notizId) {
    stopCheckoutHeartbeat();
    checkoutHeartbeat = setInterval(async () => {
        if (currentEditingNotizId === notizId) {
            const docRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', notizId);
            try {
                await updateDoc(docRef, { checkedOutAt: serverTimestamp() });
            } catch (error) {
                console.warn('Heartbeat Fehler:', error);
            }
        } else {
            stopCheckoutHeartbeat();
        }
    }, 30000);
}

function stopCheckoutHeartbeat() {
    if (checkoutHeartbeat) {
        clearInterval(checkoutHeartbeat);
        checkoutHeartbeat = null;
    }
}

function showCheckoutWarning(userId) {
    const indicator = document.getElementById('notiz-checkout-indicator');
    const userSpan = document.getElementById('notiz-checkout-user');
    if (indicator && userSpan) {
        userSpan.textContent = userId;
        indicator.classList.remove('hidden');
    }
    document.getElementById('btn-notiz-save').disabled = true;
    document.querySelectorAll('#notiz-hauptteil-container input, #notiz-hauptteil-container textarea, #notiz-hauptteil-container select').forEach(el => el.disabled = true);
}

function hideCheckoutWarning() {
    const indicator = document.getElementById('notiz-checkout-indicator');
    if (indicator) indicator.classList.add('hidden');
    document.getElementById('btn-notiz-save').disabled = false;
    document.querySelectorAll('#notiz-hauptteil-container input, #notiz-hauptteil-container textarea, #notiz-hauptteil-container select').forEach(el => el.disabled = false);
}

async function addHistory(notizId, action, changes) {
    try {
        const colRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', notizId, 'history');
        await addDoc(colRef, { timestamp: serverTimestamp(), userId: currentUser.mode, action, changes: JSON.stringify(changes) });
    } catch (error) {
        console.error('History Fehler:', error);
    }
}

async function showHistory() {
    if (!currentEditingNotizId) return;
    const modal = document.getElementById('notizHistoryModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const container = document.getElementById('notiz-history-liste');
    container.innerHTML = '<p class="text-gray-400 text-center py-4">Lade...</p>';
    try {
        const colRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', currentEditingNotizId, 'history');
        const q = query(colRef, orderBy('timestamp', 'desc'), firestoreLimit(50));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4">Keine Historie</p>';
            return;
        }
        container.innerHTML = snapshot.docs.map(doc => {
            const data = doc.data();
            const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date();
            return `
                <div class="bg-gray-50 p-3 rounded border">
                    <div class="flex justify-between mb-1">
                        <span class="font-bold text-sm">${data.action}</span>
                        <span class="text-xs text-gray-500">${timestamp.toLocaleString('de-DE')}</span>
                    </div>
                    <div class="text-xs text-gray-600">von ${data.userId}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler</p>';
    }
}
