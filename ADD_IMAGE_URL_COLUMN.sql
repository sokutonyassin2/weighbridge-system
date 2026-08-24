ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- If you still get a schema cache error after running this, run:
-- NOTIFY pgrst, 'reload schema';
