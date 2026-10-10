// POST /api/pedidos/reenviar-correo — el botón "Reenviar correo" del panel.
//
// Existe porque el panel corre en el navegador y no puede mandar correos: la clave de
// Resend es un secreto del Worker. El panel llama acá con el id del pedido y su sesión.
//
// QUIÉN PUEDE, Y CÓMO SE DECIDE: el pedido se lee con el JWT del propio admin, no con la
// service_role. La tabla `orders` solo deja leer a los admins (orders_select_admin en
// 010_orders.sql), así que si quien llama no lo es, PostgREST devuelve cero filas y esto
// responde 404. La autorización la sigue decidiendo RLS, en el mismo lugar que para el
// resto del panel, en vez de una segunda comprobación escrita acá que podría desviarse.
//
// La service_role se usa solo DESPUÉS, para anotar el resultado del envío — una columna
// que el panel no puede escribir (019_correo_cliente.sql).

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import type { OrderPublicItem } from "../../../types/database";
import { enviarConfirmacionPedido } from "../../../lib/correo";
import { enlacePagar } from "../../../lib/pagos";

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo justo para armar el correo: mismos campos que lee el checkout. */
interface FilaPedido {
  id: string;
  order_number: string;
  public_token: string;
  customer_name: string;
  customer_email: string | null;
  status: string;
  paid_at: string | null;
  ship_city: string;
  ship_address: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  order_items: OrderPublicItem[];
}

const SELECT =
  "id,order_number,public_token,customer_name,customer_email,status,paid_at,ship_city,ship_address," +
  "subtotal,shipping_cost,total," +
  "order_items(product_name,category_label,color,variant,initials,initials_color,quantity,line_total)";

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

export const POST: APIRoute = async ({ request, url }) => {
  const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
  const ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"] || undefined;

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    console.error("[/api/pedidos/reenviar-correo] Falta configuración de Supabase.");
    return json({ error: "El servidor no está configurado para enviar correos." }, 503);
  }

  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401);

  let id = "";
  try {
    id = String(((await request.json()) as { id?: unknown }).id ?? "");
  } catch {
    return json({ error: "Petición inválida." }, 400);
  }
  if (!UUID.test(id)) return json({ error: "Petición inválida." }, 400);

  let filas: FilaPedido[];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?select=${SELECT}&id=eq.${id}&order_items.order=id.asc`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (res.status === 401) {
      return json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401);
    }
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    filas = (await res.json()) as FilaPedido[];
  } catch (e) {
    console.error("[/api/pedidos/reenviar-correo] No se pudo leer el pedido:", e);
    return json({ error: "No se pudo leer el pedido. Intenta de nuevo." }, 502);
  }

  const pedido = filas[0];
  // Cero filas = no existe, o quien llama no es admin. No se distingue a propósito.
  if (!pedido) return json({ error: "No se encontró ese pedido." }, 404);
  if (!pedido.customer_email) {
    return json({ error: "Este pedido no tiene correo. Agrégalo primero." }, 400);
  }

  // Sin clave de idempotencia: reenviar es justamente pedir un correo nuevo.
  const resultado = await enviarConfirmacionPedido({
    supabaseUrl: SUPABASE_URL,
    serviceKey: SERVICE_KEY,
    orderId: pedido.id,
    para: pedido.customer_email,
    datos: {
      order_number: pedido.order_number,
      customer_name: pedido.customer_name,
      ship_city: pedido.ship_city,
      ship_address: pedido.ship_address,
      subtotal: pedido.subtotal,
      shipping_cost: pedido.shipping_cost,
      total: pedido.total,
      items: pedido.order_items ?? [],
      seguimiento: new URL(`/pedido/${pedido.public_token}`, url.origin).href,
      // Se puede reenviar la confirmación de un pedido ya pagado o vencido: a ese no se le
      // ofrece pagar.
      pagar:
        pedido.status === "pendiente_pago" && !pedido.paid_at
          ? enlacePagar(pedido.public_token, url.origin)
          : undefined,
    },
  });

  return resultado.ok ? json({ ok: true }, 200) : json({ error: resultado.error }, 502);
};
