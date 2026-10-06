# Qualitätsstandard für Testakten

Testakten sind keine Examensfälle mit sauberer Lösungsskizze. Sie sind Arbeitsakten: widersprüchlich, unvollständig, manchmal unangenehm banal und gerade dadurch nützlich. Jede Akte soll das jeweilige Plugin herausfordern, ohne die rechtliche Einordnung vorwegzunehmen.

## Pflichtstruktur

Jede Testakte enthält künftig zwei parallele Zugänge:

1. **Disparate Arbeitsakte:** Einzeldateien in realistischen Formaten, zum Beispiel Markdown-Notizen, EML-Dateien, DOCX-Schreiben, Excel/CSV-Tabellen, PDFs, JPEG-Screenshots, Chat-Exporte oder Scan-PDFs.
2. **Gesamt-PDF:** ein konsolidiertes, lesbares PDF unter `gesamt-pdf/<aktenordner>_gesamt.pdf`, damit man die Akte am Stück lesen, ausdrucken und in Vorführungen schnell öffnen kann.

Das Gesamt-PDF ersetzt die Einzeldokumente nicht. Es ist die Lesefassung neben dem Aktenchaos.

## Inhaltliche Qualität

- Keine vorgefertigte Lösung, keine versteckte Musterantwort.
- Keine sichtbaren Platzhalter in der Akte selbst.
- Keine Texte, die als "Lehrfall", "Testfall" oder "fiktiv" aus der Aktenlogik fallen.
- Mehrere plausible Deutungen, aber keine absichtlichen Quatschfehler.
- Widersprüche dort, wo echte Mandate sie haben: Datum, Erinnerung, Zuständigkeit, technische Ursache, Zustellung, Beweiswert, Rechenweg.
- Belege nicht nur behaupten, sondern als Datei, Tabelle, E-Mail, Scan oder Foto anlegen.
- Juristische Spezialfragen nicht spoilern; die Akte darf neugierig machen, soll aber nicht lösen.

## Technische Qualität

- Gesamt-PDF ohne offensichtlichen Textüberlauf, mit lesbarem Cover und Dateiabschnitten.
- Umlaute und ß in menschlichem Text verwenden.
- Einzeldateien sinnvoll benennen, aber nicht steril.
- Download-Hinweise gehören in README-Dateien, nicht in die Aktenstücke selbst.
- Der CI-Check `scripts/validate-testakten-gesamt-pdf.py` muss grün sein.

## Nach größeren Änderungen

```bash
python3 scripts/build-testakte-gesamt-pdf.py <aktenordner>
python3 scripts/inject-gesamt-pdf-section.py
python3 scripts/validate-testakten-gesamt-pdf.py
```

In der lokalen Codex-Desktop-Umgebung kann dafür der gebündelte Python verwendet werden, wenn die normale Python-Umgebung keine PDF-Bibliotheken enthält.
