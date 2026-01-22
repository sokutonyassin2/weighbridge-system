-- TRIP FULL RESET SCRIPT
-- WARNING: This will delete any existing trip data to ensure the schema is correct.
-- Use this to resolve persistent "column not found" errors.

-- 1. Drop existing objects to start fresh
DROP TABLE IF EXISTS logistics_trips CASCADE;
DROP TYPE IF EXISTS trip_status CASCADE;

-- 2. Re-create Enum
CREATE TYPE trip_status AS ENUM (
    'Planned', 
    'Dispatched', 
    'In Transit',
    'At Destination', 
    'Returning', 
    'Completed', 
    'Cancelled'
);

-- 3. Re-create Table with ALL columns
CREATE TABLE logistics_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_number TEXT NOT NULL,
    
    -- Resources
    vehicle_id UUID REFERENCES logistics_fleet(id) NOT NULL,
    trailer_id UUID REFERENCES logistics_fleet(id),
    driver_id UUID REFERENCES logistics_drivers(id) NOT NULL,
    
    -- Status
    status trip_status NOT NULL DEFAULT 'Planned',
    
    -- Route (The columns that were missing)
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    
    -- Cargo
    cargo_outbound TEXT,
    cargo_inbound TEXT,
    
    -- Timestamps
    departure_date TIMESTAMPTZ,
    arrival_destination_date TIMESTAMPTZ,
    return_trip_start_date TIMESTAMPTZ,
    completion_date TIMESTAMPTZ,
    
    -- Generated Durations
    outbound_duration INTERVAL GENERATED ALWAYS AS (arrival_destination_date - departure_date) STORED,
    inbound_duration INTERVAL GENERATED ALWAYS AS (completion_date - return_trip_start_date) STORED,
    total_duration INTERVAL GENERATED ALWAYS AS (completion_date - departure_date) STORED,
    
    -- Meta
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    notes TEXT
);

-- 4. Enable Security
ALTER TABLE logistics_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for authenticated users" ON logistics_trips
    FOR ALL USING (auth.role() = 'authenticated');

-- 5. Triggers
CREATE TRIGGER update_logistics_trips_updated_at
    BEFORE UPDATE ON logistics_trips
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_trip_number
    BEFORE INSERT ON logistics_trips
    FOR EACH ROW
    WHEN (NEW.trip_number IS NULL)
    EXECUTE FUNCTION generate_trip_number();

-- 6. FORCE REFRESH
NOTIFY pgrst, 'reload schema';
