-- Security Fix: Restrict Knowledge Documents Access to Authenticated Users Only

-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Anyone can read documents" ON public.knowledge_documents;

-- Create a new policy that requires authentication
CREATE POLICY "Authenticated users can read documents" 
ON public.knowledge_documents 
FOR SELECT 
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Note: Edge functions use service role key and bypass RLS, so they will continue to work
-- This protects proprietary legal content from unauthorized access