-- =====================================================
-- FIX: Add Missing 'requires_coupling' Column
-- Table: logistics_asset_types
-- Date: 2026-02-07
-- =====================================================
-- This migration adds the missing 'requires_coupling' column
-- that the frontend is trying to use but doesn't exist in the database.
-- =====================================================

-- Add the missing column
ALTER TABLE logistics_asset_types 
ADD COLUMN IF NOT EXISTS requires_coupling BOOLEAN NOT NULL DEFAULT false;

-- Add documentation comment
COMMENT ON COLUMN logistics_asset_types.requires_coupling IS 
'Indicates if this asset type must be linked/coupled to another asset (e.g., Horse requires Trailer)';

-- Verify the column was added successfully
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'logistics_asset_types'
AND column_name = 'requires_coupling';

-- Expected output:
-- column_name         | data_type | is_nullable | column_default
-- requires_coupling   | boolean   | NO          | false
