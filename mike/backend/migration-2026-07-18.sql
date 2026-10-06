-- BKL Legal OS — Migration 2026-07-18
--
-- Enthält zwei Blöcke:
--   A) GwG-Ablauf (neue Spalten, Zustände, Tabelle gwg_pruefungen)
--   B) Phase-1-Härtung: Dubletten-Schutz für RA-Micro-Aktennummern
--
-- Alle Anweisungen sind idempotent und können mehrfach ausgeführt werden.
-- Identischer Inhalt steht in schema-bkl.sql (Abschnitt 14) für Neuinstallationen.

-- ===========================================================================
-- A) GwG-Ablauf
-- ===========================================================================

alter table public.matters
    add column if not exists mandant_email text,
    add column if not exists gwg_mail_betreff text,
    add column if not exists gwg_mail_text text;

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
        'ONBOARDING_VOLLMACHT',
        'RUECKLAUF_VOLLMACHT', 'RUECKLAUF_HONORARVEREINBARUNG',
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT', 'KLAGE_ANLAGE',
        'SONSTIGES'
    ));

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

-- ===========================================================================
-- B) Dubletten-Schutz für RA-Micro-Aktennummern
-- ===========================================================================

-- VOR DEM AUSFÜHREN PRÜFEN: Existieren bereits Dubletten, schlägt das Anlegen
-- des Index fehl. Diese Abfrage listet sie auf:
--
--   select org_id, aktenzeichen, count(*)
--   from public.matters
--   where aktenzeichen is not null
--   group by org_id, aktenzeichen
--   having count(*) > 1;
--
-- Dubletten zuerst bereinigen (Aktenzeichen korrigieren oder Akte löschen),
-- danach diese Migration erneut ausführen.

-- Partiell: mehrere Akten ohne Aktenzeichen bleiben erlaubt (NULL ist in
-- Postgres ohnehin nicht eindeutigkeitsrelevant, die WHERE-Klausel hält den
-- Index zusätzlich klein).
create unique index if not exists idx_matters_org_aktenzeichen_unique
    on public.matters(org_id, aktenzeichen)
    where aktenzeichen is not null;
