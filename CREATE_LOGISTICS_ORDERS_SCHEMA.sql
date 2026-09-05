-- =========================================================
-- LOGISTICS TRIP ORDERS MASTER SCHEMA & APPROVAL PIPELINE
-- =========================================================

CREATE TABLE IF NOT EXISTS public.logistics_trip_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT,
    trip_number TEXT,
    client_name TEXT NOT NULL,
    agreed_amount_usd NUMERIC(15, 2) DEFAULT 0,
    agreed_client_rate NUMERIC(15, 4) DEFAULT 1.0,
    agreed_amount_local NUMERIC(15, 2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    
    -- Asset & Crew details
    vehicle_id UUID REFERENCES public.logistics_fleet(id) ON DELETE SET NULL,
    truck_reg TEXT NOT NULL,
    trailer_id UUID REFERENCES public.logistics_fleet(id) ON DELETE SET NULL,
    trailer_reg TEXT,
    driver_id UUID REFERENCES public.logistics_drivers(id) ON DELETE SET NULL,
    driver_name TEXT,
    contact_no TEXT,
    license_no TEXT,
    passport_no TEXT,
    
    -- Consignment & Route details
    origin TEXT DEFAULT 'DAR ES SALAAM',
    destination TEXT NOT NULL,
    agreed_days INTEGER DEFAULT 0,
    daily_penalty_fine NUMERIC(15, 2) DEFAULT 0,
    journey_type TEXT DEFAULT 'Go & Return (Full Cycle)',
    cargo_description TEXT,
    bl_number TEXT,
    container_no TEXT,
    notes TEXT,
    
    -- Status & Workflow
    status TEXT DEFAULT 'Pending Approval' CHECK (status IN ('Pending Approval', 'Approved', 'Rejected', 'Trip Sheet Created', 'In Transit', 'Completed', 'Cancelled')),
    rejection_reason TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_logistics_trip_orders_status ON public.logistics_trip_orders(status);
CREATE INDEX IF NOT EXISTS idx_logistics_trip_orders_client ON public.logistics_trip_orders(client_name);
CREATE INDEX IF NOT EXISTS idx_logistics_trip_orders_trip_num ON public.logistics_trip_orders(trip_number);
CREATE INDEX IF NOT EXISTS idx_logistics_trip_orders_vehicle ON public.logistics_trip_orders(vehicle_id);

-- Enable RLS
ALTER TABLE public.logistics_trip_orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.logistics_trip_orders;
DROP POLICY IF EXISTS "Auth Full Access" ON public.logistics_trip_orders;

-- Unified policy for authenticated users
CREATE POLICY "Auth Full Access" ON public.logistics_trip_orders
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_logistics_trip_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_orders_update ON public.logistics_trip_orders;
CREATE TRIGGER trg_trip_orders_update
    BEFORE UPDATE ON public.logistics_trip_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_logistics_trip_orders_updated_at();

-- Add order_id reference to logistics_trip_sheets if not present
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'logistics_trip_sheets' 
        AND column_name = 'order_id'
    ) THEN
        ALTER TABLE public.logistics_trip_sheets 
        ADD COLUMN order_id UUID REFERENCES public.logistics_trip_orders(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'logistics_trip_sheets' 
        AND column_name = 'client_agreed_rate'
    ) THEN
        ALTER TABLE public.logistics_trip_sheets 
        ADD COLUMN client_agreed_rate NUMERIC(15, 4);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'logistics_trip_sheets' 
        AND column_name = 'client_agreed_amount_usd'
    ) THEN
        ALTER TABLE public.logistics_trip_sheets 
        ADD COLUMN client_agreed_amount_usd NUMERIC(15, 2);
    END IF;
END $$;
