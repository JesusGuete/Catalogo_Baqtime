import { useEffect, useMemo, useRef, useState } from "react";
import { initialsColorsFor } from "../../lib/initials.js";
import { PRICE_EXTRA_INITIALS, PRICE_SHIP, fmt } from "../../lib/pricing.js";
import { addToCart } from "../../lib/cart-store.js";
import { useCart } from "../../lib/useCart.js";
import { rutaProducto } from "../../lib/product-url.ts";

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
  isProductPage = false,
}) {
  const Title = isProductPage ? "h1" : "h2";
  const { products: CATALOG, IMPORTED_CATEGORIES } = catalog;
  const cartItems = useCart();
  const initialsColors = useMemo(() => initialsColorsFor(product), [product]);
  const [initials, setInitials] = useState("");
  const [initialsColor, setInitialsColor] = useState(initialsColors[0]);
  const [addedMsg, setAddedMsg] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const addedTimer = useRef(null);

  // Al cambiar de producto (ej. clic en un color o en un relacionado) se reinicia
  // la configuración, igual que hacía openModal().
  useEffect(() => {
    setInitials("");
    setInitialsColor(initialsColorsFor(product)[0]);
    setAddedMsg("");
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
  const extra = product.category === "tote" && count > 3 ? PRICE_EXTRA_INITIALS : 0;
  const total = product.price + extra + PRICE_SHIP;
  const sub = product.category === "tote" ? ` – ${product.variant}` : "";

  function handleInitialsChange(e) {
    const max = product.maxInitials || 7;
    setInitials(e.target.value.toUpperCase().replace(/[^A-ZÑ]/g, "").slice(0, max));
  }

  function handleAddToCart() {
    addToCart({
      productId: product.id,
      name: product.name,
      category: product.category,
      color: product.color,
      variant: product.variant,
      initials: product.personalizable ? initials : "",
      initialsColorName: initialsColor ? initialsColor.name : "",
      price: product.price,
      extra,
    });
    setAddedMsg("Agregado al carrito ✓");
    clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedMsg(""), 2500);
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
            🛒 <span className={"cart-count" + (cartItems.length === 0 ? " hidden" : "")}>{cartItems.length}</span>
          </button>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label={isProductPage ? "Volver a la tienda" : "Cerrar"}
          >
            ✕
          </button>

          <div className="modal-gallery">
            <div className="gallery-main" onClick={() => setZoomOpen(true)}>
              <div className="gallery-slides">
                {photos.map((src, i) => (
                  <img key={i} src={src} alt={product.name} />
                ))}
              </div>
            </div>
            <div className="zoom-hint">Toca la imagen para ampliarla</div>
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

            {product.personalizable && (
              <div>
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
                  <div className={"initials-count mono" + (product.category === "tote" && count > 3 ? " warn" : "")}>
                    {product.category === "tote"
                      ? `${count} / 7 · hasta 3 incluidas`
                      : `${count} / ${product.maxInitials}`}
                  </div>
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
            <div className="req-note">{addedMsg}</div>
          </div>
        </div>
      </div>

      {zoomOpen && (
        <div className="zoom-overlay open" onClick={() => setZoomOpen(false)}>
          <button className="zoom-close" onClick={() => setZoomOpen(false)} aria-label="Cerrar zoom">
            ✕
          </button>
          <img src={photos[0]} alt={product.name} />
        </div>
      )}
    </>
  );
}
