-- 006_storage_policies.sql
-- Supabase backend — storage.objects policies (5 total).
-- Upload, delete and public-read endpoints: docs/api-endpoints.md §4.
--
-- Run after 005_buckets.sql. Idempotent: drop policy if exists before create policy.
--
-- NOTE (design §9.1, deviation register Q7 — UNVERIFIED on this project): on some Supabase
-- versions storage.objects is owned by supabase_storage_admin, so CREATE POLICY from the
-- SQL Editor may be refused. Fallback: Storage -> Policies UI, recreating the same five
-- policies below by hand. Verify this file runs before relying on it.

drop policy if exists product_images_read on storage.objects;
create policy product_images_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-images');

drop policy if exists product_images_insert on storage.objects;
create policy product_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));

drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects
  for update to authenticated
  using       (bucket_id = 'product-images' and (select public.is_admin()))
  with check  (bucket_id = 'product-images' and (select public.is_admin()));

drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

drop policy if exists site_images_read on storage.objects;
create policy site_images_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'site-images');

-- site-images: NO insert/update/delete policy for ANY role, admins included. Orphan
-- cleanup and every other admin action cannot touch site-images even with valid admin
-- credentials — the second layer behind the two-bucket split (design §9.2).
