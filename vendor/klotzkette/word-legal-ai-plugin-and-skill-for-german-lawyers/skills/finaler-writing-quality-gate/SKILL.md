---
name: finaler-writing-quality-gate
description: "Finales Quality Gate für juristische Texte vor Versand. Prüft Rechtsfrage, Antrag oder Klauselzweck, Adressat, Stil, Zitate, Normen, Anlagen, Beweise, Fristen, Platzhalter, Zahlen, Namen, Datenschutz, Metadaten, Word-Hygiene und Versandfassung. Liefert Freigabeampel und letzte Reparaturliste."
---

# Finaler Writing Quality Gate

## Zweck

Dieser Skill ist der letzte Blick vor Versand. Er prüft nicht noch einmal alles dogmatisch von vorne, sondern fragt: Kann dieser Text jetzt so an Mandant, Gericht, Gegenseite oder Partnerin gehen?

## Ampelprüfung

| Ampel | Bedeutung |
|---|---|
| Grün | sendefähig nach kleiner Schlusskontrolle |
| Gelb | sendefähig nach konkreten Reparaturen |
| Rot | nicht versenden; Risiko, Fehler oder Lücke zu groß |

## Prüffelder

1. **Zweck:** Ist klar, was der Text erreichen soll?
2. **Adressat:** Passt Ton und Tiefe?
3. **Rechtsanker:** Sind Normen, Klauseln und Begriffe korrekt und nötig?
4. **Zitate:** Gibt es nur überprüfbare Rechtsprechung mit Gericht, Datum und Aktenzeichen?
5. **Sachverhalt:** Stimmen Namen, Daten, Beträge, Fristen und Rollen?
6. **Belege:** Stimmen Anlagenverweise und Beweisangebote?
7. **Struktur:** Ergebnis vorne, keine Wiederholungen, sinnvolle Überschriften.
8. **Sprache:** Keine Polemik, keine Platzhalter, keine leeren Floskeln.
9. **Word:** Formatvorlagen, Nummerierung, Track Changes, Kommentare, Metadaten.
10. **Versand:** richtige Fassung, richtiger Dateiname, richtige Anlagen.

## Harte Stopper

- Platzhalter im Text.
- Unverifizierte Rechtsprechungsfundstelle.
- Falscher Mandantenname oder falsche Parteirolle.
- Unklare Frist.
- Sichtbare interne Kommentare, wenn Clean Version versendet werden soll.
- Widerspruch zwischen Antrag und Begründung.
- Anlagenverweis auf nicht vorhandene Anlage.

## Output

```text
Freigabeampel: Gelb

Vor Versand reparieren:
1. ...
2. ...
3. ...

Kann danach raus als:
- clean PDF
- redline DOCX
- Mandantenmemo
```

## Querverweise

- `word-dokument-finish-und-layout`
- `deutscher-kanzleistil-kalibrieren`
- `schriftsatz-ueberarbeiten-richterlesbar`
- `englischer-vertrag-deutsches-recht`
