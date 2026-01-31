-- Add active status to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update foreign keys to ensure data safety on user deletion
-- These records should NEVER be deleted when an operator/admin is removed

-- Shifts
ALTER TABLE public.shifts 
DROP CONSTRAINT IF EXISTS shifts_operator_id_fkey,
ADD CONSTRAINT shifts_operator_id_fkey 
FOREIGN KEY (operator_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Vehicle Entries
ALTER TABLE public.vehicle_entries 
DROP CONSTRAINT IF EXISTS vehicle_entries_operator_id_fkey,
ADD CONSTRAINT vehicle_entries_operator_id_fkey 
FOREIGN KEY (operator_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Weigh Records
ALTER TABLE public.weigh_records 
DROP CONSTRAINT IF EXISTS weigh_records_operator_id_fkey,
ADD CONSTRAINT weigh_records_operator_id_fkey 
FOREIGN KEY (operator_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Payments (Cashier)
ALTER TABLE public.payments 
DROP CONSTRAINT IF EXISTS payments_cashier_id_fkey,
ADD CONSTRAINT payments_cashier_id_fkey 
FOREIGN KEY (cashier_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Activity Logs
ALTER TABLE public.activity_logs 
DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey,
ADD CONSTRAINT activity_logs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
