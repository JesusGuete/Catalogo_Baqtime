# Estado del proyecto — Migración Astro + React + Supabase

> Actualizar este archivo al terminar cada sesión de trabajo.

## Fase actual

**Fase 0 — Preparación local.** ✅ Completada y **verificada por Jesús en su propia máquina**
(`npm install`, `npm run dev` con clic funcional en la isla, `npm run build` y `npm run preview`
con la isla también reactiva sobre el build de producción).
**Fase 1 — Esquema, datos y RLS.** 🔒 Bloqueada. Esperando insumos de Jesús (ver
`docs/plan-mejoramiento.md`, sección "Insumos que Jesús debe entregar").

## Rama de trabajo

`migracion/astro-react` (equivalente a `feat/astro-migration` del PDF).
Creada a partir de `main` en el commit `eff5e3b` ("Add files via upload").
`main` no fue tocada en ningún momento.

## Cambios realizados en esta sesión (Fase 0)

1. Creada la rama `migracion/astro-react`.
2. Creado `astro-app/` con scaffold mínimo de Astro (`npm create astro@latest --template minimal`).
3. Añadida la integración de React (`npx astro add react`): quedaron instalados
   `@astrojs/react`, `react`, `react-dom`, `@types/react`, `@types/react-dom`.
4. Configurado `tsconfig.json` en modo `strict` (generado automáticamente por `astro add react`).
5. Creado `src/components/react/PruebaIsla.jsx`: componente de prueba con `useState`,
   solo para verificar hidratación de islas. **Se debe borrar antes de la Fase 2.**
6. Sobrescrito `src/pages/index.astro` con una página de prueba que monta `<PruebaIsla client:load />`.
   **Es un placeholder, no el catálogo real.**
7. Creado `astro-app/.env.example` con los nombres de variables (sin valores):
   `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_STORAGE_BUCKET`,
   `SUPABASE_SERVICE_ROLE_KEY`.
8. Verificado que `.gitignore` (generado por Astro) ya excluye `node_modules/`, `.env`,
   `.env.production`, `dist/`, `.astro/`.
9. Creados `docs/plan-mejoramiento.md` y este archivo.

## Archivos afectados

- Nuevo: `astro-app/` (árbol completo del scaffold).
- Nuevo: `docs/plan-mejoramiento.md`.
- Nuevo: `docs/estado-proyecto.md`.
- Sin cambios: `index.html`, `admin.html`, `assets/`, `CNAME`, `README.md`, `robots.txt`,
  `sitemap.xml` — el catálogo actual sigue funcionando igual, sin build step.

## Comandos ejecutados y verificaciones

```bash
git checkout -b migracion/astro-react
cd astro-app
npm create astro@latest . -- --template minimal
npm install
npx astro add react -y
npx astro build     # ✅ genera dist/ sin errores, 1 página
npx astro dev        # ✅ responde 200 en http://localhost:4321/, isla hidratada (astro-island presente en el HTML)
git status --porcelain --branch   # ✅ confirma que main no cambió
```

- `npm run build` → `dist/` generado, "1 page(s) built", sin errores.
- `npm run dev` → servidor arriba, HTTP 200, se detectó `astro-island` en el HTML servido
  (confirma que React se está hidratando).
- `main` verificado sin diferencias respecto del zip original entregado por Jesús.

## Decisión nueva: pasarelas de pago (Wompi / Nequi / Mercado Pago) — PLAN SEPARADO

Jesús pidió incluir pagos en línea. Se decidió tratarlo como **plan aparte**, no
dentro de esta migración. Motivos técnicos que hay que conservar:

- El PDF ya lo listaba fuera de alcance ("Pasarela de pago — se sigue cerrando por
  WhatsApp"), §10.
- **Requiere servidor.** La firma de integridad de Wompi es SHA-256 de
  `reference + amount + currency + secret`. Ese secreto no puede ir en el bundle de
  un sitio estático: cualquiera podría firmar una transacción por un monto alterado.
  Mercado Pago tiene el mismo problema con su access token.
- **Requiere webhook + tabla de pedidos.** No se puede confiar en la redirección de
  "pago exitoso": PSE puede tardar minutos en aprobarse. Hace falta recibir la
  confirmación por webhook y guardarla. Hoy no existe ninguna tabla de pedidos.
- **Encaja sin romper el SSG:** firma y webhook pueden vivir en una Supabase Edge
  Function, que el plan ya contempla (Fase 7 usa una para el Deploy Hook).
- **Nequi ya es un método dentro de Wompi** (junto con tarjetas, PSE, botón
  Bancolombia y efectivo). Con Wompi solo se cubre lo que Jesús pidió; Mercado Pago
  se solapa casi por completo. Recomendación: empezar con una sola pasarela.
- **Implicación de tiempo:** afecta el esquema de base de datos de la Fase 1, que
  todavía no se ha entregado. Las tablas de pedidos/pagos conviene definirlas
  ANTES de crear el esquema, no agregarlas después.
- Trámite externo: abrir cuenta Wompi exige validar NIT/Cámara de Comercio.

## Avance adicional (adelanto de Fase 2/3, con datos MOCK — antes de tener Supabase)

Con autorización de Jesús, se adelantó trabajo de front usando datos temporales
(`src/lib/mock-catalog.js`, copia literal de `catalog-seed.js` + `catalog-data.js`)
mientras la Fase 1 sigue bloqueada. **No se avanzó la Fase 1 real** (no hay conexión
a Supabase todavía).

Se creó:
- `src/styles/site.css`: copia tal cual de `assets/css/site.css` (sin rediseñar).
- `public/assets/img/{logo.png,placeholder.svg}`: copiados tal cual.
- `src/lib/mock-catalog.js`: `CATALOG_MOCK`, `CATS`, `CATEGORY_LABELS` — mismos 30
  productos de siempre, marcado explícitamente como temporal.
- `src/lib/search-utils.js`: buscador difuso (Levenshtein) + sorters, portados
  función por función desde `catalog-grid.js`, sin cambiar el comportamiento.
- `src/components/astro/Header.astro`, `Hero.astro`, `CollectionsCarousel.astro`,
  `Footer.astro`: estáticos, HTML/CSS idénticos a `index.html`. El carrusel usa un
  `<script>` plano (no React) para las flechas, igual que `collections-carousel.js`
  — el scroll táctil sigue siendo 100% nativo vía CSS.
- `src/components/react/CatalogExplorer.jsx`: isla `client:load` que junta lo que
  antes eran 3 módulos (`search.js`, `catalog-filters.js`, `catalog-grid.js`) en un
  componente con estado React. Búsqueda expandible, tabs de categoría, dropdown de
  color, "Ordenar por", grid de resultados.
- Puente entre `CollectionsCarousel.astro` (estático) y `CatalogExplorer.jsx` (isla):
  evento DOM personalizado `baqtime:set-category`, porque son dos componentes
  separados que no comparten estado en memoria directamente.
- `src/pages/index.astro` reescrito: ensambla Header + Hero + CollectionsCarousel +
  CatalogExplorer + Footer, mismo `<head>` (fuentes, meta description) que el real.

**Deliberadamente NO incluido en este paso** (para no hacer un cambio grande de una
sola vez):
- Clic en una tarjeta para abrir el modal/página de producto (Fase 3/4).
- Carrito + checkout por WhatsApp (próxima isla propuesta).
- Panel admin (Fase 6).
- JSON-LD / SEO por producto (Fase 4).
- Imágenes reales optimizadas por Astro (Fase 2) — las de Hero/Carrusel usan por
  ahora las mismas URLs de Firebase Storage que ya son públicas hoy, solo para no
  dejar el hero vacío; las tarjetas de producto usan el placeholder local.

**Verificado:**
- `npm run build` → 1 página, sin errores.
- `npm run dev` → HTML servido contiene las 30 tarjetas del catálogo mock, el
  buscador, y la isla `CatalogExplorer` montada.
- Revisión manual de que todo `class=` en el `.jsx` quedó como `className=`
  (requisito de JSX de React, distinto de `.astro` que sí acepta `class=`).

**Pendiente de que Jesús verifique en su navegador** (interactividad real, que un
`curl` no puede probar): escribir en el buscador, cambiar de pestaña de categoría,
abrir el dropdown "Filtrar", cambiar "Ordenar por", y clic en "Ver colección" desde
el carrusel de arriba (debe saltar al catálogo ya filtrado por esa categoría).

### Segundo bloque: vista de producto + carrito + checkout WhatsApp

Portado desde `product-modal.js`, `cart.js`, `shipping-form.js`, `initials.js`,
`pricing.js`. Archivos nuevos:

- `src/lib/pricing.js` — `PRICE_SHIP`, `PRICE_EXTRA_INITIALS`, `fmt()`. Se omitieron
  `ADVANCE`/`getAdvance()` a propósito: solo los usaba `whatsapp-order.js` (flujo
  muerto, deuda D1) y el checklist §8 exige el mensaje "sin mención de anticipo".
- `src/lib/initials.js` — colores de iniciales; Makeup Bag solo plateado.
- `src/lib/cart-store.js` — carrito con `localStorage` (misma clave `baqtime_cart`).
  Es un *store* con suscriptores porque hay DOS islas React separadas que necesitan
  el mismo carrito (el contador del encabezado y la app de la tienda) y no comparten
  estado por props. Hidrata solo en el navegador, para no romper el build SSG.
- `src/lib/useCart.js` — hook que conecta un componente al store.
- `src/lib/shipping-validation.js` — mismas reglas y **mismos textos de error**.
- `src/lib/whatsapp.js` — generador del mensaje, portado literalmente.
- `src/components/react/ProductView.jsx` — vista de producto a página completa.
- `src/components/react/CartPanel.jsx` — panel lateral + `CartLine` + `CartTotals`.
- `src/components/react/Checkout.jsx` — página de checkout + envío a WhatsApp.
- `src/components/react/ShopApp.jsx` — isla principal que junta los cuatro.
- `src/components/react/CartBadge.jsx` — isla mínima del encabezado (contador).
- `Header.astro` ahora monta `CartBadge`; `index.astro` monta `ShopApp`.

**Verificación fuerte hecha:** se comparó el mensaje de WhatsApp generado por la
implementación original (copiada literal de `cart.js`) contra la portada, en 6
escenarios: tote sin extra, tote con extra por >3 iniciales, Lumiere sin
personalización, Makeup Bag plateado, carrito de 3 líneas mezcladas, y documento
opcional vacío. **Los 6 salieron idénticos carácter por carácter.** Esto cubre el
criterio de aceptación de la Fase 3 del plan.

**Pendiente a propósito:** el deep link `?producto=t1` y la sincronía con el botón
atrás del navegador NO se portaron, porque la Fase 4 reemplaza el modal por páginas
reales `/producto/[slug]` — implementarlo ahora sería trabajo que se bota.

**Pendiente de que Jesús verifique en el navegador:** clic en una tarjeta abre el
producto; escribir iniciales actualiza el contador y el precio (probar >3 iniciales
en un Tote para ver el cargo extra); "Agregar al carrito" sube el contador del
encabezado; el carrito sobrevive a recargar la página (F5); "Finalizar compra" pide
los datos de envío y valida; el botón de WhatsApp abre el chat con el mensaje
completo.

## Bloqueos

Fase 1 bloqueada hasta recibir de Jesús:
1. Esquema de la base de datos en Supabase.
2. Configuración de Supabase (URL, `anon key`, nombre del bucket).
3. Contrato funcional del panel (si cambia algo).
4. Correos de las ≤4 cuentas de administración.

## Siguiente paso

Cuando Jesús entregue los insumos de la Fase 1:
1. Revisar el esquema propuesto contra el modelo actual de "5 árboles paralelos" de Firebase
   (`productPhotos`, `customProducts`, `deletedProducts`, `productOverrides`, `productOrder`).
2. Diseñar las políticas RLS concretas (lectura pública solo de productos activos,
   escritura restringida a la tabla `admins`).
3. Escribir el script de migración de un solo uso (Firebase RTDB + Storage → Supabase),
   para correr en local con la `service_role key` de Jesús (nunca compartida en el chat).
4. No avanzar a Fase 2 hasta verificar conteos (productos y fotos) Firebase == Supabase.

## Notas para retomar en un chat nuevo

- El repo de referencia es `github.com/JesusGuete/Catalogo_Baqtime`, rama `main` intacta.
- La rama `migracion/astro-react` con `astro-app/` y `docs/` existe solo en el entorno de
  trabajo local de esta sesión; **no fue pusheada a GitHub** (sin autorización para eso aún).
- Si se retoma en un chat nuevo, pedir a Jesús que vuelva a subir el zip del proyecto (o
  confirmar que ya se pusheó la rama) y leer primero este archivo y `docs/plan-mejoramiento.md`.
