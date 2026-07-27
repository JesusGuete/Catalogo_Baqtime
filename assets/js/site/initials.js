export const INITIALS_COLORS = [
  { name:"Negro", hex:"#1A1A1A" },
  { name:"Beige", hex:"#C9B99A" },
  { name:"Rosado", hex:"#D89AA0" },
  { name:"Mocca", hex:"#6B4A38" },
  { name:"Blanco", hex:"#FFFFFF" },
  { name:"Dorado", hex:"#C9A24B" },
  { name:"Vino", hex:"#6E1F2A" },
  { name:"Verde", hex:"#5C6B4A" },
  { name:"Azul", hex:"#25324A" },
];
export const PLATEADO_COLOR = { name:"Plateado", hex:"#B9BEC2" };
// Las Makeup Bag solo se bordan en color plateado (no aplican los demás colores)
export function initialsColorsFor(product){
  return product && product.category==='makeup-bag' ? [PLATEADO_COLOR] : INITIALS_COLORS;
}
