---
name: automatisierter-audit-axe-lighthouse
description: "Ordnet automatisierte Accessibility-Scans mit axe, Lighthouse, Pa11y oder ähnlichen Tools ein. Erklärt Treffer, False Positives, False Negatives, manuelle Nachprüfung und Entwickler-Tickets. Output: Scanner-Auswertung."
---

# Automatisierter Audit

Automatische Scanner sind nützlich, aber nicht ausreichend. Sie finden technische Muster, nicht die vollständige Nutzbarkeit.

## Vorgehen

1. Tool, Version, Datum und URL dokumentieren.
2. Treffer gruppieren: kritisch, erheblich, gering, Hinweis.
3. Doppelte Treffer konsolidieren.
4. Manuelle Gegenprüfung markieren.
5. Entwickler-Ticket mit Reproduktion und erwarteter Lösung schreiben.
6. Re-Test nach Fix einplanen.

## Warnung

Ein grüner Lighthouse-Wert ist kein Compliance-Nachweis. Tastaturfallen, unverständliche Fehlertexte, schlechte Screenreader-Reihenfolge, PDF-Probleme und Prozessabbrüche bleiben oft unsichtbar.

## Ticketformat

```text
Titel:
URL/Komponente:
Problem:
Reproduktion:
Betroffene Nutzer:
Erwartetes Verhalten:
Prüfmaßstab:
Priorität:
Nachweis:
```
