/// <reference types="astro/client" />

// Tipa las variables de entorno del proyecto. Sin esto, `import.meta.env.PUBLIC_X`
// es `any` y un typo en el nombre de la variable pasa el compilador sin chistar
// para después explotar en runtime con un fetch a "undefined/rest/v1/...".
//
// Las tres PUBLIC_ son las únicas que puede ver el navegador. SUPABASE_SERVICE_ROLE_KEY
// NO se declara acá a propósito: si no está en el tipo, escribirla en código de
// cliente es un error de compilación, no una decisión de criterio.
interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly PUBLIC_SUPABASE_STORAGE_BUCKET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * El entorno del Worker de Cloudflare: variables y secretos que NUNCA llegan al navegador.
 *
 * Es un módulo virtual del runtime, así que no existe en disco y ningún @types instalado
 * lo declara — sin esto `astro check` falla aunque en ejecución funcione perfecto.
 *
 * Acá vive SUPABASE_SERVICE_ROLE_KEY. Que esté en este módulo y no en ImportMetaEnv es la
 * frontera: `import { env } from "cloudflare:workers"` solo se puede resolver dentro del
 * servidor, así que un componente de React que intente leer el secreto no compila.
 *
 * (Reemplaza a Astro.locals.runtime.env, que se eliminó en Astro 6.)
 */
declare module "cloudflare:workers" {
  export const env: Record<string, string | undefined>;
}
