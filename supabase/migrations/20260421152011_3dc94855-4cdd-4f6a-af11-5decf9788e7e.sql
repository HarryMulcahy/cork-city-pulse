-- Add images array to developments
ALTER TABLE public.developments ADD COLUMN images text[] NOT NULL DEFAULT '{}';

-- Create public storage bucket for development images
INSERT INTO storage.buckets (id, name, public) VALUES ('development-images', 'development-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Development images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'development-images');

CREATE POLICY "Authenticated users can upload development images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'development-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own development images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'development-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own development images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'development-images' AND auth.uid()::text = (storage.foldername(name))[1]);
