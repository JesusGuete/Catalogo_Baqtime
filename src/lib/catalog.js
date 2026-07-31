// Reemplaza a mock-catalog.js — carga el catálogo real desde Supabase.
// Se llama en build (frontmatter de index.astro), no en el navegador: el sitio
// sigue siendo estático, cero llamadas a Supabase desde el HTML generado.
// Mapeo campo por campo: docs/frontend-contract.md §5.
const BASE = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const BUCKET = import.meta.env.PUBLIC_SUPABASE_STORAGE_BUCKET;
const PLACEHOLDER = "/assets/img/placeholder.svg";

const photoUrl = (storagePath) => `${BASE}/storage/v1/object/public/${BUCKET}/${storagePath}`;

async function q(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: { apikey: KEY } });
  if (!res.ok) throw new Error(`Supabase ${res.status} en ${path}: ${await res.text()}`);
  return res.json();
}

export async function loadCatalog() {
  const [categories, prods] = await Promise.all([
    q(
      "categories?select=key,label,default_price,personalizable,max_initials,has_variant,position,is_imported,free_initials,extra_initials_price,initials_palette&order=position"
    ),
    q(
      "products?select=id,category_key,name,color,variant,hex,price,personalizable,max_initials,group_key,sort_order,product_photos(storage_path,position)&order=category_key,sort_order"
    ),
  ]);

  // sort_order solo es único DENTRO de cada categoría (products_category_sort_key es
  // (category_key, sort_order)) — pedirle a PostgREST que ordene solo por sort_order
  // intercala categorías (todos los "1" primero, después todos los "2"...). Se ordena
  // acá por la posición real de la categoría (la misma que usan las pestañas) y luego
  // por sort_order, para que "Todos" agrupe por categoría como en el catálogo original.
  const categoryPosition = Object.fromEntries(categories.map((c) => [c.key, c.position]));
  prods.sort((a, b) => {
    const posDiff = categoryPosition[a.category_key] - categoryPosition[b.category_key];
    return posDiff !== 0 ? posDiff : a.sort_order - b.sort_order;
  });

  const products = prods.map((p) => {
    const gallery = (p.product_photos ?? [])
      .sort((a, b) => a.position - b.position)
      .map((ph) => photoUrl(ph.storage_path));
    return {
      id: p.id,
      category: p.category_key, // los componentes ya usan `category`, no `category_key`
      name: p.name,
      color: p.color,
      variant: p.variant ?? undefined,
      hex: p.hex ?? undefined,
      price: p.price,
      personalizable: p.personalizable,
      maxInitials: p.max_initials,
      groupKey: p.group_key,
      sortOrder: p.sort_order,
      gallery,
      img: gallery[0] ?? PLACEHOLDER, // producto sin fotos: placeholder, no romper
    };
  });

  return {
    products,
    categories,
    CATEGORY_LABELS: Object.fromEntries(categories.map((c) => [c.key, c.label])),
    CATS: [{ key: null, label: "Todos" }, ...categories.map((c) => ({ key: c.key, label: c.label }))],
    IMPORTED_CATEGORIES: categories.filter((c) => c.is_imported).map((c) => c.key),
  };
}
