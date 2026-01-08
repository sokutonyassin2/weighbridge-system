-- Update the check_and_mark_overdue_vehicles function to handle JV vehicles properly
-- JV-Payment and JV-Free vehicles that exceed 12 hours should be moved to overdue history
-- WITHOUT creating penalties - they just get removed from the system

CREATE OR REPLACE FUNCTION public.check_and_mark_overdue_vehicles()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  overdue_record RECORD;
BEGIN
  -- Find all pending weighs that are overdue (exceeded 12-hour return window)
  -- This includes JV-Payment, JV-Free, and Transit vehicles with time sensitivity
  FOR overdue_record IN
    SELECT 
      pw.id,
      pw.entry_id,
      pw.vehicle_no,
      pw.expected_return_time,
      pw.first_weigh_time,
      pw.category,
      ve.vehicle_type_id,
      ve.shift_id,
      s.shift_name,
      s.shift_date
    FROM pending_weighs pw
    JOIN vehicle_entries ve ON ve.id = pw.entry_id
    LEFT JOIN vehicle_types vt ON vt.id = ve.vehicle_type_id
    LEFT JOIN shifts s ON s.id = ve.shift_id
    WHERE pw.expected_return_time IS NOT NULL
      AND pw.expected_return_time < NOW()
      AND pw.return_status = 'Pending'
      AND pw.is_overdue = false
      -- Include JV-Payment, JV-Free, and Transit categories with time sensitivity
      AND (vt.is_time_sensitive = true OR pw.category IN ('JV-Payment', 'Transit'))
  LOOP
    -- Insert into overdue history (NO penalty creation for JV vehicles)
    INSERT INTO overdue_vehicles_history (
      entry_id,
      vehicle_no,
      category,
      first_weigh_time,
      overdue_time,
      shift_id,
      shift_name,
      shift_date,
      notes
    ) VALUES (
      overdue_record.entry_id,
      overdue_record.vehicle_no,
      overdue_record.category,
      overdue_record.first_weigh_time,
      NOW(),
      overdue_record.shift_id,
      overdue_record.shift_name,
      overdue_record.shift_date,
      'Auto-marked overdue - exceeded return window. Vehicle can be re-added as new entry.'
    );
    
    -- Mark vehicle entry as completed (overdue)
    UPDATE vehicle_entries
    SET completed = true, status = 'Overdue-Removed'
    WHERE id = overdue_record.entry_id;
    
    -- Delete from pending_weighs so vehicle can be re-added
    DELETE FROM pending_weighs WHERE id = overdue_record.id;
  END LOOP;
END;
$function$;