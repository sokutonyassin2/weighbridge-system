-- LOGISTICS REPAIR SCRIPT (REFINED)
-- Run this in Supabase SQL Editor to fix the 404 errors

-- 1. Create the missing Asset Types table (allowing any custom entry)
CREATE TABLE IF NOT EXISTS logistics_asset_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add Horse and Trailer columns to logistics_fleet
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistics_fleet' AND column_name='horse_number') THEN
        ALTER TABLE logistics_fleet ADD COLUMN horse_number TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistics_fleet' AND column_name='trailer_number') THEN
        ALTER TABLE logistics_fleet ADD COLUMN trailer_number TEXT;
    END IF;
END $$;

-- 3. Enable RLS and Policies for Asset Types
ALTER TABLE logistics_asset_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth Full Access" ON logistics_asset_types;
CREATE POLICY "Auth Full Access" ON logistics_asset_types FOR ALL USING (auth.role() = 'authenticated');

-- 4. Set up Trigger for Asset Types
DROP TRIGGER IF EXISTS update_logistics_asset_types_updated_at ON logistics_asset_types;
CREATE TRIGGER update_logistics_asset_types_updated_at 
    BEFORE UPDATE ON logistics_asset_types 
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Verify
SELECT 'LOGISTICS REPAIR COMPLETED' as result;
