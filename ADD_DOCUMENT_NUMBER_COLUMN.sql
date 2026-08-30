-- =========================================================================
-- FIX: ADD document_number TO logistics_driver_documents
-- =========================================================================

-- The table name in Supabase is "logistics_driver_documents" (not "driver_documents")

ALTER TABLE public.logistics_driver_documents 
ADD COLUMN IF NOT EXISTS document_number TEXT;

-- Also ensure license_no and passport_no exist on public.logistics_drivers
ALTER TABLE public.logistics_drivers 
ADD COLUMN IF NOT EXISTS license_no TEXT,
ADD COLUMN IF NOT EXISTS passport_no TEXT;
