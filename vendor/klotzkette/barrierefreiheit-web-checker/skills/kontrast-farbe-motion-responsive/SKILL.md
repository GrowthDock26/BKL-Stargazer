---
name: kontrast-farbe-motion-responsive
description: "Prüft Kontrast, Farbe ohne Farbcodierung, Zoom, Reflow, Textabstände, responsives Layout, Animationen, Motion-Reduction, Hover-Fallen und mobile Nutzung. Output: visuelle Barrierefreiheitsmatrix."
---

# Kontrast, Farbe, Motion, Responsive

Nutze diesen Skill für visuelle und responsive Barrierefreiheit.

## Prüffelder

- Text- und Komponenten-Kontrast.
- Informationen nicht nur durch Farbe.
- Zoom bis 200 Prozent ohne Funktionsverlust.
- Reflow bei schmaler Ansicht.
- Textabstände und Zeilenhöhen.
- Animationen, Parallax, Autoplay, blinkende Inhalte.
- prefers-reduced-motion respektieren.
- Touch-Zielgrößen und mobile Bedienbarkeit.

## Matrix

| Komponente | Problem | Nutzerwirkung | Fix |
| --- | --- | --- | --- |
| Button | Kontrast zu niedrig | nicht erkennbar | Farbe/Border anpassen |
| Fehlermeldung | nur rot | Farbwahrnehmung | Icon + Text |
| Slider | Autoplay | Bewegung/Bedienung | Pause/Stop + Motion |

## Priorität

Kontrast und Reflow sind oft schnell zu beheben und stark nutzerwirksam. Animationsprobleme werden gern unterschätzt, weil sie nur manche Nutzerinnen und Nutzer hart treffen.
