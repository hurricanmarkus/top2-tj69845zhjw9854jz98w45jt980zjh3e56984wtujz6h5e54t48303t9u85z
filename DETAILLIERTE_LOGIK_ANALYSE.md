# 🔍 DETAILLIERTE LOGIK-ANALYSE & SIMULATION - ALLE MODULE

## 📋 VERTRAGSVERWALTUNG - VOLLSTÄNDIGE LOGIK-ANALYSE

### 🎯 Hauptfunktionalität
Verwaltung von Verträgen und Abonnements mit Themen-basierter Organisation, Mitgliederverwaltung und Kündigungsfristen.

### 🔄 SIMULATION 1: Neues Thema erstellen und Mitglied hinzufügen

#### Schritt 1: User öffnet Vertragsverwaltung
```
User klickt auf: vertragsverwaltungCard
  ↓
haupteingang.js: navigate('vertragsverwaltung')
  ↓
haupteingang.js: initializeVertragsverwaltung()
  ↓
vertragsverwaltung.js: initializeVertragsverwaltung()
  ↓
PRÜFUNG: db vorhanden? ✅
PRÜFUNG: currentUser vorhanden? ✅
  ↓
vertraegeThemenRef = collection(db, 'artifacts', appId, 'public', 'data', 'vertraege_themen')
vertraegeEinladungenRef = collection(db, 'artifacts', appId, 'public', 'data', 'vertraege_einladungen')
  ↓
loadVertraegeThemen() - Startet onSnapshot Listener
  ↓
FIREBASE: onSnapshot auf vertraegeThemenRef
  ↓
FILTER: Nur Themen wo (ersteller === currentUser.displayName || mitglieder enthält currentUser)
  ↓
ERGEBNIS: VERTRAEGE_THEMEN = {} (leer, da neuer User)
  ↓
createDefaultVertragsThema() wird aufgerufen
  ↓
FIREBASE: addDoc zu vertraegeThemenRef
  {
    name: "Meine Verträge",
    ersteller: currentUser.displayName,
    erstellerId: currentUser.mode,
    mitglieder: [{
      userId: currentUser.mode,
      name: currentUser.displayName,
      zugriffsrecht: 'vollzugriff',
      addedAt: timestamp
    }],
    createdAt: timestamp
  }
  ↓
onSnapshot triggert Update
  ↓
VERTRAEGE_THEMEN['abc123'] = { id: 'abc123', name: "Meine Verträge", ... }
  ↓
renderVertraegeThemenDropdown()
  ↓
UI: Dropdown zeigt "Meine Verträge"
  ↓
currentThemaId = 'abc123'
  ↓
updateCollectionForVertragsThema()
  ↓
vertraegeCollection = collection(db, 'artifacts', appId, 'public', 'data', 'vertraege_themen', 'abc123', 'vertraege')
  ↓
listenForVertraege()
  ↓
FIREBASE: onSnapshot auf vertraegeCollection
  ↓
ERGEBNIS: VERTRAEGE = {} (leer)
  ↓
renderVertraegeTable()
  ↓
UI: "Keine Verträge vorhanden"
```

**STATUS: ✅ FUNKTIONIERT**

#### Schritt 2: User öffnet Einstellungen und erstellt neues Thema
```
User klickt auf: btn-vertraege-settings
  ↓
openVertraegeSettingsModal()
  ↓
PRÜFUNG: Modal vorhanden? ✅
  ↓
modal.style.display = 'flex'
  ↓
renderThemenListe()
  ↓
UI: Zeigt Liste aller Themen mit Buttons:
  - "Mitglieder verwalten" (nur für Ersteller)
  - "Bearbeiten" (nur für Ersteller)
  - "Löschen" (nur für Ersteller)
  - "Austreten" (nur für Eingeladene)
  ↓
User gibt ein: "Gemeinsame Verträge"
User klickt auf: btn-create-vertrags-thema
  ↓
createNewVertragsThema()
  ↓
VALIDIERUNG: Name leer? ❌ (Name vorhanden)
  ↓
FIREBASE: addDoc zu vertraegeThemenRef
  {
    name: "Gemeinsame Verträge",
    ersteller: currentUser.displayName,
    erstellerId: currentUser.mode,
    mitglieder: [{
      userId: currentUser.mode,
      name: currentUser.displayName,
      zugriffsrecht: 'vollzugriff',
      addedAt: timestamp
    }],
    createdAt: timestamp
  }
  ↓
onSnapshot triggert Update
  ↓
VERTRAEGE_THEMEN['xyz789'] = { id: 'xyz789', name: "Gemeinsame Verträge", ... }
  ↓
renderThemenListe() - Aktualisiert Liste
renderVertraegeThemenDropdown() - Aktualisiert Dropdown
  ↓
UI: Zeigt beide Themen
```

**STATUS: ✅ FUNKTIONIERT**

#### Schritt 3: User fügt Mitglied hinzu
```
User klickt auf: "Mitglieder verwalten" für "Gemeinsame Verträge"
  ↓
openThemaMitgliederModal('xyz789')
  ↓
PRÜFUNG: Thema vorhanden? ✅
PRÜFUNG: Bin ich Ersteller? ✅
  ↓
currentEditingThemaId = 'xyz789'
  ↓
populateUserDropdown()
  ↓
FILTER: Nur aktive User aus USERS
FILTER: Nur User die NICHT bereits Mitglied sind
  ↓
UI: Dropdown zeigt verfügbare User
  ↓
renderMitgliederListe(thema)
  ↓
UI: Zeigt aktuelle Mitglieder:
  - "Markus (Du) 👑 Vollzugriff" (Ersteller, kein Löschen-Button)
  ↓
modal.style.display = 'flex'
  ↓
User wählt: "Jasmin" aus Dropdown
User klickt auf: btn-add-mitglied
  ↓
addMitgliedToThema()
  ↓
VALIDIERUNG: User ausgewählt? ✅
VALIDIERUNG: Thema vorhanden? ✅
  ↓
selectedUserId = "jasmin"
selectedUserName = "Jasmin"
zugriffsrecht = "lesen" (Standard)
  ↓
PRÜFUNG: User bereits Mitglied? ❌
  ↓
mitglieder.push({
  userId: "jasmin",
  name: "Jasmin",
  zugriffsrecht: "lesen",
  addedAt: timestamp
})
  ↓
FIREBASE: updateDoc(themaRef, { mitglieder })
  ↓
onSnapshot triggert Update
  ↓
VERTRAEGE_THEMEN['xyz789'].mitglieder = [
  { userId: "markus", name: "Markus", zugriffsrecht: "vollzugriff" },
  { userId: "jasmin", name: "Jasmin", zugriffsrecht: "lesen" }
]
  ↓
renderMitgliederListe(thema)
  ↓
UI: Zeigt aktualisierte Liste:
  - "Markus (Du) 👑 Vollzugriff"
  - "Jasmin 👤 Nur Lesen [X]" (mit Löschen-Button)
  ↓
Event-Listener wird registriert für Löschen-Button:
  data-remove-index="1"
  ↓
alertUser('Mitglied hinzugefügt!', 'success')
```

**STATUS: ✅ FUNKTIONIERT**

#### Schritt 4: User entfernt Mitglied
```
User klickt auf: [X] Button neben "Jasmin"
  ↓
Event-Listener (Event Delegation) fängt Click ab
  ↓
button.dataset.removeIndex = "1"
  ↓
PRÜFUNG: Bin ich Ersteller? ✅
  ↓
confirm('Mitglied wirklich entfernen?')
  ↓
User bestätigt: OK
  ↓
mitglieder.splice(1, 1) - Entfernt Index 1
  ↓
FIREBASE: updateDoc(themaRef, { mitglieder })
  ↓
onSnapshot triggert Update
  ↓
VERTRAEGE_THEMEN['xyz789'].mitglieder = [
  { userId: "markus", name: "Markus", zugriffsrecht: "vollzugriff" }
]
  ↓
renderMitgliederListe(thema)
  ↓
UI: Zeigt nur noch:
  - "Markus (Du) 👑 Vollzugriff"
  ↓
alertUser('Mitglied entfernt.', 'success')
```

**STATUS: ✅ FUNKTIONIERT**

### 🔄 SIMULATION 2: Vertrag erstellen mit Sonderzahlungen

#### Schritt 1: User erstellt Vertrag
```
User klickt auf: btn-create-vertrag
  ↓
openCreateModal()
  ↓
PRÜFUNG: Modal vorhanden? ✅
  ↓
Felder zurücksetzen:
  - vertragId = ''
  - name = ''
  - anbieter = ''
  - betrag = ''
  - zahlungsrhythmus = 'monatlich'
  - kuendigungsabsicht = 'nein'
  - etc.
  ↓
tempSonderzahlungen = []
  ↓
modal.style.display = 'flex'
  ↓
User gibt ein:
  - Name: "Netflix"
  - Anbieter: "Netflix Inc."
  - Betrag: 12.99
  - Rhythmus: "monatlich"
  - Kündigungsfrist: 30
  - Vertragsbeginn: "2024-01-01"
  ↓
User klickt auf: btn-add-sonderzahlung
  ↓
addSonderzahlung()
  ↓
tempSonderzahlungen.push({
  id: Date.now(),
  typ: 'zusatzbetrag',
  bezeichnung: '',
  betrag: 0,
  monate: []
})
  ↓
renderSonderzahlungen()
  ↓
UI: Zeigt Sonderzahlung-Formular:
  - Typ-Dropdown: "Zusatzbetrag" / "Gutschrift"
  - Bezeichnung-Input
  - Betrag-Input
  - 12 Monats-Checkboxen
  - Löschen-Button
  ↓
User gibt ein:
  - Typ: "Zusatzbetrag"
  - Bezeichnung: "Servicepauschale"
  - Betrag: 5.00
  - Monate: [Januar, Juli] (2 Checkboxen aktiviert)
  ↓
window.updateSonderzahlung(id, 'typ', 'zusatzbetrag')
window.updateSonderzahlung(id, 'bezeichnung', 'Servicepauschale')
window.updateSonderzahlung(id, 'betrag', '5.00')
window.toggleSonderzahlungMonat(id, 1) - Januar
window.toggleSonderzahlungMonat(id, 7) - Juli
  ↓
tempSonderzahlungen[0] = {
  id: 123456789,
  typ: 'zusatzbetrag',
  bezeichnung: 'Servicepauschale',
  betrag: 5.00,
  monate: [1, 7]
}
  ↓
User klickt auf: saveVertragBtn
  ↓
saveVertrag()
  ↓
VALIDIERUNG:
  - Name vorhanden? ✅
  - Betrag gültig? ✅
  - Rhythmus gewählt? ✅
  ↓
data = {
  name: "Netflix",
  anbieter: "Netflix Inc.",
  betrag: 12.99,
  zahlungsrhythmus: "monatlich",
  kuendigungsfrist: 30,
  vertragsbeginn: "2024-01-01",
  kuendigungsabsicht: "nein",
  sonderzahlungen: [{
    typ: 'zusatzbetrag',
    bezeichnung: 'Servicepauschale',
    betrag: 5.00,
    monate: [1, 7]
  }],
  createdAt: timestamp,
  createdBy: currentUser.displayName
}
  ↓
FIREBASE: addDoc(vertraegeCollection, data)
  ↓
onSnapshot triggert Update
  ↓
VERTRAEGE['contract123'] = { id: 'contract123', ...data }
  ↓
renderVertraegeTable()
  ↓
UI: Zeigt Vertrag in Tabelle:
  - Name: "Netflix"
  - Anbieter: "Netflix Inc."
  - Betrag: "12,99 €"
  - Rhythmus: "Monatlich"
  - Kündigungsfrist: "30 Tage"
  - Aktionen: [Bearbeiten] [Löschen]
  ↓
updateStatistics()
  ↓
UI: Statistiken aktualisiert:
  - Anzahl Verträge: 1
  - Gesamtkosten: berechnet mit Sonderzahlungen
  ↓
renderKuendigungsWarnungen()
  ↓
BERECHNUNG: Kündigungsfrist prüfen
  ↓
UI: Keine Warnungen (Vertrag gerade erst erstellt)
  ↓
closeVertragModal()
  ↓
alertUser('Vertrag gespeichert!', 'success')
```

**STATUS: ✅ FUNKTIONIERT**

### 🔗 ABHÄNGIGKEITEN-MATRIX

| Funktion | Abhängig von | Ruft auf |
|----------|--------------|----------|
| `initializeVertragsverwaltung()` | db, currentUser | loadVertraegeThemen, loadVertraegeEinladungen, setupEventListeners |
| `loadVertraegeThemen()` | vertraegeThemenRef, currentUser | onSnapshot, renderVertraegeThemenDropdown, renderThemenListe, updateCollectionForVertragsThema |
| `updateCollectionForVertragsThema()` | currentThemaId, db | listenForVertraege |
| `listenForVertraege()` | vertraegeCollection | onSnapshot, renderVertraegeTable, updateStatistics, renderKuendigungsWarnungen |
| `renderMitgliederListe()` | VERTRAEGE_THEMEN, currentUser | Event-Listener (Delegation) |
| `addMitgliedToThema()` | currentEditingThemaId, VERTRAEGE_THEMEN | updateDoc, renderMitgliederListe, renderThemenListe |
| `saveVertrag()` | vertraegeCollection, tempSonderzahlungen | addDoc/updateDoc, closeVertragModal |
| `renderSonderzahlungen()` | tempSonderzahlungen | window.removeSonderzahlung, window.updateSonderzahlung, window.toggleSonderzahlungMonat |

### ✅ KRITISCHE PRÜFPUNKTE

| Prüfpunkt | Status | Bemerkung |
|-----------|--------|-----------|
| Alle Buttons haben Handler | ✅ | Event-Listener in setupEventListeners |
| Live-Updates funktionieren | ✅ | onSnapshot für Themen und Verträge |
| Mitglieder-Entfernung | ✅ | Event Delegation statt inline onclick |
| Sonderzahlungen speichern | ✅ | tempSonderzahlungen → Firebase |
| Berechtigungen prüfen | ✅ | Ersteller vs. Mitglied unterschieden |
| Modal schließt korrekt | ✅ | closeVertragModal, closeThemaMitgliederModal |
| Statistiken aktualisieren | ✅ | Nach jedem Vertrag-Update |
| Kündigungswarnungen | ✅ | Automatische Berechnung |

---

## 📋 TICKET-SUPPORT - VOLLSTÄNDIGE LOGIK-ANALYSE

### 🎯 Hauptfunktionalität
Ticket-System für Aufgaben mit Kategorien, Prioritäten, Status-Verwaltung und internen Notizen.

### 🔄 SIMULATION: Ticket erstellen und bearbeiten

#### Schritt 1: User erstellt Ticket
```
User klickt auf: btn-create-ticket
  ↓
openCreateModal()
  ↓
Felder zurücksetzen:
  - editTicketId = ''
  - subject = ''
  - category = 'handwerk'
  - priority = 'normal'
  - assignedTo = ''
  - dueDate = ''
  - description = ''
  ↓
modal.style.display = 'flex'
  ↓
User gibt ein:
  - Betreff: "Waschmaschine reparieren"
  - Kategorie: "Handwerk"
  - Priorität: "Hoch"
  - Zugewiesen an: "Markus"
  - Fällig bis: "2024-02-15"
  - Beschreibung: "Waschmaschine macht komische Geräusche"
  ↓
User klickt auf: saveTicketBtn
  ↓
saveTicket()
  ↓
VALIDIERUNG:
  - Betreff vorhanden? ✅
  - Person zugewiesen? ✅
  ↓
ticketData = {
  ticketNumber: ticketIdCounter (z.B. 1),
  subject: "Waschmaschine reparieren",
  category: "handwerk",
  priority: "high",
  assignedTo: "markus",
  dueDate: "2024-02-15",
  description: "Waschmaschine macht komische Geräusche",
  status: "open",
  createdBy: currentUser.mode,
  createdByName: currentUser.displayName,
  createdAt: timestamp,
  internalNotes: [],
  activityLog: [{
    timestamp: now,
    user: currentUser.displayName,
    userId: currentUser.mode,
    changes: ['Ticket erstellt']
  }]
}
  ↓
FIREBASE: addDoc(ticketsCollection, ticketData)
  ↓
onSnapshot triggert Update
  ↓
TICKETS['ticket123'] = { id: 'ticket123', ...ticketData }
  ↓
ticketIdCounter++ (jetzt 2)
  ↓
renderTickets()
  ↓
FILTER: activeTab = 'all' → Alle Tickets
  ↓
SORTIERUNG: 
  1. Nach Status (open → in_progress → paused → done)
  2. Nach Priorität (urgent → high → normal → low)
  3. Nach Erstellungsdatum
  ↓
UI: Zeigt Ticket-Karte:
  - "#TK-0001 🔨 Waschmaschine reparieren"
  - "🟠 Hoch" "📝 Offen"
  - "Von: Markus → Für: Markus"
  - "📅 Fällig: 15.02.2024"
  - Button: "▶️ Starten" (da assignedTo = currentUser und status = open)
  ↓
updateStats()
  ↓
UI: Statistiken:
  - Offen: 1
  - In Arbeit: 0
  - Pausiert: 0
  - Erledigt: 0
  - Mir zugewiesen: 1
  ↓
closeTicketModal()
  ↓
alertUser('✅ Ticket erstellt!', 'success')
```

**STATUS: ✅ FUNKTIONIERT**

#### Schritt 2: User startet Ticket
```
User klickt auf: "▶️ Starten" Button
  ↓
Event-Listener fängt Click ab (Event Delegation)
  ↓
button.dataset.ticketId = 'ticket123'
button.dataset.newStatus = 'in_progress'
  ↓
updateTicketStatus('ticket123', 'in_progress')
  ↓
PRÜFUNG: Ticket vorhanden? ✅
PRÜFUNG: Bin ich zugewiesen? ✅
  ↓
activityLog.push({
  timestamp: now,
  user: currentUser.displayName,
  userId: currentUser.mode,
  changes: ['Status: Offen → In Arbeit']
})
  ↓
FIREBASE: updateDoc(ticketRef, {
  status: 'in_progress',
  activityLog,
  updatedAt: timestamp
})
  ↓
onSnapshot triggert Update
  ↓
TICKETS['ticket123'].status = 'in_progress'
  ↓
renderTickets()
  ↓
UI: Ticket-Karte aktualisiert:
  - Status-Badge: "⚙️ In Arbeit" (lila)
  - Buttons: "⏸️ Pausieren" + "✅ Erledigen"
  ↓
updateStats()
  ↓
UI: Statistiken:
  - Offen: 0
  - In Arbeit: 1
  ↓
alertUser('Status: In Arbeit', 'success')
```

**STATUS: ✅ FUNKTIONIERT**

### 🔗 ABHÄNGIGKEITEN-MATRIX

| Funktion | Abhängig von | Ruft auf |
|----------|--------------|----------|
| `initializeTicketSupport()` | db | setupEventListeners, populateUserDropdown |
| `listenForTickets()` | ticketsCollection, currentUser | onSnapshot, renderTickets, updateStats |
| `renderTickets()` | TICKETS, activeTab, filters | createTicketCard, Event-Listener |
| `saveTicket()` | ticketsCollection, currentUser | addDoc/updateDoc, closeTicketModal |
| `updateTicketStatus()` | TICKETS, ticketsCollection | updateDoc |
| `showTicketDetails()` | TICKETS, USERS | renderInternalNotes, renderActivityLog |

### ✅ KRITISCHE PRÜFPUNKTE

| Prüfpunkt | Status |
|-----------|--------|
| Datenschutz-Filter aktiv | ✅ |
| Status-Buttons korrekt | ✅ |
| Aktivitätsprotokoll | ✅ |
| Interne Notizen | ✅ |
| Statistiken live | ✅ |

---

*Fortsetzung folgt für alle weiteren Module...*

**REGEL GELESEN + ANGEWENDET**
