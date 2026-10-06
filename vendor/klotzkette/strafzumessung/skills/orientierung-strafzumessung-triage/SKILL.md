---
name: orientierung-strafzumessung-triage
description: "Einstieg und Triage im Plugin Strafzumessung. Ordnet das Mandat (Strafverteidiger, Staatsanwaltschaft, Beistand) nach Verfahrensstadium (Strafbefehl, Anklage, Hauptverhandlung, Urteil, Berufung, nachtraegliche Gesamtstrafe), erkennt Eilfristen, schlaegt passende Spezial-Skills aus diesem Plugin vor und liefert bei klarer Faktenlage sofort einen ersten Strafzumessungsentwurf mit Platzhaltern."
---

<!-- konvers-stil-v1 -->

## Konversationsstil – konzis starten, schnell zum Dokument

- **Erste Antwort kurz.** Sachverhalt einordnen, hoechstens **eine** unverzichtbare Rueckfrage, dann arbeiten.
- **Kein Lehrbuch-Intro.** Keine Norm-Wiederholung, keine Selbstankuendigung – sofort einsteigen.
- **Schnell zum Dokument.** Sobald die Mindestangaben vorliegen, liefere einen ersten Entwurf mit `[noch zu klaeren: …]`-Platzhaltern, statt weiter abzufragen.
- **Allgemein-Skill = Einstieg, nicht Vorlesung.** Triage, eine Rueckfrage falls noetig, dann auf die Spezial-Skills dieses Plugins verweisen oder direkt den ersten Entwurf produzieren.
- **Ausfuehrlich nur, wenn es das Arbeitsergebnis verlangt:** echte Subsumtion im Gutachtenstil, Tabellen, Chronologien, Risiko-/Beweislastanalysen, Schriftsatz- oder Memo-Text.
- **Erklaerungen nur auf Nachfrage.** Wenn der Nutzer Hintergrund will, ausfuehrlich. Sonst nicht.

# Strafzumessung — Orientierung und Triage

## Worum geht es?

Strafzumessung ist die richterliche Bestimmung von Strafart und Strafhoehe innerhalb des gesetzlichen Strafrahmens. Grundlage ist die Schuld des Taeters (§ 46 Abs. 1 Satz 1 StGB). Dieser Allgemein-Skill ist der Eingang in das Plugin: er ordnet den Stand des Verfahrens, identifiziert Fristen und schlaegt den passenden Spezial-Skill vor.

## Wann brauchen Sie diese Skill?

- Mandant hat Strafbefehl erhalten, Strafzumessung soll angegriffen oder beschraenkter Einspruch erwogen werden.
- Anklageschrift liegt vor, Strafzumessungs-Verteidigung in der Hauptverhandlung wird vorbereitet.
- Verstaendigungs-Gespraech (§ 257c StPO) mit Gericht und Staatsanwaltschaft steht an, Strafrahmen wird sondiert.
- Urteil ist ergangen, Strafzumessungsruege wird vorbereitet (§ 267 Abs. 3 StPO).
- Mehrere Verurteilungen liegen vor, nachtraegliche Gesamtstrafenbildung (§ 55 StGB) oder Haerteausgleich pruefen.

## Rolle abklaeren (Pflicht)

| Rolle | Typischer Fokus |
|---|---|
| Strafverteidiger | Strafmilderung, Bewaehrung, TOA, Verstaendigung, Strafzumessungsruege |
| Staatsanwaltschaft | Antragsstrafe, Strafzumessungsrichtlinien, Schwere-Argumente |
| Mandant / Betroffener (mit Anwalt) | Verstaendnis der Strafzumessungslogik; Tagessatzpruefung |
| Nebenklaegervertreter | Strafzumessungs-Aspekte zugunsten des Opfers |

Wenn die Rolle unklar ist, **frage zuerst** — die Argumentationsrichtung haengt davon ab.

## Verfahrensstadium-Triage

| Stadium | Primaerer Skill |
|---|---|
| Strafbefehl liegt vor | `strafbefehl-strafzumessung-407-stpo`, ggf. `tagessatzhoehe-40-ii-stgb-nettotagesverdienst` |
| Einstellungsangebot § 153a StPO | `153a-stpo-einstellung-gegen-auflage` |
| Anklage liegt vor, Hauptverhandlung vorbereiten | `strafrahmen-und-strafzumessungsstufen`, dann `paragraph-46-stgb-grundsatz-strafzumessung` |
| Verstaendigung steht an | `verstaendigung-257c-stpo-strafzumessung` |
| TOA mit dem Opfer moeglich | `taeter-opfer-ausgleich-46a-stgb-und-schadenswiedergutmachung` |
| Mehrere Taten in einem Verfahren | `gesamtstrafenbildung-53-54-stgb-erste-instanz` |
| Mehrere Verurteilungen, eine Anlasstat | `nachtraegliche-gesamtstrafenbildung-55-stgb`, ggf. `haerteausgleich-bei-nachtraeglicher-gesamtstrafenbildung` |
| Urteil liegt vor, Strafzumessungsruege | `267-iii-stpo-begruendungsanforderungen-strafurteil` |
| Mandant unter 21 Jahren | `jgg-strafzumessung-jugendstrafe-erziehungsmassregeln` |

## Schritt-fuer-Schritt-Anleitung

1. Rolle und Verfahrensstadium erfragen oder aus Material erkennen.
2. Eilfristen pruefen (Einspruchsfrist § 410 StPO, Revisionsbegruendung § 345 StPO, Bewaehrungsstellungnahme).
3. Strafrahmen-Frage stellen: Welche Norm, welcher Strafrahmen, gibt es Regelbeispiele oder minder schweren Fall?
4. Strafzumessungs-Tatsachen sammeln (§ 46 Abs. 2 StGB): Vorleben, Tat, Nachtatverhalten.
5. Passenden Spezial-Skill auswaehlen; bei klarer Faktenlage sofort ersten Entwurf mit Platzhaltern liefern.
6. Quellenpflicht beachten: § 46 StGB, einschlaegige Spezialnormen, BGH-Linie nur mit verifiziertem Aktenzeichen.

## Typische Fehler

- Strafzumessung wird ohne Sortierung des Strafrahmens diskutiert: erst Strafrahmen pruefen, dann konkretisieren.
- Verstaendigung wird abgeschlossen, bevor die Belehrungspflicht (§ 257c Abs. 4 und 5 StPO) sauber gepruefte ist.
- TOA wird als reine Schadenswiedergutmachung verstanden; nach BGH ist ein friedensstiftender kommunikativer Prozess noetig.
- Tagessatzhoehe wird ohne Einkommensnachweis akzeptiert; Gericht schaetzt sonst zu Lasten des Mandanten.
- Nachtraegliche Gesamtstrafe wird vergessen; Haerteausgleich nicht thematisiert.

## Querverweise

- `paragraph-46-stgb-grundsatz-strafzumessung` — Schuld als Grundlage; tragender Norm-Einstieg.
- `strafrahmen-und-strafzumessungsstufen` — Strafrahmen-Logik vor jeder konkreten Zumessung.
- `tagessatzhoehe-40-ii-stgb-nettotagesverdienst` — bei Geldstrafe.
- `verstaendigung-257c-stpo-strafzumessung` — bei Deal-Verhandlung.
- `nachtraegliche-gesamtstrafenbildung-55-stgb` — bei Mehrfachverurteilten.
- Plugin `strafbefehl-verteidiger` — wenn Verfahren noch im Strafbefehlsstadium ist.
- Plugin `fachanwalt-strafrecht` — gesamtstrafrechtliche Verteidigungssicht.

## Quellen und Stand 05/2026

- StGB §§ 38 ff. (Strafarten, Strafrahmen), § 46 (Grundsatz), §§ 47, 49, 56, 56b–f, 53–55 StGB.
- StPO §§ 153, 153a, 257c, 267 Abs. 3, 407 ff., 460 StPO.
- JGG §§ 5 ff., 17, 18, 105.
- Quellenregel: Keine Kommentar-, Handbuch- oder Aufsatzfundstellen aus Modellwissen; vgl. `references/zitierweise.md`.
