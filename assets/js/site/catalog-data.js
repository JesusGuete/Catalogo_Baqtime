/* ===================== SISTEMA DE PRODUCTOS ===================== */
// El catálogo base (los 30 productos "de fábrica") vive en un solo lugar:
// assets/js/shared/catalog-seed.js, importado también por el panel administrativo.
// Aquí solo se le agrega lo que es específico del sitio público: una foto de
// respaldo por defecto (en la práctica, casi siempre queda reemplazada de
// inmediato por la foto real que publica Firebase Storage — ver firebase-catalog.js).
import { CATALOG_SEED } from '../shared/catalog-seed.js';

const DEFAULT_IMG = 'assets/img/placeholder.svg';

// Single source of truth for the catalog. Mutated in place (push/splice/length=0+push)
// by firebase-catalog.js — never reassigned, since object identity is load-bearing
// (an open product modal holds a reference into this exact array; see design §B2).
// Cada producto es una copia propia (no la misma referencia que CATALOG_SEED), para
// que las fotos que Firebase escribe aquí no afecten al módulo compartido.
export const ALL_PRODUCTS = CATALOG_SEED.map(p => ({ ...p, img: DEFAULT_IMG }));

export const CATEGORY_LABELS = { tote:"Tote Personalizado", "tote-luxury":"Tote Bag Luxury", lumiere:"Bag Lumiere", neceser:"Neceser", cosmetiquera:"Cosmetiquera", "makeup-bag":"Makeup Bag" };
export const IMPORTED_CATEGORIES = ["makeup-bag"]; // productos importados con tiempo de entrega mayor

export const CATS = [
  { key:null, label:"Todos" },
  { key:"tote", label:"Tote Personalizado" },
  { key:"tote-luxury", label:"Tote Bag Luxury" },
  { key:"lumiere", label:"Bag Lumiere" },
  { key:"neceser", label:"Neceser" },
  { key:"cosmetiquera", label:"Cosmetiquera" },
  { key:"makeup-bag", label:"Makeup Bag" },
];
