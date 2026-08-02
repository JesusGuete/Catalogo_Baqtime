import { fmt, PRICE_SHIP, precioLinea, subtotalCarrito } from "../../lib/pricing.js";
import { removeFromCart } from "../../lib/cart-store.js";

// Detalle legible de una línea (color/variante + iniciales). Portado de lineDetail().
export function lineDetail(item) {
  const parts = [];
  if (item.variant) parts.push(item.variant);
  else if (item.color) parts.push(item.color);
  if (item.initials) parts.push(`Iniciales: ${item.initials} (${item.initialsColorName})`);
  return parts.join(" · ");
}

function lineImage(item, products) {
  const product = products.find((p) => p.id === item.productId);
  return product ? product.img : "/assets/img/placeholder.svg";
}

// Una línea del carrito. Se usa igual en el panel lateral y en el checkout,
// tal como hacía buildCartLineElement() en la versión vanilla.
export function CartLine({ item, products, categories = [] }) {
  // El precio NO sale de item.price: ese quedó congelado en localStorage cuando se agregó
  // el producto y puede tener días. Se recalcula contra el catálogo de ahora, que es lo
  // que el servidor va a cobrar. Ver precioLinea() en pricing.js.
  const { total, disponible } = precioLinea(item, products, categories);
  return (
    <div className="cart-line">
      <img className="cart-line-img" src={lineImage(item, products)} alt={item.name} />
      <div className="cart-line-body">
        <p className="cart-line-name">{item.name}</p>
        <p className="cart-line-detail">{lineDetail(item)}</p>
        {disponible ? (
          <p className="cart-line-price mono">{fmt(total)}</p>
        ) : (
          <p className="cart-line-price mono cart-line-agotado">
            Ya no está disponible · quitalo para continuar
          </p>
        )}
      </div>
      <button
        type="button"
        className="cart-line-remove"
        onClick={() => removeFromCart(item.id)}
        aria-label="Quitar del carrito"
      >
        ×
      </button>
    </div>
  );
}

// Los 3 totales (subtotal / envío / total). El envío se cobra una sola vez
// sobre todo el carrito, y solo si hay algo dentro.
export function CartTotals({ items, products = [], categories = [] }) {
  const subtotal = subtotalCarrito(items, products, categories);
  const shipping = items.length ? PRICE_SHIP : 0;
  return (
    <>
      <div className="cart-total-row">
        <span>Subtotal</span>
        <span className="mono">{fmt(subtotal)}</span>
      </div>
      <div className="cart-total-row cart-total-row-sub">
        <span>Envío</span>
        <span className="mono">{fmt(shipping)}</span>
      </div>
      <div className="cart-total-row cart-total-row-final">
        <span>Total</span>
        <span className="mono">{fmt(subtotal + shipping)}</span>
      </div>
    </>
  );
}

// Panel lateral: vistazo rápido (lista + totales + "Finalizar compra").
export default function CartPanel({ items, products, categories = [], onClose, onCheckout }) {
  return (
    <div className="cart-panel">
      <div className="cart-panel-head">
        <h3>Tu carrito</h3>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar carrito">
          ✕
        </button>
      </div>
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
      {items.length > 0 && (
        <button className="whatsapp-btn" onClick={onCheckout}>
          Finalizar compra
        </button>
      )}
    </div>
  );
}
