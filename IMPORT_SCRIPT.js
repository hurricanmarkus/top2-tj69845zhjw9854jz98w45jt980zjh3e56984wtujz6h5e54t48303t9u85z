// ========================================
// GESCHENKEMANAGEMENT IMPORT SCRIPT
// ========================================
// ANLEITUNG:
// 1. Öffne die TOP2-App im Browser und logge dich ein
// 2. Gehe zum Geschenkemanagement
// 3. Öffne die Browser-Console (F12)
// 4. Kopiere dieses komplette Script und füge es in die Console ein
// 5. Drücke Enter
// ========================================

async function importGeschenkeData() {
    console.log('🎁 === GESCHENKE IMPORT GESTARTET ===');
    
    // Prüfe ob alle benötigten Variablen verfügbar sind
    if (typeof db === 'undefined' || typeof appId === 'undefined' || typeof currentUser === 'undefined') {
        console.error('❌ FEHLER: Bitte stelle sicher, dass du in der TOP2-App eingeloggt bist!');
        console.error('   Gehe zu: Geschenkemanagement und versuche es erneut.');
        return;
    }
    
    const userId = currentUser.mode;
    console.log(`👤 Importiere für User: ${userId}`);
    
    // DEINE EXCEL-DATEN HIER EINFÜGEN (zwischen den Backticks)
    const excelData = `Weihnachten 2024;Abgeschlossen;Regina Mokricky;Haushaltskonto;Dinner & Crime: Kurschatten;crime-club.at;Haushaltskonto;Jasmin Mokricky (50%);92,6;46,3;Kreditkarte;Kreditkarte;zu Hause;CC-10368;;Casino Baden
Weihnachten 2024;Abgeschlossen;Ö3 Weihnachtswunder;Markus Zika;Ö3 Weihnachtswunder - Licht ins Dunkle - Geldspende;Ö3 Call;Markus Zika;;15;15;Konto-Weihnachten;Konto-Weihnachten;;;;
Weihnachten 2024;Abgeschlossen;ALLE;Markus Zika;ADV. GAMES Akte Gloo;Müller Oeynhausen;Markus Zika;;9,99;9,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;706385;;`;
    
    // Parse Daten
    const lines = excelData.trim().split('\n');
    const geschenke = [];
    const themenSet = new Set();
    const kontakteSet = new Set();
    
    console.log(`📊 Verarbeite ${lines.length} Zeilen...`);
    
    lines.forEach((line, index) => {
        const parts = line.split(';');
        if (parts.length < 16) {
            console.warn(`⚠️ Zeile ${index + 1} übersprungen (zu wenig Spalten)`);
            return;
        }
        
        const [thema, status, fuer, von, geschenk, shop, bezahltVon, beteiligung, 
               gesamtkosten, eigeneKosten, sollBezahlung, istBezahlung, standort, 
               bestellnummer, rechnungsnummer, notizen] = parts;
        
        themenSet.add(thema.trim());
        
        // Kontakte extrahieren
        fuer.split(/und|,/).forEach(k => {
            const name = k.trim();
            if (name && name !== 'ALLE') kontakteSet.add(name);
        });
        von.split(/und|,/).forEach(k => {
            const name = k.trim();
            if (name) kontakteSet.add(name);
        });
        
        geschenke.push({
            thema: thema.trim(),
            status: mapStatus(status.trim()),
            fuer: fuer.split(/und|,/).map(s => s.trim()).filter(s => s && s !== 'ALLE'),
            von: von.split(/und|,/).map(s => s.trim()).filter(s => s),
            titel: geschenk.trim(),
            shop: shop.trim(),
            bezahltVon: bezahltVon.trim(),
            beteiligung: beteiligung.trim(),
            gesamtkosten: parseFloat(gesamtkosten.replace(',', '.')) || 0,
            eigeneKosten: parseFloat(eigeneKosten.replace(',', '.')) || 0,
            sollBezahlung: sollBezahlung.trim(),
            istBezahlung: istBezahlung.trim(),
            standort: standort.trim(),
            bestellnummer: bestellnummer.trim(),
            rechnungsnummer: rechnungsnummer.trim(),
            notizen: notizen.trim()
        });
    });
    
    console.log(`✅ ${geschenke.length} Geschenke gefunden`);
    console.log(`✅ ${themenSet.size} Themen: ${Array.from(themenSet).join(', ')}`);
    console.log(`✅ ${kontakteSet.size} Kontakte gefunden`);
    
    // Bestätigung
    if (!confirm(`Import starten?\n\n${geschenke.length} Geschenke\n${themenSet.size} Themen\n${kontakteSet.size} Kontakte\n\nFür User: ${userId}`)) {
        console.log('❌ Import abgebrochen');
        return;
    }
    
    try {
        // 1. Themen erstellen
        console.log('📁 Erstelle Themen...');
        const themenObj = {};
        const themenIds = {};
        
        for (const themaName of Array.from(themenSet)) {
            const id = 'thema_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            themenIds[themaName] = id;
            
            const themaData = {
                id,
                name: themaName,
                createdAt: new Date(),
                createdBy: userId,
                istEigenes: true,
                personen: []
            };
            
            const themaRef = window.doc(db, 'artifacts', appId, 'public', 'data', 'users', userId, 'geschenke_themen', id);
            await window.setDoc(themaRef, themaData);
            console.log(`  ✅ Thema erstellt: ${themaName}`);
        }
        
        // 2. Kontakte erstellen
        console.log('👥 Erstelle Kontakte...');
        const kontakteIds = {};
        
        for (const kontaktName of Array.from(kontakteSet)) {
            const id = 'kontakt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            kontakteIds[kontaktName] = id;
            
            const kontaktData = {
                id,
                name: kontaktName,
                createdAt: new Date(),
                createdBy: userId
            };
            
            const kontaktRef = window.doc(db, 'artifacts', appId, 'public', 'data', 'users', userId, 'geschenke_kontakte', id);
            await window.setDoc(kontaktRef, kontaktData);
            console.log(`  ✅ Kontakt erstellt: ${kontaktName}`);
        }
        
        // 3. Geschenke importieren
        console.log('🎁 Importiere Geschenke...');
        let imported = 0;
        
        for (const g of geschenke) {
            const id = 'geschenk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const themaId = themenIds[g.thema];
            
            // Kontakt-IDs zuordnen
            const fuerIds = g.fuer.map(name => kontakteIds[name]).filter(id => id);
            const vonIds = g.von.map(name => kontakteIds[name]).filter(id => id);
            
            const geschenkData = {
                id,
                themaId,
                fuer: fuerIds,
                von: vonIds,
                titel: g.titel,
                status: g.status,
                sollBezahlung: g.sollBezahlung,
                istBezahlung: g.istBezahlung,
                sollPreis: g.gesamtkosten,
                istPreis: g.eigeneKosten,
                standort: g.standort,
                notizen: `Shop: ${g.shop}\nBezahlt von: ${g.bezahltVon}\nBeteiligung: ${g.beteiligung}\nBestellnr: ${g.bestellnummer}\nRechnungsnr: ${g.rechnungsnummer}\n${g.notizen}`,
                createdAt: new Date(),
                createdBy: userId
            };
            
            const geschenkRef = window.doc(db, 'artifacts', appId, 'public', 'data', 'users', userId, 'geschenke', id);
            await window.setDoc(geschenkRef, geschenkData);
            
            imported++;
            if (imported % 10 === 0) {
                console.log(`  ⏳ ${imported}/${geschenke.length} importiert...`);
            }
        }
        
        console.log('');
        console.log('🎉 === IMPORT ERFOLGREICH ABGESCHLOSSEN ===');
        console.log(`✅ ${themenSet.size} Themen erstellt`);
        console.log(`✅ ${kontakteSet.size} Kontakte erstellt`);
        console.log(`✅ ${imported} Geschenke importiert`);
        console.log('');
        console.log('💡 Lade die Seite neu (F5) um die Daten zu sehen!');
        
        alert(`✅ Import erfolgreich!\n\n${themenSet.size} Themen\n${kontakteSet.size} Kontakte\n${imported} Geschenke\n\nLade die Seite neu (F5)`);
        
    } catch (error) {
        console.error('❌ IMPORT FEHLER:', error);
        alert('❌ Import fehlgeschlagen: ' + error.message);
    }
}

// Status-Mapping
function mapStatus(status) {
    const map = {
        'Abgeschlossen': 'gekauft',
        'Storniert': 'storniert',
        'Offen': 'offen',
        'Bestellt': 'bestellt'
    };
    return map[status] || 'offen';
}

// Import starten
console.log('');
console.log('🎁 GESCHENKE IMPORT SCRIPT GELADEN');
console.log('📝 WICHTIG: Füge deine Excel-Daten in Zeile 25 ein (zwischen den Backticks)');
console.log('🚀 Dann führe aus: importGeschenkeData()');
console.log('');
