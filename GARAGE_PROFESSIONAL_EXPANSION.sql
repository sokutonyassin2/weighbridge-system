-- GARAGE PROFESSIONAL EXPANSION SCHEMA
-- This migration adds Mechanic Allocation, PPM, and Parts Investment Tracking

-- 1. Create Service Packages for Preventative Maintenance (PPM)
CREATE TABLE IF NOT EXISTS public.garage_service_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_name TEXT NOT NULL UNIQUE, -- e.g., 'A-Service (Engine Oil & Filters)', 'B-Service (Brakes & Suspension)'
    category TEXT CHECK (category IN ('Routine', 'Major', 'Safety', 'Hydraulic')),
    recommended_interval TEXT, -- e.g., '10,000km' or '3 Months'
    base_items JSONB, -- Array of items typically required
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed some standard packages
INSERT INTO public.garage_service_packages (package_name, category, recommended_interval, base_items, description) VALUES
('Lubrication Service (Minor)', 'Routine', '10,000km', '["Engine Oil", "Oil Filter", "Fuel Filter"]', 'Standard oil and filter change'),
('Major Service (Horse)', 'Major', '40,000km', '["Engine Oil", "Oil Filter", "Fuel Filter", "Air Filter", "Gearbox Oil", "Diff Oil"]', 'Comprehensive powertrain maintenance'),
('Brake Overhaul', 'Safety', '6 Months', '["Brake Pads", "Brake Lining", "Brake Fluid"]', 'Full inspection and replacement of brake components'),
('Trailer Hydraulic Service', 'Hydraulic', '6 Months', '["Hydraulic Oil", "Seals", "Check Valves"]', 'Maintenance of trailer hydraulic systems')
ON CONFLICT (package_name) DO NOTHING;

-- 2. Add Mechanic Allocation and Quality Check to Job Cards/Faults
ALTER TABLE public.garage_job_faults 
ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES public.garage_personnel(id);

ALTER TABLE public.garage_job_cards
ADD COLUMN IF NOT EXISTS quality_check JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS total_parts_investment NUMERIC DEFAULT 0;

-- 3. Enable RLS
ALTER TABLE public.garage_service_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Full Access Service Packages" ON public.garage_service_packages;
CREATE POLICY "Full Access Service Packages" ON public.garage_service_packages FOR ALL TO authenticated USING (true);

-- 4. Create View for Vehicle Parts Investment Analysis
CREATE OR REPLACE VIEW public.vehicle_parts_investment_analytics AS
SELECT 
    lf.id as vehicle_id,
    lf.vehicle_no,
    lf.horse_number,
    lf.trailer_number,
    COALESCE(SUM(gjc.total_parts_investment), 0) as total_lifetime_investment,
    COUNT(gjc.id) as total_jobs_count,
    MAX(gjc.closed_at) as last_maintenance_date
FROM public.logistics_fleet lf
LEFT JOIN public.garage_job_cards gjc ON lf.id = gjc.vehicle_id AND gjc.status = 'Closed'
GROUP BY lf.id;

-- 5. Create Dynamic Quality Check Definitions
CREATE TABLE IF NOT EXISTS public.garage_quality_check_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_key TEXT NOT NULL UNIQUE, -- e.g., 'repair_verified', 'test_drive_done'
    label TEXT NOT NULL, -- e.g., 'Repair Verification: All logged issues have been physically inspected and fixed.'
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed standard Quality Check items
INSERT INTO public.garage_quality_check_definitions (check_key, label, display_order) VALUES
('repair_verified', 'Repair Verification: All logged issues have been physically inspected and fixed.', 1),
('test_drive_done', 'Road Test: Vehicle has been driven and performs as expected.', 2),
('cleaning_done', 'Cleanliness: Repair area and vehicle interior are clean.', 3),
('fluids_checked', 'Final Inspection: All fluid levels (Oil, Water, Brake) are at optimal levels.', 4)
ON CONFLICT (check_key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.garage_quality_check_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Full Access Quality Check Definitions" ON public.garage_quality_check_definitions;
CREATE POLICY "Full Access Quality Check Definitions" ON public.garage_quality_check_definitions FOR ALL TO authenticated USING (true);

-- 6. Comments
COMMENT ON TABLE garage_service_packages IS 'Standard maintenance packages for preventative maintenance';
COMMENT ON COLUMN garage_job_faults.mechanic_id IS 'Link to the professional personnel registry';
COMMENT ON COLUMN garage_job_cards.quality_check IS 'Stores digital verification checklist answers';
COMMENT ON COLUMN garage_job_cards.total_parts_investment IS 'Cached sum of all parts costs used on this specific job card';
COMMENT ON TABLE garage_quality_check_definitions IS 'Definitions for the mandatory verification checklist items before release';
