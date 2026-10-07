// La corrida que borra los datos personales de los pedidos vencidos.
//
// La política de datos promete guardarlos solo un mes después de la entrega (o de creado, si
// el pedido no se pagó). Qué pedido vence y qué se borra lo decide
// anonimizar_pedidos_vencidos() en 025_conservacion_datos.sql; esto solo la llama.
//
// La dispara la tarea programada del Worker (src/worker.ts) cada 30 minutos, junto al
// recordatorio de pago. Mismo criterio que recordatorios.ts: no lanza nunca. Si falla, lo
// anota en el log y la siguiente corrida lo vuelve a intentar.

import { env } from "cloudflare:workers";

/** Tope por corrida: si hay más, el resto sale en la siguiente. */
const LIMITE_POR_CORRIDA = 100;

/** Devuelve cuántos pedidos se anonimizaron, o `null` si la corrida no pudo hacerse. */
export async function anonimizarPedidosVencidos(): Promise<number | null> {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"] || undefined;
  if (!supabaseUrl || !serviceKey) {
    console.error("[conservacion] Falta PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    return null;
  }

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/anonimizar_pedidos_vencidos`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_limite: LIMITE_POR_CORRIDA }),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const anonimizados = (await res.json()) as number;
    if (anonimizados) console.log(`[conservacion] ${anonimizados} pedido(s) anonimizado(s).`);
    return anonimizados;
  } catch (e) {
    console.error("[conservacion] No se pudieron anonimizar los pedidos vencidos:", e);
    return null;
  }
}
