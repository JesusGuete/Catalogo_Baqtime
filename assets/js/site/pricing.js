export const PRICE_SHIP = 10000;
export const PRICE_EXTRA_INITIALS = 10000; // solo aplica a Tote (más de 3 iniciales)
export const ADVANCE = 70000;
const ADVANCE_NECESER = 30000;
const ADVANCE_COSMETIQUERA = 25000;
const ADVANCE_MAKEUP = 30000;
export const ADVANCE_BY_CATEGORY = { neceser: ADVANCE_NECESER, cosmetiquera: ADVANCE_COSMETIQUERA, "makeup-bag": ADVANCE_MAKEUP };
export function getAdvance(product){ return ADVANCE_BY_CATEGORY[product.category] ?? ADVANCE; }
export function fmt(n){ return "$" + n.toLocaleString("es-CO"); }
