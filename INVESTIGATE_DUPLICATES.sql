-- Investigation Query: Check duplicate weigh records for WB-539 and WB-565
SELECT 
    ve.wb_number, 
    ve.vehicle_no, 
    wr.id as record_id, 
    wr.weigh_number, 
    wr.weigh_time, 
    wr.gross_weight, 
    wr.tare_weight
FROM public.vehicle_entries ve
JOIN public.weigh_records wr ON ve.id = wr.entry_id
WHERE ve.wb_number IN (539, 565)
ORDER BY ve.wb_number, wr.weigh_time;
