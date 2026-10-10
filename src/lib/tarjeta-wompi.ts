// La tarjeta del cliente, en el navegador: validarla, cifrarla y cambiarla por un token de Wompi.
//
// LOS DATOS DE LA TARJETA NUNCA LLEGAN AL SERVIDOR DE LA TIENDA. Salen del navegador por HTTPS
// directo a Wompi (POST /tokens/cards con la llave pública), que devuelve un token (tok_…). Al
// servidor de la tienda solo viaja ese token, que no sirve fuera de una transacción de este
// comercio.
//
// No se usa la variante cifrada (JWE con /tokens/keys/tokenization): Wompi no permite llamarla
// desde el navegador (sus respuestas no traen CORS), y la tarjeta tendría que pasar por nuestro
// servidor, que es justo lo que se evita.

export type Ambiente = "test" | "prod";

export function urlApiWompi(ambiente: Ambiente): string {
  return ambiente === "prod" ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
}

export interface DatosTarjeta {
  numero: string;
  cvc: string;
  /** "08" */
  mes: string;
  /** "28" (dos dígitos) */
  anio: string;
  titular: string;
}

// ============================================================================
// Validación y formato (lo que ve y escribe el cliente)
// ============================================================================

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** "4242424242424242" → "4242 4242 4242 4242" (Amex: 4-6-5). Máximo 19 dígitos. */
export function formatearNumero(valor: string): string {
  const d = soloDigitos(valor).slice(0, 19);
  if (/^3[47]/.test(d)) {
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(" ");
  }
  return d.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "082" → "08/2"; "0828" → "08/28". */
export function formatearVencimiento(valor: string): string {
  const d = soloDigitos(valor).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Algoritmo de Luhn: atrapa errores de dedo antes de mandar nada. */
export function luhnValido(numero: string): boolean {
  const d = soloDigitos(numero);
  if (d.length < 13 || d.length > 19) return false;
  let suma = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    suma += n;
  }
  return suma % 10 === 0;
}

export function franquicia(numero: string): "VISA" | "MASTERCARD" | "AMEX" | "DINERS" | null {
  const d = soloDigitos(numero);
  if (/^4/.test(d)) return "VISA";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "MASTERCARD";
  if (/^3[47]/.test(d)) return "AMEX";
  if (/^3(0[0-5]|[68])/.test(d)) return "DINERS";
  return null;
}

/** Errores por campo, en castellano. Vacío = se puede tokenizar. */
export function validarTarjeta(
  t: { numero: string; vencimiento: string; cvc: string; titular: string },
  ahora: Date = new Date()
): Record<string, string> {
  const e: Record<string, string> = {};
  if (t.titular.trim().length < 3) e.titular = "Escribe el nombre como aparece en la tarjeta.";
  if (!luhnValido(t.numero)) e.numero = "Revisa el número de la tarjeta.";
  const m = /^(\d{2})\/(\d{2})$/.exec(t.vencimiento.trim());
  if (!m) {
    e.vencimiento = "Escribe el vencimiento como MM/AA.";
  } else {
    const mes = Number(m[1]);
    const anio = 2000 + Number(m[2]);
    const finDeMes = new Date(anio, mes, 0, 23, 59, 59);
    if (mes < 1 || mes > 12) e.vencimiento = "El mes del vencimiento no es válido.";
    else if (finDeMes < ahora) e.vencimiento = "La tarjeta está vencida.";
  }
  const largoCvc = franquicia(t.numero) === "AMEX" ? 4 : 3;
  if (soloDigitos(t.cvc).length !== largoCvc) e.cvc = `El CVV tiene ${largoCvc} dígitos.`;
  return e;
}

// ============================================================================
// Tokenización
// ============================================================================

export interface TokenTarjeta {
  id: string;
  marca: string | null;
  ultimos4: string | null;
}

/**
 * Cambia la tarjeta por un token de Wompi. Lanza un Error con un mensaje para el cliente si no
 * se puede (datos rechazados por Wompi, sin conexión).
 */
export async function tokenizarTarjeta(
  t: DatosTarjeta,
  llavePublica: string,
  ambiente: Ambiente
): Promise<TokenTarjeta> {
  let res: Response;
  try {
    res = await fetch(`${urlApiWompi(ambiente)}/tokens/cards`, {
      method: "POST",
      headers: { Authorization: `Bearer ${llavePublica}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        number: soloDigitos(t.numero),
        cvc: soloDigitos(t.cvc),
        exp_month: t.mes,
        exp_year: t.anio,
        card_holder: t.titular.trim(),
      }),
    });
  } catch {
    throw new Error("No pudimos conectarnos con el sistema de pagos. Intenta de nuevo.");
  }
  const cuerpo = (await res.json().catch(() => ({}))) as {
    data?: { id?: string; brand?: string; last_four?: string };
    error?: { messages?: Record<string, string[]> };
  };
  if (!res.ok || !cuerpo.data?.id) {
    // Wompi responde 422 con los campos que no le gustaron; al cliente se le dice en simple.
    throw new Error("Wompi no aceptó los datos de la tarjeta. Revísalos e intenta de nuevo.");
  }
  return { id: cuerpo.data.id, marca: cuerpo.data.brand ?? null, ultimos4: cuerpo.data.last_four ?? null };
}

/** Lo que pide 3D Secure del navegador (todo como texto). */
export function datosNavegador(): Record<string, string> {
  return {
    browser_color_depth: String(window.screen.colorDepth),
    browser_screen_height: String(window.screen.height),
    browser_screen_width: String(window.screen.width),
    browser_language: String(window.navigator.language),
    browser_user_agent: String(window.navigator.userAgent),
    browser_tz: String(new Date().getTimezoneOffset()),
  };
}
