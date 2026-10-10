// GET /api/pagos/estado?p=<token del pedido>&id=<transacción> — cómo va un pago directo.
//
// La consulta a Wompi la hace el servidor con la llave privada (desde 2026 Wompi no responde
// consultas del navegador), y de paso la anota: es procesarTransaccion(), el mismo camino del
// webhook. Si el pago se aprobó, el pedido queda aprobado desde acá.
//
// Responde lo que el navegador necesita para el siguiente paso:
//   { estado, urlExterna?, tresDs? }
//   - urlExterna: mandar al cliente a su banco (PSE, Botón Bancolombia).
//   - tresDs: el paso de 3D Secure y, si el banco lo pide, el HTML del reto.
//
// Solo responde por transacciones DEL PEDIDO DEL TOKEN: su referencia empieza por el número del
// pedido. Con el id de otra transacción responde 404, como si no existiera.

import type { APIRoute } from "astro";
import { obtenerPedido } from "../../../lib/pedido";
import { procesarTransaccion } from "../../../lib/pagos";

export const prerender = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const token = url.searchParams.get("p") ?? "";
  const txId = url.searchParams.get("id") ?? "";
  if (!UUID.test(token) || !/^[A-Za-z0-9-]{1,100}$/.test(txId)) return json({ error: "Petición inválida." }, 400);

  const pedido = await obtenerPedido(token);
  if (pedido.estado === "no-existe") return json({ error: "No encontramos ese pedido." }, 404);
  if (pedido.estado === "error") return json({ reintentar: true }, 503);

  const cfContext = locals.cfContext;
  const r = await procesarTransaccion(txId, {
    sitio: url.origin,
    enSegundoPlano: cfContext ? (p) => cfContext.waitUntil(p) : undefined,
  });
  if (r.tipo === "error") return json({ reintentar: true }, 503);
  if (r.tipo === "ajena" || !r.reference.startsWith(`${pedido.pedido.order_number}-`)) {
    return json({ error: "No encontramos ese pago." }, 404);
  }

  return json(
    {
      estado: r.estado,
      urlExterna: r.extra?.urlExterna ?? null,
      tresDs: r.extra?.tresDs ?? null,
    },
    200
  );
};
