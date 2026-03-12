-- Check recent camera audit logs
SELECT id, timestamp, type, vehicle_no, photo_filename
FROM camera_audit_logs
ORDER BY timestamp DESC
LIMIT 10;

-- Check today's records specifically
SELECT count(*) 
FROM camera_audit_logs 
WHERE timestamp >= CURRENT_DATE 
  AND timestamp < CURRENT_DATE + interval '1 day';

-- Check vehicle entries for today
SELECT count(*)
FROM vehicle_entries
WHERE entry_time >= CURRENT_DATE
  AND entry_time < CURRENT_DATE + interval '1 day';
