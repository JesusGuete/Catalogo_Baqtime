// La copia de cada pedido nuevo para la tienda: el correo que le llega a la dueña apenas
// alguien hace un pedido, para que no dependa de abrir el panel para enterarse.
//
// Función pura, sin red ni secretos, con el mismo marco que los correos al cliente.
//
// A DIFERENCIA DE LOS CORREOS AL CLIENTE, ESTE SÍ LLEVA EL DOCUMENTO Y EL TELÉFONO: va a quien
// atiende el pedido y los necesita (el documento lo pide la transportadora fuera de
// Barranquilla). Por la misma razón no se manda nunca a una dirección que escribió el cliente:
// el destino lo fija la configuración de la tienda (ver destinoCopiaPedidos() en correo.ts).
//
// EL "RESPONDER A" ES EL CLIENTE. correo.ts lo fija así para este correo: si la dueña pulsa
// "Responder" le escribe directo a quien hizo el pedido, sin tener que copiar su dirección.
// El pie lo avisa para que nadie conteste a la ligera.

import type { OrderPublicItem } from "../types/database";
import { fmt } from "./pricing.js";
import {
  C,
  MONO,
  SANS,
  bloqueNumeroPedido,
  detalleItem,
  envolverCorreo,
  esc,
  type CorreoArmado,
} from "./correo-pedido";

export interface DatosCorreoTienda {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_doc: string | null;
  ship_city: string;
  ship_address: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  items: OrderPublicItem[];
  /** Enlace al panel de administración, absoluto. */
  panel: string;
}

/** Abre el chat de WhatsApp con el cliente. Solo si el teléfono es de 10 dígitos (el formulario lo exige). */
export function whatsappDelCliente(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, "");
  return /^\d{10}$/.test(digitos) ? `https://wa.me/57${digitos}` : null;
}

function fila(etiqueta: string, valorHtml: string): string {
  return `
                <tr>
                  <td style="padding:7px 12px 7px 0;font-family:${MONO};font-size:10px;letter-spacing:1.5px;color:${C.inkSoft};vertical-align:top;white-space:nowrap;">${esc(etiqueta)}</td>
                  <td style="padding:7px 0;font-family:${SANS};font-size:14px;color:${C.ink};line-height:1.45;">${valorHtml}</td>
                </tr>`;
}

export function armarCorreoTienda(p: DatosCorreoTienda): CorreoArmado {
  const wa = whatsappDelCliente(p.customer_phone);
  const telefonoHtml = wa
    ? `${esc(p.customer_phone)} · <a href="${esc(wa)}" style="color:${C.ink};">abrir en WhatsApp</a>`
    : esc(p.customer_phone);

  const datos = [
    fila("NOMBRE", esc(p.customer_name)),
    fila("TELÉFONO", telefonoHtml),
    fila("CORREO", esc(p.customer_email)),
    ...(p.customer_doc ? [fila("DOCUMENTO", esc(p.customer_doc))] : []),
    fila("CIUDAD", esc(p.ship_city)),
    fila("DIRECCIÓN", esc(p.ship_address)),
  ].join("");

  // Una tarjeta por producto, con las iniciales bordadas en una pastilla gris: es lo que se
  // produce a mano y lo que más conviene revisar. Mismo estilo que los correos al cliente.
  const productos = p.items
    .map((it) => {
      const detalle = detalleItem(it);
      return `
                <tr>
                  <td style="padding:5px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.suave};border-radius:12px;">
                      <tr>
                        <td style="padding:13px 14px;font-family:${SANS};font-size:14px;font-weight:bold;color:${C.ink};">${esc(it.product_name)}${
                          detalle
                            ? `<div style="margin-top:5px;"><span style="display:inline-block;background:${C.pastilla};color:${C.inkSoft};font-size:11px;font-weight:normal;padding:3px 9px;border-radius:10px;">${esc(detalle)}</span></div>`
                            : ""
                        }</td>
                        <td align="right" style="padding:13px 14px;font-family:${SANS};font-size:14px;color:${C.ink};white-space:nowrap;vertical-align:top;">${esc(fmt(it.line_total))}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
    })
    .join("");

  const linea = (etiqueta: string, valor: number) => `
                <tr>
                  <td style="padding:4px 2px;font-family:${SANS};font-size:13px;color:${C.inkSoft};">${etiqueta}</td>
                  <td align="right" style="padding:4px 2px;font-family:${SANS};font-size:13px;color:${C.inkSoft};white-space:nowrap;">${esc(fmt(valor))}</td>
                </tr>`;

  const contenido = `              <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:2px;color:${C.inkSoft};">AVISO DE LA TIENDA</p>
              <h1 style="margin:0 0 8px;font-family:${SANS};font-size:26px;line-height:1.2;font-weight:bold;color:${C.ink};">Llegó un pedido nuevo</h1>
              <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.inkSoft};">
                Pendiente de pago. Total ${esc(fmt(p.total))}.
              </p>
${bloqueNumeroPedido(p.order_number, { etiqueta: "NUEVO PEDIDO" })}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;background:${C.suave};border:1px solid ${C.line};border-radius:12px;">
                <tr>
                  <td style="padding:12px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${datos}
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">${productos}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">${linea("Subtotal", p.subtotal)}${linea("Envío", p.shipping_cost)}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;background:${C.suave};border:1px solid ${C.line};border-radius:12px;">
                <tr>
                  <td style="padding:16px;font-family:${SANS};font-size:13px;color:${C.inkSoft};">Total</td>
                  <td align="right" style="padding:16px;font-family:${SANS};font-size:24px;font-weight:bold;color:${C.ink};white-space:nowrap;">${esc(fmt(p.total))}</td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 28px;">
                <tr>
                  <td align="center" style="background:${C.ink};border-radius:30px;">
                    <a href="${esc(p.panel)}" style="display:block;padding:16px;font-family:${SANS};font-size:15px;font-weight:bold;letter-spacing:0.3px;color:${C.blanco};text-decoration:none;">Abrir el panel de pedidos</a>
                  </td>
                </tr>
              </table>`;

  const html = envolverCorreo({
    titulo: `Nuevo pedido ${p.order_number}`,
    bandeja: `${p.customer_name} · ${p.ship_city} · ${fmt(p.total)}`,
    contenido,
    pie: `Aviso interno de la tienda. Si respondes este correo, le escribes directamente al cliente (${esc(p.customer_email)}).`,
  });

  const lineas = p.items.map((it) => {
    const detalle = detalleItem(it);
    return `- ${it.product_name}${detalle ? ` (${detalle})` : ""}: ${fmt(it.line_total)}`;
  });

  const texto = [
    `NUEVO PEDIDO ${p.order_number} — pendiente de pago`,
    ``,
    `Nombre: ${p.customer_name}`,
    `Teléfono: ${p.customer_phone}${wa ? ` (${wa})` : ""}`,
    `Correo: ${p.customer_email}`,
    ...(p.customer_doc ? [`Documento: ${p.customer_doc}`] : []),
    `Ciudad: ${p.ship_city}`,
    `Dirección: ${p.ship_address}`,
    ``,
    ...lineas,
    ``,
    `Subtotal: ${fmt(p.subtotal)}`,
    `Envío: ${fmt(p.shipping_cost)}`,
    `Total: ${fmt(p.total)}`,
    ``,
    `Panel: ${p.panel}`,
    ``,
    `--`,
    `Aviso interno de la tienda. Si respondes este correo, le escribes directamente al cliente (${p.customer_email}).`,
  ].join("\n");

  return {
    asunto: `Nuevo pedido ${p.order_number} · ${fmt(p.total)}`,
    html,
    texto,
  };
}

export interface DatosPagoTienda {
  order_number: string;
  customer_name: string;
  total: number;
  /** "Nequi", "tarjeta"… o null si Wompi no dijo con qué se pagó. */
  metodo: string | null;
  /** Enlace al panel de administración, absoluto. */
  panel: string;
}

/**
 * El aviso de que un pedido se pagó en línea. Lo manda el servidor cuando Wompi aprueba el
 * pago (src/lib/pagos.ts), para que la dueña sepa que puede mandarlo a producción sin tener
 * que estar mirando el panel.
 *
 * Corto a propósito: el detalle del pedido ya le llegó en la copia de "Llegó un pedido nuevo".
 * Este solo dice qué cambió.
 */
export function armarCorreoPagoTienda(p: DatosPagoTienda): CorreoArmado {
  const como = p.metodo ? ` con ${p.metodo}` : " en línea";

  const contenido = `              <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:2px;color:${C.inkSoft};">AVISO DE LA TIENDA</p>
              <h1 style="margin:0 0 8px;font-family:${SANS};font-size:26px;line-height:1.2;font-weight:bold;color:${C.ink};">Pago recibido</h1>
              <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.inkSoft};">
                ${esc(p.customer_name)} pagó ${esc(fmt(p.total))}${esc(como)}. El pedido quedó aprobado: ya puedes mandarlo a producción.
              </p>
${bloqueNumeroPedido(p.order_number, { etiqueta: "PEDIDO PAGADO" })}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 28px;">
                <tr>
                  <td align="center" style="background:${C.ink};border-radius:30px;">
                    <a href="${esc(p.panel)}" style="display:block;padding:16px;font-family:${SANS};font-size:15px;font-weight:bold;letter-spacing:0.3px;color:${C.blanco};text-decoration:none;">Abrir el panel de pedidos</a>
                  </td>
                </tr>
              </table>`;

  const html = envolverCorreo({
    titulo: `Pago recibido ${p.order_number}`,
    bandeja: `${p.customer_name} pagó ${fmt(p.total)}${como}.`,
    contenido,
    pie: "Aviso interno de la tienda. El pago lo confirmó Wompi; no hace falta marcarlo en el panel.",
  });

  const texto = [
    `PAGO RECIBIDO ${p.order_number}`,
    ``,
    `${p.customer_name} pagó ${fmt(p.total)}${como}. El pedido quedó aprobado: ya puedes mandarlo a producción.`,
    ``,
    `Panel: ${p.panel}`,
    ``,
    `--`,
    `Aviso interno de la tienda. El pago lo confirmó Wompi; no hace falta marcarlo en el panel.`,
  ].join("\n");

  return {
    asunto: `Pago recibido ${p.order_number} · ${fmt(p.total)}`,
    html,
    texto,
  };
}
