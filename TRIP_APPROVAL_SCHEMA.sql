-- ============================================================
-- TRIP SHEET APPROVAL SCHEMA UPDATE
-- Run this in your Supabase SQL Editor BEFORE deploying the new code.
-- ============================================================

-- 1. Add status column if it doesn't exist
ALTER TABLE public.logistics_trip_sheets
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Planned';

-- 2. Add approval tracking columns
ALTER TABLE public.logistics_trip_sheets
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_by_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 3. Update the status constraint to allow the 'Approved' intermediate state
ALTER TABLE public.logistics_trip_sheets
DROP CONSTRAINT IF EXISTS logistics_trip_sheets_status_check;

ALTER TABLE public.logistics_trip_sheets
ADD CONSTRAINT logistics_trip_sheets_status_check
CHECK (status IN ('Planned', 'Approved', 'Active', 'Completed', 'Cancelled'));

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
