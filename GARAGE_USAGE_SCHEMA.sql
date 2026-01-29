-- GARAGE_USAGE_SCHEMA.sql
-- Table to track DAILY ACTIVITY of items taken from the store

CREATE TABLE IF NOT EXISTS public.garage_inventory_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.garage_inventory(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    quantity_used INTEGER NOT NULL CHECK (quantity_used > 0),
    issued_to TEXT NOT NULL, -- Mechanic or Personnel name
    vehicle_id UUID REFERENCES public.logistics_fleet(id) ON DELETE SET NULL,
    job_id UUID REFERENCES public.garage_job_cards(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.garage_inventory_usage ENABLE ROW LEVEL SECURITY;

-- Create Policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Access Usage' AND tablename = 'garage_inventory_usage') THEN
        CREATE POLICY "Authenticated Access Usage" ON public.garage_inventory_usage FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_garage_usage_item ON public.garage_inventory_usage(item_id);
CREATE INDEX IF NOT EXISTS idx_garage_usage_vehicle ON public.garage_inventory_usage(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_garage_usage_job ON public.garage_inventory_usage(job_id);
CREATE INDEX IF NOT EXISTS idx_garage_usage_date ON public.garage_inventory_usage(created_at);

-- Add update trigger
DROP TRIGGER IF EXISTS update_garage_inventory_usage_updated_at ON public.garage_inventory_usage;
CREATE TRIGGER update_garage_inventory_usage_updated_at BEFORE UPDATE ON public.garage_inventory_usage FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Function to handle stock subtraction on usage
CREATE OR REPLACE FUNCTION handle_inventory_usage_decrement()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.garage_inventory
    SET quantity = quantity - NEW.quantity_used,
        updated_at = NOW()
    WHERE id = NEW.item_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automate stock reduction
DROP TRIGGER IF EXISTS tr_decrement_stock_on_usage ON public.garage_inventory_usage;
CREATE TRIGGER tr_decrement_stock_on_usage
AFTER INSERT ON public.garage_inventory_usage
FOR EACH ROW
EXECUTE FUNCTION handle_inventory_usage_decrement();

COMMENT ON TABLE public.garage_inventory_usage IS 'Tracks daily consumption and issuance of garage products';
