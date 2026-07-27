import { state } from './state.js';
import { ALL_PRODUCTS, IMPORTED_CATEGORIES } from './catalog-data.js';
import { INITIALS_COLORS, initialsColorsFor } from './initials.js';
import { PRICE_EXTRA_INITIALS, PRICE_SHIP, fmt, getAdvance } from './pricing.js';
import { resolveProductImage, resolveImageUrl } from './site-images.js';
import { escapeHtml } from '../shared/escape.js';

const modalOverlay = document.getElementById('modalOverlay');
const zoomOverlay = document.getElementById('zoomOverlay');

export function galleryFor(product){
  if(product.gallery) return product.gallery.map(img=>({img, product}));
  return [{img:product.img, product}];
}

export function openModal(product){
  state.currentProduct = product;
  state.currentInitialsColor = INITIALS_COLORS[0];
  const sub = product.category==='tote' ? ` – ${product.variant}` : '';
  document.getElementById('modalTitle').textContent = `${product.name}${sub}`;
  document.getElementById('galleryImg').src = resolveProductImage(product);

  // Galería / miniaturas
  const thumbs = galleryFor(product);
  const thumbsEl = document.getElementById('galleryThumbs');
  thumbsEl.innerHTML='';
  thumbs.forEach((t,idx)=>{
    const img = document.createElement('img');
    img.src = resolveImageUrl(t.img);
    img.className = idx===0 ? 'active' : '';
    img.onclick = ()=>{
      document.getElementById('galleryImg').src = resolveImageUrl(t.img);
      thumbsEl.querySelectorAll('img').forEach(i=>i.classList.remove('active'));
      img.classList.add('active');
      if(t.product !== state.currentProduct){ state.currentProduct = t.product; updatePreview(); }
    };
    thumbsEl.appendChild(img);
  });

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

  document.getElementById('shipName').value='';
  document.getElementById('shipCity').value='';
  document.getElementById('shipAddress').value='';
  document.getElementById('shipPhone').value='';
  document.getElementById('shipDoc').value='';
  document.getElementById('reqNote').textContent='';
  ['shipNameErr','shipCityErr','shipPhoneErr','shipDocErr','shipAddressErr'].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.textContent='';
  });

  const whatsappBtn = document.getElementById('whatsappBtn');
  whatsappBtn.textContent = product.category==='lumiere' ? 'Comprar este Bag Lumiere por WhatsApp' : 'Agendar mi pedido por WhatsApp';

  updatePreview();
  modalOverlay.classList.add('open');
  document.body.style.overflow='hidden';
}

export function closeModal(){
  modalOverlay.classList.remove('open');
  document.body.style.overflow='';
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
  document.getElementById('priceLive').textContent = fmt(total);

  const bd = document.getElementById('priceBreakdown');
  bd.innerHTML = `
    <div class="price-row"><span>${escapeHtml(p.name)}</span><span>${fmt(p.price)}</span></div>
    ${extra ? `<div class="price-row"><span>Personalización adicional (4–7 iniciales)</span><span>${fmt(extra)}</span></div>` : ''}
    <div class="price-row"><span>Envío</span><span>${fmt(PRICE_SHIP)}</span></div>
    <div class="price-row total"><span>Total</span><span>${fmt(total)}</span></div>
  `;

  document.getElementById('advanceNote').innerHTML =
    `Para reservar tu pedido se requiere un anticipo de <strong>${fmt(getAdvance(p))}</strong>. Una vez confirmado el pago, comenzamos a preparar tu pedido. El saldo restante se paga al recibir el pedido.` +
    (IMPORTED_CATEGORIES.includes(p.category) ? ` <strong>Este producto es importado y su entrega tarda entre 15 y 20 días.</strong>` : '');
}

export function openZoom(){
  document.getElementById('zoomImg').src = document.getElementById('galleryImg').src;
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

  const initialsInput = document.getElementById('initialsInput');
  initialsInput.addEventListener('input', ()=>{
    const max = state.currentProduct ? state.currentProduct.maxInitials : 7;
    initialsInput.value = initialsInput.value.toUpperCase().replace(/[^A-ZÑ]/g,'').slice(0,max);
    updatePreview();
  });
}
