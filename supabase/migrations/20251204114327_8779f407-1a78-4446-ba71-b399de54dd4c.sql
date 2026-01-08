-- Create overdue_vehicles_history table for storing overdue JV-Payment records
CREATE TABLE public.overdue_vehicles_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES vehicle_entries(id),
  vehicle_no TEXT NOT NULL,
  category TEXT NOT NULL,
  first_weigh_time TIMESTAMPTZ,
  overdue_time TIMESTAMPTZ DEFAULT NOW(),
  shift_id UUID REFERENCES shifts(id),
  shift_name TEXT,
  shift_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.overdue_vehicles_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view overdue history"
ON public.overdue_vehicles_history FOR SELECT
USING (true);

CREATE POLICY "Operators can insert overdue history"
ON public.overdue_vehicles_history FOR INSERT
WITH CHECK (true);

CREATE POLICY "Only admins can delete overdue history"
ON public.overdue_vehicles_history FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add GVM, GTM, Trailer columns to weigh_records
ALTER TABLE public.weigh_records ADD COLUMN IF NOT EXISTS gvm NUMERIC;
ALTER TABLE public.weigh_records ADD COLUMN IF NOT EXISTS gtm NUMERIC;
ALTER TABLE public.weigh_records ADD COLUMN IF NOT EXISTS trailer_weight NUMERIC;

-- Update the check_and_mark_overdue_vehicles function to NOT create penalties for overdue
-- Instead, just mark them as overdue (penalty will only be for exhausted attempts)
CREATE OR REPLACE FUNCTION public.check_and_mark_overdue_vehicles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  overdue_record RECORD;
BEGIN
  -- Find all pending weighs that are overdue and not yet marked
  -- We NO LONGER create penalties for overdue - only mark them
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
    JOIN vehicle_types vt ON vt.id = ve.vehicle_type_id
    LEFT JOIN shifts s ON s.id = ve.shift_id
    WHERE pw.expected_return_time < NOW()
      AND pw.return_status = 'Pending'
      AND pw.is_overdue = false
      AND vt.is_time_sensitive = true
  LOOP
    -- Insert into overdue history
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
      'Auto-marked overdue - exceeded 12-hour return window'
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