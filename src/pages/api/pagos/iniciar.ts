// POST /api/pagos/iniciar — el cliente pulsó "Pagar ahora".
//
// Recibe el token del pedido y devuelve todo lo que el checkout de Wompi necesita para abrirse,
// con el cobro ya FIRMADO. El navegador no manda el monto y no lo puede cambiar:
//
//   1. El monto sale de la base (crear_intento_pago, 027_pagos_en_linea.sql), que lo copia de
//      orders.total — el mismo total que el servidor calculó al crear el pedido.
//   2. La firma de integridad cubre referencia + monto + moneda con un secreto que solo existe
//      en el Worker. Si alguien cambia el monto en el navegador, Wompi rechaza el pago.
//
// Cada llamada crea un intento nuevo con su propia referencia, porque Wompi no deja reusar una
// referencia que ya se usó. La base corta en 20 intentos por pedido.
//
// La respuesta tiene la misma forma que espera `new WidgetCheckout({...})` del widget de Wompi,
// para que la página la pase tal cual.

import type { APIRoute } from "astro";
import { firmaIntegridad } from "../../../lib/wompi";
import {
  configWompi,
  pagosEnLineaActivos,
  rpcServidor,
  supabaseServidor,
} from "../../../lib/pagos";

export const prerender = false;

/** El token del pedido es un uuid (010_orders.sql). Cualquier otra cosa no llega a la base. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que devuelve crear_intento_pago(). */
type Intento =
  | {
      ok: true;
      reference: string;
      amount_in_cents: number;
      currency: string;
      order_number: string;
      customer_name: string;
      customer_email: string | null;
      customer_phone: string;
    }
  | { ok: false; motivo: string };

/** Qué se le dice al cliente cuando no se puede pagar. El motivo lo decide la base. */
const RECHAZOS: Record<string, { status: number; error: string }> = {
  no_existe: { status: 404, error: "No encontramos ese pedido." },
  pagado: { status: 409, error: "Este pedido ya está pagado." },
  en_proceso: {
    status: 409,
    error:
      "Ya hay un pago en proceso para este pedido. Espera unos minutos: te avisaremos por correo cuando se confirme.",
  },
  vencido: {
    status: 409,
    error: "Este pedido venció y ya no se puede pagar en línea. Escríbenos por WhatsApp y lo reactivamos.",
  },
  no_disponible: {
    status: 409,
    error: "Este pedido ya no se puede pagar en línea. Escríbenos por WhatsApp.",
  },
  demasiados_intentos: {
    status: 429,
    error: "Se alcanzó el máximo de intentos de pago para este pedido. Escríbenos por WhatsApp.",
  },
};

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
  // El interruptor: apagado, este endpoint no existe para la tienda.
  if (!pagosEnLineaActivos()) {
    return json({ error: "Los pagos en línea no están disponibles en este momento." }, 503);
  }
  const config = configWompi();
  const sb = supabaseServidor();
  if (!config || !sb) {
    console.error("[/api/pagos/iniciar] Falta la configuración de Wompi o de Supabase.");
    return json({ error: "Los pagos en línea no están disponibles en este momento." }, 503);
  }

  let token = "";
  try {
    const cuerpo = (await request.json()) as { token?: unknown };
    token = String(cuerpo.token ?? "");
  } catch {
    return json({ error: "Petición inválida." }, 400);
  }
  if (!UUID.test(token)) return json({ error: "No encontramos ese pedido." }, 404);

  let intento: Intento;
  try {
    intento = await rpcServidor<Intento>(sb, "crear_intento_pago", { p_token: token });
  } catch (e) {
    console.error("[/api/pagos/iniciar] No se pudo crear el intento de pago:", e);
    return json({ error: "No pudimos preparar el pago. Intenta de nuevo." }, 502);
  }

  if (!intento.ok) {
    const rechazo = RECHAZOS[intento.motivo] ?? {
      status: 409,
      error: "Este pedido no se puede pagar en línea. Escríbenos por WhatsApp.",
    };
    return json({ error: rechazo.error }, rechazo.status);
  }

  const firma = await firmaIntegridad({
    reference: intento.reference,
    amountInCents: intento.amount_in_cents,
    currency: intento.currency,
    secreto: config.secretoIntegridad,
  });

  // Ruta y no ?p=: Wompi le agrega `?id=<transacción>` a esta URL, y así no hay que adivinar
  // cómo se combina con una consulta que ya existe.
  const redirectUrl = new URL(`/pedido/pago/${token}`, url.origin).href;

  // Lo que el cliente ya escribió en el checkout, para que no lo repita en Wompi. Va al mismo
  // navegador que lo escribió. El teléfono se guarda en 10 dígitos (shipping-validation.js).
  const customerData: Record<string, string> = {
    fullName: intento.customer_name,
    phoneNumber: intento.customer_phone,
    phoneNumberPrefix: "+57",
  };
  if (intento.customer_email) customerData.email = intento.customer_email;

  return json(
    {
      checkout: {
        currency: intento.currency,
        amountInCents: intento.amount_in_cents,
        reference: intento.reference,
        publicKey: config.llavePublica,
        signature: { integrity: firma },
        redirectUrl,
        customerData,
      },
    },
    200
  );
};
