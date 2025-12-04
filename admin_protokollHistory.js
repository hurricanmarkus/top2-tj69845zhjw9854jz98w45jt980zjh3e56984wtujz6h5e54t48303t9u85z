// // @ts-check
// BEGINN DER KORREKTUR: HIER FEHLTEN USERS UND ADMIN_ROLES
import { db, auditLogCollectionRef, currentUser, USERS, ADMIN_ROLES } from './haupteingang.js';
// ENDE DER KORREKTUR
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


// HIER IST DIE KOMPLETT KORRIGIERTE renderProtocolHistory FUNKTION

export async function renderProtocolHistory() {
    // --- KORREKTUR: Wir holen uns erst das Element, bevor wir es benutzen! ---
    const protocolHistoryArea = document.getElementById('protocolHistoryArea');
    if (!protocolHistoryArea) return; 

    // 1. Wir leeren den Bereich
    protocolHistoryArea.innerHTML = '';
    
    // 2. Wir definieren die EINFACHE Abfrage, die für JEDEN funktioniert.
    //    Wir holen immer die 100 neuesten Einträge, sortiert nach Zeit.
    const logQuery = query(auditLogCollectionRef, orderBy('timestamp', 'desc'), limit(100));

    // 3. Wir legen eine "Flagge" (Variable) an, die uns sagt, ob wir später filtern müssen.
    //    Standardmäßig ist sie 'false' (also "nichts filtern").
    let mustFilterLogs = false;
    let effectiveAdminPerms = {}; // Hier speichern wir die Rechte

    // 4. Wir prüfen, ob der aktuelle Benutzer ein 'ADMIN' ist (so wie Jasmin)
    if (currentUser.role === 'ADMIN') {
        
        // 4a. Finde die genauen Rechte für diesen Admin-Benutzer
        const adminUser = USERS[currentUser.mode];
        if (adminUser) {
            if (adminUser.permissionType === 'role' && adminUser.assignedAdminRoleId && ADMIN_ROLES[adminUser.assignedAdminRoleId]) {
                effectiveAdminPerms = ADMIN_ROLES[adminUser.assignedAdminRoleId].permissions || {};
            } else {
                effectiveAdminPerms = adminUser.adminPermissions || {};
            }
        }
        
        // 4b. JETZT PRÜFEN WIR: Wenn dieser Admin NICHT die Sysadmin-Logs sehen darf...
        if (!effectiveAdminPerms.canSeeSysadminLogs) {
            // ...dann setzen wir unsere "Flagge" auf 'true'.
            mustFilterLogs = true; 
        }
    }

    try {
        // 5. Wir führen die EINFACHE Abfrage aus.
        const snapshot = await getDocs(logQuery);
        
        if (!snapshot || snapshot.empty) {
            protocolHistoryArea.innerHTML += '<p class="text-gray-500">Keine Protokolleinträge vorhanden.</p>';
            return;
        }

        const logList = document.createElement('ul');
        logList.className = 'space-y-2';
        
        // 6. Wir fügen einen Zähler hinzu.
        let entriesFound = 0; 

        // 7. Wir gehen die Liste der Ergebnisse durch
        snapshot.forEach(docSnap => {
            const log = docSnap.data();
            const logId = docSnap.id;

            // 8. HIER IST DER FILTER:
            //    WENN unsere Flagge auf 'true' steht (also nur für Admins OHNE das Recht)
            //    UND die Rolle des Eintrags 'SYSTEMADMIN' ist...
            if (mustFilterLogs && log.performedByRole === 'SYSTEMADMIN') {
                // ...dann höre hier auf (überspringen)
                return; 
            }
            
            // 9. Eintrag ist erlaubt -> Zähler hoch
            entriesFound++;

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
        
        // 10. Zum Schluss prüfen wir unseren Zähler.
        if (entriesFound === 0) {
             protocolHistoryArea.innerHTML += '<p class="text-gray-500">Keine Protokolleinträge (die Sie sehen dürfen) vorhanden.</p>';
        } else {
             protocolHistoryArea.appendChild(logList);
        }
        
        // Listener für Löschen-Buttons
        protocolHistoryArea.querySelectorAll('.delete-log-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const logId = e.currentTarget.dataset.logId;
                if (confirm('Möchten Sie diesen Protokolleintrag wirklich löschen?')) {
                    await deleteDoc(doc(auditLogCollectionRef, logId));
                    rememberAdminScroll(); 
                    renderProtocolHistory();
                }
            });
        });

    } catch (error) {
        console.error("Error fetching protocol history:", error);
        protocolHistoryArea.innerHTML += `<p class="text-red-500">Fehler beim Laden des Protokolls. Bitte prüfen Sie die Browser-Konsole auf Detail-Fehler.</p>`;
    }
}

