-- =====================================================
-- FIX T 981/2025/G008 — Match pricing to other trips
-- (DAR ES SALAAM → KITWE route)
-- All other trips: agreed=10200, go=6900, return=3300
-- T 981 currently: agreed=6900, go/return not set
-- =====================================================

-- STEP 1: Fix the trip ORDER (go/return split + correct total)
-- Try update first (handles both "T 981/2025/G008" and "T981/2025/G008")
UPDATE public.logistics_trip_orders
SET agreed_amount_usd = 10200,
    go_amount_usd     = 6900,
    return_amount_usd = 3300
WHERE trip_number ILIKE '%981/2025/G008%';

-- STEP 2: If no trip order row exists yet, insert one
-- (Only inserts if the UPDATE above affected 0 rows)
INSERT INTO public.logistics_trip_orders (trip_number, agreed_amount_usd, go_amount_usd, return_amount_usd, destination, status)
SELECT 'T 981/2025/G008', 10200, 6900, 3300, 'KITWE', 'active'
WHERE NOT EXISTS (
    SELECT 1 FROM public.logistics_trip_orders
    WHERE trip_number ILIKE '%981/2025/G008%'
);

-- STEP 3: Fix the trip SHEET revenue to match the full contract (10,200)
UPDATE public.logistics_trip_sheets
SET revenue_amount = 10200
WHERE reference_number ILIKE '%981/2025/G008%'
  AND (revenue_amount IS NULL OR revenue_amount < 10200);

-- Done! The app enrichment in logisticsDataService.ts will now
-- pick up go_amount_usd=6900 and return_amount_usd=3300 from
-- the trip order, showing the Go/Ret breakdown and the
-- "Return Uninvoiced ($3,300)" badge — exactly like the others.
