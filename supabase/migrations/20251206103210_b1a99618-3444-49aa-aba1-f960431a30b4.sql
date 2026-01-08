-- Add photo_url column to weigh_records for camera captures
ALTER TABLE public.weigh_records 
ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Create storage bucket for vehicle photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-photos', 'vehicle-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for vehicle photos
CREATE POLICY "Anyone can view vehicle photos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'vehicle-photos');

CREATE POLICY "Authenticated users can upload vehicle photos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'vehicle-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Service role can manage vehicle photos" 
ON storage.objects 
FOR ALL 
USING (bucket_id = 'vehicle-photos')
WITH CHECK (bucket_id = 'vehicle-photos');