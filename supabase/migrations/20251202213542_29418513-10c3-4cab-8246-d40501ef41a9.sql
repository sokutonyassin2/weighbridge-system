-- Drop existing restrictive admin-only delete policy
DROP POLICY IF EXISTS "Only admins can delete vehicle entries" ON vehicle_entries;

-- Create new policy allowing operators to delete their own unweighed entries
CREATE POLICY "Admins and operators can delete unweighed entries" ON vehicle_entries
  FOR DELETE USING (
    -- Admins can delete any entry
    has_role(auth.uid(), 'admin'::app_role)
    OR
    -- Operators can delete their own entries that haven't been weighed yet
    (
      operator_id = auth.uid() 
      AND NOT EXISTS (
        SELECT 1 FROM weigh_records WHERE weigh_records.entry_id = vehicle_entries.id
      )
    )
  );