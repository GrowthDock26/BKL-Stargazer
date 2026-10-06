# Billing / E-Rechnung / GoBD — Projekt Silberfalke

**Aktenzeichen:** MA-2026-SF-001
**Erstellt:** 20.05.2026
**Verfasser:** Billing-Koordination Kanzlei (Counsel B)
**Adressat:** Kanzlei-Management / Mandant Eagle Capital Partners
**Status:** Arbeitsfassung — freigabe Mandant ausstehend

---

## 1. Überblick Abrechnungsstruktur

### 1.1 Workstream-Aufteilung

| Workstream | Verantwortlicher Partner | Abgerechnet über |
|---|---|---|
| Structure / Tax | Partner A | Kanzlei-Rechnung 1 |
| Due Diligence (Legal) | Partner A / Counsel B | Kanzlei-Rechnung 1 |
| SPA / Closing | Counsel B | Kanzlei-Rechnung 1 |
| Regulatory | Dr. Meiners | Kanzlei-Rechnung 2 (Regulatory Group) |
| MAR / Kapitalmarkt | Dr. Kessler | Kanzlei-Rechnung 3 (Kapitalmarkt) |
| Restrukturierung / StaRUG | Counsel D | Kanzlei-Rechnung 4 (Restrukturierung) |

### 1.2 Abrechnungszeitraum

Erste Teilrechnung: 01.04.2026 – 31.05.2026
Zweite Teilrechnung: 01.06.2026 – Signing (bereits abgerechnet)
Abschlussrechnung: Post-Closing

---

## 2. Narrative Ledger (Mandantengerechte Leistungsbeschreibungen)

| Datum | Person | WS | Stunden | Narrative (mandantentauglich) | Betrag EUR |
|---|---|---|---|---|---|
| 14.05.2026 | Partner A | Structure | 1,8 | Rechtsberatung zur Transaktionsstruktur; Analyse Share Deal vs. Asset Deal und Carve-out-Varianten | 1.170,00 |
| 15.05.2026 | Associate B | DD | 4,6 | Vertragsreview kommerzielle Schlüsselverträge; Erstellung der Red-Flag-Analyse | 1.288,00 |
| 16.05.2026 | Associate C | Regulatory | 2,9 | Fusionskontroll- und Außenwirtschaftsrecht-Erstanalyse; Erstellung Regulatory Map | 812,00 |
| 17.05.2026 | Partner A | SPA | 2,2 | Erarbeitung der wesentlichen Vertragsparameter; Abstimmung mit Eagle Counsel | 1.430,00 |
| 18.05.2026 | Associate B | Closing | 3,4 | Aufbau Closing-Checkliste und CP-Register; Closing-Koordination | 952,00 |
| 19.05.2026 | Counsel B | W&I | 1,5 | Beratung zur W&I-Versicherungsstruktur; Abstimmung mit Versicherungsmakler | 630,00 |
| 19.05.2026 | Associate C | Regulatory | 3,2 | Vertiefende Außenwirtschaftsrecht-Analyse; FDI-Sektoreinstufung Solaris | 896,00 |
| 20.05.2026 | Partner A | MAR | 1,2 | Kapitalmarktrechtliche Beratung; Marktmissbrauchsrecht-Memo für Nordstern SE | 780,00 |
| 20.05.2026 | Counsel B | Closing | 1,8 | Ordinary-Course-Monitoring; Consent-Prozess Lieferantenvertrag | 756,00 |
| 20.05.2026 | Associate B | PMI | 2,5 | Koordination PMI-Planung; Strukturierung des 100-Tage-Plans | 700,00 |
| **Gesamt** | | | **25,1** | | **9.414,00** |

> **Hinweis:** Die Leistungsbeschreibungen enthalten keine mandatsspezifischen Einzelheiten, die das Mandatsgeheimnis verletzen könnten. Strategische Beratungsinhalte sind nicht offengelegt. Umsatzsteuer: Offen — Leistungsort und Mandantenstatus (§ 13b UStG) noch zu prüfen.

---

## 3. XRechnung-Datenblock (Strukturentwurf)

```xml
<!-- XRechnung-Datenblock Entwurf — NICHT als validiertes Dokument ausgeben -->
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ID>KZ-MA-2026-SF-001-R1</ID>
  <IssueDate>2026-05-31</IssueDate>
  <DueDate>2026-06-30</DueDate>
  <InvoiceTypeCode>380</InvoiceTypeCode>
  <DocumentCurrencyCode>EUR</DocumentCurrencyCode>
  <AccountingSupplierParty>
    <Party>
      <PartyName><Name>[Kanzleiname]</Name></PartyName>
      <PostalAddress>
        <StreetName>[Kanzleiadresse]</StreetName>
        <CityName>Frankfurt am Main</CityName>
        <PostalZone>60311</PostalZone>
        <Country><IdentificationCode>DE</IdentificationCode></Country>
      </PostalAddress>
    </Party>
  </AccountingSupplierParty>
  <AccountingCustomerParty>
    <Party>
      <PartyName><Name>Eagle Capital Partners Fund V GmbH Co. KG</Name></PartyName>
      <PostalAddress>
        <StreetName>Eschersheimer Landstrasse 12</StreetName>
        <CityName>Frankfurt am Main</CityName>
        <PostalZone>60322</PostalZone>
        <Country><IdentificationCode>DE</IdentificationCode></Country>
      </PostalAddress>
    </Party>
  </AccountingCustomerParty>
  <LegalMonetaryTotal>
    <LineExtensionAmount currencyID="EUR">9414.00</LineExtensionAmount>
    <TaxExclusiveAmount currencyID="EUR">9414.00</TaxExclusiveAmount>
    <!-- Offen: USt-Betrag nach Klärung Leistungsort eintragen -->
    <PayableAmount currencyID="EUR">9414.00</PayableAmount>
  </LegalMonetaryTotal>
</Invoice>
```

> **Offen:** Umsatzsteuerlogik noch offen. Wenn Eagle Capital Partners Fund V als Unternehmer im Inland gilt (§ 3a Abs. 2 UStG), schuldet Mandant USt nach § 13b UStG. Bestätigung Mandantenstatus anfordern.

---

## 4. GoBD-Protokoll

**Rechnungsnummer:** KZ-MA-2026-SF-001-R1
**Erstellt:** 31.05.2026
**Erstellt von:** Billing Counsel B
**System:** Kanzlei-DMS (Legalware Pro, Version 4.2)

| Nr. | Ereignis | Datum | Handelnde Person | Ergebnis |
|---|---|---|---|---|
| 1 | Entwurf erstellt | 20.05.2026 | Counsel B | Rohentwurf im DMS |
| 2 | Partner-Review | 25.05.2026 | Partner A | Freigabe mit Änderungen |
| 3 | Überarbeitung Narrative | 27.05.2026 | Counsel B | Anpassung Leistungsbeschreibung |
| 4 | Mandantenfreigabe angefordert | 28.05.2026 | Billing | Ausstehend |
| 5 | Rechnungsversand (geplant) | 31.05.2026 | Billing | Ausstehend |

### Korrekturpfad

Sollte nach Rechnungsversand eine Korrektur notwendig sein:
1. Stornierung der Originalrechnung mit Stornobeleg (Dokument-ID KZ-MA-2026-SF-001-R1-STORNO)
2. Erstellung einer korrigierten Rechnung mit neuer fortlaufender Nummer
3. Eintrag im Änderungslog (diese Tabelle)
4. Aufbewahrungsfrist: 10 Jahre nach Buchungsdatum (§ 147 AO)

### Aufbewahrungshinweis (§ 147 AO / GoBD)

| Dokumenttyp | Frist | Format |
|---|---|---|
| Zeitnachweise (Rohdaten) | 10 Jahre | CSV + PDF gesichert |
| Ausgangsrechnung | 10 Jahre | XRechnung / PDF |
| GoBD-Protokoll (dieses Dokument) | 10 Jahre | MD + PDF |
| E-Mail-Kommunikation Mandant | 6 Jahre | Archiv-System |

---

## 5. ZUGFeRD-Prüfpaket

> **Klarstellung:** Das nachfolgende ist ein **Prüfpaket**, kein final validiertes ZUGFeRD-konformes PDF/A-3-Dokument. Für ein finales ZUGFeRD-Dokument ist eine zertifizierte Erstellungssoftware erforderlich (z.B. Mustang Library oder kommerzielle Kanzlei-Software).

Für die Erstellung des finalen ZUGFeRD-Dokuments sind folgende Schritte vorgesehen:

1. XRechnung-Datenblock (oben) finalisieren
2. PDF-Rechnungsdokument aus Kanzlei-DMS exportieren
3. XRechnung-XML in PDF/A-3 einbetten (ZUGFeRD 2.1 Profil EN 16931)
4. Validierung mit ZUGFeRD-Validator (z.B. Mustang Validator)
5. Versand per E-Mail oder DE-Mail an Mandanten

---

*GoBD-Protokoll-Nr.: GBD-MA-2026-SF-001-R1 | Kanzlei-intern*
