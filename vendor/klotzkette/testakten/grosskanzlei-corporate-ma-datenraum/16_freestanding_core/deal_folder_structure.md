# Deal-Ordnerstruktur — Projekt Silberfalke

**Aktenzeichen:** MA-2026-SF-001  
**Erstellt:** 01.04.2026  
**Zweck:** Verbindliche Ordnerstruktur für alle Mitarbeiter im Deal Team; Clean-Room-Regeln

---

## 1. Verzeichnisbaum

```
MA-2026-SF-001_Silberfalke/
│
├── 00_Admin/
│   ├── mandatsvertrag.pdf
│   ├── conflict_check.pdf
│   └── team_roster.md
│
├── 01_Intake/
│   ├── email_mandant.txt
│   ├── conflict_sanctions_rohdaten.md
│   └── erstgespraech_protokoll.md
│
├── 02_Datenraum/
│   ├── vdr_index.csv
│   ├── gap_analysis.md
│   ├── clean_room/
│   │   ├── clean_room_log.md          ← CLEAN ROOM: Zugriff eingeschränkt
│   │   └── ITAR_documents/            ← CLEAN ROOM: Nur Specialist Counsel
│   └── downloads/
│
├── 03_DD/
│   ├── legal/
│   │   ├── dd_scope.md
│   │   ├── red_flag_report.md
│   │   └── commercial_contracts/
│   ├── financial/
│   ├── tax/
│   └── environmental/
│
├── 04_QA/
│   ├── qa_register.csv
│   └── expert_call_notes/
│
├── 05_Structure/
│   ├── structure_options.md
│   ├── kg_check.md
│   └── umwandlungssteuer_matrix.md
│
├── 06_Documents/
│   ├── nda_markup.docx
│   ├── spa_markup.docx
│   ├── disclosure_letter.docx
│   └── disclosure_schedules/
│
├── 07_Signing_Closing/
│   ├── signing_closing_memo.md
│   ├── cp_register.csv
│   ├── ordinary_course_monitor.md
│   └── closing_bible/              ← Wird nach Closing befüllt
│
├── 08_Regulatory/
│   ├── regulatory_map.md
│   ├── bkarta_anmeldung/
│   ├── bmwk_fdi/
│   └── exportkontrolle/
│       └── clean_room/             ← CLEAN ROOM: Nur Specialist Counsel
│
├── 09_PMI/
│   ├── pmi_100_day_plan.md
│   └── synergy_tracker.csv
│
└── 90_Archive/
    ├── process_letter_historisch.pdf
    └── nda_historisch.pdf
```

---

## 2. Clean-Room-Regeln

> **Achtung:** Dokumente in `clean_room/`-Unterordnern dürfen ausschließlich durch ausdrücklich autorisierte Personen eingesehen werden. Eine Weitergabe an Dritte — insbesondere an Mitbewerber oder Personen mit US-Nexus ohne ITAR-Clearance — ist verboten.

| Clean-Room-Bereich | Autorisierte Personen | Grundlage |
|---|---|---|
| `02_Datenraum/clean_room/` | Specialist Counsel, Partner A | Clean-Room-Protokoll v. 10.04.2026 |
| `08_Regulatory/exportkontrolle/clean_room/` | Specialist Counsel | ITAR-Sonderprotokoll |
| `06_Documents/disclosure_schedules/` | Counsel B, Partner A, Eagle GC | Datenraumzugangsvereinbarung |

---

## 3. Versionierungsprinzipien

- Alle Vertragsmarkups werden mit `_v[n]_[YYYYMMDD]` suffixiert  
- Finale Versionen erhalten den Suffix `_FINAL`  
- Unterschriebene Dokumente erhalten den Suffix `_SIGNED`  
- Archivierte Vorfassungen werden in `90_Archive/` verschoben, nicht gelöscht  

---

## 4. Zugriffskontrolle

| Ebene | Personen | Ordnerzugang |
|---|---|---|
| Vollzugriff | Partner A, Counsel B | Alle Ordner |
| DD-Zugang | Associate B, Associate C | 02–05, 08 |
| PMI-Zugang | Eagle PMI-Lead | 09 |
| Nur Lesen | Mandant Eagle (Deal-Room) | 06, 07 (ausgewählt) |
| Clean Room | Specialist Counsel | 02/clean_room, 08/clean_room |

---

*Stand: 01.04.2026 — Verbindlich für alle Teammitglieder | Kanzlei-intern*
