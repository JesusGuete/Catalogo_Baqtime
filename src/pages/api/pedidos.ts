// POST /api/pedidos — crea un pedido.
//
// ESTE ARCHIVO CORRE EN EL SERVIDOR Y NUNCA VIAJA AL NAVEGADOR, y de eso dependen las dos
// garantías del flujo nuevo:
//
//  1. EL PRECIO NO LO DICE EL CLIENTE. El cuerpo de la petición trae qué producto y qué
//     iniciales; los precios se vuelven a calcular acá contra el catálogo publicado. El
//     carrito vive en localStorage, o sea que sus precios se editan desde el inspector del
//     navegador — deuda ya documentada en docs/frontend-contract.md. Si confiáramos en lo
//     que manda el cliente, cualquiera compraría un tote por $1.
//
//  2. LA CLAVE service_role SE USA ACÁ Y SOLO ACÁ. Saltea RLS, que es justo lo que hace
//     falta para escribir en tablas que no tienen política de INSERT para nadie. Por eso
//     no está declarada en src/env.d.ts: si no está en el tipo, escribirla en código de
//     cliente es un error de compilación, no una cuestión de criterio.
//
// La escritura en sí la hace create_order() (010_orders.sql, con el correo desde
// 019_correo_cliente.sql) en una sola transacción. Después de guardar, se le manda al
// cliente el correo con el resumen (src/lib/correo.ts), sin que un fallo ahí afecte al pedido.

import type { APIRoute } from "astro";
// El entorno del Worker. `Astro.locals.runtime.env` existía hasta Astro 5 y fue eliminado
// en la 6; este proyecto va por la 7. El módulo virtual `cloudflare:workers` es el
// reemplazo oficial, y sirve igual en `astro dev` (que corre sobre workerd) y en
// producción.
import { env } from "cloudflare:workers";
import type { Category } from "../../types/database";
import { PRICE_SHIP, recargoIniciales } from "../../lib/pricing.js";
import { normalizarCorreo, validateShipping } from "../../lib/shipping-validation.js";
import { enviarConfirmacionPedido, enviarCopiaPedidoTienda } from "../../lib/correo";
import { POLITICA_DATOS_VERSION } from "../../lib/legal";

export const prerender = false;

/** Techo defensivo: nadie compra 60 bolsos de una, y evita que un POST armado a mano pida 10.000 filas. */
const MAX_ITEMS = 50;

interface ItemPedido {
  productId: string;
  initials?: string;
  initialsColorName?: string;
}

interface DatosEnvio {
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  doc: string;
}

/** Fila de `products` tal como la devuelve PostgREST. */
interface FilaProducto {
  id: string;
  category_key: string;
  name: string;
  color: string;
  variant: string | null;
  price: number;
  personalizable: boolean;
  max_initials: number;
  is_active: boolean;
}

function json(cuerpo: unknown, status: number): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Un pedido no se cachea jamás, ni en el navegador ni en el borde de Cloudflare.
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * El secreto del servidor.
 *
 * En producción llega como secreto del Worker (Cloudflare → Variables and Secrets). En
 * `astro dev` llega del archivo .env, que el adaptador carga dentro del mismo `env`.
 * Se lee por índice y no como propiedad estática a propósito: así el nombre no queda
 * expuesto a ningún análisis que pudiera inlinearlo en un bundle de cliente.
 */
function leerSecreto(nombre: string): string | undefined {
  return env[nombre] || undefined;
}

export const POST: APIRoute = async ({ request, url, locals }) => {
  const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = leerSecreto("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    // Sin la clave no hay forma de guardar nada. Se dice claro en el log del servidor y
    // vago al cliente: el detalle de qué variable falta no es asunto de quien compra.
    console.error("[/api/pedidos] Falta PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    return json({ error: "El sistema de pedidos no está disponible en este momento." }, 503);
  }

  let cuerpo: { items?: unknown; shipping?: unknown; consent?: unknown };
  try {
    cuerpo = (await request.json()) as typeof cuerpo;
  } catch {
    return json({ error: "Petición inválida." }, 400);
  }

  const items = Array.isArray(cuerpo.items) ? (cuerpo.items as ItemPedido[]) : [];
  const envio = (cuerpo.shipping ?? {}) as Partial<DatosEnvio>;

  if (!items.length) return json({ error: "El carrito está vacío." }, 400);
  if (items.length > MAX_ITEMS) return json({ error: "Demasiados productos en el pedido." }, 400);

  // Revalidación completa: la del navegador es una cortesía para el que compra, esta es la
  // que cuenta. Es la MISMA función que usa el formulario, así que las reglas —incluida la
  // del documento obligatorio fuera de Barranquilla— no pueden discrepar entre los dos lados.
  const datos: DatosEnvio = {
    name: String(envio.name ?? ""),
    city: String(envio.city ?? ""),
    address: String(envio.address ?? ""),
    phone: String(envio.phone ?? ""),
    email: String(envio.email ?? ""),
    doc: String(envio.doc ?? ""),
  };
  const errores = validateShipping(datos);
  if (Object.keys(errores).length) {
    return json({ error: "Datos de envío incompletos.", errores }, 400);
  }

  // Sin autorización no hay pedido (Ley 1581 de 2012): los datos de arriba son
  // indispensables para producirlo y entregarlo. Se exige `=== true` y no algo "truthy":
  // un "false" en texto o un 1 no son una casilla marcada.
  const consentimiento = (cuerpo.consent ?? {}) as { datos?: unknown; promociones?: unknown };
  if (consentimiento.datos !== true) {
    return json(
      { error: "Debes autorizar el tratamiento de tus datos para hacer el pedido." },
      400
    );
  }

  // --- Catálogo real -------------------------------------------------------
  const rest = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status} en ${path}: ${await res.text()}`);
    return res.json() as Promise<T>;
  };

  const idsPedidos = [...new Set(items.map((i) => String(i.productId ?? "")))].filter(Boolean);
  if (!idsPedidos.length) return json({ error: "El carrito está vacío." }, 400);

  let productos: FilaProducto[];
  let categorias: Category[];
  try {
    const lista = idsPedidos.map((id) => `"${id.replace(/"/g, '""')}"`).join(",");
    [productos, categorias] = await Promise.all([
      // is_active se filtra a mano porque service_role saltea RLS: la política que en el
      // resto del sitio esconde los productos ocultos acá no se aplica. Sin este filtro se
      // podría comprar algo que el dueño sacó del sitio.
      rest<FilaProducto[]>(
        `products?select=id,category_key,name,color,variant,price,personalizable,max_initials,is_active` +
          `&is_active=eq.true&id=in.(${encodeURIComponent(lista)})`
      ),
      rest<Category[]>(
        `categories?select=key,label,default_price,personalizable,max_initials,has_variant,position,is_imported,free_initials,extra_initials_price,initials_palette`
      ),
    ]);
  } catch (e) {
    console.error("[/api/pedidos] No se pudo leer el catálogo:", e);
    return json({ error: "No pudimos confirmar los precios. Intenta de nuevo." }, 502);
  }

  const porId = new Map(productos.map((p) => [p.id, p]));
  const porCategoria = new Map(categorias.map((c) => [c.key, c]));

  // --- Recálculo -----------------------------------------------------------
  const lineas = [];
  for (const item of items) {
    const producto = porId.get(String(item.productId ?? ""));
    if (!producto) {
      // Pasa de verdad: un carrito viejo en localStorage puede nombrar un producto que ya
      // no está publicado. Mejor decirlo que cobrar algo que no existe.
      return json(
        { error: "Uno de los productos ya no está disponible. Revisa tu carrito." },
        409
      );
    }
    const categoria = porCategoria.get(producto.category_key);

    // Las iniciales se recortan al máximo de la categoría y al mismo juego de caracteres
    // que acepta el formulario. Si el producto no es personalizable, se ignoran.
    const maxIniciales = producto.max_initials || 0;
    const iniciales = producto.personalizable
      ? String(item.initials ?? "")
          .toUpperCase()
          .replace(/[^A-ZÑ]/g, "")
          .slice(0, maxIniciales)
      : "";

    const extra = recargoIniciales(categoria, iniciales.length);
    const unitario = producto.price;
    const cantidad = 1; // el carrito modela una línea por unidad, ver cart-store.js

    lineas.push({
      product_id: producto.id,
      product_name: producto.name,
      category_key: producto.category_key,
      category_label: categoria?.label ?? producto.category_key,
      color: producto.color,
      variant: producto.variant,
      initials: iniciales || null,
      initials_color: iniciales ? String(item.initialsColorName ?? "") || null : null,
      unit_price: unitario,
      extra_price: extra,
      quantity: cantidad,
      line_total: (unitario + extra) * cantidad,
    });
  }

  const subtotal = lineas.reduce((suma, l) => suma + l.line_total, 0);
  const envioCosto = PRICE_SHIP;
  const total = subtotal + envioCosto;

  // --- Escritura atómica ---------------------------------------------------
  const correo = normalizarCorreo(datos.email);
  let creado: { id: string; order_number: string; public_token: string };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_order`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_order: {
          customer_name: datos.name.trim(),
          customer_phone: datos.phone.trim(),
          customer_email: correo,
          customer_doc: datos.doc.trim(),
          ship_city: datos.city.trim(),
          ship_address: datos.address.trim(),
          subtotal,
          shipping_cost: envioCosto,
          total,
          // La versión la pone el servidor, no el navegador: es la política que está
          // publicada AHORA, que es la que enlazaba la casilla que se acaba de marcar.
          acepta_datos: true,
          politica_version: POLITICA_DATOS_VERSION,
          acepta_promociones: consentimiento.promociones === true,
        },
        p_items: lineas,
      }),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    creado = (await res.json()) as typeof creado;
  } catch (e) {
    console.error("[/api/pedidos] No se pudo guardar el pedido:", e);
    return json({ error: "No pudimos guardar tu pedido. Intenta de nuevo." }, 502);
  }

  // Absoluta: va dentro del correo y tiene que funcionar desde cualquier teléfono, no solo
  // desde la pestaña donde se hizo el pedido.
  const seguimiento = new URL(`/pedido/${creado.public_token}`, url.origin).href;

  // --- Correo de confirmación ------------------------------------------------
  // El pedido YA está guardado. De acá en adelante nada puede devolverle un error al
  // cliente: enviarConfirmacionPedido() no lanza, y si falla lo anota en el pedido para
  // que el dueño lo reenvíe desde el panel.
  //
  // Se deja corriendo en segundo plano con waitUntil: el Worker termina el envío aunque la
  // respuesta ya haya salido, así el cliente no espera al proveedor de correo para ver su
  // número de pedido. Si el contexto no está (no debería pasar en Cloudflare), se espera.
  //
  // La clave de idempotencia es el id del pedido: si esto se reintenta, Resend no le manda
  // dos correos iguales al cliente.
  const envioCorreo = enviarConfirmacionPedido({
    supabaseUrl: SUPABASE_URL,
    serviceKey: SERVICE_KEY,
    orderId: creado.id,
    para: correo,
    idempotencia: `pedido-${creado.id}`,
    datos: {
      order_number: creado.order_number,
      customer_name: datos.name.trim(),
      ship_city: datos.city.trim(),
      ship_address: datos.address.trim(),
      subtotal,
      shipping_cost: envioCosto,
      total,
      items: lineas,
      seguimiento,
    },
  });

  // La copia para la tienda sale aparte y también en segundo plano. Se manda DESPUÉS de guardar,
  // igual que el correo del cliente, y si falla no toca al pedido ni a ese otro correo.
  const copiaTienda = enviarCopiaPedidoTienda({
    order_number: creado.order_number,
    customer_name: datos.name.trim(),
    customer_phone: datos.phone.trim(),
    customer_email: correo,
    customer_doc: datos.doc.trim() || null,
    ship_city: datos.city.trim(),
    ship_address: datos.address.trim(),
    subtotal,
    shipping_cost: envioCosto,
    total,
    items: lineas,
    panel: new URL("/admin/", url.origin).href,
  });

  const envios = Promise.allSettled([envioCorreo, copiaTienda]);
  if (locals.cfContext) locals.cfContext.waitUntil(envios);
  else await envios;

  return json(
    {
      order_number: creado.order_number,
      public_token: creado.public_token,
      total,
      seguimiento,
    },
    201
  );
};
