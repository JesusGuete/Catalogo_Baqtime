# Procedimiento interno — Solicitudes de datos personales y quejas (PQR)

Cómo atiende Baqtime lo que promete la [Política de Tratamiento de Datos](https://baqtime.store/politica-de-datos)
y los [Términos y condiciones](https://baqtime.store/terminos). Es para uso interno del dueño.

> ⚠️ **Este repositorio es público.** No anotes aquí nombres, correos, teléfonos ni números de
> pedido de clientes. El registro de solicitudes va en una hoja privada (sección 6).

---

## 1. Canales

| Canal | Uso |
|---|---|
| **baqtime.store@gmail.com** | Canal oficial. Responde siempre por aquí: el correo enviado queda como constancia. |
| WhatsApp +57 313 4954478 | Apoyo. Si alguien pide algo sobre sus datos por WhatsApp, atiéndelo y pídele que lo confirme por correo. |

## 2. Tipos de solicitud y plazos

Los plazos son **días hábiles**: lunes a viernes, sin festivos de Colombia. Se cuentan desde el
día siguiente a recibir la solicitud.

| Solicitud | Ejemplo | Plazo para responder | Si no alcanzas |
|---|---|---|---|
| **Consulta de datos** (Ley 1581, art. 14) | "¿Qué datos míos tienen?", "¿Cuándo autoricé?" | **10 días hábiles** | Avisa el motivo antes de que venza y responde en máximo 5 días hábiles más |
| **Reclamo de datos** (Ley 1581, art. 15) | Corregir, actualizar o borrar datos; revocar la autorización | **15 días hábiles** | Avisa el motivo antes de que venza y responde en máximo 8 días hábiles más |
| **Baja de promociones** | "No quiero recibir más promociones" | Hazlo **el mismo día** | — |
| **Queja de consumo** (garantía, cambios) | Bolso con defecto, bordado distinto | **15 días hábiles** (Decreto 735 de 2013) | — |
| **Producto equivocado o dañado** | Llegó otro color, llegó roto | El cliente tiene 2 días hábiles para avisar; responde lo antes posible | — |

**Reglas del reclamo de datos (art. 15):**
- Si al reclamo le falta información, pídela **dentro de los 5 días hábiles** siguientes a recibirlo (plantilla 5.6).
  Si pasan **2 meses** sin respuesta del cliente, se entiende que desistió.
- Dentro de los **2 días hábiles** siguientes a recibir un reclamo completo, márcalo como
  **"reclamo en trámite"** en la hoja de registro y no uses esos datos para nada más hasta resolverlo.

## 3. Paso a paso

1. **Registra** la solicitud en la hoja (sección 6) con su fecha límite.
2. **Verifica que sea el titular.** La solicitud debe venir del mismo correo o teléfono del pedido.
   Si no, pide el número de pedido y un dato que coincida (ciudad, últimos dígitos del teléfono).
   **Nunca entregues datos a otra persona** sin una autorización o poder del titular.
3. **Envía el acuse de recibo** (plantilla 5.1).
4. **Haz lo que pidió** (sección 4).
5. **Responde con el resultado** (plantillas 5.2 a 5.5) y cierra la fila en la hoja.

## 4. Cómo hacerlo en el sistema

Todo esto se corre en **Supabase → SQL Editor**. Reemplaza los valores de ejemplo.
El correo se guarda en minúsculas; el teléfono, solo con dígitos.

### 4.1 Buscar los pedidos de un titular (consultas y prueba de autorización)

```sql
select order_number, created_at, status,
       customer_name, customer_phone, customer_email, customer_doc,
       ship_city, ship_address,
       data_consent_at, data_policy_version, marketing_consent
  from public.orders
 where customer_email = lower('correo@ejemplo.com')
    or customer_phone = '3001234567'
 order by created_at desc;
```

- `data_consent_at`: cuándo autorizó el tratamiento de datos.
- `data_policy_version`: qué versión de la política aceptó.

Los pedidos anteriores al 2026-10-07 no tienen esos datos, porque la casilla no existía.

### 4.2 Corregir o actualizar un dato

El **correo** se corrige desde el panel, en el detalle del pedido. Para los demás datos:

```sql
update public.orders
   set customer_phone = '3009876543'      -- o customer_name, ship_address, ship_city, customer_doc
 where order_number = 'BQ-XXXXX';
```

### 4.3 Baja de promociones

```sql
update public.orders
   set marketing_consent = false
 where customer_email = lower('correo@ejemplo.com')
    or customer_phone = '3001234567';
```

Bórralo además de cualquier lista de difusión de WhatsApp o de correo donde esté.

### 4.4 Borrar los datos (supresión o revocación)

Primero revisa el estado del pedido:

- **Pedido sin pagar o "No confirmado":** no hay venta que soportar. **Elimínalo desde el
  panel** (botón eliminar en el detalle del pedido).
- **Pedido pagado:** es el soporte de una venta y hay que conservarlo por obligaciones contables
  y tributarias. **No lo borres: anonimízalo.** Se borran los datos personales y se conservan
  los productos y los valores.

```sql
update public.orders
   set customer_name     = 'Titular suprimido',
       customer_phone    = '0',
       customer_email    = null,
       customer_doc      = 'SUPRIMIDO',
       ship_address      = 'Suprimida',
       marketing_consent = false
 where order_number = 'BQ-XXXXX';
```

En los dos casos, borra también:
- el correo con la copia del pedido en Gmail;
- el chat de WhatsApp, si el cliente lo pide.

En la respuesta (plantilla 5.4) explica qué se borró y qué se conserva por ley.

## 5. Plantillas de respuesta

Asunto sugerido: `Tu solicitud de datos personales — Baqtime`. Firma siempre: *Baqtime · baqtime.store@gmail.com*.

### 5.1 Acuse de recibo
> Hola, [nombre]. Recibimos tu solicitud del [fecha] sobre tus datos personales. Te responderemos a más
> tardar el [fecha límite]. Si necesitamos algo más para atenderla, te escribiremos por este medio.

### 5.2 Respuesta a una consulta
> Hola, [nombre]. Estos son los datos que tenemos asociados a tus pedidos: [lista de datos y números de pedido].
> Los usamos para gestionar y entregar tus pedidos, según nuestra Política de Tratamiento de Datos
> (baqtime.store/politica-de-datos). Autorizaste el tratamiento el [fecha de data_consent_at].
> [Sí / No] autorizaste recibir promociones.

### 5.3 Corrección o actualización hecha
> Hola, [nombre]. Ya actualizamos tu [dato] en nuestros registros. Si ves algo más por corregir, escríbenos.

### 5.4 Supresión hecha
> Hola, [nombre]. Eliminamos tus datos personales de nuestros registros. [Si aplica:] Conservamos los
> productos y los valores de tu compra del [fecha], sin tu nombre ni tus datos de contacto, porque la ley
> nos obliga a guardar el soporte de las ventas.

### 5.5 Baja de promociones
> Hola, [nombre]. Listo: no te enviaremos más promociones. Seguirás recibiendo solo los mensajes de tus
> pedidos.

### 5.6 Solicitud incompleta
> Hola, [nombre]. Para atender tu solicitud necesitamos [qué falta: número de pedido / confirmar desde el
> correo con que compraste / …]. Si en 2 meses no recibimos esta información, entenderemos que desististe
> de la solicitud.

### 5.7 Prórroga
> Hola, [nombre]. Necesitamos unos días más para responder tu solicitud porque [motivo]. Te responderemos a
> más tardar el [nueva fecha].

### 5.8 No es posible atenderla
> Hola, [nombre]. No podemos [lo pedido] porque [no pudimos verificar que eres el titular / la ley nos obliga
> a conservar esta información por …]. Si no estás de acuerdo, puedes acudir a la Superintendencia de
> Industria y Comercio (sic.gov.co).

## 6. Registro de solicitudes

Lleva una **hoja de cálculo privada** (Google Sheets, compartida solo contigo). **No la guardes en este
repositorio.** Columnas:

| Fecha de recibido | Canal | Titular | N.º de pedido | Tipo | Fecha límite | Estado | Fecha de respuesta | Qué se hizo |
|---|---|---|---|---|---|---|---|---|

- **Tipo:** consulta, reclamo, promociones o queja.
- **Estado:** recibido, en trámite, respondido o desistido.

## 7. Incidentes de seguridad

Un incidente es cualquier acceso no autorizado a los datos de los clientes, o su pérdida o robo.
Ejemplos: alguien entra a tu Gmail o a tu cuenta de Supabase, se filtra la clave `service_role`,
pierdes el celular con WhatsApp sin bloqueo.

1. **Contén el daño de inmediato:**
   - cambia las contraseñas de Gmail, Supabase, Cloudflare y GitHub;
   - rota las claves de Supabase (*Project Settings → API*) y de Resend, y actualízalas en Cloudflare
     (*Variables and Secrets*);
   - revisa quién es administrador del panel.
2. **Evalúa:** qué datos quedaron expuestos, de cuántos clientes y desde cuándo.
3. **Reporta a la SIC dentro de los 15 días hábiles** siguientes a enterarte (sic.gov.co → Protección de
   datos personales). La obligación existe aunque Baqtime no esté inscrita en el RNBD.
4. **Avisa a los clientes afectados** si corren algún riesgo (por ejemplo, de suplantación).
5. **Anota todo** en la hoja: qué pasó, cuándo te enteraste, qué hiciste y cuándo reportaste.

## 8. Revisión anual

Cada año, o antes si cambia algo de fondo:
- **Política y términos:** revisa que sigan siendo ciertos (proveedores, plazos, medios de pago).
- **Si cambia la política de datos:** sube `POLITICA_DATOS_VERSION` en `src/lib/legal.ts`.
- **Si empiezas a usar píxeles o analítica:** antes hay que poner un banner de cookies (ver `docs/plan-politicas-legales.md`).
