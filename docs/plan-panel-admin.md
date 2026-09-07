# Plan — Panel de administración y edición del sitio

Documento de seguimiento vivo de la simplificación del panel `/admin` y de las mejoras
al editor de fotos. Complementa (no reemplaza) los dos PDF ya entregados:

- `docs/Plan-panel-admin-baqtime.pdf` — diagnóstico y fases originales.
- `docs/Disenos-panel-admin-baqtime.pdf` — las seis maquetas para elegir.

Diseño elegido (confirmado en conversación): **editor de fotos "Estudio a pantalla
completa" (opción A), con la paleta real de Baqtime en vez de la genérica oscura** +
**panel "Celular primero" (opción 3)**, porque el dueño administra sobre todo desde el
celular.

## Hecho

- **Fase 01 — Silenciar el panel.** Jerga de base de datos fuera de la superficie,
  señales de "sin publicar" consolidadas en una sola, aviso de sesión solo en los
  últimos 10 minutos, botones "Ocultar" y "Deshacer cambios" duplicados eliminados,
  textos y ayudas de sobra recortados pantalla por pantalla (Categorías, Productos,
  Publicar, gestor de fotos). Ver commits en `feat/panel-admin-simplificado`.
- **Decisión de producto:** la paleta de colores de bordado se define siempre por
  producto (nunca como default heredado de la categoría) — se sacó su editor de
  Categorías.

## Por hacer — editor de fotos (bloque original)

- **Fase 04 — Punto de encuadre.** Migración (`focal_x`, `focal_y` en `product_photos`
  y `product_photos_draft`, default 50/50 = centro), `replace_product_photos_draft`
  actualizada, `catalog.ts` trayendo los valores nuevos, `site.css` usando
  `object-position` en vez de centro fijo. 🔒 Pendiente de autorización para tocar
  Supabase (preguntado, no confirmado todavía).
- **Fase 05 — Recortar, girar y optimizar.** El estudio a pantalla completa (opción A):
  zoom, arrastre, relaciones fijas 1:1 y 3:4, giro, espejo, reemplazo con conservación
  del original para poder revertir, y redimensionado a WebP en el mismo paso.
- **Fase 02/03 — Lista de productos y editor en dos bloques.** Miniatura grande, menú
  `⋯`, "Avanzado" plegado (ID, grupo de color), orden fuera del formulario.
- **Fase 06 — Repaso en celular.** Con el panel ya orientado "celular primero", probar
  el recortador con dedo en dispositivo real antes de cerrar la Fase 05.

## Por hacer — agregado en esta sesión (2026-09-07)

### 1. Editor + vista previa de la portada de categoría (foto de "Nuestras colecciones")

Hoy `CategoriesView.tsx` ya permite subir/quitar esa foto (`portada_img`, sin
borrador — se guarda directo), pero sin ningún control de encuadre: la imagen se
recorta sola, sin vista previa de cómo va a quedar.

**Hallazgo importante que cambia el alcance:** la tarjeta de categoría **no se recorta
igual en celular que en computador** — no es el mismo caso que el encuadre de fotos de
producto (Fase 04), es más exigente:

| Dónde | Recorte real (`site.css`) |
|---|---|
| Computador (`.portada-img`) | Cuadrado `1:1`, `object-fit:cover` |
| Celular (`@media`, `.portada-img` sobrescrito) | Llena toda la tarjeta (`aspect-ratio:auto`, `position:absolute; inset:0`), con degradado oscuro superpuesto para que el texto se lea encima |

Un solo punto de encuadre (como en Fase 04) no alcanza acá: la proporción cuadrada y la
franja ancha de celular pueden pedir centros distintos de la misma foto. Hace falta
**un encuadre independiente por vista** (celular / computador), cada uno con su propia
vista previa en vivo mostrando el marco real de cada uno — mismo principio de "se ve
antes de guardarse" que en Fase 04, aplicado dos veces.

**Alcance técnico:** agrega dos pares de columnas a `categories` (`portada_focal_x`,
`portada_focal_y` para computador; `portada_focal_x_mobile`, `portada_focal_y_mobile`
para celular — o una sola columna JSON con las cuatro, a decidir), la pantalla de
Categorías gana el mismo tipo de control de encuadre de la Fase 04 pero con dos vistas
previas conmutables, y `CollectionsCarousel.astro` lee esos valores. Como categorías
se guarda directo (sin publicar), el cambio se ve en la tienda de inmediato — no pasa
por el flujo de "Publicar".

### 2. Editar el Hero de la portada (título, texto y botón) desde el panel

Lo marcado en blanco (`Bolsos y accesorios Personalizados`, el párrafo de abajo, y el
botón "Ver catálogo") es hoy texto **fijo en el código**
(`src/components/astro/Hero.astro`) — no sale de ninguna tabla, así que hoy nadie
puede cambiarlo sin editar el archivo y volver a desplegar.

**Buena noticia técnica:** `astro.config.mjs` tiene `output: 'server'` y
`index.astro` ya carga el catálogo **en cada visita** (no en el build), con caché de
borde de 60 segundos. Es decir, el sitio *ya* funciona en el modo que hace falta para
esto — no hay que migrar nada de arquitectura, alcanza con:

1. Una tabla nueva de una sola fila (`site_settings` o similar): título, párrafo,
   texto y enlace del botón — y ya que estamos, la propia foto del Hero con su
   encuadre, mismo patrón que los dos puntos anteriores.
2. Una pantalla nueva en el panel (o una sección dentro de una existente) que la
   edite — sin borrador: se guarda y se ve en la tienda en ese mismo minuto, igual
   que Categorías y Colores hoy.
3. `Hero.astro` deja de tener el texto escrito adentro y lo recibe como prop, leído
   con el mismo criterio que ya usa `loadCatalog()`.

Es la pieza más nueva de las tres (hoy no existe ningún editor de "contenido del
sitio", solo de catálogo) pero no es grande: una tabla, una pantalla simple, un
componente que pasa a recibir props en vez de tener el texto adentro.

## Decisión pendiente que sigue bloqueando la Fase 04

¿Autorizás las columnas nuevas en Supabase (`focal_x`/`focal_y` en fotos de producto,
y las de portada de categoría del punto 1 de arriba)? Sin esa autorización, el trabajo
de fotos no puede arrancar por el camino recomendado (ver PDF del plan, sección 3.3).
