---
name: mandat-objekt-triage
description: "Erfasst eine WEG-/Hausverwaltungsakte (Stand 05/2026): Objekt, Rollen, Teilungserklärung, Gemeinschaftsordnung, Verwaltervertrag, Beschlusssammlung, Abrechnungen, Vermögensbericht, Angebote, Fristen, Risiken und nächsten Workflow. Identifiziert Fristen aus § 45 WEG, § 556 BGB sowie GEG-/CO2KostAufG-Schnittstellen."
---

# Mandat- und Objekt-Triage

Stand: 05/2026.

## Ziel

Aus einer ungeordneten Verwaltungsakte entsteht ein arbeitsfähiges Objektprofil mit Fristen, Zuständigkeiten, Dokumentenlage und nächstem Skill.

## Abfrage

| Bereich | Klären |
| --- | --- |
| Objekt | Adresse, Einheiten, Wohn-/Gewerbeanteil, Baujahr, Verwaltung seit wann, Bundesland |
| Rollen | GdWE, Verwalter, Beirat, einzelne Eigentümer, vermietende Eigentümer, Mieter |
| Grundakte | Teilungserklärung, Gemeinschaftsordnung, Aufteilungsplan, Beschlusssammlung |
| Verwaltung | Verwaltervertrag, Vollmachten, Beiratsbestellung, Sonderzuständigkeiten, Sondervergütungen |
| Finanzen | Wirtschaftsplan, Jahresabrechnung, Vermögensbericht, Erhaltungsrücklage, Hausgeldrückstände, Sonderumlagen |
| Bau/Technik | Instandhaltungsstau, Angebote, Gutachten, Gewährleistungsfristen, GEG-Heizungsstatus, Steckersolar/Wallbox-Anträge |
| Streit | laufende Beschlussklagen, Beschwerden, Störungen, Datenschutzprobleme, vermieterspezifische Mieter-Konflikte |
| Energie/CO₂ | Energieausweis, Brennstoff/Heizart, CO₂-Stufe nach CO2KostAufG, anstehende GEG § 71-Fristen |

## Arbeitsweise

1. **Dokumente benennen und Lücken markieren.** (Liste: vorhanden / fehlt / unklar)
2. **Fristen und irreversible Risiken nach oben ziehen.**
   - § 45 WEG: 1 Monat Klage, 2 Monate Begründung (BGH V ZR 33/23).
   - 1 Jahr Erkundigungsobliegenheit bei Zustellungsverzug (BGH V ZR 17/24).
   - § 556 Abs. 3 BGB: 12 Monate Betriebskostenabrechnung Mieter.
   - Gewährleistung Werkvertrag 5 J. / VOB 4 J.
   - GEG § 71 Übergangsfristen für Heizungstausch (Großstädte 30.06.2026, sonst 30.06.2028).
3. **Vorgänge in Körbe sortieren**: Versammlung, Beschluss, Abrechnung, Bau, Hausgeld, Kommunikation, Datenschutz, Gericht.
4. **Primären Folge-Skill vorschlagen**.

## Output

- `objektprofil.md` (Adresse, Einheiten, Beteiligte, Verwaltervertrag, Beirat, Schlüssel)
- `fristen-und-risiken.md` (nach Datum sortiert, mit Wirkung und Maßnahme)
- `dokumentenluecken.md`
- Skill-Routing mit Priorität (welcher Skill zuerst, mit Begründung)

## Cross-Refs

- Bei Versammlung-Stapel → `eigentuemerversammlung-vorbereiten`
- Bei Abrechnungsfragen → `wirtschaftsplan-jahresabrechnung-28-weg`
- Bei Hausgeld/Liquidität → `hausgeld-sonderumlage-liquiditaet`
- Bei baulichen Veränderungen → `bauliche-veraenderungen-20-weg`
- Bei Konflikt / Eskalation → `eskalation-anwalt-amtsgericht`

## Quellenpflicht

`rechtsstand-mai-2026-faktenbank` laden, sobald rechtliche Bewertung erfolgt.
