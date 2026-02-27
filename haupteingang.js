// // @ts-check 

// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, query, where, serverTimestamp, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { checkCurrentUserValidity, updateUIForMode, switchToGuestMode, clearAllUserData, saveUserSetting, getUserSetting } from './log-InOut.js';
import { renderModalUserButtons, listenForUserUpdates, toggleNewUserRoleField, addAdminUserManagementListeners, renderUserManagement } from './admin_benutzersteuerung.js';
import { listenForRoleUpdates, listenForAdminRoleUpdates, renderRoleManagement } from './admin_rollenverwaltung.js';
import { listenForApprovalRequests, stopApprovalRequestsListener, createApprovalRequest, renderApprovalProcess } from './admin_genehmigungsprozess.js';
import { toggleAdminSection, rememberAdminScroll, restoreAdminScrollIfAny, renderMainFunctionsAdminArea } from './admin_adminfunktionenHome.js';
import { initializeEssensberechnungView } from './essensberechnung.js';
import { IFTTT_URL, initializeNotrufSettingsView, ensureModalListeners, renderApiTokenBook, openNachrichtencenterContactBook } from './notfall.js';
import { PUSHOVER_TOKEN } from './pushbenachrichtigung.js';
import { listenForChecklistGroups, listenForChecklistItems, listenForChecklists, listenForChecklistCategories, openTemplateModal, renderChecklistView, renderChecklistSettingsView, listenForTemplates, listenForStacks } from './checklist.js';
import { logAdminAction, renderProtocolHistory } from './admin_protokollHistory.js';
import { renderUserKeyList } from './admin_benutzersteuerung.js';
// NEU: Wir importieren die Start-Funktion aus deiner neuen Datei
import { initializeTerminplanerView, listenForPublicVotes, joinVoteById, joinVoteByToken, joinVoteAsGuest } from './terminplaner.js';
import { initializeZahlungsverwaltungView, initializeZahlungsverwaltungSettingsView } from './zahlungsverwaltung.js';
import {
    renderPendingNotifications,
    initializePendingNotificationsModal,
    checkAndShowPendingNotificationsModal,
    startPushmailScheduler,
    startPendingNotificationsListener,
    stopPendingNotificationsListener
} from './pushmail-notifications.js';
import { initializePushmailSettingsUI } from './pushmail-settings-ui.js';
import { initializeTicketSupport, listenForTickets, stopTicketsListener } from './ticket-support.js';
import { initializeWertguthaben, listenForWertguthaben, stopWertguthabenListener } from './wertguthaben.js';
import { initializeLizenzen, listenForLizenzen, stopLizenzenListener } from './lizenzen.js';
import { initializeVertragsverwaltung, listenForVertraege, stopVertragsverwaltungListeners } from './vertragsverwaltung.js';
import { initRezeptverwaltung } from './rezeptverwaltung.js';
import { initializeHaushaltszahlungen, listenForHaushaltszahlungen, stopHaushaltszahlungenListeners } from './haushaltszahlungen.js';
import { initializeGeschenkemanagement, listenForGeschenke, stopGeschenkemanagementListeners } from './geschenkemanagement.js';
import { initializeSendungsverwaltungView, listenForSendungen, stopSendungsverwaltungListeners } from './sendungsverwaltung.js';
import { ensureNachrichtencenterSelfContact } from './notfall.js';
import { initializeNotizen, stopNotizenListeners } from './notizen.js';
import { initializeMitarbeiterkarte, stopMitarbeiterkarteListeners } from './ma-karte.js';
// // ENDE-ZIKA //

// PUSHOVER API TOKEN (fest codiert, für alle User gleich)
export const PUSHOVER_API_TOKEN = 'ag3nyu918ady5f8eqjuug13ttyaq9f';

// Zentrale escapeHtml Funktion (für alle Module)
export const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// Zentrale Berechtigungen-Konfiguration (für admin_benutzersteuerung.js und admin_rollenverwaltung.js)
export const PERMISSIONS_CONFIG = {
    'ENTRANCE': { label: 'Haupteingang öffnen', indent: false },
    'PUSHOVER': { label: 'Push-Nachricht senden', indent: false },
    'PUSHMAIL_CENTER': { label: 'PUSHMAIL-Center', indent: false },
    'PUSHOVER_SETTINGS_GRANTS': { label: '-> Einstellungen-Button zum Berechtigungen anlegen', indent: true },
    'PUSHOVER_NOTRUF_SETTINGS': { label: '-> Notruf-Einstellungen', indent: true },
    'PUSHOVER_NOTRUF_SETTINGS_FLIC': { label: '-> -> Flic-Notruf-Button', indent: true },
    'PUSHOVER_NOTRUF_SETTINGS_NACHRICHTENCENTER': { label: '-> -> Nachrichtencenter', indent: true },
    'PUSHOVER_NOTRUF_SETTINGS_ALARM_PROGRAMME': { label: '-> -> Alarm-Programme', indent: true },
    'CHECKLIST': { label: 'Aktuelle Checkliste', indent: false },
    'CHECKLIST_SWITCH': { label: '-> Listen umschalten', indent: true },
    'CHECKLIST_SETTINGS': { label: '-> Checkliste-Einstellungen', indent: true },
    'ESSENSBERECHNUNG': { label: 'Essensberechnung', indent: false },
    'TERMINPLANER': { label: 'Termin finden', indent: false },
    'TERMINPLANER_CREATE': { label: '-> Neuen Termin anlegen', indent: true },
    'TOOLS': { label: 'Tools', indent: false },
    'ZAHLUNGSVERWALTUNG': { label: 'Zahlungsverwaltung', indent: false },
    'ZAHLUNGSVERWALTUNG_CREATE': { label: '-> Neue Zahlung anlegen', indent: true },
    'TICKET_SUPPORT': { label: 'Ticket Support', indent: false },
    'NOTIZEN': { label: 'Notizen', indent: false },
    'NOTIZEN_CREATE': { label: '-> Notiz/Kategorie anlegen', indent: true },
    'WERTGUTHABEN': { label: 'Wertguthaben', indent: false },
    'LIZENZEN': { label: 'Lizenzen', indent: false },
    'VERTRAGSVERWALTUNG': { label: 'Vertragsverwaltung', indent: false },
    'SENDUNGSVERWALTUNG': { label: 'Sendungsverwaltung', indent: false },
    'REZEPTE': { label: 'Rezepte', indent: false },
    'HAUSHALTSZAHLUNGEN': { label: 'Haushaltszahlungen', indent: false },
    'HAUSHALTSZAHLUNGEN_CREATE': { label: '-> Neue Zahlung anlegen', indent: true },
    'GESCHENKEMANAGEMENT': { label: 'Geschenkemanagement', indent: false },
    'GESCHENKEMANAGEMENT_CREATE': { label: '-> Neues Geschenk anlegen', indent: true }
};

// BEGINN-ZIKA: LET-BEFEHLE IMMER NACH IMPORT-BEFEHLE //
export let USERS = {};
export let CHECKLISTS = {};
export let ARCHIVED_CHECKLISTS = {};
export let CHECKLIST_STACKS = {};
export let CHECKLIST_ITEMS = {};
export let DELETED_CHECKLISTS = {};
export let PENDING_REQUESTS = {}
export let submitAdminKeyButton;
export let CHECKLIST_CATEGORIES = {};
export let CHECKLIST_GROUPS = {};
export let ROLES = {};
export let initialAuthCheckDone = false;
export let adminPinInput;
export let modalUserButtons;
export let adminRightsToggle;
export let pinModal;
export let pinError;
export let TEMPLATES = {};
export let TEMPLATE_ITEMS = {};
export let notrufSettingsDocRef;
let activeFlicEditorKlickTyp = null;
export let tempSelectedApiTokenId = null;
export let tempSelectedSoundId = null;
export let unsubscribeTemplateItems = null;
export let adminSettings = {};
export let selectedUserForLogin = null;
export let adminSectionsState = { password: false, user: false, role: false, approval: false, protocol: false, adminRights: false, mainFunctions: false };
let localUpdateInProgress = false;
export let roleManagementSectionsState = { userRolesOpen: false, adminRolesOpen: false };
export let ADMIN_ROLES = {};
export let adminRolesCollectionRef;
export let approvalRequestsCollectionRef;
export let db;
export let checklistsCollectionRef, checklistItemsCollectionRef;
export let checklistGroupsCollectionRef;
export let checklistCategoriesCollectionRef;
export let auth;
export let usersCollectionRef, rolesCollectionRef, roleChangeRequestsCollectionRef, settingsDocRef, auditLogCollectionRef, votesCollectionRef, pushoverProgramsCollectionRef, pushoverGrantsBySenderCollectionRef, pushoverGrantsByRecipientCollectionRef;
export let activeDisplayMode = 'gesamt';
export let checklistStacksCollectionRef;
export let checklistTemplatesCollectionRef;
let editingPortionId = null;

// --- NEU: Fehlende UI-Elemente global definieren ---
export let appHeader;
export let userSelectionModal;
export let pinModalTitle;
export let roleSettingsToggle, passwordSettingsToggle, userManagementToggle, approvalProcessToggle, protocolHistoryToggle, mainFunctionsToggle;

export const firebaseConfigFromUser = {
    apiKey: "AIzaSyCCQML1UOy7NB5ohbiPZmOE6dB6oIpzlQk",
    authDomain: "top2-e9ac0.firebaseapp.com",
    projectId: "top2-e9ac0",
    storageBucket: "top2-e9ac0.firebasestorage.app",
    messagingSenderId: "21327088897",
    appId: "1:21327088897:web:3d1496dabc5dceb534df00",
    measurementId: "G-TXFM8WC5HC"
};

export const GUEST_MODE = 'Gast';
export const ADMIN_STORAGE_KEY = 't2_user_mode';

// KORREKTUR: Wir nutzen direkt deine Werte (keine unbekannten Variablen mehr)
export const appId = '20LVob88b3ovXRUyX3ra';
export const firebaseConfig = firebaseConfigFromUser;

// NEU: Wir fügen 'terminplaner' zu unserer Liste der bekannten Seiten (Views) hinzu
export const views = {
    home: { id: 'homeView' },
    entrance: { id: 'entranceView' },
    pushover: { id: 'pushoverView' },
    pushmailCenter: { id: 'pushmailCenterView' },
    admin: { id: 'adminView' },
    userSettings: { id: 'userSettingsView' },
    checklist: { id: 'checklistView' },
    checklistSettings: { id: 'checklistSettingsView' },
    essensberechnung: { id: 'essensberechnungView' },
    notrufSettings: { id: 'notrufSettingsView' },
    terminplaner: { id: 'terminplanerView' },
    tools: { id: 'toolsView' },
    maKarte: { id: 'maKarteView' },
    zahlungsverwaltung: { id: 'zahlungsverwaltungView' },
    zahlungsverwaltungSettings: { id: 'zahlungsverwaltungSettingsView' },
    ticketSupport: { id: 'ticketSupportView' },
    notizen: { id: 'notizenView' },
    wertguthaben: { id: 'wertguthabenView' },
    wertguthabenSettings: { id: 'wertguthabenSettingsView' },
    lizenzen: { id: 'lizenzenView' },
    vertragsverwaltung: { id: 'vertragsverwaltungView' },
    sendungsverwaltung: { id: 'sendungsverwaltungView' },
    rezepte: { id: 'rezepteView' },
    haushaltszahlungen: { id: 'haushaltszahlungenView' },
    geschenkemanagement: { id: 'geschenkemanagementView' }
};
const viewElements = Object.fromEntries(Object.keys(views).map(key => [key + 'View', document.getElementById(views[key].id)]));

let globalListenersStarted = false;
let lastUserDependentListenerMode = null;

export let pushoverProgramConfigCache = {};
export let pushoverRecipientGrantCache = {};
export let pushoverSelectedRecipientId = null;

export function stopAllUserDependentListeners(resetMode = false) {
    if (typeof stopTicketsListener === 'function') {
        stopTicketsListener();
    }
    if (typeof stopPendingNotificationsListener === 'function') {
        stopPendingNotificationsListener();
    }
    if (typeof stopWertguthabenListener === 'function') {
        stopWertguthabenListener();
    }
    if (typeof stopLizenzenListener === 'function') {
        stopLizenzenListener();
    }
    if (typeof stopApprovalRequestsListener === 'function') {
        stopApprovalRequestsListener();
    }
    if (typeof stopVertragsverwaltungListeners === 'function') {
        stopVertragsverwaltungListeners();
    }
    if (typeof stopHaushaltszahlungenListeners === 'function') {
        stopHaushaltszahlungenListeners();
    }
    if (typeof stopGeschenkemanagementListeners === 'function') {
        stopGeschenkemanagementListeners();
    }
    if (typeof stopSendungsverwaltungListeners === 'function') {
        stopSendungsverwaltungListeners();
    }
    if (typeof stopNotizenListeners === 'function') {
        stopNotizenListeners();
    }
    if (typeof stopMitarbeiterkarteListeners === 'function') {
        stopMitarbeiterkarteListeners();
    }

    if (resetMode) {
        lastUserDependentListenerMode = null;
    }
}

function startGlobalListeners() {
    if (globalListenersStarted) return;
    globalListenersStarted = true;

    try {
        console.log("initializeFirebase: Starte globale Daten-Listener...");

        onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                adminSettings = docSnap.data();
            } else {
                console.warn("Firebase App Settings Document 'main' not found.");
                adminSettings = {};
            }
        }, (error) => {
            console.error("Error listening to settings:", error);
        });

        onSnapshot(notrufSettingsDocRef, (docSnap) => {
            if (docSnap.exists()) {
                notrufSettings = docSnap.data();
                if (!notrufSettings.modes) notrufSettings.modes = [];
                if (!notrufSettings.contacts) notrufSettings.contacts = [];
                if (!notrufSettings.apiTokens) notrufSettings.apiTokens = [];
                if (!notrufSettings.sounds) notrufSettings.sounds = [];
                if (!notrufSettings.flicAssignments) notrufSettings.flicAssignments = { einfach: null, doppel: null, halten: null };
            } else {
                console.warn("Firebase Notruf Settings Document 'notruf' not found, creating default.");
                notrufSettings = { modes: [], contacts: [], apiTokens: [], sounds: [], flicAssignments: { einfach: null, doppel: null, halten: null } };
            }

            updatePushmailCenterAttentionState(false).catch((e) => {
                console.warn('PushmailCenter: Attention-State konnte nicht aktualisiert werden (notrufSettings).', e);
            });
        }, (error) => {
            console.error("Error listening to notruf settings:", error);
        });

        listenForRoleUpdates();
        listenForAdminRoleUpdates();
        listenForUserUpdates();
        listenForChecklists();
        listenForChecklistItems();
        listenForChecklistGroups();
        listenForChecklistCategories();
        listenForTemplates();
        listenForStacks();
    } catch (error) {
        console.error("initializeFirebase: FEHLER beim Starten globaler Listener:", error);
        alertUser("Fehler beim Initialisieren der globalen Daten-Listener.", "error");
    }
}

function startUserDependentListeners() {
    const mode = currentUser?.mode || GUEST_MODE;
    if (lastUserDependentListenerMode === mode) return;
    lastUserDependentListenerMode = mode;

    pushoverProgramConfigCache = {};
    pushoverRecipientGrantCache = {};
    pushoverSelectedRecipientId = null;

    lastPushmailCenterNeedsUserKey = false;
    lastPushmailCenterNeedsApiTokens = false;
    resetPushmailOpenAlerts();

    stopAllUserDependentListeners(false);

    updatePushmailCenterAttentionState(false).catch((e) => {
        console.warn('PushmailCenter: Attention-State konnte nicht aktualisiert werden (User-Mode).', e);
    });

    console.log("initializeFirebase: Starte user-abhängige Listener für Mode:", mode);

    if (typeof listenForPublicVotes === 'function') {
        listenForPublicVotes();
    } else {
        console.error("Fehler: listenForPublicVotes ist nicht importiert!");
    }

    if (mode === GUEST_MODE) {
        return;
    }

    if (typeof listenForApprovalRequests === 'function') {
        listenForApprovalRequests();
    } else {
        console.error("Fehler: listenForApprovalRequests ist nicht importiert!");
    }

    if (typeof listenForTickets === 'function') {
        listenForTickets();
    } else {
        console.error("Fehler: listenForTickets ist nicht importiert!");
    }

    if (typeof listenForWertguthaben === 'function') {
        listenForWertguthaben();
    } else {
        console.error("Fehler: listenForWertguthaben ist nicht importiert!");
    }

    if (typeof listenForLizenzen === 'function') {
        listenForLizenzen();
    } else {
        console.error("Fehler: listenForLizenzen ist nicht importiert!");
    }

    if (typeof listenForHaushaltszahlungen === 'function') {
        listenForHaushaltszahlungen();
    } else {
        console.error("Fehler: listenForHaushaltszahlungen ist nicht importiert!");
    }

    if (typeof listenForVertraege === 'function') {
        listenForVertraege();
    } else {
        console.error("Fehler: listenForVertraege ist nicht importiert!");
    }

    if (typeof listenForGeschenke === 'function') {
        listenForGeschenke();
    } else {
        console.error("Fehler: listenForGeschenke ist nicht importiert!");
    }

    if (typeof listenForSendungen === 'function') {
        listenForSendungen();
    } else {
        console.error("Fehler: listenForSendungen ist nicht importiert!");
    }

    const maKarteView = document.getElementById('maKarteView');
    if (maKarteView && maKarteView.classList.contains('active')) {
        initializeMitarbeiterkarte();
    }
}

export let currentMeal = (() => {
    // Versuche, eine gespeicherte Mahlzeit aus dem sessionStorage zu laden
    try {
        const savedMeal = sessionStorage.getItem('currentMealData');
        if (savedMeal) {
            console.log("Gespeicherte Mahlzeit aus session-Storage geladen.");
            return JSON.parse(savedMeal); // Lade den gespeicherten Stand
        }
    } catch (e) {
        console.error("Fehler beim Laden der Mahlzeit aus sessionStorage:", e);
        sessionStorage.removeItem('currentMealData');
    }

    // Wenn nichts gefunden wurde, starte mit einer leeren Mahlzeit
    return {
        name: '',
        singleProducts: [], // { id, name, weight }
        recipes: [],        // { id, name, ingredients: [{...}] }
        userInputDistribution: [], // { id, portionName, personId, personName, anzahl, productInputs: [{productId, mode, value}] }
        calculateRest: false,
        finalDistribution: []
    };
})(); // Die Funktion wird sofort ausgeführt und gibt das Objekt zurück

export let notrufSettings = {
    modes: [],
    contacts: [],
    flicAssignments: { einfach: null, doppel: null, halten: null },
    apiTokens: [],
    sounds: []
};

export let currentUser = {
    mode: GUEST_MODE,
    displayName: GUEST_MODE,
    permissions: [],
    role: null
};
// ENDE-ZIKA //

export const COLOR_PALETTE = {
    gray: { name: 'Grau', bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-400' },
    red: { name: 'Rot', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-500' },
    orange: { name: 'Orange', bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-500' },
    amber: { name: 'Bernstein', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-500' },
    yellow: { name: 'Gelb', bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500' },
    lime: { name: 'Limette', bg: 'bg-lime-100', text: 'text-lime-800', border: 'border-lime-500' },
    green: { name: 'Grün', bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-500' },
    emerald: { name: 'Smaragd', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-500' },
    teal: { name: 'Türkis', bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-500' },
    cyan: { name: 'Cyan', bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-500' },
    sky: { name: 'Himmelblau', bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-500' },
    blue: { name: 'Blau', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-500' },
    indigo: { name: 'Indigo', bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-500' },
    violet: { name: 'Violett', bg: 'bg-violet-100', text: 'text-violet-800', border: 'border-violet-500' },
    purple: { name: 'Lila', bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-500' },
    fuchsia: { name: 'Fuchsia', bg: 'bg-fuchsia-100', text: 'text-fuchsia-800', border: 'border-fuchsia-500' },
    pink: { name: 'Pink', bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-500' },
    rose: { name: 'Rose', bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-500' },
};

export const USER_COLORS = {
    ADMIN: ['bg-red-600', 'hover:bg-red-700'],
    SYSTEMADMIN: ['bg-purple-800', 'hover:bg-purple-900'],
    DEFAULT: ['bg-indigo-600', 'hover:bg-indigo-700']
};



window.onload = function () {
    // KORREKTUR: Kein 'const' mehr für diese Variablen, damit sie global gespeichert werden!
    modalUserButtons = document.getElementById('modalUserButtons');
    /* const distributionList... (nicht global benötigt) */
    appHeader = document.getElementById('appHeader'); // Global
    /* const footerModeHandler... */

    userSelectionModal = document.getElementById('userSelectionModal'); // Global
    pinModal = document.getElementById('pinModal');
    pinModalTitle = document.getElementById('pinModalTitle'); // Global
    adminPinInput = document.getElementById('adminPinInput');
    pinError = document.getElementById('pinError');

    const mainSettingsButton = document.getElementById('mainSettingsButton');
    const adminRightsSection = document.getElementById('adminRightsSection');
    adminRightsToggle = document.getElementById('adminRightsToggle');
    submitAdminKeyButton = document.getElementById('submitAdminKeyButton');

    // Admin Toggles (Global machen)
    roleSettingsToggle = document.getElementById('roleSettingsToggle');
    passwordSettingsToggle = document.getElementById('passwordSettingsToggle');
    userManagementToggle = document.getElementById('userManagementToggle');
    approvalProcessToggle = document.getElementById('approvalProcessToggle');
    protocolHistoryToggle = document.getElementById('protocolHistoryToggle');
    mainFunctionsToggle = document.getElementById('mainFunctionsToggle');

    // Lokale Variablen (bleiben const, da nur hier genutzt oder nicht rot waren)
    const adminRightsArea = document.getElementById('adminRightsArea');
    const roleManagementSection = document.getElementById('roleManagementSection');
    const roleManagementArea = document.getElementById('roleManagementArea');
    const passwordSection = document.getElementById('passwordSection');
    const passwordManagementArea = document.getElementById('passwordManagementArea');
    const userSection = document.getElementById('userSection');
    const userManagementArea = document.getElementById('userManagementArea');
    const approvalProcessSection = document.getElementById('approvalProcessSection');
    const approvalProcessArea = document.getElementById('approvalProcessArea');
    const protocolHistorySection = document.getElementById('protocolHistorySection');
    const protocolHistoryArea = document.getElementById('protocolHistoryArea');
    const noAdminPermissionsPrompt = document.getElementById('noAdminPermissionsPrompt');
    const mainFunctionsSection = document.getElementById('mainFunctionsSection');
    const mainFunctionsArea = document.getElementById('mainFunctionsArea');
    const notrufView = document.getElementById('notrufSettingsView');

    const closeDeletedModalBtn = document.getElementById('closeDeletedListsModal');
    if (closeDeletedModalBtn) {
        closeDeletedModalBtn.addEventListener('click', () => {
            document.getElementById('deletedListsModal').style.display = 'none';
        });
    }

    setupEventListeners();
    initializeFirebase();
    if ('serviceWorker' in navigator) {
        try {
            navigator.serviceWorker.register('/sw.js');
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
};


// ERSETZE die komplette Funktion initializeFirebase in haupteingang.js
async function initializeFirebase() {
    try {
        console.log("initializeFirebase: Starte Firebase Initialisierung...");
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // --- Functions Initialisierung muss in onAuthStateChanged erfolgen ---

        console.log("initializeFirebase: Firebase App, DB, Auth initialisiert.");

        // --- DB Refs ---
        usersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'user-config');
        rolesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'user-roles');
        adminRolesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'admin-roles');
        roleChangeRequestsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'role-change-requests');
        auditLogCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'audit-log');
        settingsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'app-settings', 'main');
        notrufSettingsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'app-settings', 'notruf');
        checklistsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklists');
        checklistItemsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-items');
        checklistGroupsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-groups');
        checklistCategoriesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-categories');
        approvalRequestsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval-requests');
        checklistStacksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-stacks');
        checklistTemplatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates');
        // Diese Zeile MUSS hier sein
        votesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'votes');

        pushoverProgramsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'pushover_programs');
        pushoverGrantsBySenderCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'pushover_grants_by_sender');
        pushoverGrantsByRecipientCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'pushover_grants_by_recipient');


        console.log("initializeFirebase: Versuche anonyme Anmeldung...");
        try {
            const userCredential = await signInAnonymously(auth);
            console.log("initializeFirebase: Anonyme Anmeldung erfolgreich. User UID:", userCredential.user.uid);
        } catch (error) {
            console.error("initializeFirebase: FEHLER bei anonymer Anmeldung:", error);
        }


        console.log("initializeFirebase: Starte onAuthStateChanged Listener...");
        auth.onAuthStateChanged(async (user) => {
            console.log("initializeFirebase: onAuthStateChanged ausgelöst. User:", user ? user.uid : "keiner");

            // --- Functions Initialisierung HIER ---
            if (user && !window.firebaseFunctionsInitialised) {
                const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js");
                const functions = getFunctions(app);
                window.setRoleClaim = httpsCallable(functions, 'setRoleClaim');
                window.checkVoteToken = httpsCallable(functions, 'checkVoteToken');
                window.getGuestPayments = httpsCallable(functions, 'getGuestPayments');
                window.setUserKey = httpsCallable(functions, 'setUserKey');
                window.migrateUserKeysToSecrets = httpsCallable(functions, 'migrateUserKeysToSecrets');
                window.sendPasswordReset = httpsCallable(functions, 'sendPasswordReset');

                window.firebaseFunctionsInitialised = true;
                console.log("Firebase Functions initialisiert und global verfügbar gemacht.");
            }

            // Listener starten (unabhängig vom Login-Status)
            startGlobalListeners();

            // UI basierend auf User-Status aktualisieren
            if (user) {
                console.log("initializeFirebase: User (anonym) vorhanden. Rufe checkCurrentUserValidity auf.");
                await checkCurrentUserValidity();
                initialAuthCheckDone = true;
                initializeTerminplanerView();
                initializeZahlungsverwaltungView();
                initializeTicketSupport();
                initializeWertguthaben();
                initializeLizenzen();
                initializeVertragsverwaltung();
                initRezeptverwaltung();

                startUserDependentListeners();
                
                // Pushmail-Benachrichtigungen initialisieren
                initializePendingNotificationsModal();
                startPushmailScheduler();
                startPendingNotificationsListener(); // Echtzeit-Updates
                
                // Ausstehende Benachrichtigungen prüfen und Modal anzeigen
                setTimeout(() => {
                    checkAndShowPendingNotificationsModal();
                }, 2000);

            } else {
                console.log("Firebase meldet KEINEN User, wechsle explizit zum Gastmodus.");
                switchToGuestMode(false);
                initialAuthCheckDone = true;
                updateUIForMode();
                initializeTerminplanerView();
                initializeZahlungsverwaltungView();
                initializeTicketSupport();
                initializeWertguthaben();
                initializeLizenzen();
                initializeVertragsverwaltung();
                initRezeptverwaltung();

                startUserDependentListeners();
            }

            // =================================================================
            // URL-PRÜFUNG (KORRIGIERT: Lädt letzte Ansicht)
            // =================================================================
            let navigatedByUrl = false; // Merker, ob ein Link uns navigiert hat

            // Definiere die Variablen HIER oben, damit sie im gesamten Block verfügbar sind
            const urlParams = new URLSearchParams(window.location.search);
            const voteId = urlParams.get('vote_id');
            const voteToken = urlParams.get('vote_token');
            const view = urlParams.get('view');
            const guestId = urlParams.get('guest_id');

            try {
                const isUrlClean = !voteId && !voteToken && !view && !guestId;

                if (!isUrlClean) {
                    navigatedByUrl = true; // Ein Link wurde verwendet

                    if (voteId && guestId) {
                        // Fall 1: Wichtigster Fall - Ein Gast-per-Link (Terminplaner)
                        console.log("[P3] URL-Parameter 'vote_id' UND 'guest_id' gefunden, starte joinVoteAsGuest...");
                        await joinVoteAsGuest(voteId, guestId);

                    } else if (voteId) {
                        // Fall 2: Normaler Beitritt per ID
                        console.log("URL-Parameter 'vote_id' gefunden, starte joinVoteById...");
                        await joinVoteById(voteId);

                    } else if (voteToken) {
                        // Fall 3: Normaler Beitritt per Token
                        console.log("URL-Parameter 'vote_token' gefunden, starte joinVoteByToken...");
                        await joinVoteByToken(voteToken);

                    } else if (view === 'terminplaner') {
                        // Fall 4: Navigation zur Ansicht
                        console.log("URL-Parameter 'view=terminplaner' gefunden, navigiere...");
                        navigate('terminplaner');
                        cleanUrlParams();
                    }
                }
            } catch (e) {
                console.error("Fehler bei der URL-Parameter-Prüfung:", e);
            }

            // =================================================================
            // START KORREKTUR (Letzte Ansicht wiederherstellen)
            // =================================================================
            // Wenn wir NICHT über einen Link gekommen sind, versuchen wir, die letzte Ansicht zu laden
            if (!navigatedByUrl && sessionStorage) {
                const lastView = sessionStorage.getItem('lastActiveView');
                // Stelle die Ansicht nur wieder her, wenn es nicht die Startseite ist
                // und die Ansicht in unserer Liste bekannt ist.
                if (lastView && lastView !== 'home' && views[lastView]) {
                    console.log(`Letzte Ansicht [${lastView}] aus sessionStorage wiederhergestellt.`);
                    navigate(lastView);
                }
            }
            // =================================================================
            // ENDE KORREKTUR
            // =================================================================


            // --- URL PRÜFUNG (ZAHLUNGSVERWALTUNG GAST LINK) ---
            // HIER WAR DER BUG: Es wurde nur auf guestId geprüft.
            // FIX: Wir prüfen, ob guestId da ist UND KEIN voteId da ist.

            if (guestId && !voteId) {
                console.log("Gast-Link (Zahlungsverwaltung) erkannt! Starte Gast-Ansicht...");
                // Wir importieren die Funktion dynamisch, um Zyklen zu vermeiden oder rufen sie direkt auf wenn verfügbar
                import('./zahlungsverwaltung.js').then(module => {
                    // Verstecke alles andere
                    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
                    document.getElementById('appHeader').style.display = 'none';
                    document.getElementById('appFooter').style.display = 'none';

                    // Starte Gast Modus der Zahlungsverwaltung
                    module.initializeGuestView(guestId);
                });
            }

        }); // Ende onAuthStateChanged
    } catch (error) {
        console.error("initializeFirebase: FEHLER bei der grundlegenden Firebase Initialisierung:", error);
        alertUser("Firebase konnte nicht initialisiert werden.", "error");
    }
}







// --- HIER ENDET DIE FUNKTION ZUM ERSETZEN ---
async function seedInitialData() {
    try {
        // --- 1. Rollenprüfung und -erstellung ---
        const rolesSnapshot = await getDocs(rolesCollectionRef);
        if (rolesSnapshot.empty) {
            const batch = writeBatch(db);
            const defaultRoles = {
                SYSTEMADMIN: { name: 'Systemadmin', permissions: ['ENTRANCE', 'PUSHOVER', 'CHECKLIST', 'CHECKLIST_SWITCH', 'CHECKLIST_SETTINGS', 'ESSENSBERECHNUNG', 'TOOLS', 'ZAHLUNGSVERWALTUNG', 'TICKET_SUPPORT', 'WERTGUTHABEN', 'VERTRAGSVERWALTUNG', 'REZEPTE'], deletable: false },
                ADMIN: { name: 'Admin', permissions: ['ENTRANCE', 'PUSHOVER', 'TICKET_SUPPORT', 'WERTGUTHABEN', 'VERTRAGSVERWALTUNG', 'REZEPTE'], deletable: false },
                ANGEMELDET: { name: 'Angemeldet', permissions: ['ENTRANCE', 'TICKET_SUPPORT', 'WERTGUTHABEN', 'VERTRAGSVERWALTUNG', 'REZEPTE'], deletable: true },
                NO_RIGHTS: { name: '- Keine Rechte -', permissions: [], deletable: false }
            };
            Object.keys(defaultRoles).forEach(roleId => batch.set(doc(rolesCollectionRef, roleId), defaultRoles[roleId]));
            await batch.commit();
        } else {
            // Stellt sicher, dass die neue Rolle auch bei bestehenden Installationen hinzugefügt wird
            const noRightsDoc = doc(rolesCollectionRef, 'NO_RIGHTS');
            const noRightsSnap = await getDoc(noRightsDoc);
            if (!noRightsSnap.exists()) {
                await setDoc(noRightsDoc, { name: '- Keine Rechte -', permissions: [], deletable: false });
            }

            const systemAdminRoleDoc = doc(rolesCollectionRef, 'SYSTEMADMIN');
            const systemAdminRoleSnap = await getDoc(systemAdminRoleDoc);
            if (systemAdminRoleSnap.exists()) {
                const roleData = systemAdminRoleSnap.data() || {};
                const rolePerms = Array.isArray(roleData.permissions) ? roleData.permissions : [];
                if (!rolePerms.includes('TOOLS')) {
                    await updateDoc(systemAdminRoleDoc, { permissions: [...rolePerms, 'TOOLS'] });
                }
            }
        }

        // --- 2. Admin-Rollenprüfung und -erstellung ---
        const adminRolesSnapshot = await getDocs(adminRolesCollectionRef);
        const emptyRoleDoc = doc(adminRolesCollectionRef, 'LEERE_ROLLE');
        const emptyRoleSnapshot = await getDoc(emptyRoleDoc);
        if (!emptyRoleSnapshot.exists()) {
            await setDoc(emptyRoleDoc, { name: '** Leere Rolle**', permissions: {}, deletable: false });
        }

        // --- 3. Benutzerprüfung und -erstellung ---
        const usersSnapshot = await getDocs(usersCollectionRef);
        if (usersSnapshot.empty) {
            await setDoc(doc(usersCollectionRef, 'SYSTEMADMIN'), { name: 'Systemadmin', key: 'top2sys', role: 'SYSTEMADMIN', isActive: true });
        }
    } catch (error) {
        console.error("SCHWERER FEHLER in seedInitialData (Datenbank-Setup):", error);
        throw error;
    }
}

export function alertUser(message, type) {
    let duration = 3000;
    let colorClass = 'bg-green-600';

    if (type === 'error') {
        colorClass = 'bg-red-600';
        duration = 3000;
    } else if (type === 'error_long') {
        colorClass = 'bg-red-600';
        duration = 9000;
    } else if (type === 'success') {
        colorClass = 'bg-green-600';
        duration = 3000;
    } else if (type === 'info') {
        colorClass = 'bg-blue-600'; // Info Typ ergänzt
        duration = 4000;
    }

    const tempAlert = document.createElement('div');
    tempAlert.textContent = message;

    // --- FIX: z-[100] sorgt dafür, dass es ÜBER den Modals (z-50 bis z-80) liegt ---
    tempAlert.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-4 rounded-xl text-white font-bold shadow-2xl transition-opacity duration-300 z-[100] text-center ${colorClass} border-2 border-white/20`;

    document.body.appendChild(tempAlert);

    // Animation starten
    requestAnimationFrame(() => {
        tempAlert.style.opacity = '1';
    });

    setTimeout(() => {
        tempAlert.style.opacity = '0';
        setTimeout(() => tempAlert.remove(), 300);
    }, duration);
}


// HINZUFÜGEN zu haupteingang.js (z.B. nach der alertUser Funktion)
export function cleanUrlParams() {
    try {
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        console.log("URL-Parameter aufgeräumt.");
    } catch (e) {
        console.warn("URL konnte nicht aufgeräumt werden:", e);
    }
}

export function setButtonLoading(button, isLoading) {
    const text = button.querySelector('.button-text');
    const spinner = button.querySelector('.loading-spinner');
    button.disabled = isLoading;
    if (text) text.style.display = isLoading ? 'none' : 'inline-block';
    if (spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
}

function maskPushmailSecret(value) {
    const s = String(value || '').trim();
    if (!s) return '—';
    const start = s.substring(0, 4);
    const end = s.substring(Math.max(0, s.length - 4));
    return `${start}...${end}`;
}

let lastPushmailCenterAttentionState = null;

let pushmailOpenAlerts = {};
let lastPushmailCenterNeedsUserKey = false;
let lastPushmailCenterNeedsApiTokens = false;

function getPushmailOpenAlertCount() {
    return Object.values(pushmailOpenAlerts).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function getPushmailHasOpenAlerts() {
    return Object.values(pushmailOpenAlerts).some(v => (Number(v) || 0) > 0);
}

function applyPushmailCenterAttentionUIFromCache() {
    const isLoggedIn = Boolean(currentUser?.mode && currentUser.mode !== GUEST_MODE);
    const hasDb = Boolean(pushoverProgramsCollectionRef);
    if (!isLoggedIn || !hasDb) {
        setPushmailCenterAttentionUI(false, false, false);
        return;
    }

    const hasOpenAlerts = getPushmailHasOpenAlerts();
    setPushmailCenterAttentionUI(lastPushmailCenterNeedsUserKey, lastPushmailCenterNeedsApiTokens, hasOpenAlerts);
}

function resetPushmailOpenAlerts() {
    pushmailOpenAlerts = {};
    applyPushmailCenterAttentionUIFromCache();
}

export function setPushmailOpenAlert(sourceKey, alertValue) {
    if (!sourceKey) return;

    const isLoggedIn = Boolean(currentUser?.mode && currentUser.mode !== GUEST_MODE);
    if (!isLoggedIn) return;

    const normalizedValue = typeof alertValue === 'number'
        ? alertValue
        : (Boolean(alertValue) ? 1 : 0);
    const prevValue = Number(pushmailOpenAlerts[sourceKey] || 0);
    if (prevValue === normalizedValue) return;

    if (normalizedValue > 0) {
        pushmailOpenAlerts[sourceKey] = normalizedValue;
    } else {
        delete pushmailOpenAlerts[sourceKey];
    }

    console.log('PushmailCenter: Open-Alerts', { sourceKey, value: normalizedValue, total: getPushmailOpenAlertCount() });
    applyPushmailCenterAttentionUIFromCache();
}

function setPushmailCenterAttentionUI(needsUserKey, needsApiTokens, hasOpenAlerts) {
    const stateKey = `${needsUserKey ? '1' : '0'}-${needsApiTokens ? '1' : '0'}-${hasOpenAlerts ? '1' : '0'}`;
    if (stateKey !== lastPushmailCenterAttentionState) {
        console.log('PushmailCenter: Attention-State', { needsUserKey, needsApiTokens, hasOpenAlerts });
        lastPushmailCenterAttentionState = stateKey;
    }

    const bar = document.getElementById('pushmailCenterBar');
    const userKeyCard = document.getElementById('pushmailReloadPushoverConfigButton')?.closest('.card');
    const tokenCard = document.getElementById('pushmailOpenApiTokenBookButton')?.closest('.card');

    const needsBarAttention = Boolean(needsUserKey || needsApiTokens || hasOpenAlerts);

    if (bar) {
        bar.classList.toggle('pushmail-siren', needsBarAttention);
        bar.classList.toggle('animate-pulse', needsBarAttention);
        bar.classList.toggle('ring-2', needsBarAttention);
        bar.classList.toggle('ring-fuchsia-400', needsBarAttention);
        bar.classList.toggle('ring-offset-2', needsBarAttention);
        bar.classList.remove('bg-fuchsia-100', 'border-fuchsia-500');
    }

    if (userKeyCard) {
        userKeyCard.classList.toggle('animate-pulse', Boolean(needsUserKey));
        userKeyCard.classList.toggle('ring-2', Boolean(needsUserKey));
        userKeyCard.classList.toggle('ring-blue-400', Boolean(needsUserKey));
        userKeyCard.classList.toggle('ring-offset-2', Boolean(needsUserKey));
    }

    if (tokenCard) {
        tokenCard.classList.toggle('animate-pulse', Boolean(needsApiTokens));
        tokenCard.classList.toggle('ring-2', Boolean(needsApiTokens));
        tokenCard.classList.toggle('ring-indigo-400', Boolean(needsApiTokens));
        tokenCard.classList.toggle('ring-offset-2', Boolean(needsApiTokens));
    }
}

async function updatePushmailCenterAttentionState(forceReload = false, cfgOverride = undefined) {
    const isLoggedIn = Boolean(currentUser?.mode && currentUser.mode !== GUEST_MODE);
    const hasDb = Boolean(pushoverProgramsCollectionRef);

    if (!isLoggedIn || !hasDb) {
        lastPushmailCenterNeedsUserKey = false;
        lastPushmailCenterNeedsApiTokens = false;
        setPushmailCenterAttentionUI(false, false, false);
        return;
    }

    const hasApiTokens = Array.isArray(notrufSettings?.apiTokens) && notrufSettings.apiTokens.length > 0;
    const hasOpenAlerts = getPushmailHasOpenAlerts();

    const cfg = typeof cfgOverride !== 'undefined'
        ? cfgOverride
        : await loadPushmailPushoverProgramConfig(currentUser.mode, forceReload);
    const hasUserKey = Boolean(String(cfg?.userKey || '').trim());

    lastPushmailCenterNeedsUserKey = !hasUserKey;
    lastPushmailCenterNeedsApiTokens = !hasApiTokens;
    setPushmailCenterAttentionUI(lastPushmailCenterNeedsUserKey, lastPushmailCenterNeedsApiTokens, hasOpenAlerts);
}

function setPushmailPushoverStatus(msg, show = true) {
    const el = document.getElementById('pushmailPushoverStatus');
    if (!el) return;
    if (!show) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
}

const loadPushmailPushoverProgramConfig = async (recipientId, forceReload = false) => {
    if (!recipientId) return null;

    if (!forceReload && pushoverProgramConfigCache && Object.prototype.hasOwnProperty.call(pushoverProgramConfigCache, recipientId)) {
        return pushoverProgramConfigCache[recipientId];
    }

    if (!pushoverProgramsCollectionRef) return null;

    try {
        console.log('PushmailCenter: Lade Pushover Konfiguration für Empfänger:', recipientId);
        const docRef = doc(pushoverProgramsCollectionRef, recipientId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
            pushoverProgramConfigCache[recipientId] = null;
            return null;
        }
        const cfg = snap.data() || {};
        pushoverProgramConfigCache[recipientId] = cfg;
        return cfg;
    } catch (e) {
        console.error('PushmailCenter: Fehler beim Laden der Konfiguration:', e);
        return null;
    }
};

const checkPendingUserKeyChangeRequest = async (userId) => {
    if (!db || !userId) return false;
    
    try {
        const requestsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'pushover_userkey_change_requests');
        const q = query(requestsCollection, where('userId', '==', userId), where('status', '==', 'pending'));
        const snapshot = await getDocs(q);
        return !snapshot.empty;
    } catch (error) {
        console.error('Fehler beim Prüfen auf pending Anfragen:', error);
        return false;
    }
};

const refreshPushmailCenterPushoverUI = async (forceReload = false) => {
    const apiTokenPreview = document.getElementById('pushmailPushoverApiTokenPreview');
    const userKeyPreview = document.getElementById('pushmailPushoverUserKeyPreview');
    const userKeyInput = document.getElementById('pushmailPushoverUserKeyInput');
    const saveBtn = document.getElementById('pushmailSavePushoverUserKeyButton');

    if (!apiTokenPreview || !userKeyPreview) return;

    const isLoggedIn = Boolean(currentUser?.mode && currentUser.mode !== GUEST_MODE);
    const hasDb = Boolean(pushoverProgramsCollectionRef);

    if (userKeyInput) userKeyInput.disabled = !(isLoggedIn && hasDb);
    if (saveBtn) saveBtn.disabled = !(isLoggedIn && hasDb);

    if (!isLoggedIn) {
        apiTokenPreview.textContent = '—';
        userKeyPreview.textContent = '—';
        if (userKeyInput) userKeyInput.value = '';
        setPushmailPushoverStatus('Bitte anmelden, um deine Pushover-Einstellungen zu laden.', true);

        updatePushmailCenterAttentionState(false).catch((e) => {
            console.warn('PushmailCenter: Attention-State konnte nicht aktualisiert werden (Guest).', e);
        });
        return;
    }

    if (!hasDb) {
        setPushmailPushoverStatus('Bitte warten... (Firebase lädt noch)', true);

        updatePushmailCenterAttentionState(false).catch((e) => {
            console.warn('PushmailCenter: Attention-State konnte nicht aktualisiert werden (kein DB).', e);
        });
        return;
    }

    const recipientId = currentUser.mode;
    const cfg = await loadPushmailPushoverProgramConfig(recipientId, forceReload);
    apiTokenPreview.textContent = maskPushmailSecret(PUSHOVER_API_TOKEN);
    userKeyPreview.textContent = maskPushmailSecret(cfg?.userKey);

    // Prüfen ob Daten vorhanden sind
    const hasApiTokens = true; // API-Token ist fest codiert
    const hasUserKey = Boolean(String(cfg?.userKey || '').trim());
    const hasData = hasUserKey && hasApiTokens;

    // UI-Zustand basierend auf User-Key Existenz
    const requestChangeBtn = document.getElementById('pushmailRequestUserKeyChangeButton');
    const hasPendingRequest = await checkPendingUserKeyChangeRequest(recipientId);
    
    if (hasUserKey) {
        // User-Key vorhanden: Input sperren, Save-Button ausblenden, Request-Button einblenden
        if (userKeyInput) {
            userKeyInput.disabled = true;
            userKeyInput.placeholder = 'User-Key bereits gesetzt (gesperrt)';
        }
        if (saveBtn) saveBtn.classList.add('hidden');
        if (requestChangeBtn) {
            requestChangeBtn.classList.remove('hidden');
            
            // Wenn bereits Anfrage läuft: Button deaktivieren und Text ändern
            if (hasPendingRequest) {
                requestChangeBtn.disabled = true;
                requestChangeBtn.textContent = 'Anfrage läuft';
                requestChangeBtn.classList.remove('bg-orange-600', 'hover:bg-orange-700');
                requestChangeBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
            } else {
                requestChangeBtn.disabled = false;
                requestChangeBtn.textContent = 'Änderung beantragen';
                requestChangeBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
                requestChangeBtn.classList.add('bg-orange-600', 'hover:bg-orange-700');
            }
        }
    } else {
        // Kein User-Key: Input freigeben, Save-Button einblenden, Request-Button ausblenden
        if (userKeyInput) {
            userKeyInput.disabled = false;
            userKeyInput.placeholder = 'User-Key eingeben (wird nicht angezeigt)';
        }
        if (saveBtn) saveBtn.classList.remove('hidden');
        if (requestChangeBtn) requestChangeBtn.classList.add('hidden');
    }

    if (cfg) {
        setPushmailPushoverStatus('Einstellungen geladen.', true);
    } else {
        setPushmailPushoverStatus('Noch keine Einstellungen gespeichert. Bitte User-Key setzen.', true);
    }

    // Zustandslogik: LEER = ausgeklappt + blinkend, GEFÜLLT = eingeklappt
    updatePushmailPushoverSettingsState(hasData);

    updatePushmailCenterAttentionState(false, cfg).catch((e) => {
        console.warn('PushmailCenter: Attention-State konnte nicht aktualisiert werden (UI Refresh).', e);
    });
};

const savePushmailCenterUserKey = async () => {
    const userKeyInput = document.getElementById('pushmailPushoverUserKeyInput');
    const saveBtn = document.getElementById('pushmailSavePushoverUserKeyButton');
    if (!userKeyInput || !saveBtn) return;

    if (!currentUser?.mode || currentUser.mode === GUEST_MODE) {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    if (!pushoverProgramsCollectionRef) {
        alertUser('Bitte warten... (Firebase lädt noch)', 'error');
        return;
    }

    const recipientId = currentUser.mode;
    const userKey = String(userKeyInput.value || '').trim();
    if (!userKey) {
        alertUser('Bitte einen User-Key eingeben.', 'error');
        return;
    }

    console.log('PushmailCenter: Speichere User-Key für:', recipientId);
    saveBtn.disabled = true;

    try {
        // API-Token ist fest codiert (gleich für alle User)
        const payload = { 
            userKey, 
            apiToken: PUSHOVER_API_TOKEN,
            updatedAt: serverTimestamp() 
        };
        await setDoc(doc(pushoverProgramsCollectionRef, recipientId), payload, { merge: true });

        const prev = pushoverProgramConfigCache && pushoverProgramConfigCache[recipientId] ? pushoverProgramConfigCache[recipientId] : {};
        pushoverProgramConfigCache[recipientId] = { ...prev, ...payload };

        userKeyInput.value = '';
        setPushmailPushoverStatus('User-Key gespeichert.', true);
        await refreshPushmailCenterPushoverUI(true);
        
        // Globale Kontaktliste automatisch aktualisieren
        if (typeof ensureNachrichtencenterSelfContact === 'function') {
            try {
                await ensureNachrichtencenterSelfContact();
                console.log('Pushmail: Globaler Kontakt automatisch synchronisiert');
            } catch (e) {
                console.warn('Pushmail: Globaler Kontakt konnte nicht synchronisiert werden:', e);
            }
        }
    } catch (e) {
        console.error('PushmailCenter: Fehler beim Speichern:', e);
        alertUser('Fehler beim Speichern. Bitte später erneut versuchen.', 'error');
    } finally {
        saveBtn.disabled = false;
    }
};

const requestPushmailUserKeyChange = async () => {
    if (!currentUser?.mode || currentUser.mode === GUEST_MODE) {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    if (!db) {
        alertUser('Bitte warten... (Firebase lädt noch)', 'error');
        return;
    }

    // Sicherheitsfrage
    const confirmed = confirm('Sicher Änderung beantragen?\n\nDeine Anfrage wird an einen Administrator gesendet. Nach Genehmigung kannst du einen neuen User-Key setzen.');
    if (!confirmed) {
        console.log('PushmailCenter: Änderungsanfrage abgebrochen');
        return;
    }

    const userId = currentUser.mode;
    const requestBtn = document.getElementById('pushmailRequestUserKeyChangeButton');
    if (requestBtn) requestBtn.disabled = true;

    try {
        const requestsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'pushover_userkey_change_requests');
        
        await addDoc(requestsCollection, {
            userId,
            userName: currentUser.name || userId,
            requestedAt: serverTimestamp(),
            status: 'pending',
            requestedBy: userId
        });

        alertUser('Änderungsanfrage erfolgreich gesendet. Ein Administrator wird deine Anfrage prüfen.', 'success');
        console.log('PushmailCenter: Änderungsanfrage erstellt für:', userId);
        
        // UI aktualisieren um Button-Status zu ändern
        await refreshPushmailCenterPushoverUI(true);
    } catch (e) {
        console.error('PushmailCenter: Fehler beim Erstellen der Änderungsanfrage:', e);
        alertUser('Fehler beim Senden der Anfrage. Bitte später erneut versuchen.', 'error');
    } finally {
        if (requestBtn) requestBtn.disabled = false;
    }
};

function getPushmailCenterProgramDefinitions() {
    return [
        { id: 'PUSHOVER', title: 'Push-Benachrichtigung', permission: 'PUSHOVER', border: 'border-red-500', text: 'text-red-600' },
        { id: 'ENTRANCE', title: 'Haupteingang öffnen', permission: 'ENTRANCE', border: 'border-indigo-500', text: 'text-indigo-600' },
        { id: 'CHECKLIST', title: 'Checkliste', permission: 'CHECKLIST', border: 'border-green-500', text: 'text-green-600' },
        { id: 'TERMINPLANER', title: 'Termin finden', permission: 'TERMINPLANER', border: 'border-cyan-500', text: 'text-cyan-600' },
        { id: 'ESSENSBERECHNUNG', title: 'Essensberechnung', permission: 'ESSENSBERECHNUNG', border: 'border-orange-500', text: 'text-orange-600' },
        { id: 'ZAHLUNGSVERWALTUNG', title: 'Zahlungsverwaltung', permission: 'ZAHLUNGSVERWALTUNG', border: 'border-emerald-600', text: 'text-emerald-700' },
        { id: 'TICKET_SUPPORT', title: 'Ticket-Support', permission: 'TICKET_SUPPORT', border: 'border-purple-600', text: 'text-purple-700' },
        { id: 'WERTGUTHABEN', title: 'Wertguthaben', permission: 'WERTGUTHABEN', border: 'border-emerald-600', text: 'text-emerald-700' },
        { id: 'LIZENZEN', title: 'Lizenzen', permission: 'LIZENZEN', border: 'border-yellow-600', text: 'text-yellow-700' },
        { id: 'VERTRAGSVERWALTUNG', title: 'Vertragsverwaltung', permission: 'VERTRAGSVERWALTUNG', border: 'border-indigo-600', text: 'text-indigo-700' },
        { id: 'REZEPTE', title: 'Rezepte', permission: 'REZEPTE', border: 'border-orange-500', text: 'text-orange-600' },
        { id: 'HAUSHALTSZAHLUNGEN', title: 'Haushaltszahlungen', permission: 'HAUSHALTSZAHLUNGEN', border: 'border-cyan-600', text: 'text-cyan-700' },
        { id: 'GESCHENKEMANAGEMENT', title: 'Geschenkemanagement', permission: 'GESCHENKEMANAGEMENT', border: 'border-pink-600', text: 'text-pink-700' },
        { id: 'APPROVALS', title: 'Genehmigungsprozess', adminPermission: 'canSeeApprovals', border: 'border-green-500', text: 'text-green-700' }
    ];
}

function getVisiblePushmailCenterPrograms() {
    const programs = getPushmailCenterProgramDefinitions();
    const isSysAdmin = currentUser?.role === 'SYSTEMADMIN';
    const userPermissions = currentUser?.permissions || [];
    const adminPerms = currentUser?.adminPermissions || {};

    return programs.filter(p => {
        if (isSysAdmin) return true;
        if (p.permission) return userPermissions.includes(p.permission);
        if (p.adminPermission) return Boolean(adminPerms[p.adminPermission]);
        return false;
    });
}

const PUSHMAIL_AUTO_SETTINGS_KEY = 'pushmail_auto_notifications';

function setPushmailAutoSettingsStatus(msg, show = true) {
    const el = document.getElementById('pushmailAutoSettingsStatus');
    if (!el) return;
    if (!show) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
    }
    el.textContent = msg;
    el.classList.remove('hidden');
}

function toPushmailAutoDomId(value) {
    return String(value || '').replace(/[^a-z0-9_-]/gi, '_');
}

function getDefaultPushmailAutoSettings(programs) {
    const programMap = {};
    (programs || []).forEach(p => {
        if (!p || !p.id) return;
        programMap[String(p.id)] = {
            state: 'active',
            time: '08:00',
            repeatMinutes: 0
        };
    });

    return {
        v: 1,
        globalEnabled: true,
        programs: programMap
    };
}

function normalizePushmailAutoSettings(raw, programs) {
    const defaults = getDefaultPushmailAutoSettings(programs);
    const parsed = raw && typeof raw === 'object' ? raw : {};

    const globalEnabled = parsed.globalEnabled === false ? false : true;
    const incomingPrograms = parsed.programs && typeof parsed.programs === 'object' ? parsed.programs : {};

    const normalizedPrograms = {};

    (programs || []).forEach(p => {
        const id = String(p.id);
        const fallback = defaults.programs[id] || { state: 'active', time: '08:00', repeatMinutes: 0 };
        const incoming = incomingPrograms[id] && typeof incomingPrograms[id] === 'object' ? incomingPrograms[id] : {};

        const allowedStates = ['active', 'paused', 'disabled'];
        const state = allowedStates.includes(String(incoming.state || '')) ? String(incoming.state) : fallback.state;

        const time = String(incoming.time || fallback.time || '').trim();
        const timeOk = /^\d{2}:\d{2}$/.test(time);

        const repeatMinutesRaw = parseInt(String(incoming.repeatMinutes ?? fallback.repeatMinutes), 10);
        const repeatMinutes = Number.isFinite(repeatMinutesRaw) && repeatMinutesRaw >= 0 ? repeatMinutesRaw : fallback.repeatMinutes;

        normalizedPrograms[id] = {
            state,
            time: timeOk ? time : fallback.time,
            repeatMinutes
        };
    });

    return {
        v: 1,
        globalEnabled,
        programs: normalizedPrograms
    };
}

function renderPushmailAutoPrograms(programs) {
    const container = document.getElementById('pushmailAutoProgramsContainer');
    if (!container) return;

    if (!Array.isArray(programs) || programs.length === 0) {
        container.innerHTML = '<p class="text-sm text-center text-gray-400">Keine Programme verfügbar.</p>';
        return;
    }

    container.innerHTML = programs.map(p => {
        const domId = toPushmailAutoDomId(p.id);

        return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200 border-l-4 ${p.border}">
                <div class="flex items-center gap-3">
                    <span class="font-semibold ${p.text}">${p.title}</span>
                    <select id="pushmailAutoState_${domId}" class="p-2 border rounded-lg bg-white text-sm">
                        <option value="active">aktiv</option>
                        <option value="paused">pausiert</option>
                        <option value="disabled">deaktiviert</option>
                    </select>
                </div>
                <div class="flex items-center gap-2 text-sm text-gray-600">
                    <input type="time" id="pushmailAutoTime_${domId}" class="p-1 border rounded bg-white text-sm w-20">
                    <select id="pushmailAutoRepeat_${domId}" class="p-1 border rounded bg-white text-sm">
                        <option value="0">Keine</option>
                        <option value="5">5min</option>
                        <option value="10">10min</option>
                        <option value="15">15min</option>
                        <option value="30">30min</option>
                        <option value="60">60min</option>
                    </select>
                </div>
            </div>
        `;
    }).join('');
}

function applyPushmailAutoSettingsToUI(settings, programs) {
    const globalToggle = document.getElementById('pushmailAutoGlobalEnabled');
    if (globalToggle) globalToggle.checked = settings?.globalEnabled === true;

    (programs || []).forEach(p => {
        const domId = toPushmailAutoDomId(p.id);
        const cfg = settings?.programs?.[String(p.id)] || {};

        const stateEl = document.getElementById(`pushmailAutoState_${domId}`);
        const timeEl = document.getElementById(`pushmailAutoTime_${domId}`);
        const repeatEl = document.getElementById(`pushmailAutoRepeat_${domId}`);

        if (stateEl) stateEl.value = String(cfg.state || 'active');
        if (timeEl) timeEl.value = String(cfg.time || '08:00');
        if (repeatEl) repeatEl.value = String(cfg.repeatMinutes ?? 0);
    });
}

function readPushmailAutoSettingsFromUI(programs) {
    const globalToggle = document.getElementById('pushmailAutoGlobalEnabled');
    const globalEnabled = globalToggle?.checked === true;

    const programMap = {};
    (programs || []).forEach(p => {
        const id = String(p.id);
        const domId = toPushmailAutoDomId(id);

        const stateEl = document.getElementById(`pushmailAutoState_${domId}`);
        const timeEl = document.getElementById(`pushmailAutoTime_${domId}`);
        const repeatEl = document.getElementById(`pushmailAutoRepeat_${domId}`);

        const stateRaw = String(stateEl?.value || 'active');
        const allowedStates = ['active', 'paused', 'disabled'];
        const state = allowedStates.includes(stateRaw) ? stateRaw : 'active';

        const time = String(timeEl?.value || '08:00').trim();
        const timeOk = /^\d{2}:\d{2}$/.test(time);

        const repeatMinutesRaw = parseInt(String(repeatEl?.value ?? 0), 10);
        const repeatMinutes = Number.isFinite(repeatMinutesRaw) && repeatMinutesRaw >= 0 ? repeatMinutesRaw : 0;

        programMap[id] = {
            state,
            time: timeOk ? time : '08:00',
            repeatMinutes
        };
    });

    return {
        v: 1,
        globalEnabled,
        programs: programMap
    };
}

function setPushmailAutoControlsDisabled(disabled) {
    const globalToggle = document.getElementById('pushmailAutoGlobalEnabled');
    const saveBtn = document.getElementById('pushmailAutoSaveButton');
    const resetBtn = document.getElementById('pushmailAutoResetButton');
    const container = document.getElementById('pushmailAutoProgramsContainer');

    if (globalToggle) globalToggle.disabled = disabled;
    if (saveBtn) saveBtn.disabled = disabled;
    if (resetBtn) resetBtn.disabled = disabled;

    if (container) {
        container.querySelectorAll('select, input').forEach(el => {
            el.disabled = disabled;
        });
    }
}

function resetPushmailAutoSettingsUI() {
    const programs = getVisiblePushmailCenterPrograms();
    const defaults = getDefaultPushmailAutoSettings(programs);
    applyPushmailAutoSettingsToUI(defaults, programs);
    console.log('PushmailCenter: Auto-Settings auf Standard gesetzt (noch nicht gespeichert)');
    setPushmailAutoSettingsStatus('Standardwerte geladen. Bitte Speichern drücken.', true);
}

async function savePushmailAutoSettings() {
    if (!currentUser?.mode || currentUser.mode === GUEST_MODE) {
        alertUser('Bitte anmelden.', 'error');
        return;
    }

    const programs = getVisiblePushmailCenterPrograms();
    const raw = readPushmailAutoSettingsFromUI(programs);
    const payload = normalizePushmailAutoSettings(raw, programs);

    console.log('PushmailCenter: Speichere Auto-Settings', payload);
    await saveUserSetting(PUSHMAIL_AUTO_SETTINGS_KEY, payload);
    setPushmailAutoSettingsStatus('Einstellungen gespeichert.', true);
}

function initializePushmailAutoSettingsArea() {
    const container = document.getElementById('pushmailAutoProgramsContainer');
    if (!container) return;

    const isLoggedIn = Boolean(currentUser?.mode && currentUser.mode !== GUEST_MODE);
    const programs = getVisiblePushmailCenterPrograms();

    renderPushmailAutoPrograms(programs);

    const raw = isLoggedIn ? getUserSetting(PUSHMAIL_AUTO_SETTINGS_KEY, null) : null;
    const normalized = normalizePushmailAutoSettings(raw, programs);
    applyPushmailAutoSettingsToUI(normalized, programs);

    setPushmailAutoControlsDisabled(!isLoggedIn);

    if (isLoggedIn) {
        setPushmailAutoSettingsStatus('Einstellungen geladen.', true);
    } else {
        setPushmailAutoSettingsStatus('Bitte anmelden, um Einstellungen zu speichern.', true);
    }

    console.log('PushmailCenter: Auto-Settings UI initialisiert');
}

function ensurePushmailCenterListeners() {
    const saveBtn = document.getElementById('pushmailSavePushoverUserKeyButton');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', async () => {
            await savePushmailCenterUserKey();
        });
        saveBtn.dataset.listenerAttached = 'true';
    }

    const contactBookBtn = document.getElementById('pushmailOpenNachrichtencenterContactBookButton');
    if (contactBookBtn && !contactBookBtn.dataset.listenerAttached) {
        contactBookBtn.addEventListener('click', () => {
            if (!currentUser?.mode || currentUser.mode === GUEST_MODE) {
                alertUser('Bitte anmelden.', 'error');
                return;
            }
            if (!auth || !auth.currentUser) {
                alertUser('Bitte kurz warten... (Login lädt noch)', 'error');
                return;
            }

            try { ensureModalListeners(); } catch (e) { console.warn('PushmailCenter: ensureModalListeners fehlgeschlagen:', e); }
            console.log('PushmailCenter: Öffne Nachrichtencenter Kontaktbuch');
            openNachrichtencenterContactBook();
        });
        contactBookBtn.dataset.listenerAttached = 'true';
    }

    const tokenBookBtn = document.getElementById('pushmailOpenApiTokenBookButton');
    if (tokenBookBtn && !tokenBookBtn.dataset.listenerAttached) {
        tokenBookBtn.addEventListener('click', () => {
            try { ensureModalListeners(); } catch (e) { console.warn('PushmailCenter: ensureModalListeners fehlgeschlagen:', e); }
            console.log('PushmailCenter: Öffne API-Token Book');
            if (typeof renderApiTokenBook === 'function') renderApiTokenBook();
            const modal = document.getElementById('apiTokenBookModal');
            if (modal) modal.style.display = 'flex';
        });
        tokenBookBtn.dataset.listenerAttached = 'true';
    }

    const autoSaveBtn = document.getElementById('pushmailAutoSaveButton');
    if (autoSaveBtn && !autoSaveBtn.dataset.listenerAttached) {
        autoSaveBtn.addEventListener('click', async () => {
            await savePushmailAutoSettings();
        });
        autoSaveBtn.dataset.listenerAttached = 'true';
    }

    const autoResetBtn = document.getElementById('pushmailAutoResetButton');
    if (autoResetBtn && !autoResetBtn.dataset.listenerAttached) {
        autoResetBtn.addEventListener('click', () => {
            resetPushmailAutoSettingsUI();
        });
        autoResetBtn.dataset.listenerAttached = 'true';
    }

    const autoGlobalToggle = document.getElementById('pushmailAutoGlobalEnabled');
    if (autoGlobalToggle && !autoGlobalToggle.dataset.listenerAttached) {
        autoGlobalToggle.addEventListener('change', () => {
            console.log('PushmailCenter: Auto-Settings Global geändert:', autoGlobalToggle.checked);
        });
        autoGlobalToggle.dataset.listenerAttached = 'true';
    }

    const settingsHeader = document.getElementById('pushmailPushoverSettingsHeader');
    if (settingsHeader && !settingsHeader.dataset.listenerAttached) {
        settingsHeader.addEventListener('click', () => {
            togglePushmailPushoverSettings();
        });
        settingsHeader.dataset.listenerAttached = 'true';
    }

    const requestChangeBtn = document.getElementById('pushmailRequestUserKeyChangeButton');
    if (requestChangeBtn && !requestChangeBtn.dataset.listenerAttached) {
        requestChangeBtn.addEventListener('click', async () => {
            await requestPushmailUserKeyChange();
        });
        requestChangeBtn.dataset.listenerAttached = 'true';
    }
}

function togglePushmailPushoverSettings() {
    const content = document.getElementById('pushmailPushoverSettingsContent');
    const chevron = document.getElementById('pushmailPushoverSettingsChevron');
    
    if (!content || !chevron) return;
    
    const isCollapsed = content.classList.contains('hidden');
    
    if (isCollapsed) {
        content.classList.remove('hidden');
        chevron.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('hidden');
        chevron.style.transform = 'rotate(-90deg)';
    }
    
    console.log('PushmailCenter: Pushover-Einstellungen', isCollapsed ? 'ausgeklappt' : 'eingeklappt');
}

function updatePushmailPushoverSettingsState(hasData) {
    const content = document.getElementById('pushmailPushoverSettingsContent');
    const chevron = document.getElementById('pushmailPushoverSettingsChevron');
    const card = document.getElementById('pushmailPushoverSettingsCard');
    
    if (!content || !chevron || !card) return;
    
    if (hasData) {
        // GEFÜLLT: Eingeklappt, kein Blinken
        content.classList.add('hidden');
        chevron.style.transform = 'rotate(-90deg)';
        card.classList.remove('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2');
        console.log('PushmailCenter: Pushover-Einstellungen GEFÜLLT → eingeklappt');
    } else {
        // LEER: Ausgeklappt + rot blinkend
        content.classList.remove('hidden');
        chevron.style.transform = 'rotate(0deg)';
        card.classList.add('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2');
        console.log('PushmailCenter: Pushover-Einstellungen LEER → ausgeklappt + blinkend');
    }
}

function initializePushmailCenterView() {
    console.log('PushmailCenter: Initialisierung startet');
    ensurePushmailCenterListeners();
    initializePushmailAutoSettingsArea();
    refreshPushmailCenterPushoverUI();
    renderPendingNotifications();
    initializePushmailSettingsUI();
    // Automatisch Haushaltszahlungen-Checks triggern, damit Benachrichtigungen auch ohne Seitenbesuch entstehen
    if (typeof checkHaushaltszahlungenForNotifications === 'function') {
        checkHaushaltszahlungenForNotifications();
    }
}

export function navigate(targetViewName) {
    console.log(`Navigiere zu: ${targetViewName}`);
    const targetView = views[targetViewName];
    if (!targetView) {
        console.error(`Navigation fehlgeschlagen: View "${targetViewName}" nicht gefunden.`);
        return;
    }

    if (sessionStorage) {
        sessionStorage.setItem('lastActiveView', targetViewName);
    }

    // Berechtigungsprüfung
    const userPermissions = currentUser.permissions || [];
    // FIX: Systemadmin hat immer Zugriff (Master-Key)
    const isSystemAdmin = currentUser.role === 'SYSTEMADMIN';

    // Wenn NICHT Systemadmin, dann prüfe die Rechte
    if (targetViewName !== 'terminplaner' && targetViewName !== 'pushmailCenter' && !isSystemAdmin) {
        if (targetViewName === 'entrance' && !userPermissions.includes('ENTRANCE')) return alertUser("Zugriff verweigert (Eingang).", 'error');
        if (targetViewName === 'pushover' && !userPermissions.includes('PUSHOVER')) return alertUser("Zugriff verweigert (Push).", 'error');
        if (targetViewName === 'checklist' && !userPermissions.includes('CHECKLIST')) return alertUser("Zugriff verweigert (Checkliste).", 'error');
        if (targetViewName === 'checklistSettings' && !userPermissions.includes('CHECKLIST_SETTINGS')) return alertUser("Zugriff verweigert (Checklisten-Einstellungen).", 'error');
        if (targetViewName === 'essensberechnung' && !userPermissions.includes('ESSENSBERECHNUNG')) return alertUser("Zugriff verweigert (Essensberechnung).", 'error');

        if (targetViewName === 'admin') {
            const isAdminRole = currentUser.role === 'ADMIN';
            const isIndividualAdminDisplay = currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN';

            if (!isAdminRole && !isIndividualAdminDisplay) {
                return alertUser("Zugriff verweigert (Admin).", 'error');
            }
        }
        if (targetViewName === 'notrufSettings' && (!userPermissions.includes('PUSHOVER') || !userPermissions.includes('PUSHOVER_NOTRUF_SETTINGS'))) return alertUser("Zugriff verweigert (Notruf-Einstellungen).", 'error');

        // Zugriffsschutz für Zahlungsverwaltung
        if ((targetViewName === 'zahlungsverwaltung' || targetViewName === 'zahlungsverwaltungSettings') && !userPermissions.includes('ZAHLUNGSVERWALTUNG')) {
            return alertUser("Zugriff verweigert (Zahlungsverwaltung).", 'error');
        }

        // Zugriffsschutz für Ticket Support
        if (targetViewName === 'ticketSupport' && !userPermissions.includes('TICKET_SUPPORT')) {
            return alertUser("Zugriff verweigert (Ticket Support).", 'error');
        }

        // Zugriffsschutz für Notizen
        if (targetViewName === 'notizen' && !userPermissions.includes('NOTIZEN')) {
            return alertUser("Zugriff verweigert (Notizen).", 'error');
        }

        // Zugriffsschutz für Wertguthaben
        if ((targetViewName === 'wertguthaben' || targetViewName === 'wertguthabenSettings') && !userPermissions.includes('WERTGUTHABEN')) {
            return alertUser("Zugriff verweigert (Wertguthaben).", 'error');
        }

        // Zugriffsschutz für Lizenzen
        if (targetViewName === 'lizenzen' && !userPermissions.includes('LIZENZEN')) {
            return alertUser("Zugriff verweigert (Lizenzen).", 'error');
        }

        // Zugriffsschutz für Vertragsverwaltung
        if (targetViewName === 'vertragsverwaltung' && !userPermissions.includes('VERTRAGSVERWALTUNG')) {
            return alertUser("Zugriff verweigert (Vertragsverwaltung).", 'error');
        }

        // Zugriffsschutz für Sendungsverwaltung
        if (targetViewName === 'sendungsverwaltung' && !userPermissions.includes('SENDUNGSVERWALTUNG')) {
            return alertUser("Zugriff verweigert (Sendungsverwaltung).", 'error');
        }

        // Zugriffsschutz für Rezepte
        if (targetViewName === 'rezepte' && !userPermissions.includes('REZEPTE')) {
            return alertUser("Zugriff verweigert (Rezepte).", 'error');
        }

        // Zugriffsschutz für Haushaltszahlungen
        if (targetViewName === 'haushaltszahlungen' && !userPermissions.includes('HAUSHALTSZAHLUNGEN')) {
            return alertUser("Zugriff verweigert (Haushaltszahlungen).", 'error');
        }

        // Zugriffsschutz für Tools inkl. Unterseite
        if ((targetViewName === 'tools' || targetViewName === 'maKarte') && !userPermissions.includes('TOOLS')) {
            return alertUser("Zugriff verweigert (Tools).", 'error');
        }
    }

    // Scroll zum Anfang
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;

    Object.values(viewElements).forEach(el => el && el.classList.remove('active'));
    const targetElement = document.getElementById(targetView.id);
    if (targetElement) {
        targetElement.classList.add('active');
    } else {
        console.error(`Navigation fehlgeschlagen: Element mit ID "${targetView.id}" nicht gefunden.`);
        const homeElement = document.getElementById(views.home.id);
        if (homeElement) homeElement.classList.add('active');
        return;
    }

    updateUIForMode();

    if (targetViewName === 'pushmailCenter') {
        initializePushmailCenterView();
    }

    if (targetViewName === 'userSettings') {
        const userNameEl = document.getElementById('userSettingsName');
        const userKeyDisplayEl = document.getElementById('currentUserKeyDisplay');
        if (userNameEl) userNameEl.textContent = `Passwort für ${currentUser.displayName} ändern`;
        if (userKeyDisplayEl) {
            userKeyDisplayEl.style.display = 'none';
        }
    }
    if (targetViewName === 'essensberechnung') {
        initializeEssensberechnungView();
    }
    if (targetViewName === 'notrufSettings') {
        initializeNotrufSettingsView();
    }
    if (targetViewName === 'checklist') {
        const defaultListId = adminSettings.defaultChecklistId;
        renderChecklistView(defaultListId);
    }
    if (targetViewName === 'checklistSettings') {
        renderChecklistSettingsView();
    }
    if (targetViewName === 'admin') {
        Object.keys(adminSectionsState).forEach(key => adminSectionsState[key] = false);
        toggleAdminSection(null);
    }

    if (targetViewName === 'zahlungsverwaltung') {
        initializeZahlungsverwaltungView();
    }

    if (targetViewName === 'zahlungsverwaltungSettings') {
        initializeZahlungsverwaltungSettingsView();
    }

    if (targetViewName === 'ticketSupport') {
        initializeTicketSupport();
    }

    if (targetViewName === 'notizen') {
        initializeNotizen();
    }

    if (targetViewName === 'wertguthaben') {
        initializeWertguthaben();
    }

    if (targetViewName === 'lizenzen') {
        initializeLizenzen();
    }

    if (targetViewName === 'vertragsverwaltung') {
        initializeVertragsverwaltung();
    }

    if (targetViewName === 'sendungsverwaltung') {
        initializeSendungsverwaltungView();
    }

    if (targetViewName === 'rezepte') {
        initRezeptverwaltung();
    }

    if (targetViewName === 'haushaltszahlungen') {
        initializeHaushaltszahlungen();
    }

    if (targetViewName === 'maKarte') {
        initializeMitarbeiterkarte();
    }

    if (targetViewName === 'geschenkemanagement') {
        initializeGeschenkemanagement();
    }
}



export function setupEventListeners() {
    // Sicherstellen, dass die Elemente existieren, bevor Listener hinzugefügt werden
    if (!appHeader || !document.querySelector('.main-content') || !document.getElementById('entranceCard')) {
        console.warn("setupEventListeners: Wichtige Elemente noch nicht bereit, versuche später erneut.");
        return;
    }
    console.log("setupEventListeners: Füge Basis-Listener hinzu...");

    const setPushoverViewMode = (mode) => {
        const sendSection = document.getElementById('pushoverSendSection');
        const settingsSection = document.getElementById('pushoverSettingsSection');
        const toggleBtn = document.getElementById('pushoverSettingsToggleButton');
        if (!sendSection || !settingsSection || !toggleBtn) return;

        if (mode === 'settings') {
            sendSection.classList.add('hidden');
            settingsSection.classList.remove('hidden');
            toggleBtn.textContent = 'Nachricht senden';
            toggleBtn.dataset.mode = 'settings';
            console.log('PushoverView: Einstellungen geöffnet');
            return;
        }

        settingsSection.classList.add('hidden');
        sendSection.classList.remove('hidden');
        toggleBtn.textContent = 'Einstellungen';
        toggleBtn.dataset.mode = 'send';
        console.log('PushoverView: Senden geöffnet');
    };

    const parseLines = (v) => {
        return String(v || '')
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
    };

    const toInt = (v, fallback = 0) => {
        const n = parseInt(String(v), 10);
        return Number.isFinite(n) ? n : fallback;
    };

    const getPushoverSettingsRecipientId = () => {
        return currentUser?.mode && currentUser.mode !== GUEST_MODE ? currentUser.mode : null;
    };

    const setPushoverSetupOpen = (open) => {
        const card = document.getElementById('pushoverSetupCard');
        const btn = document.getElementById('pushoverSetupToggleButton');
        if (!card || !btn) return;
        card.classList.toggle('hidden', !open);
        btn.textContent = open ? 'Pushover einrichten schließen' : 'Pushover einrichten';
        btn.dataset.open = open ? 'true' : 'false';
    };

    const clearPushoverSettingsForm = () => {
        const apiTokenInput = document.getElementById('pushoverConfigApiToken');
        const userKeyInput = document.getElementById('pushoverConfigUserKey');

        if (apiTokenInput) apiTokenInput.value = '';
        if (userKeyInput) userKeyInput.value = '';
    };

    let pushoverSenderGrantCache = {};
    let pushoverSelectedSenderId = null;

    const setPushoverGrantEditorOpen = (open) => {
        const editor = document.getElementById('pushoverGrantEditor');
        const tilesArea = document.getElementById('pushoverGrantTilesArea');
        if (!editor) return;
        editor.classList.toggle('hidden', !open);
        if (tilesArea) tilesArea.classList.toggle('hidden', open);
    };

    const setPushoverSendDetailsOpen = (open) => {
        const details = document.getElementById('pushoverSendDetails');
        if (!details) return;
        details.classList.toggle('hidden', !open);
    };

    const setPushoverNoRecipientsNoticeOpen = (open) => {
        const notice = document.getElementById('pushoverNoRecipientsNotice');
        if (!notice) return;
        notice.classList.toggle('hidden', !open);
    };

    const updatePushoverSendButtonState = () => {
        const sendBtn = document.getElementById('sendDynamicPostButton');
        if (!sendBtn) return;

        const details = document.getElementById('pushoverSendDetails');
        const recipientSelect = document.getElementById('pushoverRecipient');
        const titleInput = document.getElementById('pushoverTitle');
        const messageInput = document.getElementById('pushoverMessage');
        const prioritySelect = document.getElementById('pushoverPriority');

        const hasRecipient = Boolean(String(recipientSelect?.value || '').trim());
        const hasTitle = Boolean(String(titleInput?.value || '').trim());
        const hasMessage = Boolean(String(messageInput?.value || '').trim());
        const hasPriority = Boolean(String(prioritySelect?.value ?? '').trim());
        const detailsOpen = details ? !details.classList.contains('hidden') : false;

        sendBtn.disabled = !(detailsOpen && hasRecipient && hasTitle && hasMessage && hasPriority);
    };

    const updatePushoverGrantSaveButtonState = () => {
        const saveBtn = document.getElementById('savePushoverSenderGrantButton');
        if (!saveBtn) return;

        const senderSelect = document.getElementById('pushoverGrantSenderSelect');
        const titlesArea = document.getElementById('pushoverGrantAllowedTitles');
        const messagesArea = document.getElementById('pushoverGrantAllowedMessages');
        const allowTitle = document.getElementById('pushoverGrantAllowTitleFreeText');
        const allowMessage = document.getElementById('pushoverGrantAllowMessageFreeText');

        const senderOk = Boolean(String(senderSelect?.value || '').trim());
        const titles = parseLines(titlesArea?.value);
        const messages = parseLines(messagesArea?.value);
        const titleOk = allowTitle?.checked === true || titles.length > 0;
        const messageOk = allowMessage?.checked === true || messages.length > 0;

        saveBtn.disabled = !(senderOk && titleOk && messageOk);
    };

    const updatePushoverGrantPriorityUI = () => {
        const prMinus2 = document.getElementById('pushoverGrantPriorityMinus2');
        const prMinus1 = document.getElementById('pushoverGrantPriorityMinus1');
        const pr0 = document.getElementById('pushoverGrantPriority0');
        const pr1 = document.getElementById('pushoverGrantPriority1');
        const pr2 = document.getElementById('pushoverGrantPriority2');
        const defaultPrioritySelect = document.getElementById('pushoverGrantDefaultPriority');
        if (!defaultPrioritySelect || !pr0) return;

        const allowed = [];
        if (prMinus2?.checked) allowed.push(-2);
        if (prMinus1?.checked) allowed.push(-1);
        if (pr0?.checked) allowed.push(0);
        if (pr1?.checked) allowed.push(1);
        if (pr2?.checked) allowed.push(2);

        if (!allowed.length) {
            pr0.checked = true;
            allowed.push(0);
        }

        Array.from(defaultPrioritySelect.options || []).forEach(opt => {
            const val = toInt(opt.value, 0);
            opt.disabled = !allowed.includes(val);
        });

        const currentDefault = toInt(defaultPrioritySelect.value, 0);
        if (!allowed.includes(currentDefault)) {
            defaultPrioritySelect.value = String(Math.min(...allowed));
        }
    };

    const openPushoverGrantPersonPicker = (availableUserIds) => {
        return new Promise((resolve) => {
            let resolved = false;
            const close = (value = null) => {
                if (resolved) return;
                resolved = true;
                if (modal) {
                    modal.style.display = 'none';
                    modal.onclick = null;
                }
                resolve(value);
            };

            let modal = document.getElementById('pushoverGrantPersonModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'pushoverGrantPersonModal';
                modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
                document.body.appendChild(modal);
            }

            const ids = Array.isArray(availableUserIds) ? availableUserIds : [];
            const listHtml = ids.length
                ? ids.map(uid => {
                    const name = USERS[uid]?.name || uid;
                    return `
                        <button type="button" data-sender-id="${uid}"
                            class="w-full p-3 text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                                ${(name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span class="font-semibold text-gray-800">${name}</span>
                        </button>
                    `;
                }).join('')
                : '<div class="text-sm text-gray-600">Keine verfügbare Person gefunden.</div>';

            modal.innerHTML = `
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div class="bg-gradient-to-r from-indigo-600 to-blue-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
                        <h3 class="text-xl font-bold">Person auswählen</h3>
                        <button type="button" id="closePushoverGrantPersonModal" class="text-white/80 hover:text-white transition">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div class="p-4">
                        <p class="text-sm text-gray-600 mb-3">Für welche Person willst du eine neue Berechtigung anlegen?</p>
                        <div class="space-y-2 max-h-64 overflow-y-auto">${listHtml}</div>
                    </div>
                    <div class="p-4 bg-gray-100 rounded-b-2xl">
                        <button type="button" id="cancelPushoverGrantPersonModal"
                            class="w-full px-4 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                            Abbrechen
                        </button>
                    </div>
                </div>
            `;

            modal.style.display = 'flex';

            modal.onclick = (e) => {
                if (e.target === modal) close(null);
            };

            modal.querySelector('#closePushoverGrantPersonModal')?.addEventListener('click', () => close(null));
            modal.querySelector('#cancelPushoverGrantPersonModal')?.addEventListener('click', () => close(null));

            modal.querySelectorAll('button[data-sender-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-sender-id');
                    close(id || null);
                });
            });
        });
    };

    const clearPushoverSenderGrantEditor = () => {
        const senderSelect = document.getElementById('pushoverGrantSenderSelect');
        const titlesArea = document.getElementById('pushoverGrantAllowedTitles');
        const messagesArea = document.getElementById('pushoverGrantAllowedMessages');
        const allowTitle = document.getElementById('pushoverGrantAllowTitleFreeText');
        const allowMessage = document.getElementById('pushoverGrantAllowMessageFreeText');

        const prMinus2 = document.getElementById('pushoverGrantPriorityMinus2');
        const prMinus1 = document.getElementById('pushoverGrantPriorityMinus1');
        const pr0 = document.getElementById('pushoverGrantPriority0');
        const pr1 = document.getElementById('pushoverGrantPriority1');
        const pr2 = document.getElementById('pushoverGrantPriority2');
        const defaultPrioritySelect = document.getElementById('pushoverGrantDefaultPriority');
        const retryPresetsArea = document.getElementById('pushoverGrantRetryPresets');
        const expirePresetsArea = document.getElementById('pushoverGrantExpirePresets');

        if (senderSelect) senderSelect.value = '';
        if (titlesArea) titlesArea.value = '';
        if (messagesArea) messagesArea.value = '';
        if (allowTitle) allowTitle.checked = false;
        if (allowMessage) allowMessage.checked = false;

        if (prMinus2) prMinus2.checked = false;
        if (prMinus1) prMinus1.checked = false;
        if (pr0) pr0.checked = true;
        if (pr1) pr1.checked = false;
        if (pr2) pr2.checked = false;
        if (defaultPrioritySelect) defaultPrioritySelect.value = '0';
        if (retryPresetsArea) retryPresetsArea.value = '';
        if (expirePresetsArea) expirePresetsArea.value = '';

        updatePushoverGrantPriorityUI();
        updatePushoverGrantSaveButtonState();
    };

    const applyPushoverSenderGrantToEditor = (senderId, grantData) => {
        const senderSelect = document.getElementById('pushoverGrantSenderSelect');
        const titlesArea = document.getElementById('pushoverGrantAllowedTitles');
        const messagesArea = document.getElementById('pushoverGrantAllowedMessages');
        const allowTitle = document.getElementById('pushoverGrantAllowTitleFreeText');
        const allowMessage = document.getElementById('pushoverGrantAllowMessageFreeText');

        const prMinus2 = document.getElementById('pushoverGrantPriorityMinus2');
        const prMinus1 = document.getElementById('pushoverGrantPriorityMinus1');
        const pr0 = document.getElementById('pushoverGrantPriority0');
        const pr1 = document.getElementById('pushoverGrantPriority1');
        const pr2 = document.getElementById('pushoverGrantPriority2');
        const defaultPrioritySelect = document.getElementById('pushoverGrantDefaultPriority');
        const retryPresetsArea = document.getElementById('pushoverGrantRetryPresets');
        const expirePresetsArea = document.getElementById('pushoverGrantExpirePresets');

        if (senderSelect) senderSelect.value = senderId || '';

        const titles = Array.isArray(grantData?.allowedTitles) ? grantData.allowedTitles : [];
        const messages = Array.isArray(grantData?.allowedMessages) ? grantData.allowedMessages : [];

        const allowedPriorities = Array.isArray(grantData?.allowedPriorities) ? grantData.allowedPriorities.map(v => toInt(v, 0)) : [0];
        const defaultPriority = toInt(grantData?.defaultPriority, 0);
        const retryPresets = Array.isArray(grantData?.retryPresets) ? grantData.retryPresets : [];
        const expirePresets = Array.isArray(grantData?.expirePresets) ? grantData.expirePresets : [];

        if (titlesArea) titlesArea.value = titles.join('\n');
        if (messagesArea) messagesArea.value = messages.join('\n');
        if (allowTitle) allowTitle.checked = grantData?.allowTitleFreeText === true;
        if (allowMessage) allowMessage.checked = grantData?.allowMessageFreeText === true;

        if (prMinus2) prMinus2.checked = allowedPriorities.includes(-2);
        if (prMinus1) prMinus1.checked = allowedPriorities.includes(-1);
        if (pr0) pr0.checked = allowedPriorities.includes(0) || (!allowedPriorities.length && defaultPriority === 0);
        if (pr1) pr1.checked = allowedPriorities.includes(1);
        if (pr2) pr2.checked = allowedPriorities.includes(2);
        if (defaultPrioritySelect) defaultPrioritySelect.value = String(defaultPriority);
        if (retryPresetsArea) retryPresetsArea.value = (retryPresets || []).map(v => String(v)).join('\n');
        if (expirePresetsArea) expirePresetsArea.value = (expirePresets || []).map(v => String(v)).join('\n');

        updatePushoverGrantPriorityUI();
        updatePushoverGrantSaveButtonState();
    };

    const renderPushoverSenderGrantTiles = () => {
        const tiles = document.getElementById('pushoverSenderGrantTiles');
        if (!tiles) return;
        tiles.innerHTML = '';

        const senderIds = Object.keys(pushoverSenderGrantCache || {});
        senderIds.forEach(senderId => {
            const name = USERS[senderId]?.name || senderId;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.senderId = senderId;
            btn.className = senderId === pushoverSelectedSenderId
                ? 'py-3 px-2 rounded-lg border border-indigo-400 bg-indigo-50 text-indigo-900 font-semibold text-sm hover:bg-indigo-100 transition'
                : 'py-3 px-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold text-sm hover:bg-emerald-100 transition';
            btn.textContent = name;
            tiles.appendChild(btn);
        });

        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.dataset.action = 'new';
        newBtn.className = 'py-3 px-2 rounded-lg border-2 border-dashed border-gray-300 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition';
        newBtn.textContent = '+ Neue anlegen';
        tiles.appendChild(newBtn);
    };

    const loadPushoverSenderGrantsForCurrentUser = async () => {
        const recipientId = getPushoverSettingsRecipientId();
        const senderSelect = document.getElementById('pushoverGrantSenderSelect');

        pushoverSenderGrantCache = {};
        if (!recipientId) {
            renderPushoverSenderGrantTiles();
            if (senderSelect) senderSelect.innerHTML = '<option value="" disabled selected>Bitte anmelden...</option>';
            return;
        }
        if (!pushoverGrantsByRecipientCollectionRef) {
            renderPushoverSenderGrantTiles();
            if (senderSelect) senderSelect.innerHTML = '<option value="" disabled selected>Bitte warten...</option>';
            return;
        }

        try {
            console.log('PushoverProgram: Lade Sender-Berechtigungen für Empfänger:', recipientId);
            const sendersCol = collection(doc(pushoverGrantsByRecipientCollectionRef, recipientId), 'senders');
            const snaps = await getDocs(sendersCol);
            snaps.forEach(s => {
                pushoverSenderGrantCache[s.id] = s.data() || {};
            });
        } catch (e) {
            console.error('PushoverProgram: Fehler beim Laden der Sender-Grants:', e);
        }

        const userIds = Object.keys(USERS || {})
            .filter(uid => uid && uid !== recipientId)
            .filter(uid => USERS[uid]?.isActive !== false);

        setSelectOptions(
            senderSelect,
            userIds.map(uid => ({ value: uid, label: USERS[uid]?.name || uid })),
            'Bitte wählen...'
        );

        if (pushoverSelectedSenderId && senderSelect) {
            senderSelect.value = pushoverSelectedSenderId;
        }

        renderPushoverSenderGrantTiles();

        if (pushoverSelectedSenderId) {
            applyPushoverSenderGrantToEditor(pushoverSelectedSenderId, pushoverSenderGrantCache[pushoverSelectedSenderId] || null);
            setPushoverGrantEditorOpen(true);
        } else {
            clearPushoverSenderGrantEditor();
            setPushoverGrantEditorOpen(false);
        }
    };

    const showPushoverSettingsStatus = (msg, show = true) => {
        const el = document.getElementById('pushoverSettingsStatus');
        if (!el) return;
        if (!show) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.textContent = msg;
        el.classList.remove('hidden');
    };

    const setSelectOptions = (selectEl, options, placeholder = 'Bitte wählen...') => {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.disabled = true;
        ph.selected = true;
        ph.textContent = placeholder;
        selectEl.appendChild(ph);
        (options || []).forEach(opt => {
            const optionEl = document.createElement('option');
            optionEl.value = String(opt.value);
            optionEl.textContent = String(opt.label);
            selectEl.appendChild(optionEl);
        });
    };

    const loadPushoverProgramConfig = async (recipientId) => {
        if (!recipientId) return null;
        if (pushoverProgramConfigCache && Object.prototype.hasOwnProperty.call(pushoverProgramConfigCache, recipientId)) {
            return pushoverProgramConfigCache[recipientId];
        }
        if (!pushoverProgramsCollectionRef) return null;

        try {
            console.log('PushoverProgram: Lade Konfiguration für Empfänger:', recipientId);
            const docRef = doc(pushoverProgramsCollectionRef, recipientId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) {
                pushoverProgramConfigCache[recipientId] = null;
                return null;
            }
            const cfg = snap.data() || {};
            pushoverProgramConfigCache[recipientId] = cfg;
            return cfg;
        } catch (e) {
            console.error('PushoverProgram: Fehler beim Laden der Konfiguration:', e);
            return null;
        }
    };

    const applyPushoverConfigToSendForm = (recipientId, cfg) => {
        const recipientSelect = document.getElementById('pushoverRecipient');
        const grantedByEl = document.getElementById('pushoverGrantedBy');

        const titlePresetSelect = document.getElementById('pushoverTitlePreset');
        const titleInput = document.getElementById('pushoverTitle');
        const messagePresetSelect = document.getElementById('pushoverMessagePreset');
        const messageInput = document.getElementById('pushoverMessage');

        const prioritySelect = document.getElementById('pushoverPriority');
        const emergencyOptions = document.getElementById('pushoverEmergencyOptions');
        const retryPresetSelect = document.getElementById('pushoverRetryPreset');
        const expirePresetSelect = document.getElementById('pushoverExpirePreset');

        const grantMeta = pushoverRecipientGrantCache ? pushoverRecipientGrantCache[recipientId] : null;

        if (grantedByEl) {
            const through = grantMeta?.recipientName || grantMeta?.grantedBy || recipientSelect?.selectedOptions?.[0]?.textContent || recipientId;
            grantedByEl.textContent = through ? `berechtigt durch: ${through}` : '';
        }

        const titles = Array.isArray(grantMeta?.allowedTitles) ? grantMeta.allowedTitles : [];
        const messages = Array.isArray(grantMeta?.allowedMessages) ? grantMeta.allowedMessages : [];
        const allowTitleFreeText = grantMeta?.allowTitleFreeText === true;
        const allowMessageFreeText = grantMeta?.allowMessageFreeText === true;

        setSelectOptions(titlePresetSelect, titles.map(t => ({ value: t, label: t })), titles.length ? 'Vorlage wählen...' : 'Keine Vorlagen');
        setSelectOptions(messagePresetSelect, messages.map(m => ({ value: m, label: m })), messages.length ? 'Vorlage wählen...' : 'Keine Vorlagen');

        if (titleInput) titleInput.disabled = !allowTitleFreeText;
        if (messageInput) messageInput.disabled = !allowMessageFreeText;

        const allowedPriorities = Array.isArray(grantMeta?.allowedPriorities) ? grantMeta.allowedPriorities : [0];
        const defaultPriority = toInt(grantMeta?.defaultPriority, 0);

        if (prioritySelect) {
            prioritySelect.innerHTML = '';
            const labels = {
                '-2': '-2 (Ganz leise)',
                '-1': '-1 (Leise)',
                '0': '0 (Normal)',
                '1': '1 (Hoch)',
                '2': '2 (Notfall / Wiederholen)'
            };
            const normalized = allowedPriorities
                .map(p => toInt(p, 0))
                .filter(p => [-2, -1, 0, 1, 2].includes(p));
            const unique = Array.from(new Set(normalized));
            const sorted = unique.sort((a, b) => a - b);
            sorted.forEach(p => {
                const opt = document.createElement('option');
                opt.value = String(p);
                opt.textContent = labels[String(p)] || String(p);
                prioritySelect.appendChild(opt);
            });

            const hasDefault = sorted.includes(defaultPriority);
            prioritySelect.value = hasDefault ? String(defaultPriority) : (sorted.length ? String(sorted[0]) : '0');
        }

        const retryPresets = Array.isArray(grantMeta?.retryPresets) ? grantMeta.retryPresets : [];
        const expirePresets = Array.isArray(grantMeta?.expirePresets) ? grantMeta.expirePresets : [];
        setSelectOptions(retryPresetSelect, retryPresets.map(v => ({ value: String(v), label: String(v) })), retryPresets.length ? 'Preset wählen...' : 'Keine Presets');
        setSelectOptions(expirePresetSelect, expirePresets.map(v => ({ value: String(v), label: String(v) })), expirePresets.length ? 'Preset wählen...' : 'Keine Presets');

        if (emergencyOptions && prioritySelect) {
            const show = toInt(prioritySelect.value, 0) === 2;
            emergencyOptions.classList.toggle('hidden', !show);
        }
    };

    const loadPushoverRecipientsForSender = async () => {
        const recipientSelect = document.getElementById('pushoverRecipient');
        const grantedByEl = document.getElementById('pushoverGrantedBy');

        if (!recipientSelect) return;
        if (!pushoverGrantsBySenderCollectionRef) {
            recipientSelect.innerHTML = '<option value="" disabled selected>Bitte warten...</option>';
            if (grantedByEl) grantedByEl.textContent = '';
            recipientSelect.disabled = true;
            setPushoverSendDetailsOpen(false);
            setPushoverNoRecipientsNoticeOpen(false);
            updatePushoverSendButtonState();
            return;
        }
        if (!currentUser?.mode || currentUser.mode === GUEST_MODE) {
            recipientSelect.innerHTML = '<option value="" disabled selected>Bitte anmelden...</option>';
            if (grantedByEl) grantedByEl.textContent = '';
            recipientSelect.disabled = true;
            setPushoverSendDetailsOpen(false);
            setPushoverNoRecipientsNoticeOpen(false);
            updatePushoverSendButtonState();
            return;
        }

        try {
            console.log('PushoverProgram: Lade berechtigte Empfänger für Sender:', currentUser.mode);
            const recipientsCol = collection(doc(pushoverGrantsBySenderCollectionRef, currentUser.mode), 'recipients');
            const snaps = await getDocs(recipientsCol);

            pushoverRecipientGrantCache = {};
            const options = [];
            snaps.forEach(s => {
                const data = s.data() || {};
                const rid = data.recipientId || s.id;
                const label = data.recipientName || USERS[rid]?.name || rid;
                pushoverRecipientGrantCache[rid] = data;
                options.push({ value: rid, label });
            });

            if (!options.length) {
                recipientSelect.innerHTML = '<option value="" disabled selected>Keine Berechtigung gefunden</option>';
                if (grantedByEl) grantedByEl.textContent = '';
                pushoverSelectedRecipientId = null;
                recipientSelect.disabled = true;
                setPushoverSendDetailsOpen(false);
                setPushoverNoRecipientsNoticeOpen(true);
                updatePushoverSendButtonState();
                return;
            }

            setSelectOptions(recipientSelect, options, 'Empfänger wählen...');
            if (grantedByEl) grantedByEl.textContent = '';
            pushoverSelectedRecipientId = null;
            recipientSelect.disabled = false;
            setPushoverSendDetailsOpen(false);
            setPushoverNoRecipientsNoticeOpen(false);
            updatePushoverSendButtonState();
        } catch (e) {
            console.error('PushoverProgram: Fehler beim Laden der Empfänger-Grants:', e);
            recipientSelect.innerHTML = '<option value="" disabled selected>Fehler beim Laden</option>';
            if (grantedByEl) grantedByEl.textContent = '';
            recipientSelect.disabled = true;
            setPushoverSendDetailsOpen(false);
            setPushoverNoRecipientsNoticeOpen(false);
            updatePushoverSendButtonState();
        }
    };

    const savePushoverProgramConfig = async () => {
        if (!currentUser?.mode || currentUser.mode === GUEST_MODE) {
            showPushoverSettingsStatus('Bitte anmelden.', true);
            return;
        }

        const recipientId = currentUser.mode;

        if (!pushoverProgramsCollectionRef) {
            showPushoverSettingsStatus('Bitte warten... (Firebase lädt noch)', true);
            return;
        }

        const apiTokenInput = document.getElementById('pushoverConfigApiToken');
        const userKeyInput = document.getElementById('pushoverConfigUserKey');

        if (!apiTokenInput || !userKeyInput) {
            showPushoverSettingsStatus('Zugangsdaten werden zentral im PUSHMAIL-Center verwaltet.', true);
            return;
        }
        const payload = {
            apiToken: String(apiTokenInput.value || '').trim(),
            userKey: String(userKeyInput.value || '').trim(),
            updatedAt: serverTimestamp()
        };

        try {
            console.log('PushoverProgram: Speichere Konfiguration für:', recipientId);
            await setDoc(doc(pushoverProgramsCollectionRef, recipientId), payload, { merge: true });
            pushoverProgramConfigCache[recipientId] = payload;
            showPushoverSettingsStatus('Einstellungen gespeichert.', true);

            setPushoverSetupOpen(false);
        } catch (e) {
            console.error('PushoverProgram: Fehler beim Speichern der Konfiguration:', e);
            showPushoverSettingsStatus('Fehler beim Speichern. Bitte später erneut versuchen.', true);
        }
    };

    const savePushoverSenderGrant = async () => {
        const recipientId = getPushoverSettingsRecipientId();
        if (!recipientId) {
            showPushoverSettingsStatus('Bitte anmelden.', true);
            return;
        }
        if (!pushoverGrantsBySenderCollectionRef || !pushoverGrantsByRecipientCollectionRef) {
            showPushoverSettingsStatus('Bitte warten... (Firebase lädt noch)', true);
            return;
        }

        const senderSelect = document.getElementById('pushoverGrantSenderSelect');
        const senderId = String(senderSelect?.value || '').trim();
        if (!senderId) {
            showPushoverSettingsStatus('Bitte Person auswählen.', true);
            return;
        }

        const titlesArea = document.getElementById('pushoverGrantAllowedTitles');
        const messagesArea = document.getElementById('pushoverGrantAllowedMessages');
        const allowTitle = document.getElementById('pushoverGrantAllowTitleFreeText');
        const allowMessage = document.getElementById('pushoverGrantAllowMessageFreeText');

        const prMinus2 = document.getElementById('pushoverGrantPriorityMinus2');
        const prMinus1 = document.getElementById('pushoverGrantPriorityMinus1');
        const pr0 = document.getElementById('pushoverGrantPriority0');
        const pr1 = document.getElementById('pushoverGrantPriority1');
        const pr2 = document.getElementById('pushoverGrantPriority2');
        const defaultPrioritySelect = document.getElementById('pushoverGrantDefaultPriority');
        const retryPresetsArea = document.getElementById('pushoverGrantRetryPresets');
        const expirePresetsArea = document.getElementById('pushoverGrantExpirePresets');

        const allowedTitles = parseLines(titlesArea?.value);
        const allowedMessages = parseLines(messagesArea?.value);

        const allowTitleFreeText = allowTitle?.checked === true;
        const allowMessageFreeText = allowMessage?.checked === true;

        if (!allowTitleFreeText && !allowedTitles.length) {
            showPushoverSettingsStatus('Bitte mindestens einen Titel eintragen oder Freitext beim Titel erlauben.', true);
            updatePushoverGrantSaveButtonState();
            return;
        }
        if (!allowMessageFreeText && !allowedMessages.length) {
            showPushoverSettingsStatus('Bitte mindestens eine Nachricht eintragen oder Freitext bei der Nachricht erlauben.', true);
            updatePushoverGrantSaveButtonState();
            return;
        }

        const allowedPriorities = [];
        if (prMinus2?.checked) allowedPriorities.push(-2);
        if (prMinus1?.checked) allowedPriorities.push(-1);
        if (pr0?.checked) allowedPriorities.push(0);
        if (pr1?.checked) allowedPriorities.push(1);
        if (pr2?.checked) allowedPriorities.push(2);

        if (!allowedPriorities.length) {
            if (pr0) pr0.checked = true;
            allowedPriorities.push(0);
            updatePushoverGrantPriorityUI();
        }

        let defaultPriority = toInt(defaultPrioritySelect?.value, 0);
        if (!allowedPriorities.includes(defaultPriority)) {
            defaultPriority = Math.min(...allowedPriorities);
            if (defaultPrioritySelect) defaultPrioritySelect.value = String(defaultPriority);
        }

        const retryPresets = parseLines(retryPresetsArea?.value).map(v => toInt(v, 60)).filter(v => v >= 30 && v <= 10800);
        const expirePresets = parseLines(expirePresetsArea?.value).map(v => toInt(v, 3600)).filter(v => v >= 30 && v <= 10800);

        const recipientName = USERS[recipientId]?.name || recipientId;
        const senderName = USERS[senderId]?.name || senderId;

        const payload = {
            senderId,
            senderName,
            recipientId,
            recipientName,
            grantedBy: recipientName,
            allowedTitles,
            allowedMessages,
            allowTitleFreeText,
            allowMessageFreeText,
            allowedPriorities: Array.from(new Set(allowedPriorities)).sort((a, b) => a - b),
            defaultPriority,
            retryPresets,
            expirePresets,
            updatedAt: serverTimestamp()
        };

        try {
            console.log('PushoverProgram: Speichere Sender-Berechtigung. Recipient:', recipientId, 'Sender:', senderId);
            const bySenderDoc = doc(collection(doc(pushoverGrantsBySenderCollectionRef, senderId), 'recipients'), recipientId);
            const byRecipientDoc = doc(collection(doc(pushoverGrantsByRecipientCollectionRef, recipientId), 'senders'), senderId);
            await Promise.all([
                setDoc(bySenderDoc, payload, { merge: true }),
                setDoc(byRecipientDoc, payload, { merge: true })
            ]);
            pushoverSelectedSenderId = null;
            clearPushoverSenderGrantEditor();
            setPushoverGrantEditorOpen(false);
            showPushoverSettingsStatus('Berechtigung gespeichert.', true);
            await loadPushoverSenderGrantsForCurrentUser();
        } catch (e) {
            console.error('PushoverProgram: Fehler beim Speichern der Sender-Berechtigung:', e);
            showPushoverSettingsStatus('Fehler beim Speichern der Berechtigung.', true);
        }
    };

    const deletePushoverSenderGrant = async () => {
        const recipientId = getPushoverSettingsRecipientId();
        if (!recipientId) {
            showPushoverSettingsStatus('Bitte anmelden.', true);
            return;
        }
        if (!pushoverGrantsBySenderCollectionRef || !pushoverGrantsByRecipientCollectionRef) {
            showPushoverSettingsStatus('Bitte warten... (Firebase lädt noch)', true);
            return;
        }

        const senderSelect = document.getElementById('pushoverGrantSenderSelect');
        const senderId = String(senderSelect?.value || '').trim();
        if (!senderId) {
            showPushoverSettingsStatus('Bitte Person auswählen.', true);
            return;
        }

        const ok = confirm(`Berechtigung löschen für: ${USERS[senderId]?.name || senderId}?`);
        if (!ok) return;

        try {
            console.log('PushoverProgram: Lösche Sender-Berechtigung. Recipient:', recipientId, 'Sender:', senderId);
            const bySenderDoc = doc(collection(doc(pushoverGrantsBySenderCollectionRef, senderId), 'recipients'), recipientId);
            const byRecipientDoc = doc(collection(doc(pushoverGrantsByRecipientCollectionRef, recipientId), 'senders'), senderId);
            await Promise.all([
                deleteDoc(bySenderDoc),
                deleteDoc(byRecipientDoc)
            ]);
            if (pushoverSelectedSenderId === senderId) pushoverSelectedSenderId = null;
            clearPushoverSenderGrantEditor();
            setPushoverGrantEditorOpen(false);
            showPushoverSettingsStatus('Berechtigung gelöscht.', true);
            await loadPushoverSenderGrantsForCurrentUser();
        } catch (e) {
            console.error('PushoverProgram: Fehler beim Löschen der Sender-Berechtigung:', e);
            showPushoverSettingsStatus('Fehler beim Löschen der Berechtigung.', true);
        }
    };

    const loadAndRenderPushoverSettings = async () => {
        const recipientId = getPushoverSettingsRecipientId();
        if (!recipientId) {
            showPushoverSettingsStatus('Bitte anmelden, um Einstellungen zu ändern.', true);
            return;
        }
        if (!pushoverProgramsCollectionRef || !pushoverGrantsByRecipientCollectionRef) {
            showPushoverSettingsStatus('Bitte warten... (Firebase lädt noch)', true);
            return;
        }

        const apiTokenInput = document.getElementById('pushoverConfigApiToken');
        const userKeyInput = document.getElementById('pushoverConfigUserKey');

        const cfg = await loadPushoverProgramConfig(recipientId);

        const hasSetupInputs = Boolean(apiTokenInput && userKeyInput);
        if (hasSetupInputs) {
            if (cfg) {
                apiTokenInput.value = cfg.apiToken || '';
                userKeyInput.value = cfg.userKey || '';
                showPushoverSettingsStatus('Einstellungen geladen.', true);
            } else {
                clearPushoverSettingsForm();
                showPushoverSettingsStatus('Noch keine Einstellungen gespeichert. Bitte ausfüllen und speichern.', true);
            }
        } else {
            showPushoverSettingsStatus('Zugangsdaten werden zentral im PUSHMAIL-Center verwaltet.', true);
        }

        setPushoverSetupOpen(false);

        pushoverSelectedSenderId = null;
        setPushoverGrantEditorOpen(false);

        await loadPushoverSenderGrantsForCurrentUser();
    };

    const clearPushoverSendForm = () => {
        const titleInput = document.getElementById('pushoverTitle');
        const messageInput = document.getElementById('pushoverMessage');
        const titlePresetSelect = document.getElementById('pushoverTitlePreset');
        const messagePresetSelect = document.getElementById('pushoverMessagePreset');
        const prioritySelect = document.getElementById('pushoverPriority');
        const retryInput = document.getElementById('pushoverRetry');
        const expireInput = document.getElementById('pushoverExpire');
        const emergencyOptions = document.getElementById('pushoverEmergencyOptions');
        const grantedByEl = document.getElementById('pushoverGrantedBy');

        if (titleInput) titleInput.value = '';
        if (messageInput) messageInput.value = '';
        if (titlePresetSelect) titlePresetSelect.selectedIndex = 0;
        if (messagePresetSelect) messagePresetSelect.selectedIndex = 0;
        if (prioritySelect) prioritySelect.value = '0';
        if (retryInput) retryInput.value = '60';
        if (expireInput) expireInput.value = '3600';
        if (emergencyOptions) emergencyOptions.classList.add('hidden');
        if (grantedByEl) grantedByEl.textContent = '';
        pushoverSelectedRecipientId = null;

        const recipientSelect = document.getElementById('pushoverRecipient');
        if (recipientSelect) {
            recipientSelect.disabled = false;
            recipientSelect.value = '';
            if (recipientSelect.selectedIndex < 0) recipientSelect.selectedIndex = 0;
        }
        setPushoverSendDetailsOpen(false);
        setPushoverNoRecipientsNoticeOpen(false);
        updatePushoverSendButtonState();
    };

    // Event listener for the app header to navigate home
    appHeader.addEventListener('click', () => navigate('home'));

    // Central click handler for the main content area (für globale Elemente)
    document.querySelector('.main-content').addEventListener('click', function (e) {

        // --- Buttons on the home page ---
        if (e.target.closest('#mainSettingsButton')) { navigate('userSettings'); return; }
        if (e.target.closest('#mainAdminButton')) { navigate('admin'); return; }
        if (e.target.closest('#pushoverButton')) { navigate('pushover'); setPushoverViewMode('send'); loadPushoverRecipientsForSender(); return; }
        if (e.target.closest('#notrufSettingsButton')) { navigate('notrufSettings'); return; }

        if (e.target.closest('#pushoverSettingsToggleButton')) {
            const toggleBtn = document.getElementById('pushoverSettingsToggleButton');
            const currentMode = toggleBtn?.dataset?.mode || 'send';
            const next = currentMode === 'settings' ? 'send' : 'settings';
            const userPermissions = currentUser.permissions || [];
            const isSystemAdmin = currentUser.role === 'SYSTEMADMIN';
            if (next === 'settings' && !(isSystemAdmin || userPermissions.includes('PUSHOVER_SETTINGS_GRANTS'))) {
                alertUser('Zugriff verweigert (Einstellungen).', 'error');
                return;
            }
            setPushoverViewMode(next);
            if (next === 'settings') {
                loadAndRenderPushoverSettings();
            } else {
                loadPushoverRecipientsForSender();
            }
            return;
        }

        // --- "Back" buttons ---
        const backLink = e.target.closest('.back-link');
        if (backLink && backLink.dataset.target) { navigate(backLink.dataset.target); return; }

        // --- Container button in checklist settings ---
        const templateBtn = e.target.closest('#show-template-modal-btn');
        if (templateBtn) {
            const listIdInput = document.getElementById('checklist-settings-editor-switcher');
            const listId = listIdInput ? listIdInput.value : null;
            if (listId) { openTemplateModal(listId); }
            else { alertUser("Bitte wählen Sie zuerst eine Liste aus.", "error"); }
            return;
        }
    });

    // --- Navigation Cards on Home View ---
    const entranceCard = document.getElementById('entranceCard');
    if (entranceCard) entranceCard.addEventListener('click', () => navigate('entrance'));

    const pushmailCenterBar = document.getElementById('pushmailCenterBar');
    if (pushmailCenterBar) pushmailCenterBar.addEventListener('click', () => navigate('pushmailCenter'));

    setPushoverViewMode('send');
    loadPushoverRecipientsForSender();

    const essensberechnungCard = document.getElementById('essensberechnungCard');
    if (essensberechnungCard) essensberechnungCard.addEventListener('click', () => navigate('essensberechnung'));

    const currentChecklistCard = document.getElementById('currentChecklistCard');
    if (currentChecklistCard) currentChecklistCard.addEventListener('click', () => navigate('checklist'));

    const checklistSettingsCard = document.getElementById('checklistSettingsCard');
    if (checklistSettingsCard) checklistSettingsCard.addEventListener('click', () => navigate('checklistSettings'));

    const zahlungsverwaltungCard = document.getElementById('zahlungsverwaltungCard');
    if (zahlungsverwaltungCard) zahlungsverwaltungCard.addEventListener('click', () => navigate('zahlungsverwaltung'));

    const ticketSupportCard = document.getElementById('ticketSupportCard');
    if (ticketSupportCard) ticketSupportCard.addEventListener('click', () => navigate('ticketSupport'));

    const notizenCard = document.getElementById('notizenCard');
    if (notizenCard) notizenCard.addEventListener('click', () => navigate('notizen'));

    const wertguthabenCard = document.getElementById('wertguthabenCard');
    if (wertguthabenCard) wertguthabenCard.addEventListener('click', () => navigate('wertguthaben'));

    const lizenzenCard = document.getElementById('lizenzenCard');
    if (lizenzenCard) lizenzenCard.addEventListener('click', () => navigate('lizenzen'));

    const vertragsverwaltungCard = document.getElementById('vertragsverwaltungCard');
    if (vertragsverwaltungCard) vertragsverwaltungCard.addEventListener('click', () => navigate('vertragsverwaltung'));

    const sendungsverwaltungCard = document.getElementById('sendungsverwaltungCard');
    if (sendungsverwaltungCard) sendungsverwaltungCard.addEventListener('click', () => navigate('sendungsverwaltung'));

    const rezepteCard = document.getElementById('rezepteCard');
    if (rezepteCard) rezepteCard.addEventListener('click', () => navigate('rezepte'));

    const terminplanerCard = document.getElementById('terminplanerCard');
    if (terminplanerCard) terminplanerCard.addEventListener('click', () => navigate('terminplaner'));

    const toolsCard = document.getElementById('toolsCard');
    if (toolsCard) toolsCard.addEventListener('click', () => navigate('tools'));

    const maKarteToolCard = document.getElementById('maKarteToolCard');
    if (maKarteToolCard) maKarteToolCard.addEventListener('click', () => navigate('maKarte'));

    const haushaltszahlungenCard = document.getElementById('haushaltszahlungenCard');
    if (haushaltszahlungenCard) haushaltszahlungenCard.addEventListener('click', () => navigate('haushaltszahlungen'));

    const geschenkemanagementCard = document.getElementById('geschenkemanagementCard');
    if (geschenkemanagementCard) geschenkemanagementCard.addEventListener('click', () => navigate('geschenkemanagement'));

    // --- Modals (Login, Archived Lists etc.) ---
    const cancelSelectionButton = document.getElementById('cancelSelectionButton');
    if (cancelSelectionButton) cancelSelectionButton.addEventListener('click', () => { if (userSelectionModal) userSelectionModal.style.display = 'none'; });

    const backToSelectionButton = document.getElementById('backToSelectionButton');
    if (backToSelectionButton) backToSelectionButton.addEventListener('click', () => { if (pinModal) pinModal.style.display = 'none'; if (userSelectionModal) userSelectionModal.style.display = 'flex'; });

    const modalUserButtonsEl = document.getElementById('modalUserButtons');
    if (modalUserButtonsEl) {
        modalUserButtonsEl.addEventListener('click', (e) => {
            const button = e.target.closest('.select-user-button');
            if (!button || !pinModal) return;
            const user = USERS[button.dataset.user];
            const pinRegularContent = pinModal.querySelector('#pinRegularContent');
            const pinLockedContent = pinModal.querySelector('#pinLockedContent');
            if (!pinRegularContent || !pinLockedContent || !pinModalTitle || !adminPinInput || !pinError || !userSelectionModal) return;

            if (user && user.isActive) {
                selectedUserForLogin = button.dataset.user;
                userSelectionModal.style.display = 'none';
                pinRegularContent.style.display = 'block';
                pinLockedContent.style.display = 'none';
                pinModalTitle.textContent = `Schlüssel für ${user.name}`;
                adminPinInput.value = '';
                pinError.style.display = 'none';
                pinModal.style.display = 'flex';
                setTimeout(() => adminPinInput.focus(), 100);
            } else if (user && !user.isActive) {
                userSelectionModal.style.display = 'none';
                pinRegularContent.style.display = 'none';
                pinLockedContent.style.display = 'block';
                pinModal.style.display = 'flex';
            }
        });
    }

    const closeLockedModalButton = document.getElementById('closeLockedModalButton');
    if (closeLockedModalButton) {
        closeLockedModalButton.addEventListener('click', () => {
            if (pinModal) pinModal.style.display = 'none';
            if (userSelectionModal) userSelectionModal.style.display = 'flex';
        });
    }

    // ERSETZE deine komplette handleLogin Funktion hiermit:
    const handleLogin = async () => {
        if (!selectedUserForLogin || !adminPinInput || !pinModal || !pinError) {
            return;
        }

        const loginButton = submitAdminKeyButton;
        const loginLoadingOverlay = document.getElementById('loginLoadingOverlay');

        try {
            if (loginLoadingOverlay) {
                console.log("Login: Vollbild-Overlay wird angezeigt...");
                loginLoadingOverlay.style.display = 'flex';
            }
            if (loginButton) setButtonLoading(loginButton, true);
            adminPinInput.disabled = true;

            const appUserId = selectedUserForLogin;
            const enteredPin = adminPinInput.value;
            const userFromFirestore = USERS[appUserId];

            if (!userFromFirestore) {
                alertUser("Benutzerdaten noch nicht geladen. Bitte kurz warten und erneut versuchen.", "error");
                return;
            }
            // --- 3. KORREKTUR: Cloud Function mit dem Firebase SDK aufrufen (NICHT fetch) ---

            // Sicherstellen, dass Auth User vorhanden ist
            if (!auth || !auth.currentUser) {
                // Warten bis der User sicher da ist
                await new Promise((resolve, reject) => {
                    const unsubscribe = auth.onAuthStateChanged(user => {
                        unsubscribe();
                        if (user) { resolve(user); }
                        else { reject(new Error("Benutzer ist nicht bei Firebase angemeldet.")); }
                    });
                    setTimeout(() => reject(new Error("Timeout beim Warten auf Auth User.")), 5000);
                });
            }
            if (!auth.currentUser) { throw new Error("Benutzer konnte nicht authentifiziert werden."); }

            // ID Token holen (wird vom SDK automatisch im Header mitgesendet)
            await auth.currentUser.getIdToken(true);

            // Prüfen, ob die Funktion initialisiert wurde (aus initializeFirebase)
            if (!window.setRoleClaim) {
                throw new Error("Cloud Function (setRoleClaim) ist noch nicht initialisiert. Bitte warten.");
            }

            // Das Daten-Objekt, das wir an die 'onCall' Funktion senden.
            // Das SDK fügt den idToken automatisch hinzu.
            const dataToSend = {
                appUserId: appUserId,
                pin: enteredPin
                // KEIN idToken hier im Body!
            };

            // Aufruf mit dem httpsCallable (dem "neuen Schlüssel")
            const result = await window.setRoleClaim(dataToSend);

            // 4. Ergebnis der Cloud Function auswerten
            // Bei httpsCallable ist das Ergebnis direkt das "data" Objekt
            const responseData = result.data;

            // FEHLERPRÜFUNG: Wenn die Cloud Function einen Fehler wirft (throw new HttpsError),
            // landet der Code automatisch in der 'catch (error)' Sektion.
            // Wir prüfen hier nur, ob die Funktion 'status: "success"' zurückgegeben hat.
            if (responseData.status !== "success") {
                throw new Error("Cloud Function meldete: " + (responseData.message || "Unbekannter Fehler"));
            }

            // 5. Finales Token aktualisieren und UI updaten
            const idTokenResult = await auth.currentUser.getIdTokenResult(true);
            const newClaimRole = idTokenResult.claims.appRole || 'Keine Rolle zugewiesen';

            // =================================================================
            // SICHERHEITS-FIX: Lösche alle alten Benutzerdaten VOR dem neuen Login!
            // =================================================================
            clearAllUserData();
            // =================================================================

            // 6. Lokale Zustände aktualisieren
            localStorage.setItem(ADMIN_STORAGE_KEY, appUserId);
            await checkCurrentUserValidity();

            startUserDependentListeners();

            // PIN korrekt, Modal schließen
            pinModal.style.display = 'none';
            adminPinInput.value = '';
            pinError.style.display = 'none';
            const forgotPasswordLink = document.getElementById('forgotPasswordLink');
            if (forgotPasswordLink) forgotPasswordLink.style.display = 'none';

            // 7. Erfolgsmeldung
            alertUser(`Erfolgreich als ${userFromFirestore.name} angemeldet! Rolle: ${newClaimRole}`, "success");

        } catch (error) {
            // 8. Fehlerbehandlung
            console.error("Fehler beim Cloud Function Aufruf oder Token Refresh:", error);

            const errCode = String(error?.code || '');
            const errMsg = String(error?.message || '');
            const isInvalidPin = errCode === 'functions/permission-denied' || errCode === 'permission-denied' || errMsg.toLowerCase().includes('ungültiger pin');

            if (isInvalidPin) {
                pinError.style.display = 'block';
                const forgotPasswordLink = document.getElementById('forgotPasswordLink');
                if (forgotPasswordLink) forgotPasswordLink.style.display = 'block';
                adminPinInput.value = '';
                pinModal.style.display = 'flex';
                return;
            }

            // KORREKTUR: Zeige die Fehlermeldung der Cloud Function an
            // (z.B. "Ungültiger PIN." oder "Benutzer nicht authentifiziert.")
            alertUser(`Fehler: ${error.message || 'Interner Fehler'}`, "error");

            if (pinModal) pinModal.style.display = 'none';

            switchToGuestMode(false);
            updateUIForMode();

            startUserDependentListeners();
        } finally {
            adminPinInput.disabled = false;
            if (loginButton) setButtonLoading(loginButton, false);
            if (loginLoadingOverlay) {
                console.log("Login: Vollbild-Overlay wird ausgeblendet.");
                loginLoadingOverlay.style.display = 'none';
            }
        }
    };

    if (submitAdminKeyButton) submitAdminKeyButton.addEventListener('click', handleLogin);
    if (adminPinInput) adminPinInput.addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin());

    // --- Passwort-Vergessen Funktionalität ---
    const forgotPasswordLink = document.querySelector('#forgotPasswordLink a');
    const passwordResetModal = document.getElementById('passwordResetModal');
    const pushoverTokenInput = document.getElementById('pushoverTokenInput');
    const verifyTokenButton = document.getElementById('verifyTokenButton');
    const cancelPasswordResetButton = document.getElementById('cancelPasswordResetButton');
    const tokenError = document.getElementById('tokenError');
    const tokenSuccess = document.getElementById('tokenSuccess');

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (!selectedUserForLogin) {
                alertUser('Kein Benutzer ausgewählt.', 'error');
                return;
            }
            
            // Schließe Login-Modal und öffne Reset-Modal
            if (pinModal) pinModal.style.display = 'none';
            if (passwordResetModal) passwordResetModal.style.display = 'flex';
            if (pushoverTokenInput) pushoverTokenInput.value = '';
            if (tokenError) tokenError.style.display = 'none';
            if (tokenSuccess) tokenSuccess.style.display = 'none';
        });
    }

    if (cancelPasswordResetButton) {
        cancelPasswordResetButton.addEventListener('click', () => {
            if (passwordResetModal) passwordResetModal.style.display = 'none';
            if (pinModal) pinModal.style.display = 'flex';
        });
    }

    if (verifyTokenButton) {
        verifyTokenButton.addEventListener('click', async () => {
            await handlePasswordReset();
        });
    }
    
    if (pushoverTokenInput) {
        pushoverTokenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handlePasswordReset();
        });
    }

    const handlePasswordReset = async () => {
        if (!selectedUserForLogin || !pushoverTokenInput || !verifyTokenButton) return;
        
        const enteredToken = pushoverTokenInput.value.trim();
        if (!enteredToken) {
            alertUser('Bitte geben Sie Ihren Pushover User-Key ein.', 'error');
            return;
        }

        try {
            setButtonLoading(verifyTokenButton, true);
            if (tokenError) tokenError.style.display = 'none';
            if (tokenSuccess) tokenSuccess.style.display = 'none';

            const userId = selectedUserForLogin;

            // Prüfen ob Cloud Function verfügbar ist
            if (!window.sendPasswordReset) {
                throw new Error('Cloud Function (sendPasswordReset) ist noch nicht initialisiert. Bitte warten.');
            }

            // Cloud Function aufrufen
            const result = await window.sendPasswordReset({
                userId: userId,
                pushoverToken: enteredToken
            });

            const responseData = result.data;

            if (responseData.status !== 'success') {
                throw new Error(responseData.message || 'Unbekannter Fehler');
            }

            // Erfolgsmeldung anzeigen
            if (tokenSuccess) tokenSuccess.style.display = 'block';
            alertUser('Passwort wurde erfolgreich per Pushover gesendet!', 'success');
            
            // Modals schließen
            if (passwordResetModal) passwordResetModal.style.display = 'none';
            if (pinModal) {
                pinModal.style.display = 'flex';
                if (pinError) pinError.style.display = 'none';
                const forgotLink = document.getElementById('forgotPasswordLink');
                if (forgotLink) forgotLink.style.display = 'none';
            }

        } catch (error) {
            console.error('Fehler bei Passwort-Wiederherstellung:', error);
            alertUser('Fehler bei der Verifizierung. Bitte erneut versuchen.', 'error');
        } finally {
            setButtonLoading(verifyTokenButton, false);
        }
    };

    // --- Admin Section Toggles ---
    if (adminRightsToggle) adminRightsToggle.addEventListener('click', () => toggleAdminSection('adminRights'));
    if (roleSettingsToggle) roleSettingsToggle.addEventListener('click', () => toggleAdminSection('role'));
    if (passwordSettingsToggle) passwordSettingsToggle.addEventListener('click', () => toggleAdminSection('password'));
    if (userManagementToggle) userManagementToggle.addEventListener('click', () => toggleAdminSection('user'));
    if (approvalProcessToggle) approvalProcessToggle.addEventListener('click', () => toggleAdminSection('approval'));
    if (protocolHistoryToggle) protocolHistoryToggle.addEventListener('click', () => toggleAdminSection('protocol'));
    if (mainFunctionsToggle) mainFunctionsToggle.addEventListener('click', () => toggleAdminSection('mainFunctions'));

    // --- Entrance View Buttons ---
    document.querySelectorAll('#entranceView .action-button').forEach(button => {
        button.addEventListener('click', e => {
            const buttonEl = e.currentTarget;
            const delay = parseInt(buttonEl.dataset.delay, 10);
            const buttonTextEl = buttonEl.querySelector('.button-text');
            if (!buttonTextEl || isNaN(delay)) return;
            const originalText = buttonTextEl.textContent;

            const sendRequest = async () => {
                setButtonLoading(buttonEl, true);
                buttonTextEl.style.display = 'none';
                try {
                    await fetch(IFTTT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value1: delay }) });
                    alertUser(`Befehl "Öffnen" gesendet!`, 'success');
                } catch (error) {
                    alertUser('Fehler beim Senden des Befehls.', 'error');
                    console.error("IFTTT Error:", error);
                } finally {
                    setButtonLoading(buttonEl, false);
                    buttonTextEl.textContent = originalText;
                    buttonTextEl.style.display = 'inline-block';
                }
            };

            if (delay === 0) {
                sendRequest();
            } else {
                buttonEl.disabled = true;
                let countdown = delay;
                buttonTextEl.textContent = countdown.toString();
                const interval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        buttonTextEl.textContent = countdown.toString();
                    } else {
                        clearInterval(interval);
                        sendRequest();
                    }
                }, 1000);
            }
        });
    });

    // --- Pushover View Button ---
    const sendDynamicPostButton = document.getElementById('sendDynamicPostButton');
    if (sendDynamicPostButton) {
        if (!sendDynamicPostButton.dataset.listenerAttached) {
            sendDynamicPostButton.addEventListener('click', async (e) => {
                const buttonEl = e.currentTarget;
                const messageInput = document.getElementById('pushoverMessage');
                const recipientSelect = document.getElementById('pushoverRecipient');
                const titleInput = document.getElementById('pushoverTitle');
                const prioritySelect = document.getElementById('pushoverPriority');
                const retryInput = document.getElementById('pushoverRetry');
                const expireInput = document.getElementById('pushoverExpire');
                if (!messageInput || !recipientSelect || !titleInput || !prioritySelect) return;

                const recipientId = recipientSelect.value;
                if (!recipientId) return alertUser('Bitte Empfänger wählen.', 'error');

                const cfg = await loadPushoverProgramConfig(recipientId);
                if (!cfg || !cfg.apiToken || !cfg.userKey) {
                    return alertUser('Empfänger ist noch nicht eingerichtet (Token/User-Key fehlen).', 'error');
                }

                const grantMeta = pushoverRecipientGrantCache ? pushoverRecipientGrantCache[recipientId] : null;
                if (!grantMeta) {
                    return alertUser('Keine Berechtigung gefunden. Bitte Empfänger soll dich freischalten.', 'error');
                }

                const allowTitleFreeText = grantMeta.allowTitleFreeText === true;
                const allowMessageFreeText = grantMeta.allowMessageFreeText === true;
                const allowedTitles = Array.isArray(grantMeta.allowedTitles) ? grantMeta.allowedTitles : [];
                const allowedMessages = Array.isArray(grantMeta.allowedMessages) ? grantMeta.allowedMessages : [];
                const allowedPriorities = Array.isArray(grantMeta.allowedPriorities) ? grantMeta.allowedPriorities.map(v => toInt(v, 0)) : [0];
                const retryPresets = Array.isArray(grantMeta.retryPresets) ? grantMeta.retryPresets.map(v => toInt(v, 60)) : [];
                const expirePresets = Array.isArray(grantMeta.expirePresets) ? grantMeta.expirePresets.map(v => toInt(v, 3600)) : [];

                const message = String(messageInput.value || '').trim();
                const title = String(titleInput.value || '').trim();
                if (!title) return alertUser('Bitte Titel wählen/eingeben.', 'error');
                if (!message) return alertUser('Bitte Nachricht wählen/eingeben.', 'error');

                const priorityRaw = String(prioritySelect.value ?? '').trim();
                if (priorityRaw === '') return alertUser('Bitte Priorität wählen.', 'error');

                if (!allowTitleFreeText) {
                    if (!allowedTitles.length) {
                        return alertUser('Titel ist nicht erlaubt (keine Titel freigegeben).', 'error');
                    }
                    if (!allowedTitles.includes(title)) {
                        return alertUser('Titel ist nicht erlaubt.', 'error');
                    }
                }

                if (!allowMessageFreeText) {
                    if (!allowedMessages.length) {
                        return alertUser('Nachricht ist nicht erlaubt (keine Nachrichten freigegeben).', 'error');
                    }
                    if (!allowedMessages.includes(message)) {
                        return alertUser('Nachricht ist nicht erlaubt.', 'error');
                    }
                }

                const priority = toInt(prioritySelect.value, 0);

                if (allowedPriorities.length && !allowedPriorities.includes(priority)) {
                    return alertUser('Priorität ist nicht erlaubt.', 'error');
                }

                setButtonLoading(buttonEl, true);

                const formData = new FormData();
                formData.append('token', cfg.apiToken);
                formData.append('user', cfg.userKey);
                formData.append('title', title);
                formData.append('message', message);
                formData.append('priority', String(priority));

                if (priority === 2) {
                    const retry = toInt(retryInput?.value, 60);
                    const expire = toInt(expireInput?.value, 3600);
                    if (retry < 30 || expire < 30 || retry > 10800 || expire > 10800) {
                        setButtonLoading(buttonEl, false);
                        return alertUser('Retry/Expire muss zwischen 30 und 10800 Sekunden liegen.', 'error');
                    }

                    if (retryPresets.length && !retryPresets.includes(retry)) {
                        setButtonLoading(buttonEl, false);
                        return alertUser('Retry ist nicht erlaubt (kein gültiges Preset).', 'error');
                    }

                    if (expirePresets.length && !expirePresets.includes(expire)) {
                        setButtonLoading(buttonEl, false);
                        return alertUser('Expire ist nicht erlaubt (kein gültiges Preset).', 'error');
                    }

                    formData.append('retry', String(retry));
                    formData.append('expire', String(expire));
                }

                try {
                    console.log('PushoverProgram: Sende Nachricht an Empfänger:', recipientId);
                    const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: formData });
                    const data = await response.json();
                    if (data.status !== 1) throw new Error(data.errors ? data.errors.join(', ') : 'Unbekannter Pushover Fehler');
                    alertUser('Nachricht gesendet!', 'success');
                    messageInput.value = '';
                } catch (error) {
                    alertUser(`Fehler: ${error.message}`, 'error');
                } finally {
                    setButtonLoading(buttonEl, false);
                }
            });
            sendDynamicPostButton.dataset.listenerAttached = 'true';
        }
        updatePushoverSendButtonState();
    }

    const pushoverRecipientSelect = document.getElementById('pushoverRecipient');
    if (pushoverRecipientSelect && !pushoverRecipientSelect.dataset.listenerAttached) {
        pushoverRecipientSelect.addEventListener('change', async () => {
            const rid = pushoverRecipientSelect.value;
            pushoverSelectedRecipientId = rid;

            setPushoverNoRecipientsNoticeOpen(false);

            if (!rid) {
                setPushoverSendDetailsOpen(false);
                pushoverRecipientSelect.disabled = false;
                updatePushoverSendButtonState();
                return;
            }

            const cfg = await loadPushoverProgramConfig(rid);
            if (!cfg || !cfg.apiToken || !cfg.userKey) {
                alertUser('Empfänger ist noch nicht eingerichtet.', 'error');
                setPushoverSendDetailsOpen(false);
                pushoverRecipientSelect.disabled = false;
                updatePushoverSendButtonState();
                return;
            }

            applyPushoverConfigToSendForm(rid, cfg);
            setPushoverSendDetailsOpen(true);
            pushoverRecipientSelect.disabled = true;
            updatePushoverSendButtonState();
        });
        pushoverRecipientSelect.dataset.listenerAttached = 'true';
    }

    const titlePresetSelect = document.getElementById('pushoverTitlePreset');
    if (titlePresetSelect && !titlePresetSelect.dataset.listenerAttached) {
        titlePresetSelect.addEventListener('change', () => {
            const titleInput = document.getElementById('pushoverTitle');
            if (titleInput) titleInput.value = titlePresetSelect.value || '';
            updatePushoverSendButtonState();
        });
        titlePresetSelect.dataset.listenerAttached = 'true';
    }

    const messagePresetSelect = document.getElementById('pushoverMessagePreset');
    if (messagePresetSelect && !messagePresetSelect.dataset.listenerAttached) {
        messagePresetSelect.addEventListener('change', () => {
            const messageInput = document.getElementById('pushoverMessage');
            if (messageInput) messageInput.value = messagePresetSelect.value || '';
            updatePushoverSendButtonState();
        });
        messagePresetSelect.dataset.listenerAttached = 'true';
    }

    const prioritySelect = document.getElementById('pushoverPriority');
    if (prioritySelect && !prioritySelect.dataset.listenerAttached) {
        prioritySelect.addEventListener('change', () => {
            const emergencyOptions = document.getElementById('pushoverEmergencyOptions');
            if (!emergencyOptions) return;
            const show = toInt(prioritySelect.value, 0) === 2;
            emergencyOptions.classList.toggle('hidden', !show);
            updatePushoverSendButtonState();
        });
        prioritySelect.dataset.listenerAttached = 'true';
    }

    const pushoverTitleInput = document.getElementById('pushoverTitle');
    if (pushoverTitleInput && !pushoverTitleInput.dataset.listenerAttached) {
        pushoverTitleInput.addEventListener('input', () => {
            updatePushoverSendButtonState();
        });
        pushoverTitleInput.dataset.listenerAttached = 'true';
    }

    const pushoverMessageInput = document.getElementById('pushoverMessage');
    if (pushoverMessageInput && !pushoverMessageInput.dataset.listenerAttached) {
        pushoverMessageInput.addEventListener('input', () => {
            updatePushoverSendButtonState();
        });
        pushoverMessageInput.dataset.listenerAttached = 'true';
    }

    const retryPresetSelect = document.getElementById('pushoverRetryPreset');
    if (retryPresetSelect && !retryPresetSelect.dataset.listenerAttached) {
        retryPresetSelect.addEventListener('change', () => {
            const retryInput = document.getElementById('pushoverRetry');
            if (retryInput) retryInput.value = retryPresetSelect.value || retryInput.value;
        });
        retryPresetSelect.dataset.listenerAttached = 'true';
    }

    const expirePresetSelect = document.getElementById('pushoverExpirePreset');
    if (expirePresetSelect && !expirePresetSelect.dataset.listenerAttached) {
        expirePresetSelect.addEventListener('change', () => {
            const expireInput = document.getElementById('pushoverExpire');
            if (expireInput) expireInput.value = expirePresetSelect.value || expireInput.value;
        });
        expirePresetSelect.dataset.listenerAttached = 'true';
    }

    const clearPushoverFormButton = document.getElementById('clearPushoverFormButton');
    if (clearPushoverFormButton && !clearPushoverFormButton.dataset.listenerAttached) {
        clearPushoverFormButton.addEventListener('click', () => {
            clearPushoverSendForm();
        });
        clearPushoverFormButton.dataset.listenerAttached = 'true';
    }

    const pushoverSetupToggleButton = document.getElementById('pushoverSetupToggleButton');
    if (pushoverSetupToggleButton && !pushoverSetupToggleButton.dataset.listenerAttached) {
        pushoverSetupToggleButton.addEventListener('click', () => {
            const isOpen = pushoverSetupToggleButton.dataset.open === 'true';
            setPushoverSetupOpen(!isOpen);
        });
        pushoverSetupToggleButton.dataset.listenerAttached = 'true';
    }

    const savePushoverProgramConfigButton = document.getElementById('savePushoverProgramConfigButton');
    if (savePushoverProgramConfigButton && !savePushoverProgramConfigButton.dataset.listenerAttached) {
        savePushoverProgramConfigButton.addEventListener('click', async () => {
            await savePushoverProgramConfig();
        });
        savePushoverProgramConfigButton.dataset.listenerAttached = 'true';
    }

    const pushoverSenderGrantTiles = document.getElementById('pushoverSenderGrantTiles');
    if (pushoverSenderGrantTiles && !pushoverSenderGrantTiles.dataset.listenerAttached) {
        pushoverSenderGrantTiles.addEventListener('click', async (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.dataset.action;
            const senderId = btn.dataset.senderId;

            if (action === 'new') {
                const recipientId = getPushoverSettingsRecipientId();
                const availableUserIds = Object.keys(USERS || {})
                    .filter(uid => uid && uid !== recipientId)
                    .filter(uid => USERS[uid]?.isActive !== false)
                    .filter(uid => !Object.prototype.hasOwnProperty.call(pushoverSenderGrantCache || {}, uid));

                if (!availableUserIds.length) {
                    showPushoverSettingsStatus('Für alle Personen existiert bereits eine Berechtigung.', true);
                    return;
                }

                const chosen = await openPushoverGrantPersonPicker(availableUserIds);
                if (!chosen) {
                    return;
                }

                pushoverSelectedSenderId = chosen;
                applyPushoverSenderGrantToEditor(chosen, pushoverSenderGrantCache[chosen] || null);
                setPushoverGrantEditorOpen(true);
                renderPushoverSenderGrantTiles();
                return;
            }

            if (senderId) {
                pushoverSelectedSenderId = senderId;
                applyPushoverSenderGrantToEditor(senderId, pushoverSenderGrantCache[senderId] || null);
                setPushoverGrantEditorOpen(true);
                renderPushoverSenderGrantTiles();
            }
        });
        pushoverSenderGrantTiles.dataset.listenerAttached = 'true';
    }

    const closePushoverGrantEditorButton = document.getElementById('closePushoverGrantEditorButton');
    if (closePushoverGrantEditorButton && !closePushoverGrantEditorButton.dataset.listenerAttached) {
        closePushoverGrantEditorButton.addEventListener('click', () => {
            pushoverSelectedSenderId = null;
            clearPushoverSenderGrantEditor();
            setPushoverGrantEditorOpen(false);
            renderPushoverSenderGrantTiles();
        });
        closePushoverGrantEditorButton.dataset.listenerAttached = 'true';
    }

    const pushoverGrantSenderSelect = document.getElementById('pushoverGrantSenderSelect');
    if (pushoverGrantSenderSelect && !pushoverGrantSenderSelect.dataset.listenerAttached) {
        pushoverGrantSenderSelect.addEventListener('change', () => {
            const senderId = String(pushoverGrantSenderSelect.value || '').trim();
            pushoverSelectedSenderId = senderId || null;
            if (!senderId) {
                clearPushoverSenderGrantEditor();
                setPushoverGrantEditorOpen(false);
                renderPushoverSenderGrantTiles();
                return;
            }
            applyPushoverSenderGrantToEditor(senderId, pushoverSenderGrantCache[senderId] || null);
            setPushoverGrantEditorOpen(true);
            renderPushoverSenderGrantTiles();
            updatePushoverGrantSaveButtonState();
        });
        pushoverGrantSenderSelect.dataset.listenerAttached = 'true';
    }

    const pushoverGrantAllowedTitles = document.getElementById('pushoverGrantAllowedTitles');
    if (pushoverGrantAllowedTitles && !pushoverGrantAllowedTitles.dataset.listenerAttached) {
        pushoverGrantAllowedTitles.addEventListener('input', () => {
            updatePushoverGrantSaveButtonState();
        });
        pushoverGrantAllowedTitles.dataset.listenerAttached = 'true';
    }

    const pushoverGrantAllowedMessages = document.getElementById('pushoverGrantAllowedMessages');
    if (pushoverGrantAllowedMessages && !pushoverGrantAllowedMessages.dataset.listenerAttached) {
        pushoverGrantAllowedMessages.addEventListener('input', () => {
            updatePushoverGrantSaveButtonState();
        });
        pushoverGrantAllowedMessages.dataset.listenerAttached = 'true';
    }

    const pushoverGrantAllowTitleFreeText = document.getElementById('pushoverGrantAllowTitleFreeText');
    if (pushoverGrantAllowTitleFreeText && !pushoverGrantAllowTitleFreeText.dataset.listenerAttached) {
        pushoverGrantAllowTitleFreeText.addEventListener('change', () => {
            updatePushoverGrantSaveButtonState();
        });
        pushoverGrantAllowTitleFreeText.dataset.listenerAttached = 'true';
    }

    const pushoverGrantAllowMessageFreeText = document.getElementById('pushoverGrantAllowMessageFreeText');
    if (pushoverGrantAllowMessageFreeText && !pushoverGrantAllowMessageFreeText.dataset.listenerAttached) {
        pushoverGrantAllowMessageFreeText.addEventListener('change', () => {
            updatePushoverGrantSaveButtonState();
        });
        pushoverGrantAllowMessageFreeText.dataset.listenerAttached = 'true';
    }

    const pushoverGrantDefaultPriority = document.getElementById('pushoverGrantDefaultPriority');
    if (pushoverGrantDefaultPriority && !pushoverGrantDefaultPriority.dataset.listenerAttached) {
        pushoverGrantDefaultPriority.addEventListener('change', () => {
            updatePushoverGrantPriorityUI();
        });
        pushoverGrantDefaultPriority.dataset.listenerAttached = 'true';
    }

    const grantPriorityCheckboxIds = [
        'pushoverGrantPriorityMinus2',
        'pushoverGrantPriorityMinus1',
        'pushoverGrantPriority0',
        'pushoverGrantPriority1',
        'pushoverGrantPriority2'
    ];
    grantPriorityCheckboxIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.dataset.listenerAttached) return;
        el.addEventListener('change', () => {
            updatePushoverGrantPriorityUI();
        });
        el.dataset.listenerAttached = 'true';
    });

    const savePushoverSenderGrantButton = document.getElementById('savePushoverSenderGrantButton');
    if (savePushoverSenderGrantButton && !savePushoverSenderGrantButton.dataset.listenerAttached) {
        savePushoverSenderGrantButton.addEventListener('click', async () => {
            updatePushoverGrantSaveButtonState();
            if (savePushoverSenderGrantButton.disabled) {
                showPushoverSettingsStatus('Bitte Titel und Nachricht so konfigurieren, dass Senden möglich ist (Liste oder Freitext).', true);
                return;
            }
            await savePushoverSenderGrant();
        });
        savePushoverSenderGrantButton.dataset.listenerAttached = 'true';
    }
    updatePushoverGrantSaveButtonState();

    const deletePushoverSenderGrantButton = document.getElementById('deletePushoverSenderGrantButton');
    if (deletePushoverSenderGrantButton && !deletePushoverSenderGrantButton.dataset.listenerAttached) {
        deletePushoverSenderGrantButton.addEventListener('click', async () => {
            await deletePushoverSenderGrant();
        });
        deletePushoverSenderGrantButton.dataset.listenerAttached = 'true';
    }

    const sendNachrichtencenterButton = document.getElementById('sendNachrichtencenterButton');
    if (sendNachrichtencenterButton) {
        sendNachrichtencenterButton.addEventListener('click', async (e) => {
            const buttonEl = e.currentTarget;
            const messageInput = document.getElementById('nachrichtencenterMessage');
            const recipientRefInput = document.getElementById('nachrichtencenterRecipientRef');
            const recipientKeyInput = document.getElementById('nachrichtencenterRecipientKey');
            const titleInput = document.getElementById('nachrichtencenterTitle');
            const priorityInput = document.getElementById('nachrichtencenterPriority');
            const soundInput = document.getElementById('nachrichtencenterSound');
            const retryInput = document.getElementById('nachrichtencenterRetry');
            const expireInput = document.getElementById('nachrichtencenterExpire');
            if (!messageInput || !titleInput) return;

            const message = messageInput.value;
            if (!message) return alertUser('Bitte Nachricht eingeben.', 'error');

            const rawRecipientRefs = recipientRefInput ? String(recipientRefInput.value || '') : '';
            let recipientRefs = [];
            if (rawRecipientRefs) {
                try {
                    const parsed = JSON.parse(rawRecipientRefs);
                    if (Array.isArray(parsed)) recipientRefs = parsed.map(v => String(v || '').trim()).filter(Boolean);
                    else recipientRefs = [String(parsed || '').trim()].filter(Boolean);
                } catch (err) {
                    recipientRefs = [rawRecipientRefs];
                }
            }

            if (!recipientRefs.length) {
                return alertUser('Bitte Empfänger wählen.', 'error');
            }

            const priority = priorityInput ? parseInt(priorityInput.value, 10) : 0;
            const resolvedPriority = Number.isNaN(priority) ? 0 : priority;
            const sound = soundInput ? String(soundInput.value || '') : '';

            let retrySeconds = null;
            let expireSeconds = null;
            if (resolvedPriority === 2) {
                const rawRetry = retryInput ? parseInt(retryInput.value, 10) : 30;
                const rawExpire = expireInput ? parseInt(expireInput.value, 10) : 10800;
                retrySeconds = Number.isNaN(rawRetry) ? 30 : rawRetry;
                expireSeconds = Number.isNaN(rawExpire) ? 10800 : rawExpire;
                retrySeconds = Math.min(10800, Math.max(30, retrySeconds));
                expireSeconds = Math.min(10800, Math.max(30, expireSeconds));
                if (expireSeconds < retrySeconds) {
                    expireSeconds = retrySeconds;
                }
            }

            console.log('Nachrichtencenter: Sende Nachricht...');
            setButtonLoading(buttonEl, true);

            try {
                const errors = [];

                for (const recipientRef of recipientRefs) {
                    let recipientKey = '';

                    // Ein-Empfänger-Fallback: wenn Key bereits im hidden Input steht
                    if (recipientRefs.length === 1) {
                        recipientKey = recipientKeyInput ? String(recipientKeyInput.value || '') : '';
                    }

                    if (!recipientKey) {
                        try {
                            let recipientDocRef = null;
                            if (recipientRef.startsWith('global:')) {
                                const contactId = recipientRef.slice('global:'.length);
                                recipientDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'nachrichtencenter_global_contacts', contactId);
                            } else if (recipientRef.startsWith('private:')) {
                                const contactId = recipientRef.slice('private:'.length);
                                recipientDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'nachrichtencenter_private_contacts', currentUser.mode, 'contacts', contactId);
                            }

                            if (recipientDocRef) {
                                const snap = await getDoc(recipientDocRef);
                                if (snap.exists()) {
                                    const data = snap.data() || {};
                                    if (data.key) recipientKey = String(data.key);
                                }
                            }
                        } catch (err) {
                            console.warn('Nachrichtencenter: Fehler beim Laden des Empfängers:', err);
                        }
                    }

                    if (!recipientKey) {
                        errors.push('Empfänger-Schlüssel nicht gefunden');
                        continue;
                    }

                    const formData = new FormData();
                    formData.append('token', PUSHOVER_TOKEN);
                    formData.append('user', recipientKey);
                    formData.append('title', titleInput.value);
                    formData.append('message', message);
                    formData.append('priority', String(resolvedPriority));
                    if (sound) {
                        formData.append('sound', sound);
                    }
                    if (resolvedPriority === 2 && retrySeconds !== null && expireSeconds !== null) {
                        formData.append('retry', String(retrySeconds));
                        formData.append('expire', String(expireSeconds));
                    }

                    const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: formData });
                    const data = await response.json();
                    if (data.status !== 1) {
                        errors.push(data.errors ? data.errors.join(', ') : 'Unbekannter Pushover Fehler');
                    }
                }

                if (errors.length) {
                    throw new Error(errors[0]);
                }

                alertUser(`Nachricht gesendet! (${recipientRefs.length} Empfänger)`, 'success');
                if (titleInput) titleInput.value = '';
                if (recipientRefInput) recipientRefInput.value = '';
                if (recipientKeyInput) recipientKeyInput.value = '';
                const recipientDisplay = document.getElementById('nachrichtencenterRecipientDisplay');
                if (recipientDisplay) {
                    recipientDisplay.innerHTML = '<span class="text-gray-400 italic">Kein Empfänger ausgewählt</span>';
                }
                console.log('Nachrichtencenter: Formular zurückgesetzt');
            } catch (e) {
                console.error('Fehler beim Senden:', e);
                alertUser('Fehler beim Senden: ' + e.message, 'error');
            } finally {
                setButtonLoading(buttonEl, false);
            }
        });
    }

    // ... rest of the code remains the same ...
    // --- User Settings View Button ---
    const userSettingsSaveKeyButton = document.getElementById('userSettingsSaveKeyButton');
    if (userSettingsSaveKeyButton) {
        userSettingsSaveKeyButton.addEventListener('click', async () => {
            const newKeyInput = document.getElementById('userSettingsNewKeyInput');
            if (!newKeyInput || !currentUser || !currentUser.mode || !usersCollectionRef) return;

            const newKey = newKeyInput.value;
            if (newKey.length < 4) return alertUser("Der Schlüssel muss mindestens 4 Zeichen lang sein.", "error");

            try {
                if (!window.setUserKey) {
                    throw new Error("Cloud Function (setUserKey) ist noch nicht initialisiert. Bitte warten.");
                }
                await window.setUserKey({ appUserId: currentUser.mode, newKey });
                await logAdminAction('self_password_changed', `Eigenes Passwort geändert.`);
                alertUser(`Ihr Schlüssel wurde erfolgreich aktualisiert!`, "success");

                const userKeyDisplayEl = document.getElementById('currentUserKeyDisplay');
                if (userKeyDisplayEl) {
                    userKeyDisplayEl.innerHTML = `<p class="text-lg">Dein aktuelles Passwort lautet: <strong class="font-bold">${newKey}</strong></p>`;
                    userKeyDisplayEl.style.display = 'block';
                }
                newKeyInput.value = '';
            } catch (error) {
                console.error("Fehler beim Speichern des Passworts:", error);
                alertUser("Fehler beim Speichern des Schlüssels.", "error");
            }
        });
    }


    // --- Archived Lists Modal ---
    const closeArchivedModalBtn = document.getElementById('closeArchivedListsModal');
    if (closeArchivedModalBtn) {
        closeArchivedModalBtn.addEventListener('click', () => {
            const modal = document.getElementById('archivedListsModal');
            if (modal) modal.style.display = 'none';
        });
    }

    const archivedListsContainer = document.getElementById('archivedListsContainer');
    if (archivedListsContainer && !archivedListsContainer.dataset.listenerAttached) {
        archivedListsContainer.addEventListener('click', async (e) => {
            const restoreBtn = e.target.closest('.restore-archived-btn');
            const deleteBtn = e.target.closest('.delete-archived-btn');
            if (!checklistsCollectionRef) return;

            if (restoreBtn) {
                const listId = restoreBtn.dataset.listId;
                if (!listId) return;
                try {
                    await updateDoc(doc(checklistsCollectionRef, listId), { isArchived: false, archivedAt: null, archivedBy: null });
                    alertUser("Liste wurde aus dem Archiv wiederhergestellt.", "success");
                } catch (error) {
                    console.error("Fehler beim Wiederherstellen:", error);
                    alertUser("Fehler beim Wiederherstellen.", "error");
                }
            }

            if (deleteBtn) {
                const listId = deleteBtn.dataset.listId;
                if (!listId) return;
                const listName = ARCHIVED_CHECKLISTS[listId]?.name || `Liste ID ${listId}`;
                const confirmation = prompt(`Um die Liste "${listName}" endgültig in den Papierkorb zu verschieben, geben Sie bitte "LISTE LÖSCHEN" ein:`);
                if (confirmation === 'LISTE LÖSCHEN') {
                    try {
                        await updateDoc(doc(checklistsCollectionRef, listId), { isDeleted: true, isArchived: false, deletedAt: serverTimestamp(), deletedBy: currentUser.displayName });
                        alertUser(`Liste "${listName}" wurde in den Papierkorb verschoben.`, "success");
                    } catch (error) {
                        console.error("Fehler beim Verschieben in Papierkorb:", error);
                        alertUser("Fehler beim Verschieben in den Papierkorb.", "error");
                    }
                } else if (confirmation !== null) {
                    alertUser("Löschvorgang abgebrochen.", "info");
                }
            }
        });
        archivedListsContainer.dataset.listenerAttached = 'true';
    }

    // --- API Token Modal ---
    const apiTokenModal = document.getElementById('apiTokenBookModal');
    if (apiTokenModal && !apiTokenModal.dataset.listenerAttached) {
        // ... (Inhalt des Listeners bleibt gleich) ...
        apiTokenModal.dataset.listenerAttached = 'true';
    }


    // --- Sound Book Modal ---
    const soundModal = document.getElementById('soundBookModal');
    if (soundModal && !soundModal.dataset.listenerAttached) {
        // ... (Inhalt des Listeners bleibt gleich) ...
        soundModal.dataset.listenerAttached = 'true';
    }

    console.log("setupEventListeners: Alle Basis-Listener hinzugefügt.");
}
