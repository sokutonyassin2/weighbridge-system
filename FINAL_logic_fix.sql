-- FINAL LOGIC RESTORATION (FOOLPROOF VERSION)
-- Run this in Supabase SQL Editor. 
-- It skips the "is not a view" error entirely.

-- 1. DROP VIEW ONLY IF IT ACTUALLY IS A VIEW
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'pending_weighs') THEN
        EXECUTE 'DROP VIEW pending_weighs CASCADE';
    END IF;
END $$;

-- 2. CREATE TABLE IF IT DOESN'T EXIST
CREATE TABLE IF NOT EXISTS pending_weighs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES vehicle_entries(id) ON DELETE CASCADE,
    vehicle_no TEXT NOT NULL,
    category vehicle_category,
    first_weigh_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expected_return_time TIMESTAMP WITH TIME ZONE,
    actual_return_time TIMESTAMP WITH TIME ZONE,
    return_status TEXT DEFAULT 'Pending',
    payment_required BOOLEAN DEFAULT false,
    payment_required_reason TEXT,
    payment_amount NUMERIC,
    payment_status payment_status DEFAULT 'Pending',
    last_payment_time TIMESTAMP WITH TIME ZONE,
    weigh_attempts INTEGER DEFAULT 1,
    is_overdue BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. ENSURE ALL COLUMNS ARE PRESENT (for existing tables)
DO $$ 
BEGIN
    BEGIN
        ALTER TABLE pending_weighs ADD COLUMN payment_required BOOLEAN DEFAULT false;
    EXCEPTION WHEN duplicate_column THEN NULL; END;
    
    BEGIN
        ALTER TABLE pending_weighs ADD COLUMN payment_amount NUMERIC;
    EXCEPTION WHEN duplicate_column THEN NULL; END;
    
    BEGIN
        ALTER TABLE pending_weighs ADD COLUMN payment_status payment_status DEFAULT 'Pending';
    EXCEPTION WHEN duplicate_column THEN NULL; END;
    
    BEGIN
        ALTER TABLE pending_weighs ADD COLUMN last_payment_time TIMESTAMP WITH TIME ZONE;
    EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- 4. ENABLE RLS
ALTER TABLE pending_weighs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Full Access for Authenticated Users" ON pending_weighs;
CREATE POLICY "Full Access for Authenticated Users" ON pending_weighs FOR ALL USING (auth.role() = 'authenticated');

-- 5. FUNCTION TO AUTO-SYNC PAYMENT STATUS
CREATE OR REPLACE FUNCTION sync_pending_weighs_payment()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pending_weighs
    SET 
        payment_status = NEW.payment_status,
        payment_required = CASE WHEN NEW.payment_status = 'Paid' THEN false ELSE payment_required END,
        last_payment_time = NEW.paid_at,
        payment_amount = NEW.amount
    WHERE entry_id = NEW.entry_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_payment ON payments;
CREATE TRIGGER trg_sync_payment
AFTER INSERT OR UPDATE OF payment_status ON payments
FOR EACH ROW EXECUTE FUNCTION sync_pending_weighs_payment();

-- 6. SYNC EXISTING DATA
UPDATE pending_weighs pw
SET 
    payment_status = p.payment_status,
    payment_required = false,
    last_payment_time = p.paid_at,
    payment_amount = p.amount
FROM payments p
WHERE pw.entry_id = p.entry_id 
AND p.payment_status = 'Paid';

-- 7. CLEANUP OLD LOGIC (Remove any old overdue triggers if they exist)
DROP TRIGGER IF EXISTS mark_overdue_trigger ON pending_weighs;

-- 8. PERFORMANCE INDEXES (Speed up reports)
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_weigh_records_weigh_time ON weigh_records(weigh_time);
CREATE INDEX IF NOT EXISTS idx_penalties_created_at ON penalties(created_at);

-- Verify
SELECT 'SUCCESS: Table is ready and optimized' as status;
