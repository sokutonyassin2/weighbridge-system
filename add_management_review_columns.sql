-- Migration: Add Management Review columns to garage_requisitions
-- Purpose: Support new workflow where boss reviews requisitions before procurement
-- Date: 2026-07-18
-- IMPORTANT: This does NOT affect existing requisitions. Only new ones will use the new statuses.

ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS management_reviewed_quantity integer,
ADD COLUMN IF NOT EXISTS management_review_note text,
ADD COLUMN IF NOT EXISTS management_reviewed_by uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS management_reviewed_at timestamptz;

-- Add comment for documentation
COMMENT ON COLUMN garage_requisitions.management_reviewed_quantity IS 'Quantity decided by management during review (before procurement). Original qty stays in quantity_requested.';
COMMENT ON COLUMN garage_requisitions.management_review_note IS 'Note from management explaining their decision during review.';
COMMENT ON COLUMN garage_requisitions.management_reviewed_by IS 'User ID of the manager who reviewed this requisition.';
COMMENT ON COLUMN garage_requisitions.management_reviewed_at IS 'Timestamp of when management reviewed this requisition.';
