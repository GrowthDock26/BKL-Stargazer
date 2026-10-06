# DD-Radar — Datenraum-Bereitschaftsprüfung für Start-ups

**Ein Werkzeug aus dem BKL Legal OS.** Es analysiert selbstständig ein Verzeichnis
mit Unternehmensunterlagen, kategorisiert die gefundenen Dokumente mit KI-Unterstützung
(LOGICC) und zeigt, **welche Unterlagen für eine Investoren-Due-Diligence fehlen**.

Zielgruppe: ein Mandant (Start-up), der sich auf eine Finanzierungsrunde oder einen
Anteilsverkauf vorbereitet und wissen muss, wie weit sein Datenraum ist.

---

## 1. Was das Tool tut

| Schritt | Ergebnis |
|---|---|
| 1. Verzeichnis rekursiv scannen | Dateiinventar inkl. Duplikaterkennung (SHA-256), Altformate, leere Dateien |
| 2. Inhalte auslesen | PDF, DOCX, XLSX, TXT/MD/CSV; gescannte PDFs und Bilder über Bilderkennung |
| 3. Klassifizieren (LOGICC) | Dokumenttyp, Parteien, Datum, unterzeichnet?, vollständig?, Entwurf?, Auffälligkeiten |
| 4. Gegen DD-Katalog abgleichen | 83 Soll-Positionen in 12 Arbeitssträngen → vorhanden / teilweise / fehlt |
| 5. Berichte erzeugen | Excel-Arbeitsmappe, Word-Kurzbericht, HTML-Dashboard, JSON-Rohdaten |

**Der Bereitschaftsgrad** (0–100 %) gewichtet nach Priorität: kritische Positionen
zählen fünffach, wichtige dreifach, sonstige einfach.

### Ausgabedateien

| Datei | Inhalt | Adressat |
|---|---|---|
| `DD-Radar_<Mandant>_<Datum>.xlsx` | 7 Blätter: Übersicht, Gap-Analyse, Nachforderungsliste, Dokumentenindex, Auffälligkeiten, Datenraum-Struktur, Klärungsbedarf | Arbeitsdokument des Start-ups |
| `…_Kurzbericht.docx` | 6-seitiger Statusbericht | Geschäftsführung / Beirat |
| `…_Dashboard.html` | Ampel-Übersicht, druckbar als PDF | Schnellüberblick, Mandantengespräch |
| `.dd-radar/…json` | vollständige Rohdaten | Folgeläufe, Nachweiszwecke |
| `.dd-radar/audit-log.jsonl` | jeder KI-Aufruf: Zeit, Modell, Dokument, Zeichenzahl | Nachweis § 43e BRAO / Art. 28 DSGVO |
| `.dd-radar/klassifikation-cache.json` | Ergebnisse je Dateiinhalt | Kostenbremse bei Wiederholungsläufen |

Das Arbeitsverzeichnis `.dd-radar/` liegt im analysierten Verzeichnis und wird beim
Scan selbst übersprungen.

---

## 2. Installation

Voraussetzung: Python 3.11 oder neuer.

```bash
pip install -r requirements.txt
```

Dann `.env.example` nach `.env` kopieren und den LOGICC-Schlüssel eintragen:

```
LOGICC_API_KEY=sk-...
API_ENDPOINT=https://api.logicc.io/v1
MODEL=gemini-2.5-flash
PROFIL=VC
```

`.env` ist in `.gitignore` und darf nicht weitergegeben werden.

---

## 3. Bedienung

### Grafische Oberfläche

Doppelklick auf **`DD-Radar starten.bat`** — Verzeichnis wählen, Mandantennamen
eintragen, Profil wählen, „Analyse starten". Der Fortschritt läuft im Protokollfenster,
die fertigen Berichte lassen sich direkt öffnen.

### Kommandozeile

```bash
python dd_radar.py "D:\Datenraum Muster GmbH" --mandant "Muster GmbH" --profil VC
```

| Option | Wirkung |
|---|---|
| `--profil SEED\|VC\|MA` | Umfang des Katalogs (siehe unten) |
| `--offline` | **keine Datenübermittlung**; Zuordnung allein über Stichworte |
| `--mock` | Testlauf ohne echte KI-Aufrufe |
| `--no-vision` | gescannte PDFs nicht als Bild auswerten (spart Kosten) |
| `--anonym` | E-Mail, Telefon, IBAN vor dem Versand maskieren |
| `--max-docs N` | nur die ersten N Dokumente (Kostenbremse) |
| `--out PFAD` | Ausgabeverzeichnis für die Berichte |

### Prüfprofile

| Profil | Positionen | Einsatz |
|---|---|---|
| `SEED` | 44 | Pre-Seed/Seed — Gründungs- und IP-Hygiene |
| `VC` | 80 | Finanzierungsrunde Series A/B (Standard) |
| `MA` | 83 | Share Deal / Exit, inkl. Immobilien- und Außenwirtschaftsthemen |

---

## 4. Der Prüfkatalog

12 Arbeitsstränge, abgeleitet aus den Klotzkette-Plugins `grosskanzlei-corporate-ma`
(Datenraum-Aufbau, DD-Legal, Gap-Analyse, Information Request List) und
`gesellschaftsgruender`, zugeschnitten auf ein deutsches Start-up:

```
01 Gesellschaftsrecht & Corporate Housekeeping    07 Datenschutz, IT-Sicherheit & KI-Compliance
02 Finanzierung & Cap Table                       08 Genehmigungen & Regulatorik
03 Rechnungswesen & Steuern                       09 Versicherungen
04 Personal & Arbeitsrecht                        10 Immobilien, Miete & Leasing
05 IP, Marken & Technologie                       11 Streitigkeiten & Haftung
06 Kunden-, Lieferanten- & Vertriebsverträge      12 ESG & Sonstiges
```

Jede Position trägt: Priorität, Begründung aus Investorensicht, Rechtsgrundlage,
Prüfpunkte und Stichworte. Der Katalog steht vollständig in
[`taxonomy.py`](taxonomy.py) und ist dort ohne Programmierkenntnisse erweiterbar —
eine neue Position ist ein Eintrag in `KATALOG`.

Erfahrungsgemäß häufigste Lücken bei Start-ups, die der Katalog gezielt abfragt:
IP-Übertragung der Gründer (`IP-01`), IP-Klauseln in Freelancer-Verträgen (`IP-02`),
Open-Source-Compliance (`IP-07`), Wandeldarlehen im Cap Table (`FIN-01`),
Scheinselbständigkeit (`HR-03`), AVV mit allen Tool-Anbietern (`DAT-02`).

---

## 5. Aufbau

```
dd_radar.py        Orchestrierung + Kommandozeile
dd_radar_gui.pyw   Tkinter-Oberfläche
config.py          .env, Konstanten, Egress-Guard
scanner.py         Verzeichnisscan, Metadaten, Duplikate
extractor.py       Text aus PDF/DOCX/XLSX/TXT, Seitenbilder für Scans
api_client.py      LOGICC-Client (Stream, Retry, Audit-Log), MockClient
classifier.py      Prompts, Cache, Bereinigung der KI-Antwort
taxonomy.py        DD-Katalog (83 Soll-Positionen)
gap_analysis.py    Soll-Ist-Abgleich, Ampel, Nachforderungsliste, Datenraumplan
reporter.py        Excel / Word / HTML / JSON
tests/             24 Tests (pytest)
```

**Arbeitsteilung Mensch–Maschine.** Die KI ordnet nur einzelne Dokumente zu und
beschreibt, was im Text steht. Ob daraus „vorhanden", „teilweise" oder „fehlt" folgt,
entscheidet nachvollziehbarer Code in `gap_analysis.py` — dieselbe Trennung wie im
BKL Legal OS (deterministische Fristen-, RVG- und InsO-Logik vs. LLM-Textbausteine).
Vom Modell erfundene Kategorie-IDs werden verworfen.

Tests: `python -m pytest -q`

---

## 6. Vertraulichkeit und Berufsrecht

* **Einziger KI-Endpunkt ist LOGICC.** `config.pruefe_endpunkt()` bricht ab, sobald
  ein anderer Host konfiguriert ist — das Gegenstück zum `egress-guard.ts` des
  BKL Legal OS. Es gibt keinen Codepfad zu OpenAI, Anthropic oder Google.
* **Audit-Log.** Jeder Aufruf wird mit Zeit, Modell, Dokumentpfad, Zeichenzahl und
  Dauer in `.dd-radar/audit-log.jsonl` protokolliert (§ 43e Abs. 2–5 BRAO,
  Art. 28 Abs. 3 DSGVO).
* **Offline-Modus.** `--offline` arbeitet ohne jede Datenübermittlung. Die Zuordnung
  erfolgt nur über Stichworte und wird bewusst nie als „vorhanden" gewertet, sondern
  höchstens als „teilweise" — sie ist ein Indiz, kein Befund.
* **Anonymisierung.** `--anonym` maskiert E-Mail-Adressen, Telefonnummern und IBAN
  vor dem Versand.
* **Datenmenge.** Je Dokument gehen höchstens ~14.000 Zeichen an die KI (Anfang und
  Ende, damit die Unterschriftenseite erfasst bleibt), bei Scans höchstens drei
  Seitenbilder mit 150 dpi.
* **Vor dem Ersteinsatz beim Mandanten zu klären** (offen aus
  `SETUP-UND-OFFENE-PUNKTE.md`, Abschnitt 5): AVV mit LOGICC, Unterauftragsverarbeiter
  und Drittlandtransfer, Training-Opt-out, Transparenzhinweis nach Art. 50 KI-VO
  gegenüber dem Mandanten.

**Kein Ergebnis ohne Prüfung.** Der Bericht ist ein Arbeitsstand, keine Rechtsberatung.
Zuordnungen und Auffälligkeiten sind vor Verwendung im Datenraum anwaltlich zu prüfen;
jeder Bericht trägt diesen Hinweis.

---

## 7. Kosten und Laufzeit

Ein Dokument ≈ ein API-Aufruf mit 1.000–5.000 Token. Richtwert mit `gemini-2.5-flash`:
200 Dokumente in etwa 8–15 Minuten.

* Der **Cache** greift je Dateiinhalt (SHA-256). Ein zweiter Lauf über dasselbe
  Verzeichnis kostet nichts; nur neue oder geänderte Dateien werden gesendet.
* Bei **HTTP 429** wartet der Client mit exponentiellem Backoff (bis zu 5 Versuche).
* Ist das **LOGICC-Budget erschöpft** (HTTP 400 `budget_exceeded`), bricht der Lauf
  kontrolliert ab; bereits klassifizierte Dokumente bleiben im Cache, ein Neustart
  setzt an der Abbruchstelle fort.
* `MODEL=gemini-2.5-pro` liefert bei Vertragstexten etwas genauere Befunde, verbraucht
  als Denk-Modell aber deutlich mehr Token und läuft häufiger ins Rate-Limit.
  Bei knappem JSON-Budget wiederholt das Tool den Aufruf automatisch mit größerem
  Budget und fällt notfalls sichtbar auf die Stichwortzuordnung zurück.

---

## 8. Empfohlener Ablauf im Mandat

1. **Erstlauf** durch die Kanzlei, Profil `VC`, Ergebnis mit dem Mandanten besprechen.
2. Der Mandant arbeitet die **Nachforderungsliste** ab (Excel-Blatt mit Spalten
   „Verantwortlich", „Frist", „Erledigt").
3. **Zweitlauf** nach 2–4 Wochen: der Cache sorgt dafür, dass nur die neuen Unterlagen
   Kosten verursachen; der Bereitschaftsgrad zeigt den Fortschritt.
4. Ab etwa 85 % **Datenraum aufbauen** — die Zielstruktur steht im Excel-Blatt
   „Datenraum-Struktur" (Ordner + Dateinamensvorschlag je Dokument).
5. Vor Freigabe an Investoren: anwaltliche Durchsicht der als auffällig markierten
   Dokumente und der Positionen mit unsicherer Zuordnung.

---

*BKL Legal OS · BKL Rechtsanwälte · Vertraulich — nur für interne Verwendung und
für den beauftragenden Mandanten.*
