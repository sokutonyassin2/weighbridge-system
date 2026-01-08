-- Drop the restrictive admin-only delete policy
DROP POLICY IF EXISTS "Only admins can delete pending weighs" ON pending_weighs;

-- Create new policy allowing authenticated users to delete pending weighs
CREATE POLICY "Authenticated users can delete pending weighs" ON pending_weighs
  FOR DELETE
  USING (true);