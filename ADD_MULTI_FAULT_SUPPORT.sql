-- SUPPORT FOR MULTIPLE FAULTS PER JOB CARD
-- This migration allows us to track individual repairs within a single job.

-- 1. Create the granular faults table
CREATE TABLE IF NOT EXISTS public.garage_job_faults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.garage_job_cards(id) ON DELETE CASCADE,
    fault_type_id UUID REFERENCES public.garage_fault_types(id),
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Partially Fixed')),
    mechanic_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.garage_job_faults ENABLE ROW LEVEL SECURITY;

-- 3. Policies
-- Check if policy exists before creating to avoid errors on re-run
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Full Access Faults' AND tablename = 'garage_job_faults') THEN
        CREATE POLICY "Full Access Faults" ON public.garage_job_faults FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- 4. Index for performance
CREATE INDEX IF NOT EXISTS idx_job_faults_job_id ON public.garage_job_faults(job_id);

COMMENT ON TABLE garage_job_faults IS 'Stores individual faults associated with a garage job card for granular tracking.';
