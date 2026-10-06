---
name: en301549-wcag-pruefplan
description: "Erstellt Prüfkatalog nach EN 301 549 und WCAG. Trennt rechtlich harmonisierten Standard von fachlicher WCAG-2.2-Erweiterung, definiert Seitentypen, Stichprobe, A/AA-Kriterien, manuelle Checks und Nachweise. Output: Auditplan."
---

# EN 301 549 und WCAG-Prüfplan

Nutze diesen Skill, um aus einer Website einen belastbaren Auditplan zu machen.

## Auditstruktur

1. Rechtsmaßstab festlegen.
2. Seitentypen bestimmen: Start, Navigation, Suche, Produkt, Checkout, Login, Formular, Konto, PDF, Fehlerseite.
3. Kritische User Journeys auswählen.
4. Automatisierte Checks einplanen.
5. Manuelle Tastatur- und Screenreader-Prüfung einplanen.
6. Ergebnisse nach Schwere, Häufigkeit und Nutzerimpact priorisieren.
7. Nachweise sammeln: Screenshot, URL, DOM-Auszug, Reproduktionsschritt, erwartetes Verhalten.

## Prüftabelle

| Bereich | Prüfung | Methode | Priorität |
| --- | --- | --- | --- |
| Wahrnehmbar | Textalternativen, Kontrast, Zoom | Tool + manuell | hoch |
| Bedienbar | Tastatur, Fokus, Skiplinks | manuell | hoch |
| Verständlich | Labels, Fehlermeldungen, Sprache | manuell | hoch |
| Robust | Semantik, ARIA, Screenreader | manuell + DOM | hoch |
| Dokumente | PDF-Tags, Lesereihenfolge | PDF-Prüfung | mittel/hoch |

## Hinweis

WCAG 2.2 ist fachlich sinnvoll, aber nicht automatisch der harmonisierte Rechtsmaßstab für jede EU-Konstellation. Das Audit kann deshalb zwei Spalten führen: rechtliche Mindestprüfung und empfehlenswerte Zusatzprüfung.
