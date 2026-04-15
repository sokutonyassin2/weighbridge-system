-- TRANSIT TRACKING SCHEMA
-- Specialized for Polytra-style long-haul tracking

CREATE TABLE IF NOT EXISTS logistics_transit_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core IDs
    sn SERIAL,
    truck_no TEXT NOT NULL,
    trailer_no TEXT,
    trip_id TEXT UNIQUE NOT NULL, -- T980/2025/G001
    
    -- Driver Info
    driver_name TEXT,
    license_no TEXT,
    passport_no TEXT,
    contact_no TEXT,
    
    -- Trip Details
    location TEXT,
    bl_number TEXT,
    container_no TEXT,
    cargo TEXT,
    status TEXT, -- Loading, In Transit, Border, etc.
    destination TEXT,
    
    -- Milestone Dates
    arrival_loading_date DATE,
    loading_date DATE,
    dispatch_date DATE,
    
    -- Tunduma Border
    tunduma_arrival_date DATE,
    tunduma_departure_date DATE,
    days_at_tunduma INTEGER, -- Can be calculated but Excel stores it
    
    -- Crossing
    crossing_date DATE,
    
    -- Nakonde Border
    nakonde_arrival_date DATE,
    nakonde_departure_date DATE,
    days_at_nakonde INTEGER,
    
    -- Offloading
    standing_charges DECIMAL(10,2) DEFAULT 0,
    arrive_offloading_site_date DATE,
    offloading_date DATE,
    
    -- Tracking
    todays_date DATE DEFAULT CURRENT_DATE,
    total_trip_days INTEGER,
    
    -- Internal Meta
    is_tanker BOOLEAN DEFAULT FALSE,
    leg_type CHAR(1) CHECK (leg_type IN ('G', 'R')), -- G for Outbound, R for Return
    sequence_no INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logistics_transit_trip_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID REFERENCES logistics_transit_trips(id) ON DELETE CASCADE,
    
    -- Financial details (Simplified for initial version)
    total_revenue DECIMAL(15,2) DEFAULT 0,
    total_expenses DECIMAL(15,2) DEFAULT 0,
    net_profit DECIMAL(15,2) DEFAULT 0,
    
    -- Details JSON for flexibility
    details JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE logistics_transit_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_transit_trip_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access for authenticated" ON logistics_transit_trips FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Access for authenticated" ON logistics_transit_trip_sheets FOR ALL USING (auth.role() = 'authenticated');
