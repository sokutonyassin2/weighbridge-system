-- Add the physically_unseen column to track items paid for but not seen physically by the cashier
ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS physically_unseen BOOLEAN DEFAULT FALSE;
