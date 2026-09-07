-- 018_photo_crop_boxes.sql
-- Reemplaza el punto de encuadre (017) por DOS cajas de recorte por foto: una para
-- la forma cuadrada (tarjeta del catálogo, galería, buscador) y otra para la forma
-- editorial 3:4. Decisión del dueño: un solo punto no alcanza porque la misma foto
-- necesita un recorte distinto en cada forma — ver docs/plan-panel-admin.md.
--
-- Ejecutar después de 017_photo_focal_point.sql.
--
-- POR QUÉ NULLABLE, DEFAULT NULL (no un valor "centrado" fijo como 017)
-- El encuadre de 017 podía defaultear a 50/50 porque un PUNTO centrado se ve igual
-- sin importar las proporciones reales de la foto. Una CAJA no: "la caja ocupa el
-- 100% de la imagen" en una foto vertical y en una horizontal da resultados
-- completamente distintos, y calcular la caja correcta (la que se ve exactamente
-- como el object-fit:cover de hoy) depende del ancho y el alto reales del archivo —
-- un dato que esta migración, corriendo en SQL, no tiene.
--
-- Por eso el default es NULL: "sin caja propia todavía". El sitio, cuando ve NULL,
-- sigue usando el mismo <img style="object-fit:cover"> de siempre — el camino que ya
-- existe y ya funciona, sin ningún cálculo nuevo de por medio. El panel sí conoce las
-- dimensiones reales (las lee del archivo cargado en el navegador) y arranca el
-- recorte mostrando exactamente esa caja "como se ve hoy" — el dueño ve lo mismo de
-- siempre hasta que decide mover algo.
--
-- QUÉ SIGNIFICA CADA NÚMERO
-- x, y: esquina superior izquierda de la caja, en % del ANCHO (x) y del ALTO (y) de
-- la foto original. w, h: ancho y alto de la caja, en esa misma unidad. Es la misma
-- convención que un `background-position`/`background-size` a mano: todo relativo a
-- las dimensiones propias del archivo, nunca a píxeles fijos — así una caja sigue
-- siendo válida aunque la foto se reemplace por otra de tamaño distinto (algo que
-- SÍ puede pasar acá: girar o voltear sube un archivo nuevo, ver PhotoStudio.tsx).
--
-- 017 se da de baja: era la respuesta anterior a la misma pregunta ("desde dónde
-- recorta la tienda"), y dos respuestas a la misma pregunta es justo lo que este
-- proyecto evita en cualquier otra parte del esquema.

alter table public.product_photos
  drop column if exists focal_x,
  drop column if exists focal_y;

alter table public.product_photos_draft
  drop column if exists focal_x,
  drop column if exists focal_y;

alter table public.product_photos
  add column if not exists crop_square_x    smallint check (crop_square_x    between 0 and 100),
  add column if not exists crop_square_y    smallint check (crop_square_y    between 0 and 100),
  add column if not exists crop_square_w    smallint check (crop_square_w    between 1 and 100),
  add column if not exists crop_square_h    smallint check (crop_square_h    between 1 and 100),
  add column if not exists crop_editorial_x smallint check (crop_editorial_x between 0 and 100),
  add column if not exists crop_editorial_y smallint check (crop_editorial_y between 0 and 100),
  add column if not exists crop_editorial_w smallint check (crop_editorial_w between 1 and 100),
  add column if not exists crop_editorial_h smallint check (crop_editorial_h between 1 and 100);

alter table public.product_photos_draft
  add column if not exists crop_square_x    smallint check (crop_square_x    between 0 and 100),
  add column if not exists crop_square_y    smallint check (crop_square_y    between 0 and 100),
  add column if not exists crop_square_w    smallint check (crop_square_w    between 1 and 100),
  add column if not exists crop_square_h    smallint check (crop_square_h    between 1 and 100),
  add column if not exists crop_editorial_x smallint check (crop_editorial_x between 0 and 100),
  add column if not exists crop_editorial_y smallint check (crop_editorial_y between 0 and 100),
  add column if not exists crop_editorial_w smallint check (crop_editorial_w between 1 and 100),
  add column if not exists crop_editorial_h smallint check (crop_editorial_h between 1 and 100);

comment on column public.product_photos.crop_square_x is
  'Caja de recorte cuadrada (tarjeta, galería, buscador). % del ancho de la foto. NULL = sin personalizar, la tienda usa object-fit:cover normal.';
comment on column public.product_photos.crop_editorial_x is
  'Caja de recorte 3:4 (tarjeta editorial). % del ancho de la foto. NULL = sin personalizar.';

-- ============================================================================
-- replace_product_photos_draft(text, jsonb) — misma firma, nuevos campos posibles
-- ============================================================================
-- La firma (text, jsonb) no cambia desde 017 — sigue siendo un array de objetos, y
-- Postgres no distingue "qué claves trae cada objeto" a nivel de tipo, así que no
-- hace falta drop+create como en 017 (ahí el cambio fue de tipo de parámetro:
-- text[] → jsonb). Acá cambia el cuerpo nada más: qué columnas lee de cada objeto.

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

  -- Sin coalesce: a diferencia de 017, acá NULL es un valor legítimo y querido ("sin
  -- personalizar"), no un caso de error a taparle un default. Una clave ausente en el
  -- JSON o un `null` explícito dan exactamente lo mismo: NULL en la columna.
  insert into public.product_photos_draft (
    product_id, storage_path, position,
    crop_square_x, crop_square_y, crop_square_w, crop_square_h,
    crop_editorial_x, crop_editorial_y, crop_editorial_w, crop_editorial_h
  )
  select
    p_product_id,
    item ->> 'storage_path',
    (u.ord - 1)::smallint,
    (item ->> 'crop_square_x')::smallint,
    (item ->> 'crop_square_y')::smallint,
    (item ->> 'crop_square_w')::smallint,
    (item ->> 'crop_square_h')::smallint,
    (item ->> 'crop_editorial_x')::smallint,
    (item ->> 'crop_editorial_y')::smallint,
    (item ->> 'crop_editorial_w')::smallint,
    (item ->> 'crop_editorial_h')::smallint
  from jsonb_array_elements(p_photos) with ordinality as u(item, ord);

  select count(*) into v_count
    from public.product_photos_draft where product_id = p_product_id;
  return v_count;
end $$;

-- ============================================================================
-- publish_catalog() — copia las 8 columnas nuevas en vez de focal_x/focal_y
-- ============================================================================

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
