-- Add Trip Ref and Invoice No to transit trips
ALTER TABLE logistics_transit_trips 
ADD COLUMN IF NOT EXISTS invoice_no TEXT,
ADD COLUMN IF NOT EXISTS reference_number TEXT;
