import { useEffect, useRef, useState } from "react";
import { IconoBuscar } from "./Iconos.jsx";

// El buscador del encabezado, al lado del carrito.
//
// El CAMPO vive acá, no en el catálogo: se despliega en el mismo lugar donde está el
// botón, que es donde uno mira después de tocarlo. Antes se abría abajo, junto al título
// "Catálogo", y el salto desorientaba.
//
// Quien filtra sigue siendo el catálogo — es el que tiene la grilla. Se comunican por
// evento porque son dos islas distintas y no comparten estado en memoria, el mismo
// patrón que usa el carrito.
//
// El encabezado está en TODAS las páginas y el catálogo solo en la portada: si no hay
// catálogo en la página actual, el botón lleva a /#buscar y allá se abre solo.
export default function SearchBadge() {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const campo = useRef(null);

  function avisarAlCatalogo(valor) {
    window.dispatchEvent(new CustomEvent("baqtime:buscar", { detail: valor }));
  }

  function alternar() {
    if (!document.getElementById("catalogo")) {
      window.location.href = "/#buscar";
      return;
    }
    setAbierto((estaba) => {
      // Al cerrar se limpia el filtro: dejar la grilla recortada con el campo escondido
      // haría parecer que faltan productos, sin nada visible que lo explique.
      if (estaba) {
        setTexto("");
        avisarAlCatalogo("");
      }
      return !estaba;
    });
  }

  // Enfocar en un efecto y no dentro del clic: en ese momento el input todavía tiene
  // ancho 0 y focus() sobre un elemento sin caja no hace nada.
  useEffect(() => {
    if (!abierto) return;
    campo.current?.focus();
    document.getElementById("catalogo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [abierto]);

  // Llegar desde otra página con /#buscar tiene que abrirlo igual.
  useEffect(() => {
    if (window.location.hash === "#buscar" && document.getElementById("catalogo")) {
      setAbierto(true);
    }
  }, []);

  return (
    <div className={"header-buscar" + (abierto ? " is-abierto" : "")}>
      <input
        ref={campo}
        type="search"
        placeholder="Buscar productos..."
        aria-label="Buscar productos"
        aria-hidden={!abierto}
        tabIndex={abierto ? 0 : -1}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          avisarAlCatalogo(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") alternar();
        }}
      />
      <button
        type="button"
        className="search-icon-header"
        aria-label={abierto ? "Cerrar el buscador" : "Buscar productos"}
        aria-expanded={abierto}
        onClick={alternar}
      >
        <IconoBuscar />
      </button>
    </div>
  );
}
