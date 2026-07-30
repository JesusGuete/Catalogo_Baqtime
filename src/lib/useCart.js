import { useEffect, useState } from "react";
import { getCart, subscribe, hydrateCart } from "./cart-store.js";

// Hook que conecta cualquier componente React al store del carrito.
// Se suscribe al montar y se desuscribe al desmontar (para no dejar listeners
// colgando si el componente desaparece).
export function useCart() {
  const [items, setItems] = useState(getCart());
  useEffect(() => {
    hydrateCart();
    setItems(getCart());
    return subscribe((next) => setItems(next));
  }, []);
  return items;
}
