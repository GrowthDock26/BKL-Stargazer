-- Create an enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Drop existing overly permissive policies on knowledge_documents
DROP POLICY IF EXISTS "Authenticated users can create documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Authenticated users can read documents" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON public.knowledge_documents;

-- Create secure policies for knowledge_documents
-- All authenticated users can read documents (needed for chat functionality)
CREATE POLICY "All authenticated users can read documents"
ON public.knowledge_documents
FOR SELECT
TO authenticated
USING (true);

-- Only admins can insert documents
CREATE POLICY "Only admins can create documents"
ON public.knowledge_documents
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can update documents
CREATE POLICY "Only admins can update documents"
ON public.knowledge_documents
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete documents
CREATE POLICY "Only admins can delete documents"
ON public.knowledge_documents
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));