-- 017_photo_focal_point.sql
-- Punto de encuadre por foto (Fase 04 del plan de simplificación del panel admin,
-- ver docs/plan-panel-admin.md).
--
-- Ejecutar después de 016_categoria_portada.sql. Idempotente: `add column if not
-- exists`, y las dos funciones usan `create or replace` (con un `drop` explícito de la
-- firma vieja de `replace_product_photos_draft`, porque cambia de tipo de parámetro).
--
-- POR QUÉ EXISTE
-- La tienda nunca muestra una foto de producto entera: la recorta con object-fit:cover
-- dentro de marcos de proporción fija (1:1 en la tarjeta del catálogo y en la galería,
-- 3:4 en la tarjeta editorial), siempre centrado. Si el producto no queda en el centro
-- exacto de la foto original, el marco le come un borde — un asa, una esquina de la
-- tela. Hoy no hay ningún dato que le diga a ese recorte "el centro real está acá", así
-- que la única corrección posible era volver a tomar la foto.
--
-- Estas dos columnas nuevas son ESE dato: dónde está el punto que el recorte automático
-- de la tienda tiene que tomar como centro, en porcentaje del ancho y del alto de la
-- foto (0-100). El valor por defecto, 50/50, es exactamente el centro geométrico — el
-- comportamiento de HOY. Por eso esta migración no cambia una sola foto en la tienda
-- hasta que alguien, desde el panel, mueva el punto de una foto puntual.
--
-- QUÉ NO HACE
-- No recorta ni modifica el archivo en Storage. Es metadata al lado de la foto, no un
-- recorte grabado — se puede cambiar mil veces sin perder nunca el original. El
-- recorte/giro real (que si genera un archivo nuevo) es la Fase 05, aparte.

alter table public.product_photos
  add column if not exists focal_x smallint not null default 50 check (focal_x between 0 and 100),
  add column if not exists focal_y smallint not null default 50 check (focal_y between 0 and 100);

alter table public.product_photos_draft
  add column if not exists focal_x smallint not null default 50 check (focal_x between 0 and 100),
  add column if not exists focal_y smallint not null default 50 check (focal_y between 0 and 100);

comment on column public.product_photos.focal_x is
  'Porcentaje horizontal (0-100) del punto que el recorte de la tienda toma como centro. 50 = centro geométrico, el default de siempre.';
comment on column public.product_photos.focal_y is
  'Porcentaje vertical (0-100) del punto que el recorte de la tienda toma como centro. 50 = centro geométrico, el default de siempre.';
comment on column public.product_photos_draft.focal_x is 'Ver product_photos.focal_x.';
comment on column public.product_photos_draft.focal_y is 'Ver product_photos.focal_y.';

-- ============================================================================
-- replace_product_photos_draft(text, jsonb) — reemplaza la firma (text, text[])
-- ============================================================================
-- Antes recibía solo un array de rutas (`text[]`); la posición salía del índice. Ahora
-- cada foto trae también su encuadre, así que el parámetro pasa a ser un array JSON de
-- objetos: [{"storage_path": "...", "focal_x": 50, "focal_y": 50}, ...]. El orden del
-- array sigue siendo el orden final de la galería (índice 0 = foto principal) — eso no
-- cambia.
--
-- `drop function` explícito: `create or replace` NO alcanza acá porque el tipo del
-- segundo parámetro cambia (text[] → jsonb) — para Postgres es una firma distinta, y sin
-- el drop quedarían las DOS funciones conviviendo, con PostgREST eligiendo cuál según
-- el tipo del body, que es exactamente la clase de ambigüedad silenciosa que no se
-- puede dejar en un escritor único de datos publicados.
drop function if exists public.replace_product_photos_draft(text, text[]);

create or replace function public.replace_product_photos_draft(
  p_product_id text, p_photos jsonb
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
  if jsonb_typeof(p_photos) is distinct from 'array' then
    raise exception 'replace_product_photos_draft: p_photos debe ser un array JSON'
      using errcode = '22023';
  end if;

  delete from public.product_photos_draft where product_id = p_product_id;

  -- coalesce(...,50) es la misma razón que el default de la columna: un ítem sin
  -- encuadre propio (llamador viejo, o el campo vacío) se toma como centro, no como error.
  insert into public.product_photos_draft (product_id, storage_path, position, focal_x, focal_y)
  select
    p_product_id,
    item ->> 'storage_path',
    (u.ord - 1)::smallint,
    coalesce((item ->> 'focal_x')::smallint, 50),
    coalesce((item ->> 'focal_y')::smallint, 50)
  from jsonb_array_elements(p_photos) with ordinality as u(item, ord);

  select count(*) into v_count
    from public.product_photos_draft where product_id = p_product_id;
  return v_count;
end $$;

revoke all    on function public.replace_product_photos_draft(text, jsonb) from public, anon;
grant  execute on function public.replace_product_photos_draft(text, jsonb) to authenticated;

-- ============================================================================
-- publish_catalog() — misma función, ahora copia también el encuadre
-- ============================================================================
-- `create or replace` sí alcanza acá: la firma de publish_catalog() (sin parámetros)
-- no cambia, solo el cuerpo. Columnas explícitas, no SELECT * — mismo criterio que el
-- resto del archivo: si un día se agrega una columna a un solo lado del par
-- publicado/borrador, esto falla en el parseo en vez de mezclar dos columnas por error.

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
     max_initials, group_key, origin, is_active, sort_order, created_at, updated_at)
  select
     id, category_key, name, color, variant, hex, price, personalizable,
     max_initials, group_key, origin, is_active, sort_order, created_at, updated_at
  from public.products_draft;

  -- focal_x/focal_y se suman a la lista de columnas copiadas (017): son parte de la
  -- foto igual que storage_path y position, así que viajan de borrador a publicado en
  -- la misma fila y en la misma transacción.
  insert into public.product_photos (product_id, storage_path, position, focal_x, focal_y, created_at)
  select product_id, storage_path, position, focal_x, focal_y, created_at
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

revoke all    on function public.publish_catalog() from public, anon;
grant  execute on function public.publish_catalog() to authenticated;
