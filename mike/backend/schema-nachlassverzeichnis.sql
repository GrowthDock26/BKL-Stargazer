-- BKL Legal OS — Nachlassverzeichnis-Schema
-- Run AFTER schema-bkl.sql.
-- Liefert: Vermögensverzeichnis (5 Kategorien), Kontoauszug-Analysen,
--          Ermittlungsschreiben, Kündigungsschreiben.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Vermögensverzeichnis — Positionen (5 Kategorien)
-- ---------------------------------------------------------------------------

create table if not exists public.nachlassverzeichnis_positionen (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id) on delete cascade,

    kategorie           text not null check (kategorie in (
                            'konto_depot',   -- Konten, Sparbücher, Depots
                            'immobilie',     -- Grundstücke, Wohnungen, Häuser
                            'beteiligung',   -- GmbH, KG, GbR, AG, stille Beteiligung
                            'versicherung',  -- Leben, Unfall, Rente, Risiko
                            'sonstiges'      -- Kunst, KFZ, Schmuck, Schließfach, Sonstiges
                        )),

    -- Gemeinsame Felder (alle Kategorien)
    bezeichnung         text not null,          -- z.B. "Girokonto Sparkasse München"
    inhaber             text,                   -- Name des Erblassers / Kontoinhaber
    geschaetzter_wert   numeric(15,2),          -- EUR zum Bewertungsstichtag
    wert_datum          date,                   -- Stichtag der Bewertung
    notizen             text,                   -- Freie Notizen
    kuendigung_beauftragt boolean default false,
    ermittlung_beauftragt boolean default false,

    -- ── Konto & Depot ────────────────────────────────────────────────────────
    bank_name           text,                   -- z.B. "Sparkasse München"
    iban                text,                   -- IBAN (anonymisiert gespeichert)
    konto_nr            text,                   -- Kontonummer / Depotnummer
    bic                 text,

    -- ── Immobilien ───────────────────────────────────────────────────────────
    adresse             text,                   -- Vollständige Adresse
    grundbuch_amt       text,                   -- Amtsgericht / Grundbuchamt
    grundbuch_band_blatt text,                  -- Band/Blatt oder Flurstück
    grundstuecksflaeche numeric(10,2),          -- m²
    nutzungsart         text,                   -- Eigennutzung, Vermietung, Gewerblich

    -- ── Beteiligungen ────────────────────────────────────────────────────────
    gesellschaft_name   text,                   -- Firmenname
    rechtsform          text,                   -- GmbH, KG, GbR, AG, UG, stille Beteiligung
    handelsregister_nr  text,                   -- HRB 12345, HRA 678...
    handelsregister_gericht text,               -- Amtsgericht München
    anteil_prozent      numeric(6,3),           -- % -Anteil
    nennwert            numeric(15,2),          -- Nennwert der Beteiligung

    -- ── Versicherungen ───────────────────────────────────────────────────────
    versicherung_art    text,                   -- Lebensversicherung, Unfallversicherung...
    versicherung_nr     text,                   -- Vertragsnummer
    versicherung_anbieter text,                 -- z.B. "Allianz"
    beguenstigter       text,                   -- Begünstigter (falls benannt)
    rueckkaufswert      numeric(15,2),          -- Aktueller Rückkaufswert
    ablaufleistung      numeric(15,2),          -- Vereinbarte Ablaufleistung
    ablaufdatum         date,                   -- Vertragsende
    praemie_monatlich   numeric(10,2),          -- Monatliche Prämie (aus Kontoauszug)

    -- ── Sonstiges ────────────────────────────────────────────────────────────
    gegenstand_typ      text,                   -- Kunst, KFZ, Schmuck, Schließfach, Uhren...
    gegenstand_beschreibung text,               -- Detailbeschreibung
    standort            text,                   -- Wo befindet sich der Gegenstand
    kennzeichen         text,                   -- Bei KFZ: Kennzeichen, FIN
    versicherungswert   numeric(15,2),          -- Versicherter Wert

    -- Meta
    erstellt_von        uuid references auth.users(id),
    erstellt_am         timestamptz not null default now(),
    aktualisiert_am     timestamptz not null default now()
);

create index if not exists idx_nlv_positionen_matter on public.nachlassverzeichnis_positionen(matter_id);
create index if not exists idx_nlv_positionen_kategorie on public.nachlassverzeichnis_positionen(kategorie);

-- ---------------------------------------------------------------------------
-- 2. Kontoauszug-Analysen
-- ---------------------------------------------------------------------------

create table if not exists public.nachlassverzeichnis_kontoanalysen (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id) on delete cascade,
    position_id         uuid references public.nachlassverzeichnis_positionen(id) on delete set null,

    dateiname           text not null,
    zeitraum_von        date,
    zeitraum_bis        date,
    analysiert_am       timestamptz not null default now(),

    -- KI-Ergebnis als JSON
    -- Struktur: { regelmaessige_einganege, regelmaessige_ausgaenge,
    --             auffaellige_transaktionen, erkannte_vermoegenswerte }
    ki_ergebnis         jsonb,
    ki_rohtext          text,           -- Extrahierter Volltext des Kontoauszugs

    erstellt_von        uuid references auth.users(id)
);

create index if not exists idx_nlv_analysen_matter on public.nachlassverzeichnis_kontoanalysen(matter_id);

-- ---------------------------------------------------------------------------
-- 3. Ermittlungsschreiben & Kündigungsschreiben
-- ---------------------------------------------------------------------------

create table if not exists public.nachlassverzeichnis_schreiben (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id) on delete cascade,
    position_id         uuid references public.nachlassverzeichnis_positionen(id) on delete set null,

    schreiben_typ       text not null check (schreiben_typ in (
                            'ermittlung_bank',
                            'ermittlung_versicherung',
                            'ermittlung_depot',
                            'ermittlung_grundbuch',
                            'kuendigung_versicherung',
                            'kuendigung_abo',
                            'kuendigung_kfz',
                            'kuendigung_sonstiges'
                        )),

    empfaenger_name     text not null,
    empfaenger_adresse  text,
    empfaenger_email    text,

    betreff             text,
    entwurf_text        text not null,

    status              text not null default 'ENTWURF' check (status in (
                            'ENTWURF', 'FREIGEGEBEN', 'VERSANDT'
                        )),
    freigegeben_von     uuid references auth.users(id),
    freigegeben_am      timestamptz,
    versandt_am         timestamptz,

    erstellt_von        uuid references auth.users(id),
    erstellt_am         timestamptz not null default now()
);

create index if not exists idx_nlv_schreiben_matter on public.nachlassverzeichnis_schreiben(matter_id);
create index if not exists idx_nlv_schreiben_typ on public.nachlassverzeichnis_schreiben(schreiben_typ);

-- ---------------------------------------------------------------------------
-- 4. RLS — Org-Isolation
-- ---------------------------------------------------------------------------

alter table public.nachlassverzeichnis_positionen  enable row level security;
alter table public.nachlassverzeichnis_kontoanalysen enable row level security;
alter table public.nachlassverzeichnis_schreiben   enable row level security;

-- Service role bypasses RLS (backend uses service role)
drop policy if exists "service_role_all_nlv_positionen"   on public.nachlassverzeichnis_positionen;
drop policy if exists "service_role_all_nlv_analysen"     on public.nachlassverzeichnis_kontoanalysen;
drop policy if exists "service_role_all_nlv_schreiben"    on public.nachlassverzeichnis_schreiben;

create policy "service_role_all_nlv_positionen"
    on public.nachlassverzeichnis_positionen for all
    to service_role using (true) with check (true);

create policy "service_role_all_nlv_analysen"
    on public.nachlassverzeichnis_kontoanalysen for all
    to service_role using (true) with check (true);

create policy "service_role_all_nlv_schreiben"
    on public.nachlassverzeichnis_schreiben for all
    to service_role using (true) with check (true);
