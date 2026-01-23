// ========================================
// SENDUNGSVERWALTUNG SYSTEM
// ========================================

import {
    alertUser,
    db,
    currentUser,
    navigate,
    appId
} from './haupteingang.js';
import { saveUserSetting, getUserSetting } from './log-InOut.js';
import { createPendingNotification, renderPendingNotifications } from './pushmail-notifications.js';

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
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let sendungenCollectionRef = null;
let SENDUNGEN = {};
let currentFilter = { typ: '', status: '', prioritaet: '', zeitraum: 'alle' };
let searchTerm = '';
let unsubscribeSendungen = null;
let currentEditingSendungId = null;

const STATUS_CONFIG = {
    erwartet: { label: 'Erwartet', icon: '⏳', color: 'bg-blue-100 text-blue-800' },
    unterwegs: { label: 'Unterwegs', icon: '🚚', color: 'bg-yellow-100 text-yellow-800' },
    zugestellt: { label: 'Zugestellt', icon: '✅', color: 'bg-green-100 text-green-800' },
    problem: { label: 'Problem', icon: '⚠️', color: 'bg-red-100 text-red-800' },
    storniert: { label: 'Storniert', icon: '❌', color: 'bg-gray-100 text-gray-800' }
};

const TYP_CONFIG = {
    empfang: { label: 'Empfang', icon: '📥', color: 'text-blue-600' },
    versand: { label: 'Versand', icon: '📤', color: 'text-orange-600' },
    ruecksendung: { label: 'Rücksendung', icon: '🔄', color: 'text-purple-600' }
};

const PRIORITAET_CONFIG = {
    normal: { label: 'Normal', icon: '', badge: '' },
    hoch: { label: 'Hoch', icon: '⚡', badge: 'bg-orange-100 text-orange-800' },
    dringend: { label: 'Dringend', icon: '🚨', badge: 'bg-red-100 text-red-800' }
};

export function initializeSendungsverwaltungView() {
    if (!currentUser || !currentUser.mode) {
        console.log('[Sendungsverwaltung] User nicht geladen');
        return;
    }

    const rootPath = `/artifacts/${appId}/public/data`;
    sendungenCollectionRef = collection(db, `${rootPath}/sendungen`);

    setupEventListeners();
    applyFiltersAndRender();
}

function setupEventListeners() {
    const openSendungModalBtn = document.getElementById('openSendungModalBtn');
    const closeSendungModal = document.getElementById('closeSendungModal');
    const cancelSendungBtn = document.getElementById('cancelSendungBtn');
    const saveSendungBtn = document.getElementById('saveSendungBtn');
    const deleteSendungBtn = document.getElementById('deleteSendungBtn');
    const sendungSearchInput = document.getElementById('sendungSearchInput');
    const sendungResetFiltersBtn = document.getElementById('sendungResetFiltersBtn');
    const sendungTyp = document.getElementById('sendungTyp');
    const sendungErinnerungenAktiv = document.getElementById('sendungErinnerungenAktiv');

    if (openSendungModalBtn) {
        openSendungModalBtn.onclick = () => openSendungModal();
    }

    if (closeSendungModal) {
        closeSendungModal.onclick = () => closeSendungModalUI();
    }

    if (cancelSendungBtn) {
        cancelSendungBtn.onclick = () => closeSendungModalUI();
    }

    if (saveSendungBtn) {
        saveSendungBtn.onclick = () => saveSendung();
    }

    if (deleteSendungBtn) {
        deleteSendungBtn.onclick = () => deleteSendung();
    }

    if (sendungSearchInput) {
        sendungSearchInput.oninput = (e) => {
            searchTerm = e.target.value.toLowerCase().trim();
            applyFiltersAndRender();
        };
    }

    if (sendungResetFiltersBtn) {
        sendungResetFiltersBtn.onclick = () => resetFilters();
    }

    if (sendungTyp) {
        sendungTyp.onchange = (e) => {
            const ruecksendungSection = document.getElementById('ruecksendungSection');
            if (ruecksendungSection) {
                ruecksendungSection.style.display = e.target.value === 'ruecksendung' ? 'block' : 'none';
            }
        };
    }

    if (sendungErinnerungenAktiv) {
        sendungErinnerungenAktiv.onchange = (e) => {
            const tageVorherSelect = document.getElementById('sendungErinnerungTageVorher');
            if (tageVorherSelect) {
                tageVorherSelect.disabled = !e.target.checked;
            }
        };
    }

    const filterSelects = ['sendungTypFilter', 'sendungStatusFilter', 'sendungPrioritaetFilter', 'sendungZeitraumFilter'];
    filterSelects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.onchange = () => {
                updateFiltersFromUI();
                applyFiltersAndRender();
            };
        }
    });
}

function updateFiltersFromUI() {
    const typFilter = document.getElementById('sendungTypFilter');
    const statusFilter = document.getElementById('sendungStatusFilter');
    const prioritaetFilter = document.getElementById('sendungPrioritaetFilter');
    const zeitraumFilter = document.getElementById('sendungZeitraumFilter');

    currentFilter = {
        typ: typFilter?.value || '',
        status: statusFilter?.value || '',
        prioritaet: prioritaetFilter?.value || '',
        zeitraum: zeitraumFilter?.value || 'alle'
    };
}

function resetFilters() {
    currentFilter = { typ: '', status: '', prioritaet: '', zeitraum: 'alle' };
    searchTerm = '';

    const searchInput = document.getElementById('sendungSearchInput');
    if (searchInput) searchInput.value = '';

    const selects = {
        sendungTypFilter: '',
        sendungStatusFilter: '',
        sendungPrioritaetFilter: '',
        sendungZeitraumFilter: 'alle'
    };

    Object.entries(selects).forEach(([id, value]) => {
        const elem = document.getElementById(id);
        if (elem) elem.value = value;
    });

    applyFiltersAndRender();
}

function openSendungModal(sendungId = null) {
    currentEditingSendungId = sendungId;
    const modal = document.getElementById('sendungModal');
    const modalTitle = document.getElementById('sendungModalTitle');
    const deleteSendungBtn = document.getElementById('deleteSendungBtn');

    if (!modal) return;

    if (sendungId && SENDUNGEN[sendungId]) {
        modalTitle.textContent = '📦 Sendung bearbeiten';
        deleteSendungBtn.style.display = 'inline-block';
        fillModalWithSendungData(SENDUNGEN[sendungId]);
    } else {
        modalTitle.textContent = '📦 Neue Sendung';
        deleteSendungBtn.style.display = 'none';
        clearModalFields();
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeSendungModalUI() {
    const modal = document.getElementById('sendungModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentEditingSendungId = null;
    clearModalFields();
}

function clearModalFields() {
    const fields = {
        sendungTyp: 'empfang',
        sendungStatus: 'erwartet',
        sendungBeschreibung: '',
        sendungAnbieter: '',
        sendungTransportnummer: '',
        sendungProdukt: '',
        sendungPrioritaet: 'normal',
        sendungAbsender: '',
        sendungEmpfaenger: '',
        sendungDeadlineErwartet: '',
        sendungDeadlineVersand: '',
        sendungBestellnummer: '',
        sendungWert: '',
        sendungVersandkosten: '',
        sendungLagerort: '',
        sendungAufgeteiltIndex: '',
        sendungAufgeteiltAnzahl: '',
        sendungTags: '',
        sendungInhalt: '',
        sendungNotizen: '',
        sendungRuecksendungFrist: '',
        sendungRuecksendungGrund: ''
    };

    Object.entries(fields).forEach(([id, value]) => {
        const elem = document.getElementById(id);
        if (elem) elem.value = value;
    });

    const checkboxes = ['sendungErinnerungenAktiv', 'sendungRuecksendeEtikett'];
    checkboxes.forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.checked = false;
    });

    const tageVorherSelect = document.getElementById('sendungErinnerungTageVorher');
    if (tageVorherSelect) {
        tageVorherSelect.value = '3';
        tageVorherSelect.disabled = true;
    }

    const ruecksendungSection = document.getElementById('ruecksendungSection');
    if (ruecksendungSection) ruecksendungSection.style.display = 'none';
}

function fillModalWithSendungData(sendung) {
    const fieldMapping = {
        sendungTyp: 'typ',
        sendungStatus: 'status',
        sendungBeschreibung: 'beschreibung',
        sendungAnbieter: 'anbieter',
        sendungTransportnummer: 'transportnummer',
        sendungProdukt: 'produkt',
        sendungPrioritaet: 'prioritaet',
        sendungAbsender: 'absender',
        sendungEmpfaenger: 'empfaenger',
        sendungBestellnummer: 'bestellnummer',
        sendungWert: 'wert',
        sendungVersandkosten: 'versandkosten',
        sendungLagerort: 'lagerort',
        sendungAufgeteiltIndex: 'aufgeteiltIndex',
        sendungAufgeteiltAnzahl: 'aufgeteiltAnzahl',
        sendungInhalt: 'inhalt',
        sendungNotizen: 'notizen',
        sendungRuecksendungGrund: 'ruecksendungGrund'
    };

    Object.entries(fieldMapping).forEach(([elemId, fieldKey]) => {
        const elem = document.getElementById(elemId);
        if (elem && sendung[fieldKey] !== undefined) {
            if (fieldKey === 'inhalt' && Array.isArray(sendung[fieldKey])) {
                elem.value = sendung[fieldKey].join('\n');
            } else {
                elem.value = sendung[fieldKey] || '';
            }
        }
    });

    const dateFields = {
        sendungDeadlineErwartet: 'deadlineErwartet',
        sendungDeadlineVersand: 'deadlineVersand',
        sendungRuecksendungFrist: 'ruecksendungFrist'
    };

    Object.entries(dateFields).forEach(([elemId, fieldKey]) => {
        const elem = document.getElementById(elemId);
        if (elem && sendung[fieldKey]) {
            elem.value = sendung[fieldKey];
        }
    });

    if (sendung.tags && Array.isArray(sendung.tags)) {
        const tagsInput = document.getElementById('sendungTags');
        if (tagsInput) tagsInput.value = sendung.tags.join(', ');
    }

    const erinnerungenAktiv = document.getElementById('sendungErinnerungenAktiv');
    if (erinnerungenAktiv) {
        erinnerungenAktiv.checked = sendung.erinnerungenAktiv || false;
        const tageVorher = document.getElementById('sendungErinnerungTageVorher');
        if (tageVorher) {
            tageVorher.disabled = !sendung.erinnerungenAktiv;
            tageVorher.value = sendung.erinnerungTageVorher || '3';
        }
    }

    const ruecksendeEtikett = document.getElementById('sendungRuecksendeEtikett');
    if (ruecksendeEtikett) {
        ruecksendeEtikett.checked = sendung.ruecksendeEtikett || false;
    }

    const ruecksendungSection = document.getElementById('ruecksendungSection');
    if (ruecksendungSection) {
        ruecksendungSection.style.display = sendung.typ === 'ruecksendung' ? 'block' : 'none';
    }
}

async function saveSendung() {
    const beschreibung = document.getElementById('sendungBeschreibung')?.value.trim();
    const anbieter = document.getElementById('sendungAnbieter')?.value.trim();
    const transportnummer = document.getElementById('sendungTransportnummer')?.value.trim();

    if (!beschreibung || !anbieter || !transportnummer) {
        alertUser('Bitte fülle alle Pflichtfelder aus (Beschreibung, Anbieter, Transportnummer).');
        return;
    }

    const inhaltText = document.getElementById('sendungInhalt')?.value.trim() || '';
    const inhaltArray = inhaltText ? inhaltText.split('\n').map(i => i.trim()).filter(i => i) : [];

    const tagsText = document.getElementById('sendungTags')?.value.trim() || '';
    const tagsArray = tagsText ? tagsText.split(',').map(t => t.trim()).filter(t => t) : [];

    const sendungData = {
        typ: document.getElementById('sendungTyp')?.value || 'empfang',
        status: document.getElementById('sendungStatus')?.value || 'erwartet',
        beschreibung: beschreibung,
        anbieter: anbieter,
        transportnummer: transportnummer,
        produkt: document.getElementById('sendungProdukt')?.value.trim() || '',
        prioritaet: document.getElementById('sendungPrioritaet')?.value || 'normal',
        absender: document.getElementById('sendungAbsender')?.value.trim() || '',
        empfaenger: document.getElementById('sendungEmpfaenger')?.value.trim() || '',
        deadlineErwartet: document.getElementById('sendungDeadlineErwartet')?.value || null,
        deadlineVersand: document.getElementById('sendungDeadlineVersand')?.value || null,
        bestellnummer: document.getElementById('sendungBestellnummer')?.value.trim() || '',
        wert: parseFloat(document.getElementById('sendungWert')?.value) || 0,
        versandkosten: parseFloat(document.getElementById('sendungVersandkosten')?.value) || 0,
        lagerort: document.getElementById('sendungLagerort')?.value.trim() || '',
        aufgeteiltIndex: parseInt(document.getElementById('sendungAufgeteiltIndex')?.value) || null,
        aufgeteiltAnzahl: parseInt(document.getElementById('sendungAufgeteiltAnzahl')?.value) || null,
        tags: tagsArray,
        inhalt: inhaltArray,
        notizen: document.getElementById('sendungNotizen')?.value.trim() || '',
        erinnerungenAktiv: document.getElementById('sendungErinnerungenAktiv')?.checked || false,
        erinnerungTageVorher: parseInt(document.getElementById('sendungErinnerungTageVorher')?.value) || 3,
        ruecksendungFrist: document.getElementById('sendungRuecksendungFrist')?.value || null,
        ruecksendungGrund: document.getElementById('sendungRuecksendungGrund')?.value.trim() || '',
        ruecksendeEtikett: document.getElementById('sendungRuecksendeEtikett')?.checked || false,
        updatedAt: serverTimestamp()
    };

    try {
        if (currentEditingSendungId) {
            const sendungRef = doc(sendungenCollectionRef, currentEditingSendungId);
            await updateDoc(sendungRef, sendungData);
            alertUser('Sendung erfolgreich aktualisiert!');
        } else {
            sendungData.createdBy = currentUser.mode;
            sendungData.createdAt = serverTimestamp();
            await addDoc(sendungenCollectionRef, sendungData);
            alertUser('Sendung erfolgreich erstellt!');
        }
        closeSendungModalUI();
    } catch (error) {
        console.error('[Sendungsverwaltung] Fehler beim Speichern:', error);
        alertUser('Fehler beim Speichern der Sendung: ' + error.message);
    }
}

async function deleteSendung() {
    if (!currentEditingSendungId) return;

    if (!confirm('Möchtest du diese Sendung wirklich löschen?')) return;

    try {
        const sendungRef = doc(sendungenCollectionRef, currentEditingSendungId);
        await deleteDoc(sendungRef);
        alertUser('Sendung erfolgreich gelöscht!');
        closeSendungModalUI();
    } catch (error) {
        console.error('[Sendungsverwaltung] Fehler beim Löschen:', error);
        alertUser('Fehler beim Löschen der Sendung: ' + error.message);
    }
}

export function listenForSendungen() {
    if (!sendungenCollectionRef || !currentUser?.mode) {
        console.log('[Sendungsverwaltung] Collection nicht initialisiert');
        return;
    }

    if (unsubscribeSendungen) {
        unsubscribeSendungen();
    }

    const q = query(
        sendungenCollectionRef,
        where('createdBy', '==', currentUser.mode),
        orderBy('createdAt', 'desc')
    );

    unsubscribeSendungen = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            const id = change.doc.id;

            if (change.type === 'added' || change.type === 'modified') {
                SENDUNGEN[id] = { id, ...data };
            } else if (change.type === 'removed') {
                delete SENDUNGEN[id];
            }
        });

        applyFiltersAndRender();
    }, (error) => {
        console.error('[Sendungsverwaltung] Listener-Fehler:', error);
    });
}

export function stopSendungsverwaltungListeners() {
    if (unsubscribeSendungen) {
        unsubscribeSendungen();
        unsubscribeSendungen = null;
    }
    SENDUNGEN = {};
}

function applyFiltersAndRender() {
    let filtered = Object.values(SENDUNGEN);

    if (currentFilter.typ) {
        filtered = filtered.filter(s => s.typ === currentFilter.typ);
    }

    if (currentFilter.status) {
        filtered = filtered.filter(s => s.status === currentFilter.status);
    }

    if (currentFilter.prioritaet) {
        filtered = filtered.filter(s => s.prioritaet === currentFilter.prioritaet);
    }

    if (currentFilter.zeitraum !== 'alle') {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        filtered = filtered.filter(s => {
            const createdDate = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);

            if (currentFilter.zeitraum === 'diese_woche') {
                return createdDate >= startOfWeek;
            } else if (currentFilter.zeitraum === 'dieser_monat') {
                return createdDate >= startOfMonth;
            } else if (currentFilter.zeitraum === 'letzter_monat') {
                return createdDate >= startOfLastMonth && createdDate <= endOfLastMonth;
            }
            return true;
        });
    }

    if (searchTerm) {
        filtered = filtered.filter(s => {
            const searchableFields = [
                s.beschreibung,
                s.transportnummer,
                s.produkt,
                s.anbieter,
                s.absender,
                s.empfaenger,
                s.bestellnummer,
                ...(s.tags || [])
            ].map(f => (f || '').toLowerCase());

            return searchableFields.some(field => field.includes(searchTerm));
        });
    }

    renderSendungen(filtered);
    updateStatistics(filtered);
}

function updateStatistics(sendungen) {
    const stats = {
        erwartet: sendungen.filter(s => s.typ === 'empfang' && (s.status === 'erwartet' || s.status === 'unterwegs')).length,
        unterwegs: sendungen.filter(s => s.status === 'unterwegs').length,
        versand: sendungen.filter(s => s.typ === 'versand' && s.status !== 'zugestellt').length,
        ruecksendung: sendungen.filter(s => s.typ === 'ruecksendung' && s.status !== 'zugestellt').length
    };

    const statsElements = {
        statsErwartet: stats.erwartet,
        statsUnterwegs: stats.unterwegs,
        statsVersand: stats.versand,
        statsRuecksendung: stats.ruecksendung
    };

    Object.entries(statsElements).forEach(([id, value]) => {
        const elem = document.getElementById(id);
        if (elem) elem.textContent = value;
    });
}

function renderSendungen(sendungen) {
    const container = document.getElementById('sendungenContainer');
    if (!container) return;

    if (sendungen.length === 0) {
        container.innerHTML = `
            <div class="bg-gray-100 p-8 rounded-xl text-center">
                <p class="text-gray-500 text-lg">📦 Keine Sendungen gefunden.</p>
                <p class="text-gray-400 text-sm mt-2">Erstelle deine erste Sendung!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = sendungen.map(sendung => createSendungCard(sendung)).join('');

    sendungen.forEach(sendung => {
        const card = document.getElementById(`sendung-${sendung.id}`);
        if (card) {
            card.onclick = () => openSendungModal(sendung.id);
        }

        const copyBtn = document.getElementById(`copy-tracking-${sendung.id}`);
        if (copyBtn) {
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                copyToClipboard(sendung.transportnummer);
            };
        }

        const trackingLink = document.getElementById(`tracking-link-${sendung.id}`);
        if (trackingLink) {
            trackingLink.onclick = (e) => {
                e.stopPropagation();
            };
        }
    });
}

function createSendungCard(sendung) {
    const statusInfo = STATUS_CONFIG[sendung.status] || STATUS_CONFIG.erwartet;
    const typInfo = TYP_CONFIG[sendung.typ] || TYP_CONFIG.empfang;
    const prioritaetInfo = PRIORITAET_CONFIG[sendung.prioritaet] || PRIORITAET_CONFIG.normal;

    const deadlineText = getDeadlineText(sendung);
    const trackingUrl = getTrackingUrl(sendung.anbieter, sendung.transportnummer);

    const prioritaetBadge = sendung.prioritaet !== 'normal' 
        ? `<span class="text-xs px-2 py-1 rounded-full ${prioritaetInfo.badge}">${prioritaetInfo.icon} ${prioritaetInfo.label}</span>`
        : '';

    const aufgeteiltBadge = sendung.aufgeteiltAnzahl > 1
        ? `<span class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">📦 ${sendung.aufgeteiltIndex || 1} von ${sendung.aufgeteiltAnzahl}</span>`
        : '';

    const tagsBadges = (sendung.tags && sendung.tags.length > 0)
        ? sendung.tags.map(tag => `<span class="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">#${tag}</span>`).join(' ')
        : '';

    return `
        <div id="sendung-${sendung.id}" class="card bg-white p-4 rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer border-l-4 ${getBorderColor(sendung.typ)}">
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-2xl">${typInfo.icon}</span>
                        <h3 class="text-lg font-bold ${typInfo.color}">${sendung.beschreibung}</h3>
                    </div>
                    ${sendung.produkt ? `<p class="text-sm text-gray-600 ml-8">Produkt: ${sendung.produkt}</p>` : ''}
                </div>
                <span class="px-3 py-1 rounded-full text-sm font-bold ${statusInfo.color}">${statusInfo.icon} ${statusInfo.label}</span>
            </div>

            <div class="ml-8 space-y-1 text-sm text-gray-700">
                <div class="flex items-center gap-2">
                    <span class="font-semibold">🚚 ${sendung.anbieter}</span>
                    <span class="text-gray-500">•</span>
                    <code class="bg-gray-100 px-2 py-0.5 rounded">${sendung.transportnummer}</code>
                    <button id="copy-tracking-${sendung.id}" class="text-amber-600 hover:text-amber-800 ml-1" title="Kopieren">
                        📋
                    </button>
                    ${trackingUrl ? `<a id="tracking-link-${sendung.id}" href="${trackingUrl}" target="_blank" class="text-blue-600 hover:text-blue-800 ml-1" title="Tracking öffnen">🔗</a>` : ''}
                </div>
                ${sendung.absender ? `<p>📤 Von: ${sendung.absender}</p>` : ''}
                ${sendung.empfaenger ? `<p>📥 An: ${sendung.empfaenger}</p>` : ''}
                ${deadlineText ? `<p class="font-semibold text-orange-600">⏰ ${deadlineText}</p>` : ''}
            </div>

            <div class="ml-8 mt-2 flex flex-wrap gap-2">
                ${prioritaetBadge}
                ${aufgeteiltBadge}
                ${tagsBadges}
            </div>

            ${sendung.notizen ? `<div class="ml-8 mt-2 text-xs text-gray-500 italic">${sendung.notizen}</div>` : ''}
        </div>
    `;
}

function getBorderColor(typ) {
    const colors = {
        empfang: 'border-blue-500',
        versand: 'border-orange-500',
        ruecksendung: 'border-purple-500'
    };
    return colors[typ] || 'border-gray-300';
}

function getDeadlineText(sendung) {
    const deadline = sendung.typ === 'empfang' ? sendung.deadlineErwartet : sendung.deadlineVersand;
    if (!deadline) return null;

    const deadlineDate = new Date(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadlineDate.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return `Deadline überschritten (${Math.abs(diffDays)} Tage)`;
    } else if (diffDays === 0) {
        return 'Deadline: HEUTE';
    } else if (diffDays === 1) {
        return 'Deadline: Morgen';
    } else if (diffDays <= 7) {
        return `Deadline: in ${diffDays} Tagen`;
    } else {
        return `Deadline: ${deadlineDate.toLocaleDateString('de-DE')}`;
    }
}

function getTrackingUrl(anbieter, transportnummer) {
    const trackingUrls = {
        'DHL': `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${transportnummer}`,
        'Hermes': `https://www.hermesworld.com/de/sendungsverfolgung/tracking/?TrackID=${transportnummer}`,
        'DPD': `https://tracking.dpd.de/parcelstatus?query=${transportnummer}`,
        'Post Österreich': `https://www.post.at/sv/sendungsdetails?snr=${transportnummer}`,
        'UPS': `https://www.ups.com/track?tracknum=${transportnummer}`,
        'FedEx': `https://www.fedex.com/fedextrack/?trknbr=${transportnummer}`,
        'GLS': `https://gls-group.eu/DE/de/paketverfolgung?match=${transportnummer}`,
        'Amazon Logistics': null
    };

    return trackingUrls[anbieter] || null;
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alertUser('📋 Transportnummer kopiert!');
        }).catch(err => {
            console.error('[Sendungsverwaltung] Clipboard-Fehler:', err);
            fallbackCopyToClipboard(text);
        });
    } else {
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        alertUser('📋 Transportnummer kopiert!');
    } catch (err) {
        console.error('[Sendungsverwaltung] Fallback-Fehler:', err);
        alertUser('Fehler beim Kopieren.');
    }
    document.body.removeChild(textArea);
}
