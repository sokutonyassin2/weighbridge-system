-- Add approved_by_name column to logistics_trip_orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'logistics_trip_orders' 
        AND column_name = 'approved_by_name'
    ) THEN
        ALTER TABLE logistics_trip_orders ADD COLUMN approved_by_name TEXT;
    END IF;
END $$;
