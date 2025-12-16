// ========================================
// NEUE FUNKTIONEN FÜR GESCHENKEVERWALTUNG
// Smart-Suggest, erweiterte Suche, Sortierung
// ========================================

// Smart-Suggest System (wie Zahlungsverwaltung)
function updateGeschenkeSuggestions(term) {
    const box = document.getElementById('gm-search-suggestions-box');
    const list = document.getElementById('gm-search-suggestions-list');
    
    if (!term || !term.trim()) {
        box?.classList.add('hidden');
        return;
    }

    const lowerTerm = term.toLowerCase().trim();
    list.innerHTML = '';
    let hasHits = false;

    const addSuggestion = (label, icon, filterType, subtext = "") => {
        hasHits = true;
        const li = document.createElement('li');
        li.className = "px-3 py-2 hover:bg-pink-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-center gap-2";
        li.innerHTML = `
            <span class="text-lg">${icon}</span>
            <div class="flex-grow leading-tight">
                <span class="font-bold text-gray-800 block">${label}</span>
                ${subtext ? `<span class="text-xs text-gray-500">${subtext}</span>` : ''}
            </div>
        `;
        li.onclick = () => addGeschenkeSearchFilter(filterType, lowerTerm, label);
        list.appendChild(li);
    };

    const geschenkeArray = Object.values(GESCHENKE);

    // 1. Status
    const hasStatus = geschenkeArray.some(g => 
        g.status?.toLowerCase().includes(lowerTerm) ||
        STATUS_CONFIG[g.status]?.label?.toLowerCase().includes(lowerTerm)
    );
    if (hasStatus) addSuggestion(`Status: ${term}`, "📊", "status", "Suche in Status");

    // 2. Für (Personen)
    const hasFuer = geschenkeArray.some(g => 
        g.fuer && Array.isArray(g.fuer) && g.fuer.some(id => 
            KONTAKTE[id]?.name?.toLowerCase().includes(lowerTerm)
        )
    );
    if (hasFuer) addSuggestion(`Für: ${term}`, "🎁", "fuer", "Suche in Empfänger");

    // 3. Von (Personen)
    const hasVon = geschenkeArray.some(g => 
        g.von && Array.isArray(g.von) && g.von.some(id => 
            KONTAKTE[id]?.name?.toLowerCase().includes(lowerTerm)
        )
    );
    if (hasVon) addSuggestion(`Von: ${term}`, "👤", "von", "Suche in Schenker");

    // 4. Geschenk (Name/Titel)
    const hasGeschenk = geschenkeArray.some(g => 
        g.geschenk?.toLowerCase().includes(lowerTerm)
    );
    if (hasGeschenk) addSuggestion(`Geschenk: ${term}`, "🎀", "geschenk", "Suche in Geschenk-Name");

    // 5. Shop
    const hasShop = geschenkeArray.some(g => 
        g.shop?.toLowerCase().includes(lowerTerm)
    );
    if (hasShop) addSuggestion(`Shop: ${term}`, "🏪", "shop", "Suche in Shop");

    // 6. Bezahlt von
    const hasBezahltVon = geschenkeArray.some(g => 
        g.bezahltVon && Array.isArray(g.bezahltVon) && g.bezahltVon.some(id => 
            KONTAKTE[id]?.name?.toLowerCase().includes(lowerTerm)
        )
    );
    if (hasBezahltVon) addSuggestion(`Bezahlt von: ${term}`, "💰", "bezahltVon", "Suche in Zahler");

    // 7. Beteiligung
    const hasBeteiligung = geschenkeArray.some(g => 
        g.beteiligung && Array.isArray(g.beteiligung) && g.beteiligung.some(b => 
            KONTAKTE[b.personId]?.name?.toLowerCase().includes(lowerTerm)
        )
    );
    if (hasBeteiligung) addSuggestion(`Beteiligung: ${term}`, "🤝", "beteiligung", "Suche in Beteiligten");

    // 8. Gesamtkosten
    const hasGesamtkosten = geschenkeArray.some(g => {
        const kosten = parseFloat(g.gesamtkosten || 0).toFixed(2);
        return kosten.includes(lowerTerm);
    });
    if (hasGesamtkosten) addSuggestion(`Gesamtkosten: ${term}`, "💶", "gesamtkosten", "Suche in Gesamtkosten");

    // 9. Eigene Kosten
    const hasEigeneKosten = geschenkeArray.some(g => {
        const kosten = parseFloat(g.eigeneKosten || 0).toFixed(2);
        return kosten.includes(lowerTerm);
    });
    if (hasEigeneKosten) addSuggestion(`Eigene Kosten: ${term}`, "💵", "eigeneKosten", "Suche in eigenen Kosten");

    // 10. Bestellnummer
    const hasBestellnummer = geschenkeArray.some(g => 
        g.bestellnummer?.toLowerCase().includes(lowerTerm)
    );
    if (hasBestellnummer) addSuggestion(`Bestellnr: ${term}`, "#️⃣", "bestellnummer", "Suche in Bestellnummern");

    // 11. Rechnungsnummer
    const hasRechnungsnummer = geschenkeArray.some(g => 
        g.rechnungsnummer?.toLowerCase().includes(lowerTerm)
    );
    if (hasRechnungsnummer) addSuggestion(`Rechnungsnr: ${term}`, "📄", "rechnungsnummer", "Suche in Rechnungsnummern");

    // 12. Notizen
    const hasNotizen = geschenkeArray.some(g => 
        g.notizen?.toLowerCase().includes(lowerTerm)
    );
    if (hasNotizen) addSuggestion(`Notizen: ${term}`, "📝", "notizen", "Suche in Notizen");

    // 13. Soll-Konto
    const hasSollKonto = geschenkeArray.some(g => 
        ZAHLUNGSARTEN[g.sollBezahlung]?.label?.toLowerCase().includes(lowerTerm)
    );
    if (hasSollKonto) addSuggestion(`Soll-Konto: ${term}`, "🏦", "sollkonto", "Suche in Soll-Konten");

    // 14. Ist-Konto
    const hasIstKonto = geschenkeArray.some(g => 
        ZAHLUNGSARTEN[g.istBezahlung]?.label?.toLowerCase().includes(lowerTerm)
    );
    if (hasIstKonto) addSuggestion(`Ist-Konto: ${term}`, "💳", "istkonto", "Suche in Ist-Konten");

    // 15. Standort
    const hasStandort = geschenkeArray.some(g => 
        g.standort?.toLowerCase().includes(lowerTerm)
    );
    if (hasStandort) addSuggestion(`Standort: ${term}`, "📍", "standort", "Suche in Standorten");

    // Fallback: Volltextsuche
    addSuggestion(`Alles: "${term}"`, "🔍", "all", "Volltextsuche überall");

    if (hasHits) box?.classList.remove('hidden');
    else box?.classList.add('hidden');
}

// Filter hinzufügen (mit NICHT-Checkbox)
function addGeschenkeSearchFilter(filterType, term, label) {
    const negateCheckbox = document.getElementById('filter-negate-checkbox');
    const negate = negateCheckbox?.checked || false;

    // Filter hinzufügen
    activeFilters.push({
        category: filterType,
        value: term,
        negate: negate,
        label: label,
        id: Date.now()
    });

    // Input zurücksetzen
    const searchInput = document.getElementById('search-geschenke');
    if (searchInput) searchInput.value = '';
    if (negateCheckbox) negateCheckbox.checked = false;

    // Suggestion-Box verstecken
    document.getElementById('gm-search-suggestions-box')?.classList.add('hidden');

    // UI aktualisieren
    renderActiveFilters();
    renderGeschenkeTabelle();
}

// Sortierung für Spalten
function sortGeschenkeBy(key) {
    if (sortState.key === key) {
        // Toggle direction
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.key = key;
        sortState.direction = 'asc';
    }

    // Sortier-Indikatoren aktualisieren
    updateSortIndicators();

    // Tabelle neu rendern
    renderGeschenkeTabelle();

    // Sortierung in Firebase speichern
    saveUiSettings();
}

// Sortier-Indikatoren aktualisieren
function updateSortIndicators() {
    // Alle Indikatoren entfernen
    document.querySelectorAll('[data-sort-key]').forEach(th => {
        const indicator = th.querySelector('.sort-indicator');
        if (indicator) indicator.remove();
    });

    // Aktuellen Indikator hinzufügen
    if (sortState.key) {
        const th = document.querySelector(`[data-sort-key="${sortState.key}"]`);
        if (th) {
            const indicator = document.createElement('span');
            indicator.className = 'sort-indicator ml-1';
            indicator.textContent = sortState.direction === 'asc' ? '▲' : '▼';
            th.appendChild(indicator);
        }
    }
}

// UI-Einstellungen in Firebase speichern
async function saveUiSettings() {
    if (!geschenkeUiSettingsRef) {
        console.warn('⚠️ geschenkeUiSettingsRef nicht verfügbar');
        return;
    }

    try {
        await setDoc(geschenkeUiSettingsRef, { sortState }, { merge: true });
        console.log('✅ UI-Einstellungen gespeichert:', sortState);
    } catch (e) {
        console.error('❌ Fehler beim Speichern der UI-Einstellungen:', e);
    }
}

// UI-Einstellungen aus Firebase laden
async function loadUiSettings() {
    if (!geschenkeUiSettingsRef) {
        console.warn('⚠️ geschenkeUiSettingsRef nicht verfügbar');
        return;
    }

    try {
        const doc = await getDoc(geschenkeUiSettingsRef);
        if (doc.exists()) {
            const data = doc.data();
            if (data.sortState) {
                sortState = data.sortState;
                updateSortIndicators();
                console.log('✅ UI-Einstellungen geladen:', sortState);
            }
        }
    } catch (e) {
        console.error('❌ Fehler beim Laden der UI-Einstellungen:', e);
    }
}
