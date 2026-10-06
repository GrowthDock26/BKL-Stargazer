-- Tabelle für Wissensdokumente erstellen
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) <= 200),
  content TEXT NOT NULL CHECK (char_length(content) <= 50000),
  category TEXT CHECK (char_length(category) <= 100),
  tags TEXT[] CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 20),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('german', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('german', coalesce(category, '')), 'C')
  ) STORED
);

-- Index für Volltextsuche
CREATE INDEX IF NOT EXISTS knowledge_documents_search_idx ON public.knowledge_documents USING GIN (search_vector);

-- Index für Kategorie-Filter
CREATE INDEX IF NOT EXISTS knowledge_documents_category_idx ON public.knowledge_documents (category);

-- Enable Row Level Security
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Jeder kann Dokumente lesen (für KI-Zugriff)
DROP POLICY IF EXISTS "Dokumente sind öffentlich lesbar" ON public.knowledge_documents;
CREATE POLICY "Dokumente sind öffentlich lesbar" 
ON public.knowledge_documents 
FOR SELECT 
USING (true);

-- Policy: Jeder kann Dokumente erstellen (für Admin-Interface)
DROP POLICY IF EXISTS "Dokumente können erstellt werden" ON public.knowledge_documents;
CREATE POLICY "Dokumente können erstellt werden" 
ON public.knowledge_documents 
FOR INSERT 
WITH CHECK (true);

-- Policy: Jeder kann Dokumente aktualisieren
DROP POLICY IF EXISTS "Dokumente können aktualisiert werden" ON public.knowledge_documents;
CREATE POLICY "Dokumente können aktualisiert werden" 
ON public.knowledge_documents 
FOR UPDATE 
USING (true);

-- Policy: Jeder kann Dokumente löschen
DROP POLICY IF EXISTS "Dokumente können gelöscht werden" ON public.knowledge_documents;
CREATE POLICY "Dokumente können gelöscht werden" 
ON public.knowledge_documents 
FOR DELETE 
USING (true);

-- Funktion für Volltextsuche in deutschen Dokumenten
CREATE OR REPLACE FUNCTION public.search_knowledge_documents(search_query TEXT, limit_count INT DEFAULT 5)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  category TEXT,
  relevance REAL
) 
LANGUAGE plpgsql
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

-- Funktion für updated_at Trigger (falls nicht vorhanden)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger für updated_at
DROP TRIGGER IF EXISTS update_knowledge_documents_updated_at ON public.knowledge_documents;
CREATE TRIGGER update_knowledge_documents_updated_at
BEFORE UPDATE ON public.knowledge_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();