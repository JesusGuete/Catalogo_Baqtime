// POST /api/pedidos/notificar-estado — el aviso por correo de un cambio de estado.
//
// Lo llama el panel DESPUÉS de cambiar el estado (con la casilla "Avisar al cliente" marcada).
// Existe por la misma razón que reenviar-correo.ts: el panel corre en el navegador y no
// puede mandar correos, porque la clave de Resend es un secreto del Worker.
//
// QUIÉN PUEDE, Y CÓMO SE DECIDE: igual que en reenviar-correo.ts, el pedido se lee con el JWT
// del propio admin, no con la service_role. La tabla `orders` solo deja leer a los admins,
// así que si quien llama no lo es, PostgREST devuelve cero filas y esto responde 404.
//
// QUÉ SE COMPRUEBA ANTES DE ENVIAR: que el pedido de verdad esté en el punto del que habla el
// correo. Es una red de seguridad contra un cliente (el panel) con un bug o una pestaña
// desactualizada: un "tu pedido va en camino" mandado por un pedido que no se ha enviado es
// peor que no mandar nada. Se mira el pedido en la base, no lo que dice la petición.
//
// La service_role se usa solo DESPUÉS, para anotar el resultado en order_notifications —
// una tabla que el panel no puede escribir (021_avisos_estado.sql).

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { enviarAvisoEstado } from "../../../lib/correo";
import { esTipoAviso, type TipoAviso } from "../../../lib/correo-estado";

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo justo para decidir si procede y armar el correo. */
interface FilaPedido {
  id: string;
  order_number: string;
  public_token: string;
  status: string;
  customer_name: string;
  customer_email: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  estimated_date: string | null;
}

const SELECT =
  "id,order_number,public_token,status,customer_name,customer_email," +
  "paid_at,shipped_at,carrier,tracking_number,estimated_date";

/** null = procede; texto = por qué no. El mensaje lo lee el dueño en el panel. */
function motivoParaNoEnviar(tipo: TipoAviso, p: FilaPedido): string | null {
  if (tipo === "aprobado" && !p.paid_at) {
    return "El pago de este pedido todavía no está confirmado.";
  }
  if (tipo === "enviado" && !p.shipped_at) {
    return "Este pedido todavía no figura como enviado.";
  }
  if (tipo === "entregado" && p.status !== "entregado") {
    return "Este pedido todavía no figura como entregado.";
  }
  return null;
}

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
    console.error("[/api/pedidos/notificar-estado] Falta configuración de Supabase.");
    return json({ error: "El servidor no está configurado para enviar correos." }, 503);
  }

  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401);

  let id = "";
  let tipo: unknown;
  try {
    const cuerpo = (await request.json()) as { id?: unknown; tipo?: unknown };
    id = String(cuerpo.id ?? "");
    tipo = cuerpo.tipo;
  } catch {
    return json({ error: "Petición inválida." }, 400);
  }
  if (!UUID.test(id) || !esTipoAviso(tipo)) return json({ error: "Petición inválida." }, 400);

  let filas: FilaPedido[];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=${SELECT}&id=eq.${id}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      return json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401);
    }
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    filas = (await res.json()) as FilaPedido[];
  } catch (e) {
    console.error("[/api/pedidos/notificar-estado] No se pudo leer el pedido:", e);
    return json({ error: "No se pudo leer el pedido. Intenta de nuevo." }, 502);
  }

  const pedido = filas[0];
  // Cero filas = no existe, o quien llama no es admin. No se distingue a propósito.
  if (!pedido) return json({ error: "No se encontró ese pedido." }, 404);
  if (!pedido.customer_email) {
    return json({ error: "Este pedido no tiene correo. Agrégalo primero." }, 400);
  }

  const motivo = motivoParaNoEnviar(tipo, pedido);
  if (motivo) return json({ error: motivo }, 409);

  const resultado = await enviarAvisoEstado({
    supabaseUrl: SUPABASE_URL,
    serviceKey: SERVICE_KEY,
    orderId: pedido.id,
    para: pedido.customer_email,
    tipo,
    datos: {
      order_number: pedido.order_number,
      customer_name: pedido.customer_name,
      seguimiento: new URL(`/pedido/${pedido.public_token}`, url.origin).href,
      carrier: pedido.carrier,
      tracking_number: pedido.tracking_number,
      estimated_date: pedido.estimated_date,
    },
  });

  return resultado.ok ? json({ ok: true }, 200) : json({ error: resultado.error }, 502);
};
