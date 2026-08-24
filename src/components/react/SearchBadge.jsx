import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconoBuscar } from "./Iconos.jsx";
import { rutaProducto } from "../../lib/product-url.ts";
import { fmt } from "../../lib/search-utils.js";

// El buscador: un botón en el encabezado que baja un panel desde arriba, como una
// persiana, con el campo y productos recomendados.
//
// POR QUÉ UN PORTAL Y NO UN DIV NORMAL. Este componente vive dentro del <header>, y el
// header tiene `backdrop-filter` para el desenfoque. Un elemento con backdrop-filter se
// convierte en el bloque contenedor de sus descendientes `position: fixed`: la capa
// dejaba de medirse contra la ventana y se medía contra el encabezado, así que salía
// encerrada en esa franja de arriba. Con createPortal el panel se monta directamente en
// <body> y vuelve a ocupar la pantalla. Mismo motivo en MenuBadge.
//
// BUSCAR SIEMPRE LLEVA AL CATÁLOGO. El campo filtraba la grilla por evento, así que solo
// servía donde había grilla; desde que el catálogo tiene su propia página, buscar en la
// portada no hacía nada. Ahora el texto viaja en la dirección y esa dirección se comparte.
//
/**
 * @param {{ destacados?: { id: string, name: string, price: number, img: string }[] }} props
 */
export default function SearchBadge({ destacados = [] }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const campo = useRef(null);

  const sugerencias = ["tote", "neceser", "cosmetiquera", "beige", "negro"];

  // Mientras no se escribe nada se muestran recomendados; al escribir, lo que coincide.
  // Es la diferencia entre un panel que ayuda desde el primer segundo y uno que se queda
  // vacío esperando.
  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return destacados.slice(0, 6);
    return destacados
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [texto, destacados]);

  function buscar(valor) {
    const q = valor.trim();
    if (!q) return;
    // Estando ya en el catálogo se filtra sin recargar: recargar para escribir una
    // palabra se siente lento y pierde la posición del scroll.
    if (window.location.pathname === "/catalogo") {
      window.dispatchEvent(new CustomEvent("baqtime:buscar", { detail: q }));
      setAbierto(false);
      return;
    }
    window.location.href = `/catalogo?buscar=${encodeURIComponent(q)}`;
  }

  // Enfocar en un efecto y no dentro del clic: en ese momento el campo todavía no está
  // en el DOM y focus() sobre algo que no existe no hace nada.
  useEffect(() => {
    if (!abierto) return;
    campo.current?.focus();
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

  const capa = (
    <div className="buscador-capa">
      {/* El velo va DEBAJO del panel y cubre el resto: al tocarlo se cierra, que es el
          gesto que todo el mundo intenta primero. */}
      <div className="buscador-velo" onClick={() => setAbierto(false)} />

      <div className="buscador-persiana" role="dialog" aria-modal="true" aria-label="Buscar productos">
        <button
          type="button"
          className="buscador-cerrar"
          aria-label="Cerrar el buscador"
          onClick={() => setAbierto(false)}
        >
          ✕
        </button>

        <div className="buscador-caja">
          <form
            className="buscador-form"
            onSubmit={(e) => {
              e.preventDefault();
              buscar(texto);
            }}
          >
            <input
              ref={campo}
              type="search"
              className="buscador-campo"
              placeholder="¿Qué estás buscando?"
              aria-label="Buscar productos"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </form>

          <div className="buscador-sugerencias">
            <span className="buscador-sugerencias-titulo mono">BÚSQUEDAS FRECUENTES</span>
            {sugerencias.map((s) => (
              <button
                key={s}
                type="button"
                className="buscador-sugerencia"
                onClick={() => {
                  setTexto(s);
                  buscar(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {visibles.length > 0 && (
            <div className="buscador-resultados">
              <p className="buscador-resultados-titulo mono">
                {texto.trim() ? "COINCIDENCIAS" : "TE PUEDE INTERESAR"}
              </p>
              <div className="buscador-grid">
                {visibles.map((p) => (
                  <a key={p.id} className="buscador-card" href={rutaProducto(p)}>
                    <div className="buscador-card-img">
                      <img src={p.img} alt={p.name} loading="lazy" />
                    </div>
                    <span className="buscador-card-nombre">{p.name}</span>
                    <span className="buscador-card-precio mono">{fmt(p.price)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {texto.trim() && visibles.length === 0 && (
            <p className="buscador-vacio">
              Nada con “{texto.trim()}”. Prueba con el tipo de bolso o con un color.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className="search-icon-header"
        aria-expanded={abierto}
        onClick={() => setAbierto(true)}
      >
        <IconoBuscar />
        {/* Con la palabra al lado ya no hace falta `aria-label`: el botón se anuncia solo,
            y quien ve la pantalla no tiene que deducir qué hace una lupa. */}
        <span className="search-texto">Buscar</span>
      </button>

      {abierto && createPortal(capa, document.body)}
    </>
  );
}
