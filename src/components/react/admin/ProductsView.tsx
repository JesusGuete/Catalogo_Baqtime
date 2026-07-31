import { useMemo, useState } from "react";
import type { Category, ProductWithPhotos } from "../../../types/database";
import { calcularDiff, type TipoCambio } from "../../../lib/admin/diff";
import { publicImageUrl, PLACEHOLDER_IMAGE } from "../../../lib/supabase/config";
import { Boton, Punto, Cargando, Vacio, dinero, type EstadoPunto } from "./ui";

// Pantalla 02 del diseño: la lista del BORRADOR, no del catálogo público.
//
// Cada fila declara en qué estado está respecto de lo publicado. Ese es el punto de
// toda la pantalla: sin esa columna, el dueño no tiene forma de saber qué está viendo
// un cliente ahora mismo y qué es un cambio suyo todavía sin publicar.

interface Props {
  borrador: ProductWithPhotos[];
  publicado: ProductWithPhotos[];
  categorias: Category[];
  cargando: boolean;
  onEditar: (id: string) => void;
  onNuevo: () => void;
}

const ESTADO_UI: Record<TipoCambio | "sin-cambios", { punto: EstadoPunto; texto: string }> = {
  nuevo: { punto: "borrador", texto: "NUEVO" },
  editado: { punto: "borrador", texto: "EDITADO" },
  "se-oculta": { punto: "inactivo", texto: "SE OCULTA" },
  "se-muestra": { punto: "borrador", texto: "VUELVE" },
  eliminado: { punto: "inactivo", texto: "SE BORRA" },
  "sin-cambios": { punto: "vivo", texto: "EN VIVO" },
};

export default function ProductsView({
  borrador,
  publicado,
  categorias,
  cargando,
  onEditar,
  onNuevo,
}: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);

  const etiquetaCategoria = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.key, c.label])),
    [categorias]
  );

  // El estado de cada fila sale del mismo cálculo que usa la pantalla de publicar.
  // Si se calculara aparte, las dos pantallas podrían contradecirse — que es
  // justamente lo que no puede pasar acá.
  const estadoPorId = useMemo(() => {
    const diff = calcularDiff(borrador, publicado);
    return new Map(diff.cambios.map((c) => [c.id, c.tipo]));
  }, [borrador, publicado]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return borrador.filter((p) => {
      if (categoria && p.category_key !== categoria) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.variant ?? "").toLowerCase().includes(q)
      );
    });
  }, [borrador, busqueda, categoria]);

  if (cargando && !borrador.length) return <Cargando />;

  return (
    <>
      <div className="adm-toolbar">
        <input
          type="search"
          className="adm-input adm-buscar"
          placeholder="Buscar por nombre, color o id"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <div className="adm-chips" role="group" aria-label="Filtrar por categoría">
          <button
            type="button"
            className={`adm-mono adm-chip ${categoria === null ? "is-activo" : ""}`}
            onClick={() => setCategoria(null)}
          >
            TODAS
          </button>
          {categorias.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`adm-mono adm-chip ${categoria === c.key ? "is-activo" : ""}`}
              onClick={() => setCategoria(c.key)}
            >
              {c.label.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="adm-toolbar-fin">
          <Boton onClick={onNuevo} variante="acento">
            + NUEVO PRODUCTO
          </Boton>
        </div>
      </div>

      {!categorias.length ? (
        <Vacio titulo="Todavía no hay categorías.">
          <p>
            Sin una categoría no se puede crear ningún producto: la categoría es una
            referencia obligatoria en la base. Creá la primera desde la sección Categorías.
          </p>
        </Vacio>
      ) : !visibles.length ? (
        <Vacio titulo={borrador.length ? "Ningún producto coincide con el filtro." : "El borrador está vacío."}>
          {!borrador.length && <p>Creá el primer producto con el botón de arriba.</p>}
        </Vacio>
      ) : (
        <>
          <div className="adm-tabla-wrap">
            <table className="adm-tabla">
              <thead>
                <tr>
                  <th className="adm-mono" scope="col">
                    <span className="adm-sr">Foto</span>
                  </th>
                  <th className="adm-mono" scope="col">PRODUCTO</th>
                  <th className="adm-mono" scope="col">CATEGORÍA</th>
                  <th className="adm-mono adm-num" scope="col">PRECIO</th>
                  <th className="adm-mono adm-num" scope="col">ORDEN</th>
                  <th className="adm-mono adm-num" scope="col">FOTOS</th>
                  <th className="adm-mono" scope="col">ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => {
                  const fotos = p.product_photos_draft ?? [];
                  const principal = fotos.find((f) => f.position === 0) ?? fotos[0];
                  const tipo = estadoPorId.get(p.id) ?? "sin-cambios";
                  const ui = ESTADO_UI[tipo];
                  const pendiente = tipo !== "sin-cambios";

                  return (
                    <tr
                      key={p.id}
                      className={`adm-fila ${pendiente ? "is-pendiente" : ""} ${!p.is_active ? "is-inactivo" : ""}`}
                      onClick={() => onEditar(p.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onEditar(p.id);
                        }
                      }}
                    >
                      <td>
                        <img
                          className="adm-thumb"
                          src={principal ? publicImageUrl(principal.storage_path) : PLACEHOLDER_IMAGE}
                          alt=""
                          width={44}
                          height={44}
                          loading="lazy"
                        />
                      </td>
                      <td>
                        <span className="adm-fila-nombre">
                          {p.name}
                          {p.variant ? ` · ${p.variant}` : ""}
                        </span>
                        <span className="adm-mono adm-fila-meta">
                          {p.id} · {p.color.toUpperCase()}
                          {!p.is_active && " · OCULTO DEL SITIO"}
                          {fotos.length === 0 && " · SIN FOTOS"}
                        </span>
                      </td>
                      <td>{etiquetaCategoria[p.category_key] ?? p.category_key}</td>
                      <td className="adm-mono adm-num">{dinero(p.price)}</td>
                      <td className="adm-mono adm-num">{p.sort_order}</td>
                      <td className={`adm-mono adm-num ${fotos.length === 0 ? "adm-alerta" : ""}`}>
                        {fotos.length}
                      </td>
                      <td>
                        <Punto estado={ui.punto} texto={ui.texto} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="adm-mono adm-tabla-pie">
            MOSTRANDO {visibles.length} DE {borrador.length} · ORDENADO POR CATEGORÍA Y ORDEN
          </p>
        </>
      )}
    </>
  );
}
