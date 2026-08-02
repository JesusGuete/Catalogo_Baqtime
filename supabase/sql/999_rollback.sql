-- 999_rollback.sql
-- Supabase backend — reverse teardown. NEVER execute unless a rollback is deliberately
-- invoked: this destroys all catalog data and all uploaded Storage objects. It is a reset,
-- not an undo.
--
-- Drops everything created by 001-011. Destructive: read it before running it.
--
-- Since 010 that includes ORDERS — real sales, not catalog data that can be retyped.
-- There is no seed and no backup here either: running this discards every order, every
-- customer address and every payment record along with the catalog.
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
-- 3. Tables (x10) — policies on these tables die with their tables
-- ============================================================================
-- Orders first: order_items and order_status_history point at orders, and nothing in the
-- catalog points at any of them (010_orders.sql keeps order_items FK-free on purpose).

drop table if exists public.order_items;
drop table if exists public.order_status_history;
drop table if exists public.orders;
drop sequence if exists public.orders_number_seq;

drop table if exists public.product_photos_draft;
drop table if exists public.product_photos;
drop table if exists public.products_draft;
drop table if exists public.products;
drop table if exists public.publications;
drop table if exists public.categories;
drop table if exists public.admins;

-- ============================================================================
-- 4. Functions LAST (x7) — a policy referencing is_admin() would otherwise block its drop
-- ============================================================================

-- The scheduled sweep first: a job left pointing at a dropped function fails every 30
-- minutes forever, filling the log with noise nobody connects back to this rollback.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cmd$ select cron.unschedule('baqtime-expirar-pedidos') $cmd$;
  end if;
exception when others then
  raise notice 'No había un job baqtime-expirar-pedidos que desprogramar.';
end $$;

drop function if exists public.create_order(jsonb, jsonb);
-- Las dos firmas: la de 011 (número + teléfono) y la de 012 (solo número). Según hasta
-- dónde se haya corrido la numeración, existe una u otra.
drop function if exists public.buscar_pedido(text, text);
drop function if exists public.buscar_pedido(text);
drop function if exists public.get_order_by_token(text);
-- Después de las dos anteriores: las dos la llaman.
drop function if exists public.pedido_publico(uuid);
-- El default de orders.order_number la referencia, así que va después del drop de la tabla.
drop function if exists public.generar_numero_pedido();
drop function if exists public.set_order_status(uuid, text, text);
drop function if exists public.confirm_order_payment(uuid, text);
drop function if exists public.expire_stale_orders();
drop function if exists public.publish_catalog();
drop function if exists public.replace_product_photos_draft(text, text[]);
drop function if exists public.is_admin();
drop function if exists public.set_updated_at();
drop function if exists public._fault_block_publication();
