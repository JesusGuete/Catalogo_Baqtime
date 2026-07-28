// Carrusel de "Nuestras colecciones": 6 tarjetas fijas en el HTML, mostrando 3/2/1 a la vez
// según el ancho de pantalla (ver site.css), deslizando de a 1 con las flechas o arrastrando
// con el dedo/mouse (Pointer Events unifica ambos en un solo mecanismo). Usa
// getBoundingClientRect() en vez de porcentajes fijos para no tener que mantener el mismo
// número "3 visibles" repetido en JS y CSS — si el CSS cambia cuántas se ven, esto se adapta solo.
export function initCollectionsCarousel(){
  const track = document.getElementById('portadaTrack');
  const prevBtn = document.getElementById('portadaPrevBtn');
  const nextBtn = document.getElementById('portadaNextBtn');
  const cards = Array.from(track.children);
  let index = 0;

  // Estado del arrastre en curso (nulo cuando no se está arrastrando)
  let drag = null;

  function cardStep(){
    const cardWidth = cards[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    return cardWidth + gap;
  }

  function visibleCount(){
    const cardWidth = cards[0].getBoundingClientRect().width;
    const viewportWidth = track.parentElement.getBoundingClientRect().width;
    return Math.max(1, Math.round(viewportWidth / cardWidth));
  }

  function maxIndex(){
    return Math.max(0, cards.length - visibleCount());
  }

  function update(animate = true){
    const mi = maxIndex();
    if(index > mi) index = mi;
    track.style.transition = animate ? 'transform .3s ease' : 'none';
    track.style.transform = `translateX(-${index * cardStep()}px)`;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index >= mi;
  }

  prevBtn.addEventListener('click', ()=>{ index = Math.max(0, index - 1); update(); });
  nextBtn.addEventListener('click', ()=>{ index = Math.min(maxIndex(), index + 1); update(); });
  window.addEventListener('resize', ()=>update(false));

  // ===== Arrastre con el dedo (o mouse) =====
  // Umbral: hay que arrastrar al menos 20% del ancho de una tarjeta para que "cuente"
  // como un cambio de tarjeta; si se arrastra menos, vuelve a su posición (y un simple
  // clic en "Ver colección", que apenas mueve el puntero, sigue funcionando normal).
  track.addEventListener('pointerdown', (e)=>{
    drag = { startX: e.clientX, startOffset: -index * cardStep() };
    track.style.transition = 'none';
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener('pointermove', (e)=>{
    if(!drag) return;
    const delta = e.clientX - drag.startX;
    track.style.transform = `translateX(${drag.startOffset + delta}px)`;
  });
  function endDrag(e){
    if(!drag) return;
    const delta = e.clientX - drag.startX;
    const threshold = cardStep() * 0.2;
    if(delta < -threshold) index = Math.min(maxIndex(), index + 1);
    else if(delta > threshold) index = Math.max(0, index - 1);
    drag = null;
    update();
  }
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  update(false);
}
