-- RESTORE EXACT VEHICLES FROM SCREENSHOTS
-- Run this in Supabase SQL Editor

-- 1. CLEANUP (Remove any partial data)
TRUNCATE TABLE vehicle_types CASCADE;

-- 2. INSERT EXACT DATA
INSERT INTO vehicle_types 
(type_name, category, first_weigh_fee, second_weigh_fee, return_time_hours, is_time_sensitive, requires_two_weighs) 
VALUES
-- Image 1
('Allyen', 'JV-Free', 0, 0, 0, false, true),
('Canter', 'JV-Payment', 10000, 0, 12, true, true),
('Company Supplier', 'MV-Supplier', 10000, 0, 0, false, true),
('Dawa', 'MV-Company', 0, 0, 0, false, true),
('Drew Drop', 'JV-Free', 0, 0, 0, false, true),
('Energy Oil', 'MV-Company', 0, 0, 0, false, true),

-- Image 2
('EnergyFeeds BT', 'MV-Company', 0, 0, 0, false, true),
('EnergyFeeds Client', 'MV-Company', 0, 0, 0, false, true),
('EnergyFeeds GT', 'MV-Company', 0, 0, 0, false, true),
('Fuso Single', 'JV-Payment', 15000, 0, 12, true, true),
('Fuso Tandam', 'JV-Payment', 15000, 0, 12, true, true),
('Infinity', 'JV-Free', 0, 0, 0, false, true),
('Kipisi Mende', 'JV-Payment', 15000, 0, 12, true, true),
('Limestone Tanga', 'MV-Company', 0, 0, 0, false, true),
('Mo Enterprises', 'JV-Free', 0, 0, 0, false, true),

-- Image 3 (Corrected Fees)
('Public Seller', 'MV-PublicSeller', 30000, 0, 0, false, true),
('Pulling', 'JV-Payment', 20000, 0, 12, true, true),
('Semi Trailer', 'JV-Payment', 20000, 0, 12, true, true),
('Transit', 'Transit', 20000, 0, 24, true, true);

-- Verify
SELECT type_name, category, first_weigh_fee FROM vehicle_types ORDER BY type_name;
