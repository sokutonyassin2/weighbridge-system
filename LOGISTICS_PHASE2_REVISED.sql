-- REVISED LOGISTICS OPTIMIZATION PHASE 2 SCHEMA (v3)
-- Addressing dynamic licenses and manual maintenance tracking

-- 1. Dynamic Document Types Registry
CREATE TABLE IF NOT EXISTS public.logistics_document_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Driver', 'Vehicle', 'Trailer', 'General')),
    is_mandatory BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Initial Seed for Document Types
INSERT INTO public.logistics_document_types (name, category, is_mandatory) VALUES
('Driving License', 'Driver', true),
('Passport', 'Driver', false),
('Dangerous Goods', 'Driver', false),
('Vehicle Insurance', 'Vehicle', true),
('Road Tax', 'Vehicle', true),
('LATRA Permit', 'Vehicle', true)
ON CONFLICT DO NOTHING;

-- 2. Fleet Document Tracking
CREATE TABLE IF NOT EXISTS public.logistics_fleet_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fleet_id UUID REFERENCES public.logistics_fleet(id) ON DELETE CASCADE,
    document_type_id UUID REFERENCES public.logistics_document_types(id),
    document_type_name TEXT, -- Fallback/Custom type
    document_url TEXT NOT NULL,
    expiry_date DATE,
    is_mandatory BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Maintenance & Odometer Tracking for Fleet
ALTER TABLE public.logistics_fleet
ADD COLUMN IF NOT EXISTS current_odometer NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_service_odometer NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_service_odometer NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_service_date DATE;

-- 4. Update Driver Documents for Consistency
ALTER TABLE public.logistics_driver_documents
ADD COLUMN IF NOT EXISTS document_type_id UUID REFERENCES public.logistics_document_types(id);
