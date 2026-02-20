# Pushmail-Sanierung Masterplan (Bestandsaufnahme)

## 0) Ziel, Scope, Rahmen

**Ziel:** Vollstaendige, verifizierbare Ist-Analyse des Pushmail-Systems fuer alle Startseiten-Programme als Grundlage fuer die spaetere Sanierung.

**Scope (dieses Dokument):**
- Nur Bestandsaufnahme + Gap-Analyse + Sollbild + Priorisierung
- Keine Implementierung in dieser Phase
- Fokus auf Startseiten-Karten/Programme

**Verifikationsprinzip:** Jede relevante Aussage ist mit Code-Referenzen hinterlegt (`@datei#von-bis`).

---

## 1) Executive Summary

### 1.1 Aktueller Reifegrad
- Es gibt einen zentralen Pushmail-Kern mit Definitionskatalog, User-Einstellungen, Pending/Acknowledge-Collections, Duplikatlogik und Client-Scheduler: `@pushmail-notifications.js#63-638`, `@pushmail-notifications.js#644-705`, `@pushmail-notifications.js#1221-1347`.
- Der Kern wird beim Login initialisiert (Modal, Scheduler, Echtzeit-Listener): `@haupteingang.js#564-572`.
- Trigger sind aktuell nur in **8** Programmen technisch angebunden:
  1) TERMINPLANER
  2) ZAHLUNGSVERWALTUNG
  3) TICKET_SUPPORT
  4) WERTGUTHABEN
  5) LIZENZEN
  6) VERTRAGSVERWALTUNG
  7) HAUSHALTSZAHLUNGEN
  8) SENDUNGSVERWALTUNG
  
  Siehe Definitionen: `@pushmail-notifications.js#63-385` und konkrete Trigger-Aufrufe in den jeweiligen Modulen.

### 1.2 Kritische Findings (P0)
1. **Sendungsverwaltung-Trigger defekt** (falsche Felder, Trigger laeuft faktisch nicht):
   - Speichert `deadlineErwartet`/`deadlineVersand`: `@sendungsverwaltung.js#507-508`
   - Trigger prueft aber `erwarteteAnkunft`: `@sendungsverwaltung.js#549-550`
2. **Wertguthaben Aktionscode-Trigger defekt** (Typ-Mismatch + Warnungsfeld-Mismatch):
   - Typ wird als `aktionscode` gespeichert: `@wertguthaben.js#829-830`, `@wertguthaben.js#865`
   - Trigger prueft auf `Aktionscode`: `@wertguthaben.js#441`, `@wertguthaben.js#472`, `@wertguthaben.js#488`
   - Feld gespeichert als `warnung`, geprueft als `warnungVorAblauf`: `@wertguthaben.js#838`, `@wertguthaben.js#853`, `@wertguthaben.js#457`
3. **Ticket-Reminder-Inhalt defekt** (Titel-Feld falsch):
   - Ticketmodell nutzt `subject`: `@ticket-support.js#506`, `@ticket-support.js#546`, `@ticket-support.js#561`
   - Reminder liest `ticket.title`: `@ticket-support.js#894`
4. **Haushaltszahlungen-Alarmzweig teilweise dead code**:
   - Prueft auf `status === 'alarm'`: `@haushaltszahlungen.js#676-679`
   - `berechneStatus` liefert aber nur `fehler`, `n-aktiv-geplant`, `n-aktiv-vergangen`, `aktiv`: `@haushaltszahlungen.js#625-647`
5. **Zwei konkurrierende Einstellungs-Systeme im Pushmail-Center**:
   - Legacy Auto-Settings via `pushmail_auto_notifications` in User-Settings: `@haupteingang.js#1190-1418`
   - Parallel modernes Pushmail-Settings-UI via `pushmail_settings` (Firestore): `@pushmail-settings-ui.js#17-374`
   - Beide werden im gleichen View initialisiert: `@haupteingang.js#1542-1548`

### 1.3 Strukturelle Risiken
- Scheduler ist clientseitig pro eingeloggtem User (kein serverseitiger zentraler Job): `@pushmail-notifications.js#1221-1347`.
- `overlayEnabled` wird gespeichert, aber in Versand-/Anzeige-Logik nicht als harter Gate genutzt: `@pushmail-notifications.js#629-631`, `@pushmail-notifications.js#706-729`, `@pushmail-notifications.js#1221-1265`.
- `regularScheduledTime` wird gesetzt, aber nicht weiter verarbeitet: `@pushmail-notifications.js#585-593`, `@pushmail-notifications.js#623`.
- Custom-Texte koennen bei normalem Save wieder auf Defaults zurueckfallen: `@pushmail-settings-ui.js#356-363`, `@pushmail-settings-ui.js#513-514`.

---

## 2) Architektur-Istbild (Systemebene)

### 2.1 Startseiten-Programme (Quellmenge)
- Karten/Programme auf Home: `@index.html#92-322`
- View-Mapping: `@haupteingang.js#147-172`
- Navigation + Initialisierung je View: `@haupteingang.js#1691-1725`, `@haupteingang.js#2619-2669`

### 2.2 Pushmail-Kern
- Definitionskatalog (pro Programm + Typ): `@pushmail-notifications.js#63-385`
- Default-Settings-Generator: `@pushmail-notifications.js#391-421`
- Laden/Speichern/Normalisierung User-Settings: `@pushmail-notifications.js#427-503`
- Trigger-Entry-Point: `createPendingNotification(...)`: `@pushmail-notifications.js#509-638`
- Pending-Listener + UI-Update: `@pushmail-notifications.js#668-729`
- Scheduler + Pushover-Dispatch: `@pushmail-notifications.js#1221-1347`

### 2.3 Center-UI
- Pushmail-Center View-Struktur in HTML: `@index.html#882-991`
- Pending-Modal + Customize-Modal: `@index.html#5977-6035`
- Einstellungen-UI (programm-/typweise): `@pushmail-settings-ui.js#17-537`

### 2.4 Trigger-Pipeline (Ist)

```text
Programmlogik (onSnapshot/save action)
    -> createPendingNotification(userId, programId, type, relatedData)
    -> Duplikatcheck pending + acknowledged
    -> write /users/{userId}/pushmail_notifications
    -> startPendingNotificationsListener rendert Liste/Counter
    -> Scheduler prueft nextSendAt, sendet optional Pushover, setzt nextSendAt/lastSentAt
```

Belege: `@pushmail-notifications.js#509-638`, `@pushmail-notifications.js#668-729`, `@pushmail-notifications.js#1221-1265`.

---

## 3) Trigger-Matrix (Startseiten-Programme)

| Programm | Pushmail-Trigger heute | Typ (Datum/Status/Event) | Ist-Deckung | Hauptluecke |
|---|---|---|---|---|
| Terminplaner | `umfrage_zugewiesen`, `x_tage_vor_ablauf`, `termin_feststeht` | Event + Datum | Mittel | `termin_geaendert` definiert, aber nicht ausgelost |
| Zahlungsverwaltung | `teilungsanfrage_eingehend`, `teilungsanfrage_antwort` | Event | Mittel | Keine Frist-/Follow-up-Reminder fuer offene Forderungen |
| Ticket Support | `ticket_zugewiesen`, `x_tage_vor_faelligkeit` | Event + Datum | Mittel | Feldmismatch `title` vs `subject` |
| Wertguthaben | 5 Typen vorhanden | Datum | Niedrig-Mittel | Aktionscode/Warnung wegen Feldmismatch praktisch defekt |
| Lizenzen | `x_tage_vor_ablauf` | Datum | Basis | Nur ein Trigger, kein Event bei Statuswechsel |
| Vertragsverwaltung | 4 Typen vorhanden | Datum + Remindertext | Mittel | Reminder ohne klares targetDate-Semantik |
| Haushaltszahlungen | `status_nicht_okay`, `x_tage_vor_gueltig_ab/bis/erinnerung` | Status + Datum | Mittel | `alarm`-Zweig inkonsistent, Semantik split |
| Sendungsverwaltung | `x_tage_vor_ablauf_sendung` (intendiert) | Datum | Niedrig | Feldmismatch verhindert Trigger |
| Notizen | keine Pushmail-Calls | - | Keine | Erinnerungsdaten vorhanden, aber nicht an Pushmail angebunden |
| Geschenkemanagement | keine Pushmail-Calls | - | Keine | Eigene Erinnerungscollection ohne Pushmail-Bruecke |
| Checkliste | keine Pushmail-Calls | - | Keine | Keine Triggerbruecke |
| Rezepte | keine Pushmail-Calls | - | Keine | Keine Triggerbruecke |
| Essensberechnung | keine Pushmail-Calls | - | Keine | Keine Triggerbruecke |
| Entrance | keine Pushmail-Calls | - | Keine | Out-of-Scope fuer Reminderlogik |
| Push-Benachrichtigung/Notruf | kein `createPendingNotification` im Modul | - | Keine | Eigene Mechanik, keine Pushmail-Kopplung |

Referenzen: `@pushmail-notifications.js#63-385`, `@index.html#92-322`, modulbezogene Trigger-Quellen in Abschnitt 4.

---

## 4) Detaillierte Programm-Audits

## 4.1 Terminplaner
**Ist-Trigger:**
- Umfrage zugewiesen: `@terminplaner.js#1388-1400`
- X Tage vor Ablauf: `@terminplaner.js#1402-1416`
- Termin feststeht: `@terminplaner.js#1418-1431`
- Ausfuehrung bei Snapshot-Aenderungen: `@terminplaner.js#1438-1456`

**Gap:**
- `termin_geaendert` ist in Definitionen vorhanden, wird aber im Modul nicht ausgelost: `@pushmail-notifications.js#101-110`.

**Soll-Ergaenzungen:**
- Termin geaendert (alt/neu)
- Teilnehmer hat noch nicht abgestimmt (T-x Tage)
- Umfrage geschlossen ohne finalDate

---

## 4.2 Zahlungsverwaltung
**Ist-Trigger (eventbasiert):**
- Einladung eingehend: `@zahlungsverwaltung.js#7569-7582`
- Antwort auf Einladung: `@zahlungsverwaltung.js#7788-7803`

**Gap:**
- Keine Reminder fuer offene/verzugene Zahlungen, keine Status- oder Faelligkeitstrigger.

**Soll-Ergaenzungen:**
- Zahlung seit X Tagen offen
- Deadline heute/ueberfaellig
- Teilzahlungen ohne Fortschritt

---

## 4.3 Ticket Support
**Ist-Trigger:**
- Ticket zugewiesen: `@ticket-support.js#898-911`
- X Tage vor Faelligkeit: `@ticket-support.js#913-927`
- Triggerlauf bei Listenerupdate: `@ticket-support.js#216-241`

**Wesentlicher Fehler:**
- Remindertext liest `ticket.title`, Datenmodell nutzt `subject`: `@ticket-support.js#894`, `@ticket-support.js#506`, `@ticket-support.js#546`, `@ticket-support.js#561`.

**Soll-Ergaenzungen:**
- Wiedereroeffnetes Ticket
- SLA-Stufe erreicht (z. B. 24h ohne Bearbeitung)
- Eskalation bei hoher Prioritaet + ueberfaellig

---

## 4.4 Wertguthaben
**Ist-Trigger:** `@wertguthaben.js#412-506`
- `x_tage_vor_einloesefrist`
- `x_tage_vor_ablauf_code`
- `x_tage_vor_warnung`
- `x_tage_vor_gueltig_ab`
- `x_tage_vor_gueltig_bis`

**Kritische Feldmismatches:**
1) Typ-Mismatch:
- Gespeichert: `aktionscode`: `@wertguthaben.js#829-830`, `@wertguthaben.js#865`
- Geprueft: `Aktionscode`: `@wertguthaben.js#441`, `@wertguthaben.js#472`, `@wertguthaben.js#488`
2) Warnungsfeld-Mismatch:
- Gespeichert als `warnung`: `@wertguthaben.js#838`, `@wertguthaben.js#853`
- Geprueft als `warnungVorAblauf`: `@wertguthaben.js#457`

**Soll-Ergaenzungen:**
- Trigger bei Statuswechsel (`aktiv -> abgelaufen`, `aktiv -> eingelost`)
- Trigger bei niedrigem Restwert

---

## 4.5 Lizenzen
**Ist-Trigger:**
- X Tage vor Ablauf: `@lizenzen.js#552-577`
- Ausfuehrung bei Listenerupdate: `@lizenzen.js#470-493`

**Gap:**
- Keine Events (neu erstellt, deaktiviert, bereits abgelaufen importiert).

**Soll-Ergaenzungen:**
- Sofortalarm bei bereits abgelaufener Lizenz
- Event bei Deaktivierung/Entzug

---

## 4.6 Vertragsverwaltung
**Ist-Trigger:** `@vertragsverwaltung.js#1542-1621`
- Vor Vertragsbeginn
- Vor Vertragsende
- Vor Kuendigungsdatum (aus Frist berechnet)
- Vor Erinnerungsfeld

**Ausfuehrung:** bei Vertragslistener `@vertragsverwaltung.js#1518-1534`

**Gap:**
- `x_tage_vor_erinnerung` wird ohne klares Zielzeitpunkt-Konzept erzeugt (kein `targetDate` im Payload): `@vertragsverwaltung.js#1604-1614`.
- Kein Event-Trigger bei Aenderungen an Kuendigungsstatus.

**Soll-Ergaenzungen:**
- Trigger bei Wechsel Kuendigungsstatus
- Trigger bei Preis-/Rhythmus-Aenderung

---

## 4.7 Haushaltszahlungen
**Ist-Trigger:** `@haushaltszahlungen.js#652-766`
- `status_nicht_okay`
- `x_tage_vor_gueltig_ab`
- `x_tage_vor_gueltig_bis`
- `x_tage_vor_erinnerung`

**Ausfuehrung:** bei Snapshot in `listenForHaushaltszahlungen`: `@haushaltszahlungen.js#561-577`

**Alarm-Ereignisse und Bedingungen (IST, verifiziert):**

1) **Pushmail-Alarmereignis `status_nicht_okay`**
- **Ereignis:** Es wird eine Pushmail-Benachrichtigung vom Typ `status_nicht_okay` erzeugt.
- **Fachliche Bedingung:** In `checkHaushaltszahlungenForNotifications()` muss pro Eintrag gelten: `status === 'fehler' || status === 'alarm'`: `@haushaltszahlungen.js#673-689`.
- **Realer Ist-Zustand:** `berechneStatus()` liefert aktuell nur `fehler`, `n-aktiv-geplant`, `n-aktiv-vergangen`, `aktiv`; **kein** `alarm`: `@haushaltszahlungen.js#625-647`.
- **Technische Pflichtbedingungen im Pushmail-Kern:** Global aktiv, Programm aktiv, Notification aktiv, kein Duplikat (pending/ack gleicher Inhalt), gueltiger Versandzeitpunkt (nicht in Vergangenheit, ausser `sendImmediately`): `@pushmail-notifications.js#509-611`.

2) **Dashboard-Alarmereignis `Deckungsalarm` (Unter-/Ueberdeckung)**
- **Ereignis:** Roter Alarmzaehler (`⚠️ X ALARM(E)`) + Alarm-Modal im Dashboard.
- **Fachliche Bedingungen:**
  - `unterdeckung`, wenn `betrag < sollAnteil - 0.01` und `sollAnteil > 0`: `@haushaltszahlungen.js#1119-1127`
  - `ueberdeckung`, wenn `betrag > sollAnteil + 0.01` und `sollAnteil > 0`: `@haushaltszahlungen.js#1127-1135`
  - SOLL-Berechnung basiert nur auf `status === 'aktiv'`: `@haushaltszahlungen.js#1083-1086`.
- **Anzeige-Bedingung:** Sobald `stats.alarme.length > 0` fliesst dies in `gesamtAlarme` ein; bei `gesamtAlarme > 0` wird der rote Alarmstatus gesetzt: `@haushaltszahlungen.js#1175-1182`.

3) **Dashboard-Alarmereignis `Aktiver Eintrag ohne Betrag`**
- **Ereignis:** Ebenfalls Teil des roten Dashboard-Alarms + im Alarm-Modal als "Eintraege ohne Betrag".
- **Fachliche Bedingung:** Eintrag ist `aktiv` und `betrag` ist `undefined`, `null` oder `''` (Wert `0` ist explizit gueltig): `@haushaltszahlungen.js#960-965`.
- **Anzeige-Bedingung:** Diese Eintraege werden zu `gesamtAlarme` addiert: `@haushaltszahlungen.js#1175-1182`.

4) **Gesamtstatus-Alarm (`ALARM`) aus Fehlerzaehler**
- **Ereignis:** `berechneGesamtStatus()` liefert `ALARM`.
- **Fachliche Bedingung:** `stats.counts.fehler > 0`: `@haushaltszahlungen.js#1142-1146`.

**Wichtige Abgrenzung:**
- `Deckungsalarme` und `Eintraege ohne Betrag` erzeugen aktuell **nur UI-Alarmzustand** (Dashboard/Modal), aber keinen eigenen Pushmail-Typ.
- Der einzige explizite Pushmail-"Alarm" in Haushaltszahlungen ist derzeit `status_nicht_okay`: `@pushmail-notifications.js#313-322`, `@haushaltszahlungen.js#679-683`.

**Konsistenzproblem:**
- Pruefung auf `status === 'alarm'` vorhanden: `@haushaltszahlungen.js#676-679`
- `berechneStatus` liefert keinen `alarm`: `@haushaltszahlungen.js#625-647`

**Soll-Ergaenzungen:**
- Klare Trennung fachlicher Alarmtypen (Validierung, Deckung, Termin)
- Trigger fuer Einladungsstatus-Events

---

## 4.8 Sendungsverwaltung
**Ist-Trigger (intendiert):**
- `x_tage_vor_ablauf_sendung` beim Speichern einer Sendung: `@sendungsverwaltung.js#547-566`

**Kritische Defekte:**
1) Falsches Datumfeld:
- Modell speichert `deadlineErwartet`/`deadlineVersand`: `@sendungsverwaltung.js#507-508`
- Trigger liest `erwarteteAnkunft`: `@sendungsverwaltung.js#549-550`
2) Nummernfeld-Mismatch:
- Modell speichert `transportnummer`: `@sendungsverwaltung.js#502`
- Trigger-Payload nutzt `sendungsnummer`: `@sendungsverwaltung.js#551`, `@sendungsverwaltung.js#563`

**Folge:** Trigger feuert in der Praxis unzuverlaessig bis gar nicht.

**Soll-Ergaenzungen:**
- Trennung nach Typ (`empfang`/`versand`/`ruecksendung`) und jeweiligem Deadline-Feld
- Event `sendung_zugestellt` (bereits in Definition, aber aktuell kein Aufruf): `@pushmail-notifications.js#373-382`

---

## 4.9 Notizen
**Ist:**
- Keine Pushmail-Anbindung (kein Import/Call): `@notizen.js#6-15`
- Aber Reminder-relevante Daten vorhanden:
  - `gueltigAb`, `gueltigBis`, `erinnerungen`: `@notizen.js#1533-1537`
  - UI zeigt Erinnerungsindikator/Statistik: `@notizen.js#1705-1707`, `@notizen.js#1939-1971`

**Gap:** Reminder leben nur innerhalb Notizenlogik, ohne Pushmail-Bruecke.

**Soll-Ergaenzungen:**
- Vor `gueltigBis`
- Terminierte `erinnerungen[]`
- Event bei Freigabe-/Rechteaenderung (falls geteilt)

---

## 4.10 Geschenkemanagement
**Ist:**
- Keine Pushmail-Anbindung (kein Import/Call): `@geschenkemanagement.js#8-18`
- Eigene Erinnerungs-Collection + Listener:
  - Ref/Listener: `@geschenkemanagement.js#518-531`, `@geschenkemanagement.js#803-832`
  - Reminder-Modal + Speichern: `@geschenkemanagement.js#3006-3105`

**Gap:** Erinnerungen sind gespeichert, aber nicht an Pushmail-Kanal gekoppelt.

**Soll-Ergaenzungen:**
- Vor Anlassdatum / vor Bestelltermin / vor Budgetgrenze
- Event bei Statuswechsel (`offen -> bestellt -> abgeschlossen`)

---

## 4.11 Checkliste
- Keine Pushmail-Anbindung (Import-Set zeigt keine Pushmail-Schnittstelle): `@checklist.js#1-40`.

**Soll-Idee:**
- Reminder fuer faellige Items
- Escalation fuer ueberfaellige, kritische Checklisten

---

## 4.12 Rezepte
- Keine Pushmail-Anbindung: `@rezeptverwaltung.js#5-23`.

**Soll-Idee (optional):**
- Ablauf von Vorrats-/Mealprep-Fristen, geplante Kochtermine

---

## 4.13 Essensberechnung
- Keine Pushmail-Anbindung: `@essensberechnung.js#1-4`.

**Soll-Idee (optional):**
- Erinnerungen fuer geplante Mahlzeiten/Portionsfenster

---

## 4.14 Entrance / Push-Benachrichtigung
- Auf Home sichtbar, aber keine direkte Pushmail-Triggerlogik ueber `createPendingNotification`.
- Home-Karten vorhanden: `@index.html#92-125`
- Pushmail-Center-Programmdefinition listet sie in Legacy Auto-Settings: `@haupteingang.js#1157-1173`

**Bewertung:** fachlich derzeit getrennt von Pushmail-Reminderstrecke.

---

## 5) Querschnittsanalyse (Qualitaet / Risiko)

### 5.1 Zuverlaessigkeit
1. **Client-Scheduler only** (kein serverseitiger Garant): `@pushmail-notifications.js#1221-1347`
2. **Vergangenheitsfilter** dropt Benachrichtigungen, wenn App spaet startet: `@pushmail-notifications.js#595-601`
3. **Ack-Dedupe per Title/Message** kann fachlich neue Faelle mit gleichem Text blockieren: `@pushmail-notifications.js#603-611`

### 5.2 Konfigurationskonsistenz
1. **Duale Konfigurationen parallel**
   - Legacy Auto-Settings: `@haupteingang.js#1190-1418`
   - Pushmail-Definitions-Settings: `@pushmail-settings-ui.js#17-374`
   - Beide im selben View aktiv: `@haupteingang.js#1542-1548`
2. **Custom-Text-Ruecksetzung**
   - Save setzt pro Typ wieder Default-Texte: `@pushmail-settings-ui.js#356-363`
   - Trotz separater Custom-Speicherung: `@pushmail-settings-ui.js#513-514`

### 5.3 Datenkonsistenz
- Mehrere Feldnamen-Mismatches in Modulen (Wertguthaben, Sendungen, Ticket).

### 5.4 UX-/Semantikluecken
- `overlayEnabled` wird gespeichert, aber nicht als harte Anzeigeunterdrueckung genutzt: `@pushmail-notifications.js#629-631`, `@pushmail-notifications.js#706-729`.
- `regularScheduledTime` ohne Nutzung: `@pushmail-notifications.js#585-593`, `@pushmail-notifications.js#623`.

---

## 6) Soll-Triggerkatalog (zielbildorientiert)

## 6.1 Pflichtprogramm (P1): Vollabdeckung Startseite
- Terminplaner: `termin_geaendert`, `nicht_abgestimmt_bis_x`
- Ticket: `ueberfaellig`, `eskalation_ohne_reaktion`
- Wertguthaben: `statuswechsel_abgelaufen`, `restwert_unter_schwelle`
- Vertraege: `kuendigungsstatus_geaendert`, `beitrag_geaendert`
- Haushaltszahlungen: `deckung_unterdeckung`, `einladung_status_geaendert`
- Sendungen: `zustellung`, `frist_ruecksendung_naht`
- Notizen/Geschenke: Bruecke von vorhandenen Erinnerungsfeldern/collections auf Pushmail
- Checkliste: `item_faellig`, `liste_ueberfaellig`

## 6.2 Triggerklassen standardisieren
- **DATE_BASED** (targetDate + daysBeforeX)
- **STATUS_BASED** (Statuswechsel / Problemstatus)
- **EVENT_BASED** (Einladung, Zuweisung, Antwort, Aenderung)

## 6.3 Einheitliche Payload-Konvention
- Pflichtfelder: `id`, `path`, `entityTitle`, `targetDate?`, `eventType`, `context`
- Einheitliche Namenskonvention fuer Datumsfelder (`deadlineX` statt Mischformen)

---

## 7) Priorisierte Sanierungs-Roadmap (nur Plan, keine Umsetzung)

## Phase P0 (kritisch, zuerst)
1. Sendungsverwaltung Feldmismatch fixen (`erwarteteAnkunft` vs `deadline*`, `sendungsnummer` vs `transportnummer`)
2. Wertguthaben Typ-/Warnungsfeldmismatch fixen
3. Ticket `title`/`subject` fixen
4. Haushaltszahlungen `alarm`-Zweig fachlich korrekt machen
5. Doppelte Einstellungsstrecke im Pushmail-Center konsolidieren

## Phase P1 (Abdeckung)
1. Notizen + Geschenkemanagement an Pushmail anbinden
2. Checkliste in Triggerkatalog integrieren
3. Terminplaner `termin_geaendert` aktivieren
4. Sendungsverwaltung `sendung_zugestellt` integrieren

## Phase P2 (Qualitaet)
1. `overlayEnabled` technisch wirksam machen
2. `regularScheduledTime` nutzen oder entfernen
3. Custom-Text Save robust machen (kein Default-Overwrite)
4. Testmatrix pro Triggerklasse etablieren

## Phase P3 (Betriebssicherheit)
1. Serverseitige Dispatch-Option (Cloud Functions/Scheduler) evaluieren
2. Retry/Backoff/Dead-letter fuer Pushover
3. Monitoring fuer Trigger- und Versandraten

---

## 8) Offene Entscheidungen

1. **Single Source of Truth** fuer Einstellungen:
   - Nur `pushmail_settings` (empfohlen) oder paralleles Legacy-Modell?
2. **Scheduling-Strategie**:
   - Client-only beibehalten vs. serverseitig absichern?
3. **Notizen/Geschenke Modellierung**:
   - Einzelne Reminder als Event-Trigger oder normalisierte Date-Trigger?
4. **Acknowledge-Dedupe-Regel**:
   - Vergleich ueber `title/message` ausreichend oder fachlicher Hash noetig?
5. **Rechte-/Scope-Modell** bei geteilten Daten:
   - Trigger fuer Owner, Assignee oder alle Beteiligten?

---

## 9) Living-Protocol Format fuer Folgeiterationen

Bei jeder Umsetzungsetappe ergaenzen:
- Datum
- Geaenderte Module
- Trigger-ID(s)
- Migration/Backfill notwendig? (ja/nein)
- Risiken/Regressionen
- Testfaelle + Ergebnis

---

## 10) Changelog

- **v1.0 (Bestandsaufnahme):** Initiale Vollanalyse aller Startseiten-Programme, Triggerbestand, Gaps, Risiken und Ziel-Roadmap.
