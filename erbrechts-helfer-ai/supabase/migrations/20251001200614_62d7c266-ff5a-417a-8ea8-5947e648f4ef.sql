-- Drop existing restrictive policies on chat_messages
DROP POLICY IF EXISTS "Users can view their own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can insert their own messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.chat_messages;

-- Allow anyone to read chat messages
CREATE POLICY "Anyone can view chat messages"
ON public.chat_messages
FOR SELECT
USING (true);

-- Allow anyone to insert chat messages (anonymous or authenticated)
CREATE POLICY "Anyone can insert chat messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (true);

-- Only allow users to delete their own messages (if authenticated)
CREATE POLICY "Users can delete their own messages"
ON public.chat_messages
FOR DELETE
USING (auth.uid() = user_id OR user_id IS NULL);

-- Update knowledge_documents policies to allow anonymous reading
DROP POLICY IF EXISTS "All authenticated users can read documents" ON public.knowledge_documents;

CREATE POLICY "Anyone can read documents"
ON public.knowledge_documents
FOR SELECT
USING (true);