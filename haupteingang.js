// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, query, where, serverTimestamp, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { checkCurrentUserValidity, updateUIForMode, switchToGuestMode } from './log-InOut.js';
import { renderModalUserButtons, listenForUserUpdates } from './admin_benutzersteuerung.js';
import { listenForRoleUpdates, listenForAdminRoleUpdates } from './admin_rollenverwaltung.js';
import { listenForApprovalRequests, createApprovalRequest } from './admin_genehmigungsprozess.js'; // createApprovalRequest importiert
import { toggleAdminSection, rememberAdminScroll, restoreAdminScrollIfAny, renderMainFunctionsAdminArea } from './admin_adminfunktionenHome.js'; // Scroll-Funktionen importiert
import { initializeEssensberechnungView } from './essensberechnung.js';
import { listenForChecklistGroups, listenForChecklistItems, listenForChecklists, listenForChecklistCategories, listenForTemplates, openTemplateModal, renderChecklistView, renderChecklistSettingsView } from './checklist.js'; // openTemplateModal etc. importiert
import { IFTTT_URL, initializeNotrufSettingsView } from './notfall.js'; // <-- initializeNotrufSettingsView HIER importiert
import { PUSHOVER_TOKEN, RECIPIENT_KEYS } from './pushbenachrichtigung.js';
import { logAdminAction } from './admin_protokollHistory.js'; // logAdminAction importiert
import { renderUserKeyList } from './admin_passwoerter.js'; // renderUserKeyList importiert
import { renderApprovalProcess } from './admin_genehmigungsprozess.js'; // renderApprovalProcess importiert
import { renderRoleManagement } from './admin_rollenverwaltung.js'; // renderRoleManagement importiert
import { renderAdminRightsManagement, renderAdminUserDetails, setupPermissionDependencies } from './admin_rechteverwaltung.js'; // Nötige Funktionen importiert
import { renderUserManagement, addAdminUserManagementListeners, toggleNewUserRoleField } from './admin_benutzersteuerung.js'; // Nötige Funktionen importiert
import { renderProtocolHistory } from './admin_protokollHistory.js'; // renderProtocolHistory importiert
// ENDE-ZIKA //

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
// export let activeFlicEditorKlickTyp = null; // <-- Entfernt, gehört zu notfall.js
// export let tempSelectedApiTokenId = null; // <-- Entfernt, gehört zu notfall.js
// export let tempSelectedSoundId = null; // <-- Entfernt, gehört zu notfall.js
export let unsubscribeTemplateItems = null;
export let adminSettings = {};
export let selectedUserForLogin = null;
export let adminSectionsState = { password: false, user: false, role: false, approval: false, protocol: false, adminRights: false, mainFunctions: false };
export let localUpdateInProgress = false; // Wird in admin_benutzersteuerung.js verwendet
export let roleManagementSectionsState = { userRolesOpen: false, adminRolesOpen: false }; // Wird in admin_rollenverwaltung.js verwendet
export let ADMIN_ROLES = {};
export let adminRolesCollectionRef;
export let approvalRequestsCollectionRef;
export let db;
export let checklistsCollectionRef, checklistItemsCollectionRef;
export let checklistGroupsCollectionRef;
export let checklistCategoriesCollectionRef;
export let auth;
export let usersCollectionRef, rolesCollectionRef, roleChangeRequestsCollectionRef, settingsDocRef, auditLogCollectionRef;
export let activeDisplayMode = 'gesamt'; // Wird in essensberechnung.js verwendet
// let editingPortionId = null; // <-- Entfernt, gehört zu essensberechnung.js

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
export const views = { home: { id: 'homeView' }, entrance: { id: 'entranceView' }, pushover: { id: 'pushoverView' }, admin: { id: 'adminView' }, userSettings: { id: 'userSettingsView' }, checklist: { id: 'checklistView' }, checklistSettings: { id: 'checklistSettingsView' }, essensberechnung: { id: 'essensberechnungView' }, notrufSettings: { id: 'notrufSettingsView' } };
const viewElements = Object.fromEntries(Object.keys(views).map(key => [key + 'View', document.getElementById(views[key].id)]));


export let currentMeal = {
    name: '',
    singleProducts: [], // { id, name, weight }
    recipes: [],        // { id, name, ingredients: [{...}] }
    userInputDistribution: [], // { id, portionName, personId, personName, anzahl, recipeInputs:[{recipeId, weight}], productInputs: [{productId, mode, value}] }
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

export const COLOR_PALETTE = { // Wird in checklist.js verwendet
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

export const USER_COLORS = { // Wird nicht verwendet?
    ADMIN: ['bg-red-600', 'hover:bg-red-700'],
    SYSTEMADMIN: ['bg-purple-800', 'hover:bg-purple-900'],
    DEFAULT: ['bg-indigo-600', 'hover:bg-indigo-700']
};


// Globale Referenzen auf HTML-Elemente holen
let appHeader, footerModeHandler, modeTextDisplay, userSelectionModal, pinModalTitle,
    adminRightsArea, adminRightsToggleIcon, roleManagementSection, roleSettingsToggle,
    roleManagementArea, roleToggleIcon, passwordSection, passwordSettingsToggle,
    passwordManagementArea, passwordToggleIcon, userSection, userManagementToggle,
    userManagementArea, userManagementToggleIcon, approvalProcessSection,
    approvalProcessToggle, approvalProcessArea, approvalToggleIcon,
    protocolHistorySection, protocolHistoryToggle, protocolHistoryArea,
    protocolHistoryToggleIcon, noAdminPermissionsPrompt, mainFunctionsSection,
    mainFunctionsToggle, mainFunctionsArea, mainFunctionsToggleIcon;


window.onload = function () {
    // Globale Element-Referenzen im onload setzen, da das DOM jetzt bereit ist
    appHeader = document.getElementById('appHeader');
    modalUserButtons = document.getElementById('modalUserButtons');
    userSelectionModal = document.getElementById('userSelectionModal');
    pinModal = document.getElementById('pinModal');
    pinModalTitle = document.getElementById('pinModalTitle');
    adminPinInput = document.getElementById('adminPinInput');
    pinError = document.getElementById('pinError');
    submitAdminKeyButton = document.getElementById('submitAdminKeyButton');
    adminRightsSection = document.getElementById('adminRightsSection');
    adminRightsToggle = document.getElementById('adminRightsToggle');
    adminRightsArea = document.getElementById('adminRightsArea');
    adminRightsToggleIcon = document.getElementById('adminRightsToggleIcon');
    roleManagementSection = document.getElementById('roleManagementSection');
    roleSettingsToggle = document.getElementById('roleSettingsToggle');
    roleManagementArea = document.getElementById('roleManagementArea');
    roleToggleIcon = document.getElementById('roleToggleIcon');
    passwordSection = document.getElementById('passwordSection');
    passwordSettingsToggle = document.getElementById('passwordSettingsToggle');
    passwordManagementArea = document.getElementById('passwordManagementArea');
    passwordToggleIcon = document.getElementById('passwordToggleIcon');
    userSection = document.getElementById('userSection');
    userManagementToggle = document.getElementById('userManagementToggle');
    userManagementArea = document.getElementById('userManagementArea');
    userManagementToggleIcon = document.getElementById('userManagementToggleIcon');
    approvalProcessSection = document.getElementById('approvalProcessSection');
    approvalProcessToggle = document.getElementById('approvalProcessToggle');
    approvalProcessArea = document.getElementById('approvalProcessArea');
    approvalToggleIcon = document.getElementById('approvalToggleIcon');
    protocolHistorySection = document.getElementById('protocolHistorySection');
    protocolHistoryToggle = document.getElementById('protocolHistoryToggle');
    protocolHistoryArea = document.getElementById('protocolHistoryArea');
    protocolHistoryToggleIcon = document.getElementById('protocolHistoryToggleIcon');
    noAdminPermissionsPrompt = document.getElementById('noAdminPermissionsPrompt');
    mainFunctionsSection = document.getElementById('mainFunctionsSection');
    mainFunctionsToggle = document.getElementById('mainFunctionsToggle');
    mainFunctionsArea = document.getElementById('mainFunctionsArea');
    mainFunctionsToggleIcon = document.getElementById('mainFunctionsToggleIcon');

    // Listener für Modals hinzufügen
    const closeDeletedModalBtn = document.getElementById('closeDeletedListsModal');
    if (closeDeletedModalBtn) {
        closeDeletedModalBtn.addEventListener('click', () => {
            const modal = document.getElementById('deletedListsModal');
            if(modal) modal.style.display = 'none';
        });
    }

    // Grundlegende Event Listener und Firebase Initialisierung starten
    setupEventListeners();
    initializeFirebase();

    // Service Worker Registrierung
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
        notrufSettingsDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'app-settings', 'notruf'); // <-- notrufSettingsDocRef wird hier definiert
        checklistsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklists');
        checklistItemsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-items');
        checklistGroupsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-groups');
        checklistCategoriesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-categories');
        const checklistStacksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-stacks');
        approvalRequestsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval-requests'); // Wird in admin_genehmigungsprozess.js verwendet
        // --- Ende DB Refs ---

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
                     updateUIForMode(); // Wichtig, um z.B. Default-Checklist Namen anzuzeigen
                }, (error) => {
                    console.error("Error listening to settings:", error);
                });

                onSnapshot(notrufSettingsDocRef, (docSnap) => {
                     if (docSnap.exists()) {
                         // Überschreibe das lokale Objekt mit den Daten aus Firebase
                         Object.assign(notrufSettings, docSnap.data());
                         // Initialisiere fehlende Felder robust, falls sie in Firebase fehlen
                         if (!notrufSettings.modes) notrufSettings.modes = [];
                         if (!notrufSettings.contacts) notrufSettings.contacts = [];
                         if (!notrufSettings.apiTokens) notrufSettings.apiTokens = [];
                         if (!notrufSettings.sounds) notrufSettings.sounds = [];
                         if (!notrufSettings.flicAssignments) notrufSettings.flicAssignments = { einfach: null, doppel: null, halten: null };
                     } else {
                         console.warn("Firebase Notruf Settings Document 'notruf' not found, using default.");
                         // Setze auf Standardwerte zurück, falls Dokument nicht existiert
                         Object.assign(notrufSettings, { modes: [], contacts: [], apiTokens: [], sounds: [], flicAssignments: { einfach: null, doppel: null, halten: null } });
                         // Optional: Hier setDoc aufrufen, um das Dokument zu erstellen
                         // setDoc(notrufSettingsDocRef, notrufSettings);
                     }
                      // UI Update für Notruf-Seite hier auslösen, falls sie aktiv ist
                      const notrufView = document.getElementById('notrufSettingsView');
                      if (notrufView && notrufView.classList.contains('active')) {
                           initializeNotrufSettingsView(); // Ruft die Initialisierung erneut auf, um die neuen Daten anzuzeigen
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
                console.log("initializeFirebase: Rufe listenForTemplates auf...");
                listenForTemplates();

                onSnapshot(query(checklistStacksCollectionRef, orderBy('name')), (snapshot) => {
                    Object.assign(CHECKLIST_STACKS, {}); // Leeren statt neu zuweisen
                     snapshot.forEach((doc) => {
                         CHECKLIST_STACKS[doc.id] = { id: doc.id, ...doc.data() };
                     });
                     // UI Update für Templates/Stacks, falls Checklist-Settings aktiv
                     const settingsView = document.getElementById('checklistSettingsView');
                     if (settingsView && settingsView.classList.contains('active')) {
                         const activeTab = settingsView.querySelector('#settings-tabs .settings-tab-btn.bg-white');
                         if (activeTab && activeTab.dataset.targetCard === 'card-templates') {
                              renderChecklistSettingsView(settingsView.dataset.editingListId); // Render settings view might rerender the container list
                         }
                     }
                });
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
                initialAuthCheckDone = true; // Setze Flag *nach* dem ersten Check
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

async function seedInitialData() {
    try {
        // Seed User Roles
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
            console.log("Default User Roles seeded.");
        } else {
            // Ensure NO_RIGHTS exists even if roles were seeded before
            const noRightsDoc = doc(rolesCollectionRef, 'NO_RIGHTS');
            const noRightsSnap = await getDoc(noRightsDoc);
            if (!noRightsSnap.exists()) {
                await setDoc(noRightsDoc, { name: '- Keine Rechte -', permissions: [], deletable: false });
                console.log("Added missing NO_RIGHTS role.");
            }
        }

        // Seed Admin Roles (ensure empty role exists)
        const emptyRoleDoc = doc(adminRolesCollectionRef, 'LEERE_ROLLE');
        const emptyRoleSnapshot = await getDoc(emptyRoleDoc);
        if (!emptyRoleSnapshot.exists()) {
            await setDoc(emptyRoleDoc, { name: '** Leere Rolle**', permissions: {}, deletable: false });
            console.log("Seeded empty Admin Role.");
        }

        // Seed initial System Admin User
        const usersSnapshot = await getDocs(usersCollectionRef);
        if (usersSnapshot.empty) {
            await setDoc(doc(usersCollectionRef, 'SYSTEMADMIN'), { name: 'Systemadmin', key: 'top2sys', role: 'SYSTEMADMIN', isActive: true, permissionType: 'role' });
            console.log("Initial System Admin User seeded.");
        }
    } catch (error) {
        console.error("Error in seedInitialData:", error);
        // Do not throw error here to allow app to continue if seeding fails partially
    }
}

export function alertUser(message, type) {
    // Finde und entferne zuerst eine eventuell vorhandene alte Alert-Box
    const existingAlert = document.getElementById('temp-alert-box');
    if (existingAlert) {
        existingAlert.remove();
    }

    const tempAlert = document.createElement('div');
    tempAlert.id = 'temp-alert-box'; // Gib ihr eine ID zum einfachen Finden
    tempAlert.textContent = message;
    // Standard Tailwind Klassen
    tempAlert.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-4 rounded-xl text-white font-bold shadow-lg transition-opacity duration-300 z-50 text-center`;
    // Farbklassen basierend auf Typ hinzufügen
    if (type === 'success') {
        tempAlert.classList.add('bg-green-600');
    } else if (type === 'error') {
        tempAlert.classList.add('bg-red-600');
    } else { // Default/Info
        tempAlert.classList.add('bg-blue-600');
    }

    document.body.appendChild(tempAlert);
    // Fade in
    setTimeout(() => tempAlert.style.opacity = '1', 10);
    // Fade out und entfernen
    setTimeout(() => {
        tempAlert.style.opacity = '0';
        setTimeout(() => tempAlert.remove(), 300); // Entferne nach dem Fade-Out
    }, 3000); // Bleibt 3 Sekunden sichtbar
}

export function setButtonLoading(button, isLoading) { // Exportiert, falls in anderen Modulen benötigt
    if (!button) return;
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

    // Berechtigungsprüfung
    const userPermissions = currentUser.permissions || [];
    const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SYSTEMADMIN';

    // Spezifische Berechtigungen für bestimmte Views
    if (targetViewName === 'entrance' && !userPermissions.includes('ENTRANCE')) {
        return alertUser("Zugriff verweigert (Eingang).", 'error');
    }
    if (targetViewName === 'pushover' && !userPermissions.includes('PUSHOVER')) {
        return alertUser("Zugriff verweigert (Push).", 'error');
    }
    if (targetViewName === 'checklist' && !userPermissions.includes('CHECKLIST')) {
        return alertUser("Zugriff verweigert (Checkliste).", 'error');
    }
     if (targetViewName === 'checklistSettings' && !userPermissions.includes('CHECKLIST_SETTINGS')) {
        return alertUser("Zugriff verweigert (Checklisten-Einstellungen).", 'error');
    }
     if (targetViewName === 'essensberechnung' && !userPermissions.includes('ESSENSBERECHNUNG')) {
        return alertUser("Zugriff verweigert (Essensberechnung).", 'error');
    }
    // Admin-Bereich
    if (targetViewName === 'admin' && !isAdmin) {
        return alertUser("Zugriff verweigert (Admin).", 'error');
    }
    // Notruf-Einstellungen (angenommen, PUSHOVER-Recht genügt?)
     if (targetViewName === 'notrufSettings' && !userPermissions.includes('PUSHOVER')) {
        // Hier könnte man auch ein separates Recht 'NOTRUF_SETTINGS' einführen
        return alertUser("Zugriff verweigert (Notruf-Einstellungen).", 'error');
    }


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
        // Fallback zur Home-View
        const homeElement = document.getElementById(views.home.id);
        if (homeElement) homeElement.classList.add('active');
        return;
    }


    // UI basierend auf Modus aktualisieren (wichtig für Header/Footer etc.)
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
        initializeEssensberechnungView(); // Ruft die Initialisierung auf
    }
    if (targetViewName === 'notrufSettings') {
        initializeNotrufSettingsView(); // Ruft die Initialisierung auf
    }
     if (targetViewName === 'checklist') {
         const defaultListId = adminSettings.defaultChecklistId;
         renderChecklistView(defaultListId); // Rendert die View mit der Default-Liste
    }
     if (targetViewName === 'checklistSettings') {
        renderChecklistSettingsView(); // Rendert die Settings-View (holt sich ggf. die erste Liste)
    }
     if (targetViewName === 'admin') {
         // Stellt sicher, dass die Admin-Bereiche beim Navigieren dorthin initial korrekt angezeigt werden
         Object.keys(adminSectionsState).forEach(key => adminSectionsState[key] = false); // Alle einklappen
         // Optional: Eine Sektion standardmäßig öffnen?
         // adminSectionsState.user = true; // z.B. Benutzerverwaltung öffnen
         toggleAdminSection(null); // Aktualisiert die Anzeige (null öffnet nichts Neues)
     }
}


// Setup Event Listeners (vereinfacht, da viele Listener jetzt in Modulen sind)
export function setupEventListeners() {
    if (!appHeader) { // Prüfen ob Elemente schon geladen sind (relevant wg. window.onload)
        console.warn("setupEventListeners: Elemente noch nicht bereit, versuche später erneut.");
        setTimeout(setupEventListeners, 100); // Erneut versuchen
        return;
    }

    console.log("setupEventListeners: Füge Listener hinzu...");

    // Event listener for the app header to navigate home
    appHeader.addEventListener('click', () => navigate('home'));

    // Central click handler for the main content area (für globale Elemente wie Back-Links etc.)
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
            const listId = document.getElementById('checklist-settings-editor-switcher')?.value; // Sicherer Zugriff
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

    // --- Modals (Login, Archived Lists etc.) ---
    const cancelSelectionButton = document.getElementById('cancelSelectionButton');
    if (cancelSelectionButton) cancelSelectionButton.addEventListener('click', () => { if(userSelectionModal) userSelectionModal.style.display = 'none'; });

    const backToSelectionButton = document.getElementById('backToSelectionButton');
    if (backToSelectionButton) backToSelectionButton.addEventListener('click', () => { if(pinModal) pinModal.style.display = 'none'; if(userSelectionModal) userSelectionModal.style.display = 'flex'; });

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
             if(pinModal) pinModal.style.display = 'none';
             if(userSelectionModal) userSelectionModal.style.display = 'flex';
        });
    }

    const handleLogin = () => { // Gehört zum PIN Modal
        if (!selectedUserForLogin || !adminPinInput || !pinModal || !pinError) return;
        const userKeyInDB = USERS[selectedUserForLogin]?.key;
        const enteredPin = adminPinInput.value;
        if (userKeyInDB === enteredPin) {
            pinModal.style.display = 'none';
            adminPinInput.value = '';
            localStorage.setItem(ADMIN_STORAGE_KEY, selectedUserForLogin);
            checkCurrentUserValidity();
            alertUser(`Erfolgreich als ${USERS[selectedUserForLogin]?.name || 'Unbekannt'} angemeldet!`, "success");
        } else {
            pinError.style.display = 'block';
            adminPinInput.value = '';
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
            if (!buttonTextEl) return;
            const originalText = buttonTextEl.textContent;

            const sendRequest = async () => {
                setButtonLoading(buttonEl, true);
                if (buttonTextEl) buttonTextEl.style.display = 'none'; // Sicherer Zugriff
                try {
                    await fetch(IFTTT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value1: delay }) });
                    alertUser(`Befehl "Öffnen" gesendet!`, 'success');
                } catch (error) {
                    alertUser('Fehler beim Senden des Befehls.', 'error');
                    console.error("IFTTT Error:", error);
                } finally {
                    setButtonLoading(buttonEl, false);
                    if (buttonTextEl) { // Sicherer Zugriff
                         buttonTextEl.textContent = originalText;
                         buttonTextEl.style.display = 'inline-block';
                    }
                }
            };

            if (isNaN(delay)) return; // Abbruch bei ungültigem Delay

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
                        sendRequest(); // Ruft sendRequest ohne Argumente auf
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
             formData.append('user', RECIPIENT_KEYS[recipientSelect.value]);
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
            if (!newKeyInput || !currentUser || !currentUser.mode || !usersCollectionRef) return; // Wichtige Checks

            const newKey = newKeyInput.value;
            if (newKey.length < 4) return alertUser("Der Schlüssel muss mindestens 4 Zeichen lang sein.", "error");

            try {
                await updateDoc(doc(usersCollectionRef, currentUser.mode), { key: newKey });
                await logAdminAction('self_password_changed', `Eigenes Passwort geändert.`); // logAdminAction muss importiert sein
                alertUser(`Ihr Schlüssel wurde erfolgreich aktualisiert!`, "success");
                if (USERS[currentUser.mode]) USERS[currentUser.mode].key = newKey; // Update lokales Objekt

                const userKeyDisplayEl = document.getElementById('currentUserKeyDisplay');
                if (userKeyDisplayEl) {
                     userKeyDisplayEl.innerHTML = `<p class="text-lg">Dein aktuelles Passwort lautet: <strong class="font-bold">${newKey}</strong></p>`;
                     userKeyDisplayEl.style.display = 'block';
                }
                newKeyInput.value = ''; // Input leeren
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
            if(modal) modal.style.display = 'none';
        });
    }

    const archivedListsContainer = document.getElementById('archivedListsContainer');
    if (archivedListsContainer) {
        archivedListsContainer.addEventListener('click', async (e) => {
            const restoreBtn = e.target.closest('.restore-archived-btn');
            const deleteBtn = e.target.closest('.delete-archived-btn');
             if (!checklistsCollectionRef) return; // Firestore Ref prüfen

            if (restoreBtn) {
                const listId = restoreBtn.dataset.listId;
                if (!listId) return;
                try {
                    await updateDoc(doc(checklistsCollectionRef, listId), { isArchived: false, archivedAt: null, archivedBy: null });
                    alertUser("Liste wurde aus dem Archiv wiederhergestellt.", "success");
                     // Modal muss hier nicht geschlossen werden, Liste aktualisiert sich via Listener
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
                         // Modal muss hier nicht geschlossen werden, Liste aktualisiert sich via Listener
                    } catch (error) {
                         console.error("Fehler beim Verschieben in Papierkorb:", error);
                         alertUser("Fehler beim Verschieben in den Papierkorb.", "error");
                    }
                } else if (confirmation !== null) {
                    alertUser("Löschvorgang abgebrochen.", "info");
                }
            }
        });
    }

    // --- API Token Modal ---
     const apiTokenModal = document.getElementById('apiTokenBookModal');
     if (apiTokenModal && !apiTokenModal.dataset.listenerAttached) {
         apiTokenModal.addEventListener('click', async (e) => { // Async für setDoc
             // Close
             if (e.target.closest('#apiTokenBookCloseButton')) {
                 apiTokenModal.style.display = 'none';
             }
             // Add
             if (e.target.closest('#apiTokenAddButton')) {
                 const nameInput = document.getElementById('apiTokenName');
                 const keyInput = document.getElementById('apiTokenKey');
                 if (!nameInput || !keyInput) return;
                 const name = nameInput.value.trim();
                 const key = keyInput.value.trim();
                 if (name && key && notrufSettingsDocRef) { // Prüfe Ref
                     if (!notrufSettings.apiTokens) notrufSettings.apiTokens = [];
                     notrufSettings.apiTokens.push({ id: Date.now(), name, key });
                     try {
                         await setDoc(notrufSettingsDocRef, notrufSettings); // await verwenden
                         // renderApiTokenBook(); // Wird durch onSnapshot erledigt
                         nameInput.value = '';
                         keyInput.value = '';
                     } catch (err) {
                          console.error("Fehler beim Speichern des Tokens:", err);
                          alertUser('Fehler beim Speichern des Tokens.', 'error');
                     }
                 } else {
                     alertUser('Bitte Bezeichnung und Key ausfüllen.', 'error');
                 }
             }
             // Delete
             const deleteTokenBtn = e.target.closest('.delete-api-token-btn');
             if (deleteTokenBtn) {
                 const tokenId = parseInt(deleteTokenBtn.dataset.tokenId);
                 if (isNaN(tokenId)) return;
                 if (confirm('Möchten Sie diesen API-Token wirklich löschen?') && notrufSettingsDocRef) { // Prüfe Ref
                     notrufSettings.apiTokens = (notrufSettings.apiTokens || []).filter(t => t.id !== tokenId);
                     (notrufSettings.modes || []).forEach(mode => {
                         if (mode.config && mode.config.selectedApiTokenId === tokenId) {
                             mode.config.selectedApiTokenId = null;
                         }
                     });
                     // Reset temp ID is handled correctly in notfall.js render function
                     try {
                         await setDoc(notrufSettingsDocRef, notrufSettings); // await verwenden
                         // renderApiTokenBook(); // Wird durch onSnapshot erledigt
                     } catch (err) {
                          console.error("Fehler beim Löschen des Tokens:", err);
                          alertUser('Fehler beim Löschen des Tokens.', 'error');
                     }
                 }
             }
             // Apply (Logik bleibt in notfall.js' renderApiTokenBook und openModeConfigForm)
             if (e.target.closest('#apiTokenBookApplyButton')) {
                 // Die Auswahl wird in notfall.js gehandhabt, hier nur schließen
                 apiTokenModal.style.display = 'none';
             }
         });
         apiTokenModal.dataset.listenerAttached = 'true';
     }


    // --- Sound Book Modal ---
     const soundModal = document.getElementById('soundBookModal');
     if (soundModal && !soundModal.dataset.listenerAttached) {
         // Toggle Custom Name Input
         const useCustomNameCheckbox = soundModal.querySelector('#soundUseCustomName');
         const customNameInput = soundModal.querySelector('#soundCustomName');
         if (useCustomNameCheckbox && customNameInput) {
             useCustomNameCheckbox.addEventListener('change', (e) => {
                 customNameInput.classList.toggle('hidden', !e.target.checked);
                 if (!e.target.checked) customNameInput.value = '';
             });
         }

         soundModal.addEventListener('click', async (e) => { // Async für setDoc
             // Close
             if (e.target.closest('#soundBookCloseButton')) {
                 soundModal.style.display = 'none';
             }
             // Add
             if (e.target.closest('#soundAddButton')) {
                 const codeInput = document.getElementById('soundCode');
                 const customNameInput = document.getElementById('soundCustomName'); // Wieder holen
                 const useCustomCheckbox = document.getElementById('soundUseCustomName'); // Wieder holen
                 if (!codeInput || !customNameInput || !useCustomCheckbox) return;

                 const code = codeInput.value.trim();
                 const useCustom = useCustomCheckbox.checked;
                 const customName = customNameInput.value.trim();

                 if (code && (!useCustom || (useCustom && customName)) && notrufSettingsDocRef) { // Prüfe Ref
                     if (!notrufSettings.sounds) notrufSettings.sounds = [];
                     notrufSettings.sounds.push({ id: Date.now(), code, useCustomName: useCustom, customName: useCustom ? customName : null });
                     try {
                         await setDoc(notrufSettingsDocRef, notrufSettings); // await verwenden
                         // renderSoundBook(); // Wird durch onSnapshot erledigt
                         codeInput.value = '';
                         useCustomCheckbox.checked = false;
                         customNameInput.value = '';
                         customNameInput.classList.add('hidden');
                     } catch (err) {
                         console.error("Fehler beim Speichern des Sounds:", err);
                         alertUser('Fehler beim Speichern des Sounds.', 'error');
                     }
                 } else {
                     alertUser('Bitte Soundcode und ggf. eigenen Namen ausfüllen.', 'error');
                 }
             }
             // Delete
             const deleteSoundBtn = e.target.closest('.delete-sound-btn');
             if (deleteSoundBtn) {
                 const soundId = parseInt(deleteSoundBtn.dataset.soundId);
                  if (isNaN(soundId)) return;
                 if (confirm('Möchten Sie diesen Sound wirklich löschen?') && notrufSettingsDocRef) { // Prüfe Ref
                     notrufSettings.sounds = (notrufSettings.sounds || []).filter(s => s.id !== soundId);
                     (notrufSettings.modes || []).forEach(mode => {
                         if (mode.config && mode.config.selectedSoundId === soundId) {
                             mode.config.selectedSoundId = null; // Auf null setzen statt undefined
                         }
                     });
                      // Reset temp ID is handled correctly in notfall.js render function
                     try {
                         await setDoc(notrufSettingsDocRef, notrufSettings); // await verwenden
                         // renderSoundBook(); // Wird durch onSnapshot erledigt
                     } catch (err) {
                          console.error("Fehler beim Löschen des Sounds:", err);
                          alertUser('Fehler beim Löschen des Sounds.', 'error');
                     }
                 }
             }
             // Apply (Logik bleibt in notfall.js' renderSoundBook und openModeConfigForm)
             if (e.target.closest('#soundBookApplyButton')) {
                 // Die Auswahl wird in notfall.js gehandhabt, hier nur schließen
                 soundModal.style.display = 'none';
             }
         });
         soundModal.dataset.listenerAttached = 'true';
     }

     console.log("setupEventListeners: Alle Listener hinzugefügt.");
} // Ende setupEventListeners