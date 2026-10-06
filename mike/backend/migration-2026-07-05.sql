-- BKL Stargazer — Migration 2026-07-05
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Kategoriebasierte Aktenanlage:
--   1. matters.kategorie — Mandatskategorie, gewählt bei Aktenanlage
--      (a) Erbrecht (b) Gesellschaftsrecht (c) Kapitalmarktrecht
--      (d) Pro Real Mandat (e) Steuerrecht (f) sonstiges Beratungsmandat
--   2. matters.anfrage — Freitext-Anfrage/Kontext, optional bei Aktenanlage
--      erfasst (z.B. begleitend zu hochgeladenen Unterlagen)
--   3. matters.mandant_name — schlanker Namensplatzhalter für die sofort bei
--      Aktenanlage erzeugte Honorarvereinbarung/Begleitmail, BEVOR der
--      vollständige Aufnahmebogen (Adresse, Geburtsdatum usw.) ausgefüllt ist
--   4. matters.begleitmail_betreff / begleitmail_text — KI-Entwurf der
--      Begleitmail zur Honorarvereinbarung (nur Entwurf, kein Versand)

-- ---------------------------------------------------------------------------
-- 1. matters: Kategorie
-- ---------------------------------------------------------------------------

ALTER TABLE public.matters
  ADD COLUMN IF NOT EXISTS kategorie text NOT NULL DEFAULT 'sonstiges';

ALTER TABLE public.matters
  DROP CONSTRAINT IF EXISTS matters_kategorie_check;
ALTER TABLE public.matters
  ADD CONSTRAINT matters_kategorie_check CHECK (kategorie IN (
    'erbrecht', 'gesellschaftsrecht', 'kapitalmarktrecht',
    'pro_real', 'steuerrecht', 'sonstiges'
  ));

-- ---------------------------------------------------------------------------
-- 2.-4. matters: Anfrage, schlanker Mandantenname, Begleitmail-Entwurf
-- ---------------------------------------------------------------------------

ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS anfrage text;
ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS mandant_name text;
ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS begleitmail_betreff text;
ALTER TABLE public.matters ADD COLUMN IF NOT EXISTS begleitmail_text text;

-- ---------------------------------------------------------------------------
-- 5. matter_documents: neuer doc_type für initiale Uploads bei Aktenanlage
--    (INTAKE_UPLOAD existierte bereits für den späteren Aufnahmebogen;
--     ANFRAGE_UPLOAD markiert Uploads, die schon bei der Aktenanlage selbst
--     beigefügt wurden)
-- ---------------------------------------------------------------------------

ALTER TABLE public.matter_documents
  DROP CONSTRAINT IF EXISTS matter_documents_doc_type_check;
ALTER TABLE public.matter_documents
  ADD CONSTRAINT matter_documents_doc_type_check CHECK (doc_type IN (
    'ANFRAGE_UPLOAD', 'INTAKE_UPLOAD',
    'ONBOARDING_ANSCHREIBEN', 'ONBOARDING_HONORARVEREINBARUNG',
    'ONBOARDING_VOLLMACHT',
    'RUECKLAUF_VOLLMACHT', 'RUECKLAUF_HONORARVEREINBARUNG',
    'ANSPRUCH_SCHREIBEN',
    'KLAGE_SCHRIFT', 'KLAGE_ANLAGE',
    'SONSTIGES'
  ));
