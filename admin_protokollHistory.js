import { db, auditLogCollectionRef, currentUser } from './haupteingang.js';
import { query, orderBy, limit, setDoc, onSnapshot, collection, doc, addDoc, getDocs, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { rememberAdminScroll, restoreAdminScrollIfAny } from './admin_adminfunktionenHome.js';

// ERSETZE DEINE AKTUELLE logAdminAction FUNKTION HIERMIT:

export async function logAdminAction(action, details) {
    try {
        if (!auditLogCollectionRef) {
            console.warn("Audit log collection reference ist nicht verfügbar.");
            return;
        }

        // 1. Clientseitig EINDEUTIGE ID generieren
        // doc(collection) erstellt einen leeren DocumentReference mit einer neuen, eindeutigen ID
        const newDocRef = doc(auditLogCollectionRef); 

        const logData = {
            action: action,
            details: details,
            performedById: currentUser.mode,
            performedByName: currentUser.displayName,
            performedByRole: currentUser.role,
            timestamp: serverTimestamp()
        };

        // 2. setDoc mit der garantierten ID verwenden (um den addDoc-Konflikt zu vermeiden)
        await setDoc(newDocRef, logData);
        
        // console.log(`Protokolleintrag erfolgreich gespeichert unter ID: ${newDocRef.id}`); // Debug-Log entfernt

        return logData;
    } catch (error) {
        // Dies ist die Zeile 19, die den Fehler meldet. Sie sollte jetzt nicht mehr erreicht werden.
        console.error("Fehler beim Logging der Aktion:", error); 
    }
}

export async function renderProtocolHistory() {
    protocolHistoryArea.innerHTML = '';
    let logQuery;

    // NEU: Berechtigungen des Admins prüfen
    if (currentUser.role === 'ADMIN') {
        let effectiveAdminPerms = {};

        // ================== HIER IST DIE FÜNFTE KORREKTUR ==================
        // Holen der Admin-Daten direkt aus dem currentUser-Objekt
        const adminType = currentUser.adminPermissionType || 'role';
        
        if (adminType === 'role' && currentUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[currentUser.assignedAdminRoleId]) { 
            effectiveAdminPerms = ADMIN_ROLES[currentUser.assignedAdminRoleId].permissions || {};
        } else {
            effectiveAdminPerms = currentUser.adminPermissions || {};
        }
        // ================== ENDE DER FÜNFTEN KORREKTUR ==================


        // Wenn der Admin nicht die Berechtigung hat, Sysadmin-Logs zu sehen, filtern
        if (!effectiveAdminPerms.canSeeSysadminLogs) {
            // Filter: exclude SYSTEMADMIN entries
            logQuery = query(auditLogCollectionRef, where('performedByRole', '!=', 'SYSTEMADMIN'), orderBy('performedByRole'), orderBy('timestamp', 'desc'));
        }
    }

    // Wenn keine spezielle Abfrage für Admins erstellt wurde, zeige alles (für Systemadmins)
    if (!logQuery) {
        logQuery = query(auditLogCollectionRef, orderBy('timestamp', 'desc'), limit(100));
    }

    try {
        const snapshot = await getDocs(logQuery);
        if (!snapshot || snapshot.empty) {
            protocolHistoryArea.innerHTML += '<p class="text-gray-500">Keine Protokolleinträge vorhanden.</p>';
            return;
        }

        const logList = document.createElement('ul');
        logList.className = 'space-y-2';
        snapshot.forEach(docSnap => {
            const log = docSnap.data();
            const logId = docSnap.id;
            const logDate = log.timestamp?.toDate?.().toLocaleString('de-DE') || '...';
            const listItem = document.createElement('li');
            listItem.className = 'text-sm p-2 bg-gray-50 rounded-md flex justify-between items-center';

            let deleteButton = '';
            if (currentUser.role === 'SYSTEMADMIN') {
                deleteButton = `<button class="delete-log-btn text-red-500 hover:text-red-700 transition" data-log-id="${logId}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 001.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                        </button>`;
            }

            listItem.innerHTML = `<div><span class="font-mono text-xs text-gray-500">${logDate}</span><br><strong>${log.performedByName}</strong>: ${log.details}</div> ${deleteButton}`;
            logList.appendChild(listItem);
        });
        protocolHistoryArea.appendChild(logList);

        protocolHistoryArea.querySelectorAll('.delete-log-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const logId = e.currentTarget.dataset.logId;
                if (confirm('Möchten Sie diesen Protokolleintrag wirklich löschen?')) {
                    await deleteDoc(doc(auditLogCollectionRef, logId));
                    rememberAdminScroll(); // Aktuelle Scrollposition speichern
                    renderProtocolHistory();
                }
            });
        });

    } catch (error) {
        console.error("Error fetching protocol history:", error);
        protocolHistoryArea.innerHTML += `<p class="text-red-500">Fehler beim Laden des Protokolls. Möglicherweise muss ein Datenbank-Index erstellt werden. Bitte prüfen Sie die Browser-Konsole auf Detail-Fehler.</p>`;
    }
}