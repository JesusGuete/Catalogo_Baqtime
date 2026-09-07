// Girar y voltear una foto ya subida, del lado del cliente, con <canvas>.
//
// No hay endpoint de Supabase para esto: Storage guarda bytes, no edita píxeles. La
// única forma de "girar una foto" es bajarla, redibujarla girada en un canvas, y subir
// el resultado como un archivo NUEVO — nunca se pisa el original en el mismo lugar.
//
// Por qué un archivo nuevo y no un PATCH sobre el mismo storage_path: Storage no tiene
// verbo "reemplazar bytes en la misma ruta" de forma atómica desde el cliente, y aunque
// lo tuviera, el navegador del cliente que está mirando la ficha en ESE momento tendría
// la vieja en caché con la URL vieja — cambiar el contenido sin cambiar la ruta es la
// clase de bug invisible que solo se nota semanas después. Un storage_path nuevo por
// edición evita esa trampa de raíz, al costo de que la ruta vieja queda huérfana hasta
// que el mecanismo de publicación la barra (ver docs/api-endpoints.md §5, paso 7).

import { AdminError } from "../supabase/errors";

export type Rotacion = 90 | 180 | 270;

export interface OpcionesTransformacion {
  rotar?: Rotacion;
  espejo?: boolean;
  /** Si el lado mayor supera esto (px), se achica proporcionalmente. Ver LADO_MAXIMO. */
  ladoMaximo?: number;
}

/** 1600px de lado mayor es de sobra para cualquier pantalla que use estas fotos (la
 *  más grande es la foto principal del producto, y ni ahí ocupa todo un monitor 4K a
 *  resolución nativa) — bajar de acá no se nota a simple vista y ahorra la mayor
 *  parte del peso de una foto de celular sin tocar. */
const LADO_MAXIMO = 1600;
const CALIDAD_WEBP = 0.85;

/**
 * Redibuja una foto aplicando la rotación y/o el espejo pedidos, y devuelve el
 * resultado como WebP, redimensionada si hace falta — de paso, una foto de celular
 * sin optimizar (2-3 MB típico) sale bastante más liviana sin que nadie lo pida a
 * propósito.
 *
 * `origen` puede ser una URL (se descarga) o un `<img>` YA CARGADO en la página —
 * pasar el elemento que el estudio ya tiene en pantalla evita bajar la foto por
 * segunda vez de la red, que es la parte más lenta de girar o voltear una imagen que
 * ya se estaba mirando. `crossOrigin = "anonymous"` es obligatorio en los dos casos:
 * sin eso, el canvas queda "contaminado" (tainted) por una imagen de otro origen y
 * `toBlob()` tira `SecurityError` en vez de devolver el archivo. El bucket público de
 * Supabase Storage ya manda los headers CORS que esto necesita.
 */
export async function transformarImagen(
  origen: string | HTMLImageElement,
  opciones: OpcionesTransformacion,
  calidad = CALIDAD_WEBP
): Promise<Blob> {
  const img = typeof origen === "string" ? await cargarImagen(origen) : origen;

  const giro = opciones.rotar ?? 0;
  // A 90°/270° el lienzo tiene que nacer con el ancho y el alto INTERCAMBIADOS —
  // si no, una foto vertical girada a horizontal saldría recortada por los costados.
  const intercambiado = giro === 90 || giro === 270;
  const anchoGirado = intercambiado ? img.naturalHeight : img.naturalWidth;
  const altoGirado = intercambiado ? img.naturalWidth : img.naturalHeight;

  const ladoMaximo = opciones.ladoMaximo ?? LADO_MAXIMO;
  const escala = Math.min(1, ladoMaximo / Math.max(anchoGirado, altoGirado));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(anchoGirado * escala);
  canvas.height = Math.round(altoGirado * escala);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new AdminError("El navegador no puede procesar imágenes acá.", {
      code: "SIN_CANVAS",
    });
  }

  // Se posiciona el origen en el centro, se escala, se gira/espeja, y se dibuja la
  // imagen centrada en sus propias dimensiones ORIGINALES — así el orden de las
  // transformaciones no importa y no hay que calcular offsets a mano para cada
  // combinación.
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(escala, escala);
  if (giro) ctx.rotate((giro * Math.PI) / 180);
  if (opciones.espejo) ctx.scale(-1, 1);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new AdminError("No se pudo generar la imagen editada.", { code: "TOBLOB_VACIO" }));
      },
      "image/webp",
      calidad
    );
  });
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new AdminError("No se pudo cargar la foto para editarla.", { code: "IMG_ONERROR" }));
    img.src = url;
  });
}

/**
 * Redimensiona y convierte a WebP un archivo recién elegido en el selector del
 * sistema — antes de que suba un solo byte. Es la misma cuenta que `transformarImagen`
 * pero para un `File` local (nunca pasó por Storage, así que no hace falta
 * `crossOrigin` ni bajar nada de la red: `URL.createObjectURL` lo lee directo del
 * disco). Es lo que hace que una foto de celular de 3 MB quede, típicamente, en el
 * orden de 150-300 KB sin que se note la diferencia en pantalla.
 */
export async function optimizarArchivo(file: File, ladoMaximo = LADO_MAXIMO): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await cargarImagen(url).catch(async () => {
      // Un archivo local no necesita CORS — si `crossOrigin="anonymous"` llegara a
      // fallar por algún motivo (no debería, es same-origin vía blob:), se reintenta
      // sin esa restricción antes de rendirse.
      const sinCors = new Image();
      sinCors.src = url;
      await new Promise<void>((resolve, reject) => {
        sinCors.onload = () => resolve();
        sinCors.onerror = () =>
          reject(new AdminError(`No se pudo leer "${file.name}" como imagen.`, { code: "IMG_ONERROR" }));
      });
      return sinCors;
    });

    const escala = Math.min(1, ladoMaximo / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new AdminError("El navegador no puede procesar imágenes acá.", { code: "SIN_CANVAS" });
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new AdminError("No se pudo optimizar la imagen.", { code: "TOBLOB_VACIO" }));
        },
        "image/webp",
        CALIDAD_WEBP
      );
    });

    // Si por lo que sea el resultado optimizado pesa MÁS que el original (pasa con
    // imágenes ya muy comprimidas, o muy chicas), se sube el original tal cual —
    // "optimizar" nunca debería significar "a veces empeora".
    if (blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
