import { useEffect, useMemo, useRef, useState } from "react";
import { initialsColorsFor } from "../../lib/initials.js";
import { PRICE_SHIP, fmt, recargoIniciales } from "../../lib/pricing.js";
import { addToCart } from "../../lib/cart-store.js";
import { useCart } from "../../lib/useCart.js";
import { rutaProducto } from "../../lib/product-url.ts";
import { IconoBolsa } from "./Iconos.jsx";

// Portado desde assets/js/site/product-modal.js.
// Mismas clases CSS que index.html (.modal-overlay/.modal), así que el diseño de
// "página completa" que ya tienes en site.css se aplica igual.
//
// El mismo componente cubre dos situaciones: el modal que se abre sobre el catálogo y
// la página propia del producto. `isProductPage` distingue cuál de las dos es, porque
// el encabezado no puede ser el mismo en ambas: en la página, el nombre del producto es
// el tema de la página y va en <h1>; sobre el catálogo, el <h1> ya lo ocupa el Hero y
// esto es contenido subordinado.
export default function ProductView({
  catalog,
  product,
  onClose,
  onOpenProduct,
  onCheckout,
  isProductPage = false,
}) {
  const Title = isProductPage ? "h1" : "h2";
  const { products: CATALOG, IMPORTED_CATEGORIES, categories, initialsColors: paleta } = catalog;
  // La categoría del producto trae las reglas de bordado (free_initials,
  // extra_initials_price, initials_palette) que el dueño edita desde el panel.
  const categoria = useMemo(
    () => categories.find((c) => c.key === product.category),
    [categories, product]
  );
  const cartItems = useCart();
  const initialsColors = useMemo(
    () => initialsColorsFor(paleta, categoria, product),
    [paleta, categoria, product]
  );
  const [initials, setInitials] = useState("");
  const [initialsColor, setInitialsColor] = useState(initialsColors[0]);
  const [addedMsg, setAddedMsg] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const [fotoActiva, setFotoActiva] = useState(0);
  const addedTimer = useRef(null);
  const slidesRef = useRef(null);

  // Al cambiar de producto (ej. clic en un color o en un relacionado) se reinicia
  // la configuración, igual que hacía openModal().
  // `initialsColors` y no `product`: la paleta también cambia cuando el dueño agrega o
  // quita un color desde el panel, y el color elegido tiene que volver a uno que siga
  // existiendo. Con `[product]` se quedaba seleccionado un color ya borrado.
  useEffect(() => {
    setInitials("");
    setInitialsColor(initialsColors[0]);
    setAddedMsg("");
  }, [product, initialsColors]);

  // Al cambiar de producto la galería vuelve a la primera foto. Aparte del efecto de
  // arriba y no dentro: aquel también corre cuando cambia la paleta de bordado, y eso no
  // tiene por qué mover la foto que el cliente está mirando.
  //
  // `behavior: "auto"` a propósito: es un producto distinto, no hay nada que animar, y
  // "smooth" mostraría un barrido por fotos del producto anterior.
  useEffect(() => {
    setFotoActiva(0);
    slidesRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }, [product]);

  // Bloquea el scroll del fondo mientras la vista está abierta, y cierra con Escape.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (zoomOpen) setZoomOpen(false);
      else onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, zoomOpen]);

  useEffect(() => () => clearTimeout(addedTimer.current), []);

  const photos = product.gallery && product.gallery.length ? product.gallery : [product.img];

  /**
   * Qué foto se está viendo. Se mueve desde tres lados —flechas, miniaturas y el dedo en
   * el celular— y la fuente de verdad es el scroll: `alDesplazar` lo recalcula pase lo
   * que pase, así que los tres caminos terminan de acuerdo.
   */
  function irAFoto(i) {
    const cont = slidesRef.current;
    const destino = Math.max(0, Math.min(i, photos.length - 1));
    setFotoActiva(destino);
    // `scrollTo` con behavior smooth dispara varios eventos de scroll: no pasa nada,
    // alDesplazar recalcula el mismo índice cada vez.
    cont?.scrollTo({ left: cont.clientWidth * destino, behavior: "smooth" });
  }

  function alDesplazar(e) {
    const cont = e.currentTarget;
    // `clientWidth` y no un ancho fijo: cada slide mide 100% del contenedor (flex:0 0 100%
    // en site.css), así que esta división vale igual en un celular que en un monitor.
    if (cont.clientWidth === 0) return;
    const i = Math.round(cont.scrollLeft / cont.clientWidth);
    setFotoActiva((actual) => (i !== actual ? i : actual));
  }

  // Opciones de color: solo para categorías distintas de tote (el tote usa variantes
  // de cordones, no colores sueltos). Portado de openModal().
  const colorOptions = useMemo(() => {
    if (product.category === "tote") return [];
    const sameCategory = CATALOG.filter((p) => p.category === product.category);
    const unique = [];
    sameCategory.forEach((p) => {
      if (!unique.find((u) => u.groupKey === p.groupKey)) unique.push(p);
    });
    return unique.length > 1 ? unique : [];
  }, [product]);

  // "También te puede interesar": mismo color, categoría distinta.
  const related = useMemo(
    () => CATALOG.filter((p) => p.groupKey === product.groupKey && p.category !== product.category),
    [product]
  );

  const count = initials.length;
  // Antes: `product.category === "tote" && count > 3 ? 10000 : 0`, con la regla escrita a
  // mano acá. Ahora sale de la categoría, que es lo que el panel edita y —esto es lo
  // importante— lo mismo que recalcula el servidor al guardar el pedido. Ver
  // recargoIniciales() en pricing.js.
  const extra = recargoIniciales(categoria, count);
  const total = product.price + extra + PRICE_SHIP;
  const sub = product.category === "tote" ? ` – ${product.variant}` : "";

  function handleInitialsChange(e) {
    const max = product.maxInitials || 7;
    setInitials(e.target.value.toUpperCase().replace(/[^A-ZÑ]/g, "").slice(0, max));
  }

  /** La línea del carrito para lo que está configurado en pantalla ahora mismo. */
  function lineaActual() {
    return {
      productId: product.id,
      name: product.name,
      category: product.category,
      color: product.color,
      variant: product.variant,
      initials: product.personalizable ? initials : "",
      initialsColorName: initialsColor ? initialsColor.name : "",
      price: product.price,
      extra,
    };
  }

  function handleAddToCart() {
    addToCart(lineaActual());
    setAddedMsg("Agregado al carrito ✓");
    clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedMsg(""), 2500);
  }

  /**
   * "Finalizar compra" desde la ficha del producto: lo suma al carrito y abre el checkout.
   *
   * El carrito permite líneas repetidas a propósito (dos totes iguales con iniciales
   * distintas, cart-store.js), así que "Agregar al carrito" nunca deduplica. Acá SÍ, y
   * solo acá: el camino típico es tocar "Agregar al carrito" y después "Finalizar
   * compra", y sin esta comprobación el cliente terminaría pagando el mismo bolso dos
   * veces sin haberlo pedido. Se compara la configuración completa —producto, iniciales y
   * color de bordado—, así que dos totes iguales con iniciales distintas siguen siendo
   * dos líneas.
   */
  function handleFinalizarCompra() {
    const linea = lineaActual();
    const yaEstaIgual = cartItems.some(
      (i) =>
        i.productId === linea.productId &&
        (i.initials || "") === (linea.initials || "") &&
        (i.initialsColorName || "") === (linea.initialsColorName || "")
    );
    if (!yaEstaIgual) addToCart(linea);
    if (onCheckout) onCheckout();
  }

  const initialsLabel =
    product.category === "neceser"
      ? "Tus iniciales (máximo 2 letras)"
      : `Tus iniciales (máx. ${product.maxInitials})`;

  // `aria-modal` le dice al lector de pantalla que todo lo demás de la página está
  // inerte. En /producto/[slug] esto no está encima de nada: es el contenido de la
  // página, y declararlo diálogo esconde el Header y el Footer sin razón.
  const dialogProps = isProductPage
    ? {}
    : { role: "dialog", "aria-modal": "true", "aria-label": product.name };

  return (
    <>
      <div
        className="modal-overlay open"
        onClick={(e) => {
          // Clic en el fondo cierra solo cuando esto es un modal. En la página propia
          // del producto no hay nada que cerrar, y navegar porque alguien tocó un
          // margen vacío es una salida que nadie pidió.
          if (!isProductPage && e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal" {...dialogProps}>
          <button
            type="button"
            className="cart-icon-btn-modal"
            aria-label="Ver carrito"
            onClick={() => window.dispatchEvent(new CustomEvent("baqtime:toggle-cart"))}
          >
            {/* El mismo <IconoBolsa /> del encabezado. Antes acá había un emoji 🛒: cada
                sistema operativo lo dibuja distinto, así que el carrito de la ficha no
                coincidía con el de la barra ni seguía el color de la marca. */}
            <IconoBolsa />
            <span className={"cart-count" + (cartItems.length === 0 ? " hidden" : "")}>{cartItems.length}</span>
          </button>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={isProductPage ? "Volver a la tienda" : "Cerrar"}
          >
            ✕
          </button>

          <div className="modal-gallery">
            {/* MINIATURAS Y FLECHAS. La tira de fotos siempre existió, pero era solo un
                contenedor con scroll horizontal y la barra oculta: en un celular se pasa
                con el dedo y se descubre sola; en un computador con mouse no hay gesto ni
                control, así que el cliente veía UNA foto y creía que era la única. Las
                clases .gallery-arrow y .gallery-thumbs ya estaban escritas en site.css
                desde el diseño original, sin nadie que las usara. */}
            <div className="gallery-visor">
              {photos.length > 1 && (
                <div className="gallery-thumbs">
                  {photos.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`${product.name} — foto ${i + 1} de ${photos.length}`}
                      className={i === fotoActiva ? "active" : ""}
                      onClick={() => irAFoto(i)}
                    />
                  ))}
                </div>
              )}

              <div className="gallery-main">
                {/* El scroll manda sobre el índice y no al revés: en el celular el dedo
                    mueve la tira sin pasar por irAFoto(), y si el índice no siguiera al
                    scroll la miniatura marcada se quedaría en la foto anterior. */}
                <div className="gallery-slides" ref={slidesRef} onScroll={alDesplazar}>
                  {photos.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={product.name}
                      onClick={() => setZoomOpen(true)}
                    />
                  ))}
                </div>

                {photos.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="gallery-arrow gallery-arrow-left"
                      onClick={() => irAFoto(fotoActiva - 1)}
                      disabled={fotoActiva === 0}
                      aria-label="Foto anterior"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="gallery-arrow gallery-arrow-right"
                      onClick={() => irAFoto(fotoActiva + 1)}
                      disabled={fotoActiva === photos.length - 1}
                      aria-label="Foto siguiente"
                    >
                      ›
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* Solo el contador. La frase "toca la imagen para ampliarla" se quitó: con
                miniaturas y flechas a la vista, el pie ya no tiene que explicar nada. */}
            {photos.length > 1 && (
              <div className="zoom-hint">
                {fotoActiva + 1} / {photos.length}
              </div>
            )}
          </div>

          <div className="modal-info">
            <Title>{`${product.name}${sub}`}</Title>
            <div className="price-live mono">{fmt(product.price)}</div>

            {colorOptions.length > 0 && (
              <div className="field">
                {/* No es un <label>: un label describe UN control, y esto encabeza un
                    grupo. Se anuncia con role="group" + aria-labelledby. */}
                <span className="field-label" id="pv-opciones">Opciones disponibles</span>
                <div className="swatches" role="group" aria-labelledby="pv-opciones">
                  {colorOptions.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className={"swatch" + (p.groupKey === product.groupKey ? " selected" : "")}
                      style={{ "--swatch-color": p.hex }}
                      // El color se transmitía solo por `title` y por el relleno. Sin
                      // texto accesible, un lector de pantalla anunciaba "botón" a secas.
                      aria-label={p.color}
                      aria-pressed={p.groupKey === product.groupKey}
                      onClick={() => onOpenProduct(p)}
                    />
                  ))}
                </div>
                <div className="initials-count mono">{product.color}</div>
              </div>
            )}

            {/* Las iniciales van PRIMERO y el color del bordado después. Con el orden al
                revés, la fila de colores quedaba pegada abajo del nombre del producto y
                encima del campo de texto: el cliente la leía como si fuera el color del
                bolso —que ya había elegido arriba, en "Opciones disponibles"— y no como
                el color del hilo. Poniéndola debajo del campo, se lee en el orden en que
                se decide: qué letras, y de qué color. */}
            {product.personalizable && (
              <div>
                <div className="field">
                  <label htmlFor="initialsInput">{initialsLabel}</label>
                  <input
                    id="initialsInput"
                    type="text"
                    className="initials-input"
                    placeholder="Ej. MM"
                    value={initials}
                    onChange={handleInitialsChange}
                  />
                  {/* También salía de la regla escrita a mano ("/ 7 · hasta 3 incluidas",
                      solo para tote). Ahora el aviso aparece en cualquier categoría que
                      tenga recargo configurado, con SUS números. */}
                  <div className={"initials-count mono" + (extra > 0 ? " warn" : "")}>
                    {categoria && categoria.extra_initials_price > 0
                      ? `${count} / ${product.maxInitials} · hasta ${categoria.free_initials} incluidas`
                      : `${count} / ${product.maxInitials}`}
                  </div>
                </div>

                <div className="field">
                  <span className="field-label" id="pv-color-iniciales">
                    Color de las iniciales
                  </span>
                  {initialsColors.length > 1 && (
                    <div className="swatches" role="group" aria-labelledby="pv-color-iniciales">
                      {initialsColors.map((c) => (
                        <button
                          type="button"
                          key={c.name}
                          className={"swatch" + (initialsColor?.name === c.name ? " selected" : "")}
                          style={{ "--swatch-color": c.hex }}
                          aria-label={c.name}
                          aria-pressed={initialsColor?.name === c.name}
                          onClick={() => setInitialsColor(c)}
                        />
                      ))}
                    </div>
                  )}
                  <div className="initials-count mono">{initialsColor?.name}</div>
                </div>
              </div>
            )}

            <div className="price-breakdown">
              <div className="price-row">
                <span>{product.name}</span>
                <span>{fmt(product.price)}</span>
              </div>
              {extra > 0 && (
                <div className="price-row">
                  <span>Personalización adicional (4–7 iniciales)</span>
                  <span>{fmt(extra)}</span>
                </div>
              )}
              <div className="price-row">
                <span>Envío</span>
                <span>{fmt(PRICE_SHIP)}</span>
              </div>
              <div className="price-row total">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
            </div>

            {IMPORTED_CATEGORIES.includes(product.category) && (
              <div className="advance-note">
                <strong>Este producto es importado y su entrega tarda entre 15 y 20 días.</strong>
              </div>
            )}

            {related.length > 0 && (
              <div className="related-products">
                <h3 className="field-label">También te puede interesar</h3>
                <div className="related-carousel">
                  <div className="related-viewport">
                    <div className="related-grid">
                      {related.map((p) => (
                        // Mismo criterio que las tarjetas del catálogo: un enlace de
                        // verdad, para que se pueda compartir y recorrer con teclado.
                        <a
                          className="card"
                          key={p.id}
                          href={rutaProducto(p)}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            e.preventDefault();
                            onOpenProduct(p);
                          }}
                        >
                          <div className="card-img">
                            <img src={p.img} alt={p.name} loading="lazy" />
                          </div>
                          <div className="card-body">
                            <p className="card-name">{p.name}</p>
                            <p className="card-price mono">{fmt(p.price)}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <button className="whatsapp-btn" onClick={handleAddToCart}>
              Agregar al carrito
            </button>
            <button className="finalizar-btn" onClick={handleFinalizarCompra}>
              Finalizar compra
            </button>
            <div className="req-note">{addedMsg}</div>
          </div>
        </div>
      </div>

      {zoomOpen && (
        <div className="zoom-overlay open" onClick={() => setZoomOpen(false)}>
          <button className="zoom-close" onClick={() => setZoomOpen(false)} aria-label="Cerrar zoom">
            ✕
          </button>
          {/* La que se está viendo, no `photos[0]`. Antes ampliaba siempre la primera:
              pasabas a la tercera foto, tocabas para ampliar y aparecía otra distinta. */}
          <img src={photos[fotoActiva]} alt={product.name} />
        </div>
      )}
    </>
  );
}
