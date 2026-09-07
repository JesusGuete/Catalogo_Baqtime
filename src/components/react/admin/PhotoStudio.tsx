import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { publicImageUrl } from "../../../lib/supabase/config";
import { construirPath, subirImagen } from "../../../lib/supabase/storage";
import { transformarImagen, type Rotacion } from "../../../lib/admin/image-transform";
import { comoAdminError, type AdminError } from "../../../lib/supabase/errors";
import type { FotoParaGuardar } from "../../../types/database";
import { Boton, ErrorAviso } from "./ui";

// Pantalla completa para editar UNA foto: encuadrar, girar, voltear o reemplazar.
// Reemplaza al panel "Encuadrar" que vivía plegado dentro de cada fila de
// PhotoManager — el dueño lo vio como dos entradas distintas para lo mismo (una para
// mover el punto, otra que iba a llegar después para recortar/girar) y pidió una sola.
//
// Trabaja sobre una COPIA en memoria (`previa`) y solo la manda de vuelta a
// PhotoManager al apretar "Aplicar". Girar/voltear/reemplazar SÍ suben un archivo a
// Storage de inmediato (no hay forma de "probar" una rotación sin subirla: Storage no
// tiene edición server-side), pero la fila del producto no se toca hasta guardar el
// producto — si acá se aprieta "Descartar", el archivo nuevo queda huérfano en Storage
// y se limpia solo en la próxima publicación, igual que cualquier otro huérfano.
//
// "Volver al original" solo alcanza lo que se hizo EN ESTA SESIÓN del estudio: `original`
// es una foto de cómo estaba la foto al abrirlo, no un historial permanente. Cerrar el
// estudio y volver a abrirlo sobre el resultado ya editado fija ESE resultado como el
// nuevo punto de partida — no hay (todavía) una columna en la base para el original de
// verdad. Es una limitación conocida, no un olvido.

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

const PASO_FLECHA = 5;
const PASO_FLECHA_FINO = 1;

function acotar(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** A dónde va a parar el punto de encuadre cuando la imagen gira 90/180/270 CW. */
function focalTrasGiro(giro: Rotacion, x: number, y: number): { x: number; y: number } {
  if (giro === 90) return { x: acotar(100 - y), y: acotar(x) };
  if (giro === 180) return { x: acotar(100 - x), y: acotar(100 - y) };
  return { x: acotar(y), y: acotar(100 - x) }; // 270
}

/** A dónde va a parar el punto de encuadre cuando la imagen se voltea en espejo. */
function focalTrasEspejo(x: number, y: number): { x: number; y: number } {
  return { x: acotar(100 - x), y: acotar(y) };
}

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
  const [procesando, setProcesando] = useState<"girar" | "espejo" | "reemplazar" | null>(null);
  const [error, setError] = useState<AdminError | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tocoAlgo =
    previa.storage_path !== original.storage_path ||
    previa.focal_x !== original.focal_x ||
    previa.focal_y !== original.focal_y;

  function alClicLienzo(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPrevia((p) => ({
      ...p,
      focal_x: acotar(((e.clientX - rect.left) / rect.width) * 100),
      focal_y: acotar(((e.clientY - rect.top) / rect.height) * 100),
    }));
  }

  function alTecladoLienzo(e: KeyboardEvent<HTMLDivElement>) {
    const paso = e.shiftKey ? PASO_FLECHA_FINO : PASO_FLECHA;
    let { focal_x: x, focal_y: y } = previa;
    switch (e.key) {
      case "ArrowLeft":
        x = acotar(x - paso);
        break;
      case "ArrowRight":
        x = acotar(x + paso);
        break;
      case "ArrowUp":
        y = acotar(y - paso);
        break;
      case "ArrowDown":
        y = acotar(y + paso);
        break;
      default:
        return;
    }
    e.preventDefault();
    setPrevia((p) => ({ ...p, focal_x: x, focal_y: y }));
  }

  async function girar() {
    setError(null);
    setProcesando("girar");
    try {
      const giro: Rotacion = 90;
      const blob = await transformarImagen(publicImageUrl(previa.storage_path), { rotar: giro });
      const archivo = new File([blob], "girada.webp", { type: "image/webp" });
      const path = construirPath(categoryKey, archivo);
      await subirImagen(path, archivo);
      const focal = focalTrasGiro(giro, previa.focal_x, previa.focal_y);
      setPrevia({ storage_path: path, focal_x: focal.x, focal_y: focal.y });
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
      const focal = focalTrasEspejo(previa.focal_x, previa.focal_y);
      setPrevia({ storage_path: path, focal_x: focal.x, focal_y: focal.y });
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
      // Es literalmente otra foto: el encuadre viejo no significa nada acá, se
      // reinicia al centro igual que cualquier foto recién subida.
      setPrevia({ storage_path: path, focal_x: 50, focal_y: 50 });
    } catch (e) {
      setError(comoAdminError(e));
    } finally {
      setProcesando(null);
    }
  }

  const ocupado = procesando !== null;

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
          <button type="button" className="adm-estudio-tool is-activo" disabled>
            <span className="adm-estudio-tool-icono">◎</span> Encuadre
          </button>
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
            onClick={() => setPrevia(original)}
            disabled={ocupado || !tocoAlgo}
          >
            <span className="adm-estudio-tool-icono">↺</span> Volver al original
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
          <div
            className={`adm-estudio-lienzo ${ocupado ? "is-ocupado" : ""}`}
            role="slider"
            tabIndex={0}
            aria-label="Punto de encuadre. Hacé clic donde debería quedar el centro, o ajustalo con las flechas del teclado."
            aria-valuetext={`${previa.focal_x}% horizontal, ${previa.focal_y}% vertical`}
            onClick={ocupado ? undefined : alClicLienzo}
            onKeyDown={ocupado ? undefined : alTecladoLienzo}
          >
            <img key={previa.storage_path} src={publicImageUrl(previa.storage_path)} alt="" draggable={false} />
            <span className="adm-estudio-tercios" aria-hidden="true">
              <i />
              <i />
              <i className="h" />
              <i className="h" />
            </span>
            <span
              className="adm-estudio-punto"
              style={{ left: `${previa.focal_x}%`, top: `${previa.focal_y}%` }}
            />
          </div>
          <p className="adm-mono adm-estudio-cifra">
            {previa.focal_x}% / {previa.focal_y}%
          </p>
        </div>

        <div className="adm-estudio-previas">
          <p className="adm-mono adm-campo-label">Cómo se va a ver</p>
          <div className="adm-estudio-previa">
            <img
              key={`${previa.storage_path}-cuadrada`}
              src={publicImageUrl(previa.storage_path)}
              alt=""
              style={{ objectPosition: `${previa.focal_x}% ${previa.focal_y}%` }}
            />
            <span className="adm-mono adm-estudio-previa-cap">Tarjeta 1:1</span>
          </div>
          <div className="adm-estudio-previa adm-estudio-previa--editorial">
            <img
              key={`${previa.storage_path}-editorial`}
              src={publicImageUrl(previa.storage_path)}
              alt=""
              style={{ objectPosition: `${previa.focal_x}% ${previa.focal_y}%` }}
            />
            <span className="adm-mono adm-estudio-previa-cap">Editorial 3:4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
