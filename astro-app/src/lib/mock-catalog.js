// ⚠️ DATOS TEMPORALES — SOLO PARA DESARROLLO DEL FRONT, MIENTRAS NO EXISTE SUPABASE.
//
// Este archivo es una copia literal de assets/js/shared/catalog-seed.js +
// assets/js/site/catalog-data.js (los 30 productos "de fábrica" + su glue de
// categorías), tal como existen HOY en el proyecto vanilla. No agrega ni quita
// ningún producto.
//
// En la Fase 1 (cuando Jesús entregue el esquema de Supabase), este archivo se
// reemplaza por una consulta real a Supabase en build (getStaticPaths / fetch en
// el frontmatter de los .astro). Ningún componente que consuma CATALOG_MOCK debería
// necesitar cambios ese día — solo cambia de dónde vienen los datos.
//
// Las fotos NO son reales todavía: se usa el placeholder local, igual que hace hoy
// site-images.js antes de que Firebase las reemplace.

export const CATEGORY_LABELS = {
  tote: "Tote Personalizado",
  "tote-luxury": "Tote Bag Luxury",
  lumiere: "Bag Lumiere",
  neceser: "Neceser",
  cosmetiquera: "Cosmetiquera",
  "makeup-bag": "Makeup Bag",
};

export const IMPORTED_CATEGORIES = ["makeup-bag"];

export const CATS = [
  { key: null, label: "Todos" },
  { key: "tote", label: "Tote Personalizado" },
  { key: "tote-luxury", label: "Tote Bag Luxury" },
  { key: "lumiere", label: "Bag Lumiere" },
  { key: "neceser", label: "Neceser" },
  { key: "cosmetiquera", label: "Cosmetiquera" },
  { key: "makeup-bag", label: "Makeup Bag" },
];

const DEFAULT_IMG = "/assets/img/placeholder.svg";

const CATALOG_SEED = [
  // ---- Tote Bag ----
  { id: "t1", category: "tote", name: "Tote Bag Beige", color: "Beige", variant: "Cordones Negros", hex: "#E7DFCF", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Beige" },
  { id: "t2", category: "tote", name: "Tote Bag Beige", color: "Beige", variant: "Cordones Beige", hex: "#E7DFCF", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Beige" },
  { id: "t3", category: "tote", name: "Tote Bag Beige", color: "Beige", variant: "Cordones Café", hex: "#E7DFCF", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Beige" },
  { id: "t4", category: "tote", name: "Tote Bag Blanco", color: "Blanco", variant: "Cordones Negros", hex: "#F2EFE8", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Blanco" },
  { id: "t5", category: "tote", name: "Tote Bag Mocca", color: "Mocca", variant: "Cordones Café", hex: "#6B4A38", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Mocca" },
  { id: "t6", category: "tote", name: "Tote Bag Mocca", color: "Mocca", variant: "Cordones Negros", hex: "#6B4A38", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Mocca" },
  { id: "t7", category: "tote", name: "Tote Bag Negro", color: "Negro", variant: "Cordones Negros", hex: "#1C1A18", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Negro" },
  { id: "t8", category: "tote", name: "Tote Bag Rosado", color: "Rosado", variant: "Cordones Negros", hex: "#E9BEC2", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Rosado" },
  { id: "t9", category: "tote", name: "Tote Bag Rosado", color: "Rosado", variant: "Cordones Rosado", hex: "#E9BEC2", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Rosado" },
  { id: "t10", category: "tote", name: "Tote Bag Verde", color: "Verde", variant: "Cordones Negros", hex: "#5C6B4A", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Verde" },
  { id: "t11", category: "tote", name: "Tote Bag Vino", color: "Vino", variant: "Cordones Negros", hex: "#6E1F2A", price: 130000, personalizable: true, maxInitials: 7, groupKey: "Vino" },

  // ---- Tote Bag Luxury ----
  { id: "tl1", category: "tote-luxury", name: "Tote Bag Luxury Beige", color: "Beige", hex: "#EFE9DD", price: 130000, personalizable: true, maxInitials: 2, groupKey: "Beige" },
  { id: "tl2", category: "tote-luxury", name: "Tote Bag Luxury Mocca", color: "Mocca", hex: "#6B4A38", price: 130000, personalizable: true, maxInitials: 2, groupKey: "Mocca" },
  { id: "tl3", category: "tote-luxury", name: "Tote Bag Luxury Negro", color: "Negro", hex: "#1A1A1A", price: 130000, personalizable: true, maxInitials: 2, groupKey: "Negro" },

  // ---- Bag Lumiere ----
  { id: "l1", category: "lumiere", name: "Bag Lumiere Beige", color: "Beige", hex: "#F2EEDD", price: 140000, personalizable: false, groupKey: "Beige" },
  { id: "l2", category: "lumiere", name: "Bag Lumiere Negro", color: "Negro", hex: "#1A1A1A", price: 140000, personalizable: false, groupKey: "Negro" },
  { id: "l3", category: "lumiere", name: "Bag Lumiere Vino", color: "Vino", hex: "#6E1F2A", price: 140000, personalizable: false, groupKey: "Vino" },

  // ---- Neceser ----
  { id: "n1", category: "neceser", name: "Neceser Azul", color: "Azul", hex: "#25324A", price: 60000, personalizable: true, maxInitials: 2, groupKey: "Azul" },
  { id: "n2", category: "neceser", name: "Neceser Beige", color: "Beige", hex: "#EDE6D6", price: 60000, personalizable: true, maxInitials: 2, groupKey: "Beige" },
  { id: "n3", category: "neceser", name: "Neceser Mocca", color: "Mocca", hex: "#5A4133", price: 60000, personalizable: true, maxInitials: 2, groupKey: "Mocca" },
  { id: "n4", category: "neceser", name: "Neceser Negro", color: "Negro", hex: "#1A1A1A", price: 60000, personalizable: true, maxInitials: 2, groupKey: "Negro" },
  { id: "n5", category: "neceser", name: "Neceser Verde", color: "Verde", hex: "#3B4A34", price: 60000, personalizable: true, maxInitials: 2, groupKey: "Verde" },
  { id: "n6", category: "neceser", name: "Neceser Vino", color: "Vino", hex: "#4A1D25", price: 60000, personalizable: true, maxInitials: 2, groupKey: "Vino" },

  // ---- Cosmetiquera ----
  { id: "c1", category: "cosmetiquera", name: "Cosmetiquera Beige", color: "Beige", hex: "#EDE6D6", price: 50000, personalizable: true, maxInitials: 2, groupKey: "Beige" },
  { id: "c2", category: "cosmetiquera", name: "Cosmetiquera Negra", color: "Negro", hex: "#1A1A1A", price: 50000, personalizable: true, maxInitials: 2, groupKey: "Negro" },
  { id: "c3", category: "cosmetiquera", name: "Cosmetiquera Rosada", color: "Rosado", hex: "#E9C7CE", price: 50000, personalizable: true, maxInitials: 2, groupKey: "Rosado" },

  // ---- Makeup Bag ----
  { id: "m1", category: "makeup-bag", name: "Makeup Bag Mocca", color: "Mocca", hex: "#7A5B45", price: 70000, personalizable: true, maxInitials: 3, groupKey: "Mocca" },
  { id: "m2", category: "makeup-bag", name: "Makeup Bag Negra", color: "Negro", hex: "#1A1A1A", price: 70000, personalizable: true, maxInitials: 3, groupKey: "Negro" },
  { id: "m3", category: "makeup-bag", name: "Makeup Bag Rosada", color: "Rosado", hex: "#F0C6CE", price: 70000, personalizable: true, maxInitials: 3, groupKey: "Rosado" },
  { id: "m4", category: "makeup-bag", name: "Makeup Bag Vino", color: "Vino", hex: "#6E1F2A", price: 70000, personalizable: true, maxInitials: 3, groupKey: "Vino" },
];

export const CATALOG_MOCK = CATALOG_SEED.map((p) => ({ ...p, img: DEFAULT_IMG }));
