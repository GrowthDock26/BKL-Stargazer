-- BKL Legal OS — Migration 2026-07-28: Widerrufsbelehrung im Onboarding
--
-- Ergänzt die Widerrufsbelehrung als viertes Pflichtdokument des
-- Onboarding-Pakets. Hintergrund: bislang versandte der Standardablauf
-- Anschreiben, Mandatsvereinbarung und Vollmacht — aber keine
-- Widerrufsbelehrung. Bei einem im Fernabsatz geschlossenen Verbrauchermandat
-- beginnt die 14-Tage-Frist ohne wirksame Belehrung nicht zu laufen
-- (§ 356 Abs. 3 BGB); ohne Belehrung und ohne ausdrückliches Verlangen
-- vorzeitigen Leistungsbeginns kann der Vergütungsanspruch bei Widerruf
-- entfallen (§ 357 Abs. 8 BGB).
--
-- Idempotent, mehrfach ausführbar.
-- Voraussetzung: migration-2026-07-18.sql und -18-b.sql sind eingespielt.

-- 1. Neuer Vorlagentyp
alter table public.matter_templates
    drop constraint if exists matter_templates_template_type_check;
alter table public.matter_templates
    add constraint matter_templates_template_type_check
    check (template_type in (
        'ONBOARDING_ANSCHREIBEN',
        'ONBOARDING_HONORARVEREINBARUNG',
        'ONBOARDING_VOLLMACHT',
        'ONBOARDING_WIDERRUFSBELEHRUNG',
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT'
    ));

-- 2. Neuer Dokumenttyp
alter table public.matter_documents
    drop constraint if exists matter_documents_doc_type_check;
alter table public.matter_documents
    add constraint matter_documents_doc_type_check
    check (doc_type in (
        'ANFRAGE_UPLOAD', 'INTAKE_UPLOAD',
        'GWG_PERSONALAUSWEIS',
        'ONBOARDING_ANSCHREIBEN', 'ONBOARDING_HONORARVEREINBARUNG',
        'ONBOARDING_VOLLMACHT', 'ONBOARDING_WIDERRUFSBELEHRUNG',
        'RUECKLAUF_VOLLMACHT', 'RUECKLAUF_HONORARVEREINBARUNG',
        'ANSPRUCH_SCHREIBEN',
        'KLAGE_SCHRIFT', 'KLAGE_ANLAGE',
        'SONSTIGES'
    ));

-- 3. Verweis im Onboarding-Paket
alter table public.onboarding_packages
    add column if not exists widerrufsbelehrung_doc_id uuid references public.matter_documents(id);
