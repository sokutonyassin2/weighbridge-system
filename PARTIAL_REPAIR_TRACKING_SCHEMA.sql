-- PARTIAL REPAIR TRACKING SYSTEM - DATABASE SCHEMA
-- This migration adds comprehensive tracking for partial repairs, approvals, and accountability

-- 1. Add tracking fields to logistics_fleet
ALTER TABLE public.logistics_fleet 
ADD COLUMN IF NOT EXISTS has_pending_issues BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pending_issues_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_service_date TIMESTAMP WITH TIME ZONE;

-- 2. Add release tracking and approval fields to garage_job_cards
ALTER TABLE public.garage_job_cards
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS release_notes TEXT,
ADD COLUMN IF NOT EXISTS requires_followup BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS head_mechanic_approval TEXT,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- 3. Add mechanic accountability to garage_job_faults
ALTER TABLE public.garage_job_faults
ADD COLUMN IF NOT EXISTS assigned_mechanic UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- 4. Create follow-up notifications table
CREATE TABLE IF NOT EXISTS public.garage_followup_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.garage_job_cards(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.logistics_fleet(id) ON DELETE CASCADE,
    notification_type TEXT CHECK (notification_type IN ('immediate', 'weekly', 'overdue')),
    message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES public.profiles(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create vehicle maintenance history view
CREATE OR REPLACE VIEW public.vehicle_maintenance_history AS
SELECT 
    gjc.vehicle_id,
    lf.vehicle_no,
    lf.horse_number,
    lf.trailer_number,
    gjc.id as job_id,
    gjc.job_number,
    gjc.opened_at,
    gjc.closed_at,
    gjc.status,
    gjc.priority,
    gjc.release_notes,
    gjc.head_mechanic_approval,
    gjc.requires_followup,
    gjc.released_by,
    gjc.approved_by,
    EXTRACT(DAY FROM (gjc.closed_at - gjc.opened_at)) as days_in_garage,
    COUNT(gjf.id) as total_faults,
    COUNT(CASE WHEN gjf.status = 'Completed' THEN 1 END) as completed_count,
    COUNT(CASE WHEN gjf.status = 'Partial' THEN 1 END) as partial_count,
    COUNT(CASE WHEN gjf.status = 'Not Repaired' THEN 1 END) as deferred_count,
    COUNT(CASE WHEN gjf.status IN ('Partial', 'Not Repaired') THEN 1 END) as pending_count,
    JSON_AGG(
        JSON_BUILD_OBJECT(
            'fault', gjf.mechanic_notes,
            'status', gjf.status,
            'category', gft.category,
            'fault_name', gft.fault_name,
            'assigned_mechanic', gjf.assigned_mechanic,
            'completed_by', gjf.completed_by,
            'completed_at', gjf.completed_at
        ) ORDER BY gjf.created_at
    ) as faults
FROM public.garage_job_cards gjc
LEFT JOIN public.logistics_fleet lf ON gjc.vehicle_id = lf.id
LEFT JOIN public.garage_job_faults gjf ON gjc.id = gjf.job_id
LEFT JOIN public.garage_fault_types gft ON gjf.fault_type_id = gft.id
GROUP BY gjc.id, lf.vehicle_no, lf.horse_number, lf.trailer_number;

-- 6. Enable RLS on new table
ALTER TABLE public.garage_followup_notifications ENABLE ROW LEVEL SECURITY;

-- 7. Create policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Full Access Notifications' AND tablename = 'garage_followup_notifications') THEN
        CREATE POLICY "Full Access Notifications" ON public.garage_followup_notifications FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- 8. Create function to update pending issues on job closure
CREATE OR REPLACE FUNCTION update_vehicle_pending_issues()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'Closed' AND OLD.status != 'Closed' THEN
        -- Update vehicle pending issues
        UPDATE public.logistics_fleet
        SET 
            has_pending_issues = EXISTS(
                SELECT 1 FROM public.garage_job_faults
                WHERE job_id = NEW.id 
                AND status IN ('Partial', 'Not Repaired')
            ),
            pending_issues_count = (
                SELECT COUNT(*) FROM public.garage_job_faults
                WHERE job_id = NEW.id 
                AND status IN ('Partial', 'Not Repaired')
            ),
            last_service_date = NEW.closed_at
        WHERE id = NEW.vehicle_id;
        
        -- Create notification if there are pending issues
        IF NEW.requires_followup THEN
            INSERT INTO public.garage_followup_notifications (job_id, vehicle_id, notification_type, message)
            VALUES (
                NEW.id, 
                NEW.vehicle_id, 
                'immediate',
                'Vehicle released with pending repairs - follow-up required'
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Create trigger
DROP TRIGGER IF EXISTS trigger_update_pending_issues ON public.garage_job_cards;
CREATE TRIGGER trigger_update_pending_issues
    AFTER UPDATE ON public.garage_job_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_vehicle_pending_issues();

-- 10. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_followup_notifications_vehicle ON public.garage_followup_notifications(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_followup_notifications_acknowledged ON public.garage_followup_notifications(acknowledged);
CREATE INDEX IF NOT EXISTS idx_fleet_pending_issues ON public.logistics_fleet(has_pending_issues) WHERE has_pending_issues = true;
CREATE INDEX IF NOT EXISTS idx_job_cards_requires_followup ON public.garage_job_cards(requires_followup) WHERE requires_followup = true;

-- 11. Add comments
COMMENT ON COLUMN garage_job_cards.head_mechanic_approval IS 'MANDATORY approval note from Head of Mechanics for partial releases';
COMMENT ON COLUMN garage_job_cards.requires_followup IS 'Set to true when vehicle is released with Partial or Not Repaired faults';
COMMENT ON COLUMN logistics_fleet.has_pending_issues IS 'Flag indicating vehicle has unresolved maintenance issues';
COMMENT ON COLUMN logistics_fleet.pending_issues_count IS 'Number of faults with Partial or Not Repaired status';
COMMENT ON TABLE garage_followup_notifications IS 'Tracks notifications for vehicles requiring follow-up repairs';
COMMENT ON VIEW vehicle_maintenance_history IS 'Complete maintenance history per vehicle with fault breakdown and accountability';
