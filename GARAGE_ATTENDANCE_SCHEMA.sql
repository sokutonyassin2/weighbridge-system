-- Garage Personnel & Attendance Schema

-- 1. Personnel Management Table
CREATE TABLE IF NOT EXISTS garage_personnel (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    position TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Daily Attendance Tracking Table
CREATE TABLE IF NOT EXISTS garage_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    personnel_id UUID REFERENCES garage_personnel(id) ON DELETE CASCADE,
    date DATE DEFAULT CURRENT_DATE,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'On Leave', 'Late')),
    time_in TIME,
    time_out TIME,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(personnel_id, date)
);

-- Enable RLS
ALTER TABLE garage_personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_attendance ENABLE ROW LEVEL SECURITY;

-- Allow authenticated access (simplified for now, can be restricted further)
CREATE POLICY "Enable read for authenticated users" ON garage_personnel FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON garage_personnel FOR ALL TO authenticated USING (true);

CREATE POLICY "Enable read for authenticated users" ON garage_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON garage_attendance FOR ALL TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_date ON garage_attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_personnel ON garage_attendance(personnel_id);
