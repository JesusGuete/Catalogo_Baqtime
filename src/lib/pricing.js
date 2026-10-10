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
 * LA COMISIÓN DE WOMPI, plan "Avanzado Agregador": 2,65 % + $700 por transacción exitosa, más
 * IVA sobre esa comisión. Es la misma para todos los medios en línea (tarjetas, PSE, Nequi…).
 * Si algún día se cambia de plan, se cambia esto y nada más.
 *
 * Los precios se suben para que la cubran (docs/plan-precios-con-comision.md):
 *   * el PORCENTAJE va en el precio de cada producto (ya está en la base, migración 028);
 *   * la parte FIJA va en el envío, porque Wompi la cobra una vez por pedido y cada pedido
 *     tiene exactamente un envío. Puesta en cada producto, un pedido de tres bolsos la pagaría
 *     tres veces.
 * Con eso, en cualquier pedido: lo que paga el cliente − la comisión ≥ lo que se cobraba antes.
 */
export const COMISION_WOMPI = { porcentaje: 0.0265, fijo: 700, iva: 0.19 };

/** La parte proporcional de la comisión, con su IVA: 3,1535 % de lo que se cobra. */
const PROPORCION = COMISION_WOMPI.porcentaje * (1 + COMISION_WOMPI.iva);
/** La parte fija de la comisión, con su IVA: $833 por pedido. */
const FIJO = COMISION_WOMPI.fijo * (1 + COMISION_WOMPI.iva);

/**
 * Siempre hacia arriba, para que el redondeo nunca deje la comisión sin cubrir. El margen
 * descuenta el error de los decimales: sin él, un 124000.0000001 subiría a 125.000.
 */
function redondearArriba(valor, paso) {
  return Math.ceil(valor / paso - 1e-9) * paso;
}

/**
 * La tarifa de envío que paga el cliente: lo que cobra la transportadora más la comisión
 * completa (la parte fija y el porcentaje sobre todo eso), redondeado a la centena.
 * $10.000 → $11.200.
 *
 * @param {number} tarifa pesos enteros, lo que cotizó la transportadora
 */
export function envioConComision(tarifa) {
  return redondearArriba((tarifa + FIJO) / (1 - PROPORCION), 100);
}

/**
 * Un cargo que se suma a un envío ya cobrado (el bolso adicional): solo el porcentaje, porque la
 * parte fija ya la cubrió el envío. Redondeado a la centena. $4.000 → $4.200.
 *
 * @param {number} cargo pesos enteros
 */
export function cargoEnvioConComision(cargo) {
  return redondearArriba(cargo / (1 - PROPORCION), 100);
}

/**
 * Lo que queda de un precio de producto (o de un recargo) después del porcentaje de Wompi. Es
 * lo que el panel muestra junto a cada precio: "Con Wompi recibes ≈ $120.090". La parte fija no
 * se descuenta acá porque la paga el envío.
 *
 * @param {number} precio pesos enteros
 */
export function recibesConWompi(precio) {
  return Math.floor(precio * (1 - PROPORCION));
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
