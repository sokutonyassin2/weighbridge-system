-- LOGISTICS REFINEMENT SCRIPT
-- Run this in Supabase SQL Editor

-- 1. Ensure is_active exists in logistics_fleet
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistics_fleet' AND column_name='is_active') THEN
        ALTER TABLE logistics_fleet ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 2. Add type_category to logistics_asset_types for organization
-- Values: 'Vehicle', 'Trailer'
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistics_asset_types' AND column_name='type_category') THEN
        ALTER TABLE logistics_asset_types ADD COLUMN type_category TEXT NOT NULL DEFAULT 'Vehicle' CHECK (type_category IN ('Vehicle', 'Trailer'));
    END IF;
END $$;

-- Verify
SELECT 'LOGISTICS REFINEMENT COMPLETED' as result;
