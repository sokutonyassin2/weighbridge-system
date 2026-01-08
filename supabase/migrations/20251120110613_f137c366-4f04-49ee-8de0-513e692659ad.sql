-- ============================================
-- Fix Critical RLS Policies for Role-Based Access Control
-- ============================================

-- 1. VEHICLE ENTRIES TABLE
-- Remove public access policies
DROP POLICY IF EXISTS "Allow all access to vehicle_entries" ON vehicle_entries;
DROP POLICY IF EXISTS "Operators can insert entries" ON vehicle_entries;

-- Authenticated users can view all entries
CREATE POLICY "Authenticated users can view vehicle entries"
ON vehicle_entries FOR SELECT
TO authenticated
USING (true);

-- Operators can insert their own entries
CREATE POLICY "Operators can insert vehicle entries"
ON vehicle_entries FOR INSERT
TO authenticated
WITH CHECK (operator_id = auth.uid());

-- Operators can update their own entries
CREATE POLICY "Operators can update their vehicle entries"
ON vehicle_entries FOR UPDATE
TO authenticated
USING (operator_id = auth.uid())
WITH CHECK (operator_id = auth.uid());

-- Only admins can delete entries
CREATE POLICY "Only admins can delete vehicle entries"
ON vehicle_entries FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. PAYMENTS TABLE
-- Remove public access
DROP POLICY IF EXISTS "Allow all access to payments" ON payments;

-- Authenticated users can view payments
CREATE POLICY "Authenticated users can view payments"
ON payments FOR SELECT
TO authenticated
USING (true);

-- Operators can create payments
CREATE POLICY "Operators can insert payments"
ON payments FOR INSERT
TO authenticated
WITH CHECK (true);

-- Operators can update payments
CREATE POLICY "Operators can update payments"
ON payments FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Only admins can delete payments
CREATE POLICY "Only admins can delete payments"
ON payments FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. WEIGH RECORDS TABLE
-- Remove public access
DROP POLICY IF EXISTS "Allow all access to weigh_records" ON weigh_records;
DROP POLICY IF EXISTS "Operators can insert weigh records" ON weigh_records;

-- Authenticated users can view weigh records
CREATE POLICY "Authenticated users can view weigh records"
ON weigh_records FOR SELECT
TO authenticated
USING (true);

-- Operators can insert their own weigh records
CREATE POLICY "Operators can insert their weigh records"
ON weigh_records FOR INSERT
TO authenticated
WITH CHECK (operator_id = auth.uid());

-- Only admins can update weigh records
CREATE POLICY "Only admins can update weigh records"
ON weigh_records FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete weigh records
CREATE POLICY "Only admins can delete weigh records"
ON weigh_records FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. PENDING WEIGHS TABLE
-- Remove public access
DROP POLICY IF EXISTS "Allow all access to pending_weighs" ON pending_weighs;

-- Authenticated users can view pending weighs
CREATE POLICY "Authenticated users can view pending weighs"
ON pending_weighs FOR SELECT
TO authenticated
USING (true);

-- Operators can insert pending weighs
CREATE POLICY "Operators can insert pending weighs"
ON pending_weighs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Operators can update pending weighs
CREATE POLICY "Operators can update pending weighs"
ON pending_weighs FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Only admins can delete pending weighs
CREATE POLICY "Only admins can delete pending weighs"
ON pending_weighs FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. SHIFTS TABLE
-- Remove public access
DROP POLICY IF EXISTS "Allow all access to shifts" ON shifts;

-- Authenticated users can view shifts
CREATE POLICY "Authenticated users can view shifts"
ON shifts FOR SELECT
TO authenticated
USING (true);

-- Operators can create shifts for themselves
CREATE POLICY "Operators can create shifts"
ON shifts FOR INSERT
TO authenticated
WITH CHECK (operator_id = auth.uid());

-- Operators can update their own shifts
CREATE POLICY "Operators can update their shifts"
ON shifts FOR UPDATE
TO authenticated
USING (operator_id = auth.uid())
WITH CHECK (operator_id = auth.uid());

-- Admins can update any shift
CREATE POLICY "Admins can update any shift"
ON shifts FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete shifts
CREATE POLICY "Only admins can delete shifts"
ON shifts FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 6. PENALTIES TABLE
-- Remove overly permissive policy
DROP POLICY IF EXISTS "All authenticated users can view penalties" ON penalties;

-- Only admins can view penalties
CREATE POLICY "Admins can view penalties"
ON penalties FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 7. PROFILES TABLE
-- Add admin view policy (in addition to existing self-view policy)
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;

CREATE POLICY "Users can view their own profile or admins can view all"
ON profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR 
  has_role(auth.uid(), 'admin'::app_role)
);