---
name: anw-grundsteuer-hebesatz-zahlungsplan
description: "Kommunalen Grundsteuerbescheid prüfen: Hebesatz, Satzung, Fälligkeiten, Zahlungsplan, Stundung, Erlass, Vollstreckungsaufschub, Abgrenzung Finanzamt/Gemeinde und Kommunikation mit Hausverwaltung oder Kommune."
---

# Grundsteuer: Hebesatz, Zahlung und Gemeindeebene

## Aufgabe

Prüfe den Grundsteuerbescheid der Gemeinde und organisiere Zahlung, Stundung, Erlass oder kommunale Rechtsbehelfe. Dieser Skill ist nicht für Bewertungsfehler im Grundsteuerwertbescheid gedacht.

## Prüfen

1. Messbetrag aus dem Finanzamtsbescheid übernommen?
2. Hebesatz durch kommunale Satzung gedeckt?
3. Fälligkeiten korrekt?
4. Aufteilung auf Eigentümer, WEG, Hausverwaltung oder Erbbauberechtigte zutreffend?
5. Zahlung trotz Einspruch nötig?
6. Stundung, Ratenzahlung oder Erlass wegen unbilliger Härte realistisch?

## Typische Fehler

- falscher Messbetrag übernommen,
- altes Kassenzeichen oder falsches Objekt,
- falscher Eigentümer nach Verkauf,
- Hebesatzjahr verwechselt,
- Vorauszahlungen ohne neuen Bescheid fortgeschrieben,
- Hausverwaltung legt Kosten falsch auf Mieter oder WEG-Einheiten um.

## Output

Erstelle:

- Zahlungsplan mit Fälligkeiten und Vorfristen.
- Gemeindeschreiben bei Übernahmefehler.
- Stundungs-/Ratenzahlungsantrag, wenn nötig.
- Hinweis auf parallelen Einspruch beim Finanzamt, wenn die Bewertung falsch ist.
- Betriebskosten-/WEG-Hinweis nur als Nebensatz; vertiefte Prüfung an Miet-/WEG-Plugin abgeben.

## Abgrenzung

Wenn der Wert falsch ist, nicht bei der Gemeinde "korrigieren" wollen. Dann `anw-grundsteuer-kaltstart-bescheidkette` und `anw-grundsteuer-einspruch-adv-bfh` nutzen.
