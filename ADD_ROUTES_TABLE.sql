-- ============================================================
-- Create logistics_routes table
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.logistics_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.logistics_routes ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "Authenticated users can read routes"
    ON public.logistics_routes FOR SELECT
    TO authenticated USING (true);

-- Allow authenticated users to insert/update/delete
CREATE POLICY "Authenticated users can manage routes"
    ON public.logistics_routes FOR ALL
    TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Pre-fill the 25 standard route locations
-- ============================================================
INSERT INTO public.logistics_routes (location_name) VALUES
('DAR ES SALAAM'),
('CCSA'),
('CHAMBISHI'),
('CHINGOLA'),
('CIKO MINING'),
('KABWE'),
('KALULUSHI'),
('KAMBOVE'),
('KAMOA'),
('KISANFU'),
('KITWE'),
('KOLOWEZI'),
('LAMIKALI'),
('LIKASI'),
('LUBUMBASHI'),
('LUSAKA'),
('LUWILU'),
('MFULILA'),
('MSONOI'),
('NDOLA'),
('SAKANIA'),
('SHITULU'),
('TANGA'),
('TCHISENDA'),
('TOMASI MINING')
ON CONFLICT DO NOTHING;
