import { useEffect, useState } from "react";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  type OrderStatus,
  type OrderWithDetail,
} from "../../../types/database";
import * as pedidosRepo from "../../../lib/admin/orders.repo";
import { useAccion } from "../../../lib/admin/useAdminData";
import { comoAdminError, type AdminError } from "../../../lib/supabase/errors";
import { TRANSPORTADORA_POR_DEFECTO } from "../../../lib/tracking";
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  ErrorAviso,
  SectionHead,
  Selector,
  Texto,
  dinero,
} from "./ui";

// Detalle de un pedido. Ocupa la pantalla entera, como ProductEditor: tiene su propia
// barra con las acciones, y meterlo dentro del shell dejaría dos barras compitiendo.

interface Props {
  pedidoId: string;
  onCerrar: () => void;
  /** Después de borrar hay que volver a la lista: este pedido ya no existe. */
  onEliminado: () => void;
}

export default function OrderDetail({ pedidoId, onCerrar, onEliminado }: Props) {
  const [pedido, setPedido] = useState<OrderWithDetail | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<AdminError | null>(null);

  // Campos de logística. Se editan localmente y se guardan con un botón, no en cada
  // tecla: escribir una guía de 12 dígitos serían 12 peticiones.
  const [transportadora, setTransportadora] = useState("");
  const [guia, setGuia] = useState("");
  const [fechaEstimada, setFechaEstimada] = useState("");
  const [notaPago, setNotaPago] = useState("");
  const [guardado, setGuardado] = useState(false);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const p = await pedidosRepo.obtener(pedidoId);
      setPedido(p);
      if (p) {
        setTransportadora(p.carrier ?? "");
        setGuia(p.tracking_number ?? "");
        setFechaEstimada(p.estimated_date ?? "");
        setNotaPago(p.payment_note ?? "");
      }
    } catch (e) {
      setError(comoAdminError(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  const confirmar = useAccion(async (nota: string) => {
    await pedidosRepo.confirmarPago(pedidoId, nota || undefined);
    await cargar();
  });

  const cambiar = useAccion(async (estado: OrderStatus) => {
    await pedidosRepo.cambiarEstado(pedidoId, estado);
    await cargar();
  });

  const eliminar = useAccion(async () => {
    await pedidosRepo.eliminar(pedidoId);
    onEliminado();
  });

  const guardarLogistica = useAccion(async () => {
    await pedidosRepo.editarLogistica(pedidoId, {
      carrier: transportadora.trim() || null,
      tracking_number: guia.trim() || null,
      // Un campo de fecha vacío es null, no "": la base espera un `date` o nada.
      estimated_date: fechaEstimada || null,
      payment_note: notaPago.trim() || null,
    });
    await cargar();
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  });

  if (cargando && !pedido) return <Cargando />;

  if (!pedido) {
    return (
      <div className="adm-editor">
        <div className="adm-editor-barra">
          <button type="button" className="adm-mono adm-volver" onClick={onCerrar}>
            ← PEDIDOS
          </button>
        </div>
        <div className="adm-editor-cols">
          <ErrorAviso error={error} />
          <Aviso tono="error" titulo="No se encontró ese pedido." />
        </div>
      </div>
    );
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  // `estimated_date` es un `date` sin hora: pasarlo por new Date() lo lee como medianoche
  // UTC y en Colombia (UTC-5) muestra el día anterior.
  const fechaSola = (f: string) =>
    new Date(`${f}T00:00:00`).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  const enlaceCliente = `${window.location.origin}/pedido/${pedido.public_token}`;
  const pagado = pedido.paid_at !== null;

  return (
    <div className="adm-editor">
      <div className="adm-editor-barra">
        <button type="button" className="adm-mono adm-volver" onClick={onCerrar}>
          ← PEDIDOS
        </button>
        <span className="adm-editor-sep" />
        <div className="adm-editor-titulo">
          <h2 className="adm-h2 adm-mono">{pedido.order_number}</h2>
          <p className="adm-mono adm-editor-sub">
            {ORDER_STATUS_LABEL[pedido.status].toUpperCase()} ·{" "}
            {pagado ? `PAGADO ${fecha(pedido.paid_at!)}` : "SIN PAGO CONFIRMADO"}
          </p>
        </div>
        <div className="adm-editor-acciones">
          {!pagado && (
            <Boton
              onClick={() => {
                if (window.confirm(`¿Confirmar que recibiste el pago de ${dinero(pedido.total)}?`)) {
                  void confirmar.ejecutar(notaPago);
                }
              }}
              variante="primario"
              cargando={confirmar.enCurso}
            >
              CONFIRMAR PAGO
            </Boton>
          )}
          {pedido.status !== "no_confirmado" && !pagado && (
            <Boton
              onClick={() => {
                if (
                  window.confirm(
                    "¿Marcar este pedido como NO confirmado? El cliente lo verá así en su enlace. Se puede revertir confirmando el pago."
                  )
                ) {
                  void cambiar.ejecutar("no_confirmado");
                }
              }}
              variante="peligro"
              cargando={cambiar.enCurso}
            >
              NO CONFIRMADO
            </Boton>
          )}
        </div>
      </div>

      <ErrorAviso
        error={
          error ?? confirmar.error ?? cambiar.error ?? guardarLogistica.error ?? eliminar.error
        }
      />

      <div className="adm-editor-cols">
        <div className="adm-editor-form">
          <section className="adm-card">
            <SectionHead numero="01" titulo="Cliente y envío" />
            <div className="adm-ped-datos">
              <Dato etiqueta="NOMBRE" valor={pedido.customer_name} />
              <Dato etiqueta="TELÉFONO" valor={pedido.customer_phone} mono />
              <Dato etiqueta="DOCUMENTO" valor={pedido.customer_doc ?? "—"} mono />
              <Dato etiqueta="CIUDAD" valor={pedido.ship_city} />
              <Dato etiqueta="DIRECCIÓN" valor={pedido.ship_address} ancho />
            </div>
          </section>

          <section className="adm-card">
            <SectionHead numero="02" titulo="Productos" />
            <ul className="adm-ped-items">
              {(pedido.order_items ?? []).map((it) => (
                <li key={it.id} className="adm-ped-item">
                  <span className="adm-ped-item-txt">
                    <span className="adm-fila-nombre">{it.product_name}</span>
                    <span className="adm-mono adm-fila-meta">
                      {[
                        it.category_label,
                        it.color,
                        it.variant,
                        it.initials ? `INICIALES ${it.initials}` : null,
                        it.initials_color,
                        it.extra_price > 0 ? `RECARGO ${dinero(it.extra_price)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="adm-mono adm-ped-item-precio">{dinero(it.line_total)}</span>
                </li>
              ))}
            </ul>

            <div className="adm-ped-totales">
              <div className="adm-ped-total-fila">
                <span>Subtotal</span>
                <span className="adm-mono">{dinero(pedido.subtotal)}</span>
              </div>
              <div className="adm-ped-total-fila">
                <span>Envío</span>
                <span className="adm-mono">{dinero(pedido.shipping_cost)}</span>
              </div>
              <div className="adm-ped-total-fila is-final">
                <span>Total</span>
                <span className="adm-mono">{dinero(pedido.total)}</span>
              </div>
            </div>
          </section>

          <section className="adm-card">
            <SectionHead numero="03" titulo="Historial" />
            <ul className="adm-historial">
              {(pedido.order_status_history ?? []).map((h) => (
                <li key={h.id} className="adm-historial-item">
                  <span className="adm-punto-dot is-vivo" />
                  <span className="adm-historial-txt">
                    <span className="adm-historial-fecha">{ORDER_STATUS_LABEL[h.status]}</span>
                    <span className="adm-mono adm-historial-meta">
                      {fecha(h.created_at).toUpperCase()}
                      {h.note ? ` · ${h.note.toUpperCase()}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="adm-editor-fotos">
          <section className="adm-card">
            <p className="adm-mono adm-regla-grupo">ESTADO DEL PEDIDO</p>
            <Campo etiqueta="CAMBIAR ESTADO" ayuda="queda registrado en el historial">
              <Selector
                value={pedido.status}
                onChange={(v) => {
                  if (v === pedido.status) return;
                  if (
                    window.confirm(
                      `¿Pasar el pedido a "${ORDER_STATUS_LABEL[v]}"? El cliente lo ve al instante en su enlace.`
                    )
                  ) {
                    void cambiar.ejecutar(v);
                  }
                }}
                opciones={ORDER_STATUSES.map((e) => ({ value: e, label: ORDER_STATUS_LABEL[e] }))}
                disabled={cambiar.enCurso}
              />
            </Campo>
            {pedido.status === "no_confirmado" && (
              <Aviso
                tono="borrador"
                titulo="Este pedido figura como no confirmado."
                meta="CONFIRMAR EL PAGO LO DEVUELVE A APROBADO"
              >
                <p>
                  Se marca así a mano, o solo cuando pasan 24 horas sin pago. Si el cliente
                  pagó igual, confirmá el pago y vuelve a quedar activo.
                </p>
              </Aviso>
            )}
          </section>

          <section className="adm-card">
            <p className="adm-mono adm-regla-grupo">ENVÍO</p>
            <Campo etiqueta="TRANSPORTADORA">
              <Texto
                value={transportadora}
                onChange={setTransportadora}
                placeholder={TRANSPORTADORA_POR_DEFECTO}
              />
            </Campo>
            <Campo etiqueta="NÚMERO DE GUÍA" ayuda="el cliente lo ve al pasar a Enviado">
              <Texto value={guia} onChange={setGuia} mono />
            </Campo>
            <Campo etiqueta="FECHA ESTIMADA" ayuda="opcional">
              <input
                type="date"
                className="adm-input adm-mono"
                value={fechaEstimada}
                onChange={(e) => setFechaEstimada(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="NOTA DE PAGO" ayuda="interna, el cliente no la ve">
              <Texto value={notaPago} onChange={setNotaPago} />
            </Campo>
            <Boton
              onClick={() => void guardarLogistica.ejecutar()}
              variante="primario"
              ancho
              cargando={guardarLogistica.enCurso}
            >
              {guardado ? "GUARDADO ✓" : "GUARDAR DATOS DE ENVÍO"}
            </Boton>
            {pedido.estimated_date && (
              <p className="adm-mono adm-hint">
                ENTREGA ESTIMADA · {fechaSola(pedido.estimated_date).toUpperCase()}
              </p>
            )}
          </section>

          <section className="adm-card">
            <p className="adm-mono adm-regla-grupo">ENLACE DEL CLIENTE</p>
            <p className="adm-nota">
              Es el enlace privado de este pedido. Sirve para reenviárselo si lo perdió.
            </p>
            <input
              className="adm-input adm-mono"
              type="text"
              readOnly
              value={enlaceCliente}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Enlace de seguimiento del cliente"
            />
            <p className="adm-mono adm-hint">
              NO LO PUBLIQUES: QUIEN LO TENGA VE ESTE PEDIDO
            </p>
          </section>

          <section className="adm-card">
            <p className="adm-mono adm-peligro-titulo">ZONA DE RIESGO</p>
            <p className="adm-nota">
              Eliminar borra el pedido, sus productos y su historial. No se puede deshacer y
              no queda registro de la venta.
            </p>
            <Boton
              onClick={() => {
                // Dos datos en la pregunta —número y total— para que sea evidente CUÁL se
                // está por borrar. Un "¿estás seguro?" a secas se contesta que sí por reflejo.
                if (
                  window.confirm(
                    `¿Eliminar el pedido ${pedido.order_number} de ${pedido.customer_name}, por ${dinero(pedido.total)}?\n\n` +
                      `Se borra junto con sus productos y su historial, y no se puede recuperar.`
                  )
                ) {
                  void eliminar.ejecutar();
                }
              }}
              variante="peligro"
              ancho
              cargando={eliminar.enCurso}
            >
              ELIMINAR PEDIDO
            </Boton>
            {pagado && (
              <p className="adm-mono adm-hint">
                ESTE PEDIDO YA TIENE EL PAGO CONFIRMADO · BORRARLO ELIMINA LA CONSTANCIA DE
                LA VENTA
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  mono,
  ancho,
}: {
  etiqueta: string;
  valor: string;
  mono?: boolean;
  ancho?: boolean;
}) {
  return (
    <div className={`adm-ped-dato ${ancho ? "is-ancho" : ""}`}>
      <span className="adm-mono adm-campo-label">{etiqueta}</span>
      <span className={mono ? "adm-mono" : ""}>{valor}</span>
    </div>
  );
}
