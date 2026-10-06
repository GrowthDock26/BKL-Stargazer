-- Precedent Board: aggregate anonymized recurring user questions
CREATE TABLE public.precedent_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_hash TEXT NOT NULL UNIQUE,
  question_sample TEXT NOT NULL,
  topic TEXT,
  classification TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_precedent_count ON public.precedent_questions (count DESC);
CREATE INDEX idx_precedent_topic ON public.precedent_questions (topic);

ALTER TABLE public.precedent_questions ENABLE ROW LEVEL SECURITY;

-- Only admins can read or manage the precedent board (contains aggregated user input)
CREATE POLICY "Only admins can view precedent questions"
ON public.precedent_questions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete precedent questions"
ON public.precedent_questions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Writes happen only via the edge function (service role bypasses RLS); no policy needed for inserts/updates.

-- RPC for atomic upsert+increment from the edge function (called with service role)
CREATE OR REPLACE FUNCTION public.record_precedent_question(
  _hash TEXT,
  _sample TEXT,
  _topic TEXT,
  _classification TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.precedent_questions (question_hash, question_sample, topic, classification)
  VALUES (_hash, _sample, _topic, _classification)
  ON CONFLICT (question_hash) DO UPDATE
    SET count = public.precedent_questions.count + 1,
        last_seen = now(),
        topic = COALESCE(EXCLUDED.topic, public.precedent_questions.topic),
        classification = COALESCE(EXCLUDED.classification, public.precedent_questions.classification);
END;
$$;