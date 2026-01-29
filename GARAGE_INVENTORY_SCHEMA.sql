-- 1. Upgrade/Create Garage Inventory Table
DO $$ 
BEGIN
    -- If table exists but has old column names from legacy scripts, rename them
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'garage_inventory') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'garage_inventory' AND column_name = 'part_name') THEN
            ALTER TABLE public.garage_inventory RENAME COLUMN part_name TO item_name;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'garage_inventory' AND column_name = 'quantity_on_hand') THEN
            ALTER TABLE public.garage_inventory RENAME COLUMN quantity_on_hand TO quantity;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'garage_inventory' AND column_name = 'unit_cost') THEN
            ALTER TABLE public.garage_inventory RENAME COLUMN unit_cost TO unit_price;
        END IF;
        -- If SKU exists from legacy scripts, make it nullable so it doesn't block new inserts
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'garage_inventory' AND column_name = 'sku') THEN
            ALTER TABLE public.garage_inventory ALTER COLUMN sku DROP NOT NULL;
        END IF;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.garage_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL UNIQUE,
    category TEXT CHECK (category IN ('Parts', 'Fluids', 'Tools', 'General')),
    quantity INTEGER DEFAULT 0,
    min_threshold INTEGER DEFAULT 5,
    unit_price DECIMAL(10,2) DEFAULT 0,
    unit_measure TEXT DEFAULT 'pcs',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure all columns exist even if table was created by legacy script
ALTER TABLE public.garage_inventory ADD COLUMN IF NOT EXISTS item_name TEXT; -- redundant but safe
ALTER TABLE public.garage_inventory ADD COLUMN IF NOT EXISTS unit_measure TEXT DEFAULT 'pcs';
ALTER TABLE public.garage_inventory ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE public.garage_inventory ADD COLUMN IF NOT EXISTS min_threshold INTEGER DEFAULT 5;

-- Ensure item_name has a UNIQUE constraint (required for ON CONFLICT logic)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'garage_inventory_item_name_key' 
        AND conrelid = 'public.garage_inventory'::regclass
    ) THEN
        ALTER TABLE public.garage_inventory ADD CONSTRAINT garage_inventory_item_name_key UNIQUE (item_name);
    END IF;
END $$;

-- 2. Garage Requisitions Table
CREATE TABLE IF NOT EXISTS public.garage_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type TEXT NOT NULL CHECK (request_type IN ('Job', 'General', 'Emergency')),
    vehicle_id UUID REFERENCES public.logistics_fleet(id),
    job_id UUID REFERENCES public.garage_job_cards(id) ON DELETE CASCADE,
    item_id UUID REFERENCES public.garage_inventory(id),
    item_name TEXT NOT NULL,
    quantity_requested INTEGER NOT NULL DEFAULT 1,
    quantity_approved INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Partially Approved', 'Purchased', 'Stocked', 'Rejected')),
    requested_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    procurement_notes TEXT,
    internal_price DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE public.garage_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garage_requisitions ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Access Inventory' AND tablename = 'garage_inventory') THEN
        CREATE POLICY "Authenticated Access Inventory" ON public.garage_inventory FOR ALL TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated Access Requisitions' AND tablename = 'garage_requisitions') THEN
        CREATE POLICY "Authenticated Access Requisitions" ON public.garage_requisitions FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- 5. Create Indexes
CREATE INDEX IF NOT EXISTS idx_garage_inventory_name ON public.garage_inventory(item_name);
CREATE INDEX IF NOT EXISTS idx_garage_inventory_quantity ON public.garage_inventory(quantity);
CREATE INDEX IF NOT EXISTS idx_garage_requisitions_vehicle ON public.garage_requisitions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_garage_requisitions_job ON public.garage_requisitions(job_id);
CREATE INDEX IF NOT EXISTS idx_garage_requisitions_status ON public.garage_requisitions(status);

-- 6. Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_garage_inventory_updated_at ON public.garage_inventory;
CREATE TRIGGER update_garage_inventory_updated_at BEFORE UPDATE ON public.garage_inventory FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_garage_requisitions_updated_at ON public.garage_requisitions;
CREATE TRIGGER update_garage_requisitions_updated_at BEFORE UPDATE ON public.garage_requisitions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 7. Comments
COMMENT ON TABLE public.garage_inventory IS 'Main store inventory for the garage';
COMMENT ON TABLE public.garage_requisitions IS 'Item requests from garage to procurement';
