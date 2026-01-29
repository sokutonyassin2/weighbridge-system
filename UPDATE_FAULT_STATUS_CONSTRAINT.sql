-- UPDATE GARAGE FAULT STATUS CONSTRAINT
-- This migration adds support for granular repair tracking statuses

-- Drop the old constraint
ALTER TABLE public.garage_job_faults 
DROP CONSTRAINT IF EXISTS garage_job_faults_status_check;

-- Add the new constraint with all supported statuses
ALTER TABLE public.garage_job_faults 
ADD CONSTRAINT garage_job_faults_status_check 
CHECK (status IN ('Pending', 'In Progress', 'Partial', 'Not Repaired', 'Completed'));

-- Update any existing 'Partially Fixed' records to 'Partial' for consistency
UPDATE public.garage_job_faults 
SET status = 'Partial' 
WHERE status = 'Partially Fixed';

COMMENT ON COLUMN garage_job_faults.status IS 'Current repair status: Pending, In Progress, Partial (partially repaired), Not Repaired (deferred), or Completed';
