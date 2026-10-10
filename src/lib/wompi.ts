// Lo que la tienda necesita de Wompi: firmar un cobro, verificar un evento y consultar una
// transacción. Documentación: https://docs.wompi.co/docs/colombia/
//
// SIN ESTADO Y SIN SECRETOS ESCRITOS ACÁ: cada función recibe la llave o el secreto que usa.
// Quién los lee (del entorno del Worker) y qué se hace con el resultado vive en pagos.ts. Así
// esto no importa `cloudflare:workers` y se puede probar fuera del Worker contra los ejemplos
// de la documentación.
//
// Solo usa `crypto.subtle` y `fetch`, que existen igual en el Worker de Cloudflare y en Node.

export type Ambiente = "test" | "prod";

/** Los estados de una transacción en Wompi. PENDING es el único que no es final. */
export const ESTADOS_TRANSACCION = ["PENDING", "APPROVED", "DECLINED", "VOIDED", "ERROR"] as const;
export type EstadoTransaccion = (typeof ESTADOS_TRANSACCION)[number];

/** Lo que la tienda usa de una transacción. Wompi devuelve más; el resto no se guarda. */
export interface Transaccion {
  id: string;
  reference: string;
  amount_in_cents: number;
  currency: string;
  status: EstadoTransaccion;
  payment_method_type: string | null;
}

/**
 * El ambiente sale del prefijo de la llave pública: `pub_test_…` es sandbox, `pub_prod_…` es
 * producción. Así no hay una variable aparte que pueda quedar desalineada con las llaves.
 */
export function ambienteDeLlave(llavePublica: string): Ambiente | null {
  if (llavePublica.startsWith("pub_test_")) return "test";
  if (llavePublica.startsWith("pub_prod_")) return "prod";
  return null;
}

/** La llave privada tiene que ser del mismo ambiente que la pública, o Wompi responde 401. */
export function llavePrivadaCoincide(llavePrivada: string, ambiente: Ambiente): boolean {
  return llavePrivada.startsWith(`prv_${ambiente}_`);
}

export function urlApi(ambiente: Ambiente): string {
  return ambiente === "prod" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
}

async function sha256Hex(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", datos);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Comparación en tiempo constante: con un `===` el tiempo de respuesta delataría cuántos
 * caracteres del checksum coinciden, y se podría ir adivinando uno por uno.
 */
function igualesSinFiltrarTiempo(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

/**
 * La firma de integridad del cobro: SHA-256 de referencia + monto en centavos + moneda +
 * secreto de integridad, pegados sin separadores.
 *
 * Es lo que impide cambiar el monto en el navegador: el checkout de Wompi recalcula la firma
 * con el mismo secreto y rechaza el pago si no coincide. Por eso se calcula SOLO en el
 * servidor; con el secreto en el navegador, cualquiera firmaría un tote por $1.
 *
 * No se usa `expiration-time` (que también entraría en la firma): el plazo del pedido ya lo
 * controla crear_intento_pago() en la base al pulsar "Pagar ahora".
 */
export function firmaIntegridad(o: {
  reference: string;
  amountInCents: number;
  currency: string;
  secreto: string;
}): Promise<string> {
  return sha256Hex(`${o.reference}${o.amountInCents}${o.currency}${o.secreto}`);
}

/** Lee `transaction.id` de `{ transaction: { id } }`. */
function valorEnRuta(raiz: unknown, ruta: string): unknown {
  let actual: unknown = raiz;
  for (const parte of ruta.split(".")) {
    if (actual === null || typeof actual !== "object") return undefined;
    actual = (actual as Record<string, unknown>)[parte];
  }
  return actual;
}

/** La forma mínima de un evento de Wompi que hace falta para verificarlo y procesarlo. */
export interface EventoWompi {
  event: string;
  environment: string;
  timestamp: number;
  data: { transaction?: { id?: string } };
  signature: { properties: string[]; checksum: string };
}

/**
 * ¿Este evento lo mandó Wompi? El checksum es SHA-256 de los valores de los campos que nombra
 * `signature.properties` (en ese orden, leídos de `data`) + `timestamp` + secreto de eventos.
 *
 * La lista de campos se lee de cada evento y no se fija acá: Wompi avisa que puede cambiar.
 *
 * Aun con el checksum bueno, pagos.ts vuelve a consultar la transacción con la llave privada
 * antes de tocar un pedido. Esto filtra el ruido; la consulta es la que decide.
 */
export async function verificarEvento(
  cuerpo: unknown,
  checksumCabecera: string | null,
  secretoEventos: string
): Promise<boolean> {
  if (!cuerpo || typeof cuerpo !== "object") return false;
  const e = cuerpo as Partial<EventoWompi>;
  const propiedades = e.signature?.properties;
  const checksum = (e.signature?.checksum ?? checksumCabecera ?? "").toLowerCase();
  if (!Array.isArray(propiedades) || !propiedades.length || !checksum) return false;
  if (typeof e.timestamp !== "number" && typeof e.timestamp !== "string") return false;

  let cadena = "";
  for (const ruta of propiedades) {
    const valor = valorEnRuta(e.data, String(ruta));
    if (valor === undefined || valor === null || typeof valor === "object") return false;
    cadena += String(valor);
  }
  const esperado = await sha256Hex(`${cadena}${e.timestamp}${secretoEventos}`);
  // Si la cabecera viene y no coincide con el cuerpo, algo se alteró en el camino.
  if (checksumCabecera && checksumCabecera.toLowerCase() !== checksum) return false;
  return igualesSinFiltrarTiempo(esperado, checksum);
}

function esEstado(valor: unknown): valor is EstadoTransaccion {
  return typeof valor === "string" && (ESTADOS_TRANSACCION as readonly string[]).includes(valor);
}

/** Más que esto y Wompi no va a contestar; el webhook o la conciliación lo reintentan. */
const TIEMPO_MAXIMO_MS = 10_000;

/**
 * Consulta una transacción con la LLAVE PRIVADA. Es la fuente de verdad: desde 2026 Wompi ya
 * no responde esta consulta con la llave pública ni sin autenticar.
 *
 * Devuelve `null` si Wompi no conoce ese id (404). Lanza ante cualquier otro problema (red,
 * llave mala, Wompi caído): quien llama lo trata como un fallo pasajero y se reintenta.
 */
export async function consultarTransaccion(
  id: string,
  llavePrivada: string,
  ambiente: Ambiente
): Promise<Transaccion | null> {
  const res = await fetch(`${urlApi(ambiente)}/transactions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${llavePrivada}` },
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wompi ${res.status} al consultar ${id}: ${await res.text()}`);

  const cuerpo = (await res.json()) as { data?: Record<string, unknown> };
  const t = cuerpo.data;
  if (
    !t ||
    typeof t.id !== "string" ||
    typeof t.reference !== "string" ||
    typeof t.amount_in_cents !== "number" ||
    typeof t.currency !== "string" ||
    !esEstado(t.status)
  ) {
    throw new Error(`Wompi devolvió una transacción con una forma inesperada (${id}).`);
  }
  return {
    id: t.id,
    reference: t.reference,
    amount_in_cents: t.amount_in_cents,
    currency: t.currency,
    status: t.status,
    payment_method_type: typeof t.payment_method_type === "string" ? t.payment_method_type : null,
  };
}
