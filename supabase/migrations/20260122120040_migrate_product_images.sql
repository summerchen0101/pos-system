-- Product cover images: DB column + Supabase Storage bucket + RLS
-- Also create bucket `product-images` (public) in Dashboard → Storage if INSERT below fails.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.products.image_url IS 'Public URL of product image (Supabase Storage product-images bucket).';

-- Bucket (may require service role or Dashboard for first-time setup)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit),
  allowed_mime_types = COALESCE(EXCLUDED.allowed_mime_types, storage.buckets.allowed_mime_types);

-- RLS: anyone can read public objects; only ADMIN writes (matches app RBAC)
DROP POLICY IF EXISTS "product_images_select_public" ON storage.objects;
DROP POLICY IF EXISTS "product_images_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "product_images_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "product_images_delete_admin" ON storage.objects;

CREATE POLICY "product_images_select_public"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
  );

CREATE POLICY "product_images_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin()
  );

CREATE POLICY "product_images_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_admin()
  );
