# Registerdiff alt/neu

**Bearbeitung:** Frederik Holst (Compliance Spreebogen), abgestimmt mit Dr. Annegret Beimer
**Stand:** 26.05.2026

## Alte Formulierung (verworfen, Stand 16.05.2026)

> "Spreebogen Regulatory vertritt die deutsche Wasserstoffwirtschaft bei Gesetzgebungsvorhaben."

**Begruendung der Verwerfung:**

1. Verletzt § 5 des Mandatsvertrags HansaH2 (keine Branchenrepraesentation).
2. Ueberspannt die tatsaechliche Mandatslage; Spreebogen hat nur zwei Auftraggeber zum WBG.
3. Verstoesst gegen Anlage 2 LobbyRG (Verhaltenskodex), weil das vertretene Interesse nicht spezifisch beschrieben wird.
4. Die Verwendung dieser Formulierung in der OpenGrid-Einladung (Fassung 1 vom 21.05.2026) hat einen Compliance-Vorfall ausgeloest.

## Neue Formulierung (Stand 26.05.2026)

> "Interessenvertretung im Auftrag einzelner Unternehmen und eines Konsortiums zur gesetzlichen Beschleunigung und regulatorischen Behandlung von Wasserstoffspeichern und Elektrolyseuren im Rahmen des geplanten Wasserstoffbeschleunigungsgesetzes (WBG)."

**Begruendung der neuen Formulierung:**

1. Erfuellt § 5 des Mandatsvertrags HansaH2 (keine Branchenrepraesentation; konkrete Mandantinnen werden im Auftraggeberfeld genannt).
2. Beschreibt das Vorhaben konkret: "Wasserstoffbeschleunigungsgesetz (WBG)" statt "Wasserstoffwirtschaft allgemein".
3. Differenziert die Interessen: Speicher (HansaH2) und Elektrolyse (Konsortium).
4. Vermeidet "Branchenmandat"-Sprache und ist mit der Auftraggeberseite konsistent.

## Diff im JSON

| Feld | Alt | Neu |
|---|---|---|
| `taetigkeit.kurzbeschreibung` | "Spreebogen Regulatory vertritt die deutsche Wasserstoffwirtschaft bei Gesetzgebungsvorhaben." | "Interessenvertretung im Auftrag einzelner Unternehmen und eines Konsortiums zur gesetzlichen Beschleunigung und regulatorischen Behandlung von Wasserstoffspeichern und Elektrolyseuren im Rahmen des geplanten Wasserstoffbeschleunigungsgesetzes (WBG)." |
| `taetigkeit.ausschluss` | nicht vorhanden | "Spreebogen vertritt keine Branchen, keine Verbaende und keine Konsortien jenseits der ausdruecklich genannten Auftraggeber. Eine Aussenkommunikation 'im Namen der deutschen Wasserstoffindustrie' ist ausdruecklich ausgeschlossen." |
| `auftraggeber[0].interesse` | "Speicherprivilegierung und Planungsbeschleunigung" | "Speicherprivilegierung, Planungsbeschleunigung, Klarstellung Duldungspflichten, Uebergangsfristen fuer bestehende Speicherprojekte" |
| `auftraggeber[1].interesse` | "Anschlussprivileg fuer Elektrolyseure" | "Netzentgeltprivileg fuer Elektrolyseure mit Volllaststundenrahmen, Flaechenzugang an Offshore-Anbindungspunkten, technologieoffene Foerderung, Pilotprojekte ohne uneinheitliche Laenderpraxis" |
| `unterauftragnehmer` | nicht vorhanden / nur "pruefen" | OpenGrid Events UG mit Compliance-Hinweis und Vertragsergaenzung |
| `stellungnahmen` | nur Eintrag aus 16.05.2026 ohne Veroeffentlichungs-URL | zwei vollstaendige Eintraege mit Versanddatum, Quartal und Veroeffentlichungs-URL |

## Genehmigungsstand

| Genehmigungsstelle | Status | Datum |
|---|---|---|
| HansaH2 Storage AG (Christine Luehrs) | freigegeben mit Aenderungen am 26.05.2026 | 26.05.2026 |
| Nordsee Elektrolyse Konsortium GbR (Konsortialbeschluss) | freigegeben | 19.05.2026 |
| Stern & Partner mbB (Dr. Beimer) | freigegeben mit RFS-Vorbehalt | 26.05.2026 |
| Spreebogen Geschaeftsfuehrung (Mara Wendt) | freigegeben | 26.05.2026 |

## Einspieltermin

30.05.2026, vor dem Fachgespraech am 12.06.2026 und vor dem Q2-Upload am 30.06.2026.
