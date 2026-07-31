import { useEffect, useMemo, useState } from "react";
import type { Category, ProductWithPhotos, Publication } from "../../../types/database";
import { calcularDiff, type TipoCambio } from "../../../lib/admin/diff";
import * as publishRepo from "../../../lib/admin/publish.repo";
import { descartarCambios } from "../../../lib/admin/revertir";
import { useAccion } from "../../../lib/admin/useAdminData";
import { comoAdminError, type AdminError } from "../../../lib/supabase/errors";
import { Aviso, Boton, ErrorAviso, Etiqueta, Vacio } from "./ui";

// Pantalla 04 del diseño. Es la más importante del panel: es el único momento en que
// algo llega a la tienda.
//
// Muestra el diff ANTES de publicar, no un botón a ciegas. Y avisa de la guarda
// `P0001` antes de que el dueño la choque, no después.

interface Props {
  borrador: ProductWithPhotos[];
  publicado: ProductWithPhotos[];
  categorias: Category[];
  onPublicado: () => void;
  /** Después de "Deshacer cambios" (revertir.ts). Solo productos, ver ahí por qué. */
  onCambio: () => void;
}

const TAG_POR_TIPO: Record<TipoCambio, { texto: string; tono: "solido" | "borrador" | "neutro" }> = {
  nuevo: { texto: "NUEVO", tono: "solido" },
  "se-muestra": { texto: "VUELVE", tono: "solido" },
  editado: { texto: "EDITADO", tono: "borrador" },
  "se-oculta": { texto: "SE OCULTA", tono: "neutro" },
  eliminado: { texto: "SE BORRA", tono: "neutro" },
};

export default function PublishView({ borrador, publicado, categorias, onPublicado, onCambio }: Props) {
  const [publicaciones, setPublicaciones] = useState<Publication[]>([]);
  const [errorHistorial, setErrorHistorial] = useState<AdminError | null>(null);
  const [resultado, setResultado] = useState<publishRepo.ResultadoPublicacion | null>(null);

  const diff = useMemo(() => calcularDiff(borrador, publicado), [borrador, publicado]);
  const etiquetaCategoria = useMemo(
    () => Object.fromEntries(categorias.map((c) => [c.key, c.label])),
    [categorias]
  );

  useEffect(() => {
    publishRepo
      .listarPublicaciones()
      .then(setPublicaciones)
      .catch((e: unknown) => setErrorHistorial(comoAdminError(e)));
  }, [resultado]);

  const publicar = useAccion(async () => {
    const r = await publishRepo.publicar();
    setResultado(r);
    onPublicado();
    return r;
  });

  const descartar = useAccion(async () => {
    await descartarCambios(borrador, publicado);
    onCambio();
  });

  // Cuántas imágenes van a quedar sin uso. Es una estimación del cliente: la cuenta
  // real la hace publish_catalog() en la transacción y viene en `removed_paths`.
  const huerfanasEstimadas = useMemo(() => {
    const enBorrador = new Set(
      borrador.flatMap((p) => (p.product_photos_draft ?? []).map((f) => f.storage_path))
    );
    const enPublicado = new Set(
      publicado.flatMap((p) => (p.product_photos ?? []).map((f) => f.storage_path))
    );
    return [...enPublicado].filter((path) => !enBorrador.has(path)).length;
  }, [borrador, publicado]);

  const ultima = publicaciones[0];

  return (
    <div className="adm-publicar">
      <div className="adm-publicar-diff">
        <section className="adm-card">
          <header className="adm-publicar-head">
            <h2 className="adm-h2">Lo que va a cambiar en el sitio</h2>
            <p className="adm-nota">Comparado contra lo que hay publicado ahora mismo.</p>
          </header>

          <div className="adm-stats">
            <div className="adm-stat adm-stat--borrador">
              <span className="adm-mono adm-stat-num">{diff.nuevos}</span>
              <span className="adm-mono adm-stat-label">NUEVOS</span>
            </div>
            <div className="adm-stat adm-stat--borrador">
              <span className="adm-mono adm-stat-num">{diff.editados}</span>
              <span className="adm-mono adm-stat-label">EDITADOS</span>
            </div>
            <div className="adm-stat">
              <span className="adm-mono adm-stat-num">{diff.seOcultan}</span>
              <span className="adm-mono adm-stat-label">SE OCULTAN</span>
            </div>
            <div className="adm-stat adm-stat--vivo">
              <span className="adm-mono adm-stat-num">{diff.sinCambios}</span>
              <span className="adm-mono adm-stat-label">SIN CAMBIOS</span>
            </div>
          </div>

          {diff.vacio ? (
            <Vacio titulo="No hay nada para publicar.">
              <p>El borrador y el catálogo publicado son idénticos.</p>
            </Vacio>
          ) : (
            <ul className="adm-cambios">
              {diff.cambios.map((c) => {
                const tag = TAG_POR_TIPO[c.tipo];
                return (
                  <li key={`${c.tipo}-${c.id}`} className="adm-cambio">
                    <Etiqueta tono={tag.tono}>{tag.texto}</Etiqueta>
                    <span className="adm-cambio-nombre">
                      {c.nombre}
                      <span className="adm-mono adm-cambio-cat">
                        {" "}
                        · {etiquetaCategoria[c.categoryKey] ?? c.categoryKey}
                      </span>
                    </span>
                    <span className="adm-mono adm-cambio-detalle">{c.detalle}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {huerfanasEstimadas > 0 && (
          <Aviso
            titulo={`Al publicar quedan ${huerfanasEstimadas} imágenes sin usar. El panel las borra de Storage después.`}
            meta="PUBLISH_CATALOG DEVUELVE REMOVED_PATHS · POSTGRES NO PUEDE HABLAR CON STORAGE, LO HACE EL CLIENTE"
          />
        )}
      </div>

      <aside className="adm-publicar-accion">
        {resultado ? (
          <section className="adm-card adm-card--exito">
            <h3 className="adm-h3">Catálogo publicado</h3>
            <p className="adm-nota">
              Quedaron {resultado.product_count} productos y {resultado.photo_count} fotos en el
              catálogo publicado.
            </p>
            <p className="adm-mono adm-hint">
              PUBLICACIÓN #{resultado.publication_id} · {resultado.imagenesBorradas} IMÁGENES
              LIBERADAS DE STORAGE
            </p>

            {/* La tienda es HTML estático: loadCatalog() corre en el build, no en cada
                visita. Publicar actualiza la base, pero baqtime.store sigue sirviendo el
                HTML de la última construcción. Decir "ya está en el sitio" sería mentir, y
                el dueño lo descubriría abriendo la tienda y no viendo su cambio. */}
            <Aviso
              tono="borrador"
              titulo="Falta un paso: el sitio todavía no muestra esto."
              meta="LA TIENDA SE ARMA EN EL BUILD · HAY QUE RECONSTRUIRLA PARA QUE TOME EL CATÁLOGO NUEVO"
            >
              <p>
                Los cambios ya están guardados y no se pierden. Para que se vean en
                baqtime.store hay que reconstruir el sitio desde Cloudflare.
              </p>
            </Aviso>
            {resultado.errorLimpieza && (
              <Aviso
                tono="borrador"
                titulo="La publicación salió bien, pero no se pudieron borrar las imágenes sin uso."
                meta={`OCUPAN CUOTA, NO ROMPEN NADA · ${resultado.errorLimpieza.toUpperCase()}`}
              />
            )}
            <Boton onClick={() => setResultado(null)} variante="secundario" ancho>
              VOLVER
            </Boton>
          </section>
        ) : (
          <section className="adm-card adm-card--oscuro">
            <h3 className="adm-publicar-h3">Publicar el borrador</h3>
            <p className="adm-publicar-bajada">
              Copia el borrador entero al catálogo público en una sola transacción. O pasa
              todo, o no pasa nada.
            </p>

            <ol className="adm-pasos">
              <li>
                <span className="adm-mono adm-paso-num">1</span>
                Se copia el borrador al catálogo público
              </li>
              <li>
                <span className="adm-mono adm-paso-num">2</span>
                {huerfanasEstimadas > 0
                  ? `Se borran de Storage las ${huerfanasEstimadas} imágenes huérfanas`
                  : "No queda ninguna imagen huérfana para borrar"}
              </li>
              <li>
                <span className="adm-mono adm-paso-num">3</span>
                Después hay que reconstruir el sitio para que la tienda lo muestre
              </li>
            </ol>

            <ErrorAviso error={publicar.error ?? descartar.error} />

            <Boton
              onClick={() => {
                const n = diff.cambios.length;
                if (
                  window.confirm(
                    `¿Publicar ${n} ${n === 1 ? "cambio" : "cambios"}? Quedan guardados en el catálogo. El sitio los muestra recién cuando se reconstruya.`
                  )
                ) {
                  void publicar.ejecutar();
                }
              }}
              variante="acento"
              ancho
              disabled={diff.vacio || diff.dispararaGuarda}
              cargando={publicar.enCurso}
            >
              {diff.vacio
                ? "NADA PARA PUBLICAR"
                : `PUBLICAR ${diff.cambios.length} ${diff.cambios.length === 1 ? "CAMBIO" : "CAMBIOS"}`}
            </Boton>
            <Boton
              onClick={() => {
                const n = diff.cambios.length;
                if (
                  window.confirm(
                    `¿Deshacer ${n === 1 ? "el cambio" : `los ${n} cambios`} sin publicar? El borrador de productos vuelve a quedar igual a lo publicado ahora mismo.`
                  )
                ) {
                  void descartar.ejecutar();
                }
              }}
              variante="peligro"
              ancho
              disabled={diff.vacio}
              cargando={descartar.enCurso}
            >
              DESHACER CAMBIOS
            </Boton>
            <p className="adm-mono adm-publicar-nota">SE PIDE CONFIRMACIÓN ANTES DE EJECUTAR</p>
          </section>
        )}

        {diff.dispararaGuarda && (
          <Aviso
            tono="error"
            titulo="Un borrador vacío no se puede publicar."
            meta="P0001 · GUARDA DE CATÁLOGO VACÍO"
          >
            <p>
              La base lo rechaza para no borrar el catálogo entero sin vuelta atrás. Para
              vaciarlo a propósito hay que ocultar cada producto y publicar eso.
            </p>
          </Aviso>
        )}

        <section className="adm-card">
          <p className="adm-mono adm-regla-grupo">HISTORIAL</p>
          <ErrorAviso error={errorHistorial} />

          {!publicaciones.length ? (
            <p className="adm-mono adm-hint">TODAVÍA NO SE PUBLICÓ NUNCA</p>
          ) : (
            <ul className="adm-historial">
              {publicaciones.map((p) => (
                <li key={p.id} className="adm-historial-item">
                  <span
                    className={`adm-punto-dot ${p.id === ultima?.id ? "is-vivo" : "is-viejo"}`}
                  />
                  <span className="adm-historial-txt">
                    <span className="adm-historial-fecha">
                      {new Date(p.published_at).toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="adm-mono adm-historial-meta">
                      #{p.id} · {p.product_count} PRODUCTOS · {p.photo_count} FOTOS
                      {p.published_by_email ? ` · ${p.published_by_email}` : ""}
                    </span>
                  </span>
                  {p.id === ultima?.id && <span className="adm-mono adm-historial-vivo">EN VIVO</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
