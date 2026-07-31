import { useRef, useState, type DragEvent, type RefObject } from "react";
import { subirArchivos } from "../../../lib/admin/photos.repo";
import { publicImageUrl } from "../../../lib/supabase/config";
import { useArrastreOrden } from "../../../lib/admin/useArrastreOrden";
import type { AdminError } from "../../../lib/supabase/errors";
import { Aviso, ErrorAviso, IconoAgarre, SectionHead } from "./ui";

// Gestor de fotos de un producto.
//
// Trabaja sobre una LISTA DE RUTAS en memoria y avisa al editor cada vez que cambia.
// No escribe en la base: quien persiste es el editor, con una sola llamada a
// `replace_product_photos_draft` mandando el array completo.
//
// Esa separación no es cosmética. Agregar, quitar y reordenar son la misma operación
// para la base (reemplazo del array entero, en una transacción). Si este componente
// guardara cada cambio por su cuenta, una foto borrada y otra agregada serían dos
// transacciones, y una falla en el medio dejaría al producto sin fotos.

interface SubiendoUI {
  nombre: string;
  porcentaje: number;
}

interface Props {
  /** Rutas actuales, en orden. El índice 0 es la principal. */
  rutas: string[];
  onChange: (rutas: string[]) => void;
  /** Hace falta para armar la ruta: `<category_key>/<timestamp>.<ext>` */
  categoryKey: string;
  deshabilitado?: boolean;
}

export default function PhotoManager({ rutas, onChange, categoryKey, deshabilitado }: Props) {
  const [subiendo, setSubiendo] = useState<SubiendoUI[]>([]);
  const [errores, setErrores] = useState<{ nombreArchivo: string; error: AdminError }[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function agregar(archivos: File[]) {
    if (!archivos.length || deshabilitado) return;

    if (!categoryKey) {
      setErrores([
        {
          nombreArchivo: archivos[0]!.name,
          error: {
            message: "Elegí primero la categoría: define la carpeta donde se guarda la imagen.",
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
    if (subidas.length) onChange([...rutas, ...subidas]);
  }

  function quitar(indice: number) {
    onChange(rutas.filter((_, i) => i !== indice));
  }

  function mover(desde: number, hasta: number) {
    if (desde === hasta) return;
    const copia = [...rutas];
    const [movida] = copia.splice(desde, 1);
    copia.splice(hasta, 0, movida!);
    onChange(copia);
  }

  // Ya es optimista por diseño (mover() escribe directo en la lista en
  // memoria, sin red), así que alcanza con el hook de arrastre solo.
  const arrastre = useArrastreOrden({ cantidad: rutas.length, activo: !deshabilitado, onMover: mover });

  function soltarArchivos(e: DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    // Si lo que se arrastra es una foto de la lista y no un archivo del escritorio,
    // `files` viene vacío y no hay nada que subir.
    const archivos = Array.from(e.dataTransfer.files);
    if (archivos.length) void agregar(archivos);
  }

  return (
    <section className="adm-card">
      <SectionHead numero="04" titulo="Fotos" />

      <p className="adm-nota">
        Arrastrá o usá las flechas para reordenar. La primera es la que se ve en la
        tarjeta del catálogo.
      </p>

      {rutas.length > 0 && (
        <ul className="adm-fotos" ref={arrastre.contenedorRef as RefObject<HTMLUListElement | null>}>
          {rutas.map((ruta, i) => (
            <li key={ruta} className="adm-foto" {...arrastre.propsItem(i)}>
              <span
                className={`adm-foto-agarre ${deshabilitado ? "is-deshabilitado" : ""}`}
                {...arrastre.propsAgarre(i)}
                aria-label={
                  deshabilitado
                    ? undefined
                    : `Reordenar foto ${i + 1}. Usá las flechas arriba y abajo, o arrastrá.`
                }
                title={deshabilitado ? undefined : "Arrastrá o usá las flechas para reordenar"}
              >
                <IconoAgarre />
              </span>
              <img
                className="adm-foto-thumb"
                src={publicImageUrl(ruta)}
                alt=""
                width={54}
                height={54}
                loading="lazy"
              />
              <div className="adm-foto-meta">
                {i === 0 ? (
                  <span className="adm-mono adm-tag adm-tag--solido">PRINCIPAL</span>
                ) : (
                  <span className="adm-mono adm-foto-pos">POSICIÓN {i}</span>
                )}
                <span className="adm-mono adm-foto-path">{ruta}</span>
              </div>
              <div className="adm-foto-acciones">
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
        <span className="adm-mono">SOLTAR IMÁGENES ACÁ O HACER CLIC</span>
        <span className="adm-mono adm-dropzone-sub">WEBP · JPG · PNG · HASTA 5 MB</span>
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

      <Aviso
        titulo="El nombre del archivo lo pone el panel, no vos."
        meta="CATEGORÍA/TIMESTAMP.EXT · SE VALIDA ANTES DE SUBIR PARA NO DEJAR ARCHIVOS HUÉRFANOS"
      />

      {errores.map((f) => (
        <ErrorAviso key={f.nombreArchivo} error={f.error} />
      ))}
    </section>
  );
}
