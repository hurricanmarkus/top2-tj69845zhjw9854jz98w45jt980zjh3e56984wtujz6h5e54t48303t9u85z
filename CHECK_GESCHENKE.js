// ========================================
// GESCHENKE IN THEMEN PRÜFEN
// ========================================
// Prüft ob Geschenke in den Themen vorhanden sind
// In Console ausführen (F12)
// ========================================

(async function() {
    console.log('🔍 === GESCHENKE-PRÜFUNG START ===');
    
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    const { getApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    
    const app = getApp();
    const db = getFirestore(app);
    const auth = getAuth(app);
    const user = auth.currentUser;
    const APP_ID = '20LVob88b3ovXRUyX3ra';
    
    const appUserId = window.currentUser.mode;
    
    console.log('👤 App User ID:', appUserId);
    console.log('\n📁 Prüfe Geschenke in Themen...\n');
    
    try {
        // Hole alle Themen
        const themenRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', appUserId, 'geschenke_themen');
        const themenSnap = await getDocs(themenRef);
        
        console.log(`📦 Gefundene Themen: ${themenSnap.size}\n`);
        
        for (const themaDoc of themenSnap.docs) {
            const themaData = themaDoc.data();
            console.log(`📁 ${themaData.name} (ID: ${themaDoc.id})`);
            
            // Prüfe Geschenke in diesem Thema
            const geschenkeRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', appUserId, 'geschenke_themen', themaDoc.id, 'geschenke');
            const geschenkeSnap = await getDocs(geschenkeRef);
            
            console.log(`  🎁 Geschenke: ${geschenkeSnap.size}`);
            
            if (geschenkeSnap.size > 0) {
                geschenkeSnap.docs.slice(0, 3).forEach(doc => {
                    console.log(`    - ${doc.data().titel}`);
                });
                if (geschenkeSnap.size > 3) {
                    console.log(`    ... und ${geschenkeSnap.size - 3} weitere`);
                }
            }
            console.log('');
        }
        
        console.log('✅ Prüfung abgeschlossen');
        
    } catch (error) {
        console.error('❌ FEHLER:', error);
    }
})();
