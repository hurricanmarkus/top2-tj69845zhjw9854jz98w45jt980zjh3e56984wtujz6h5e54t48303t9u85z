// ========================================
// FINALE LÖSUNG - GESCHENKE KOPIEREN
// ========================================
// Kopiert ALLE Geschenke von Firebase UID zu App-User-ID
// ========================================

(async function() {
    console.log('🎯 === FINALE GESCHENKE-REPARATUR ===');
    
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    const { getApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
    const { collection, getDocs, doc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    
    const app = getApp();
    const db = getFirestore(app);
    const auth = getAuth(app);
    const APP_ID = '20LVob88b3ovXRUyX3ra';
    
    const fromUserId = 'qOD2yqXT07azA8sSJ5SZwDm8ul12'; // Firebase UID (hardcoded)
    const toUserId = 'V7IOJlD7edJBeVjwe52b'; // App-User-ID (hardcoded)
    
    console.log('📤 Quelle:', fromUserId);
    console.log('📥 Ziel:', toUserId);
    console.log('');
    
    if (!confirm(`FINALE REPARATUR\n\nKopiert ALLE Geschenke von Firebase UID zur App-User-ID.\n\nFortfahren?`)) {
        console.log('❌ Abgebrochen');
        return;
    }
    
    try {
        let totalGeschenke = 0;
        
        // Liste der Themen-IDs (aus deinem Check-Script)
        const themenMapping = {
            'thema_1765764849636_sfuwz79f3': 'Weihnachten 2024',
            'thema_1765764853782_740tq77k4': 'Weihnachten 2023',
            'thema_1765764857003_0856k06gs': '"Weihnachten 2023',
            'thema_1765764857251_pmcxwr833': 'Weihnachten 2022',
            'thema_1765764862457_hewpc9oy1': 'Weihnachten 2021',
            'thema_1765764866633_9h686qyky': 'Weihnachten 2020',
            'thema_1765764868736_064n0q2wl': 'Weihnachten 2019'
        };
        
        for (const [themaId, themaName] of Object.entries(themenMapping)) {
            console.log(`\n📁 ${themaName} (${themaId})`);
            
            // Lese Geschenke von QUELLE (Firebase UID)
            const sourceRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', fromUserId, 'geschenke_themen', themaId, 'geschenke');
            
            try {
                const sourceSnap = await getDocs(sourceRef);
                console.log(`  📦 Geschenke gefunden: ${sourceSnap.size}`);
                
                if (sourceSnap.size === 0) {
                    console.log('  ⏭️ Keine Geschenke - überspringe');
                    continue;
                }
                
                // Kopiere jedes Geschenk zum ZIEL (App-User-ID)
                for (const geschenkDoc of sourceSnap.docs) {
                    const data = geschenkDoc.data();
                    data.createdBy = toUserId;
                    
                    const targetRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', toUserId, 'geschenke_themen', themaId, 'geschenke', geschenkDoc.id);
                    await setDoc(targetRef, data);
                    
                    totalGeschenke++;
                }
                
                console.log(`  ✅ ${sourceSnap.size} Geschenke kopiert`);
                
            } catch (error) {
                console.log(`  ❌ Fehler: ${error.message}`);
            }
            
            await new Promise(r => setTimeout(r, 100));
        }
        
        console.log('\n🎉 === REPARATUR ABGESCHLOSSEN ===');
        console.log(`✅ ${totalGeschenke} Geschenke kopiert`);
        console.log('\n💡 Drücke F5 zum Neuladen!');
        
        alert(`✅ Reparatur erfolgreich!\n\n${totalGeschenke} Geschenke kopiert\n\nDrücke F5!`);
        
    } catch (error) {
        console.error('❌ FEHLER:', error);
        alert('❌ Fehler: ' + error.message);
    }
})();
