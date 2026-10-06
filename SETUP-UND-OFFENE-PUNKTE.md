# BKL Legal OS — Setup & Offene Punkte

> **Keine Rechtsberatung.** Dieses Dokument beschreibt technische Architektur und benennt rechtliche Prüfpunkte. Es ersetzt keine Rechts- oder Datenschutzberatung.

Stand: 2026-05-31

---

## 1. Architekturübersicht

```
Browser (Next.js 16)
    │ HTTPS
    ▼
Backend (Express 4 / Node.js)                       ← Einziger LLM-Egress
    │ LOGICC_API_KEY (env)
    ▼
api.logicc.io/v1  ← EINZIGER erlaubter KI-Endpunkt
    (OpenAI-kompatibel: chat/completions + embeddings)

Backend ──► Supabase PostgreSQL (EU-Region)
         ──► S3/R2 Objektspeicher (EU-Bucket)
         ──► EU-SMTP

Klotzkette vendor/  ──► Injiziert als System-Prompt-Bausteine (read-only)
```

### Komponenten

| Komponente | Basis | Funktion |
|---|---|---|
| Backend | Express 4 / Node.js | API, LLM-Orchestrierung, Mandats-Workflow |
| Frontend | Next.js 16 | UI (mike-basiert, erweitert) |
| DB | Supabase PostgreSQL | Mandate, Nutzer, Audit-Log, RLS |
| Speicher | Cloudflare R2 / S3 EU | Dokumente, Vorlagen, PDFs |
| LLM | LOGICC (api.logicc.io) | Chat, Completion, Embeddings |
| Klotzkette | vendor/klotzkette/ | Zitierweise, Methodik, Skills |
| Mail | EU-SMTP (nodemailer) | Mandanten-Kommunikation |

---

## 2. Umgebungsvariablen

Vollständige Liste: `mike/backend/.env.example`

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `LOGICC_API_KEY` | **JA** | Einziger LLM-Credential; nie im Repo |
| `LOGICC_EMBEDDING_MODEL` | nein | Default: `gemini-embedding-001` |
| `SUPABASE_URL` | **JA** | Supabase-Projektadresse (EU-Region) |
| `SUPABASE_SECRET_KEY` | **JA** | Service-Role-Key; nie im Repo |
| `R2_ENDPOINT_URL` | **JA** | EU-Bucket-Endpunkt |
| `R2_ACCESS_KEY_ID` | **JA** | R2/S3-Credentials |
| `R2_SECRET_ACCESS_KEY` | **JA** | R2/S3-Secret |
| `SMTP_HOST` | **JA** | EU-SMTP-Server |
| `SMTP_USER / SMTP_PASS` | **JA** | SMTP-Zugangsdaten |
| `DOWNLOAD_SIGNING_SECRET` | **JA** | HMAC für Download-URLs |
| `USER_API_KEYS_ENCRYPTION_SECRET` | **JA** | AES-256 für gespeicherte Keys |
| `ONBOARDING_REVIEW_GATE` | nein | Default: `true` (Anwalt-Freigabe vor Versand) |
| `SCHEDULER_INTERVAL_MS` | nein | Fristen-Prüfintervall, Default: 300000 (5 min) |

**Gesperrte Variablen** (dürfen nicht gesetzt werden):
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `CLAUDE_API_KEY`, `RESEND_API_KEY`

---

## 3. Datenflüsse

### 3.1 Chat / Juristische Anfrage
```
Nutzer → Frontend → POST /chat → Backend
    → buildLegalSystemPrompt() [Zitierweise + Methodik injiziert]
    → streamLogicc() → api.logicc.io/v1/chat/completions
    ← SSE-Stream ← Backend ← Frontend ← Nutzer
    → Audit-Log (model, prompt-summary, timestamp) → Supabase
```

### 3.2 Mandats-Workflow (vereinfacht)
```
Aufnahmebogen → AUFNAHME_ERFASST
→ Template-Fill + LLM-Sachverhalt → PDFs → ONBOARDING_ERZEUGT
→ (Review-Gate) → EU-SMTP → ONBOARDING_VERSANDT
→ ReFa bestätigt Rücklauf → RUECKLAUF_BESTAETIGT
→ Anwalt triggert LLM-Entwurf → ANSPRUCH_ENTWURF
→ Anwalt-Freigabe → ANSPRUCH_FREIGEGEBEN
→ Versand + deterministische Fristberechnung → ANSPRUCH_VERSANDT → FRIST_LAEUFT
→ Scheduler: Frist abgelaufen → FRIST_ABGELAUFEN → KLAGE_ENTWURF
→ Anwalt prüft → KLAGE_GEPRUEFT
→ Anwalt reicht über beA ein → KLAGE_EINGEREICHT
```

### 3.3 LLM-Einsatz im Workflow (deklarativ)
| Schritt | LLM? | Zweck |
|---|---|---|
| Fristberechnung | **NEIN** | deterministisch (`tools/fristen.ts`) |
| § 17/§ 19 InsO | **NEIN** | deterministisch (`tools/insolvenz.ts`) |
| RVG-Gebühren | **NEIN** | deterministisch (`tools/rvg.ts`) |
| Sachverhalt-Passage Anschreiben | **JA** | LLM erarbeitet nur den variablen Textabsatz |
| Anspruchsschreiben-Entwurf | **JA** | LLM + Zitierweise + Methodik injiziert |
| Klage-Entwurf | **JA** | LLM + Zitierweise + Methodik injiziert |
| Honorarvereinbarung Text | **NEIN** | nur Template-Fill (§ 3a RVG) |
| Vollmacht Text | **NEIN** | nur Template-Fill (§ 80 ZPO) |

---

## 4. EU-Hosting

### Datenresidenz im Ruhezustand ✓ (konfigurierbar)
- Supabase: EU-Region (`eu-central-1`) oder self-hosted auf EU-VPS wählen
- Objektspeicher: Cloudflare R2 EU-Bucket oder S3 `eu-central-1`
- SMTP: EU-Provider konfigurieren (Hetzner Mail, mailcow, Postfix auf EU-VPS)

### Inferenz-Ort ⚠️ (offen)
LOGICC routet Anfragen an Drittanbieter (OpenAI, Anthropic, Google). Wo die
Inferenz physisch stattfindet, ist vertraglich mit LOGICC zu klären (→ Punkt 5.1).

### Docker Compose (EU): `docker-compose.eu.yml`
```bash
# Deployment
cp mike/backend/.env.example .env.eu
# Werte eintragen
docker compose --env-file .env.eu -f docker-compose.eu.yml up -d
```

---

## 5. Selbst zu prüfen — nicht durch dieses Setup gelöst

### 5.1 LOGICC — Vertragsrechtliche und datenschutzrechtliche Prüfung

**Routet LOGICC an US-Anbieter weiter?**
LOGICC bietet OpenAI- und Google-Modelle an (`gpt-4o`, `gemini-2.5-pro`). Es ist
zu klären, ob Anfragen direkt an OpenAI/Google-Server in den USA weitergeleitet
werden und welche vertraglichen Garantien LOGICC gibt.

**Kapitel V DSGVO / Drittstaaten-Transfer:**
- Werden Mandantendaten in den USA oder außerhalb der EU verarbeitet?
- Standardvertragsklauseln (SCC) mit LOGICC prüfen (Art. 46 Abs. 2 lit. c DSGVO)
- Transfer Impact Assessment (TIA) nach Schrems II erforderlich
- EU-U.S. Data Privacy Framework (DPF): Prüfen ob LOGICC und zugrundeliegende
  Anbieter zertifiziert sind

**Art. 28 DSGVO — Auftragsverarbeitungsvertrag (AVV):**
- AVV mit LOGICC abschließen; Unterauftragsverarbeiter-Kette prüfen
- Laufzeit der Datenspeicherung bei LOGICC klären (Training-Opt-Out?)

### 5.2 § 43e BRAO — Dienstleistungsvertrag mit LOGICC

Nach § 43e Abs. 2–5 BRAO gelten bei Beauftragung externer Dienstleister:
- Vertrag in **Textform** (§ 43e Abs. 2 BRAO)
- Dienstleister zur **Verschwiegenheit** verpflichten (auch dessen Beschäftigte)
- **Sorgfältige Auswahl** des Dienstleisters dokumentieren
- Bei **Auslandsbezug**: vergleichbarer Geheimnisschutz wie in Deutschland
  sicherstellen (§ 43e Abs. 5 BRAO) — bei US-Routing besonders kritisch

### 5.3 §§ 203/204 StGB — Mandatsgeheimnis

- § 203 Abs. 1 Nr. 3 StGB: Weitergabe von Mandatsdaten an unbefugte Dritte strafbar
- Darf LOGICC die Daten für Training verwenden? → Vertraglich ausschließen
- § 204 StGB: Verwertung fremder Geheimnisse
- §§ 53/97 StPO: Zeugnisverweigerungsrecht und Beschlagnahmeschutz bei beA/
  Kanzlei-IT — ob Cloud-Verarbeitung den Beschlagnahmeschutz berührt, ist
  rechtlich noch nicht abschließend geklärt

### 5.4 Art. 35 DSGVO — Datenschutz-Folgenabschätzung (DSFA)

Mandatsdaten sind in der Regel **besonders sensibel**. Eine DSFA ist
wahrscheinlich erforderlich wegen:
- Verarbeitung von Berufsgeheimnisdaten durch KI
- Möglicher Kategorien nach Art. 9 DSGVO je nach Mandat (Gesundheit, Strafrecht)
- Einsatz von profilbildenden KI-Systemen
- Cross-Border-Transfer

### 5.5 Art. 13 DSGVO — Aufnahmebogen

- Datenschutzhinweis am Aufnahmeformular ist implementiert (v1.0)
- **Inhalt muss anwaltlich geprüft werden:** Rechtsgrundlage, Zweck, Empfänger,
  Speicherdauer, Betroffenenrechte müssen vollständig sein
- Bei besondere Kategorien (Art. 9 DSGVO, z.B. Gesundheitsdaten in Sozialrecht,
  Strafrecht): explizite Einwilligung oder Art. 9 Abs. 2 lit. f prüfen
- DSFA nach Art. 35 DSGVO prüfen

### 5.6 KI-Verordnung (EU AI Act)

**Betreiberpflichten Art. 26:**
- Kanzlei = Betreiber eines KI-Systems (Hochrisiko?)
- Transparenzpflicht gegenüber Mandanten (Art. 50 KI-VO)
- Grundrechtefolgenabschätzung (Art. 27 KI-VO) prüfen

**Hochrisiko-Einstufung (Anhang III Nr. 8):**
> Anhang III Nr. 8: „Verwaltung der Justiz und demokratische Prozesse" —
> KI-Systeme zur Unterstützung bei Gerichtsentscheidungen können als
> Hochrisiko eingestuft werden.
- Prüfen ob das System in den Anwendungsbereich fällt
- Bei Hochrisiko: Konformitätsbewertung, CE-Kennzeichnung, Registrierung (EUVDB)

**Allgemeine Transparenzpflicht (Art. 50 KI-VO):**
- Nutzer müssen wissen, dass sie mit einem KI-System interagieren
- Im UI implementiert (DISCLAIMER_DE); konkreten Anforderungen des finalen
  KI-VO-Textes abgleichen

### 5.7 § 3a RVG — Honorarvereinbarung

Die Honorarvereinbarungsvorlage muss durch den zuständigen Anwalt geprüft werden:
- § 3a Abs. 1 Satz 1 RVG: eigenständiges Dokument, in Textform, deutlich als
  „Vergütungsvereinbarung" bezeichnet
- § 3a Abs. 1 Satz 2–4 RVG: Hinweispflichten (Abweichung vom RVG, Erstattung
  durch Gegner/Rechtsschutz nur bis RVG-Grenze)
- § 3a Abs. 3 RVG: Angemessenheitskontrolle
- Systemanforderung: Vorlage darf nicht durch LLM-Ausgabe verändert werden ✓

### 5.8 § 80 ZPO — Prozessvollmacht

- Vollmachtsvorlage muss durch den zuständigen Anwalt geprüft werden
- § 80 Satz 1 ZPO: Schriftliche Vollmacht
- Umfang der Vollmacht (§ 81 ZPO: gesetzliche Vollmacht vs. beschränkte Vollmacht)
- Systemanforderung: Vorlage darf nicht durch LLM verändert werden ✓

### 5.9 § 130d ZPO — beA-Einreichungspflicht

- Klageschriften sind durch Anwälte ausschließlich über das besondere elektronische
  Anwaltspostfach (beA) bei Gericht einzureichen (§ 130d ZPO)
- Die Plattform reicht **nicht selbst ein** — Anwalt reicht über beA ein und
  markiert danach `KLAGE_EINGEREICHT` ✓
- beA-fähige Dateiformate: PDF/A-Dateien für Schriftsatz und Anlagen bereitstellen

### 5.10 Fristenkontrolle

- Der Fristen-Scheduler ist ein **technisches Hilfsmittel**, kein Ersatz für
  die anwaltliche Fristenkontrolle
- Nach BRAO § 43 und Berufspflichten ist der Anwalt eigenverantwortlich für
  Fristen; Delegation an Software entbindet nicht von Haftung
- Empfehlung: Doppelkontrolle (Software + manuelle Fristnotiz im Fristenkalender)

### 5.11 Lizenz-Compliance

| Komponente | Lizenz | Pflichten |
|---|---|---|
| mike (willchen96) | AGPL-3.0-only | Internes Arbeiten: Quelloffenlegung nicht erforderlich. Bei Bereitstellung über Netz an Externe (SaaS): Quellcode offenlegen. |
| Klotzkette (vendor/) | Apache-2.0 / MIT | Namensnennung; kein Copyleft-Zwang |
| Next.js | MIT | — |
| Express | MIT | — |
| nodemailer | MIT | — |

**AGPL-3.0 Hinweis:** Diese Erweiterungen (BKL Legal OS) unterliegen ebenfalls AGPL-3.0.
Interne Nutzung ist frei. Bei Bereitstellung des Systems für externe Mandanten über
das Internet (Netzwerk-Nutzung): Quellcode-Offenlegungspflicht beachten.

### 5.12 Halluzinationsrisiko

- Jede LLM-Ausgabe (Zitate, Aktenzeichen, Normen, Sachverhaltsdarstellungen)
  ist **manuell zu verifizieren**
- Das System injiziert die Klotzkette-Zitierweise (keine Blindzitate) zur
  Risikominimierung — eliminiert das Halluzinationsrisiko nicht vollständig
- Empfehlung: Vier-Augen-Prinzip für alle versandten Schriftsätze

---

## 6. Sicherheitsmaßnahmen (implementiert)

| Maßnahme | Status |
|---|---|
| Einziger LLM-Egress: api.logicc.io | ✓ `egress-guard.ts` + startup-check |
| LOGICC_API_KEY nur via Env | ✓ Kein Hardcoding, `.gitignore` |
| Mandatsdaten-Isolation (RLS) | ✓ Schema + Service-Role-Only-Policies |
| Audit-Log (wer/wann/Modell/Dokument) | ✓ `audit_log` Tabelle |
| Rollenbasierte Transition-Gates | ✓ `state-machine.ts` |
| Zitierweise/Methodik injiziert | ✓ `system-prompt.ts` |
| Deterministische Rechtslogik | ✓ `tools/fristen.ts`, `insolvenz.ts`, `rvg.ts` |
| Helm et Security-Headers | ✓ `helmet()` in index.ts |
| Rate Limiting | ✓ `express-rate-limit` |
| AES-256-GCM Key-Verschlüsselung | ✓ `userApiKeys.ts` |
| Review-Gate vor Versand (Default: an) | ✓ `ONBOARDING_REVIEW_GATE` |
| Kein automatischer Klage-Versand | ✓ manuell durch Anwalt |
| KI-Hinweis im UI | ✓ `DISCLAIMER_DE` |
| EU Docker-Compose | ✓ `docker-compose.eu.yml` |

---

## 7. Nächste Schritte (Setup-Reihenfolge)

1. **Node.js 22 LTS installieren** (nicht im System vorhanden)
2. **Supabase-Projekt anlegen** (EU-Region: `eu-central-1`)
3. **Schema anwenden**: `schema.sql` → `schema-bkl.sql`
4. **R2/S3 EU-Bucket anlegen** (Cloudflare R2 EU oder S3 eu-central-1)
5. **LOGICC-Account**: API-Key besorgen, `LOGICC_API_KEY` setzen
6. **`.env` aus `.env.example`** befüllen
7. **`npm install`** im `mike/backend/` (entfernt alte Provider-SDKs automatisch)
8. **Smoke-Tests ausführen**: `npx tsx src/tests/smoke.test.ts`
9. **Vorlagen hochladen**: 3 DOCX-Vorlagen im Admin-UI hinterlegen
10. **EU-SMTP konfigurieren** (Hetzner / mailcow)
11. **Erbrecht-Modul befüllen**: `vendor/klotzkette/erbrecht` (Gerüst vorhanden)
12. **Rechts- und Datenschutzprüfung** der offenen Punkte aus Abschnitt 5

---

## 8. Testabdeckung (Phase 5)

| Test | Art | Datei |
|---|---|---|
| Egress Guard blockiert OpenAI/Anthropic | Unit | `smoke.test.ts` |
| Egress Guard erlaubt LOGICC | Unit | `smoke.test.ts` |
| Fristen § 622 BGB, KSchG, Reaktion | Unit | `smoke.test.ts` |
| RVG Gebührenberechnung | Unit | `smoke.test.ts` |
| § 17/§ 19 InsO Prüfung | Unit | `smoke.test.ts` |
| State Machine Transitions (alle Rollen) | Unit | `smoke.test.ts` |
| State Machine Negativtest | Unit | `smoke.test.ts` |
| LOGICC Chat Connectivity | Integration | `smoke.test.ts` (skip ohne Key) |
| LOGICC Embedding Connectivity | Integration | `smoke.test.ts` (skip ohne Key) |

E2E-Tests (Aufnahmebogen → Klageeinreichung) setzen laufende Supabase-Instanz
voraus und werden in `src/tests/e2e.test.ts` ergänzt (noch nicht implementiert).
