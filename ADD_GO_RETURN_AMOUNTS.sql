-- =========================================================
-- ADD GO & RETURN AMOUNT COLUMNS TO LOGISTICS TRIP ORDERS
-- Supports separate pricing for Going and Returning legs
-- =========================================================

DO $$
BEGIN
    -- Go Amount (USD) - the going leg amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders'
        AND column_name = 'go_amount_usd'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN go_amount_usd NUMERIC(15, 2) DEFAULT 0;
    END IF;

    -- Return Amount (USD) - the return leg amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders'
        AND column_name = 'return_amount_usd'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN return_amount_usd NUMERIC(15, 2) DEFAULT 0;
    END IF;

    -- Go Amount (Local / TSh)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders'
        AND column_name = 'go_amount_local'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN go_amount_local NUMERIC(15, 2) DEFAULT 0;
    END IF;

    -- Return Amount (Local / TSh)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'logistics_trip_orders'
        AND column_name = 'return_amount_local'
    ) THEN
        ALTER TABLE public.logistics_trip_orders ADD COLUMN return_amount_local NUMERIC(15, 2) DEFAULT 0;
    END IF;
END $$;

-- Backfill: For existing records, set go_amount_usd = agreed_amount_usd (they were all "going" amounts)
UPDATE public.logistics_trip_orders
SET go_amount_usd = agreed_amount_usd,
    go_amount_local = agreed_amount_local
WHERE go_amount_usd = 0 AND agreed_amount_usd > 0;
