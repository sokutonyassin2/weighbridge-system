-- =============================================
-- STEP 1: FIRST, VIEW ALL GROUPED POs
-- Run this SELECT first to see what we have before changing anything
-- =============================================

-- View all requisitions that have a po_number (these are the "grouped" ones)
SELECT 
    id,
    item_name,
    po_number,
    status,
    supplier_id,
    target_company,
    is_deleted,
    quantity_requested,
    unit_price,
    total_price,
    created_at
FROM garage_requisitions 
WHERE po_number IS NOT NULL
ORDER BY po_number, created_at DESC;

-- Count by PO number to see the groups
SELECT 
    po_number,
    COUNT(*) as item_count,
    STRING_AGG(item_name, ', ') as items,
    STRING_AGG(DISTINCT status, ', ') as statuses,
    BOOL_OR(is_deleted) as any_deleted
FROM garage_requisitions 
WHERE po_number IS NOT NULL
GROUP BY po_number
ORDER BY po_number;

-- =============================================
-- STEP 2: SHOW TOTAL COUNTS
-- =============================================
SELECT 
    'Total with PO numbers' as category,
    COUNT(*) as count
FROM garage_requisitions 
WHERE po_number IS NOT NULL

UNION ALL

SELECT 
    'Total deleted with PO numbers' as category,
    COUNT(*) as count
FROM garage_requisitions 
WHERE po_number IS NOT NULL AND is_deleted = true

UNION ALL

SELECT 
    'Total active with PO numbers' as category,
    COUNT(*) as count
FROM garage_requisitions 
WHERE po_number IS NOT NULL AND is_deleted = false;
