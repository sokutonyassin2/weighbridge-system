-- Migration to add country-specific exchange rates to logistics_trip_sheets
-- This allows TZ, Zambia, DRC, etc. to have unique rates instead of one global rate

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistics_trip_sheets' AND column_name='country_rates') THEN
        ALTER TABLE logistics_trip_sheets ADD COLUMN country_rates JSONB DEFAULT '{"TZ": 2700, "Zambia": 25.5, "DRC": 1.0, "Rwanda": 1250, "Burundi": 2850}'::jsonb;
    END IF;
END $$;

-- Optional: Update existing records to use the legacy exchange_rate as the default for TZ
UPDATE logistics_trip_sheets 
SET country_rates = jsonb_set(
    COALESCE(country_rates, '{"TZ": 2700, "Zambia": 25.5, "DRC": 1.0, "Rwanda": 1250, "Burundi": 2850}'::jsonb), 
    '{TZ}', 
    to_jsonb(COALESCE(exchange_rate, 2700))
)
WHERE exchange_rate IS NOT NULL;

-- Verify
SELECT 'MIGRATION COMPLETED: country_rates column added to logistics_trip_sheets' as result;
