import { ALL_PRODUCTS } from './catalog-data.js';
import { resolveStructuredDataImage, HERO_COLLAGE_IMAGE } from './site-images.js';

const SITE_URL = 'https://baqtime.store/';

// Short, neutral Spanish product descriptions for JSON-LD only (never shown on-page).
// Custom (Firebase-only) products are excluded by construction: this runs synchronously
// from the static ALL_PRODUCTS array before applyFirebasePhotos() ever pushes a custom
// product into it (see main.js's lifecycle) — see design §E4 for the security reasoning
// (RTDB write rules currently allow any self-signed-up account to write customProducts).
const CATEGORY_DESCRIPTION = {
  tote: 'Tote bag personalizado con tus iniciales bordadas, ideal para el día a día.',
  'tote-luxury': 'Tote bag de línea Luxury, personalizable con tus iniciales.',
  neceser: 'Neceser personalizable con tus iniciales, ideal para viajes y el día a día.',
  cosmetiquera: 'Cosmetiquera personalizable con tus iniciales.',
  'makeup-bag': 'Makeup bag personalizable con iniciales bordadas en color plateado.',
  lumiere: 'Bolso Bag Lumiere, listo para usar, sin personalización.',
};

function productToListItem(p, position){
  return {
    '@type': 'ListItem',
    position,
    item: {
      '@type': 'Product',
      name: p.name,
      image: resolveStructuredDataImage(p),
      description: CATEGORY_DESCRIPTION[p.category] || `${p.name} — Baqtime.`,
      offers: {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'COP',
        availability: p.personalizable ? 'https://schema.org/MadeToOrder' : 'https://schema.org/InStock',
        url: SITE_URL,
      },
    },
  };
}

function appendLdJson(data){
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

// Builds ItemList/Product/LocalBusiness JSON-LD from the same static ALL_PRODUCTS binding
// the grid and modal read (single source of truth — see design §E1) and appends it to
// <head> at runtime. Must run synchronously, before any Firebase call (see main.js).
export function injectStructuredData(){
  appendLdJson({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: ALL_PRODUCTS.map((p, i) => productToListItem(p, i + 1)),
  });

  appendLdJson({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'Baqtime',
    url: SITE_URL,
    image: HERO_COLLAGE_IMAGE,
    telephone: '+57 313 495 4478',
    address: { '@type': 'PostalAddress', addressCountry: 'CO' },
    areaServed: [
      { '@type': 'City', name: 'Barranquilla' },
      { '@type': 'City', name: 'Cartagena' },
    ],
    sameAs: ['https://www.instagram.com/baqtime/'],
  });
}
