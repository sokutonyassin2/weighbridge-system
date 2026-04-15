-- Restore Missing Payment for WB-3343 (T302EHF)
-- This script ensures the payment record is present and correct for the vehicle entry.

DO $$
DECLARE
    target_entry_id UUID;
    target_vehicle_type_id UUID;
    target_fee DECIMAL;
    target_vehicle_no TEXT;
    target_shift_id UUID;
BEGIN
    -- 1. Find the vehicle entry for WB-3343
    SELECT id, vehicle_type_id, vehicle_no, shift_id 
    INTO target_entry_id, target_vehicle_type_id, target_vehicle_no, target_shift_id
    FROM vehicle_entries 
    WHERE wb_number = 3343 
    LIMIT 1;

    IF target_entry_id IS NULL THEN
        RAISE NOTICE 'Vehicle entry WB-3343 not found.';
        RETURN;
    END IF;

    -- 2. Get the correct fee for this vehicle type
    SELECT first_weigh_fee INTO target_fee
    FROM vehicle_types
    WHERE id = target_vehicle_type_id;

    IF target_fee IS NULL OR target_fee <= 0 THEN
        -- Fallback to default Semi Trailer fee if rule is missing (usually 10,000)
        target_fee := 10000;
        RAISE NOTICE 'Using fallback fee of 10,000 as vehicle type fee was invalid.';
    END IF;

    -- 3. Check for existing payment
    IF EXISTS (SELECT 1 FROM payments WHERE entry_id = target_entry_id AND payment_type = 'First Weigh') THEN
        -- Update existing record if it has the wrong amount or status
        UPDATE payments 
        SET amount = target_fee, 
            payment_status = 'Paid',
            paid_at = COALESCE(paid_at, NOW()),
            created_at = COALESCE(created_at, NOW())
        WHERE entry_id = target_entry_id AND payment_type = 'First Weigh';
        RAISE NOTICE 'Updated existing payment for WB-3343.';
    ELSE
        -- Insert missing payment record
        INSERT INTO payments (
            entry_id, 
            vehicle_no, 
            amount, 
            payment_type, 
            payment_status, 
            paid_at,
            created_at
        ) VALUES (
            target_entry_id,
            target_vehicle_no,
            target_fee,
            'First Weigh',
            'Paid',
            NOW(),
            NOW()
        );
        RAISE NOTICE 'Inserted missing payment for WB-3343.';
    END IF;

    -- 4. Log the manual restoration
    INSERT INTO activity_logs (user_id, user_name, user_role, action, details)
    VALUES (
        NULL, -- System Action
        'System Restoration',
        'admin',
        'Manual Payment Restore',
        'Restored missing payment for WB-3343 (T302EHF) with amount ' || target_fee::TEXT
    );

END $$;
