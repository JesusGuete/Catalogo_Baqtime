// Portado desde assets/js/site/pricing.js.
// NOTA: se omiten ADVANCE / getAdvance() a propósito. Solo los usaba
// whatsapp-order.js (el flujo viejo de "un solo producto"), que ya está muerto
// —deuda D1 del plan— y el checklist §8 exige el mensaje de WhatsApp
// "sin mención de anticipo". El flujo de carrito nunca los usó.
export const PRICE_SHIP = 10000;

export function fmt(n) {
  return "$" + n.toLocaleString("es-CO");
}

/**
 * Recargo por iniciales bordadas, leído de la CATEGORÍA.
 *
 * Antes esto era `category === "tote" && count > 3 ? 10000 : 0`, escrito a mano en
 * ProductView. Las reglas reales viven en la base desde 008_category_rules.sql
 * (`free_initials`, `extra_initials_price`) y se editan desde el panel — pero la tienda
 * seguía con la constante, así que cambiar el recargo desde el panel no movía el precio
 * que veía el cliente.
 *
 * Ahora esta función es la ÚNICA definición del recargo y la usan los dos lados: la
 * tienda para mostrar el precio y el endpoint del servidor para calcular lo que se cobra.
 * Que sean la misma función no es prolijidad: si difirieran, el cliente vería un total y
 * se guardaría otro.
 *
 * El recargo es único (no por inicial): "de 1 a `free_initials` van sin costo, de ahí en
 * adelante suma `extra_initials_price` una sola vez" — el mismo texto que el panel le
 * muestra al dueño en CategoriesView.
 *
 * @param {import("../types/database").Category | undefined | null} categoria
 * @param {number} cantidadIniciales
 * @returns {number} pesos enteros
 */
export function recargoIniciales(categoria, cantidadIniciales) {
  if (!categoria || !cantidadIniciales) return 0;
  if (categoria.extra_initials_price <= 0) return 0;
  return cantidadIniciales > categoria.free_initials ? categoria.extra_initials_price : 0;
}
