# Pushmail-Center Benachrichtigungssystem - Dokumentation

## Übersicht

Das Pushmail-Center Benachrichtigungssystem ist eine zentrale Nachrichtenstelle für automatische Alarme aus allen Programmen der TOP2-App. Es ermöglicht Benutzern, Benachrichtigungen per Pushover an ihre eigenen Geräte zu senden.

## Implementierte Funktionen

### 1. Zentrale Verwaltung
- **User-Key Verwaltung**: Jeder Benutzer kann seinen persönlichen Pushover User-Key im Pushmail-Center speichern
- **Kontaktbuch**: Verwaltung von API-Tokens und Group-Keys für verschiedene Anwendungen
- **Für alle Benutzer verfügbar**: Das Pushmail-Center ist für alle eingeloggten Benutzer zugänglich, unabhängig von Berechtigungen

### 2. Benachrichtigungstypen

Das System unterstützt 24 verschiedene Benachrichtigungstypen über 7 Programme:

#### Termin finden (4 Typen)
- Umfrage zugewiesen
- X Tage vor Ablauf der Umfrage
- Termin feststeht
- Terminänderung

#### Zahlungsverwaltung (2 Typen)
- Eingehende Teilungsanfrage
- Antwort auf Teilungsanfrage

#### Ticket Support (2 Typen)
- Neues Ticket zugewiesen
- X Tage vor Fälligkeit

#### Wertguthaben (5 Typen)
- X Tage vor Einlösefrist
- X Tage vor Ablaufdatum Code
- X Tage vor Warnung
- X Tage vor Gültig ab (nur Aktionscode)
- X Tage vor Gültig bis (nur Aktionscode)

#### Lizenzen (1 Typ)
- X Tage vor Ablauftag

#### Vertragsverwaltung (4 Typen)
- X Tage vor Vertragsbeginn
- X Tage vor Vertragsende
- X Tage vor Kündigungsdatum
- X Tage vor Erinnerung & Notizen

#### Haushaltszahlungen (4 Typen)
- Status nicht okay
- X Tage vor Gültig AB
- X Tage vor Gültig BIS
- X Tage vor Erinnerung

### 3. Einstellungsmöglichkeiten

Für jede Benachrichtigung können folgende Einstellungen vorgenommen werden:

- **Status**: Aktiv / Pausiert / Deaktiviert
- **Uhrzeit**: Wann die Benachrichtigung gesendet werden soll
- **Wiederholung**: Alle X Tage wiederholen (0 = einmalig)
- **Tage vorher**: Bei zeitbasierten Benachrichtigungen (z.B. "X Tage vor Ablauf")
- **Benutzerdefinierter Text**: Titel und Nachricht anpassen
- **Platzhalter**: Dynamische Werte wie {umfrageName}, {daysLeft}, etc.

### 4. Globale Steuerung

- **Global AN/AUS**: Alle Benachrichtigungen mit einem Klick aktivieren/deaktivieren
- **Programm-spezifisch**: Jedes Programm kann einzeln aktiviert/deaktiviert werden
- **Standard wiederherstellen**: Einzelne Benachrichtigungen oder alle auf Standardwerte zurücksetzen

### 5. Quittierungssystem

- **Startseiten-Modal**: Beim Öffnen der App werden ausstehende Benachrichtigungen angezeigt
- **Einzeln quittieren**: Benachrichtigungen können einzeln bestätigt werden
- **Mehrfach quittieren**: Ausgewählte oder alle Benachrichtigungen auf einmal quittieren
- **Pushmail-Center Ansicht**: Ausstehende Benachrichtigungen werden mit Pulsieren angezeigt

### 6. Automatischer Versand

- **Scheduler**: Prüft alle 5 Minuten auf fällige Benachrichtigungen
- **Pushover-Integration**: Sendet Nachrichten automatisch an konfigurierte Geräte
- **Wiederholungen**: Benachrichtigungen können automatisch wiederholt werden

## Dateistruktur

### Neue Dateien

1. **[`pushmail-notifications.js`](pushmail-notifications.js:1)**
   - Kern-Modul mit Benachrichtigungsdefinitionen
   - Funktionen zum Erstellen, Laden, Speichern von Benachrichtigungen
   - Quittierungs-System
   - Scheduler und Pushover-Integration

2. **[`pushmail-settings-ui.js`](pushmail-settings-ui.js:1)**
   - UI-Komponenten für Benachrichtigungseinstellungen
   - Rendering der Programm-Liste mit Benachrichtigungen
   - Text-Anpassungs-Modal
   - Event-Listener für Einstellungen

3. **[`plans/pushmail-center-erweiterungen.md`](plans/pushmail-center-erweiterungen.md:1)**
   - Detaillierter Plan für Basis-Erweiterungen

4. **[`plans/pushmail-benachrichtigungssystem.md`](plans/pushmail-benachrichtigungssystem.md:1)**
   - Vollständiger Implementierungsplan

### Geänderte Dateien

1. **[`index.html`](index.html:1)**
   - Pushmail-Center Leiste nach oben verschoben (Zeile 53)
   - Ausstehende Benachrichtigungen im Pushmail-Center (Zeile 956)
   - Startseiten-Modal für Quittierung (Zeile 5670)
   - Text-Anpassungs-Modal (Zeile 5702)

2. **[`haupteingang.js`](haupteingang.js:1)**
   - Import der Benachrichtigungsmodule (Zeile 21-27)
   - Initialisierung beim App-Start (Zeile 505-511)
   - Initialisierung im Pushmail-Center View (Zeile 1327)
   - Berechtigungsprüfung für pushmailCenter entfernt (Zeile 1347)

3. **[`log-InOut.js`](log-InOut.js:1)**
   - Pushmail-Center Leiste für alle eingeloggten Benutzer sichtbar (Zeile 475)

4. **[`notfall.js`](notfall.js:1)**
   - USERS importiert (Zeile 2)
   - Vollständiger Name im Kontaktbuch (Zeile 60)

## Firestore-Datenstruktur

### Benachrichtigungseinstellungen
```
artifacts/{appId}/users/{userId}/pushmail_settings
{
  globalEnabled: boolean,
  programs: {
    TERMINPLANER: {
      enabled: boolean,
      notifications: {
        umfrage_zugewiesen: {
          state: "active" | "paused" | "disabled",
          time: "08:00",
          repeatDays: 0,
          daysBeforeX: null,
          customTitle: "...",
          customMessage: "..."
        },
        ...
      }
    },
    ...
  },
  updatedAt: timestamp
}
```

### Ausstehende Benachrichtigungen
```
artifacts/{appId}/users/{userId}/pushmail_pending_notifications/{notificationId}
{
  programId: "TERMINPLANER",
  notificationType: "umfrage_zugewiesen",
  title: "Neue Umfrage zugewiesen",
  message: "Du wurdest zu einer Umfrage eingeladen: Weihnachtsfeier",
  createdAt: timestamp,
  scheduledFor: timestamp,
  lastSentAt: timestamp | null,
  nextSendAt: timestamp,
  repeatDays: 0,
  acknowledged: boolean,
  acknowledgedAt: timestamp | null,
  relatedDataId: "umfrageId123",
  relatedDataPath: "..."
}
```

### Quittierte Benachrichtigungen (Archiv)
```
artifacts/{appId}/users/{userId}/pushmail_acknowledged_notifications/{notificationId}
{
  ... (gleiche Struktur wie pending)
  acknowledgedAt: timestamp
}
```

## Verwendung

### Benachrichtigung erstellen (Beispiel)

```javascript
import { createPendingNotification } from './pushmail-notifications.js';

// In einem Programm (z.B. Terminplaner)
async function onUmfrageZugewiesen(umfrageId, umfrageName, zugewieseneUserId) {
    await createPendingNotification(
        zugewieseneUserId,
        'TERMINPLANER',
        'umfrage_zugewiesen',
        {
            umfrageName: umfrageName,
            ersteller: currentUser.displayName,
            id: umfrageId,
            path: `artifacts/${appId}/public/data/votes/${umfrageId}`,
            targetDate: new Date() // Sofort
        }
    );
}
```

### Benachrichtigung mit X Tage vor Datum

```javascript
// Erinnerung 3 Tage vor Ablauf
async function onUmfrageAblaufErinnerung(umfrageId, umfrageName, ablaufDatum, zugewieseneUserId) {
    await createPendingNotification(
        zugewieseneUserId,
        'TERMINPLANER',
        'x_tage_vor_ablauf',
        {
            umfrageName: umfrageName,
            daysLeft: 3,
            ablaufDatum: ablaufDatum.toLocaleDateString('de-DE'),
            id: umfrageId,
            path: `artifacts/${appId}/public/data/votes/${umfrageId}`,
            targetDate: ablaufDatum // Datum von dem zurückgerechnet wird
        }
    );
}
```

## Noch zu implementieren

Die folgenden Komponenten sind geplant, aber noch nicht implementiert:

1. **Trigger-Integration in Programme**:
   - Terminplaner: Trigger bei Umfrage-Ereignissen
   - Zahlungsverwaltung: Trigger bei Teilungsanfragen
   - Ticket Support: Trigger bei Ticket-Ereignissen
   - Wertguthaben: Trigger bei Ablaufdaten
   - Lizenzen: Trigger bei Lizenzablauf
   - Vertragsverwaltung: Trigger bei Vertragsereignissen
   - Haushaltszahlungen: Trigger bei Status und Daten

2. **Firestore-Sicherheitsregeln**:
   - Zugriffsregeln für Benachrichtigungseinstellungen
   - Zugriffsregeln für ausstehende Benachrichtigungen
   - Zugriffsregeln für Archiv

3. **Erweiterte Funktionen**:
   - Benachrichtigungsverlauf anzeigen
   - Statistiken über gesendete Benachrichtigungen
   - Export/Import von Einstellungen
   - Benachrichtigungs-Templates

## Technische Hinweise

- **Performance**: Benachrichtigungen werden gecacht, um Firestore-Abfragen zu minimieren
- **Sicherheit**: Benutzer können nur ihre eigenen Benachrichtigungen sehen und verwalten
- **Erweiterbarkeit**: Neue Programme und Benachrichtigungstypen können einfach in `NOTIFICATION_DEFINITIONS` hinzugefügt werden
- **Platzhalter**: Jedes Programm muss die korrekten Daten für Platzhalter bereitstellen

## Support

Bei Fragen oder Problemen siehe:
- [`plans/pushmail-center-erweiterungen.md`](plans/pushmail-center-erweiterungen.md:1)
- [`plans/pushmail-benachrichtigungssystem.md`](plans/pushmail-benachrichtigungssystem.md:1)
