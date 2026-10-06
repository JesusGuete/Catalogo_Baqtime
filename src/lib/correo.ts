// Envío de correos desde el servidor, por Resend (https://resend.com).
//
// SOLO SERVIDOR: lee secretos de `cloudflare:workers`, un módulo que no existe en el
// navegador. Importar esto desde un componente de React no compila, y es a propósito.
//
// LA REGLA QUE NO SE NEGOCIA: un correo que falla NUNCA hace fallar un pedido. Nada de lo
// que se exporta acá lanza excepciones — todo devuelve un resultado y el que llama decide.
// El cliente ya compró; un problema con el proveedor de correo jamás puede convertirse en
// "no pudimos guardar tu pedido".
//
// Por qué Resend y no otro: ver docs/Propuesta-correo-pedidos-baqtime.pdf (propuesta 2).
// Si algún día conviene cambiar de proveedor (Cloudflare Email Service, por ejemplo), el
// cambio queda encerrado en enviarCorreo(); la plantilla y quien la llama no se enteran.
//
// Variables (secretos del Worker en producción, .env en local):
//   RESEND_API_KEY      obligatoria para enviar. Sin ella no sale nada y el pedido lo anota.
//   CORREO_REMITENTE    opcional. Por defecto "Baqtime <pedidos@baqtime.store>". El dominio
//                       tiene que estar verificado en Resend o el envío se rechaza.
//   CORREO_RESPONDER_A  opcional. A dónde llegan las respuestas de los clientes. Sin ella,
//                       el correo no los invita a responder (nadie lee pedidos@).

import { env } from "cloudflare:workers";
import { armarCorreoPedido, type DatosCorreoPedido } from "./correo-pedido";

const RESEND_URL = "https://api.resend.com/emails";
const REMITENTE_POR_DEFECTO = "Baqtime <pedidos@baqtime.store>";
/** Más que esto y el proveedor no va a contestar; mejor anotar el fallo y reenviar luego. */
const TIEMPO_MAXIMO_MS = 10_000;

export type ResultadoEnvio = { ok: true } | { ok: false; error: string };

/** Mismo criterio que leerSecreto() en api/pedidos.ts: por índice, nunca inlineable. */
function leer(nombre: string): string | undefined {
  return env[nombre]?.trim() || undefined;
}

interface Mensaje {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  /**
   * Si llega dos veces la misma clave, Resend manda el correo una sola vez. Se usa en el
   * envío automático para que un reintento no le duplique el correo al cliente; el
   * reenvío desde el panel NO la usa, porque ahí sí se quiere un correo nuevo.
   */
  idempotencia?: string;
}

/** Un envío. No lanza: cualquier problema vuelve como `{ ok: false, error }` en castellano. */
export async function enviarCorreo(m: Mensaje): Promise<ResultadoEnvio> {
  const clave = leer("RESEND_API_KEY");
  if (!clave) {
    return { ok: false, error: "El envío de correos no está configurado (falta RESEND_API_KEY)." };
  }
  const responderA = leer("CORREO_RESPONDER_A");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${clave}`,
    "Content-Type": "application/json",
  };
  if (m.idempotencia) headers["Idempotency-Key"] = m.idempotencia;

  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: leer("CORREO_REMITENTE") ?? REMITENTE_POR_DEFECTO,
        to: [m.para],
        subject: m.asunto,
        html: m.html,
        text: m.texto,
        ...(responderA ? { reply_to: responderA } : {}),
      }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
  } catch (e) {
    console.error("[correo] No se pudo contactar a Resend:", e);
    return { ok: false, error: "No se pudo contactar al proveedor de correo." };
  }

  if (res.ok) return { ok: true };

  // El mensaje de Resend viene en inglés y es para quien configura, no para el cliente;
  // se guarda tal cual para que el dueño (o quien lo ayude) sepa qué arreglar.
  const cuerpo = (await res.json().catch(() => null)) as { message?: string } | null;
  const detalle = cuerpo?.message ?? res.statusText;
  console.error(`[correo] Resend ${res.status}: ${detalle}`);
  const motivo =
    res.status === 401 || res.status === 403
      ? "El proveedor de correo rechazó la clave o el remitente"
      : res.status === 429
        ? "Se alcanzó el límite de correos del proveedor"
        : "El proveedor de correo rechazó el envío";
  return { ok: false, error: `${motivo} (${res.status}): ${detalle}` };
}

/**
 * Anota en el pedido cómo salió el envío (019_correo_cliente.sql). Si ESTO falla solo se
 * deja en el log: el correo ya salió o ya falló, y no hay a quién más avisarle.
 */
async function registrar(
  supabaseUrl: string,
  serviceKey: string,
  orderId: string,
  error: string | null
): Promise<void> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/registrar_correo_pedido`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_order_id: orderId, p_error: error }),
    });
    if (!res.ok) console.error(`[correo] registrar ${res.status}: ${await res.text()}`);
  } catch (e) {
    console.error("[correo] No se pudo anotar el resultado del envío:", e);
  }
}

export interface OpcionesConfirmacion {
  supabaseUrl: string;
  serviceKey: string;
  orderId: string;
  para: string;
  datos: DatosCorreoPedido;
  idempotencia?: string;
}

/**
 * Arma, envía y anota el correo "Recibimos tu pedido". La usan el checkout (al guardar el
 * pedido) y el panel (botón Reenviar). No lanza nunca.
 */
export async function enviarConfirmacionPedido(o: OpcionesConfirmacion): Promise<ResultadoEnvio> {
  let resultado: ResultadoEnvio;
  try {
    const correo = armarCorreoPedido(o.datos, Boolean(leer("CORREO_RESPONDER_A")));
    resultado = await enviarCorreo({
      para: o.para,
      asunto: correo.asunto,
      html: correo.html,
      texto: correo.texto,
      idempotencia: o.idempotencia,
    });
  } catch (e) {
    // La plantilla no debería lanzar, pero si un dato raro la rompe, el pedido sigue.
    console.error("[correo] No se pudo armar el correo:", e);
    resultado = { ok: false, error: "No se pudo armar el correo del pedido." };
  }
  await registrar(o.supabaseUrl, o.serviceKey, o.orderId, resultado.ok ? null : resultado.error);
  return resultado;
}
