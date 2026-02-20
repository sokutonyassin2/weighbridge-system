-- 1. Where did the vehicles go? Check ALL records for the last 24 hours
SELECT id, vehicle_no, category, entry_time, created_at, item_name
FROM vehicle_entries 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY entry_time DESC;

-- 2. Check the counts per category again to see if they changed since the last run
SELECT category, count(*) 
FROM vehicle_entries 
GROUP BY category;

-- 3. Check if T511ENG is still there and what its category is
SELECT id, vehicle_no, category, entry_time
FROM vehicle_entries 
WHERE vehicle_no = 'T511ENG';
