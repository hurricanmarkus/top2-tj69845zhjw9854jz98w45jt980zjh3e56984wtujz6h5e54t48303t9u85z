# Abbuchungsberechner – Review, Vereinfachung und Intelligenz-Ausbau

## Zweck dieser Datei

Diese Datei ist **keine allgemeine Ideensammlung**, sondern eine **konkrete Umsetzungs-Vorlage für eine nachgelagerte KI**.

Ziel:
- den bestehenden `Abbuchungsberechner` **nicht zu verkleinern**
- **keine bestehenden Features zu löschen**
- das System für Erstnutzer **viel klarer, verständlicher und selbsterklärender** zu machen
- gleichzeitig **mehr Intelligenz, mehr Sonderfall-Abdeckung, mehr Filter, mehr Suchmöglichkeiten und mehr Diagnosefähigkeit** einzubauen

## Wichtiger Hinweis zur Planbasis

Die vom Auftrag referenzierte Datei `abbuchungsberechner-08b666.md` konnte im gesamten verfügbaren `TOP2-App`-Bereich **nicht gefunden** werden.

Die Analyse basiert deshalb auf dem tatsächlich vorhandenen Stand in:
- `App/abbuchungsberechner.js`
- `App/index.html` (Abbuchungsberechner-View + Modals)
- `App/haupteingang.js` (Integration)
- `App/firestore.rules` (bestehende Collections/Rules)

Wenn die fehlende Plan-Datei später auftaucht, sollen deren Inhalte **gegen diese Datei gegengeprüft**, aber **nicht blind über diese Analyse gestellt** werden.

---

# 1. Kurzfazit zum aktuellen Stand

## Was bereits gut ist

Der aktuelle Abbuchungsberechner ist **nicht schlecht**. Er hat bereits eine echte fachliche Basis:
- Konten/Quellen
- Kosten-/Gutschrift-Einträge
- Transferpläne
- Monatsabgleich mit Snapshot/Manuell
- Forecast
- Vorschlagslogik
- Audit-Schreibungen
- Such-/Filteransatz
- Hilfe-Icons
- Abtausch-Logik
- Rechte-/Firestore-Integration

Das Problem ist **nicht**, dass zu wenig da ist.

Das Problem ist:
- die vorhandene Stärke ist für Laien **nicht sofort begreifbar**
- die Logik ist teilweise **zu still und zu unsichtbar**
- mehrere Funktionen wirken eher wie „Expertenwerkzeug“ statt wie ein geführtes System
- einige wichtige Sonderfälle werden **fachlich noch zu grob** behandelt
- die Suche/Filterung ist für ein so komplexes System noch **zu schwach**
- manche Felder sind vorhanden, aber ihr Effekt ist **nicht klar sichtbar**

---

# 2. Hauptzielbild

Der Abbuchungsberechner soll zu einem System werden, das gleichzeitig:
- **für Anfänger sofort verständlich** ist
- **für Power-User extrem detailliert** ist
- **keine Funktionen verliert**
- **jeden Alarm erklärt**
- **jeden Vorschlag begründet**
- **jede Eingabe in Klartext zusammenfasst**
- **Sonderfälle sichtbar behandelt**
- auf **Desktop und Smartphone gleich verständlich** bleibt

Merksatz für die Umsetzung:

> Der Nutzer darf nie nur einen roten/gelben Zustand sehen. Er muss immer zusätzlich sehen: **Warum? Seit wann? Was passiert dadurch? Was ist die beste Lösung?**

---

# 3. Wichtigste Schwächen im Ist-Zustand

## 3.1 Kein klarer Einsteigerfluss

Oben gibt es zwar die Buttons `Konten`, `Transfers`, `Abgleich`, `Vorschläge`, `Neu`, aber ein Erstnutzer sieht nicht sofort:
- womit er anfangen muss
- in welcher Reihenfolge er das Modul sinnvoll befüllt
- welche Daten für sinnvolle Forecasts fehlen
- warum seine Ansicht eventuell noch unvollständig oder ungenau ist

## 3.2 Fachbegriffe sind nicht konsequent laienverständlich erklärt

Begriffe wie:
- `Snapshot`
- `Manuell`
- `Abtausch`
- `Mindestpuffer`
- `Beitrag / Gegenkonto`
- `Forecast`
- `Intervall`
- `Person`
- `Quelle`
- `Ziel`

sind für Fachnutzer okay, aber für Laien **nicht sofort selbsterklärend**.

## 3.3 Forecast ist zu wenig erklärend

Aktuell sieht man Endstände und Warnungen/Alarme, aber oft nicht direkt:
- welche Einträge den negativen Verlauf auslösen
- welche Transfers entlasten
- warum genau ein Monat kippt
- ob das Problem einmalig oder strukturell ist
- welche Lösung fachlich am sinnvollsten ist

## 3.4 Vorschlagslogik ist fachlich noch zu simpel

Die aktuelle Funktion `suggestions()` arbeitet zu grob:
- sie wählt primär **eine** starke Quelle
- sie verteilt nicht intelligent über mehrere sichere Quellen
- sie prüft nicht tief genug, ob die Quellkonten dadurch später selbst kritisch werden
- sie gibt noch keine echte Priorisierung nach Dringlichkeit, Sicherheit und Nachhaltigkeit aus

## 3.5 Monatsabgleich ist zu grob

Die aktuelle Erkennung fehlender Monate ist nicht ausreichend.

Problem:
- `findSkippedMonths()` arbeitet nicht pro Konto sauber genug
- es entsteht kein echtes Bild: **welches Konto hat für welchen Monat welche Datenqualität?**
- es fehlt eine richtige Monatsmatrix / Vollständigkeitsprüfung

## 3.6 Suche und Filter sind für das Modul noch zu schwach

Der aktuelle Filter ist gut als Basis, aber für die fachliche Tiefe zu klein.

Es fehlen u. a.:
- Feld-spezifische Suchoperatoren
- Vergleichsoperatoren (`>`, `<`, `>=`, `<=`)
- gespeicherte Filtersets
- Sortierung nach Dringlichkeit/Nächster Ausführung/Kontowirkung
- Spezialfilter für Problemfälle und Datenlücken

## 3.7 Es fehlt eine sichtbare „Warum?“-Ebene

Das System berechnet viel, aber zeigt es zu wenig in menschlicher Sprache.

Beispiel:
Ein Laie sollte nach dem Ausfüllen eines Eintrags sofort lesen können:

> „Ab 01.04.2026 wird jeden Monat am 1. Tag eine Belastung von 79,90 € auf Konto Giro Privat eingeplant. Der Eintrag läuft unbefristet.“

So eine verständliche Klartext-Zusammenfassung fehlt aktuell an mehreren Stellen.

## 3.8 Audit ist vorhanden, aber nicht sichtbar nutzbar

Es wird ins Audit geschrieben, aber es gibt keine gute UI, um Änderungen nachzuvollziehen.

## 3.9 Einige Logik-/Qualitätspunkte sind noch offen

Diese Punkte sollen bei der späteren Umsetzung **mit behoben** werden:
- `dayOfMonth` wird aktuell erfasst, aber im Forecast nicht wirklich sauber genutzt
- `saveTransfer()` prüft nicht konsistent `validTo < validFrom`
- es fehlt Konflikterkennung bei ähnlichen/doppelten Transfers oder Einträgen
- es fehlt eine klare Bewertung der Datenqualität pro Konto

---

# 4. Absolute Leitregeln für die spätere Umsetzung

## 4.1 Nichts entfernen

- keine Features löschen
- keine Buttons streichen, wenn ihr Zweck noch relevant ist
- keine vorhandene Fachlogik vereinfachen, indem Sonderfälle entfallen
- nur **erweitern, präzisieren, verständlicher machen**

## 4.2 Anfänger und Profis gleichzeitig bedienen

Umsetzung über:
- klare Standardansicht
- aufklappbare Details
- zusätzliche `i`-Hilfen
- Klartext-Zusammenfassungen
- Experten-Filter separat aufklappbar

## 4.3 Jeder Problemzustand braucht 4 Antworten

Jede Warnung / jeder Alarm / jede Datenlücke muss beantworten:
- **Was ist das Problem?**
- **Warum ist es entstanden?**
- **Welche Auswirkung hat es?**
- **Was ist die beste Maßnahme?**

## 4.4 Mobile Pflicht

Alles muss auf Desktop und Smartphone gleich verständlich bleiben:
- keine abgeschnittenen Hinweise
- keine Desktop-only Erklärlogik
- Tabellen nur mit sauberem Scroll-Container, nicht mit abgeschnittenen Inhalten
- große Buttons und klare Sektionen auch mobil

## 4.5 Einstellungen nur korrekt laden

Wenn neue `userSettings` ergänzt werden:
- **niemals** `getUserSetting()` auf Top-Level beim Modul-Import aufrufen
- immer erst innerhalb von `initializeAbbuchungsberechner()` oder später lesen

---

# 5. Konkrete Ausbau-Blöcke

## Block A – Geführter Einstieg und Systemklarheit

### Ziel
Ein Erstnutzer soll sofort verstehen:
- was dieses Modul macht
- wie er starten muss
- was schon vollständig ist
- was noch fehlt

### Umsetzen

Im Hauptbereich oberhalb oder direkt unter der Statusleiste ergänzen:
- einen `Schnellstart / Systemstatus`-Block
- eine nummerierte Schrittlogik
- Vollständigkeits-Chips

### Inhalt dieses Blocks

Beispiel:
- `1. Konten/Quellen anlegen`
- `2. Regelmäßige Einträge anlegen`
- `3. Transfers prüfen`
- `4. Monatsabgleich pflegen`
- `5. Forecast und Vorschläge prüfen`

Zusätzlich automatisch anzeigen:
- wie viele Konten fehlen
- wie viele Konten keinen aktuellen Snapshot haben
- wie viele Einträge fehlerhaft sind
- wie viele Alarme ungelöst sind
- ob Vorschläge nur informativ oder dringend sind

### Technische Ansatzpunkte

Dateien:
- `App/abbuchungsberechner.js`
- `App/index.html`

Neue Hilfsfunktionen vorschlagen:
- `buildSetupChecklist()`
- `buildDataQualityReport()`
- `renderSetupAndHealthPanel()`

---

## Block B – Klartext-Erklärungen in allen Formularen

### Ziel
Jede Eingabe soll sofort verständlich wirken.

### Umsetzen

Unter den Formularen für:
- Eintrag
- Transfer
- Konto
- Abgleich

jeweils einen Bereich `So wirkt dieser Eintrag` / `So wirkt dieser Transfer` / `So wird dieses Konto verwendet` ergänzen.

### Beispiele

Eintrag:
- „Ab 01.04.2026 wird jeden Monat eine Belastung von 79,90 € auf Konto X geplant.“
- „Die individuellen Monate 1,3,8 bedeuten: Jan, Mrz und Aug.“
- „Beiträge ziehen zusätzlich 20,00 € von Person Y heran.“

Transfer:
- „Ab 01.04.2026 wird monatlich ein Ausgleich von 150,00 € von Quelle A nach Ziel B geplant.“
- „Dieser Transfer stabilisiert Ziel B, kann aber Quelle A ab Monat 2026-09 selbst in den Warnbereich bringen.“

Konto:
- „Dieses Konto ist ein Zielkonto mit Mindestpuffer 500,00 €.“
- „Dieses Konto ist eine Person/Quelle und wird nicht gegen Mindestpuffer geprüft.“

Abgleich:
- „Snapshot ersetzt den erwarteten Monatsendstand dieses Kontos für den gewählten Monat.“
- „Manuell wirkt wie eine einzelne Zusatzkorrektur im gewählten Monat.“

### Technische Ansatzpunkte

Neue Renderfunktionen:
- `renderItemExplanationPreview()`
- `renderTransferExplanationPreview()`
- `renderAccountExplanationPreview()`
- `renderReconExplanationPreview()`

Diese Funktionen bei `input`/`change` live neu berechnen.

---

## Block C – Hilfeebene massiv ausbauen

### Ziel
Laien sollen jedes Fachwort per `i` sofort verstehen.

### Pflicht-Erweiterungen

Zusätzliche `i`-Hilfen ergänzen für:
- `Titel`
- `Konto`
- `Typ`
- `Intervall`
- `Gültig ab`
- `Gültig bis`
- `Beiträge / Gegenkonten`
- `Typ: Snapshot / Manuell`
- `Person vs. Bank`
- `Rolle: Quelle / Ziel / beides`
- `Warnung / Alarm`
- `Abtausch`

### Zusätzlicher Glossar-Bereich

Im Hauptscreen einen aufklappbaren Bereich `Begriffe einfach erklärt` ergänzen.

Pflichtbegriffe:
- Snapshot
- Manuell
- Mindestpuffer
- Forecast
- Beitrag/Gegenkonto
- Abtausch
- Quelle
- Ziel
- Person
- Transferplan

---

## Block D – Filter, Suche und Sortierung auf Profi-Niveau

### Ziel
Das Modul muss deutlich mächtigere Such- und Filterlogik bekommen, ohne die aktuelle Bedienung kaputtzumachen.

### Bestehendes beibehalten

Vorhanden und zu behalten:
- Token-Suche
- `NICHT`
- `AND/OR`
- Status / Typ / Intervall

### Erweitern um strukturierte Suchoperatoren

Die Suche soll zusätzlich Begriffe wie diese verstehen:
- `konto:giro`
- `titel:miete`
- `typ:belastung`
- `status:aktiv`
- `intervall:monatlich`
- `betrag>100`
- `betrag<50`
- `beitrag:ja`
- `beitrag:nein`
- `alarm:ja`
- `warnung:ja`
- `person:ja`
- `quelle:max`
- `ziel:ruecklage`
- `aktivAm:2026-07`
- `snapshot:fehlt`
- `snapshot:alt`
- `puffer<0`
- `naechsterMonat:kritisch`

### Zusätzliche UI-Elemente

Ergänzen:
- Sortier-Dropdown
- Ergebniszähler
- Schnellfilter-Chips
- gespeicherte Filtersets / Presets pro User

### Beispiel-Sortierungen

- Dringlichkeit
- nächster Ausführungstermin
- Betrag aufsteigend/absteigend
- kritischster Forecast zuerst
- zuletzt geändert
- alphabetisch

### Technische Ansatzpunkte

Bestehende Logik erweitern:
- `normalizeSearchText()`
- `matchItem()`
- neue Parser-Funktion, z. B. `parseStructuredFilters()`
- `renderTable()`
- `renderAccounts()`
- `renderTransfers()`

Für Presets:
- neue `userSettings` Keys
- **nicht** auf Top-Level laden

---

## Block E – Forecast verständlicher und fachlich stärker machen

### Ziel
Der Forecast darf nicht nur eine Tabelle sein. Er muss ein **Erklärsystem** werden.

### Pflicht-Erweiterungen

Für jede betroffene Konto-/Monatszelle soll bei Klick oder per Detailansicht sichtbar werden:
- Startstand
- Summe Eingänge
- Summe Ausgänge
- manuelle Korrekturen
- Snapshot-Override ja/nein
- resultierender Endstand
- Abstand zum Mindestpuffer
- größte Verursacher
- empfohlene Maßnahme

### Fachliche Verbesserung

Die Logik soll nicht nur `dueInMonth()` nutzen, sondern echte Monatsausführung besser modellieren.

Pflichtpunkt:
- `dayOfMonth` fachlich korrekt einbeziehen
- Monatsende-Fallback berücksichtigen (z. B. Tag 31 in Februar -> letzter Tag des Monats)
- Leap-Year sauber behandeln

### Neue Hilfsfunktionen empfehlen

- `getExecutionDateForMonth(entity, year, month)`
- `buildForecastBreakdown()`
- `buildAccountRiskTimeline(accountId)`
- `renderForecastDetailModal(accountId, monthKey)`

### Zusätzliche Darstellung

Optional, aber sehr sinnvoll:
- Trend-Ansicht pro Konto
- Risikoindex 0–100
- Kennzeichnung: einmalige Delle vs. dauerhaftes Strukturproblem

---

## Block F – Vorschlagslogik 2.0

### Ziel
Vorschläge sollen nicht mehr nur „irgendeinen“ Transfer anbieten, sondern die **beste fachliche Lösung**.

### Aktuelle Schwäche

Die heutige Vorschlagslogik ist zu grob, weil sie zu sehr von einer starken Quelle ausgeht.

### Neue Vorschlagsarten

Pflichtmäßig ergänzen:
- Einmaliger Ausgleich
- dauerhafte Erhöhung eines bestehenden Transfers
- neuer dauerhafter Transfer
- temporärer Transfer nur für kritische Monate
- Aufteilung auf mehrere Quellen
- Hinweis: besser Eintrag ändern statt Transfer erhöhen
- Hinweis: besser Snapshot/Abgleich prüfen statt Transfer anlegen

### Jede Empfehlung muss sichtbar begründen

Pflichtfelder je Vorschlag:
- `Warum dieser Vorschlag?`
- `Welche Monate werden dadurch stabilisiert?`
- `Welche Nebenwirkung hat der Vorschlag auf die Quelle?`
- `Ist die Lösung dauerhaft oder nur kurzfristig?`
- `Welche Alternative wäre zweitbeste Wahl?`

### Ranking-Logik

Vorschläge sortieren nach:
- höchste Wirksamkeit
- geringstes neues Risiko
- geringster manueller Aufwand
- Dauerhaftigkeit

### Technische Ansatzpunkte

Bestehende Funktionen erweitern/ersetzen:
- `suggestions()`
- `renderSuggestionsModal()`
- `applySuggestion()`

Wichtig:
- vor direkter Übernahme möglichst zuerst eine **Vorschau** anzeigen
- nicht sofort ohne Zwischenerklärung erstellen

---

## Block G – Monatsabgleich und Datenqualität professionell machen

### Ziel
Nicht nur „fehlende Monate“ zeigen, sondern echte Datenqualität pro Konto sichtbar machen.

### Neue Qualitätszustände pro Konto

Mindestens diese Zustände anzeigen:
- kein Snapshot vorhanden
- Snapshot vorhanden, aber alt
- aktueller Monat fehlt
- mehrere Monate fehlen
- nur manuelle Korrekturen, aber kein echter Snapshot
- Daten wirken stabil

### Pflicht-UI

Im Dashboard ergänzen:
- `Datenqualität`-Karte
- Konto-zu-Monat-Matrix oder Detail-Liste
- Quick Actions: `Snapshot für diesen Monat anlegen`
- Quick Actions: `heutigen Stand als Snapshot übernehmen`

### Fachlogik verbessern

Ersetze die grobe globale Fehlmonat-Logik durch eine **kontobezogene Monatsprüfung**.

Neue Hilfsfunktionen empfehlen:
- `buildReconciliationCoverageByAccount()`
- `findMissingSnapshotMonthsByAccount()`
- `buildReconciliationHealthSummary()`

### Sonderfall-Regeln

Sauber behandeln:
- Konto neu angelegt, noch ohne Historie
- zukünftige Snapshots
- ältere Snapshots, aber kein aktueller Monat
- manuelle Korrektur ohne Snapshot
- mehrere Einträge am selben Datum

---

## Block H – Konten, Einträge und Transfers deutlich intelligenter darstellen

### Kontenliste erweitern

Je Konto zusätzlich anzeigen:
- letzter Snapshot-Datum
- nächster kritischer Monat
- Anzahl verknüpfter Einträge
- Anzahl verknüpfter Transfers
- Netto-Wirkung pro Monat
- Datenqualitätsstatus

### Eintragsliste erweitern

Je Eintrag zusätzlich anzeigen:
- nächster Ausführungsmonat
- Jahresgesamtsumme
- Nettoeffekt inkl. Beiträge
- ob der Eintrag aktuell einen Alarm mitverursacht
- ob Abtauschhistorie existiert

### Transferliste erweitern

Je Transfer zusätzlich anzeigen:
- Sicherheitsbewertung der Quelle
- Nutzen für Zielkonto
- ob Überschneidungen mit ähnlichen Transfers bestehen
- ob Start-/Enddatum logisch konsistent ist

### Doppelte / konflikthafte Daten erkennen

Ergänzen:
- ähnliche Einträge erkennen
- doppelte Transfers erkennen
- überlappende Intervalle erkennen
- Einträge ohne sinnvolles Ziel/Konto markieren

---

## Block I – Abtausch stark verbessern

### Ziel
Abtausch muss für Laien glasklar sein.

### Vor Bestätigung anzeigen

Im Abtausch-Modal zusätzlich sichtbar machen:
- alter Betrag
- neuer Betrag
- alter Zeitraum
- neuer Zeitraum
- welche Monate dadurch anders werden
- ob dadurch ein Konto in Warnung/Alarm rutscht oder stabiler wird

### Zusätzliche Hilfestellung

Klartext:
- „Der alte Eintrag endet am …“
- „Ab … übernimmt der neue Betrag …“
- „Die Historie bleibt erhalten.“

---

## Block J – Audit sichtbar machen

### Ziel
Änderungen sollen nicht nur protokolliert, sondern im UI nutzbar sein.

### Empfohlen

Ergänze mindestens eine read-only Verlaufsansicht:
- pro Eintrag
- pro Konto
- pro Transfer
- optional global

### Anzeigen

- wer geändert hat
- wann geändert wurde
- welche Felder geändert wurden
- vorher / nachher
- Art der Änderung (`create`, `update`, `delete`, `abtausch`, etc.)

### Nutzen

Das erhöht:
- Vertrauen
- Nachvollziehbarkeit
- Fehlerdiagnose
- Laienverständnis bei Änderungen

---

# 6. Konkrete fachliche Sonderfälle, die die spätere KI sauber abdecken muss

## Termin- und Intervall-Sonderfälle

- monatlich mit Tag 31
- Quartal/Halbjahr/Jahr mit Startmonat
- individuelle Monate mit `validFrom` mitten im Jahr
- Ende vor nächster Ausführung
- Leap-Year / Februar
- unbegrenzte Laufzeit
- zukünftige Aktivierung
- bereits abgelaufene Einträge

## Konten-Sonderfälle

- Personenkonto ohne Mindestpuffer
- Konto nur Quelle
- Konto nur Ziel
- Konto mit Rolle „beides“
- Konto ohne Snapshot
- Konto mit altem Snapshot
- Konto mit nur manuellen Korrekturen
- Konto wird in Einträgen und Transfers gleichzeitig genutzt

## Transfer-Sonderfälle

- Quelle und Ziel identisch -> verbieten
- `validTo < validFrom` -> verbieten
- individueller Einmal-/Mehrmonats-Transfer
- Quelle wird selbst durch Vorschlag kritisch
- mehrere Transfers zwischen denselben Konten
- Transfer auf Personenkonto

## Eintrags-Sonderfälle

- Belastung vs. Gutschrift
- Beiträge/Gegenkonten mit eigenem Intervall
- Beiträge mit individuellen Monaten
- Eintrag ohne gültiges Konto -> Fehlerzustand
- Eintrag mit 0 oder negativem Betrag -> Fehlerzustand
- Abtausch mitten in laufender Historie
- mehrere inhaltlich ähnliche Einträge

## Abgleich-Sonderfälle

- Snapshot und manuelle Korrektur im selben Monat
- neuer Snapshot überschreibt erwarteten Endstand
- manueller negativer und positiver Ausgleich
- Abgleich in Zukunft
- doppelte Abgleich-Einträge pro Typ/Datum/Konto

## UX-Sonderfälle

- komplett leeres Modul
- nur Konten vorhanden, aber keine Einträge
- Einträge vorhanden, aber keine Snapshots
- Forecast vorhanden, aber ohne Datenqualität
- viele Daten auf kleinem Smartphone-Screen
- horizontale Tabellen auf Mobilgeräten

---

# 7. Technische Muss-Punkte für die spätere KI

## Relevante Dateien

Primär bearbeiten:
- `App/abbuchungsberechner.js`
- `App/index.html`

Bei neuen Collections / neuer Audit-UI / neuen gespeicherten Daten ggf. zusätzlich:
- `App/firestore.rules`

Nur wenn neue Navigation / neue Buttons / neue Rechte nötig wären:
- `App/haupteingang.js`
- Rechteverwaltung-Dateien

## Besonders wichtige bestehende Funktionen in `abbuchungsberechner.js`

Diese Funktionen sind zentrale Ansatzpunkte:
- `dueInMonth()`
- `buildForecast()`
- `suggestions()`
- `findSkippedMonths()`
- `matchItem()`
- `renderDashboard()`
- `renderTable()`
- `renderAccounts()`
- `renderTransfers()`
- `renderRecon()`
- `renderSuggestionsModal()`
- `openStatInsight()`
- `bindEvents()`
- `initializeAbbuchungsberechner()`

## Bestehende UI-Bereiche in `index.html`

Diese Bereiche nicht blind umbauen, sondern gezielt erweitern:
- Haupt-View `#abbuchungsberechnerView`
- Filterbereich `#ab-filter-controls-wrapper`
- Item-Modal `#abbuchungsberechnerItemModal`
- Abtausch-Modal `#ab-abtausch-modal`
- Konten-Modal `#ab-accounts-modal`
- Transfers-Modal `#ab-transfers-modal`
- Abgleich-Modal `#ab-reconciliation-modal`
- Vorschlags-Modal `#ab-suggestions-modal`
- Stat-Detail-Modal `#ab-stat-detail-modal`

---

# 8. Empfohlene Umsetzungsreihenfolge

## Phase 1 – Verständlichkeit zuerst

1. Schnellstart-/Systemstatus-Block einbauen
2. Klartext-Erklärungen in Formularen ergänzen
3. Hilfeebene und Glossar ausbauen
4. Datenqualitäts-Block sichtbar machen

## Phase 2 – Such- und Filterintelligenz

5. strukturierte Suchoperatoren einführen
6. Sortierungen ergänzen
7. Schnellfilter und Presets ergänzen

## Phase 3 – Forecast- und Vorschlagslogik verbessern

8. `dayOfMonth` fachlich sauber verwerten
9. Forecast-Breakdown einführen
10. Vorschlagslogik auf Multi-Source/Risiko-Bewertung umbauen
11. Vorschläge mit Begründung und Vorschau versehen

## Phase 4 – Diagnose und Vertrauen

12. Audit-Ansicht ergänzen
13. Konflikt-/Duplikat-Erkennung ergänzen
14. Abtausch-Impact-Preview ergänzen

---

# 9. Abnahmekriterien

Die spätere Umsetzung ist nur dann gut, wenn folgende Punkte erfüllt sind:

## Verständlichkeit
- Ein kompletter Laie versteht innerhalb weniger Sekunden, was das Modul macht.
- Jeder Fachbegriff ist direkt per `i` oder Glossar verständlich.
- Formulare erzeugen live eine menschliche Klartext-Erklärung.

## Funktionsausbau
- Es wurde **nichts entfernt**.
- Filter/Suche wurden spürbar mächtiger.
- Forecast und Vorschläge sind nachvollziehbarer und intelligenter.

## Fachlogik
- Monatslogik behandelt Tag/Monatsende sauber.
- Datenqualität wird pro Konto sichtbar.
- Vorschläge machen keine Quelle leichtfertig selbst kritisch.

## UX
- Desktop und Smartphone zeigen dieselbe fachliche Stärke.
- Keine wichtigen Informationen sind mobil versteckt oder abgeschnitten.

## Transparenz
- Warnungen/Alarme sind erklärt.
- Verlauf/Audit ist sichtbar.
- Nutzer sehen nicht nur Ergebnisse, sondern auch Begründungen.

---

# 10. Klare Handlungsanweisung an die spätere KI

Wenn du diese Datei umsetzt, dann:
- **lösche keine bestehenden Features**
- arbeite **inkrementell und stabil**
- verbessere zuerst die **Verständlichkeit**, dann die **Intelligenz**, dann die **Diagnosefähigkeit**
- halte alle neuen UX-Elemente **mobil und desktopgleich** nutzbar
- ergänze bei neuen gespeicherten Einstellungen keine `getUserSetting()`-Aufrufe auf Top-Level
- wenn neue Firestore-Datenstrukturen entstehen, passe `firestore.rules` im selben Arbeitsgang mit an

Leitgedanke:

> Dieses Modul soll wie ein intelligenter Finanz-Co-Pilot wirken – nicht wie eine lose Sammlung einzelner Formulare.
