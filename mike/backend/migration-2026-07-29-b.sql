-- BKL Legal OS — Migration 2026-07-29 (b): PRE-Fragebogen
--
-- Erfasst die Angaben aus dem PRE9/PRE10-Fragebogen strukturiert, damit der
-- Streitwert nach dem Ablaufplan berechenbar wird:
--
--     Streitwert = Zeichnungssumme + Agio − Summe der Auszahlungen
--
-- Beträge bewusst als numeric(14,2), nicht als float: bei Geldbeträgen führen
-- Gleitkommafehler sonst zu Cent-Abweichungen, die sich über Gebührenstufen
-- fortpflanzen.
--
-- Der Streitwert wird NICHT gespeichert, sondern bei jedem Abruf aus den
-- Zeilen berechnet. Ein gespeicherter Wert würde veralten, sobald jemand eine
-- Auszahlung nachträgt — und niemand würde es merken.
--
-- Idempotent, mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- Fragebogen-Kopfdaten (genau eine Zeile je Akte)
-- ---------------------------------------------------------------------------
create table if not exists public.pre_fragebogen (
    id                          uuid primary key default gen_random_uuid(),
    matter_id                   uuid not null unique references public.matters(id) on delete cascade,
    org_id                      uuid not null references public.organizations(id),

    -- Anlagen (Checkliste des Ablaufplans, Abschnitt "Rücklauf Fragebogen")
    zeichnungserklaerung_beigefuegt boolean,
    vib_beigefuegt                  boolean,
    rsv_kopie_beigefuegt            boolean,

    -- Prospektübergabe. Die beiden Angaben schließen einander aus; der
    -- Fragebogen lässt es zu, beide anzukreuzen — das prüft lib/tools/pre.ts.
    prospekt_erhalten_am        date,
    prospekt_gelesen            boolean,
    prospekt_durchgegangen      boolean,

    -- Rechtsschutz (ergänzt die Felder in mandanten um Vertragsdetails)
    rsv_versicherungsnehmer     text,
    rsv_abgeschlossen_am        date,

    -- Sonstiges — drei Ja/Nein-Fragen des Fragebogens
    anderweitig_geltend_gemacht boolean,
    andere_anlage_one_group     boolean,
    andere_anlage_sonst         boolean,

    -- "s. Anlage" bei den Auszahlungen: die Aufstellung ist unvollständig und
    -- der Streitwert damit vorläufig.
    auszahlungen_vollstaendig   boolean not null default false,

    quelle                      text,   -- 'ki_fragebogen' | 'manuell'
    konfidenz                   text,
    erfasst_von                 uuid references auth.users(id),
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

create index if not exists idx_pre_fragebogen_org on public.pre_fragebogen(org_id);

-- ---------------------------------------------------------------------------
-- Beteiligungen (mehrere je Akte — der Beispielfragebogen enthält zwei)
-- ---------------------------------------------------------------------------
create table if not exists public.pre_beteiligungen (
    id                  uuid primary key default gen_random_uuid(),
    matter_id           uuid not null references public.matters(id) on delete cascade,
    org_id              uuid not null references public.organizations(id),
    bezeichnung         text,               -- z.B. "Pro Real Europa 10"
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

-- ---------------------------------------------------------------------------
-- Erhaltene Auszahlungen
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Zugriff nur über die Server-Rolle, wie bei allen Mandatstabellen
-- ---------------------------------------------------------------------------
revoke all on public.pre_fragebogen    from anon, authenticated;
revoke all on public.pre_beteiligungen from anon, authenticated;
revoke all on public.pre_auszahlungen  from anon, authenticated;

alter table public.pre_fragebogen    enable row level security;
alter table public.pre_beteiligungen enable row level security;
alter table public.pre_auszahlungen  enable row level security;

drop policy if exists "service_role_only" on public.pre_fragebogen;
create policy "service_role_only" on public.pre_fragebogen
    using (auth.role() = 'service_role');
drop policy if exists "service_role_only" on public.pre_beteiligungen;
create policy "service_role_only" on public.pre_beteiligungen
    using (auth.role() = 'service_role');
drop policy if exists "service_role_only" on public.pre_auszahlungen;
create policy "service_role_only" on public.pre_auszahlungen
    using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Dokumenttyp für den hochgeladenen Fragebogen
-- ---------------------------------------------------------------------------
alter table public.matter_documents
    drop constraint if exists matter_documents_doc_type_check;
alter table public.matter_documents
    add constraint matter_documents_doc_type_check
    check (doc_type in (
        'ANFRAGE_UPLOAD', 'INTAKE_UPLOAD',
        'GWG_PERSONALAUSWEIS',
        'PRE_FRAGEBOGEN',
        'ONBOARDING_ANSCHREIBEN', 'ONBOARDING_HONORARVEREINBARUNG',
        'ONBOARDING_VOLLMACHT', 'ONBOARDING_WIDERRUFSBELEHRUNG',
        'RUECKLAUF_VOLLMACHT', 'RUECKLAUF_HONORARVEREINBARUNG',
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT', 'KLAGE_ANLAGE',
        'SONSTIGES'
    ));
