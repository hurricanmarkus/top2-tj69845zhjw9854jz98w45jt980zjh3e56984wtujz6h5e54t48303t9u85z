window.toggleArchiveKontakt = async function(id) {
    const kontakt = KONTAKTE[id];
    if (!kontakt) return;
    
    try {
        const kontaktDocRef = doc(geschenkeKontakteRef, id);
        await updateDoc(kontaktDocRef, { archiviert: !kontakt.archiviert });
        alertUser(kontakt.archiviert ? 'Kontakt wiederhergestellt!' : 'Kontakt archiviert!', 'success');
    } catch (e) {
        alertUser('Fehler: ' + e.message, 'error');
    }
};
