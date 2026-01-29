-- Procurement Expansion & Multi-Company Migration
-- 1. Add target_company to track which entity the item is for
ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS target_company TEXT DEFAULT 'SudEnergy Logistics';

-- 2. Add price snapshot to requisition for historical printing accuracy
-- This keeps the price at the time of approval/purchase even if store price changes later
ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0;

-- 3. Extend status constraints to support full procurement lifecycle
-- Statuses: Pending, Approved, Purchased, Delivered, Rejected
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'garage_requisitions_status_check') THEN
        ALTER TABLE garage_requisitions 
        ADD CONSTRAINT garage_requisitions_status_check 
        CHECK (status IN ('Pending', 'Approved', 'Purchased', 'Delivered', 'Rejected'));
    END IF;
END $$;
