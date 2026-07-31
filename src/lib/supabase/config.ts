// Único lugar del panel que lee variables de entorno.
//
// Las tres son PUBLIC_ a propósito: viajan en el bundle y cualquiera las ve con el
// inspector. La anon key no es un secreto — es un identificador de proyecto. Quien
// protege los datos es RLS, no que la clave sea difícil de encontrar.
//
// La service_role key no aparece acá ni puede aparecer nunca: saltea RLS por
// completo y dejaría el catálogo entero escribible desde el navegador. Además ni
// siquiera está declarada en src/env.d.ts, así que escribirla en código de cliente
// es un error de compilación.
// Ver docs/frontend-contract.md §1.

export const SUPABASE_URL: string = import.meta.env.PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY: string = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
export const STORAGE_BUCKET: string =
  import.meta.env.PUBLIC_SUPABASE_STORAGE_BUCKET || "product-images";

export const REST_URL = `${SUPABASE_URL}/rest/v1`;
export const AUTH_URL = `${SUPABASE_URL}/auth/v1`;
export const STORAGE_URL = `${SUPABASE_URL}/storage/v1`;

export const PLACEHOLDER_IMAGE = "/assets/img/placeholder.svg";

/**
 * URL pública de una imagen del bucket de productos. No hay que firmarla ni pedir
 * token: el bucket es público en lectura (006_storage_policies.sql).
 */
export function publicImageUrl(storagePath: string): string {
  return `${STORAGE_URL}/object/public/${STORAGE_BUCKET}/${storagePath}`;
}

/**
 * Faltar una variable de entorno rompe el panel de una forma confusa: el fetch sale
 * contra "undefined/rest/v1/..." y el error habla de DNS, no de configuración.
 * Mejor decirlo de frente al arrancar.
 */
export function configuracionFaltante(): string[] {
  const faltan: string[] = [];
  if (!SUPABASE_URL) faltan.push("PUBLIC_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) faltan.push("PUBLIC_SUPABASE_ANON_KEY");
  return faltan;
}
