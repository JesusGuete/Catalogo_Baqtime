import { useEffect, useState } from "react";
import { CartLine, CartTotals } from "./CartPanel.jsx";
import { clearCart } from "../../lib/cart-store.js";
import {
  validateShipping,
  onlyDigits,
  onlyLetters,
  esEnvioLocal,
  filtrarCorreo,
  sugerirCorreo,
} from "../../lib/shipping-validation.js";
import { POLITICA_DATOS_RUTA } from "../../lib/legal";

const EMPTY = { name: "", city: "", address: "", phone: "", email: "", doc: "" };

// Página completa de "Finalizar compra" — portada desde #checkoutOverlay en
// index.html + sendCartWhatsapp() en cart.js. Mismo markup/clases, mismos textos
// de error, mismo orden de campos.
export default function Checkout({ items, products, categories = [], onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  // Dos autorizaciones separadas a propósito (Ley 1581): la de datos es condición para
  // poder hacer el pedido; la de promociones es opcional y no puede venir atada a la otra.
  // Ninguna arranca marcada: una casilla premarcada no es una autorización.
  const [aceptaDatos, setAceptaDatos] = useState(false);
  const [aceptaPromos, setAceptaPromos] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Filtros de tipeo mientras escribe (equivalentes a filterDigitsInput /
  // filterNameCityInput): el teléfono solo acepta dígitos, el nombre solo letras.
  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const sugerencia = sugerirCorreo(form.email);

  // El pedido se GUARDA antes de que el navegador se vaya a ningún lado.
  //
  // Antes esto armaba el mensaje de WhatsApp, vaciaba el carrito y navegaba fuera:
  // si el cliente cancelaba en la pantalla de WhatsApp ya había perdido el carrito y
  // los datos de envío, y de la venta no quedaba rastro en ninguna parte. Ahora el
  // carrito se vacía recién cuando el servidor confirmó que el pedido existe, y el
  // paso a WhatsApp ocurre después, desde la página de gracias.
  //
  // Al servidor se le manda QUÉ producto y QUÉ iniciales, nunca los precios: los
  // recalcula él contra el catálogo (ver src/pages/api/pedidos.ts).
  async function handleSend() {
    if (!items.length || enviando) return;
    const found = validateShipping(form);
    if (!aceptaDatos) found.datos = "Para hacer el pedido debes aceptar la política de datos.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

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
          shipping: form,
          consent: { datos: aceptaDatos, promociones: aceptaPromos },
        }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorEnvio(datos.error || "No pudimos guardar tu pedido. Intenta de nuevo.");
        setEnviando(false);
        return;
      }
      clearCart();
      window.location.href = `/pedido/gracias?p=${encodeURIComponent(datos.public_token)}`;
    } catch {
      setErrorEnvio("No pudimos conectarnos. Revisa tu internet e intenta de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="checkout-page" role="dialog" aria-modal="true" aria-label="Finalizar compra">
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <h2>Finalizar compra</h2>

        <div className="cart-items">
          {items.length === 0 ? (
            <p className="cart-empty">Tu carrito está vacío.</p>
          ) : (
            items.map((item) => (
              <CartLine key={item.id} item={item} products={products} categories={categories} />
            ))
          )}
        </div>

        <CartTotals items={items} products={products} categories={categories} />

        {/* Encabeza un grupo de campos, no describe uno solo. Cada input ya lleva su
            propio <label>. */}
        <div
          className="field cart-shipping-field"
          role="group"
          aria-labelledby="checkout-envio"
        >
          <span className="field-label" id="checkout-envio">Datos de envío</span>
          <div className="shipping-fields">
            {/* Rótulos visibles y no solo placeholder: antes el nombre del campo
                desaparecía apenas se escribía, así que revisar los datos antes de
                confirmar era leer cinco valores sueltos sin saber cuál era cuál.
                autoComplete: sin esto el único formulario que cierra la venta no
                podía autocompletarse con los datos guardados del navegador.

                Cada campo va en su propio .shipping-field: así el rótulo queda pegado
                a SU input (gap chico) y el salto más grande queda solo entre un campo
                y el siguiente, en vez de un mismo espacio parejo para las dos cosas. */}
            <div className="shipping-field">
              <label htmlFor="checkout-name">Nombre completo</label>
              <input
                id="checkout-name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(e) => set("name", onlyLetters(e.target.value))}
              />
              <div className="field-error">{errors.name || ""}</div>
            </div>

            <div className="shipping-field">
              <label htmlFor="checkout-city">Ciudad</label>
              <input
                id="checkout-city"
                type="text"
                autoComplete="address-level2"
                value={form.city}
                onChange={(e) => set("city", onlyLetters(e.target.value))}
              />
              <div className="field-error">{errors.city || ""}</div>
            </div>

            <div className="shipping-field">
              <label htmlFor="checkout-address">Dirección exacta</label>
              <input
                id="checkout-address"
                type="text"
                autoComplete="street-address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
              <div className="field-error">{errors.address || ""}</div>
            </div>

            <div className="shipping-field">
              <label htmlFor="checkout-phone">Número de teléfono</label>
              <input
                id="checkout-phone"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                maxLength={10}
                value={form.phone}
                onChange={(e) => set("phone", onlyDigits(e.target.value, 10))}
              />
              <div className="field-error">{errors.phone || ""}</div>
            </div>

            {/* Junto al teléfono: los dos datos de contacto quedan juntos y el documento
                —que cambia de obligatorio a opcional según la ciudad— sigue último.
                La sugerencia corrige errores de dedo en dominios comunes (gmial.com); es
                la causa número uno de "nunca me llegó el correo". */}
            <div className="shipping-field">
              <label htmlFor="checkout-email">Correo electrónico</label>
              <input
                id="checkout-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="checkout-email-ayuda"
                value={form.email}
                onChange={(e) => set("email", filtrarCorreo(e.target.value))}
              />
              {sugerencia && (
                <button
                  type="button"
                  className="field-sug"
                  onClick={() => set("email", sugerencia)}
                >
                  ¿Quisiste decir <u>{sugerencia}</u>?
                </button>
              )}
              <div className="field-error">{errors.email || ""}</div>
              <p className="field-hint" id="checkout-email-ayuda">
                Te enviaremos aquí el resumen de tu pedido.
              </p>
            </div>

            {/* El texto del rótulo sigue a la ciudad que se está escribiendo: decir
                "(opcional)" mientras el envío va a Medellín sería mentir, y el error
                aparecería recién al intentar enviar. autoComplete="off": no hay un
                token estándar para "número de documento colombiano", y dejar que el
                navegador adivine autocompletaría con un dato que no es este. */}
            <div className="shipping-field">
              <label htmlFor="checkout-doc">
                {esEnvioLocal(form.city)
                  ? "Número de documento (opcional)"
                  : "Número de documento"}
              </label>
              <input
                id="checkout-doc"
                type="text"
                autoComplete="off"
                inputMode="numeric"
                maxLength={20}
                placeholder="Este dato solo es necesario para envíos fuera de Barranquilla"
                value={form.doc}
                onChange={(e) => set("doc", onlyDigits(e.target.value, 20))}
              />
              <div className="field-error">{errors.doc || ""}</div>
            </div>
          </div>
        </div>

        {/* La política se abre en otra pestaña: el checkout es un modal y sus datos viven
            solo en memoria, así que navegar fuera para leerla haría perder lo escrito. */}
        <div className="consent-fields">
          <label className="consent-check">
            <input
              type="checkbox"
              checked={aceptaDatos}
              onChange={(e) => {
                setAceptaDatos(e.target.checked);
                if (e.target.checked) setErrors((er) => ({ ...er, datos: undefined }));
              }}
              aria-describedby="checkout-datos-error"
            />
            <span>
              Autorizo a Baqtime a tratar mis datos personales para gestionar y entregar mi
              pedido, según la{" "}
              <a href={POLITICA_DATOS_RUTA} target="_blank" rel="noopener">
                Política de Tratamiento de Datos
              </a>
              .
            </span>
          </label>
          <div className="field-error" id="checkout-datos-error">
            {errors.datos || ""}
          </div>

          <label className="consent-check">
            <input
              type="checkbox"
              checked={aceptaPromos}
              onChange={(e) => setAceptaPromos(e.target.checked)}
            />
            <span>Quiero recibir novedades y promociones de Baqtime (opcional).</span>
          </label>
        </div>

        {errorEnvio && (
          <div className="field-error" role="alert" style={{ marginBottom: "10px" }}>
            {errorEnvio}
          </div>
        )}

        <button className="whatsapp-btn" onClick={handleSend} disabled={enviando}>
          {enviando ? "Guardando tu pedido…" : "Confirmar pedido"}
        </button>
        <div className="req-note"></div>
      </div>
    </div>
  );
}
