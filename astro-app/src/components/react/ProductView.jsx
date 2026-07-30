import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG_MOCK, IMPORTED_CATEGORIES } from "../../lib/mock-catalog.js";
import { initialsColorsFor } from "../../lib/initials.js";
import { PRICE_EXTRA_INITIALS, PRICE_SHIP, fmt } from "../../lib/pricing.js";
import { addToCart } from "../../lib/cart-store.js";

// Portado desde assets/js/site/product-modal.js.
// Mismas clases CSS que index.html (.modal-overlay/.modal), así que el diseño de
// "página completa" que ya tienes en site.css se aplica igual.
//
// PENDIENTE a propósito (Fase 4 del plan): la URL compartible ?producto=t1 y la
// sincronía con el botón atrás del navegador. En la Fase 4 esto deja de ser un
// modal y pasa a ser una página real /producto/[slug], así que implementar ahora
// el ?producto= sería trabajo que se bota.
export default function ProductView({ product, onClose, onOpenProduct }) {
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

  // Con datos mock cada producto tiene una sola foto. Cuando lleguen las fotos
  // reales de Supabase esto pasa a ser product.gallery (varias imágenes).
  const photos = product.gallery && product.gallery.length ? product.gallery : [product.img];

  // Opciones de color: solo para categorías distintas de tote (el tote usa variantes
  // de cordones, no colores sueltos). Portado de openModal().
  const colorOptions = useMemo(() => {
    if (product.category === "tote") return [];
    const sameCategory = CATALOG_MOCK.filter((p) => p.category === product.category);
    const unique = [];
    sameCategory.forEach((p) => {
      if (!unique.find((u) => u.groupKey === p.groupKey)) unique.push(p);
    });
    return unique.length > 1 ? unique : [];
  }, [product]);

  // "También te puede interesar": mismo color, categoría distinta.
  const related = useMemo(
    () => CATALOG_MOCK.filter((p) => p.groupKey === product.groupKey && p.category !== product.category),
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

  return (
    <>
      <div
        className="modal-overlay open"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal" role="dialog" aria-modal="true" aria-label={product.name}>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
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
            <h2>{`${product.name}${sub}`}</h2>
            <div className="price-live mono">{fmt(product.price)}</div>

            {colorOptions.length > 0 && (
              <div className="field">
                <label>Opciones disponibles</label>
                <div className="swatches">
                  {colorOptions.map((p) => (
                    <div
                      key={p.id}
                      className={"swatch" + (p.groupKey === product.groupKey ? " selected" : "")}
                      style={{ "--swatch-color": p.hex }}
                      title={p.color}
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
                  <label>Color de las iniciales</label>
                  {initialsColors.length > 1 && (
                    <div className="swatches">
                      {initialsColors.map((c) => (
                        <div
                          key={c.name}
                          className={"swatch" + (initialsColor?.name === c.name ? " selected" : "")}
                          style={{ "--swatch-color": c.hex }}
                          title={c.name}
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
                <label>También te puede interesar</label>
                <div className="related-carousel">
                  <div className="related-viewport">
                    <div className="related-grid">
                      {related.map((p) => (
                        <div className="card" key={p.id} onClick={() => onOpenProduct(p)}>
                          <div className="card-img">
                            <img src={p.img} alt={p.name} loading="lazy" />
                          </div>
                          <div className="card-body">
                            <p className="card-name">{p.name}</p>
                            <p className="card-price mono">{fmt(p.price)}</p>
                          </div>
                        </div>
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
