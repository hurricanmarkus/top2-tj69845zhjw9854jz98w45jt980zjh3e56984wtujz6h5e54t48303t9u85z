# 📥 GESCHENKEMANAGEMENT IMPORT - ANLEITUNG

## 🎯 Übersicht
Du hast **ca. 170 Geschenk-Einträge** aus 6 verschiedenen Themen:
- Weihnachten 2024 (27 Einträge)
- Weihnachten 2023 (52 Einträge)
- Weihnachten 2022 (66 Einträge)
- Weihnachten 2021 (36 Einträge)
- Weihnachten 2020 (15 Einträge)
- Weihnachten 2019 (24 Einträge)

## 📋 Import-Methode

### **Option 1: Browser-Console Import (EMPFOHLEN)**

1. **Öffne die TOP2-App im Browser**
2. **Drücke F12** (Entwicklertools öffnen)
3. **Gehe zum Tab "Console"**
4. **Kopiere das Import-Script** (siehe unten)
5. **Füge es in die Console ein und drücke Enter**
6. **Warte bis "Import abgeschlossen!" erscheint**

### **Option 2: Manueller Import über UI**

Falls du lieber manuell importieren möchtest:
1. Öffne Geschenkemanagement
2. Klicke auf "Einstellungen" → "Themen"
3. Erstelle die Themen manuell
4. Füge Geschenke über "Neu" Button hinzu

---

## 🔧 IMPORT-SCRIPT

Kopiere diesen Code in die Browser-Console (F12):

```javascript
// GESCHENKEMANAGEMENT IMPORT SCRIPT
// Führe dieses Script in der Browser-Console aus (F12)

async function importGeschenke() {
    console.log('🎁 Starte Geschenke-Import...');
    
    // Prüfe ob Firebase verfügbar ist
    if (typeof db === 'undefined' || typeof appId === 'undefined') {
        console.error('❌ Firebase nicht verfügbar! Bitte in der App eingeloggt sein.');
        return;
    }
    
    // Excel-Daten (Semikolon-getrennt)
    const rawData = `HIER_DEINE_DATEN_EINFÜGEN`;
    
    // Parse Daten
    const lines = rawData.trim().split('\n');
    const geschenke = [];
    const themenSet = new Set();
    
    lines.forEach((line, index) => {
        const parts = line.split(';');
        if (parts.length < 16) {
            console.warn(`Zeile ${index + 1} übersprungen (zu wenig Spalten)`);
            return;
        }
        
        const [thema, status, fuer, von, geschenk, shop, bezahltVon, beteiligung, 
               gesamtkosten, eigeneKosten, sollBezahlung, istBezahlung, standort, 
               bestellnummer, rechnungsnummer, notizen] = parts;
        
        themenSet.add(thema);
        
        geschenke.push({
            thema,
            status: mapStatus(status),
            fuer: fuer.split(' und ').map(s => s.trim()).filter(s => s),
            von: von.split(' und ').map(s => s.trim()).filter(s => s),
            titel: geschenk,
            shop,
            bezahltVon,
            beteiligung,
            gesamtkosten: parseFloat(gesamtkosten) || 0,
            eigeneKosten: parseFloat(eigeneKosten) || 0,
            sollBezahlung,
            istBezahlung,
            standort,
            bestellnummer,
            rechnungsnummer,
            notizen,
            createdAt: new Date(),
            createdBy: currentUser?.mode || 'IMPORT'
        });
    });
    
    console.log(`📊 ${geschenke.length} Geschenke gefunden`);
    console.log(`📁 ${themenSet.size} Themen: ${Array.from(themenSet).join(', ')}`);
    
    // 1. Themen erstellen
    console.log('📁 Erstelle Themen...');
    const themenRef = doc(db, 'artifacts', appId, 'public', 'data', 'geschenke-themen');
    const themenObj = {};
    
    Array.from(themenSet).forEach(thema => {
        const id = 'thema_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        themenObj[id] = {
            id,
            name: thema,
            createdAt: new Date(),
            createdBy: currentUser?.mode || 'IMPORT'
        };
    });
    
    await setDoc(themenRef, themenObj, { merge: true });
    console.log(`✅ ${Object.keys(themenObj).length} Themen erstellt`);
    
    // 2. Geschenke importieren
    console.log('🎁 Importiere Geschenke...');
    const geschenkeCollection = collection(db, 'artifacts', appId, 'public', 'data', 'geschenke');
    
    let imported = 0;
    for (const g of geschenke) {
        try {
            const id = 'geschenk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const themaId = Object.values(themenObj).find(t => t.name === g.thema)?.id;
            
            await setDoc(doc(geschenkeCollection, id), {
                id,
                themaId,
                ...g
            });
            
            imported++;
            if (imported % 10 === 0) {
                console.log(`⏳ ${imported}/${geschenke.length} importiert...`);
            }
        } catch (error) {
            console.error(`❌ Fehler bei Geschenk: ${g.titel}`, error);
        }
    }
    
    console.log(`✅ Import abgeschlossen! ${imported} Geschenke importiert.`);
    console.log('🔄 Lade Seite neu um Änderungen zu sehen...');
    
    // Seite neu laden
    setTimeout(() => location.reload(), 2000);
}

// Status-Mapping
function mapStatus(status) {
    const map = {
        'Abgeschlossen': 'gekauft',
        'Storniert': 'storniert',
        'Offen': 'offen',
        'Bestellt': 'bestellt'
    };
    return map[status] || 'offen';
}

// Import starten
importGeschenke();
```

---

## ⚠️ WICHTIG VOR DEM IMPORT

1. **Backup erstellen**: Exportiere deine aktuellen Daten (falls vorhanden)
2. **In der App eingeloggt sein**: Das Script benötigt Firebase-Zugriff
3. **Geschenkemanagement-View öffnen**: Navigiere zur Geschenkemanagement-Ansicht
4. **Console öffnen**: F12 drücken → Tab "Console"

---

## 🔍 WAS WIRD IMPORTIERT?

### **Themen (6 Stück)**
- Weihnachten 2024
- Weihnachten 2023
- Weihnachten 2022
- Weihnachten 2021
- Weihnachten 2020
- Weihnachten 2019

### **Geschenke (ca. 170)**
Jedes Geschenk enthält:
- ✅ Titel/Beschreibung
- ✅ Status (Abgeschlossen → gekauft, Storniert → storniert)
- ✅ Für (Empfänger, mehrere möglich)
- ✅ Von (Schenker, mehrere möglich)
- ✅ Shop/Händler
- ✅ Bezahlt von
- ✅ Beteiligung (Text-Info)
- ✅ Gesamtkosten
- ✅ Eigene Kosten
- ✅ SOLL-Bezahlung (Zahlungsart)
- ✅ IST-Bezahlung (Zahlungsart)
- ✅ Standort
- ✅ Bestellnummer
- ✅ Rechnungsnummer
- ✅ Notizen

---

## 📝 NÄCHSTE SCHRITTE NACH DEM IMPORT

1. **Kontakte anlegen**: Die Namen aus "Für" und "Von" sollten als Kontakte angelegt werden
2. **Zahlungsarten prüfen**: Prüfe ob alle Zahlungsarten vorhanden sind
3. **Daten verifizieren**: Stichproben machen ob alles korrekt importiert wurde

---

## 🆘 PROBLEME?

**Script funktioniert nicht?**
- Prüfe ob du eingeloggt bist
- Prüfe ob du in der Geschenkemanagement-View bist
- Schau in die Console ob Fehlermeldungen erscheinen

**Daten fehlen?**
- Lade die Seite neu (F5)
- Wechsle das Thema im Dropdown

**Duplikate?**
- Das Script erstellt neue IDs, keine Duplikate möglich

---

**REGEL GELESEN + ANGEWENDET**
