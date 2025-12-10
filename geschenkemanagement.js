// @ts-check
// ========================================
// GESCHENKEMANAGEMENT SYSTEM
// Professionelle Geschenkeverwaltung für alle Anlässe
// Mit Themen-System, Kontaktbuch, Budget- und Erinnerungsverwaltung
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
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================

// ✅ HELPER: Hole aktuelle App User-ID (currentUser.mode)
// WICHTIG: Gibt die App User ID zurück (z.B. "SYSTEMADMIN"), NICHT Firebase Auth UID!
function getCurrentUserId() {
    return currentUser?.mode || currentUser?.uid;
}

let geschenkeCollection = null;
let geschenkeSettingsRef = null;
let geschenkeThemenRef = null;
let geschenkeKontakteRef = null;
let geschenkeVorlagenRef = null;
let geschenkeBudgetsRef = null;
let geschenkeErinnerungenRef = null;

let GESCHENKE = {};
let THEMEN = {};
let KONTAKTE = {};
let VORLAGEN = {};
let BUDGETS = {};
let ERINNERUNGEN = {};
let currentThemaId = null;
let searchTerm = '';
let currentFilter = {};
let personenDetailsAusgeklappt = false; // ✅ State für Personen-Übersicht

// Eigene Person (unlöschbar)
let eigenePerson = null;

// ========================================
// KONFIGURATIONEN
// ========================================
export const STATUS_CONFIG = {
    offen: { label: 'Offen', color: 'bg-gray-100 text-gray-800', icon: '⭕' },
    idee: { label: 'Idee', color: 'bg-yellow-100 text-yellow-800', icon: '💡' },
    zu_bestellen: { label: 'zu Bestellen', color: 'bg-orange-100 text-orange-800', icon: '🛒' },
    bestellt: { label: 'Bestellt', color: 'bg-blue-100 text-blue-800', icon: '📦' },
    teillieferung: { label: 'Teillieferung', color: 'bg-cyan-100 text-cyan-800', icon: '📬' },
    teillieferung_temp: { label: 'Teillieferung - temp. Platz', color: 'bg-cyan-50 text-cyan-700', icon: '📍' },
    geliefert_temp: { label: 'Geliefert - temp. Platz', color: 'bg-teal-100 text-teal-800', icon: '🏠' },
    beschaedigt: { label: 'Beschädigt', color: 'bg-red-100 text-red-800', icon: '💔' },
    problem: { label: 'Problem', color: 'bg-red-200 text-red-900', icon: '⚠️' },
    abgeschlossen: { label: 'Abgeschlossen', color: 'bg-green-100 text-green-800', icon: '✅' },
    storniert: { label: 'Storniert', color: 'bg-gray-200 text-gray-600', icon: '❌' }
};

// Vereinheitlichte Zahlungsarten (für SOLL und IST)
export const ZAHLUNGSARTEN = {
    konto_weihnachten: { label: 'Konto-Weihnachten' },
    hauptkonto: { label: 'Hauptkonto' },
    lastschrift_hauptkonto: { label: 'Lastschrift-Hauptkonto' },
    kreditkarte: { label: 'Kreditkarte' },
    bar: { label: 'Bar' },
    rechnung: { label: 'Rechnung' },
    nicht_bezahlt: { label: 'Nicht bezahlt' },
    div_bezahlung: { label: 'div. Bezahlung' },
    haushaltskonto_giro: { label: 'Haushaltskonto - Giro' },
    haushaltskonto_geschenk: { label: 'Haush.k. (2) - Geschenk' }
};

// Standard-Einstellungen
let geschenkeSettings = {
    statusOptionen: Object.keys(STATUS_CONFIG),
    zahlungsarten: Object.keys(ZAHLUNGSARTEN),
    geschenkeStandorte: ['zu Hause', 'Anderer Standort'],
    customStatusOptionen: [],
    customZahlungsarten: [],
    customGeschenkeStandorte: []
};

// ========================================
// INITIALISIERUNG
// ========================================
export async function initializeGeschenkemanagement() {
    console.log("🎁 Geschenkemanagement-System wird initialisiert...");

    // ✅ Warte auf currentUser, falls noch nicht geladen
    let retries = 0;
    let user = currentUser;
    
    // ✅ Helper: Hole User-ID aus verschiedenen möglichen Feldern
    const getUserId = (u) => u?.uid || u?.mode || u?.id || u?.odooUserId;
    
    while ((!user || !getUserId(user)) && retries < 50) {
        console.log("⏳ Warte auf currentUser... (Versuch", retries + 1, ")");
        
        // Versuche verschiedene Quellen
        user = currentUser || window.currentUser;
        
        if (!user || !getUserId(user)) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
        }
    }
    
    // Aktualisiere currentUser mit der gefundenen Quelle
    if (user && getUserId(user)) {
        window.currentUser = user;  // Setze global für Fallback
        console.log("✅ User-ID gefunden:", getUserId(user), "aus Feld:", user.uid ? 'uid' : user.mode ? 'mode' : user.id ? 'id' : 'odooUserId');
    }

    if (!db) {
        console.error("❌ Firestore (db) ist nicht verfügbar!");
        alertUser("Fehler: Firestore nicht verfügbar!", "error");
        // Trotzdem UI initialisieren
        setupEventListeners();
        return;
    }

    if (!user || !getUserId(user)) {
        console.error("❌ currentUser ist nicht verfügbar nach 5 Sekunden!");
        console.error("❌ currentUser:", currentUser);
        console.error("❌ window.currentUser:", window.currentUser);
        console.error("❌ Bitte Seite neu laden oder erneut einloggen!");
        alertUser("Fehler: Benutzer nicht geladen. Bitte Seite neu laden!", "error");
        // Trotzdem UI initialisieren
        setupEventListeners();
        return;
    }

    const userId = getUserId(user);
    console.log("✅ User erkannt:", userId, user);
    
    // ✅ NEU: Warte bis Firebase Custom Claim (appRole) gesetzt ist
    console.log("⏳ Warte auf Firebase Custom Claim (appRole)...");
    let claimRetries = 0;
    let hasAppRole = false;
    
    while (!hasAppRole && claimRetries < 30) {
        try {
            if (auth?.currentUser) {
                const idTokenResult = await auth.currentUser.getIdTokenResult(true);
                if (idTokenResult.claims.appRole) {
                    hasAppRole = true;
                    console.log("✅ Custom Claim gefunden:", idTokenResult.claims.appRole);
                    break;
                }
            }
        } catch (e) {
            console.warn("⚠️ Fehler beim Abrufen des Tokens:", e);
        }
        
        console.log("⏳ Warte auf Custom Claim... (Versuch", claimRetries + 1, ")");
        await new Promise(resolve => setTimeout(resolve, 200));
        claimRetries++;
    }
    
    if (!hasAppRole) {
        console.warn("⚠️ Custom Claim nicht gefunden nach 6 Sekunden.");
        
        // ✅ Wenn kein Claim: Prüfe ob Gast-Modus
        if (currentUser?.mode === 'Gast' || userId === 'Gast') {
            console.log("👤 Gast-Modus erkannt - Geschenkemanagement nicht verfügbar");
            alertUser("Geschenkemanagement ist nur für registrierte Benutzer verfügbar.", "info");
            setupEventListeners(); // UI trotzdem initialisieren
            return;
        }
    }
    
    // ✅ WICHTIG: Verwende Firebase Auth UID für Firestore-Pfade!
    const firebaseAuthUid = auth?.currentUser?.uid;
    console.log("🔑 Firebase Auth UID:", firebaseAuthUid);
    console.log("📋 App User ID:", userId);
    
    if (!firebaseAuthUid) {
        console.error("❌ Firebase Auth UID nicht verfügbar!");
        alertUser("Fehler: Firebase Auth nicht verfügbar!", "error");
        setupEventListeners();
        return;
    }
    
    // ✅ Setze currentUser global, damit der Rest des Codes funktioniert
    if (!currentUser || !getUserId(currentUser)) {
        window.currentUser = user;
        console.log("✅ currentUser wurde von user gesetzt");
    }
    
    // ✅ Ergänze user.uid falls nicht vorhanden (für Kompatibilität)
    if (!user.uid && userId) {
        user.uid = userId;
        if (currentUser) currentUser.uid = userId;
        if (window.currentUser) window.currentUser.uid = userId;
        console.log("✅ currentUser.uid wurde auf", userId, "gesetzt");
    }
    
    // ✅ KORRIGIERT: User-spezifische Collections mit APP USER ID (currentUser.mode)!
    // WICHTIG: Verwende currentUser.mode (z.B. "SYSTEMADMIN"), NICHT Firebase Auth UID!
    // currentUser.mode bleibt gleich über alle Geräte → geräteübergreifend + privat!
    const appUserId = currentUser?.mode || user?.mode;
    
    if (!appUserId) {
        console.error("❌ FEHLER: App User ID (currentUser.mode) nicht gefunden!");
        alertUser("❌ Fehler: Benutzer-ID nicht gefunden!", "error");
        setupEventListeners();
        return;
    }
    
    console.log("🔑 App User ID:", appUserId);
    
    const userDataPath = ['artifacts', appId, 'public', 'data', 'users', appUserId];
    
    geschenkeSettingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'geschenkemanagement');
    geschenkeThemenRef = collection(db, ...userDataPath, 'geschenke_themen');
    geschenkeKontakteRef = collection(db, ...userDataPath, 'geschenke_kontakte');
    geschenkeVorlagenRef = collection(db, ...userDataPath, 'geschenke_vorlagen');
    geschenkeBudgetsRef = collection(db, ...userDataPath, 'geschenke_budgets');
    geschenkeErinnerungenRef = collection(db, ...userDataPath, 'geschenke_erinnerungen');
    
    console.log("✅ Collection-Referenzen erstellt (USER-SPEZIFISCH)");
    console.log("✅ Pfad: users/", appUserId, "/geschenke_*");
    
    try {
        await loadSettings();
        
        // ✅ Starte ALLE Echtzeit-Listener (laden automatisch die Daten + Live-Updates!)
        listenForKontakte();      // 👥 Kontakte
        listenForThemen();        // 📂 Themen
        listenForVorlagen();      // 📑 Vorlagen
        listenForBudgets();       // 💰 Budgets
        listenForErinnerungen();  // 🔔 Erinnerungen
        
        // Warte kurz, damit Listener initial Daten laden können
        await new Promise(resolve => setTimeout(resolve, 800));
        
        console.log("✅ Alle Echtzeit-Listener aktiv! Daten werden automatisch synchronisiert.");
    } catch (e) {
        console.error("❌ Fehler beim Starten der Listener:", e);
        // Fortfahren trotz Fehler
    }
    
    // Event-Listener und Dashboard IMMER initialisieren
    try {
        setupEventListeners();
        renderDashboard();
        console.log("✅ Geschenkemanagement erfolgreich initialisiert!");
    } catch (e) {
        console.error("❌ Fehler bei UI-Initialisierung:", e);
    }
}

// ========================================
// DATEN LADEN
// ========================================
async function loadSettings() {
    try {
        const settingsDoc = await getDoc(geschenkeSettingsRef);
        if (settingsDoc.exists()) {
            geschenkeSettings = { ...geschenkeSettings, ...settingsDoc.data() };
        } else {
            await setDoc(geschenkeSettingsRef, geschenkeSettings);
        }
    } catch (e) {
        console.error("Fehler beim Laden der Einstellungen:", e);
    }
}

// ✅ LIVE-LISTENER für Kontakte
function listenForKontakte() {
    if (!geschenkeKontakteRef) {
        console.error("❌ Kontakte-Ref fehlt");
        return;
    }
    
    console.log("🎧 Kontakte-Listener gestartet");
    
    onSnapshot(geschenkeKontakteRef, async (snapshot) => {
        console.log(`👥 Kontakte: ${snapshot.size} Dokumente`);
        
        KONTAKTE = {};
        eigenePerson = null;
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            KONTAKTE[docSnap.id] = { id: docSnap.id, ...data };
            
            if (data.istEigenePerson) {
                eigenePerson = { id: docSnap.id, ...data };
            }
        });
        
        // Eigene Person erstellen falls nicht vorhanden
        if (!eigenePerson && currentUser?.displayName) {
            await createEigenePerson();
        }
        
        console.log("✅ Kontakte geladen:", Object.keys(KONTAKTE).length);
        
        // UI aktualisieren wenn Kontaktbuch offen ist
        if (document.getElementById('gm-kontaktbuch-list')) {
            renderKontaktbuch();
        }
        
        // Dashboard aktualisieren (Personen-Übersicht)
        if (currentThemaId) {
            renderPersonenUebersicht();
        }
    }, (error) => {
        console.error("Fehler beim Laden der Kontakte:", error);
        if (error.code === 'permission-denied') {
            console.warn("⚠️ Keine Berechtigung für Kontakte. Bitte einloggen!");
            alertUser("Bitte melde dich an, um das Geschenkemanagement zu nutzen.", "info");
        }
    });
}

// ❌ VERALTET: Wird durch listenForKontakte() ersetzt
async function loadKontakte() {
    console.warn("⚠️ loadKontakte() ist veraltet, verwende listenForKontakte()");
    // Funktion bleibt leer, da Listener aktiv ist
}

async function createEigenePerson() {
    try {
        const eigenPersonData = {
            name: currentUser.displayName,
            istEigenePerson: true,
            erstelltAm: serverTimestamp(),
            erstelltVon: currentUser.displayName
        };
        const docRef = await addDoc(geschenkeKontakteRef, eigenPersonData);
        eigenePerson = { id: docRef.id, ...eigenPersonData };
        KONTAKTE[docRef.id] = eigenePerson;
    } catch (e) {
        console.error("Fehler beim Erstellen der eigenen Person:", e);
    }
}

// ✅ LIVE-LISTENER für Themen (eigene + geteilte)
function listenForThemen() {
    if (!geschenkeThemenRef) {
        console.error("❌ Themen-Ref fehlt");
        return;
    }
    
    console.log("🎧 Themen-Listener gestartet");
    
    onSnapshot(geschenkeThemenRef, (snapshot) => {
        console.log(`📂 Themen: ${snapshot.size} Dokumente`);
        
        const oldThemaId = currentThemaId;
        const oldThemenCount = Object.keys(THEMEN).length;
        THEMEN = {};
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            THEMEN[docSnap.id] = { 
                id: docSnap.id, 
                ...data
            };
        });
        
        const newThemenCount = Object.keys(THEMEN).length;
        console.log("✅ Themen geladen:", newThemenCount);
        
        // Gespeichertes Thema wiederherstellen oder erstes Thema wählen
        const savedThemaId = localStorage.getItem('gm_current_thema');
        if (savedThemaId && THEMEN[savedThemaId]) {
            currentThemaId = savedThemaId;
        } else if (Object.keys(THEMEN).length > 0) {
            currentThemaId = Object.keys(THEMEN)[0];
        } else {
            currentThemaId = null;
        }
        
        // ✅ WICHTIG: Prüfe ob sich die Anzahl der Themen geändert hat
        const themenCountChanged = oldThemenCount !== newThemenCount;
        
        // ✅ UI IMMER aktualisieren (Dropdown + Dashboard)
        renderThemenDropdown();
        
        // Wenn Thema gewechselt wurde ODER Themen-Anzahl sich geändert hat
        if (currentThemaId && (currentThemaId !== oldThemaId || themenCountChanged)) {
            console.log(`🔄 Thema-Wechsel oder Anzahl geändert → Collection & Dashboard aktualisieren`);
            updateCollectionForThema();
            renderDashboard();  // ✅ Komplettes Dashboard neu rendern
        } else if (!currentThemaId && oldThemaId) {
            // Letztes Thema wurde gelöscht
            console.log(`🗑️ Letztes Thema gelöscht → Dashboard zurücksetzen`);
            renderDashboard();
        }
        
        // Themen-Verwaltung aktualisieren falls offen
        if (document.getElementById('gm-themen-list')) {
            renderThemenVerwaltung();
        }
    }, (error) => {
        console.error("Fehler beim Laden der Themen:", error);
        if (error.code === 'permission-denied') {
            console.warn("⚠️ Keine Berechtigung für Themen. Bitte einloggen!");
        }
    });
}

// ❌ VERALTET: Wird durch listenForThemen() ersetzt
async function loadThemen() {
    console.warn("⚠️ loadThemen() ist veraltet, verwende listenForThemen()");
    // Funktion bleibt leer, da Listener aktiv ist
}

// ✅ LIVE-LISTENER für Vorlagen
function listenForVorlagen() {
    if (!geschenkeVorlagenRef) {
        console.error("❌ Vorlagen-Ref fehlt");
        return;
    }
    
    console.log("🎧 Vorlagen-Listener gestartet");
    
    onSnapshot(geschenkeVorlagenRef, (snapshot) => {
        console.log(`📑 Vorlagen: ${snapshot.size} Dokumente`);
        
        VORLAGEN = {};
        snapshot.forEach((docSnap) => {
            VORLAGEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        
        console.log("✅ Vorlagen geladen:", Object.keys(VORLAGEN).length);
    }, (error) => {
        console.error("Fehler beim Laden der Vorlagen:", error);
        if (error.code === 'permission-denied') {
            console.warn("⚠️ Keine Berechtigung für Vorlagen. Bitte einloggen!");
        }
    });
}

// ❌ VERALTET: Wird durch listenForVorlagen() ersetzt
async function loadVorlagen() {
    console.warn("⚠️ loadVorlagen() ist veraltet, verwende listenForVorlagen()");
    // Funktion bleibt leer, da Listener aktiv ist
}

// ✅ LIVE-LISTENER für Budgets
function listenForBudgets() {
    if (!geschenkeBudgetsRef) {
        console.error("❌ Budgets-Ref fehlt");
        return;
    }
    
    console.log("🎧 Budgets-Listener gestartet");
    
    onSnapshot(geschenkeBudgetsRef, (snapshot) => {
        console.log(`💰 Budgets: ${snapshot.size} Dokumente`);
        
        BUDGETS = {};
        snapshot.forEach((docSnap) => {
            BUDGETS[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        
        console.log("✅ Budgets geladen:", Object.keys(BUDGETS).length);
    }, (error) => {
        console.error("Fehler beim Laden der Budgets:", error);
        if (error.code === 'permission-denied') {
            console.warn("⚠️ Keine Berechtigung für Budgets. Bitte einloggen!");
        }
    });
}

// ❌ VERALTET: Wird durch listenForBudgets() ersetzt
async function loadBudgets() {
    console.warn("⚠️ loadBudgets() ist veraltet, verwende listenForBudgets()");
    // Funktion bleibt leer, da Listener aktiv ist
}

// ✅ LIVE-LISTENER für Erinnerungen
function listenForErinnerungen() {
    if (!geschenkeErinnerungenRef) {
        console.error("❌ Erinnerungen-Ref fehlt");
        return;
    }
    
    console.log("🎧 Erinnerungen-Listener gestartet");
    
    onSnapshot(geschenkeErinnerungenRef, (snapshot) => {
        console.log(`🔔 Erinnerungen: ${snapshot.size} Dokumente`);
        
        ERINNERUNGEN = {};
        snapshot.forEach((docSnap) => {
            ERINNERUNGEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        
        console.log("✅ Erinnerungen geladen:", Object.keys(ERINNERUNGEN).length);
        
        // ✅ Startseiten-Benachrichtigung aktualisieren
        if (typeof window.updateHomeAlerts === 'function') {
            window.updateHomeAlerts();
        }
    }, (error) => {
        console.error("Fehler beim Laden der Erinnerungen:", error);
        if (error.code === 'permission-denied') {
            console.warn("⚠️ Keine Berechtigung für Erinnerungen. Bitte einloggen!");
        }
    });
}

// ❌ VERALTET: Wird durch listenForErinnerungen() ersetzt
async function loadErinnerungen() {
    console.warn("⚠️ loadErinnerungen() ist veraltet, verwende listenForErinnerungen()");
    // Funktion bleibt leer, da Listener aktiv ist
}

function updateCollectionForThema() {
    if (currentThemaId && db && currentUser?.mode) {
        const ownerUserId = currentUser.mode;
        
        // Geschenke werden als Subcollection unter dem User-Thema gespeichert
        geschenkeCollection = collection(db, 'artifacts', appId, 'public', 'data', 'users', ownerUserId, 'geschenke_themen', currentThemaId, 'geschenke');
        
        console.log("📦 updateCollectionForThema - User:", ownerUserId, "Thema:", currentThemaId);
        console.log("📦 Collection-Pfad:", geschenkeCollection.path);
        
        listenForGeschenke();
    }
}

// ========================================
// ECHTZEIT-LISTENER
// ========================================
export function listenForGeschenke() {
    if (!geschenkeCollection) return;
    
    onSnapshot(query(geschenkeCollection, orderBy('erstelltAm', 'desc')), (snapshot) => {
        console.log("📦 listenForGeschenke - Geladen:", snapshot.size, "Geschenke");
        
        GESCHENKE = {};
        snapshot.forEach((docSnap) => {
            GESCHENKE[docSnap.id] = { 
                id: docSnap.id, 
                themaId: currentThemaId,
                ...docSnap.data() 
            };
        });
        
        console.log("✅ Geschenke geladen:", Object.keys(GESCHENKE).length);
        
        renderGeschenkeTabelle();
        updateDashboardStats();
    }, (error) => {
        console.error("Fehler beim Laden der Geschenke:", error);
    });
}

// ========================================
// EVENT LISTENERS
// ========================================
function setupEventListeners() {
    // Thema-Dropdown
    const themaDropdown = document.getElementById('gm-thema-dropdown');
    if (themaDropdown && !themaDropdown.dataset.listenerAttached) {
        themaDropdown.addEventListener('change', (e) => {
            currentThemaId = e.target.value;
            localStorage.setItem('gm_current_thema', currentThemaId);
            updateCollectionForThema();
            updateCreateButtonVisibility(); // ✅ PUNKT 6: Button Sichtbarkeit prüfen
            renderDashboard();
        });
        themaDropdown.dataset.listenerAttached = 'true';
    }

    // Neuer Eintrag Button - ✅ PUNKT 6: Nur bei eigenen Themen!
    const createBtn = document.getElementById('btn-create-geschenk');
    if (createBtn && !createBtn.dataset.listenerAttached) {
        createBtn.addEventListener('click', openCreateModal);
        createBtn.dataset.listenerAttached = 'true';
    }
    
    // ✅ PUNKT 5 & 6: Button Sichtbarkeit basierend auf Thema-Typ
    updateCreateButtonVisibility();

    // Einstellungen Button
    const settingsBtn = document.getElementById('btn-geschenke-settings');
    if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
        settingsBtn.addEventListener('click', openSettingsModal);
        settingsBtn.dataset.listenerAttached = 'true';
    }

    // Suche
    const searchInput = document.getElementById('search-geschenke');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderGeschenkeTabelle();
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    // Filter Reset
    const resetBtn = document.getElementById('reset-filters-geschenke');
    if (resetBtn && !resetBtn.dataset.listenerAttached) {
        resetBtn.addEventListener('click', resetFilters);
        resetBtn.dataset.listenerAttached = 'true';
    }

    // Modal schließen
    setupModalListeners();
}

function setupModalListeners() {
    const closeModal = document.getElementById('closeGeschenkModal');
    if (closeModal && !closeModal.dataset.listenerAttached) {
        closeModal.addEventListener('click', closeGeschenkModal);
        closeModal.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelGeschenkBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeGeschenkModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveGeschenkBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveGeschenk);
        saveBtn.dataset.listenerAttached = 'true';
    }

    // Settings Modal
    const closeSettingsModal = document.getElementById('closeGeschenkeSettingsModal');
    if (closeSettingsModal && !closeSettingsModal.dataset.listenerAttached) {
        closeSettingsModal.addEventListener('click', closeSettingsModalFn);
        closeSettingsModal.dataset.listenerAttached = 'true';
    }
}

// ========================================
// RENDER FUNKTIONEN
// ========================================
function renderThemenDropdown() {
    const dropdown = document.getElementById('gm-thema-dropdown');
    if (!dropdown) return;
    
    const activeThemen = Object.values(THEMEN).filter(t => !t.archiviert);
    
    console.log("🎨 renderThemenDropdown - Aktive Themen:", activeThemen.length);
    activeThemen.forEach(t => {
        console.log(`  - ${t.name} (istGeteilt: ${t.istGeteilt}, besitzerName: ${t.besitzerName})`);
    });
    
    if (activeThemen.length === 0) {
        dropdown.innerHTML = '<option value="">Kein Thema vorhanden</option>';
        
        // Zeige Info-Box
        const container = document.getElementById('gm-personen-uebersicht');
        if (container) {
            container.innerHTML = `
                <div class="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                    <div class="text-6xl mb-4">🎁</div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">Willkommen beim Geschenkemanagement!</h3>
                    <p class="text-gray-600 mb-4">Erstelle dein erstes Thema, um loszulegen.</p>
                    <button onclick="window.createNewThema()" 
                        class="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold rounded-lg hover:shadow-lg transition">
                        ➕ Erstes Thema erstellen
                    </button>
                </div>
            `;
        }
    } else {
        // ✅ Themen anzeigen (eigene + geteilte)
        dropdown.innerHTML = activeThemen.map(thema => {
            let displayName = thema.name;
            
            // ✅ Markiere geteilte Themen
            if (thema.istGeteilt && thema.besitzerName) {
                displayName = `${thema.name} 📘 [von ${thema.besitzerName}]`;
            } else if (thema.istGeteilt) {
                displayName = `${thema.name} 📘 [geteilt]`;
            }
            
            return `<option value="${thema.id}" ${thema.id === currentThemaId ? 'selected' : ''}>${displayName}</option>`;
        }).join('');
        
        // ✅ Setze Dropdown-Style für bessere Sichtbarkeit
        dropdown.className = 'p-3 border-2 border-gray-300 rounded-lg font-semibold text-lg bg-white';
    }
}

function renderDashboard() {
    renderThemenDropdown();
    renderErinnerungenUebersicht();
    renderPersonenUebersicht();
    renderGeschenkeTabelle();
    updateDashboardStats();
}

// ========================================
// ERINNERUNGEN-ÜBERSICHT IM DASHBOARD
// ========================================
function renderErinnerungenUebersicht() {
    const container = document.getElementById('gm-erinnerungen-uebersicht');
    if (!container || !currentThemaId) return;
    
    // Filtere Erinnerungen für aktuelles Thema
    const themaErinnerungen = Object.values(ERINNERUNGEN).filter(e => e.themaId === currentThemaId && !e.erledigt);
    
    if (themaErinnerungen.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    // Sortiere nach Datum (älteste zuerst)
    themaErinnerungen.sort((a, b) => {
        const dateA = a.datum?.toDate ? a.datum.toDate() : new Date(a.datum);
        const dateB = b.datum?.toDate ? b.datum.toDate() : new Date(b.datum);
        return dateA - dateB;
    });
    
    const now = new Date();
    
    container.innerHTML = `
        <div class="bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl shadow-md p-4 mb-4">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                        <path d="M5.85 3.5a.75.75 0 0 0-1.117-1 9.719 9.719 0 0 0-2.348 4.876.75.75 0 0 0 1.479.248A8.219 8.219 0 0 1 5.85 3.5ZM19.267 2.5a.75.75 0 1 0-1.118 1 8.22 8.22 0 0 1 1.987 4.124.75.75 0 0 0 1.48-.248A9.72 9.72 0 0 0 19.266 2.5Z" />
                        <path fill-rule="evenodd" d="M12 2.25A6.75 6.75 0 0 0 5.25 9v.75a8.217 8.217 0 0 1-2.119 5.52.75.75 0 0 0 .298 1.206c1.544.57 3.16.99 4.831 1.243a3.75 3.75 0 1 0 7.48 0 24.583 24.583 0 0 0 4.83-1.244.75.75 0 0 0 .298-1.205 8.217 8.217 0 0 1-2.118-5.52V9A6.75 6.75 0 0 0 12 2.25ZM9.75 18c0-.034 0-.067.002-.1a25.05 25.05 0 0 0 4.496 0l.002.1a2.25 2.25 0 1 1-4.5 0Z" clip-rule="evenodd" />
                    </svg>
                    <div>
                        <h3 class="text-lg font-bold">🔔 Erinnerungen</h3>
                        <p class="text-sm opacity-90">${themaErinnerungen.length} aktive Erinnerung${themaErinnerungen.length > 1 ? 'en' : ''}</p>
                    </div>
                </div>
                <button onclick="window.openErinnerungModal()" class="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold transition">
                    + Neu
                </button>
            </div>
            
            <div class="space-y-2 max-h-40 overflow-y-auto">
                ${themaErinnerungen.map(e => {
                    const datum = e.datum?.toDate ? e.datum.toDate() : new Date(e.datum);
                    const isFaellig = datum <= now;
                    const geschenk = e.geschenkId ? GESCHENKE[e.geschenkId] : null;
                    
                    return `
                        <div class="bg-white/10 backdrop-blur rounded-lg p-3 ${isFaellig ? 'ring-2 ring-yellow-300 animate-pulse' : ''}">
                            <div class="flex items-start justify-between gap-3">
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center gap-2 mb-1">
                                        ${isFaellig ? '<span class="text-yellow-300 font-bold text-xs">⚠️ FÄLLIG</span>' : ''}
                                        <span class="text-xs opacity-75">${datum.toLocaleDateString('de-DE')} ${datum.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'})}</span>
                                    </div>
                                    <p class="font-semibold text-sm">${e.nachricht || 'Keine Nachricht'}</p>
                                    ${geschenk ? `<p class="text-xs opacity-75 mt-1">📦 ${geschenk.geschenk}</p>` : ''}
                                    <span class="text-xs bg-white/20 px-2 py-0.5 rounded-full mt-1 inline-block">${e.typ || 'Allgemein'}</span>
                                </div>
                                <button onclick="window.markErinnerungDone('${e.id}')" 
                                        class="flex-shrink-0 px-2 py-1 bg-green-500 hover:bg-green-600 rounded text-xs font-bold transition"
                                        title="Als erledigt markieren">
                                    ✓
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}


// ✅ PUNKT 5 & 6: Button-Sichtbarkeit basierend auf Rechten
function updateCreateButtonVisibility() {
    const createBtn = document.getElementById('btn-create-geschenk');
    if (!createBtn || !currentThemaId) return;
    
    // ✅ VEREINFACHT: Alle Themen sind zentral → Button immer sichtbar
    createBtn.style.display = 'inline-flex';
    createBtn.disabled = false;
    createBtn.title = '';
}

// ✅ VEREINFACHT: Alle User haben Schreibrechte (zentrale Themen)
function hasWriteRightsForCurrentThema() {
    return currentThemaId ? true : false;
}

// ✅ VEREINFACHT: Alle Felder sind editierbar (zentrale Themen)
function isFieldEditable() {
    return currentThemaId ? true : false;
}

// ✅ VEREINFACHT: Da alle Themen zentral sind, sind Felder immer editierbar
function setModalFieldsReadOnly(readonly) {
    // Diese Funktion ist nicht mehr nötig, aber wir behalten sie für Kompatibilität
    // Bei zentralen Themen sind alle Felder immer editierbar (readonly = false)
    if (readonly) {
        console.log("⚠️ Warnung: setModalFieldsReadOnly(true) aufgerufen, aber bei zentralen Themen ignoriert");
    }
}


// ✅ DIAGNOSE-TOOL: Zeige kompletten Status
window.diagnoseGeschenkeSystem = function() {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 GESCHENKEMANAGEMENT DIAGNOSE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    
    console.log("👤 AKTUELLER USER:");
    console.log("  Name:", currentUser?.displayName);
    console.log("  App User ID (mode):", currentUser?.mode);
    console.log("  Firebase Auth UID:", auth?.currentUser?.uid);
    console.log("  getCurrentUserId():", getCurrentUserId());
    console.log("");
    
    console.log("📂 THEMEN:", Object.keys(THEMEN).length);
    Object.values(THEMEN).forEach(t => {
        console.log(`  📁 ${t.name}:`, {
            id: t.id,
            archiviert: t.archiviert
        });
    });
    console.log("");
    
    console.log("👥 KONTAKTE:", Object.keys(KONTAKTE).length);
    console.log("🎁 GESCHENKE:", Object.keys(GESCHENKE).length);
    console.log("📑 VORLAGEN:", Object.keys(VORLAGEN).length);
    console.log("💰 BUDGETS:", Object.keys(BUDGETS).length);
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    return {
        currentUser: {
            name: currentUser?.displayName,
            mode: currentUser?.mode,
            appUserId: getCurrentUserId()
        },
        themen: THEMEN,
        kontakte: KONTAKTE,
        geschenke: GESCHENKE,
        vorlagen: VORLAGEN,
        budgets: BUDGETS
    };
};

function renderPersonenUebersicht() {
    const container = document.getElementById('gm-personen-uebersicht');
    if (!container || !currentThemaId) return;
    
    const thema = THEMEN[currentThemaId];
    
    if (!thema?.personen || thema.personen.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <p class="text-lg font-semibold">Keine Personen hinzugefügt</p>
                <p class="text-sm">Füge Personen aus deinem Kontaktbuch hinzu, um Geschenke zu planen.</p>
                <button onclick="window.openAddPersonToThemaModal()" class="mt-3 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition">
                    + Person hinzufügen
                </button>
            </div>
        `;
        return;
    }
    
    // Gesamtstatistik berechnen
    const alleGeschenke = Object.values(GESCHENKE);
    const gesamtStats = {
        total: alleGeschenke.length,
        fertig: alleGeschenke.filter(g => g.status === 'abgeschlossen').length
    };
    
    // Personen-Daten sammeln
    const personenDaten = thema.personen.map(personId => {
        const person = KONTAKTE[personId];
        if (!person) return null;
        
        const geschenkeFuerPerson = alleGeschenke.filter(g => g.fuer && g.fuer.includes(personId));
        return {
            id: personId,
            name: person.name,
            total: geschenkeFuerPerson.length,
            offen: geschenkeFuerPerson.filter(g => ['offen', 'idee', 'zu_bestellen'].includes(g.status)).length,
            bestellt: geschenkeFuerPerson.filter(g => ['bestellt', 'teillieferung'].includes(g.status)).length,
            fertig: geschenkeFuerPerson.filter(g => g.status === 'abgeschlossen').length
        };
    }).filter(p => p !== null);
    
    // HTML mit ausklappbarer Übersicht
    let html = `
        <div class="bg-white rounded-xl shadow-md p-4 mb-4">
            <div class="flex items-center justify-between cursor-pointer" onclick="window.togglePersonenDetails()">
                <div class="flex items-center gap-4">
                    <div class="text-2xl">👥</div>
                    <div>
                        <p class="font-bold text-gray-800 text-lg">Personen-Übersicht</p>
                        <p class="text-sm text-gray-600">
                            <span class="font-bold text-green-600">${gesamtStats.fertig}</span> von 
                            <span class="font-bold">${gesamtStats.total}</span> Geschenken fertig
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-32 bg-gray-200 rounded-full h-3">
                        <div class="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all" 
                             style="width: ${gesamtStats.total > 0 ? Math.round((gesamtStats.fertig / gesamtStats.total) * 100) : 0}%"></div>
                    </div>
                    <span id="gm-personen-toggle-icon" class="text-gray-500 transition-transform" style="transform: rotate(${personenDetailsAusgeklappt ? '0' : '180'}deg)">▼</span>
                </div>
            </div>
        </div>
        
        <div id="gm-personen-details" class="${personenDetailsAusgeklappt ? '' : 'hidden'} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    `;
    
    personenDaten.forEach(p => {
        const progressPercent = p.total > 0 ? Math.round((p.fertig / p.total) * 100) : 0;
        
        // ✅ Personen-Status aus Thema holen (Default: 'offen')
        const personenStatus = thema.personenStatus || {};
        const pStatus = personenStatus[p.id] || 'offen';
        
        // ✅ Farben basierend auf Status (mit deutlicher Schattierung)
        const statusConfig = {
            offen: { 
                color: 'border-red-500', 
                bg: 'bg-red-100', 
                shadow: 'shadow-red-200/50',
                label: 'Offen', 
                icon: '🔴' 
            },
            teilweise: { 
                color: 'border-yellow-500', 
                bg: 'bg-yellow-100', 
                shadow: 'shadow-yellow-200/50',
                label: 'Teilweise', 
                icon: '🟡' 
            },
            abgeschlossen: { 
                color: 'border-green-500', 
                bg: 'bg-green-100', 
                shadow: 'shadow-green-200/50',
                label: 'Abgeschlossen', 
                icon: '🟢' 
            }
        };
        const cfg = statusConfig[pStatus] || statusConfig.offen;
        
        html += `
            <div class="rounded-xl shadow-md p-4 border-l-4 ${cfg.color} ${cfg.bg} hover:shadow-lg transition cursor-pointer" 
                 onclick="window.openPersonModal('${p.id}')">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                        ${p.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="font-bold text-gray-800 text-base leading-tight" style="word-wrap: break-word; overflow-wrap: break-word;">${p.name} ${cfg.icon}</p>
                        <p class="text-sm text-gray-500">${p.fertig}/${p.total} fertig</p>
                    </div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div class="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full transition-all" style="width: ${progressPercent}%"></div>
                </div>
                <div class="grid grid-cols-3 gap-1 text-xs text-center">
                    <div class="bg-red-50 rounded p-1">
                        <span class="font-bold text-red-600">${p.offen}</span>
                        <span class="text-gray-500 block">offen</span>
                    </div>
                    <div class="bg-blue-50 rounded p-1">
                        <span class="font-bold text-blue-600">${p.bestellt}</span>
                        <span class="text-gray-500 block">bestellt</span>
                    </div>
                    <div class="bg-green-50 rounded p-1">
                        <span class="font-bold text-green-600">${p.fertig}</span>
                        <span class="text-gray-500 block">fertig</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `
        <div class="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-4 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition"
             onclick="window.openAddPersonToThemaModal()">
            <div class="text-center text-gray-500">
                <span class="text-3xl">+</span>
                <p class="text-sm font-semibold mt-1">Person hinzufügen</p>
            </div>
        </div>
    </div>`;
    
    container.innerHTML = html;
}

// Toggle für Personen-Details
// ✅ Person-Modal mit umfangreichen Details
window.openPersonModal = function(personId) {
    const person = KONTAKTE[personId];
    if (!person || !currentThemaId) return;
    
    const thema = THEMEN[currentThemaId];
    const alleGeschenke = Object.values(GESCHENKE);
    const personGeschenke = alleGeschenke.filter(g => g.fuer && g.fuer.includes(personId));
    
    // Statistiken berechnen
    const stats = {
        total: personGeschenke.length,
        offen: personGeschenke.filter(g => ['offen', 'idee', 'zu_bestellen'].includes(g.status)).length,
        bestellt: personGeschenke.filter(g => ['bestellt', 'teillieferung'].includes(g.status)).length,
        fertig: personGeschenke.filter(g => g.status === 'abgeschlossen').length,
        gesamtkosten: personGeschenke.reduce((sum, g) => sum + (parseFloat(g.gesamtkosten) || 0), 0),
        eigeneKosten: personGeschenke.reduce((sum, g) => sum + (parseFloat(g.eigeneKosten) || 0), 0)
    };
    
    // Aktueller Status
    const personenStatus = thema.personenStatus || {};
    const currentStatus = personenStatus[personId] || 'offen';
    
    // Modal erstellen
    let modal = document.getElementById('personModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'personModal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden">
            <div class="sticky top-0 bg-gradient-to-r from-pink-600 to-purple-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
                <div>
                    <h3 class="text-2xl font-bold">👤 ${person.name}</h3>
                    <p class="text-sm text-white/90 mt-1">Umfassender Bericht & Einstellungen</p>
                </div>
                <button onclick="document.getElementById('personModal').style.display='none'" class="text-white/80 hover:text-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div class="p-6 overflow-y-auto max-h-[calc(95vh-180px)]">
                <!-- Status-Auswahl -->
                <div class="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200">
                    <h4 class="text-lg font-bold text-gray-800 mb-3">🎯 Status festlegen</h4>
                    <div class="grid grid-cols-3 gap-3">
                        <button onclick="window.setPersonStatus('${personId}', 'offen')" 
                            class="p-3 rounded-lg border-2 ${currentStatus === 'offen' ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'} hover:border-red-400 transition">
                            <div class="text-3xl mb-1">🔴</div>
                            <p class="font-bold text-gray-800">Offen</p>
                            <p class="text-xs text-gray-500">Noch nichts erledigt</p>
                        </button>
                        <button onclick="window.setPersonStatus('${personId}', 'teilweise')" 
                            class="p-3 rounded-lg border-2 ${currentStatus === 'teilweise' ? 'border-yellow-500 bg-yellow-50' : 'border-gray-300 bg-white'} hover:border-yellow-400 transition">
                            <div class="text-3xl mb-1">🟡</div>
                            <p class="font-bold text-gray-800">Teilweise</p>
                            <p class="text-xs text-gray-500">In Arbeit</p>
                        </button>
                        <button onclick="window.setPersonStatus('${personId}', 'abgeschlossen')" 
                            class="p-3 rounded-lg border-2 ${currentStatus === 'abgeschlossen' ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-white'} hover:border-green-400 transition">
                            <div class="text-3xl mb-1">🟢</div>
                            <p class="font-bold text-gray-800">Abgeschlossen</p>
                            <p class="text-xs text-gray-500">Alles erledigt</p>
                        </button>
                    </div>
                </div>
                
                <!-- Statistiken -->
                <div class="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <p class="text-2xl font-bold text-blue-600">${stats.total}</p>
                        <p class="text-sm text-gray-600">Geschenke gesamt</p>
                    </div>
                    <div class="bg-red-50 p-4 rounded-lg border border-red-200">
                        <p class="text-2xl font-bold text-red-600">${stats.offen}</p>
                        <p class="text-sm text-gray-600">Offen</p>
                    </div>
                    <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <p class="text-2xl font-bold text-yellow-600">${stats.bestellt}</p>
                        <p class="text-sm text-gray-600">Bestellt</p>
                    </div>
                    <div class="bg-green-50 p-4 rounded-lg border border-green-200">
                        <p class="text-2xl font-bold text-green-600">${stats.fertig}</p>
                        <p class="text-sm text-gray-600">Fertig</p>
                    </div>
                </div>
                
                <!-- Kosten -->
                <div class="mb-6 grid grid-cols-2 gap-4">
                    <div class="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <p class="text-2xl font-bold text-purple-600">${stats.gesamtkosten.toFixed(2)} €</p>
                        <p class="text-sm text-gray-600">Gesamtkosten</p>
                    </div>
                    <div class="bg-pink-50 p-4 rounded-lg border border-pink-200">
                        <p class="text-2xl font-bold text-pink-600">${stats.eigeneKosten.toFixed(2)} €</p>
                        <p class="text-sm text-gray-600">Eigene Kosten</p>
                    </div>
                </div>
                
                <!-- Geschenke-Liste -->
                <div class="mb-6">
                    <h4 class="text-lg font-bold text-gray-800 mb-3">🎁 Geschenke für ${person.name}</h4>
                    ${stats.total === 0 ? `
                        <p class="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">Noch keine Geschenke für diese Person</p>
                    ` : `
                        <div class="space-y-2 max-h-96 overflow-y-auto">
                            ${personGeschenke.map(g => {
                                const statusCfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.offen;
                                return `
                                    <div class="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition cursor-pointer"
                                         onclick="window.openEditGeschenkModal('${g.id}')">
                                        <div class="flex items-center justify-between mb-2">
                                            <span class="font-bold text-gray-800">${g.geschenk || 'Ohne Titel'}</span>
                                            <span class="px-2 py-1 rounded-full text-xs font-bold ${statusCfg.color}">
                                                ${statusCfg.icon} ${statusCfg.label}
                                            </span>
                                        </div>
                                        <div class="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                            <div>💰 Gesamtkosten: <strong>${(parseFloat(g.gesamtkosten) || 0).toFixed(2)} €</strong></div>
                                            <div>💳 Eigene: <strong>${(parseFloat(g.eigeneKosten) || 0).toFixed(2)} €</strong></div>
                                            <div>🆔 ID: <strong>${g.id?.slice(-6) || '-'}</strong></div>
                                            <div>🏪 Shop: <strong>${g.shop || '-'}</strong></div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
                
                <!-- Aktionen -->
                <div class="flex gap-3">
                    <button onclick="window.removePersonFromThema('${personId}')" 
                        class="flex-1 px-4 py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition">
                        🗑️ Person aus Thema entfernen
                    </button>
                    <button onclick="document.getElementById('personModal').style.display='none'" 
                        class="flex-1 px-4 py-3 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                        Schließen
                    </button>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
};

// ✅ Personen-Status setzen
window.setPersonStatus = async function(personId, status) {
    if (!currentThemaId) return;
    
    try {
        const thema = THEMEN[currentThemaId];
        const personenStatus = thema.personenStatus || {};
        personenStatus[personId] = status;
        
        // ✅ KORRIGIERT: Zentrale Collection
        const themaDocRef = doc(geschenkeThemenRef, currentThemaId);
        
        await updateDoc(themaDocRef, { personenStatus });
        THEMEN[currentThemaId].personenStatus = personenStatus;
        
        renderPersonenUebersicht();
        window.openPersonModal(personId); // Modal neu laden
        alertUser('Status aktualisiert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ✅ Person aus Thema entfernen
window.removePersonFromThema = async function(personId) {
    if (!currentThemaId) return;
    if (!confirm('Diese Person wirklich aus dem Thema entfernen?')) return;
    
    try {
        const thema = THEMEN[currentThemaId];
        const personen = (thema.personen || []).filter(id => id !== personId);
        
        // ✅ KORRIGIERT: Zentrale Collection
        const themaDocRef = doc(geschenkeThemenRef, currentThemaId);
        
        await updateDoc(themaDocRef, { personen });
        THEMEN[currentThemaId].personen = personen;
        
        renderPersonenUebersicht();
        document.getElementById('personModal').style.display = 'none';
        alertUser('Person wurde aus dem Thema entfernt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.togglePersonenDetails = function() {
    const details = document.getElementById('gm-personen-details');
    const icon = document.getElementById('gm-personen-toggle-icon');
    if (details && icon) {
        if (details.classList.contains('hidden')) {
            details.classList.remove('hidden');
            icon.textContent = '▼';
            icon.style.transform = 'rotate(0deg)';
            personenDetailsAusgeklappt = true; // ✅ State speichern
        } else {
            details.classList.add('hidden');
            personenDetailsAusgeklappt = false; // ✅ State speichern
            icon.textContent = '▶';
            icon.style.transform = 'rotate(0deg)';
        }
    }
};

function renderGeschenkeTabelle() {
    const tbody = document.getElementById('geschenke-table-body');
    if (!tbody) return;
    
    let geschenkeArray = Object.values(GESCHENKE);
    
    // Filter anwenden
    if (searchTerm) {
        geschenkeArray = geschenkeArray.filter(g => 
            g.geschenk?.toLowerCase().includes(searchTerm) ||
            g.shop?.toLowerCase().includes(searchTerm) ||
            g.notizen?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (currentFilter.status) {
        geschenkeArray = geschenkeArray.filter(g => g.status === currentFilter.status);
    }
    
    if (currentFilter.personId) {
        geschenkeArray = geschenkeArray.filter(g => 
            g.fuer?.includes(currentFilter.personId) || g.von?.includes(currentFilter.personId)
        );
    }
    
    if (geschenkeArray.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="px-4 py-8 text-center text-gray-400 italic">
                    ${Object.keys(GESCHENKE).length === 0 
                        ? 'Keine Einträge vorhanden. Erstelle deinen ersten Geschenk-Eintrag!' 
                        : 'Keine Einträge gefunden für die aktuelle Filterung.'}
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = geschenkeArray.map(g => renderGeschenkRow(g)).join('');
}

function renderGeschenkRow(geschenk) {
    const statusConfig = STATUS_CONFIG[geschenk.status] || STATUS_CONFIG.offen;
    const fuerPersonen = (geschenk.fuer || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ');
    const vonPersonen = (geschenk.von || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ');
    const beteiligtePersonen = (geschenk.beteiligung || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ');
    
    return `
        <tr class="hover:bg-pink-50 transition cursor-pointer" onclick="window.openEditGeschenkModal('${geschenk.id}')">
            <td class="px-3 py-3">
                <span class="px-2 py-1 rounded-full text-xs font-bold ${statusConfig.color}">
                    ${statusConfig.icon} ${statusConfig.label}
                </span>
            </td>
            <td class="px-3 py-3 text-sm font-medium text-gray-900">${fuerPersonen || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${vonPersonen || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.id?.slice(-4) || '-'}</td>
            <td class="px-3 py-3 text-sm font-medium text-gray-900">${geschenk.geschenk || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.bezahltVon ? (KONTAKTE[geschenk.bezahltVon]?.name || '-') : '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${beteiligtePersonen || '-'}</td>
            <td class="px-3 py-3 text-sm font-bold text-gray-900">${geschenk.gesamtkosten ? formatCurrency(geschenk.gesamtkosten) : '-'}</td>
            <td class="px-3 py-3 text-sm font-bold text-green-700">${geschenk.eigeneKosten ? formatCurrency(geschenk.eigeneKosten) : '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.sollBezahlung || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.istBezahlung || '-'}</td>
            <td class="px-3 py-3 text-sm text-gray-600">${geschenk.standort || '-'}</td>
        </tr>
    `;
}

function updateDashboardStats() {
    const geschenkeArray = Object.values(GESCHENKE);
    
    // Status-Statistiken
    const stats = {
        total: geschenkeArray.length,
        offen: geschenkeArray.filter(g => ['offen', 'idee'].includes(g.status)).length,
        zuBestellen: geschenkeArray.filter(g => g.status === 'zu_bestellen').length,
        bestellt: geschenkeArray.filter(g => ['bestellt', 'teillieferung', 'teillieferung_temp', 'geliefert_temp'].includes(g.status)).length,
        abgeschlossen: geschenkeArray.filter(g => g.status === 'abgeschlossen').length,
        probleme: geschenkeArray.filter(g => ['beschaedigt', 'problem'].includes(g.status)).length
    };
    
    // Kosten-Statistiken
    const gesamtkosten = geschenkeArray.reduce((sum, g) => sum + (parseFloat(g.gesamtkosten) || 0), 0);
    const eigeneKosten = geschenkeArray.reduce((sum, g) => sum + (parseFloat(g.eigeneKosten) || 0), 0);
    
    // UI aktualisieren
    updateStatElement('gm-stat-total', stats.total);
    updateStatElement('gm-stat-offen', stats.offen);
    updateStatElement('gm-stat-bestellt', stats.bestellt);
    updateStatElement('gm-stat-abgeschlossen', stats.abgeschlossen);
    updateStatElement('gm-kosten-gesamt', formatCurrency(gesamtkosten));
    updateStatElement('gm-kosten-eigen', formatCurrency(eigeneKosten));
}

function updateStatElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ========================================
// MODAL FUNKTIONEN
// ========================================
function openCreateModal() {
    // Prüfe ob ein Thema ausgewählt ist
    if (!currentThemaId) {
        alertUser('Bitte erstelle zuerst ein Thema in den Einstellungen, bevor du Geschenke hinzufügst.', 'warning');
        return;
    }
    
    const thema = THEMEN[currentThemaId];
    if (!thema?.personen || thema.personen.length === 0) {
        alertUser('Bitte füge zuerst Personen zum Thema hinzu, bevor du Geschenke erstellst.', 'warning');
        return;
    }
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    document.getElementById('geschenkModalTitle').textContent = 'Neues Geschenk';
    const idField = document.getElementById('gm-id');
    idField.value = '';
    idField.removeAttribute('data-is-copy'); // Entferne Kopie-Markierung
    clearModalForm();
    renderModalSelects();
    updateModalActionButtons(false, true); // Keine Aktions-Buttons, aber "Vorlage laden" anzeigen
    modal.style.display = 'flex';
}

// Aktions-Buttons im Modal ein-/ausblenden
function updateModalActionButtons(showActions, showVorlageButton = false) {
    const actionsContainer = document.getElementById('gm-modal-actions');
    const vorlageButton = document.getElementById('gm-btn-vorlage-laden');
    
    // Bearbeitungs-Buttons (Kopieren, Vorlage speichern, Löschen)
    if (actionsContainer) {
        actionsContainer.style.display = showActions ? 'flex' : 'none';
    }
    
    // "Vorlage laden" Button nur bei neuem Eintrag anzeigen
    if (vorlageButton) {
        vorlageButton.style.display = showVorlageButton ? 'inline-flex' : 'none';
    }
}

window.openEditGeschenkModal = function(id) {
    const geschenk = GESCHENKE[id];
    if (!geschenk) return;
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    // ✅ PUNKT 5: Prüfe ob Bearbeiten erlaubt ist
    const canEdit = isFieldEditable();
    const thema = THEMEN[currentThemaId];
    
    if (!canEdit) {
        document.getElementById('geschenkModalTitle').innerHTML = `
            <div>
                <span>Geschenk ansehen</span>
                <span class="block text-sm font-normal bg-blue-100 text-blue-800 px-2 py-1 rounded mt-1">
                    👁️ Nur Leserechte - Geteilt von ${thema?.besitzerName || 'Unbekannt'}
                </span>
            </div>
        `;
    } else if (thema?.istGeteilt) {
        document.getElementById('geschenkModalTitle').innerHTML = `
            <div>
                <span>Geschenk bearbeiten</span>
                <span class="block text-sm font-normal bg-green-100 text-green-800 px-2 py-1 rounded mt-1">
                    ✏️ Bearbeitungsrechte - Geteilt von ${thema?.besitzerName || 'Unbekannt'}
                </span>
            </div>
        `;
    } else {
        document.getElementById('geschenkModalTitle').textContent = 'Geschenk bearbeiten';
    }
    
    const idField = document.getElementById('gm-id');
    idField.value = id;
    idField.removeAttribute('data-is-copy');
    
    fillModalForm(geschenk);
    renderModalSelects(geschenk);
    updateModalActionButtons(true, false);
    
    // ✅ PUNKT 5: Bei Leserechten - alle Felder deaktivieren
    setModalFieldsReadOnly(!canEdit);
    
    modal.style.display = 'flex';
};

function clearModalForm() {
    const fields = ['gm-geschenk', 'gm-shop', 'gm-bestellnummer', 'gm-rechnungsnummer', 
                    'gm-gesamtkosten', 'gm-eigene-kosten', 'gm-notizen'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function fillModalForm(geschenk) {
    document.getElementById('gm-geschenk').value = geschenk.geschenk || '';
    document.getElementById('gm-shop').value = geschenk.shop || '';
    document.getElementById('gm-bestellnummer').value = geschenk.bestellnummer || '';
    document.getElementById('gm-rechnungsnummer').value = geschenk.rechnungsnummer || '';
    document.getElementById('gm-gesamtkosten').value = geschenk.gesamtkosten || '';
    document.getElementById('gm-eigene-kosten').value = geschenk.eigeneKosten || '';
    document.getElementById('gm-notizen').value = geschenk.notizen || '';
}

function renderModalSelects(geschenk = null) {
    // Status
    const statusSelect = document.getElementById('gm-status');
    if (statusSelect) {
        statusSelect.innerHTML = Object.entries(STATUS_CONFIG).map(([key, config]) =>
            `<option value="${key}" ${geschenk?.status === key ? 'selected' : ''}>${config.icon} ${config.label}</option>`
        ).join('');
    }
    
    // Checkbox-basierte Personenauswahl für FÜR, VON, Beteiligung
    renderPersonenCheckboxes('gm-fuer-checkboxes', 'gm-fuer', geschenk?.fuer || []);
    renderPersonenCheckboxes('gm-von-checkboxes', 'gm-von', geschenk?.von || []);
    renderPersonenCheckboxes('gm-beteiligung-checkboxes', 'gm-beteiligung', geschenk?.beteiligung || []);
    
    // Bezahlt von (Single Select)
    const kontakteOptions = Object.values(KONTAKTE).map(k =>
        `<option value="${k.id}">${k.name}${k.istEigenePerson ? ' (Ich)' : ''}</option>`
    ).join('');
    
    const bezahltVonSelect = document.getElementById('gm-bezahlt-von');
    if (bezahltVonSelect) {
        bezahltVonSelect.innerHTML = '<option value="">-- Auswählen --</option>' + kontakteOptions;
        if (geschenk?.bezahltVon) bezahltVonSelect.value = geschenk.bezahltVon;
    }
    
    // Zahlungsarten (beide nutzen dieselbe Liste)
    renderZahlungsartSelect('gm-soll-bezahlung', ZAHLUNGSARTEN, geschenk?.sollBezahlung);
    renderZahlungsartSelect('gm-ist-bezahlung', ZAHLUNGSARTEN, geschenk?.istBezahlung);
    
    // Standort
    const standortSelect = document.getElementById('gm-standort');
    if (standortSelect) {
        const standorte = [...geschenkeSettings.geschenkeStandorte, ...geschenkeSettings.customGeschenkeStandorte];
        standortSelect.innerHTML = '<option value="">-- Auswählen --</option>' + 
            standorte.map(s => `<option value="${s}" ${geschenk?.standort === s ? 'selected' : ''}>${s}</option>`).join('');
    }
}

// Checkbox-basierte Personenauswahl rendern
function renderPersonenCheckboxes(containerId, fieldName, selectedValues) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const kontakte = Object.values(KONTAKTE).sort((a, b) => {
        if (a.istEigenePerson) return -1;
        if (b.istEigenePerson) return 1;
        return a.name.localeCompare(b.name);
    });
    
    container.innerHTML = kontakte.map(k => {
        const isChecked = selectedValues.includes(k.id);
        return `
            <label class="flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-pink-50 transition ${isChecked ? 'bg-pink-100' : ''}">
                <input type="checkbox" name="${fieldName}" value="${k.id}" 
                    ${isChecked ? 'checked' : ''}
                    onchange="window.updateEigeneKostenAuto()"
                    class="w-4 h-4 text-pink-600 rounded focus:ring-pink-500">
                <span class="text-sm ${k.istEigenePerson ? 'font-bold text-pink-600' : 'text-gray-700'}">
                    ${k.name}${k.istEigenePerson ? ' (Ich)' : ''}
                </span>
            </label>
        `;
    }).join('');
}

// Auto-Berechnung: Wenn nur ICH an Geschenk beteiligt bin → Eigene Kosten = Gesamtkosten
window.updateEigeneKostenAuto = function() {
    const beteiligungCheckboxes = document.querySelectorAll('input[name="gm-beteiligung"]:checked');
    const gesamtkostenInput = document.getElementById('gm-gesamtkosten');
    const eigeneKostenInput = document.getElementById('gm-eigene-kosten');
    const hintElement = document.getElementById('gm-eigene-kosten-hint');
    const vorschlagContainer = document.getElementById('gm-kosten-vorschlag');
    
    if (!beteiligungCheckboxes || !gesamtkostenInput || !eigeneKostenInput) return;
    
    const beteiligteIds = Array.from(beteiligungCheckboxes).map(cb => cb.value);
    const gesamtkosten = parseFloat(gesamtkostenInput.value) || 0;
    
    // Wenn nur ICH beteiligt bin (eigenePerson.id)
    if (beteiligteIds.length === 1 && eigenePerson && beteiligteIds[0] === eigenePerson.id) {
        eigeneKostenInput.value = gesamtkosten.toFixed(2);
        eigeneKostenInput.readOnly = true;
        eigeneKostenInput.style.backgroundColor = '#e0f2fe'; // Hellblau
        eigeneKostenInput.style.borderColor = '#0ea5e9'; // Blau
        if (hintElement) hintElement.textContent = '✨ Auto-berechnet';
        if (vorschlagContainer) vorschlagContainer.style.display = 'none';
    } else if (beteiligteIds.length > 1 && gesamtkosten > 0) {
        // ✅ Mehrere Personen: Vorschlag berechnen
        const anzahlPersonen = beteiligteIds.length;
        const prozent = Math.round(100 / anzahlPersonen);
        const vorschlagBetrag = (gesamtkosten * prozent / 100).toFixed(2);
        
        eigeneKostenInput.readOnly = false;
        eigeneKostenInput.style.backgroundColor = '';
        eigeneKostenInput.style.borderColor = '';
        if (hintElement) hintElement.textContent = '';
        
        // Vorschlag anzeigen
        if (vorschlagContainer) {
            vorschlagContainer.style.display = 'flex';
            vorschlagContainer.innerHTML = `
                <div class="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg flex-wrap">
                    <span class="text-sm text-gray-700">💡 Vorschlag:</span>
                    <input type="number" 
                        id="kosten-prozent-input" 
                        value="${prozent}" 
                        min="0" 
                        max="100" 
                        step="1"
                        oninput="window.updateKostenVorschlagBetrag()"
                        class="w-16 px-2 py-1 border border-blue-300 rounded text-center font-bold">
                    <span class="text-sm text-gray-700">% von Gesamtkosten = <strong id="kosten-betrag-display">${vorschlagBetrag} €</strong></span>
                    <button onclick="window.uebertrageKostenVorschlag()" 
                        class="px-3 py-1 bg-blue-500 text-white text-sm font-bold rounded hover:bg-blue-600 transition">
                        ✓ Übertragen
                    </button>
                </div>
            `;
        }
    } else {
        eigeneKostenInput.readOnly = false;
        eigeneKostenInput.style.backgroundColor = '';
        eigeneKostenInput.style.borderColor = '';
        if (hintElement) hintElement.textContent = '';
        if (vorschlagContainer) vorschlagContainer.style.display = 'none';
    }
};

// ✅ Berechne Betrag basierend auf eingegebenem Prozent neu
window.updateKostenVorschlagBetrag = function() {
    const prozentInput = document.getElementById('kosten-prozent-input');
    const betragDisplay = document.getElementById('kosten-betrag-display');
    const gesamtkostenInput = document.getElementById('gm-gesamtkosten');
    
    if (!prozentInput || !betragDisplay || !gesamtkostenInput) return;
    
    const prozent = parseFloat(prozentInput.value) || 0;
    const gesamtkosten = parseFloat(gesamtkostenInput.value) || 0;
    const betrag = (gesamtkosten * prozent / 100).toFixed(2);
    
    betragDisplay.textContent = `${betrag} €`;
};

// ✅ Übertrage Kostenvorschlag in das Eingabefeld
window.uebertrageKostenVorschlag = function() {
    const betragDisplay = document.getElementById('kosten-betrag-display');
    const eigeneKostenInput = document.getElementById('gm-eigene-kosten');
    
    if (!betragDisplay || !eigeneKostenInput) return;
    
    // Extrahiere Zahl aus "25.00 €"
    const betragText = betragDisplay.textContent.replace(' €', '').trim();
    const betrag = parseFloat(betragText);
    
    if (!isNaN(betrag)) {
        eigeneKostenInput.value = betrag.toFixed(2);
        eigeneKostenInput.focus();
    }
};

// Checkbox-Werte auslesen
function getCheckboxValues(fieldName) {
    const checkboxes = document.querySelectorAll(`input[name="${fieldName}"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
}

function renderZahlungsartSelect(id, options, selectedValue) {
    const select = document.getElementById(id);
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Auswählen --</option>' +
        Object.entries(options).map(([key, config]) =>
            `<option value="${key}" ${selectedValue === key ? 'selected' : ''}>${config.label}</option>`
        ).join('');
}

function closeGeschenkModal() {
    const modal = document.getElementById('geschenkModal');
    if (modal) modal.style.display = 'none';
}

async function saveGeschenk() {
    const id = document.getElementById('gm-id').value;
    
    // ✅ DIAGNOSE: User-ID und Pfad überprüfen
    console.log("🔍 DIAGNOSE - saveGeschenk:");
    console.log("  auth.currentUser:", auth?.currentUser);
    console.log("  auth.currentUser.uid:", auth?.currentUser?.uid);
    console.log("  currentUser:", currentUser);
    console.log("  currentUser.uid:", currentUser?.uid);
    console.log("  currentThemaId:", currentThemaId);
    console.log("  THEMEN[currentThemaId]:", THEMEN[currentThemaId]);
    console.log("  geschenkeCollection.path:", geschenkeCollection?.path);
    
    // Prüfe ob Firebase Auth User vorhanden ist
    if (!auth?.currentUser?.uid) {
        alertUser('❌ FEHLER: Firebase Auth User nicht gefunden! Bitte neu einloggen.', 'error');
        console.error("❌ auth.currentUser.uid ist nicht gesetzt!");
        return;
    }
    
    const geschenkData = {
        geschenk: document.getElementById('gm-geschenk').value.trim(),
        status: document.getElementById('gm-status').value,
        fuer: getCheckboxValues('gm-fuer'),
        von: getCheckboxValues('gm-von'),
        beteiligung: getCheckboxValues('gm-beteiligung'),
        bezahltVon: document.getElementById('gm-bezahlt-von').value,
        shop: document.getElementById('gm-shop').value.trim(),
        bestellnummer: document.getElementById('gm-bestellnummer').value.trim(),
        rechnungsnummer: document.getElementById('gm-rechnungsnummer').value.trim(),
        gesamtkosten: parseFloat(document.getElementById('gm-gesamtkosten').value) || 0,
        eigeneKosten: parseFloat(document.getElementById('gm-eigene-kosten').value) || 0,
        sollBezahlung: document.getElementById('gm-soll-bezahlung').value,
        istBezahlung: document.getElementById('gm-ist-bezahlung').value,
        standort: document.getElementById('gm-standort').value,
        notizen: document.getElementById('gm-notizen').value.trim(),
        aktualisiertAm: serverTimestamp(),
        aktualisiertVon: currentUser.displayName
    };
    
    if (!geschenkData.geschenk) {
        alertUser('Bitte gib einen Geschenknamen ein.', 'warning');
        return;
    }
    
    try {
        if (id) {
            await updateDoc(doc(geschenkeCollection, id), geschenkData);
            alertUser('Geschenk aktualisiert!', 'success');
        } else {
            geschenkData.erstelltAm = serverTimestamp();
            geschenkData.erstelltVon = currentUser.displayName;
            await addDoc(geschenkeCollection, geschenkData);
            alertUser('Geschenk erstellt!', 'success');
        }
        closeGeschenkModal();
    } catch (e) {
        console.error("Fehler beim Speichern:", e);
        alertUser('Fehler beim Speichern: ' + e.message, 'error');
    }
}

function getMultiSelectValues(id) {
    const select = document.getElementById(id);
    if (!select) return [];
    return Array.from(select.selectedOptions).map(opt => opt.value);
}

// ========================================
// EINSTELLUNGEN MODAL
// ========================================
function openSettingsModal() {
    const modal = document.getElementById('geschenkeSettingsModal');
    if (!modal) return;
    
    renderSettingsTabs();
    modal.style.display = 'flex';
}

function closeSettingsModalFn() {
    const modal = document.getElementById('geschenkeSettingsModal');
    if (modal) modal.style.display = 'none';
}

function renderSettingsTabs() {
    console.log('📋 renderSettingsTabs aufgerufen');
    console.log('👥 USERS verfügbar:', Object.keys(USERS).length, 'User(s)');
    console.log('🔑 currentUser:', currentUser?.displayName, currentUser?.odooUserId);
    
    // Kontaktbuch rendern
    renderKontaktbuch();
    // Themen rendern
    renderThemenVerwaltung();
    // Optionen rendern
    renderOptionenVerwaltung();
}

function renderOptionenVerwaltung() {
    // Status-Optionen
    renderOptionList('gm-status-optionen', STATUS_CONFIG, geschenkeSettings.customStatusOptionen, 'status');
    // Zahlungsarten (vereinheitlicht)
    renderOptionList('gm-zahlungsarten-optionen', ZAHLUNGSARTEN, geschenkeSettings.customZahlungsarten, 'zahlungsarten');
    // Standorte
    renderStandortList();
}

function renderOptionList(containerId, defaultOptions, customOptions, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const allOptions = [...Object.entries(defaultOptions).map(([k, v]) => ({ key: k, label: v.label, isDefault: true })),
                        ...customOptions.map(o => ({ key: o, label: o, isDefault: false }))];
    
    container.innerHTML = allOptions.map(opt => `
        <div class="flex items-center justify-between p-2 bg-white rounded border text-sm">
            <span>${opt.label}</span>
            ${!opt.isDefault ? `<button onclick="window.removeCustomOption('${type}', '${opt.key}')" class="text-red-500">✕</button>` : ''}
        </div>
    `).join('');
}

function renderStandortList() {
    const container = document.getElementById('gm-standort-optionen');
    if (!container) return;
    
    const allStandorte = [...geschenkeSettings.geschenkeStandorte.map(s => ({ name: s, isDefault: true })),
                          ...geschenkeSettings.customGeschenkeStandorte.map(s => ({ name: s, isDefault: false }))];
    
    container.innerHTML = allStandorte.map(s => `
        <div class="flex items-center justify-between p-2 bg-white rounded border text-sm">
            <span>${s.name}</span>
            ${!s.isDefault ? `<button onclick="window.removeCustomStandort('${s.name}')" class="text-red-500">✕</button>` : ''}
        </div>
    `).join('');
}

window.addCustomOption = async function(type) {
    let inputId, settingsKey;
    
    switch(type) {
        case 'status':
            inputId = 'gm-new-status';
            settingsKey = 'customStatusOptionen';
            break;
        case 'zahlungsarten':
            inputId = 'gm-new-zahlungsarten';
            settingsKey = 'customZahlungsarten';
            break;
        default:
            return;
    }
    
    const input = document.getElementById(inputId);
    if (!input || !input.value.trim()) {
        alertUser('Bitte gib einen Wert ein.', 'warning');
        return;
    }
    
    const newValue = input.value.trim();
    
    // Prüfen ob bereits vorhanden
    if (geschenkeSettings[settingsKey].includes(newValue)) {
        alertUser('Dieser Wert existiert bereits.', 'warning');
        return;
    }
    
    try {
        geschenkeSettings[settingsKey].push(newValue);
        await setDoc(geschenkeSettingsRef, geschenkeSettings);
        input.value = '';
        renderOptionenVerwaltung();
        alertUser('Option hinzugefügt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.removeCustomOption = async function(type, value) {
    let settingsKey;
    
    switch(type) {
        case 'status':
            settingsKey = 'customStatusOptionen';
            break;
        case 'zahlungsarten':
            settingsKey = 'customZahlungsarten';
            break;
        default:
            return;
    }
    
    if (!confirm(`"${value}" wirklich entfernen?`)) return;
    
    try {
        geschenkeSettings[settingsKey] = geschenkeSettings[settingsKey].filter(o => o !== value);
        await setDoc(geschenkeSettingsRef, geschenkeSettings);
        renderOptionenVerwaltung();
        alertUser('Option entfernt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.addCustomStandort = async function() {
    const input = document.getElementById('gm-new-standort');
    if (!input || !input.value.trim()) {
        alertUser('Bitte gib einen Standort ein.', 'warning');
        return;
    }
    
    const newStandort = input.value.trim();
    
    // Prüfen ob bereits vorhanden
    const allStandorte = [...geschenkeSettings.geschenkeStandorte, ...geschenkeSettings.customGeschenkeStandorte];
    if (allStandorte.includes(newStandort)) {
        alertUser('Dieser Standort existiert bereits.', 'warning');
        return;
    }
    
    try {
        geschenkeSettings.customGeschenkeStandorte.push(newStandort);
        await setDoc(geschenkeSettingsRef, geschenkeSettings);
        input.value = '';
        renderOptionenVerwaltung();
        alertUser('Standort hinzugefügt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.removeCustomStandort = async function(standort) {
    if (!confirm(`"${standort}" wirklich entfernen?`)) return;
    
    try {
        geschenkeSettings.customGeschenkeStandorte = geschenkeSettings.customGeschenkeStandorte.filter(s => s !== standort);
        await setDoc(geschenkeSettingsRef, geschenkeSettings);
        renderOptionenVerwaltung();
        alertUser('Standort entfernt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// HILFSFUNKTIONEN
// ========================================

function formatCurrency(value) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function resetFilters() {
    searchTerm = '';
    currentFilter = {};
    const searchInput = document.getElementById('search-geschenke');
    if (searchInput) searchInput.value = '';
    renderGeschenkeTabelle();
}

window.filterByPerson = function(personId) {
    currentFilter.personId = personId;
    renderGeschenkeTabelle();
};

function renderKontaktbuch() {
    const container = document.getElementById('gm-kontaktbuch-list');
    if (!container) return;
    
    const kontakteArray = Object.values(KONTAKTE).sort((a, b) => {
        if (a.istEigenePerson) return -1;
        if (b.istEigenePerson) return 1;
        return a.name.localeCompare(b.name);
    });
    
    container.innerHTML = kontakteArray.map(k => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg ${k.istEigenePerson ? 'border-2 border-pink-400' : ''}">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                    ${k.name.charAt(0).toUpperCase()}
                </div>
                <span class="font-medium">${k.name}</span>
                ${k.istEigenePerson ? '<span class="text-xs bg-pink-200 text-pink-800 px-2 py-0.5 rounded-full">Ich</span>' : ''}
            </div>
            ${!k.istEigenePerson ? `
                <div class="flex gap-2">
                    <button onclick="window.editKontakt('${k.id}')" class="text-blue-500 hover:text-blue-700 p-1" title="Bearbeiten">
                        ✏️
                    </button>
                    <button onclick="window.deleteKontakt('${k.id}')" class="text-red-500 hover:text-red-700 p-1" title="Löschen">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                    </button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function renderThemenVerwaltung() {
    const container = document.getElementById('gm-themen-list');
    if (!container) return;
    
    const themenArray = Object.values(THEMEN);
    
    container.innerHTML = themenArray.length === 0 
        ? '<p class="text-gray-500 text-center py-4">Keine Themen vorhanden</p>'
        : themenArray.map(t => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg ${t.archiviert ? 'opacity-50' : ''}">
                <div>
                    <span class="font-medium">${t.name}</span>
                    ${t.archiviert ? '<span class="text-xs bg-gray-300 text-gray-700 px-2 py-0.5 rounded-full ml-2">Archiviert</span>' : ''}
                </div>
                <div class="flex gap-2">
                    <button onclick="window.editThema('${t.id}')" class="text-blue-500 hover:text-blue-700 p-1" title="Bearbeiten">✏️</button>
                    <button onclick="window.toggleArchiveThema('${t.id}')" class="text-yellow-500 hover:text-yellow-700 p-1" title="${t.archiviert ? 'Wiederherstellen' : 'Archivieren'}">
                        ${t.archiviert ? '📤' : '📥'}
                    </button>
                    <button onclick="window.deleteThema('${t.id}')" class="text-red-500 hover:text-red-700 p-1" title="Löschen">🗑️</button>
                </div>
            </div>
        `).join('');
}

// ========================================
// BUDGET-SYSTEM
// ========================================

window.openBudgetModal = function() {
    const existingModal = document.getElementById('gm-budget-modal');
    if (existingModal) existingModal.remove();
    
    const thema = THEMEN[currentThemaId];
    const budget = Object.values(BUDGETS).find(b => b.themaId === currentThemaId);
    
    const modal = document.createElement('div');
    modal.id = 'gm-budget-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div class="bg-gradient-to-r from-green-500 to-teal-600 p-4 text-white rounded-t-2xl">
                <h2 class="text-xl font-bold">💰 Budget verwalten</h2>
                <p class="text-sm opacity-90">${thema?.name || 'Aktuelles Thema'}</p>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Gesamtbudget (€)</label>
                    <input type="number" id="budget-gesamt" value="${budget?.gesamtBudget || ''}" 
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" placeholder="z.B. 500">
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Budget pro Person (€)</label>
                    <input type="number" id="budget-pro-person" value="${budget?.budgetProPerson || ''}" 
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" placeholder="z.B. 50">
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Warnung bei (% des Budgets)</label>
                    <input type="number" id="budget-warnung" value="${budget?.warnungBei || 80}" 
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" placeholder="80">
                </div>
                
                ${budget ? `
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-sm font-bold text-gray-700">Aktueller Stand:</p>
                        <div class="mt-2">
                            <div class="flex justify-between text-sm">
                                <span>Ausgegeben:</span>
                                <span class="font-bold">${formatCurrency(calculateTotalSpent())}</span>
                            </div>
                            <div class="flex justify-between text-sm">
                                <span>Verbleibend:</span>
                                <span class="font-bold ${(budget.gesamtBudget - calculateTotalSpent()) < 0 ? 'text-red-600' : 'text-green-600'}">
                                    ${formatCurrency(budget.gesamtBudget - calculateTotalSpent())}
                                </span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-3 mt-2">
                                <div class="h-3 rounded-full transition-all ${getBudgetProgressColor(budget)}" 
                                    style="width: ${Math.min(100, (calculateTotalSpent() / budget.gesamtBudget) * 100)}%"></div>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
            <div class="p-4 border-t flex gap-2">
                <button onclick="document.getElementById('gm-budget-modal').remove()" 
                    class="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    Abbrechen
                </button>
                <button onclick="window.saveBudget()" 
                    class="flex-1 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition">
                    💾 Speichern
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

function calculateTotalSpent() {
    return Object.values(GESCHENKE).reduce((sum, g) => sum + (parseFloat(g.eigeneKosten) || 0), 0);
}

function getBudgetProgressColor(budget) {
    const percent = (calculateTotalSpent() / budget.gesamtBudget) * 100;
    if (percent >= 100) return 'bg-red-500';
    if (percent >= budget.warnungBei) return 'bg-yellow-500';
    return 'bg-green-500';
}

window.saveBudget = async function() {
    const gesamtBudget = parseFloat(document.getElementById('budget-gesamt').value) || 0;
    const budgetProPerson = parseFloat(document.getElementById('budget-pro-person').value) || 0;
    const warnungBei = parseFloat(document.getElementById('budget-warnung').value) || 80;
    
    try {
        const existingBudget = Object.values(BUDGETS).find(b => b.themaId === currentThemaId);
        
        const budgetData = {
            themaId: currentThemaId,
            gesamtBudget,
            budgetProPerson,
            warnungBei,
            aktualisiertAm: serverTimestamp(),
            aktualisiertVon: currentUser.displayName
        };
        
        if (existingBudget) {
            await updateDoc(doc(geschenkeBudgetsRef, existingBudget.id), budgetData);
            BUDGETS[existingBudget.id] = { ...existingBudget, ...budgetData };
        } else {
            budgetData.erstelltAm = serverTimestamp();
            const docRef = await addDoc(geschenkeBudgetsRef, budgetData);
            BUDGETS[docRef.id] = { id: docRef.id, ...budgetData };
        }
        
        alertUser('Budget gespeichert!', 'success');
        document.getElementById('gm-budget-modal')?.remove();
        updateDashboardStats();
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// ERINNERUNGEN/BENACHRICHTIGUNGEN
// ========================================
window.openErinnerungModal = function(geschenkId = null) {
    const existingModal = document.getElementById('gm-erinnerung-modal');
    if (existingModal) existingModal.remove();
    
    const geschenk = geschenkId ? GESCHENKE[geschenkId] : null;
    
    const modal = document.createElement('div');
    modal.id = 'gm-erinnerung-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div class="bg-gradient-to-r from-orange-500 to-red-600 p-4 text-white rounded-t-2xl">
                <h2 class="text-xl font-bold">🔔 Erinnerung erstellen</h2>
                ${geschenk ? `<p class="text-sm opacity-90">Für: ${geschenk.geschenk}</p>` : ''}
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Erinnerungsdatum</label>
                    <input type="datetime-local" id="erinnerung-datum" 
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500">
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Nachricht</label>
                    <textarea id="erinnerung-nachricht" rows="3"
                        class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500"
                        placeholder="z.B. Geschenk bestellen nicht vergessen!">${geschenk ? `Erinnerung für "${geschenk.geschenk}"` : ''}</textarea>
                </div>
                
                <div>
                    <label class="block text-sm font-bold text-gray-700 mb-1">Typ</label>
                    <select id="erinnerung-typ" class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500">
                        <option value="bestellen">🛒 Bestellen</option>
                        <option value="abholen">📦 Abholen</option>
                        <option value="verpacken">🎁 Verpacken</option>
                        <option value="bezahlen">💳 Bezahlen</option>
                        <option value="sonstiges">📝 Sonstiges</option>
                    </select>
                </div>
            </div>
            <div class="p-4 border-t flex gap-2">
                <button onclick="document.getElementById('gm-erinnerung-modal').remove()" 
                    class="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    Abbrechen
                </button>
                <button onclick="window.saveErinnerung('${geschenkId || ''}')" 
                    class="flex-1 py-2 bg-orange-500 text-white rounded-lg font-bold hover:bg-orange-600 transition">
                    🔔 Speichern
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.saveErinnerung = async function(geschenkId) {
    const datum = document.getElementById('erinnerung-datum').value;
    const nachricht = document.getElementById('erinnerung-nachricht').value;
    const typ = document.getElementById('erinnerung-typ').value;
    
    if (!datum) {
        alertUser('Bitte wähle ein Datum aus.', 'warning');
        return;
    }
    
    try {
        const myUserId = getCurrentUserId();
        const erinnerungData = {
            datum: new Date(datum),
            nachricht,
            typ,
            geschenkId: geschenkId || null,
            themaId: currentThemaId,
            userId: myUserId,
            erstelltAm: serverTimestamp(),
            erledigt: false
        };
        
        const docRef = await addDoc(geschenkeErinnerungenRef, erinnerungData);
        ERINNERUNGEN[docRef.id] = { id: docRef.id, ...erinnerungData };
        
        alertUser('Erinnerung gespeichert!', 'success');
        document.getElementById('gm-erinnerung-modal')?.remove();
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.markErinnerungDone = async function(erinnerungId) {
    try {
        await updateDoc(doc(geschenkeErinnerungenRef, erinnerungId), {
            erledigt: true,
            erledigtAm: serverTimestamp()
        });
        ERINNERUNGEN[erinnerungId].erledigt = true;
        alertUser('Erinnerung als erledigt markiert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// JAHRESVERGLEICH
// ========================================
window.openJahresvergleichModal = function() {
    const existingModal = document.getElementById('gm-jahresvergleich-modal');
    if (existingModal) existingModal.remove();
    
    // Sammle Daten aus allen Themen
    const themenMitDaten = Object.values(THEMEN).map(thema => {
        const jahr = extractYearFromThemaName(thema.name);
        return {
            ...thema,
            jahr,
            // Hier würden wir die Geschenke-Daten pro Thema laden
        };
    }).filter(t => t.jahr);
    
    // Gruppiere nach Jahr
    const jahresDaten = {};
    themenMitDaten.forEach(thema => {
        if (!jahresDaten[thema.jahr]) {
            jahresDaten[thema.jahr] = { themen: [], gesamtkosten: 0, anzahl: 0 };
        }
        jahresDaten[thema.jahr].themen.push(thema);
    });
    
    const modal = document.createElement('div');
    modal.id = 'gm-jahresvergleich-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 text-white rounded-t-2xl">
                <h2 class="text-xl font-bold">📊 Jahresvergleich</h2>
                <p class="text-sm opacity-90">Vergleiche deine Ausgaben über die Jahre</p>
            </div>
            <div class="p-6 max-h-[60vh] overflow-y-auto">
                ${Object.keys(jahresDaten).length === 0 ? `
                    <p class="text-center text-gray-500 py-8">Keine Jahresdaten verfügbar. Benenne deine Themen mit Jahreszahlen (z.B. "Weihnachten 2024").</p>
                ` : `
                    <div class="space-y-4">
                        ${Object.entries(jahresDaten).sort((a, b) => b[0] - a[0]).map(([jahr, daten]) => `
                            <div class="border rounded-xl p-4">
                                <div class="flex justify-between items-center mb-2">
                                    <h3 class="text-lg font-bold text-gray-800">${jahr}</h3>
                                    <span class="text-sm text-gray-500">${daten.themen.length} Thema/Themen</span>
                                </div>
                                <div class="grid grid-cols-2 gap-4 text-sm">
                                    <div class="bg-gray-50 p-3 rounded-lg">
                                        <p class="text-gray-500">Themen</p>
                                        <p class="font-bold">${daten.themen.map(t => t.name).join(', ')}</p>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
            <div class="p-4 border-t">
                <button onclick="document.getElementById('gm-jahresvergleich-modal').remove()" 
                    class="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

function extractYearFromThemaName(name) {
    const match = name.match(/\b(20\d{2})\b/);
    return match ? match[1] : null;
}

// ========================================
// EXPORT-FUNKTIONEN (Excel/PDF)
// ========================================
window.exportToExcel = function() {
    const geschenkeArray = Object.values(GESCHENKE);
    const thema = THEMEN[currentThemaId];
    
    // CSV erstellen (Excel-kompatibel)
    const headers = ['Status', 'FÜR', 'VON', 'ID', 'Geschenk', 'Shop', 'Bezahlt von', 'Beteiligung', 'Gesamtkosten', 'Eigene Kosten', 'SOLL-Bezahlung', 'IST-Bezahlung', 'Standort', 'Bestellnummer', 'Rechnungsnummer', 'Notizen'];
    
    const rows = geschenkeArray.map(g => [
        STATUS_CONFIG[g.status]?.label || g.status,
        (g.fuer || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join('; '),
        (g.von || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join('; '),
        g.id?.slice(-4) || '',
        g.geschenk || '',
        g.shop || '',
        KONTAKTE[g.bezahltVon]?.name || '',
        (g.beteiligung || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join('; '),
        g.gesamtkosten || 0,
        g.eigeneKosten || 0,
        ZAHLUNGSARTEN[g.sollBezahlung]?.label || g.sollBezahlung || '',
        ZAHLUNGSARTEN[g.istBezahlung]?.label || g.istBezahlung || '',
        g.standort || '',
        g.bestellnummer || '',
        g.rechnungsnummer || '',
        g.notizen || ''
    ]);
    
    // BOM für Excel UTF-8
    const BOM = '\uFEFF';
    const csvContent = BOM + [headers, ...rows].map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Geschenke_${thema?.name || 'Export'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    alertUser('Export als CSV erstellt!', 'success');
};

window.exportToPDF = function() {
    const geschenkeArray = Object.values(GESCHENKE);
    const thema = THEMEN[currentThemaId];
    
    // Einfache HTML-to-Print Lösung
    const printWindow = window.open('', '_blank');
    
    const stats = {
        total: geschenkeArray.length,
        abgeschlossen: geschenkeArray.filter(g => g.status === 'abgeschlossen').length,
        gesamtkosten: geschenkeArray.reduce((sum, g) => sum + (parseFloat(g.gesamtkosten) || 0), 0),
        eigeneKosten: geschenkeArray.reduce((sum, g) => sum + (parseFloat(g.eigeneKosten) || 0), 0)
    };
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Geschenkeliste - ${thema?.name || 'Export'}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #db2777; border-bottom: 2px solid #db2777; padding-bottom: 10px; }
                .stats { display: flex; gap: 20px; margin-bottom: 20px; }
                .stat-box { background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; }
                .stat-value { font-size: 24px; font-weight: bold; color: #db2777; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                th { background: #db2777; color: white; }
                tr:nth-child(even) { background: #f9f9f9; }
                .footer { margin-top: 20px; text-align: center; color: #666; font-size: 12px; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>🎁 ${thema?.name || 'Geschenkeliste'}</h1>
            <div class="stats">
                <div class="stat-box">
                    <div class="stat-value">${stats.total}</div>
                    <div>Gesamt</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${stats.abgeschlossen}</div>
                    <div>Abgeschlossen</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${formatCurrency(stats.gesamtkosten)}</div>
                    <div>Gesamtkosten</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${formatCurrency(stats.eigeneKosten)}</div>
                    <div>Eigene Kosten</div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>FÜR</th>
                        <th>Geschenk</th>
                        <th>Gesamtkosten</th>
                        <th>Eigene Kosten</th>
                        <th>Standort</th>
                    </tr>
                </thead>
                <tbody>
                    ${geschenkeArray.map(g => `
                        <tr>
                            <td>${STATUS_CONFIG[g.status]?.icon || ''} ${STATUS_CONFIG[g.status]?.label || g.status}</td>
                            <td>${(g.fuer || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ')}</td>
                            <td>${g.geschenk || '-'}</td>
                            <td>${formatCurrency(g.gesamtkosten || 0)}</td>
                            <td>${formatCurrency(g.eigeneKosten || 0)}</td>
                            <td>${g.standort || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div class="footer">
                Erstellt am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')}
            </div>
            <script>window.print();</script>
        </body>
        </html>
    `);
    printWindow.document.close();
};

// ========================================
// PERSONEN ZUM THEMA HINZUFÜGEN
// ========================================

window.openAddPersonToThemaModal = function() {
    const verfuegbareKontakte = Object.values(KONTAKTE)
        .filter(k => !THEMEN[currentThemaId]?.personen?.includes(k.id));
    
    if (verfuegbareKontakte.length === 0) {
        alertUser('Alle Kontakte sind bereits hinzugefügt oder es gibt keine Kontakte. Erstelle neue Kontakte in den Einstellungen.', 'info');
        return;
    }
    
    // Modal erstellen
    let modal = document.getElementById('addPersonModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'addPersonModal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div class="bg-gradient-to-r from-pink-500 to-purple-600 text-white p-4 rounded-t-2xl flex justify-between items-center">
                <h3 class="text-xl font-bold">👤 Person hinzufügen</h3>
                <button onclick="document.getElementById('addPersonModal').style.display='none'" class="text-white/80 hover:text-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="p-4">
                <p class="text-sm text-gray-600 mb-3">Wähle eine Person aus dem Kontaktbuch:</p>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    ${verfuegbareKontakte.map(k => `
                        <button onclick="window.addPersonToThema('${k.id}')" 
                            class="w-full p-3 text-left bg-gray-50 hover:bg-pink-50 border border-gray-200 hover:border-pink-300 rounded-lg transition flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center text-white font-bold">
                                ${(k.name || '?').charAt(0).toUpperCase()}
                            </div>
                            <span class="font-semibold text-gray-800">${k.name}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="p-4 bg-gray-100 rounded-b-2xl">
                <button onclick="document.getElementById('addPersonModal').style.display='none'" 
                    class="w-full px-4 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                    Abbrechen
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
};

window.addPersonToThema = async function(kontaktId) {
    const kontakt = KONTAKTE[kontaktId];
    if (!kontakt) return;
    
    try {
        const thema = THEMEN[currentThemaId];
        const personen = thema.personen || [];
        if (!personen.includes(kontaktId)) {
            personen.push(kontaktId);
            
            const themaDocRef = doc(geschenkeThemenRef, currentThemaId);
            
            await updateDoc(themaDocRef, { personen });
            THEMEN[currentThemaId].personen = personen;
            personenDetailsAusgeklappt = true;
            renderPersonenUebersicht();
            alertUser(`${kontakt.name} wurde hinzugefügt!`, 'success');
        }
        document.getElementById('addPersonModal').style.display = 'none';
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// KONTAKT-MANAGEMENT
// ========================================

window.deleteKontakt = async function(id) {
    if (!confirm('Kontakt wirklich löschen?')) return;
    try {
        await deleteDoc(doc(geschenkeKontakteRef, id));
        alertUser('Kontakt gelöscht!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// GESCHENK-LÖSCHEN (mit Erinnerungen)
// ========================================

window.deleteGeschenk = async function(geschenkId) {
    if (!confirm('Geschenk und alle zugehörigen Erinnerungen wirklich löschen?')) return;
    
    try {
        console.log(`🗑️ Lösche Geschenk ${geschenkId}...`);
        
        // ✅ SCHRITT 1: Erinnerungen löschen (die zu diesem Geschenk gehören)
        const erinnerungenToDelete = Object.values(ERINNERUNGEN).filter(e => 
            e.geschenkId === geschenkId
        );
        console.log(`  🔔 Gefunden: ${erinnerungenToDelete.length} Erinnerungen`);
        
        const erinnerungenDeletePromises = erinnerungenToDelete.map(erinnerung => 
            deleteDoc(doc(geschenkeErinnerungenRef, erinnerung.id))
        );
        await Promise.all(erinnerungenDeletePromises);
        console.log(`  ✅ ${erinnerungenToDelete.length} Erinnerungen gelöscht`);
        
        // ✅ SCHRITT 2: Geschenk selbst löschen
        await deleteDoc(doc(geschenkeCollection, geschenkId));
        console.log(`  ✅ Geschenk gelöscht`);
        
        alertUser('Geschenk und zugehörige Erinnerungen wurden gelöscht!', 'success');
        closeGeschenkModal();
    } catch (e) {
        console.error("❌ Fehler beim Löschen des Geschenks:", e);
        alertUser('Fehler beim Löschen: ' + e.message, 'error');
    }
};

// ========================================
// VORLAGEN-SYSTEM (Kopieren, Speichern, Laden)
// ========================================

// ✅ HELPER: Checkboxen mit Werten befüllen
function fillCheckboxes(fieldName, values) {
    const checkboxes = document.querySelectorAll(`input[name="${fieldName}"]`);
    checkboxes.forEach(cb => {
        cb.checked = values.includes(cb.value);
    });
}

window.copyGeschenk = function(geschenkId) {
    const geschenk = GESCHENKE[geschenkId];
    if (!geschenk) {
        alertUser('Geschenk nicht gefunden!', 'error');
        return;
    }
    
    // ✅ Modal bleibt offen, ALLE Felder werden mit Kopie-Daten befüllt
    // ID leeren (neues Geschenk)
    document.getElementById('gm-id').value = '';
    
    // ✅ ALLE Felder mit Daten befüllen (OHNE "(Kopie)" Zusatz)
    document.getElementById('gm-geschenk').value = geschenk.geschenk || '';
    document.getElementById('gm-status').value = geschenk.status || 'offen';
    document.getElementById('gm-shop').value = geschenk.shop || '';
    document.getElementById('gm-bestellnummer').value = geschenk.bestellnummer || '';
    document.getElementById('gm-rechnungsnummer').value = geschenk.rechnungsnummer || '';
    document.getElementById('gm-gesamtkosten').value = geschenk.gesamtkosten || '';
    document.getElementById('gm-eigene-kosten').value = geschenk.eigeneKosten || '';
    document.getElementById('gm-soll-bezahlung').value = geschenk.sollBezahlung || '';
    document.getElementById('gm-ist-bezahlung').value = geschenk.istBezahlung || '';
    document.getElementById('gm-standort').value = geschenk.standort || '';
    document.getElementById('gm-notizen').value = geschenk.notizen || '';
    document.getElementById('gm-bezahlt-von').value = geschenk.bezahltVon || '';
    
    // ✅ Checkboxen befüllen (FÜR, VON, Beteiligung)
    fillCheckboxes('gm-fuer', geschenk.fuer || []);
    fillCheckboxes('gm-von', geschenk.von || []);
    fillCheckboxes('gm-beteiligung', geschenk.beteiligung || []);
    
    // ✅ Modal-Titel ändern + Markante Warnung
    document.getElementById('geschenkModalTitle').innerHTML = `
        <div>
            <span class="text-xl font-bold">📋 Kopie wird bearbeitet</span>
            <span class="block text-sm font-normal bg-yellow-400 text-yellow-900 px-3 py-1 rounded mt-1 animate-pulse">
                ⚠️ Dies ist eine Kopie! Bei Speichern wird ein neues Geschenk erstellt.
            </span>
        </div>
    `;
    
    // ✅ Aktions-Buttons ausblenden (da wir jetzt eine Kopie bearbeiten)
    const actionsContainer = document.getElementById('gm-modal-actions');
    const vorlageButton = document.getElementById('gm-btn-vorlage-laden');
    if (actionsContainer) actionsContainer.style.display = 'none';
    if (vorlageButton) vorlageButton.style.display = 'none';
    
    alertUser('Geschenk vollständig kopiert! Bearbeite die Kopie und speichere sie.', 'info');
};

window.saveAsVorlage = async function(geschenkId) {
    const geschenk = GESCHENKE[geschenkId];
    if (!geschenk) {
        alertUser('Geschenk nicht gefunden!', 'error');
        return;
    }
    
    const vorlageName = prompt('Name für die Vorlage:', geschenk.geschenk);
    if (!vorlageName || vorlageName.trim() === '') return;
    
    try {
        // ✅ Vorlage speichern mit ALLEN Feldern
        const vorlageData = {
            name: vorlageName.trim(),
            geschenk: geschenk.geschenk,
            status: geschenk.status || 'offen',
            fuer: geschenk.fuer || [],
            von: geschenk.von || [],
            beteiligung: geschenk.beteiligung || [],
            bezahltVon: geschenk.bezahltVon || '',
            shop: geschenk.shop || '',
            bestellnummer: geschenk.bestellnummer || '',
            rechnungsnummer: geschenk.rechnungsnummer || '',
            gesamtkosten: geschenk.gesamtkosten || 0,
            eigeneKosten: geschenk.eigeneKosten || 0,
            sollBezahlung: geschenk.sollBezahlung || '',
            istBezahlung: geschenk.istBezahlung || '',
            standort: geschenk.standort || '',
            notizen: geschenk.notizen || '',
            erstelltAm: serverTimestamp(),
            erstelltVon: currentUser.displayName
        };
        
        await addDoc(geschenkeVorlagenRef, vorlageData);
        alertUser('Vorlage mit allen Daten gespeichert!', 'success');
    } catch (e) {
        console.error("❌ Fehler beim Speichern der Vorlage:", e);
        alertUser('Fehler beim Speichern: ' + e.message, 'error');
    }
};

window.openVorlagenModal = function() {
    const vorlagenArray = Object.values(VORLAGEN);
    
    if (vorlagenArray.length === 0) {
        alertUser('Keine Vorlagen vorhanden. Erstelle zuerst eine Vorlage!', 'info');
        return;
    }
    
    // Modal erstellen
    const modal = document.createElement('div');
    modal.id = 'vorlagenModal';
    modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div class="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
                <h3 class="text-xl font-bold">📑 Vorlage auswählen</h3>
                <button onclick="document.getElementById('vorlagenModal').remove()" class="text-white/80 hover:text-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div class="p-6 space-y-3">
                ${vorlagenArray.map(v => `
                    <div class="border-2 border-gray-200 rounded-lg p-4 hover:border-purple-500 transition cursor-pointer"
                         onclick="window.loadVorlage('${v.id}')">
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <p class="font-bold text-gray-800 text-lg">${v.name}</p>
                                <p class="text-sm text-gray-600 mt-1">${v.geschenk}</p>
                                ${v.shop ? `<p class="text-xs text-gray-500 mt-1">🏪 ${v.shop}</p>` : ''}
                                ${v.gesamtkosten ? `<p class="text-xs text-gray-500 mt-1">💰 ${formatCurrency(v.gesamtkosten)}</p>` : ''}
                            </div>
                            <button onclick="event.stopPropagation(); window.deleteVorlage('${v.id}')" 
                                    class="text-red-500 hover:text-red-700 p-2" title="Vorlage löschen">
                                🗑️
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
};

window.loadVorlage = function(vorlageId) {
    const vorlage = VORLAGEN[vorlageId];
    if (!vorlage) {
        alertUser('Vorlage nicht gefunden!', 'error');
        return;
    }
    
    // ✅ ALLE Felder aus Vorlage befüllen
    document.getElementById('gm-geschenk').value = vorlage.geschenk || '';
    document.getElementById('gm-status').value = vorlage.status || 'offen';
    document.getElementById('gm-shop').value = vorlage.shop || '';
    document.getElementById('gm-bestellnummer').value = vorlage.bestellnummer || '';
    document.getElementById('gm-rechnungsnummer').value = vorlage.rechnungsnummer || '';
    document.getElementById('gm-gesamtkosten').value = vorlage.gesamtkosten || '';
    document.getElementById('gm-eigene-kosten').value = vorlage.eigeneKosten || '';
    document.getElementById('gm-soll-bezahlung').value = vorlage.sollBezahlung || '';
    document.getElementById('gm-ist-bezahlung').value = vorlage.istBezahlung || '';
    document.getElementById('gm-standort').value = vorlage.standort || '';
    document.getElementById('gm-notizen').value = vorlage.notizen || '';
    document.getElementById('gm-bezahlt-von').value = vorlage.bezahltVon || '';
    
    // ✅ Checkboxen befüllen
    fillCheckboxes('gm-fuer', vorlage.fuer || []);
    fillCheckboxes('gm-von', vorlage.von || []);
    fillCheckboxes('gm-beteiligung', vorlage.beteiligung || []);
    
    // Modal schließen
    document.getElementById('vorlagenModal')?.remove();
    
    alertUser('Vorlage vollständig geladen! Prüfe die Daten und speichere.', 'success');
};

window.deleteVorlage = async function(vorlageId) {
    if (!confirm('Vorlage wirklich löschen?')) return;
    
    try {
        await deleteDoc(doc(geschenkeVorlagenRef, vorlageId));
        alertUser('Vorlage gelöscht!', 'success');
        
        // Modal neu rendern wenn noch offen
        if (document.getElementById('vorlagenModal')) {
            document.getElementById('vorlagenModal').remove();
            
            // Wenn noch Vorlagen vorhanden, Modal neu öffnen
            if (Object.keys(VORLAGEN).length > 0) {
                setTimeout(() => window.openVorlagenModal(), 100);
            }
        }
    } catch (e) {
        console.error("❌ Fehler beim Löschen der Vorlage:", e);
        alertUser('Fehler beim Löschen: ' + e.message, 'error');
    }
};

window.editKontakt = async function(id) {
    const kontakt = KONTAKTE[id];
    if (!kontakt) return;
    
    const newName = prompt('Neuer Name für den Kontakt:', kontakt.name);
    if (!newName || newName.trim() === '' || newName === kontakt.name) return;
    
    try {
        await updateDoc(doc(geschenkeKontakteRef, id), { name: newName.trim() });
        alertUser('Kontakt aktualisiert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// THEMEN-MANAGEMENT
// ========================================

window.editThema = function(id) {
    const thema = THEMEN[id];
    const newName = prompt('Neuer Name für das Thema:', thema.name);
    if (newName && newName !== thema.name) {
        const themaDocRef = doc(geschenkeThemenRef, id);
        
        updateDoc(themaDocRef, { name: newName }).then(() => {
            alertUser('Thema umbenannt!', 'success');
        }).catch(e => {
            alertUser('Fehler: ' + e.message, 'error');
        });
    }
};

window.toggleArchiveThema = async function(id) {
    const thema = THEMEN[id];
    try {
        const themaDocRef = doc(geschenkeThemenRef, id);
        
        await updateDoc(themaDocRef, { archiviert: !thema.archiviert });
        alertUser(thema.archiviert ? 'Thema wiederhergestellt!' : 'Thema archiviert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.deleteThema = async function(id) {
    if (!confirm('Thema und alle zugehörigen Daten wirklich löschen?')) return;
    
    try {
        console.log(`🗑️ Starte Löschvorgang für Thema ${id}...`);
        
        // ✅ SCHRITT 1: Geschenke löschen (Subcollection)
        // Geschenke befinden sich in: users/{userId}/geschenke_themen/{themaId}/geschenke/
        const ownerUserId = currentUser.mode;
        const geschenkeInThemaRef = collection(db, 'artifacts', appId, 'public', 'data', 'users', ownerUserId, 'geschenke_themen', id, 'geschenke');
        
        const geschenkeSnapshot = await getDocs(geschenkeInThemaRef);
        console.log(`  📦 Gefunden: ${geschenkeSnapshot.size} Geschenke`);
        
        // Sammle alle Geschenk-IDs für Erinnerungen-Löschung
        const geschenkIds = [];
        const geschenkDeletePromises = [];
        
        geschenkeSnapshot.forEach((geschenkDoc) => {
            geschenkIds.push(geschenkDoc.id);
            geschenkDeletePromises.push(deleteDoc(doc(geschenkeInThemaRef, geschenkDoc.id)));
        });
        
        await Promise.all(geschenkDeletePromises);
        console.log(`  ✅ ${geschenkeSnapshot.size} Geschenke gelöscht`);
        
        // ✅ SCHRITT 2: Budgets löschen (die zu diesem Thema gehören)
        const budgetsToDelete = Object.values(BUDGETS).filter(b => b.themaId === id);
        console.log(`  💰 Gefunden: ${budgetsToDelete.length} Budgets`);
        
        const budgetDeletePromises = budgetsToDelete.map(budget => 
            deleteDoc(doc(geschenkeBudgetsRef, budget.id))
        );
        await Promise.all(budgetDeletePromises);
        console.log(`  ✅ ${budgetsToDelete.length} Budgets gelöscht`);
        
        // ✅ SCHRITT 3: Erinnerungen löschen (die zu Geschenken dieses Themas gehören)
        const erinnerungenToDelete = Object.values(ERINNERUNGEN).filter(e => 
            e.geschenkId && geschenkIds.includes(e.geschenkId)
        );
        console.log(`  🔔 Gefunden: ${erinnerungenToDelete.length} Erinnerungen`);
        
        const erinnerungenDeletePromises = erinnerungenToDelete.map(erinnerung => 
            deleteDoc(doc(geschenkeErinnerungenRef, erinnerung.id))
        );
        await Promise.all(erinnerungenDeletePromises);
        console.log(`  ✅ ${erinnerungenToDelete.length} Erinnerungen gelöscht`);
        
        // ✅ SCHRITT 4: Thema selbst löschen
        const themaDocRef = doc(geschenkeThemenRef, id);
        await deleteDoc(themaDocRef);
        console.log(`  ✅ Thema-Dokument gelöscht`);
        
        // ✅ SCHRITT 5: Wenn das gelöschte Thema das aktuelle war → zurücksetzen
        if (currentThemaId === id) {
            currentThemaId = null;
            localStorage.removeItem('gm_current_thema');
            geschenkeCollection = null;
            GESCHENKE = {};
            
            console.log(`  ℹ️ Aktuelles Thema wurde gelöscht → zurückgesetzt`);
            
            // UI sofort aktualisieren
            renderDashboard();
        }
        
        console.log(`✅ KOMPLETT: Thema ${id} und alle zugehörigen Daten wurden gelöscht!`);
        alertUser('Thema und alle zugehörigen Daten wurden gelöscht!', 'success');
    } catch (e) {
        console.error("❌ Fehler beim Löschen des Themas:", e);
        alertUser('Fehler beim Löschen: ' + e.message, 'error');
    }
};

window.createNewThema = async function() {
    const name = prompt('Name des neuen Themas (z.B. "Weihnachten 2025"):');
    if (!name) return;
    
    try {
        const themaData = {
            name: name.trim(),
            ersteller: currentUser.displayName || 'Unbekannt',
            besitzerUserId: currentUser.mode,
            erstelltAm: serverTimestamp(),
            personen: [],
            archiviert: false,
            istEigenes: true
        };
        
        const docRef = await addDoc(geschenkeThemenRef, themaData);
        currentThemaId = docRef.id;
        localStorage.setItem('gm_current_thema', currentThemaId);
        
        console.log(`✅ Neues Thema erstellt: ${docRef.id} - "${name}"`);
        
        // ✅ WICHTIG: UI sofort aktualisieren!
        // Der Listener wird das Thema in THEMEN einfügen, aber wir müssen die Collection und UI aktivieren
        updateCollectionForThema();  // Geschenke-Collection aktivieren
        renderDashboard();            // Dashboard mit neuem Thema aktualisieren
        
        alertUser('Thema erstellt!', 'success');
    } catch (e) {
        console.error("❌ Fehler beim Erstellen des Themas:", e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ========================================
// EXPORT FÜR STARTSEITEN-BENACHRICHTIGUNG
// ========================================
export { ERINNERUNGEN };
