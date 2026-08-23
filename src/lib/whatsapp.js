// El mensaje de WhatsApp que abre el cliente después de hacer el pedido.
//
// CAMBIÓ DE PROPÓSITO. Antes este archivo armaba el pedido ENTERO dentro del texto: cada
// producto con su color, sus iniciales, el subtotal, el envío y los datos de envío. Ese
// mensaje era la única constancia de la venta, porque el pedido no se guardaba en ningún
// lado.
//
// Ahora el pedido vive en la base (010_orders.sql) y WhatsApp es solo el canal para
// coordinar el pago. El mensaje se reduce a lo que hace falta para eso: qué se compró, qué
// pedido es y cuánto hay que pagar.
//
// Los productos volvieron al mensaje, pero LEÍDOS DEL PEDIDO GUARDADO, no adivinados. La
// versión vieja reconocía las categorías por nombre fijo ("tote", "neceser", …) y cualquier
// categoría creada después desde el panel se anunciaba como "Bag Lumiere", con los datos
// incompletos. Acá se escribe lo que la base devuelve en `items`, así que una categoría
// nueva sale bien sin tocar este archivo.
import { fmt } from "./pricing.js";

export const WHATSAPP_NUMBER = "573505675343";

/**
 * Una línea por producto, con lo que distingue a un artículo de otro: la variante (que no
 * está en el nombre) y las iniciales bordadas (que son la parte que se produce a mano y la
 * que hay que confirmar antes de cobrar). El color no se repite: ya viene dentro de
 * `product_name` ("Tote Bag Beige").
 *
 * La cantidad solo aparece cuando es mayor que uno — decir "×1" en cada línea sería ruido.
 *
 * @param {import("../types/database").OrderPublicItem} it
 */
function describirItem(it) {
  let linea = it.product_name;
  if (it.variant) linea += ` - ${it.variant}`;
  if (it.initials) {
    linea += it.initials_color
      ? ` (${it.initials} en ${it.initials_color})`
      : ` (${it.initials})`;
  }
  if (it.quantity > 1) linea += ` ×${it.quantity}`;
  return linea;
}

/**
 * SIN ENLACE DE SEGUIMIENTO, a propósito. Antes el mensaje llevaba la URL con el token
 * adentro: 60 caracteres de letras y números que ensuciaban el chat. El cliente ahora
 * consulta su pedido desde /pedido con su número y su teléfono, así que en el mensaje
 * alcanza con el número — que además es lo que el dueño necesita leer para atenderlo.
 *
 * Se usa `•` y no `*`: WhatsApp interpreta los asteriscos como marcas de negrita y el
 * mensaje llegaría con formato raro.
 *
 * @param {{ order_number: string, total: number, items?: import("../types/database").OrderPublicItem[] }} pedido
 */
export function buildOrderMessage(pedido) {
  return [
    `¡Hola! Quiero finalizar mi pedido.`,
    ...(pedido.items ?? []).map(describirItem),
    ``,
    `• Pedido: ${pedido.order_number}`,
    `• Total: ${fmt(pedido.total)}`,
    ``,
    `Me comparte los medios de pago para confirmar la compra`,
  ].join("\n");
}

export function whatsappUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
