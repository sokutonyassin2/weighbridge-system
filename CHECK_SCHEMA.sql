-- Check columns in weigh_records
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'weigh_records';

-- Check data for WB-915
SELECT w.* 
FROM weigh_records w
JOIN vehicle_entries e ON w.entry_id = e.id
WHERE e.wb_number = 915;
