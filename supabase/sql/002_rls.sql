-- 002_rls.sql
-- Supabase backend — RLS enablement and the full policy set (17 policies).
-- What the front end may read and what is closed to it: docs/frontend-contract.md §2-3.
--
-- Run after 001_schema.sql. Idempotent: `enable row level security` is a no-op when already
-- enabled; every `create policy` is preceded by `drop policy if exists`.

-- ============================================================================
-- Explicit RLS enablement (x7)
-- ============================================================================
-- The project's "Enable automatic RLS" event trigger already runs this on every new public
-- table, so these statements are idempotent no-ops. Kept anyway: they document intent in
-- git and survive that trigger being dropped.
--
-- Verify the result with `relrowsecurity`, never with pg_policies: the policy set and the
-- RLS switch are independent, so a table can carry all four policies with RLS off and be
-- wide open. pg_policies would show the policies and tell you nothing.

alter table public.admins                 enable row level security;
alter table public.categories              enable row level security;
alter table public.products                enable row level security;
alter table public.products_draft          enable row level security;
alter table public.product_photos          enable row level security;
alter table public.product_photos_draft    enable row level security;
alter table public.publications            enable row level security;

-- ============================================================================
-- categories: public read, admin write (4 policies)
-- ============================================================================

drop policy if exists categories_select_public on public.categories;
create policy categories_select_public on public.categories
  for select to anon, authenticated using (true);

drop policy if exists categories_insert_admin on public.categories;
create policy categories_insert_admin on public.categories
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists categories_update_admin on public.categories;
create policy categories_update_admin on public.categories
  for update to authenticated using ((select public.is_admin()))
                                with check ((select public.is_admin()));

drop policy if exists categories_delete_admin on public.categories;
create policy categories_delete_admin on public.categories
  for delete to authenticated using ((select public.is_admin()));

-- ============================================================================
-- products: public sees active rows; admin sees all; NOBODY writes directly (2 policies)
-- publish_catalog() is SECURITY DEFINER and is the only writer — see 003_functions.sql.
-- ============================================================================

drop policy if exists products_select_public on public.products;
create policy products_select_public on public.products
  for select to anon, authenticated using (is_active);

drop policy if exists products_select_admin on public.products;
create policy products_select_admin on public.products
  for select to authenticated using ((select public.is_admin()));

-- ============================================================================
-- product_photos: public read only (1 policy). D9: no join to products/is_active —
-- objects are publicly readable in Storage regardless, so the join protects nothing real.
-- ============================================================================

drop policy if exists product_photos_select_public on public.product_photos;
create policy product_photos_select_public on public.product_photos
  for select to anon, authenticated using (true);

-- ============================================================================
-- products_draft: admin-only, all four verbs (4 policies)
-- ============================================================================

drop policy if exists products_draft_select_admin on public.products_draft;
create policy products_draft_select_admin on public.products_draft
  for select to authenticated using ((select public.is_admin()));

drop policy if exists products_draft_insert_admin on public.products_draft;
create policy products_draft_insert_admin on public.products_draft
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists products_draft_update_admin on public.products_draft;
create policy products_draft_update_admin on public.products_draft
  for update to authenticated using ((select public.is_admin()))
                                with check ((select public.is_admin()));

drop policy if exists products_draft_delete_admin on public.products_draft;
create policy products_draft_delete_admin on public.products_draft
  for delete to authenticated using ((select public.is_admin()));

-- ============================================================================
-- product_photos_draft: admin-only, all four verbs (4 policies)
-- ============================================================================

drop policy if exists product_photos_draft_select_admin on public.product_photos_draft;
create policy product_photos_draft_select_admin on public.product_photos_draft
  for select to authenticated using ((select public.is_admin()));

drop policy if exists product_photos_draft_insert_admin on public.product_photos_draft;
create policy product_photos_draft_insert_admin on public.product_photos_draft
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists product_photos_draft_update_admin on public.product_photos_draft;
create policy product_photos_draft_update_admin on public.product_photos_draft
  for update to authenticated using ((select public.is_admin()))
                                with check ((select public.is_admin()));

drop policy if exists product_photos_draft_delete_admin on public.product_photos_draft;
create policy product_photos_draft_delete_admin on public.product_photos_draft
  for delete to authenticated using ((select public.is_admin()));

-- ============================================================================
-- admins: own row only, granted to BOTH roles for literal V5 parity (D8).
-- No write policy at all — see admin-authorization requirement "No write path to admins".
-- (1 policy)
-- ============================================================================

drop policy if exists admins_select_self on public.admins;
create policy admins_select_self on public.admins
  for select to anon, authenticated using (user_id = auth.uid());

-- ============================================================================
-- publications: admin read only (1 policy). publish_catalog() writes as owner
-- (SECURITY DEFINER), so no INSERT policy is needed.
-- ============================================================================

drop policy if exists publications_select_admin on public.publications;
create policy publications_select_admin on public.publications
  for select to authenticated using ((select public.is_admin()));

-- Total: 4 + 2 + 1 + 4 + 4 + 1 + 1 = 17 policies.

-- ============================================================================
-- Grant-level defense in depth (does not depend on policy correctness)
-- ============================================================================

revoke all on table public.products_draft, public.product_photos_draft from anon;
revoke all on table public.publications  from anon;
revoke insert, update, delete, truncate on table public.admins from anon, authenticated;
revoke insert, update, delete, truncate on table public.products, public.product_photos
  from anon, authenticated;

-- FORCE ROW LEVEL SECURITY is intentionally NOT set on the published tables:
-- publish_catalog() is SECURITY DEFINER and is meant to bypass RLS on them.
