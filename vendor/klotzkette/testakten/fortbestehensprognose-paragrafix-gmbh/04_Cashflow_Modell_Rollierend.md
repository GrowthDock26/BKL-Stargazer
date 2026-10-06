# Vorschau: 04_Cashflow_Modell_Rollierend

> Markdown-Vorschau der gleichnamigen XLSX-Datei. Berechnungen, Formeln und Formatierung nur im Original.

## Sheet: Inputs

### CASHFLOW-MODELL ROLLIEREND — Paragrafix GmbH — Eingabeparameter
_Planungshorizont: Mai 2026 – April 2027 \| Stichtag Ist-Start: 30.04.2026 \| Erstellt: 02.05.2026_
_LIQUIDITÄTSPARAMETER_

| Kassenbestand 30.04.2026 | 1.870.000 | EUR — tatsächlicher Cash-Bestand (Commerzbank, DB, Penta, Wise) |
|---|---|---|
| MRR April 2026 (Ist) | 187.400 | EUR — Monthly Recurring Revenue |
| MoM-Wachstumsrate Umsatz (Base) | 6 % | % — konservativ (war 12 %, halbe Rate für Planung) |
| MoM-Wachstumsrate Umsatz (Stress) | 3 % | % — Stress-Szenario: halbe Base-Rate |
| BETRIEBSKOSTEN (MONATLICH) |  |  |
| Personalkosten brutto inkl. AG-Anteil | 247.000 | EUR / Monat — 28 Festangestellte + GF |
| LLM-Tokenkosten (OpenAI 38 %, Anthropic 42 %, Mistral 20 %) | 38.000 | EUR / Monat |
| AWS Cloud eu-central-1 | 22.500 | EUR / Monat |
| SaaS-Lizenzen (Linear, Notion, GitHub, Sentry, Datadog, Slack) | 8.400 | EUR / Monat |
| Gewerbemiete Heidestraße 78 + NK | 18.700 | EUR / Monat |
| Steuerberatung + Rechtsberatung | 6.200 | EUR / Monat |
| Marketing und Sales (LinkedIn, Konferenzen) | 24.000 | EUR / Monat |
| Sonstige Aufwendungen | 7.700 | EUR / Monat |
| USt-Vorauszahlung (Saldo netto) | 7.500 | EUR / Monat |
| FINANZIERUNGSPARAMETER |  |  |
| Series-A Tranche 2 — Betrag | 3.000.000 | EUR — wird in Aug 2026 (Base) erwartet |
| Series-A Tranche 2 — Stressreduktion | 50 % | Anteil, um den Tranche 2 im Stress-Szenario reduziert wird |
| Wandeldarlehen Earlybird (möglich) | 1.500.000 | EUR — diskutiert, noch nicht unterschrieben |
| Monat Tranche 2 Eingang (Base) | 4 | Monatsindex ab Mai = 1; Index 4 = August 2026 |
| Monat Tranche 2 Eingang (Stress) | 7 | Monatsindex; Index 7 = November 2026 (verzögert) |

## Sheet: Base Case

### ROLLIERENDER 12-MONATS-CASHFLOW — BASE CASE — Paragrafix GmbH
_Planungsannahme: Series-A Tranche 2 (3,0 Mio. EUR) im August 2026 erwartet \| Stand: 02.05.2026_

| Position | Mai 2026 | Jun 2026 | Jul 2026 | Aug 2026 | Sep 2026 | Okt 2026 | Nov 2026 | Dez 2026 | Jan 2027 | Feb 2027 | Mär 2027 | Apr 2027 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EINZAHLUNGEN |  |  |  |  |  |  |  |  |  |  |  |  |
| Abo-Umsatz (MRR, brutto) | 198.644 | 210.562,64 | 223.196,40 | 236.588,18 | 250.783,47 | 265.830,48 | 281.780,31 | 298.687,13 | 316.608,36 | 335.604,86 | 355.741,15 | 377.085,62 |
| Professional Services / Onboarding | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 |
| Series-A Tranche 2 (Finanzierung) | 0 | 0 | 0 | 3.000.000 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Summe Einzahlungen | 205.144 | 217.062,64 | 229.696,40 | 3.243.088,18 | 257.283,47 | 272.330,48 | 288.280,31 | 305.187,13 | 323.108,36 | 342.104,86 | 362.241,15 | 383.585,62 |
| AUSZAHLUNGEN |  |  |  |  |  |  |  |  |  |  |  |  |
| Personalkosten brutto inkl. AG-Anteil | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 |
| LLM-Tokenkosten (OpenAI, Anthropic, Mistral) | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 |
| AWS Cloud (eu-central-1) | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 |
| SaaS-Lizenzen | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 |
| Miete Heidestraße 78 + NK | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 |
| Steuerberatung + Rechtsberatung | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 |
| Marketing / Sales | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 |
| Sonstige Aufwendungen | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 |
| USt-Vorauszahlung (Saldo) | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 |
| Summe Auszahlungen | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 |
| LIQUIDITÄT |  |  |  |  |  |  |  |  |  |  |  |  |
| Anfangsbestand | 1.870.000 | 1.695.144 | 1.532.206,64 | 1.381.903,04 | 4.244.991,22 | 4.122.274,69 | 4.014.605,18 | 3.922.885,49 | 3.848.072,62 | 3.791.180,97 | 3.753.285,83 | 3.735.526,98 |
| Netto-Cashflow | -174.856 | -162.937,36 | -150.303,60 | 2.863.088,18 | -122.716,53 | -107.669,52 | -91.719,69 | -74.812,87 | -56.891,64 | -37.895,14 | -17.758,85 | 3.585,62 |
| Endbestand | 1.695.144 | 1.532.206,64 | 1.381.903,04 | 4.244.991,22 | 4.122.274,69 | 4.014.605,18 | 3.922.885,49 | 3.848.072,62 | 3.791.180,97 | 3.753.285,83 | 3.735.526,98 | 3.739.112,60 |
| Ampel-Status | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN |

## Sheet: Stress Case

### ROLLIERENDER 12-MONATS-CASHFLOW — STRESS-SZENARIO — Paragrafix GmbH
_Planungsannahme: Tranche 2 auf 1,5 Mio. EUR reduziert und auf November 2026 verzögert \| Stand: 02.05.2026_

| Position | Mai 2026 | Jun 2026 | Jul 2026 | Aug 2026 | Sep 2026 | Okt 2026 | Nov 2026 | Dez 2026 | Jan 2027 | Feb 2027 | Mär 2027 | Apr 2027 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EINZAHLUNGEN |  |  |  |  |  |  |  |  |  |  |  |  |
| Abo-Umsatz (MRR, brutto) | 193.022 | 198.812,66 | 204.777,04 | 210.920,35 | 217.247,96 | 223.765,40 | 230.478,36 | 237.392,71 | 244.514,49 | 251.849,93 | 259.405,43 | 267.187,59 |
| Professional Services / Onboarding | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 | 6.500 |
| Series-A Tranche 2 (Finanzierung) | 0 | 0 | 0 | 0 | 0 | 0 | 1.500.000 | 0 | 0 | 0 | 0 | 0 |
| Summe Einzahlungen | 199.522 | 205.312,66 | 211.277,04 | 217.420,35 | 223.747,96 | 230.265,40 | 1.736.978,36 | 243.892,71 | 251.014,49 | 258.349,93 | 265.905,43 | 273.687,59 |
| AUSZAHLUNGEN |  |  |  |  |  |  |  |  |  |  |  |  |
| Personalkosten brutto inkl. AG-Anteil | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 | 247.000 |
| LLM-Tokenkosten (OpenAI, Anthropic, Mistral) | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 | 38.000 |
| AWS Cloud (eu-central-1) | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 | 22.500 |
| SaaS-Lizenzen | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 | 8.400 |
| Miete Heidestraße 78 + NK | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 | 18.700 |
| Steuerberatung + Rechtsberatung | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 | 6.200 |
| Marketing / Sales | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 | 24.000 |
| Sonstige Aufwendungen | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 | 7.700 |
| USt-Vorauszahlung (Saldo) | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 | 7.500 |
| Summe Auszahlungen | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 | 380.000 |
| LIQUIDITÄT |  |  |  |  |  |  |  |  |  |  |  |  |
| Anfangsbestand | 1.870.000 | 1.689.522 | 1.514.834,66 | 1.346.111,70 | 1.183.532,05 | 1.027.280,01 | 877.545,41 | 2.234.523,78 | 2.098.416,49 | 1.969.430,98 | 1.847.780,91 | 1.733.686,34 |
| Netto-Cashflow | -180.478 | -174.687,34 | -168.722,96 | -162.579,65 | -156.252,04 | -149.734,60 | 1.356.978,36 | -136.107,29 | -128.985,51 | -121.650,07 | -114.094,57 | -106.312,41 |
| Endbestand | 1.689.522 | 1.514.834,66 | 1.346.111,70 | 1.183.532,05 | 1.027.280,01 | 877.545,41 | 2.234.523,78 | 2.098.416,49 | 1.969.430,98 | 1.847.780,91 | 1.733.686,34 | 1.627.373,93 |
| Ampel-Status | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN | GRÜN |

## Sheet: Sensitivity

### SENSITIVITÄTSANALYSE — Cash-Runway bei variierenden Annahmen
_Zeigt verbleibenden Cash-Bestand am 30.04.2027 unter verschiedenen Wachstums- und Finanzierungsszenarien_

| Wachstum / Szenario | Ohne Tranche 2 | Tranche 2 1,5 Mio (Aug) | Tranche 2 3,0 Mio (Aug) | Tranche 2 3,0 Mio + Bridge |
|---|---|---|---|---|
| 0 % | -363.200 | 1.136.800 | 2.636.800 | 4.136.800 |
| 3 % | 127,373.93 | 1,627,373.93 | 3,127,373.93 | 4,627,373.93 |
| 6 % | 739,112.5992 | 2,239,112.5992 | 3,739,112.5992 | 5,239,112.5992 |
| 9 % | 1,502,064.2702 | 3,002,064.2702 | 4,502,064.2702 | 6,002,064.2702 |
| 12 % | 2,453,255.076 | 3,953,255.076 | 5,453,255.076 | 6,953,255.076 |
