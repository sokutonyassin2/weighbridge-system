-- RESTORE VEHICLE TYPES & FEES (EXPANDED)
-- Run this in Supabase SQL Editor

-- Clear existing types to avoid duplicates if any
TRUNCATE TABLE vehicle_types CASCADE;

INSERT INTO vehicle_types 
(type_name, description, category, first_weigh_fee, second_weigh_fee, is_time_sensitive, return_time_hours, requires_two_weighs) 
VALUES
-- 1. PAID CATEGORIES
('Public Seller', 'External seller vehicle paying standard rates', 'MV-PublicSeller', 20000, 10000, false, 0, true),
('Supplier', 'External supplier vehicle', 'MV-Supplier', 10000, 0, false, 0, true),
('JV Customer (Paid)', 'Joint Venture customer with payment terms', 'JV-Payment', 0, 0, true, 12, true),

-- 2. FREE CATEGORIES (Company & Internal)
('Company Truck', 'Internal company fleet vehicle', 'MV-Company', 0, 0, false, 0, true),
('Staff Vehicle', 'Personal vehicle of company staff', 'MV-Company', 0, 0, false, 0, true),
('Farm Tractor', 'Internal farm machinery', 'MV-Company', 0, 0, false, 0, false), -- Tractors might only weigh once?

-- 3. OTHER FREE CATEGORIES (Visitors, Govt, etc)
('JV Customer (Free)', 'Joint Venture customer (No Charge)', 'JV-Free', 0, 0, true, 12, true),
('Government / Official', 'Government or official vehicle', 'JV-Free', 0, 0, false, 0, true),
('Visitor / Consultant', 'Guest or consultant vehicle', 'JV-Free', 0, 0, false, 0, true),
('Emergency / Security', 'Ambulance, Fire, Police', 'JV-Free', 0, 0, false, 0, false),

-- 4. TRANSIT
('Transit Vehicle', 'Vehicle passing through (24h limit)', 'Transit', 0, 0, true, 24, true);

-- Verify insertion
SELECT type_name, category, first_weigh_fee FROM vehicle_types;
