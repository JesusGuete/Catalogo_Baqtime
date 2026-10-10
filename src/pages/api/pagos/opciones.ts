// GET /api/pagos/opciones — lo que necesita la página para mostrar los medios de pago.
//
// - La llave PÚBLICA y el ambiente: el navegador manda la tarjeta y la tokeniza directo con
//   Wompi (src/lib/tarjeta-wompi.ts). No es un secreto: igual viaja en cada pago.
// - Los enlaces a los dos contratos de Wompi (reglamento y autorización de datos), que el
//   cliente tiene que aceptar con casillas antes de pagar.
// - Las cuotas que admite el comercio y la lista de bancos de PSE.
//
// Nada es de ningún cliente, así que se cachea unos minutos. Con los pagos en línea apagados
// responde 503 y la página ofrece solo la transferencia.

import type { APIRoute } from "astro";
import { bancosPse, obtenerCondiciones } from "../../../lib/wompi";
import { configWompi, pagosEnLineaActivos } from "../../../lib/pagos";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const config = configWompi();
  if (!config || !pagosEnLineaActivos(url.hostname)) {
    return Response.json(
      { error: "Los pagos en línea no están disponibles en este momento." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const [condiciones, bancos] = await Promise.all([
      obtenerCondiciones(config.llavePublica, config.ambiente),
      bancosPse(config.llavePublica, config.ambiente),
    ]);
    return Response.json(
      {
        llavePublica: config.llavePublica,
        ambiente: config.ambiente,
        enlaceReglamento: condiciones.enlaceReglamento,
        enlaceDatos: condiciones.enlaceDatos,
        cuotas: condiciones.cuotas,
        bancos,
      },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch (e) {
    console.error("[/api/pagos/opciones] No se pudo leer Wompi:", e);
    return Response.json(
      { error: "No pudimos conectarnos con el sistema de pagos. Intenta de nuevo." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
};
