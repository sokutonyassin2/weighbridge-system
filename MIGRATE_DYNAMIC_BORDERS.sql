-- Add dynamic borders support to transit trips
ALTER TABLE logistics_transit_trips 
ADD COLUMN IF NOT EXISTS borders_data JSONB DEFAULT '[]';

-- Optional: Migrate existing data to the new JSONB column
UPDATE logistics_transit_trips
SET borders_data = (
    SELECT jsonb_agg(x)
    FROM (
        SELECT name, arrival, departure
        FROM (
            VALUES 
                (checkpoint_1_name, checkpoint_1_arrival_date, checkpoint_1_departure_date),
                (checkpoint_2_name, checkpoint_2_arrival_date, checkpoint_2_departure_date),
                (checkpoint_3_name, checkpoint_3_arrival_date, checkpoint_3_departure_date)
        ) AS v(name, arrival, departure)
        WHERE name IS NOT NULL OR arrival IS NOT NULL
    ) x
)
WHERE borders_data = '[]' OR borders_data IS NULL;
