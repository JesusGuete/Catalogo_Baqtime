-- 015_product_initials_palette.sql
-- Los colores de bordado se eligen POR PRODUCTO, no solo por categoría.
--
-- Ejecutar después de 014_initials_colors.sql. Idempotente: `add column if not exists`
-- y `create or replace function`.
--
-- POR QUÉ EXISTE
-- 014 dejó la paleta editable y 008 ya permitía restringirla por categoría. Pero la
-- categoría es el nivel equivocado para esta decisión: "Tote Personalizado" agrupa un
-- bolso beige, uno negro, uno vino y uno verde, y lo que tiene sentido bordar encima de
-- cada uno es distinto. Hilo beige sobre lona beige no se ve. Con la regla por categoría
-- la única salida era ofrecer los diez colores en todos y confiar en el criterio del
-- cliente.
--
-- Este archivo agrega la misma columna a nivel de producto. La regla que aplica la
-- tienda es una cascada de lo más específico a lo más general (ver initialsColorsFor en
-- src/lib/initials.js):
--
--   products.initials_palette   ¿tiene algo? -> manda, se ignora la categoría
--   categories.initials_palette ¿tiene algo? -> manda
--   ninguna                                  -> toda la paleta
--
-- Así lo que ya estaba configurado sigue funcionando igual: las categorías que hoy no
-- restringen nada siguen sin restringir, y Makeup Bag sigue bordándose solo en plateado
-- sin que haya que tocar sus seis productos uno por uno.
--
-- LAS DOS TABLAS GEMELAS
-- `products` y `products_draft` tienen que seguir siendo idénticas en columnas: la que
-- las copia es publish_catalog(), con listas de columnas escritas a mano (a propósito,
-- ver su comentario), y la sonda p2_schema_parity.sql vigila el par. Agregar la columna
-- a una sola haría fallar la publicación con un error de aridad.

alter table public.products
  add column if not exists initials_palette text[] not null default '{}';

alter table public.products_draft
  add column if not exists initials_palette text[] not null default '{}';

comment on column public.products_draft.initials_palette is
  'Colores de bordado de ESTE producto, por nombre. Vacío = usar la regla de la categoría.';
comment on column public.products.initials_palette is
  'Copia publicada de products_draft.initials_palette. La escribe publish_catalog().';

-- ============================================================================
-- publish_catalog() — la misma función de 003_functions.sql con la columna nueva
-- ============================================================================
-- Se reemplaza ENTERA y no se parchea, porque en Postgres no hay otra forma: una función
-- se redefine completa. El cuerpo de abajo es idéntico al de 003_functions.sql salvo por
-- `initials_palette` agregado en las dos listas de columnas del INSERT ... SELECT.
--
-- SI ALGUIEN VUELVE A TOCAR ESTA FUNCIÓN: 003 ya no es la versión vigente. Esta lo es.

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
     max_initials, group_key, origin, is_active, sort_order, initials_palette, created_at, updated_at)
  select
     id, category_key, name, color, variant, hex, price, personalizable,
     max_initials, group_key, origin, is_active, sort_order, initials_palette, created_at, updated_at
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
