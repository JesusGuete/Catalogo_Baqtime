import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  type Order,
  type OrderStatus,
} from "../../../types/database";
import * as pedidosRepo from "../../../lib/admin/orders.repo";
import {
  Cargando,
  ErrorAviso,
  IconoPapelera,
  Punto,
  Vacio,
  dinero,
  type EstadoPunto,
} from "./ui";
import { comoAdminError, type AdminError } from "../../../lib/supabase/errors";

// Lista de pedidos.
//
// Reusa .adm-tabla y las clases adm-td-*, así que en el celular sale como tarjetas sin
// una línea de CSS nueva — eso ya lo resolvió la Entrega 3 del plan móvil para productos
// y categorías.

interface Props {
  onAbrir: (id: string) => void;
  /** Sube el conteo de pendientes al shell, para el punto del menú lateral. */
  onConteo?: (pendientes: number) => void;
}

/**
 * El color del punto dice qué reclama atención, no qué etapa es.
 *   borrador (mocha) = hay algo que hacer
 *   vivo (olive)     = está en marcha o terminado
 *   inactivo (gris)  = se cayó
 */
const PUNTO_POR_ESTADO: Record<OrderStatus, EstadoPunto> = {
  pendiente_pago: "borrador",
  aprobado: "vivo",
  en_produccion: "vivo",
  listo_para_envio: "vivo",
  enviado: "vivo",
  entregado: "vivo",
  no_confirmado: "inactivo",
};

export default function OrdersView({ onAbrir, onConteo }: Props) {
  const [pedidos, setPedidos] = useState<Order[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<AdminError | null>(null);
  const [filtro, setFiltro] = useState<OrderStatus | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async (vencer = true) => {
    setCargando(true);
    setError(null);
    try {
      // Antes de listar, vencer lo que el reloj ya venció. Si pg_cron no está activo, esta
      // llamada es lo único que marca los pedidos sin pagar — y si está, no hace nada
      // porque el barrido ya pasó. Un fallo acá no puede impedir ver la lista: por eso va
      // en su propio try y solo se registra.
      if (vencer) {
        try {
          await pedidosRepo.vencerPendientes();
        } catch (e) {
          console.warn("[pedidos] no se pudo vencer los pendientes:", e);
        }
      }
      setPedidos(await pedidosRepo.listar());
    } catch (e) {
      setError(comoAdminError(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Borrar desde la lista, sin abrir el pedido. Recarga después: quitar la fila a mano
  // dejaría los contadores de los filtros contando algo que ya no está.
  const [borrando, setBorrando] = useState<string | null>(null);
  async function eliminar(p: Order) {
    if (borrando) return;
    if (
      !window.confirm(
        `¿Eliminar el pedido ${p.order_number} de ${p.customer_name}, por ${dinero(p.total)}?\n\n` +
          `Se borra junto con sus productos y su historial, y no se puede recuperar.`
      )
    ) {
      return;
    }
    setBorrando(p.id);
    try {
      await pedidosRepo.eliminar(p.id);
      await cargar(false);
    } catch (e) {
      setError(comoAdminError(e));
    } finally {
      setBorrando(null);
    }
  }

  const pendientes = useMemo(
    () => pedidos.filter((p) => p.status === "pendiente_pago").length,
    [pedidos]
  );

  useEffect(() => {
    onConteo?.(pendientes);
  }, [pendientes, onConteo]);

  const conteoPorEstado = useMemo(() => {
    const c: Partial<Record<OrderStatus, number>> = {};
    for (const p of pedidos) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [pedidos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (filtro && p.status !== filtro) return false;
      if (!q) return true;
      return (
        p.order_number.toLowerCase().includes(q) ||
        p.customer_name.toLowerCase().includes(q) ||
        p.customer_phone.includes(q) ||
        p.ship_city.toLowerCase().includes(q) ||
        (p.tracking_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [pedidos, filtro, busqueda]);

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

  if (cargando && !pedidos.length) return <Cargando />;

  return (
    <>
      <div className="adm-toolbar">
        <input
          type="search"
          className="adm-input adm-buscar"
          placeholder="Buscar por número, cliente, teléfono o guía"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <div className="adm-chips" role="group" aria-label="Filtrar por estado">
          <button
            type="button"
            className={`adm-mono adm-chip ${filtro === null ? "is-activo" : ""}`}
            onClick={() => setFiltro(null)}
          >
            TODOS {pedidos.length}
          </button>
          {ORDER_STATUSES.map((e) => (
            <button
              key={e}
              type="button"
              className={`adm-mono adm-chip ${filtro === e ? "is-activo" : ""}`}
              onClick={() => setFiltro(e)}
            >
              {ORDER_STATUS_LABEL[e].toUpperCase()} {conteoPorEstado[e] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <ErrorAviso error={error} />

      {!pedidos.length ? (
        <Vacio titulo="Todavía no hay pedidos.">
          <p>
            Cuando alguien complete una compra en la tienda, el pedido aparece acá al
            instante — antes incluso de que te escriba por WhatsApp.
          </p>
        </Vacio>
      ) : !visibles.length ? (
        <Vacio titulo="Ningún pedido coincide con el filtro." />
      ) : (
        <>
          <div className="adm-tabla-wrap">
            {/* --pedidos: en móvil la tarjeta se arma distinto que la de productos, que
                tiene foto y agarre de arrastre. Ver admin.css. */}
            <table className="adm-tabla adm-tabla--pedidos" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th className="adm-mono" scope="col" role="columnheader">PEDIDO</th>
                  <th className="adm-mono" scope="col" role="columnheader">CLIENTE</th>
                  <th className="adm-mono" scope="col" role="columnheader">DESTINO</th>
                  <th className="adm-mono adm-num" scope="col" role="columnheader">TOTAL</th>
                  <th className="adm-mono" scope="col" role="columnheader">ESTADO</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {visibles.map((p) => (
                  <tr
                    key={p.id}
                    role="row"
                    className={`adm-fila ${p.status === "pendiente_pago" ? "is-pendiente" : ""} ${
                      p.status === "no_confirmado" ? "is-inactivo" : ""
                    }`}
                    onClick={() => onAbrir(p.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onAbrir(p.id);
                      }
                    }}
                  >
                    <td className="adm-td-pedido" role="cell">
                      <span className="adm-mono adm-fila-nombre">{p.order_number}</span>
                      <span className="adm-mono adm-fila-meta">
                        {fecha(p.created_at).toUpperCase()}
                        {p.paid_at ? " · PAGADO" : ""}
                      </span>
                    </td>
                    <td className="adm-td-cliente" role="cell">
                      {p.customer_name}
                      <span className="adm-mono adm-fila-meta"> {p.customer_phone}</span>
                    </td>
                    <td className="adm-td-destino" role="cell">
                      {p.ship_city}
                      {p.tracking_number && (
                        <span className="adm-mono adm-fila-meta"> GUÍA {p.tracking_number}</span>
                      )}
                    </td>
                    <td className="adm-mono adm-num adm-td-precio" role="cell">
                      {dinero(p.total)}
                    </td>
                    <td className="adm-td-estado" role="cell">
                      <span className="adm-ped-estado-celda">
                        <Punto
                          estado={PUNTO_POR_ESTADO[p.status]}
                          texto={ORDER_STATUS_LABEL[p.status].toUpperCase()}
                        />
                        {/* stopPropagation: la fila entera abre el pedido. Sin esto, un
                            clic en la papelera abriría el detalle además de preguntar. */}
                        <button
                          type="button"
                          className="adm-ped-borrar"
                          title={`Eliminar el pedido ${p.order_number}`}
                          aria-label={`Eliminar el pedido ${p.order_number}`}
                          disabled={borrando === p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void eliminar(p);
                          }}
                        >
                          <IconoPapelera />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="adm-mono adm-tabla-pie">
            MOSTRANDO {visibles.length} DE {pedidos.length} · MÁS NUEVOS PRIMERO
          </p>
        </>
      )}
    </>
  );
}
