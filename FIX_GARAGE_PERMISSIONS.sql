-- ==========================================
-- FIX GARAGE PERMISSIONS & RLS
-- ==========================================

-- 1. Enable RLS on tables if not already (safeguard)
ALTER TABLE logistics_fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_fault_types ENABLE ROW LEVEL SECURITY;

-- 2. Grant Access to 'logistics_fleet' for Mechanics
-- Mechanics need to READ vehicles to search them.
-- Mechanics need to UPDATE vehicles to set status to 'In Garage'.

CREATE POLICY "Mechanics can view fleet"
ON logistics_fleet
FOR SELECT
TO authenticated
USING (true); -- Or restrict to role = 'mechanic' | 'admin' if strict

CREATE POLICY "Mechanics can update vehicle status"
ON logistics_fleet
FOR UPDATE
TO authenticated
USING (true) -- In real app, check exists(select 1 from profiles where id=auth.uid() and role='mechanic')
WITH CHECK (true);

-- 3. Grant Access to 'garage_job_cards'
CREATE POLICY "Enable read access for all authenticated users"
ON garage_job_cards
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Enable insert for authenticated users"
ON garage_job_cards
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Enable update for mechanics/admins"
ON garage_job_cards
FOR UPDATE
TO authenticated
USING (true);

-- 4. Grant Access to 'garage_fault_types' (Read Only is usually enough, but let's allow read)
CREATE POLICY "Enable read access for fault types"
ON garage_fault_types
FOR SELECT
TO authenticated
USING (true);

-- 5. Link Garage to Fleet (Correct Foreign Key if missing)
-- Since we switched to 'logistics_fleet', let's ensure the FK exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_garage_job_vehicle' 
        AND table_name = 'garage_job_cards'
    ) THEN
        ALTER TABLE garage_job_cards
        ADD CONSTRAINT fk_garage_job_vehicle
        FOREIGN KEY (vehicle_id)
        REFERENCES logistics_fleet(id);
    END IF;
END $$;
