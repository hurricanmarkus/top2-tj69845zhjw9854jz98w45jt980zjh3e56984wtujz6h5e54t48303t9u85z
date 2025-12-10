// Bereinigungsscript für geschenkemanagement.js
// Entfernt Zeilen 1741-4820 (Freigabe-Code)

const fs = require('fs');

console.log('🧹 Starte Bereinigung von geschenkemanagement.js...');

// Datei einlesen
const content = fs.readFileSync('geschenkemanagement.js', 'utf8');
const lines = content.split('\n');

console.log(`📄 Gesamtzeilen: ${lines.length}`);

// Zeilen 1-1740 behalten (Index 0-1739)
// Zeilen 1741-4820 löschen (Index 1740-4819)
// Zeilen 4821-Ende behalten (Index 4820+)

const keepStart = lines.slice(0, 1740);  // Zeilen 1-1740
const keepEnd = lines.slice(4820);       // Zeilen 4821-Ende

console.log(`✅ Behalte Zeilen 1-1740: ${keepStart.length} Zeilen`);
console.log(`❌ Lösche Zeilen 1741-4820: ${4820-1740} Zeilen`);
console.log(`✅ Behalte Zeilen 4821-${lines.length}: ${keepEnd.length} Zeilen`);

// Zusammenfügen
const newContent = [
    ...keepStart,
    '',
    '// ========================================',
    '// BUDGET-SYSTEM',
    '// ========================================',
    ...keepEnd.slice(3) // Überspringe die ersten 3 Zeilen (doppelte Header)
].join('\n');

// Backup erstellen
fs.writeFileSync('geschenkemanagement.backup.js', content, 'utf8');
console.log('💾 Backup erstellt: geschenkemanagement.backup.js');

// Bereinigte Version schreiben
fs.writeFileSync('geschenkemanagement.js', newContent, 'utf8');
console.log('✅ Bereinigte Datei geschrieben!');

const newLines = newContent.split('\n');
console.log(`📊 Neue Datei: ${newLines.length} Zeilen (vorher: ${lines.length})`);
console.log(`🗑️ Gelöscht: ${lines.length - newLines.length} Zeilen`);

