-- Replicate AdminCompanyWeights.tsx logic exactly for Feb 19th
-- assuming the user is in EAT (+03:00)

-- 1. Check current timezone to be sure
SHOW TIMEZONE;

-- 2. Run the query with the exact strings
SELECT 
    id,
    wb_number,
    vehicle_no,
    category,
    entry_time
FROM vehicle_entries
WHERE category IN ('MV-Company', 'MV-PublicSeller', 'MV-Supplier')
  AND entry_time >= '2026-02-19T00:00:00.000+03:00'
  AND entry_time <= '2026-02-19T23:59:59.999+03:00'
ORDER BY entry_time DESC;

-- 3. If that's empty, try a wider range to see where they are
SELECT 
    vehicle_no, 
    category, 
    entry_time AT TIME ZONE 'UTC' as utc_time,
    entry_time AT TIME ZONE 'Africa/Nairobi' as local_time -- Most likely EAT
FROM vehicle_entries
WHERE vehicle_no = 'T511ENG';
