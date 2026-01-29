-- FIX: RE-ALIGN GARAGE JOB CARDS WITH ACTIVE FLEET TABLE
-- This script removes the legacy reference to 'logistics_vehicles' and points strictly to 'logistics_fleet'

DO $$
BEGIN
    -- 1. Drop the specific constraint mentioned in the error if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'garage_job_cards_vehicle_id_fkey' AND table_name = 'garage_job_cards') THEN
        ALTER TABLE public.garage_job_cards DROP CONSTRAINT garage_job_cards_vehicle_id_fkey;
    END IF;

    -- 2. Drop the redundant constraint if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_garage_job_vehicle' AND table_name = 'garage_job_cards') THEN
        ALTER TABLE public.garage_job_cards DROP CONSTRAINT fk_garage_job_vehicle;
    END IF;

    -- 3. Add the definitive constraint pointing to logistics_fleet
    ALTER TABLE public.garage_job_cards
    ADD CONSTRAINT fk_garage_job_vehicle
    FOREIGN KEY (vehicle_id)
    REFERENCES public.logistics_fleet(id)
    ON DELETE CASCADE;

    RAISE NOTICE 'Garage job cards successfully re-aligned with logistics_fleet table.';
END $$;
