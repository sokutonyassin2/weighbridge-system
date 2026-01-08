-- Add signature_url column to shifts table for operator sign-off
ALTER TABLE public.shifts 
ADD COLUMN signature_url TEXT;