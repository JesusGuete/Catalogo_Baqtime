// Sesión del panel. Mismo patrón de store que cart-store.js: un módulo único que
// guarda el estado y avisa a quien esté suscrito.
//
// DECISIÓN IMPORTANTE — el token vive SOLO en memoria.
//
// Ni localStorage ni sessionStorage ni cookie accesible por JS. El access_token es
// un JWT de administrador: cualquier XSS que lo lea puede escribir el catálogo
// entero. Guardarlo en localStorage convierte un XSS cualquiera en control total y
// permanente del panel. En memoria, el token muere cuando se cierra la pestaña.
//
// El costo de esa decisión, y hay que saberlo: recargar la página cierra la sesión.
// Se compensa renovando el token justo antes de que expire, así una sesión larga de
// edición no se corta a la hora. Ver docs/api-endpoints.md §1.1.
//
// Este módulo NO usa http.ts a propósito: GoTrue (/auth/v1) tiene otra forma de
// respuesta que PostgREST, y así se evita una dependencia circular (http.ts necesita
// el token, y el token sale de acá).

import { AUTH_URL, SUPABASE_ANON_KEY } from "./config";
import { AdminError, desdeRed } from "./errors";

/** Se renueva este tanto ANTES de que expire, para no quedar sin token a mitad de un guardado. */
const MARGEN_RENOVACION_MS = 60_000;

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  /** Epoch en milisegundos. */
  expiraEn: number;
  email: string | null;
  userId: string | null;
}

/** Forma de la respuesta de GoTrue en /token. */
interface RespuestaToken {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user?: { id?: string; email?: string };
}

interface ErrorToken {
  error?: string;
  error_code?: string;
  error_description?: string;
  msg?: string;
}

type Listener = (sesion: Sesion | null) => void;

let sesion: Sesion | null = null;
let temporizador: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function notificar(): void {
  for (const fn of listeners) fn(sesion);
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getSession(): Sesion | null {
  return sesion;
}

/** Lo usa http.ts en cada petición autenticada. */
export function getAccessToken(): string | null {
  return sesion?.accessToken ?? null;
}

/** Minutos que le quedan a la sesión — el shell lo muestra en el pie del sidebar. */
export function minutosRestantes(): number {
  if (!sesion) return 0;
  return Math.max(0, Math.round((sesion.expiraEn - Date.now()) / 60_000));
}

function guardarSesion(datos: RespuestaToken): void {
  sesion = {
    accessToken: datos.access_token,
    refreshToken: datos.refresh_token,
    // expires_at viene en segundos epoch; si falta, se calcula con expires_in.
    expiraEn: datos.expires_at
      ? datos.expires_at * 1000
      : Date.now() + (datos.expires_in ?? 3600) * 1000,
    email: datos.user?.email ?? null,
    userId: datos.user?.id ?? null,
  };
  programarRenovacion();
  notificar();
}

function limpiarTemporizador(): void {
  if (temporizador !== null) {
    clearTimeout(temporizador);
    temporizador = null;
  }
}

function programarRenovacion(): void {
  limpiarTemporizador();
  if (!sesion || typeof window === "undefined") return;
  const enMs = Math.max(5_000, sesion.expiraEn - Date.now() - MARGEN_RENOVACION_MS);
  temporizador = setTimeout(() => {
    void renovar().catch(() => {
      // Si la renovación falla no hay nada que hacer salvo cerrar sesión: seguir con
      // un token vencido haría fallar el próximo guardado con un 42501 confuso, en
      // el peor momento posible.
      void cerrarSesion({ avisarAlServidor: false });
    });
  }, enMs);
}

async function pedirToken(
  grantType: "password" | "refresh_token",
  cuerpo: Record<string, string>
): Promise<RespuestaToken> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_URL}/token?grant_type=${grantType}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  } catch (e) {
    throw desdeRed(e);
  }

  const datos: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = datos as ErrorToken;
    const credencialesMal =
      err.error === "invalid_grant" || err.error_code === "invalid_grant" || res.status === 400;
    throw new AdminError(
      credencialesMal
        ? "Correo o contraseña incorrectos."
        : err.msg || err.error_description || "No se pudo iniciar sesión.",
      { code: err.error_code ?? err.error ?? null, status: res.status }
    );
  }

  return datos as RespuestaToken;
}

export async function iniciarSesion(email: string, password: string): Promise<Sesion> {
  const datos = await pedirToken("password", { email: email.trim(), password });
  guardarSesion(datos);
  return sesion!;
}

export async function renovar(): Promise<Sesion> {
  if (!sesion?.refreshToken) throw new AdminError("No hay sesión que renovar.");
  const datos = await pedirToken("refresh_token", { refresh_token: sesion.refreshToken });
  guardarSesion(datos);
  return sesion!;
}

export async function cerrarSesion({ avisarAlServidor = true } = {}): Promise<void> {
  const token = sesion?.accessToken;
  limpiarTemporizador();
  sesion = null;
  notificar();

  // Se avisa al servidor DESPUÉS de limpiar el estado local: si la llamada falla, la
  // sesión local ya está cerrada igual. Cerrar sesión nunca puede fallar para quien
  // lo pidió.
  if (avisarAlServidor && token) {
    try {
      await fetch(`${AUTH_URL}/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      });
    } catch {
      /* sin ruido: la sesión local ya está cerrada */
    }
  }
}
