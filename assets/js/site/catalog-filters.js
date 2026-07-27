import { state } from './state.js';
import { ALL_PRODUCTS, CATS } from './catalog-data.js';

/* ===================== TABS DE CATEGORÍA ===================== */
const catTabsEl = document.getElementById('catTabs');
/* ===================== FILTRO DE COLOR (secundario) ===================== */
const filtersEl = document.getElementById('filters');

let onFilterChangeCb = () => {};

// Builds the category tab strip and wires the color-filter re-render callback (breaks the
// catalog-filters → catalog-grid cycle by injection; wired only in main.js).
export function initFilters({ onFilterChange } = {}){
  onFilterChangeCb = onFilterChange || (() => {});
  CATS.forEach(c=>{
    const b = document.createElement('button');
    b.className = 'cat-tab' + (c.key===null ? ' active':'');
    b.textContent = c.label;
    b.onclick = ()=>filterByCategory(c.key, b);
    catTabsEl.appendChild(b);
  });
}

export function filterByCategory(catKey, btnEl){
  state.currentCategory = catKey;
  state.currentColorFilter = null;
  document.querySelectorAll('.cat-tab').forEach(b=>b.classList.remove('active'));
  if(btnEl) btnEl.classList.add('active');
  else {
    // llamado desde las tarjetas de portada: activar el tab correspondiente
    const idx = CATS.findIndex(c=>c.key===catKey);
    if(idx>-1) catTabsEl.children[idx].classList.add('active');
  }
  renderColorFilters();
  onFilterChangeCb();
}

export function renderColorFilters(){
  filtersEl.innerHTML = '';
  const pool = state.currentCategory ? ALL_PRODUCTS.filter(p=>p.category===state.currentCategory) : ALL_PRODUCTS;
  const colors = [...new Set(pool.map(p=>p.groupKey))];
  const allBtn = document.createElement('button');
  // Required fix: active state derives from state.currentColorFilter instead of being
  // hard-coded true — static-first render makes this reachable with a filter already set.
  allBtn.className = 'filter-btn' + (state.currentColorFilter === null ? ' active' : '');
  allBtn.textContent = 'Todos los colores';
  allBtn.onclick = ()=>{ state.currentColorFilter=null; markActive(allBtn); onFilterChangeCb(); };
  filtersEl.appendChild(allBtn);
  colors.forEach(c=>{
    const b = document.createElement('button');
    b.className = 'filter-btn' + (state.currentColorFilter === c ? ' active' : '');
    b.textContent = c;
    b.onclick = ()=>{ state.currentColorFilter=c; markActive(b); onFilterChangeCb(); };
    filtersEl.appendChild(b);
  });
}

export function markActive(btn){
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

// Resets a color filter that no longer matches any product in the post-Firebase pool
// (product deleted/renamed its groupKey), so the user never sees a permanently empty
// grid with an active filter matching nothing. Runs before the Firebase re-render.
export function reconcileColorFilter(){
  if(state.currentColorFilter === null) return;
  const pool = state.currentCategory ? ALL_PRODUCTS.filter(p=>p.category===state.currentCategory) : ALL_PRODUCTS;
  const validColors = new Set(pool.map(p=>p.groupKey));
  if(!validColors.has(state.currentColorFilter)){
    state.currentColorFilter = null;
  }
}
