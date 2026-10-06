-- Security Fix: Implement User-Specific Chat Privacy

-- Step 1: Delete existing anonymous messages (if any)
DELETE FROM public.chat_messages WHERE user_id IS NULL;

-- Step 2: Make user_id NOT NULL
ALTER TABLE public.chat_messages 
ALTER COLUMN user_id SET NOT NULL;

-- Step 3: Drop existing overly permissive RLS policies
DROP POLICY IF EXISTS "Anyone can view chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_messages;

-- Step 4: Create secure user-specific RLS policies
CREATE POLICY "Users can view only their own messages" 
ON public.chat_messages 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert only their own messages" 
ON public.chat_messages 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Step 5: Update delete policy to be more explicit
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.chat_messages;

CREATE POLICY "Users can delete only their own messages" 
ON public.chat_messages 
FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- Step 6: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);