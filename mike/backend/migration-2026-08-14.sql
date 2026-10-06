-- BKL Stargazer — Migration 2026-08-14
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Pauschalvereinbarung in der Honorarvereinbarung.
--
-- Der Absatz „Alternativ/Zusatztext für Pauschalen" steht bisher in jeder
-- erzeugten Honorarvereinbarung, auch wenn gar keine Pauschale vereinbart ist.
-- Künftig wird vor der Erzeugung gefragt; ohne Haken entfällt der Absatz.
--
-- Die Angaben gehören auf die Akte und nicht nur in das Erzeugungsformular:
-- Bei einer Neuerzeugung — etwa nach einer korrigierten Aufnahme — müssen sie
-- sonst erneut eingegeben werden, und wer das vergisst, verschickt eine
-- Vereinbarung ohne die Pauschale, die mündlich längst besprochen war.
--
-- Der Betrag bewusst als text, nicht als numeric: Er wird nicht gerechnet,
-- sondern in einen Vertragssatz eingesetzt, und er lautet in der Praxis auch
-- einmal „1.500,00 zzgl. USt" oder „500,00 monatlich".
--
-- Idempotent, mehrfach ausführbar.

ALTER TABLE public.matters
    ADD COLUMN IF NOT EXISTS pauschale_vereinbart boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pauschale_zweck      text,
    ADD COLUMN IF NOT EXISTS pauschale_betrag     text,
    ADD COLUMN IF NOT EXISTS pauschale_umfang     text,
    -- Fälligkeit der Pauschale. Bestimmt die Beugung im Vertragssatz
    -- („eine jährliche Pauschale") und die Abrechnung („wird jährlich
    -- fakturiert"). Vorbelegung 'jaehrlich', weil die Vorlage bislang
    -- „(jährliche)" vorgab — so ändert sich für Bestandsakten nichts.
    ADD COLUMN IF NOT EXISTS pauschale_turnus     text NOT NULL DEFAULT 'jaehrlich';

ALTER TABLE public.matters
    DROP CONSTRAINT IF EXISTS matters_pauschale_turnus_check;
ALTER TABLE public.matters
    ADD CONSTRAINT matters_pauschale_turnus_check
    CHECK (pauschale_turnus IN ('monatlich', 'vierteljaehrlich', 'halbjaehrlich', 'jaehrlich'));

COMMENT ON COLUMN public.matters.pauschale_vereinbart IS
    'Steuert den Pauschal-Absatz der Honorarvereinbarung ({{#PAUSCHALE}}-Block).';
COMMENT ON COLUMN public.matters.pauschale_zweck IS
    'Wofür die Pauschale gilt — Freitext, ersetzt {{PAUSCHALE_ZWECK}}.';
COMMENT ON COLUMN public.matters.pauschale_betrag IS
    'Betrag als Vertragstext, ersetzt {{PAUSCHALE_BETRAG}}.';
COMMENT ON COLUMN public.matters.pauschale_umfang IS
    'Was die Pauschale umfasst — Freitext, ersetzt {{PAUSCHALE_UMFANG}}.';
COMMENT ON COLUMN public.matters.pauschale_turnus IS
    'Fälligkeit: monatlich | vierteljaehrlich | halbjaehrlich | jaehrlich. '
    'Speist {{PAUSCHALE_TURNUS}} (Adjektiv) und {{PAUSCHALE_FAELLIGKEIT}} (Adverb).';
