-- Check for existing plate numbers similar to T 706 ACE
-- This will help identify if there's a duplicate or similar plate

-- 1. Check exact match
SELECT 
    id,
    plate_number,
    horse_number,
    trailer_number,
    vehicle_no,
    asset_type,
    is_merged,
    created_at
FROM logistics_registered_assets
WHERE plate_number = 'T 706 ACE'
   OR horse_number = 'T 706 ACE'
   OR trailer_number = 'T 706 ACE'
   OR vehicle_no = 'T 706 ACE';

-- 2. Check similar plates (case-insensitive, with/without spaces)
SELECT 
    id,
    plate_number,
    horse_number,
    trailer_number,
    vehicle_no,
    asset_type,
    is_merged,
    created_at
FROM logistics_registered_assets
WHERE UPPER(REPLACE(plate_number, ' ', '')) = 'T706ACE'
   OR UPPER(REPLACE(horse_number, ' ', '')) = 'T706ACE'
   OR UPPER(REPLACE(trailer_number, ' ', '')) = 'T706ACE'
   OR UPPER(REPLACE(vehicle_no, ' ', '')) = 'T706ACE';

-- 3. Check for T 705 ACE (the one user says exists)
SELECT 
    id,
    plate_number,
    horse_number,
    trailer_number,
    vehicle_no,
    asset_type,
    is_merged,
    created_at
FROM logistics_registered_assets
WHERE plate_number = 'T 705 ACE'
   OR horse_number = 'T 705 ACE'
   OR trailer_number = 'T 705 ACE'
   OR vehicle_no = 'T 705 ACE';

-- 4. Check all plates starting with 'T 7'
SELECT 
    id,
    plate_number,
    horse_number,
    trailer_number,
    vehicle_no,
    asset_type,
    is_merged,
    created_at
FROM logistics_registered_assets
WHERE plate_number LIKE 'T 7%'
   OR horse_number LIKE 'T 7%'
   OR trailer_number LIKE 'T 7%'
   OR vehicle_no LIKE 'T 7%'
ORDER BY plate_number, horse_number, trailer_number, vehicle_no;

-- 5. Check database constraints on the table
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'logistics_registered_assets'::regclass
  AND contype IN ('u', 'p'); -- unique and primary key constraints
