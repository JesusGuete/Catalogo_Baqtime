// POST /api/pagos/crear — el cliente pulsó "Pagar" con un medio elegido en la página.
//
// Recibe el token del pedido, el medio y sus datos, y crea la transacción en Wompi
// (crearPagoDirecto, src/lib/pagos.ts). Del navegador NO llegan el monto ni la tarjeta: el monto
// sale de la base y la tarjeta llega ya cambiada por un token de Wompi.
//
// Responde { txId }. Con eso el navegador pregunta por el estado (/api/pagos/estado) hasta que
// haya que mandar al cliente a su banco (PSE, Bancolombia), mostrarle 3D Secure, esperar a que
// acepte en Nequi, o llevarlo al resultado.

import type { APIRoute } from "astro";
import {
  crearPagoDirecto,
  METODOS_DIRECTOS,
  pagosEnLineaActivos,
  type MetodoDirecto,
  type SolicitudPago,
} from "../../../lib/pagos";

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_DOCUMENTO = ["CC", "CE", "NIT", "PP"];
const CAMPOS_NAVEGADOR = [
  "browser_color_depth",
  "browser_screen_height",
  "browser_screen_width",
  "browser_language",
  "browser_user_agent",
  "browser_tz",
];

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

/** Lee y valida lo que mandó el navegador. Devuelve el error para el cliente, o la solicitud. */
function leerSolicitud(
  c: Record<string, unknown>
): { error: string } | Omit<SolicitudPago, "ip" | "sitio" | "enSegundoPlano"> {
  const tokenPedido = String(c.token ?? "");
  if (!UUID.test(tokenPedido)) return { error: "No encontramos ese pedido." };
  const metodo = String(c.metodo ?? "") as MetodoDirecto;
  if (!METODOS_DIRECTOS.includes(metodo)) return { error: "Elige un medio de pago." };
  // Las condiciones de Wompi son obligatorias: sin ellas no se crea la transacción.
  if (c.aceptaWompi !== true) return { error: "Para pagar en línea debes aceptar las condiciones de Wompi." };

  if (metodo === "CARD") {
    const t = (c.tarjeta ?? {}) as Record<string, unknown>;
    const token = String(t.token ?? "");
    const cuotas = Number(t.cuotas);
    if (!/^tok_(test|prod)_[A-Za-z0-9_]+$/.test(token)) return { error: "Faltan los datos de la tarjeta." };
    if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 36) return { error: "Elige el número de cuotas." };
    const n = (t.navegador ?? {}) as Record<string, unknown>;
    const navegador: Record<string, string> = {};
    for (const campo of CAMPOS_NAVEGADOR) navegador[campo] = String(n[campo] ?? "").slice(0, 300);
    return { tokenPedido, metodo, tarjeta: { token, cuotas, navegador } };
  }
  if (metodo === "PSE") {
    const p = (c.pse ?? {}) as Record<string, unknown>;
    const banco = String(p.banco ?? "");
    const tipoPersona = Number(p.tipoPersona);
    const tipoDocumento = String(p.tipoDocumento ?? "");
    const documento = String(p.documento ?? "").trim();
    if (!/^[0-9A-Za-z]{1,10}$/.test(banco) || banco === "0") return { error: "Elige tu banco." };
    if (tipoPersona !== 0 && tipoPersona !== 1) return { error: "Elige si eres persona natural o jurídica." };
    if (!TIPOS_DOCUMENTO.includes(tipoDocumento)) return { error: "Elige el tipo de documento." };
    if (!/^[0-9A-Za-z]{5,15}$/.test(documento)) return { error: "Revisa el número de documento." };
    return { tokenPedido, metodo, pse: { banco, tipoPersona, tipoDocumento, documento } };
  }
  if (metodo === "NEQUI") {
    const telefono = String(((c.nequi ?? {}) as Record<string, unknown>).telefono ?? "").replace(/\D/g, "");
    if (!/^3\d{9}$/.test(telefono)) return { error: "Escribe el celular de Nequi (10 dígitos)." };
    return { tokenPedido, metodo, nequi: { telefono } };
  }
  return { tokenPedido, metodo };
}

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!pagosEnLineaActivos(url.hostname)) {
    return json({ error: "Los pagos en línea no están disponibles en este momento." }, 503);
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Petición inválida." }, 400);
  }
  const solicitud = leerSolicitud(cuerpo);
  if ("error" in solicitud) return json({ error: solicitud.error }, 400);

  const cfContext = locals.cfContext;
  const resultado = await crearPagoDirecto({
    ...solicitud,
    ip: request.headers.get("CF-Connecting-IP"),
    sitio: url.origin,
    enSegundoPlano: cfContext ? (p) => cfContext.waitUntil(p) : undefined,
  });

  return resultado.tipo === "ok"
    ? json({ txId: resultado.txId }, 201)
    : json({ error: resultado.error }, resultado.status);
};
