-- LOGISTICS MODULE INITIAL SCHEMA
-- Run this in Supabase SQL Editor

-- 1. VEHICLE TYPES ENUMS (If not already created by Weighbridge)
-- Note: Weighbridge uses 'vehicle_category' and 'vehicle_types' table.
-- Logistics needs more specific detail for company assets.

-- 2. LOGISTICS FLEET TABLE
CREATE TABLE IF NOT EXISTS logistics_fleet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_no TEXT UNIQUE NOT NULL,
    horse_number TEXT,
    trailer_number TEXT,
    make_model TEXT,
    asset_type TEXT NOT NULL, -- e.g., 'Truck', 'Trailer', 'Machine', 'Light Vehicle'
    fleet_category TEXT NOT NULL CHECK (fleet_category IN ('Transit', 'Local')), -- User specific: Transit or Local
    asset_status TEXT DEFAULT 'Active', -- e.g., 'Active', 'Breakdown', 'Maintenance', 'Off-duty'
    assignment_status TEXT DEFAULT 'Available', -- e.g., 'Available', 'Assigned'
    last_service_date DATE,
    odometer_reading NUMERIC,
    fuel_type TEXT,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure fleet_category column exists (in case table was created by an older version of this script)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistics_fleet' AND column_name='fleet_category') THEN
        ALTER TABLE logistics_fleet ADD COLUMN fleet_category TEXT NOT NULL DEFAULT 'Transit' CHECK (fleet_category IN ('Transit', 'Local'));
    END IF;
END $$;

-- 3. LOGISTICS DRIVERS TABLE
CREATE TABLE IF NOT EXISTS logistics_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    license_no TEXT UNIQUE,
    license_expiry DATE,
    phone_no TEXT,
    status TEXT DEFAULT 'Active', -- e.g., 'Active', 'On Leave', 'Suspended'
    assigned_vehicle_id UUID REFERENCES logistics_fleet(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. ENABLE RLS
ALTER TABLE logistics_fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_drivers ENABLE ROW LEVEL SECURITY;

-- Apply "Full Access" policies for authenticated users
DROP POLICY IF EXISTS "Auth Full Access" ON logistics_fleet;
CREATE POLICY "Auth Full Access" ON logistics_fleet FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Full Access" ON logistics_drivers;
CREATE POLICY "Auth Full Access" ON logistics_drivers FOR ALL USING (auth.role() = 'authenticated');

-- 5. FUNCTION TO UPDATE UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Safely handle triggers (PostgreSQL requires dropping before creating if they exist)
DROP TRIGGER IF EXISTS update_logistics_fleet_updated_at ON logistics_fleet;
CREATE TRIGGER update_logistics_fleet_updated_at BEFORE UPDATE ON logistics_fleet FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_logistics_drivers_updated_at ON logistics_drivers;
CREATE TRIGGER update_logistics_drivers_updated_at BEFORE UPDATE ON logistics_drivers FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Final Verification
SELECT 'LOGISTICS SCHEMA CREATED SUCCESSFULLY' as result;
