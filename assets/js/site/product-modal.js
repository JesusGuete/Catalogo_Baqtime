import { state } from './state.js';
import { ALL_PRODUCTS, IMPORTED_CATEGORIES } from './catalog-data.js';
import { INITIALS_COLORS, initialsColorsFor } from './initials.js';
import { PRICE_EXTRA_INITIALS, PRICE_SHIP, fmt } from './pricing.js';
import { resolveProductImage, resolveImageUrl } from './site-images.js';
import { escapeHtml } from '../shared/escape.js';
import { addToCart } from './cart.js';

const modalOverlay = document.getElementById('modalOverlay');
const zoomOverlay = document.getElementById('zoomOverlay');

// ===== URL del producto abierto (deep-link compartible, ver §Fase C) =====
// No es una página aparte: sigue siendo el mismo modal de siempre, pero ahora la URL
// refleja qué producto está abierto, así que se puede copiar el link, compartirlo, o
// abrirlo en una pestaña nueva (clic derecho) y llega directo a ese producto.
function getProductIdFromUrl(){
  return new URLSearchParams(window.location.search).get('producto');
}
function setProductUrl(id, replace){
  const url = `${window.location.pathname}?producto=${encodeURIComponent(id)}`;
  if(replace) history.replaceState({}, '', url);
  else history.pushState({}, '', url);
}
function clearProductUrl(replace){
  const url = window.location.pathname;
  if(replace) history.replaceState({}, '', url);
  else history.pushState({}, '', url);
}

// Si la página cargó con ?producto=xxx en la URL, abre ese producto. Se llama desde
// main.js después de que Firebase ya enriqueció ALL_PRODUCTS (fotos/precio reales),
// para no mostrarle a quien abre un link compartido una versión desactualizada.
export function openProductFromUrl(){
  const id = getProductIdFromUrl();
  if(!id) return;
  const product = ALL_PRODUCTS.find(p=>p.id===id);
  if(product) openModal(product, { updateUrl:false });
}

export function galleryFor(product){
  if(product.gallery) return product.gallery.map(img=>({img, product}));
  return [{img:product.img, product}];
}

// ===== Carrusel de la foto principal: scroll nativo + scroll-snap, mismo mecanismo
// probado que el carrusel de colecciones y el de relacionados (ver esos archivos). =====
function slideStep(){
  const slidesEl = document.getElementById('gallerySlides');
  const first = slidesEl.firstElementChild;
  return first ? first.getBoundingClientRect().width : 0;
}
function currentSlideIndex(){
  const slidesEl = document.getElementById('gallerySlides');
  const step = slideStep();
  return step ? Math.round(slidesEl.scrollLeft / step) : 0;
}
function goToSlide(idx){
  document.getElementById('gallerySlides').scrollTo({ left: idx * slideStep(), behavior:'smooth' });
}
function updateGalleryArrows(){
  const slidesEl = document.getElementById('gallerySlides');
  const idx = currentSlideIndex();
  const count = slidesEl.children.length;
  document.getElementById('galleryPrevBtn').disabled = idx <= 0;
  document.getElementById('galleryNextBtn').disabled = idx >= count - 1;
  document.querySelectorAll('#galleryThumbs img').forEach((im,i)=> im.classList.toggle('active', i===idx));
}

export function openModal(product, { updateUrl = true } = {}){
  state.currentProduct = product;
  state.currentInitialsColor = INITIALS_COLORS[0];
  const sub = product.category==='tote' ? ` – ${product.variant}` : '';
  document.getElementById('modalTitle').textContent = `${product.name}${sub}`;

  // Galería principal (carrusel deslizable) + miniaturas
  const thumbs = galleryFor(product);
  const slidesEl = document.getElementById('gallerySlides');
  const thumbsEl = document.getElementById('galleryThumbs');
  slidesEl.innerHTML = '';
  thumbsEl.innerHTML = '';
  thumbs.forEach((t,idx)=>{
    const slideImg = document.createElement('img');
    slideImg.src = resolveImageUrl(t.img);
    slideImg.alt = product.name;
    slidesEl.appendChild(slideImg);

    const thumb = document.createElement('img');
    thumb.src = resolveImageUrl(t.img);
    thumb.className = idx===0 ? 'active' : '';
    thumb.onclick = ()=> goToSlide(idx);
    thumbsEl.appendChild(thumb);
  });
  slidesEl.scrollLeft = 0; // el producto cambió: siempre empieza en la primera foto
  updateGalleryArrows();

  // Opciones de color (solo aplica a Neceser y Bag Lumiere; Tote no tiene, ya que sus variantes son combinaciones de cordones)
  const optionsField = document.getElementById('optionsField');
  const optSwEl = document.getElementById('optionSwatches');
  const optColorNameEl = document.getElementById('optionColorName');
  optSwEl.innerHTML='';
  if(product.category !== 'tote'){
    const sameCategory = ALL_PRODUCTS.filter(p=>p.category===product.category);
    const uniqueColors = [];
    sameCategory.forEach(p=>{ if(!uniqueColors.find(u=>u.groupKey===p.groupKey)) uniqueColors.push(p); });
    if(uniqueColors.length>1){
      optionsField.classList.remove('hidden');
      optColorNameEl.textContent = product.color;
      uniqueColors.forEach(p=>{
        const sw = document.createElement('div');
        sw.className = 'swatch' + (p.groupKey===product.groupKey ? ' selected':'');
        sw.style.setProperty('--swatch-color', p.hex);
        sw.title = p.color;
        sw.onclick = ()=>{ openModal(p); };
        optSwEl.appendChild(sw);
      });
    } else {
      optionsField.classList.add('hidden');
    }
  } else {
    optionsField.classList.add('hidden');
  }

  // Bloque de personalización (iniciales)
  const personalizationBlock = document.getElementById('personalizationBlock');
  const initialsInput = document.getElementById('initialsInput');
  initialsInput.value = '';
  if(product.personalizable){
    personalizationBlock.classList.remove('hidden');
    initialsInput.setAttribute('maxlength', product.maxInitials);
    document.getElementById('initialsLabel').textContent = `Tus iniciales (máx. ${product.maxInitials})`;
    if(product.category==='neceser'){
      document.getElementById('initialsLabel').textContent = 'Tus iniciales (máximo 2 letras)';
    }
  } else {
    personalizationBlock.classList.add('hidden');
  }

  // Swatches de color de iniciales (Makeup Bag solo permite Plateado)
  const availableInitialsColors = initialsColorsFor(product);
  state.currentInitialsColor = availableInitialsColors[0];
  const swEl = document.getElementById('initialsColorSwatches');
  const colorNameEl = document.getElementById('initialsColorName');
  swEl.innerHTML='';
  colorNameEl.textContent = availableInitialsColors[0].name;
  swEl.classList.toggle('hidden', availableInitialsColors.length <= 1);
  availableInitialsColors.forEach((c,idx)=>{
    const sw = document.createElement('div');
    sw.className = 'swatch' + (idx===0?' selected':'');
    sw.style.setProperty('--swatch-color', c.hex);
    sw.title = c.name;
    sw.onclick = ()=>{
      state.currentInitialsColor = c;
      swEl.querySelectorAll('.swatch').forEach(s=>s.classList.remove('selected'));
      sw.classList.add('selected');
      colorNameEl.textContent = c.name;
      updatePreview();
    };
    swEl.appendChild(sw);
  });

  document.getElementById('cartAddMsg').textContent = '';

  renderRelatedProducts(product);
  if(updateUrl) setProductUrl(product.id);

  updatePreview();
  modalOverlay.classList.add('open');
  document.body.style.overflow='hidden';
}

// Productos que "combinan" con el que se está viendo: mismo color, categoría distinta
// (ej. viendo un Tote Vino, sugiere el Neceser Vino, la Cosmetiquera Vino, etc.).
function renderRelatedProducts(product){
  const related = ALL_PRODUCTS.filter(p=> p.groupKey===product.groupKey && p.category!==product.category);
  const section = document.getElementById('relatedProducts');
  const grid = document.getElementById('relatedGrid');
  const viewport = document.getElementById('relatedViewport');
  grid.innerHTML = '';
  if(!related.length){ section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  related.forEach(p=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = ()=> openModal(p);
    card.innerHTML = `
      <div class="card-img"><img src="${escapeHtml(resolveProductImage(p))}" alt="${escapeHtml(p.name)}" loading="lazy"></div>
      <div class="card-body">
        <p class="card-name">${escapeHtml(p.name)}</p>
        <p class="card-price mono">${fmt(p.price)}</p>
      </div>`;
    grid.appendChild(card);
  });
  viewport.scrollLeft = 0; // el producto cambió: empieza siempre desde la primera tarjeta
  updateRelatedArrows();
}

function relatedCardStep(){
  const grid = document.getElementById('relatedGrid');
  const first = grid.firstElementChild;
  if(!first) return 0;
  const gap = parseFloat(getComputedStyle(grid).gap) || 0;
  return first.getBoundingClientRect().width + gap;
}

function updateRelatedArrows(){
  const viewport = document.getElementById('relatedViewport');
  const grid = document.getElementById('relatedGrid');
  const maxScroll = grid.scrollWidth - viewport.clientWidth;
  document.getElementById('relatedPrevBtn').disabled = viewport.scrollLeft <= 1;
  document.getElementById('relatedNextBtn').disabled = viewport.scrollLeft >= maxScroll - 1;
}

export function closeModal({ updateUrl = true } = {}){
  modalOverlay.classList.remove('open');
  document.body.style.overflow='';
  if(updateUrl) clearProductUrl();
}

export function updatePreview(){
  if(!state.currentProduct) return;
  const p = state.currentProduct;
  const initialsInput = document.getElementById('initialsInput');
  const initials = p.personalizable ? initialsInput.value : '';
  const count = initials.length;
  const countEl = document.getElementById('initialsCount');

  if(p.personalizable){
    if(p.category==='tote'){
      countEl.textContent = `${count} / 7 · hasta 3 incluidas`;
      countEl.classList.toggle('warn', count>3);
    } else {
      countEl.textContent = `${count} / ${p.maxInitials}`;
      countEl.classList.remove('warn');
    }
  }

  // Precio
  const extra = (p.category==='tote' && count>3) ? PRICE_EXTRA_INITIALS : 0;
  const total = p.price + extra + PRICE_SHIP;
  document.getElementById('priceLive').textContent = fmt(p.price);

  const bd = document.getElementById('priceBreakdown');
  bd.innerHTML = `
    <div class="price-row"><span>${escapeHtml(p.name)}</span><span>${fmt(p.price)}</span></div>
    ${extra ? `<div class="price-row"><span>Personalización adicional (4–7 iniciales)</span><span>${fmt(extra)}</span></div>` : ''}
    <div class="price-row"><span>Envío</span><span>${fmt(PRICE_SHIP)}</span></div>
    <div class="price-row total"><span>Total</span><span>${fmt(total)}</span></div>
  `;

  const advanceNoteEl = document.getElementById('advanceNote');
  if(IMPORTED_CATEGORIES.includes(p.category)){
    advanceNoteEl.innerHTML = `<strong>Este producto es importado y su entrega tarda entre 15 y 20 días.</strong>`;
    advanceNoteEl.classList.remove('hidden');
  } else {
    advanceNoteEl.innerHTML = '';
    advanceNoteEl.classList.add('hidden');
  }
}

// Agrega el producto tal como está configurado ahora mismo (color, iniciales) como una
// nueva línea del carrito. No junta líneas repetidas: cada clic agrega una línea nueva,
// aunque sea la misma configuración (ej. el mismo tote con iniciales distintas para dos
// personas). El envío se calcula una sola vez sobre todo el carrito, por eso aquí no
// se guarda PRICE_SHIP por línea.
export function addCurrentProductToCart(){
  const p = state.currentProduct;
  if(!p) return;
  const initialsInput = document.getElementById('initialsInput');
  const initials = p.personalizable ? initialsInput.value : '';
  const extra = (p.category==='tote' && initials.length>3) ? PRICE_EXTRA_INITIALS : 0;
  addToCart({
    productId: p.id,
    name: p.name,
    category: p.category,
    color: p.color,
    variant: p.variant,
    initials,
    initialsColorName: state.currentInitialsColor ? state.currentInitialsColor.name : '',
    price: p.price,
    extra,
  });
  const msgEl = document.getElementById('cartAddMsg');
  msgEl.textContent = 'Agregado al carrito ✓';
  clearTimeout(addCurrentProductToCart._t);
  addCurrentProductToCart._t = setTimeout(()=>{ msgEl.textContent = ''; }, 2500);
}

export function openZoom(){
  const slidesEl = document.getElementById('gallerySlides');
  const activeImg = slidesEl.children[currentSlideIndex()];
  document.getElementById('zoomImg').src = activeImg ? activeImg.src : '';
  zoomOverlay.classList.add('open');
}

export function closeZoom(e){
  if(e) e.stopPropagation();
  zoomOverlay.classList.remove('open');
}

// Wires the modal's own internal listeners (click-outside-to-close, initials input
// filtering/coercion, and the Escape key closing both the modal and the zoom overlay).
// Markup control wiring (close buttons, gallery-main, zoom backdrop) happens in main.js.
export function initModal(){
  modalOverlay.addEventListener('click', (e)=>{ if(e.target===modalOverlay) closeModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ closeModal(); closeZoom(); }});

  // Mantiene el modal en sync con el botón atrás/adelante del navegador, ya que ahora
  // la URL cambia según el producto abierto (ver openModal/closeModal más arriba).
  window.addEventListener('popstate', ()=>{
    const id = getProductIdFromUrl();
    if(id){
      const product = ALL_PRODUCTS.find(p=>p.id===id);
      if(product) openModal(product, { updateUrl:false });
    } else {
      closeModal({ updateUrl:false });
    }
  });

  // Flechas de la foto principal (stopPropagation: #galleryMain también abre el zoom
  // al hacer clic, y las flechas están dentro de ese mismo contenedor).
  document.getElementById('galleryPrevBtn').addEventListener('click', (e)=>{
    e.stopPropagation();
    goToSlide(Math.max(0, currentSlideIndex() - 1));
  });
  document.getElementById('galleryNextBtn').addEventListener('click', (e)=>{
    e.stopPropagation();
    const count = document.getElementById('gallerySlides').children.length;
    goToSlide(Math.min(count - 1, currentSlideIndex() + 1));
  });
  document.getElementById('gallerySlides').addEventListener('scroll', updateGalleryArrows);

  // Flechas del carrusel de "También te puede interesar" (mismo mecanismo de scroll
  // nativo que el carrusel de colecciones — ver collections-carousel.js).
  document.getElementById('relatedPrevBtn').addEventListener('click', ()=>{
    document.getElementById('relatedViewport').scrollBy({ left: -relatedCardStep(), behavior: 'smooth' });
  });
  document.getElementById('relatedNextBtn').addEventListener('click', ()=>{
    document.getElementById('relatedViewport').scrollBy({ left: relatedCardStep(), behavior: 'smooth' });
  });
  document.getElementById('relatedViewport').addEventListener('scroll', updateRelatedArrows);

  const initialsInput = document.getElementById('initialsInput');
  initialsInput.addEventListener('input', ()=>{
    const max = state.currentProduct ? state.currentProduct.maxInitials : 7;
    initialsInput.value = initialsInput.value.toUpperCase().replace(/[^A-ZÑ]/g,'').slice(0,max);
    updatePreview();
  });
}
