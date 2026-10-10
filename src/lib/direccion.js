// La dirección de entrega por partes, como la piden las tiendas grandes en Colombia: tipo de
// vía + número + "#" + cruce + "-" + placa ("Calle 15A # 54 - 20"), más un dato adicional
// (apto, casa, torre) y el barrio.
//
// POR QUÉ POR PARTES: con un solo campo de texto llegaban direcciones incompletas —"cra 54
// frente al parque", sin placa— y el pedido se trababa en la transportadora. Con las partes
// separadas, el cliente ve qué falta antes de confirmar.
//
// SE GUARDA ARMADA, como texto, en orders.ship_address: ni la base ni la transportadora
// necesitan las partes sueltas, y así no cambia el esquema ni lo que recibe /api/pedidos.
//
// Las direcciones rurales (vereda, finca, kilómetro de una vía) no tienen ese formato: para
// esas está "Otra", que pide la dirección completa en un solo campo.

export const TIPOS_DE_VIA = [
  "Calle",
  "Carrera",
  "Avenida",
  "Avenida Calle",
  "Avenida Carrera",
  "Diagonal",
  "Transversal",
  "Circular",
  "Autopista",
];

/** Para lo que no encaja en el formato urbano: se escribe completa. */
export const OTRA_VIA = "Otra";

export const DIRECCION_VACIA = {
  via: "",
  numero: "",
  cruce: "",
  placa: "",
  completa: "",
  adicional: "",
  barrio: "",
};

/**
 * Lo que se deja escribir en número, cruce y placa: letras, números y espacios. Cubre "15A",
 * "54 Bis", "20 Sur". Sin "#" ni "-": esos los pone el formato, y escritos a mano quedaban
 * repetidos ("Calle 15 # #54").
 */
export function filtrarParte(valor) {
  return String(valor)
    .replace(/[^A-Za-z0-9ÑñÁÉÍÓÚáéíóú ]/g, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 15);
}

/** "Calle 15A # 54 - 20", o "" mientras falte alguna parte. */
export function viaPrincipal(d) {
  if (d.via === OTRA_VIA) return d.completa.trim();
  const numero = d.numero.trim();
  const cruce = d.cruce.trim();
  const placa = d.placa.trim();
  if (!d.via || !numero || !cruce || !placa) return "";
  return `${d.via} ${numero} # ${cruce} - ${placa}`;
}

/** "Barrio El Prado" escrito por el cliente no puede salir como "Barrio Barrio El Prado". */
function textoBarrio(d) {
  const barrio = d.barrio.trim().replace(/^barrio\s+/i, "");
  return barrio ? `Barrio ${barrio}` : "";
}

/**
 * La dirección completa, tal como se guarda y la ve la transportadora:
 * "Calle 15A # 54 - 20, Apto 101, Barrio El Prado".
 */
export function armarDireccion(d) {
  return [viaPrincipal(d), d.adicional.trim(), textoBarrio(d)].filter(Boolean).join(", ");
}

/**
 * Lo que el cliente lleva escrito, AUNQUE FALTEN PARTES: "Diagonal 32 # 88", y al completar
 * "Diagonal 32 # 88 - 699, Torre 2, Barrio Ternera". Es el resumen que se ve mientras llena el
 * formulario. Si solo apareciera completa, un número puesto en el campo equivocado ("699" en el
 * del #) no se notaría hasta el final.
 */
export function direccionEnCurso(d) {
  let via;
  if (d.via === OTRA_VIA) {
    via = d.completa.trim();
  } else {
    via = [d.via, d.numero.trim()].filter(Boolean).join(" ");
    if (d.cruce.trim()) via += ` # ${d.cruce.trim()}`;
    if (d.placa.trim()) via += ` - ${d.placa.trim()}`;
  }
  return [via, d.adicional.trim(), textoBarrio(d)].filter(Boolean).join(", ");
}

/**
 * Las partes que faltan de la vía principal, en palabras, para avisar bajo el resumen:
 * ["el número después del –"]. Vacío si está completa o si todavía no empezó a escribirla.
 */
export function partesQueFaltan(d) {
  if (!d.via || d.via === OTRA_VIA) return [];
  const empezo = d.numero.trim() || d.cruce.trim() || d.placa.trim();
  if (!empezo) return [];
  const faltan = [];
  if (!d.numero.trim()) faltan.push("el número de la vía");
  if (!d.cruce.trim()) faltan.push("el número después del #");
  if (!d.placa.trim()) faltan.push("el número después del –");
  return faltan;
}

/** Errores por campo, con los mismos nombres de campo. Vacío = la dirección está completa. */
export function validarDireccion(d) {
  const errores = {};
  if (!d.via) {
    errores.via = "Elige el tipo de vía.";
  } else if (d.via === OTRA_VIA) {
    if (d.completa.trim().length < 6) {
      errores.completa =
        "Escribe la dirección completa (por ejemplo: Vereda El Rosal, finca La Esperanza).";
    }
  } else {
    if (!d.numero.trim()) errores.numero = "Falta el número de la vía.";
    if (!d.cruce.trim()) errores.cruce = "Falta el número después del #.";
    if (!d.placa.trim()) errores.placa = "Falta el número de la placa.";
  }
  return errores;
}
