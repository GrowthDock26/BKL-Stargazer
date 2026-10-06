-- BKL Stargazer — Migration 2026-08-07
-- Bitte im Supabase SQL-Editor ausführen.
--
-- PRE9/PRE10, WF-001: Der Fragebogen wird als Kanzleivorlage hinterlegt, damit
-- das System ihn zusammen mit Anschreiben, Vollmacht, Widerrufsbelehrung und
-- Kostenaufklärung für einen Interessenten vorbereiten kann.
--
-- Bisher kannte matter_templates nur die vier Onboarding-Vorlagen. Der
-- Fragebogen ist die einzige Anlage aus WF-001, die dort fehlt — ohne sie
-- bleibt das Paket unvollständig.
--
-- Idempotent, mehrfach ausführbar.

ALTER TABLE public.matter_templates
    DROP CONSTRAINT IF EXISTS matter_templates_template_type_check;

ALTER TABLE public.matter_templates
    ADD CONSTRAINT matter_templates_template_type_check
    CHECK (template_type IN (
        'ONBOARDING_ANSCHREIBEN',
        'ONBOARDING_HONORARVEREINBARUNG',
        'ONBOARDING_VOLLMACHT',
        'ONBOARDING_WIDERRUFSBELEHRUNG',
        'PRE_FRAGEBOGEN',
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT'
    ));
