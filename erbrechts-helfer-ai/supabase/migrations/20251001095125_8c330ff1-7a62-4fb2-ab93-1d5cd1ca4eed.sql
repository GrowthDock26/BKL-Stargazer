-- Restrict knowledge_documents table to authenticated users only
-- This protects proprietary legal content from competitors

-- Drop existing public policies
DROP POLICY IF EXISTS "Dokumente sind öffentlich lesbar" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Dokumente können erstellt werden" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Dokumente können aktualisiert werden" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Dokumente können gelöscht werden" ON public.knowledge_documents;

-- Create new policies restricted to authenticated users
CREATE POLICY "Authenticated users can read documents" 
ON public.knowledge_documents 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create documents" 
ON public.knowledge_documents 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update documents" 
ON public.knowledge_documents 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete documents" 
ON public.knowledge_documents 
FOR DELETE 
TO authenticated
USING (true);