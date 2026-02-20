-- ==========================================================
-- DATA CORRECTION: FIX "4/3" WEIGH ATTEMPTS
-- ==========================================================
-- This script removes duplicate weigh records for vehicles that
-- show 4 attempts instead of 3 due to internet lag.

WITH DuplicateWeighs AS (
    SELECT 
        wr.id,
        ROW_NUMBER() OVER (
            PARTITION BY wr.entry_id, wr.weigh_number
            ORDER BY wr.weigh_time ASC
        ) as row_num
    FROM public.weigh_records wr
    JOIN public.vehicle_entries ve ON wr.entry_id = ve.id
    WHERE ve.completed = false -- Only fix pending vehicles
)
DELETE FROM public.weigh_records
WHERE id IN (
    SELECT id 
    FROM DuplicateWeighs 
    WHERE row_num > 1
);

-- After running this, the "4/3" labels will change back to "3/3".
