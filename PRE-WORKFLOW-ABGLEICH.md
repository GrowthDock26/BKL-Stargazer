# Abgleich: Lastenheft PRE9/PRE10 ↔ BKL Legal OS

Stand 06.08.2026, geprüft gegen Lastenheft v0.1 (Arbeitsentwurf) und den
Codestand von heute.

---

## 1. Kurzfassung

**WF-003 (Mandatsanlage) steht zu großen Teilen. WF-001 und WF-002 fehlen
vollständig — und sie sind bei über 100 Mandaten das eigentliche Bauvorhaben.**

Der entscheidende Unterschied: Das Statusmodell des Lastenhefts beginnt **vor**
der Akte (Interessent → Telefontermin → Mandat angenommen). Das System kennt
keinen Zustand vor der Aktenanlage — sein erster Zustand heißt „NEU" und setzt
eine angelegte Akte voraus. Die gesamte Interessenten- und Nachfassphase hat
heute keinen Ort.

Bei über 100 Mandaten ist genau diese Phase die Massenphase: Dreiviertel des
Aufwands entsteht dort, wo noch gar keine Akte existiert. Sie braucht eine
Liste mit Automatik, keine Einzelbedienung je Vorgang.

---

## 2. Statusmodell

| Lastenheft | Entsprechung heute | Bewertung |
|---|---|---|
| Interessent | — | **neu** |
| Telefontermin | — | **neu** |
| Mandat angenommen | — | **neu** |
| Mandat angelegt | `NEU`, `GWG_ANSCHREIBEN_ERZEUGT` … | vorhanden |
| Unterlagen versendet | `ONBOARDING_VERSANDT` | vorhanden, **aber andere Bedeutung** (s.u.) |
| Warten auf Rücklauf | `ONBOARDING_VERSANDT` | vorhanden |
| Nachforderung | — | **neu** (WF-002 b/c) |
| Unterlagen vollständig | `RUECKLAUF_BESTAETIGT` | vorhanden |
| Deckungsanfrage | — | **neu** (WF-006) |
| Deckungszusage | — | **neu** |
| Aufforderung versendet | `ANSPRUCH_VERSANDT` | vorhanden |
| Rechnung offen | — | **neu** (WF-009) |
| Rechnung bezahlt | — | **neu** |
| Klagevorbereitung | `FRIST_ABGELAUFEN` / `KLAGE_ENTWURF` | vorhanden |
| Klage eingereicht | `KLAGE_EINGEREICHT` | vorhanden |
| Verfahren läuft | — | **neu** |
| Abgeschlossen | — | **neu** |

**Bedeutungskonflikt bei „Unterlagen versendet":** Heute werden die Unterlagen
erst nach Aufnahmebogen und GwG-Prüfung versandt — also spät. Das Lastenheft
schickt Fragebogen, Vollmacht, Widerrufsbelehrung und Kostenaufklärung schon in
WF-001 an den Interessenten, bevor irgendetwas geprüft ist. Das ist kein Detail:
Es dreht die Reihenfolge um und muss mit der GwG-Strecke zusammengebracht werden
(die Identifizierung nach §§ 10 ff. GwG hängt an der Mandatsannahme, nicht am
Erstkontakt).

---

## 3. Datenmodell

### Mandant
Name, Adresse, Telefon, E-Mail, RSV: **alle vorhanden** in `mandanten`,
einschließlich Versicherer und Versicherungsscheinnummer.
Aber: Die Tabelle hängt an einer Akte (`matter_id`) und wird erst mit dem
Aufnahmebogen gefüllt. **Für die Interessentenphase fehlt ein Träger.**

### Verfahren
| Feld | Status |
|---|---|
| Aktenzeichen | vorhanden |
| Status | vorhanden |
| Bearbeiter | vorhanden (`sachbearbeiter`, `zustaendiger_anwalt_id`) |
| Streitwert | wird berechnet, **bewusst nicht gespeichert** — er ändert sich, sobald eine Auszahlung nachgetragen wird |
| Rubrum | **fehlt** |
| Gegner | nur Freitextfeld, nicht strukturiert |

### Dokumente
| Lastenheft | Status |
|---|---|
| Vollmacht | vorhanden |
| Fragebogen | vorhanden (`PRE_FRAGEBOGEN`, inkl. Vision-Auslesung) |
| Widerruf | vorhanden |
| Datenschutz | **fehlt als Dokument** (nur ein Hinweis-Flag am Aufnahmebogen) |
| Rechnung | **fehlt** |
| Klage | Dokumenttyp vorhanden, Erzeugung nicht |

### Fristen
Die Tabelle `fristen` trägt jeden Typ, hat Reminderdatum, Werktagsberechnung und
eine Idempotenzsperre gegen Doppelbenachrichtigung. Verjährung und Vorfrist
werden bei Pro-Real-Akten bereits automatisch angelegt.

**Was fehlt, ist nicht die Frist, sondern die Wiedervorlage.** Die vorhandene
Mechanik ist auf „Frist läuft ab, dann Alarm" gebaut. WF-002 braucht etwas
anderes: eine Schleife, die nach 10 Tagen prüft, ob etwas eingegangen ist, und
je nach Ergebnis eskaliert oder abschließt. Das ist eine eigene Mechanik, kein
neuer Fristentyp.

---

## 4. Module

### WF-001 Interessentenaufnahme — fehlt vollständig
Braucht: Interessenten-Datensatz (vor der Akte), Infomail mit vier Anlagen,
Wiedervorlage 10 Tage.

> **Blocker: Das System kann derzeit gar nichts versenden.** In der
> Backend-Konfiguration ist kein SMTP-Zugang hinterlegt (`SMTP_HOST` leer).
> Alle „versandt"-Schritte sind heute Handarbeit: Text kopieren, im eigenen
> Mailprogramm senden. Für 100+ Interessenten mit dreistufiger Nachfassschleife
> ist automatischer Versand die Voraussetzung, nicht die Kür.

Offen: „Kostenaufklärung" gibt es nicht als eigenes Dokument. Ist die
Honorarvereinbarung gemeint oder ein zusätzliches Schreiben?

### WF-002 a/b/c Rücklaufkontrolle und Eskalation — fehlt vollständig
Der Kern des Lastenhefts: dreistufige Schleife à 10 Tage, zweite und dritte
E-Mail mit unterschiedlichem Ton, danach Hinweis an den Finanzvertrieb.
Der Scheduler läuft bereits alle fünf Minuten und kann das tragen.

Offen: **Hinweis an den Finanzvertrieb** — an wen, über welchen Kanal, mit
welchen Angaben? Das ist eine Weitergabe von Mandantendaten an einen Dritten und
braucht eine tragfähige Grundlage; im Zweifel nur Name und Vorgangsnummer, nicht
der Sachverhalt.

### WF-003 Mandatsanlage — steht zu etwa 80 %
Akte, Fristen und Standarddokumente entstehen automatisch (die
Dokumentenerzeugung wurde gestern auf das vollständige Paket erweitert).
Fehlen: Rubrum und strukturierter Gegner.

### WF-004, WF-005 — im Lastenheft nicht beschrieben
Die Überschrift kündigt „WF-001 bis WF-005" an, der Text endet bei WF-003.

---

## 5. Was ich für den Bau brauche

1. **WF-004 und WF-005** — fehlen im Entwurf.
2. **Der Ablaufplan „Mandate bei Schadensersatz wegen Pro Real Europa 9/10"**
   als Datei. Er wird im Code als Quelle zitiert, liegt aber nirgends ab.
3. **Die Mailtexte** für WF-001 sowie die zweite und dritte Mail aus WF-002.
   Freitext vom Sprachmodell wäre hier falsch: Es sind Serienbriefe, die
   hundertfach gleich rausgehen und einmal anwaltlich freigegeben werden.
4. **Finanzvertrieb**: Empfänger, Kanal, Datenumfang.
5. **SMTP-Zugang** (EU-gehostet) — sonst bleibt jeder Versandschritt manuell.
6. **Verjährungsdaten**: Gelten 31.12.2026 und die Vorfrist 15.09.2026 für PRE9
   und PRE10 gleichermaßen? Im Code stehen sie als feste Werte für beide.
7. **Kostenaufklärung** — eigenes Dokument oder die Honorarvereinbarung?

---

## 6. Vorgeschlagene Reihenfolge

**Phase 1 — Fundament, ohne Versand.**
Interessenten-Datensatz, erweitertes Statusmodell, Wiedervorlagen-Mechanik,
Kampagnenliste über alle PRE-Vorgänge mit Ampel. Funktioniert auch ohne SMTP:
Statt einer Mail entsteht eine Aufgabe in einer Liste, die das Sekretariat
abarbeitet. Damit ist der Ablauf sofort nutzbar und nichts fällt hinten runter.

**Phase 2 — Versand.**
Sobald SMTP steht: WF-001 und WF-002 automatisieren, Serienmails mit
freigegebenen Textbausteinen, Eskalation über den Scheduler.

**Phase 3 — WF-006 bis WF-010.**
Deckungsanfrage, RSV-Erinnerung, Aufforderungsschreiben, Gebührenmanagement,
Klagevorbereitung.

Phase 1 zuerst, weil bei über 100 Vorgängen die Übersicht den Unterschied macht
— nicht die Automatisierung einzelner Schritte.

---

## 7. Umsetzungsstand Phase 1

Gebaut:

- `migration-2026-08-06.sql` — Tabellen `interessenten` (Vorgang vor der Akte)
  und `interessent_events` (Protokoll). **Muss noch eingespielt werden.**
- `backend/src/lib/interessent/workflow.ts` — Zustände, erlaubte Aktionen,
  Rollen, 10-Tage-Wiedervorlage, Eskalationsstufen 1–3, Klartext-Aufgabe je
  Zustand. Ohne Datenbank und ohne Uhr prüfbar.
- `backend/src/routes/interessenten.ts` — Arbeitsliste mit Filtern und
  Fälligkeit, Anlegen, Stammdaten ändern, Ablaufaktionen, Verknüpfung mit einer
  Akte.
- `frontend/.../mandate/interessenten/page.tsx` — Arbeitsliste mit Ampel,
  Bestandszählung je Status und Zeilenaktionen. Erreichbar über „PRE-Kampagne"
  in der Mandatsübersicht.

Bewusste Abweichungen vom Lastenheft:

1. **„Warten auf Rücklauf" ist kein eigener Status.** Es ist derselbe Zustand
   wie „Unterlagen versendet" mit laufender Wiedervorlage. Ein Status, der nie
   für sich allein steht, macht die Liste nur unschärfer.
2. **Nichts eskaliert von selbst.** Ein Vorgang wird fällig und erscheint in der
   Liste; weiter geht es erst, wenn jemand die Handlung bestätigt. Solange das
   System nicht selbst versendet, wäre ein automatischer Statuswechsel ein
   Protokolleintrag über etwas, das nicht stattgefunden hat.
3. **Der Hinweis an den Finanzvertrieb wird angezeigt, nicht versandt.** Nach
   der dritten Nachfassung erscheint er als Aufgabe samt Name des Vermittlers.
   Empfänger, Kanal und Datenumfang sind im Lastenheft offen.
4. **Die Aktenanlage bleibt beim bestehenden Formular.** Der Vorgang wird mit
   der Akte verknüpft, statt die Anlage zu duplizieren — Aktenzeichenprüfung,
   Pflichtfristen und Dokumentenpaket hängen dort und würden sonst über kurz
   oder lang auseinanderlaufen. Die automatische Datenübernahme aus dem Vorgang
   in das Anlageformular ist der nächste Schritt.
