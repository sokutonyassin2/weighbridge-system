-- ==========================================
-- EMERGENCY FINAL RECOVERY SCRIPT
-- ==========================================

DO $$ 
DECLARE 
    supplier_pulling_id uuid;
    jv_payment_id uuid;
BEGIN
    -- 1. Get the correct IDs
    SELECT id INTO supplier_pulling_id FROM vehicle_types WHERE type_name = 'Supplier-Pulling' LIMIT 1;
    SELECT id INTO jv_payment_id FROM vehicle_types WHERE category = 'JV-Payment' LIMIT 1;

    -- 2. RESTORE ENTRY_TIME FROM WEIGH RECORDS
    -- This is the most important part: move them back to their original dates
    UPDATE vehicle_entries e
    SET entry_time = (SELECT MIN(weigh_time) FROM weigh_records WHERE entry_id = e.id)
    WHERE EXISTS (SELECT 1 FROM weigh_records WHERE entry_id = e.id AND weigh_time < CURRENT_DATE);

    -- 3. REVERT ACCIDENTAL MV-SUPPLIER CHANGES
    -- Anything that was JV-Payment but doesn't have "Supplier" details (like item_name)
    -- and was touched by my previous script.
    UPDATE vehicle_entries 
    SET category = 'JV-Payment',
        vehicle_type_id = jv_payment_id
    WHERE category = 'MV-Supplier'
      AND vehicle_no != 'T511ENG'
      AND (item_name IS NULL OR item_name = '')
      AND (customer_farmer_name IS NULL OR customer_farmer_name = '');

    -- 4. ENSURE T511ENG IS CORRECT
    IF supplier_pulling_id IS NOT NULL THEN
        UPDATE vehicle_entries 
        SET vehicle_type_id = supplier_pulling_id,
            category = 'MV-Supplier',
            status = 'Completed',
            completed = true
        WHERE vehicle_no = 'T511ENG';
    END IF;

END $$;

-- VERIFICATION QUERY
SELECT category, count(*), MIN(entry_time), MAX(entry_time) 
FROM vehicle_entries 
GROUP BY category;
