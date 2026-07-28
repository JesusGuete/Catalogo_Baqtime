// Carrusel de "Nuestras colecciones": 6 tarjetas fijas en el HTML, mostrando 3/2/1 a la vez
// según el ancho de pantalla (ver site.css). El arrastre con el dedo (o mouse) ya NO se
// simula a mano: .portada-viewport es un contenedor con scroll nativo + scroll-snap, así
// que el navegador se encarga del arrastre en ambas direcciones, la inercia, y dónde
// "engancha" cada tarjeta — sin la lógica de umbrales/sensibilidad que tenía la versión
// anterior (y que resultaba inconsistente entre dispositivos).
// Las flechas simplemente le piden al navegador que se desplace el ancho de una tarjeta.
export function initCollectionsCarousel(){
  const viewport = document.querySelector('.portada-viewport');
  const track = document.getElementById('portadaTrack');
  const prevBtn = document.getElementById('portadaPrevBtn');
  const nextBtn = document.getElementById('portadaNextBtn');
  const cards = Array.from(track.children);

  function cardStep(){
    const cardWidth = cards[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    return cardWidth + gap;
  }

  function updateArrows(){
    const maxScroll = track.scrollWidth - viewport.clientWidth;
    prevBtn.disabled = viewport.scrollLeft <= 1;
    nextBtn.disabled = viewport.scrollLeft >= maxScroll - 1;
  }

  prevBtn.addEventListener('click', ()=>{
    viewport.scrollBy({ left: -cardStep(), behavior: 'smooth' });
  });
  nextBtn.addEventListener('click', ()=>{
    viewport.scrollBy({ left: cardStep(), behavior: 'smooth' });
  });

  // El scroll nativo dispara este evento tanto al usar las flechas como al arrastrar
  // con el dedo/mouse — un solo lugar mantiene los botones actualizados.
  viewport.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);

  updateArrows();
}
