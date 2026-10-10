// El punto de entrada del Worker de la tienda.
//
// Antes era el del adaptador de Astro, que solo sabe atender peticiones (`fetch`). Se envuelve
// acá para sumarle las tareas programadas (el recordatorio de pago, el borrado de los datos
// personales vencidos y la conciliación de los pagos en línea), SIN tocar cómo se atienden las
// páginas: `fetch` es exactamente el del adaptador.
//
// wrangler.jsonc apunta a este archivo con `main`, y declara cuándo corre la tarea con
// `triggers.crons` (cada 30 minutos). Si algún día se cambia la frecuencia, se cambia allá y no acá.

import handler from "@astrojs/cloudflare/entrypoints/server";
import { enviarRecordatoriosDePago } from "./lib/recordatorios";
import { anonimizarPedidosVencidos } from "./lib/conservacion";
import { conciliarPagosPendientes } from "./lib/pagos";

// Los tipos de lo que Cloudflare le pasa a una tarea programada, escritos a mano: el proyecto no
// trae @cloudflare/workers-types y solo se usa esto.
interface ContextoDeEjecucion {
  waitUntil(promesa: Promise<unknown>): void;
}

export default {
  fetch: handler.fetch,

  async scheduled(_controller: { cron: string }, _env: unknown, ctx: ContextoDeEjecucion) {
    // waitUntil: el Worker sigue vivo hasta que la corrida termine. El catch es un último seguro:
    // enviarRecordatoriosDePago() no lanza, pero una tarea programada que revienta no deja rastro.
    ctx.waitUntil(
      enviarRecordatoriosDePago().then(
        (r) => {
          if (r.omitido) console.log(`[recordatorios] corrida omitida: ${r.omitido}.`);
        },
        (e) => console.error("[recordatorios] la corrida falló:", e)
      )
    );
    // Independiente de la de arriba: que falle una no frena a la otra.
    ctx.waitUntil(
      anonimizarPedidosVencidos().catch((e) =>
        console.error("[conservacion] la corrida falló:", e)
      )
    );
    // Los pagos en línea que quedaron en proceso, por si se perdió el webhook que los resolvía.
    // Sin llaves de Wompi no hace nada.
    ctx.waitUntil(
      conciliarPagosPendientes(import.meta.env.SITE ?? "https://baqtime.store").catch((e) =>
        console.error("[pagos] la conciliación falló:", e)
      )
    );
  },
};
