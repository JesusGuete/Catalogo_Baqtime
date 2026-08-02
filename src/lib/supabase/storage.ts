// Subida y borrado de imágenes de producto.
//
// LA TRAMPA QUE ESTE ARCHIVO EXISTE PARA EVITAR (docs/api-endpoints.md §4.3):
//
// Storage y la base de datos son dos sistemas separados. Storage acepta CUALQUIER
// ruta y responde 200. La restricción de formato vive en la columna
// product_photos.storage_path (001_schema.sql:70). Entonces pasa esto:
//
//   1. Subís a "productos/2026/01/foto.webp"  → Storage: 200, todo bien.
//   2. Asociás esa ruta a un producto          → 23514, check constraint.
//   3. El archivo quedó en Storage, huérfano, sin ninguna fila que lo referencie.
//
// Que la subida devuelva 200 NO significa que la ruta sirva. Por eso acá se valida
// el formato ANTES de mandar un solo byte.

import { STORAGE_URL, STORAGE_BUCKET, SUPABASE_ANON_KEY } from "./config";
import { AdminError, desdeStorage, desdeRed } from "./errors";
import { getAccessToken } from "./auth-store";

/** El mismo CHECK que tiene la columna en Postgres: una carpeta, barra, número, extensión. */
export const PATRON_STORAGE_PATH = /^[A-Za-z0-9_-]+\/[0-9]+\.(webp|jpg|jpeg|png)$/;

/** Los tipos que acepta el bucket (005_buckets.sql). */
export const TIPOS_PERMITIDOS = ["image/webp", "image/jpeg", "image/png"] as const;
export type TipoPermitido = (typeof TIPOS_PERMITIDOS)[number];

/** 5 MB — el límite real del bucket, no una convención del front. */
export const TAMANO_MAXIMO = 5 * 1024 * 1024;

const EXTENSION_POR_TIPO: Record<TipoPermitido, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

function esTipoPermitido(tipo: string): tipo is TipoPermitido {
  return (TIPOS_PERMITIDOS as readonly string[]).includes(tipo);
}

// Subir tres fotos de golpe puede caer en el mismo milisegundo y generar dos veces el
// mismo nombre; la segunda subida daría 409 o pisaría a la primera. Este contador
// garantiza nombres únicos y crecientes sin romper el formato numérico que exige la
// restricción de la base.
let ultimoId = 0;
function siguienteId(): number {
  const ahora = Date.now();
  ultimoId = ahora > ultimoId ? ahora : ultimoId + 1;
  return ultimoId;
}

/**
 * Arma la ruta con la convención del panel: `<category_key>/<timestamp>.<ext>`.
 * Lanza AdminError explicando exactamente qué está mal, ANTES de subir nada.
 */
export function construirPath(categoryKey: string, file: File): string {
  if (!categoryKey || !/^[A-Za-z0-9_-]+$/.test(categoryKey)) {
    throw new AdminError(
      `La categoría "${categoryKey}" tiene caracteres que no se pueden usar en el nombre del archivo. Solo letras, números, guion y guion bajo.`,
      { code: "PATH_CATEGORIA" }
    );
  }

  if (!esTipoPermitido(file.type)) {
    throw new AdminError(`"${file.name}" no es WebP, JPG ni PNG.`, { code: "TIPO_INVALIDO" });
  }

  if (file.size > TAMANO_MAXIMO) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new AdminError(`"${file.name}" pesa ${mb} MB y el máximo son 5 MB.`, {
      code: "MUY_GRANDE",
    });
  }

  const path = `${categoryKey}/${siguienteId()}.${EXTENSION_POR_TIPO[file.type]}`;

  // Cinturón y tiradores: si alguna vez se cambia la convención de arriba y queda
  // mal, se corta acá y no en la base, con un archivo ya subido y huérfano.
  if (!PATRON_STORAGE_PATH.test(path)) {
    throw new AdminError(`La ruta generada "${path}" no cumple el formato que exige la base.`, {
      code: "PATH_INVALIDO",
    });
  }

  return path;
}

/**
 * Sube un archivo a una ruta ya validada por construirPath().
 *
 * Usa XMLHttpRequest y no fetch por una sola razón: `fetch` no informa progreso de
 * subida. Con imágenes de hasta 5 MB y una conexión lenta, una barra quieta durante
 * veinte segundos parece que se colgó, y el dueño vuelve a apretar el botón. XHR
 * expone `upload.onprogress`, así que la barra del diseño muestra un porcentaje real
 * y no una animación decorativa.
 */
export function subirImagen(
  path: string,
  file: File,
  onProgress?: (porcentaje: number) => void
): Promise<string> {
  const token = getAccessToken();
  if (!token) {
    return Promise.reject(
      new AdminError("Tu sesión expiró. Vuelve a iniciar sesión.", { code: "NO_SESSION" })
    );
  }

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${STORAGE_URL}/object/${STORAGE_BUCKET}/${path}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type);

    if (onProgress) {
      xhr.upload.onprogress = (ev) => {
        // `lengthComputable` es false cuando el navegador no sabe el total; en ese
        // caso no se inventa un número, simplemente no se actualiza.
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(path);
        return;
      }
      let cuerpo: { message?: string; error?: string } = {};
      try {
        cuerpo = JSON.parse(xhr.responseText) as { message?: string; error?: string };
      } catch {
        /* Storage a veces responde texto plano */
      }
      reject(desdeStorage({ status: xhr.status } as Response, cuerpo));
    };

    xhr.onerror = () => reject(desdeRed(new Error("Fallo de red al subir la imagen")));
    xhr.onabort = () => reject(new AdminError("Subida cancelada.", { code: "ABORTADA" }));

    xhr.send(file);
  });
}

export interface ResultadoBorrado {
  borradas: number;
  error: string | null;
}

/**
 * Borra varias imágenes de una. Así se consume `removed_paths` después de publicar.
 *
 * NO lanza si falla, a propósito: llegar acá significa que la publicación YA salió
 * bien. Que queden archivos huérfanos ocupando cuota es molesto pero inofensivo;
 * mostrar un error rojo justo después de una publicación exitosa haría pensar al
 * dueño que no se publicó. Se devuelve el resultado para que la UI lo mencione como
 * aviso, no como falla.
 */
export async function borrarImagenes(paths: string[]): Promise<ResultadoBorrado> {
  if (!paths.length) return { borradas: 0, error: null };

  const token = getAccessToken();
  if (!token) return { borradas: 0, error: "Sin sesión activa." };

  try {
    const res = await fetch(`${STORAGE_URL}/object/${STORAGE_BUCKET}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: paths }),
    });

    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => ({}))) as { message?: string };
      return { borradas: 0, error: cuerpo.message || `Error ${res.status}` };
    }

    return { borradas: paths.length, error: null };
  } catch (e) {
    return { borradas: 0, error: e instanceof Error ? e.message : "Error de red" };
  }
}
