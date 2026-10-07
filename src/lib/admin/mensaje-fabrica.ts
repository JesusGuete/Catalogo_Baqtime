// El mensaje que se le manda a la fábrica que hace los bolsos.
//
// Es texto plano para pegarlo en el chat, con la forma que pidió la dueña:
//
//   Tote Bag Negro - Cordones Negros (AL en Blanco)
//
//   Adriana Guete
//   CC.1002326883
//   Tel.3147394682
//   Diagonal 32 #88-699
//
// Lo primero es lo que hay que coser (una línea por bolso: producto, variante e iniciales con
// el color del hilo); lo segundo, a quién se le envía. Lleva los datos del cliente porque la
// fábrica envía directo — por eso este texto NO sale nunca del panel: no se manda por correo
// ni se guarda, solo se copia a mano.
//
// Función pura, sin red ni DOM, para poder probarla sola.

import type { OrderItem, OrderPublicItem, OrderWithDetail } from "../../types/database";
import { describirItem } from "../whatsapp.js";

/** Lo mínimo del pedido que necesita el mensaje. */
export type PedidoParaFabrica = Pick<
  OrderWithDetail,
  "customer_name" | "customer_phone" | "customer_doc" | "ship_address"
> & { order_items?: Pick<OrderItem, "product_name" | "variant" | "initials" | "initials_color" | "quantity">[] };

export function armarMensajeFabrica(p: PedidoParaFabrica): string {
  // Misma descripción de cada artículo que el mensaje de WhatsApp del cliente
  // ("Tote Bag Negro - Cordones Negros (AL en Blanco)"), para que se lea igual en los dos lados.
  const productos = (p.order_items ?? []).map((it) => describirItem(it as OrderPublicItem));

  const documento = p.customer_doc?.trim();
  const cliente = [
    p.customer_name.trim(),
    // El prefijo "CC." es el de la plantilla de la dueña. El formulario pide solo "número de
    // documento", sin tipo, así que un NIT o una cédula de extranjería saldrían como "CC.".
    // Dentro de Barranquilla el documento es opcional: sin él, la línea no aparece.
    documento ? `CC.${documento}` : null,
    `Tel.${p.customer_phone.trim()}`,
    p.ship_address.trim(),
  ].filter((linea): linea is string => Boolean(linea));

  return [...productos, "", ...cliente].join("\n");
}
