import { state } from './state.js';

// Buscador simple: filtra ALL_PRODUCTS por nombre/color/variante (ver catalog-grid.js).
// No dispara por sí solo el render — quien llame a initSearch() decide qué re-renderizar
// (hoy siempre es renderGrid, pasado como callback para no crear un import circular).
export function initSearch({ onSearch } = {}){
  const input = document.getElementById('searchInput');
  const iconBtn = document.getElementById('searchIconBtn');

  input.addEventListener('input', ()=>{
    state.searchQuery = input.value;
    onSearch();
  });

  // El botón con la lupa no ejecuta la búsqueda por sí mismo (ya es instantánea al
  // escribir) — solo lleva el foco al campo, como acceso rápido visual.
  iconBtn.addEventListener('click', ()=> input.focus());
}
