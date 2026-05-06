-- Add columns for Leg Type, Sequence, and Parent Trip ID to logistics_trips
ALTER TABLE logistics_trips 
ADD COLUMN IF NOT EXISTS leg_type TEXT DEFAULT 'G',
ADD COLUMN IF NOT EXISTS leg_sequence INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_trip_id UUID REFERENCES logistics_trips(id);

-- Create logistics_trip_events table for milestone tracking
CREATE TABLE IF NOT EXISTS logistics_trip_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID NOT NULL REFERENCES logistics_trips(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    location_name TEXT,
    notes TEXT,
    operator_name TEXT,
    operator_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE logistics_trip_events ENABLE ROW LEVEL SECURITY;

-- Create policies for logistics_trip_events
CREATE POLICY "Enable read access for authenticated users" ON logistics_trip_events
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON logistics_trip_events
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create a view or index if necessary (optional, but good for performance)
CREATE INDEX IF NOT EXISTS idx_logistics_trip_events_trip_id ON logistics_trip_events(trip_id);
