SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'logistics_couplings'
ORDER BY ordinal_position;
