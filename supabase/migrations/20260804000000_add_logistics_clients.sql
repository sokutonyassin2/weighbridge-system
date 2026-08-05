-- Create logistics_clients table
CREATE TABLE IF NOT EXISTS public.logistics_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed logistics_clients with existing client names from trip sheets and transit tracking
-- Use regexp_replace to strip ALL whitespace variants (including non-breaking spaces \u00A0)
INSERT INTO public.logistics_clients (name)
SELECT DISTINCT UPPER(TRIM(regexp_replace(client_name, '[\s\u00A0]+', ' ', 'g')))
FROM (
    SELECT client_name FROM public.logistics_trip_sheets WHERE client_name IS NOT NULL AND TRIM(client_name) <> ''
    UNION
    SELECT client_name FROM public.logistics_transit_trips WHERE client_name IS NOT NULL AND TRIM(client_name) <> ''
) AS existing_clients
ON CONFLICT (name) DO NOTHING;

-- Cleanup: remove duplicate client names that differ only by invisible characters
DELETE FROM public.logistics_clients a
USING public.logistics_clients b
WHERE a.id > b.id
  AND UPPER(TRIM(regexp_replace(a.name, '[\s\u00A0]+', ' ', 'g')))
    = UPPER(TRIM(regexp_replace(b.name, '[\s\u00A0]+', ' ', 'g')));

-- Enable Row Level Security (RLS)
ALTER TABLE public.logistics_clients ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for authenticated users
CREATE POLICY "Access for authenticated" ON public.logistics_clients
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
