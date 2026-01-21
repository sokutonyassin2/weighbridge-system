-- LOGISTICS MODULE SCHEMA
-- Run this in your Supabase SQL Editor

-- 1. VEHICLE TYPES (Dynamic)
CREATE TABLE IF NOT EXISTS logistics_vehicle_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE, -- e.g., "Horse", "Trailer", "Pickup", "Tanker"
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed basic types
INSERT INTO logistics_vehicle_types (name, description) VALUES 
('Horse', 'Prime Mover unit'),
('Trailer', 'Detachable cargo unit'),
('Rigid Truck', 'Single unit truck'),
('Light Vehicle', 'Pickup or Van')
ON CONFLICT (name) DO NOTHING;

-- 2. DRIVERS
CREATE TABLE IF NOT EXISTS logistics_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    license_number TEXT UNIQUE NOT NULL,
    phone_primary TEXT NOT NULL,
    phone_secondary TEXT NOT NULL, -- Two numbers required
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'OnTrip', 'Suspended', 'Leave')),
    classification TEXT NOT NULL CHECK (classification IN ('Local', 'Transit')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. VEHICLES (Fleet Registry)
CREATE TABLE IF NOT EXISTS logistics_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number TEXT UNIQUE NOT NULL,
    vehicle_type_id UUID REFERENCES logistics_vehicle_types(id),
    
    -- Classification
    classification TEXT NOT NULL CHECK (classification IN ('Local', 'Transit')),
    
    -- Status
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Maintenance', 'OnTrip', 'Retired')),
    
    -- Coupling Logic (For Horses)
    current_trailer_id UUID REFERENCES logistics_vehicles(id), -- If this is a Horse, which trailer is hooked?
    
    -- Assignment
    current_driver_id UUID REFERENCES logistics_drivers(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TRIPS
CREATE TABLE IF NOT EXISTS logistics_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_number SERIAL, -- Auto-incrementing trip ID
    
    -- Assets
    vehicle_id UUID REFERENCES logistics_vehicles(id) NOT NULL,
    driver_id UUID REFERENCES logistics_drivers(id) NOT NULL,
    trailer_id UUID REFERENCES logistics_vehicles(id), -- Optional trailer
    
    -- Route
    departure_location TEXT NOT NULL,
    destination TEXT NOT NULL,
    
    -- Cargo
    cargo_going TEXT,
    cargo_returning TEXT,
    
    -- Timing
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expected_return TIMESTAMP WITH TIME ZONE,
    actual_return TIMESTAMP WITH TIME ZONE,
    
    -- Status Workflow
    status TEXT DEFAULT 'Planned' CHECK (status IN ('Planned', 'Active', 'Completed', 'Cancelled')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. RLS POLICIES (Security)
ALTER TABLE logistics_vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_trips ENABLE ROW LEVEL SECURITY;

-- Allow Logistics Staff and Super Admin to do everything
CREATE POLICY "Logistics Full Access" ON logistics_vehicles
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('logistics_admin', 'logistics_manager', 'super_admin'));

CREATE POLICY "Logistics Drivers Access" ON logistics_drivers
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('logistics_admin', 'logistics_manager', 'super_admin'));

CREATE POLICY "Logistics Trips Access" ON logistics_trips
    FOR ALL
    USING (auth.jwt() ->> 'role' IN ('logistics_admin', 'logistics_manager', 'super_admin'));
