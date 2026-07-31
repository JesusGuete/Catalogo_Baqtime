# Referencia de endpoints — Supabase

Proyecto: `kqbtdrglohazcrbogdzp` · región `us-east-1`
Base: `https://kqbtdrglohazcrbogdzp.supabase.co`

No hay servidor propio. Supabase expone tres APIs REST y son las únicas que existen:

| API | Prefijo | Para qué |
|---|---|---|
| PostgREST | `/rest/v1` | Tablas y funciones |
| GoTrue | `/auth/v1` | Login del panel |
| Storage | `/storage/v1` | Imágenes |

## Estado de verificación

Este documento distingue lo comprobado de lo documentado. Importa, porque en este
proyecto ya nos pasó de dar por cerrado algo que no lo estaba.

- **✅ verificado** — ejecutado contra el proyecto real el 2026-07-30, respuesta copiada.
- **📄 según spec** — comportamiento estándar de Supabase, no ejecutado todavía aquí.
  Se marca así en vez de presentarlo como hecho.

---

## 0. Las dos credenciales

```
apikey: <anon key>                       ← pública, va en el sitio
Authorization: Bearer <access_token>     ← JWT del admin logueado, solo en el panel
```

Toda petición lleva `apikey`. Las que escriben llevan **además** el `Authorization`
con el token del admin.

Sin `Authorization`, Supabase te trata como `anon`. Con él, como `authenticated`, y ahí
recién `is_admin()` puede devolver `true`.

La `service_role key` no aparece en ninguno de estos flujos. No va al navegador nunca.

---

# 1. Auth — `/auth/v1`

## 1.1 Login · `POST /auth/v1/token?grant_type=password`

```http
POST /auth/v1/token?grant_type=password
apikey: <anon key>
Content-Type: application/json

{ "email": "baqtime@gmail.com", "password": "..." }
```

**200** 📄

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1753900000,
  "refresh_token": "xxxxxxxxxxxx",
  "user": {
    "id": "d96c740b-07f5-43df-b609-366de4f0c777",
    "email": "baqtime@gmail.com",
    "role": "authenticated",
    "created_at": "2026-07-29T..."
  }
}
```

**400** — credenciales inválidas

```json
{ "error": "invalid_grant", "error_description": "Invalid login credentials" }
```

El `access_token` dura **1 hora**. Guardarlo en memoria, no en `localStorage`: un XSS
que lo lea escribe en el catálogo con permisos de admin.

## 1.2 Renovar · `POST /auth/v1/token?grant_type=refresh_token`

```json
{ "refresh_token": "xxxxxxxxxxxx" }
```

Devuelve la misma forma que 1.1. 📄

## 1.3 Cerrar sesión · `POST /auth/v1/logout`

Con `Authorization: Bearer <token>`. Devuelve **204** sin cuerpo. 📄

## 1.4 Registro · **CERRADO**  ✅

```http
POST /auth/v1/signup
```

**422** ✅ *(verificado 2026-07-29 con payload válido, no vacío)*

```json
{ "code": 422, "msg": "Signups not allowed for this instance",
  "error_code": "signup_disabled" }
```

Los admins se crean **solo** desde el dashboard (Authentication → Add user) y después
se insertan en `public.admins`. No hay camino de autoservicio, a propósito: si alguien
pudiera registrarse solo, tendría un JWT `authenticated` válido y quedaría a un paso
de las tablas de escritura.

---

# 2. Lectura pública — solo `apikey`

## 2.1 Categorías · `GET /rest/v1/categories`

```http
GET /rest/v1/categories?select=key,label,default_price,personalizable,max_initials,has_variant,position,is_imported,free_initials,extra_initials_price,initials_palette&order=position
apikey: <anon key>
```

**200** ✅ *(la fila es real; las cuatro últimas columnas se agregaron en
`008_category_rules.sql` y aquí se muestran con sus valores por defecto)*

```json
[{ "key": "tote", "label": "Tote Bag", "default_price": 85000,
   "personalizable": true, "max_initials": 3, "has_variant": false, "position": 1,
   "is_imported": false, "free_initials": 0, "extra_initials_price": 0,
   "initials_palette": [] }]
```

Las cuatro últimas sacan del código las reglas que hoy están escritas como `if` contra
una clave de categoría. Ver §6 de `docs/frontend-contract.md`.

## 2.2 Catálogo con fotos, en una sola petición · `GET /rest/v1/products`

PostgREST detecta la foreign key `product_photos.product_id → products.id`, así que
las fotos vienen embebidas.

```http
GET /rest/v1/products?select=id,category_key,name,color,variant,hex,price,personalizable,max_initials,group_key,sort_order,product_photos(storage_path,position.order(position))&order=sort_order
apikey: <anon key>
```

**200** ✅ *(la fila es real; el array `product_photos` está vacío porque todavía no hay fotos cargadas)*

```json
[{
  "id": "t1", "category_key": "tote", "name": "Tote Bag Negra",
  "color": "Negro", "variant": null, "hex": "#000000", "price": 85000,
  "personalizable": true, "max_initials": 3, "group_key": "tote-negra",
  "sort_order": 1,
  "product_photos": [
    { "storage_path": "tote/1753900000000.webp", "position": 0 }
  ]
}]
```

Solo devuelve filas con `is_active = true`. Lo filtra RLS en el servidor: el front no
puede ver las inactivas ni pidiéndolas explícitamente.

## 2.3 Fotos sueltas · `GET /rest/v1/product_photos`

```http
GET /rest/v1/product_photos?select=product_id,storage_path,position&order=position
```

**200** ✅ — array. Rara vez hace falta: 2.2 ya las trae.

## 2.4 Lo que está cerrado a `anon`  ✅

```http
GET /rest/v1/products_draft?select=id
```

**401** ✅

```json
{ "code": "42501", "details": null,
  "hint": "Grant the required privileges to the current role with: GRANT SELECT ON public.products_draft TO anon;",
  "message": "permission denied for table products_draft" }
```

Igual para `product_photos_draft` y `publications` ✅.

Fijate en el código: `42501` es *permiso denegado sobre la tabla*, no *la política te
rechazó*. `anon` no tiene grant, así que Postgres frena una capa antes de que RLS
llegue a evaluarse. Dos candados independientes.

---

# 3. Escritura — requiere JWT de admin

Todas llevan `apikey` **y** `Authorization: Bearer <access_token>`.

Por defecto PostgREST devuelve **201 con cuerpo vacío**. Para recibir la fila creada
hay que pedirlo:

```http
Prefer: return=representation
```

Sin esa cabecera, `data` viene `null` aunque la operación haya salido bien. Es una
fuente clásica de "creí que había fallado".

## 3.1 Crear categoría · `POST /rest/v1/categories`

```http
POST /rest/v1/categories
Prefer: return=representation

{ "key": "neceser", "label": "Neceser", "default_price": 60000,
  "personalizable": true, "max_initials": 2, "has_variant": false, "position": 2 }
```

**201** 📄 — la fila creada, dentro de un array.

**409** — `position` repetida (tiene UNIQUE no diferible)

```json
{ "code": "23505", "message": "duplicate key value violates unique constraint \"categories_position_key\"" }
```

**403** — el JWT no es de un admin

```json
{ "code": "42501", "message": "new row violates row-level security policy for table \"categories\"" }
```

## 3.2 Editar categoría · `PATCH /rest/v1/categories?key=eq.neceser`

Cuerpo con solo los campos a cambiar. **200** con la fila si se pide
`return=representation`. 📄

## 3.3 Borrar categoría · `DELETE /rest/v1/categories?key=eq.neceser`

**204** sin cuerpo. 📄

**409** si hay productos colgando de ella:

```json
{ "code": "23503", "message": "update or delete on table \"categories\" violates foreign key constraint" }
```

Es deliberado: no se puede borrar una categoría con productos. Primero se mueven o se
borran los productos.

## 3.4 Crear producto · `POST /rest/v1/products_draft`

**Siempre `products_draft`. Nunca `products`.** `products` no tiene política de
escritura para nadie; la única forma de tocarla es `publish_catalog()`.

```http
POST /rest/v1/products_draft
Prefer: return=representation

{ "id": "custom_1753900000000", "category_key": "tote",
  "name": "Tote Bag Negra", "color": "Negro", "variant": null,
  "hex": "#1A1A1A", "price": 130000, "personalizable": true,
  "max_initials": 7, "group_key": "Negro", "origin": "custom",
  "is_active": true, "sort_order": 12 }
```

**201** 📄 — la fila creada.

Errores que la base te va a devolver, y son correctos:

| Código | Causa |
|---|---|
| `23514` | `hex` no cumple `^#[0-9A-Fa-f]{6}$` — `#000` no sirve, van los 6 dígitos |
| `23514` | `price` negativo, o `name` en blanco |
| `23514` | `origin` distinto de `factory` o `custom` |
| `23503` | `category_key` no existe en `categories` |
| `23505` | `(category_key, sort_order)` repetido |
| `42501` | el JWT no es de un admin |

## 3.5 Editar producto · `PATCH /rest/v1/products_draft?id=eq.t1`

**200** con la fila. `updated_at` se actualiza solo por trigger. 📄

## 3.6 Borrar producto

Dos caminos, y no son equivalentes:

**Borrado suave (el que usa el panel):**

```http
PATCH /rest/v1/products_draft?id=eq.t1
{ "is_active": false }
```

El producto desaparece del sitio pero la fila sigue existiendo. Esto importa: la
guarda de `publish_catalog()` cuenta filas, no filas activas. Un catálogo "vaciado"
con borrado suave sigue teniendo filas y publica sin problema.

**Borrado duro:**

```http
DELETE /rest/v1/products_draft?id=eq.t1
```

**204**. Arrastra sus fotos de `product_photos_draft` por `ON DELETE CASCADE`. Los
archivos en Storage **no** se borran acá — eso lo resuelve `publish_catalog()`
devolviendo `removed_paths`.

## 3.7 Reemplazar las fotos de un producto · `POST /rest/v1/rpc/replace_product_photos_draft`

```http
POST /rest/v1/rpc/replace_product_photos_draft
Authorization: Bearer <access_token>

{ "p_product_id": "t1",
  "p_storage_paths": ["tote/1753900000000.webp", "tote/1753900000001.webp"] }
```

**200** 📄 — un entero: cuántas fotos quedaron.

```json
2
```

**El array entero, siempre.** Agregar, quitar y reordenar son la misma operación: se
manda la lista completa en el orden final. La posición sale del orden del array
(índice 0 = foto principal).

Es una RPC y no dos llamadas REST por una razón concreta: `DELETE` seguido de `POST`
son dos transacciones. Si la segunda falla, el producto se queda **sin ninguna foto**.
Acá es una sola transacción: o quedan las nuevas, o quedan las viejas.

Errores:

| Código | Causa |
|---|---|
| `42501` | el JWT no es de un admin |
| `23503` | `p_product_id` no existe en `products_draft` |
| `23514` | algún `storage_path` no cumple el formato — **ver §4.3** |

## 3.8 Publicar · `POST /rest/v1/rpc/publish_catalog`

```http
POST /rest/v1/rpc/publish_catalog
Authorization: Bearer <access_token>
```

Sin cuerpo.

**200** ✅ *(ejecutado el 2026-07-31 desde el panel, por RPC)*

> Hasta el 2026-07-31 esta respuesta figuraba como verificada porque se había ejecutado
> desde el **SQL Editor**, simulando el JWT con `set local request.jwt.claims`. Eso no es
> lo mismo que llamar al endpoint: la sesión de PostgREST carga `pg_safeupdate` y la del
> SQL Editor no. La primera llamada real falló con `21000` porque la función tenía dos
> `delete` sin `where`. Un ✅ sobre un camino que nadie recorrió no vale — si la prueba
> es en el SQL Editor, va 📄.

```json
[{ "publication_id": 1, "product_count": 1, "photo_count": 0, "removed_paths": [] }]
```

Copia `products_draft` → `products` y `product_photos_draft` → `product_photos`,
entero, en una transacción. O pasa todo o no pasa nada.

`removed_paths` trae las imágenes que ya no referencia **ni lo publicado ni el
borrador**. Esas son las que el panel debe borrar de Storage después (§4.4). Si no
las borra, quedan ocupando cuota; no rompen nada.

Errores:

| Código | Significado |
|---|---|
| `42501` | `publish_catalog: caller is not an admin` |
| `55P03` | `another publish is in progress` — otro admin está publicando, reintentar |
| `P0001` | **la guarda de catálogo vacío** — ver abajo |

**Sobre `P0001`.** La función se niega a publicar si `products_draft` está vacío y
`products` tiene filas. No es un bug, es una guarda: este catálogo no tiene semilla ni
respaldo, así que publicar un borrador vacío borraría todo sin vuelta atrás. Ya nos
pasó una vez en pruebas — 30 productos a cero.

Para vaciar el catálogo a propósito: poner `is_active = false` en **todas** las filas
del borrador y publicar eso. Las filas siguen existiendo, la guarda no se dispara, y
el sitio queda vacío.

**Nota para probar desde el SQL Editor.** Ahí no hay JWT, así que `auth.uid()` da
`null` y la función te rechaza aunque seas el dueño. Hay que simularlo:

```sql
begin;
set local request.jwt.claims =
  '{"sub":"d96c740b-07f5-43df-b609-366de4f0c777","role":"authenticated"}';
select * from public.publish_catalog();
commit;
```

## 3.9 Lecturas del panel

Con JWT de admin, `GET /rest/v1/products_draft`, `product_photos_draft` y
`publications` devuelven **200** con datos. Son las mismas URLs que a `anon` le dan
401 — cambia quién pregunta, no la dirección. 📄

---

# 4. Storage — las imágenes

Este es el bloque que preguntaste.

**Sube el panel, no el sitio público.** La política `product_images_insert` exige
`is_admin()`. Con la `anon key` sola, la subida devuelve 403.

## 4.1 Subir · `POST /storage/v1/object/product-images/{path}`

```http
POST /storage/v1/object/product-images/tote/1753900000000.webp
apikey: <anon key>
Authorization: Bearer <access_token>
Content-Type: image/webp

<bytes del archivo>
```

**200** 📄

```json
{ "Id": "8f3e...", "Key": "product-images/tote/1753900000000.webp" }
```

Con el SDK:

```js
const { data, error } = await supabase.storage
  .from('product-images')
  .upload(`${categoryKey}/${Date.now()}.webp`, blob, {
    contentType: 'image/webp',
    upsert: false,
  });
```

Errores:

| Código | Cuerpo | Causa |
|---|---|---|
| **403** | `{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}` | Sin JWT, o el JWT no es de admin |
| **409** | `{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}` | Ya existe ese path y `upsert` es `false` |
| **413** | `{"statusCode":"413","error":"Payload too large"}` | Más de **5 MB** |
| **415** | tipo no permitido | Solo `image/webp`, `image/jpeg`, `image/png` |

Los límites salen de `005_buckets.sql` y son los mismos que tenían las reglas de
Firebase: 5 MB y solo imágenes.

## 4.2 Reemplazar · `PUT /storage/v1/object/product-images/{path}`

Igual que 4.1 pero sobreescribe. Equivale a `POST` con `x-upsert: true`. **200** con la
misma forma. 📄

## 4.3 ⚠️ El formato del path — la trampa

La columna `product_photos.storage_path` tiene esta restricción:

```
^[A-Za-z0-9_-]+/[0-9]+\.(webp|jpg|jpeg|png)$
```

En castellano: **una carpeta, una barra, un número, punto, extensión.**

```
✅ tote/1753900000000.webp
✅ makeup-bag/1753900000001.jpg
❌ productos/2026/01/foto.webp     dos barras
❌ tote/foto-principal.webp        el nombre no es numérico
❌ tote/1753900000000.gif          extensión no permitida
❌ Tote Bags/1753900000000.webp    espacio en la carpeta
```

Y acá está lo que hay que entender bien: **Storage y la base de datos son dos sistemas
separados.** Storage acepta cualquier ruta que le mandes. La restricción vive en la
tabla. Entonces esto pasa:

1. Subís a `productos/2026/01/foto.webp` → Storage responde **200**. Todo bien.
2. Llamás a `replace_product_photos_draft` con esa ruta → **`23514`, check constraint**.
3. El archivo quedó en Storage, huérfano, sin ninguna fila que lo referencie.

**Que la subida haya salido 200 no significa que la ruta sirva.** Validá el formato
antes de subir, o vas a ir dejando basura.

La convención que usa el panel actual: `<category_key>/<Date.now()>.webp`.

## 4.4 Borrar

Uno solo:

```http
DELETE /storage/v1/object/product-images/tote/1753900000000.webp
Authorization: Bearer <access_token>
```

**200** 📄 — `{ "message": "Successfully deleted" }`

Varios de una (así se consume `removed_paths`):

```http
DELETE /storage/v1/object/product-images
Content-Type: application/json

{ "prefixes": ["tote/1753900000000.webp", "tote/1753900000001.webp"] }
```

**200** con el array de objetos borrados. 📄

## 4.5 Leer — público, sin credenciales

```
GET /storage/v1/object/public/product-images/{storage_path}
```

Sin `apikey`, sin token. Es la URL que va directo en el `src` de un `<img>`.

```js
const url = `${SUPABASE_URL}/storage/v1/object/public/product-images/${storage_path}`;
```

**404** si el archivo no existe. Vale la pena manejarlo: una fila de
`product_photos` puede apuntar a un archivo borrado a mano desde el dashboard.

## 4.6 El bucket `site-images` — solo lectura para todos

```
GET /storage/v1/object/public/site-images/{path}     ✅ 200, público
POST /storage/v1/object/site-images/{path}           ❌ 403, SIEMPRE
DELETE /storage/v1/object/site-images/{path}         ❌ 403, SIEMPRE
```

**No hay política de escritura para ningún rol, admins incluidos.** Las imágenes del
sitio (hero, logo, carrusel) se suben a mano por el dashboard y desde ahí son
inmutables vía API.

Es a propósito, y la razón es concreta: la rutina que limpia imágenes huérfanas de
productos **no puede** tocar las del sitio. No porque una regla se lo prohíba — porque
no tiene permiso en ese bucket. Un bug en esa rutina no puede borrarte el logo.

---

# 5. Flujo completo — agregar un producto con fotos

Así se encadena todo, en orden:

```
1. POST /auth/v1/token?grant_type=password
   → access_token

2. POST /storage/v1/object/product-images/tote/1753900000000.webp
   POST /storage/v1/object/product-images/tote/1753900000001.webp
   → los archivos quedan en Storage, todavía sin referencia

3. POST /rest/v1/products_draft
   { id, category_key, name, price, ... }
   → la fila existe en el borrador

4. POST /rest/v1/rpc/replace_product_photos_draft
   { p_product_id, p_storage_paths: [ruta1, ruta2] }
   → las fotos quedan asociadas, en orden

5. (repetir 2-4 por cada producto)

6. POST /rest/v1/rpc/publish_catalog
   → borrador copiado a publicado. Devuelve removed_paths.

7. DELETE /storage/v1/object/product-images
   { prefixes: removed_paths }
   → se limpian las imágenes que ya no referencia nadie
```

**El orden importa.** Storage primero, base después: si la fila se crea antes que el
archivo, el sitio queda mostrando un 404 en la ventana entre las dos llamadas.

**El paso 7 es del cliente.** `publish_catalog()` te dice qué borrar pero no lo borra
— una función de Postgres no puede hablar con la API de Storage. Si el panel se cierra
entre el 6 y el 7, esos archivos quedan huérfanos: ocupan cuota, no rompen nada, y se
pueden barrer después comparando Storage contra `product_photos`.

---

# 6. Tabla resumen

| Método | Endpoint | Auth | Uso |
|---|---|---|---|
| `POST` | `/auth/v1/token?grant_type=password` | apikey | Login |
| `POST` | `/auth/v1/token?grant_type=refresh_token` | apikey | Renovar |
| `POST` | `/auth/v1/logout` | + JWT | Salir |
| `POST` | `/auth/v1/signup` | — | **cerrado, 422** |
| `GET` | `/rest/v1/categories` | apikey | Categorías |
| `GET` | `/rest/v1/products` | apikey | Catálogo (+fotos embebidas) |
| `GET` | `/rest/v1/product_photos` | apikey | Fotos sueltas |
| `GET` | `/rest/v1/products_draft` | + JWT admin | Borrador |
| `GET` | `/rest/v1/publications` | + JWT admin | Historial |
| `POST` `PATCH` `DELETE` | `/rest/v1/categories` | + JWT admin | ABM categorías |
| `POST` `PATCH` `DELETE` | `/rest/v1/products_draft` | + JWT admin | ABM productos |
| `POST` | `/rest/v1/rpc/replace_product_photos_draft` | + JWT admin | Fotos de un producto |
| `POST` | `/rest/v1/rpc/publish_catalog` | + JWT admin | Publicar |
| `POST` `PUT` | `/storage/v1/object/product-images/{path}` | + JWT admin | **Subir imagen** |
| `DELETE` | `/storage/v1/object/product-images` | + JWT admin | Borrar imágenes |
| `GET` | `/storage/v1/object/public/{bucket}/{path}` | — | Ver imagen |

---

# 7. Códigos de error

| Código | Origen | Significado |
|---|---|---|
| `42501` | Postgres | Sin permiso. Sin grant, o RLS lo rechazó, o `is_admin()` dio false |
| `23503` | Postgres | Foreign key: apunta a algo que no existe |
| `23505` | Postgres | Unique: ya existe esa combinación |
| `23514` | Postgres | Check: `hex`, `price`, `origin` o `storage_path` mal formados |
| `55P03` | Postgres | Otro publish en curso, reintentar |
| `P0001` | `publish_catalog` | Guarda de catálogo vacío |
| `PGRST116` | PostgREST | Se pidió una fila con `.single()` y vinieron 0 o >1 |
| `PGRST205` | PostgREST | La tabla no existe en el esquema expuesto |
| `403` | Storage | Sin permiso en el bucket |
| `409` | Storage | El archivo ya existe y `upsert` es false |
| `413` | Storage | Más de 5 MB |
