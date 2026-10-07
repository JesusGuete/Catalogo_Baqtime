-- 022_publish_catalog_paleta.sql
-- Supabase backend — publish_catalog() vuelve a copiar la paleta de bordado de cada producto.
--
-- Run after 021_avisos_estado.sql. Idempotent: `create or replace function`. Volver a
-- pegar este archivo nunca debe dar error. No toca tablas ni datos; solo reemplaza la función.
--
-- EL ERROR QUE ARREGLA: 015_product_initials_palette.sql agregó `initials_palette` a
-- products y products_draft y la sumó al INSERT ... SELECT de publish_catalog(). Después,
-- 017_photo_focal_point.sql y 018_photo_crop_boxes.sql redefinieron publish_catalog() para
-- las fotos partiendo de una copia ANTERIOR a la 015, y la columna se cayó de las dos listas
-- sin que nada fallara: el INSERT sigue siendo válido, solo deja el campo en su default '{}'.
--
-- EL SÍNTOMA: desde 2026-09-07 la paleta de colores de bordado que el dueño elige por
-- producto en el panel nunca llegó a la tienda. Publicar dejaba `products.initials_palette`
-- vacía, la tienda caía a la paleta de la categoría (la regla de 015: producto vacío →
-- manda la categoría), y el panel seguía mostrando esos productos como "editados" después
-- de publicar, porque el borrador y lo publicado nunca podían quedar iguales.
--
-- Igual a publish_catalog() de 018 salvo por `initials_palette` en las dos listas del INSERT.
--
-- DESPUÉS DE CORRER ESTO hay que volver a publicar una vez desde el panel: la función corrige
-- las publicaciones futuras, no repara las pasadas. Esa publicación copia las paletas del
-- borrador a lo publicado y la tienda empieza a usarlas.

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
  if not public.is_admin() then
    raise exception 'publish_catalog: caller is not an admin' using errcode = '42501';
  end if;

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

  if not pg_try_advisory_xact_lock(hashtext('publish_catalog')) then
    raise exception 'publish_catalog: another publish is in progress' using errcode = '55P03';
  end if;

  select email into v_email from auth.users where id = v_actor;

  select coalesce(array_agg(pp.storage_path), '{}') into v_before
    from public.product_photos pp;

  delete from public.product_photos where true;                         -- FK order: photos first
  delete from public.products where true;

  insert into public.products
    (id, category_key, name, color, variant, hex, price, personalizable,
     max_initials, group_key, origin, is_active, sort_order, initials_palette,
     created_at, updated_at)
  select
     id, category_key, name, color, variant, hex, price, personalizable,
     max_initials, group_key, origin, is_active, sort_order, initials_palette,
     created_at, updated_at
  from public.products_draft;

  insert into public.product_photos (
    product_id, storage_path, position,
    crop_square_x, crop_square_y, crop_square_w, crop_square_h,
    crop_editorial_x, crop_editorial_y, crop_editorial_w, crop_editorial_h,
    created_at
  )
  select
    product_id, storage_path, position,
    crop_square_x, crop_square_y, crop_square_w, crop_square_h,
    crop_editorial_x, crop_editorial_y, crop_editorial_w, crop_editorial_h,
    created_at
  from public.product_photos_draft;

  select count(*) into v_products from public.products;
  select count(*) into v_photos   from public.product_photos;

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
