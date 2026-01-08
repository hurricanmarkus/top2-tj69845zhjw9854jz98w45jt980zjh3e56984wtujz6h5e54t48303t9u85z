// @ts-check 
// ========================================
// VERTRAGSVERWALTUNG SYSTEM
// ========================================

import {
    alertUser,
    db,
    currentUser,
    USERS,
    navigate,
    appId
} from './haupteingang.js';

import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    getDoc,
    getDocs,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================
let vertraegeCollection = null;
let vertraegeThemenRef = null;
let vertraegeEinladungenRef = null;
let VERTRAEGE = {};
let VERTRAEGE_THEMEN = {};
let VERTRAEGE_EINLADUNGEN = {};
let currentThemaId = null;
let currentFilter = { rhythmus: '', absicht: '' };
let searchTerm = '';
let unsubscribeVertraege = null;

// Zugriffsrechte-Konfiguration
const ZUGRIFFSRECHTE = {
    nicht_teilen: { label: 'Nicht teilen', icon: '🔒', canEdit: false, canView: false },
    lesen: { label: 'Nur Lesen', icon: '👁️', canEdit: false, canView: true },
    bearbeiten: { label: 'Bearbeiten', icon: '✏️', canEdit: true, canView: true },
    vollzugriff: { label: 'Vollzugriff', icon: '🔓', canEdit: true, canView: true, canDelete: true }
};

// Rhythmus-Konfiguration
const RHYTHMUS_CONFIG = {
    taeglich: { label: 'Täglich', multiplierToMonthly: 30, icon: '📅' },
    woechentlich: { label: 'Wöchentlich', multiplierToMonthly: 4.33, icon: '📆' },
    monatlich: { label: 'Monatlich', multiplierToMonthly: 1, icon: '🗓️' },
    quartalsweise: { label: 'Quartalsweise', multiplierToMonthly: 0.33, icon: '📊' },
    halbjaehrlich: { label: 'Halbjährlich', multiplierToMonthly: 0.167, icon: '📈' },
    jaehrlich: { label: 'Jährlich', multiplierToMonthly: 0.083, icon: '🎯' }
};

// Kündigungsabsicht-Konfiguration
const ABSICHT_CONFIG = {
    behalten: { label: 'Behalten', icon: '✅', color: 'bg-green-100 text-green-800', priority: 0 },
    ueberlege: { label: 'Überlege', icon: '🤔', color: 'bg-yellow-100 text-yellow-800', priority: 1 },
    kuendigen: { label: 'Will kündigen', icon: '📝', color: 'bg-orange-100 text-orange-800', priority: 2 },
    dringend: { label: 'Dringend!', icon: '🚨', color: 'bg-red-100 text-red-800', priority: 3 }
};

// Monatsnamen
const MONATSNAMEN = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// Temporäre Sonderzahlungen für das Modal
let tempSonderzahlungen = [];

// ========================================
// INITIALISIERUNG
// ========================================
export async function initializeVertragsverwaltung() {
    console.log("📋 Vertragsverwaltung wird initialisiert...");

    if (db) {
        vertraegeThemenRef = collection(db, 'artifacts', appId, 'public', 'data', 'vertraege_themen');
        vertraegeEinladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'vertraege_einladungen');
        
        console.log("📂 Firebase Referenzen erstellt:");
        console.log("  - Themen:", vertraegeThemenRef.path);
        console.log("  - Einladungen:", vertraegeEinladungenRef.path);
        
        await loadVertraegeThemen();
        loadVertraegeEinladungen();
    }

    setupEventListeners();
}

// ========================================
// THEMEN-SYSTEM (REVISIERT)
// ========================================
async function loadVertraegeThemen() {
    try {
        console.log("🔄 Lade Vertrags-Themen...");
        const snapshot = await getDocs(vertraegeThemenRef);
        VERTRAEGE_THEMEN = {};
        
        const userId = currentUser?.mode || currentUser?.displayName;
        console.log("👤 Aktueller User-ID:", userId);
        
        snapshot.forEach((docSnap) => {
            const thema = { id: docSnap.id, ...docSnap.data() };
            
            // DATENSCHUTZ: Nur Themen laden, die ich erstellt habe oder wo ich Mitglied bin
            const isCreator = thema.erstellerId === userId || thema.ersteller === currentUser?.displayName;
            const isMember = thema.mitglieder?.some(m => m.userId === userId);
            
            if (isCreator || isMember) {
                VERTRAEGE_THEMEN[docSnap.id] = thema;
                console.log(`  📁 Thema: "${thema.name}" (Ersteller: ${isCreator}, Mitglied: ${isMember})`);
            }
        });
        
        console.log(`✅ ${Object.keys(VERTRAEGE_THEMEN).length} Vertrags-Themen geladen`);
        
        // WICHTIG: Nur Standard-Thema erstellen wenn WIRKLICH keines existiert
        // Prüfe ob der User überhaupt schon ein "Privat"-Thema hat
        if (Object.keys(VERTRAEGE_THEMEN).length === 0) {
            console.log("⚠️ Keine Themen für diesen User - erstelle Standard-Thema");
            await createDefaultVertragsThema();
        }
        
        // Gespeichertes Thema oder erstes Thema auswählen
        const savedThemaId = localStorage.getItem('vv_current_thema');
        
        if (savedThemaId && VERTRAEGE_THEMEN[savedThemaId]) {
            currentThemaId = savedThemaId;
        } else {
            currentThemaId = Object.keys(VERTRAEGE_THEMEN)[0];
        }
        
        console.log(`✅ Aktives Thema: ${VERTRAEGE_THEMEN[currentThemaId]?.name}`);
        
        renderVertraegeThemenDropdown();
        updateCollectionForVertragsThema();
    } catch (e) {
        console.error("❌ Fehler beim Laden der Vertrags-Themen:", e);
    }
}

async function createDefaultVertragsThema() {
    try {
        const userId = currentUser?.mode || currentUser?.displayName;
        const userName = currentUser?.displayName || 'Unbekannt';
        
        const defaultThema = {
            name: 'Privat',
            ersteller: userName,
            erstellerId: userId,
            erstelltAm: serverTimestamp(),
            mitglieder: [{
                userId: userId,
                name: userName,
                zugriffsrecht: 'vollzugriff'
            }]
        };
        const docRef = await addDoc(vertraegeThemenRef, defaultThema);
        VERTRAEGE_THEMEN[docRef.id] = { id: docRef.id, ...defaultThema };
        currentThemaId = docRef.id;
        console.log("✅ Standard-Thema erstellt:", docRef.id);
    } catch (e) {
        console.error("Fehler beim Erstellen des Standard-Themas:", e);
    }
}

function updateCollectionForVertragsThema() {
    if (currentThemaId && db) {
        // Verträge liegen als Sub-Collection unter dem Thema-Dokument
        vertraegeCollection = collection(db, 'artifacts', appId, 'public', 'data', 'vertraege_themen', currentThemaId, 'vertraege');
        console.log("📂 Verträge-Collection aktualisiert:", vertraegeCollection.path);
        listenForVertraege();
    } else {
        console.warn("⚠️ updateCollectionForVertragsThema: currentThemaId oder db fehlt");
    }
}

function renderVertraegeThemenDropdown() {
    const dropdown = document.getElementById('vv-thema-dropdown');
    if (!dropdown) return;
    
    const userId = currentUser?.mode || currentUser?.displayName;
    
    // Nur aktive (nicht archivierte) Themen anzeigen
    dropdown.innerHTML = Object.values(VERTRAEGE_THEMEN)
        .filter(thema => !thema.archiviert)
        .map(thema => {
            // Prüfe ob User der Ersteller ist
            const isCreator = thema.erstellerId === userId || thema.ersteller === currentUser?.displayName;
            
            // Wenn nicht Ersteller, zeige "(eingeladen von ...)"
            let displayName = thema.name;
            if (!isCreator && thema.ersteller) {
                displayName = `${thema.name} (eingeladen von ${thema.ersteller})`;
            }
            
            return `<option value="${thema.id}" ${thema.id === currentThemaId ? 'selected' : ''}>${displayName}</option>`;
        }).join('');
}

function switchVertragsThema(themaId) {
    if (!themaId || !VERTRAEGE_THEMEN[themaId]) return;
    
    currentThemaId = themaId;
    localStorage.setItem('vv_current_thema', themaId);
    console.log(`🔄 Wechsle zu Thema: ${VERTRAEGE_THEMEN[themaId].name}`);
    
    updateCollectionForVertragsThema();
}

// Einladungen laden
function loadVertraegeEinladungen() {
    if (!vertraegeEinladungenRef || !currentUser?.displayName) return;
    
    try {
        const userId = currentUser.mode || currentUser.displayName;
        
        onSnapshot(vertraegeEinladungenRef, (snapshot) => {
            VERTRAEGE_EINLADUNGEN = {};
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                // Nur Einladungen für den aktuellen Benutzer laden
                if (data.targetUserId === userId || data.targetUserName === currentUser.displayName) {
                    VERTRAEGE_EINLADUNGEN[docSnap.id] = { id: docSnap.id, ...data };
                }
            });
            renderVertraegeEinladungenBadge();
        }, (error) => {
            console.error("Fehler beim Laden der Vertrags-Einladungen:", error);
        });
    } catch (e) {
        console.error("Fehler beim Initialisieren des Einladungs-Listeners:", e);
    }
}

function renderVertraegeEinladungenBadge() {
    const pendingCount = Object.values(VERTRAEGE_EINLADUNGEN).filter(e => e.status === 'pending').length;
    const badge = document.getElementById('vv-einladungen-badge');
    if (badge) {
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

// Einladungen Modal öffnen
function openVertraegeEinladungenModal() {
    const pendingEinladungen = Object.values(VERTRAEGE_EINLADUNGEN).filter(e => e.status === 'pending');
    
    if (pendingEinladungen.length === 0) {
        alertUser('Keine offenen Einladungen vorhanden.', 'info');
        return;
    }
    
    // Einfaches Alert-Modal mit Einladungen
    let einladungenHtml = pendingEinladungen.map(einladung => `
        <div class="bg-blue-50 p-3 rounded-lg mb-2 border border-blue-200">
            <p class="font-bold text-blue-800">${einladung.themaName || 'Unbekanntes Thema'}</p>
            <p class="text-sm text-gray-600">Von: ${einladung.fromUserName || 'Unbekannt'}</p>
            <p class="text-sm text-gray-500">Zugriffsrecht: 👁️ Nur Lesen</p>
            <div class="flex gap-2 mt-2">
                <button onclick="window.acceptVertragsEinladung('${einladung.id}')" 
                    class="flex-1 px-3 py-1 bg-green-500 text-white text-sm font-bold rounded hover:bg-green-600">
                    ✓ Annehmen
                </button>
                <button onclick="window.declineVertragsEinladung('${einladung.id}')" 
                    class="flex-1 px-3 py-1 bg-red-500 text-white text-sm font-bold rounded hover:bg-red-600">
                    ✗ Ablehnen
                </button>
            </div>
        </div>
    `).join('');
    
    // Verwende ein einfaches Modal-Overlay
    const modalHtml = `
        <div id="vvEinladungenOverlay" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
                <div class="sticky top-0 bg-gradient-to-r from-purple-600 to-indigo-500 text-white p-4 rounded-t-2xl flex justify-between items-center">
                    <h3 class="text-xl font-bold">📬 Einladungen</h3>
                    <button onclick="document.getElementById('vvEinladungenOverlay').remove()" class="text-white/80 hover:text-white transition">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div class="p-4">
                    ${einladungenHtml}
                </div>
            </div>
        </div>
    `;
    
    // Entferne vorheriges Overlay falls vorhanden
    const existingOverlay = document.getElementById('vvEinladungenOverlay');
    if (existingOverlay) existingOverlay.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Einladung annehmen
async function acceptVertragsEinladung(einladungId) {
    const einladung = VERTRAEGE_EINLADUNGEN[einladungId];
    if (!einladung) return;
    
    try {
        // Thema laden und Benutzer als Mitglied hinzufügen
        const themaDocRef = doc(vertraegeThemenRef, einladung.themaId);
        const themaSnap = await getDoc(themaDocRef);
        
        if (themaSnap.exists()) {
            const themaData = themaSnap.data();
            const mitglieder = themaData.mitglieder || [];
            
            // Benutzer hinzufügen
            mitglieder.push({
                userId: currentUser.mode || currentUser.displayName,
                name: currentUser.displayName,
                zugriffsrecht: 'lesen',
                addedAt: new Date().toISOString()
            });
            
            await updateDoc(themaDocRef, { mitglieder });
        }
        
        // Einladung als angenommen markieren
        await updateDoc(doc(vertraegeEinladungenRef, einladungId), { status: 'accepted' });
        
        // Overlay schließen
        const overlay = document.getElementById('vvEinladungenOverlay');
        if (overlay) overlay.remove();
        
        // Themen neu laden
        await loadVertraegeThemen();
        
        alertUser('Einladung angenommen! Das Thema ist jetzt verfügbar.', 'success');
    } catch (error) {
        console.error("Fehler beim Annehmen der Einladung:", error);
        alertUser('Fehler beim Annehmen der Einladung.', 'error');
    }
}

// Einladung ablehnen
async function declineVertragsEinladung(einladungId) {
    try {
        await deleteDoc(doc(vertraegeEinladungenRef, einladungId));
        
        // Overlay aktualisieren oder schließen
        const overlay = document.getElementById('vvEinladungenOverlay');
        if (overlay) overlay.remove();
        
        // Wenn noch Einladungen da sind, Modal neu öffnen
        const remainingPending = Object.values(VERTRAEGE_EINLADUNGEN).filter(e => e.status === 'pending' && e.id !== einladungId);
        if (remainingPending.length > 0) {
            openVertraegeEinladungenModal();
        }
        
        alertUser('Einladung abgelehnt.', 'info');
    } catch (error) {
        console.error("Fehler beim Ablehnen der Einladung:", error);
        alertUser('Fehler beim Ablehnen der Einladung.', 'error');
    }
}

// ========================================
// THEMEN-EINSTELLUNGEN MODAL
// ========================================
function openVertraegeSettingsModal() {
    const modal = document.getElementById('vertraegeSettingsModal');
    if (!modal) {
        console.error("vertraegeSettingsModal nicht gefunden!");
        return;
    }
    
    renderThemenListe();
    modal.style.display = 'flex';
}

function closeVertraegeSettingsModal() {
    const modal = document.getElementById('vertraegeSettingsModal');
    if (modal) modal.style.display = 'none';
}

function renderThemenListe() {
    const container = document.getElementById('vv-themen-liste');
    if (!container) return;
    
    const themen = Object.values(VERTRAEGE_THEMEN).filter(t => !t.archiviert);
    
    if (themen.length === 0) {
        container.innerHTML = '<p class="text-gray-500 italic text-center py-4">Keine Themen vorhanden.</p>';
        return;
    }
    
    container.innerHTML = themen.map(thema => {
        const isCreator = thema.ersteller === currentUser?.displayName || thema.ersteller === currentUser?.mode;
        const mitgliederCount = thema.mitglieder?.length || 1;
        
        return `
            <div class="p-3 bg-gray-50 rounded-lg border ${thema.id === currentThemaId ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-gray-800">${thema.name}</h4>
                        <p class="text-xs text-gray-500">
                            ${isCreator ? '👑 Ersteller' : '👤 Mitglied'} • ${mitgliederCount} Mitglied${mitgliederCount > 1 ? 'er' : ''}
                        </p>
                    </div>
                    <div class="flex gap-1">
                        ${isCreator ? `
                            <button onclick="window.openThemaMitgliederModal('${thema.id}')" 
                                class="p-1.5 text-blue-600 hover:bg-blue-100 rounded" title="Mitglieder verwalten">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                            </button>
                            <button onclick="window.editVertragsThema('${thema.id}')" 
                                class="p-1.5 text-gray-600 hover:bg-gray-200 rounded" title="Bearbeiten">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button onclick="window.deleteVertragsThema('${thema.id}')" 
                                class="p-1.5 text-red-600 hover:bg-red-100 rounded" title="Löschen">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function createNewVertragsThema() {
    const nameInput = document.getElementById('vv-neues-thema-name');
    const name = nameInput?.value?.trim();
    
    if (!name) {
        alertUser('Bitte gib einen Namen für das Thema ein.', 'error');
        return;
    }
    
    const userId = currentUser?.mode || currentUser?.displayName;
    const userName = currentUser?.displayName || 'Unbekannt';
    
    try {
        const newThema = {
            name: name,
            ersteller: userName,
            erstellerId: userId,
            erstelltAm: serverTimestamp(),
            mitglieder: [{
                userId: userId,
                name: userName,
                zugriffsrecht: 'vollzugriff'
            }]
        };
        
        const docRef = await addDoc(vertraegeThemenRef, newThema);
        VERTRAEGE_THEMEN[docRef.id] = { id: docRef.id, ...newThema };
        
        // Input leeren
        if (nameInput) nameInput.value = '';
        
        // Liste aktualisieren
        renderThemenListe();
        renderVertraegeThemenDropdown();
        
        alertUser(`Thema "${name}" erfolgreich erstellt!`, 'success');
    } catch (error) {
        console.error("Fehler beim Erstellen des Themas:", error);
        alertUser('Fehler beim Erstellen des Themas.', 'error');
    }
}

async function deleteVertragsThema(themaId) {
    const thema = VERTRAEGE_THEMEN[themaId];
    if (!thema) return;
    
    // Prüfen ob es das letzte Thema ist
    if (Object.keys(VERTRAEGE_THEMEN).length <= 1) {
        alertUser('Das letzte Thema kann nicht gelöscht werden.', 'error');
        return;
    }
    
    if (!confirm(`Möchtest du das Thema "${thema.name}" wirklich löschen? Alle Verträge in diesem Thema werden ebenfalls gelöscht!`)) {
        return;
    }
    
    try {
        await deleteDoc(doc(vertraegeThemenRef, themaId));
        delete VERTRAEGE_THEMEN[themaId];
        
        // Wenn das aktuelle Thema gelöscht wurde, wechsle zum ersten verfügbaren
        if (currentThemaId === themaId) {
            currentThemaId = Object.keys(VERTRAEGE_THEMEN)[0];
            localStorage.setItem('vv_current_thema', currentThemaId);
            updateCollectionForVertragsThema();
        }
        
        renderThemenListe();
        renderVertraegeThemenDropdown();
        
        alertUser('Thema erfolgreich gelöscht!', 'success');
    } catch (error) {
        console.error("Fehler beim Löschen des Themas:", error);
        alertUser('Fehler beim Löschen des Themas.', 'error');
    }
}

// Mitglieder-Modal für Thema
let currentEditingThemaId = null;

function openThemaMitgliederModal(themaId) {
    currentEditingThemaId = themaId;
    const thema = VERTRAEGE_THEMEN[themaId];
    if (!thema) return;
    
    const modal = document.getElementById('themaMitgliederModal');
    if (!modal) return;
    
    document.getElementById('mitglieder-thema-name').textContent = thema.name;
    renderMitgliederListe(thema);
    populateUserDropdown(thema);
    
    modal.style.display = 'flex';
}

function populateUserDropdown(thema) {
    const userSelect = document.getElementById('vv-mitglied-user');
    if (!userSelect) return;
    
    // Alle verfügbaren Benutzer laden (außer die, die schon Mitglied sind)
    const existingMemberIds = (thema.mitglieder || []).map(m => m.userId);
    
    let options = '<option value="">Benutzer wählen...</option>';
    
    if (USERS && Object.keys(USERS).length > 0) {
        Object.entries(USERS).forEach(([userId, user]) => {
            // Nur Benutzer anzeigen, die noch nicht Mitglied sind und nicht der aktuelle User
            if (!existingMemberIds.includes(userId) && userId !== currentUser?.mode) {
                // Verwende 'name' statt 'displayName' (so ist die USERS-Struktur aufgebaut)
                const userName = user.name || userId;
                options += `<option value="${userId}">${userName}</option>`;
            }
        });
    } else {
        options += '<option value="" disabled>Keine Benutzer verfügbar</option>';
    }
    
    userSelect.innerHTML = options;
}

function closeThemaMitgliederModal() {
    const modal = document.getElementById('themaMitgliederModal');
    if (modal) modal.style.display = 'none';
    currentEditingThemaId = null;
}

function renderMitgliederListe(thema) {
    const container = document.getElementById('vv-mitglieder-liste');
    if (!container) return;
    
    const mitglieder = thema.mitglieder || [];
    
    container.innerHTML = mitglieder.map((m, index) => {
        // Prüfe ob Mitglied der Ersteller ist (über erstellerId oder ersteller-Name)
        const isCreator = m.userId === thema.erstellerId || m.name === thema.ersteller;
        const zugriffsrecht = ZUGRIFFSRECHTE[m.zugriffsrecht] || ZUGRIFFSRECHTE.lesen;
        
        return `
            <div class="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div class="flex items-center gap-2">
                    <span class="text-lg">${isCreator ? '👑' : '👤'}</span>
                    <span class="font-medium">${m.name}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-sm px-2 py-1 bg-gray-200 rounded">${zugriffsrecht.icon} ${zugriffsrecht.label}</span>
                    ${!isCreator ? `
                        <button onclick="window.removeMitglied(${index})" class="p-1 text-red-500 hover:bg-red-100 rounded">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function addMitgliedToThema() {
    if (!currentEditingThemaId) {
        console.error("addMitgliedToThema: Keine currentEditingThemaId");
        return;
    }
    
    const userSelect = document.getElementById('vv-mitglied-user');
    const rechtSelect = document.getElementById('vv-mitglied-recht');
    
    const selectedUserId = userSelect?.value;
    const selectedRecht = rechtSelect?.value || 'lesen';
    
    if (!selectedUserId) {
        alertUser('Bitte wähle einen Benutzer aus.', 'error');
        return;
    }
    
    const selectedUser = USERS[selectedUserId];
    if (!selectedUser) {
        console.error("addMitgliedToThema: User nicht gefunden:", selectedUserId);
        alertUser('Benutzer nicht gefunden.', 'error');
        return;
    }
    
    // WICHTIG: Verwende user.name (nicht displayName!)
    const userName = selectedUser.name || selectedUserId;
    
    const thema = VERTRAEGE_THEMEN[currentEditingThemaId];
    if (!thema) {
        console.error("addMitgliedToThema: Thema nicht gefunden:", currentEditingThemaId);
        return;
    }
    
    // Prüfen ob User bereits Mitglied ist
    if (thema.mitglieder?.some(m => m.userId === selectedUserId)) {
        alertUser('Dieser Benutzer ist bereits Mitglied.', 'error');
        return;
    }
    
    // Prüfen ob bereits eine Einladung existiert
    const existingInvite = Object.values(VERTRAEGE_EINLADUNGEN).find(
        e => e.targetUserId === selectedUserId && e.themaId === currentEditingThemaId && e.status === 'pending'
    );
    if (existingInvite) {
        alertUser('Dieser Benutzer wurde bereits eingeladen.', 'error');
        return;
    }
    
    try {
        // NUR Einladung erstellen - Mitglied wird erst nach Annahme hinzugefügt!
        await addDoc(vertraegeEinladungenRef, {
            themaId: currentEditingThemaId,
            themaName: thema.name,
            targetUserId: selectedUserId,
            targetUserName: userName,
            fromUserId: currentUser?.mode || currentUser?.displayName,
            fromUserName: currentUser?.displayName,
            zugriffsrecht: selectedRecht,
            status: 'pending',
            createdAt: serverTimestamp()
        });
        
        // Dropdown zurücksetzen
        if (userSelect) userSelect.value = '';
        
        // Dropdown neu befüllen (User aus Liste entfernen)
        populateUserDropdown(thema);
        
        alertUser(`Einladung an ${userName} gesendet!`, 'success');
        console.log(`✅ Einladung gesendet an ${userName} für Thema "${thema.name}"`);
    } catch (error) {
        console.error("Fehler beim Senden der Einladung:", error);
        alertUser('Fehler beim Senden der Einladung.', 'error');
    }
}

async function removeMitglied(index) {
    // WICHTIG: index kommt als String vom HTML onclick, daher parseInt
    const indexNum = parseInt(index, 10);
    
    if (!currentEditingThemaId) {
        console.error("removeMitglied: Keine currentEditingThemaId");
        return;
    }
    
    const thema = VERTRAEGE_THEMEN[currentEditingThemaId];
    if (!thema || !thema.mitglieder) {
        console.error("removeMitglied: Thema oder Mitglieder nicht gefunden");
        return;
    }
    
    const mitglied = thema.mitglieder[indexNum];
    if (!mitglied) {
        console.error("removeMitglied: Mitglied nicht gefunden bei Index:", indexNum);
        return;
    }
    
    if (!confirm(`Möchtest du ${mitglied.name} wirklich aus dem Thema entfernen?`)) {
        return;
    }
    
    try {
        const updatedMitglieder = thema.mitglieder.filter((_, i) => i !== indexNum);
        
        await updateDoc(doc(vertraegeThemenRef, currentEditingThemaId), {
            mitglieder: updatedMitglieder
        });
        
        VERTRAEGE_THEMEN[currentEditingThemaId].mitglieder = updatedMitglieder;
        renderMitgliederListe(VERTRAEGE_THEMEN[currentEditingThemaId]);
        renderThemenListe();
        
        alertUser('Mitglied entfernt.', 'success');
    } catch (error) {
        console.error("Fehler beim Entfernen des Mitglieds:", error);
        alertUser('Fehler beim Entfernen des Mitglieds.', 'error');
    }
}

function setupEventListeners() {
    // Themen-Dropdown
    const themaDropdown = document.getElementById('vv-thema-dropdown');
    if (themaDropdown && !themaDropdown.dataset.listenerAttached) {
        themaDropdown.addEventListener('change', (e) => {
            switchVertragsThema(e.target.value);
        });
        themaDropdown.dataset.listenerAttached = 'true';
    }
    
    // Einladungen Button
    const einladungenBtn = document.getElementById('btn-vv-einladungen');
    if (einladungenBtn && !einladungenBtn.dataset.listenerAttached) {
        einladungenBtn.addEventListener('click', openVertraegeEinladungenModal);
        einladungenBtn.dataset.listenerAttached = 'true';
    }
    
    // Einstellungen Button
    const settingsBtn = document.getElementById('btn-vertraege-settings');
    if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
        settingsBtn.addEventListener('click', openVertraegeSettingsModal);
        settingsBtn.dataset.listenerAttached = 'true';
    }
    
    // Einstellungen Modal schließen
    const closeSettingsBtn = document.getElementById('closeVertraegeSettingsModal');
    if (closeSettingsBtn && !closeSettingsBtn.dataset.listenerAttached) {
        closeSettingsBtn.addEventListener('click', closeVertraegeSettingsModal);
        closeSettingsBtn.dataset.listenerAttached = 'true';
    }
    
    // Neues Thema erstellen Button
    const createThemaBtn = document.getElementById('btn-create-vertrags-thema');
    if (createThemaBtn && !createThemaBtn.dataset.listenerAttached) {
        createThemaBtn.addEventListener('click', createNewVertragsThema);
        createThemaBtn.dataset.listenerAttached = 'true';
    }
    
    // Mitglieder Modal schließen
    const closeMitgliederBtn = document.getElementById('closeThemaMitgliederModal');
    if (closeMitgliederBtn && !closeMitgliederBtn.dataset.listenerAttached) {
        closeMitgliederBtn.addEventListener('click', closeThemaMitgliederModal);
        closeMitgliederBtn.dataset.listenerAttached = 'true';
    }
    
    // Mitglied hinzufügen Button
    const addMitgliedBtn = document.getElementById('btn-add-mitglied');
    if (addMitgliedBtn && !addMitgliedBtn.dataset.listenerAttached) {
        addMitgliedBtn.addEventListener('click', addMitgliedToThema);
        addMitgliedBtn.dataset.listenerAttached = 'true';
    }
    
    // Create Button
    const createBtn = document.getElementById('btn-create-vertrag');
    if (createBtn && !createBtn.dataset.listenerAttached) {
        createBtn.addEventListener('click', openCreateModal);
        createBtn.dataset.listenerAttached = 'true';
    }

    // Modal Close Buttons
    const closeModal = document.getElementById('closeVertragModal');
    if (closeModal && !closeModal.dataset.listenerAttached) {
        closeModal.addEventListener('click', closeVertragModal);
        closeModal.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelVertragBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeVertragModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveVertragBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveVertrag);
        saveBtn.dataset.listenerAttached = 'true';
    }

    // Details Modal
    const closeDetails = document.getElementById('closeVertragDetailsModal');
    if (closeDetails && !closeDetails.dataset.listenerAttached) {
        closeDetails.addEventListener('click', () => {
            document.getElementById('vertragDetailsModal').style.display = 'none';
        });
        closeDetails.dataset.listenerAttached = 'true';
    }

    // Kündigungsabsicht Radio Buttons
    document.querySelectorAll('.kuendigungs-option').forEach(option => {
        if (!option.dataset.listenerAttached) {
            option.addEventListener('click', (e) => {
                const label = e.currentTarget;
                const value = label.dataset.value;
                
                // Alle deselektieren
                document.querySelectorAll('.kuendigungs-option').forEach(opt => {
                    opt.classList.remove('border-indigo-500', 'bg-indigo-50');
                    opt.classList.add('border-gray-200');
                    opt.querySelector('.radio-circle').innerHTML = '';
                });
                
                // Ausgewählte Option markieren
                label.classList.remove('border-gray-200');
                label.classList.add('border-indigo-500', 'bg-indigo-50');
                label.querySelector('.radio-circle').innerHTML = '<span class="w-2 h-2 bg-indigo-600 rounded-full"></span>';
                label.querySelector('input').checked = true;
            });
            option.dataset.listenerAttached = 'true';
        }
    });

    // Suche
    const searchInput = document.getElementById('search-vertraege');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderVertraegeTable();
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    // Filter
    const filterRhythmus = document.getElementById('filter-zahlungsrhythmus');
    if (filterRhythmus && !filterRhythmus.dataset.listenerAttached) {
        filterRhythmus.addEventListener('change', (e) => {
            currentFilter.rhythmus = e.target.value;
            renderVertraegeTable();
        });
        filterRhythmus.dataset.listenerAttached = 'true';
    }

    const filterAbsicht = document.getElementById('filter-kuendigungsabsicht');
    if (filterAbsicht && !filterAbsicht.dataset.listenerAttached) {
        filterAbsicht.addEventListener('change', (e) => {
            currentFilter.absicht = e.target.value;
            renderVertraegeTable();
        });
        filterAbsicht.dataset.listenerAttached = 'true';
    }

    const resetFilters = document.getElementById('reset-filters-vertraege');
    if (resetFilters && !resetFilters.dataset.listenerAttached) {
        resetFilters.addEventListener('click', () => {
            currentFilter = { rhythmus: '', absicht: '' };
            searchTerm = '';
            document.getElementById('search-vertraege').value = '';
            document.getElementById('filter-zahlungsrhythmus').value = '';
            document.getElementById('filter-kuendigungsabsicht').value = '';
            renderVertraegeTable();
        });
        resetFilters.dataset.listenerAttached = 'true';
    }

    // Navigation Card
    const vertragsverwaltungCard = document.getElementById('vertragsverwaltungCard');
    if (vertragsverwaltungCard && !vertragsverwaltungCard.dataset.listenerAttached) {
        vertragsverwaltungCard.addEventListener('click', () => navigate('vertragsverwaltung'));
        vertragsverwaltungCard.dataset.listenerAttached = 'true';
    }

    // Sonderzahlung hinzufügen Button
    const addSonderzahlungBtn = document.getElementById('btn-add-sonderzahlung');
    if (addSonderzahlungBtn && !addSonderzahlungBtn.dataset.listenerAttached) {
        addSonderzahlungBtn.addEventListener('click', addSonderzahlung);
        addSonderzahlungBtn.dataset.listenerAttached = 'true';
    }
}

// ========================================
// FIREBASE LISTENER
// ========================================
export function listenForVertraege() {
    if (!vertraegeCollection) {
        if (db) {
            vertraegeCollection = collection(db, 'artifacts', appId, 'public', 'data', 'vertraege');
        } else {
            console.warn("DB nicht verfügbar für Verträge");
            return;
        }
    }

    if (unsubscribeVertraege) {
        unsubscribeVertraege();
    }

    // DATENSCHUTZ-FIX: Nur Verträge laden, die vom aktuellen User erstellt wurden
    const q = query(vertraegeCollection, orderBy('createdAt', 'desc'));
    
    unsubscribeVertraege = onSnapshot(q, (snapshot) => {
        VERTRAEGE = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // DATENSCHUTZ: Nur eigene Verträge speichern
            // (erstellt von mir)
            if (data.createdBy === currentUser?.displayName || data.createdBy === currentUser?.mode) {
                VERTRAEGE[doc.id] = { id: doc.id, ...data };
            }
        });
        console.log(`📋 ${Object.keys(VERTRAEGE).length} Verträge geladen (nur eigene)`);
        renderVertraegeTable();
        updateStatistics();
        renderKuendigungsWarnungen();
    }, (error) => {
        console.error("Fehler beim Laden der Verträge:", error);
    });
}

// ========================================
// MODAL FUNKTIONEN
// ========================================
function openCreateModal() {
    document.getElementById('vertragModalTitle').textContent = 'Neuer Vertrag';
    document.getElementById('vertragId').value = '';
    
    // Formular zurücksetzen
    document.getElementById('vertragName').value = '';
    document.getElementById('vertragAnbieter').value = '';
    document.getElementById('vertragBetrag').value = '';
    document.getElementById('vertragRhythmus').value = 'monatlich';
    document.getElementById('vertragBeginn').value = '';
    document.getElementById('vertragLaufzeit').value = '';
    document.getElementById('vertragKuendigungsfrist').value = '';
    document.getElementById('vertragKuendigungsfristEinheit').value = 'monate';
    document.getElementById('vertragKuendigungsdatum').value = '';
    document.getElementById('vertragErinnerungTage').value = '30';
    document.getElementById('vertragNotizen').value = '';
    
    // Sonderzahlungen zurücksetzen
    tempSonderzahlungen = [];
    renderSonderzahlungen();
    
    // Kündigungsabsicht zurücksetzen
    document.querySelectorAll('.kuendigungs-option').forEach(opt => {
        opt.classList.remove('border-indigo-500', 'bg-indigo-50');
        opt.classList.add('border-gray-200');
        opt.querySelector('.radio-circle').innerHTML = '';
        opt.querySelector('input').checked = false;
    });
    
    // Standard: Behalten
    const behaltenOption = document.querySelector('.kuendigungs-option[data-value="behalten"]');
    if (behaltenOption) {
        behaltenOption.classList.remove('border-gray-200');
        behaltenOption.classList.add('border-indigo-500', 'bg-indigo-50');
        behaltenOption.querySelector('.radio-circle').innerHTML = '<span class="w-2 h-2 bg-indigo-600 rounded-full"></span>';
        behaltenOption.querySelector('input').checked = true;
    }
    
    document.getElementById('vertragModal').style.display = 'flex';
}

function openEditModal(vertragId) {
    const vertrag = VERTRAEGE[vertragId];
    if (!vertrag) return;
    
    document.getElementById('vertragModalTitle').textContent = 'Vertrag bearbeiten';
    document.getElementById('vertragId').value = vertragId;
    
    document.getElementById('vertragName').value = vertrag.name || '';
    document.getElementById('vertragAnbieter').value = vertrag.anbieter || '';
    document.getElementById('vertragBetrag').value = vertrag.betrag || '';
    document.getElementById('vertragRhythmus').value = vertrag.rhythmus || 'monatlich';
    document.getElementById('vertragBeginn').value = vertrag.beginn || '';
    document.getElementById('vertragLaufzeit').value = vertrag.laufzeit || '';
    document.getElementById('vertragKuendigungsfrist').value = vertrag.kuendigungsfrist || '';
    document.getElementById('vertragKuendigungsfristEinheit').value = vertrag.kuendigungsfristEinheit || 'monate';
    document.getElementById('vertragKuendigungsdatum').value = vertrag.kuendigungsdatum || '';
    document.getElementById('vertragErinnerungTage').value = vertrag.erinnerungTage || '30';
    document.getElementById('vertragNotizen').value = vertrag.notizen || '';
    
    // Sonderzahlungen laden
    tempSonderzahlungen = vertrag.sonderzahlungen ? [...vertrag.sonderzahlungen] : [];
    renderSonderzahlungen();
    
    // Kündigungsabsicht setzen
    document.querySelectorAll('.kuendigungs-option').forEach(opt => {
        opt.classList.remove('border-indigo-500', 'bg-indigo-50');
        opt.classList.add('border-gray-200');
        opt.querySelector('.radio-circle').innerHTML = '';
        opt.querySelector('input').checked = false;
    });
    
    const absicht = vertrag.kuendigungsabsicht || 'behalten';
    const selectedOption = document.querySelector(`.kuendigungs-option[data-value="${absicht}"]`);
    if (selectedOption) {
        selectedOption.classList.remove('border-gray-200');
        selectedOption.classList.add('border-indigo-500', 'bg-indigo-50');
        selectedOption.querySelector('.radio-circle').innerHTML = '<span class="w-2 h-2 bg-indigo-600 rounded-full"></span>';
        selectedOption.querySelector('input').checked = true;
    }
    
    document.getElementById('vertragModal').style.display = 'flex';
}

function closeVertragModal() {
    document.getElementById('vertragModal').style.display = 'none';
}

// ========================================
// SPEICHERN / LÖSCHEN
// ========================================
async function saveVertrag() {
    const vertragId = document.getElementById('vertragId').value;
    const name = document.getElementById('vertragName').value.trim();
    const betrag = parseFloat(document.getElementById('vertragBetrag').value);
    
    if (!name) {
        alertUser('Bitte gib einen Vertragsnamen ein.', 'error');
        return;
    }
    
    if (isNaN(betrag) || betrag < 0) {
        alertUser('Bitte gib einen gültigen Betrag ein.', 'error');
        return;
    }
    
    // Kündigungsabsicht ermitteln
    const selectedAbsicht = document.querySelector('input[name="kuendigungsabsicht"]:checked');
    const kuendigungsabsicht = selectedAbsicht ? selectedAbsicht.value : 'behalten';
    
    const vertragData = {
        name: name,
        anbieter: document.getElementById('vertragAnbieter').value.trim(),
        betrag: betrag,
        rhythmus: document.getElementById('vertragRhythmus').value,
        sonderzahlungen: tempSonderzahlungen,
        beginn: document.getElementById('vertragBeginn').value,
        laufzeit: parseInt(document.getElementById('vertragLaufzeit').value) || 0,
        kuendigungsfrist: parseInt(document.getElementById('vertragKuendigungsfrist').value) || 0,
        kuendigungsfristEinheit: document.getElementById('vertragKuendigungsfristEinheit').value,
        kuendigungsdatum: document.getElementById('vertragKuendigungsdatum').value,
        kuendigungsabsicht: kuendigungsabsicht,
        erinnerungTage: parseInt(document.getElementById('vertragErinnerungTage').value) || 30,
        notizen: document.getElementById('vertragNotizen').value.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.displayName || 'Unbekannt'
    };
    
    try {
        if (vertragId) {
            // Update
            await updateDoc(doc(vertraegeCollection, vertragId), vertragData);
            alertUser('Vertrag erfolgreich aktualisiert!', 'success');
        } else {
            // Create
            vertragData.createdAt = serverTimestamp();
            vertragData.createdBy = currentUser?.displayName || 'Unbekannt';
            await addDoc(vertraegeCollection, vertragData);
            alertUser('Vertrag erfolgreich erstellt!', 'success');
        }
        closeVertragModal();
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        alertUser('Fehler beim Speichern des Vertrags.', 'error');
    }
}

async function deleteVertrag(vertragId) {
    const vertrag = VERTRAEGE[vertragId];
    if (!vertrag) return;
    
    if (!confirm(`Möchtest du den Vertrag "${vertrag.name}" wirklich löschen?`)) {
        return;
    }
    
    try {
        await deleteDoc(doc(vertraegeCollection, vertragId));
        alertUser('Vertrag erfolgreich gelöscht!', 'success');
    } catch (error) {
        console.error("Fehler beim Löschen:", error);
        alertUser('Fehler beim Löschen des Vertrags.', 'error');
    }
}

// ========================================
// RENDER FUNKTIONEN
// ========================================
function renderVertraegeTable() {
    const tbody = document.getElementById('vertraege-table-body');
    if (!tbody) return;
    
    let vertraege = Object.values(VERTRAEGE);
    
    // Filter anwenden
    if (currentFilter.rhythmus) {
        vertraege = vertraege.filter(v => v.rhythmus === currentFilter.rhythmus);
    }
    if (currentFilter.absicht) {
        vertraege = vertraege.filter(v => v.kuendigungsabsicht === currentFilter.absicht);
    }
    
    // Suche anwenden
    if (searchTerm) {
        vertraege = vertraege.filter(v => 
            (v.name || '').toLowerCase().includes(searchTerm) ||
            (v.anbieter || '').toLowerCase().includes(searchTerm)
        );
    }
    
    // Nach Priorität und dann nach Name sortieren
    vertraege.sort((a, b) => {
        const prioA = ABSICHT_CONFIG[a.kuendigungsabsicht]?.priority || 0;
        const prioB = ABSICHT_CONFIG[b.kuendigungsabsicht]?.priority || 0;
        if (prioB !== prioA) return prioB - prioA;
        return (a.name || '').localeCompare(b.name || '');
    });
    
    if (vertraege.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-4 py-8 text-center text-gray-400 italic">
                    ${searchTerm || currentFilter.rhythmus || currentFilter.absicht 
                        ? 'Keine Verträge gefunden.' 
                        : 'Keine Verträge vorhanden. Erstelle deinen ersten Vertrag!'}
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = vertraege.map(vertrag => {
        const rhythmusConfig = RHYTHMUS_CONFIG[vertrag.rhythmus] || RHYTHMUS_CONFIG.monatlich;
        const absichtConfig = ABSICHT_CONFIG[vertrag.kuendigungsabsicht] || ABSICHT_CONFIG.behalten;
        
        // Kündigungsfrist berechnen
        let kuendigungsfristText = '-';
        if (vertrag.kuendigungsfrist) {
            const einheit = vertrag.kuendigungsfristEinheit === 'tage' ? 'Tage' : 
                           vertrag.kuendigungsfristEinheit === 'wochen' ? 'Wochen' : 'Monate';
            kuendigungsfristText = `${vertrag.kuendigungsfrist} ${einheit}`;
        }
        
        // Warnung wenn Kündigung bald fällig
        let kuendigungsWarnung = '';
        if (vertrag.kuendigungsdatum && vertrag.kuendigungsabsicht !== 'behalten') {
            const kuendigungsDatum = new Date(vertrag.kuendigungsdatum);
            const heute = new Date();
            const diffTage = Math.ceil((kuendigungsDatum - heute) / (1000 * 60 * 60 * 24));
            const erinnerungTage = vertrag.erinnerungTage || 30;
            
            if (diffTage <= 0) {
                kuendigungsWarnung = '<span class="ml-2 text-red-600 font-bold animate-pulse">⚠️ ÜBERFÄLLIG!</span>';
            } else if (diffTage <= erinnerungTage) {
                kuendigungsWarnung = `<span class="ml-2 text-orange-600 font-semibold">⏰ ${diffTage} Tage</span>`;
            }
        }
        
        return `
            <tr class="hover:bg-gray-50 transition cursor-pointer" onclick="window.showVertragDetails('${vertrag.id}')">
                <td class="px-4 py-3">
                    <div class="font-semibold text-gray-900">${vertrag.name || '-'}</div>
                </td>
                <td class="px-4 py-3 text-gray-600">${vertrag.anbieter || '-'}</td>
                <td class="px-4 py-3">
                    <span class="font-bold text-gray-900">${formatCurrency(vertrag.betrag)}</span>
                    ${vertrag.zusatzbetrag ? `<span class="text-xs text-yellow-600 block">+${formatCurrency(vertrag.zusatzbetrag)}/Jahr</span>` : ''}
                </td>
                <td class="px-4 py-3">
                    <span class="text-sm">${rhythmusConfig.icon} ${rhythmusConfig.label}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-sm">${kuendigungsfristText}</span>
                    ${kuendigungsWarnung}
                </td>
                <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${absichtConfig.color}">
                        ${absichtConfig.icon} ${absichtConfig.label}
                    </span>
                </td>
                <td class="px-4 py-3 text-center" onclick="event.stopPropagation()">
                    <div class="flex justify-center gap-2">
                        <button onclick="window.editVertrag('${vertrag.id}')" 
                            class="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Bearbeiten">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button onclick="window.deleteVertrag('${vertrag.id}')" 
                            class="p-2 text-red-600 hover:bg-red-100 rounded-lg transition" title="Löschen">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function showVertragDetails(vertragId) {
    const vertrag = VERTRAEGE[vertragId];
    if (!vertrag) return;
    
    const rhythmusConfig = RHYTHMUS_CONFIG[vertrag.rhythmus] || RHYTHMUS_CONFIG.monatlich;
    const absichtConfig = ABSICHT_CONFIG[vertrag.kuendigungsabsicht] || ABSICHT_CONFIG.behalten;
    
    // Monatliche Kosten berechnen
    const monatlicheKosten = vertrag.betrag * rhythmusConfig.multiplierToMonthly;
    
    // Jährliche Kosten inkl. Sonderzahlungen
    let jaehrlicheKosten = monatlicheKosten * 12;
    let sonderzahlungenHtml = '';
    
    if (vertrag.sonderzahlungen && Array.isArray(vertrag.sonderzahlungen) && vertrag.sonderzahlungen.length > 0) {
        vertrag.sonderzahlungen.forEach(sz => {
            const betrag = sz.betrag || 0;
            const anzahlMonate = sz.monate ? sz.monate.length : 0;
            const monateText = sz.monate ? sz.monate.map(m => MONATSNAMEN[m].substring(0, 3)).join(', ') : '-';
            
            if (sz.typ === 'zusatzbetrag') {
                jaehrlicheKosten += betrag * anzahlMonate;
                sonderzahlungenHtml += `
                    <div class="flex justify-between items-center py-1 text-sm">
                        <span class="text-yellow-700">💸 ${sz.bezeichnung || 'Zusatzbetrag'} (${monateText})</span>
                        <span class="font-bold text-yellow-700">+${formatCurrency(betrag * anzahlMonate)}</span>
                    </div>
                `;
            } else if (sz.typ === 'gutschrift') {
                jaehrlicheKosten -= betrag * anzahlMonate;
                sonderzahlungenHtml += `
                    <div class="flex justify-between items-center py-1 text-sm">
                        <span class="text-green-700">💰 ${sz.bezeichnung || 'Gutschrift'} (${monateText})</span>
                        <span class="font-bold text-green-700">-${formatCurrency(betrag * anzahlMonate)}</span>
                    </div>
                `;
            }
        });
    }
    
    document.getElementById('vertragDetailsTitle').textContent = vertrag.name;
    document.getElementById('vertragDetailsContent').innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-xs text-gray-500 font-semibold">Anbieter</p>
                    <p class="text-lg font-bold">${vertrag.anbieter || '-'}</p>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg">
                    <p class="text-xs text-gray-500 font-semibold">Zahlungsrhythmus</p>
                    <p class="text-lg font-bold">${rhythmusConfig.icon} ${rhythmusConfig.label}</p>
                </div>
            </div>
            
            <div class="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                <p class="text-sm font-bold text-indigo-800 mb-2">💰 Kosten</p>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <p class="text-xs text-gray-600">Regelmäßig (${rhythmusConfig.label})</p>
                        <p class="text-xl font-bold text-indigo-700">${formatCurrency(vertrag.betrag)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-600">Monatlich umgerechnet</p>
                        <p class="text-xl font-bold text-indigo-700">${formatCurrency(monatlicheKosten)}</p>
                    </div>
                </div>
                ${sonderzahlungenHtml ? `
                    <div class="mt-3 pt-3 border-t border-indigo-200">
                        <p class="text-xs text-gray-600 mb-2 font-semibold">Sonderzahlungen pro Jahr:</p>
                        ${sonderzahlungenHtml}
                    </div>
                ` : ''}
                <div class="mt-3 pt-3 border-t border-indigo-200">
                    <p class="text-xs text-gray-600">Jährliche Gesamtkosten</p>
                    <p class="text-2xl font-bold text-indigo-900">${formatCurrency(jaehrlicheKosten)}</p>
                </div>
            </div>
            
            <div class="bg-gray-50 p-4 rounded-lg">
                <p class="text-sm font-bold text-gray-800 mb-2">📅 Vertragsdaten</p>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="text-gray-500">Beginn:</span> ${vertrag.beginn ? formatDate(vertrag.beginn) : '-'}</div>
                    <div><span class="text-gray-500">Laufzeit:</span> ${vertrag.laufzeit ? `${vertrag.laufzeit} Monate` : '-'}</div>
                </div>
            </div>
            
            <div class="bg-red-50 p-4 rounded-lg border border-red-200">
                <p class="text-sm font-bold text-red-800 mb-2">⚠️ Kündigung</p>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="text-gray-600">Frist:</span> ${vertrag.kuendigungsfrist ? `${vertrag.kuendigungsfrist} ${vertrag.kuendigungsfristEinheit === 'tage' ? 'Tage' : vertrag.kuendigungsfristEinheit === 'wochen' ? 'Wochen' : 'Monate'}` : '-'}</div>
                    <div><span class="text-gray-600">Nächster Termin:</span> ${vertrag.kuendigungsdatum ? formatDate(vertrag.kuendigungsdatum) : '-'}</div>
                </div>
                <div class="mt-3">
                    <span class="px-3 py-1 rounded-full text-sm font-bold ${absichtConfig.color}">
                        ${absichtConfig.icon} ${absichtConfig.label}
                    </span>
                </div>
            </div>
            
            ${vertrag.notizen ? `
                <div class="bg-gray-50 p-4 rounded-lg">
                    <p class="text-sm font-bold text-gray-800 mb-2">📝 Notizen</p>
                    <p class="text-sm text-gray-700 whitespace-pre-wrap">${vertrag.notizen}</p>
                </div>
            ` : ''}
            
            <div class="flex gap-3 pt-4">
                <button onclick="window.editVertrag('${vertragId}'); document.getElementById('vertragDetailsModal').style.display='none';" 
                    class="flex-1 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition">
                    Bearbeiten
                </button>
                <button onclick="window.deleteVertrag('${vertragId}'); document.getElementById('vertragDetailsModal').style.display='none';" 
                    class="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition">
                    Löschen
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('vertragDetailsModal').style.display = 'flex';
}

// ========================================
// STATISTIKEN
// ========================================
function updateStatistics() {
    const vertraege = Object.values(VERTRAEGE);
    
    // Aktive Verträge
    document.getElementById('stat-vertraege-aktiv').textContent = vertraege.length;
    
    // Monatliche Kosten berechnen
    let monatlicheKosten = 0;
    vertraege.forEach(v => {
        const config = RHYTHMUS_CONFIG[v.rhythmus] || RHYTHMUS_CONFIG.monatlich;
        monatlicheKosten += (v.betrag || 0) * config.multiplierToMonthly;
    });
    document.getElementById('stat-monatliche-kosten').textContent = formatCurrency(monatlicheKosten);
    
    // Jährliche Kosten (inkl. Sonderzahlungen)
    let jaehrlicheKosten = monatlicheKosten * 12;
    vertraege.forEach(v => {
        // Sonderzahlungen berücksichtigen
        if (v.sonderzahlungen && Array.isArray(v.sonderzahlungen)) {
            v.sonderzahlungen.forEach(sz => {
                const betrag = sz.betrag || 0;
                const anzahlMonate = sz.monate ? sz.monate.length : 0;
                if (sz.typ === 'zusatzbetrag') {
                    jaehrlicheKosten += betrag * anzahlMonate;
                } else if (sz.typ === 'gutschrift') {
                    jaehrlicheKosten -= betrag * anzahlMonate;
                }
            });
        }
    });
    document.getElementById('stat-jaehrliche-kosten').textContent = formatCurrency(jaehrlicheKosten);
    
    // Kündigungen bald fällig
    const heute = new Date();
    let kuendigungenBald = 0;
    vertraege.forEach(v => {
        if (v.kuendigungsdatum && v.kuendigungsabsicht !== 'behalten') {
            const datum = new Date(v.kuendigungsdatum);
            const diffTage = Math.ceil((datum - heute) / (1000 * 60 * 60 * 24));
            const erinnerungTage = v.erinnerungTage || 30;
            if (diffTage <= erinnerungTage) {
                kuendigungenBald++;
            }
        }
    });
    document.getElementById('stat-kuendigungen-bald').textContent = kuendigungenBald;
}

function renderKuendigungsWarnungen() {
    const container = document.getElementById('kuendigungs-warnungen');
    if (!container) return;
    
    const heute = new Date();
    const warnungen = [];
    
    Object.values(VERTRAEGE).forEach(v => {
        if (v.kuendigungsdatum && v.kuendigungsabsicht !== 'behalten') {
            const datum = new Date(v.kuendigungsdatum);
            const diffTage = Math.ceil((datum - heute) / (1000 * 60 * 60 * 24));
            const erinnerungTage = v.erinnerungTage || 30;
            
            if (diffTage <= erinnerungTage) {
                warnungen.push({
                    ...v,
                    diffTage: diffTage
                });
            }
        }
    });
    
    if (warnungen.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    // Nach Dringlichkeit sortieren
    warnungen.sort((a, b) => a.diffTage - b.diffTage);
    
    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <h3 class="font-bold text-red-800 mb-3">🔔 Kündigungserinnerungen</h3>
            <div class="space-y-2">
                ${warnungen.map(w => {
                    const absichtConfig = ABSICHT_CONFIG[w.kuendigungsabsicht] || ABSICHT_CONFIG.kuendigen;
                    let statusClass = 'text-orange-600';
                    let statusText = `⏰ Noch ${w.diffTage} Tage`;
                    
                    if (w.diffTage <= 0) {
                        statusClass = 'text-red-600 font-bold animate-pulse';
                        statusText = '⚠️ ÜBERFÄLLIG!';
                    } else if (w.diffTage <= 7) {
                        statusClass = 'text-red-600 font-bold';
                        statusText = `🚨 Nur noch ${w.diffTage} Tage!`;
                    }
                    
                    return `
                        <div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm cursor-pointer hover:bg-gray-50"
                            onclick="window.showVertragDetails('${w.id}')">
                            <div>
                                <span class="font-semibold">${w.name}</span>
                                <span class="text-sm text-gray-500 ml-2">${w.anbieter || ''}</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="px-2 py-1 rounded-full text-xs font-bold ${absichtConfig.color}">
                                    ${absichtConfig.icon}
                                </span>
                                <span class="${statusClass}">${statusText}</span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// ========================================
// HILFSFUNKTIONEN
// ========================================
function formatCurrency(value) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getMonthName(month) {
    return MONATSNAMEN[parseInt(month)] || '-';
}

// ========================================
// SONDERZAHLUNGEN FUNKTIONEN
// ========================================
function addSonderzahlung() {
    const newId = Date.now();
    tempSonderzahlungen.push({
        id: newId,
        typ: 'zusatzbetrag', // 'zusatzbetrag' oder 'gutschrift'
        bezeichnung: '',
        betrag: 0,
        monate: [] // Array von Monatsnummern (1-12)
    });
    renderSonderzahlungen();
}

function removeSonderzahlung(id) {
    tempSonderzahlungen = tempSonderzahlungen.filter(sz => sz.id !== id);
    renderSonderzahlungen();
}

function updateSonderzahlung(id, field, value) {
    const sz = tempSonderzahlungen.find(s => s.id === id);
    if (sz) {
        if (field === 'betrag') {
            sz[field] = parseFloat(value) || 0;
        } else {
            sz[field] = value;
        }
    }
}

function toggleSonderzahlungMonat(id, monat) {
    const sz = tempSonderzahlungen.find(s => s.id === id);
    if (sz) {
        const monatNum = parseInt(monat);
        const index = sz.monate.indexOf(monatNum);
        if (index > -1) {
            sz.monate.splice(index, 1);
        } else {
            sz.monate.push(monatNum);
            sz.monate.sort((a, b) => a - b);
        }
        renderSonderzahlungen();
    }
}

function renderSonderzahlungen() {
    const container = document.getElementById('sonderzahlungen-container');
    const emptyState = document.getElementById('sonderzahlungen-empty');
    
    if (!container) return;
    
    if (tempSonderzahlungen.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    container.innerHTML = tempSonderzahlungen.map((sz, index) => {
        const isZusatzbetrag = sz.typ === 'zusatzbetrag';
        const bgColor = isZusatzbetrag ? 'bg-yellow-100 border-yellow-300' : 'bg-green-100 border-green-300';
        const iconColor = isZusatzbetrag ? 'text-yellow-700' : 'text-green-700';
        const icon = isZusatzbetrag ? '💸' : '💰';
        
        // Monats-Checkboxen generieren
        const monateHtml = MONATSNAMEN.slice(1).map((name, i) => {
            const monatNum = i + 1;
            const isChecked = sz.monate.includes(monatNum);
            const shortName = name.substring(0, 3);
            return `
                <label class="flex items-center gap-1 cursor-pointer p-1 rounded ${isChecked ? 'bg-indigo-100' : 'hover:bg-gray-100'}">
                    <input type="checkbox" 
                        ${isChecked ? 'checked' : ''} 
                        onchange="window.toggleSonderzahlungMonat(${sz.id}, ${monatNum})"
                        class="w-3 h-3">
                    <span class="text-xs">${shortName}</span>
                </label>
            `;
        }).join('');
        
        return `
            <div class="p-3 rounded-lg border-2 ${bgColor}" data-sz-id="${sz.id}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${icon}</span>
                        <select 
                            onchange="window.updateSonderzahlung(${sz.id}, 'typ', this.value); window.renderSonderzahlungenRefresh();"
                            class="text-sm font-bold border rounded px-2 py-1 ${iconColor} bg-white">
                            <option value="zusatzbetrag" ${isZusatzbetrag ? 'selected' : ''}>Zusatzbetrag</option>
                            <option value="gutschrift" ${!isZusatzbetrag ? 'selected' : ''}>Gutschrift</option>
                        </select>
                    </div>
                    <button type="button" 
                        onclick="window.removeSonderzahlung(${sz.id})"
                        class="text-red-500 hover:text-red-700 p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                
                <div class="grid grid-cols-2 gap-2 mb-2">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">Bezeichnung</label>
                        <input type="text" 
                            value="${sz.bezeichnung || ''}"
                            onchange="window.updateSonderzahlung(${sz.id}, 'bezeichnung', this.value)"
                            placeholder="z.B. Servicepauschale"
                            class="w-full p-2 text-sm border rounded focus:border-indigo-500">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">Betrag (€)</label>
                        <input type="number" 
                            value="${sz.betrag || ''}"
                            onchange="window.updateSonderzahlung(${sz.id}, 'betrag', this.value)"
                            step="0.01" min="0" placeholder="0.00"
                            class="w-full p-2 text-sm border rounded focus:border-indigo-500">
                    </div>
                </div>
                
                <div>
                    <label class="block text-xs font-semibold text-gray-600 mb-1">Fällig in Monat(en):</label>
                    <div class="flex flex-wrap gap-1">
                        ${monateHtml}
                    </div>
                    ${sz.monate.length === 0 ? '<p class="text-xs text-red-500 mt-1">⚠️ Bitte mindestens einen Monat auswählen</p>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ========================================
// GLOBALE FUNKTIONEN FÜR HTML ONCLICK
// ========================================
window.editVertrag = openEditModal;
window.deleteVertrag = deleteVertrag;
window.showVertragDetails = showVertragDetails;
window.removeSonderzahlung = removeSonderzahlung;
window.updateSonderzahlung = updateSonderzahlung;
window.toggleSonderzahlungMonat = toggleSonderzahlungMonat;
window.renderSonderzahlungenRefresh = renderSonderzahlungen;

// Themen-Funktionen
window.openThemaMitgliederModal = openThemaMitgliederModal;
window.editVertragsThema = function(themaId) {
    // Einfaches Umbenennen per Prompt
    const thema = VERTRAEGE_THEMEN[themaId];
    if (!thema) return;
    
    const newName = prompt('Neuer Name für das Thema:', thema.name);
    if (newName && newName.trim() && newName !== thema.name) {
        updateDoc(doc(vertraegeThemenRef, themaId), { name: newName.trim() })
            .then(() => {
                VERTRAEGE_THEMEN[themaId].name = newName.trim();
                renderThemenListe();
                renderVertraegeThemenDropdown();
                alertUser('Thema umbenannt!', 'success');
            })
            .catch(err => {
                console.error("Fehler beim Umbenennen:", err);
                alertUser('Fehler beim Umbenennen.', 'error');
            });
    }
};
window.deleteVertragsThema = deleteVertragsThema;
window.removeMitglied = removeMitglied;
window.openVertraegeSettingsModal = openVertraegeSettingsModal;

// Einladungen-Funktionen
window.acceptVertragsEinladung = acceptVertragsEinladung;
window.declineVertragsEinladung = declineVertragsEinladung;

// ========================================
// HINWEIS: Initialisierung erfolgt durch haupteingang.js
// ========================================
