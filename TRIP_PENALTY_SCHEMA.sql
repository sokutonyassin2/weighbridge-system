-- Enable tracking of Trip Penalties on the Standalone Trip Sheets

-- Add Agreed Duration (Days)
ALTER TABLE logistics_trip_sheets
ADD COLUMN IF NOT EXISTS agreed_days INTEGER DEFAULT NULL;

-- Add Daily Fine Amount (Penalty for exceeding the agreed duration)
ALTER TABLE logistics_trip_sheets
ADD COLUMN IF NOT EXISTS daily_fine_amount NUMERIC(15,2) DEFAULT 0;

-- Comments for documentation
COMMENT ON COLUMN logistics_trip_sheets.agreed_days IS 'The agreed number of days for the trip before penalties apply.';
COMMENT ON COLUMN logistics_trip_sheets.daily_fine_amount IS 'The daily penalty fine applied if the trip duration exceeds the agreed_days.';
