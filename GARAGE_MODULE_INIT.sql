-- GARAGE & MAINTENANCE MODULE SCHEMA
-- Implements isolated fault logging, inventory management, and job cards.

-- 1. DYNAMIC FAULT TYPES (Managed by Garage Admin)
CREATE TABLE IF NOT EXISTS garage_fault_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- e.g., 'Engine', 'Tyres', 'Body', 'Electrical'
    fault_name TEXT NOT NULL, -- e.g., 'Overheating', 'Puncture', 'Broken Mirror'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed some initial common faults (Optional, but helpful)
INSERT INTO garage_fault_types (category, fault_name, description) VALUES
('Engine', 'Overheating', 'Engine temperature exceeds normal limits'),
('Engine', 'Oil Leak', 'Visible oil leaking from engine block'),
('Tyres', 'Puncture', 'Flat tyre requiring repair or replacement'),
('Tyres', 'Worn Tread', 'Tyre tread below legal limit'),
('Brakes', 'Brake Pads Worn', 'Brake pads require replacement'),
('Electrical', 'Headlight Failure', 'Headlight bulb or wiring issue'),
('Body', 'Broken Mirror', 'Side mirror damaged or missing'),
('Body', 'Dent/Scratch', 'Visible bodywork damage')
ON CONFLICT DO NOTHING;

-- 2. GARAGE INVENTORY (Spare Parts)
CREATE TABLE IF NOT EXISTS garage_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    part_name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    category TEXT, -- e.g., 'Filters', 'Tyres', 'Fluids'
    quantity_on_hand INTEGER DEFAULT 0,
    min_threshold INTEGER DEFAULT 5, -- Low stock alert level
    unit_cost NUMERIC DEFAULT 0,
    location TEXT, -- e.g., 'Shelf A1'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. GARAGE JOB CARDS (The Core Maintenance Record)
CREATE TABLE IF NOT EXISTS garage_job_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_number SERIAL, -- Auto-incrementing Job ID (e.g., 1001)
    vehicle_id UUID REFERENCES logistics_vehicles(id) NOT NULL, -- Link to Logistics Fleet
    status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Pending Verification', 'Closed')),
    priority TEXT DEFAULT 'Routine' CHECK (priority IN ('Routine', 'Urgent', 'Critical')),
    fault_type_id UUID REFERENCES garage_fault_types(id),
    description TEXT, -- Specific details from mechanic
    mechanic_id UUID REFERENCES auth.users(id),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    odometer_at_fault NUMERIC,
    
    -- Additional fields for analytics
    downtime_hours NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. JOB CARD PARTS (Parts used in a specific job)
CREATE TABLE IF NOT EXISTS garage_job_parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES garage_job_cards(id) ON DELETE CASCADE,
    part_id UUID REFERENCES garage_inventory(id),
    quantity_used INTEGER NOT NULL,
    cost_at_time NUMERIC, -- Snapshot of cost when used
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. UPDATE EXISTING FLEET TABLE (Duration Tracking)
-- Add a column to track WHEN the status changed, to calculate "Days in Garage"
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logistics_vehicles' AND column_name = 'status_changed_at') THEN
        ALTER TABLE logistics_vehicles ADD COLUMN status_changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- 6. SECURITY POLICIES (RLS)
ALTER TABLE garage_fault_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_job_parts ENABLE ROW LEVEL SECURITY;

-- Allow Authenticated Users (Logistics & Garage) to Views
CREATE POLICY "Authenticated Users Read Access" ON garage_fault_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated Users Read Access Inv" ON garage_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated Users Read Access Jobs" ON garage_job_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated Users Read Access Parts" ON garage_job_parts FOR SELECT TO authenticated USING (true);

-- Allow Mechanics/Admins full access (Simplified for now to authenticated, refined later if needed)
CREATE POLICY "Full Access Fault Types" ON garage_fault_types FOR ALL TO authenticated USING (true);
CREATE POLICY "Full Access Inventory" ON garage_inventory FOR ALL TO authenticated USING (true);
CREATE POLICY "Full Access Jobs" ON garage_job_cards FOR ALL TO authenticated USING (true);
CREATE POLICY "Full Access Parts" ON garage_job_parts FOR ALL TO authenticated USING (true);
