-- 020_correo_obligatorio.sql
-- Supabase backend — el correo del cliente pasa a ser obligatorio también en la base.
--
-- Run after 019_correo_cliente.sql Y DESPUÉS DE PUBLICAR el código que manda el correo
-- (la tienda con el campo "Correo electrónico" en el checkout). Idempotent.
--
-- POR QUÉ ES UN ARCHIVO APARTE: 019 se corre antes de publicar, y en ese intervalo la
-- tienda en vivo todavía llama a create_order() sin correo. Si 019 lo exigiera, todos los
-- pedidos fallarían hasta el deploy. Este archivo cierra esa puerta cuando ya no hay
-- código viejo llamando.
--
-- ATENCIÓN SI OTRA TIENDA COMPARTE ESTE PROYECTO DE SUPABASE (Bagelle, mientras use el de
-- Baqtime prestado): su checkout también tiene que mandar el correo antes de correr esto,
-- o sus pedidos empiezan a fallar.
--
-- Igual a create_order() de 019 salvo por la comprobación del correo.

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
  --
  v_email := nullif(lower(btrim(coalesce(p_order->>'customer_email', ''))), '');
  -- Desde acá el correo es obligatorio también en la base: un POST armado a mano que se
  -- saltee validateShipping() no puede crear un pedido sin correo.
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
