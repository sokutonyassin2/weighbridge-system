-- 🚚 TRIP FINANCIALS SCHEMA
-- This script creates the tables required for tracking trip-specific revenues and expenses.

-- 1. TRIP SHEETS TABLE (Summary of Financials)
CREATE TABLE IF NOT EXISTS public.logistics_trip_sheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.logistics_trips(id) ON DELETE CASCADE,
    revenue_type TEXT NOT NULL CHECK (revenue_type IN ('With Fuel', 'Without Fuel')),
    revenue_amount NUMERIC DEFAULT 0,
    total_expenses NUMERIC DEFAULT 0,
    net_profit NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(trip_id)
);

-- 2. TRIP EXPENSES TABLE (Line-by-line breakdown)
CREATE TABLE IF NOT EXISTS public.logistics_trip_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.logistics_trips(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('TZ', 'Zambia', 'DRC', 'Fixed')),
    item_name TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'TZS')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. ENABLE RLS
ALTER TABLE public.logistics_trip_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_trip_expenses ENABLE ROW LEVEL SECURITY;

-- Apply "Full Access" policies for authenticated users
DROP POLICY IF EXISTS "Auth Full Access" ON public.logistics_trip_sheets;
CREATE POLICY "Auth Full Access" ON public.logistics_trip_sheets FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Full Access" ON public.logistics_trip_expenses;
CREATE POLICY "Auth Full Access" ON public.logistics_trip_expenses FOR ALL USING (auth.role() = 'authenticated');

-- 4. TRIGGERS FOR UPDATED_AT
DROP TRIGGER IF EXISTS update_logistics_trip_sheets_updated_at ON public.logistics_trip_sheets;
CREATE TRIGGER update_logistics_trip_sheets_updated_at BEFORE UPDATE ON public.logistics_trip_sheets FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_logistics_trip_expenses_updated_at ON public.logistics_trip_expenses;
CREATE TRIGGER update_logistics_trip_expenses_updated_at BEFORE UPDATE ON public.logistics_trip_expenses FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Final Verification
SELECT 'TRIP FINANCIALS SCHEMA CREATED SUCCESSFULLY' as result;
