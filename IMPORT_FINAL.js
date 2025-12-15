// ========================================
// GESCHENKE IMPORT - FINALE VERSION
// ========================================
// WICHTIG: Geschenke werden als Subcollection unter Themen gespeichert!
// Pfad: users/{uid}/geschenke_themen/{themaId}/geschenke/{geschenkId}
// ========================================

// DEINE DATEN HIER
const DATEN = `HIER_DEINE_DATEN_EINFÜGEN`;

async function importGeschenke() {
    console.log('🎁 === IMPORT START ===');
    
    // Firebase laden
    const { getFirestore, collection, doc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    
    const db = getFirestore();
    const auth = getAuth();
    const appId = 'top2-tj69845zhjw9854jz98w45jt980zjh3e56984wtujz6h5e54t48303t9u85z';
    
    // Firebase UID (für Pfade)
    const uid = auth.currentUser?.uid;
    if (!uid) return console.error('❌ Nicht eingeloggt!');
    
    // App User ID (für createdBy)
    const appUserId = window.currentUser?.mode || 'SYSTEMADMIN';
    
    console.log('👤 UID:', uid);
    console.log('👤 App User:', appUserId);
    
    // Daten parsen
    const zeilen = DATEN.trim().split('\n');
    const geschenkeByThema = {};
    const kontakte = new Set();
    
    zeilen.forEach(z => {
        const p = z.split(';');
        if (p.length < 16) return;
        
        const thema = p[0].trim();
        if (!geschenkeByThema[thema]) geschenkeByThema[thema] = [];
        
        p[2].split(/und|,/).forEach(n => { if (n.trim() && n.trim() !== 'ALLE') kontakte.add(n.trim()); });
        p[3].split(/und|,/).forEach(n => { if (n.trim()) kontakte.add(n.trim()); });
        
        geschenkeByThema[thema].push({
            status: p[1].trim() === 'Abgeschlossen' ? 'gekauft' : p[1].trim() === 'Storniert' ? 'storniert' : 'offen',
            fuer: p[2].split(/und|,/).map(n => n.trim()).filter(n => n && n !== 'ALLE'),
            von: p[3].split(/und|,/).map(n => n.trim()).filter(n => n),
            titel: p[4].trim(),
            shop: p[5].trim(),
            sollBezahlung: p[10].trim(),
            istBezahlung: p[11].trim(),
            sollPreis: parseFloat(p[8].replace(',', '.')) || 0,
            istPreis: parseFloat(p[9].replace(',', '.')) || 0,
            standort: p[12].trim(),
            notizen: `Shop: ${p[5]}\nBezahlt: ${p[6]}\nBeteiligung: ${p[7]}\nBestellnr: ${p[13]}\nRechnungsnr: ${p[14]}\n${p[15]}`
        });
    });
    
    const themen = Object.keys(geschenkeByThema);
    let totalGeschenke = 0;
    themen.forEach(t => totalGeschenke += geschenkeByThema[t].length);
    
    console.log(`📊 ${totalGeschenke} Geschenke in ${themen.length} Themen, ${kontakte.size} Kontakte`);
    
    if (!confirm(`Import starten?\n${totalGeschenke} Geschenke\n${themen.length} Themen\n${kontakte.size} Kontakte`)) {
        return console.log('❌ Abgebrochen');
    }
    
    try {
        // 1. Kontakte erstellen
        console.log('👥 Kontakte...');
        const kontakteIds = {};
        for (const k of Array.from(kontakte)) {
            const id = 'kontakt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            kontakteIds[k] = id;
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', uid, 'geschenke_kontakte', id), {
                id, name: k, createdAt: new Date(), createdBy: appUserId
            });
        }
        console.log(`  ✅ ${kontakte.size} Kontakte`);
        
        // 2. Themen + Geschenke (zusammen!)
        console.log('📁 Themen + Geschenke...');
        let importedTotal = 0;
        
        for (const themaName of themen) {
            const themaId = 'thema_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Thema erstellen
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', uid, 'geschenke_themen', themaId), {
                id: themaId,
                name: themaName,
                createdAt: new Date(),
                createdBy: appUserId,
                istEigenes: true,
                personen: []
            });
            console.log(`  ✅ Thema: ${themaName}`);
            
            // Geschenke für dieses Thema
            const geschenke = geschenkeByThema[themaName];
            for (const g of geschenke) {
                const geschenkId = 'geschenk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                // WICHTIG: Geschenke als Subcollection unter Thema!
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', uid, 'geschenke_themen', themaId, 'geschenke', geschenkId), {
                    id: geschenkId,
                    themaId: themaId,
                    fuer: g.fuer.map(n => kontakteIds[n]).filter(i => i),
                    von: g.von.map(n => kontakteIds[n]).filter(i => i),
                    titel: g.titel,
                    status: g.status,
                    sollBezahlung: g.sollBezahlung,
                    istBezahlung: g.istBezahlung,
                    sollPreis: g.sollPreis,
                    istPreis: g.istPreis,
                    standort: g.standort,
                    notizen: g.notizen,
                    createdAt: new Date(),
                    createdBy: appUserId
                });
                
                importedTotal++;
            }
            console.log(`    → ${geschenke.length} Geschenke`);
        }
        
        console.log('');
        console.log('🎉 === IMPORT ERFOLGREICH ===');
        console.log(`✅ ${themen.length} Themen`);
        console.log(`✅ ${kontakte.size} Kontakte`);
        console.log(`✅ ${importedTotal} Geschenke`);
        console.log('');
        console.log('💡 Drücke F5 zum Neuladen!');
        
        alert(`✅ Import erfolgreich!\n\n${themen.length} Themen\n${kontakte.size} Kontakte\n${importedTotal} Geschenke\n\nDrücke F5`);
        
    } catch (err) {
        console.error('❌ FEHLER:', err);
        alert('❌ Fehler: ' + err.message);
    }
}

console.log('');
console.log('🎁 IMPORT GELADEN');
console.log('📝 1. Füge deine Daten in Zeile 9 ein');
console.log('🚀 2. Tippe: importGeschenke()');
console.log('');
