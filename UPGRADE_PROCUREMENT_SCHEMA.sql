-- ==========================================================
-- UPGRADE PROCUREMENT SCHEMA: SPLITS & ARRIVALS
-- ==========================================================

-- 1. Add columns for Quantity Tracking
ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS quantity_received INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS original_quantity INTEGER, -- To store the very first request qty
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES garage_requisitions(id), -- For split requests
ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS received_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES profiles(id);

-- 2. Populate original_quantity for existing records if NULL
UPDATE garage_requisitions 
SET original_quantity = quantity_requested 
WHERE original_quantity IS NULL;

-- 3. Add a new status for the arrival phase
-- No changes needed to enum if using text for status, but we should be aware of:
-- Statuses: 'Pending' -> 'Authorized' -> 'Awaiting Approval' -> 'Authorized' 
-- Wait, current flow seems to be:
-- Pending -> (Procurement adds quote) -> Awaiting Approval -> (Management approves) -> Authorized -> (Cashier pays) -> Paid

-- New Proposed Flow:
-- ... -> Paid -> Awaiting Arrival -> (Storekeeper confirms) -> Received (Closed)

-- 4. Create an index for faster date grouping in Management Approvals
CREATE INDEX IF NOT EXISTS idx_requisitions_created_at ON garage_requisitions(created_at);
