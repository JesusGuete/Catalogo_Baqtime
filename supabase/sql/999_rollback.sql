-- 999_rollback.sql
-- Supabase backend — reverse teardown. NEVER execute unless a rollback is deliberately
-- invoked: this destroys all catalog data and all uploaded Storage objects. It is a reset,
-- not an undo.
--
-- Drops everything created by 001-008. Destructive: read it before running it.
--
-- Dependency order matters: storage policies -> storage objects -> storage buckets ->
-- tables -> functions LAST. Functions must be dropped last because a policy still
-- referencing is_admin() would block its drop while any table/policy still exists.

-- ============================================================================
-- 1. Storage policies
-- ============================================================================

drop policy if exists product_images_read   on storage.objects;
drop policy if exists product_images_insert on storage.objects;
drop policy if exists product_images_update on storage.objects;
drop policy if exists product_images_delete on storage.objects;
drop policy if exists site_images_read      on storage.objects;

-- ============================================================================
-- 2. Storage objects (both buckets), then buckets themselves
-- ============================================================================
-- WARNING-8 fix (verify-report.md): this section can hit the SAME ownership wall design Q7
-- raises for `CREATE POLICY ON storage.objects` in 006_storage_policies.sql — on some
-- Supabase projects, storage.objects/storage.buckets are owned by supabase_storage_admin,
-- and a DELETE from the SQL Editor's postgres role can be refused ("must be owner of
-- relation objects"/"buckets") even with full project access. If either statement below
-- errors: use the dashboard instead — Storage -> product-images -> select all -> Delete,
-- repeat for site-images, then delete both buckets from the Storage bucket list's own
-- delete action. Section 3 (table drops) does not depend on this section succeeding.

delete from storage.objects where bucket_id in ('product-images', 'site-images');
delete from storage.buckets where id in ('product-images', 'site-images');

-- ============================================================================
-- 3. Tables (x7) — policies on these tables die with their tables
-- ============================================================================

drop table if exists public.product_photos_draft;
drop table if exists public.product_photos;
drop table if exists public.products_draft;
drop table if exists public.products;
drop table if exists public.publications;
drop table if exists public.categories;
drop table if exists public.admins;

-- ============================================================================
-- 4. Functions LAST (x4) — a policy referencing is_admin() would otherwise block its drop
-- ============================================================================

drop function if exists public.publish_catalog();
drop function if exists public.replace_product_photos_draft(text, text[]);
drop function if exists public.is_admin();
drop function if exists public.set_updated_at();
drop function if exists public._fault_block_publication();
