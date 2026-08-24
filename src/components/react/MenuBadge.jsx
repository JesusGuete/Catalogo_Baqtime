import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// El botón ☰ del encabezado y el panel que despliega.
//
// NO NAVEGA AL TOCARLO, A PROPÓSITO. Antes llevaba directo al catálogo: un clic y ya
// estabas en otra página, hubieras querido ir o no. Un ícono de menú promete "mírame las
// opciones", no "sácame de aquí". Ahora despliega la columna de categorías y solo se
// navega cuando el cliente elige una — y entonces cae en el catálogo ya filtrado.
//
// Las categorías llegan por props desde la página, no se piden acá. La página ya las
// cargó para pintar la tienda; pedirlas de nuevo sería una segunda consulta para
// enseñar lo mismo. En las páginas que no tienen catálogo (las de pedido) llega vacío y
// el panel muestra solo el enlace al catálogo, que es lo único que puede ofrecer.
//
/**
 * @param {{ categorias?: { key: string | null; label: string }[] }} props
 */
export default function MenuBadge({ categorias = [] }) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    // Se bloquea el fondo mientras el panel está abierto: sin esto, el catálogo se
    // desplaza por detrás del menú y el cliente pierde dónde estaba.
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function alTeclear(e) {
      if (e.key === "Escape") setAbierto(false);
    }
    window.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        className="header-menu"
        aria-label="Abrir el menú"
        aria-expanded={abierto}
        onClick={() => setAbierto(true)}
      >
        <svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true">
          <path d="M0 1h20M0 7h20M0 13h20" stroke="currentColor" stroke-width="1.4" />
        </svg>
        <span>Menú</span>
      </button>

      {abierto && createPortal(
        <div
          className="menu-fondo"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAbierto(false);
          }}
        >
          <nav className="menu-panel" aria-label="Categorías">
            <div className="menu-panel-cab">
              <span className="menu-panel-titulo mono">CATEGORÍAS</span>
              <button
                type="button"
                className="menu-cerrar"
                aria-label="Cerrar el menú"
                onClick={() => setAbierto(false)}
              >
                ✕
              </button>
            </div>

            <ul className="menu-lista">
              {/* "Todos" lleva al catálogo sin filtro. Va primero porque es la salida
                  para quien abrió el menú sin saber qué buscaba. */}
              <li>
                <a className="menu-item" href="/catalogo">
                  Todos los productos
                </a>
              </li>
              {categorias
                .filter((c) => c.key !== null)
                .map((c) => (
                  <li key={c.key}>
                    <a className="menu-item" href={`/catalogo?categoria=${c.key}`}>
                      {c.label}
                    </a>
                  </li>
                ))}
            </ul>

            <a className="menu-item menu-item--pie" href="/pedido">
              Consultar mi pedido
            </a>
          </nav>
        </div>,
        document.body
      )}
    </>
  );
}
