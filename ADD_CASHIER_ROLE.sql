-- RUN THIS IN SUPABASE SQL EDITOR TO UNLOCK THE PROCUREMENT CASHIER ROLE
-- This allows you to assign the 'procurement_cashier' role to users.

DO $$ 
BEGIN
    -- Check and add procurement_cashier to the app_role enum
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'procurement_cashier') THEN
        ALTER TYPE public.app_role ADD VALUE 'procurement_cashier';
    END IF;
END $$;
