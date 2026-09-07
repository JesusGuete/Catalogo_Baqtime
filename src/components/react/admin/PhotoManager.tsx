import { useRef, useState, type DragEvent, type RefObject } from "react";
import { subirArchivos } from "../../../lib/admin/photos.repo";
import { publicImageUrl } from "../../../lib/supabase/config";
import { useArrastreOrden } from "../../../lib/admin/useArrastreOrden";
import type { AdminError } from "../../../lib/supabase/errors";
import type { FotoParaGuardar } from "../../../types/database";
import { ErrorAviso, IconoAgarre, SectionHead } from "./ui";
import PhotoStudio from "./PhotoStudio";

// Gestor de fotos de un producto.
//
// Trabaja sobre una LISTA EN MEMORIA (ruta + encuadre de cada foto) y avisa al editor
// cada vez que cambia. No escribe en la base: quien persiste es el editor, con una sola
// llamada a `replace_product_photos_draft` mandando el array completo.
//
// Esa separación no es cosmética. Agregar, quitar, reordenar y editar son la misma
// operación para la base (reemplazo del array entero, en una transacción). Si este
// componente guardara cada cambio por su cuenta, una foto borrada y otra editada
// serían dos transacciones, y una falla en el medio podría dejar el producto a medio
// guardar.
//
// Editar (encuadrar, girar, voltear, reemplazar) vive en PhotoStudio, a pantalla
// completa — no acá plegado en la fila. Hubo una versión con un panel de encuadre
// aparte dentro de cada fila; se sacó porque iba a convivir mal con el editor completo
// que reemplazaba (dos entradas distintas para lo mismo).

interface SubiendoUI {
  nombre: string;
  porcentaje: number;
}

interface Props {
  /** Rutas actuales con su encuadre, en orden. El índice 0 es la principal. */
  fotos: FotoParaGuardar[];
  onChange: (fotos: FotoParaGuardar[]) => void;
  /** Hace falta para armar la ruta: `<category_key>/<timestamp>.<ext>` */
  categoryKey: string;
  deshabilitado?: boolean;
}

export default function PhotoManager({ fotos, onChange, categoryKey, deshabilitado }: Props) {
  const [subiendo, setSubiendo] = useState<SubiendoUI[]>([]);
  const [errores, setErrores] = useState<{ nombreArchivo: string; error: AdminError }[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  /** Índice de la foto abierta en el estudio, o `null` si está cerrado. */
  const [editando, setEditando] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function agregar(archivos: File[]) {
    if (!archivos.length || deshabilitado) return;

    if (!categoryKey) {
      setErrores([
        {
          nombreArchivo: archivos[0]!.name,
          error: {
            message: "Elige primero la categoría: define la carpeta donde se guarda la imagen.",
            etiqueta: "SIN CATEGORÍA",
          } as AdminError,
        },
      ]);
      return;
    }

    setErrores([]);
    setSubiendo(archivos.map((f) => ({ nombre: f.name, porcentaje: 0 })));

    const { subidas, fallidas } = await subirArchivos(categoryKey, archivos, (i, pct) => {
      setSubiendo((prev) => prev.map((s, idx) => (idx === i ? { ...s, porcentaje: pct } : s)));
    });

    setSubiendo([]);
    if (fallidas.length) setErrores(fallidas);
    // Foto nueva = encuadre centrado (50/50): es lo que la tienda ya hace hoy sin
    // ningún dato, así que es el punto de partida correcto hasta que alguien lo mueva.
    if (subidas.length) {
      onChange([...fotos, ...subidas.map((storage_path) => ({ storage_path, focal_x: 50, focal_y: 50 }))]);
    }
  }

  function quitar(indice: number) {
    if (editando === indice) setEditando(null);
    onChange(fotos.filter((_, i) => i !== indice));
  }

  function mover(desde: number, hasta: number) {
    if (desde === hasta) return;
    const copia = [...fotos];
    const [movida] = copia.splice(desde, 1);
    copia.splice(hasta, 0, movida!);
    onChange(copia);
  }

  // Ya es optimista por diseño (mover() escribe directo en la lista en
  // memoria, sin red), así que alcanza con el hook de arrastre solo.
  const arrastre = useArrastreOrden({ cantidad: fotos.length, activo: !deshabilitado, onMover: mover });

  function soltarArchivos(e: DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    // Si lo que se arrastra es una foto de la lista y no un archivo del escritorio,
    // `files` viene vacío y no hay nada que subir.
    const archivosSoltados = Array.from(e.dataTransfer.files);
    if (archivosSoltados.length) void agregar(archivosSoltados);
  }

  if (editando !== null && fotos[editando]) {
    return (
      <PhotoStudio
        foto={fotos[editando]}
        categoryKey={categoryKey}
        indice={editando}
        total={fotos.length}
        onCerrar={() => setEditando(null)}
        onAplicar={(foto) => {
          onChange(fotos.map((f, i) => (i === editando ? foto : f)));
          setEditando(null);
        }}
        onAnterior={editando > 0 ? () => setEditando(editando - 1) : undefined}
        onSiguiente={editando < fotos.length - 1 ? () => setEditando(editando + 1) : undefined}
      />
    );
  }

  return (
    <section className="adm-card">
      <SectionHead numero="04" titulo="Fotos" />

      <p className="adm-nota">
        Arrastra o usa las flechas para reordenar. La primera es la que se ve en la
        tarjeta del catálogo.
      </p>

      {fotos.length > 0 && (
        <ul className="adm-fotos" ref={arrastre.contenedorRef as RefObject<HTMLUListElement | null>}>
          {fotos.map((foto, i) => (
            <li key={foto.storage_path} className="adm-foto" {...arrastre.propsItem(i)}>
              <div className="adm-foto-fila">
                <span
                  className={`adm-foto-agarre ${deshabilitado ? "is-deshabilitado" : ""}`}
                  {...arrastre.propsAgarre(i)}
                  aria-label={
                    deshabilitado
                      ? undefined
                      : `Reordenar foto ${i + 1}. Usa las flechas arriba y abajo, o arrastra.`
                  }
                  title={deshabilitado ? undefined : "Arrastra o usa las flechas para reordenar"}
                >
                  <IconoAgarre />
                </span>
                <img
                  className="adm-foto-thumb"
                  src={publicImageUrl(foto.storage_path)}
                  alt=""
                  width={54}
                  height={54}
                  loading="lazy"
                  style={{ objectPosition: `${foto.focal_x}% ${foto.focal_y}%` }}
                />
                <div className="adm-foto-meta">
                  {i === 0 ? (
                    <span className="adm-mono adm-tag adm-tag--solido">PRINCIPAL</span>
                  ) : (
                    <span className="adm-mono adm-foto-pos">POSICIÓN {i}</span>
                  )}
                  <span className="adm-mono adm-foto-path">{foto.storage_path}</span>
                </div>
                <div className="adm-foto-acciones">
                  <button
                    type="button"
                    className="adm-foto-btn"
                    onClick={() => setEditando(i)}
                    disabled={deshabilitado}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="adm-mono adm-foto-btn adm-foto-btn--quitar"
                    onClick={() => quitar(i)}
                    aria-label={`Quitar la foto ${i + 1}`}
                    disabled={deshabilitado}
                  >
                    ×
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {subiendo.map((s) => (
        <div key={s.nombre} className="adm-foto adm-foto--subiendo">
          <span className="adm-mono adm-foto-pct">{s.porcentaje}%</span>
          <div className="adm-foto-meta">
            <span className="adm-mono adm-foto-path">SUBIENDO · {s.nombre}</span>
            <span className="adm-barra">
              <span className="adm-barra-fill" style={{ width: `${s.porcentaje}%` }} />
            </span>
          </div>
        </div>
      ))}

      <button
        type="button"
        className={`adm-dropzone ${arrastrando ? "is-activo" : ""}`}
        disabled={deshabilitado}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltarArchivos}
      >
        <span>Soltar imágenes aquí o hacer clic</span>
        <span className="adm-mono adm-dropzone-sub">WebP · JPG · PNG · hasta 5 MB</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/webp,image/jpeg,image/png"
        multiple
        hidden
        onChange={(e) => {
          void agregar(Array.from(e.target.files ?? []));
          // Se limpia para que volver a elegir el MISMO archivo dispare el evento:
          // sin esto, reintentar una subida fallida no hace nada.
          e.target.value = "";
        }}
      />

      {errores.map((f) => (
        <ErrorAviso key={f.nombreArchivo} error={f.error} />
      ))}
    </section>
  );
}
