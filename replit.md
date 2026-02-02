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
- **Notizen-Modul hinzugefügt**: Vollständiges Notizen-System mit:
  - Kategorien und Unterkategorien (Einstellungen)
  - Freigabe-System für Kategorien und einzelne Notizen (Lese-/Schreibrechte pro Benutzer)
  - Verschiedene Element-Typen: Textbereich, Checkpunkte (To-Do-Listen), Aufzählungen (Punkte/Zahlen), Passwortfelder (mit Kopier-Button), Tabellen, Links
  - Elemente können verschoben, bearbeitet und gelöscht werden (max. 2 nebeneinander)
  - Gültigkeitszeitraum pro Notiz (von/bis oder unbegrenzt)
  - Filter- und Suchfunktion wie im Geschenkemanagement
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
