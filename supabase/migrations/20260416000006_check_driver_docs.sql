-- VERIFY: Check if logistics_driver_documents has auto-generating IDs
-- Run this in your Supabase SQL Editor if registration still fails.

SELECT 
    column_name, 
    column_default, 
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name = 'logistics_driver_documents' 
    AND column_name = 'id';

-- If 'column_default' is empty for the 'id' column, 
-- run this fix to add the default UUID generation:
-- 
-- ALTER TABLE logistics_driver_documents 
-- ALTER COLUMN id SET DEFAULT gen_random_uuid();
