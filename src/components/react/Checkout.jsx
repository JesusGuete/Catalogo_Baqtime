import { useEffect, useState } from "react";
import { CartLine, CartTotals } from "./CartPanel.jsx";
import { clearCart } from "../../lib/cart-store.js";
import {
  validateShipping,
  onlyDigits,
  onlyLetters,
  esEnvioLocal,
} from "../../lib/shipping-validation.js";

const EMPTY = { name: "", city: "", address: "", phone: "", doc: "" };

// Página completa de "Finalizar compra" — portada desde #checkoutOverlay en
// index.html + sendCartWhatsapp() en cart.js. Mismo markup/clases, mismos textos
// de error, mismo orden de campos.
export default function Checkout({ items, products, categories = [], onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");

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
            propio aria-label. */}
        <div
          className="field cart-shipping-field"
          role="group"
          aria-labelledby="checkout-envio"
        >
          <span className="field-label" id="checkout-envio">Datos de envío</span>
          <div className="shipping-fields">
            <input
              type="text"
              placeholder="Nombre completo"
              aria-label="Nombre completo"
              value={form.name}
              onChange={(e) => set("name", onlyLetters(e.target.value))}
            />
            <div className="field-error">{errors.name || ""}</div>

            <input
              type="text"
              placeholder="Ciudad"
              aria-label="Ciudad"
              value={form.city}
              onChange={(e) => set("city", onlyLetters(e.target.value))}
            />
            <div className="field-error">{errors.city || ""}</div>

            <input
              type="text"
              placeholder="Dirección exacta"
              aria-label="Dirección exacta"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
            <div className="field-error">{errors.address || ""}</div>

            <input
              type="tel"
              placeholder="Número de teléfono"
              aria-label="Número de teléfono"
              inputMode="numeric"
              maxLength={10}
              value={form.phone}
              onChange={(e) => set("phone", onlyDigits(e.target.value, 10))}
            />
            <div className="field-error">{errors.phone || ""}</div>

            {/* El texto del campo sigue a la ciudad que se está escribiendo: decir
                "(opcional)" mientras el envío va a Medellín sería mentir, y el error
                aparecería recién al intentar enviar. */}
            <input
              type="text"
              placeholder={
                esEnvioLocal(form.city)
                  ? "Número de documento (opcional)"
                  : "Número de documento"
              }
              aria-label={
                esEnvioLocal(form.city)
                  ? "Número de documento (opcional)"
                  : "Número de documento (obligatorio)"
              }
              inputMode="numeric"
              maxLength={20}
              value={form.doc}
              onChange={(e) => set("doc", onlyDigits(e.target.value, 20))}
            />
            <div className="field-error">{errors.doc || ""}</div>

            <div className="doc-hint">
              Este dato solo es necesario para envíos fuera de Barranquilla.
            </div>
          </div>
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
