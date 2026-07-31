// Publicar: copiar el borrador entero al catálogo público.
//
// `publish_catalog()` es una sola transacción: o pasa todo o no pasa nada. Devuelve
// `removed_paths` con las imágenes que ya no referencia NI lo publicado NI el
// borrador, y esas hay que borrarlas de Storage desde acá.
//
// El paso de Storage es del cliente por una limitación real, no por diseño: una
// función de Postgres no puede hablar con la API de Storage. Si el panel se cierra
// entre la publicación y el borrado, esos archivos quedan huérfanos — ocupan cuota,
// no rompen nada, y se pueden barrer después comparando Storage contra
// product_photos. Ver docs/api-endpoints.md §5, paso 7.

import { rest, rpc } from "../supabase/http";
import { borrarImagenes } from "../supabase/storage";
import {
  SELECT_PRODUCTO,
  SELECT_PUBLICACION,
  type ProductWithPhotos,
  type Publication,
  type PublishResult,
} from "../../types/database";

const CTX = "publish" as const;

/**
 * Lo que hay publicado AHORA, con sus fotos. Es el lado derecho del diff.
 *
 * Ojo con una diferencia importante respecto de la tienda pública: acá se piden
 * también las filas con `is_active = false`. La política RLS de lectura anónima
 * filtra las inactivas, pero un admin las ve, y el diff las necesita para poder
 * decir "este producto vuelve al catálogo".
 */
export async function cargarPublicado(): Promise<ProductWithPhotos[]> {
  const filas = await rest<ProductWithPhotos[]>(
    `products?select=${SELECT_PRODUCTO},product_photos(storage_path,position)&order=category_key,sort_order`,
    { contexto: CTX }
  );
  for (const p of filas) p.product_photos?.sort((a, b) => a.position - b.position);
  return filas;
}

export async function listarPublicaciones(limite = 10): Promise<Publication[]> {
  return rest<Publication[]>(
    `publications?select=${SELECT_PUBLICACION}&order=published_at.desc&limit=${limite}`,
    { contexto: CTX }
  );
}

export interface ResultadoPublicacion extends PublishResult {
  /** Cuántas imágenes huérfanas se borraron de Storage después de publicar. */
  imagenesBorradas: number;
  /**
   * Si la limpieza de Storage falló. NO invalida la publicación: el catálogo ya
   * quedó publicado. Se informa como aviso, no como error.
   */
  errorLimpieza: string | null;
}

/**
 * Publica y limpia. Dos pasos, en este orden, y el segundo no puede hacer fracasar
 * al primero.
 */
export async function publicar(): Promise<ResultadoPublicacion> {
  // `returns table` significa que PostgREST devuelve un ARRAY de una fila, no el
  // objeto suelto. Desempaquetarlo mal es un error clásico: `resultado.product_count`
  // daría `undefined` sin tirar ninguna excepción.
  const filas = await rpc<PublishResult[]>("publish_catalog", {}, CTX);
  const resultado = filas[0];

  if (!resultado) {
    throw new Error("publish_catalog no devolvió ninguna fila.");
  }

  const limpieza = await borrarImagenes(resultado.removed_paths);

  return {
    ...resultado,
    imagenesBorradas: limpieza.borradas,
    errorLimpieza: limpieza.error,
  };
}
