// La corrida del recordatorio de pago: busca los pedidos a los que les toca y les manda UN correo.
//
// La dispara la tarea programada del Worker (src/worker.ts), cada 30 minutos. Corre en el
// servidor con la service_role, igual que /api/pedidos, y por eso vive aparte de las
// plantillas y de las reglas.
//
// LA REGLA DE SIEMPRE: nada de lo que se exporta acá lanza. Un correo que no sale se anota en el
// pedido (order_notifications) y se reintenta en la siguiente corrida mientras el pedido siga
// vigente; no hace caer la tarea ni los demás envíos.
//
// DOS SEGUROS CONTRA EL CORREO DUPLICADO:
//   1. pedidos_por_recordar() no devuelve un pedido que ya tenga un recordatorio enviado.
//   2. Resend recibe una clave de idempotencia por pedido (en correo.ts), así que si una corrida
//      muere entre enviar y anotar, el reintento no vuelve a mandar el correo.

import { env } from "cloudflare:workers";
import { enviarRecordatorioPago } from "./correo";
import {
  HORAS_PARA_RECORDAR,
  esHorarioDeEnvio,
  horasRestantes,
} from "./recordatorio-reglas";

/** Tope por corrida: si hay más, el resto sale en la siguiente (30 minutos después). */
const LIMITE_POR_CORRIDA = 20;

interface PedidoPorRecordar {
  id: string;
  order_number: string;
  public_token: string;
  customer_name: string;
  customer_email: string;
  total: number;
  created_at: string;
  items: {
    product_name: string;
    variant: string | null;
    initials: string | null;
    initials_color: string | null;
    quantity: number;
    line_total: number;
  }[];
}

export interface ResultadoCorrida {
  /** Por qué no se hizo nada, si fue así. */
  omitido?: string;
  enviados: number;
  fallidos: number;
}

export async function enviarRecordatoriosDePago(ahora: Date = new Date()): Promise<ResultadoCorrida> {
  if (!esHorarioDeEnvio(ahora)) {
    return { omitido: "fuera del horario de envío (8 a.m. a 10 p.m., hora de Colombia)", enviados: 0, fallidos: 0 };
  }

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"] || undefined;
  if (!supabaseUrl || !serviceKey) {
    console.error("[recordatorios] Falta PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    return { omitido: "falta configuración de Supabase", enviados: 0, fallidos: 0 };
  }

  let pedidos: PedidoPorRecordar[];
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/pedidos_por_recordar`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_horas: HORAS_PARA_RECORDAR, p_limite: LIMITE_POR_CORRIDA }),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    pedidos = (await res.json()) as PedidoPorRecordar[];
  } catch (e) {
    console.error("[recordatorios] No se pudo consultar qué pedidos recordar:", e);
    return { omitido: "no se pudo consultar los pedidos", enviados: 0, fallidos: 0 };
  }

  const sitio = import.meta.env.SITE ?? "https://baqtime.store";
  let enviados = 0;
  let fallidos = 0;

  // Uno por uno y no en paralelo: son pocos, y así un proveedor lento o que limita el ritmo
  // no recibe veinte peticiones de golpe.
  for (const p of pedidos) {
    const resultado = await enviarRecordatorioPago({
      supabaseUrl,
      serviceKey,
      orderId: p.id,
      para: p.customer_email,
      datos: {
        order_number: p.order_number,
        customer_name: p.customer_name,
        total: p.total,
        items: p.items,
        seguimiento: new URL(`/pedido/${p.public_token}`, sitio).href,
        horas_restantes: horasRestantes(new Date(p.created_at), ahora),
      },
    });
    if (resultado.ok) enviados++;
    else fallidos++;
  }

  if (pedidos.length) {
    console.log(`[recordatorios] ${pedidos.length} pedido(s): ${enviados} enviado(s), ${fallidos} fallido(s).`);
  }
  return { enviados, fallidos };
}
