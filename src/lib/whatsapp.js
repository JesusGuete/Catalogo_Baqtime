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

/**
 * EL MENSAJE QUE MANDA LA DUEÑA, no el cliente. Va al revés que el de arriba.
 *
 * Muchos clientes no entran a la tienda: escriben por WhatsApp diciendo qué bolso les
 * gustó. La respuesta es el enlace de ese producto, y este texto es lo que lo acompaña.
 * Se copia desde el panel (columna MENSAJE en PRODUCTOS) y se pega en el chat.
 *
 * NOMBRA LOS BOTONES TAL COMO SE LEEN EN PANTALLA. Es la diferencia entre que el cliente
 * busque una palabra concreta y que tenga que interpretar una descripción. Si alguno se
 * renombra en la tienda, hay que cambiarlo también acá:
 *   ProductView.jsx   → "Finalizar compra"
 *   Checkout.jsx      → "Confirmar pedido"
 *   pedido/gracias    → "Confirmar pago por WhatsApp"
 *
 * Los asteriscos son la negrita de WhatsApp. Acá SÍ se usan, al contrario que en
 * buildOrderMessage: este texto no lleva ninguna lista con viñetas que se pueda
 * confundir con marcas de formato.
 *
 * @param {{ name: string, variant?: string | null, personalizable: boolean }} producto
 * @param {string} url  La dirección pública de la ficha.
 */
export function buildProductInviteMessage(producto, url) {
  const nombre = producto.variant ? `${producto.name} – ${producto.variant}` : producto.name;

  // Sin iniciales no hay nada que escribir ni ningún color que elegir: ese paso no
  // existe y los demás se corren. Dejarlo igual mandaría a buscar un campo que no está.
  const pasos = producto.personalizable
    ? [
        `1. Escribir y elegir el color de las iniciales.`,
        `2. Tocar *Finalizar compra* llenar sus datos de envío y *Confirmar pedido*.`,
        `3. Luego presionar *Confirmar pago por WhatsApp* y será redirigida a este chat.`,
      ]
    : [
        `1. Tocar *Finalizar compra* llenar sus datos de envío y *Confirmar pedido*.`,
        `2. Luego presionar *Confirmar pago por WhatsApp* y será redirigida a este chat.`,
      ];

  return [`Aquí puedes agendar el ${nombre} 👇`, url, ``, `En ese enlace puedes:`, ...pasos].join(
    "\n"
  );
}
