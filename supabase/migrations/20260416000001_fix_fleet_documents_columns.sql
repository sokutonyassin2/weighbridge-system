-- FIX: Add missing 'document_type' column to logistics_fleet_documents
-- Error: "Could not find the 'document_type' column of 'logistics_fleet_documents' in the schema cache"
--
-- The table was created with 'document_type_name' but the app saves 'document_type'.
-- This migration adds the correct column and migrates any existing data.
-- Run this in your Supabase SQL Editor.

-- 1. Add the 'document_type' column (TEXT) used by the frontend
ALTER TABLE public.logistics_fleet_documents
ADD COLUMN IF NOT EXISTS document_type TEXT;

-- 2. Backfill the new column from the old 'document_type_name' column (if any data exists)
UPDATE public.logistics_fleet_documents
SET document_type = document_type_name
WHERE document_type IS NULL AND document_type_name IS NOT NULL;

-- 3. (Optional but recommended) Also add 'document_type' column to logistics_driver_documents
--    if the same error occurs there for driver documents.
ALTER TABLE public.logistics_driver_documents
ADD COLUMN IF NOT EXISTS document_type TEXT;

-- 4. Verify: Check all columns are present
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logistics_fleet_documents'
  AND table_schema = 'public'
ORDER BY ordinal_position;
