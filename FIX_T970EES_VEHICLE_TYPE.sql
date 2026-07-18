-- =============================================
-- FIX: T970EES Vehicle Type Correction
-- Vehicle T970EES was wrongly entered as "Transit" (20,000)
-- It should be "Kipisi Mende" (15,000)
-- Date of entry: Jul 17, 2026 at 10:15 (Day Shift)
-- Operator: Tatu Ally Kasambwa
-- =============================================

-- ─────────────────────────────────────────────
-- STEP 1: PREVIEW — Verify the record exists
-- Run this first to confirm you have the right entry
-- ─────────────────────────────────────────────
SELECT
    ve.id                          AS entry_id,
    ve.vehicle_no,
    ve.driver_name,
    ve.entry_time,
    vt.type_name                   AS current_vehicle_type,
    vt.first_weigh_fee             AS current_fee,
    ve.shift_id
FROM vehicle_entries ve
JOIN vehicle_types vt ON ve.vehicle_type_id = vt.id
WHERE ve.vehicle_no = 'T970EES'
  AND DATE(ve.entry_time AT TIME ZONE 'Africa/Nairobi') = '2026-07-17';

-- ─────────────────────────────────────────────
-- STEP 2: PREVIEW — Find the correct "Kipisi Mende" vehicle type ID
-- Run this to see its ID and confirm the fee is 15,000
-- ─────────────────────────────────────────────
SELECT id, type_name, first_weigh_fee
FROM vehicle_types
WHERE type_name ILIKE '%kipisi%' OR type_name ILIKE '%mende%';

-- ─────────────────────────────────────────────
-- STEP 3: PREVIEW — See the payment that needs correction
-- ─────────────────────────────────────────────
SELECT
    p.id        AS payment_id,
    p.vehicle_no,
    p.amount    AS current_amount,
    p.paid_at,
    p.payment_status
FROM payments p
JOIN vehicle_entries ve ON p.entry_id = ve.id
WHERE ve.vehicle_no = 'T970EES'
  AND DATE(ve.entry_time AT TIME ZONE 'Africa/Nairobi') = '2026-07-17';

-- ═════════════════════════════════════════════
-- ⚠️  IMPORTANT: Run the 3 preview steps above first!
-- Only proceed below after confirming the data is correct.
-- ═════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- STEP 4: UPDATE vehicle_entries — change vehicle_type_id to Kipisi Mende
-- ─────────────────────────────────────────────
UPDATE vehicle_entries
SET
    vehicle_type_id = (
        SELECT id FROM vehicle_types
        WHERE type_name ILIKE '%kipisi%' OR type_name ILIKE '%mende%'
        LIMIT 1
    )
WHERE vehicle_no = 'T970EES'
  AND DATE(entry_time AT TIME ZONE 'Africa/Nairobi') = '2026-07-17';

-- ─────────────────────────────────────────────
-- STEP 5: UPDATE payments — correct the amount from 20,000 → 15,000
-- ─────────────────────────────────────────────
UPDATE payments
SET
    amount = 15000,
    notes  = COALESCE(notes, '') || ' [Corrected: was Transit (20,000), changed to Kipisi Mende (15,000) on ' || NOW()::DATE || ']'
WHERE entry_id = (
    SELECT id FROM vehicle_entries
    WHERE vehicle_no = 'T970EES'
      AND DATE(entry_time AT TIME ZONE 'Africa/Nairobi') = '2026-07-17'
    LIMIT 1
)
  AND amount = 20000;

-- ─────────────────────────────────────────────
-- STEP 6: VERIFY — Confirm all changes look correct
-- ─────────────────────────────────────────────
SELECT
    ve.vehicle_no,
    ve.driver_name,
    ve.entry_time,
    vt.type_name       AS new_vehicle_type,
    vt.first_weigh_fee AS fee_on_type,
    p.amount           AS payment_amount,
    p.notes            AS payment_notes
FROM vehicle_entries ve
JOIN vehicle_types vt ON ve.vehicle_type_id = vt.id
LEFT JOIN payments p ON p.entry_id = ve.id
WHERE ve.vehicle_no = 'T970EES'
  AND DATE(ve.entry_time AT TIME ZONE 'Africa/Nairobi') = '2026-07-17';
