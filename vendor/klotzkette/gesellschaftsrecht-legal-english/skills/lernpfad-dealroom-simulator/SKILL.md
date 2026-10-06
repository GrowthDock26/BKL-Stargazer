---
name: lernpfad-dealroom-simulator
description: "Fuehrt Anfaenger durch eine Corporate-Legal-English-Testakte mit Lernpfad, Dealroom-Inventar, Uebungen, Loesungsrichtung, Senior-Gates und konkreten Arbeitsprodukten."
---

# Lernpfad Dealroom-Simulator

## Zweck

Dieser Skill macht aus einer unuebersichtlichen Transaktionsakte einen gefuehrten Lernraum. Er ist fuer First-Year-Associates, Referendarinnen, Berufsanfänger und laterale Quereinsteiger gedacht, die englische Dealbegriffe in deutschen Gesellschaftsrechtsstrukturen verstehen wollen.

## Kaltstart

Wenn der Nutzer eine Akte, ein ZIP oder mehrere Dateien hochlaedt, beginne mit:

1. **Materialinventar:** Welche Dateien liegen vor? Dokumenttyp, Sprache, Verfasser, Datum, Dealphase.
2. **Dealkarte:** Wer sind Gesellschaft, Gruender, Investor, Notar, Gegenseite, Counsel?
3. **Begriffslandkarte:** Welche 10 Begriffe werden die Arbeit bestimmen?
4. **Lernpfad:** Reihenfolge in 30 Minuten, 2 Stunden oder 1 Arbeitstag.
5. **Arbeitsprodukt:** Sofort ein Partnerbriefing-Skelett oder eine Rueckfragenliste.

## Drei Lernmodi

| Modus | Wann | Fuehrung |
| --- | --- | --- |
| 30-Minuten-Rettung | Partnerin fragt in einer Stunde nach | Nur Dealkarte, Top-5-Risiken, naechste Rueckfragen |
| Vormittags-Training | Anfaenger soll Akte verstehen | Datei-fuer-Datei-Fuehrung mit Mini-Uebungen |
| Mandatsmodus | Akte soll bearbeitet werden | Arbeitsprodukt bauen: Memo, Markup, Cap Table, CP-Liste |

## Datei-Fuehrung

Fuer jede Datei eine Karte erzeugen:

```text
Datei:
Was ist das?
Warum liegt das in der Akte?
Welche Begriffe sind gefaehrlich?
Welche deutsche Umsetzung ist betroffen?
Welche Rueckfrage entsteht?
Welcher Spezialskill passt?
```

## Uebungsdesign

Jede Uebung hat vier Stufen:

1. **Erkennen:** "Markiere alle Begriffe, die nicht eins zu eins uebersetzbar sind."
2. **Erklaeren:** "Sag es einer Mandantin ohne Jargon."
3. **Anwenden:** "Schreibe den Markup-Kommentar oder die Rueckfrage."
4. **Absichern:** "Welche Stelle muss Senior/Notar/Steuerberatung sehen?"

## Spezialskill-Routing

- Cap Table, Pool, Wandelung: `cap-table-gesellschafterliste`, `fully-diluted-esop-option-pool`, `financing-convertible-loan-safe`.
- Term Sheet und Bindungswirkung: `term-sheet-investment-agreement`.
- Satzung, SHA, Notar: `articles-association-satzung`, `sha-gesellschaftervereinbarung`, `deutsches-recht-englische-vertraege`.
- Governance: `governance-board-consent-matters`, `protective-provisions-vetorechte`.
- Exit, SPA, CPs: `exit-spa-closing-cp`, `reps-warranties-indemnities`.
- Qualitaet: `qualitaetsgate-corporate-legal-english`.

## Output

- Dealroom-Inventar.
- Lernpfad nach Zeitbudget.
- Begriffskarte.
- Rueckfragenliste.
- Partnerbriefing-Skelett.
- Senior-Review-Gates.
