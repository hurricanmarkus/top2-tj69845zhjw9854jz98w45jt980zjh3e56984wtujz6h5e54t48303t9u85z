# TOP 2 Smart Home App

## Übersicht
Eine Progressive Web App (PWA) für das Smart Home Management, entwickelt mit nativem JavaScript und Firebase. Die Anwendung ist auf Deutsch und bietet Funktionen für Haushaltsverwaltung, Zahlungen, Verträge, Rezepte, Notizen und mehr.

## Projektstruktur
- `index.html` - Hauptdatei mit allen Ansichten.
- `style.css` - Benutzerdefinierte Stile.
- `sw.js` - Service Worker für PWA-Funktionalität.
- `manifest.json` - PWA-Konfiguration.
- `firebase.json` - Firebase-Konfiguration.
- `firestore.rules` - Firestore Sicherheitsregeln.
- `notizen.js` - Notizen-Modul mit Kategorien, Freigaben und verschiedenen Elementtypen.

## Letzte Änderungen (02.02.2026)
- **Notizen-System erweitert**:
  - **Status-System**: 3 Zustände - Offen (gelb), Abgeschlossen (grün), [INFO] (blau) mit visuellen Badges
  - **Multi-Filter-System**: Wie im Geschenkemanagement mit NICHT-Operator und Kategorie-Auswahl
  - **Standard-Filter**: Abgeschlossene Notizen werden automatisch ausgeblendet
  - **Viewer-Ansicht**: Vollständige Metadaten (Kategorie, Gültig ab/bis, Freigaben mit Rechten, Status)
  - **Erweitert-Menü**: Bearbeiten + Weitere Optionen → Löschen (jetzt korrekt als Untermenü)
  - **Status-Dropdown** im Editor zum Setzen des Notiz-Status
  - **Kategorie ist Pflichtfeld** beim Speichern
  - **Gültig-bis Feld**: Automatisch deaktiviert wenn "unbegrenzt" aktiv
  - **Unterüberschrift**: Jedes Element kann eine optionale Unterüberschrift haben
  - **Trennlinie**: Neues Element-Typ für horizontale Trennlinien
  - **Hintergrundfarben**: 25 Farben (inkl. transparent) für jedes Element wählbar
- **Admin-Bereich korrigiert**:
  - Einrückung für NOTIZEN_CREATE, GESCHENKEMANAGEMENT_CREATE, HAUSHALTSZAHLUNGEN_CREATE (pl-6 Klasse)
  - Checkbox-Abhängigkeiten: Unterpunkte nur aktivierbar wenn Hauptpunkt aktiv
- **Vorherige Notizen-Funktionen**:
  - Kategorien und Unterkategorien (Einstellungen)
  - Freigabe-System für Kategorien und einzelne Notizen (Lese-/Schreibrechte pro Benutzer)
  - Verschiedene Element-Typen: Textbereich, Checkpunkte, Aufzählungen, Passwortfelder, Tabellen, Links, Trennlinie
  - Elemente können verschoben, bearbeitet und gelöscht werden (max. 2 nebeneinander)
  - Gültigkeitszeitraum pro Notiz (von/bis oder unbegrenzt)
  - Erinnerungen über Pushmail-Center-Integration

## Tech Stack
- **Frontend**: Vanilla JavaScript, TailwindCSS (CDN).
- **Backend**: Google Cloud Functions & Firebase (Firestore, Authentication).
- **Vorschau**: Statischer Python HTTP-Server.

## Ausführung
Die App wird über einen statischen Python-Server bereitgestellt:
```bash
python3 -m http.server 5000 --bind 0.0.0.0
```

## Firebase & Cloud Functions
Diese App kommuniziert direkt vom Browser aus mit:
- **Firebase Auth**: Für die Benutzeranmeldung.
- **Firestore**: Als Echtzeit-Datenbank.
- **Cloud Functions**: Über HTTPS-Calls oder Firebase SDKs für Backend-Logik.
