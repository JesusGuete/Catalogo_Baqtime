// Los datos legales de la tienda, en un solo lugar.
//
// Los usan la política de datos, el footer, el checkout y el endpoint de pedidos. Si
// cambia la dirección o el correo, se cambia acá y queda igual en todas partes: dos
// páginas legales que dicen cosas distintas son peor que ninguna.
//
// Baqtime opera como persona natural; "Baqtime" es el nombre comercial. La cédula del
// titular NO se publica, por decisión del dueño: no va acá ni en ninguna página.

export const RESPONSABLE = {
  nombre: "Baqtime",
  direccion: "Diagonal 32 #88-699, Cartagena, Bolívar",
  correo: "baqtime.store@gmail.com",
  telefono: "+57 313 4954478",
} as const;

/**
 * Versión de la Política de Tratamiento de Datos que está publicada.
 *
 * Se guarda en cada pedido junto con la hora de la autorización (024_autorizacion_datos.sql):
 * es la prueba de QUÉ texto aceptó el cliente, que el Decreto 1377 de 2013 (art. 8) obliga a
 * conservar. Por eso, cualquier cambio de fondo en /politica-de-datos sube esta fecha.
 *
 * Historial: 2026-10-07 (primera versión) · 2026-10-07.2 (conservación: un mes después de la
 * entrega, en vez de "lo que exijan las normas contables") · 2026-10-07.3 (las fuentes dejan
 * de venir de Google Fonts) · 2026-10-10 (el pago se procesa en línea con Wompi, que recibe los
 * datos del pago).
 */
export const POLITICA_DATOS_VERSION = "2026-10-10";
export const POLITICA_DATOS_VIGENCIA = "10 de octubre de 2026";
export const POLITICA_DATOS_RUTA = "/politica-de-datos";

/**
 * Términos y condiciones de venta. Misma regla: un cambio de fondo actualiza la fecha.
 * Historial: 2026-10-07 (primera versión) · 2026-10-10 (medios de pago: en línea con Wompi).
 */
export const TERMINOS_VIGENCIA = "10 de octubre de 2026";
export const TERMINOS_RUTA = "/terminos";
