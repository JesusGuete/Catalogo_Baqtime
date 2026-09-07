// Convierte una caja de recorte (018_photo_crop_boxes.sql) en el estilo inline que
// hace que un <img> la muestre, sin generar ningún archivo nuevo — es metadata, no un
// recorte grabado.
//
// POR QUÉ NO ALCANZA CON object-position
// `object-fit: cover` + `object-position` mueven CUÁL punto queda al centro, pero
// nunca dejan hacer zoom a una porción más chica que la foto entera — no hay forma de
// pedirle a `object-position` "usa solo este 40% del ancho". Por eso acá el <img> se
// escala y se corre a mano con `position: absolute` + `width`/`height`/`left`/`top` en
// porcentaje, en vez de con las propiedades pensadas para esto. El contenedor
// (el padre directo del <img>) tiene que tener `position: relative` y `overflow:
// hidden` para que el recorte se vea — sin eso, la imagen escalada se sale del marco.
//
// LA CUENTA, EN UNA LÍNEA
// Si la caja ocupa `w`% del ancho de la foto y tiene que llenar el 100% del
// contenedor, la foto entera se dibuja a `10000/w`% de ancho, y se corre a la
// izquierda `100·x/w`% para que el borde izquierdo de la caja quede pegado al borde
// izquierdo del contenedor. Mismo cálculo en el otro eje con `y`/`h`.

/**
 * @param {{x:number,y:number,w:number,h:number}|null|undefined} caja
 * @returns {Record<string, string>} estilo para pasar directo a `style` en el <img>.
 */
export function estiloRecorte(caja) {
  // Sin caja propia: el <img> se comporta EXACTAMENTE como hoy, sin ningún cálculo de
  // por medio. Es a propósito el mismo camino que ya existía antes de esta migración.
  if (!caja) {
    return { objectFit: "cover" };
  }
  const { x, y, w, h } = caja;
  return {
    position: "absolute",
    width: `${10000 / w}%`,
    height: `${10000 / h}%`,
    left: `${(-100 * x) / w}%`,
    top: `${(-100 * y) / h}%`,
    maxWidth: "none",
    maxHeight: "none",
  };
}
