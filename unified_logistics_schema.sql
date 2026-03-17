-- 🚚 UNIFIED LOGISTICS MODULE SCHEMA (v2.0)
-- Run this in your Supabase SQL Editor to create all required tables.

-- 1. FLEET REGISTRY
CREATE TABLE IF NOT EXISTS public.logistics_fleet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_no TEXT UNIQUE NOT NULL,
    horse_number TEXT,
    trailer_number TEXT,
    make_model TEXT,
    asset_type TEXT NOT NULL, -- e.g., 'Truck', 'Trailer', 'Machine'
    fleet_category TEXT NOT NULL CHECK (fleet_category IN ('Transit', 'Local')),
    asset_status TEXT DEFAULT 'Active', -- e.g., 'Active', 'Maintenance', 'Breakdown'
    is_active BOOLEAN DEFAULT true,
    primary_trailer_id UUID REFERENCES public.logistics_fleet(id) ON DELETE SET NULL, -- Default trailer for Trucks
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. DRIVERS REGISTRY
CREATE TABLE IF NOT EXISTS public.logistics_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    license_no TEXT UNIQUE,
    phone_no TEXT,
    status TEXT DEFAULT 'Active', -- e.g., 'Active', 'On Leave', 'Suspended'
    classification TEXT NOT NULL DEFAULT 'Transit' CHECK (classification IN ('Transit', 'Local')),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TRIP SHEETS (The Standalone Plan)
CREATE TABLE IF NOT EXISTS public.logistics_trip_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_number TEXT UNIQUE DEFAULT 'TRP-' || TO_CHAR(NOW(), 'YYYYMMDD-') || LPAD(nextval('logistics_trip_seq')::text, 4, '0'),
    
    -- Plan Details
    vehicle_id UUID REFERENCES public.logistics_fleet(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES public.logistics_drivers(id) ON DELETE SET NULL,
    trailer_id UUID REFERENCES public.logistics_fleet(id) ON DELETE SET NULL,
    origin TEXT DEFAULT 'Headquarters',
    destination TEXT NOT NULL,
    journey_type TEXT DEFAULT 'Go & Return' CHECK (journey_type IN ('Go Only', 'Go & Return', 'One Way')),
    cargo_outbound TEXT,
    cargo_returning TEXT,
    
    -- Financials (Multi-Currency)
    revenue_type TEXT CHECK (revenue_type IN ('With Fuel', 'Without Fuel')),
    revenue_amount NUMERIC DEFAULT 0,
    revenue_currency TEXT DEFAULT 'USD' CHECK (revenue_currency IN ('USD', 'TZS')),
    exchange_rate NUMERIC DEFAULT 2700, -- Rate for USD to TZS conversion
    fuel_amount NUMERIC DEFAULT 0, -- Static Fuel Cost in USD
    total_expenses_tzs NUMERIC DEFAULT 0,
    total_expenses_usd NUMERIC DEFAULT 0,
    net_profit_usd NUMERIC DEFAULT 0, -- Calculated in base currency
    
    -- Status
    status TEXT DEFAULT 'Planned' CHECK (status IN ('Planned', 'Active', 'Completed', 'Cancelled')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: Create sequence for trip numbers if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS logistics_trip_seq;

-- 4. TRIP EXPENSES (Detailed Breakdown)
CREATE TABLE IF NOT EXISTS public.logistics_trip_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_sheet_id UUID NOT NULL REFERENCES public.logistics_trip_sheets(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('TZ', 'Zambia', 'DRC', 'Fixed')),
    item_name TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'TZS' CHECK (currency IN ('USD', 'TZS')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. SECURITY (RLS)
ALTER TABLE public.logistics_fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_trip_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_trip_expenses ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (Admins/Managers) full access
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Auth Full Access" ON public.logistics_fleet;
    CREATE POLICY "Auth Full Access" ON public.logistics_fleet FOR ALL USING (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "Auth Full Access" ON public.logistics_drivers;
    CREATE POLICY "Auth Full Access" ON public.logistics_drivers FOR ALL USING (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "Auth Full Access" ON public.logistics_trip_sheets;
    CREATE POLICY "Auth Full Access" ON public.logistics_trip_sheets FOR ALL USING (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "Auth Full Access" ON public.logistics_trip_expenses;
    CREATE POLICY "Auth Full Access" ON public.logistics_trip_expenses FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN others THEN NULL;
END $$;

-- 7. AUTO-UPDATE TIMESTAMPS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trg_fleet_update ON logistics_fleet;
CREATE TRIGGER trg_fleet_update BEFORE UPDATE ON logistics_fleet FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trg_drivers_update ON logistics_drivers;
CREATE TRIGGER trg_drivers_update BEFORE UPDATE ON logistics_drivers FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sheets_update ON logistics_trip_sheets;
CREATE TRIGGER trg_sheets_update BEFORE UPDATE ON logistics_trip_sheets FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
