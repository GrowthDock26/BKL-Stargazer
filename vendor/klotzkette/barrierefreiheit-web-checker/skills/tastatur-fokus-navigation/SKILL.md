---
name: tastatur-fokus-navigation
description: "Prüft Tastaturbedienbarkeit, Fokusreihenfolge, sichtbaren Fokus, Skiplinks, Menüs, Modale, Cookie-Banner, Slider, Accordions und Tastaturfallen. Output: Tastaturprotokoll und Fix-Tickets."
---

# Tastatur, Fokus, Navigation

Nutze diesen Skill für die wichtigste manuelle Prüfung: Kann man die Website ohne Maus bedienen?

## Prüfpfad

1. Tab-Reihenfolge ab Startseite.
2. Skiplink oder direkter Sprung zum Hauptinhalt.
3. Sichtbarer Fokus in allen Zuständen.
4. Menüs, Submenüs, Filter, Slider, Accordions.
5. Modale, Cookie-Banner, Warenkorb, Login.
6. Fokus bleibt nicht gefangen und geht nach Schließen sinnvoll zurück.
7. Alle interaktiven Elemente sind erreichbar und auslösbar.

## Protokoll

| URL | Element | Problem | Reproduktion | Priorität | Fix |
| --- | --- | --- | --- | --- | --- |

## Red Flags

- Fokus unsichtbar.
- Cookie-Banner blockiert Tastatur.
- Menü öffnet per Hover, aber nicht per Tastatur.
- Modal lässt Fokus im Hintergrund weiterlaufen.
- Buttons sind als div gebaut.
