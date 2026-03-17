-- Fuel Columns Migration for logistics_trip_sheets
-- Run this in Supabase SQL Editor

ALTER TABLE logistics_trip_sheets
  ADD COLUMN IF NOT EXISTS fuel_liters numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fuel_price  numeric DEFAULT 0;

-- Done ✅
-- These columns store the raw fuel quantity and price-per-liter.
-- fuel_amount (already existing) stores the calculated total USD cost.
