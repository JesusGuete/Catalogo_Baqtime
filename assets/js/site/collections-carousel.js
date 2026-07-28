// Carrusel de "Nuestras colecciones": 6 tarjetas fijas en el HTML, mostrando 3/2/1 a la vez
// según el ancho de pantalla (ver site.css), deslizando de a 1 con las flechas. Usa
// getBoundingClientRect() en vez de porcentajes fijos para no tener que mantener el mismo
// número "3 visibles" repetido en JS y CSS — si el CSS cambia cuántas se ven, esto se adapta solo.
export function initCollectionsCarousel(){
  const track = document.getElementById('portadaTrack');
  const prevBtn = document.getElementById('portadaPrevBtn');
  const nextBtn = document.getElementById('portadaNextBtn');
  const cards = Array.from(track.children);
  let index = 0;

  function visibleCount(){
    const cardWidth = cards[0].getBoundingClientRect().width;
    const viewportWidth = track.parentElement.getBoundingClientRect().width;
    return Math.max(1, Math.round(viewportWidth / cardWidth));
  }

  function update(){
    const maxIndex = Math.max(0, cards.length - visibleCount());
    if(index > maxIndex) index = maxIndex;
    const cardWidth = cards[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    track.style.transform = `translateX(-${index * (cardWidth + gap)}px)`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index >= maxIndex;
  }

  prevBtn.addEventListener('click', ()=>{ index = Math.max(0, index - 1); update(); });
  nextBtn.addEventListener('click', ()=>{
    const maxIndex = Math.max(0, cards.length - visibleCount());
    index = Math.min(maxIndex, index + 1);
    update();
  });
  window.addEventListener('resize', update);

  update();
}
