# Freestanding Workflow-Prüfvermerk — Projekt Silberfalke

**Aktenzeichen:** MA-2026-SF-001
**Erstellt:** 01.04.2026
**Letzte Aktualisierung:** 20.05.2026
**Zweck:** Nachweis, dass alle M&A-Kern-Workflows ohne externe Plugin-Abhängigkeiten abgedeckt sind

---

## 1. Prüfkriterium

Der jeweilige Workflow ist freigegeben, wenn er alle nachfolgend genannten Arbeitsschritte aus dem eigenen Wissensstand heraus vollständig ausführen kann — ohne Verweis auf ein anderes Plugin, eine externe Datenbank oder ein externes Tool.

---

## 2. Skill-Checkliste und Testergebnis

### grosskanzlei-ma-aktenanlage

| Prüfpunkt | Erwartetes Ergebnis | Ergebnis |
|---|---|---|
| Mandant + Target + Transaktionstyp → Aktenzeichen | Kanzleiformat MA-YYYY-[Code]-[Nr.] | ✓ Bestanden |
| Beteiligtenmatrix generieren | Vollständige Matrix mit Rollen, Parteien, Kontakten | ✓ Bestanden |
| CP-Kalender mit behördlichen Fristen ausgeben | BKartA, BMWK, ggf. EU-Fristen | ✓ Bestanden |
| Closing-Bible-Grundstruktur | 5-Band-Struktur mit Tab-Ebene | ✓ Bestanden |

### grosskanzlei-ma-tabellenreview

| Prüfpunkt | Erwartetes Ergebnis | Ergebnis |
|---|---|---|
| Vertragsliste mit Ampel-Klassifizierung | Rot/Gelb/Grün je Risikodimension | ✓ Bestanden |
| Change-of-Control-Scan | Identifikation aller CoC-Klauseln | ✓ Bestanden |
| Material Adverse Change Bewertung | Schwellenwert-Check nach SPA-Definition | ✓ Bestanden |

### grosskanzlei-ma-liquiditaetsvorschau

| Prüfpunkt | Erwartetes Ergebnis | Ergebnis |
|---|---|---|
| 13-Wochen-Cash-Bridge aus Rohdaten | Wöchentliche Spalten, Saldo, Kommentar | ✓ Bestanden |
| Kritische Wochen markieren | Negativsaldo-Alarm, Covenant-Waiver-Hinweis | ✓ Bestanden |
| Szenario-Analyse (Lieferstopp) | Sensitivitätsrechnung | ✓ Bestanden |

### grosskanzlei-ma-insolvenzreife

| Prüfpunkt | Erwartetes Ergebnis | Ergebnis |
|---|---|---|
| § 17 InsO Zahlungsunfähigkeit | Dreistufentest, nicht grün geben ohne Belege | ✓ Bestanden |
| § 18 InsO drohende Zahlungsunfähigkeit | 24-Monats-Horizont, Datenlücken identifizieren | ✓ Bestanden |
| § 19 InsO Überschuldung | Fortbestehensprognose erforderlich, Anforderungsliste | ✓ Bestanden |
| StaRUG vs. InsO Abgrenzung | Entscheidungsbaum | ✓ Bestanden |

### grosskanzlei-ma-fristen-cp-kalender

| Prüfpunkt | Erwartetes Ergebnis | Ergebnis |
|---|---|---|
| Regulatorische Fristen (BKartA, BMWK) | Fristberechnung auf Basis Signing-Datum | ✓ Bestanden |
| Long-Stop-Date Warnfunktion | Alert wenn < 30 Tage | ✓ Bestanden |
| CP-Status-Update | Tabellarische Übersicht mit Ampeln | ✓ Bestanden |

### grosskanzlei-ma-erechnung-gobd

| Prüfpunkt | Erwartetes Ergebnis | Ergebnis |
|---|---|---|
| Zeitnachweise → Billing-Narrativ | Mandantengerechtes Narrative Ledger | ✓ Bestanden |
| XRechnung-Datenblock | Strukturierter Datensatz (ohne PDF/A-3-Validierung) | ✓ Bestanden |
| GoBD-Protokoll | Rechnungsnummer, Änderungslog, Korrekturpfad | ✓ Bestanden |
| USt-Prüfung | Offen-Markierung wenn Leistungsort fehlt | ✓ Bestanden |

### grosskanzlei-ma-schreibcanvas

| Prüfpunkt | Erwartetes Ergebnis | Ergebnis |
|---|---|---|
| Aktenvermerk generieren | Vollständig mit AV-Nummer, Verfasser, Rubrum | ✓ Bestanden |
| SPA-Markupkommentar | Stichpunktkommentar je Klausel | ✓ Bestanden |
| Board Paper Outline | Vollständige Gliederung mit Zahlentabelle | ✓ Bestanden |

---

## 3. Gesamtergebnis

**Alle 7 Skill-Bereiche bestanden.** Kein Verweis auf externe Plugins notwendig.

---

## 4. Bekannte Einschränkungen

| Bereich | Einschränkung | Kommentar |
|---|---|---|
| ZUGFeRD PDF/A-3 | Keine Validierung eines finalen PDF/A-3 | Als Offen markiert |
| Live-Datenabfragen | Kein Echtzeit-Handelsregister-Abruf | Manuelle Eingabe erforderlich |
| Digitale Signatur | Kein qualifiziertes elektronisches Siegel | Externe eIDAS-Plattform nötig |

---

*Testdatum: 20.05.2026 | Kanzlei-intern*
