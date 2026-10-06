---
name: anw-grundsteuerwert-bewertung-bewg-218ff
description: "Grundsteuerwert nach BewG §§ 218 ff. prüfen: Bundesmodell, Ertragswert, Sachwert, Bodenrichtwert, Grundstücksart, Steuermesszahl, Hauptfeststellung 01.01.2022, Fehlerdiagnose und Bescheidbegründung."
---

# Grundsteuerwert: Bewertung nach BewG §§ 218 ff.

## Aufgabe

Prüfe den Grundsteuerwertbescheid im Bundesmodell. Dieser Skill arbeitet nicht als Rechner ohne Unterlagen, sondern als Bewertungsdiagnose: Welche Eingabe bestimmt den Wert, welche ist falsch, welche ist nur belastend, aber rechtlich vorgesehen?

## Prüfschritte

1. **Anwendungsbereich**: Bundesmodell oder Landesmodell? Bei Landesmodell an `anw-grundsteuer-landesmodell-routing` abgeben.
2. **wirtschaftliche Einheit**: Grundstück, Betrieb der Land- und Forstwirtschaft, Wohnungs-/Teileigentum, Erbbaurecht.
3. **Bewertungsverfahren**: Ertragswertverfahren oder Sachwertverfahren.
4. **Datenbasis**: Bodenrichtwert, Fläche, Grundstücksart, Baujahr, Wohn-/Nutzfläche, statistische Nettokaltmiete, Mietniveaustufe, Restnutzungsdauer.
5. **Messbetrag**: Steuermesszahl und mögliche Ermäßigungen im Messbescheid gesondert prüfen.
6. **Gemeinderolle**: Hebesatz erst im Grundsteuerbescheid.

## Fehlerbilder

- Objekt ist kein reines Wohnobjekt, wurde aber so behandelt.
- Gewerbefläche, Lager oder Atelier wurde falsch als Wohnfläche erfasst.
- Bodenrichtwertzone passt nicht zur Lage oder zum Stichtag.
- Denkmalschutz oder sozialer Wohnungsbau wurde nicht berücksichtigt.
- Baujahr/Kernsanierung verzieht Restnutzungsdauer.
- Einheiten wurden wegen gemeinsamer Zufahrt oder Tiefgarage falsch zusammengefasst.

## Begründungsstruktur

Nutze diese Reihenfolge:

1. angefochtener Bescheid mit Datum und Aktenzeichen,
2. konkrete falsche Besteuerungsgrundlage,
3. richtiger Wert und Beleg,
4. rechtliche Relevanz für BewG/GrStG,
5. Antrag auf Änderung beziehungsweise Einspruchsziel.

## Output

- Bewertungsfehler-Matrix.
- Priorisierte Angriffspunkte.
- Entwurf eines Beleganschreibens.
- Kurzer Einspruchsbaustein.
- Hinweis, ob zusätzlich gemeiner Wert/gutachterlicher Nachweis geprüft werden soll.

## Quellen

Gesetzestext vor Ausgabe öffnen: BewG §§ 218 ff., GrStG, ggf. amtliche Grundsteuer-Hinweise. Keine Kommentarzitate ohne Nutzerquelle.
