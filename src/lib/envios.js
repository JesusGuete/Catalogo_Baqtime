// Cuánto cuesta y cuánto tarda el envío, según el municipio.
//
// EL ÚNICO LUGAR QUE SABE CALCULAR UN ENVÍO. Lo usan el carrito, el checkout (para mostrarlo)
// y /api/pedidos (para cobrarlo). El servidor recalcula con esta misma función, así que el
// navegador nunca decide cuánto se cobra.
//
// Las tarifas son las cotizaciones de Inter Rapidísimo desde Barranquilla para los 1.119
// municipios, que el dueño cotizó uno por uno (docs/Envios-cotizaciones.xlsx →
// src/data/tarifas-envio.json: [precio, días de tránsito], o null si no hay cobertura).
//   * Cada bolso adicional al primero: +$4.000.
//   * Tiempo: base de 2 a 4 días hábiles desde que se aprueba el pago (producción + envío),
//     más los días de tránsito ("Base" en el Excel = 0).
// Para cambiar un precio: se corrige el Excel y se regenera tarifas-envio.json.
//
// La lista de municipios (src/data/municipios.json) sale del paquete colombia-cities (MIT),
// que replica la DIVIPOLA del DANE.

import MUNICIPIOS from "../data/municipios.json";
import TARIFAS from "../data/tarifas-envio.json";

export const RECARGO_BOLSO_ADICIONAL = 4000;
const DIAS_BASE = [2, 4];

/** Clave sin tildes ni mayúsculas: "Medellín" y "medellin" son el mismo municipio. */
function clave(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Los departamentos, en orden alfabético. */
export const DEPARTAMENTOS = Object.keys(MUNICIPIOS);

/** Los municipios de un departamento, o [] si el departamento no existe. */
export function municipiosDe(departamento) {
  return MUNICIPIOS[departamento] ?? [];
}

/** "Medellín, Antioquia" — lo que se guarda en orders.ship_city. Bogotá no repite. */
export function nombreDestino(departamento, municipio) {
  return departamento === municipio ? municipio : `${municipio}, ${departamento}`;
}

/**
 * El envío a un municipio para un pedido de `bolsos` artículos.
 *
 * - `null`: el municipio no existe en ese departamento (el checkout pide elegir; el servidor
 *   rechaza el pedido).
 * - `{ sinCobertura: true }`: existe, pero Inter Rapidísimo no llega. No se puede pedir por
 *   la tienda; se coordina por WhatsApp.
 *
 * @returns {{ precio: number, diasMin: number, diasMax: number, sinCobertura?: false } | { sinCobertura: true } | null}
 */
export function calcularEnvio(departamento, municipio, bolsos = 1) {
  const real = municipiosDe(departamento).find((m) => clave(m) === clave(municipio));
  if (!real) return null;
  const tarifa = TARIFAS[departamento]?.[real];
  if (!tarifa) return { sinCobertura: true };
  const [precio, dias] = tarifa;
  return {
    precio: precio + RECARGO_BOLSO_ADICIONAL * Math.max(0, (bolsos | 0) - 1),
    diasMin: DIAS_BASE[0] + dias,
    diasMax: DIAS_BASE[1] + dias,
  };
}

/** "6 a 8 días hábiles". */
export function textoEntrega(envio) {
  return `${envio.diasMin} a ${envio.diasMax} días hábiles`;
}

/** El envío más barato, para mostrar "desde $10.000" antes de saber el destino. */
export const ENVIO_DESDE = Math.min(
  ...Object.values(TARIFAS).flatMap((d) => Object.values(d).filter(Boolean).map((t) => t[0]))
);
