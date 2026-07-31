// Productos del BORRADOR.
//
// REGLA QUE NO SE NEGOCIA: este archivo escribe en `products_draft`, nunca en
// `products`. La tabla publicada no tiene política de escritura para NADIE — ni para
// los admins (002_rls.sql). La única forma de modificarla es `publish_catalog()`.
// Eso no es una convención que respetamos por disciplina: es estructural, y por eso
// "lo publicado siempre es una copia entera y consistente de algún borrador" se
// cumple aunque alguien se equivoque acá.

import { rest } from "../supabase/http";
import {
  SELECT_PRODUCTO,
  type Product,
  type ProductInsert,
  type ProductUpdate,
  type ProductWithPhotos,
  type PhotoRef,
} from "../../types/database";

const TABLA = "products_draft";
const CTX = "products" as const;

/** El select con las fotos del borrador embebidas: una sola petición, no N+1. */
const SELECT_CON_FOTOS = `${SELECT_PRODUCTO},product_photos_draft(storage_path,position)`;

/**
 * Todo el borrador con sus fotos.
 *
 * Se ordena por `category_key,sort_order` y no solo por `sort_order` porque el
 * UNIQUE es (category_key, sort_order): el orden es único DENTRO de cada categoría,
 * así que ordenar solo por sort_order intercala categorías (todos los "1" primero,
 * después todos los "2"). Es la misma corrección que ya tiene catalog.js.
 */
export async function listar(): Promise<ProductWithPhotos[]> {
  const filas = await rest<ProductWithPhotos[]>(
    `${TABLA}?select=${SELECT_CON_FOTOS}&order=category_key,sort_order`,
    { contexto: CTX }
  );
  // PostgREST no garantiza el orden de las filas embebidas, así que las fotos se
  // ordenan acá. La posición 0 es la principal y tiene que quedar primera.
  for (const p of filas) {
    p.product_photos_draft?.sort((a, b) => a.position - b.position);
  }
  return filas;
}

export async function obtener(id: string): Promise<ProductWithPhotos | null> {
  const filas = await rest<ProductWithPhotos[]>(
    `${TABLA}?select=${SELECT_CON_FOTOS}&id=eq.${encodeURIComponent(id)}`,
    { contexto: CTX }
  );
  const p = filas[0];
  if (!p) return null;
  p.product_photos_draft?.sort((a, b) => a.position - b.position);
  return p;
}

export async function crear(producto: ProductInsert): Promise<Product> {
  const filas = await rest<Product[]>(TABLA, {
    method: "POST",
    body: producto,
    contexto: CTX,
  });
  return filas[0]!;
}

/** `updated_at` lo pone solo el trigger `set_updated_at` — no se manda desde acá. */
export async function editar(id: string, cambios: ProductUpdate): Promise<Product> {
  const filas = await rest<Product[]>(`${TABLA}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: cambios,
    contexto: CTX,
  });
  return filas[0]!;
}

/**
 * Borrado SUAVE — el que usa el panel por defecto.
 *
 * El producto desaparece del sitio pero la fila sigue existiendo, y eso importa más
 * de lo que parece: la guarda de `publish_catalog()` cuenta FILAS, no filas activas.
 * Un catálogo "vaciado" con borrado suave sigue teniendo filas y publica sin
 * problema. Si en vez de esto se borraran las filas de verdad, vaciar el catálogo
 * dispararía la guarda `P0001` y el dueño no podría publicar.
 */
export async function ocultar(id: string): Promise<Product> {
  return editar(id, { is_active: false });
}

export async function mostrar(id: string): Promise<Product> {
  return editar(id, { is_active: true });
}

/**
 * Borrado DURO. Arrastra sus fotos de `product_photos_draft` por ON DELETE CASCADE.
 * Los archivos en Storage NO se borran acá: eso lo resuelve `publish_catalog()`
 * devolviendo `removed_paths`. Ver publish.repo.ts.
 */
export async function eliminar(id: string): Promise<void> {
  await rest<null>(`${TABLA}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    contexto: CTX,
  });
}

/**
 * Reordena los productos DENTRO de una categoría: recibe el orden final y les
 * asigna `sort_order` 1..n.
 *
 * Acá el UNIQUE (category_key, sort_order) SÍ es diferible en el borrador
 * (001_schema.sql:100-101, `deferrable initially deferred`), o sea que se evalúa al
 * COMMIT. Aun así hace falta un solo upsert y no varios PATCH: cada petición REST es
 * su propia transacción, así que dos PATCH son dos commits y el primero ya choca.
 * Con un upsert único la permutación entera entra en una transacción y el UNIQUE se
 * evalúa recién sobre el estado final.
 */
export async function reordenar(productos: Product[]): Promise<Product[]> {
  const conOrden: ProductInsert[] = productos.map((p, i) => {
    const { created_at: _c, updated_at: _u, ...resto } = p;
    return { ...resto, sort_order: i + 1 };
  });

  return rest<Product[]>(TABLA, {
    method: "POST",
    body: conOrden,
    upsert: true,
    contexto: CTX,
  });
}

/**
 * El próximo `sort_order` libre de una categoría. Se calcula en el cliente sobre la
 * lista ya cargada para no pedirle otra vuelta al servidor cada vez que se abre el
 * formulario de un producto nuevo.
 */
export function siguienteOrden(productos: Product[], categoryKey: string): number {
  const deLaCategoria = productos.filter((p) => p.category_key === categoryKey);
  if (!deLaCategoria.length) return 1;
  return Math.max(...deLaCategoria.map((p) => p.sort_order)) + 1;
}

/** Las rutas de Storage que usa un producto, en orden. */
export function rutasDeFotos(producto: ProductWithPhotos): string[] {
  const fotos: PhotoRef[] = producto.product_photos_draft ?? [];
  return [...fotos].sort((a, b) => a.position - b.position).map((f) => f.storage_path);
}
