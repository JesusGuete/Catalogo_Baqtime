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

/**
 * Precio VIGENTE de una línea del carrito.
 *
 * El carrito vive en localStorage y guarda el precio del momento en que se agregó el
 * producto. Ese número queda congelado en el navegador del cliente durante días: si el
 * precio cambia, el carrito sigue mostrando el viejo.
 *
 * Antes eso era un error tolerable, porque el precio del carrito era también el que
 * viajaba al mensaje de WhatsApp — equivocado, pero coherente consigo mismo. Ya no: el
 * pedido lo cotiza el servidor contra el catálogo real, así que un carrito con el precio
 * viejo le mostraría al cliente un total y le cobraría otro.
 *
 * Por eso el precio guardado se ignora y se recalcula acá, con la MISMA regla que usa
 * src/pages/api/pedidos.ts. Lo que se ve es lo que se cobra.
 *
 * @param {{productId: string, initials?: string, price?: number, extra?: number}} item
 * @param {import("./catalog").ProductoPublico[]} products
 * @param {import("../types/database").Category[]} categories
 */
export function precioLinea(item, products, categories) {
  const producto = products.find((p) => p.id === item.productId);

  // Producto despublicado: se muestra lo último que se sabía de él y se marca como no
  // disponible, para que el cliente entienda por qué no puede seguir. El endpoint también
  // lo rechaza, pero enterarse en el carrito es mucho mejor que al confirmar.
  if (!producto) {
    const unit = item.price ?? 0;
    const extra = item.extra ?? 0;
    return { unit, extra, total: unit + extra, disponible: false };
  }

  const categoria = categories.find((c) => c.key === producto.category);
  const extra = recargoIniciales(categoria, (item.initials ?? "").length);
  return { unit: producto.price, extra, total: producto.price + extra, disponible: true };
}

/** Subtotal del carrito a precios de hoy. */
export function subtotalCarrito(items, products, categories) {
  return items.reduce((suma, i) => suma + precioLinea(i, products, categories).total, 0);
}
