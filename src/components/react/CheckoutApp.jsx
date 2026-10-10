import { useEffect, useRef, useState } from "react";
import { useCart } from "../../lib/useCart.js";
import { clearCart, removeFromCart } from "../../lib/cart-store.js";
import { fmt, precioLinea } from "../../lib/pricing.js";
import { CartTotals, lineDetail, lineImage } from "./CartPanel.jsx";
import {
  NAME_CITY_REGEX,
  correoValido,
  esEnvioLocal,
  filtrarCorreo,
  normalizarCorreo,
  onlyDigits,
  onlyLetters,
  sugerirCorreo,
  validateShipping,
} from "../../lib/shipping-validation.js";
import { POLITICA_DATOS_RUTA, TERMINOS_RUTA } from "../../lib/legal";
import { abrirPagoWompi } from "../../lib/pago-widget";
import {
  DEPARTAMENTOS,
  calcularEnvio,
  municipiosDe,
  nombreDestino,
  textoEntrega,
} from "../../lib/envios.js";
import {
  DIRECCION_VACIA,
  OTRA_VIA,
  TIPOS_DE_VIA,
  armarDireccion,
  direccionEnCurso,
  filtrarParte,
  partesQueFaltan,
  validarDireccion,
} from "../../lib/direccion.js";

// La compra, en una página propia (/checkout) y por pasos, como en las tiendas grandes:
//
//   #carrito → la tabla de lo que se lleva y el resumen. "Finalizar compra" pasa a…
//   #datos   → tres secciones en orden: datos personales, datos de entrega y pago. Cada una
//              se cierra al completarla y muestra lo que se llenó, con "Cambiar".
//
// Antes todo esto era un modal encima de la tienda, con los productos, los totales y nueve
// campos en una sola columna. Separar los pasos deja ver primero qué se lleva y cuánto cuesta,
// y después pedir los datos de a poco.
//
// Los pasos van en el hash de la URL: el "atrás" del navegador vuelve de los datos al carrito
// en vez de sacar al cliente de la compra, y los datos escritos siguen en memoria porque la
// página no se recarga.
//
// Lo que recibe el servidor NO cambia (src/pages/api/pedidos.ts): nombre, departamento,
// municipio, dirección, teléfono, correo y documento, más las autorizaciones. El nombre se arma
// con nombre + apellidos y la dirección con sus partes (src/lib/direccion.js). Los precios los
// vuelve a calcular el servidor; acá solo se muestran.

const PERSONALES_VACIOS = { email: "", nombre: "", apellidos: "", doc: "", phone: "" };
const ENTREGA_VACIA = { departamento: "", municipio: "", ...DIRECCION_VACIA };

const SIN_COBERTURA =
  "La transportadora no tiene cobertura en este municipio. Escríbenos por WhatsApp para coordinar tu envío.";
const DOC_OBLIGATORIO = "El documento es obligatorio para envíos fuera de Barranquilla.";

function pasoDeLaUrl() {
  return typeof window !== "undefined" && window.location.hash === "#datos" ? "datos" : "carrito";
}

/** Mismos textos que validateShipping(), que es la que usa el servidor. */
function erroresPersonales(p, ciudad) {
  const e = {};
  const correo = normalizarCorreo(p.email);
  if (!correo) {
    e.email = "Por favor ingresa tu correo electrónico para recibir el resumen de tu pedido.";
  } else if (!correoValido(correo)) {
    e.email = "Por favor ingresa un correo electrónico válido (por ejemplo, nombre@gmail.com).";
  }
  if (!p.nombre.trim() || !NAME_CITY_REGEX.test(p.nombre.trim())) {
    e.nombre = "Escribe tu nombre (solo letras).";
  }
  if (!p.apellidos.trim() || !NAME_CITY_REGEX.test(p.apellidos.trim())) {
    e.apellidos = "Escribe tus apellidos (solo letras).";
  }
  const doc = p.doc.trim();
  if (doc && (!/^[0-9]+$/.test(doc) || doc.length > 20)) {
    e.doc = "El número de identificación debe contener solo números (máx. 20 dígitos).";
  } else if (!doc && ciudad && !esEnvioLocal(ciudad)) {
    // Solo se sabe si es obligatorio cuando ya se eligió el municipio (sección de entrega).
    e.doc = DOC_OBLIGATORIO;
  }
  if (!/^[0-9]{10}$/.test(p.phone.trim())) {
    e.phone = "Por favor, ingresa un número de teléfono válido de 10 dígitos.";
  }
  return e;
}

function erroresEntrega(en, bolsos) {
  const e = {};
  if (!en.departamento) {
    e.departamento = "Elige el departamento de entrega.";
  } else {
    const envio = calcularEnvio(en.departamento, en.municipio, bolsos);
    if (!envio) e.municipio = "Elige el municipio de entrega.";
    else if (envio.sinCobertura) e.municipio = SIN_COBERTURA;
  }
  return { ...e, ...validarDireccion(en) };
}

/** Rótulo + control + error. El rótulo siempre visible: con solo placeholder, se perdía al escribir. */
function Campo({ id, label, error, hint, children }) {
  return (
    <div className="ck-campo">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

function IconoQuitar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

/**
 * @param {{
 *   catalog: import("../../lib/catalog").Catalogo,
 *   pagosActivos?: boolean,
 * }} props
 *   `pagosActivos`: los pagos en línea están encendidos (pagosEnLineaActivos(), src/lib/pagos.ts).
 *   Con ellos, el paso de pago ofrece pagar con Wompi ahí mismo; sin ellos, "Confirmar pedido"
 *   lleva a la página de gracias y el pago se coordina por WhatsApp, como siempre.
 */
export default function CheckoutApp({ catalog, pagosActivos = false }) {
  const items = useCart();
  const { products, categories } = catalog;

  // El carrito vive en localStorage: en el HTML del servidor siempre está vacío. Hasta que la
  // isla arranca en el navegador se muestra "cargando", para no pintar un "Tu carrito está
  // vacío" que dura medio segundo y asusta.
  const [montado, setMontado] = useState(false);
  const [paso, setPaso] = useState("carrito");

  const [personales, setPersonales] = useState(PERSONALES_VACIOS);
  const [entrega, setEntrega] = useState(ENTREGA_VACIA);
  // Dos autorizaciones separadas (Ley 1581): la de datos es condición para comprar; la de
  // promociones es opcional y no puede venir atada a la otra. Ninguna arranca marcada.
  const [aceptaDatos, setAceptaDatos] = useState(false);
  const [aceptaPromos, setAceptaPromos] = useState(false);

  const [abierta, setAbierta] = useState("personales");
  const [listas, setListas] = useState({ personales: false, entrega: false });
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");

  // El medio de pago elegido en el paso 3. "linea" abre Wompi ahí mismo; "transferencia" guarda
  // el pedido y lleva a coordinar el pago por WhatsApp.
  const [medio, setMedio] = useState("linea");
  const pagaEnLinea = pagosActivos && medio === "linea";
  // Cuando el pedido ya se guardó y se abrió Wompi: el carrito se vació, pero la página no puede
  // quedar en "Tu carrito está vacío". Si el cliente cierra la ventana sin pagar, desde acá la
  // vuelve a abrir.
  const [pedidoCreado, setPedidoCreado] = useState(null);
  const [abriendoPago, setAbriendoPago] = useState(false);
  const [errorPago, setErrorPago] = useState("");

  useEffect(() => {
    setMontado(true);
    const alCambiar = () => {
      setPaso(pasoDeLaUrl());
      window.scrollTo(0, 0);
    };
    setPaso(pasoDeLaUrl());
    window.addEventListener("hashchange", alCambiar);
    // El ícono del carrito del encabezado pide abrir el panel lateral, que en esta página no
    // existe: acá lleva al paso del carrito.
    const alCarrito = () => {
      window.location.hash = "carrito";
    };
    window.addEventListener("baqtime:toggle-cart", alCarrito);
    return () => {
      window.removeEventListener("hashchange", alCambiar);
      window.removeEventListener("baqtime:toggle-cart", alCarrito);
    };
  }, []);

  function irA(destino) {
    window.location.hash = destino;
  }

  // Cada vez que se abre una sección (al continuar, al "Cambiar", o cuando la entrega devuelve a
  // pedir la cédula) se lleva a la vista: en el celular quedaba más abajo o más arriba de la
  // pantalla, y el cliente no veía qué le tocaba hacer.
  const primeraVez = useRef(true);
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;
      return;
    }
    document
      .getElementById(`ck-sec-${abierta}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [abierta]);

  const lineas = items.map((item) => ({ item, ...precioLinea(item, products, categories) }));
  const hayAgotados = lineas.some((l) => !l.disponible);

  // El envío aparece recién con el municipio elegido; antes, el total es sin envío.
  const calculado = calcularEnvio(entrega.departamento, entrega.municipio, items.length);
  const sinCobertura = Boolean(calculado?.sinCobertura);
  const envio = calculado && !sinCobertura ? calculado : null;
  const ciudad = entrega.municipio ? nombreDestino(entrega.departamento, entrega.municipio) : "";
  const total = lineas.reduce((s, l) => s + l.total, 0) + (envio ? envio.precio : 0);

  function cambiarPersonal(campo, valor) {
    setPersonales((p) => ({ ...p, [campo]: valor }));
  }
  function cambiarEntrega(campo, valor) {
    setEntrega((en) => ({ ...en, [campo]: valor }));
  }

  function abrir(seccion) {
    setListas((l) => ({ ...l, [seccion]: false }));
    setAbierta(seccion);
  }

  function continuarPersonales() {
    const e = erroresPersonales(personales, listas.entrega ? ciudad : "");
    setErrores(e);
    if (Object.keys(e).length) return;
    setListas((l) => ({ ...l, personales: true }));
    setAbierta(listas.entrega ? "pago" : "entrega");
  }

  function continuarEntrega() {
    const e = erroresEntrega(entrega, items.length);
    setErrores(e);
    if (Object.keys(e).length) return;
    // El documento se pidió antes de saber la ciudad. Si el envío es fuera de Barranquilla y
    // quedó vacío, se vuelve a los datos personales a pedirlo; la entrega ya queda lista.
    if (!personales.doc.trim() && !esEnvioLocal(ciudad)) {
      setErrores({ doc: DOC_OBLIGATORIO });
      setListas({ personales: false, entrega: true });
      setAbierta("personales");
      return;
    }
    setListas((l) => ({ ...l, entrega: true }));
    setAbierta("pago");
  }

  // El pedido se GUARDA antes de ir a pagar: si el cliente abandona en el pago, la venta no se
  // pierde y el carrito ya no hace falta. Al servidor va QUÉ se compra, nunca los precios.
  async function confirmar() {
    if (!items.length || enviando || !aceptaDatos) return;
    const shipping = {
      name: `${personales.nombre.trim()} ${personales.apellidos.trim()}`,
      departamento: entrega.departamento,
      municipio: entrega.municipio,
      address: armarDireccion(entrega),
      phone: personales.phone,
      email: personales.email,
      doc: personales.doc,
    };
    // La última revisión, con la misma función que usa el servidor.
    const e = validateShipping(shipping);
    if (Object.keys(e).length) {
      const dePersonales = ["name", "email", "phone", "doc"].some((k) => e[k]);
      setErrores({ ...e, nombre: e.name });
      abrir(dePersonales ? "personales" : "entrega");
      return;
    }

    setErrorEnvio("");
    setEnviando(true);
    try {
      const res = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            initials: i.initials,
            initialsColorName: i.initialsColorName,
          })),
          shipping,
          consent: { datos: aceptaDatos, promociones: aceptaPromos },
        }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorEnvio(datos.error || "No pudimos guardar tu pedido. Intenta de nuevo.");
        setEnviando(false);
        return;
      }
      if (pagaEnLinea) {
        // El pedido ya existe: se muestra "falta el pago" y se abre Wompi sin cambiar de página.
        // Si paga, el widget lleva a /pedido/pago/<token>, que muestra el resumen de la compra.
        setPedidoCreado({ token: datos.public_token, numero: datos.order_number, total: datos.total });
        clearCart();
        setEnviando(false);
        window.scrollTo(0, 0);
        await pagar(datos.public_token);
        return;
      }
      clearCart();
      window.location.href = `/pedido/gracias?p=${encodeURIComponent(datos.public_token)}`;
    } catch {
      setErrorEnvio("No pudimos conectarnos. Revisa tu internet e intenta de nuevo.");
      setEnviando(false);
    }
  }

  async function pagar(token) {
    setErrorPago("");
    setAbriendoPago(true);
    const resultado = await abrirPagoWompi(token);
    if (!resultado.ok) setErrorPago(resultado.error);
    // Abierta o con error, el botón queda listo: si el cliente cierra la ventana de Wompi sin
    // pagar, puede que el widget no avise.
    setAbriendoPago(false);
  }

  // Antes que el "carrito vacío": acá el carrito se vació porque el pedido ya se guardó.
  if (pedidoCreado) {
    const { token, numero, total: totalPedido } = pedidoCreado;
    return (
      <main className="ck-wrap">
        <section className="ck-creado">
          <p className="ck-subtitulo mono">PEDIDO GUARDADO · {numero}</p>
          <h1 className="ck-titulo">Falta el pago</h1>
          <p className="ck-creado-txt">
            Tu pedido quedó guardado. Completa el pago en la ventana de Wompi; si la cerraste,
            vuelve a abrirla aquí.
          </p>
          <div className="ck-total-pago">
            <span>Total a pagar</span>
            <span className="mono">{fmt(totalPedido)}</span>
          </div>
          {errorPago && (
            <div className="field-error" role="alert">
              {errorPago}
            </div>
          )}
          <button
            type="button"
            className="whatsapp-btn"
            onClick={() => pagar(token)}
            disabled={abriendoPago}
          >
            {abriendoPago ? "Abriendo el pago…" : `Pagar ${fmt(totalPedido)}`}
          </button>
          <a className="ck-alterno" href={`/pedido/gracias?p=${encodeURIComponent(token)}`}>
            Ver mi pedido y otras formas de pago
          </a>
          <p className="ck-nota ck-nota-centro">
            También te enviamos a tu correo el enlace para pagarlo.
          </p>
        </section>
      </main>
    );
  }

  if (!montado) {
    return (
      <main className="ck-wrap">
        <p className="ck-cargando">Cargando tu carrito…</p>
      </main>
    );
  }

  if (!items.length) {
    return (
      <main className="ck-wrap">
        <section className="ck-vacio">
          <h1 className="ck-titulo">Tu carrito está vacío</h1>
          <p>Elige un bolso del catálogo y personalízalo con tus iniciales.</p>
          <a className="whatsapp-btn ck-btn-corto" href="/catalogo">
            Ver el catálogo
          </a>
        </section>
      </main>
    );
  }

  const sugerencia = sugerirCorreo(personales.email);
  // El resumen se arma mientras escribe, aunque falten partes (ver direccionEnCurso).
  const direccionEscrita = direccionEnCurso(entrega);
  const faltanDeLaVia = partesQueFaltan(entrega);

  // ===================================================================== PASO 1: CARRITO
  if (paso === "carrito") {
    return (
      <main className="ck-wrap">
        <a className="ck-volver" href="/catalogo">
          ← Seguir comprando
        </a>
        <h1 className="ck-titulo">Tu carrito</h1>

        <div className="ck-grid">
          <section className="ck-principal" aria-label="Productos">
            <div className="ck-tabla" role="table">
              <div className="ck-tabla-cab mono" role="row">
                <span role="columnheader">PRODUCTO</span>
                <span role="columnheader" className="ck-num">
                  PRECIO
                </span>
                <span role="columnheader" aria-label="Quitar" />
              </div>
              {lineas.map(({ item, extra, total: precio, disponible }) => (
                <div className="ck-tabla-fila" role="row" key={item.id}>
                  <div className="ck-prod" role="cell">
                    <img className="ck-prod-img" src={lineImage(item, products)} alt={item.name} />
                    <div>
                      <p className="ck-prod-nombre">{item.name}</p>
                      <p className="ck-prod-detalle">{lineDetail(item)}</p>
                      {disponible && extra > 0 && (
                        <p className="ck-prod-detalle">Incluye bordado adicional · {fmt(extra)}</p>
                      )}
                      {!disponible && (
                        <p className="cart-line-agotado">Ya no está disponible · quítalo para continuar</p>
                      )}
                    </div>
                  </div>
                  <span className="ck-num mono" role="cell">
                    {disponible ? fmt(precio) : "—"}
                  </span>
                  <span role="cell">
                    <button
                      type="button"
                      className="ck-quitar"
                      onClick={() => removeFromCart(item.id)}
                      aria-label={`Quitar ${item.name} del carrito`}
                    >
                      <IconoQuitar />
                    </button>
                  </span>
                </div>
              ))}
            </div>
            {/* Una línea por bolso, sin selector de cantidad: cada bolso lleva sus propias
                iniciales, así que dos iguales son dos líneas (src/lib/cart-store.js). */}
            <p className="ck-nota">
              Cada bolso va en su propia línea con sus iniciales. Para llevar otro, agrégalo desde
              su ficha.
            </p>
          </section>

          <aside className="ck-resumen" aria-label="Resumen de compra">
            <p className="ck-resumen-titulo mono">RESUMEN DE COMPRA</p>
            <CartTotals items={items} products={products} categories={categories} />
            <p className="ck-nota">El envío se calcula cuando eliges el municipio de entrega.</p>
            {hayAgotados && (
              <div className="field-error" role="alert">
                Quita los productos que ya no están disponibles para continuar.
              </div>
            )}
            <button
              type="button"
              className="whatsapp-btn"
              disabled={hayAgotados}
              onClick={() => irA("datos")}
            >
              Finalizar compra
            </button>
          </aside>
        </div>
      </main>
    );
  }

  // ===================================================================== PASO 2: DATOS
  const nombreCompleto = `${personales.nombre.trim()} ${personales.apellidos.trim()}`.trim();

  return (
    <main className="ck-wrap">
      <a className="ck-volver" href="#carrito">
        ← Volver al carrito
      </a>
      <h1 className="ck-titulo">Finalizar compra</h1>

      <div className="ck-grid">
        <div className="ck-principal">
          {/* ------------------------------------------------ DATOS PERSONALES */}
          <section
            id="ck-sec-personales"
            className={`ck-seccion ${abierta === "personales" ? "is-abierta" : ""}`}
          >
            <div className="ck-seccion-cab">
              <h2 className="ck-seccion-titulo mono">1 · DATOS PERSONALES</h2>
              {listas.personales && abierta !== "personales" && (
                <button type="button" className="ck-cambiar" onClick={() => abrir("personales")}>
                  Cambiar
                </button>
              )}
            </div>

            {abierta === "personales" ? (
              <div className="ck-seccion-cuerpo">
                {/* La sugerencia corrige errores de dedo en dominios comunes (gmial.com): es la
                    causa número uno de "nunca me llegó el correo". */}
                <Campo
                  id="ck-email"
                  label="Correo electrónico"
                  error={errores.email}
                  hint="Te enviaremos aquí el resumen de tu pedido."
                >
                  <input
                    id="ck-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={personales.email}
                    onChange={(e) => cambiarPersonal("email", filtrarCorreo(e.target.value))}
                  />
                  {sugerencia && (
                    <button
                      type="button"
                      className="field-sug"
                      onClick={() => cambiarPersonal("email", sugerencia)}
                    >
                      ¿Quisiste decir <u>{sugerencia}</u>?
                    </button>
                  )}
                </Campo>

                <div className="ck-fila2">
                  <Campo id="ck-nombre" label="Nombre" error={errores.nombre}>
                    <input
                      id="ck-nombre"
                      type="text"
                      autoComplete="given-name"
                      value={personales.nombre}
                      onChange={(e) => cambiarPersonal("nombre", onlyLetters(e.target.value))}
                    />
                  </Campo>
                  <Campo id="ck-apellidos" label="Apellidos" error={errores.apellidos}>
                    <input
                      id="ck-apellidos"
                      type="text"
                      autoComplete="family-name"
                      value={personales.apellidos}
                      onChange={(e) => cambiarPersonal("apellidos", onlyLetters(e.target.value))}
                    />
                  </Campo>
                </div>

                <div className="ck-fila2">
                  {/* autoComplete="off": no hay un token estándar para la cédula colombiana, y
                      dejar que el navegador adivine pondría un dato que no es este. */}
                  <Campo
                    id="ck-doc"
                    label="Cédula"
                    error={errores.doc}
                    hint="Obligatoria para envíos fuera de Barranquilla."
                  >
                    <input
                      id="ck-doc"
                      type="text"
                      autoComplete="off"
                      inputMode="numeric"
                      maxLength={20}
                      value={personales.doc}
                      onChange={(e) => cambiarPersonal("doc", onlyDigits(e.target.value, 20))}
                    />
                  </Campo>
                  <Campo id="ck-phone" label="Celular" error={errores.phone}>
                    <input
                      id="ck-phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={personales.phone}
                      onChange={(e) => cambiarPersonal("phone", onlyDigits(e.target.value, 10))}
                    />
                  </Campo>
                </div>

                {/* Las políticas se abren en otra pestaña: los datos escritos viven solo en
                    memoria, y navegar fuera para leerlas los haría perder. */}
                <div className="consent-fields">
                  <label className="consent-check">
                    <input
                      type="checkbox"
                      checked={aceptaDatos}
                      onChange={(e) => setAceptaDatos(e.target.checked)}
                    />
                    <span>
                      Autorizo a Baqtime a tratar mis datos personales para gestionar y entregar mi
                      pedido, y acepto la{" "}
                      <a href={POLITICA_DATOS_RUTA} target="_blank" rel="noopener">
                        Política de tratamiento de datos personales
                      </a>{" "}
                      y los{" "}
                      <a href={TERMINOS_RUTA} target="_blank" rel="noopener">
                        Términos y condiciones
                      </a>
                      .
                    </span>
                  </label>
                  <label className="consent-check">
                    <input
                      type="checkbox"
                      checked={aceptaPromos}
                      onChange={(e) => setAceptaPromos(e.target.checked)}
                    />
                    <span>Quiero recibir novedades y promociones de Baqtime (opcional).</span>
                  </label>
                </div>

                {/* Sin la autorización no se puede seguir: el botón queda apagado, no solo
                    muestra un error al pulsarlo. */}
                <button
                  type="button"
                  className="whatsapp-btn"
                  disabled={!aceptaDatos}
                  onClick={continuarPersonales}
                >
                  Ir a los datos de entrega
                </button>
                {!aceptaDatos && (
                  <p className="ck-nota ck-nota-centro">
                    Para continuar, acepta la política de datos y los términos.
                  </p>
                )}
              </div>
            ) : (
              listas.personales && (
                <p className="ck-seccion-resumen">
                  {nombreCompleto} · {personales.phone}
                  <br />
                  {normalizarCorreo(personales.email)}
                </p>
              )
            )}
          </section>

          {/* ------------------------------------------------ DATOS DE ENTREGA */}
          <section
            id="ck-sec-entrega"
            className={`ck-seccion ${abierta === "entrega" ? "is-abierta" : ""}`}
          >
            <div className="ck-seccion-cab">
              <h2 className="ck-seccion-titulo mono">2 · DATOS DE ENTREGA</h2>
              {listas.entrega && abierta !== "entrega" && (
                <button type="button" className="ck-cambiar" onClick={() => abrir("entrega")}>
                  Cambiar
                </button>
              )}
            </div>

            {abierta === "entrega" ? (
              <div className="ck-seccion-cuerpo">
                {/* Listas y no texto libre: el precio del envío depende del municipio exacto
                    (src/lib/envios.js, lista del DANE). */}
                <div className="ck-fila2">
                  <Campo id="ck-departamento" label="Departamento" error={errores.departamento}>
                    <select
                      id="ck-departamento"
                      autoComplete="address-level1"
                      value={entrega.departamento}
                      onChange={(e) =>
                        setEntrega((en) => ({ ...en, departamento: e.target.value, municipio: "" }))
                      }
                    >
                      <option value="">Elige el departamento</option>
                      {DEPARTAMENTOS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo
                    id="ck-municipio"
                    label="Municipio"
                    error={sinCobertura ? SIN_COBERTURA : errores.municipio}
                  >
                    <select
                      id="ck-municipio"
                      autoComplete="address-level2"
                      value={entrega.municipio}
                      disabled={!entrega.departamento}
                      onChange={(e) => cambiarEntrega("municipio", e.target.value)}
                    >
                      <option value="">
                        {entrega.departamento ? "Elige el municipio" : "Primero elige el departamento"}
                      </option>
                      {municipiosDe(entrega.departamento).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>

                {/* La dirección por partes: tipo de vía, número, # cruce - placa. */}
                <div className="ck-dir">
                  <Campo id="ck-via" label="Tipo de vía" error={errores.via}>
                    <select
                      id="ck-via"
                      value={entrega.via}
                      onChange={(e) => cambiarEntrega("via", e.target.value)}
                    >
                      <option value="">Elige</option>
                      {TIPOS_DE_VIA.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                      <option value={OTRA_VIA}>Otra (rural, vereda…)</option>
                    </select>
                  </Campo>
                  {entrega.via !== OTRA_VIA && (
                    <>
                      <Campo id="ck-numero" label="Número" error={errores.numero}>
                        <input
                          id="ck-numero"
                          type="text"
                          placeholder="Ej: 15A"
                          autoComplete="off"
                          value={entrega.numero}
                          onChange={(e) => cambiarEntrega("numero", filtrarParte(e.target.value))}
                        />
                      </Campo>
                      <Campo id="ck-cruce" label="#" error={errores.cruce}>
                        <input
                          id="ck-cruce"
                          type="text"
                          placeholder="Ej: 54"
                          autoComplete="off"
                          value={entrega.cruce}
                          onChange={(e) => cambiarEntrega("cruce", filtrarParte(e.target.value))}
                        />
                      </Campo>
                      <Campo id="ck-placa" label="–" error={errores.placa}>
                        <input
                          id="ck-placa"
                          type="text"
                          placeholder="Ej: 20"
                          autoComplete="off"
                          value={entrega.placa}
                          onChange={(e) => cambiarEntrega("placa", filtrarParte(e.target.value))}
                        />
                      </Campo>
                    </>
                  )}
                </div>
                {entrega.via === OTRA_VIA && (
                  <Campo id="ck-completa" label="Dirección completa" error={errores.completa}>
                    <input
                      id="ck-completa"
                      type="text"
                      autoComplete="street-address"
                      maxLength={120}
                      placeholder="Ej: Vereda El Rosal, finca La Esperanza"
                      value={entrega.completa}
                      onChange={(e) => cambiarEntrega("completa", e.target.value)}
                    />
                  </Campo>
                )}
                <p className="ck-dir-resumen">
                  <span className="mono">RESUMEN DE LA DIRECCIÓN</span>
                  {direccionEscrita || (
                    <span className="ck-dir-ejemplo">Ej: Calle 15A # 54 - 20</span>
                  )}
                </p>
                {faltanDeLaVia.length > 0 && (
                  <p className="ck-nota ck-dir-falta">
                    Falta{" "}
                    {faltanDeLaVia.length > 1
                      ? `${faltanDeLaVia.slice(0, -1).join(", ")} y ${faltanDeLaVia.at(-1)}`
                      : faltanDeLaVia[0]}
                    .
                  </p>
                )}

                <div className="ck-fila2">
                  <Campo id="ck-adicional" label="Información adicional (opcional)">
                    <input
                      id="ck-adicional"
                      type="text"
                      autoComplete="address-line2"
                      maxLength={60}
                      placeholder="Ej: Apto 101, Torre 2"
                      value={entrega.adicional}
                      onChange={(e) => cambiarEntrega("adicional", e.target.value)}
                    />
                  </Campo>
                  <Campo id="ck-barrio" label="Barrio (opcional)">
                    <input
                      id="ck-barrio"
                      type="text"
                      maxLength={40}
                      value={entrega.barrio}
                      onChange={(e) => cambiarEntrega("barrio", e.target.value)}
                    />
                  </Campo>
                </div>

                <p className="ck-subtitulo mono">MÉTODO DE ENTREGA</p>
                {envio ? (
                  <div className="ck-metodo">
                    <span className="ck-metodo-radio" aria-hidden="true" />
                    <span className="ck-metodo-txt">
                      Envío a domicilio · {textoEntrega(envio)} después de aprobado el pago
                    </span>
                    <span className="ck-metodo-precio mono">{fmt(envio.precio)}</span>
                  </div>
                ) : (
                  <p className="ck-nota">Elige el municipio para ver el costo y el tiempo de entrega.</p>
                )}

                <button type="button" className="whatsapp-btn" onClick={continuarEntrega}>
                  Ir al pago
                </button>
              </div>
            ) : (
              listas.entrega && (
                <p className="ck-seccion-resumen">
                  {armarDireccion(entrega)}
                  <br />
                  {ciudad}
                  {envio ? ` · ${textoEntrega(envio)} · ${fmt(envio.precio)}` : ""}
                </p>
              )
            )}
          </section>

          {/* ------------------------------------------------ PAGO */}
          <section
            id="ck-sec-pago"
            className={`ck-seccion ${abierta === "pago" ? "is-abierta" : ""}`}
          >
            <div className="ck-seccion-cab">
              <h2 className="ck-seccion-titulo mono">3 · PAGO</h2>
            </div>
            {abierta === "pago" && listas.personales && listas.entrega && (
              <div className="ck-seccion-cuerpo">
                <div className="ck-total-pago">
                  <span>Total a pagar</span>
                  <span className="mono">{fmt(total)}</span>
                </div>
                {pagosActivos && (
                  <div className="ck-medios" role="radiogroup" aria-label="Medio de pago">
                    <label className={`ck-medio ${medio === "linea" ? "is-activo" : ""}`}>
                      <input
                        type="radio"
                        name="ck-medio"
                        value="linea"
                        checked={medio === "linea"}
                        onChange={() => setMedio("linea")}
                      />
                      <span>
                        <span className="ck-medio-nombre">Pago en línea</span>
                        <span className="ck-medio-detalle">
                          Tarjeta débito o crédito, PSE, Nequi, DaviPlata o Botón Bancolombia, en la
                          ventana segura de Wompi.
                        </span>
                      </span>
                    </label>
                    <label className={`ck-medio ${medio === "transferencia" ? "is-activo" : ""}`}>
                      <input
                        type="radio"
                        name="ck-medio"
                        value="transferencia"
                        checked={medio === "transferencia"}
                        onChange={() => setMedio("transferencia")}
                      />
                      <span>
                        <span className="ck-medio-nombre">Transferencia por WhatsApp</span>
                        <span className="ck-medio-detalle">
                          Guardamos tu pedido y te compartimos por WhatsApp los datos para
                          transferir.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
                <p className="ck-nota">
                  {pagaEnLinea
                    ? "Al pagar guardamos tu pedido y se abre la ventana de pago de Wompi."
                    : "Al confirmar guardamos tu pedido y te llevamos a coordinar el pago."}{" "}
                  Los productos personalizados no tienen cambio ni retracto, salvo por garantía.
                </p>
                {errorEnvio && (
                  <div className="field-error" role="alert">
                    {errorEnvio}
                  </div>
                )}
                <button
                  type="button"
                  className="whatsapp-btn"
                  onClick={confirmar}
                  disabled={enviando || hayAgotados || !aceptaDatos}
                >
                  {enviando
                    ? "Guardando tu pedido…"
                    : pagaEnLinea
                      ? `Pagar ${fmt(total)}`
                      : "Confirmar pedido"}
                </button>
              </div>
            )}
          </section>
        </div>

        <aside className="ck-resumen" aria-label="Resumen de compra">
          <div className="ck-resumen-cab">
            <p className="ck-resumen-titulo mono">RESUMEN DE COMPRA</p>
            <a className="ck-cambiar" href="#carrito">
              Volver al carrito
            </a>
          </div>
          <ul className="ck-resumen-items">
            {lineas.map(({ item, total: precio, disponible }) => (
              <li key={item.id}>
                <img src={lineImage(item, products)} alt="" />
                <span>
                  <span className="ck-prod-nombre">{item.name}</span>
                  <span className="ck-prod-detalle">{lineDetail(item)}</span>
                </span>
                <span className="mono">{disponible ? fmt(precio) : "—"}</span>
              </li>
            ))}
          </ul>
          <CartTotals items={items} products={products} categories={categories} envio={envio} />
          {envio && (
            <p className="ck-nota">Entrega en {textoEntrega(envio)} después de aprobado el pago.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
