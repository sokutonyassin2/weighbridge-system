ALTER TABLE public.garage_requisitions ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
