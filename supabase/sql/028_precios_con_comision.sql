-- 028_precios_con_comision.sql
-- Supabase backend — los precios suben para cubrir la comisión de Wompi.
--
-- Run after 026_photo_crop_decimales.sql (y después de 027_pagos_en_linea.sql si ya se corrió;
-- no dependen una de otra). SOLO DATOS: no cambia ninguna tabla ni función.
--
-- CUÁNDO: el día que se encienden los pagos en línea, junto con la publicación del código que
-- suma la comisión al envío (src/lib/envios.js). No antes: sin Wompi, los precios con comisión
-- cobrarían de más a quien paga por transferencia sin ninguna razón.
--
-- QUÉ HACE (tabla completa y cuentas en docs/plan-precios-con-comision.md):
--   * products_draft: cada producto pasa de su precio de hoy al precio con comisión. Queda en
--     el BORRADOR: la tienda no cambia hasta que se pulse Publicar en el panel.
--   * categories: precio base y recargo de iniciales. ESTO SÍ SE VE AL INSTANTE, porque las
--     categorías no tienen borrador: el recargo de iniciales del tote pasa a $11.000 apenas se
--     corre este archivo. Por eso se corre el mismo día y justo antes de publicar.
--
-- La regla: el precio se divide por (1 − 3,1535 %), que es 2,65 % de comisión + su IVA, y se
-- redondea hacia arriba al millar. Los $700 fijos (+ IVA) no van acá: van en el envío, que se
-- cobra una vez por pedido (src/lib/pricing.js).
--
-- IDEMPOTENTE Y CONSERVADOR: cada cambio exige la categoría Y el precio viejo exacto. Correrlo
-- dos veces no sube nada dos veces, y un producto cuyo precio ya se cambió a mano en el panel no
-- se toca. Solo se tocan las seis categorías revisadas en la tabla del plan. Al final se listan
-- (NOTICE) los productos de esas categorías que quedaron con un precio fuera de la tabla, para
-- revisarlos a mano.

-- ============================================================================
-- Productos — en el borrador
-- ============================================================================

with nuevos (categoria, viejo, nuevo) as (
  values
    ('tote',         120000, 124000),
    ('tote-luxury',  120000, 124000),
    ('lumiere',      130000, 135000),
    ('makeup-bag',    80000,  83000),
    ('neceser',       50000,  52000),
    ('cosmetiquera',  50000,  52000)
)
update public.products_draft d
   set price = n.nuevo
  from nuevos n
 where d.category_key = n.categoria
   and d.price = n.viejo;

-- ============================================================================
-- Categorías — en vivo
-- ============================================================================
-- El precio base solo es el valor que el panel propone al crear un producto nuevo; no cambia
-- los productos que ya existen.

with nuevos (categoria, viejo, nuevo) as (
  values
    ('tote',         120000, 124000),
    ('tote-luxury',  120000, 124000),
    ('lumiere',      130000, 135000),
    ('neceser',       60000,  62000),
    ('cosmetiquera',  50000,  52000),
    ('makeup-bag',    70000,  73000)
)
update public.categories c
   set default_price = n.nuevo
  from nuevos n
 where c.key = n.categoria
   and c.default_price = n.viejo;

-- El recargo por iniciales del tote (desde la cuarta inicial). Se cobra junto con el producto,
-- así que lleva el mismo porcentaje: $10.000 → $11.000.
update public.categories
   set extra_initials_price = 11000
 where key = 'tote'
   and extra_initials_price = 10000;

-- ============================================================================
-- Lo que quedó fuera de la tabla
-- ============================================================================
-- Un producto creado o cambiado después de armar la tabla (2026-10-10) puede tener otro precio.
-- No se adivina: se avisa, y se ajusta a mano en el panel, que muestra "Con Wompi recibes ≈ $…"
-- junto al precio.

do $$
declare r record;
begin
  for r in
    select id, name, category_key, price
      from public.products_draft
     where category_key in ('tote', 'tote-luxury', 'lumiere', 'makeup-bag', 'neceser', 'cosmetiquera')
       and price not in (124000, 135000, 83000, 52000)
     order by category_key, id
  loop
    raise notice 'Revisar a mano: % (%), categoría %, precio %', r.name, r.id, r.category_key, r.price;
  end loop;
end $$;
