// ========================================
// APP DEBUG - Was lädt die App?
// ========================================
// Zeigt was die App gerade lädt
// In Console ausführen (F12) - IM GESCHENKEMANAGEMENT!
// ========================================

console.log('🔍 === APP DEBUG ===');
console.log('');
console.log('📋 GLOBALE VARIABLEN:');
console.log('  currentUser:', window.currentUser);
console.log('  currentUser.mode:', window.currentUser?.mode);
console.log('  db:', typeof window.db);
console.log('  appId:', window.appId);
console.log('');
console.log('📁 THEMEN:');
console.log('  THEMEN Objekt:', window.THEMEN);
console.log('  Anzahl Themen:', Object.keys(window.THEMEN || {}).length);
console.log('');
console.log('🎁 GESCHENKE:');
console.log('  GESCHENKE Objekt:', window.GESCHENKE);
console.log('  Anzahl Geschenke:', Object.keys(window.GESCHENKE || {}).length);
console.log('');
console.log('👥 KONTAKTE:');
console.log('  KONTAKTE Objekt:', window.KONTAKTE);
console.log('  Anzahl Kontakte:', Object.keys(window.KONTAKTE || {}).length);
console.log('');
console.log('🎯 AKTUELLES THEMA:');
console.log('  currentThemaId:', window.currentThemaId);
console.log('  geschenkeCollection:', window.geschenkeCollection);
console.log('');
console.log('✅ Debug abgeschlossen');
console.log('');
console.log('💡 Wenn THEMEN leer ist, werden die Themen nicht geladen!');
