-- FIX SYSTEM & RESTORE USERS (UPDATED)
-- Run this in Supabase SQL Editor

-- 1. FIX MISSING VIEW (pending_weighs)
CREATE OR REPLACE VIEW pending_weighs AS
SELECT 
    ve.id,
    ve.vehicle_no,
    vt.category,
    ve.entry_time as created_at,
    ve.id as entry_id,
    vt.return_time_hours,
    -- Calculate return times and status
    ve.entry_time as first_weigh_time,
    (ve.entry_time + (vt.return_time_hours || ' hours')::interval) as expected_return_time,
    NULL::timestamp as actual_return_time,
    
    -- Status checks
    CASE 
        WHEN NOW() > (ve.entry_time + (vt.return_time_hours || ' hours')::interval) THEN true 
        ELSE false 
    END as is_overdue,
    
    -- Payment info
    p.payment_status,
    p.amount as payment_amount,
    p.notes,
    p.paid_at as last_payment_time,
    
    -- Requirements
    CASE WHEN vt.category = 'JV-Payment' THEN true ELSE false END as payment_required,
    'Standard Fee' as payment_required_reason,
    
    'Pending' as return_status,
    1 as weigh_attempts

FROM vehicle_entries ve
LEFT JOIN vehicle_types vt ON ve.vehicle_type_id = vt.id
LEFT JOIN payments p ON ve.id = p.entry_id
WHERE ve.completed = false;

-- 2. RESTORE "Admin" (sokuton)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
  ('a1b2c3d4-e5f6-4a3b-8c9d-0e1f2a3b4c5d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sokuton@weighbridge.local', crypt('1234567890', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name": "System Admin"}', NOW(), NOW(), '', '', '', '')
ON CONFLICT (id) DO NOTHING; 

-- Note: We use ID for conflict because Email constraint might vary
INSERT INTO public.profiles (id, full_name, username)
VALUES ('a1b2c3d4-e5f6-4a3b-8c9d-0e1f2a3b4c5d', 'System Admin', 'sokuton')
ON CONFLICT (id) DO UPDATE SET full_name = 'System Admin';

INSERT INTO public.user_roles (user_id, role)
VALUES ('a1b2c3d4-e5f6-4a3b-8c9d-0e1f2a3b4c5d', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;


-- 3. RESTORE "Operator" (sarah)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
VALUES
  ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sarah@weighbridge.local', crypt('1234567890', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"full_name": "Sarah Operator"}', NOW(), NOW(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, username)
VALUES ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'Sarah Operator', 'sarah')
ON CONFLICT (id) DO UPDATE SET full_name = 'Sarah Operator';

INSERT INTO public.user_roles (user_id, role)
VALUES ('b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', 'operator')
ON CONFLICT (user_id, role) DO NOTHING;
