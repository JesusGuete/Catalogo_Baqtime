// Los pagos en línea del lado del servidor: la configuración de Wompi y la ÚNICA función que
// puede dar un pago por aprobado (docs/plan-pagos-en-linea.md, fase 2).
//
// SOLO SERVIDOR: lee secretos de `cloudflare:workers`. Importar esto desde un componente de
// React no compila, y es a propósito.
//
// LA REGLA DE ESTE ARCHIVO: un pago se aprueba solo con lo que Wompi responde cuando el servidor
// le pregunta con la llave privada. Ni la redirección de vuelta (Wompi advierte que no sirve
// para validar), ni el cuerpo de un webhook, ni nada que diga el navegador. Las tres formas en
// que la tienda se entera de una transacción —el webhook, la página de regreso y la
// conciliación programada— terminan en procesarTransaccion(), que vuelve a consultar.
//
// Variables (Cloudflare → Settings → Variables and Secrets; .env en local):
//   WOMPI_PUBLIC_KEY        texto.   pub_test_… (sandbox) o pub_prod_… (producción). Va al
//                                    navegador dentro del checkout; no es un secreto.
//   WOMPI_PRIVATE_KEY       SECRETO. prv_test_… / prv_prod_…. Consulta transacciones.
//   WOMPI_INTEGRITY_SECRET  SECRETO. test_integrity_… / prod_integrity_…. Firma el monto.
//   WOMPI_EVENTS_SECRET     SECRETO. test_events_… / prod_events_…. Verifica el webhook.
//   PAGOS_EN_LINEA          texto.   "1" muestra "Pagar ahora" en la tienda. Cualquier otra
//                                    cosa (o vacío) deja la tienda como antes, con WhatsApp.
//
// WOMPI_PUBLIC_KEY se lee en tiempo de ejecución y no como PUBLIC_: así se pasa de sandbox a
// producción cambiando la variable en Cloudflare, sin reconstruir el sitio. Las cuatro tienen
// que ser del mismo ambiente; si no, configWompi() lo dice en el log y devuelve null.

import { env } from "cloudflare:workers";
import {
  ambienteDeLlave,
  consultarTransaccion,
  llavePrivadaCoincide,
  type Ambiente,
  type EstadoTransaccion,
} from "./wompi";
import { enviarAvisoEstado, enviarAvisoPagoTienda } from "./correo";

export interface ConfigWompi {
  ambiente: Ambiente;
  llavePublica: string;
  llavePrivada: string;
  secretoIntegridad: string;
  secretoEventos: string;
}

/** Mismo criterio que leer() en correo.ts: por índice, nunca inlineable en un bundle. */
function leer(nombre: string): string | undefined {
  return env[nombre]?.trim() || undefined;
}

/**
 * Las llaves de Wompi, o `null` si falta alguna o no son del mismo ambiente. Mezclar una llave
 * pública de producción con un secreto de sandbox no da un error claro en Wompi: da firmas que
 * no coinciden y pagos que nadie entiende por qué se rechazan. Mejor detenerlo acá.
 */
export function configWompi(): ConfigWompi | null {
  const llavePublica = leer("WOMPI_PUBLIC_KEY");
  const llavePrivada = leer("WOMPI_PRIVATE_KEY");
  const secretoIntegridad = leer("WOMPI_INTEGRITY_SECRET");
  const secretoEventos = leer("WOMPI_EVENTS_SECRET");
  if (!llavePublica || !llavePrivada || !secretoIntegridad || !secretoEventos) return null;

  const ambiente = ambienteDeLlave(llavePublica);
  if (!ambiente) {
    console.error("[pagos] WOMPI_PUBLIC_KEY no empieza por pub_test_ ni por pub_prod_.");
    return null;
  }
  if (
    !llavePrivadaCoincide(llavePrivada, ambiente) ||
    !secretoIntegridad.startsWith(`${ambiente}_integrity_`) ||
    !secretoEventos.startsWith(`${ambiente}_events_`)
  ) {
    console.error(
      `[pagos] Las llaves de Wompi no son todas del mismo ambiente (la pública es de ${ambiente}).`
    );
    return null;
  }
  return { ambiente, llavePublica, llavePrivada, secretoIntegridad, secretoEventos };
}

/**
 * El interruptor de la tienda. Apagado, o sin llaves válidas, el cliente ve el flujo de siempre
 * (WhatsApp). Sirve para volver atrás en un minuto desde Cloudflare, sin deploy.
 *
 * OJO: apaga el BOTÓN, no el procesamiento. El webhook y la conciliación siguen funcionando con
 * el interruptor apagado, porque un cliente que empezó a pagar justo antes de apagarlo tiene
 * que ver su pago registrado igual.
 */
export function pagosEnLineaActivos(): boolean {
  return leer("PAGOS_EN_LINEA") === "1" && configWompi() !== null;
}

interface Supabase {
  url: string;
  serviceKey: string;
}

/** La service_role, igual que en api/pedidos.ts: solo servidor, nunca en env.d.ts. */
export function supabaseServidor(): Supabase | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceKey = leer("SUPABASE_SERVICE_ROLE_KEY");
  return url && serviceKey ? { url, serviceKey } : null;
}

/** Una llamada a una función de Postgres con la service_role. Lanza si Supabase no responde bien. */
export async function rpcServidor<T>(sb: Supabase, funcion: string, args: unknown): Promise<T> {
  const res = await fetch(`${sb.url}/rest/v1/rpc/${funcion}`, {
    method: "POST",
    headers: {
      apikey: sb.serviceKey,
      Authorization: `Bearer ${sb.serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Supabase ${res.status} en ${funcion}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Lo que devuelve registrar_transaccion_pago() (027_pagos_en_linea.sql). */
interface Registro {
  encontrado: boolean;
  order_id?: string;
  estado?: EstadoTransaccion;
  anomalia?: string | null;
  aprobado_ahora?: boolean;
}

export type ResultadoProceso =
  /** Wompi respondió y quedó anotado. */
  | {
      tipo: "ok";
      estado: EstadoTransaccion;
      reference: string;
      orderId: string;
      aprobadoAhora: boolean;
      anomalia: string | null;
    }
  /** La transacción no existe en Wompi, o su referencia no es de esta tienda. No se reintenta. */
  | { tipo: "ajena" }
  /** Algo falló de este lado o del de Wompi (red, Supabase caído). Se puede reintentar. */
  | { tipo: "error"; motivo: string };

/** Cómo se llama el medio de pago en un correo. Los que no están acá no se nombran. */
const NOMBRE_METODO: Record<string, string> = {
  CARD: "tarjeta",
  NEQUI: "Nequi",
  DAVIPLATA: "DaviPlata",
  PSE: "PSE",
  BANCOLOMBIA_TRANSFER: "Botón Bancolombia",
  BANCOLOMBIA_QR: "QR",
};

export function nombreMetodo(tipo: string | null): string | null {
  return (tipo && NOMBRE_METODO[tipo.toUpperCase()]) || null;
}

/** Lo justo del pedido para los dos correos. */
interface FilaPedido {
  order_number: string;
  public_token: string;
  customer_name: string;
  customer_email: string | null;
  total: number;
  carrier: string | null;
  tracking_number: string | null;
  estimated_date: string | null;
}

/**
 * Los dos correos de un pago aprobado: "pago confirmado" al cliente y "pago recibido" a la
 * tienda. No lanza: un correo que falla no deshace un pago. El del cliente queda anotado en
 * order_notifications (tipo 'aprobado'), así el panel lo muestra como enviado y no ofrece
 * repetirlo, y si falló se puede reenviar desde ahí.
 */
async function avisarPagoAprobado(
  sb: Supabase,
  orderId: string,
  metodo: string | null,
  sitio: string
): Promise<void> {
  let pedido: FilaPedido | undefined;
  try {
    const res = await fetch(
      `${sb.url}/rest/v1/orders?select=order_number,public_token,customer_name,customer_email,` +
        `total,carrier,tracking_number,estimated_date&id=eq.${encodeURIComponent(orderId)}`,
      { headers: { apikey: sb.serviceKey, Authorization: `Bearer ${sb.serviceKey}` } }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    pedido = ((await res.json()) as FilaPedido[])[0];
  } catch (e) {
    console.error(`[pagos] No se pudo leer el pedido ${orderId} para avisar el pago:`, e);
    return;
  }
  if (!pedido) return;

  const envios: Promise<unknown>[] = [
    enviarAvisoPagoTienda({
      order_number: pedido.order_number,
      customer_name: pedido.customer_name,
      total: pedido.total,
      metodo,
      panel: new URL("/admin/", sitio).href,
    }),
  ];
  if (pedido.customer_email) {
    envios.push(
      enviarAvisoEstado({
        supabaseUrl: sb.url,
        serviceKey: sb.serviceKey,
        orderId,
        para: pedido.customer_email,
        tipo: "aprobado",
        datos: {
          order_number: pedido.order_number,
          customer_name: pedido.customer_name,
          seguimiento: new URL(`/pedido/${pedido.public_token}`, sitio).href,
          carrier: pedido.carrier,
          tracking_number: pedido.tracking_number,
          estimated_date: pedido.estimated_date,
        },
      })
    );
  }
  await Promise.allSettled(envios);
}

export interface OpcionesProceso {
  /** Origen absoluto de la tienda, para los enlaces de los correos. */
  sitio: string;
  /**
   * Para mandar los correos sin hacer esperar a quien llama (ctx.waitUntil del Worker). Sin
   * esto, se espera a que salgan.
   */
  enSegundoPlano?: (promesa: Promise<unknown>) => void;
}

/**
 * Consulta una transacción a Wompi, la anota y, si es la primera vez que se ve aprobada, aprueba
 * el pedido y manda los correos. Es idempotente: llamarla diez veces con el mismo id deja lo
 * mismo que llamarla una, y los correos salen una sola vez.
 *
 * No lanza: todo vuelve como un ResultadoProceso.
 */
export async function procesarTransaccion(
  txId: string,
  o: OpcionesProceso
): Promise<ResultadoProceso> {
  const config = configWompi();
  const sb = supabaseServidor();
  if (!config || !sb) {
    return { tipo: "error", motivo: "Faltan las llaves de Wompi o la configuración de Supabase." };
  }

  let tx;
  try {
    tx = await consultarTransaccion(txId, config.llavePrivada, config.ambiente);
  } catch (e) {
    console.error(`[pagos] No se pudo consultar la transacción ${txId}:`, e);
    return { tipo: "error", motivo: "No se pudo consultar la transacción en Wompi." };
  }
  if (!tx) return { tipo: "ajena" };

  let registro: Registro;
  try {
    registro = await rpcServidor<Registro>(sb, "registrar_transaccion_pago", {
      p_reference: tx.reference,
      p_tx_id: tx.id,
      p_status: tx.status,
      p_method: tx.payment_method_type,
      p_amount_in_cents: tx.amount_in_cents,
      p_currency: tx.currency,
    });
  } catch (e) {
    console.error(`[pagos] No se pudo anotar la transacción ${tx.id}:`, e);
    return { tipo: "error", motivo: "No se pudo anotar el pago." };
  }

  if (!registro.encontrado || !registro.order_id) {
    console.log(`[pagos] Transacción ${tx.id} con una referencia que no es de esta tienda: ${tx.reference}.`);
    return { tipo: "ajena" };
  }
  if (registro.anomalia) {
    console.error(`[pagos] Pedido ${registro.order_id}: ${registro.anomalia} (transacción ${tx.id}).`);
  }

  const aprobadoAhora = registro.aprobado_ahora === true;
  if (aprobadoAhora) {
    console.log(`[pagos] Pedido ${registro.order_id} pagado en línea (transacción ${tx.id}).`);
    const avisos = avisarPagoAprobado(sb, registro.order_id, nombreMetodo(tx.payment_method_type), o.sitio);
    if (o.enSegundoPlano) o.enSegundoPlano(avisos);
    else await avisos;
  }

  return {
    tipo: "ok",
    estado: registro.estado ?? tx.status,
    reference: tx.reference,
    orderId: registro.order_id,
    aprobadoAhora,
    anomalia: registro.anomalia ?? null,
  };
}

/** Tope por corrida de la conciliación: si hay más, siguen en la próxima (30 minutos después). */
const LIMITE_CONCILIACION = 20;

/**
 * La red de seguridad del webhook. La llama la tarea programada del Worker cada 30 minutos.
 *
 * Vuelve a preguntarle a Wompi por los pagos que quedaron EN PROCESO (PENDING) hace más de 10
 * minutos, por si el webhook que los resolvía se perdió. Solo mira los de los últimos 3 días:
 * más viejo que eso, Wompi ya los cerró hace rato y el webhook se reintentó tres veces.
 *
 * No cubre un intento del que nunca se supo la transacción (el cliente pagó, el webhook falló
 * las cuatro veces y nunca volvió a la página): sin el id no hay qué consultar. Para eso queda
 * el dashboard de Wompi, donde la referencia lleva el número del pedido.
 */
export async function conciliarPagosPendientes(sitio: string): Promise<number | null> {
  const config = configWompi();
  const sb = supabaseServidor();
  // Sin llaves no hay nada que conciliar: es el estado normal antes de configurar Wompi.
  if (!config || !sb) return null;

  const ahora = Date.now();
  const hace10min = new Date(ahora - 10 * 60_000).toISOString();
  const hace3dias = new Date(ahora - 3 * 24 * 3_600_000).toISOString();

  let pendientes: { provider_tx_id: string }[];
  try {
    const res = await fetch(
      `${sb.url}/rest/v1/order_payments?select=provider_tx_id&status=eq.PENDING` +
        `&provider_tx_id=not.is.null&updated_at=lt.${encodeURIComponent(hace10min)}` +
        `&created_at=gt.${encodeURIComponent(hace3dias)}&order=updated_at.asc&limit=${LIMITE_CONCILIACION}`,
      { headers: { apikey: sb.serviceKey, Authorization: `Bearer ${sb.serviceKey}` } }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    pendientes = (await res.json()) as { provider_tx_id: string }[];
  } catch (e) {
    console.error("[pagos] No se pudieron leer los pagos pendientes:", e);
    return null;
  }

  // Uno por uno, igual que los recordatorios: son pocos y así Wompi no recibe veinte consultas
  // de golpe.
  let resueltos = 0;
  for (const p of pendientes) {
    const r = await procesarTransaccion(p.provider_tx_id, { sitio });
    if (r.tipo === "ok" && r.estado !== "PENDING") resueltos++;
  }
  if (pendientes.length) {
    console.log(`[pagos] Conciliación: ${pendientes.length} pendiente(s), ${resueltos} resuelto(s).`);
  }
  return resueltos;
}
