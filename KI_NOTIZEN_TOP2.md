# TOP2 – KI Notizen (Firebase / Firestore / Auth)

## Wichtigste Konstanten
- **appId**: `20LVob88b3ovXRUyX3ra`
- **Firestore Root (Frontend)**: `/artifacts/{appId}/public/data/...`

## Auth / Custom Claims
- Firestore Rules erwarten teilweise: `request.auth.token.appUserId`
- Cloud Function:
  - Pfad: `GoogleCloud/top2-funktionen/functions/index.js`
  - Function: `setRoleClaim`
  - Setzt Custom Claims: `{ appRole, appUserId }` via `admin.auth().setCustomUserClaims(...)`
- Frontend-Tokenprüfung (temporär, Debug): `getIdTokenResult(true)`

## Login Hardening
- Datei: `log-InOut.js`
- Funktion: `checkCurrentUserValidity()`
- Zusatzprüfung: `token.claims.appUserId` muss zu `storedAppUserId` (localStorage/App-User) passen. Bei Mismatch -> `switchToGuestMode(...)`.

## Nachrichtencenter Pfade
- Global: `/nachrichtencenter_global_contacts/{contactId}`
- Private: `/nachrichtencenter_private_contacts/{userId}/contacts/{contactId}`
- Rules-Logik:
  - Global create/update/delete: Systemadmin oder `appUserId == createdByAppUserId`
  - Private read/write: Systemadmin oder `appUserId == userId`

## Zahlungsverwaltung Pfade (Frontend: `zahlungsverwaltung.js`)
- `/payments`
- `/payment-templates`
- `/private-contacts`
- `/private-accounts`
- `/payment-categories`

## Vertragsverwaltung (Mismatch-Fix)
Frontend nutzt:
- `/vertraege_themen/{themaId}`
- `/vertraege_themen/{themaId}/vertraege/{vertragId}`
- `/vertraege_themen/{themaId}/kategorien/{kategorieId}`
- `/vertraege_einladungen/{einladungId}`

Fix:
- `firestore.rules` wurde erweitert um `match`-Blöcke für `vertraege_themen` (inkl. Subcollections) und `vertraege_einladungen`.
- Du hast die Rules anschließend in Firebase Console **published**.

## Hinweis für künftige Änderungen
- Wenn `firestore.rules` geändert wird, muss es in Firebase Console wieder **published** werden.
