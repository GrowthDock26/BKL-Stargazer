# E-Rechnung, GoBD und Billing

## Rechnungsstamm

| Feld | Inhalt | Status |
| --- | --- | --- |
| Rechnungsnummer |  | TODO |
| Mandant |  | TODO |
| Aktenzeichen |  | TODO |
| Leistungszeitraum |  | TODO |
| Umsatzsteuerlogik | Inland / EU / Drittland / Reverse Charge / befreit | TODO |
| Format | PDF / XRechnung / ZUGFeRD | TODO |
| Export | DATEV / CSV / manuell | TODO |

## Leistungspositionen

| Datum | Fee Earner | Workstream | Tätigkeit | Dauer | Satz | Betrag | Narrative | Beleg |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
|  |  |  |  |  |  |  |  |  |

## XRechnung-Datenblock

| Pflichtfeld | Wert | Quelle |
| --- | --- | --- |
| Buyer reference |  |  |
| Seller VAT ID |  |  |
| Invoice issue date |  |  |
| Tax point date |  |  |
| Payment terms |  |  |
| Line item net amount |  |  |
| VAT category |  |  |

## GoBD-Protokoll

- Rechnungsnummer fortlaufend und nicht doppelt vergeben.
- Jede Änderung protokolliert.
- Storno und Korrekturrechnung statt Überschreiben.
- Belege und Leistungsnachweise unveränderbar ablegen.
- XML/PDF/A-3 technisch separat validieren, bevor Versand als final gilt.
