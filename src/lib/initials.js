// Qué colores de bordado puede elegir el cliente en una ficha de producto.
//
// LA PALETA YA NO VIVE ACÁ. Hasta 014_initials_colors.sql este archivo tenía la lista
// escrita a mano (`INITIALS_COLORS`, nueve colores, más `PLATEADO_COLOR` aparte) y una
// regla igual de escrita a mano: `category === "makeup-bag" ? [PLATEADO_COLOR] : …`.
// Las dos cosas obligaban a un deploy para agregar un color o para que una categoría
// nueva se bordara distinto.
//
// Ahora la paleta es una tabla que el dueño edita desde el panel, y qué colores ve cada
// categoría lo dice `categories.initials_palette` (008), que hasta hoy el panel dejaba
// configurar y la tienda ignoraba.

/**
 * @param {{ name: string, hex: string }[]} paleta  Toda la paleta, de `catalog.initialsColors`.
 * @param {{ initials_palette?: string[] } | undefined} categoria  La categoría del producto.
 * @returns {{ name: string, hex: string }[]} Los colores que se pintan, en orden.
 */
export function initialsColorsFor(paleta, categoria) {
  const todos = paleta ?? [];
  const permitidos = categoria?.initials_palette ?? [];

  // Array vacío = todos, tal como lo definió 008 y como lo dice el panel en la pantalla
  // ("VACÍO = TODOS"). Es el caso normal: la mayoría de las categorías se bordan en
  // cualquier color.
  if (permitidos.length === 0) return todos;

  const filtrada = todos.filter((c) => permitidos.includes(c.name));

  // RED DE SEGURIDAD, y no un detalle. `initials_palette` guarda NOMBRES sueltos, sin
  // foreign key contra la paleta —es un `text[]`—, así que borrar un color desde el
  // panel deja huérfano cualquier nombre que lo mencionara. Si eso vacía la lista, el
  // cliente se queda sin ningún círculo que tocar y no puede terminar de personalizar:
  // peor que ver un color de más. Ante una configuración rota, se muestra todo.
  return filtrada.length > 0 ? filtrada : todos;
}
