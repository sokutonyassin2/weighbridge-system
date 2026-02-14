-- ==========================================================
-- GARAGE ISSUANCE APPROVAL & ACCOUNTABILITY UPGRADE
-- ==========================================================

-- 1. Add approval tracking columns to garage_inventory_usage
ALTER TABLE public.garage_inventory_usage 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- 2. Update existing records to 'Approved' so history remains intact
UPDATE public.garage_inventory_usage 
SET status = 'Approved' 
WHERE status = 'Pending' AND created_at < NOW() - INTERVAL '5 minutes';

-- 3. Upgrade the trigger function to only reduce stock on status change to 'Approved'
CREATE OR REPLACE FUNCTION handle_inventory_usage_decrement()
RETURNS TRIGGER AS $$
BEGIN
    -- Only reduce stock when status moves from Pending to Approved
    -- Or if it's inserted as Approved (for any legacy reasons, though UI will send Pending)
    IF (TG_OP = 'UPDATE' AND OLD.status = 'Pending' AND NEW.status = 'Approved') OR 
       (TG_OP = 'INSERT' AND NEW.status = 'Approved') THEN
        
        UPDATE public.garage_inventory
        SET quantity = quantity - NEW.quantity_used,
            updated_at = NOW()
        WHERE id = NEW.item_id;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Re-configure the trigger to run on BOTH INSERT and UPDATE
DROP TRIGGER IF EXISTS tr_decrement_stock_on_usage ON public.garage_inventory_usage;

CREATE TRIGGER tr_decrement_stock_on_usage
AFTER INSERT OR UPDATE ON public.garage_inventory_usage
FOR EACH ROW
EXECUTE FUNCTION handle_inventory_usage_decrement();

COMMENT ON COLUMN public.garage_inventory_usage.status IS 'Status of the issuance: Pending (needs manager approval), Approved (stock reduced), Rejected';
