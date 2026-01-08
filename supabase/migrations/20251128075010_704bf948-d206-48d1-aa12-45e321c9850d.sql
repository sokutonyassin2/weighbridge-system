-- Add penalty_paid_entry flag to vehicle_entries
ALTER TABLE vehicle_entries 
ADD COLUMN IF NOT EXISTS penalty_paid_entry boolean DEFAULT false;

COMMENT ON COLUMN vehicle_entries.penalty_paid_entry IS 
'True if this entry was created after a penalty payment (should not be charged again for first weigh)';