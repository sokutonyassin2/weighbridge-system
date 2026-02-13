-- ==========================================================
-- TROUBLESHOOTING: CHECK AND FIX MY ROLE
-- ==========================================================

-- 1. SEE ALL USERS AND THEIR ROLES
-- Copy your email or ID from here
SELECT p.full_name, p.username, r.role 
FROM profiles p
JOIN user_roles r ON p.id = r.user_id;

-- 2. UPDATE YOUR ROLE TO 'cashier'
-- Replace 'YOUR_USERNAME' with your actual username from the list above
UPDATE user_roles 
SET role = 'cashier' 
WHERE user_id = (SELECT id FROM profiles WHERE username = 'YOUR_USERNAME');

-- 3. VERIFY
SELECT role FROM user_roles 
WHERE user_id = (SELECT id FROM profiles WHERE username = 'YOUR_USERNAME');
