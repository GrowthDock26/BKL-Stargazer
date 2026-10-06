-- BKL Legal OS — extended schema
-- Run AFTER mike's schema.sql on a fresh Supabase database.
-- Applies the BKL-specific extensions: organizations, matters, mandats-workflow,
-- RLS, audit log, fristen, templates, and mail log.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 0. Cleanup: remove multi-provider API key constraint, add logicc-only check
-- ---------------------------------------------------------------------------

-- Drop the old provider check; replace with logicc-only
alter table public.user_api_keys
    drop constraint if exists user_api_keys_provider_check;

alter table public.user_api_keys
    add constraint user_api_keys_provider_check
    check (provider in ('logicc'));

-- ---------------------------------------------------------------------------
-- 1. Organizations & Teams
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    slug        text not null unique,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table if not exists public.org_members (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    role            text not null check (role in ('Admin', 'Anwalt', 'Referendar', 'ReFa')),
    eingeladen_von  uuid references auth.users(id),
    created_at      timestamptz not null default now(),
    unique(org_id, user_id)
);

create index if not exists idx_org_members_org on public.org_members(org_id);
create index if not exists idx_org_members_user on public.org_members(user_id);

-- ---------------------------------------------------------------------------
-- 2. Matters (Mandate)
-- ---------------------------------------------------------------------------

create table if not exists public.matters (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    aktenzeichen    text,                           -- Kanzleiinternes Aktenzeichen
    bezeichnung     text not null,                  -- Kurzbeschreibung
    -- Mandatskategorie, gewählt bei Aktenanlage. Bestimmt u.a. ob der
    -- Standard-Onboarding-Ablauf (Honorarvereinbarung + Begleitmail-Entwurf)
    -- automatisch ausgelöst wird oder — bei 'pro_real' — der gesonderte
    -- Pro-Real-Workflow (Kapitalmarktrecht) greift.
    kategorie       text not null default 'sonstiges'
                    check (kategorie in (
                        'erbrecht', 'gesellschaftsrecht', 'kapitalmarktrecht',
                        'pro_real', 'steuerrecht', 'sonstiges'
                    )),
    -- Freitext-Anfrage/Kontext, optional bei Aktenanlage erfasst.
    anfrage         text,
    -- Schlanker Namensplatzhalter für die sofort bei Aktenanlage erzeugte
    -- Honorarvereinbarung/Begleitmail, bevor der vollständige Aufnahmebogen
    -- (Adresse, Geburtsdatum usw.) ausgefüllt ist.
    mandant_name    text,
    -- KI-Entwurf der Begleitmail zur Honorarvereinbarung (nur Entwurf, kein
    -- automatischer Versand — Versand bleibt Teil des bestehenden
    -- Onboarding-Freigabe-/Versand-Ablaufs).
    begleitmail_betreff    text,
    begleitmail_text       text,
    -- Mandant handelt als Unternehmer (§ 14 BGB) statt als Verbraucher
    -- (§ 13 BGB). Dann besteht kein Widerrufsrecht aus §§ 312 ff., 355 BGB und
    -- das Onboarding-Paket wird ohne Widerrufsbelehrung erzeugt.
    unternehmensmandat     boolean not null default false,
    state           text not null default 'NEU'
                    check (state in (
                        'NEU', 'AUFNAHME_ERFASST', 'ONBOARDING_ERZEUGT',
                        'ONBOARDING_VERSANDT', 'RUECKLAUF_BESTAETIGT',
                        'ANSPRUCH_ENTWURF', 'ANSPRUCH_FREIGEGEBEN', 'ANSPRUCH_VERSANDT',
                        'FRIST_LAEUFT', 'FRIST_ABGELAUFEN',
                        'KLAGE_ENTWURF', 'KLAGE_GEPRUEFT', 'KLAGE_EINGEREICHT'
                    )),
    zustaendiger_anwalt_id  uuid references auth.users(id),
    -- Sachbearbeiter/Ansprechpartner für Briefkopf/Mandatsvereinbarung
    -- (Freitext statt Verweis auf zustaendiger_anwalt_id — Sachbearbeiter ist
    -- häufig eine ReFa/Assistenz ohne eigenen Systemzugang).
    sachbearbeiter  text,
    notizen         text,
    created_by      uuid references auth.users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_matters_org on public.matters(org_id);
create index if not exists idx_matters_state on public.matters(state);

-- ---------------------------------------------------------------------------
-- 3. Matter transitions (state change audit trail)
-- ---------------------------------------------------------------------------

create table if not exists public.matter_transitions (
    id              uuid primary key default gen_random_uuid(),
    matter_id       uuid not null references public.matters(id) on delete cascade,
    from_state      text not null,
    to_state        text not null,
    triggered_by    text,                           -- user_id or 'scheduler'
    role            text,                           -- OrgRole or 'scheduler'
    description     text,
    created_at      timestamptz not null default now()
);

create index if not exists idx_matter_transitions_matter
    on public.matter_transitions(matter_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Mandanten (intake contact data, linked to matter)
-- ---------------------------------------------------------------------------

create table if not exists public.mandanten (
    id              uuid primary key default gen_random_uuid(),
    matter_id       uuid not null references public.matters(id) on delete cascade,
    org_id          uuid not null references public.organizations(id),
    -- Personaldaten (Art. 6 Abs. 1 lit. b DSGVO; Art. 13 DSGVO-Hinweis am Formular)
    anrede          text,
    vorname         text not null,
    nachname        text not null,
    geburtsdatum    date,
    sterbedatum     date,                       -- Erbrecht: Todestag des Erblassers
    beruf           text,
    -- Kontakt
    email           text,
    telefon         text,
    strasse         text,
    hausnummer      text,
    plz             text,
    ort             text,
    land_code       text default 'DE',
    -- Intake — Sachverhalt (strukturiert, damit die Honorarvereinbarung/
    -- das Anschreiben fallspezifisch statt generisch erzeugt werden)
    beratungskurzbeschreibung   text,               -- Worum geht es?
    sachverhalt_seit            date,               -- Seit wann / wann eingetreten?
    gegner                      text,               -- Gegenpartei, falls vorhanden
    bisherige_schritte          text,               -- bereits erfolgte Schritte (Schreiben, Fristen, Kontakt)
    mandatsziel                 text,               -- was soll erreicht werden?
    rechtsschutzversicherung           boolean default false,
    rechtsschutzversicherung_name      text,           -- Name des Versicherers
    rechtsschutzversicherung_nummer    text,           -- Versicherungsschein-/Vertragsnummer
    prospekt_uebergabe          boolean default false,
    prospekt_uebergabe_datum    date,
    datenschutz_hinweis_angezeigt   boolean default false,
    datenschutz_hinweis_version     text default '1.0',
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Jedes Mandat hat genau einen Mandanten — required für upsert ON CONFLICT
alter table public.mandanten
    drop constraint if exists mandanten_matter_id_unique;
alter table public.mandanten
    add constraint mandanten_matter_id_unique unique (matter_id);

create index if not exists idx_mandanten_matter on public.mandanten(matter_id);
create index if not exists idx_mandanten_org on public.mandanten(org_id);

-- ---------------------------------------------------------------------------
-- 5. Matter documents (scoped to matter, stored in EU S3/R2)
-- ---------------------------------------------------------------------------

create table if not exists public.matter_documents (
    id              uuid primary key default gen_random_uuid(),
    matter_id       uuid not null references public.matters(id) on delete cascade,
    org_id          uuid not null references public.organizations(id),
    filename        text not null,
    storage_path    text not null,                  -- R2/S3 path (PDF)
    docx_storage_path text,                         -- R2/S3 path der befüllten,
                                                      -- weiterhin bearbeitbaren DOCX-
                                                      -- Fassung (nur bei generierten
                                                      -- Onboarding-Dokumenten gesetzt)
    file_hash_sha256 text,                          -- Integrity / audit
    file_size_bytes integer,
    mime_type       text,
    doc_type        text not null check (doc_type in (
                        'ANFRAGE_UPLOAD', 'INTAKE_UPLOAD',
                        'ONBOARDING_ANSCHREIBEN', 'ONBOARDING_HONORARVEREINBARUNG',
                        'ONBOARDING_VOLLMACHT', 'ONBOARDING_WIDERRUFSBELEHRUNG',
                        'RUECKLAUF_VOLLMACHT', 'RUECKLAUF_HONORARVEREINBARUNG',
                        'ANSPRUCH_SCHREIBEN',
                        'KLAGE_SCHRIFT', 'KLAGE_ANLAGE',
                        'SONSTIGES'
                    )),
    version_number  integer not null default 1,
    uploaded_by     uuid references auth.users(id),
    created_at      timestamptz not null default now()
);

create index if not exists idx_matter_documents_matter on public.matter_documents(matter_id);
create index if not exists idx_matter_documents_org on public.matter_documents(org_id);

-- ---------------------------------------------------------------------------
-- 6. Anwaltliche Vorlagen (DOCX templates — admin-managed)
-- ---------------------------------------------------------------------------

create table if not exists public.matter_templates (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    template_type   text not null check (template_type in (
                        'ONBOARDING_ANSCHREIBEN',
                        'ONBOARDING_HONORARVEREINBARUNG',
                        'ONBOARDING_VOLLMACHT',
                        'ONBOARDING_WIDERRUFSBELEHRUNG',
                        'ANSPRUCH_SCHREIBEN',
                        'KLAGE_SCHRIFT'
                    )),
    name            text not null,
    storage_path    text not null,                  -- DOCX in R2/S3
    is_active       boolean not null default true,
    version_number  integer not null default 1,
    created_by      uuid references auth.users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_matter_templates_org on public.matter_templates(org_id, template_type);

-- ---------------------------------------------------------------------------
-- 7. Fristen (deadline tracking per matter)
-- ---------------------------------------------------------------------------

create table if not exists public.fristen (
    id              uuid primary key default gen_random_uuid(),
    matter_id       uuid not null references public.matters(id) on delete cascade,
    org_id          uuid not null references public.organizations(id),
    typ             text not null,
    startdatum      date not null,
    fristende       date not null,
    reminderdatum   date,
    werktage        integer,
    land_code       text default 'NW',
    notiz           text,
    erledigt        boolean not null default false,
    -- Idempotenz der Benachrichtigungen: der Scheduler läuft alle 5 Minuten und
    -- darf jeden Hinweis nur einmal versenden. Wird beim Ändern von fristende
    -- oder reminderdatum zurückgesetzt (routes/matters.ts), damit eine
    -- verlängerte Frist erneut erinnert wird.
    reminder_gesendet_at     timestamptz,
    ablauf_benachrichtigt_at timestamptz,
    created_by      uuid references auth.users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_fristen_matter on public.fristen(matter_id);
create index if not exists idx_fristen_fristende on public.fristen(fristende) where not erledigt;
create index if not exists idx_fristen_reminder_offen
    on public.fristen(reminderdatum)
    where reminder_gesendet_at is null and not erledigt;
create index if not exists idx_fristen_ablauf_offen
    on public.fristen(fristende)
    where ablauf_benachrichtigt_at is null;

-- ---------------------------------------------------------------------------
-- 8. Mail log (audit of sent e-mails)
-- ---------------------------------------------------------------------------

create table if not exists public.mail_log (
    id              uuid primary key default gen_random_uuid(),
    matter_id       uuid references public.matters(id) on delete cascade,
    org_id          uuid not null references public.organizations(id),
    empfaenger      text not null,
    betreff         text,
    doc_hashes      jsonb,                          -- [{filename, sha256}]
    smtp_message_id text,
    sent_by         uuid references auth.users(id),
    sent_at         timestamptz not null default now()
);

create index if not exists idx_mail_log_matter on public.mail_log(matter_id);

-- ---------------------------------------------------------------------------
-- 9. Audit log (comprehensive: who/when/model/prompt/answer)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid references public.organizations(id),
    entity_type     text,                           -- 'matter', 'document', 'chat', etc.
    entity_id       uuid,
    action          text not null,                  -- e.g. 'state_transition', 'llm_call'
    actor_id        text,                           -- user_id or 'scheduler'
    actor_role      text,
    model_id        text,                           -- LLM model used, if any
    prompt_summary  text,                           -- truncated / hashed for sensitive data
    response_summary text,
    details         jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id);
create index if not exists idx_audit_log_org on public.audit_log(org_id, created_at desc);
create index if not exists idx_audit_log_actor on public.audit_log(actor_id);

-- ---------------------------------------------------------------------------
-- 10. Onboarding packages (generated PDF sets)
-- ---------------------------------------------------------------------------

create table if not exists public.onboarding_packages (
    id              uuid primary key default gen_random_uuid(),
    matter_id       uuid not null references public.matters(id) on delete cascade,
    anschreiben_doc_id          uuid references public.matter_documents(id),
    honorarvereinbarung_doc_id  uuid references public.matter_documents(id),
    vollmacht_doc_id            uuid references public.matter_documents(id),
    widerrufsbelehrung_doc_id   uuid references public.matter_documents(id),
    review_gate_passed          boolean default false,
    reviewed_by                 uuid references auth.users(id),
    reviewed_at                 timestamptz,
    created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 11. Anspruchsschreiben-Entwürfe (KI-generiert, anwaltlich freizugeben)
-- ---------------------------------------------------------------------------

create table if not exists public.anspruch_drafts (
    id              uuid primary key default gen_random_uuid(),
    matter_id       uuid not null references public.matters(id) on delete cascade,
    org_id          uuid not null references public.organizations(id),
    entwurf_text    text not null,
    model_id        text,
    approved_by     uuid references auth.users(id),
    approved_at     timestamptz,
    created_by      uuid references auth.users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_anspruch_drafts_matter on public.anspruch_drafts(matter_id);

revoke all on public.anspruch_drafts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Wissensdatenbank (Urteile, Aufsätze, Kommentare)
-- ---------------------------------------------------------------------------

create table if not exists public.wissensdatenbank (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null references public.organizations(id) on delete cascade,
    titel           text not null,
    rechtsgebiet    text not null check (rechtsgebiet in (
                        'erbrecht', 'kapitalmarktrecht', 'arbeitsrecht',
                        'gesellschaftsrecht', 'allgemein',
                        'kapitalmarkt', 'litigation'
                    )),
    dokumenttyp     text not null check (dokumenttyp in (
                        'urteil', 'aufsatz', 'kommentar', 'gesetze', 'sonstiges',
                        'muster', 'hinweis', 'handbuch'
                    )),
    gericht         text,          -- z.B. "BGH", "BAG", "OLG München"
    aktenzeichen    text,          -- z.B. "II ZR 229/09"
    entscheidungsdatum date,
    storage_path    text not null,
    extracted_text  text,          -- KI-extrahierter Volltext
    ki_zusammenfassung text,       -- KI-generierte Kurzzusammenfassung
    ki_kernaussagen text,          -- KI-generierte Kernaussagen (JSON-Array als Text)
    schlagwoerter   text[],        -- Tags für Suche
    file_size_bytes integer,
    mime_type       text,
    uploaded_by     uuid references auth.users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_wissensdb_org on public.wissensdatenbank(org_id);
create index if not exists idx_wissensdb_rechtsgebiet on public.wissensdatenbank(org_id, rechtsgebiet);
create index if not exists idx_wissensdb_typ on public.wissensdatenbank(dokumenttyp);

revoke all on public.wissensdatenbank from anon, authenticated;
alter table public.wissensdatenbank enable row level security;
drop policy if exists "service_role_only" on public.wissensdatenbank;
create policy "service_role_only" on public.wissensdatenbank
    using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 13. Revoke direct client access (service-role only)
-- ---------------------------------------------------------------------------

revoke all on public.organizations from anon, authenticated;
revoke all on public.org_members from anon, authenticated;
revoke all on public.matters from anon, authenticated;
revoke all on public.matter_transitions from anon, authenticated;
revoke all on public.mandanten from anon, authenticated;
revoke all on public.matter_documents from anon, authenticated;
revoke all on public.matter_templates from anon, authenticated;
revoke all on public.fristen from anon, authenticated;
revoke all on public.mail_log from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
revoke all on public.onboarding_packages from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Helper: RLS for org_members (read-only for authenticated, via service key only)
-- Row-level security is advisory here — all application access goes through
-- the backend service role. RLS is a defense-in-depth layer.
-- ---------------------------------------------------------------------------

alter table public.org_members enable row level security;
alter table public.matters enable row level security;

-- Backend service role bypasses RLS; these policies restrict any direct client access.
drop policy if exists "service_role_only" on public.org_members;
create policy "service_role_only" on public.org_members
    using (auth.role() = 'service_role');

drop policy if exists "service_role_only" on public.matters;
create policy "service_role_only" on public.matters
    using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 14. Migration: GwG-Ablauf (Minimal-Anlage, GwG-Anschreiben, Personalausweis-
--     Upload, Risikoeinstufung). Fügt drei neue Zwischenzustände zwischen
--     NEU und AUFNAHME_ERFASST ein: GWG_ANSCHREIBEN_ERZEUGT,
--     GWG_ANSCHREIBEN_VERSANDT, GWG_GEPRUEFT. Gilt für die Kategorien
--     kapitalmarktrecht, pro_real, gesellschaftsrecht (siehe state-machine.ts
--     und matters.ts) — andere Kategorien nutzen weiterhin NEU → AUFNAHME_ERFASST.
-- ---------------------------------------------------------------------------

alter table public.matters
    add column if not exists mandant_email text,
    add column if not exists gwg_mail_betreff text,
    add column if not exists gwg_mail_text text,
    -- Abwahl der Identifizierungsstrecke durch einen Anwalt (Compliance-
    -- Entscheidung, deshalb mit Person, Zeitpunkt und Grund protokolliert).
    add column if not exists gwg_uebersprungen_at    timestamptz,
    add column if not exists gwg_uebersprungen_von   uuid references auth.users(id),
    add column if not exists gwg_uebersprungen_grund text;

create index if not exists idx_matters_gwg_uebersprungen
    on public.matters(org_id, gwg_uebersprungen_at)
    where gwg_uebersprungen_at is not null;

alter table public.matters
    drop constraint if exists matters_state_check;
alter table public.matters
    add constraint matters_state_check
    check (state in (
        'NEU', 'GWG_ANSCHREIBEN_ERZEUGT', 'GWG_ANSCHREIBEN_VERSANDT', 'GWG_GEPRUEFT',
        'AUFNAHME_ERFASST', 'ONBOARDING_ERZEUGT',
        'ONBOARDING_VERSANDT', 'RUECKLAUF_BESTAETIGT',
        'ANSPRUCH_ENTWURF', 'ANSPRUCH_FREIGEGEBEN', 'ANSPRUCH_VERSANDT',
        'FRIST_LAEUFT', 'FRIST_ABGELAUFEN',
        'KLAGE_ENTWURF', 'KLAGE_GEPRUEFT', 'KLAGE_EINGEREICHT'
    ));

alter table public.matter_documents
    drop constraint if exists matter_documents_doc_type_check;
alter table public.matter_documents
    add constraint matter_documents_doc_type_check
    check (doc_type in (
        'ANFRAGE_UPLOAD', 'INTAKE_UPLOAD',
        'GWG_PERSONALAUSWEIS',
        'ONBOARDING_ANSCHREIBEN', 'ONBOARDING_HONORARVEREINBARUNG',
        'ONBOARDING_VOLLMACHT', 'ONBOARDING_WIDERRUFSBELEHRUNG',
        'RUECKLAUF_VOLLMACHT', 'RUECKLAUF_HONORARVEREINBARUNG',
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT', 'KLAGE_ANLAGE',
        'SONSTIGES'
    ));

-- GwG-Risikoeinstufungen (Audit-Trail je Prüfung, analog anspruch_drafts).
-- § 10 Abs. 2 GwG: die Bewertungshoheit verbleibt bei der Kanzlei —
-- bestaetigt_von/bestaetigt_at dokumentieren die anwaltliche Bestätigung.
create table if not exists public.gwg_pruefungen (
    id                                      uuid primary key default gen_random_uuid(),
    matter_id                               uuid not null references public.matters(id) on delete cascade,
    org_id                                  uuid not null references public.organizations(id),
    kategorie_snapshot                      text,
    land_code                               text,
    pep                                     boolean,
    wirtschaftlich_berechtigter_identisch   boolean,
    transaktionsland                        text,
    risikoklasse                            text not null check (risikoklasse in (
                                                'niedrig', 'mittel', 'hoch', 'unvollstaendig', 'nicht_verpflichtet'
                                             )),
    ausgeloeste_faktoren                    jsonb,
    dokumentationsluecken                   jsonb,
    hinweis                                 text,
    personalausweis_doc_id                  uuid references public.matter_documents(id),
    created_by                              uuid references auth.users(id),
    bestaetigt_von                          uuid references auth.users(id),
    bestaetigt_at                           timestamptz,
    created_at                              timestamptz not null default now()
);

create index if not exists idx_gwg_pruefungen_matter on public.gwg_pruefungen(matter_id, created_at desc);

revoke all on public.gwg_pruefungen from anon, authenticated;
alter table public.gwg_pruefungen enable row level security;
drop policy if exists "service_role_only" on public.gwg_pruefungen;
create policy "service_role_only" on public.gwg_pruefungen
    using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 15. Dubletten-Schutz für RA-Micro-Aktennummern
--
-- Verhindert, dass dieselbe Aktennummer in einer Kanzlei zweimal angelegt wird
-- (Tippfehler oder doppelte Anlage). Partiell, damit mehrere Akten ohne
-- Aktenzeichen erlaubt bleiben. Das Backend übersetzt den Unique-Verstoß
-- (SQLSTATE 23505) in eine verständliche Meldung (routes/matters.ts).
--
-- Bei Bestandsdaten mit Dubletten schlägt das Anlegen fehl — siehe die
-- Prüfabfrage in migration-2026-07-18.sql.
-- ---------------------------------------------------------------------------

create unique index if not exists idx_matters_org_aktenzeichen_unique
    on public.matters(org_id, aktenzeichen)
    where aktenzeichen is not null;

-- ---------------------------------------------------------------------------
-- 16. PRE-Fragebogen (Pro Real Europa 9/10)
--
-- Strukturierte Erfassung des Fragebogen-Rücklaufs, damit der Streitwert nach
-- dem Ablaufplan berechnet werden kann:
--     Streitwert = Zeichnungssumme + Agio − Summe der Auszahlungen
--
-- Beträge als numeric(14,2), nicht float — Gleitkommafehler würden sich über
-- die Gebührenstufen fortpflanzen. Der Streitwert selbst wird nicht
-- gespeichert, sondern bei jedem Abruf berechnet (ein gespeicherter Wert
-- veraltet, sobald jemand eine Auszahlung nachträgt).
--
-- Identischer Inhalt in migration-2026-07-29-b.sql.
-- ---------------------------------------------------------------------------

create table if not exists public.pre_fragebogen (
    id                          uuid primary key default gen_random_uuid(),
    matter_id                   uuid not null unique references public.matters(id) on delete cascade,
    org_id                      uuid not null references public.organizations(id),
    zeichnungserklaerung_beigefuegt boolean,
    vib_beigefuegt                  boolean,
    rsv_kopie_beigefuegt            boolean,
    prospekt_erhalten_am        date,
    prospekt_gelesen            boolean,
    prospekt_durchgegangen      boolean,
    rsv_versicherungsnehmer     text,
    rsv_abgeschlossen_am        date,
    anderweitig_geltend_gemacht boolean,
    andere_anlage_one_group     boolean,
    andere_anlage_sonst         boolean,
    auszahlungen_vollstaendig   boolean not null default false,
    quelle                      text,
    konfidenz                   text,
    erfasst_von                 uuid references auth.users(id),
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);
create index if not exists idx_pre_fragebogen_org on public.pre_fragebogen(org_id);

create table if not exists public.pre_beteiligungen (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id),
    bezeichnung         text,
    vertragsnummer      text,
    zeichnungssumme     numeric(14,2),
    agio                numeric(14,2),
    einzahlung_am       date,
    notiz               text,
    created_by          uuid references auth.users(id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists idx_pre_beteiligungen_matter on public.pre_beteiligungen(matter_id);

create table if not exists public.pre_auszahlungen (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id),
    betrag              numeric(14,2),
    datum               date,
    notiz               text,
    created_by          uuid references auth.users(id),
    created_at          timestamptz not null default now()
);
create index if not exists idx_pre_auszahlungen_matter on public.pre_auszahlungen(matter_id);

revoke all on public.pre_fragebogen    from anon, authenticated;
revoke all on public.pre_beteiligungen from anon, authenticated;
revoke all on public.pre_auszahlungen  from anon, authenticated;
alter table public.pre_fragebogen    enable row level security;
alter table public.pre_beteiligungen enable row level security;
alter table public.pre_auszahlungen  enable row level security;
drop policy if exists "service_role_only" on public.pre_fragebogen;
create policy "service_role_only" on public.pre_fragebogen using (auth.role() = 'service_role');
drop policy if exists "service_role_only" on public.pre_beteiligungen;
create policy "service_role_only" on public.pre_beteiligungen using (auth.role() = 'service_role');
drop policy if exists "service_role_only" on public.pre_auszahlungen;
create policy "service_role_only" on public.pre_auszahlungen using (auth.role() = 'service_role');
