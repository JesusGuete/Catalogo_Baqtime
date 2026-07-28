import { state } from './state.js';
import { ALL_PRODUCTS, CATEGORY_LABELS } from './catalog-data.js';
import { fmt } from './pricing.js';
import { resolveProductImage } from './site-images.js';
import { escapeHtml } from '../shared/escape.js';
import { openModal } from './product-modal.js';

/* ===================== GRID DE PRODUCTOS ===================== */
const gridEl = document.getElementById('grid');

const SORTERS = {
  'price-asc': (a,b)=> a.price - b.price,
  'price-desc': (a,b)=> b.price - a.price,
  'name-asc': (a,b)=> a.name.localeCompare(b.name, 'es'),
  'name-desc': (a,b)=> b.name.localeCompare(a.name, 'es'),
};

/* ===== Buscador "inteligente" =====
   Sin librerías externas: quita tildes/mayúsculas, no le importa el orden de las
   palabras, y tolera pequeños errores de tipeo (distancia de edición / Levenshtein). */
function normalize(str){
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Distancia de edición entre dos palabras cortas: cuántos cambios (agregar/quitar/
// cambiar una letra) hacen falta para convertir una en la otra. El catálogo es chico
// (30-40 productos), así que calcular esto en cada tecleo no tiene costo real.
function editDistance(a, b){
  const dp = [];
  for(let i=0;i<=a.length;i++) dp.push([i, ...Array(b.length).fill(0)]);
  for(let j=0;j<=b.length;j++) dp[0][j]=j;
  for(let i=1;i<=a.length;i++){
    for(let j=1;j<=b.length;j++){
      dp[i][j] = a[i-1]===b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[a.length][b.length];
}

// Una palabra de búsqueda "encuentra" una palabra del producto si es substring/prefijo
// (ej. "cos" -> "cosmetiquera"), o si está lo bastante cerca en distancia de edición
// (el umbral crece con el largo de la palabra: para palabras muy cortas exige exactitud,
// para no hacer que "a" o "el" encuentren cualquier cosa).
function wordMatches(queryWord, productWord){
  if(productWord.includes(queryWord)) return true;
  const threshold = queryWord.length <= 2 ? 0 : queryWord.length <= 5 ? 1 : 2;
  return editDistance(queryWord, productWord) <= threshold;
}

function matchesSearch(p, query){
  if(!query) return true;
  const haystack = normalize(`${p.name} ${p.variant||''} ${p.color} ${CATEGORY_LABELS[p.category]||''}`)
    .split(/\s+/).filter(Boolean);
  const queryWords = normalize(query).split(/\s+/).filter(Boolean);
  // TODAS las palabras escritas deben encontrar match en ALGUNA palabra del producto
  // (sin importar el orden): "vino tote" encuentra "Tote Bag Vino" igual.
  return queryWords.every(qw => haystack.some(hw => wordMatches(qw, hw)));
}

export function renderGrid(){
  gridEl.innerHTML = '';
  const products = ALL_PRODUCTS
    .filter(p=> !state.currentCategory || p.category===state.currentCategory)
    .filter(p=> !state.currentColorFilter || p.groupKey===state.currentColorFilter)
    .filter(p=> matchesSearch(p, state.searchQuery));
  const sorter = SORTERS[state.sortBy];
  if(sorter) products.sort(sorter); // "relevancia" (sortBy==='') deja el orden natural del catálogo
  products.forEach(p=>{
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
