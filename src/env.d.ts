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
