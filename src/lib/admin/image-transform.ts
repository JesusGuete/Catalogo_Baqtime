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
}

/**
 * Descarga la foto en `url`, la redibuja aplicando la rotación y/o el espejo pedidos,
 * y devuelve el resultado como WebP — de paso, una foto de celular sin optimizar
 * (2-3 MB típico) sale bastante más liviana sin que nadie lo pida a propósito.
 *
 * `crossOrigin = "anonymous"` es obligatorio: sin eso, el canvas queda "contaminado"
 * (tainted) por una imagen de otro origen y `toBlob()` tira `SecurityError` en vez de
 * devolver el archivo. El bucket público de Supabase Storage ya manda los headers CORS
 * que esto necesita.
 */
export async function transformarImagen(
  url: string,
  opciones: OpcionesTransformacion,
  calidad = 0.92
): Promise<Blob> {
  const img = await cargarImagen(url);

  const giro = opciones.rotar ?? 0;
  // A 90°/270° el lienzo tiene que nacer con el ancho y el alto INTERCAMBIADOS —
  // si no, una foto vertical girada a horizontal saldría recortada por los costados.
  const intercambiado = giro === 90 || giro === 270;
  const canvas = document.createElement("canvas");
  canvas.width = intercambiado ? img.naturalHeight : img.naturalWidth;
  canvas.height = intercambiado ? img.naturalWidth : img.naturalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new AdminError("El navegador no puede procesar imágenes acá.", {
      code: "SIN_CANVAS",
    });
  }

  // Se posiciona el origen en el centro, se gira/espeja, y se dibuja la imagen centrada
  // en sus propias dimensiones ORIGINALES — así el orden de las transformaciones no
  // importa y no hay que calcular offsets a mano para cada combinación.
  ctx.translate(canvas.width / 2, canvas.height / 2);
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
