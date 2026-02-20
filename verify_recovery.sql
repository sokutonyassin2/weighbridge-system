-- 1. Check T511ENG specifically
SELECT vehicle_no, category, status, entry_time,
       (SELECT type_name FROM vehicle_types WHERE id = vehicle_type_id) as type_name
FROM vehicle_entries 
WHERE vehicle_no = 'T511ENG';

-- 2. Check today's summary for Company Weights
SELECT category, count(*) 
FROM vehicle_entries 
WHERE entry_time >= CURRENT_DATE 
  AND category IN ('MV-Company', 'MV-PublicSeller', 'MV-Supplier')
GROUP BY category;

-- 3. Check for any records still stuck with NULL vehicle_type_id
SELECT vehicle_no, category 
FROM vehicle_entries 
WHERE vehicle_type_id IS NULL 
  AND category IN ('MV-Company', 'MV-PublicSeller', 'MV-Supplier');
