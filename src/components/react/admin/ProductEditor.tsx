import { useMemo, useState } from "react";
import type { Category, ProductInsert, ProductWithPhotos } from "../../../types/database";
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
  group_key: string;
  is_active: boolean;
  sort_order: number | null;
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
    group_key: p.group_key,
    is_active: p.is_active,
    sort_order: p.sort_order,
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
    group_key: "",
    is_active: true,
    sort_order: siguienteOrden,
  };
}

export default function ProductEditor({
  producto,
  categorias,
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
  const [rutasFotos, setRutasFotos] = useState<string[]>(() =>
    producto ? productosRepo.rutasDeFotos(producto) : []
  );
  const [tocado, setTocado] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<AdminError | null>(null);

  const categoria = categorias.find((c) => c.key === form.category_key);
  const errores = validarProducto({
    ...form,
    variant: form.variant || null,
    hex: form.hex || null,
    price: form.price ?? NaN,
    max_initials: form.max_initials ?? NaN,
    sort_order: form.sort_order ?? NaN,
    origin: producto?.origin ?? "custom",
  });
  const valido = esValido(errores);

  const fotosOriginales = useMemo(
    () => (producto ? productosRepo.rutasDeFotos(producto) : []),
    [producto]
  );
  const fotosCambiaron =
    rutasFotos.length !== fotosOriginales.length ||
    rutasFotos.some((r, i) => r !== fotosOriginales[i]);

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
        group_key: form.group_key.trim(),
        origin: producto?.origin ?? "custom",
        is_active: form.is_active,
        sort_order: form.sort_order!,
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
        await fotosRepo.reemplazar(form.id, rutasFotos);
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
          <p className="adm-mono adm-editor-sub">
            PRODUCTS_DRAFT · {form.id.toUpperCase()}
          </p>
        </div>
        <div className="adm-editor-acciones">
          {hayCambios && (
            <span className="adm-pill">
              <span className="adm-pill-dot" />
              <span className="adm-mono">CAMBIOS SIN GUARDAR</span>
            </span>
          )}
          <Boton onClick={onCerrar} variante="secundario">
            DESCARTAR
          </Boton>
          <Boton
            onClick={() => void guardar.ejecutar()}
            variante="primario"
            disabled={!valido}
            cargando={guardar.enCurso}
          >
            GUARDAR BORRADOR
          </Boton>
        </div>
      </div>

      <ErrorAviso error={errorGuardado ?? guardar.error} />
      <ErrorAviso error={eliminar.error} />

      <div className="adm-editor-cols">
        <div className="adm-editor-form">
          <section className="adm-card">
            <SectionHead numero="01" titulo="Identidad" />
            <div className="adm-fila-campos">
              <Campo etiqueta="ID" ayuda="no se puede cambiar" error={errores.id}>
                <Texto value={form.id} onChange={() => {}} disabled mono />
              </Campo>
              <Campo etiqueta="NOMBRE" error={errores.name}>
                <Texto
                  value={form.name}
                  onChange={(v) => actualizar("name", v)}
                  invalido={!!errores.name}
                />
              </Campo>
            </div>
            <div className="adm-fila-campos">
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
              <Campo etiqueta="VARIANTE" ayuda="opcional">
                <Texto value={form.variant} onChange={(v) => actualizar("variant", v)} />
              </Campo>
            </div>
          </section>

          <section className="adm-card">
            <SectionHead numero="02" titulo="Clasificación" />
            <div className="adm-fila-campos">
              <Campo etiqueta="CATEGORÍA" error={errores.category_key}>
                <Selector
                  value={form.category_key}
                  onChange={(v) => actualizar("category_key", v)}
                  opciones={categorias.map((c) => ({ value: c.key, label: c.label }))}
                  invalido={!!errores.category_key}
                />
              </Campo>
              <Campo
                etiqueta="GRUPO DE COLOR"
                ayuda="agrupa variantes"
                error={errores.group_key}
              >
                <Texto
                  value={form.group_key}
                  onChange={(v) => actualizar("group_key", v)}
                  invalido={!!errores.group_key}
                />
              </Campo>
              <Campo etiqueta="ORDEN" error={errores.sort_order}>
                <Numero
                  value={form.sort_order}
                  onChange={(v) => actualizar("sort_order", v)}
                  invalido={!!errores.sort_order}
                />
              </Campo>
            </div>
            <p className="adm-mono adm-hint">
              EL ORDEN ES ÚNICO DENTRO DE LA CATEGORÍA · REPETIRLO DEVUELVE 23505
            </p>
          </section>

          <section className="adm-card">
            <SectionHead numero="03" titulo="Precio y personalización" />
            <div className="adm-fila-campos">
              <Campo etiqueta="PRECIO" ayuda="pesos enteros" error={errores.price}>
                <Numero
                  value={form.price}
                  onChange={(v) => actualizar("price", v)}
                  invalido={!!errores.price}
                  prefijo="$"
                />
              </Campo>
              <Campo etiqueta="MÁX INICIALES" error={errores.max_initials}>
                <Numero
                  value={form.max_initials}
                  onChange={(v) => actualizar("max_initials", v)}
                  invalido={!!errores.max_initials}
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
                detalle="IS_ACTIVE"
              />
            </div>

            {categoria && categoria.extra_initials_price > 0 && (
              <Aviso
                titulo={`${categoria.label} cobra ${dinero(categoria.extra_initials_price)} a partir de la inicial ${categoria.free_initials + 1}.`}
                meta={`REGLA DE LA CATEGORÍA · FREE_INITIALS ${categoria.free_initials} · EXTRA_INITIALS_PRICE ${categoria.extra_initials_price} · SE EDITA EN CATEGORÍAS`}
              />
            )}
          </section>
        </div>

        <div className="adm-editor-fotos">
          <PhotoManager
            rutas={rutasFotos}
            onChange={setRutasFotos}
            categoryKey={form.category_key}
          />

          {!esNuevo && (
            <section className="adm-card">
              <p className="adm-mono adm-peligro-titulo">ZONA DE RIESGO</p>
              <p className="adm-nota">
                Ocultar lo saca del sitio y conserva la fila. Eliminar la borra del borrador
                junto con sus fotos.
              </p>
              <div className="adm-peligro-btns">
                <Boton
                  onClick={() => actualizar("is_active", !form.is_active)}
                  variante="secundario"
                >
                  {form.is_active ? "OCULTAR" : "MOSTRAR"}
                </Boton>
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
                  ELIMINAR
                </Boton>
              </div>
              <p className="adm-mono adm-hint">
                OCULTAR ES LO RECOMENDADO · LA GUARDA DE PUBLICACIÓN CUENTA FILAS, NO FILAS ACTIVAS
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
