-- LOGISTICS OPTIMIZATION PHASE 2 SCHEMA
-- Enhances trips with POD and fleet with maintenance tracking

-- 1. Support for Proof of Delivery (POD)
ALTER TABLE public.logistics_trips 
ADD COLUMN IF NOT EXISTS pod_url TEXT,
ADD COLUMN IF NOT EXISTS pod_uploaded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS arrived_at_destination_at TIMESTAMP WITH TIME ZONE;

-- 2. Preventative Maintenance for Fleet
ALTER TABLE public.logistics_fleet
ADD COLUMN IF NOT EXISTS next_service_km NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_service_date DATE,
ADD COLUMN IF NOT EXISTS service_interval_km NUMERIC DEFAULT 10000;

-- 3. Storage Bucket Configuration (Manual Step Reminder)
-- Ensure 'trip-docs' bucket exists in Supabase Storage.
-- Policy for bucket: Allow authenticated users to upload and read.
