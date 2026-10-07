# Plan — Política de datos, cookies y páginas legales de Baqtime

Objetivo: cumplir la ley colombiana y dar confianza al cliente en `baqtime.store`.
Se implementa por pasos, un PR por paso. **No reemplaza la revisión de un abogado**:
los textos finales conviene que los lea uno antes de publicarlos.

Normas base:
- **Ley 1581 de 2012** y **Decreto 1377 de 2013** (compilado en el Decreto 1074 de 2015) — datos personales.
- **Ley 1480 de 2011** (Estatuto del Consumidor), art. 47 (retracto) y art. 50 (comercio electrónico).
- **Ley 2439 de 2024** — protección al consumidor de comercio electrónico (canal de quejas, devoluciones).

---

## Diagnóstico: qué datos toca hoy el sitio

| Dónde | Qué dato | Archivo |
|---|---|---|
| Checkout | Nombre, teléfono, correo, ciudad, dirección, documento (obligatorio fuera de Barranquilla) | `src/components/react/Checkout.jsx` |
| Base de datos | Todo lo anterior + productos, iniciales, totales, pago, guía | `supabase/sql/010_orders.sql` (Supabase) |
| Correos | Correo del cliente → resumen y avisos de estado | `src/lib/correo.ts` (Resend, EE. UU.) |
| WhatsApp | Mensaje del pedido para coordinar el pago | `src/lib/whatsapp.js` |
| Navegador | `localStorage: baqtime_cart` (carrito) y `sessionStorage: baqtime_carga_vista` (pantalla de carga) | `src/lib/cart-store.js`, `PantallaCarga.astro` |
| Terceros | Google Fonts (recibe la IP del visitante), Cloudflare (hosting) | `SiteHead.astro`, `wrangler.jsonc` |

**Huecos encontrados:**
1. No existe política de tratamiento de datos publicada.
2. El checkout recoge datos **sin pedir autorización** ni guardar prueba de ella (Decreto 1377, art. 7 y 8).
3. No hay términos y condiciones, ni política de cambios/garantía/retracto.
4. El footer no identifica al vendedor (nombre o razón social, NIT/cédula, dirección, correo) — exigido por Ley 1480, art. 50.
5. No hay un canal formal de PQR (Ley 2439 de 2024).

**¿Cookies?** Hoy el sitio **no usa cookies de analítica ni publicidad** (no hay Google Analytics,
Meta Pixel ni TikTok Pixel). Solo guarda el carrito en el navegador, algo estrictamente necesario.
→ **No hace falta banner de cookies todavía.** Basta una página corta de cookies.
→ **Si algún día se agrega un píxel o analítica, el banner con consentimiento previo pasa a ser obligatorio.**

**¿Registro en el RNBD de la SIC?** Solo obligatorio para empresas con activos totales
mayores a 100.000 UVT. Baqtime casi seguro **no está obligada**. Confirmar con el contador.

---

## Paso 0 — Insumos ✅ (entregados el 2026-10-07)

Viven en `src/lib/legal.ts` (único lugar; lo leen la política, el footer, el checkout y el endpoint).

| Dato | Valor |
|---|---|
| Responsable | Persona natural, nombre comercial **Baqtime** |
| Documento | **No se publica** (decisión de Jesús) |
| Dirección de notificación | Diagonal 32 #88-699, Cartagena, Bolívar (sin punto de atención al público; opera en Barranquilla) |
| Correo de datos y PQR | baqtime.store@gmail.com |
| Teléfono / WhatsApp | +57 313 4954478 |
| Entrega | 2 a 4 días hábiles **desde que se aprueba el pago** (incluye producción y envío) |
| Garantía | 1 mes, con pruebas del defecto (fotos/video) |
| Medios de pago | Todos: transferencia, Nequi, tarjeta de crédito, etc. |
| Píxeles / analítica | No, por ahora → sin banner de cookies |
| Promociones | Tal vez → se pide autorización aparte y opcional desde ya |

> Jesús eligió publicar solo "Baqtime", sin nombre completo ni cédula. Para comercio
> electrónico la Ley 1480 (art. 50) pide nombre y NIT (en persona natural, el NIT sale de la
> cédula); conviene que un abogado confirme si basta con lo publicado.

---

## Paso 1 — Política de Tratamiento de Datos Personales ✅

**Hecho:** `src/pages/politica-de-datos.astro` (estática: abre aunque Supabase esté caído), enlace en el footer ("Ayuda y contacto"), estilos `.legal` en `site.css`. Incluye además la sección de cookies.

**Entregable:** página `src/pages/politica-de-datos.astro` → `baqtime.store/politica-de-datos`.

Contenido mínimo (Decreto 1377, art. 13):
1. Identificación del responsable (insumos 1–5).
2. Datos que se recogen (los de la tabla del diagnóstico).
3. **Finalidades:** procesar y producir el pedido, enviarlo, coordinar el pago, enviar resumen y
   avisos de estado, atender PQR, cumplir obligaciones contables y legales. Promociones solo si
   el cliente lo autoriza aparte.
4. **Encargados y transferencia internacional:** Supabase (base de datos), Resend (correos),
   Cloudflare (hosting), Meta/WhatsApp (mensajería), transportadora (envío). Varios tienen
   servidores fuera de Colombia → decirlo explícitamente.
5. **Derechos del titular** (Ley 1581, art. 8): conocer, actualizar, rectificar, pedir prueba de la
   autorización, ser informado del uso, quejarse ante la SIC, revocar y pedir supresión.
6. **Procedimiento y plazos:**
   - Consultas: **10 días hábiles**, prorrogables 5 más.
   - Reclamos: **15 días hábiles**, prorrogables 8 más.
   - Canal: correo del insumo 4 (y WhatsApp como apoyo).
7. Área responsable de atender las solicitudes.
8. Plazo de conservación de los datos (ver Paso 6).
9. Medidas de seguridad (RLS, enlaces de pedido con token aleatorio, sesión de admin en memoria).
10. Fecha de vigencia y versión (p. ej. `v1 — 2026-xx-xx`).

**También:** enlace en el footer (nueva columna "Legal").

---

## Paso 2 — Autorización en el checkout ✅

**Hecho:** dos casillas sin marcar en `Checkout.jsx` (datos: obligatoria; promociones: opcional),
el endpoint rechaza el pedido sin autorización (400) y `create_order()` guarda
`data_consent_at`, `data_policy_version` y `marketing_consent`.

**⚠️ Para publicar:** correr `supabase/sql/024_autorizacion_datos.sql` en Supabase **antes** de
publicar el código. Si se publica primero, los pedidos se crean igual pero sin guardar la prueba.


**Entregables:**
1. **Casilla obligatoria, sin marcar por defecto**, antes de "Confirmar pedido":
   > ☐ Autorizo a Baqtime a tratar mis datos personales para gestionar mi pedido, según la
   > [Política de Tratamiento de Datos](/politica-de-datos).
2. **Aviso de privacidad corto** debajo del formulario (una línea con finalidad + enlace).
3. **Validación en el servidor** (`src/pages/api/pedidos.ts`): rechazar el pedido si no viene la autorización.
4. **Prueba de la autorización** — migración `supabase/sql/024_autorizacion_datos.sql`:
   - `orders.data_consent_at timestamptz` — cuándo autorizó.
   - `orders.data_policy_version text` — qué versión de la política aceptó.
5. (Opcional) Segunda casilla, **no obligatoria**, para recibir promociones — solo si el insumo 11 es "sí".

---

## Paso 3 — Términos y condiciones + identificación del vendedor ✅

**Hecho:** `src/pages/terminos.astro` (estática), aviso en el checkout ("Al confirmar aceptas
los Términos… los personalizados no tienen cambio ni retracto, salvo por garantía") y, en el
footer, el correo y los enlaces a Términos y a la Política.

**Reglas que fijó Jesús (2026-10-07):**
- Producto equivocado o dañado: avisar dentro de **2 días hábiles** desde la entrega.
- Cancelación: solo **antes de empezar la producción**.
- Garantía: si tiene reparación, se repara; si no, cambio o devolución. Los envíos los paga Baqtime.
- Devolución de dinero: **1 a 15 días hábiles** (retracto de productos sin personalizar: máximo
  15 días calendario, por Ley 2439 de 2024).

**Entregable:** página `src/pages/terminos.astro` → `baqtime.store/terminos`.

**Referencia:** los términos de Vélez (velez.com.co), que Jesús compartió. Se toma la
estructura, no el texto. Secciones que aplican a Baqtime: propiedad intelectual, precios,
variación de color en pantalla, errores de precio, política de producto personalizado (lo
aprobado por el cliente no tiene cambio ni devolución salvo garantía), reporte de daños con
fotos en un plazo fijo y cancelación del pedido. No aplican (son de una S.A.S. grande): origen
de fondos, línea de transparencia, reportes a Supersociedades.


Contenido:
1. Identificación del vendedor (Ley 1480, art. 50).
2. Cómo se hace un pedido, cuándo se considera confirmado, y que vence si no se paga.
3. Precios en COP, costo de envío, medios de pago.
4. Tiempos de producción y envío; rastreo de la guía.
5. **Garantía** (Ley 1480): qué cubre y cómo se pide.
6. **Derecho de retracto:** los productos **personalizados con iniciales están exceptuados**
   (Ley 1480, art. 47). Hay que decirlo claro *antes* de la compra.
7. Cambios y devoluciones para lo que no sea personalizado (si aplica).
8. Canal de PQR (Paso 5).

**También:**
- Footer: línea con nombre/razón social, NIT, dirección y correo.
- Checkout: una línea "Los productos personalizados no admiten retracto" con enlace a términos.

---

## Paso 4 — Política de cookies

**Entregable:** página `src/pages/cookies.astro` → `baqtime.store/cookies` (corta).

Contenido:
1. Qué guarda el sitio: `baqtime_cart` (carrito) y `baqtime_carga_vista` (pantalla de carga).
   Ambos son técnicos/necesarios, no identifican a la persona y se borran limpiando el navegador.
2. Terceros: Google Fonts y Cloudflare.
3. Que hoy **no** se usan cookies de analítica ni publicidad.
4. Cómo borrarlas desde el navegador.

**Banner:** no se implementa ahora. Si se agrega analítica o un píxel, se hace en un PR aparte:
banner con "Aceptar / Rechazar", el script del píxel **solo carga después de aceptar**, y se
actualiza esta página.

---

## Paso 5 — Canal de PQR y procedimiento interno ✅

**Hecho:** `docs/procedimiento-datos.md`. Tiene canales, plazos legales, paso a paso, consultas SQL
para buscar, corregir, dar de baja de promociones y borrar o anonimizar (probadas contra la base
real), plantillas de respuesta, registro de solicitudes e incidentes de seguridad. El correo de
contacto ya está en el footer, la política y los términos.

**Entregables:**
1. Correo dedicado (insumo 4) visible en footer, política y términos.
2. `docs/procedimiento-datos.md` (interno, no público):
   - Cómo recibir una solicitud, cómo verificar identidad (que coincida correo/teléfono del pedido).
   - Plantillas de respuesta: consulta, actualización, supresión, revocación.
   - Registro de solicitudes (fecha de llegada, fecha límite, respuesta).
   - Qué hacer ante un incidente de seguridad (reportarlo a la SIC dentro de los 15 días hábiles
     siguientes a detectarlo).
3. (Opcional) Página `/contacto` o formulario de PQR.

---

## Paso 6 — Conservación y supresión de datos ✅

**Decisión de Jesús (2026-10-07):** guardar los datos **un mes**. Todavía no lleva contabilidad.
Si empieza a llevarla o a facturar, hay que revisar el plazo.

**Hecho:**
- `supabase/sql/025_conservacion_datos.sql`: `anonimizar_pedidos_vencidos()` reemplaza los datos
  personales y conserva productos, valores y fechas. Vence:
  - un pedido entregado, un mes después de la entrega (cuando termina la garantía);
  - un pedido enviado y nunca marcado entregado, un mes y medio después del despacho;
  - un pedido sin pagar, un mes después de creado.
- `src/lib/conservacion.ts` + `src/worker.ts`: la tarea programada la llama cada 30 minutos.
- Política, sección 10: dice el plazo nuevo. La versión sube a `2026-10-07.2`.
- `docs/procedimiento-datos.md`: anonimización automática y limpieza mensual de Gmail y WhatsApp.

---

## Paso 7 — Mejoras opcionales

1. **Auto-hospedar las fuentes** (Unna, Work Sans, JetBrains Mono) en vez de Google Fonts: el
   navegador del cliente deja de enviar su IP a Google y la página carga más rápido.
2. Enlace a la política en el pie de los correos de pedido (`src/lib/correo-pedido.ts`).
3. Revisar cada año la política y subir la versión.

---

## Orden sugerido y estado

| # | Paso | Depende de | Estado |
|---|---|---|---|
| 0 | Insumos | — | ✅ |
| 1 | Política de datos | 0 | ✅ |
| 2 | Autorización en checkout | 1 | ✅ (falta correr 024) |
| 3 | Términos + identificación | 0 | ✅ |
| 4 | Cookies | 1 | ✅ como sección de la política; página aparte opcional |
| 5 | Canal PQR + procedimiento | 0 | ✅ |
| 6 | Conservación y supresión | 1 | ✅ (falta correr 025) |
| 7 | Opcionales | — | ⬜ |

Siguiente: Paso 7 (opcionales).
