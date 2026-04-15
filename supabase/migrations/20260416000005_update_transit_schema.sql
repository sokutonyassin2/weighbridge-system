-- Add missing columns to transit trips
ALTER TABLE logistics_transit_trips 
ADD COLUMN IF NOT EXISTS nature TEXT,
ADD COLUMN IF NOT EXISTS trip_sheet_id UUID REFERENCES logistics_trip_sheets(id);

-- Create Route Templates table
CREATE TABLE IF NOT EXISTS logistics_route_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_name TEXT UNIQUE NOT NULL,
    destination TEXT NOT NULL,
    nature TEXT,
    milestones JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE logistics_route_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access for authenticated" ON logistics_route_templates FOR ALL USING (auth.role() = 'authenticated');
