// POST /api/pagos/wompi — el webhook de Wompi (evento transaction.updated).
//
// Wompi llama acá cada vez que una transacción cambia de estado. Es la forma principal en que
// la tienda se entera de un pago: llega aunque el cliente cierre el navegador antes de volver.
// Se configura en el dashboard de Wompi como "URL de eventos", una por ambiente.
//
// NADA DE LO QUE DICE EL CUERPO SE USA PARA APROBAR. El checksum (verificarEvento) solo filtra
// lo que no viene de Wompi; lo que decide es procesarTransaccion(), que vuelve a consultar la
// transacción con la llave privada. Así, ni con el secreto de eventos filtrado se puede aprobar
// un pedido sin haber pagado.
//
// LO QUE SE RESPONDE IMPORTA: con cualquier cosa distinta de 200, Wompi reintenta a los 30
// minutos, a las 3 horas y a las 24 horas. Por eso:
//   200 → procesado, o un evento que no es para esta tienda (reintentarlo no lo cambia).
//   401 → no lo firmó Wompi.
//   503 → falló algo de este lado (Supabase, la consulta a Wompi): que lo reintente.

import type { APIRoute } from "astro";
import { verificarEvento, type EventoWompi } from "../../../lib/wompi";
import { configWompi, procesarTransaccion } from "../../../lib/pagos";

export const prerender = false;

function respuesta(status: number, texto = ""): Response {
  return new Response(texto, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const POST: APIRoute = async ({ request, url, locals }) => {
  const config = configWompi();
  if (!config) {
    console.error("[/api/pagos/wompi] Llegó un evento pero faltan las llaves de Wompi.");
    return respuesta(503);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return respuesta(400);
  }

  const valido = await verificarEvento(
    cuerpo,
    request.headers.get("X-Event-Checksum"),
    config.secretoEventos
  );
  if (!valido) {
    console.error("[/api/pagos/wompi] Evento con checksum inválido; se ignora.");
    return respuesta(401);
  }
  const evento = cuerpo as EventoWompi;

  // Hoy Wompi solo manda este evento, pero si suma otros no hay que procesarlos como pagos.
  if (evento.event !== "transaction.updated") return respuesta(200);

  // Un evento de sandbox que llega a producción (o al revés) es de otra configuración: su
  // transacción ni existe en el ambiente de estas llaves.
  if (evento.environment !== config.ambiente) {
    console.log(`[/api/pagos/wompi] Evento de ${evento.environment} con llaves de ${config.ambiente}; se ignora.`);
    return respuesta(200);
  }

  const txId = evento.data.transaction?.id;
  if (!txId) return respuesta(200);

  const resultado = await procesarTransaccion(txId, {
    sitio: url.origin,
    enSegundoPlano: locals.cfContext ? (p) => locals.cfContext!.waitUntil(p) : undefined,
  });

  return resultado.tipo === "error" ? respuesta(503) : respuesta(200);
};
