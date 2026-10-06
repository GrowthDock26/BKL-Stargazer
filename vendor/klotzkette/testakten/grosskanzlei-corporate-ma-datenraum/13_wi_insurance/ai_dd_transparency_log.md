# KI-DD-Transparenzlog — Projekt Silberfalke

**Aktenzeichen:** MA-2026-SF-001  
**Erstellt:** 20.04.2026  
**Letzte Aktualisierung:** 18.05.2026  
**Verfasser:** Associate B (DD-Koordination)  
**Zweck:** Dokumentation des KI-unterstützten Dokumentenreviews für W&I-Underwriting-Pack und interne Qualitätssicherung

---

## 1. Hintergrund und Zielsetzung

Im Rahmen der Legal Due Diligence wurden 847 Vertragsdokumente aus dem Datenraum (Virtual Data Room, VDR-Plattform SilverSpace) mithilfe eines KI-basierten Dokument-Review-Tools vorgeprüft. Dieses Tool wurde für die erste Sichtung (First Pass) eingesetzt, um das Reviewteam zu unterstützen. Alle durch das Tool als erheblich identifizierten Findings wurden durch einen Senior Counsel oder Partner überprüft (Senior Review). Dieses Dokument hält Methodik, Stichprobe und Qualitätssicherungsmaßnahmen fest.

---

## 2. Eingesetztes Tool

| Parameter | Details |
|---|---|
| Tool / Plattform | KI-Vertragsanalyse-Modul (Name intern nicht offenzulegen ggü. Underwriter) |
| Einsatzbereich | Erstlektüre kommerzielle Verträge, Arbeitsverträge, IP-Lizenzen |
| Review-Sprachen | Deutsch, Englisch |
| Datenraum-Abdeckung | 847 Dokumente (von 1.204 gesamten DR-Dokumenten) |
| Ausschlüsse | Finanzunterlagen (durch Financial DD), Behördenkorrespondenz (manuell) |

---

## 3. Stichprobenplan

| Kategorie | Dokumente im DR | KI-geprüft | Manuelle Stichprobe (20 %) | Senior-Review (rote Findings) |
|---|---|---|---|---|
| Kommerzielle Verträge C-001 bis C-020 | 287 | 287 | 57 | 12 (alle roten) |
| Arbeitsverträge / Geschäftsführerverträge | 143 | 143 | 29 | 4 |
| IP-Lizenzverträge | 89 | 89 | 18 | 6 |
| Lieferantenverträge | 191 | 191 | 38 | 9 |
| Mietverträge / Betriebsgelände | 47 | 47 | 9 | 2 |
| Sonstige (Versicherungen, Satzungen etc.) | 90 | 90 | 18 | 0 |
| **Gesamt** | **847** | **847** | **169** | **33** |

---

## 4. Klassifizierung der Findings

### 4.1 Ampel-System

| Kategorie | Beschreibung | Anzahl | Bearbeitung |
|---|---|---|---|
| Rot (Red Flag) | Materielle Risiken; möglicher Material-Adverse-Effect | 33 | Senior Review abgeschlossen |
| Gelb (Watch) | Mittelrisiken, ggf. Vertragsanpassung nötig | 118 | Associate-Review, Dokumentation |
| Grün (Clean) | Keine wesentlichen Auffälligkeiten | 696 | KI-Ergebnis bestätigt durch Stichprobe |

### 4.2 Rote Findings — Auswahl

| ID | Vertrag | Finding | Status |
|---|---|---|---|
| RF-001 | Rahmenvertrag Aero Nordic AS | Change-of-Control-Klausel: Consent-Pflicht bei > 50 % Anteilsübergang | CP-14 |
| RF-002 | Lizenzvertrag TechSpin GmbH | Exklusivität an bestimmte Gesellschaft geknüpft (nicht automatisch übertragbar) | Nachverhandlung |
| RF-003 | GF-Vertrag Dr. Wagner | Sonderkündigungsrecht bei CoC; Abfindung EUR 350.000 | W&I-Ausschluss |
| RF-004 | Lieferant Müller Antriebstechnik | Vertragliche Lieferpflicht vs. bevorstehendem Lieferstopp | OCM OC-E-001 |
| RF-005 | Mietvertrag Essener Hauptwerk | Untervermietungsklausel unklar; benötigt Vermieter-Consent | Prüfung läuft |

---

## 5. Qualitätssicherungsmaßnahmen

| Maßnahme | Details |
|---|---|
| Stichprobenkontrolle | 20 % aller Grün-Klassifizierungen wurden manuell durch Associate überprüft |
| Senior Review | 100 % aller Rot-Findings durch Partner A oder Counsel B bestätigt |
| Konsistenzprüfung | KI-Klassifizierungen wurden mit dem Q&A-Register abgeglichen |
| Halluzinationscheck | 3 % der KI-Zusammenfassungen enthielten sachliche Fehler → wurden korrigiert |
| Versionskontrolle | Log-Datei mit Zeitstempel je Dokument vorhanden |

---

## 6. Offenlegung gegenüber Underwriter

Dieser Transparenzlog wird dem W&I-Underwriter (BlueSky Re) als Teil des Underwriting Packs übergeben. Folgende Einschränkungen gelten:

- Die Stichprobenquote und Methodik wird offengelegt  
- Spezifische Tool-Namen und -Versionen werden nicht offengelegt (kein Underwriting-Recht auf Einsicht in proprietäre Software)  
- Alle roten Findings wurden manuell verifiziert — dies wird ausdrücklich bestätigt  
- KI-Ergebnisse ersetzen nicht die anwaltliche Beurteilung; alle Rechtsfragen wurden durch qualifizierte Anwälte beurteilt  

---

## 7. Fazit

Der KI-gestützte First-Pass hat die Reviewkapazität erheblich erweitert und ermöglichte einen vollständigen Abdeckungsgrad bei vertretbarem Aufwand. Die Qualitätssicherung durch Senior Reviews ist lückenlos dokumentiert. Der Log ist für W&I-Zwecke und als interne Compliance-Dokumentation geeignet.

---

*Aktenvermerk-Nr.: AV-KI-2026-001 | Privileged & Confidential*
