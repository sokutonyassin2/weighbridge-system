-- Create function to automatically mark overdue vehicles and create penalties
CREATE OR REPLACE FUNCTION check_and_mark_overdue_vehicles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  overdue_record RECORD;
  penalty_amount NUMERIC;
BEGIN
  -- Find all pending weighs that are overdue and not yet marked
  FOR overdue_record IN
    SELECT 
      pw.id,
      pw.entry_id,
      pw.vehicle_no,
      pw.expected_return_time,
      ve.vehicle_type_id,
      vt.first_weigh_fee
    FROM pending_weighs pw
    JOIN vehicle_entries ve ON ve.id = pw.entry_id
    JOIN vehicle_types vt ON vt.id = ve.vehicle_type_id
    WHERE pw.expected_return_time < NOW()
      AND pw.return_status = 'Pending'
      AND pw.payment_required = false
      AND vt.is_time_sensitive = true
  LOOP
    penalty_amount := COALESCE(overdue_record.first_weigh_fee, 0);
    
    -- Update pending_weighs to mark as payment required
    UPDATE pending_weighs
    SET 
      payment_required = true,
      payment_required_reason = 'Returned after 12-hour window',
      payment_amount = penalty_amount,
      is_overdue = true,
      payment_status = 'Overdue'
    WHERE id = overdue_record.id;
    
    -- Create penalty record
    INSERT INTO penalties (
      entry_id,
      vehicle_no,
      penalty_type,
      reason,
      amount,
      created_by
    ) VALUES (
      overdue_record.entry_id,
      overdue_record.vehicle_no,
      'Overdue Return',
      'Returned after 12-hour window',
      penalty_amount,
      NULL -- System-generated
    );
  END LOOP;
END;
$$;

-- Create trigger function that runs on pending_weighs updates
CREATE OR REPLACE FUNCTION trigger_check_overdue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only check if expected_return_time exists and vehicle is still pending
  IF NEW.expected_return_time IS NOT NULL 
     AND NEW.expected_return_time < NOW() 
     AND NEW.return_status = 'Pending'
     AND NEW.payment_required = false THEN
    
    -- Mark this specific record as overdue
    PERFORM check_and_mark_overdue_vehicles();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on pending_weighs
DROP TRIGGER IF EXISTS check_overdue_on_update ON pending_weighs;
CREATE TRIGGER check_overdue_on_update
  AFTER INSERT OR UPDATE ON pending_weighs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_overdue();