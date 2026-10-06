-- Add restrictive RLS policies for user_roles table to prevent privilege escalation
-- These policies block any direct manipulation of roles by users

-- Policy to prevent users from inserting their own roles
CREATE POLICY "No direct role insertion"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Policy to prevent users from updating roles
CREATE POLICY "No direct role updates"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

-- Policy to prevent users from deleting roles
CREATE POLICY "No direct role deletion"
ON public.user_roles
FOR DELETE
TO authenticated
USING (false);