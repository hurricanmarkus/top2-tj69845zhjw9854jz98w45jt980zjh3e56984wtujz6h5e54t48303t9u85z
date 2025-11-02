// =================================================================
// NEUE DATEI: terminplanung.js
// Hier kommt die ganze Logik für Doodle-Abstimmungen hinein
// =================================================================

// Importiere die Dinge, die wir brauchen werden
import { 
    db, 
    auth, 
    currentUser, 
    alertUser, 
    USERS, 
    navigate 
} from './haupteingang.js';
    
// Importiere Firebase-Funktionen
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


// Diese Sammlung wird alle "Votes" (Umfragen) speichern.
// WICHTIG: Ersetze 'DEINE_APP_ID' mit deiner echten appId-Variable,
// aber wir können sie hier nicht direkt importieren wegen Zirkelbezügen.
// Wir holen sie uns später über eine Funktion.
let votesCollectionRef; 

// Diese Variable speichert alle geladenen Umfragen
export let VOTES = {};


/**
 * 1. INITIALISIERUNG: Wird von haupteingang.js aufgerufen
 * Diese Funktion richtet die Datenbank-Referenz ein und startet den Listener.
 */
export function initializeTerminplanung(appId) {
    // Erstelle den Pfad zur Datenbank-Sammlung "votes"
    // (So wie bei deinen anderen Sammlungen auch)
    votesCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'votes');
    
    // Starte den Listener, der alle öffentlichen Umfragen holt
    listenForPublicVotes();
}


/**
 * 2. DATENBANK-LISTENER
 * Hört auf alle öffentlichen Umfragen und speichert sie in VOTES
 */
function listenForPublicVotes() {
    // 'isPublic' == true bedeutet "Öffentliche Umfragen"
    const q = query(votesCollectionRef, where("isPublic", "==", true), where("status", "==", "active"));
    
    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const voteData = change.doc.data();
            const voteId = change.doc.id;
            
            if (change.type === "removed") {
                delete VOTES[voteId];
            } else {
                VOTES[voteId] = { id: voteId, ...voteData };
            }
        });
        
        // Später: Wenn die Termin-Seite offen ist, aktualisiere sie
        // if (document.getElementById('terminView').classList.contains('active')) {
        //     renderTerminUebersicht();
        // }
    }, (error) => {
        console.error("Fehler beim Laden der öffentlichen Umfragen: ", error);
        alertUser("Fehler beim Laden der Umfragen.", "error");
    });
}


/**
 * 3. RENDER-FUNKTION: Wird von haupteingang.js aufgerufen
 * Diese Funktion baut die Haupt-Übersichtsseite für Termine auf.
 */
export function renderTerminUebersicht() {
    // Finde den Container in der (noch nicht existierenden) HTML
    const container = document.getElementById('terminView');
    if (!container) return; // Sicherheitsabbruch
    
    // (Hier kommt der ganze HTML-Aufbau rein, den wir
    // im nächsten Schritt machen, wenn du die index.html geschickt hast)
    console.log("Termin-Übersicht wird jetzt geladen...");
    
    // Beispiel-Aufbau (Platzhalter)
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
    
    // Lade die Liste der öffentlichen Umfragen
    renderPublicVotesList();
    
    // Füge die Event-Listener für die neuen Buttons hinzu
    addTerminUebersichtListeners();
}


/**
 * 4. HELFER-FUNKTION: Zeigt die öffentlichen Umfragen an
 */
function renderPublicVotesList() {
    const listContainer = document.getElementById('public-votes-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = ''; // Leeren
    
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
 * 5. EVENT-LISTENER für die Übersichtsseite
 */
function addTerminUebersichtListeners() {
    // Klick auf "+ Neuen Termin"
    const neuerTerminBtn = document.getElementById('neuer-termin-btn');
    if (neuerTerminBtn) {
        neuerTerminBtn.addEventListener('click', () => {
            // Navigiere zur (noch nicht existierenden) Auswahlseite
            navigate('neuerTermin'); 
        });
    }
    
    // Klick auf "Private Umfrage aufrufen"
    const privateTokenSubmit = document.getElementById('private-token-submit');
    if (privateTokenSubmit) {
        privateTokenSubmit.addEventListener('click', () => {
            const tokenInput = document.getElementById('private-token-input');
            const token = tokenInput.value.trim().replace(/-/g, ''); // (Entfernt auch Bindestriche)
            if (token.length === 8) {
                alertUser("Suche nach Umfrage mit Token... (Funktion noch nicht gebaut)", "success");
                // HIER kommt die Logik, um die Umfrage per Token zu laden
                // z.B. loadVoteByToken(token);
            } else {
                alertUser("Bitte einen 8-stelligen Token eingeben.", "error");
            }
        });
    }
    
    // (Optional: Implementiere das Token-Format XXXX-XXXX beim Tippen)
    const tokenInput = document.getElementById('private-token-input');
    if(tokenInput) {
        tokenInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, ''); // Entfernt alles außer Zahlen (oder Buchstaben, je nach Token)
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
 * 6. RENDER-FUNKTION: Die "Wähle dein Doodle aus" Seite
 */
export function renderNeuerTerminAuswahl() {
    const container = document.getElementById('neuerTerminView');
    if (!container) return;

    // Wir bauen das Doodle-Auswahl-Layout nach
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
                         <span class="text-3xl">🗓️</span> </div>
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
                        Erstelle Anmeldungen für Workshops, Webinare oder Events und lass Teilnehmer sich eintragen. (Noch nicht verfügbar)
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
                        Biete eine Liste deiner verfügbaren Zeiten an, damit dein Kunde auswählen kann, was ihm passt. (Noch nicht verfügbar)
                    </s
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
                        Richte deine Buchungsseite einmal ein, teile den Link und lass Kunden Termine bei dir buchen. (Noch nicht verfügbar)
                    </p>
                    <button class="mt-4 w-full px-4 py-2 bg-gray-400 text-white font-semibold rounded-lg cursor-not-allowed">
                        Erstellen
                    </button>
                </div>
                
            </div>
        </div>
    `;
    
    // Event-Listener für die "Erstellen"-Buttons
    const gruppenUmfrageBtn = document.getElementById('create-gruppenumfrage');
    if (gruppenUmfrageBtn) {
        gruppenUmfrageBtn.addEventListener('click', () => {
            alertUser("Nächster Schritt: Erstellungs-Maske für Gruppenumfrage... (Funktion noch nicht gebaut)", "success");
            // HIER navigieren wir dann zur Erstellungs-Maske
            // z.B. navigate('createGruppenumfrage');
        });
    }
}