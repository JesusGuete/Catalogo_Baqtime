// Cajas de recorte (018_photo_crop_boxes.sql): leerlas/escribirlas desde una
// `FotoParaGuardar`, y calcular la caja "automática" que reproduce exactamente lo que
// la tienda ya muestra hoy con object-fit:cover — el punto de partida cuando el dueño
// abre el recorte de una foto que todavía no tiene ninguno guardado.

import type { CajaRecorte, FotoParaGuardar } from "../../types/database";

export type TipoRecorte = "square" | "editorial";

/** 3:4 — la proporción real de la tarjeta editorial (site.css `.card--editorial`). */
const RELACION_EDITORIAL = 3 / 4;

export function cajaDe(foto: FotoParaGuardar, tipo: TipoRecorte): CajaRecorte | null {
  const { x, y, w, h } =
    tipo === "square"
      ? { x: foto.crop_square_x, y: foto.crop_square_y, w: foto.crop_square_w, h: foto.crop_square_h }
      : {
          x: foto.crop_editorial_x,
          y: foto.crop_editorial_y,
          w: foto.crop_editorial_w,
          h: foto.crop_editorial_h,
        };
  if (x === null || y === null || w === null || h === null) return null;
  return { x, y, w, h };
}

/** Devuelve una copia de `foto` con la caja de `tipo` reemplazada (o borrada, si `caja` es `null`). */
export function conCaja(foto: FotoParaGuardar, tipo: TipoRecorte, caja: CajaRecorte | null): FotoParaGuardar {
  if (tipo === "square") {
    return {
      ...foto,
      crop_square_x: caja?.x ?? null,
      crop_square_y: caja?.y ?? null,
      crop_square_w: caja?.w ?? null,
      crop_square_h: caja?.h ?? null,
    };
  }
  return {
    ...foto,
    crop_editorial_x: caja?.x ?? null,
    crop_editorial_y: caja?.y ?? null,
    crop_editorial_w: caja?.w ?? null,
    crop_editorial_h: caja?.h ?? null,
  };
}

/** Borra las dos cajas — se usa cuando la foto cambia de contenido (girar, espejo, reemplazar):
 *  una caja calculada para la orientación o el archivo viejo ya no tiene sentido sobre el nuevo. */
export function sinCajas(foto: FotoParaGuardar): FotoParaGuardar {
  return conCaja(conCaja(foto, "square", null), "editorial", null);
}

/**
 * La caja centrada más grande de proporción `relacion` (ancho/alto) que entra dentro
 * de una foto de `nw`×`nh` píxeles — exactamente lo que `object-fit: cover` recorta
 * hoy. Es el punto de partida al abrir un recorte que todavía es `null`: el dueño ve
 * lo mismo que ya se ve en la tienda, no una sorpresa.
 */
function cajaAuto(nw: number, nh: number, relacion: number): CajaRecorte {
  const relacionImagen = nw / nh;
  if (relacionImagen > relacion) {
    // La foto es relativamente más ancha que el marco: sobra a los costados.
    const wPct = (relacion / relacionImagen) * 100;
    return { x: (100 - wPct) / 2, y: 0, w: wPct, h: 100 };
  }
  // La foto es relativamente más alta (o ya coincide): sobra arriba y abajo.
  const hPct = (relacionImagen / relacion) * 100;
  return { x: 0, y: (100 - hPct) / 2, w: 100, h: hPct };
}

export function cajaAutoCuadrada(nw: number, nh: number): CajaRecorte {
  return cajaAuto(nw, nh, 1);
}

export function cajaAutoEditorial(nw: number, nh: number): CajaRecorte {
  return cajaAuto(nw, nh, RELACION_EDITORIAL);
}
