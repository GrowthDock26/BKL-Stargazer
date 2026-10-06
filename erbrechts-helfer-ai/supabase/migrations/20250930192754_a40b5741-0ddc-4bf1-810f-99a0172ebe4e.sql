-- Funktion für Volltextsuche mit sicherem search_path
CREATE OR REPLACE FUNCTION public.search_knowledge_documents(search_query TEXT, limit_count INT DEFAULT 5)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  relevance REAL
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kd.id,
    kd.title,
    kd.content,
    kd.category,
    ts_rank(kd.search_vector, websearch_to_tsquery('german', search_query)) as relevance
  FROM public.knowledge_documents kd
  WHERE kd.search_vector @@ websearch_to_tsquery('german', search_query)
  ORDER BY relevance DESC
  LIMIT limit_count;
END;
$$;

-- Funktion für updated_at Trigger mit sicherem search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;