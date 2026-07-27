/* ===================== SISTEMA DE PRODUCTOS ===================== */
// Cada producto tiene: category, name, price, img, gallery, personalizable, maxInitials, groupKey (para agrupar variantes en miniaturas)

export const PRODUCTS_TOTE = [
  { id:"t1", category:"tote", name:"Tote Bag Beige", color:"Beige", variant:"Cordones Negros", hex:"#E7DFCF", img:"images/Beige_-_Cordonaes_negros.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Beige" },
  { id:"t2", category:"tote", name:"Tote Bag Beige", color:"Beige", variant:"Cordones Beige", hex:"#E7DFCF", img:"images/Beige_-_Cordones_beige.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Beige" },
  { id:"t3", category:"tote", name:"Tote Bag Beige", color:"Beige", variant:"Cordones Café", hex:"#E7DFCF", img:"images/Beige_-_Cordones_cafe.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Beige" },
  { id:"t4", category:"tote", name:"Tote Bag Blanco", color:"Blanco", variant:"Cordones Negros", hex:"#F2EFE8", img:"images/Blanco_-_Cordones_negros.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Blanco" },
  { id:"t5", category:"tote", name:"Tote Bag Mocca", color:"Mocca", variant:"Cordones Café", hex:"#6B4A38", img:"images/Mocca_-_Cordonaes_cafe.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Mocca" },
  { id:"t6", category:"tote", name:"Tote Bag Mocca", color:"Mocca", variant:"Cordones Negros", hex:"#6B4A38", img:"images/Mocca_-_cordones_negros.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Mocca" },
  { id:"t7", category:"tote", name:"Tote Bag Negro", color:"Negro", variant:"Cordones Negros", hex:"#1C1A18", img:"images/tote_negro_new.jpg", gallery:["images/tote_negro_new.jpg","images/Negro_-_Cordones_negros.JPG"], price:130000, personalizable:true, maxInitials:7, groupKey:"Negro" },
  { id:"t8", category:"tote", name:"Tote Bag Rosado", color:"Rosado", variant:"Cordones Negros", hex:"#E9BEC2", img:"images/Rosado_-_Cordonaes_negros.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Rosado" },
  { id:"t9", category:"tote", name:"Tote Bag Rosado", color:"Rosado", variant:"Cordones Rosado", hex:"#E9BEC2", img:"images/Rosado_-_Cordones_rosado.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Rosado" },
  { id:"t10", category:"tote", name:"Tote Bag Verde", color:"Verde", variant:"Cordones Negros", hex:"#5C6B4A", img:"images/Verde_-_Cordones_negros.JPG", price:130000, personalizable:true, maxInitials:7, groupKey:"Verde" },
  { id:"t11", category:"tote", name:"Tote Bag Vino", color:"Vino", variant:"Cordones Negros", hex:"#6E1F2A", img:"images/tote_vino_new.jpg", gallery:["images/tote_vino_new.jpg","images/Vino_-_Cordones_negros.JPG"], price:130000, personalizable:true, maxInitials:7, groupKey:"Vino" },
];

const NECESER_PRICE = 60000;
export const PRODUCTS_NECESER = [
  { id:"n1", category:"neceser", name:"Neceser Azul", color:"Azul", hex:"#25324A", img:"images/neceser_azul.jpg", price:NECESER_PRICE, personalizable:true, maxInitials:2, groupKey:"Azul" },
  { id:"n2", category:"neceser", name:"Neceser Beige", color:"Beige", hex:"#EDE6D6", img:"images/neceser_beige.jpg", price:NECESER_PRICE, personalizable:true, maxInitials:2, groupKey:"Beige" },
  { id:"n3", category:"neceser", name:"Neceser Mocca", color:"Mocca", hex:"#5A4133", img:"images/neceser_mocca.jpg", price:NECESER_PRICE, personalizable:true, maxInitials:2, groupKey:"Mocca" },
  { id:"n4", category:"neceser", name:"Neceser Negro", color:"Negro", hex:"#1A1A1A", img:"images/neceser_negro.jpg", price:NECESER_PRICE, personalizable:true, maxInitials:2, groupKey:"Negro" },
  { id:"n5", category:"neceser", name:"Neceser Verde", color:"Verde", hex:"#3B4A34", img:"images/neceser_verde.jpg", price:NECESER_PRICE, personalizable:true, maxInitials:2, groupKey:"Verde" },
  { id:"n6", category:"neceser", name:"Neceser Vino", color:"Vino", hex:"#4A1D25", img:"images/neceser_vino.jpg", price:NECESER_PRICE, personalizable:true, maxInitials:2, groupKey:"Vino" },
];

const LUMIERE_PRICE = 140000;
export const PRODUCTS_LUMIERE = [
  { id:"l1", category:"lumiere", name:"Bag Lumiere Beige", color:"Beige", hex:"#F2EEDD", img:"images/lumiere_beige.jpg",
    gallery:["images/lumiere_beige.jpg","images/lumiere_beige_life1.jpg","images/lumiere_beige_life2.jpg"],
    price:LUMIERE_PRICE, personalizable:false, groupKey:"Beige" },
  { id:"l2", category:"lumiere", name:"Bag Lumiere Negro", color:"Negro", hex:"#1A1A1A", img:"images/lumiere_negro.jpg",
    gallery:["images/lumiere_negro.jpg","images/lumiere_negro_life1.jpg","images/lumiere_negro_life2.jpg"],
    price:LUMIERE_PRICE, personalizable:false, groupKey:"Negro" },
  { id:"l3", category:"lumiere", name:"Bag Lumiere Vino", color:"Vino", hex:"#6E1F2A", img:"images/lumiere_vino.jpg",
    gallery:["images/lumiere_vino.jpg","images/lumiere_vino_life1.jpg"],
    price:LUMIERE_PRICE, personalizable:false, groupKey:"Vino" },
];

const TOTE_LUXURY_PRICE = 130000;
export const PRODUCTS_TOTE_LUXURY = [
  { id:"tl1", category:"tote-luxury", name:"Tote Bag Luxury Beige", color:"Beige", hex:"#EFE9DD", img:"images/tote_luxury_beige.jpeg", price:TOTE_LUXURY_PRICE, personalizable:true, maxInitials:2, groupKey:"Beige" },
  { id:"tl2", category:"tote-luxury", name:"Tote Bag Luxury Mocca", color:"Mocca", hex:"#6B4A38", img:"images/tote_luxury_mocca.jpeg", price:TOTE_LUXURY_PRICE, personalizable:true, maxInitials:2, groupKey:"Mocca" },
  { id:"tl3", category:"tote-luxury", name:"Tote Bag Luxury Negro", color:"Negro", hex:"#1A1A1A", img:"images/tote_luxury_negro.jpeg", price:TOTE_LUXURY_PRICE, personalizable:true, maxInitials:2, groupKey:"Negro" },
];

const COSMETIQUERA_PRICE = 50000;
export const PRODUCTS_COSMETIQUERA = [
  { id:"c1", category:"cosmetiquera", name:"Cosmetiquera Beige", color:"Beige", hex:"#EDE6D6", img:"images/cosmetiquera_beige.jpg", price:COSMETIQUERA_PRICE, personalizable:true, maxInitials:2, groupKey:"Beige" },
  { id:"c2", category:"cosmetiquera", name:"Cosmetiquera Negra", color:"Negro", hex:"#1A1A1A", img:"images/cosmetiquera_negra.jpg", price:COSMETIQUERA_PRICE, personalizable:true, maxInitials:2, groupKey:"Negro" },
  { id:"c3", category:"cosmetiquera", name:"Cosmetiquera Rosada", color:"Rosado", hex:"#E9C7CE", img:"images/cosmetiquera_rosada.jpg", price:COSMETIQUERA_PRICE, personalizable:true, maxInitials:2, groupKey:"Rosado" },
];

const MAKEUP_PRICE = 70000;
export const PRODUCTS_MAKEUP = [
  { id:"m1", category:"makeup-bag", name:"Makeup Bag Mocca", color:"Mocca", hex:"#7A5B45", img:"images/makeup_gris.jpeg", price:MAKEUP_PRICE, personalizable:true, maxInitials:3, groupKey:"Mocca" },
  { id:"m2", category:"makeup-bag", name:"Makeup Bag Negra", color:"Negro", hex:"#1A1A1A", img:"images/makeup_negra.jpeg", price:MAKEUP_PRICE, personalizable:true, maxInitials:3, groupKey:"Negro" },
  { id:"m3", category:"makeup-bag", name:"Makeup Bag Rosada", color:"Rosado", hex:"#F0C6CE", img:"images/makeup_rosada.jpeg", price:MAKEUP_PRICE, personalizable:true, maxInitials:3, groupKey:"Rosado" },
  { id:"m4", category:"makeup-bag", name:"Makeup Bag Vino", color:"Vino", hex:"#6E1F2A", img:"images/makeup_vino.jpeg", price:MAKEUP_PRICE, personalizable:true, maxInitials:3, groupKey:"Vino" },
];

// Single source of truth for the catalog. Mutated in place (push/splice/length=0+push)
// by firebase-catalog.js — never reassigned, since object identity is load-bearing
// (an open product modal holds a reference into this exact array; see design §B2).
export const ALL_PRODUCTS = [...PRODUCTS_TOTE, ...PRODUCTS_TOTE_LUXURY, ...PRODUCTS_LUMIERE, ...PRODUCTS_NECESER, ...PRODUCTS_COSMETIQUERA, ...PRODUCTS_MAKEUP];

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
