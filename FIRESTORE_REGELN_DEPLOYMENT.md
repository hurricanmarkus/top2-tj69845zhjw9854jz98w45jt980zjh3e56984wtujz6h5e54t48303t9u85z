# Firestore-Regeln Deployment Anleitung

## Problem
Die neuen Firestore-Regeln für das Pushmail-Benachrichtigungssystem müssen deployed werden, damit die Benachrichtigungen korrekt funktionieren.

## Fehler ohne Deployment
```
FirebaseError: Missing or insufficient permissions
```

## Lösung 1: Firebase CLI (Empfohlen)

### Schritt 1: Firebase-Projekt initialisieren
```bash
firebase use --add
```
Wählen Sie Ihr Firebase-Projekt aus der Liste aus.

### Schritt 2: Firestore-Regeln deployen
```bash
firebase deploy --only firestore:rules
```

## Lösung 2: Firebase Console (Manuell)

### Schritt 1: Firebase Console öffnen
1. Öffnen Sie https://console.firebase.google.com/
2. Wählen Sie Ihr Projekt aus
3. Navigieren Sie zu "Firestore Database" → "Regeln"

### Schritt 2: Neue Regeln hinzufügen
Fügen Sie folgende Regeln **VOR** der letzten `match /{path=**}` Regel hinzu:

```javascript
// ═══════════════════════════════════════════════════════════════
// PUSHMAIL-CENTER BENACHRICHTIGUNGEN (Notification System)
// ═══════════════════════════════════════════════════════════════

// Pushmail-Einstellungen (pro Benutzer)
match /artifacts/20LVob88b3ovXRUyX3ra/users/{userId}/settings/{settingId} {
  allow read, write: if hasAppUserIdClaim() && appUserId() == userId;
}

// Ausstehende Benachrichtigungen (pro Benutzer)
match /artifacts/20LVob88b3ovXRUyX3ra/users/{userId}/pushmail_notifications/{notificationId} {
  allow read, write: if hasAppUserIdClaim() && appUserId() == userId;
}
```

### Schritt 3: Regeln veröffentlichen
Klicken Sie auf "Veröffentlichen" um die Regeln zu aktivieren.

## Überprüfung
Nach dem Deployment sollten folgende Operationen funktionieren:
- ✅ Benachrichtigungen erstellen
- ✅ Benachrichtigungen laden
- ✅ Benachrichtigungen quittieren
- ✅ Einstellungen speichern/laden

## Firestore-Struktur
```
artifacts/
  {appId}/
    users/
      {userId}/
        settings/
          pushmail_settings (Document)
        pushmail_notifications/
          {notificationId} (Document)
          {notificationId} (Document)
          ...
```
