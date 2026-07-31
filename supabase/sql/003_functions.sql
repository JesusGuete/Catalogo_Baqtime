-- 003_functions.sql
-- Supabase backend — publish_catalog() and replace_product_photos_draft().
-- How these are called over HTTP: docs/api-endpoints.md §3.7 and §3.8.
--
-- Run after 002_rls.sql. Idempotent: `create or replace function`.
--
-- SCOPE CHANGE (2026-07-30): publish_catalog() gained a greenfield safety guard — see the
-- "(2) GREENFIELD SAFETY GUARD" comment inside the function body below. It refuses to
-- publish an empty products_draft over a non-empty products, because this greenfield
-- catalog (no Firebase migration, no seed file) has no recovery row set if that happens.

-- ============================================================================
-- publish_catalog()
-- ============================================================================
-- SECURITY DEFINER is mandatory, not convenience: admins get NO direct write policy on
-- the published tables (products, product_photos) at all. This function is therefore the
-- ONLY writer of published data, which makes "published state is always a whole, consistent
-- copy of some draft state" structural rather than conventional.
--
-- Transaction boundary: one call, one implicit transaction. Either the published set is
-- entirely replaced and one publications row exists, or nothing changed. Retry is always
-- safe: a full replace is idempotent for a given draft state.

create or replace function public.publish_catalog()
returns table (publication_id bigint, product_count integer,
               photo_count integer, removed_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before text[]; v_removed text[]; v_products integer; v_photos integer;
  v_draft_count integer; v_published_count integer;
  v_pub bigint; v_actor uuid := auth.uid(); v_email text;
begin
  -- (1) THE SINGLE MOST DANGEROUS LINE IN THIS DESIGN (proposal R3).
  --     GRANT EXECUTE TO authenticated means any signed-in user reaches this body.
  --     This check MUST be the first executable statement.
  if not public.is_admin() then
    raise exception 'publish_catalog: caller is not an admin' using errcode = '42501';
  end if;

  -- (2) GREENFIELD SAFETY GUARD (scope change 2026-07-30 — owner decided there is no
  --     Firebase migration and no seed file; the catalog starts empty and every row is
  --     entered by hand through the admin panel). Proven locally to be a real data-loss
  --     bug, not a theoretical one — it was reproduced against a real database, where a
  --     publish took the catalog from 30 rows to 0. With the seed file removed,
  --     `products_draft` has no seed of its own either, so
  --     the very first admin who publishes an accidentally-empty draft would silently delete
  --     the entire published catalog below and replace it with nothing — with NO recovery
  --     path, because there is no seed row set to restore from anymore.
  --
  --     Invariant: refuse to publish when products_draft is EMPTY and products is NOT.
  --     Deliberately simple and absolute — no shrink-percentage heuristic, no fuzzy
  --     threshold. A predictable invariant gets respected; a fuzzy one gets tuned around.
  --
  --     Why this can never false-positive: the panel's "delete a product" action is a SOFT
  --     delete (`products_draft.is_active = false`), never a row removal — a hidden product
  --     still counts toward v_draft_count below. There is therefore no legitimate admin
  --     workflow that leaves products_draft empty while products holds published rows; that
  --     state is reachable only by accident (a stray truncate/delete, a broken script, or
  --     exactly the trap this guard exists to catch).
  --
  --     Why the very first publish still works: on a brand-new project both tables start at
  --     zero rows, so v_published_count = 0 and the guard's `v_published_count > 0` condition
  --     is false — the guard only engages from the second publish onward, never the first.
  --
  --     Historical note: Firebase got this invariant for free from CLIENT code —
  --     ensureDraftSeeded() (assets/js/admin/main.js:243-266) lazily copied the published
  --     node into the draft node the moment the panel found an empty draft, so an
  --     empty-draft-over-populated-published state was never reachable from the panel at all.
  --     Moving the invariant here, into the one function that is the only writer of published
  --     data, is the point: the guarantee now lives on the server, where no future caller of
  --     this RPC — panel, script, or otherwise — can bypass it.
  select count(*) into v_draft_count     from public.products_draft;
  select count(*) into v_published_count from public.products;
  if v_draft_count = 0 and v_published_count > 0 then
    raise exception
      'publish_catalog: refusing to publish — products_draft is empty but products still '
      'holds % published row(s). This is a SAFETY GUARD, not a bug: this greenfield catalog '
      'has no seed file to recover from, so completing this call would destroy every '
      'published row and replace it with nothing. If you genuinely intend to clear the '
      'catalog, soft-delete (is_active = false) every row in products_draft first, then '
      'publish that.',
      v_published_count
    using errcode = 'P0001';
  end if;

  -- (3) D6: fail fast instead of hanging until statement_timeout. A blocked publish would
  --     surface to the panel as an ambiguous timeout the client cannot interpret; failing
  --     fast converts it into an unambiguous "someone else is publishing, try again".
  if not pg_try_advisory_xact_lock(hashtext('publish_catalog')) then
    raise exception 'publish_catalog: another publish is in progress' using errcode = '55P03';
  end if;

  -- D5: published_by_email is a snapshot read from auth.users at publish time (authoritative),
  -- not from the possibly-stale public.admins.email. published_by carries no FK on purpose —
  -- an audit row must outlive the deletion of the admin it recorded.
  select email into v_email from auth.users where id = v_actor;

  select coalesce(array_agg(pp.storage_path), '{}') into v_before
    from public.product_photos pp;

  -- `where true` is not decoration. Supabase loads pg_safeupdate in the PostgREST
  -- session, which rejects any unqualified DELETE with 21000 'DELETE requires a
  -- WHERE clause'. The SQL Editor does not load it, so these two lines worked in
  -- every manual test and failed the first time the panel called this over RPC.
  delete from public.product_photos where true;                         -- FK order: photos first
  delete from public.products where true;

  -- Explicit column lists, not SELECT * — if a column is later added to only one twin, an
  -- enumerated list fails loudly at parse time, while SELECT * can silently mis-map two
  -- same-typed columns. Probe p2_schema_parity.sql guards the pair independently.
  insert into public.products
    (id, category_key, name, color, variant, hex, price, personalizable,
     max_initials, group_key, origin, is_active, sort_order, created_at, updated_at)
  select
     id, category_key, name, color, variant, hex, price, personalizable,
     max_initials, group_key, origin, is_active, sort_order, created_at, updated_at
  from public.products_draft;

  insert into public.product_photos (product_id, storage_path, position, created_at)
  select product_id, storage_path, position, created_at from public.product_photos_draft;

  select count(*) into v_products from public.products;
  select count(*) into v_photos   from public.product_photos;

  -- (7) proposal §6.3 item 3 / design §8: subtract BOTH the newly-published paths AND the
  --     still-referenced draft paths. Subtracting only the published-after set (the original
  --     proposal's diff) would delete from Storage a path that a draft still points at,
  --     leaving that draft referencing a 404.
  select coalesce(array_agg(t.path), '{}') into v_removed from (
    select unnest(v_before)
    except select storage_path from public.product_photos
    except select storage_path from public.product_photos_draft
  ) as t(path);

  insert into public.publications
    (published_by, published_by_email, product_count, photo_count, removed_paths)
  values (v_actor, v_email, v_products, v_photos, v_removed)
  returning id into v_pub;

  return query select v_pub, v_products, v_photos, v_removed;
end $$;

revoke all    on function public.publish_catalog() from public, anon;
grant  execute on function public.publish_catalog() to authenticated;

-- ============================================================================
-- replace_product_photos_draft(text, text[]) — D3
-- ============================================================================
-- Ships in this change (not deferred to the panel-cutover change) because the panel's
-- commitPhotos(id, arr) writes the WHOLE photo array in one call (add, remove, reorder
-- together). Two PostgREST calls (DELETE then POST) would be two transactions: a failure
-- between them silently strips a product's photos. Atomic whole-array replace is a
-- data-model integrity requirement, so it belongs to this layer.

create or replace function public.replace_product_photos_draft(
  p_product_id text, p_storage_paths text[]
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not public.is_admin() then
    raise exception 'replace_product_photos_draft: caller is not an admin'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.products_draft where id = p_product_id) then
    raise exception 'unknown draft product %', p_product_id using errcode = '23503';
  end if;
  delete from public.product_photos_draft where product_id = p_product_id;
  insert into public.product_photos_draft (product_id, storage_path, position)
  select p_product_id, u.path, (u.ord - 1)::smallint
    from unnest(p_storage_paths) with ordinality as u(path, ord);
  select count(*) into v_count
    from public.product_photos_draft where product_id = p_product_id;
  return v_count;
end $$;

revoke all    on function public.replace_product_photos_draft(text, text[]) from public, anon;
grant  execute on function public.replace_product_photos_draft(text, text[]) to authenticated;
