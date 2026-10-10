-- 026_photo_crop_decimales.sql
-- Supabase backend — las cajas de recorte de las fotos aceptan decimales.
--
-- Run after 025_conservacion_datos.sql. Idempotent: volver a cambiar una columna al tipo
-- que ya tiene no da error, y la función es `create or replace`. Volver a pegar este
-- archivo nunca debe dar error. No borra ni cambia ningún recorte existente: un entero
-- (smallint) entra tal cual en numeric.
--
-- EL ERROR QUE ARREGLA: al guardar un producto con una foto recortada desde el panel,
--   invalid input syntax for type smallint: "22.465208747514907"   (400 · 22P02)
-- 018_photo_crop_boxes.sql creó las 16 columnas crop_* como `smallint`, pero el panel
-- calcula las cajas en porcentajes con decimales (arrastrar la caja, o la caja automática
-- de lib/admin/crop.ts), y replace_product_photos_draft() convierte el texto del JSON con
-- `::smallint`, que no redondea: rechaza cualquier "22.46…". En la práctica ningún recorte
-- se podía guardar. La fila del producto sí se guarda (va antes, ver ProductEditor.tsx);
-- lo que falla entero es el reemplazo de las fotos, que queda como estaba.
--
-- POR QUÉ NUMERIC Y NO REDONDEAR A ENTERO: la tienda (src/lib/crop-style.js) escala el
-- ancho y el alto de la foto POR SEPARADO a partir de `w` y `h`. Redondear cada uno por su
-- lado deja de respetar la proporción 1:1 / 3:4 y la foto se ve estirada — hasta un 3-4%
-- en recortes chicos. Tres decimales de un porcentaje es menos de un píxel en cualquier
-- foto de la tienda, y Postgres redondea solo los decimales que sobran al guardar.
--
-- Los CHECK de 018 (between 0 and 100, between 1 and 100) siguen igual: Postgres los
-- revalida con el tipo nuevo al cambiar la columna.

alter table public.product_photos
  alter column crop_square_x    type numeric(6,3),
  alter column crop_square_y    type numeric(6,3),
  alter column crop_square_w    type numeric(6,3),
  alter column crop_square_h    type numeric(6,3),
  alter column crop_editorial_x type numeric(6,3),
  alter column crop_editorial_y type numeric(6,3),
  alter column crop_editorial_w type numeric(6,3),
  alter column crop_editorial_h type numeric(6,3);

alter table public.product_photos_draft
  alter column crop_square_x    type numeric(6,3),
  alter column crop_square_y    type numeric(6,3),
  alter column crop_square_w    type numeric(6,3),
  alter column crop_square_h    type numeric(6,3),
  alter column crop_editorial_x type numeric(6,3),
  alter column crop_editorial_y type numeric(6,3),
  alter column crop_editorial_w type numeric(6,3),
  alter column crop_editorial_h type numeric(6,3);

-- ============================================================================
-- replace_product_photos_draft(text, jsonb) — igual a 018 salvo `::numeric`
-- ============================================================================
-- publish_catalog() (022) no hace falta tocarla: copia columna a columna entre dos tablas
-- que ahora tienen el mismo tipo nuevo.

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

  -- Sin coalesce: NULL es un valor legítimo ("sin personalizar"), ver 018.
  insert into public.product_photos_draft (
    product_id, storage_path, position,
    crop_square_x, crop_square_y, crop_square_w, crop_square_h,
    crop_editorial_x, crop_editorial_y, crop_editorial_w, crop_editorial_h
  )
  select
    p_product_id,
    item ->> 'storage_path',
    (u.ord - 1)::smallint,
    (item ->> 'crop_square_x')::numeric,
    (item ->> 'crop_square_y')::numeric,
    (item ->> 'crop_square_w')::numeric,
    (item ->> 'crop_square_h')::numeric,
    (item ->> 'crop_editorial_x')::numeric,
    (item ->> 'crop_editorial_y')::numeric,
    (item ->> 'crop_editorial_w')::numeric,
    (item ->> 'crop_editorial_h')::numeric
  from jsonb_array_elements(p_photos) with ordinality as u(item, ord);

  select count(*) into v_count
    from public.product_photos_draft where product_id = p_product_id;
  return v_count;
end $$;
