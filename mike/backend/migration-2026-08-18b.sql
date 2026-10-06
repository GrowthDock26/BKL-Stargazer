-- BKL Stargazer — Migration 2026-08-18b
-- Bitte im Supabase SQL-Editor ausführen.
--
-- 1. Neuer Dokumenttyp ONBOARDING_PROZESSVOLLMACHT — die gerichtliche
--    Vollmacht (Prozessvollmacht, § 80 ZPO), getrennt von ONBOARDING_VOLLMACHT.
--
--    Hintergrund: ONBOARDING_VOLLMACHT ist inhaltlich eine außergerichtliche
--    Vollmacht (Verhandlungen, Vergleich, Zustellungen außerhalb eines
--    Prozesses) — sie ermächtigt NICHT zur Vertretung vor Gericht. Für Mandate
--    außer ProReal (kategorie "pro_real") wird zusätzlich eine echte
--    Prozessvollmacht benötigt, die jederzeit einzeln erzeugbar sein soll, auch
--    bevor der Aufnahmebogen vollständig ausgefüllt ist. Beide Vollmachten
--    bleiben als getrennte Dokumente bestehen, keine ersetzt die andere.
--
-- 2. interessenten.kampagne bekommt einen vierten Wert 'UNBEKANNT'.
--
--    Hintergrund: Bei der Kurzanlage eines PRE-Interessenten ist die
--    Beteiligung (PRE9, PRE10 oder beide) nicht immer schon bekannt — vorher
--    musste die Sachbearbeiterin einen der drei echten Werte raten (faktisch
--    immer den Default PRE9), was bei tatsächlicher PRE10- oder Doppel-
--    Beteiligung ein falsches, unvollständiges Unterlagenpaket erzeugt hätte.
--    'UNBEKANNT' wird dokumentseitig wie 'PRE9_PRE10' behandelt (beide
--    Fragebögen und Vollmachten, der PRE9-Fragebogen fragt die Beteiligung an
--    PRE10 ohnehin ausdrücklich ab) und ist später per PATCH korrigierbar,
--    sobald die Beteiligung im Gespräch geklärt ist.
--
-- Idempotent, mehrfach ausführbar.

ALTER TABLE public.matter_templates
    DROP CONSTRAINT IF EXISTS matter_templates_template_type_check;
ALTER TABLE public.matter_templates
    ADD CONSTRAINT matter_templates_template_type_check
    CHECK (template_type IN (
        -- allgemeines Onboarding einer Akte
        'ONBOARDING_ANSCHREIBEN',
        'ONBOARDING_HONORARVEREINBARUNG',
        'ONBOARDING_VOLLMACHT',
        'ONBOARDING_PROZESSVOLLMACHT',
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
        'PRE_EMAILTEXT_EINZELN',
        'PRE_EMAILTEXT_BEIDE',
        -- späterer Ablauf
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT'
    ));

ALTER TABLE public.matter_documents
    DROP CONSTRAINT IF EXISTS matter_documents_doc_type_check;
ALTER TABLE public.matter_documents
    ADD CONSTRAINT matter_documents_doc_type_check
    CHECK (doc_type IN (
        'ANFRAGE_UPLOAD', 'INTAKE_UPLOAD',
        'GWG_PERSONALAUSWEIS',
        'PRE_FRAGEBOGEN',
        'ONBOARDING_ANSCHREIBEN', 'ONBOARDING_HONORARVEREINBARUNG',
        'ONBOARDING_VOLLMACHT', 'ONBOARDING_PROZESSVOLLMACHT', 'ONBOARDING_WIDERRUFSBELEHRUNG',
        'RUECKLAUF_VOLLMACHT', 'RUECKLAUF_HONORARVEREINBARUNG',
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT', 'KLAGE_ANLAGE',
        'SONSTIGES'
    ));

ALTER TABLE public.interessenten
    DROP CONSTRAINT IF EXISTS interessenten_kampagne_check;
ALTER TABLE public.interessenten
    ADD CONSTRAINT interessenten_kampagne_check
    CHECK (kampagne IN ('PRE9', 'PRE10', 'PRE9_PRE10', 'UNBEKANNT'));
