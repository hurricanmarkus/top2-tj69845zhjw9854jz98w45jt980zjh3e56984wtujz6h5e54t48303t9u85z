export function initializeTerminplanerView() {
    
    // ----- Spion für das Token-Feld (von letztem Mal) -----
    const tokenInput = document.getElementById('vote-token-input');
    if (tokenInput) {
        // Hänge den Spion nur an, wenn er nicht schon dran hängt
        if (!tokenInput.dataset.listenerAttached) {
            tokenInput.addEventListener('input', formatTokenInput);
            tokenInput.dataset.listenerAttached = 'true'; // Markieren
        }
    }

    // ----- NEU: Spione für das Modal (Pop-up Fenster) -----
    
    // 1. Finde die Elemente
    const openModalButton = document.getElementById('show-create-vote-modal-btn');
    const closeModalButton = document.getElementById('close-create-vote-modal-btn');
    const modal = document.getElementById('createVoteModal');

    // 2. Prüfen, ob alle Elemente da sind
    if (openModalButton && closeModalButton && modal) {

        // 3. Spion für den "+ Neuen Termin"-Button
        // (Wir prüfen wieder, ob schon ein Spion dran hängt)
        if (!openModalButton.dataset.listenerAttached) {
            openModalButton.addEventListener('click', () => {
                console.log("Öffne Termin-Auswahl-Modal..."); // Ein Spion für uns
                modal.style.display = 'flex'; // Zeige das Modal (als 'flex' für die Zentrierung)
                modal.classList.remove('hidden');
            });
            openModalButton.dataset.listenerAttached = 'true'; // Markieren
        }

        // 4. Spion für den "Schließen" (X)-Button
        if (!closeModalButton.dataset.listenerAttached) {
            closeModalButton.addEventListener('click', () => {
                console.log("Schließe Termin-Auswahl-Modal..."); // Ein Spion für uns
                modal.style.display = 'none'; // Verstecke das Modal wieder
                modal.classList.add('hidden');
            });
            closeModalButton.dataset.listenerAttached = 'true'; // Markieren
        }

    } else {
        // Falls wir ein Element nicht finden, sagen wir Bescheid.
        console.error("Fehler: Konnte die Knöpfe oder das Modal für den Terminplaner nicht finden!");
    }
}

// Das ist die "mitdenkende" Funktion für das Token-Format (XXXX - XXXX)
// (Bleibt gleich wie beim letzten Mal)
function formatTokenInput(e) {
    const input = e.target;
    // Erlaube jetzt auch Kleinbuchstaben bei der Eingabe, wandle sie aber um
    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); // Nur Buchstaben/Zahlen, alles groß

    let formattedValue = '';

    // Füge automatisch den Bindestrich nach 4 Zeichen ein
    if (value.length > 4) {
        // Nimm nur die ersten 8 Zeichen, falls jemand mehr eingibt
        formattedValue = value.substring(0, 4) + ' - ' + value.substring(4, 8);
    } else {
        formattedValue = value;
    }
    
    // Setze den formatierten Wert zurück ins Feld
    // Wir speichern die Position des Mauszeigers (Cursor)
    const cursorPos = input.selectionStart;
    const originalLength = input.value.length;
    
    input.value = formattedValue;
    
    const newLength = formattedValue.length;
    
    // Setze den Cursor intelligent zurück
    // Wenn wir gerade den Bindestrich hinzugefügt haben (z.B. von 4 auf 7 Zeichen),
    // setze den Cursor ans Ende.
    if (newLength > originalLength) {
         input.selectionStart = newLength;
         input.selectionEnd = newLength;
    } else {
        // Ansonsten setze ihn dorthin, wo er war.
         input.selectionStart = cursorPos;
         input.selectionEnd = cursorPos;
    }
}