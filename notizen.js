// NOTIZEN-PROGRAMM - Strukturierte Notizen mit Kategorien, Sharing & Live-Sync
import { db, appId, currentUser, GUEST_MODE, alertUser } from './haupteingang.js';
import { collection, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, query, where, serverTimestamp, writeBatch, orderBy, limit as firestoreLimit, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let kategorienListener = null, notizenListener = null, einladungenListener = null;
let allKategorien = [], allNotizen = [], allEinladungen = [];
let currentEditingNotizId = null, checkoutHeartbeat = null;
let shareUsersCache = [];
let currentSharingKategorieId = null;
let userConfigLoaded = false;
let userDisplayNameCache = {};
let notizIsEditMode = false;

export function initializeNotizen() {
    console.log('Notizen: Init...');
    setupEventListeners();
    ensureUserConfigLoaded();
    loadKategorien();
    loadNotizen();
    loadEinladungen();
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

    const resetBtn = document.getElementById('reset-filters-notizen');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            ['search-notizen', 'filter-notizen-status', 'filter-notizen-kategorie', 'filter-notizen-subkategorie', 'filter-notizen-shared'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const subkategorieFilter = document.getElementById('filter-notizen-subkategorie');
            if (subkategorieFilter) subkategorieFilter.disabled = true;
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
            if (type) addElement(type);
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
        statusSelect.value = 'info';
        statusSelect.disabled = true;
    } else {
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
    notizIsEditMode = true;
    const dropdown = document.getElementById('notiz-weitere-optionen-dropdown');
    const arrow = document.getElementById('notiz-dropdown-arrow');
    if (dropdown) dropdown.classList.add('hidden');
    if (arrow) arrow.textContent = '▼';

    const fieldsToUnlock = ['notiz-betreff', 'notiz-kategorie', 'notiz-subkategorie', 'notiz-erinnerung', 'notiz-frist'];
    fieldsToUnlock.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });

    document.querySelectorAll('.notiz-add-element').forEach(btn => btn.style.display = '');

    const container = document.getElementById('notiz-hauptteil-container');
    if (container) {
        container.querySelectorAll('[data-element-type]').forEach(el => {
            el.querySelectorAll('input, textarea, select').forEach(input => input.disabled = false);
            el.querySelectorAll('.move-up, .move-down, .delete-element, .add-table-row').forEach(btn => btn.style.display = '');
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
            const sharedRole = alreadyShared[u.id]?.role;
            const checkedAttr = sharedRole ? 'checked' : '';
            const roleValue = sharedRole || 'read';
            return `
                <div class="kategorie-share-user-row flex items-center justify-between gap-2 p-2 border-b last:border-b-0" data-search="${searchText}">
                    <label class="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        <input type="checkbox" class="kategorie-share-user-checkbox" data-userid="${u.id}" ${checkedAttr}>
                        <div class="min-w-0">
                            <div class="text-sm font-semibold truncate">${displayText}</div>
                        </div>
                    </label>
                    <select class="kategorie-share-user-role text-xs border rounded px-2 py-1" data-userid="${u.id}">
                        <option value="read" ${roleValue === 'read' ? 'selected' : ''}>👁️ Lesen</option>
                        <option value="write" ${roleValue === 'write' ? 'selected' : ''}>✏️ Schreiben</option>
                    </select>
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
        const userId = cb.dataset.userid;
        const roleEl = list.querySelector(`.kategorie-share-user-role[data-userid="${userId}"]`);
        const role = roleEl ? roleEl.value : 'read';
        return { userId, role };
    }).filter(x => x.userId);

    if (selected.length === 0) {
        alertUser('Benutzer auswählen', 'error');
        return;
    }

    try {
        const userId = currentUser.mode;
        const docRef = doc(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien', currentSharingKategorieId);

        const updatePayload = {};
        selected.forEach(({ userId: targetUserId, role }) => {
            updatePayload[`sharedWith.${targetUserId}`] = { role, since: serverTimestamp(), status: 'active' };
        });

        await updateDoc(docRef, updatePayload);
        alertUser('Kategorie geteilt', 'success');
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
        
        // Geteilte Kategorien von anderen Usern laden
        try {
            const usersRef = collection(db, 'artifacts', appId, 'users');
            const usersSnap = await getDocs(usersRef);
            
            for (const userDoc of usersSnap.docs) {
                if (userDoc.id === userId) continue; // Eigene überspringen
                
                const sharedKatRef = collection(db, 'artifacts', appId, 'users', userDoc.id, 'notizen_kategorien');
                const sharedKatSnap = await getDocs(sharedKatRef);
                
                for (const katDoc of sharedKatSnap.docs) {
                    const katData = katDoc.data();
                    if (katData.sharedWith && katData.sharedWith[userId]) {
                        const kategorie = { id: katDoc.id, ...katData, subkategorien: [], ownerId: userDoc.id };
                        const subColRef = collection(db, 'artifacts', appId, 'users', userDoc.id, 'notizen_kategorien', katDoc.id, 'subkategorien');
                        const subSnap = await getDocs(subColRef);
                        subSnap.forEach(subDoc => kategorie.subkategorien.push({ id: subDoc.id, ...subDoc.data() }));
                        allKategorien.push(kategorie);
                    }
                }
            }
        } catch (error) {
            console.warn('Fehler beim Laden geteilter Kategorien:', error);
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
        const statusColors = { 'offen': 'bg-blue-100 text-blue-800', 'in_bearbeitung': 'bg-yellow-100 text-yellow-800', 'erledigt': 'bg-green-100 text-green-800', 'info': 'bg-blue-100 text-blue-800' };
        const statusIcons = { 'offen': '🔵', 'in_bearbeitung': '🟡', 'erledigt': '🟢', 'info': 'ℹ️' };
        const statusLabels = { 'offen': 'Offen', 'in_bearbeitung': 'In Bearbeitung', 'erledigt': 'Erledigt', 'info': 'INFO' };
        const borderClass = notiz.status === 'offen' ? 'border-blue-500' : notiz.status === 'in_bearbeitung' ? 'border-yellow-500' : notiz.status === 'info' ? 'border-blue-500' : 'border-green-500';
        return `
            <div class="bg-white p-4 rounded-lg shadow hover:shadow-md transition border-l-4 ${borderClass}">
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
                </div>
                <button onclick="window.openNotizById('${notiz.id}')" class="px-3 py-1 bg-amber-500 text-white text-sm rounded hover:bg-amber-600">📝 Öffnen</button>
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
        await loadNotizData(notizId);
        await checkoutNotiz(notizId);
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

async function loadNotizData(notizId) {
    await ensureUserConfigLoaded();
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
    const infoCb = document.getElementById('notiz-status-info');
    if (infoCb) infoCb.checked = (notiz.status === 'info');
    const statusSelect = document.getElementById('notiz-status');
    if (statusSelect) statusSelect.value = notiz.status || 'offen';
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
    if (notiz.elements && notiz.elements.length > 0) {
        notiz.elements.forEach(el => renderElement(el));
    } else {
        container.innerHTML = '<p class="text-gray-400 text-center text-sm col-span-full">Füge Elemente hinzu...</p>';
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
        document.getElementById('notiz-meta-edited').textContent = notiz.lastEditedAt ? new Date(notiz.lastEditedAt.toDate()).toLocaleString('de-DE') + ' von ' + getDisplayNameById(notiz.lastEditedBy) : 'Noch nicht bearbeitet';
    }
    
    // Felder sperren beim Bearbeiten (außer Status und Checkboxen)
    lockEditFields();
}

function lockEditFields() {
    // Betreff, Kategorie, Subkategorie, Erinnerung, Frist sperren
    const fieldsToLock = ['notiz-betreff', 'notiz-kategorie', 'notiz-subkategorie', 'notiz-erinnerung', 'notiz-frist'];
    fieldsToLock.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
    
    // Alle Element-Buttons (hinzufügen) verstecken
    document.querySelectorAll('.notiz-add-element').forEach(btn => btn.style.display = 'none');
    
    // Alle Elemente sperren AUSSER Checkboxen
    const container = document.getElementById('notiz-hauptteil-container');
    if (container) {
        container.querySelectorAll('[data-element-type]').forEach(el => {
            const type = el.dataset.elementType;
            if (type !== 'checkbox') {
                // Alle Inputs/Textareas/Selects in diesem Element sperren
                el.querySelectorAll('input:not([type="checkbox"]), textarea, select').forEach(input => input.disabled = true);
            } else {
                // Bei Checkbox-Elementen darf nur die Checkbox selbst editierbar sein
                el.querySelectorAll('input:not([type="checkbox"])').forEach(input => input.disabled = true);
            }
            // Verschiebe- und Lösch-Buttons verstecken
            el.querySelectorAll('.move-up, .move-down, .delete-element, .add-table-row').forEach(btn => btn.style.display = 'none');
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
    
    // Element-Buttons wieder anzeigen
    document.querySelectorAll('.notiz-add-element').forEach(btn => btn.style.display = '');
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
    container.innerHTML = '<p class="text-gray-400 text-center text-sm col-span-full">Füge Elemente hinzu...</p>';
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
        element.subtitle = el.querySelector('.element-subtitle')?.value || '';
        switch (type) {
            case 'text': element.content = el.querySelector('textarea')?.value || ''; break;
            case 'list': element.content = el.querySelector('textarea')?.value || ''; break;
            case 'checkbox':
                element.label = el.querySelector('.checkbox-label-input')?.value || '';
                element.checked = el.querySelector('input[type="checkbox"]')?.checked || false;
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
    if (!currentEditingNotizId) return;
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
    if (type === 'line') {
        elementDiv.classList.add('md:col-span-2');
    }
    let content = '';
    switch (type) {
        case 'text':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">📝 Text</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><textarea class="w-full p-2 border rounded" rows="3"></textarea>`;
            break;
        case 'list':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">📌 Aufzählung</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><textarea class="w-full p-2 border rounded" rows="4" placeholder="Jede Zeile ein Punkt..."></textarea>`;
            break;
        case 'checkbox':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">☑️ Checkbox</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><div class="flex gap-2"><input type="checkbox" class="w-5 h-5"><input type="text" placeholder="Label..." class="checkbox-label-input flex-1 p-2 border rounded"></div>`;
            break;
        case 'line':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">➖ Linie</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><hr class="border-t-2">`;
            break;
        case 'table':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">📊 Tabelle</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="add-table-row text-xs px-2 py-1 bg-blue-500 text-white rounded">+ Zeile</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><table class="w-full border"><thead><tr><th><input type="text" placeholder="Spalte 1" class="w-full p-1 border"></th><th><input type="text" placeholder="Spalte 2" class="w-full p-1 border"></th></tr></thead><tbody><tr><td><input type="text" class="w-full p-1 border"></td><td><input type="text" class="w-full p-1 border"></td></tr></tbody></table>`;
            break;
        case 'link':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">🔗 Link</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><input type="url" name="url" placeholder="https://..." class="w-full p-2 border rounded mb-2"><input type="text" name="label" placeholder="Anzeigetext" class="w-full p-2 border rounded">`;
            break;
        case 'password':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">🔐 Passwort</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><button class="copy-btn text-xs px-2 py-1 bg-gray-200 rounded">📋</button><button class="toggle-pw text-xs px-2 py-1 bg-blue-500 text-white rounded">👁️</button><button class="delete-element text-xs px-2 py-1 bg-red-500 text-white rounded">✕</button></div></div><input type="text" placeholder="Unterüberschrift..." class="element-subtitle w-full p-2 border rounded mb-2 text-sm"><input type="password" class="password-input w-full p-2 border rounded">`;
            break;
        case 'infobox':
            content = `<div class="flex justify-between mb-2"><span class="font-bold text-sm">💡 Infobox</span><div class="flex gap-1"><button class="move-up text-xs px-2 py-1 bg-gray-300 rounded">▲</button><button class="move-down text-xs px-2 py-1 bg-gray-300 rounded">▼</button><select class="text-xs border rounded px-1">
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
    elementDiv.querySelector('.delete-element')?.addEventListener('click', () => {
        elementDiv.remove();
        if (container.children.length === 0) container.innerHTML = '<p class="text-gray-400 text-center text-sm col-span-full">Füge Elemente hinzu...</p>';
    });
    
    // Move Up/Down Funktionalität
    const moveUpBtn = elementDiv.querySelector('.move-up');
    if (moveUpBtn) {
        moveUpBtn.addEventListener('click', () => {
            const prev = elementDiv.previousElementSibling;
            if (prev && prev.dataset.elementType) {
                container.insertBefore(elementDiv, prev);
            }
        });
    }
    const moveDownBtn = elementDiv.querySelector('.move-down');
    if (moveDownBtn) {
        moveDownBtn.addEventListener('click', () => {
            const next = elementDiv.nextElementSibling;
            if (next && next.dataset.elementType) {
                container.insertBefore(next, elementDiv);
            }
        });
    }
    
    const copyBtn = elementDiv.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            let textToCopy = '';
            if (type === 'text' || type === 'infobox') textToCopy = elementDiv.querySelector('textarea')?.value || '';
            else if (type === 'password') textToCopy = elementDiv.querySelector('.password-input')?.value || '';
            else if (type === 'link') textToCopy = elementDiv.querySelector('input[name="url"]')?.value || '';
            navigator.clipboard.writeText(textToCopy).then(() => alertUser('Kopiert!', 'success'));
        });
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
    const subtitleEl = lastEl.querySelector('.element-subtitle');
    if (subtitleEl) subtitleEl.value = element.subtitle || '';
    switch (element.type) {
        case 'text': lastEl.querySelector('textarea').value = element.content || ''; break;
        case 'list': lastEl.querySelector('textarea').value = element.content || ''; break;
        case 'checkbox':
            lastEl.querySelector('input[type="checkbox"]').checked = element.checked || false;
            lastEl.querySelector('.checkbox-label-input').value = element.label || '';
            break;
        case 'link':
            lastEl.querySelector('input[name="url"]').value = element.url || '';
            lastEl.querySelector('input[name="label"]').value = element.label || '';
            break;
        case 'password': lastEl.querySelector('.password-input').value = element.content || ''; break;
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
    const list = document.getElementById('share-user-list');
    if (!list || !currentEditingNotizId) {
        alertUser('Fehler', 'error');
        return;
    }

    const selected = Array.from(list.querySelectorAll('.share-user-checkbox:checked')).map(cb => {
        const userId = cb.dataset.userid;
        const roleEl = list.querySelector(`.share-user-role[data-userid="${userId}"]`);
        const role = roleEl ? roleEl.value : 'read';
        return { userId, role };
    }).filter(x => x.userId);

    if (selected.length === 0) {
        alertUser('Benutzer auswählen', 'error');
        return;
    }

    try {
        console.log('Notizen: Sende Einladungen an:', selected);
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
        const batch = writeBatch(db);

        selected.forEach(({ userId, role }) => {
            const newRef = doc(colRef);
            batch.set(newRef, {
                notizId: currentEditingNotizId,
                fromUserId: currentUser.mode,
                toUserId: userId,
                role,
                status: 'pending',
                createdAt: serverTimestamp()
            });
        });

        await batch.commit();

        alertUser('Einladungen gesendet', 'success');
        const modal = document.getElementById('notizShareModal');
        if (modal) modal.classList.add('hidden');
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
            <span>${getDisplayNameById(userId)} (${data.role === 'read' ? '👁️ Lesen' : '✏️ Schreiben'})</span>
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
        await addHistory(currentEditingNotizId, `Berechtigung entzogen: ${getDisplayNameById(userId)}`, {});
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
    if (allEinladungen.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Keine Einladungen</p>';
        return;
    }
    container.innerHTML = allEinladungen.map(einl => `
        <div class="bg-white p-4 rounded-lg shadow border">
            <div class="mb-2"><span class="font-bold">${getDisplayNameById(einl.fromUserId)}</span> teilt eine Notiz</div>
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
        userSpan.textContent = getDisplayNameById(userId);
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
    await ensureUserConfigLoaded();
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
                    <div class="text-xs text-gray-600">von ${getDisplayNameById(data.userId)}</div>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler</p>';
    }
}
