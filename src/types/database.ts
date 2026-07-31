// Tipos derivados del esquema real, no inventados.
//
// Cada tipo de acá se corresponde línea por línea con supabase/sql/001_schema.sql y
// supabase/sql/008_category_rules.sql. Si alguien cambia una columna en el SQL y no
// la cambia acá, el compilador no se va a enterar — por eso cada bloque cita el
// archivo y las líneas de donde sale. Es la única forma honesta de mantenerlos
// sincronizados sin el CLI de Supabase conectado.
//
// Convención de nombres: las columnas quedan en snake_case, igual que en Postgres.
// Traducir a camelCase acá abriría la puerta a errores de tipeo silenciosos en cada
// petición, que es exactamente lo que estos tipos existen para evitar. El mapeo a
// camelCase pasa en el borde, cuando los datos salen hacia la tienda pública
// (src/lib/catalog.js).

/** ISO 8601 con zona — lo que devuelve `timestamptz` sobre PostgREST. */
export type Timestamptz = string;

/** `origin` tiene un CHECK que solo admite estos dos valores (001_schema.sql:56). */
export type ProductOrigin = "factory" | "custom";

// ============================================================================
// categories — 001_schema.sql:34-43 + 008_category_rules.sql:34-38
// ============================================================================

export interface Category {
  /** PK. `tote`, `neceser`, `makeup-bag`… Es la clave que referencian los productos. */
  key: string;
  label: string;
  /** Pesos enteros. CHECK >= 0. */
  default_price: number;
  personalizable: boolean;
  /** smallint. CHECK >= 0. */
  max_initials: number;
  /** `true` → el subtítulo de la tarjeta muestra `variant`, no el label. */
  has_variant: boolean;
  /** smallint UNIQUE (no diferible). Orden de las pestañas en la tienda. */
  position: number;
  /** `true` → mostrar el aviso de entrega en 15-20 días. */
  is_imported: boolean;
  /** Iniciales cubiertas por el precio base. CHECK: 0 <= free_initials <= max_initials. */
  free_initials: number;
  /** Recargo único cuando la cantidad de iniciales supera `free_initials`. CHECK >= 0. */
  extra_initials_price: number;
  /** Nombres de colores de bordado permitidos. Array vacío = todos. */
  initials_palette: string[];
}

/** Lo que se manda al crear. `key` es obligatoria y después no se puede cambiar. */
export type CategoryInsert = Category;

/** Lo que se manda al editar: cualquier subconjunto menos la PK. */
export type CategoryUpdate = Partial<Omit<Category, "key">>;

// ============================================================================
// products / products_draft — 001_schema.sql:45-63
// products_draft se crea con LIKE products INCLUDING CONSTRAINTS (línea 91-93),
// así que comparten forma y restricciones exactamente.
// ============================================================================

export interface Product {
  /** PK. `t1`, `n3`, `custom_<epoch_ms>`. */
  id: string;
  /** FK → categories.key */
  category_key: string;
  /** CHECK: length(btrim(name)) > 0 — no puede ser solo espacios. */
  name: string;
  color: string;
  /** Ej. "Cordones Negros". Nulo en la mayoría. */
  variant: string | null;
  /** CHECK: ^#[0-9A-Fa-f]{6}$ — los 6 dígitos, `#000` no sirve. */
  hex: string | null;
  /** Pesos enteros. CHECK >= 0. Nunca decimales. */
  price: number;
  personalizable: boolean;
  /** smallint. CHECK >= 0. */
  max_initials: number;
  /** Agrupa variantes del mismo modelo. Alimenta el filtro y los relacionados. */
  group_key: string;
  origin: ProductOrigin;
  /** `false` = oculto del sitio, pero la fila sigue existiendo (borrado suave). */
  is_active: boolean;
  /** UNIQUE junto con category_key. Diferible en products_draft. */
  sort_order: number;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

/**
 * Lo que se manda al crear un producto. `created_at` y `updated_at` los pone la base
 * (default + trigger set_updated_at), así que no se mandan nunca.
 */
export type ProductInsert = Omit<Product, "created_at" | "updated_at">;

/** Lo que se manda al editar. `id` no se toca. */
export type ProductUpdate = Partial<Omit<ProductInsert, "id">>;

// ============================================================================
// product_photos / product_photos_draft — 001_schema.sql:66-74
// ============================================================================

export interface ProductPhoto {
  id: number;
  /** FK → products.id (o products_draft.id), ON DELETE CASCADE. */
  product_id: string;
  /** CHECK: ^[A-Za-z0-9_-]+/[0-9]+\.(webp|jpg|jpeg|png)$ — ver storage.ts */
  storage_path: string;
  /** smallint. CHECK >= 0. `0` = foto principal. UNIQUE (product_id, position). */
  position: number;
  created_at: Timestamptz;
}

/** Lo mínimo que necesita el panel de una foto: la ruta y el orden. */
export type PhotoRef = Pick<ProductPhoto, "storage_path" | "position">;

// ============================================================================
// publications — 001_schema.sql:76-84
// ============================================================================

export interface Publication {
  id: number;
  published_by: string;
  published_by_email: string | null;
  published_at: Timestamptz;
  product_count: number;
  photo_count: number;
  removed_paths: string[];
}

// ============================================================================
// Funciones de Postgres — 003_functions.sql
// ============================================================================

/**
 * Lo que devuelve `publish_catalog()`. Ojo: la función declara `returns table`,
 * así que PostgREST devuelve un ARRAY con una fila, no el objeto suelto.
 * 003_functions.sql:24-26
 */
export interface PublishResult {
  publication_id: number;
  product_count: number;
  photo_count: number;
  /** Imágenes que ya no referencia ni lo publicado ni el borrador: hay que borrarlas de Storage. */
  removed_paths: string[];
}

/** Argumentos de `replace_product_photos_draft`. 003_functions.sql:154-156 */
export interface ReplacePhotosArgs {
  p_product_id: string;
  /** El array COMPLETO en el orden final. El índice 0 es la foto principal. */
  p_storage_paths: string[];
}

// ============================================================================
// Formas compuestas que devuelve PostgREST con embed de foreign key
// ============================================================================

/** `products_draft?select=...,product_photos_draft(storage_path,position)` */
export type ProductWithPhotos = Product & {
  product_photos_draft?: PhotoRef[];
  product_photos?: PhotoRef[];
};

// ============================================================================
// Listas de columnas — una sola fuente para los `select=` de PostgREST
// ============================================================================
//
// Están acá y no repartidas por los repositorios porque el mismo select se usa en
// más de un lugar (la lista de productos y el diff de publicación piden lo mismo).
// `satisfies` obliga a que cada nombre exista en el tipo: un typo se ve al compilar,
// no en runtime con una columna que llega `undefined`.

const columnasProducto = [
  "id",
  "category_key",
  "name",
  "color",
  "variant",
  "hex",
  "price",
  "personalizable",
  "max_initials",
  "group_key",
  "origin",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof Product)[];

const columnasCategoria = [
  "key",
  "label",
  "default_price",
  "personalizable",
  "max_initials",
  "has_variant",
  "position",
  "is_imported",
  "free_initials",
  "extra_initials_price",
  "initials_palette",
] as const satisfies readonly (keyof Category)[];

const columnasPublicacion = [
  "id",
  "published_by_email",
  "published_at",
  "product_count",
  "photo_count",
  "removed_paths",
] as const satisfies readonly (keyof Publication)[];

export const SELECT_PRODUCTO = columnasProducto.join(",");
export const SELECT_CATEGORIA = columnasCategoria.join(",");
export const SELECT_PUBLICACION = columnasPublicacion.join(",");
