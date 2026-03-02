-- Guardian Eye: Add session tracking + dismiss columns to camera_audit_logs
-- Run this in Supabase SQL Editor

-- 1. Add session start/end timestamps
ALTER TABLE camera_audit_logs
  ADD COLUMN IF NOT EXISTS session_start  timestamptz,
  ADD COLUMN IF NOT EXISTS session_end    timestamptz;

-- 2. Add dismiss columns (for supervisor review of unmatched ghost photos)
ALTER TABLE camera_audit_logs
  ADD COLUMN IF NOT EXISTS dismissed      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dismissed_by   text,
  ADD COLUMN IF NOT EXISTS dismiss_reason text,
  ADD COLUMN IF NOT EXISTS dismissed_at   timestamptz;

-- 3. Index for fast audit lookups by shift and date
CREATE INDEX IF NOT EXISTS idx_cam_audit_session_start ON camera_audit_logs (session_start);
CREATE INDEX IF NOT EXISTS idx_cam_audit_type ON camera_audit_logs (type);
CREATE INDEX IF NOT EXISTS idx_cam_audit_shift ON camera_audit_logs (shift);

-- Done ✅
-- Expected new columns: session_start, session_end, dismissed, dismissed_by, dismiss_reason, dismissed_at
