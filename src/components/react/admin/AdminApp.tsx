import { useEffect, useMemo, useState } from "react";
import { useSession, useAdminData, useAccion } from "../../../lib/admin/useAdminData";
import { configuracionFaltante } from "../../../lib/supabase/config";
import { calcularDiff } from "../../../lib/admin/diff";
import { descartarCambios } from "../../../lib/admin/revertir";
import LoginView from "./LoginView";
import AdminShell, { type Vista } from "./AdminShell";
import ProductsView from "./ProductsView";
import ProductEditor from "./ProductEditor";
import CategoriesView from "./CategoriesView";
import ColorsView from "./ColorsView";
import PublishView from "./PublishView";
import OrdersView from "./OrdersView";
import OrderDetail from "./OrderDetail";
import { Aviso, Boton, ErrorAviso } from "./ui";

// Raíz del panel. Decide qué se ve y nada más: no hace fetch propio ni conoce las
// tablas. Los datos vienen de useAdminData y las escrituras las hacen las vistas.

/** `null` = ninguno abierto. `"nuevo"` = el editor en blanco. */
type EdicionActiva = string | "nuevo" | null;

interface EstadoNav {
  vista: Vista;
  editando: EdicionActiva;
  /** Id del pedido abierto a pantalla completa, o `null`. */
  pedido?: string | null;
}

export default function AdminApp() {
  const sesion = useSession();
  const [vista, setVista] = useState<Vista>("productos");
  const [editando, setEditando] = useState<EdicionActiva>(null);
  const [pedidoAbierto, setPedidoAbierto] = useState<string | null>(null);
  const [pedidosPendientes, setPedidosPendientes] = useState(0);

  // Sin esto, el navegador no tiene ninguna entrada de historial propia del
  // panel: /admin es una sola entrada sin importar cuánto se navegue adentro,
  // y el primer "atrás" (físico, del navegador o el gesto del celular) saca
  // de golpe de toda la app. Cada pantalla visible pasa a ser una entrada:
  // "atrás" retrocede un paso adentro del panel antes de llegar a salir.
  useEffect(() => {
    history.replaceState(
      { vista: "productos", editando: null, pedido: null } satisfies EstadoNav,
      ""
    );
  }, []);

  useEffect(() => {
    // El historial ya se movió solo cuando llega este evento — acá solo hay
    // que reflejarlo en React, sin volver a empujar (si no, se duplica).
    function alPop(e: PopStateEvent) {
      const s = (e.state ?? { vista: "productos", editando: null, pedido: null }) as EstadoNav;
      setVista(s.vista);
      setEditando(s.editando);
      setPedidoAbierto(s.pedido ?? null);
    }
    window.addEventListener("popstate", alPop);
    return () => window.removeEventListener("popstate", alPop);
  }, []);

  // Toda navegación iniciada desde la UI (nav del sidebar, abrir/cerrar el
  // editor, abrir/cerrar un pedido) pasa por acá: actualiza React Y empuja el
  // historial.
  function navegar(siguiente: EstadoNav) {
    setVista(siguiente.vista);
    setEditando(siguiente.editando);
    setPedidoAbierto(siguiente.pedido ?? null);
    history.pushState(siguiente, "");
  }

  const [busquedaProductos, setBusquedaProductos] = useState("");
  const [categoriaProductos, setCategoriaProductos] = useState<string | null>(null);

  const datos = useAdminData(sesion !== null);

  const cambiosPendientes = useMemo(
    () => calcularDiff(datos.borrador, datos.publicado).cambios.length,
    [datos.borrador, datos.publicado]
  );

  // "Deshacer cambios" (borrador de productos, ver revertir.ts). Categorías queda
  // afuera por ahora: se guardan directo, sin borrador, así que no aplica.
  const descartar = useAccion(async () => {
    await descartarCambios(datos.borrador, datos.publicado);
    await datos.recargar();
  });

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
            Copia <code>.env.example</code> como <code>.env</code> y completa esas variables.
            Después reinicia el servidor de desarrollo: Astro lee el entorno al arrancar.
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
        onCerrar={() => navegar({ vista, editando: null })}
        onGuardado={() => {
          navegar({ vista, editando: null });
          void datos.recargar();
        }}
      />
    );
  }

  // Mismo criterio que el editor de productos: pantalla completa y barra propia.
  if (pedidoAbierto !== null) {
    return (
      <OrderDetail
        pedidoId={pedidoAbierto}
        onCerrar={() => navegar({ vista: "pedidos", editando: null, pedido: null })}
        // Volver a la lista después de borrar: el pedido que se estaba viendo ya no
        // existe, y quedarse en su pantalla mostraría datos de algo que no está.
        onEliminado={() => navegar({ vista: "pedidos", editando: null, pedido: null })}
      />
    );
  }

  // En el mismo orden que el menú lateral, para que se lean juntos.
  const encabezado: Record<Vista, { titulo: string; subtitulo: string }> = {
    productos: { titulo: "Productos", subtitulo: "PRODUCTS_DRAFT" },
    categorias: { titulo: "Categorías", subtitulo: "CATEGORIES · SE PUBLICAN AL INSTANTE" },
    colores: {
      titulo: "Colores de bordado",
      subtitulo: "INITIALS_COLORS · SE PUBLICAN AL INSTANTE",
    },
    pedidos: { titulo: "Pedidos", subtitulo: "ORDERS · SE GUARDAN AL INSTANTE" },
    publicar: { titulo: "Publicar", subtitulo: "RPC · PUBLISH_CATALOG" },
  };

  return (
    <AdminShell
      vista={vista}
      onVista={(v) => navegar({ vista: v, editando: null })}
      sesion={sesion}
      conteoProductos={datos.borrador.length}
      conteoCategorias={datos.categorias.length}
      conteoColores={datos.colores.length}
      pedidosPendientes={pedidosPendientes}
      cambiosPendientes={cambiosPendientes}
      titulo={encabezado[vista].titulo}
      subtitulo={encabezado[vista].subtitulo}
      acciones={
        // Los pedidos no pasan por el borrador, así que en esa pantalla estos dos
        // botones no aplican y solo agregarían ruido.
        vista !== "publicar" && vista !== "pedidos" && cambiosPendientes > 0 ? (
          <>
            <Boton
              onClick={() => {
                if (
                  window.confirm(
                    `¿Deshacer ${cambiosPendientes === 1 ? "el cambio" : `los ${cambiosPendientes} cambios`} sin publicar? El borrador de productos vuelve a quedar igual a lo publicado ahora mismo.`
                  )
                ) {
                  void descartar.ejecutar();
                }
              }}
              variante="peligro"
              cargando={descartar.enCurso}
            >
              DESHACER CAMBIOS
            </Boton>
            <Boton
              onClick={() => navegar({ vista: "publicar", editando: null, pedido: null })}
              variante="primario"
            >
              PUBLICAR
            </Boton>
          </>
        ) : undefined
      }
    >
      <ErrorAviso error={datos.error ?? descartar.error} />

      {vista === "pedidos" && (
        <OrdersView
          onAbrir={(id) => navegar({ vista: "pedidos", editando: null, pedido: id })}
          onConteo={setPedidosPendientes}
        />
      )}

      {vista === "productos" && (
        <ProductsView
          borrador={datos.borrador}
          publicado={datos.publicado}
          categorias={datos.categorias}
          cargando={datos.cargando}
          busqueda={busquedaProductos}
          onBusqueda={setBusquedaProductos}
          categoria={categoriaProductos}
          onCategoria={setCategoriaProductos}
          onEditar={(id) => navegar({ vista, editando: id })}
          onNuevo={() => navegar({ vista, editando: "nuevo" })}
          onCambio={() => void datos.recargar()}
        />
      )}

      {vista === "categorias" && (
        <CategoriesView
          categorias={datos.categorias}
          colores={datos.colores}
          conteoPorCategoria={datos.conteoPorCategoria}
          cargando={datos.cargando}
          onCambio={() => void datos.recargar()}
        />
      )}

      {vista === "colores" && (
        <ColorsView
          colores={datos.colores}
          categorias={datos.categorias}
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
          onCambio={() => void datos.recargar()}
        />
      )}
    </AdminShell>
  );
}
