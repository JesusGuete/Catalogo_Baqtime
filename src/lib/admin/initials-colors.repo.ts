// La paleta de bordado: leer, crear, editar, borrar.
//
// Igual que las categorías, NO pasa por el borrador. Se escribe directo en
// `initials_colors` y la tienda la ve en la próxima carga, sin publicar. Vale la pena
// decírselo al dueño en la pantalla, porque el resto del panel funciona al revés.
//
// El nombre es la PK (014_initials_colors.sql) y por eso no se puede editar: los nombres
// están copiados dentro de `categories.initials_palette` y de `order_items.initials_color`
// como texto suelto, sin foreign key. Renombrar un color acá dejaría esas referencias
// apuntando a un nombre que ya no existe.

import { rest } from "../supabase/http";
import {
  SELECT_COLOR_INICIALES,
  type InitialsColor,
  type InitialsColorUpdate,
} from "../../types/database";

const TABLA = "initials_colors";
const CTX = "initials_colors" as const;

/**
 * Toda la paleta, en el orden en que se pintan los círculos en la ficha.
 *
 * Desempata por nombre porque `position` no es única (014): sin el desempate el orden
 * cambia entre peticiones y los colores se mueven de lugar solos.
 */
export async function listar(): Promise<InitialsColor[]> {
  return rest<InitialsColor[]>(
    `${TABLA}?select=${SELECT_COLOR_INICIALES}&order=position,name`,
    { contexto: CTX }
  );
}

/**
 * Agrega un color al final de la paleta.
 *
 * La posición la calcula quien llama, a partir de la lista que ya tiene en pantalla: es
 * un número de orden, no una identidad, y no siendo único un empate no rompe nada.
 */
export async function crear(color: InitialsColor): Promise<InitialsColor> {
  const filas = await rest<InitialsColor[]>(TABLA, {
    method: "POST",
    body: color,
    contexto: CTX,
  });
  return filas[0]!;
}

/** El nombre es la PK y no se cambia — ver la cabecera. Acá solo viajan hex y position. */
export async function editar(
  name: string,
  cambios: InitialsColorUpdate
): Promise<InitialsColor> {
  const filas = await rest<InitialsColor[]>(
    `${TABLA}?name=eq.${encodeURIComponent(name)}`,
    { method: "PATCH", body: cambios, contexto: CTX }
  );
  return filas[0]!;
}

/**
 * Borra un color de la paleta.
 *
 * NO FALLA aunque alguna categoría lo tenga en su `initials_palette`, porque esa columna
 * es un `text[]` y no una foreign key: la base no sabe que existe esa referencia. Es
 * responsabilidad de la pantalla avisar antes, y de `initialsColorsFor` no dejar una
 * ficha sin ningún color que elegir cuando pasa igual.
 *
 * Los pedidos viejos tampoco se tocan: `order_items.initials_color` guardó el nombre como
 * texto, así que un pedido de 2026 sigue diciendo en qué color se bordó aunque el color
 * ya no se ofrezca. Eso es lo correcto — es un registro de lo que se vendió.
 */
export async function borrar(name: string): Promise<void> {
  await rest<null>(`${TABLA}?name=eq.${encodeURIComponent(name)}`, {
    method: "DELETE",
    contexto: CTX,
  });
}
