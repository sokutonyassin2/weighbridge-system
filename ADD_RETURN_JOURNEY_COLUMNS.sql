-- Add Return Journey tracking columns to transit trips
-- return_borders_data is JSONB (dynamic) — each trip stores its own return border points
-- Works exactly like borders_data: different routes = different return checkpoints

ALTER TABLE logistics_transit_trips 
ADD COLUMN IF NOT EXISTS departure_from_site_date DATE,
ADD COLUMN IF NOT EXISTS return_borders_data JSONB DEFAULT '[]';
