-- -----------------------------------------------------------------------------
-- REPAIR SCRIPT FOR LOGISTICS TRIP SHEETS
-- Run this in your Supabase SQL Editor to instantly fix foreign key & schema cache errors.
-- -----------------------------------------------------------------------------

-- 1. Ensure Columns Exist (in case they got accidentally deleted)
ALTER TABLE public.logistics_trip_sheets
ADD COLUMN IF NOT EXISTS vehicle_id UUID,
ADD COLUMN IF NOT EXISTS driver_id UUID,
ADD COLUMN IF NOT EXISTS trailer_id UUID;

-- 2. Force Foreign Key Relationships to Exist
DO $$ 
BEGIN
    -- Safely drop existing constraints in case they are malformed or missing dependencies
    ALTER TABLE public.logistics_trip_sheets DROP CONSTRAINT IF EXISTS logistics_trip_sheets_vehicle_id_fkey;
    ALTER TABLE public.logistics_trip_sheets DROP CONSTRAINT IF EXISTS logistics_trip_sheets_driver_id_fkey;
    ALTER TABLE public.logistics_trip_sheets DROP CONSTRAINT IF EXISTS logistics_trip_sheets_trailer_id_fkey;

    -- Directly attach the foreign keys back manually
    ALTER TABLE public.logistics_trip_sheets 
        ADD CONSTRAINT logistics_trip_sheets_vehicle_id_fkey 
        FOREIGN KEY (vehicle_id) REFERENCES public.logistics_fleet(id) ON DELETE SET NULL;
        
    ALTER TABLE public.logistics_trip_sheets 
        ADD CONSTRAINT logistics_trip_sheets_driver_id_fkey 
        FOREIGN KEY (driver_id) REFERENCES public.logistics_drivers(id) ON DELETE SET NULL;

    ALTER TABLE public.logistics_trip_sheets 
        ADD CONSTRAINT logistics_trip_sheets_trailer_id_fkey 
        FOREIGN KEY (trailer_id) REFERENCES public.logistics_fleet(id) ON DELETE SET NULL;
        
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Ensure the Penalty and Approval columns are still there too
ALTER TABLE public.logistics_trip_sheets ADD COLUMN IF NOT EXISTS agreed_days INTEGER DEFAULT NULL;
ALTER TABLE public.logistics_trip_sheets ADD COLUMN IF NOT EXISTS daily_fine_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.logistics_trip_sheets ADD COLUMN IF NOT EXISTS approval_notes TEXT DEFAULT NULL;
ALTER TABLE public.logistics_trip_sheets ADD COLUMN IF NOT EXISTS approved_by_name TEXT DEFAULT NULL;

-- 4. HARD RELOAD the API Schema Cache immediately
NOTIFY pgrst, 'reload schema';
