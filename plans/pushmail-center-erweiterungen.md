# Pushmail-Center Erweiterungen - Implementierungsplan

## Übersicht
Erweiterung des Pushmail-Centers um User-Key-Verwaltung und Kontaktbuch-Funktionalität mit visuellen Warnungen.

## Anforderungen

### 1. Persönlicher Pushover User-Key
- **Speicherung**: Nur EIN User-Key pro Benutzer
- **Eingabe**: Eingabefeld im Pushmail-Center View
- **Validierung**: Key-Format prüfen
- **Speicherort**: Firebase Firestore unter Benutzerprofil

### 2. Kontaktbuch für API-Keys und Group-Keys
- **Felder pro Kontakt**:
  - Titel (Name des Kontakts)
  - Key (API-Key oder Group-Key)
  - Typ: "Anwendung" oder "Gruppe" (Dropdown/Radio)
- **Funktionen**:
  - Kontakt hinzufügen
  - Kontakt bearbeiten
  - Kontakt löschen
  - Liste aller Kontakte anzeigen

### 3. Visuelle Warnung bei fehlendem User-Key

#### Startseite (Pushmail-Center Leiste)
- **Wenn kein User-Key gespeichert**:
  - Leiste ist dauerhaft sichtbar
  - Leiste blinkt (CSS Animation)
  - Ausblenden ist NICHT möglich
  
- **Wenn User-Key gespeichert**:
  - Leiste ist standardmäßig ausgeblendet
  - Leiste kann ein-/ausgeblendet werden (Toggle-Button)

#### Pushmail-Center View
- **Wenn kein User-Key gespeichert**:
  - Warnhinweis prominent anzeigen
  - Hinweis blinkt
  - Direkter Link zum Eingabefeld

## Technische Umsetzung

### Datenstruktur

#### User-Key Speicherung
```
artifacts/{appId}/public/data/pushover_programs/{userId}
{
  userKey: "string",
  apiToken: "string",
  updatedAt: timestamp
}
```

#### Kontaktbuch Speicherung
```
artifacts/{appId}/public/data/pushmail_contacts/{userId}/contacts/{contactId}
{
  title: "string",
  key: "string",
  type: "Anwendung" | "Gruppe",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### UI-Komponenten

#### 1. Pushmail-Center View Erweiterungen

**User-Key Sektion** (bereits vorhanden, erweitern):
- Eingabefeld für User-Key
- Speichern-Button
- Anzeige des maskierten Keys
- Warnhinweis wenn leer (blinkend)

**Kontaktbuch Sektion** (neu):
```html
<div class="card bg-white p-4 rounded-xl shadow-lg border-t-4 border-fuchsia-600 space-y-4">
  <div class="flex justify-between items-center">
    <h3 class="text-lg font-bold text-gray-800">Kontaktbuch</h3>
    <button id="addContactBtn" class="bg-fuchsia-600 text-white px-3 py-1 rounded-lg">
      + Kontakt hinzufügen
    </button>
  </div>
  
  <div id="contactsList" class="space-y-2">
    <!-- Kontakte werden hier gerendert -->
  </div>
</div>
```

**Kontakt-Formular Modal**:
```html
<div id="contactFormModal" class="modal">
  <div class="modal-content">
    <h3>Kontakt hinzufügen/bearbeiten</h3>
    <input type="text" id="contactTitle" placeholder="Titel">
    <input type="text" id="contactKey" placeholder="API-Key / Group-Key">
    <select id="contactType">
      <option value="Anwendung">Anwendung</option>
      <option value="Gruppe">Gruppe</option>
    </select>
    <button id="saveContactBtn">Speichern</button>
    <button id="cancelContactBtn">Abbrechen</button>
  </div>
</div>
```

#### 2. Startseite - Pushmail-Center Leiste

**Blink-Animation** (CSS):
```css
@keyframes blink-warning {
  0%, 50%, 100% { opacity: 1; }
  25%, 75% { opacity: 0.5; }
}

.pushmail-warning-blink {
  animation: blink-warning 2s infinite;
}
```

**Toggle-Funktionalität**:
- Icon zum Ein-/Ausblenden hinzufügen
- Zustand in localStorage speichern
- Nur verfügbar wenn User-Key gespeichert

### JavaScript-Funktionen

#### User-Key Verwaltung
```javascript
// Prüfen ob User-Key gespeichert ist
async function hasUserKey() {
  const userId = currentUser.mode;
  const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'pushover_programs', userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() && docSnap.data()?.userKey;
}

// User-Key Status aktualisieren
async function updatePushmailWarningState() {
  const hasKey = await hasUserKey();
  const leiste = document.getElementById('pushmailCenterBar');
  
  if (!hasKey) {
    leiste.classList.add('pushmail-warning-blink');
    leiste.classList.remove('hidden');
    // Toggle-Button deaktivieren
  } else {
    leiste.classList.remove('pushmail-warning-blink');
    // Toggle-Button aktivieren
  }
}
```

#### Kontaktbuch Verwaltung
```javascript
// Kontakte laden
async function loadPushmailContacts() {
  const userId = currentUser.mode;
  const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'pushmail_contacts', userId, 'contacts');
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Kontakt hinzufügen
async function addPushmailContact(title, key, type) {
  const userId = currentUser.mode;
  const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'pushmail_contacts', userId, 'contacts');
  await addDoc(colRef, {
    title,
    key,
    type,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// Kontakt bearbeiten
async function updatePushmailContact(contactId, title, key, type) {
  const userId = currentUser.mode;
  const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'pushmail_contacts', userId, 'contacts', contactId);
  await updateDoc(docRef, {
    title,
    key,
    type,
    updatedAt: serverTimestamp()
  });
}

// Kontakt löschen
async function deletePushmailContact(contactId) {
  const userId = currentUser.mode;
  const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'pushmail_contacts', userId, 'contacts', contactId);
  await deleteDoc(docRef);
}

// Kontakte rendern
function renderPushmailContacts(contacts) {
  const list = document.getElementById('contactsList');
  if (contacts.length === 0) {
    list.innerHTML = '<p class="text-sm text-gray-400 text-center">Keine Kontakte vorhanden</p>';
    return;
  }
  
  list.innerHTML = contacts.map(contact => `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
      <div class="flex-grow">
        <div class="font-semibold text-gray-800">${contact.title}</div>
        <div class="text-xs text-gray-500">
          <span class="font-mono">${maskKey(contact.key)}</span>
          <span class="ml-2 px-2 py-0.5 bg-gray-200 rounded text-xs">${contact.type}</span>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="edit-contact-btn text-blue-600 hover:text-blue-800" data-id="${contact.id}">
          ✏️
        </button>
        <button class="delete-contact-btn text-red-600 hover:text-red-800" data-id="${contact.id}">
          🗑️
        </button>
      </div>
    </div>
  `).join('');
}

// Key maskieren
function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}
```

## Implementierungsschritte

### Phase 1: Datenstruktur und Backend
1. Firebase Firestore Struktur für Kontakte erstellen
2. Sicherheitsregeln in `firestore.rules` anpassen
3. Funktionen für CRUD-Operationen implementieren

### Phase 2: UI-Komponenten
1. Kontaktbuch-Sektion im Pushmail-Center View hinzufügen
2. Modal für Kontakt-Formular erstellen
3. CSS-Animationen für Blink-Effekt hinzufügen
4. Toggle-Button für Leiste auf Startseite hinzufügen

### Phase 3: JavaScript-Logik
1. User-Key Status-Prüfung implementieren
2. Kontaktbuch CRUD-Funktionen implementieren
3. Event-Listener für Buttons registrieren
4. Warnzustand-Verwaltung implementieren

### Phase 4: Integration und Testing
1. Funktionen in `haupteingang.js` integrieren
2. Initialisierung beim Laden der View
3. Testen aller Szenarien:
   - Kein User-Key gespeichert
   - User-Key gespeichert
   - Kontakte hinzufügen/bearbeiten/löschen
   - Toggle-Funktionalität

## Dateien die geändert werden müssen

1. **index.html**
   - Pushmail-Center View erweitern
   - Modal für Kontakt-Formular hinzufügen

2. **style.css**
   - Blink-Animation hinzufügen
   - Styling für Kontaktbuch

3. **haupteingang.js**
   - Funktionen für User-Key Status
   - Funktionen für Kontaktbuch
   - Event-Listener
   - Initialisierung

4. **firestore.rules**
   - Zugriffsregeln für Kontakte

## Offene Fragen

1. Soll der User-Key auch im Kontaktbuch erscheinen oder nur separat?
2. Sollen Kontakte zwischen Benutzern geteilt werden können?
3. Soll es eine Suchfunktion im Kontaktbuch geben?
4. Soll die Leiste auf der Startseite auch bei anderen Warnungen blinken?

## Nächste Schritte

Nach Genehmigung dieses Plans:
1. In Code-Modus wechseln
2. Phase 1 implementieren
3. Schrittweise durch alle Phasen arbeiten
4. Nach jeder Phase testen
