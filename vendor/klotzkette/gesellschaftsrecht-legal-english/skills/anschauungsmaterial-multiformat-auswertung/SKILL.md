---
name: anschauungsmaterial-multiformat-auswertung
description: "Wertet Corporate-Legal-English-Unterlagen in mehreren Formaten aus: PDF, Scan, Screenshot, JPEG, Excel, Chat, Email, Notarvermerk, Cap Table und Dealroom-Fragmente."
---

# Anschauungsmaterial Multi-Format-Auswertung

## Zweck

Transaktionsakten kommen selten sauber als ein PDF. Dieser Skill behandelt Excel-Cap-Tables, PDF-Scans, JPEG-Fotos, Screenshots, Chats, Email-Fragmente und Notizen als Dealroom-Material und macht daraus eine klare Arbeitsgrundlage.

## Startlogik

1. **Dateityp erkennen:** Excel, PDF, Scan, Screenshot, Chat, Foto, Markdown, Email.
2. **Lesbarkeit prüfen:** Ist Text extrahierbar oder nur Bild? Sind Zahlen sichtbar? Fehlen Seiten?
3. **Dokumentkarte bauen:** Quelle, Datum, Autor, Zweck, Sprache, Dealphase.
4. **Begriffskarte bauen:** englische Termini, deutsche Naeherung, False-Friend-Risiko.
5. **Arbeitsprodukt ableiten:** Rueckfrage, Markup, Memo, Zahlencheck, Notarfrage.

## Format-spezifische Hinweise

| Format | Worauf achten? | Typischer Anschluss |
| --- | --- | --- |
| Excel / CSV | Formeln, Annahmen, Rundungen, Pool pre-/post-money, Convertibles | `fully-diluted-esop-option-pool` |
| PDF / Scan | Unterschriften, Version, Datum, Sprache, Beurkundung, Anlagen | `deutsches-recht-englische-vertraege` |
| Screenshot | Kontextverlust, abgeschnittene Spalten, Chat-Zeitpunkt, nicht zitierfaehige Quelle | `begriffskompass-intake` |
| WhatsApp / Chat | informelle Weisung vs. rechtlich belastbarer Auftrag trennen | `partner-briefing-memo` |
| Foto Whiteboard | Strukturidee, keine finale Vertragslage | `lernpfad-dealroom-simulator` |

## Didaktische Ausgabe

Nie nur extrahieren. Immer erklaeren:

```text
Was sehe ich?
Warum ist es im Deal wichtig?
Welcher englische Begriff steckt darin?
Welche deutsche Umsetzung ist betroffen?
Was darf ich daraus nicht vorschnell folgern?
Welche Rueckfrage stelle ich?
```

## Halluzinationsschutz

- Aus Screenshots, Fotos und Scans keine nicht sichtbaren Inhalte erfinden.
- Unscharfe oder abgeschnittene Zahlen als unsicher markieren.
- Chatnachrichten nicht wie Vertragsklauseln behandeln.
- Excel-Formeln nachrechnen oder als ungeprueft markieren.
- Keine Paywall-Fundstellen, keine externen Autorennamen, keine nicht belegten Rechtsprechungszitate.

## Output

- Materialinventar nach Datei.
- Extraktionsnotiz.
- Begriffskarte.
- Zahlen-/Formrisiko.
- Naechster Spezialskill.
- Senior-Review-Gate.
