// El catálogo público que consume la tienda.
//
// Es el borde entre la base y la app: acá los nombres de Supabase (`category_key`,
// `max_initials`) se traducen a los que ya usaban los componentes (`category`,
// `maxInitials`), y `product_photos` deja de ser un array de filas para ser una galería
// de URLs listas para un `src`.
//
// Estaba en JavaScript. Se tipó cuando aparecieron las páginas de producto: sin tipos,
// `catalog.products` era `any[]` y una página podía leer `producto.precio` —que no
// existe— sin que nada se quejara hasta que la viera un cliente. Traducir campos a mano
// es justo donde un typo no se nota.
//
// Mapeo campo por campo: docs/frontend-contract.md §5.
import type { CajaRecorte, Category, InitialsColor } from "../types/database";

const BASE = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const BUCKET = import.meta.env.PUBLIC_SUPABASE_STORAGE_BUCKET;
const PLACEHOLDER = "/assets/img/placeholder.svg";

/** Un producto tal como lo consumen los componentes de la tienda. */
export interface ProductoPublico {
  id: string;
  /** Los componentes usan `category`, no `category_key`. */
  category: string;
  name: string;
  color: string;
  variant?: string;
  hex?: string;
  /** Pesos enteros. */
  price: number;
  personalizable: boolean;
  maxInitials: number;
  groupKey: string;
  sortOrder: number;
  /** Colores de bordado propios de este producto (015). Vacío = heredar de la categoría. */
  initialsPalette: string[];
  /** URLs públicas, ya ordenadas por posición. Puede venir vacía. */
  gallery: string[];
  /** La primera foto, o el placeholder si el producto no tiene ninguna. */
  img: string;
  /**
   * Cajas de recorte (018_photo_crop_boxes.sql) de cada foto de `gallery`, en el mismo
   * orden e índice — `gallerySquareCrop[i]`/`galleryEditorialCrop[i]` son las cajas de
   * `gallery[i]`. `null` = sin personalizar, se muestra con object-fit:cover normal.
   * Se separan de `gallery` en vez de convertirla en un array de objetos para no tener
   * que tocar cada lugar de la tienda que ya consume `gallery`/`img` como URLs sueltas
   * (carrito, JSON-LD, swatches de variante): solo las vistas que de verdad recortan la
   * foto (tarjeta del catálogo, galería del producto, resultados del buscador) leen esto.
   */
  gallerySquareCrop: (CajaRecorte | null)[];
  galleryEditorialCrop: (CajaRecorte | null)[];
  /** El recorte de `img` (la foto 0) en cada forma. `null` si no hay fotos o no está personalizado. */
  imgSquareCrop: CajaRecorte | null;
  imgEditorialCrop: CajaRecorte | null;
}

export interface Catalogo {
  products: ProductoPublico[];
  categories: Category[];
  /**
   * La paleta de bordado completa, en orden. Antes era una constante del front
   * (`INITIALS_COLORS`); desde 014 la edita el dueño desde el panel, así que viaja con
   * el catálogo. Qué colores ve cada categoría lo decide `initials_palette` — ver
   * `initialsColorsFor` en lib/initials.js.
   */
  initialsColors: InitialsColor[];
  CATEGORY_LABELS: Record<string, string>;
  CATS: { key: string | null; label: string }[];
  IMPORTED_CATEGORIES: string[];
}

/** Fila cruda de PostgREST, antes de traducirla. */
interface FilaProducto {
  id: string;
  category_key: string;
  name: string;
  color: string;
  variant: string | null;
  hex: string | null;
  price: number;
  personalizable: boolean;
  max_initials: number;
  group_key: string;
  sort_order: number;
  initials_palette: string[];
  product_photos?: {
    storage_path: string;
    position: number;
    crop_square_x: number | null;
    crop_square_y: number | null;
    crop_square_w: number | null;
    crop_square_h: number | null;
    crop_editorial_x: number | null;
    crop_editorial_y: number | null;
    crop_editorial_w: number | null;
    crop_editorial_h: number | null;
  }[];
}

function cajaDesdeFila(
  x: number | null,
  y: number | null,
  w: number | null,
  h: number | null
): CajaRecorte | null {
  if (x === null || y === null || w === null || h === null) return null;
  return { x, y, w, h };
}

const photoUrl = (storagePath: string): string =>
  `${BASE}/storage/v1/object/public/${BUCKET}/${storagePath}`;

async function q<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: { apikey: KEY } });
  if (!res.ok) throw new Error(`Supabase ${res.status} en ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function loadCatalog(): Promise<Catalogo> {
  const [categories, prods, initialsColors] = await Promise.all([
    q<Category[]>(
      "categories?select=key,label,default_price,personalizable,max_initials,has_variant,position,is_imported,free_initials,extra_initials_price,initials_palette,portada_desc,portada_img&order=position"
    ),
    q<FilaProducto[]>(
      "products?select=id,category_key,name,color,variant,hex,price,personalizable,max_initials,group_key,sort_order,initials_palette,product_photos(storage_path,position,crop_square_x,crop_square_y,crop_square_w,crop_square_h,crop_editorial_x,crop_editorial_y,crop_editorial_w,crop_editorial_h)&order=category_key,sort_order"
    ),
    // Se ordena también por `name` porque `position` no es única (014): sin el desempate,
    // dos colores con el mismo número saldrían en un orden que cambia entre peticiones y
    // los círculos bailarían de lugar al recargar.
    q<InitialsColor[]>(
      "initials_colors?select=name,hex,position&order=position,name"
    ),
  ]);

  // sort_order solo es único DENTRO de cada categoría (products_category_sort_key es
  // (category_key, sort_order)) — pedirle a PostgREST que ordene solo por sort_order
  // intercala categorías (todos los "1" primero, después todos los "2"...). Se ordena
  // acá por la posición real de la categoría (la misma que usan las pestañas) y luego
  // por sort_order, para que "Todos" agrupe por categoría como en el catálogo original.
  const categoryPosition = Object.fromEntries(categories.map((c) => [c.key, c.position]));
  prods.sort((a, b) => {
    const posDiff = (categoryPosition[a.category_key] ?? 0) - (categoryPosition[b.category_key] ?? 0);
    return posDiff !== 0 ? posDiff : a.sort_order - b.sort_order;
  });

  const products: ProductoPublico[] = prods.map((p) => {
    const fotosOrdenadas = (p.product_photos ?? []).slice().sort((a, b) => a.position - b.position);
    const gallery = fotosOrdenadas.map((ph) => photoUrl(ph.storage_path));
    const gallerySquareCrop = fotosOrdenadas.map((ph) =>
      cajaDesdeFila(ph.crop_square_x, ph.crop_square_y, ph.crop_square_w, ph.crop_square_h)
    );
    const galleryEditorialCrop = fotosOrdenadas.map((ph) =>
      cajaDesdeFila(ph.crop_editorial_x, ph.crop_editorial_y, ph.crop_editorial_w, ph.crop_editorial_h)
    );
    return {
      id: p.id,
      category: p.category_key,
      name: p.name,
      color: p.color,
      variant: p.variant ?? undefined,
      hex: p.hex ?? undefined,
      price: p.price,
      personalizable: p.personalizable,
      maxInitials: p.max_initials,
      groupKey: p.group_key,
      sortOrder: p.sort_order,
      initialsPalette: p.initials_palette ?? [],
      gallery,
      img: gallery[0] ?? PLACEHOLDER, // producto sin fotos: placeholder, no romper
      gallerySquareCrop,
      galleryEditorialCrop,
      imgSquareCrop: gallerySquareCrop[0] ?? null,
      imgEditorialCrop: galleryEditorialCrop[0] ?? null,
    };
  });

  return {
    products,
    categories,
    initialsColors,
    CATEGORY_LABELS: Object.fromEntries(categories.map((c) => [c.key, c.label])),
    CATS: [
      { key: null, label: "Todos" },
      ...categories.map((c) => ({ key: c.key, label: c.label })),
    ],
    IMPORTED_CATEGORIES: categories.filter((c) => c.is_imported).map((c) => c.key),
  };
}
