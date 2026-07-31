import { useEffect, useState } from "react";
import CatalogExplorer from "./CatalogExplorer.jsx";
import ProductView from "./ProductView.jsx";
import CartPanel from "./CartPanel.jsx";
import Checkout from "./Checkout.jsx";
import { useCart } from "../../lib/useCart.js";
import { rutaProducto } from "../../lib/product-url.ts";

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
  // Dos modos: la portada (catálogo, y el producto se abre encima) y /producto/[slug]
  // (el producto ES la página).
  const isProductPage = Boolean(initialProductId);
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
      {/* En /producto/[slug] el catálogo no se renderiza. `.modal-overlay` tiene fondo
          crema opaco a pantalla completa, así que la grilla quedaba tapada al 100%:
          eran ~80 KB de HTML que ningún visitante llegaba a ver nunca, repetidos igual
          en las 32 páginas de producto. Para un buscador, 32 páginas casi idénticas son
          candidatas a que elija una sola canónica y descarte el resto. */}
      {!isProductPage && (
        <CatalogExplorer catalog={catalog} onOpenProduct={setOpenProduct} />
      )}

      {openProduct && (
        <ProductView
          catalog={catalog}
          product={openProduct}
          isProductPage={isProductPage}
          onClose={() => {
            // Si esta página ES la del producto, cerrar tiene que devolver al catálogo.
            // Solo ocultar el modal dejaría la URL diciendo /producto/x sobre una grilla.
            if (isProductPage) {
              window.location.href = "/";
              return;
            }
            setOpenProduct(null);
          }}
          // Cambiar de producto en la portada es cambiar de estado; en /producto/[slug]
          // es cambiar de página. Antes era estado en los dos casos, así que elegir otro
          // color o un relacionado dejaba la URL nombrando el producto anterior.
          onOpenProduct={
            isProductPage
              ? (p) => {
                  window.location.href = rutaProducto(p);
                }
              : setOpenProduct
          }
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
