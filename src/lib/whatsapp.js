// El mensaje de WhatsApp que abre el cliente después de hacer el pedido.
//
// CAMBIÓ DE PROPÓSITO. Antes este archivo armaba el pedido ENTERO dentro del texto: cada
// producto con su color, sus iniciales, el subtotal, el envío y los datos de envío. Ese
// mensaje era la única constancia de la venta, porque el pedido no se guardaba en ningún
// lado.
//
// Ahora el pedido vive en la base (010_orders.sql) y WhatsApp es solo el canal para
// coordinar el pago. El mensaje se reduce a lo que hace falta para eso: qué pedido es,
// cuánto hay que pagar, y dónde seguirlo.
//
// De paso desaparece un error latente: la versión anterior reconocía las categorías por
// nombre fijo ("tote", "neceser", …) y cualquier categoría creada después desde el panel
// se anunciaba como "Bag Lumiere", con los datos incompletos. Al no enumerar productos, ya
// no hay nada que reconocer mal.
import { fmt } from "./pricing.js";

export const WHATSAPP_NUMBER = "573134954478";

/**
 * SIN ENLACE DE SEGUIMIENTO, a propósito. Antes el mensaje llevaba la URL con el token
 * adentro: 60 caracteres de letras y números que ensuciaban el chat. El cliente ahora
 * consulta su pedido desde /pedido con su número y su teléfono, así que en el mensaje
 * alcanza con el número — que además es lo que el dueño necesita leer para atenderlo.
 *
 * Se usa `•` y no `*`: WhatsApp interpreta los asteriscos como marcas de negrita y el
 * mensaje llegaría con formato raro.
 *
 * @param {{ order_number: string, total: number }} pedido
 */
export function buildOrderMessage(pedido) {
  return [
    `¡Hola! Acabo de hacer un pedido en Baqtime.`,
    `• Pedido: ${pedido.order_number}`,
    `• Total a pagar: ${fmt(pedido.total)}`,
    ``,
    `Me comparte los medios de pago para confirmar la compra`,
  ].join("\n");
}

export function whatsappUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
