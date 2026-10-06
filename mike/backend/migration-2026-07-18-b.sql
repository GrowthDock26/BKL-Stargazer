-- BKL Legal OS — Migration 2026-07-18 (b): Fristen-Benachrichtigungen
--
-- Phase 2: Vorfrist- und Ablauf-Benachrichtigung per EU-SMTP. Die beiden neuen
-- Spalten sorgen dafür, dass jede Benachrichtigung genau einmal versandt wird —
-- der Scheduler läuft alle 5 Minuten und würde sonst denselben Hinweis
-- hunderte Male am Tag verschicken.
--
-- Idempotent, kann mehrfach ausgeführt werden.
-- Voraussetzung: migration-2026-07-18.sql wurde bereits eingespielt.

alter table public.fristen
    add column if not exists reminder_gesendet_at    timestamptz,
    add column if not exists ablauf_benachrichtigt_at timestamptz;

-- Bestandsfristen als "bereits benachrichtigt" markieren.
--
-- WICHTIG: Ohne diesen Schritt würde der erste Scheduler-Lauf nach dem Deploy
-- für jede bereits abgelaufene Altfrist eine Benachrichtigung erzeugen —
-- potenziell dutzende E-Mails auf einmal, die niemand einordnen kann. Nur
-- Fristen, die ab jetzt entstehen oder deren Datum geändert wird, lösen
-- Benachrichtigungen aus.
--
-- Der coalesce-Filter stellt sicher, dass ein erneuter Lauf dieser Migration
-- keine bereits gesetzten Zeitstempel überschreibt.
update public.fristen
set reminder_gesendet_at     = coalesce(reminder_gesendet_at, now()),
    ablauf_benachrichtigt_at = coalesce(ablauf_benachrichtigt_at, now())
where reminder_gesendet_at is null
   or ablauf_benachrichtigt_at is null;

-- Teilindex für den Scheduler: nur offene, noch nicht erinnerte Fristen.
create index if not exists idx_fristen_reminder_offen
    on public.fristen(reminderdatum)
    where reminder_gesendet_at is null and not erledigt;

create index if not exists idx_fristen_ablauf_offen
    on public.fristen(fristende)
    where ablauf_benachrichtigt_at is null;
