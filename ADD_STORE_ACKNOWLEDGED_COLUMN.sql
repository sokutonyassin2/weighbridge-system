-- Add the store_acknowledged column to track if the garage/store has acknowledged the arrival of items
ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS store_acknowledged BOOLEAN DEFAULT FALSE;
