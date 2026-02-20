-- 1. Check for any records created recently
SELECT id, vehicle_no, category, entry_time, created_at
FROM vehicle_entries
ORDER BY created_at DESC
LIMIT 50;

-- 2. Check for records with suspicious entry_times
-- This will show if any were accidentally set to today
SELECT id, vehicle_no, entry_time, created_at
FROM vehicle_entries
WHERE entry_time >= CURRENT_DATE
ORDER BY entry_time DESC;

-- 3. Check for NULL or missing categories
SELECT category, count(*) 
FROM vehicle_entries 
GROUP BY category;
