import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { publicImageUrl } from "../../../lib/supabase/config";
import { construirPath, subirImagen } from "../../../lib/supabase/storage";
import { transformarImagen } from "../../../lib/admin/image-transform";
import { cajaAutoCuadrada, cajaAutoEditorial, cajaDe, conCaja, sinCajas, type TipoRecorte } from "../../../lib/admin/crop";
import { estiloRecorte } from "../../../lib/crop-style.js";
import { comoAdminError, type AdminError } from "../../../lib/supabase/errors";
import type { CajaRecorte, FotoParaGuardar } from "../../../types/database";
import { Boton, ErrorAviso } from "./ui";

// Pantalla completa para editar UNA foto: recortar (1:1 y 3:4), girar, voltear o
// reemplazar. Reemplaza al panel "Encuadrar" (un solo punto) que vivía plegado dentro
// de cada fila de PhotoManager — un punto no alcanzaba porque la tarjeta cuadrada y la
// editorial casi nunca piden el mismo centro, así que ahora son DOS cajas de recorte
// independientes, una por forma (018_photo_crop_boxes.sql).
//
// Trabaja sobre una COPIA en memoria (`previa`) y solo la manda de vuelta a
// PhotoManager al apretar "Aplicar" — mover o redimensionar una caja no sube nada, es
// puro metadata (ver lib/crop-style.js). Girar/voltear/reemplazar SÍ suben un archivo a
// Storage de inmediato (Storage no tiene edición server-side, así que no hay forma de
// "probar" una rotación sin subirla) y ahí SÍ se borran las dos cajas: una caja
// calculada para el archivo o la orientación vieja no tiene sentido sobre uno nuevo, y
// dejarla puesta sería mostrar un recorte que nadie eligió a propósito.
//
// "Volver al original" solo alcanza lo que se hizo EN ESTA SESIÓN del estudio.

interface Props {
  foto: FotoParaGuardar;
  categoryKey: string;
  indice: number;
  total: number;
  onAplicar: (foto: FotoParaGuardar) => void;
  onCerrar: () => void;
  onAnterior?: () => void;
  onSiguiente?: () => void;
}

const TAMANO_MIN = 12;
const PASO_FLECHA = 5;
const PASO_FLECHA_FINO = 1;
/** ancho/alto de la caja editorial — misma proporción que `.card--editorial` en site.css. */
const RELACION: Record<TipoRecorte, number> = { square: 1, editorial: 3 / 4 };

function acotar(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

type Arrastre = { modo: "mover" | "redimensionar"; x0: number; y0: number; cajaInicio: CajaRecorte } | null;

export default function PhotoStudio({
  foto,
  categoryKey,
  indice,
  total,
  onAplicar,
  onCerrar,
  onAnterior,
  onSiguiente,
}: Props) {
  const [original] = useState<FotoParaGuardar>(foto);
  const [previa, setPrevia] = useState<FotoParaGuardar>(foto);
  const [herramienta, setHerramienta] = useState<TipoRecorte>("square");
  const [dimensiones, setDimensiones] = useState<{ nw: number; nh: number } | null>(null);
  const [procesando, setProcesando] = useState<"girar" | "espejo" | "reemplazar" | null>(null);
  const [error, setError] = useState<AdminError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lienzoRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<Arrastre>(null);

  const tocoAlgo =
    previa.storage_path !== original.storage_path ||
    previa.crop_square_x !== original.crop_square_x ||
    previa.crop_square_y !== original.crop_square_y ||
    previa.crop_square_w !== original.crop_square_w ||
    previa.crop_square_h !== original.crop_square_h ||
    previa.crop_editorial_x !== original.crop_editorial_x ||
    previa.crop_editorial_y !== original.crop_editorial_y ||
    previa.crop_editorial_w !== original.crop_editorial_w ||
    previa.crop_editorial_h !== original.crop_editorial_h;

  /** La caja guardada de `tipo`, o la automática (calcada de object-fit:cover) si todavía no hay una propia. */
  function cajaMostrada(tipo: TipoRecorte): CajaRecorte | null {
    const guardada = cajaDe(previa, tipo);
    if (guardada) return guardada;
    if (!dimensiones) return null;
    return tipo === "square"
      ? cajaAutoCuadrada(dimensiones.nw, dimensiones.nh)
      : cajaAutoEditorial(dimensiones.nw, dimensiones.nh);
  }

  const cajaActiva = useMemo(() => cajaMostrada(herramienta), [previa, herramienta, dimensiones]);

  function iniciarArrastre(e: ReactPointerEvent, modo: "mover" | "redimensionar") {
    e.stopPropagation();
    e.preventDefault();
    if (!cajaActiva) return;
    arrastreRef.current = { modo, x0: e.clientX, y0: e.clientY, cajaInicio: cajaActiva };
    window.addEventListener("pointermove", alMoverPuntero);
    window.addEventListener("pointerup", alSoltarPuntero);
  }

  function alMoverPuntero(e: PointerEvent) {
    const st = arrastreRef.current;
    const rect = lienzoRef.current?.getBoundingClientRect();
    if (!st || !rect) return;
    const dxPct = ((e.clientX - st.x0) / rect.width) * 100;
    const dyPct = ((e.clientY - st.y0) / rect.height) * 100;
    const relacion = RELACION[herramienta];

    let nueva: CajaRecorte;
    if (st.modo === "mover") {
      nueva = {
        ...st.cajaInicio,
        x: acotar(st.cajaInicio.x + dxPct, 0, 100 - st.cajaInicio.w),
        y: acotar(st.cajaInicio.y + dyPct, 0, 100 - st.cajaInicio.h),
      };
    } else {
      // El mayor de los dos deltas manda, para que arrastrar en cualquier dirección
      // de la manija achique o agrande — no solo cuando el mouse va "hacia afuera".
      const delta = Math.abs(dxPct) > Math.abs(dyPct) ? dxPct : dyPct * relacion;
      let w = acotar(st.cajaInicio.w + delta, TAMANO_MIN, 100 - st.cajaInicio.x);
      let h = w / relacion;
      if (st.cajaInicio.y + h > 100) {
        h = 100 - st.cajaInicio.y;
        w = h * relacion;
      }
      nueva = { ...st.cajaInicio, w, h };
    }
    setPrevia((p) => conCaja(p, herramienta, nueva));
  }

  function alSoltarPuntero() {
    arrastreRef.current = null;
    window.removeEventListener("pointermove", alMoverPuntero);
    window.removeEventListener("pointerup", alSoltarPuntero);
  }

  function alTecladoCaja(e: KeyboardEvent<HTMLDivElement>) {
    if (!cajaActiva) return;
    const paso = e.shiftKey ? PASO_FLECHA_FINO : PASO_FLECHA;
    let { x, y } = cajaActiva;
    switch (e.key) {
      case "ArrowLeft":
        x = acotar(x - paso, 0, 100 - cajaActiva.w);
        break;
      case "ArrowRight":
        x = acotar(x + paso, 0, 100 - cajaActiva.w);
        break;
      case "ArrowUp":
        y = acotar(y - paso, 0, 100 - cajaActiva.h);
        break;
      case "ArrowDown":
        y = acotar(y + paso, 0, 100 - cajaActiva.h);
        break;
      default:
        return;
    }
    e.preventDefault();
    setPrevia((p) => conCaja(p, herramienta, { ...cajaActiva, x, y }));
  }

  function restablecer() {
    setPrevia((p) => conCaja(p, herramienta, null));
  }

  async function girar() {
    setError(null);
    setProcesando("girar");
    try {
      const blob = await transformarImagen(publicImageUrl(previa.storage_path), { rotar: 90 });
      const archivo = new File([blob], "girada.webp", { type: "image/webp" });
      const path = construirPath(categoryKey, archivo);
      await subirImagen(path, archivo);
      setPrevia(sinCajas({ ...previa, storage_path: path }));
      setDimensiones(null);
    } catch (e) {
      setError(comoAdminError(e));
    } finally {
      setProcesando(null);
    }
  }

  async function voltear() {
    setError(null);
    setProcesando("espejo");
    try {
      const blob = await transformarImagen(publicImageUrl(previa.storage_path), { espejo: true });
      const archivo = new File([blob], "espejo.webp", { type: "image/webp" });
      const path = construirPath(categoryKey, archivo);
      await subirImagen(path, archivo);
      setPrevia(sinCajas({ ...previa, storage_path: path }));
      setDimensiones(null);
    } catch (e) {
      setError(comoAdminError(e));
    } finally {
      setProcesando(null);
    }
  }

  async function reemplazar(archivo: File) {
    setError(null);
    setProcesando("reemplazar");
    try {
      const path = construirPath(categoryKey, archivo);
      await subirImagen(path, archivo);
      setPrevia(sinCajas({ ...previa, storage_path: path }));
      setDimensiones(null);
    } catch (e) {
      setError(comoAdminError(e));
    } finally {
      setProcesando(null);
    }
  }

  const ocupado = procesando !== null;
  const cajaCuadrada = cajaMostrada("square");
  const cajaEditorial = cajaMostrada("editorial");

  return (
    <div className="adm-estudio" role="dialog" aria-modal="true" aria-label="Editar foto">
      <div className="adm-editor-barra">
        <button type="button" className="adm-mono adm-volver" onClick={onCerrar}>
          ← Fotos
        </button>
        <span className="adm-editor-sep" />
        <div className="adm-editor-titulo">
          <h2 className="adm-h2">Editar foto</h2>
          <p className="adm-mono adm-editor-sub">
            Foto {indice + 1} de {total}
          </p>
        </div>
        <div className="adm-editor-acciones">
          {tocoAlgo && (
            <span className="adm-pill">
              <span className="adm-pill-dot" />
              <span className="adm-mono">cambios sin aplicar</span>
            </span>
          )}
          <Boton onClick={onCerrar} variante="secundario">
            Descartar
          </Boton>
          <Boton onClick={() => onAplicar(previa)} variante="primario" disabled={!tocoAlgo}>
            Aplicar
          </Boton>
        </div>
      </div>

      <ErrorAviso error={error} />

      <div className="adm-estudio-cuerpo">
        <div className="adm-estudio-herramientas">
          <button
            type="button"
            className={`adm-estudio-tool ${herramienta === "square" ? "is-activo" : ""}`}
            onClick={() => setHerramienta("square")}
            disabled={ocupado}
          >
            <span className="adm-estudio-tool-icono">⬛</span> Recortar 1:1
          </button>
          <button
            type="button"
            className={`adm-estudio-tool ${herramienta === "editorial" ? "is-activo" : ""}`}
            onClick={() => setHerramienta("editorial")}
            disabled={ocupado}
          >
            <span className="adm-estudio-tool-icono">▯</span> Recortar 3:4
          </button>

          <div className="adm-estudio-tool-sep" />

          <button type="button" className="adm-estudio-tool" onClick={() => void girar()} disabled={ocupado}>
            <span className="adm-estudio-tool-icono">↻</span>{" "}
            {procesando === "girar" ? "Girando…" : "Girar 90°"}
          </button>
          <button type="button" className="adm-estudio-tool" onClick={() => void voltear()} disabled={ocupado}>
            <span className="adm-estudio-tool-icono">⇄</span>{" "}
            {procesando === "espejo" ? "Volteando…" : "Espejo"}
          </button>
          <button
            type="button"
            className="adm-estudio-tool"
            onClick={() => inputRef.current?.click()}
            disabled={ocupado}
          >
            <span className="adm-estudio-tool-icono">⇪</span>{" "}
            {procesando === "reemplazar" ? "Subiendo…" : "Reemplazar"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/webp,image/jpeg,image/png"
            hidden
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) void reemplazar(archivo);
              e.target.value = "";
            }}
          />

          <div className="adm-estudio-tool-sep" />

          <button
            type="button"
            className="adm-estudio-tool"
            onClick={restablecer}
            disabled={ocupado || !cajaDe(previa, herramienta)}
          >
            <span className="adm-estudio-tool-icono">↺</span> Restablecer este recorte
          </button>
          {onAnterior && (
            <button type="button" className="adm-estudio-tool" onClick={onAnterior} disabled={ocupado}>
              <span className="adm-estudio-tool-icono">‹</span> Foto anterior
            </button>
          )}
          {onSiguiente && (
            <button type="button" className="adm-estudio-tool" onClick={onSiguiente} disabled={ocupado}>
              <span className="adm-estudio-tool-icono">›</span> Foto siguiente
            </button>
          )}
        </div>

        <div className="adm-estudio-lienzo-wrap">
          {/* El lienzo toma la proporción REAL de la foto (no un cuadrado fijo): así el
              contenedor coincide exactamente con los límites de la imagen mostrada, y
              el % de arrastre (basado en el tamaño del contenedor) es el mismo % que
              se guarda en la caja — sin esto, una foto que no es cuadrada dejaría
              franjas vacías (letterboxing) y el arrastre se desalinearía del recorte
              real. */}
          <div
            className={`adm-estudio-lienzo ${ocupado ? "is-ocupado" : ""}`}
            style={dimensiones ? { aspectRatio: `${dimensiones.nw} / ${dimensiones.nh}` } : undefined}
            ref={lienzoRef}
          >
            <img
              key={previa.storage_path}
              src={publicImageUrl(previa.storage_path)}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setDimensiones({ nw: e.currentTarget.naturalWidth, nh: e.currentTarget.naturalHeight })
              }
            />
            {cajaActiva && (
              <div
                className="adm-estudio-caja"
                role="group"
                tabIndex={0}
                aria-label={`Caja de recorte ${herramienta === "square" ? "1:1" : "3:4"}. Arrastrala para moverla, la manija para cambiar el tamaño, o usá las flechas del teclado.`}
                style={{
                  left: `${cajaActiva.x}%`,
                  top: `${cajaActiva.y}%`,
                  width: `${cajaActiva.w}%`,
                  height: `${cajaActiva.h}%`,
                }}
                onPointerDown={(e) => iniciarArrastre(e, "mover")}
                onKeyDown={alTecladoCaja}
              >
                <span className="adm-estudio-tercios" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span
                  className="adm-estudio-manija"
                  onPointerDown={(e) => iniciarArrastre(e, "redimensionar")}
                />
              </div>
            )}
          </div>
          <p className="adm-mono adm-estudio-cifra">
            {herramienta === "square" ? "Recorte 1:1" : "Recorte 3:4"}
            {!cajaDe(previa, herramienta) && " · automático, todavía sin tocar"}
          </p>
        </div>

        <div className="adm-estudio-previas">
          <p className="adm-mono adm-campo-label">Cómo se va a ver</p>
          <div className={`adm-estudio-previa ${herramienta === "square" ? "is-activa" : ""}`}>
            <img
              key={`${previa.storage_path}-cuadrada`}
              src={publicImageUrl(previa.storage_path)}
              alt=""
              style={estiloRecorte(cajaCuadrada)}
            />
            <span className="adm-mono adm-estudio-previa-cap">Tarjeta 1:1</span>
          </div>
          <div
            className={`adm-estudio-previa adm-estudio-previa--editorial ${herramienta === "editorial" ? "is-activa" : ""}`}
          >
            <img
              key={`${previa.storage_path}-editorial`}
              src={publicImageUrl(previa.storage_path)}
              alt=""
              style={estiloRecorte(cajaEditorial)}
            />
            <span className="adm-mono adm-estudio-previa-cap">Editorial 3:4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
