// Validación del lado del cliente que ESPEJA los CHECK de la base.
//
// Por qué existe si la base ya valida: porque un `23514` genérico no le dice al
// dueño qué campo está mal. La base es la autoridad — esto no la reemplaza, la
// anticipa para poder señalar el campo exacto mientras escribe, en vez de mandarlo a
// adivinar después de un guardado fallido.
//
// Regla que hay que respetar al tocar este archivo: cada validación de acá tiene que
// corresponder a un CHECK real del esquema, citado en el comentario. Una validación
// del front que la base no tenga es una regla inventada que alguien va a poder saltar
// por la API, y una regla de la base que el front no tenga es un error críptico.

import type { Category, Product, ProductOrigin } from "../../types/database";

/** Errores por campo. Vacío = válido. */
export type ErroresCampo<T> = Partial<Record<keyof T, string>>;

/** El mismo CHECK que products.hex (001_schema.sql:51). Los 6 dígitos: `#000` no sirve. */
export const PATRON_HEX = /^#[0-9A-Fa-f]{6}$/;

const esEnteroNoNegativo = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0;

// ============================================================================
// Categorías
// ============================================================================

export function validarCategoria(c: Partial<Category>): ErroresCampo<Category> {
  const e: ErroresCampo<Category> = {};

  // PK: sin key no hay categoría, y es la que después va en la ruta de las imágenes,
  // así que se restringe al mismo alfabeto que acepta storage_path.
  if (!c.key?.trim()) {
    e.key = "La clave es obligatoria.";
  } else if (!/^[a-z0-9_-]+$/.test(c.key)) {
    e.key = "Solo minúsculas, números, guion y guion bajo. Va en la ruta de las imágenes.";
  }

  if (!c.label?.trim()) e.label = "El nombre visible es obligatorio.";

  // CHECK default_price >= 0 (001_schema.sql:37)
  if (!esEnteroNoNegativo(c.default_price)) {
    e.default_price = "Tiene que ser un número entero de pesos, sin decimales ni negativos.";
  }

  // CHECK max_initials >= 0 (001_schema.sql:39)
  if (!esEnteroNoNegativo(c.max_initials)) {
    e.max_initials = "Tiene que ser un número entero, 0 o más.";
  }

  if (!Number.isInteger(c.position)) {
    e.position = "La posición tiene que ser un número entero.";
  }

  // CHECK categories_free_initials_range (008_category_rules.sql:44-45).
  // Este es el que más importa avisar: si free_initials supera a max_initials, el
  // recargo no se puede alcanzar NUNCA y el precio queda mal sin que nadie vea un error.
  if (!esEnteroNoNegativo(c.free_initials)) {
    e.free_initials = "Tiene que ser un número entero, 0 o más.";
  } else if (
    typeof c.max_initials === "number" &&
    (c.free_initials as number) > c.max_initials
  ) {
    e.free_initials = `No puede superar el máximo de iniciales (${c.max_initials}). Si lo supera, el recargo nunca se cobra.`;
  }

  // CHECK categories_extra_price_nonneg (008_category_rules.sql:50-51)
  if (!esEnteroNoNegativo(c.extra_initials_price)) {
    e.extra_initials_price = "Tiene que ser un número entero de pesos, 0 o más.";
  }

  return e;
}

// ============================================================================
// Productos
// ============================================================================

const ORIGENES: readonly ProductOrigin[] = ["factory", "custom"];

export function validarProducto(p: Partial<Product>): ErroresCampo<Product> {
  const e: ErroresCampo<Product> = {};

  if (!p.id?.trim()) e.id = "El identificador es obligatorio.";

  if (!p.category_key?.trim()) e.category_key = "Elige una categoría.";

  // CHECK length(btrim(name)) > 0 (001_schema.sql:48) — un nombre de solo espacios
  // pasa un `required` de HTML pero lo rechaza la base.
  if (!p.name?.trim()) e.name = "El nombre no puede estar vacío.";

  if (!p.color?.trim()) e.color = "El color es obligatorio.";

  if (!p.group_key?.trim()) {
    e.group_key = "El grupo de color es obligatorio: es lo que agrupa las variantes del mismo modelo.";
  }

  // CHECK hex ~ '^#[0-9A-Fa-f]{6}$' (001_schema.sql:51). La columna admite NULL.
  if (p.hex != null && p.hex !== "" && !PATRON_HEX.test(p.hex)) {
    e.hex = "Tiene que ser #RRGGBB con los 6 dígitos. `#000` no sirve, va `#000000`.";
  }

  // CHECK price >= 0 (001_schema.sql:52). Pesos enteros: 130000, nunca 130000.00.
  if (!esEnteroNoNegativo(p.price)) {
    e.price = "Tiene que ser un número entero de pesos, sin decimales ni negativos.";
  }

  // CHECK max_initials >= 0 (001_schema.sql:54)
  if (!esEnteroNoNegativo(p.max_initials)) {
    e.max_initials = "Tiene que ser un número entero, 0 o más.";
  }

  // CHECK origin in ('factory','custom') (001_schema.sql:56)
  if (p.origin != null && !ORIGENES.includes(p.origin)) {
    e.origin = "Solo puede ser `factory` o `custom`.";
  }

  if (!Number.isInteger(p.sort_order)) {
    e.sort_order = "El orden tiene que ser un número entero.";
  }

  return e;
}

/** `true` si no hay ningún error. */
export function esValido<T>(errores: ErroresCampo<T>): boolean {
  return Object.keys(errores).length === 0;
}

/**
 * Identificador de un producto nuevo. Misma convención que el panel anterior:
 * `custom_<epoch_ms>`. No hace falta que sea bonito — no aparece en ninguna URL
 * pública, solo agrupa fotos y líneas de carrito.
 */
export function nuevoIdProducto(): string {
  return `custom_${Date.now()}`;
}
