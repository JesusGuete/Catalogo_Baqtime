import { state } from './state.js';
import { ALL_PRODUCTS, CATEGORY_LABELS } from './catalog-data.js';
import { fmt } from './pricing.js';
import { resolveProductImage } from './site-images.js';
import { escapeHtml } from '../shared/escape.js';
import { openModal } from './product-modal.js';

/* ===================== GRID DE PRODUCTOS ===================== */
const gridEl = document.getElementById('grid');
export function renderGrid(){
  gridEl.innerHTML = '';
  ALL_PRODUCTS
    .filter(p=> !state.currentCategory || p.category===state.currentCategory)
    .filter(p=> !state.currentColorFilter || p.groupKey===state.currentColorFilter)
    .forEach(p=>{
      const card = document.createElement('div');
      card.className='card';
      card.onclick=()=>openModal(p);
      const sub = p.category==='tote' ? p.variant : CATEGORY_LABELS[p.category];
      card.innerHTML = `
        <div class="card-img"><img src="${escapeHtml(resolveProductImage(p))}" alt="${escapeHtml(p.name)}" loading="lazy"></div>
        <div class="card-body">
          <p class="card-name">${escapeHtml(p.name)}</p>
          <p class="card-sub">${escapeHtml(sub)}</p>
          <p class="card-price mono">${fmt(p.price)}</p>
        </div>`;
      gridEl.appendChild(card);
  });
}
