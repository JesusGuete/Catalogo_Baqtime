import { useMemo } from "react";
import type { RefObject } from "react";
import type { Category, Product, ProductWithPhotos } from "../../../types/database";
import { calcularDiff, type TipoCambio } from "../../../lib/admin/diff";
import { useOrdenOptimista } from "../../../lib/admin/useAdminData";
import { useArrastreOrden } from "../../../lib/admin/useArrastreOrden";
import * as productosRepo from "../../../lib/admin/products.repo";
import { publicImageUrl, PLACEHOLDER_IMAGE } from "../../../lib/supabase/config";
import { Boton, Punto, Cargando, ErrorAviso, IconoAgarre, Vacio, dinero, type EstadoPunto } from "./ui";

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
  /** Elevados a AdminApp: si vivieran acá, se perderían cada vez que se abre
   *  el editor (esta vista se desmonta) y se resetearían al volver. */
  busqueda: string;
  onBusqueda: (v: string) => void;
  categoria: string | null;
  onCategoria: (v: string | null) => void;
  onEditar: (id: string) => void;
  onNuevo: () => void;
  onCambio: () => void;
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
  busqueda,
  onBusqueda,
  categoria,
  onCategoria,
  onEditar,
  onNuevo,
  onCambio,
}: Props) {
  const etiquetaCategoria = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.key, c.label])),
    [categorias]
  );

  // Para que "TODAS" agrupe por categoría en el mismo orden que la pestaña
  // Categorías (position), no alfabético por category_key.
  const posicionPorCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.key, c.position])),
    [categorias]
  );

  // Solo se puede arrastrar para reordenar cuando la lista visible es
  // exactamente todos los productos de una categoría — con "TODAS" o con
  // texto en el buscador, la lista está mezclada o incompleta y reordenar
  // por índice rompería el sort_order de productos que ni se ven.
  const puedeReordenar = categoria !== null && busqueda.trim() === "";

  // El estado de cada fila sale del mismo cálculo que usa la pantalla de publicar.
  // Si se calculara aparte, las dos pantallas podrían contradecirse — que es
  // justamente lo que no puede pasar acá.
  const estadoPorId = useMemo(() => {
    const diff = calcularDiff(borrador, publicado);
    return new Map(diff.cambios.map((c) => [c.id, c.tipo]));
  }, [borrador, publicado]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = borrador.filter((p) => {
      if (categoria && p.category_key !== categoria) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.variant ?? "").toLowerCase().includes(q)
      );
    });
    // Con una categoría específica esto no cambia nada (todas comparten la
    // misma posición). Con "TODAS" agrupa por el orden real de las pestañas
    // de Categorías en vez del alfabético de category_key.
    return [...filtrados].sort((a, b) => {
      const posA = posicionPorCategoria.get(a.category_key) ?? Number.MAX_SAFE_INTEGER;
      const posB = posicionPorCategoria.get(b.category_key) ?? Number.MAX_SAFE_INTEGER;
      return posA !== posB ? posA - posB : a.sort_order - b.sort_order;
    });
  }, [borrador, busqueda, categoria, posicionPorCategoria]);

  // Optimista a propósito: si esperara al servidor como el resto del panel,
  // la fila se quedaría en su lugar viejo hasta que vuelva la respuesta y el
  // arrastre se sentiría trabado. Ver el comentario de useOrdenOptimista.
  const {
    lista: visiblesOrdenados,
    mover,
    guardando,
    error: errorOrden,
  } = useOrdenOptimista(visibles, async (ordenados) => {
    // products_draft no tiene columna product_photos_draft (es una tabla
    // aparte embebida en el select) — hay que sacarla antes del upsert.
    const limpios: Product[] = ordenados.map(({ product_photos_draft: _fotos, ...resto }) => resto);
    await productosRepo.reordenar(limpios);
    onCambio();
  });

  const arrastre = useArrastreOrden({
    cantidad: visiblesOrdenados.length,
    activo: puedeReordenar,
    onMover: mover,
  });

  if (cargando && !borrador.length) return <Cargando />;

  return (
    <>
      <div className="adm-toolbar">
        <input
          type="search"
          className="adm-input adm-buscar"
          placeholder="Buscar por nombre, color o id"
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
        />

        <div className="adm-chips" role="group" aria-label="Filtrar por categoría">
          <button
            type="button"
            className={`adm-mono adm-chip ${categoria === null ? "is-activo" : ""}`}
            onClick={() => onCategoria(null)}
          >
            TODAS
          </button>
          {categorias.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`adm-mono adm-chip ${categoria === c.key ? "is-activo" : ""}`}
              onClick={() => onCategoria(c.key)}
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

      <ErrorAviso error={errorOrden} />

      {!categorias.length ? (
        <Vacio titulo="Todavía no hay categorías.">
          <p>
            Sin una categoría no se puede crear ningún producto: la categoría es una
            referencia obligatoria en la base. Crea la primera desde la sección Categorías.
          </p>
        </Vacio>
      ) : !visibles.length ? (
        <Vacio titulo={borrador.length ? "Ningún producto coincide con el filtro." : "El borrador está vacío."}>
          {!borrador.length && <p>Crea el primer producto con el botón de arriba.</p>}
        </Vacio>
      ) : (
        <>
          <div className={`adm-tabla-wrap ${guardando ? "is-guardando" : ""}`}>
            {/* Roles ARIA explícitos: en ≤640px las filas pasan a display:grid
                (ver admin.css) para el layout de tarjetas, y ahí la semántica
                implícita de tabla no es confiable entre navegadores. Con el rol
                puesto a mano no depende del display computado. */}
            <table
              className={`adm-tabla ${categoria !== null ? "adm-tabla--filtrada" : ""}`}
              role="table"
            >
              <thead role="rowgroup">
                <tr role="row">
                  <th className="adm-mono" scope="col" role="columnheader">
                    <span className="adm-sr">Foto</span>
                  </th>
                  <th className="adm-mono" scope="col" role="columnheader">PRODUCTO</th>
                  <th className="adm-mono" scope="col" role="columnheader">CATEGORÍA</th>
                  <th className="adm-mono adm-num" scope="col" role="columnheader">PRECIO</th>
                  <th className="adm-mono adm-num" scope="col" role="columnheader">ORDEN</th>
                  <th className="adm-mono adm-num" scope="col" role="columnheader">FOTOS</th>
                  <th className="adm-mono" scope="col" role="columnheader">ESTADO</th>
                </tr>
              </thead>
              <tbody
                role="rowgroup"
                ref={arrastre.contenedorRef as RefObject<HTMLTableSectionElement | null>}
              >
                {visiblesOrdenados.map((p, i) => {
                  const fotos = p.product_photos_draft ?? [];
                  const principal = fotos.find((f) => f.position === 0) ?? fotos[0];
                  const tipo = estadoPorId.get(p.id) ?? "sin-cambios";
                  const ui = ESTADO_UI[tipo];
                  const pendiente = tipo !== "sin-cambios";

                  return (
                    <tr
                      key={p.id}
                      {...arrastre.propsItem(i)}
                      className={`adm-fila ${pendiente ? "is-pendiente" : ""} ${!p.is_active ? "is-inactivo" : ""}`}
                      onClick={() => onEditar(p.id)}
                      tabIndex={0}
                      role="row"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onEditar(p.id);
                        }
                      }}
                    >
                      <td className="adm-td-foto" role="cell">
                        <img
                          className="adm-thumb"
                          src={principal ? publicImageUrl(principal.storage_path) : PLACEHOLDER_IMAGE}
                          alt=""
                          width={44}
                          height={44}
                          loading="lazy"
                        />
                      </td>
                      <td className="adm-td-nombre" role="cell">
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
                      <td className="adm-td-categoria" role="cell">
                        {etiquetaCategoria[p.category_key] ?? p.category_key}
                      </td>
                      <td className="adm-mono adm-num adm-td-precio" role="cell">{dinero(p.price)}</td>
                      <td className="adm-mono adm-num adm-td-orden" role="cell">
                        <span className="adm-fila-orden">
                          <span
                            className={`adm-fila-agarre ${puedeReordenar ? "" : "is-deshabilitado"}`}
                            {...arrastre.propsAgarre(i)}
                            aria-label={
                              puedeReordenar
                                ? `Reordenar ${p.name}. Usa las flechas arriba y abajo, o arrastra.`
                                : undefined
                            }
                            title={
                              puedeReordenar
                                ? "Arrastra o usa las flechas para reordenar"
                                : "Elige una sola categoría (no TODAS) y vacía el buscador para reordenar"
                            }
                          >
                            <IconoAgarre />
                          </span>
                          <span className="adm-fila-orden-num">{p.sort_order}</span>
                        </span>
                      </td>
                      <td
                        className={`adm-mono adm-num adm-td-fotos ${fotos.length === 0 ? "adm-alerta" : ""}`}
                        role="cell"
                      >
                        {fotos.length}
                      </td>
                      <td className="adm-td-estado" role="cell">
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
            {puedeReordenar
              ? " · ARRASTRA O USA LAS FLECHAS PARA REORDENAR"
              : " · ELIGE UNA SOLA CATEGORÍA Y VACÍA LA BÚSQUEDA PARA REORDENAR"}
          </p>
        </>
      )}
    </>
  );
}
