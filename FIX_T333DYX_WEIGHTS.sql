-- Fix T333DYX weight values (swap gross and tare)
-- This vehicle was incorrectly categorized as MV-Company (empty arrival)
-- but should have been MV-Supplier (loaded arrival)

-- First, let's see the current values
SELECT 
    wr.id,
    ve.vehicle_no,
    ve.category,
    wr.weigh_number,
    wr.gross_weight as current_gross,
    wr.tare_weight as current_tare,
    wr.net_weight as current_net,
    wr.created_at
FROM weigh_records wr
JOIN vehicle_entries ve ON wr.entry_id = ve.id
WHERE ve.vehicle_no = 'T333DYX'
ORDER BY wr.weigh_number;

-- Now swap the values for the first weigh record
-- (The first weigh should have been GROSS, not TARE)
UPDATE weigh_records
SET 
    gross_weight = tare_weight,  -- Move tare to gross
    tare_weight = gross_weight,  -- Move gross to tare
    net_weight = tare_weight - gross_weight  -- Recalculate net (will be positive now)
WHERE entry_id = (
    SELECT id 
    FROM vehicle_entries 
    WHERE vehicle_no = 'T333DYX'
)
AND weigh_number = 1;

-- Verify the fix
SELECT 
    wr.id,
    ve.vehicle_no,
    ve.category,
    wr.weigh_number,
    wr.gross_weight as fixed_gross,
    wr.tare_weight as fixed_tare,
    wr.net_weight as fixed_net,
    wr.created_at
FROM weigh_records wr
JOIN vehicle_entries ve ON wr.entry_id = ve.id
WHERE ve.vehicle_no = 'T333DYX'
ORDER BY wr.weigh_number;
