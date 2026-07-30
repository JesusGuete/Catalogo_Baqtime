// Portado desde assets/js/site/pricing.js.
// NOTA: se omiten ADVANCE / getAdvance() a propósito. Solo los usaba
// whatsapp-order.js (el flujo viejo de "un solo producto"), que ya está muerto
// —deuda D1 del plan— y el checklist §8 exige el mensaje de WhatsApp
// "sin mención de anticipo". El flujo de carrito nunca los usó.
export const PRICE_SHIP = 10000;
export const PRICE_EXTRA_INITIALS = 10000; // solo Tote, a partir de la 4a inicial

export function fmt(n) {
  return "$" + n.toLocaleString("es-CO");
}
