-- ==============================================================================
-- Migration: CREATE_ROUTE_EXPENSES_MASTER_TABLE.sql
-- Description: Creates logistics_route_expenses_master to store destination templates
-- in Supabase so that all clients (local & production) share configured routes & expenses.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.logistics_route_expenses_master (
    destination TEXT PRIMARY KEY,
    expenses JSONB NOT NULL DEFAULT '[]'::jsonb,
    origin TEXT DEFAULT 'DAR ES SALAAM',
    default_rate_usd NUMERIC,
    default_exchange_rate NUMERIC DEFAULT 2700,
    default_cargo TEXT,
    agreed_days INTEGER,
    fuel_liters NUMERIC,
    fuel_rate_usd NUMERIC,
    fuel_rate_tzs NUMERIC,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure fuel columns exist if table already exists
ALTER TABLE public.logistics_route_expenses_master
ADD COLUMN IF NOT EXISTS fuel_liters NUMERIC,
ADD COLUMN IF NOT EXISTS fuel_rate_usd NUMERIC,
ADD COLUMN IF NOT EXISTS fuel_rate_tzs NUMERIC;

-- Enable Row Level Security
ALTER TABLE public.logistics_route_expenses_master ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if present
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow all users to manage route expenses master" ON public.logistics_route_expenses_master;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Allow full access to authenticated and anon users (system operational table)
CREATE POLICY "Allow all users to manage route expenses master"
ON public.logistics_route_expenses_master
FOR ALL
USING (true)
WITH CHECK (true);

-- Ensure logistics_route_templates has all required columns as well
ALTER TABLE IF EXISTS public.logistics_route_templates
ADD COLUMN IF NOT EXISTS route_name TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS destination TEXT,
ADD COLUMN IF NOT EXISTS nature TEXT,
ADD COLUMN IF NOT EXISTS milestones JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
