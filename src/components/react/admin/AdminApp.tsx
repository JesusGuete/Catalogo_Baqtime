import { useMemo, useState } from "react";
import { useSession, useAdminData } from "../../../lib/admin/useAdminData";
import { configuracionFaltante } from "../../../lib/supabase/config";
import { calcularDiff } from "../../../lib/admin/diff";
import LoginView from "./LoginView";
import AdminShell, { type Vista } from "./AdminShell";
import ProductsView from "./ProductsView";
import ProductEditor from "./ProductEditor";
import CategoriesView from "./CategoriesView";
import PublishView from "./PublishView";
import { Aviso, Boton, ErrorAviso } from "./ui";

// Raíz del panel. Decide qué se ve y nada más: no hace fetch propio ni conoce las
// tablas. Los datos vienen de useAdminData y las escrituras las hacen las vistas.

/** `null` = ninguno abierto. `"nuevo"` = el editor en blanco. */
type EdicionActiva = string | "nuevo" | null;

export default function AdminApp() {
  const sesion = useSession();
  const [vista, setVista] = useState<Vista>("productos");
  const [editando, setEditando] = useState<EdicionActiva>(null);

  const datos = useAdminData(sesion !== null);

  const cambiosPendientes = useMemo(
    () => calcularDiff(datos.borrador, datos.publicado).cambios.length,
    [datos.borrador, datos.publicado]
  );

  // Una variable de entorno faltante rompe todo con un error de red confuso. Mejor
  // decirlo antes de mostrar un formulario de login que no puede funcionar.
  const faltantes = configuracionFaltante();
  if (faltantes.length) {
    return (
      <div className="adm-config-error">
        <Aviso
          tono="error"
          titulo="Falta configuración para conectarse a Supabase."
          meta={faltantes.join(" · ")}
        >
          <p>
            Copiá <code>.env.example</code> como <code>.env</code> y completá esas variables.
            Después reiniciá el servidor de desarrollo: Astro lee el entorno al arrancar.
          </p>
        </Aviso>
      </div>
    );
  }

  if (!sesion) return <LoginView />;

  const productoEnEdicion =
    editando && editando !== "nuevo"
      ? datos.borrador.find((p) => p.id === editando) ?? null
      : null;

  // El editor ocupa la pantalla entera: tiene su propia barra superior con las
  // acciones de guardar y descartar, y meterlo dentro del shell dejaría dos barras
  // compitiendo.
  if (editando !== null) {
    return (
      <ProductEditor
        producto={productoEnEdicion}
        categorias={datos.categorias}
        productosExistentes={datos.borrador}
        onCerrar={() => setEditando(null)}
        onGuardado={() => {
          setEditando(null);
          void datos.recargar();
        }}
      />
    );
  }

  const encabezado: Record<Vista, { titulo: string; subtitulo: string }> = {
    productos: { titulo: "Productos", subtitulo: "PRODUCTS_DRAFT" },
    categorias: { titulo: "Categorías", subtitulo: "CATEGORIES · SE PUBLICAN AL INSTANTE" },
    publicar: { titulo: "Publicar", subtitulo: "RPC · PUBLISH_CATALOG" },
  };

  return (
    <AdminShell
      vista={vista}
      onVista={setVista}
      sesion={sesion}
      conteoProductos={datos.borrador.length}
      conteoCategorias={datos.categorias.length}
      cambiosPendientes={cambiosPendientes}
      titulo={encabezado[vista].titulo}
      subtitulo={encabezado[vista].subtitulo}
      acciones={
        vista !== "publicar" && cambiosPendientes > 0 ? (
          <Boton onClick={() => setVista("publicar")} variante="primario">
            PUBLICAR
          </Boton>
        ) : undefined
      }
    >
      <ErrorAviso error={datos.error} />

      {vista === "productos" && (
        <ProductsView
          borrador={datos.borrador}
          publicado={datos.publicado}
          categorias={datos.categorias}
          cargando={datos.cargando}
          onEditar={setEditando}
          onNuevo={() => setEditando("nuevo")}
          onCambio={() => void datos.recargar()}
        />
      )}

      {vista === "categorias" && (
        <CategoriesView
          categorias={datos.categorias}
          conteoPorCategoria={datos.conteoPorCategoria}
          cargando={datos.cargando}
          onCambio={() => void datos.recargar()}
        />
      )}

      {vista === "publicar" && (
        <PublishView
          borrador={datos.borrador}
          publicado={datos.publicado}
          categorias={datos.categorias}
          onPublicado={() => void datos.recargar()}
        />
      )}
    </AdminShell>
  );
}
