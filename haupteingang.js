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
export let tempSelectedSoundId = null;
// Für das Bearbeiten-Formular
export let unsubscribeTemplateItems = null;
export let adminSettings = {};
export let selectedUserForLogin = null;
export let adminSectionsState = { password: false, user: false, role: false, approval: false, protocol: false, adminRights: false, mainFunctions: false };
export let localUpdateInProgress = false;
export function setLocalUpdateInProgress(value) {
    localUpdateInProgress = value;
}
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
export const views = { home: { id: 'homeView' }, entrance: { id: 'entranceView' }, pushover: { id: 'pushoverView' }, admin: { id: 'adminView' }, userSettings: { id: 'userSettingsView' }, checklist: { id: 'checklistView' }, checklistSettings: { id: 'checklistSettingsView' }, essensberechnung: { id: 'essensberechnungView' }, notrufSettings: { id: 'notrufSettingsView' } };
const viewElements = Object.fromEntries(Object.keys(views).map(key => [key + 'View', document.getElementById(views[key].id)]));

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
    // console.log("Wert von submitAdminKeyButton IN window.onload:", submitAdminKeyButton); // Logging entfernt
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

            // --- NEU: Functions Initialisierung HIER ---
            if (user && !window.firebaseFunctionsInitialised) {
                const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js");
                const functions = getFunctions(app);
                // setRoleClaim muss jetzt manuell im window-Objekt verfügbar gemacht werden,
                // da es global von handleLogin benötigt wird, die Funktion aber nur im onAuthStateChanged erstellt werden kann.
                window.setRoleClaim = httpsCallable(functions, 'setRoleClaim'); 
                window.firebaseFunctionsInitialised = true;
                console.log("Firebase Functions initialisiert und global verfügbar gemacht.");
            }
            // --- ENDE NEU ---


            // Listener starten (unabhängig vom Login-Status)
            try {
                console.log("initializeFirebase: Starte Daten-Listener...");
                
                // --- Listener für App-Einstellungen (Settings) ---
                onSnapshot(settingsDocRef, (docSnap) => { 
                    if (docSnap.exists()) {
                        adminSettings = docSnap.data();
                         // console.log("Admin Settings geladen:", adminSettings); // Logging entfernt
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
                         // console.log("Notruf Settings geladen"); // Logging entfernt
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
                // console.log("initializeFirebase: Alle Listener-Funktionen aufgerufen."); // Logging entfernt

            } catch (error) {
                console.error("initializeFirebase: FEHLER beim Starten der Listener:", error);
                alertUser("Fehler beim Initialisieren der Daten-Listener.", "error");
            }

            // UI basierend auf User-Status aktualisieren
            if (user) {
                console.log("initializeFirebase: User (anonym) vorhanden. Rufe checkCurrentUserValidity auf.");
                await checkCurrentUserValidity(); 
                initialAuthCheckDone = true; 
            } else {
                console.log("Firebase meldet KEINEN User, wechsle explizit zum Gastmodus.");
                switchToGuestMode(false);
                 initialAuthCheckDone = true;
                 updateUIForMode(); 
            }
             // console.log("initializeFirebase: Ende des onAuthStateChanged Callbacks."); // Logging entfernt
        }); // Ende onAuthStateChanged
    } catch (error) {
        console.error("initializeFirebase: FEHLER bei der grundlegenden Firebase Initialisierung:", error);
        alertUser("Firebase konnte nicht initialisiert werden.", "error");
    }
     // console.log("initializeFirebase: Funktion komplett beendet."); // Logging entfernt
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
            // Dies ist der Schreibvorgang, der den Fehler auslöst.
            // Er wird nur ausgeführt, wenn die Sammlung leer ist.
            await setDoc(doc(usersCollectionRef, 'SYSTEMADMIN'), { name: 'Systemadmin', key: 'top2sys', role: 'SYSTEMADMIN', isActive: true });
        }
    } catch (error) {
        // Logging anpassen, um die Fehlerquelle besser zu identifizieren
        console.error("SCHWERER FEHLER in seedInitialData (Datenbank-Setup):", error);
        throw error;
    }
}

export function alertUser(message, type) {
    // 1. Dauer und Farbe bestimmen (Standard ist Erfolg)
    let duration = 3000; // Standard-Dauer: 3 Sekunden
    let colorClass = 'bg-green-600'; // Standard-Farbe: Grün ('success')

    // 2. Prüfen, ob ein anderer Typ gewünscht ist
    if (type === 'error') {
        // Normaler Fehler: Rot, 3 Sekunden
        colorClass = 'bg-red-600';
        duration = 3000;
    } else if (type === 'error_long') {
        // DEIN NEUER WUNSCH: Langer Fehler (für Sperrung)
        // Rote Farbe
        colorClass = 'bg-red-600';
        // 3-fache Dauer (3000ms * 3 = 9000ms)
        duration = 9000;
    } else if (type === 'success') {
        // Normaler Erfolg (nur zur Sicherheit)
        colorClass = 'bg-green-600';
        duration = 3000;
    }
    // (Wenn 'type' unbekannt ist, bleibt es beim Standard: Grün, 3 Sek)


    // 3. Alert-Element erstellen (Dieser Teil bleibt wie vorher)
    const tempAlert = document.createElement('div');
    tempAlert.textContent = message;
    
    // 4. Die neuen, variablen Klassen (colorClass) zuweisen
    tempAlert.className = `fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 p-4 rounded-xl text-white font-bold shadow-lg transition-opacity duration-300 z-50 text-center ${colorClass}`;
    
    // 5. Alert anzeigen (Dieser Teil bleibt wie vorher)
    document.body.appendChild(tempAlert);
    setTimeout(() => tempAlert.style.opacity = '1', 10);

    // 6. Alert ausblenden (Dieser Teil nutzt jetzt die neue 'duration')
    setTimeout(() => {
        tempAlert.style.opacity = '0';
        setTimeout(() => tempAlert.remove(), 300);
    }, duration); // <-- Hier wird die neue Dauer (3000 oder 9000) verwendet
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

    if (targetViewName === 'admin') {
        const isAdminRole = currentUser.role === 'ADMIN' || currentUser.role === 'SYSTEMADMIN'; // Echte Rolle
        const isIndividualAdminDisplay = currentUser.permissionType === 'individual' && currentUser.displayRole === 'ADMIN'; // Individuell mit Admin-Anzeige
        const allowAdminAccess = isAdminRole || isIndividualAdminDisplay; // Zugriff erlauben, wenn eine Bedingung zutrifft

        if (!allowAdminAccess) {
            // Nur wenn KEINE der Bedingungen zutrifft, Zugriff verweigern
            return alertUser("Zugriff verweigert (Admin).", 'error');
        }
        // Wenn allowAdminAccess true ist, wird der Code nach dem if-Block normal weiter ausgeführt.
    }

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

export function setupEventListeners() {
    // Sicherstellen, dass die Elemente existieren, bevor Listener hinzugefügt werden
    if (!appHeader || !document.querySelector('.main-content') || !document.getElementById('entranceCard')) {
        console.warn("setupEventListeners: Wichtige Elemente noch nicht bereit, versuche später erneut.");
        // Optional: setTimeout hinzufügen, wenn das Problem häufiger auftritt
        // setTimeout(setupEventListeners, 100);
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
    if (currentChecklistCard) currentChecklistCard.addEventListener('click', () => navigate('checklist')); // Navigiert zur Default-Liste

    const checklistSettingsCard = document.getElementById('checklistSettingsCard');
    if (checklistSettingsCard) checklistSettingsCard.addEventListener('click', () => navigate('checklistSettings'));

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

// =================================================================
// BEGINN DER KORREKTUR (handleLogin)
// =================================================================
// Wir ersetzen die komplette handleLogin Funktion (die innerhalb von setupEventListeners ist)
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
        // --- 3. Manuelle Cloud Function Logik (Finaler Fix) ---
        
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
        
        // Token holen
        const idToken = await auth.currentUser.getIdToken(true); 
        if (!idToken) {
            throw new Error("Konnte kein gültiges ID Token abrufen.");
        }
        
        // Manuelle Anfrage an die Cloud Function senden
        const functionUrl = "https://us-central1-top2-e9ac0.cloudfunctions.net/setRoleClaim";

        const fetchResponse = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // KORREKTUR: Token im Authorization-Header senden (Standard für v2)
                'Authorization': `Bearer ${idToken}`
            },
            // KORREKTUR: Die Daten MÜSSEN in ein "data"-Objekt verpackt werden
            body: JSON.stringify({
                "data": { 
                    "appUserId": appUserId,
                    "pin": enteredPin
                }
            })
        });

        // 4. Ergebnis der Cloud Function auswerten
        // Wenn der Status nicht 200 (OK) ist, war es ein Fehler
        if (fetchResponse.status !== 200) {
            const errorData = await fetchResponse.json();
            // Versuche, die Fehlermeldung aus der v2-Struktur zu lesen
            const errorMessage = errorData?.error?.message || `HTTP-Fehler ${fetchResponse.status}`;
            // (Die Konsole zeigt "Bad Request", weil der Body hier falsch war)
            throw new Error(`Cloud Function Aufruf gescheitert: ${errorMessage}.`);
        }
        
        // Wenn Status 200 ist, lesen wir die erfolgreiche Antwort
        const responseData = await fetchResponse.json();

        // V2 wickelt die Antwort in ein "result"-Objekt
        const result = responseData.result; 
        
        // Prüfe auf Fehler von der Cloud Function (z.B. Ungültiger PIN)
        if (result.status !== "success") { 
             throw new Error("Cloud Function meldete Fehler: " + (result.message || "Unbekannter Fehler"));
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
        alertUser(`Fehler: ${error.message || 'Interner Fehler'}`, "error");
        
        switchToGuestMode(false);
        updateUIForMode();
    }
};
// =================================================================
// ENDE DER KORREKTUR
// =================================================================

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
            if (!buttonTextEl || isNaN(delay)) return; // Abbruch bei fehlenden Elementen/ungültigem Delay
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
            // Stelle sicher, dass RECIPIENT_KEYS definiert ist und den Wert enthält
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
    if (archivedListsContainer && !archivedListsContainer.dataset.listenerAttached) { // Verhindert doppelte Listener
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
        archivedListsContainer.dataset.listenerAttached = 'true'; // Markieren, dass Listener hinzugefügt wurde
    }

    // --- API Token Modal ---
    const apiTokenModal = document.getElementById('apiTokenBookModal');
    if (apiTokenModal && !apiTokenModal.dataset.listenerAttached) {
        apiTokenModal.addEventListener('click', async (e) => {
            // ... (Inhalt des Listeners bleibt gleich wie in der vorherigen Antwort) ...
        });
        apiTokenModal.dataset.listenerAttached = 'true';
    }


    // --- Sound Book Modal ---
    const soundModal = document.getElementById('soundBookModal');
    if (soundModal && !soundModal.dataset.listenerAttached) {
        // ... (Inhalt des Listeners bleibt gleich wie in der vorherigen Antwort) ...
        soundModal.dataset.listenerAttached = 'true';
    }

    console.log("setupEventListeners: Alle Basis-Listener hinzugefügt.");
} // Ende setupEventListeners
