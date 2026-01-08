-- Create weighbridge_logs table for logging all weight readings > 500kg
CREATE TABLE public.weighbridge_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  weight NUMERIC NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  captured BOOLEAN NOT NULL DEFAULT false,
  entry_id UUID REFERENCES public.vehicle_entries(id) ON DELETE SET NULL,
  vehicle_no TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weighbridge_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view and insert logs
CREATE POLICY "Authenticated users can view weighbridge logs"
ON public.weighbridge_logs FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert weighbridge logs"
ON public.weighbridge_logs FOR INSERT
WITH CHECK (true);

-- Allow admins to delete logs
CREATE POLICY "Only admins can delete weighbridge logs"
ON public.weighbridge_logs FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));