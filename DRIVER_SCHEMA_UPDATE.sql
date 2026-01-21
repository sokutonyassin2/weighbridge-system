-- =====================================================
-- DRIVER MANAGEMENT ENHANCEMENT - DATABASE SCHEMA
-- =====================================================
-- This migration adds missing fields to the drivers table 
-- to support the new enrollment UI.

-- 1. Add id_number column to logistics_drivers
ALTER TABLE logistics_drivers 
ADD COLUMN IF NOT EXISTS id_number TEXT;

-- 2. Add operation_type column to logistics_drivers
-- Supports filtering and categorization similar to vehicles
ALTER TABLE logistics_drivers 
ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'Local'
CHECK (operation_type IN ('Local', 'Transit'));

-- 3. Add phone_secondary column to logistics_drivers
ALTER TABLE logistics_drivers 
ADD COLUMN IF NOT EXISTS phone_secondary TEXT;

-- 4. Add comments for documentation
COMMENT ON COLUMN logistics_drivers.id_number IS 'National ID or Passport number of the driver';
COMMENT ON COLUMN logistics_drivers.operation_type IS 'Driver classification: Local or Transit';
COMMENT ON COLUMN logistics_drivers.phone_secondary IS 'Secondary contact number';

-- Verify
SELECT 'DRIVER SCHEMA ENHANCEMENT COMPLETED' as result;
