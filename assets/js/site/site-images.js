export const IMG_DATA = {};
export function R(p){ return IMG_DATA[p] || p; }

// There is no images/ folder in this repository — every static product `img:"images/…"`
// path 404s. This first-party, same-origin placeholder is the runtime rendering fallback
// (never a Firebase Storage URL: that would die in exactly the outage this change exists
// to survive).
const PLACEHOLDER_IMAGE = 'assets/img/placeholder.svg';

// Resolves any single photo URL for on-page rendering (grid cards, modal gallery/thumbs):
// an absolute http(s) URL (a real photo, static-hardcoded or Firebase-assigned) is used
// as-is; anything else falls back to the local placeholder so first paint never shows a
// broken image icon.
export function resolveImageUrl(url){
  return /^https?:/i.test(url) ? R(url) : PLACEHOLDER_IMAGE;
}

export function resolveProductImage(p){
  return resolveImageUrl(p.img);
}

// ===== Structured data (JSON-LD) image sourcing — deliberately NOT the same resolver =====
// JSON-LD is generated synchronously from the static catalog, before Firebase resolves, so
// every product's `img` is still a dead relative path at that point — resolveProductImage()
// would return the single generic placeholder.svg for all 30 products, which is not a real
// product photo and would hurt Rich Results eligibility. Instead, JSON-LD uses ONLY these
// four verified-stable (HTTP 200) Storage URLs, one per category. They are never garbage
// collected by cleanupOrphanedStorage() (admin.html), which only deletes URLs that appeared
// in productPhotos, and they are NEVER swapped for a `product-images/…` URL — those are
// deleted whenever the owner replaces a photo, which would leave 404s in the JSON-LD.
const STORAGE_BASE = 'https://firebasestorage.googleapis.com/v0/b/baqtimecatalogo.firebasestorage.app/o/';
export const HERO_COLLAGE_IMAGE = STORAGE_BASE + 'site-images%2Fhero_collage_v2.webp?alt=media&token=d4847b25-bf99-4cf4-8ee5-dfaf6d873da9';

const STRUCTURED_DATA_CATEGORY_IMAGE = {
  tote: STORAGE_BASE + 'site-images%2Ftote_personalizado.webp?alt=media&token=094f1a01-786f-496e-baa7-79ef8f398b46',
  neceser: STORAGE_BASE + 'site-images%2Fneceser_portada1.webp?alt=media&token=e34fef95-b931-456e-b667-a9ec3db8ec15',
  lumiere: STORAGE_BASE + 'site-images%2Flumiere_negro_life1.webp?alt=media&token=f71fb1c8-e8d1-45bf-8f99-401e5efd29dc',
  'tote-luxury': HERO_COLLAGE_IMAGE,
  cosmetiquera: HERO_COLLAGE_IMAGE,
  'makeup-bag': HERO_COLLAGE_IMAGE,
};

export function resolveStructuredDataImage(p){
  return STRUCTURED_DATA_CATEGORY_IMAGE[p.category];
}
