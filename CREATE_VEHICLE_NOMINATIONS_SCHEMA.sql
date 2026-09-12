-- =========================================================
-- LOGISTICS VEHICLE NOMINATION & GARAGE READINESS SCHEMA
-- =========================================================

CREATE TABLE IF NOT EXISTS public.logistics_vehicle_nominations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vehicle / Asset Details
    vehicle_id UUID REFERENCES public.logistics_fleet(id) ON DELETE CASCADE,
    truck_reg TEXT NOT NULL,
    trailer_id UUID REFERENCES public.logistics_fleet(id) ON DELETE SET NULL,
    trailer_reg TEXT,
    driver_id UUID REFERENCES public.logistics_drivers(id) ON DELETE SET NULL,
    driver_name TEXT,
    
    -- Planned Mission / Route Context
    target_destination TEXT,
    expected_departure_date DATE,
    cargo_type TEXT,
    logistics_notes TEXT,
    
    -- Who Nominated
    nominated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nominated_by_name TEXT,
    
    -- Nomination Lifecycle Status
    -- 'Pending Inspection', 'Cleared', 'Rejected', 'Conditional', 'Order Created', 'Cancelled'
    status TEXT DEFAULT 'Pending Inspection' CHECK (status IN ('Pending Inspection', 'Cleared', 'Rejected', 'Conditional', 'Order Created', 'Cancelled')),
    
    -- Garage Readiness Review
    -- 'Pending', 'Fit', 'Unfit', 'Conditional'
    garage_readiness TEXT DEFAULT 'Pending' CHECK (garage_readiness IN ('Pending', 'Fit', 'Unfit', 'Conditional')),
    garage_decision_notes TEXT,
    garage_fault_summary TEXT,
    estimated_readiness_date DATE,
    garage_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    garage_reviewed_by_name TEXT,
    garage_reviewed_at TIMESTAMPTZ,
    
    -- Related Trip Order if converted
    trip_order_id UUID REFERENCES public.logistics_trip_orders(id) ON DELETE SET NULL,
    trip_number TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_veh_nom_status ON public.logistics_vehicle_nominations(status);
CREATE INDEX IF NOT EXISTS idx_veh_nom_readiness ON public.logistics_vehicle_nominations(garage_readiness);
CREATE INDEX IF NOT EXISTS idx_veh_nom_vehicle_id ON public.logistics_vehicle_nominations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_veh_nom_created_at ON public.logistics_vehicle_nominations(created_at DESC);

-- Enable RLS
ALTER TABLE public.logistics_vehicle_nominations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.logistics_vehicle_nominations;
DROP POLICY IF EXISTS "Full access for authenticated users" ON public.logistics_vehicle_nominations;

-- Unified policy for authenticated staff
CREATE POLICY "Enable all access for authenticated users"
ON public.logistics_vehicle_nominations
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Enable Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'logistics_vehicle_nominations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.logistics_vehicle_nominations;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
