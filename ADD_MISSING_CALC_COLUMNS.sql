-- =========================================================
-- ADD MISSING CALC COLUMNS TO LOGISTICS TRIP ORDERS
-- The code uses these column names but the DB migration
-- only created go_rate_per_unit/go_tonnes etc.
-- This adds the alternate column names the code expects.
-- =========================================================

DO $$
BEGIN
    -- go_rate_per_tonne
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders' AND column_name = 'go_rate_per_tonne'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN go_rate_per_tonne NUMERIC(15, 2);
        RAISE NOTICE 'Added go_rate_per_tonne';
    END IF;

    -- go_tonnage
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders' AND column_name = 'go_tonnage'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN go_tonnage NUMERIC(15, 2);
        RAISE NOTICE 'Added go_tonnage';
    END IF;

    -- go_rate_per_km
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders' AND column_name = 'go_rate_per_km'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN go_rate_per_km NUMERIC(15, 2);
        RAISE NOTICE 'Added go_rate_per_km';
    END IF;

    -- return_rate_per_tonne
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders' AND column_name = 'return_rate_per_tonne'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN return_rate_per_tonne NUMERIC(15, 2);
        RAISE NOTICE 'Added return_rate_per_tonne';
    END IF;

    -- return_tonnage
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders' AND column_name = 'return_tonnage'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN return_tonnage NUMERIC(15, 2);
        RAISE NOTICE 'Added return_tonnage';
    END IF;

    -- return_rate_per_km
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders' AND column_name = 'return_rate_per_km'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN return_rate_per_km NUMERIC(15, 2);
        RAISE NOTICE 'Added return_rate_per_km';
    END IF;
END $$;
