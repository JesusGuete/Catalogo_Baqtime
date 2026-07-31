// La URL de un producto.
//
// Vive en un solo archivo porque la usan tres lugares que tienen que coincidir
// exactamente: la tarjeta del catálogo que enlaza, la página que resuelve el enlace, y
// el sitemap que se lo entrega a Google. Si dos de esos calcularan la ruta por su
// cuenta, un enlace roto no se notaría hasta que alguien lo reportara.

/** Forma mínima que necesita este módulo. El catálogo trae bastante más. */
export interface ProductoEnlazable {
  id: string;
  name: string;
}

/** Combining diacritical marks: lo que `normalize("NFD")` separa de cada letra. */
const TILDES = /[̀-ͯ]/g;

/**
 * `Tote Bag Negra` + `t1` → `tote-bag-negra-t1`
 *
 * El id va al final y no es decorativo: dos productos pueden llamarse igual y la URL
 * tiene que seguir siendo única. Nadie parsea este string para recuperar el id — la
 * página compara el slug completo, así que cambiar esta función no rompe enlaces
 * viejos de forma silenciosa: dejan de resolver y devuelven 404.
 */
export function slugProducto(p: ProductoEnlazable): string {
  const base = p.name
    .normalize("NFD")
    .replace(TILDES, "") // "Lumière" → "Lumiere"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${p.id.toLowerCase()}`;
}

export function rutaProducto(p: ProductoEnlazable): string {
  return `/producto/${slugProducto(p)}`;
}

/** Busca el producto cuyo slug coincide. Devuelve `undefined` si no existe. */
export function productoPorSlug<T extends ProductoEnlazable>(
  productos: T[],
  slug: string
): T | undefined {
  return productos.find((p) => slugProducto(p) === slug);
}
