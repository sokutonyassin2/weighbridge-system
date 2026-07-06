-- This script fixes the inventory stock numbers that were corrupted by the previous logic error.
-- 1. It restores stock that was incorrectly deducted when an order was 'Approved', 'Paid', or 'Purchased'.
-- 2. It restores the deduction AND adds the arrived quantity for orders that are 'Arrived' or 'Delivered'.

WITH RequisitionAdjustments AS (
    SELECT 
        item_id,
        SUM(
            CASE 
                -- If it's arrived or delivered, we add back the incorrect deduction (quantity_approved) 
                -- AND we add the actual arrived amount (quantity_received)
                WHEN status IN ('Arrived', 'Delivered') THEN COALESCE(quantity_approved, 0) + COALESCE(quantity_received, quantity_approved, 0)
                
                -- If it's merely approved/paid/purchased, we just add back the incorrect deduction
                WHEN status IN ('Approved', 'Paid', 'Purchased') THEN COALESCE(quantity_approved, 0)
                
                ELSE 0 
            END
        ) as total_adjustment
    FROM garage_requisitions
    WHERE item_id IS NOT NULL 
      AND is_deleted = false
    GROUP BY item_id
)
UPDATE garage_inventory
SET quantity = quantity + r.total_adjustment
FROM RequisitionAdjustments r
WHERE garage_inventory.id = r.item_id
AND r.total_adjustment > 0;
