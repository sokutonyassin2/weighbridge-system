-- 1. Check EXACT columns in activity_logs to stop guessing
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'activity_logs';

-- 2. Try a safer query without table_name column (common alternatives are 'target_table' or 'entity')
-- This will help us find ANY recent bulk changes
SELECT * 
FROM activity_logs 
WHERE created_at > NOW() - INTERVAL '3 hours'
ORDER BY created_at DESC;

-- 3. Check for suspiciously large numbers of records updated together
SELECT action, count(*) 
FROM activity_logs 
WHERE created_at > NOW() - INTERVAL '3 hours'
GROUP BY action;
