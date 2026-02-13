-- ==========================================================
-- RESET ABSOLUTELY EVERYTHING IN REQUISITIONS
-- ==========================================================
-- This script will reset EVERY record to 'Pending' with NO PO numbers.
-- Warning: This is a total reset of all data in the requisitions table.

UPDATE garage_requisitions 
SET 
  status = 'Pending',
  po_number = NULL,
  supplier_id = NULL,
  unit_price = NULL,
  total_price = NULL,
  quantity_approved = NULL,
  includes_vat = false,
  vat_amount = 0,
  payment_details = NULL;

-- Verification:
-- SELECT count(*) as total_pending FROM garage_requisitions WHERE status = 'Pending';
