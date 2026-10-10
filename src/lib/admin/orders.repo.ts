// Pedidos.
//
// A diferencia de productos, acá NO hay borrador ni publicación: un pedido es un hecho
// desde que el cliente lo confirma, y lo que se guarda se ve al instante. publish_catalog()
// no toca estas tablas.
//
// LO QUE ESTE ARCHIVO NO PUEDE HACER, Y NO ES UNA CONVENCIÓN: la base solo concede UPDATE
// sobre cuatro columnas (carrier, tracking_number, estimated_date, payment_note), más el
// correo del cliente desde 019_correo_cliente.sql. Cambiar
// `status`, `paid_at` o `shipped_at` con un PATCH devuelve 42501 aunque quien lo intente
// sea admin. Esos tres se mueven exclusivamente por las funciones de abajo, que escriben
// la fila del historial en la misma transacción — así la línea de tiempo que ve el cliente
// no puede contradecir el estado real. Ver 010_orders.sql.

import { rest, rpc } from "../supabase/http";
import { getAccessToken } from "../supabase/auth-store";
import { AdminError, desdeRed } from "../supabase/errors";
import {
  SELECT_PAGO,
  SELECT_PEDIDO_LISTA,
  SELECT_PEDIDO_DETALLE,
  type Order,
  type OrderPayment,
  type OrderStatusNotice,
  type OrderStatus,
  type OrderUpdate,
  type OrderWithDetail,
} from "../../types/database";

const TABLA = "orders";
const CTX = "pedidos" as const;

/** Los más nuevos primero: es el orden en que el dueño los atiende. */
export async function listar(): Promise<Order[]> {
  return rest<Order[]>(`${TABLA}?select=${SELECT_PEDIDO_LISTA}&order=created_at.desc`, {
    contexto: CTX,
  });
}

export async function obtener(id: string): Promise<OrderWithDetail | null> {
  const filas = await rest<OrderWithDetail[]>(
    `${TABLA}?select=${SELECT_PEDIDO_DETALLE}&id=eq.${encodeURIComponent(id)}`,
    { contexto: CTX }
  );
  const pedido = filas[0];
  if (!pedido) return null;
  // PostgREST no garantiza el orden de las filas embebidas, y una línea de tiempo
  // desordenada es peor que no tenerla.
  pedido.order_status_history?.sort((a, b) => a.created_at.localeCompare(b.created_at));
  pedido.order_items?.sort((a, b) => a.id - b.id);
  return pedido;
}

/**
 * Los intentos de pago en línea de un pedido (027_pagos_en_linea.sql), del más viejo al más
 * nuevo. Solo lectura: los escribe el servidor cuando Wompi responde, nunca el panel.
 *
 * APARTE de obtener() a propósito, y sin lanzar: si 027 todavía no está corrida, la tabla no
 * existe, y pedirla embebida haría fallar el pedido entero. Así el panel muestra el pedido igual
 * y solo se queda sin la tarjeta de pagos en línea.
 */
export async function pagosEnLinea(orderId: string): Promise<OrderPayment[]> {
  try {
    return await rest<OrderPayment[]>(
      `order_payments?select=${SELECT_PAGO}&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`,
      { contexto: CTX }
    );
  } catch (e) {
    console.warn("[pedidos] no se pudieron leer los pagos en línea:", e);
    return [];
  }
}

export interface ResumenPagos {
  /** Pedidos que se pagaron en línea (un intento aprobado y sin nada que revisar). */
  enLinea: Set<string>;
  /** Pedidos con un pago para revisar a mano: monto distinto o un cobro de más que devolver. */
  revisar: Set<string>;
}

/**
 * Para la lista de pedidos, en una sola consulta: cuáles se pagaron en línea y cuáles tienen un
 * pago para revisar. Mismo criterio que pagosEnLinea(): si falla, la lista se ve como antes.
 */
export async function resumenPagos(): Promise<ResumenPagos> {
  const resumen: ResumenPagos = { enLinea: new Set(), revisar: new Set() };
  try {
    const filas = await rest<Pick<OrderPayment, "order_id" | "status" | "anomaly">[]>(
      "order_payments?select=order_id,status,anomaly" +
        "&or=(and(status.eq.APPROVED,anomaly.is.null),anomaly.not.is.null)",
      { contexto: CTX }
    );
    for (const f of filas) {
      if (f.anomaly) resumen.revisar.add(f.order_id);
      else if (f.status === "APPROVED") resumen.enLinea.add(f.order_id);
    }
  } catch (e) {
    console.warn("[pedidos] no se pudo leer el resumen de pagos en línea:", e);
  }
  return resumen;
}

/** Guía, transportadora, fecha estimada y nota. Lo único editable con un PATCH directo. */
export async function editarLogistica(id: string, cambios: OrderUpdate): Promise<Order> {
  const filas = await rest<Order[]>(`${TABLA}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: cambios,
    contexto: CTX,
  });
  return filas[0]!;
}

/** Cambia el estado y agrega su fila al historial, todo en una transacción. */
export async function cambiarEstado(
  id: string,
  estado: OrderStatus,
  nota?: string
): Promise<void> {
  await rpc<void>(
    "set_order_status",
    { p_order_id: id, p_status: estado, p_note: nota ?? null },
    CTX
  );
}

/**
 * Marca el pago y aprueba el pedido.
 *
 * Es su propia función y no un `cambiarEstado(id, "aprobado")` porque confirmar el pago
 * SIEMPRE aprueba: si eso dependiera de que el panel se acuerde de hacer las dos cosas,
 * la regla duraría hasta el primer descuido. Funciona también sobre un pedido marcado
 * `no_confirmado`, que es lo que hace reversible el vencimiento automático.
 */
export async function confirmarPago(id: string, nota?: string): Promise<void> {
  await rpc<void>("confirm_order_payment", { p_order_id: id, p_note: nota ?? null }, CTX);
}

/**
 * Borra el pedido, sus productos y su historial. DEFINITIVO: no hay papelera.
 *
 * Pasa por una función y no por un DELETE de PostgREST porque la tabla no le concede
 * borrado a nadie (010_orders.sql). Ver 013_eliminar_pedido.sql.
 */
export async function eliminar(id: string): Promise<void> {
  await rpc<void>("eliminar_pedido", { p_order_id: id }, CTX);
}

/**
 * Vuelve a mandarle al cliente el correo "Recibimos tu pedido".
 *
 * NO va a Supabase como el resto de este archivo, sino al servidor de la tienda: mandar un
 * correo necesita la clave de Resend, que es un secreto del Worker y nunca llega al
 * navegador. El servidor lee el pedido con ESTA sesión, así que la regla de "solo admins"
 * la sigue decidiendo RLS (ver src/pages/api/pedidos/reenviar-correo.ts).
 *
 * Si el envío falla, el servidor ya lo dejó anotado en el pedido; acá además se lanza el
 * error para que el panel lo muestre en el momento.
 */
export async function reenviarCorreo(id: string): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new AdminError("Tu sesión expiró. Vuelve a iniciar sesión.", {
      code: "NO_SESSION",
      status: 401,
    });
  }

  let res: Response;
  try {
    res = await fetch("/api/pedidos/reenviar-correo", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch (e) {
    throw desdeRed(e);
  }
  if (res.ok) return;

  const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new AdminError(cuerpo?.error ?? `Error ${res.status} al reenviar el correo.`, {
    code: res.status === 401 ? "NO_SESSION" : null,
    status: res.status,
  });
}

/**
 * Le avisa al cliente por correo de un cambio de estado (pago confirmado, enviado, entregado).
 *
 * Va al servidor de la tienda y no a Supabase, por lo mismo que reenviarCorreo(): mandar un
 * correo necesita la clave de Resend, un secreto del Worker. Se llama DESPUÉS de cambiar el
 * estado, y el servidor comprueba en la base que el pedido de verdad esté en ese punto.
 *
 * Si el envío falla, el servidor ya lo dejó anotado en el pedido (order_notifications); acá
 * además se lanza el error para que el panel lo muestre en el momento. El cambio de estado
 * en sí NO se deshace: el pedido ya avanzó, y avisarle al cliente es un paso aparte.
 */
export async function notificarEstado(id: string, tipo: OrderStatusNotice): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new AdminError("Tu sesión expiró. Vuelve a iniciar sesión.", {
      code: "NO_SESSION",
      status: 401,
    });
  }

  let res: Response;
  try {
    res = await fetch("/api/pedidos/notificar-estado", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, tipo }),
    });
  } catch (e) {
    throw desdeRed(e);
  }
  if (res.ok) return;

  const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new AdminError(cuerpo?.error ?? `Error ${res.status} al avisar al cliente.`, {
    code: res.status === 401 ? "NO_SESSION" : null,
    status: res.status,
  });
}

/**
 * Pasa a `no_confirmado` lo que lleve más de 24 h sin pago.
 *
 * El panel la llama al abrir la lista. También la corre pg_cron si la extensión está
 * activa; las dos vías hacen lo mismo y llamarla de más no cuesta nada, porque solo toca
 * pedidos que el reloj ya venció. Sin pg_cron, esta llamada es lo único que la dispara.
 *
 * Devuelve cuántos pedidos venció.
 */
export async function vencerPendientes(): Promise<number> {
  return rpc<number>("expire_stale_orders", {}, CTX);
}
