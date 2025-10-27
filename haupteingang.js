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
import { renderUserKeyList } from './admin_benutzersteuerung.js'; // <-- KORRIGIERT
// // ENDE-ZIKA //


// BEGINN-ZIKA: LET-BEFEHLE IMMER NACH IMPORT-BEFEHLE //
export let USERS = {};
export let CHECKLISTS = {};
export let ARCHIVED_CHECKLISTS = {};
export let CHECKLIST_STACKS = {};
export let CHECKLIST_ITEMS = {};
export let DELETED_CHECKLISTS = {};
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
export let tempSelectedSoundId = null;    // Für das Bearbeiten-Formular
export let unsubscribeTemplateItems = null;
export let adminSettings = {};
export let selectedUserForLogin = null;
export let adminSectionsState = { password: false, user: false, role: false, approval: false, protocol: false, adminRights: false, mainFunctions: false }; let localUpdateInProgress = false;
export let roleManagementSectionsState = { userRolesOpen: false, adminRolesOpen: false };
export let ADMIN_ROLES = {};
export let adminRolesCollectionRef;
export let approvalRequestsCollectionRef;
export let db;
export let checklistsCollectionRef, checklistItemsCollectionRef;
export let checklistGroupsCollectionRef;
export let checklistCategoriesCollectionRef;
export let auth;
export let usersCollectionRef, rolesCollectionRef, roleChangeRequestsCollectionRef, settingsDocRef, auditLogCollectionRef;
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
export const views = { home: { id: 'homeView' }, entrance: { id: 'entranceView' }, pushover: { id: 'pushoverView' }, admin: { id: 'adminView' }, userSettings: { id: 'userSettingsView' }, checklist: { id: 'checklistView' }, checklistSettings: { id: 'checklistSettingsView' }, essensberechnung: { id: 'essensberechnungView' }, notrufSettings: { id: 'notrufSettingsView' } }; const viewElements = Object.fromEntries(Object.keys(views).map(key => [key + 'View', document.getElementById(views[key].id)]));


export let currentMeal = {
    name: '',
    singleProducts: [], // { id, name, weight }
    recipes: [],        // { id, name, ingredients: [{...}] }

    // Die "distribution" speichert jetzt die Eingaben des Benutzers, nicht das Ergebnis
    userInputDistribution: [], // { id, portionName, personId, personName, anzahl, productInputs: [{productId, mode, value}] }

    // Hier speichern wir, ob der "Rest" berechnet werden soll
    calculateRest: false,

    // Das Endergebnis der Berechnung wird separat gespeichert
    finalDistribution: []
};

export let notrufSettings = {
    modes: [],
    contacts: [],
    // Stelle sicher, dass flicAssignments immer existiert
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
    console.log("Wert von submitAdminKeyButton IN window.onload:", submitAdminKeyButton); // <-- SPION 1
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

async function initializeFirebase() {
    try {
        console.log("initializeFirebase: Starte Firebase Initialisierung...");
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        console.log("initializeFirebase: Firebase App, DB und Auth initialisiert.");

        if (!db) { console.error("initializeFirebase: FEHLER - Firestore DB Objekt (db) konnte nicht initialisiert werden!"); return; }
        if (!appId) { console.error("initializeFirebase: FEHLER - appId ist nicht definiert!"); return; }
        console.log("initializeFirebase: DB Objekt vorhanden. appId:", appId);

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

        // --- NEUE/GEÄNDERTE REFS ---
        checklistStacksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-stacks');
        checklistTemplatesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-templates');
        // --- ENDE NEUE/GEÄNDERTE REFS ---

        if (!usersCollectionRef) { console.error("initializeFirebase: FEHLER - usersCollectionRef konnte nicht erstellt werden!"); return; }
        else { console.log("initializeFirebase: usersCollectionRef erfolgreich erstellt, Pfad:", usersCollectionRef.path); }

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
            console.log("initializeFirebase: Entering onAuthStateChanged callback logic...");

            // Listener starten (unabhängig vom Login-Status)
            try {
                console.log("initializeFirebase: Starte Daten-Listener...");
                // --- Listener für App-Einstellungen ---
                onSnapshot(settingsDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        adminSettings = docSnap.data();
                    } else {
                        console.warn("Firebase App Settings Document 'main' not found.");
                        adminSettings = {}; // Fallback
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
                // --- Ende Listener für App-Einstellungen ---

                await seedInitialData();
                console.log("initializeFirebase: Seed Data abgeschlossen, starte Haupt-Listener...");

                // Haupt-Daten-Listener
                console.log("initializeFirebase: Rufe listenForRoleUpdates auf...");
                listenForRoleUpdates();
                console.log("initializeFirebase: Rufe listenForAdminRoleUpdates auf...");
                listenForAdminRoleUpdates();
                console.log("initializeFirebase: Rufe listenForUserUpdates auf...");
                listenForUserUpdates();
                console.log("initializeFirebase: Rufe listenForApprovalRequests auf...");
                listenForApprovalRequests();
                console.log("initializeFirebase: Rufe listenForChecklists auf...");
                listenForChecklists();
                console.log("initializeFirebase: Rufe listenForChecklistItems auf...");
                listenForChecklistItems();
                console.log("initializeFirebase: Rufe listenForChecklistGroups auf...");
                listenForChecklistGroups();
                console.log("initializeFirebase: Rufe listenForChecklistCategories auf...");
                listenForChecklistCategories();
                
                // --- HIER DIE ÄNDERUNGEN ---
                console.log("initializeFirebase: Rufe listenForTemplates auf...");
                listenForTemplates(); // Importiert aus checklist.js
                console.log("initializeFirebase: Rufe listenForStacks auf...");
                listenForStacks(); // NEU: Importiert aus checklist.js
                // --- ENDE ÄNDERUNGEN ---
                
                console.log("initializeFirebase: Alle Listener-Funktionen aufgerufen.");

            } catch (error) {
                console.error("initializeFirebase: FEHLER beim Starten der Listener:", error);
                if (typeof alertUser === 'function') {
                    alertUser("Fehler beim Initialisieren der Daten-Listener.", "error");
                }
            }

            // UI basierend auf User-Status aktualisieren
            if (user) {
                console.log("initializeFirebase: User (anonym) vorhanden.");
                checkCurrentUserValidity();
                initialAuthCheckDone = true;
                updateUIForMode();
                console.log("initializeFirebase: UI für aktuellen Status aktualisiert.");
            } else {
                console.log("Firebase meldet KEINEN User (auch nicht anonym!), wechsle explizit zum Gastmodus.");
                switchToGuestMode(false);
                 initialAuthCheckDone = true;
                 updateUIForMode();
            }
             console.log("initializeFirebase: Ende des onAuthStateChanged Callbacks.");
        }); // Ende onAuthStateChanged
    } catch (error) {
        console.error("initializeFirebase: FEHLER bei der grundlegenden Firebase Initialisierung:", error);
        if (typeof alertUser === 'function') {
             alertUser("Firebase konnte nicht initialisiert werden.", "error");
        }
    }
     console.log("initializeFirebase: Funktion komplett beendet.");
}
// --- HIER ENDET DIE FUNKTION ZUM ERSETZEN ---
async function seedInitialData() {
    try {
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

        const adminRolesSnapshot = await getDocs(adminRolesCollectionRef);
        const emptyRoleDoc = doc(adminRolesCollectionRef, 'LEERE_ROLLE');
        const emptyRoleSnapshot = await getDoc(emptyRoleDoc);
        if (!emptyRoleSnapshot.exists()) {
            await setDoc(emptyRoleDoc, { name: '** Leere Rolle**', permissions: {}, deletable: false });
        }

        const usersSnapshot = await getDocs(usersCollectionRef);
        if (usersSnapshot.empty) {
            await setDoc(doc(usersCollectionRef, 'SYSTEMADMIN'), { name: 'Systemadmin', key: 'top2sys', role: 'SYSTEMADMIN', isActive: true });
        }
    } catch (error) {
        console.error("Error in seedInitialData:", error);
        throw error;
    }
}

export function alertUser(message, type) {
    const tempAlert = document.createElement('div');
    tempAlert.textContent = message;
    tempAlert.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-4 rounded-xl text-white font-bold shadow-lg transition-opacity duration-300 z-50 text-center ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`;
    document.body.appendChild(tempAlert);
    setTimeout(() => tempAlert.style.opacity = '1', 10);
    setTimeout(() => {
        tempAlert.style.opacity = '0';
        setTimeout(() => tempAlert.remove(), 300);
    }, 3000);
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
    // ... (alle Berechtigungsprüfungen bleiben hier) ...
    if (targetViewName === 'entrance' && !userPermissions.includes('ENTRANCE')) return alertUser("Zugriff verweigert (Eingang).", 'error');
    if (targetViewName === 'pushover' && !userPermissions.includes('PUSHOVER')) return alertUser("Zugriff verweigert (Push).", 'error');
    if (targetViewName === 'checklist' && !userPermissions.includes('CHECKLIST')) return alertUser("Zugriff verweigert (Checkliste).", 'error');
    if (targetViewName === 'checklistSettings' && !userPermissions.includes('CHECKLIST_SETTINGS')) return alertUser("Zugriff verweigert (Checklisten-Einstellungen).", 'error');
    if (targetViewName === 'essensberechnung' && !userPermissions.includes('ESSENSBERECHNUNG')) return alertUser("Zugriff verweigert (Essensberechnung).", 'error');
    if (targetViewName === 'admin' && !isAdmin) return alertUser("Zugriff verweigert (Admin).", 'error');
    if (targetViewName === 'notrufSettings' && !userPermissions.includes('PUSHOVER')) return alertUser("Zugriff verweigert (Notruf-Einstellungen).", 'error');


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
        // ... (Code für userSettings bleibt gleich) ...
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
    // === WICHTIG: Ruft die importierte Funktion auf ===
    if (targetViewName === 'notrufSettings') {
        initializeNotrufSettingsView(); // Ruft die Initialisierung aus notfall.js auf
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
}

// Ersetze diese Funktion komplett in haupteingang.js
export function setupEventListeners() {
    // Sicherstellen, dass die Elemente existieren, bevor Listener hinzugefügt werden
    const appHeader = document.getElementById('appHeader'); // Holen das Element hier
    const mainContentArea = document.querySelector('.main-content'); // Holen das Element hier

    if (!appHeader || !mainContentArea) {
        console.warn("setupEventListeners: Wichtige Elemente (Header/Main Content) noch nicht bereit, versuche später erneut.");
        // Optional: setTimeout hinzufügen, wenn das Problem häufiger auftritt
        // setTimeout(setupEventListeners, 100);
        return;
    }
    console.log("setupEventListeners: Füge Basis-Listener hinzu...");

    // Event listener für den App-Header (bleibt gleich)
    if (!appHeader.dataset.listenerAttached) {
        appHeader.addEventListener('click', () => navigate('home'));
        appHeader.dataset.listenerAttached = 'true';
    }

    // Zentraler Klick-Handler für main content (bleibt größtenteils gleich)
    if (!mainContentArea.dataset.listenerAttached) {
        mainContentArea.addEventListener('click', function (e) {
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
        mainContentArea.dataset.listenerAttached = 'true';
    }

    // --- Navigation Cards on Home View (bleiben gleich) ---
    const entranceCard = document.getElementById('entranceCard');
    if (entranceCard && !entranceCard.dataset.listenerAttached) {
         entranceCard.addEventListener('click', () => navigate('entrance'));
         entranceCard.dataset.listenerAttached = 'true';
    }
    const essensberechnungCard = document.getElementById('essensberechnungCard');
    if (essensberechnungCard && !essensberechnungCard.dataset.listenerAttached) {
         essensberechnungCard.addEventListener('click', () => navigate('essensberechnung'));
         essensberechnungCard.dataset.listenerAttached = 'true';
    }
    const currentChecklistCard = document.getElementById('currentChecklistCard');
    if (currentChecklistCard && !currentChecklistCard.dataset.listenerAttached) {
         currentChecklistCard.addEventListener('click', () => navigate('checklist'));
         currentChecklistCard.dataset.listenerAttached = 'true';
    }
    const checklistSettingsCard = document.getElementById('checklistSettingsCard');
    if (checklistSettingsCard && !checklistSettingsCard.dataset.listenerAttached) {
         checklistSettingsCard.addEventListener('click', () => navigate('checklistSettings'));
         checklistSettingsCard.dataset.listenerAttached = 'true';
    }

    // --- Modals (Login, Archived Lists etc. - bleiben gleich) ---
    const cancelSelectionButton = document.getElementById('cancelSelectionButton');
    if (cancelSelectionButton && !cancelSelectionButton.dataset.listenerAttached) { cancelSelectionButton.addEventListener('click', () => { if(userSelectionModal) userSelectionModal.style.display = 'none'; }); cancelSelectionButton.dataset.listenerAttached = 'true'; }
    const backToSelectionButton = document.getElementById('backToSelectionButton');
    if (backToSelectionButton && !backToSelectionButton.dataset.listenerAttached) { backToSelectionButton.addEventListener('click', () => { if(pinModal) pinModal.style.display = 'none'; if(userSelectionModal) userSelectionModal.style.display = 'flex'; }); backToSelectionButton.dataset.listenerAttached = 'true'; }
    const modalUserButtonsEl = document.getElementById('modalUserButtons');
    if (modalUserButtonsEl && !modalUserButtonsEl.dataset.listenerAttached) { modalUserButtonsEl.addEventListener('click', (e) => { /* ... User selection logic ... */ }); modalUserButtonsEl.dataset.listenerAttached = 'true'; }
    const closeLockedModalButton = document.getElementById('closeLockedModalButton');
    if (closeLockedModalButton && !closeLockedModalButton.dataset.listenerAttached) { closeLockedModalButton.addEventListener('click', () => { if(pinModal) pinModal.style.display = 'none'; if(userSelectionModal) userSelectionModal.style.display = 'flex'; }); closeLockedModalButton.dataset.listenerAttached = 'true'; }
    const handleLogin = () => { /* ... PIN handling logic ... */ };
    // Wichtig: submitAdminKeyButton wird im window.onload zugewiesen, das MUSS bleiben,
    // aber der Listener kann hier rein, wenn das Element existiert.
    const submitAdminKeyButtonEl = document.getElementById('submitAdminKeyButton');
    if (submitAdminKeyButtonEl && !submitAdminKeyButtonEl.dataset.listenerAttached) { submitAdminKeyButtonEl.addEventListener('click', handleLogin); submitAdminKeyButtonEl.dataset.listenerAttached = 'true'; }
    const adminPinInputEl = document.getElementById('adminPinInput');
    if (adminPinInputEl && !adminPinInputEl.dataset.listenerAttached) { adminPinInputEl.addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin()); adminPinInputEl.dataset.listenerAttached = 'true'; }

    // --- HIER DIE ADMIN SECTION TOGGLES HINZUFÜGEN ---
    const adminRightsToggle = document.getElementById('adminRightsToggle');
    if (adminRightsToggle && !adminRightsToggle.dataset.listenerAttached) {
        adminRightsToggle.addEventListener('click', () => toggleAdminSection('adminRights'));
        adminRightsToggle.dataset.listenerAttached = 'true';
        console.log("Listener für adminRightsToggle hinzugefügt."); // Debug
    }
    const roleSettingsToggle = document.getElementById('roleSettingsToggle');
    if (roleSettingsToggle && !roleSettingsToggle.dataset.listenerAttached) {
        roleSettingsToggle.addEventListener('click', () => toggleAdminSection('role'));
        roleSettingsToggle.dataset.listenerAttached = 'true';
        console.log("Listener für roleSettingsToggle hinzugefügt."); // Debug
    }
    const passwordSettingsToggle = document.getElementById('passwordSettingsToggle');
    if (passwordSettingsToggle && !passwordSettingsToggle.dataset.listenerAttached) {
        passwordSettingsToggle.addEventListener('click', () => toggleAdminSection('password'));
        passwordSettingsToggle.dataset.listenerAttached = 'true';
        console.log("Listener für passwordSettingsToggle hinzugefügt."); // Debug
    }
    const userManagementToggle = document.getElementById('userManagementToggle');
    if (userManagementToggle && !userManagementToggle.dataset.listenerAttached) {
        userManagementToggle.addEventListener('click', () => toggleAdminSection('user'));
        userManagementToggle.dataset.listenerAttached = 'true';
        console.log("Listener für userManagementToggle hinzugefügt."); // Debug
    }
    const approvalProcessToggle = document.getElementById('approvalProcessToggle');
    if (approvalProcessToggle && !approvalProcessToggle.dataset.listenerAttached) {
        approvalProcessToggle.addEventListener('click', () => toggleAdminSection('approval'));
        approvalProcessToggle.dataset.listenerAttached = 'true';
        console.log("Listener für approvalProcessToggle hinzugefügt."); // Debug
    }
    const protocolHistoryToggle = document.getElementById('protocolHistoryToggle');
    if (protocolHistoryToggle && !protocolHistoryToggle.dataset.listenerAttached) {
        protocolHistoryToggle.addEventListener('click', () => toggleAdminSection('protocol'));
        protocolHistoryToggle.dataset.listenerAttached = 'true';
        console.log("Listener für protocolHistoryToggle hinzugefügt."); // Debug
    }
    const mainFunctionsToggle = document.getElementById('mainFunctionsToggle');
    if (mainFunctionsToggle && !mainFunctionsToggle.dataset.listenerAttached) {
        mainFunctionsToggle.addEventListener('click', () => toggleAdminSection('mainFunctions'));
        mainFunctionsToggle.dataset.listenerAttached = 'true';
        console.log("Listener für mainFunctionsToggle hinzugefügt."); // Debug
    }
    // --- ENDE ADMIN SECTION TOGGLES ---


    // --- Entrance View Buttons (bleiben gleich) ---
    document.querySelectorAll('#entranceView .action-button').forEach(button => {
        if (!button.dataset.listenerAttached) {
            button.addEventListener('click', e => { /* ... Entrance logic ... */ });
            button.dataset.listenerAttached = 'true';
        }
    });

    // --- Pushover View Button (bleiben gleich) ---
    const sendDynamicPostButton = document.getElementById('sendDynamicPostButton');
    if (sendDynamicPostButton && !sendDynamicPostButton.dataset.listenerAttached) {
        sendDynamicPostButton.addEventListener('click', async (e) => { /* ... Pushover logic ... */ });
        sendDynamicPostButton.dataset.listenerAttached = 'true';
    }

    // --- User Settings View Button (bleiben gleich) ---
    const userSettingsSaveKeyButton = document.getElementById('userSettingsSaveKeyButton');
    if (userSettingsSaveKeyButton && !userSettingsSaveKeyButton.dataset.listenerAttached) {
        userSettingsSaveKeyButton.addEventListener('click', async () => { /* ... User settings save logic ... */ });
        userSettingsSaveKeyButton.dataset.listenerAttached = 'true';
    }

    // --- Archived Lists Modal (bleiben gleich) ---
    const closeArchivedModalBtn = document.getElementById('closeArchivedListsModal');
    if (closeArchivedModalBtn && !closeArchivedModalBtn.dataset.listenerAttached) { closeArchivedModalBtn.addEventListener('click', () => { /* ... */ }); closeArchivedModalBtn.dataset.listenerAttached = 'true'; }
    const archivedListsContainer = document.getElementById('archivedListsContainer');
    if (archivedListsContainer && !archivedListsContainer.dataset.listenerAttached) { archivedListsContainer.addEventListener('click', async (e) => { /* ... Restore/Delete logic ... */ }); archivedListsContainer.dataset.listenerAttached = 'true'; }

    // --- API Token Modal, Sound Book Modal etc. (bleiben gleich) ---
    // ... (Listener für andere Modals bleiben hier) ...

    console.log("setupEventListeners: Alle Basis-Listener hinzugefügt.");
} // Ende setupEventListeners