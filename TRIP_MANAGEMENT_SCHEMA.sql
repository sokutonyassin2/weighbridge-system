-- TRIP MANAGEMENT SCHEMA
-- Adds table for tracking vehicle trips and assignment history

CREATE TYPE trip_status AS ENUM (
    'Planned', 
    'Dispatched', 
    'In Transit',
    'At Destination', 
    'Returning', 
    'Completed', 
    'Cancelled'
);

CREATE TABLE IF NOT EXISTS logistics_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_number TEXT NOT NULL, -- e.g., TRP-2024-001
    
    -- Resources
    vehicle_id UUID REFERENCES logistics_fleet(id) NOT NULL,
    trailer_id UUID REFERENCES logistics_fleet(id), -- Optional
    driver_id UUID REFERENCES logistics_drivers(id) NOT NULL,
    
    -- Status & Workflow
    status trip_status NOT NULL DEFAULT 'Planned',
    
    -- Route Details
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    
    -- Cargo Details
    cargo_outbound TEXT, -- What IS going
    cargo_inbound TEXT,  -- What IS coming back
    
    -- Timestamps for TAT Calculation
    departure_date TIMESTAMPTZ,              -- Validated departure from origin
    arrival_destination_date TIMESTAMPTZ,    -- Arrived at destination
    return_trip_start_date TIMESTAMPTZ,      -- Started independent return journey
    completion_date TIMESTAMPTZ,             -- Back at base / Trip closed
    
    -- Calculated Durations (Stored for easy reporting)
    outbound_duration INTERVAL GENERATED ALWAYS AS (arrival_destination_date - departure_date) STORED,
    inbound_duration INTERVAL GENERATED ALWAYS AS (completion_date - return_trip_start_date) STORED,
    total_duration INTERVAL GENERATED ALWAYS AS (completion_date - departure_date) STORED,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    notes TEXT
);

-- Enable RLS
ALTER TABLE logistics_trips ENABLE ROW LEVEL SECURITY;

-- Allow authenticated access (simplified for now, strictly authenticated)
CREATE POLICY "Enable all access for authenticated users" ON logistics_trips
    FOR ALL USING (auth.role() = 'authenticated');

-- Trigger to update updated_at
CREATE TRIGGER update_logistics_trips_updated_at
    BEFORE UPDATE ON logistics_trips
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sequence for pretty trip numbers (TRP-0001)
CREATE SEQUENCE IF NOT EXISTS trip_number_seq;

CREATE OR REPLACE FUNCTION generate_trip_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.trip_number := 'TRP-' || to_char(now(), 'YY') || '-' || lpad(nextval('trip_number_seq')::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_trip_number
    BEFORE INSERT ON logistics_trips
    FOR EACH ROW
    WHEN (NEW.trip_number IS NULL)
    EXECUTE FUNCTION generate_trip_number();

-- Comment for clarity
COMMENT ON TABLE logistics_trips IS 'Tracks full lifecycle of vehicle trips including cargo and turn-around time.';
