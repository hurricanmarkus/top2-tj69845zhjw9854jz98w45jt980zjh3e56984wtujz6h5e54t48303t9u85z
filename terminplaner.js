// Diese Funktion wird von haupteingang.js aufgerufen,
// sobald die Seite geladen wird.
export function initializeTerminplanerView() {
    
    // Finde das Token-Eingabefeld
    const tokenInput = document.getElementById('vote-token-input');
    
    if (tokenInput) {
        // Füge einen "Spion" (Event Listener) hinzu, der auf jede Tasteneingabe reagiert
        tokenInput.addEventListener('input', formatTokenInput);
    }
}

// Das ist die "mitdenkende" Funktion für das Token-Format (XXXX - XXXX)
function formatTokenInput(e) {
    const input = e.target;
    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); // Nur Buchstaben/Zahlen, alles groß

    let formattedValue = '';

    // Füge automatisch den Bindestrich nach 4 Zeichen ein
    if (value.length > 4) {
        formattedValue = value.substring(0, 4) + ' - ' + value.substring(4, 8);
    } else {
        formattedValue = value;
    }
    
    // Setze den formatierten Wert zurück ins Feld
    input.value = formattedValue;
}