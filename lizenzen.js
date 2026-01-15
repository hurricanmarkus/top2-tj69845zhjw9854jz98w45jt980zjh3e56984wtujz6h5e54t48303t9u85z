import { alertUser, db, currentUser, USERS, appId } from './haupteingang.js';

import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

let lizenzenRef = null;
let kategorienRef = null;
let produkteRef = null;

let LIZENZEN = {};
let KATEGORIEN = [];
let PRODUKTE = [];

let currentFilter = { produktId: '', kategorieId: '', status: 'aktiv', ohneSpiele: false };
let searchTerm = '';

let unsubscribeLizenzen = null;
let unsubscribeKategorien = null;
let unsubscribeProdukte = null;

let lizenzenInitialisiert = false;

export function initializeLizenzen() {
    if (lizenzenInitialisiert) return;
    lizenzenInitialisiert = true;

    console.log("🔑 Lizenzen: initializeLizenzen startet...");

    if (db) {
        lizenzenRef = collection(db, 'artifacts', appId, 'public', 'data', 'lizenzen');
        kategorienRef = collection(db, 'artifacts', appId, 'public', 'data', 'lizenzen_kategorien');
        produkteRef = collection(db, 'artifacts', appId, 'public', 'data', 'lizenzen_produkte');
    }

    setupEventListeners();

    try {
        renderLizenzenTable();
        updateLizenzenStats();
    } catch (e) {
        console.warn("Lizenzen: UI konnte nicht initial gerendert werden:", e);
    }
}

function setupEventListeners() {
    const createBtn = document.getElementById('btn-create-lizenz');
    if (createBtn && !createBtn.dataset.listenerAttached) {
        createBtn.addEventListener('click', openCreateLizenzModal);
        createBtn.dataset.listenerAttached = 'true';
    }

    const settingsBtn = document.getElementById('btn-lizenzen-settings');
    if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
        settingsBtn.addEventListener('click', openLizenzenSettingsModal);
        settingsBtn.dataset.listenerAttached = 'true';
    }

    const closeModalBtn = document.getElementById('closeLizenzModal');
    if (closeModalBtn && !closeModalBtn.dataset.listenerAttached) {
        closeModalBtn.addEventListener('click', closeLizenzModal);
        closeModalBtn.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelLizenzBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeLizenzModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveLizenzBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveLizenz);
        saveBtn.dataset.listenerAttached = 'true';
    }

    const closeSettingsBtn = document.getElementById('closeLizenzenSettingsModal');
    if (closeSettingsBtn && !closeSettingsBtn.dataset.listenerAttached) {
        closeSettingsBtn.addEventListener('click', closeLizenzenSettingsModal);
        closeSettingsBtn.dataset.listenerAttached = 'true';
    }

    const cancelSettingsBtn = document.getElementById('cancelLizenzenSettingsBtn');
    if (cancelSettingsBtn && !cancelSettingsBtn.dataset.listenerAttached) {
        cancelSettingsBtn.addEventListener('click', closeLizenzenSettingsModal);
        cancelSettingsBtn.dataset.listenerAttached = 'true';
    }

    const addKategorieBtn = document.getElementById('btn-add-lizenz-kategorie');
    if (addKategorieBtn && !addKategorieBtn.dataset.listenerAttached) {
        addKategorieBtn.addEventListener('click', addKategorie);
        addKategorieBtn.dataset.listenerAttached = 'true';
    }

    const addProduktBtn = document.getElementById('btn-add-lizenz-produkt');
    if (addProduktBtn && !addProduktBtn.dataset.listenerAttached) {
        addProduktBtn.addEventListener('click', addProdukt);
        addProduktBtn.dataset.listenerAttached = 'true';
    }

    const aktiviertAufSelect = document.getElementById('lizAktiviertAufSelect');
    if (aktiviertAufSelect && !aktiviertAufSelect.dataset.listenerAttached) {
        aktiviertAufSelect.addEventListener('change', handleAktiviertAufChange);
        aktiviertAufSelect.dataset.listenerAttached = 'true';
    }

    const searchInput = document.getElementById('search-lizenzen');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = String(e.target.value || '').toLowerCase();
            renderLizenzenTable();
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    const filterProdukt = document.getElementById('filter-liz-produkt');
    if (filterProdukt && !filterProdukt.dataset.listenerAttached) {
        filterProdukt.addEventListener('change', (e) => {
            currentFilter.produktId = String(e.target.value || '');
            renderLizenzenTable();
        });
        filterProdukt.dataset.listenerAttached = 'true';
    }

    const filterKategorie = document.getElementById('filter-liz-kategorie');
    if (filterKategorie && !filterKategorie.dataset.listenerAttached) {
        filterKategorie.addEventListener('change', (e) => {
            currentFilter.kategorieId = String(e.target.value || '');
            renderLizenzenTable();
        });
        filterKategorie.dataset.listenerAttached = 'true';
    }

    const filterStatus = document.getElementById('filter-liz-status');
    if (filterStatus && !filterStatus.dataset.listenerAttached) {
        filterStatus.addEventListener('change', (e) => {
            currentFilter.status = String(e.target.value || '');
            renderLizenzenTable();
        });
        filterStatus.dataset.listenerAttached = 'true';
    }

    const toggleOhneSpiele = document.getElementById('filter-liz-ohne-spiele');
    if (toggleOhneSpiele && !toggleOhneSpiele.dataset.listenerAttached) {
        toggleOhneSpiele.addEventListener('change', (e) => {
            currentFilter.ohneSpiele = !!e.target.checked;
            renderLizenzenTable();
        });
        toggleOhneSpiele.dataset.listenerAttached = 'true';
    }

    const resetFilters = document.getElementById('reset-filters-lizenzen');
    if (resetFilters && !resetFilters.dataset.listenerAttached) {
        resetFilters.addEventListener('click', () => {
            currentFilter = { produktId: '', kategorieId: '', status: 'aktiv', ohneSpiele: false };
            searchTerm = '';

            const s = document.getElementById('search-lizenzen');
            const fp = document.getElementById('filter-liz-produkt');
            const fk = document.getElementById('filter-liz-kategorie');
            const fs = document.getElementById('filter-liz-status');
            const tog = document.getElementById('filter-liz-ohne-spiele');

            if (s) s.value = '';
            if (fp) fp.value = '';
            if (fk) fk.value = '';
            if (fs) fs.value = 'aktiv';
            if (tog) tog.checked = false;

            renderLizenzenTable();
        });
        resetFilters.dataset.listenerAttached = 'true';
    }
}

export function stopLizenzenListener() {
    if (unsubscribeLizenzen) {
        unsubscribeLizenzen();
        unsubscribeLizenzen = null;
    }
    if (unsubscribeKategorien) {
        unsubscribeKategorien();
        unsubscribeKategorien = null;
    }
    if (unsubscribeProdukte) {
        unsubscribeProdukte();
        unsubscribeProdukte = null;
    }

    LIZENZEN = {};
    KATEGORIEN = [];
    PRODUKTE = [];

    try {
        renderLizenzenTable();
        updateLizenzenStats();
        renderKategorienList();
        renderProdukteList();
        fillKategorieDropdown();
        fillProduktDropdown();
    } catch (e) {
        console.warn("Lizenzen: UI konnte nach stopLizenzenListener nicht aktualisiert werden:", e);
    }
}

export function listenForLizenzen() {
    if (!currentUser?.mode || currentUser.mode === 'Gast') {
        stopLizenzenListener();
        return;
    }

    if (!lizenzenRef || !kategorienRef || !produkteRef) {
        console.warn("Lizenzen: Collections noch nicht initialisiert. Warte...");
        setTimeout(listenForLizenzen, 500);
        return;
    }

    stopLizenzenListener();

    console.log("🔑 Lizenzen: Starte Listener...");

    listenForKategorien();
    listenForProdukte();

    try {
        const q = query(lizenzenRef, where('createdBy', '==', currentUser.mode));
        unsubscribeLizenzen = onSnapshot(q, (snapshot) => {
            const arr = [];
            snapshot.forEach((docSnap) => {
                arr.push({ id: docSnap.id, ...(docSnap.data() || {}) });
            });

            arr.sort((a, b) => {
                const aTs = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const bTs = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return bTs - aTs;
            });

            LIZENZEN = {};
            arr.forEach((l) => {
                LIZENZEN[l.id] = l;
            });

            console.log(`✅ Lizenzen geladen: ${arr.length}`);
            renderLizenzenTable();
            updateLizenzenStats();
        }, (error) => {
            console.error("Lizenzen: Fehler beim Laden:", error);
            alertUser("Fehler beim Laden der Lizenzen. Bitte Firestore-Regeln prüfen.", 'error');
        });
    } catch (error) {
        console.error("Lizenzen: Fehler beim Setup des Listeners:", error);
    }
}

function listenForKategorien() {
    if (unsubscribeKategorien) unsubscribeKategorien();

    try {
        const q = query(kategorienRef, where('createdBy', '==', currentUser.mode));
        unsubscribeKategorien = onSnapshot(q, (snapshot) => {
            KATEGORIEN = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                KATEGORIEN.push({ id: docSnap.id, ...data });
            });

            KATEGORIEN.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
            fillKategorieDropdown();
            renderKategorienList();
            renderLizenzenTable();
        }, (error) => {
            console.error("Lizenzen: Fehler beim Laden der Kategorien:", error);
        });
    } catch (e) {
        console.error("Lizenzen: Fehler beim Setup Kategorien-Listener:", e);
    }
}

function listenForProdukte() {
    if (unsubscribeProdukte) unsubscribeProdukte();

    try {
        const q = query(produkteRef, where('createdBy', '==', currentUser.mode));
        unsubscribeProdukte = onSnapshot(q, (snapshot) => {
            PRODUKTE = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data() || {};
                PRODUKTE.push({ id: docSnap.id, ...data });
            });

            PRODUKTE.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
            fillProduktDropdown();
            renderProdukteList();
            renderLizenzenTable();
        }, (error) => {
            console.error("Lizenzen: Fehler beim Laden der Produkte:", error);
        });
    } catch (e) {
        console.error("Lizenzen: Fehler beim Setup Produkte-Listener:", e);
    }
}

function updateLizenzenStats() {
    const list = Object.values(LIZENZEN);

    const heute = new Date();
    heute.setHours(0, 0, 0, 0);

    let aktiv = 0;
    let bald = 0;
    let abgelaufen = 0;

    list.forEach((l) => {
        const ende = getSafeDate(l.ablaufdatum);
        if (!ende) {
            aktiv += 1;
            return;
        }

        const diffDays = Math.floor((ende.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) abgelaufen += 1;
        else if (diffDays <= 30) bald += 1;
        else aktiv += 1;
    });

    const elAktiv = document.getElementById('stat-lizenzen-aktiv');
    const elBald = document.getElementById('stat-lizenzen-bald');
    const elAbg = document.getElementById('stat-lizenzen-abgelaufen');

    if (elAktiv) elAktiv.textContent = String(aktiv);
    if (elBald) elBald.textContent = String(bald);
    if (elAbg) elAbg.textContent = String(abgelaufen);
}

function renderLizenzenTable() {
    const tbody = document.getElementById('lizenzen-table-body');
    if (!tbody) return;

    let list = Object.values(LIZENZEN);

    if (currentFilter.produktId) {
        list = list.filter(l => l.produktId === currentFilter.produktId);
    }
    if (currentFilter.kategorieId) {
        list = list.filter(l => String(l.kategorieId || '') === currentFilter.kategorieId);
    }
    if (currentFilter.status) {
        list = list.filter(l => getDerivedStatus(l) === currentFilter.status);
    }
    if (currentFilter.ohneSpiele) {
        list = list.filter((l) => {
            const pName = resolveProduktName(l.produktId);
            const kName = resolveKategorieName(l.kategorieId);
            const text = `${pName} ${kName}`.toLowerCase();
            return !text.includes('spiel') && !text.includes('game');
        });
    }
    if (searchTerm) {
        list = list.filter((l) => {
            const searchText = [
                resolveProduktName(l.produktId),
                resolveKategorieName(l.kategorieId),
                l.version,
                l.code,
                resolveAktiviertAufDisplay(l),
                l.lizenziertAn,
                l.shop,
                l.volumen,
                l.notizen
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return searchText.includes(searchTerm);
        });
    }

    list.sort((a, b) => {
        const aStatus = getDerivedStatus(a);
        const bStatus = getDerivedStatus(b);

        const aBucket = aStatus === 'abgelaufen' ? 2 : 0;
        const bBucket = bStatus === 'abgelaufen' ? 2 : 0;
        if (aBucket !== bBucket) return aBucket - bBucket;

        const aDays = getDaysUntilAblauf(a.ablaufdatum);
        const bDays = getDaysUntilAblauf(b.ablaufdatum);
        if (aDays !== bDays) return aDays - bDays;

        const aName = resolveProduktName(a.produktId);
        const bName = resolveProduktName(b.produktId);
        return String(aName || '').localeCompare(String(bName || ''), 'de');
    });

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="px-4 py-8 text-center text-gray-400 italic">
                    Keine Lizenzen gefunden.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = list.map((l) => {
        const produkt = escapeHtml(resolveProduktName(l.produktId));
        const kategorie = escapeHtml(resolveKategorieName(l.kategorieId));
        const version = escapeHtml(l.version || '-');
        const code = escapeHtml(l.code || '-');
        const aktiviertAuf = escapeHtml(resolveAktiviertAufDisplay(l));
        const ablauf = escapeHtml(l.ablaufdatum || '-');
        const restzeitHtml = calculateRestzeitHtml(l.ablaufdatum);
        const status = getDerivedStatus(l);
        const statusHtml = status === 'abgelaufen'
            ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">❌ Abgelaufen</span>'
            : status === 'deaktiviert'
                ? '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800">⏸️ Deaktiviert</span>'
                : '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">✅ Aktiv</span>';

        return `
            <tr class="hover:bg-gray-50 transition">
                <td class="px-4 py-3 text-sm font-semibold">${produkt}</td>
                <td class="px-4 py-3 text-sm">${kategorie}</td>
                <td class="px-4 py-3 text-sm">${version}</td>
                <td class="px-4 py-3 text-sm font-mono">${code}</td>
                <td class="px-4 py-3 text-sm">${aktiviertAuf}</td>
                <td class="px-4 py-3 text-sm">${ablauf}</td>
                <td class="px-4 py-3 text-sm">${restzeitHtml}</td>
                <td class="px-4 py-3 text-sm">${statusHtml}</td>
                <td class="px-4 py-3 text-center">
                    <div class="flex justify-center gap-2">
                        <button onclick="window.openEditLizenz('${l.id}')" class="p-1 text-blue-600 hover:text-blue-800" title="Bearbeiten">✏️</button>
                        <button onclick="window.deleteLizenz('${l.id}')" class="p-1 text-red-600 hover:text-red-800" title="Löschen">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function calculateRestzeitHtml(ablaufdatum) {
    if (!ablaufdatum) return '<span class="text-gray-400">Unbegrenzt</span>';

    const ende = getSafeDate(ablaufdatum);
    if (!ende) return '<span class="text-gray-400">-</span>';

    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    ende.setHours(0, 0, 0, 0);

    const diff = ende.getTime() - heute.getTime();
    const tage = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (tage < 0) return '<span class="text-red-600 font-bold">Abgelaufen</span>';
    if (tage === 0) return '<span class="text-orange-600 font-bold">Heute!</span>';
    if (tage <= 7) return `<span class="text-red-600 font-bold">${tage} Tage</span>`;
    if (tage <= 30) return `<span class="text-orange-600 font-bold">${tage} Tage</span>`;
    if (tage <= 90) return `<span class="text-yellow-600">${tage} Tage</span>`;
    return `<span class="text-green-600">${tage} Tage</span>`;
}

function getSafeDate(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
}

function getDaysUntilAblauf(ablaufdatum) {
    const ende = getSafeDate(ablaufdatum);
    if (!ende) return Infinity;

    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    ende.setHours(0, 0, 0, 0);

    return Math.floor((ende.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
}

function getDerivedStatus(lizenz) {
    const manual = lizenz.status || 'aktiv';
    if (manual === 'abgelaufen') return 'abgelaufen';

    const days = getDaysUntilAblauf(lizenz.ablaufdatum);
    if (Number.isFinite(days) && days < 0) return 'abgelaufen';
    return manual;
}

function resolveKategorieName(id) {
    if (!id) return '-';
    const k = KATEGORIEN.find(x => x.id === id);
    return k?.name || id;
}

function resolveProduktName(id) {
    if (!id) return '-';
    const p = PRODUKTE.find(x => x.id === id);
    return p?.name || id;
}

function resolveAktiviertAufDisplay(lizenz) {
    if (lizenz.aktiviertAufId) {
        const name = (USERS && USERS[lizenz.aktiviertAufId]?.name) ? USERS[lizenz.aktiviertAufId].name : null;
        return name || lizenz.aktiviertAufId;
    }
    if (lizenz.aktiviertAufText) return lizenz.aktiviertAufText;
    return '-';
}

function openCreateLizenzModal() {
    resetLizenzForm();
    openLizenzModal();
}

window.openEditLizenz = function (id) {
    const liz = LIZENZEN[id];
    if (!liz) return;

    document.getElementById('lizenzModalTitle').textContent = 'Lizenz bearbeiten';
    document.getElementById('editLizenzId').value = id;

    setSelectValue('lizKategorieId', liz.kategorieId || '');
    setSelectValue('lizProduktId', liz.produktId || '');

    setInputValue('lizVersion', liz.version || '');
    setInputValue('lizCode', liz.code || '');
    setInputValue('lizLizenziertAn', liz.lizenziertAn || '');

    setInputValue('lizKaufdatum', liz.kaufdatum || '');
    setInputValue('lizAktivierungsdatum', liz.aktivierungsdatum || '');
    setInputValue('lizAblaufdatum', liz.ablaufdatum || '');

    setInputValue('lizVolumen', liz.volumen || '');
    setInputValue('lizShop', liz.shop || '');

    setSelectValue('lizStatus', liz.status || 'aktiv');

    fillAktiviertAufDropdown();

    if (liz.aktiviertAufId) {
        setSelectValue('lizAktiviertAufSelect', liz.aktiviertAufId);
        setInputValue('lizAktiviertAufFrei', '');
    } else if (liz.aktiviertAufText) {
        setSelectValue('lizAktiviertAufSelect', 'custom');
        setInputValue('lizAktiviertAufFrei', liz.aktiviertAufText);
    } else {
        setSelectValue('lizAktiviertAufSelect', '');
        setInputValue('lizAktiviertAufFrei', '');
    }

    handleAktiviertAufChange();

    setInputValue('lizBeschraenkungen', liz.beschraenkungen || '');
    setInputValue('lizNotizen', liz.notizen || '');

    openLizenzModal();
};

window.deleteLizenz = async function (id) {
    if (!confirm('Lizenz wirklich löschen?')) return;

    if (!lizenzenRef) return;

    try {
        await deleteDoc(doc(lizenzenRef, id));
        alertUser('Lizenz gelöscht!', 'success');
    } catch (error) {
        console.error('Lizenzen: Fehler beim Löschen:', error);
        alertUser('Fehler beim Löschen: ' + error.message, 'error');
    }
};

function openLizenzModal() {
    fillKategorieDropdown();
    fillProduktDropdown();
    fillAktiviertAufDropdown();
    handleAktiviertAufChange();

    const modal = document.getElementById('lizenzModal');
    if (modal) modal.style.display = 'flex';
}

function closeLizenzModal() {
    const modal = document.getElementById('lizenzModal');
    if (modal) modal.style.display = 'none';
}

function resetLizenzForm() {
    const title = document.getElementById('lizenzModalTitle');
    if (title) title.textContent = 'Neue Lizenz';

    setInputValue('editLizenzId', '');

    setSelectValue('lizKategorieId', '');
    setSelectValue('lizProduktId', '');

    setInputValue('lizVersion', '');
    setInputValue('lizCode', '');
    setInputValue('lizLizenziertAn', '');

    setSelectValue('lizAktiviertAufSelect', '');
    setInputValue('lizAktiviertAufFrei', '');

    setInputValue('lizKaufdatum', '');
    setInputValue('lizAktivierungsdatum', '');
    setInputValue('lizAblaufdatum', '');

    setSelectValue('lizStatus', 'aktiv');

    setInputValue('lizVolumen', '');
    setInputValue('lizShop', '');
    setInputValue('lizBeschraenkungen', '');
    setInputValue('lizNotizen', '');

    handleAktiviertAufChange();
}

async function saveLizenz() {
    if (!currentUser?.mode || currentUser.mode === 'Gast') {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    if (!lizenzenRef) {
        alertUser('Lizenzen: Datenbank nicht bereit.', 'error');
        return;
    }

    const saveBtn = document.getElementById('saveLizenzBtn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const editId = getInputValue('editLizenzId');
        const kategorieId = getSelectValue('lizKategorieId');
        const produktId = getSelectValue('lizProduktId');

        if (!produktId) {
            alertUser('Bitte Produkt auswählen.', 'error');
            return;
        }

        const aktiviertAufSelect = getSelectValue('lizAktiviertAufSelect');
        const aktiviertAufFrei = getInputValue('lizAktiviertAufFrei').trim();

        const aktivData = {
            aktiviertAufId: null,
            aktiviertAufText: null
        };

        if (aktiviertAufSelect === 'custom') {
            if (aktiviertAufFrei) aktivData.aktiviertAufText = aktiviertAufFrei;
        } else if (aktiviertAufSelect) {
            aktivData.aktiviertAufId = aktiviertAufSelect;
        }

        const data = {
            kategorieId: kategorieId || null,
            produktId: produktId,
            version: getInputValue('lizVersion').trim() || null,
            code: getInputValue('lizCode').trim() || null,
            lizenziertAn: getInputValue('lizLizenziertAn').trim() || null,
            kaufdatum: getInputValue('lizKaufdatum') || null,
            aktivierungsdatum: getInputValue('lizAktivierungsdatum') || null,
            ablaufdatum: getInputValue('lizAblaufdatum') || null,
            status: getSelectValue('lizStatus') || 'aktiv',
            volumen: getInputValue('lizVolumen').trim() || null,
            shop: getInputValue('lizShop').trim() || null,
            beschraenkungen: getInputValue('lizBeschraenkungen').trim() || null,
            notizen: getInputValue('lizNotizen').trim() || null,
            ...aktivData,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.mode
        };

        if (editId) {
            await updateDoc(doc(lizenzenRef, editId), data);
            alertUser('Lizenz aktualisiert!', 'success');
        } else {
            await addDoc(lizenzenRef, {
                ...data,
                createdAt: serverTimestamp(),
                createdBy: currentUser.mode
            });
            alertUser('Lizenz erstellt!', 'success');
        }

        closeLizenzModal();
    } catch (error) {
        console.error('Lizenzen: Fehler beim Speichern:', error);
        alertUser('Fehler beim Speichern: ' + error.message, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function openLizenzenSettingsModal() {
    if (!currentUser?.mode || currentUser.mode === 'Gast') {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    const modal = document.getElementById('lizenzenSettingsModal');
    if (modal) modal.style.display = 'flex';

    renderKategorienList();
    renderProdukteList();
}

function closeLizenzenSettingsModal() {
    const modal = document.getElementById('lizenzenSettingsModal');
    if (modal) modal.style.display = 'none';
}

async function addKategorie() {
    if (!currentUser?.mode || currentUser.mode === 'Gast') {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    const input = document.getElementById('new-lizenz-kategorie-input');
    const name = (input?.value || '').trim();

    if (!name) return;

    const exists = KATEGORIEN.some(k => String(k.name || '').toLowerCase() === name.toLowerCase());
    if (exists) {
        alertUser('Kategorie existiert bereits.', 'error');
        return;
    }

    try {
        await addDoc(kategorienRef, {
            name: name,
            createdBy: currentUser.mode,
            createdAt: serverTimestamp()
        });
        if (input) input.value = '';
        alertUser('Kategorie erstellt!', 'success');
    } catch (e) {
        console.error(e);
        alertUser('Fehler.', 'error');
    }
}

async function addProdukt() {
    if (!currentUser?.mode || currentUser.mode === 'Gast') {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    const input = document.getElementById('new-lizenz-produkt-input');
    const name = (input?.value || '').trim();

    if (!name) return;

    const exists = PRODUKTE.some(p => String(p.name || '').toLowerCase() === name.toLowerCase());
    if (exists) {
        alertUser('Produkt existiert bereits.', 'error');
        return;
    }

    try {
        await addDoc(produkteRef, {
            name: name,
            createdBy: currentUser.mode,
            createdAt: serverTimestamp()
        });
        if (input) input.value = '';
        alertUser('Produkt erstellt!', 'success');
    } catch (e) {
        console.error(e);
        alertUser('Fehler.', 'error');
    }
}

function renderKategorienList() {
    const container = document.getElementById('lizenzen-kategorien-list');
    if (!container) return;

    container.innerHTML = '';

    if (KATEGORIEN.length === 0) {
        container.innerHTML = '<p class="text-sm text-center text-gray-400 italic">Keine Kategorien.</p>';
        return;
    }

    KATEGORIEN.forEach((k) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-2 bg-white rounded shadow-sm border';
        div.innerHTML = `
            <span class="font-bold text-gray-800">${escapeHtml(k.name || '-')}</span>
            <button class="delete-liz-kat-btn p-1 text-red-400 hover:bg-red-50 rounded" data-id="${k.id}">🗑️</button>
        `;
        container.appendChild(div);
    });

    container.querySelectorAll('.delete-liz-kat-btn').forEach((btn) => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (!id) return;
            if (!confirm('Kategorie löschen?')) return;
            try {
                await deleteDoc(doc(kategorienRef, id));
            } catch (err) {
                console.error(err);
                alertUser('Fehler beim Löschen.', 'error');
            }
        });
        btn.dataset.listenerAttached = 'true';
    });
}

function renderProdukteList() {
    const container = document.getElementById('lizenzen-produkte-list');
    if (!container) return;

    container.innerHTML = '';

    if (PRODUKTE.length === 0) {
        container.innerHTML = '<p class="text-sm text-center text-gray-400 italic">Keine Produkte.</p>';
        return;
    }

    PRODUKTE.forEach((p) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center p-2 bg-white rounded shadow-sm border';
        div.innerHTML = `
            <span class="font-bold text-gray-800">${escapeHtml(p.name || '-')}</span>
            <button class="delete-liz-prod-btn p-1 text-red-400 hover:bg-red-50 rounded" data-id="${p.id}">🗑️</button>
        `;
        container.appendChild(div);
    });

    container.querySelectorAll('.delete-liz-prod-btn').forEach((btn) => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (!id) return;
            if (!confirm('Produkt löschen?')) return;
            try {
                await deleteDoc(doc(produkteRef, id));
            } catch (err) {
                console.error(err);
                alertUser('Fehler beim Löschen.', 'error');
            }
        });
        btn.dataset.listenerAttached = 'true';
    });
}

function fillKategorieDropdown() {
    const select = document.getElementById('lizKategorieId');
    const filterSelect = document.getElementById('filter-liz-kategorie');

    if (select) {
        const current = select.value;
        select.innerHTML = '<option value="">(Keine Kategorie)</option>';

        KATEGORIEN.forEach((k) => {
            const opt = document.createElement('option');
            opt.value = k.id;
            opt.textContent = k.name || k.id;
            select.appendChild(opt);
        });

        if (current) select.value = current;
    }

    if (filterSelect) {
        const current = filterSelect.value;
        filterSelect.innerHTML = '<option value="">Alle Kategorien</option>';

        KATEGORIEN.forEach((k) => {
            const opt = document.createElement('option');
            opt.value = k.id;
            opt.textContent = k.name || k.id;
            filterSelect.appendChild(opt);
        });

        if (current) filterSelect.value = current;
        currentFilter.kategorieId = filterSelect.value;
    }
}

function fillProduktDropdown() {
    const select = document.getElementById('lizProduktId');
    const filterSelect = document.getElementById('filter-liz-produkt');

    if (select) {
        const current = select.value;
        select.innerHTML = '<option value="">Produkt wählen...</option>';

        PRODUKTE.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            select.appendChild(opt);
        });

        if (current) select.value = current;
    }

    if (filterSelect) {
        const current = filterSelect.value;
        filterSelect.innerHTML = '<option value="">Alle Produkte</option>';

        PRODUKTE.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            filterSelect.appendChild(opt);
        });

        if (current) filterSelect.value = current;
        currentFilter.produktId = filterSelect.value;
    }
}

function fillAktiviertAufDropdown() {
    const select = document.getElementById('lizAktiviertAufSelect');
    if (!select) return;

    const current = select.value;
    select.innerHTML = '';

    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '(Nicht gesetzt)';
    select.appendChild(optEmpty);

    const optSelf = document.createElement('option');
    optSelf.value = currentUser.mode;
    optSelf.textContent = `${currentUser.displayName || currentUser.mode} (ich)`;
    select.appendChild(optSelf);

    const users = USERS ? Object.values(USERS) : [];
    users
        .filter(u => u && u.id && u.id !== currentUser.mode)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'))
        .forEach((u) => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.name || u.id;
            select.appendChild(opt);
        });

    const optCustom = document.createElement('option');
    optCustom.value = 'custom';
    optCustom.textContent = '-- Freie Eingabe --';
    select.appendChild(optCustom);

    if (current) select.value = current;
}

function handleAktiviertAufChange() {
    const select = document.getElementById('lizAktiviertAufSelect');
    const frei = document.getElementById('lizAktiviertAufFrei');
    if (!select || !frei) return;

    if (select.value === 'custom') {
        frei.classList.remove('hidden');
        return;
    }

    frei.classList.add('hidden');
    frei.value = '';
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
}

function setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value;
}

function getInputValue(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '') : '';
}

function getSelectValue(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '') : '';
}
