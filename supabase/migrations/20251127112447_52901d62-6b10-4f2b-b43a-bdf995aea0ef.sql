-- Add came_loaded column to vehicle_entries for MV-vehicle workflow
ALTER TABLE vehicle_entries 
ADD COLUMN came_loaded boolean DEFAULT true;

COMMENT ON COLUMN vehicle_entries.came_loaded IS 
'For MV vehicles: true if vehicle arrived loaded, false if arrived empty. Determines which weight (gross/tare) to capture first.';