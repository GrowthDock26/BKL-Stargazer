-- BKL Stargazer — Migration 2026-08-18
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Entfernt MANDAT_ANGENOMMEN als eigenständigen Status eines Interessenten.
--
-- Hintergrund: Die Annahme-Entscheidung fällt fachlich erst mit dem
-- bestätigten Rücklauf der Unterlagen — nicht vorher. Ein früherer
-- "angenommen"-Status hätte suggeriert, ein Vorgang sei schon entschieden,
-- obwohl noch Unterlagen fehlen können. Solange der Rücklauf nicht bestätigt
-- ist, bleibt der Vorgang durchgehend Interessent (mit den Zwischenständen
-- Telefontermin, Unterlagen versendet, Nachforderung) und läuft weiter durch
-- die Nachfassschleife. UNTERLAGEN_VOLLSTAENDIG — dieser Status existiert
-- bereits — IST die Annahme faktisch: Von dort aus wird direkt die Akte
-- angelegt (WF-003), ohne einen weiteren Zwischenschritt.
--
-- Vor Anlegen dieser Migration wurde geprüft, dass kein Vorgang aktuell auf
-- MANDAT_ANGENOMMEN steht — die Migration verzichtet deshalb bewusst auf eine
-- Datenwanderung. Sollte doch einer existieren, bricht die Prüfbedingung
-- unten mit einer klaren Fehlermeldung ab, statt still Daten zu verwerfen.
--
-- Idempotent, mehrfach ausführbar.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.interessenten WHERE status = 'MANDAT_ANGENOMMEN') THEN
        RAISE EXCEPTION
            'Es gibt noch Vorgänge mit Status MANDAT_ANGENOMMEN — bitte diese zuerst manuell '
            'auf INTERESSENT, TELEFONTERMIN oder UNTERLAGEN_VERSENDET umsetzen, dann diese '
            'Migration erneut ausführen.';
    END IF;
END $$;

ALTER TABLE public.interessenten
    DROP CONSTRAINT IF EXISTS interessenten_status_check;
ALTER TABLE public.interessenten
    ADD CONSTRAINT interessenten_status_check
    CHECK (status IN (
        'INTERESSENT',
        'TELEFONTERMIN',
        'UNTERLAGEN_VERSENDET',
        'NACHFORDERUNG',
        'UNTERLAGEN_VOLLSTAENDIG',
        'AKTE_ANGELEGT',
        'KEIN_INTERESSE'
    ));
