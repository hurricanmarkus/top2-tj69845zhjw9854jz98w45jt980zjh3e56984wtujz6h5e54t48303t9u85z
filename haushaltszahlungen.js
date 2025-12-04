// @ts-check
// ========================================
// HAUSHALTSZAHLUNGEN SYSTEM
// Digitalisierung der Excel-Haushaltsberechnung
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
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================
let haushaltszahlungenCollection = null;
let haushaltszahlungenSettingsRef = null;
let HAUSHALTSZAHLUNGEN = {};
let currentFilter = { status: '', typ: '', person: '' };
let searchTerm = '';
let simulationsDatum = null; // Für Datums-Simulation (wie W7 in Excel)

// Standard-Einstellungen
let haushaltszahlungenSettings = {
    personen: [
        { id: 'markus', name: 'Markus', defaultAnteil: 50 },
        { id: 'jasmin', name: 'Jasmin', defaultAnteil: 50 }
    ],
    defaultAnteilMarkus: 50
};

// Intervall-Konfiguration (Spalten G-S in Excel)
const INTERVALL_CONFIG = {
    monatlich: { label: 'Monatlich', short: 'M', multiplier: 12 },
    januar: { label: 'Januar', short: 'Jan', multiplier: 1 },
    februar: { label: 'Februar', short: 'Feb', multiplier: 1 },
    maerz: { label: 'März', short: 'Mär', multiplier: 1 },
    april: { label: 'April', short: 'Apr', multiplier: 1 },
    mai: { label: 'Mai', short: 'Mai', multiplier: 1 },
    juni: { label: 'Juni', short: 'Jun', multiplier: 1 },
    juli: { label: 'Juli', short: 'Jul', multiplier: 1 },
    august: { label: 'August', short: 'Aug', multiplier: 1 },
    september: { label: 'September', short: 'Sep', multiplier: 1 },
    oktober: { label: 'Oktober', short: 'Okt', multiplier: 1 },
    november: { label: 'November', short: 'Nov', multiplier: 1 },
    dezember: { label: 'Dezember', short: 'Dez', multiplier: 1 }
};

// Status-Konfiguration
const STATUS_CONFIG = {
    aktiv: { label: 'AKTIV', color: 'bg-green-100 text-green-800', icon: '✓' },
    'n-aktiv-geplant': { label: 'N-AKTIV:Geplant', color: 'bg-blue-100 text-blue-800', icon: '📅' },
    'n-aktiv-vergangen': { label: 'N-AKTIV:Vergangen', color: 'bg-gray-100 text-gray-600', icon: '⏰' },
    fehler: { label: 'FEHLER', color: 'bg-red-100 text-red-800', icon: '⚠️' }
};

// Typ-Konfiguration
const TYP_CONFIG = {
    belastung: { label: 'Belastung', color: 'bg-red-100 text-red-700', icon: '📤' },
    gutschrift: { label: 'Gutschrift', color: 'bg-green-100 text-green-700', icon: '📥' }
};

// ========================================
// INITIALISIERUNG
// ========================================
export function initializeHaushaltszahlungen() {
    console.log("🏠 Haushaltszahlungen-System wird initialisiert...");

    if (db) {
        haushaltszahlungenCollection = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen');
        haushaltszahlungenSettingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'haushaltszahlungen');
        loadSettings();
    }

    setupEventListeners();
    renderDashboard();
}

async function loadSettings() {
    try {
        const settingsDoc = await getDoc(haushaltszahlungenSettingsRef);
        if (settingsDoc.exists()) {
            haushaltszahlungenSettings = { ...haushaltszahlungenSettings, ...settingsDoc.data() };
        }
    } catch (e) {
        console.error("Fehler beim Laden der Einstellungen:", e);
    }
}

function setupEventListeners() {
    // Neuer Eintrag Button
    const createBtn = document.getElementById('btn-create-haushaltszahlung');
    if (createBtn && !createBtn.dataset.listenerAttached) {
        createBtn.addEventListener('click', openCreateModal);
        createBtn.dataset.listenerAttached = 'true';
    }

    // Einstellungen Button
    const settingsBtn = document.getElementById('btn-haushaltszahlungen-settings');
    if (settingsBtn && !settingsBtn.dataset.listenerAttached) {
        settingsBtn.addEventListener('click', openSettingsModal);
        settingsBtn.dataset.listenerAttached = 'true';
    }

    // Modal schließen
    const closeModal = document.getElementById('closeHaushaltszahlungModal');
    if (closeModal && !closeModal.dataset.listenerAttached) {
        closeModal.addEventListener('click', closeHaushaltszahlungModal);
        closeModal.dataset.listenerAttached = 'true';
    }

    const cancelBtn = document.getElementById('cancelHaushaltszahlungBtn');
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', closeHaushaltszahlungModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    const saveBtn = document.getElementById('saveHaushaltszahlungBtn');
    if (saveBtn && !saveBtn.dataset.listenerAttached) {
        saveBtn.addEventListener('click', saveHaushaltszahlung);
        saveBtn.dataset.listenerAttached = 'true';
    }

    // Suche & Filter
    const searchInput = document.getElementById('search-haushaltszahlungen');
    if (searchInput && !searchInput.dataset.listenerAttached) {
        searchInput.addEventListener('input', (e) => {
            searchTerm = e.target.value.toLowerCase();
            renderHaushaltszahlungenTable();
        });
        searchInput.dataset.listenerAttached = 'true';
    }

    const filterStatus = document.getElementById('filter-hz-status');
    if (filterStatus && !filterStatus.dataset.listenerAttached) {
        filterStatus.addEventListener('change', (e) => {
            currentFilter.status = e.target.value;
            renderHaushaltszahlungenTable();
        });
        filterStatus.dataset.listenerAttached = 'true';
    }

    const filterTyp = document.getElementById('filter-hz-typ');
    if (filterTyp && !filterTyp.dataset.listenerAttached) {
        filterTyp.addEventListener('change', (e) => {
            currentFilter.typ = e.target.value;
            renderHaushaltszahlungenTable();
        });
        filterTyp.dataset.listenerAttached = 'true';
    }

    const resetFilters = document.getElementById('reset-filters-haushaltszahlungen');
    if (resetFilters && !resetFilters.dataset.listenerAttached) {
        resetFilters.addEventListener('click', () => {
            currentFilter = { status: '', typ: '', person: '' };
            searchTerm = '';
            document.getElementById('search-haushaltszahlungen').value = '';
            document.getElementById('filter-hz-status').value = '';
            document.getElementById('filter-hz-typ').value = '';
            renderHaushaltszahlungenTable();
        });
        resetFilters.dataset.listenerAttached = 'true';
    }

    // Simulations-Datum
    const simDatumInput = document.getElementById('hz-simulation-datum');
    if (simDatumInput && !simDatumInput.dataset.listenerAttached) {
        simDatumInput.addEventListener('change', (e) => {
            simulationsDatum = e.target.value ? new Date(e.target.value) : null;
            renderDashboard();
            renderHaushaltszahlungenTable();
            updateSimulationWarning();
        });
        simDatumInput.dataset.listenerAttached = 'true';
    }

    const clearSimBtn = document.getElementById('btn-clear-simulation');
    if (clearSimBtn && !clearSimBtn.dataset.listenerAttached) {
        clearSimBtn.addEventListener('click', () => {
            simulationsDatum = null;
            document.getElementById('hz-simulation-datum').value = '';
            renderDashboard();
            renderHaushaltszahlungenTable();
            updateSimulationWarning();
        });
        clearSimBtn.dataset.listenerAttached = 'true';
    }

    // Anteil-Slider im Modal
    const anteilSlider = document.getElementById('hz-anteil-markus');
    if (anteilSlider && !anteilSlider.dataset.listenerAttached) {
        anteilSlider.addEventListener('input', updateAnteilDisplay);
        anteilSlider.dataset.listenerAttached = 'true';
    }

    // Settings Modal
    const closeSettingsModal = document.getElementById('closeHaushaltszahlungenSettingsModal');
    if (closeSettingsModal && !closeSettingsModal.dataset.listenerAttached) {
        closeSettingsModal.addEventListener('click', () => {
            document.getElementById('haushaltszahlungenSettingsModal').style.display = 'none';
        });
        closeSettingsModal.dataset.listenerAttached = 'true';
    }

    const saveSettingsBtn = document.getElementById('saveHaushaltszahlungenSettingsBtn');
    if (saveSettingsBtn && !saveSettingsBtn.dataset.listenerAttached) {
        saveSettingsBtn.addEventListener('click', saveSettings);
        saveSettingsBtn.dataset.listenerAttached = 'true';
    }
}

function updateSimulationWarning() {
    const warningEl = document.getElementById('hz-simulation-warning');
    if (warningEl) {
        if (simulationsDatum) {
            warningEl.classList.remove('hidden');
            warningEl.textContent = `⚠️ DATUMS-SIMULATION IST AKTIV! (${formatDate(simulationsDatum)})`;
        } else {
            warningEl.classList.add('hidden');
        }
    }
}

// ========================================
// FIREBASE LISTENER
// ========================================
export function listenForHaushaltszahlungen() {
    // Collection initialisieren falls noch nicht geschehen
    if (!haushaltszahlungenCollection && db) {
        haushaltszahlungenCollection = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen');
    }
    
    if (!haushaltszahlungenCollection) {
        console.warn("Haushaltszahlungen: Collection nicht verfügbar");
        return;
    }

    // Ohne orderBy, da das Feld möglicherweise nicht existiert
    const q = query(haushaltszahlungenCollection);
    
    return onSnapshot(q, (snapshot) => {
        HAUSHALTSZAHLUNGEN = {};
        snapshot.forEach((doc) => {
            HAUSHALTSZAHLUNGEN[doc.id] = { id: doc.id, ...doc.data() };
        });
        renderDashboard();
        renderHaushaltszahlungenTable();
    }, (error) => {
        console.error("Fehler beim Laden der Haushaltszahlungen:", error);
    });
}

// ========================================
// VALIDIERUNG (Y22 Formel aus Excel)
// ========================================
function validateEintrag(eintrag) {
    // Entspricht der Y22 Formel aus Excel
    if (!eintrag.zweck || eintrag.zweck.trim() === '') {
        return 'Zahlungszweck prüfen';
    }
    if (!eintrag.organisation || eintrag.organisation.trim() === '') {
        return 'Organisation prüfen';
    }
    if (!eintrag.intervall || eintrag.intervall.length === 0) {
        return 'Zahlungsintervall prüfen';
    }
    if (!eintrag.gueltigAb) {
        return 'Gültigkeitswert AB prüfen';
    }
    if (!eintrag.gueltigBis) {
        return 'Gültigkeitswert BIS prüfen';
    }
    if (new Date(eintrag.gueltigAb) > new Date(eintrag.gueltigBis)) {
        return 'Gültigkeitswert BIS prüfen';
    }
    if (eintrag.betrag === undefined || eintrag.betrag === null || eintrag.betrag === '') {
        return 'Betrag prüfen';
    }
    if (eintrag.anteilMarkus === undefined || eintrag.anteilMarkus === null) {
        return '% Kostenanteile prüfen';
    }
    return '-'; // Alles OK
}

// ========================================
// STATUS-BERECHNUNG (C22 Formel aus Excel)
// ========================================
function berechneStatus(eintrag) {
    const validation = validateEintrag(eintrag);
    if (validation !== '-') {
        return { status: 'fehler', fehlerText: validation };
    }

    const referenzDatum = simulationsDatum || new Date();
    const gueltigAb = new Date(eintrag.gueltigAb);
    const gueltigBis = new Date(eintrag.gueltigBis);

    // Setze Zeit auf Mitternacht für korrekten Vergleich
    referenzDatum.setHours(0, 0, 0, 0);
    gueltigAb.setHours(0, 0, 0, 0);
    gueltigBis.setHours(0, 0, 0, 0);

    if (gueltigAb > referenzDatum) {
        return { status: 'n-aktiv-geplant', fehlerText: null };
    }
    if (gueltigBis < referenzDatum) {
        return { status: 'n-aktiv-vergangen', fehlerText: null };
    }
    return { status: 'aktiv', fehlerText: null };
}

// ========================================
// TYP-BERECHNUNG (D22 Formel aus Excel)
// ========================================
function berechneTyp(eintrag) {
    if (eintrag.betrag < 0) {
        return 'gutschrift';
    }
    return 'belastung';
}

// ========================================
// BETRAGS-BERECHNUNG (AC22, AE22 Formeln)
// ========================================
function berechneBetragMarkus(eintrag) {
    // AC22: =WENN(B22="";"";W22*AB22%)
    return eintrag.betrag * (eintrag.anteilMarkus / 100);
}

function berechneBetragJasmin(eintrag) {
    // AE22: =WENN(B22="";"";W22*AD22%)
    // AD22: =WENN(B22="";"";100-AB22)
    const anteilJasmin = 100 - eintrag.anteilMarkus;
    return eintrag.betrag * (anteilJasmin / 100);
}

// ========================================
// DASHBOARD BERECHNUNGEN
// ========================================
function berechneDashboardStats() {
    const eintraege = Object.values(HAUSHALTSZAHLUNGEN);
    
    // Zähler (wie C3, C5, D3, D5, E3, E5, F3, F5)
    let countAktiv = 0;
    let countNAktiv = 0;
    let countGutschrift = 0;
    let countBelastung = 0;
    let countFehler = 0;
    let countAbgelaufen = 0;
    let countZukuenftig = 0;

    // Summen pro Monat (wie G3-S3, G5-S5)
    const summenProMonat = {
        gutschrift: { monatlich: 0, januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0, juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0 },
        belastung: { monatlich: 0, januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0, juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0 }
    };

    // Beitragsaufteilung (wie G9-S9, G10-S10)
    const beitraegeMarkus = { monatlich: 0, einmalig: 0 };
    const beitraegeJasmin = { monatlich: 0, einmalig: 0 };

    const referenzDatum = simulationsDatum || new Date();

    eintraege.forEach(eintrag => {
        const { status } = berechneStatus(eintrag);
        const typ = berechneTyp(eintrag);

        // Zähler aktualisieren
        if (status === 'aktiv') countAktiv++;
        if (status === 'n-aktiv-geplant' || status === 'n-aktiv-vergangen') countNAktiv++;
        if (status === 'fehler') countFehler++;
        if (typ === 'gutschrift') countGutschrift++;
        if (typ === 'belastung') countBelastung++;

        // Abgelaufen/Zukünftig zählen
        if (eintrag.gueltigBis) {
            const gueltigBis = new Date(eintrag.gueltigBis);
            if (gueltigBis < referenzDatum) countAbgelaufen++;
        }
        if (eintrag.gueltigAb) {
            const gueltigAb = new Date(eintrag.gueltigAb);
            if (gueltigAb > referenzDatum) countZukuenftig++;
        }

        // Nur AKTIV Einträge für Summen berücksichtigen
        if (status === 'aktiv' && eintrag.intervall) {
            const betragMarkus = berechneBetragMarkus(eintrag);
            const betragJasmin = berechneBetragJasmin(eintrag);

            eintrag.intervall.forEach(intervall => {
                // Summen pro Monat und Typ
                if (summenProMonat[typ][intervall] !== undefined) {
                    summenProMonat[typ][intervall] += Math.abs(eintrag.betrag);
                }

                // Beitragsaufteilung
                if (intervall === 'monatlich') {
                    beitraegeMarkus.monatlich += betragMarkus;
                    beitraegeJasmin.monatlich += betragJasmin;
                } else {
                    beitraegeMarkus.einmalig += betragMarkus;
                    beitraegeJasmin.einmalig += betragJasmin;
                }
            });
        }
    });

    // Jährliche Berechnung (D9, D10 Formeln)
    // =G9*12+SUMME(H9:S9)
    const jaehrlichMarkus = (beitraegeMarkus.monatlich * 12) + beitraegeMarkus.einmalig;
    const jaehrlichJasmin = (beitraegeJasmin.monatlich * 12) + beitraegeJasmin.einmalig;

    return {
        counts: {
            aktiv: countAktiv,
            nAktiv: countNAktiv,
            gutschrift: countGutschrift,
            belastung: countBelastung,
            fehler: countFehler,
            gesamt: countAktiv + countNAktiv,
            abgelaufen: countAbgelaufen,
            zukuenftig: countZukuenftig
        },
        summenProMonat,
        beitraege: {
            markus: {
                monatlich: beitraegeMarkus.monatlich,
                jaehrlich: jaehrlichMarkus
            },
            jasmin: {
                monatlich: beitraegeJasmin.monatlich,
                jaehrlich: jaehrlichJasmin
            }
        },
        gesamtBelastungMonatlich: summenProMonat.belastung.monatlich,
        gesamtGutschriftMonatlich: summenProMonat.gutschrift.monatlich
    };
}

function berechneGesamtStatus(stats) {
    // F17 Formel: =WENN(E17>0;"ALARM";WENN(ZÄHLENWENN(G17:S17;"Differenz SOLL-Wert")>0;"PRÜFEN";"ALLES OK"))
    if (stats.counts.fehler > 0) {
        return { status: 'ALARM', color: 'bg-red-500' };
    }
    // Hier könnte man noch SOLL-IST Vergleiche einbauen
    return { status: 'ALLES OK', color: 'bg-green-500' };
}

// ========================================
// RENDERING
// ========================================
function renderDashboard() {
    const stats = berechneDashboardStats();
    const gesamtStatus = berechneGesamtStatus(stats);

    // Zähler aktualisieren
    updateElement('hz-stat-aktiv', stats.counts.aktiv);
    updateElement('hz-stat-n-aktiv', stats.counts.nAktiv);
    updateElement('hz-stat-gutschrift', stats.counts.gutschrift);
    updateElement('hz-stat-belastung', stats.counts.belastung);
    updateElement('hz-stat-gesamt', stats.counts.gesamt);
    updateElement('hz-stat-fehler', stats.counts.fehler);
    updateElement('hz-stat-abgelaufen', stats.counts.abgelaufen);
    updateElement('hz-stat-zukuenftig', stats.counts.zukuenftig);

    // Beitragsaufteilung
    updateElement('hz-markus-monatlich', formatCurrency(stats.beitraege.markus.monatlich));
    updateElement('hz-markus-jaehrlich', formatCurrency(stats.beitraege.markus.jaehrlich));
    updateElement('hz-jasmin-monatlich', formatCurrency(stats.beitraege.jasmin.monatlich));
    updateElement('hz-jasmin-jaehrlich', formatCurrency(stats.beitraege.jasmin.jaehrlich));

    // Effektiv monatlich (Durchschnitt)
    const effektivMarkus = stats.beitraege.markus.jaehrlich / 12;
    const effektivJasmin = stats.beitraege.jasmin.jaehrlich / 12;
    updateElement('hz-markus-effektiv', formatCurrency(effektivMarkus));
    updateElement('hz-jasmin-effektiv', formatCurrency(effektivJasmin));

    // Gesamt-Status
    const statusEl = document.getElementById('hz-total-status');
    if (statusEl) {
        statusEl.textContent = gesamtStatus.status;
        statusEl.className = `px-4 py-2 rounded-lg font-bold text-white ${gesamtStatus.color}`;
    }

    // Monatsübersicht rendern
    renderMonatsUebersicht(stats);
}

function renderMonatsUebersicht(stats) {
    const container = document.getElementById('hz-monats-uebersicht');
    if (!container) return;

    const monate = ['monatlich', 'januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
    
    let html = '<div class="grid grid-cols-13 gap-1 text-xs">';
    
    // Header
    monate.forEach(monat => {
        const label = INTERVALL_CONFIG[monat]?.short || monat;
        html += `<div class="text-center font-bold text-gray-600 py-1">${label}</div>`;
    });

    // Gutschrift-Zeile
    monate.forEach(monat => {
        const wert = stats.summenProMonat.gutschrift[monat] || 0;
        html += `<div class="text-center py-1 ${wert > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-50 text-gray-400'} rounded">${wert > 0 ? formatCurrency(wert) : '-'}</div>`;
    });

    // Belastung-Zeile
    monate.forEach(monat => {
        const wert = stats.summenProMonat.belastung[monat] || 0;
        html += `<div class="text-center py-1 ${wert > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-50 text-gray-400'} rounded">${wert > 0 ? formatCurrency(wert) : '-'}</div>`;
    });

    html += '</div>';
    container.innerHTML = html;
}

function renderHaushaltszahlungenTable() {
    const tbody = document.getElementById('haushaltszahlungen-table-body');
    if (!tbody) return;

    let eintraege = Object.values(HAUSHALTSZAHLUNGEN);

    // Filter anwenden
    if (searchTerm) {
        eintraege = eintraege.filter(e => 
            (e.zweck && e.zweck.toLowerCase().includes(searchTerm)) ||
            (e.organisation && e.organisation.toLowerCase().includes(searchTerm))
        );
    }

    if (currentFilter.status) {
        eintraege = eintraege.filter(e => berechneStatus(e).status === currentFilter.status);
    }

    if (currentFilter.typ) {
        eintraege = eintraege.filter(e => berechneTyp(e) === currentFilter.typ);
    }

    if (eintraege.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="px-4 py-8 text-center text-gray-400 italic">
                    Keine Einträge gefunden. Erstelle deinen ersten Eintrag!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = eintraege.map(eintrag => {
        const { status, fehlerText } = berechneStatus(eintrag);
        const typ = berechneTyp(eintrag);
        const statusConfig = STATUS_CONFIG[status];
        const typConfig = TYP_CONFIG[typ];
        const betragMarkus = berechneBetragMarkus(eintrag);
        const betragJasmin = berechneBetragJasmin(eintrag);
        const intervallLabels = (eintrag.intervall || []).map(i => INTERVALL_CONFIG[i]?.short || i).join(', ');

        return `
            <tr class="hover:bg-gray-50 transition ${status === 'fehler' ? 'bg-red-50' : ''}">
                <td class="px-3 py-3">
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${statusConfig.color}">
                        ${statusConfig.icon} ${statusConfig.label}
                    </span>
                    ${fehlerText ? `<div class="text-xs text-red-600 mt-1">${fehlerText}</div>` : ''}
                </td>
                <td class="px-3 py-3">
                    <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${typConfig.color}">
                        ${typConfig.icon} ${typConfig.label}
                    </span>
                </td>
                <td class="px-3 py-3 font-medium text-gray-800">${eintrag.zweck || '-'}</td>
                <td class="px-3 py-3 text-gray-600">${eintrag.organisation || '-'}</td>
                <td class="px-3 py-3 text-xs text-gray-500">${intervallLabels || '-'}</td>
                <td class="px-3 py-3 font-bold ${typ === 'gutschrift' ? 'text-green-600' : 'text-red-600'}">
                    ${formatCurrency(eintrag.betrag)}
                </td>
                <td class="px-3 py-3 text-sm">
                    <div class="text-blue-600">${eintrag.anteilMarkus}% M</div>
                    <div class="text-pink-600">${100 - eintrag.anteilMarkus}% J</div>
                </td>
                <td class="px-3 py-3 text-xs text-gray-500">
                    ${formatDate(eintrag.gueltigAb)} - ${formatDate(eintrag.gueltigBis)}
                </td>
                <td class="px-3 py-3 text-center">
                    <div class="flex justify-center gap-1">
                        <button onclick="window.editHaushaltszahlung('${eintrag.id}')" 
                            class="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition" title="Bearbeiten">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button onclick="window.deleteHaushaltszahlung('${eintrag.id}')" 
                            class="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition" title="Löschen">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ========================================
// MODAL FUNKTIONEN
// ========================================
function openCreateModal() {
    const modal = document.getElementById('haushaltszahlungModal');
    const title = document.getElementById('haushaltszahlungModalTitle');
    
    if (modal && title) {
        title.textContent = 'Neuer Eintrag';
        document.getElementById('hz-id').value = '';
        document.getElementById('hz-zweck').value = '';
        document.getElementById('hz-organisation').value = '';
        document.getElementById('hz-betrag').value = '';
        document.getElementById('hz-gueltig-ab').value = new Date().toISOString().split('T')[0];
        document.getElementById('hz-gueltig-bis').value = '';
        document.getElementById('hz-anteil-markus').value = haushaltszahlungenSettings.defaultAnteilMarkus || 50;
        document.getElementById('hz-kundennummer').value = '';
        document.getElementById('hz-vertragsnummer').value = '';
        document.getElementById('hz-vormerk').value = '';
        document.getElementById('hz-erinnerung').value = '';
        
        // Intervall-Checkboxen zurücksetzen
        document.querySelectorAll('.hz-intervall-checkbox').forEach(cb => cb.checked = false);
        
        updateAnteilDisplay();
        modal.style.display = 'flex';
    }
}

function openEditModal(eintrag) {
    const modal = document.getElementById('haushaltszahlungModal');
    const title = document.getElementById('haushaltszahlungModalTitle');
    
    if (modal && title) {
        title.textContent = 'Eintrag bearbeiten';
        document.getElementById('hz-id').value = eintrag.id;
        document.getElementById('hz-zweck').value = eintrag.zweck || '';
        document.getElementById('hz-organisation').value = eintrag.organisation || '';
        document.getElementById('hz-betrag').value = eintrag.betrag || '';
        document.getElementById('hz-gueltig-ab').value = eintrag.gueltigAb || '';
        document.getElementById('hz-gueltig-bis').value = eintrag.gueltigBis || '';
        document.getElementById('hz-anteil-markus').value = eintrag.anteilMarkus ?? 50;
        document.getElementById('hz-kundennummer').value = eintrag.kundennummer || '';
        document.getElementById('hz-vertragsnummer').value = eintrag.vertragsnummer || '';
        document.getElementById('hz-vormerk').value = eintrag.vormerk || '';
        document.getElementById('hz-erinnerung').value = eintrag.erinnerung || '';
        
        // Intervall-Checkboxen setzen
        document.querySelectorAll('.hz-intervall-checkbox').forEach(cb => {
            cb.checked = (eintrag.intervall || []).includes(cb.value);
        });
        
        updateAnteilDisplay();
        modal.style.display = 'flex';
    }
}

function closeHaushaltszahlungModal() {
    const modal = document.getElementById('haushaltszahlungModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function updateAnteilDisplay() {
    const slider = document.getElementById('hz-anteil-markus');
    const displayMarkus = document.getElementById('hz-anteil-markus-display');
    const displayJasmin = document.getElementById('hz-anteil-jasmin-display');
    
    if (slider && displayMarkus && displayJasmin) {
        const anteilMarkus = parseInt(slider.value);
        const anteilJasmin = 100 - anteilMarkus;
        displayMarkus.textContent = `${anteilMarkus}%`;
        displayJasmin.textContent = `${anteilJasmin}%`;
    }
}

// ========================================
// SPEICHERN & LÖSCHEN
// ========================================
async function saveHaushaltszahlung() {
    const id = document.getElementById('hz-id').value;
    const zweck = document.getElementById('hz-zweck').value.trim();
    const organisation = document.getElementById('hz-organisation').value.trim();
    const betrag = parseFloat(document.getElementById('hz-betrag').value) || 0;
    const gueltigAb = document.getElementById('hz-gueltig-ab').value;
    const gueltigBis = document.getElementById('hz-gueltig-bis').value;
    const anteilMarkus = parseInt(document.getElementById('hz-anteil-markus').value) || 50;
    const kundennummer = document.getElementById('hz-kundennummer').value.trim();
    const vertragsnummer = document.getElementById('hz-vertragsnummer').value.trim();
    const vormerk = document.getElementById('hz-vormerk').value.trim();
    const erinnerung = document.getElementById('hz-erinnerung').value;

    // Intervalle sammeln
    const intervall = [];
    document.querySelectorAll('.hz-intervall-checkbox:checked').forEach(cb => {
        intervall.push(cb.value);
    });

    const data = {
        zweck,
        organisation,
        betrag,
        gueltigAb,
        gueltigBis,
        anteilMarkus,
        intervall,
        kundennummer,
        vertragsnummer,
        vormerk,
        erinnerung,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.displayName
    };

    // Validierung
    const testEintrag = { ...data };
    const validation = validateEintrag(testEintrag);
    if (validation !== '-') {
        alertUser(`Validierungsfehler: ${validation}`, 'error');
        return;
    }

    try {
        if (id) {
            // Update
            await updateDoc(doc(haushaltszahlungenCollection, id), data);
            alertUser('Eintrag erfolgreich aktualisiert!', 'success');
        } else {
            // Create
            data.createdAt = serverTimestamp();
            data.createdBy = currentUser.displayName;
            await addDoc(haushaltszahlungenCollection, data);
            alertUser('Eintrag erfolgreich erstellt!', 'success');
        }
        closeHaushaltszahlungModal();
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        alertUser('Fehler beim Speichern: ' + error.message, 'error');
    }
}

async function deleteHaushaltszahlung(id) {
    if (!confirm('Möchtest du diesen Eintrag wirklich löschen?')) return;

    try {
        await deleteDoc(doc(haushaltszahlungenCollection, id));
        alertUser('Eintrag erfolgreich gelöscht!', 'success');
    } catch (error) {
        console.error("Fehler beim Löschen:", error);
        alertUser('Fehler beim Löschen: ' + error.message, 'error');
    }
}

// ========================================
// EINSTELLUNGEN
// ========================================
function openSettingsModal() {
    const modal = document.getElementById('haushaltszahlungenSettingsModal');
    if (modal) {
        document.getElementById('hz-settings-default-anteil').value = haushaltszahlungenSettings.defaultAnteilMarkus || 50;
        modal.style.display = 'flex';
    }
}

async function saveSettings() {
    const defaultAnteil = parseInt(document.getElementById('hz-settings-default-anteil').value) || 50;
    
    haushaltszahlungenSettings.defaultAnteilMarkus = defaultAnteil;

    try {
        await setDoc(haushaltszahlungenSettingsRef, haushaltszahlungenSettings);
        alertUser('Einstellungen gespeichert!', 'success');
        document.getElementById('haushaltszahlungenSettingsModal').style.display = 'none';
    } catch (error) {
        console.error("Fehler beim Speichern der Einstellungen:", error);
        alertUser('Fehler beim Speichern: ' + error.message, 'error');
    }
}

// ========================================
// HILFSFUNKTIONEN
// ========================================
function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('de-DE');
    } catch {
        return dateStr;
    }
}

// ========================================
// GLOBALE FUNKTIONEN FÜR ONCLICK
// ========================================
window.editHaushaltszahlung = function(id) {
    const eintrag = HAUSHALTSZAHLUNGEN[id];
    if (eintrag) {
        openEditModal(eintrag);
    }
};

window.deleteHaushaltszahlung = deleteHaushaltszahlung;
