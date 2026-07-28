import { state } from './state.js';
import { INITIALS_COLORS } from './initials.js';
import { filterDigitsInput, filterNameCityInput } from './shipping-form.js';
import { initHero } from './hero.js';
import { injectStructuredData } from './structured-data.js';
import { initFilters, filterByCategory, renderColorFilters, reconcileColorFilter } from './catalog-filters.js';
import { renderGrid } from './catalog-grid.js';
import { initModal, closeModal, openZoom, closeZoom } from './product-modal.js';
import { sendWhatsapp } from './whatsapp-order.js';
import { applyFirebasePhotos } from './firebase-catalog.js';
import { initSearch } from './search.js';
import { initCollectionsCarousel } from './collections-carousel.js';

// Wires a DOM listener by id and throws loudly if the element is missing, instead of
// producing a silently dead control (see design §G risk 1 — a mis-wired handler
// otherwise produces no console error).
function on(id, event, fn){
  const el = document.getElementById(id);
  if(!el) throw new Error(`on(): element #${id} not found (event: ${event})`);
  el.addEventListener(event, fn);
}

state.currentInitialsColor = INITIALS_COLORS[0];

// 1. Hero/portada static images — no Firebase.
initHero();

// 2. JSON-LD, synchronous, from the static catalog (before any Firebase await).
injectStructuredData();

// 3. FIRST PAINT — fully synchronous, zero await/Firebase calls above this line.
initFilters({ onFilterChange: renderGrid });
renderColorFilters();
renderGrid();
initSearch({ onSearch: renderGrid });
initCollectionsCarousel();

// 4. Modal, shipping form, WhatsApp button, and all remaining markup controls.
initModal();
filterDigitsInput('shipPhone', 10);
filterDigitsInput('shipDoc', 20);
filterNameCityInput('shipName');
filterNameCityInput('shipCity');

on('portadaToteLink', 'click', (e)=>{ e.preventDefault(); filterByCategory('tote'); document.getElementById('catalogo').scrollIntoView(); });
on('portadaLuxuryLink', 'click', (e)=>{ e.preventDefault(); filterByCategory('tote-luxury'); document.getElementById('catalogo').scrollIntoView(); });
on('portadaNeceserLink', 'click', (e)=>{ e.preventDefault(); filterByCategory('neceser'); document.getElementById('catalogo').scrollIntoView(); });
on('portadaCosmetiqueraLink', 'click', (e)=>{ e.preventDefault(); filterByCategory('cosmetiquera'); document.getElementById('catalogo').scrollIntoView(); });
on('portadaLumiereLink', 'click', (e)=>{ e.preventDefault(); filterByCategory('lumiere'); document.getElementById('catalogo').scrollIntoView(); });
on('portadaMakeupLink', 'click', (e)=>{ e.preventDefault(); filterByCategory('makeup-bag'); document.getElementById('catalogo').scrollIntoView(); });
on('modalCloseBtn', 'click', ()=>closeModal());
on('galleryMain', 'click', ()=>openZoom());
on('whatsappBtn', 'click', ()=>sendWhatsapp());
on('zoomOverlay', 'click', ()=>closeZoom());
on('zoomCloseBtn', 'click', (e)=>closeZoom(e));

// 5. Firebase enrichment — the only asynchronous work; nothing above depends on it.
applyFirebasePhotos()
  .catch(e=>console.warn('applyFirebasePhotos falló de forma inesperada', e)) // belt-and-braces; Promise.allSettled already swallows every rejection internally
  .then(()=>{
    reconcileColorFilter();
    renderColorFilters();
    renderGrid();
  });
