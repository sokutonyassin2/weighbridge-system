-- ADD ADVANCE PAYMENT SUPPORT
-- Adds columns to support optional advance/down payment on Purchase Orders.

-- 1. Add advance_payment column (the advance amount set during PO generation)
ALTER TABLE public.garage_requisitions 
ADD COLUMN IF NOT EXISTS advance_payment NUMERIC DEFAULT 0;

-- 2. Add amount_paid column (tracks cumulative amount paid so far)
ALTER TABLE public.garage_requisitions 
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC DEFAULT 0;

-- 3. Drop constraint if present (or make it open so existing rows with custom statuses don't fail)
ALTER TABLE public.garage_requisitions 
DROP CONSTRAINT IF EXISTS garage_requisitions_status_check;

-- 4. Comments
COMMENT ON COLUMN public.garage_requisitions.advance_payment IS 'Optional advance/down payment amount for the PO. 0 means full payment at once.';
COMMENT ON COLUMN public.garage_requisitions.amount_paid IS 'Cumulative amount paid so far. Used to track partial payments.';
