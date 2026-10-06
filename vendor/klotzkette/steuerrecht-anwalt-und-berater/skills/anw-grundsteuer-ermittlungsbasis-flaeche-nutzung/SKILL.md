---
name: anw-grundsteuer-ermittlungsbasis-flaeche-nutzung
description: "Grundsteuer-Ermittlungsbasis prüfen: Wohnfläche, Nutzfläche, Grundstücksfläche, wirtschaftliche Einheit, Baujahr, Nutzung, Garagen, Stellplätze, Erbbaurecht, Teileigentum, Leerstand, Denkmalschutz und Schätzungen aus der Grundsteuererklärung herausarbeiten."
---

# Grundsteuer: Ermittlungsbasis Fläche, Nutzung und wirtschaftliche Einheit

## Aufgabe

Dieser Skill zerlegt die tatsächliche Grundlage der Grundsteuerbewertung. Er eignet sich für Hausverwaltungen, Eigentümer und Berater, wenn Bescheide aus ELSTER-Erklärungen, Altunterlagen oder Schätzungen nicht nachvollziehbar sind.

## Dokumente anfordern

- Grundsteuererklärung und Übermittlungsprotokoll.
- Grundbuchauszug, Teilungserklärung, Aufteilungsplan.
- Wohnflächenberechnung, Mietflächenaufstellung, Bauakte.
- Flurkarte, Katasterauszug, Bodenrichtwertauskunft.
- Mietvertrag / Nutzungsliste / Leerstandsnachweise.
- Denkmalschutzbescheid, Baulasten, Erbbaurechtsvertrag.
- Fotos, Skizzen, Scan der Bescheide.

## Prüfraster

| Feld | Typischer Fehler | Beleg |
|---|---|---|
| Grundstücksfläche | Flurstücke zusammengezogen oder getrennt | Kataster, Grundbuch |
| Wohnfläche | Keller, Dachboden, Balkon, Gewerbe falsch | Wohnflächenberechnung |
| Nutzfläche | Laden, Lager, Werkstatt falsch eingeordnet | Mietvertrag, Bauplan |
| Baujahr | Kernsanierung als Neubau missverstanden | Bauakte, Sanierungsnachweis |
| Grundstücksart | Wohn-/Geschäftshaus, Teileigentum, gemischte Nutzung | Teilungserklärung |
| Bodenrichtwert | Zone oder Stichtag falsch | Gutachterausschuss |
| wirtschaftliche Einheit | mehrere Objekte zusammen oder getrennt | Grundbuch, Nutzung |
| Denkmalschutz / Ermäßigung | nicht berücksichtigt | Bescheid Denkmalschutz |

## Arbeitsweise

1. Bescheiddaten in eine Tabelle übernehmen.
2. Mandantenangaben danebenstellen.
3. Jede Abweichung als "belegt", "plausibel offen" oder "unbelegt" markieren.
4. Fehler nach Bescheidzuständigkeit sortieren: Finanzamt oder Gemeinde.
5. Bei Schätzungsbescheid sofort prüfen, ob eine vollständige Erklärung nachgereicht werden muss.

## Output

Erstelle:

- Datenabgleichstabelle.
- Belegliste mit Verantwortlichkeit.
- Änderungsantrag oder Einspruchsbaustein.
- Fristenhinweis.
- Folgeempfehlung: `anw-grundsteuerwert-bewertung-bewg-218ff` oder `anw-grundsteuer-einspruch-adv-bfh`.

## Grenzen

Keine "gefühlten" Flächenwerte als feststehend ausgeben. Bei streitiger Wohnfläche immer Belege oder Messung verlangen. Rechtsprechung nur aus geöffneten freien Quellen zitieren.
