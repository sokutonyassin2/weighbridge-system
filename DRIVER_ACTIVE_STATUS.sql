-- Add is_active column to logistics_drivers table
-- This allows marking drivers as active or inactive (e.g., when they leave or are unavailable)

ALTER TABLE logistics_drivers
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN logistics_drivers.is_active IS 'Whether the driver is currently active and available for assignment';
