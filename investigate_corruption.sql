-- 1. Check schema of vehicle_entries
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vehicle_entries';

-- 2. Check for records where entry_time might have been reset to today
-- We compare with the earliest weigh_record time which should be the truth
SELECT 
    e.id, 
    e.vehicle_no, 
    e.entry_time as current_entry_time, 
    e.created_at,
    (SELECT MIN(weigh_time) FROM weigh_records WHERE entry_id = e.id) as original_weigh_time
FROM vehicle_entries e
WHERE e.entry_time >= CURRENT_DATE
  AND EXISTS (SELECT 1 FROM weigh_records WHERE entry_id = e.id AND weigh_time < CURRENT_DATE)
LIMIT 50;
