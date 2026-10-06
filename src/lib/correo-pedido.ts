// El correo "Recibimos tu pedido": asunto, HTML y texto plano.
//
// Funciones puras, sin red ni secretos: arman el mensaje y nada más. Quién lo manda y
// cómo vive en src/lib/correo.ts. Separarlos permite mirar la plantilla sin un proveedor
// de correo configurado, y cambiar de proveedor sin tocar la plantilla.
//
// POR QUÉ TABLAS Y ESTILOS EN LÍNEA: es lo único que Gmail, Outlook y el correo del iPhone
// muestran igual. Nada de <style>, flex ni variables CSS — Outlook las ignora. Los colores
// son los de tokens.css copiados a mano por esa misma razón; si la paleta cambia, hay que
// cambiarlos también acá.
//
// LO QUE EL CORREO NO LLEVA, A PROPÓSITO: el número de documento. Si el cliente escribió
// mal su correo, el mensaje le llega a un desconocido — mejor que no lleve el dato más
// sensible. La dirección sí va: es lo que más conviene que el cliente revise antes de que
// salga el paquete. Decisión tomada en la propuesta del 2026-10-06.

import type { OrderPublicItem } from "../types/database";
import { fmt } from "./pricing.js";
import { buildOrderMessage, whatsappUrl } from "./whatsapp.js";

export interface DatosCorreoPedido {
  order_number: string;
  customer_name: string;
  ship_city: string;
  ship_address: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  items: OrderPublicItem[];
  /** Enlace privado de seguimiento, absoluto: el correo se abre lejos de la tienda. */
  seguimiento: string;
}

export interface CorreoArmado {
  asunto: string;
  html: string;
  texto: string;
}

// tokens.css
const C = {
  ink: "#26221D",
  inkSoft: "#6b6259",
  cream: "#F2F2F2",
  line: "#E2DED8",
  draftBg: "#FDFAF4",
  draftBorder: "#E8D9BC",
  draftText: "#8a6420",
  blanco: "#FFFFFF",
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Helvetica, Arial, sans-serif";
const MONO = "'Courier New', Courier, monospace";

/**
 * Todo lo que escribió el cliente pasa por acá antes de entrar al HTML. La dirección es
 * texto libre: sin esto, alguien podría meter etiquetas y cambiar lo que dice el correo
 * que sale firmado por Baqtime.
 */
function esc(texto: string | null | undefined): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** El primer nombre, como en la página de gracias: "¡Gracias, Laura!". */
function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

/**
 * Lo que distingue a un artículo de otro, en el mismo orden que el mensaje de WhatsApp:
 * la variante (que no está en el nombre) y las iniciales bordadas, que son lo que se
 * produce a mano y lo que más conviene que el cliente revise.
 */
function detalleItem(it: OrderPublicItem): string {
  const partes: string[] = [];
  if (it.variant) partes.push(it.variant);
  if (it.initials) {
    partes.push(
      it.initials_color
        ? `Iniciales “${it.initials}” en ${it.initials_color}`
        : `Iniciales “${it.initials}”`
    );
  }
  if (it.quantity > 1) partes.push(`Cantidad: ${it.quantity}`);
  return partes.join(" · ");
}

/**
 * @param puedeResponder Si hay una dirección de respuesta configurada. Sin ella, decirle
 *   al cliente "responde a este correo" lo mandaría a escribirle a un buzón que nadie lee.
 */
export function armarCorreoPedido(p: DatosCorreoPedido, puedeResponder: boolean): CorreoArmado {
  const asunto = `Recibimos tu pedido ${p.order_number}`;
  const enlaceWhatsapp = whatsappUrl(buildOrderMessage(p));
  const nombre = primerNombre(p.customer_name);
  const ayuda = puedeResponder
    ? "Si tienes dudas, responde a este correo o escríbenos por WhatsApp."
    : "Si tienes dudas, escríbenos por WhatsApp.";
  const aviso24h =
    "Recuerda confirmar el pago en las próximas 24 horas. Pasado ese tiempo, el pedido queda como no confirmado.";

  const filasItems = p.items
    .map((it) => {
      const detalle = detalleItem(it);
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14px;color:${C.ink};">
            ${esc(it.product_name)}
            ${detalle ? `<div style="font-size:12px;color:${C.inkSoft};margin-top:3px;">${esc(detalle)}</div>` : ""}
          </td>
          <td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14px;color:${C.ink};white-space:nowrap;vertical-align:top;">
            ${esc(fmt(it.line_total))}
          </td>
        </tr>`;
    })
    .join("");

  const filaTotal = (etiqueta: string, valor: number, final = false) => `
        <tr>
          <td style="padding:${final ? "12px" : "8px"} 0 0;font-family:${SANS};font-size:${final ? "15px" : "13px"};color:${final ? C.ink : C.inkSoft};${final ? "font-weight:bold;" : ""}">${etiqueta}</td>
          <td align="right" style="padding:${final ? "12px" : "8px"} 0 0 12px;font-family:${SANS};font-size:${final ? "15px" : "13px"};color:${final ? C.ink : C.inkSoft};white-space:nowrap;${final ? "font-weight:bold;" : ""}">${esc(fmt(valor))}</td>
        </tr>`;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};">
  <!-- Lo que muestra la bandeja de entrada junto al asunto, antes de abrir el correo. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Pedido ${esc(p.order_number)} · Total ${esc(fmt(p.total))}. El siguiente paso es confirmar el pago por WhatsApp.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.blanco};border:1px solid ${C.line};">
          <tr>
            <td align="center" style="background:${C.ink};padding:22px 24px;font-family:${MONO};font-size:15px;letter-spacing:8px;color:${C.blanco};">
              BAQTIME
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;">
              <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:2px;color:#B68234;">PEDIDO REGISTRADO</p>
              <h1 style="margin:0 0 8px;font-family:${SERIF};font-size:28px;line-height:1.15;font-weight:bold;color:${C.ink};">¡Gracias, ${esc(nombre)}!</h1>
              <p style="margin:0 0 24px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.inkSoft};">
                Tu pedido quedó guardado. El siguiente paso es coordinar el pago por WhatsApp.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.draftBg};border:1px solid ${C.draftBorder};">
                <tr>
                  <td style="padding:16px 20px;">
                    <div style="font-family:${MONO};font-size:10px;letter-spacing:2px;color:${C.draftText};">TU NÚMERO DE PEDIDO</div>
                    <div style="font-family:${MONO};font-size:28px;letter-spacing:2px;color:${C.ink};margin-top:6px;">${esc(p.order_number)}</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                ${filasItems}
                ${filaTotal("Subtotal", p.subtotal)}
                ${filaTotal("Envío", p.shipping_cost)}
                <tr><td colspan="2" style="padding-top:12px;border-bottom:1px solid ${C.ink};font-size:0;line-height:0;">&nbsp;</td></tr>
                ${filaTotal("Total a pagar", p.total, true)}
              </table>

              <p style="margin:20px 0 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.inkSoft};">
                <strong style="color:${C.ink};">Se envía a:</strong> ${esc(p.ship_city)} · ${esc(p.ship_address)}
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
                <tr>
                  <td align="center" style="background:${C.ink};">
                    <a href="${esc(enlaceWhatsapp)}" style="display:block;padding:15px;font-family:${SANS};font-size:14px;letter-spacing:0.5px;color:${C.cream};text-decoration:none;">Confirmar pago por WhatsApp</a>
                  </td>
                </tr>
                <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
                <tr>
                  <td align="center" style="border:1px solid ${C.ink};">
                    <a href="${esc(p.seguimiento)}" style="display:block;padding:14px;font-family:${SANS};font-size:14px;letter-spacing:0.5px;color:${C.ink};text-decoration:none;">Ver el estado de mi pedido</a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 28px;font-family:${SANS};font-size:12px;line-height:1.55;color:${C.inkSoft};">
                ${aviso24h}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid ${C.line};font-family:${SANS};font-size:11px;line-height:1.55;color:${C.inkSoft};">
              Recibes este correo porque hiciste un pedido en baqtime.store. ${ayuda}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // La versión en texto plano no es un adorno: hay clientes de correo que solo muestran
  // esta, y que falte es una de las señales que usan los filtros de spam.
  const lineasItems = p.items.map((it) => {
    const detalle = detalleItem(it);
    return `- ${it.product_name}${detalle ? ` (${detalle})` : ""}: ${fmt(it.line_total)}`;
  });

  const texto = [
    `¡Gracias, ${nombre}!`,
    ``,
    `Tu pedido quedó guardado. El siguiente paso es coordinar el pago por WhatsApp.`,
    ``,
    `TU NÚMERO DE PEDIDO: ${p.order_number}`,
    ``,
    ...lineasItems,
    ``,
    `Subtotal: ${fmt(p.subtotal)}`,
    `Envío: ${fmt(p.shipping_cost)}`,
    `Total a pagar: ${fmt(p.total)}`,
    ``,
    `Se envía a: ${p.ship_city} · ${p.ship_address}`,
    ``,
    `Confirmar pago por WhatsApp: ${enlaceWhatsapp}`,
    `Ver el estado de mi pedido: ${p.seguimiento}`,
    ``,
    aviso24h,
    ``,
    `--`,
    `Recibes este correo porque hiciste un pedido en baqtime.store. ${ayuda}`,
  ].join("\n");

  return { asunto, html, texto };
}
