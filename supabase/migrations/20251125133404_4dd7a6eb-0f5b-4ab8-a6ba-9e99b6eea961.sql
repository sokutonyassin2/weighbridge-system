-- Add sequential weigh bridge number to vehicle_entries
ALTER TABLE vehicle_entries 
ADD COLUMN wb_number SERIAL;

-- Create unique index for wb_number
CREATE UNIQUE INDEX idx_wb_number ON vehicle_entries(wb_number);