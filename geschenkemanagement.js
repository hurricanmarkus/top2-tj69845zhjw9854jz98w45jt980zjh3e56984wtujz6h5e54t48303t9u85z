// @ts-check
// ========================================
// GESCHENKEMANAGEMENT SYSTEM
// Professionelle Geschenkeverwaltung für alle Anlässe
// Mit Themen-System, Kontaktbuch und Freigabemanagement
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

// ✅ HELPER: Hole aktuelle User-ID (Firebase Auth UID)
function getCurrentUserId() {
    return auth?.currentUser?.uid || currentUser?.uid;
}

// ✅ GLOBAL: Mapping von User-Namen zu Firebase Auth UIDs
let userNameToUidMapping = {};

// ✅ HELPER: Erstelle Mapping basierend auf eingeloggten Usern
// Da user-config Document-IDs NICHT die Firebase Auth UIDs sind,
// müssen wir das Mapping anders erstellen
async function loadUserUidMapping() {
    try {
        console.log("🔄 Lade User-UID-Mapping...");
        
        // Durchsuche USERS und versuche, die Firebase Auth UIDs zu finden
        // Für den aktuell eingeloggten User kennen wir die UID
        userNameToUidMapping = {};
        
        // Füge aktuellen User hinzu
        if (currentUser?.displayName && auth?.currentUser?.uid) {
            userNameToUidMapping[currentUser.displayName] = auth.currentUser.uid;
            console.log(`  ✅ ${currentUser.displayName} → ${auth.currentUser.uid} (aktueller User)`);
        }
        
        // ⚠️ PROBLEM: Wir kennen die Firebase Auth UIDs der ANDEREN User nicht!
        // LÖSUNG: Verwende einen alternativen Ansatz mit Namen statt UIDs
        
        console.log("⚠️ WARNUNG: Nur aktueller User im Mapping verfügbar");
        console.log("💡 LÖSUNG: Verwende Namen-basiertes Matching für Einladungen");
        
        return userNameToUidMapping;
    } catch (e) {
        console.error('❌ Fehler beim Laden des User-UID-Mappings:', e);
        return {};
    }
}

// ✅ HELPER: Finde Firebase Auth UID für einen User aus USERS
async function getUserFirebaseUid(userDocId) {
    try {
        const user = USERS[userDocId];
        if (!user) {
            console.error(`❌ User ${userDocId} nicht in USERS gefunden`);
            return null;
        }
        
        const userName = user.name || user.displayName;
        console.log(`🔍 Suche Firebase Auth UID für: ${userName} (Doc ID: ${userDocId})`);
        
        // Prüfe ob es bereits im Cache ist
        if (user._firebaseUid) {
            console.log(`  ✅ Aus Cache: ${user._firebaseUid}`);
            return user._firebaseUid;
        }
        
        // Prüfe Mapping
        if (userNameToUidMapping[userName]) {
            const uid = userNameToUidMapping[userName];
            console.log(`  ✅ Aus Mapping: ${uid}`);
            // Cache it
            user._firebaseUid = uid;
            return uid;
        }
        
        // Fallback: Lade Mapping neu
        console.log(`  ⚠️ UID nicht im Mapping gefunden, lade neu...`);
        await loadUserUidMapping();
        
        if (userNameToUidMapping[userName]) {
            const uid = userNameToUidMapping[userName];
            console.log(`  ✅ Nach Neu-Laden gefunden: ${uid}`);
            user._firebaseUid = uid;
            return uid;
        }
        
        console.error(`  ❌ Firebase Auth UID nicht gefunden für ${userName}`);
        console.error(`  📋 Verfügbare Mappings:`, Object.keys(userNameToUidMapping));
        return null;
    } catch (e) {
        console.error('❌ Fehler beim Laden der Firebase Auth UID:', e);
        return null;
    }
}

let geschenkeCollection = null;
let geschenkeSettingsRef = null;
let geschenkeThemenRef = null;
let geschenkeKontakteRef = null;
let geschenkeVorlagenRef = null;
let geschenkeFreigabenRef = null;
let geschenkeEinladungenRef = null;
let geschenkeBudgetsRef = null;
let geschenkeErinnerungenRef = null;

let GESCHENKE = {};
let THEMEN = {};
let KONTAKTE = {};
let VORLAGEN = {};
let FREIGABEN = {};
let EINLADUNGEN = {};
let BUDGETS = {};
let ERINNERUNGEN = {};
let currentThemaId = null;
let searchTerm = '';
let currentFilter = {};
let personenDetailsAusgeklappt = false; // ✅ State für Personen-Übersicht
let freigabenCounter = 0; // ✅ Zähler für Freigabe-IDs

// Einladungs-Status
const EINLADUNG_STATUS = {
    pending: { label: 'Ausstehend', color: 'bg-yellow-100 text-yellow-800', icon: '⏳' },
    accepted: { label: 'Angenommen', color: 'bg-green-100 text-green-800', icon: '✅' },
    declined: { label: 'Abgelehnt', color: 'bg-red-100 text-red-800', icon: '❌' },
    blocked: { label: 'Blockiert', color: 'bg-gray-100 text-gray-800', icon: '🚫' }
};

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
    geschenkeFreigabenRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_freigaben');
    geschenkeEinladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_einladungen');
    geschenkeBudgetsRef = collection(db, ...userDataPath, 'geschenke_budgets');
    geschenkeErinnerungenRef = collection(db, ...userDataPath, 'geschenke_erinnerungen');
    
    console.log("✅ Collection-Referenzen erstellt (USER-SPEZIFISCH)");
    console.log("✅ Pfad: users/", appUserId, "/geschenke_*");
    
    try {
        await loadSettings();
        
        // ✅ NEU: Lade User-UID-Mapping für Einladungen
        await loadUserUidMapping();
        
        // ✅ Starte ALLE Echtzeit-Listener (laden automatisch die Daten + Live-Updates!)
        listenForKontakte();      // 👥 Kontakte
        listenForThemen();        // 📂 Themen
        listenForVorlagen();      // 📑 Vorlagen
        listenForBudgets();       // 💰 Budgets
        listenForErinnerungen();  // 🔔 Erinnerungen
        listenForFreigaben();     // 🔐 Freigaben
        listenForEinladungen();   // 📨 Einladungen
        
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
    
    console.log("🎧 Themen-Listener gestartet (eigene Themen)");
    
    // 1️⃣ Eigene Themen
    onSnapshot(geschenkeThemenRef, (snapshot) => {
        console.log(`📂 Eigene Themen: ${snapshot.size} Dokumente`);
        
        const oldThemaId = currentThemaId;
        THEMEN = {};
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            THEMEN[docSnap.id] = { 
                id: docSnap.id, 
                ...data,
                istEigenes: true,
                istGeteilt: false,
                besitzerUserId: currentUser.mode
            };
        });
        
        // 2️⃣ Geteilte Themen laden (via Freigaben)
        loadSharedThemen();
        
        console.log("✅ Themen geladen:", Object.keys(THEMEN).length);
        
        // Gespeichertes Thema wiederherstellen oder erstes Thema wählen
        const savedThemaId = localStorage.getItem('gm_current_thema');
        if (savedThemaId && THEMEN[savedThemaId]) {
            currentThemaId = savedThemaId;
        } else if (Object.keys(THEMEN).length > 0) {
            currentThemaId = Object.keys(THEMEN)[0];
        } else {
            currentThemaId = null;
        }
        
        // UI aktualisieren
        renderThemenDropdown();
        
        // Wenn Thema gewechselt wurde oder zum ersten Mal gesetzt
        if (currentThemaId && currentThemaId !== oldThemaId) {
            updateCollectionForThema();
        }
        
        // Themen-Verwaltung aktualisieren falls offen
        if (document.getElementById('gm-themen-list')) {
            renderThemenVerwaltung();
        }
    }, (error) => {
        console.error("Fehler beim Laden der Themen:", error);
    });
}

// ✅ Geteilte Themen laden (von anderen Usern via Freigaben)
async function loadSharedThemen() {
    const myAppUserId = currentUser?.mode;
    if (!myAppUserId) return;
    
    console.log("🔍 Prüfe geteilte Themen für User:", myAppUserId);
    
    // Finde alle aktiven Freigaben für mich
    for (const freigabeId in FREIGABEN) {
        const freigabe = FREIGABEN[freigabeId];
        
        // Nur aktive Freigaben, die für mich sind
        if (!freigabe.aktiv || freigabe.userId !== myAppUserId) continue;
        
        try {
            const ownerUserId = freigabe.besitzerId;  // App User ID des Besitzers
            const themaId = freigabe.themaId;
            
            console.log(`  📖 Lade geteiltes Thema von ${ownerUserId}`);
            
            // Lade Thema vom Besitzer
            const themaRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', ownerUserId, 'geschenke_themen', themaId);
            const themaSnap = await getDoc(themaRef);
            
            if (themaSnap.exists()) {
                THEMEN[themaSnap.id] = {
                    id: themaSnap.id,
                    ...themaSnap.data(),
                    istEigenes: false,
                    istGeteilt: true,
                    besitzerUserId: ownerUserId,
                    besitzerName: freigabe.freigegebenVonName,
                    freigabe: freigabe
                };
                console.log(`  ✅ Geteiltes Thema: "${themaSnap.data().name}"`);
            }
        } catch (e) {
            console.error(`  ❌ Fehler beim Laden:`, e);
        }
    }
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
    });
}

// ❌ VERALTET: Wird durch listenForVorlagen() ersetzt
async function loadVorlagen() {
    console.warn("⚠️ loadVorlagen() ist veraltet, verwende listenForVorlagen()");
    // Funktion bleibt leer, da Listener aktiv ist
}

// 🎧 NEUER Freigaben-Listener
function listenForFreigaben() {
    if (!geschenkeFreigabenRef) {
        console.error("❌ Freigaben-Ref fehlt");
        return;
    }
    
    console.log("🎧 NEU: Freigaben-Listener gestartet");
    
    onSnapshot(geschenkeFreigabenRef, (snapshot) => {
        console.log(`📦 Freigaben: ${snapshot.size} Dokumente`);
        
        // Cache leeren und neu füllen
        FREIGABEN = {};
        snapshot.forEach(doc => {
            FREIGABEN[doc.id] = { id: doc.id, ...doc.data() };
        });
        
        console.log("✅ Freigaben geladen:", Object.keys(FREIGABEN).length);
        
        // ✅ Geteilte Themen neu laden wenn Freigaben sich ändern
        loadSharedThemen();
        
        // UI aktualisieren
        if (document.getElementById('gm-freigaben-list')) {
            renderShareSettings();
        }
    });
}

// ✅ Legacy-Funktion für Kompatibilität
async function loadFreigaben() {
    console.warn("⚠️ loadFreigaben() ist veraltet, verwende listenForFreigaben()");
    try {
        const snapshot = await getDocs(geschenkeFreigabenRef);
        FREIGABEN = {};
        snapshot.forEach((docSnap) => {
            FREIGABEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
    } catch (e) {
        console.error("Fehler beim Laden der Freigaben:", e);
    }
}

function updateCollectionForThema() {
    if (currentThemaId && db && currentUser?.mode) {
        const thema = THEMEN[currentThemaId];
        
        // ✅ KORRIGIERT: Verwende Owner-User-ID (auch bei geteilten Themen!)
        let ownerUserId;
        
        if (thema?.istGeteilt) {
            // Geteiltes Thema: verwende besitzerUserId vom Owner
            ownerUserId = thema.besitzerUserId;
            console.log("📖 Geteiltes Thema von:", ownerUserId);
        } else {
            // Eigenes Thema: verwende eigene User-ID
            ownerUserId = currentUser.mode;
            console.log("📂 Eigenes Thema");
        }
        
        if (!ownerUserId) {
            console.error("❌ FEHLER: Owner User ID nicht gefunden!");
            return;
        }
        
        // Geschenke werden als Subcollection unter dem User-Thema gespeichert
        geschenkeCollection = collection(db, 'artifacts', appId, 'public', 'data', 'users', ownerUserId, 'geschenke_themen', currentThemaId, 'geschenke');
        
        console.log("📦 updateCollectionForThema - Owner:", ownerUserId, "Thema:", currentThemaId);
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
        GESCHENKE = {};
        snapshot.forEach((docSnap) => {
            // WICHTIG: Füge themaId zum Geschenk hinzu (für Freigabe-Filterung)
            GESCHENKE[docSnap.id] = { 
                id: docSnap.id, 
                themaId: currentThemaId,  // ✅ ThemaId hinzugefügt!
                ...docSnap.data() 
            };
        });
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
    
    if (activeThemen.length === 0) {
        dropdown.innerHTML = '<option value="">Kein Thema vorhanden</option>';
        
        // ✅ NEU: Zeige hilfreiche Nachricht wenn keine Themen vorhanden
        const myName = currentUser?.displayName;
        const pendingInvitations = Object.values(EINLADUNGEN).filter(e => 
            e.empfaengerName === myName && e.status === 'pending'
        );
        
        // Zeige Info-Box
        const container = document.getElementById('gm-personen-uebersicht');
        if (container) {
            if (pendingInvitations.length > 0) {
                container.innerHTML = `
                    <div class="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-300 rounded-xl p-6 text-center">
                        <div class="text-6xl mb-4">📨</div>
                        <h3 class="text-2xl font-bold text-gray-800 mb-2">Du hast ${pendingInvitations.length} Einladung${pendingInvitations.length !== 1 ? 'en' : ''}!</h3>
                        <p class="text-gray-600 mb-4">Andere Benutzer haben Themen mit dir geteilt.</p>
                        <button onclick="window.showAllPendingInvitations()" 
                            class="px-6 py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white font-bold rounded-lg hover:shadow-lg transition text-lg">
                            📧 Einladungen anzeigen
                        </button>
                    </div>
                `;
            } else {
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
        }
    } else {
        // ✅ Themen anzeigen (alle zentral gespeichert)
        dropdown.innerHTML = activeThemen.map(thema => {
            return `<option value="${thema.id}" ${thema.id === currentThemaId ? 'selected' : ''}>${thema.name}</option>`;
        }).join('');
        
        // ✅ Setze Dropdown-Style für bessere Sichtbarkeit
        dropdown.className = 'p-3 border-2 border-gray-300 rounded-lg font-semibold text-lg bg-white';
    }
}

function renderDashboard() {
    // ✅ NEU: Badge für Einladungen aktualisieren
    const myName = currentUser?.displayName;
    const pendingCount = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerName === myName && e.status === 'pending'
    ).length;
    updateInvitationBadge(pendingCount);
    
    // ✅ NEU: Blinkender Button für offene Einladungen AM DASHBOARD
    showPendingInvitationsAlert(pendingCount);
    
    renderThemenDropdown();
    renderPersonenUebersicht();
    renderGeschenkeTabelle();
    updateDashboardStats();
}

// ✅ NEU: Blinkender Alert-Button für offene Einladungen
function showPendingInvitationsAlert(count) {
    // Finde oder erstelle Container für Einladungs-Alert
    let alertContainer = document.getElementById('gm-einladungen-alert');
    
    if (!alertContainer) {
        // Erstelle Container direkt unter dem Header (vor Personen-Übersicht)
        const personenContainer = document.getElementById('gm-personen-uebersicht');
        if (personenContainer) {
            alertContainer = document.createElement('div');
            alertContainer.id = 'gm-einladungen-alert';
            personenContainer.parentNode.insertBefore(alertContainer, personenContainer);
        }
    }
    
    if (!alertContainer) return;
    
    if (count > 0) {
        alertContainer.innerHTML = `
            <div class="mb-4 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 p-4 rounded-2xl shadow-2xl animate-pulse border-4 border-white">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="text-6xl animate-bounce">📨</div>
                        <div>
                            <h3 class="text-2xl font-bold text-white drop-shadow-lg">
                                ${count} Offene Einladung${count > 1 ? 'en' : ''}!
                            </h3>
                            <p class="text-white text-sm">Klicke hier, um sie anzusehen</p>
                        </div>
                    </div>
                    <button onclick="showInvitationsModal()" 
                        class="px-8 py-4 bg-white text-red-600 font-bold rounded-xl hover:bg-red-50 transition text-lg shadow-xl hover:scale-105 transform">
                        🎁 Jetzt ansehen
                    </button>
                </div>
            </div>
        `;
    } else {
        alertContainer.innerHTML = '';
    }
}

// ✅ NEU: Zeige Badge für ausstehende Einladungen
// ✅ ENTFERNT - Ersetzt durch updateInvitationBadge() im neuen System

// ✅ Modal schließen (Badge bleibt sichtbar)
window.closeEinladungenModalAndRemind = function() {
    document.getElementById('gm-einladungen-modal')?.remove();
    // Badge bleibt durch updateInvitationBadge() sichtbar
    alertUser('💡 Der Button "Offene Antwort auf Einladung" bleibt oben sichtbar!', 'info');
};

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

// ✅ NEU: Zeige alle ausstehenden Einladungen manuell
window.showAllPendingInvitations = function() {
    const myName = currentUser?.displayName;
    const pendingInvitations = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerName === myName && e.status === 'pending'
    );
    
    console.log(`🔍 Suche Einladungen für: ${myName}`);
    console.log(`📨 Gefunden: ${pendingInvitations.length} Einladungen`);
    
    if (pendingInvitations.length > 0) {
        showPendingInvitationsModal(pendingInvitations);
    } else {
        alertUser('Du hast keine ausstehenden Einladungen.', 'info');
    }
};

// ✅ DIAGNOSE-TOOL: Zeige User-UID-Mapping (für Entwicklung)
window.diagnoseGeschenkeSystem = function() {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 GESCHENKEMANAGEMENT DIAGNOSE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    
    console.log("👤 AKTUELLER USER:");
    console.log("  Name:", currentUser?.displayName);
    console.log("  Firebase Auth UID:", auth?.currentUser?.uid);
    console.log("  getCurrentUserId():", getCurrentUserId());
    console.log("");
    
    console.log("📋 USERS OBJEKT:");
    Object.entries(USERS).forEach(([id, user]) => {
        console.log(`  ${user.name}:`, {
            firestoreDocId: id,
            firebaseUid: user._firebaseUid || '❌ nicht gecached',
            permissionType: user.permissionType
        });
    });
    console.log("");
    
    console.log("🗺️ USER-UID-MAPPING:");
    Object.entries(userNameToUidMapping).forEach(([name, uid]) => {
        console.log(`  ${name} → ${uid}`);
    });
    console.log("");
    
    console.log("📨 EINLADUNGEN:");
    Object.entries(EINLADUNGEN).forEach(([id, inv]) => {
        console.log(`  ${inv.themaName}:`, {
            absender: inv.absenderName,
            empfaenger: inv.empfaengerName,
            empfaengerId: inv.empfaengerId,
            empfaengerUid: inv.empfaengerUid,
            status: inv.status
        });
    });
    console.log("");
    
    console.log("🔐 FREIGABEN:");
    Object.entries(FREIGABEN).forEach(([id, f]) => {
        console.log(`  ${f.themaName}:`, {
            user: f.userName,
            userId: f.userId,
            userUid: f.userUid,
            aktiv: f.aktiv
        });
    });
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💡 TIPPs:");
    console.log("  - Alle User müssen in user-config existieren");
    console.log("  - empfaengerUid muss mit Firebase Auth UID übereinstimmen");
    console.log("  - Wenn Mapping leer ist: loadUserUidMapping() aufrufen");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    return {
        currentUser: {
            name: currentUser?.displayName,
            uid: getCurrentUserId()
        },
        users: USERS,
        mapping: userNameToUidMapping,
        einladungen: EINLADUNGEN,
        freigaben: FREIGABEN
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
        
        // ✅ Farben basierend auf Status
        const statusConfig = {
            offen: { color: 'border-red-500', bg: 'bg-red-50', label: 'Offen', icon: '🔴' },
            teilweise: { color: 'border-yellow-500', bg: 'bg-yellow-50', label: 'Teilweise', icon: '🟡' },
            abgeschlossen: { color: 'border-green-500', bg: 'bg-green-50', label: 'Abgeschlossen', icon: '🟢' }
        };
        const cfg = statusConfig[pStatus] || statusConfig.offen;
        
        html += `
            <div class="bg-white rounded-xl shadow-md p-4 border-l-4 ${cfg.color} hover:shadow-lg transition cursor-pointer ${cfg.bg}" 
                 onclick="window.openPersonModal('${p.id}')">
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
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
    // Freigaben rendern
    renderFreigabenVerwaltung();
    // Optionen rendern
    renderOptionenVerwaltung();
}

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
// NEUES FREIGABEMANAGEMENT-SYSTEM
// ========================================

// ═══════════════════════════════════════════════════════════════
// 🆕 NEUES FREIGABE-SYSTEM - KOMPLETT NEU AUFGEBAUT
// ═══════════════════════════════════════════════════════════════

// Hauptfunktion die von der UI aufgerufen wird
function renderFreigabenVerwaltung() {
    renderShareSettings();
}

// ═════════════════════════════════════════════════════════
// RENDER-FUNKTION
// ═════════════════════════════════════════════════════════

function renderShareSettings() {
    const container = document.getElementById('gm-freigaben-list');
    if (!container) return;
    
    const myName = currentUser?.displayName;
    
    // Meine Freigaben (die ICH erhalten habe)
    const receivedShares = Object.values(FREIGABEN).filter(f => 
        f.userName === myName && f.aktiv
    );
    
    // Von mir geteilte Freigaben
    const givenShares = Object.values(FREIGABEN).filter(f => 
        f.freigegebenVonName === myName && f.aktiv
    );
    
    // Meine Einladungen (empfangen)
    const receivedInvitations = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerName === myName
    );
    
    // Von mir gesendete Einladungen
    const sentInvitations = Object.values(EINLADUNGEN).filter(e => 
        e.absenderName === myName
    );
    
    console.log("📊 Freigaben-Übersicht:", {
        receivedShares: receivedShares.length,
        givenShares: givenShares.length,
        receivedInvitations: receivedInvitations.length,
        sentInvitations: sentInvitations.length
    });
    
    container.innerHTML = `
        <div class="space-y-6">
            <!-- MIT MIR GETEILT -->
            <div class="bg-white rounded-lg shadow p-6">
                <h3 class="text-xl font-bold mb-4">📥 Mit mir geteilt (${receivedShares.length})</h3>
                
                ${receivedShares.length === 0 ? `
                    <p class="text-gray-500">Keine geteilten Themen</p>
                ` : `
                    <div class="space-y-2">
                        ${receivedShares.map(share => `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                    <p class="font-bold">${share.themaName || 'Unbekannt'}</p>
                                    <p class="text-sm text-gray-600">Von: ${share.freigegebenVonName}</p>
                                    <span class="text-xs px-2 py-1 rounded ${share.rechte === 'lesen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                                        ${share.rechte === 'lesen' ? '👁️ Leserechte' : '✏️ Bearbeitungsrechte'}
                                    </span>
                                </div>
                                <button onclick="removeShare('${share.id}')" 
                                    class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
                                    🗑️ Entfernen
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `}
                
                <!-- Offene Einladungen -->
                ${receivedInvitations.filter(i => i.status === 'pending').length > 0 ? `
                    <div class="mt-4">
                        <h4 class="font-bold mb-2">📨 Offene Einladungen (${receivedInvitations.filter(i => i.status === 'pending').length})</h4>
                        <div class="space-y-2">
                            ${receivedInvitations.filter(i => i.status === 'pending').map(inv => `
                                <div class="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border-2 border-yellow-300">
                                    <div>
                                        <p class="font-bold">${inv.themaName}</p>
                                        <p class="text-sm text-gray-600">Von: ${inv.absenderName}</p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onclick="acceptInvitation('${inv.id}')" 
                                            class="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-bold">
                                            ✅ Annehmen
                                        </button>
                                        <button onclick="declineInvitation('${inv.id}')" 
                                            class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-bold">
                                            ❌ Ablehnen
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
            
            <!-- VON MIR GETEILT -->
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold">📤 Von mir geteilt (${givenShares.length})</h3>
                    <button onclick="openShareModal()" 
                        class="px-4 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600">
                        ➕ Thema teilen
                    </button>
                </div>
                
                ${givenShares.length === 0 && sentInvitations.filter(i => i.status === 'pending').length === 0 ? `
                    <p class="text-gray-500">Keine Freigaben</p>
                ` : `
                    <div class="space-y-2">
                        ${givenShares.map(share => `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                    <p class="font-bold">${share.themaName || 'Unbekannt'}</p>
                                    <p class="text-sm text-gray-600">An: ${share.userName}</p>
                                    <span class="text-xs px-2 py-1 rounded bg-green-100 text-green-800">
                                        ✅ Aktiv
                                    </span>
                                </div>
                                <button onclick="revokeShare('${share.id}')" 
                                    class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
                                    🚫 Widerrufen
                                </button>
                            </div>
                        `).join('')}
                        
                        ${sentInvitations.filter(i => i.status === 'pending').map(inv => `
                            <div class="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border-2 border-yellow-300">
                                <div>
                                    <p class="font-bold">${inv.themaName}</p>
                                    <p class="text-sm text-gray-600">An: ${inv.empfaengerName}</p>
                                    <span class="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
                                        ⏳ Ausstehend
                                    </span>
                                </div>
                                <button onclick="cancelInvitation('${inv.id}')" 
                                    class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
                                    ❌ Zurücknehmen
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

// ═════════════════════════════════════════════════════════
// AKTIONEN
// ═════════════════════════════════════════════════════════

// ✅ Einladung annehmen (mit Filter-Unterstützung)
window.acceptInvitation = async function(invitationId) {
    try {
        const inv = EINLADUNGEN[invitationId];
        if (!inv) return;
        
        console.log("✅ Nehme Einladung an:", inv.themaName, "Typ:", inv.shareType || 'komplett');
        
        // Einladung aktualisieren
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'accepted',
            akzeptiertAm: serverTimestamp()
        });
        
        // Freigabe-Daten vorbereiten
        const freigabeId = `${inv.themaId}_${getCurrentUserId()}`;
        const freigabeData = {
            userId: getCurrentUserId(),
            userUid: auth.currentUser.uid,
            userName: currentUser.displayName || currentUser.name,
            themaId: inv.themaId,
            themaName: inv.themaName,
            besitzerId: inv.absenderId,
            besitzerUid: inv.besitzerUid,
            rechte: inv.rechte || 'lesen',
            shareType: inv.shareType || 'komplett', // 'komplett' oder 'gefiltert'
            freigegebenVon: inv.absenderId,
            freigegebenVonName: inv.absenderName,
            aktiv: true,
            erstelltAm: serverTimestamp()
        };
        
        // Bei gefilterter Freigabe: Filter-Regeln übernehmen
        if (inv.shareType === 'gefiltert' && inv.filterRules) {
            freigabeData.filterRules = inv.filterRules;
            console.log("📋 Filter-Regeln:", inv.filterRules);
        }
        
        // Freigabe erstellen
        await setDoc(doc(geschenkeFreigabenRef, freigabeId), freigabeData);
        
        alertUser('✅ Einladung angenommen!', 'success');
        
        // ✅ Themen werden automatisch durch listenForThemen() aktualisiert
        // ✅ UI wird automatisch aktualisiert
        
    } catch (error) {
        console.error("Fehler:", error);
        alertUser('❌ Fehler: ' + error.message, 'error');
    }
};

// ❌ Einladung ablehnen
window.declineInvitation = async function(invitationId) {
    try {
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'declined',
            abgelehntAm: serverTimestamp()
        });
        
        alertUser('Einladung abgelehnt', 'info');
    } catch (error) {
        alertUser('Fehler: ' + error.message, 'error');
    }
};

// 🗑️ Freigabe entfernen (als Empfänger)
window.removeShare = async function(shareId) {
    if (!confirm('Freigabe wirklich entfernen?')) return;
    
    try {
        await updateDoc(doc(geschenkeFreigabenRef, shareId), {
            aktiv: false,
            beendetAm: serverTimestamp()
        });
        
        alertUser('Freigabe entfernt', 'success');
        // ✅ Themen werden automatisch durch listenForThemen() aktualisiert
        // ✅ UI wird automatisch aktualisiert
    } catch (error) {
        alertUser('Fehler: ' + error.message, 'error');
    }
};

// 🚫 Freigabe widerrufen (als Ersteller)
window.revokeShare = async function(shareId) {
    if (!confirm('Freigabe wirklich widerrufen?')) return;
    
    try {
        await updateDoc(doc(geschenkeFreigabenRef, shareId), {
            aktiv: false,
            widerrufenAm: serverTimestamp()
        });
        
        alertUser('Freigabe widerrufen', 'success');
    } catch (error) {
        alertUser('Fehler: ' + error.message, 'error');
    }
};

// ❌ Einladung zurücknehmen
window.cancelInvitation = async function(invitationId) {
    if (!confirm('Einladung zurücknehmen?')) return;
    
    try {
        await deleteDoc(doc(geschenkeEinladungenRef, invitationId));
        alertUser('Einladung zurückgenommen', 'success');
    } catch (error) {
        alertUser('Fehler: ' + error.message, 'error');
    }
};

// ═════════════════════════════════════════════════════════
// TEILEN-MODAL
// ═════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════
// 🆕 NEUES ERWEITERTES TEILEN-MODAL MIT FILTER-OPTIONEN
// ═════════════════════════════════════════════════════════

// Globale Variable für Regel-Liste
window.shareRulesList = [];

window.openShareModal = function() {
    const myThemen = Object.values(THEMEN).filter(t => 
        t.istEigenes && !t.archiviert
    );
    
    if (myThemen.length === 0) {
        alertUser('Du hast keine Themen zum Teilen', 'warning');
        return;
    }
    
    // ✅ FIX: Verwende name ODER displayName
    const users = Object.values(USERS).filter(u => {
        const userName = u.displayName || u.name;
        const myName = currentUser.displayName || currentUser.name;
        return u.permissionType !== 'not_registered' && userName !== myName;
    });
    
    if (users.length === 0) {
        alertUser('Keine anderen Benutzer verfügbar', 'warning');
        return;
    }
    
    console.log("👥 Verfügbare User:", users.map(u => u.displayName || u.name));
    
    // Lade Personen aus Kontaktbuch (für Filter)
    const kontakte = Object.values(KONTAKTE);
    
    // Regel-Liste zurücksetzen
    window.shareRulesList = [];
    
    const modal = document.createElement('div');
    modal.id = 'share-modal';
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden">
            <div class="bg-blue-600 text-white p-4 flex justify-between items-center">
                <h3 class="text-2xl font-bold">🔗 Thema teilen - Erweitert</h3>
                <button onclick="closeShareModal()" class="text-white text-2xl">&times;</button>
            </div>
            
            <div class="p-6 space-y-6 overflow-y-auto max-h-[calc(95vh-180px)]">
                <!-- SCHRITT 1: Thema wählen -->
                <div class="bg-blue-50 p-4 rounded-lg border-2 border-blue-300">
                    <label class="block font-bold mb-2 text-lg">1️⃣ Thema auswählen:</label>
                    <select id="share-thema" class="w-full p-3 border-2 rounded-lg font-semibold">
                        <option value="">-- Bitte wählen --</option>
                        ${myThemen.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                    </select>
                </div>
                
                <!-- SCHRITT 2: Person wählen -->
                <div class="bg-green-50 p-4 rounded-lg border-2 border-green-300">
                    <label class="block font-bold mb-2 text-lg">2️⃣ Person auswählen:</label>
                    <select id="share-user" class="w-full p-3 border-2 rounded-lg font-semibold">
                        <option value="">-- Bitte wählen --</option>
                        ${users.map(u => {
                            const userName = u.displayName || u.name;
                            return `<option value="${u.id}" data-name="${userName}">${userName}</option>`;
                        }).join('')}
                    </select>
                </div>
                
                <!-- SCHRITT 3: NEU - Filter festlegen -->
                <div class="bg-purple-50 p-4 rounded-lg border-2 border-purple-300">
                    <label class="block font-bold mb-3 text-lg">3️⃣ Was soll geteilt werden?</label>
                    
                    <!-- Option: Komplettes Thema -->
                    <div class="mb-4 p-3 bg-white rounded-lg border-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="share-type" value="komplett" checked onchange="toggleFilterOptions()">
                            <span class="font-bold">📂 Komplettes Thema teilen (alle Einträge)</span>
                        </label>
                    </div>
                    
                    <!-- Option: Gefiltert -->
                    <div class="mb-4 p-3 bg-white rounded-lg border-2">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="share-type" value="gefiltert" onchange="toggleFilterOptions()">
                            <span class="font-bold">🔍 Gefiltert teilen (nur bestimmte Einträge)</span>
                        </label>
                    </div>
                    
                    <!-- Filter-Optionen (nur bei "gefiltert") -->
                    <div id="filter-options" class="hidden mt-4 space-y-3">
                        <p class="text-sm font-bold text-purple-800 mb-2">Wähle Filter aus und füge sie zur Liste hinzu:</p>
                        
                        <!-- Filter-Typ -->
                        <div class="grid grid-cols-2 gap-2">
                            <select id="filter-type" class="p-2 border rounded-lg text-sm">
                                <option value="">-- Filter-Typ --</option>
                                <option value="fuerPerson">🎁 FÜR Person</option>
                                <option value="vonPerson">🎀 VON Person</option>
                                <option value="beteiligungPerson">👥 BETEILIGUNG Person</option>
                                <option value="bezahltVonPerson">💳 BEZAHLT VON Person</option>
                                <option value="sollBezahlungKonto">💰 SOLL-Bezahlung Konto</option>
                                <option value="istBezahlungKonto">✅ IST-Bezahlung Konto</option>
                                <option value="bezahlungKonto">🏦 Bezahlung Konto (SOLL oder IST)</option>
                                <option value="einzelneEintraege">📋 Einzelne Einträge (IDs)</option>
                            </select>
                            
                            <!-- Wert (je nach Filter-Typ) -->
                            <div id="filter-value-container">
                                <select id="filter-value-person" class="w-full p-2 border rounded-lg text-sm">
                                    <option value="">-- Person wählen --</option>
                                    ${kontakte.map(k => `<option value="${k.id}">${k.name}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <button onclick="addFilterRule()" class="w-full py-2 bg-purple-500 text-white font-bold rounded-lg hover:bg-purple-600">
                            ➕ Zur Liste hinzufügen
                        </button>
                        
                        <!-- Regel-Liste -->
                        <div id="rules-list" class="mt-4 space-y-2"></div>
                    </div>
                </div>
                
                <!-- SCHRITT 4: Berechtigung festlegen -->
                <div class="bg-orange-50 p-4 rounded-lg border-2 border-orange-300">
                    <label class="block font-bold mb-3 text-lg">4️⃣ Berechtigung festlegen:</label>
                    <div class="space-y-2">
                        <label class="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-blue-50 bg-white">
                            <input type="radio" name="share-rechte" value="lesen" checked class="mr-3">
                            <div>
                                <p class="font-bold">👁️ Nur Lesen</p>
                                <p class="text-sm text-gray-600">Kann Einträge nur ansehen</p>
                            </div>
                        </label>
                        <label class="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-green-50 bg-white">
                            <input type="radio" name="share-rechte" value="bearbeiten" class="mr-3">
                            <div>
                                <p class="font-bold">✏️ Bearbeiten</p>
                                <p class="text-sm text-gray-600">Kann gefilterte Einträge ändern (keine neuen erstellen)</p>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            
            <!-- SCHRITT 5: Senden -->
            <div class="p-4 bg-gray-50 flex justify-end gap-2 border-t-2">
                <button onclick="closeShareModal()" 
                    class="px-6 py-3 bg-gray-300 rounded-lg hover:bg-gray-400 font-bold">
                    Abbrechen
                </button>
                <button onclick="sendShare()" 
                    class="px-6 py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 text-lg">
                    5️⃣ 📨 Einladung senden
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event Listener für Filter-Typ-Änderung
    document.getElementById('filter-type')?.addEventListener('change', updateFilterValueInput);
};

// Toggle Filter-Optionen
window.toggleFilterOptions = function() {
    const type = document.querySelector('input[name="share-type"]:checked').value;
    const filterOptions = document.getElementById('filter-options');
    if (type === 'gefiltert') {
        filterOptions.classList.remove('hidden');
    } else {
        filterOptions.classList.add('hidden');
        window.shareRulesList = []; // Liste leeren
        renderRulesList();
    }
};

// Filter-Wert-Input anpassen
function updateFilterValueInput() {
    const filterType = document.getElementById('filter-type').value;
    const container = document.getElementById('filter-value-container');
    const kontakte = Object.values(KONTAKTE);
    
    if (!filterType) {
        container.innerHTML = '<input type="text" disabled class="w-full p-2 border rounded-lg bg-gray-100" placeholder="Wähle zuerst einen Filter-Typ">';
        return;
    }
    
    if (['fuerPerson', 'vonPerson', 'beteiligungPerson', 'bezahltVonPerson'].includes(filterType)) {
        container.innerHTML = `
            <select id="filter-value-person" class="w-full p-2 border rounded-lg text-sm">
                <option value="">-- Person wählen --</option>
                ${kontakte.map(k => `<option value="${k.id}">${k.name}</option>`).join('')}
            </select>
        `;
    } else if (['sollBezahlungKonto', 'istBezahlungKonto', 'bezahlungKonto'].includes(filterType)) {
        container.innerHTML = `
            <input type="text" id="filter-value-text" class="w-full p-2 border rounded-lg text-sm" placeholder="Konto-Name eingeben">
        `;
    } else if (filterType === 'einzelneEintraege') {
        // ✅ PUNKT 2: Checkbox-Liste für Einträge
        const geschenke = Object.values(GESCHENKE);
        
        if (geschenke.length === 0) {
            container.innerHTML = `
                <div class="p-3 bg-yellow-50 border border-yellow-300 rounded-lg text-sm">
                    ⚠️ Keine Einträge vorhanden. Erstelle zuerst Geschenke.
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="border-2 rounded-lg p-3 max-h-64 overflow-y-auto bg-gray-50">
                    <div class="flex items-center justify-between mb-2 pb-2 border-b">
                        <span class="text-xs font-bold text-gray-700">Wähle Einträge aus:</span>
                        <button type="button" onclick="toggleAllEintraege()" class="text-xs text-blue-600 hover:underline">
                            Alle auswählen
                        </button>
                    </div>
                    <div id="eintraege-checkboxes" class="space-y-1">
                        ${geschenke.map(g => `
                            <label class="flex items-start gap-2 p-2 hover:bg-blue-50 rounded cursor-pointer">
                                <input type="checkbox" value="${g.id}" class="mt-1 eintrag-checkbox">
                                <div class="flex-1 text-sm">
                                    <p class="font-semibold">${g.geschenk || 'Unbekannt'}</p>
                                    <p class="text-xs text-gray-600">Status: ${g.status || 'offen'} | ID: ${g.id.substring(0, 8)}...</p>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    }
}

// ✅ PUNKT 2: Alle Einträge an/abwählen
window.toggleAllEintraege = function() {
    const checkboxes = document.querySelectorAll('.eintrag-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });
};

// Regel zur Liste hinzufügen
window.addFilterRule = function() {
    const filterType = document.getElementById('filter-type').value;
    if (!filterType) {
        alertUser('Bitte Filter-Typ auswählen', 'warning');
        return;
    }
    
    let filterValue = '';
    let filterLabel = '';
    
    const personSelect = document.getElementById('filter-value-person');
    const textInput = document.getElementById('filter-value-text');
    const checkboxes = document.querySelectorAll('.eintrag-checkbox:checked');
    
    // ✅ PUNKT 2: Bei Einträgen - ausgewählte Checkboxen auslesen
    if (filterType === 'einzelneEintraege') {
        if (checkboxes.length === 0) {
            alertUser('Bitte mindestens einen Eintrag auswählen', 'warning');
            return;
        }
        
        filterValue = Array.from(checkboxes).map(cb => cb.value).join(',');
        filterLabel = `${checkboxes.length} Eintrag${checkboxes.length > 1 ? 'e' : ''}`;
        
    } else if (personSelect && !personSelect.disabled) {
        filterValue = personSelect.value;
        const selectedOption = personSelect.options[personSelect.selectedIndex];
        filterLabel = selectedOption?.text || filterValue;
        
        if (!filterValue) {
            alertUser('Bitte Person auswählen', 'warning');
            return;
        }
    } else if (textInput) {
        filterValue = textInput.value.trim();
        filterLabel = filterValue;
        
        if (!filterValue) {
            alertUser('Bitte Wert eingeben', 'warning');
            return;
        }
    }
    
    // Filter-Typ Label
    const typeLabels = {
        'fuerPerson': '🎁 FÜR Person',
        'vonPerson': '🎀 VON Person',
        'beteiligungPerson': '👥 BETEILIGUNG Person',
        'bezahltVonPerson': '💳 BEZAHLT VON Person',
        'sollBezahlungKonto': '💰 SOLL-Bezahlung Konto',
        'istBezahlungKonto': '✅ IST-Bezahlung Konto',
        'bezahlungKonto': '🏦 Bezahlung Konto',
        'einzelneEintraege': '📋 Einzelne Einträge'
    };
    
    const rule = {
        type: filterType,
        typeLabel: typeLabels[filterType],
        value: filterValue,
        valueLabel: filterLabel
    };
    
    window.shareRulesList.push(rule);
    renderRulesList();
    
    // Reset
    document.getElementById('filter-type').value = '';
    updateFilterValueInput();
};

// Regel-Liste rendern
// ✅ PUNKT 3: Regel-Liste OHNE Berechtigung (wird in Schritt 4 festgelegt)
function renderRulesList() {
    const container = document.getElementById('rules-list');
    if (!container) return;
    
    if (window.shareRulesList.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500 italic">Keine Regeln hinzugefügt</p>';
        return;
    }
    
    container.innerHTML = window.shareRulesList.map((rule, index) => `
        <div class="flex items-center justify-between p-3 bg-white rounded-lg border-2 border-purple-200">
            <div class="flex-1">
                <p class="font-bold text-sm text-gray-800">${rule.typeLabel}: <span class="text-purple-600">${rule.valueLabel}</span></p>
                <p class="text-xs text-gray-500 mt-1">💡 Berechtigung wird in Schritt 4 festgelegt</p>
            </div>
            <button onclick="removeFilterRule(${index})" class="ml-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-bold">
                🗑️
            </button>
        </div>
    `).join('');
}

// Regel entfernen
window.removeFilterRule = function(index) {
    window.shareRulesList.splice(index, 1);
    renderRulesList();
};

window.closeShareModal = function() {
    document.getElementById('share-modal')?.remove();
};

// ✅ NEUE sendShare() mit Filter-Unterstützung
window.sendShare = async function() {
    const themaId = document.getElementById('share-thema').value;
    const userSelect = document.getElementById('share-user');
    const userId = userSelect.value;
    const userName = userSelect.selectedOptions[0]?.dataset.name;
    const shareType = document.querySelector('input[name="share-type"]:checked').value;
    const rechte = document.querySelector('input[name="share-rechte"]:checked').value;
    
    if (!themaId || !userId) {
        alertUser('Bitte alle Felder ausfüllen', 'warning');
        return;
    }
    
    // Bei gefilterter Freigabe: Prüfe ob Regeln vorhanden
    if (shareType === 'gefiltert' && window.shareRulesList.length === 0) {
        alertUser('Bitte mindestens eine Filter-Regel hinzufügen', 'warning');
        return;
    }
    
    try {
        const thema = THEMEN[themaId];
        
        console.log("📨 Sende erweiterte Einladung:", {
            themaName: thema.name,
            userName: userName,
            shareType: shareType,
            rechte: rechte,
            rules: shareType === 'gefiltert' ? window.shareRulesList : []
        });
        
        // Prüfe ob bereits Einladung existiert
        const existing = Object.values(EINLADUNGEN).find(e => 
            e.empfaengerName === userName && 
            e.themaId === themaId &&
            e.status === 'pending'
        );
        
        if (existing) {
            alertUser('Es gibt bereits eine ausstehende Einladung', 'warning');
            return;
        }
        
        // Einladungs-Daten erstellen
        const einladungData = {
            absenderId: getCurrentUserId(),
            absenderName: currentUser.displayName || currentUser.name,
            besitzerId: getCurrentUserId(),
            besitzerUid: auth.currentUser.uid,
            empfaengerId: userId,
            empfaengerName: userName,
            themaId: themaId,
            themaName: thema.name,
            shareType: shareType, // 'komplett' oder 'gefiltert'
            rechte: rechte,
            status: 'pending',
            erstelltAm: serverTimestamp()
        };
        
        // Bei gefilterter Freigabe: Regeln hinzufügen (ohne individuelle Rechte)
        if (shareType === 'gefiltert') {
            einladungData.filterRules = window.shareRulesList.map(rule => ({
                type: rule.type,
                value: rule.value,
                valueLabel: rule.valueLabel
                // ✅ PUNKT 3: Keine individuellen Rechte mehr - nur globale Berechtigung aus Schritt 4
            }));
        }
        
        // Einladung erstellen
        await addDoc(geschenkeEinladungenRef, einladungData);
        
        alertUser('✅ Einladung erfolgreich gesendet!', 'success');
        closeShareModal();
        
    } catch (error) {
        console.error("Fehler:", error);
        alertUser('❌ Fehler: ' + error.message, 'error');
    }
};

// ═════════════════════════════════════════════════════════
// MODAL FÜR OFFENE EINLADUNGEN
// ═════════════════════════════════════════════════════════

window.showInvitationsModal = function() {
    const myName = currentUser?.displayName;
    const pending = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerName === myName && e.status === 'pending'
    );
    
    const modal = document.createElement('div');
    modal.id = 'invitations-modal';
    modal.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-2xl">
            <div class="bg-red-600 text-white p-4 flex justify-between items-center">
                <h3 class="text-2xl font-bold">📨 Offene Einladungen (${pending.length})</h3>
                <button onclick="closeInvitationsModal()" class="text-white text-2xl">&times;</button>
            </div>
            
            <div class="p-6 space-y-4">
                ${pending.map(inv => `
                    <div class="p-4 bg-yellow-50 rounded-lg border-2 border-yellow-300">
                        <p class="font-bold text-lg">${inv.themaName}</p>
                        <p class="text-gray-600">Von: <strong>${inv.absenderName}</strong></p>
                        <p class="text-sm text-gray-600 mt-2">
                            Typ: ${inv.shareType === 'gefiltert' ? '🔍 Gefiltert' : '📂 Komplettes Thema'}
                        </p>
                        <p class="text-sm text-gray-600">
                            Berechtigung: ${inv.rechte === 'lesen' ? '👁️ Lesen' : '✏️ Bearbeiten'}
                        </p>
                        ${inv.shareType === 'gefiltert' && inv.filterRules ? `
                            <div class="mt-2 p-2 bg-white rounded border">
                                <p class="text-xs font-bold text-gray-700 mb-1">Filter-Regeln:</p>
                                ${inv.filterRules.map(rule => `
                                    <p class="text-xs text-gray-600">• ${rule.valueLabel || rule.type}</p>
                                `).join('')}
                            </div>
                        ` : ''}
                        <div class="flex gap-2 mt-3">
                            <button onclick="acceptInvitation('${inv.id}'); closeInvitationsModal();" 
                                class="flex-1 px-4 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600">
                                ✅ Annehmen
                            </button>
                            <button onclick="declineInvitation('${inv.id}'); closeInvitationsModal();" 
                                class="flex-1 px-4 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600">
                                ❌ Ablehnen
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
};

window.closeInvitationsModal = function() {
    document.getElementById('invitations-modal')?.remove();
};

// ✅ PUNKT 7: Tab-Wechsel
window.switchFreigabenTab = function(tab) {
    // Update Tab-Buttons
    document.getElementById('tab-ichTeile')?.classList.toggle('border-blue-500', tab === 'ichTeile');
    document.getElementById('tab-ichTeile')?.classList.toggle('text-blue-600', tab === 'ichTeile');
    document.getElementById('tab-ichTeile')?.classList.toggle('border-transparent', tab !== 'ichTeile');
    document.getElementById('tab-ichTeile')?.classList.toggle('text-gray-500', tab !== 'ichTeile');
    
    document.getElementById('tab-mirGeteilt')?.classList.toggle('border-blue-500', tab === 'mirGeteilt');
    document.getElementById('tab-mirGeteilt')?.classList.toggle('text-blue-600', tab === 'mirGeteilt');
    document.getElementById('tab-mirGeteilt')?.classList.toggle('border-transparent', tab !== 'mirGeteilt');
    document.getElementById('tab-mirGeteilt')?.classList.toggle('text-gray-500', tab !== 'mirGeteilt');
    
    // Zeige entsprechenden Inhalt
    if (tab === 'ichTeile') {
        renderFreigabenICHTeile();
    } else {
        renderFreigabenMIRGeteilt();
    }
};

// ✅ PUNKT 7a: Freigaben die ICH ANDEREN gegeben habe (Person A)
function renderFreigabenICHTeile() {
    const container = document.getElementById('freigaben-tab-content');
    if (!container) return;
    
    // DEBUG: Prüfe USERS und currentUser
    console.log('🔍 DEBUG Freigaben:', {
        totalUsers: Object.keys(USERS).length,
        usersIsEmpty: Object.keys(USERS).length === 0,
        currentUserId: currentUser?.odooUserId,
        currentUserName: currentUser?.displayName,
        usersArray: Object.values(USERS).slice(0, 5).map(u => ({
            id: u.id,
            odooUserId: u.odooUserId,
            name: u.name || u.displayName,
            permissionType: u.permissionType
        }))
    });
    
    // Prüfe ob USERS geladen ist
    if (!USERS || Object.keys(USERS).length === 0) {
        container.innerHTML = `
            <div class="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                <p class="text-sm text-yellow-800">
                    <strong>⚠️ Benutzerdaten werden geladen...</strong><br>
                    Falls diese Meldung bestehen bleibt, lade die Seite bitte neu.
                </p>
                <button onclick="location.reload()" class="mt-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-bold">
                    🔄 Seite neu laden
                </button>
            </div>
        `;
        
        // Versuche nach 2 Sekunden erneut zu rendern
        setTimeout(() => {
            if (Object.keys(USERS).length > 0) {
                renderFreigabenVerwaltung();
            }
        }, 2000);
        return;
    }
    
    // Registrierte Benutzer (außer ich selbst)
    const registrierteBenutzer = Object.values(USERS).filter(u => {
        if (!u) {
            console.log('❌ User ist null/undefined');
            return false;
        }
        
        if (u.permissionType === 'not_registered') {
            console.log('❌ User nicht registriert:', u.displayName || u.name);
            return false;
        }
        
        // WICHTIG: Mehrere Checks um SICHERZUSTELLEN dass eigene Person nicht angezeigt wird
        
        // 1. Vergleich über Firebase Auth UID (request.auth.uid)
        if (currentUser?.uid && u.uid === currentUser.uid) {
            console.log('❌ User ist ich selbst (uid):', u.displayName || u.name);
            return false;
        }
        
        // 2. Vergleich über User ID
        const myUserId = getCurrentUserId();
        if (myUserId && u.id === myUserId) {
            console.log('❌ User ist ich selbst (userId):', u.displayName || u.name);
            return false;
        }
        
        if (myUserId && u.uid === myUserId) {
            console.log('❌ User ist ich selbst (uid):', u.displayName || u.name);
            return false;
        }
        
        // 3. Vergleich über displayName
        if (currentUser?.displayName && u.displayName === currentUser.displayName) {
            console.log('❌ User ist ich selbst (displayName):', u.displayName);
            return false;
        }
        
        // 4. Vergleich über name
        if (currentUser?.displayName && u.name === currentUser.displayName) {
            console.log('❌ User ist ich selbst (name):', u.name);
            return false;
        }
        
        // 5. Vergleich über ID (falls currentUser.id gesetzt ist)
        if (currentUser?.id && u.id === currentUser.id) {
            console.log('❌ User ist ich selbst (id):', u.displayName || u.name);
            return false;
        }
        
        console.log('✅ User wird angezeigt:', u.displayName || u.name, '| ID:', u.id, '| uid:', u.uid);
        return true;
    });
    
    console.log('✅ Gefilterte Benutzer GESAMT:', registrierteBenutzer.length, registrierteBenutzer.map(u => u.displayName || u.name));
    
    if (registrierteBenutzer.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine registrierten Benutzer gefunden</p>';
        return;
    }
    
    container.innerHTML = registrierteBenutzer.map(user => {
        // Finde Einladungen für diesen Benutzer (die ICH gesendet habe)
        const myUserId = getCurrentUserId();
        const einladungen = Object.values(EINLADUNGEN).filter(e => 
            e.empfaengerName === (user.displayName || user.name) && 
            e.absenderId === myUserId
        );
        
        console.log(`📊 Einladungen für ${user.name}:`, einladungen.length);
        const aktiveFreigaben = Object.values(FREIGABEN).filter(f => 
            f.userId === user.id && 
            f.aktiv
        );
        
        return `
            <div class="p-4 bg-gray-50 rounded-lg border-2">
                <div class="flex items-center justify-between mb-3">
                    <div>
                        <span class="font-bold text-lg">${user.displayName || user.name}</span>
                        ${aktiveFreigaben.length > 0 ? `
                            <span class="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-bold">
                                ✅ ${aktiveFreigaben.length} Freigabe${aktiveFreigaben.length !== 1 ? 'n' : ''} aktiv
                            </span>
                        ` : ''}
                        ${einladungen.filter(e => e.status === 'pending').length > 0 ? `
                            <span class="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-bold">
                                ⏳ ${einladungen.filter(e => e.status === 'pending').length} Einladung${einladungen.filter(e => e.status === 'pending').length !== 1 ? 'en' : ''} ausstehend
                            </span>
                        ` : ''}
                        ${einladungen.filter(e => e.status === 'declined').length > 0 ? `
                            <span class="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full font-bold">
                                ❌ ${einladungen.filter(e => e.status === 'declined').length} Abgelehnt
                            </span>
                        ` : ''}
                    </div>
                    <button onclick="window.openFreigabeEditor('${user.id}')" 
                        class="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold rounded-lg hover:shadow-lg transition">
                        🔐 Freigaben verwalten
                    </button>
                </div>
                
                ${aktiveFreigaben.length > 0 || einladungen.length > 0 ? `
                    <div class="mt-2 space-y-1">
                        ${aktiveFreigaben.map(f => {
                            const thema = THEMEN[f.themaId];
                            return `
                                <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-green-300">
                                    <div class="flex items-center gap-2">
                                        <span class="text-2xl">✅</span>
                                        <div>
                                            <p class="font-semibold text-sm">${thema?.name || 'Unbekanntes Thema'}</p>
                                            <p class="text-xs text-gray-500">
                                                ${f.freigabeTyp === 'komplett' ? 
                                                    `Komplett • ${f.rechte === 'lesen' ? '👁️ Lesen' : '✏️ Bearbeiten'}` :
                                                    `Gefiltert • ${Object.keys(f.filter || {}).length} Filter`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                    <button onclick="window.deleteFreigabe('${f.id}')" 
                                        class="text-red-500 hover:text-red-700 p-1" title="Freigabe entfernen">
                                        🗑️
                                    </button>
                                </div>
                            `;
                        }).join('')}
                        ${einladungen.map(e => {
                            const statusColors = {
                                pending: 'border-yellow-300 bg-yellow-50',
                                accepted: 'border-green-300 bg-green-50',
                                declined: 'border-red-300 bg-red-50'
                            };
                            const statusIcons = {
                                pending: '⏳',
                                accepted: '✅',
                                declined: '❌'
                            };
                            return `
                                <div class="flex items-center justify-between p-2 bg-white rounded-lg border ${statusColors[e.status] || ''}">
                                    <div class="flex items-center gap-2">
                                        <span class="text-2xl">${statusIcons[e.status] || '📧'}</span>
                                        <div>
                                            <p class="font-semibold text-sm">${e.themaName || 'Unbekanntes Thema'}</p>
                                            <p class="text-xs text-gray-500">
                                                Einladung: ${e.status === 'pending' ? 'Ausstehend' : e.status === 'accepted' ? 'Angenommen' : 'Abgelehnt'}
                                            </p>
                                        </div>
                                    </div>
                                    ${e.status === 'pending' ? `
                                        <button onclick="window.cancelEinladung('${e.id}')" 
                                            class="text-red-500 hover:text-red-700 p-1 text-sm font-bold" title="Einladung zurücknehmen">
                                            ❌ Zurücknehmen
                                        </button>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : '<p class="text-xs text-gray-400 italic mt-2">Keine aktiven Freigaben oder Einladungen</p>'}
            </div>
        `;
    }).join('');
}

// ✅ PUNKT 7b: Freigaben die MIR gegeben wurden (Person B)
function renderFreigabenMIRGeteilt() {
    const container = document.getElementById('freigaben-tab-content');
    if (!container) return;
    
    const myName = currentUser?.displayName;
    const myUserId = getCurrentUserId();
    
    // Freigaben die ICH erhalten habe (aktiv)
    const meineFreigaben = Object.values(FREIGABEN).filter(f => 
        f.userName === myName && f.aktiv
    );
    
    // Einladungen die ICH erhalten habe (alle Status)
    const meineEinladungen = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerName === myName
    );
    
    if (meineFreigaben.length === 0 && meineEinladungen.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <span class="text-6xl">📭</span>
                <p class="mt-3 font-semibold">Keine Freigaben erhalten</p>
                <p class="text-sm">Wenn andere Benutzer Themen mit dir teilen, erscheinen sie hier.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="space-y-4">
            <!-- Aktive Freigaben -->
            ${meineFreigaben.length > 0 ? `
                <div>
                    <h4 class="text-lg font-bold text-gray-800 mb-3">✅ Aktive Freigaben (${meineFreigaben.length})</h4>
                    <div class="space-y-2">
                        ${meineFreigaben.map(f => {
                            const thema = THEMEN[f.themaId];
                            return `
                                <div class="bg-white rounded-lg p-4 border-2 border-green-300">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <span class="text-3xl">📁</span>
                                            <div>
                                                <p class="font-bold text-gray-800">${thema?.name || f.themaName}</p>
                                                <p class="text-sm text-gray-600">
                                                    Geteilt von: <strong>${f.freigegebenVonName}</strong>
                                                </p>
                                                <div class="flex gap-2 mt-1">
                                                    <span class="text-xs px-2 py-1 rounded ${f.rechte === 'lesen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                                                        ${f.rechte === 'lesen' ? '👁️ Leserechte' : '✏️ Bearbeitungsrechte'}
                                                    </span>
                                                    <span class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800">
                                                        ${f.freigabeTyp === 'komplett' ? '📂 Komplett' : `🔍 ${Object.keys(f.filter || {}).length} Filter`}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button onclick="window.endSharing('${f.id}')" 
                                            class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm font-bold">
                                            🚫 Zugriff beenden
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}
            
            <!-- Einladungen (ausstehend, angenommen, abgelehnt) -->
            ${meineEinladungen.length > 0 ? `
                <div>
                    <h4 class="text-lg font-bold text-gray-800 mb-3">📨 Einladungen (${meineEinladungen.length})</h4>
                    <div class="space-y-2">
                        ${meineEinladungen.map(inv => {
                            const statusConfig = {
                                pending: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-800', label: 'Ausstehend', icon: '⏳' },
                                accepted: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-800', label: 'Angenommen', icon: '✅' },
                                declined: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', label: 'Abgelehnt', icon: '❌' }
                            };
                            const cfg = statusConfig[inv.status] || statusConfig.pending;
                            
                            return `
                                <div class="bg-white rounded-lg p-4 border-2 ${cfg.border} ${cfg.bg}">
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <span class="text-3xl">${cfg.icon}</span>
                                            <div>
                                                <p class="font-bold text-gray-800">${inv.themaName}</p>
                                                <p class="text-sm text-gray-600">
                                                    Von: <strong>${inv.absenderName}</strong>
                                                </p>
                                                <span class="text-xs px-2 py-1 rounded ${cfg.bg} ${cfg.text} font-bold mt-1 inline-block">
                                                    ${cfg.label}
                                                </span>
                                            </div>
                                        </div>
                                        <div class="flex flex-col gap-2">
                                            ${inv.status === 'pending' ? `
                                                <button onclick="window.acceptGeschenkeInvitation('${inv.id}')" 
                                                    class="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-bold">
                                                    ✅ Annehmen
                                                </button>
                                                <button onclick="window.declineGeschenkeInvitation('${inv.id}')" 
                                                    class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm font-bold">
                                                    ❌ Ablehnen
                                                </button>
                                            ` : inv.status === 'declined' ? `
                                                <button onclick="window.revokeDeclinedInvitation('${inv.id}')" 
                                                    class="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-bold">
                                                    🔄 Widerrufen
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// ✅ PUNKT 7: Freigabe beenden (Person B entfernt eigenen Zugriff)
window.endSharing = async function(freigabeId) {
    if (!confirm('Möchtest du wirklich den Zugriff auf dieses geteilte Thema beenden?')) return;
    
    try {
        const freigabeDoc = doc(geschenkeFreigabenRef, freigabeId);
        await updateDoc(freigabeDoc, {
            aktiv: false,
            deaktiviertAm: serverTimestamp(),
            deaktiviertVon: currentUser.displayName
        });
        alertUser('✅ Zugriff beendet', 'success');
        console.log(`✅ Freigabe ${freigabeId} deaktiviert`);
    } catch (error) {
        console.error('Fehler beim Beenden der Freigabe:', error);
        alertUser('❌ Fehler: ' + error.message, 'error');
    }
};

// ✅ PUNKT 7: Abgelehnte Einladung widerrufen (Person B ändert Meinung)
window.revokeDeclinedInvitation = async function(invitationId) {
    try {
        const einladungDoc = doc(geschenkeEinladungenRef, invitationId);
        await updateDoc(einladungDoc, {
            status: 'pending',
            aktualisiertAm: serverTimestamp()
        });
        alertUser('✅ Ablehnung widerrufen - Einladung ist wieder ausstehend', 'success');
        console.log(`✅ Einladung ${invitationId} wieder auf pending gesetzt`);
    } catch (error) {
        console.error('Fehler beim Widerrufen:', error);
        alertUser('❌ Fehler: ' + error.message, 'error');
    }
};

// ========================================
// NEUER FREIGABE-EDITOR
// ========================================

window.openFreigabeEditor = function(userId) {
    const user = USERS[userId];
    if (!user) return;
    
    // Finde bestehende Freigaben/Einladungen für diesen Benutzer
    const myUserId = getCurrentUserId();
    const userFreigaben = Object.values(FREIGABEN).filter(f => f.userId === userId && f.aktiv);
    const userEinladungen = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerId === userId && 
        e.absenderId === myUserId
    );
    
    let modal = document.getElementById('freigabeEditorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'freigabeEditorModal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    const themenArray = Object.values(THEMEN).filter(t => !t.archiviert);
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden">
            <div class="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
                <div>
                    <h3 class="text-2xl font-bold">🔐 Freigaben für ${user.displayName || user.name}</h3>
                    <p class="text-sm text-white/90 mt-1">Themen auswählen und Berechtigungen festlegen</p>
                </div>
                <button onclick="window.closeFreigabeEditor()" class="text-white/80 hover:text-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div class="p-6 overflow-y-auto max-h-[calc(95vh-180px)]">
                ${themenArray.length === 0 ? `
                    <p class="text-gray-500 text-center py-8">Keine Themen vorhanden. Erstelle zuerst Themen.</p>
                ` : `
                    <!-- TEIL 1: THEMA AUSWÄHLEN -->
                    <div class="mb-6 p-5 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border-2 border-blue-300">
                        <h4 class="text-lg font-bold text-blue-900 mb-3">📁 TEIL 1: Thema auswählen</h4>
                        <p class="text-sm text-gray-700 mb-4">Wähle aus, welche Themen ${user.displayName} sehen kann:</p>
                        <div class="grid grid-cols-2 gap-3">
                            ${themenArray.map(t => `
                                <label class="flex items-center gap-3 p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-blue-500 transition">
                                    <input type="checkbox" 
                                        id="thema-select-${t.id}" 
                                        value="${t.id}"
                                        onchange="window.updateTeil2Visibility()"
                                        class="w-5 h-5 text-blue-600 rounded">
                                    <span class="font-semibold text-gray-800">${t.name}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- TEIL 2: BERECHTIGUNGEN FESTLEGEN -->
                    <div id="teil2-container" class="mb-6 p-5 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border-2 border-green-300 hidden">
                        <h4 class="text-lg font-bold text-green-900 mb-3">🔐 TEIL 2: Berechtigungen festlegen</h4>
                        <p class="text-sm text-gray-700 mb-4">Wähle einen Filter aus und lege fest, welche Einträge sichtbar sind:</p>
                        
                        <!-- Filter-Auswahl -->
                        <div class="bg-white rounded-lg p-4 mb-4 border-2 border-gray-300">
                            <label class="block text-sm font-bold text-gray-700 mb-2">Filter-Typ wählen:</label>
                            <select id="filter-typ-select" onchange="window.updateFilterDetails()" 
                                class="w-full p-3 border-2 border-gray-300 rounded-lg font-semibold">
                                <option value="">-- Bitte wählen --</option>
                                <option value="fuerPerson">🎁 ALLE Einträge FÜR Person(en)</option>
                                <option value="vonPerson">🎀 ALLE Einträge VON Person(en)</option>
                                <option value="beteiligungPerson">👥 ALLE Einträge mit BETEILIGUNG Person(en)</option>
                                <option value="bezahltVonPerson">💳 ALLE Einträge BEZAHLT VON Person(en)</option>
                                <option value="sollBezahlungKonto">💰 ALLE Einträge mit SOLL-Bezahlung Konto</option>
                                <option value="istBezahlungKonto">✅ ALLE Einträge mit IST-Bezahlung Konto</option>
                                <option value="bezahlungKonto">🏦 ALLE Einträge mit Bezahlung Konto (SOLL ODER IST)</option>
                                <option value="einzelneEintraege">📋 Einzelne Einträge (nach ID)</option>
                            </select>
                        </div>
                        
                        <!-- Filter-Details (Person/Konto Auswahl) -->
                        <div id="filter-details-container" class="hidden bg-white rounded-lg p-4 mb-4 border-2 border-blue-300">
                            <!-- Wird dynamisch befüllt -->
                        </div>
                        
                        <!-- Berechtigungen -->
                        <div id="rechte-container" class="hidden bg-white rounded-lg p-4 mb-4 border-2 border-purple-300">
                            <label class="block text-sm font-bold text-gray-700 mb-3">Berechtigung für diese Regel:</label>
                            <div class="flex gap-4">
                                <label class="flex-1 flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 border-gray-300 hover:border-blue-500">
                                    <input type="radio" name="regel-rechte" value="lesen" checked class="w-4 h-4 text-blue-600">
                                    <div>
                                        <p class="font-bold">👁️ Leserechte</p>
                                        <p class="text-xs text-gray-500">Nur ansehen</p>
                                    </div>
                                </label>
                                <label class="flex-1 flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 border-gray-300 hover:border-green-500">
                                    <input type="radio" name="regel-rechte" value="bearbeiten" class="w-4 h-4 text-green-600">
                                    <div>
                                        <p class="font-bold">✏️ Bearbeitungsrechte</p>
                                        <p class="text-xs text-gray-500">Ansehen & ändern</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Hinzufügen Button -->
                        <button id="add-regel-btn" onclick="window.addRegelToListe()" 
                            class="hidden w-full py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white font-bold rounded-lg hover:shadow-lg transition">
                            ➕ Regel zur Berechtigungsliste hinzufügen
                        </button>
                        
                        <!-- Berechtigungsliste -->
                        <div class="mt-6">
                            <h5 class="text-md font-bold text-gray-800 mb-3">📋 Berechtigungsliste:</h5>
                            <div id="berechtigungs-liste" class="space-y-2 min-h-[100px] p-3 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                <p class="text-gray-400 text-sm text-center py-4">Noch keine Berechtigungen hinzugefügt</p>
                            </div>
                        </div>
                    </div>
                `}
            </div>
            
            <div class="sticky bottom-0 bg-gray-100 p-4 rounded-b-2xl flex justify-between gap-3">
                <button onclick="window.closeFreigabeEditor()" class="px-6 py-3 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                    Abbrechen
                </button>
                <button onclick="window.sendNeueFreigabeEinladungen('${userId}')" 
                    class="px-6 py-3 bg-gradient-to-r from-green-600 to-blue-500 text-white font-bold rounded-lg hover:shadow-lg transition flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    📧 Einladungen senden
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Initialisiere Berechtigungsliste
    window.berechtigungsListe = [];
};

// ========================================
// NEUE HELPER-FUNKTIONEN FÜR TEIL 2
// ========================================

// Globale Berechtigungsliste
window.berechtigungsListe = [];

// Zeige/Verstecke Teil 2 basierend auf Thema-Auswahl
window.updateTeil2Visibility = function() {
    const themaCheckboxes = document.querySelectorAll('[id^="thema-select-"]:checked');
    const teil2Container = document.getElementById('teil2-container');
    
    if (themaCheckboxes.length > 0) {
        teil2Container?.classList.remove('hidden');
    } else {
        teil2Container?.classList.add('hidden');
    }
};

// Aktualisiere Filter-Details basierend auf Filter-Typ
window.updateFilterDetails = async function() {
    const filterTyp = document.getElementById('filter-typ-select')?.value;
    const detailsContainer = document.getElementById('filter-details-container');
    const rechteContainer = document.getElementById('rechte-container');
    const addBtn = document.getElementById('add-regel-btn');
    
    if (!filterTyp || !detailsContainer) return;
    
    detailsContainer.classList.remove('hidden');
    rechteContainer?.classList.remove('hidden');
    addBtn?.classList.remove('hidden');
    
    let html = '';
    
    if (filterTyp === 'einzelneEintraege') {
        // Einzelne Einträge - Sammle alle Geschenke aus ausgewählten Themen
        const selectedThemen = Array.from(document.querySelectorAll('[id^="thema-select-"]:checked')).map(cb => cb.value);
        
        console.log('🔍 DEBUG Einzelne Einträge:', {
            selectedThemen,
            totalGeschenkeInAktuellemThema: Object.keys(GESCHENKE).length
        });
        
        if (selectedThemen.length === 0) {
            html = `<p class="text-yellow-600 text-sm font-bold">⚠️ Bitte wähle zuerst mindestens ein Thema in TEIL 1 aus!</p>`;
        } else {
            // Zeige "Lade..." Nachricht
            detailsContainer.innerHTML = '<p class="text-blue-600 text-sm font-bold animate-pulse">⏳ Lade Geschenke aus ausgewählten Themen...</p>';
            
            // Lade Geschenke aus allen ausgewählten Themen
            const alleGeschenke = await loadGeschenkeFromMultipleThemen(selectedThemen);
            
            // Filtere nicht-archivierte
            const filteredGeschenke = alleGeschenke.filter(g => !g.archiviert);
            
            console.log('✅ Gefilterte Geschenke:', filteredGeschenke.length);
            
            if (filteredGeschenke.length === 0) {
                html = `
                    <div class="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                        <p class="text-yellow-800 font-bold mb-2">⚠️ Keine Einträge gefunden</p>
                        <p class="text-sm text-yellow-700">
                            Ausgewählte Themen: ${selectedThemen.length}<br>
                            Gesamt Geschenke geladen: ${alleGeschenke.length}<br>
                            Nicht-archivierte: ${filteredGeschenke.length}
                        </p>
                        <p class="text-xs text-yellow-600 mt-2">
                            💡 Tipp: Erstelle zuerst Geschenke in den ausgewählten Themen.
                        </p>
                    </div>
                `;
            } else {
                html = `
                    <label class="block text-sm font-bold text-gray-700 mb-3">Einträge auswählen (${filteredGeschenke.length} verfügbar):</label>
                    <div class="max-h-96 overflow-y-auto p-3 bg-gray-50 rounded border">
                        <div class="space-y-2">
                            ${filteredGeschenke.map(g => {
                                // ✅ KORRIGIERT: fuer und von sind Arrays
                                const fuerName = (g.fuer || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ') || 'Unbekannt';
                                const vonName = (g.von || []).map(id => KONTAKTE[id]?.name || 'Unbekannt').join(', ') || 'Unbekannt';
                                const thema = THEMEN[g.themaId];
                                const status = STATUS_CONFIG[g.status];
                                
                                return `
                                    <label class="flex items-start gap-3 p-3 bg-white hover:bg-blue-50 rounded-lg border-2 border-gray-200 hover:border-blue-400 cursor-pointer transition">
                                        <input type="checkbox" 
                                            name="filter-geschenk-checkbox" 
                                            value="${g.id}"
                                            class="w-5 h-5 text-blue-600 rounded mt-1 shrink-0">
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-2 mb-1">
                                                <span class="text-xs font-bold text-gray-500">#${g.id?.slice(0, 8)}</span>
                                                <span class="text-xs px-2 py-0.5 rounded-full" style="background-color: ${status?.farbe}20; color: ${status?.farbe};">
                                                    ${status?.icon || ''} ${status?.label || g.status}
                                                </span>
                                                <span class="text-xs text-gray-500">📁 ${thema?.name || 'Unbekannt'}</span>
                                            </div>
                                            <p class="font-bold text-gray-800 text-sm truncate">
                                                ${g.geschenk || 'Keine Beschreibung'}
                                            </p>
                                            <p class="text-xs text-gray-600 mt-1">
                                                🎁 <strong>FÜR:</strong> ${fuerName} • 
                                                🎀 <strong>VON:</strong> ${vonName}
                                                ${g.gesamtKosten ? ` • 💰 ${g.gesamtKosten.toFixed(2)} €` : ''}
                                            </p>
                                        </div>
                                    </label>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    <div class="mt-2 flex gap-2">
                        <button onclick="window.selectAllGeschenke(true)" 
                            class="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-bold">
                            ✅ Alle auswählen
                        </button>
                        <button onclick="window.selectAllGeschenke(false)" 
                            class="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-bold">
                            ❌ Alle abwählen
                        </button>
                    </div>
                `;
            }
            
            // Setze HTML für "einzelneEintraege" direkt (da async)
            detailsContainer.innerHTML = html;
            return; // Früher Return, da HTML bereits gesetzt
        }
    } else if (filterTyp.includes('Person')) {
        // Person-Auswahl
        const kontakte = Object.values(KONTAKTE);
        html = `
            <label class="block text-sm font-bold text-gray-700 mb-3">Person(en) auswählen:</label>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 bg-gray-50 rounded">
                ${kontakte.map(k => `
                    <label class="flex items-center gap-2 p-2 hover:bg-blue-100 rounded cursor-pointer">
                        <input type="checkbox" 
                            name="filter-wert-checkbox" 
                            value="${k.id}"
                            class="w-4 h-4 text-blue-600 rounded">
                        <span class="text-sm ${k.istEigenePerson ? 'font-bold text-blue-600' : ''}">${k.name}</span>
                    </label>
                `).join('')}
            </div>
        `;
    } else if (filterTyp.includes('Konto')) {
        // Konto-Auswahl
        const konten = Object.entries(ZAHLUNGSARTEN);
        html = `
            <label class="block text-sm font-bold text-gray-700 mb-3">Konto auswählen:</label>
            <div class="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto p-2 bg-gray-50 rounded">
                ${konten.map(([key, config]) => `
                    <label class="flex items-center gap-2 p-2 hover:bg-blue-100 rounded cursor-pointer">
                        <input type="radio" 
                            name="filter-wert-radio" 
                            value="${key}"
                            class="w-4 h-4 text-blue-600">
                        <span class="text-sm">${config.label}</span>
                    </label>
                `).join('')}
            </div>
        `;
    }
    
    detailsContainer.innerHTML = html;
};

// Helper: Alle Geschenke auswählen/abwählen
window.selectAllGeschenke = function(select) {
    const checkboxes = document.querySelectorAll('input[name="filter-geschenk-checkbox"]');
    checkboxes.forEach(cb => cb.checked = select);
};

// Helper: Lade Geschenke aus mehreren Themen (für Freigabe-System)
async function loadGeschenkeFromMultipleThemen(themaIds) {
    console.log("🔍 DIAGNOSE - loadGeschenkeFromMultipleThemen:");
    console.log("  themaIds:", themaIds);
    console.log("  auth.currentUser.uid:", auth?.currentUser?.uid);
    console.log("  currentUser:", currentUser);
    console.log("  THEMEN:", THEMEN);
    
    // ✅ KORRIGIERT: Prüfe auth.currentUser.uid
    if (!db || !themaIds || themaIds.length === 0) {
        console.warn("⚠️ Abbruch: db, themaIds oder currentUser fehlt");
        return [];
    }
    
    if (!auth?.currentUser?.uid) {
        console.error("❌ FEHLER: auth.currentUser.uid nicht verfügbar!");
        alertUser("Fehler: Benutzer nicht authentifiziert. Bitte neu einloggen!", "error");
        return [];
    }
    
    const alleGeschenke = [];
    
    for (const themaId of themaIds) {
        try {
            const thema = THEMEN[themaId];
            
            if (!thema) {
                console.warn(`⚠️ Thema ${themaId} nicht in THEMEN gefunden`);
                continue;
            }
            
            // ✅ KORRIGIERT: Verwende auth.currentUser.uid!
            // Bei eigenen Themen: verwende auth.currentUser.uid
            // Bei geteilten Themen: verwende besitzerUid
            let ownerUid;
            
            if (thema.istGeteilt) {
                ownerUid = thema.besitzerUid;
            } else {
                ownerUid = auth.currentUser.uid;
            }
            
            console.log(`  📁 Lade Thema "${thema.name}" (${themaId})`);
            console.log(`     Owner UID: ${ownerUid}`);
            console.log(`     Ist geteilt: ${thema.istGeteilt}`);
            
            const geschenkeRef = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke_themen', themaId, 'geschenke');
            console.log(`     Pfad: ${geschenkeRef.path}`);
            
            const geschenkeSnapshot = await getDocs(geschenkeRef);
            console.log(`     Gefunden: ${geschenkeSnapshot.size} Geschenke`);
            
            geschenkeSnapshot.forEach((docSnap) => {
                alleGeschenke.push({
                    id: docSnap.id,
                    themaId: themaId,  // ✅ ThemaId hinzugefügt!
                    ...docSnap.data()
                });
            });
        } catch (error) {
            console.error(`❌ Fehler beim Laden der Geschenke aus Thema ${themaId}:`, error);
            console.error(`   Fehlermeldung: ${error.message}`);
        }
    }
    
    console.log(`✅ GESAMT: ${alleGeschenke.length} Geschenke aus ${themaIds.length} Themen geladen`);
    return alleGeschenke;
}

// Füge Regel zur Berechtigungsliste hinzu
window.addRegelToListe = function() {
    const filterTyp = document.getElementById('filter-typ-select')?.value;
    if (!filterTyp) return;
    
    // Hole ausgewählte Werte
    let selectedValues = [];
    let filterLabel = '';
    
    if (filterTyp === 'einzelneEintraege') {
        // Einzelne Einträge
        const checkboxes = document.querySelectorAll('input[name="filter-geschenk-checkbox"]:checked');
        if (checkboxes.length === 0) {
            alertUser('Bitte wähle mindestens einen Eintrag aus', 'warning');
            return;
        }
        selectedValues = Array.from(checkboxes).map(cb => {
            const geschenk = GESCHENKE[cb.value];
            return {
                id: cb.value,
                name: geschenk?.geschenk || 'Unbekannt',
                fuer: KONTAKTE[geschenk?.fuer]?.name || '?',
                von: KONTAKTE[geschenk?.von]?.name || '?'
            };
        });
        filterLabel = '📋 Einzelne Einträge';
    } else if (filterTyp.includes('Person')) {
        const checkboxes = document.querySelectorAll('input[name="filter-wert-checkbox"]:checked');
        if (checkboxes.length === 0) {
            alertUser('Bitte wähle mindestens eine Person aus', 'warning');
            return;
        }
        selectedValues = Array.from(checkboxes).map(cb => ({
            id: cb.value,
            name: KONTAKTE[cb.value]?.name || 'Unbekannt'
        }));
        
        switch(filterTyp) {
            case 'fuerPerson': filterLabel = '🎁 FÜR'; break;
            case 'vonPerson': filterLabel = '🎀 VON'; break;
            case 'beteiligungPerson': filterLabel = '👥 BETEILIGUNG'; break;
            case 'bezahltVonPerson': filterLabel = '💳 BEZAHLT VON'; break;
        }
    } else {
        const radio = document.querySelector('input[name="filter-wert-radio"]:checked');
        if (!radio) {
            alertUser('Bitte wähle ein Konto aus', 'warning');
            return;
        }
        selectedValues = [{
            id: radio.value,
            name: ZAHLUNGSARTEN[radio.value]?.label || 'Unbekannt'
        }];
        
        switch(filterTyp) {
            case 'sollBezahlungKonto': filterLabel = '💰 SOLL-Bezahlung'; break;
            case 'istBezahlungKonto': filterLabel = '✅ IST-Bezahlung'; break;
            case 'bezahlungKonto': filterLabel = '🏦 Bezahlung (SOLL/IST)'; break;
        }
    }
    
    // Hole Berechtigung
    const rechteRadio = document.querySelector('input[name="regel-rechte"]:checked');
    const rechte = rechteRadio?.value || 'lesen';
    
    // Füge zur Liste hinzu
    const regel = {
        id: Date.now(),
        filterTyp,
        filterLabel,
        selectedValues,
        rechte
    };
    
    window.berechtigungsListe.push(regel);
    renderBerechtigungsListe();
    
    // Reset
    document.getElementById('filter-typ-select').value = '';
    document.getElementById('filter-details-container').classList.add('hidden');
    document.getElementById('rechte-container').classList.add('hidden');
    document.getElementById('add-regel-btn').classList.add('hidden');
};

// Rendere Berechtigungsliste
function renderBerechtigungsListe() {
    const container = document.getElementById('berechtigungs-liste');
    if (!container) return;
    
    if (window.berechtigungsListe.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Noch keine Berechtigungen hinzugefügt</p>';
        return;
    }
    
    container.innerHTML = window.berechtigungsListe.map(regel => {
        let detailsHtml = '';
        
        if (regel.filterTyp === 'einzelneEintraege') {
            // Spezielle Darstellung für einzelne Einträge
            detailsHtml = `
                <div class="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    ${regel.selectedValues.map(v => `
                        <div class="text-xs bg-gray-50 p-2 rounded border">
                            <span class="font-mono text-gray-500">#${v.id?.slice(0, 8)}</span> • 
                            <span class="font-semibold">${v.name}</span><br>
                            <span class="text-gray-600">🎁 ${v.fuer} ← 🎀 ${v.von}</span>
                        </div>
                    `).join('')}
                </div>
                <p class="text-xs text-blue-600 font-bold mt-1">${regel.selectedValues.length} Eintrag/Einträge</p>
            `;
        } else {
            // Normale Darstellung für Personen/Konten
            detailsHtml = `
                <p class="text-xs text-gray-600">
                    ${regel.selectedValues.map(v => v.name).join(', ')}
                </p>
            `;
        }
        
        return `
            <div class="flex items-start justify-between p-3 bg-white rounded-lg border-2 border-blue-200">
                <div class="flex-1">
                    <p class="font-bold text-sm">${regel.filterLabel}</p>
                    ${detailsHtml}
                    <span class="inline-block mt-2 px-2 py-0.5 text-xs font-bold rounded ${regel.rechte === 'lesen' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                        ${regel.rechte === 'lesen' ? '👁️ Lesen' : '✏️ Bearbeiten'}
                    </span>
                </div>
                <button onclick="window.removeRegelFromListe(${regel.id})" 
                    class="ml-3 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-bold text-sm shrink-0">
                    🗑️
                </button>
            </div>
        `;
    }).join('');
}

// Entferne Regel aus Liste
window.removeRegelFromListe = function(regelId) {
    window.berechtigungsListe = window.berechtigungsListe.filter(r => r.id !== regelId);
    renderBerechtigungsListe();
};

window.addThemaFreigabe = function() {
    const container = document.getElementById('freigaben-container');
    if (!container) return;
    
    const themenArray = Object.values(THEMEN).filter(t => !t.archiviert);
    const freigabeId = `freigabe-${freigabenCounter++}`;
    
    const freigabeDiv = document.createElement('div');
    freigabeDiv.id = freigabeId;
    freigabeDiv.className = 'border-2 border-blue-300 rounded-lg p-4 bg-blue-50';
    freigabeDiv.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-lg text-blue-800">📁 Neue Freigabe</h4>
            <button onclick="window.removeFreigabe('${freigabeId}')" class="text-red-500 hover:text-red-700 font-bold">
                ✕ Entfernen
            </button>
        </div>
        
        <!-- Thema-Auswahl -->
        <div class="mb-4">
            <label class="block text-sm font-bold text-gray-700 mb-2">Thema auswählen:</label>
            <select id="${freigabeId}-thema" onchange="window.updateFreigabeTypOptions('${freigabeId}')" 
                class="w-full p-3 border-2 border-gray-300 rounded-lg focus:border-blue-500">
                <option value="">-- Thema wählen --</option>
                ${themenArray.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
            </select>
        </div>
        
        <div id="${freigabeId}-config" class="hidden">
            <!-- Freigabe-Typ -->
            <div class="mb-4 p-3 bg-white rounded-lg border-2">
                <label class="block text-sm font-bold text-gray-700 mb-2">Freigabe-Typ:</label>
                <div class="space-y-2">
                    <label class="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-blue-50">
                        <input type="radio" name="${freigabeId}-typ" value="komplett" 
                            onchange="window.updateFreigabeConfig('${freigabeId}')"
                            class="w-4 h-4 text-blue-600">
                        <div>
                            <p class="font-semibold">📂 Komplettes Thema teilen</p>
                            <p class="text-xs text-gray-500">Person sieht ALLE Einträge im Thema</p>
                        </div>
                    </label>
                    <label class="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-blue-50">
                        <input type="radio" name="${freigabeId}-typ" value="gefiltert" checked
                            onchange="window.updateFreigabeConfig('${freigabeId}')"
                            class="w-4 h-4 text-blue-600">
                        <div>
                            <p class="font-semibold">🔍 Gefilterte Ansicht</p>
                            <p class="text-xs text-gray-500">Nur bestimmte Einträge anzeigen (nach Kriterien)</p>
                        </div>
                    </label>
                </div>
            </div>
            
            <!-- Rechte -->
            <div class="mb-4 p-3 bg-white rounded-lg border-2">
                <label class="block text-sm font-bold text-gray-700 mb-2">Berechtigungen:</label>
                <div class="flex gap-3">
                    <label class="flex-1 flex items-center gap-2 p-3 rounded cursor-pointer hover:bg-blue-50 border-2 border-gray-300">
                        <input type="radio" name="${freigabeId}-rechte" value="lesen" checked
                            class="w-4 h-4 text-blue-600">
                        <div>
                            <p class="font-semibold">👁️ Leserechte</p>
                            <p class="text-xs text-gray-500">Nur ansehen</p>
                        </div>
                    </label>
                    <label class="flex-1 flex items-center gap-2 p-3 rounded cursor-pointer hover:bg-green-50 border-2 border-gray-300">
                        <input type="radio" name="${freigabeId}-rechte" value="bearbeiten"
                            class="w-4 h-4 text-green-600">
                        <div>
                            <p class="font-semibold">✏️ Bearbeitungsrechte</p>
                            <p class="text-xs text-gray-500">Ansehen & ändern</p>
                        </div>
                    </label>
                </div>
            </div>
            
            <!-- Filter-Konfiguration (nur bei "gefiltert") -->
            <div id="${freigabeId}-filter" class="p-3 bg-white rounded-lg border-2">
                <label class="block text-sm font-bold text-gray-700 mb-2">Filter-Kriterien:</label>
                <p class="text-xs text-gray-600 mb-3">Wähle aus, welche Einträge sichtbar sein sollen:</p>
                
                <div class="space-y-3">
                    ${renderFilterOption(freigabeId, 'fuerPersonen', '🎁 FÜR Person(en)', 'Nur Geschenke FÜR diese Person(en) anzeigen')}
                    ${renderFilterOption(freigabeId, 'vonPersonen', '🎀 VON Person(en)', 'Nur Geschenke VON diese Person(en) anzeigen')}
                    ${renderFilterOption(freigabeId, 'beteiligungPersonen', '👥 BETEILIGUNG Person(en)', 'Nur Geschenke mit Beteiligung dieser Person(en)')}
                    ${renderFilterOption(freigabeId, 'bezahltVonPersonen', '💳 BEZAHLT VON Person(en)', 'Nur Geschenke die von diesen Person(en) bezahlt wurden')}
                    ${renderFilterOption(freigabeId, 'sollBezahlungKonten', '💰 SOLL-Bezahlung Konto(en)', 'Nur Geschenke mit diesen SOLL-Bezahlarten')}
                    ${renderFilterOption(freigabeId, 'istBezahlungKonten', '✅ IST-Bezahlung Konto(en)', 'Nur Geschenke mit diesen IST-Bezahlarten')}
                    ${renderFilterOption(freigabeId, 'bezahlungKonten', '🏦 Bezahlung Konto(en) (SOLL ODER IST)', 'Geschenke wo Konto bei SOLL ODER IST vorkommt')}
                    ${renderFilterOption(freigabeId, 'spezifischeIds', '🔖 Spezifische Einträge', 'Bestimmte Einträge per ID auswählen')}
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(freigabeDiv);
};

function renderFilterOption(freigabeId, filterType, label, description) {
    return `
        <div class="border rounded-lg p-2 hover:bg-blue-50">
            <label class="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" 
                    id="${freigabeId}-filter-${filterType}" 
                    onchange="window.toggleFilterDetails('${freigabeId}', '${filterType}')"
                    class="w-4 h-4 text-blue-600 rounded mt-1">
                <div class="flex-1">
                    <p class="font-semibold text-sm">${label}</p>
                    <p class="text-xs text-gray-500">${description}</p>
                    <div id="${freigabeId}-filter-${filterType}-details" class="hidden mt-2">
                        <!-- Wird dynamisch befüllt -->
                    </div>
                </div>
            </label>
        </div>
    `;
}

window.updateFreigabeTypOptions = function(freigabeId) {
    const themaSelect = document.getElementById(`${freigabeId}-thema`);
    const configDiv = document.getElementById(`${freigabeId}-config`);
    
    if (themaSelect && themaSelect.value) {
        configDiv?.classList.remove('hidden');
        window.updateFreigabeConfig(freigabeId);
    } else {
        configDiv?.classList.add('hidden');
    }
};

window.updateFreigabeConfig = function(freigabeId) {
    const typRadios = document.getElementsByName(`${freigabeId}-typ`);
    const selectedTyp = Array.from(typRadios).find(r => r.checked)?.value;
    const filterDiv = document.getElementById(`${freigabeId}-filter`);
    
    if (filterDiv) {
        if (selectedTyp === 'komplett') {
            filterDiv.style.display = 'none';
        } else {
            filterDiv.style.display = 'block';
        }
    }
};

window.toggleFilterDetails = function(freigabeId, filterType) {
    const checkbox = document.getElementById(`${freigabeId}-filter-${filterType}`);
    const detailsDiv = document.getElementById(`${freigabeId}-filter-${filterType}-details`);
    
    if (!checkbox || !detailsDiv) return;
    
    if (checkbox.checked) {
        detailsDiv.classList.remove('hidden');
        detailsDiv.innerHTML = renderFilterDetailsContent(freigabeId, filterType);
    } else {
        detailsDiv.classList.add('hidden');
        detailsDiv.innerHTML = '';
    }
};

function renderFilterDetailsContent(freigabeId, filterType) {
    const themaSelectEl = document.getElementById(`${freigabeId}-thema`);
    const themaId = themaSelectEl?.value;
    
    if (!themaId) return '<p class="text-xs text-gray-500">Bitte wähle zuerst ein Thema aus</p>';
    
    let options = [];
    
    // Bestimme Optionen basierend auf Filter-Typ
    if (filterType === 'fuerPersonen' || filterType === 'vonPersonen' || 
        filterType === 'beteiligungPersonen' || filterType === 'bezahltVonPersonen') {
        options = Object.values(KONTAKTE).map(k => ({ value: k.id, label: k.name }));
    } else if (filterType === 'sollBezahlungKonten' || filterType === 'istBezahlungKonten' || filterType === 'bezahlungKonten') {
        options = Object.entries(ZAHLUNGSARTEN).map(([k, v]) => ({ value: k, label: v.label }));
    } else if (filterType === 'spezifischeIds') {
        // Lade Einträge aus dem Thema
        return `
            <p class="text-xs text-gray-600 mb-2">Einträge auswählen oder IDs eingeben:</p>
            <div class="max-h-40 overflow-y-auto border rounded p-2 mb-2">
                <p class="text-xs text-gray-500 italic">Einträge werden geladen...</p>
            </div>
            <input type="text" 
                id="${freigabeId}-filter-${filterType}-input" 
                placeholder="Oder IDs kommagetrennt: abc123, def456"
                class="w-full p-2 border rounded text-xs">
        `;
    }
    
    if (options.length === 0) {
        return '<p class="text-xs text-gray-500">Keine Optionen verfügbar</p>';
    }
    
    return `
        <div class="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded">
            ${options.map(opt => `
                <label class="flex items-center gap-2 p-1 hover:bg-blue-100 rounded cursor-pointer text-xs">
                    <input type="checkbox" 
                        name="${freigabeId}-filter-${filterType}-values" 
                        value="${opt.value}"
                        class="w-3 h-3 text-blue-600 rounded">
                    <span>${opt.label}</span>
                </label>
            `).join('')}
        </div>
    `;
}

window.removeFreigabe = function(freigabeId) {
    const freigabeDiv = document.getElementById(freigabeId);
    if (freigabeDiv && confirm('Diese Freigabe-Konfiguration entfernen?')) {
        freigabeDiv.remove();
    }
};

// ========================================
// EINLADUNGSSYSTEM (NEU)
// ========================================

window.sendNeueFreigabeEinladungen = async function(userId) {
    const user = USERS[userId];
    if (!user) {
        console.error("❌ User nicht gefunden in USERS:", userId);
        return;
    }
    
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("📤 SENDE EINLADUNGEN");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("👤 Empfänger:", user.name);
    console.log("🆔 Firestore Doc ID:", userId);
    console.log("📋 Verfügbare Felder in USERS:", Object.keys(user));
    console.log("🗺️ User-UID-Mapping:", userNameToUidMapping);
    
    // Hole ausgewählte Themen
    const themaCheckboxes = document.querySelectorAll('[id^="thema-select-"]:checked');
    if (themaCheckboxes.length === 0) {
        alertUser('Bitte wähle mindestens ein Thema aus', 'warning');
        return;
    }
    
    if (window.berechtigungsListe.length === 0) {
        alertUser('Bitte füge mindestens eine Berechtigung hinzu', 'warning');
        return;
    }
    
    const selectedThemen = Array.from(themaCheckboxes).map(cb => cb.value);
    
    try {
        // Erstelle für jedes Thema eine Einladung
        for (const themaId of selectedThemen) {
            const thema = THEMEN[themaId];
            if (!thema) continue;
            
            // Konvertiere Berechtigungsliste in Filter-Format
            const filter = {};
            const rechteMap = {}; // Für jede Regel die Rechte speichern
            
            window.berechtigungsListe.forEach(regel => {
                const filterKey = regel.filterTyp;
                const valueIds = regel.selectedValues.map(v => v.id);
                
                // Speichere Filter
                filter[filterKey] = valueIds;
                
                // Speichere Rechte für diese Regel
                rechteMap[filterKey] = regel.rechte;
            });
            
            console.log(`📤 Erstelle Einladung für: ${user.name} für Thema: ${thema.name}`);
            
            // ✅ PUNKT 2: Starke Duplikat-Prüfung
            const myUserId = getCurrentUserId();
            const empfaengerName = user.displayName || user.name;
            
            // Prüfe auf JEDE existierende Einladung (nicht nur pending!)
            const existingEinladung = Object.values(EINLADUNGEN).find(e =>
                e.empfaengerName === empfaengerName &&
                e.absenderId === myUserId &&
                e.themaId === themaId
            );
            
            // Wenn bereits eine Einladung existiert (egal welcher Status)
            if (existingEinladung && existingEinladung.status !== 'pending') {
                if (existingEinladung.status === 'accepted') {
                    console.log(`⚠️ Thema wurde bereits geteilt und angenommen!`);
                    alertUser(`"${thema.name}" wurde bereits mit ${empfaengerName} geteilt!`, 'warning');
                    continue; // Überspringe
                }
                if (existingEinladung.status === 'declined') {
                    console.log(`⚠️ ${empfaengerName} hat diese Einladung bereits abgelehnt!`);
                    alertUser(`${empfaengerName} hat "${thema.name}" bereits abgelehnt.`, 'warning');
                    continue; // Überspringe
                }
            }
            
            if (existingEinladung) {
                console.log("🔄 Aktualisiere bestehende Einladung");
                await updateDoc(doc(geschenkeEinladungenRef, existingEinladung.id), {
                    filter,
                    rechteMap,
                    freigabeTyp: 'gefiltert',
                    aktualisiertAm: serverTimestamp()
                });
            } else {
                console.log("➕ Erstelle neue Einladung");
                // ✅ LÖSUNG: Verwende Namen-basiertes Matching!
                const einladungData = {
                    absenderId: myUserId,
                    absenderName: currentUser.displayName,
                    besitzerId: myUserId,
                    besitzerUid: auth.currentUser.uid,
                    empfaengerId: userId,  // Firestore Doc ID (für Rückwärtskompatibilität)
                    empfaengerName: empfaengerName,  // ✅ WICHTIG: Name für Matching!
                    themaId,
                    themaName: thema.name,
                    filter,
                    rechteMap,
                    freigabeTyp: 'gefiltert',
                    status: 'pending',
                    erstelltAm: serverTimestamp()
                };
                
                console.log("📨 Einladungs-Daten:", {
                    empfaengerName: einladungData.empfaengerName,
                    themaName: einladungData.themaName,
                    absenderName: einladungData.absenderName
                });
                
                await addDoc(geschenkeEinladungenRef, einladungData);
                console.log("✅ Einladung erfolgreich erstellt!");
            }
        }
        
        // ✅ KEIN loadEinladungen() mehr nötig - der Echtzeit-Listener updated automatisch!
        alertUser(`📧 ${selectedThemen.length} Einladung(en) erfolgreich gesendet!`, 'success');
        window.closeFreigabeEditor();
        // renderFreigabenVerwaltung() wird automatisch durch Listener aktualisiert
    } catch (e) {
        console.error('Fehler beim Senden:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ALTE Funktion (behalten für Kompatibilität)
window.sendFreigabeEinladungen = async function(userId) {
    const user = USERS[userId];
    if (!user) return;
    
    // Sammle alle konfigurierten Freigaben
    const freigabenConfigs = [];
    const freigabenDivs = document.querySelectorAll('[id^="freigabe-"]');
    
    freigabenDivs.forEach(div => {
        const freigabeId = div.id;
        const themaSelect = document.getElementById(`${freigabeId}-thema`);
        const themaId = themaSelect?.value;
        
        if (!themaId) return; // Keine Thema ausgewählt
        
        const thema = THEMEN[themaId];
        if (!thema) return;
        
        // Freigabe-Typ
        const typRadios = document.getElementsByName(`${freigabeId}-typ`);
        const freigabeTyp = Array.from(typRadios).find(r => r.checked)?.value || 'gefiltert';
        
        // Rechte
        const rechteRadios = document.getElementsByName(`${freigabeId}-rechte`);
        const rechte = Array.from(rechteRadios).find(r => r.checked)?.value || 'lesen';
        
        // Filter (nur wenn "gefiltert")
        const filter = {};
        if (freigabeTyp === 'gefiltert') {
            const filterTypes = ['fuerPersonen', 'vonPersonen', 'beteiligungPersonen', 'bezahltVonPersonen',
                                'sollBezahlungKonten', 'istBezahlungKonten', 'bezahlungKonten', 'spezifischeIds'];
            
            filterTypes.forEach(filterType => {
                const checkbox = document.getElementById(`${freigabeId}-filter-${filterType}`);
                if (checkbox && checkbox.checked) {
                    if (filterType === 'spezifischeIds') {
                        const input = document.getElementById(`${freigabeId}-filter-${filterType}-input`);
                        if (input && input.value.trim()) {
                            filter[filterType] = input.value.split(',').map(id => id.trim()).filter(id => id);
                        }
                    } else {
                        const selectedValues = Array.from(document.querySelectorAll(`input[name="${freigabeId}-filter-${filterType}-values"]:checked`))
                            .map(cb => cb.value);
                        if (selectedValues.length > 0) {
                            filter[filterType] = selectedValues;
                        }
                    }
                }
            });
        }
        
        freigabenConfigs.push({
            themaId,
            themaName: thema.name,
            freigabeTyp,
            rechte,
            filter
        });
    });
    
    if (freigabenConfigs.length === 0) {
        alertUser('Bitte konfiguriere mindestens eine Freigabe', 'warning');
        return;
    }
    
    try {
        // Erstelle Einladungen für jede Freigabe
        const myUserId = getCurrentUserId();
        for (const config of freigabenConfigs) {
            // Prüfe ob bereits eine Einladung für dieses Thema existiert
            const existingEinladung = Object.values(EINLADUNGEN).find(e =>
                e.empfaengerId === userId &&
                e.absenderId === myUserId &&
                e.themaId === config.themaId &&
                e.status === 'pending'
            );
            
            if (existingEinladung) {
                // Update existierende Einladung
                await updateDoc(doc(geschenkeEinladungenRef, existingEinladung.id), {
                    freigabeTyp: config.freigabeTyp,
                    rechte: config.rechte,
                    filter: config.filter,
                    aktualisiertAm: serverTimestamp()
                });
            } else {
                // Erstelle neue Einladung
                await addDoc(geschenkeEinladungenRef, {
                    absenderId: myUserId,
                    absenderName: currentUser.displayName,
                    besitzerId: myUserId,  // ✅ Owner des Themas
                    besitzerUid: auth.currentUser.uid,  // ✅ Firebase Auth UID des Owners
                    empfaengerId: userId,
                    empfaengerName: user.displayName || user.name,
                    themaId: config.themaId,
                    themaName: config.themaName,
                    freigabeTyp: config.freigabeTyp,
                    rechte: config.rechte,
                    filter: config.filter,
                    status: 'pending',
                    erstelltAm: serverTimestamp()
                });
            }
        }
        
        // ✅ KEIN loadEinladungen() mehr nötig - der Echtzeit-Listener updated automatisch!
        alertUser(`📧 ${freigabenConfigs.length} Einladung(en) erfolgreich gesendet!`, 'success');
        window.closeFreigabeEditor();
        // renderFreigabenVerwaltung() wird automatisch durch Listener aktualisiert
    } catch (e) {
        console.error('Fehler beim Senden der Einladungen:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Freigabe löschen
window.deleteFreigabe = async function(freigabeId) {
    if (!confirm('Diese Freigabe wirklich entfernen?')) return;
    
    try {
        await deleteDoc(doc(geschenkeFreigabenRef, freigabeId));
        // ✅ Löschung wird durch Listener automatisch erkannt und UI aktualisiert
        alertUser('Freigabe entfernt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ✅ NEU: Einladung zurücknehmen (für Absender)
window.cancelEinladung = async function(einladungId) {
    if (!confirm('Einladung wirklich zurücknehmen?')) return;
    
    try {
        await deleteDoc(doc(geschenkeEinladungenRef, einladungId));
        // ✅ Löschung wird durch Listener automatisch erkannt und UI aktualisiert
        alertUser('Einladung zurückgenommen!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.closeFreigabeEditor = function() {
    const modal = document.getElementById('freigabeEditorModal');
    if (modal) modal.remove();
};

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

// ========================================
// OPTIONEN VERWALTUNG (für Einstellungen)
// ========================================
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

// ========================================
// GLOBALE FUNKTIONEN (für onclick)
// ========================================
window.filterByPerson = function(personId) {
    currentFilter.personId = personId;
    renderGeschenkeTabelle();
};

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
            
            // ✅ KORRIGIERT: Zentrale Collection
            const themaDocRef = doc(geschenkeThemenRef, currentThemaId);
            
            await updateDoc(themaDocRef, { personen });
            THEMEN[currentThemaId].personen = personen;
            personenDetailsAusgeklappt = true; // ✅ Nach Hinzufügen ausgeklappt lassen
            renderPersonenUebersicht();
            alertUser(`${kontakt.name} wurde hinzugefügt!`, 'success');
        }
        document.getElementById('addPersonModal').style.display = 'none';
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.deleteKontakt = async function(id) {
    if (!confirm('Kontakt wirklich löschen?')) return;
    try {
        await deleteDoc(doc(geschenkeKontakteRef, id));
        // ✅ KONTAKTE wird automatisch durch listenForKontakte() aktualisiert
        // ✅ UI wird automatisch aktualisiert
        alertUser('Kontakt gelöscht!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// ✅ Kontakt bearbeiten - Name wird systemweit aktualisiert
window.editKontakt = async function(id) {
    const kontakt = KONTAKTE[id];
    if (!kontakt) return;
    
    const newName = prompt('Neuer Name für den Kontakt:', kontakt.name);
    if (!newName || newName.trim() === '' || newName === kontakt.name) return;
    
    try {
        // Update in Firestore
        await updateDoc(doc(geschenkeKontakteRef, id), { name: newName.trim() });
        
        // ✅ KONTAKTE wird automatisch durch listenForKontakte() aktualisiert
        // ✅ UI wird automatisch systemweit aktualisiert (Kontaktbuch, Personen-Übersicht, Tabelle)
        
        alertUser('Kontakt aktualisiert! Namen werden überall im System übernommen.', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.editThema = function(id) {
    const thema = THEMEN[id];
    const newName = prompt('Neuer Name für das Thema:', thema.name);
    if (newName && newName !== thema.name) {
        // ✅ KORRIGIERT: Zentrale Collection
        const themaDocRef = doc(geschenkeThemenRef, id);
        
        updateDoc(themaDocRef, { name: newName }).then(() => {
            // ✅ THEMEN wird automatisch durch listenForThemen() aktualisiert
            // ✅ UI wird automatisch aktualisiert
            alertUser('Thema umbenannt!', 'success');
        }).catch(e => {
            alertUser('Fehler: ' + e.message, 'error');
        });
    }
};

window.toggleArchiveThema = async function(id) {
    const thema = THEMEN[id];
    try {
        // ✅ KORRIGIERT: Zentrale Collection
        const themaDocRef = doc(geschenkeThemenRef, id);
        
        await updateDoc(themaDocRef, { archiviert: !thema.archiviert });
        // ✅ THEMEN wird automatisch durch listenForThemen() aktualisiert
        // ✅ UI wird automatisch aktualisiert
        alertUser(thema.archiviert ? 'Thema wiederhergestellt!' : 'Thema archiviert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

window.deleteThema = async function(id) {
    if (!confirm('Thema und alle Geschenke darin wirklich löschen?')) return;
    const thema = THEMEN[id];
    
    try {
        // ✅ KORRIGIERT: Zentrale Collection
        const themaDocRef = doc(geschenkeThemenRef, id);
        
        await deleteDoc(themaDocRef);
        // ✅ THEMEN wird automatisch durch listenForThemen() aktualisiert
        // ✅ UI wird automatisch aktualisiert
        alertUser('Thema gelöscht!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Thema erstellen
window.createNewThema = async function() {
    const name = prompt('Name des neuen Themas (z.B. "Weihnachten 2025"):');
    if (!name) return;
    
    try {
        const themaData = {
            name: name.trim(),
            ersteller: currentUser.displayName || 'Unbekannt',
            besitzerUserId: currentUser.mode,  // ✅ App User ID für Freigaben
            erstelltAm: serverTimestamp(),
            personen: [],
            archiviert: false
        };
        console.log("📝 Erstelle neues Thema für User:", currentUser.mode, "Name:", themaData.name);
        
        const docRef = await addDoc(geschenkeThemenRef, themaData);
        // ✅ THEMEN wird automatisch durch listenForThemen() aktualisiert
        currentThemaId = docRef.id;
        localStorage.setItem('gm_current_thema', docRef.id);
        // ✅ UI wird automatisch durch Listener aktualisiert
        updateCollectionForThema();
        alertUser('Thema erstellt!', 'success');
    } catch (e) {
        console.error("Fehler beim Erstellen des Themas:", e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Kontakt erstellen
window.createNewKontakt = async function() {
    const name = prompt('Name des neuen Kontakts:');
    if (!name) return;
    
    try {
        const kontaktData = {
            name: name.trim(),
            erstelltAm: serverTimestamp(),
            erstelltVon: currentUser.displayName
        };
        await addDoc(geschenkeKontakteRef, kontaktData);
        // ✅ KONTAKTE wird automatisch durch listenForKontakte() aktualisiert
        // ✅ UI wird automatisch aktualisiert
        alertUser('Kontakt erstellt!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Geschenk kopieren - öffnet Modal zum Bearbeiten der Kopie
window.copyGeschenk = function(id) {
    const original = GESCHENKE[id];
    if (!original) return;
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    // Kopie-Daten vorbereiten
    const kopie = { ...original };
    // ✅ KEIN "(Kopie)" mehr im Titel - Benutzer-Wunsch
    
    // Modal als "Kopie bearbeiten" öffnen
    document.getElementById('geschenkModalTitle').innerHTML = `
        <span>Kopie erstellen</span>
        <span class="block text-sm font-normal bg-yellow-400 text-yellow-900 px-2 py-1 rounded mt-1">⚠️ Hier wird die KOPIE bearbeitet</span>
    `;
    document.getElementById('gm-id').value = ''; // Leere ID = neuer Eintrag
    document.getElementById('gm-id').setAttribute('data-is-copy', 'true'); // Markierung dass es eine Kopie ist
    
    fillModalForm(kopie);
    renderModalSelects(kopie);
    updateModalActionButtons(false); // Keine Aktions-Buttons bei Kopie (inkl. "Vorlage laden")
    modal.style.display = 'flex';
};

// Geschenk löschen
window.deleteGeschenk = async function(id) {
    if (!confirm('Geschenk wirklich löschen?')) return;
    try {
        await deleteDoc(doc(geschenkeCollection, id));
        closeGeschenkModal(); // Modal schließen nach erfolgreichem Löschen
        alertUser('Geschenk gelöscht!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Als Vorlage speichern
window.saveAsVorlage = async function(id) {
    const geschenk = GESCHENKE[id];
    if (!geschenk) return;
    
    const name = prompt('Name der Vorlage:', geschenk.geschenk);
    if (!name) return;
    
    try {
        const geschenkCopy = { ...geschenk };
        delete geschenkCopy.id;
        delete geschenkCopy.erstelltAm;
        
        const vorlageData = {
            name: name.trim(),
            geschenk: geschenkCopy.geschenk || name.trim(), // Geschenkname für Anzeige
            shop: geschenkCopy.shop || '',
            gesamtkosten: geschenkCopy.gesamtkosten || 0,
            geschenkData: geschenkCopy,
            erstelltAm: serverTimestamp(),
            erstelltVon: currentUser.displayName
        };
        
        const docRef = await addDoc(geschenkeVorlagenRef, vorlageData);
        VORLAGEN[docRef.id] = { id: docRef.id, ...vorlageData };
        alertUser('Vorlage gespeichert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Vorlage anwenden - füllt das Modal mit Vorlagendaten
window.applyVorlage = function(vorlageId) {
    const vorlage = VORLAGEN[vorlageId];
    if (!vorlage) return;
    
    // Prüfe ob ein Thema ausgewählt ist
    if (!currentThemaId) {
        alertUser('Bitte erstelle zuerst ein Thema, bevor du eine Vorlage einfügst.', 'warning');
        return;
    }
    
    const thema = THEMEN[currentThemaId];
    if (!thema?.personen || thema.personen.length === 0) {
        alertUser('Bitte füge zuerst Personen zum Thema hinzu.', 'warning');
        return;
    }
    
    closeVorlagenModal();
    
    const modal = document.getElementById('geschenkModal');
    if (!modal) return;
    
    // Geschenkdaten aus der Vorlage extrahieren
    const geschenkData = vorlage.geschenkData || vorlage;
    
    document.getElementById('geschenkModalTitle').innerHTML = `
        <span>Neues Geschenk aus Vorlage</span>
        <span class="block text-sm font-normal bg-purple-200 text-purple-800 px-2 py-1 rounded mt-1">📑 Vorlage: ${vorlage.name || 'Unbenannt'}</span>
    `;
    const idField = document.getElementById('gm-id');
    idField.value = ''; // Leere ID = neuer Eintrag
    idField.removeAttribute('data-is-copy'); // Keine Kopie, sondern Vorlage
    
    fillModalForm(geschenkData);
    renderModalSelects(geschenkData);
    updateModalActionButtons(false, false); // Keine Aktions-Buttons, kein "Vorlage laden" (da bereits geladen)
    modal.style.display = 'flex';
    
    alertUser('Vorlage geladen! Passe die Daten an und speichere.', 'info');
};

// Vorlagen-Modal öffnen
window.openVorlagenModal = function() {
    let modal = document.getElementById('vorlagenModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'vorlagenModal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    const vorlagenArray = Object.values(VORLAGEN);
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div class="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
                <h3 class="text-xl font-bold">📑 Vorlagen verwalten</h3>
                <button onclick="closeVorlagenModal()" class="text-white/80 hover:text-white transition">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            
            <div class="p-4 overflow-y-auto max-h-[60vh]">
                ${vorlagenArray.length === 0 ? `
                    <div class="text-center py-8 text-gray-500">
                        <span class="text-4xl">📂</span>
                        <p class="mt-2 font-semibold">Keine Vorlagen vorhanden</p>
                        <p class="text-sm">Speichere ein Geschenk als Vorlage, um es hier zu sehen.</p>
                    </div>
                ` : `
                    <div class="space-y-3">
                        ${vorlagenArray.map(v => `
                            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200 hover:border-purple-300 transition">
                                <div class="flex items-center justify-between">
                                    <div class="flex-1">
                                        <p class="font-bold text-gray-800">${v.name || v.geschenk || 'Unbenannte Vorlage'}</p>
                                        <p class="text-sm text-gray-500">
                                            ${v.shop ? `🛍️ ${v.shop}` : ''}
                                            ${v.gesamtkosten ? ` • ${formatCurrency(v.gesamtkosten)}` : ''}
                                        </p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button onclick="window.applyVorlage('${v.id}')" 
                                            class="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-bold">
                                            ➕ Einfügen
                                        </button>
                                        <button onclick="window.deleteVorlage('${v.id}')" 
                                            class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm">
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
            
            <div class="sticky bottom-0 bg-gray-100 p-4 rounded-b-2xl">
                <button onclick="closeVorlagenModal()" class="w-full px-4 py-2 bg-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-400 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
};

function closeVorlagenModal() {
    const modal = document.getElementById('vorlagenModal');
    if (modal) modal.style.display = 'none';
}
window.closeVorlagenModal = closeVorlagenModal;

// Vorlage löschen
window.deleteVorlage = async function(vorlageId) {
    if (!confirm('Vorlage wirklich löschen?')) return;
    
    try {
        await deleteDoc(doc(geschenkeVorlagenRef, vorlageId));
        delete VORLAGEN[vorlageId];
        alertUser('Vorlage gelöscht!', 'success');
        window.openVorlagenModal(); // Modal neu rendern
    } catch (e) {
        alertUser('Fehler beim Löschen: ' + e.message, 'error');
    }
};

// ========================================
// EINLADUNGEN, BUDGETS, ERINNERUNGEN - ECHTZEIT-LISTENER
// ========================================

// 🎧 NEUER Einladungen-Listener
function listenForEinladungen() {
    if (!geschenkeEinladungenRef) {
        console.error("❌ Einladungen-Ref fehlt");
        return;
    }
    
    console.log("🎧 NEU: Einladungen-Listener gestartet");
    
    onSnapshot(geschenkeEinladungenRef, (snapshot) => {
        console.log(`📨 Einladungen: ${snapshot.size} Dokumente`);
        
        // Cache leeren und neu füllen
        EINLADUNGEN = {};
        snapshot.forEach(doc => {
            EINLADUNGEN[doc.id] = { id: doc.id, ...doc.data() };
        });
        
        console.log("✅ Einladungen geladen:", Object.keys(EINLADUNGEN).length);
        
        // Prüfe auf offene Einladungen für mich
        const myName = currentUser?.displayName;
        const pending = Object.values(EINLADUNGEN).filter(e => 
            e.empfaengerName === myName && e.status === 'pending'
        );
        
        console.log(`📨 ${pending.length} offene Einladungen für ${myName}`);
        
        // Badge aktualisieren
        updateInvitationBadge(pending.length);
        
        // ✅ Dashboard-Alert aktualisieren
        showPendingInvitationsAlert(pending.length);
        
        // UI aktualisieren
        if (document.getElementById('gm-freigaben-list')) {
            renderShareSettings();
        }
    });
}

// 🔴 Badge für offene Einladungen
function updateInvitationBadge(count) {
    const badge = document.getElementById('gm-einladungen-badge');
    if (!badge) return;
    
    if (count > 0) {
        badge.innerHTML = `
            <button onclick="showInvitationsModal()" 
                class="px-4 py-2 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition animate-pulse">
                📨 ${count} Einladung${count > 1 ? 'en' : ''}
            </button>
        `;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

// ✅ Legacy-Funktion für Kompatibilität (wird nicht mehr verwendet)
async function loadEinladungen() {
    console.warn("⚠️ loadEinladungen() ist veraltet, verwende listenForEinladungen()");
    try {
        const snapshot = await getDocs(geschenkeEinladungenRef);
        EINLADUNGEN = {};
        snapshot.forEach((docSnap) => {
            EINLADUNGEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
    } catch (e) {
        console.error("Fehler beim Laden der Einladungen:", e);
    }
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
    }, (error) => {
        console.error("Fehler beim Laden der Erinnerungen:", error);
    });
}

// ❌ VERALTET: Wird durch listenForErinnerungen() ersetzt
async function loadErinnerungen() {
    console.warn("⚠️ loadErinnerungen() ist veraltet, verwende listenForErinnerungen()");
    // Funktion bleibt leer, da Listener aktiv ist
}

// ========================================
// EINLADUNGSSYSTEM MIT ZUSTIMMUNG/ABLEHNUNG
// ========================================

// ✅ DEPRECATED: Diese Funktion wird nicht mehr verwendet, da der Echtzeit-Listener
// automatisch neue Einladungen erkennt und das Modal öffnet
function checkPendingInvitations() {
    console.warn("⚠️ checkPendingInvitations() ist veraltet - verwende den Echtzeit-Listener");
    const myUserId = getCurrentUserId();
    const pendingForMe = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerId === myUserId && e.status === 'pending'
    );
    
    if (pendingForMe.length > 0) {
        showPendingInvitationsModal(pendingForMe);
    }
}

function showPendingInvitationsModal(invitations) {
    // ✅ Prüfe ob Modal bereits offen ist
    const existingModal = document.getElementById('gm-einladungen-modal');
    if (existingModal) {
        console.log("ℹ️ Einladungs-Modal ist bereits offen - wird aktualisiert");
        existingModal.remove();
    }
    
    // ✅ Prüfe ob es überhaupt Einladungen gibt
    if (!invitations || invitations.length === 0) {
        console.log("ℹ️ Keine ausstehenden Einladungen");
        return;
    }
    
    console.log(`📨 Zeige Modal für ${invitations.length} Einladung(en)`);
    
    const modal = document.createElement('div');
    modal.id = 'gm-einladungen-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div class="bg-gradient-to-r from-green-500 to-blue-600 p-4 text-white">
                <h2 class="text-2xl font-bold">📨 Neue Einladungen!</h2>
                <p class="text-sm text-white/90 mt-1">Du hast ${invitations.length} ausstehende Einladung${invitations.length !== 1 ? 'en' : ''}</p>
            </div>
            <div class="p-4 max-h-[60vh] overflow-y-auto space-y-3">
                ${invitations.map(inv => {
                    const filterCount = inv.filter ? Object.keys(inv.filter).length : 0;
                    return `
                        <div class="border-2 border-blue-200 rounded-xl p-4 bg-gradient-to-br from-blue-50 to-purple-50">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                                    ${(inv.absenderName || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div class="flex-1">
                                    <p class="font-bold text-lg">${inv.absenderName || 'Unbekannt'}</p>
                                    <p class="text-sm text-gray-600">möchte ein Thema mit dir teilen</p>
                                </div>
                            </div>
                            
                            <div class="bg-white rounded-lg p-3 mb-3">
                                <p class="text-sm font-bold text-gray-700 mb-2">📁 Thema: <span class="text-blue-600">${inv.themaName || 'Unbekannt'}</span></p>
                                <div class="flex items-center gap-4 text-xs">
                                    <span class="px-2 py-1 rounded ${inv.freigabeTyp === 'komplett' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">
                                        ${inv.freigabeTyp === 'komplett' ? '📂 Komplett' : `🔍 Gefiltert (${filterCount} Filter)`}
                                    </span>
                                    <span class="px-2 py-1 rounded ${inv.rechte === 'lesen' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}">
                                        ${inv.rechte === 'lesen' ? '👁️ Leserechte' : '✏️ Bearbeitungsrechte'}
                                    </span>
                                </div>
                            </div>
                            
                            ${inv.freigabeTyp === 'gefiltert' && filterCount > 0 ? `
                                <div class="bg-white rounded-lg p-3 mb-3">
                                    <p class="text-xs font-bold text-gray-700 mb-2">🔍 Sichtbare Einträge:</p>
                                    <div class="grid grid-cols-2 gap-1 text-xs">
                                        ${inv.filter.fuerPersonen ? `<span class="text-blue-700">• FÜR ${inv.filter.fuerPersonen.length} Person(en)</span>` : ''}
                                        ${inv.filter.vonPersonen ? `<span class="text-purple-700">• VON ${inv.filter.vonPersonen.length} Person(en)</span>` : ''}
                                        ${inv.filter.beteiligungPersonen ? `<span class="text-green-700">• BETEILIGUNG ${inv.filter.beteiligungPersonen.length} Person(en)</span>` : ''}
                                        ${inv.filter.bezahltVonPersonen ? `<span class="text-orange-700">• BEZAHLT VON ${inv.filter.bezahltVonPersonen.length} Person(en)</span>` : ''}
                                        ${inv.filter.sollBezahlungKonten ? `<span class="text-cyan-700">• SOLL-Konto ${inv.filter.sollBezahlungKonten.length}x</span>` : ''}
                                        ${inv.filter.istBezahlungKonten ? `<span class="text-teal-700">• IST-Konto ${inv.filter.istBezahlungKonten.length}x</span>` : ''}
                                        ${inv.filter.bezahlungKonten ? `<span class="text-indigo-700">• Konto (SOLL/IST) ${inv.filter.bezahlungKonten.length}x</span>` : ''}
                                        ${inv.filter.spezifischeIds ? `<span class="text-pink-700">• ${inv.filter.spezifischeIds.length} spez. Einträge</span>` : ''}
                                    </div>
                                </div>
                            ` : ''}
                            
                            <div class="flex gap-2">
                                <button onclick="window.acceptGeschenkeInvitation('${inv.id}')" 
                                    class="flex-1 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-bold hover:shadow-lg transition flex items-center justify-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                    </svg>
                                    Annehmen
                                </button>
                                <button onclick="window.declineGeschenkeInvitation('${inv.id}')" 
                                    class="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-bold hover:shadow-lg transition flex items-center justify-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    Ablehnen
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="p-4 border-t">
                <button onclick="window.closeEinladungenModalAndRemind()" 
                    class="w-full py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition">
                    ⏰ Später entscheiden (Erinnerung bleibt sichtbar)
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Einladung annehmen (NEUES SYSTEM)
window.acceptGeschenkeInvitation = async function(invitationId) {
    try {
        const invitation = EINLADUNGEN[invitationId];
        if (!invitation) return;
        
        // Einladung akzeptieren
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'accepted',
            akzeptiertAm: serverTimestamp()
        });
        
        // ✅ NEU: Freigabe-ID nach Schema {themaId}_{userId} für Firestore Rules
        const freigabeId = `${invitation.themaId}_${currentUser.uid}`;
        
        // Freigabe erstellen mit NEUEM Datenmodell
        const myUserId = getCurrentUserId();
        const myName = currentUser.displayName;
        
        console.log("✅ Erstelle Freigabe:", {
            freigabeId: freigabeId,
            myUserId: myUserId,
            myName: myName,
            themaId: invitation.themaId,
            themaName: invitation.themaName
        });
        
        const freigabeData = {
            userId: myUserId,  // Für Kompatibilität
            userUid: auth.currentUser.uid,  // ✅ Firebase Auth UID (für Firestore Rules!)
            userName: myName,
            themaId: invitation.themaId,
            themaName: invitation.themaName,
            besitzerId: invitation.besitzerId,
            besitzerUid: invitation.besitzerUid,
            freigabeTyp: invitation.freigabeTyp,
            rechte: invitation.rechte,
            rechteMap: invitation.rechteMap || {},
            filter: invitation.filter || {},
            einladungId: invitationId,
            freigegebenVon: invitation.absenderId,
            freigegebenVonName: invitation.absenderName,
            aktiv: true,
            erstelltAm: serverTimestamp()
        };
        
        console.log("📝 Freigabe-Daten:", freigabeData);
        await setDoc(doc(geschenkeFreigabenRef, freigabeId), freigabeData);
        console.log("✅ Freigabe erfolgreich erstellt!");
        
        // ✅ Status wird durch Listener automatisch aktualisiert
        alertUser('✅ Einladung angenommen! Du kannst jetzt auf das Thema zugreifen.', 'success');
        
        document.getElementById('gm-einladungen-modal')?.remove();
        // loadFreigaben() und renderDashboard() werden durch Listener automatisch ausgeführt
    } catch (e) {
        console.error('Fehler beim Annehmen:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Einladung ablehnen
window.declineGeschenkeInvitation = async function(invitationId) {
    if (!confirm('Einladung wirklich ablehnen?\n\nDer Absender kann dich erst wieder einladen, wenn du die Ablehnung in deinen Einstellungen widerrufst.')) return;
    
    try {
        await updateDoc(doc(geschenkeEinladungenRef, invitationId), {
            status: 'declined',
            abgelehntAm: serverTimestamp()
        });
        
        // ✅ Status wird durch Listener automatisch aktualisiert
        alertUser('❌ Einladung abgelehnt. Du kannst die Ablehnung in deinen Einstellungen widerrufen.', 'info');
        
        document.getElementById('gm-einladungen-modal')?.remove();
        // checkPendingInvitations() nicht mehr nötig - Listener handled Updates
    } catch (e) {
        console.error('Fehler beim Ablehnen:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Ablehnung widerrufen
window.revokeDeclinedInvitation = async function(invitationId) {
    if (!confirm('Möchtest du deine Ablehnung wirklich widerrufen?\n\nDer Absender kann dir dann wieder neue Einladungen senden.')) return;
    
    try {
        // Lösche die abgelehnte Einladung komplett
        await deleteDoc(doc(geschenkeEinladungenRef, invitationId));
        // ✅ Löschung wird durch Listener automatisch erkannt
        
        alertUser('✅ Ablehnung widerrufen. Der Absender kann dich nun wieder einladen.', 'success');
        // loadEinladungen() und renderFreigabenVerwaltung() werden durch Listener automatisch ausgeführt
    } catch (e) {
        console.error('Fehler beim Widerruf:', e);
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Zeige abgelehnte Einladungen in Einstellungen
window.showDeclinedInvitations = function() {
    const myName = currentUser?.displayName;
    const declinedInvitations = Object.values(EINLADUNGEN).filter(e => 
        e.empfaengerName === myName && e.status === 'declined'
    );
    
    if (declinedInvitations.length === 0) {
        alertUser('Du hast keine abgelehnten Einladungen.', 'info');
        return;
    }
    
    let modal = document.getElementById('declined-invitations-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'declined-invitations-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div class="bg-gradient-to-r from-red-500 to-orange-600 p-4 text-white">
                <h2 class="text-2xl font-bold">❌ Abgelehnte Einladungen</h2>
                <p class="text-sm text-white/90 mt-1">Du kannst Ablehnungen widerrufen</p>
            </div>
            <div class="p-4 max-h-[60vh] overflow-y-auto space-y-3">
                ${declinedInvitations.map(inv => `
                    <div class="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                        <div class="flex items-center justify-between mb-2">
                            <div>
                                <p class="font-bold text-lg">${inv.absenderName || 'Unbekannt'}</p>
                                <p class="text-sm text-gray-600">Thema: ${inv.themaName || 'Unbekannt'}</p>
                            </div>
                            <span class="px-3 py-1 bg-red-200 text-red-800 rounded-full text-xs font-bold">
                                Abgelehnt am ${inv.abgelehntAm ? new Date(inv.abgelehntAm.toDate()).toLocaleDateString('de-DE') : '-'}
                            </span>
                        </div>
                        <button onclick="window.revokeDeclinedInvitation('${inv.id}')" 
                            class="w-full mt-2 py-2 bg-gradient-to-r from-blue-500 to-green-500 text-white rounded-lg font-bold hover:shadow-lg transition">
                            🔄 Ablehnung widerrufen
                        </button>
                    </div>
                `).join('')}
            </div>
            <div class="p-4 border-t">
                <button onclick="document.getElementById('declined-invitations-modal').remove()" 
                    class="w-full py-2 bg-gray-300 text-gray-700 rounded-lg font-bold hover:bg-gray-400 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
};

window.endSharing = async function(freigabeId) {
    if (!confirm('Freigabe wirklich beenden? Du verlierst den Zugriff auf dieses Thema.')) return;
    
    try {
        await updateDoc(doc(geschenkeFreigabenRef, freigabeId), {
            aktiv: false,
            beendetAm: serverTimestamp(),
            beendetVon: currentUser.displayName
        });
        
        alertUser('Freigabe beendet.', 'success');
        // ✅ Update wird durch Listener automatisch erkannt und UI aktualisiert
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};

// Einladung senden
window.sendInvitation = async function(userId, userName, themaId, freigaben) {
    const myUserId = getCurrentUserId();
    
    // Prüfen ob bereits eine abgelehnte Einladung existiert
    const existingDeclined = Object.values(EINLADUNGEN).find(e => 
        e.empfaengerId === userId && 
        e.themaId === themaId && 
        e.absenderId === myUserId &&
        e.status === 'declined'
    );
    
    if (existingDeclined) {
        alertUser('Diese Person hat deine vorherige Einladung abgelehnt. Du kannst erst wieder einladen, wenn sie die Ablehnung zurücknimmt.', 'warning');
        return false;
    }
    
    // Prüfen ob bereits eine ausstehende Einladung existiert
    const existingPending = Object.values(EINLADUNGEN).find(e => 
        e.empfaengerId === userId && 
        e.themaId === themaId && 
        e.absenderId === myUserId &&
        e.status === 'pending'
    );
    
    if (existingPending) {
        alertUser('Es gibt bereits eine ausstehende Einladung für diese Person.', 'warning');
        return false;
    }
    
    try {
        const thema = THEMEN[themaId];
        const einladungData = {
            absenderId: myUserId,
            absenderName: currentUser.displayName,
            besitzerId: myUserId,  // ✅ Owner des Themas
            besitzerUid: auth.currentUser.uid,  // ✅ Firebase Auth UID des Owners
            empfaengerId: userId,
            empfaengerName: userName,
            themaId: themaId,
            themaName: thema?.name || 'Unbekannt',
            freigaben: freigaben,
            status: 'pending',
            erstelltAm: serverTimestamp()
        };
        
        const docRef = await addDoc(geschenkeEinladungenRef, einladungData);
        EINLADUNGEN[docRef.id] = { id: docRef.id, ...einladungData };
        
        alertUser(`Einladung an ${userName} gesendet!`, 'success');
        return true;
    } catch (e) {
        alertUser('Fehler beim Senden der Einladung: ' + e.message, 'error');
        return false;
    }
};

// ========================================
// FREIGABE-FILTER-LOGIK (Punkt 18)
// ========================================
function filterGeschenkeByFreigaben(geschenkeArray, freigabe) {
    if (!freigabe) return geschenkeArray;
    
    // ✅ KORRIGIERT: Unterstützt beide Filter-Strukturen (alte und neue)
    const filter = freigabe.filter || freigabe.freigaben || {};
    
    // Wenn komplette Freigabe, zeige alle
    if (freigabe.freigabeTyp === 'komplett') return geschenkeArray;
    
    // Wenn kein Filter, zeige alle
    if (Object.keys(filter).length === 0) return geschenkeArray;
    
    return geschenkeArray.filter(geschenk => {
        // ✅ Wenn einzelne Einträge spezifisch freigegeben sind
        if (filter.einzelneEintraege && filter.einzelneEintraege.length > 0) {
            return filter.einzelneEintraege.includes(geschenk.id);
        }
        
        // ✅ Wenn Personen-Filter gesetzt sind (alle Bedingungen müssen erfüllt sein)
        let matches = true;
        
        if (filter.fuerPerson && filter.fuerPerson.length > 0) {
            const hatFuerMatch = geschenk.fuer?.some(personId => filter.fuerPerson.includes(personId));
            if (!hatFuerMatch) matches = false;
        }
        
        if (filter.vonPerson && filter.vonPerson.length > 0) {
            const hatVonMatch = geschenk.von?.some(personId => filter.vonPerson.includes(personId));
            if (!hatVonMatch) matches = false;
        }
        
        if (filter.beteiligungPerson && filter.beteiligungPerson.length > 0) {
            const hatBeteiligungMatch = geschenk.beteiligung?.some(personId => filter.beteiligungPerson.includes(personId));
            if (!hatBeteiligungMatch) matches = false;
        }
        
        if (filter.bezahltVonPerson && filter.bezahltVonPerson.length > 0) {
            if (!filter.bezahltVonPerson.includes(geschenk.bezahltVon)) matches = false;
        }
        
        // ✅ Zahlungsart-Filter
        if (filter.sollBezahlungKonto && filter.sollBezahlungKonto.length > 0) {
            if (!filter.sollBezahlungKonto.includes(geschenk.sollBezahlung)) matches = false;
        }
        
        if (filter.istBezahlungKonto && filter.istBezahlungKonto.length > 0) {
            if (!filter.istBezahlungKonto.includes(geschenk.istBezahlung)) matches = false;
        }
        
        if (filter.bezahlungKonto && filter.bezahlungKonto.length > 0) {
            const hatKontoMatch = filter.bezahlungKonto.includes(geschenk.sollBezahlung) || 
                                  filter.bezahlungKonto.includes(geschenk.istBezahlung);
            if (!hatKontoMatch) matches = false;
        }
        
        return matches;
    });
}

function getVisibleFieldsForFreigabe(freigabe) {
    if (!freigabe) {
        return { fuer: true, von: true, id: true, bezahltVon: true, beteiligung: true, sollBezahlung: true, istBezahlung: true, standort: true };
    }
    
    // ✅ KORRIGIERT: Unterstützt beide Filter-Strukturen (alte und neue)
    const rechte = freigabe.rechte || 'lesen';
    
    // Bei Leserechten: alle Felder sichtbar
    // Bei Bearbeitungsrechten: abhängig von weiteren Einstellungen
    const baseVisibility = {
        fuer: true,
        von: true,
        id: true,
        bezahltVon: rechte === 'bearbeiten',
        beteiligung: rechte === 'bearbeiten',
        sollBezahlung: rechte === 'bearbeiten',
        istBezahlung: rechte === 'bearbeiten',
        standort: rechte === 'bearbeiten'
    };
    
    return baseVisibility;
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
// FREIGABE-EDITOR (erweitert)
// ========================================
// ALTE FREIGABE-FUNKTIONEN ENTFERNT
// Die neuen Funktionen sind oben ab Zeile 1083
