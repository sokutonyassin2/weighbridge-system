-- Add branding_form_url column to logistics_fleet table
-- This will store the Supabase Storage URL for each vehicle's branding PDF

ALTER TABLE logistics_fleet
ADD COLUMN IF NOT EXISTS branding_form_url TEXT;

COMMENT ON COLUMN logistics_fleet.branding_form_url IS 'URL to the branding form PDF stored in Supabase Storage';
