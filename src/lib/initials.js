// Qué colores de bordado puede elegir el cliente en una ficha de producto.
//
// LA PALETA YA NO VIVE ACÁ. Hasta 014_initials_colors.sql este archivo tenía la lista
// escrita a mano (`INITIALS_COLORS`, nueve colores, más `PLATEADO_COLOR` aparte) y una
// regla igual de escrita a mano: `category === "makeup-bag" ? [PLATEADO_COLOR] : …`.
// Las dos cosas obligaban a un deploy para agregar un color o para que una categoría
// nueva se bordara distinto.
//
// Ahora la paleta es una tabla que el dueño edita desde el panel, y qué colores se
// ofrecen sale de una CASCADA de dos niveles, del más específico al más general.

/**
 * @param {{ name: string, hex: string }[]} paleta  Toda la paleta, de `catalog.initialsColors`.
 * @param {{ initials_palette?: string[] } | undefined} categoria  La categoría del producto.
 * @param {{ initialsPalette?: string[] } | undefined} producto  El producto abierto.
 * @returns {{ name: string, hex: string }[]} Los colores que se pintan, en orden.
 */
export function initialsColorsFor(paleta, categoria, producto) {
  const todos = paleta ?? [];

  // EL PRODUCTO MANDA SOBRE LA CATEGORÍA (015). La categoría sola era el nivel
  // equivocado para decidir esto: "Tote Personalizado" agrupa un bolso beige, uno negro
  // y uno vino, y lo que se ve bien bordado encima de cada uno es distinto —hilo beige
  // sobre lona beige no se ve—, pero la regla por categoría los obliga a ofrecer lo
  // mismo. Cuando el producto trae su propia lista, la de la categoría no se consulta:
  // son dos respuestas a la misma pregunta y gana la que mira el bolso concreto.
  const propios = producto?.initialsPalette ?? [];
  const permitidos = propios.length > 0 ? propios : categoria?.initials_palette ?? [];

  // Array vacío = todos, tal como lo definió 008 y como lo dice el panel en la pantalla
  // ("VACÍO = TODOS"). Es el caso normal.
  if (permitidos.length === 0) return todos;

  const filtrada = todos.filter((c) => permitidos.includes(c.name));

  // RED DE SEGURIDAD, y no un detalle. Las dos listas guardan NOMBRES sueltos, sin
  // foreign key contra la paleta —son `text[]`—, así que borrar un color desde el panel
  // deja huérfano cualquier nombre que lo mencionara. Si eso vacía la lista, el cliente
  // se queda sin ningún círculo que tocar y no puede terminar de personalizar: peor que
  // ver un color de más. Ante una configuración rota, se muestra todo.
  return filtrada.length > 0 ? filtrada : todos;
}
