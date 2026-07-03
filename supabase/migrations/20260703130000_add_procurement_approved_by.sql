ALTER TABLE public.garage_requisitions ADD COLUMN IF NOT EXISTS procurement_approved_by UUID REFERENCES auth.users(id);
