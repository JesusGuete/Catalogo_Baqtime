import { useEffect, useState } from "react";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  type OrderNotificationType,
  type OrderStatus,
  type OrderWithDetail,
} from "../../../types/database";
import * as pedidosRepo from "../../../lib/admin/orders.repo";
import { useAccion } from "../../../lib/admin/useAdminData";
import { AdminError, comoAdminError } from "../../../lib/supabase/errors";
import { TRANSPORTADORA_POR_DEFECTO } from "../../../lib/tracking";
import { correoValido, normalizarCorreo } from "../../../lib/shipping-validation.js";
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

const AVISO_ETIQUETA: Record<OrderNotificationType, string> = {
  aprobado: "Pago confirmado",
  enviado: "Enviado",
  entregado: "Entregado",
};

/** De los siete estados, solo tres le avisan al cliente. Los demás son del taller. */
function tipoDeAviso(estado: OrderStatus): OrderNotificationType | null {
  return estado === "aprobado" || estado === "enviado" || estado === "entregado" ? estado : null;
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

  // El correo se edita aparte de la logística: corregirlo tiene sentido solo para
  // reenviarlo, así que vive junto a su botón y se guarda con él.
  const [correo, setCorreo] = useState("");
  const [correoEnviado, setCorreoEnviado] = useState(false);

  // "Avisar al cliente por correo" al cambiar el estado. Marcada de entrada: lo normal es
  // avisar, y desmarcarla sirve para corregir un estado mal puesto sin escribirle al cliente.
  const [avisar, setAvisar] = useState(true);

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
        setCorreo(p.customer_email ?? "");
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

  // Avisar va DESPUÉS del cambio de estado y por separado: el pedido ya avanzó, y si el correo
  // falla no hay nada que deshacer. El mensaje lo deja claro; la tarjeta "Correo al cliente"
  // muestra el motivo y permite reintentar.
  async function avisarCliente(tipo: OrderNotificationType) {
    try {
      await pedidosRepo.notificarEstado(pedidoId, tipo);
    } catch (e) {
      const err = comoAdminError(e);
      throw new AdminError(`El estado cambió, pero no se pudo avisar al cliente: ${err.message}`, {
        code: err.code,
        status: err.status,
        detalle: err.detalle,
        causa: err,
      });
    }
  }

  const datosLogistica = () => ({
    carrier: transportadora.trim() || null,
    tracking_number: guia.trim() || null,
    // Un campo de fecha vacío es null, no "": la base espera un `date` o nada.
    estimated_date: fechaEstimada || null,
    payment_note: notaPago.trim() || null,
  });

  // ¿Hay algo escrito en los campos de envío que todavía no está en la base?
  const logisticaSinGuardar =
    pedido !== null &&
    (datosLogistica().carrier !== pedido.carrier ||
      datosLogistica().tracking_number !== pedido.tracking_number ||
      datosLogistica().estimated_date !== pedido.estimated_date);

  const confirmar = useAccion(async (nota: string) => {
    await pedidosRepo.confirmarPago(pedidoId, nota || undefined);
    try {
      if (avisar && pedido?.customer_email) await avisarCliente("aprobado");
    } finally {
      await cargar();
    }
  });

  const cambiar = useAccion(async (estado: OrderStatus) => {
    const tipo = avisar && pedido?.customer_email ? tipoDeAviso(estado) : null;
    // El correo de "enviado" lee transportadora y guía de la BASE, no de lo que hay escrito en
    // pantalla. Si quedaron sin guardar se guardan primero, o el correo saldría sin ellos.
    if (tipo === "enviado" && logisticaSinGuardar) {
      await pedidosRepo.editarLogistica(pedidoId, datosLogistica());
    }
    await pedidosRepo.cambiarEstado(pedidoId, estado);
    try {
      if (tipo) await avisarCliente(tipo);
    } finally {
      await cargar();
    }
  });

  // Volver a mandar un aviso que ya se mandó, o reintentar uno que falló.
  const reavisar = useAccion(async (tipo: OrderNotificationType) => {
    try {
      await pedidosRepo.notificarEstado(pedidoId, tipo);
    } finally {
      // También si falló: el servidor anotó el motivo y la tarjeta tiene que mostrarlo.
      await cargar();
    }
  });

  const eliminar = useAccion(async () => {
    await pedidosRepo.eliminar(pedidoId);
    onEliminado();
  });

  const guardarLogistica = useAccion(async () => {
    await pedidosRepo.editarLogistica(pedidoId, datosLogistica());
    await cargar();
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  });

  // Si el correo cambió, primero se guarda y después se envía: así lo que queda en el
  // pedido es siempre a dónde se mandó el último correo.
  const reenviar = useAccion(async (nuevo: string) => {
    if (nuevo !== (pedido?.customer_email ?? "")) {
      await pedidosRepo.editarLogistica(pedidoId, { customer_email: nuevo });
    }
    try {
      await pedidosRepo.reenviarCorreo(pedidoId);
    } finally {
      // También si falló: el servidor anotó el motivo y la tarjeta tiene que mostrarlo.
      await cargar();
    }
    setCorreoEnviado(true);
    setTimeout(() => setCorreoEnviado(false), 2500);
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

  // Qué agrega al diálogo de confirmación lo del correo: a quién se le va a escribir, si ya se
  // le avisó antes (un segundo correo igual) y si "enviado" saldría sin guía.
  const sufijoAviso = (tipo: OrderNotificationType | null): string => {
    if (!tipo || !avisar) return "";
    if (!pedido.customer_email) {
      return "\n\nEste pedido no tiene correo: no se le podrá avisar al cliente.";
    }
    let texto = `\n\nSe le enviará un correo al cliente (${pedido.customer_email}).`;
    const previo = pedido.order_notifications?.find((a) => a.tipo === tipo && a.sent_at);
    if (previo) {
      texto += `\nOjo: ya se le avisó el ${fecha(previo.sent_at!)}; este sería un segundo correo igual.`;
    }
    if (tipo === "enviado" && !guia.trim()) {
      texto += "\nNo hay número de guía escrito: el correo saldrá sin guía.";
    }
    return texto;
  };

  // Los avisos que este pedido ya "alcanzó": se pueden mandar o reenviar desde la tarjeta.
  const avisosAlcanzados = (
    [
      pagado ? "aprobado" : null,
      pedido.shipped_at ? "enviado" : null,
      pedido.status === "entregado" ? "entregado" : null,
    ] as (OrderNotificationType | null)[]
  ).filter((t): t is OrderNotificationType => t !== null);

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
                if (
                  window.confirm(
                    `¿Confirmar que recibiste el pago de ${dinero(pedido.total)}?${sufijoAviso("aprobado")}`
                  )
                ) {
                  void confirmar.ejecutar(notaPago);
                }
              }}
              variante="primario"
              cargando={confirmar.enCurso}
            >
              Confirmar pago
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
              Marcar sin confirmar
            </Boton>
          )}
        </div>
      </div>

      <ErrorAviso
        error={
          error ??
          confirmar.error ??
          cambiar.error ??
          guardarLogistica.error ??
          reenviar.error ??
          reavisar.error ??
          eliminar.error
        }
      />

      <div className="adm-editor-cols">
        <div className="adm-editor-form">
          <section className="adm-card">
            <SectionHead numero="01" titulo="Cliente y envío" />
            <div className="adm-ped-datos">
              <Dato etiqueta="NOMBRE" valor={pedido.customer_name} />
              <Dato etiqueta="TELÉFONO" valor={pedido.customer_phone} mono />
              <Dato etiqueta="CORREO" valor={pedido.customer_email ?? "—"} ancho />
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
                      `¿Pasar el pedido a "${ORDER_STATUS_LABEL[v]}"? El cliente lo ve al instante en su enlace.${sufijoAviso(tipoDeAviso(v))}`
                    )
                  ) {
                    void cambiar.ejecutar(v);
                  }
                }}
                opciones={ORDER_STATUSES.map((e) => ({ value: e, label: ORDER_STATUS_LABEL[e] }))}
                disabled={cambiar.enCurso}
              />
            </Campo>
            <label className="adm-casilla">
              <input
                type="checkbox"
                checked={avisar}
                onChange={(e) => setAvisar(e.target.checked)}
                disabled={cambiar.enCurso || confirmar.enCurso}
              />
              <span>
                Avisar al cliente por correo
                <span className="adm-mono adm-hint">
                  AL CONFIRMAR EL PAGO, AL ENVIAR Y AL ENTREGAR
                </span>
              </span>
            </label>
            {pedido.status === "no_confirmado" && (
              <Aviso
                tono="borrador"
                titulo="Este pedido figura como no confirmado."
                meta="CONFIRMAR EL PAGO LO DEVUELVE A APROBADO"
              >
                <p>
                  Se marca así a mano, o solo cuando pasan 24 horas sin pago. Si el cliente
                  pagó igual, confirma el pago y vuelve a quedar activo.
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
              {guardado ? "Guardado ✓" : "Guardar datos de envío"}
            </Boton>
            {pedido.estimated_date && (
              <p className="adm-mono adm-hint">
                ENTREGA ESTIMADA · {fechaSola(pedido.estimated_date).toUpperCase()}
              </p>
            )}
          </section>

          <section className="adm-card">
            <p className="adm-mono adm-regla-grupo">CORREO AL CLIENTE</p>
            {/* El error va primero aunque haya una fecha de envío: es lo ÚLTIMO que pasó
                (ver registrar_correo_pedido en 019_correo_cliente.sql). */}
            {pedido.email_error ? (
              <Aviso
                tono="error"
                titulo="El último correo no se envió."
                meta={pedido.email_error.toUpperCase()}
              />
            ) : pedido.email_sent_at ? (
              <Aviso
                tono="exito"
                titulo="Resumen del pedido enviado."
                meta={fecha(pedido.email_sent_at).toUpperCase()}
              />
            ) : (
              <Aviso
                tono="info"
                titulo={
                  pedido.customer_email
                    ? "Todavía no hay registro de envío."
                    : "Este pedido no tiene correo."
                }
                meta={pedido.customer_email ? undefined : "ES ANTERIOR AL CAMPO DE CORREO"}
              />
            )}
            <Campo
              etiqueta="CORREO"
              ayuda="corrígelo aquí si el cliente lo escribió mal"
              error={correo && !correoValido(correo) ? "No parece un correo válido." : undefined}
            >
              <Texto
                value={correo}
                onChange={(v) => setCorreo(v.replace(/\s/g, ""))}
                invalido={Boolean(correo) && !correoValido(correo)}
                mono
              />
            </Campo>
            <Boton
              onClick={() => {
                const nuevo = normalizarCorreo(correo);
                if (!correoValido(nuevo)) return;
                if (window.confirm(`¿Enviar el resumen del pedido a ${nuevo}?`)) {
                  void reenviar.ejecutar(nuevo);
                }
              }}
              variante="primario"
              ancho
              cargando={reenviar.enCurso}
              disabled={!correoValido(correo)}
            >
              {correoEnviado
                ? "Enviado ✓"
                : pedido.email_sent_at || pedido.email_error
                  ? "Reenviar correo"
                  : "Enviar correo"}
            </Boton>

            {avisosAlcanzados.length > 0 && (
              <div className="adm-avisos">
                <p className="adm-mono adm-campo-label">AVISOS DE ESTADO</p>
                {avisosAlcanzados.map((tipo) => {
                  const a = pedido.order_notifications?.find((x) => x.tipo === tipo);
                  return (
                    <div className="adm-aviso-fila" key={tipo}>
                      <span className="adm-aviso-txt">
                        <span>{AVISO_ETIQUETA[tipo]}</span>
                        <span className="adm-mono adm-hint">
                          {a?.error
                            ? `NO SE ENVIÓ · ${a.error.toUpperCase()}`
                            : a?.sent_at
                              ? `ENVIADO ${fecha(a.sent_at).toUpperCase()}`
                              : "TODAVÍA SIN AVISAR"}
                        </span>
                      </span>
                      <Boton
                        onClick={() => {
                          if (
                            window.confirm(
                              `¿Enviar el aviso "${AVISO_ETIQUETA[tipo]}" a ${pedido.customer_email}?${
                                tipo === "enviado" && !pedido.tracking_number
                                  ? "\n\nNo hay número de guía guardado: el correo saldrá sin guía."
                                  : ""
                              }`
                            )
                          ) {
                            void reavisar.ejecutar(tipo);
                          }
                        }}
                        disabled={!pedido.customer_email || reavisar.enCurso}
                      >
                        {a?.sent_at ? "Reenviar" : "Enviar"}
                      </Boton>
                    </div>
                  );
                })}
              </div>
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
            <p className="adm-hint">No lo publiques: quien lo tenga puede ver este pedido.</p>
          </section>

          <section className="adm-card">
            <p className="adm-peligro-titulo">Eliminar pedido</p>
            <p className="adm-nota">
              Borra el pedido, sus productos y su historial. No se puede deshacer y
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
              Eliminar pedido
            </Boton>
            {pagado && (
              <p className="adm-hint">
                Este pedido ya tiene el pago confirmado: borrarlo elimina la constancia de la
                venta.
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
