// Pedidos.
//
// A diferencia de productos, acá NO hay borrador ni publicación: un pedido es un hecho
// desde que el cliente lo confirma, y lo que se guarda se ve al instante. publish_catalog()
// no toca estas tablas.
//
// LO QUE ESTE ARCHIVO NO PUEDE HACER, Y NO ES UNA CONVENCIÓN: la base solo concede UPDATE
// sobre cuatro columnas (carrier, tracking_number, estimated_date, payment_note). Cambiar
// `status`, `paid_at` o `shipped_at` con un PATCH devuelve 42501 aunque quien lo intente
// sea admin. Esos tres se mueven exclusivamente por las funciones de abajo, que escriben
// la fila del historial en la misma transacción — así la línea de tiempo que ve el cliente
// no puede contradecir el estado real. Ver 010_orders.sql.

import { rest, rpc } from "../supabase/http";
import {
  SELECT_PEDIDO_LISTA,
  SELECT_PEDIDO_DETALLE,
  type Order,
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
