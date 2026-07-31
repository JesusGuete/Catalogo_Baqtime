# Plan de mejoramiento — Migración a Astro + React + Supabase + Cloudflare Pages

Síntesis operativa del documento `Plan_Mejoramiento.pdf` (fuente de verdad completa).
Este archivo es un resumen para continuidad entre sesiones de chat, no reemplaza al PDF original.

**Proyecto:** Catálogo Baqtime (`baqtime.store`). **Regla base:** todo el trabajo es local.
No se despliega ni se modifica el sitio en producción hasta la Fase 8, con autorización explícita.

## Decisiones tomadas (definitivas)

| # | Decisión |
|---|----------|
| 1 | Hosting final: **Cloudflare Pages** |
| 2 | Renderizado del catálogo público: **SSG** (Astro consulta Supabase en build) |
| 4 | Backend único: **Supabase** (Postgres + Storage) |
| 5 | Auth: **Supabase Auth**, solo panel admin, máximo 4 cuentas |
| 6 | Supabase es la única fuente de verdad del catálogo |
| — | Imágenes optimizadas por Astro en build → WebP/AVIF en el bundle estático |
| — | React solo donde aporta interactividad real (islas) |
| — | **Firebase se elimina por completo** (Auth, RTDB, Storage, dependencias, config) |

## Decisiones pendientes (bloquean la Fase 1)

| # | Decisión | Qué falta |
|---|----------|-----------|
| 3 | Diseño de RLS | Se concreta al recibir el esquema. Recomendación del plan: `SELECT` público solo sobre productos activos; `INSERT/UPDATE/DELETE` restringidos a usuarios en tabla `admins`. Mismo criterio en buckets de Storage. |
| 7 | Estrategia de migración | Paralela (strangler), nunca big-bang. Ver Fase 8. |

## Insumos que Jesús debe entregar antes de la Fase 1

1. Esquema de la base de datos en Supabase (tablas, columnas, tipos, relaciones).
2. Configuración de Supabase: URL del proyecto, `anon key`, nombre del bucket de Storage.
3. Contrato/requerimientos funcionales del panel (si cambia algo respecto de hoy).
4. Correos de las ≤4 cuentas de administración.

**Nunca por chat ni en el repositorio:** la `service_role key` ni el Deploy Hook de Cloudflare.
La `service_role key` casi no hace falta con esta arquitectura: solo para el script de
migración de la Fase 1, corrido en local por Jesús.

## Arquitectura objetivo

```
Cloudflare Pages
├── PRERENDERIZADO (SSG)
│   ├── / → catálogo
│   ├── /producto/[slug] → 1 página por producto
│   └── imágenes WebP/AVIF optimizadas en build
└── ISLA CLIENT-ONLY
    └── /admin → panel React (no prerenderiza)
         │
         ▼ (build time)              ▼ (runtime, solo admin)
                    SUPABASE
        Postgres · Storage · Auth · Edge Functions
        RLS: lectura pública / escritura solo admins

Firebase: ELIMINADO del proyecto por completo
```

**Principio rector:** el catálogo que ve el cliente es estático. Supabase solo se consulta
en build (para generar páginas y optimizar imágenes) y desde el panel admin.
Un visitante normal nunca golpea Supabase.

## Estructura de carpetas propuesta

Astro vive en subcarpeta, en rama aparte. `main` y GitHub Pages siguen sirviendo el sitio
actual sin enterarse, hasta el corte de la Fase 8.

```
Catalogo_Baqtime/
├── (todo lo actual, intacto)     ← producción, no se toca
├── docs/                          ← este archivo y el de estado
└── astro-app/                     ← nuevo, solo en rama de trabajo
    ├── astro.config.mjs
    ├── package.json
    ├── .env.example                ← plantilla, sin secretos
    ├── .env                        ← local, en .gitignore
    ├── public/
    └── src/
        ├── pages/
        │   ├── index.astro         → prerender: catálogo
        │   ├── producto/[slug]     → prerender: 1 página por producto
        │   └── admin/index.astro   → cascarón + isla client:only
        ├── components/
        │   ├── astro/              → estáticos, 0 JS al cliente
        │   └── react/              → islas interactivas
        ├── layouts/
        ├── lib/
        │   ├── supabase.ts         → cliente único (anon key)
        │   └── pricing.ts          → portado tal cual
        └── styles/
```

Sin `src/pages/api/` ni `firebase-admin.ts`: con auth en Supabase, el panel habla directo
con la base y RLS autoriza. No hay capa intermedia que mantener.

## Qué es isla React y qué no

| Componente | Tipo | Por qué |
|---|---|---|
| Cabecera, hero, footer, tarjetas de producto | Astro | HTML puro, cero JS |
| Carrusel de colecciones | Astro | Ya funciona con scroll nativo + CSS |
| Filtros + búsqueda + orden | React (`client:load`) | Estado compartido, re-render frecuente |
| Carrito + panel + checkout | React (`client:load`) | Estado + localStorage + persistencia |
| Galería del producto | React (`client:visible`) | Navegación entre fotos |
| Panel admin completo | React (`client:only`) | App interactiva tras login; no tiene sentido prerenderizarla |

## Fases (orden obligatorio, cada una pequeña/verificable/reversible)

- **Fase 0 — Preparación local.** Astro + React corriendo en local, sin tocar nada actual.
  Rama `feat/astro-migration` (en este proyecto: `migracion/astro-react`).
- **Fase 1 — Esquema, datos y RLS.** 🔒 Bloqueada hasta recibir insumos §5.1 y §5.2 (esquema
  y config de Supabase). Migrar 5 nodos de Firebase RTDB a Postgres, imágenes a Storage,
  políticas RLS. Firebase queda intacto (solo lectura) como respaldo.
- **Fase 2 — Catálogo público en SSG.** `index.astro` consulta Supabase en build. `<Picture>`
  con avif/webp responsive. Sin llamadas a Supabase en el HTML generado.
- **Fase 3 — Islas React del sitio público.** Búsqueda difusa, filtros, orden, carrito,
  checkout, WhatsApp — portados como componentes.
- **Fase 4 — Páginas de producto + SEO.** `producto/[slug].astro` con `getStaticPaths()`,
  redirección de URLs viejas, JSON-LD correcto desde Supabase (cierra deuda D3).
- **Fase 5 — Autenticación Supabase.** Registro público desactivado, ≤4 cuentas manuales,
  tabla `admins`, login con `signInWithPassword`, reautenticación antes de publicar.
- **Fase 6 — Panel admin en React.** Portar las 1.213 líneas de `admin/main.js`: CRUD,
  reordenar, gestión de fotos (recortar/rotar/voltear), borrador/publicación,
  "Deshacer cambios". Riesgo alto: el recortador — se porta al final, probado en iPhone 13.
- **Fase 7 — Publicación y reconstrucción.** Transacción/RPC en Postgres reemplaza la
  escritura atómica de 5 nodos. Deploy Hook de Cloudflare disparado desde Edge Function de
  Supabase (nunca desde el navegador). Limpieza de huérfanos post-publicación.
- **Fase 8 — Despliegue paralelo y corte.** 🔒 Única fase que toca producción. Requiere
  autorización explícita. Cloudflare Pages en paralelo (`*.pages.dev`), validación completa,
  luego mover DNS, dejar GitHub Pages como rollback unos días, y solo al final apagar Firebase.

## Checklist de funcionalidades a preservar (§8 del PDF)

Ninguna fase se da por cerrada sin verificar este checklist completo (sitio público, panel
admin, accesibilidad y seguridad). Ver el PDF original para el listado íntegro con casillas.

## Fuera de alcance de esta migración

- Rediseño visual (se porta el diseño actual tal cual).
- Sistema de pedidos con código de seguimiento (`BQ-2607-4821`) — es otro proyecto.
- Categorías administrables desde el panel — se evalúa después de migrar.
- Cuentas de cliente (los clientes no se loguean).
- Pasarela de pago (se sigue cerrando por WhatsApp).

## Deuda técnica detectada en el código actual (§1.6 del PDF)

| # | Hallazgo | Gravedad | Resolución |
|---|---|---|---|
| D1 | `whatsapp-order.js` medio muerto (`sendWhatsapp()` ya no se llama) | Baja | Se limpia al portar carrito (Fase 3) |
| D2 | `site-images.js`: `IMG_DATA = {}` vacío, `R()` es función identidad | Baja | Desaparece con la migración de imágenes |
| D3 | JSON-LD con URLs hardcodeadas, no refleja overrides de precio | Media | Se resuelve en Fase 4 |
| D4 | Registro público abierto en Firebase Auth (`.write: auth != null`) | **Alta** | Desaparece junto con Firebase (§3) |
| D5 | `default-photos.js` ya vaciado pero import/fallback siguen en `getPhotos()` | Baja | Auditoría final antes de eliminar |
