-- Add departments table for internal requisitions Target Company
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial departments
INSERT INTO public.departments (name) 
VALUES 
    ('Energy Oil'),
    ('Energy Feeds'),
    ('SudEnergy Logistics'),
    ('Sudsud Group'),
    ('Production Area')
ON CONFLICT (name) DO NOTHING;

-- Allow read access to all authenticated users
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all authenticated users on departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users on departments" ON public.departments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users on departments" ON public.departments FOR DELETE TO authenticated USING (true);

-- Add is_emergency column to garage_requisitions
ALTER TABLE public.garage_requisitions
ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false;
