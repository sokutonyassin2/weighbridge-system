-- Add client_name to logistics_trip_sheets if it doesn't exist
ALTER TABLE logistics_trip_sheets ADD COLUMN IF NOT EXISTS client_name TEXT;

-- Add client_name to logistics_transit_trips if it doesn't exist
ALTER TABLE logistics_transit_trips ADD COLUMN IF NOT EXISTS client_name TEXT;

-- Update comments for clarity
COMMENT ON COLUMN logistics_trip_sheets.client_name IS 'The company or client name associated with the trip group.';
COMMENT ON COLUMN logistics_transit_trips.client_name IS 'The company or client name associated with the transit mission.';
