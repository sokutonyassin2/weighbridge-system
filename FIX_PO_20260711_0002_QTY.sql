-- =====================================================
-- FIX: PO-20260711-0002 - Correct Quantity from 4 to 2
-- Item: "Kubandika break shuu"
-- Unit Price: 15,000 TZS
-- Wrong:  Qty 4 = 60,000 TZS
-- Correct: Qty 2 = 30,000 TZS
-- =====================================================

-- Step 1: Verify current data before fix
SELECT 
    id,
    item_name,
    po_number,
    quantity_requested,
    quantity_approved,
    unit_price,
    total_price,
    includes_vat,
    vat_amount,
    status
FROM garage_requisitions
WHERE po_number = 'PO-20260711-0002'
  AND item_name ILIKE '%Kubandika break shuu%';

-- Step 2: Apply the fix - Update quantity and total
UPDATE garage_requisitions
SET 
    quantity_requested = 2,
    quantity_approved = 2,
    total_price = 2 * 15000  -- 30,000 TZS (no VAT based on original)
WHERE po_number = 'PO-20260711-0002'
  AND item_name ILIKE '%Kubandika break shuu%';

-- Step 3: If the item had VAT, use this instead (uncomment if needed):
-- UPDATE garage_requisitions
-- SET 
--     quantity_requested = 2,
--     quantity_approved = 2,
--     total_price = (2 * 15000) + CASE WHEN includes_vat THEN (2 * 15000 * 0.18) ELSE 0 END,
--     vat_amount = CASE WHEN includes_vat THEN (2 * 15000 * 0.18) ELSE 0 END
-- WHERE po_number = 'PO-20260711-0002'
--   AND item_name ILIKE '%Kubandika break shuu%';

-- Step 4: Verify the fix was applied correctly
SELECT 
    id,
    item_name,
    po_number,
    quantity_requested,
    quantity_approved,
    unit_price,
    total_price,
    status
FROM garage_requisitions
WHERE po_number = 'PO-20260711-0002';
