-- Create Logistics Audit Logs Table
CREATE TABLE IF NOT EXISTS public.logistics_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL, -- e.g., 'EMERGENCY_REASSIGNMENT', 'MANUAL_OVERRIDE'
    driver_id UUID REFERENCES public.logistics_drivers(id) ON DELETE SET NULL,
    vehicle_id UUID REFERENCES public.logistics_fleet(id) ON DELETE SET NULL,
    old_values JSONB,
    new_values JSONB,
    reason TEXT NOT NULL,
    performed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.logistics_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow all for now (matching existing policy style in the project)
CREATE POLICY "Allow public access" ON public.logistics_audit_logs FOR ALL USING (true) WITH CHECK (true);

-- Add some helpful indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON logistics_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_driver_id ON logistics_audit_logs(driver_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_vehicle_id ON logistics_audit_logs(vehicle_id);
