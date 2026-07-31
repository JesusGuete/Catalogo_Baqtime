import { fmt, PRICE_SHIP } from "../../lib/pricing.js";
import { removeFromCart, getCartSubtotal } from "../../lib/cart-store.js";

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
export function CartLine({ item, products }) {
  return (
    <div className="cart-line">
      <img className="cart-line-img" src={lineImage(item, products)} alt={item.name} />
      <div className="cart-line-body">
        <p className="cart-line-name">{item.name}</p>
        <p className="cart-line-detail">{lineDetail(item)}</p>
        <p className="cart-line-price mono">{fmt(item.price + item.extra)}</p>
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
export function CartTotals({ items }) {
  const subtotal = getCartSubtotal(items);
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
export default function CartPanel({ items, products, onClose, onCheckout }) {
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
          items.map((item) => <CartLine key={item.id} item={item} products={products} />)
        )}
      </div>
      <CartTotals items={items} />
      {items.length > 0 && (
        <button className="whatsapp-btn" onClick={onCheckout}>
          Finalizar compra
        </button>
      )}
    </div>
  );
}
