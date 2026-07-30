import { useEffect, useState } from "react";
import { CartLine, CartTotals } from "./CartPanel.jsx";
import { getCartSubtotal, clearCart } from "../../lib/cart-store.js";
import { validateShipping, onlyDigits, onlyLetters } from "../../lib/shipping-validation.js";
import { buildCartMessage, whatsappUrl } from "../../lib/whatsapp.js";

const EMPTY = { name: "", city: "", address: "", phone: "", doc: "" };

// Página completa de "Finalizar compra" — portada desde #checkoutOverlay en
// index.html + sendCartWhatsapp() en cart.js. Mismo markup/clases, mismos textos
// de error, mismo orden de campos.
export default function Checkout({ items, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

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

  function handleSend() {
    if (!items.length) return;
    const found = validateShipping(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const message = buildCartMessage(items, form, getCartSubtotal(items));
    // Se limpia el carrito ANTES de salir del sitio: una vez que el navegador
    // se va a WhatsApp, el código de esta página ya no vuelve a correr.
    clearCart();
    window.location.href = whatsappUrl(message);
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
            items.map((item) => <CartLine key={item.id} item={item} />)
          )}
        </div>

        <CartTotals items={items} />

        <div className="field cart-shipping-field">
          <label>Datos de envío</label>
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

            <input
              type="text"
              placeholder="Número de documento (opcional)"
              aria-label="Número de documento (opcional)"
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

        <button className="whatsapp-btn" onClick={handleSend}>
          Enviar pedido por WhatsApp
        </button>
        <div className="req-note"></div>
      </div>
    </div>
  );
}
