// Única fuente de verdad para el catálogo "de fábrica" (los 30 productos originales,
// distintos de los productos "custom" que se crean desde el panel y viven solo en Firebase).
// Antes esta misma lista estaba escrita a mano dos veces: en assets/js/site/catalog-data.js
// (con todos los campos) y en assets/js/admin/main.js (solo id/cat/name/variant). Ahora
// ambos archivos importan de aquí, así que solo hay un lugar para editar si cambia el
// catálogo base (agregar/quitar/renombrar un producto de fábrica).
//
// category usa la misma clave interna en ambos lados (coincide con CATEGORY_CONFIG en
// admin/main.js y con CATS/CATEGORY_LABELS en site/catalog-data.js): tote, neceser,
// lumiere, tote-luxury, cosmetiquera, makeup-bag.
//
// No incluye `img` ni `gallery`: esas son fotos de respaldo específicas del sitio público,
// que se agregan en catalog-data.js, y en la práctica siempre quedan reemplazadas por las
// fotos reales publicadas en Firebase Storage.

export const CATALOG_SEED = [
  // ---- Tote Bag ----
  { id:"t1", category:"tote", name:"Tote Bag Beige", color:"Beige", variant:"Cordones Negros", hex:"#E7DFCF", price:130000, personalizable:true, maxInitials:7, groupKey:"Beige" },
  { id:"t2", category:"tote", name:"Tote Bag Beige", color:"Beige", variant:"Cordones Beige", hex:"#E7DFCF", price:130000, personalizable:true, maxInitials:7, groupKey:"Beige" },
  { id:"t3", category:"tote", name:"Tote Bag Beige", color:"Beige", variant:"Cordones Café", hex:"#E7DFCF", price:130000, personalizable:true, maxInitials:7, groupKey:"Beige" },
  { id:"t4", category:"tote", name:"Tote Bag Blanco", color:"Blanco", variant:"Cordones Negros", hex:"#F2EFE8", price:130000, personalizable:true, maxInitials:7, groupKey:"Blanco" },
  { id:"t5", category:"tote", name:"Tote Bag Mocca", color:"Mocca", variant:"Cordones Café", hex:"#6B4A38", price:130000, personalizable:true, maxInitials:7, groupKey:"Mocca" },
  { id:"t6", category:"tote", name:"Tote Bag Mocca", color:"Mocca", variant:"Cordones Negros", hex:"#6B4A38", price:130000, personalizable:true, maxInitials:7, groupKey:"Mocca" },
  { id:"t7", category:"tote", name:"Tote Bag Negro", color:"Negro", variant:"Cordones Negros", hex:"#1C1A18", price:130000, personalizable:true, maxInitials:7, groupKey:"Negro" },
  { id:"t8", category:"tote", name:"Tote Bag Rosado", color:"Rosado", variant:"Cordones Negros", hex:"#E9BEC2", price:130000, personalizable:true, maxInitials:7, groupKey:"Rosado" },
  { id:"t9", category:"tote", name:"Tote Bag Rosado", color:"Rosado", variant:"Cordones Rosado", hex:"#E9BEC2", price:130000, personalizable:true, maxInitials:7, groupKey:"Rosado" },
  { id:"t10", category:"tote", name:"Tote Bag Verde", color:"Verde", variant:"Cordones Negros", hex:"#5C6B4A", price:130000, personalizable:true, maxInitials:7, groupKey:"Verde" },
  { id:"t11", category:"tote", name:"Tote Bag Vino", color:"Vino", variant:"Cordones Negros", hex:"#6E1F2A", price:130000, personalizable:true, maxInitials:7, groupKey:"Vino" },

  // ---- Tote Bag Luxury ----
  { id:"tl1", category:"tote-luxury", name:"Tote Bag Luxury Beige", color:"Beige", hex:"#EFE9DD", price:130000, personalizable:true, maxInitials:2, groupKey:"Beige" },
  { id:"tl2", category:"tote-luxury", name:"Tote Bag Luxury Mocca", color:"Mocca", hex:"#6B4A38", price:130000, personalizable:true, maxInitials:2, groupKey:"Mocca" },
  { id:"tl3", category:"tote-luxury", name:"Tote Bag Luxury Negro", color:"Negro", hex:"#1A1A1A", price:130000, personalizable:true, maxInitials:2, groupKey:"Negro" },

  // ---- Bag Lumiere ----
  { id:"l1", category:"lumiere", name:"Bag Lumiere Beige", color:"Beige", hex:"#F2EEDD", price:140000, personalizable:false, groupKey:"Beige" },
  { id:"l2", category:"lumiere", name:"Bag Lumiere Negro", color:"Negro", hex:"#1A1A1A", price:140000, personalizable:false, groupKey:"Negro" },
  { id:"l3", category:"lumiere", name:"Bag Lumiere Vino", color:"Vino", hex:"#6E1F2A", price:140000, personalizable:false, groupKey:"Vino" },

  // ---- Neceser ----
  { id:"n1", category:"neceser", name:"Neceser Azul", color:"Azul", hex:"#25324A", price:60000, personalizable:true, maxInitials:2, groupKey:"Azul" },
  { id:"n2", category:"neceser", name:"Neceser Beige", color:"Beige", hex:"#EDE6D6", price:60000, personalizable:true, maxInitials:2, groupKey:"Beige" },
  { id:"n3", category:"neceser", name:"Neceser Mocca", color:"Mocca", hex:"#5A4133", price:60000, personalizable:true, maxInitials:2, groupKey:"Mocca" },
  { id:"n4", category:"neceser", name:"Neceser Negro", color:"Negro", hex:"#1A1A1A", price:60000, personalizable:true, maxInitials:2, groupKey:"Negro" },
  { id:"n5", category:"neceser", name:"Neceser Verde", color:"Verde", hex:"#3B4A34", price:60000, personalizable:true, maxInitials:2, groupKey:"Verde" },
  { id:"n6", category:"neceser", name:"Neceser Vino", color:"Vino", hex:"#4A1D25", price:60000, personalizable:true, maxInitials:2, groupKey:"Vino" },

  // ---- Cosmetiquera ----
  { id:"c1", category:"cosmetiquera", name:"Cosmetiquera Beige", color:"Beige", hex:"#EDE6D6", price:50000, personalizable:true, maxInitials:2, groupKey:"Beige" },
  { id:"c2", category:"cosmetiquera", name:"Cosmetiquera Negra", color:"Negro", hex:"#1A1A1A", price:50000, personalizable:true, maxInitials:2, groupKey:"Negro" },
  { id:"c3", category:"cosmetiquera", name:"Cosmetiquera Rosada", color:"Rosado", hex:"#E9C7CE", price:50000, personalizable:true, maxInitials:2, groupKey:"Rosado" },

  // ---- Makeup Bag ----
  { id:"m1", category:"makeup-bag", name:"Makeup Bag Mocca", color:"Mocca", hex:"#7A5B45", price:70000, personalizable:true, maxInitials:3, groupKey:"Mocca" },
  { id:"m2", category:"makeup-bag", name:"Makeup Bag Negra", color:"Negro", hex:"#1A1A1A", price:70000, personalizable:true, maxInitials:3, groupKey:"Negro" },
  { id:"m3", category:"makeup-bag", name:"Makeup Bag Rosada", color:"Rosado", hex:"#F0C6CE", price:70000, personalizable:true, maxInitials:3, groupKey:"Rosado" },
  { id:"m4", category:"makeup-bag", name:"Makeup Bag Vino", color:"Vino", hex:"#6E1F2A", price:70000, personalizable:true, maxInitials:3, groupKey:"Vino" },
];
