import { useCart } from "../../lib/useCart.js";

// Isla pequeñísima: solo el botón del carrito del encabezado con su contador.
// Es una isla aparte (y no parte de ShopApp) porque vive dentro del <header>,
// que es un componente Astro estático.
export default function CartBadge() {
  const items = useCart();
  return (
    <button
      type="button"
      className="cart-icon-btn"
      aria-label="Ver carrito"
      onClick={() => window.dispatchEvent(new CustomEvent("baqtime:toggle-cart"))}
    >
      🛒 <span className={"cart-count" + (items.length === 0 ? " hidden" : "")}>{items.length}</span>
    </button>
  );
}
