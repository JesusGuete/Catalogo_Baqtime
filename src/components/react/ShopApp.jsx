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
/**
 * @param {{
 *   catalog: import("../../lib/catalog").Catalogo,
 *   initialProductId?: string | null,
 * }} props
 */
export default function ShopApp({ catalog, initialProductId = null }) {
  const items = useCart();
  // En /producto/[slug] la isla arranca con ese producto ya abierto. Astro renderiza
  // esto en el servidor, así que el nombre, el precio y las fotos salen dentro del HTML
  // y un buscador los ve sin ejecutar JavaScript.
  const [openProduct, setOpenProduct] = useState(
    () => catalog.products.find((p) => p.id === initialProductId) ?? null
  );
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
      <CatalogExplorer catalog={catalog} onOpenProduct={setOpenProduct} />

      {openProduct && (
        <ProductView
          catalog={catalog}
          product={openProduct}
          onClose={() => {
            // Si esta página ES la del producto, cerrar tiene que devolver al catálogo.
            // Solo ocultar el modal dejaría la URL diciendo /producto/x sobre una grilla.
            if (initialProductId) {
              window.location.href = "/";
              return;
            }
            setOpenProduct(null);
          }}
          onOpenProduct={setOpenProduct}
        />
      )}

      {cartOpen && (
        <CartPanel
          items={items}
          products={catalog.products}
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            setCartOpen(false);
            setCheckoutOpen(true);
          }}
        />
      )}

      {checkoutOpen && (
        <Checkout items={items} products={catalog.products} onClose={() => setCheckoutOpen(false)} />
      )}
    </>
  );
}
