// @ts-check
// ========================================
// HAUSHALTSZAHLUNGEN SYSTEM
// Digitalisierung der Excel-Haushaltsberechnung
// Mit Themen-System und Multi-Personen-Unterstützung
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
    setDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ========================================
// GLOBALE VARIABLEN
// ========================================
let haushaltszahlungenCollection = null;
let haushaltszahlungenSettingsRef = null;
let haushaltszahlungenThemenRef = null;
let haushaltszahlungenProtokollRef = null;
let HAUSHALTSZAHLUNGEN = {};
let THEMEN = {};
let currentThemaId = null; // Aktuell ausgewähltes Thema
let currentFilter = { status: '', typ: '', person: '' };
let searchTerm = '';
let simulationsDatum = null; // Für Datums-Simulation (wie W7 in Excel)

// Standard-Einstellungen
let haushaltszahlungenSettings = {
    personen: [],
    defaultAnteilMarkus: 50
};

// Zugriffsrechte
const ZUGRIFFSRECHTE = {
    lesen: { label: 'Nur Lesen', icon: '👁️', canEdit: false, canEditOwn: false },
    eigene: { label: 'Eigene Zahlung ändern', icon: '✏️', canEdit: false, canEditOwn: true },
    vollzugriff: { label: 'Vollzugriff', icon: '🔓', canEdit: true, canEditOwn: true }
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
        haushaltszahlungenSettingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'haushaltszahlungen');
        haushaltszahlungenThemenRef = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen_themen');
        haushaltszahlungenProtokollRef = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen_protokoll');
        loadSettings();
        loadThemen();
    }

    setupEventListeners();
    renderDashboard();
}

// Themen laden
async function loadThemen() {
    try {
        const snapshot = await getDocs(haushaltszahlungenThemenRef);
        THEMEN = {};
        snapshot.forEach((docSnap) => {
            THEMEN[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        
        // Wenn kein Thema existiert, Standard-Thema erstellen
        if (Object.keys(THEMEN).length === 0) {
            await createDefaultThema();
        }
        
        // Erstes Thema auswählen oder gespeichertes
        const savedThemaId = localStorage.getItem('hz_current_thema');
        if (savedThemaId && THEMEN[savedThemaId]) {
            currentThemaId = savedThemaId;
        } else {
            currentThemaId = Object.keys(THEMEN)[0];
        }
        
        renderThemenDropdown();
        updateCollectionForThema();
    } catch (e) {
        console.error("Fehler beim Laden der Themen:", e);
    }
}

async function createDefaultThema() {
    try {
        const defaultThema = {
            name: 'Haushalt',
            ersteller: currentUser.displayName,
            erstelltAm: serverTimestamp(),
            mitglieder: [{
                oderId: currentUser.displayName,
                name: currentUser.displayName,
                zugriffsrecht: 'vollzugriff',
                dauerauftraege: {
                    monatlich: 0,
                    januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
                    juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
                }
            }]
        };
        const docRef = await addDoc(haushaltszahlungenThemenRef, defaultThema);
        THEMEN[docRef.id] = { id: docRef.id, ...defaultThema };
        currentThemaId = docRef.id;
    } catch (e) {
        console.error("Fehler beim Erstellen des Standard-Themas:", e);
    }
}

function updateCollectionForThema() {
    if (currentThemaId && db) {
        haushaltszahlungenCollection = collection(db, 'artifacts', appId, 'public', 'data', 'haushaltszahlungen_themen', currentThemaId, 'eintraege');
        listenForHaushaltszahlungen();
    }
}

function renderThemenDropdown() {
    const dropdown = document.getElementById('hz-thema-dropdown');
    if (!dropdown) return;
    
    dropdown.innerHTML = Object.values(THEMEN).map(thema => 
        `<option value="${thema.id}" ${thema.id === currentThemaId ? 'selected' : ''}>${thema.name}</option>`
    ).join('');
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
    // Thema-Dropdown
    const themaDropdown = document.getElementById('hz-thema-dropdown');
    if (themaDropdown && !themaDropdown.dataset.listenerAttached) {
        themaDropdown.addEventListener('change', (e) => {
            currentThemaId = e.target.value;
            localStorage.setItem('hz_current_thema', currentThemaId);
            updateCollectionForThema();
            renderDashboard();
        });
        themaDropdown.dataset.listenerAttached = 'true';
    }

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
    
    // Alle Monate auswählen/abwählen Button
    const alleMonateBtn = document.getElementById('hz-alle-monate-btn');
    if (alleMonateBtn && !alleMonateBtn.dataset.listenerAttached) {
        alleMonateBtn.addEventListener('click', toggleAlleMonate);
        alleMonateBtn.dataset.listenerAttached = 'true';
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

    // Jährliche Summen berechnen (Summe aller Einzelmonate)
    const summenJaehrlich = {
        gutschrift: Object.entries(summenProMonat.gutschrift)
            .filter(([key]) => key !== 'monatlich')
            .reduce((sum, [, val]) => sum + val, 0) + (summenProMonat.gutschrift.monatlich * 12),
        belastung: Object.entries(summenProMonat.belastung)
            .filter(([key]) => key !== 'monatlich')
            .reduce((sum, [, val]) => sum + val, 0) + (summenProMonat.belastung.monatlich * 12)
    };

    // Kosten berechnen
    const kostenMonatlich = summenProMonat.belastung.monatlich - summenProMonat.gutschrift.monatlich;
    const kostenJaehrlichEinmalig = Object.entries(summenProMonat.belastung)
        .filter(([key]) => key !== 'monatlich')
        .reduce((sum, [, val]) => sum + val, 0) - 
        Object.entries(summenProMonat.gutschrift)
        .filter(([key]) => key !== 'monatlich')
        .reduce((sum, [, val]) => sum + val, 0);
    
    // Effektiv monatlich = (monatliche Kosten * 12 + Jahreskosten) / 12
    const effektivMonatlich = ((kostenMonatlich * 12) + kostenJaehrlichEinmalig) / 12;

    // Alarme berechnen
    const alarme = berechneAlarme();

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
        summenJaehrlich,
        kosten: {
            monatlich: kostenMonatlich,
            jaehrlichEinmalig: kostenJaehrlichEinmalig,
            effektivMonatlich: effektivMonatlich
        },
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
        alarme,
        gesamtBelastungMonatlich: summenProMonat.belastung.monatlich,
        gesamtGutschriftMonatlich: summenProMonat.gutschrift.monatlich
    };
}

// Alarme berechnen (Einzahlungen vs. Kosten)
function berechneAlarme() {
    const alarme = [];
    const thema = THEMEN[currentThemaId];
    
    if (!thema || !thema.mitglieder) return alarme;
    
    const eintraege = Object.values(HAUSHALTSZAHLUNGEN);
    
    // Gesamtkosten pro Intervall berechnen
    const kostenProIntervall = {
        monatlich: 0,
        januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
        juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
    };
    
    eintraege.forEach(eintrag => {
        const { status } = berechneStatus(eintrag);
        if (status !== 'aktiv') return;
        
        (eintrag.intervall || []).forEach(intervall => {
            if (kostenProIntervall[intervall] !== undefined) {
                kostenProIntervall[intervall] += Math.abs(eintrag.betrag);
            }
        });
    });
    
    // Für jedes Mitglied prüfen
    thema.mitglieder.forEach(mitglied => {
        if (!mitglied.dauerauftraege) return;
        
        // Prüfe jeden Dauerauftrag
        Object.entries(mitglied.dauerauftraege).forEach(([intervall, betrag]) => {
            const sollBetrag = kostenProIntervall[intervall] || 0;
            const anteil = mitglied.anteil || (100 / thema.mitglieder.length);
            const sollAnteil = sollBetrag * (anteil / 100);
            
            if (betrag < sollAnteil && sollAnteil > 0) {
                alarme.push({
                    typ: 'unterdeckung',
                    person: mitglied.name,
                    intervall: INTERVALL_CONFIG[intervall]?.label || intervall,
                    differenz: sollAnteil - betrag,
                    message: `${mitglied.name} zahlt ${formatCurrency(betrag)} statt ${formatCurrency(sollAnteil)} (${INTERVALL_CONFIG[intervall]?.label || intervall})`
                });
            } else if (betrag > sollAnteil && sollAnteil > 0) {
                alarme.push({
                    typ: 'ueberdeckung',
                    person: mitglied.name,
                    intervall: INTERVALL_CONFIG[intervall]?.label || intervall,
                    differenz: betrag - sollAnteil,
                    message: `${mitglied.name} zahlt ${formatCurrency(betrag - sollAnteil)} zu viel (${INTERVALL_CONFIG[intervall]?.label || intervall})`
                });
            }
        });
    });
    
    return alarme;
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

    // Zähler aktualisieren (nur aktive Einträge für Belastung/Gutschrift)
    updateElement('hz-stat-aktiv', stats.counts.aktiv);
    updateElement('hz-stat-belastung', formatCurrency(stats.kosten.monatlich));
    updateElement('hz-stat-gutschrift', formatCurrency(Math.abs(stats.gesamtGutschriftMonatlich)));
    updateElement('hz-stat-alarm', stats.alarme.length);

    // Kosten-Übersicht
    updateElement('hz-kosten-monatlich', formatCurrency(stats.kosten.monatlich));
    updateElement('hz-kosten-jaehrlich', formatCurrency(stats.kosten.jaehrlichEinmalig));
    updateElement('hz-kosten-effektiv', formatCurrency(stats.kosten.effektivMonatlich));

    // Mitglieder-Beiträge dynamisch rendern
    renderMitgliederBeitraege(stats);

    // Gesamt-Status mit Alarmen
    const statusEl = document.getElementById('hz-total-status');
    if (statusEl) {
        if (stats.alarme.length > 0) {
            statusEl.textContent = `⚠️ ${stats.alarme.length} ALARM${stats.alarme.length > 1 ? 'E' : ''}`;
            statusEl.className = 'px-4 py-2 rounded-lg font-bold text-white bg-red-500 cursor-pointer';
            statusEl.onclick = () => showAlarmeModal(stats.alarme);
        } else {
            statusEl.textContent = gesamtStatus.status;
            statusEl.className = `px-4 py-2 rounded-lg font-bold text-white ${gesamtStatus.color}`;
            statusEl.onclick = null;
        }
    }

    // Monatsübersicht rendern
    renderMonatsUebersicht(stats);
}

// Mitglieder-Beiträge dynamisch rendern
function renderMitgliederBeitraege(stats) {
    const container = document.getElementById('hz-mitglieder-beitraege');
    if (!container) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema || !thema.mitglieder) {
        container.innerHTML = '<p class="text-white/70 text-sm">Keine Mitglieder konfiguriert</p>';
        return;
    }
    
    const colors = ['blue', 'pink', 'green', 'purple', 'orange', 'cyan'];
    
    container.innerHTML = thema.mitglieder.map((mitglied, index) => {
        const color = colors[index % colors.length];
        const anteil = mitglied.anteil || (100 / thema.mitglieder.length);
        
        // Berechne Beiträge für dieses Mitglied
        const monatlich = stats.kosten.monatlich * (anteil / 100);
        const jaehrlich = (stats.kosten.monatlich * 12 + stats.kosten.jaehrlichEinmalig) * (anteil / 100);
        const effektiv = jaehrlich / 12;
        
        return `
            <div class="bg-${color}-500/30 p-3 rounded-lg">
                <div class="flex justify-between items-center mb-1">
                    <p class="text-xs font-bold">${mitglied.name}</p>
                    <span class="text-xs bg-white/20 px-2 py-0.5 rounded">${anteil.toFixed(0)}%</span>
                </div>
                <p class="text-sm">Monatlich: <span class="font-bold">${formatCurrency(monatlich)}</span></p>
                <p class="text-sm">Jährlich: <span class="font-bold">${formatCurrency(jaehrlich)}</span></p>
                <p class="text-xs text-white/70">Effektiv/Monat: ${formatCurrency(effektiv)}</p>
                <button onclick="window.openDauerauftraegeModal('${mitglied.userId || mitglied.name}')" 
                    class="mt-2 text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition w-full">
                    ⚙️ Daueraufträge
                </button>
            </div>
        `;
    }).join('');
}

// Alarme Modal anzeigen
function showAlarmeModal(alarme) {
    const modal = document.getElementById('hz-alarme-modal');
    const content = document.getElementById('hz-alarme-content');
    
    if (!modal || !content) return;
    
    content.innerHTML = alarme.map(alarm => `
        <div class="p-3 rounded-lg ${alarm.typ === 'unterdeckung' ? 'bg-red-100 border-l-4 border-red-500' : 'bg-yellow-100 border-l-4 border-yellow-500'}">
            <p class="font-bold ${alarm.typ === 'unterdeckung' ? 'text-red-700' : 'text-yellow-700'}">
                ${alarm.typ === 'unterdeckung' ? '⚠️ Unterdeckung' : '💰 Überdeckung'}
            </p>
            <p class="text-sm text-gray-700">${alarm.message}</p>
            <p class="text-xs text-gray-500 mt-1">Differenz: ${formatCurrency(alarm.differenz)}</p>
        </div>
    `).join('');
    
    modal.style.display = 'flex';
}

function renderMonatsUebersicht(stats) {
    const container = document.getElementById('hz-monats-uebersicht');
    if (!container) return;

    // Nur die 12 Monate (ohne "monatlich")
    const monate = ['januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
    
    // Horizontale Tabelle mit Monat als Spalten
    let html = `
        <table class="w-full border-collapse text-xs">
            <thead>
                <tr class="bg-gray-100">
                    <th class="p-2 text-left font-bold text-gray-700 border">Typ</th>
                    ${monate.map(m => `<th class="p-1 text-center font-bold text-gray-600 border">${INTERVALL_CONFIG[m]?.short || m}</th>`).join('')}
                    <th class="p-2 text-center font-bold text-gray-700 border bg-cyan-50">Σ Jahr</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="p-2 font-bold text-green-700 border bg-green-50">📥 Gutschrift</td>
                    ${monate.map(m => {
                        const wert = stats.summenProMonat.gutschrift[m] || 0;
                        return `<td class="p-1 text-center border ${wert > 0 ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-400'}">${wert > 0 ? formatCurrency(wert) : '-'}</td>`;
                    }).join('')}
                    <td class="p-2 text-center font-bold text-green-700 border bg-green-100">${formatCurrency(stats.summenJaehrlich?.gutschrift || 0)}</td>
                </tr>
                <tr>
                    <td class="p-2 font-bold text-red-700 border bg-red-50">📤 Belastung</td>
                    ${monate.map(m => {
                        const wert = stats.summenProMonat.belastung[m] || 0;
                        return `<td class="p-1 text-center border ${wert > 0 ? 'bg-red-100 text-red-700 font-medium' : 'text-gray-400'}">${wert > 0 ? formatCurrency(wert) : '-'}</td>`;
                    }).join('')}
                    <td class="p-2 text-center font-bold text-red-700 border bg-red-100">${formatCurrency(stats.summenJaehrlich?.belastung || 0)}</td>
                </tr>
                <tr class="bg-gray-50">
                    <td class="p-2 font-bold text-gray-700 border">📊 Saldo</td>
                    ${monate.map(m => {
                        const gutschrift = stats.summenProMonat.gutschrift[m] || 0;
                        const belastung = stats.summenProMonat.belastung[m] || 0;
                        const saldo = gutschrift - belastung;
                        const color = saldo > 0 ? 'text-green-600' : saldo < 0 ? 'text-red-600' : 'text-gray-400';
                        return `<td class="p-1 text-center border ${color} font-medium">${saldo !== 0 ? formatCurrency(saldo) : '-'}</td>`;
                    }).join('')}
                    <td class="p-2 text-center font-bold border ${(stats.summenJaehrlich?.gutschrift || 0) - (stats.summenJaehrlich?.belastung || 0) >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}">${formatCurrency((stats.summenJaehrlich?.gutschrift || 0) - (stats.summenJaehrlich?.belastung || 0))}</td>
                </tr>
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

// Toggle alle Monate im Modal
function toggleAlleMonate() {
    const checkboxes = document.querySelectorAll('.hz-intervall-checkbox:not([value="monatlich"])');
    const btn = document.getElementById('hz-alle-monate-btn');
    
    // Prüfen ob alle ausgewählt sind
    const alleAusgewaehlt = Array.from(checkboxes).every(cb => cb.checked);
    
    // Toggle
    checkboxes.forEach(cb => {
        cb.checked = !alleAusgewaehlt;
    });
    
    // Button-Text aktualisieren
    if (btn) {
        btn.textContent = alleAusgewaehlt ? '☐ Alle Monate auswählen' : '☑ Alle Monate abwählen';
    }
}

// Aktualisiere Button-Text basierend auf Checkbox-Status
function updateAlleMonateButton() {
    const checkboxes = document.querySelectorAll('.hz-intervall-checkbox:not([value="monatlich"])');
    const btn = document.getElementById('hz-alle-monate-btn');
    
    if (!btn) return;
    
    const alleAusgewaehlt = Array.from(checkboxes).every(cb => cb.checked);
    btn.textContent = alleAusgewaehlt ? '☑ Alle Monate abwählen' : '☐ Alle Monate auswählen';
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
        renderThemenListe();
        renderMitgliederListe();
        renderKostenaufteilung();
        modal.style.display = 'flex';
    }
    
    // Event-Listener für Buttons
    setupSettingsEventListeners();
}

function setupSettingsEventListeners() {
    const addThemaBtn = document.getElementById('hz-add-thema-btn');
    if (addThemaBtn && !addThemaBtn.dataset.listenerAttached) {
        addThemaBtn.addEventListener('click', () => {
            document.getElementById('hz-add-thema-modal').style.display = 'flex';
        });
        addThemaBtn.dataset.listenerAttached = 'true';
    }
    
    const saveThemaBtn = document.getElementById('hz-save-thema-btn');
    if (saveThemaBtn && !saveThemaBtn.dataset.listenerAttached) {
        saveThemaBtn.addEventListener('click', saveNewThema);
        saveThemaBtn.dataset.listenerAttached = 'true';
    }
    
    const addMitgliedBtn = document.getElementById('hz-add-mitglied-btn');
    if (addMitgliedBtn && !addMitgliedBtn.dataset.listenerAttached) {
        addMitgliedBtn.addEventListener('click', openAddMitgliedModal);
        addMitgliedBtn.dataset.listenerAttached = 'true';
    }
    
    const saveMitgliedBtn = document.getElementById('hz-save-mitglied-btn');
    if (saveMitgliedBtn && !saveMitgliedBtn.dataset.listenerAttached) {
        saveMitgliedBtn.addEventListener('click', saveNewMitglied);
        saveMitgliedBtn.dataset.listenerAttached = 'true';
    }
    
    const saveDauerauftraegeBtn = document.getElementById('hz-save-dauerauftraege-btn');
    if (saveDauerauftraegeBtn && !saveDauerauftraegeBtn.dataset.listenerAttached) {
        saveDauerauftraegeBtn.addEventListener('click', saveDauerauftraege);
        saveDauerauftraegeBtn.dataset.listenerAttached = 'true';
    }
    
    const showProtokollBtn = document.getElementById('hz-show-protokoll-btn');
    if (showProtokollBtn && !showProtokollBtn.dataset.listenerAttached) {
        showProtokollBtn.addEventListener('click', toggleProtokoll);
        showProtokollBtn.dataset.listenerAttached = 'true';
    }
}

function renderThemenListe() {
    const container = document.getElementById('hz-themen-liste');
    if (!container) return;
    
    if (Object.keys(THEMEN).length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Keine Themen vorhanden</p>';
        return;
    }
    
    container.innerHTML = Object.values(THEMEN).map(thema => `
        <div class="flex items-center justify-between p-2 bg-white rounded-lg border ${thema.id === currentThemaId ? 'border-cyan-500 bg-cyan-50' : 'border-gray-200'}">
            <div class="flex items-center gap-2">
                <span class="font-bold text-gray-800">${thema.name}</span>
                ${thema.id === currentThemaId ? '<span class="text-xs bg-cyan-500 text-white px-2 py-0.5 rounded">Aktiv</span>' : ''}
                <span class="text-xs text-gray-500">(${thema.mitglieder?.length || 0} Mitglieder)</span>
            </div>
            <div class="flex gap-1">
                ${thema.ersteller === currentUser.displayName ? `
                    <button onclick="window.deleteThema('${thema.id}')" class="p-1 text-red-600 hover:bg-red-100 rounded" title="Löschen">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function renderMitgliederListe() {
    const container = document.getElementById('hz-mitglieder-liste');
    if (!container) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema || !thema.mitglieder || thema.mitglieder.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Keine Mitglieder vorhanden</p>';
        return;
    }
    
    container.innerHTML = thema.mitglieder.map((mitglied, index) => `
        <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200">
            <div class="flex items-center gap-2">
                <span class="font-bold text-gray-800">${mitglied.name}</span>
                <span class="text-xs ${ZUGRIFFSRECHTE[mitglied.zugriffsrecht]?.icon ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'} px-2 py-0.5 rounded">
                    ${ZUGRIFFSRECHTE[mitglied.zugriffsrecht]?.label || mitglied.zugriffsrecht}
                </span>
                <span class="text-xs text-gray-500">${mitglied.anteil || Math.round(100 / thema.mitglieder.length)}%</span>
            </div>
            <div class="flex gap-1">
                <button onclick="window.openDauerauftraegeModal('${mitglied.userId || mitglied.name}')" class="p-1 text-blue-600 hover:bg-blue-100 rounded" title="Daueraufträge">
                    💳
                </button>
                ${thema.ersteller === currentUser.displayName && mitglied.name !== thema.ersteller ? `
                    <button onclick="window.removeMitglied(${index})" class="p-1 text-red-600 hover:bg-red-100 rounded" title="Entfernen">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                ` : ''}
            </div>
        </div>
    `).join('');
}

function renderKostenaufteilung() {
    const container = document.getElementById('hz-kostenaufteilung');
    if (!container) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema || !thema.mitglieder || thema.mitglieder.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic">Füge zuerst Mitglieder hinzu</p>';
        return;
    }
    
    // Berechne Gesamtanteil
    const gesamtAnteil = thema.mitglieder.reduce((sum, m) => sum + (m.anteil || 0), 0);
    
    container.innerHTML = thema.mitglieder.map((mitglied, index) => `
        <div class="flex items-center gap-3">
            <span class="w-24 font-bold text-gray-700">${mitglied.name}</span>
            <input type="number" min="0" max="100" value="${mitglied.anteil || Math.round(100 / thema.mitglieder.length)}" 
                onchange="window.updateMitgliedAnteil(${index}, this.value)"
                class="w-20 p-2 border-2 border-gray-300 rounded-lg text-center font-bold">
            <span class="text-gray-500">%</span>
            <div class="flex-1 bg-gray-200 rounded-full h-3">
                <div class="bg-cyan-500 h-3 rounded-full" style="width: ${mitglied.anteil || Math.round(100 / thema.mitglieder.length)}%"></div>
            </div>
        </div>
    `).join('') + `
        <div class="mt-2 p-2 rounded-lg ${gesamtAnteil === 100 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
            <span class="font-bold">Gesamt: ${gesamtAnteil}%</span>
            ${gesamtAnteil !== 100 ? ' ⚠️ Sollte 100% sein!' : ' ✓'}
        </div>
    `;
}

async function saveNewThema() {
    const nameInput = document.getElementById('hz-thema-name');
    const name = nameInput?.value?.trim();
    
    if (!name) {
        alertUser('Bitte gib einen Namen ein', 'error');
        return;
    }
    
    try {
        const newThema = {
            name,
            ersteller: currentUser.displayName,
            erstelltAm: serverTimestamp(),
            mitglieder: [{
                userId: currentUser.displayName,
                name: currentUser.displayName,
                zugriffsrecht: 'vollzugriff',
                anteil: 100,
                dauerauftraege: {
                    monatlich: 0,
                    januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
                    juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
                }
            }]
        };
        
        const docRef = await addDoc(haushaltszahlungenThemenRef, newThema);
        THEMEN[docRef.id] = { id: docRef.id, ...newThema };
        
        nameInput.value = '';
        document.getElementById('hz-add-thema-modal').style.display = 'none';
        renderThemenListe();
        renderThemenDropdown();
        alertUser('Thema erstellt!', 'success');
    } catch (error) {
        console.error("Fehler beim Erstellen des Themas:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
}

function openAddMitgliedModal() {
    const userSelect = document.getElementById('hz-mitglied-user-select');
    if (userSelect) {
        // Fülle Benutzer-Dropdown
        userSelect.innerHTML = '<option value="">Benutzer wählen...</option>' +
            Object.values(USERS).map(user => 
                `<option value="${user.displayName}">${user.displayName}</option>`
            ).join('');
    }
    document.getElementById('hz-add-mitglied-modal').style.display = 'flex';
}

async function saveNewMitglied() {
    const userSelect = document.getElementById('hz-mitglied-user-select');
    const rechtSelect = document.getElementById('hz-mitglied-recht-select');
    const anteilInput = document.getElementById('hz-mitglied-anteil');
    
    const userName = userSelect?.value;
    const recht = rechtSelect?.value || 'lesen';
    const anteil = parseInt(anteilInput?.value) || 50;
    
    if (!userName) {
        alertUser('Bitte wähle einen Benutzer', 'error');
        return;
    }
    
    const thema = THEMEN[currentThemaId];
    if (!thema) return;
    
    // Prüfe ob Benutzer bereits Mitglied ist
    if (thema.mitglieder?.some(m => m.name === userName)) {
        alertUser('Benutzer ist bereits Mitglied', 'error');
        return;
    }
    
    try {
        const newMitglied = {
            userId: userName,
            name: userName,
            zugriffsrecht: recht,
            anteil: anteil,
            dauerauftraege: {
                monatlich: 0,
                januar: 0, februar: 0, maerz: 0, april: 0, mai: 0, juni: 0,
                juli: 0, august: 0, september: 0, oktober: 0, november: 0, dezember: 0
            }
        };
        
        thema.mitglieder = thema.mitglieder || [];
        thema.mitglieder.push(newMitglied);
        
        await updateDoc(doc(haushaltszahlungenThemenRef, currentThemaId), {
            mitglieder: thema.mitglieder
        });
        
        document.getElementById('hz-add-mitglied-modal').style.display = 'none';
        renderMitgliederListe();
        renderKostenaufteilung();
        renderDashboard();
        alertUser('Mitglied hinzugefügt!', 'success');
    } catch (error) {
        console.error("Fehler beim Hinzufügen des Mitglieds:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
}

let currentDauerauftraegeMitglied = null;

function openDauerauftraegeModal(userId) {
    const thema = THEMEN[currentThemaId];
    if (!thema) return;
    
    const mitglied = thema.mitglieder?.find(m => m.userId === userId || m.name === userId);
    if (!mitglied) return;
    
    currentDauerauftraegeMitglied = mitglied;
    
    const content = document.getElementById('hz-dauerauftraege-content');
    if (!content) return;
    
    const intervalle = ['monatlich', 'januar', 'februar', 'maerz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
    
    content.innerHTML = `
        <p class="font-bold text-gray-700 mb-3">Daueraufträge für: ${mitglied.name}</p>
        ${intervalle.map(intervall => `
            <div class="flex items-center gap-3">
                <span class="w-24 text-sm font-medium text-gray-600">${INTERVALL_CONFIG[intervall]?.label || intervall}</span>
                <input type="number" step="0.01" min="0" value="${mitglied.dauerauftraege?.[intervall] || 0}" 
                    data-intervall="${intervall}"
                    class="hz-dauerauftrag-input flex-1 p-2 border-2 border-gray-300 rounded-lg text-right font-bold">
                <span class="text-gray-500">€</span>
            </div>
        `).join('')}
    `;
    
    document.getElementById('hz-dauerauftraege-modal').style.display = 'flex';
    loadProtokoll(userId);
}

async function saveDauerauftraege() {
    if (!currentDauerauftraegeMitglied) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema) return;
    
    const inputs = document.querySelectorAll('.hz-dauerauftrag-input');
    const newDauerauftraege = {};
    const changes = [];
    
    inputs.forEach(input => {
        const intervall = input.dataset.intervall;
        const newValue = parseFloat(input.value) || 0;
        const oldValue = currentDauerauftraegeMitglied.dauerauftraege?.[intervall] || 0;
        
        newDauerauftraege[intervall] = newValue;
        
        if (newValue !== oldValue) {
            changes.push({
                intervall,
                oldValue,
                newValue,
                timestamp: new Date().toISOString(),
                user: currentUser.displayName
            });
        }
    });
    
    try {
        // Update Mitglied
        const mitgliedIndex = thema.mitglieder.findIndex(m => m.name === currentDauerauftraegeMitglied.name);
        if (mitgliedIndex >= 0) {
            thema.mitglieder[mitgliedIndex].dauerauftraege = newDauerauftraege;
            
            await updateDoc(doc(haushaltszahlungenThemenRef, currentThemaId), {
                mitglieder: thema.mitglieder
            });
            
            // Protokoll speichern
            if (changes.length > 0) {
                await addDoc(haushaltszahlungenProtokollRef, {
                    themaId: currentThemaId,
                    mitgliedName: currentDauerauftraegeMitglied.name,
                    changes,
                    timestamp: serverTimestamp(),
                    changedBy: currentUser.displayName
                });
            }
        }
        
        document.getElementById('hz-dauerauftraege-modal').style.display = 'none';
        renderDashboard();
        alertUser('Daueraufträge gespeichert!', 'success');
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
}

async function loadProtokoll(userId) {
    const container = document.getElementById('hz-protokoll-liste');
    if (!container) return;
    
    try {
        const q = query(
            haushaltszahlungenProtokollRef,
            orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        
        const protokolle = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.themaId === currentThemaId && data.mitgliedName === userId) {
                protokolle.push(data);
            }
        });
        
        if (protokolle.length === 0) {
            container.innerHTML = '<p class="text-gray-500 italic">Keine Änderungen protokolliert</p>';
            return;
        }
        
        container.innerHTML = protokolle.slice(0, 20).map(p => `
            <div class="p-2 bg-gray-50 rounded">
                <p class="font-bold text-gray-700">${formatDate(p.timestamp?.toDate?.() || p.timestamp)} - ${p.changedBy}</p>
                ${p.changes.map(c => `
                    <p class="text-gray-600">${INTERVALL_CONFIG[c.intervall]?.label}: ${formatCurrency(c.oldValue)} → ${formatCurrency(c.newValue)}</p>
                `).join('')}
            </div>
        `).join('');
    } catch (error) {
        console.error("Fehler beim Laden des Protokolls:", error);
    }
}

function toggleProtokoll() {
    const container = document.getElementById('hz-dauerauftraege-protokoll');
    if (container) {
        container.classList.toggle('hidden');
    }
}

async function saveSettings() {
    // Speichere Thema-Änderungen
    const thema = THEMEN[currentThemaId];
    if (thema) {
        try {
            await updateDoc(doc(haushaltszahlungenThemenRef, currentThemaId), {
                mitglieder: thema.mitglieder
            });
            alertUser('Einstellungen gespeichert!', 'success');
            document.getElementById('haushaltszahlungenSettingsModal').style.display = 'none';
            renderDashboard();
        } catch (error) {
            console.error("Fehler beim Speichern:", error);
            alertUser('Fehler: ' + error.message, 'error');
        }
    }
}

// Globale Funktionen für Einstellungen
window.deleteThema = async function(themaId) {
    if (!confirm('Möchtest du dieses Thema wirklich löschen? Alle Einträge werden gelöscht!')) return;
    
    try {
        await deleteDoc(doc(haushaltszahlungenThemenRef, themaId));
        delete THEMEN[themaId];
        
        if (currentThemaId === themaId) {
            currentThemaId = Object.keys(THEMEN)[0] || null;
            localStorage.setItem('hz_current_thema', currentThemaId);
            updateCollectionForThema();
        }
        
        renderThemenListe();
        renderThemenDropdown();
        alertUser('Thema gelöscht!', 'success');
    } catch (error) {
        console.error("Fehler beim Löschen:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
};

window.removeMitglied = async function(index) {
    if (!confirm('Möchtest du dieses Mitglied wirklich entfernen?')) return;
    
    const thema = THEMEN[currentThemaId];
    if (!thema) return;
    
    try {
        thema.mitglieder.splice(index, 1);
        await updateDoc(doc(haushaltszahlungenThemenRef, currentThemaId), {
            mitglieder: thema.mitglieder
        });
        
        renderMitgliederListe();
        renderKostenaufteilung();
        renderDashboard();
        alertUser('Mitglied entfernt!', 'success');
    } catch (error) {
        console.error("Fehler:", error);
        alertUser('Fehler: ' + error.message, 'error');
    }
};

window.updateMitgliedAnteil = async function(index, value) {
    const thema = THEMEN[currentThemaId];
    if (!thema || !thema.mitglieder[index]) return;
    
    thema.mitglieder[index].anteil = parseInt(value) || 0;
    renderKostenaufteilung();
};

window.openDauerauftraegeModal = openDauerauftraegeModal;

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
