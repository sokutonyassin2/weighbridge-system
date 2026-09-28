-- TARGETED FIX:
-- 1. Reset KAPELO and SAHLA back to clean 'Approved' with 0 amount_paid and 0 advance_payment.
-- 2. Apply the exact 1,200,000 TZS advance ONLY to CASH KONGOE USED.

DO $$
DECLARE
    v_cash_kongoe_supplier_id UUID;
    v_cash_kongoe_total NUMERIC;
    v_advance_target NUMERIC := 1200000;
    v_ratio NUMERIC;
BEGIN
    -- 1. Find the supplier ID for CASH KONGOE USED
    SELECT id INTO v_cash_kongoe_supplier_id
    FROM garage_suppliers
    WHERE name ILIKE '%CASH KONGOE%'
    LIMIT 1;

    -- 2. RESET all other suppliers with PO-20260923-0001 (e.g. KAPELO, SAHLA, etc.)
    -- Remove any accidental advance or partially paid status
    UPDATE garage_requisitions
    SET 
        status = 'Approved',
        amount_paid = 0,
        advance_payment = 0,
        status_updated_at = NOW()
    WHERE po_number = 'PO-20260923-0001'
      AND is_deleted = false
      AND (v_cash_kongoe_supplier_id IS NULL OR supplier_id != v_cash_kongoe_supplier_id);

    -- 3. Get total for CASH KONGOE USED items under PO-20260923-0001
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_cash_kongoe_total
    FROM garage_requisitions
    WHERE po_number = 'PO-20260923-0001'
      AND is_deleted = false
      AND (
          (v_cash_kongoe_supplier_id IS NOT NULL AND supplier_id = v_cash_kongoe_supplier_id)
          OR (v_cash_kongoe_supplier_id IS NULL AND item_name IN ('Center bolt', 'Repair bogi', 'Bogi pin', 'Leaf spring'))
      );

    -- 4. Apply the 1,200,000 TZS advance exclusively to CASH KONGOE USED items
    IF v_cash_kongoe_total > 0 THEN
        v_ratio := v_advance_target / v_cash_kongoe_total;

        UPDATE garage_requisitions
        SET 
            status = 'Partially Paid',
            amount_paid = ROUND((total_price * v_ratio)::numeric, 2),
            advance_payment = ROUND((total_price * v_ratio)::numeric, 2),
            status_updated_at = NOW()
        WHERE po_number = 'PO-20260923-0001'
          AND is_deleted = false
          AND (
              (v_cash_kongoe_supplier_id IS NOT NULL AND supplier_id = v_cash_kongoe_supplier_id)
              OR (v_cash_kongoe_supplier_id IS NULL AND item_name IN ('Center bolt', 'Repair bogi', 'Bogi pin', 'Leaf spring'))
          );

        RAISE NOTICE 'SUCCESS:';
        RAISE NOTICE 'KAPELO & SAHLA reset to Approved (No advance tags).';
        RAISE NOTICE 'CASH KONGOE USED set to Advance Paid: 1,200,000 TZS, Remaining Balance: % TZS', (v_cash_kongoe_total - v_advance_target);
    ELSE
        RAISE NOTICE 'CASH KONGOE USED items not found.';
    END IF;
END $$;
