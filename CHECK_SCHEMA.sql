-- CHECK TABLES
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- CHECK COLUMNS FOR LIKELY CANDIDATES
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND (table_name LIKE '%fleet%' OR table_name LIKE '%vehicle%')
ORDER BY table_name, ordinal_position;
