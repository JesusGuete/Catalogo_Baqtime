// Las reglas del recordatorio de pago, sin red ni secretos: cuándo se puede mandar y cuántas
// horas le quedan al cliente. Aparte de recordatorios.ts, que sí habla con Supabase y con el
// proveedor de correo, para poder probarlas solas.

/** Horas desde que se creó el pedido hasta que se le manda el recordatorio. */
export const HORAS_PARA_RECORDAR = 12;

/** A las 24 horas del pedido, expire_stale_orders() lo pasa a "no confirmado" (010_orders.sql). */
export const HORAS_PARA_VENCER = 24;

/** Colombia no tiene horario de verano: es UTC-5 todo el año. */
const UTC_COLOMBIA = -5;

/** Horario en que se permite mandarle un recordatorio al cliente, hora de Colombia: 8 a.m. a 10 p.m. */
const HORA_DESDE = 8;
const HORA_HASTA = 22;

/**
 * ¿Es buena hora para escribirle al cliente? Un recordatorio a las 3 a.m. se siente como spam.
 *
 * No se pierde nada por esperar: la tarea corre cada 30 minutos, y un pedido que quedó
 * pendiente por la noche sale a las 8 a.m. Como el recordatorio sale a las 12 horas y el pedido
 * vence a las 24, siempre queda margen para que el cliente reaccione.
 */
export function esHorarioDeEnvio(ahora: Date): boolean {
  const hora = (ahora.getUTCHours() + UTC_COLOMBIA + 24) % 24;
  return hora >= HORA_DESDE && hora < HORA_HASTA;
}

/**
 * Horas que le quedan al pedido antes de marcarse como no confirmado, redondeadas hacia
 * arriba y nunca menos de 1: "en unas 11 horas" es útil, "en 0 horas" no.
 */
export function horasRestantes(creado: Date, ahora: Date): number {
  const msRestantes = creado.getTime() + HORAS_PARA_VENCER * 3_600_000 - ahora.getTime();
  return Math.max(1, Math.ceil(msRestantes / 3_600_000));
}
