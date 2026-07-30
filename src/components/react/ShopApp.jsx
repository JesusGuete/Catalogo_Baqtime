import { useEffect, useState } from "react";
import CatalogExplorer from "./CatalogExplorer.jsx";
import ProductView from "./ProductView.jsx";
import CartPanel from "./CartPanel.jsx";
import Checkout from "./Checkout.jsx";
import { useCart } from "../../lib/useCart.js";

// Isla principal de la tienda. Junta catálogo + vista de producto + carrito +
// checkout porque los cuatro comparten estado (qué producto está abierto, qué hay
// en el carrito, qué panel está visible). En la versión vanilla ese estado vivía
// repartido entre state.js y clases CSS en el DOM.
export default function ShopApp() {
  const items = useCart();
  const [openProduct, setOpenProduct] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // El botón del carrito vive en el encabezado (isla CartBadge, aparte), así que
  // pide abrir el panel mediante un evento, igual que el carrusel de colecciones.
  useEffect(() => {
    function onToggleCart() {
      setCartOpen((v) => !v);
    }
    window.addEventListener("baqtime:toggle-cart", onToggleCart);
    return () => window.removeEventListener("baqtime:toggle-cart", onToggleCart);
  }, []);

  return (
    <>
      <CatalogExplorer onOpenProduct={setOpenProduct} />

      {openProduct && (
        <ProductView
          product={openProduct}
          onClose={() => setOpenProduct(null)}
          onOpenProduct={setOpenProduct}
        />
      )}

      {cartOpen && (
        <CartPanel
          items={items}
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            setCartOpen(false);
            setCheckoutOpen(true);
          }}
        />
      )}

      {checkoutOpen && <Checkout items={items} onClose={() => setCheckoutOpen(false)} />}
    </>
  );
}
