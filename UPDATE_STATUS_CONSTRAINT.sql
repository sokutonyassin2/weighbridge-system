-- Drops the status check constraint to allow 'Paid', 'Partial', etc.
ALTER TABLE public.garage_requisitions 
DROP CONSTRAINT IF EXISTS garage_requisitions_status_check;
