-- VEHICLE EQUIPMENT & PRE-DEPARTURE CHECKLIST SCHEMA
-- Implements tracking of equipment assigned to specific logistics fleet vehicles.

CREATE TABLE IF NOT EXISTS public.vehicle_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.logistics_fleet(id) ON DELETE CASCADE,
    item_name VARCHAR(255) NOT NULL, -- e.g., 'Spare Tyre', 'Fire Extinguisher', 'Reflector Triangle'
    serial_number VARCHAR(255), -- Unique identifier for asset tracking
    quantity INTEGER NOT NULL DEFAULT 1,
    condition VARCHAR(50) NOT NULL DEFAULT 'Good' CHECK (condition IN ('Good', 'Fair', 'Damaged', 'Missing')),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked_by UUID REFERENCES auth.users(id),
    notes TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for speedy lookups
CREATE INDEX IF NOT EXISTS idx_vehicle_equipment_vehicle ON public.vehicle_equipment(vehicle_id) WHERE is_deleted = FALSE;

-- Enable Row Level Security
ALTER TABLE public.vehicle_equipment ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to perform all operations
DROP POLICY IF EXISTS "Authenticated Read Access Eq" ON public.vehicle_equipment;
CREATE POLICY "Authenticated Read Access Eq" ON public.vehicle_equipment FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated Full Access Eq" ON public.vehicle_equipment;
CREATE POLICY "Authenticated Full Access Eq" ON public.vehicle_equipment FOR ALL TO authenticated USING (true);

-- Trigger to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_vehicle_equipment_updated_at ON public.vehicle_equipment;
CREATE TRIGGER update_vehicle_equipment_updated_at 
    BEFORE UPDATE ON public.vehicle_equipment 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();

-- Comment on table to describe its purpose
COMMENT ON TABLE public.vehicle_equipment IS 'Tracks equipment and toolkit items assigned to fleet vehicles for yard checkouts and driver safety.';
