// Migración de un solo uso: Firebase RTDB export -> Supabase (products_draft / product_photos_draft / categories).
//
// Corre en local, nunca en CI ni en el sitio. Usa la SUPABASE_SERVICE_ROLE_KEY, que
// bypassea RLS por completo — por eso este script NUNCA se importa desde src/, y por
// eso SUPABASE_SERVICE_ROLE_KEY solo puede vivir en tu .env local (gitignored).
//
// Qué hace, en orden:
//   1. Lee el export JSON del RTDB de Firebase (productPhotos, customProducts, productOverrides, productOrder).
//   2. Arma las 6 categorías con las reglas de negocio ya resueltas (docs/frontend-contract.md §6).
//   3. Arma los 32 productos (30 de fábrica desde src/lib/mock-catalog.js + 2 personalizados),
//      aplicando los overrides de Firebase (precio/nombre/variante) y el orden real (productOrder).
//   4. Descarga cada foto de Firebase Storage (público, sin token) y la resube a
//      product-images/<category_key>/<epoch>.<ext> — el formato que exige el check de la tabla.
//   5. Inserta todo en categories / products_draft / product_photos_draft.
//   6. Imprime el SQL para publicar (el propio publish_catalog() exige un JWT de admin real;
//      simularlo en el SQL Editor es el camino que ya documenta docs/api-endpoints.md §3.8).
//
// Uso:
//   node scripts/migrate-firebase-to-supabase.mjs [ruta-al-export.json] [--dry-run]
//
// Requiere en .env (NUNCA en el chat, NUNCA commiteado):
//   PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   PUBLIC_SUPABASE_STORAGE_BUCKET   (opcional, default "product-images")

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { CATALOG_MOCK } from "../src/lib/mock-catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── .env sin dependencias: parser mínimo, solo KEY=VALUE, ignora comentarios/blancos. ──
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv(path.join(ROOT, ".env"));

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.PUBLIC_SUPABASE_STORAGE_BUCKET || "product-images";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Faltan PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env (raíz del proyecto)."
  );
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const DEFAULT_EXPORT = "D:\\Descargas\\baqtimecatalogo-default-rtdb-export.json";
const exportPathArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const EXPORT_PATH = exportPathArg || DEFAULT_EXPORT;

if (!existsSync(EXPORT_PATH)) {
  console.error(`No encuentro el export en: ${EXPORT_PATH}`);
  process.exit(1);
}
console.log(`Export: ${EXPORT_PATH}${exportPathArg ? "" : " (default)"}`);
if (DRY_RUN) console.log("--dry-run: no se escribe nada, solo se imprime el plan.\n");

const fb = JSON.parse(readFileSync(EXPORT_PATH, "utf8"));

// ============================================================================
// 1. Categorías — reglas ya resueltas en docs/frontend-contract.md §6.
// tote-luxury/lumiere/neceser/cosmetiquera se quedan con los valores por defecto
// (is_imported=false, free_initials=0, extra_initials_price=0, initials_palette=[]).
// ============================================================================
const CATEGORIES = [
  { key: "tote", label: "Tote Personalizado", default_price: 120000, personalizable: true, max_initials: 7, has_variant: true, position: 1, is_imported: false, free_initials: 3, extra_initials_price: 10000, initials_palette: [] },
  { key: "tote-luxury", label: "Tote Bag Luxury", default_price: 130000, personalizable: true, max_initials: 2, has_variant: false, position: 2, is_imported: false, free_initials: 0, extra_initials_price: 0, initials_palette: [] },
  { key: "lumiere", label: "Bag Lumiere", default_price: 140000, personalizable: false, max_initials: 0, has_variant: false, position: 3, is_imported: false, free_initials: 0, extra_initials_price: 0, initials_palette: [] },
  { key: "neceser", label: "Neceser", default_price: 60000, personalizable: true, max_initials: 2, has_variant: false, position: 4, is_imported: false, free_initials: 0, extra_initials_price: 0, initials_palette: [] },
  { key: "cosmetiquera", label: "Cosmetiquera", default_price: 50000, personalizable: true, max_initials: 2, has_variant: false, position: 5, is_imported: false, free_initials: 0, extra_initials_price: 0, initials_palette: [] },
  { key: "makeup-bag", label: "Makeup Bag", default_price: 70000, personalizable: true, max_initials: 3, has_variant: false, position: 6, is_imported: true, free_initials: 0, extra_initials_price: 0, initials_palette: ["Plateado"] },
];

// ============================================================================
// 2. Productos — 30 de fábrica (mock-catalog.js) + overrides de Firebase + 2 personalizados.
// ============================================================================
const overrides = fb.productOverrides || {};
const productOrder = fb.productOrder || {};

function sortOrderFor(categoryKey, idsInCategory) {
  const custom = productOrder[categoryKey];
  if (!custom) {
    // Sin reorden guardado en Firebase: se respeta el orden natural del seed.
    return Object.fromEntries(idsInCategory.map((id, i) => [id, i + 1]));
  }
  const map = Object.fromEntries(custom.map((id, i) => [id, i + 1]));
  // Por si el seed tiene un id que el productOrder no menciona (no debería pasar aquí).
  let next = custom.length + 1;
  for (const id of idsInCategory) if (!(id in map)) map[id] = next++;
  return map;
}

const byCategory = {};
for (const p of CATALOG_MOCK) (byCategory[p.category] ??= []).push(p.id);

const sortMaps = Object.fromEntries(
  Object.entries(byCategory).map(([cat, ids]) => [cat, sortOrderFor(cat, ids)])
);

const factoryProducts = CATALOG_MOCK.map((p) => {
  const ov = overrides[p.id] || {};
  return {
    id: p.id,
    category_key: p.category,
    name: ov.name ?? p.name,
    color: p.color,
    variant: (ov.variant ?? p.variant) || null, // "" (customs) y undefined (tote-luxury/etc) -> null
    hex: p.hex ?? null,
    price: ov.price ?? p.price,
    personalizable: p.personalizable,
    max_initials: p.maxInitials ?? 0,
    group_key: p.groupKey,
    origin: "factory",
    is_active: true,
    sort_order: sortMaps[p.category][p.id],
  };
});

// Personalizados: viven en customProducts, no en mock-catalog.js. Van al final de
// tote-luxury (no tienen entrada en productOrder).
const customEntries = Object.values(fb.customProducts || {});
const toteLuxuryMaxSort = Math.max(...factoryProducts.filter((p) => p.category_key === "tote-luxury").map((p) => p.sort_order));
const customProducts = customEntries.map((c, i) => {
  const ov = overrides[c.id] || {};
  return {
    id: c.id,
    category_key: c.category,
    name: ov.name ?? c.name,
    color: c.color,
    variant: (ov.variant ?? c.variant) || null,
    hex: c.hex ?? null,
    price: ov.price ?? c.price,
    personalizable: c.personalizable,
    max_initials: c.maxInitials ?? 0,
    group_key: c.groupKey,
    origin: "custom",
    is_active: true,
    sort_order: toteLuxuryMaxSort + 1 + i,
  };
});

const allProducts = [...factoryProducts, ...customProducts];

// ============================================================================
// 3. Fotos — se resuben a <category_key>/<epoch>.<ext> (docs/api-endpoints.md §4.3).
// El folder es la CATEGORÍA, no el id de producto: distinto de como estaban en Firebase.
// ============================================================================
const productsById = Object.fromEntries(allProducts.map((p) => [p.id, p]));
const usedNamesPerCategory = {}; // dedupe de epochs dentro del mismo folder

function extFromUrl(url) {
  const withoutQuery = url.split("?")[0];
  const decoded = decodeURIComponent(withoutQuery);
  const ext = decoded.split(".").pop().toLowerCase();
  return ["webp", "jpg", "jpeg", "png"].includes(ext) ? ext : "webp";
}

function epochFromUrl(url) {
  const withoutQuery = url.split("?")[0];
  const decoded = decodeURIComponent(withoutQuery);
  const base = decoded.split("/").pop();
  const digits = base.match(/^\d+/);
  return digits ? digits[0] : String(Date.now());
}

function claimPath(categoryKey, epoch, ext) {
  usedNamesPerCategory[categoryKey] ??= new Set();
  let candidate = epoch;
  while (usedNamesPerCategory[categoryKey].has(candidate)) {
    candidate = String(BigInt(candidate) + 1n);
  }
  usedNamesPerCategory[categoryKey].add(candidate);
  return `${categoryKey}/${candidate}.${ext}`;
}

const photoPlan = []; // { productId, sourceUrl, storagePath, position }
for (const [productId, urls] of Object.entries(fb.productPhotos || {})) {
  const product = productsById[productId];
  if (!product) {
    console.warn(`productPhotos tiene "${productId}" pero no existe ese producto — se omite.`);
    continue;
  }
  urls.forEach((url, position) => {
    const ext = extFromUrl(url);
    const epoch = epochFromUrl(url);
    const storagePath = claimPath(product.category_key, epoch, ext);
    photoPlan.push({ productId, sourceUrl: url, storagePath, position });
  });
}

// ============================================================================
// Resumen antes de escribir nada
// ============================================================================
console.log(`Categorías: ${CATEGORIES.length}`);
console.log(`Productos: ${allProducts.length} (${factoryProducts.length} de fábrica + ${customProducts.length} personalizados)`);
console.log(`Fotos a migrar: ${photoPlan.length}`);

if (DRY_RUN) {
  console.log("\n--dry-run: fin. Nada se escribió en Supabase ni se subió a Storage.");
  process.exit(0);
}

// ============================================================================
// Helpers HTTP — todo con la service_role key, que bypassea RLS por completo.
// ============================================================================
const restHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { ...restHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(`POST ${table} -> ${res.status}: ${await res.text()}`);
  }
}

async function uploadPhoto(storagePath, sourceUrl) {
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`GET ${sourceUrl} -> ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ext = storagePath.split(".").pop();
  const contentType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true", // reintentos seguros: mismo path, sobreescribe en vez de 409
    },
    body: bytes,
  });
  if (!up.ok) throw new Error(`Storage upload ${storagePath} -> ${up.status}: ${await up.text()}`);
}

// ============================================================================
// Escritura
// ============================================================================
console.log("\n1/4 — categorías...");
await upsert("categories", CATEGORIES, "key");

console.log("2/4 — products_draft...");
await upsert("products_draft", allProducts, "id");

console.log(`3/4 — subiendo ${photoPlan.length} fotos a Storage (${BUCKET})...`);
let done = 0;
for (const photo of photoPlan) {
  await uploadPhoto(photo.storagePath, photo.sourceUrl);
  done++;
  if (done % 5 === 0 || done === photoPlan.length) {
    console.log(`   ${done}/${photoPlan.length}`);
  }
}

console.log("4/4 — product_photos_draft...");
await upsert(
  "product_photos_draft",
  photoPlan.map((p) => ({
    product_id: p.productId,
    storage_path: p.storagePath,
    position: p.position,
  })),
  "product_id,position"
);

console.log("\nListo. products_draft y product_photos_draft están poblados.");
console.log("\nFalta publicar. publish_catalog() exige un JWT de admin real, así que");
console.log("la service_role key no sirve para este último paso (por diseño).");
console.log("Corre esto en el SQL Editor de Supabase (docs/api-endpoints.md §3.8):\n");
console.log("begin;");
console.log(
  `set local request.jwt.claims = '{"sub":"d96c740b-07f5-43df-b609-366de4f0c777","role":"authenticated"}';`
);
console.log("select * from public.publish_catalog();");
console.log("commit;");
