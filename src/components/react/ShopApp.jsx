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

  // "ATRÁS" EN UNA PÁGINA DE PRODUCTO NO DEBERÍA SACAR DE LA TIENDA.
  //
  // /producto/[slug] es una página de verdad, así que el botón del navegador hace lo
  // suyo: volver a la entrada anterior del historial. El problema es a quién le pasa
  // eso. Los enlaces de producto se mandan por WhatsApp, o los encuentra Google: para
  // esa visita la ficha es la PRIMERA página, no hay entrada anterior del sitio, y
  // "atrás" la devuelve al chat o al buscador sin haber visto nunca el catálogo.
  //
  // Solo se toca ese caso. Si llegó desde el catálogo, "atrás" ya lo devuelve ahí —y
  // conservando la posición del scroll, que es mejor de lo que se puede imitar acá.
  //
  // Cómo: se agrega una entrada extra al historial al abrir. "Atrás" cae en ella, se
  // escucha el `popstate` y se manda a la portada. La URL no cambia (pushState sin
  // tercer argumento), así que compartir el enlace sigue funcionando igual.
  useEffect(() => {
    if (!isProductPage) return;

    let vieneDeFuera = true;
    try {
      // Sin referrer (enlace pegado a mano, WhatsApp, un QR) también cuenta como fuera.
      vieneDeFuera =
        !document.referrer ||
        new URL(document.referrer).origin !== window.location.origin;
    } catch {
      // Un referrer con formato raro no debería romper la página entera.
      vieneDeFuera = true;
    }
    if (!vieneDeFuera) return;

    history.pushState({ baqtimeAtras: true }, "");
    function alVolver() {
      window.location.href = "/";
    }
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [isProductPage]);

  // LA FICHA ABIERTA SOBRE LA PORTADA TAMBIÉN ES UNA "PÁGINA" PARA EL VISITANTE.
  //
  // En la portada, abrir un producto no cambia la URL: es un modal encima de la grilla.
  // Para el navegador no pasó nada, así que "atrás" hace lo único que puede —salir del
  // sitio— cuando lo que el cliente esperaba era volver al catálogo. Peor todavía en
  // celular, donde "atrás" es el gesto principal para cerrar cualquier cosa.
  //
  // Se arregla dándole a la ficha su propia entrada de historial al abrirse. Se empuja
  // solo al ABRIR desde la grilla (`!openProduct`): cambiar de color o saltar a un
  // relacionado con la ficha ya abierta no apila entradas, así que un solo "atrás"
  // siempre cierra, sin importar cuántos productos haya mirado el cliente por dentro.
  function abrirProducto(p) {
    if (!isProductPage && !openProduct) {
      history.pushState({ baqtimeFicha: true }, "");
    }
    setOpenProduct(p);
  }

  function cerrarProducto() {
    // Si esta página ES la del producto, cerrar tiene que devolver al catálogo. Solo
    // ocultar el modal dejaría la URL diciendo /producto/x sobre una grilla.
    if (isProductPage) {
      window.location.href = "/";
      return;
    }
    // Cerrar con la ✕ consume la entrada que agregamos, en vez de dejarla suelta: si no,
    // el siguiente "atrás" se gastaría en una entrada que ya no muestra nada distinto y
    // parecería que el botón no funciona.
    if (history.state?.baqtimeFicha) {
      history.back();
      return;
    }
    setOpenProduct(null);
  }

  useEffect(() => {
    if (isProductPage) return;
    function alVolver() {
      // Se cierra TODO lo que está encima del catálogo, no solo la ficha. El checkout se
      // abre sobre ella sin cerrarla, así que cerrar únicamente la ficha dejaría el
      // formulario de envío flotando sobre la grilla, sin el producto que lo explicaba.
      // "Atrás" significa una sola cosa acá: volver al catálogo.
      setOpenProduct(null);
      setCheckoutOpen(false);
      setCartOpen(false);
    }
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, [isProductPage]);

  return (
    <>
      {/* En /producto/[slug] el catálogo no se renderiza. `.modal-overlay` tiene fondo
          crema opaco a pantalla completa, así que la grilla quedaba tapada al 100%:
          eran ~80 KB de HTML que ningún visitante llegaba a ver nunca, repetidos igual
          en las 32 páginas de producto. Para un buscador, 32 páginas casi idénticas son
          candidatas a que elija una sola canónica y descarte el resto. */}
      {!isProductPage && (
        <CatalogExplorer catalog={catalog} onOpenProduct={abrirProducto} />
      )}

      {openProduct && (
        <ProductView
          catalog={catalog}
          product={openProduct}
          isProductPage={isProductPage}
          onClose={cerrarProducto}
          // Cambiar de producto en la portada es cambiar de estado; en /producto/[slug]
          // es cambiar de página. Antes era estado en los dos casos, así que elegir otro
          // color o un relacionado dejaba la URL nombrando el producto anterior.
          onOpenProduct={
            isProductPage
              ? (p) => {
                  window.location.href = rutaProducto(p);
                }
              : abrirProducto
          }
          // El checkout se abre ENCIMA de la ficha, sin cerrarla: al volver, el cliente
          // sigue en el producto que estaba mirando. Cerrarla no es opción en
          // /producto/[slug], donde cerrar significa irse a la portada.
          onCheckout={() => setCheckoutOpen(true)}
        />
      )}

      {cartOpen && (
        <CartPanel
          items={items}
          products={catalog.products}
          categories={catalog.categories}
          onClose={() => setCartOpen(false)}
          onCheckout={() => {
            setCartOpen(false);
            setCheckoutOpen(true);
          }}
        />
      )}

      {checkoutOpen && (
        <Checkout
          items={items}
          products={catalog.products}
          categories={catalog.categories}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </>
  );
}
