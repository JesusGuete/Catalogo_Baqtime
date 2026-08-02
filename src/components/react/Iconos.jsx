// Íconos del encabezado de la tienda.
//
// Antes eran los emoji 🛒 y 🔍. El problema del emoji no es estético: cada sistema
// operativo lo dibuja distinto (en Windows el carrito es azul, en Android verde, en iOS
// gris), así que el encabezado de la marca se veía diferente en cada teléfono y nunca
// combinaba con la paleta. Un SVG hereda `currentColor` y se ve igual en todas partes.
//
// Trazo fino y esquinas redondeadas para que acompañen a la tipografía Unna del logo.

export function IconoBuscar({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <line x1="15.8" y1="15.8" x2="20.5" y2="20.5" />
    </svg>
  );
}

/** Bolsa de compras con asa, no un carrito de supermercado: es una tienda de bolsos. */
export function IconoBolsa({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 7.5h15l-1.1 12.2a1.4 1.4 0 0 1-1.4 1.3H7a1.4 1.4 0 0 1-1.4-1.3L4.5 7.5Z" />
      <path d="M8.75 10V6.25a3.25 3.25 0 0 1 6.5 0V10" />
    </svg>
  );
}
