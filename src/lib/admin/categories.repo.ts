// Categorías: leer, crear, editar, borrar, reordenar.
//
// Las categorías NO pasan por el borrador. Se escriben directo en `categories` y el
// sitio las ve en la próxima carga, sin publicar. Es así en el esquema: no hay
// `categories_draft`. Vale la pena decírselo al usuario en la pantalla, porque el
// resto del panel funciona al revés.
//
// Son lo primero que hay que crear: `products_draft.category_key` es foreign key, así
// que sin una categoría no se puede crear ningún producto.

import { rest } from "../supabase/http";
import { SELECT_CATEGORIA, type Category, type CategoryUpdate } from "../../types/database";

const TABLA = "categories";
const CTX = "categories" as const;

/** Todas las categorías, en el orden de las pestañas de la tienda. */
export async function listar(): Promise<Category[]> {
  return rest<Category[]>(`${TABLA}?select=${SELECT_CATEGORIA}&order=position`, {
    contexto: CTX,
  });
}

/**
 * Cuántos productos cuelgan de cada categoría, contando también los ocultos.
 *
 * Se cuenta sobre el BORRADOR y no sobre lo publicado a propósito: la foreign key
 * que impide borrar una categoría apunta a `products_draft`, así que lo que importa
 * para saber si se puede borrar es lo que hay en el borrador.
 */
export async function contarProductosPorCategoria(): Promise<Record<string, number>> {
  const filas = await rest<{ category_key: string }[]>(
    "products_draft?select=category_key",
    { contexto: CTX }
  );
  const conteo: Record<string, number> = {};
  for (const f of filas) conteo[f.category_key] = (conteo[f.category_key] ?? 0) + 1;
  return conteo;
}

export async function crear(categoria: Category): Promise<Category> {
  const filas = await rest<Category[]>(TABLA, {
    method: "POST",
    body: categoria,
    contexto: CTX,
  });
  return filas[0]!;
}

/** `key` es la PK y no se puede cambiar: cambiarla dejaría productos huérfanos. */
export async function editar(key: string, cambios: CategoryUpdate): Promise<Category> {
  const filas = await rest<Category[]>(`${TABLA}?key=eq.${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: cambios,
    contexto: CTX,
  });
  return filas[0]!;
}

/**
 * Borra una categoría. Falla con `23503` si todavía tiene productos en el borrador,
 * y está bien que falle: borrarla igual dejaría productos apuntando a nada.
 */
export async function borrar(key: string): Promise<void> {
  await rest<null>(`${TABLA}?key=eq.${encodeURIComponent(key)}`, {
    method: "DELETE",
    contexto: CTX,
  });
}

/**
 * Reordena las pestañas: recibe las claves en el orden final y les asigna
 * `position` 1..n.
 *
 * POR QUÉ ES UN UPSERT Y NO VARIOS PATCH — esto importa:
 * `categories_position_key` es UNIQUE y NO diferible (001_schema.sql:42). Cada
 * petición REST es su propia transacción, así que mover la categoría A de la
 * posición 2 a la 1 con un PATCH suelto choca contra la que ya está en la 1 y
 * devuelve `23505`, aunque el estado final fuera perfectamente válido.
 *
 * Un solo POST con `resolution=merge-duplicates` es UNA sentencia
 * (INSERT ... ON CONFLICT DO UPDATE) dentro de UNA transacción: Postgres evalúa el
 * UNIQUE sobre el resultado final, no sobre los pasos intermedios. La permutación
 * pasa entera o no pasa ninguna.
 *
 * Se mandan las filas COMPLETAS y no solo `{key, position}` porque un upsert que
 * inserta necesita todas las columnas NOT NULL. Para las que ya existen, el
 * ON CONFLICT las actualiza con los mismos valores.
 */
export async function reordenar(categorias: Category[]): Promise<Category[]> {
  const conPosicion = categorias.map((c, i) => ({ ...c, position: i + 1 }));
  return rest<Category[]>(TABLA, {
    method: "POST",
    body: conPosicion,
    upsert: true,
    contexto: CTX,
  });
}
