-- Fix: Add missing 'nature' column to logistics_route_templates
ALTER TABLE logistics_route_templates 
ADD COLUMN IF NOT EXISTS nature TEXT;
