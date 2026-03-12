-- Migration: Add Soft Delete Support to Garage Module
-- This script adds the necessary columns to track "deleted" items for the Dustbin feature.

ALTER TABLE garage_job_cards ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE garage_job_cards ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE garage_job_faults ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE garage_job_faults ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE garage_requisitions ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE garage_requisitions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE garage_inventory_usage ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE garage_inventory_usage ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Also add an index for performance when filtering active versus deleted items
CREATE INDEX IF NOT EXISTS idx_garage_job_cards_is_deleted ON garage_job_cards(is_deleted);
CREATE INDEX IF NOT EXISTS idx_garage_job_faults_is_deleted ON garage_job_faults(is_deleted);
CREATE INDEX IF NOT EXISTS idx_garage_requisitions_is_deleted ON garage_requisitions(is_deleted);
CREATE INDEX IF NOT EXISTS idx_garage_inventory_usage_is_deleted ON garage_inventory_usage(is_deleted);
