import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Category } from "../../../types/database";
import * as categoriasRepo from "../../../lib/admin/categories.repo";
import { validarCategoria, esValido } from "../../../lib/admin/validation";
import { useAccion, useOrdenOptimista } from "../../../lib/admin/useAdminData";
import { useArrastreOrden } from "../../../lib/admin/useArrastreOrden";
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  ErrorAviso,
  Etiqueta,
  IconoAgarre,
  Interruptor,
  Numero,
  Texto,
  Vacio,
  dinero,
} from "./ui";

// Pantalla 05 del diseño. Es la que justifica 008_category_rules.sql.
//
// Cada regla se muestra en el idioma del dueño ("El subtítulo muestra la variante") y
// abajo, en mono, el nombre real de la columna. Las dos cosas: él necesita entender
// qué hace, y quien lo asista necesita saber qué columna es.
//
// Antes de 008 estas reglas eran `if (category === "tote")` en el código del front.
// El catálogo arranca vacío y el dueño crea cada categoría desde acá, así que una
// categoría que el front nunca vio es el caso NORMAL. Con las reglas en el código,
// una categoría importada nueva se quedaba sin su aviso de demora en silencio.

interface Props {
  categorias: Category[];
  conteoPorCategoria: Record<string, number>;
  cargando: boolean;
  onCambio: () => void;
}

const CATEGORIA_NUEVA: Category = {
  key: "",
  label: "",
  default_price: 0,
  personalizable: false,
  max_initials: 0,
  has_variant: false,
  position: 1,
  is_imported: false,
  free_initials: 0,
  extra_initials_price: 0,
  initials_palette: [],
};

/** La paleta de la marca. Vive en el front porque no cambia por categoría — 008 §"DELIBERATELY NOT SOLVED". */
const COLORES_MARCA = [
  { nombre: "Plateado", hex: "#C9C9C9" },
  { nombre: "Dorado", hex: "#9C7A3C" },
  { nombre: "Vino", hex: "#6E1F2A" },
  { nombre: "Blush", hex: "#E7BEC1" },
  { nombre: "Negro", hex: "#26221D" },
];

export default function CategoriesView({
  categorias,
  conteoPorCategoria,
  cargando,
  onCambio,
}: Props) {
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [form, setForm] = useState<Category | null>(null);
  const [esNueva, setEsNueva] = useState(false);
  const reglasRef = useRef<HTMLElement>(null);

  // Solo en modo apilado (mismo corte que .adm-cats en 1100px, ver admin.css):
  // en dos columnas el formulario ya está a la vista, bajar el scroll ahí
  // sería un salto molesto que nadie pidió. Se espera al próximo frame porque
  // en "+ CREAR LA PRIMERA" el <aside> todavía no existe en el DOM en el
  // momento del click (form pasa de null a un valor recién con este render).
  function bajarAlFormulario() {
    if (!window.matchMedia("(max-width: 1100px)").matches) return;
    requestAnimationFrame(() => {
      reglasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Al recargar desde el servidor hay que refrescar el formulario, si no se queda
  // mostrando lo que había antes de guardar.
  useEffect(() => {
    if (esNueva) return;
    if (seleccionada === null && categorias.length) {
      setSeleccionada(categorias[0]!.key);
      setForm({ ...categorias[0]! });
      return;
    }
    const actual = categorias.find((c) => c.key === seleccionada);
    if (actual) setForm({ ...actual });
  }, [categorias, seleccionada, esNueva]);

  const errores = form ? validarCategoria(form) : {};
  const valido = form !== null && esValido(errores);

  const guardar = useAccion(async () => {
    if (!form) return;
    if (esNueva) {
      await categoriasRepo.crear(form);
      setEsNueva(false);
      setSeleccionada(form.key);
    } else {
      const { key: _k, ...cambios } = form;
      await categoriasRepo.editar(form.key, cambios);
    }
    onCambio();
  });

  const borrar = useAccion(async (key: string) => {
    await categoriasRepo.borrar(key);
    setSeleccionada(null);
    setForm(null);
    onCambio();
  });

  // A diferencia de productos, acá no hay filtro ni buscador: `categorias` ya
  // es la lista completa, así que reordenar por índice siempre es seguro.
  // Optimista, igual que en Productos (ver el comentario de useOrdenOptimista).
  const {
    lista: categoriasOrdenadas,
    mover,
    guardando,
    error: errorOrden,
  } = useOrdenOptimista(categorias, async (ordenadas) => {
    await categoriasRepo.reordenar(ordenadas);
    onCambio();
  });

  const arrastre = useArrastreOrden({ cantidad: categoriasOrdenadas.length, onMover: mover });

  function actualizar<K extends keyof Category>(campo: K, valor: Category[K]) {
    setForm((f) => (f ? { ...f, [campo]: valor } : f));
  }

  function nueva() {
    const siguientePos = categorias.length
      ? Math.max(...categorias.map((c) => c.position)) + 1
      : 1;
    setEsNueva(true);
    setSeleccionada(null);
    setForm({ ...CATEGORIA_NUEVA, position: siguientePos });
  }

  function alternarColor(nombre: string) {
    if (!form) return;
    const actual = form.initials_palette;
    actualizar(
      "initials_palette",
      actual.includes(nombre) ? actual.filter((n) => n !== nombre) : [...actual, nombre]
    );
  }

  if (cargando && !categorias.length) return <Cargando />;

  const conteo = form && !esNueva ? conteoPorCategoria[form.key] ?? 0 : 0;

  return (
    <div className="adm-cats">
      <div className="adm-cats-lista">
        <Aviso
          titulo="Las categorías no pasan por el borrador: se guardan directo."
          meta="SIN UNA CATEGORÍA NO SE PUEDE CREAR NINGÚN PRODUCTO · ES FOREIGN KEY"
        />

        {!categorias.length && !esNueva ? (
          <Vacio titulo="Todavía no hay ninguna categoría.">
            <p>
              La categoría es lo primero que hay que crear: define el precio base, las
              reglas de iniciales y la carpeta donde se guardan las imágenes.
            </p>
            <Boton
              onClick={() => {
                nueva();
                bajarAlFormulario();
              }}
              variante="acento"
            >
              + CREAR LA PRIMERA
            </Boton>
          </Vacio>
        ) : (
          <>
            <ErrorAviso error={errorOrden} />
            {/* Roles ARIA explícitos: ver el mismo comentario en ProductsView.tsx —
                las filas pasan a display:grid en ≤640px para el layout de
                tarjetas, y ahí la semántica implícita de tabla no es confiable
                entre navegadores. */}
            <table className={`adm-tabla ${guardando ? "is-guardando" : ""}`} role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th className="adm-mono" scope="col" role="columnheader">
                    <span className="adm-sr">Reordenar</span>
                  </th>
                  <th className="adm-mono" scope="col" role="columnheader">CATEGORÍA</th>
                  <th className="adm-mono adm-num" scope="col" role="columnheader">PRECIO BASE</th>
                  <th className="adm-mono adm-num" scope="col" role="columnheader">PRODUCTOS</th>
                  <th className="adm-mono" scope="col" role="columnheader">REGLAS ACTIVAS</th>
                </tr>
              </thead>
              <tbody
                role="rowgroup"
                ref={arrastre.contenedorRef as RefObject<HTMLTableSectionElement | null>}
              >
                {categoriasOrdenadas.map((c, i) => (
                  <tr
                    key={c.key}
                    {...arrastre.propsItem(i)}
                    className={`adm-fila ${seleccionada === c.key && !esNueva ? "is-seleccionada" : ""}`}
                    onClick={() => {
                      setEsNueva(false);
                      setSeleccionada(c.key);
                      setForm({ ...c });
                      bajarAlFormulario();
                    }}
                    tabIndex={0}
                    role="row"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setEsNueva(false);
                        setSeleccionada(c.key);
                        setForm({ ...c });
                        bajarAlFormulario();
                      }
                    }}
                  >
                    <td className="adm-num adm-td-agarre" role="cell">
                      <span className="adm-fila-orden">
                        <span
                          className="adm-fila-agarre"
                          {...arrastre.propsAgarre(i)}
                          aria-label={`Reordenar ${c.label}. Usa las flechas arriba y abajo, o arrastra.`}
                          title="Arrastra o usa las flechas para reordenar"
                        >
                          <IconoAgarre />
                        </span>
                      </span>
                    </td>
                    <td className="adm-td-nombre" role="cell">
                      <span className="adm-fila-nombre">{c.label}</span>
                      <span className="adm-mono adm-fila-meta">
                        {c.key.toUpperCase()} · POSICIÓN {c.position}
                      </span>
                    </td>
                    <td className="adm-mono adm-num adm-td-precio" role="cell">{dinero(c.default_price)}</td>
                    <td className="adm-mono adm-num adm-td-conteo" role="cell">
                      {conteoPorCategoria[c.key] ?? 0}
                    </td>
                    <td className="adm-td-reglas" role="cell">
                      <span className="adm-tags">
                        {c.has_variant && <Etiqueta tono="solido">VARIANTE</Etiqueta>}
                        {c.extra_initials_price > 0 && <Etiqueta tono="solido">RECARGO</Etiqueta>}
                        {c.is_imported && <Etiqueta>IMPORTADO</Etiqueta>}
                        {c.initials_palette.length > 0 && <Etiqueta>PALETA</Etiqueta>}
                        {!c.has_variant &&
                          !c.is_imported &&
                          c.extra_initials_price === 0 &&
                          !c.initials_palette.length && (
                            <span className="adm-mono adm-fila-meta">—</span>
                          )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="adm-cats-pie">
              <Boton
                onClick={() => {
                  nueva();
                  bajarAlFormulario();
                }}
                variante="acento"
              >
                + NUEVA CATEGORÍA
              </Boton>
            </div>
          </>
        )}
      </div>

      {form && (
        <aside className="adm-cats-reglas" ref={reglasRef}>
          <ErrorAviso error={guardar.error ?? borrar.error} />

          <section className="adm-card">
            <header className="adm-cat-head">
              <h3 className="adm-h3">{form.label || "Categoría nueva"}</h3>
              <p className="adm-mono adm-cat-key">
                {esNueva ? "LA CLAVE NO SE PUEDE CAMBIAR DESPUÉS" : `KEY · ${form.key.toUpperCase()}`}
              </p>
            </header>

            {esNueva && (
              <Campo
                etiqueta="CLAVE"
                ayuda="va en la ruta de las imágenes"
                error={errores.key}
              >
                <Texto
                  value={form.key}
                  onChange={(v) => actualizar("key", v.toLowerCase())}
                  invalido={!!errores.key}
                  mono
                />
              </Campo>
            )}

            <div className="adm-fila-campos">
              <Campo etiqueta="NOMBRE VISIBLE" error={errores.label}>
                <Texto
                  value={form.label}
                  onChange={(v) => actualizar("label", v)}
                  invalido={!!errores.label}
                />
              </Campo>
              <Campo
                etiqueta="PRECIO BASE"
                ayuda="precio inicial de productos nuevos — no cambia los productos ya creados"
                error={errores.default_price}
              >
                <Numero
                  value={form.default_price}
                  onChange={(v) => actualizar("default_price", v ?? 0)}
                  invalido={!!errores.default_price}
                  prefijo="$"
                />
              </Campo>
              <Campo etiqueta="POSICIÓN" error={errores.position}>
                <Numero
                  value={form.position}
                  onChange={(v) => actualizar("position", v ?? 1)}
                  invalido={!!errores.position}
                />
              </Campo>
            </div>
          </section>

          <section className="adm-card">
            <p className="adm-mono adm-regla-grupo">CÓMO SE VE EN LA TIENDA</p>

            <Interruptor
              activo={form.has_variant}
              onChange={(v) => actualizar("has_variant", v)}
              titulo="El subtítulo muestra la variante"
              detalle='HAS_VARIANT · "CORDONES NEGROS" EN VEZ DEL NOMBRE DE LA CATEGORÍA'
            />

            <Interruptor
              activo={form.is_imported}
              onChange={(v) => actualizar("is_imported", v)}
              titulo="Avisar que es importado"
              detalle='IS_IMPORTED · MUESTRA "ENTREGA EN 15-20 DÍAS"'
            />
          </section>

          <section className="adm-card">
            <p className="adm-mono adm-regla-grupo">INICIALES BORDADAS</p>

            <Interruptor
              activo={form.personalizable}
              onChange={(v) => actualizar("personalizable", v)}
              titulo="Se puede personalizar"
              detalle="PERSONALIZABLE"
            />

            {form.personalizable && (
              <>
                <div className="adm-fila-campos">
                  <Campo etiqueta="MÁXIMO" error={errores.max_initials}>
                    <Numero
                      value={form.max_initials}
                      onChange={(v) => actualizar("max_initials", v ?? 0)}
                      invalido={!!errores.max_initials}
                    />
                  </Campo>
                  <Campo etiqueta="GRATIS HASTA" error={errores.free_initials}>
                    <Numero
                      value={form.free_initials}
                      onChange={(v) => actualizar("free_initials", v ?? 0)}
                      invalido={!!errores.free_initials}
                    />
                  </Campo>
                  <Campo etiqueta="RECARGO" error={errores.extra_initials_price}>
                    <Numero
                      value={form.extra_initials_price}
                      onChange={(v) => actualizar("extra_initials_price", v ?? 0)}
                      invalido={!!errores.extra_initials_price}
                      prefijo="$"
                    />
                  </Campo>
                </div>

                <Aviso
                  tono="borrador"
                  titulo={
                    form.extra_initials_price > 0
                      ? `De 1 a ${form.free_initials} iniciales van sin costo. De la ${form.free_initials + 1} en adelante suma ${dinero(form.extra_initials_price)} una sola vez.`
                      : "Sin recargo: todas las iniciales están incluidas en el precio."
                  }
                  meta="GRATIS HASTA NO PUEDE SUPERAR AL MÁXIMO · LA BASE LO RECHAZA"
                />

                <div className="adm-paleta">
                  <p className="adm-mono adm-campo-label">
                    COLORES DE BORDADO PERMITIDOS · VACÍO = TODOS
                  </p>
                  <div className="adm-paleta-chips">
                    {COLORES_MARCA.map((c) => {
                      const elegido = form.initials_palette.includes(c.nombre);
                      return (
                        <button
                          key={c.nombre}
                          type="button"
                          className={`adm-mono adm-color-chip ${elegido ? "is-activo" : ""}`}
                          onClick={() => alternarColor(c.nombre)}
                          aria-pressed={elegido}
                        >
                          <span className="adm-color-swatch" style={{ background: c.hex }} />
                          {c.nombre.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </section>

          <div className="adm-cats-acciones">
            <Boton
              onClick={() => void guardar.ejecutar()}
              variante="primario"
              ancho
              disabled={!valido}
              cargando={guardar.enCurso}
            >
              {esNueva ? "CREAR CATEGORÍA" : "GUARDAR CATEGORÍA"}
            </Boton>

            {!esNueva && (
              <Boton
                onClick={() => {
                  if (conteo > 0) {
                    window.alert(
                      `No se puede borrar "${form.label}": tiene ${conteo} producto(s) en el borrador. Muévelos a otra categoría o bórralos primero.`
                    );
                    return;
                  }
                  if (window.confirm(`¿Borrar la categoría "${form.label}"?`)) {
                    void borrar.ejecutar(form.key);
                  }
                }}
                variante="peligro"
                ancho
                cargando={borrar.enCurso}
              >
                BORRAR CATEGORÍA
              </Boton>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
