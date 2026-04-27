-- 🚚 LOGISTICS TRIP SETTLEMENTS SCHEMA
-- Run this in your Supabase SQL Editor to enable the Stealth Accountability System.

-- 1. Create the Settlements Table
CREATE TABLE IF NOT EXISTS public.logistics_trip_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.logistics_trip_sheets(id) ON DELETE CASCADE,
    receipt_description TEXT NOT NULL,
    amount_tzs NUMERIC DEFAULT 0,
    amount_usd NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'TZS',
    entered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_excel_upload BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.logistics_trip_settlements ENABLE ROW LEVEL SECURITY;

-- 3. Security Policy: Only Authenticated Users for now (UI will handle Stealth filtering)
DROP POLICY IF EXISTS "Authenticated Full Access" ON public.logistics_trip_settlements;
CREATE POLICY "Authenticated Full Access" ON public.logistics_trip_settlements 
    FOR ALL USING (auth.role() = 'authenticated');

-- 4. Enable Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'logistics_trip_settlements'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE logistics_trip_settlements;
    END IF;
END $$;

-- 5. Add helper column to trip_sheets to track if audit is complete
ALTER TABLE public.logistics_trip_sheets ADD COLUMN IF NOT EXISTS audit_status TEXT DEFAULT 'Pending' CHECK (audit_status IN ('Pending', 'In Progress', 'Verified'));
