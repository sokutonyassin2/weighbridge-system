-- ==========================================================
-- PREVENT DUPLICATE PAYMENTS & PENALTIES
-- ==========================================================
-- This script adds unique constraints to ensure that slow internet
-- or double-clicking doesn't result in duplicate charges.

-- 1. Add unique constraint to payments table
-- Ensures only ONE payment of a specific type per vehicle entry
ALTER TABLE public.payments 
DROP CONSTRAINT IF EXISTS unique_entry_payment_type;

ALTER TABLE public.payments 
ADD CONSTRAINT unique_entry_payment_type UNIQUE (entry_id, payment_type);

-- 2. Add unique constraint to penalties table
-- Ensures only ONE penalty of a specific type per vehicle entry
ALTER TABLE public.penalties 
DROP CONSTRAINT IF EXISTS unique_entry_penalty_type;

ALTER TABLE public.penalties 
ADD CONSTRAINT unique_entry_penalty_type UNIQUE (entry_id, penalty_type);

COMMENT ON CONSTRAINT unique_entry_payment_type ON public.payments IS 'Prevents duplicate payments for the same entry and type (e.g., First Weigh).';
COMMENT ON CONSTRAINT unique_entry_penalty_type ON public.penalties IS 'Prevents duplicate penalties for the same entry and type.';
