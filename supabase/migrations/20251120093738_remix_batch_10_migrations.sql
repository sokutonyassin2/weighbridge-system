
-- Migration: 20251012103956
-- Create enum for vehicle categories
CREATE TYPE vehicle_category AS ENUM ('JV-Payment', 'JV-Free', 'Transit', 'MV-Company', 'MV-PublicSeller', 'MV-Supplier');

-- Create enum for payment status
CREATE TYPE payment_status AS ENUM ('Pending', 'Paid', 'Overdue', 'Waived');

-- Create shifts table
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_name TEXT NOT NULL,
  shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  operator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vehicle_types table
CREATE TABLE vehicle_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name TEXT NOT NULL UNIQUE,
  category vehicle_category NOT NULL,
  first_weigh_fee DECIMAL(10,2) DEFAULT 0,
  second_weigh_fee DECIMAL(10,2) DEFAULT 0,
  return_time_hours INTEGER DEFAULT 0,
  requires_two_weighs BOOLEAN DEFAULT true,
  is_time_sensitive BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create vehicle_entries table
CREATE TABLE vehicle_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_no TEXT NOT NULL,
  vehicle_type_id UUID REFERENCES vehicle_types(id),
  category vehicle_category NOT NULL,
  shift_id UUID REFERENCES shifts(id),
  entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  driver_name TEXT,
  driver_contact TEXT,
  cargo_description TEXT,
  status TEXT DEFAULT 'AwaitingFirstWeigh',
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create weigh_records table
CREATE TABLE weigh_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES vehicle_entries(id) ON DELETE CASCADE,
  gross_weight DECIMAL(10,2),
  tare_weight DECIMAL(10,2),
  net_weight DECIMAL(10,2) GENERATED ALWAYS AS (COALESCE(gross_weight, 0) - COALESCE(tare_weight, 0)) STORED,
  weigh_time TIMESTAMPTZ DEFAULT NOW(),
  weigh_number INTEGER DEFAULT 1,
  weighed_by TEXT,
  warning_flag BOOLEAN DEFAULT false,
  exceedence_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create pending_weighs table
CREATE TABLE pending_weighs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES vehicle_entries(id) ON DELETE CASCADE,
  vehicle_no TEXT NOT NULL,
  category vehicle_category NOT NULL,
  first_weigh_time TIMESTAMPTZ,
  expected_return_time TIMESTAMPTZ,
  actual_return_time TIMESTAMPTZ,
  return_status TEXT DEFAULT 'Pending',
  payment_status payment_status DEFAULT 'Pending',
  is_overdue BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES vehicle_entries(id),
  vehicle_no TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_type TEXT NOT NULL,
  payment_status payment_status DEFAULT 'Pending',
  paid_at TIMESTAMPTZ,
  cashier_name TEXT,
  receipt_number TEXT,
  penalty_fee DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default vehicle types
INSERT INTO vehicle_types (type_name, category, first_weigh_fee, second_weigh_fee, return_time_hours, requires_two_weighs, is_time_sensitive, description) VALUES
('JV-Payment', 'JV-Payment', 0, 0, 12, true, true, 'Joint Venture - Payment required, 12 hour return time'),
('JV-Free', 'JV-Free', 0, 0, 0, true, false, 'Joint Venture - No payment required'),
('Transit', 'Transit', 0, 0, 24, true, true, 'Transit vehicles - 24 hour return time'),
('MV-Company', 'MV-Company', 0, 0, 0, true, false, 'Mining Vehicle - Company owned'),
('MV-PublicSeller', 'MV-PublicSeller', 20000, 10000, 0, true, false, 'Mining Vehicle - Public seller (20k first weigh, 10k second weigh)'),
('MV-Supplier', 'MV-Supplier', 10000, 0, 0, true, false, 'Mining Vehicle - Supplier (10k for both weighs)');

-- Enable RLS
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE weigh_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_weighs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (public access for now, will add auth later)
CREATE POLICY "Allow all access to shifts" ON shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to vehicle_types" ON vehicle_types FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to vehicle_entries" ON vehicle_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to weigh_records" ON weigh_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to pending_weighs" ON pending_weighs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to payments" ON payments FOR ALL USING (true) WITH CHECK (true);

-- Create function to auto-update pending_weighs overdue status
CREATE OR REPLACE FUNCTION update_overdue_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expected_return_time IS NOT NULL AND NEW.expected_return_time < NOW() AND NEW.return_status = 'Pending' THEN
    NEW.is_overdue := true;
    NEW.payment_status := 'Overdue';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_overdue_status
BEFORE INSERT OR UPDATE ON pending_weighs
FOR EACH ROW
EXECUTE FUNCTION update_overdue_status();

-- Migration: 20251013010549
-- Add missing fields to vehicle_entries table
ALTER TABLE vehicle_entries
ADD COLUMN IF NOT EXISTS entered_by TEXT,
ADD COLUMN IF NOT EXISTS customer_farmer_name TEXT,
ADD COLUMN IF NOT EXISTS item_name TEXT,
ADD COLUMN IF NOT EXISTS source_destination TEXT,
ADD COLUMN IF NOT EXISTS sent_for_weighing BOOLEAN DEFAULT false;

-- Migration: 20251013010640
-- Fix search_path for update_overdue_status function
-- Drop trigger first
DROP TRIGGER IF EXISTS check_overdue_status ON public.pending_weighs;

-- Drop and recreate function with proper search_path
DROP FUNCTION IF EXISTS public.update_overdue_status();

CREATE OR REPLACE FUNCTION public.update_overdue_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.expected_return_time IS NOT NULL AND NEW.expected_return_time < NOW() AND NEW.return_status = 'Pending' THEN
    NEW.is_overdue := true;
    NEW.payment_status := 'Overdue';
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER check_overdue_status
  BEFORE INSERT OR UPDATE ON public.pending_weighs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_overdue_status();

-- Migration: 20251014053155
-- Delete all existing vehicle types
DELETE FROM public.vehicle_types;

-- Insert all vehicle types with correct categories and fees

-- JV-Payment vehicles (12 hours return time, time-sensitive)
INSERT INTO public.vehicle_types (type_name, category, first_weigh_fee, second_weigh_fee, return_time_hours, is_time_sensitive, requires_two_weighs) VALUES
('Semi Trailer', 'JV-Payment', 20000, 0, 12, true, true),
('Pulling', 'JV-Payment', 20000, 0, 12, true, true),
('Fuso Tandam', 'JV-Payment', 15000, 0, 12, true, true),
('Kipisi Mende', 'JV-Payment', 15000, 0, 12, true, true),
('Fuso Single', 'JV-Payment', 15000, 0, 12, true, true),
('Canter', 'JV-Payment', 10000, 0, 12, true, true);

-- Transit vehicles (24 hours return time, time-sensitive)
INSERT INTO public.vehicle_types (type_name, category, first_weigh_fee, second_weigh_fee, return_time_hours, is_time_sensitive, requires_two_weighs) VALUES
('Transit', 'Transit', 20000, 0, 24, true, true);

-- JV-Free vehicles (no payment)
INSERT INTO public.vehicle_types (type_name, category, first_weigh_fee, second_weigh_fee, return_time_hours, is_time_sensitive, requires_two_weighs) VALUES
('Allyen', 'JV-Free', 0, 0, 0, false, true),
('Drew Drop', 'JV-Free', 0, 0, 0, false, true),
('Mo Enterprises', 'JV-Free', 0, 0, 0, false, true),
('Infinity', 'JV-Free', 0, 0, 0, false, true),
('Energy Oil', 'JV-Free', 0, 0, 0, false, true);

-- MV-Company vehicles (no payment)
INSERT INTO public.vehicle_types (type_name, category, first_weigh_fee, second_weigh_fee, return_time_hours, is_time_sensitive, requires_two_weighs) VALUES
('Dawa', 'MV-Company', 0, 0, 0, false, true),
('Limestone Tanga', 'MV-Company', 0, 0, 0, false, true),
('EnergyFeeds BT', 'MV-Company', 0, 0, 0, false, true),
('EnergyFeeds GT', 'MV-Company', 0, 0, 0, false, true),
('EnergyFeeds Client', 'MV-Company', 0, 0, 0, false, true);

-- MV-Supplier vehicles
INSERT INTO public.vehicle_types (type_name, category, first_weigh_fee, second_weigh_fee, return_time_hours, is_time_sensitive, requires_two_weighs) VALUES
('Company Supplier', 'MV-Supplier', 10000, 0, 0, false, true);

-- MV-PublicSeller vehicles (pay 30,000 once, not split)
INSERT INTO public.vehicle_types (type_name, category, first_weigh_fee, second_weigh_fee, return_time_hours, is_time_sensitive, requires_two_weighs) VALUES
('Public Seller', 'MV-PublicSeller', 30000, 0, 0, false, true);

-- Migration: 20251015074848
-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'operator');

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to get current shift based on time
CREATE OR REPLACE FUNCTION public.get_current_shift()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM NOW()) >= 7 AND EXTRACT(HOUR FROM NOW()) < 18 THEN 'Day'
    ELSE 'Night'
  END
$$;

-- Update shifts table to include operator tracking
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES auth.users(id);

-- Update vehicle_entries to track operator
ALTER TABLE public.vehicle_entries ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES auth.users(id);

-- Update weigh_records to track operator
ALTER TABLE public.weigh_records ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES auth.users(id);

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for shifts
CREATE POLICY "Operators can view their own shifts"
ON public.shifts FOR SELECT
TO authenticated
USING (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators can insert shifts"
ON public.shifts FOR INSERT
TO authenticated
WITH CHECK (operator_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all shifts"
ON public.shifts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for vehicle_entries
CREATE POLICY "Operators can view their shift entries"
ON public.vehicle_entries FOR SELECT
TO authenticated
USING (
  operator_id = auth.uid() OR 
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Operators can insert entries"
ON public.vehicle_entries FOR INSERT
TO authenticated
WITH CHECK (operator_id = auth.uid());

CREATE POLICY "Admins can delete entries"
ON public.vehicle_entries FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for weigh_records
CREATE POLICY "Operators can view their weigh records"
ON public.weigh_records FOR SELECT
TO authenticated
USING (
  operator_id = auth.uid() OR 
  public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Operators can insert weigh records"
ON public.weigh_records FOR INSERT
TO authenticated
WITH CHECK (operator_id = auth.uid());

-- RLS Policies for payments (admin only for delete)
CREATE POLICY "Admins can delete payments"
ON public.payments FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migration: 20251015075020
-- Fix search_path for existing update_overdue_status function
DROP FUNCTION IF EXISTS public.update_overdue_status() CASCADE;

CREATE OR REPLACE FUNCTION public.update_overdue_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.expected_return_time IS NOT NULL AND NEW.expected_return_time < NOW() AND NEW.return_status = 'Pending' THEN
    NEW.is_overdue := true;
    NEW.payment_status := 'Overdue';
  END IF;
  RETURN NEW;
END;
$$;

-- Migration: 20251015075048
-- Fix search_path for handle_new_user function
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'));
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migration: 20251015075228
-- Fix search_path for all functions
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;
DROP FUNCTION IF EXISTS public.get_current_shift() CASCADE;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_current_shift()
RETURNS TEXT
LANGUAGE SQL
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM NOW()) >= 7 AND EXTRACT(HOUR FROM NOW()) < 18 THEN 'Day'
    ELSE 'Night'
  END
$$;

-- Migration: 20251016065407
-- Add locked status to weigh records
ALTER TABLE weigh_records ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT true;

-- Add weigh attempts tracking to pending_weighs
ALTER TABLE pending_weighs ADD COLUMN IF NOT EXISTS weigh_attempts integer DEFAULT 0;
ALTER TABLE pending_weighs ADD COLUMN IF NOT EXISTS last_payment_time timestamp with time zone;

-- Create activity logs table for tracking user sessions
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_name text NOT NULL,
  user_role app_role NOT NULL,
  action text NOT NULL,
  details text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create penalties table
CREATE TABLE IF NOT EXISTS penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid REFERENCES vehicle_entries(id) ON DELETE CASCADE,
  vehicle_no text NOT NULL,
  penalty_type text NOT NULL,
  reason text NOT NULL,
  amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;

-- RLS policies for activity_logs
CREATE POLICY "Admins can view all activity logs"
  ON activity_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own activity logs"
  ON activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS policies for penalties
CREATE POLICY "All authenticated users can view penalties"
  ON penalties FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert penalties"
  ON penalties FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_penalties_entry_id ON penalties(entry_id);
CREATE INDEX IF NOT EXISTS idx_penalties_vehicle_no ON penalties(vehicle_no);

-- Migration: 20251018105924
-- Clear all operational data while keeping users and vehicle types
DELETE FROM public.weigh_records;
DELETE FROM public.payments;
DELETE FROM public.penalties;
DELETE FROM public.pending_weighs;
DELETE FROM public.vehicle_entries;
DELETE FROM public.activity_logs;
DELETE FROM public.shifts;
