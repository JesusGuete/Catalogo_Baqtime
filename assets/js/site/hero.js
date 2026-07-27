import { R, HERO_COLLAGE_IMAGE } from './site-images.js';

// The 4 hero/portada <img> src writes. These are always-good, already-absolute Storage
// URLs, so R() (currently an identity function) is used verbatim rather than the
// broken-image-avoiding resolveImageUrl().
export function initHero(){
  document.getElementById('heroImg').src = R(HERO_COLLAGE_IMAGE);
  document.getElementById('portadaTote').src = R("https://firebasestorage.googleapis.com/v0/b/baqtimecatalogo.firebasestorage.app/o/site-images%2Ftote_personalizado.webp?alt=media&token=094f1a01-786f-496e-baa7-79ef8f398b46");
  document.getElementById('portadaNeceser').src = R("https://firebasestorage.googleapis.com/v0/b/baqtimecatalogo.firebasestorage.app/o/site-images%2Fneceser_portada1.webp?alt=media&token=e34fef95-b931-456e-b667-a9ec3db8ec15");
  document.getElementById('portadaLumiere').src = R("https://firebasestorage.googleapis.com/v0/b/baqtimecatalogo.firebasestorage.app/o/site-images%2Flumiere_negro_life1.webp?alt=media&token=f71fb1c8-e8d1-45bf-8f99-401e5efd29dc");
}
