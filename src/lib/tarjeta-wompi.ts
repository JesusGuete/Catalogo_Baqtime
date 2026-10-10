// La tarjeta del cliente, en el navegador: validarla, cifrarla y cambiarla por un token de Wompi.
//
// LOS DATOS DE LA TARJETA NUNCA LLEGAN AL SERVIDOR DE LA TIENDA. Salen del navegador cifrados
// (JWE, RSA-OAEP-256 + A256GCM, con la llave de cifrado que publica Wompi) directo a Wompi, que
// devuelve un token (tok_…). Al servidor de la tienda solo viaja ese token, que no sirve para nada
// fuera de una transacción de este comercio y se puede usar como máximo dos veces.
//
// Sin dependencias: el cifrado lo hace la Web Crypto API del navegador. Funciona igual en Node,
// que es como se prueba contra los ejemplos.

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
// Cifrado JWE (RSA-OAEP-256 + A256GCM), formato compacto
// ============================================================================

function base64url(bytes: Uint8Array): string {
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemABytes(pem: string): Uint8Array<ArrayBuffer> {
  const b64 = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  const binario = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Cifra `datos` para la llave pública PEM de Wompi. Devuelve el JWE compacto:
 * header.llave_cifrada.iv.texto_cifrado.etiqueta (todo en base64url).
 */
export async function cifrarJwe(datos: unknown, pemPublica: string): Promise<string> {
  const sutil = globalThis.crypto.subtle;
  const llaveRsa = await sutil.importKey(
    "spki",
    pemABytes(pemPublica),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  const cabecera = base64url(
    new TextEncoder().encode(JSON.stringify({ alg: "RSA-OAEP-256", enc: "A256GCM" }))
  );
  // La llave de contenido (CEK): 256 bits al azar, una por cada cifrado.
  const cek = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const cekCifrada = new Uint8Array(await sutil.encrypt({ name: "RSA-OAEP" }, llaveRsa, cek));
  const llaveAes = await sutil.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  // AES-GCM devuelve el texto cifrado con la etiqueta de 16 bytes pegada al final.
  const cifrado = new Uint8Array(
    await sutil.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(cabecera),
        tagLength: 128,
      },
      llaveAes,
      new TextEncoder().encode(JSON.stringify(datos))
    )
  );
  const texto = cifrado.slice(0, cifrado.length - 16);
  const etiqueta = cifrado.slice(cifrado.length - 16);

  return [cabecera, base64url(cekCifrada), base64url(iv), base64url(texto), base64url(etiqueta)].join(
    "."
  );
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
  const api = urlApiWompi(ambiente);
  const autorizacion = { Authorization: `Bearer ${llavePublica}` };

  let pem: string;
  try {
    const res = await fetch(`${api}/tokens/keys/tokenization`, { headers: autorizacion });
    const cuerpo = (await res.json()) as { data?: { publicKey?: string } };
    if (!res.ok || !cuerpo.data?.publicKey) throw new Error(String(res.status));
    pem = cuerpo.data.publicKey;
  } catch {
    throw new Error("No pudimos conectarnos con el sistema de pagos. Intenta de nuevo.");
  }

  const payload = await cifrarJwe(
    {
      number: soloDigitos(t.numero),
      cvc: soloDigitos(t.cvc),
      exp_month: t.mes,
      exp_year: t.anio,
      card_holder: t.titular.trim(),
    },
    pem
  );

  let res: Response;
  try {
    res = await fetch(`${api}/tokens/cards`, {
      method: "POST",
      headers: { ...autorizacion, "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
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
