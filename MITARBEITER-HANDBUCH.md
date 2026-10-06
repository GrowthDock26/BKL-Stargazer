# BKL Legal OS — Mitarbeiter-Handbuch

**Version 1.1 · Stand Juni 2026**
**BKL Rechtsanwälte**

---

## Inhalt

1. Was ist BKL Legal OS?
2. Was kann BKL Legal OS — und was nicht?
3. Zusammenspiel mit RA-Micro
4. Schritt-für-Schritt: Der vollständige Workflow
5. Fristen verwalten
6. RVG-Gebührenrechner
7. Wichtige Hinweise zu KI-generierten Dokumenten
8. Häufige Fragen
9. **Spezialmandat: Pro Real Europa 9 / 10 (PRE9 / PRE10)**

---

## 1. Was ist BKL Legal OS?

BKL Legal OS ist das interne KI-gestützte Dokumenten- und Workflow-System der Kanzlei BKL Rechtsanwälte. Es unterstützt die Mandatsbearbeitung vom ersten Kundengespräch bis zur Klageeinreichung.

**Das System hilft dabei:**
- Aufnahmedaten eines Mandanten strukturiert zu erfassen
- Onboarding-Dokumente (Anschreiben, Honorarvereinbarung, Vollmacht) automatisch zu erzeugen
- Anspruchsschreiben mit KI-Unterstützung zu entwerfen
- Fristen zu erfassen und im Blick zu behalten
- Den aktuellen Bearbeitungsstand jeder Akte auf einen Blick zu zeigen

---

## 2. Was kann BKL Legal OS — und was nicht?

### ✅ BKL Legal OS übernimmt:

| Aufgabe | Wer |
|---|---|
| Mandantendaten erfassen (Aufnahmebogen) | ReFa / Anwalt |
| Onboarding-Dokumente erzeugen und verwalten | ReFa / Anwalt |
| Anspruchsschreiben als KI-Entwurf erstellen | Anwalt |
| Fristen eintragen und überwachen | ReFa / Anwalt |
| Akten-Status verfolgen (wo stehen wir?) | Alle |
| RVG-Gebühren überschlägig berechnen | Alle |
| Dokumente sicher speichern (EU-Server) | Automatisch |

### ❌ BKL Legal OS übernimmt NICHT:

| Aufgabe | Bleibt in: |
|---|---|
| Aktenverwaltung (Anlage, Strukturierung) | **RA-Micro** |
| Zeiterfassung | **RA-Micro** |
| Abrechnung und Rechnungsstellung | **RA-Micro** |
| beA-Einreichung (technisch) | **RA-Micro / beA-Client** |
| Buchführung und DATEV-Übergabe | **RA-Micro** |
| Gerichtskorrespondenz (Schriftsätze im laufenden Verfahren) | **RA-Micro / manuell** |

> **Merksatz:** RA-Micro ist das führende System für Aktenführung und Abrechnung.
> BKL Legal OS ist das System für KI-gestützte Dokumentenerstellung und Fristenverwaltung.

---

## 3. Zusammenspiel mit RA-Micro

Die beiden Systeme arbeiten **nebeneinander**, nicht gegeneinander.

**Reihenfolge beim Anlegen einer neuen Akte:**

```
RA-Micro                          BKL Legal OS
──────────────────────────────    ──────────────────────────────
1. Neue Akte anlegen              2. Neue Akte anlegen
   → Kurzbezeichnung eingeben        → RA-Micro Aktennummer
   → Aktennummer wird vergeben           eintragen (z.B. 123/24)
      (z.B. 123/24)                  → Vollständige Aufnahme
                                         erfassen
```

**Was in RA-Micro eingetragen wird:**
- Aktennummer (automatisch vergeben)
- Kurzbezeichnung (z.B. „Müller / Kündigung")
- Mandantenstammdaten (für Abrechnung)

**Was in BKL Legal OS eingetragen wird:**
- Die Aktennummer aus RA-Micro (Verknüpfung)
- Vollständiger Aufnahmebogen (Sachverhalt, Kontaktdaten)
- Alle generierten Dokumente
- Fristen
- Bearbeitungsstand

---

## 4. Schritt-für-Schritt: Der vollständige Workflow

### Phase 1 — Neue Akte anlegen

**Zuerst in RA-Micro:**
1. RA-Micro öffnen
2. Neue Akte anlegen → Kurzbezeichnung eingeben
3. Die vergebene **Aktennummer notieren** (z.B. `123/24`)

**Dann in BKL Legal OS:**
1. Im linken Menü auf **„Mandate"** klicken
2. Oben rechts **„Neue Akte"** klicken
3. Im Formular ausfüllen:
   - **RA-Micro Aktennummer** ← *Pflichtfeld* (z.B. `123/24`)
   - **Kurzbezeichnung** (z.B. `Müller / Kündigung`)
4. **„Akte anlegen"** klicken
5. Sie werden automatisch zur neuen Akte weitergeleitet

---

### Phase 2 — Aufnahmebogen ausfüllen

*Wer: ReFa oder Anwalt*

1. In der Akten-Detailseite erscheint oben die **„Nächste Aufgabe"** in blau
2. Auf **„Aufnahmebogen ausfüllen"** klicken
3. Alle bekannten Felder ausfüllen:
   - Persönliche Daten (Anrede, Vor- und Nachname, Geburtsdatum)
   - Kontaktdaten (E-Mail, Telefon, Adresse)
   - Sachverhalt (Kurzbeschreibung des Anliegens)
   - Unterlagen hochladen (PDF, Word, JPEG — optional)
4. **Datenschutzhinweis** (Art. 13 DSGVO) bestätigen ← *Pflicht*
5. **„Aufnahmebogen speichern"** klicken

> **Hinweis:** Alle mit * markierten Felder sind Pflichtfelder. Je vollständiger der Bogen, desto besser die KI-generierten Dokumente.

---

### Phase 3 — Onboarding-Dokumente erzeugen

*Wer: ReFa (erzeugen) + Anwalt (freigeben)*

Die Kanzlei sendet dem Mandanten drei Dokumente zu:
- **Anschreiben** (mit individuellem Sachverhaltsabschnitt)
- **Honorarvereinbarung** (§ 3a RVG — muss separat unterzeichnet werden)
- **Vollmacht** (§ 80 ZPO — muss unterzeichnet werden)

**Schritt 1 — Dokumente erzeugen (ReFa):**
1. In der Akten-Detailseite auf **„Dokumente erzeugen"** klicken
2. Der KI-Assistent erstellt alle drei Dokumente automatisch
3. Meldung abwarten: „Dokumente wurden erzeugt"

**Schritt 2 — Dokumente freigeben (Anwalt):**
1. Anwalt prüft die erzeugten Dokumente
2. Klick auf **„Freigeben"**

**Schritt 3 — Dokumente versenden (ReFa oder Anwalt):**
1. Klick auf **„An Mandanten versenden"**
2. System zeigt: *„Bitte manuell per E-Mail an [E-Mail-Adresse] senden"*
3. Dokumente aus dem System herunterladen und **manuell per E-Mail** an den Mandanten senden

> **Aktuell:** Der E-Mail-Versand erfolgt manuell. Die Dokumente sind im System gespeichert und können jederzeit heruntergeladen werden.

---

### Phase 4 — Rücklauf bestätigen

*Wer: ReFa*

Sobald der Mandant die **unterzeichnete Vollmacht** und die **unterzeichnete Honorarvereinbarung** zurückgeschickt hat:

1. Unterlagen in die Akte einscannen / ablegen
2. In BKL Legal OS: Blaue Karte „Nächste Aufgabe" → **„Rücklauf bestätigen"** klicken
3. Status wechselt auf **„Rücklauf bestätigt"**

> **Wichtig:** Diesen Schritt erst ausführen, wenn beide Dokumente tatsächlich vorliegen.

---

### Phase 5 — Anspruchsschreiben erstellen

*Wer: Anwalt (Pflicht)*

1. In der Akten-Detailseite oben rechts auf **„Anspruch"** klicken
2. Auf **„Entwurf erzeugen"** klicken
3. Der KI-Assistent erstellt einen vollständigen Erstentwurf
4. Entwurf im Textfeld **sorgfältig prüfen und ggf. bearbeiten**
   - Text ist direkt im Browser bearbeitbar
   - Änderungen werden automatisch gespeichert
5. Nach Prüfung: **„Anspruchsschreiben freigeben"** klicken
6. Empfänger-E-Mail und Reaktionsfrist eingeben → **„Versenden"**
7. System zeigt: *„Bitte manuell per E-Mail senden"*
8. Dokument herunterladen und **manuell an die Gegenseite** senden

> ⚠️ **KI-Hinweis:** Der Entwurf wurde von einem KI-System erstellt.
> Die Freigabe durch den Anwalt ist **Pflicht** — erst dann darf das Schreiben versendet werden.

---

### Phase 6 — Fristüberwachung

*Wer: ReFa*

Nach dem Versand des Anspruchsschreibens:

1. In der Akten-Detailseite → Bereich **„Fristen"** → **„Hinzufügen"**
2. Fristtyp auswählen: `Antwortfrist`
3. Fristende eintragen (Standard: 14 Tage nach Versand)
4. Optional: Erinnerungsdatum setzen
5. **„Frist speichern"**

**Gesamtübersicht aller Kanzlei-Fristen:**
- Im linken Menü unter **„Mandate"** → **„Fristen"** klicken
- Überfällige und dringende Fristen werden rot hervorgehoben
- Erledigte Fristen durch Klick auf das Kästchen abhaken

---

### Phase 7 — Klage (falls keine Einigung)

*Wer: Anwalt*

Nach Fristablauf markiert das System die Akte automatisch zur Klagevorbereitung
(Status „Klage (Entwurf)").

> ⚠️ **Wichtig:** Das System erzeugt **keine** Klageschrift. Es gibt lediglich
> den Status frei. Die Klageschrift ist außerhalb des Systems zu fertigen.

1. Klageschrift außerhalb des Systems fertigen und anwaltlich prüfen
2. **„Klageschrift geprüft"** bestätigen
3. Klage über **beA** beim zuständigen Gericht einreichen (§ 130d ZPO)
4. In BKL Legal OS: **„Klage über beA eingereicht"** bestätigen
5. Status wechselt auf **„Klage eingereicht"**

> **Hinweis:** Die technische Einreichung über beA erfolgt weiterhin über RA-Micro oder den beA-Client — BKL Legal OS dokumentiert lediglich, dass die Einreichung erfolgt ist.

---

## 5. Fristen verwalten

### Frist zu einer Akte hinzufügen
1. Akte öffnen → Bereich „Fristen" → **„Hinzufügen"**
2. Felder ausfüllen:
   - **Art der Frist** (z.B. Antwortfrist, Klagefrist, Verjährungsfrist)
   - **Startdatum** und **Fristende**
   - **Erinnerung** (optionales Datum vor Fristende)
   - **Notiz** (optional, z.B. „per Einschreiben")
3. **„Frist speichern"**

### Kanzleiweite Fristen-Übersicht
- Linkes Menü → **„Mandate"** → **„Fristen"**
- Zeigt alle offenen Fristen **aller Mandate** auf einen Blick
- **Rot = abgelaufen oder diese Woche fällig** → sofort handeln
- Frist als erledigt markieren: Klick auf das Kästchen links

> **Empfehlung:** Die Fristen-Übersicht jeden Morgen als erstes aufrufen.

---

## 6. RVG-Gebührenrechner

Für eine schnelle Gebührenübersicht direkt in der Akte:

1. Akte öffnen → oben rechts **„RVG"** klicken
2. **Streitwert** eingeben (z.B. `15000`)
3. **Tätigkeitsart** wählen:
   - Beratung
   - Außergerichtlich
   - Klage (1. Instanz)
4. **Umsatzsteuersatz** auswählen (Standard: 19 %)
5. Gebührentabelle erscheint automatisch

> ⚠️ **Wichtig:** Diese Berechnung dient nur der schnellen Orientierung nach RVG 2023.
> Die verbindliche Abrechnung erfolgt ausschließlich über **RA-Micro**.
> Honorarvereinbarungen (§ 3a RVG) gehen vor und müssen separat in Textform abgeschlossen werden.

---

## 7. Wichtige Hinweise zu KI-generierten Dokumenten

BKL Legal OS nutzt einen KI-Assistenten (LOGICC), um Dokumente zu entwerfen.

**Folgendes gilt für alle KI-generierten Texte:**

| Regel | Erläuterung |
|---|---|
| Kein Dokument ohne Anwaltsprüfung versenden | Jeder KI-Entwurf muss vor dem Versand vom zuständigen Anwalt freigegeben werden |
| KI macht Fehler | Der Entwurf kann inhaltliche, rechtliche oder sachliche Fehler enthalten |
| Änderungen sind erwünscht | Der Anwalt soll den Entwurf aktiv überarbeiten, nicht nur „durchwinken" |
| Freigabe = Verantwortung | Mit der Freigabe übernimmt der Anwalt die volle Verantwortung für den Inhalt |
| Hinweispflicht | Jedes versendete KI-Dokument enthält automatisch einen Hinweis auf KI-Unterstützung |

**Was die KI nicht macht:**
- Keine eigenständigen Entscheidungen
- Kein Zugriff auf externe Datenbanken oder aktuelle Gerichtsurteile
- Kein Zugriff auf RA-Micro
- Kein automatischer E-Mail-Versand (aktuell manuell)

---

## 8. Häufige Fragen

**Wo finde ich eine bestimmte Akte?**
→ Linkes Menü → „Mandate" → Suchfeld oben eingeben (RA-Micro Aktennummer oder Bezeichnung)

**Ich habe die Aktennummer aus RA-Micro vergessen. Was tun?**
→ RA-Micro öffnen → Akte suchen → Aktennummer notieren → in BKL Legal OS nachtragen (Akte öffnen → oben die Az.-Anzeige ist die Aktennummer)

**Der KI-Entwurf ist inhaltlich falsch. Was tun?**
→ Text direkt im Textfeld korrigieren. Änderungen werden automatisch gespeichert. Erst nach sorgfältiger Prüfung freigeben.

**Ich sehe keine Schaltfläche „Dokumente erzeugen". Warum?**
→ Diese Schaltfläche erscheint nur, wenn der Aufnahmebogen vollständig ausgefüllt ist und der Status „Aufnahme erfasst" ist. Bitte zuerst den Aufnahmebogen speichern.

**Wo werden die Dokumente gespeichert?**
→ Alle Dokumente werden verschlüsselt auf einem deutschen Server (Hetzner, Falkenstein) gespeichert. Sie sind jederzeit aus der Akte abrufbar.

**Kann ich BKL Legal OS auch auf dem Handy nutzen?**
→ Ja, die Anwendung ist für Desktop-Browser optimiert, funktioniert aber grundsätzlich auch auf Tablets und Smartphones.

**Was passiert, wenn ich aus Versehen auf „Rücklauf bestätigen" klicke?**
→ Bitte sofort den zuständigen Anwalt informieren. Der Status kann manuell zurückgesetzt werden.

**Wie erkenne ich, wer welchen Schritt ausführen darf?**
→ In der blauen „Nächste Aufgabe"-Karte steht immer dabei, wer die Aktion ausführen darf (z.B. „Anwalt" oder „ReFa / Anwalt").

---

## Rollen im System

| Rolle | Darf |
|---|---|
| **ReFa** | Akte anlegen, Aufnahme ausfüllen, Onboarding erzeugen, Rücklauf bestätigen, Fristen verwalten |
| **Anwalt** | Alles + Onboarding freigeben/versenden, Anspruchsschreiben erstellen/freigeben, Klage prüfen/einreichen |
| **Admin** | Alles + Kanzleidaten verwalten |

---

## Kontakt bei technischen Problemen

Bei technischen Fragen oder Fehlern wenden Sie sich an:
**schmidt-vollmer@bkl-law.de**

---

## 9. Spezialmandat: Pro Real Europa 9 / 10 (PRE9 / PRE10)

Schadensersatzklagen gegen Emittenten im Zusammenhang mit Pro Real Europa 9 und Pro Real Europa 10.

> **Rubrum immer:** `(Mandant) ./. Steurer u.a.`
> **Gegner (Stand 06/2026, wird ggf. erweitert):**
> - Peter Steurer (RA-Micro-Gegner-Nr. 9218)
> - Malte Thies (RA-Micro-Gegner-Nr. 9219)

**Systemzuordnung auf einen Blick:**

| Schritt | BKL Legal OS | RA-Micro | Manuell |
|---|---|---|---|
| Akte anlegen | ✅ | ✅ | |
| Verjährungsfrist setzen | ✅ | | |
| Aufnahme / Fragebogen | ✅ | | |
| Wiedervorlage | | ✅ | |
| Streitwert berechnen | ✅ RVG-Rechner | ✅ Stammdaten | |
| Deckungsanfrage RSV | | | ✅ Vorlage |
| Aufforderungsschreiben | ✅ Anspruch | | |
| Rechnungsstellung | | ✅ | |
| PRE10.xlsx pflegen | | | ✅ Excel |

---

### Schritt 1 — Kontaktaufnahme

*Wer: Sekretariat*

Bei Anruf oder E-Mail eines Interessenten:

1. **Terminvereinbarung** für Telefonat mit **MM** eintragen
   - Ausnahme: Wenn ausdrücklich **APJ** gewünscht → Termin mit APJ
2. **Sofort notieren:** Hat der Anrufende eine **Rechtsschutzversicherung (RSV)?**
   - Ja / Nein / unbekannt — wird für den weiteren Verlauf benötigt

---

### Schritt 2 — Mandatsanlage

*Wer: Sekretariat*

**In RA-Micro:**
1. Neue Akte anlegen
2. Rubrum: `[Mandantenname] ./. Steurer u.a.`
3. Gegner eintragen: Peter Steurer (9218) und Malte Thies (9219)
4. Aktennummer notieren

**In BKL Legal OS:**
1. **„Neue Akte"** → RA-Micro Aktennummer eintragen
2. Bezeichnung: z.B. `Müller ./. Steurer u.a. (PRE10)`
3. Akte anlegen → Aufnahmebogen öffnen
4. Mandantendaten erfassen (Beitrittserklärung per KI-Analyse hochladen!)

**Sofort nach Aktenanlage — zwei Fristen manuell in BKL Legal OS eintragen:**

| Frist | Datum | Typ |
|---|---|---|
| **Verjährungsfrist** | **31.12.2026** | Verjährungsfrist |
| **Vorfrist** | **15.09.2026** | Notfrist |

> ⚠️ **Pflicht — manuell eintragen und kontrollieren.**
> Diese Fristen werden **nicht automatisch gesetzt**. Das Sekretariat trägt sie bei jeder PRE9/PRE10-Akte unmittelbar nach Anlage ein und bestätigt die Richtigkeit der Daten vor dem Speichern.
> Fehler bei der Verjährungsfrist können zum Rechtsverlust führen.

**Drei Dokumente sofort erstellen und versenden** (Vorlagen: `V:\Manuel Neumann\One Group Muster Klage\`):

| Dokument | Vorlage |
|---|---|
| Außergerichtliche Vollmacht (5-fach) | im Verzeichnis |
| Datenschutzerklärung | im Verzeichnis |
| Widerrufsbelehrung mit sofortiger Beauftragung | im Verzeichnis |
| **Fragebogen.pdf** | im Verzeichnis |

**E-Mail-Text an den Mandanten:**

> Sehr geehrte/r [Name],
>
> vielen Dank für Ihr Interesse an unseren Leistungen! Für die Einrichtung Ihrer Angelegenheit fügen wir in der Anlage bei:
> - eine Datenschutzerklärung,
> - eine Widerrufsbelehrung mit sofortiger Beauftragung,
> - eine außergerichtliche Vollmacht in 5-facher Ausfertigung.
>
> Bitte senden Sie uns diese Unterlagen nach Unterzeichnung auf dem Postwege zurück, gerne vorab per E-Mail.
>
> Außerdem benötigen wir für Ihre Beratung und Vertretung weitere Angaben, die wir mit dem ebenfalls beigefügten **Fragebogen** erheben. Bitte vervollständigen Sie den Fragebogen und schicken ihn mit sämtlichen dort angeforderten Unterlagen ebenfalls an uns zurück.
>
> Wir sind Ihnen dankbar, wenn Ihnen die Erledigung innerhalb von 1 Woche möglich wäre.

**Nach E-Mail-Versand:**
- In **RA-Micro**: Wiedervorlage **10 Tage** eintragen
- In **PRE10.xlsx**: Akte mit Datum und Status eintragen

---

### Schritt 3 — Rücklauf Fragebogen

*Wer: Sekretariat*

Wenn der Fragebogen zurückkommt, **vor allem prüfen:**

**Vollständigkeit Fragebogen:**
- [ ] Alle Felder ausgefüllt?

**Anlagen prüfen:**
- [ ] Zeichnungserklärung vorhanden und **lesbar**?
- [ ] Zeichnungserklärung **vollständig** (beide Seiten müssen vorliegen)?
- [ ] Seite 1 des **Vermögensanlagen-Informationsblatts** vorhanden?
- [ ] Falls RSV: **Versicherungsschein** vorhanden?

**Streitwert berechnen und eintragen:**

```
Streitwert = Zeichnungssumme + Agio − Summe aller Auszahlungen
```

→ Streitwert in **RA-Micro Stammdaten** eintragen
→ Zur Kontrolle: RVG-Rechner in BKL Legal OS (Akte → „RVG")

**Falls RSV vorhanden:**
→ Versicherungsnummer und Versicherer in RA-Micro Stammdaten eintragen

**Falls Unterlagen/Angaben unvollständig:**
- Sekretariat fragt **selbständig** nach und bittet um Vervollständigung binnen **1 Woche**
- Wiedervorlage in RA-Micro eintragen

---

### Schritt 4 — Aufforderungsschreiben

*Wer: Sekretariat (vorbereiten) + MM oder MN (unterzeichnen)*

**Wenn RSV vorhanden:**
1. **Deckungsanfrage** beim Versicherer stellen (Vorlage: `V:\Manuel Neumann\One Group Muster Klage\`)
2. Wiedervorlage **2 Wochen** in RA-Micro eintragen
3. Falls nach 2 Wochen keine Antwort: **selbständig** erinnern, Wiedervorlage **1 Woche**
4. Nach Deckungszusage: **MM oder MN** legt fest, an welche Gegner das Aufforderungsschreiben geht

**Wenn keine RSV:**
1. Aufforderungsschreiben **nur an Peter Steurer** (Vorlage im Verzeichnis)
2. Unterschrift: MM — bei Akte auf APJ: MM pa. für APJ

**In BKL Legal OS:**
- Akte → **„Anspruch"** → Entwurf erzeugen lassen → Anwalt prüft und gibt frei
- Wiedervorlage für Antwortfrist in BKL Legal OS als **Frist** eintragen

**In RA-Micro:**
- Wiedervorlage **3 Wochen** eintragen

---

### Schritt 5 — Nach Versand des Aufforderungsschreibens

*Wer: Sekretariat*

Folgendes wird **gleichzeitig** versandt:

**An den Mandanten:**
1. Aufforderungsschreiben zur Kenntnis
2. Rechnung über **1,3 Geschäftsgebühr (VV Nr. 2300 RVG)**
   - Bei RSV: Gebührensatz vorab von **MM** festlegen lassen
3. **Gerichtliche Vollmacht** — Datum bereits eingetragen (= Datum nach Ablauf der Zahlungsfrist im Aufforderungsschreiben)

**Falls RSV Deckung zugesagt hat:**
- Aufforderungsschreiben **auch an die Rechtsschutzversicherung** senden

**Rücklauf gerichtliche Vollmacht:**
- Sekretariat überwacht selbständig den Eingang
- Wiedervorlage in RA-Micro eintragen

---

### Schritt 6 — Zahlungskontrolle

*Wer: Sekretariat*

Nach Ablauf der Frist im Aufforderungsschreiben:

1. Prüfen: Ist die Rechnung (Geschäftsgebühr) **bezahlt**?
2. **Falls nicht bezahlt:**
   - Mandant / RSV erinnern
   - Hinweis: Mandat wird **niedergelegt**, wenn nicht binnen **1 Woche** Zahlung eingeht
   - Wiedervorlage in RA-Micro
3. **Falls bezahlt:** → weiter mit Schritt 7

---

### Schritt 7 — Klage vorbereiten

*Wer: Sekretariat (vorbereiten) + MM oder MN (Klage fertigen)*

1. Akte **MM vorlegen** (bei Abwesenheit: MN) zur Fertigung der Klage
2. In BKL Legal OS: Status prüfen — Akte sollte auf „Anspruch versandt" stehen

**Falls RSV vorhanden:**
- Deckungsanfrage für **Klageverfahren** stellen
- Eingang der Deckungszusage überwachen (Wiedervorlage RA-Micro)

**Falls keine RSV:**
- **Vorschussrechnung** erstellen für:
  - Verfahrensgebühr (unter Anrechnung der Geschäftsgebühr)
  - 3-fache Gerichtsgebühren (GKG)
- Vorschussrechnung **zusammen mit dem Klagentwurf** an den Mandanten senden

> Streitwert für GKG-Berechnung → RVG-Rechner in BKL Legal OS → Tätigkeitsart: „Klage (1. Instanz)"

---

### Schritt 8 — Gerichtskostenmarke und Einreichung

*Wer: Sekretariat + Anwalt*

Sobald Vorschuss bezahlt:

1. Sachbearbeiter (MM oder MN) über Zahlungseingang informieren
2. Nach **Freigabe durch Sachbearbeiter:**
   - Prüfen: Ist für das festgelegte Prozessgericht (abhängig vom Bundesland) ein **Online-Kauf der Gerichtskostenmarke** möglich?
   - Falls ja: Gerichtskostenmarke kaufen → als **Anlage K0** der Klage beifügen
3. Klage einreichen (über beA — § 130d ZPO)
4. In BKL Legal OS: Status → **„Klage über beA eingereicht"** bestätigen
5. In **PRE10.xlsx**: Verfahrensstand aktualisieren

---

### Checkliste PRE9/PRE10 auf einen Blick

```
□ Kontakt: RSV vorhanden? Termin MM/APJ?
□ RA-Micro: Akte angelegt, Rubrum korrekt, Gegner eingetragen
□ BKL Legal OS: Akte mit RA-Micro-Nr. angelegt
□ BKL Legal OS: Verjährungsfrist 31.12.2026 + Vorfrist 15.09.2026 eingetragen
□ Unterlagen versandt: Vollmacht (5x), DSE, Widerrufsbelehrung, Fragebogen
□ RA-Micro: Wiedervorlage 10 Tage
□ PRE10.xlsx: Eintrag aktuell
□ Fragebogen zurück: Vollständigkeit geprüft, Streitwert berechnet
□ RSV: Deckungsanfrage gestellt / Deckungszusage erhalten
□ Aufforderungsschreiben versandt (+ Rechnung + gerichtl. Vollmacht)
□ RA-Micro: Wiedervorlage 3 Wochen
□ Zahlung Geschäftsgebühr eingegangen
□ Akte MM/MN vorgelegt für Klage
□ Vorschuss / RSV-Deckung Klage gesichert
□ Gerichtskostenmarke gekauft (falls möglich)
□ Klage über beA eingereicht
□ PRE10.xlsx: Verfahrensstand aktualisiert
```

---

*BKL Legal OS · BKL Rechtsanwälte · Vertraulich — nur für interne Verwendung*
