// ========================================
// GESCHENKE FINDEN
// ========================================
// Sucht ÜBERALL nach den Geschenken
// ========================================

(async function() {
    console.log('🔍 === GESCHENKE SUCHEN ===');
    
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const { getApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    
    const app = getApp();
    const db = getFirestore(app);
    const APP_ID = '20LVob88b3ovXRUyX3ra';
    
    const userIds = [
        'qOD2yqXT07azA8sSJ5SZwDm8ul12', // Firebase UID
        'V7IOJlD7edJBeVjwe52b'          // App User ID
    ];
    
    const themaId = 'thema_1765764849636_sfuwz79f3'; // Weihnachten 2024
    
    console.log('🎯 Suche Geschenke für: Weihnachten 2024');
    console.log('📋 Thema-ID:', themaId);
    console.log('');
    
    for (const userId of userIds) {
        console.log(`\n👤 User: ${userId}`);
        
        const path = `artifacts/${APP_ID}/public/data/users/${userId}/geschenke_themen/${themaId}/geschenke`;
        console.log(`📂 Pfad: ${path}`);
        
        try {
            const ref = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId, 'geschenke_themen', themaId, 'geschenke');
            const snap = await getDocs(ref);
            
            console.log(`🎁 Geschenke gefunden: ${snap.size}`);
            
            if (snap.size > 0) {
                console.log('📋 Erste 3 Geschenke:');
                snap.docs.slice(0, 3).forEach(doc => {
                    const data = doc.data();
                    console.log(`  - ${data.titel || 'KEIN TITEL'} (ID: ${doc.id})`);
                });
            }
            
        } catch (error) {
            console.log(`❌ Fehler: ${error.message}`);
        }
    }
    
    console.log('\n✅ Suche abgeschlossen');
})();
