-- BKL Stargazer — Migration 2026-08-15
-- Bitte im Supabase SQL-Editor ausführen.
--
-- PRE9/PRE10: die echten Unterlagen der Kanzlei und die Kampagnenwahl.
--
-- 1. Ein Anleger kann an PRE9, an PRE10 oder an beidem beteiligt sein. Der
--    Fragebogen PRE9 fragt das am Ende ausdrücklich ab („Haben Sie auch eine
--    Beteiligung an ProReal Europa 10 gezeichnet?"), und der Emailtext
--    unterscheidet danach, ob eine oder zwei Vollmachten beiliegen. Die
--    Kampagne braucht deshalb einen dritten Wert.
--
-- 2. Das Versandpaket besteht nicht aus den Onboarding-Vorlagen, sondern aus
--    eigenen Unterlagen: Informationsschreiben, Fragebogen, außergerichtliche
--    Vollmacht, Beschränkungsvereinbarung, Widerrufsbelehrung und
--    Datenschutzhinweise. Fragebogen und Vollmacht gibt es je Kampagne
--    getrennt — die Vollmacht nennt die Emittentin im Betreff.
--
-- 3. Auch die beiden Emailtexte liegen als Vorlage: So bleibt der Wortlaut in
--    der Hand der Kanzlei und wird nicht im Programm festgeschrieben.
--
-- Idempotent, mehrfach ausführbar.

-- ---------------------------------------------------------------------------
-- Kampagne: PRE9, PRE10 oder beides
-- ---------------------------------------------------------------------------
ALTER TABLE public.interessenten
    DROP CONSTRAINT IF EXISTS interessenten_kampagne_check;
ALTER TABLE public.interessenten
    ADD CONSTRAINT interessenten_kampagne_check
    CHECK (kampagne IN ('PRE9', 'PRE10', 'PRE9_PRE10'));

COMMENT ON COLUMN public.interessenten.kampagne IS
    'PRE9 | PRE10 | PRE9_PRE10 (Beteiligung an beiden). Steuert, welche '
    'Fragebögen und Vollmachten das Versandpaket enthält.';

-- ---------------------------------------------------------------------------
-- Vorlagentypen des PRE-Versandpakets
-- ---------------------------------------------------------------------------
ALTER TABLE public.matter_templates
    DROP CONSTRAINT IF EXISTS matter_templates_template_type_check;

ALTER TABLE public.matter_templates
    ADD CONSTRAINT matter_templates_template_type_check
    CHECK (template_type IN (
        -- allgemeines Onboarding einer Akte
        'ONBOARDING_ANSCHREIBEN',
        'ONBOARDING_HONORARVEREINBARUNG',
        'ONBOARDING_VOLLMACHT',
        'ONBOARDING_WIDERRUFSBELEHRUNG',
        -- PRE-Versandpaket (WF-001)
        'PRE_FRAGEBOGEN',                 -- Altbestand, nicht mehr verwendet
        'PRE_INFORMATIONSSCHREIBEN',
        'PRE_FRAGEBOGEN_9',
        'PRE_FRAGEBOGEN_10',
        'PRE_VOLLMACHT_9',
        'PRE_VOLLMACHT_10',
        'PRE_BESCHRAENKUNGSVEREINBARUNG',
        'PRE_WIDERRUFSBELEHRUNG',
        'PRE_DATENSCHUTZ',
        -- Begleittext der E-Mail, je nach Zahl der beiliegenden Vollmachten
        'PRE_EMAILTEXT_EINZELN',
        'PRE_EMAILTEXT_BEIDE',
        -- späterer Ablauf
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT'
    ));

-- ---------------------------------------------------------------------------
-- Vorlagen dürfen auch PDF sein
--
-- Der Fragebogen PRE10 liegt nur als PDF vor. Er enthält keine Platzhalter und
-- wird unverändert beigelegt — das Format muss deshalb mitgeführt werden,
-- damit die Paketerzeugung weiß, ob sie füllen darf oder durchreichen muss.
-- ---------------------------------------------------------------------------
ALTER TABLE public.matter_templates
    ADD COLUMN IF NOT EXISTS mime_type text NOT NULL
        DEFAULT 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

COMMENT ON COLUMN public.matter_templates.mime_type IS
    'Format der Vorlage. PDF-Vorlagen werden unverändert beigelegt, DOCX-Vorlagen befüllt.';
