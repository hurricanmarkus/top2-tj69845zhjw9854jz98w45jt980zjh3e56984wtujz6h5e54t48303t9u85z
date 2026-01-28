// NOTIZEN-PROGRAMM - Strukturierte Notizen mit Kategorien, Sharing & Live-Sync
import { db, appId, currentUser, GUEST_MODE, alertUser } from './haupteingang.js';
import { collection, collectionGroup, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp, writeBatch, orderBy, limit as firestoreLimit, Timestamp, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let kategorienListener = null, notizenListener = null, sharedNotizenListener = null, einladungenListener = null;
let allKategorien = [], allNotizen = [], allEinladungen = [], allGesendetEinladungen = [];
let ownNotizen = [], sharedNotizen = [], sharedKategorieNotizen = [];
let gesendetEinladungenListener = null;
let currentEditingNotizId = null, currentEditingOwnerId = null, currentEditingSharedRole = null, checkoutHeartbeat = null;
let currentEditingNotizListener = null;
let shareUsersCache = [];
let currentSharingKategorieId = null;
let userConfigLoaded = false;
let userDisplayNameCache = {};
let notizIsEditMode = false;
let selectedNotizElementId = null;
let notizRowIdCounter = 0;
let notizElementIdCounter = 0;
let activeNotizFilters = [];

export function initializeNotizen() {
    console.log('Notizen: Init...');
    setupEventListeners();
    ensureUserConfigLoaded();
    loadKategorien();
    loadNotizen();
    loadEinladungen();

    // Default: NICHT Status Erledigt
    activeNotizFilters = [];
    addNotizSearchTag('status', 'erledigt', true);
}

async function ensureUserConfigLoaded() {
    if (userConfigLoaded) return;
    try {
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'user-config');
        const snapshot = await getDocs(colRef);
        userDisplayNameCache = {};
        snapshot.docs.forEach(docSnap => {
            const data = docSnap.data() || {};
            const displayName = data.realName || data.name || '';
            userDisplayNameCache[docSnap.id] = displayName;
        });
        userConfigLoaded = true;
    } catch (error) {
        console.warn('Notizen: Konnte user-config nicht laden:', error);
    }
}

function setupListElement(elementDiv) {
    const textarea = elementDiv.querySelector('.list-textarea') || elementDiv.querySelector('textarea');
    const preview = elementDiv.querySelector('.list-preview');
    const l1Style = elementDiv.querySelector('.list-style-l1');
    const l1Symbol = elementDiv.querySelector('.list-symbol-l1');
    const l2Style = elementDiv.querySelector('.list-style-l2');
    const l2Symbol = elementDiv.querySelector('.list-symbol-l2');
    if (!textarea || !preview || !l1Style || !l1Symbol || !l2Style || !l2Symbol) return;

    const setMode = (mode) => {
        if (mode === 'edit') {
            textarea.style.display = '';
            preview.style.display = 'none';
        } else {
            textarea.style.display = 'none';
            preview.style.display = '';
        }
    };

    const applySymbolVisibility = () => {
        l1Symbol.style.display = l1Style.value === 'number' ? 'none' : '';
        l2Symbol.style.display = l2Style.value === 'number' ? 'none' : '';
    };

    applySymbolVisibility();
    updateListPreview(elementDiv);

    const onAnyChange = () => {
        applySymbolVisibility();
        updateListPreview(elementDiv);
    };

    textarea.oninput = () => onAnyChange();
    l1Style.onchange = () => onAnyChange();
    l1Symbol.onchange = () => onAnyChange();
    l2Style.onchange = () => onAnyChange();
    l2Symbol.onchange = () => onAnyChange();

    textarea.onkeydown = (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                adjustTextareaIndent(textarea, -1);
            } else {
                adjustTextareaIndent(textarea, 1);
            }
            onAnyChange();
        }
    };

    const indentBtn = elementDiv.querySelector('.list-indent');
    const outdentBtn = elementDiv.querySelector('.list-outdent');
    if (indentBtn) {
        indentBtn.onclick = () => {
            setMode('edit');
            adjustTextareaIndent(textarea, 1);
            onAnyChange();
            textarea.focus();
        };
    }
    if (outdentBtn) {
        outdentBtn.onclick = () => {
            setMode('edit');
            adjustTextareaIndent(textarea, -1);
            onAnyChange();
            textarea.focus();
        };
    }

    preview.onclick = () => {
        if (textarea.disabled) return;
        setMode('edit');
        textarea.focus();
    };

    textarea.onblur = () => {
        if (textarea.disabled) return;
        onAnyChange();
        setMode('preview');
    };

    setMode('preview');
}

function adjustTextareaIndent(textarea, direction) {
    const value = textarea.value || '';
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;

    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;

    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    let deltaStart = 0;
    let deltaEnd = 0;

    const newLines = lines.map((line, idx) => {
        if (direction > 0) {
            if (line.trim().length === 0) return line;
            if (idx === 0 && start === lineStart) deltaStart += 1;
            deltaEnd += 1;
            return '\t' + line;
        }
        if (direction < 0) {
            if (line.startsWith('\t')) {
                if (idx === 0 && start > lineStart) deltaStart -= 1;
                deltaEnd -= 1;
                return line.slice(1);
            }
            if (line.startsWith('    ')) {
                if (idx === 0 && start > lineStart) deltaStart -= 4;
                deltaEnd -= 4;
                return line.slice(4);
            }
            return line;
        }
        return line;
    });

    const newBlock = newLines.join('\n');
    textarea.value = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);

    const newStart = Math.max(0, start + deltaStart);
    const newEnd = Math.max(0, end + deltaEnd);
    textarea.setSelectionRange(newStart, newEnd);
}

function updateListPreview(elementDiv) {
    const textarea = elementDiv.querySelector('.list-textarea') || elementDiv.querySelector('textarea');
    const preview = elementDiv.querySelector('.list-preview');
    const l1Style = elementDiv.querySelector('.list-style-l1');
    const l1Symbol = elementDiv.querySelector('.list-symbol-l1');
    const l2Style = elementDiv.querySelector('.list-style-l2');
    const l2Symbol = elementDiv.querySelector('.list-symbol-l2');
    if (!textarea || !preview || !l1Style || !l1Symbol || !l2Style || !l2Symbol) return;

    const items = parseListItems(textarea.value || '');
    if (items.length === 0) {
        preview.innerHTML = '<div class="text-xs text-gray-400">Vorschau...</div>';
        return;
    }

    let n1 = 0;
    let n2 = 0;
    const html = items.map(it => {
        if (it.level === 1) {
            n1 += 1;
            n2 = 0;
        } else {
            n2 += 1;
        }
        const style = it.level === 1 ? l1Style.value : l2Style.value;
        const symbol = it.level === 1 ? l1Symbol.value : l2Symbol.value;
        const prefix = style === 'number' ? `${it.level === 1 ? n1 : n2}.` : symbol;
        const ml = it.level === 2 ? 'ml-6' : '';
        return `
            <div class="flex gap-2 ${ml}">
                <div class="w-8 text-right font-bold">${escapeHtml(prefix)}</div>
                <div class="flex-1">${escapeHtml(it.text)}</div>
            </div>
        `;
    }).join('');

    preview.innerHTML = html;
}

function parseListItems(text) {
    const lines = String(text || '').split('\n');
    const items = [];
    lines.forEach(line => {
        const raw = String(line || '').replace(/\r/g, '');
        if (!raw.trim()) return;
        let level = 1;
        let t = raw;
        if (t.startsWith('\t')) {
            level = 2;
            t = t.replace(/^\t+/, '');
        } else if (t.startsWith('    ')) {
            level = 2;
            t = t.replace(/^\s{4}/, '');
        }
        items.push({ level, text: t.trim() });
    });
    return items;
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getDisplayNameById(userId) {
    const name = userDisplayNameCache[userId];
    return name && String(name).trim() ? name : 'Unbekannt';
}

export function listenForNotizen() {
    loadNotizen();
}

export function stopNotizenListeners() {
    if (kategorienListener) kategorienListener();
    if (notizenListener) notizenListener();
    if (sharedNotizenListener) sharedNotizenListener();
    if (einladungenListener) einladungenListener();
    stopCheckoutHeartbeat();
}

function extractOwnerIdFromDocRef(docRef) {
    try {
        const path = String(docRef?.path || '');
        const parts = path.split('/');
        const usersIdx = parts.indexOf('users');
        if (usersIdx >= 0 && parts.length > usersIdx + 1) return parts[usersIdx + 1];
    } catch (e) {
        // ignore
    }
    return null;
}

function recomputeAllNotizen() {
    allNotizen = [...ownNotizen, ...sharedNotizen, ...sharedKategorieNotizen];
    applyFilters();
    updateStats();
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
    setupBtn('btn-notiz-weitere-optionen', toggleNotizWeitereOptionen);
    setupBtn('notiz-dropdown-bearbeiten', enableNotizEditMode);
    setupBtn('notiz-dropdown-toggle-delete', toggleNotizDeleteOption);
    setupBtn('close-kategorie-share', closeKategorieShareModal);
    setupBtn('btn-kategorie-share-cancel', closeKategorieShareModal);
    setupBtn('btn-kategorie-share-send', saveKategorieShareSelection);
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

    ['search-notizen', 'filter-notizen-status', 'filter-notizen-kategorie', 'filter-notizen-subkategorie', 'filter-notizen-shared'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(id.includes('search') ? 'input' : 'change', applyFilters);
        }
    });

    const filterInput = document.getElementById('notiz-filter-input');
    if (filterInput && !filterInput.dataset.listenerAttached) {
        filterInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNotizFilterFromUi();
            }
        });
        filterInput.dataset.listenerAttached = 'true';
    }

    const addFilterBtn = document.getElementById('btn-add-notiz-filter');
    if (addFilterBtn && !addFilterBtn.dataset.listenerAttached) {
        addFilterBtn.addEventListener('click', addNotizFilterFromUi);
        addFilterBtn.dataset.listenerAttached = 'true';
    }

    const resetBtn = document.getElementById('reset-filters-notizen');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            ['search-notizen', 'filter-notizen-status', 'filter-notizen-kategorie', 'filter-notizen-subkategorie', 'filter-notizen-shared'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const subkategorieFilter = document.getElementById('filter-notizen-subkategorie');
            if (subkategorieFilter) subkategorieFilter.disabled = true;

            const ft = document.getElementById('notiz-filter-type');
            const fe = document.getElementById('notiz-filter-exclude');
            const fi = document.getElementById('notiz-filter-input');
            if (ft) ft.value = 'all';
            if (fe) fe.checked = false;
            if (fi) fi.value = '';

            activeNotizFilters = [];
            addNotizSearchTag('status', 'erledigt', true);

            applyFilters();
        });
    }

    const kategorieSelect = document.getElementById('notiz-kategorie');
    if (kategorieSelect) kategorieSelect.addEventListener('change', updateSubkategorienDropdown);

    const kategorieFilterSelect = document.getElementById('filter-notizen-kategorie');
    if (kategorieFilterSelect) kategorieFilterSelect.addEventListener('change', updateSubkategorienFilter);

    // Event-Listener für dynamische Element-Buttons
    const addElementButtons = document.querySelectorAll('.notiz-add-element');
    addElementButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.currentTarget.dataset.type;
            if (type) handleAddElementClick(type);
        });
    });
    console.log(`Notizen: ${addElementButtons.length} Element-Buttons gefunden`);

    const infoCb = document.getElementById('notiz-status-info');
    if (infoCb) {
        infoCb.addEventListener('change', () => {
            applyInfoStatusUI();
        });
    }
}

function applyInfoStatusUI() {
    const infoCb = document.getElementById('notiz-status-info');
    const statusSelect = document.getElementById('notiz-status');
    if (!infoCb || !statusSelect) return;

    if (infoCb.checked) {
        let infoOpt = statusSelect.querySelector('option[value="info"]');
        if (!infoOpt) {
            infoOpt = document.createElement('option');
            infoOpt.value = 'info';
            infoOpt.textContent = 'ℹ️ Info';
            statusSelect.appendChild(infoOpt);
        }
        statusSelect.value = 'info';
        statusSelect.disabled = true;
    } else {
        const infoOpt = statusSelect.querySelector('option[value="info"]');
        if (infoOpt) infoOpt.remove();
        statusSelect.disabled = false;
        if (!statusSelect.value || statusSelect.value === 'info') statusSelect.value = 'offen';
    }
}

function toggleNotizWeitereOptionen() {
    const dropdown = document.getElementById('notiz-weitere-optionen-dropdown');
    const arrow = document.getElementById('notiz-dropdown-arrow');
    if (!dropdown) return;

    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        if (arrow) arrow.textContent = '▲';
    } else {
        dropdown.classList.add('hidden');
        if (arrow) arrow.textContent = '▼';
        const deleteBtn = document.getElementById('btn-notiz-delete');
        const toggleBtn = document.getElementById('notiz-dropdown-toggle-delete');
        if (deleteBtn) deleteBtn.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = '🔓 Weitere Optionen';
    }
}

function toggleNotizDeleteOption() {
    const deleteBtn = document.getElementById('btn-notiz-delete');
    const toggleBtn = document.getElementById('notiz-dropdown-toggle-delete');
    if (!deleteBtn || !toggleBtn) return;

    if (deleteBtn.style.display === 'none' || deleteBtn.style.display === '') {
        deleteBtn.style.display = 'block';
        toggleBtn.textContent = '🔒 Löschen ausblenden';
    } else {
        deleteBtn.style.display = 'none';
        toggleBtn.textContent = '🔓 Weitere Optionen';
    }
}

function enableNotizEditMode() {
    console.log('Notizen: Edit-Mode aktiviert');
    if (currentEditingNotizId && currentEditingOwnerId && currentEditingOwnerId !== currentUser.mode) {
        if (currentEditingSharedRole !== 'write') {
            alertUser('Keine Schreib-Berechtigung', 'error');
            return;
        }
    }
    notizIsEditMode = true;
    const dropdown = document.getElementById('notiz-weitere-optionen-dropdown');
    const arrow = document.getElementById('notiz-dropdown-arrow');
    if (dropdown) dropdown.classList.add('hidden');
    if (arrow) arrow.textContent = '▼';

    // Zentrale Funktion aufrufen, die alle Element-Einstellungen wiederherstellt
    unlockEditFields();

    // Liste-Elemente neu initialisieren
    const container = document.getElementById('notiz-hauptteil-container');
    if (container) {
        container.querySelectorAll('[data-element-type]').forEach(el => {
            if (el.dataset.elementType === 'list') {
                setupListElement(el);
            }
        });

        container.querySelectorAll('.notiz-row').forEach(rowEl => {
            updateNotizRowLayout(rowEl);
        });
    }
}

function openKategorieShareModal(kategorieId) {
    currentSharingKategorieId = kategorieId;
    const modal = document.getElementById('kategorieShareModal');
    if (!modal) {
        alertUser('Teilen-Modal fehlt', 'error');
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    console.log('Notizen: Kategorie-Share geöffnet für', kategorieId);
    loadUserListForKategorieShare();
}

function closeKategorieShareModal() {
    const modal = document.getElementById('kategorieShareModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentSharingKategorieId = null;
}

async function loadUserListForKategorieShare() {
    const list = document.getElementById('kategorie-share-user-list');
    const searchInput = document.getElementById('kategorie-share-user-search');
    const selectedCount = document.getElementById('kategorie-share-selected-count');
    if (!list || !searchInput || !selectedCount) return;

    const kategorie = allKategorien.find(k => k.id === currentSharingKategorieId);
    const alreadyShared = kategorie?.sharedWith || {};

    try {
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'user-config');
        const snapshot = await getDocs(colRef);
        const users = snapshot.docs
            .filter(docSnap => docSnap.id !== currentUser.mode)
            .map(docSnap => {
                const data = docSnap.data() || {};
                const displayName = data.realName || data.name || 'Unbekannt';
                return { id: docSnap.id, displayName };
            })
            .sort((a, b) => (a.displayName || '').localeCompare((b.displayName || ''), 'de'));

        if (users.length === 0) {
            list.innerHTML = '<div class="p-3 text-sm text-gray-400 text-center">Keine Benutzer gefunden</div>';
            selectedCount.textContent = '0 ausgewählt';
            return;
        }

        list.innerHTML = users.map(u => {
            const displayText = u.displayName || u.id;
            const searchText = `${u.displayName} ${u.id}`.toLowerCase();
            const sharedData = alreadyShared[u.id];
            const sharedRole = sharedData?.role;
            const sharedStatus = sharedData?.status;
            const isActiveShare = sharedStatus === 'active' || sharedStatus === 'pending';
            const checkedAttr = sharedRole ? 'checked' : '';
            const roleValue = sharedRole || 'read';
            const statusBadge = sharedStatus === 'active' ? '<span class="text-xs text-green-600 ml-1">✓ aktiv</span>' : 
                               sharedStatus === 'pending' ? '<span class="text-xs text-yellow-600 ml-1">⏳ ausstehend</span>' : '';
            return `
                <div class="kategorie-share-user-row flex items-center justify-between gap-2 p-2 border-b last:border-b-0 ${isActiveShare ? 'bg-green-50' : ''}" data-search="${searchText}">
                    <label class="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        <input type="checkbox" class="kategorie-share-user-checkbox" data-userid="${u.id}" ${checkedAttr} ${isActiveShare ? 'disabled' : ''}>
                        <div class="min-w-0">
                            <div class="text-sm font-semibold truncate">${displayText}${statusBadge}</div>
                        </div>
                    </label>
                    ${isActiveShare ? `
                        <button onclick="window.revokeKategorieShare('${currentSharingKategorieId}', '${u.id}')" class="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600" title="Freigabe entziehen">✕ Entziehen</button>
                    ` : `
                        <select class="kategorie-share-user-role text-xs border rounded px-2 py-1" data-userid="${u.id}">
                            <option value="read" ${roleValue === 'read' ? 'selected' : ''}>👁️ Lesen</option>
                            <option value="write" ${roleValue === 'write' ? 'selected' : ''}>✏️ Schreiben</option>
                        </select>
                    `}
                </div>
            `;
        }).join('');

        const updateSelectedCount = () => {
            const checked = list.querySelectorAll('.kategorie-share-user-checkbox:checked').length;
            selectedCount.textContent = `${checked} ausgewählt`;
        };

        const applyFilter = () => {
            const term = (searchInput.value || '').trim().toLowerCase();
            list.querySelectorAll('.kategorie-share-user-row').forEach(row => {
                const hay = row.dataset.search || '';
                row.style.display = !term || hay.includes(term) ? '' : 'none';
            });
        };

        searchInput.value = '';
        searchInput.oninput = () => applyFilter();

        list.onchange = (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('kategorie-share-user-checkbox')) {
                updateSelectedCount();
            }
        };

        applyFilter();
        updateSelectedCount();
    } catch (error) {
        console.error('Notizen: Fehler beim Laden der Userliste (Kategorie teilen):', error);
    }
}

async function saveKategorieShareSelection() {
    const list = document.getElementById('kategorie-share-user-list');
    if (!list || !currentSharingKategorieId) {
        alertUser('Fehler', 'error');
        return;
    }

    const selected = Array.from(list.querySelectorAll('.kategorie-share-user-checkbox:checked')).map(cb => {
        const odUserId = cb.dataset.userid;
        const roleEl = list.querySelector(`.kategorie-share-user-role[data-userid="${odUserId}"]`);
        const role = roleEl ? roleEl.value : 'read';
        return { odUserId, role };
    }).filter(x => x.odUserId);

    if (selected.length === 0) {
        alertUser('Benutzer auswählen', 'error');
        return;
    }

    try {
        const ownerId = currentUser.mode;
        const docRef = doc(db, 'artifacts', appId, 'users', ownerId, 'notizen_kategorien', currentSharingKategorieId);
        const katSnap = await getDoc(docRef);
        const katData = katSnap.exists() ? (katSnap.data() || {}) : {};
        const existingShared = katData.sharedWith || {};

        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');

        const updatePayload = {};
        let createdCount = 0;
        let skippedCount = 0;

        // Zähle und prüfe
        for (const { odUserId, role } of selected) {
            const existing = existingShared[odUserId];
            const existingStatus = existing?.status;
            if (existingStatus === 'pending' || existingStatus === 'rejected' || existingStatus === 'active') {
                skippedCount += 1;
                continue;
            }
            updatePayload[`sharedWith.${odUserId}`] = {
                role,
                since: serverTimestamp(),
                status: 'pending',
                sharedBy: ownerId
            };
            createdCount += 1;
        }

        if (createdCount === 0) {
            alertUser('Keine Einladungen gesendet (bereits pending/rejected/aktiv)', 'error');
            return;
        }

        // Sammle Notiz-IDs vor dem Commit
        const notizenRef = collection(db, 'artifacts', appId, 'users', ownerId, 'notizen');
        const qNotizen = query(notizenRef, where('kategorieId', '==', currentSharingKategorieId));
        const notizenSnap = await getDocs(qNotizen);
        const notizIds = notizenSnap.docs.map(d => d.id);
        
        // Erstelle Einladungen mit Notiz-IDs (für späteres Laden durch User B)
        const batch = writeBatch(db);
        for (const { odUserId, role } of selected) {
            const existing = existingShared[odUserId];
            if (existing?.status === 'pending' || existing?.status === 'rejected' || existing?.status === 'active') continue;
            
            const invRef = doc(colRef);
            batch.set(invRef, {
                kategorieId: currentSharingKategorieId,
                type: 'kategorie',
                fromUserId: ownerId,
                toUserId: odUserId,
                role,
                status: 'pending',
                notizIds: notizIds,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        batch.update(docRef, updatePayload);
        await batch.commit();
        
        // Alle Notizen in dieser Kategorie mit pending-Status für die User teilen
        // (User A ist Owner und darf das)
        try {
            for (const notizDoc of notizenSnap.docs) {
                const notizUpdatePayload = {};
                for (const { odUserId, role } of selected) {
                    const existing = existingShared[odUserId];
                    if (existing?.status === 'pending' || existing?.status === 'rejected' || existing?.status === 'active') continue;
                    
                    notizUpdatePayload[`sharedWith.${odUserId}`] = {
                        role,
                        status: 'pending',
                        since: serverTimestamp(),
                        sharedBy: ownerId,
                        viaKategorie: currentSharingKategorieId
                    };
                }
                if (Object.keys(notizUpdatePayload).length > 0) {
                    await updateDoc(notizDoc.ref, notizUpdatePayload);
                }
            }
            console.log('Notizen: Notizen in Kategorie mit pending geteilt:', notizenSnap.size);
        } catch (notizError) {
            console.warn('Notizen: Fehler beim Teilen der Notizen:', notizError);
        }

        alertUser(`Einladungen gesendet: ${createdCount}${skippedCount ? ` (übersprungen: ${skippedCount})` : ''}`, 'success');
        closeKategorieShareModal();
        loadKategorien();
    } catch (error) {
        console.error('Notizen: Share error (Kategorie):', error);
        alertUser('Fehler beim Teilen', 'error');
    }
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
        await ensureUserConfigLoaded();
        allKategorien = [];
        
        // Eigene Kategorien
        for (const docSnap of snapshot.docs) {
            const kategorie = { id: docSnap.id, ...docSnap.data(), subkategorien: [], ownerId: userId };
            const subColRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', docSnap.id, 'subkategorien');
            const subSnap = await getDocs(subColRef);
            subSnap.forEach(subDoc => kategorie.subkategorien.push({ id: subDoc.id, ...subDoc.data() }));
            allKategorien.push(kategorie);
        }
        
        // Geteilte Kategorien laden (über akzeptierte Einladungen)
        // Bug-Fix: Robuste Deduplizierung - erst alle Einladungen sammeln, dann deduplizieren
        const sharedKatMap = new Map(); // Map<uniqueKey, {ownerId, kategorieId}>
        try {
            const einladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
            const qAccepted = query(einladungenRef, where('toUserId', '==', userId), where('status', '==', 'accepted'), where('type', '==', 'kategorie'));
            const acceptedSnap = await getDocs(qAccepted);
            
            // Sammle alle einzigartigen Kategorie-Referenzen
            for (const einlDoc of acceptedSnap.docs) {
                const einlData = einlDoc.data();
                const ownerId = einlData.fromUserId;
                const kategorieId = einlData.kategorieId;
                if (!ownerId || !kategorieId || ownerId === userId) continue;
                
                const uniqueKey = `${ownerId}_${kategorieId}`;
                // Nur hinzufügen wenn nicht bereits vorhanden
                if (!sharedKatMap.has(uniqueKey)) {
                    sharedKatMap.set(uniqueKey, { ownerId, kategorieId });
                }
            }
            
            // Lade jede einzigartige Kategorie nur einmal
            for (const [, { ownerId, kategorieId }] of sharedKatMap) {
                // Prüfe nochmal ob nicht schon in allKategorien (eigene Kategorien)
                if (allKategorien.some(k => k.id === kategorieId && k.ownerId === ownerId)) continue;
                
                try {
                    const katRef = doc(db, 'artifacts', appId, 'users', ownerId, 'notizen_kategorien', kategorieId);
                    const katSnap = await getDoc(katRef);
                    if (!katSnap.exists()) continue;
                    
                    const katData = katSnap.data() || {};
                    const kategorie = { id: katSnap.id, ...katData, subkategorien: [], ownerId, isSharedToMe: true };
                    const subColRef = collection(db, 'artifacts', appId, 'users', ownerId, 'notizen_kategorien', kategorieId, 'subkategorien');
                    const subSnap = await getDocs(subColRef);
                    subSnap.forEach(subDoc => kategorie.subkategorien.push({ id: subDoc.id, ...subDoc.data() }));
                    allKategorien.push(kategorie);
                } catch (katError) {
                    console.warn('Fehler beim Laden geteilter Kategorie:', kategorieId, katError);
                }
            }
        } catch (error) {
            console.warn('Fehler beim Laden geteilter Kategorien:', error);
        }
        
        // Finale Deduplizierung: Entferne Kategorien mit gleicher id+ownerId (Sicherheitsnetz)
        const seenKatKeys = new Set();
        allKategorien = allKategorien.filter(k => {
            const key = `${k.ownerId || 'unknown'}_${k.id}`;
            if (seenKatKeys.has(key)) {
                console.warn('Notizen: Duplikat-Kategorie entfernt:', key);
                return false;
            }
            seenKatKeys.add(key);
            return true;
        });
        
        renderKategorienListe();
        updateKategorienDropdowns();
        
        // Notizen aus geteilten Kategorien nachladen
        loadNotizenFromSharedKategorien();
    });
}

function renderKategorienListe() {
    const container = document.getElementById('kategorien-liste');
    if (!container) return;
    if (allKategorien.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Noch keine Kategorien</p>';
        return;
    }
    const userId = currentUser.mode;
    container.innerHTML = allKategorien.map(kat => {
        const isOwner = kat.createdBy === userId;
        const isShared = kat.sharedWith && Object.keys(kat.sharedWith).length > 0;
        const sharedBy = !isOwner && kat.createdBy ? kat.createdBy : null;
        return `
        <div class="border rounded-lg p-3 ${isShared ? 'bg-purple-50' : ''}">
            <div class="flex justify-between items-center mb-2">
                <div class="flex-1">
                    <span class="font-bold">📁 ${kat.name}</span>
                    ${sharedBy ? `<span class="text-xs text-purple-600 ml-2">(geteilt durch ${getDisplayNameById(sharedBy)})</span>` : ''}
                    ${isShared && isOwner ? '<span class="text-xs text-purple-600 ml-2">👥</span>' : ''}
                </div>
                <div class="flex gap-1">
                    ${isOwner ? `<button onclick="window.shareKategorie('${kat.id}')" class="text-blue-500 text-sm px-2" title="Teilen">👥</button>` : ''}
                    ${isOwner ? `<button onclick="window.deleteKategorie('${kat.id}')" class="text-red-500 text-sm">🗑️</button>` : ''}
                    ${!isOwner && kat.ownerId ? `<button onclick="window.leaveSharedKategorie('${kat.id}', '${kat.ownerId}')" class="text-red-500 text-sm px-2" title="Teilen beenden">🚪</button>` : ''}
                </div>
            </div>
            <div class="ml-4 space-y-1">
                ${kat.subkategorien.map(sub => {
                    const subIsOwner = sub.createdBy === userId;
                    const subSharedBy = !subIsOwner && sub.createdBy ? sub.createdBy : null;
                    return `
                    <div class="flex justify-between text-sm ${subSharedBy ? 'bg-purple-100 px-2 py-1 rounded' : ''}">
                        <span>📄 ${sub.name} ${subSharedBy ? `<span class="text-xs text-purple-600">(geteilt durch ${getDisplayNameById(subSharedBy)})</span>` : ''}</span>
                        ${subIsOwner ? `<button onclick="window.deleteSubkategorie('${kat.id}','${sub.id}')" class="text-red-500">✕</button>` : ''}
                    </div>
                `;
                }).join('')}
                ${isOwner || (kat.sharedWith && kat.sharedWith[userId] && kat.sharedWith[userId].role === 'write') ? `
                <div class="flex gap-2 mt-2">
                    <input type="text" id="neue-subkat-${kat.id}" placeholder="Neue Subkategorie..." class="flex-1 p-1 border rounded text-sm">
                    <button onclick="window.createSubkategorie('${kat.id}')" class="px-2 py-1 bg-amber-500 text-white text-xs rounded">➕</button>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    }).join('');
}

function showTextConfirmModal({ title, warningHtml, confirmPhrase, countdownSeconds = 0, onConfirm }) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 backdrop-blur-sm z-[90] flex items-center justify-center p-4';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div class="bg-gradient-to-r from-red-600 to-red-700 text-white p-4 rounded-t-2xl">
                <h3 class="text-xl font-bold select-none" style="user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;">${title}</h3>
            </div>
            <div class="p-6 space-y-4">
                <div class="bg-red-50 border-2 border-red-300 rounded-lg p-4">${warningHtml}</div>
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-2">Gib exakt ein: <span class="text-red-600 select-none" style="user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;">${confirmPhrase}</span></label>
                    <input type="text" class="confirm-text w-full p-3 border-2 border-gray-300 rounded-lg focus:border-red-500" placeholder="${confirmPhrase}">
                </div>
                <div class="text-center">
                    <button class="confirm-btn w-full py-3 bg-gray-300 text-gray-500 font-bold rounded-lg cursor-not-allowed transition" disabled>
                        <span class="confirm-btn-text"></span>
                    </button>
                </div>
            </div>
            <div class="bg-gray-100 p-4 rounded-b-2xl flex justify-end gap-3">
                <button class="cancel-btn px-6 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">Abbrechen</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const confirmInput = modal.querySelector('.confirm-text');
    const deleteBtn = modal.querySelector('.confirm-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const btnText = modal.querySelector('.confirm-btn-text');

    let countdown = countdownSeconds;
    let canDelete = countdownSeconds === 0;
    let interval = null;

    const updateDeleteButton = () => {
        const textCorrect = (confirmInput?.value || '') === confirmPhrase;
        if (canDelete && textCorrect) {
            deleteBtn.disabled = false;
            deleteBtn.className = 'w-full py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition cursor-pointer';
            if (btnText) {
                btnText.textContent = confirmPhrase === 'UNWIDERRUFLICH LÖSCHEN' ? '🗑️ JETZT UNWIDERRUFLICH LÖSCHEN' : '🗑️ JETZT LÖSCHEN';
            }
        } else {
            deleteBtn.disabled = true;
            deleteBtn.className = 'w-full py-3 bg-gray-300 text-gray-500 font-bold rounded-lg cursor-not-allowed transition';
            if (!canDelete) {
                if (btnText) btnText.textContent = `Warte ${countdown} Sekunden...`;
            } else {
                if (btnText) btnText.textContent = 'Bitte Text korrekt eingeben';
            }
        }
    };

    if (countdownSeconds > 0) {
        if (btnText) btnText.textContent = `Warte ${countdown} Sekunden...`;
        interval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                if (btnText) btnText.textContent = `Warte ${countdown} Sekunden...`;
            } else {
                clearInterval(interval);
                interval = null;
                canDelete = true;
                updateDeleteButton();
            }
        }, 1000);
    } else {
        if (btnText) btnText.textContent = '';
        updateDeleteButton();
    }

    confirmInput?.addEventListener('input', updateDeleteButton);

    cancelBtn?.addEventListener('click', () => {
        if (interval) clearInterval(interval);
        modal.remove();
    });

    deleteBtn?.addEventListener('click', async () => {
        const textCorrect = (confirmInput?.value || '') === confirmPhrase;
        if (!canDelete || !textCorrect) return;
        if (interval) clearInterval(interval);
        modal.remove();
        await onConfirm();
    });
}

async function deleteDocsInBatches(docRefs) {
    const refs = [...docRefs];
    while (refs.length > 0) {
        const batch = writeBatch(db);
        refs.splice(0, 400).forEach(ref => batch.delete(ref));
        await batch.commit();
    }
}

async function deleteNotizWithHistory(ownerUserId, notizId) {
    const histColRef = collection(db, 'artifacts', appId, 'users', ownerUserId, 'notizen', notizId, 'history');
    const histSnap = await getDocs(histColRef);
    await deleteDocsInBatches(histSnap.docs.map(d => d.ref));

    const einladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
    const qEinladungen = query(einladungenRef, where('notizId', '==', notizId), where('fromUserId', '==', ownerUserId));
    const einladungenSnap = await getDocs(qEinladungen);
    for (const einlDoc of einladungenSnap.docs) {
        await deleteDoc(einlDoc.ref);
    }
    console.log('Notizen: Notiz-Einladungen gelöscht:', einladungenSnap.size);

    const notizRef = doc(db, 'artifacts', appId, 'users', ownerUserId, 'notizen', notizId);
    await deleteDoc(notizRef);
}

async function createKategorie() {
    const input = document.getElementById('neue-kategorie-name');
    if (!input || !input.value.trim()) {
        alertUser('Bitte Name eingeben', 'error');
        return;
    }
    try {
        const colRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen_kategorien');
        await addDoc(colRef, { 
            name: input.value.trim(), 
            createdAt: serverTimestamp(), 
            createdBy: currentUser.mode,
            sharedWith: {}
        });
        input.value = '';
        alertUser('Kategorie erstellt', 'success');
    } catch (error) {
        alertUser('Fehler', 'error');
    }
}

window.shareKategorie = async function(kategorieId) {
    const kategorie = allKategorien.find(k => k.id === kategorieId);
    if (!kategorie) return;
    openKategorieShareModal(kategorieId);
};

window.createSubkategorie = async function(kategorieId) {
    const input = document.getElementById(`neue-subkat-${kategorieId}`);
    if (!input || !input.value.trim()) return;
    try {
        const colRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen_kategorien', kategorieId, 'subkategorien');
        await addDoc(colRef, { name: input.value.trim(), createdAt: serverTimestamp(), createdBy: currentUser.mode });
        input.value = '';
        alertUser('Subkategorie erstellt', 'success');
        // Kategorien neu laden um Subkategorien anzuzeigen
        loadKategorien();
    } catch (error) {
        alertUser('Fehler', 'error');
    }
};

window.deleteKategorie = async function(kategorieId) {
    const userId = currentUser.mode;
    const kat = allKategorien.find(k => k.id === kategorieId);
    const title = kat?.name ? `⚠️ KATEGORIE UNWIDERRUFLICH LÖSCHEN` : '⚠️ KATEGORIE UNWIDERRUFLICH LÖSCHEN';
    const name = kat?.name || '';

    showTextConfirmModal({
        title,
        warningHtml: `
            <p class="text-sm font-bold text-red-800 mb-2">⚠️ ACHTUNG: Diese Aktion ist UNWIDERRUFLICH!</p>
            <p class="text-sm text-red-700">Die Kategorie <strong>${name}</strong> wird dauerhaft gelöscht, einschließlich:</p>
            <ul class="text-sm text-red-700 list-disc list-inside mt-2 space-y-1">
                <li>Alle Notizen in dieser Kategorie</li>
                <li>Alle Subkategorien</li>
                <li>Alle zugehörigen Daten</li>
            </ul>
        `,
        confirmPhrase: 'UNWIDERRUFLICH LÖSCHEN',
        countdownSeconds: 60,
        onConfirm: async () => {
            try {
                console.log('Notizen: Starte Kategorie-Löschung (Cascade):', kategorieId);

                // Zugehörige Einladungen löschen
                const einladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
                const qEinladungen = query(einladungenRef, where('kategorieId', '==', kategorieId), where('fromUserId', '==', userId));
                const einladungenSnap = await getDocs(qEinladungen);
                for (const einlDoc of einladungenSnap.docs) {
                    await deleteDoc(einlDoc.ref);
                }
                console.log('Notizen: Einladungen gelöscht:', einladungenSnap.size);

                const notizenRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen');
                const qNotizen = query(notizenRef, where('kategorieId', '==', kategorieId));
                const notesSnap = await getDocs(qNotizen);

                for (const d of notesSnap.docs) {
                    await deleteNotizWithHistory(userId, d.id);
                }

                const subColRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', kategorieId, 'subkategorien');
                const subSnap = await getDocs(subColRef);
                await deleteDocsInBatches(subSnap.docs.map(d => d.ref));

                const katRef = doc(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', kategorieId);
                await deleteDoc(katRef);

                alertUser('Kategorie gelöscht', 'success');
                loadKategorien();
            } catch (error) {
                console.error('Notizen: Fehler beim Löschen der Kategorie:', error);
                alertUser('Fehler', 'error');
            }
        }
    });
};

window.deleteSubkategorie = async function(kategorieId, subkategorieId) {
    const userId = currentUser.mode;
    const kat = allKategorien.find(k => k.id === kategorieId);
    const sub = kat?.subkategorien?.find(s => s.id === subkategorieId);
    const name = sub?.name || '';

    showTextConfirmModal({
        title: '⚠️ SUBKATEGORIE UNWIDERRUFLICH LÖSCHEN',
        warningHtml: `
            <p class="text-sm font-bold text-red-800 mb-2">⚠️ ACHTUNG: Diese Aktion ist UNWIDERRUFLICH!</p>
            <p class="text-sm text-red-700">Die Subkategorie <strong>${name}</strong> wird dauerhaft gelöscht, einschließlich:</p>
            <ul class="text-sm text-red-700 list-disc list-inside mt-2 space-y-1">
                <li>Alle Notizen in dieser Subkategorie</li>
                <li>Alle zugehörigen Daten</li>
            </ul>
        `,
        confirmPhrase: 'UNWIDERRUFLICH LÖSCHEN',
        countdownSeconds: 60,
        onConfirm: async () => {
            try {
                console.log('Notizen: Starte Subkategorie-Löschung (Cascade):', kategorieId, subkategorieId);

                const notizenRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen');
                const qNotizen = query(notizenRef, where('subkategorieId', '==', subkategorieId));
                const notesSnap = await getDocs(qNotizen);

                for (const d of notesSnap.docs) {
                    await deleteNotizWithHistory(userId, d.id);
                }

                const docRef = doc(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', kategorieId, 'subkategorien', subkategorieId);
                await deleteDoc(docRef);

                alertUser('Subkategorie gelöscht', 'success');
                loadKategorien();
            } catch (error) {
                console.error('Notizen: Fehler beim Löschen der Subkategorie:', error);
                alertUser('Fehler', 'error');
            }
        }
    });
};

window.leaveSharedKategorie = async function(kategorieId, ownerId) {
    if (!confirm('Teilen wirklich beenden? Du verlierst den Zugriff auf diese Kategorie.')) return;
    try {
        const userId = currentUser.mode;
        
        // Einladung auf 'left' setzen (damit User A es sieht)
        const einladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
        const qEinl = query(einladungenRef, where('kategorieId', '==', kategorieId), where('toUserId', '==', userId), where('status', '==', 'accepted'));
        const einlSnap = await getDocs(qEinl);
        for (const einlDoc of einlSnap.docs) {
            await updateDoc(einlDoc.ref, { status: 'left', updatedAt: serverTimestamp() });
        }
        
        // sharedWith von Kategorie entfernen
        const katRef = doc(db, 'artifacts', appId, 'users', ownerId, 'notizen_kategorien', kategorieId);
        const updatePayload = {};
        updatePayload[`sharedWith.${userId}`] = deleteField();
        await updateDoc(katRef, updatePayload);
        
        // sharedWith von allen Notizen in dieser Kategorie entfernen
        try {
            const notizenRef = collection(db, 'artifacts', appId, 'users', ownerId, 'notizen');
            const qNotizen = query(notizenRef, where('kategorieId', '==', kategorieId));
            const notizenSnap = await getDocs(qNotizen);
            for (const notizDoc of notizenSnap.docs) {
                const notizUpdatePayload = {};
                notizUpdatePayload[`sharedWith.${userId}`] = deleteField();
                await updateDoc(notizDoc.ref, notizUpdatePayload);
            }
            console.log('Notizen: sharedWith von', notizenSnap.size, 'Notizen entfernt (User verlässt Kategorie)');
        } catch (notizError) {
            console.warn('Notizen: Fehler beim Entfernen der Notiz-Freigaben:', notizError);
        }
        
        alertUser('Teilen beendet', 'success');
        loadKategorien();
    } catch (error) {
        console.error('Notizen: Fehler beim Beenden des Teilens:', error);
        alertUser('Fehler', 'error');
    }
};

window.revokeKategorieShare = async function(kategorieId, targetUserId) {
    const targetName = getDisplayNameById(targetUserId) || targetUserId;
    if (!confirm(`Freigabe für "${targetName}" wirklich entziehen?`)) return;
    try {
        const ownerId = currentUser.mode;
        
        // Einladung auf 'cancelled' setzen
        const einladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
        const qEinl = query(einladungenRef, where('kategorieId', '==', kategorieId), where('fromUserId', '==', ownerId), where('toUserId', '==', targetUserId), where('status', 'in', ['pending', 'accepted']));
        const einlSnap = await getDocs(qEinl);
        for (const einlDoc of einlSnap.docs) {
            await updateDoc(einlDoc.ref, { status: 'cancelled', updatedAt: serverTimestamp() });
        }
        
        // sharedWith von Kategorie entfernen
        const katRef = doc(db, 'artifacts', appId, 'users', ownerId, 'notizen_kategorien', kategorieId);
        const updatePayload = {};
        updatePayload[`sharedWith.${targetUserId}`] = deleteField();
        await updateDoc(katRef, updatePayload);
        
        // sharedWith von allen Notizen in dieser Kategorie entfernen
        try {
            const notizenRef = collection(db, 'artifacts', appId, 'users', ownerId, 'notizen');
            const qNotizen = query(notizenRef, where('kategorieId', '==', kategorieId));
            const notizenSnap = await getDocs(qNotizen);
            for (const notizDoc of notizenSnap.docs) {
                const notizUpdatePayload = {};
                notizUpdatePayload[`sharedWith.${targetUserId}`] = deleteField();
                await updateDoc(notizDoc.ref, notizUpdatePayload);
            }
            console.log('Notizen: sharedWith von', notizenSnap.size, 'Notizen entfernt (Owner entzieht Freigabe)');
        } catch (notizError) {
            console.warn('Notizen: Fehler beim Entfernen der Notiz-Freigaben:', notizError);
        }
        
        alertUser('Freigabe entzogen', 'success');
        closeKategorieShareModal();
        loadKategorien();
    } catch (error) {
        console.error('Notizen: Fehler beim Entziehen der Freigabe:', error);
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
        if (v) updateSubkategorienFilter();
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

function updateSubkategorienFilter() {
    const kategorieFilterSelect = document.getElementById('filter-notizen-kategorie');
    const subkategorieFilterSelect = document.getElementById('filter-notizen-subkategorie');
    if (!kategorieFilterSelect || !subkategorieFilterSelect) return;
    
    const kategorieId = kategorieFilterSelect.value;
    if (!kategorieId) {
        subkategorieFilterSelect.disabled = true;
        subkategorieFilterSelect.innerHTML = '<option value="">Alle Subkategorien</option>';
        subkategorieFilterSelect.value = '';
        applyFilters();
        return;
    }
    
    const kategorie = allKategorien.find(k => k.id === kategorieId);
    if (!kategorie || !kategorie.subkategorien.length) {
        subkategorieFilterSelect.disabled = true;
        subkategorieFilterSelect.innerHTML = '<option value="">Keine Subkategorien</option>';
        subkategorieFilterSelect.value = '';
        applyFilters();
        return;
    }
    
    subkategorieFilterSelect.disabled = false;
    subkategorieFilterSelect.innerHTML = '<option value="">Alle Subkategorien dieser Kategorie</option>' + 
        kategorie.subkategorien.map(sub => `<option value="${sub.id}">${sub.name}</option>`).join('');
    subkategorieFilterSelect.value = '';
    applyFilters();
}

async function loadNotizen() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;
    if (notizenListener) notizenListener();
    if (sharedNotizenListener) sharedNotizenListener();
    const colRef = collection(db, 'artifacts', appId, 'users', userId, 'notizen');
    notizenListener = onSnapshot(colRef, (snapshot) => {
        ownNotizen = snapshot.docs.map(docSnap => {
            const data = docSnap.data() || {};
            const ownerId = data.owner || userId;
            return { id: docSnap.id, ...data, ownerId };
        });
        recomputeAllNotizen();
    });

    // Geteilte Notizen werden über loadNotizenFromSharedKategorien geladen
    // (collectionGroup Query benötigt speziellen Index)
    sharedNotizen = [];
    
    // Notizen aus geteilten Kategorien laden
    loadNotizenFromSharedKategorien();
}

async function loadNotizenFromSharedKategorien() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;
    
    // Geteilte Kategorien aus allKategorien filtern
    const sharedKats = allKategorien.filter(k => k.ownerId && k.ownerId !== userId);
    
    if (sharedKats.length === 0) {
        sharedKategorieNotizen = [];
        recomputeAllNotizen();
        return;
    }
    
    const notizenFromKats = [];
    const loadedNotizKeys = new Set();
    
    // Lade ALLE Notizen aus geteilten Kategorien dynamisch (nicht nur notizIds aus Einladung)
    for (const kat of sharedKats) {
        const ownerId = kat.ownerId;
        const kategorieId = kat.id;
        
        if (!ownerId || !kategorieId) continue;
        
        try {
            const notizenRef = collection(db, 'artifacts', appId, 'users', ownerId, 'notizen');
            const qNotizen = query(notizenRef, where('kategorieId', '==', kategorieId));
            const notizenSnap = await getDocs(qNotizen);
            
            for (const notizDoc of notizenSnap.docs) {
                const uniqueKey = `${ownerId}_${notizDoc.id}`;
                if (loadedNotizKeys.has(uniqueKey)) continue;
                loadedNotizKeys.add(uniqueKey);
                
                const data = notizDoc.data() || {};
                notizenFromKats.push({
                    id: notizDoc.id,
                    ...data,
                    ownerId: ownerId,
                    fromSharedKategorie: true
                });
            }
        } catch (katError) {
            console.warn('Notizen: Fehler beim Laden Notizen aus Kategorie', kategorieId, katError);
        }
    }
    
    sharedKategorieNotizen = notizenFromKats;
    console.log('Notizen: Geteilte Kategorie-Notizen geladen:', notizenFromKats.length);
    recomputeAllNotizen();
}

function applyFilters() {
    const searchTerm = document.getElementById('search-notizen')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('filter-notizen-status')?.value || '';
    const kategorieFilter = document.getElementById('filter-notizen-kategorie')?.value || '';
    const subkategorieFilter = document.getElementById('filter-notizen-subkategorie')?.value || '';
    const sharedFilter = document.getElementById('filter-notizen-shared')?.value || '';
    const userId = currentUser.mode;

    let filtered = allNotizen.filter(notiz => {
        if (statusFilter) {
            if (statusFilter === 'offen') {
                if (notiz.status !== 'offen' && notiz.status !== 'info') return false;
            } else {
                if (notiz.status !== statusFilter) return false;
            }
        }
        
        // Kategorie-Filter: Wenn Kategorie gewählt aber KEINE Subkategorie, zeige alle Notizen dieser Kategorie
        if (kategorieFilter && !subkategorieFilter && notiz.kategorieId !== kategorieFilter) return false;
        
        // Subkategorie-Filter: Wenn Subkategorie gewählt, zeige nur Notizen dieser Subkategorie
        if (subkategorieFilter && notiz.subkategorieId !== subkategorieFilter) return false;
        
        const ownerId = notiz.ownerId || notiz.owner || notiz.createdBy || '';
        if (sharedFilter === 'own' && ownerId !== userId) return false;
        if (sharedFilter === 'shared' && ownerId === userId) return false;
        if (searchTerm) {
            const searchable = `${notiz.betreff} ${notiz.status}`.toLowerCase();
            if (!searchable.includes(searchTerm)) return false;
        }
        return true;
    });

    if (activeNotizFilters.length > 0) {
        filtered = filtered.filter((n) => {
            return activeNotizFilters.every((filter) => {
                const matches = doesNotizMatchSearchFilter(n, filter);
                return filter.exclude ? !matches : matches;
            });
        });
    }

    renderNotizenListe(filtered);
}

function addNotizFilterFromUi() {
    const typeEl = document.getElementById('notiz-filter-type');
    const excludeEl = document.getElementById('notiz-filter-exclude');
    const inputEl = document.getElementById('notiz-filter-input');

    const type = String(typeEl?.value || 'all');
    const exclude = !!excludeEl?.checked;
    const term = String(inputEl?.value || '').trim();
    if (!term) return;

    addNotizSearchTag(type, term, exclude);

    if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
    }
}

function addNotizSearchTag(type, term, exclude) {
    const normalizedTerm = String(term || '').trim().toLowerCase();
    if (!normalizedTerm) return;

    const duplicate = activeNotizFilters.some(f => f.type === type && f.term === normalizedTerm && !!f.exclude === !!exclude);
    if (duplicate) return;

    const typeLabels = {
        all: 'Alles',
        status: 'Status',
        kategorie: 'Kategorie',
        subkategorie: 'Subkategorie',
        shared: 'Geteilt'
    };

    const label = type === 'all'
        ? `${exclude ? 'NICHT ' : ''}Alles: "${term}"`
        : `${exclude ? 'NICHT ' : ''}${typeLabels[type] || type}: ${term}`;

    console.log('Notizen: Filter-Tag hinzugefügt:', label);
    activeNotizFilters.push({ type, term: normalizedTerm, exclude: !!exclude, label });
    renderNotizSearchTags();
    applyFilters();
}

function renderNotizSearchTags() {
    const container = document.getElementById('active-notiz-search-tags');
    if (!container) return;
    container.innerHTML = '';

    activeNotizFilters.forEach((filter, index) => {
        const tag = document.createElement('div');
        tag.className = 'flex items-center bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full border border-amber-200';
        tag.innerHTML = `
            <span>${escapeHtml(filter.label)}</span>
            <button class="ml-1 text-amber-600 hover:text-amber-900 focus:outline-none" onclick="window.removeNotizSearchTagGlobal(${index})">&times;</button>
        `;
        container.appendChild(tag);
    });
}

window.removeNotizSearchTagGlobal = (index) => {
    activeNotizFilters.splice(index, 1);
    renderNotizSearchTags();
    applyFilters();
};

function doesNotizMatchSearchFilter(notiz, filter) {
    const term = String(filter?.term || '').toLowerCase().trim();
    if (!term) return true;

    const contains = (val) => String(val || '').toLowerCase().includes(term);

    const kategorie = allKategorien.find(k => k.id === notiz.kategorieId);
    const kategorieName = kategorie?.name || '';
    const sub = kategorie?.subkategorien?.find(s => s.id === notiz.subkategorieId);
    const subName = sub?.name || '';

    if (filter.type === 'status') return contains(notiz.status);
    if (filter.type === 'kategorie') return contains(kategorieName);
    if (filter.type === 'subkategorie') return contains(subName);
    if (filter.type === 'shared') {
        const isShared = notiz.sharedWith && Object.keys(notiz.sharedWith).length > 0;
        if (term === 'ja' || term === 'true' || term === '1') return isShared;
        if (term === 'nein' || term === 'false' || term === '0') return !isShared;
        return contains(isShared ? 'ja' : 'nein');
    }

    return [
        notiz.betreff,
        notiz.status,
        kategorieName,
        subName
    ].some(contains);
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
        const ownerId = notiz.ownerId || notiz.owner || notiz.createdBy || '';
        const kategorie = allKategorien.find(k => k.id === notiz.kategorieId && (!k.ownerId || k.ownerId === ownerId || k.createdBy === ownerId));
        const kategorieName = kategorie?.name || 'Unbekannt';
        const isIncomingShared = ownerId && ownerId !== currentUser.mode;
        const isShared = !!isIncomingShared || (notiz.sharedWith && Object.keys(notiz.sharedWith).length > 0);
        const isCheckedOut = notiz.checkedOutBy && notiz.checkedOutBy !== currentUser.mode;
        const statusColors = { 'offen': 'bg-blue-100 text-blue-800', 'in_bearbeitung': 'bg-yellow-100 text-yellow-800', 'erledigt': 'bg-green-100 text-green-800', 'info': 'bg-blue-100 text-blue-800' };
        const statusIcons = { 'offen': '🔵', 'in_bearbeitung': '🟡', 'erledigt': '🟢', 'info': 'ℹ️' };
        const statusLabels = { 'offen': 'Offen', 'in_bearbeitung': 'In Bearbeitung', 'erledigt': 'Erledigt', 'info': 'INFO' };
        const borderClass = notiz.status === 'offen' ? 'border-blue-500' : notiz.status === 'in_bearbeitung' ? 'border-yellow-500' : notiz.status === 'info' ? 'border-blue-500' : 'border-green-500';
        return `
            <div onclick="window.openNotizById('${notiz.id}','${ownerId}')" class="bg-white p-4 rounded-lg shadow hover:shadow-md transition border-l-4 ${borderClass} cursor-pointer">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-lg">${notiz.betreff || 'Ohne Titel'}</h3>
                    <div class="flex gap-2">
                        ${isShared ? '<span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">👥</span>' : ''}
                        ${isCheckedOut ? '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">🔒</span>' : ''}
                        <span class="text-xs px-2 py-1 rounded ${statusColors[notiz.status] || 'bg-gray-100'}">${statusIcons[notiz.status] || ''} ${statusLabels[notiz.status] || notiz.status}</span>
                    </div>
                </div>
                <div class="text-sm text-gray-600 mb-3">
                    <span class="mr-3">📁 ${kategorieName}</span>
                    ${isIncomingShared ? `<span class="text-xs text-purple-600">(geteilt von ${escapeHtml(getDisplayNameById(ownerId))})</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function updateStats() {
    const total = allNotizen.length;
    const offen = allNotizen.filter(n => n.status === 'offen' || n.status === 'info').length;
    const bearbeitung = allNotizen.filter(n => n.status === 'in_bearbeitung').length;
    const shared = allNotizen.filter(n => n.sharedWith && Object.keys(n.sharedWith).length > 0).length;
    const setCount = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setCount('notizen-count-total', total);
    setCount('notizen-count-offen', offen);
    setCount('notizen-count-bearbeitung', bearbeitung);
    setCount('notizen-count-shared', shared);
}

window.openNotizById = function(notizId, ownerId = null) { openNotizEditor(notizId, ownerId); };

async function openNotizEditor(notizId = null, ownerId = null) {
    currentEditingNotizId = notizId;
    currentEditingOwnerId = ownerId || (notizId ? null : currentUser.mode);
    currentEditingSharedRole = null;
    selectedNotizElementId = null;
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
    const optionsBtn = document.getElementById('btn-notiz-weitere-optionen');
    const optionsDropdown = document.getElementById('notiz-weitere-optionen-dropdown');
    const optionsToggleDelete = document.getElementById('notiz-dropdown-toggle-delete');
    const infoCb = document.getElementById('notiz-status-info');

    if (notizId) {
        notizIsEditMode = false;
        if (titleEl) titleEl.textContent = '📝 Notiz ansehen';
        if (optionsBtn) optionsBtn.classList.remove('hidden');
        if (optionsDropdown) optionsDropdown.classList.add('hidden');
        if (optionsToggleDelete) optionsToggleDelete.textContent = '🔓 Weitere Optionen';
        if (deleteBtn) deleteBtn.style.display = 'none';
        await loadNotizData(notizId, ownerId);
        if (currentEditingOwnerId === currentUser.mode) {
            await checkoutNotiz(notizId);
        }
    } else {
        if (titleEl) titleEl.textContent = '📝 Neue Notiz';
        notizIsEditMode = true;
        if (optionsBtn) optionsBtn.classList.add('hidden');
        if (optionsDropdown) optionsDropdown.classList.add('hidden');
        if (deleteBtn) deleteBtn.style.display = 'none';
        resetEditorForm();
        if (infoCb) infoCb.checked = false;
        applyInfoStatusUI();
    }
}

async function loadNotizData(notizId, ownerId = null) {
    await ensureUserConfigLoaded();
    const effectiveOwnerId = ownerId || currentEditingOwnerId || currentUser.mode;
    currentEditingOwnerId = effectiveOwnerId;
    const docRef = doc(db, 'artifacts', appId, 'users', effectiveOwnerId, 'notizen', notizId);
    
    // Stoppe vorherigen Listener falls vorhanden
    if (currentEditingNotizListener) {
        currentEditingNotizListener();
        currentEditingNotizListener = null;
    }
    
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        alertUser('Nicht gefunden', 'error');
        closeNotizEditor();
        return;
    }
    const notiz = docSnap.data();
    
    // Live-Listener für diese Notiz starten (sharedWith, checkedOutBy, etc.)
    currentEditingNotizListener = onSnapshot(docRef, (snap) => {
        if (!snap.exists()) {
            // Notiz wurde gelöscht
            alertUser('Notiz wurde gelöscht', 'error');
            closeNotizEditor();
            return;
        }
        const liveData = snap.data();
        
        // Update sharedWith Liste
        renderSharedUsers(liveData.sharedWith);
        
        // Update Checkout-Warnung
        if (liveData.checkedOutBy && liveData.checkedOutBy !== currentUser.mode) {
            showCheckoutWarning(liveData.checkedOutBy);
        } else if (!liveData.checkedOutBy) {
            hideCheckoutWarning();
        }
        
        // Update Rolle für User B
        if (effectiveOwnerId !== currentUser.mode) {
            const newRole = liveData.sharedWith?.[currentUser.mode]?.role;
            if (!liveData.sharedWith?.[currentUser.mode]) {
                // User B wurde entfernt - Editor schließen
                alertUser('Zugriff wurde entzogen', 'error');
                closeNotizEditor();
                loadNotizenFromSharedKategorien();
            } else if (newRole !== currentEditingSharedRole) {
                currentEditingSharedRole = newRole;
                // UI aktualisieren für neue Rolle
                const optionsBtn = document.getElementById('btn-notiz-weitere-optionen');
                const saveBtn = document.getElementById('btn-notiz-save');
                if (newRole === 'write') {
                    if (optionsBtn) optionsBtn.style.display = '';
                    if (saveBtn) { saveBtn.style.display = ''; saveBtn.disabled = false; }
                } else {
                    if (optionsBtn) optionsBtn.style.display = 'none';
                    if (saveBtn) saveBtn.style.display = 'none';
                }
            }
        }
    });

    if (effectiveOwnerId !== currentUser.mode) {
        currentEditingSharedRole = notiz?.sharedWith?.[currentUser.mode]?.role || 'read';
    } else {
        currentEditingSharedRole = null;
    }

    const isOwner = effectiveOwnerId === currentUser.mode;
    const shareBtn = document.getElementById('btn-notiz-share');
    const optionsBtn = document.getElementById('btn-notiz-weitere-optionen');
    const saveBtn = document.getElementById('btn-notiz-save');
    const statusSelectEl = document.getElementById('notiz-status');
    const infoCbEl = document.getElementById('notiz-status-info');

    if (shareBtn) shareBtn.style.display = isOwner ? '' : 'none';
    if (optionsBtn) optionsBtn.style.display = isOwner || currentEditingSharedRole === 'write' ? '' : 'none';
    
    // User B (nur Leserechte): Speicher-Button komplett verstecken, Status deaktivieren
    const isReadOnly = !isOwner && currentEditingSharedRole !== 'write';
    if (saveBtn) {
        if (isReadOnly) {
            saveBtn.style.display = 'none';
        } else {
            saveBtn.style.display = '';
            saveBtn.disabled = false;
        }
    }
    if (isReadOnly) {
        if (statusSelectEl) statusSelectEl.disabled = true;
        if (infoCbEl) infoCbEl.disabled = true;
    }

    document.getElementById('notiz-betreff').value = notiz.betreff || '';
    document.getElementById('notiz-kategorie').value = notiz.kategorieId || '';
    updateSubkategorienDropdown();
    document.getElementById('notiz-subkategorie').value = notiz.subkategorieId || '';
    if (infoCbEl) infoCbEl.checked = (notiz.status === 'info');
    if (statusSelectEl) statusSelectEl.value = notiz.status || 'offen';
    applyInfoStatusUI();
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
    renderElements(notiz.elements);
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
        document.getElementById('notiz-meta-edited').textContent = notiz.lastEditedAt ? new Date(notiz.lastEditedAt.toDate()).toLocaleString('de-DE') + ' von ' + getDisplayNameById(notiz.lastEditedBy) : 'Noch nicht bearbeitet';
    }
    
    // Felder sperren beim Bearbeiten (außer Status und Checkboxen)
    lockEditFields();

    // User B (nur Leserechte): ALLE Felder komplett deaktivieren
    if (!isOwner && currentEditingSharedRole !== 'write') {
        // Status-Dropdown und INFO-Checkbox deaktivieren
        const statusEl = document.getElementById('notiz-status');
        const infoCbEl2 = document.getElementById('notiz-status-info');
        if (statusEl) statusEl.disabled = true;
        if (infoCbEl2) infoCbEl2.disabled = true;
        
        // Alle Basis-Felder deaktivieren
        ['notiz-betreff', 'notiz-kategorie', 'notiz-subkategorie', 'notiz-erinnerung', 'notiz-frist'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        
        // Hauptteil komplett sperren (alle Inputs, Textareas, Selects, Checkboxen)
        const containerEl = document.getElementById('notiz-hauptteil-container');
        if (containerEl) {
            containerEl.querySelectorAll('input, textarea, select').forEach(el => el.disabled = true);
            containerEl.querySelectorAll('button').forEach(btn => btn.style.display = 'none');
        }
        
        // Teilen-Button verstecken
        const shareBtn2 = document.getElementById('btn-notiz-share');
        if (shareBtn2) shareBtn2.style.display = 'none';
    }
}

function lockEditFields() {
    // Betreff, Kategorie, Subkategorie, Erinnerung, Frist sperren
    const fieldsToLock = ['notiz-betreff', 'notiz-kategorie', 'notiz-subkategorie', 'notiz-erinnerung', 'notiz-frist'];
    fieldsToLock.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
    
    // INFO-Checkbox in Leseansicht deaktivieren (nur im Bearbeitungsmodus wählbar)
    const infoCb = document.getElementById('notiz-status-info');
    if (infoCb) infoCb.disabled = true;
    
    // Alle Element-Buttons (hinzufügen) verstecken
    document.querySelectorAll('.notiz-add-element').forEach(btn => btn.style.display = 'none');
    
    // Alle Elemente sperren AUSSER Checkboxen
    const container = document.getElementById('notiz-hauptteil-container');
    if (container) {
        container.querySelectorAll('[data-element-type]').forEach(el => {
            const type = el.dataset.elementType;
            
            // Element-Titel-Zeile mit Buttons ausblenden (erste div mit flex justify-between)
            const titleRow = el.querySelector('.flex.justify-between');
            if (titleRow) {
                if (type === 'password') {
                    // Bei Passwort: Zeile sichtbar lassen, aber Text "Passwort" ausblenden
                    const titleSpan = titleRow.querySelector('span');
                    if (titleSpan) titleSpan.style.display = 'none';
                    titleRow.style.display = ''; // Sicherstellen, dass die Zeile sichtbar ist
                } else {
                    titleRow.style.display = 'none';
                }
            }
            
            // Unterüberschrift schön gestalten oder ausblenden
            const subtitleEl = el.querySelector('.element-subtitle');
            if (subtitleEl) {
                const subtitleValue = subtitleEl.value.trim();
                if (subtitleValue) {
                    // Unterüberschrift vorhanden: als schöne Überschrift darstellen
                    subtitleEl.disabled = true;
                    subtitleEl.classList.remove('border', 'rounded', 'p-2', 'text-sm', 'mb-2');
                    subtitleEl.classList.add('text-lg', 'font-semibold', 'text-gray-800', 'mb-3', 'mt-1', 'border-0', 'bg-transparent', 'p-0');
                    subtitleEl.style.pointerEvents = 'none';
                } else {
                    // Unterüberschrift leer: komplett ausblenden
                    subtitleEl.style.display = 'none';
                }
            }
            
            if (type !== 'checkbox') {
                // Alle Inputs/Textareas/Selects in diesem Element sperren
                el.querySelectorAll('input:not([type="checkbox"]), textarea, select').forEach(input => {
                    if (!input.classList.contains('element-subtitle')) {
                        input.disabled = true;
                    }
                });
            } else {
                // Bei Checkbox-Elementen darf nur die Checkbox selbst editierbar sein
                el.querySelectorAll('input:not([type="checkbox"])').forEach(input => {
                    if (!input.classList.contains('element-subtitle')) {
                        input.disabled = true;
                    }
                });
            }

            if (type === 'list') {
                // Textarea ausblenden
                const ta = el.querySelector('.list-textarea') || el.querySelector('textarea');
                if (ta) ta.style.display = 'none';
                
                // Style-Einstellungen (Ebene 1 & 2) ausblenden
                const styleContainers = el.querySelectorAll('.grid.grid-cols-1.md\\:grid-cols-2');
                styleContainers.forEach(container => container.style.display = 'none');
                
                // Einrücken/Ausrücken Buttons und Hinweis ausblenden
                const indentRow = el.querySelector('.flex.gap-2.mb-2');
                if (indentRow && indentRow.querySelector('.list-indent')) {
                    indentRow.style.display = 'none';
                }
            }
            
            if (type === 'infobox') {
                // Farb-Select ausblenden (wurde schon durch Titel-Zeile versteckt, aber sicher ist sicher)
                const colorSelect = el.querySelector('select');
                if (colorSelect) colorSelect.style.display = 'none';
            }
            
            if (type === 'link') {
                // Edit-Container ausblenden, Display-Container anzeigen
                const editContainer = el.querySelector('.link-edit-container');
                const displayContainer = el.querySelector('.link-display-container');
                if (editContainer) editContainer.style.display = 'none';
                if (displayContainer) displayContainer.style.display = 'block';
            }
            
            if (type === 'password') {
                // Passwort-Buttons (Kopieren & Ansehen) NICHT ausblenden - werden auch in Leseansicht gebraucht
                // Nur die Move-Buttons ausblenden
                el.querySelectorAll('.move-up, .move-down, .move-left, .move-right, .delete-element').forEach(btn => btn.style.display = 'none');
            }
            
            // Verschiebe- und Lösch-Buttons verstecken (außer bei Passwort-Elementen)
            if (type !== 'password') {
                el.querySelectorAll('.move-up, .move-down, .move-left, .move-right, .delete-element, .add-table-row, .list-indent, .list-outdent, .add-checkbox-item, .delete-checkbox-item, .delete-table-row').forEach(btn => btn.style.display = 'none');
            } else {
                // Bei Passwort nur strukturelle Buttons ausblenden, nicht die funktionalen (Kopieren, Ansehen)
                // Diese befinden sich nun neben dem Input, nicht mehr im Header (außer Delete/Move)
                el.querySelectorAll('.add-table-row, .list-indent, .list-outdent, .add-checkbox-item, .delete-checkbox-item, .delete-table-row').forEach(btn => btn.style.display = 'none');
                // Move/Delete Buttons im Header ausblenden
                el.querySelectorAll('.move-up, .move-down, .move-left, .move-right, .delete-element').forEach(btn => btn.style.display = 'none');
            }
        });
    }
}

function unlockEditFields() {
    // Alle Felder entsperren
    const fieldsToUnlock = ['notiz-betreff', 'notiz-kategorie', 'notiz-subkategorie', 'notiz-erinnerung', 'notiz-frist'];
    fieldsToUnlock.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
    
    // INFO-Checkbox im Bearbeitungsmodus aktivieren
    const infoCb = document.getElementById('notiz-status-info');
    if (infoCb) infoCb.disabled = false;
    
    // Element-Buttons wieder anzeigen
    document.querySelectorAll('.notiz-add-element').forEach(btn => btn.style.display = '');
    
    // Alle Element-Inhalte wieder entsperren und anzeigen
    const container = document.getElementById('notiz-hauptteil-container');
    if (container) {
        container.querySelectorAll('[data-element-type]').forEach(el => {
            const type = el.dataset.elementType;
            
            // Element-Titel-Zeile wieder anzeigen
            const titleRow = el.querySelector('.flex.justify-between');
            if (titleRow) {
                titleRow.style.display = '';
                // Bei Passwort den Titel-Span wieder anzeigen
                const titleSpan = titleRow.querySelector('span');
                if (titleSpan) titleSpan.style.display = '';
            }
            
            // Unterüberschrift zurücksetzen
            const subtitleEl = el.querySelector('.element-subtitle');
            if (subtitleEl) {
                subtitleEl.style.display = '';
                subtitleEl.disabled = false;
                subtitleEl.style.pointerEvents = '';
                subtitleEl.classList.remove('text-lg', 'font-semibold', 'text-gray-800', 'mb-3', 'mt-1', 'border-0', 'bg-transparent', 'p-0');
                subtitleEl.classList.add('border', 'rounded', 'p-2', 'text-sm', 'mb-2');
            }
            
            // Alle Inputs/Textareas/Selects entsperren
            el.querySelectorAll('input, textarea, select').forEach(input => input.disabled = false);
            
            if (type === 'list') {
                // Textarea wieder anzeigen
                const ta = el.querySelector('.list-textarea') || el.querySelector('textarea');
                if (ta) ta.style.display = '';
                
                // Style-Einstellungen wieder anzeigen
                const styleContainers = el.querySelectorAll('.grid.grid-cols-1.md\\:grid-cols-2');
                styleContainers.forEach(container => container.style.display = '');
                
                // Einrücken/Ausrücken Buttons wieder anzeigen
                const indentRow = el.querySelector('.flex.gap-2.mb-2');
                if (indentRow && indentRow.querySelector('.list-indent')) {
                    indentRow.style.display = '';
                }
            }
            
            if (type === 'infobox') {
                // Farb-Select wieder anzeigen
                const colorSelect = el.querySelector('select');
                if (colorSelect) colorSelect.style.display = '';
            }
            
            if (type === 'link') {
                // Edit-Container anzeigen, Display-Container verstecken
                const editContainer = el.querySelector('.link-edit-container');
                const displayContainer = el.querySelector('.link-display-container');
                if (editContainer) editContainer.style.display = '';
                if (displayContainer) displayContainer.style.display = 'none';
            }
            
            // Alle Buttons wieder anzeigen
            el.querySelectorAll('.move-up, .move-down, .move-left, .move-right, .delete-element, .add-table-row, .list-indent, .list-outdent, .copy-btn, .toggle-pw, .add-checkbox-item, .delete-checkbox-item').forEach(btn => btn.style.display = '');
        });
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
    container.innerHTML = '<p class="notiz-placeholder text-gray-400 text-center text-sm col-span-full">Füge Elemente hinzu...</p>';
    document.getElementById('notiz-shared-users-list').innerHTML = '<p class="text-gray-400 text-sm">Privat</p>';
    document.getElementById('notiz-metadata').classList.add('hidden');
    hideCheckoutWarning();
    
    // Alle Felder entsperren (neue Notiz)
    unlockEditFields();
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
            const ownerId = currentEditingOwnerId || currentUser.mode;
            const docRef = doc(db, 'artifacts', appId, 'users', ownerId, 'notizen', currentEditingNotizId);
            await updateDoc(docRef, notizData);
            await addHistory(currentEditingNotizId, 'Bearbeitet', notizData);
            if (ownerId === currentUser.mode) {
                await releaseCheckout(currentEditingNotizId);
            }
            alertUser('Gespeichert', 'success');
        } else {
            // Bug-Fix: Prüfen ob die Kategorie geteilt ist und sharedWith-Einträge übernehmen
            let inheritedSharedWith = {};
            const kategorie = allKategorien.find(k => k.id === kategorieId);
            if (kategorie && kategorie.sharedWith) {
                // Nur aktive sharedWith-Einträge übernehmen (nicht pending/rejected)
                for (const [sharedUserId, shareData] of Object.entries(kategorie.sharedWith)) {
                    if (shareData && shareData.status === 'active') {
                        inheritedSharedWith[sharedUserId] = {
                            role: shareData.role || 'read',
                            status: 'active',
                            since: serverTimestamp(),
                            sharedBy: currentUser.mode,
                            viaKategorie: kategorieId
                        };
                    }
                }
            }
            
            const colRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen');
            const newDoc = await addDoc(colRef, { ...notizData, createdAt: serverTimestamp(), createdBy: currentUser.mode, owner: currentUser.mode, sharedWith: inheritedSharedWith, checkedOutBy: null, checkedOutAt: null });
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

    const rowEls = Array.from(container.querySelectorAll('.notiz-row'));
    if (rowEls.length === 0) {
        container.querySelectorAll('[data-element-type]').forEach((el, index) => {
            const type = el.dataset.elementType;
            const element = { type, order: index, row: index, col: 0 };
            element.subtitle = el.querySelector('.element-subtitle')?.value || '';
            switch (type) {
                case 'text': element.content = el.querySelector('textarea')?.value || ''; break;
                case 'list':
                    const listTa = el.querySelector('.list-textarea') || el.querySelector('textarea');
                    element.content = listTa?.value || '';
                    element.listStyleL1 = el.querySelector('.list-style-l1')?.value || 'symbol';
                    element.listSymbolL1 = el.querySelector('.list-symbol-l1')?.value || '•';
                    element.listStyleL2 = el.querySelector('.list-style-l2')?.value || 'symbol';
                    element.listSymbolL2 = el.querySelector('.list-symbol-l2')?.value || '•';
                    break;
                case 'checkbox':
                    const items = [];
                    el.querySelectorAll('.checkbox-item').forEach(item => {
                        items.push({
                            checked: item.querySelector('input[type="checkbox"]')?.checked || false,
                            label: item.querySelector('.checkbox-label-input')?.value || ''
                        });
                    });
                    element.items = items;
                    break;
                case 'link':
                    element.url = el.querySelector('input[name="url"]')?.value || '';
                    element.label = el.querySelector('input[name="label"]')?.value || '';
                    break;
                case 'password': element.content = el.querySelector('.password-input')?.value || ''; break;
                case 'infobox':
                    element.content = el.querySelector('textarea')?.value || '';
                    element.color = el.querySelector('select')?.value || 'blue';
                    break;
                case 'table':
                    const tableRows = [];
                    el.querySelectorAll('tbody tr').forEach(tr => {
                        const cells = Array.from(tr.querySelectorAll('td input')).map(inp => inp.value);
                        tableRows.push({ cells }); // Objekt statt Array!
                    });
                    element.rows = tableRows;
                    element.headers = Array.from(el.querySelectorAll('thead input')).map(inp => inp.value);
                    break;
            }
            elements.push(element);
        });
        return elements;
    }

    let order = 0;
    rowEls.forEach((rowEl, rowIndex) => {
        const cols = Array.from(rowEl.children).filter(c => c && c.dataset && c.dataset.elementType);
        cols.forEach((el, colIndex) => {
            const type = el.dataset.elementType;
            const element = { type, order, row: rowIndex, col: colIndex };
            order += 1;
            element.subtitle = el.querySelector('.element-subtitle')?.value || '';
            switch (type) {
                case 'text':
                    element.content = el.querySelector('textarea')?.value || '';
                    break;
                case 'list':
                    const listTa = el.querySelector('.list-textarea') || el.querySelector('textarea');
                    element.content = listTa?.value || '';
                    element.listStyleL1 = el.querySelector('.list-style-l1')?.value || 'symbol';
                    element.listSymbolL1 = el.querySelector('.list-symbol-l1')?.value || '•';
                    element.listStyleL2 = el.querySelector('.list-style-l2')?.value || 'symbol';
                    element.listSymbolL2 = el.querySelector('.list-symbol-l2')?.value || '•';
                    break;
                case 'checkbox':
                    const checkboxItems = [];
                    el.querySelectorAll('.checkbox-item').forEach(item => {
                        checkboxItems.push({
                            checked: item.querySelector('input[type="checkbox"]')?.checked || false,
                            label: item.querySelector('.checkbox-label-input')?.value || ''
                        });
                    });
                    element.items = checkboxItems;
                    break;
                case 'link':
                    element.url = el.querySelector('input[name="url"]')?.value || '';
                    element.label = el.querySelector('input[name="label"]')?.value || '';
                    break;
                case 'password':
                    element.content = el.querySelector('.password-input')?.value || '';
                    break;
                case 'infobox':
                    element.content = el.querySelector('textarea')?.value || '';
                    element.color = el.querySelector('select')?.value || 'blue';
                    break;
                case 'table':
                    const tableRows = [];
                    el.querySelectorAll('tbody tr').forEach(tr => {
                        const cells = Array.from(tr.querySelectorAll('td input')).map(inp => inp.value);
                        tableRows.push({ cells }); // Objekt statt Array!
                    });
                    element.rows = tableRows;
                    element.headers = Array.from(el.querySelectorAll('thead input')).map(inp => inp.value);
                    break;
            }
            elements.push(element);
        });
    });
    return elements;
}

async function deleteNotiz() {
    if (!currentEditingNotizId) return;
    if (currentEditingOwnerId && currentEditingOwnerId !== currentUser.mode) {
        alertUser('Nur der Owner kann löschen', 'error');
        return;
    }
    const notizId = currentEditingNotizId;
    const notiz = allNotizen.find(n => n.id === notizId);
    const betreff = notiz?.betreff || '';
    showTextConfirmModal({
        title: '⚠️ NOTIZ LÖSCHEN',
        warningHtml: `
            <p class="text-sm font-bold text-red-800 mb-2">⚠️ ACHTUNG: Diese Aktion ist UNWIDERRUFLICH!</p>
            <p class="text-sm text-red-700">Die Notiz <strong>${betreff}</strong> wird dauerhaft gelöscht.</p>
        `,
        confirmPhrase: 'LÖSCHEN',
        countdownSeconds: 0,
        onConfirm: async () => {
            try {
                await releaseCheckout(notizId);
                await deleteNotizWithHistory(currentUser.mode, notizId);
                alertUser('Gelöscht', 'success');
                closeNotizEditor();
            } catch (error) {
                console.error('Notizen: Fehler beim Löschen der Notiz:', error);
                alertUser('Fehler', 'error');
            }
        }
    });
}

async function closeNotizEditor() {
    // Live-Listener stoppen
    if (currentEditingNotizListener) {
        currentEditingNotizListener();
        currentEditingNotizListener = null;
    }
    if (currentEditingNotizId && currentEditingOwnerId === currentUser.mode) await releaseCheckout(currentEditingNotizId);
    stopCheckoutHeartbeat();
    currentEditingNotizId = null;
    currentEditingOwnerId = null;
    currentEditingSharedRole = null;
    document.getElementById('notizEditorModal').classList.add('hidden');
    document.getElementById('notizEditorModal').classList.remove('flex');
}

function addElement(type) {
    addElementWithOptions(type);
}

function createNotizRow() {
    const rowEl = document.createElement('div');
    rowEl.className = 'notiz-row grid grid-cols-1 md:grid-cols-2 gap-2 col-span-full md:col-span-2';
    rowEl.dataset.rowId = `row_${Date.now()}_${notizRowIdCounter++}`;
    return rowEl;
}

function ensureNotizPlaceholder() {
    const container = document.getElementById('notiz-hauptteil-container');
    if (!container) return;
    const hasAny = container.querySelector('[data-element-type]');
    if (!hasAny) {
        container.innerHTML = '<p class="notiz-placeholder text-gray-400 text-center text-sm col-span-full">Füge Elemente hinzu...</p>';
    }
}

function updateNotizRowLayout(rowEl) {
    const children = Array.from(rowEl.children).filter(c => c && c.dataset && c.dataset.elementType);
    if (children.length === 1) {
        children[0].classList.add('md:col-span-2');
    } else {
        children.forEach(c => c.classList.remove('md:col-span-2'));
    }

    const showSwap = children.length === 2;
    children.forEach(el => {
        const leftBtn = el.querySelector('.move-left');
        const rightBtn = el.querySelector('.move-right');
        if (leftBtn) leftBtn.style.display = showSwap ? '' : 'none';
        if (rightBtn) rightBtn.style.display = showSwap ? '' : 'none';
    });
}

function getSelectedNotizElementDiv() {
    if (!selectedNotizElementId) return null;
    return document.querySelector(`[data-element-id="${selectedNotizElementId}"]`);
}

function addElementWithOptions(type, options = {}) {
    const container = document.getElementById('notiz-hauptteil-container');
    if (!container) return;
    if (container.querySelector('.notiz-placeholder')) container.innerHTML = '';

    const rowEl = options.rowEl || createNotizRow();
    const insertRowAfter = options.insertRowAfter || null;
    const insertElementBefore = options.insertElementBefore || null;
    const selectAfter = options.selectAfter !== false;

    if (!options.rowEl) {
        if (insertRowAfter && insertRowAfter.parentElement === container) {
            if (insertRowAfter.nextSibling) container.insertBefore(rowEl, insertRowAfter.nextSibling);
            else container.appendChild(rowEl);
        } else {
            container.appendChild(rowEl);
        }
    }

    const fullSpan = typeof options.fullSpan === 'boolean' ? options.fullSpan : true;

    const elementDiv = document.createElement('div');
    elementDiv.className = 'border border-gray-300 rounded p-3 bg-white relative';
    elementDiv.dataset.elementType = type;
    elementDiv.dataset.elementId = `el_${Date.now()}_${notizElementIdCounter++}`;

    if (fullSpan || type === 'line') {
        elementDiv.classList.add('md:col-span-2');
    }
    if (type === 'line') {
        elementDiv.classList.add('md:col-span-2');
    }
    let content = '';
    switch (type) {
        case 'text':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">📝 Text</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="move-left text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">◀</button><button class="move-right text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">▶</button><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><textarea class="w-full p-2 border rounded" rows="3"></textarea>`;
            break;
        case 'list':
            content = `
                <div class="flex justify-between mb-2">
                    <span class="font-bold text-sm">📌 Aufzählung</span>
                    <div class="flex gap-1">
                        <button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button>
                        <button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button>
                        <button class="move-left text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">◀</button>
                        <button class="move-right text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">▶</button>
                        <button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button>
                        <button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button>
                    </div>
                </div>
                <input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                    <div class="border rounded p-2 bg-gray-50">
                        <div class="text-xs font-bold text-gray-700 mb-1">Ebene 1</div>
                        <div class="flex gap-2 items-center">
                            <select class="list-style-l1 text-xs border rounded px-2 py-1">
                                <option value="symbol">🔹 Symbole</option>
                                <option value="number">1. Nummern</option>
                            </select>
                            <select class="list-symbol-l1 text-xs border rounded px-2 py-1">
                                <option value="•">•</option>
                                <option value="➡️">➡️</option>
                                <option value="👉">👉</option>
                                <option value="⭐">⭐</option>
                                <option value="✅">✅</option>
                                <option value="🔸">🔸</option>
                                <option value="📌">📌</option>
                                <option value="❗">❗</option>
                                <option value="✳️">✳️</option>
                            </select>
                        </div>
                    </div>
                    <div class="border rounded p-2 bg-gray-50">
                        <div class="text-xs font-bold text-gray-700 mb-1">Ebene 2 (eingerückt)</div>
                        <div class="flex gap-2 items-center">
                            <select class="list-style-l2 text-xs border rounded px-2 py-1">
                                <option value="symbol">🔹 Symbole</option>
                                <option value="number">1. Nummern</option>
                            </select>
                            <select class="list-symbol-l2 text-xs border rounded px-2 py-1">
                                <option value="•">•</option>
                                <option value="➡️">➡️</option>
                                <option value="👉">👉</option>
                                <option value="⭐">⭐</option>
                                <option value="✅">✅</option>
                                <option value="🔸">🔸</option>
                                <option value="📌">📌</option>
                                <option value="❗">❗</option>
                                <option value="✳️">✳️</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="flex gap-2 mb-2">
                    <button type="button" class="list-indent text-xs px-2 py-1 bg-gray-200 rounded">↳ Einrücken</button>
                    <button type="button" class="list-outdent text-xs px-2 py-1 bg-gray-200 rounded">↰ Ausrücken</button>
                    <div class="text-xs text-gray-500 flex-1 flex items-center">TAB = Einrücken, Shift+TAB = Ausrücken</div>
                </div>
                <textarea class="list-textarea w-full p-2 border rounded" rows="5" placeholder="Jede Zeile ein Punkt...\nFür Ebene 2: Einrücken oder TAB am Anfang"></textarea>
                <div class="list-preview mt-2 border rounded bg-white p-2 text-sm"></div>
            `;
            break;
        case 'checkbox':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">☑️ Checkliste</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="move-left text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">◀</button><button class="move-right text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">▶</button><button class="add-checkbox-item text-xs px-2 py-1 bg-blue-500 text-white rounded">+ Eintrag</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><div class="checkbox-items-container"><div class="checkbox-item flex gap-2 mb-1"><input type="checkbox" class="w-5 h-5"><input type="text" placeholder="Eintrag..." class="checkbox-label-input flex-1 p-2 border rounded"><button class="delete-checkbox-item text-xs px-1 py-0 bg-red-500 text-white rounded">✕</button></div></div>`;
            break;
        case 'line':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">➖ Linie</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><hr class="border-t-2">`;
            break;
        case 'table':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">📊 Tabelle</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="move-left text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">◀</button><button class="move-right text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">▶</button><button class="add-table-row text-xs px-2 py-1 bg-blue-500 text-white rounded">+ Zeile</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><table class="w-full border"><thead><tr><th><input type="text" placeholder="Spalte 1" class="w-full p-1 border"></th><th><input type="text" placeholder="Spalte 2" class="w-full p-1 border"></th></tr></thead><tbody><tr><td><input type="text" class="w-full p-1 border"></td><td><input type="text" class="w-full p-1 border"></td><td class="border p-1"><button class="delete-table-row text-xs px-1 py-0 bg-red-500 text-white rounded">✕</button></td></tr></tbody></table>`;
            break;
        case 'link':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">🔗 Link</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="move-left text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">◀</button><button class="move-right text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">▶</button><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><div class="link-edit-container"><input type="url" name="url" placeholder="https://..." class="w-full p-2 border rounded mb-2 link-url-input"><input type="text" name="label" placeholder="Anzeigetext" class="w-full p-2 border rounded link-label-input"></div><div class="link-display-container" style="display:none;"><a href="#" target="_blank" rel="noopener noreferrer" class="link-display text-blue-600 hover:text-blue-800 underline text-lg"></a></div>`;
            break;
        case 'password':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">🔐 Passwort</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="move-left text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">◀</button><button class="move-right text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">▶</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><div class="flex gap-2"><input type="password" class="password-input w-full p-2 border rounded flex-1"><button class="toggle-pw text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600" title="Anzeigen/Verbergen">👁️</button><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300" title="Kopieren">📋</button></div>`;
            break;
        case 'infobox':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">💡 Infobox</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="move-left text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">◀</button><button class="move-right text-xs px-2 py-1 bg-gray-300 rounded" style="display:none;">▶</button><select class="text-xs border rounded px-1">
                <option value="blue">Blau</option>
                <option value="indigo">Indigo</option>
                <option value="purple">Lila</option>
                <option value="pink">Pink</option>
                <option value="red">Rot</option>
                <option value="orange">Orange</option>
                <option value="amber">Bernstein</option>
                <option value="yellow">Gelb</option>
                <option value="lime">Limette</option>
                <option value="green">Grün</option>
                <option value="emerald">Smaragd</option>
                <option value="teal">Türkis</option>
                <option value="cyan">Cyan</option>
                <option value="sky">Himmelblau</option>
                <option value="slate">Schiefer</option>
                <option value="gray">Grau</option>
                <option value="zinc">Zink</option>
                <option value="neutral">Neutral</option>
                <option value="stone">Stein</option>
                <option value="rose">Rose</option>
            </select><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><textarea class="w-full p-2 border rounded bg-blue-50" rows="2"></textarea>`;
            break;
    }
    elementDiv.innerHTML = content;

    elementDiv.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('input, textarea, select, button')) return;
        selectNotizElement(elementDiv);
    });
    elementDiv.querySelectorAll('input, textarea, select').forEach(inp => {
        inp.addEventListener('focus', () => selectNotizElement(elementDiv));
    });

    elementDiv.querySelector('.delete-element')?.addEventListener('click', () => {
        elementDiv.remove();
        const remaining = Array.from(rowEl.children).filter(c => c && c.dataset && c.dataset.elementType);
        if (remaining.length === 0) {
            rowEl.remove();
        } else {
            updateNotizRowLayout(rowEl);
        }
        ensureNotizPlaceholder();
    });
    
    // Move Up/Down Funktionalität
    const moveUpBtn = elementDiv.querySelector('.move-up');
    if (moveUpBtn) {
        moveUpBtn.addEventListener('click', () => {
            const prevRow = rowEl.previousElementSibling;
            if (prevRow && prevRow.classList && prevRow.classList.contains('notiz-row')) {
                container.insertBefore(rowEl, prevRow);
            }
        });
    }
    const moveDownBtn = elementDiv.querySelector('.move-down');
    if (moveDownBtn) {
        moveDownBtn.addEventListener('click', () => {
            const nextRow = rowEl.nextElementSibling;
            if (nextRow && nextRow.classList && nextRow.classList.contains('notiz-row')) {
                container.insertBefore(nextRow, rowEl);
            }
        });
    }

    const moveLeftBtn = elementDiv.querySelector('.move-left');
    if (moveLeftBtn) {
        moveLeftBtn.addEventListener('click', () => {
            const children = Array.from(rowEl.children).filter(c => c && c.dataset && c.dataset.elementType);
            if (children.length !== 2) return;
            if (children[1] === elementDiv) {
                rowEl.insertBefore(children[1], children[0]);
                updateNotizRowLayout(rowEl);
            }
        });
    }
    const moveRightBtn = elementDiv.querySelector('.move-right');
    if (moveRightBtn) {
        moveRightBtn.addEventListener('click', () => {
            const children = Array.from(rowEl.children).filter(c => c && c.dataset && c.dataset.elementType);
            if (children.length !== 2) return;
            if (children[0] === elementDiv) {
                rowEl.insertBefore(children[1], children[0]);
                updateNotizRowLayout(rowEl);
            }
        });
    }
    
    const copyBtn = elementDiv.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            let textToCopy = '';
            if (type === 'text' || type === 'infobox') textToCopy = elementDiv.querySelector('textarea')?.value || '';
            else if (type === 'password') textToCopy = elementDiv.querySelector('.password-input')?.value || '';
            else if (type === 'link') textToCopy = elementDiv.querySelector('.link-url-input')?.value || '';
            else if (type === 'list') textToCopy = (elementDiv.querySelector('.list-textarea') || elementDiv.querySelector('textarea'))?.value || '';
            navigator.clipboard.writeText(textToCopy).then(() => alertUser('Kopiert!', 'success'));
        });
    }
    
    if (type === 'link') {
        const urlInput = elementDiv.querySelector('.link-url-input');
        const labelInput = elementDiv.querySelector('.link-label-input');
        const linkDisplay = elementDiv.querySelector('.link-display');
        
        const updateLinkDisplay = () => {
            if (linkDisplay && urlInput) {
                const url = urlInput.value.trim();
                const label = labelInput?.value.trim() || url;
                linkDisplay.href = url || '#';
                linkDisplay.textContent = label || 'Link';
            }
        };
        
        if (urlInput) urlInput.addEventListener('input', updateLinkDisplay);
        if (labelInput) labelInput.addEventListener('input', updateLinkDisplay);
        updateLinkDisplay();
    }
    const togglePw = elementDiv.querySelector('.toggle-pw');
    if (togglePw) {
        togglePw.addEventListener('click', () => {
            const input = elementDiv.querySelector('.password-input');
            input.type = input.type === 'password' ? 'text' : 'password';
        });
    }
    const addRowBtn = elementDiv.querySelector('.add-table-row');
    if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
            const tbody = elementDiv.querySelector('tbody');
            const colCount = elementDiv.querySelectorAll('thead th').length;
            const tr = document.createElement('tr');
            for (let i = 0; i < colCount; i++) {
                tr.innerHTML += '<td><input type="text" class="w-full p-1 border"></td>';
            }
            tr.innerHTML += '<td class="border p-1"><button class="delete-table-row text-xs px-1 py-0 bg-red-500 text-white rounded">✕</button></td>';
            tr.querySelector('.delete-table-row')?.addEventListener('click', function() {
                this.closest('tr').remove();
            });
            tbody.appendChild(tr);
        });
    }
    
    if (type === 'table') {
        elementDiv.querySelectorAll('.delete-table-row').forEach(btn => {
            btn.addEventListener('click', function() {
                this.closest('tr').remove();
            });
        });
    }
    const colorSelect = elementDiv.querySelector('select');
    if (colorSelect && type === 'infobox') {
        colorSelect.addEventListener('change', (e) => {
            const textarea = elementDiv.querySelector('textarea');
            textarea.className = textarea.className.replace(/bg-\w+-\d+/, `bg-${e.target.value}-50`);
        });
    }

    if (type === 'list') {
        setupListElement(elementDiv);
    }

    if (type === 'checkbox') {
        const addItemBtn = elementDiv.querySelector('.add-checkbox-item');
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => {
                const container = elementDiv.querySelector('.checkbox-items-container');
                const newItem = document.createElement('div');
                newItem.className = 'checkbox-item flex gap-2 mb-1';
                newItem.innerHTML = '<input type="checkbox" class="w-5 h-5"><input type="text" placeholder="Eintrag..." class="checkbox-label-input flex-1 p-2 border rounded"><button class="delete-checkbox-item text-xs px-1 py-0 bg-red-500 text-white rounded">✕</button>';
                newItem.querySelector('.delete-checkbox-item')?.addEventListener('click', function() {
                    this.closest('.checkbox-item').remove();
                });
                container.appendChild(newItem);
            });
        }
        elementDiv.querySelectorAll('.delete-checkbox-item').forEach(btn => {
            btn.addEventListener('click', function() {
                this.closest('.checkbox-item').remove();
            });
        });
    }

    if (insertElementBefore && insertElementBefore.parentElement === rowEl) {
        rowEl.insertBefore(elementDiv, insertElementBefore);
    } else {
        rowEl.appendChild(elementDiv);
    }

    updateNotizRowLayout(rowEl);
    if (selectAfter) selectNotizElement(elementDiv);
}

function selectNotizElement(elementDiv) {
    const container = document.getElementById('notiz-hauptteil-container');
    if (!container || !elementDiv) return;
    container.querySelectorAll('[data-element-id]').forEach(el => {
        el.classList.remove('ring-2', 'ring-amber-400');
    });
    selectedNotizElementId = elementDiv.dataset.elementId;
    elementDiv.classList.add('ring-2', 'ring-amber-400');
}

function handleAddElementClick(type) {
    if (!notizIsEditMode) {
        alertUser('Bitte erst Bearbeiten aktivieren', 'error');
        return;
    }
    const selected = getSelectedNotizElementDiv();
    if (!selected) {
        console.log('Notizen: Element hinzufügen (kein ausgewähltes Element):', type);
        addElementWithOptions(type, { fullSpan: true });
        return;
    }
    showElementPlacementModal(type, selected);
}

function showElementPlacementModal(type, selectedEl) {
    const existing = document.getElementById('notizElementPlacementModal');
    if (existing) existing.remove();

    const rowEl = selectedEl.closest('.notiz-row');
    const rowChildren = rowEl ? Array.from(rowEl.children).filter(c => c && c.dataset && c.dataset.elementType) : [];
    const canSideBySide = rowEl && rowChildren.length < 2 && type !== 'line';

    const overlay = document.createElement('div');
    overlay.id = 'notizElementPlacementModal';
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4';
    overlay.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-4">
            <div class="font-bold text-lg mb-2">📍 Element platzieren</div>
            <div class="text-sm text-gray-600 mb-3">Wo soll das neue Element eingefügt werden?</div>
            <div class="grid grid-cols-1 gap-2">
                <button data-action="below" class="w-full px-3 py-2 bg-gray-800 text-white font-bold rounded hover:bg-gray-900 transition text-sm text-left">⬇️ Unter die markierte Zeile</button>
                <button data-action="left" class="w-full px-3 py-2 bg-gray-200 text-gray-800 font-bold rounded hover:bg-gray-300 transition text-sm text-left" ${canSideBySide ? '' : 'disabled style="opacity:0.5;cursor:not-allowed;"'}>⬅️ Links daneben</button>
                <button data-action="right" class="w-full px-3 py-2 bg-gray-200 text-gray-800 font-bold rounded hover:bg-gray-300 transition text-sm text-left" ${canSideBySide ? '' : 'disabled style="opacity:0.5;cursor:not-allowed;"'}>➡️ Rechts daneben</button>
                <button data-action="cancel" class="w-full px-3 py-2 bg-white text-gray-700 font-bold rounded border hover:bg-gray-50 transition text-sm text-left">Abbrechen</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    overlay.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            overlay.remove();
            if (action === 'cancel') return;
            if (!rowEl) {
                addElementWithOptions(type, { fullSpan: true });
                return;
            }
            if (action === 'below') {
                console.log('Notizen: Element hinzufügen unterhalb:', type);
                addElementWithOptions(type, { fullSpan: true, insertRowAfter: rowEl });
                return;
            }
            if (!canSideBySide) return;

            const existingChild = rowChildren[0] || null;
            if (existingChild) {
                existingChild.classList.remove('md:col-span-2');
            }

            if (action === 'left') {
                console.log('Notizen: Element hinzufügen links:', type);
                addElementWithOptions(type, { rowEl, fullSpan: false, insertElementBefore: existingChild });
                return;
            }
            if (action === 'right') {
                console.log('Notizen: Element hinzufügen rechts:', type);
                addElementWithOptions(type, { rowEl, fullSpan: false });
                return;
            }
        });
    });

    document.body.appendChild(overlay);
}

function renderElements(elements) {
    const container = document.getElementById('notiz-hauptteil-container');
    if (!container) return;
    container.innerHTML = '';

    selectedNotizElementId = null;

    if (!elements || elements.length === 0) {
        container.innerHTML = '<p class="notiz-placeholder text-gray-400 text-center text-sm col-span-full">Füge Elemente hinzu...</p>';
        return;
    }

    const hasRow = elements.some(e => typeof e.row === 'number');
    const grouped = {};
    if (hasRow) {
        elements.forEach((e, idx) => {
            const r = typeof e.row === 'number' ? e.row : idx;
            grouped[r] = grouped[r] || [];
            grouped[r].push(e);
        });
    } else {
        elements.forEach((e, idx) => {
            grouped[idx] = [e];
        });
    }

    const rows = Object.keys(grouped).map(k => parseInt(k, 10)).sort((a, b) => a - b);
    rows.forEach(r => {
        const rowEl = createNotizRow();
        container.appendChild(rowEl);

        const rowItems = grouped[r]
            .slice()
            .sort((a, b) => {
                const ac = typeof a.col === 'number' ? a.col : 0;
                const bc = typeof b.col === 'number' ? b.col : 0;
                if (ac !== bc) return ac - bc;
                return (a.order || 0) - (b.order || 0);
            });

        rowItems.forEach(el => {
            renderElementIntoRow(el, rowEl, rowItems.length);
        });

        updateNotizRowLayout(rowEl);
    });
}

function renderElementIntoRow(element, rowEl, rowItemCount) {
    const fullSpan = element.type === 'line' ? true : rowItemCount === 1;
    addElementWithOptions(element.type, { rowEl, fullSpan, selectAfter: false });

    const elDiv = rowEl.lastElementChild;
    const subtitleEl = elDiv.querySelector('.element-subtitle');
    if (subtitleEl) subtitleEl.value = element.subtitle || '';

    switch (element.type) {
        case 'text':
            elDiv.querySelector('textarea').value = element.content || '';
            break;
        case 'list':
            (elDiv.querySelector('.list-textarea') || elDiv.querySelector('textarea')).value = element.content || '';
            const l1Style = elDiv.querySelector('.list-style-l1');
            const l1Symbol = elDiv.querySelector('.list-symbol-l1');
            const l2Style = elDiv.querySelector('.list-style-l2');
            const l2Symbol = elDiv.querySelector('.list-symbol-l2');
            if (l1Style) l1Style.value = element.listStyleL1 || 'symbol';
            if (l1Symbol) l1Symbol.value = element.listSymbolL1 || '•';
            if (l2Style) l2Style.value = element.listStyleL2 || 'symbol';
            if (l2Symbol) l2Symbol.value = element.listSymbolL2 || '•';
            setupListElement(elDiv);
            updateListPreview(elDiv);
            break;
        case 'checkbox':
            const container = elDiv.querySelector('.checkbox-items-container');
            if (container && element.items && element.items.length > 0) {
                container.innerHTML = '';
                element.items.forEach(item => {
                    const newItem = document.createElement('div');
                    newItem.className = 'checkbox-item flex gap-2 mb-1';
                    newItem.innerHTML = '<input type="checkbox" class="w-5 h-5"><input type="text" placeholder="Eintrag..." class="checkbox-label-input flex-1 p-2 border rounded"><button class="delete-checkbox-item text-xs px-1 py-0 bg-red-500 text-white rounded">✕</button>';
                    newItem.querySelector('input[type="checkbox"]').checked = item.checked || false;
                    newItem.querySelector('.checkbox-label-input').value = item.label || '';
                    newItem.querySelector('.delete-checkbox-item')?.addEventListener('click', function() {
                        this.closest('.checkbox-item').remove();
                    });
                    container.appendChild(newItem);
                });
            }
            break;
        case 'link':
            const urlInput = elDiv.querySelector('.link-url-input');
            const labelInput = elDiv.querySelector('.link-label-input');
            const linkDisplay = elDiv.querySelector('.link-display');
            if (urlInput) urlInput.value = element.url || '';
            if (labelInput) labelInput.value = element.label || '';
            if (linkDisplay) {
                linkDisplay.href = element.url || '#';
                linkDisplay.textContent = element.label || element.url || 'Link';
            }
            break;
        case 'password':
            elDiv.querySelector('.password-input').value = element.content || '';
            break;
        case 'infobox':
            elDiv.querySelector('textarea').value = element.content || '';
            elDiv.querySelector('select').value = element.color || 'blue';
            break;
        case 'table':
            if (element.headers) {
                const headers = elDiv.querySelectorAll('thead input');
                element.headers.forEach((h, i) => { if (headers[i]) headers[i].value = h; });
            }
            if (element.rows) {
                const tbody = elDiv.querySelector('tbody');
                tbody.innerHTML = '';
                element.rows.forEach(row => {
                    const tr = document.createElement('tr');
                    let cells = [];
                    if (Array.isArray(row)) {
                        // Alte Struktur: Array von Strings
                        cells = row;
                    } else if (row && row.cells) {
                        // Neue Struktur: Objekt mit cells-Array
                        cells = row.cells;
                    }
                    
                    cells.forEach(cell => tr.innerHTML += `<td><input type="text" class="w-full p-1 border" value="${cell}"></td>`);
                    
                    // Lösch-Button Zeile wieder hinzufügen
                    tr.innerHTML += '<td class="border p-1"><button class="delete-table-row text-xs px-1 py-0 bg-red-500 text-white rounded">✕</button></td>';
                    tr.querySelector('.delete-table-row')?.addEventListener('click', function() {
                        this.closest('tr').remove();
                    });
                    
                    tbody.appendChild(tr);
                });
            }
            break;
    }
}

function renderElement(element) {
    const container = document.getElementById('notiz-hauptteil-container');
    if (!container) return;
    const rowEl = createNotizRow();
    container.appendChild(rowEl);
    renderElementIntoRow(element, rowEl, 1);
    updateNotizRowLayout(rowEl);
}

function openShareModal() {
    if (!currentEditingNotizId) {
        alertUser('Erst speichern', 'error');
        return;
    }
    if (currentEditingOwnerId && currentEditingOwnerId !== currentUser.mode) {
        alertUser('Nur der Owner kann weitere Personen hinzufügen', 'error');
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
    if (document.getElementById('share-user-select')) {
        loadUserSelect();
    } else {
        loadUserList();
    }
}

async function loadUserList() {
    // Legacy checkbox list UI

    const list = document.getElementById('share-user-list');
    const searchInput = document.getElementById('share-user-search');
    const selectedCount = document.getElementById('share-selected-count');
    if (!list || !searchInput || !selectedCount) return;
    try {
        console.log('Notizen: Lade Userliste für Einladungen...');
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'user-config');
        const snapshot = await getDocs(colRef);
        shareUsersCache = snapshot.docs
            .filter(docSnap => docSnap.id !== currentUser.mode)
            .map(docSnap => {
                const data = docSnap.data() || {};
                const displayName = data.realName || data.name || 'Unbekannt';
                return { id: docSnap.id, displayName };
            })
            .sort((a, b) => (a.displayName || '').localeCompare((b.displayName || ''), 'de'));

        console.log('Notizen: Userliste geladen:', shareUsersCache.length);

        if (shareUsersCache.length === 0) {
            list.innerHTML = '<div class="p-3 text-sm text-gray-400 text-center">Keine Benutzer gefunden</div>';
            selectedCount.textContent = '0 ausgewählt';
            return;
        }

        list.innerHTML = shareUsersCache.map(u => {
            const displayText = u.displayName || u.id;
            const searchText = `${u.displayName} ${u.id}`.toLowerCase();
            return `
                <div class="share-user-row flex items-center justify-between gap-2 p-2 border-b last:border-b-0" data-search="${searchText}">
                    <label class="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        <input type="checkbox" class="share-user-checkbox" data-userid="${u.id}">
                        <div class="min-w-0">
                            <div class="text-sm font-semibold truncate">${displayText}</div>
                        </div>
                    </label>
                    <select class="share-user-role text-xs border rounded px-2 py-1" data-userid="${u.id}">
                        <option value="read">👁️ Lesen</option>
                        <option value="write">✏️ Schreiben</option>
                    </select>
                </div>
            `;
        }).join('');

        const updateSelectedCount = () => {
            const checked = list.querySelectorAll('.share-user-checkbox:checked').length;
            selectedCount.textContent = `${checked} ausgewählt`;
        };

        const applyFilter = () => {
            const term = (searchInput.value || '').trim().toLowerCase();
            list.querySelectorAll('.share-user-row').forEach(row => {
                const hay = row.dataset.search || '';
                row.style.display = !term || hay.includes(term) ? '' : 'none';
            });
        };

        searchInput.value = '';
        searchInput.oninput = () => applyFilter();

        list.onchange = (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('share-user-checkbox')) {
                updateSelectedCount();
            }
        };

        applyFilter();
        updateSelectedCount();
    } catch (error) {
        console.error('Fehler:', error);
    }
}

async function sendShareInvitation() {
    const selectEl = document.getElementById('share-user-select');
    const list = document.getElementById('share-user-list');
    if (!currentEditingNotizId) {
        alertUser('Fehler', 'error');
        return;
    }

    if (currentEditingOwnerId && currentEditingOwnerId !== currentUser.mode) {
        alertUser('Nur der Owner kann einladen', 'error');
        return;
    }

    let selected = [];
    if (list) {
        selected = Array.from(list.querySelectorAll('.share-user-checkbox:checked')).map(cb => {
            const userId = cb.dataset.userid;
            const roleEl = list.querySelector(`.share-user-role[data-userid="${userId}"]`);
            const role = roleEl ? roleEl.value : 'read';
            return { userId, role };
        }).filter(x => x.userId);
    } else if (selectEl) {
        const userId = selectEl.value;
        if (userId) {
            const roleEl = document.getElementById('share-role-select');
            const role = roleEl ? roleEl.value : 'read';
            selected = [{ userId, role }];
        }
    }

    if (selected.length === 0) {
        alertUser('Benutzer auswählen', 'error');
        return;
    }

    try {
        console.log('Notizen: Sende Einladungen an:', selected);
        const ownerId = currentUser.mode;
        const notizRef = doc(db, 'artifacts', appId, 'users', ownerId, 'notizen', currentEditingNotizId);
        const notizSnap = await getDoc(notizRef);
        const notizData = notizSnap.exists() ? (notizSnap.data() || {}) : {};
        const sharedWith = notizData.sharedWith || {};

        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
        const batch = writeBatch(db);

        const updatePayload = {};
        let createdCount = 0;
        let skippedCount = 0;

        for (const { userId, role } of selected) {
            const existing = sharedWith[userId];
            const existingStatus = existing?.status;
            if (existingStatus === 'pending' || existingStatus === 'rejected' || existingStatus === 'active') {
                skippedCount += 1;
                continue;
            }

            const invRef = doc(colRef);
            batch.set(invRef, {
                notizId: currentEditingNotizId,
                fromUserId: ownerId,
                toUserId: userId,
                role,
                status: 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            updatePayload[`sharedWith.${userId}`] = {
                role,
                since: serverTimestamp(),
                status: 'pending',
                sharedBy: ownerId
            };
            createdCount += 1;
        }

        if (createdCount === 0) {
            alertUser('Keine Einladungen gesendet (bereits pending/rejected/aktiv)', 'error');
            return;
        }

        batch.update(notizRef, updatePayload);
        await batch.commit();

        alertUser(`Einladungen gesendet: ${createdCount}${skippedCount ? ` (übersprungen: ${skippedCount})` : ''}`, 'success');
        const modal = document.getElementById('notizShareModal');
        if (modal) modal.classList.add('hidden');
    } catch (error) {
        console.error('Notizen: Fehler beim Senden der Einladungen:', error);
        alertUser('Fehler', 'error');
    }
}

// Neue vereinfachte Single-Select UI (share-user-select)
async function loadUserSelect() {
    const selectEl = document.getElementById('share-user-select');
    if (!selectEl) return;
    try {
        selectEl.innerHTML = '<option value="">Bitte wählen...</option>';
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'user-config');
        const snapshot = await getDocs(colRef);
        const users = snapshot.docs
            .filter(docSnap => docSnap.id !== currentUser.mode)
            .map(docSnap => {
                const data = docSnap.data() || {};
                const displayName = data.realName || data.name || 'Unbekannt';
                return { id: docSnap.id, displayName };
            })
            .sort((a, b) => (a.displayName || '').localeCompare((b.displayName || ''), 'de'));
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.displayName} (${u.id})`;
            selectEl.appendChild(opt);
        });
    } catch (error) {
        console.error('Notizen: Fehler beim Laden der Userliste (Select Share):', error);
    }
}

function renderSharedUsers(sharedWith) {
    const container = document.getElementById('notiz-shared-users-list');
    if (!container) return;
    if (!sharedWith || Object.keys(sharedWith).length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm">Privat</p>';
        return;
    }

    const isOwner = !currentEditingOwnerId || currentEditingOwnerId === currentUser.mode;
    container.innerHTML = Object.entries(sharedWith).map(([userId, data]) => {
        const canRemove = isOwner || userId === currentUser.mode;
        const btnLabel = isOwner ? 'Entfernen' : 'Teilen beenden';
        return `
            <div class="flex justify-between text-sm bg-gray-50 p-2 rounded">
                <span>${getDisplayNameById(userId)} (${data.role === 'read' ? '👁️ Lesen' : '✏️ Schreiben'})</span>
                ${canRemove ? `<button onclick="window.removeSharedUser('${userId}')" class="text-red-500 text-xs">${btnLabel}</button>` : ''}
            </div>
        `;
    }).join('');
}

window.removeSharedUser = async function(userId) {
    if (!currentEditingNotizId) return;

    const isOwner = !currentEditingOwnerId || currentEditingOwnerId === currentUser.mode;
    if (!isOwner && userId !== currentUser.mode) {
        alertUser('Keine Berechtigung', 'error');
        return;
    }

    const confirmText = isOwner ? 'Entziehen?' : 'Teilen wirklich beenden?';
    if (!confirm(confirmText)) return;
    try {
        const ownerId = currentEditingOwnerId || currentUser.mode;
        const notizRef = doc(db, 'artifacts', appId, 'users', ownerId, 'notizen', currentEditingNotizId);
        
        // Notiz-Daten laden um viaKategorie und kategorieId zu prüfen
        const notizSnap = await getDoc(notizRef);
        const notizData = notizSnap.exists() ? notizSnap.data() : {};
        const sharedEntry = notizData.sharedWith?.[userId];
        const viaKategorie = sharedEntry?.viaKategorie;
        const kategorieId = notizData.kategorieId; // Die Kategorie dieser Notiz

        // 1. sharedWith aus Notiz entfernen
        const updatePayload = {};
        updatePayload[`sharedWith.${userId}`] = deleteField();
        await updateDoc(notizRef, updatePayload);

        // 2. Kategorie-sharedWith entfernen (immer prüfen, nicht nur wenn viaKategorie)
        const katIdToClean = viaKategorie || kategorieId;
        console.log('Notizen: removeSharedUser - viaKategorie:', viaKategorie, 'kategorieId:', kategorieId, 'katIdToClean:', katIdToClean);
        if (katIdToClean && isOwner) {
            try {
                const katRef = doc(db, 'artifacts', appId, 'users', ownerId, 'notizen_kategorien', katIdToClean);
                const katSnap = await getDoc(katRef);
                console.log('Notizen: Kategorie existiert:', katSnap.exists());
                if (katSnap.exists()) {
                    const katData = katSnap.data() || {};
                    console.log('Notizen: Kategorie sharedWith:', JSON.stringify(katData.sharedWith));
                    // Entferne User aus sharedWith (prüfe ob vorhanden)
                    if (katData.sharedWith?.[userId]) {
                        const katUpdatePayload = {};
                        katUpdatePayload[`sharedWith.${userId}`] = deleteField();
                        await updateDoc(katRef, katUpdatePayload);
                        console.log('Notizen: sharedWith aus Kategorie entfernt:', katIdToClean, 'für User:', userId);
                    } else {
                        console.log('Notizen: User', userId, 'nicht in Kategorie-sharedWith gefunden');
                    }
                }
                
                // Auch alle anderen Notizen dieser Kategorie bereinigen
                const notizenCol = collection(db, 'artifacts', appId, 'users', ownerId, 'notizen');
                const qNotizen = query(notizenCol, where('kategorieId', '==', katIdToClean));
                const notizenSnap = await getDocs(qNotizen);
                let cleanedCount = 0;
                for (const nDoc of notizenSnap.docs) {
                    const nData = nDoc.data();
                    if (nData.sharedWith?.[userId]) {
                        await updateDoc(nDoc.ref, { [`sharedWith.${userId}`]: deleteField() });
                        cleanedCount++;
                    }
                }
                console.log('Notizen: sharedWith aus', cleanedCount, 'Notizen der Kategorie entfernt');
            } catch (katError) {
                console.warn('Notizen: Fehler beim Entfernen aus Kategorie:', katError);
            }
        }

        // 3. ALLE zugehörigen Einladungen auf "cancelled" setzen (Kategorie UND Notiz)
        try {
            const einladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
            let cancelledCount = 0;
            
            // Kategorie-Einladungen canceln
            if (katIdToClean) {
                const qKatEinl = query(einladungenRef, 
                    where('kategorieId', '==', katIdToClean),
                    where('fromUserId', '==', ownerId),
                    where('toUserId', '==', userId),
                    where('status', 'in', ['pending', 'accepted'])
                );
                const katEinlSnap = await getDocs(qKatEinl);
                for (const einlDoc of katEinlSnap.docs) {
                    await updateDoc(einlDoc.ref, { status: 'cancelled', updatedAt: serverTimestamp() });
                    cancelledCount++;
                }
            }
            
            // Notiz-Einladungen canceln
            const qNotizEinl = query(einladungenRef, 
                where('notizId', '==', currentEditingNotizId),
                where('fromUserId', '==', ownerId),
                where('toUserId', '==', userId),
                where('status', 'in', ['pending', 'accepted'])
            );
            const notizEinlSnap = await getDocs(qNotizEinl);
            for (const einlDoc of notizEinlSnap.docs) {
                await updateDoc(einlDoc.ref, { status: 'cancelled', updatedAt: serverTimestamp() });
                cancelledCount++;
            }
            
            console.log('Notizen:', cancelledCount, 'Einladungen auf cancelled gesetzt');
        } catch (einlError) {
            console.warn('Notizen: Fehler beim Canceln der Einladung:', einlError);
        }

        const actionText = isOwner
            ? `Berechtigung entzogen: ${getDisplayNameById(userId)}`
            : `Teilen beendet: ${getDisplayNameById(userId)}`;
        await addHistory(currentEditingNotizId, actionText, {});

        alertUser(isOwner ? 'Entzogen' : 'Beendet', 'success');
        
        // Kategorien neu laden damit Einstellungen-Ansicht aktualisiert wird
        loadKategorien();
        
        if (!isOwner) {
            closeNotizEditor();
        }
    } catch (error) {
        console.error('Notizen: Fehler beim Entfernen:', error);
        alertUser('Fehler', 'error');
    }
};

async function loadEinladungen() {
    const userId = currentUser.mode;
    if (!userId || userId === GUEST_MODE) return;
    if (einladungenListener) einladungenListener();
    if (gesendetEinladungenListener) gesendetEinladungenListener();
    
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
    
    // Empfangene Einladungen (auch accepted für Live-Updates bei Rechteentzug)
    const qReceived = query(colRef, where('toUserId', '==', userId), where('status', 'in', ['pending', 'rejected', 'accepted', 'cancelled', 'left']));
    einladungenListener = onSnapshot(qReceived, (snapshot) => {
        const prevAccepted = allEinladungen.filter(e => e.status === 'accepted').length;
        allEinladungen = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const newAccepted = allEinladungen.filter(e => e.status === 'accepted').length;
        updateEinladungenBadge();
        
        // Bei Änderungen an akzeptierten Einladungen: Kategorien & Notizen neu laden (Live-Update)
        if (prevAccepted !== newAccepted) {
            console.log('Notizen: Einladungs-Status geändert, lade Kategorien & Notizen neu');
            loadKategorien();
            loadNotizenFromSharedKategorien();
        }
    });
    
    // Gesendete Einladungen (pending + accepted)
    const qSent = query(colRef, where('fromUserId', '==', userId), where('status', 'in', ['pending', 'accepted']));
    gesendetEinladungenListener = onSnapshot(qSent, (snapshot) => {
        allGesendetEinladungen = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    });
}

function updateEinladungenBadge() {
    const badge = document.getElementById('notizen-einladungen-badge');
    if (badge) {
        const pendingCount = allEinladungen.filter(e => e.status === 'pending').length;
        if (pendingCount > 0) {
            badge.classList.remove('hidden');
            badge.textContent = pendingCount;
        } else {
            badge.classList.add('hidden');
        }
    }
}

async function openEinladungen() {
    const modal = document.getElementById('notizenEinladungenModal');
    if (!modal) {
        console.error('Notizen: Einladungen-Modal nicht gefunden!');
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    console.log('Notizen: Einladungen-Modal geöffnet');
    await ensureUserConfigLoaded();
    renderEinladungen();
}

function renderEinladungen() {
    const container = document.getElementById('notizen-einladungen-liste');
    if (!container) return;
    
    let html = '';
    
    // Empfangene Einladungen - nur pending und rejected anzeigen (accepted sind bereits in Kategorien-Liste)
    const pendingOrRejected = allEinladungen.filter(e => e.status === 'pending' || e.status === 'rejected');
    if (pendingOrRejected.length > 0) {
        html += '<h3 class="text-sm font-bold text-gray-600 mb-2">📥 Empfangene Einladungen</h3>';
        html += pendingOrRejected.map(einl => {
            const isRejected = einl.status === 'rejected';
            const isKategorie = einl.type === 'kategorie';
            const typeLabel = isKategorie ? 'eine Kategorie' : 'eine Notiz';
            const statusLabel = isRejected ? '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">Abgelehnt</span>' : '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Ausstehend</span>';
            const actions = isRejected
                ? `<button onclick="window.revokeEinladung('${einl.id}')" class="px-3 py-1 bg-blue-500 text-white rounded">↩ Zurückrufen</button>`
                : `
                    <button onclick="window.acceptEinladung('${einl.id}')" class="px-3 py-1 bg-green-500 text-white rounded">✓ Annehmen</button>
                    <button onclick="window.rejectEinladung('${einl.id}')" class="px-3 py-1 bg-red-500 text-white rounded">✕ Ablehnen</button>
                `;
            return `
                <div class="bg-white p-4 rounded-lg shadow border mb-2">
                    <div class="flex justify-between items-center mb-2">
                        <div><span class="font-bold">${getDisplayNameById(einl.fromUserId)}</span> teilt ${typeLabel}</div>
                        ${statusLabel}
                    </div>
                    <div class="text-sm text-gray-600 mb-3">Berechtigung: ${einl.role === 'read' ? '👁️ Lesen' : '✏️ Schreiben'}</div>
                    <div class="flex gap-2 flex-wrap">
                        ${actions}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // Gesendete Einladungen
    if (allGesendetEinladungen.length > 0) {
        html += '<h3 class="text-sm font-bold text-gray-600 mb-2 mt-4">📤 Gesendete Einladungen</h3>';
        html += allGesendetEinladungen.map(einl => {
            const isKategorie = einl.type === 'kategorie';
            const typeLabel = isKategorie ? 'Kategorie' : 'Notiz';
            const isAccepted = einl.status === 'accepted';
            const statusLabel = isAccepted 
                ? '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Angenommen</span>'
                : '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Ausstehend</span>';
            const bgClass = isAccepted ? 'bg-green-50' : 'bg-blue-50';
            const buttonLabel = isAccepted ? '✕ Teilen beenden' : '✕ Abbrechen';
            return `
                <div class="${bgClass} p-4 rounded-lg shadow border mb-2">
                    <div class="flex justify-between items-center mb-2">
                        <div>${typeLabel} an <span class="font-bold">${getDisplayNameById(einl.toUserId)}</span></div>
                        ${statusLabel}
                    </div>
                    <div class="text-sm text-gray-600 mb-3">Berechtigung: ${einl.role === 'read' ? '👁️ Lesen' : '✏️ Schreiben'}</div>
                    <div class="flex gap-2 flex-wrap">
                        <button onclick="window.cancelEinladung('${einl.id}')" class="px-3 py-1 bg-red-500 text-white rounded">${buttonLabel}</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    if (!html) {
        html = '<p class="text-gray-400 text-center py-4">Keine Einladungen</p>';
    }
    
    container.innerHTML = html;
}

window.acceptEinladung = async function(einladungId) {
    const einladung = allEinladungen.find(e => e.id === einladungId);
    if (!einladung) return;
    try {
        const einlRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen', einladungId);
        await updateDoc(einlRef, { status: 'accepted', respondedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        
        if (einladung.type === 'kategorie' && einladung.kategorieId) {
            const katRef = doc(db, 'artifacts', appId, 'users', einladung.fromUserId, 'notizen_kategorien', einladung.kategorieId);
            await updateDoc(katRef, {
                [`sharedWith.${currentUser.mode}.status`]: 'active'
            });
            
            // Alle Notizen in dieser Kategorie mit User teilen (damit Firestore Rules funktionieren)
            try {
                const notizenRef = collection(db, 'artifacts', appId, 'users', einladung.fromUserId, 'notizen');
                const qNotizen = query(notizenRef, where('kategorieId', '==', einladung.kategorieId));
                const notizenSnap = await getDocs(qNotizen);
                for (const notizDoc of notizenSnap.docs) {
                    await updateDoc(notizDoc.ref, {
                        [`sharedWith.${currentUser.mode}`]: {
                            role: einladung.role || 'read',
                            status: 'active',
                            since: serverTimestamp(),
                            sharedBy: einladung.fromUserId,
                            viaKategorie: einladung.kategorieId
                        }
                    });
                }
                console.log('Notizen: Notizen in Kategorie geteilt:', notizenSnap.size);
            } catch (notizError) {
                console.warn('Notizen: Fehler beim Teilen der Notizen in Kategorie:', notizError);
            }
        } else if (einladung.notizId) {
            const notizRef = doc(db, 'artifacts', appId, 'users', einladung.fromUserId, 'notizen', einladung.notizId);
            await updateDoc(notizRef, {
                [`sharedWith.${currentUser.mode}.status`]: 'active'
            });
        }
        alertUser('Angenommen', 'success');
        
        // Modal schließen und UI aktualisieren
        const modal = document.getElementById('notizenEinladungenModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        loadKategorien();
        loadNotizen();
    } catch (error) {
        console.error('Notizen: Accept Fehler:', error);
        alertUser('Fehler', 'error');
    }
};

window.rejectEinladung = async function(einladungId) {
    const einladung = allEinladungen.find(e => e.id === einladungId);
    if (!einladung) return;
    try {
        const einlRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen', einladungId);
        await updateDoc(einlRef, { status: 'rejected', respondedAt: serverTimestamp(), updatedAt: serverTimestamp() });
        
        if (einladung.type === 'kategorie' && einladung.kategorieId) {
            const katRef = doc(db, 'artifacts', appId, 'users', einladung.fromUserId, 'notizen_kategorien', einladung.kategorieId);
            await updateDoc(katRef, {
                [`sharedWith.${currentUser.mode}.status`]: 'rejected'
            });
        } else if (einladung.notizId) {
            const notizRef = doc(db, 'artifacts', appId, 'users', einladung.fromUserId, 'notizen', einladung.notizId);
            await updateDoc(notizRef, {
                [`sharedWith.${currentUser.mode}.status`]: 'rejected'
            });
        }
        alertUser('Abgelehnt', 'success');
    } catch (error) {
        console.error('Notizen: Reject Fehler:', error);
        alertUser('Fehler', 'error');
    }
};

window.revokeEinladung = async function(einladungId) {
    const einladung = allEinladungen.find(e => e.id === einladungId);
    if (!einladung) return;
    if (!confirm('Ablehnung zurückrufen? Danach kann erneut eingeladen werden.')) return;
    try {
        const einlRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen', einladungId);
        await updateDoc(einlRef, { status: 'revoked', respondedAt: serverTimestamp(), updatedAt: serverTimestamp() });

        const updatePayload = {};
        updatePayload[`sharedWith.${currentUser.mode}`] = deleteField();
        
        if (einladung.type === 'kategorie' && einladung.kategorieId) {
            const katRef = doc(db, 'artifacts', appId, 'users', einladung.fromUserId, 'notizen_kategorien', einladung.kategorieId);
            await updateDoc(katRef, updatePayload);
        } else if (einladung.notizId) {
            const notizRef = doc(db, 'artifacts', appId, 'users', einladung.fromUserId, 'notizen', einladung.notizId);
            await updateDoc(notizRef, updatePayload);
        }
        alertUser('Zurückgerufen', 'success');
    } catch (error) {
        console.error('Notizen: Revoke Fehler:', error);
        alertUser('Fehler', 'error');
    }
};

window.cancelEinladung = async function(einladungId) {
    const einladung = allGesendetEinladungen.find(e => e.id === einladungId);
    if (!einladung) return;
    const isAccepted = einladung.status === 'accepted';
    const confirmMsg = isAccepted ? 'Teilen wirklich beenden?' : 'Einladung wirklich abbrechen?';
    if (!confirm(confirmMsg)) return;
    try {
        const einlRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen', einladungId);
        await updateDoc(einlRef, { status: 'cancelled', updatedAt: serverTimestamp() });

        const updatePayload = {};
        updatePayload[`sharedWith.${einladung.toUserId}`] = deleteField();
        
        if (einladung.type === 'kategorie' && einladung.kategorieId) {
            // Kategorie-sharedWith entfernen
            const katRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen_kategorien', einladung.kategorieId);
            await updateDoc(katRef, updatePayload);
            
            // WICHTIG: Auch alle Notizen in dieser Kategorie aktualisieren
            const notizenRef = collection(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen');
            const qNotizen = query(notizenRef, where('kategorieId', '==', einladung.kategorieId));
            const notizenSnap = await getDocs(qNotizen);
            
            for (const notizDoc of notizenSnap.docs) {
                const notizData = notizDoc.data();
                // Nur wenn User in sharedWith steht und viaKategorie passt
                if (notizData.sharedWith?.[einladung.toUserId]?.viaKategorie === einladung.kategorieId) {
                    await updateDoc(notizDoc.ref, updatePayload);
                }
            }
            console.log('Notizen: sharedWith aus', notizenSnap.size, 'Notizen entfernt');
        } else if (einladung.notizId) {
            const notizRef = doc(db, 'artifacts', appId, 'users', currentUser.mode, 'notizen', einladung.notizId);
            await updateDoc(notizRef, updatePayload);
        }
        alertUser(isAccepted ? 'Teilen beendet' : 'Einladung abgebrochen', 'success');
        renderEinladungen();
    } catch (error) {
        console.error('Notizen: Cancel Fehler:', error);
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
    const displayName = getDisplayNameById(userId);
    
    // Header-Indikator (klein)
    const indicator = document.getElementById('notiz-checkout-indicator');
    const userSpan = document.getElementById('notiz-checkout-user');
    if (indicator && userSpan) {
        userSpan.textContent = displayName;
        indicator.classList.remove('hidden');
    }
    
    // Prominentes Banner unter den Buttons
    const banner = document.getElementById('notiz-checkout-banner');
    const bannerUser = document.getElementById('notiz-checkout-user-banner');
    if (banner && bannerUser) {
        bannerUser.textContent = displayName;
        banner.classList.remove('hidden');
    }
    
    const saveBtn = document.getElementById('btn-notiz-save');
    if (saveBtn) saveBtn.disabled = true;
    document.querySelectorAll('#notiz-hauptteil-container input, #notiz-hauptteil-container textarea, #notiz-hauptteil-container select').forEach(el => el.disabled = true);
}

function hideCheckoutWarning() {
    const indicator = document.getElementById('notiz-checkout-indicator');
    if (indicator) indicator.classList.add('hidden');
    
    const banner = document.getElementById('notiz-checkout-banner');
    if (banner) banner.classList.add('hidden');
    
    const saveBtn = document.getElementById('btn-notiz-save');
    if (saveBtn) saveBtn.disabled = false;
    document.querySelectorAll('#notiz-hauptteil-container input, #notiz-hauptteil-container textarea, #notiz-hauptteil-container select').forEach(el => el.disabled = false);
}

async function addHistory(notizId, action, changes) {
    try {
        const ownerId = currentEditingOwnerId || currentUser.mode;
        const colRef = collection(db, 'artifacts', appId, 'users', ownerId, 'notizen', notizId, 'history');
        await addDoc(colRef, { timestamp: serverTimestamp(), userId: currentUser.mode, action, changes: JSON.stringify(changes) });
    } catch (error) {
        console.error('History Fehler:', error);
    }
}

async function showHistory() {
    if (!currentEditingNotizId) return;
    await ensureUserConfigLoaded();
    const modal = document.getElementById('notizHistoryModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const container = document.getElementById('notiz-history-liste');
    container.innerHTML = '<p class="text-gray-400 text-center py-4">Lade...</p>';
    try {
        const ownerId = currentEditingOwnerId || currentUser.mode;
        const colRef = collection(db, 'artifacts', appId, 'users', ownerId, 'notizen', currentEditingNotizId, 'history');
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
                    <div class="text-xs text-gray-600">von ${getDisplayNameById(data.userId)}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler</p>';
    }
}
