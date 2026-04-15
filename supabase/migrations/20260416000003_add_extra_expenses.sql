-- Add is_extra column to track post-approval unbudgeted expenses
ALTER TABLE logistics_trip_expenses 
ADD COLUMN IF NOT EXISTS is_extra BOOLEAN DEFAULT false;

-- Optionally, backfill existing records to ensure they are marked as false (budgeted)
UPDATE logistics_trip_expenses 
SET is_extra = false 
WHERE is_extra IS NULL;
