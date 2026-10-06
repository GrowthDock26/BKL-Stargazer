-- BKL Legal OS — Migration 2026-07-29: GwG-Abwahl durch den Anwalt
--
-- Der GwG-Ablauf (Identifizierungsstrecke vor dem Aufnahmebogen) gilt ab jetzt
-- als Hausregel für ALLE Mandatskategorien. Ein Anwalt kann ihn im Einzelfall
-- mit Begründung abwählen — etwa wenn die Legitimierung des Mandanten bereits
-- aus einem anderen Mandat vorliegt.
--
-- Die Abwahl ist eine Compliance-Entscheidung und wird deshalb mit Person,
-- Zeitpunkt und Grund festgehalten, nicht nur als Zustandswechsel.
--
-- Idempotent, mehrfach ausführbar.

alter table public.matters
    add column if not exists gwg_uebersprungen_at    timestamptz,
    add column if not exists gwg_uebersprungen_von   uuid references auth.users(id),
    add column if not exists gwg_uebersprungen_grund text;

-- Auswertung "bei welchen Akten wurde die Identifizierung übergangen?"
create index if not exists idx_matters_gwg_uebersprungen
    on public.matters(org_id, gwg_uebersprungen_at)
    where gwg_uebersprungen_at is not null;
