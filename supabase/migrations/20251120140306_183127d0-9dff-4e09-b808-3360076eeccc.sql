-- Phase 1: Database Schema Updates

-- Add can_complete_early column to vehicle_entries
ALTER TABLE vehicle_entries 
ADD COLUMN IF NOT EXISTS can_complete_early BOOLEAN DEFAULT true;