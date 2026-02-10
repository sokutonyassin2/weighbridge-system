-- 🚚 TRIP INFRASTRUCTURE FIX
-- This script ensures all columns and storage are ready for Trip Planning

-- 1. Ensure Missing Columns Exist
ALTER TABLE logistics_trips 
ADD COLUMN IF NOT EXISTS starting_km NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS trip_allowance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS fuel_liters NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS fuel_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS closing_km NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_fuel_liters NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS actual_fuel_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS pod_url TEXT;

-- Ensure cargo_inbound exists (added safety check)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistics_trips' AND column_name='cargo_inbound') THEN
        ALTER TABLE logistics_trips ADD COLUMN cargo_inbound TEXT;
    END IF;
END $$;

-- 2. Storage Bucket for PODs
-- Run this in the SQL Editor to ensure the bucket is ready
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-pods', 'trip-pods', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public access to read PODs
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public Read Access') THEN
        CREATE POLICY "Public Read Access" ON storage.objects FOR SELECT USING ( bucket_id = 'trip-pods' );
    END IF;
END $$;

-- Allow authenticated users to upload PODs
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Upload Access') THEN
        CREATE POLICY "Authenticated Upload Access" ON storage.objects FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'trip-pods' );
    END IF;
END $$;

-- Update comments
COMMENT ON COLUMN logistics_trips.cargo_inbound IS 'Description of cargo carried on the return journey';
COMMENT ON COLUMN logistics_trips.pod_url IS 'URL to the uploaded Proof of Delivery document';
