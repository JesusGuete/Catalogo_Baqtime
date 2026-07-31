// Sitemap de las páginas de producto.
//
// `@astrojs/sitemap` no puede generar estas URLs: se ejecuta al construir y las páginas
// de producto son rutas dinámicas que solo existen cuando alguien las pide. El
// integrador ve `/producto/[slug]` como un patrón, no como 32 direcciones.
//
// Por eso este endpoint se renderiza en el servidor y arma la lista leyendo el catálogo
// del momento. Un producto que se despublica desaparece del sitemap en la siguiente
// petición, sin reconstruir nada.

import type { APIRoute } from "astro";
import { loadCatalog } from "../lib/catalog";
import { rutaProducto } from "../lib/product-url";

const escapar = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const GET: APIRoute = async ({ site }) => {
  const base = site?.href.replace(/\/$/, "") ?? "https://baqtime.store";
  const { products } = await loadCatalog();

  const urls = products
    .map((p) => `  <url><loc>${escapar(base + rutaProducto(p))}</loc></url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Más largo que el de las páginas: que un producto nuevo tarde unos minutos en
      // aparecer en el sitemap no le molesta a nadie, y evita rearmarlo en cada visita
      // de un rastreador.
      "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });
};
