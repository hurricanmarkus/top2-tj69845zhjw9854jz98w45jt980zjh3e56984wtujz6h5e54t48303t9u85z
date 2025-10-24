// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, query, where, serverTimestamp, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { checkCurrentUserValidity, updateUIForMode, switchToGuestMode } from './log-InOut.js';
import { renderModalUserButtons, listenForUserUpdates } from './admin_benutzersteuerung.js';
import { listenForRoleUpdates, listenForAdminRoleUpdates } from './admin_rollenverwaltung.js';
import { listenForApprovalRequests } from './admin_genehmigungsprozess.js';
import { toggleAdminSection } from './admin_adminfunktionenHome.js';
import { initializeEssensberechnungView } from './essensberechnung.js';
import { IFTTT_URL, initializeNotrufSettingsView } from './notfall.js';
import { PUSHOVER_TOKEN, RECIPIENT_KEYS } from './pushbenachrichtigung.js';
import { listenForChecklistGroups, listenForChecklistItems, listenForChecklists, listenForChecklistCategories, listenForTemplates } from './checklist.js';
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
        const checklistStacksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'checklist-stacks');
        approvalRequestsCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'approval-requests');
        // --- Ende DB Refs ---

        if (!usersCollectionRef) { console.error("initializeFirebase: FEHLER - usersCollectionRef konnte nicht erstellt werden!"); return; }
        else { console.log("initializeFirebase: usersCollectionRef erfolgreich erstellt, Pfad:", usersCollectionRef.path); }

        console.log("initializeFirebase: Versuche anonyme Anmeldung...");
        try {
            const userCredential = await signInAnonymously(auth);
            console.log("initializeFirebase: Anonyme Anmeldung erfolgreich. User UID:", userCredential.user.uid);
        } catch (error) {
            console.error("initializeFirebase: FEHLER bei anonymer Anmeldung:", error);
            // alertUser ist hier evtl. noch nicht sicher definiert, daher nur Konsole
            // alertUser("Firebase Authentifizierung fehlgeschlagen.", "error");
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
                     // UI Update für default checklist könnte hier ausgelöst werden, falls nötig
                     // updateUIForMode(); // Eher am Ende aufrufen
                }, (error) => {
                    console.error("Error listening to settings:", error);
                });

                onSnapshot(notrufSettingsDocRef, (docSnap) => {
                     if (docSnap.exists()) {
                         notrufSettings = docSnap.data();
                         // Initialisiere fehlende Felder, falls nötig
                         if (!notrufSettings.modes) notrufSettings.modes = [];
                         if (!notrufSettings.contacts) notrufSettings.contacts = [];
                         if (!notrufSettings.apiTokens) notrufSettings.apiTokens = [];
                         if (!notrufSettings.sounds) notrufSettings.sounds = [];
                         if (!notrufSettings.flicAssignments) notrufSettings.flicAssignments = { einfach: null, doppel: null, halten: null };
                     } else {
                         console.warn("Firebase Notruf Settings Document 'notruf' not found, creating default.");
                         notrufSettings = { modes: [], contacts: [], apiTokens: [], sounds: [], flicAssignments: { einfach: null, doppel: null, halten: null } };
                         // Optional: Hier setDoc aufrufen, um das Dokument zu erstellen
                         // setDoc(notrufSettingsDocRef, notrufSettings);
                     }
                      // UI Update für Notruf-Seite hier auslösen, falls sie aktiv ist
                      // if (document.getElementById('notrufSettingsView')?.classList.contains('active')) {
                      //     initializeNotrufSettingsView(); // Beispiel
                      // }
                }, (error) => {
                    console.error("Error listening to notruf settings:", error);
                });
                // --- Ende Listener für App-Einstellungen ---

                await seedInitialData(); // Sicherstellen, dass die Funktion existiert
                console.log("initializeFirebase: Seed Data abgeschlossen, starte Haupt-Listener...");

                // Haupt-Daten-Listener
                console.log("initializeFirebase: Rufe listenForRoleUpdates auf...");
                listenForRoleUpdates(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: Rufe listenForAdminRoleUpdates auf...");
                listenForAdminRoleUpdates(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: Rufe listenForUserUpdates auf...");
                listenForUserUpdates(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: Rufe listenForApprovalRequests auf...");
                listenForApprovalRequests(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: Rufe listenForChecklists auf...");
                listenForChecklists(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: Rufe listenForChecklistItems auf...");
                listenForChecklistItems(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: Rufe listenForChecklistGroups auf...");
                listenForChecklistGroups(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: Rufe listenForChecklistCategories auf...");
                listenForChecklistCategories(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: Rufe listenForTemplates auf...");
                listenForTemplates(); // Sicherstellen, dass importiert

                onSnapshot(query(checklistStacksCollectionRef, orderBy('name')), (snapshot) => {
                    Object.assign(CHECKLIST_STACKS, {}); // Leeren statt neu zuweisen
                     snapshot.forEach((doc) => {
                         CHECKLIST_STACKS[doc.id] = { id: doc.id, ...doc.data() };
                     });
                     // UI Update für Templates/Stacks, falls nötig und aktiv
                     // const settingsView = document.getElementById('checklistSettingsView');
                     // if (settingsView?.classList.contains('active')) { ... }
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
                checkCurrentUserValidity(); // Sicherstellen, dass importiert
                initialAuthCheckDone = true;
                updateUIForMode(); // Sicherstellen, dass importiert
                console.log("initializeFirebase: UI für aktuellen Status aktualisiert.");
            } else {
                console.log("Firebase meldet KEINEN User (auch nicht anonym!), wechsle explizit zum Gastmodus.");
                switchToGuestMode(false); // Sicherstellen, dass importiert
                 initialAuthCheckDone = true;
                 updateUIForMode(); // Sicherstellen, dass importiert
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

function setButtonLoading(button, isLoading) {
    const text = button.querySelector('.button-text');
    const spinner = button.querySelector('.loading-spinner');
    button.disabled = isLoading;
    if (text) text.style.display = isLoading ? 'none' : 'inline-block';
    if (spinner) spinner.style.display = isLoading ? 'inline-block' : 'none';
}

export function navigate(targetViewName) {
    const targetView = views[targetViewName];
    if (!targetView) return;

    const userPermissions = currentUser.permissions;
    if (['entrance', 'pushover'].includes(targetViewName) && !userPermissions.includes(targetViewName.toUpperCase())) {
        return alertUser("Zugriff verweigert.", 'error');
    }
    const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SYSTEMADMIN';
    if (targetViewName === 'admin' && !isAdmin) {
        return alertUser("Zugriff verweigert.", 'error');
    }

    document.querySelector('.main-content').scrollTop = 0;
    Object.values(viewElements).forEach(el => el && el.classList.remove('active'));
    document.getElementById(targetView.id).classList.add('active');

    updateUIForMode();

    if (targetViewName === 'userSettings') {
        document.getElementById('userSettingsName').textContent = `Passwort für ${currentUser.displayName} ändern`;
        const user = USERS[currentUser.mode];
        document.getElementById('currentUserKeyDisplay').style.display = user?.key ? 'block' : 'none';
        if (user?.key) document.getElementById('currentUserKeyDisplay').innerHTML = `<p class="text-lg">Dein aktuelles Passwort lautet: <strong class="font-bold">${user.key}</strong></p>`;
    }
    if (targetViewName === 'essensberechnung') {
        initializeEssensberechnungView();
    }
    // HIER DEN NEUEN BLOCK HINZUFÜGEN
    // Ersetze diesen Block in der 'navigate()'-Funktion:
    // Ersetze diesen Block in der 'navigate()'-Funktion:
    if (targetViewName === 'notrufSettings') {
        initializeNotrufSettingsView(); // Lädt Daten im Hintergrund

        // Setzt den visuellen Standard-Zustand zurück (Prompt sichtbar)
        const prompt = document.getElementById('notruf-prompt');
        if (prompt) prompt.style.display = 'block';

        const flicCard = document.getElementById('card-flic-notruf');
        if (flicCard) flicCard.classList.add('hidden');

        const appCard = document.getElementById('card-app-notruf');
        if (appCard) appCard.classList.add('hidden');

        // Tab-Stile zurücksetzen
        document.querySelectorAll('#notruf-settings-tabs .settings-tab-btn').forEach(tab => {
            tab.classList.remove('bg-white', 'shadow', 'text-indigo-600');
            tab.classList.add('text-gray-600');
        });

        // Akkordeon einklappen, falls es offen war
        const configArea = document.getElementById('notrufConfigArea');
        const configIcon = document.getElementById('notrufConfigToggleIcon'); // Hole das Icon

        // --- KORREKTUR START ---
        // Stelle sicher, dass BEIDE Elemente (configArea UND configIcon) existieren,
        // bevor du versuchst, Klassen zu ändern.
        if (configArea && configIcon && !configArea.classList.contains('hidden')) {
            configArea.classList.add('hidden');
            configIcon.classList.remove('rotate-180'); // Jetzt ist der Zugriff sicher
        }
        // --- KORREKTUR ENDE ---
    }
}

export function setupEventListeners() {
    // Event listener for the app header to navigate home
    appHeader.addEventListener('click', () => navigate('home'));
    // Central click handler for the main content area
    document.querySelector('.main-content').addEventListener('click', function (e) {

        // --- Buttons on the home page ---
        // Navigate to user settings if the settings button is clicked
        if (e.target.closest('#mainSettingsButton')) {
            navigate('userSettings');
            return;
        }
        // Navigate to admin view if the admin button is clicked
        if (e.target.closest('#mainAdminButton')) {
            navigate('admin');
            return;
        }

        // Navigate to pushover view if the pushover button is clicked
        const pushoverBtn = e.target.closest('#pushoverButton');
        if (pushoverBtn) {
            navigate('pushover');
            return;
        }
        // Navigate to notruf settings view if the notruf settings button is clicked
        const notrufBtn = e.target.closest('#notrufSettingsButton');
        if (notrufBtn) {
            navigate('notrufSettings');
            return;
        }

        // --- "Back" buttons ---
        // Navigate to the target specified in the back link's data-target attribute
        const backLink = e.target.closest('.back-link');
        if (backLink && backLink.dataset.target) {
            navigate(backLink.dataset.target);
            return;
        }

        // --- Container button in settings ---
        // Open the template modal if the show template modal button is clicked
        const templateBtn = e.target.closest('#show-template-modal-btn');
        if (templateBtn) {
            const listId = document.getElementById('checklist-settings-editor-switcher').value;
            if (listId) {
                openTemplateModal(listId);
            } else {
                // Alert user if no list is selected
                alertUser("Bitte wählen Sie zuerst eine Liste aus, die Sie bearbeiten möchten.", "error");
            }
            return;
        }
    });
    // Navigate to entrance view when the entrance card is clicked
    document.getElementById('entranceCard').addEventListener('click', () => navigate('entrance'));
    // Hide the user selection modal when the cancel button is clicked
    document.getElementById('cancelSelectionButton').addEventListener('click', () => userSelectionModal.style.display = 'none');
    // Hide the pin modal and show the user selection modal when the back button is clicked
    document.getElementById('backToSelectionButton').addEventListener('click', () => { pinModal.style.display = 'none'; userSelectionModal.style.display = 'flex'; });
    // Handle user selection from the modal
    document.getElementById('modalUserButtons').addEventListener('click', (e) => {
        const button = e.target.closest('.select-user-button');
        if (!button) return;
        const user = USERS[button.dataset.user];
        const pinRegularContent = pinModal.querySelector('#pinRegularContent');
        const pinLockedContent = pinModal.querySelector('#pinLockedContent');
        // If user is active, show pin input modal
        if (user && user.isActive) {
            selectedUserForLogin = button.dataset.user;
            userSelectionModal.style.display = 'none';
            pinRegularContent.style.display = 'block';
            pinLockedContent.style.display = 'none';
            pinModalTitle.textContent = `Schlüssel für ${user.name}`;
            adminPinInput.value = '';
            pinError.style.display = 'none';
            pinModal.style.display = 'flex';
            // Focus on the pin input after a short delay
            setTimeout(() => adminPinInput.focus(), 100);
        } else if (user && !user.isActive) { // If user is inactive, show locked message
            userSelectionModal.style.display = 'none';
            pinRegularContent.style.display = 'none';
            pinLockedContent.style.display = 'block';
            pinModal.style.display = 'flex';
        }
    });
    // Navigate to essensberechnung view when the card is clicked (duplicate listener, but harmless)
    document.getElementById('essensberechnungCard').addEventListener('click', () => {
        navigate('essensberechnung');
    });
    document.getElementById('essensberechnungCard').addEventListener('click', () => navigate('essensberechnung'));

    // Hide the pin modal and show the user selection modal when closing the locked message
    document.getElementById('closeLockedModalButton').addEventListener('click', () => {
        pinModal.style.display = 'none';
        userSelectionModal.style.display = 'flex';
    });
    // Function to handle the login attempt
    const handleLogin = () => {
        const userKeyInDB = USERS[selectedUserForLogin]?.key;
        const enteredPin = adminPinInput.value;
        // Debugging logs
        console.log("handleLogin: Vergleich startet.");
        console.log("handleLogin: User ID:", selectedUserForLogin);
        console.log("handleLogin: Erwarteter Key (aus DB):", userKeyInDB);
        console.log("handleLogin: Eingegebene PIN:", enteredPin);
        console.log("handleLogin: Stimmen sie überein?", userKeyInDB === enteredPin);
        // Check if the entered pin matches the user's key
        if (USERS[selectedUserForLogin]?.key === adminPinInput.value) {
            pinModal.style.display = 'none';
            adminPinInput.value = '';
            // Store the logged-in user in local storage
            localStorage.setItem(ADMIN_STORAGE_KEY, selectedUserForLogin);
            // Check validity and update UI
            checkCurrentUserValidity();
            alertUser(`Erfolgreich als ${USERS[selectedUserForLogin].name} angemeldet!`, "success");
        } else { // If pin is incorrect, show error and clear input
            pinError.style.display = 'block';
            adminPinInput.value = '';
        }
    };

    // Add click listener to the submit key button if it exists
    if (submitAdminKeyButton && typeof submitAdminKeyButton.addEventListener === 'function') {
        submitAdminKeyButton.addEventListener('click', handleLogin);
        console.log("Listener für submitAdminKeyButton ERFOLGREICH hinzugefügt.");
    } else {
        // Log error if button cannot be found or listener cannot be added
        console.error("FEHLER: Konnte Listener für submitAdminKeyButton NICHT hinzufügen!", submitAdminKeyButton);
    }
    // Debugging log for adminPinInput
    console.log("Wert von adminPinInput VOR addEventListener:", adminPinInput);
    // Add keydown listener to the pin input for Enter key if it exists
    if (adminPinInput && typeof adminPinInput.addEventListener === 'function') {
        adminPinInput.addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin());
        console.log("Listener für adminPinInput ERFOLGREICH hinzugefügt.");
    } else {
        // Log error if input cannot be found or listener cannot be added
        console.error("FEHLER: Konnte Listener für adminPinInput NICHT hinzufügen!", adminPinInput);
    }
    // Add click listeners to toggle admin section visibility
    adminRightsToggle.addEventListener('click', () => toggleAdminSection('adminRights'));
    roleSettingsToggle.addEventListener('click', () => toggleAdminSection('role'));
    passwordSettingsToggle.addEventListener('click', () => toggleAdminSection('password'));
    userManagementToggle.addEventListener('click', () => toggleAdminSection('user'));
    approvalProcessToggle.addEventListener('click', () => toggleAdminSection('approval'));
    protocolHistoryToggle.addEventListener('click', () => toggleAdminSection('protocol'));
    mainFunctionsToggle.addEventListener('click', () => toggleAdminSection('mainFunctions'));

    // Add click listeners to entrance view action buttons
    document.querySelectorAll('#entranceView .action-button').forEach(button => {
        button.addEventListener('click', e => {
            const buttonEl = e.currentTarget;
            const delay = parseInt(buttonEl.dataset.delay, 10);
            const buttonTextEl = buttonEl.querySelector('.button-text');
            const originalText = buttonTextEl.textContent;
            // Async function to send the IFTTT request
            const sendRequest = async () => {
                setButtonLoading(buttonEl, true);
                buttonTextEl.style.display = 'none';
                try {
                    // Send request to IFTTT URL
                    await fetch(IFTTT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value1: delay }) });
                    alertUser(`Befehl "Öffnen" gesendet!`, 'success');
                } catch (error) {
                    // Handle errors
                    alertUser('Fehler beim Senden des Befehls.', 'error');
                    console.error("IFTTT Error:", error);
                } finally {
                    // Reset button state
                    setButtonLoading(buttonEl, false);
                    buttonTextEl.textContent = originalText;
                    buttonTextEl.style.display = 'inline-block';
                }
            };
            // If delay is 0, send request immediately
            if (delay === 0) {
                sendRequest();
            } else { // Otherwise, start countdown
                buttonEl.disabled = true;
                let countdown = delay;
                buttonTextEl.textContent = countdown;
                const interval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        buttonTextEl.textContent = countdown;
                    } else { // When countdown finishes, clear interval and send request
                        clearInterval(interval);
                        sendRequest();
                    }
                }, 1000);
            }
        });
    });
    // Add click listener to send dynamic pushover notification button
    document.getElementById('sendDynamicPostButton').addEventListener('click', async (e) => {
        const buttonEl = e.currentTarget;
        const message = document.getElementById('pushoverMessage').value;
        // Check if message is empty
        if (!message) return alertUser('Bitte Nachricht eingeben.', 'error');
        setButtonLoading(buttonEl, true);
        // Create form data for Pushover API
        const formData = new FormData();
        formData.append('token', PUSHOVER_TOKEN);
        formData.append('user', RECIPIENT_KEYS[document.getElementById('pushoverRecipient').value]);
        formData.append('title', document.getElementById('pushoverTitle').value);
        formData.append('message', message);
        try {
            // Send request to Pushover API
            const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: formData });
            const data = await response.json();
            // Check response status
            if (data.status !== 1) throw new Error(data.errors.join(', '));
            alertUser('Nachricht gesendet!', 'success');
            // Clear message input
            document.getElementById('pushoverMessage').value = '';
        } catch (error) { // Handle errors
            alertUser(`Fehler: ${error.message}`, 'error');
        } finally { // Reset button state
            setButtonLoading(buttonEl, false);
        }
    });

    // Add click listener to save user settings key button
    document.getElementById('userSettingsSaveKeyButton').addEventListener('click', async () => {
        const newKeyInput = document.getElementById('userSettingsNewKeyInput');
        const newKey = newKeyInput.value;
        // Validate key length
        if (newKey.length < 4) return alertUser("Der Schlüssel muss mindestens 4 Zeichen lang sein.", "error");
        // Update user key in Firestore
        await updateDoc(doc(usersCollectionRef, currentUser.mode), { key: newKey });
        // Log the action
        await logAdminAction('self_password_changed', `Eigenes Passwort geändert.`);
        alertUser(`Ihr Schlüssel wurde erfolgreich aktualisiert!`, "success");
        // Update local user object and display
        USERS[currentUser.mode].key = newKey;
        document.getElementById('currentUserKeyDisplay').innerHTML = `<p class="text-lg">Dein aktuelles Passwort lautet: <strong class="font-bold">${newKey}</strong></p>`;
        // Clear input field
        newKeyInput.value = '';
    });
    // Add click listener to navigate to the current checklist view
    document.getElementById('currentChecklistCard').addEventListener('click', () => {
        const defaultListId = adminSettings.defaultChecklistId;
        renderChecklistView(defaultListId);
        navigate('checklist');
    });
    // Add click listener to navigate to the checklist settings view
    document.getElementById('checklistSettingsCard').addEventListener('click', () => {
        renderChecklistSettingsView();
        navigate('checklistSettings');
    });
    // Add click listener to close the archived lists modal
    const closeArchivedModalBtn = document.getElementById('closeArchivedListsModal');
    if (closeArchivedModalBtn) {
        closeArchivedModalBtn.addEventListener('click', () => {
            document.getElementById('archivedListsModal').style.display = 'none';
        });
    }

    // Add click listener to the archived lists container for restore/delete actions
    const archivedListsContainer = document.getElementById('archivedListsContainer');
    if (archivedListsContainer) {
        archivedListsContainer.addEventListener('click', async (e) => {
            const restoreBtn = e.target.closest('.restore-archived-btn');
            const deleteBtn = e.target.closest('.delete-archived-btn');

            // Handle restore action
            if (restoreBtn) {
                const listId = restoreBtn.dataset.listId;
                await updateDoc(doc(checklistsCollectionRef, listId), { isArchived: false, archivedAt: null, archivedBy: null });
                alertUser("Liste wurde aus dem Archiv wiederhergestellt.", "success");
            }

            // Handle delete action (move to trash)
            if (deleteBtn) {
                const listId = deleteBtn.dataset.listId;
                const listName = ARCHIVED_CHECKLISTS[listId]?.name;
                // Ask for confirmation
                const confirmation = prompt(`Um die Liste "${listName}" endgültig in den Papierkorb zu verschieben, geben Sie bitte "LISTE LÖSCHEN" ein:`);
                if (confirmation === 'LISTE LÖSCHEN') {
                    // Update list status in Firestore
                    await updateDoc(doc(checklistsCollectionRef, listId), { isDeleted: true, isArchived: false, deletedAt: serverTimestamp(), deletedBy: currentUser.displayName });
                    alertUser(`Liste "${listName}" wurde in den Papierkorb verschoben.`, "success");
                } else if (confirmation !== null) { // If confirmation is wrong or cancelled
                    alertUser("Löschvorgang abgebrochen.", "error");
                }
            }
        });
    }

    // Add click listener for the API token modal
    const apiTokenModal = document.getElementById('apiTokenBookModal');
    if (apiTokenModal && !apiTokenModal.dataset.listenerAttached) {
        apiTokenModal.addEventListener('click', (e) => {
            // Close modal button
            if (e.target.closest('#apiTokenBookCloseButton')) {
                apiTokenModal.style.display = 'none';
            }
            // Add token button
            if (e.target.closest('#apiTokenAddButton')) {
                const name = document.getElementById('apiTokenName').value.trim();
                const key = document.getElementById('apiTokenKey').value.trim();
                // Validate input
                if (name && key) {
                    // Initialize array if it doesn't exist
                    if (!notrufSettings.apiTokens) notrufSettings.apiTokens = [];
                    // Add new token
                    notrufSettings.apiTokens.push({ id: Date.now(), name, key });
                    // Save updated settings to Firestore
                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        // Re-render the token list and clear inputs
                        renderApiTokenBook();
                        document.getElementById('apiTokenName').value = '';
                        document.getElementById('apiTokenKey').value = '';
                    }).catch(err => alertUser('Fehler beim Speichern des Tokens.', 'error'));
                } else { // Alert if input is missing
                    alertUser('Bitte Bezeichnung und Key für den Token ausfüllen.', 'error');
                }
            }
            // Delete token button
            if (e.target.closest('.delete-api-token-btn')) {
                const tokenId = parseInt(e.target.closest('.delete-api-token-btn').dataset.tokenId);
                // Ask for confirmation
                if (confirm('Möchten Sie diesen API-Token wirklich löschen?')) {
                    // Filter out the token to be deleted
                    notrufSettings.apiTokens = notrufSettings.apiTokens.filter(t => t.id !== tokenId);
                    // Remove the deleted token from any modes using it
                    if (notrufSettings.modes) {
                        notrufSettings.modes.forEach(mode => {
                            if (mode.config && mode.config.selectedApiTokenId === tokenId) {
                                mode.config.selectedApiTokenId = null;
                            }
                        });
                    }
                    // Reset the temporary selection if the deleted token was selected
                    if (tempSelectedApiTokenId === tokenId) {
                        tempSelectedApiTokenId = null;
                        document.getElementById('notrufApiTokenDisplay').innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
                    }
                    // Save updated settings to Firestore
                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        renderApiTokenBook(); // Re-render the token list
                    }).catch(err => alertUser('Fehler beim Löschen des Tokens.', 'error'));
                }
            }
            // Apply selection button
            if (e.target.closest('#apiTokenBookApplyButton')) {
                const selectedRadio = apiTokenModal.querySelector('.api-token-radio:checked');
                const displayArea = document.getElementById('notrufApiTokenDisplay');
                if (selectedRadio) { // If a token is selected
                    const tokenId = parseInt(selectedRadio.value);
                    const token = (notrufSettings.apiTokens || []).find(t => t.id === tokenId);
                    if (token) {
                        // Update temporary selection and display
                        tempSelectedApiTokenId = tokenId;
                        displayArea.innerHTML = `<span class="api-token-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-token-id="${token.id}">${token.name}</span>`;
                    }
                } else { // If no token is selected
                    tempSelectedApiTokenId = null;
                    displayArea.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
                }
                // Hide the modal
                apiTokenModal.style.display = 'none';
            }
        });
        // Mark listener as attached
        apiTokenModal.dataset.listenerAttached = 'true';
    }

    // --- Event Listener für das Sound Buch Modal ---
    const soundModal = document.getElementById('soundBookModal');
    if (soundModal && !soundModal.dataset.listenerAttached) {
        // Get checkbox and input for custom sound name
        const useCustomNameCheckbox = soundModal.querySelector('#soundUseCustomName');
        const customNameInput = soundModal.querySelector('#soundCustomName');
        // Add change listener to toggle custom name input visibility
        if (useCustomNameCheckbox && customNameInput) {
            useCustomNameCheckbox.addEventListener('change', (e) => {
                customNameInput.classList.toggle('hidden', !e.target.checked);
                // Clear input if hidden
                if (!e.target.checked) customNameInput.value = '';
            });
        }

        // Add click listener to the sound modal
        soundModal.addEventListener('click', (e) => {
            // Close modal button
            if (e.target.closest('#soundBookCloseButton')) {
                soundModal.style.display = 'none';
            }
            // Add sound button
            if (e.target.closest('#soundAddButton')) {
                const code = document.getElementById('soundCode').value.trim();
                const useCustom = document.getElementById('soundUseCustomName').checked;
                const customName = document.getElementById('soundCustomName').value.trim();
                // Validate input
                if (code && (!useCustom || (useCustom && customName))) {
                    // Initialize array if it doesn't exist
                    if (!notrufSettings.sounds) notrufSettings.sounds = [];
                    // Add new sound object
                    notrufSettings.sounds.push({
                        id: Date.now(),
                        code: code,
                        useCustomName: useCustom,
                        customName: useCustom ? customName : null
                    });
                    // Save updated settings to Firestore
                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        // Re-render sound list and clear inputs
                        renderSoundBook();
                        document.getElementById('soundCode').value = '';
                        document.getElementById('soundUseCustomName').checked = false;
                        document.getElementById('soundCustomName').value = '';
                        document.getElementById('soundCustomName').classList.add('hidden');
                    }).catch(err => alertUser('Fehler beim Speichern des Sounds.', 'error'));
                } else { // Alert if input is missing
                    alertUser('Bitte Soundcode und ggf. eigenen Namen ausfüllen.', 'error');
                }
            }
            // Delete sound button
            if (e.target.closest('.delete-sound-btn')) {
                const soundId = parseInt(e.target.closest('.delete-sound-btn').dataset.soundId);
                // Ask for confirmation
                if (confirm('Möchten Sie diesen Sound wirklich löschen?')) {
                    // Filter out the sound to be deleted
                    notrufSettings.sounds = notrufSettings.sounds.filter(s => s.id !== soundId);
                    // Remove the deleted sound from any modes using it
                    if (notrufSettings.modes) {
                        notrufSettings.modes.forEach(mode => {
                            if (mode.config && mode.config.selectedSoundId === soundId) {
                                mode.config.selectedSoundId = null;
                            }
                        });
                    }
                    // Reset the temporary selection if the deleted sound was selected
                    if (tempSelectedSoundId === soundId) {
                        tempSelectedSoundId = null;
                        document.getElementById('notrufSoundDisplay').innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
                    }
                    // Save updated settings to Firestore
                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        renderSoundBook(); // Re-render the sound list
                    }).catch(err => alertUser('Fehler beim Löschen des Sounds.', 'error'));
                }
            }
            // Apply selection button
            if (e.target.closest('#soundBookApplyButton')) {
                const selectedRadio = soundModal.querySelector('.sound-radio:checked');
                const displayArea = document.getElementById('notrufSoundDisplay');

                // If a specific sound (not default) is selected
                if (selectedRadio && selectedRadio.value !== 'default') {
                    const soundId = parseInt(selectedRadio.value);
                    const sound = (notrufSettings.sounds || []).find(s => s.id === soundId);
                    if (sound) {
                        // Update temporary selection and display
                        tempSelectedSoundId = soundId;
                        const displayName = sound.useCustomName && sound.customName ? sound.customName : sound.code;
                        displayArea.innerHTML = `<span class="sound-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-sound-id="${sound.id}">${displayName}</span>`;
                    }
                } else { // If default or nothing is selected
                    tempSelectedSoundId = null;
                    displayArea.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
                }
                // Hide the modal
                soundModal.style.display = 'none';
            }
        });
        // Mark listener as attached
        soundModal.dataset.listenerAttached = 'true';
    }
}