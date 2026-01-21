-- Create Logistics Asset Types table
CREATE TABLE IF NOT EXISTS logistics_asset_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('Vehicle', 'Trailer', 'Cycle')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE logistics_asset_types ENABLE ROW LEVEL SECURITY;

-- Simple policy for authenticated users
CREATE POLICY "Allow full access to authenticated users" ON logistics_asset_types
    FOR ALL USING (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_logistics_asset_types_updated_at
    BEFORE UPDATE ON logistics_asset_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update logistics_fleet to make asset_type a reference if needed, 
-- but for now we keep it as TEXT and just validate via UI.
-- Optional: Add a foreign key later if strict integrity is preferred.
