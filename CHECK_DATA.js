// ========================================
// DATEN PRÜFEN - Wo sind die Geschenke?
// ========================================
// In Console ausführen (F12)
// ========================================

(async function() {
    console.log('🔍 === DATEN-PRÜFUNG START ===');
    
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    const { getApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    
    const app = getApp();
    const db = getFirestore(app);
    const auth = getAuth(app);
    const user = auth.currentUser;
    const APP_ID = '20LVob88b3ovXRUyX3ra';
    
    console.log('👤 Firebase UID:', user.uid);
    console.log('👤 App User ID:', window.currentUser?.mode);
    
    // Prüfe beide Pfade
    const paths = [
        { name: 'Firebase UID', userId: user.uid },
        { name: 'App User ID', userId: window.currentUser?.mode }
    ];
    
    for (const path of paths) {
        if (!path.userId) continue;
        
        console.log(`\n📁 Prüfe ${path.name}: ${path.userId}`);
        
        try {
            // Prüfe Themen
            const themenRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', path.userId, 'geschenke_themen');
            const themenSnap = await getDocs(themenRef);
            console.log(`  📦 Themen gefunden: ${themenSnap.size}`);
            
            if (themenSnap.size > 0) {
                themenSnap.forEach(doc => {
                    console.log(`    - ${doc.data().name}`);
                });
            }
            
            // Prüfe Kontakte
            const kontakteRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', path.userId, 'geschenke_kontakte');
            const kontakteSnap = await getDocs(kontakteRef);
            console.log(`  👥 Kontakte gefunden: ${kontakteSnap.size}`);
            
        } catch (error) {
            console.log(`  ❌ Fehler: ${error.message}`);
        }
    }
    
    console.log('\n✅ Prüfung abgeschlossen');
})();
