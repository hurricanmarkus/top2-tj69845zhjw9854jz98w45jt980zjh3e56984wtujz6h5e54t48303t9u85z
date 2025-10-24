export async function logAdminAction(action, details) {
    try {
        if (!auditLogCollectionRef) return;
        const logData = {
            action: action,
            details: details,
            performedById: currentUser.mode,
            performedByName: currentUser.displayName,
            performedByRole: currentUser.role,
            timestamp: serverTimestamp()
        }; await addDoc(auditLogCollectionRef, logData); return logData;
    } catch (error) {
        console.error("Error logging action:", error);
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
            logQuery = query(auditLogCollectionRef, where('performedByRole', '!=', 'SYSTEMADMIN'), orderBy('performedByRole'), orderBy('timestamp', 'desc'));
        }
    }

    // Wenn keine spezielle Abfrage für Admins erstellt wurde, zeige alles (für Systemadmins)
    if (!logQuery) {
        logQuery = query(auditLogCollectionRef, orderBy('timestamp', 'desc'), limit(100));
    }

    try {
        const snapshot = await getDocs(logQuery);
        if (snapshot.empty) {
            protocolHistoryArea.innerHTML += '<p class="text-gray-500">Keine Protokolleinträge vorhanden.</p>';
            return;
        }

        const logList = document.createElement('ul');
        logList.className = 'space-y-2';
        snapshot.forEach(docSnap => {
            const log = docSnap.data();
            const logId = docSnap.id;
            const logDate = log.timestamp?.toDate().toLocaleString('de-DE') || '...';
            const listItem = document.createElement('li');
            listItem.className = 'text-sm p-2 bg-gray-50 rounded-md flex justify-between items-center';

            let deleteButton = '';
            if (currentUser.role === 'SYSTEMADMIN') {
                deleteButton = `<button class="delete-log-btn text-red-500 hover:text-red-700 transition" data-log-id="${logId}">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
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
                    await logAdminAction('log_deleted', `Protokolleintrag (ID: ${logId}) gelöscht.`);
                }
            });
        });

    } catch (error) {
        console.error("Error fetching protocol history:", error);
        protocolHistoryArea.innerHTML += `<p class="text-red-500">Fehler beim Laden des Protokolls. Möglicherweise muss ein Datenbank-Index erstellt werden. Bitte prüfen Sie die Browser-Konsole auf einen Link zur Erstellung.</p>`;
    }
}
