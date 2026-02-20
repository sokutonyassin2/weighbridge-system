-- Check raw weights for T511ENG (WB-915)
SELECT 
    w.weigh_number, 
    w.gross_weight, 
    w.tare_weight, 
    w.gtm, 
    w.trailer_weight, 
    w.weigh_time
FROM weigh_records w
JOIN vehicle_entries e ON w.entry_id = e.id
WHERE e.vehicle_no = 'T511ENG'
ORDER BY w.weigh_time ASC;
