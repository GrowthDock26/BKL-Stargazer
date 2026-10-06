-- BKL Stargazer — Migration 2026-06-04
-- Bitte im Supabase SQL-Editor ausführen.

-- ---------------------------------------------------------------------------
-- 1. wissensdatenbank: dokumenttyp um muster, hinweis, handbuch erweitern
-- ---------------------------------------------------------------------------

ALTER TABLE public.wissensdatenbank
  DROP CONSTRAINT IF EXISTS wissensdatenbank_dokumenttyp_check;

ALTER TABLE public.wissensdatenbank
  ADD CONSTRAINT wissensdatenbank_dokumenttyp_check
  CHECK (dokumenttyp IN (
    'urteil', 'aufsatz', 'kommentar', 'gesetze', 'sonstiges',
    'muster', 'hinweis', 'handbuch'
  ));

-- ---------------------------------------------------------------------------
-- 2. wissensdatenbank: rechtsgebiet um kapitalmarkt, litigation erweitern
-- ---------------------------------------------------------------------------

ALTER TABLE public.wissensdatenbank
  DROP CONSTRAINT IF EXISTS wissensdatenbank_rechtsgebiet_check;

ALTER TABLE public.wissensdatenbank
  ADD CONSTRAINT wissensdatenbank_rechtsgebiet_check
  CHECK (rechtsgebiet IN (
    'erbrecht', 'kapitalmarktrecht', 'arbeitsrecht',
    'gesellschaftsrecht', 'allgemein',
    'kapitalmarkt', 'litigation'
  ));

-- ---------------------------------------------------------------------------
-- 3. Nachlassverzeichnis-Tabellen anlegen
--    (Falls schema-nachlassverzeichnis.sql noch nicht ausgeführt wurde)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nachlassverzeichnis_positionen (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id) on delete cascade,
    kategorie           text not null check (kategorie in (
                            'konto_depot', 'immobilie', 'beteiligung',
                            'versicherung', 'sonstiges'
                        )),
    bezeichnung         text not null,
    inhaber             text,
    geschaetzter_wert   numeric(15,2),
    wert_datum          date,
    notizen             text,
    kuendigung_beauftragt boolean default false,
    ermittlung_beauftragt boolean default false,
    bank_name           text,
    iban                text,
    konto_nr            text,
    bic                 text,
    adresse             text,
    grundbuch_amt       text,
    grundbuch_band_blatt text,
    grundstuecksflaeche numeric(10,2),
    nutzungsart         text,
    gesellschaft_name   text,
    rechtsform          text,
    handelsregister_nr  text,
    handelsregister_gericht text,
    anteil_prozent      numeric(6,3),
    nennwert            numeric(15,2),
    versicherung_art    text,
    versicherung_nr     text,
    versicherung_anbieter text,
    beguenstigter       text,
    rueckkaufswert      numeric(15,2),
    ablaufleistung      numeric(15,2),
    ablaufdatum         date,
    praemie_monatlich   numeric(10,2),
    gegenstand_typ      text,
    gegenstand_beschreibung text,
    standort            text,
    kennzeichen         text,
    versicherungswert   numeric(15,2),
    erstellt_von        uuid references auth.users(id),
    erstellt_am         timestamptz not null default now(),
    aktualisiert_am     timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS public.nachlassverzeichnis_kontoanalysen (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id) on delete cascade,
    position_id         uuid references public.nachlassverzeichnis_positionen(id) on delete set null,
    dateiname           text not null,
    zeitraum_von        date,
    zeitraum_bis        date,
    analysiert_am       timestamptz not null default now(),
    ki_ergebnis         jsonb,
    ki_rohtext          text,
    erstellt_von        uuid references auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.nachlassverzeichnis_schreiben (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id) on delete cascade,
    position_id         uuid references public.nachlassverzeichnis_positionen(id) on delete set null,
    schreiben_typ       text not null check (schreiben_typ in (
                            'ermittlung_bank', 'ermittlung_versicherung',
                            'ermittlung_depot', 'ermittlung_grundbuch',
                            'kuendigung_versicherung', 'kuendigung_abo',
                            'kuendigung_kfz', 'kuendigung_sonstiges'
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

-- Indizes
CREATE INDEX IF NOT EXISTS idx_nlv_positionen_matter  ON public.nachlassverzeichnis_positionen(matter_id);
CREATE INDEX IF NOT EXISTS idx_nlv_analysen_matter    ON public.nachlassverzeichnis_kontoanalysen(matter_id);
CREATE INDEX IF NOT EXISTS idx_nlv_schreiben_matter   ON public.nachlassverzeichnis_schreiben(matter_id);

-- RLS (Service Role bypass)
ALTER TABLE public.nachlassverzeichnis_positionen   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nachlassverzeichnis_kontoanalysen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nachlassverzeichnis_schreiben    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_nlv_positionen"  ON public.nachlassverzeichnis_positionen;
DROP POLICY IF EXISTS "service_role_all_nlv_analysen"    ON public.nachlassverzeichnis_kontoanalysen;
DROP POLICY IF EXISTS "service_role_all_nlv_schreiben"   ON public.nachlassverzeichnis_schreiben;

CREATE POLICY "service_role_all_nlv_positionen"
    ON public.nachlassverzeichnis_positionen FOR ALL
    TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_nlv_analysen"
    ON public.nachlassverzeichnis_kontoanalysen FOR ALL
    TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_nlv_schreiben"
    ON public.nachlassverzeichnis_schreiben FOR ALL
    TO service_role USING (true) WITH CHECK (true);
