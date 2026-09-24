-- Trip Location Updates table
-- Stores real-time location checkpoint updates for transit trips
-- Each entry represents a location update with optional reason

CREATE TABLE IF NOT EXISTS trip_location_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES logistics_transit_trips(id) ON DELETE CASCADE,
    location TEXT NOT NULL,
    reason TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by trip_id
CREATE INDEX IF NOT EXISTS idx_trip_location_updates_trip_id ON trip_location_updates(trip_id);

-- RLS
ALTER TABLE trip_location_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Access for authenticated" ON trip_location_updates FOR ALL USING (auth.role() = 'authenticated');
