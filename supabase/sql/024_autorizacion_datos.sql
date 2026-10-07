-- 024_autorizacion_datos.sql
-- Supabase backend — prueba de la autorización de datos personales en cada pedido.
--
-- Run after 023_recordatorio_pago.sql y ANTES DE PUBLICAR el código con la casilla de
-- autorización en el checkout. Idempotent: `add column if not exists`,
-- `create or replace function`. Volver a pegar este archivo nunca debe dar error.
--
-- POR QUÉ EXISTE: la Ley 1581 de 2012 prohíbe tratar datos sin autorización del titular, y
-- el Decreto 1377 de 2013 (art. 8) obliga a conservar la PRUEBA de esa autorización. El
-- checkout ahora pide marcar una casilla; esto guarda cuándo se marcó y qué versión de
-- /politica-de-datos estaba publicada (POLITICA_DATOS_VERSION en src/lib/legal.ts).
--
-- POR QUÉ NO SE EXIGE ACÁ (a diferencia del correo en 020): las columnas quedan NULL para
-- los pedidos viejos, que nunca vieron la casilla, y create_order() no rechaza un pedido sin
-- autorización. Así este archivo se puede correr sin romper la tienda en vivo — ni la de
-- Bagelle, si sigue compartiendo este proyecto — y la exigencia la hace el endpoint
-- (src/pages/api/pedidos.ts), que es el único que llama a create_order().
--
-- Si se publica el código ANTES de correr esto, los pedidos se crean igual (create_order
-- ignora las llaves que no conoce), pero sin la prueba guardada. Por eso va primero.

alter table public.orders add column if not exists data_consent_at     timestamptz;
alter table public.orders add column if not exists data_policy_version text;
-- Promociones: autorización APARTE y opcional. La política de datos dice que solo se
-- mandan novedades a quien la marcó; false por defecto, también para los pedidos viejos.
alter table public.orders add column if not exists marketing_consent   boolean not null default false;

-- ============================================================================
-- create_order(jsonb, jsonb) — ahora guarda la autorización
-- ============================================================================
-- Igual a create_order() de 020 salvo por las tres columnas nuevas.
--
-- La hora la pone la base (now()) y no el navegador: el reloj del cliente puede estar mal
-- o ser cualquier cosa en un POST armado a mano.

create or replace function public.create_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_number text; v_token text; v_email text; v_consiente boolean;
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

  -- Comparación de texto y no un cast a boolean: un valor raro no hace fallar el pedido,
  -- simplemente no cuenta como autorización.
  v_consiente := coalesce(p_order->>'acepta_datos' = 'true', false);

  insert into public.orders (
    customer_name, customer_phone, customer_email, customer_doc,
    ship_city, ship_address, subtotal, shipping_cost, total,
    data_consent_at, data_policy_version, marketing_consent
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
    (p_order->>'total')::integer,
    case when v_consiente then now() end,
    case when v_consiente then nullif(btrim(coalesce(p_order->>'politica_version', '')), '') end,
    -- Las promociones cuelgan de la autorización general: sin ella, no hay base para nada más.
    v_consiente and coalesce(p_order->>'acepta_promociones' = 'true', false)
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
