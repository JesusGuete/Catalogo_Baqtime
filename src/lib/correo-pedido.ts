// El correo "Recibimos tu pedido": asunto, HTML y texto plano. Y las piezas de diseño que
// comparten TODOS los correos de la tienda (marco, número de pedido, progreso, botones).
//
// Funciones puras, sin red ni secretos: arman el mensaje y nada más. Quién lo manda y
// cómo vive en src/lib/correo.ts. Separarlos permite mirar la plantilla sin un proveedor
// de correo configurado, y cambiar de proveedor sin tocar la plantilla.
//
// POR QUÉ TABLAS Y ESTILOS EN LÍNEA: es lo único que Gmail, Outlook y el correo del iPhone
// muestran igual. Nada de <style>, flex ni variables CSS — Outlook las ignora. Los colores
// son los de tokens.css copiados a mano por esa misma razón; si la paleta cambia, hay que
// cambiarlos también acá. Las esquinas redondeadas (border-radius) las respetan Gmail y el
// correo del iPhone; Outlook de escritorio las ignora y muestra esquinas rectas, sin romper nada.
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

/** Blanco, negro y grises neutros: sin tinte cálido ni colores de acento. */
export const C = {
  /** El negro de los títulos, del bloque del número y de los botones. */
  ink: "#111111",
  /** Texto secundario. */
  inkSoft: "#666666",
  /** El fondo de la página de la tienda (--cream de tokens.css): detrás de la tarjeta y en el bloque del número. */
  cream: "#F2F2F2",
  /** Líneas finas y bordes. */
  line: "#E6E6E6",
  /** Fondo de las tarjetas de producto, de datos y del total. */
  suave: "#F7F7F7",
  /** Lo que todavía no pasó (pasos pendientes). */
  apagado: "#B3B3B3",
  apagadoBorde: "#D6D6D6",
  /** Fondo de las "pastillas" con las iniciales bordadas. */
  pastilla: "#ECECEC",
  blanco: "#FFFFFF",
};

/**
 * El logo de la tienda, en su dirección pública. Tiene que ser ABSOLUTA: el correo se abre en
 * el programa de correo del cliente, lejos de baqtime.store, y una ruta relativa no resuelve.
 * Es el mismo archivo que usa el encabezado de la tienda (998x297, PNG con fondo transparente).
 * Si el programa de correo bloquea las imágenes, se ve el texto del `alt` ("BAQTIME").
 */
export const LOGO_URL = "https://baqtime.store/assets/img/logo.png";
const LOGO_ANCHO = 150;

export const SERIF = "Georgia, 'Times New Roman', serif";
export const SANS = "Helvetica, Arial, sans-serif";
export const MONO = "'Courier New', Courier, monospace";

/**
 * Todo lo que escribió el cliente pasa por acá antes de entrar al HTML. La dirección es
 * texto libre: sin esto, alguien podría meter etiquetas y cambiar lo que dice el correo
 * que sale firmado por Baqtime.
 */
export function esc(texto: string | null | undefined): string {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * El marco común de todos los correos de Baqtime: logo, tarjeta blanca redondeada y pie.
 *
 * `contenido` y `pie` son HTML ya armado y se insertan tal cual: quien llama escapa lo que
 * escribió el cliente (ver esc()). `titulo` y `bandeja` son texto plano y se escapan acá.
 * `bandeja` es lo que la bandeja de entrada muestra junto al asunto antes de abrir el correo.
 */
export function envolverCorreo(o: {
  titulo: string;
  bandeja: string;
  contenido: string;
  pie: string;
}): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(o.titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};">
  <!-- Lo que muestra la bandeja de entrada junto al asunto, antes de abrir el correo. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${esc(o.bandeja)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.blanco};border:1px solid ${C.line};border-radius:18px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:30px 24px 4px;font-family:${MONO};font-size:15px;letter-spacing:8px;color:${C.ink};">
              <img src="${LOGO_URL}" alt="BAQTIME" width="${LOGO_ANCHO}" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:${LOGO_ANCHO}px;max-width:100%;height:auto;font-family:${MONO};font-size:15px;letter-spacing:8px;color:${C.ink};">
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 8px;">
${o.contenido}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 28px 26px;border-top:1px solid ${C.line};font-family:${SANS};font-size:11px;line-height:1.55;color:${C.inkSoft};">
              ${o.pie}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** El primer nombre, como en la página de gracias: "¡Gracias, Laura!". */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? "";
}

/**
 * Lo que distingue a un artículo de otro, en el mismo orden que el mensaje de WhatsApp:
 * la variante (que no está en el nombre) y las iniciales bordadas, que son lo que se
 * produce a mano y lo que más conviene que el cliente revise.
 */
export function detalleItem(it: OrderPublicItem): string {
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

// ============================================================================
// Piezas de diseño compartidas
// ============================================================================

/**
 * EL NÚMERO DE PEDIDO, EN GRANDE. Es lo único que el cliente necesita recordar para consultar
 * su pedido, y en el diseño anterior se perdía dentro de una caja pequeña. Va en un bloque del
 * color de fondo de la tienda, con el número en negro y en letra grande. Se probó en negro sólido
 * y se veía como un parche pegado sobre la tarjeta blanca.
 *
 * @param pista Una línea pequeña debajo del número, solo en el correo donde el cliente lo recibe
 *   por primera vez.
 */
export function bloqueNumeroPedido(
  numero: string,
  opciones: { etiqueta?: string; pista?: string } = {}
): string {
  const { etiqueta = "TU NÚMERO DE PEDIDO", pista } = opciones;
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;background:${C.cream};border-radius:14px;">
                <tr>
                  <td align="center" style="padding:20px 16px;">
                    <div style="font-family:${MONO};font-size:11px;letter-spacing:3px;color:${C.inkSoft};">${esc(etiqueta)}</div>
                    <div style="font-family:${MONO};font-size:34px;font-weight:bold;letter-spacing:3px;line-height:1.15;color:${C.ink};margin-top:8px;">${esc(numero)}</div>${
                      pista
                        ? `
                    <div style="font-family:${SANS};font-size:12px;line-height:1.45;color:${C.inkSoft};margin-top:10px;">${esc(pista)}</div>`
                        : ""
                    }
                  </td>
                </tr>
              </table>`;
}

/**
 * Dónde va el pedido: 1 recibido, 2 pago, 3 producción, 4 envío; 5 = entregado (los cuatro pasos
 * hechos). El paso "actual" va con aro dorado, los anteriores con una marca, los siguientes apagados.
 */
export type PasoPedido = 1 | 2 | 3 | 4 | 5;

const PASOS = ["Pedido recibido", "Pago", "Producción", "Envío"];

export function progresoPedido(paso: PasoPedido): string {
  const celdas = PASOS.map((nombre, i) => {
    const n = i + 1;
    const hecho = n < paso;
    const actual = n === paso;
    const fondo = hecho ? C.ink : C.blanco;
    const borde = hecho || actual ? C.ink : C.apagadoBorde;
    const color = hecho ? C.blanco : actual ? C.ink : C.apagado;
    const etiqueta = paso === 5 && n === 4 ? "Entregado" : nombre;
    return `
                  <td align="center" width="25%" style="vertical-align:top;padding:0 2px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" style="width:30px;height:30px;background:${fondo};border:2px solid ${borde};border-radius:16px;font-family:${SANS};font-size:13px;font-weight:bold;color:${color};">${hecho ? "&#10003;" : n}</td></tr></table>
                    <div style="margin-top:7px;font-family:${SANS};font-size:11px;line-height:1.3;color:${hecho || actual ? C.ink : C.apagado};${actual ? "font-weight:bold;" : ""}">${esc(etiqueta)}</div>
                  </td>`;
  }).join("");
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
                <tr>${celdas}
                </tr>
              </table>`;
}

/** Tarjeta con datos sueltos (transportadora, guía, total…). Sin filas no dibuja nada. */
export function cajaDatos(filas: { etiqueta: string; valor: string; mono?: boolean }[]): string {
  if (!filas.length) return "";
  const celdas = filas
    .map(
      (f, i) => `
                    <div style="font-family:${MONO};font-size:10px;letter-spacing:2px;color:${C.inkSoft};${i ? "margin-top:14px;" : ""}">${esc(f.etiqueta)}</div>
                    <div style="font-family:${f.mono ? MONO : SANS};font-size:${f.mono ? "22px" : "15px"};${f.mono ? "letter-spacing:2px;" : ""}color:${C.ink};margin-top:6px;">${esc(f.valor)}</div>`
    )
    .join("");
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;background:${C.suave};border:1px solid ${C.line};border-radius:12px;">
                <tr>
                  <td style="padding:16px 20px;">${celdas}
                  </td>
                </tr>
              </table>`;
}

function boton(href: string, texto: string, principal: boolean): string {
  return principal
    ? `
                <tr>
                  <td align="center" style="background:${C.ink};border-radius:30px;">
                    <a href="${esc(href)}" style="display:block;padding:16px;font-family:${SANS};font-size:15px;font-weight:bold;letter-spacing:0.3px;color:${C.blanco};text-decoration:none;">${esc(texto)}</a>
                  </td>
                </tr>`
    : `
                <tr>
                  <td align="center" style="border:1px solid ${C.ink};border-radius:30px;">
                    <a href="${esc(href)}" style="display:block;padding:15px;font-family:${SANS};font-size:14px;letter-spacing:0.3px;color:${C.ink};text-decoration:none;">${esc(texto)}</a>
                  </td>
                </tr>`;
}

/** Los botones van en filas separadas por un espacio: Outlook ignora el margin entre tablas. */
export function botonesCorreo(lista: { href: string; texto: string; principal: boolean }[]): string {
  const filas = lista
    .map((b) => boton(b.href, b.texto, b.principal))
    .join(`
                <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>`);
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">${filas}
              </table>`;
}

// ============================================================================
// El correo de confirmación
// ============================================================================

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

  // Una tarjeta por producto; las iniciales bordadas van en una pastilla gris porque son lo que
  // se produce a mano y lo que más conviene que el cliente revise.
  const tarjetasItems = p.items
    .map((it) => {
      const detalle = detalleItem(it);
      return `
                <tr>
                  <td style="padding:5px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.suave};border-radius:12px;">
                      <tr>
                        <td style="padding:13px 14px;font-family:${SANS};font-size:14px;font-weight:bold;color:${C.ink};">
                          ${esc(it.product_name)}${
                            detalle
                              ? `
                          <div style="margin-top:5px;"><span style="display:inline-block;background:${C.pastilla};color:${C.inkSoft};font-size:11px;font-weight:normal;padding:3px 9px;border-radius:10px;">${esc(detalle)}</span></div>`
                              : ""
                          }
                        </td>
                        <td align="right" style="padding:13px 14px;font-family:${SANS};font-size:14px;color:${C.ink};white-space:nowrap;vertical-align:top;">${esc(fmt(it.line_total))}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
    })
    .join("");

  const contenido = `              <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:2px;color:${C.inkSoft};">PEDIDO REGISTRADO</p>
              <h1 style="margin:0 0 8px;font-family:${SANS};font-size:26px;line-height:1.2;font-weight:bold;color:${C.ink};">¡Gracias, ${esc(nombre)}!</h1>
              <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.inkSoft};">
                Tu pedido quedó guardado. El siguiente paso es coordinar el pago por WhatsApp.
              </p>
${bloqueNumeroPedido(p.order_number, { pista: "Guárdalo: con este número consultas el estado de tu pedido." })}
${progresoPedido(2)}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">${tarjetasItems}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
                <tr>
                  <td style="padding:4px 2px;font-family:${SANS};font-size:13px;color:${C.inkSoft};">Subtotal</td>
                  <td align="right" style="padding:4px 2px;font-family:${SANS};font-size:13px;color:${C.inkSoft};white-space:nowrap;">${esc(fmt(p.subtotal))}</td>
                </tr>
                <tr>
                  <td style="padding:4px 2px;font-family:${SANS};font-size:13px;color:${C.inkSoft};">Envío</td>
                  <td align="right" style="padding:4px 2px;font-family:${SANS};font-size:13px;color:${C.inkSoft};white-space:nowrap;">${esc(fmt(p.shipping_cost))}</td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;background:${C.suave};border:1px solid ${C.line};border-radius:12px;">
                <tr>
                  <td style="padding:16px;font-family:${SANS};font-size:13px;color:${C.inkSoft};">Total a pagar</td>
                  <td align="right" style="padding:16px;font-family:${SANS};font-size:24px;font-weight:bold;color:${C.ink};white-space:nowrap;">${esc(fmt(p.total))}</td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.inkSoft};">
                <strong style="color:${C.ink};">Se envía a:</strong> ${esc(p.ship_city)} · ${esc(p.ship_address)}
              </p>
${botonesCorreo([
    { href: enlaceWhatsapp, texto: "Confirmar pago por WhatsApp", principal: true },
    { href: p.seguimiento, texto: "Ver el estado de mi pedido", principal: false },
  ])}
              <p style="margin:20px 0 28px;font-family:${SANS};font-size:12px;line-height:1.55;color:${C.inkSoft};text-align:center;">
                ${aviso24h}
              </p>`;

  const html = envolverCorreo({
    titulo: asunto,
    bandeja: `Pedido ${p.order_number} · Total ${fmt(p.total)}. El siguiente paso es confirmar el pago por WhatsApp.`,
    contenido,
    pie: `Recibes este correo porque hiciste un pedido en baqtime.store. ${ayuda}`,
  });

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
