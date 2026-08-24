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
  /**
   * Texto de la tarjeta en "Nuestras colecciones" (016). Nulo = la categoría no sale
   * en el carrusel de la portada.
   */
  portada_desc: string | null;
  /** URL COMPLETA de la foto de portada (016). Nulo = no sale en el carrusel. */
  portada_img: string | null;
}

/** Lo que se manda al crear. `key` es obligatoria y después no se puede cambiar. */
export type CategoryInsert = Category;

/** Lo que se manda al editar: cualquier subconjunto menos la PK. */
export type CategoryUpdate = Partial<Omit<Category, "key">>;

// ============================================================================
// initials_colors — 014_initials_colors.sql
// ============================================================================

/**
 * Un color de bordado de la paleta de la marca.
 *
 * Hasta 014 esta lista estaba escrita a mano en el código, y en DOS lugares con valores
 * distintos: `src/lib/initials.js` (9 colores, los que pintaba la tienda) y
 * `admin/CategoriesView.tsx` (5 colores, los que ofrecía el panel). Ahora es una tabla
 * que leen los dos.
 */
export interface InitialsColor {
  /** PK. Es el nombre que guardan `categories.initials_palette` y `order_items.initials_color`. */
  name: string;
  /** `#RRGGBB`. CHECK en la base: llega al navegador como `--swatch-color`. */
  hex: string;
  /** smallint. Orden de los círculos en la ficha. NO es único — ver 014. */
  position: number;
}

/** Lo que se manda al crear. El nombre es la PK y después no se puede cambiar. */
export type InitialsColorInsert = InitialsColor;

/** Lo que se manda al editar: el hex y la posición; el nombre, no. */
export type InitialsColorUpdate = Partial<Omit<InitialsColor, "name">>;

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
  /**
   * Colores de bordado de ESTE producto, por nombre (015). Vacío = usar la regla de la
   * categoría, que a su vez vacía significa toda la paleta. Ver `initialsColorsFor`.
   */
  initials_palette: string[];
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
// orders / order_items / order_status_history — 010_orders.sql
// ============================================================================
//
// Los pedidos NO pasan por el ciclo borrador/publicar: no tienen gemela de borrador y
// publish_catalog() no los toca. Un pedido es un hecho desde que el cliente lo confirma.

/**
 * CHECK en orders.status — 010_orders.sql.
 *
 * Seis de estos son el flujo lineal. `no_confirmado` NO es un paso más: es el flujo
 * interrumpido porque el cliente nunca pagó. Por eso va aparte en ORDER_FLOW.
 */
export type OrderStatus =
  | "pendiente_pago"
  | "aprobado"
  | "en_produccion"
  | "listo_para_envio"
  | "enviado"
  | "entregado"
  | "no_confirmado";

/** Los seis pasos del flujo, en orden. Es lo que dibuja la línea de tiempo del cliente. */
export const ORDER_FLOW = [
  "pendiente_pago",
  "aprobado",
  "en_produccion",
  "listo_para_envio",
  "enviado",
  "entregado",
] as const satisfies readonly OrderStatus[];

/** Todos los estados válidos, para el selector del panel y para validar. */
export const ORDER_STATUSES = [
  ...ORDER_FLOW,
  "no_confirmado",
] as const satisfies readonly OrderStatus[];

/** Etiquetas en el idioma del dueño. La base guarda la clave, nunca el texto. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente_pago: "Pendiente de pago",
  aprobado: "Aprobado",
  en_produccion: "En producción",
  listo_para_envio: "Listo para envío",
  enviado: "Enviado",
  entregado: "Entregado",
  no_confirmado: "No confirmado",
};

export interface Order {
  id: string;
  /** `BQ-00001`. Legible y por eso ADIVINABLE: nunca sirve para acceder a nada. */
  order_number: string;
  /**
   * La llave de acceso del cliente (122 bits). Solo la ve el panel y el propio cliente.
   * No se manda al navegador de nadie más — ver get_order_by_token en 010_orders.sql.
   */
  public_token: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  customer_doc: string | null;
  ship_city: string;
  ship_address: string;
  /** Pesos enteros, congelados al confirmar el pedido. */
  subtotal: number;
  shipping_cost: number;
  total: number;
  /** `null` = el pago todavía no se confirmó. */
  paid_at: Timestamptz | null;
  payment_note: string | null;
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: Timestamptz | null;
  /** `date`, no `timestamptz`: es una fecha, no un instante. Manual y opcional. */
  estimated_date: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

/**
 * Lo único que el panel puede editar con un PATCH directo.
 *
 * No es una convención: 010_orders.sql revoca UPDATE sobre el resto de las columnas y
 * solo concede estas cuatro. `status`, `paid_at` y `shipped_at` se mueven exclusivamente
 * por set_order_status() / confirm_order_payment(), que escriben el historial en la misma
 * transacción. Agregar un campo acá sin concederlo en el SQL da un 42501, no un cambio
 * silencioso.
 */
export type OrderUpdate = Partial<
  Pick<Order, "carrier" | "tracking_number" | "estimated_date" | "payment_note">
>;

export interface OrderItem {
  id: number;
  order_id: string;
  /**
   * Sin FK a products a propósito: publish_catalog() borra y reinserta esa tabla entera
   * en cada publicación. Los campos de abajo son una COPIA del momento de la compra.
   */
  product_id: string | null;
  product_name: string;
  category_key: string | null;
  category_label: string | null;
  color: string | null;
  variant: string | null;
  initials: string | null;
  initials_color: string | null;
  unit_price: number;
  extra_price: number;
  /** Hoy siempre 1: el carrito modela una línea por unidad (cart-store.js:10-13). */
  quantity: number;
  line_total: number;
}

export interface OrderStatusHistory {
  id: number;
  order_id: string;
  status: OrderStatus;
  note: string | null;
  /** `null` = lo escribió el sistema (el endpoint de checkout), no una persona. */
  created_by: string | null;
  created_at: Timestamptz;
}

/** Pedido con sus ítems e historial embebidos, como los pide el panel en un solo select. */
export type OrderWithDetail = Order & {
  order_items?: OrderItem[];
  order_status_history?: OrderStatusHistory[];
};

// ============================================================================
// Funciones de Postgres — 003_functions.sql y 010_orders.sql
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

/**
 * Lo que devuelve `get_order_by_token(text)` — 010_orders.sql.
 *
 * Es MENOS que `Order` a propósito, y esa diferencia es la política de privacidad de la
 * página de seguimiento: quien tenga el enlace no ve el documento del cliente, ni la
 * dirección exacta, ni las notas internas de pago. La lista blanca vive en el SQL de la
 * función; este tipo solo la refleja. Si alguien agrega un campo acá y no allá, llega
 * `undefined` — nunca al revés, que es el error que importa evitar.
 *
 * La función devuelve `null` (no error) cuando el token no existe, para que la página
 * pueda responder 404 sin distinguir "nunca existió" de "se borró".
 */
export interface OrderPublic {
  order_number: string;
  status: OrderStatus;
  created_at: Timestamptz;
  estimated_date: string | null;
  carrier: string | null;
  tracking_number: string | null;
  shipped_at: Timestamptz | null;
  customer_name: string;
  ship_city: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  items: OrderPublicItem[];
  history: OrderPublicHistory[];
}

export interface OrderPublicItem {
  product_name: string;
  category_label: string | null;
  color: string | null;
  variant: string | null;
  initials: string | null;
  initials_color: string | null;
  quantity: number;
  line_total: number;
}

export interface OrderPublicHistory {
  status: OrderStatus;
  note: string | null;
  created_at: Timestamptz;
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
  "initials_palette",
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
  "portada_desc",
  "portada_img",
] as const satisfies readonly (keyof Category)[];

const columnasColorIniciales = [
  "name",
  "hex",
  "position",
] as const satisfies readonly (keyof InitialsColor)[];

const columnasPublicacion = [
  "id",
  "published_by_email",
  "published_at",
  "product_count",
  "photo_count",
  "removed_paths",
] as const satisfies readonly (keyof Publication)[];

// `public_token` NO está en la lista de la grilla: es la llave de acceso del cliente y no
// tiene por qué viajar al navegador mientras solo se está listando pedidos. Se pide aparte,
// en el detalle, donde el dueño sí necesita copiar el enlace.
const columnasPedidoLista = [
  "id",
  "order_number",
  "status",
  "customer_name",
  "customer_phone",
  "ship_city",
  "total",
  "paid_at",
  "carrier",
  "tracking_number",
  "estimated_date",
  "created_at",
] as const satisfies readonly (keyof Order)[];

const columnasPedidoDetalle = [
  ...columnasPedidoLista,
  "public_token",
  "customer_doc",
  "ship_address",
  "subtotal",
  "shipping_cost",
  "payment_note",
  "shipped_at",
  "updated_at",
] as const satisfies readonly (keyof Order)[];

const columnasPedidoItem = [
  "id",
  "product_id",
  "product_name",
  "category_key",
  "category_label",
  "color",
  "variant",
  "initials",
  "initials_color",
  "unit_price",
  "extra_price",
  "quantity",
  "line_total",
] as const satisfies readonly (keyof OrderItem)[];

const columnasPedidoHistorial = [
  "id",
  "status",
  "note",
  "created_at",
] as const satisfies readonly (keyof OrderStatusHistory)[];

export const SELECT_PRODUCTO = columnasProducto.join(",");
export const SELECT_CATEGORIA = columnasCategoria.join(",");
export const SELECT_COLOR_INICIALES = columnasColorIniciales.join(",");
export const SELECT_PUBLICACION = columnasPublicacion.join(",");
export const SELECT_PEDIDO_LISTA = columnasPedidoLista.join(",");
export const SELECT_PEDIDO_ITEM = columnasPedidoItem.join(",");
export const SELECT_PEDIDO_HISTORIAL = columnasPedidoHistorial.join(",");

/** El detalle con ítems e historial embebidos: una sola petición, no N+1. */
export const SELECT_PEDIDO_DETALLE =
  `${columnasPedidoDetalle.join(",")},` +
  `order_items(${SELECT_PEDIDO_ITEM}),` +
  `order_status_history(${SELECT_PEDIDO_HISTORIAL})`;
