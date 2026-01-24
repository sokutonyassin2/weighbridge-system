-- ==============================================================================
-- COMPLIANCE CENTER STORAGE INITIALIZATION
-- Run this script in the Supabase SQL Editor to create the missing storage buckets.
-- ==============================================================================

-- 1. Create 'driver-documents' bucket (Public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-documents', 'driver-documents', true);

-- 2. Create 'fleet-documents' bucket (Public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fleet-documents', 'fleet-documents', true);

-- ==============================================================================
-- STORAGE POLICIES (Enable Access)
-- ==============================================================================

-- Policy: Allow public read access to driver-documents (Required for getPublicUrl)
CREATE POLICY "Public Read Driver Docs"
ON storage.objects FOR SELECT
USING ( bucket_id = 'driver-documents' );

-- Policy: Allow authenticated users to upload to driver-documents
CREATE POLICY "Authenticated Upload Driver Docs"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'driver-documents' AND auth.role() = 'authenticated' );

-- Policy: Allow authenticated users to delete from driver-documents
CREATE POLICY "Authenticated Delete Driver Docs"
ON storage.objects FOR DELETE
USING ( bucket_id = 'driver-documents' AND auth.role() = 'authenticated' );


-- Policy: Allow public read access to fleet-documents
CREATE POLICY "Public Read Fleet Docs"
ON storage.objects FOR SELECT
USING ( bucket_id = 'fleet-documents' );

-- Policy: Allow authenticated users to upload to fleet-documents
CREATE POLICY "Authenticated Upload Fleet Docs"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'fleet-documents' AND auth.role() = 'authenticated' );

-- Policy: Allow authenticated users to delete from fleet-documents
CREATE POLICY "Authenticated Delete Fleet Docs"
ON storage.objects FOR DELETE
USING ( bucket_id = 'fleet-documents' AND auth.role() = 'authenticated' );
