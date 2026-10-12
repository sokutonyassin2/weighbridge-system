-- ====================================================================
-- DELETE ORPHAN UNINVOICED TRIPS FOR AFRICA WAKAWAKA / T 265/2025/G009
-- ====================================================================

-- 1. Preview them first (optional check):
SELECT id, reference_number, client_name, revenue_amount, status 
FROM public.logistics_trip_sheets
WHERE reference_number ILIKE '%265/2025/G009%'
   OR (client_name ILIKE '%AFRICA WAKAWAKA%' AND (invoice_no IS NULL OR invoice_no = ''));

-- 2. Delete them from logistics_trip_sheets:
DELETE FROM public.logistics_trip_sheets
WHERE reference_number ILIKE '%265/2025/G009%'
   OR (client_name ILIKE '%AFRICA WAKAWAKA%' AND (invoice_no IS NULL OR invoice_no = ''));

-- 3. Also delete any matching orphan trip orders if they exist:
DELETE FROM public.logistics_trip_orders
WHERE trip_number ILIKE '%265/2025/G009%'
   OR client_name ILIKE '%AFRICA WAKAWAKA%';
