-- BKL Stargazer — Migration 2026-07-10
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Aufnahmebogen: strukturierter Sachverhalt statt einem einzelnen Freitext-
-- feld. Grund: die Mandats-/Honorarvereinbarung und das Anschreiben wurden
-- bislang nur aus "beratungskurzbeschreibung" (ein Freitext) generiert, was
-- zu generischen, nicht fallspezifischen Dokumenten führte. Die vier neuen
-- Felder werden im Aufnahmebogen gezielt abgefragt und fließen in die
-- LLM-Sachverhaltspassage (onboarding.ts) ein.

ALTER TABLE public.mandanten ADD COLUMN IF NOT EXISTS sachverhalt_seit date;
ALTER TABLE public.mandanten ADD COLUMN IF NOT EXISTS gegner text;
ALTER TABLE public.mandanten ADD COLUMN IF NOT EXISTS bisherige_schritte text;
ALTER TABLE public.mandanten ADD COLUMN IF NOT EXISTS mandatsziel text;
