# Simulierter Kanzleitag

| Uhrzeit | Ereignis | Erwarteter Skill | Haltepunkt |
| --- | --- | --- | --- |
| 09:00 | Tagesstart, Integrationscheck, Fristenblick | kanzlei-allgemein-kaltstart / integrationen-simulation | Simulation bestätigen |
| 10:00 | Neue E-Mail von Mandantin Meyer, WhatsApp-Screenshot, Fax vom Amtsgericht | intake | Akte zuordnen |
| 11:00 | beA-Journal mit einer neuen gerichtlichen Verfügung und einem offenen EB | bea-journal / fristen-monitor | EB nicht ohne Freigabe |
| 12:00 | Rohentwurf Schriftsatzantwort ist zu pauschal | schreibcanvas / freundlicher-copilot | Substanz ergänzen |
| 13:00 | Zeit für Intake, beA, Entwurf und Mandantenkontakt erfassen | zeitnarrative | Narrative freigeben |
| 14:00 | Neue Mandatsanfrage mit GwG/KYC, PEP-Fragen, Aktenzeichen und Kontoblatt | mandatsannahme-gwg / akte / mandatsvereinbarung | Mandat nicht ohne Freigabe annehmen |
| 15:00 | Eingangsrechnungen und Vorsteuer sammeln | ustva-buchhaltung | UStVA nur vorbereiten |
| 16:00 | Ausgangsrechnung an Mandantin und E-Rechnung prüfen | rechnung / erechnung | nicht finalisieren |
| 17:00 | Versand per beA simulieren, Journal und ZIP sichern | output-versand / bea-journal | kein echter Versand |
| 18:00 | Tagesabschluss | automationen | offene Punkte anzeigen |
