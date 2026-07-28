import { state } from './state.js';

// Buscador simple: filtra ALL_PRODUCTS por nombre/color/variante (ver catalog-grid.js).
// No dispara por sí solo el render — quien llame a initSearch() decide qué re-renderizar
// (hoy siempre es renderGrid, pasado como callback para no crear un import circular).
//
// El campo de texto empieza oculto: solo se ve la lupa. Un clic la expande y enfoca el
// campo; un segundo clic la vuelve a colapsar (sin perder lo que se había escrito).
export function initSearch({ onSearch } = {}){
  const box = document.querySelector('.search-box');
  const input = document.getElementById('searchInput');
  const iconBtn = document.getElementById('searchIconBtn');

  input.addEventListener('input', ()=>{
    state.searchQuery = input.value;
    onSearch();
  });

  iconBtn.addEventListener('click', ()=>{
    const expanded = box.classList.toggle('expanded');
    if(expanded) input.focus();
  });
}
