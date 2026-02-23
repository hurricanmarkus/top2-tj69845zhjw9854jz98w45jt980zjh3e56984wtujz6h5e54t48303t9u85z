// ========================================
// NOTIZEN SYSTEM 
// Professionelle Notizen-App mit Kategorien und verschiedenen Elementtypen
// ========================================

import {
    alertUser,
    db,
    currentUser,
    appId,
    USERS
} from './haupteingang.js';

import { saveUserSetting, getUserSetting } from './log-InOut.js';

import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    Timestamp,
    runTransaction,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================

function getCurrentUserId() {
    return currentUser?.mode || null;
}

function hideNotizenSearchSuggestions() {
    document.getElementById('notizen-search-suggestions-box')?.classList.add('hidden');
}

function updateNotizenSearchSuggestions(term) {
    const box = document.getElementById('notizen-search-suggestions-box');
    const list = document.getElementById('notizen-search-suggestions-list');
    if (!box || !list) return;

    if (!term || !term.trim()) {
        list.innerHTML = '';
        box.classList.add('hidden');
        return;
    }

    const lowerTerm = term.toLowerCase().trim();
    const notizen = getCombinedNotizenArray();
    list.innerHTML = '';

    const categories = ['titel', 'inhalt', 'status', 'kategorie'];
    let hasHits = false;

    categories.forEach((category) => {
        const hasCategoryHit = notizen.some((notiz) => matchNotizFilter(notiz, category, lowerTerm));
        if (!hasCategoryHit) return;

        hasHits = true;
        const li = document.createElement('li');
        li.className = 'px-3 py-2 hover:bg-amber-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
        li.innerHTML = `
            <span class="text-lg">${NOTIZEN_SUGGESTION_ICONS[category] || '🔎'}</span>
            <div class="flex-grow leading-tight">
                <span class="font-bold text-gray-800 block">${NOTIZEN_FILTER_LABELS[category] || category}: ${term}</span>
                <span class="text-xs text-gray-500">Filter in ${NOTIZEN_FILTER_LABELS[category] || category}</span>
            </div>
        `;
        li.onclick = () => window.addNotizFilter({ category, rawValue: term });
        list.appendChild(li);
    });

    const fallback = document.createElement('li');
    fallback.className = 'px-3 py-2 hover:bg-amber-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2';
    fallback.innerHTML = `
        <span class="text-lg">${NOTIZEN_SUGGESTION_ICONS.all}</span>
        <div class="flex-grow leading-tight">
            <span class="font-bold text-gray-800 block">Alles: ${term}</span>
            <span class="text-xs text-gray-500">Volltextsuche</span>
        </div>
    `;
    fallback.onclick = () => window.addNotizFilter({ category: 'all', rawValue: term });
    list.appendChild(fallback);

    box.classList.toggle('hidden', !hasHits && !term.trim());
    if (!box.classList.contains('hidden')) return;
    box.classList.remove('hidden');
}

function updateNotizenViewModeButton() {
    const btn = document.getElementById('btn-notizen-view-mode');
    if (btn) {
        btn.textContent = isNotizenListView ? '🔲' : '📋';
    }
}

function applyNotizenViewMode(container) {
    if (!container) return;
    container.className = isNotizenListView
        ? 'space-y-3'
        : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3';
    updateNotizenViewModeButton();
}

let notizenCollection = null;
let kategorienCollection = null;

let NOTIZEN = {};
let KATEGORIEN = {};
let UNTERKATEGORIEN = {};
let SHARED_NOTIZEN = {};
let SHARED_KATEGORIEN = {};
let NOTIZEN_EINLADUNGEN = {};
let NOTIZEN_EINLADUNGEN_OUTGOING = {};

let currentKategorieId = null;
let currentUnterkategorieId = null;
let currentKategorieFilter = null;
let activeFilters = [];
let notizenSearchJoinMode = 'and';
let defaultFiltersApplied = false;

const NOTIZEN_FILTER_LABELS = {
    status: 'Status',
    kategorie: 'Kategorie',
    titel: 'Titel',
    inhalt: 'Inhalt',
    all: 'Alles'
};

const NOTIZEN_SUGGESTION_ICONS = {
    status: '📊',
    kategorie: '🏷️',
    titel: '📝',
    inhalt: '📄',
    all: '🔍'
};

let unsubscribeNotizen = null;
let unsubscribeKategorien = null;
let unsubscribeNotizenEinladungen = null;
let unsubscribeNotizenEinladungenOutgoing = null;
let eventListenersInitialized = false;

let sharedNotizenListeners = new Map();
let sharedKategorienListeners = new Map();
let sharedKategorieNotizenListeners = new Map();
let activeAcceptedInvites = new Map();
let sharedInviteNotizIndex = new Map();
let sharedInviteKategorieIndex = new Map();
let currentShareContext = null;

let isNotizenListView = true;

const NOTIZ_LOCK_CONFIG = {
    ttlMs: 5 * 60 * 1000,
    heartbeatMs: 30 * 1000
};

let currentEditLockContext = null;
let lockHeartbeatTimer = null;

// ========================================
// STATUS KONFIGURATION
// ========================================

export const NOTIZ_STATUS = {
    offen: { label: 'Offen', color: 'bg-yellow-100 text-yellow-800', icon: '⭕' },
    abgeschlossen: { label: 'Abgeschlossen', color: 'bg-green-100 text-green-800', icon: '✅' },
    info: { label: '[INFO]', color: 'bg-blue-100 text-blue-800', icon: 'ℹ️' }
};

// ========================================
// SHARING: EINLADUNGEN & RECHTE
// ========================================

const NOTIZEN_INVITE_STATUS = {
    pending: 'pending',
    accepted: 'accepted',
    rejected: 'rejected',
    revoked: 'revoked',
    removed: 'removed'
};

const NOTIZEN_SHARE_PERMISSION = {
    read: 'read',
    write: 'write'
};

const SHARE_PERMISSION_PRIORITY = {
    read: 1,
    write: 2
};

const SHARE_SOURCE_TYPES = {
    notiz: 'notiz',
    kategorie: 'kategorie'
};

const NOTIZEN_INVITE_STATUS_LABELS = {
    pending: 'Wartet',
    accepted: 'Angenommen',
    rejected: 'Abgelehnt',
    revoked: 'Widerrufen',
    removed: 'Entfernt'
};

const NOTIZEN_INVITE_PERMISSION_LABELS = {
    read: 'Nur lesen',
    write: 'Bearbeiten'
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

function buildDefaultNotizFilters() {
    return [{
        category: 'status',
        value: 'abgeschlossen',
        rawValue: 'abgeschlossen',
        negate: true,
        label: 'Status',
        isDefault: true,
        id: Date.now() + Math.floor(Math.random() * 1000)
    }];
}

export function initializeNotizen() {
    console.log('📝 Notizen: Initialisierung startet...');
    
    const userId = getCurrentUserId();
    if (!userId) {
        console.log('📝 Notizen: Kein Benutzer angemeldet');
        return;
    }

    notizenCollection = collection(db, 'artifacts', appId, 'users', userId, 'notizen');
    kategorienCollection = collection(db, 'artifacts', appId, 'users', userId, 'notizen_kategorien');

    // Standard-Filter setzen: Abgeschlossene ausblenden
    if (!defaultFiltersApplied) {
        activeFilters = buildDefaultNotizFilters();
        defaultFiltersApplied = true;
    } else if (!Array.isArray(activeFilters) || activeFilters.length === 0) {
        activeFilters = buildDefaultNotizFilters();
    }

    const savedViewMode = getUserSetting('notizen_view_mode', 'list');
    isNotizenListView = savedViewMode !== 'card';
    updateNotizenViewModeButton();

    const joinMode = document.getElementById('notizen-search-join-mode');
    if (joinMode) {
        joinMode.value = notizenSearchJoinMode;
    }
    
    // Aktive Filter sofort anzeigen
    renderActiveFiltersNotizen();

    startNotizenListeners();
    setupNotizenEventListeners();
    
    // Buttons ausblenden wenn keine NOTIZEN_CREATE Berechtigung
    updateCreateButtonsVisibility();
    
    console.log('📝 Notizen: Initialisierung abgeschlossen');
}

function updateCreateButtonsVisibility() {
    const permissions = currentUser?.permissions || [];
    const canCreate = permissions.includes('NOTIZEN_CREATE') || currentUser?.role === 'SYSTEMADMIN';
    
    const btnCreateNotiz = document.getElementById('btn-create-notiz');
    const btnSettings = document.getElementById('btn-notizen-settings');
    
    if (btnCreateNotiz) {
        btnCreateNotiz.style.display = canCreate ? '' : 'none';
    }
    if (btnSettings) {
        btnSettings.style.display = canCreate ? '' : 'none';
    }
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
    if (unsubscribeNotizenEinladungen) {
        unsubscribeNotizenEinladungen();
        unsubscribeNotizenEinladungen = null;
    }
    if (unsubscribeNotizenEinladungenOutgoing) {
        unsubscribeNotizenEinladungenOutgoing();
        unsubscribeNotizenEinladungenOutgoing = null;
    }
    resetSharedCaches();
    NOTIZEN = {};
    KATEGORIEN = {};
    eventListenersInitialized = false;
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

    startNotizenEinladungenListener(userId);
    startNotizenEinladungenOutgoingListener(userId);

}

// ========================================
// SHARING: HELPER & CACHES
// ========================================

function getNotizShareKey(ownerId, notizId) {
    if (!ownerId || !notizId) return null;
    return `${ownerId}:${notizId}`;
}

function getKategorieShareKey(ownerId, kategorieId) {
    if (!ownerId || !kategorieId) return null;
    return `${ownerId}:${kategorieId}`;
}

function normalizeSharePermission(permission) {
    return permission === NOTIZEN_SHARE_PERMISSION.write
        ? NOTIZEN_SHARE_PERMISSION.write
        : NOTIZEN_SHARE_PERMISSION.read;
}

function mergeSharePermission(basePermission, incomingPermission) {
    const base = normalizeSharePermission(basePermission);
    const incoming = normalizeSharePermission(incomingPermission);
    return SHARE_PERMISSION_PRIORITY[incoming] >= SHARE_PERMISSION_PRIORITY[base] ? incoming : base;
}

function buildShareMeta({ ownerId, ownerName, permission, sourceType, inviteId }) {
    const normalizedPermission = normalizeSharePermission(permission);
    const sources = {};

    if (sourceType) {
        sources[sourceType] = {
            permission: normalizedPermission,
            inviteId: inviteId || null
        };
    }

    return {
        isShared: true,
        ownerId: ownerId || null,
        ownerName: ownerName || null,
        permission: normalizedPermission,
        sources
    };
}

function mergeShareMeta(existingMeta, incomingMeta) {
    if (!existingMeta && !incomingMeta) return null;

    const mergedSources = { ...(existingMeta?.sources || {}) };

    if (incomingMeta?.sources) {
        Object.entries(incomingMeta.sources).forEach(([sourceType, info]) => {
            if (!sourceType) return;
            mergedSources[sourceType] = { ...info };
        });
    }

    const ownerId = existingMeta?.ownerId || incomingMeta?.ownerId || null;
    const ownerName = existingMeta?.ownerName || incomingMeta?.ownerName || null;
    const basePermission = normalizeSharePermission(existingMeta?.permission || incomingMeta?.permission);
    const sourcePermissions = Object.values(mergedSources)
        .map(source => normalizeSharePermission(source.permission));

    let effectivePermission = basePermission;
    if (sourcePermissions.length > 0) {
        effectivePermission = sourcePermissions.reduce(
            (acc, perm) => mergeSharePermission(acc, perm),
            NOTIZEN_SHARE_PERMISSION.read
        );
    }

    return {
        isShared: true,
        ownerId,
        ownerName,
        permission: effectivePermission,
        sources: mergedSources
    };
}

function upsertSharedNotiz(ownerId, notizId, notizData, shareMeta) {
    if (!ownerId || !notizId) return;
    const key = getNotizShareKey(ownerId, notizId);
    if (!key) return;

    const existing = SHARED_NOTIZEN[key] || {};
    const mergedMeta = mergeShareMeta(existing?.__shareMeta, shareMeta);

    SHARED_NOTIZEN[key] = {
        ...existing,
        id: notizId,
        ...(notizData || {}),
        __shareMeta: mergedMeta
    };
}

function removeSharedNotiz(ownerId, notizId) {
    const key = getNotizShareKey(ownerId, notizId);
    if (key && SHARED_NOTIZEN[key]) {
        delete SHARED_NOTIZEN[key];
    }
}

function upsertSharedKategorie(ownerId, kategorieId, kategorieData, shareMeta) {
    if (!ownerId || !kategorieId) return;
    const key = getKategorieShareKey(ownerId, kategorieId);
    if (!key) return;

    const existing = SHARED_KATEGORIEN[key] || {};
    const mergedMeta = mergeShareMeta(existing?.__shareMeta, shareMeta);

    SHARED_KATEGORIEN[key] = {
        ...existing,
        id: kategorieId,
        ...(kategorieData || {}),
        __shareMeta: mergedMeta
    };
}

function removeSharedKategorie(ownerId, kategorieId) {
    const key = getKategorieShareKey(ownerId, kategorieId);
    if (key && SHARED_KATEGORIEN[key]) {
        delete SHARED_KATEGORIEN[key];
    }
}

function clearListenerMap(listenerMap, label) {
    if (!listenerMap || listenerMap.size === 0) return;

    listenerMap.forEach((unsubscribe) => {
        try {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        } catch (error) {
            console.error(`📝 Notizen: Fehler beim Stoppen von ${label}-Listenern:`, error);
        }
    });

    listenerMap.clear();
}

function resetSharedCaches() {
    SHARED_NOTIZEN = {};
    SHARED_KATEGORIEN = {};
    NOTIZEN_EINLADUNGEN = {};
    NOTIZEN_EINLADUNGEN_OUTGOING = {};
    clearListenerMap(sharedNotizenListeners, 'Shared-Notizen');
    clearListenerMap(sharedKategorienListeners, 'Shared-Kategorien');
    clearListenerMap(sharedKategorieNotizenListeners, 'Shared-Kategorie-Notizen');
    activeAcceptedInvites.clear();
    sharedInviteNotizIndex.clear();
    sharedInviteKategorieIndex.clear();
}

function isInviteAccepted(invite) {
    return invite?.status === NOTIZEN_INVITE_STATUS.accepted;
}

function isInvitePending(invite) {
    return invite?.status === NOTIZEN_INVITE_STATUS.pending;
}

function isNotizShared(notiz) {
    return Boolean(notiz?.__shareMeta?.isShared);
}

function getNotizOwnerId(notiz) {
    return notiz?.__shareMeta?.ownerId || notiz?.createdBy || null;
}

function isNotizOwner(notiz) {
    const currentUserId = getCurrentUserId();
    return Boolean(currentUserId && getNotizOwnerId(notiz) === currentUserId);
}

function getNotizEffectivePermission(notiz) {
    if (!notiz) return NOTIZEN_SHARE_PERMISSION.read;
    if (isNotizOwner(notiz)) return NOTIZEN_SHARE_PERMISSION.write;
    return normalizeSharePermission(notiz?.__shareMeta?.permission);
}

function canCurrentUserWriteNotiz(notiz) {
    return getNotizEffectivePermission(notiz) === NOTIZEN_SHARE_PERMISSION.write;
}

function getCurrentUserDisplayName() {
    return currentUser?.displayName || currentUser?.name || currentUser?.realName || getCurrentUserId() || 'Unbekannt';
}

function getUserDisplayNameById(userId) {
    if (!userId) return 'Unbekannt';
    const user = USERS ? USERS[userId] : null;
    return user?.realName || user?.name || user?.displayName || userId;
}

function getNotizOwnerLabel(notiz) {
    const metaOwnerName = notiz?.__shareMeta?.ownerName;
    if (metaOwnerName) return metaOwnerName;
    const ownerId = getNotizOwnerId(notiz);
    return getUserDisplayNameById(ownerId);
}

function getInviteOwnerLabel(invite) {
    return invite?.ownerName || getUserDisplayNameById(invite?.ownerId);
}

function getInviteTargetLabel(invite) {
    return invite?.targetUserName || getUserDisplayNameById(invite?.targetUserId);
}

function getInviteResourceLabel(invite) {
    if (!invite) return 'Unbekannte Ressource';
    if (invite.resourceTitleSnapshot) return invite.resourceTitleSnapshot;
    if (invite.type === SHARE_SOURCE_TYPES.notiz) {
        const ownNotiz = NOTIZEN[invite.resourceId];
        if (ownNotiz?.titel) return ownNotiz.titel;
        const sharedKey = getNotizShareKey(invite.ownerId, invite.resourceId);
        return SHARED_NOTIZEN[sharedKey]?.titel || 'Unbekannte Notiz';
    }
    if (invite.type === SHARE_SOURCE_TYPES.kategorie) {
        const ownKategorie = KATEGORIEN[invite.resourceId];
        if (ownKategorie?.name) return ownKategorie.name;
        const sharedKey = getKategorieShareKey(invite.ownerId, invite.resourceId);
        return SHARED_KATEGORIEN[sharedKey]?.name || 'Unbekannte Kategorie';
    }
    return 'Unbekannte Ressource';
}

function getInvitePermissionLabel(permission) {
    const normalized = normalizeSharePermission(permission);
    return NOTIZEN_INVITE_PERMISSION_LABELS[normalized] || normalized;
}

function getInviteStatusLabel(status) {
    return NOTIZEN_INVITE_STATUS_LABELS[status] || status || 'Unbekannt';
}

function getInviteTypeLabel(invite) {
    if (!invite) return 'Ressource';
    return invite.type === SHARE_SOURCE_TYPES.kategorie ? 'Kategorie' : 'Notiz';
}

function getNotizShareInfoText(notiz) {
    if (!isNotizShared(notiz)) return '';
    const ownerId = getNotizOwnerId(notiz);
    const currentUserId = getCurrentUserId();
    const ownerName = notiz?.__shareMeta?.ownerName || getUserDisplayNameById(ownerId);
    const permissionLabel = getInvitePermissionLabel(getNotizEffectivePermission(notiz));

    if (ownerId && currentUserId && ownerId !== currentUserId) {
        return `Geteilt von ${ownerName} · ${permissionLabel}`;
    }

    return `Geteilt · ${permissionLabel}`;
}

function getNotizShareInfoHtml(notiz) {
    const shareText = getNotizShareInfoText(notiz);
    if (!shareText) return '';
    return `<div class="text-xs text-gray-500 mt-1">${escapeHtml(shareText)}</div>`;
}

function buildNotizHistoryEntry(action, info = '') {
    return {
        date: new Date(),
        action,
        user: getCurrentUserDisplayName(),
        userId: getCurrentUserId(),
        info
    };
}

function sanitizeNotizUpdates(notiz, updates) {
    if (!notiz || !updates) return updates || {};
    if (isNotizOwner(notiz)) return { ...updates };
    return {
        ...updates,
        kategorieId: notiz.kategorieId || null,
        unterkategorieId: notiz.unterkategorieId || null,
        createdBy: notiz.createdBy || null,
        createdAt: notiz.createdAt || null
    };
}

function getNotizDocRefForOwner(ownerId, notizId) {
    if (!ownerId || !notizId) return null;
    return doc(db, 'artifacts', appId, 'users', ownerId, 'notizen', notizId);
}

function getNotizDocRef(notiz) {
    if (!notiz?.id) return null;
    const ownerId = getNotizOwnerId(notiz) || getCurrentUserId();
    if (!ownerId) return null;
    const currentUserId = getCurrentUserId();
    if (currentUserId && ownerId === currentUserId && notizenCollection) {
        return doc(notizenCollection, notiz.id);
    }
    return getNotizDocRefForOwner(ownerId, notiz.id);
}

function getLockExpiryMs(lock) {
    if (!lock?.expiresAt) return 0;
    if (typeof lock.expiresAt?.toMillis === 'function') return lock.expiresAt.toMillis();
    const parsed = new Date(lock.expiresAt).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function isLockActive(lock) {
    if (!lock?.lockedByUserId) return false;
    return Date.now() < getLockExpiryMs(lock);
}

function isLockOwnedByCurrentUser(lock) {
    const currentUserId = getCurrentUserId();
    return Boolean(currentUserId && lock?.lockedByUserId === currentUserId);
}

function buildNotizLockPayload() {
    const nowMs = Date.now();
    return {
        lockedByUserId: getCurrentUserId(),
        lockedByName: getCurrentUserDisplayName(),
        lockedAt: Timestamp.fromMillis(nowMs),
        expiresAt: Timestamp.fromMillis(nowMs + NOTIZ_LOCK_CONFIG.ttlMs)
    };
}

function getLockOwnerLabel(lock) {
    return lock?.lockedByName || lock?.lockedByUserId || 'einem anderen Nutzer';
}

function setNotizLockBanner(message = '') {
    const banner = document.getElementById('notiz-editor-lock-banner');
    if (!banner) return;
    if (!message) {
        banner.textContent = '';
        banner.classList.add('hidden');
        return;
    }
    banner.textContent = message;
    banner.classList.remove('hidden');
}

function toggleReadOnlyElement(el, isReadOnly) {
    if (!el) return;
    if (isReadOnly) {
        if (el.dataset.prevDisabled === undefined) {
            el.dataset.prevDisabled = el.disabled ? '1' : '0';
        }
        el.disabled = true;
        return;
    }
    if (el.dataset.prevDisabled !== undefined) {
        el.disabled = el.dataset.prevDisabled === '1';
        delete el.dataset.prevDisabled;
    }
}

function setNotizEditorReadOnly(isReadOnly, message = '') {
    const body = document.getElementById('notiz-editor-body');
    const saveBtn = document.getElementById('save-notiz-btn');
    const deleteBtn = document.getElementById('delete-notiz-btn');

    if (body) {
        if (isReadOnly) {
            body.dataset.lockReadonly = '1';
            body.classList.add('opacity-60');
            body.querySelectorAll('input, textarea, select, button').forEach(el => {
                toggleReadOnlyElement(el, true);
            });
        } else if (body.dataset.lockReadonly === '1') {
            body.classList.remove('opacity-60');
            body.querySelectorAll('input, textarea, select, button').forEach(el => {
                toggleReadOnlyElement(el, false);
            });
            delete body.dataset.lockReadonly;
        }
    }

    if (saveBtn) {
        if (isReadOnly) {
            toggleReadOnlyElement(saveBtn, true);
            saveBtn.classList.add('opacity-60', 'cursor-not-allowed');
        } else {
            toggleReadOnlyElement(saveBtn, false);
            saveBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }

    if (deleteBtn) {
        if (isReadOnly) {
            toggleReadOnlyElement(deleteBtn, true);
            deleteBtn.classList.add('opacity-60', 'cursor-not-allowed');
        } else {
            toggleReadOnlyElement(deleteBtn, false);
            deleteBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }

    setNotizLockBanner(message);
}

function buildNotizLockContext(notiz, docRef) {
    if (!notiz || !docRef) return null;
    return {
        notizId: notiz.id,
        ownerId: getNotizOwnerId(notiz),
        docRef
    };
}

function clearNotizLockHeartbeat() {
    if (lockHeartbeatTimer) {
        clearInterval(lockHeartbeatTimer);
        lockHeartbeatTimer = null;
    }
}

async function acquireNotizLock(notiz) {
    const docRef = getNotizDocRef(notiz);
    if (!docRef) return { acquired: false, lock: null, error: 'doc-missing' };

    let result = { acquired: false, lock: null, error: null };

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(docRef);
            if (!snap.exists()) {
                result = { acquired: false, lock: null, error: 'not-found' };
                return;
            }

            const data = snap.data() || {};
            const existingLock = data.editLock || null;

            if (isLockActive(existingLock) && !isLockOwnedByCurrentUser(existingLock)) {
                result = { acquired: false, lock: existingLock, error: null };
                return;
            }

            const newLock = buildNotizLockPayload();
            transaction.update(docRef, { editLock: newLock });
            result = { acquired: true, lock: newLock, error: null };
        });
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Sperren der Notiz:', error);
        result = { acquired: false, lock: null, error };
    }

    return result;
}

async function refreshNotizLock(context) {
    if (!context?.docRef) return false;

    let lockValid = false;

    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(context.docRef);
            if (!snap.exists()) {
                lockValid = false;
                return;
            }

            const data = snap.data() || {};
            const existingLock = data.editLock || null;
            if (!isLockOwnedByCurrentUser(existingLock) || !isLockActive(existingLock)) {
                lockValid = false;
                return;
            }

            const refreshedLock = buildNotizLockPayload();
            transaction.update(context.docRef, { editLock: refreshedLock });
            lockValid = true;
        });
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Lock-Heartbeat:', error);
        lockValid = false;
    }

    return lockValid;
}

function startNotizLockHeartbeat(context) {
    if (!context) return;
    clearNotizLockHeartbeat();
    const activeContext = context;

    lockHeartbeatTimer = setInterval(async () => {
        if (currentEditLockContext !== activeContext) {
            clearNotizLockHeartbeat();
            return;
        }

        const lockValid = await refreshNotizLock(activeContext);
        if (!lockValid) {
            clearNotizLockHeartbeat();
            currentEditLockContext = null;
            setNotizEditorReadOnly(true, '🔒 Die Sperre ist abgelaufen. Bearbeitung deaktiviert.');
        }
    }, NOTIZ_LOCK_CONFIG.heartbeatMs);
}

async function releaseNotizLock(context) {
    if (!context?.docRef) return;
    try {
        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(context.docRef);
            if (!snap.exists()) return;
            const data = snap.data() || {};
            const existingLock = data.editLock || null;
            if (!isLockOwnedByCurrentUser(existingLock)) return;
            transaction.update(context.docRef, { editLock: null });
        });
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Freigeben der Sperre:', error);
    }
}

async function releaseCurrentNotizLock() {
    const context = currentEditLockContext;
    currentEditLockContext = null;
    clearNotizLockHeartbeat();
    if (context) {
        await releaseNotizLock(context);
    }
}

async function ensureNotizEditorLock(notiz) {
    if (!notiz) {
        setNotizEditorReadOnly(false, '');
        return true;
    }

    setNotizEditorReadOnly(true, '🔒 Sperre wird geprüft...');
    const result = await acquireNotizLock(notiz);

    if (result.acquired) {
        const docRef = getNotizDocRef(notiz);
        currentEditLockContext = buildNotizLockContext(notiz, docRef);
        startNotizLockHeartbeat(currentEditLockContext);
        setNotizEditorReadOnly(false, '');
        return true;
    }

    if (result.lock && isLockActive(result.lock)) {
        setNotizEditorReadOnly(true, `🔒 Diese Notiz wird gerade von ${getLockOwnerLabel(result.lock)} bearbeitet.`);
        return false;
    }

    setNotizEditorReadOnly(true, '🔒 Notiz ist aktuell gesperrt.');
    return false;
}

function removeShareSource(existingMeta, sourceType, inviteId) {
    if (!existingMeta?.sources || !sourceType) return existingMeta || null;

    const sources = { ...existingMeta.sources };
    const source = sources[sourceType];

    if (source && (!inviteId || source.inviteId === inviteId)) {
        delete sources[sourceType];
    }

    const remainingSources = Object.keys(sources);
    if (remainingSources.length === 0) return null;

    const permissions = remainingSources.map(key => normalizeSharePermission(sources[key]?.permission));
    const effectivePermission = permissions.reduce(
        (acc, permission) => mergeSharePermission(acc, permission),
        NOTIZEN_SHARE_PERMISSION.read
    );

    return {
        isShared: true,
        ownerId: existingMeta.ownerId || null,
        ownerName: existingMeta.ownerName || null,
        permission: effectivePermission,
        sources
    };
}

function parseShareKey(key) {
    if (!key) return null;
    const parts = String(key).split(':');
    if (parts.length < 2) return null;
    const ownerId = parts.shift();
    const resourceId = parts.join(':');
    if (!ownerId || !resourceId) return null;
    return { ownerId, resourceId };
}

function applyShareMetaToNotizKey(notizKey, shareMeta) {
    if (!notizKey || !shareMeta) return;
    const existing = SHARED_NOTIZEN[notizKey];
    if (!existing) return;
    const mergedMeta = mergeShareMeta(existing.__shareMeta, shareMeta);
    SHARED_NOTIZEN[notizKey] = {
        ...existing,
        __shareMeta: mergedMeta
    };
}

function applyShareMetaToKategorieKey(kategorieKey, shareMeta) {
    if (!kategorieKey || !shareMeta) return;
    const existing = SHARED_KATEGORIEN[kategorieKey];
    if (!existing) return;
    const mergedMeta = mergeShareMeta(existing.__shareMeta, shareMeta);
    SHARED_KATEGORIEN[kategorieKey] = {
        ...existing,
        __shareMeta: mergedMeta
    };
}

function removeShareSourceFromNotiz(ownerId, notizId, sourceType, inviteId) {
    const key = getNotizShareKey(ownerId, notizId);
    if (!key || !SHARED_NOTIZEN[key]) return;
    const updatedMeta = removeShareSource(SHARED_NOTIZEN[key].__shareMeta, sourceType, inviteId);
    if (!updatedMeta) {
        delete SHARED_NOTIZEN[key];
        return;
    }
    SHARED_NOTIZEN[key] = {
        ...SHARED_NOTIZEN[key],
        __shareMeta: updatedMeta
    };
}

function removeShareSourceFromNotizByKey(notizKey, sourceType, inviteId) {
    const parsed = parseShareKey(notizKey);
    if (!parsed) return;
    removeShareSourceFromNotiz(parsed.ownerId, parsed.resourceId, sourceType, inviteId);
}

function removeShareSourceFromKategorie(ownerId, kategorieId, sourceType, inviteId) {
    const key = getKategorieShareKey(ownerId, kategorieId);
    if (!key || !SHARED_KATEGORIEN[key]) return;
    const updatedMeta = removeShareSource(SHARED_KATEGORIEN[key].__shareMeta, sourceType, inviteId);
    if (!updatedMeta) {
        delete SHARED_KATEGORIEN[key];
        return;
    }
    SHARED_KATEGORIEN[key] = {
        ...SHARED_KATEGORIEN[key],
        __shareMeta: updatedMeta
    };
}

function removeShareSourceFromKategorieByKey(kategorieKey, sourceType, inviteId) {
    const parsed = parseShareKey(kategorieKey);
    if (!parsed) return;
    removeShareSourceFromKategorie(parsed.ownerId, parsed.resourceId, sourceType, inviteId);
}

function getCombinedNotizenArray() {
    return [...Object.values(NOTIZEN), ...Object.values(SHARED_NOTIZEN)];
}

function getNotizLookupKey(notiz) {
    if (!notiz) return null;
    const ownerId = getNotizOwnerId(notiz);
    const currentUserId = getCurrentUserId();
    if (ownerId && currentUserId && ownerId !== currentUserId) {
        return getNotizShareKey(ownerId, notiz.id);
    }
    return notiz.id;
}

function getNotizByLookupKey(notizKey) {
    if (!notizKey) return null;
    return NOTIZEN[notizKey] || SHARED_NOTIZEN[notizKey] || null;
}

function getSharedKategorieOwnerId(kategorie) {
    return kategorie?.__shareMeta?.ownerId || kategorie?.createdBy || null;
}

function getKategorieForNotiz(notiz) {
    if (!notiz?.kategorieId) return null;
    const ownerId = getNotizOwnerId(notiz);
    const currentUserId = getCurrentUserId();
    if (ownerId && currentUserId && ownerId !== currentUserId) {
        const sharedKey = getKategorieShareKey(ownerId, notiz.kategorieId);
        return SHARED_KATEGORIEN[sharedKey] || null;
    }
    return KATEGORIEN[notiz.kategorieId] || null;
}

function parseKategorieFilterValue(value) {
    if (!value) return null;
    const parts = String(value).split(':');
    if (parts[0] === 'own') {
        return {
            rawValue: value,
            scope: 'own',
            ownerId: null,
            kategorieId: parts[1] || null,
            unterkategorieId: parts[2] || null
        };
    }
    if (parts[0] === 'shared') {
        return {
            rawValue: value,
            scope: 'shared',
            ownerId: parts[1] || null,
            kategorieId: parts[2] || null,
            unterkategorieId: parts[3] || null
        };
    }
    if (parts.length === 2) {
        return {
            rawValue: value,
            scope: 'own',
            ownerId: null,
            kategorieId: parts[0] || null,
            unterkategorieId: parts[1] || null
        };
    }
    return {
        rawValue: value,
        scope: 'own',
        ownerId: null,
        kategorieId: value,
        unterkategorieId: null
    };
}

function setKategorieFilterFromValue(value) {
    if (!value) {
        currentKategorieFilter = null;
        currentKategorieId = null;
        currentUnterkategorieId = null;
        return;
    }
    const parsed = parseKategorieFilterValue(value);
    currentKategorieFilter = parsed;
    currentKategorieId = parsed?.kategorieId || null;
    currentUnterkategorieId = parsed?.unterkategorieId || null;
}

function getActiveKategorieFilter() {
    if (currentKategorieFilter) return currentKategorieFilter;
    if (!currentKategorieId) return null;
    return {
        rawValue: currentKategorieId,
        scope: 'own',
        ownerId: null,
        kategorieId: currentKategorieId,
        unterkategorieId: currentUnterkategorieId || null
    };
}

function doesNotizMatchKategorieFilter(notiz, filter) {
    if (!filter) return true;
    const ownerId = getNotizOwnerId(notiz);
    const currentUserId = getCurrentUserId();

    if (filter.scope === 'shared') {
        if (!ownerId || ownerId !== filter.ownerId) return false;
    } else if (filter.scope === 'own') {
        if (ownerId && currentUserId && ownerId !== currentUserId) return false;
    }

    if (filter.kategorieId && notiz.kategorieId !== filter.kategorieId) return false;
    if (filter.unterkategorieId && notiz.unterkategorieId !== filter.unterkategorieId) return false;
    return true;
}

function getNotizCreatedAtDate(notiz) {
    if (!notiz) return new Date(0);
    if (notiz.createdAt?.toDate) return notiz.createdAt.toDate();
    if (notiz.createdAt) return new Date(notiz.createdAt);
    return new Date(0);
}

function refreshNotizenView() {
    renderNotizenList();
    updateNotizenStats();
    renderKategorienFilter();
}

// ========================================
// SHARING: EINLADUNGEN & LISTENER
// ========================================

function startNotizenEinladungenListener(userId) {
    if (!userId) return;

    if (unsubscribeNotizenEinladungen) {
        unsubscribeNotizenEinladungen();
        unsubscribeNotizenEinladungen = null;
    }

    const invitesCollection = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
    const invitesQuery = query(invitesCollection, where('targetUserId', '==', userId));

    unsubscribeNotizenEinladungen = onSnapshot(invitesQuery, (snapshot) => {
        handleNotizenEinladungenSnapshot(snapshot, userId);
    }, (error) => {
        console.error('📝 Notizen: Fehler beim Laden der Einladungen:', error);
    });
}

function startNotizenEinladungenOutgoingListener(userId) {
    if (!userId) return;

    if (unsubscribeNotizenEinladungenOutgoing) {
        unsubscribeNotizenEinladungenOutgoing();
        unsubscribeNotizenEinladungenOutgoing = null;
    }

    const invitesCollection = collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
    const invitesQuery = query(invitesCollection, where('ownerId', '==', userId));

    unsubscribeNotizenEinladungenOutgoing = onSnapshot(invitesQuery, (snapshot) => {
        handleNotizenEinladungenOutgoingSnapshot(snapshot, userId);
    }, (error) => {
        console.error('📝 Notizen: Fehler beim Laden gesendeter Einladungen:', error);
    });
}

function handleNotizenEinladungenSnapshot(snapshot, userId) {
    const invites = [];
    const inviteMap = {};

    snapshot.forEach(docSnap => {
        const invite = normalizeInviteSnapshot(docSnap);
        if (!invite) return;
        if (userId && invite.targetUserId && invite.targetUserId !== userId) return;

        inviteMap[invite.id] = invite;
        invites.push(invite);
    });

    NOTIZEN_EINLADUNGEN = inviteMap;
    const acceptedInvites = invites.filter(isInviteAccepted);
    syncAcceptedInvites(acceptedInvites);
    updateNotizenEinladungenBadge();
    refreshNotizenEinladungenModalIfOpen();
}

function handleNotizenEinladungenOutgoingSnapshot(snapshot, userId) {
    const inviteMap = {};

    snapshot.forEach(docSnap => {
        const invite = normalizeInviteSnapshot(docSnap);
        if (!invite) return;
        if (userId && invite.ownerId && invite.ownerId !== userId) return;
        inviteMap[invite.id] = invite;
    });

    NOTIZEN_EINLADUNGEN_OUTGOING = inviteMap;
    updateNotizenEinladungenBadge();
    refreshNotizenEinladungenModalIfOpen();
}

function updateNotizenEinladungenBadge() {
    const badge = document.getElementById('notizen-einladungen-badge');
    if (!badge) return;
    const pendingCount = Object.values(NOTIZEN_EINLADUNGEN).filter(isInvitePending).length;
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function normalizeInviteSnapshot(docSnap) {
    if (!docSnap) return null;
    const data = docSnap.data ? docSnap.data() : null;
    if (!data) return null;
    return {
        id: docSnap.id,
        ...data
    };
}

function isValidInvite(invite) {
    if (!invite?.id || !invite?.ownerId || !invite?.resourceId || !invite?.type) return false;
    return invite.type === SHARE_SOURCE_TYPES.notiz || invite.type === SHARE_SOURCE_TYPES.kategorie;
}

function normalizeInvite(invite) {
    return {
        ...invite,
        permission: normalizeSharePermission(invite.permission)
    };
}

function getActiveInvite(inviteId) {
    return activeAcceptedInvites.get(inviteId) || null;
}

function buildInviteShareMeta(invite, sourceType) {
    const ownerName = invite?.ownerName || getUserDisplayNameById(invite?.ownerId);
    return buildShareMeta({
        ownerId: invite.ownerId,
        ownerName,
        permission: invite.permission,
        sourceType,
        inviteId: invite.id
    });
}

function syncAcceptedInvites(acceptedInvites) {
    const nextAccepted = new Map();

    acceptedInvites.forEach(invite => {
        if (!isValidInvite(invite)) {
            console.warn('📝 Notizen: Ungültige Einladung übersprungen:', invite);
            return;
        }
        const normalized = normalizeInvite(invite);
        nextAccepted.set(normalized.id, normalized);
    });

    activeAcceptedInvites.forEach((previousInvite, inviteId) => {
        if (!nextAccepted.has(inviteId)) {
            cleanupInviteShareData(inviteId, previousInvite);
            stopInviteListeners(inviteId);
            activeAcceptedInvites.delete(inviteId);
        }
    });

    nextAccepted.forEach((invite, inviteId) => {
        const previousInvite = activeAcceptedInvites.get(inviteId);
        const identityChanged = previousInvite && (
            previousInvite.type !== invite.type ||
            previousInvite.ownerId !== invite.ownerId ||
            previousInvite.resourceId !== invite.resourceId
        );

        if (identityChanged) {
            cleanupInviteShareData(inviteId, previousInvite);
            stopInviteListeners(inviteId);
        }

        activeAcceptedInvites.set(inviteId, invite);
        ensureInviteListeners(invite);
        updateInviteShareMeta(invite);
    });

    refreshNotizenView();
}

function ensureInviteListeners(invite) {
    if (invite.type === SHARE_SOURCE_TYPES.notiz) {
        ensureNotizInviteListener(invite);
        return;
    }
    if (invite.type === SHARE_SOURCE_TYPES.kategorie) {
        ensureKategorieInviteListeners(invite);
    }
}

function ensureNotizInviteListener(invite) {
    const inviteId = invite.id;
    if (sharedNotizenListeners.has(inviteId)) return;

    const notizRef = doc(db, 'artifacts', appId, 'users', invite.ownerId, 'notizen', invite.resourceId);
    const unsubscribe = onSnapshot(notizRef, (docSnap) => {
        const activeInvite = getActiveInvite(inviteId);
        if (!activeInvite) return;

        const shareMeta = buildInviteShareMeta(activeInvite, SHARE_SOURCE_TYPES.notiz);
        const notizKey = getNotizShareKey(activeInvite.ownerId, activeInvite.resourceId);

        if (docSnap.exists()) {
            upsertSharedNotiz(activeInvite.ownerId, activeInvite.resourceId, docSnap.data(), shareMeta);
            if (notizKey) {
                sharedInviteNotizIndex.set(inviteId, new Set([notizKey]));
            }
        } else {
            removeShareSourceFromNotiz(activeInvite.ownerId, activeInvite.resourceId, SHARE_SOURCE_TYPES.notiz, inviteId);
            if (notizKey) {
                sharedInviteNotizIndex.set(inviteId, new Set());
            }
        }

        refreshNotizenView();
    }, (error) => {
        console.error('📝 Notizen: Fehler beim Laden geteilter Notiz:', error);
    });

    sharedNotizenListeners.set(inviteId, unsubscribe);
}

function ensureKategorieInviteListeners(invite) {
    const inviteId = invite.id;

    if (!sharedKategorienListeners.has(inviteId)) {
        const kategorieRef = doc(db, 'artifacts', appId, 'users', invite.ownerId, 'notizen_kategorien', invite.resourceId);
        const unsubscribeKategorie = onSnapshot(kategorieRef, (docSnap) => {
            const activeInvite = getActiveInvite(inviteId);
            if (!activeInvite) return;

            const shareMeta = buildInviteShareMeta(activeInvite, SHARE_SOURCE_TYPES.kategorie);
            const kategorieKey = getKategorieShareKey(activeInvite.ownerId, activeInvite.resourceId);

            if (docSnap.exists()) {
                upsertSharedKategorie(activeInvite.ownerId, activeInvite.resourceId, docSnap.data(), shareMeta);
                if (kategorieKey) {
                    sharedInviteKategorieIndex.set(inviteId, kategorieKey);
                }
            } else {
                removeShareSourceFromKategorie(activeInvite.ownerId, activeInvite.resourceId, SHARE_SOURCE_TYPES.kategorie, inviteId);
                if (kategorieKey) {
                    sharedInviteKategorieIndex.delete(inviteId);
                }
            }

            refreshNotizenView();
        }, (error) => {
            console.error('📝 Notizen: Fehler beim Laden geteilter Kategorie:', error);
        });

        sharedKategorienListeners.set(inviteId, unsubscribeKategorie);
    }

    if (!sharedKategorieNotizenListeners.has(inviteId)) {
        const notizenRef = collection(db, 'artifacts', appId, 'users', invite.ownerId, 'notizen');
        const notizenQuery = query(notizenRef, where('kategorieId', '==', invite.resourceId));
        const unsubscribeNotizen = onSnapshot(notizenQuery, (snapshot) => {
            handleKategorieNotizenSnapshot(inviteId, snapshot);
        }, (error) => {
            console.error('📝 Notizen: Fehler beim Laden geteilter Kategorienotizen:', error);
        });

        sharedKategorieNotizenListeners.set(inviteId, unsubscribeNotizen);
    }
}

function handleKategorieNotizenSnapshot(inviteId, snapshot) {
    const activeInvite = getActiveInvite(inviteId);
    if (!activeInvite) return;

    const shareMeta = buildInviteShareMeta(activeInvite, SHARE_SOURCE_TYPES.kategorie);
    const nextKeys = new Set();

    snapshot.forEach(docSnap => {
        const notizKey = getNotizShareKey(activeInvite.ownerId, docSnap.id);
        if (!notizKey) return;
        nextKeys.add(notizKey);
        upsertSharedNotiz(activeInvite.ownerId, docSnap.id, docSnap.data(), shareMeta);
    });

    const previousKeys = sharedInviteNotizIndex.get(inviteId) || new Set();
    previousKeys.forEach(key => {
        if (!nextKeys.has(key)) {
            removeShareSourceFromNotizByKey(key, SHARE_SOURCE_TYPES.kategorie, inviteId);
        }
    });

    sharedInviteNotizIndex.set(inviteId, nextKeys);
    refreshNotizenView();
}

function updateInviteShareMeta(invite) {
    const shareMeta = buildInviteShareMeta(invite, invite.type);

    if (invite.type === SHARE_SOURCE_TYPES.notiz) {
        const notizKey = getNotizShareKey(invite.ownerId, invite.resourceId);
        if (notizKey) {
            applyShareMetaToNotizKey(notizKey, shareMeta);
        }
        return;
    }

    const kategorieKey = getKategorieShareKey(invite.ownerId, invite.resourceId);
    if (kategorieKey) {
        applyShareMetaToKategorieKey(kategorieKey, shareMeta);
    }

    const notizKeys = sharedInviteNotizIndex.get(invite.id);
    if (notizKeys) {
        notizKeys.forEach(notizKey => applyShareMetaToNotizKey(notizKey, shareMeta));
    }
}

function stopInviteListeners(inviteId) {
    stopListenerForKey(sharedNotizenListeners, inviteId, 'Shared-Notiz');
    stopListenerForKey(sharedKategorienListeners, inviteId, 'Shared-Kategorie');
    stopListenerForKey(sharedKategorieNotizenListeners, inviteId, 'Shared-Kategorie-Notizen');
}

function stopListenerForKey(listenerMap, key, label) {
    if (!listenerMap || !listenerMap.has(key)) return;
    const unsubscribe = listenerMap.get(key);
    try {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    } catch (error) {
        console.error(`📝 Notizen: Fehler beim Stoppen von ${label}-Listenern:`, error);
    }
    listenerMap.delete(key);
}

function cleanupInviteShareData(inviteId, invite) {
    if (!invite) return;

    if (invite.type === SHARE_SOURCE_TYPES.notiz) {
        removeShareSourceFromNotiz(invite.ownerId, invite.resourceId, SHARE_SOURCE_TYPES.notiz, inviteId);
        sharedInviteNotizIndex.delete(inviteId);
        return;
    }

    if (invite.type === SHARE_SOURCE_TYPES.kategorie) {
        removeShareSourceFromKategorie(invite.ownerId, invite.resourceId, SHARE_SOURCE_TYPES.kategorie, inviteId);

        const notizKeys = sharedInviteNotizIndex.get(inviteId) || new Set();
        notizKeys.forEach(notizKey => {
            removeShareSourceFromNotizByKey(notizKey, SHARE_SOURCE_TYPES.kategorie, inviteId);
        });
        sharedInviteNotizIndex.delete(inviteId);
        sharedInviteKategorieIndex.delete(inviteId);
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
            isArchived: false,
            history: [buildNotizHistoryEntry('created')]
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
        const notiz = getNotizByLookupKey(notizId);
        if (!notiz) {
            alertUser('Notiz nicht gefunden.', 'error');
            return false;
        }
        if (!canCurrentUserWriteNotiz(notiz)) {
            alertUser('Keine Berechtigung zum Bearbeiten dieser Notiz.', 'warning');
            return false;
        }

        const docRef = getNotizDocRef(notiz);
        if (!docRef) {
            alertUser('Notiz konnte nicht gespeichert werden.', 'error');
            return false;
        }

        const safeUpdates = sanitizeNotizUpdates(notiz, updates);
        await updateDoc(docRef, {
            ...safeUpdates,
            updatedAt: serverTimestamp(),
            history: arrayUnion(buildNotizHistoryEntry('updated'))
        });
        alertUser('Notiz aktualisiert.', 'success');
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Aktualisieren der Notiz:', error);
        alertUser('Fehler beim Speichern der Notiz.', 'error');
        return false;
    }
}

export async function deleteNotiz(notizId) {
    try {
        const notiz = getNotizByLookupKey(notizId);
        if (!notiz) {
            alertUser('Notiz nicht gefunden.', 'error');
            return false;
        }
        if (!isNotizOwner(notiz)) {
            alertUser('Nur der Besitzer darf diese Notiz löschen.', 'warning');
            return false;
        }
        const docRef = getNotizDocRef(notiz);
        if (!docRef) {
            alertUser('Notiz konnte nicht gelöscht werden.', 'error');
            return false;
        }
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

    select.innerHTML = '<option value="">Alle Kategorien</option>';

    const ownCategories = Object.values(KATEGORIEN).sort((a, b) =>
        (a?.name || '').localeCompare(b?.name || '', 'de')
    );
    const sharedCategories = Object.values(SHARED_KATEGORIEN).sort((a, b) =>
        (a?.name || '').localeCompare(b?.name || '', 'de')
    );

    const appendKategorieOptions = (group, kat, baseValue, labelPrefix = '') => {
        if (!kat?.id) return;
        const option = document.createElement('option');
        option.value = baseValue;
        option.textContent = `${labelPrefix}${kat.name || 'Ohne Namen'}`;
        group.appendChild(option);

        if (kat.unterkategorien && kat.unterkategorien.length > 0) {
            kat.unterkategorien.forEach(uk => {
                const subOption = document.createElement('option');
                subOption.value = `${baseValue}:${uk.id}`;
                subOption.textContent = `  └ ${uk.name}`;
                group.appendChild(subOption);
            });
        }
    };

    if (ownCategories.length > 0) {
        const ownGroup = document.createElement('optgroup');
        ownGroup.label = 'Eigene Kategorien';
        ownCategories.forEach(kat => {
            appendKategorieOptions(ownGroup, kat, `own:${kat.id}`);
        });
        select.appendChild(ownGroup);
    }

    if (sharedCategories.length > 0) {
        const sharedGroup = document.createElement('optgroup');
        sharedGroup.label = 'Geteilte Kategorien';
        sharedCategories.forEach(kat => {
            const ownerId = getSharedKategorieOwnerId(kat);
            if (!ownerId) return;
            appendKategorieOptions(sharedGroup, kat, `shared:${ownerId}:${kat.id}`, '🔗 ');
        });
        select.appendChild(sharedGroup);
    }

    const selectedValue = currentKategorieFilter?.rawValue || '';
    select.value = selectedValue || '';
}

function updateNotizenStats() {
    const combinedNotizen = getCombinedNotizenArray();
    const total = combinedNotizen.length;
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    
    const aktiv = combinedNotizen.filter(n => {
        if (n.isArchived) return false;
        if (n.gueltigBis) {
            const bis = n.gueltigBis.toDate ? n.gueltigBis.toDate() : new Date(n.gueltigBis);
            return bis >= heute;
        }
        return true;
    }).length;

    const mitErinnerung = combinedNotizen.filter(n => 
        n.erinnerungen && n.erinnerungen.length > 0
    ).length;

    const statTotal = document.getElementById('stat-notizen-total');
    const statAktiv = document.getElementById('stat-notizen-aktiv');
    const statErinnerung = document.getElementById('stat-notizen-erinnerung');

    if (statTotal) statTotal.textContent = total;
    if (statAktiv) statAktiv.textContent = aktiv;
    if (statErinnerung) statErinnerung.textContent = mitErinnerung;
}

function renderNotizenList() {
    const container = document.getElementById('notizen-list');
    if (!container) return;

    applyNotizenViewMode(container);

    // Aktive Filter rendern
    renderActiveFiltersNotizen();

    let notizenArray = getCombinedNotizenArray();
    const kategorieFilter = getActiveKategorieFilter();

    // Kategoriefilter anwenden
    if (kategorieFilter) {
        notizenArray = notizenArray.filter(notiz => doesNotizMatchKategorieFilter(notiz, kategorieFilter));
    }
    
    const defaultFilters = activeFilters.filter((filter) => filter.isDefault);
    const userFilters = activeFilters.filter((filter) => !filter.isDefault);

    const evaluateFilter = (notiz, filter) => {
        const matches = matchNotizFilter(notiz, filter.category, filter.value);
        return filter.negate ? !matches : matches;
    };

    // Default-Filter immer per AND
    if (defaultFilters.length > 0) {
        notizenArray = notizenArray.filter((notiz) =>
            defaultFilters.every((filter) => evaluateFilter(notiz, filter))
        );
    }

    // User-Filter per Join-Mode
    if (userFilters.length > 0) {
        notizenArray = notizenArray.filter((notiz) => (
            notizenSearchJoinMode === 'or'
                ? userFilters.some((filter) => evaluateFilter(notiz, filter))
                : userFilters.every((filter) => evaluateFilter(notiz, filter))
        ));
    }

    notizenArray.sort((a, b) => getNotizCreatedAtDate(b) - getNotizCreatedAtDate(a));

    if (notizenArray.length === 0) {
        const emptyClass = isNotizenListView ? '' : 'col-span-full';
        container.innerHTML = `
            <div class="${emptyClass} text-center py-12 text-gray-400">
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
            const kat = getKategorieForNotiz(notiz);
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
            <span>${filter.category === 'status' ? (NOTIZ_STATUS[filter.value]?.label || filter.rawValue || filter.value) : (filter.rawValue || filter.value)}</span>
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

window.addNotizFilter = function(options = {}) {
    const searchInput = document.getElementById('search-notizen');
    const negateCheckbox = document.getElementById('filter-notizen-negate');

    const rawValue = String((options.rawValue ?? searchInput?.value) || '').trim();
    if (!rawValue) {
        alertUser('Bitte einen Suchbegriff eingeben!', 'warning');
        return;
    }

    const category = String(options.category || 'all');
    const negate = !!negateCheckbox?.checked;
    const value = rawValue.toLowerCase();

    const duplicate = activeFilters.some((filter) => (
        !filter.isDefault &&
        filter.category === category &&
        filter.value === value &&
        !!filter.negate === negate
    ));

    if (duplicate) {
        if (searchInput) searchInput.value = '';
        if (negateCheckbox) negateCheckbox.checked = false;
        hideNotizenSearchSuggestions();
        return;
    }
    
    activeFilters.push({ 
        category, 
        value, 
        rawValue,
        negate, 
        label: NOTIZEN_FILTER_LABELS[category] || category,
        isDefault: false,
        id: Date.now() + Math.floor(Math.random() * 1000)
    });
    
    if (searchInput) searchInput.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;
    hideNotizenSearchSuggestions();
    
    renderNotizenList();
};

function resetNotizFiltersToDefault() {
    currentKategorieId = null;
    currentUnterkategorieId = null;
    currentKategorieFilter = null;
    notizenSearchJoinMode = 'and';
    
    activeFilters = buildDefaultNotizFilters();
    defaultFiltersApplied = true;
    
    const searchInput = document.getElementById('search-notizen');
    const kategorieFilter = document.getElementById('filter-notizen-kategorie');
    const negateCheckbox = document.getElementById('filter-notizen-negate');
    const joinMode = document.getElementById('notizen-search-join-mode');
    
    if (searchInput) searchInput.value = '';
    if (kategorieFilter) kategorieFilter.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;
    if (joinMode) joinMode.value = 'and';
    hideNotizenSearchSuggestions();
    
    renderActiveFiltersNotizen();
    renderNotizenList();
}

window.resetNotizFilters = function() {
    resetNotizFiltersToDefault();
};

function renderNotizCard(notiz) {
    const kategorie = getKategorieForNotiz(notiz);
    const kategorieLabel = kategorie ? kategorie.name : 'Ohne Kategorie';
    const kategorieColor = kategorie?.color || 'gray';
    const isShared = isNotizShared(notiz);
    const notizKey = getNotizLookupKey(notiz) || notiz.id;
    
    let unterkategorieLabel = '';
    if (kategorie && notiz.unterkategorieId) {
        const uk = (kategorie.unterkategorien || []).find(u => u.id === notiz.unterkategorieId);
        if (uk) unterkategorieLabel = ` / ${uk.name}`;
    }

    const createdDate = notiz.createdAt?.toDate ? notiz.createdAt.toDate() : new Date();
    const formattedDate = createdDate.toLocaleDateString('de-DE');

    const elementCount = (notiz.elemente || []).length;
    const hasReminders = notiz.erinnerungen && notiz.erinnerungen.length > 0;
    
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

    const displayTitel = notiz.titel || 'Ohne Titel';

    const cardClass = `notiz-card bg-white p-4 rounded-xl shadow-lg border-l-4 border-${kategorieColor}-500 hover:shadow-xl transition cursor-pointer${isNotizenListView ? '' : ' h-full'}`;

    return `
        <div class="${cardClass}" data-notiz-id="${notizKey}">
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-bold text-gray-800 text-lg">${displayTitel}</h3>
                <div class="flex items-center gap-2">
                    <span class="px-2 py-1 ${statusConfig.color} rounded-full text-xs font-semibold">
                        ${statusConfig.icon} ${statusConfig.label}
                    </span>
                    ${isShared ? '<span class="text-gray-500" title="Geteilt">🔗</span>' : ''}
                    ${hasReminders ? '<span class="text-orange-500" title="Hat Erinnerungen">🔔</span>' : ''}
                </div>
            </div>
            
            <div class="flex items-center gap-2 mb-2 text-xs">
                <span class="px-2 py-1 bg-${kategorieColor}-100 text-${kategorieColor}-700 rounded-full font-semibold">
                    ${kategorieLabel}${unterkategorieLabel}
                </span>
                <span class="text-gray-400">${formattedDate}</span>
            </div>

            ${preview ? `<p class="text-sm text-gray-600 mb-2 line-clamp-2">${preview}</p>` : ''}
            ${getNotizShareInfoHtml(notiz)}

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
    if (!notizId) return;

    const notiz = getNotizByLookupKey(notizId);
    if (!notiz) return;

    currentViewingNotizId = notizId;
    
    const modal = document.getElementById('notizViewerModal');
    if (!modal) {
        console.error('Notiz Viewer Modal nicht gefunden');
        return;
    }

    const kategorie = getKategorieForNotiz(notiz);
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

    // Berechtigungsbasierte Buttons anpassen
    const isOwner = isNotizOwner(notiz);
    const hasWriteAccess = canCurrentUserWriteNotiz(notiz);

    const editButton = document.querySelector('#viewer-erweitert-menu button[onclick="window.editCurrentNotiz()"]');
    if (editButton) {
        if (hasWriteAccess) {
            editButton.classList.remove('hidden');
        } else {
            editButton.classList.add('hidden');
        }
    }

    const deleteButton = document.getElementById('viewer-delete-notiz-btn');
    if (deleteButton) {
        if (isOwner) {
            deleteButton.classList.remove('hidden');
        } else {
            deleteButton.classList.add('hidden');
        }
    }

    const shareButton = document.getElementById('viewer-share-notiz-btn');
    if (shareButton) {
        if (isOwner) {
            shareButton.classList.remove('hidden');
        } else {
            shareButton.classList.add('hidden');
        }
    }

    const erweitertButton = document.getElementById('viewer-erweitert-btn');
    const weitereOptionenButton = document.getElementById('viewer-weitere-optionen-btn');
    const weitereOptionenMenu = document.getElementById('viewer-weitere-optionen-menu');
    const showErweitert = hasWriteAccess || isOwner;
    const showWeitereOptionen = isOwner;

    if (erweitertButton) {
        if (showErweitert) {
            erweitertButton.classList.remove('hidden');
        } else {
            erweitertButton.classList.add('hidden');
        }
    }

    if (weitereOptionenButton) {
        if (showWeitereOptionen) {
            weitereOptionenButton.classList.remove('hidden');
        } else {
            weitereOptionenButton.classList.add('hidden');
        }
    }

    if (!showWeitereOptionen && weitereOptionenMenu) {
        weitereOptionenMenu.classList.add('hidden');
    }

    const shareInfoEl = document.getElementById('viewer-notiz-share-info');
    if (shareInfoEl) {
        const shareInfoText = getNotizShareInfoText(notiz);
        if (shareInfoText) {
            shareInfoEl.textContent = shareInfoText;
            shareInfoEl.classList.remove('hidden');
        } else {
            shareInfoEl.textContent = '';
            shareInfoEl.classList.add('hidden');
        }
    }

    // Elemente rendern (schreibgeschützt)
    const contentContainer = document.getElementById('viewer-notiz-content');
    if (contentContainer) {
        contentContainer.innerHTML = renderNotizElementsReadOnly(notiz.elemente || []);
    }

    // Erweitert-Menü zurücksetzen
    const erweiterMenuEl = document.getElementById('viewer-erweitert-menu');
    const weitereOptionenMenuEl = document.getElementById('viewer-weitere-optionen-menu');
    if (erweiterMenuEl) erweiterMenuEl.classList.add('hidden');
    if (weitereOptionenMenuEl) weitereOptionenMenuEl.classList.add('hidden');

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
    const weitereOptionenMenu = document.getElementById('viewer-weitere-optionen-menu');
    if (menu) menu.classList.toggle('hidden');
    if (weitereOptionenMenu) weitereOptionenMenu.classList.add('hidden');
};

window.toggleWeitereOptionenMenu = function() {
    const menu = document.getElementById('viewer-weitere-optionen-menu');
    if (menu) menu.classList.toggle('hidden');
};

window.editCurrentNotiz = function() {
    if (currentViewingNotizId) {
        const notizIdToEdit = currentViewingNotizId; // ID speichern BEVOR closeNotizViewer sie löscht
        closeNotizViewer();
        openNotizEditor(notizIdToEdit);
    }
};

window.deleteCurrentNotiz = async function() {
    if (currentViewingNotizId && confirm('Notiz wirklich löschen?')) {
        await deleteNotiz(currentViewingNotizId);
        closeNotizViewer();
    }
};

// ========================================
// SHARING UI: EINLADUNGEN & SHARE MODAL
// ========================================

function getNotizenEinladungenCollectionRef() {
    return collection(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen');
}

function getNotizenEinladungenDocRef(inviteId) {
    if (!inviteId) return null;
    return doc(db, 'artifacts', appId, 'public', 'data', 'notizen_einladungen', inviteId);
}

function buildNotizenInviteId(type, resourceId, targetUserId) {
    const safe = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${type}_${safe(resourceId)}_${safe(targetUserId)}`;
}

function getNotizenShareTypeLabel(type) {
    return type === SHARE_SOURCE_TYPES.kategorie ? 'Kategorie' : 'Notiz';
}

function getInviteSortDate(invite) {
    if (!invite) return new Date(0);
    if (invite.createdAt?.toDate) return invite.createdAt.toDate();
    if (invite.createdAt) return new Date(invite.createdAt);
    return new Date(0);
}

function sortInvitesByDate(a, b) {
    return getInviteSortDate(b) - getInviteSortDate(a);
}

function renderNotizenEinladungenEmpty(message) {
    return `<p class="text-gray-400 text-sm italic">${escapeHtml(message || '')}</p>`;
}

function renderNotizenInviteInboxItem(invite) {
    const resource = escapeHtml(getInviteResourceLabel(invite));
    const owner = escapeHtml(getInviteOwnerLabel(invite));
    const permission = getInvitePermissionLabel(invite.permission);
    const typeLabel = getInviteTypeLabel(invite);

    return `
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div class="flex justify-between items-start gap-3">
                <div>
                    <p class="font-semibold text-gray-800">${resource}</p>
                    <p class="text-xs text-gray-600">${typeLabel} · ${permission}</p>
                    <p class="text-xs text-gray-500">Von: ${owner}</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.notizenAcceptInvite('${invite.id}')" class="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs">✓ Annehmen</button>
                    <button onclick="window.notizenRejectInvite('${invite.id}')" class="px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs">✗ Ablehnen</button>
                </div>
            </div>
        </div>
    `;
}

function renderNotizenInviteActiveItem(invite) {
    const resource = escapeHtml(getInviteResourceLabel(invite));
    const owner = escapeHtml(getInviteOwnerLabel(invite));
    const permission = getInvitePermissionLabel(invite.permission);
    const typeLabel = getInviteTypeLabel(invite);

    return `
        <div class="p-3 bg-green-50 border border-green-200 rounded-lg">
            <div class="flex justify-between items-start gap-3">
                <div>
                    <p class="font-semibold text-gray-800">${resource}</p>
                    <p class="text-xs text-gray-600">${typeLabel} · ${permission}</p>
                    <p class="text-xs text-gray-500">Von: ${owner}</p>
                </div>
                <button onclick="window.notizenRemoveInviteAccess('${invite.id}')" class="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-xs">Zugriff entfernen</button>
            </div>
        </div>
    `;
}

function renderNotizenInviteRejectedItem(invite) {
    const resource = escapeHtml(getInviteResourceLabel(invite));
    const owner = escapeHtml(getInviteOwnerLabel(invite));
    const permission = getInvitePermissionLabel(invite.permission);
    const typeLabel = getInviteTypeLabel(invite);

    return `
        <div class="p-3 bg-red-50 border border-red-200 rounded-lg opacity-80">
            <div class="flex justify-between items-start gap-3">
                <div>
                    <p class="font-semibold text-gray-700">${resource}</p>
                    <p class="text-xs text-gray-600">${typeLabel} · ${permission}</p>
                    <p class="text-xs text-gray-500">Von: ${owner}</p>
                </div>
                <button onclick="window.notizenRevokeInviteRejection('${invite.id}')" class="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-xs">↩ Zurückziehen</button>
            </div>
        </div>
    `;
}

function renderNotizenInviteOutgoingItem(invite) {
    const resource = escapeHtml(getInviteResourceLabel(invite));
    const target = escapeHtml(getInviteTargetLabel(invite));
    const permission = getInvitePermissionLabel(invite.permission);
    const typeLabel = getInviteTypeLabel(invite);
    const statusLabel = getInviteStatusLabel(invite.status);
    const statusClass = invite.status === NOTIZEN_INVITE_STATUS.accepted
        ? 'text-green-600'
        : invite.status === NOTIZEN_INVITE_STATUS.pending
            ? 'text-amber-600'
            : invite.status === NOTIZEN_INVITE_STATUS.rejected
                ? 'text-red-600'
                : 'text-gray-500';
    const canRemove = invite.status !== NOTIZEN_INVITE_STATUS.rejected;

    return `
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="flex justify-between items-start gap-3">
                <div>
                    <p class="font-semibold text-gray-800">${resource}</p>
                    <p class="text-xs text-gray-600">${typeLabel} · ${permission}</p>
                    <p class="text-xs ${statusClass}">Status: ${statusLabel}</p>
                    <p class="text-xs text-gray-500">An: ${target}</p>
                    ${invite.status === NOTIZEN_INVITE_STATUS.rejected ? '<p class="text-xs text-red-600">Ablehnung blockiert neue Einladungen.</p>' : ''}
                </div>
                ${canRemove ? `<button onclick="window.notizenRemoveOutgoingInvite('${invite.id}')" class="px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-xs">Entziehen</button>` : ''}
            </div>
        </div>
    `;
}

function renderNotizenEinladungenModal() {
    const inboxEl = document.getElementById('notizen-einladungen-inbox');
    const activeEl = document.getElementById('notizen-einladungen-aktiv');
    const rejectedEl = document.getElementById('notizen-einladungen-abgelehnt');
    const outgoingEl = document.getElementById('notizen-einladungen-postausgang');
    if (!inboxEl || !activeEl || !rejectedEl || !outgoingEl) return;

    const incomingInvites = Object.values(NOTIZEN_EINLADUNGEN).sort(sortInvitesByDate);
    const outgoingInvites = Object.values(NOTIZEN_EINLADUNGEN_OUTGOING).sort(sortInvitesByDate);

    const pendingInvites = incomingInvites.filter(invite => invite.status === NOTIZEN_INVITE_STATUS.pending);
    const acceptedInvites = incomingInvites.filter(invite => invite.status === NOTIZEN_INVITE_STATUS.accepted);
    const rejectedInvites = incomingInvites.filter(invite => invite.status === NOTIZEN_INVITE_STATUS.rejected);
    const outgoingFiltered = outgoingInvites.filter(invite => ![NOTIZEN_INVITE_STATUS.removed, NOTIZEN_INVITE_STATUS.revoked].includes(invite.status));

    inboxEl.innerHTML = pendingInvites.length
        ? pendingInvites.map(renderNotizenInviteInboxItem).join('')
        : renderNotizenEinladungenEmpty('Keine Einladungen vorhanden.');
    activeEl.innerHTML = acceptedInvites.length
        ? acceptedInvites.map(renderNotizenInviteActiveItem).join('')
        : renderNotizenEinladungenEmpty('Keine aktiven Freigaben.');
    rejectedEl.innerHTML = rejectedInvites.length
        ? rejectedInvites.map(renderNotizenInviteRejectedItem).join('')
        : renderNotizenEinladungenEmpty('Keine abgelehnten Einladungen.');
    outgoingEl.innerHTML = outgoingFiltered.length
        ? outgoingFiltered.map(renderNotizenInviteOutgoingItem).join('')
        : renderNotizenEinladungenEmpty('Keine gesendeten Einladungen.');
}

function refreshNotizenEinladungenModalIfOpen() {
    const modal = document.getElementById('notizenEinladungenModal');
    if (!modal || modal.classList.contains('hidden')) return;
    renderNotizenEinladungenModal();
}

function openNotizenEinladungenModal() {
    const modal = document.getElementById('notizenEinladungenModal');
    if (!modal) return;
    renderNotizenEinladungenModal();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeNotizenEinladungenModal() {
    const modal = document.getElementById('notizenEinladungenModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function updateNotizenInviteStatus(inviteId, status, extraData = {}) {
    const docRef = getNotizenEinladungenDocRef(inviteId);
    if (!docRef) return false;
    try {
        await updateDoc(docRef, {
            status,
            ...extraData
        });
        refreshNotizenEinladungenModalIfOpen();
        return true;
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Aktualisieren der Einladung:', error);
        alertUser('Fehler beim Aktualisieren der Einladung.', 'error');
        return false;
    }
}

async function acceptNotizenInvite(inviteId) {
    const invite = NOTIZEN_EINLADUNGEN[inviteId];
    if (!invite || invite.status !== NOTIZEN_INVITE_STATUS.pending) return;
    const success = await updateNotizenInviteStatus(inviteId, NOTIZEN_INVITE_STATUS.accepted, {
        respondedAt: serverTimestamp()
    });
    if (success) alertUser('Einladung angenommen.', 'success');
}

async function rejectNotizenInvite(inviteId) {
    const invite = NOTIZEN_EINLADUNGEN[inviteId];
    if (!invite || invite.status !== NOTIZEN_INVITE_STATUS.pending) return;
    const success = await updateNotizenInviteStatus(inviteId, NOTIZEN_INVITE_STATUS.rejected, {
        respondedAt: serverTimestamp()
    });
    if (success) alertUser('Einladung abgelehnt.', 'success');
}

async function revokeNotizenInviteRejection(inviteId) {
    if (!confirm('Ablehnung zurückziehen? Danach kann wieder eingeladen werden.')) return;
    const invite = NOTIZEN_EINLADUNGEN[inviteId];
    if (!invite || invite.status !== NOTIZEN_INVITE_STATUS.rejected) return;
    const success = await updateNotizenInviteStatus(inviteId, NOTIZEN_INVITE_STATUS.revoked, {
        revokedAt: serverTimestamp()
    });
    if (success) alertUser('Ablehnung zurückgezogen.', 'success');
}

async function removeNotizenInviteAccess(inviteId) {
    if (!confirm('Zugriff auf diese Freigabe wirklich entfernen?')) return;
    const invite = NOTIZEN_EINLADUNGEN[inviteId];
    if (!invite || invite.status !== NOTIZEN_INVITE_STATUS.accepted) return;
    const success = await updateNotizenInviteStatus(inviteId, NOTIZEN_INVITE_STATUS.removed, {
        removedAt: serverTimestamp()
    });
    if (success) alertUser('Zugriff entfernt.', 'success');
}

async function removeNotizenOutgoingInvite(inviteId) {
    if (!confirm('Einladung wirklich entziehen?')) return;
    const invite = NOTIZEN_EINLADUNGEN_OUTGOING[inviteId];
    if (!invite) return;
    if (invite.status === NOTIZEN_INVITE_STATUS.rejected) {
        alertUser('Der Empfänger muss die Ablehnung zuerst zurückziehen.', 'error');
        return;
    }
    const success = await updateNotizenInviteStatus(inviteId, NOTIZEN_INVITE_STATUS.removed, {
        removedAt: serverTimestamp()
    });
    if (success) alertUser('Einladung entzogen.', 'success');
}

function openNotizenShareModalForNotiz(notizId) {
    const notiz = typeof notizId === 'string' ? getNotizByLookupKey(notizId) : notizId;
    if (!notiz) {
        alertUser('Notiz nicht gefunden.', 'error');
        return;
    }
    if (!isNotizOwner(notiz)) {
        alertUser('Nur der Besitzer kann teilen.', 'warning');
        return;
    }
    openNotizenShareModal({
        type: SHARE_SOURCE_TYPES.notiz,
        resourceId: notiz.id,
        resourceTitle: notiz.titel || 'Ohne Titel',
        ownerId: getNotizOwnerId(notiz),
        ownerName: getNotizOwnerLabel(notiz)
    });
}

function openNotizenShareModalForKategorie(kategorieId) {
    const kategorie = KATEGORIEN[kategorieId];
    if (!kategorie) return;
    closeNotizenSettings();
    openNotizenShareModal({
        type: SHARE_SOURCE_TYPES.kategorie,
        resourceId: kategorie.id,
        resourceTitle: kategorie.name || 'Ohne Kategorie',
        ownerId: getCurrentUserId(),
        ownerName: getCurrentUserDisplayName()
    });
}

function openNotizenShareModal(context) {
    if (!context?.resourceId || !context?.type) return;
    const modal = document.getElementById('notizenShareModal');
    if (!modal) return;
    currentShareContext = context;

    const typeLabel = getNotizenShareTypeLabel(context.type);
    const titleEl = document.getElementById('notizen-share-title');
    const resourceEl = document.getElementById('notizen-share-resource');
    const ownerEl = document.getElementById('notizen-share-owner');
    if (titleEl) titleEl.textContent = `🔗 Teilen (${typeLabel})`;
    if (resourceEl) resourceEl.textContent = `${typeLabel}: ${context.resourceTitle || 'Unbekannt'}`;
    if (ownerEl) {
        ownerEl.textContent = `Besitzer: ${context.ownerName || getCurrentUserDisplayName()}`;
        ownerEl.classList.remove('hidden');
    }

    populateNotizenShareUserSelect();
    const permissionSelect = document.getElementById('notizen-share-permission');
    if (permissionSelect) permissionSelect.value = normalizeSharePermission(context.permission || NOTIZEN_SHARE_PERMISSION.read);
    setNotizenShareFeedback('');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeNotizenShareModal() {
    const modal = document.getElementById('notizenShareModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentShareContext = null;
    setNotizenShareFeedback('');
}

function populateNotizenShareUserSelect() {
    const select = document.getElementById('notizen-share-target-user');
    if (!select) return;
    const currentUserId = getCurrentUserId();
    select.innerHTML = '<option value="">-- Benutzer auswählen --</option>';

    const users = USERS ? Object.entries(USERS) : [];
    users
        .map(([userId, user]) => ({
            id: user?.id || userId,
            name: user?.realName || user?.name || user?.displayName || userId,
            isActive: user?.isActive
        }))
        .filter(user => user?.id && user.id !== currentUserId && user.isActive !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
        .forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            select.appendChild(option);
        });
}

function setNotizenShareFeedback(message, type = 'info') {
    const feedback = document.getElementById('notizen-share-feedback');
    if (!feedback) return;
    if (!message) {
        feedback.textContent = '';
        feedback.className = 'hidden text-sm';
        return;
    }
    const typeClass = type === 'success'
        ? 'text-green-700 bg-green-50 border-green-200'
        : type === 'error'
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-gray-600 bg-gray-50 border-gray-200';
    feedback.textContent = message;
    feedback.className = `text-sm border px-3 py-2 rounded ${typeClass}`;
}

async function sendNotizenShareInvite() {
    if (!currentShareContext) return;
    const targetSelect = document.getElementById('notizen-share-target-user');
    const permissionSelect = document.getElementById('notizen-share-permission');
    const targetUserId = targetSelect?.value || '';
    const permission = normalizeSharePermission(permissionSelect?.value);

    if (!targetUserId) {
        setNotizenShareFeedback('Bitte einen Empfänger auswählen.', 'error');
        return;
    }

    const ownerId = currentShareContext.ownerId || getCurrentUserId();
    if (targetUserId === ownerId) {
        setNotizenShareFeedback('Du kannst dich nicht selbst einladen.', 'error');
        return;
    }

    const inviteId = buildNotizenInviteId(currentShareContext.type, currentShareContext.resourceId, targetUserId);
    const docRef = getNotizenEinladungenDocRef(inviteId);
    if (!docRef) return;

    try {
        const existingSnap = await getDoc(docRef);
        if (existingSnap.exists()) {
            const existing = existingSnap.data() || {};
            if (existing.status === NOTIZEN_INVITE_STATUS.rejected) {
                setNotizenShareFeedback('Der Empfänger hat abgelehnt. Erst Ablehnung zurückziehen lassen.', 'error');
                return;
            }
            if ([NOTIZEN_INVITE_STATUS.pending, NOTIZEN_INVITE_STATUS.accepted].includes(existing.status)) {
                setNotizenShareFeedback('Es besteht bereits eine Einladung oder Freigabe.', 'error');
                return;
            }
        }

        const targetUserName = getUserDisplayNameById(targetUserId);
        const inviteData = {
            type: currentShareContext.type,
            resourceId: currentShareContext.resourceId,
            resourceTitleSnapshot: currentShareContext.resourceTitle || null,
            ownerId,
            ownerName: currentShareContext.ownerName || getCurrentUserDisplayName(),
            targetUserId,
            targetUserName,
            permission,
            status: NOTIZEN_INVITE_STATUS.pending,
            createdAt: serverTimestamp(),
            respondedAt: null,
            revokedAt: null,
            removedAt: null
        };

        await setDoc(docRef, inviteData, { merge: true });
        alertUser('Einladung gesendet.', 'success');
        closeNotizenShareModal();
    } catch (error) {
        console.error('📝 Notizen: Fehler beim Senden der Einladung:', error);
        setNotizenShareFeedback('Fehler beim Senden der Einladung.', 'error');
    }
}

window.notizenAcceptInvite = acceptNotizenInvite;
window.notizenRejectInvite = rejectNotizenInvite;
window.notizenRevokeInviteRejection = revokeNotizenInviteRejection;
window.notizenRemoveInviteAccess = removeNotizenInviteAccess;
window.notizenRemoveOutgoingInvite = removeNotizenOutgoingInvite;

// ========================================
// NOTIZ EDITOR
// ========================================

export async function openNotizEditor(notizId = null) {
    await releaseCurrentNotizLock();
    setNotizEditorReadOnly(false, '');
    const notiz = notizId ? getNotizByLookupKey(notizId) : null;
    if (notiz && !canCurrentUserWriteNotiz(notiz)) {
        alertUser('Keine Bearbeitungsrechte für diese Notiz.', 'warning');
        return;
    }

    currentEditingNotizId = notizId;
    console.log('📝 Notizen: openNotizEditor aufgerufen, notizId:', notizId, '-> currentEditingNotizId:', currentEditingNotizId);
    
    const modal = document.getElementById('notizEditorModal');
    if (!modal) return;

    const isOwner = notiz ? isNotizOwner(notiz) : true;
    const lockKategorie = Boolean(notiz && !isOwner);
    const sharedKategorie = lockKategorie ? getKategorieForNotiz(notiz) : null;
    const sharedUnterkategorie = lockKategorie && sharedKategorie?.unterkategorien
        ? sharedKategorie.unterkategorien.find(uk => uk.id === notiz?.unterkategorieId)
        : null;
    
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
        kategorieSelect.innerHTML = '<option value="">-- Kategorie wählen --</option>';
        if (lockKategorie) {
            const option = document.createElement('option');
            option.value = notiz?.kategorieId || '';
            option.textContent = `🔗 ${sharedKategorie?.name || 'Geteilte Kategorie'}`;
            option.selected = true;
            kategorieSelect.appendChild(option);
        } else {
            Object.values(KATEGORIEN).forEach(kat => {
                const option = document.createElement('option');
                option.value = kat.id;
                option.textContent = kat.name;
                if (notiz?.kategorieId === kat.id) option.selected = true;
                kategorieSelect.appendChild(option);
            });
        }

        // Event-Listener für Kategorie-Änderung (Unterkategorien aktualisieren)
        kategorieSelect.onchange = lockKategorie ? null : () => updateUnterkategorienDropdown(kategorieSelect.value, null);
        kategorieSelect.disabled = lockKategorie;
    }
    
    // Unterkategorien laden
    if (lockKategorie) {
        if (unterkategorieSelect) {
            unterkategorieSelect.innerHTML = '<option value="">-- Keine --</option>';
            if (notiz?.unterkategorieId) {
                const option = document.createElement('option');
                option.value = notiz.unterkategorieId;
                option.textContent = sharedUnterkategorie?.name || 'Unterkategorie';
                option.selected = true;
                unterkategorieSelect.appendChild(option);
            }
            unterkategorieSelect.disabled = true;
        }
    } else {
        updateUnterkategorienDropdown(notiz?.kategorieId, notiz?.unterkategorieId);
        if (unterkategorieSelect) unterkategorieSelect.disabled = false;
    }

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

    await ensureNotizEditorLock(notiz);
}

function closeNotizEditor() {
    const modal = document.getElementById('notizEditorModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    setNotizEditorReadOnly(false, '');
    releaseCurrentNotizLock();
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
        const currentNotiz = getNotizByLookupKey(currentEditingNotizId);
        if (!currentNotiz) {
            alertUser('Notiz nicht gefunden.', 'error');
            return;
        }
        if (!canCurrentUserWriteNotiz(currentNotiz)) {
            alertUser('Keine Berechtigung zum Bearbeiten dieser Notiz.', 'warning');
            return;
        }
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
    // Verhindere doppelte Event-Listener
    if (eventListenersInitialized) return;
    eventListenersInitialized = true;
    
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

    const toggleFilterControls = document.getElementById('notizen-toggle-filter-controls');
    if (toggleFilterControls) {
        toggleFilterControls.addEventListener('click', () => {
            const wrapper = document.getElementById('notizen-filter-controls-wrapper');
            const icon = document.getElementById('notizen-toggle-filter-icon');
            if (!wrapper || !icon) return;
            wrapper.classList.toggle('hidden');
            icon.classList.toggle('rotate-180');
        });
    }

    // Suche
    const searchInput = document.getElementById('search-notizen');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = String(e.target.value || '');
            if (!term.trim()) {
                hideNotizenSearchSuggestions();
                return;
            }
            updateNotizenSearchSuggestions(term);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                window.addNotizFilter();
            }
        });
        searchInput.addEventListener('focus', (e) => {
            const term = String(e.target.value || '').trim();
            if (term) updateNotizenSearchSuggestions(term);
        });
    }

    if (!document.body.dataset.notizenSuggestionsListenerAttached) {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#search-notizen') && !e.target.closest('#notizen-search-suggestions-box')) {
                hideNotizenSearchSuggestions();
            }
        });
        document.body.dataset.notizenSuggestionsListenerAttached = 'true';
    }

    const joinMode = document.getElementById('notizen-search-join-mode');
    if (joinMode) {
        joinMode.addEventListener('change', (e) => {
            notizenSearchJoinMode = e.target.value === 'or' ? 'or' : 'and';
            renderNotizenList();
        });
    }

    // Kategorie-Filter
    const kategorieFilter = document.getElementById('filter-notizen-kategorie');
    if (kategorieFilter) {
        kategorieFilter.addEventListener('change', (e) => {
            const value = e.target.value;
            setKategorieFilterFromValue(value);
            renderNotizenList();
        });
    }

    // Filter zurücksetzen (mit Standardfilter)
    const resetFilters = document.getElementById('reset-filters-notizen');
    if (resetFilters) {
        resetFilters.addEventListener('click', () => {
            resetNotizFiltersToDefault();
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

    const btnViewMode = document.getElementById('btn-notizen-view-mode');
    if (btnViewMode) {
        btnViewMode.addEventListener('click', () => {
            isNotizenListView = !isNotizenListView;
            saveUserSetting('notizen_view_mode', isNotizenListView ? 'list' : 'card');
            updateNotizenViewModeButton();
            renderNotizenList();
        });
    }

    // Einladungen öffnen
    const btnEinladungen = document.getElementById('btn-notizen-einladungen');
    if (btnEinladungen) {
        btnEinladungen.addEventListener('click', openNotizenEinladungenModal);
    }

    // Einladungen schließen
    const closeEinladungenBtn = document.getElementById('close-notizen-einladungen');
    if (closeEinladungenBtn) {
        closeEinladungenBtn.addEventListener('click', closeNotizenEinladungenModal);
    }
    const closeEinladungenFooter = document.getElementById('close-notizen-einladungen-footer');
    if (closeEinladungenFooter) {
        closeEinladungenFooter.addEventListener('click', closeNotizenEinladungenModal);
    }

    // Share-Modal schließen/öffnen
    const closeShareBtn = document.getElementById('close-notizen-share');
    if (closeShareBtn) {
        closeShareBtn.addEventListener('click', closeNotizenShareModal);
    }
    const cancelShareBtn = document.getElementById('notizen-share-cancel');
    if (cancelShareBtn) {
        cancelShareBtn.addEventListener('click', closeNotizenShareModal);
    }
    const sendShareBtn = document.getElementById('notizen-share-send');
    if (sendShareBtn) {
        sendShareBtn.addEventListener('click', sendNotizenShareInvite);
    }

    // Share aus Viewer
    const viewerShareBtn = document.getElementById('viewer-share-notiz-btn');
    if (viewerShareBtn) {
        viewerShareBtn.addEventListener('click', () => {
            if (currentViewingNotizId) {
                openNotizenShareModalForNotiz(currentViewingNotizId);
            }
            const erweiterMenu = document.getElementById('viewer-erweitert-menu');
            const weitereOptionenMenu = document.getElementById('viewer-weitere-optionen-menu');
            if (erweiterMenu) erweiterMenu.classList.add('hidden');
            if (weitereOptionenMenu) weitereOptionenMenu.classList.add('hidden');
        });
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
                    <button class="share-kategorie text-amber-500 hover:text-amber-700" data-id="${kat.id}" title="Teilen">🔗</button>
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

    container.querySelectorAll('.share-kategorie').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            if (id) {
                openNotizenShareModalForKategorie(id);
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

}

// Export für Initialisierung
export { closeNotizEditor, closeNotizenSettings };
