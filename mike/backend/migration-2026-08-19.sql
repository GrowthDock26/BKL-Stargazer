-- BKL Stargazer — Migration 2026-08-19
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Akten archivieren (nur Admin).
--
-- Hintergrund: Gerade in der Testphase sammeln sich Test-Akten an, die die
-- Übersicht unübersichtlich machen. Echtes Löschen ist für eine Kanzlei-Akte
-- riskant — die berufsrechtliche Aufbewahrungspflicht (§ 50 BRAO) sowie
-- Dokumente, Fristen und der Audit-Trail sprechen dagegen, Datensätze
-- unwiderruflich zu entfernen, sobald echte Mandate im System sind. Archivieren
-- blendet die Akte aus der Standardübersicht aus, ohne etwas zu löschen — auf
-- Wunsch weiterhin über "Archivierte anzeigen" einsehbar und jederzeit
-- wiederherstellbar.
--
-- Idempotent, mehrfach ausführbar.

ALTER TABLE public.matters
    ADD COLUMN IF NOT EXISTS archiviert_am timestamptz;
ALTER TABLE public.matters
    ADD COLUMN IF NOT EXISTS archiviert_von uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.matters.archiviert_am IS
    'Zeitpunkt der Archivierung durch einen Admin. NULL = aktiv. Blendet die '
    'Akte aus der Standardübersicht aus, löscht aber nichts.';
