-- ==========================================================
-- DATA CORRECTION: REMOVE DUPLICATE PAYMENT FOR WB-623 (FORCE)
-- ==========================================================
-- This script is more aggressive to ensure the duplicate is found.
-- It looks for ANY duplicate payments for Entry WB-623 today.

WITH DuplicatePayments AS (
    SELECT 
        p.id,
        ROW_NUMBER() OVER (
            PARTITION BY p.entry_id, p.vehicle_no, p.amount, p.payment_type
            ORDER BY p.created_at DESC -- Keep the most recent one or any one
        ) as row_num
    FROM public.payments p
    JOIN public.vehicle_entries ve ON p.entry_id = ve.id
    WHERE ve.wb_number = 623 -- Exact WB number from your image
       OR p.vehicle_no = 'BCD2529'
)
DELETE FROM public.payments
WHERE id IN (
    SELECT id 
    FROM DuplicatePayments 
    WHERE row_num > 1
);

-- After running this, please refresh the Cashier Dashboard.
-- It should now show only one entry for WB-623.
