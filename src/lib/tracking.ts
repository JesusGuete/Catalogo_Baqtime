// Rastreo de envíos.
//
// EL PUNTO DE ESTE ARCHIVO ES SER EL ÚNICO LUGAR QUE SABE ARMAR UN ENLACE DE RASTREO.
// Cuando exista una integración por API con la transportadora, o cuando Inter Rapidísimo
// cambie la dirección de su rastreador, se toca acá y en ningún otro lado.
//
// ESTADO DE LA INTEGRACIÓN CON INTER RAPIDÍSIMO (verificado, no supuesto):
// no hay una API pública, autogestionada y documentada. Lo que existe:
//   * https://siguetuenvio.interrapidisimo.com/ — el rastreador público oficial.
//   * Enlaces directos del tipo www3.interrapidisimo.com:8082/SiguetuEnvio/shipment/<guía>,
//     que se ven circular pero viven en un host y puerto que parecen infraestructura
//     heredada. NO es un contrato documentado y puede romperse sin aviso.
//   * Una "Documentación Servicio Web API REST — Integraciones B2B" (Release 6, abril
//     2022) que solo aparece republicada en sitios de terceros, nunca en un dominio
//     oficial. Deliberadamente NO se copió nada de ahí: no hay forma de verificar que siga
//     vigente, e inventar un endpoint es peor que no tenerlo.
//   * Los portales que sí son oficiales exigen credenciales de cliente corporativo.
// Por eso: número de guía cargado a mano, y el enlace apunta al rastreador público.

/** La transportadora por defecto. `orders.carrier` es texto libre justamente para que esto no sea el único valor posible. */
export const TRANSPORTADORA_POR_DEFECTO = "Inter Rapidísimo";

const RASTREO_INTERRAPIDISIMO = "https://siguetuenvio.interrapidisimo.com/";

/**
 * Enlace público para rastrear una guía.
 *
 * Devuelve `null` cuando no hay nada que rastrear todavía. Que devuelva `null` en vez de
 * una cadena vacía es a propósito: obliga a quien lo use a decidir qué mostrar en ese caso
 * en vez de pintar un botón que no lleva a ningún lado.
 *
 * Hoy el rastreador oficial se abre sin la guía precargada, así que la vista del cliente
 * muestra además el número para copiar. Es menos cómodo que un enlace directo, y es
 * honesto: prefiero un paso extra a un enlace que se rompa en silencio.
 */
export function urlRastreo(
  _transportadora: string | null | undefined,
  guia: string | null | undefined
): string | null {
  if (!guia || !guia.trim()) return null;
  return RASTREO_INTERRAPIDISIMO;
}
