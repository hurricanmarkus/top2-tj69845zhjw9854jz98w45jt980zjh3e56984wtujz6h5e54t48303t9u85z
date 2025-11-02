// =================================================================
// NEUE DATEI: terminplanung.js (VERSION 3 - MIT PERMISSION-FIX)
// =================================================================

// Importiere NUR Firebase-Funktionen, nichts aus haupteingang.js
import { 
    collection, 
    doc, 
    addDoc, 
    getDoc, 
    setDoc, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// =================================================================
// 1. LOKALE SPEICHER FÜR IMPORTE
// =================================================================
let db_i; 
let alertUser_i; 
let navigate_i; 
let currentUser_i; 
let USERS_i; 

let votesCollectionRef; 
export let VOTES = {};

// =================================================================
// NEU: HIER SPEICHERN WIR DEN AKTIVEN LISTENER
// =================================================================
// Diese Variable speichert die "Verbindung" zur Datenbank,
// damit wir sie später wieder kappen können (z.B. beim Logout).
let publicVotesListenerUnsubscribe = null;
// =================================================================


/**
 * 1. INITIALISIERUNG: Wird von haupteingang.js aufgerufen
 */
export function initializeTerminplanung(appId, dependencies) {
    // Wir speichern die Werkzeuge
    db_i = dependencies.db;
    alertUser_i = dependencies.alertUser;
    navigate_i = dependencies.navigate;
    currentUser_i = dependencies.currentUser;
    USERS_i = dependencies.USERS;
    
    // Erstelle den Pfad zur Datenbank-Sammlung "votes"
    votesCollectionRef = collection(db_i, 'artifacts', appId, 'public', 'data', 'votes');
    
    // WICHTIG: Wir starten den Listener HIER NICHT MEHR!
    // listenForPublicVotes(); // <-- Diese Zeile ist ENTFERNT.
}


/**
 * 2. DATENBANK-LISTENER STARTEN (NEUE FUNKTION)
 * Diese Funktion wird jetzt vom "Chef" (haupteingang.js) aufgerufen,
 * SOBALD DER BENUTZER EINGELOGGT IST.
 */
export function startPublicVotesListener() {
    // Wenn schon ein Listener läuft, starte keinen zweiten.
    if (publicVotesListenerUnsubscribe) {
        console.log("Public Votes Listener läuft bereits.");
        return; 
    }

    console.log("Starte Public Votes Listener (Benutzer ist angemeldet)...");
    const q = query(votesCollectionRef, where("isPublic", "==", true), where("status", "==", "active"));
    
    // Wir speichern die "stop"-Funktion (den Unsubscriber)
    publicVotesListenerUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const voteData = change.doc.data();
            const voteId = change.doc.id;
            
            if (change.type === "removed") {
                delete VOTES[voteId];
            } else {
                VOTES[voteId] = { id: voteId, ...voteData };
            }
        });
        
        // Wenn die Termin-Seite offen ist, aktualisiere sie
        const terminViewEl = document.getElementById('terminView');
        if (terminViewEl && terminViewEl.classList.contains('active')) {
             renderPublicVotesList(); 
        }
        
    }, (error) => {
        // HIER ist der Fehler aufgetreten (Zeile 79 in deinem Log)
        console.error("Fehler beim Laden der öffentlichen Umfragen: ", error);
        alertUser_i("Fehler beim Laden der Umfragen.", "error");
    });
}

/**
 * 3. DATENBANK-LISTENER STOPPEN (NEUE FUNKTION)
 * Wird aufgerufen, wenn der Benutzer sich ausloggt oder "Gast" wird.
 */
export function stopPublicVotesListener() {
    if (publicVotesListenerUnsubscribe) {
        console.log("Stoppe Public Votes Listener...");
        publicVotesListenerUnsubscribe(); // Trennt die Verbindung
        publicVotesListenerUnsubscribe = null; // Setzt zurück
        VOTES = {}; // Leert die geladenen Umfragen
    }
}


/**
 * 4. RENDER-FUNKTION: (Unverändert)
 */
export function renderTerminUebersicht() {
    const container = document.getElementById('terminView');
    if (!container) return; 
    
    container.innerHTML = `
        <div class="p-4">
            <div class="flex justify-between items-center mb-6">
                <button class="back-link text-indigo-600 font-semibold" data-target="home">
                    &larr; Zurück zur Übersicht
                </button>
                <button id="neuer-termin-btn" class="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700">
                    (+ Neuen Termin)
                </button>
            </div>
            
            <div class="bg-white p-4 rounded-xl shadow-lg mb-6">
                <h2 class="text-xl font-bold text-gray-800 mb-3">Private Umfrage aufrufen</h2>
                <p class="text-sm text-gray-600 mb-4">Gib den 8-stelligen Token ein, um an einer privaten Umfrage teilzunehmen.</p>
                <div class="flex gap-2">
                    <input id="private-token-input" type="text" placeholder="XXXX - XXXX" class="flex-grow p-3 border-2 border-gray-300 rounded-lg focus:border-indigo-500 outline-none">
                    <button id="private-token-submit" class="p-3 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-800">
                        Aufrufen
                    </button>
                </div>
            </div>
            
            <div class="bg-white p-4 rounded-xl shadow-lg mb-6">
                <h2 class="text-xl font-bold text-gray-800 mb-3">An mich zugewiesen</h2>
                <div id="assigned-votes-list" class="text-gray-500 text-sm">
                    (Diese Funktion wird später gebaut. Hier erscheinen Umfragen, die dir persönlich zugewiesen wurden.)
                </div>
            </div>

            <div class="bg-white p-4 rounded-xl shadow-lg">
                <h2 class="text-xl font-bold text-gray-800 mb-3">Öffentliche Umfragen</h2>
                <div id="public-votes-list" class="space-y-2">
                    </div>
            </div>
        </div>
    `;
    
    renderPublicVotesList();
    addTerminUebersichtListeners();
}


/**
 * 5. HELFER-FUNKTION: Zeigt die öffentlichen Umfragen an (Unverändert)
 */
function renderPublicVotesList() {
    const listContainer = document.getElementById('public-votes-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = ''; 
    const publicVotes = Object.values(VOTES);
    
    if (publicVotes.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 text-sm">Aktuell gibt es keine öffentlichen Umfragen.</p>';
        return;
    }
    
    publicVotes.forEach(vote => {
        listContainer.innerHTML += `
            <div class="p-3 border rounded-lg flex justify-between items-center hover:bg-gray-50 cursor-pointer" data-vote-id="${vote.id}">
                <div>
                    <p class="font-semibold">${vote.title || 'Unbenannte Umfrage'}</p>
                    <p class="text-xs text-gray-500">Erstellt von: ${vote.creatorName || 'Unbekannt'}</p>
                </div>
                <span class="text-indigo-600 font-bold">&rarr;</span>
            </div>
        `;
    });
}


/**
 * 6. EVENT-LISTENER für die Übersichtsseite (Unverändert)
 */
function addTerminUebersichtListeners() {
    const neuerTerminBtn = document.getElementById('neuer-termin-btn');
    if (neuerTerminBtn) {
        neuerTerminBtn.addEventListener('click', () => {
            navigate_i('neuerTermin'); 
        });
    }
    
    const privateTokenSubmit = document.getElementById('private-token-submit');
    if (privateTokenSubmit) {
        privateTokenSubmit.addEventListener('click', () => {
            const tokenInput = document.getElementById('private-token-input');
            const token = tokenInput.value.trim().replace(/-/g, '');
            if (token.length === 8) {
                alertUser_i("Suche nach Umfrage mit Token... (Funktion noch nicht gebaut)", "success");
            } else {
                alertUser_i("Bitte einen 8-stelligen Token eingeben.", "error");
            }
        });
    }
    
    const tokenInput = document.getElementById('private-token-input');
    if(tokenInput) {
        tokenInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
             if (value.length > 8) value = value.substring(0, 8);
            
             if (value.length > 4) {
                 e.target.value = value.substring(0, 4) + ' - ' + value.substring(4);
             } else {
                 e.target.value = value;
             }
        });
    }
}


/**
 * 7. RENDER-FUNKTION: Die "Wähle dein Doodle aus" Seite (Unverändert)
 */
export function renderNeuerTerminAuswahl() {
    const container = document.getElementById('neuerTerminView');
    if (!container) return;

    container.innerHTML = `
        <div class="p-4">
            <div class="flex justify-between items-center mb-6">
                <button class="back-link text-indigo-600 font-semibold" data-target="termin">
                    &larr; Zurück zur Terminübersicht
                </button>
            </div>
            
            <h1 class="text-2xl font-bold text-center mb-6">Wähle deine Umfrage-Art</h1>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            
                <div id="create-gruppenumfrage" class="bg-white p-6 rounded-xl shadow-lg border-2 border-transparent hover:border-indigo-500 cursor-pointer transition-all">
                    <div class="w-16 h-16 bg-yellow-100 rounded-lg flex items-center justify-center mb-4">
                         <span class="text-3xl">🗓️</span>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">Gruppenumfrage</h3>
                    <p class="text-sm text-gray-600">
                        Finde die Zeit, die für alle Mitglieder in deiner Gruppe am besten passt. (Klassisches Doodle)
                    </p>
                    <button class="mt-4 w-full px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">
                        Erstellen
                    </button>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-lg border-2 border-transparent opacity-50 cursor-not-allowed">
                    <div class="w-16 h-16 bg-teal-100 rounded-lg flex items-center justify-center mb-4">
                         <span class="text-3xl">🎉</span>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">Eventplaner</h3>
                    <p class="text-sm text-gray-600">
                        (Noch nicht verfügbar)
                    </p>
                    <button class="mt-4 w-full px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg cursor-not-allowed">
                        Erstellen
                    </button>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg border-2 border-transparent opacity-50 cursor-not-allowed">
                    <div class="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                         <span class="text-3xl">🤝</span>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">1:1 (Eins-zu-Eins)</h3>
                    <p class="text-sm text-gray-600">
                        (Noch nicht verfügbar)
                    </p>
                    <button class="mt-4 w-full px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg cursor-not-allowed">
                        Erstellen
                    </button>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg border-2 border-transparent opacity-50 cursor-not-allowed">
                    <div class="w-16 h-16 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                         <span class="text-3xl">🌍</span>
                    </div>
                    <h3 class="text-xl font-bold text-gray-800 mb-2">Buchungsseite</h3>
                    <p class="text-sm text-gray-600">
                        (Noch nicht verfügbar)
                    </p>
                    <button class="mt-4 w-full px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg cursor-not-allowed">
                        Erstellen
                    </button>
                </div>
                
            </div>
        </div>
    `;
    
    const gruppenUmfrageBtn = document.getElementById('create-gruppenumfrage');
    if (gruppenUmfrageBtn) {
        gruppenUmfrageBtn.addEventListener('click', () => {
            alertUser_i("Nächster Schritt: Erstellungs-Maske für Gruppenumfrage... (Funktion noch nicht gebaut)", "success");
        });
    }
}