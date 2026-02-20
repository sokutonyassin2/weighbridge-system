-- 1. Aggressive fix for T511ENG: Find the correct ID and force everything
DO $$ 
DECLARE 
    correct_type_id uuid;
BEGIN
    SELECT id INTO correct_type_id FROM vehicle_types WHERE type_name = 'Supplier-Pulling' LIMIT 1;
    
    IF correct_type_id IS NOT NULL THEN
        UPDATE vehicle_entries 
        SET vehicle_type_id = correct_type_id,
            category = 'MV-Supplier',
            status = 'Completed',
            completed = true
        WHERE vehicle_no = 'T511ENG';
    END IF;
END $$;

-- 2. Aggressive sync: Any vehicle that HAS GTM weights but is JV-Payment should be MV-Supplier
UPDATE vehicle_entries e
SET category = 'MV-Supplier',
    vehicle_type_id = (SELECT id FROM vehicle_types WHERE type_name = 'Supplier-Pulling' LIMIT 1)
WHERE category = 'JV-Payment' 
  AND EXISTS (SELECT 1 FROM weigh_records WHERE entry_id = e.id AND gtm > 0);

-- 3. Final Verification: This MUST show MV-Supplier and "Supplier-Pulling"
SELECT e.id, e.vehicle_no, e.category, t.type_name
FROM vehicle_entries e
LEFT JOIN vehicle_types t ON e.vehicle_type_id = t.id
WHERE e.vehicle_no = 'T511ENG';
