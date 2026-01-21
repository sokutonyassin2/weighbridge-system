-- EMERGENCY SYSTEM REPAIR: RESTORE MISSING TABLES & LOGIC
-- Run this in Supabase SQL Editor

-- 1. RESTORE "penalties" TABLE (Crucial for Cashier Dashboard)
CREATE TABLE IF NOT EXISTS penalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES vehicle_entries(id) ON DELETE CASCADE,
    vehicle_no TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    reason TEXT,
    payment_status payment_status DEFAULT 'Pending',
    paid_at TIMESTAMP WITH TIME ZONE,
    cashier_id UUID REFERENCES auth.users(id),
    cashier_name TEXT,
    shift_id UUID REFERENCES shifts(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RESTORE "overdue_vehicles_history" TABLE
CREATE TABLE IF NOT EXISTS overdue_vehicles_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES vehicle_entries(id) ON DELETE CASCADE,
    vehicle_no TEXT NOT NULL,
    category vehicle_category,
    first_weigh_time TIMESTAMP WITH TIME ZONE,
    overdue_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    shift_id UUID REFERENCES shifts(id),
    shift_name TEXT,
    shift_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. RESTORE "pending_weighs" TABLE (Correcting View/Table issue)
-- First, safely handle the view/table mismatch
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'pending_weighs') THEN
        EXECUTE 'DROP VIEW pending_weighs CASCADE';
    END IF;
END $$;

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

-- 4. ENABLE RLS FOR NEW TABLES
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_weighs ENABLE ROW LEVEL SECURITY;
ALTER TABLE overdue_vehicles_history ENABLE ROW LEVEL SECURITY;

-- Apply "Full Access" policies (Standard for this system)
DROP POLICY IF EXISTS "Auth Full Access" ON penalties;
CREATE POLICY "Auth Full Access" ON penalties FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Full Access" ON pending_weighs;
CREATE POLICY "Auth Full Access" ON pending_weighs FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Full Access" ON overdue_vehicles_history;
CREATE POLICY "Auth Full Access" ON overdue_vehicles_history FOR ALL USING (auth.role() = 'authenticated');

-- 5. PAYMENT SYNCHRONIZATION TRIGGER (The "Fucker" Fix)
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

-- 6. PERFORMANCE INDEXES (Fixes the "Forever Loading" in reports)
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_entry_id ON payments(entry_id);
CREATE INDEX IF NOT EXISTS idx_weigh_records_weigh_time ON weigh_records(weigh_time);
CREATE INDEX IF NOT EXISTS idx_weigh_records_entry_id ON weigh_records(entry_id);
CREATE INDEX IF NOT EXISTS idx_penalties_created_at ON penalties(created_at);
CREATE INDEX IF NOT EXISTS idx_penalties_entry_id ON penalties(entry_id);
CREATE INDEX IF NOT EXISTS idx_pending_weighs_entry_id ON pending_weighs(entry_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_entries_completed ON vehicle_entries(completed);

-- 7. INITIAL DATA SYNC
-- Mark existing paid weight entries as cleared in pending_weighs
UPDATE pending_weighs pw
SET 
    payment_status = p.payment_status,
    payment_required = false,
    last_payment_time = p.paid_at,
    payment_amount = p.amount
FROM payments p
WHERE pw.entry_id = p.entry_id 
AND p.payment_status = 'Paid';

-- 8. AUTO-OVERDUE FUNCTION (Just in case it was missing)
CREATE OR REPLACE FUNCTION check_and_mark_overdue_vehicles()
RETURNS void AS $$
BEGIN
    -- This function is called manually or by edge functions
    -- 1. Identify overdue vehicles
    INSERT INTO overdue_vehicles_history (entry_id, vehicle_no, category, first_weigh_time)
    SELECT entry_id, vehicle_no, category, first_weigh_time
    FROM pending_weighs
    WHERE return_status = 'Pending' 
    AND expected_return_time < NOW();

    -- 2. Complete the entries
    UPDATE vehicle_entries
    SET completed = true, status = 'Overdue-History'
    WHERE id IN (SELECT entry_id FROM pending_weighs WHERE return_status = 'Pending' AND expected_return_time < NOW());

    -- 3. Cleanup pending
    DELETE FROM pending_weighs WHERE return_status = 'Pending' AND expected_return_time < NOW();
END;
$$ LANGUAGE plpgsql;

-- Final Verification
SELECT 'SYSTEM RESTORED SUCCESSFULLY' as result;
