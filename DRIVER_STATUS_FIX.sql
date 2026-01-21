-- Fix for check constraint violation when setting driver status to "Inactive"

-- 1. Drop the existing constraint
ALTER TABLE logistics_drivers
DROP CONSTRAINT IF EXISTS logistics_drivers_status_check;

-- 2. Add updated constraint that includes 'Inactive'
ALTER TABLE logistics_drivers
ADD CONSTRAINT logistics_drivers_status_check 
CHECK (status IN ('Active', 'Inactive', 'On Trip', 'Suspended', 'On Leave'));

-- 3. Comment for documentation
COMMENT ON CONSTRAINT logistics_drivers_status_check ON logistics_drivers IS 'Ensures valid driver status values including Inactive';
