// ========================================
// GESCHENKEMANAGEMENT NEU LADEN
// ========================================
// Lädt das Geschenkemanagement-Modul neu
// In Console ausführen (F12)
// ========================================

console.log('🔄 Lade Geschenkemanagement neu...');

// Schließe aktuelles Modul
if (window.location.hash !== '#geschenkemanagement') {
    window.location.hash = 'geschenkemanagement';
}

// Warte kurz und lade dann neu
setTimeout(() => {
    console.log('🔄 Seite wird neu geladen...');
    window.location.reload();
}, 1000);
