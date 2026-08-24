import { useEffect, useMemo, useState } from "react";
import { matchesSearch, fmt } from "../../lib/search-utils.js";
import { rutaProducto } from "../../lib/product-url.ts";

// Equivalente React de: search.js + catalog-filters.js + catalog-grid.js juntos.
// Antes eran 3 módulos que se comunicaban tocando el DOM directamente (getElementById,
// innerHTML, dataset de clases "active"/"hidden"). Aquí es un solo componente porque
// los tres compartían el mismo estado (categoría, color, texto de búsqueda, orden) —
// en la versión vanilla ese estado vivía en state.js; aquí vive en useState.
export default function CatalogExplorer({ catalog, onOpenProduct }) {
  const { products: CATALOG, CATS, CATEGORY_LABELS } = catalog;

  /**
   * La categoría inicial sale de la URL: `/catalogo?categoria=tote`.
   *
   * Es lo que permite que el carrusel de la portada mande a una colección concreta, y
   * que ese enlace se pueda compartir. Se lee en el estado INICIAL y no en un efecto:
   * con efecto, la primera pintura mostraría el catálogo entero y saltaría a la
   * categoría un instante después, a la vista del cliente.
   *
   * Se valida contra las categorías reales. Una clave inventada en la barra de
   * direcciones dejaría la pantalla filtrando por algo que no existe: grilla vacía y
   * ninguna categoría marcada, sin manera de entender por qué.
   */
  const [category, setCategory] = useState(() => {
    if (typeof window === "undefined") return null;
    const pedida = new URLSearchParams(window.location.search).get("categoria");
    return CATS.some((c) => c.key === pedida) ? pedida : null;
  });
  /**
   * El texto de búsqueda también puede venir en la dirección: `/catalogo?buscar=tote`.
   *
   * El buscador vive en el encabezado, que está en todas las páginas, y esta grilla solo
   * en /catalogo. Buscando desde la portada no hay a quién avisar, así que el buscador
   * navega hasta acá con el texto puesto. Leerlo del estado inicial —y no de un efecto—
   * evita que se vea el catálogo entero un instante antes de filtrarse.
   */
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("buscar") ?? "";
  });

  // El buscador entero se mudó al encabezado (SearchBadge), que es otra isla y no
  // comparte estado con esta. Se comunican por evento, igual que el carrito.
  //
  // Abrir sin enfocar el campo dejaría al cliente mirando una caja vacía sin saber que
  // ya puede escribir, así que se enfoca y se trae a la vista de un solo movimiento.
  // El campo de búsqueda vive en el encabezado (SearchBadge), que es otra isla. Acá solo
  // llega el texto y se aplica al filtro; la grilla es lo único que este componente tiene
  // que saber dibujar.
  useEffect(() => {
    function alBuscar(e) {
      setSearchQuery(e.detail ?? "");
    }
    window.addEventListener("baqtime:buscar", alBuscar);
    return () => window.removeEventListener("baqtime:buscar", alBuscar);
  }, []);

  // Puente con CollectionsCarousel.astro (componente Astro estático aparte): al hacer
  // clic en "Ver colección" ahí, dispara este evento en vez de llamar una función
  // directamente, porque son dos islas/componentes que no comparten estado en memoria.
  useEffect(() => {
    function onSetCategory(e) {
      setCategory(e.detail.category);
    }
    window.addEventListener("baqtime:set-category", onSetCategory);
    return () => window.removeEventListener("baqtime:set-category", onSetCategory);
  }, []);

  // SE QUITARON "ORDENAR POR" Y "FILTRAR" (el filtro por color).
  //
  // Casi nadie los tocaba y ocupaban un renglón entero encima de la grilla, justo donde
  // empiezan las fotos. Con 32 productos y las categorías a un clic, el cliente encuentra
  // antes recorriendo que configurando.
  //
  // Con ellos se fue todo su estado: `sortBy`, `colorFilter`, `filtersOpen`, la lista de
  // colores por categoría y el efecto que la reconciliaba. Dejarlo apagado habría sido
  // peor: código que nadie ejecuta pero que hay que entender cada vez que se lee esto.
  //
  // El orden que queda es el "natural" del catálogo, que NO es casual: sale de
  // `sort_order`, que el dueño arrastra a mano en el panel. Es su decisión de qué enseñar
  // primero, y antes el selector de orden la pisaba.
  const products = useMemo(() => {
    return CATALOG.filter((p) => !category || p.category === category).filter((p) =>
      matchesSearch(p, searchQuery, CATEGORY_LABELS)
    );
  }, [category, searchQuery]);

  return (
    <div className="cat-layout" id="catalogo">
      <div className="cat-main">
        <div className="section-title">
          <h2>Catálogo</h2>
        </div>

        {/* CATEGORÍAS EN UNA FILA, debajo del título.
            Estuvieron un rato en una barra lateral. En vertical caben más y se leen de un
            golpe, pero se comen una columna entera de ancho en la pantalla donde lo que
            importa es el tamaño de las fotos. En fila ocupan un renglón y devuelven todo
            ese espacio a la grilla.
            Sin contadores y sin píldoras: solo texto, con la activa subrayada. Es la
            navegación más discreta posible, y en una tienda lo que tiene que llamar la
            atención son los productos. */}
        <nav className="cat-tabs-linea" aria-label="Categorías">
          {CATS.map((c) => (
            <button
              key={c.key ?? "todos"}
              type="button"
              className={"cat-tab-linea" + (category === c.key ? " is-activa" : "")}
              aria-current={category === c.key ? "true" : undefined}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </nav>

        <div className="grid">
        {products.map((p) => {
          const sub = p.category === "tote" ? p.variant : CATEGORY_LABELS[p.category];
          return (
            // Es un enlace de verdad, no un div con onClick. Tres cosas que un div no
            // da: Google lo sigue y así llega a la página del producto, se puede copiar
            // o abrir en otra pestaña, y funciona con el teclado.
            // El clic sigue abriendo el modal como siempre — preventDefault evita la
            // navegación, así que la experiencia no cambia.
            <a
              className="card"
              key={p.id}
              href={rutaProducto(p)}
              onClick={(e) => {
                // Respeta ctrl/cmd+clic, clic del medio y "abrir en pestaña nueva".
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onOpenProduct(p);
              }}
            >
              <div className="card-img">
                <img src={p.img} alt={p.name} loading="lazy" />
              </div>
              <div className="card-body">
                <p className="card-name">{p.name}</p>
                <p className="card-sub">{sub}</p>
                <p className="card-price mono">{fmt(p.price)}</p>
              </div>
            </a>
          );
        })}
        </div>
      </div>
    </div>
  );
}
