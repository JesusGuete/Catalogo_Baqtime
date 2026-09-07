import { useMemo, useState } from "react";
import type {
  Category,
  FotoParaGuardar,
  InitialsColor,
  ProductInsert,
  ProductWithPhotos,
} from "../../../types/database";
import * as productosRepo from "../../../lib/admin/products.repo";
import * as fotosRepo from "../../../lib/admin/photos.repo";
import { validarProducto, esValido, nuevoIdProducto } from "../../../lib/admin/validation";
import { useAccion } from "../../../lib/admin/useAdminData";
import { comoAdminError, type AdminError } from "../../../lib/supabase/errors";
import PhotoManager from "./PhotoManager";
import {
  Aviso,
  Boton,
  Campo,
  ColorHex,
  ErrorAviso,
  Interruptor,
  Numero,
  SectionHead,
  Selector,
  Texto,
  dinero,
} from "./ui";

// Pantalla 03 del diseño. Crea o edita un producto del BORRADOR.
//
// Guardar son dos operaciones que tienen que ir en este orden:
//   1. la fila (POST o PATCH sobre products_draft)
//   2. las fotos (replace_product_photos_draft con el array completo)
//
// Al revés no se puede: la RPC de fotos exige que el producto YA exista en el
// borrador — si no, devuelve 23503. Por eso en un producto nuevo primero se crea la
// fila y recién después se asocian las imágenes que ya están en Storage.

interface Props {
  /** `null` = producto nuevo. */
  producto: ProductWithPhotos | null;
  categorias: Category[];
  /** La paleta completa, para elegir los colores de bordado de este producto. */
  colores: InitialsColor[];
  productosExistentes: ProductWithPhotos[];
  onCerrar: () => void;
  onGuardado: () => void;
}

/** Estado editable del formulario. Todo string/number/null para poder representar "vacío". */
interface Formulario {
  id: string;
  category_key: string;
  name: string;
  color: string;
  variant: string;
  hex: string;
  price: number | null;
  personalizable: boolean;
  max_initials: number | null;
  is_active: boolean;
  sort_order: number | null;
  /** Colores de bordado propios (015). Vacío = heredar la regla de la categoría. */
  initials_palette: string[];
}

function desdeProducto(p: ProductWithPhotos): Formulario {
  return {
    id: p.id,
    category_key: p.category_key,
    name: p.name,
    color: p.color,
    variant: p.variant ?? "",
    hex: p.hex ?? "",
    price: p.price,
    personalizable: p.personalizable,
    max_initials: p.max_initials,
    is_active: p.is_active,
    sort_order: p.sort_order,
    initials_palette: p.initials_palette ?? [],
  };
}

function formularioNuevo(categoria: Category | undefined, siguienteOrden: number): Formulario {
  return {
    id: nuevoIdProducto(),
    category_key: categoria?.key ?? "",
    name: "",
    color: "",
    variant: "",
    hex: "",
    // El precio y el máximo de iniciales arrancan con lo que define la categoría: es
    // lo que el dueño va a querer el 90% de las veces, y sigue siendo editable.
    price: categoria?.default_price ?? null,
    personalizable: categoria?.personalizable ?? false,
    max_initials: categoria?.max_initials ?? 0,
    is_active: true,
    sort_order: siguienteOrden,
    // Vacío a propósito: un producto nuevo hereda la regla de su categoría hasta que
    // el dueño decida otra cosa para ESTE bolso.
    initials_palette: [],
  };
}

export default function ProductEditor({
  producto,
  categorias,
  colores,
  productosExistentes,
  onCerrar,
  onGuardado,
}: Props) {
  const esNuevo = producto === null;

  const [form, setForm] = useState<Formulario>(() =>
    producto
      ? desdeProducto(producto)
      : formularioNuevo(
          categorias[0],
          productosRepo.siguienteOrden(productosExistentes, categorias[0]?.key ?? "")
        )
  );
  const [fotos, setFotos] = useState<FotoParaGuardar[]>(() =>
    producto ? productosRepo.rutasDeFotos(producto) : []
  );
  const [tocado, setTocado] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<AdminError | null>(null);

  const categoria = categorias.find((c) => c.key === form.category_key);
  // El grupo de color ya no lo escribe el dueño: se toma directo del campo Color.
  // En la práctica siempre coincidían (agrupar "Beige" con "Beige" es justamente el
  // caso normal), así que pedirlo aparte era un campo más para llenar sin necesidad.
  const errores = validarProducto({
    ...form,
    variant: form.variant || null,
    hex: form.hex || null,
    price: form.price ?? NaN,
    max_initials: form.max_initials ?? NaN,
    sort_order: form.sort_order ?? NaN,
    group_key: form.color.trim(),
    origin: producto?.origin ?? "custom",
  });
  const valido = esValido(errores);

  const fotosOriginales = useMemo(
    () => (producto ? productosRepo.rutasDeFotos(producto) : []),
    [producto]
  );
  // Compara también los dos recortes: mover o redimensionar una caja de una foto sin
  // agregar ni quitar ninguna sigue siendo un cambio que hay que guardar.
  const fotosCambiaron =
    fotos.length !== fotosOriginales.length ||
    fotos.some((f, i) => {
      const o = fotosOriginales[i];
      return (
        !o ||
        f.storage_path !== o.storage_path ||
        f.crop_square_x !== o.crop_square_x ||
        f.crop_square_y !== o.crop_square_y ||
        f.crop_square_w !== o.crop_square_w ||
        f.crop_square_h !== o.crop_square_h ||
        f.crop_editorial_x !== o.crop_editorial_x ||
        f.crop_editorial_y !== o.crop_editorial_y ||
        f.crop_editorial_w !== o.crop_editorial_w ||
        f.crop_editorial_h !== o.crop_editorial_h
      );
    });

  function actualizar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setTocado(true);
    setForm((f) => {
      const siguiente = { ...f, [campo]: valor };
      // Cambiar de categoría reubica el producto: el orden es único por categoría, así
      // que conservar el anterior chocaría con el producto que ya lo tiene (23505).
      if (campo === "category_key") {
        const nueva = categorias.find((c) => c.key === valor);
        siguiente.sort_order = productosRepo.siguienteOrden(
          productosExistentes.filter((p) => p.id !== f.id),
          valor as string
        );
        if (esNuevo && nueva) {
          siguiente.price = nueva.default_price;
          siguiente.personalizable = nueva.personalizable;
          siguiente.max_initials = nueva.max_initials;
        }
      }
      return siguiente;
    });
  }

  const guardar = useAccion(async () => {
    setErrorGuardado(null);
    try {
      const fila: ProductInsert = {
        id: form.id,
        category_key: form.category_key,
        name: form.name.trim(),
        color: form.color.trim(),
        variant: form.variant.trim() || null,
        hex: form.hex.trim() || null,
        price: form.price!,
        personalizable: form.personalizable,
        max_initials: form.max_initials!,
        group_key: form.color.trim(),
        origin: producto?.origin ?? "custom",
        is_active: form.is_active,
        sort_order: form.sort_order!,
        initials_palette: form.initials_palette,
      };

      // Paso 1: la fila. Tiene que existir antes de asociarle fotos.
      if (esNuevo) {
        await productosRepo.crear(fila);
      } else {
        const { id: _id, ...cambios } = fila;
        await productosRepo.editar(form.id, cambios);
      }

      // Paso 2: las fotos, solo si cambiaron. El array COMPLETO, en el orden final.
      if (fotosCambiaron || esNuevo) {
        await fotosRepo.reemplazar(form.id, fotos);
      }

      onGuardado();
      return true;
    } catch (e) {
      setErrorGuardado(comoAdminError(e));
      return false;
    }
  });

  const eliminar = useAccion(async () => {
    await productosRepo.eliminar(form.id);
    onGuardado();
  });

  const hayCambios = tocado || fotosCambiaron;

  return (
    <div className="adm-editor">
      <div className="adm-editor-barra">
        <button type="button" className="adm-mono adm-volver" onClick={onCerrar}>
          ← PRODUCTOS
        </button>
        <span className="adm-editor-sep" />
        <div className="adm-editor-titulo">
          <h2 className="adm-h2">{esNuevo ? "Producto nuevo" : form.name || "Sin nombre"}</h2>
          <p className="adm-mono adm-editor-sub">{form.id}</p>
        </div>
        <div className="adm-editor-acciones">
          {hayCambios && (
            <span className="adm-pill">
              <span className="adm-pill-dot" />
              <span className="adm-mono">cambios sin guardar</span>
            </span>
          )}
          <Boton onClick={onCerrar} variante="secundario">
            Descartar
          </Boton>
          <Boton
            onClick={() => void guardar.ejecutar()}
            variante="primario"
            disabled={!valido}
            cargando={guardar.enCurso}
          >
            Guardar
          </Boton>
        </div>
      </div>

      <ErrorAviso error={errorGuardado ?? guardar.error} />
      <ErrorAviso error={eliminar.error} />

      <div className="adm-editor-cols">
        <div className="adm-editor-form">
          {/* Antes eran tres tarjetas numeradas (Identidad, Clasificación, Precio y
              personalización) con trece campos siempre visibles, incluidos ID, Orden y
              Grupo de color. Quedan en una sola tarjeta con lo que de verdad se decide por
              producto. ID ya se ve en la barra de arriba (no se puede cambiar, así que no
              necesita su propio campo acá) y Grupo de color se calcula solo desde Color —
              ver el comentario junto a `validarProducto` más abajo. Orden ya no tiene
              campo: se decide arrastrando la fila en la lista de Productos, no acá —
              repetir esa decisión acá era lo que producía el 23505 al chocar con otro
              producto que ya tenía el mismo número. */}
          <section className="adm-card">
            <SectionHead titulo="Producto" />
            <div className="adm-fila-campos">
              <Campo etiqueta="NOMBRE" error={errores.name}>
                <Texto
                  value={form.name}
                  onChange={(v) => actualizar("name", v)}
                  invalido={!!errores.name}
                />
              </Campo>
              <Campo etiqueta="COLOR" error={errores.color}>
                <Texto
                  value={form.color}
                  onChange={(v) => actualizar("color", v)}
                  invalido={!!errores.color}
                />
              </Campo>
              <Campo etiqueta="HEX" ayuda="#RRGGBB exacto" error={errores.hex}>
                <ColorHex
                  value={form.hex}
                  onChange={(v) => actualizar("hex", v)}
                  invalido={!!errores.hex}
                />
              </Campo>
            </div>
            <div className="adm-fila-campos">
              <Campo etiqueta="VARIANTE" ayuda="opcional">
                <Texto value={form.variant} onChange={(v) => actualizar("variant", v)} />
              </Campo>
              <Campo etiqueta="CATEGORÍA" error={errores.category_key}>
                <Selector
                  value={form.category_key}
                  onChange={(v) => actualizar("category_key", v)}
                  opciones={categorias.map((c) => ({ value: c.key, label: c.label }))}
                  invalido={!!errores.category_key}
                />
              </Campo>
              <Campo etiqueta="PRECIO" ayuda="pesos enteros" error={errores.price}>
                <Numero
                  value={form.price}
                  onChange={(v) => actualizar("price", v)}
                  invalido={!!errores.price}
                  prefijo="$"
                />
              </Campo>
            </div>

            <div className="adm-fila-campos">
              <Interruptor
                activo={form.personalizable}
                onChange={(v) => actualizar("personalizable", v)}
                titulo="Personalizable"
                detalle="MUESTRA EL BLOQUE DE INICIALES"
              />
              <Interruptor
                activo={form.is_active}
                onChange={(v) => actualizar("is_active", v)}
                titulo="Visible en el sitio"
              />
            </div>

            {/* Solo si es personalizable: en un producto sin iniciales, cuántas admite y
                con qué hilo bordarlas no significa nada y ocuparía media pantalla. */}
            {form.personalizable && (
              <>
                <div className="adm-fila-campos">
                  <Campo etiqueta="MÁX INICIALES" error={errores.max_initials}>
                    <Numero
                      value={form.max_initials}
                      onChange={(v) => actualizar("max_initials", v)}
                      invalido={!!errores.max_initials}
                    />
                  </Campo>
                </div>

                {categoria && categoria.extra_initials_price > 0 && (
                  <Aviso
                    titulo={`${categoria.label} cobra ${dinero(categoria.extra_initials_price)} a partir de la inicial ${categoria.free_initials + 1}.`}
                    meta={`Regla de ${categoria.label} · se edita en Categorías`}
                  />
                )}

                <div className="adm-paleta">
                  <p className="adm-mono adm-campo-label">Colores de bordado de este producto</p>
                  {colores.length === 0 ? (
                    <p className="adm-campo-ayuda">
                      Todavía no hay ningún color en la paleta. Se crean en Categorías, en la
                      pestaña Colores.
                    </p>
                  ) : (
                    <div className="adm-paleta-chips">
                      {colores.map((c) => {
                        const elegido = form.initials_palette.includes(c.name);
                        return (
                          <button
                            key={c.name}
                            type="button"
                            className={`adm-mono adm-color-chip ${elegido ? "is-activo" : ""}`}
                            onClick={() =>
                              actualizar(
                                "initials_palette",
                                elegido
                                  ? form.initials_palette.filter((n) => n !== c.name)
                                  : [...form.initials_palette, c.name]
                              )
                            }
                            aria-pressed={elegido}
                          >
                            <span className="adm-color-swatch" style={{ background: c.hex }} />
                            {c.name.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {/* Decir cuál gana evita la pregunta obvia: el dueño ve dos lugares donde
                      configurar lo mismo y necesita saber cuál de los dos manda. */}
                  {form.initials_palette.length === 0 &&
                  categoria &&
                  categoria.initials_palette.length > 0 ? (
                    <p className="adm-campo-ayuda">
                      Ahora hereda de {categoria.label}: {categoria.initials_palette.join(", ")}.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="adm-editor-fotos">
          <PhotoManager
            fotos={fotos}
            onChange={setFotos}
            categoryKey={form.category_key}
          />

          {/* "Ocultar" vivía acá también, además del interruptor "Visible en el sitio" de
              arriba: dos controles para el mismo hecho. Se saca de acá — el interruptor
              alcanza y es donde el dueño ya lo espera. Eliminar se queda solo, porque es
              la única acción de esta sección que de verdad es irreversible.
              La explicación de qué borra vive en el `confirm()` del click, no acá arriba:
              se lee justo antes de decidir, no como texto de fondo permanente. */}
          {!esNuevo && (
            <section className="adm-card">
              <Boton
                onClick={() => {
                  if (
                    window.confirm(
                      `¿Eliminar "${form.name}" del borrador? Se borra la fila y sus fotos. El cambio llega al sitio recién cuando publiques.`
                    )
                  ) {
                    void eliminar.ejecutar();
                  }
                }}
                variante="peligro"
                cargando={eliminar.enCurso}
              >
                Eliminar
              </Boton>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
