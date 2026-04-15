-- ============================================================
-- ADD CLIENT NAME FOR AUTOMATIC GROUPING
-- Run this in your Supabase SQL Editor to enable grouping by Client.
-- ============================================================

-- 1. Add client_name to Trip Sheets (Approvals)
ALTER TABLE public.logistics_trip_sheets
ADD COLUMN IF NOT EXISTS client_name TEXT DEFAULT NULL;

-- 2. Add client_name to Transit Trips (Tracking)
ALTER TABLE public.logistics_transit_trips
ADD COLUMN IF NOT EXISTS client_name TEXT DEFAULT NULL;

-- 3. Update the summary view if necessary or just reload schema
-- (We'll use these columns primarily for grouping in the frontend lists)

NOTIFY pgrst, 'reload schema';
