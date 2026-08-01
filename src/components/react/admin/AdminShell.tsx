import { useEffect, useState, type ReactNode } from "react";
import { cerrarSesion, minutosRestantes, type Sesion } from "../../../lib/supabase/auth-store";

// Sidebar + barra superior. Es puramente presentacional: recibe qué vista está
// activa y avisa cuando se pide otra. No sabe qué hay dentro de cada pantalla.
//
// NOTA sobre el diseño original: la maqueta tenía un ítem "IMÁGENES" en el sidebar.
// Se sacó a propósito. El bucket `site-images` (hero, logo, carrusel) es de SOLO
// LECTURA para todo el mundo, admins incluidos — 006_storage_policies.sql no le da
// política de escritura a ningún rol. Es deliberado: así la rutina que limpia
// imágenes huérfanas de productos no puede borrar el logo ni por error. Una sección
// que solo puede mirar y nunca tocar no justifica un lugar en la navegación
// principal; esas imágenes se suben desde el dashboard de Supabase.

export type Vista = "productos" | "categorias" | "publicar";

interface Props {
  vista: Vista;
  onVista: (v: Vista) => void;
  sesion: Sesion;
  conteoProductos: number;
  conteoCategorias: number;
  /** Cuántos cambios hay sin publicar. Enciende el punto del nav y la píldora. */
  cambiosPendientes: number;
  titulo: string;
  /** Línea en mono debajo del título: la tabla o función que está detrás. */
  subtitulo: string;
  acciones?: ReactNode;
  children: ReactNode;
}

export default function AdminShell({
  vista,
  onVista,
  sesion,
  conteoProductos,
  conteoCategorias,
  cambiosPendientes,
  titulo,
  subtitulo,
  acciones,
  children,
}: Props) {
  // El token dura una hora. Mostrar cuánto queda no es decorativo: la sesión vive
  // solo en memoria, así que el dueño tiene que saber que si recarga, la pierde.
  const [minutos, setMinutos] = useState(minutosRestantes);
  useEffect(() => {
    const id = setInterval(() => setMinutos(minutosRestantes()), 30_000);
    return () => clearInterval(id);
  }, []);

  const items: { id: Vista; label: string; contador?: number; punto?: boolean }[] = [
    { id: "productos", label: "PRODUCTOS", contador: conteoProductos },
    { id: "categorias", label: "CATEGORÍAS", contador: conteoCategorias },
    { id: "publicar", label: "PUBLICAR", punto: cambiosPendientes > 0 },
  ];

  return (
    <div className="adm-shell">
      <nav className="adm-sidebar" aria-label="Secciones del panel">
        <button
          type="button"
          className="adm-sidebar-marca"
          onClick={() => onVista("productos")}
          aria-label="Ir al inicio del panel"
        >
          <img
            src="/assets/img/logo.png"
            alt="Baqtime"
            className="adm-sidebar-logo"
            width="998"
            height="297"
          />
          <p className="adm-mono adm-sidebar-sub">ADMINISTRACIÓN</p>
        </button>

        <ul className="adm-nav">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className={`adm-nav-item ${vista === it.id ? "is-activo" : ""}`}
                onClick={() => onVista(it.id)}
                aria-current={vista === it.id ? "page" : undefined}
              >
                <span className="adm-nav-marca" />
                <span className="adm-mono adm-nav-label">{it.label}</span>
                {it.contador !== undefined && (
                  <span className="adm-mono adm-nav-contador">{it.contador}</span>
                )}
                {it.punto && <span className="adm-nav-punto" aria-label="hay cambios sin publicar" />}
              </button>
            </li>
          ))}
        </ul>

        <div className="adm-sidebar-pie">
          <p className="adm-sidebar-email">{sesion.email ?? "sesión activa"}</p>
          <p className="adm-mono adm-sidebar-expira">
            LA SESIÓN EXPIRA EN {minutos} MIN · RECARGAR CIERRA SESIÓN
          </p>
          <button
            type="button"
            className="adm-mono adm-sidebar-salir"
            onClick={() => void cerrarSesion()}
          >
            CERRAR SESIÓN
          </button>
        </div>
      </nav>

      <div className="adm-main">
        <header className="adm-topbar">
          <div className="adm-topbar-titulo">
            <h1 className="adm-h1">{titulo}</h1>
            <p className="adm-mono adm-topbar-sub">{subtitulo}</p>
          </div>
          <div className="adm-topbar-acciones">
            {cambiosPendientes > 0 && (
              <span className="adm-pill">
                <span className="adm-pill-dot" />
                <span className="adm-mono">
                  {cambiosPendientes} {cambiosPendientes === 1 ? "CAMBIO" : "CAMBIOS"} SIN PUBLICAR
                </span>
              </span>
            )}
            {acciones}
          </div>
        </header>

        <div className="adm-contenido">{children}</div>
      </div>
    </div>
  );
}
