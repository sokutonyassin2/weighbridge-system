ALTER TABLE public.garage_requisitions ADD COLUMN IF NOT EXISTS requirement_category TEXT DEFAULT 'Uncategorized'; 
