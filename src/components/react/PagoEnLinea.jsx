import { useEffect, useRef, useState } from "react";
import { fmt } from "../../lib/pricing.js";
import {
  datosNavegador,
  formatearNumero,
  formatearVencimiento,
  franquicia,
  soloDigitos,
  tokenizarTarjeta,
  validarTarjeta,
} from "../../lib/tarjeta-wompi";

// Los medios de pago de Wompi DENTRO de la página de la tienda, sin abrir la ventana de Wompi:
// tarjeta débito o crédito, PSE, Nequi y Botón Bancolombia. Lo usan el paso de pago de la compra
// (CheckoutApp.jsx) y la página para pagar un pedido ya guardado (/pedido/pagar/<token>).
//
// EL NAVEGADOR NO DECIDE NADA DEL COBRO:
//   - La tarjeta va de acá directo a Wompi (HTTPS), que la cambia por un token
//     (src/lib/tarjeta-wompi.ts). Al servidor de la tienda solo llega ese token.
//   - El monto lo pone el servidor desde la base (/api/pagos/crear → crearPagoDirecto).
//   - Que el pago se aprobó lo dice Wompi al servidor (/api/pagos/estado y el webhook), nunca
//     esta página: al terminar lleva a /pedido/pago/<token>?id=<transacción>, que lo comprueba.
//
// Después de crear la transacción, pregunta por su estado cada 2,5 segundos y hace lo que toque:
//   - PSE y Botón Bancolombia: manda al cliente a su banco; el banco lo devuelve al resultado.
//   - Nequi: "acepta la notificación en tu celular" y espera.
//   - Tarjeta: si el banco pide 3D Secure, muestra la verificación del banco acá mismo.

const MEDIOS = [
  {
    id: "CARD",
    nombre: "Tarjeta débito o crédito",
    detalle: "Visa, Mastercard, American Express o Diners.",
  },
  {
    id: "PSE",
    nombre: "PSE",
    detalle: "Débito desde tu cuenta de ahorros o corriente, en cualquier banco.",
  },
  {
    id: "NEQUI",
    nombre: "Nequi",
    detalle: "Aceptas el pago con una notificación en tu celular.",
  },
  {
    id: "BANCOLOMBIA_TRANSFER",
    nombre: "Botón Bancolombia",
    detalle: "Pagas desde tu cuenta Bancolombia, en la página del banco.",
  },
];

// El logo de la franquicia junto al número, apenas se reconoce. Solo archivos oficiales de cada
// marca (en public/assets/img); mientras no haya archivo, se muestra el nombre.
const LOGOS_FRANQUICIA = {
  VISA: "/assets/img/visa.svg",
  MASTERCARD: "/assets/img/mastercard.svg",
  AMEX: "/assets/img/amex.svg",
  DINERS: "/assets/img/diners.svg",
};

const TIPOS_DOCUMENTO = [
  { id: "CC", nombre: "Cédula de ciudadanía" },
  { id: "CE", nombre: "Cédula de extranjería" },
  { id: "NIT", nombre: "NIT" },
  { id: "PP", nombre: "Pasaporte" },
];

const CADA = 2500; // ms entre consultas del estado (Wompi pide entre 2 y 3 segundos)
const TOPE = 5 * 60 * 1000; // pasados 5 minutos, el resultado lo sigue la página de resultado
const SIN_CONEXION = "No pudimos conectarnos. Revisa tu internet e intenta de nuevo.";

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** El HTML del reto de 3D Secure llega escapado (&lt;form…): se desescapa sin ejecutarlo. */
function desescapar(html) {
  return new DOMParser().parseFromString(html, "text/html").documentElement.textContent ?? "";
}

function urlResultado(token, txId) {
  return `/pedido/pago/${encodeURIComponent(token)}?id=${encodeURIComponent(txId)}`;
}

function Campo({ id, label, error, hint, children }) {
  return (
    <div className="ck-campo">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

/**
 * @param {{
 *   total: number,
 *   token?: string,
 *   obtenerPedido?: () => Promise<string>,
 *   alSalir?: () => void,
 *   bloqueo?: string,
 *   telefono?: string,
 *   documento?: string,
 *   transferencia?: { nombre: string, detalle: string, contenido: import("react").ReactNode },
 * }} props
 *   `token`: el pedido a pagar, cuando ya existe (/pedido/pagar/<token>).
 *   `obtenerPedido`: en la compra, en vez del token: guarda el pedido la primera vez y devuelve su
 *     token. Si falla, lanza un Error con el mensaje para el cliente.
 *   `alSalir`: justo antes de dejar la página (al banco o al resultado). La compra vacía el carrito.
 *   `bloqueo`: por qué todavía no se puede pagar (falta aceptar la política de datos, hay
 *     productos agotados). Con él, el botón queda apagado y se muestra el motivo.
 *   `telefono`, `documento`: lo que el cliente ya escribió, para no pedírselo dos veces.
 *   `transferencia`: un medio más al final de la lista (la transferencia por WhatsApp), que
 *     maneja quien lo pone: al elegirlo se muestra su `contenido` en vez del botón de pagar.
 */
export default function PagoEnLinea({
  total,
  token: tokenPedido,
  obtenerPedido = async () => tokenPedido,
  alSalir,
  bloqueo = "",
  telefono = "",
  documento = "",
  transferencia,
}) {
  const [opciones, setOpciones] = useState(null);
  const [errorOpciones, setErrorOpciones] = useState("");
  const [medio, setMedio] = useState("CARD");

  const [tarjeta, setTarjeta] = useState({ numero: "", vencimiento: "", cvc: "", titular: "", cuotas: "1" });
  const [pse, setPse] = useState({ banco: "", tipoPersona: "0", tipoDocumento: "CC", documento });
  const [nequi, setNequi] = useState({ telefono });
  const [aceptaReglamento, setAceptaReglamento] = useState(false);
  const [aceptaDatos, setAceptaDatos] = useState(false);

  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState("");
  // formulario → procesando → (nequi | tresDs | saliendo). Fuera de "formulario" no se edita nada.
  const [fase, setFase] = useState("formulario");
  const [tresDs, setTresDs] = useState(null);

  // Si el componente se desmonta (el cliente vuelve a cambiar sus datos), la consulta se corta.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/pagos/opciones")
      .then(async (res) => {
        const datos = await res.json().catch(() => ({}));
        if (cancelado) return;
        if (!res.ok) throw new Error(datos.error || "");
        setOpciones(datos);
      })
      .catch((e) => {
        if (cancelado) return;
        setErrorOpciones(
          (e instanceof Error && e.message) ||
            "No pudimos cargar los medios de pago en línea. Recarga la página para intentar de nuevo."
        );
        if (transferencia) setMedio("transferencia");
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ocupado = fase !== "formulario";
  const marca = franquicia(tarjeta.numero);

  function cambiar(set, campo, valor) {
    set((v) => ({ ...v, [campo]: valor }));
    setErrores((e) => (e[campo] ? { ...e, [campo]: "" } : e));
  }

  function validar() {
    const e = {};
    if (medio === "CARD") Object.assign(e, validarTarjeta(tarjeta));
    if (medio === "PSE") {
      if (!pse.banco) e.banco = "Elige tu banco.";
      if (!/^[0-9A-Za-z]{5,15}$/.test(pse.documento.trim())) e.documento = "Revisa el número de documento.";
    }
    if (medio === "NEQUI" && !/^3\d{9}$/.test(soloDigitos(nequi.telefono))) {
      e.telefono = "Escribe el celular de Nequi (10 dígitos, empieza por 3).";
    }
    if (!aceptaReglamento || !aceptaDatos) e.wompi = "Para pagar en línea debes aceptar las dos condiciones de Wompi.";
    return e;
  }

  function salirA(url) {
    setFase("saliendo");
    alSalir?.();
    window.location.href = url;
  }

  /** Pregunta por la transacción hasta que haya que hacer algo con ella. */
  async function seguir(token, txId, metodo) {
    const inicio = Date.now();
    let fallos = 0;
    await esperar(1500);
    while (vivo.current && Date.now() - inicio < TOPE) {
      // Si la tienda no logra saber cómo va el pago (unos 30 segundos seguidos), no se deja al
      // cliente mirando "Procesando": la página de resultado sigue preguntando sola.
      if (fallos >= 12) return salirA(urlResultado(token, txId));
      let r = null;
      try {
        const res = await fetch(
          `/api/pagos/estado?p=${encodeURIComponent(token)}&id=${encodeURIComponent(txId)}`,
          { cache: "no-store" }
        );
        if (res.status === 404) return salirA(urlResultado(token, txId));
        if (res.ok) r = await res.json();
      } catch {
        // Un corte de internet no corta el pago: se sigue preguntando.
      }
      fallos = r ? 0 : fallos + 1;
      if (!vivo.current) return;
      if (r) {
        if (r.estado !== "PENDING") return salirA(urlResultado(token, txId));
        if (r.urlExterna && (metodo === "PSE" || metodo === "BANCOLOMBIA_TRANSFER")) {
          // Solo a una dirección https: la manda Wompi, pero no se navega a cualquier cosa.
          let destino = null;
          try {
            destino = new URL(r.urlExterna);
          } catch {
            destino = null;
          }
          if (destino?.protocol === "https:") return salirA(destino.href);
        }
        if (metodo === "NEQUI") setFase("nequi");
        if (metodo === "CARD" && r.tresDs) {
          setTresDs(r.tresDs);
          setFase("tresDs");
        }
      }
      await esperar(CADA);
    }
    if (vivo.current) salirA(urlResultado(token, txId));
  }

  async function pagar() {
    if (ocupado || bloqueo || !opciones) return;
    setMensaje("");
    const e = validar();
    setErrores(e);
    if (Object.values(e).some(Boolean)) return;

    const metodo = medio;
    setFase("procesando");
    try {
      const cuerpo = { metodo, aceptaWompi: true };
      if (metodo === "CARD") {
        // Primero la tarjeta: si Wompi no la acepta, no se guarda un pedido de más.
        const [mes, anio] = tarjeta.vencimiento.split("/");
        const tok = await tokenizarTarjeta(
          { numero: tarjeta.numero, cvc: tarjeta.cvc, mes, anio, titular: tarjeta.titular },
          opciones.llavePublica,
          opciones.ambiente
        );
        cuerpo.tarjeta = { token: tok.id, cuotas: Number(tarjeta.cuotas), navegador: datosNavegador() };
      }
      if (metodo === "PSE") {
        cuerpo.pse = {
          banco: pse.banco,
          tipoPersona: Number(pse.tipoPersona),
          tipoDocumento: pse.tipoDocumento,
          documento: pse.documento.trim(),
        };
      }
      if (metodo === "NEQUI") cuerpo.nequi = { telefono: soloDigitos(nequi.telefono) };

      const token = await obtenerPedido();
      cuerpo.token = token;

      let res;
      try {
        res = await fetch("/api/pagos/crear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
        });
      } catch {
        throw new Error(SIN_CONEXION);
      }
      const datos = await res.json().catch(() => ({}));
      if (!res.ok || !datos.txId) throw new Error(datos.error || "No pudimos iniciar el pago. Intenta de nuevo.");

      // La tarjeta ya no hace falta en pantalla.
      if (metodo === "CARD") setTarjeta((t) => ({ ...t, numero: "", cvc: "" }));
      await seguir(token, datos.txId, metodo);
    } catch (err) {
      if (!vivo.current) return;
      setMensaje((err instanceof Error && err.message) || "No pudimos iniciar el pago. Intenta de nuevo.");
      setFase("formulario");
      setTresDs(null);
    }
  }

  // ---------------------------------------------------------------- en curso
  if (fase === "nequi") {
    return (
      <div className="pl-espera" role="status">
        <p className="pl-espera-titulo">Revisa tu celular</p>
        <p className="pl-espera-txt">
          Te llegó una notificación de Nequi al {soloDigitos(nequi.telefono)}. Ábrela y acepta el
          pago de {fmt(total)}. No cierres esta página: apenas lo aceptes, te mostramos el
          resultado.
        </p>
        <span className="pl-girando" aria-hidden="true" />
      </div>
    );
  }

  if (fase === "tresDs") {
    const html = tresDs?.html ? desescapar(tresDs.html) : "";
    // El reto se muestra completo. El paso previo (SUPPORTED_VERSION) a veces trae un formulario
    // técnico para el banco, sin nada que ver: ese va en un marco invisible.
    const reto = tresDs?.paso === "CHALLENGE";
    return (
      <div className="pl-3ds" role="status">
        {/* Wompi exige el logo de Mastercard ID Check a la vista durante la verificación. */}
        <p className="pl-3ds-marca">
          <img src="/assets/img/mastercard.svg" alt="Mastercard" width="52" height="37" />
          <span className="mono">ID CHECK · VISA SECURE</span>
        </p>
        <p className="pl-espera-titulo">Tu banco está verificando la compra</p>
        <p className="pl-espera-txt">
          {reto
            ? "Sigue las instrucciones de tu banco para confirmar el pago. No cierres esta página."
            : "Esto toma unos segundos. No cierres esta página."}
        </p>
        {html && (
          <iframe
            title="Verificación de tu banco (3D Secure)"
            className={reto ? "pl-3ds-marco" : "pl-3ds-oculto"}
            srcDoc={html}
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            aria-hidden={reto ? undefined : true}
          />
        )}
        {!reto && <span className="pl-girando" aria-hidden="true" />}
      </div>
    );
  }

  if (fase === "saliendo") {
    return (
      <div className="pl-espera" role="status">
        <p className="pl-espera-titulo">Un momento…</p>
        <p className="pl-espera-txt">
          {medio === "PSE" || medio === "BANCOLOMBIA_TRANSFER"
            ? "Te estamos llevando a tu banco para que autorices el pago."
            : "Estamos confirmando tu pago."}
        </p>
        <span className="pl-girando" aria-hidden="true" />
      </div>
    );
  }

  // ---------------------------------------------------------------- formulario
  const conTransferencia = Boolean(transferencia);
  const enLinea = medio !== "transferencia";
  const cuotasMax = Math.max(1, Math.min(36, Number(opciones?.cuotas) || 36));

  return (
    <div className="pl">
      <div className="ck-medios" role="radiogroup" aria-label="Medio de pago">
        {MEDIOS.map((m) => (
          <div key={m.id} className={`ck-medio-caja ${medio === m.id ? "is-activo" : ""}`}>
            <label className="ck-medio">
              <input
                type="radio"
                name="pl-medio"
                value={m.id}
                checked={medio === m.id}
                disabled={ocupado || !opciones}
                onChange={() => {
                  setMedio(m.id);
                  setErrores({});
                  setMensaje("");
                }}
              />
              <span>
                <span className="ck-medio-nombre">{m.nombre}</span>
                <span className="ck-medio-detalle">{m.detalle}</span>
              </span>
            </label>

            {medio === m.id && m.id === "CARD" && (
              <div className="pl-form">
                <Campo id="pl-numero" label="Número de la tarjeta" error={errores.numero}>
                  <div className="pl-numero">
                    <input
                      id="pl-numero"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="0000 0000 0000 0000"
                      maxLength={23}
                      disabled={ocupado}
                      value={tarjeta.numero}
                      onChange={(e) => cambiar(setTarjeta, "numero", formatearNumero(e.target.value))}
                    />
                    {marca &&
                      (LOGOS_FRANQUICIA[marca] ? (
                        <img className="pl-marca-logo" src={LOGOS_FRANQUICIA[marca]} alt={marca} />
                      ) : (
                        <span className="pl-marca mono">{marca}</span>
                      ))}
                  </div>
                </Campo>
                <div className="ck-fila2 pl-fila-corta">
                  <Campo id="pl-venc" label="Vencimiento" error={errores.vencimiento}>
                    <input
                      id="pl-venc"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/AA"
                      maxLength={5}
                      disabled={ocupado}
                      value={tarjeta.vencimiento}
                      onChange={(e) =>
                        cambiar(setTarjeta, "vencimiento", formatearVencimiento(e.target.value))
                      }
                    />
                  </Campo>
                  <Campo id="pl-cvc" label="CVV" error={errores.cvc}>
                    <input
                      id="pl-cvc"
                      type="password"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder={marca === "AMEX" ? "4 dígitos" : "3 dígitos"}
                      maxLength={4}
                      disabled={ocupado}
                      value={tarjeta.cvc}
                      onChange={(e) => cambiar(setTarjeta, "cvc", soloDigitos(e.target.value).slice(0, 4))}
                    />
                  </Campo>
                </div>
                <Campo id="pl-titular" label="Nombre como aparece en la tarjeta" error={errores.titular}>
                  <input
                    id="pl-titular"
                    type="text"
                    autoComplete="cc-name"
                    maxLength={60}
                    disabled={ocupado}
                    value={tarjeta.titular}
                    onChange={(e) => cambiar(setTarjeta, "titular", e.target.value)}
                  />
                </Campo>
                <Campo
                  id="pl-cuotas"
                  label="Cuotas"
                  hint="Si tu tarjeta es débito, deja 1 cuota."
                >
                  <select
                    id="pl-cuotas"
                    disabled={ocupado}
                    value={tarjeta.cuotas}
                    onChange={(e) => cambiar(setTarjeta, "cuotas", e.target.value)}
                  >
                    {Array.from({ length: cuotasMax }, (_, i) => String(i + 1)).map((n) => (
                      <option key={n} value={n}>
                        {n === "1" ? "1 cuota" : `${n} cuotas`}
                      </option>
                    ))}
                  </select>
                </Campo>
                <p className="ck-nota pl-seguro">
                  Los datos de tu tarjeta viajan seguros directo a Wompi (Bancolombia). Baqtime no
                  los ve ni los guarda.
                </p>
              </div>
            )}

            {medio === m.id && m.id === "PSE" && (
              <div className="pl-form">
                <Campo id="pl-banco" label="Banco" error={errores.banco}>
                  <select
                    id="pl-banco"
                    disabled={ocupado}
                    value={pse.banco}
                    onChange={(e) => cambiar(setPse, "banco", e.target.value)}
                  >
                    <option value="">Elige tu banco</option>
                    {(opciones?.bancos ?? []).map((b) => (
                      <option key={b.codigo} value={b.codigo}>
                        {b.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id="pl-persona" label="Tipo de persona">
                  <select
                    id="pl-persona"
                    disabled={ocupado}
                    value={pse.tipoPersona}
                    onChange={(e) => cambiar(setPse, "tipoPersona", e.target.value)}
                  >
                    <option value="0">Persona natural</option>
                    <option value="1">Persona jurídica (empresa)</option>
                  </select>
                </Campo>
                <div className="ck-fila2">
                  <Campo id="pl-tipodoc" label="Tipo de documento">
                    <select
                      id="pl-tipodoc"
                      disabled={ocupado}
                      value={pse.tipoDocumento}
                      onChange={(e) => cambiar(setPse, "tipoDocumento", e.target.value)}
                    >
                      {TIPOS_DOCUMENTO.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo id="pl-doc" label="Número de documento" error={errores.documento}>
                    <input
                      id="pl-doc"
                      type="text"
                      inputMode={pse.tipoDocumento === "PP" ? "text" : "numeric"}
                      maxLength={15}
                      disabled={ocupado}
                      value={pse.documento}
                      onChange={(e) =>
                        cambiar(setPse, "documento", e.target.value.replace(/[^0-9A-Za-z]/g, ""))
                      }
                    />
                  </Campo>
                </div>
                <p className="ck-nota">
                  Al pagar te llevamos a la página de tu banco para que autorices el débito, y
                  vuelves aquí con el resultado.
                </p>
              </div>
            )}

            {medio === m.id && m.id === "NEQUI" && (
              <div className="pl-form">
                <Campo id="pl-nequi" label="Celular registrado en Nequi" error={errores.telefono}>
                  <input
                    id="pl-nequi"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    disabled={ocupado}
                    value={nequi.telefono}
                    onChange={(e) => cambiar(setNequi, "telefono", soloDigitos(e.target.value).slice(0, 10))}
                  />
                </Campo>
                <p className="ck-nota">
                  Te llegará una notificación a ese celular para que aceptes el pago en la app de
                  Nequi.
                </p>
              </div>
            )}

            {medio === m.id && m.id === "BANCOLOMBIA_TRANSFER" && (
              <div className="pl-form">
                <p className="ck-nota">
                  Al pagar te llevamos a la página de Bancolombia para que autorices el pago desde
                  tu cuenta, y vuelves aquí con el resultado.
                </p>
              </div>
            )}
          </div>
        ))}

        {conTransferencia && (
          <div className={`ck-medio-caja ${medio === "transferencia" ? "is-activo" : ""}`}>
            <label className="ck-medio">
              <input
                type="radio"
                name="pl-medio"
                value="transferencia"
                checked={medio === "transferencia"}
                disabled={ocupado}
                onChange={() => {
                  setMedio("transferencia");
                  setErrores({});
                  setMensaje("");
                }}
              />
              <span>
                <span className="ck-medio-nombre">{transferencia.nombre}</span>
                <span className="ck-medio-detalle">{transferencia.detalle}</span>
              </span>
            </label>
          </div>
        )}
      </div>

      {!opciones && !errorOpciones && <p className="ck-nota">Cargando los medios de pago…</p>}
      {errorOpciones && (
        <div className="field-error pl-error" role="alert">
          {errorOpciones}
        </div>
      )}

      {enLinea ? (
        <>
          {opciones && (
            <div className="consent-fields pl-wompi">
              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={aceptaReglamento}
                  disabled={ocupado}
                  onChange={(e) => {
                    setAceptaReglamento(e.target.checked);
                    setErrores((er) => ({ ...er, wompi: "" }));
                  }}
                />
                <span>
                  Acepto haber leído los{" "}
                  <a href={opciones.enlaceReglamento} target="_blank" rel="noopener noreferrer">
                    reglamentos y la política de privacidad
                  </a>{" "}
                  de Wompi para hacer este pago.
                </span>
              </label>
              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={aceptaDatos}
                  disabled={ocupado}
                  onChange={(e) => {
                    setAceptaDatos(e.target.checked);
                    setErrores((er) => ({ ...er, wompi: "" }));
                  }}
                />
                <span>
                  Acepto la{" "}
                  <a href={opciones.enlaceDatos} target="_blank" rel="noopener noreferrer">
                    autorización para la administración de datos personales
                  </a>{" "}
                  de Wompi.
                </span>
              </label>
              {errores.wompi && <p className="field-error">{errores.wompi}</p>}
            </div>
          )}

          {mensaje && (
            <div className="field-error pl-error" role="alert">
              {mensaje}
            </div>
          )}
          {bloqueo && <p className="ck-nota pl-bloqueo">{bloqueo}</p>}

          <button
            type="button"
            className="whatsapp-btn"
            onClick={pagar}
            disabled={ocupado || Boolean(bloqueo) || !opciones}
          >
            {fase === "procesando" ? "Procesando el pago…" : `Pagar ${fmt(total)}`}
          </button>
          <p className="ck-nota ck-nota-centro">Pago procesado por Wompi, de Bancolombia.</p>
        </>
      ) : (
        transferencia?.contenido
      )}
    </div>
  );
}
