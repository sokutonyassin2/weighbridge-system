ALTER TABLE public.garage_requisitions 
ADD COLUMN IF NOT EXISTS requirement_category TEXT DEFAULT 'Uncategorized';

UPDATE public.garage_requisitions 
SET requirement_category = 'Uncategorized' 
WHERE request_type = 'Job' AND requirement_category IS NULL;
