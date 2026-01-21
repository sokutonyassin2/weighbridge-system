-- =====================================================
-- VEHICLE COUPLING SYSTEM - DATABASE SCHEMA
-- =====================================================
-- This migration adds support for coupling horses with trailers
-- and tracking assignment status for operation switching validation

-- 1. Add coupling_status column to logistics_fleet
ALTER TABLE logistics_fleet 
ADD COLUMN IF NOT EXISTS coupling_status TEXT DEFAULT 'uncoupled' 
CHECK (coupling_status IN ('uncoupled', 'coupled'));

-- 2. Add assignment_status column to logistics_fleet
ALTER TABLE logistics_fleet 
ADD COLUMN IF NOT EXISTS assignment_status TEXT DEFAULT 'Available' 
CHECK (assignment_status IN ('Available', 'On Job', 'In Transit', 'Maintenance', 'Breakdown'));

-- 3. Create logistics_couplings table
CREATE TABLE IF NOT EXISTS logistics_couplings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    horse_id UUID NOT NULL REFERENCES logistics_fleet(id) ON DELETE CASCADE,
    trailer_id UUID NOT NULL REFERENCES logistics_fleet(id) ON DELETE CASCADE,
    coupled_at TIMESTAMP DEFAULT NOW(),
    coupled_by UUID REFERENCES profiles(id),
    uncoupled_at TIMESTAMP,
    uncoupled_by UUID REFERENCES profiles(id),
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure horse and trailer are different vehicles
    CONSTRAINT different_vehicles CHECK (horse_id != trailer_id)
);

-- 4. Create unique indexes to enforce one-to-one coupling
-- Ensure a trailer can only be coupled to one horse at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_trailer_coupling 
ON logistics_couplings (trailer_id) 
WHERE is_active = true;

-- Ensure a horse can only be coupled to one trailer at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_horse_coupling 
ON logistics_couplings (horse_id) 
WHERE is_active = true;

-- 5. Create index for faster coupling lookups
CREATE INDEX IF NOT EXISTS idx_couplings_active 
ON logistics_couplings (is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_couplings_horse 
ON logistics_couplings (horse_id);

CREATE INDEX IF NOT EXISTS idx_couplings_trailer 
ON logistics_couplings (trailer_id);

-- 6. Add comments for documentation
COMMENT ON TABLE logistics_couplings IS 'Tracks coupling relationships between horses and trailers';
COMMENT ON COLUMN logistics_fleet.coupling_status IS 'Current coupling status: uncoupled or coupled';
COMMENT ON COLUMN logistics_fleet.assignment_status IS 'Current assignment status: Available, On Job, In Transit, Maintenance, or Breakdown';
COMMENT ON COLUMN logistics_couplings.is_active IS 'True if coupling is currently active, false if uncoupled';
COMMENT ON COLUMN logistics_couplings.coupled_by IS 'User who created the coupling';
COMMENT ON COLUMN logistics_couplings.uncoupled_by IS 'User who uncoupled the vehicles';

-- 7. Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_coupling_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_coupling_timestamp
BEFORE UPDATE ON logistics_couplings
FOR EACH ROW
EXECUTE FUNCTION update_coupling_timestamp();

-- 8. Enable RLS on logistics_couplings
ALTER TABLE logistics_couplings ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS policies for logistics_couplings
-- Allow authenticated users to view all couplings
CREATE POLICY "Allow authenticated users to view couplings"
ON logistics_couplings
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to create couplings
CREATE POLICY "Allow authenticated users to create couplings"
ON logistics_couplings
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update couplings
CREATE POLICY "Allow authenticated users to update couplings"
ON logistics_couplings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete couplings
CREATE POLICY "Allow authenticated users to delete couplings"
ON logistics_couplings
FOR DELETE
TO authenticated
USING (true);

-- 10. Sample data for testing (optional - comment out in production)
-- UPDATE logistics_fleet SET assignment_status = 'Available' WHERE assignment_status IS NULL;
-- UPDATE logistics_fleet SET coupling_status = 'uncoupled' WHERE coupling_status IS NULL;
