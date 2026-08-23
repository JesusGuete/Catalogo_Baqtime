// Diferencia entre el borrador y lo que está publicado ahora mismo.
//
// Es lógica PURA a propósito: recibe dos listas y devuelve la comparación, sin tocar
// la red ni React. Así se puede razonar sobre ella y probarla sin levantar nada, que
// es lo que corresponde para el cálculo que decide qué le va a pasar a la tienda
// cuando el dueño apriete "Publicar".

import type { ProductWithPhotos, PhotoRef } from "../../types/database";

export type TipoCambio = "nuevo" | "editado" | "se-oculta" | "se-muestra" | "eliminado";

export interface Cambio {
  id: string;
  nombre: string;
  categoryKey: string;
  tipo: TipoCambio;
  /** Frase corta para la columna derecha de la lista: "$85.000 → $95.000". */
  detalle: string;
}

export interface Diff {
  cambios: Cambio[];
  nuevos: number;
  editados: number;
  seOcultan: number;
  sinCambios: number;
  /** `true` si no hay absolutamente nada que publicar. */
  vacio: boolean;
  /**
   * `true` cuando el borrador quedó sin filas y hay catálogo publicado: la base va a
   * rechazar la publicación con `P0001`. Se detecta acá para poder avisar ANTES de
   * que el dueño apriete el botón, en vez de mostrarle un error después.
   */
  dispararaGuarda: boolean;
}

/** Campos que, si cambian, cuentan como "editado". Se excluyen los que mueve la base sola. */
const CAMPOS_COMPARABLES = [
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
  "sort_order",
] as const satisfies readonly (keyof ProductWithPhotos)[];

const dinero = (n: number): string => "$ " + n.toLocaleString("es-CO");

function fotosDe(p: ProductWithPhotos): string[] {
  const fotos: PhotoRef[] = p.product_photos_draft ?? p.product_photos ?? [];
  return [...fotos].sort((a, b) => a.position - b.position).map((f) => f.storage_path);
}

function mismasFotos(a: string[], b: string[]): boolean {
  // El orden importa: mover la foto principal a la segunda posición es un cambio
  // visible en la tarjeta del catálogo, aunque el conjunto sea idéntico.
  return a.length === b.length && a.every((path, i) => path === b[i]);
}

/**
 * `initials_palette` (015) NO PUEDE entrar en CAMPOS_COMPARABLES: esa lista compara con
 * `!==`, y dos arrays traídos por consultas distintas nunca son la misma referencia. Si
 * se agregara ahí, TODOS los productos aparecerían como editados para siempre y la
 * pantalla de publicar dejaría de servir para nada.
 *
 * Acá el orden NO importa, al revés que en las fotos: la tienda pinta los colores en el
 * orden de la paleta (`position`), no en el que quedaron guardados en esta columna, así
 * que un reordenamiento no es un cambio que nadie pueda ver.
 */
function mismaPaleta(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ordenadaB = [...b].sort();
  return [...a].sort().every((n, i) => n === ordenadaB[i]);
}

/**
 * Arma la frase del detalle priorizando lo que más le importa a quien mira: primero
 * el precio (es lo que cobra), después las fotos, y recién al final "otros campos".
 * Mostrar los 11 campos que cambiaron no ayuda a decidir si publicar.
 */
function describirCambios(borrador: ProductWithPhotos, publicado: ProductWithPhotos): string {
  const partes: string[] = [];

  if (borrador.price !== publicado.price) {
    partes.push(`${dinero(publicado.price)} → ${dinero(borrador.price)}`);
  }

  const fotosB = fotosDe(borrador);
  const fotosP = fotosDe(publicado);
  if (!mismasFotos(fotosB, fotosP)) {
    partes.push(
      fotosB.length === fotosP.length
        ? "fotos reordenadas"
        : `${fotosP.length} fotos → ${fotosB.length} fotos`
    );
  }

  if (!mismaPaleta(borrador.initials_palette ?? [], publicado.initials_palette ?? [])) {
    // Se nombra aparte y no como "un campo más" porque cambia lo que el cliente puede
    // elegir en la ficha, que es más visible que la mayoría de las columnas.
    partes.push(
      borrador.initials_palette.length === 0
        ? "colores de bordado: vuelve a los de la categoría"
        : `colores de bordado: ${borrador.initials_palette.join(", ")}`
    );
  }

  const otros = CAMPOS_COMPARABLES.filter(
    (c) => c !== "price" && borrador[c] !== publicado[c]
  );
  if (otros.length) {
    partes.push(otros.length === 1 ? `cambió ${etiqueta(otros[0]!)}` : `${otros.length} campos más`);
  }

  return partes.join(" · ").toUpperCase() || "SIN DIFERENCIAS VISIBLES";
}

/** Nombre legible de una columna, para el detalle. */
function etiqueta(campo: string): string {
  const nombres: Record<string, string> = {
    category_key: "la categoría",
    name: "el nombre",
    color: "el color",
    variant: "la variante",
    hex: "el color hex",
    personalizable: "si es personalizable",
    max_initials: "el máximo de iniciales",
    group_key: "el grupo de color",
    origin: "el origen",
    sort_order: "el orden",
  };
  return nombres[campo] ?? campo;
}

/**
 * @param borrador  lo que hay en products_draft (con sus fotos del borrador)
 * @param publicado lo que hay en products (con sus fotos publicadas)
 */
export function calcularDiff(
  borrador: ProductWithPhotos[],
  publicado: ProductWithPhotos[]
): Diff {
  const porIdPublicado = new Map(publicado.map((p) => [p.id, p]));
  const idsBorrador = new Set(borrador.map((p) => p.id));
  const cambios: Cambio[] = [];
  let sinCambios = 0;

  for (const b of borrador) {
    const p = porIdPublicado.get(b.id);
    const base = { id: b.id, nombre: b.name, categoryKey: b.category_key };

    // No estaba publicado. Si además está oculto, no aporta nada al sitio y no vale
    // la pena listarlo como cambio: publicarlo no cambia lo que ve un cliente.
    if (!p) {
      if (!b.is_active) {
        sinCambios++;
        continue;
      }
      const fotos = fotosDe(b).length;
      cambios.push({
        ...base,
        tipo: "nuevo",
        detalle: fotos ? `${fotos} FOTOS` : "SIN FOTOS · VA EL PLACEHOLDER",
      });
      continue;
    }

    // Estaba publicado y ahora se oculta: desaparece del catálogo. Es el cambio más
    // fuerte que puede haber, así que va antes que cualquier edición de campos.
    if (p.is_active && !b.is_active) {
      cambios.push({ ...base, tipo: "se-oculta", detalle: "DESAPARECE DEL CATÁLOGO" });
      continue;
    }

    if (!p.is_active && b.is_active) {
      cambios.push({ ...base, tipo: "se-muestra", detalle: "VUELVE AL CATÁLOGO" });
      continue;
    }

    const camposDistintos = CAMPOS_COMPARABLES.some((c) => b[c] !== p[c]);
    const fotosDistintas = !mismasFotos(fotosDe(b), fotosDe(p));
    const paletaDistinta = !mismaPaleta(b.initials_palette ?? [], p.initials_palette ?? []);

    if (camposDistintos || fotosDistintas || paletaDistinta) {
      cambios.push({ ...base, tipo: "editado", detalle: describirCambios(b, p) });
    } else {
      sinCambios++;
    }
  }

  // Filas publicadas que ya no están en el borrador: se borraron de verdad. Publicar
  // las saca del sitio y libera sus imágenes (van a venir en `removed_paths`).
  for (const p of publicado) {
    if (!idsBorrador.has(p.id)) {
      cambios.push({
        id: p.id,
        nombre: p.name,
        categoryKey: p.category_key,
        tipo: "eliminado",
        detalle: "SE BORRA DEL CATÁLOGO",
      });
    }
  }

  const contar = (t: TipoCambio): number => cambios.filter((c) => c.tipo === t).length;
  const nuevos = contar("nuevo") + contar("se-muestra");
  const editados = contar("editado");
  const seOcultan = contar("se-oculta") + contar("eliminado");

  return {
    cambios,
    nuevos,
    editados,
    seOcultan,
    sinCambios,
    vacio: cambios.length === 0,
    // La guarda de publish_catalog() cuenta FILAS, no filas activas: por eso se mira
    // borrador.length y no cuántas están activas. 003_functions.sql:75-87.
    dispararaGuarda: borrador.length === 0 && publicado.length > 0,
  };
}
