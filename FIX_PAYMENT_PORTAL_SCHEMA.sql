-- FIX PAYMENT PORTAL SCHEMA
-- Adds missing columns and status constraints to enable the disbursement workflow.

-- 1. Add missing columns safely
ALTER TABLE public.garage_requisitions 
ADD COLUMN IF NOT EXISTS payment_reference TEXT,
ADD COLUMN IF NOT EXISTS payment_details JSONB,
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Update status constraint to include 'Paid'
-- We drop and recreate the constraint to ensure it includes the new status
DO $$ 
BEGIN 
    -- Drop existing check constraint if it exists
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'garage_requisitions_status_check') THEN
        ALTER TABLE public.garage_requisitions DROP CONSTRAINT garage_requisitions_status_check;
    END IF;
    
    -- Add updated check constraint with 'Paid'
    ALTER TABLE public.garage_requisitions 
    ADD CONSTRAINT garage_requisitions_status_check 
    CHECK (status IN ('Pending', 'Approved', 'Partially Approved', 'Purchased', 'Stocked', 'Rejected', 'Paid', 'Awaiting Approval', 'Revoked', 'Delivered'));

END $$;

-- 3. Comments for clarity
COMMENT ON COLUMN public.garage_requisitions.payment_reference IS 'Reference or receipt number provided by the cashier during disbursement';
COMMENT ON COLUMN public.garage_requisitions.payment_details IS 'Snapshot of the payment method details used for this transaction';
