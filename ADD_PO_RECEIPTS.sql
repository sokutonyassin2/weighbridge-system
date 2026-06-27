-- 1. Add new columns to track the receipts
ALTER TABLE garage_requisitions 
ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT,
ADD COLUMN IF NOT EXISTS delivery_receipt_url TEXT;

-- 2. Create the 'receipts' storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Set up Storage Policies for the 'receipts' bucket
-- Note: You might already have similar policies, this ensures they exist for this specific bucket
DROP POLICY IF EXISTS "Public receipts view" ON storage.objects;
CREATE POLICY "Public receipts view" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Public receipts insert" ON storage.objects;
CREATE POLICY "Public receipts insert" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Public receipts update" ON storage.objects;
CREATE POLICY "Public receipts update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'receipts');
