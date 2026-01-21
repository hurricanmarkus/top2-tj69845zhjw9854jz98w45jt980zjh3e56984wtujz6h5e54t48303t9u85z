// ========================================
// ADMIN: PUSHOVER CONFIG (USER-KEY ÄNDERUNGSANFRAGEN)
// ========================================

import { db, appId, currentUser, alertUser } from './haupteingang.js';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc, updateDoc, getDoc, deleteField } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

let pushoverChangeRequestsUnsubscribe = null;

export async function loadPushoverChangeRequests() {
    const container = document.getElementById('pushover-change-requests-list');
    if (!container) return;

    if (!db) {
        container.innerHTML = '<p class="text-center text-gray-400 italic">Firebase nicht verfügbar</p>';
        return;
    }

    try {
        const requestsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'pushover_userkey_change_requests');
        const q = query(requestsCollection, where('status', '==', 'pending'), orderBy('requestedAt', 'desc'));
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center text-gray-400 italic">Keine offenen Änderungsanfragen</p>';
            return;
        }

        const requests = [];
        snapshot.forEach(doc => {
            requests.push({ id: doc.id, ...doc.data() });
        });

        renderPushoverChangeRequests(requests);
    } catch (error) {
        console.error('Fehler beim Laden der Pushover-Änderungsanfragen:', error);
        container.innerHTML = '<p class="text-center text-red-500">Fehler beim Laden der Anfragen</p>';
    }
}

function renderPushoverChangeRequests(requests) {
    const container = document.getElementById('pushover-change-requests-list');
    if (!container) return;

    const html = requests.map(req => {
        const requestDate = req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleString('de-DE') : 'Unbekannt';
        
        return `
            <div class="p-4 bg-white rounded-lg border border-gray-300 shadow-sm">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="font-bold text-gray-800">${req.userName || req.userId}</h4>
                        <p class="text-xs text-gray-500">User-ID: ${req.userId}</p>
                        <p class="text-xs text-gray-500">Angefragt am: ${requestDate}</p>
                    </div>
                    <span class="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded-full">Ausstehend</span>
                </div>
                
                <div class="flex gap-2">
                    <button onclick="window.approvePushoverChangeRequest('${req.id}', '${req.userId}')" 
                            class="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition">
                        ✓ Annehmen
                    </button>
                    <button onclick="window.rejectPushoverChangeRequest('${req.id}')" 
                            class="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition">
                        ✗ Ablehnen
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

async function approvePushoverChangeRequest(requestId, userId) {
    if (!confirm('User-Key wirklich zurücksetzen?\n\nDer Benutzer kann danach einen neuen User-Key setzen.')) {
        return;
    }

    try {
        // 1. User-Key in pushover_programs löschen
        const pushoverProgramsDoc = doc(db, 'artifacts', appId, 'public', 'data', 'pushover_programs', userId);
        await updateDoc(pushoverProgramsDoc, {
            userKey: deleteField()
        });

        // 2. Anfrage löschen
        const requestDoc = doc(db, 'artifacts', appId, 'public', 'data', 'pushover_userkey_change_requests', requestId);
        await deleteDoc(requestDoc);

        alertUser('Änderungsanfrage genehmigt. Der User-Key wurde zurückgesetzt.', 'success');
        loadPushoverChangeRequests();
    } catch (error) {
        console.error('Fehler beim Genehmigen der Anfrage:', error);
        alertUser('Fehler beim Genehmigen. Bitte erneut versuchen.', 'error');
    }
}

async function rejectPushoverChangeRequest(requestId) {
    if (!confirm('Änderungsanfrage wirklich ablehnen?\n\nDie Anfrage wird gelöscht und der User-Key bleibt unverändert.')) {
        return;
    }

    try {
        const requestDoc = doc(db, 'artifacts', appId, 'public', 'data', 'pushover_userkey_change_requests', requestId);
        await deleteDoc(requestDoc);

        alertUser('Änderungsanfrage abgelehnt und gelöscht.', 'success');
        loadPushoverChangeRequests();
    } catch (error) {
        console.error('Fehler beim Ablehnen der Anfrage:', error);
        alertUser('Fehler beim Ablehnen. Bitte erneut versuchen.', 'error');
    }
}

// Global verfügbar machen
window.approvePushoverChangeRequest = approvePushoverChangeRequest;
window.rejectPushoverChangeRequest = rejectPushoverChangeRequest;
