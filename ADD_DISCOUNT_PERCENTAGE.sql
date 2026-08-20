-- Add discount_percentage to garage_requisitions to track batch discounts
ALTER TABLE garage_requisitions ADD COLUMN IF NOT EXISTS discount_percentage numeric(5,2) DEFAULT 0;
