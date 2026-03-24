-- Migration: Add centralized weighbridge settings table
-- Name: 20260323013000_weighbridge_settings.sql

-- Create the settings table
CREATE TABLE IF NOT EXISTS public.weighbridge_settings (
    id integer PRIMARY KEY DEFAULT 1,
    automatic_mode boolean NOT NULL DEFAULT false,
    hardware_bridge_url text NOT NULL DEFAULT 'http://localhost:5000',
    camera_enabled boolean NOT NULL DEFAULT false,
    camera_url text NOT NULL DEFAULT 'http://localhost:5000',
    require_image_capture boolean NOT NULL DEFAULT false,
    emergency_mode_active boolean NOT NULL DEFAULT false,
    updated_at timestamp with time zone DEFAULT now(),
    
    -- Constraint to ensure only one row exists (the master settings row)
    CONSTRAINT weighbridge_settings_single_row CHECK (id = 1)
);

-- Enable Row Level Security
ALTER TABLE public.weighbridge_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to all authenticated users
CREATE POLICY "Allow read access for authenticated users" 
    ON public.weighbridge_settings 
    FOR SELECT 
    TO authenticated 
    USING (true);

-- Policy: Allow updates ONLY by 'admin' or 'super_admin' roles
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

-- Insert the default starting row if it doesn't exist
INSERT INTO public.weighbridge_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
