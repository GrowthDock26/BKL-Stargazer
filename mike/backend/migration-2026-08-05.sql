-- BKL Stargazer — Migration 2026-08-05
-- Bitte im Supabase SQL-Editor ausführen.
--
-- Unternehmensmandat: Kennzeichnung, ob der Mandant als Unternehmer (§ 14 BGB)
-- und nicht als Verbraucher (§ 13 BGB) handelt.
--
-- Folge für das Onboarding-Paket: Das Widerrufsrecht aus §§ 312 ff., 355 BGB
-- besteht nur bei Verbraucherverträgen. Bei einem Unternehmensmandat wird
-- deshalb KEINE Widerrufsbelehrung erzeugt — eine mitgeschickte Belehrung wäre
-- nicht nur überflüssig, sie könnte als vertragliche Einräumung eines
-- Widerrufsrechts gelesen werden, das dem Mandanten sonst nicht zusteht.
--
-- Default bewusst false: Bestandsakten bleiben damit Verbrauchermandate und
-- behalten ihre Widerrufsbelehrung. Die umgekehrte Vorbelegung würde bei einer
-- Altakte eine Pflichtbelehrung stillschweigend entfallen lassen.

ALTER TABLE public.matters
    ADD COLUMN IF NOT EXISTS unternehmensmandat boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.matters.unternehmensmandat IS
    'Mandant handelt als Unternehmer (§ 14 BGB): keine Widerrufsbelehrung im Onboarding-Paket.';
