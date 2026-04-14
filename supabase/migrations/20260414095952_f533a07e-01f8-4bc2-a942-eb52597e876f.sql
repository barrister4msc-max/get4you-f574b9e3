
-- Create storage bucket for order chat files
INSERT INTO storage.buckets (id, name, public) VALUES ('order-chat-files', 'order-chat-files', true);

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload order chat files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-chat-files');

-- Allow public read access
CREATE POLICY "Anyone can view order chat files"
ON storage.objects FOR SELECT
USING (bucket_id = 'order-chat-files');

-- Allow uploaders to delete their own files
CREATE POLICY "Users can delete own order chat files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'order-chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add file_url column to order_messages for attachments
ALTER TABLE public.order_messages ADD COLUMN file_url text;
ALTER TABLE public.order_messages ADD COLUMN file_name text;
