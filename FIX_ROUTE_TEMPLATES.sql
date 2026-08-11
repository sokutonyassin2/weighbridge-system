-- Force add all columns to logistics_route_templates
ALTER TABLE logistics_route_templates 
ADD COLUMN IF NOT EXISTS route_name TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS destination TEXT,
ADD COLUMN IF NOT EXISTS nature TEXT,
ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Reload the schema cache so Supabase API sees the new columns instantly
NOTIFY pgrst, 'reload schema';
