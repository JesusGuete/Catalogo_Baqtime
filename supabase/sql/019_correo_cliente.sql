-- 019_correo_cliente.sql
-- Supabase backend — el correo del cliente y el rastro del correo de confirmación.
--
-- Run after 018_photo_crop_boxes.sql. Idempotent: `add column if not exists`, cada
-- constraint se borra antes de crearse, `create or replace function`. Volver a pegar este
-- archivo nunca debe dar error.
--
-- QUÉ AGREGA: el formulario de compra pide ahora un correo OBLIGATORIO (decisión del dueño,
-- 2026-10-06) y al guardar el pedido se le manda al cliente un resumen. Acá se guarda:
--   * customer_email — a dónde se mandó.
--   * email_sent_at  — cuándo salió el último correo que el proveedor aceptó.
--   * email_error    — por qué falló el ÚLTIMO intento, o null si salió bien.
-- Con esas dos últimas el panel puede decir "enviado" o "no enviado" y ofrecer reenviarlo.
-- El envío en sí lo hace el servidor de la tienda (src/lib/correo.ts), no la base.

-- ============================================================================
-- Columnas
-- ============================================================================

alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists email_sent_at  timestamptz;
alter table public.orders add column if not exists email_error    text;

-- ADMITE NULL, Y NO ES UN DESCUIDO: los pedidos anteriores a este archivo no tienen correo.
-- Un `not null` —incluso como NOT VALID— no sirve: un CHECK se evalúa en CADA update de la
-- fila, así que el pedido viejo dejaría de poder cambiar de estado. La obligatoriedad vive
-- en create_order(), que es el único camino por el que entra un pedido nuevo.
--
-- Lo que sí se impone para todas las filas es la FORMA: si hay correo, tiene que parecer
-- uno. Es la misma regla que valida el formulario (src/lib/shipping-validation.js), sin
-- pretender más que eso — la única prueba real de que un correo existe es que llegue.
alter table public.orders drop constraint if exists orders_customer_email_formato;
alter table public.orders add constraint orders_customer_email_formato check (
  customer_email is null
  or (customer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
      and length(customer_email) <= 254)
);

-- ============================================================================
-- El panel puede corregir el correo
-- ============================================================================
-- Es el caso de "no me llegó": el cliente escribió mal su correo, el dueño lo corrige en el
-- panel y lo reenvía. Se SUMA a las cuatro columnas que 010_orders.sql concede; las demás
-- siguen bloqueadas para un PATCH directo.
--
-- OJO AL ORDEN: 010 hace `revoke update on table public.orders` antes de conceder sus
-- cuatro columnas. Si alguna vez se vuelve a correr 010, hay que volver a correr este
-- archivo después, o el panel deja de poder corregir el correo (42501).
--
-- email_sent_at y email_error NO se conceden: los escribe solo el servidor, con
-- registrar_correo_pedido() de abajo. Que el panel pudiera marcar un correo como enviado
-- sin enviarlo sería un rastro que miente.
grant update (customer_email) on table public.orders to authenticated;

-- ============================================================================
-- create_order(jsonb, jsonb) — ahora con correo, y obligatorio
-- ============================================================================
-- Igual que en 010 salvo por el correo. Sigue sin calcular un solo precio.

create or replace function public.create_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_number text; v_token text; v_email text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order: el pedido no tiene items' using errcode = '22023';
  end if;

  -- Normalizado acá y no solo en el endpoint: dos pedidos del mismo cliente tienen que
  -- guardar el mismo texto, se escriba como se escriba.
  v_email := nullif(lower(btrim(coalesce(p_order->>'customer_email', ''))), '');
  if v_email is null then
    raise exception 'create_order: falta el correo del cliente' using errcode = '22023';
  end if;

  insert into public.orders (
    customer_name, customer_phone, customer_email, customer_doc,
    ship_city, ship_address, subtotal, shipping_cost, total
  ) values (
    p_order->>'customer_name',
    p_order->>'customer_phone',
    v_email,
    -- '' y '   ' entran como NULL: el CHECK del documento mira `is not null`, y un string
    -- vacío lo satisfaría sin que nadie haya escrito un documento.
    nullif(btrim(coalesce(p_order->>'customer_doc', '')), ''),
    p_order->>'ship_city',
    p_order->>'ship_address',
    (p_order->>'subtotal')::integer,
    (p_order->>'shipping_cost')::integer,
    (p_order->>'total')::integer
  )
  returning id, order_number, public_token into v_id, v_number, v_token;

  insert into public.order_items (
    order_id, product_id, product_name, category_key, category_label,
    color, variant, initials, initials_color,
    unit_price, extra_price, quantity, line_total
  )
  select v_id,
         i->>'product_id',   i->>'product_name', i->>'category_key', i->>'category_label',
         i->>'color',        i->>'variant',      i->>'initials',     i->>'initials_color',
         (i->>'unit_price')::integer,
         coalesce((i->>'extra_price')::integer, 0),
         coalesce((i->>'quantity')::integer, 1),
         (i->>'line_total')::integer
    from jsonb_array_elements(p_items) as i;

  insert into public.order_status_history (order_id, status, note, created_by)
  values (v_id, 'pendiente_pago', 'Pedido creado desde la tienda', null);

  -- `id` se devuelve ahora porque el endpoint lo necesita para anotar el resultado del
  -- correo. No llega al navegador: el endpoint responde solo número, token y total.
  return jsonb_build_object('id', v_id, 'order_number', v_number, 'public_token', v_token);
end $$;

revoke all    on function public.create_order(jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.create_order(jsonb, jsonb) to service_role;

-- ============================================================================
-- registrar_correo_pedido(uuid, text) — el rastro del envío
-- ============================================================================
-- p_error null  → el proveedor aceptó el correo: se marca la hora y se limpia el error.
-- p_error texto → falló: se guarda el motivo y email_sent_at NO se toca. Si un reenvío
--                 falla después de un envío bueno, el panel muestra el error (es lo último
--                 que pasó) pero la fecha del envío anterior sigue ahí, que también es cierta.
--
-- Solo service_role: la llama el servidor de la tienda después de hablar con el proveedor.

create or replace function public.registrar_correo_pedido(p_order_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error is null then
    update public.orders
       set email_sent_at = now(), email_error = null
     where id = p_order_id;
  else
    -- Recortado: es un mensaje para el dueño, no un volcado de la respuesta del proveedor.
    update public.orders
       set email_error = left(p_error, 500)
     where id = p_order_id;
  end if;
end $$;

revoke all    on function public.registrar_correo_pedido(uuid, text) from public, anon, authenticated;
grant  execute on function public.registrar_correo_pedido(uuid, text) to service_role;

-- ============================================================================
-- Lo que NO cambia
-- ============================================================================
-- pedido_publico() (011) no devuelve el correo, a propósito: la página de seguimiento se
-- abre con el enlace o con el número de pedido, y ninguno de los dos debe bastar para
-- conocer el correo de un cliente. Mismo criterio que el documento y la dirección.
