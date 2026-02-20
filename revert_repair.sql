-- 1. IDENTIFY THE CORRECT VEHICLE TYPE ID
-- We'll search for 'Supplier-Pulling' or similar
DO $$ 
DECLARE 
    target_type_id uuid;
BEGIN
    SELECT id INTO target_type_id FROM vehicle_types WHERE type_name ILIKE '%pull%' AND category = 'MV-Supplier' LIMIT 1;
    
    -- 2. FIX T511ENG RELATION
    IF target_type_id IS NOT NULL THEN
        UPDATE vehicle_entries 
        SET vehicle_type_id = target_type_id,
            category = 'MV-Supplier',
            status = 'Completed',
            completed = true
        WHERE vehicle_no = 'T511ENG';
    END IF;

    -- 3. UNDO ACCIDENTAL RECLASSIFICATION
    -- Anything that was JV-Payment but got moved to MV-Supplier by my last script
    -- We'll identify them by checking if they are missing critical MV data like item_name
    UPDATE vehicle_entries 
    SET category = 'JV-Payment',
        vehicle_type_id = (SELECT id FROM vehicle_types WHERE category = 'JV-Payment' LIMIT 1)
    WHERE category = 'MV-Supplier' 
      AND vehicle_no != 'T511ENG'
      AND (item_name IS NULL OR item_name = '')
      AND vehicle_type_id = target_type_id;
END $$;
