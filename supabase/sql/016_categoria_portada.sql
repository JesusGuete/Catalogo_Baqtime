-- 016_categoria_portada.sql
-- La foto y la descripción de cada tarjeta de "Nuestras colecciones", en la base.
--
-- Ejecutar después de 015_product_initials_palette.sql. Idempotente: `add column if not
-- exists` y un seed que solo escribe donde todavía no hay nada.
--
-- POR QUÉ EXISTE
-- El carrusel de la portada tenía las seis tarjetas escritas a mano en
-- src/components/astro/CollectionsCarousel.astro: título, descripción y ruta de la foto.
-- Crear una categoría desde el panel NO la hacía aparecer ahí — había que editar el
-- código y volver a desplegar. Y al revés: borrar una categoría dejaba su tarjeta
-- apuntando a un catálogo vacío.
--
-- Las seis tarjetas eran exactamente las seis categorías, así que no hace falta una tabla
-- nueva: sobran dos columnas en la que ya existe. El título ya lo daba `label`.
--
-- DÓNDE VIVEN LAS FOTOS
-- `portada_img` guarda una URL COMPLETA, no una ruta. Es lo que permite convivir dos
-- buckets sin que la columna tenga que saber de cuál viene cada imagen:
--
--   · Las seis actuales están en `site-images`, que es de SOLO LECTURA para todos, los
--     administradores incluidos (006_storage_policies.sql). Es una decisión de diseño
--     deliberada: la limpieza de huérfanos no puede tocar las imágenes del sitio ni con
--     credenciales válidas. Este archivo NO la cambia.
--   · Las que se suban desde el panel van a `product-images`, el bucket que el panel sí
--     escribe. No corren riesgo de que la limpieza las borre: `publish_catalog()` calcula
--     `removed_paths` a partir de `product_photos`, y una portada nunca es la foto de un
--     producto, así que jamás entra en ese conjunto.
--
-- El costo de guardar la URL entera es que ata el dato al proyecto de Supabase: si
-- alguna vez se migra a otro, hay que reescribir estas seis filas. Es un precio bajo
-- comparado con acoplar la columna a un bucket.

alter table public.categories
  add column if not exists portada_desc text,
  add column if not exists portada_img  text;

comment on column public.categories.portada_desc is
  'Texto de la tarjeta en "Nuestras colecciones". Vacío = la categoría no sale en el carrusel.';
comment on column public.categories.portada_img is
  'URL COMPLETA de la foto de portada. Vacío = la categoría no sale en el carrusel.';

-- ============================================================================
-- Seed: exactamente lo que el carrusel mostraba antes de este archivo
-- ============================================================================
-- Sin esto, al desplegar el código que lee estas columnas el carrusel se quedaría VACÍO
-- hasta que el dueño subiera las seis fotos a mano. La portada perdería su sección
-- principal sin que nadie hubiera pedido eso.
--
-- `where portada_img is null` para que volver a ejecutarlo no pise una portada que el
-- dueño ya haya cambiado desde el panel.
--
-- La URL del proyecto va escrita porque un archivo SQL no tiene acceso a las variables
-- de entorno del sitio. Si alguna vez cambia el proyecto de Supabase, estas seis filas
-- son las que hay que revisar.
update public.categories set
  portada_desc = coalesce(portada_desc, 'Bolso tote bordado con tus iniciales. Perfecto para el día a día.'),
  portada_img  = 'https://kqbtdrglohazcrbogdzp.supabase.co/storage/v1/object/public/site-images/tote_personalizado.webp'
 where key = 'tote' and portada_img is null;

update public.categories set
  portada_desc = coalesce(portada_desc, 'La versión premium del tote, en acabados más finos. Personalizable con hasta 2 iniciales.'),
  portada_img  = 'https://kqbtdrglohazcrbogdzp.supabase.co/storage/v1/object/public/site-images/tote_luxury.jpg'
 where key = 'tote-luxury' and portada_img is null;

update public.categories set
  portada_desc = coalesce(portada_desc, 'Bolso tipo hobo, elegante y listo para usar, sin personalización. Un básico versátil para cualquier look.'),
  portada_img  = 'https://kqbtdrglohazcrbogdzp.supabase.co/storage/v1/object/public/site-images/lumiere_negro_life1.webp'
 where key = 'lumiere' and portada_img is null;

update public.categories set
  portada_desc = coalesce(portada_desc, 'Cosmetiquera personalizable con hasta 2 iniciales, del tamaño justo para tus básicos de maquillaje.'),
  portada_img  = 'https://kqbtdrglohazcrbogdzp.supabase.co/storage/v1/object/public/site-images/cosmetiqueras.jpg'
 where key = 'cosmetiquera' and portada_img is null;

update public.categories set
  portada_desc = coalesce(portada_desc, 'Neceser de cuero vegano personalizable con máximo 2 letras. Ideal para viajes y el día a día.'),
  portada_img  = 'https://kqbtdrglohazcrbogdzp.supabase.co/storage/v1/object/public/site-images/neceser_portada1.webp'
 where key = 'neceser' and portada_img is null;

update public.categories set
  portada_desc = coalesce(portada_desc, 'Makeup bag personalizable con hasta 3 iniciales, pensada para organizar tus productos de belleza con estilo.'),
  portada_img  = 'https://kqbtdrglohazcrbogdzp.supabase.co/storage/v1/object/public/site-images/makeup_bag_portada1.jpg'
 where key = 'makeup-bag' and portada_img is null;
