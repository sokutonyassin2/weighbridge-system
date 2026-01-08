-- Add payment tracking columns to pending_weighs table
ALTER TABLE pending_weighs 
ADD COLUMN IF NOT EXISTS payment_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_required_reason TEXT,
ADD COLUMN IF NOT EXISTS payment_amount NUMERIC DEFAULT 0;

-- Create index for faster queries on overdue vehicles
CREATE INDEX IF NOT EXISTS idx_pending_weighs_payment_required 
ON pending_weighs(payment_required) 
WHERE payment_required = true;