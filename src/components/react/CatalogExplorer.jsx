import { useEffect, useMemo, useState } from "react";
import { SORTERS, matchesSearch, fmt } from "../../lib/search-utils.js";
import { rutaProducto } from "../../lib/product-url.ts";

// Equivalente React de: search.js + catalog-filters.js + catalog-grid.js juntos.
// Antes eran 3 módulos que se comunicaban tocando el DOM directamente (getElementById,
// innerHTML, dataset de clases "active"/"hidden"). Aquí es un solo componente porque
// los tres compartían el mismo estado (categoría, color, texto de búsqueda, orden) —
// en la versión vanilla ese estado vivía en state.js; aquí vive en useState.
export default function CatalogExplorer({ catalog, onOpenProduct }) {
  const { products: CATALOG, CATS, CATEGORY_LABELS } = catalog;
  const [category, setCategory] = useState(null);
  const [colorFilter, setColorFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [sortBy, setSortBy] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Puente con CollectionsCarousel.astro (componente Astro estático aparte): al hacer
  // clic en "Ver colección" ahí, dispara este evento en vez de llamar una función
  // directamente, porque son dos islas/componentes que no comparten estado en memoria.
  useEffect(() => {
    function onSetCategory(e) {
      setCategory(e.detail.category);
      setColorFilter(null);
    }
    window.addEventListener("baqtime:set-category", onSetCategory);
    return () => window.removeEventListener("baqtime:set-category", onSetCategory);
  }, []);

  // Si el filtro de color activo ya no existe en la categoría elegida, se limpia
  // (equivalente a reconcileColorFilter() en catalog-filters.js).
  const colorsInCategory = useMemo(() => {
    const pool = category ? CATALOG.filter((p) => p.category === category) : CATALOG;
    return [...new Set(pool.map((p) => p.groupKey))];
  }, [category]);

  useEffect(() => {
    if (colorFilter && !colorsInCategory.includes(colorFilter)) {
      setColorFilter(null);
    }
  }, [colorsInCategory, colorFilter]);

  const products = useMemo(() => {
    const filtered = CATALOG.filter((p) => !category || p.category === category)
      .filter((p) => !colorFilter || p.groupKey === colorFilter)
      .filter((p) => matchesSearch(p, searchQuery, CATEGORY_LABELS));
    const sorter = SORTERS[sortBy];
    if (sorter) filtered.sort(sorter); // "" = relevancia, orden natural del catálogo
    return filtered;
  }, [category, colorFilter, searchQuery, sortBy]);

  return (
    <>
      <div className="cat-bg-wrap" id="catBgWrap">
        <div className="section-title" id="catalogo">
          <h2>Catálogo</h2>
          <div className={"search-box" + (searchExpanded ? " expanded" : "")}>
            <button
              type="button"
              className="search-icon-btn"
              aria-label="Buscar"
              onClick={() => setSearchExpanded((v) => !v)}
            >
              🔍
            </button>
            <input
              type="search"
              placeholder="Buscar productos..."
              aria-label="Buscar productos"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="thread-strip">
          <div className="cat-tabs">
            {CATS.map((c) => (
              <button
                key={c.key ?? "todos"}
                type="button"
                className={"cat-tab" + (category === c.key ? " active" : "")}
                onClick={() => {
                  setCategory(c.key);
                  setColorFilter(null);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="section-title tight">
          <div className="sort-box">
            <label htmlFor="sortSelect" className="sort-label">Ordenar por</label>
            <select id="sortSelect" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="">Relevancia</option>
              <option value="price-desc">Precio: mayor a menor</option>
              <option value="price-asc">Precio: menor a mayor</option>
              <option value="name-asc">Nombre, ascendente</option>
              <option value="name-desc">Nombre, descendente</option>
            </select>
          </div>
          <div className="filter-dropdown">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(e) => {
                e.stopPropagation();
                setFiltersOpen((v) => !v);
              }}
            >
              {colorFilter ? `Filtrar: ${colorFilter} ▾` : "Filtrar ▾"}
            </button>
            <div className={"filters" + (filtersOpen ? "" : " hidden")}>
              <button
                type="button"
                className={"filter-btn" + (colorFilter === null ? " active" : "")}
                onClick={() => {
                  setColorFilter(null);
                  setFiltersOpen(false);
                }}
              >
                Todos los colores
              </button>
              {colorsInCategory.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={"filter-btn" + (colorFilter === c ? " active" : "")}
                  onClick={() => {
                    setColorFilter(c);
                    setFiltersOpen(false);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

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
    </>
  );
}
