-- ==========================================================
-- STRICT WEIGH LIMITS & DATA CLEANUP
-- ==========================================================
-- 1. Prevent more than 3 weigh records per entry
-- This is the ultimate protection against double-clicking or rapid clicking.
ALTER TABLE public.weigh_records
DROP CONSTRAINT IF EXISTS max_weighs_check;

ALTER TABLE public.weigh_records
ADD CONSTRAINT max_weighs_check CHECK (weigh_number <= 3);

COMMENT ON CONSTRAINT max_weighs_check ON public.weigh_records IS 'Strictly prevents saving more than 3 weigh attempts per vehicle.';

-- 2. Optional: Clean up existing data that exceeded the limit
-- (Keep only the first 3 if any had 4 or 5)
-- Note: This is commented out for safety. Run manually if needed.
/*
DELETE FROM public.weigh_records 
WHERE id IN (
    SELECT id FROM (
        SELECT id, row_number() OVER (PARTITION BY entry_id ORDER BY created_at ASC) as rnum
        FROM public.weigh_records
    ) t WHERE t.rnum > 3
);
*/
