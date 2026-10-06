-- BKL Stargazer — Migration 2026-06-11
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Nachlassverzeichnis Usability:
--   1. Sterbedatum des Erblassers zentral am Mandanten speichern,
--      damit Todestag/Sterbetag nicht in jedem Schreiben neu erfasst
--      werden muss.

-- ---------------------------------------------------------------------------
-- 1. mandanten: Sterbedatum des Erblassers
-- ---------------------------------------------------------------------------

ALTER TABLE public.mandanten
  ADD COLUMN IF NOT EXISTS sterbedatum date;
