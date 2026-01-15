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

let currentFilter = { status: 'aktiv' };
let searchTerm = '';
let activeLizenzFilters = [];

let lizenzModalMode = 'create';

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

    const ablaufModus = document.getElementById('lizAblaufModus');
    if (ablaufModus && !ablaufModus.dataset.listenerAttached) {
        ablaufModus.addEventListener('change', () => {
            console.log('🔑 Lizenzen: Ablaufmodus geändert');
            handleAblaufModusChange();
        });
        ablaufModus.dataset.listenerAttached = 'true';
    }

    const ablaufTage = document.getElementById('lizAblaufTage');
    if (ablaufTage && !ablaufTage.dataset.listenerAttached) {
        ablaufTage.addEventListener('input', updateAblaufDatumFromTage);
        ablaufTage.dataset.listenerAttached = 'true';
    }

    const kaufdatum = document.getElementById('lizKaufdatum');
    if (kaufdatum && !kaufdatum.dataset.listenerAttached) {
        kaufdatum.addEventListener('change', updateAblaufDatumFromTage);
        kaufdatum.dataset.listenerAttached = 'true';
    }

    const aktivierungsdatum = document.getElementById('lizAktivierungsdatum');
    if (aktivierungsdatum && !aktivierungsdatum.dataset.listenerAttached) {
        aktivierungsdatum.addEventListener('change', updateAblaufDatumFromTage);
        aktivierungsdatum.dataset.listenerAttached = 'true';
    }

    const volGesamt = document.getElementById('lizVolumenGesamt');
    if (volGesamt && !volGesamt.dataset.listenerAttached) {
        volGesamt.addEventListener('input', updateVolumenFrei);
        volGesamt.dataset.listenerAttached = 'true';
    }

    const volAktiv = document.getElementById('lizVolumenAktiv');
    if (volAktiv && !volAktiv.dataset.listenerAttached) {
        volAktiv.addEventListener('input', updateVolumenFrei);
        volAktiv.dataset.listenerAttached = 'true';
    }

    const filterInput = document.getElementById('liz-filter-input');
    if (filterInput && !filterInput.dataset.listenerAttached) {
        filterInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addLizenzFilterFromUi();
            }
        });
        filterInput.dataset.listenerAttached = 'true';
    }

    const addFilterBtn = document.getElementById('btn-add-liz-filter');
    if (addFilterBtn && !addFilterBtn.dataset.listenerAttached) {
        addFilterBtn.addEventListener('click', addLizenzFilterFromUi);
        addFilterBtn.dataset.listenerAttached = 'true';
    }

    const filterStatus = document.getElementById('filter-liz-status');
    if (filterStatus && !filterStatus.dataset.listenerAttached) {
        filterStatus.addEventListener('change', (e) => {
            currentFilter.status = String(e.target.value || '');
            renderLizenzenTable();
        });
        filterStatus.dataset.listenerAttached = 'true';
    }

    const resetFilters = document.getElementById('reset-filters-lizenzen');
    if (resetFilters && !resetFilters.dataset.listenerAttached) {
        resetFilters.addEventListener('click', () => {
            currentFilter = { status: 'aktiv' };
            activeLizenzFilters = [];

            const fs = document.getElementById('filter-liz-status');
            const ft = document.getElementById('liz-filter-type');
            const fe = document.getElementById('liz-filter-exclude');
            const fi = document.getElementById('liz-filter-input');

            if (fs) fs.value = 'aktiv';
            if (ft) ft.value = 'all';
            if (fe) fe.checked = false;
            if (fi) fi.value = '';

            renderLizenzSearchTags();

            renderLizenzenTable();
        });
        resetFilters.dataset.listenerAttached = 'true';
    }
}

function addLizenzFilterFromUi() {
    const typeEl = document.getElementById('liz-filter-type');
    const excludeEl = document.getElementById('liz-filter-exclude');
    const inputEl = document.getElementById('liz-filter-input');

    const type = String(typeEl?.value || 'all');
    const exclude = !!excludeEl?.checked;
    const term = String(inputEl?.value || '').trim();
    if (!term) return;

    addLizenzSearchTag(type, term, exclude);

    if (inputEl) {
        inputEl.value = '';
        inputEl.focus();
    }
}

function addLizenzSearchTag(type, term, exclude) {
    const normalizedTerm = String(term || '').trim().toLowerCase();
    if (!normalizedTerm) return;

    const duplicate = activeLizenzFilters.some(f => f.type === type && f.term === normalizedTerm && !!f.exclude === !!exclude);
    if (duplicate) return;

    const typeLabels = {
        all: 'Alles',
        produkt: 'Produkt',
        kategorie: 'Kategorie',
        titel: 'Titel',
        version: 'Version',
        aktiviertAuf: 'Aktiviert auf',
        shop: 'Shop',
        code: 'Code'
    };

    const label = type === 'all'
        ? `${exclude ? 'NICHT ' : ''}Alles: "${term}"`
        : `${exclude ? 'NICHT ' : ''}${typeLabels[type] || type}: ${term}`;

    console.log('🔑 Lizenzen: Filter-Tag hinzugefügt:', label);
    activeLizenzFilters.push({ type, term: normalizedTerm, exclude: !!exclude, label });
    renderLizenzSearchTags();
    renderLizenzenTable();
}

function renderLizenzSearchTags() {
    const container = document.getElementById('active-liz-search-tags');
    if (!container) return;
    container.innerHTML = '';

    activeLizenzFilters.forEach((filter, index) => {
        const tag = document.createElement('div');
        tag.className = 'flex items-center bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded-full border border-orange-200';
        tag.innerHTML = `
            <span>${escapeHtml(filter.label)}</span>
            <button class="ml-1 text-orange-600 hover:text-orange-900 focus:outline-none" onclick="window.removeLizenzSearchTagGlobal(${index})">&times;</button>
        `;
        container.appendChild(tag);
    });
}

window.removeLizenzSearchTagGlobal = (index) => {
    activeLizenzFilters.splice(index, 1);
    renderLizenzSearchTags();
    renderLizenzenTable();
};

function parseOptionalInt(value) {
    const v = String(value || '').trim();
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
}

function formatDateInputValue(d) {
    if (!d || !Number.isFinite(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function updateVolumenFrei() {
    const gesamt = parseOptionalInt(getInputValue('lizVolumenGesamt'));
    const aktiv = parseOptionalInt(getInputValue('lizVolumenAktiv'));

    if (gesamt === null) {
        setInputValue('lizVolumenFrei', '');
        return;
    }

    const aktivSafe = aktiv === null ? 0 : aktiv;
    const frei = Math.max(gesamt - aktivSafe, 0);
    setInputValue('lizVolumenFrei', String(frei));
}

function handleAblaufModusChange() {
    const modusEl = document.getElementById('lizAblaufModus');
    const tageEl = document.getElementById('lizAblaufTage');
    const dateEl = document.getElementById('lizAblaufdatum');
    if (!modusEl || !tageEl || !dateEl) return;

    const isView = lizenzModalMode === 'view';

    if (modusEl.value === 'tage') {
        tageEl.classList.remove('hidden');
        dateEl.disabled = true;
        updateAblaufDatumFromTage();
        return;
    }

    tageEl.classList.add('hidden');
    tageEl.value = '';
    dateEl.disabled = isView;
}

function updateAblaufDatumFromTage() {
    const modus = getSelectValue('lizAblaufModus');
    if (modus !== 'tage') return;

    const tage = parseOptionalInt(getInputValue('lizAblaufTage'));
    const dateEl = document.getElementById('lizAblaufdatum');
    if (!dateEl) return;

    if (tage === null) {
        dateEl.value = '';
        return;
    }

    const basisStr = getInputValue('lizAktivierungsdatum') || getInputValue('lizKaufdatum');
    const basis = getSafeDate(basisStr) || new Date();
    basis.setHours(0, 0, 0, 0);

    const d = new Date(basis);
    d.setDate(d.getDate() + tage);
    dateEl.value = formatDateInputValue(d);
}

function doesLizenzMatchSearchFilter(lizenz, filter) {
    const term = String(filter?.term || '').toLowerCase().trim();
    if (!term) return true;

    const contains = (val) => String(val || '').toLowerCase().includes(term);

    const produktName = resolveProduktName(lizenz.produktId);
    const kategorieName = resolveKategorieName(lizenz.kategorieId);
    const aktiviertAuf = resolveAktiviertAufDisplay(lizenz);
    const titel = lizenz.titel || lizenz.title || '';

    if (filter.type === 'produkt') return contains(produktName);
    if (filter.type === 'kategorie') return contains(kategorieName);
    if (filter.type === 'titel') return contains(titel);
    if (filter.type === 'version') return contains(lizenz.version);
    if (filter.type === 'aktiviertAuf') return contains(aktiviertAuf);
    if (filter.type === 'shop') return contains(lizenz.shop);
    if (filter.type === 'code') return contains(lizenz.code);

    return [
        produktName,
        kategorieName,
        titel,
        lizenz.version,
        lizenz.code,
        aktiviertAuf,
        lizenz.lizenziertAn,
        lizenz.shop,
        lizenz.notizen,
        lizenz.beschraenkungen,
        lizenz.kaufdatum,
        lizenz.aktivierungsdatum,
        lizenz.ablaufdatum,
        lizenz.ablaufTage,
        lizenz.volumenGesamt,
        lizenz.volumenAktiv
    ].some(contains);
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

    if (currentFilter.status) {
        list = list.filter(l => getDerivedStatus(l) === currentFilter.status);
    }

    if (activeLizenzFilters.length > 0) {
        list = list.filter((l) => {
            return activeLizenzFilters.every((filter) => {
                const matches = doesLizenzMatchSearchFilter(l, filter);
                return filter.exclude ? !matches : matches;
            });
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
        const titel = escapeHtml(l.titel || l.title || '-');
        const version = escapeHtml(l.version || '-');
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
                <td class="px-4 py-3 text-sm">${statusHtml}</td>
                <td class="px-4 py-3 text-sm">${kategorie}</td>
                <td class="px-4 py-3 text-sm">${restzeitHtml}</td>
                <td class="px-4 py-3 text-sm font-semibold">${produkt}</td>
                <td class="px-4 py-3 text-sm">${titel}</td>
                <td class="px-4 py-3 text-sm">${version}</td>
                <td class="px-4 py-3 text-sm">${aktiviertAuf}</td>
                <td class="px-4 py-3 text-sm">${ablauf}</td>
                <td class="px-4 py-3 text-center">
                    <div class="flex justify-center gap-2">
                        <button onclick="window.openViewLizenz('${l.id}')" class="p-1 text-gray-700 hover:text-gray-900" title="Ansehen">👁️</button>
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
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const parts = v.split('-').map((x) => parseInt(x, 10));
        const d = new Date(parts[0], parts[1] - 1, parts[2]);
        return Number.isFinite(d.getTime()) ? d : null;
    }
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
    lizenzModalMode = 'create';
    resetLizenzForm();
    openLizenzModal();
}

function applyLizenzModalModeToUi() {
    const isView = lizenzModalMode === 'view';

    const saveBtn = document.getElementById('saveLizenzBtn');
    if (saveBtn) saveBtn.style.display = isView ? 'none' : '';

    const ids = [
        'lizProduktId',
        'lizKategorieId',
        'lizTitel',
        'lizVersion',
        'lizCode',
        'lizLizenziertAn',
        'lizAktiviertAufSelect',
        'lizAktiviertAufFrei',
        'lizKaufdatum',
        'lizAktivierungsdatum',
        'lizAblaufModus',
        'lizAblaufTage',
        'lizAblaufdatum',
        'lizStatus',
        'lizVolumenGesamt',
        'lizVolumenAktiv',
        'lizShop',
        'lizBeschraenkungen',
        'lizNotizen'
    ];

    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = isView;
    });

    const freiEl = document.getElementById('lizVolumenFrei');
    if (freiEl) freiEl.disabled = isView;
}

function populateLizenzForm(liz) {
    setSelectValue('lizKategorieId', liz.kategorieId || '');
    setSelectValue('lizProduktId', liz.produktId || '');

    setInputValue('lizTitel', liz.titel || liz.title || '');

    setInputValue('lizVersion', liz.version || '');
    setInputValue('lizCode', liz.code || '');
    setInputValue('lizLizenziertAn', liz.lizenziertAn || '');

    setInputValue('lizKaufdatum', liz.kaufdatum || '');
    setInputValue('lizAktivierungsdatum', liz.aktivierungsdatum || '');
    setInputValue('lizAblaufdatum', liz.ablaufdatum || '');

    const mode = liz.ablaufModus ? String(liz.ablaufModus) : (liz.ablaufTage != null ? 'tage' : 'datum');
    setSelectValue('lizAblaufModus', mode === 'tage' ? 'tage' : 'datum');
    setInputValue('lizAblaufTage', liz.ablaufTage != null ? String(liz.ablaufTage) : '');

    setInputValue('lizVolumenGesamt', liz.volumenGesamt != null ? String(liz.volumenGesamt) : '');
    setInputValue('lizVolumenAktiv', liz.volumenAktiv != null ? String(liz.volumenAktiv) : '');

    setInputValue('lizShop', liz.shop || '');

    setSelectValue('lizStatus', liz.status || 'aktiv');

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

    setInputValue('lizBeschraenkungen', liz.beschraenkungen || '');
    setInputValue('lizNotizen', liz.notizen || '');
}

window.openViewLizenz = function (id) {
    const liz = LIZENZEN[id];
    if (!liz) return;

    lizenzModalMode = 'view';

    const titleEl = document.getElementById('lizenzModalTitle');
    if (titleEl) titleEl.textContent = 'Lizenz ansehen';
    setInputValue('editLizenzId', id);

    populateLizenzForm(liz);
    openLizenzModal();
};

window.openEditLizenz = function (id) {
    const liz = LIZENZEN[id];
    if (!liz) return;

    lizenzModalMode = 'edit';

    document.getElementById('lizenzModalTitle').textContent = 'Lizenz bearbeiten';
    document.getElementById('editLizenzId').value = id;

    populateLizenzForm(liz);

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
    applyLizenzModalModeToUi();
    handleAktiviertAufChange();
    handleAblaufModusChange();
    updateVolumenFrei();

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

    setInputValue('lizTitel', '');

    setInputValue('lizVersion', '');
    setInputValue('lizCode', '');
    setInputValue('lizLizenziertAn', '');

    setSelectValue('lizAktiviertAufSelect', '');
    setInputValue('lizAktiviertAufFrei', '');

    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    const heuteStr = formatDateInputValue(heute);

    setInputValue('lizKaufdatum', heuteStr);
    setInputValue('lizAktivierungsdatum', heuteStr);
    setInputValue('lizAblaufdatum', '');

    setSelectValue('lizAblaufModus', 'datum');
    setInputValue('lizAblaufTage', '');

    setSelectValue('lizStatus', 'aktiv');

    setInputValue('lizVolumenGesamt', '');
    setInputValue('lizVolumenAktiv', '');
    setInputValue('lizVolumenFrei', '');
    setInputValue('lizShop', '');
    setInputValue('lizBeschraenkungen', '');
    setInputValue('lizNotizen', '');

    handleAktiviertAufChange();
    handleAblaufModusChange();
    updateVolumenFrei();
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

        const volumenGesamt = parseOptionalInt(getInputValue('lizVolumenGesamt'));
        const volumenAktiv = parseOptionalInt(getInputValue('lizVolumenAktiv'));
        if (volumenGesamt !== null && volumenAktiv !== null && volumenAktiv > volumenGesamt) {
            alertUser('Volumen: Aktiv darf nicht größer als Gesamt sein.', 'error');
            return;
        }

        let volumenFrei = null;
        if (volumenGesamt !== null) {
            const aktivSafe = volumenAktiv === null ? 0 : volumenAktiv;
            volumenFrei = Math.max(volumenGesamt - aktivSafe, 0);
        }

        const ablaufModus = getSelectValue('lizAblaufModus') || 'datum';
        let ablaufTage = null;
        let ablaufdatum = getInputValue('lizAblaufdatum') || null;

        if (ablaufModus === 'tage') {
            const tage = parseOptionalInt(getInputValue('lizAblaufTage'));
            if (tage !== null && tage < 0) {
                alertUser('Ablauf-Tage darf nicht negativ sein.', 'error');
                return;
            }

            if (tage === null) {
                ablaufTage = null;
                ablaufdatum = null;
            } else {
                ablaufTage = tage;

                const basisStr = getInputValue('lizAktivierungsdatum') || getInputValue('lizKaufdatum');
                const basis = getSafeDate(basisStr) || new Date();
                basis.setHours(0, 0, 0, 0);

                const d = new Date(basis);
                d.setDate(d.getDate() + tage);
                ablaufdatum = formatDateInputValue(d);
            }
        }

        const data = {
            kategorieId: kategorieId || null,
            produktId: produktId,
            titel: getInputValue('lizTitel').trim() || null,
            version: getInputValue('lizVersion').trim() || null,
            code: getInputValue('lizCode').trim() || null,
            lizenziertAn: getInputValue('lizLizenziertAn').trim() || null,
            kaufdatum: getInputValue('lizKaufdatum') || null,
            aktivierungsdatum: getInputValue('lizAktivierungsdatum') || null,
            ablaufdatum: ablaufdatum || null,
            ablaufModus: ablaufModus,
            ablaufTage: ablaufTage,
            status: getSelectValue('lizStatus') || 'aktiv',
            volumenGesamt: volumenGesamt,
            volumenAktiv: volumenAktiv,
            volumenFrei: volumenFrei,
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
            <div class="flex items-center gap-2">
                <button class="rename-liz-kat-btn p-1 text-blue-500 hover:bg-blue-50 rounded" data-id="${k.id}" title="Umbenennen">✏️</button>
                <button class="delete-liz-kat-btn p-1 text-red-400 hover:bg-red-50 rounded" data-id="${k.id}" title="Löschen">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });

    container.querySelectorAll('.rename-liz-kat-btn').forEach((btn) => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (!id) return;

            const k = KATEGORIEN.find(x => x.id === id);
            const currentName = k?.name || '';
            const newName = prompt('Neuer Kategoriename:', currentName);
            if (newName === null) return;
            const name = String(newName || '').trim();
            if (!name) return;

            const exists = KATEGORIEN.some(x => x.id !== id && String(x.name || '').toLowerCase() === name.toLowerCase());
            if (exists) {
                alertUser('Kategorie existiert bereits.', 'error');
                return;
            }

            try {
                await updateDoc(doc(kategorienRef, id), { name: name });
                alertUser('Kategorie umbenannt!', 'success');
            } catch (err) {
                console.error(err);
                alertUser('Fehler beim Umbenennen.', 'error');
            }
        });
        btn.dataset.listenerAttached = 'true';
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
            <div class="flex items-center gap-2">
                <button class="rename-liz-prod-btn p-1 text-blue-500 hover:bg-blue-50 rounded" data-id="${p.id}" title="Umbenennen">✏️</button>
                <button class="delete-liz-prod-btn p-1 text-red-400 hover:bg-red-50 rounded" data-id="${p.id}" title="Löschen">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });

    container.querySelectorAll('.rename-liz-prod-btn').forEach((btn) => {
        if (btn.dataset.listenerAttached) return;
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.dataset.id;
            if (!id) return;

            const p = PRODUKTE.find(x => x.id === id);
            const currentName = p?.name || '';
            const newName = prompt('Neuer Produktname:', currentName);
            if (newName === null) return;
            const name = String(newName || '').trim();
            if (!name) return;

            const exists = PRODUKTE.some(x => x.id !== id && String(x.name || '').toLowerCase() === name.toLowerCase());
            if (exists) {
                alertUser('Produkt existiert bereits.', 'error');
                return;
            }

            try {
                await updateDoc(doc(produkteRef, id), { name: name });
                alertUser('Produkt umbenannt!', 'success');
            } catch (err) {
                console.error(err);
                alertUser('Fehler beim Umbenennen.', 'error');
            }
        });
        btn.dataset.listenerAttached = 'true';
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
}

function fillProduktDropdown() {
    const select = document.getElementById('lizProduktId');

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
