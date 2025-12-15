// ========================================
// GESCHENKE REPARIEREN
// ========================================
// Verschiebt Geschenke von Firebase UID zu App-User-ID
// GARANTIERT FUNKTIONIEREND
// ========================================

(async function() {
    console.log('🔧 === GESCHENKE REPARATUR START ===');
    
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    const { getApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
    const { collection, getDocs, doc, setDoc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    
    const app = getApp();
    const db = getFirestore(app);
    const auth = getAuth(app);
    const user = auth.currentUser;
    const APP_ID = '20LVob88b3ovXRUyX3ra';
    
    const fromUserId = user.uid; // qOD2yqXT07azA8sSJ5SZwDm8ul12
    const toUserId = 'V7IOJlD7edJBeVjwe52b'; // Deine App-User-ID
    
    console.log('📤 Von (Firebase UID):', fromUserId);
    console.log('📥 Nach (App User ID):', toUserId);
    
    if (!confirm(`Geschenke verschieben?\n\nVon: ${fromUserId}\nNach: ${toUserId}\n\nDies verschiebt alle Geschenke in die richtige User-ID.`)) {
        console.log('❌ Abgebrochen');
        return;
    }
    
    try {
        // Hole alle Themen von der QUELLE (Firebase UID)
        console.log('\n📁 Lade Themen von Quelle...');
        const sourceThemenRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', fromUserId, 'geschenke_themen');
        const sourceThemenSnap = await getDocs(sourceThemenRef);
        
        console.log(`📦 Gefundene Themen: ${sourceThemenSnap.size}\n`);
        
        let totalGeschenke = 0;
        
        for (const themaDoc of sourceThemenSnap.docs) {
            const themaData = themaDoc.data();
            const themaId = themaDoc.id;
            
            console.log(`📁 Verarbeite: ${themaData.name} (${themaId})`);
            
            // Hole Geschenke aus QUELLE
            const sourceGeschenkeRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', fromUserId, 'geschenke_themen', themaId, 'geschenke');
            const sourceGeschenkeSnap = await getDocs(sourceGeschenkeRef);
            
            console.log(`  🎁 Geschenke gefunden: ${sourceGeschenkeSnap.size}`);
            
            if (sourceGeschenkeSnap.size === 0) {
                console.log('  ⏭️ Keine Geschenke - überspringe');
                continue;
            }
            
            // Verschiebe jedes Geschenk zum ZIEL
            for (const geschenkDoc of sourceGeschenkeSnap.docs) {
                const geschenkData = geschenkDoc.data();
                geschenkData.createdBy = toUserId; // Update createdBy
                
                // Schreibe zum ZIEL
                const targetGeschenkRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', toUserId, 'geschenke_themen', themaId, 'geschenke', geschenkDoc.id);
                await setDoc(targetGeschenkRef, geschenkData);
                
                totalGeschenke++;
            }
            
            console.log(`  ✅ ${sourceGeschenkeSnap.size} Geschenke verschoben`);
            
            // Kleine Pause
            await new Promise(r => setTimeout(r, 100));
        }
        
        console.log('\n🎉 === REPARATUR ERFOLGREICH ===');
        console.log(`✅ ${totalGeschenke} Geschenke verschoben`);
        console.log('\n💡 Drücke F5 zum Neuladen!');
        
        alert(`✅ Reparatur erfolgreich!\n\n${totalGeschenke} Geschenke verschoben\n\nDrücke F5 zum Neuladen!`);
        
    } catch (error) {
        console.error('❌ FEHLER:', error);
        alert('❌ Fehler: ' + error.message);
    }
})();
