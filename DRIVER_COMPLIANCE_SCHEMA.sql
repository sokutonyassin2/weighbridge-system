-- DRIVER COMPLIANCE SCHEMA UPDATE
-- Enhances driver management with passport photos and document tracking

-- 1. Update logistics_drivers table
ALTER TABLE public.logistics_drivers 
ADD COLUMN IF NOT EXISTS passport_photo_url TEXT,
ADD COLUMN IF NOT EXISTS compliance_flagged BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS compliance_override_reason TEXT,
ADD COLUMN IF NOT EXISTS compliance_override_at TIMESTAMP WITH TIME ZONE;

-- 2. Create documents table for drivers
CREATE TABLE IF NOT EXISTS public.logistics_driver_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.logistics_drivers(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL, -- e.g., 'Driving License', 'Passport', 'Dangerous Goods'
    document_url TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.logistics_driver_documents ENABLE ROW LEVEL SECURITY;

-- Add RLS Policy (following project pattern)
CREATE POLICY "Allow public access for driver docs" ON public.logistics_driver_documents 
FOR ALL USING (true) WITH CHECK (true);

-- Add Index for performance
CREATE INDEX IF NOT EXISTS idx_driver_docs_driver_id ON logistics_driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_docs_expiry ON logistics_driver_documents(expiry_date);

-- 3. Storage Bucket Configuration (Manual Step Reminder)
-- Ensure 'driver-documents' bucket exists in Supabase Storage.
-- Policy for bucket: Allow authenticated users to upload and read.
