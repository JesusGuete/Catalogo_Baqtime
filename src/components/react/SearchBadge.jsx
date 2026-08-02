import { IconoBuscar } from "./Iconos.jsx";

// El botón de buscar del encabezado, al lado del carrito.
//
// Antes vivía dentro del catálogo, pegado al título "Catálogo". El campo de texto sigue
// ahí —es donde se ven los resultados—, pero el botón que lo abre está acá arriba, junto
// al carrito, que es donde la gente lo busca.
//
// El encabezado está en TODAS las páginas, y el catálogo solo en la portada. Por eso el
// botón mira si el catálogo existe en la página actual: si está, avisa por un evento
// (mismo patrón que el carrito); si no, lleva a la portada con #buscar, y el catálogo se
// abre solo al llegar. Sin esto, en la página de un producto el botón no haría nada.
export default function SearchBadge() {
  function abrirBuscador() {
    if (document.getElementById("catalogo")) {
      window.dispatchEvent(new CustomEvent("baqtime:toggle-search"));
    } else {
      window.location.href = "/#buscar";
    }
  }

  return (
    <button
      type="button"
      className="search-icon-header"
      aria-label="Buscar productos"
      onClick={abrirBuscador}
    >
      <IconoBuscar />
    </button>
  );
}
