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

export type Vista = "productos" | "categorias" | "colores" | "pedidos" | "publicar";

interface Props {
  vista: Vista;
  onVista: (v: Vista) => void;
  sesion: Sesion;
  conteoProductos: number;
  conteoCategorias: number;
  /** Pedidos esperando que confirmes el pago. Enciende el punto de PEDIDOS. */
  pedidosPendientes: number;
  /** Cuántos cambios hay sin publicar. Enciende el punto del nav y la píldora. */
  cambiosPendientes: number;
  titulo: string;
  /** Frase corta debajo del título. Vacía cuando el título ya se explica solo. */
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
  pedidosPendientes,
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

  // El punto de "Publicar" se sacó a propósito: la píldora de la barra superior ya
  // avisa lo mismo en TODAS las pantallas (ver más abajo, no depende de `vista`), así
  // que tenerlo también acá era la misma noticia dos veces. El de "Pedidos" se queda:
  // es la única señal de que hay algo esperando confirmación de pago.
  //
  // "Colores" ya no tiene su propio ítem: pasó a ser una pestaña DENTRO de
  // Categorías (AdminApp la dibuja arriba del contenido). Acá "Categorías" se marca
  // activo en las dos vistas, para que el ítem del menú no "apague" su resaltado
  // solo porque el dueño está mirando la pestaña Colores.
  const items: { id: Vista; label: string; contador?: number; punto?: boolean; activoEn?: Vista[] }[] = [
    { id: "productos", label: "Productos", contador: conteoProductos },
    {
      id: "categorias",
      label: "Categorías",
      contador: conteoCategorias,
      activoEn: ["categorias", "colores"],
    },
    { id: "pedidos", label: "Pedidos", punto: pedidosPendientes > 0 },
    { id: "publicar", label: "Publicar" },
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
          <p className="adm-mono adm-sidebar-sub">Administración</p>
        </button>

        <ul className="adm-nav">
          {items.map((it) => {
            const activo = (it.activoEn ?? [it.id]).includes(vista);
            return (
              <li key={it.id}>
                <button
                  type="button"
                  className={`adm-nav-item ${activo ? "is-activo" : ""}`}
                  onClick={() => onVista(it.id)}
                  aria-current={activo ? "page" : undefined}
                >
                  <span className="adm-nav-marca" />
                  <span className="adm-nav-label">{it.label}</span>
                  {it.contador !== undefined && (
                    <span className="adm-mono adm-nav-contador">{it.contador}</span>
                  )}
                  {it.punto && (
                    <span
                      className="adm-nav-punto"
                      aria-label="hay pedidos esperando confirmación de pago"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="adm-sidebar-pie">
          <p className="adm-sidebar-email">{sesion.email ?? "sesión activa"}</p>
          {/* Antes se mostraba siempre, con los 60 minutos completos incluidos. Es cierto
              todo el rato -la sesión vive solo en memoria- pero avisarlo desde el minuto
              uno mete apuro sin necesidad. Ahora aparece recién cuando de verdad hay que
              apurarse: a partir de los últimos 10 minutos. */}
          {minutos <= 10 && (
            <p className="adm-mono adm-sidebar-expira">
              La sesión expira en {minutos} min · recargar la cierra
            </p>
          )}
          <button type="button" className="adm-sidebar-salir" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </div>
      </nav>

      <div className="adm-main">
        <header className="adm-topbar">
          <div className="adm-topbar-titulo">
            <h1 className="adm-h1">{titulo}</h1>
            {subtitulo && <p className="adm-topbar-sub">{subtitulo}</p>}
          </div>
          <div className="adm-topbar-acciones">
            {/* Única señal global de "hay cambios sin publicar": aparece en TODAS las
                pantallas (no depende de `vista`), así que el punto que antes tenía el
                ítem "Publicar" del menú de al lado quedaba anunciando lo mismo dos veces. */}
            {cambiosPendientes > 0 && (
              <span className="adm-pill">
                <span className="adm-pill-dot" />
                <span className="adm-mono">
                  {cambiosPendientes} {cambiosPendientes === 1 ? "cambio" : "cambios"} sin publicar
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
