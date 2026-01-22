-- FIX SCRIPT FOR LOGISTICS TRIPS
-- Checks for missing columns and refreshes schema cache

-- 1. Ensure columns exist (Idempotent check)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logistics_trips' AND column_name = 'cargo_inbound') THEN
        ALTER TABLE logistics_trips ADD COLUMN cargo_inbound TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logistics_trips' AND column_name = 'cargo_outbound') THEN
        ALTER TABLE logistics_trips ADD COLUMN cargo_outbound TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'logistics_trips' AND column_name = 'notes') THEN
        ALTER TABLE logistics_trips ADD COLUMN notes TEXT;
    END IF;
END $$;

-- 2. Force Schema Cache Reload
-- This is often necessary when adding columns to existing tables
NOTIFY pgrst, 'reload schema';
