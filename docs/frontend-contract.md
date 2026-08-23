# Contrato de datos — Supabase → front Astro/React

Documento de entrega para quien trabaja en `migracion/astro-react`.
Estado del backend: **desplegado y verificado el 2026-07-30**.

Este documento reemplaza a `src/lib/mock-catalog.js`. Todo lo que sigue está
verificado contra el proyecto real, no es un diseño en papel.

---

## 1. Conexión

```
PUBLIC_SUPABASE_URL=https://kqbtdrglohazcrbogdzp.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<Settings → API → anon public>
PUBLIC_SUPABASE_STORAGE_BUCKET=product-images
```

La `anon key` es pública por diseño: viaja en el JavaScript del sitio y cualquiera
la ve con el inspector. No es un secreto y no necesita protección.

La `service_role key` **no se usa en el front, nunca**, ni en el frontmatter de un
`.astro`, ni en un endpoint de Cloudflare Workers. Salta RLS por completo. Si aparece
en el bundle, el catálogo entero queda escribible desde el navegador.

`.env.example` ya tiene las tres variables `PUBLIC_*`. La variable
`SUPABASE_SERVICE_ROLE_KEY` que también figura ahí es para scripts locales de un solo
uso y hoy no la necesita nadie del lado del front.

### Cómo llegan los datos a la tienda — RESUELTO el 2026-07-31

**El sitio se renderiza por petición** (`output: 'server'` + `@astrojs/cloudflare`).
`loadCatalog()` corre en el frontmatter, igual que antes, pero ahora en cada visita en
vez de una sola vez al construir.

Antes se hacía en el build. Esa versión decía que reconstruir era el precio a pagar y
que "se resuelve con un webhook". No alcanzaba, por dos razones que aparecieron usando
el sistema:

- **Falla silenciosa y permanente.** El 2026-07-31 un build corrió en el instante en
  que `products` estaba vacía y horneó `products: []` en el HTML. La base estaba
  intacta — 6 categorías, 32 productos, 42 fotos — y la tienda igual mostró el catálogo
  vacío, sin ningún error, hasta que alguien reconstruyera a mano.
- **Hay páginas que no se pueden pre-construir.** El seguimiento de un pedido depende
  de quién pregunta y de cuándo. No existe en el momento del build.

Lo que hace falta saber para trabajar con esto:

- Cada página fija su `Cache-Control`. La portada usa
  `public, s-maxage=60, stale-while-revalidate=300`: Cloudflare guarda el HTML ya
  renderizado en el edge, así que la mayoría de las visitas no llegan a Supabase. El
  `60` acota cuánto tarda en verse un precio nuevo, y bajarlo acerca el "tiempo real"
  a costa de más consultas.
- Una página sin datos del servidor se pre-construye con `export const prerender = true`.
  `/admin` lo hace: es una cáscara vacía y renderizarla por visita gastaría una
  invocación del Worker para devolver siempre lo mismo.
- El build ya **no** necesita credenciales de Supabase. Antes fallaba entero si faltaba
  `PUBLIC_SUPABASE_URL`; ahora eso es un error en tiempo de ejecución de una página, no
  una construcción rota.

---

## 2. Lo que el front PUEDE leer

Estas cuatro tablas son legibles con la `anon key`. Verificado con `curl` el 2026-07-30;
`initials_colors` se sumó después, en `014_initials_colors.sql`.

### `categories`

| Columna | Tipo | Notas |
|---|---|---|
| `key` | `text` PK | `tote`, `neceser`, … Es la clave que usan los productos. |
| `label` | `text` | Nombre visible. Reemplaza a `CATEGORY_LABELS`. |
| `default_price` | `integer` | Precio sugerido de la categoría, en pesos enteros. |
| `personalizable` | `boolean` | Si es `false`, no se muestra el bloque de iniciales. |
| `max_initials` | `smallint` | Tope del campo de iniciales y de su etiqueta. |
| `has_variant` | `boolean` | `true` → el subtítulo de la tarjeta es `variant`, no el label. |
| `position` | `smallint` UNIQUE | Orden de las pestañas. `order=position`. |
| `is_imported` | `boolean` | `true` → mostrar el aviso de 15-20 días de entrega. |
| `free_initials` | `smallint` | Iniciales cubiertas por el precio base. |
| `extra_initials_price` | `integer` | Recargo único cuando se superan las gratis. |
| `initials_palette` | `text[]` | Colores de bordado permitidos, por nombre. Vacío = todos. |

Las últimas cuatro se agregaron en `008_category_rules.sql` justamente para sacar del
código las reglas por categoría. Ver §6.

`initials_palette` guarda NOMBRES sueltos, sin foreign key contra `initials_colors`. Un
nombre que ya no exista en la paleta no rompe nada: `initialsColorsFor` descarta el
filtro entero y muestra la paleta completa antes que dejar una ficha sin ningún color
que elegir.

### `initials_colors`

La paleta de bordado de la marca. Hasta `014_initials_colors.sql` era una constante del
front (`INITIALS_COLORS` en `src/lib/initials.js`) duplicada —con otros valores— en el
panel. Ahora la edita el dueño desde la pantalla COLORES.

| Columna | Tipo | Notas |
|---|---|---|
| `name` | `text` PK | Es lo que referencian `categories.initials_palette` y `order_items.initials_color`. Por eso no se renombra. |
| `hex` | `text` | `#RRGGBB`, con CHECK. Llega al navegador como `--swatch-color`. |
| `position` | `smallint` | Orden de los círculos. **NO** es único: hay que desempatar por `name` al ordenar. |

### `products`

Solo devuelve filas con `is_active = true`. La política RLS lo filtra en el servidor;
el front no necesita filtrar y **no puede** ver las inactivas aunque lo intente.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `text` PK | `t1`, `n3`, `custom_1730000000000` |
| `category_key` | `text` FK | → `categories.key` |
| `name` | `text` | |
| `color` | `text` | |
| `variant` | `text` NULL | Ej. "Cordones Negros". Nulo en la mayoría. |
| `hex` | `text` NULL | Formato estricto `#RRGGBB`. La base rechaza `#000`. |
| `price` | `integer` | **Pesos enteros.** `130000`, nunca `130000.00`. |
| `personalizable` | `boolean` | |
| `max_initials` | `smallint` | |
| `group_key` | `text` | Agrupa colores. Alimenta el filtro y los relacionados. |
| `origin` | `text` | `factory` \| `custom`. El front puede ignorarlo. |
| `is_active` | `boolean` | Siempre `true` en lo que llega al front. |
| `sort_order` | `integer` | Orden dentro de la categoría. Es el orden "Relevancia". |
| `created_at` / `updated_at` | `timestamptz` | |

### `product_photos`

| Columna | Tipo | Notas |
|---|---|---|
| `product_id` | `text` FK | → `products.id` |
| `storage_path` | `text` | Relativo al bucket. Ej. `tote/1730000000000.webp` |
| `position` | `smallint` | `0` = foto principal. Ordenar por esta columna. |

**Un producto puede tener cero fotos.** Pasa siempre con un producto recién creado.
El front tiene que resolverlo con el placeholder, no romperse.

---

## 3. Lo que el front NO puede leer

Verificado: devuelven `401` con código `42501`.

| Tabla | Por qué |
|---|---|
| `products_draft` | Borradores del panel. `anon` no tiene grant. |
| `product_photos_draft` | Idem. |
| `publications` | Bitácora de publicaciones. |
| `admins` | Solo la fila propia, y `anon` no tiene fila. |

Esto no es una política que rechaza: es que el permiso no existe. Postgres frena
antes de evaluar RLS. Si alguna de estas devuelve datos alguna vez, es un incidente.

---

## 4. Las consultas

PostgREST detecta la foreign key, así que catálogo + fotos salen en **una sola
petición**:

```
GET /rest/v1/products
  ?select=id,category_key,name,color,variant,hex,price,personalizable,max_initials,group_key,sort_order,product_photos(storage_path,position)
  &order=sort_order
Headers: apikey: <anon key>
```

```
GET /rest/v1/categories
  ?select=key,label,default_price,personalizable,max_initials,has_variant,position,is_imported,free_initials,extra_initials_price,initials_palette
  &order=position
```

```
GET /rest/v1/initials_colors
  ?select=name,hex,position
  &order=position,name
```

El `,name` del `order` no es decorativo: `position` no es única en esta tabla, y sin el
desempate el orden de los círculos cambia entre peticiones.

Las fotos embebidas **no vienen ordenadas**; hay que ordenarlas por `position` en el
cliente, o pedir `product_photos(storage_path,position.order(position))`.

### URL pública de una imagen

```
https://kqbtdrglohazcrbogdzp.supabase.co/storage/v1/object/public/product-images/<storage_path>
```

El bucket es público en lectura. No hay que firmar URLs ni pedir tokens.

Existe un segundo bucket, `site-images`, para las imágenes del sitio (hero, logo,
carrusel de colecciones). Es de **solo lectura para todo el mundo, incluido el admin**:
se cargan a mano por el dashboard y desde ahí nadie las puede borrar ni sobreescribir,
ni siquiera con credenciales válidas. Es a propósito.

---

## 5. Mapeo `mock-catalog.js` → real

Esta es la parte que hay que mirar con atención. Los nombres no coinciden.

| `CATALOG_MOCK` (hoy) | Supabase | Cambio |
|---|---|---|
| `category` | `category_key` | Renombre |
| `maxInitials` | `max_initials` | camelCase → snake_case |
| `groupKey` | `group_key` | camelCase → snake_case |
| `img` (string único) | `product_photos[]` | **Cambia de forma**: un string pasa a ser un array ordenado |
| `gallery` (previsto) | `product_photos[]` | Se unifica con lo anterior |
| `id`, `name`, `color`, `variant`, `hex`, `price`, `personalizable` | iguales | Sin cambio |
| — | `sort_order` | **Nuevo.** Es el orden "Relevancia" del selector. |
| `CATEGORY_LABELS` | `categories.label` | Deja de ser constante |
| `CATS` | `categories` + `{key: null, label: "Todos"}` | El "Todos" es del front, no de la base |
| `IMPORTED_CATEGORIES` | `categories.is_imported` | Deja de ser una constante |
| `category === "tote"` (subtítulo) | `categories.has_variant` | Deja de ser un `if` por clave |
| `category === "tote"` (recargo) | `free_initials` + `extra_initials_price` | Idem |
| `category === "makeup-bag"` (plateado) | `categories.initials_palette` | Idem. Hecho en 014: hasta entonces la columna existía y el front la ignoraba. |
| `INITIALS_COLORS` (constante) | `initials_colors` | **Nuevo en 014.** Viaja en `catalog.initialsColors`. |

La recomendación es adaptar en el borde: una función que traiga de Supabase y
devuelva exactamente la forma que los componentes ya consumen. Así `CatalogExplorer`,
`ProductView` y `search-utils` no se tocan en este paso.

```js
// src/lib/catalog.js — reemplaza a mock-catalog.js
const BASE = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY  = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const BUCKET = import.meta.env.PUBLIC_SUPABASE_STORAGE_BUCKET;
const PLACEHOLDER = "/assets/img/placeholder.svg";

const photoUrl = (p) => `${BASE}/storage/v1/object/public/${BUCKET}/${p}`;

async function q(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: { apikey: KEY } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function loadCatalog() {
  const [cats, prods, initialsColors] = await Promise.all([
    q("categories?select=key,label,default_price,personalizable,max_initials,has_variant,position,is_imported,free_initials,extra_initials_price,initials_palette&order=position"),
    q("products?select=id,category_key,name,color,variant,hex,price,personalizable,max_initials,group_key,sort_order,product_photos(storage_path,position)&order=sort_order"),
    q("initials_colors?select=name,hex,position&order=position,name"),
  ]);

  const products = prods.map((p) => {
    const gallery = (p.product_photos ?? [])
      .sort((a, b) => a.position - b.position)
      .map((ph) => photoUrl(ph.storage_path));
    return {
      id: p.id,
      category: p.category_key,       // los componentes ya usan `category`
      name: p.name,
      color: p.color,
      variant: p.variant ?? undefined,
      hex: p.hex ?? undefined,
      price: p.price,
      personalizable: p.personalizable,
      maxInitials: p.max_initials,
      groupKey: p.group_key,
      sortOrder: p.sort_order,
      gallery,
      img: gallery[0] ?? PLACEHOLDER,  // compatibilidad con el código actual
    };
  });

  return {
    products,
    categories: cats,
    initialsColors,
    CATEGORY_LABELS: Object.fromEntries(cats.map((c) => [c.key, c.label])),
    CATS: [{ key: null, label: "Todos" }, ...cats.map((c) => ({ key: c.key, label: c.label }))],
  };
}
```

Con esto, el único cambio en los componentes es que `CATALOG_MOCK` deja de ser una
constante importada y pasa a ser un prop o un valor de contexto.

---

## 6. Las reglas por categoría — RESUELTO en `008_category_rules.sql`

El front tiene cinco reglas de negocio escritas como `if` contra una clave de
categoría literal. El catálogo arranca vacío y el dueño crea cada categoría desde el
panel, así que **una categoría que el front nunca vio es el caso normal, no la
excepción**. Una categoría importada nueva se quedaría sin su aviso de demora: sin
error, sin log, nada — hasta que un cliente pregunte tres semanas después dónde está
su pedido.

Las cinco pasaron a ser datos.

| Dónde estaba | Regla | Ahora se lee de |
|---|---|---|
| `ProductView.jsx` | Subtítulo = variante en vez del label | `categories.has_variant` |
| `ProductView.jsx` | Recargo desde la 4ª inicial | `free_initials` + `extra_initials_price` |
| `ProductView.jsx` | Etiqueta distinta del campo de iniciales | `categories.max_initials` |
| `ProductView.jsx` | Aviso "importado, 15-20 días" | `categories.is_imported` |
| `initials.js` | Solo se borda en plateado | `categories.initials_palette` |

`has_variant` y `max_initials` ya existían en el esquema desde el principio;
`has_variant` no la usaba nadie. Las otras tres son nuevas.

### Cómo queda el cálculo del recargo

```js
const extra = initials.length > category.free_initials
  ? category.extra_initials_price
  : 0;
```

Con `free_initials = 3` y `extra_initials_price = 10000` en tote, esto da idéntico al
`category === "tote" && count > 3` de hoy. Verificado contra Postgres: 0-3 iniciales
→ sin recargo, 4-5 → 10 000. Toda categoría con los valores por defecto (`0` y `0`)
nunca cobra recargo, que es lo que hacen hoy las cinco categorías restantes.

### Cómo queda la paleta de iniciales

```js
const palette = category.initials_palette.length
  ? INITIALS_COLORS.filter(c => category.initials_palette.includes(c.name))
  : INITIALS_COLORS;
```

Array vacío significa "todos los colores". Para makeup-bag va `{Plateado}`.

**Decisión deliberada:** los valores hexadecimales siguen en la constante
`INITIALS_COLORS` del front. Esa lista es la paleta de la marca, no una regla por
categoría — no cambia cuando el dueño agrega una categoría, así que no era parte del
problema. `initials_palette` guarda **nombres**, y el front los resuelve contra esa
constante.

### Restricciones que la base hace cumplir

```sql
check (free_initials >= 0 and free_initials <= max_initials)
check (extra_initials_price >= 0)
```

La primera atrapa una configuración que fallaría en silencio: si `free_initials`
supera a `max_initials`, el recargo no se puede alcanzar nunca y el precio queda mal
sin que nadie vea un error. Ambas probadas: rechazan con
`categories_free_initials_range` y `categories_extra_price_nonneg`.

### Valores para las seis categorías reales

```sql
update public.categories set free_initials = 3, extra_initials_price = 10000,
                             has_variant = true
  where key = 'tote';
update public.categories set is_imported = true, initials_palette = '{Plateado}'
  where key = 'makeup-bag';
-- tote-luxury, lumiere, neceser y cosmetiquera se quedan con los valores por defecto.
```

---

## 6b. Lo que sigue sin resolver

### GAP 3 — `PRICE_SHIP` está hardcodeado

`pricing.js` fija el envío en `10000`. Cambiarlo hoy exige un deploy. Si el dueño
quiere tocarlo desde el panel, necesita una tabla de configuración. Si no, se deja
como está — pero que sea una decisión, no un olvido.

### GAP 4 — el carrito confía en el precio guardado

`cart-store.js` guarda `price` dentro de `localStorage`. Ese valor sobrevive entre
sesiones: si el precio del producto cambia, el carrito viejo sigue mostrando y
totalizando el precio anterior. Y es editable a mano desde el inspector.

El patrón correcto es guardar en `localStorage` solo el `productId`, la cantidad y lo
que el cliente configuró (iniciales, color), y resolver nombre, foto y **precio**
contra el catálogo recién cargado. Como mínimo, revalidar el precio al abrir el
checkout y avisar si cambió.

---

## 7. La escritura (panel de administración)

El front público no escribe nada. Esto es para cuando se rehaga el panel.

- El panel escribe **solo** en `products_draft`, `product_photos_draft` y
  `categories`, autenticado como admin. Nunca en `products` ni `product_photos`.
- `products` y `product_photos` **no tienen política de escritura para nadie**. La
  única forma de modificarlas es la función `publish_catalog()`.
- Las fotos se reemplazan con `POST /rest/v1/rpc/replace_product_photos_draft`
  `{ p_product_id, p_storage_paths[] }` — el array entero de una vez, en una
  transacción. Borrar y volver a insertar por separado deja el producto sin fotos si
  algo falla en el medio.
- Publicar es `POST /rest/v1/rpc/publish_catalog`. Copia draft → publicado entero, en
  una transacción, y devuelve `removed_paths` con las imágenes que quedaron huérfanas
  para que el cliente las borre de Storage.
- `publish_catalog()` **se niega a publicar un borrador vacío sobre un catálogo con
  productos** (error `P0001`). Es una guarda deliberada: este catálogo no tiene semilla
  ni respaldo, así que un borrador vacío publicado destruiría todo sin vuelta atrás.
  Para vaciar el catálogo a propósito hay que poner `is_active = false` en cada fila
  del borrador y publicar eso.

### El panel se construye de cero en esta rama

No hay panel que migrar. El sitio anterior se eliminó en el commit `e242e17`, así que
el panel de administración se escribe nuevo en Astro/React, sobre los endpoints de
§7 y `docs/api-endpoints.md`.

Lo que tiene que saber hacer, porque el catálogo arranca vacío y no hay otra vía:

- **Crear y editar categorías.** Es lo primero: sin una categoría no se puede crear
  ningún producto (`products_draft.category_key` es foreign key).
- **Crear y editar productos**, siempre contra `products_draft`.
- **Subir imágenes** a `product-images` y asociarlas con
  `replace_product_photos_draft`. Ver §4 de `docs/api-endpoints.md` — el formato del
  path tiene una restricción que Storage no valida pero la base sí.
- **Publicar**, y después borrar de Storage lo que `publish_catalog()` devuelve en
  `removed_paths`.

Mientras el panel no exista, las categorías y los productos se cargan por el Table
Editor del dashboard de Supabase.

---

## 8. Estado verificado del backend (2026-07-30)

| Comprobación | Resultado |
|---|---|
| Tablas con RLS activo | 7 de 7 |
| Políticas | 17 |
| Buckets de Storage | 2, ambos públicos en lectura |
| Políticas de Storage | 5 |
| Primera publicación | `publication_id: 1` |
| `GET products` como anon | `200`, con datos |
| `GET products_draft` como anon | `401 / 42501` |
| `GET publications` como anon | `401` |

Cada una de estas se puede reproducir con `curl` y la `anon key`. Las dos que más
importan son las negativas: si `products_draft` o `publications` devuelven datos alguna
vez, es un incidente, no una curiosidad.

```
curl "$SUPABASE_URL/rest/v1/products?select=id,name,price" -H "apikey: $ANON_KEY"
curl "$SUPABASE_URL/rest/v1/products_draft?select=id"      -H "apikey: $ANON_KEY"
```
