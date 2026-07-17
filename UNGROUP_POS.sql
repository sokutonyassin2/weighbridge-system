-- =============================================
-- UNGROUP items created by "Generate Grouped PO" button
-- These have status='Purchased' but no prices (unit_price=0 or null)
-- This will set them back to Pending with no PO number
-- =============================================

-- STEP 1: PREVIEW what will be ungrouped (RUN THIS FIRST)
SELECT 
    id,
    item_name,
    po_number,
    status,
    supplier_id,
    unit_price,
    total_price,
    is_deleted,
    created_at
FROM garage_requisitions 
WHERE status = 'Purchased' 
  AND (unit_price IS NULL OR unit_price = 0)
  AND (total_price IS NULL OR total_price = 0)
  AND is_deleted = false
ORDER BY po_number, created_at DESC;

-- STEP 2: UNGROUP THEM — puts 9 items back to Pending
UPDATE garage_requisitions
SET 
    status = 'Pending',
    po_number = NULL,
    supplier_id = NULL,
    status_updated_at = NOW()
WHERE status = 'Purchased' 
  AND (unit_price IS NULL OR unit_price = 0)
  AND (total_price IS NULL OR total_price = 0)
  AND is_deleted = false;
