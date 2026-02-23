# Suchfilter-Kategorien Uebersicht

Diese Doku listet pro Programm, welche Kategorien bei einer Suche als klickbare Vorschlaege unter dem Suchfeld erscheinen (zum Speichern als Filter-Tag) und welche vorhandenen Kategorien **nicht** in der Vorschlagsliste auftauchen.

Beispiel (wie von dir beschrieben): In Geschenkemanagement kann bei Eingabe von `Alexander` z. B. `Fuer: Alexander` und `Alles: "Alexander"` erscheinen, wenn Daten dazu passen.

---

## 1) Geschenkemanagement

### Klickbare Kategorien unter dem Suchfeld
- Status
- Fuer
- Von
- Geschenk
- Shop
- Bezahlt von
- Beteiligung
- Gesamtkosten
- Eigene Kosten
- Bestellnummer
- Rechnungsnummer
- Notizen
- Sollkonto
- Istkonto
- Standort
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Kontodifferenz

### Hinweis
- Die jeweilige Kategorie wird nur vorgeschlagen, wenn es dazu Treffer gibt.
- `Alles` wird als Fallback-Suggestion hinzugefuegt.

---

## 2) Sendungsverwaltung

### Klickbare Kategorien unter dem Suchfeld
- Status
- Anbieter
- Produkt
- Absender
- Empfaenger
- Prioritaet
- Tag
- Bestellnummer
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Keine zusaetzliche Kategorie.

### Hinweis
- Kategorien erscheinen nur bei Treffern.
- Sonderfall: `Alles` wird zwar erzeugt, ist aber nur sichtbar, wenn mindestens eine der anderen Kategorien Treffer hat.

---

## 3) Zahlungsverwaltung

### Klickbare Kategorien unter dem Suchfeld
- Von
- An
- Inhalt
- Nummer/ID
- Datum
- Kategorie (technisch: `category_id`, erscheint als "Kategorie: <Name>")
- Betrag
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- `id` (interner Alias in der Filterlogik; UI nutzt `Nummer/ID`)

### Hinweis
- `Kategorie` erscheint als Suggest nur, wenn ein Kategoriename zur Eingabe passt.
- `Alles` wird immer als Fallback angeboten.

---

## 4) Ticket Support

### Klickbare Kategorien unter dem Suchfeld
- Ticket-ID
- Betreff
- Kategorie
- Status
- Prioritaet
- Ersteller
- Zugewiesen
- Faelligkeit
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Keine.

### Hinweis
- Kategorien erscheinen nur bei Treffern.
- `Alles` wird als Fallback angeboten.

---

## 5) Notizen

### Klickbare Kategorien unter dem Suchfeld
- Titel
- Inhalt
- Status
- Kategorie
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Keine.

### Hinweis
- Kategorien erscheinen nur bei Treffern.
- `Alles` wird als Fallback angeboten.

---

## 6) Wertguthaben

### Klickbare Kategorien unter dem Suchfeld
- Name
- Code
- Unternehmen
- Eigentuemer
- Typ
- Status
- Wert/Betrag
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Keine.

### Hinweis
- Kategorien erscheinen nur bei Treffern.
- `Alles` wird als Fallback angeboten.

---

## 7) Lizenzen

### Klickbare Kategorien unter dem Suchfeld
- Produkt
- Kategorie
- Titel
- Version
- Aktiviert auf
- Shop
- Code
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Keine zusaetzliche dedizierte Kategorie.

### Hinweis
- Kategorien erscheinen nur bei Treffern.
- `Alles` wird als Fallback angeboten.
- Ueber `Alles` werden zusaetzlich Felder durchsucht (ohne eigene Suggest-Kategorie), z. B. `lizenziertAn`, `notizen`, `beschraenkungen`, Datums-/Volumenfelder.

---

## 8) Vertragsverwaltung

### Klickbare Kategorien unter dem Suchfeld
- Name
- Anbieter
- Kategorie
- Unterkategorie
- Zahlungsrhythmus
- Kuendigungsabsicht
- Vertragsstatus
- Betrag
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Keine.

### Hinweis
- Kategorien erscheinen nur bei Treffern.
- `Alles` wird als Fallback angeboten.

---

## 9) Rezeptverwaltung

### Klickbare Kategorien unter dem Suchfeld
- Titel
- Rezept-ID
- Kategorie
- Arbeitszeit
- Bewertung
- Typ
- Mappen-Nr.
- Zutaten
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Keine zusaetzliche Such-Tag-Kategorie.

### Hinweis
- Kategorien erscheinen nur bei Treffern.
- `Alles` wird als Fallback angeboten.
- Es gibt zusaetzliche erweiterte Filter im Panel (unabhaengig von Suggest-Tags).

---

## 10) Haushaltszahlungen

### Klickbare Kategorien unter dem Suchfeld
- Zweck
- Organisation
- Status
- Typ
- Intervall
- Betrag
- Kundennummer
- Vertragsnummer
- Alles (Volltext)

### Vorhanden, aber nicht als Suggest-Kategorie sichtbar
- Keine.

### Hinweis
- Kategorien erscheinen nur bei Treffern.
- `Alles` wird als Fallback angeboten.

---

## Kurzfazit

- **Echte Differenz zwischen vorhandenen Kategorien vs. Suggest-Liste** gibt es vor allem in:
  - Geschenkemanagement: `Kontodifferenz` vorhanden, aber nicht als Suggest
  - Zahlungsverwaltung: interner Alias `id` (nicht als eigene Suggest)
- In den anderen gelisteten Programmen decken die Suggest-Kategorien die vorhandenen Such-Tag-Kategorien weitgehend ab.
