// El recordatorio de pago: un único correo al cliente cuyo pedido sigue sin pago.
//
// Función pura, sin red ni secretos, igual que correo-estado.ts, y armada con el mismo marco
// y la misma estructura (armarDesdeContenido) para que se vea como de la misma casa.
//
// CUÁNDO SALE: a las 12 horas de creado el pedido, y solo una vez (ver 023_recordatorio_pago.sql
// y src/lib/recordatorios.ts). A las 24 horas el pedido se marca solo como "no confirmado", así
// que al cliente le quedan unas 12 horas para reaccionar — por eso el correo dice cuántas.
//
// EL TONO: es un correo que se puede sentir insistente, así que dice una vez qué pasa y qué
// hacer, ofrece el botón de WhatsApp (que es como se coordina el pago) y le da salida a quien ya
// pagó: "ignora este mensaje".

import type { OrderPublicItem } from "../types/database";
import { fmt } from "./pricing.js";
import { buildOrderMessage, whatsappUrl } from "./whatsapp.js";
import { primerNombre, type CorreoArmado } from "./correo-pedido";
import { armarDesdeContenido, type Contenido } from "./correo-estado";

export interface DatosCorreoRecordatorio {
  order_number: string;
  customer_name: string;
  total: number;
  /** Lo que nombra el mensaje de WhatsApp: producto, variante e iniciales. */
  items: Pick<OrderPublicItem, "product_name" | "variant" | "initials" | "initials_color" | "quantity">[];
  /** Enlace privado de seguimiento, absoluto: el correo se abre lejos de la tienda. */
  seguimiento: string;
  /** Horas que faltan para que el pedido se marque como no confirmado (mínimo 1). */
  horas_restantes: number;
}

/** "unas 11 horas", o "menos de una hora" cuando ya casi vence. */
export function plazoEnPalabras(horas: number): string {
  if (!Number.isFinite(horas) || horas <= 1) return "en menos de una hora";
  return `en unas ${Math.round(horas)} horas`;
}

export function armarCorreoRecordatorio(
  p: DatosCorreoRecordatorio,
  puedeResponder: boolean
): CorreoArmado {
  const nombre = primerNombre(p.customer_name);

  const contenido: Contenido = {
    asunto: `Tu pedido ${p.order_number} sigue esperando el pago`,
    bandeja: `Pedido ${p.order_number}: confirma tu pago para que entre a producción.`,
    etiqueta: "RECORDATORIO DE PAGO",
    titulo: `${nombre}, tu pedido te está esperando`,
    parrafos: [
      "Guardamos tu pedido, pero todavía no hemos recibido el pago.",
      `Si no lo confirmamos ${plazoEnPalabras(p.horas_restantes)}, se marcará como no confirmado. Escríbenos por WhatsApp y te compartimos los medios de pago.`,
    ],
    numero: p.order_number,
    paso: 2, // sigue esperando el pago
    caja: [{ etiqueta: "TOTAL A PAGAR", valor: fmt(p.total) }],
    botones: [
      {
        // El mismo mensaje que la página de gracias: nombra lo que se compró y el número.
        href: whatsappUrl(
          buildOrderMessage({
            order_number: p.order_number,
            total: p.total,
            items: p.items as OrderPublicItem[],
          })
        ),
        texto: "Confirmar pago por WhatsApp",
        principal: true,
      },
      { href: p.seguimiento, texto: "Ver el estado de mi pedido", principal: false },
    ],
    nota: "Si ya pagaste, ignora este mensaje: lo confirmamos en cuanto veamos el pago.",
  };

  return armarDesdeContenido(contenido, puedeResponder);
}
