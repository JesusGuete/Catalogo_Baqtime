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
import { C, MONO, SANS, detalleItem, envolverCorreo, esc, type CorreoArmado } from "./correo-pedido";

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
                  <td style="padding:7px 12px 7px 0;font-family:${MONO};font-size:10px;letter-spacing:1.5px;color:${C.draftText};vertical-align:top;white-space:nowrap;">${esc(etiqueta)}</td>
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

  const productos = p.items
    .map((it) => {
      const detalle = detalleItem(it);
      return `
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14px;color:${C.ink};">
                    ${esc(it.product_name)}
                    ${detalle ? `<div style="font-size:12px;color:${C.inkSoft};margin-top:3px;">${esc(detalle)}</div>` : ""}
                  </td>
                  <td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid ${C.line};font-family:${SANS};font-size:14px;color:${C.ink};white-space:nowrap;vertical-align:top;">${esc(fmt(it.line_total))}</td>
                </tr>`;
    })
    .join("");

  const total = (etiqueta: string, valor: number, final = false) => `
                <tr>
                  <td style="padding:${final ? "12px" : "8px"} 0 0;font-family:${SANS};font-size:${final ? "15px" : "13px"};color:${final ? C.ink : C.inkSoft};${final ? "font-weight:bold;" : ""}">${etiqueta}</td>
                  <td align="right" style="padding:${final ? "12px" : "8px"} 0 0 12px;font-family:${SANS};font-size:${final ? "15px" : "13px"};color:${final ? C.ink : C.inkSoft};white-space:nowrap;${final ? "font-weight:bold;" : ""}">${esc(fmt(valor))}</td>
                </tr>`;

  const contenido = `              <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:2px;color:#B68234;">NUEVO PEDIDO</p>
              <h1 style="margin:0 0 6px;font-family:${MONO};font-size:26px;letter-spacing:2px;line-height:1.15;font-weight:normal;color:${C.ink};">${esc(p.order_number)}</h1>
              <p style="margin:0 0 22px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.inkSoft};">
                Pendiente de pago. Total ${esc(fmt(p.total))}.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.draftBg};border:1px solid ${C.draftBorder};">
                <tr>
                  <td style="padding:12px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${datos}
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">${productos}
${total("Subtotal", p.subtotal)}
${total("Envío", p.shipping_cost)}
                <tr><td colspan="2" style="padding-top:12px;border-bottom:1px solid ${C.ink};font-size:0;line-height:0;">&nbsp;</td></tr>
${total("Total", p.total, true)}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 28px;">
                <tr>
                  <td align="center" style="background:${C.ink};">
                    <a href="${esc(p.panel)}" style="display:block;padding:15px;font-family:${SANS};font-size:14px;letter-spacing:0.5px;color:${C.cream};text-decoration:none;">Abrir el panel de pedidos</a>
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
