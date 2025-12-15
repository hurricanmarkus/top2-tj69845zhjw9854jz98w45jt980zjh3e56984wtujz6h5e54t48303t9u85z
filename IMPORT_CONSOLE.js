// ========================================
// GESCHENKE IMPORT - DIREKT IN DER APP
// ========================================
// ANLEITUNG:
// 1. Öffne TOP2-App und gehe zum Geschenkemanagement
// 2. Drücke F12 → Console
// 3. Kopiere dieses KOMPLETTE Script
// 4. Füge es in die Console ein → Enter
// 5. Das Script startet automatisch
// ========================================

(async function() {
    console.log('🎁 === GESCHENKE IMPORT START ===');
    
    // Prüfe ob wir in der App sind
    if (typeof db === 'undefined' || typeof currentUser === 'undefined') {
        console.error('❌ Bitte in der TOP2-App ausführen (Geschenkemanagement öffnen)!');
        return;
    }
    
    const userId = currentUser.mode;
    const APP_ID = '20LVob88b3ovXRUyX3ra';
    
    console.log('👤 User:', userId);
    
    // DEINE EXCEL-DATEN HIER EINFÜGEN
    const DATEN = `Weihnachten 2024;Abgeschlossen;Regina Mokricky;Haushaltskonto;Dinner & Crime: Kurschatten;crime-club.at;Haushaltskonto;Jasmin Mokricky (50%);92,6;46,3;Kreditkarte;Kreditkarte;zu Hause;CC-10368;;Casino Baden
Weihnachten 2024;Abgeschlossen;Ö3 Weihnachtswunder;Markus Zika;Ö3 Weihnachtswunder - Licht ins Dunkle - Geldspende;Ö3 Call;Markus Zika;;15;15;Konto-Weihnachten;Konto-Weihnachten;;;;
Weihnachten 2024;Abgeschlossen;ALLE;Markus Zika;ADV. GAMES Akte Gloo;Müller Oeynhausen;Markus Zika;;9,99;9,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;706385;;
Weihnachten 2024;Abgeschlossen;ALLE;Markus Zika;IQ Stixx Smart Toys;Müller Oeynhausen;Markus Zika;;13,99;13,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;706385;;
Weihnachten 2024;Abgeschlossen;Michael Mokricky;Haushaltskonto;Dinner & Crime: Kurschatten;crime-club.at;Haushaltskonto;Jasmin Mokricky (50%);92,6;46,3;Kreditkarte;Kreditkarte;zu Hause;CC-10368;;Casino Baden
Weihnachten 2024;Abgeschlossen;Kurt Mokricky;Haushaltskonto;Dinner & Crime: Kurschatten;crime-club.at;Haushaltskonto;Jasmin Mokricky (50%);92,6;46,3;Kreditkarte;Kreditkarte;zu Hause;CC-10368;;Casino Baden
Weihnachten 2024;Storniert;Regina Mokricky;Haushaltskonto;Dinner & Crime: Kurschatten;crime-club.at;Haushaltskonto;Jasmin Mokricky (50%);92,6;46,3;Kreditkarte;Kreditkarte;zu Hause;CC-10368;;Casino Baden
Weihnachten 2024;Abgeschlossen;Jasmin Mokricky;Markus Zika;Müller Verpackungszubehör;Müller Oeynhausen;Haushaltskonto;;17,83;17,83;Konto-Weihnachten;Konto-Weihnachten;zu Hause;706385;;
Weihnachten 2024;Abgeschlossen;Jasmin Mokricky;Markus Zika;Frühstück im Wiener Riesenrad;zumriesenrad.at;Markus Zika;;149,5;149,5;Konto-Weihnachten;Konto-Weihnachten;zu Hause;CVBDLNFRX;;
Weihnachten 2024;Abgeschlossen;Alexander Zika;Haushaltskonto;SOS Affenalarm;Smyths;Haushaltskonto;Jasmin Mokricky (50%);18,99;9,5;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2024;Abgeschlossen;Alexander Zika;Haushaltskonto;Dantoy Bob mit Lenkrad;Smyths;Haushaltskonto;Jasmin Mokricky (50%);29,99;15;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2024;Abgeschlossen;Linda Bauer;Haushaltskonto;Badekugeln;Lush SCS;Haushaltskonto;Jasmin Mokricky (50%);14,45;7,23;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2024;Abgeschlossen;Jasmin Mokricky;Markus Zika;Sims 4: Lukrative Hobbyküche;gamivo.com;Markus Zika;;9,95;9,95;Konto-Weihnachten;Konto-Weihnachten;zu Hause;d92487b0-bcaa-11ef-9ebe-069f903b3844;;
Weihnachten 2024;Abgeschlossen;Jasmin Mokricky;Markus Zika;Sims 4: Werwölfe;gamivo.com;Markus Zika;;13,29;13,29;Konto-Weihnachten;Konto-Weihnachten;zu Hause;d92487b0-bcaa-11ef-9ebe-069f903b3844;;
Weihnachten 2024;Abgeschlossen;Linda Bauer;Haushaltskonto;Buch Vom Ende der Einsamkeit;Thalia onlineshop;Haushaltskonto;Jasmin Mokricky (50%);15;7,5;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;;1376098419;;
Weihnachten 2024;Abgeschlossen;Nina Bauer;Haushaltskonto;AE WISH ANEWISH Bluetooth Maus fur Mac/iPad/iPhone/PC/Computer;Christa Kirchberger;Haushaltskonto;Jasmin Mokricky (50%);13,1;6,55;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;Christa Kirchberger zu Hause;;;
Weihnachten 2024;Abgeschlossen;Nina Bauer;Haushaltskonto;JETech Hülle für iPad Pro 11 Zoll, Modelle 2022/2021/2020;Christa Kirchberger;Haushaltskonto;Jasmin Mokricky (50%);12,1;6,05;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;Christa Kirchberger zu Hause;;;
Weihnachten 2024;Abgeschlossen;Jasmin Mokricky;Markus Zika;Sims 4: Leben & Tod;gamivo.com;Markus Zika;;29,35;29,35;Konto-Weihnachten;Konto-Weihnachten;zu Hause;d92487b0-bcaa-11ef-9ebe-069f903b3844;;
Weihnachten 2024;Abgeschlossen;Christa Kirchberger;Haushaltskonto;2x Echo Dot (Neueste Generation) | Smarter WLAN- und Bluetooth-Lautsprecher mit Alexa und gigantischem, sattem Klang | Anthrazit;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);50,4;25,2;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;303-7195269-6544346;;
Weihnachten 2024;Abgeschlossen;Michael Zika und Alina Zika;Haushaltskonto;Sauna- und Thermengutschein Bad Tatzmannsdorf;AVITA;Haushaltskonto;Jasmin Mokricky (50%);102;51;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;E-Mail;377589;;
Weihnachten 2024;Abgeschlossen;Erich Zika;Haushaltskonto;Gutschein Frühstück + Therme Linsberg;Linsberg Asia Webshop;Haushaltskonto;Jasmin Mokricky (50%);81;40,5;div. Bezahlung;div. Bezahlung;zu Hause;;;
Weihnachten 2024;Abgeschlossen;Michael Zika und Alina Zika;Haushaltskonto;ASORT led taschenlampe 30000 Lumen extrem hell;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);17,23;8,62;Haushaltskonto - Giro;Haushaltskonto - Giro;zu Hause;306-0327869-0401132;;
Weihnachten 2024;Abgeschlossen;Christa Kirchberger;Haushaltskonto;ASORT led taschenlampe 30000 Lumen extrem hell;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);17,23;8,62;Haushaltskonto - Giro;Haushaltskonto - Giro;zu Hause;306-7418133-6185926;;
Weihnachten 2024;Abgeschlossen;Susanne Zika und Erich Zika;Haushaltskonto;ASORT led taschenlampe 30000 Lumen extrem hell;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);17,23;8,62;Haushaltskonto - Giro;Haushaltskonto - Giro;zu Hause;306-9998733-7532351;;
Weihnachten 2024;Abgeschlossen;Susanne Zika;Haushaltskonto;apiker für Samsung Galaxy Tab S9 FE;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);8,56;4,28;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;303-0790822-2087548;;
Weihnachten 2024;Abgeschlossen;Susanne Zika;Haushaltskonto;INFILAND Hülle für Samsung Galaxy Tab S9 FE;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);17,14;8,57;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;303-0790822-2087548;;
Weihnachten 2024;Abgeschlossen;Susanne Zika;Haushaltskonto;Samsung Galaxy Tab S9 FE Wi-Fi 128GB;electronic4you;Haushaltskonto;Jasmin Mokricky (50%);190,46;95,23;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;101173140;;Bereits abgezogen: 156,29 (Rücksendung Fire HD Tablet) + 30,25 (Rücksendung Fire HD Hülle)
Weihnachten 2023;Abgeschlossen;Linda Bauer;Haushaltskonto;Glade Extra Große Duftkerze im Glas, Geschenk, Velvet Plum & Berries, 454g;Amazon.de;Haushaltskonto;;16,2;8,1;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-2127487-7762707;;
Weihnachten 2023;Abgeschlossen;Erich Zika;Haushaltskonto;Buch Thalia "Niemand weiß, dass du hier bist";Thalia SCS;Haushaltskonto;;15;7,5;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2023;Abgeschlossen;Alina Zika;Haushaltskonto;Gutschein ebi;ebi SCS;Haushaltskonto;;10;5;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2023;Abgeschlossen;Michael Zika;Haushaltskonto;Gutschein ebi;ebi SCS;Haushaltskonto;;10;5;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2023;Abgeschlossen;Kurt Mokricky;Haushaltskonto;Gutschein el Gaucho;selbstgemacht;Haushaltskonto;Michael Mokricky (33,33%);165;110;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;Bezahlung gesamte Konsumation von Kurt.
Weihnachten 2023;Abgeschlossen;Regina Mokricky;Haushaltskonto;Gutschein el Gaucho;selbstgemacht;Markus Zika;Michael Mokricky (33,33%);165;110;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;Bezahlung gesamte Konsumation von Regina.
Weihnachten 2023;Abgeschlossen;Nina Bauer;Haushaltskonto;ICOOLIO Wasserperlen Groß fur Deko;Amazon.de;Haushaltskonto;;7,99;3,99;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-5418099-3848347;;
Weihnachten 2023;Abgeschlossen;Nina Bauer;Haushaltskonto;Aroma Diffuser, 300ML Leiser Ultraschall Luftbefeuchter Duftöl;Amazon.de;Haushaltskonto;;24,83;12,42;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-5418099-3848347;;
Weihnachten 2023;Abgeschlossen;Alexander Zika;Haushaltskonto;Auto Spielzeug ab 3 4 5 Jahre Track Cars Spielzeug für Kinder Jungen Mädchen Abenteuer Vorschule Lernspielzeug für Kleinkinder ab 3 Jahre Geschenke;Amazon.de;Haushaltskonto;;27,22;13,61;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-9638827-2126754;;
Weihnachten 2023;Abgeschlossen;Susanne Zika;Haushaltskonto;Premium Gleitbrett für den Thermomix - TM5, TM6 & TM31 - Hochwertiger Gleiter aus Premium Acrylglas;Amazon.de;Markus Zika;;33,26;16,63;Konto-Weihnachten;Konto-Weihnachten;zu Hause;302-6045388-8620356;;
Weihnachten 2023;Abgeschlossen;Karl Kirchberger;Haushaltskonto;Wein Lidl;Lidl Guntramsdorf;Markus Zika;;11,94;5,97;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2023;Abgeschlossen;Jasmin Mokricky;Markus Zika;The Sims 4 - For Rent;kinguin.net;Markus Zika;;30,55;30,55;Konto-Weihnachten;Konto-Weihnachten;E-Mail;TBA6XBZUHVT ;;
Weihnachten 2023;Abgeschlossen;Jasmin Mokricky;Markus Zika;The Sims 4 - Horse Ranch;kinguin.net;Markus Zika;;19,29;19,29;Konto-Weihnachten;Konto-Weihnachten;E-Mail;XOLJJFBWBG8;;
Weihnachten 2023;Abgeschlossen;Jasmin Mokricky;Markus Zika;The Sims 4 - My Wedding Stories;cdkeys;Markus Zika;;15,49;15,49;Konto-Weihnachten;Konto-Weihnachten;per Mail;257723387;;
Weihnachten 2023;Abgeschlossen;Jasmin Mokricky;Markus Zika;Sallys Adventskalender 2023;Sallys Shop GmbH & Co. KG;Markus Zika;;170,73;170,73;Konto-Weihnachten;Konto-Weihnachten;Susanne Zika/Erich Zika zu Hause;AU202308-77572;;
Weihnachten 2023;Abgeschlossen;Jasmin Mokricky;Markus Zika;Armband Herz Sterling Silber - rosé vergoldet;Manufaktur XELA GmbH;Markus Zika;;44,1;44,1;Konto-Weihnachten;Konto-Weihnachten;Susanne Zika/Erich Zika zu Hause;MAXE5182;;
Weihnachten 2023;Abgeschlossen;Susanne Zika;Haushaltskonto;5x Milchmädchen Kondensmilch;Kaufland Deutschland;Haushaltskonto;;12,95;6,47;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2023;Abgeschlossen;Christa Kirchberger;Haushaltskonto;7x Milchmädchen Kondensmilch;Kaufland Deutschland;Haushaltskonto;;18,13;9,07;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
"Weihnachten 2023;Abgeschlossen;Michael Mokricky;Haushaltskonto;De'Longhi Magnifica S ECAM11.112.B, Kaffeevollautomat mit Milchaufschäumdüse für Cappuccino, mit Espresso Direktwahltasten und Drehregler, 2-Tassen-Funktion, Schwarz;Amazon.de;Jasmin Mokricky;Regina Mokricky
Kurt Mokricky;252,1;50;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;304-2525876-6753137;;Jasmin Mokricky (50,00 Euro)"
Weihnachten 2023;Abgeschlossen;Karl Kirchberger;Haushaltskonto;Speck;Hofer;Haushaltskonto;;14,21;7,1;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2023;Abgeschlossen;Christa und Karl Kirchberger;Haushaltskonto;Abreisskalender;Interspar SCS;Haushaltskonto;;5,5;2,75;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2023;Abgeschlossen;Susanne Zika;Haushaltskonto;tesa Packband Handabroller ECONOMY - robuster Abroller für Paketbänder - Profi-Qualität - Für Klebebänder mit bis zu 50 cm Breite;amazon.de;Haushaltskonto;;20,72;10,36;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-8015184-8205145;;
"Weihnachten 2023;Storniert;Linda Bauer;Haushaltskonto;JanSport SuperBreak One, großer Rucksack, Schwarz;Amazon.de;Haushaltskonto;;33,3;16,65;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-5947660-4147545;;Zurückgeschickt
Erstattung ausständig"
Weihnachten 2022;Abgeschlossen;Nina Bauer;Haushaltskonto;Whispers of the Dead: (David Hunter 3);Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);8,21;4,11;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;305-7602455-9670750;;
Weihnachten 2022;Abgeschlossen;Linda Bauer;Haushaltskonto;MADIZZ 2er Set Sanft Kurze Wolle Fleece Dekorativ Zierkissenbezüge Luxus Stil Kissenbezug für Sofa für Schlafzimmer Beige 50x50 cm Quadrat;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);21,17;10,59;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;305-7602455-9670750;;
Weihnachten 2022;Abgeschlossen;Nina Bauer;Haushaltskonto;The Story of the World in 100 Moments: Discover the stories that defined humanity and shaped our world;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);13,41;6,71;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;305-7602455-9670750;;
Weihnachten 2022;Abgeschlossen;Linda Bauer;Haushaltskonto;Kingbar Vase Für Pampasgras Weiß, Moderne Keramik Deko Vase Für Getrocknete Blumen, Donut Spiral Blumenvase Runde Vase Mit Loch;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);33,26;16,63;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;305-3267603-5821124;;
Weihnachten 2022;Abgeschlossen;Nina Bauer;Haushaltskonto;Qings Glückliche Koi Ohrringe Fisch Rote Karpfen Freundschaft Symbol Ohrringe für Mädchen;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);19,15;9,58;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;305-3267603-5821124;;
Weihnachten 2022;Abgeschlossen;Nina Bauer;Haushaltskonto;Rico Acrylfarbe, 12 Farben, Pastelltöne;Amazon.de;Haushaltskonto;Jasmin Mokricky (50%);10,68;5,34;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;305-3267603-5821124;;
Weihnachten 2022;Abgeschlossen;Michael und Alina Zika;Markus Zika;Gardena Schlauchbox;Gardena;Markus Zika;Jasmin Mokricky (50%);0;0;Nicht bezahlt;Nicht bezahlt;zu Hause;;;Gratis Geschenk von Gardena
Weihnachten 2022;Abgeschlossen;Michael und Alina Zika;Markus Zika;Gardena Schlauchtrommel;gardena;Markus Zika;Jasmin Mokricky (50 %);0;0;Nicht bezahlt;Nicht bezahlt;Susanne Zika/Erich Zika zu Hause;;;Gratis Geschenk Gardena
Weihnachten 2022;Abgeschlossen;Justine Zika;Markus Zika;Spar-Gutschein 50€;Spar;Erich Zika;50% Jasmin Mokricky;0;0;Nicht bezahlt;Nicht bezahlt;Susanne Zika/Erich Zika zu Hause;;;Gratis-Übertragung von Erich Zika
Weihnachten 2022;Abgeschlossen;Jasmin Mokricky;Markus Zika;4x Sims4 Erweiterungscodes;Amazon & MMOGA;Markus Zika;;43,96;43,96;Konto-Weihnachten;Konto-Weihnachten;zu Hause;Amazon: D01-8671188-8661463, D01-9687888-9493437, D01-3787782-6824665, MMOGA: 103938757;;
Weihnachten 2022;Abgeschlossen;Jasmin Mokricky;Markus Zika;Fotoausdruck Lizenzcodes Sims 4;BIPA;Markus Zika;;1,8;1,8;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2022;Abgeschlossen;Michael Mokricky;Markus Zika;Doppelwandige Thermogläser Delonghi DLSC318;delonghi.com;Haushaltskonto;Jasmin Mokricky (50%);40,56;20,28;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;;HYDAT05833683;;
Weihnachten 2022;Abgeschlossen;Susanne Zika;Markus Zika;Duftkerze;Action;Haushaltskonto;Jasmin Mokricky (50%);3,99;1,99;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2022;Abgeschlossen;Alexander Zika;Haushaltskonto;Knetmasse;Tedi;Haushaltskonto;Jasmin Mokricky (50%);4;2;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2022;Abgeschlossen;Alexander Zika;Markus Zika;Coca Cola LKW;Billa;Haushaltskonto;;0;0;Nicht bezahlt;Nicht bezahlt;zu Hause;;;
Weihnachten 2022;Storniert;;Markus Zika;Foto Eintrittskarte 7 mal;Pixum;Markus Zika;;3,99;3,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;24726340;;
Weihnachten 2022;Abgeschlossen;Kurt Mokricky;Markus Zika;Fire TV Stick 4K Max mit Wi-Fi 6;Amazon.de;Haushaltskonto;Jasmin Mokricky und Michael Mokricky jeweils 33%;35,28;11,76;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-3940728-7171538;;
Weihnachten 2022;Abgeschlossen;Christa und Karl Kirchberger;Haushaltskonto;Thermengutschein;wellcard.at;Haushaltskonto;Jasmin Mokricky 50,00 €;72,9;22,9;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;174852;;
Weihnachten 2022;Abgeschlossen;;Markus Zika;Weihnachtsbriefumschlag | Weihnachtskugeln Rot und Silber;Amazon.de;Markus Zika;;6,91;6,91;Hauptkonto;Hauptkonto;zu Hause;302-7380115-4715548;;Falsch geliefert, Ersatz geliefert.
Weihnachten 2022;Abgeschlossen;Christa Kirchberger;Markus Zika;Abreisskalender;Interspar;Haushaltskonto;Jasmin Mokricky (50%);4,5;2,25;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2022;Abgeschlossen;Alina Zika;Haushaltskonto;Fotokalender - Monate mit Fotos von Alexander;pixum.com;Haushaltskonto;Jasmin Mokricky (50%);26,45;13,23;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;24629483;;
Weihnachten 2022;Abgeschlossen;Susanne Zika;Markus Zika;Fotokalender - Monate mit Fotos von Alexander;pixum.com;Haushaltskonto;Jasmin Mokricky (50%);26,45;13,23;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;24629483;;
Weihnachten 2022;Abgeschlossen;Regina Mokricky;Markus Zika;Wäscheständer;Amazon.de;Haushaltskonto;Jasmin Mokricky und Michael Mokricky jeweils 33%;38,3;12,76;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-8049715-2805153;;
Weihnachten 2022;Abgeschlossen;Erich Zika;Markus Zika;Saunagutschein;Jubiläumshalle Biedermannsdorf;Haushaltskonto;Michi & Alina (52,10 €); Jasmin (39,50 €); Markus (12,60 €);104,2;;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2022;Abgeschlossen;Alexander Zika;Markus Zika;Trinkbecher Paw Patrol;Tedi;Haushaltskonto;Jasmin Mokricky (50%);6;3;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;
Weihnachten 2022;Abgeschlossen;Alexander Zika;Markus Zika;Play-Doh Zoom Zoom Saugen und Aufräumen Set;Müller;Haushaltskonto;Jasmin Mokricky (50%);19,99;10;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;;;Bezahlt HK
Weihnachten 2022;Abgeschlossen;Kurt Mokricky;Markus Zika;Gadgy ® Popcornmaschine l 800W Popcorn Maker mit Antihaftbeschichtung und Abnehmbares Heizfläche l Stille und Schnelle Popcorn Maschinen mit zucker, öl, butter l Groß Inhalt 5 L | Popcorn machine;Amazon.de;Haushaltskonto;Jasmin Mokricky und Michael Mokricky jeweils 33%;55,45;18,48;Haush.k. (2) - Geschenk;Haush.k. (2) - Geschenk;zu Hause;302-1044380-8099542;;
Weihnachten 2022;Abgeschlossen;Lordana Fischl;Markus Zika;Rebecca Eintrittskarte;wien-ticket.at;Markus Zika;;49,5;49,5;Konto-Weihnachten;Konto-Weihnachten;E-Mail;2313300938997;;
Weihnachten 2022;Abgeschlossen;Michael Zika;Markus Zika;Rebecca Eintrittskarte;wien-ticket.at;Markus Zika;;49,5;49,5;Konto-Weihnachten;Konto-Weihnachten;E-Mail;2313300941180;;
Weihnachten 2022;Abgeschlossen;Alina Zika;Markus Zika;Rebecca Eintrittskarte;wien-ticket.at;Markus Zika;;49,5;49,5;Konto-Weihnachten;Konto-Weihnachten;E-Mail;2313300941180;;
Weihnachten 2022;Abgeschlossen;Jasmin Mokricky;Markus Zika;Rebecca Eintrittskarte;wien-ticket.at;Markus Zika;;49,5;49,5;Konto-Weihnachten;Konto-Weihnachten;E-Mail;2313300938997;;
Weihnachten 2022;Abgeschlossen;Christa Kirchberger;Markus Zika;Rebecca Eintrittskarte;wien-ticket.at;Markus Zika;;49,5;49,5;Konto-Weihnachten;Konto-Weihnachten;E-Mail;2313300938997;;
Weihnachten 2022;Abgeschlossen;Erich Zika;Markus Zika;Rebecca Eintrittskarte;wien-ticket.at;Markus Zika;;49,5;49,5;Konto-Weihnachten;Konto-Weihnachten;E-Mail;2313300938997;;
Weihnachten 2022;Abgeschlossen;Susanne Zika;Markus Zika;Rebecca Eintrittskarte;wien-ticket.at;Markus Zika;;49,5;49,5;Konto-Weihnachten;Konto-Weihnachten;E-Mail;2313300938997;;
Weihnachten 2022;Abgeschlossen;;Markus Zika;Foto Eintrittskarten Rebecca 8 mal;CEWE/DM SCS;Markus Zika;;4,09;4,09;Nicht bezahlt;Nicht bezahlt;;623536-914347;;
Weihnachten 2021;Abgeschlossen;Kurt Mokricky;Markus Zika;WellCard Gutschein 50 Euro;Wellcard-Shop;Jasmin Mokricky;Markus Zika (20,00 Euro);50;20;Konto-Weihnachten;Konto-Weihnachten;Jasmin Mokricky zu Hause;;;Bezahlt an Jasmin.
Weihnachten 2021;Abgeschlossen;Regina Mokricky;Markus Zika;WellCard Gutschein 50 Euro;Wellcard-Shop;Jasmin Mokricky;Markus Zika (20,00 Euro);50;20;Konto-Weihnachten;Konto-Weihnachten;Jasmin Mokricky zu Hause;;;Bezahlt an Jasmin.
Weihnachten 2021;Abgeschlossen;Christa Kirchberger;Markus Zika;Abreisskalender 2022;;Susanne Zika;;?;0;div. Bezahlung;div. Bezahlung;zu Hause;;;Keine Bezahlung an Susanne Zika nötig.
Weihnachten 2021;Abgeschlossen;Alina Zika;Markus Zika;Vorwerk Thermomix Varoma-Förmchen mit Deckel;Vorwerk;Markus Zika;;36,64;36,64;Hauptkonto;Hauptkonto;zu Hause;6081544126;;
Weihnachten 2021;Abgeschlossen;Susanne Zika;Markus Zika;Vorwerk Thermomix Varoma-Förmchen mit Deckel;Vorwerk;Markus Zika;;36,64;36,64;Hauptkonto;Hauptkonto;zu Hause;6081544126;;
Weihnachten 2021;Abgeschlossen;Nina Bauer;Jasmin Mokricky;Phillips:Truth;Weltbild;Markus Zika;;12,4;12,4;div. Bezahlung;div. Bezahlung;zu Hause;;;
Weihnachten 2021;Abgeschlossen;Susanne Zika;Markus Zika;TM6 Topfset;Vorwerk;Markus Zika;;215;0;div. Bezahlung;div. Bezahlung;zu Hause;6054963976;;
Weihnachten 2021;Abgeschlossen;Erich Zika;Markus Zika;WellCard Guthaben (für Linsberg);Wellcard;Markus Zika;;50;50;Konto-Weihnachten;Konto-Weihnachten;zu Hause;0;;
Weihnachten 2021;Abgeschlossen;Jasmin Mokricky;Markus Zika;Vintage chinesischen Stil Vorhängeschloss;Amazon;Markus Zika;;3,42;3,42;Konto-Weihnachten;Konto-Weihnachten;zu Hause;303-2740794-0001105;;
Weihnachten 2021;Abgeschlossen;Jasmin Mokricky;Markus Zika;Logica Spiele Art. Schrein ? - Magische Geschenkbox;Amazon;Markus Zika;;19,06;19,06;Konto-Weihnachten;Konto-Weihnachten;zu Hause;303-9431625-8981115;;
Weihnachten 2021;Abgeschlossen;Familie Zika;Markus Zika;Gamely Games Der Schwindelmeister;Amazon;Markus Zika;;15,12;15,12;Konto-Weihnachten;Konto-Weihnachten;zu Hause;303-9658307-2570710;;
Weihnachten 2021;Abgeschlossen;Julia Lasser;Markus Zika;Schokomaroni Billa Corso;Billa;Markus Zika;;4,99;4,99;div. Bezahlung;div. Bezahlung;zu Hause;;;
Weihnachten 2021;Abgeschlossen;Linda Bauer;Jasmin Mokricky;Mudder 2 Paare Sportschuhe;Amazon;Jasmin Mokricky;;10,07;10,07;div. Bezahlung;div. Bezahlung;zu Hause;306-0954348-1954737;;
Weihnachten 2021;Abgeschlossen;Michael Zika;Markus Zika;COMEOR Jogginghose;Amazon;Markus Zika;;16,13;16,13;Konto-Weihnachten;Konto-Weihnachten;zu Hause;306-4373564-9076361;;
Weihnachten 2021;Abgeschlossen;Erich Zika;Markus Zika;Broszio Durandal;Amazon;Markus Zika;Jasmin Mokricky (15,00 Euro);27,22;27,22;Konto-Weihnachten;Konto-Weihnachten;zu Hause;306-2751097-7973937;;
Weihnachten 2021;Abgeschlossen;Lordana Fischl;Markus Zika;Prokopp div. Geschenke;Prokopp SCS;Markus Zika;;18,35;18,35;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2021;Abgeschlossen;Justine Zika;Markus Zika;Diverse Kleinigkeiten;?;Erich Zika;;0;0;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2021;Abgeschlossen;Jasmin Mokricky;Markus Zika;Niederösterreich-Card;https://www.niederoesterreich-card.at/;Markus Zika;;63;63;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2021;Abgeschlossen;Nina Bauer;Markus Zika;Yankee Candle Duftkerze im Glas;Amazon;Markus Zika;;19,6;19,6;Konto-Weihnachten;Konto-Weihnachten;zu Hause;306-6349512-8934739;;
Weihnachten 2021;Abgeschlossen;Linda Bauer;Markus Zika;Fanola No Yellow Shampoo, 350 ml;Amazon;Markus Zika;;7,03;7,03;Konto-Weihnachten;Konto-Weihnachten;zu Hause;306-7109802-9987505;;
Weihnachten 2021;Abgeschlossen;Christa Kirchberger;Markus Zika;Hotel Grimmingblick;Hotel;Susanne Zika;Jasmin Mokricky (20,00 Euro);60;40;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2021;Abgeschlossen;Karl Kirchberger;Markus Zika;Hotelgutschein Grimmingblick;Hotel;Susanne Zika;Jasmin Mokricky (20,00 Euro);60;40;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2021;Abgeschlossen;Linda Bauer;Markus Zika;LAPASA Herren Schlafanzughose;Amazon;Markus Zika;;21,17;21,17;Konto-Weihnachten;Konto-Weihnachten;zu Hause;306-0954348-1954737;;
Weihnachten 2021;Abgeschlossen;Alexander Zika;Jasmin Mokricky;Mein Puste-Licht-Buch 1;Amazon;Jasmin Mokricky;;13;13;div. Bezahlung;div. Bezahlung;zu Hause;306-1432566-2294750;;
Weihnachten 2021;Abgeschlossen;Michael Zika;Markus Zika;12 frische Gin-Botanicals;Amazon;Markus Zika;;24,9;24,9;Konto-Weihnachten;Konto-Weihnachten;zu Hause;306-4373564-9076361;;
Weihnachten 2021;Abgeschlossen;Michael Zika;Markus Zika;ZOVER LED Sternenhimmel;Amazon;Markus Zika;Jasmin (18,88 Euro);38,3;19,72;Konto-Weihnachten;Konto-Weihnachten;zu Hause;306-4373564-9076361;;
Weihnachten 2021;Abgeschlossen;Susanne Zika;Markus Zika;Thermomix TM6 (Berater-Paket);Vorwerk Berater;Markus Zika;Jasmin Mokricky (50% der Kosten);285,31;142,65;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;Bezahlt: 142,66
Weihnachten 2021;Abgeschlossen;Alina Zika;Markus Zika;Gesichtsbürste;;Markus Zika;Jasmin Mokricky (25,00 Euro);50;25;Konto-Weihnachten;Konto-Weihnachten;Michi zu Hause;;;
Weihnachten 2020;Abgeschlossen;Lordana Fischl;Markus Zika; Brother X14S, elektrische Nähmaschine;Amazon.de;Markus Zika;;108,99;58,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;028-2097064-7018757;;Geschenk für Geburtstag und Weihnachten
Weihnachten 2020;Abgeschlossen;Justine Zika;Markus Zika;Rubbellos, div. Gutscheine;diverse Shops;Erich Zika;Markus Zika - 30,00 Euro;?;30;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;div. Gutscheine (Spar, Taxi, Apotheke, Rubbellos)
Weihnachten 2020;Abgeschlossen;Kurt Mokricky;Markus Zika;Tee;Demmers Teehaus, Müller;Jasmin Mokricky;Markus Zika - 30,00 Euro;60;30;Konto-Weihnachten;Konto-Weihnachten;Jasmin Mokricky zu Hause;;;
Weihnachten 2020;Abgeschlossen;Michael Mokricky;Markus Zika;Schlagschauberbohrer;;Jasmin Mokricky;Markus Zika - 20,00 Euro;50;20;Konto-Weihnachten;Konto-Weihnachten;Jasmin Mokricky zu Hause;;;
Weihnachten 2020;Abgeschlossen;Regina Mokricky;Markus Zika;Dampfreiniger ink. Akku;;Jasmin  Mokricky;Markus Zika - 30,00 Euro;60;30;Konto-Weihnachten;Konto-Weihnachten;Jasmin Mokricky zu Hause;;;
Weihnachten 2020;Abgeschlossen;Nina Bauer;Markus Zika;Malen nach Zahlen Bild;Amazon.de;Christa Kirchberger;Jasmin Mokricky - 10,00 Euro;27,99;17,99;Konto-Weihnachten;Konto-Weihnachten;Christa Kirchberger zu Hause;;;
Weihnachten 2020;Abgeschlossen;Linda Bauer;Markus Zika;Dekorative LED-Wolke Neonlicht;Amazon.de;Markus Zika;;16,99;16,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;028-6278656-7681902;;
Weihnachten 2020;Abgeschlossen;Linda Bauer;Markus Zika;MIULEE 2er Set Flauschige Kunstfell Kissen Soft;Amazon.de;Markus Zika;Jasmin Mokricky - 10,00 Euro;16,99;6,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;028-6278656-7681902;;
Weihnachten 2020;Abgeschlossen;Alexander Zika;Markus Zika;Fisher-Price Einschlafhilfe Otter;alza.at;Markus Zika;;33,15;33,15;Konto-Weihnachten;Konto-Weihnachten;zu Hause;430046065;;
Weihnachten 2020;Abgeschlossen;Jasmin Mokricky;Markus Zika;Planet Zoo: Deluxe Edition;instant-gaming.com;Markus Zika;;31,97;31,97;Konto-Weihnachten;Konto-Weihnachten;virtuell;48454593;;STEAM-Lizenzcode: VQXJK-V4T8N-TZ2DA
Weihnachten 2020;Abgeschlossen;Jasmin Mokricky;Markus Zika;2 in 1 Teigschaber Aquamarin - Kitty Professional;ramershoven.com;Markus Zika;;16,22;16,22;Konto-Weihnachten;Konto-Weihnachten;zu Hause;RH10041540;;An LogoiX
Weihnachten 2020;Abgeschlossen;Susanne Zika;Markus Zika;2 in 1 Teigschaber Aquamarin - Kitty Professional;ramershoven.com;Markus Zika;;16,22;16,22;Konto-Weihnachten;Konto-Weihnachten;zu Hause;RH10041540;;An LogoiX
Weihnachten 2020;Abgeschlossen;Jasmin Mokricky;Markus Zika;Einfüllhilfe Herzschütte - Kitty Professional;ramershoven.com;Markus Zika;;24,95;24,95;Konto-Weihnachten;Konto-Weihnachten;zu Hause;RH10041540;;An LogoiX, zusätzlich Logoix Kosten ausgleichen!
Weihnachten 2020;Abgeschlossen;Susanne Zika;Markus Zika;Einfüllhilfe Herzschütte - Kitty Professional;ramershoven.com;Markus Zika;;24,95;24,95;Konto-Weihnachten;Konto-Weihnachten;zu Hause;RH10041540;;An LogoiX, zusätzlich Logoix Kosten ausgleichen!
Weihnachten 2019;Abgeschlossen;Susanne Zika;ID 127;Wasserkocher aus Stahl (nicht plastik!);Universal;ID 127;;64,9;0;div. Bezahlung;div. Bezahlung;zu Hause;;;evt. WMF
Weihnachten 2019;Abgeschlossen;Linda Bauer;Markus Zika;Fire TV Stick mit Alexa Sprachfernbedienung;Amazon;Markus Zika;Jasmin Mokricky (10,00 Euro);25,2;15,2;Konto-Weihnachten;Konto-Weihnachten;zu Hause;302-5834777-3939524;;
Weihnachten 2019;Abgeschlossen;Susanne Zika;Christa Kirchberger;Festplatte für Panasonic Aufnahmegerät;universal;Markus Zika;;60,99;0;Konto-Weihnachten;Konto-Weihnachten;zu Hause;5065452999;;
Weihnachten 2019;Abgeschlossen;Michael Mokricky;Markus Zika;MyMuesli;mymuesli;Jasmin Mokricky;Beteiligung bei Jasmin Mokricky;?;13,5;Konto-Weihnachten;Konto-Weihnachten;Jasmin Mokricky zu Hause;;;
Weihnachten 2019;Abgeschlossen;Kurt Mokricky;Markus Zika;Infarot - 10er Block, Gewürze;;Jasmin Mokricky;Beteiligung bei Jasmin Mokricky;?;50;Konto-Weihnachten;Konto-Weihnachten;Jasmin Mokricky zu Hause;;;Bet. mit 50,00 € bei allen Geschenken
Weihnachten 2019;Abgeschlossen;Alina Zika;Markus Zika;Zuckerbäckerball - Tortengarantie und Sitzplatz;;Susanne Zika;Jasmin Mokricky (30,00 Euro);70;40;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2019;Abgeschlossen;Michael Zika;Markus Zika;Zuckerbäckerball - Tortengaratie;;Susanne Zika;;15;15;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
"Weihnachten 2019;Abgeschlossen;Susanne Zika;Markus Zika;Panasonic DMR-BCT765EG;shöpping.at / electronic4you;Markus Zika;1-Jasmin Mokricky;
2-Michael Zika
3-Christa Kirchberger
4-Erich Zika;363,1;49,09;Konto-Weihnachten;Konto-Weihnachten;zu Hause;jbwy-ovb9-h3eq-wbij-zwpu;;1: 50 Euro
2: 140,00 Euro
3: 59,01 Euro
4: 65,00 Euro"
Weihnachten 2019;Abgeschlossen;Regina Mokricky;Markus Zika;MediaMarkt Gutschein;MediaMarkt;Jasmin Mokricky;Markus Zika (50,00 Euro);150;50;Konto-Weihnachten;Konto-Weihnachten;Jasmin Mokricky zu Hause;0;;
"Weihnachten 2019;Abgeschlossen;Erich Zika;Markus Zika;Camping Vordach;Berger Camping SCS;Markus Zika;Jasmin Mokricky (1)
Michael/Alina Zika (2);199;64,5;Konto-Weihnachten;Konto-Weihnachten;zu Hause;0;;(1) = 35,00 Euro
(2) = 99,50 Euro"
Weihnachten 2019;Abgeschlossen;Christa Kirchberger;Markus Zika;HP »ENVY Photo 7830«;universal;Markus Zika;Michael Zika (45,50 Euro);90,99;45,5;Konto-Weihnachten;Konto-Weihnachten;zu Hause;3713442843;;
Weihnachten 2019;Abgeschlossen;Karl Kirchberger;Markus Zika;Gutschein Grieche Guntramsdorf;Grieche Guntramsdorf;Markus Zika;Jasmin Mokricky (20,00 Euro);60;40;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2019;Abgeschlossen;Nina Bauer;Jasmin Mokricky;Anpro 165Stk Schmuck Gießformen Set;Amazon.de - Jueeustore;Markus Zika;Jasmin Mokricky (12,19 Euro);12,19;0;Konto-Weihnachten;Konto-Weihnachten;zu Hause;305-5944205-8204343;;
Weihnachten 2019;Abgeschlossen;Nina Bauer;Markus Zika;Lexikon der Dinosaurier;Amazon.de;Markus Zika;;20,55;20,55;Konto-Weihnachten;Konto-Weihnachten;zu Hause;305-5944205-8204343;;
Weihnachten 2019;Abgeschlossen;Nina Bauer;Markus Zika;Epoxidharz Farbe, UV Harz Farben;Amazon.de - DecorRom DE;Markus Zika;;19,99;19,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;305-5944205-8204343;;
Weihnachten 2019;Abgeschlossen;Justine Zika;Markus Zika;SPAR - Einkaufsgutschein;Spar;Markus Zika;Jasmin Mokricky (20 Euro);60;40;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2019;Abgeschlossen;Christa Kirchberger;Jasmin Mokricky;WMF Nuova Steakbesteck, 12-teilig, für 6 Personen;Amazon.de;Markus Zika;;29,77;0;Konto-Weihnachten;Konto-Weihnachten;zu Hause;305-4583799-2448337;;Abgekauft von Jasmin Mokricky
Weihnachten 2019;Abgeschlossen;Lordana Fischl;Markus Zika;Tee-of-Tree Flasche + Golden Glory;mymuesli;Markus Zika;;32,8;32,8;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2019;Abgeschlossen;Susanne Zika;Markus Zika;2 von Paulmann 770.29 Pinja Tischleuchte touch max.1x40W E14;Amazon.de;Markus Zika;;30,24;30,24;Konto-Weihnachten;Konto-Weihnachten;zu Hause;302-7183838-3005120;;
Weihnachten 2019;Abgeschlossen;Susanne Zika;Markus Zika;EXTSUD WiFi Smart Lampe, Kompatibel mit Alexa;Amazon.de;Markus Zika;;26,99;26,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;302-9330142-2000353;;
Weihnachten 2019;Abgeschlossen;Susanne Zika;Markus Zika;Echo Dot 3. Gen; Anthrazit Stoff;Amazon.de;Markus Zika;;22,19;22,19;Konto-Weihnachten;Konto-Weihnachten;zu Hause;302-3479342-8121151;;
Weihnachten 2019;Abgeschlossen;Michael Zika;Markus Zika;Der neue Echo Dot (3. Gen.);Amazon.de;Markus Zika;;35,28;35,28;Konto-Weihnachten;Konto-Weihnachten;zu Hause;302-2400815-7420334;;Lieferdatum beachten!
Weihnachten 2019;Abgeschlossen;Jasmin Mokricky;Markus Zika;Sims 4 - An die Uni;MMOGA;Markus Zika;;29,99;29,99;Konto-Weihnachten;Konto-Weihnachten;zu Hause;52554275;;
Weihnachten 2019;Abgeschlossen;Jasmin Mokricky;Markus Zika;Küchenspatel von Sally (Interspar);Interspar;Markus Zika;;11,9;11,9;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2019;Abgeschlossen;Christa Kirchberger;Markus Zika;Abreisskalender 2020;Morawa SCS;Markus Zika;;7,5;7,5;Konto-Weihnachten;Konto-Weihnachten;zu Hause;;;
Weihnachten 2019;Abgeschlossen;Jasmin Mokricky;Markus Zika;Konzerttickets - Pentatonix März 2020 - Stadthalle;oeticket.com;Markus Zika;;54,6;54,6;Konto-Weihnachten;Konto-Weihnachten;Sparkasse Markus Zika zu Hause;1512249448;;
Weihnachten 2019;Abgeschlossen;Jasmin Mokricky;Markus Zika;Hydro Basics - Apres Shampooing Soyeux (2x 300 ML, 1x 1000 ML);ada-shop-com;Markus Zika;;34,07;34,07;Konto-Weihnachten;Konto-Weihnachten;zu Hause;131723;;
Weihnachten 2019;Storniert;Susanne Zika;Markus Zika;Smart LED Nachttischlampe HUGOAI;Amazon.de - Verkäufer: HUGOAI;Markus Zika;;41,59;41,59;Nicht bezahlt;Nicht bezahlt;;302-0567615-2480338;;
Weihnachten 2019;Storniert;Jasmin Mokricky;Markus Zika;Küchenspatel;Amazon.de;Markus Zika;;10,06;10,06;Konto-Weihnachten;Konto-Weihnachten;zu Hause;303-4983603-5256354;;Ware geht retour.`;
    
    // Parse Daten
    const zeilen = DATEN.trim().split('\n');
    const geschenkeByThema = {};
    const kontakte = new Set();
    
    zeilen.forEach(z => {
        const p = z.split(';');
        if (p.length < 16) return;
        
        const thema = p[0].trim();
        if (!geschenkeByThema[thema]) geschenkeByThema[thema] = [];
        
        p[2].split(/und|,/).forEach(n => { if (n.trim() && n.trim() !== 'ALLE') kontakte.add(n.trim()); });
        p[3].split(/und|,/).forEach(n => { if (n.trim()) kontakte.add(n.trim()); });
        
        geschenkeByThema[thema].push({
            status: p[1].trim() === 'Abgeschlossen' ? 'gekauft' : p[1].trim() === 'Storniert' ? 'storniert' : 'offen',
            fuer: p[2].split(/und|,/).map(n => n.trim()).filter(n => n && n !== 'ALLE'),
            von: p[3].split(/und|,/).map(n => n.trim()).filter(n => n),
            titel: p[4].trim(),
            sollBezahlung: p[10].trim(),
            istBezahlung: p[11].trim(),
            sollPreis: parseFloat(p[8].replace(',', '.')) || 0,
            istPreis: parseFloat(p[9].replace(',', '.')) || 0,
            standort: p[12].trim(),
            notizen: `Shop: ${p[5]}\nBezahlt: ${p[6]}\nBeteiligung: ${p[7]}\nBestellnr: ${p[13]}\nRechnungsnr: ${p[14]}\n${p[15]}`
        });
    });
    
    const themen = Object.keys(geschenkeByThema);
    let totalGeschenke = 0;
    themen.forEach(t => totalGeschenke += geschenkeByThema[t].length);
    
    console.log(`📊 ${totalGeschenke} Geschenke in ${themen.length} Themen, ${kontakte.size} Kontakte`);
    
    if (!confirm(`Import starten?\n\n${totalGeschenke} Geschenke\n${themen.length} Themen\n${kontakte.size} Kontakte`)) {
        console.log('❌ Abgebrochen');
        return;
    }
    
    try {
        const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
        
        // 1. Kontakte erstellen
        console.log('👥 Erstelle Kontakte...');
        const kontakteIds = {};
        let count = 0;
        for (const kontakt of Array.from(kontakte)) {
            const id = 'kontakt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            kontakteIds[kontakt] = id;
            
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId, 'geschenke_kontakte', id), {
                id, name: kontakt, createdAt: new Date(), createdBy: userId
            });
            
            count++;
            console.log(`  ✅ ${count}/${kontakte.size}: ${kontakt}`);
            await new Promise(r => setTimeout(r, 100));
        }
        
        // 2. Themen + Geschenke
        console.log('📁 Erstelle Themen und Geschenke...');
        let imported = 0;
        
        for (const themaName of themen) {
            const themaId = 'thema_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Thema erstellen
            await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId, 'geschenke_themen', themaId), {
                id: themaId, name: themaName, createdAt: new Date(), createdBy: userId, istEigenes: true, personen: []
            });
            console.log(`  📁 Thema: ${themaName}`);
            
            // Geschenke
            for (const g of geschenkeByThema[themaName]) {
                const geschenkId = 'geschenk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', userId, 'geschenke_themen', themaId, 'geschenke', geschenkId), {
                    id: geschenkId,
                    themaId: themaId,
                    fuer: g.fuer.map(n => kontakteIds[n]).filter(i => i),
                    von: g.von.map(n => kontakteIds[n]).filter(i => i),
                    titel: g.titel,
                    status: g.status,
                    sollBezahlung: g.sollBezahlung,
                    istBezahlung: g.istBezahlung,
                    sollPreis: g.sollPreis,
                    istPreis: g.istPreis,
                    standort: g.standort,
                    notizen: g.notizen,
                    createdAt: new Date(),
                    createdBy: userId
                });
                
                imported++;
                if (imported % 10 === 0) console.log(`    ⏳ ${imported}/${totalGeschenke}`);
                await new Promise(r => setTimeout(r, 50));
            }
        }
        
        console.log('');
        console.log('🎉 === IMPORT ERFOLGREICH ===');
        console.log(`✅ ${themen.length} Themen`);
        console.log(`✅ ${kontakte.size} Kontakte`);
        console.log(`✅ ${imported} Geschenke`);
        console.log('');
        console.log('💡 Drücke F5 zum Neuladen!');
        
        alert(`✅ Import erfolgreich!\n\n${themen.length} Themen\n${kontakte.size} Kontakte\n${imported} Geschenke\n\nDrücke F5`);
        
    } catch (error) {
        console.error('❌ FEHLER:', error);
        alert('❌ Fehler: ' + error.message);
    }
})();
