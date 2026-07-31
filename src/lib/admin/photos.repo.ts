// Fotos de un producto del borrador.
//
// EL ARRAY ENTERO, SIEMPRE. Agregar, quitar y reordenar son la misma operación: se
// manda la lista completa en el orden final y la posición sale del índice (0 = foto
// principal).
//
// Es una RPC y no dos llamadas REST por una razón concreta: un DELETE seguido de un
// POST son dos transacciones. Si la segunda falla, el producto se queda SIN NINGUNA
// foto. `replace_product_photos_draft` hace las dos cosas en una sola transacción —
// o quedan las nuevas, o quedan las viejas. Ver 003_functions.sql:154-174.

import { rpc } from "../supabase/http";
import { construirPath, subirImagen } from "../supabase/storage";
import { comoAdminError, type AdminError } from "../supabase/errors";
import type { ReplacePhotosArgs } from "../../types/database";

const CTX = "photos" as const;

/**
 * Reemplaza el conjunto completo de fotos de un producto del borrador.
 * @returns cuántas fotos quedaron
 */
export async function reemplazar(productId: string, storagePaths: string[]): Promise<number> {
  const args: ReplacePhotosArgs = { p_product_id: productId, p_storage_paths: storagePaths };
  return rpc<number>("replace_product_photos_draft", args as unknown as Record<string, unknown>, CTX);
}

/** Estado de una subida en curso, para pintar la lista mientras suben. */
export interface SubidaEnCurso {
  /** Identificador temporal en el cliente; no es el storage_path. */
  id: string;
  nombreArchivo: string;
  path: string | null;
  porcentaje: number;
  error: AdminError | null;
}

export interface ResultadoSubida {
  /** Rutas subidas con éxito, en el mismo orden en que llegaron los archivos. */
  subidas: string[];
  /** Archivos que no se pudieron subir, con el motivo. */
  fallidas: { nombreArchivo: string; error: AdminError }[];
}

/**
 * Sube varios archivos al bucket. NO los asocia al producto: eso es un paso aparte,
 * porque asociar es reemplazar el array completo y quien decide el orden final es la
 * pantalla, no este módulo.
 *
 * ORDEN DE LAS OPERACIONES (docs/api-endpoints.md §5): primero Storage, después la
 * base. Al revés, la fila apuntaría a un archivo que todavía no existe y el sitio
 * mostraría un 404 en la ventana entre las dos llamadas.
 *
 * Un archivo que falla no cancela a los demás: se sube lo que se pueda y se informa
 * el resto. Perder cuatro subidas buenas porque la quinta pesaba 6 MB sería peor.
 */
export async function subirArchivos(
  categoryKey: string,
  archivos: File[],
  onProgress?: (indice: number, porcentaje: number) => void
): Promise<ResultadoSubida> {
  const subidas: string[] = [];
  const fallidas: { nombreArchivo: string; error: AdminError }[] = [];

  for (let i = 0; i < archivos.length; i++) {
    const file = archivos[i]!;
    try {
      // construirPath valida tipo, tamaño y formato ANTES de mandar un solo byte:
      // Storage aceptaría una ruta inválida con 200 y después la base la rechazaría,
      // dejando el archivo huérfano. Ver storage.ts.
      const path = construirPath(categoryKey, file);
      await subirImagen(path, file, (pct) => onProgress?.(i, pct));
      subidas.push(path);
    } catch (e) {
      fallidas.push({ nombreArchivo: file.name, error: comoAdminError(e) });
    }
  }

  return { subidas, fallidas };
}
