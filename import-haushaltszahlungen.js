/**
 * EINMALIGES IMPORT-SCRIPT FÜR HAUSHALTSZAHLUNGEN
 * 
 * ANLEITUNG:
 * 1. Öffne die App im Browser und logge dich ein
 * 2. Öffne die Browser-Konsole (F12 -> Console)
 * 3. Kopiere den gesamten Inhalt dieser Datei
 * 4. Füge ihn in die Konsole ein und drücke Enter
 * 5. Warte bis "IMPORT ABGESCHLOSSEN" erscheint
 * 
 * ACHTUNG: Nur EINMAL ausführen!
 */

(async function importHaushaltszahlungen() {
    console.log("🚀 Starte Import der Haushaltszahlungen...");
    
    // Firebase Referenzen aus dem globalen Scope holen
    const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
    
    // db sollte global verfügbar sein
    if (typeof db === 'undefined') {
        console.error("❌ FEHLER: Firebase db nicht gefunden! Bist du in der App eingeloggt?");
        return;
    }
    
    const haushaltszahlungenCollection = collection(db, 'artifacts/20LVob88b3ovXRUyX3ra/public/data/haushaltszahlungen');
    
    // Hilfsfunktion: Excel-Seriennummer zu ISO-Datum
    function excelToDate(serial) {
        if (!serial || serial === '-' || serial === 'X' || isNaN(serial)) return null;
        const num = parseInt(serial);
        if (num > 70000) return '2099-12-31'; // Quasi "unbegrenzt"
        const utc_days = Math.floor(num - 25569);
        const date = new Date(utc_days * 86400 * 1000);
        return date.toISOString().split('T')[0];
    }
    
    // Hilfsfunktion: Betrag parsen
    function parseBetrag(str) {
        if (!str || str === '-' || str === 'X') return 0;
        const cleaned = str.toString().replace(',', '.').replace(/[^\d.-]/g, '');
        return parseFloat(cleaned) || 0;
    }
    
    // Die Daten aus deinem Excel
    const rawData = [
        { zweck: "Internetvertrag", organisation: "Kabelplus", ab: 44782, bis: 45322, betrag: 39.53, kundennr: "463959", vertragsnr: "1444920", anteilMarkus: 50 },
        { zweck: "Wärme & Warmwasser", organisation: "EVN", ab: 45069, bis: 45535, betrag: 105, kundennr: "12685885", vertragsnr: "30460653", anteilMarkus: 50 },
        { zweck: "Strom", organisation: "Wien Energie", ab: 44996, bis: 45235, betrag: 33.6, kundennr: "1202644097", vertragsnr: "220005437211", anteilMarkus: 50 },
        { zweck: "Miete", organisation: "NÖSTA", ab: 45047, bis: 45291, betrag: 788.93, kundennr: "232373+232374", vertragsnr: "232375", anteilMarkus: 50 },
        { zweck: "Haushaltsversicherung", organisation: "Helvetia", ab: 44782, bis: 45169, betrag: 16.83, kundennr: "4002234222", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Unfallversicherung Jasmin", organisation: "Helvetia", ab: 45017, bis: 45382, betrag: 21.56, kundennr: "Polizennummer: 4002233658", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Unfallversicherung Markus", organisation: "Helvetia", ab: 45017, bis: 45382, betrag: 21.56, kundennr: "Polizennummer: 4002234220", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "HP Instant Ink", organisation: "Instant Ink", ab: 45097, bis: 45318, betrag: 0.99, kundennr: "6756819881", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Rechtschutz", organisation: "ARAG", ab: 45019, bis: 45351, betrag: 167.73, kundennr: "", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Netflix", organisation: "Netflix", ab: 45110, bis: 45583, betrag: 9.33, kundennr: "", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Internet Servicepauschale", organisation: "Kabelplus", ab: 44782, bis: 45556, betrag: 21, kundennr: "463959", vertragsnr: "1444920", anteilMarkus: 50 },
        { zweck: "Wärme & Warmwasser", organisation: "EVN", ab: 44782, bis: 45068, betrag: 139, kundennr: "12685885", vertragsnr: "30460653", anteilMarkus: 50 },
        { zweck: "Strom", organisation: "Wien Energie", ab: 44782, bis: 44995, betrag: 111.6, kundennr: "1202644097", vertragsnr: "220005437211", anteilMarkus: 50 },
        { zweck: "Miete", organisation: "NÖSTA", ab: 44782, bis: 44926, betrag: 731.29, kundennr: "232373+232374", vertragsnr: "232375", anteilMarkus: 50 },
        { zweck: "Miete", organisation: "NÖSTA", ab: 44927, bis: 45046, betrag: 785.91, kundennr: "232373+232374", vertragsnr: "232375", anteilMarkus: 50 },
        { zweck: "Unfallversicherung Jasmin", organisation: "Helvetia", ab: 44652, bis: 45016, betrag: 19.58, kundennr: "Polizennummer: 4002233658", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Unfallversicherung Markus", organisation: "Helvetia", ab: 44652, bis: 45016, betrag: 19.58, kundennr: "Polizennummer: 4002234220", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Rechtschutz", organisation: "ARAG", ab: 44664, bis: 45018, betrag: 160.93, kundennr: "", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Haushalt", organisation: "Taborgasse 2/2/2", ab: 44782, bis: 45504, betrag: 600, kundennr: "Markus & Jasmin", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Haushaltsversicherung", organisation: "Helvetia", ab: 45170, bis: 45535, betrag: 17.99, kundennr: "4002234222", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Strom", organisation: "Wien Energie", ab: 45236, bis: 45554, betrag: 61.2, kundennr: "1202644097", vertragsnr: "220005437211", anteilMarkus: 50 },
        { zweck: "Haushaltsabgabe ORF", organisation: "ORF-Gebühren (ehem. GIS)", ab: 45292, bis: 73051, betrag: 30.6, kundennr: "Beitragsnummer: 1011405761", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Miete", organisation: "NÖSTA", ab: 45292, bis: 45412, betrag: 800.33, kundennr: "232373+232374", vertragsnr: "232375", anteilMarkus: 50 },
        { zweck: "HP Instant Ink", organisation: "Instant Ink", ab: 45319, bis: 45777, betrag: 1.49, kundennr: "6756819881", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Youtube Premium", organisation: "Google", ab: 45318, bis: 73051, betrag: 4.8, kundennr: "markus.zika@gmail.com", vertragsnr: "", anteilMarkus: 60 },
        { zweck: "Internetvertrag", organisation: "Kabelplus", ab: 45323, bis: 45556, betrag: 40.23, kundennr: "463959", vertragsnr: "1444920", anteilMarkus: 50 },
        { zweck: "Rechtschutz", organisation: "ARAG", ab: 45352, bis: 73051, betrag: 184.75, kundennr: "", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Unfallversicherung Jasmin", organisation: "Helvetia", ab: 45383, bis: 73051, betrag: 22.78, kundennr: "Polizennummer: 4002233658", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Unfallversicherung Markus", organisation: "Helvetia", ab: 45383, bis: 45747, betrag: 22.78, kundennr: "Polizennummer: 4002234220", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Miete", organisation: "NÖSTA", ab: 45413, bis: 45657, betrag: 805.82, kundennr: "232373+232374", vertragsnr: "232375", anteilMarkus: 50 },
        { zweck: "Haushaltsversicherung", organisation: "Generali", ab: 45901, bis: 73051, betrag: 18.22, kundennr: "Antrag ID: 876610224512", vertragsnr: "GP-NR: 602868", anteilMarkus: 50 },
        { zweck: "Haushalt", organisation: "Taborgasse 2/2/2", ab: 45505, bis: 73051, betrag: 750, kundennr: "Markus & Jasmin", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Wärme & Warmwasser", organisation: "EVN", ab: 45536, bis: 73051, betrag: 136, kundennr: "12685885", vertragsnr: "30460653", anteilMarkus: 50, vormerk: "Anpassung nach Rechnungserhalt (Nr. 6102043837)" },
        { zweck: "Haushaltsversicherung", organisation: "Helvetia", ab: 45536, bis: 45900, betrag: 18.46, kundennr: "4002234222", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Strom", organisation: "E.ON", ab: 45566, bis: 45919, betrag: 26, kundennr: "9620006916", vertragsnr: "162000017901", anteilMarkus: 50 },
        { zweck: "IFTTT Pro+", organisation: "IFTTT", ab: 45179, bis: 73051, betrag: 55.2, kundennr: "markus.zika@gmail.com", vertragsnr: "", anteilMarkus: 50, intervall: ["januar"] },
        { zweck: "Internetvertrag", organisation: "A1", ab: 45547, bis: 45911, betrag: 0, kundennr: "111044422", vertragsnr: "383162958/1", anteilMarkus: 50, vormerk: "Erstes Jahr gratis" },
        { zweck: "Internetvertrag", organisation: "A1", ab: 45912, bis: 73051, betrag: 57.9, kundennr: "111044422", vertragsnr: "383162958/1", anteilMarkus: 50 },
        { zweck: "TV", organisation: "A1", ab: 45547, bis: 45911, betrag: 0, kundennr: "111044422", vertragsnr: "383162958/1", anteilMarkus: 50, vormerk: "Erstes Jahr gratis" },
        { zweck: "TV", organisation: "A1", ab: 45912, bis: 73051, betrag: 2, kundennr: "111044422", vertragsnr: "383162958/1", anteilMarkus: 50 },
        { zweck: "Netflix", organisation: "Netflix", ab: 45584, bis: 73051, betrag: 9.99, kundennr: "", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Miete", organisation: "NÖSTA", ab: 45658, bis: 45777, betrag: 821.51, kundennr: "232373+232374", vertragsnr: "232375", anteilMarkus: 50 },
        { zweck: "HP Instant Ink", organisation: "Instant Ink", ab: 45778, bis: 73051, betrag: 1.79, kundennr: "6756819881", vertragsnr: "", anteilMarkus: 50 },
        { zweck: "Miete", organisation: "NÖSTA", ab: 45778, bis: 73051, betrag: 822.7, kundennr: "232373+232374", vertragsnr: "232375", anteilMarkus: 50 },
        { zweck: "Strom", organisation: "Grünwelt Energie", ab: 45920, bis: 73051, betrag: 0, kundennr: "", vertragsnr: "", anteilMarkus: 50, vormerk: "Betrag prüfen" },
        { zweck: "Treibstoff", organisation: "div. Tankstellen", ab: 45870, bis: 73051, betrag: 106.67, kundennr: "", vertragsnr: "", anteilMarkus: 50, vormerk: "Pauschalbetrag. Geschätzte Jahressumme: 1.280 für Jasmin & Markus" },
    ];
    
    let erfolg = 0;
    let fehler = 0;
    
    for (const row of rawData) {
        try {
            const eintrag = {
                zweck: row.zweck,
                organisation: row.organisation,
                betrag: row.betrag,
                intervall: row.intervall || ["monatlich"], // Standard: monatlich
                gueltigAb: excelToDate(row.ab),
                gueltigBis: excelToDate(row.bis),
                anteilMarkus: row.anteilMarkus,
                kundennummer: row.kundennr || "",
                vertragsnummer: row.vertragsnr || "",
                vormerk: row.vormerk || "",
                erinnerung: null,
                erstelltAm: new Date().toISOString(),
                aktualisiertAm: new Date().toISOString()
            };
            
            await addDoc(haushaltszahlungenCollection, eintrag);
            erfolg++;
            console.log(`✅ ${erfolg}. ${row.zweck} (${row.organisation})`);
        } catch (err) {
            fehler++;
            console.error(`❌ Fehler bei ${row.zweck}:`, err);
        }
    }
    
    console.log("═══════════════════════════════════════════");
    console.log(`🎉 IMPORT ABGESCHLOSSEN!`);
    console.log(`✅ Erfolgreich: ${erfolg}`);
    console.log(`❌ Fehler: ${fehler}`);
    console.log("═══════════════════════════════════════════");
    console.log("Lade die Seite neu (F5), um die Einträge zu sehen.");
})();
