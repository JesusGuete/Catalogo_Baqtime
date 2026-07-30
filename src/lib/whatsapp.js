// Portado LITERALMENTE desde assets/js/site/cart.js (formatCartItemLines +
// sendCartWhatsapp). El criterio de aceptación de la Fase 3 del plan exige que el
// mensaje generado sea idéntico al actual, comparado carácter por carácter —
// por eso aquí no se "mejora" ni se reordena nada.
//
// Sin mención de anticipo (requisito explícito del checklist §8).
import { PRICE_SHIP, fmt } from "./pricing.js";

export const WHATSAPP_NUMBER = "573134954478";

function formatCartItemLines(item, idx) {
  const initialsLine = `• Iniciales: ${item.initials || "(sin iniciales)"}`;
  const initialsColorLine = item.initialsColorName
    ? `• Color de las iniciales: ${item.initialsColorName}`
    : null;
  let lines;
  if (item.category === "tote") {
    lines = [
      `• Producto: Tote Bag personalizado`,
      `• Color del bolso: ${item.color}`,
      `• Color de los cordones: ${(item.variant || "").replace("Cordones ", "")}`,
      initialsLine,
      initialsColorLine,
    ];
  } else if (item.category === "tote-luxury") {
    lines = [`• Producto: Tote Bag Luxury`, `• Color: ${item.color}`, initialsLine, initialsColorLine];
  } else if (item.category === "neceser") {
    lines = [`• Producto: Neceser`, `• Color / modelo: ${item.color}`, initialsLine, initialsColorLine];
  } else if (item.category === "cosmetiquera") {
    lines = [`• Producto: Cosmetiquera`, `• Color: ${item.color}`, initialsLine, initialsColorLine];
  } else if (item.category === "makeup-bag") {
    lines = [`• Producto: Makeup Bag`, `• Color: ${item.color}`, initialsLine, initialsColorLine];
  } else {
    lines = [`• Producto: Bag Lumiere`, `• Color / modelo: ${item.color}`];
  }
  return [
    `Producto ${idx + 1} — ${item.name}:`,
    ...lines.filter(Boolean),
    item.extra ? `• Personalización adicional: ${fmt(item.extra)}` : null,
    `• Valor: ${fmt(item.price + item.extra)}`,
  ].filter(Boolean);
}

export function buildCartMessage(cart, shipping, subtotal) {
  const productBlocks = cart.map((item, idx) => formatCartItemLines(item, idx).join("\n"));

  return [
    `¡Hola! Quiero agendar un pedido en Baqtime (${cart.length} producto${cart.length > 1 ? "s" : ""})`,
    ``,
    `DETALLES DE MI PEDIDO:`,
    ``,
    productBlocks.join("\n\n"),
    ``,
    `VALOR DEL PEDIDO:`,
    `• Subtotal productos: ${fmt(subtotal)}`,
    `• Envío: ${fmt(PRICE_SHIP)}`,
    `• Total: ${fmt(subtotal + PRICE_SHIP)}`,
    ``,
    `DATOS PARA EL ENVÍO:`,
    `• Nombre: ${shipping.name.trim()}`,
    `• Ciudad: ${shipping.city.trim()}`,
    `• Dirección: ${shipping.address.trim()}`,
    `• Teléfono: ${shipping.phone.trim()}`,
    shipping.doc.trim() ? `• Documento: ${shipping.doc.trim()}` : null,
    ``,
    `Quiero reservar estos productos. ¿Me comparten los medios de pago para confirmar mi pedido?`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function whatsappUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
