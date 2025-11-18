import { currentUser, navigate, alertUser } from './haupteingang.js';

// Diese Funktion wird aufgerufen, wenn man auf den Button klickt
export function initializeZahlungsverwaltungView() {
    console.log("Zahlungsverwaltung wird geladen...");
    renderDashboard();
}

// Diese Funktion zeigt die Übersicht an (aktuell noch leer)
function renderDashboard() {
    const container = document.getElementById('zahlungsverwaltung-content');
    if (!container) return;

    // Vorerst nur ein Platzhalter-Text
    container.innerHTML = `
        <div class="p-4 bg-white rounded-xl shadow-lg text-center">
            <h3 class="text-lg font-bold text-gray-800">Zahlungsverwaltung</h3>
            <p class="text-gray-600 mt-2">Hier entsteht deine Schuldenliste.</p>
            <button id="btn-new-debt" class="mt-4 py-2 px-4 bg-indigo-600 text-white font-bold rounded-lg shadow hover:bg-indigo-700 transition">
                + Neuen Eintrag anlegen
            </button>
        </div>
    `;

    // Event Listener für den "Neu" Button (funktioniert noch nicht echt)
    document.getElementById('btn-new-debt').addEventListener('click', () => {
        alertUser("Funktion kommt im nächsten Schritt!", "info");
    });
}