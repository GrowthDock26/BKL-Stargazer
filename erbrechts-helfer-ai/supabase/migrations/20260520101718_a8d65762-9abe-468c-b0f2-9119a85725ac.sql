
CREATE TABLE public.agent_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  order_index INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read enabled agent profiles"
ON public.agent_profiles FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can insert agent profiles"
ON public.agent_profiles FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update agent profiles"
ON public.agent_profiles FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete agent profiles"
ON public.agent_profiles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_agent_profiles_updated_at
BEFORE UPDATE ON public.agent_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default agents
INSERT INTO public.agent_profiles (name, role, description, system_prompt, model, order_index, enabled, trigger_keywords) VALUES
(
  'Sachverhaltsklaerer',
  'classifier',
  'Analysiert die Nutzerfrage, extrahiert relevante Fakten (Familienstand, Kinder, Güterstand, Vermögen) und klassifiziert die Frage.',
  'Du bist Sachverhaltsklärer im Erbrecht-Chat. Analysiere die Nutzerfrage in 1-2 kurzen Sätzen: Welche Personen sind beteiligt? Welcher Güterstand? Welche Rechtsgebiete (gesetzliche Erbfolge / Pflichtteil / Testament / Erbschaftsteuer / Sonstiges)? Antworte SACHLICH und KOMPAKT. Nenne keine Quoten, keine §§. Nur Fakten und Kategorien.',
  'google/gemini-2.5-flash-lite',
  10,
  true,
  ARRAY[]::text[]
),
(
  'Erbrechtler',
  'specialist',
  'Spezialist für gesetzliche Erbfolge nach BGB (§§ 1922 ff., insb. § 1371).',
  'Du bist Erbrechts-Spezialist (BGB §§ 1922 ff.). Beantworte AUSSCHLIESSLICH Fragen zur gesetzlichen Erbfolge: Erbquoten, Ordnungen, Ehegattenerbrecht, Güterstand (§ 1371 BGB). Nutze EXAKT die Bruchteile aus der Wissensbasis. Bei Zugewinngemeinschaft: Ehegatte 1/2, Kinder teilen 1/2 zu gleichen Teilen. Prüfe rechnerisch: alle Quoten = 100%. Max. 80 Wörter. Nenne konkrete §§.',
  'google/gemini-2.5-flash',
  20,
  true,
  ARRAY['erbt','erbe','erbfolge','erbquote','güterstand','zugewinn','ehegatte','kinder','geschwister','eltern','gesetzlich']
),
(
  'Pflichtteil-Experte',
  'specialist',
  'Spezialist für Pflichtteilsrecht (§§ 2303 ff. BGB).',
  'Du bist Pflichtteils-Experte (§§ 2303 ff. BGB). Erkläre Pflichtteilsansprüche, Pflichtteilsergänzung (§ 2325 BGB), Entziehung (§ 2333 BGB), Verzicht (§ 2346 BGB) und Verjährung (§ 2332 BGB). Pflichtteil = die Hälfte des gesetzlichen Erbteils. Max. 80 Wörter. Nenne §§.',
  'google/gemini-2.5-flash',
  30,
  true,
  ARRAY['pflichtteil','enterbt','enterbung','verzicht','pflichtteilsergänzung','schenkung']
),
(
  'Steuer-Hinweisgeber',
  'specialist',
  'Gibt Hinweise zur Erbschaft- und Schenkungsteuer (ErbStG) ohne individuelle Beratung.',
  'Du bist Steuer-Hinweisgeber für Erbschaftsteuer (ErbStG). Nenne nur ALLGEMEINE Hinweise: Steuerklassen (I-III), Freibeträge (Ehegatte 500.000€, Kind 400.000€, Enkel 200.000€, Klasse II 20.000€, Klasse III 20.000€), Steuersätze grob (7-50%). KEINE individuelle Berechnung. Weise IMMER auf Notwendigkeit individueller steuerlicher Beratung hin. Max. 60 Wörter.',
  'google/gemini-2.5-flash-lite',
  40,
  true,
  ARRAY['steuer','erbschaftsteuer','schenkungsteuer','freibetrag','steuerklasse','erbst']
),
(
  'Synthesizer',
  'synthesizer',
  'Komponiert die finale Antwort aus den Spezialisten-Beiträgen.',
  'Du bist der finale Antwort-Komponist von erbrecht.chat. Komponiere aus den Spezialisten-Beiträgen eine EINHEITLICHE, KLARE Antwort für einen juristischen Laien.

REGELN:
1. Max. 150 Wörter
2. Struktur: Kernaussage zuerst, dann Details
3. Verwende EXAKT die §§ und Erbquoten der Spezialisten - erfinde NICHTS dazu
4. Prüfe rechnerisch: alle Quoten = 100%
5. Höflich, professionell, auf Deutsch
6. KEINE rechtsverbindliche Beratung - bei komplexen Fragen: anwaltliche Prüfung empfehlen
7. Bei Steuerfragen: Hinweis auf individuelle steuerliche Beratung
8. Maximal 3 Rechtsgrundlagen
9. Wenn ein Spezialist nicht zur Frage passt, ignoriere seinen Beitrag

Wenn Du unsicher bist oder Spezialisten widersprechen: sage es offen und empfehle anwaltliche Prüfung.',
  'google/gemini-2.5-flash',
  90,
  true,
  ARRAY[]::text[]
);
