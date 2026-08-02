// Lectura del pedido para las páginas públicas (/pedido/gracias y /pedido/[token]).
//
// Va contra `get_order_by_token` y NO contra la tabla: `orders` no tiene ninguna política
// para anon, así que ni con la clave anónima en la mano se puede leer una fila. La función
// es SECURITY DEFINER y devuelve una lista blanca de campos — sin documento, sin dirección
// exacta, sin las notas internas de pago. Ver 010_orders.sql.
//
// Se usa la clave ANÓNIMA a propósito, igual que catalog.ts. La service_role no pinta acá:
// no hace falta saltear RLS para leer algo que la función ya decidió mostrar, y cuanto
// menos código toque esa clave, mejor.
import type { OrderPublic } from "../types/database";

const BASE = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * Resultado de buscar un pedido. Son TRES casos y no dos, porque "no existe" y "no
 * pudimos preguntar" merecen respuestas distintas:
 *
 *   - `no-existe` → 404. Cubre tanto "nunca existió" como "se borró; distinguirlos le
 *     diría a quien prueba tokens al azar cuáles estuvieron vivos alguna vez.
 *   - `error` → 503. Si Supabase no responde, contestar 404 sería decirle al cliente que
 *     su pedido no existe cuando sí existe. Es la diferencia entre "volvé en un rato" y
 *     "perdiste tu compra".
 */
export type ResultadoPedido =
  | { estado: "ok"; pedido: OrderPublic }
  | { estado: "no-existe" }
  | { estado: "error" };

/** Las dos formas de leer un pedido comparten todo salvo qué función llaman. */
async function llamarRpc(
  funcion: string,
  args: Record<string, string>
): Promise<ResultadoPedido> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/rest/v1/rpc/${funcion}`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
  } catch (e) {
    // fetch LANZA ante un fallo de red; no devuelve una respuesta con estado. Sin este
    // catch la excepción sube hasta Astro y la página muere con un 500 y su pantalla de
    // error — justo cuando el cliente solo quería ver en qué va su compra.
    console.error("[pedido] No se pudo contactar a Supabase:", e);
    return { estado: "error" };
  }

  if (!res.ok) {
    console.error(`[pedido] ${funcion} ${res.status}: ${await res.text()}`);
    return { estado: "error" };
  }

  const datos = (await res.json()) as OrderPublic | null;
  return datos ? { estado: "ok", pedido: datos } : { estado: "no-existe" };
}

/** Por el enlace privado: el token es la autorización. */
export async function obtenerPedido(token: string): Promise<ResultadoPedido> {
  if (!token || !token.trim()) return { estado: "no-existe" };
  return llamarRpc("get_order_by_token", { p_token: token });
}

/**
 * Por número de pedido + teléfono, desde el buscador de la tienda.
 *
 * Los dos datos son obligatorios y el teléfono es lo que hace segura la consulta: el
 * número solo son seis dígitos y se pueden probar todos. La normalización (mayúsculas,
 * guiones, espacios) la hace la función de Postgres, no acá, para que valga igual venga
 * de donde venga.
 */
export async function buscarPedido(
  numero: string,
  telefono: string
): Promise<ResultadoPedido> {
  if (!numero?.trim() || !telefono?.trim()) return { estado: "no-existe" };
  return llamarRpc("buscar_pedido", { p_numero: numero, p_telefono: telefono });
}

/**
 * Cabeceras obligatorias de toda página de pedido.
 *
 * `private, no-store` NO es una optimización, es la diferencia entre que funcione y que
 * filtre datos: el resto del sitio usa `s-maxage`, o sea que Cloudflare guarda el HTML ya
 * renderizado en el borde y lo reparte. Sin esto, la página de un cliente podría servirse
 * a otro.
 */
export function cabecerasPrivadas(headers: Headers): void {
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
}
