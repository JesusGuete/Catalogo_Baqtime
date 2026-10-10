# Plan — Pagos en línea (sin pasar por WhatsApp)

> Estado (2026-10-09): **fases 0 a 2 hechas** en la rama `feature/pagos-en-linea`: cuenta de
> Wompi abierta, migración `027_pagos_en_linea.sql` y servidor, con el interruptor apagado. Falta
> correr la 027 en Supabase, cargar las llaves de sandbox y seguir con la fase 3 (tienda).
> Retoma la decisión que había quedado pendiente en `docs/estado-proyecto.md` ("pasarelas de
> pago — PLAN SEPARADO").

## Qué cambia

**Hoy:** Checkout → `POST /api/pedidos` guarda el pedido en `pendiente_pago` →
`/pedido/gracias` muestra *Confirmar pago por WhatsApp* → la dueña comparte los medios de pago,
recibe el comprobante y marca el pago a mano en el panel (`confirm_order_payment`). El correo de
confirmación y el recordatorio de las 12 h llevan al mismo botón de WhatsApp.

**Después:** el pedido se guarda igual → en `/pedido/gracias` el botón principal es
**Pagar ahora**, que abre el checkout de Wompi encima de la página (tarjeta débito y crédito,
PSE, Botón Bancolombia, Nequi, DaviPlata, QR Bancolombia y pagos a cuotas, que son los medios
del plan de la cuenta). Cuando Wompi aprueba, la tienda marca el pedido como pagado y
aprobado por su cuenta, le manda al cliente el correo de "pago confirmado" y a la tienda un aviso.
La dueña no tiene que hacer nada para que el pedido siga.

**Lo que NO cambia:**

- El pedido se sigue guardando **antes** de pagar: si el pago falla o el cliente cierra la
  ventana, la venta no se pierde y puede pagar después.
- El precio lo sigue calculando el servidor (`src/pages/api/pedidos.ts`); se cobra
  `orders.total`, que queda fijo al crear el pedido.
- El panel sigue pudiendo confirmar pagos a mano (transferencias directas, reactivar un pedido
  vencido).
- El vencimiento a 24 h y el recordatorio a las 12 h.

## Pasarela: Wompi

- Cubre con una sola integración lo que se usa en Colombia. El plan de la cuenta (Avanzado
  Agregador + Compra y paga después Bancolombia) incluye tarjetas débito y crédito, PSE, Botón
  Bancolombia, Nequi, DaviPlata, QR Bancolombia, SU+ Pay y Compra y Paga Después, todos a
  2,65 % + $700 + IVA. Mercado Pago se solapa casi entero; no vale la pena tener dos.
- El checkout lo aloja Wompi (widget): los datos de la tarjeta nunca pasan por nuestro
  servidor.
- No hace falta un SDK: un `<script>`, una firma SHA-256 y un webhook. Encaja en el Worker de
  Cloudflare sin dependencias nuevas (`crypto.subtle`).
- **Costo (verificar al contratar):** plan general 2,65 % + $700 + IVA por transacción
  aprobada. En un pedido de $150.000 son unos $5.560. Desde septiembre de 2026 el QR anuncia
  1 % + IVA, aunque no está claro a qué comercios aplica.
- Alternativa si Wompi no aprueba la cuenta: Bold. Usa el mismo modelo de firma de integridad
  más webhook, así que el diseño de abajo sirve casi igual.

## Reglas que no se negocian

1. **El monto sale de la base, nunca del navegador.** `amount-in-cents = orders.total × 100`.
2. **La firma de integridad se calcula en el servidor:**
   `SHA256(referencia + monto_en_centavos + "COP" + [expiración] + secreto_de_integridad)`.
   Si la firma se hiciera en el navegador, cualquiera podría firmar un monto alterado.
3. **La redirección de vuelta no confirma nada.** Wompi lo dice de forma explícita. Un pago
   solo se da por aprobado cuando el servidor consultó la transacción con la **llave privada**
   (`GET /v1/transactions/{id}`; desde 2026 esa consulta ya no funciona con la llave pública).
   El webhook, la página de regreso y la conciliación programada llaman a la misma función.
4. **El webhook se verifica** (`X-Event-Checksum` = SHA256 de los valores de
   `signature.properties` + `timestamp` + secreto de eventos), y aun así se vuelve a consultar
   la transacción antes de tocar el pedido. Un evento falsificado no puede aprobar nada.
5. **Monto y moneda exactos** contra el intento guardado. Si no coinciden, se registra pero no
   se aprueba, y el panel lo muestra.
6. **Idempotente.** Wompi reintenta el webhook a los 30 min, a las 3 h y a las 24 h si no
   recibe un 200, y el cliente puede recargar la página de resultado. El pedido se aprueba una
   sola vez y el correo sale una sola vez.
7. **Los secretos de Wompi van como Secret del Worker**, igual que la `service_role`: nunca
   como `PUBLIC_`, nunca declarados en `src/env.d.ts`.

## Fases

### Fase 0 — Trámites y decisiones (Jesús) ✅ cuenta abierta

- ~~Abrir la cuenta de comercio en Wompi.~~ Hecho. Las llaves de **sandbox** se obtienen al registrarse,
  así que la implementación puede avanzar mientras se aprueba la de producción.
- Habilitar en el dashboard los métodos de pago elegidos.
- Sacar las llaves del **panel web** (comercios.wompi.co → Mi cuenta → secretos para
  integración técnica), no de la app del celular. Se ponen en `.env` (local) o en Cloudflare
  (producción), nunca en el chat.
- Configurar la URL de eventos. Producción: `https://baqtime.store/api/pagos/wompi`. Sandbox:
  una URL pública de pruebas (ver la Fase 6).
- ~~Responder las decisiones abiertas.~~ Hecho, ver [Decisiones](#decisiones).

### Fase 1 — Base de datos: `supabase/sql/027_pagos_en_linea.sql` ✅ escrita, falta correrla

Idempotente, igual que el resto del directorio. Solo agrega cosas, así que se corre **antes**
de publicar el código sin romper la tienda en vivo.

**Tabla `order_payments`** (cada fila es un intento de pago, porque Wompi exige una referencia
única por transacción y un pago rechazado no se puede reintentar con la misma):

| Columna | Notas |
|---|---|
| `id uuid` pk | |
| `order_id uuid` | FK → `orders`, `on delete cascade` |
| `provider text` | `'wompi'`. Es texto y no enum, igual que `carrier` |
| `reference text unique` | `BQ-483920-k7p2`: el número de pedido más un sufijo aleatorio, para que la dueña lo reconozca en el dashboard de Wompi |
| `amount_in_cents bigint`, `currency text` | Se copian del pedido al crear el intento |
| `provider_tx_id text unique` | Se llena cuando Wompi crea la transacción |
| `status text` | `CREATED` · `PENDING` · `APPROVED` · `DECLINED` · `VOIDED` · `ERROR` |
| `payment_method_type text` | `CARD`, `PSE`, `NEQUI`, `BANCOLOMBIA_TRANSFER`… |
| `anomaly text` | `monto_distinto` · `pago_duplicado` · null |
| `created_at`, `updated_at` | |

RLS: solo SELECT para admins. Ninguna escritura para `anon` ni `authenticated`: igual que en
`order_notifications`, el panel no puede marcar un pago que no ocurrió.

**Funciones** (`security definer`, `set search_path = ''`, solo `service_role`):

- `crear_intento_pago(p_token text)`: valida que el pedido esté en `pendiente_pago`, sin
  pagar y sin vencer, que no tenga ya un intento `PENDING` (así no se paga dos veces mientras un
  PSE está en proceso) y que no pase de 20 intentos. Crea la fila y devuelve la referencia, el
  monto y los datos del cliente para prellenar el checkout.
- `registrar_transaccion_pago(p_reference, p_tx_id, p_status, p_method, p_amount_in_cents, p_currency)`:
  actualiza el intento. Si queda `APPROVED`, el monto coincide y el pedido no estaba pagado,
  en **una sola transacción** pone `paid_at`, pasa el estado a `aprobado` y agrega al
  historial *"Pago aprobado en línea (Nequi)"*. Acepta un pedido `no_confirmado`, por la
  misma razón que `confirm_order_payment`. Devuelve `{ aprobado_ahora, order_id }` para que el
  servidor sepa si le toca mandar el correo.

**Cambios a lo existente:**

- `pago_en_proceso(order_id)`: la única definición de "hay un pago andando" (un `PENDING` con
  transacción, de menos de una hora). La usan las cuatro funciones de abajo para no
  contradecirse.
- `pedido_publico()` suma `pago`: `'pendiente' | 'en_proceso' | 'pagado'`. No expone
  referencias ni ids de transacción.
- `expire_stale_orders()` no vence un pedido con un intento `PENDING`: PSE o efectivo pueden
  tardar.
- `pedidos_por_recordar()` excluye los pedidos con un pago en proceso.
- El comentario de `paid_at` en 010 (*"No payment gateway is involved"*) se corrige en la
  propia 027.
- `src/types/database.ts`: tipos `OrderPayment` y `pago` en `OrderPublic`. El embebido de
  `order_payments` en `SELECT_PEDIDO_DETALLE` va en la fase 5: pedir una tabla que todavía no
  existe hace fallar toda la consulta del panel.

### Fase 2 — Servidor ✅

- **`src/lib/wompi.ts`**: sin estado y sin secretos escritos en el código.
  - `firmaIntegridad()`.
  - `verificarEvento()`: checksum con comparación en tiempo constante.
  - `urlApi()`: sandbox (`https://sandbox.wompi.co/v1`) o producción
    (`https://production.wompi.co/v1`), según si la llave empieza por `pub_test_` o
    `pub_prod_`.
  - `consultarTransaccion(id)`, con la llave privada.
- **`src/lib/pagos.ts` → `procesarTransaccion(txId)`**: la **única** forma de aprobar un pago.
  Consulta a Wompi, llama a `registrar_transaccion_pago` y, si devolvió `aprobado_ahora`, manda
  en `waitUntil` el correo `aprobado` (`enviarAvisoEstado`, que lo deja anotado en
  `order_notifications`, así el panel no lo repite) y el aviso "Pago recibido" a la tienda
  (`enviarAvisoPagoTienda`, plantilla nueva en `correo-tienda.ts`).
- **`POST /api/pagos/iniciar`**, body `{ token }`: llama a `crear_intento_pago`, firma y
  responde `{ checkout: { publicKey, reference, amountInCents, currency, signature,
  redirectUrl, customerData } }`, con la forma exacta que espera `new WidgetCheckout(...)`. No
  usa `expirationTime`: el plazo del pedido ya lo controla `crear_intento_pago` al pulsar.
- **`POST /api/pagos/wompi`** (el webhook):
  1. Verifica el checksum. Si no coincide, responde 401.
  2. Verifica que `environment` corresponda a las llaves configuradas.
  3. Llama a `procesarTransaccion(tx.id)`.
  4. Responde 200 aunque la referencia sea desconocida (y lo deja en el log). Solo responde 503
     si falla algo propio, como Supabase caído, para que Wompi reintente.
- **`src/worker.ts` → `scheduled()`**: además del recordatorio, cada 30 min hace una
  conciliación. Pasa por `procesarTransaccion` los intentos `PENDING` que tengan
  `provider_tx_id` y más de 10 min. Así cubre un webhook que se perdió.
- **Interruptor `PAGOS_EN_LINEA`**: variable de texto en Cloudflare, que sobrevive a los
  deploys gracias a `keep_vars`. Apagado, todo funciona como hoy. Sirve para volver atrás en un
  minuto sin hacer deploy.

### Fase 3 — Tienda ✅

- **`Checkout.jsx`**: ~~el botón dice "Continuar al pago"~~. Se quedó en "Confirmar pedido":
  sigue siendo cierto (confirma el pedido y lleva a pagar), el mensaje para invitar clientes lo
  nombra así, y cambiarlo según el interruptor obligaba a pasar el dato a una página que se
  cachea en el borde.
- **`BotonPagar.astro`**: el botón **Pagar ahora**, compartido por las tres páginas de abajo.
  Pide el checkout firmado, carga el widget recién al pulsar y, con la transacción, lleva a
  `/pedido/pago/<token>?id=…`. Si algo falla, muestra el motivo y queda listo para reintentar.
- **`/pedido/gracias`** pasa a ser la pantalla de pago:
  - Botón principal **Pagar ahora**: llama a `POST /api/pagos/iniciar` y abre
    `new WidgetCheckout({...}).open(cb)` con `https://checkout.wompi.co/widget.js`, que se
    carga solo en esta página. Debajo, los logos o nombres de los métodos aceptados.
  - Opción secundaria, si se decide conservarla: "Prefiero pagar por transferencia (WhatsApp)".
- **Nueva `/pedido/pago/<token>?id=<tx>`**: es el `redirect-url` que ya manda `iniciar` (ruta y
  no `?p=`, porque Wompi le agrega `?id=`), y también a donde lleva el callback del widget.
  - Llama a `procesarTransaccion(id)` y comprueba que la transacción sea del pedido del token.
  - Muestra un estado. El pedido manda: si está pagado, está pagado.
    - **Aprobado:** "¡Pago recibido!", con el número de pedido y el enlace al seguimiento.
    - **En proceso:** "Tu pago se está procesando". Se recarga sola cada 10 s durante 2 min.
    - **Rechazado:** "No se completó el pago", con el botón **Intentar de nuevo** y la opción de
      transferencia.
    - **En revisión:** Wompi aprobó pero el pedido no quedó pagado (monto distinto o pago
      duplicado). Se le avisa que lo estamos revisando.
    - **Confirmando:** Wompi o la base no contestaron. Se reintenta sola.
    - **Sin pago:** no llegó una transacción de este pedido. Ofrece pagar.
  - Usa `cabecerasPrivadas()` y responde 404 si el token no existe, sin preguntarle a Wompi.
- **`PedidoVista.astro`** (seguimiento): con `pago === 'pendiente'` y el pedido sin vencer,
  muestra el botón **Pagar ahora**. Con `en_proceso`, un aviso. El texto de `no_confirmado`
  sigue mandando a WhatsApp. **Solo por el enlace privado:** el buscador por número no pasa el
  token y no muestra el botón.
- Comprobado en el navegador con el interruptor apagado: el botón se ve y muestra el aviso de
  "no disponible". Con el widget real de Wompi cargado, `WidgetCheckout` y su `open()` existen
  tal como los usa el código. Falta probarlo de punta a punta con llaves de sandbox.

### Fase 4 — Correos

- **`correo-pedido.ts`**: el botón principal pasa a ser "Pagar ahora" (→ `/pedido/gracias?p=…`)
  y WhatsApp queda como opción secundaria. "El siguiente paso es coordinar el pago por WhatsApp"
  → "El siguiente paso es pagar tu pedido". Esto aplica al HTML, al texto plano y al texto de
  vista previa en la bandeja.
- **`correo-recordatorio.ts`**: el mismo cambio.
- ~~`correo-tienda.ts`: aviso "Pago recibido".~~ Hecho en la fase 2, junto con el envío
  automático del correo de "pago confirmado" (`correo-estado.ts`, tipo `aprobado`).

### Fase 5 — Panel

- **`OrderDetail.tsx`**, bloque "Pago":
  - Método, id de la transacción en Wompi, fecha y estado de cada intento.
  - Alerta si hubo `monto_distinto` o `pago_duplicado`. El reembolso se hace en el dashboard de
    Wompi.
- **`OrdersView.tsx`**: "PAGADO" pasa a ser "PAGADO · EN LÍNEA" o "PAGADO · MANUAL".
- "Confirmar pago" a mano se queda como está.

### Fase 6 — Pruebas y salida a producción

**Sandbox:**

- Llaves de prueba en `.env` local.
- El webhook necesita una URL pública: `cloudflared tunnel --url http://localhost:4321`, y esa
  URL se pega como URL de eventos de sandbox en Wompi.
- Casos a probar:
  - Tarjeta aprobada (`4242 4242 4242 4242`) y rechazada (`4111 1111 1111 1111`), según la doc
    de sandbox.
  - Nequi aprobado y rechazado, con los números de prueba de la doc.
  - PSE en estado pendiente que luego se aprueba.
  - Cerrar el widget sin pagar.
  - Pagar dos veces.
  - Volver a la página de resultado con el `id` de la transacción de otro pedido.
  - Webhook con el checksum alterado (debe rechazarse).
  - Webhook repetido (debe salir un solo correo).
  - Pago aprobado después de que el pedido venció (debe reactivarlo).
  - Monto alterado (no debe aprobar).

**Producción:**

1. Correr `027_pagos_en_linea.sql` en Supabase.
2. Hacer deploy con `PAGOS_EN_LINEA` apagado y cargar los secretos de producción.
3. Encender el interruptor y hacer una compra real de poco valor; después anularla o
   reembolsarla desde Wompi.
4. Durante la primera semana, revisar los logs del Worker (`[pagos]`) y el panel.

### Fase 7 — Limpieza

- **`src/lib/whatsapp.js`**:
  - `buildProductInviteMessage` nombra botones que cambian ("Confirmar pago por WhatsApp"); el
    propio comentario del archivo pide actualizarlo cuando eso pase.
  - `buildOrderMessage` ("Me comparte los medios de pago…") queda solo para la opción
    secundaria.
- **Footer:** revisar el texto "Pedidos por WhatsApp".
- **Documentación:** quitar la frase "se sigue cerrando por WhatsApp" de
  `docs/plan-mejoramiento.md` y de `docs/frontend-contract.md`.

## Variables nuevas

| Variable | Tipo | Para qué |
|---|---|---|
| `WOMPI_PUBLIC_KEY` | texto | Va al widget. Se lee en tiempo de ejecución y no como `PUBLIC_`, para poder pasar de sandbox a producción sin reconstruir el sitio |
| `WOMPI_PRIVATE_KEY` | **secreto** | Consultar transacciones |
| `WOMPI_INTEGRITY_SECRET` | **secreto** | Firmar el monto |
| `WOMPI_EVENTS_SECRET` | **secreto** | Verificar el webhook |
| `PAGOS_EN_LINEA` | texto | `1` = encendido |

Se documentan en `.env.example`, con el mismo estilo de las demás.

## Casos borde

| Caso | Qué pasa |
|---|---|
| El cliente cierra el widget | El pedido sigue pendiente. Puede pagar desde gracias, el seguimiento o el correo, y a las 12 h le llega el recordatorio |
| PSE se queda `PENDING` durante horas | No se vence ni se recuerda mientras haya un intento en proceso; el webhook lo resuelve |
| Pago aprobado después de vencido | Se aprueba igual y el pedido se reactiva |
| Dos intentos aprobados | Vale el primero; el segundo queda marcado `pago_duplicado` para reembolsarlo |
| Monto distinto | No se aprueba y el panel muestra una alerta |
| Se pierde el webhook | Lo cubren la página de regreso y la conciliación cada 30 min |
| Cambia el precio del producto después del pedido | No afecta: se cobra `orders.total`, que quedó fijo |
| `VOIDED` (anulación de tarjeta) | Se registra en el intento. El pedido **no** se desaprueba solo; decide la dueña |

## Decisiones

Tomadas por Jesús el 2026-10-09:

1. **Pasarela:** Wompi. La cuenta ya está abierta.
2. **WhatsApp:** queda como opción secundaria ("pagar por transferencia") mientras se comprueba
   que Wompi funciona bien. Después se quita.
3. **Medios de pago:** todos los del plan (tarjetas débito y crédito, PSE, Botón Bancolombia,
   Nequi, DaviPlata, QR, pagos a cuotas). Sin efectivo en corresponsal.
4. **Comisión:** se suben los precios para cubrirla, comisión e IVA incluidos. Cómo: ver
   `docs/plan-precios-con-comision.md`.
5. **Correo de "pago confirmado":** sale automático cuando Wompi aprueba.

## Orden de entrega (un PR por paso)

1. `027_pagos_en_linea.sql` y tipos. ✅
2. `wompi.ts`, `pagos.ts`, los endpoints y la conciliación. Con el interruptor apagado no se
   ve nada. ✅ (los pasos 1 y 2 van juntos en `feature/pagos-en-linea`)
3. Tienda: gracias, resultado, seguimiento y checkout.
4. Correos.
5. Panel.
6. Encendido en producción y limpieza.
