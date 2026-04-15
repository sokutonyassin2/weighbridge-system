-- ============================================================
-- FIX: Create weighbridge_settings table
-- INSTRUCTIONS: Copy everything below and paste it into
--               Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS public.weighbridge_settings (
    id integer PRIMARY KEY DEFAULT 1,
    automatic_mode boolean NOT NULL DEFAULT false,
    hardware_bridge_url text NOT NULL DEFAULT 'http://localhost:5000',
    camera_enabled boolean NOT NULL DEFAULT false,
    camera_url text NOT NULL DEFAULT 'http://localhost:5000',
    require_image_capture boolean NOT NULL DEFAULT false,
    emergency_mode_active boolean NOT NULL DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT weighbridge_settings_single_row CHECK (id = 1)
);

-- Step 2: Enable Row Level Security
ALTER TABLE public.weighbridge_settings ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop old policies if they exist (safe to re-run)
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON public.weighbridge_settings;
DROP POLICY IF EXISTS "Allow updates for admins only" ON public.weighbridge_settings;
DROP POLICY IF EXISTS "Allow inserts for admins only" ON public.weighbridge_settings;

-- Step 4: SELECT - all authenticated users can read
CREATE POLICY "Allow read access for authenticated users"
    ON public.weighbridge_settings
    FOR SELECT
    TO authenticated
    USING (true);

-- Step 5: INSERT - admins and super_admins only
CREATE POLICY "Allow inserts for admins only"
    ON public.weighbridge_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin'::app_role, 'super_admin'::app_role)
        )
    );

-- Step 6: UPDATE - admins and super_admins only
CREATE POLICY "Allow updates for admins only"
    ON public.weighbridge_settings
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND role IN ('admin'::app_role, 'super_admin'::app_role)
        )
    );

-- Step 7: Insert the default row (safe, won't duplicate)
INSERT INTO public.weighbridge_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Done! The save button should now work.
