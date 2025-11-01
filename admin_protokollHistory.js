import { db, auditLogCollectionRef, currentUser, USERS, ADMIN_ROLES } from './haupteingang.js';
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
    
    // --- START DER KORREKTUR ---

    // 1. Berechtigungen des Admins VORHER prüfen
    // Standardmäßig (true) darf ein Admin/Sysadmin alles sehen.
    // Wir setzen es nur auf 'false', wenn es ein Admin ist, der es explizit NICHT darf.
    let canAdminSeeSysadminLogs = true; 

    if (currentUser.role === 'ADMIN') {
        // Wir müssen prüfen, ob die globalen Variablen USERS und ADMIN_ROLES geladen sind
        // (Sie werden in haupteingang.js importiert und sollten hier verfügbar sein)
        try {
            let effectiveAdminPerms = {};
            const adminUser = USERS[currentUser.mode];
            if (adminUser) {
                if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                    effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
                } else {
                    effectiveAdminPerms = adminUser.adminPermissions || {};
                }
            }
            // HIER die Prüfung: Wenn die Berechtigung (canSeeSysadminLogs) NICHT auf true gesetzt ist, setzen wir unseren Schalter auf false.
            if (effectiveAdminPerms.canSeeSysadminLogs !== true) {
                canAdminSeeSysadminLogs = false;
            }
        } catch (e) {
            console.error("Fehler beim Prüfen der Admin-Berechtigungen (USERS/ADMIN_ROLES geladen?):", e);
            // Fährt sicherheitshalber fort, als ob der Admin keine Rechte hätte
            canAdminSeeSysadminLogs = false;
        }
    }
    // (Wenn currentUser.role === 'SYSTEMADMIN' ist, bleibt canAdminSeeSysadminLogs auf true)


    // 2. IMMER die einfache Abfrage verwenden, die keinen Index erfordert
    // Wir holen immer die letzten 100 Einträge, sortiert nach Zeit
    const logQuery = query(auditLogCollectionRef, orderBy('timestamp', 'desc'), limit(100));
    
    // --- ENDE DER KORREKTUR ---

    try {
        const snapshot = await getDocs(logQuery);
        if (!snapshot || snapshot.empty) {
            protocolHistoryArea.innerHTML += '<p class="text-gray-500">Keine Protokolleinträge vorhanden.</p>';
            return;
        }

        const logList = document.createElement('ul');
        logList.className = 'space-y-2';
        
        let itemsAdded = 0; // Zähler für gefilterte Einträge

        snapshot.forEach(docSnap => {
            const log = docSnap.data();
            const logId = docSnap.id;
            
            // --- START DER KORREKTUR (FILTER) ---
            // 3. HIER filtern wir in JavaScript (im Browser), nicht in der Datenbank
            // Wenn der aktuelle Admin KEINE Sysadmin-Logs sehen darf UND dieser Log-Eintrag VON einem Sysadmin ist...
            if (canAdminSeeSysadminLogs === false && log.performedByRole === 'SYSTEMADMIN') {
                return; // ...dann überspringe diesen Eintrag und zeige ihn nicht an.
            }
            // --- ENDE DER KORREKTUR (FILTER) ---

            itemsAdded++; // Zähle hoch, dass wir einen Eintrag anzeigen

            const logDate = log.timestamp?.toDate?.().toLocaleString('de-DE') || '...';
            const listItem = document.createElement('li');
            listItem.className = 'text-sm p-2 bg-gray-50 rounded-md flex justify-between items-center';

            let deleteButton = '';
            // Nur Systemadmins dürfen löschen
            if (currentUser.role === 'SYSTEMADMIN') {
                deleteButton = `<button class="delete-log-btn text-red-500 hover:text-red-700 transition" data-log-id="${logId}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 001.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                        </button>`;
            }

            listItem.innerHTML = `<div><span class="font-mono text-xs text-gray-500">${logDate}</span><br><strong>${log.performedByName}</strong>: ${log.details}</div> ${deleteButton}`;
            logList.appendChild(listItem);
        });
        
        // --- START DER KORREKTUR (Leere-Meldung) ---
        // 4. Prüfen, ob nach dem Filtern noch Einträge übrig sind
        if (itemsAdded === 0) {
             // Wenn wir Einträge geholt haben, aber alle rausgefiltert wurden
             if (!snapshot.empty) {
                 protocolHistoryArea.innerHTML += '<p class="text-gray-500">Keine Protokolleinträge vorhanden, die Ihren Berechtigungen entsprechen.</p>';
             } else {
                 // Wenn die Datenbank wirklich leer war
                 protocolHistoryArea.innerHTML += '<p class="text-gray-500">Keine Protokolleinträge vorhanden.</p>';
             }
        } else {
             // Nur wenn Einträge übrig sind, hängen wir die Liste an
             protocolHistoryArea.appendChild(logList);
        }
        // --- ENDE DER KORREKTUR (Leere-Meldung) ---


        protocolHistoryArea.querySelectorAll('.delete-log-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const logId = e.currentTarget.dataset.logId;
                if (confirm('Möchten Sie diesen Protokolleintrag wirklich löschen?')) {
                    await deleteDoc(doc(auditLogCollectionRef, logId));
                    rememberAdminScroll(); // Aktuelle Scrollposition speichern
                    renderProtocolHistory(); // Neu rendern
                }
            });
        });

    } catch (error) {
        console.error("Error fetching protocol history:", error);
        // Diese Fehlermeldung sollte jetzt nicht mehr wegen eines Index-Problems erscheinen
        protocolHistoryArea.innerHTML += `<p class="text-red-500">Fehler beim Laden des Protokolls. Bitte prüfen Sie die Browser-Konsole auf Detail-Fehler.</p>`;
    }
}

export async function renderProtocolHistory() {
    protocolHistoryArea.innerHTML = '';
    let logQuery;

    // NEU: Berechtigungen des Admins prüfen
    if (currentUser.role === 'ADMIN') {
        let effectiveAdminPerms = {};
        const adminUser = USERS[currentUser.mode];
        if (adminUser) {
            if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
            } else {
                effectiveAdminPerms = adminUser.adminPermissions || {};
            }
        }
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