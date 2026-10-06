-- BKL Stargazer — Migration 2026-08-06
-- Bitte im Supabase SQL-Editor ausführen.
--
-- PRE9/PRE10-Workflow, Phase 1: der Vorgang VOR der Akte.
--
-- Das Lastenheft beginnt bei „Interessent" und damit deutlich früher als die
-- bisherige Zustandsmaschine, deren erster Zustand eine angelegte Akte
-- voraussetzt. Zwischen Erstkontakt und Mandatsanlage liegen aber die Schritte
-- mit dem größten Mengenaufkommen: Unterlagen versenden, dreimal nachfassen,
-- Vollständigkeit prüfen. Bei über 100 Interessenten ist das die eigentliche
-- Arbeit — und sie hatte bisher keinen Ort im System.
--
-- Bewusst eine eigene Tabelle statt einer Akte im Zustand „Interessent":
-- Eine Akte trägt Aktenzeichen, GwG-Pflichten, Fristen und Dokumente. Ein
-- Interessent, der nie antwortet, soll nichts davon auslösen — und in keiner
-- Aktenstatistik auftauchen.
--
-- Idempotent, mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- Vorgang vor der Akte
-- ---------------------------------------------------------------------------
create table if not exists public.interessenten (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null references public.organizations(id) on delete cascade,

    -- Kampagne. Steuert später die Verjährungsfristen und die Textbausteine;
    -- PRE9 und PRE10 laufen fachlich getrennt, auch wenn der Ablauf gleich ist.
    kampagne        text not null default 'PRE9'
                    check (kampagne in ('PRE9', 'PRE10')),

    -- Kontakt. Bewusst schlank: Was hier steht, hat der Interessent am Telefon
    -- gesagt. Die belastbare Erfassung passiert erst im Aufnahmebogen der Akte.
    anrede          text,
    vorname         text,
    nachname        text not null,
    email           text,
    telefon         text,
    strasse         text,
    hausnummer      text,
    plz             text,
    ort             text,

    -- Rechtsschutz — Deckungsanfrage ist WF-006 und braucht diese Angaben.
    rsv_vorhanden   boolean not null default false,
    rsv_name        text,
    rsv_nummer      text,

    -- Herkunft. „vermittler" trägt den Finanzvertrieb, an den nach der dritten
    -- erfolglosen Nachfassung ein Hinweis geht (WF-002 c).
    quelle          text,
    vermittler      text,

    -- Status: der Weg WF-001 → WF-003. Endet bei AKTE_ANGELEGT; ab dort
    -- übernimmt die Zustandsmaschine der Akte (lib/matter/state-machine.ts).
    --
    -- „Warten auf Rücklauf" aus dem Lastenheft ist bewusst KEIN eigener Status:
    -- Es ist derselbe Zustand wie UNTERLAGEN_VERSENDET mit laufender
    -- Wiedervorlage. Ein Status, der nie für sich steht, macht die Liste nur
    -- unschärfer.
    status          text not null default 'INTERESSENT'
                    check (status in (
                        'INTERESSENT',
                        'TELEFONTERMIN',
                        'MANDAT_ANGENOMMEN',
                        'UNTERLAGEN_VERSENDET',
                        'NACHFORDERUNG',
                        'UNTERLAGEN_VOLLSTAENDIG',
                        'AKTE_ANGELEGT',
                        'KEIN_INTERESSE'
                    )),

    -- Wiedervorlage. Datum statt Zeitstempel: Der Ablauf rechnet in Tagen, und
    -- ein Vorgang ist am Stichtag fällig, nicht zur Uhrzeit des Versands.
    wiedervorlage_am        date,
    -- 0 = noch nicht nachgefasst, 1..3 = Stufe der Nachfassung aus WF-002.
    -- Nach Stufe 3 wird kein weiteres Mal nachgefasst.
    nachfass_stufe          integer not null default 0
                            check (nachfass_stufe between 0 and 3),
    unterlagen_versendet_am     date,
    vertrieb_informiert_am      date,

    -- Gesetzt, sobald aus dem Vorgang eine Akte geworden ist (WF-003).
    matter_id       uuid references public.matters(id) on delete set null,

    notiz           text,
    created_by      uuid references auth.users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_interessenten_org      on public.interessenten(org_id);
-- Trägt die Hauptabfrage der Arbeitsliste: „was ist heute fällig?"
create index if not exists idx_interessenten_wv       on public.interessenten(org_id, wiedervorlage_am)
    where status not in ('AKTE_ANGELEGT', 'KEIN_INTERESSE');
create index if not exists idx_interessenten_matter   on public.interessenten(matter_id);

-- ---------------------------------------------------------------------------
-- Protokoll (revisionssicher, Lastenheft Ziffer 2)
--
-- Append-only: keine Update-/Delete-Rechte, auch nicht für die Server-Rolle.
-- Ein Protokoll, das sich nachträglich ändern lässt, ist im Streitfall wertlos.
-- ---------------------------------------------------------------------------
create table if not exists public.interessent_events (
    id              uuid primary key default gen_random_uuid(),
    interessent_id  uuid not null references public.interessenten(id) on delete cascade,
    org_id          uuid not null references public.organizations(id),
    von_status      text,
    nach_status     text,
    aktion          text not null,
    notiz           text,
    ausgeloest_von  uuid references auth.users(id),
    rolle           text,
    created_at      timestamptz not null default now()
);

create index if not exists idx_interessent_events_vorgang
    on public.interessent_events(interessent_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Zugriff nur über die Server-Rolle, wie bei allen Mandatstabellen
-- ---------------------------------------------------------------------------
revoke all on public.interessenten      from anon, authenticated;
revoke all on public.interessent_events from anon, authenticated;

alter table public.interessenten      enable row level security;
alter table public.interessent_events enable row level security;

drop policy if exists "service_role_only" on public.interessenten;
create policy "service_role_only" on public.interessenten
    using (auth.role() = 'service_role');

drop policy if exists "service_role_only" on public.interessent_events;
create policy "service_role_only" on public.interessent_events
    using (auth.role() = 'service_role');

comment on table public.interessenten is
    'PRE9/PRE10-Vorgang vor der Aktenanlage (Lastenheft WF-001 bis WF-003).';
comment on table public.interessent_events is
    'Append-only-Protokoll aller Statuswechsel eines Interessenten-Vorgangs.';
