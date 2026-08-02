// Carrito — portado desde assets/js/site/cart.js (parte de datos).
//
// Diferencia con la versión vanilla: allí el carrito era una variable dentro del
// módulo y todo el mundo tocaba el DOM directamente. Aquí hay DOS islas React
// separadas que necesitan el mismo carrito (el contador del encabezado y la app
// de la tienda), y cada isla es una raíz de React independiente — no comparten
// estado por props. La solución es este "store": un módulo único que guarda el
// carrito y avisa a quien esté suscrito cuando cambia.
//
// Reglas de negocio conservadas tal cual:
// - No hay "cantidad": agregar dos veces el mismo producto crea DOS líneas
//   (ej. el mismo tote con iniciales distintas para dos personas).
// - El envío NO se guarda por línea: se cobra una sola vez sobre todo el carrito.

const STORAGE_KEY = "baqtime_cart"; // misma clave que el sitio actual

let cart = [];
let hydrated = false;
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(cart);
}

// localStorage no existe durante el build (SSG), así que el carrito arranca vacío
// y se llena recién en el navegador. Esto además evita el "hydration mismatch"
// (que el HTML generado en build diga algo distinto de lo que React pinta al
// hidratarse).
export function hydrateCart() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cart = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("No se pudo leer el carrito guardado, se empieza vacío:", e);
    cart = [];
  }
  notify();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch (e) {
    console.warn("No se pudo guardar el carrito en este navegador:", e);
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCart() {
  return cart;
}

// getCartSubtotal() vivía acá y sumaba item.price + item.extra, o sea los precios
// congelados en localStorage. Se eliminó a propósito: dejarlo sería tener dos formas de
// calcular el mismo subtotal, una correcta y otra desactualizada, y tarde o temprano
// alguien usa la equivocada. El subtotal ahora lo calcula subtotalCarrito() en pricing.js,
// contra el catálogo vigente.
//
// `price` y `extra` se siguen guardando en cada línea, pero solo como último recurso para
// mostrar algo si el producto se despublicó.

export function addToCart(item) {
  const id = "line_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  cart = [...cart, { id, ...item }];
  save();
  notify();
}

export function removeFromCart(lineId) {
  cart = cart.filter((item) => item.id !== lineId);
  save();
  notify();
}

export function clearCart() {
  cart = [];
  save();
  notify();
}
