# Mapping-Notiz Vorlage <-> Term Sheet

## Status

Erstellt am 18.05.2026, 14:20 Uhr, durch RA-Fachangestellte Mara Klein nach Auswertung des Term Sheets Kiosk Huckelriede und Abgleich mit der BSAG-Mietvertragsvorlage. Geprueft durch RA Klotzkette am 18.05.2026, 16:45 Uhr.

## Direkt mappbare Felder

Die folgenden Platzhalter koennen 1:1 aus dem Term Sheet uebernommen werden:

- `<<MIETER>>` -> "Scherflein GmbH"
- `<<MIETER_ANSCHRIFT>>` -> "Buntentorsteinweg 144, 28201 Bremen"
- `<<MIETER_VERTRETER>>` -> "Geschaeftsfuehrer Karl Scherflein"
- `<<MIETOBJEKT>>` -> "Kiosk Haltestelle Huckelriede, Hochstrasse 14, 28201 Bremen"
- `<<MIETFLAECHE>>` -> "ca. 18 qm Verkaufsraum + 6 qm Lager"
- `<<NUTZUNG>>` -> "Imbiss-Kiosk, Zeitungsverkauf, Heissgetraenkeausschank, Lottoannahmestelle"
- `<<KALTMIETE>>` -> "1.450,00 EUR netto monatlich"
- `<<NEBENKOSTEN>>` -> "320,00 EUR netto monatlich (Pauschale)"
- `<<GESAMTMIETE>>` -> "1.770,00 EUR netto monatlich, zzgl. gesetzlicher Umsatzsteuer bei Option"
- `<<KAUTION>>` -> "5.310,00 EUR (drei Bruttomonatsmieten)"
- `<<LAUFZEIT_FEST>>` -> "fuenf Jahre, beginnend am 01.07.2026, endend am 30.06.2031"
- `<<UEBERGABE>>` -> "30.06.2026, 09:00 Uhr, vor Ort"

## Fehlende Felder (zwingend Rueckfrage)

- `<<MIETER_REGISTER>>`: Registergericht und Registernummer der Scherflein GmbH fehlen im Term Sheet.
- `<<MIETER_USTID>>`: USt-IdNr. fehlt; relevant fuer die Option zur Umsatzsteuer.
- `<<KALTMIETE_WORTE>>`, `<<NEBENKOSTEN_WORTE>>`, `<<GESAMTMIETE_WORTE>>`, `<<KAUTION_WORTE>>`: Die Vorlage verlangt Betraege in Worten; das Term Sheet liefert nur Ziffern.
- `<<BSAG_UNTERZEICHNER>>` und `<<BSAG_FUNKTION>>`: Wer unterschreibt fuer die BSAG (Vorstand, Prokurist, Leiter Immobilienmanagement)?

## Konfliktstellen Vorlage vs. Term Sheet

| Feld | Vorlage (generisch) | Term Sheet | Konfliktloesung |
|---|---|---|---|
| Verlaengerungsoption | 2 x 2 Jahre | 2 x 3 Jahre | Term Sheet hat Vorrang, Klausel anpassen |
| Konkurrenzschutz | Nicht vorgesehen | 150 m Umkreis, ausserhalb der BSAG-Haltestellen | Neue Klausel § 8a einfuegen |
| Sortiment | Nicht vorgesehen | Bindung an Imbiss, Zeitungen, Lotto | Neue Klausel § 8b einfuegen |
| Fettabscheider | Nicht vorgesehen | Pflicht Mieter, halbjaehrlich | Neue Klausel § 10a einfuegen |
| Abfallentsorgung | Mieter, ohne Frequenz | Mieter, mind. zweimal pro Woche | Anpassung in § 10 |
| Rueckbaupflicht | Vollstaendig | Ausnahme fuer genehmigte Einbauten | Anpassung in § 14 - offene Rueckfrage |
| USt-Option | Wahlfeld | Beide optieren | Option dokumentieren, Vorsteuerbescheinigung anfordern |

## Hinweise

- Betraege in Worten werden erst beim Clean-Entwurf eingesetzt, nicht im Track-Changes-Lauf.
- Sonderpunkte (Konkurrenzschutz, Sortiment, Fettabscheider) werden im Clean-Entwurf als neue Paragrafen markiert, damit der Vermieter sie identifizieren kann.
- Track-Changes-Fassung wird erst auf ausdrueckliche Anforderung erzeugt - sonst nur Clean-Entwurf.
- Verzeichnis der Anlagen (Lageplan, Grundriss, Uebergabeprotokoll) ist im Term Sheet nicht vollstaendig; vor Versand pruefen.
