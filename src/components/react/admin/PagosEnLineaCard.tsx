import { ORDER_PAYMENT_STATUS_LABEL, type OrderPayment } from "../../../types/database";
import { nombreMetodo } from "../../../lib/wompi";
import { Aviso, dinero } from "./ui";

// La tarjeta "PAGO EN LÍNEA · WOMPI" del detalle de un pedido (docs/plan-pagos-en-linea.md,
// fase 5). Solo lectura: lo anota el servidor cuando Wompi responde (027_pagos_en_linea.sql), y
// nada de esto se edita desde el panel.
//
// Lo que más importa está arriba: un cobro de más que hay que devolver, o un monto que no
// coincide. Son los dos casos en que la tienda no pudo resolver sola y la dueña tiene que actuar
// en el dashboard de Wompi; por eso cada aviso lleva la referencia, que es lo que se busca allá.

interface Props {
  pagos: OrderPayment[];
  /** El mismo formato de fecha que el resto del detalle. */
  fecha: (iso: string) => string;
}

export default function PagosEnLineaCard({ pagos, fecha }: Props) {
  // CREATED = el cliente abrió la ventana de pago y la cerró sin pagar. No son transacciones:
  // se cuentan, pero listarlas una por una sería ruido.
  const transacciones = pagos.filter((p) => p.status !== "CREATED");
  const abiertosSinPagar = pagos.length - transacciones.length;
  const conAnomalia = pagos.filter((p) => p.anomaly);

  return (
    <section className="adm-card">
      <p className="adm-mono adm-regla-grupo">PAGO EN LÍNEA · WOMPI</p>

      {conAnomalia.map((p) =>
        p.anomaly === "pago_duplicado" ? (
          <Aviso
            key={`anomalia-${p.id}`}
            tono="error"
            titulo="Cobro de más: hay que devolverlo."
            meta={`REF ${p.reference}`}
          >
            <p>
              Wompi aprobó un pago de {dinero(p.amount_in_cents / 100)}, pero el pedido ya estaba
              pagado. Haz el reembolso desde el dashboard de Wompi buscando esta referencia.
            </p>
          </Aviso>
        ) : (
          <Aviso
            key={`anomalia-${p.id}`}
            tono="error"
            titulo="Pago con un monto distinto al del pedido."
            meta={`REF ${p.reference}`}
          >
            <p>
              Wompi cobró un valor diferente al total, así que el pedido no se aprobó solo. Revisa
              la transacción en Wompi antes de confirmar el pago a mano.
            </p>
          </Aviso>
        )
      )}

      {transacciones.length > 0 && (
        <ul className="adm-historial">
          {transacciones.map((p) => {
            const metodo = nombreMetodo(p.payment_method_type);
            return (
              <li key={p.id} className="adm-historial-item">
                <span className={`adm-punto-dot ${p.status === "APPROVED" ? "is-vivo" : ""}`} />
                <span className="adm-historial-txt">
                  <span className="adm-historial-fecha">
                    {ORDER_PAYMENT_STATUS_LABEL[p.status]}
                    {metodo ? ` · ${metodo}` : ""}
                    {p.anomaly ? " · REVISAR" : ""}
                  </span>
                  <span className="adm-mono adm-historial-meta">
                    {fecha(p.updated_at).toUpperCase()} · {dinero(p.amount_in_cents / 100)}
                    {" · REF "}
                    {p.reference}
                    {p.provider_tx_id ? ` · TX ${p.provider_tx_id}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {abiertosSinPagar > 0 && (
        <p className="adm-mono adm-hint">
          {abiertosSinPagar === 1
            ? "ABRIÓ LA VENTANA DE PAGO 1 VEZ SIN PAGAR"
            : `ABRIÓ LA VENTANA DE PAGO ${abiertosSinPagar} VECES SIN PAGAR`}
        </p>
      )}
      <p className="adm-mono adm-hint">
        LA REFERENCIA SE BUSCA EN EL DASHBOARD DE WOMPI · ESTO LO ANOTA WOMPI, NO SE EDITA
      </p>
    </section>
  );
}
