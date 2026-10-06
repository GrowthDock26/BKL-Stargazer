-- BKL Stargazer — Migration 2026-08-16
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Herkunft von Wissensdatenbank-Einträgen (z.B. beck-online) und optionale
-- Verknüpfung mit einer Akte.
--
-- Hintergrund: Der bisherige Upload ging davon aus, dass jedes Dokument
-- „eigenes" Material der Kanzlei ist. Ein Kollege lädt jetzt aber gezielt
-- Kommentierungen/Aufsätze herunter, die er selbst — als lizenzierter
-- Einzelnutzer — bei beck-online abgerufen hat, und legt sie hier ab. Diese
-- Herkunft muss sichtbar bleiben:
--
--   1. Rechtlich: Der Beck-Lizenzvertrag erlaubt dem Nutzer selbst den Abruf,
--      nicht aber, das Dokument ohne Kennzeichnung wie kanzleieigenes Material
--      zu behandeln oder zu verbreiten.
--   2. Praktisch: Der Assistent darf eine Beck-Kommentierung in einem
--      Schriftsatz zitieren, aber nicht großflächig wörtlich übernehmen — er
--      muss dafür wissen, dass es sich um lizenziertes Fremdmaterial handelt.
--
-- Die Verknüpfung mit einer Akte ist optional: Ein Fundstellen-Nachweis kann
-- gezielt für ein laufendes Mandat gesucht worden sein, ohne dass er deshalb
-- nur dort sichtbar sein soll — er bleibt zugleich Teil der allgemeinen
-- Wissensdatenbank.
--
-- Idempotent, mehrfach ausführbar.

ALTER TABLE public.wissensdatenbank
    ADD COLUMN IF NOT EXISTS quelle text NOT NULL DEFAULT 'eigenes',
    ADD COLUMN IF NOT EXISTS fundstelle text,
    ADD COLUMN IF NOT EXISTS matter_id uuid REFERENCES public.matters(id) ON DELETE SET NULL;

ALTER TABLE public.wissensdatenbank
    DROP CONSTRAINT IF EXISTS wissensdatenbank_quelle_check;
ALTER TABLE public.wissensdatenbank
    ADD CONSTRAINT wissensdatenbank_quelle_check
    CHECK (quelle IN ('eigenes', 'beck-online', 'sonstige-lizenzquelle'));

CREATE INDEX IF NOT EXISTS idx_wissensdatenbank_matter ON public.wissensdatenbank(matter_id)
    WHERE matter_id IS NOT NULL;

COMMENT ON COLUMN public.wissensdatenbank.quelle IS
    'eigenes = kanzleieigenes Material; beck-online / sonstige-lizenzquelle = '
    'vom Nutzer manuell heruntergeladenes lizenziertes Fremdmaterial (Fundstelle Pflicht).';
COMMENT ON COLUMN public.wissensdatenbank.fundstelle IS
    'Zitierfähige Fundstelle, z.B. "BeckOK BGB/Müller, § 823 Rn. 12, Stand: 1.5.2026". '
    'Pflicht, sobald quelle ungleich eigenes ist — durchgesetzt in routes/wissensbasis.ts.';
COMMENT ON COLUMN public.wissensdatenbank.matter_id IS
    'Optionale Verknüpfung mit der Akte, für die das Dokument gesucht wurde. '
    'Der Eintrag bleibt zugleich Teil der allgemeinen Wissensdatenbank.';
