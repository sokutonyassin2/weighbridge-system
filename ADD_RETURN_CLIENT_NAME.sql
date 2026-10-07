-- Migration: Add return_client_name column to logistics_trip_orders
-- Purpose: Allow a different client to be specified for the return leg of a trip order
-- If left NULL, the return leg client is the same as the GO leg client (client_name column)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'logistics_trip_orders'
        AND column_name = 'return_client_name'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN return_client_name TEXT DEFAULT NULL;
        RAISE NOTICE 'Column return_client_name added to logistics_trip_orders';
    ELSE
        RAISE NOTICE 'Column return_client_name already exists on logistics_trip_orders — skipping';
    END IF;
END $$;
