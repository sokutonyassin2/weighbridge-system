-- ============================================================
-- 🚀 THE ULTIMATE MASTER FIX: LOGISTICS DB (V7 - CONVOYS)
-- Run this in your Supabase SQL Editor to solve ALL errors.
-- ============================================================

-- 1. Ensure all required columns exist in the TRIP SHEETS table
ALTER TABLE public.logistics_trip_sheets
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Planned',
ADD COLUMN IF NOT EXISTS vehicle_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS driver_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS trailer_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'Headquarters',
ADD COLUMN IF NOT EXISTS destination TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS journey_type TEXT DEFAULT 'Go & Return',
ADD COLUMN IF NOT EXISTS cargo_outbound TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS agreed_days INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS daily_fine_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS revenue_type TEXT DEFAULT 'Without Fuel',
ADD COLUMN IF NOT EXISTS revenue_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS revenue_currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15,2) DEFAULT 2700,
ADD COLUMN IF NOT EXISTS fuel_liters NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fuel_price NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fuel_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_expenses_tzs NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_expenses_usd NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_profit_usd NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS approved_by UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS approved_by_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS created_by_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS activated_by UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS activated_by_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS convoy_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS convoy_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS active_countries TEXT[] DEFAULT ARRAY['TZ']::TEXT[];

-- 2. Make trip_id nullable
ALTER TABLE public.logistics_trip_sheets ALTER COLUMN trip_id DROP NOT NULL;
ALTER TABLE public.logistics_trip_expenses ALTER COLUMN trip_id DROP NOT NULL;

-- 3. FIX THE EXPENSES TABLE
ALTER TABLE public.logistics_trip_expenses 
ADD COLUMN IF NOT EXISTS trip_sheet_id UUID,
ADD COLUMN IF NOT EXISTS item_name TEXT DEFAULT 'Expense',
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT 'Expense Item',
ADD COLUMN IF NOT EXISTS nature TEXT DEFAULT 'Operational',
ADD COLUMN IF NOT EXISTS amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Fixed';

-- Ensure description and nature are nullable
ALTER TABLE public.logistics_trip_expenses ALTER COLUMN description DROP NOT NULL;
ALTER TABLE public.logistics_trip_expenses ALTER COLUMN nature DROP NOT NULL;

-- 4. Force Foreign Keys
ALTER TABLE public.logistics_trip_expenses DROP CONSTRAINT IF EXISTS logistics_trip_expenses_trip_sheet_id_fkey;
ALTER TABLE public.logistics_trip_expenses 
    ADD CONSTRAINT logistics_trip_expenses_trip_sheet_id_fkey 
    FOREIGN KEY (trip_sheet_id) REFERENCES public.logistics_trip_sheets(id) ON DELETE CASCADE;

-- 5. ⚡️ THE FINAL CACHE KICK ⚡️
ALTER TABLE public.logistics_trip_sheets ADD COLUMN IF NOT EXISTS _master_refresh_v7 BIT;
ALTER TABLE public.logistics_trip_sheets DROP COLUMN IF EXISTS _master_refresh_v7;
ALTER TABLE public.logistics_trip_expenses ADD COLUMN IF NOT EXISTS _master_refresh_v7 BIT;
ALTER TABLE public.logistics_trip_expenses DROP COLUMN IF EXISTS _master_refresh_v7;

NOTIFY pgrst, 'reload schema';
SELECT pg_sleep(1);
NOTIFY pgrst, 'reload schema';
