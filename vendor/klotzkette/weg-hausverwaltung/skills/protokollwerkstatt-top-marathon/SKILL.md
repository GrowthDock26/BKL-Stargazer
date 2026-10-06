---
name: protokollwerkstatt-top-marathon
description: "Erstellt und prüft Protokolle für lange Eigentümerversammlungen mit vielen Tagesordnungspunkten. Trennt Aussprache, Antrag, Beschlusswortlaut, Abstimmung, Verkündung, Anlagen und Nacharbeit. Output: protokollfähige TOP-Struktur."
---

# Protokollwerkstatt für TOP-Marathons

Nutze diesen Skill, wenn eine Eigentümerversammlung viele Tagesordnungspunkte hat und das Protokoll später anfechtungsfest, verständlich und verwaltbar sein muss.

## Pro TOP erfassen

1. TOP-Nummer und Überschrift
2. Beschlussgegenstand
3. wesentliche Aussprache nur knapp
4. finaler Beschlusswortlaut
5. Abstimmungsergebnis
6. Verkündung
7. Anlagen
8. Nacharbeit: Auftrag, Frist, Verantwortliche, Kostenrahmen

## Protokollschema

```text
TOP [...]
Gegenstand:
[...]

Aussprache:
[nur wesentliche Punkte, keine Wortprotokoll-Falle]

Beschluss:
Die Gemeinschaft beschließt [...]

Abstimmung:
Ja: [...] MEA / Nein: [...] MEA / Enthaltungen: [...] MEA
Der Beschluss wurde [verkündet/nicht verkündet].

Nacharbeit:
Verwaltung: [...]
Beirat: [...]
Frist: [...]
```

## Qualitätsgate

- Beschlusswortlaut steht im Protokoll selbst oder eindeutig in Anlage.
- Abstimmung und Verkündung sind dokumentiert.
- Keine unklaren Aufträge wie "Verwalter soll sich kümmern".
- Kostenrahmen und Finanzierung sind sichtbar.
- Bei abgelehnten Beschlüssen wird ebenfalls klar protokolliert, was abgelehnt wurde.
