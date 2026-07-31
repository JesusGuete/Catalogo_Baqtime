// El único lugar del panel que hace fetch a PostgREST.
//
// Todo pasa por acá: la apikey, el Authorization con el JWT del admin, las cabeceras
// `Prefer` y la traducción de errores. Los repositorios de src/lib/admin/ no saben
// qué es una cabecera HTTP — piden "creá esta categoría" y reciben la fila tipada o
// un AdminError.
//
// Sobre `Prefer: return=representation`: sin esa cabecera PostgREST devuelve 201 con
// cuerpo VACÍO y parece que la operación falló cuando en realidad salió bien. Es una
// fuente clásica de confusión, así que acá se manda siempre en las escrituras y
// nadie más tiene que acordarse. Ver docs/api-endpoints.md §3.

import { REST_URL, SUPABASE_ANON_KEY } from "./config";
import { desdeRest, desdeRed, AdminError, type ContextoError } from "./errors";
import { getAccessToken } from "./auth-store";

export type MetodoHttp = "GET" | "POST" | "PATCH" | "DELETE";

export interface OpcionesRest {
  method?: MetodoHttp;
  body?: unknown;
  /** Manda el JWT del admin. Por defecto sí. */
  autenticado?: boolean;
  /** Pide `return=representation`. Por defecto sí en escrituras. */
  devolverFila?: boolean;
  /**
   * `resolution=merge-duplicates` — convierte el POST en un upsert.
   * Se usa para reordenar: ver products.repo.ts, `reordenar()`.
   */
  upsert?: boolean;
  contexto?: ContextoError;
}

function cabeceras(autenticado: boolean): Record<string, string> {
  const h: Record<string, string> = { apikey: SUPABASE_ANON_KEY };
  if (autenticado) {
    const token = getAccessToken();
    if (!token) {
      throw new AdminError("Tu sesión expiró. Volvé a iniciar sesión.", {
        code: "NO_SESSION",
        status: 401,
      });
    }
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

/** Lee el cuerpo una sola vez y lo parsea si se puede. 204 no trae nada. */
async function leerCuerpo(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const texto = await res.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto;
  }
}

/**
 * @param path ruta relativa a /rest/v1, con el querystring ya armado
 * @returns el cuerpo parseado, tipado como `T` (PostgREST siempre devuelve arrays
 *          en las tablas, así que normalmente `T` es `Fila[]`)
 */
export async function rest<T>(path: string, opts: OpcionesRest = {}): Promise<T> {
  const {
    method = "GET",
    body,
    autenticado = true,
    devolverFila = method !== "GET" && method !== "DELETE",
    upsert = false,
    contexto = "",
  } = opts;

  const headers = cabeceras(autenticado);
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const prefer: string[] = [];
  if (devolverFila) prefer.push("return=representation");
  if (upsert) prefer.push("resolution=merge-duplicates");
  if (prefer.length) headers.Prefer = prefer.join(",");

  let res: Response;
  try {
    res = await fetch(`${REST_URL}/${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw desdeRed(e);
  }

  const datos = await leerCuerpo(res);
  if (!res.ok) throw desdeRest(res, datos as never, contexto);
  return datos as T;
}

/**
 * Llama a una función de Postgres. Se separa de rest() porque las RPC devuelven el
 * resultado directo (un número, un array de una fila) y no aceptan `Prefer`.
 */
export async function rpc<T>(
  nombre: string,
  args: Record<string, unknown> = {},
  contexto: ContextoError = ""
): Promise<T> {
  const headers = cabeceras(true);
  headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${REST_URL}/rpc/${nombre}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw desdeRed(e);
  }

  const datos = await leerCuerpo(res);
  if (!res.ok) throw desdeRest(res, datos as never, contexto);
  return datos as T;
}
