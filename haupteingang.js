// BEGINN-ZIKA: IMPORT-BEFEHLE IMMER ABSOLUTE POS1 //
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, addDoc, query, where, serverTimestamp, orderBy, limit, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { checkCurrentUserValidity, updateUIForMode, switchToGuestMode } from './log-InOut.js';
import { renderModalUserButtons, listenForUserUpdates } from './admin_benutzersteuerung.js';
import { listenForRoleUpdates, listenForAdminRoleUpdates } from './admin_rollenverwaltung.js';
import { listenForApprovalRequests } from './admin_genehmigungsprozess.js';
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
export let activeFlicEditorKlickTyp = null;
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
export let editingPortionId = null;

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
    appHeader.addEventListener('click', () => navigate('home'));

    // Central click handler for the main content area
    document.querySelector('.main-content').addEventListener('click', function (e) {

        // --- Buttons on the home page ---
        if (e.target.closest('#mainSettingsButton')) {
            navigate('userSettings');
            return;
        }
        if (e.target.closest('#mainAdminButton')) {
            navigate('admin');
            return;
        }

        const pushoverBtn = e.target.closest('#pushoverButton');
        if (pushoverBtn) {
            navigate('pushover');
            return;
        }
        const notrufBtn = e.target.closest('#notrufSettingsButton');
        if (notrufBtn) {
            navigate('notrufSettings');
            return;
        }

        // --- "Back" buttons ---
        const backLink = e.target.closest('.back-link');
        if (backLink && backLink.dataset.target) {
            navigate(backLink.dataset.target);
            return;
        }

        // --- Container button in settings ---
        const templateBtn = e.target.closest('#show-template-modal-btn');
        if (templateBtn) {
            const listId = document.getElementById('checklist-settings-editor-switcher').value;
            if (listId) {
                openTemplateModal(listId);
            } else {
                alertUser("Bitte wählen Sie zuerst eine Liste aus, die Sie bearbeiten möchten.", "error");
            }
            return;
        }
    });

    document.getElementById('entranceCard').addEventListener('click', () => navigate('entrance'));
    document.getElementById('cancelSelectionButton').addEventListener('click', () => userSelectionModal.style.display = 'none');
    document.getElementById('backToSelectionButton').addEventListener('click', () => { pinModal.style.display = 'none'; userSelectionModal.style.display = 'flex'; });

    document.getElementById('modalUserButtons').addEventListener('click', (e) => {
        const button = e.target.closest('.select-user-button');
        if (!button) return;
        const user = USERS[button.dataset.user];
        const pinRegularContent = pinModal.querySelector('#pinRegularContent');
        const pinLockedContent = pinModal.querySelector('#pinLockedContent');
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

    document.getElementById('essensberechnungCard').addEventListener('click', () => {
        // Hier könnten wir später eine Funktion zum Rendern der Daten aufrufen
        // renderEssensberechnungView(); 
        navigate('essensberechnung');
    });

    document.getElementById('essensberechnungCard').addEventListener('click', () => navigate('essensberechnung'));

    document.getElementById('closeLockedModalButton').addEventListener('click', () => {
        pinModal.style.display = 'none';
        userSelectionModal.style.display = 'flex';
    });

    const handleLogin = () => {
        // --- SPIONE ---
        const userKeyInDB = USERS[selectedUserForLogin]?.key;
        const enteredPin = adminPinInput.value;
        console.log("handleLogin: Vergleich startet.");
        console.log("handleLogin: User ID:", selectedUserForLogin);
        console.log("handleLogin: Erwarteter Key (aus DB):", userKeyInDB);
        console.log("handleLogin: Eingegebene PIN:", enteredPin);
        console.log("handleLogin: Stimmen sie überein?", userKeyInDB === enteredPin);
        // --- ENDE SPIONE ---
        if (USERS[selectedUserForLogin]?.key === adminPinInput.value) {
            pinModal.style.display = 'none';
            adminPinInput.value = '';
            localStorage.setItem(ADMIN_STORAGE_KEY, selectedUserForLogin);
            checkCurrentUserValidity();
            alertUser(`Erfolgreich als ${USERS[selectedUserForLogin].name} angemeldet!`, "success");
        } else {
            pinError.style.display = 'block';
            adminPinInput.value = '';
        }
    };

if (submitAdminKeyButton && typeof submitAdminKeyButton.addEventListener === 'function') {
    submitAdminKeyButton.addEventListener('click', handleLogin);
    console.log("Listener für submitAdminKeyButton ERFOLGREICH hinzugefügt."); // <-- SPION 2
} else {
    console.error("FEHLER: Konnte Listener für submitAdminKeyButton NICHT hinzufügen!", submitAdminKeyButton); // <-- SPION 3
}
    console.log("Wert von adminPinInput VOR addEventListener:", adminPinInput);
    if (adminPinInput && typeof adminPinInput.addEventListener === 'function') {
        // Nur hinzufügen, wenn das Element existiert UND die Methode hat
        adminPinInput.addEventListener('keydown', (e) => e.key === 'Enter' && handleLogin());
        console.log("Listener für adminPinInput ERFOLGREICH hinzugefügt."); // Neuer Spion
    } else {
        // Wenn es hier landet, ist etwas sehr falsch!
        console.error("FEHLER: Konnte Listener für adminPinInput NICHT hinzufügen!", adminPinInput); // Neuer Spion
    }
    adminRightsToggle.addEventListener('click', () => toggleAdminSection('adminRights'));
    roleSettingsToggle.addEventListener('click', () => toggleAdminSection('role'));
    passwordSettingsToggle.addEventListener('click', () => toggleAdminSection('password'));
    userManagementToggle.addEventListener('click', () => toggleAdminSection('user'));
    approvalProcessToggle.addEventListener('click', () => toggleAdminSection('approval'));
    protocolHistoryToggle.addEventListener('click', () => toggleAdminSection('protocol'));
    mainFunctionsToggle.addEventListener('click', () => toggleAdminSection('mainFunctions'));

    document.querySelectorAll('#entranceView .action-button').forEach(button => {
        button.addEventListener('click', e => {
            const buttonEl = e.currentTarget;
            const delay = parseInt(buttonEl.dataset.delay, 10);
            const buttonTextEl = buttonEl.querySelector('.button-text');
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
                buttonTextEl.textContent = countdown;
                const interval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        buttonTextEl.textContent = countdown;
                    } else {
                        clearInterval(interval);
                        sendRequest();
                    }
                }, 1000);
            }
        });
    });

    document.getElementById('sendDynamicPostButton').addEventListener('click', async (e) => {
        const buttonEl = e.currentTarget;
        const message = document.getElementById('pushoverMessage').value;
        if (!message) return alertUser('Bitte Nachricht eingeben.', 'error');
        setButtonLoading(buttonEl, true);
        const formData = new FormData();
        formData.append('token', PUSHOVER_TOKEN);
        formData.append('user', RECIPIENT_KEYS[document.getElementById('pushoverRecipient').value]);
        formData.append('title', document.getElementById('pushoverTitle').value);
        formData.append('message', message);
        try {
            const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', body: formData });
            const data = await response.json();
            if (data.status !== 1) throw new Error(data.errors.join(', '));
            alertUser('Nachricht gesendet!', 'success');
            document.getElementById('pushoverMessage').value = '';
        } catch (error) {
            alertUser(`Fehler: ${error.message}`, 'error');
        } finally {
            setButtonLoading(buttonEl, false);
        }
    });

    document.getElementById('userSettingsSaveKeyButton').addEventListener('click', async () => {
        const newKeyInput = document.getElementById('userSettingsNewKeyInput');
        const newKey = newKeyInput.value;
        if (newKey.length < 4) return alertUser("Der Schlüssel muss mindestens 4 Zeichen lang sein.", "error");
        await updateDoc(doc(usersCollectionRef, currentUser.mode), { key: newKey });
        await logAdminAction('self_password_changed', `Eigenes Passwort geändert.`);
        alertUser(`Ihr Schlüssel wurde erfolgreich aktualisiert!`, "success");
        USERS[currentUser.mode].key = newKey;
        document.getElementById('currentUserKeyDisplay').innerHTML = `<p class="text-lg">Dein aktuelles Passwort lautet: <strong class="font-bold">${newKey}</strong></p>`;
        newKeyInput.value = '';
    });

    document.getElementById('currentChecklistCard').addEventListener('click', () => {
        const defaultListId = adminSettings.defaultChecklistId;
        renderChecklistView(defaultListId);
        navigate('checklist');
    });

    document.getElementById('checklistSettingsCard').addEventListener('click', () => {
        renderChecklistSettingsView();
        navigate('checklistSettings');
    });

    const closeArchivedModalBtn = document.getElementById('closeArchivedListsModal');
    if (closeArchivedModalBtn) {
        closeArchivedModalBtn.addEventListener('click', () => {
            document.getElementById('archivedListsModal').style.display = 'none';
        });
    }

    const archivedListsContainer = document.getElementById('archivedListsContainer');
    if (archivedListsContainer) {
        archivedListsContainer.addEventListener('click', async (e) => {
            const restoreBtn = e.target.closest('.restore-archived-btn');
            const deleteBtn = e.target.closest('.delete-archived-btn');

            if (restoreBtn) {
                const listId = restoreBtn.dataset.listId;
                await updateDoc(doc(checklistsCollectionRef, listId), { isArchived: false, archivedAt: null, archivedBy: null });
                alertUser("Liste wurde aus dem Archiv wiederhergestellt.", "success");
            }

            if (deleteBtn) {
                const listId = deleteBtn.dataset.listId;
                const listName = ARCHIVED_CHECKLISTS[listId]?.name;
                const confirmation = prompt(`Um die Liste "${listName}" endgültig in den Papierkorb zu verschieben, geben Sie bitte "LISTE LÖSCHEN" ein:`);
                if (confirmation === 'LISTE LÖSCHEN') {
                    await updateDoc(doc(checklistsCollectionRef, listId), { isDeleted: true, isArchived: false, deletedAt: serverTimestamp(), deletedBy: currentUser.displayName });
                    alertUser(`Liste "${listName}" wurde in den Papierkorb verschoben.`, "success");
                } else if (confirmation !== null) {
                    alertUser("Löschvorgang abgebrochen.", "error");
                }
            }
        });
    }

    // START: Füge diesen Code in die setupEventListeners() Funktion ein
    // --- Event Listener für die Notruf-Einstellungsseite (Komplett korrigiert) ---
    const notrufView = document.getElementById('notrufSettingsView');
    if (notrufView && !notrufView.dataset.listenerAttached) {

        // Listener für das Tab-Menü
        const tabsContainer = notrufView.querySelector('#notruf-settings-tabs');
        if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
            tabsContainer.addEventListener('click', (e) => {
                const clickedTab = e.target.closest('.settings-tab-btn');
                if (!clickedTab) return;

                const targetCardId = clickedTab.dataset.targetCard;
                const prompt = document.getElementById('notruf-prompt');
                const isAlreadyActive = clickedTab.classList.contains('bg-white');

                // 1. Alles zurücksetzen
                tabsContainer.querySelectorAll('.settings-tab-btn').forEach(tab => {
                    tab.classList.remove('bg-white', 'shadow', 'text-indigo-600');
                    tab.classList.add('text-gray-600');
                });
                notrufView.querySelectorAll('.notruf-settings-card').forEach(card => card.classList.add('hidden'));

                if (isAlreadyActive) {
                    prompt.style.display = 'block';
                } else {
                    prompt.style.display = 'none';
                    clickedTab.classList.add('bg-white', 'shadow', 'text-indigo-600');
                    clickedTab.classList.remove('text-gray-600');
                    const targetCard = document.getElementById(targetCardId);
                    if (targetCard) {
                        targetCard.classList.remove('hidden');
                        if (targetCardId === 'card-flic-notruf') {
                            document.getElementById('modeEditorArea').classList.add('hidden');
                            document.querySelector('#card-flic-notruf .card').classList.remove('hidden');
                            populateModeSelector();
                            displaySelectedModeInfo();
                        }
                    }
                }
            });
            tabsContainer.dataset.listenerAttached = 'true';
        }

        // Listener für den Flic-Button Tab-Inhalt (Auswahlbereich)
        // Listener für den Flic-Button Tab-Inhalt (Auswahl, Speichern, Editor öffnen)
        // === ERSETZE den gesamten 'flicCard' Listener-Block ===
        // Listener für den Flic-Button Tab-Inhalt (Zuweisungsbereich + Editor-Logik)
        // === START: Ersetzter flicCard Listener ===
        const flicCard = document.getElementById('card-flic-notruf');
        if (flicCard) {

            // --- Listener für den EINEN Editor-Dropdown ---
            const editorSelector = document.getElementById('flic-editor-selector');
            if (editorSelector && !editorSelector.dataset.listenerAttached) {
                editorSelector.addEventListener('change', (e) => {
                    if (!activeFlicEditorKlickTyp) return; // Nur wenn eine Box aktiv ist

                    // 1. Hole die ID des *neu ausgewählten* Modus
                    const newModeId = e.target.value ? parseInt(e.target.value) : null;
                    const modes = notrufSettings.modes || [];
                    const selectedMode = modes.find(m => m.id === newModeId);

                    // 2. Aktualisiere *nur* die blaue Details-Box
                    const detailsDisplay = document.getElementById('flic-editor-details');
                    if (selectedMode) {
                        const config = selectedMode.config || {};
                        const recipients = (config.userKeys || []).map(u => u.name).join(', ') || 'Niemand';
                        detailsDisplay.innerHTML = `
                                <strong class="block">Empfänger:</strong>
                                <span class="block pl-2 mb-1">${recipients}</span>
                                <strong class="block">Nachricht:</strong>
                                <span class="block pl-2 mb-1">"${config.message || 'Keine'}"</span>
                                <strong class="block">Prio:\u00A0${config.priority || 'N/A'}, Retry:\u00A0${config.retry || 'N/A'}s</strong>
                            `;
                    } else {
                        detailsDisplay.innerHTML = 'Kein Modus zugewiesen.';
                    }

                    // 3. NICHT 'notrufSettings' oder 'updateFlicColumnDisplays()' aufrufen.
                    // Die Hauptanzeige wird erst nach Klick auf "Speichern" aktualisiert.
                });
                editorSelector.dataset.listenerAttached = 'true';
            }


            // --- Haupt-Click-Listener für die gesamte Karte ---
            flicCard.addEventListener('click', (e) => {

                const editorContainer = document.getElementById('flic-details-editor-container');

                // --- Logik für Klick auf eine der 3 Spalten ---
                const clickedColumn = e.target.closest('.flic-column-block');
                if (clickedColumn) {
                    const klickTyp = clickedColumn.dataset.klickTyp;

                    // Alle Spalten-Hervorhebungen entfernen
                    document.querySelectorAll('.flic-column-block').forEach(col => {
                        col.classList.remove('bg-indigo-100', 'border-indigo-400');
                        col.classList.add('bg-gray-50', 'border-gray-200');
                    });

                    if (klickTyp === activeFlicEditorKlickTyp) {
                        // Fall 1: Aktive Spalte erneut geklickt -> Schließen
                        editorContainer.classList.add('hidden');
                        activeFlicEditorKlickTyp = null;
                    } else {
                        // Fall 2: Neue Spalte geklickt -> Öffnen/Wechseln
                        activeFlicEditorKlickTyp = klickTyp;
                        // WICHTIG: updateFlicEditorBox() füllt jetzt den Editor mit den
                        // *aktuell gespeicherten* Daten, nicht mit den zwischengespeicherten.
                        updateFlicEditorBox(klickTyp);
                        editorContainer.classList.remove('hidden');
                        // Geklickte Spalte hervorheben
                        clickedColumn.classList.add('bg-indigo-100', 'border-indigo-400');
                        clickedColumn.classList.remove('bg-gray-50', 'border-gray-200');
                    }
                    return; // Klick verarbeitet
                }

                // --- Logik für "Zuweisungen Speichern" Button ---
                const saveBtn = e.target.closest('#saveFlicAssignmentsBtn');
                if (saveBtn) {
                    setButtonLoading(saveBtn, true);

                    // 1. Holen, WELCHER Klick-Typ gerade bearbeitet wird
                    if (!activeFlicEditorKlickTyp) {
                        setButtonLoading(saveBtn, false);
                        return; // Sollte nicht passieren, aber sicher ist sicher
                    }

                    // 2. Holen, WELCHER Modus im Dropdown ausgewählt ist
                    const selector = document.getElementById('flic-editor-selector');
                    const newModeId = selector.value ? parseInt(selector.value) : null;

                    // 3. JETZT das Haupt-Datenobjekt aktualisieren
                    if (!notrufSettings.flicAssignments) notrufSettings.flicAssignments = {};
                    notrufSettings.flicAssignments[activeFlicEditorKlickTyp] = newModeId;

                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        alertUser('Flic-Zuweisungen erfolgreich gespeichert!', 'success');

                        // 4. JETZT die 3-Spalten-Anzeige aktualisieren
                        updateFlicColumnDisplays();

                        // 5. Editor schließen
                        document.getElementById('flic-details-editor-container').classList.add('hidden');
                        activeFlicEditorKlickTyp = null;
                        document.querySelectorAll('.flic-column-block').forEach(col => {
                            col.classList.remove('bg-indigo-100', 'border-indigo-400');
                            col.classList.add('bg-gray-50', 'border-gray-200');
                        });
                    }).catch(err => {
                        console.error("Fehler beim Speichern der Flic-Zuweisungen:", err);
                        alertUser('Fehler beim Speichern der Zuweisungen.', 'error');
                    }).finally(() => {
                        setButtonLoading(saveBtn, false);
                    });
                    return; // Klick verarbeitet
                }

                // --- Listener für den "Modi Verwalten" Editor (bleibt gleich) ---
                const editorArea = document.getElementById('modeEditorArea');
                // KORREKTUR für Request 3: 'assignmentAreaContainer' ist die Karte, die wir verstecken wollen
                const assignmentAreaContainer = flicCard.querySelector('.card');

                // "Modi Verwalten" Button -> Zeigt den Modus-Editor an
                if (e.target.closest('#notrufOpenModeEditor')) {
                    // HIER IST DIE LOGIK FÜR REQUEST 3:
                    if (assignmentAreaContainer) assignmentAreaContainer.classList.add('hidden'); // Versteckt die 3-Spalten-Karte

                    if (editorArea) editorArea.classList.remove('hidden');

                    // WICHTIG: Verstecke die Zuweisungs-Details-Box, falls sie offen war
                    editorContainer.classList.add('hidden');
                    activeFlicEditorKlickTyp = null;
                    document.querySelectorAll('.flic-column-block').forEach(col => {
                        col.classList.remove('bg-indigo-100', 'border-indigo-400');
                        col.classList.add('bg-gray-50', 'border-gray-200');
                    });

                    renderModeEditorList();
                    document.getElementById('modeConfigFormContainer').classList.add('hidden');
                    return;
                }

                // Nur reagieren, wenn Klick im Editor war
                if (editorArea && editorArea.contains(e.target)) {
                    // "Editor schließen" Button (X)
                    if (e.target.closest('#notrufCloseModeEditor')) {
                        editorArea.classList.add('hidden');
                        // HIER IST DIE LOGIK FÜR REQUEST 3 (Rückgängig):
                        if (assignmentAreaContainer) assignmentAreaContainer.classList.remove('hidden'); // Zeigt die 3-Spalten-Karte wieder an
                        document.getElementById('modeConfigFormContainer').classList.add('hidden');
                    }
                    // "Neuen Modus anlegen" Button (+)
                    if (e.target.closest('#notrufAddNewModeButton')) {
                        openModeConfigForm();
                    }
                    // "Bearbeiten" Knopf (Stift-Symbol) in der Modusliste
                    const editBtn = e.target.closest('.edit-mode-btn');
                    if (editBtn) {
                        openModeConfigForm(editBtn.dataset.modeId);
                    }
                    // "Löschen" Knopf (Mülleimer-Symbol) in der Modusliste
                    const deleteBtn = e.target.closest('.delete-mode-btn');
                    if (deleteBtn) {
                        const modeIdToDelete = parseInt(deleteBtn.dataset.modeId);
                        const modeToDelete = notrufSettings.modes.find(m => m.id === modeIdToDelete);
                        if (!modeToDelete) return;
                        const confirmation = prompt(`Um den Modus "${modeToDelete.title}" unwiderruflich zu löschen, geben Sie bitte "MODI LÖSCHEN" ein:`);
                        if (confirmation === 'MODI LÖSCHEN') {
                            notrufSettings.modes = notrufSettings.modes.filter(m => m.id !== modeIdToDelete);

                            if (notrufSettings.flicAssignments) {
                                for (const klick in notrufSettings.flicAssignments) {
                                    if (notrufSettings.flicAssignments[klick] === modeIdToDelete) {
                                        notrufSettings.flicAssignments[klick] = null;
                                    }
                                }
                            }
                            setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                                alertUser('Modus gelöscht!', 'success');
                                renderModeEditorList();
                                populateFlicAssignmentSelectors(); // Editor-Dropdown aktualisieren
                                updateFlicColumnDisplays(); // Spalten-Anzeige aktualisieren
                                // Falls der gelöschte Modus gerade im Editor-Fenster angezeigt wurde:
                                if (activeFlicEditorKlickTyp) {
                                    updateFlicEditorBox(activeFlicEditorKlickTyp);
                                }
                            }).catch(err => alertUser('Fehler beim Löschen.', 'error'));
                        } else if (confirmation !== null) {
                            alertUser('Löschvorgang abgebrochen.', 'info');
                        }
                    }
                    // "Abbrechen" im Konfigurationsformular
                    if (e.target.closest('#notrufCancelEditModeButton')) {
                        document.getElementById('modeConfigFormContainer').classList.add('hidden');
                    }
                } // Ende von if (editorArea && editorArea.contains(e.target))
            }); // Ende des Haupt-Click-Listeners für flicCard
        } // Ende von if (flicCard)
        // === ENDE: Ersetzter flicCard Listener ===

        // === Bis hier ersetzen ===
    }

    // Listener für den Modus-Editor-Bereich (wo Modi gelistet, bearbeitet, gelöscht werden)

    // Listener für das eigentliche Konfigurationsformular (innerhalb des Editors)
    const configArea = document.getElementById('notrufConfigArea');
    if (configArea) {
        configArea.addEventListener('click', (e) => {
            // Standard-Token setzen
            if (e.target.closest('#notrufSetDefaultToken')) {
                document.getElementById('notrufApiToken').value = 'aeqwab5g325hvmk33gtq7s3bz8z7x6';
            }
            // Kontaktbuch öffnen
            if (e.target.closest('#notrufOpenContactBook')) {
                renderContactBook();
                document.getElementById('contactBookModal').style.display = 'flex';
            }
            // Modus speichern (Neuer oder Bearbeiteter)
            // Modus speichern (Neuer oder Bearbeiteter)
            // Modus speichern (Neuer oder Bearbeiteter)
            // Modus speichern (Neuer oder Bearbeiteter)
            if (e.target.closest('#notrufSaveModeButton')) {
                const editingId = document.getElementById('editingModeId').value ? parseInt(document.getElementById('editingModeId').value) : null;
                const title = document.getElementById('notrufModeTitle').value.trim(); // Modus-Titel
                const description = document.getElementById('notrufModeDescInput').value.trim();
                const pushoverTitle = document.getElementById('notrufTitle').value.trim(); // Pushover-Titel

                if (!title || !description) {
                    alertUser('Bitte Titel und Beschreibung für den Modus eingeben.', 'error');
                    return;
                }
                if (!tempSelectedApiTokenId) {
                    alertUser('Bitte einen API-Token auswählen.', 'error');
                    return;
                }

                // Empfänger (User Keys) sammeln
                const selectedUserKeys = [];
                document.querySelectorAll('#notrufUserKeyDisplay .contact-badge').forEach(badge => {
                    const contactId = parseInt(badge.dataset.contactId);
                    const contact = (notrufSettings.contacts || []).find(c => c.id === contactId);
                    if (contact) {
                        selectedUserKeys.push({ id: contact.id, name: contact.name, key: contact.key });
                    }
                });

                // Priorität auslesen
                const selectedPrioButton = document.querySelector('.priority-btn.bg-indigo-600');
                const priority = selectedPrioButton ? parseInt(selectedPrioButton.dataset.priority) : 0;

                // NEU: Retry/Expire auslesen vom Input-Feld
                const retryDeaktiviert = document.getElementById('retryDeaktiviert').checked;
                let retryValue = 0;
                let expireValue = 0; // Standardmäßig 0

                if (!retryDeaktiviert) {
                    const inputRetry = parseInt(document.getElementById('retrySecondsInput').value);
                    if (isNaN(inputRetry) || inputRetry < 30 || inputRetry > 10800) {
                        alertUser('Retry-Intervall muss zwischen 30 und 10800 Sekunden liegen.', 'error');
                        return;
                    }
                    retryValue = inputRetry;
                    // Nur wenn Retry aktiv ist, Expire auf Maximum setzen
                    expireValue = 10800;
                }
                // -- Ende NEU --

                // Validierung für Priority 2
                if (priority === 2 && retryValue === 0) { // Prüft jetzt retryValue
                    alertUser('Notfall-Priorität (2) erfordert ein aktiviertes Retry/Expire-Intervall (mind. 30 Sekunden).', 'error');
                    return;
                }

                // NEU: Sound-Code ermitteln
                let soundCodeToSend = null; // Standard Pushover Sound
                if (tempSelectedSoundId !== null) {
                    const sound = (notrufSettings.sounds || []).find(s => s.id === tempSelectedSoundId);
                    if (sound) {
                        soundCodeToSend = sound.code; // Nimm den Pushover-Code
                    }
                }
                // -- Ende NEU --

                // Config-Objekt zusammenbauen (mit retry, expire, sound)
                const configData = {
                    selectedApiTokenId: tempSelectedApiTokenId,
                    userKeys: selectedUserKeys,
                    title: pushoverTitle,
                    message: document.getElementById('notrufMessage').value.trim(),
                    selectedSoundId: tempSelectedSoundId, // ID speichern für die Anzeige
                    sound: soundCodeToSend, // Den Code für die API speichern
                    priority: priority,
                    retry: retryValue,    // Korrekter API-Parameter 'retry'
                    expire: expireValue   // Korrekter API-Parameter 'expire'
                };

                if (!notrufSettings.modes) notrufSettings.modes = [];

                if (editingId) {
                    // Bearbeiten
                    const modeIndex = notrufSettings.modes.findIndex(m => m.id === editingId);
                    if (modeIndex > -1) {
                        notrufSettings.modes[modeIndex].title = title;
                        notrufSettings.modes[modeIndex].description = description;
                        notrufSettings.modes[modeIndex].config = configData;
                    }
                } else {
                    // Neu anlegen
                    notrufSettings.modes.push({
                        id: Date.now(),
                        title: title,
                        description: description,
                        config: configData
                    });
                }

                setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                    alertUser('Modus gespeichert!', 'success');
                    document.getElementById('modeConfigFormContainer').classList.add('hidden');
                    renderModeEditorList();
                    populateFlicAssignmentSelectors();
                    updateFlicColumnDisplays();
                    // Globale Temp-Variablen zurücksetzen
                    tempSelectedApiTokenId = null;
                    tempSelectedSoundId = null;
                }).catch(err => {
                    console.error("Error saving mode:", err);
                    alertUser('Fehler beim Speichern des Modus.', 'error');
                });
            }
        });
    }

    // Listener für das Kontaktbuch-Modal (Bleibt gleich)
    const contactModal = document.getElementById('contactBookModal');
    if (contactModal && !contactModal.dataset.listenerAttached) {
        contactModal.addEventListener('click', (e) => {
            // Modal schließen
            if (e.target.closest('#contactBookCloseButton')) {
                contactModal.style.display = 'none';
            }
            // Kontakt hinzufügen
            if (e.target.closest('#contactAddButton')) {
                const type = document.getElementById('contactIsGroup').value;
                const name = document.getElementById('contactName').value.trim();
                const key = document.getElementById('contactUserKey').value.trim();
                if (type && name && key) {
                    if (!notrufSettings.contacts) notrufSettings.contacts = [];
                    notrufSettings.contacts.push({ id: Date.now(), type, name, key });
                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        renderContactBook();
                        document.getElementById('contactIsGroup').value = 'User';
                        document.getElementById('contactName').value = '';
                        document.getElementById('contactUserKey').value = '';
                    }).catch(err => alertUser('Fehler beim Speichern des Kontakts.', 'error'));
                } else {
                    alertUser('Bitte alle Felder für den Kontakt ausfüllen.', 'error');
                }
            }
            // Kontakt löschen
            if (e.target.closest('.delete-contact-btn')) {
                const contactId = parseInt(e.target.closest('.delete-contact-btn').dataset.contactId);
                if (confirm('Möchten Sie diesen Kontakt wirklich löschen?')) {
                    notrufSettings.contacts = notrufSettings.contacts.filter(c => c.id !== contactId);
                    if (notrufSettings.modes) {
                        notrufSettings.modes.forEach(mode => {
                            if (mode.config && mode.config.userKeys) {
                                mode.config.userKeys = mode.config.userKeys.filter(uk => uk.id !== contactId);
                            }
                        });
                    }
                    const badgeToRemove = document.querySelector(`#notrufUserKeyDisplay .contact-badge[data-contact-id="${contactId}"]`);
                    if (badgeToRemove) badgeToRemove.remove();
                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        renderContactBook();
                    }).catch(err => alertUser('Fehler beim Löschen des Kontakts.', 'error'));
                }
            }
            // Auswahl übernehmen
            if (e.target.closest('#contactBookApplyButton')) {
                const displayArea = document.getElementById('notrufUserKeyDisplay');
                displayArea.innerHTML = '';
                contactModal.querySelectorAll('.contact-checkbox:checked').forEach(cb => {
                    const contact = (notrufSettings.contacts || []).find(c => c.id == cb.value);
                    if (contact) {
                        displayArea.innerHTML += `<span class="contact-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-contact-id="${contact.id}">${contact.name}</span>`;
                    }
                });
                contactModal.style.display = 'none';
            }
        });
        contactModal.dataset.listenerAttached = 'true';
    }

    notrufView.dataset.listenerAttached = 'true';

    const apiTokenModal = document.getElementById('apiTokenBookModal');
    if (apiTokenModal && !apiTokenModal.dataset.listenerAttached) {
        apiTokenModal.addEventListener('click', (e) => {
            // Modal schließen
            if (e.target.closest('#apiTokenBookCloseButton')) {
                apiTokenModal.style.display = 'none';
            }
            // Token hinzufügen
            if (e.target.closest('#apiTokenAddButton')) {
                const name = document.getElementById('apiTokenName').value.trim();
                const key = document.getElementById('apiTokenKey').value.trim();
                if (name && key) {
                    if (!notrufSettings.apiTokens) notrufSettings.apiTokens = [];
                    notrufSettings.apiTokens.push({ id: Date.now(), name, key });
                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        renderApiTokenBook();
                        document.getElementById('apiTokenName').value = '';
                        document.getElementById('apiTokenKey').value = '';
                    }).catch(err => alertUser('Fehler beim Speichern des Tokens.', 'error'));
                } else {
                    alertUser('Bitte Bezeichnung und Key für den Token ausfüllen.', 'error');
                }
            }
            // Token löschen
            if (e.target.closest('.delete-api-token-btn')) {
                const tokenId = parseInt(e.target.closest('.delete-api-token-btn').dataset.tokenId);
                if (confirm('Möchten Sie diesen API-Token wirklich löschen?')) {
                    notrufSettings.apiTokens = notrufSettings.apiTokens.filter(t => t.id !== tokenId);
                    // Prüfen, ob der gelöschte Token in Modi verwendet wird und ggf. entfernen
                    if (notrufSettings.modes) {
                        notrufSettings.modes.forEach(mode => {
                            if (mode.config && mode.config.selectedApiTokenId === tokenId) {
                                mode.config.selectedApiTokenId = null;
                            }
                        });
                    }
                    // Ggf. im Formular zurücksetzen
                    if (tempSelectedApiTokenId === tokenId) {
                        tempSelectedApiTokenId = null;
                        document.getElementById('notrufApiTokenDisplay').innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
                    }

                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        renderApiTokenBook();
                    }).catch(err => alertUser('Fehler beim Löschen des Tokens.', 'error'));
                }
            }
            // Auswahl übernehmen
            if (e.target.closest('#apiTokenBookApplyButton')) {
                const selectedRadio = apiTokenModal.querySelector('.api-token-radio:checked');
                const displayArea = document.getElementById('notrufApiTokenDisplay');
                if (selectedRadio) {
                    const tokenId = parseInt(selectedRadio.value);
                    const token = (notrufSettings.apiTokens || []).find(t => t.id === tokenId);
                    if (token) {
                        tempSelectedApiTokenId = tokenId; // Temporär speichern für das Formular
                        displayArea.innerHTML = `<span class="api-token-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-token-id="${token.id}">${token.name}</span>`;
                    }
                } else {
                    tempSelectedApiTokenId = null;
                    displayArea.innerHTML = '<span class="text-gray-400 italic">Kein Token ausgewählt</span>';
                }
                apiTokenModal.style.display = 'none';
            }
        });
        apiTokenModal.dataset.listenerAttached = 'true';
    }

    // --- Event Listener für das Sound Buch Modal ---
    const soundModal = document.getElementById('soundBookModal');
    if (soundModal && !soundModal.dataset.listenerAttached) {
        // Checkbox für Custom Name
        const useCustomNameCheckbox = soundModal.querySelector('#soundUseCustomName');
        const customNameInput = soundModal.querySelector('#soundCustomName');
        if (useCustomNameCheckbox && customNameInput) {
            useCustomNameCheckbox.addEventListener('change', (e) => {
                customNameInput.classList.toggle('hidden', !e.target.checked);
                if (!e.target.checked) customNameInput.value = ''; // Leeren, wenn versteckt
            });
        }

        soundModal.addEventListener('click', (e) => {
            // Modal schließen
            if (e.target.closest('#soundBookCloseButton')) {
                soundModal.style.display = 'none';
            }
            // Sound hinzufügen
            if (e.target.closest('#soundAddButton')) {
                const code = document.getElementById('soundCode').value.trim();
                const useCustom = document.getElementById('soundUseCustomName').checked;
                const customName = document.getElementById('soundCustomName').value.trim();
                if (code && (!useCustom || (useCustom && customName))) {
                    if (!notrufSettings.sounds) notrufSettings.sounds = [];
                    notrufSettings.sounds.push({
                        id: Date.now(),
                        code: code,
                        useCustomName: useCustom,
                        customName: useCustom ? customName : null
                    });
                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        renderSoundBook();
                        document.getElementById('soundCode').value = '';
                        document.getElementById('soundUseCustomName').checked = false;
                        document.getElementById('soundCustomName').value = '';
                        document.getElementById('soundCustomName').classList.add('hidden');
                    }).catch(err => alertUser('Fehler beim Speichern des Sounds.', 'error'));
                } else {
                    alertUser('Bitte Soundcode und ggf. eigenen Namen ausfüllen.', 'error');
                }
            }
            // Sound löschen
            if (e.target.closest('.delete-sound-btn')) {
                const soundId = parseInt(e.target.closest('.delete-sound-btn').dataset.soundId);
                if (confirm('Möchten Sie diesen Sound wirklich löschen?')) {
                    notrufSettings.sounds = notrufSettings.sounds.filter(s => s.id !== soundId);
                    // Prüfen, ob der gelöschte Sound in Modi verwendet wird und ggf. entfernen
                    if (notrufSettings.modes) {
                        notrufSettings.modes.forEach(mode => {
                            if (mode.config && mode.config.selectedSoundId === soundId) {
                                mode.config.selectedSoundId = null;
                            }
                        });
                    }
                    // Ggf. im Formular zurücksetzen
                    if (tempSelectedSoundId === soundId) {
                        tempSelectedSoundId = null;
                        document.getElementById('notrufSoundDisplay').innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
                    }

                    setDoc(notrufSettingsDocRef, notrufSettings).then(() => {
                        renderSoundBook();
                    }).catch(err => alertUser('Fehler beim Löschen des Sounds.', 'error'));
                }
            }
            // Auswahl übernehmen
            if (e.target.closest('#soundBookApplyButton')) {
                const selectedRadio = soundModal.querySelector('.sound-radio:checked');
                const displayArea = document.getElementById('notrufSoundDisplay');

                if (selectedRadio && selectedRadio.value !== 'default') { // Prüfe, ob NICHT Standard gewählt wurde
                    const soundId = parseInt(selectedRadio.value);
                    const sound = (notrufSettings.sounds || []).find(s => s.id === soundId);
                    if (sound) {
                        tempSelectedSoundId = soundId; // Temporär speichern
                        const displayName = sound.useCustomName && sound.customName ? sound.customName : sound.code;
                        displayArea.innerHTML = `<span class="sound-badge inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full" data-sound-id="${sound.id}">${displayName}</span>`;
                    }
                } else {
                    // Standard wurde gewählt (oder nichts)
                    tempSelectedSoundId = null; // Setze auf null für Standard
                    displayArea.innerHTML = '<span class="text-gray-400 italic">Standard (pushover)</span>';
                }
                soundModal.style.display = 'none';
            }
        });
        soundModal.dataset.listenerAttached = 'true';
    }

    // --- Listener für die neuen "Buch öffnen"-Buttons im Formular ---
    // --- Listener für die neuen "Buch öffnen"-Buttons im Formular ---
    // const configArea = ... // Diese Zeile sollte schon gelöscht sein!
    if (configArea && !configArea.dataset.extraListenersAttached) { // Verwendet die Variable von weiter oben
        configArea.addEventListener('click', (e) => {
            // API Token Buch öffnen
            if (e.target.closest('#notrufOpenApiTokenBook')) {
                renderApiTokenBook();
                document.getElementById('apiTokenBookModal').style.display = 'flex';
            }
            // Sound Buch öffnen
            if (e.target.closest('#notrufOpenSoundBook')) {
                renderSoundBook();
                document.getElementById('soundBookModal').style.display = 'flex';
            }
            // Priorität Button Klick
            const prioBtn = e.target.closest('.priority-btn');
            if (prioBtn) {
                document.querySelectorAll('.priority-btn').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
                prioBtn.classList.add('bg-indigo-600', 'text-white');
            }
        });

        // --- NEU: Listener für Retry Checkbox ---
        const retryCheckbox = document.getElementById('retryDeaktiviert');
        const retrySecondsInput = document.getElementById('retrySecondsInput');

        if (retryCheckbox && retrySecondsInput) {
            retryCheckbox.addEventListener('change', (e) => {
                const isDisabled = e.target.checked;
                retrySecondsInput.disabled = isDisabled;
                if (isDisabled) {
                    // Optional: Wert zurücksetzen oder auf Minimum setzen
                    // retrySecondsInput.value = 30;
                } else {
                    // Sicherstellen, dass ein gültiger Wert drin steht, wenn aktiviert wird
                    if (parseInt(retrySecondsInput.value) < 30) {
                        retrySecondsInput.value = 30;
                    }
                }
            });
        }
        // --- Ende NEU ---

        configArea.dataset.extraListenersAttached = 'true';
    }
}

