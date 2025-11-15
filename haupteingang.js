// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, query, where, serverTimestamp, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { checkCurrentUserValidity, updateUIForMode, switchToGuestMode } from './log-InOut.js';
import { renderModalUserButtons, listenForUserUpdates, toggleNewUserRoleField, addAdminUserManagementListeners, renderUserManagement } from './admin_benutzersteuerung.js';
import { listenForRoleUpdates, listenForAdminRoleUpdates, renderRoleManagement } from './admin_rollenverwaltung.js';
import { listenForApprovalRequests, createApprovalRequest, renderApprovalProcess } from './admin_genehmigungsprozess.js';
import { toggleAdminSection, rememberAdminScroll, restoreAdminScrollIfAny, renderMainFunctionsAdminArea } from './admin_adminfunktionenHome.js';
import { initializeEssensberechnungView } from './essensberechnung.js';
import { IFTTT_URL, initializeNotrufSettingsView } from './notfall.js';
import { PUSHOVER_TOKEN, RECIPIENT_KEYS } from './pushbenachrichtigung.js';
import { listenForChecklistGroups, listenForChecklistItems, listenForChecklists, listenForChecklistCategories, openTemplateModal, renderChecklistView, renderChecklistSettingsView, listenForTemplates, listenForStacks } from './checklist.js';
import { logAdminAction, renderProtocolHistory } from './admin_protokollHistory.js';
import { renderUserKeyList } from './admin_benutzersteuerung.js'; 
// NEU: Wir importieren die Start-Funktion aus deiner neuen Datei
import { initializeTerminplanerView, listenForPublicVotes, joinVoteById, joinVoteByToken, joinVoteAsGuest } from './terminplaner.js';
// // ENDE-ZIKA //


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
export let tempSelectedApiTokenId = null; // Für das Bearbeiten-Formular
export let tempSelectedSoundId = null;
// Für das Bearbeiten-Formular
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
// NEU: Wir fügen "votesCollectionRef" hinzu, wie von dir gewünscht (für "vote")
export let usersCollectionRef, rolesCollectionRef, roleChangeRequestsCollectionRef, settingsDocRef, auditLogCollectionRef, votesCollectionRef;
export let activeDisplayMode = 'gesamt';
export let checklistStacksCollectionRef;
export let checklistTemplatesCollectionRef;
let editingPortionId = null;

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
export const appId = typeof __app_id !== 'undefined' ? __app_id : '20LVob88b3ovXRUyX3ra';
export const usingEnvConfig = typeof __firebase_config !== 'undefined' && __firebase_config;
export const firebaseConfig = usingEnvConfig ? JSON.parse(__firebase_config) : firebaseConfigFromUser;

// NEU: Wir fügen 'terminplaner' zu unserer Liste der bekannten Seiten (Views) hinzu
export const views = { 
    home: { id: 'homeView' }, 
    entrance: { id: 'entranceView' }, 
    pushover: { id: 'pushoverView' }, 
    admin: { id: 'adminView' }, 
    userSettings: { id: 'userSettingsView' }, 
    checklist: { id: 'checklistView' }, 
    checklistSettings: { id: 'checklistSettingsView' }, 
    essensberechnung: { id: 'essensberechnungView' }, 
    notrufSettings: { id: 'notrufSettingsView' },
    terminplaner: { id: 'terminplanerView' } // <-- NEU HINZUGEFÜGT
};
const viewElements = Object.fromEntries(Object.keys(views).map(key => [key + 'View', document.getElementById(views[key].id)]));

export let currentMeal = {
    name: '',
    singleProducts: [], // { id, name, weight }
    recipes: [],        // { id, name, ingredients: [{...}] }
    userInputDistribution: [], // { id, portionName, personId, personName, anzahl, productInputs: [{productId, mode, value}] }
    calculateRest: false,
    finalDistribution: []
};

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

    modalUserButtons = document.getElementById('modalUserButtons');
    const distributionList = document.getElementById('distribution-list');
    const appHeader = document.getElementById('appHeader');
    const footerModeHandler = document.getElementById('footerModeHandler');
    const modeTextDisplay = document.getElementById('modeTextDisplay');
    const userSelectionModal = document.getElementById('userSelectionModal');
    pinModal = document.getElementById('pinModal');
    const pinModalTitle = document.getElementById('pinModalTitle');
    adminPinInput = document.getElementById('adminPinInput');
    pinError = document.getElementById('pinError');
    const mainSettingsButton = document.getElementById('mainSettingsButton');
    const adminRightsSection = document.getElementById('adminRightsSection');
    adminRightsToggle = document.getElementById('adminRightsToggle');
    submitAdminKeyButton = document.getElementById('submitAdminKeyButton');
    const adminRightsArea = document.getElementById('adminRightsArea');
    const adminRightsToggleIcon = document.getElementById('adminRightsToggleIcon');
    const roleManagementSection = document.getElementById('roleManagementSection');
    const roleSettingsToggle = document.getElementById('roleSettingsToggle');
    const roleManagementArea = document.getElementById('roleManagementArea');
    const roleToggleIcon = document.getElementById('roleToggleIcon');
    const passwordSection = document.getElementById('passwordSection');
    const passwordSettingsToggle = document.getElementById('passwordSettingsToggle');
    const passwordManagementArea = document.getElementById('passwordManagementArea');
    const passwordToggleIcon = document.getElementById('passwordToggleIcon');
    const userSection = document.getElementById('userSection');
    const userManagementToggle = document.getElementById('userManagementToggle');
    const userManagementArea = document.getElementById('userManagementArea');
    const userManagementToggleIcon = document.getElementById('userManagementToggleIcon');
    const approvalProcessSection = document.getElementById('approvalProcessSection');
    const approvalProcessToggle = document.getElementById('approvalProcessToggle');
    const approvalProcessArea = document.getElementById('approvalProcessArea');
    const approvalToggleIcon = document.getElementById('approvalToggleIcon');
    const protocolHistorySection = document.getElementById('protocolHistorySection');
    const protocolHistoryToggle = document.getElementById('protocolHistoryToggle');
    const protocolHistoryArea = document.getElementById('protocolHistoryArea');
    const protocolHistoryToggleIcon = document.getElementById('protocolHistoryToggleIcon');
    const noAdminPermissionsPrompt = document.getElementById('noAdminPermissionsPrompt');
    const mainFunctionsSection = document.getElementById('mainFunctionsSection');
    const mainFunctionsToggle = document.getElementById('mainFunctionsToggle');
    const mainFunctionsArea = document.getElementById('mainFunctionsArea');
    const mainFunctionsToggleIcon = document.getElementById('mainFunctionsToggleIcon');
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

// ERSETZE diese komplette Funktion in haupteingang.js
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
                
                // =========================================================
                // START BUG 5 FIX (Lösung B)
                // =========================================================
                // Wir definieren hier die "Telefonnummer" zu unserem neuen Mitarbeiter
                window.checkVoteToken = httpsCallable(functions, 'checkVoteToken');
                // =========================================================
                // END BUG 5 FIX
                // =========================================================
                
                window.firebaseFunctionsInitialised = true;
                console.log("Firebase Functions initialisiert und global verfügbar gemacht.");
            }
            
            // Listener starten (unabhängig vom Login-Status)
            try {
                console.log("initializeFirebase: Starte Daten-Listener...");
                
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
                }, (error) => {
                    console.error("Error listening to notruf settings:", error); 
                });

                listenForRoleUpdates();
                listenForAdminRoleUpdates();
                listenForUserUpdates();
                listenForApprovalRequests();
                listenForChecklists();
                listenForChecklistItems();
                listenForChecklistGroups();
                listenForChecklistCategories();
                listenForTemplates();
                listenForStacks();
                
                if (typeof listenForPublicVotes === 'function') {
                    listenForPublicVotes();
                } else {
                    console.error("Fehler: listenForPublicVotes ist nicht importiert!");
                }


            } catch (error) {
                console.error("initializeFirebase: FEHLER beim Starten der Listener:", error);
                alertUser("Fehler beim Initialisieren der Daten-Listener.", "error");
            }

            // UI basierend auf User-Status aktualisieren
            if (user) {
                console.log("initializeFirebase: User (anonym) vorhanden. Rufe checkCurrentUserValidity auf.");
                await checkCurrentUserValidity(); 
                initialAuthCheckDone = true; 
                initializeTerminplanerView(); 
                
            } else {
                console.log("Firebase meldet KEINEN User, wechsle explizit zum Gastmodus.");
                switchToGuestMode(false);
                 initialAuthCheckDone = true;
                 updateUIForMode(); 
                 initializeTerminplanerView(); 
            }
            
            // =================================================================
            // URL-PRÜFUNG (Problem 3 Anpassung)
            // =================================================================
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const voteId = urlParams.get('vote_id');
                const voteToken = urlParams.get('vote_token');
                const view = urlParams.get('view'); 
                
                // =================================================================
                // START NEU (P3): Gast-Link-Parameter
                // =================================================================
                const guestId = urlParams.get('guest_id');
                // =================================================================
                // ENDE NEU (P3)
                // =================================================================

                // Prüfe, ob die URL "sauber" ist
                const isUrlClean = !voteId && !voteToken && !view && !guestId;

                if (!isUrlClean) {
                    
                    // =================================================================
                    // START NEU (P3): Priorisierte Prüfung für Gast-Links
                    // =================================================================
                    // Fall 1: Wichtigster Fall - Ein Gast-per-Link
                    if (voteId && guestId) {
                        console.log("[P3] URL-Parameter 'vote_id' UND 'guest_id' gefunden, starte joinVoteAsGuest...");
                        await joinVoteAsGuest(voteId, guestId); 
                        // (cleanUrlParams() wird von joinVoteAsGuest intern aufgerufen)
                    
                    // Fall 2: Normaler Beitritt per ID
                    } else if (voteId) {
                    // =================================================================
                    // ENDE NEU (P3)
                    // =================================================================
                    
                        console.log("URL-Parameter 'vote_id' gefunden, starte joinVoteById...");
                        await joinVoteById(voteId); 
                    
                    // Fall 3: Normaler Beitritt per Token
                    } else if (voteToken) {
                        console.log("URL-Parameter 'vote_token' gefunden, starte joinVoteByToken...");
                        await joinVoteByToken(voteToken); 
                    
                    // Fall 4: Navigation zur Ansicht
                    } else if (view === 'terminplaner') {
                        console.log("URL-Parameter 'view=terminplaner' gefunden, navigiere...");
                        navigate('terminplaner');
                        cleanUrlParams();
                    }
                }
            } catch (e) {
                console.error("Fehler bei der URL-Parameter-Prüfung:", e);
            }
            // =================================================================
            // ENDE DER URL-PRÜFUNG
            // =================================================================

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
                SYSTEMADMIN: { name: 'Systemadmin', permissions: ['ENTRANCE', 'PUSHOVER', 'CHECKLIST', 'CHECKLIST_SWITCH', 'CHECKLIST_SETTINGS', 'ESSENSBERECHNUNG'], deletable: false },
                ADMIN: { name: 'Admin', permissions: ['ENTRANCE', 'PUSHOVER'], deletable: false },
                ANGEMELDET: { name: 'Angemeldet', permissions: ['ENTRANCE'], deletable: true },
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
    }

    const tempAlert = document.createElement('div');
    tempAlert.textContent = message;
    
    tempAlert.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-4 rounded-xl text-white font-bold shadow-lg transition-opacity duration-300 z-50 text-center ${colorClass}`;
    
    document.body.appendChild(tempAlert);
    setTimeout(() => tempAlert.style.opacity = '1', 10);

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

export function navigate(targetViewName) {
    console.log(`Navigiere zu: ${targetViewName}`); // Log Navigation
    const targetView = views[targetViewName];
    if (!targetView) {
        console.error(`Navigation fehlgeschlagen: View "${targetViewName}" nicht gefunden.`);
        return;
    }

    // Berechtigungsprüfung (bleibt gleich)
    const userPermissions = currentUser.permissions || [];
    const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SYSTEMADMIN';
    
    // NEU: Wir machen eine Ausnahme für 'terminplaner'.
    // Diese Seite darf immer aufgerufen werden (für den Token-Beitritt).
    if (targetViewName !== 'terminplaner') {
        if (targetViewName === 'entrance' && !userPermissions.includes('ENTRANCE')) return alertUser("Zugriff verweigert (Eingang).", 'error');
        if (targetViewName === 'pushover' && !userPermissions.includes('PUSHOVER')) return alertUser("Zugriff verweigert (Push).", 'error');
        if (targetViewName === 'checklist' && !userPermissions.includes('CHECKLIST')) return alertUser("Zugriff verweigert (Checkliste).", 'error');
        if (targetViewName === 'checklistSettings' && !userPermissions.includes('CHECKLIST_SETTINGS')) return alertUser("Zugriff verweigert (Checklisten-Einstellungen).", 'error');
        if (targetViewName === 'essensberechnung' && !userPermissions.includes('ESSENSBERECHNUNG')) return alertUser("Zugriff verweigert (Essensberechnung).", 'error');

        if (targetViewName === 'admin') {
            const isAdminRole = currentUser.role === 'ADMIN' || currentUser.role === 'SYSTEMADMIN'; 
            const isIndividualAdminDisplay = currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN'; 
            const allowAdminAccess = isAdminRole || isIndividualAdminDisplay; 

            if (!allowAdminAccess) {
                return alertUser("Zugriff verweigert (Admin).", 'error');
            }
        }
        if (targetViewName === 'notrufSettings' && !userPermissions.includes('PUSHOVER')) return alertUser("Zugriff verweigert (Notruf-Einstellungen).", 'error');
    }
    // HIER ENDET DIE AUSNAHME


    // Scroll zum Anfang
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;

    // Alle Views ausblenden, Ziel-View einblenden
    Object.values(viewElements).forEach(el => el && el.classList.remove('active'));
    const targetElement = document.getElementById(targetView.id);
    if (targetElement) {
        targetElement.classList.add('active');
    } else {
        console.error(`Navigation fehlgeschlagen: Element mit ID "${targetView.id}" nicht gefunden.`);
        const homeElement = document.getElementById(views.home.id);
        if (homeElement) homeElement.classList.add('active'); // Fallback
        return;
    }

    // UI basierend auf Modus aktualisieren
    updateUIForMode();

    // View-spezifische Initialisierungen
    if (targetViewName === 'userSettings') {
        const userNameEl = document.getElementById('userSettingsName');
        const userKeyDisplayEl = document.getElementById('currentUserKeyDisplay');
        if (userNameEl) userNameEl.textContent = `Passwort für ${currentUser.displayName} ändern`;
        if (userKeyDisplayEl) {
            const user = USERS[currentUser.mode];
            userKeyDisplayEl.style.display = user?.key ? 'block' : 'none';
            if (user?.key) userKeyDisplayEl.innerHTML = `<p class="text-lg">Dein aktuelles Passwort lautet: <strong class="font-bold">${user.key}</strong></p>`;
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
    
    // NEU: Wir müssen nichts tun, wenn 'terminplaner' aufgerufen wird,
    // da die Initialisierung schon in initializeFirebase() passiert.
}

export function setupEventListeners() {
    // Sicherstellen, dass die Elemente existieren, bevor Listener hinzugefügt werden
    if (!appHeader || !document.querySelector('.main-content') || !document.getElementById('entranceCard')) {
        console.warn("setupEventListeners: Wichtige Elemente noch nicht bereit, versuche später erneut.");
        return;
    }
    console.log("setupEventListeners: Füge Basis-Listener hinzu...");

    // Event listener for the app header to navigate home
    appHeader.addEventListener('click', () => navigate('home'));

    // Central click handler for the main content area (für globale Elemente)
    document.querySelector('.main-content').addEventListener('click', function (e) {
        // --- Buttons on the home page ---
        if (e.target.closest('#mainSettingsButton')) { navigate('userSettings'); return; }
        if (e.target.closest('#mainAdminButton')) { navigate('admin'); return; }
        if (e.target.closest('#pushoverButton')) { navigate('pushover'); return; }
        if (e.target.closest('#notrufSettingsButton')) { navigate('notrufSettings'); return; }

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

    const essensberechnungCard = document.getElementById('essensberechnungCard');
    if (essensberechnungCard) essensberechnungCard.addEventListener('click', () => navigate('essensberechnung'));

    const currentChecklistCard = document.getElementById('currentChecklistCard');
    if (currentChecklistCard) currentChecklistCard.addEventListener('click', () => navigate('checklist')); 

    const checklistSettingsCard = document.getElementById('checklistSettingsCard');
    if (checklistSettingsCard) checklistSettingsCard.addEventListener('click', () => navigate('checklistSettings'));

    // NEU: Wir fügen den Listener für deine neue Terminplaner-Karte hinzu
    const terminplanerCard = document.getElementById('terminplanerCard');
    if (terminplanerCard) terminplanerCard.addEventListener('click', () => navigate('terminplaner'));


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

    const appUserId = selectedUserForLogin;
    const enteredPin = adminPinInput.value;
    const userFromFirestore = USERS[appUserId];

    if (!userFromFirestore) {
        alertUser("Benutzerdaten noch nicht geladen. Bitte kurz warten und erneut versuchen.", "error");
        return;
    }

    // 1. Lokale PIN-Prüfung
    if (userFromFirestore.key !== enteredPin) {
        pinError.style.display = 'block';
        adminPinInput.value = '';
        return;
    }

    // 2. PIN korrekt, Modal schließen
    pinModal.style.display = 'none';
    adminPinInput.value = '';
    pinError.style.display = 'none';

    try {
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

        // 6. Lokale Zustände aktualisieren
        localStorage.setItem(ADMIN_STORAGE_KEY, appUserId);
        await checkCurrentUserValidity(); 

        // 7. Erfolgsmeldung
        alertUser(`Erfolgreich als ${userFromFirestore.name} angemeldet! Rolle: ${newClaimRole}`, "success");

    } catch (error) {
        // 8. Fehlerbehandlung
        console.error("Fehler beim Cloud Function Aufruf oder Token Refresh:", error);
        
        // KORREKTUR: Zeige die Fehlermeldung der Cloud Function an
        // (z.B. "Ungültiger PIN." oder "Benutzer nicht authentifiziert.")
        alertUser(`Fehler: ${error.message || 'Interner Fehler'}`, "error");
        
        switchToGuestMode(false);
        updateUIForMode();
    }
};

    if (submitAdminKeyButton) submitAdminKeyButton.addEventListener('click', handleLogin);
    if (adminPinInput) adminPinInput.addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin());

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
        sendDynamicPostButton.addEventListener('click', async (e) => {
            const buttonEl = e.currentTarget;
            const messageInput = document.getElementById('pushoverMessage');
            const recipientSelect = document.getElementById('pushoverRecipient');
            const titleInput = document.getElementById('pushoverTitle');
            if (!messageInput || !recipientSelect || !titleInput) return;

            const message = messageInput.value;
            if (!message) return alertUser('Bitte Nachricht eingeben.', 'error');
            setButtonLoading(buttonEl, true);

            const formData = new FormData();
            formData.append('token', PUSHOVER_TOKEN);
            const recipientKey = RECIPIENT_KEYS ? RECIPIENT_KEYS[recipientSelect.value] : null;
            if (!recipientKey) {
                alertUser('Fehler: Empfänger-Schlüssel nicht gefunden.', 'error');
                setButtonLoading(buttonEl, false);
                return;
            }
            formData.append('user', recipientKey);
            formData.append('title', titleInput.value);
            formData.append('message', message);

            try {
                const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: formData });
                const data = await response.json();
                if (data.status !== 1) throw new Error(data.errors ? data.errors.join(', ') : 'Unbekannter Pushover Fehler');
                alertUser('Nachricht gesendet!', 'success');
                messageInput.value = ''; // Nachricht leeren
            } catch (error) {
                alertUser(`Fehler: ${error.message}`, 'error');
            } finally {
                setButtonLoading(buttonEl, false);
            }
        });
    }

    // --- User Settings View Button ---
    const userSettingsSaveKeyButton = document.getElementById('userSettingsSaveKeyButton');
    if (userSettingsSaveKeyButton) {
        userSettingsSaveKeyButton.addEventListener('click', async () => {
            const newKeyInput = document.getElementById('userSettingsNewKeyInput');
            if (!newKeyInput || !currentUser || !currentUser.mode || !usersCollectionRef) return;

            const newKey = newKeyInput.value;
            if (newKey.length < 4) return alertUser("Der Schlüssel muss mindestens 4 Zeichen lang sein.", "error");

            try {
                await updateDoc(doc(usersCollectionRef, currentUser.mode), { key: newKey });
                await logAdminAction('self_password_changed', `Eigenes Passwort geändert.`);
                alertUser(`Ihr Schlüssel wurde erfolgreich aktualisiert!`, "success");
                if (USERS[currentUser.mode]) USERS[currentUser.mode].key = newKey;

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
} // Ende setupEventListeners