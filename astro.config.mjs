// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';

// Renderizado en el servidor, no en el build.
//
// Antes el catálogo se horneaba en el HTML al construir. Eso obligaba a reconstruir el
// sitio cada vez que el dueño publicaba, y tenía un modo de falla silencioso: si la
// consulta a Supabase devolvía vacío en ese instante, la tienda quedaba sin productos
// hasta que alguien lo notara. Pasó el 2026-07-31.
//
// Con `output: 'server'` cada visita lee el catálogo del momento. La frescura deja de
// depender de un build, y habilita páginas que no se pueden pre-construir: la de un
// producto y, más adelante, la de seguimiento de un pedido.
//
// El costo se controla con `Cache-Control` por página: Cloudflare guarda el HTML ya
// renderizado en el edge, así que la mayoría de las visitas ni tocan Supabase.
export default defineConfig({
  site: 'https://baqtime.store',
  output: 'server',
  adapter: cloudflare(),
  // El panel salía en el sitemap. Entregarle /admin/ a Google mientras robots.txt lo
  // bloquea es peor que no decir nada: la URL bloqueada nunca se rastrea, así que el
  // `noindex` del panel jamás se lee, y Google puede terminar indexando la dirección
  // pelada de todos modos.
  integrations: [react(), sitemap({ filter: (page) => !page.includes("/admin") })]
});
