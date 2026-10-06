-- Create table for chat messages
CREATE TABLE public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  verified boolean DEFAULT false,
  sources text[],
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own messages"
  ON public.chat_messages
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages"
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own messages"
  ON public.chat_messages
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_chat_messages_user_id ON public.chat_messages(user_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);