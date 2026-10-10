# Plan — Pagos en línea (sin pasar por WhatsApp)

> Estado (2026-10-10): **fases 0 a 5 hechas** en la rama `feature/pagos-en-linea` y probadas en
> sandbox con la ventana de Wompi. Ahora el cliente paga **dentro de la tienda**, sin esa ventana
> (fase 3b): falta probar esa parte en la vista previa con los datos de sandbox.
> Retoma la decisión que había quedado pendiente en `docs/estado-proyecto.md` ("pasarelas de
> pago — PLAN SEPARADO").

## Qué cambia

**Hoy:** Checkout → `POST /api/pedidos` guarda el pedido en `pendiente_pago` →
`/pedido/gracias` muestra *Confirmar pago por WhatsApp* → la dueña comparte los medios de pago,
recibe el comprobante y marca el pago a mano en el panel (`confirm_order_payment`). El correo de
confirmación y el recordatorio de las 12 h llevan al mismo botón de WhatsApp.

**Después:** en el paso de pago de la compra el cliente elige el medio y paga ahí mismo, como
en las tiendas grandes: tarjeta débito o crédito (con cuotas), PSE, Nequi o Botón Bancolombia,
sin que se abra la ventana de Wompi (fase 3b). El pedido se guarda al pulsar "Pagar". Cuando
Wompi aprueba, la tienda marca el pedido como pagado y
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
- Los datos de la tarjeta nunca pasan por nuestro servidor: el navegador los cifra y los
  manda directo a Wompi, que devuelve un token (fase 3b).
- No hace falta un SDK: la API de Wompi, una firma SHA-256 y un webhook. Encaja en el Worker de
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
- ~~**`POST /api/pagos/iniciar`**: firmaba el checkout del widget de Wompi.~~ Reemplazado en la
  fase 3b por `POST /api/pagos/crear`, que crea la transacción desde el servidor.
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
  Desde la fase 3b es un enlace a `/pedido/pagar/<token>`.
- **`/pedido/gracias`**: botón principal **Pagar ahora** y, debajo, "Prefiero pagar por
  transferencia (WhatsApp)".
- **Nueva `/pedido/pago/<token>?id=<tx>`**: el `redirect_url` de cada transacción (ruta y no
  `?p=`, porque Wompi le agrega `?id=`). Ahí vuelve el cliente desde su banco, y ahí lleva la
  página de pago cuando la tarjeta o Nequi terminan.
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
- Probado de punta a punta en sandbox con la ventana de Wompi (BQ-079086 por PSE, BQ-467995
  con una tarjeta rechazada y después aprobada).

### Fase 3b — Pagar dentro de la tienda, sin la ventana de Wompi

Decidido por Jesús el 2026-10-10: "como Adidas / Vélez". El cliente elige el medio en la página
y paga ahí, con los campos de la tarjeta en la tienda. Medios: **tarjeta débito o crédito, PSE,
Nequi y Botón Bancolombia**, más la transferencia por WhatsApp mientras siga.

- **`PagoEnLinea.jsx`**: la lista de medios, cada uno con su formulario. Lo usan el paso de pago
  de la compra (`CheckoutApp.jsx`) y la página nueva `/pedido/pagar/<token>`.
  - **Tarjeta:** número (con la franquicia), vencimiento MM/AA, CVV, nombre y cuotas (las que
    permita el comercio; con débito, 1). Se valida en la página (Luhn, vencimiento, largo del CVV).
  - **PSE:** banco (la lista real de Wompi), persona natural o jurídica, tipo y número de
    documento. Lleva al cliente a su banco y el banco lo devuelve al resultado.
  - **Nequi:** el celular. "Revisa tu celular y acepta la notificación" y espera el resultado.
  - **Botón Bancolombia:** lleva a Bancolombia y vuelve al resultado.
  - **Las dos casillas de Wompi** (reglamento y autorización de datos), obligatorias, con sus
    enlaces. Sin ellas el servidor no crea la transacción.
- **La tarjeta nunca llega a nuestro servidor** (`tarjeta-wompi.ts`): el navegador la cifra
  (JWE, RSA-OAEP-256 + A256GCM, con la llave de cifrado que publica Wompi) y la manda directo a
  Wompi, que devuelve un token `tok_…`. Al servidor solo llega ese token. Con los campos en
  nuestra página el cumplimiento PCI pasa a **SAQ A-EP**: la página de pago debe servirse siempre
  por HTTPS y sin scripts de terceros que no hagan falta.
- **El servidor crea la transacción** (`crearPagoDirecto` en `pagos.ts`), con la llave privada:
  el monto sale de `crear_intento_pago`, la firma de integridad la pone el servidor, y del
  navegador solo llegan el medio y sus datos. La deja anotada de una vez (`procesarTransaccion`),
  así el webhook y la conciliación la encuentran aunque el cliente cierre la página.
- **3D Secure** en las tarjetas: se pide siempre (`is_three_ds`), con los datos del navegador
  que exige el banco. Si el banco pide un reto, se muestra dentro de la página, en un marco de
  500 px de alto. `WOMPI_3DS=0` lo apaga si Wompi no lo tiene activo para el comercio.
  - **Pendiente:** Wompi exige mostrar el **logo de Mastercard ID Check** durante la
    verificación. Hoy hay un texto en su lugar; falta el archivo oficial del logo.
- **Endpoints nuevos:**
  - `GET /api/pagos/opciones`: llave pública, ambiente, enlaces de las condiciones, cuotas y
    bancos de PSE. Nada de ningún cliente; se cachea 5 minutos.
  - `POST /api/pagos/crear`: valida el medio y sus datos y crea la transacción. Responde `txId`.
  - `GET /api/pagos/estado?p=<token>&id=<tx>`: consulta y anota la transacción (el mismo
    `procesarTransaccion`) y responde el estado, la URL del banco o el paso de 3D Secure. Solo
    por transacciones del pedido del token.
- **La página pregunta por el estado** cada 2,5 s, hasta 5 minutos. Con un estado final lleva a
  `/pedido/pago/<token>?id=<tx>`, que lo vuelve a comprobar y muestra el resumen.
- **Un solo pedido por compra:** el pedido se guarda al pulsar "Pagar", pero el carrito se vacía
  recién al salir de la página. Si el pago falla y el cliente reintenta, cambia de medio o
  recarga, se usa el mismo pedido (queda anotado en `sessionStorage` con lo que se compra y los
  datos; si algo de eso cambia, es otro pedido).
- **Nueva `/pedido/pagar/<token>`**: el resumen del pedido y los medios de pago, para un pedido
  ya guardado. Ahí llevan el "Pagar ahora" de los correos, de gracias y del seguimiento, y el
  "Intentar de nuevo" de un pago rechazado. Pedido pagado o en otro estado → al seguimiento;
  pagos en línea apagados → a gracias; pago en proceso → un aviso.
- **Se quitan** `pago-widget.ts` y `/api/pagos/iniciar`: el widget de Wompi ya no se usa en
  ninguna parte.
- Comprobado en local con llaves inventadas y respuestas simuladas: los cuatro medios y la
  transferencia, las validaciones, el cifrado de la tarjeta, el reto de 3D Secure en el marco, un
  reintento con el mismo pedido y la vista en celular. Falta la prueba real en sandbox.

### Fase 4 — Correos ✅

Con los pagos en línea encendidos y el pedido esperando el pago, los correos ofrecen pagar en la
página. Con el interruptor apagado dicen exactamente lo de antes (comprobado texto por texto).

- **Confirmación** (`correo-pedido.ts`) y **recordatorio de las 12 horas**
  (`correo-recordatorio.ts`): el botón principal pasa a ser **Pagar ahora**, que lleva a
  `/pedido/pagar/<token>`, con el resumen y los medios de pago (antes, a `/pedido/gracias`).
  WhatsApp queda como "Prefiero pagar por transferencia". También cambian el texto
  ("El siguiente paso es pagarlo: con tarjeta, PSE, Nequi o Botón Bancolombia"), el aviso de las 24 horas
  y la vista previa en la bandeja, en HTML y en texto plano.
- La regla vive en un solo lugar: `enlacePagar()` en `pagos.ts` devuelve el enlace o nada,
  según el interruptor. Quien manda el correo decide si el pedido espera el pago:
  - **Checkout:** siempre.
  - **Reenvío desde el panel:** solo si sigue en `pendiente_pago` y sin pagar. Un pedido ya
    pagado o vencido no recibe "Pagar ahora".
  - **Recordatorio:** siempre, porque `pedidos_por_recordar()` ya filtra.
- ~~`correo-tienda.ts`: aviso "Pago recibido".~~ Hecho en la fase 2, junto con el envío
  automático del correo de "pago confirmado" (`correo-estado.ts`, tipo `aprobado`).

### Fase 5 — Panel ✅

- **Lista de pedidos** (`OrdersView.tsx`): "PAGADO EN LÍNEA" cuando el pago lo aprobó Wompi
  (los pagos a mano siguen diciendo "PAGADO"), y "REVISAR PAGO" cuando hay un cobro de más o un
  monto distinto. Sale de una sola consulta aparte (`resumenPagos()` en `orders.repo.ts`).
- **Detalle del pedido** (`OrderDetail.tsx`):
  - El encabezado dice "PAGADO EN LÍNEA …" o "PAGO EN LÍNEA EN PROCESO".
  - Tarjeta **PAGO EN LÍNEA · WOMPI** (`PagosEnLineaCard.tsx`). Arriba, los avisos que piden
    actuar: "Cobro de más: hay que devolverlo" y "Pago con un monto distinto", con la referencia
    para buscarla en el dashboard de Wompi. Debajo, cada transacción con su estado, medio de
    pago, monto, referencia e id de Wompi. Las ventanas de pago que el cliente cerró sin pagar
    solo se cuentan.
  - **Confirmar pago** a mano sigue igual, pero si hay un pago en línea en proceso advierte que,
    si ese pago se aprueba, quedará como cobro de más.
- **Si la migración 027 no está corrida**, los pagos se leen aparte y sin lanzar error: el panel
  se ve como antes. Por eso `order_payments` no va embebido en `SELECT_PEDIDO_DETALLE`.
- Comprobado: la tarjeta en el navegador, con datos inventados que cubren aprobado, rechazado,
  cobro de más y ventana cerrada sin pagar. La lista y el detalle reales no se probaron con
  sesión de admin.

### Fase 6 — Pruebas y salida a producción

**Sandbox** (PR JesusGuete/Catalogo_Baqtime#97, en borrador):

- Llaves de prueba cargadas en Cloudflare en el entorno **Production**, no en Previews: el Worker
  se conectó a Builds antes de "Worker Previews", así que las vistas previas de cada rama usan
  las variables y secretos de producción (cambiar al modelo nuevo no se puede deshacer). Es
  seguro: el código publicado no las lee hasta el merge, y aun después, `pagosEnLineaActivos()`
  apaga los pagos en línea si encuentra llaves de prueba en `baqtime.store`. (En local, `.env`.)
- El webhook necesita una URL pública. La más simple es la vista previa de la rama que crea
  Cloudflare para el PR + `/api/pagos/wompi`, pegada como URL de eventos de sandbox en Wompi.
  En local: `cloudflared tunnel --url http://localhost:4321`.
- **La vista previa usa la misma base que la tienda real:** los pedidos de prueba quedan en el
  panel (se borran desde ahí) y la copia de cada pedido llega al correo de la tienda.
- Al terminar, dejar `PAGOS_EN_LINEA` vacío hasta el día de la salida.
- Casos a probar:
  - Tarjeta aprobada (`4242 4242 4242 4242`) y rechazada (`4111 1111 1111 1111`), según la doc
    de sandbox. Con 3D Secure, el escenario lo elige `WOMPI_3DS_SANDBOX` (`challenge_v2` por
    defecto, el que muestra el reto).
  - Nequi aprobado (`3991111111`) y rechazado (`3992222222`).
  - PSE: banco "1" aprueba, "2" rechaza.
  - Botón Bancolombia.
  - Abandonar el pago en el banco o cerrar la página a mitad de camino.
  - Pagar dos veces.
  - Volver a la página de resultado con el `id` de la transacción de otro pedido.
  - Webhook con el checksum alterado (debe rechazarse).
  - Webhook repetido (debe salir un solo correo).
  - Pago aprobado después de que el pedido venció (debe reactivarlo).
  - Monto alterado (no debe aprobar).

**Producción:**

> **Nunca hacer merge con las llaves de sandbox cargadas y el interruptor encendido.** La tienda
> real aceptaría pagos de prueba: un pedido "pagado" con una tarjeta de prueba quedaría aprobado
> sin que entre plata. Primero se cambian las llaves, después el merge.

1. Correr `027_pagos_en_linea.sql` en Supabase.
2. Con `PAGOS_EN_LINEA` vacío, cambiar a las llaves de producción y configurar la URL de eventos
   de producción en Wompi (`https://baqtime.store/api/pagos/wompi`). Después, hacer el deploy
   (merge).
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
| `WOMPI_PUBLIC_KEY` | texto | Va al navegador para tokenizar la tarjeta. Se lee en tiempo de ejecución y no como `PUBLIC_`, para poder pasar de sandbox a producción sin reconstruir el sitio |
| `WOMPI_PRIVATE_KEY` | **secreto** | Crear y consultar transacciones |
| `WOMPI_INTEGRITY_SECRET` | **secreto** | Firmar el monto |
| `WOMPI_EVENTS_SECRET` | **secreto** | Verificar el webhook |
| `PAGOS_EN_LINEA` | texto | `1` = encendido |
| `WOMPI_3DS` | texto | `0` apaga 3D Secure en las tarjetas. Vacío = encendido |
| `WOMPI_3DS_SANDBOX` | texto | Solo sandbox: el escenario de 3D Secure. Vacío = `challenge_v2` |

Se documentan en `.env.example`, con el mismo estilo de las demás.

## Casos borde

| Caso | Qué pasa |
|---|---|
| El cliente abandona el pago (cierra la página o no vuelve del banco) | El pedido sigue pendiente. Puede pagar desde gracias, el seguimiento o el correo, y a las 12 h le llega el recordatorio |
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

El 2026-10-10:

6. **Pagar dentro de la tienda**, sin la ventana de Wompi, con los campos de la tarjeta en la
   página ("como Adidas"). Medios: tarjeta débito o crédito, PSE, Nequi y Botón Bancolombia.
   DaviPlata y QR quedan por fuera (no se ofrecen sin la ventana de Wompi).

## Orden de entrega (un PR por paso)

1. `027_pagos_en_linea.sql` y tipos. ✅
2. `wompi.ts`, `pagos.ts`, los endpoints y la conciliación. Con el interruptor apagado no se
   ve nada. ✅ (los pasos 1 y 2 van juntos en `feature/pagos-en-linea`)
3. Tienda: gracias, resultado, seguimiento y checkout.
4. Correos.
5. Panel.
6. Encendido en producción y limpieza.
