-- MASTER RESET & SETUP SCHEMA
-- WARNING: This will DELETE the "Commission" tables and RESET the Logistics/Weighbridge tables.
-- Run this in your Supabase SQL Editor.

-- 1. CLEANUP (Drop unwanted/old tables)
DROP TABLE IF EXISTS sales_rep_commission_rates CASCADE; -- Removing the commission stuff
DROP TABLE IF EXISTS commission_rates CASCADE; -- Just in case
DROP TABLE IF EXISTS sales_reps CASCADE;      -- Just in case

-- Resetting our tables to ensure they are 100% correct
DROP TABLE IF EXISTS logistics_trips CASCADE;
DROP TABLE IF EXISTS logistics_vehicles CASCADE;
DROP TABLE IF EXISTS logistics_drivers CASCADE;
DROP TABLE IF EXISTS logistics_vehicle_types CASCADE;
DROP TABLE IF EXISTS weigh_records CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS weighbridge_logs CASCADE;
DROP TABLE IF EXISTS pending_weighs CASCADE;
DROP TABLE IF EXISTS vehicle_entries CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS vehicle_types CASCADE;
DROP TABLE IF EXISTS overdue_vehicles_history CASCADE;
DROP TABLE IF EXISTS penalties CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
-- We leave 'profiles' and 'user_roles' so you don't delete your User Account
-- But we ensure the definitions are correct below.

-- 2. CREATE TYPES
DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('admin', 'operator', 'super_admin', 'logistics_admin', 'logistics_manager', 'mechanic', 'procurement_officer', 'staff');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('Pending', 'Paid', 'Overdue', 'Waived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE vehicle_category AS ENUM ('JV-Payment', 'JV-Free', 'Transit', 'MV-Company', 'MV-PublicSeller', 'MV-Supplier');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. WEIGHBRIDGE TABLES

-- Profiles (Users) - Created by Supabase Auth usually, but we ensure it exists
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    username TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Roles
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    UNIQUE(user_id, role)
);

-- Vehicle Types
CREATE TABLE IF NOT EXISTS vehicle_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name TEXT NOT NULL,
    description TEXT,
    category vehicle_category,
    first_weigh_fee NUMERIC,
    second_weigh_fee NUMERIC,
    is_time_sensitive BOOLEAN DEFAULT false,
    return_time_hours NUMERIC,
    requires_two_weighs BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_name TEXT NOT NULL,
    shift_date DATE NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    operator_id UUID REFERENCES auth.users(id),
    operator_name TEXT,
    signature_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vehicle Entries
CREATE TABLE IF NOT EXISTS vehicle_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_no TEXT NOT NULL,
    wb_number SERIAL,
    entry_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    vehicle_type_id UUID REFERENCES vehicle_types(id),
    driver_name TEXT,
    driver_contact TEXT,
    customer_farmer_name TEXT,
    item_name TEXT,
    source_destination TEXT,
    cargo_description TEXT,
    category vehicle_category,
    came_loaded BOOLEAN DEFAULT false,
    sent_for_weighing BOOLEAN DEFAULT false,
    can_complete_early BOOLEAN DEFAULT false,
    penalty_paid_entry BOOLEAN DEFAULT false,
    status TEXT,
    completed BOOLEAN DEFAULT false,
    shift_id UUID REFERENCES shifts(id),
    operator_id UUID REFERENCES auth.users(id),
    entered_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Weigh Records
CREATE TABLE IF NOT EXISTS weigh_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES vehicle_entries(id),
    weigh_number INTEGER,
    weigh_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    gross_weight NUMERIC,
    tare_weight NUMERIC,
    net_weight NUMERIC,
    trailer_weight NUMERIC,
    gvm NUMERIC,
    gtm NUMERIC,
    warning_flag BOOLEAN,
    exceedence_notes TEXT,
    photo_url TEXT,
    operator_id UUID REFERENCES auth.users(id),
    weighed_by TEXT,
    is_locked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES vehicle_entries(id),
    vehicle_no TEXT,
    payment_type TEXT,
    amount NUMERIC,
    penalty_fee NUMERIC,
    receipt_number TEXT,
    payment_status payment_status,
    cashier_id UUID REFERENCES auth.users(id),
    cashier_name TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    user_name TEXT,
    user_role app_role,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. LOGISTICS TABLES

-- Logistics Vehicle Types
CREATE TABLE IF NOT EXISTS logistics_vehicle_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO logistics_vehicle_types (name, description) VALUES 
('Horse', 'Prime Mover unit'),
('Trailer', 'Detachable cargo unit'),
('Rigid Truck', 'Single unit truck'),
('Light Vehicle', 'Pickup or Van')
ON CONFLICT (name) DO NOTHING;

-- Logistics Drivers
CREATE TABLE IF NOT EXISTS logistics_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    license_number TEXT UNIQUE NOT NULL,
    phone_primary TEXT NOT NULL,
    phone_secondary TEXT NOT NULL,
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'OnTrip', 'Suspended', 'Leave')),
    classification TEXT NOT NULL CHECK (classification IN ('Local', 'Transit')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Logistics Vehicles
CREATE TABLE IF NOT EXISTS logistics_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number TEXT UNIQUE NOT NULL,
    vehicle_type_id UUID REFERENCES logistics_vehicle_types(id),
    classification TEXT NOT NULL CHECK (classification IN ('Local', 'Transit')),
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Maintenance', 'OnTrip', 'Retired')),
    current_trailer_id UUID REFERENCES logistics_vehicles(id),
    current_driver_id UUID REFERENCES logistics_drivers(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Logistics Trips
CREATE TABLE IF NOT EXISTS logistics_trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_number SERIAL,
    vehicle_id UUID REFERENCES logistics_vehicles(id) NOT NULL,
    driver_id UUID REFERENCES logistics_drivers(id) NOT NULL,
    trailer_id UUID REFERENCES logistics_vehicles(id),
    departure_location TEXT NOT NULL,
    destination TEXT NOT NULL,
    cargo_going TEXT,
    cargo_returning TEXT,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expected_return TIMESTAMP WITH TIME ZONE,
    actual_return TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'Planned' CHECK (status IN ('Planned', 'Active', 'Completed', 'Cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. SECURITY & POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weigh_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_trips ENABLE ROW LEVEL SECURITY;

-- Re-apply policies (Dropping old ones first to be safe is implied by table drops)
CREATE POLICY "Public Profiles" ON profiles FOR ALL USING (true);
CREATE POLICY "Authenticated Users Full Access" ON vehicle_entries FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated Users Full Access WR" ON weigh_records FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Logistics Full Access" ON logistics_vehicles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Logistics Drivers Access" ON logistics_drivers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Logistics Trips Access" ON logistics_trips FOR ALL USING (auth.role() = 'authenticated');
