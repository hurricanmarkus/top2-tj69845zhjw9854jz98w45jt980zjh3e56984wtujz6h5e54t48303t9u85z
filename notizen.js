// ========================================
// NOTIZEN SYSTEM
// Professionelle Notizen-App mit Kategorien, Freigaben und verschiedenen Elementtypen
// ========================================

import {
    alertUser,
    db,
    currentUser,
    USERS,
    navigate,
    appId,
    auth
} from './haupteingang.js';

import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    getDoc,
    setDoc,
    getDocs,
    where,
    writeBatch,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================

function getCurrentUserId() {
    return currentUser?.mode || null;
}

let notizenCollection = null;
let kategorienCollection = null;
let freigabenCollection = null;

let NOTIZEN = {};
let KATEGORIEN = {};
let UNTERKATEGORIEN = {};
let FREIGABEN = {};

let currentKategorieId = null;
let currentUnterkategorieId = null;
let searchTerm = '';
let activeFilters = [];
let defaultFiltersApplied = false;

let unsubscribeNotizen = null;
let unsubscribeKategorien = null;
let unsubscribeFreigaben = null;

// ========================================
// STATUS KONFIGURATION
// ========================================

export const NOTIZ_STATUS = {
    offen: { label: 'Offen', color: 'bg-yellow-100 text-yellow-800', icon: '⭕' },
    abgeschlossen: { label: 'Abgeschlossen', color: 'bg-green-100 text-green-800', icon: '✅' },
    info: { label: '[INFO]', color: 'bg-blue-100 text-blue-800', icon: 'ℹ️' }
};

// ========================================
// ELEMENT-TYPEN KONFIGURATION
// ========================================

export const ELEMENT_TYPES = {
    text: { label: 'Textbereich', icon: '📝', description: 'Freier Text' },
    checkbox: { label: 'Checkpunkte', icon: '☑️', description: 'To-Do Liste' },
    list_bullets: { label: 'Aufzählung (Punkte)', icon: '•', description: 'Punktliste' },
    list_numbers: { label: 'Aufzählung (Zahlen)', icon: '1.', description: 'Nummerierte Liste' },
    password: { label: 'Passwortfeld', icon: '🔒', description: 'Verstecktes Passwort' },
    table: { label: 'Tabelle', icon: '📊', description: 'Einfache Tabelle' },
    link: { label: 'Link', icon: '🔗', description: 'URL mit Anzeigetext' },
    divider: { label: 'Trennlinie', icon: '➖', description: 'Horizontale Trennlinie' }
};

export const ELEMENT_COLORS = [
    { id: 'transparent', label: 'Transparent', class: 'bg-transparent' },
    { id: 'white', label: 'Weiß', class: 'bg-white' },
    { id: 'gray-50', label: 'Hellgrau', class: 'bg-gray-50' },
    { id: 'gray-100', label: 'Grau', class: 'bg-gray-100' },
    { id: 'gray-200', label: 'Dunkelgrau', class: 'bg-gray-200' },
    { id: 'red-50', label: 'Hellrot', class: 'bg-red-50' },
    { id: 'red-100', label: 'Rot', class: 'bg-red-100' },
    { id: 'orange-50', label: 'Hellorange', class: 'bg-orange-50' },
    { id: 'orange-100', label: 'Orange', class: 'bg-orange-100' },
    { id: 'amber-50', label: 'Hellamber', class: 'bg-amber-50' },
    { id: 'amber-100', label: 'Amber', class: 'bg-amber-100' },
    { id: 'yellow-50', label: 'Hellgelb', class: 'bg-yellow-50' },
    { id: 'yellow-100', label: 'Gelb', class: 'bg-yellow-100' },
    { id: 'green-50', label: 'Hellgrün', class: 'bg-green-50' },
    { id: 'green-100', label: 'Grün', class: 'bg-green-100' },
    { id: 'teal-50', label: 'Hellteal', class: 'bg-teal-50' },
    { id: 'teal-100', label: 'Teal', class: 'bg-teal-100' },
    { id: 'blue-50', label: 'Hellblau', class: 'bg-blue-50' },
    { id: 'blue-100', label: 'Blau', class: 'bg-blue-100' },
    { id: 'indigo-50', label: 'Hellindigo', class: 'bg-indigo-50' },
    { id: 'indigo-100', label: 'Indigo', class: 'bg-indigo-100' },
    { id: 'purple-50', label: 'Helllila', class: 'bg-purple-50' },
    { id: 'purple-100', label: 'Lila', class: 'bg-purple-100' },
    { id: 'pink-50', label: 'Hellpink', class: 'bg-pink-50' },
    { id: 'pink-100', label: 'Pink', class: 'bg-pink-100' }
];

// ========================================
// INITIALISIERUNG
// ========================================

export function initializeNotizen() {
    console.log('📝 Notizen: Initialisierung startet...');
    
    const userId = getCurrentUserId();
    if (!userId) {
        console.log('📝 Notizen: Kein Benutzer angemeldet');
        return;
    }

    notizenCollection = collection(db, 'artifacts', appId, 'users', userId, 'notizen');
    kategorienCollection = collection(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien');
    freigabenCollection = collection(db, 'artifacts', appId, 'users', userId, 'notizen_freigaben');

    // Standard-Filter setzen: Abgeschlossene ausblenden
    if (!defaultFiltersApplied) {
        activeFilters = [{ 
            category: 'status', 
            value: 'abgeschlossen', 
            negate: true, 
            label: 'Status',
            id: Date.now() 
        }];
        defaultFiltersApplied = true;
    }
    
    // Aktive Filter sofort anzeigen
    renderActiveFiltersNotizen();

    startNotizenListeners();
    setupNotizenEventListeners();
    
    console.log('📝 Notizen: Initialisierung abgeschlossen');
}

export function stopNotizenListeners() {
    if (unsubscribeNotizen) {
        unsubscribeNotizen();
        unsubscribeNotizen = null;
    }
    if (unsubscribeKategorien) {
        unsubscribeKategorien();
        unsubscribeKategorien = null;
    }
    if (unsubscribeFreigaben) {
        unsubscribeFreigaben();
        unsubscribeFreigaben = null;
    }
    NOTIZEN = {};
    KATEGORIEN = {};
    FREIGABEN = {};
}

function startNotizenListeners() {
    const userId = getCurrentUserId();
    if (!userId) return;

    // Kategorien-Listener
    const kategorienQuery = query(kategorienCollection, orderBy('name', 'asc'));
    unsubscribeKategorien = onSnapshot(kategorienQuery, (snapshot) => {
        KATEGORIEN = {};
        snapshot.forEach(doc => {
            KATEGORIEN[doc.id] = { id: doc.id, ...doc.data() };
        });
        renderKategorienFilter();
        console.log('📝 Notizen: Kategorien geladen:', Object.keys(KATEGORIEN).length);
    }, (error) => {
        console.error('📝 Notizen: Fehler beim Laden der Kategorien:', error);
    });

    // Notizen-Listener
    const notizenQuery = query(notizenCollection, orderBy('createdAt', 'desc'));
    unsubscribeNotizen = onSnapshot(notizenQuery, (snapshot) => {
        NOTIZEN = {};
        snapshot.forEach(doc => {
            NOTIZEN[doc.id] = { id: doc.id, ...doc.data() };
        });
        renderNotizenList();
        updateNotizenStats();
        console.log('📝 Notizen: Notizen geladen:', Object.keys(NOTIZEN).length);
    }, (error) => {
        console.error('📝 Notizen: Fehler beim Laden der Notizen:', error);
    });

    // Freigaben-Listener (für geteilte Notizen anderer Benutzer)
    loadSharedNotizen();
}

async function loadSharedNotizen() {
    const userId = getCurrentUserId();
    if (!userId) return;

    try {
        // Lade Freigaben, bei denen der aktuelle User als Empfänger eingetragen ist
        const sharedQuery = query(
            collection(db, 'artifacts', appId, 'public', 'data', 'notizen_freigaben'),
            where('sharedWith', 'array-contains', userId)
        );
        
        unsubscribeFreigaben = onSnapshot(sharedQuery, async (snapshot) => {
            FREIGABEN = {};
            for (const docSnap of snapshot.docs) {
                const freigabe = { id: docSnap.id, ...docSnap.data() };
                FREIGABEN[docSnap.id] = freigabe;
            }
            renderNotizenList();
        });
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Laden der Freigaben:', error);
    }
}

// ========================================
// KATEGORIEN CRUD
// ========================================

export async function createKategorie(name, color = 'blue') {
    const userId = getCurrentUserId();
    if (!userId) {
        alertUser('Bitte anmelden, um Kategorien zu erstellen.', 'error');
        return null;
    }

    try {
        const docRef = await addDoc(kategorienCollection, {
            name: name.trim(),
            color,
            unterkategorien: [],
            createdAt: serverTimestamp(),
            createdBy: userId
        });
        
        alertUser(`Kategorie "${name}" erstellt.`, 'success');
        return docRef.id;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Erstellen der Kategorie:', error);
        alertUser('Fehler beim Erstellen der Kategorie.', 'error');
        return null;
    }
}

export async function updateKategorie(kategorieId, updates) {
    try {
        const docRef = doc(kategorienCollection, kategorieId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });
        alertUser('Kategorie aktualisiert.', 'success');
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Aktualisieren der Kategorie:', error);
        alertUser('Fehler beim Aktualisieren der Kategorie.', 'error');
        return false;
    }
}

export async function deleteKategorie(kategorieId) {
    try {
        // Prüfen ob Notizen in dieser Kategorie existieren
        const notizenInKategorie = Object.values(NOTIZEN).filter(n => n.kategorieId === kategorieId);
        if (notizenInKategorie.length > 0) {
            alertUser(`Diese Kategorie enthält ${notizenInKategorie.length} Notiz(en). Bitte erst die Notizen verschieben oder löschen.`, 'error');
            return false;
        }

        const docRef = doc(kategorienCollection, kategorieId);
        await deleteDoc(docRef);
        alertUser('Kategorie gelöscht.', 'success');
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Löschen der Kategorie:', error);
        alertUser('Fehler beim Löschen der Kategorie.', 'error');
        return false;
    }
}

export async function addUnterkategorie(kategorieId, name) {
    const kategorie = KATEGORIEN[kategorieId];
    if (!kategorie) return false;

    const unterkategorien = kategorie.unterkategorien || [];
    const newId = `uk_${Date.now()}`;
    unterkategorien.push({ id: newId, name: name.trim() });

    return await updateKategorie(kategorieId, { unterkategorien });
}

export async function removeUnterkategorie(kategorieId, unterkategorieId) {
    const kategorie = KATEGORIEN[kategorieId];
    if (!kategorie) return false;

    const unterkategorien = (kategorie.unterkategorien || []).filter(uk => uk.id !== unterkategorieId);
    return await updateKategorie(kategorieId, { unterkategorien });
}

// ========================================
// NOTIZEN CRUD
// ========================================

export async function createNotiz(data) {
    const userId = getCurrentUserId();
    if (!userId) {
        alertUser('Bitte anmelden, um Notizen zu erstellen.', 'error');
        return null;
    }

    try {
        const notizData = {
            titel: data.titel?.trim() || 'Neue Notiz',
            kategorieId: data.kategorieId || null,
            unterkategorieId: data.unterkategorieId || null,
            gueltigAb: data.gueltigAb || Timestamp.now(),
            gueltigBis: data.gueltigBis || null,
            elemente: data.elemente || [],
            erinnerungen: data.erinnerungen || [],
            createdAt: serverTimestamp(),
            createdBy: userId,
            sharedWith: [],
            isArchived: false
        };

        const docRef = await addDoc(notizenCollection, notizData);
        alertUser('Notiz erstellt.', 'success');
        return docRef.id;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Erstellen der Notiz:', error);
        alertUser('Fehler beim Erstellen der Notiz.', 'error');
        return null;
    }
}

export async function updateNotiz(notizId, updates) {
    try {
        const docRef = doc(notizenCollection, notizId);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Aktualisieren der Notiz:', error);
        alertUser('Fehler beim Speichern der Notiz.', 'error');
        return false;
    }
}

export async function deleteNotiz(notizId) {
    try {
        const docRef = doc(notizenCollection, notizId);
        await deleteDoc(docRef);
        alertUser('Notiz gelöscht.', 'success');
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Löschen der Notiz:', error);
        alertUser('Fehler beim Löschen der Notiz.', 'error');
        return false;
    }
}

// ========================================
// FREIGABEN
// ========================================

export async function shareKategorie(kategorieId, targetUserId, permissions = { read: true, write: false }) {
    const userId = getCurrentUserId();
    if (!userId) return false;

    try {
        const freigabeRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_freigaben', `kat_${kategorieId}_${targetUserId}`);
        await setDoc(freigabeRef, {
            type: 'kategorie',
            resourceId: kategorieId,
            ownerId: userId,
            sharedWith: [targetUserId],
            permissions,
            createdAt: serverTimestamp()
        });
        
        alertUser('Kategorie freigegeben.', 'success');
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Freigeben der Kategorie:', error);
        alertUser('Fehler beim Freigeben.', 'error');
        return false;
    }
}

export async function shareNotiz(notizId, targetUserId, permissions = { read: true, write: false }) {
    const userId = getCurrentUserId();
    if (!userId) return false;

    try {
        const freigabeRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_freigaben', `notiz_${notizId}_${targetUserId}`);
        await setDoc(freigabeRef, {
            type: 'notiz',
            resourceId: notizId,
            ownerId: userId,
            sharedWith: [targetUserId],
            permissions,
            createdAt: serverTimestamp()
        });
        
        alertUser('Notiz freigegeben.', 'success');
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Freigeben der Notiz:', error);
        alertUser('Fehler beim Freigeben.', 'error');
        return false;
    }
}

export async function removeShare(freigabeId) {
    try {
        const freigabeRef = doc(db, 'artifacts', appId, 'public', 'data', 'notizen_freigaben', freigabeId);
        await deleteDoc(freigabeRef);
        alertUser('Freigabe entfernt.', 'success');
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Entfernen der Freigabe:', error);
        return false;
    }
}

// ========================================
// UI RENDERING
// ========================================

function updateUnterkategorienDropdown(kategorieId, selectedUnterkategorieId = null) {
    const select = document.getElementById('notiz-unterkategorie');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Keine --</option>';
    
    if (!kategorieId) return;
    
    const kategorie = KATEGORIEN[kategorieId];
    if (!kategorie || !kategorie.unterkategorien) return;
    
    kategorie.unterkategorien.forEach(uk => {
        const option = document.createElement('option');
        option.value = uk.id;
        option.textContent = uk.name;
        if (selectedUnterkategorieId === uk.id) option.selected = true;
        select.appendChild(option);
    });
}

function renderKategorienFilter() {
    const select = document.getElementById('filter-notizen-kategorie');
    if (!select) return;

    const userId = getCurrentUserId();

    select.innerHTML = '<option value="">Alle Kategorien</option>';
    
    Object.values(KATEGORIEN).forEach(kat => {
        const option = document.createElement('option');
        option.value = kat.id;
        
        // Prüfen ob geteilt (createdBy !== currentUser)
        let displayName = kat.name;
        if (kat.createdBy && kat.createdBy !== userId) {
            const ownerUser = USERS[kat.createdBy];
            const ownerName = ownerUser?.name || ownerUser?.fullName || kat.createdBy;
            displayName = `${kat.name} (geteilt von ${ownerName})`;
        }
        
        option.textContent = displayName;
        select.appendChild(option);

        // Unterkategorien als Gruppe
        if (kat.unterkategorien && kat.unterkategorien.length > 0) {
            kat.unterkategorien.forEach(uk => {
                const subOption = document.createElement('option');
                subOption.value = `${kat.id}:${uk.id}`;
                subOption.textContent = `  └ ${uk.name}`;
                select.appendChild(subOption);
            });
        }
    });
}

function updateNotizenStats() {
    const total = Object.keys(NOTIZEN).length;
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    
    const aktiv = Object.values(NOTIZEN).filter(n => {
        if (n.isArchived) return false;
        if (n.gueltigBis) {
            const bis = n.gueltigBis.toDate ? n.gueltigBis.toDate() : new Date(n.gueltigBis);
            return bis >= heute;
        }
        return true;
    }).length;

    const mitErinnerung = Object.values(NOTIZEN).filter(n => 
        n.erinnerungen && n.erinnerungen.length > 0
    ).length;

    const geteilt = Object.values(NOTIZEN).filter(n => 
        n.sharedWith && n.sharedWith.length > 0
    ).length;

    const statTotal = document.getElementById('stat-notizen-total');
    const statAktiv = document.getElementById('stat-notizen-aktiv');
    const statErinnerung = document.getElementById('stat-notizen-erinnerung');
    const statGeteilt = document.getElementById('stat-notizen-geteilt');

    if (statTotal) statTotal.textContent = total;
    if (statAktiv) statAktiv.textContent = aktiv;
    if (statErinnerung) statErinnerung.textContent = mitErinnerung;
    if (statGeteilt) statGeteilt.textContent = geteilt;
}

function renderNotizenList() {
    const container = document.getElementById('notizen-list');
    if (!container) return;

    // Aktive Filter rendern
    renderActiveFiltersNotizen();

    let notizenArray = Object.values(NOTIZEN);

    // Kategoriefilter anwenden
    if (currentKategorieId) {
        notizenArray = notizenArray.filter(n => n.kategorieId === currentKategorieId);
    }
    if (currentUnterkategorieId) {
        notizenArray = notizenArray.filter(n => n.unterkategorieId === currentUnterkategorieId);
    }
    
    // Suchbegriff anwenden
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        notizenArray = notizenArray.filter(n => 
            n.titel?.toLowerCase().includes(term) ||
            JSON.stringify(n.elemente || []).toLowerCase().includes(term)
        );
    }

    // Multi-Filter anwenden
    if (activeFilters.length > 0) {
        const groupedFilters = {};
        activeFilters.forEach(filter => {
            if (!groupedFilters[filter.category]) {
                groupedFilters[filter.category] = { normal: [], negated: [] };
            }
            if (filter.negate) {
                groupedFilters[filter.category].negated.push(filter);
            } else {
                groupedFilters[filter.category].normal.push(filter);
            }
        });

        notizenArray = notizenArray.filter(notiz => {
            return Object.entries(groupedFilters).every(([category, filters]) => {
                // Negierte Filter: KEINE der Bedingungen darf zutreffen
                if (filters.negated.length > 0) {
                    const negatedMatch = filters.negated.some(filter => {
                        return matchNotizFilter(notiz, category, filter.value);
                    });
                    if (negatedMatch) return false;
                }
                
                // Normale Filter: mindestens eine muss zutreffen (OR)
                if (filters.normal.length > 0) {
                    return filters.normal.some(filter => {
                        return matchNotizFilter(notiz, category, filter.value);
                    });
                }
                
                return true;
            });
        });
    }

    if (notizenArray.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p class="text-4xl mb-3">📝</p>
                <p class="text-lg font-semibold">Keine Notizen gefunden</p>
                <p class="text-sm">Erstelle eine neue Notiz mit dem Button oben.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = notizenArray.map(notiz => renderNotizCard(notiz)).join('');

    // Event-Listener für Karten - öffnet schreibgeschützte Ansicht
    container.querySelectorAll('.notiz-card').forEach(card => {
        card.addEventListener('click', () => {
            const notizId = card.dataset.notizId;
            openNotizViewer(notizId);
        });
    });
}

function matchNotizFilter(notiz, category, value) {
    const val = value.toLowerCase();
    switch(category) {
        case 'status':
            const statusKey = notiz.status || 'offen';
            const statusLabel = NOTIZ_STATUS[statusKey]?.label?.toLowerCase() || statusKey;
            return statusKey.toLowerCase().includes(val) || statusLabel.includes(val);
        case 'kategorie':
            const kat = KATEGORIEN[notiz.kategorieId];
            return kat?.name?.toLowerCase().includes(val) || false;
        case 'titel':
            return notiz.titel?.toLowerCase().includes(val) || false;
        case 'inhalt':
            return JSON.stringify(notiz.elemente || []).toLowerCase().includes(val);
        case 'all':
            return notiz.titel?.toLowerCase().includes(val) || 
                   JSON.stringify(notiz.elemente || []).toLowerCase().includes(val);
        default:
            return true;
    }
}

function renderActiveFiltersNotizen() {
    const container = document.getElementById('active-filters-notizen');
    if (!container) return;
    
    if (activeFilters.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = activeFilters.map(filter => `
        <div class="flex items-center gap-2 px-3 py-1.5 ${filter.negate ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300'} rounded-full text-sm font-medium border">
            ${filter.negate ? '<span class="font-bold text-red-600">NICHT</span>' : ''}
            <span class="font-bold">${filter.label || filter.category}:</span>
            <span>${NOTIZ_STATUS[filter.value]?.label || filter.value}</span>
            <button onclick="window.removeNotizFilterById(${filter.id})" class="ml-1 ${filter.negate ? 'hover:bg-red-200' : 'hover:bg-amber-200'} rounded-full p-0.5 transition" title="Filter entfernen">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');
}

window.removeNotizFilterById = function(filterId) {
    activeFilters = activeFilters.filter(f => f.id !== filterId);
    renderNotizenList();
};

window.addNotizFilter = function() {
    const searchInput = document.getElementById('search-notizen');
    const categorySelect = document.getElementById('filter-notizen-category');
    const negateCheckbox = document.getElementById('filter-notizen-negate');
    
    const value = searchInput?.value?.trim();
    const category = categorySelect?.value || 'all';
    const negate = negateCheckbox?.checked || false;
    
    if (!value) {
        alertUser('Bitte einen Suchbegriff eingeben!', 'warning');
        return;
    }
    
    const categoryLabels = {
        'status': 'Status',
        'kategorie': 'Kategorie',
        'titel': 'Titel',
        'inhalt': 'Inhalt',
        'all': 'Alles'
    };
    
    activeFilters.push({ 
        category, 
        value, 
        negate, 
        label: categoryLabels[category] || category,
        id: Date.now() 
    });
    
    if (searchInput) searchInput.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;
    
    renderNotizenList();
};

window.resetNotizFilters = function() {
    activeFilters = [];
    searchTerm = '';
    currentKategorieId = null;
    currentUnterkategorieId = null;
    
    const searchInput = document.getElementById('search-notizen');
    const kategorieFilter = document.getElementById('filter-notizen-kategorie');
    
    if (searchInput) searchInput.value = '';
    if (kategorieFilter) kategorieFilter.value = '';
    
    renderNotizenList();
};

function renderNotizCard(notiz) {
    const kategorie = KATEGORIEN[notiz.kategorieId];
    const kategorieLabel = kategorie ? kategorie.name : 'Ohne Kategorie';
    const kategorieColor = kategorie?.color || 'gray';
    const userId = getCurrentUserId();
    
    let unterkategorieLabel = '';
    if (kategorie && notiz.unterkategorieId) {
        const uk = (kategorie.unterkategorien || []).find(u => u.id === notiz.unterkategorieId);
        if (uk) unterkategorieLabel = ` / ${uk.name}`;
    }

    const createdDate = notiz.createdAt?.toDate ? notiz.createdAt.toDate() : new Date();
    const formattedDate = createdDate.toLocaleDateString('de-DE');

    const elementCount = (notiz.elemente || []).length;
    const hasReminders = notiz.erinnerungen && notiz.erinnerungen.length > 0;
    const isShared = notiz.sharedWith && notiz.sharedWith.length > 0;
    
    // Prüfen ob von anderem Benutzer geteilt
    const isFromOther = notiz.createdBy && notiz.createdBy !== userId;
    let sharedFromLabel = '';
    if (isFromOther) {
        const ownerUser = USERS[notiz.createdBy];
        const ownerName = ownerUser?.name || ownerUser?.fullName || notiz.createdBy;
        sharedFromLabel = ` (geteilt von ${ownerName})`;
    }
    
    // Status
    const statusKey = notiz.status || 'offen';
    const statusConfig = NOTIZ_STATUS[statusKey] || NOTIZ_STATUS.offen;

    // Vorschau der ersten Elemente
    let preview = '';
    if (notiz.elemente && notiz.elemente.length > 0) {
        const firstEl = notiz.elemente[0];
        if (firstEl.type === 'text') {
            preview = (firstEl.content || '').substring(0, 100) + (firstEl.content?.length > 100 ? '...' : '');
        } else if (firstEl.type === 'checkbox') {
            const items = firstEl.items || [];
            const checked = items.filter(i => i.checked).length;
            preview = `${checked}/${items.length} erledigt`;
        }
    }

    const displayTitel = (notiz.titel || 'Ohne Titel') + sharedFromLabel;

    return `
        <div class="notiz-card bg-white p-4 rounded-xl shadow-lg border-l-4 border-${kategorieColor}-500 hover:shadow-xl transition cursor-pointer" data-notiz-id="${notiz.id}">
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-gray-800 text-lg">${displayTitel}</h3>
                <div class="flex items-center gap-2">
                    <span class="px-2 py-1 ${statusConfig.color} rounded-full text-xs font-semibold">
                        ${statusConfig.icon} ${statusConfig.label}
                    </span>
                    ${hasReminders ? '<span class="text-orange-500" title="Hat Erinnerungen">🔔</span>' : ''}
                    ${isShared ? '<span class="text-blue-500" title="Geteilt">👥</span>' : ''}
                </div>
            </div>
            
            <div class="flex items-center gap-2 mb-2 text-xs">
                <span class="px-2 py-1 bg-${kategorieColor}-100 text-${kategorieColor}-700 rounded-full font-semibold">
                    ${kategorieLabel}${unterkategorieLabel}
                </span>
                <span class="text-gray-400">${formattedDate}</span>
            </div>

            ${preview ? `<p class="text-sm text-gray-600 mb-2 line-clamp-2">${preview}</p>` : ''}

            <div class="flex items-center gap-3 text-xs text-gray-400">
                <span>📄 ${elementCount} Element${elementCount !== 1 ? 'e' : ''}</span>
            </div>
        </div>
    `;
}

// ========================================
// NOTIZ EDITOR
// ========================================

let currentEditingNotizId = null;
let currentNotizElements = [];
let currentViewingNotizId = null;

// ========================================
// NOTIZ VIEWER (Schreibgeschützte Ansicht)
// ========================================

export function openNotizViewer(notizId) {
    if (!notizId || !NOTIZEN[notizId]) return;
    
    currentViewingNotizId = notizId;
    const notiz = NOTIZEN[notizId];
    
    const modal = document.getElementById('notizViewerModal');
    if (!modal) {
        console.error('Notiz Viewer Modal nicht gefunden');
        return;
    }

    const kategorie = KATEGORIEN[notiz.kategorieId];
    const kategorieLabel = kategorie ? kategorie.name : 'Ohne Kategorie';
    const kategorieColor = kategorie?.color || 'gray';
    
    let unterkategorieLabel = '';
    if (kategorie && notiz.unterkategorieId) {
        const uk = (kategorie.unterkategorien || []).find(u => u.id === notiz.unterkategorieId);
        if (uk) unterkategorieLabel = ` / ${uk.name}`;
    }
    
    const statusKey = notiz.status || 'offen';
    const statusConfig = NOTIZ_STATUS[statusKey] || NOTIZ_STATUS.offen;
    
    const createdDate = notiz.createdAt?.toDate ? notiz.createdAt.toDate() : new Date();
    const formattedDate = createdDate.toLocaleDateString('de-DE', { 
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
    });

    // Header
    const titleEl = document.getElementById('viewer-notiz-titel');
    if (titleEl) titleEl.textContent = notiz.titel || 'Ohne Titel';
    
    const statusEl = document.getElementById('viewer-notiz-status');
    if (statusEl) {
        statusEl.className = `px-3 py-1 ${statusConfig.color} rounded-full text-sm font-semibold`;
        statusEl.textContent = `${statusConfig.icon} ${statusConfig.label}`;
    }
    
    const kategorieEl = document.getElementById('viewer-notiz-kategorie');
    if (kategorieEl) {
        kategorieEl.className = `px-2 py-1 bg-${kategorieColor}-100 text-${kategorieColor}-700 rounded-full text-xs font-semibold`;
        kategorieEl.textContent = kategorieLabel + unterkategorieLabel;
    }
    
    const datumEl = document.getElementById('viewer-notiz-datum');
    if (datumEl) datumEl.textContent = formattedDate;

    // Gültig ab/bis
    const gueltigAbEl = document.getElementById('viewer-notiz-gueltig-ab');
    const gueltigBisEl = document.getElementById('viewer-notiz-gueltig-bis');
    
    if (gueltigAbEl) {
        const gueltigAbDate = notiz.gueltigAb?.toDate ? notiz.gueltigAb.toDate() : null;
        gueltigAbEl.textContent = gueltigAbDate ? gueltigAbDate.toLocaleDateString('de-DE') : 'Sofort';
    }
    
    if (gueltigBisEl) {
        const gueltigBisDate = notiz.gueltigBis?.toDate ? notiz.gueltigBis.toDate() : null;
        gueltigBisEl.textContent = gueltigBisDate ? gueltigBisDate.toLocaleDateString('de-DE') : 'Unbegrenzt';
    }

    // Freigaben anzeigen
    const freigabenContainer = document.getElementById('viewer-notiz-freigaben');
    const freigabenList = document.getElementById('viewer-notiz-freigaben-list');
    
    if (freigabenContainer && freigabenList) {
        const sharedWith = notiz.sharedWith || [];
        if (sharedWith.length > 0) {
            freigabenContainer.classList.remove('hidden');
            freigabenList.innerHTML = sharedWith.map(share => {
                const userId = typeof share === 'string' ? share : share.userId;
                const user = USERS[userId];
                const userName = user?.name || user?.realName || user?.fullName || userId;
                const permLabel = (typeof share === 'object' && share.permission === 'write') ? '✏️ Schreiben' : '👁️ Lesen';
                return `<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">${userName} (${permLabel})</span>`;
            }).join('');
        } else {
            freigabenContainer.classList.add('hidden');
        }
    }

    // Berechtigungsbasierte Buttons anpassen
    const currentUserId = getCurrentUserId();
    const isOwner = notiz.createdBy === currentUserId;
    const hasWriteAccess = isOwner || (notiz.sharedWith || []).some(share => {
        const shareUserId = typeof share === 'string' ? share : share.userId;
        const canWrite = typeof share === 'object' && share.permission === 'write';
        return shareUserId === currentUserId && canWrite;
    });

    const editButton = document.querySelector('#viewer-erweitert-menu button[onclick="window.editCurrentNotiz()"]');
    if (editButton) {
        if (hasWriteAccess) {
            editButton.classList.remove('hidden');
        } else {
            editButton.classList.add('hidden');
        }
    }

    const deleteButton = document.querySelector('#viewer-weitere-menu button[onclick="window.deleteCurrentNotiz()"]');
    if (deleteButton) {
        if (isOwner) {
            deleteButton.classList.remove('hidden');
        } else {
            deleteButton.classList.add('hidden');
        }
    }

    // Share-Button nur für Owner anzeigen
    const shareButton = document.getElementById('viewer-share-notiz-btn');
    if (shareButton) {
        if (isOwner) {
            shareButton.classList.remove('hidden');
        } else {
            shareButton.classList.add('hidden');
        }
    }

    // Elemente rendern (schreibgeschützt)
    const contentContainer = document.getElementById('viewer-notiz-content');
    if (contentContainer) {
        contentContainer.innerHTML = renderNotizElementsReadOnly(notiz.elemente || []);
    }

    // Erweitert-Menü zurücksetzen
    const erweiterMenu = document.getElementById('viewer-erweitert-menu');
    const weitereMenu = document.getElementById('viewer-weitere-menu');
    if (erweiterMenu) erweiterMenu.classList.add('hidden');
    if (weitereMenu) weitereMenu.classList.add('hidden');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function renderNotizElementsReadOnly(elemente) {
    if (!elemente || elemente.length === 0) {
        return '<p class="text-gray-400 italic text-center py-4">Keine Inhalte</p>';
    }

    return elemente.map(element => {
        const typeConfig = ELEMENT_TYPES[element.type] || { label: 'Unbekannt', icon: '?' };
        const bgColorClass = ELEMENT_COLORS.find(c => c.id === element.bgColor)?.class || 'bg-gray-50';
        let contentHtml = '';

        switch (element.type) {
            case 'text':
                contentHtml = `<div class="whitespace-pre-wrap text-gray-700">${escapeHtml(element.content || '')}</div>`;
                break;
                
            case 'checkbox':
                const items = element.items || [];
                contentHtml = `
                    <div class="space-y-2">
                        ${items.map(item => `
                            <div class="flex items-center gap-2">
                                <span class="${item.checked ? 'text-green-600' : 'text-gray-400'}">${item.checked ? '☑' : '☐'}</span>
                                <span class="${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}">${escapeHtml(item.text || '')}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
                break;
                
            case 'list_bullets':
                const bulletItems = element.items || [];
                contentHtml = `
                    <ul class="list-disc list-inside space-y-1 text-gray-700">
                        ${bulletItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                `;
                break;
                
            case 'list_numbers':
                const numItems = element.items || [];
                contentHtml = `
                    <ol class="list-decimal list-inside space-y-1 text-gray-700">
                        ${numItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ol>
                `;
                break;
                
            case 'password':
                contentHtml = `
                    <div class="flex items-center gap-2">
                        <span class="password-hidden font-mono bg-gray-100 px-3 py-2 rounded">••••••••</span>
                        <button class="copy-password-btn text-amber-600 hover:text-amber-800 text-sm" data-password="${escapeHtml(element.content || '')}">📋 Kopieren</button>
                    </div>
                `;
                break;
                
            case 'table':
                const rows = element.rows || [];
                if (rows.length === 0) {
                    contentHtml = '<p class="text-gray-400 italic">Leere Tabelle</p>';
                } else {
                    contentHtml = `
                        <div class="overflow-x-auto">
                            <table class="min-w-full border border-gray-300 rounded-lg">
                                <tbody>
                                    ${rows.map((row, i) => `
                                        <tr class="${i === 0 ? 'bg-gray-50 font-semibold' : ''}">
                                            ${(row || []).map(cell => `<td class="border border-gray-300 px-3 py-2">${escapeHtml(cell || '')}</td>`).join('')}
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                }
                break;
                
            case 'link':
                contentHtml = `
                    <a href="${escapeHtml(element.url || '#')}" target="_blank" rel="noopener noreferrer" 
                       class="text-blue-600 hover:text-blue-800 underline flex items-center gap-2">
                        🔗 ${escapeHtml(element.text || element.url || 'Link')}
                    </a>
                `;
                break;
                
            case 'divider':
                return `<hr class="border-t-2 border-gray-300 my-4">`;
                
            default:
                contentHtml = '<p class="text-gray-400 italic">Unbekannter Elementtyp</p>';
        }

        const subtitleHtml = element.subtitle ? `<p class="text-sm font-semibold text-gray-600 mb-2">${escapeHtml(element.subtitle)}</p>` : '';

        return `
            <div class="${bgColorClass} p-4 rounded-lg border border-gray-200">
                ${subtitleHtml}
                ${contentHtml}
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function closeNotizViewer() {
    const modal = document.getElementById('notizViewerModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentViewingNotizId = null;
}

window.closeNotizViewer = closeNotizViewer;

window.toggleErweitertMenu = function() {
    const menu = document.getElementById('viewer-erweitert-menu');
    if (menu) menu.classList.toggle('hidden');
};

window.toggleWeitereMenu = function() {
    const menu = document.getElementById('viewer-weitere-menu');
    if (menu) menu.classList.toggle('hidden');
};

window.editCurrentNotiz = function() {
    if (currentViewingNotizId) {
        const notizIdToEdit = currentViewingNotizId; // ID speichern BEVOR closeNotizViewer sie löscht
        closeNotizViewer();
        openNotizEditor(notizIdToEdit);
    }
};

window.shareCurrentNotiz = function() {
    console.log('📝 Notizen: shareCurrentNotiz aufgerufen, currentViewingNotizId:', currentViewingNotizId);
    if (currentViewingNotizId) {
        openShareDialog('notiz', currentViewingNotizId);
    } else {
        alertUser('Notiz konnte nicht ermittelt werden.', 'error');
    }
};

window.shareEditingNotiz = function() {
    console.log('📝 Notizen: shareEditingNotiz aufgerufen, currentEditingNotizId:', currentEditingNotizId);
    if (currentEditingNotizId) {
        openShareDialog('notiz', currentEditingNotizId);
    } else {
        alertUser('Bitte speichere die Notiz zuerst, bevor du sie freigibst.', 'warning');
    }
};

window.deleteCurrentNotiz = async function() {
    if (currentViewingNotizId && confirm('Notiz wirklich löschen?')) {
        await deleteNotiz(currentViewingNotizId);
        closeNotizViewer();
    }
};

// ========================================
// NOTIZ EDITOR
// ========================================

export function openNotizEditor(notizId = null) {
    currentEditingNotizId = notizId;
    console.log('📝 Notizen: openNotizEditor aufgerufen, notizId:', notizId, '-> currentEditingNotizId:', currentEditingNotizId);
    
    const modal = document.getElementById('notizEditorModal');
    if (!modal) return;

    const notiz = notizId ? NOTIZEN[notizId] : null;
    
    // Freigeben-Button nur bei bestehenden Notizen anzeigen
    const shareBtn = modal.querySelector('button[onclick="window.shareEditingNotiz()"]');
    if (shareBtn) {
        if (notizId) {
            shareBtn.classList.remove('hidden');
        } else {
            shareBtn.classList.add('hidden');
        }
    }
    
    // Formular zurücksetzen
    const titelInput = document.getElementById('notiz-titel');
    const kategorieSelect = document.getElementById('notiz-kategorie');
    const unterkategorieSelect = document.getElementById('notiz-unterkategorie');
    const statusSelect = document.getElementById('notiz-status');
    const gueltigAbInput = document.getElementById('notiz-gueltig-ab');
    const gueltigBisInput = document.getElementById('notiz-gueltig-bis');
    const gueltigBisUnbegrenzt = document.getElementById('notiz-gueltig-bis-unbegrenzt');

    if (titelInput) titelInput.value = notiz?.titel || '';
    
    // Status als Select setzen
    if (statusSelect) {
        statusSelect.value = notiz?.status || 'offen';
    }
    
    // Kategorien in Select laden (Pflichtfeld)
    if (kategorieSelect) {
        kategorieSelect.innerHTML = '<option value="">-- Kategorie wählen (Pflicht) --</option>';
        Object.values(KATEGORIEN).forEach(kat => {
            const option = document.createElement('option');
            option.value = kat.id;
            option.textContent = kat.name;
            if (notiz?.kategorieId === kat.id) option.selected = true;
            kategorieSelect.appendChild(option);
        });
        
        // Event-Listener für Kategorie-Änderung (Unterkategorien aktualisieren)
        kategorieSelect.onchange = () => updateUnterkategorienDropdown(kategorieSelect.value, null);
    }
    
    // Unterkategorien laden
    updateUnterkategorienDropdown(notiz?.kategorieId, notiz?.unterkategorieId);

    // Gültigkeitsdaten
    if (gueltigAbInput) {
        const ab = notiz?.gueltigAb?.toDate ? notiz.gueltigAb.toDate() : new Date();
        gueltigAbInput.value = ab.toISOString().split('T')[0];
    }
    if (gueltigBisInput && notiz?.gueltigBis) {
        const bis = notiz.gueltigBis.toDate ? notiz.gueltigBis.toDate() : new Date(notiz.gueltigBis);
        gueltigBisInput.value = bis.toISOString().split('T')[0];
        gueltigBisInput.disabled = false;
        if (gueltigBisUnbegrenzt) gueltigBisUnbegrenzt.checked = false;
    } else {
        if (gueltigBisInput) {
            gueltigBisInput.value = '';
            gueltigBisInput.disabled = true;
        }
        if (gueltigBisUnbegrenzt) gueltigBisUnbegrenzt.checked = true;
    }

    // Elemente laden
    currentNotizElements = notiz?.elemente ? JSON.parse(JSON.stringify(notiz.elemente)) : [];
    renderNotizElements();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeNotizEditor() {
    const modal = document.getElementById('notizEditorModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentEditingNotizId = null;
    currentNotizElements = [];
}

function renderNotizElements() {
    const container = document.getElementById('notiz-elemente-container');
    if (!container) return;

    if (currentNotizElements.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400 border-2 border-dashed border-gray-300 rounded-lg">
                <p class="text-2xl mb-2">📝</p>
                <p>Füge Elemente hinzu mit den Buttons unten</p>
            </div>
        `;
        return;
    }

    // Elemente in Zeilen gruppieren (max 2 nebeneinander)
    let html = '<div class="space-y-4">';
    
    for (let i = 0; i < currentNotizElements.length; i++) {
        const element = currentNotizElements[i];
        const elementHtml = renderElementEditor(element, i);
        
        // Prüfen ob das nächste Element in derselben Zeile sein soll
        const nextElement = currentNotizElements[i + 1];
        const isFullWidth = !element.halfWidth || !nextElement?.halfWidth;
        
        if (isFullWidth) {
            html += `<div class="w-full">${elementHtml}</div>`;
        } else {
            // Zwei Elemente nebeneinander
            html += `<div class="grid grid-cols-2 gap-4">`;
            html += `<div>${elementHtml}</div>`;
            if (nextElement) {
                html += `<div>${renderElementEditor(nextElement, i + 1)}</div>`;
                i++; // Nächstes Element überspringen
            }
            html += `</div>`;
        }
    }
    
    html += '</div>';
    container.innerHTML = html;

    setupElementEventListeners();
}

function renderElementEditor(element, index) {
    const typeConfig = ELEMENT_TYPES[element.type] || { label: 'Unbekannt', icon: '?' };
    
    let contentHtml = '';
    
    switch (element.type) {
        case 'text':
            contentHtml = `
                <textarea class="element-content w-full p-3 border-2 border-gray-300 rounded-lg focus:border-amber-500 min-h-[100px]" 
                    data-index="${index}" placeholder="Text eingeben...">${element.content || ''}</textarea>
            `;
            break;
            
        case 'checkbox':
            const items = element.items || [];
            contentHtml = `
                <div class="space-y-2">
                    ${items.map((item, itemIndex) => `
                        <div class="flex items-center gap-2">
                            <input type="checkbox" class="checkbox-item h-5 w-5" data-index="${index}" data-item-index="${itemIndex}" ${item.checked ? 'checked' : ''}>
                            <input type="text" class="checkbox-text flex-1 p-2 border rounded" value="${item.text || ''}" data-index="${index}" data-item-index="${itemIndex}">
                            <button class="remove-checkbox-item text-red-500 hover:text-red-700" data-index="${index}" data-item-index="${itemIndex}">✕</button>
                        </div>
                    `).join('')}
                    <button class="add-checkbox-item text-sm text-amber-600 hover:text-amber-800 font-semibold" data-index="${index}">+ Punkt hinzufügen</button>
                </div>
            `;
            break;
            
        case 'list_bullets':
        case 'list_numbers':
            const listItems = element.items || [];
            const listType = element.type === 'list_numbers' ? 'ol' : 'ul';
            contentHtml = `
                <div class="space-y-2">
                    ${listItems.map((item, itemIndex) => `
                        <div class="flex items-center gap-2">
                            <span class="text-gray-500">${element.type === 'list_numbers' ? (itemIndex + 1) + '.' : '•'}</span>
                            <input type="text" class="list-item flex-1 p-2 border rounded" value="${item}" data-index="${index}" data-item-index="${itemIndex}">
                            <button class="remove-list-item text-red-500 hover:text-red-700" data-index="${index}" data-item-index="${itemIndex}">✕</button>
                        </div>
                    `).join('')}
                    <button class="add-list-item text-sm text-amber-600 hover:text-amber-800 font-semibold" data-index="${index}">+ Punkt hinzufügen</button>
                </div>
            `;
            break;
            
        case 'password':
            contentHtml = `
                <div class="flex items-center gap-2">
                    <input type="password" class="element-password flex-1 p-3 border-2 border-gray-300 rounded-lg" 
                        data-index="${index}" value="${element.content || ''}" placeholder="Passwort eingeben...">
                    <button class="toggle-password p-2 text-gray-500 hover:text-gray-700" data-index="${index}" title="Anzeigen/Verbergen">👁️</button>
                    <button class="copy-password p-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-semibold" data-index="${index}">📋 Kopieren</button>
                </div>
            `;
            break;
            
        case 'table':
            const rows = element.rows || [['', ''], ['', '']];
            contentHtml = `
                <div class="overflow-x-auto">
                    <table class="w-full border-collapse border border-gray-300">
                        ${rows.map((row, rowIndex) => `
                            <tr>
                                ${row.map((cell, cellIndex) => `
                                    <td class="border border-gray-300 p-1">
                                        <input type="text" class="table-cell w-full p-2 border-0" 
                                            value="${cell}" data-index="${index}" data-row="${rowIndex}" data-cell="${cellIndex}">
                                    </td>
                                `).join('')}
                                <td class="border border-gray-300 p-1 w-10">
                                    <button class="remove-table-row text-red-500 hover:text-red-700 w-full" data-index="${index}" data-row="${rowIndex}">✕</button>
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                    <div class="flex gap-2 mt-2">
                        <button class="add-table-row text-sm text-amber-600 hover:text-amber-800 font-semibold" data-index="${index}">+ Zeile</button>
                        <button class="add-table-col text-sm text-amber-600 hover:text-amber-800 font-semibold" data-index="${index}">+ Spalte</button>
                    </div>
                </div>
            `;
            break;
            
        case 'link':
            contentHtml = `
                <div class="space-y-2">
                    <input type="url" class="element-link-url w-full p-3 border-2 border-gray-300 rounded-lg" 
                        data-index="${index}" value="${element.url || ''}" placeholder="https://...">
                    <input type="text" class="element-link-text w-full p-3 border-2 border-gray-300 rounded-lg" 
                        data-index="${index}" value="${element.text || ''}" placeholder="Anzeigetext">
                </div>
            `;
            break;
            
        case 'divider':
            contentHtml = `<hr class="border-t-2 border-gray-300 my-2">`;
            break;
    }

    const bgColorClass = ELEMENT_COLORS.find(c => c.id === element.bgColor)?.class || 'bg-transparent';
    const colorPalette = ELEMENT_COLORS.map(c => 
        `<button type="button" class="color-option w-5 h-5 rounded-full border-2 ${c.id === element.bgColor ? 'border-amber-500 ring-2 ring-amber-300 scale-110' : 'border-gray-300 hover:border-gray-400 hover:scale-105'} ${c.class === 'bg-transparent' ? 'bg-white bg-[linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc),linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%,#ccc)] bg-[length:6px_6px] bg-[position:0_0,3px_3px]' : c.class} transition-transform" data-index="${index}" data-color="${c.id}" title="${c.label}"></button>`
    ).join('');

    return `
        <div class="element-wrapper ${bgColorClass} rounded-lg border-2 border-gray-200 p-3" data-index="${index}">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <span class="cursor-move text-gray-400 hover:text-gray-600" title="Verschieben">⋮⋮</span>
                    <span class="font-semibold text-gray-700">${typeConfig.icon} ${typeConfig.label}</span>
                </div>
                <div class="flex items-center gap-1">
                    <label class="flex items-center gap-1 text-xs text-gray-500">
                        <input type="checkbox" class="element-half-width" data-index="${index}" ${element.halfWidth ? 'checked' : ''}>
                        Halbe Breite
                    </label>
                    <button class="move-element-up p-1 text-gray-400 hover:text-gray-600" data-index="${index}" title="Nach oben">↑</button>
                    <button class="move-element-down p-1 text-gray-400 hover:text-gray-600" data-index="${index}" title="Nach unten">↓</button>
                    <button class="delete-element p-1 text-red-400 hover:text-red-600" data-index="${index}" title="Löschen">🗑️</button>
                </div>
            </div>
            ${element.type !== 'divider' ? `
                <input type="text" class="element-subtitle w-full p-2 mb-2 text-sm border border-gray-300 rounded-lg focus:border-amber-500" 
                    data-index="${index}" value="${element.subtitle || ''}" placeholder="Unterüberschrift (optional)">
            ` : ''}
            ${contentHtml}
            <div class="mt-2 pt-2 border-t border-gray-200">
                <div class="flex items-center gap-1 flex-wrap">
                    <span class="text-xs text-gray-500 mr-1">🎨</span>
                    ${colorPalette}
                </div>
            </div>
        </div>
    `;
}

function setupElementEventListeners() {
    // Unterüberschrift
    document.querySelectorAll('.element-subtitle').forEach(el => {
        el.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentNotizElements[index].subtitle = e.target.value;
        });
    });

    // Farbauswahl (Inline-Palette)
    document.querySelectorAll('.color-option').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const color = e.target.dataset.color;
            currentNotizElements[index].bgColor = color;
            renderNotizElements();
        });
    });

    // Text-Änderungen
    document.querySelectorAll('.element-content').forEach(el => {
        el.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentNotizElements[index].content = e.target.value;
        });
    });

    // Checkboxen
    document.querySelectorAll('.checkbox-item').forEach(el => {
        el.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            const itemIndex = parseInt(e.target.dataset.itemIndex);
            currentNotizElements[index].items[itemIndex].checked = e.target.checked;
        });
    });

    document.querySelectorAll('.checkbox-text').forEach(el => {
        el.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const itemIndex = parseInt(e.target.dataset.itemIndex);
            currentNotizElements[index].items[itemIndex].text = e.target.value;
        });
    });

    document.querySelectorAll('.add-checkbox-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (!currentNotizElements[index].items) currentNotizElements[index].items = [];
            currentNotizElements[index].items.push({ text: '', checked: false });
            renderNotizElements();
        });
    });

    document.querySelectorAll('.remove-checkbox-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const itemIndex = parseInt(e.target.dataset.itemIndex);
            currentNotizElements[index].items.splice(itemIndex, 1);
            renderNotizElements();
        });
    });

    // Listen
    document.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const itemIndex = parseInt(e.target.dataset.itemIndex);
            currentNotizElements[index].items[itemIndex] = e.target.value;
        });
    });

    document.querySelectorAll('.add-list-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (!currentNotizElements[index].items) currentNotizElements[index].items = [];
            currentNotizElements[index].items.push('');
            renderNotizElements();
        });
    });

    document.querySelectorAll('.remove-list-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const itemIndex = parseInt(e.target.dataset.itemIndex);
            currentNotizElements[index].items.splice(itemIndex, 1);
            renderNotizElements();
        });
    });

    // Passwort
    document.querySelectorAll('.element-password').forEach(el => {
        el.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentNotizElements[index].content = e.target.value;
        });
    });

    document.querySelectorAll('.toggle-password').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const input = document.querySelector(`.element-password[data-index="${index}"]`);
            if (input) {
                input.type = input.type === 'password' ? 'text' : 'password';
            }
        });
    });

    document.querySelectorAll('.copy-password').forEach(el => {
        el.addEventListener('click', async (e) => {
            const index = parseInt(e.target.dataset.index);
            const content = currentNotizElements[index].content || '';
            try {
                await navigator.clipboard.writeText(content);
                alertUser('Passwort kopiert!', 'success');
            } catch (err) {
                alertUser('Kopieren fehlgeschlagen.', 'error');
            }
        });
    });

    // Tabelle
    document.querySelectorAll('.table-cell').forEach(el => {
        el.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const row = parseInt(e.target.dataset.row);
            const cell = parseInt(e.target.dataset.cell);
            currentNotizElements[index].rows[row][cell] = e.target.value;
        });
    });

    document.querySelectorAll('.add-table-row').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const cols = currentNotizElements[index].rows[0]?.length || 2;
            currentNotizElements[index].rows.push(Array(cols).fill(''));
            renderNotizElements();
        });
    });

    document.querySelectorAll('.add-table-col').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentNotizElements[index].rows.forEach(row => row.push(''));
            renderNotizElements();
        });
    });

    document.querySelectorAll('.remove-table-row').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const row = parseInt(e.target.dataset.row);
            if (currentNotizElements[index].rows.length > 1) {
                currentNotizElements[index].rows.splice(row, 1);
                renderNotizElements();
            }
        });
    });

    // Link
    document.querySelectorAll('.element-link-url').forEach(el => {
        el.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentNotizElements[index].url = e.target.value;
        });
    });

    document.querySelectorAll('.element-link-text').forEach(el => {
        el.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentNotizElements[index].text = e.target.value;
        });
    });

    // Element-Aktionen
    document.querySelectorAll('.element-half-width').forEach(el => {
        el.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentNotizElements[index].halfWidth = e.target.checked;
            renderNotizElements();
        });
    });

    document.querySelectorAll('.move-element-up').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (index > 0) {
                [currentNotizElements[index], currentNotizElements[index - 1]] = 
                [currentNotizElements[index - 1], currentNotizElements[index]];
                renderNotizElements();
            }
        });
    });

    document.querySelectorAll('.move-element-down').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (index < currentNotizElements.length - 1) {
                [currentNotizElements[index], currentNotizElements[index + 1]] = 
                [currentNotizElements[index + 1], currentNotizElements[index]];
                renderNotizElements();
            }
        });
    });

    document.querySelectorAll('.delete-element').forEach(el => {
        el.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            if (confirm('Element wirklich löschen?')) {
                currentNotizElements.splice(index, 1);
                renderNotizElements();
            }
        });
    });
}

function addElement(type) {
    const newElement = { type, id: `el_${Date.now()}`, subtitle: '', bgColor: 'transparent' };
    
    switch (type) {
        case 'text':
            newElement.content = '';
            break;
        case 'checkbox':
            newElement.items = [{ text: '', checked: false }];
            break;
        case 'list_bullets':
        case 'list_numbers':
            newElement.items = [''];
            break;
        case 'password':
            newElement.content = '';
            break;
        case 'table':
            newElement.rows = [['', ''], ['', '']];
            break;
        case 'link':
            newElement.url = '';
            newElement.text = '';
            break;
        case 'divider':
            break;
    }
    
    currentNotizElements.push(newElement);
    renderNotizElements();
}

async function saveCurrentNotiz() {
    const titelInput = document.getElementById('notiz-titel');
    const kategorieSelect = document.getElementById('notiz-kategorie');
    const unterkategorieSelect = document.getElementById('notiz-unterkategorie');
    const statusSelect = document.getElementById('notiz-status');
    const gueltigAbInput = document.getElementById('notiz-gueltig-ab');
    const gueltigBisInput = document.getElementById('notiz-gueltig-bis');
    const gueltigBisUnbegrenzt = document.getElementById('notiz-gueltig-bis-unbegrenzt');

    if (!kategorieSelect?.value) {
        alertUser('Bitte wähle eine Kategorie aus!', 'warning');
        return;
    }

    const data = {
        titel: titelInput?.value?.trim() || 'Ohne Titel',
        kategorieId: kategorieSelect?.value || null,
        unterkategorieId: unterkategorieSelect?.value || null,
        status: statusSelect?.value || 'offen',
        gueltigAb: gueltigAbInput?.value ? Timestamp.fromDate(new Date(gueltigAbInput.value)) : Timestamp.now(),
        gueltigBis: (!gueltigBisUnbegrenzt?.checked && gueltigBisInput?.value) 
            ? Timestamp.fromDate(new Date(gueltigBisInput.value)) 
            : null,
        elemente: currentNotizElements
    };

    let success;
    if (currentEditingNotizId) {
        success = await updateNotiz(currentEditingNotizId, data);
    } else {
        const newId = await createNotiz(data);
        success = !!newId;
    }

    if (success) {
        closeNotizEditor();
    }
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupNotizenEventListeners() {
    // Neue Notiz Button
    const btnCreate = document.getElementById('btn-create-notiz');
    if (btnCreate) {
        btnCreate.addEventListener('click', () => openNotizEditor());
    }

    // Schließen Button
    const btnClose = document.getElementById('close-notiz-editor');
    if (btnClose) {
        btnClose.addEventListener('click', closeNotizEditor);
    }

    // Speichern Button
    const btnSave = document.getElementById('save-notiz-btn');
    if (btnSave) {
        btnSave.addEventListener('click', saveCurrentNotiz);
    }

    // Element hinzufügen Buttons
    Object.keys(ELEMENT_TYPES).forEach(type => {
        const btn = document.getElementById(`add-element-${type}`);
        if (btn) {
            btn.addEventListener('click', () => addElement(type));
        }
    });

    // Suche
    const searchInput = document.getElementById('search-notizen');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value;
            renderNotizenList();
        });
    }

    // Kategorie-Filter
    const kategorieFilter = document.getElementById('filter-notizen-kategorie');
    if (kategorieFilter) {
        kategorieFilter.addEventListener('change', (e) => {
            const value = e.target.value;
            if (value.includes(':')) {
                const [katId, ukId] = value.split(':');
                currentKategorieId = katId;
                currentUnterkategorieId = ukId;
            } else {
                currentKategorieId = value || null;
                currentUnterkategorieId = null;
            }
            renderNotizenList();
        });
    }

    // Filter zurücksetzen (mit Standardfilter)
    const resetFilters = document.getElementById('reset-filters-notizen');
    if (resetFilters) {
        resetFilters.addEventListener('click', () => {
            searchTerm = '';
            currentKategorieId = null;
            currentUnterkategorieId = null;
            
            // Standardfilter wieder setzen: Abgeschlossene ausblenden
            activeFilters = [{ 
                category: 'status', 
                value: 'abgeschlossen', 
                negate: true, 
                label: 'Status',
                id: Date.now() 
            }];
            
            const searchInput = document.getElementById('search-notizen');
            const kategorieFilter = document.getElementById('filter-notizen-kategorie');
            const negateCheckbox = document.getElementById('filter-notizen-negate');
            
            if (searchInput) searchInput.value = '';
            if (kategorieFilter) kategorieFilter.value = '';
            if (negateCheckbox) negateCheckbox.checked = true;
            
            renderActiveFiltersNotizen();
            renderNotizenList();
        });
    }

    // Kategorien verwalten Button (Dashboard)
    const btnManageKat = document.getElementById('btn-manage-kategorien');
    if (btnManageKat) {
        btnManageKat.addEventListener('click', openNotizenSettings);
    }

    // Einstellungen öffnen (alternativer Button)
    const btnSettings = document.getElementById('btn-notizen-settings');
    if (btnSettings) {
        btnSettings.addEventListener('click', openNotizenSettings);
    }

    // Einstellungen Modal schließen
    const closeSettingsBtn = document.getElementById('close-notizen-settings');
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', closeNotizenSettings);
    }

    // Neue Kategorie erstellen
    const btnCreateKat = document.getElementById('btn-create-kategorie');
    if (btnCreateKat) {
        btnCreateKat.addEventListener('click', async () => {
            const nameInput = document.getElementById('new-kategorie-name');
            const farbeSelect = document.getElementById('new-kategorie-farbe');
            const name = nameInput?.value?.trim();
            const farbe = farbeSelect?.value || 'amber';

            if (!name) {
                alertUser('Bitte einen Namen eingeben.', 'error');
                return;
            }

            await createKategorie(name, farbe);
            if (nameInput) nameInput.value = '';
            renderKategorienSettings();
        });
    }

    // Share Modal schließen
    const closeShareBtn = document.getElementById('close-share-modal');
    if (closeShareBtn) {
        closeShareBtn.addEventListener('click', closeShareDialog);
    }
    const cancelShareBtn = document.getElementById('cancel-share-btn');
    if (cancelShareBtn) {
        cancelShareBtn.addEventListener('click', closeShareDialog);
    }

    // Share speichern
    const saveShareBtn = document.getElementById('save-share-btn');
    if (saveShareBtn) {
        saveShareBtn.addEventListener('click', saveShares);
    }

    // Share Notiz Button (im Editor)
    const shareNotizBtn = document.getElementById('share-notiz-btn');
    if (shareNotizBtn) {
        shareNotizBtn.addEventListener('click', () => {
            console.log('📝 Notizen: Share-Button geklickt, currentEditingNotizId:', currentEditingNotizId);
            if (currentEditingNotizId) {
                openShareDialog('notiz', currentEditingNotizId);
            } else {
                alertUser('Bitte speichere die Notiz zuerst, bevor du sie freigibst.', 'warning');
            }
        });
    } else {
        console.warn('📝 Notizen: share-notiz-btn nicht gefunden bei Initialisierung');
    }

    // Share Notiz Button (im Viewer)
    const viewerShareBtn = document.getElementById('viewer-share-notiz-btn');
    if (viewerShareBtn) {
        viewerShareBtn.addEventListener('click', () => {
            console.log('📝 Notizen: Viewer-Share-Button geklickt, currentViewingNotizId:', currentViewingNotizId);
            if (currentViewingNotizId) {
                openShareDialog('notiz', currentViewingNotizId);
            } else {
                alertUser('Notiz konnte nicht ermittelt werden.', 'error');
            }
        });
    } else {
        console.warn('📝 Notizen: viewer-share-notiz-btn nicht gefunden bei Initialisierung');
    }

    // Delete Notiz Button
    const deleteNotizBtn = document.getElementById('delete-notiz-btn');
    if (deleteNotizBtn) {
        deleteNotizBtn.addEventListener('click', async () => {
            if (currentEditingNotizId && confirm('Notiz wirklich löschen?')) {
                await deleteNotiz(currentEditingNotizId);
                closeNotizEditor();
            }
        });
    }

    // Kategorie-Änderung: Unterkategorien aktualisieren
    const kategorieSelect = document.getElementById('notiz-kategorie');
    if (kategorieSelect) {
        kategorieSelect.addEventListener('change', (e) => {
            const katId = e.target.value;
            const unterkategorieSelect = document.getElementById('notiz-unterkategorie');
            if (!unterkategorieSelect) return;

            unterkategorieSelect.innerHTML = '<option value="">Keine Unterkategorie</option>';
            
            if (katId && KATEGORIEN[katId]) {
                const kat = KATEGORIEN[katId];
                (kat.unterkategorien || []).forEach(uk => {
                    const option = document.createElement('option');
                    option.value = uk.id;
                    option.textContent = uk.name;
                    unterkategorieSelect.appendChild(option);
                });
            }
        });
    }

    // Gültig bis: Unbegrenzt Checkbox
    const gueltigBisUnbegrenzt = document.getElementById('notiz-gueltig-bis-unbegrenzt');
    const gueltigBisInput = document.getElementById('notiz-gueltig-bis');
    if (gueltigBisUnbegrenzt && gueltigBisInput) {
        gueltigBisUnbegrenzt.addEventListener('change', (e) => {
            gueltigBisInput.disabled = e.target.checked;
            if (e.target.checked) {
                gueltigBisInput.value = '';
            }
        });
    }
}

// ========================================
// EINSTELLUNGEN (Kategorien verwalten)
// ========================================

function openNotizenSettings() {
    const modal = document.getElementById('notizenSettingsModal');
    if (!modal) return;

    renderKategorienSettings();
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeNotizenSettings() {
    const modal = document.getElementById('notizenSettingsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function renderKategorienSettings() {
    const container = document.getElementById('kategorien-settings-list');
    if (!container) return;

    if (Object.keys(KATEGORIEN).length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p>Keine Kategorien vorhanden.</p>
                <p class="text-sm">Erstelle eine neue Kategorie oben.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = Object.values(KATEGORIEN).map(kat => `
        <div class="bg-white p-4 rounded-lg border-l-4 border-${kat.color || 'gray'}-500 shadow mb-3">
            <div class="flex justify-between items-center mb-2">
                <h4 class="font-bold text-gray-800">${kat.name}</h4>
                <div class="flex gap-2">
                    <button class="share-kategorie text-blue-500 hover:text-blue-700" data-id="${kat.id}" title="Freigeben">👥</button>
                    <button class="edit-kategorie text-amber-500 hover:text-amber-700" data-id="${kat.id}" title="Bearbeiten">✏️</button>
                    <button class="delete-kategorie text-red-500 hover:text-red-700" data-id="${kat.id}" title="Löschen">🗑️</button>
                </div>
            </div>
            
            <div class="text-sm text-gray-600">
                <p class="font-semibold mb-1">Unterkategorien:</p>
                <div class="flex flex-wrap gap-2">
                    ${(kat.unterkategorien || []).map(uk => `
                        <span class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs">
                            ${uk.name}
                            <button class="delete-unterkategorie text-red-400 hover:text-red-600" data-kat-id="${kat.id}" data-uk-id="${uk.id}">×</button>
                        </span>
                    `).join('') || '<span class="text-gray-400">Keine</span>'}
                </div>
                <button class="add-unterkategorie mt-2 text-xs text-amber-600 hover:text-amber-800 font-semibold" data-id="${kat.id}">+ Unterkategorie hinzufügen</button>
            </div>
        </div>
    `).join('');

    // Event-Listener
    container.querySelectorAll('.delete-kategorie').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm('Kategorie wirklich löschen?')) {
                await deleteKategorie(id);
                renderKategorienSettings();
            }
        });
    });

    container.querySelectorAll('.add-unterkategorie').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const name = prompt('Name der Unterkategorie:');
            if (name?.trim()) {
                await addUnterkategorie(id, name);
                renderKategorienSettings();
            }
        });
    });

    container.querySelectorAll('.delete-unterkategorie').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const katId = e.target.dataset.katId;
            const ukId = e.target.dataset.ukId;
            if (confirm('Unterkategorie wirklich löschen?')) {
                await removeUnterkategorie(katId, ukId);
                renderKategorienSettings();
            }
        });
    });

    container.querySelectorAll('.share-kategorie').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            openShareDialog('kategorie', id);
        });
    });
}

// ========================================
// FREIGABE-DIALOG
// ========================================

function openShareDialog(type, resourceId) {
    const modal = document.getElementById('shareModal');
    if (!modal) {
        console.error('📝 Notizen: shareModal nicht gefunden');
        return;
    }

    const title = document.getElementById('share-modal-title');
    if (title) {
        title.textContent = type === 'kategorie' ? 'Kategorie freigeben' : 'Notiz freigeben';
    }

    modal.dataset.type = type;
    modal.dataset.resourceId = resourceId;

    // Aktuellen Benutzer ermitteln
    const currentUserId = getCurrentUserId();

    // Benutzer-Liste laden (mit Object.entries um Key=userId zu bekommen)
    const userList = document.getElementById('share-user-list');
    if (userList) {
        const userEntries = Object.entries(USERS)
            .filter(([userId, user]) => userId !== currentUserId && user?.isActive !== false);
        
        if (userEntries.length === 0) {
            userList.innerHTML = '<div class="text-center py-4 text-gray-500">Keine anderen Benutzer verfügbar</div>';
        } else {
            userList.innerHTML = userEntries.map(([userId, user]) => {
                const userName = user?.name || user?.realName || user?.fullName || userId;
                return `
                <label class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer border-b">
                    <input type="checkbox" class="share-user-checkbox h-5 w-5" data-user-id="${userId}">
                    <span class="font-semibold">${userName}</span>
                    <div class="ml-auto flex gap-4">
                        <label class="flex items-center gap-1 text-sm cursor-pointer">
                            <input type="radio" name="perm-${userId}" value="read" checked class="h-4 w-4"> Lesen
                        </label>
                        <label class="flex items-center gap-1 text-sm cursor-pointer">
                            <input type="radio" name="perm-${userId}" value="write" class="h-4 w-4"> Schreiben
                        </label>
                    </div>
                </label>
            `;
            }).join('');
        }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    console.log('📝 Notizen: Share-Dialog geöffnet für', type, resourceId);
}

function closeShareDialog() {
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function saveShares() {
    const modal = document.getElementById('shareModal');
    if (!modal) return;

    const type = modal.dataset.type;
    const resourceId = modal.dataset.resourceId;

    const checkboxes = document.querySelectorAll('.share-user-checkbox:checked');
    
    if (checkboxes.length === 0) {
        alertUser('Bitte wähle mindestens einen Benutzer aus.', 'warning');
        return;
    }

    let sharesCreated = 0;
    
    for (const checkbox of checkboxes) {
        const userId = checkbox.dataset.userId;
        const permRadio = document.querySelector(`input[name="perm-${userId}"]:checked`);
        const canWrite = permRadio?.value === 'write';

        const permissions = { read: true, write: canWrite };
        
        // Direkte Freigabe erstellen (ohne Einladungssystem)
        let result = false;
        if (type === 'notiz') {
            result = await shareNotiz(resourceId, userId, permissions);
        } else if (type === 'kategorie') {
            result = await shareKategorie(resourceId, userId, permissions);
        }
        
        if (result) {
            sharesCreated++;
        }
    }

    closeShareDialog();
    if (sharesCreated > 0) {
        alertUser(`${sharesCreated} Freigabe(n) erstellt.`, 'success');
    }
}

// Export für Initialisierung
export { closeNotizEditor, closeNotizenSettings, closeShareDialog, saveShares };
