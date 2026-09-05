-- ==============================================================================
-- FIX: Remove UNIQUE constraint on order_number in logistics_trip_orders
-- 
-- Why: An order batch (e.g. SEL-0001) contains multiple vehicles.
-- Each vehicle is stored as its own row sharing the same order_number.
-- Having a UNIQUE constraint on order_number prevents adding multiple vehicles!
-- ==============================================================================

-- Drop the unique constraint on order_number
ALTER TABLE public.logistics_trip_orders 
DROP CONSTRAINT IF EXISTS logistics_trip_orders_order_number_key;

-- Make sure there is an index for fast lookups by order_number
CREATE INDEX IF NOT EXISTS idx_logistics_trip_orders_order_number 
ON public.logistics_trip_orders(order_number);

-- Ensure trip_number index exists
CREATE INDEX IF NOT EXISTS idx_logistics_trip_orders_trip_number 
ON public.logistics_trip_orders(trip_number);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
