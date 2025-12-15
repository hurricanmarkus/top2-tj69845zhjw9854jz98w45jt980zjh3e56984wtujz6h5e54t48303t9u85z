// ========================================
// DATEN VERSCHIEBEN
// ========================================
// Verschiebt Geschenke von Firebase UID zu App-User-ID
// In Console ausführen (F12)
// ========================================

(async function() {
    console.log('📦 === DATEN VERSCHIEBEN START ===');
    
    const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
    const { getApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
    const { collection, getDocs, doc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
    
    const app = getApp();
    const db = getFirestore(app);
    const auth = getAuth(app);
    const user = auth.currentUser;
    const APP_ID = '20LVob88b3ovXRUyX3ra';
    
    const fromUserId = user.uid; // Firebase UID
    const toUserId = window.currentUser.mode; // App User ID
    
    console.log('📤 Von:', fromUserId);
    console.log('📥 Nach:', toUserId);
    
    if (!confirm(`Daten verschieben?\n\nVon: ${fromUserId}\nNach: ${toUserId}`)) {
        console.log('❌ Abgebrochen');
        return;
    }
    
    try {
        // 1. Kontakte verschieben
        console.log('\n👥 Verschiebe Kontakte...');
        const kontakteRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', fromUserId, 'geschenke_kontakte');
        const kontakteSnap = await getDocs(kontakteRef);
        
        for (const kontaktDoc of kontakteSnap.docs) {
            const data = kontaktDoc.data();
            data.createdBy = toUserId; // Update createdBy
            
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', toUserId, 'geschenke_kontakte', kontaktDoc.id), data);
            console.log(`  ✅ ${data.name}`);
        }
        
        // 2. Themen + Geschenke verschieben
        console.log('\n📁 Verschiebe Themen und Geschenke...');
        const themenRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', fromUserId, 'geschenke_themen');
        const themenSnap = await getDocs(themenRef);
        
        for (const themaDoc of themenSnap.docs) {
            const themaData = themaDoc.data();
            themaData.createdBy = toUserId; // Update createdBy
            
            // Thema kopieren
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', toUserId, 'geschenke_themen', themaDoc.id), themaData);
            console.log(`  📁 ${themaData.name}`);
            
            // Geschenke unter diesem Thema verschieben
            const geschenkeRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users', fromUserId, 'geschenke_themen', themaDoc.id, 'geschenke');
            const geschenkeSnap = await getDocs(geschenkeRef);
            
            for (const geschenkDoc of geschenkeSnap.docs) {
                const geschenkData = geschenkDoc.data();
                geschenkData.createdBy = toUserId; // Update createdBy
                
                await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', toUserId, 'geschenke_themen', themaDoc.id, 'geschenke', geschenkDoc.id), geschenkData);
            }
            
            console.log(`    → ${geschenkeSnap.size} Geschenke verschoben`);
        }
        
        console.log('\n🎉 === VERSCHIEBEN ERFOLGREICH ===');
        console.log(`✅ ${kontakteSnap.size} Kontakte`);
        console.log(`✅ ${themenSnap.size} Themen`);
        console.log('\n💡 Drücke F5 zum Neuladen!');
        
        alert('✅ Daten erfolgreich verschoben!\n\nDrücke F5 zum Neuladen.');
        
    } catch (error) {
        console.error('❌ FEHLER:', error);
        alert('❌ Fehler: ' + error.message);
    }
})();
