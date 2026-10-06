-- BKL Stargazer — Migration 2026-07-13
-- Bitte im Supabase SQL-Editor ausführen.
--
-- 1. matters.sachbearbeiter — Ansprechpartner/Sachbearbeiter für Briefkopf
--    und Mandatsvereinbarung, wird jetzt vor der Dokumenterzeugung abgefragt.
-- 2. matter_documents.docx_storage_path — die befüllte DOCX-Fassung wird
--    zusätzlich zur PDF gespeichert, damit Onboarding-Dokumente als
--    bearbeitbares Word-Dokument heruntergeladen werden können.

ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS sachbearbeiter text;
ALTER TABLE public.matter_documents ADD COLUMN IF NOT EXISTS docx_storage_path text;
