-- BKL Stargazer — Migration 2026-07-12
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Aufnahmebogen: Abfrage einer Rechtsschutzversicherung (ob vorhanden,
-- Versicherer, Versicherungsschein-/Vertragsnummer). Relevant für die
-- Kostenprüfung und ggf. Deckungsanfrage vor Mandatsübernahme.

ALTER TABLE public.mandanten ADD COLUMN IF NOT EXISTS rechtsschutzversicherung boolean DEFAULT false;
ALTER TABLE public.mandanten ADD COLUMN IF NOT EXISTS rechtsschutzversicherung_name text;
ALTER TABLE public.mandanten ADD COLUMN IF NOT EXISTS rechtsschutzversicherung_nummer text;
