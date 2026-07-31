// Deshacer cambios: revertir el borrador de productos a lo que está publicado.
//
// No hace falta ninguna migración ni tabla nueva: alcanza con leer `publicado`
// (que el panel ya carga para pintar el diff de Publicar) y volcarlo sobre el
// borrador con las mismas funciones que ya usa el editor para guardar.
//
// Deliberadamente NO optimista, a diferencia de useOrdenOptimista: acá no hay
// una sensación de arrastre que proteger, y mantener el mismo patrón que
// guardar/borrar/publicar (esperar la respuesta, recién ahí refrescar) es más
// simple y más consistente con el resto del panel.

import * as productosRepo from "./products.repo";
import * as fotosRepo from "./photos.repo";
import { calcularDiff } from "./diff";
import type { ProductUpdate, ProductWithPhotos } from "../../types/database";

/** Rutas de fotos de un producto, en orden. Sirve para borrador o publicado. */
function rutasDeFotos(p: ProductWithPhotos): string[] {
  const fotos = p.product_photos_draft ?? p.product_photos ?? [];
  return [...fotos].sort((a, b) => a.position - b.position).map((f) => f.storage_path);
}

/**
 * Los campos que se copian de vuelta al deshacer. Deliberadamente SIN
 * `sort_order`: el UNIQUE (categoría, orden) del borrador es diferible dentro
 * de un reordenar() en lote, pero no dentro de un PATCH suelto — copiarlo tal
 * cual podría chocar con otro producto que ya esté en esa posición. Deshacer
 * restaura el contenido, no la posición.
 */
function camposRevertibles(p: ProductWithPhotos): ProductUpdate {
  const {
    id: _id,
    created_at: _ca,
    updated_at: _ua,
    sort_order: _so,
    product_photos_draft: _fd,
    product_photos: _fp,
    ...resto
  } = p;
  return resto;
}

/**
 * Revierte UN producto del borrador a como está publicado ahora mismo.
 *
 * No hace nada si el producto es "nuevo" (no existe publicado, no hay a qué
 * volver) — para ese caso lo correcto es eliminarlo, no revertirlo; lo maneja
 * `descartarCambios` aparte.
 */
export async function revertirProducto(
  id: string,
  borrador: ProductWithPhotos[],
  publicado: ProductWithPhotos[]
): Promise<void> {
  const p = publicado.find((x) => x.id === id);
  if (!p) return;

  const enBorrador = borrador.some((x) => x.id === id);
  if (enBorrador) {
    await productosRepo.editar(id, camposRevertibles(p));
  } else {
    // "eliminado": la fila ya no está en el borrador, hay que volver a crearla.
    // El orden tampoco se copia acá por la misma razón que en camposRevertibles
    // — se le asigna el próximo libre de la categoría, no el que tenía publicado.
    const { product_photos_draft: _fd, product_photos: _fp, sort_order: _so, ...resto } = p;
    await productosRepo.crear({
      ...resto,
      sort_order: productosRepo.siguienteOrden(borrador, p.category_key),
    });
  }

  await fotosRepo.reemplazar(id, rutasDeFotos(p));
}

/**
 * Descarta TODOS los cambios pendientes: recorre el mismo diff que ya se
 * muestra en Publicar y revierte cada uno, uno por uno (no en paralelo, para
 * no saturar la base y para que un error a mitad de camino sea claro sobre
 * qué falló). Si algo falla, lo ya revertido queda revertido — volver a
 * apretar "Deshacer cambios" retoma justo donde quedó, porque el diff se
 * recalcula fresco cada vez.
 */
export async function descartarCambios(
  borrador: ProductWithPhotos[],
  publicado: ProductWithPhotos[]
): Promise<void> {
  const { cambios } = calcularDiff(borrador, publicado);
  for (const c of cambios) {
    if (c.tipo === "nuevo") {
      await productosRepo.eliminar(c.id);
    } else {
      await revertirProducto(c.id, borrador, publicado);
    }
  }
}
